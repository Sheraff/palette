# Graveyard audit — what the campaign killed, and how much deserves to come back

Read-only. Base verified and reset to trunk `228b722`. No runtime changed, no extraction run.

## What I read
- All 42 records under `research/v2-3-experiments/` on trunk (13,391 lines).
- All 29 un-merged agent-branch records from 21 `worktree-agent-*` branches (11,371 lines) — tracks O, R, S, T, U, V, both role-assignment generations, and the whole accent + gradient-generation line. None of it is on trunk.
- `research/v2-3-eval/data/verdicts.jsonl` — 314 records, 155 artworks — as the adjudication oracle.

## One thing I could not find
**The charter section "Multiple valid palettes — guardrail semantics" (2026-08-02) does not exist.** Not in `research/v2-3-eval/TRACK_CHARTER.md` at `228b722`, and not on any of the 43 branches — I grepped every branch head. The trunk charter is 49 lines and ends at "Integration". I audited against the rule as your brief words it. If the wording differs, some classifications shift.

---

## The headline

**168 dead, disabled, narrowed, or never-built items. 36 revivable (21%). 19 partial (11%). 113 evidence-killed (67%).**

So the fear is **half right**. Two thirds of the graveyard died of its own measurements and would have died under any rule. But the revivable quarter is not a random quarter — it is disproportionately the work that was closest to delivering what the reviewer keeps asking for.

Four facts from the warehouse make the case sharper than the counts do.

**1. The most-cited guardrail in the campaign was never strong.** `09/…fdddff2` was graded **acceptable** twice, and both times the reviewer wrote that the surface should be red — "carpaccio red or punch red", then "Carpaccio, maybe Arcane Red, Punch would work, **Aubergine** maybe as well". Track L and Track G both moved its surface to `#662948` — an aubergine — and both scored that as breakage. Tracks E and M also bent around it. The red surface `#c42a42` arrived later by another route and scored **strong**.

**2. 48 of 155 artworks have never been shown more than one distinct palette.** 32 of those carry a "strong" latest verdict. For those 32, "strong" is an absolute judgement of one option. It cannot mean the alternative is worse — no alternative was ever shown. Every "breaks a reviewed-strong" kill landing on one of those 32 is, by construction, a kill on an unadjudicated destination.

**3. 8 of the 34 local fixtures have zero warehouse records** — `nada.jpg`, `black.jpg`, `maroon5.jpg`, `ybbb.jpg`, `snarky.jpg`, and the three synthetic `pure*.jpg`. `nada` alone is the killing casualty in **six** separate Track A rejections. Not one was a comparative loss.

**4. 51 artworks carry a written reviewer request. On 44 the request has never been satisfied by any palette the reviewer was shown. 22 of those 44 carry a "strong" latest verdict.** Those 22 are guardrails under the old rule and open complaints under the new one. That contradiction is the campaign's central cost.

And the campaign said the quiet part out loud, twice, in two independent arms:

> "I judged these as collateral because they are frozen reviewed outcomes, which is the guardrail I was given — **not** because I viewed them and decided the colours are worse. Several may well be the same class review asked for; that is what a review batch is for." — `track-w/EXPERIMENT.md` §8

> "I have recorded them as regressions because they are frozen reviewed outcomes, which is the guardrail I was given, not because I judged the colours worse." — `track-g/EXPERIMENT.md`

---

## How the kills break down

| Stated kill ground | Items | Under the new rule |
| --- | ---: | --- |
| Failed on its own terms — no separating threshold, zero delivery, measured inert, arithmetic ceiling, prediction refuted | 89 | **Stays dead.** Rule change irrelevant. |
| Destination was shown to a reviewer and lost, or reproduces a palette rejected in words | 24 | **Stays dead.** Properly adjudicated. |
| Killed on movement volume alone; destinations never shown | 17 | **Revivable.** |
| Killed on breaking a named artwork whose destination was never shown | 11 | **Revivable.** |
| Narrowed, gated, or never attempted *before* measurement, to protect reviewed outcomes | 8 | **Revivable.** |
| Mixed | 19 | **Partial.** |
| **Total** | **168** | 113 dead / 36 revive / 19 partial |

