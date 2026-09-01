# Track P — Provenance ledger for the v2-3 constants

Audit of every tunable constant in `research/v2-3/src/internal/`, classified by what actually holds
it in place. Probes only: `research/v2-3/` is unmodified; everything here runs against an
instrumented *copy*.

Base commit `c2366d2`. All measurements read artwork from the shared checkout
`/Users/Flo/GitHub/palette/`, never from this worktree's `images/` (which holds only the
`-scrambled` decoys — charter corpus trap). Corpora used are stated per measurement.

---

## 1. What the algorithm is made of

An AST walk (`probe/extract-constants.ts`) over all 21 runtime modules, not a regex — a regex cannot
tell an array index from a threshold and misses `0.000_02`.

| | count |
|---|---:|
| numeric literals in the runtime | 2691 |
| — array indices / index arithmetic | 430 |
| — small-integer arithmetic (`/2`, `**2`, arity) | 1259 |
| — sRGB/OKLab/CIELAB colour-space definitions | 77 |
| — literal *types* (`position: 0` in a contract) | 7 |
| — byte/percent encoding | 10 |
| **tunable sites carried forward** | **908** |
| — named policy-object fields | 492 |
| — anonymous inline literals | 416 |

**Of the 908 tunable sites, 28 carry a doc comment longer than 25 characters, and 7 of those cite a
review, a measurement or an anchor.** (Automated attachment of the nearest leading comment, so a
lower bound; manual inspection raises the evidence-citing set to the 11 listed in §3, several of
which are documented in `configuration.test.ts` rather than at the definition.)

That is the headline of this audit: **~97 % of the tuning surface of this algorithm carries no
explanation at all, and ~1 % is documented as evidence-backed.**

Per-file concentration of tunables: `palette-core.ts` 406, `field-transition.ts` 152,
`endpoint-refinement.ts` 109, `policy.ts` 58, `role-obligations.ts` 48, rest ≤29.

## 2. Which of them are alive

`probe/instrument.ts` builds a behaviour-identical mirror of the runtime in which every tunable is a
call site. Fidelity was verified: the mirror reproduces baseline winners exactly on `doja`, `black`,
`johns`, `birdsofprey` (all four hexes, gradient flag and midpoint).

Census over the **154-artwork triage corpus** (canonical off-panel manifest 37 + review fixtures 37 +
a fresh deterministic stride sample of 80 drawn from the 7550-image hex corpus).

The corpus spans every stratum the charter asks evaluation to cover, so a zero-flip result is not an
artefact of a corpus that never exercises the mechanism: **60 of 154 artworks publish a gradient**
(27 of those with a source-supported midpoint), **34 collapse the field** (background = surface), and
**7 collapse the accent**. Zero extraction errors across the baseline and every perturbation run.

| route | sites | meaning |
|---|---:|---|
| routed to the sweep | 705 | fires, or its firing cannot be measured (computed key / aliased) — only a winner diff can settle it |
| dead | 173 | an inline literal never evaluated once on 154 artworks |
| threshold-inert | 30 | fires, but no evaluation comes within ±50 % of flipping its boolean |

The census is what makes the sweep affordable: it answers "does this fire?" and "could ±20 % change
any decision this constant gates?" for all 908 sites in a single 2-minute pass, instead of 1816
extraction runs.

**173 sites — 19 % of the tuning surface — never execute on 154 mixed artworks.** Per the charter
this is not yet a deletion claim (a mechanism firing on 1 artwork in 118 is indistinguishable from a
dead one at this sample size); it is a ranked list of deletion *candidates* requiring the ablation
protocol.

They are not spread evenly. The dead fraction concentrates sharply in the gradient machinery:

| module | tunables | never executed |
|---|---:|---:|
| `band-representative.ts` | 26 | 12 (46 %) |
| `endpoint-refinement.ts` | 109 | 37 (34 %) |
| `field-transition.ts` | 152 | 35 (23 %) |
| `palette-core.ts` | 403 | 75 (19 %) |
| `policy.ts` | 58 | 2 (3 %) |
| `role-obligations.ts` | 48 | 3 (6 %) |

A third of the endpoint-refinement and near-half of the band-representative tuning surface does not
run on a corpus in which 60 of 154 artworks publish a gradient and 27 publish a midpoint. That is
where an ablation pass would pay best, and it is a strong hint that these modules accumulated
branches for cases that were later handled elsewhere.

