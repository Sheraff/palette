# Objective-structure repairs: three measured toggles

Trunk `9063f6e` (the 1.55x performance pass; runtime behaviour identical to `4a5c37d`, which is where
the review that set this arm was measured). Source of the three hypotheses:
`research/v2-3-experiments/adversarial-objective/REVIEW.md` on branch `worktree-agent-aef646a0e5cc45511`
(commit `9f1b172`), avenues **A2**, **A1** and **A3**. That review's methodology — a Python
reimplementation of `dominates` and `compareEvaluations` validated at **0/119 mismatches** over ~170k
evaluations — and its exact stated predictions are the acceptance bars used throughout.

## Result in one line

One of the three repairs ships. It changes nothing.

| repair | review avenue | prediction | movers /171 | verdict-carrying REAL | recommendation |
|---|---|---|---|---|---|
| **T1** envelope compares coverage-free quality | A2 | **held** | **0** | – | **ON** (shipped) |
| **T2** `dominates` guards exactly what `relationUtility` sums | A1 | **failed** | 21 | 3 FIX / 8 REG | **OFF** |
| **T3** retire the leximin fallback | A3 | **failed** | 7 | 0 FIX / 3 REG / 1 equal | **OFF** |
| — joint (all three) | — | — | 26 | 3 FIX / 9 REG / 1 equal | **not recommended** |
| — `or-ship` (T1 only) | — | — | **0** | – | **this is what ships** |

The recommended configuration is byte-identical to trunk on every one of the 171 images measured.

## Corpus and method

