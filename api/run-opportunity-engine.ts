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
}

interface EngineResponse {
  today_signal: string;
  boards: {
    main: OpportunityItem[];
    far_out: OpportunityItem[];
    canada_bc: OpportunityItem[];
  };
  discarded_but_noted: string[];
  raw_report_markdown: string;
}

function loadSystemPrompt(): string {
  const promptPath = path.join(process.cwd(), "lib", "opportunity-engine-prompt.md");
  return fs.readFileSync(promptPath, "utf-8");
}

function extractJson(text: string): EngineResponse {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
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
            ". Return ONLY the JSON object described in your instructions — no other text.",
        },
      ],
    });

    const textBlock = message.content.find((b: any) => b.type === "text");
    if (!textBlock) {
      throw new Error("No text content returned from Claude");
    }

    const parsed = extractJson((textBlock as any).text);

    if (!parsed.boards) {
      throw new Error("Response JSON missing 'boards' object");
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const today = new Date().toISOString().slice(0, 10);
    const boardNames: (keyof typeof parsed.boards)[] = ["main", "far_out", "canada_bc"];

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
          status: "new",
          raw_report_markdown: parsed.raw_report_markdown,
        });
      }
    }

    if (rows.length === 0) {
      throw new Error("No opportunities returned across any board");
    }

    const { error } = await supabase.from("opportunities").insert(rows);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      inserted: rows.length,
      today_signal: parsed.today_signal,
    });
  } catch (err: any) {
    console.error("Opportunity engine run failed:", err);
    return res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
}
