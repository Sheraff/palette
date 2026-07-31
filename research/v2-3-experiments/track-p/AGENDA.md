# Track P — De-fitting agenda

Ranked proposals for replacing forced constants with generic mechanisms. Each entry states the
constant(s), why the current form is a forcing, and the *direction* of a generic replacement —
continuous evidence, a derived quantity, or "more anchors needed".

Ordering is by (degrees of freedom removed) × (evidence currently missing), not by ease.

---

## The structural finding that frames everything below

The runtime carries **~880 fitted constants**. The entire human record available to justify them is
**104 verdicts over 63 artworks**, plus the 34-artwork Phase 3 showcase.

That is roughly **8.5 free parameters per human judgement**. No fitting procedure can be sound at
that ratio, and no amount of per-constant care fixes it. The two ways out are structural: remove
degrees of freedom (proposals 1–6), or generate evidence that does not need a human (proposals 4, 7).

Everything in this agenda is one of those two moves.

---

## 1. Retire the quality-weight scalarization in favour of the ordering the code already has

**Constants removed: 20** (`BASE_QUALITY_WEIGHTS` ×11, `SELECTOR_POLICY.qualityWeights` ×9). None
carries any justification; both sum to exactly 1.00 by hand.

The algorithm already contains a *non-parametric* statement of the same preference:
`ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS` (11 ordered blocks) and
`ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS` (9). Ranking already runs a Pareto frontier over quantized
evidence levels *and* a lexicographic block order. The weighted sum is a **second, redundant
mechanism** that re-decides the same question with 20 unreviewable reals.

**Direction.** Measure how often `qualityUtility` is the deciding comparison — i.e. how often two
candidates are Pareto-incomparable *and* tie on every priority block, so only the scalar separates
them. This needs a small addition to `probe/instrument.ts` (counting outcomes inside
`compareEvaluations`, which the current transform does not instrument — it wraps constants, not
comparators), but the mirror and the driver are reusable as they stand. Then:

Track P's own sweep already supplies a first answer from the other direction: **the entire wave-1
weight map is inert at ±20 %** (§7 of `LEDGER.md`), which is what "the scalar is being overridden by
the ordering" looks like from outside.

- if that fraction is small, delete the weighted sum and let the block ordering decide; an ordinal
  block order is something a human can actually review, and 20 reals are not;
- if it is large, the weights are load-bearing and must be *derived* rather than chosen. The honest
  derivation is a pairwise-preference model over the **axis-score differences** of the two candidates
  a human compared, which yields the weights as fitted coefficients with confidence intervals and a
  stated fit quality. Note this is not what `research/v2-3-eval/bradley-terry.ts` currently does — it
  fits latent strengths of *labels* (algorithm variants) over the same warehouse, with a seeded
  bootstrap. The verdict warehouse, the pairwise loader and the bootstrap machinery are all reusable;
  the model is what changes.
  With 104 verdicts and 11 coefficients, expect wide intervals — which is itself the finding, and a
  far more honest object than 11 unexplained decimals.

Either outcome is a strict improvement in justifiability. This is the single highest-value item.

## 2. Replace absolute role-evidence gates with within-artwork separation

**Constants addressed: 12** (`PHASE_3_ROLE_AWARE_POLICY`: `minimumCoherentSupport` 0.25,
`minimumRoleEvidence` 0.43, `simultaneousRoleEvidence` 0.62, `simultaneousRoleMargin` 0.18,
`decisiveRoleMargin` 0.11, the five normalisation divisors, …). **Zero doc comments between them.**

These ask "is this family's score above 0.43?" — an absolute question about a score that is itself a
weighted blend of other fitted constants. The quantity that actually matters is comparative: is this
family's claim to the role *better than the alternatives in this artwork*.

**Direction.** Re-express every gate as a separation in units of the evidence quantum. The algorithm
already defines one — `RESOLUTIONS.evidence = 0.04`, documented as "two scores inside one band are
indistinguishable evidence" — and already quantizes ranking with it. A rule of the form "decisive iff
the leader is ≥ 2 evidence bands clear of the runner-up" is scale-free, self-normalising per artwork,
and rests on one constant (the quantum) instead of twelve.