Plus one item that is neither: the gradient **ground-ownership composed rule** (branch `af2ba8fda27920c6c`, `gradient-fit-generation`) is a live hold, shipping OFF with "zero errors in both directions" on current verdicts and a prediction batch declared but not resolved in the record.

---

## The revivable and partial items in full

Format: **name** — what it does — record — the ground — why it revives.

### Killed on movement volume, destinations never shown

| Item | What it does | Record | Ground | Why it revives |
| --- | --- | --- | --- | --- |
| **Obligation-rank foreground bound** | A chromatic colour with standing identity evidence is not displaced from the text role by rank. | `track-w/EXPERIMENT.md` §5, §13 | "Both re-anchored holds are NOT protectable by principled means, so the rule parks." | Recovers `birdsofprey` strong ×4, 6/6 must-flip, blast radius 30.7%→23.6%, **no new constant**. The arm's own re-mining cut collateral from 10 to 4, and 3 of the movers "reproduce a recorded human correction hex-for-hex". |
| **O-2 display-text foreground rule** | Whichever family *is* the artwork's display text takes the foreground, even when vivid. | `track-o/EXPERIMENT.md`, br. `a456a70e798daa3f1` | "the rule is right and the discriminator is not yet good enough to carry it"; 27 of 38 movers carry standing verdicts. | 6/6 must-flip, 8/9 must-hold, "0 of 324 cases moved the wrong way". None of the 27 destinations was shown. |
| **Accent vividness term (M)** | Rewards more saturated accents in the quality objective. | `track-m/EXPERIMENT.md` | "52 of 109 cases change… **Thirty reviewed-and-applied palettes are destroyed; one is gained.**" | The one gain is `08/…087b13` landing on `#f94a2f` — the exact value review-16 and review-17 graded **strong**. Of the casualties: `07/…07cc8b` moved to `#ee7326`, the marmalade orange the reviewer asked for twice and which later scored strong as `#f06d13`; `2b222b02` was only *acceptable* with a standing "the accent should be red" complaint; `09/…fdddff2` is fact 1 above. |
| **`ACCENT_EVIDENCE_CHANNEL`** | Scores the accent role with the accent classifier instead of the generic signature score. | `accent-evidence/EXPERIMENT.md`, br. `a6de7bb777438fac1` | "0/7 on the adjudicated asks against 27.9% churn… and two broken reviewed-`strong` guardrails." | Strongest accent statistic in the campaign: "0/13 → 5/13 of the standing asks now out-score their incumbent, improved on 12 of 13 (p = 0.0034), median lane-rank gain 13 places." Its batch was built (`ae-batch`) and **never adjudicated**. |
| **Slot-economics M1** | Lets each colour family offer a second candidate shade. | `slot-economics/EXPERIMENT.md`, br. `ad3110d8b83e88921` | "twelve `strong` artworks move" → ships OFF. | Slate ΔE to the reviewer's exact gold falls 7.21 → 4.07, and it is **provably non-displacing** (0 trunk candidates lost, 330 added). The arm built no batch for any of the twelve. |
| **Family-primary obligation ordering (L variant a)** | Ranks identity priority by whole-family evidence first. | `track-l/EXPERIMENT.md` M1 | Never swept: "(b) is strictly narrower on the census and already broke eight reviewed outcomes." | Killed by inheritance from a sibling whose eight casualties include 3 with zero warehouse records and 1 (`09`) that was only acceptable. |
| **Reduce identity credit for near-neutral accents** | Stops washed-out accents soaking up identity credit. | `track-l/EXPERIMENT.md` M4; `track-c` R5 | "31 carry a low-saturation accent, of which twelve are near-neutral… Penalising near-neutral accents would put all of these at risk." | **Never built or measured.** A projection from inspection. Directly targets the biggest ask class. |
| **`BAND_TIE_BREAK` raw-utility / same-family variants** | Endpoint tie-break rules. | `track-a/EXPERIMENT.md` round 4 | "demotes reviewed-strong `nada`"; "adds representative noise to `nada`, `nobs` and `ybbb`". | `nada` and `ybbb` have **no warehouse record at all**; `nobs`' destination never shown. |
| **`collapsedSurfaceFidelity = 0.50`** | Rewards collapsed surfaces more. | `track-a/EXPERIMENT.md` H2 table | "Loses `johns`, and demotes reviewed-strong `nada` to collapsed." | `nada` unadjudicated; `johns` has since moved anyway (surface `#315a92`, batch-26 strong). |
| **Mount ratio 1.5** | A looser frame-detection bar. | `track-k/EXPERIMENT.md` §4 | "neither change looked like an improvement to me" | The arm author's own eye, on two artworks with **no verdict at all**. |
| **`r2` narrowed accent-priority rule** | Lets a deliberate colourful mark outrank a plain family for the accent role, gated on a full hue-direction lead. | `track-r/EXPERIMENT.md`, br. `a0658e96a59e92be4` | "it should not be integrated on this evidence" — one cost, `01/…014fb430` landing on "an unreviewed olive". | 125 of 128 byte-identical, **every guardrail and HOLD anchor holds**, one reviewed palette gained (`08/…087b1314`, review-17 strong). Nearly ready. |
| **`FOREGROUND_MARK_ADMISSION = "mark-bearing"`** | Lets a mark-bearing text colour earn identity authority. | `carrier-ranking/EXPERIMENT.md` §6.1; `role-assignment/EXPERIMENT.md` | "moves `0cd48f` onto an unreviewed green-text arrangement" | Destination **explicitly never shown** — and batches 26/27/28 have since endorsed exactly that class of teal/green foreground on that artwork. **ALREADY RUNNING** — covered. |

