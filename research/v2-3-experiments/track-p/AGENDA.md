# Track P — De-fitting agenda

Ranked proposals for replacing forced constants with generic mechanisms. Each entry states the
constant(s), why the current form is a forcing, and the *direction* of a generic replacement —
continuous evidence, a derived quantity, or "more anchors needed".

Ordering is by (degrees of freedom removed) × (evidence currently missing), not by ease.

---
## STATUS: tier A complete — this agenda is reordered by measurement

620 perturbation runs over 154 artworks, with firing-conditioned denominators. `LEDGER.md` §7 has the
full result. Three things changed in this agenda as a consequence, and they are the point of having
run it:

**1. The forcing is not where the review effort went.** Every constant that attracted human review —
`mount`, `fieldBlend`, `accentBlend`, `mark`, the midpoint bar, `maximumQualityLoss` — turns out to be
a narrow mechanism moving 0–4 artworks in 154. The constants that decide the output are thirteen
**undocumented, unpinned** quantization steps, candidate bounds and ranking cut-offs. `FAMILY_BIN_STEP`
= 0.04 alone changes **97 % of published palettes** at ±20 %.

**2. My own "fragile fence" call was wrong, and the method that produced it is retired.** I flagged
`decisiveForegroundPolarity` = 0.6 from census *boolean-flip margins*: rarely consulted, borderline
whenever consulted. At winner level it moves **2 artworks in 135 live**. Boolean flips do not
propagate — downstream machinery absorbs them. **A threshold sitting on its data is not evidence that
it decides anything**, and nothing in this agenda should be prioritised on margin evidence again.
Tier A found **zero fragile fences** by that definition.

**3. Over-fitting is confirmed, quantified, and general.** Across all 262 flip-producing runs,
perturbations flip **5.8 %** of reviewed-fixture opportunities against **9.3 %** of unseen-corpus
opportunities — a **1.61× asymmetry**. For the eleven `BASE_QUALITY_WEIGHTS` it is **2.50×**. The
algorithm is measurably more stable on the 37 artworks it was tuned against than on artwork nobody
has looked at. That is the campaign question, answered: **yes, and the tuning is holding the reviewed
set in place while the rest of the corpus moves.**

### Ranked de-fitting targets, by measured consequence

| # | target | flips / live | evidence | action |
|---|---|---|---|---|
| 1 | `FAMILY_BIN_STEP` 0.04 | **150/154 (97 %)** | none, no pin, no comment | derive or pin + calibrate — see §0 |
| 2 | `bounds.representativesPerRole` 2 | 125/154 (81 %) | none | §0 |
| 3 | `rankForegroundOptions` 0.68 / `rankAccentOptions` 0.5 | 88 / 78 | none | §0 |
| 4 | 11 × `BASE_QUALITY_WEIGHTS` | 5–26 each, **2.5× asymmetry** | none | §1 — derive |
| 5 | `RESOLUTIONS.evidence` 0.04 | 44/154 | one uncited README line | §1 / §8 |
| 6 | `bounds.identityObligations` 4 | 18/154, **one-sided** | one-sided calibration (trunk agrees) | §11 |
| 7 | 9 × wave-1 `qualityWeights` | **0/154** | none | §1 — delete after cap check |
| 8 | `mount`, `fieldBlend`, `mark`, `accentBlend`, midpoint bar | 0–4 each | thin but cited | **downgraded** — documentation debt, not correctness risk |

## §0 (NEW, now the top item). Pin and derive the thirteen pervasive cliffs

**Constants addressed: 13. Currently documented: 0. Currently pinned: 0.**

This item did not exist before tier A because nothing pointed at these constants: they have no
comments to audit and no review history to cite, so every provenance pass — mine included — walked
straight past them. They are:

`FAMILY_BIN_STEP` 0.04 · `bounds.representativesPerRole` 2 · `rankForegroundOptions` 0.68 ·
`rankAccentOptions` 0.5 · `buildFieldVariants` length 2 · `REPRESENTATIVE_DENSITY_RADIUS` 0.04 ·
`buildRegionObservations.score` 0.45 and 0.55 · `fitGradients.texture` 0 and 2 ·
`buildNativePaletteEvidence.population` 0 · `FIELD_MIDPOINT_BAND` 0.42 · `binKeyOf` bin centre 0.5

**Immediate, cheap, no behaviour change: pin all thirteen** in `configuration.test.ts` with their
measured fragility as the comment. A constant that moves 97 % of outputs and can be silently changed
by a merge is the single largest process risk in the codebase, and the trunk provenance pass could
not have caught it — it audited the pins that exist, and these were never pinned.

**Then, by type:**

- `FAMILY_BIN_STEP`, `REPRESENTATIVE_DENSITY_RADIUS`, `binKeyOf`'s 0.5 and `RESOLUTIONS.evidence` are
  all **quantization grains**. They are the best candidates in the whole algorithm for genuine
  derivation: a bin step should follow from a discriminability threshold in OKLab, and the codebase
  already establishes the relevant hard fact (one 8-bit step spans `okDistance` 0.067 at the black
  point vs 0.003 at white — a 22.6× swing). A single grain cannot be right at both ends; the honest
  replacement is a **lightness-dependent grain**, which removes the constant and fixes a known
  distortion at once. This is the highest-value derivation available.
- `representativesPerRole` 2, `buildFieldVariants` 2, `bounds.fieldFamilies` 12 are **truncation
  bounds**. Their flips are pure search-truncation artefacts: raising them can only add candidates.
  Measure the bound at which output stops changing and set it there with the measurement recorded —
  a bound justified by convergence is not a free parameter.
