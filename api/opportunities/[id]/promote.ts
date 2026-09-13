// api/opportunities/[id]/promote.ts
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { runReviewAction } from "../../../lib/review-engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: opportunity, error: fetchError } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !opportunity) {
    return res.status(404).json({ success: false, error: "Opportunity not found" });
  }

  const noteParts = [
    opportunity.key_summary ? `Summary: ${opportunity.key_summary}` : null,
    opportunity.sean_fit ? `For Sean: ${opportunity.sean_fit}` : null,
    opportunity.the_gap ? `The gap: ${opportunity.the_gap}` : null,
  ].filter(Boolean);

  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("items").insert({
    title: opportunity.title,
    note: noteParts.join("\n\n"),
    tags: [opportunity.category || "opportunity"],
    heat: 0,
    stage: "inbox",
    kill_reason: null,
    created_at: now,
    updated_at: now,
  });

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ status: "promoted" })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  try {
    const { data: newItem } = await supabase
      .from("items")
      .select("id")
      .eq("title", opportunity.title)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (newItem) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const outcome = await runReviewAction(supabase, anthropic, { id: newItem.id, action: "review" });
      if (!outcome.success) console.error("Auto-review failed:", outcome.error);
    }
  } catch (e) {
    console.error("Auto-review lookup failed:", e);
  }

  return res.status(200).json({ success: true });
}