### Narrowed or never attempted before measurement, to protect reviewed outcomes

| Item | What it does | Record | Ground |
| --- | --- | --- | --- |
| **Exact polarity-crossing fix** | Removes a false contrast sign-flip in `birdsofprey`'s accent evidence — a genuine defect. Already built in `continuum.ts`. | `track-b4/EXPERIMENT.md` §3 | "it lands on `birdsofprey`, which is reviewed strong… **I did neither in this arm**, because both change reviewed-strong cases." |
| **`slim` foreground readability reweight** | Rebalance the readability axis so a cyan foreground stops beating a neutral one. | `track-e/EXPERIMENT.md` | "the exact move the `09/…` guardrail exists to prevent. **I did not attempt it.**" — and the `09` guardrail is fact 1 above. |
| **Chroma inside `signatureRoleScore`** | The bigger version of the accent-chroma term, reaching candidacy. | `accent-salience/EXPERIMENT.md`, br. `a74f2c207a510d87a` | "it would change candidacy for every role and every artwork, and **it is exactly the move review has already refused once.**" |
| **Chroma-repaired lane admission** | Lets repaired mark evidence decide candidacy, not just scoring. | `track-j/EXPERIMENT.md` | "that is the entitlement Track E's revision 2 rejected. Worth an arm; not this rule." |
| **Classifier chroma rebalance for `krafty`** | Retune the foreground/accent label rule. | `track-c/EXPERIMENT.md` round 4c | "rebalancing would move `requiredRole` labels for every family on every field and **perturb reviewed outcomes broadly**." Never measured. |
| **Continuous `mount` credit ramp** | Replaces the hard frame-vs-background threshold with a smooth one. | `resolution-pairs/EXPERIMENT.md` §(f), br. `ac216378354de75bb` | "it changes behaviour on **every framed artwork in the reviewed set**… so it needs an accuracy sweep and a review batch, **and this arm ran neither**." |
| **Foreground authority exclusion** | The rule that a chromatic foreground earns zero identity authority. | `authority-symmetry/EXPERIMENT.md` §5, br. `a86793457c8d1a463` | "**Not attempted.** …the brief forbids neutering them. Measured but left alone." |
| **Family-partition replacement** | Stable clustering so the same artwork groups the same way at any resolution. | `resolution-pairs/EXPERIMENT.md` §(e) | "**It would invalidate every reviewed outcome in the warehouse simultaneously.** That is a campaign decision, not an arm's." |

### Confirmed live defects, never fixed (revivable because nothing was ever weighed against them)

