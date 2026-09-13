// api/inventors/roster.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await supabase
    .from("inventors")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ inventors: data || [] });
}
