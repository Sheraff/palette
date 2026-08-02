# Field guide fact-check — full verdict record

Audit of `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md` **revision 1** (the draft written from
the orchestrator's working memory) against the repository's primary sources, 2026-08-02.

**Authority order used.** `research/v2-3/test/configuration.test.ts` (pinned constants with
provenance comments) → `research/v2-3-eval/data/verdicts.jsonl` (495 records) →
`research/v2-3-experiments/*/` (EXPERIMENT.md, LEDGER.md, PINNING.md, REPORT.md, reports/, data/) →
`research/v2-3-eval/TRACK_CHARTER.md` and `research/*.md` postmortems → agent worktree branches
(`git branch -a | grep worktree-agent`) → `git log`.

**Method.** Every checkable claim — number, named constant, attributed quote, blast radius, null
result — was located in a primary source and classified CONFIRMED / CORRECTED / UNVERIFIABLE.
Where sources disagreed, the higher-authority one governs and the disagreement is recorded.

**Headline counts.** ~80 confirmed · 34 corrected · 12 unverifiable · 4 outright contradicted.

**Status column.** Revision 2 of the guide has since absorbed a subset of these. Each item is
marked `[applied in rev 2]` or `[still open in rev 2]` so the orchestrator can see what remains.

---

## 1. CORRECTED

### Campaign framing

**1. §intro "full corpus (~7,600 artworks)" → 7,587 files but 6,941 *distinct* artworks.**
`[still open in rev 2]`
Every cover is stored at two resolutions, so the artwork count is ~9% lower than the file count.
`configuration.test.ts:689,1133`; `background-fidelity/INTEGRATION.md:35`;
`apca-zero-floor/EXPERIMENT.md:13`.

**2. §intro "about forty experimental arms" → 67–68 distinct experiment directories.**
`[still open in rev 2]`
35 exist on trunk; the rest are branch-only. Verified with
`git ls-tree -d --name-only <branch> research/v2-3-experiments/` across all 59 `worktree-agent-*`
branches.

**3. §intro "from 70.6% to a measured ~97%" — both endpoints real, but not the same measurement.**
`[still open in rev 2]`
70.59% = 24 of 34 at-least-acceptable,
`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:44` (measured 2026-07-30,
commit `23e5598`). That file states at `:30-32` that the 34 are "a hand-picked stress corpus, not a
representative population sample and not a clean holdout." The ~97% is 58 of 60 over fresh unbiased
artworks (`calib-batch-1a/1b/2/3/4/5`). Presenting them as one trajectory is unsupported.

**4. §intro/§4.9 "n=60 unbiased calibration" → n=60 records but only 29 of the 58 distinct
artworks were never-reviewed.** `[partially applied in rev 2 — the noise band is now disclosed in
§12; the repeat fraction is not]`
Computed directly from `verdicts.jsonl`: the six `calib-batch-*` batches hold 60 records over 58
distinct images; 2 images repeat within the calibration set and **29 of the 58 already carried a
verdict from an earlier batch**. So the calibration is ~50% repeats by design (§4.13's repeats
mechanism) — which is the right design, but "unbiased n=60" reads as a fresh draw and is not one.
The fresh half grades 29/30 acceptable-or-better (16 strong, 13 acceptable, 1 weak-fallback).

**5. §2.10 "arms of which 21% were revivable wins" → 36 of 168 *items* (21%) classed *revivable*.**
`[applied in rev 2]`
"Revivable" means killed on movement counts with destinations never shown — not confirmed wins, and
items rather than arms. `graveyard-audit/REPORT.md:17,143`. Revision 2's reframing ("most of it
produced closure rather than recovered wins") matches the report.

### Architecture

**6. §3 post-winner pass order is wrong.** `[still open in rev 2]`
Actual order in `research/v2-3/src/internal/palette.ts`: `selectWinner` (:480) →
`applyGradientSupport` (:493) → **`restrictTextRoleToStrongestClaim` (:499)** →
**`applyRampMidpoint` (:552)** → `repairZeroContrastPairs` (:554). Text-role restriction runs
*before* midpoint insertion, not after. There is also **no post-winner "gradient color refinements"
pass** — band-local endpoint refinement runs during candidate generation, and the outward endpoint
walk is not in trunk at all.

**7. §3 "149 artworks moved to fix 14" — units mixed.** `[applied in rev 2, now "~149 … to fix 15"]`
It is 149 movers : 15 defect-carrying **files**, or 148 : 14 distinct **artworks**. The 10:1 ratio
holds either way. `apca-zero-floor/reports/blast-radius.txt`, `EXPERIMENT.md §7`. Separately, "the
final-winner stage moved exactly the 14" describes the pre-midpoint-protection config; the current
fg-surface repair moves **23**, still exactly the defect set with zero cascade (`EXPERIMENT.md §15.4`).

### Evidence inventory (§5)

**8. "Border clearance vs interior margin (75/25) — fields own borders; marks float."**
`[still open in rev 2]`
Weights confirmed (`palette-core.ts:1094-1097`, pinned `configuration.test.ts:966-970`), but the
vector asks whether a *component* sits inside the frame rather than running off it. It is a
region/component observation, not a field-vs-mark test.

**9. "The `localContrast` term alone is live on every artwork."** `[still open in rev 2]`
localContrast is the only one of the five accent weights that reached the **cliff bucket**. "Live on
all 154" is true of all five and of many other terms. `configuration.test.ts:1065-1066`.

**10. "one 20-line block that contains 12 of the codebase's 17 strongest cliffs."**
`[still open in rev 2]`
It is 12 of the **17 tier-B pin candidates**, the pinnable subset of tier-B's 33 anonymous-literal
cliffs; tier A found 13 more among named constants (~46 measured cliffs in total).
`tier-b/LEDGER.md:190-192` (branch `worktree-agent-aa68beee55b87a715`);
`configuration.test.ts:991-992`. The enclosing function `buildRegionObservations` is ~87 lines; only
the feature block is 20.

**11. "Authority symmetry … `carriesIdentityDirection` both ways."** `[applied in rev 2]`
That identifier (`base-scoring.ts:395`) has one call site and only ever *credits*; it is
deliberately one-directional. The genuinely two-way rules are `TEXT_DEMOTION_EVIDENCE =
"strongest-claim"` and `IDENTITY_COVERAGE_DIRECTIONS = "one-hue-one-direction"`. Revision 2 drops
the identifier and keeps the principle, which is correct.

**12. "artwork-salience match (39% of accent corrections)" → superseded to 19/39 = 49%.**
`[applied in rev 2]`
39% is the first-pass estimate over 41 accent-changing corrections
(`contextual-accent/EXPERIMENT.md:198`); the re-audit puts the class at 19 of 39, the largest class
(`accent-salience/EXPERIMENT.md:48-55`, branch `worktree-agent-a74f2c207a510d87a`). The same arm
also refutes the original framing of it as "a ranking question" — only 5 of 19 were reachable.

**13. §5 vividness — "deleted accents on 31.5% of the corpus" → 31.5% *of its movers* ≈ 13% of the
corpus.** `[applied in rev 2]`
988 of 3,136 movers; movers were 3,136 of 7,584 = 41.4%. `revival-wave/INTEGRATION.md:8-33`
(branch `worktree-agent-afe740b0c2fd21ea2`).

> **Self-correction.** My first pass also called "rejected 7:1 in review" wrong. It is **right**.
> I had checked only `rw-batch-vividness` and missed the later batch. Verified record-by-record in
> `verdicts.jsonl`: `rw-batch-vividness` = 4 for `m-vivid-max`, 1 for `trunk`, 3 no-preference
> (the *direction* endorsed 4:1); `rw-batch-collapse` = 7 for `trunk`, 0 for `m-vivid-max`, 1
> no-preference (the *implementation* rejected 7:1, commit `d5411ca`, the batch that closed the
> mechanism). Revision 2's split of direction-vs-implementation is the accurate account.

**14. §5 "every constant tied to absolute pixel areas broke under resolution changes."**
`[applied in rev 2 — now framed as contested/unresolved]`
See §3 below; this is one of the four outright contradictions.

### Gradients (§6)

**15. "Band-representative endpoints are the average of each end's band."** `[applied in rev 2]`
They are the **exact source pixel** in the band nearest the fitted line's colour at t = 0.1/0.9,
from the top-scoring family. `palette-core.ts:3354-3363,3386-3392`. Revision 2's "an exact source
pixel … chosen as the band pixel nearest a fitted target" is correct.

**16. "endpoint extension ended at an even record" → 3 W / 3 L / 6 T (n=12), which later became
4 W / 3 L / 7 T.** `[applied in rev 2, correctly]`
The 8 W / 3 L / 9 T headline was inflated by the silent whole-image fallback; the honest transferred
record is 3/3/6 (`gradient-endpoint-extension/EXPERIMENT.md:858,1037,1048-1054`, branch
`worktree-agent-a8d192a0b239b8ae6`).

**Correction to this audit's first pass.** I originally reported that "4W/3L/7T matched no source".
It does. The re-adjudication the arm's own file never recorded is in the warehouse:
`verdicts.jsonl:494-495` (`zc-batch`, 2026-08-01T22:53, labels `geeg-off`/`geeg-fixed`) — `0014adcd`
prefers `geeg-fixed`, graded strong = **win**; `0010b864` no preference, both strong = **tie**.
12 transferred + 2 re-adjudicated = 14 = 4 + 3 + 7. The third flagged item `00034b1c` was withdrawn
as a no-op (`EXPERIMENT.md:1040-1042`), which is why the total is 14 and not 15. Revision 2's
sentence is correct as written.

**17. "found their requested carpaccio-red stop from pixels alone."** `[still open in rev 2]`
Overstated. The arm selected `#f84080` (Atomic Pink), ~ΔE 12 from the requested Carpaccio `#e33665`,
on endpoints trunk cannot produce (that artwork publishes `gradient: false`), and the evidence is
selection-only. `ramp-midpoint-insertion/EXPERIMENT.md §3.1`.

**18. §6 render stops are preview-only.** `[still open in rev 2]`
All five numbers confirmed (`research/v2-3-eval/review-app/app.js:52-54`, batch-34), but the shipped
contract is `backgroundPosition: 0, surfacePosition: 1` (`policy.ts:59-62`). The guide presents
preview geometry as the render contract.

**19. §6 "principal axis of the field domain's pixels" → of those pixels' *OKLab colours*.**
`[applied in rev 2]`
A 3×3 colour covariance, not a spatial axis. `gradient-endpoint-extension.ts:211-232` (branch
`worktree-agent-a8d192a0b239b8ae6`). The "restrict to the field's own pixels, not the whole image"
half was already right.

### Canaries and hygiene

**20. §8.2 "290 of 298 under another config" — numbers right, attribution wrong.**
`[still open in rev 2]`
That config (`accent-only`) relocated the zero onto the **foreground**, not the accent.
`apca-zero-floor/EXPERIMENT.md §10`.

**21. §8.5 "a second, shipped, 14%-of-the-image reconstruction bug."** `[still open in rev 2]`
14% is the **relative** error; the absolute gap is **12.0 percentage points of the image** (builder
0.8726 vs rebuild 0.7524 on `0013e778`). `gradient-endpoint-extension/EXPERIMENT.md:952-982`. The
guide faithfully reproduces the source's own loose unit, so this is a source defect the guide
inherited.

**22. §8.9 "One extraction in ~200."** `[still open in rev 2]`
The source says the rate is "on the order of **1 in 10²**" — 1 of 15 trials in the bare-call
sequence, with a separate 150-run repeat finding none.
`gradient-endpoint-extension/EXPERIMENT.md:633-648`.

**23. §7 "the Pareto filter can veto the comparator's #1 choice" — which measurement?**
`[applied in rev 2]`
5 of 34 originally (`adversarial-logic/REVIEW.md:459`), re-measured to 1 of 34
(`VERDICTS.md:316-318`, `orelsan`). Cleanest isolated case: `carrier-ranking/ROUND-3.md:9-31`
(`0cd48f` is compare-order #1 and maximises `relationUtility`, yet `paretoMember: false`).

**24. §10 "near-identical fg-bg … raw APCA 1.4" — value right, pair wrong.** `[still open in rev 2]`
Raw 1.4 is a foreground/**surface** pair (`099b3a`, `0a9ef1`); the fg/background extreme is raw
**0.469**. And the shipped repair for `099b3a` is a mid-tone `#929292`, not a dark↔light flip — a
light flip collided with the midpoint. `apca-zero-floor/EXPERIMENT.md`.

**25. §10 "zero-variant crash appeared only on artwork #~7,000."** `[still open in rev 2]`
Wrong twice. The artwork is **#4,732 of 7,550**, and **trunk never crashes**:
`zero-variant-fallback/FIX.md:22` calls it "a latent landmine, not a live bug"; it fired only in an
experimental ON arm.

**26. §11 "Both perf passes (1.86× total)" — undercounts the passes, and the source disowns the
product.** `[applied in rev 2, which now counts four passes at ≈5.7×]`
There were **four** byte-identity-proven speedup passes, not two: 1.90× (`adversarial-arch/
HYGIENE.md:52,59`, 101 images, corpus hash identical), 1.61× (`track-q/EXPERIMENT.md:123`, 108
artworks, 0 winner differences), 1.55× (`perf-pass/EXPERIMENT.md:10,147`) and 1.20×
(`perf-pass-2/EXPERIMENT.md:5,244`). Product = 5.69. But `perf-pass-2/EXPERIMENT.md:11` disowns even
the two-pass product — "measured against different bases on a machine whose load changed between
them, so that product is an **estimate and not a measurement**" — and the four-figure compound
inherits that caveat four times, across four corpora (101/108/10/10) and two different metrics
(wall clock, including one warm-cache run the arm itself caps as "1.60× is an upper bound", vs
interleaved process CPU). Nothing but the revision-2 ledger computes the product.

**27. §11 "two modules whose 75 sites moved nothing."** `[still open in rev 2]`
`field-transition.ts` + `endpoint-refinement.ts` hold 75 tier-B sites and produce **2 load-bearing
sites and no cliffs** — not literally nothing. `tier-b/LEDGER.md:188-190`.

**28. §2.1 "~0.7 s/artwork" not supported by the perf record.**
`[revised in rev 2 to "0.7 s median / 1.29 s mean" — see residual list]`
The post-optimisation bench (10 artworks, algorithm CPU only, decode excluded) totals 10,479 ms →
**~1.05 s mean, ~0.79 s median**. `perf-pass-2/EXPERIMENT.md:230-244`.

**29. §4.3 "7 of 7 checkable corrected accents were already in the candidate pool" — retracted by
the campaign.** `[applied in rev 2]`
`accent-salience/EXPERIMENT.md:33,38,180,478`: "The inherited '7 of 7 reachable — a ranking problem,
not generation' does not reproduce. On the salience class it is **5 of 19 (26%)**" — the original
dumps came from a stale label cache. The guide's inference ("corrections mostly reveal ranking
failures, not generation gaps") was inverted for that class.

**30. §2.4 "the one we built inside candidate generation broke neutrality" — there were two.**
`[applied in rev 2]`
`gradient-fit-generation`'s `fieldPairDomains` (32 of 63 endorsed-flat flipped to gradient, 0
reverse) and `chromatic-surface-supply` (**24 gradients prevented vs 1 allowed**, 1,337 movers =
17.63% of 7,582; `chromatic-surface-supply/SWEEP.md:19,48`, branch
`worktree-agent-ae3c857a6e3b14f80`). Also, "every mechanism we built this way was provably neutral"
holds only for the after-the-boolean class: `background-fidelity` moved 2 booleans in 7,587 and
`accent-evidence` 9 in 7,550.

**31. §9 "moved 2 artworks corpus-wide, both adjudicated favorably."** `[still open in rev 2]`
One of the two **drew** on its shipped form (`00093ce4` on trunk endpoints, preference null).
`verdicts.jsonl:467-470`.

**32. §9 "Repeats hold. Re-graded artworks keep their grades across weeks of trunk movement."**
`[still open in rev 2]`
The campaign ran ~2–3 days, and §4.9/§12 themselves record two tail casualties.

**33. §2.2 "we used ≥0.1% of the artwork within one quantization cell."** `[still open in rev 2]`
The floor is real (`RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION = 0.001`, `ramp-midpoint.ts:55`) but it
is the ramp-midpoint module's support floor, not a global rule.

**34. §5 "39% of accent corrections" denominator.** `[applied in rev 2]`
41 accent-changing corrections out of 250 warehouse records
(`contextual-accent/EXPERIMENT.md:198`), hand-labelled by stated reason.

---

## 2. UNVERIFIABLE

Each was searched across all 495 `verdicts.jsonl` records (`.notes` is the only prose field), every
`research/**/*.md` and `*.ts` on trunk, and the worktree branches.

**35. §1 "slight distinguishability loss there is not a huge deal"** — paraphrase presented as a
quote. `[still open in rev 2]` True wording (`verdicts.jsonl:69`, `doja.jpg`): "the accent is a
little bit harder to distinguish, which is not a huge deal. It won't be used for text, it will be
used for icons or UI stuff."

**36. §2.1/§5 "incomplete artwork identity" as a reviewer quote** — it is a **controlled-vocabulary
failure tag** from the pre-v2-3 protocol (`research/src/complete-palette-review-v2.ts:23`); the v2-3
UI spells it `incomplete-identity`. Zero reviewer utterances. `[still open in rev 2]`

**37. §2.6 "the human's squint test"** — "squint" has zero hits in the warehouse.
`[still open in rev 2]`

**38. §6 "found a real color and destroyed the palette"** — zero hits repo-wide.
`[still open in rev 2]`

**39. §4.11 "if we have improvement ideas, we should at least try them"** — zero hits.
`[still open in rev 2, now §4.15]`

**40. §4.12 "pseudo-intellectual speech that is hard to understand"** — zero hits ("intellectual"
appears nowhere). `[applied in rev 2 — the quote is dropped, the lesson kept in §4.16]`

**41. §4.10 "a lot of these are artworks I personally dislike"** — zero hits. The veto *mechanism*
is real (tag `artwork-veto`, e.g. "can we remove this artwork from the samples? it's bad").
`[applied in rev 2 — the quote is dropped]`

**42. §11 "don't keep performance attempts that don't actually measure any real improvement"** —
zero hits. The behaviour is documented (`perf-pass-2/EXPERIMENT.md:10`, "one reverted for measuring
neutral"). `[still open in rev 2]`

**43. §5 "one hue, one direction" as a reviewer quote** — it is the value of the config constant
`IDENTITY_COVERAGE_DIRECTIONS`. The reviewer's actual words (`verdicts.jsonl:34`, `skap.jpg`): "I'm
not sure we should be spending both surface and accent on the green hue." `[still open in rev 2]`

**44. §8.8 "9 of 30 panel items were the wrong file, one 'byte-identical' artwork was actually a
four-role mover"** — neither number has any source. The multi-rendition hazard class itself is real
and documented. `[still open in rev 2, now §8.10]`

**45. §12 "five mechanism classes closed by decisive nulls"** — no source enumerates five. (The
first half, "eight-plus mechanisms integrated verdict-gated", is confirmed conservatively: 14 v2-3
integration commits, 12 explicitly verdict-gated.) `[still open in rev 2]`

**46. §3 "this vivid red is the artwork's signature and wants the accent" and §9 "even better if the
accent were X"** — invented illustrative examples that read as verdicts. Neither exists.
`[still open in rev 2]`

---

## 3. OUTRIGHT CONTRADICTED BY A PRIMARY SOURCE

**47. §6 "Contrast sampled along the continuum, not at 5 points — 5-point sampling missed real
crossings."** `[applied in rev 2, explicitly marked as a draft-1 correction]`
Trunk still samples 5 points (`policy.ts:63`: `[0, 0.25, 0.5, 0.75, 1]`). The continuum arm found
the sampled minimum **exact corpus-wide**, **0 crossings missed**, **1 phantom invented**, and
explicitly recommends against replacing it: "Do not replace the sampled minimum/mean with continuum
equivalents." `track-b4/EXPERIMENT.md:50-70,113-116`.

**48. §5 "every constant tied to absolute pixel areas broke under resolution changes."**
`[applied in rev 2, reframed as contested]`
Track W measured the one such constant and found the opposite: `mark.minimumComponentPopulation =
12` should stay **absolute**, because compression noise is a pixel-level phenomenon that does not
scale — "The absolute 12 is right, and this measures it rather than assuming it."
`track-w/EXPERIMENT.md:113-123`. The bullet's second half — encoding-level divergence, "just
rescale the constant" doesn't work — is confirmed by `resolution-pairs/EXPERIMENT.md §(c)`.

**49. §4.2 "16+ item sessions caused fatigue."** `[applied in rev 2 — fatigue demoted to "the third
reason", the 16+ claim dropped]`
No batch above 10 items was ever built (all 70 batch files are 4–10; `make-batch.ts:18` states the
invariant), and "fatigue" appears nowhere in the eval or experiment trees. The claim described an
experiment that was never run.

**50. §11 "measure the speedup honestly (wall clock, controlled load)."**
`[applied in rev 2 in §11 — but rev 2's new §8.16 reintroduces the contradiction; see residual list]`
Both perf arms did the opposite, deliberately: "All figures are `process.cpuUsage()` (user+system),
**never wall clock**" (`perf-pass-2/EXPERIMENT.md:227`), with A/B interleaved at process granularity
so load drift is charged to both arms equally.

---

## 4. CONFIRMED

Roughly 80 checkable claims verified. Every constant the guide names checks out. Grouped:

**Pinned constants and weights.** `FAMILY_BIN_STEP` = 0.04 and its 97%-of-palettes blast radius
(`configuration.test.ts:742,780`) · ~1,500 candidate cap · 4 obligation seats
(`ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations`, `:555`) plus exactly three
reserved-seat patches · `log2(population+1)/8` (`REGION_RESOLVED_POPULATION_LOG2_SCALE = 8`, `:947`)
· `sqrt(population × connected)` · `REGION_BORDER_INTERIOR_WEIGHTS` 0.75/0.25 (`:966-970`) ·
`ACCENT_ROLE_EVIDENCE_WEIGHTS` 0.29/0.24/0.25/0.14/0.08 term-for-term (`:1067-1074`) plus
chromaScale 0.18 · `FIELD_SCORE_WEIGHTS` 0.28/0.22/0.22/0.13/0.15 term-for-term (`:1027-1034`) ·
`distinctness.sameColor` = 3.3 tagged `[REVIEWED]`, batch 12, seven bracketing midpoint judgements
(`:609-626`) · `RAMP_EXCURSION_BAR = 2.5 × sameColor` (`:535`) · `ENDPOINT_BAND_SAMPLE_POSITIONS`
{low 0.1, high 0.9} (`:1045`) · the 0.1% support floor (`ramp-midpoint.ts:55`).

**APCA.** The dead band — no reported magnitude between 0 and 7.300001 over a 16,008,001-pair sweep
(`configuration.test.ts:1152-1166`) · `apcaClampRawContrast(9.999) = 0` and
`apcaClampRawContrast(10) = 7.3` (`:1116-1117`) · min raw 1.19 · **8 fg-midpoint and 37
accent-midpoint violations** (`:1182-1183`) · four-role-pair + stop-colour checking
(`withMidpointPairs`, `:1184-1191`) · the dormant repair layer with an empty coverage set awaiting
one decision (`:1128-1150`) · 13 of 15 relocation onto the accent · `contrast.hardMinimum = 0`
(`:602`).

**Gradients.** The 0.1/0.9 rationale **was** written after the fact — bare literal in `83e7ca5`
(2026-07-27), named and rationalised in `a99ec76` (2026-08-01), a 5-day-6-hour gap · −5.8%
aggregate for re-aiming to 0.0/1.0 · the three-part extension guard · 42% of midpoints outside their
endpoints' L-span (16 of 38) · midpoint-insertion blast radius of exactly 2 artworks
(`configuration.test.ts:522-523`) · the add-only rationale · the grey-mauve found at t = 0.5 · the
five render-stop numbers (`review-app/app.js:52-54`) · 17/18 on the reviewed gradient-boolean set ·
the silent fallback at 8 of 83 = 9.6% · the `pairedDomain` self-check · the negative anchor
`0014adcd` designed to refute the excursion bar and surviving (`configuration.test.ts:531-533`).

**Sweeps and performance.** 162 two-clause separators over 16 axes and 680 candidate thresholds on 8
adjudicated artworks, with **zero** single-clause separators
(`gradient-endpoint-extension/EXPERIMENT.md:703,809-827`) · 50% vs 17% load-bearing
(`tier-b/LEDGER.md:23`) · "five times cliffier" as the *cliff* rate, 9.6% vs 1.8%
(`configuration.test.ts:893-894`) — both figures are correct and describe different metrics ·
~1,100 sites (735 + 343 = 1,078) · 8 of 33 duplicated-comparator artifacts
(`tier-b/LEDGER.md:223,267`) · 47% skip with 335/335 agreement across six orderings
(`sweep-economics/REPORT.md:18-19`) · 42.2% on the live tier-B sweep (`tier-b/LEDGER.md:130`) ·
the 108-artwork gate = 37 panel + 34 scrambled + 37 off-panel (`perf-pass/EXPERIMENT.md:29-35`) ·
`toLabBuffer` added by perf pass 2 (`ee90675`) and later swept as a tunable because the exclusion
allowlist is name-keyed (`tier-b/LEDGER.md:236-250`) · power iteration seeded with the chord
(`gradient-endpoint-extension.ts:211-212`).

**Process and warehouse.** The six provenance tags, verbatim (`configuration.test.ts:83-90`) ·
4–10 item batches with per-item content-hash shuffling and a never-served key · ~60 review batches
(67 distinct batch files) · ~495 verdict records · n=60 calibration (6 × 10) · 21% graveyard
revivability and "the expensive quarter" (`graveyard-audit/REPORT.md:17,143`) · 55.85% relabeling ·
the 40-quantity ordering null (`comparator-ordering/EXPERIMENT.md:8,510-516`) · the sign-inverted
null (`:555-561`) · the 8:2 → plausibly 9:1 confound (`cs2-batch`, tallied record-by-record) · two
tail casualties.

**Charter-backed design constraints.** Full-resolution processing, never snapping to a lone pixel,
Lc ≈ 9 outputs graded good, the hard minimum as a caller parameter defaulting to 0, gradient
neutrality measured in both directions, and "never move TO a known-worse palette" — all six verbatim
in `research/v2-3-eval/TRACK_CHARTER.md:12-16,32-40`.

**Reviewer quotes verified exact or near-exact in `verdicts.jsonl`.** "we're making an algorithm for
me" (:8) · "shadows on the same surface" (:42) · "the sky and the grass … they are just different
areas, different surfaces" (:44) · "we should consider them as the same color" (:38) · "it's pink on
blue I have no issue with that" (:8) · "white on white for a significant width"
(`configuration.test.ts:1172-1174`) · "doesn't really belong to the artwork itself" (:54) · "we end
up with black olive as both the surface and the accents" (:185) · "that doesn't feel like part of
the artwork" (:183) · "I was genuinely impressed by [these four] — those are truly hard hard
artworks, and the palettes seem very faithful to the vibe" (:93-96, four records) · the confounded
verdict "For this reason alone I have to give the upper hand to option A but we should really
investigate this APCA contrast failure before we actually take this comparison result at face value"
(cs2-batch).

---

## 5. Two structural notes

**Branch-only evidence.** Three of the guide's most quotable numbers — 55.85% relabeling, the
40-quantity ordering null, and the retracted 7-of-7 — live **only on unmerged worktree branches**.
Nothing on trunk can audit them, and revision 2's §8.15 ("branch-only experiment records made
provenance undiscoverable") names this as a known defect.

**Where the failures cluster.** The gradient and colour claims are solid and sourced; the process,
canary, and reviewer-voice claims in §4, §8 and §11 are where the unsourced material concentrates.
Nine of the twelve unverifiable items are attributed quotes.
