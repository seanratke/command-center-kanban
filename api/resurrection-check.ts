// api/resurrection-check.ts
export const maxDuration = 300;
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "resurrection-prompt.md"), "utf-8");
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = loadPrompt();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await supabase
      .from("items")
      .select("*")
      .eq("review_status", "rejected")
      .not("rejection_report", "is", null)
      .or(`resurrection_checked_at.is.null,resurrection_checked_at.lt.${weekAgo}`)
      .limit(5);

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ success: true, checked: 0, resurrected: 0 });
    }

    const { data: recentOps } = await supabase
      .from("opportunities")
      .select("title, key_summary, the_gap, category")
      .gte("report_date", weekAgo.slice(0, 10))
      .limit(30);

    const materialBlock = (recentOps || [])
      .map((o: any) => `[${o.category}] ${o.title} -- ${o.key_summary || o.the_gap || ""}`)
      .join("\n");

    let resurrectedCount = 0;
    const results: any[] = [];

    for (const item of candidates) {
      try {
        const reconsiderIf = item.rejection_report?.reconsider_if;
        if (!reconsiderIf) {
          await supabase.from("items").update({ resurrection_checked_at: new Date().toISOString() }).eq("id", item.id);
          continue;
        }

        const userContent = `REJECTED IDEA: ${item.title}\nOriginal rejection reason: ${item.rejection_report?.main_reason || "unknown"}\nCONDITION TO RECHECK: ${reconsiderIf}\n\nRECENT MATERIAL FROM THE PAST WEEK:\n${materialBlock || "(none found)"}`;

        const message = await anthropic.messages.create({
          model: "claude-opus-5",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        });

        const textBlock = message.content.find((b: any) => b.type === "text");
        if (!textBlock) throw new Error("No text content returned from Claude");
        const result = extractJson((textBlock as any).text);

        const update: any = { resurrection_checked_at: new Date().toISOString() };
        if (result.condition_met) {
          update.review_status = null;
          update.resurrection_note = result.evidence;
          resurrectedCount++;
        }

        await supabase.from("items").update(update).eq("id", item.id);
        results.push({ title: item.title, resurrected: !!result.condition_met });
      } catch (itemErr: any) {
        console.error(`Resurrection check failed for ${item.title}:`, itemErr);
        results.push({ title: item.title, error: itemErr.message });
      }
    }

    return res.status(200).json({ success: true, checked: candidates.length, resurrected: resurrectedCount, results });
  } catch (err: any) {
    console.error("Resurrection check failed:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
