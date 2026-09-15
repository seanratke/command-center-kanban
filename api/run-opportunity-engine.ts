// api/run-opportunity-engine.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

interface OpportunityItem {
  rank: number;
  title: string;
  key_summary: string;
  sean_fit: string;
  the_gap: string;
  first_principles_take: string;
  why_now: string;
  what_to_build_first: string;
  why_others_missed_it: string;
  confidence: "high" | "medium" | "speculative";
  is_top_recommendation: boolean;
  who_this_is_for?: string;
  research_grounding?: string;
}

interface EngineResponse {
  today_signal: string;
  watchlist_flags: { seed_idea_title: string; note: string }[];
  boards: {
    main: OpportunityItem[];
    far_out: OpportunityItem[];
    canada_bc: OpportunityItem[];
    human_needs: OpportunityItem[];
  };
  discarded_but_noted: string[];
  raw_report_markdown: string;
}

function loadSystemPrompt(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "opportunity-engine-prompt.md"), "utf-8");
}

function extractJson(text: string): EngineResponse {
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

    const { data: seedIdeas } = await supabase
      .from("seed_ideas")
      .select("id, title, description")
      .eq("status", "active");

    let watchlistBlock = "";
    if (seedIdeas && seedIdeas.length > 0) {
      watchlistBlock =
        "\n\nACTIVE WATCHLIST IDEAS:\n" +
        seedIdeas.map((s, i) => `${i + 1}. Title: ${s.title}\n   Description: ${s.description || "(no description)"}`).join("\n");
    }

    const systemPrompt = loadSystemPrompt();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 32000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Run today's scan now. Today's date is " +
            new Date().toISOString().slice(0, 10) +
            "." + watchlistBlock +
            "\n\nReturn ONLY the JSON object described in your instructions — no other text.",
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    });

    const textBlocks = message.content.filter((b: any) => b.type === "text");
    if (textBlocks.length === 0) throw new Error("No text content returned from Claude");
    const finalText = (textBlocks[textBlocks.length - 1] as any).text;

    const parsed = extractJson(finalText);
    if (!parsed.boards) throw new Error("Response JSON missing 'boards' object");

    const today = new Date().toISOString().slice(0, 10);
    const boardNames: (keyof typeof parsed.boards)[] = ["main", "far_out", "canada_bc", "human_needs"];

    const rows: any[] = [];
    for (const boardName of boardNames) {
      const items = parsed.boards[boardName] || [];
      for (const op of items) {
        rows.push({
          report_date: today,
          category: boardName,
          rank: op.rank,
          title: op.title,
          key_summary: op.key_summary,
          sean_fit: op.sean_fit,
          the_gap: op.the_gap,
          first_principles_take: op.first_principles_take,
          why_now: op.why_now,
          what_to_build_first: op.what_to_build_first,
          why_others_missed_it: op.why_others_missed_it,
          confidence: op.confidence,
          is_top_recommendation: op.is_top_recommendation === true,
          who_this_is_for: op.who_this_is_for || null,
          research_grounding: op.research_grounding || null,
          status: "new",
          raw_report_markdown: parsed.raw_report_markdown,
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("opportunities").insert(rows);
      if (error) throw new Error("Supabase insert error: " + error.message);
    }

    if (parsed.watchlist_flags && seedIdeas) {
      for (const flag of parsed.watchlist_flags) {
        const matched = seedIdeas.find((s) => s.title === flag.seed_idea_title);
        if (matched) {
          await supabase.from("seed_idea_flags").insert({
            report_date: today,
            seed_idea_id: matched.id,
            note: flag.note,
          });
          await supabase.from("seed_ideas").update({ last_flagged_date: today }).eq("id", matched.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      inserted: rows.length,
      watchlist_flags: parsed.watchlist_flags?.length || 0,
      today_signal: parsed.today_signal,
    });
  } catch (err: any) {
    console.error("Opportunity engine run failed:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