This also removes the failure mode where an artwork with uniformly low scores has *no* family clear
the absolute bar, and the role falls to a fallback for reasons nobody reviewed.

## 3. Collapse the field-transition rejection cascade into one continuous score

**Constants addressed: ~55** — the 20-constant undocumented block at `field-transition.ts:170-204`
plus ~35 inline rejection thresholds in `candidateForEndpoints` (`colorProgression < 0.72`,
`maximumSpatialGap > 0.58`, `weightedFieldScore < 0.32`, `quadrantCoverage < 0.75`,
`colorDirectness < 0.45`, `radialCenterContainment < 0.8`, …).

This is a hand-built decision tree: ~55 independent cliffs, each of which can reject a gradient on
its own, none of which has a comment or a cited case. An artwork that fails one by 1 % is rejected
exactly as hard as one that fails all of them.

**Direction.** The components are already computed as continuous quantities. Combine them into a
single transition-plausibility score and gate once. The gradient decision is then a *monotone*
function of evidence — reviewable, and with one threshold to calibrate against the charter's
"incorrectly allowed is exactly as bad as incorrectly prevented" symmetry. Track P's sweep data
identifies which of the 55 currently bind on real artworks; the ones that never bind should be
deleted rather than ported.

## 4. Convert `fieldBlend`'s asserted geometry into a measured null distribution

**Constants addressed: 5** (`minimumFieldSeparation` 0.3, `maximumRelativeOffset` 0.015,
`interiorMargin` 0.03, `maximumRungGap` 0.25, `minimumCorridorClosure` 0.9) — plus `accentBlend`,
which deliberately reuses them.

The doc comment's load-bearing claim is: *"a colour that is an independent material essentially never
lands that close to a long chord by chance."* That is a falsifiable statement about a distribution,
and it is currently **asserted, never measured**.

**Direction.** This one needs no human labels, so the sample size problem disappears. Over the full
7550-artwork corpus, measure the distribution of chord-offset for families that are *independently*
established as materials (spatially separated, own boundary, own domain). Set `maximumRelativeOffset`
at a stated quantile of that null — e.g. the 1st percentile — and report the false-absorption rate
implied. A threshold with a measured false-positive rate over thousands of artworks is a different
class of object from 0.015.

The same method applies to `mark.*`'s thresholds, whose individual values (12, 0.5, 0.25, 0.08, 3, 6,
0.12) currently have no per-value anchor at all.

## 5. Make enclosure continuous instead of a cliff at 2.5

**Constant: `mount.minimumEnclosedPopulationRatio` = 2.5**, with `borderCreditRetained` flipping
border credit from 1 to **0** across it.

This is the clearest "fence around known cases" in the runtime, and its own comment says so: one case
at 4.47 wants flipping, six accepted cases sit at 0.07–0.76, and 2.5 is placed at the centre of the
gap. The threshold's only job is to separate seven measurements. Nothing between 0.76 and 4.47 has
ever been observed, so the algorithm's behaviour across that entire range is unreviewed — and the
step is total: credit goes from full to zero.

**Direction.** Enclosure is evidence, not a switch. Fold a continuous enclosure term into
`fieldScore` — border credit scaled by a smooth function of the enclosed-population ratio — so that
an artwork at ratio 1.5 gets a partial answer rather than an arbitrary one. A continuous term also
composes with the other field evidence instead of overriding it, which is what the comment says the
mechanism is *trying* to do ("keeps every other piece of field evidence").

Same shape, same argument: `accentBlend.minimumTwoColourCoverage` = 0.8, calibrated one-sided from a
single case at 0.95 against "≤0.51 elsewhere".

## 6. Unify the midpoint bar onto the derived quantity, and delete the proxy

**Constants addressed: 2 removed, 1 kept.**

`MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` = 3.3 ΔE is the algorithm's best-evidenced constant (7
anchors) *and* it ships with a documented counterexample: a preferred reviewed output whose midpoint
sits at ΔE 2.58, below the bar. Its own comment concedes "distance alone cannot be the whole
account."

