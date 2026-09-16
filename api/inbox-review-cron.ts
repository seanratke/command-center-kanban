// api/inbox-review-cron.ts -- daily, delayed automatic version of the Task Board's
// manual "Run panel review" button. Only reviews items that have sat untouched in
// Inbox for at least DELAY_HOURS, so there's still a window to curate (add a note,
// kill it, or run it manually sooner) before it fires automatically.
// maxDuration is set in vercel.json's functions block, matching run-opportunity-engine.ts.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { runReviewAction } from "../lib/review-engine";

const MAX_ITEMS_PER_RUN = 10;
const DELAY_HOURS = 4;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let runId: string | null = null;
  try {
    const { data: runRow } = await supabase
      .from("engine_runs")
      .insert({ engine: "inbox_review", status: "running", current_step: "Starting" })
      .select("id")
      .single();
    runId = runRow?.id || null;
  } catch (runErr) {
    console.error("Failed to insert engine_runs row:", runErr);
  }

  async function setStep(step: string) {
    if (!runId) return;
    await supabase.from("engine_runs").update({ current_step: step }).eq("id", runId);
  }

  try {
    await setStep("Finding eligible inbox items");

    const cutoff = new Date(Date.now() - DELAY_HOURS * 60 * 60 * 1000).toISOString();

    // Only fresh, untouched items -- stage is still inbox AND review_status has
    // never been set. Anything with needs_input or a rejection is left alone;
    // those already went through the panel once and need Sean's input, not
    // another automatic pass.
    const { data: candidates, error: fetchError } = await supabase
      .from("items")
      .select("id, title, created_at")
      .eq("stage", "inbox")
      .is("review_status", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MAX_ITEMS_PER_RUN);

    if (fetchError) throw new Error("Failed to fetch candidates: " + fetchError.message);

    const results: any[] = [];

    for (const item of candidates || []) {
      try {
        await setStep(`Reviewing: ${item.title}`);

        // Guard against double-processing: someone may have clicked "Run panel
        // review" manually on this item since we fetched the batch above.
        const { data: fresh, error: refetchError } = await supabase
          .from("items")
          .select("review_status")
          .eq("id", item.id)
          .single();
        if (refetchError) throw new Error("Re-check failed: " + refetchError.message);
        if (fresh.review_status !== null) {
          results.push({ id: item.id, title: item.title, skipped: "already reviewed since batch was fetched" });
          continue;
        }

        const outcome = await runReviewAction(supabase, anthropic, { id: item.id, action: "review" });
        if (!outcome.success) throw new Error(outcome.error || "unknown review-panel error");

        results.push({ id: item.id, title: item.title, status: outcome.result?.status });
      } catch (itemErr: any) {
        console.error(`Inbox review failed for ${item.title} (${item.id}):`, itemErr);
        results.push({ id: item.id, title: item.title, error: itemErr.message ?? String(itemErr) });
      }
    }

    if (runId) {
      await supabase.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    }

    return res.status(200).json({ success: true, reviewed: results.length, results });
  } catch (err: any) {
    console.error("Inbox review cron failed:", err);
    if (runId) {
      try {
        await supabase.from("engine_runs").update({
          status: "failed",
          error_message: err.message ?? String(err),
          finished_at: new Date().toISOString(),
        }).eq("id", runId);
      } catch (updateErr) {
        console.error("Failed to record engine_runs failure:", updateErr);
      }
    }
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
