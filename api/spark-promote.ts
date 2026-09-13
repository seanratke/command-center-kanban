// api/spark-promote.ts
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { runReviewAction } from "../lib/review-engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const { id, index } = req.body || {};
  if (!id || index === undefined) return res.status(400).json({ error: "id and index are required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: op, error: fetchError } = await supabase
    .from("opportunities")
    .select("spark_ideas")
    .eq("id", id)
    .single();
  if (fetchError || !op || !op.spark_ideas || !op.spark_ideas[index]) {
    return res.status(404).json({ error: "spark not found" });
  }

  const spark = op.spark_ideas[index];
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("items").insert({
    title: spark.title,
    note: `${spark.angle}\n\nWhy different: ${spark.why_different}`,
    tags: ["spark"],
    heat: 0,
    stage: "inbox",
    kill_reason: null,
    created_at: now,
    updated_at: now,
  });
  if (insertError) return res.status(500).json({ success: false, error: insertError.message });

  const { data: newItem } = await supabase.from("items").select("id").eq("title", spark.title).order("created_at", { ascending: false }).limit(1).single();
  if (newItem) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const outcome = await runReviewAction(supabase, anthropic, { id: newItem.id, action: "review" });
    if (!outcome.success) console.error("Auto-review failed:", outcome.error);
  }

  return res.status(200).json({ success: true });
}