## 3. Classification

**DERIVED** — fixed by a perceptual fact, a colour-space definition, or a mathematical identity.
Changing it would be an error, not a retune.

| constant | value | basis |
|---|---|---|
| sRGB EOTF, OKLab matrices, D65 white point | — | colour-space definitions (77 literals, `color.ts`) |
| `CIELAB_TOE_*` | 216/24389, 841/108, 4/29 | CIE76 definition; the *choice* of CIELAB over OKLab as the ΔE ruler is justified in-code by a measured fact: one 8-bit step spans `okDistance` 0.0672 at level 0 vs 0.0030 at level 254, a 22.6× swing, against ΔE 0.27–0.49 |
| `1e-12` / `1e-9` quantization epsilons (≈10 sites) | — | float boundary robustness before `Math.floor` bucketing |
| `Math.SQRT1_2` centre-to-corner normaliser | — | geometric identity in a unit square |
| midpoint position `0.5` (`gradient-support`, `palette.ts`) | 0.5 | definitional: the midpoint of a 3-stop ramp |
| `priorityWeight` reciprocal-rank `+1` | 1 | argued in-code: ratios do not flatten as the list grows |

This class is small and almost entirely confined to `color.ts`. **No constant in the ranking,
field, transition or identity machinery is derived from a perceptual fact.**

**CALIBRATED** — a cited human anchor set. Eleven constants qualify; n is small everywhere, and in
most cases the artworks are not named.

> **Tier A revises the risk on this whole table (§7).** These eleven are the constants that attracted
> review attention, and they are almost all *inert*: `mount` 0 flips, `maximumQualityLoss` 0,
> `chromaticCarryFull` 0, `accentBlend` 1, `decisiveForegroundPolarity` 2, `identityChromaticSeparation`
> 3, the midpoint bar 4. Thin calibration on a constant that moves nothing is a documentation debt,
> not a correctness risk. The correctness risk is in §7's thirteen undocumented cliffs.

| constant | value | n | anchors | placement |
|---|---|---:|---|---|
| `mount.minimumEnclosedPopulationRatio` | 2.5 | 7 | 1 case to flip at 4.47; 6 accepted framed artworks at 0.07–0.76. **No artwork named.** | centre of the gap |
| `MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` | 3.3 ΔE | 7 | refused 0.00, 1.00, 3.01; accepted 3.64, 9.78, 19.75, 62.59. Comment says "six anchors" but lists seven. | just under the lowest accepted |
| `chromaticCarryFull` | 0.15 | 1 + set | 1 flip judged readable at 0.248; all defective flips ≤0.087 | between the bands |
| `identityChromaticSeparation` | 0.01 | 1 named | `orelsan` broke at 0.05; pathologies ≤0.0043, real pairings ≥0.0174 | between the bands |
| `identityForegroundClaimMargin` | 0.04 | 1 named | `krafty` — "the text of the artwork is Golden Mango" | — |
| `PROMOTION_ENVELOPE` | field-axis-neutral | 1 named | `birdsofprey` clears by 0.0012 under one formulation, falls out under another | — |
| `authorizedIdentity` | true | 2–3 named | `johns` and `black` broke under the rejected variant; `vvbrown`'s yellow accent is the reason the dimension exists | — |
| `ACCENT_OBSERVABILITY_ADEQUATE_LC` | 9 | ~2 + range | 20.8/15.5 vs 15.9/7.8; Lc≈9 judged good; stable over 6–12 | mid-plateau |
| `accentBlend.minimumTwoColourCoverage` | 0.8 | 1-sided | 0.95 on the reviewed case, ≤0.51 on every other chord-blend accent. **No artwork named.** | wide gap, one positive |
| `mark.*` (10 fields) | — | 38-sweep + 6 | Track E: no-op across a 38-case sweep; later revived for a class of "six artworks". Individual thresholds (12, 0.5, 0.25, 0.08, 3, 6, 0.12) have **no per-value anchor**. | — |
| `minimumFieldSpreadRatio` | 0.8 | aggregate | field material 1.19–1.36 vs object-in-band 0.51–0.56. **No cases named.** | ~45 % margin either side |

