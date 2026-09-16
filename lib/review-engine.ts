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

const STOPWORDS = new Set([
  "this", "that", "with", "from", "into", "your", "about", "have", "will",
  "which", "their", "there", "would", "could", "should", "been", "being",
  "some", "more", "than", "what", "when", "where", "does", "just", "like",
]);

function keywordsFor(item: { title: string; tags?: string[] | null }): string[] {
  const words = (item.title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const tags = (item.tags || []).map((t) => t.toLowerCase()).filter((t) => t.length > 2);
  return Array.from(new Set([...words, ...tags])).slice(0, 8);
}

async function findRelatedAcrossSources(supabase: SupabaseClient, item: { title: string; tags?: string[] | null }): Promise<string> {
  const keywords = keywordsFor(item);
  if (keywords.length === 0) return "POSSIBLY RELATED ENTRIES FROM OTHER IDEA SOURCES: none found.";

  const orFilter = keywords.map((w) => `title.ilike.%${w}%`).join(",");

  const [opportunities, seedIdeas, inventorIdeas, synthesisIdeas] = await Promise.all([
    supabase.from("opportunities").select("title,key_summary").or(orFilter).limit(5),
    supabase.from("seed_ideas").select("title,description").or(orFilter).limit(5),
    supabase.from("inventor_ideas").select("title,concept").or(orFilter).limit(5),
    supabase.from("synthesis_ideas").select("title,concept").or(orFilter).limit(5),
  ]);

  const sections: string[] = [];
  const fmt = (label: string, rows: any[] | null | undefined, fields: [string, string]) => {
    if (!rows || rows.length === 0) return;
    sections.push(
      `${label}:\n` +
        rows.map((r) => `- "${r[fields[0]]}" -- ${(r[fields[1]] || "").slice(0, 200)}`).join("\n")
    );
  };
  fmt("Opportunities (keyword match, unverified)", opportunities.data, ["title", "key_summary"]);
  fmt("Seed-idea watchlist (keyword match, unverified)", seedIdeas.data, ["title", "description"]);
  fmt("Inventor ideas (keyword match, unverified)", inventorIdeas.data, ["title", "concept"]);
  fmt("Synthesis ideas (keyword match, unverified)", synthesisIdeas.data, ["title", "concept"]);

  if (sections.length === 0) return "POSSIBLY RELATED ENTRIES FROM OTHER IDEA SOURCES: none found.";
  return "POSSIBLY RELATED ENTRIES FROM OTHER IDEA SOURCES (keyword match on title -- verify these are actually the same theme before treating as convergence):\n\n" + sections.join("\n\n");
}

async function runLabAssistant(anthropic: Anthropic, item: any, participationPath: any) {
  const labPrompt = loadLabPrompt();
  const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\n${participationPath ? `\nPARTICIPATION PATH FROM REVIEW PANEL (this idea was judged too big to build solo):\n${JSON.stringify(participationPath)}` : "\nNo participation path was flagged -- this idea was judged realistically solo/small-team buildable."}`;

  const message = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: [{ type: "text", text: labPrompt, cache_control: { type: "ephemeral" } }] as any,
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
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }] as any,
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
      const relatedContext = await findRelatedAcrossSources(supabase, item);
      const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\nTags: ${(item.tags || []).join(", ") || "(none)"}\n\n${relatedContext}`;
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
          update.output_type = update.build_recommendation.output_type || null;
        } catch (labErr: any) {
          console.error("Lab assistant failed:", labErr);
          update.build_recommendation = { debug_error: labErr.message ?? String(labErr) };
        }
      }
      if (result.participation_path) update.participation_path = result.participation_path;
      if (result.status === "approved" || result.status === "rejected") {
        update.priority_flag = result.priority_flag || null;
        update.priority_tier = result.priority_tier || null;
        update.priority_reasoning = result.priority_reasoning || null;
        update.next_move = result.next_move || null;
      }

      const { error: updateError } = await supabase.from("items").update(update).eq("id", id);
      if (updateError) return { success: false, error: updateError.message, status: 500 };

      return { success: true, result };
    }

    if (action === "answer") {
      const relatedContext = await findRelatedAcrossSources(supabase, item);
      const userContent = `Title: ${item.title}\nNote: ${item.note || "(none)"}\nTags: ${(item.tags || []).join(", ") || "(none)"}\n\nEarlier questions:\n${JSON.stringify(item.review_questions)}\n\nSean's answers:\n${JSON.stringify(answers)}\n\nUse these answers to make a final decision now. Do not ask further questions unless truly necessary.\n\n${relatedContext}`;
      const result = await runPanel(anthropic, systemPrompt, userContent);

      const update: any = {
        review_status: result.status,
        review_transcript: result.transcript || null,
        review_answers: answers,
        reviewed_at: new Date().toISOString(),
      };
      if (result.status === "rejected") update.rejection_report = result.rejection_report || null;
      if (result.status === "approved" || result.status === "rejected") {
        update.priority_flag = result.priority_flag || null;
        update.priority_tier = result.priority_tier || null;
        update.priority_reasoning = result.priority_reasoning || null;
        update.next_move = result.next_move || null;
      }
      if (result.status === "approved") {
        update.stage = "lab";
        update.note = (item.note || "") + `\n\nLab focus: ${result.lab_focus || ""}`;
        try {
          update.build_recommendation = await runLabAssistant(anthropic, item, result.participation_path || null);
          update.output_type = update.build_recommendation.output_type || null;
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
        update.output_type = update.build_recommendation.output_type || null;
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
