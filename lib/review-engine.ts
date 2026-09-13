// lib/review-engine.ts -- shared review logic, called directly (no HTTP) from any route
import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "inbox-review-panel-prompt.md"), "utf-8");
}

function loadLabPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "lab-assistant-prompt.md"), "utf-8");
}

async function runLabAssistant(anthropic: Anthropic, item: any, participationPath: any) {
  const labPrompt = loadLabPrompt();
  const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\n${participationPath ? `\nPARTICIPATION PATH FROM REVIEW PANEL (this idea was judged too big to build solo):\n${JSON.stringify(participationPath)}` : "\nNo participation path was flagged -- this idea was judged realistically solo/small-team buildable."}`;

  const message = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: labPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = message.content.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("No text content returned from Claude for lab assistant");
  return extractJson((textBlock as any).text);
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

export async function runReviewAction(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  params: { id: string; action: string; answers?: any; reasoning?: string }
): Promise<{ success: boolean; result?: any; error?: string; status?: number }> {
  const { id, action, answers, reasoning } = params;
  const systemPrompt = loadPrompt();

  const { data: item, error: fetchError } = await supabase.from("items").select("*").eq("id", id).single();
  if (fetchError || !item) return { success: false, error: "item not found", status: 404 };

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
        try {
          update.build_recommendation = await runLabAssistant(anthropic, item, result.participation_path || null);
        } catch (labErr: any) {
          console.error("Lab assistant failed:", labErr);
          update.build_recommendation = { debug_error: labErr.message ?? String(labErr) };
        }
      }
      if (result.participation_path) update.participation_path = result.participation_path;

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) return { success: false, error: updateError.message, status: 500 };

      return { success: true, result };
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
        try {
          update.build_recommendation = await runLabAssistant(anthropic, item, result.participation_path || null);
        } catch (labErr: any) {
          console.error("Lab assistant failed:", labErr);
          update.build_recommendation = { debug_error: labErr.message ?? String(labErr) };
        }
      }
      if (result.participation_path) update.participation_path = result.participation_path;

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) return { success: false, error: updateError.message, status: 500 };

      return { success: true, result };
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

      try {
        update.build_recommendation = await runLabAssistant(anthropic, item, item.participation_path || null);
      } catch (labErr: any) {
        console.error("Lab assistant failed:", labErr);
        update.build_recommendation = { debug_error: labErr.message ?? String(labErr) };
      }

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) return { success: false, error: updateError.message, status: 500 };

      return { success: true, result };
    }

    return { success: false, error: "unknown action", status: 400 };
  } catch (err: any) {
    console.error("Review panel error:", err);
    return { success: false, error: err.message ?? String(err), status: 500 };
  }
}
