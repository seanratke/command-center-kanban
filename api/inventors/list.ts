// api/inventors/list.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: inventors, error: invError } = await supabase
    .from("inventors")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (invError) return res.status(500).json({ error: invError.message });

  const { data: ideas, error: ideasError } = await supabase
    .from("inventor_ideas")
    .select("*")
    .order("created_at", { ascending: false });
  if (ideasError) return res.status(500).json({ error: ideasError.message });

  const { data: nominations, error: nomError } = await supabase
    .from("inventor_nominations")
    .select("*, inventors!inventor_nominations_nominated_by_fkey(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (nomError) return res.status(500).json({ error: nomError.message });

  const inventorsWithIdeas = inventors.map((inv) => ({
    ...inv,
    ideas: ideas.filter((i) => i.inventor_id === inv.id),
  }));

  return res.status(200).json({ inventors: inventorsWithIdeas, nominations: nominations || [] });
}
