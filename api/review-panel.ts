// api/review-panel.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "inbox-review-panel-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

async function runPanel(anthropic: Anthropic, systemPrompt: string, userContent: string) {
  const message = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = message.content.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("No text content returned from Claude");
  return extractJson((textBlock as any).text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { id, action, answers, reasoning } = req.body || {};
  if (!id || !action) return res.status(400).json({ error: "id and action are required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = loadPrompt();

  const { data: item, error: fetchError } = await supabase.from("items").select("*").eq("id", id).single();
  if (fetchError || !item) return res.status(404).json({ error: "item not found" });

  try {
    if (action === "review") {
      const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\nTags: ${(item.tags || []).join(", ") || "(none)"}`;
      const result = await runPanel(anthropic, systemPrompt, userContent);

      const update: any = {
        review_status: result.status,
        review_transcript: result.transcript || null,
        reviewed_at: new Date().toISOString(),
      };
      if (result.status === "needs_input") update.review_questions = result.questions || null;
      if (result.status === "rejected") update.rejection_report = result.rejection_report || null;
      if (result.status === "approved") {
        update.stage = "lab";
        update.note = (item.note || "") + `\n\nLab focus: ${result.lab_focus || ""}`;
      }
      if (result.participation_path) update.participation_path = result.participation_path;

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) throw new Error(updateError.message);

      return res.status(200).json({ success: true, result });
    }

    if (action === "answer") {
      const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\nTags: ${(item.tags || []).join(", ") || "(none)"}\n\nEarlier questions:\n${JSON.stringify(item.review_questions)}\n\nSean's answers:\n${JSON.stringify(answers)}\n\nUse these answers to make a final decision now. Do not ask further questions unless truly necessary.`;
      const result = await runPanel(anthropic, systemPrompt, userContent);

      const update: any = {
        review_status: result.status,
        review_transcript: result.transcript || null,
        review_answers: answers,
        reviewed_at: new Date().toISOString(),
      };
      if (result.status === "rejected") update.rejection_report = result.rejection_report || null;
      if (result.status === "approved") {
        update.stage = "lab";
        update.note = (item.note || "") + `\n\nLab focus: ${result.lab_focus || ""}`;
      }
      if (result.participation_path) update.participation_path = result.participation_path;

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) throw new Error(updateError.message);

      return res.status(200).json({ success: true, result });
    }

    if (action === "override") {
      const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\n\nYour panel rejected this idea. Rejection report:\n${JSON.stringify(item.rejection_report)}\n\nSean wants to override this rejection. His reasoning:\n${reasoning}\n\nAs the Skeptic, push back once, directly, on Sean's reasoning -- a real challenge, not a rubber stamp. Then, regardless of the outcome of that pushback, comply: Sean has final authority. Return status "approved" with a lab_focus, and include the Skeptic's pushback as an extra transcript entry with role "Skeptic (pushback)".`;
      const result = await runPanel(anthropic, systemPrompt, userContent);

      const update: any = {
        review_status: "overridden",
        review_transcript: result.transcript || null,
        override_used: true,
        stage: "lab",
        note: (item.note || "") + `\n\nOverride reasoning: ${reasoning}\n\nLab focus: ${result.lab_focus || ""}`,
        reviewed_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) throw new Error(updateError.message);

      return res.status(200).json({ success: true, result });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (err: any) {
    console.error("Review panel error:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