| Item | What it does | Record | Ground |
| --- | --- | --- | --- |
| **Chord-deviation endpoint-proximity veto** | Deletes a gradient's third stop when it sits near an endpoint. | `adversarial-logic/REVIEW.md` F2, confirmed in `VERDICTS.md` §5 | "**1,197 (44%) are killed by the second guard alone**… On `placebo` and `slim` the endpoint rule kills **100%** of chord-passing candidates (275→0 and 120→0)." Seven of nine gradient winners lose their midpoint. |
| **Obligation-slot / chroma-floor mismatch** | Grey families fill limited identity slots, then a downstream floor discards them. | `adversarial-logic/REVIEW.md` F3, confirmed | "**311/543 (57%)** of obligation slots held by families with chroma < 0.06. On 8 artworks *every* slot is near-neutral." |
| **ASCII hex tie-break on flat pairs** | Ties broken by alphabetical hex order. | `adversarial-logic/REVIEW.md` F4 | "hex ordering decides 9/34… the signal exists and is deliberately thrown away." **ALREADY RUNNING** (comparator-ordering) — covered. |
| **Unconditional white alpha-flatten** | Every transparent pixel is painted white before any analysis. | `track-p/AGENDA.md` §7 | "it runs on every load, it is undocumented, and it **silently decides the field colour of every transparent artwork**." |
| **`TRANSITION_PROMOTION_ORDER = coverage-first`** | Which gradient transition wins. | `track-p/AGENDA.md` §8; `provenance-hygiene/REPORT.md` | "contradicts its own doc comment, which records human review of a case where the lower-coverage, more readable accent was preferred. Either the comment or the value is stale." |
| **135° fixed render angle** | Every gradient renders diagonally regardless of the shape detected. | `adversarial-logic/REVIEW.md` F1 | "Six of eleven are radial… `linear/diagonal-down` … **0**." |
| **Kolin accent regression** | An integration swapped a gold logotype accent for a skin tone. | `track-q/EXPERIMENT.md` | Diagnosed, never fixed; still on trunk. Destination `#c27f62` shown and lost twice. |
| **Pareto pruning discards endorsed palettes** | The domination stage throws out the reviewer's preferred palette. | `carrier-ranking/ROUND-4.md` §J1.3 | "Domination discards the endorsed palette on **three artworks, all strong**" (`000e91d6`, `havana`, `slim`). Guard was refused (no valley); the defect stands. |

### Open, never given an arm

`representativesPerRole = 2` role-slot bound (named as the real blocker by Track A and `generation-carriers` independently) · role-specific `sourceSupport` axis · `03e50500` accent-lane widening (a generation gap: "No re-weighting of the objective can select an arrangement the domain does not contain") · designed elicitation set for weight derivation · 12 literature ideas never built (SWT stroke evidence, recall/ranking split, texture admissibility, DPP diversity, multi-stop gradients, FH merge predicate) · 173 never-firing tuning sites and 9 inert quality weights, parked pending the ablation protocol · `minimumCrossHueRadians = 60°` legacy proxy.

### Partial — the mixed ones

