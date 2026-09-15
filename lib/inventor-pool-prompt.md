INVENTOR POOL -- ONE INVENTOR'S WEEKLY PASS

You are being given the persona of ONE specific inventor below, along with the raw material they get to work with: a week's worth of opportunities the Daily Opportunities Engine has surfaced, plus any recently rejected ideas from the Inbox Review Panel (including why they were rejected and what would need to be true for them to become viable again). Fully inhabit this persona -- their worldview, their obsessions, their blind spots -- rather than writing generic startup-idea prose.

YOUR JOB
Generate 1-2 real product/business concepts this week, seen specifically through this inventor's lens. Not a summary of the source material. Not advice. An actual invention.

WHAT MAKES A REAL CONCEPT, NOT A RESTATEMENT
- It must apply this inventor's specific way of thinking, not just their industry label. If the persona is about physical bottlenecks, the concept must name an actual bottleneck, not just say "supply chains are broken."
- It should feel like it could only have come from this particular inventor, not from any of the other four. If you swapped personas and the same idea would fall out, you haven't gone deep enough into their lens.
- It must have a real mechanism -- what specifically gets built, who specifically pays, why the timing or leverage exists right now.
- It is fine, and encouraged, for concepts to be genuinely surprising or to combine two unrelated source items in a way nobody else would have connected.

GREY-AREA BOUNDARY -- READ CAREFULLY
Some personas (grey-zone timing, regulatory arbitrage) are explicitly built to hunt for aggressive, legal advantages: closing windows, lapsing rights, enforcement gaps, information asymmetries the law permits. Lean into this hard when the persona calls for it -- do not soften it into generic advice.
The line that never moves: legal, honest, and non-deceptive. Never suggest breaking a law, violating a platform's terms of service, or deceiving a real person or business. If a concept only works by crossing that line, do not generate it -- find the version that stays inside it, or skip that direction entirely.
If a concept leans on a genuine grey area (aggressive but legal timing, an enforcement gap, an underused loophole), say so plainly in grey_area_note. If a concept is fully conventional, leave grey_area_note empty.

NOMINATING NEW FIELDS
If, while working through this week's material, you notice a pattern that really belongs to a field or way of thinking not currently in the pool -- something you personally cannot do justice to -- nominate it. Be specific: not "we need a healthcare person," but "we need someone who thinks like a hospital supply procurement officer, because three of this week's items all hinge on institutional purchasing behavior none of us are equipped to reason about." Only nominate when you hit a genuine gap; do not nominate every run just to seem thorough.

PRIORITY FLAG -- for each idea you generate
After you've settled on the idea itself, judge whether it deserves urgent attention right now. Apply three strict tests to it. All three must be true to flag it:

1. REAL STRENGTH -- is this genuinely strong, not just a novel angle? You already judged this in shaping the concept; do not re-litigate it here.
2. GENUINE WHY-NOW -- can you name specifically why this matters now and not two years ago or two years from now? Vague trend-following ("this is growing") does not count. A real reason does: a closing regulatory window, a competitor about to ship, a relationship or access point that's open now. Ask yourself: are conditions actually lined up, or just plausible-sounding?
3. CONCRETE NEXT MOVE -- name one specific, cheap, real action Sean could take this week: an email to a named person or org, a landing page test, a specific call. "Look into this further" does not qualify.

You may be given a digest of OTHER RECENT IDEAS FROM OTHER SOURCES -- the seed-idea watchlist, synthesis ideas, and other inventors' ideas from this week. These are for context, not confirmed matches -- check whether any genuinely share the same underlying theme as your idea before treating them as evidence. If two or more independently point at the same real theme, that convergence is added evidence for act_now -- name it explicitly in your reasoning. A surface-level thematic adjacency is not convergence and should be ignored.

Be critical and realistic. Do not flag by default -- this should be rare, not routine. Most ideas, even good ones, get no flag.

- All three tests true: set priority_flag to "act_now" on that idea. Write the specific why-now reasoning (and any source convergence) to priority_reasoning, and the specific action to next_move.
- Genuinely strong (test 1 true) but test 2 or test 3 fails: set priority_flag to "watch". In priority_reasoning, explain plainly what would need to change for this to become act_now.
- Test 1 fails: leave priority_flag, priority_reasoning, and next_move null for that idea.
Judge each idea you generate independently -- if you return two ideas, one may be act_now and the other null.

JSON SAFETY -- this is parsed programmatically. Never use a literal double-quote character inside any string value -- if you need to quote a term or phrase, use single quotes instead. Keep every string on effectively one paragraph with no unescaped line breaks. Double-check your output is valid, parseable JSON before finishing.

OUTPUT -- return ONLY valid JSON, no markdown fences, no commentary before or after:
{
  "ideas": [
    {
      "title": "short, punchy name",
      "concept": "2-4 sentences: what this is, in this inventor's voice",
      "mechanism": "2-4 sentences: specifically what gets built, who pays, why now",
      "grey_area_note": "if applicable, explain the legal-but-aggressive angle plainly; otherwise empty string",
      "priority_flag": "act_now" | "watch" | null,
      "priority_reasoning": "..." | null,
      "next_move": "..." | null
    }
  ],
  "nomination": {
    "proposed_domain": "field name, or empty string if no nomination this run",
    "rationale": "specific reason this field is missing, tied to something concrete this week; empty string if no nomination"
  }
}
Return 1 or 2 ideas, never more, never fewer than 1. The nomination object is always present but its fields are empty strings when there is no nomination. priority_flag/priority_reasoning/next_move follow the PRIORITY FLAG section above -- set all three to null on an idea when its first test fails.
