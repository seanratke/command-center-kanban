// api/inventors/actions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const { action, id, name, domain, persona } = req.body || {};
  if (!action || !id) return res.status(400).json({ error: "action and id are required" });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    if (action === "promote") {
      const { data: idea, error: fetchError } = await supabase
        .from("inventor_ideas")
        .select("*, inventors(name)")
        .eq("id", id)
        .single();
      if (fetchError || !idea) return res.status(404).json({ error: "idea not found" });

      const now = new Date().toISOString();
      const note = `From inventor: ${idea.inventors?.name || "Unknown"}\n\n${idea.concept}\n\nMechanism: ${idea.mechanism}${idea.grey_area_note ? `\n\nGrey-area note: ${idea.grey_area_note}` : ""}`;

      const { error: insertError } = await supabase.from("items").insert({
        title: idea.title,
        note,
        tags: ["inventor-pool"],
        heat: 0,
        stage: "inbox",
        kill_reason: null,
        created_at: now,
        updated_at: now,
      });
      if (insertError) throw new Error(insertError.message);

      await supabase.from("inventor_ideas").update({ status: "promoted" }).eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (action === "discard") {
      await supabase.from("inventor_ideas").update({ status: "discarded" }).eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (action === "promote_synthesis") {
      const { data: idea, error: fetchError } = await supabase
        .from("synthesis_ideas")
        .select("*")
        .eq("id", id)
        .single();
      if (fetchError || !idea) return res.status(404).json({ error: "synthesis idea not found" });

      const now = new Date().toISOString();
      const note = `${idea.concept}\n\nMechanism: ${idea.mechanism}\n\nCombines: ${idea.source_items}`;

      const { error: insertError } = await supabase.from("items").insert({
        title: idea.title,
        note,
        tags: ["synthesis"],
        heat: 0,
        stage: "inbox",
        kill_reason: null,
        created_at: now,
        updated_at: now,
      });
      if (insertError) throw new Error(insertError.message);

      await supabase.from("synthesis_ideas").update({ status: "promoted" }).eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (action === "discard_synthesis") {
      await supabase.from("synthesis_ideas").update({ status: "discarded" }).eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (action === "reject_nomination") {
      await supabase.from("inventor_nominations").update({ status: "rejected" }).eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (action === "approve_nomination") {
      const { data: nomination, error: nomError } = await supabase
        .from("inventor_nominations")
        .select("*")
        .eq("id", id)
        .single();
      if (nomError || !nomination) return res.status(404).json({ error: "nomination not found" });

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 1500,
        system: "You write short, vivid inventor personas for a creative product-ideation pool. Match the style of these examples: a named person, a one-sentence identity, then 3-5 sentences describing their worldview, obsessions, and the specific question they always ask when looking at a problem. Return ONLY valid JSON, no markdown fences: {\"name\": \"Full Name\", \"persona\": \"the full persona text\"}. Never use a literal double-quote character inside the persona string.",
        messages: [{
          role: "user",
          content: `Domain: ${nomination.proposed_domain}\nWhy this field is needed: ${nomination.rationale}\n\nInvent a name and write the full persona for this new inventor.`,
        }],
      });

      const textBlock = message.content.find((b: any) => b.type === "text");
      if (!textBlock) throw new Error("No text content returned from Claude");
      const drafted = extractJson((textBlock as any).text);

      const { error: insertError } = await supabase.from("inventors").insert({
        name: drafted.name,
        domain: nomination.proposed_domain,
        persona: drafted.persona,
        status: "active",
      });
      if (insertError) throw new Error(insertError.message);

      await supabase.from("inventor_nominations").update({ status: "approved" }).eq("id", id);
      return res.status(200).json({ success: true, name: drafted.name });
    }

    if (action === "update_inventor") {
      const { error: updateError } = await supabase
        .from("inventors")
        .update({ name, domain, persona })
        .eq("id", id);
      if (updateError) throw new Error(updateError.message);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (err: any) {
    console.error("Inventor action error:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
