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

## 7. Perturbation sweep — results so far

Each swept site is re-run over the full 154-artwork triage corpus at ±20 %, and every published
value (4 hexes, gradient flag, midpoint) is diffed against baseline. Partial; see §"Resuming" in
`AGENDA.md`. Raw data: `data/perturbation-results.json`.

**Validation that the sweep can detect a flip at all:** `FAMILY_BIN_STEP` (0.04, the OKLab
quantization step) at ×1.2 changes 3 of 4 spot-check artworks outright — `doja` loses its
source-supported midpoint entirely, `birdsofprey` and `johns` change on every role. The instrument
is live; zero-flip results below are real inertness, not a broken harness.

| constant | ±20 % flips / 154 | reading |
|---|---|---|
| `SELECTOR_POLICY.qualityWeights.fieldFidelity` 0.16 | 0 / 0 | inert |
| `…surfaceFidelity` 0.06 | 0 / 0 | inert |
| `…artworkIdentity` 0.12 | 0 / 0 | inert |
| `…representativeness` 0.12 | 0 / 0 | inert |
| `…foregroundPathUtility` 0.19 | 0 / 0 | inert |
| `…accentFidelity` 0.07 | 0 (down) | inert |

**The wave-1 selector's quality-weight map does not move any published output at ±20 %.** Six of its
nine weights are measured so far, both directions, zero changes on 154 artworks — including its
largest weight (0.19). This is the first direct evidence for AGENDA proposal 1: the weighted
scalarization is being overridden by the Pareto frontier and the lexicographic priority blocks that
run alongside it, at least at wave 1.

This does *not* yet extend to the winner-stage `BASE_QUALITY_WEIGHTS`, which are queued next and are
the map that decides the published palette. Treat the wave-1 result as bounded to wave 1 until those
land.

### Census evidence for the constants the audit was asked about

Reliable wherever `comparisons > 0`. A zero in that column means the constant is *aliased* before
use (`const MARK = …POLICY.mark`) so the instrumentation cannot see the comparison — **it is not
evidence of deadness**, and none of these are claimed dead.

| constant | value | comparisons | flips at ±20 % | nearest approach |
|---|---|---:|---:|---:|
| `accentBlend.minimumTwoColourCoverage` | 0.8 | 328 984 | 21 933 | 0.0 % |
| `identityChromaticSeparation` | 0.01 | 430 413 | 18 005 | 0.1 % |
| `MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` | 3.3 | 32 214 | 4 582 | 0.1 % |
| `identity.decisiveForegroundPolarity` | 0.6 | 300 | 57 | 0.1 % |
| `minimumFieldSpreadRatio` | 0.8 | 804 | 12 | 9.9 % |
| `GRADIENT_CLAIM.chromaticCarryFull` | 0.15 | 9 207 | **0** | **100 %** |
| `mark.*`, `fieldBlend.*`, `mount.*` | — | 0 (aliased) | — | — |

Two readings stand out.

`chromaticCarryFull` = 0.15 fires 9207 times and **never once comes within 100 % of its threshold** —
no evaluation is closer than a factor of two. Its calibration gap (defective ≤0.087, readable 0.248)
is genuinely wide, and on this corpus the constant separates nothing: any value in a broad band
around 0.15 gives identical behaviour. That is the profile of a *safely* placed constant, and it is
the only one in the table with that profile.

`decisiveForegroundPolarity` = 0.6 is the opposite and is the clearest fence in the set: it is
consulted only 300 times across 154 artworks, but 19 % of those evaluations flip under ±20 %. A rule
that is almost never asked, and is nearly always borderline when it is, is a rule fitted to the cases
that produced it — and it is also the constant for which **no anchor exists anywhere in the repo**.

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
