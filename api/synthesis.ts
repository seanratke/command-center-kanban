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

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = loadPrompt();

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

    const opBlock = (opportunities || []).map((o: any) => `[OPPORTUNITY, ${o.category}] ${o.title} -- ${o.key_summary || o.the_gap || ""}`).join("\n");
    const rejBlock = (rejectedItems || []).map((r: any) => `[REJECTED] ${r.title} -- reason: ${r.rejection_report?.main_reason || "unknown"}`).join("\n");
    const invBlock = (inventorIdeas || []).map((i: any) => `[INVENTOR IDEA] ${i.title} -- ${i.concept}`).join("\n");

    const materialBlock = `${opBlock}\n${rejBlock}\n${invBlock}`;

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: "user", content: `THIS WEEK'S FULL MATERIAL:\n${materialBlock || "(none found)"}` }],
    });

    const textBlock = message.content.find((b: any) => b.type === "text");
    if (!textBlock) throw new Error("No text content returned from Claude");
    const result = extractJson((textBlock as any).text);

    let saved = 0;
    for (const idea of result.ideas || []) {
      await supabase.from("synthesis_ideas").insert({
        title: idea.title,
        concept: idea.concept,
        mechanism: idea.mechanism,
        source_items: idea.source_items,
        idea_type: idea.idea_type === 'overlap' ? 'overlap' : 'combination',
      });
      saved++;
    }

    return res.status(200).json({ success: true, ideasGenerated: saved });
  } catch (err: any) {
    console.error("Synthesis run failed:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
