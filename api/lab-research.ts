// api/lab-research.ts
export const maxDuration = 180;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "lab-research-prompt.md"), "utf-8");
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

  const { data: item, error: fetchError } = await supabase.from("items").select("*").eq("id", id).single();
  if (fetchError || !item) return res.status(404).json({ error: "item not found" });

  const ticket = item.build_recommendation?.research_ticket;
  if (!ticket) return res.status(400).json({ error: "no research ticket found -- Lab Assistant has not run on this item yet" });

  try {
    const systemPrompt = loadPrompt();
    const userContent = `Title: ${item.title}\nWhat to build first: ${item.build_recommendation?.what_to_build_first || ""}\n\nRESEARCH TICKET FROM THE LAB ASSISTANT:\n${ticket}`;

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    });

    const textBlocks = message.content.filter((b: any) => b.type === "text");
    if (textBlocks.length === 0) throw new Error("No text content returned from Claude");
    const finalText = (textBlocks[textBlocks.length - 1] as any).text;
    const result = extractJson(finalText);

    const { error: updateError } = await supabase
      .from("items")
      .update({ desk_research: result })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error("Lab research error:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
