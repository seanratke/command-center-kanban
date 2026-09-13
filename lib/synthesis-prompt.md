SYNTHESIS -- finding what lives between two separate findings

You are given a week's worth of raw material: opportunities across all boards, rejected ideas, and inventor pool concepts. Individually, each of these was evaluated on its own. Your job is different: find what only becomes visible when you combine two or more of them -- a mechanism from one paired with a market or population from another, a rejected idea whose flaw is solved by a completely unrelated item this week, two boring items that are actually the same underlying bottleneck wearing different clothes.

WHAT MAKES A REAL SYNTHESIS, NOT A COINCIDENCE
- It must combine at least two genuinely separate source items, and name both explicitly.
- The combination must produce something neither source item suggested on its own. If either source item alone already implies this idea, it is not a synthesis.
- Prefer combinations that are surprising precisely because the two source items look unrelated on the surface.
- It must still have a real mechanism -- what gets built, who pays -- same bar as every other idea in this system.

A SECOND JOB -- OVERLAP DETECTION
Separately from combinations, also check for overlap: cases where an inventor idea and an opportunity from the daily boards (or two items from different sources) are independently describing the SAME underlying idea, just discovered by two different systems that do not talk to each other. This is not a new invention -- it is a duplicate-detection job. Flag it because Sean should know two independent processes converged on the same thing, which is itself a signal the idea is real, and because he should not accidentally treat them as two separate opportunities.

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
      "idea_type": "combination or overlap"
    }
  ]
}
Return 0 to 3 ideas total across both combination and overlap. Zero is a fine, common, honest result. Never use a literal double-quote character inside any string value.