Meanwhile `MINIMUM_CHORD_DEVIATION_IN_FAMILY_BIN_STEPS` = 1 is *derived*: the comment establishes
that the maximum difference between the 3-stop and 2-stop renders **is exactly** the chord deviation,
so "one bin step of visible difference" is a principled bar for publishing a third stop.

**Direction.** The question "should this midpoint be published?" has a correct answer already
available: does the 3-stop render differ perceptibly from the 2-stop render? That is the chord
deviation, measured in the algorithm's own quantum. The 3.3 ΔE endpoint-difference test is a second
bar in a *different colour space* (CIELAB ΔE vs OKLab bin steps) answering a related but different
question, and it is the one with the known counterexample. Retire it in favour of the derived test
and re-measure the reviewed midpoint cases.

Likewise `gradient-support.ts`'s `minimumCrossHueRadians` = 60°: `palette.ts` already describes it as
a legacy proxy that the chord-deviation test was meant to subsume. It is still live. Delete it and
verify against the gradient corpus.

## 7. Fix the unconditional white alpha-flatten

**Constant: `native-resolution-image.ts:36`, `{r:255, g:255, b:255}`.**

Every image with an alpha channel is composited onto **opaque white** before any evidence is
computed. This is not a fallback — it runs on every load, it is undocumented, and it silently decides
the field colour of every transparent artwork. It is a forced colour in the most literal sense.

**Direction.** At minimum make it an option with the current default. Better: composite onto the
artwork's own dominant opaque colour, or carry alpha as coverage evidence so transparent regions
contribute no field claim rather than a white one. Any of these is defensible; the current one has
never been stated as a decision.

## 8. Repair the provenance record itself

Not a constant change, but the audit found the record is not trustworthy as-is:

