// api/inventor-pool.ts
export const maxDuration = 300;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "inventor-pool-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

async function runInventor(anthropic: Anthropic, systemPrompt: string, inventor: any, materialBlock: string) {
  const userContent = `YOUR PERSONA:\nName: ${inventor.name}\nDomain: ${inventor.domain}\n${inventor.persona}\n\nTHIS WEEK'S RAW MATERIAL:\n${materialBlock}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }] as any,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = message.content.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("No text content returned from Claude");
  return extractJson((textBlock as any).text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let runId: string | null = null;
  try {
    const { data: runRow } = await supabase
      .from("engine_runs")
      .insert({ engine: "inventor_pool", status: "running", current_step: "Starting" })
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
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = loadPrompt();

    await setStep("Gathering this week's material");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: opportunities } = await supabase
      .from("opportunities")
      .select("title, key_summary, the_gap, category")
      .gte("report_date", weekAgo.slice(0, 10))
      .limit(40);

    const { data: rejectedItems } = await supabase
      .from("items")
      .select("title, rejection_report")
      .eq("review_status", "rejected")
      .gte("reviewed_at", weekAgo)
      .limit(20);

    const opBlock = (opportunities || [])
      .map((o: any) => `[${o.category}] ${o.title} -- ${o.key_summary || o.the_gap || ""}`)
      .join("\n");
    const rejBlock = (rejectedItems || [])
      .map((r: any) => `REJECTED: ${r.title} -- reason: ${r.rejection_report?.main_reason || "unknown"}; reconsider if: ${r.rejection_report?.reconsider_if || "unknown"}`)
      .join("\n");

    const { data: seedIdeas } = await supabase
      .from("seed_ideas")
      .select("title, description")
      .eq("status", "active")
      .limit(10);
    const { data: synthesisIdeas } = await supabase
      .from("synthesis_ideas")
      .select("title, concept")
      .gte("created_at", weekAgo)
      .limit(10);
    const { data: otherInventorIdeas } = await supabase
      .from("inventor_ideas")
      .select("title, concept")
      .gte("created_at", weekAgo)
      .limit(10);

    const seedBlock = (seedIdeas || []).map((s: any) => `[SEED-IDEA WATCHLIST] ${s.title} -- ${s.description || ""}`).join("\n");
    const synthBlock = (synthesisIdeas || []).map((s: any) => `[SYNTHESIS IDEA] ${s.title} -- ${s.concept}`).join("\n");
    const otherInvBlock = (otherInventorIdeas || []).map((i: any) => `[INVENTOR IDEA] ${i.title} -- ${i.concept}`).join("\n");
    const otherSourcesDigest = `OTHER RECENT IDEAS FROM OTHER SOURCES (for the priority-flag convergence check -- not raw material to build from):\n${seedBlock || "(none)"}\n${synthBlock || "(none)"}\n${otherInvBlock || "(none)"}`;

    const materialBlock = `OPPORTUNITIES FROM THE PAST WEEK:\n${opBlock || "(none found)"}\n\nRECENTLY REJECTED IDEAS:\n${rejBlock || "(none found)"}\n\n${otherSourcesDigest}`;

    const { data: activeInventors } = await supabase
      .from("inventors")
      .select("*")
      .eq("status", "active")
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(2);

    if (!activeInventors || activeInventors.length === 0) {
      if (runId) {
        await supabase.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
      }
      return res.status(200).json({ success: true, message: "No active inventors found", ideasGenerated: 0 });
    }

    let totalIdeas = 0;
    const results: any[] = [];

    for (const inventor of activeInventors) {
      try {
        await setStep(`Running inventor: ${inventor.name}`);
        const result = await runInventor(anthropic, systemPrompt, inventor, materialBlock);

        const ideas = result.ideas || [];
        for (const idea of ideas) {
          await supabase.from("inventor_ideas").insert({
            inventor_id: inventor.id,
            title: idea.title,
            concept: idea.concept,
            mechanism: idea.mechanism,
            grey_area_note: idea.grey_area_note || null,
            source_context: materialBlock.slice(0, 2000),
            output_type: idea.output_type || null,
            priority_flag: idea.priority_flag || null,
            priority_reasoning: idea.priority_reasoning || null,
            next_move: idea.next_move || null,
          });
          totalIdeas++;
        }

        if (result.nomination && result.nomination.proposed_domain) {
          await supabase.from("inventor_nominations").insert({
            nominated_by: inventor.id,
            proposed_domain: result.nomination.proposed_domain,
            rationale: result.nomination.rationale,
          });
        }

        await supabase
          .from("inventors")
          .update({ last_run_at: new Date().toISOString(), times_run: (inventor.times_run || 0) + 1 })
          .eq("id", inventor.id);

        results.push({ inventor: inventor.name, ideas: ideas.length, nominated: !!result.nomination?.proposed_domain });
      } catch (inventorErr: any) {
        console.error(`Inventor ${inventor.name} failed:`, inventorErr);
        results.push({ inventor: inventor.name, error: inventorErr.message });
      }
    }

    if (runId) {
      await supabase.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    }

    return res.status(200).json({ success: true, ideasGenerated: totalIdeas, results });
  } catch (err: any) {
    console.error("Inventor pool run failed:", err);
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
