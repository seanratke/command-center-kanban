// api/synthesis.ts
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "synthesis-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
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
      .insert({ engine: "synthesis", status: "running", current_step: "Starting" })
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
      .limit(15);

    const { data: inventorIdeas } = await supabase
      .from("inventor_ideas")
      .select("title, concept")
      .gte("created_at", weekAgo)
      .limit(15);

    const { data: seedIdeas } = await supabase
      .from("seed_ideas")
      .select("title, description")
      .eq("status", "active")
      .limit(15);

    const opBlock = (opportunities || []).map((o: any) => `[OPPORTUNITY, ${o.category}] ${o.title} -- ${o.key_summary || o.the_gap || ""}`).join("\n");
    const rejBlock = (rejectedItems || []).map((r: any) => `[REJECTED] ${r.title} -- reason: ${r.rejection_report?.main_reason || "unknown"}`).join("\n");
    const invBlock = (inventorIdeas || []).map((i: any) => `[INVENTOR IDEA] ${i.title} -- ${i.concept}`).join("\n");
    const seedBlock = (seedIdeas || []).map((s: any) => `[SEED-IDEA WATCHLIST] ${s.title} -- ${s.description || ""}`).join("\n");

    const materialBlock = `${opBlock}\n${rejBlock}\n${invBlock}\n${seedBlock}`;

    await setStep("Finding combinations and overlaps");

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }] as any,
      messages: [{ role: "user", content: `THIS WEEK'S FULL MATERIAL:\n${materialBlock || "(none found)"}` }],
    });

    const textBlock = message.content.find((b: any) => b.type === "text");
    if (!textBlock) throw new Error("No text content returned from Claude");
    const result = extractJson((textBlock as any).text);

    await setStep("Saving results");

    let saved = 0;
    for (const idea of result.ideas || []) {
      await supabase.from("synthesis_ideas").insert({
        title: idea.title,
        concept: idea.concept,
        mechanism: idea.mechanism,
        source_items: idea.source_items,
        idea_type: idea.idea_type === 'overlap' ? 'overlap' : 'combination',
        output_type: idea.output_type || null,
        priority_flag: idea.priority_flag || null,
        priority_reasoning: idea.priority_reasoning || null,
        next_move: idea.next_move || null,
      });
      saved++;
    }

    if (runId) {
      await supabase.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    }

    return res.status(200).json({ success: true, ideasGenerated: saved });
  } catch (err: any) {
    console.error("Synthesis run failed:", err);
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