Note the shape: the *best-evidenced* constant in the algorithm rests on 7 unnamed measurements, and
five of the eleven rest on a single case. The whole human record available to calibrate against is
**104 verdicts over 63 artworks** (`research/v2-3-eval/data/verdicts.jsonl`) plus the 34-artwork
Phase 3 showcase, which judged 24/34 at least acceptable and 10/34 below.

**FITTED / UNEVIDENCED** — everything else: **~880 of 908 sites**, including every constant listed
below that the brief expected to be calibrated.

Highest-consequence members, most-fitted first:

1. **The two quality-weight maps — 20 constants, the ranking spine.** `BASE_QUALITY_WEIGHTS`
   (winner stage, 11 axes) and `SELECTOR_POLICY.qualityWeights` (wave 1, 9 axes). Both sum to
   exactly 1.00. **Neither carries a single word of per-weight justification.** These decide every
   comparison the algorithm makes.
2. **`role-obligations.ts`'s `PHASE_3_ROLE_AWARE_POLICY` — 12 fields, zero comments.** Includes
   `minimumRoleEvidence` 0.43, `simultaneousRoleEvidence` 0.62, `decisiveRoleMargin` 0.11,
   `minimumCoherentSupport` 0.25 — the gate deciding whether a family may hold a role at all.
   Values to two significant figures with no derivation are the signature of a fitted constant.
3. **`identity.decisiveForegroundPolarity` = 0.6.** The brief expected "2 bounds". The doc comment
   is a long and good *mechanistic* argument (|polarity| × confidence, required of both sides) but
   states **no numeric anchor at all**, and `configuration.test.ts` — which pins its neighbours —
   does not pin it. No document anywhere in the repo or its history cites this value.
4. **`fieldBlend.*` — 5 thresholds, zero empirical support.** `minimumFieldSeparation` 0.3,
   `maximumRelativeOffset` 0.015, `interiorMargin` 0.03, `maximumRungGap` 0.25,
   `minimumCorridorClosure` 0.9. The prose is excellent and the geometry is principled, but "a
   colour that is an independent material essentially never lands that close to a long chord by
   chance" is *asserted*, never measured. These also gate `accentBlend` by deliberate reuse.
5. **`WINNER_SCORING_POLICY.maximumQualityLoss` = 0.12**, applied at two gates against two different
   baselines. No cited derivation for the magnitude.
6. **`field-transition.ts`'s 20-constant block (lines 170–204), declared with no comments at all**,
   plus ~35 inline rejection thresholds in `candidateForEndpoints` (`colorProgression < 0.72`,
   `maximumSpatialGap > 0.58`, `weightedFieldScore < 0.32`, `quadrantCoverage < 0.75`, …). This is
   the densest concentration of un-evidenced cliffs in the runtime.
7. **~15 independent blend-weight vectors** that each sum to 1.00 (`fieldScoreFrom` .28/.22/.22/.13/.15,
   `coherentSupport` .45/.30/.15/.10, `foregroundRaw` .30/.22/.20/.16/.12, `roleSourceSupport`
   .26/.20/.20/.14/.10/.10, `fieldFidelityWeights` .3/.25/.2/.15/.1, …). Sums-to-one is enforced by
   hand for only two of them.

## 4. Hardcoded specials

| site | value | condition |
|---|---|---|
| `source-eligibility.ts:167`, `palette-core.ts:3754` | `#000000` / `#ffffff` allowlist | a fully generated emergency pair is eligible **only** if it renders to pure black or pure white |
| `palette-core.ts:4052-4074` | `[0,0,0]`, `[255,255,255]` | the generated emergency foreground/background candidates themselves |
| `native-resolution-image.ts:36` | `{r:255,g:255,b:255}` | alpha is flattened onto **opaque white on every image load**, unconditionally — not an emergency path |
| `policy.ts:59` | `135` degrees | fixed render contract for the CSS ramp |
| `policy.ts:60-63` | `0`, `1`, `[0,.25,.5,.75,1]` | fixed stop positions and contrast sample positions |
| `gradient-support.ts:12`, `palette.ts:236` | `0.5` | midpoint position (definitional) |
| `gradient-support.ts:14` | `Math.PI/3` = 60° | minimum cross-hue angle; described in `palette.ts` as a legacy proxy the newer chord-deviation test was meant to subsume, **still live** |
| `candidate-domain.ts:120` | `[0.2, 0.8]` | endpoint bands |
| `palette-core.ts:2429-2432` | 22.5°, 67.5°, 112.5°, 157.5° | extra gradient angles, feature-flagged off |
| `palette-core.ts:2399-2402`, `endpoint-refinement.ts:326-329` | `(0.5,0.35)`, `(0.35,0.5)`, `(0.65,0.5)`, `(0.5,0.65)` | radial anchor positions, **duplicated verbatim across two files with no shared constant** |