**Corpus (stated per the charter's corpus trap).** 171 images, all read from the shared checkout
`/Users/Flo/GitHub/palette` — `images/` plus the hex roots `00/`..`14/`. The arm's worktree `images/`
holds only `-scrambled` decoys and was never used for a measurement. Strata (an image may be in
several):

| stratum | n | source |
|---|---|---|
| verdict-carrying | **129** | latest verdict per artwork from `verdicts.jsonl` (250 records, 131 distinct artworks; 129 have a recoverable batch path present in the shared checkout) |
| review fixtures | 34 | `research/v2-3/test/review-fixtures.ts` |
| `-scrambled` decoys | 34 | reported separately, never mixed into a verdict figure |
| off-panel | 37 | `research/v2-3-eval/data/offpanel-manifest.txt` |

Latest verdict per artwork is authoritative (charter, "Verdict recency"). The guardrail set was mined
from the live warehouse at arm start, not inherited: 98 `strong`, 27 `acceptable`, 3 `weak-fallback`,
3 with no verdict.

**Method.** Every measurement is **end to end** — `extractPaletteDetails` over the real pipeline,
comparing the *published* winner (four role hexes, gradient flag, both collapse flags, and the
source-supported midpoint). This is deliberately a stricter frame than the review's, whose
counterfactuals are all at the ranking layer and 98% concordant with published output; the review
flags this itself ("must be re-measured end to end before anything ships"). Six configurations ×
171 images, 4 worker processes with `VIPS_CONCURRENCY=1`, ~45 s per configuration, one result file
per image so the sweep is resumable.

**Machine budget.** Never more than 4 workers, one configuration at a time, `VIPS_CONCURRENCY=1`.

## What was built

Three flags in `OBJECTIVE_REPAIRS` (`research/v2-3/src/internal/winner-scoring.ts`), each defaulting
to the incumbent so the object is inert until one is flipped, plus a research override threaded
exactly like the existing `gamutOverride` so a harness can sweep them over the real pipeline instead
of a reimplementation of it.

### T1 — `envelopeBasis: "coverage-free"` (A2)

`WinnerEvaluation.qualityUtility` is **not** `qualityUtility(quality)`: it is assigned the
coverage-augmented `utility`, carrying `GAMUT_COVERAGE.weight * gamutCoverage`. Both
`promotionEnvelopeUtility` and the `maximumQualityLoss` check in `winner-selection.ts` read that
field, so the `field-axis-neutral` envelope — moved to that mode *specifically* to stop being
"sensitive to the claim axis's scale rather than to treatment quality" — still contained
field-derived credit, since `GAMUT_COVERAGE.scope` is `"field-and-accent"`.

The fix separates the two quantities by name and construction, as the review's avenue asked:
`axisUtility` is the eleven-axis weighted sum, `qualityUtility` keeps its meaning but now documents
what it actually is, and each of the three envelope call sites names which it wants.

### T2 — `dominationVocabulary: "objective-terms"` (A1)

The objective sums thirteen quantities; `dominates` guarded twelve. The two it could not see —
`gamutCoverage` and the unauthorized part of `identityGain` — are the two most recently added
criteria, each having entered through a different integration mode chosen case by case.

The repair makes the coupling **structural** rather than remembered: a single `OBJECTIVE_TERMS` list
declares every term with its weight and its domination quantum, `relationUtility` is *built* from
that list in one pass (the three nested sums `axisUtility` / `qualityUtility` / `relationUtility`
fall out as prefixes), and `dominates` guards from the same list. A term cannot be added to one
without the other. No new constant is introduced: each term is guarded at the quantum the codebase
already assigns it — the axes at `evidenceResolution`, `gamutCoverage` at `evidenceResolution` (what
`integration: "axis"` already uses), `identityGain` at `utilityResolution` (what its authorized half
is already guarded at).

**The list is now shared even with the toggle off**, which is the durable part of this change: the
objective is constructed from `OBJECTIVE_TERMS` unconditionally, so the drift cannot recur silently
whatever the flag says.

### T3 — `leximinFallback: "retired"` (A3)

Deletes the sorted-axis-level comparison from `compareEvaluations`, falling through to the per-axis
lexicographic stage (which at least respects the frozen, reviewed axis order) and then to ASCII.

## Verification that OFF is trunk

Two independent checks, because the T2 work rewrote how `relationUtility` is computed:

1. **All 34 frozen review fixtures pass byte-for-byte** (`parity.test.ts`), together with
   `architecture.test.ts` and `configuration.test.ts` — 49/49.
2. **Full-corpus trunk diff.** `research/v2-3/src` was replaced with a clean `9063f6e` checkout, the
   whole 171-image corpus re-extracted, and the result files compared against the repaired build at
   `or-off`: **identical, all 171**. The arithmetic reordering is bit-exact, as intended — the term
   list sums the eleven axes in `WINNER_QUALITY_AXES` order, then coverage, then identity, which is
   the same additions in the same sequence the three separate expressions performed.

**Determinism.** A forced full re-extraction of the joint configuration reproduced every figure in
this document, including all 26 movers and their hexes — stronger than the charter's one-image-twice
minimum.

**Typecheck.** `research/v2-3` and the arm's own tsconfig both clean.

## T1: prediction held; the defect is real and inert

> **Predicted (A2):** "≤ 2 artworks move … and `birdsofprey`'s promotion — documented as clearing by
> 0.0012 — either flips or its margin changes by an amount within the measured coverage spread.
> Either outcome is decisive: a flip confirms the envelope was riding on the leak; no flip bounds the
> defect as real-but-inert and closes it."

**Measured: 0 of 171 move.** Not one published winner changes — no fixture, no verdict-carrying
artwork, no decoy, no off-panel image.

That is the second branch, and it is only decisive if the leaked term is shown to be *live* rather
than absent. `envelope-probe.ts` measures the quantity the toggle actually changes — the margin by
which each candidate clears `maximumQualityLoss`:

| artwork | weighted coverage spread | mean margin shift | max shift | candidates whose **admission flips** |
|---|---|---|---|---|
| `birdsofprey.jpg` | 0.03425 | 0.00738 | 0.02262 | **94** (1182 → 1136 admitted) |
| `havana.jpg` | 0.04209 | 0.01111 | 0.02658 | **86** (1258 → 1190) |
| `loups.jpg` | 0.04208 | 0.00876 | 0.04208 | **102** (1208 → 1310) |

So the leak is large — margin shifts up to 0.027 against the 0.0012 by which `birdsofprey`'s reviewed
promotion is documented to clear — and it changes which candidates the envelope admits on every
artwork tested. It changes no *outcome* because the envelope has 3–6x headroom and the admitted set
is filtered again by `promotionEligible && earnedNativeTransition && decisiveCoverage > baseline`
before anything is selected. The ~90–100 candidates whose admission flips were never going to be
picked.

**Recommendation: ship ON.** The honest caveat is stated plainly: this carries **no accuracy
evidence and no human verdict**, because there is nothing for a reviewer to look at. Its case is
correctness — the alias is removed, the two utilities are two named fields, every envelope consumer
declares which it wants, and the class of "which utility is this?" error that already cost Track A a
full measured-reviewed-retracted round is closed at its second instance. Reverting it is
output-neutral today and re-arms the leak the moment `GAMUT_COVERAGE.weight` or `.scope` moves. A
reviewer who declines unreviewed policy changes on principle can leave it off at no measured cost
either way.

## T2: prediction failed — reported, not tuned

> **Predicted (A1):** "the first variant changes the winner on the 5 attributed artworks
> (`…000285d1`, `…001102263870`, `…0011c0148119`, `…00079d5a`, `horrorwood.jpg`) and on ≤ 3 others;
> `havana`, `slim`, `johns`, `0d5cdb`, `000e91d6` are **all unchanged**, because none of their prunes
> is attributed to an unguarded term."

| predicted | measured |
|---|---|
| `…000285d1` moves | moved |
| `…001102263870` moves | moved |
| `…0011c0148119` moves | moved |
| `…00079d5a` moves | **did not move** |
| `horrorwood.jpg` moves | moved (cosmetic, 2.0) |
| `havana.jpg` unchanged | **MOVED** — REAL, 24.8 |
| `slim.jpg` unchanged | **MOVED** — cosmetic, 1.2 |
| `johns.jpg` unchanged | **MOVED** — REAL, 21.4 |
| `…000d5cdb` unchanged | **MOVED** — REAL, 15.2 |
| `…000e91d6` unchanged | **MOVED** — REAL, 35.6 |
| ≤ 8 movers | **21** (16 verdict-carrying, 12 of them unpredicted) |

**All five predicted holds moved.** Per the arm's mandate this is where the work stops: the
prediction is reported as failed and the repair was **not** adjusted to make it pass.

**What it actually is.** T2 reproduces the pure-raw-domination trade the review had already settled
as **A5, "do not pursue"** — reached from a completely different direction, and slightly worse:

| named case | raw domination (review T3 table) | T2, measured here |
|---|---|---|
| `havana` | FIX | **FIX** — lands hex-for-hex on the endorsed `#375c77:#243a51:#eed076:#ee655f` |
| `000e91d6` | FIX | **FIX** — lands hex-for-hex on the endorsed `#383838:#1a1a1c:#fbf072:#f94d37` |
| `slim` | FIX | **not fixed** — cosmetic field drift only, foreground stays `#37c2eb` |
| `0d5cdb` | REG, dOKLab 15.2, grey `#c7c6c1` | **REG, dOKLab 15.2, grey `#c7c6c1`** |
| `johns` | REG, dOKLab 21.4, `#0e2340` / `#cfd4d8` | **REG, dOKLab 21.4, `#0e2340` / `#cfd4d8`** |

The two regressions are identical to the review's, hex for hex and distance for distance. The review
named `havana` + `0d5cdb` as "the cheapest reusable artifact this review produces" — a two-artwork
pre-filter every future frontier redesign should face before any sweep. T2 is a frontier redesign,
and the pre-filter kills it.

Overall on verdict-carrying REAL movers: **3 FIX / 8 REG**. The `johns` outcome is specifically the
light-grey-on-near-white failure that Track C measured, rejected and deleted a flag for once already.

**Recommendation: OFF.** The *invariant* is still worth having stated — `OBJECTIVE_TERMS` ships, and
the objective is built from it — but closing the gap is not free, and what it costs is reviewed
outcomes.

## T3: prediction failed — and it has no upside to weigh against the cost

> **Predicted (A3):** "exactly the 4 artworks `…0002881a` (strong), `…00066a61` (strong),
> `…0005597105` (strong), `…00113e35` (acceptable) can move, and no others — the stage is
> unreachable elsewhere."

| predicted | measured |
|---|---|
| `…0002881a` | **did not move** |
| `…00066a61` | **did not move** |
| `…0005597105` | **did not move** |
| `…00113e35` | moved |
| no others | **6 others moved**, 4 of them verdict-carrying |

All four predicted artworks are present in the corpus and were extracted under every configuration,
so this is not a coverage artifact.

The five verdict-carrying movers, against their latest verdicts:

| artwork | verdict | dOKLab | direction |
|---|---|---|---|
| `…0005a91812` | strong | 13.4 | **equal-cost** — trades one endorsed surface for another; the *latest* record (batch-31) endorses the `or-off` side |
| `…0010def2` | strong | 7.7 | **REG** — off an exactly-endorsed palette |
| `…0014cb7f` | strong | 6.3 | **REG** — off an exactly-endorsed palette |
| `…00113e35` | acceptable | 9.6 | undecidable — no endorsed sample; gains a source-supported midpoint |
| `slim.jpg` | strong | **26.5** | **REG** — foreground `#37c2eb` → `#f3b641`, moving *further* from the endorsed `#56676f` |

Plus the `nada` fixture, which **collapses its surface** (`#919dcd` → background), a structural
change of palette cardinality on a frozen fixture.

**0 fixes anywhere on 171 images.** The review flagged exactly this risk in advance — "the stage may
be doing accidental good, exactly as `authorizedIdentity` was found to be accidentally protecting
`slim`" — and the measurement found it, on `slim` again.

**Recommendation: OFF.** The criticism of the stage stands and is recorded in the source: it is an
egalitarian tiebreak nobody argued for, wedged between a utilitarian sum and a lexicographic order,
and it destroys axis identity by sorting. It is retained because deleting it costs reviewed outcomes,
which is not the same as it having been endorsed.

## Why both predictions failed — the reusable finding

Both failures have **one structural cause**, and it is not an error in the review's measurement. Its
comparator reimplementation is validated at 0/119 and its per-artwork attributions are correct. What
under-counts is the *inference* from a single-pair analysis to a mover set:

- **T2.** The review asked which term caused the **compare-top's** prune, and found 5 artworks whose
  prune was attributed to an unguarded term. But adding a guard only ever *removes* domination edges,
  so the frontier grows **monotonically** and the winner — the compare-order best among frontier
  members — can be replaced by **any** newly-admitted candidate that outranks it. Candidates ranked
  between the incumbent winner and the global compare-top are invisible to a prune attribution
  focused on the compare-top, and they are where 12 of the 16 verdict-carrying movers came from.
- **T3.** The review asked which stage separated the winner from its **frontier runner-up**, and
  found 4. But deleting a comparator stage changes the total order everywhere it is consulted:
  the initial sort, the frontier sort, the **zero-coverage reference pass** that decides
  `GAMUT_COVERAGE.fieldGuard`, and the **source-eligible sub-domain ranking**. A winner-vs-runner-up
  analysis sees none of those.

**The generalisation, for whoever runs the next structural counterfactual:** a ranking-layer
single-pair analysis bounds *which comparison* a mechanism decides. It does **not** bound *which
artworks move* when the mechanism is changed globally, because the pipeline consults the same
comparator and the same partial order at four places and re-ranks a second domain. Predictions of the
form "exactly these N can move" need the end-to-end replay, which costs 45 seconds per configuration
over the whole corpus and should simply be run.

## Guardrails, neutrality and the decoys

**Gradient neutrality — clean in both directions.** Across every configuration and all 171 images:
**zero** gradient flips, allowed or prevented. Two collapse changes (`nada` under T3,
`elephunk-scrambled` under T2) and one midpoint gained (`…00113e35` under T3).

**Hard guardrails.** Under the recommended configuration (`or-ship`) every guardrail is
byte-preserved, because every *output* is. Under the rejected `or-on` the guardrails break as
tabulated above; the review's own prediction said they would not, so the quoted prediction is
reported as broken rather than the guardrails re-negotiated.

**Decoys.** The 34 `-scrambled` images were extracted under every configuration and are reported
separately: 5 move under T2, 1 under T3, 6 under the joint. They are diagnostic only — scrambling
preserves the colour histogram and destroys spatial structure — and no verdict figure in this
document includes them. They are reported because a mechanism that moves decoys and nothing else
would be a warning sign; here they simply track the real movers.

**Joint composition.** The joint mover set is the union of the single-toggle sets minus exactly one
artwork: `…000c42c6` moves under T2 alone but **not** when T3 is also enabled — the two toggles
interact and cancel there. No artwork moves under the joint that moves under no single toggle.

## Configuration pins

`test/configuration.test.ts` gains one test pinning all three flags, tagged `[MEASURED]` each — the
honest tag, since this arm measured them and **no batch has adjudicated any of them**. Each pin
carries the prediction it was tested against, the result, and, for the two that ship OFF, an explicit
instruction not to re-tune them into passing. The `[MEASURED]` tag on `envelopeBasis` is doing real
work: it is measured to move *nothing*, which is the whole of its evidence.

## Review batch

`objective-repairs`, 8 items, `or-off` (trunk) vs `or-on` (all three repairs). Manifest with
per-item standing verdicts, honest notes and revert rules at
`research/v2-3-eval/data/results/or-manifest.json`; label sets are real extractions mirrored to the
shared checkout.

The batch deliberately compares against the configuration this arm **rejects**, because that is the
only thing a human can adjudicate — the recommended configuration produces no diff. Items 1–3 are the
three improvements (the entire case for enabling T2), items 4–8 the costs, including both named
guardrails and one artwork the review predicted as a payoff that measured as a cost.

## Uncertainty and what this arm did not do

- **T1 ships on zero verdict evidence.** That is stated rather than dressed up. It is a correctness
  repair with an empty measured blast radius, not an accuracy improvement, and the review's T6
  finding (layer agreement does not predict verdict strength; largest layer lift −0.019) applies to
  it as much as to the others.
- **Small n on the negative results.** T3's whole verdict-carrying evidence is 5 artworks and T2's
  improvement side is 3. The recommendation rests on the *direction* being consistent — every T3
  mover with a standing verdict is neutral or worse, and T2 breaks the two artworks the review
  independently identified as the blocking pair — not on the counts being large.
- **Endorsement matching is mechanical.** FIX/REG is an OKLab cost against endorsed samples, and an
  endorsed palette is one a human would endorse, never the unique right answer. Two batch items
  (3 and 6) carry conflicting or multiple endorsements and are flagged in the manifest rather than
  scored silently.
- **Not attempted:** any tuning of T2 or T3 after their predictions failed; A4 (the T1a compare-band
  quantization, which the review itself expects to be high-churn and outcome-neutral); and
  `baseQualityUtility` in `compareTransitionCandidates`, which still reads the coverage-inclusive
  utility. That last one is deliberate and documented — it is a *ranking* term, not an envelope, and
  the review's aliasing claim is specifically about the envelopes. Changing it is a separate,
  unmeasured question.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/objective-repairs/sweep.ts --workers 4
node --no-warnings --experimental-strip-types research/v2-3-experiments/objective-repairs/predictions.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/objective-repairs/analyse.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/objective-repairs/envelope-probe.ts \
  images/birdsofprey.jpg images/havana.jpg images/loups.jpg
```

`data/` (six configurations × 171 winner files) is regenerable in ~5 minutes and is gitignored.