- **The literature review does not exist.** `research/v2-3-experiments/literature-review/REPORT.md`
  §0 is cited as the basis for OKLab JND multiples; there is no such file anywhere in the repo or in
  `git log --all`. The only JND claim in the codebase is one unsourced line in a README ("1 JND ≈
  0.02"). Either write it with citations, or stop describing any constant as JND-derived.
- **`configuration.test.ts` documents a constant it does not pin.** Its `johns` 0.25/0.45 comment
  describes `FIELD_OWNERSHIP.collapsedSurfaceFidelity` = 0.45 — named in the file's own docstring as
  the value that "took Track A four rounds" — but sits above the assertion for
  `qualityWeights.fieldFidelity` = 0.15. The expensive constant is unpinned; the pinned one has
  inherited provenance it does not own. Fix both.
- **20 of 908 constants are pinned.** The pinning test is the only thing that gives a merge
  attribution for a changed constant. Extend it to at least every named policy field.
- **`TRANSITION_PROMOTION_ORDER` = `"coverage-first"` contradicts its own doc comment**, which
  records human review of a case where the lower-coverage, more readable accent was preferred.
  Either the comment or the value is stale; both cannot be right.

## 9. Unify the drifted duplicates

Pure correctness risk, no evidence needed — each is one concept implemented twice with different
numbers, where a future edit to one silently diverges:

| concept | sites |
|---|---|
| corner-window fraction | `0.15` (`field-transition.ts:246`, `palette-core.ts:2102`) vs `0.3` (`endpoint-refinement.ts:689`, `palette-core.ts:1787`) |
| endpoint interval | named `ENDPOINT_INTERVAL = [0.15,0.85]` vs the same pair hardcoded at `field-transition.ts:897` |
| largest-component share | policy field `0.08` vs bare `0.08` at `endpoint-refinement.ts:815` |
| accent contrast range | `ACCENT_CONTRAST_RANGE = 75` vs bare `75` at `palette-core.ts:1347` |
| radial anchor positions | the triple `(0.35,0.5) (0.65,0.5) (0.5,0.65)` duplicated verbatim in two files |
| separation denominator | `/0.18` (`palette-core.ts:1529`) vs `/0.1` (`:3838`) for the same formula shape |
| `fieldScore` formula | independently re-derived in `endpoint-refinement.ts:700-703` vs the native-family one |

Note the counter-example to imitate: `policy.ts` explicitly warns that `evidence = 0.04`,
`FAMILY_BIN_STEP = 0.04` and `REPRESENTATIVE_DENSITY_RADIUS = 0.04` are *different quantities that
must not be unified*. That is exactly the right treatment, and it should be applied in both
directions — unify what is one concept, and name what merely collides.

## 10. What good looks like — do not "fix" `chromaticCarryFull`

Worth stating explicitly, because an audit that only finds fault gives no target to aim at.

`GRADIENT_CLAIM.chromaticCarryFull` = 0.15 is the healthiest constant measured. It fires 9207 times
across 154 artworks and **never comes within 100 % of its threshold** — the nearest evaluation is a
factor of two away, and ±20 % flips nothing. Its calibration gap is correspondingly wide (defective
flips ≤0.087, the readable one at 0.248) and 0.15 sits between them with room on both sides.

That is the profile to aim for and the test to apply to every proposal above: **a well-placed
threshold has a measurable margin to the data on both sides.** A constant whose nearest approach is
0.1 % (`accentBlend`, `identityChromaticSeparation`, the midpoint bar, `decisiveForegroundPolarity`)
is sitting inside its own data, which means it is separating cases rather than classes.

Reporting nearest-approach alongside every threshold would make this visible permanently; the census
already computes it (`data/routing.json`).

## 11. Where more anchors are genuinely needed

For the eleven CALIBRATED constants, the boundary is what is unmeasured. The sweep data
(`data/perturbation-results.json`) names, per constant, the artworks whose output changes when it
moves — those are precisely the artworks whose review would be informative, because they sit on the
boundary rather than deep inside a region already judged.

Recommended review batches, 4–10 items each, drawn from that list rather than from the fixtures:
`mount.minimumEnclosedPopulationRatio` (nothing observed between 0.76 and 4.47),
`accentBlend.minimumTwoColourCoverage` (nothing between 0.51 and 0.95),
`decisiveForegroundPolarity` (no anchors at all today), and the `fieldBlend` five (no anchors at all
today).

---

## Resuming the measurement

**State at handover.** The tier-A sweep was launched detached and may still be running; it writes one
file per completed job into `data/perturbations/` and needs no supervision. Re-run
`probe/analyze-perturbations.ts` at any time to fold whatever has landed into
`data/perturbation-results.json` — it reads the directory, not a manifest, so partial is fine.

Order of the queue: the 20 quality weights first, then the constants with cited reviews, then the
rest of `policy.ts`, then the remaining named fields, then anonymous inline literals. So the earlier
a job's results appear, the more actionable it is.

Rebuild prerequisites from scratch if the worktree is reset (each is fast except the last):

```
probe/extract-constants.ts     # AST inventory        -> data/constants-raw.json
probe/build-registry.ts        # tunable filter       -> data/registry.json
probe/instrument.ts            # instrumented mirror  -> .variant/ (gitignored)
probe/build-corpus.ts          # corpora              -> data/corpus-*.txt
probe/sweep.ts --mode baseline # reference winners    -> data/baseline-winners.jsonl
probe/sweep.ts --mode census   # firing + margins     -> data/census.json
probe/analyze-census.ts        # routing + job lists  -> data/routing.json, data/jobs-*.json
```

Always re-verify the mirror after rebuilding it: run `probe/extract.ts --tree baseline` and
`--tree variant` over `data/verify-images.txt` and confirm the two agree on all four hexes, the
gradient flag and the midpoint. If they disagree, the instrumentation is wrong and every number
downstream is void.

The sweep is resumable and idempotent — outputs are keyed by `<site>-<direction>` and existing files
are skipped:

```
node --no-warnings --experimental-strip-types probe/sweep.ts \
  --mode perturb --corpus data/corpus-triage.txt --jobs data/jobs-tier-a.json --workers 11
```

Then `data/jobs-tier-b.json` (740 jobs, the anonymous inline literals). Rebuild the analysis at any
point with `probe/analyze-perturbations.ts`; it reads whatever has completed.

Firing-conditioned corpora for the deep pass: `data/routing.json` gives per-site firing counts and
flip margins, and `data/corpus-full.txt` lists all 7550 artworks. For a constant whose mechanism is
rare, filter the full corpus by running the census over it and keeping artworks where that site's
`comparisons` counter is non-zero, until ≥300 live cases — only live cases can flip.