The white alpha-flatten is the one to look at hardest: it is unconditional, undocumented, and
silently decides what a transparent PNG's field colour is.

## 5. Two corrections to the brief

**(a) `sourceSupport` and `renderedFieldClaim` are NOT unweighted.** The brief (citing Track M)
asked me to note them as computed-but-unweighted axes in `qualityUtility`. At `c2366d2` they are
both weighted — `sourceSupport: 0.10`, `renderedFieldClaim: 0.08` — and `qualityUtility` reduces
over all 11 `WINNER_QUALITY_AXES` with `qualityWeights[axis]`; the 11 weights sum to exactly 1.00.
There is no unweighted axis in that map.

This is confirmed behaviourally, not just by reading: perturbing `sourceSupport` by −20 % changes
**24 of 154 palettes, the largest effect of any weight measured**, and `renderedFieldClaim` changes
5. An axis that is genuinely unweighted cannot move a single output. Whatever Track M observed, it
does not hold at this commit.

The real computed-but-unweighted quantities are **`identityGain` and `identityAuthorizedGain`**.
They are not in `WINNER_QUALITY_AXES`, never touch `qualityWeights`, and enter ranking on their own
terms: `relationUtility = qualityUtility + identityGain` (winner-scoring.ts:488), and
`identityAuthorizedGain` is an independent Pareto-domination dimension (`dominates`, :518-523) and
the first tie-break inside a utility band (`compareEvaluations`, :568-571). An auditor reading only
`qualityWeights` would not see the two quantities that can override it.

The magnitude is not incidental: `maximumIdentityGain` = 0.05 against `utilityResolution` = 0.005
means `identityGain` alone can move a candidate **up to ten quantized utility bands**, while the
largest single quality weight is 0.15 of a score in [0,1]. The unweighted term is the same order of
magnitude as the weighted ones it sits beside.

**(b) `configuration.test.ts` documents a constant it does not pin.** The comment at
`configuration.test.ts:42-43` — "Track A round 4: 0.25 tipped `johns` onto Track C's grey/near-white
pair; 0.45 holds every reviewed win" — sits above
`assert.equal(WINNER_SCORING_POLICY.qualityWeights.fieldFidelity, 0.15)`. The values 0.25/0.45
belong to `FIELD_OWNERSHIP.collapsedSurfaceFidelity = 0.45` (winner-scoring.ts:109), which the
file's own docstring names as the value that "took Track A four rounds" — **and which the test does
not assert at all.** So the algorithm's most expensively-found constant is unpinned, while the
constant that *is* pinned (`fieldFidelity` 0.15) has inherited someone else's provenance and has
none of its own.

## 6. Provenance gaps found while auditing

- **The literature review does not exist.** The brief cites
  `research/v2-3-experiments/literature-review/REPORT.md` §0 for OKLab JND multiples. There is no
  such file, no such directory, and nothing matching `*literature*` anywhere in the repo or in
  `git log --all`. The only JND statement in the repo is one unsourced line in
  `research/v2-3-eval/README.md`: "1 JND ≈ 0.02, so the default epsilon of 0.04 is about 2 JND per
  role". Every DERIVED-by-JND claim in this codebase currently rests on that one uncited sentence.
