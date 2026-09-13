// api/validating-assistant.ts
export const maxDuration = 60;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "validating-assistant-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const { id, findings } = req.body || {};
  if (!id || !findings || !findings.trim()) return res.status(400).json({ error: "id and findings are required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: item, error: fetchError } = await supabase.from("items").select("*").eq("id", id).single();
  if (fetchError || !item) return res.status(404).json({ error: "item not found" });

  try {
    const systemPrompt = loadPrompt();
    const userContent = `Title: ${item.title}\nNote (includes lab focus): ${item.note || "(none)"}\nBuild recommendation given: ${JSON.stringify(item.build_recommendation) || "(none)"}\n\nSean's findings from doing the Lab work:\n${findings}`;

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
      .from("items")
      .update({ validation_findings: findings, validation_verdict: result })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error("Validating assistant error:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
