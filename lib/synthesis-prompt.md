SYNTHESIS -- finding what lives between two separate findings

You are given a week's worth of raw material: opportunities across all boards, rejected ideas, and inventor pool concepts. Individually, each of these was evaluated on its own. Your job is different: find what only becomes visible when you combine two or more of them -- a mechanism from one paired with a market or population from another, a rejected idea whose flaw is solved by a completely unrelated item this week, two boring items that are actually the same underlying bottleneck wearing different clothes.

WHAT MAKES A REAL SYNTHESIS, NOT A COINCIDENCE
- It must combine at least two genuinely separate source items, and name both explicitly.
- The combination must produce something neither source item suggested on its own. If either source item alone already implies this idea, it is not a synthesis.
- Prefer combinations that are surprising precisely because the two source items look unrelated on the surface.
- It must still have a real mechanism -- what gets built, who pays -- same bar as every other idea in this system.

A SECOND JOB -- OVERLAP DETECTION
Separately from combinations, also check for overlap: cases where an inventor idea and an opportunity from the daily boards (or two items from different sources) are independently describing the SAME underlying idea, just discovered by two different systems that do not talk to each other. This is not a new invention -- it is a duplicate-detection job. Flag it because Sean should know two independent processes converged on the same thing, which is itself a signal the idea is real, and because he should not accidentally treat them as two separate opportunities.

PRIORITY FLAG -- for each idea you generate
After you've settled on the idea itself, judge whether it deserves urgent attention right now. Apply three strict tests to it. All three must be true to flag it:

1. REAL STRENGTH -- is this genuinely strong, not just a novel angle? You already judged this in shaping the idea; do not re-litigate it here.
2. GENUINE WHY-NOW -- can you name specifically why this matters now and not two years ago or two years from now? Vague trend-following ("this is growing") does not count. A real reason does: a closing regulatory window, a competitor about to ship, a relationship or access point that's open now. Ask yourself: are conditions actually lined up, or just plausible-sounding?
3. CONCRETE NEXT MOVE -- name one specific, cheap, real action Sean could take this week: an email to a named person or org, a landing page test, a specific call. "Look into this further" does not qualify.

For an "overlap" idea, the overlap itself is convergence evidence for test 2 (independent sources landing on the same theme is a real signal something is timely) -- but it is not automatic qualification. State plainly whether the overlap plus anything else you know adds up to a genuine why-now, or whether it is just two systems agreeing on something that still is not time-sensitive.

Be critical and realistic. Do not flag by default -- this should be rare, not routine. Most weeks, most ideas -- including real syntheses -- get no flag.

- All three tests true: set priority_flag to "act_now" on that idea. Write the specific why-now reasoning (naming the convergence explicitly for overlap ideas) to priority_reasoning, and the specific action to next_move.
- Genuinely strong (test 1 true) but test 2 or test 3 fails: set priority_flag to "watch". In priority_reasoning, explain plainly what would need to change for this to become act_now.
- Test 1 fails: leave priority_flag, priority_reasoning, and next_move null for that idea.
Judge each idea independently.

WHAT TO AVOID
- Do not force a connection between two items that do not actually share a real mechanism, just because they are thematically adjacent.
- Do not just summarize the week -- every output must be a genuinely new idea, not a recap.
- If nothing this week combines into something real, return an empty ideas array and say so. This should be common, not rare -- most weeks will not have a strong synthesis.

OUTPUT -- return ONLY valid JSON, no markdown fences, no commentary before or after:
{
  "ideas": [
    {
      "title": "short, punchy name",
      "concept": "2-4 sentences: what this is",
      "mechanism": "2-4 sentences: what gets built, who pays, why now",
      "source_items": "plain description naming the two or more specific source items that were combined or that overlap",
      "idea_type": "combination or overlap",
      "priority_flag": "act_now" | "watch" | null,
      "priority_reasoning": "..." | null,
      "next_move": "..." | null
    }
  ]
}
Return 0 to 3 ideas total across both combination and overlap. Zero is a fine, common, honest result. Never use a literal double-quote character inside any string value. priority_flag/priority_reasoning/next_move follow the PRIORITY FLAG section above -- set all three to null on an idea when its first test fails.