- `configuration.test.ts` pins 20-odd values. The runtime has 908.
- Comment/anchor arithmetic disagrees in at least one calibrated constant (midpoint 3.3: "six
  anchors", seven values listed) and that same constant carries a documented counterexample
  (a preferred reviewed output whose midpoint sits at ΔE 2.58, below the bar).
## 7. Perturbation sweep — TIER A COMPLETE

**620 runs, 335 sites, 154 artworks, zero extraction errors.** Every swept site re-run over the full
triage corpus at ±20 % (or to its documented opposite for 0/1 policy switches), with every published
value diffed against baseline. Raw data: `data/fragility.json`, `data/perturbation-results.json`.

Firing-conditioned denominators come from a per-artwork fingerprint pass over the same 154 artworks
(`data/fingerprints.jsonl`): for each site, the number of artworks on which it was actually
consulted. **Only a live case can flip**, so flips-per-live-case is the only comparable fragility
number — "12 flips" means one thing if the constant was consulted on 150 artworks and something
entirely different if it was consulted on 13.

**Harness validation:** `FAMILY_BIN_STEP` ×1.2 changes 3 of 4 spot-check artworks outright. Zero-flip
results are real inertness, not a dead instrument.

### Headline counts

| classification | sites | meaning |
|---|---:|---|
| no measured effect | 558 | ±20 % changes nothing on any of 154 artworks |
| **load-bearing** | **125** | changes something, but narrowly |
| safely-placed | 39 | consulted often, nothing moves, data keeps ≥20 % distance |
| **pervasive cliff** | **13** | consulted on ≥100 artworks *and* flips ≥20 % of them |
| **fragile fence** | **0** | — |

### The result that overturns my own triage call

**There are no fragile fences.** The profile I flagged provisionally from census margins —
`decisiveForegroundPolarity` = 0.6, "rarely consulted, borderline when consulted" — **does not
survive winner-level measurement**. It is live on 135 artworks and changes **2** of them (1 %).

The census counted 57 *boolean* flips at ±20 % out of 300 comparisons and I read that as fragility.
Tier A shows those boolean flips do not propagate to the published palette: downstream machinery
absorbs them. **A boolean-flip margin is not evidence of output fragility**, and my provisional
classification was wrong to treat it as one. Corrected here and in §3.

The same correction applies across the reviewed-policy layer, which is far more inert than expected:

| constant | live / 154 | flips | nearest approach |
|---|---:|---:|---|
| `mount.minimumEnclosedPopulationRatio` 2.5 | mechanism live on **2** | **0** | — |
| `mount.borderCreditRetained` 0 → 1 (full disable) | 2 | **0** | — |
| `maximumQualityLoss` 0.12 | 154 | **0** | — |
| `fieldBlend.*` (5 thresholds) | — | 0–3 | — |
| `mark.*` (10 fields) | — | 0–4 | — |
| `mark.substitution` 1 → 0 (full disable) | 154 | 10 | — |
| `accentBlend.minimumTwoColourCoverage` 0.8 | 151 | **1** | 0.0 % |
| `identityChromaticSeparation` 0.01 | 151 | 3 | 0.1 % |
| `decisiveForegroundPolarity` 0.6 | 135 | 2 | 0.1 % |
| `MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` 3.3 | 59 | 4 | 0.1 % |
| `collapsedSurfaceFidelity` 0.45 | 154 | 9 | — |
| `chromaticCarryFull` 0.15 | 32 | **0** | 100 % |

Note `accentBlend` and `identityChromaticSeparation`: consulted on ~every artwork, sitting *directly
on* the data (nearest approach 0.0–0.1 %), and still changing 1–3 outputs. Sitting on the data is not
the same as deciding the output.

### The 13 pervasive cliffs — where the algorithm actually is

| flips / live | share | constant | value | documented? |
|---:|---:|---|---|---|
| 150 / 154 | **97 %** | `FAMILY_BIN_STEP` | 0.04 | no comment |
| 125 / 154 | 81 % | `bounds.representativesPerRole` | 2 | no comment |
| 88 / 154 | 57 % | `rankForegroundOptions` cut-off | 0.68 | no comment |
| 78 / 151 | 52 % | `rankAccentOptions` cut-off | 0.5 | no comment |
| 60 / 154 | 39 % | `buildFieldVariants` length bound | 2 | no comment |
| 51 / 154 | 33 % | `REPRESENTATIVE_DENSITY_RADIUS` | 0.04 | no comment |
| 49 / 154 | 32 % | `buildRegionObservations.score` | 0.45 | no comment |
| 45 / 154 | 29 % | `buildRegionObservations.score` | 0.55 | no comment |
| 41 / 118 | 35 % | `fitGradients.texture` switch | 0 → 1 | no comment |
| 39 / 118 | 33 % | `fitGradients.texture` | 2 | no comment |
| 35 / 154 | 23 % | `buildNativePaletteEvidence.population` | 0 → 1 | no comment |
| 28 / 113 | 25 % | `FIELD_MIDPOINT_BAND` | 0.42 | no comment |
| 27 / 113 | 24 % | `binKeyOf` bin centre | 0.5 | no comment |

**All thirteen are undocumented. None of the thirteen is pinned** in `configuration.test.ts` — two
(`FAMILY_BIN_STEP`, `REPRESENTATIVE_DENSITY_RADIUS`) appear there only inside a comment warning not
to unify them with `RESOLUTIONS.evidence`.

`FAMILY_BIN_STEP` = 0.04 changes **97 % of all published palettes** when moved 20 %. It is a bare
literal with no comment, no pin, and no cited derivation. It is, by a wide margin, the most
consequential number in this algorithm.

### The answer to the campaign question

The forcing is **not** where the review effort went. The carefully-argued policy constants — `mount`,
`fieldBlend`, `accentBlend`, `mark`, the midpoint bar — are narrow mechanisms that between them move
a handful of artworks. The constants that decide this algorithm's output are quantization steps,
candidate-list bounds and ranking cut-offs that **nobody has ever written a sentence about**.

Aggregated over all 262 flip-producing runs: **5.8 % of reviewed-fixture opportunities flip against
9.3 % of unseen-corpus opportunities — a 1.61× asymmetry.** For the eleven `BASE_QUALITY_WEIGHTS`
specifically it is **2.50×**. So the over-fitting signature is real, general, and strongest in the
ranking weights.

### All eleven `BASE_QUALITY_WEIGHTS` — measured

Contrary to the note in `provenance-hygiene/REPORT.md` §"Value-level concerns" 2, these were **not**
deferred to a later tier. They are tier-A constants and all eleven are measured:

| weight | value | flips / 154 | fixtures | unseen |
|---|---|---:|---:|---:|
| `accentPath` | 0.08 | 26 | 6 | 35 |
| `sourceSupport` | 0.10 | 24 | 5 | 37 |
| `fieldFidelity` | 0.15 | 23 | 4 | 40 |
| `artworkIdentity` | 0.11 | 23 | 5 | 30 |
| `foregroundPath` | 0.15 | 22 | 4 | 30 |
| `surfaceFidelity` | 0.06 | 21 | 5 | 36 |
| `coherence` | 0.06 | 21 | 5 | 35 |
| `economy` | 0.05 | 20 | 4 | 33 |
| `representativeness` | 0.10 | 19 | 2 | 33 |
| `accentFidelity` | 0.06 | 17 | 4 | 28 |
| `renderedFieldClaim` | 0.08 | 5 | 1 | 9 |

Every one is load-bearing; every one flips unseen artwork more than reviewed artwork. By contrast
**all nine wave-1 `SELECTOR_POLICY.qualityWeights` are inert** (0/154, both directions) — see the
retention-cap caveat below before deleting them.

## 7b. Scope: which trunk this measured

The instrumented mirror was built from **`c2366d2`**. Trunk has since taken the batch-26/27/28/30
mechanism integrations, a new `gamut-coverage.ts` module, and a performance pass
(`9063f6e`, byte-identical output — it cannot affect validity).

Matched by identity and value against `research/palette-0.9-checkpoint`
(`probe/trunk-delta.ts`, `data/trunk-delta.json`):

- **318 of 335 measured sites carry forward unchanged** (same identity, same value).
- 17 no longer resolve. Only **two of them had any measured flips**:
  - `MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` (4 flips) — **relocated, not changed**: it is now
    `POLICY.distinctness.sameColor`, still `3.3`. The measurement carries forward under the new name.
    (Trunk's comment there credits `track-p/LEDGER.md:109` for the six-vs-seven anchor arithmetic.)
  - `field-transition:buildRegionGraph#29` = 0.25 (1 flip) — genuinely gone.
- **Not measurable from this base:** everything introduced by the four integrations, including
  `gamut-coverage.ts` in full and `GAMUT_COVERAGE.saturation = 0.75` (tagged `[UNCALIBRATED]` on
  trunk). Those need a re-instrumented mirror; the pipeline rebuilds in ~3 minutes.

So: **conclusions about the 318 carried-forward sites apply to today's trunk. Conclusions about the
four integrated mechanisms do not exist in this data at all.**

## 7c. Cross-reference: `provenance-hygiene/REPORT.md` @ `f53b209`

Where tier A confirms or revises the trunk tags. Fragility and provenance are independent axes — a
well-evidenced constant can be fragile and an unevidenced one inert — so the useful product is the
cross-product.

| pin | trunk tag | tier-A measurement | disposition |
|---|---|---|---|
| `qualityWeights.fieldFidelity` 0.15 | `[INHERITED]` | 23/154 flips, 4 fixtures vs 40 unseen | **CONFIRMS, elevate.** Unevidenced *and* load-bearing *and* over-fitted (10× unseen:reviewed). Highest-risk pin in the file. |
| `maximumQualityLoss` 0.12 | `[INHERITED]`, report calls it "load-bearing and unevidenced; top calibration candidate" | live on 154, **0 flips at ±20 %** | **REVISES — downgrade.** It is a *bound* that rarely binds; unevidenced, but not fragile at this magnitude. Cheaper targets exist. Its known `birdsofprey` 0.0016 near-miss argues for measuring at ±5 %, not ±20 %. |
| `mark.minimumComponentCount` 3 | `[n=1]` | 0 flips | **CONFIRMS low risk.** n=1 is honest; the value is also inert. Low priority. |
| `mark.minimumComponentPopulation` 12 | `[INHERITED]` | 4 flips | **CONFIRMS mild risk.** |
| `collapsedSurfaceFidelity` 0.45 (newly pinned) | `[MEASURED]` | 9/154 flips, live on 154 | **CONFIRMS the pin was right.** Load-bearing and now pinned; the sweep's recommendation was correct. |
| `bounds.identityObligations` 4 | revert to inherited; report notes one-sided (3 and 5 never tried) | 18/154 flips (all on `up20`) | **CONFIRMS, elevate.** One-sided calibration on a constant that moves 18 artworks; the asymmetric flip profile (0 down, 18 up) says the bound binds in exactly one direction. |
| `GAMUT_COVERAGE.saturation` 0.75 | `[UNCALIBRATED]` | **not measurable** — post-dates this mirror | Needs a re-instrumented sweep. |
| `TRANSITION_PROMOTION_ORDER` | `[HELD]` | not swept (string-valued) | Out of scope for numeric perturbation. |
| `RESOLUTIONS.evidence` 0.04 | pinned, JND provenance disputed | 44/154 flips | **Elevate.** The report is right that its "2 JND" justification rests on one uncited README line; tier A shows it moves 44 artworks. |

**The report's biggest gap is one it could not have known:** pin coverage is thin not merely in count
(~20 of 908) but in *targeting*. **Zero of the 13 pervasive cliffs are pinned.** The pinned set is
drawn from constants that attracted review attention; the fragility ranking is almost disjoint from
it. Pinning `FAMILY_BIN_STEP` (97 % of palettes) matters more than pinning anything currently in the
file.

## 8. Known limitations of this ledger

- The census measures firing on 154 artworks. A constant marked dead here may fire on the other
  7396. Deletion requires the charter's ablation protocol.
- **Firing counts are a lower bound, never an upper one.** Read instrumentation is syntactic and
  misses two access patterns: *computed* keys (`qualityWeights[axis]` — all 20 quality weights) and
  *aliasing* (`const MARK = …POLICY.mark; MARK.minimumFill` — all of `mark`, `fieldBlend`, `mount`).
  Both report zero reads and zero comparisons. `probe/analyze-census.ts` routes them to the sweep
  with firing "unknown" rather than calling them dead, because calling them dead is precisely the
  corpus-artifact error the charter warns about. **No constant in this ledger is claimed dead on the
  strength of a zero read count alone.** The 173-site dead list is inline literals and zero/one
  initializers, whose evaluation counts are measured directly and are not subject to either pattern.
- Named-constant read wrapping matches by identifier text across files, so a same-named local can
  inflate a read count. It cannot affect correctness (the wrapper returns its argument unchanged)
  and the mirror was verified winner-identical.

---

See `AGENDA.md` for the ranked de-fitting proposals and `data/` for the raw measurements.
