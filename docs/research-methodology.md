# Research methodology

Reference doc for how Command Center's AI research and idea-generation systems actually work: the scoring rule used to flag urgency, Sean's interest lenses, the additional lenses reserved for the Human Needs board, and the real data sources the systems draw on.

## The act_now / watch scoring rule

Used by the Inbox Review Panel, Inventor Pool, and Synthesis engine (`lib/inbox-review-panel-prompt.md`, `lib/inventor-pool-prompt.md`, `lib/synthesis-prompt.md`) whenever they judge whether an idea deserves urgent attention. Three strict tests, all three must be true to flag `act_now`:

1. **Real strength** -- is this genuinely strong, not just novel? (Already covered by the system's own normal review/generation judgment -- not re-litigated at this step.)
2. **Genuine why-now** -- can the system name specifically why this matters now and not two years ago or two years from now? Vague trend-following ("this is growing") does not count. A real reason does: a closing regulatory window, a competitor about to ship, a relationship or access point that's open now.
3. **Concrete next move** -- one specific, cheap, real action Sean could take this week: an email to a named person or org, a landing page test, a specific call. "Look into this further" does not qualify.

Outcomes:
- **All three true:** `priority_flag = 'act_now'`, with the specific why-now reasoning (and any cross-source convergence) written to `priority_reasoning`, and the specific action written to `next_move`.
- **Genuinely strong (test 1) but test 2 or 3 fails:** `priority_flag = 'watch'` instead of being killed or ignored -- `priority_reasoning` explains plainly what would need to change for it to become `act_now`. Timing and buildability are separate questions; a good idea whose moment hasn't arrived yet is not rejected for that reason.
- **Test 1 fails:** `priority_flag` stays null. No other change in behavior.

This is deliberately rare, not routine -- most ideas get no flag at all.

## Sean's interests (general lens)

Used across the system as a lens for spotting personal fit and framing `sean_fit`-style reasoning -- **not** a pre-filter on what gets researched (see the Opportunity Engine's explicit instruction not to filter by interest before researching; these interests are for framing found opportunities, not excluding unfamiliar fields):

- AI
- Psychology
- Social psychology
- Neurology
- Medicine
- IT / app development
- Emerging tech
- Aging population and care
- Finance
- Marketing
- New medicine
- Space and space travel
- Crypto
- Mars
- Process design
- LEAN principles
- First-principles thinking

## Additional Human Needs board lenses

The Opportunity Engine's Human Needs board narrows to one specific population per day and looks for first-person, unfiltered evidence of struggle. Beyond the general interest list above, this board specifically also reasons through:

- His wife's medical condition
- Closed systems and autonomous loops
- Cannabis
- Weightlifting
- Inventions
- Hacking
- Process speed
- Clear communication
- Brain function
- Altered states of consciousness

## Real data sources the engine actually uses

As of 2026-09-15, `api/run-opportunity-engine.ts` passes Anthropic's `web_search_20250305` tool to the model (the same real-search mechanism `api/lab-research.ts` already used), and the prompt (`lib/opportunity-engine-prompt.md`) instructs the model to actually search and cite what it finds rather than write as though it had. Verified with a real triggered run (manually invoked via `vercel crons run`, ~7.6 minutes, 9 opportunities across all four boards).

Confirmed real, specific citations in that run's `research_grounding` field -- for example, the Human Needs board item ("The One-Question Answering Machine," about dementia caregivers) cited:
- A specific thread on the Alzheimer's Society Dementia Support Forum ("Asking the same question over and over"), quoting the original poster directly
- A specific App Store dementia-clock listing's own product description
- A specific Ask MetaFilter thread about shopping for dementia clocks
- Clinical/neurology literature on repetitive questioning in dementia patients

These came back with Claude's native `<cite>` markers tied to actual search results -- not paraphrased or invented after the fact.

**Fixed 2026-09-15:** `research_grounding` was originally only requested for Human Needs items. It's now a required field for every board -- `main`, `far_out`, and `canada_bc` all cite the real source(s) found via search the same way Human Needs does, with the same honesty standard (state plainly when nothing specific enough turned up, rather than inventing a citation).

**Also discovered and fixed in the same pass:** the site's password-gate middleware was silently 302-redirecting all four cron-triggered API routes (including this one) before they ever reached their handler code, since cron requests carry no login cookie. This had been blocking the Opportunity Engine's daily scheduled run (and likely Inventor Pool, Synthesis, and Resurrection Check's weekly runs) since the password gate deployed. Fixed by exempting those four routes -- which already have their own independent `CRON_SECRET` bearer-token auth -- from the cookie check.