- `rankForegroundOptions` 0.68, `rankAccentOptions` 0.5, `buildRegionObservations.score` 0.45/0.55
  are **ranking cut-offs**, the same shape as §2's role gates and fixable the same way: express as a
  separation in evidence quanta rather than an absolute level.

## 1. Split the two quality-weight maps: delete one, derive the other

**Measured, not conjectured** (`LEDGER.md` §7). The two maps look identical in the source and behave
nothing alike:

- **wave 1 (`SELECTOR_POLICY.qualityWeights`, 9 weights): inert.** All nine, both directions, zero
  changes across 154 artworks. Nine free parameters that appear removable at zero behavioural cost.
  **One check first** (`LEDGER.md` §7): this is live code, not dead — wave-1 ordering is a real
  comparison key, it is simply invisible downstream unless a retention bound (`completeCandidates`
  1500, `retainedTreatments` 8) actually binds. Construct or find artworks where a cap binds and
  re-measure there before removing. If it still does not move, delete the nine.
- **winner stage (`BASE_QUALITY_WEIGHTS`, 11 weights): load-bearing and over-fitted.** ±20 % on
  `fieldFidelity` moves ~14 % of published palettes, and it moves them **2–3× more often on artwork
  nobody reviewed** (17.9 %) than on the 37 reviewed fixtures (5.4 %). These cannot be deleted; they
  must be *derived*, and the asymmetry is the reason it is urgent.

The rest of this item is about the winner-stage eleven.

**Constants addressed: 20** (9 deleted outright, 11 re-derived). None carries any justification; both
maps sum to exactly 1.00 by hand.

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

Track P's sweep already answers this for wave 1 from the outside — **the whole map is inert**, which
is what "the scalar is being overridden by the ordering" looks like from the published output. Run
the same question at the winner stage, where the scalar demonstrably *is* deciding.

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

## 4. Convert `fieldBlend`'s asserted geometry into a measured null distribution — **DOWNGRADED, but still cheap**

> **Measured:** the five `fieldBlend` thresholds flip 0–3 artworks each; `mark`'s ten flip 0–4, and
> disabling `mark.substitution` entirely moves 10. Narrow mechanisms, not cliffs.
>
> Keep this item anyway, at low priority, for one reason: it is the only proposal here that
> **manufactures evidence without a human**. The null distribution comes from the 7550-artwork corpus
> and costs one measurement pass. Everything else on this list either removes a parameter or waits on
> review capacity, which is the binding constraint. Cheap evidence is worth collecting even for a
> mechanism that currently decides little.

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

## 5. Make enclosure continuous instead of a cliff at 2.5 — **DOWNGRADED by tier A**

> **Measured:** the whole `mount` mechanism is live on **2 of 154 artworks**, and setting
> `borderCreditRetained` back to 1 — a complete disable, the "restore previous behaviour" switch its
> own comment documents — changes **nothing**. `minimumEnclosedPopulationRatio` = 2.5 flips nothing.
>
> The reasoning below stands (a 7-anchor gap-midpoint with a total 1→0 step is a fence, and the
> continuous form is better architecture), but it buys almost no accuracy on this corpus. Do it when
> touching that code, not as a priority. **Do not delete it on this evidence either** — 2 live cases
> in 154 is exactly the sample size the charter warns is indistinguishable from dead; a deletion
> claim needs the firing-conditioned corpus (`probe/build-firing-corpus.ts` sizes it).

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

## What tier B would cost, and whether it is worth it

**Tier B is 740 jobs**: the anonymous inline literals — blend weights inside scoring functions,
saturation divisors, normalisation constants — that carry no name and no comment. (It is *not* the
`BASE_QUALITY_WEIGHTS`; those are tier A and all eleven are measured. `provenance-hygiene/REPORT.md`
§"Value-level concerns" 2 records them as awaiting a tier-B import — they are ready now.)

**Cost, from tier A's own throughput** (279 jobs in 26 378 s at 11 workers = 94.5 s/job):
**≈ 19.5 hours wall** on a quiet 14-core machine, unattended and resumable. No human time beyond
launching it.

**Worth it, for one specific reason.** Tier A's headline is that the constants deciding this
algorithm are the ones nobody documented. Tier B *is the rest of that population* — 740 undocumented
literals, of which tier A's sample already surfaced several in the top 20
(`buildRegionObservations.score` 0.45/0.55, `fitGradients.texture`, `buildFieldVariants` length). The
expected yield is more pervasive cliffs, and they are exactly the constants no review has ever seen.

**Two cheaper options if 19.5 h is not available:**

1. **Census-pruned tier B.** `data/routing.json` already carries firing counts and flip margins for
   all 740. Sweep only those consulted on ≥100 artworks — the pervasive-cliff precondition. That is
   the population where every tier-A cliff came from, and it cuts the queue by roughly two thirds
   (**≈ 6–7 h**) while keeping essentially all of the expected yield.
2. **Fragility-first sampling.** Run the 740 at ±20 % over a 40-artwork subset first (**≈ 2 h**),
   then re-run only the sites that moved anything over the full 154. Two-stage, same final numbers
   for anything load-bearing, weaker only on constants that flip 1–2 artworks — which tier A shows
   are not where the risk is.

Recommendation: **option 1**. It is targeted at the finding tier A actually produced.

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