`weightTransfer` (fixed 8/34, demoted unadjudicated `nada`) · `earned-only` claim axis · five `meteora` levers · render-truthful `fieldSamples` (the `doja` half is properly adjudicated dead; the `loups` sign-flip fix is a real defect fix that revives) · `maximumIdentityGain` 0.06 · foreground rank-weight v2 (the `5e5a5ff6` half is adjudicated dead, the `once.jpg` half revives — "I did not view them") · min(region, family) ordering · `CHROMATIC_CANDIDACY_RESERVATION` · `ACCENT_FIDELITY_CHROMA_WEIGHT` · raw-value domination · `r1` gate · promote-and-re-source shape (costs `13bebcae`'s blue accent, favoured three times, now structurally unreachable) · `chromatic-claim` variant · `all` resolution reformulation.

---

## The 113 that stay dead, grouped by why

- **No valley / no separating threshold (31)** — every gradient-semantics statistic in Track B3 (seven of them, all "straddled by reviewed-strong gradients", every threshold "fitted against n=1") · `contextual-accent`'s whole concept ("VALLEY on the arm's own concept… would break roughly seven endorsed palettes for each one it fixes") · MÚSICA shading veto (hypothesis confirmed, "any threshold inside the window vetoes 29–36% of all obligations") · coverage-domination guard ("No monotone rule in coverage separates 'maximiser wrongly discarded' from 'correctly discarded'") · Track T's SWT veto · Track O-4 boundary discriminators · Track S-1 · the three lettering discriminators (all "selectivity collapsed") · four-way conjunction ("a fit to one artwork") · texture-based surface demotion · N4 provenance floor (0.001 margin).
- **Zero delivery on target (24)** — `decorrelateEconomy` ("all cost, no benefit") · Track W's resolution-relative `resolved` ("moves 0 of the 6 must-flip cases… changes no acceptance outcome whatsoever") and component floor · T3 leximin ("0 fixes anywhere on 171 images") · Track N corrected vividness ("ZERO of the seven anchors flipped") · `RELATIVE_CHROMA_ROLE_EVIDENCE` ("0/19 delivered… must not be enabled under any outcome") · Track O-1 ("0 of 3 assigned targets moved") · Track U-2 · `legacy-salience` · four `resolution-pairs` variants.
- **Measured inert (13)** — dense continuum contrast ("0.00 across the entire corpus") · `placementCredit` extension ("0 of 140") · `obligationSeparation` · T1 envelope basis ("0 of 171") · track-s mark-gated reserve ("zero winners in 128 cases") · slot-economics M2 · nine wave-1 quality weights · the all-ranked-lane pass ("0 of 24,847 rows used") · dead flags and dead scores.
- **Arithmetic ceiling (9)** — `meteora` arrangement (b) (~0.14 utility gap) · M4 reduced population support ("9% of the gap") · N3 identity-authority variant ("12%") · knuckles `populationFraction` · Track R-2 front-load · slot-economics ΔE<3.3 ("not achievable without target knowledge").
- **Destination adjudicated bad, in words or by comparison (24)** — mark substitution into the obligation shortlist (`placebo`: incumbent `#111312` "preferred STRONG over the mechanism's red `#c91611`", upheld twice since) · `krafty` swap ("The text of the artwork is Golden Mango…") · obligation capacity 4→6 ("Track C **loses**") · `TEXT_DEMOTION_EVIDENCE = "claimed"` ("reversed krafty outright") · surface-placement identity credit · authority-symmetry V2 (`doja`: "pink and Bisque skin color which does not represent this artwork") · role-assignment round 2 ("I don't see where it's coming from in the artwork") · `fieldPairDomains` (**the one kill where the destinations were actually served and judged** — batch-34 returned must-stay-flat on `skap`, `000db903`, `00092c14`) · T-2 symmetric SWT gate · Track H 0.45 polarity floor · foreground rank-weight v1.
- **Bugs, superseded versions, and correctly-retracted deletion claims (12)** — `renderedGradientSalience` shadowing · N1 multiply-clamp ("strengths 1.0 and 4.0 produced identical winners everywhere") · R-1 saturating ceiling · unbudgeted slot-economics M1 · H-D1 without the containment guard · the three retracted "dead mechanism" claims (transition stack → produces `birdsofprey`'s reviewed `#1880a7`; diffuse-composite domains → `loups`' reviewed gradient "exists only because of the composite pass"; endpoint refinement → alive on 1 of 60 fresh artworks).

---

## Ranked revival list

Two are **already covered**: `FOREGROUND_MARK_ADMISSION = "mark-bearing"` (mark-admission arm) and the ASCII/domination comparator work (comparator-ordering arm). If "comparator-ordering" also covers Track L obligation ordering, items 6 and 7 below collapse into it — worth confirming.

**1. Track W obligation-rank foreground bound.** Delivers the role-flip ask class — 11 artworks with explicit "the main text should be the foreground" corrections. Measured upside: `birdsofprey` recovered (strong ×4), 6/6 must-flip, blast radius 30.7%→23.6%, no new constant, collateral self-corrected 10→4 with 3 movers reproducing human corrections hex-for-hex. **Cost: small** — sweep exists, needs a 4–6 item batch on the 4 open movers. **Changed since:** the batch-33 text-role swap shipped (`e701cfe`), so the mover set will differ — re-derive before serving.

**2. Track M/N accent vividness, re-scoped.** Delivers the biggest ask class — roughly 20 of the 51 written asks are "the accent should be a vivid identity colour". Track M's working setting is the **only** mechanism that ever produced `08/…087b13`'s reviewer-confirmed red. **Cost: cheap first step, expensive second** — re-derive the 30-casualty list against current verdicts first (hours); only sweep if the list thins as I expect. **Changed since:** the gamut-coverage axis and one-hue-one-direction both shipped, so the casualty set is stale.

**3. `ACCENT_EVIDENCE_CHANNEL`.** Same ask class, and statistically the strongest accent result in the campaign (p = 0.0034, 12 of 13 improved, median 13 lane-rank places). **Cost: very small** — the `ae-batch` manifest already exists and was never served. Serve it.

**4. Track O-2 display-text foreground rule.** Independent second mechanism for the role-flip class, with a cleaner scorecard than Track W on some axes (0 of 324 wrong-way moves). **Cost: medium.** Should be **baked off against Track W**, not run in parallel — they target the same class and the machine budget rule allows one sweep at a time.

**5. Slot-economics M1 second family representative.** Delivers the "you got the right colour family but the wrong shade" class. Provably non-displacing, halves the distance to the reviewer's exact gold. **Cost: small-medium** — sweep exists, needs a 10-item batch for the twelve movers nobody ever showed anyone.

Then, cheap and independent: **Track B4's exact polarity-crossing fix** (one artwork, already coded, a real defect) · **the endpoint-proximity midpoint veto** (44% of midpoint candidates killed; 100% on `placebo` and `slim`) · **the obligation-slot chroma-floor mismatch** (57% of identity slots wasted) · **the white alpha-flatten** (silent, undocumented, decides the field colour of every transparent artwork) · **the `representativesPerRole = 2` slot bound** (named as the real blocker by two arms, never given one).

---

## The honest answer to the fear

**No, you did not miss most of the possible progress. You missed roughly a quarter of it — but it was the expensive quarter.**

Two thirds of the graveyard (113 of 168) was killed by evidence that has nothing to do with the guardrail rule: no separating threshold, zero delivery on target, measured inert, an arithmetic ceiling, or a destination the reviewer explicitly rejected in words. That work was correctly abandoned and the rule change does not touch it. Anyone claiming the old rule suppressed *most* progress is wrong, and the numbers say so plainly.

But 36 items were killed purely on movement, and 19 more partly so. And the pattern in those 55 is not random. Look at what is in the revivable set: every mechanism that ever delivered a reviewer-confirmed palette on the two biggest complaint classes. Track M delivered `08/…087b13`'s red — nothing else ever has. Track W and Track O both delivered the text-as-foreground class at 6/6. `ACCENT_EVIDENCE_CHANNEL` produced the only statistically significant accent improvement in the campaign. Slot-economics halved the distance to an exact human correction while provably taking nothing away. All five ship OFF or park. All five died on movement counts. **Not one of them had its destinations put to a reviewer.**

Meanwhile 44 written reviewer requests remain unsatisfied, 22 of them on artworks whose "strong" status is exactly what made them untouchable.

The mechanism of the loss is not that the rule was too strict in the abstract. It is that **the guardrail set was assembled from verdicts that could not bear the weight put on them.** A "strong" grade on an artwork where only one palette was ever shown says the palette is good. It does not say every other palette is worse. The campaign read it as the second, 32 times over in the warehouse and 8 more times on fixtures with no warehouse record at all. Two arm authors wrote down, in their own honest-assessment sections, that they were killing their work on a rule rather than a judgement. They were right to flag it.

So the practical answer: **the rule change buys back about 55 items, of which maybe 15 are worth an arm, and 5 are worth an arm this month.** That is not "most of the possible progress". It is more than a year of parked work on exactly the complaints that are still open. Start by re-deriving mover sets against current verdicts — six mechanisms have shipped since most of these arms measured, and several casualty lists are stale in the direction that helps.

---

Working evidence is in the session scratchpad if you want to check any of it: `verdict_digest.txt` (full per-artwork history with hexes), `asks.txt` (all 66 reviewer corrections), `unmet_asks.txt` (the 44), `guardrail_audit.txt` and `casualties2.txt` (every named guardrail cross-checked against the warehouse), and `branchdocs/` (the 29 un-merged branch records extracted as plain files).
