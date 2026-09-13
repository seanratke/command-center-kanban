// api/items-add.ts
export const maxDuration = 120;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

  try {
    await fetch(`https://command-center-ashen-gamma.vercel.app/api/review-panel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, action: "review" }),
    });
  } catch (reviewErr) {
    console.error("Review trigger failed (item still created):", reviewErr);
  }

  return res.status(200).json({ success: true, item: data });
}
