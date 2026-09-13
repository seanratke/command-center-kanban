// api/items-add.ts
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { runReviewAction } from "../lib/review-engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("items")
    .insert({
      title: title.trim(),
      note: "",
      tags: [],
      heat: 0,
      stage: "inbox",
      kill_reason: null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const outcome = await runReviewAction(supabase, anthropic, { id: data.id, action: "review" });
  if (!outcome.success) {
    console.error("Review failed for new item:", outcome.error);
  }

  const { data: finalItem } = await supabase.from("items").select("*").eq("id", data.id).single();

  return res.status(200).json({ success: true, item: finalItem || data, reviewSucceeded: outcome.success });
}
