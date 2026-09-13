// api/seed-ideas/list.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: ideas, error: ideasError } = await supabase
    .from("seed_ideas")
    .select("*")
    .order("created_at", { ascending: false });

  if (ideasError) return res.status(500).json({ error: ideasError.message });

  const { data: flags, error: flagsError } = await supabase
    .from("seed_idea_flags")
    .select("*")
    .order("report_date", { ascending: false });

  if (flagsError) return res.status(500).json({ error: flagsError.message });

  const ideasWithFlags = ideas.map((idea) => ({
    ...idea,
    flags: flags.filter((f) => f.seed_idea_id === idea.id),
  }));

  return res.status(200).json({ ideas: ideasWithFlags });
}
