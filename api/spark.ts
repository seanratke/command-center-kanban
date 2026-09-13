// api/spark.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "spark-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: op, error: fetchError } = await supabase.from("opportunities").select("*").eq("id", id).single();
  if (fetchError || !op) return res.status(404).json({ error: "opportunity not found" });

  try {
    const systemPrompt = loadPrompt();
    const userContent = `Title: ${op.title}\nKey summary: ${op.key_summary || ""}\nThe gap: ${op.the_gap || ""}\nSean fit: ${op.sean_fit || ""}\nResearch grounding: ${op.research_grounding || ""}`;

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find((b: any) => b.type === "text");
    if (!textBlock) throw new Error("No text content returned from Claude");
    const result = extractJson((textBlock as any).text);

    const { error: updateError } = await supabase
      .from("opportunities")
      .update({ spark_ideas: result.sparks || [] })
      .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    return res.status(200).json({ success: true, sparks: result.sparks || [] });
  } catch (err: any) {
    console.error("Spark error:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
