// api/review-panel.ts -- thin HTTP wrapper around the shared review engine
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { runReviewAction } from "../lib/review-engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { id, action, answers, reasoning } = req.body || {};
  if (!id || !action) return res.status(400).json({ error: "id and action are required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const outcome = await runReviewAction(supabase, anthropic, { id, action, answers, reasoning });

  if (!outcome.success) {
    return res.status(outcome.status || 500).json({ success: false, error: outcome.error });
  }
  return res.status(200).json({ success: true, result: outcome.result });
}
