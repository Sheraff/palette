# Adversarial logic review of `research/v2-3/`

> ⚠️ **CORRECTION — read `VERDICTS.md` before acting on anything measured here.**
> Every probe in this document ran on `images/*-scrambled.*`. The tracked `images/`
> directory contains **only** the scrambled decoys; the reviewed corpus
> (`images/birdsofprey.jpg`, …) is gitignored and absent from a fresh worktree.
> Scrambling preserves the colour histogram and destroys the spatial structure the
> field/gradient/transition machinery consumes, so **every zero-effect claim below is
> unreliable.** `VERDICTS.md` re-measures on 118 real artworks and **retracts findings
> 4, 7 and 8 and weakens 13** — the transition stack, diffuse-composite domains,
> endpoint refinement and the source-eligibility filter are all load-bearing.
> The **static** findings (dead flags, duplicated code, inert `hardMinimum`, the 135°
> render, the duplicated block lists) are corpus-independent and stand; their
> per-image counts are restated in `VERDICTS.md` §5.

Scope: the full runtime (`index.ts` + `src/internal/`, 10,530 lines) at
`research/palette-0.9-checkpoint` (`4b0ffdf`, contains `d5f2003` "integrate Track E
mark-support substitution"). No file under `research/v2-3/` was modified. Probes live
beside this file and were run over all 34 base artworks in `images/`:

| probe | what it measures | artifact |
| --- | --- | --- |
| `probe-pipeline.ts` | stage timings, winner-deciding comparison, promotion/midpoint/mark firing | `probe-results.json` |
| `probe-mechanisms.ts` | tie-break content, transition/refinement/diffuse-domain yield, midpoint guards | `probe-mechanisms.json` |
| `probe-registry.ts` | is the all-ranked-lane proposal pass load-bearing; emergency reachability | `probe-registry.json` |
| `probe-guards.ts` | source-eligibility envelope margin, band-extent domination guard, APCA sign flips | `probe-guards.json` |
| `probe-obligations.ts` | identity-obligation slot occupancy and chroma | `probe-obligations.json` |
| `probe-representativity.ts` | representativity of selectable family representatives | `probe-representativity.json` |

Typecheck (`tsc -p research/v2-3/tsconfig.json`) and `research/v2-3/test/architecture.test.ts`
pass unchanged.

Headline: **three of the seven reviewed integrations cannot fire at all on the corpus**
(diffuse-composite domains: 0 eligible; field-axis-neutral promotion envelope: promotion
never fires; and the transition-path midpoint route it feeds), a fourth (`authorizedIdentity`)
is structurally unreachable on 8/34 artworks, ~38 % of runtime is provably redundant
recomputation, and the *most common* thing that decides the winner is the ASCII order of a
hex string.

---

## 1. The detected gradient geometry is measured, scored, and then discarded at render

`index.ts:34` and `index.ts:62` hard-code `angleDegrees: 135`, and `policy.ts:41` freezes
`cssDirectionDegrees: 135`. Measured over the 9 gradient winners:

| detected topology / direction | winners |
| --- | --- |
| `radial-center` / `center-out` | 7 |
| `radial-upper-center` / `center-out` | 1 |
| `linear` / `horizontal` | 1 |
| `linear` / `diagonal-down` (what 135° actually is) | **0** |

Every gradient the algorithm ships renders a geometry it did not detect. This is not only a
render-fidelity loss — it invalidates the evidence chain:

* `fieldSamples` (`palette-core.ts:2841-2846`) measures the APCA path along a *linear*
  `mixOKLab(background, surface, t)` ramp. For a radial field that path does not exist in the
  source and does not exist in the render either. `foregroundUtility`, `accentUtility`,
  `activeRolePathObservability`, `gradientSignAgreement` and the whole
  `contrastSamplePositions` machinery are therefore computed against a third field, distinct
  from both the artwork's and the renderer's.
* `renderedFieldClaimScore` (`winner-scoring.ts:516`) is documented as "score of the rendered
  field claim" but scores the *detected* field's evidence strength, which is not what gets
  rendered.
* `PaletteExtraction` (`index.ts:41-47`) has no field that can carry direction or topology, so
  a consumer cannot recover it either. `researchRender` only appears when a source-supported
  midpoint is earned — 2/34 images.

**Direction.** Either carry `gradientEvidence.topology`/`direction` into the render contract
(smallest change: replace the frozen 135° with an angle derived from the winner's direction,
and add a `radial` field kind), or — if the 135° contract is immovable — restrict
`earnedGradientClaim` to linear/diagonal-down fields so the algorithm stops claiming gradients
it cannot render. Whichever way, `fieldSamples` should sample the field that will actually be
rendered.

## 2. The chord-deviation midpoint's second guard kills exactly the cases the first one selects

`palette.ts:226-229`:

```ts
// A midpoint that is merely one of the endpoints again carries no information and would
// render as the same two-stop ramp.
if (Math.min(okDistance(evidence.oklab, winner.background.oklab),
             okDistance(evidence.oklab, winner.surface.oklab)) < familyBinStep) return NO_MIDPOINT
```

The comment is false whenever the chord deviation is large. A three-stop
`background → M → surface` with `M ≈ background` is a *strongly* different ramp from
`background → surface`; it is a ramp that dwells near one endpoint and then runs. Measured over
every eligible gradient candidate on the corpus:

* 2,741 candidates carry `fieldMidpoint` evidence;
* 2,192 pass the chord-deviation test (`chordDeviation ≥ familyBinStep`);
* only 995 also pass the endpoint-proximity test — **1,197 (44 %) are killed by the second
  guard alone**.

At winner level, 7 of the 9 gradient winners lose their third stop, and the three with the
*largest* chord deviations are among them:

| winner | chordDeviation | min distance to an endpoint | binStep | outcome |
| --- | --- | --- | --- | --- |
| muse | 0.2689 | 0.0000 | 0.04 | suppressed |
| once | 0.1502 | 0.0134 | 0.04 | suppressed |
| placebo | 0.1251 | 0.0177 | 0.04 | suppressed |
| horsley | 0.0439 | 0.0427 | 0.04 | rendered |
| doja | 0.0669 | 0.0440 | 0.04 | rendered |
| havana | 0.0422 | 0.0149 | 0.04 | suppressed |
| slim | 0.0421 | 0.0101 | 0.04 | suppressed |

On `placebo` and `slim` the endpoint rule kills **100 %** of chord-passing candidates
(275→0 and 120→0).

A midpoint 0.27 OKLab off the chord that coincides with an endpoint is strong evidence that the
field is *not* monotone between the selected endpoints — which is precisely the situation the
third stop exists for. Compounding: the midpoint was measured on the fit's own position
function (`palette-core.ts:2244-2279`, `FIELD_MIDPOINT_BAND = [0.42, 0.58]` of the *detected*
geometry) but is published at position 0.5 of a 135° linear ramp (finding 1).

**Direction.** Replace the endpoint-proximity veto with a test on what the render would
actually differ by — e.g. require `okDistance(M, mixOKLab(bg, surface, 0.5)) ≥ binStep`
(already the first test) and drop the second, or gate on the *rendered* three-stop path
differing from the two-stop path by ≥ binStep somewhere, which is the property the comment
claims to be testing. Re-measure gradient neutrality in both directions per charter rule 5.

## 3. Identity-obligation slots are 52 % occupied by families that can never earn identity authority

Two mechanisms disagree about what an identity direction is.

* The shortlist (`palette-core.ts:2770-2805`) ranks candidates by
  `regionEvidenceLevel` = `evidenceLevel(connectedRegions[0].observation.signatureAccent.score)`,
  then `signatureRoleScore`, then `connectedPopulationFraction`. **No chroma term anywhere.**
  Cap: `bounds.identityObligations = 4`, plus one reserved major family
  (`identity.reservedMajorFamilyPopulationFraction = 0.06`).
* The consumer (`base-scoring.ts:266-284`, `identityDirections`) skips every credited colour
  with `chroma < identityDirectionChroma = 0.06`, and `authorizedGain` is built from the
  surviving directions only.

Measured (`probe-obligations.json`): 152 obligation slots across the 31 non-degenerate
artworks, **79 (52 %) held by families with chroma < 0.06**. On 8 artworks *every* slot is
near-neutral — `black`, `elephunk`, `horrorwood`, `meteora`, `once`, `orelsan`, `placebo`,
`slipknot` — so `authorizedIdentity` (the reviewed Track C integration, the one mechanism that
lets identity overturn a quality margin) is structurally unreachable there. The cap is
saturated on all 31 (4 or 5 obligations from a 16-family signature lane), so every near-neutral
slot displaces a real candidate.

**Direction.** Make the selector's ranking criterion agree with its consumer's admissibility
criterion: either add a chroma/hue-novelty term to the obligation ordering, or split the
budget (N chromatic slots + M unrestricted), or let a near-neutral family be nominated but not
consume a capped slot. Guard against the inverse failure the reserve was added for (a broad
near-neutral field family being erased) by keeping the reserved slot chroma-free.

## 4. Fourteen of thirty-four winners are decided by ASCII hex ordering

`compareEvaluations` (`winner-scoring.ts:648-697`) ends in
`compareAscii(first.key, second.key)`, where `key` is
`"#bg:#surface:#foreground:#accent:flat"`. Measured deciding stage between the top two
Pareto-frontier members:

| deciding comparison | images |
| --- | --- |
| `compareAscii(key)` — hex string order | **14** |
| `relationUtility` quantized band | 12 |
| single frontier member (degenerate images) | 3 |
| `endpointBandSpread` tie-break | 2 |
| sorted evidence levels | 1 |
| `identityAuthorizedGain` band | 1 |
| raw `identityGain` | 1 |

Frontier sizes are 50–263 (median ≈ 112, 12.5 % of the eligible domain), so the tie group is
not an artefact of a tiny domain.

Severity is bounded but the mechanism is wrong: in all 14 cases the two tied treatments share
every family assignment, collapse state and gradient flag, and differ only in which
*representative* of each family was chosen (max role distance 0.0158 OKLab, min 0.0006). That
is exactly the case `BAND_TIE_BREAK`'s own doc-comment describes
(`winner-scoring.ts:209-225`) — and there is a `same-family-raw-utility` setting that would
resolve it by raw `relationUtility` (which differs by up to 0.0139 between the tied pair, i.e.
the signal exists and is deliberately thrown away). But the shipped setting is
`same-family-band-extent`, whose branch is gated on
`first.treatment.gradient && second.treatment.gradient` (`winner-scoring.ts:676`), so it never
applies to a flat pair. The band-extent integration fixed the gradient half of the problem and
left the flat half to `strcmp`.

**Direction.** Make the same-family case fall back to raw `relationUtility` for flats too —
i.e. `same-family-band-extent` for gradients *and* `same-family-raw-utility` otherwise (the two
are not exclusive; the flags are currently modelled as if they were). The combination is one of
several untested flag products (see finding 12).

## 5. Two divergent "support quality" formulas are both summed into the winner objective

| | `supportQuality` (`palette-core.ts:1022-1032`) | `roleSourceSupport` (`palette-quality.ts:46-64`) |
| --- | --- | --- |
| perceptual density | 0.28 | 0.26 |
| total support (mark-substituted) | 0.22 | 0.20 |
| connected support (mark-substituted) | 0.22 | 0.20 |
| spatial coverage | 0.16 | 0.14 |
| concentration | — | 0.10 |
| prototype distance | 0.12 | 0.10 |
| family-declaration check | none | returns 0 if `anchorFamilyId !== declaredFamilyId` |
| feeds | `representativeness` (winner weight **0.10**) | `sourceSupport` (winner weight **0.10**) |

Twenty percent of `qualityUtility` is one quantity measured twice under two different
definitions, and the two disagree about whether family-role agreement is part of "support" and
whether concentration counts. `roleSourceSupport` also de-duplicates by
`hex + familyRole` and takes `0.65·mean + 0.35·min`, while `representativeness` takes a plain
mean over distinct RGB — so the same treatment is penalised for a weak role once softly and
once hard.

**Direction.** Pick one definition, export it once, and make the second axis measure something
genuinely independent (e.g. *worst-role* support versus *mean* support) rather than a
re-weighting of the same terms.

## 6. Three unrelated quantities are all called "identity" and all enter the objective

1. **`artworkIdentity`** (`palette-core.ts:3153`) =
   `0.48·fieldCoverage + 0.25·foregroundIdentity + 0.27·accentIdentity`. Nearly half of it is
   `fieldCoverage`, a background/surface *population* term with no relation to any obligation.
   Winner weight 0.11 — the largest of the three identity terms, and the least about identity.
2. **Identity coverage / gain / authorized gain** from `IdentityObligation`
   (`base-scoring.ts:301-417`), selected from the *signature* lane. Winner contribution up to
   `0.05 + 0.08`.
3. **`RoleSpecificIdentityObligation`** (`role-obligations.ts`), a *field-conditional* role
   classifier. 1,860 obligations built across the corpus. Its coverage
   (`roleSpecificObligationCoverage`) is consumed only by `evaluateTransitionCandidates`, which
   never fires (finding 8) — so this entire second obligation system is computed and discarded.
   Only its by-product `FamilyRoleRequirement` (via `role-evidence.ts:62-70`) actually reaches
   the objective, and only for families that are already in system 2's obligation list
   (`confidence: 0` and `requiredRole: "ambiguous"` for every other family).

Also, one constant carries two meanings: `identityDirectionChroma = 0.06` is both the floor for
"this colour is an identity direction" (`base-scoring.ts:275`) and the ceiling for "this
foreground is chromatic enough to lose its foreground premium"
(`base-scoring.ts:222`). Tuning either intent moves the other.

Related: `decisiveCoverage` in `transition-promotion.ts:84` is
`foregroundCoveredCount + accentCoveredCount`, deliberately excluding
`ambiguousCoveredCount`. Measured over the corpus the winners cover 18 decisive and **26
ambiguous** obligations — so even if promotion were revived, the
`decisiveCoverage > baselineDecisiveCoverage` gate would ignore the majority of the coverage
the same function computes.

**Direction.** Rename to what each measures (`fieldPopulationBreadth`, `obligationCoverage`,
`fieldConditionalRoleFit`); decide whether `artworkIdentity`'s field-coverage half belongs in an
identity axis at all; and either revive system 3's coverage as a live consumer or delete it.

## 7. The APCA `hardMinimum` the charter mandates is inert

Charter rule 2: *"The hard minimum must remain a **parameter** a library user can raise,
defaulting to the current behavior."*

`policy.ts:47-53` declares:

```ts
contrast: Object.freeze({
    metric: "apca-w3-0.1.9-signed-lc",
    hardMinimum: 0,
    requiredForegroundObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
    distinctAccentObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
    ...
```

`hardMinimum`, `requiredForegroundObservability` and `distinctAccentObservability` are **read
nowhere in the runtime** (grep over `index.ts` + `src/` returns only the declaration). The
actual gate is `hasPeakAPCAObservability` (`palette-core.ts:2892`), a hard-coded
`value !== 0` test used at `palette-core.ts:3129-3134` and `3090-3099`. Raising `hardMinimum`
to 15 changes nothing. The parameter the charter requires does not exist; only its name does.

**Direction.** Thread `hardMinimum` into `hasPeakAPCAObservability` as
`Math.abs(value) > hardMinimum` (defaulting to `0`, which is byte-identical to today), and
either implement or delete the two prose observability strings.

---

## 8. The entire native-field-transition stack yields nothing — ~1,400 lines, 0 output

Measured over all 34 images:

| quantity | corpus total |
| --- | --- |
| transition traces built (`discoverNativeFieldTransitions`) | **1** |
| eligible traces | 0 |
| transition hypotheses | 0 |
| `creditedHypothesisIds` (transition envelope) | 0 |
| eligible supported paths (`gradient-support.ts`) | 0 |
| candidates with `earnedNativeTransition` | 0 |
| `promotionEligible` candidates | 0 |
| **images where `transitionPromoted` is true** | **0 / 34** |

Trace rejection reasons across the whole corpus (one trace, five reasons): *no source-connected
low-step spatial progression joins the endpoints*, *owns fewer than two corner fields*, *large
spatial discontinuity*, *reverses perceptual progression*, *perceptually circuitous*. Only one
endpoint pair is ever even proposed — the six simultaneous endpoint criteria at
`field-transition.ts:304-321` (`ENDPOINT_MINIMUM_POPULATION = 0.055`, `fieldScore ≥ 0.38`,
`componentFamilyFraction ≥ 0.55`, `borderCoverage ≥ 0.035`, owns a corner, long span ≥ 0.5)
admit fewer than two distinct families on 33/34 artworks.

Everything downstream is consequently dead code with respect to output:

| file / symbol | lines | status |
| --- | --- | --- |
| `field-transition.ts` | 997 | region graph built twice per image, 0 hypotheses |
| `gradient-support.ts` | 210 | `evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath` result never consumed |
| `transition-normalization.ts` | 107 | credits 0 hypotheses |
| `transition-promotion.ts` | 99 | `promotionEligible` always false |
| `PROMOTION_ENVELOPE` / `promotionEnvelopeUtility` / `FIELD_CLAIM_AXES` | `winner-scoring.ts:227-266` | the *reviewed* "field-axis-neutral promotion envelope" — never evaluated |
| `TRANSITION_PROMOTION_ORDER` / `compareTransitionCandidates` | `winner-scoring.ts:207`, `palette.ts:87-100` | never reached |
| `MAXIMUM_WINNER_QUALITY_LOSS` | `transition-promotion.ts:15` | never binding |
| flat-fallback branch of `applyGradientSupport` | `palette.ts:275-298` | never reached |

That is ≈ 1,400 of 10,530 runtime lines (13 %) with zero measured effect, still costing
≈ 9.5 s per corpus pass. Note also `TRANSITION_PROMOTION_ORDER = "coverage-first"` even though
its own doc-comment says human review *contradicted* that ordering — a flag left at the value
the comment argues against, and unmeasurable because the code never runs.

**Direction.** Decide explicitly. Either (a) loosen the endpoint gate until the mechanism
produces candidates and re-review it, or (b) delete the stack and keep only what the gradient
route actually uses. Leaving it as-is costs 13 % of the surface area every agent must read and
guarantees future "integrations" will be built on a branch that never executes.

## 9. Every gradient winner bypasses the supported-gradient-path guard

`palette.ts:261-273`:

```ts
const selectedGradient = selection.transitionPromoted && baseline.gradient
const path = selectedGradient ? paths.paths.find(...) ?? null : null
if (!selectedGradient || path?.eligible === true) { ...return baseline... }
```

Since `transitionPromoted` is false on 34/34 (finding 8), `selectedGradient` is always false,
so the "gradient winner whose supported path is ineligible falls back to flat" branch is dead —
measured: **9/9 gradient winners bypass it**. Meanwhile
`evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(common.evidence.native)` is
evaluated *eagerly* as an argument at `palette.ts:371` on every image, rebuilding the whole
region graph, and its result is then never read.

This is a guard that a later mechanism silently bypassed: a gradient that reaches the winner
slot *without* transition promotion is never checked against supported-path evidence at all,
which is the opposite of what the `applyGradientSupport` name and the gradient-neutrality
charter rule imply.

**Direction.** If the guard is meant to apply to gradients generally, drop
`selection.transitionPromoted` from `selectedGradient`; measure both directions of gradient
neutrality. If it is genuinely promotion-specific, stop computing `paths` when nothing was
promoted.

## 10. Diffuse-composite field domains: 134 built, 0 eligible

The reviewed Track D integration (`palette-core.ts:1665-1730`) runs `fieldCompositeFamilyIds`
plus a second full-image flood-fill pass. Measured: **134 diffuse-composite domains across 16
images, 0 eligible** (against `connected`: 1,351 built / 25 eligible; `paired-corridor`: 6 / 5).
Ineligible domains are filtered out at `fitGradients` (`palette-core.ts:2039`), so the pass
contributes nothing to any output.

The eligibility test they must pass is the same one written for lane domains
(`populationFraction ≥ 0.08`, `ownedCornerCount ≥ 2`, `weightedFieldScore ≥ 0.35`), plus a
redundancy veto (`laneShapes.has(shape) || overlapsLaneProposal`, `palette-core.ts:1827`) that
drops any composite region touching a field the lane walk already proposes — which is most of
them, since the composite is a superset of the lane.

**Direction.** Instrument which of the three thresholds each of the 134 fails (a one-line probe
extension) before deciding whether the mechanism needs different thresholds or should be
removed. As it stands the "reviewed strong" verdict is not reproducible on the base corpus.

## 11. Band-local endpoint refinement: 24 % of runtime, 2 acceptances, 0 winners

`endpoint-refinement.ts` is 972 lines and costs **48.5 s of the 205 s corpus pass (24 %)**.
Measured: 186 refinements attempted, **2 accepted** (`havana`, `infected`). Those two produce
535 supplemental candidates. Winner hypothesis kinds across the corpus:

| hypothesis prefix | winners |
| --- | --- |
| `one:` | 15 |
| `flat:` | 10 |
| `gradient:` | 9 |
| `endpoint-refinement:` | **0** |

The families it builds are also deliberately blinded: `buildFamily`
(`endpoint-refinement.ts:713-722`) hard-codes `signatureScore: 0`, `foregroundScore: 0`,
`foregroundTypographyObservation: 0`, `signatureAccentObservation: 0`, `markSupport: 0`,
`observedComponentCount: 0`, and `componentEvidence` marks every component
`retainedFor: ["connected-support"]` only — so `roleObservations`
(`role-obligations.ts:117-121`) sees nothing for them. They are then injected into
`augmentedNative.families` (`candidate-domain.ts:147-169`) and classified anyway by
`buildRoleEvidence`, producing guaranteed-zero role evidence for every field hypothesis.

**Direction.** Either raise its yield (the acceptance path requires *ten* independent
conditions to hold simultaneously across two bands) or gate the whole module behind a cheap
precondition so 24 % of runtime is not spent on 186 rejections.

## 12. Dead flags, dead thresholds, dead scores

**Flags whose "off" value makes their machinery unreachable:**

| flag | value | dead as a result |
| --- | --- | --- |
| `WINNER_RANKING_HYPOTHESES.identityAuthority` | `false` | `IDENTITY_AUTHORITY` (`winner-scoring.ts:82-90`); `WINNER_SCORING_POLICY.maximumIdentityGain` is then never read |
| `FIELD_OWNERSHIP.weightTransfer` / `fieldFidelityWeightBoost` | `0` / `0` | `fieldOwnershipWeights()` (`winner-scoring.ts:289-305`) always returns `BASE_QUALITY_WEIGHTS`; the `RangeError` at line 299 is unreachable |
| `FIELD_OWNERSHIP.applyToEconomy` / `decorrelateEconomy` | `false` / `false` | `fieldOwnershipEconomy` is the identity function; `decorrelatedEconomy` (`winner-scoring.ts:407`) is dead. `fieldOwnershipBeforeCollapseEconomy = true` therefore does exactly one thing: substitute `collapsedSurfaceFidelity = 0.45` |
| `GRADIENT_CLAIM.signAgreementFloor` | `0` | `Math.max(0, relaxed)` (`winner-scoring.ts:494`) is a no-op |
| `GRADIENT_CLAIM.claimAxis` | `"evidence-strength"` | `endpoint-source-fidelity`, `honest-claims-only`, `earned-only`, `legacy-salience` branches (`winner-scoring.ts:522-537`) |
| `GradientFitOptions.additionalGeometries` | `false`, only call site uses defaults | the 4 `angle-*` and 3 `radial-offset` definitions (`palette-core.ts:2029-2037`), plus their branches in `gradientPosition` (`2001-2009`) and `rawGradientPosition` (`endpoint-refinement.ts:315-324`). `GradientDirection` has 7 members no code path can produce |
| `SeedMechanics.representatives` | only ever `"control"` | `palette-core.ts:3753-3755` and `3797-3799`; `observableForegrounds`/`observableAccents` are computed and discarded each iteration |

**`gradientExpected` is computed at the cost of a duplicate scoring pass and then ignored.**
`scorePaletteCandidates` (`winner-scoring.ts:707-712`) runs a *second* full
`albumArtworkPaletteV2Phase3SelectorV2Quality` over every treatment (up to 1,500) purely to
build `earnedGradientClaims` and pass `gradientExpected`. Its only effect is to turn
`not-applicable` into `missing` in `gradientStatus`. Under `claimAxis: "evidence-strength"`,
`renderedFieldClaimScore` returns `0` for both, and no other consumer distinguishes them. The
doc-comment at `winner-scoring.ts:512-518` argues `missing -> 0` is "load-bearing" — that
argument is about `honest-claims-only`, which is off. Likewise
`renderedGradientSalience` (`palette-quality.ts:126-134`) is computed and passed as `salience`
which the `evidence-strength` branch never reads.

**The wave-1 Pareto pass is computed and thrown away.** `base-scoring.ts:494-505` runs an
O(n²) dominance pass (up to 1,500 unique evaluations → 2.2 M comparisons × 10 axes) and returns
only `{ evaluations }`. `paretoMember` / `dominatedByKey` are never read by `winner-scoring.ts`,
which recomputes its own dominance from scratch; `frontier` exists solely to throw when empty.
Same for `dominatedByKey` in `winner-scoring.ts:721` (an O(n²) *sort* of the dominator list per
candidate, whose result is used only for `[0]?.key`, which nothing reads).

**The declared quality guard does not exist.** `ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS`
(`policy.ts:1-11`) is used only to build `..._COMPLETE_QUALITY_GUARD_BLOCKS`, which is used
only to populate `identity.qualityGuard.blocks` — never read. `policy.ts:121` declares
`winnerPrecedence: "quality-incumbent-then-quality-guarded-obligation-coverage-and-priority"`;
the code (`winner-selection.ts:51-54`) performs no guarded challenge — it throws if the
source-eligible winner is more than `0.12` below the unrestricted one. Name and computation
disagree.

**Emergency band is never the reason.** `contrast.emergencyMaximumAbsoluteLc = 5`
(`policy.ts:52`). Measured: emergency is eligible on 3/34 (`pureblack`, `purered`,
`purewhite`), always via `degenerate-supported-domain` (`supportedPairCount === 0`). The
`all-supported-pairs-effectively-contrastless` branch (`palette-core.ts:2940`) never fires, so
the Lc<5 threshold has never decided anything.

**Never-read score fields.** `rankingScore` and `balance` (`palette-core.ts:3207,3211`) are
computed for every candidate and read nowhere; their exclusive inputs `foundation`,
`uiUtility`, `generatorConfidence` are therefore dead too. Likewise `spatialRelation`,
`pruningNotes`, `laneRetention`, `retainedFamilyIds`, `IdentitySelectionTrace`,
`availableRolesByObligationFamily`, `foregroundPeakUnobservableRejectedOptionCount`,
`distinctAccentPeakUnobservableRejectedOptionCount`, `perceptualBinCount`, `outlierScore`,
`observedComponentCount`, `markComponentCount`, `legacyEligible`, `stagePopulationFractions`,
`identityRoles`.

**Surviving pre-campaign defects.**
* `palette-core.ts:3085-3086` — duplicate throw, second condition unreachable:
  `if (surfaceCollapsed && treatment.gradient) throw …` then
  `if (treatment.gradient && surfaceCollapsed) throw …`.
* `palette-core.ts:849` — dead ternary: `* (role === "typography" ? 1 : 1)`.

## 13. Which ranking regime actually decides — measured

| regime | where | how often it decides |
| --- | --- | --- |
| **Lexicographic evidence blocks** (`MATERIALIZATION_RANKING_BLOCKS`) | `candidate-materialization.ts:61-72` | selects which candidates survive the 1,500 cap; **the cap binds on 22/34 images**, so this regime governs domain composition on 65 % of the corpus (materialized counts: 2, 2, 4, 863, …, 1500 ×22) |
| **Lexicographic blocks, second copy** (`ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS` via `compareParetoTreatments`) | `palette-core.ts:3018-3027`, called at `4044` | only in the "hypothesis produced no treatment" fallback — 2 images |
| **Quantized Pareto dominance** | `winner-scoring.ts:605-633` | changes the winner relative to the plain sorted order on **5/34** |
| **Weighted sums** (`relationUtility` / `qualityUtility` bands) | `winner-scoring.ts:656-669` | 12/34 (`relationUtility`), 1/34 (`qualityUtility`), 1/34 (raw `identityGain`) |
| **Structural tie-breaks** | `winner-scoring.ts:684-696` | sorted evidence levels 1/34, per-axis 0/34, band-extent 2/34, **ASCII 14/34** |

The two lexicographic block lists are **byte-for-byte identical** (`ranking-policy.ts:1-13` vs
`policy.ts:13-25`) with no shared source and no assertion tying them together. Whichever agent
edits one will silently desynchronise the candidate-cap ranking from the fallback ranking.

Additional findings on the dominance regime:

* The band-extent guard sits **before** the identity and axis checks
  (`winner-scoring.ts:610-617`) and `return false`s outright. A same-family gradient pair with
  more band spread is therefore immune to domination even by a treatment that is strictly better
  on *every* quality axis **and** on authorized identity. Measured: it adds 1–9 frontier members
  on 7/34 images, and changes the frontier's top pick on 1/34 (`havana`).
* `authorizedIdentity` is the most load-bearing of the new mechanisms: removing it from
  `dominates` changes the frontier top pick on 4/34 (`havana`, `muse`, `skap`, `ybbb`) and
  shrinks the frontier substantially (`vvbrown` 50→27, `birdsofprey` 152→106).
* The hue-aware sign guard fires on candidates on 6/34 images (up to 235/360 gradient candidates
  on `once`) but **no winner on any image has mixed APCA signs across the gradient samples** —
  consistent with the guard working, but its marginal effect on the winner is unmeasured because
  it never has to break a tie at the top.

## 14. Source-eligibility filtering: a full extra scoring pass that changes nothing measurable

`selectSourceEligibleWinner` (`winner-selection.ts`) filters ~21 % of the domain
(eligible/materialized median 0.79) and re-runs `scorePaletteCandidates`. Measured
`unrestricted.qualityUtility − eligibleWinner.qualityUtility`: **exactly 0 on 33/34 images**,
0.019 on `black`, against an envelope of 0.12. The throw at `winner-selection.ts:51-54` has
≥6× headroom and has never been near firing; the filter has never changed the winner's quality.

`source-eligibility.ts` is 262 lines plus ~3 % of runtime for a re-scoring pass. It is a
correctness invariant, not a selector — which is fine, but it is currently paid for as if it
were a selector.

**Direction.** Keep it as an assertion over the *selected* winner (check the one candidate, not
re-rank 1,100), and delete the second `scorePaletteCandidates` call.

## 15. Runtime: ~38 % of 205 s is provably redundant

Measured over 34 images (median 4.4 s, max 20 s — well above the "2-5 s" assumption):

| stage | corpus total | share |
| --- | --- | --- |
| `buildPaletteSeedDomain` | 91.9 s | 45 % |
| `buildAlbumArtworkPaletteV2Phase3CommonBase` | 86.7 s | 42 % |
| `scorePaletteCandidates` (full domain) | 10.0 s | 5 % |
| `selectSourceEligibleWinner` (incl. re-score) | 5.9 s | 3 % |
| everything else | 10.4 s | 5 % |

Isolated sub-costs (`probe-mechanisms.json`): `buildNativePaletteEvidence` 14.1 s,
`diagnoseGradientFits` 34.5 s, `buildBandLocalEndpointRefinements` 48.5 s,
`discoverNativeFieldTransitions` 5.1 s, `discoverSupportedNativeFieldTransitionPaths` 4.4 s.

Redundancy:

* **`buildBackgroundFieldDomains` + `evaluateGradientFits` run three times per image on the
  same evidence**: `palette-core.ts:3872-3873`, again on all-ranked-lane evidence at
  `3888-3891`, and a third time via `diagnoseGradientFits` in `candidate-domain.ts:247`.
  One pass ≈ 34.5 s per corpus, so ≈ 69 s is recomputation. The seed already computed the fits
  the common base needs; they are simply not carried on `PaletteSeedDomain`.
* **The all-ranked-lane pass is measurably useless.** Its only consumer is
  `buildSourceRegistry`. Measured (`probe-registry.json`): it adds 0–1,292 non-control registry
  rows per image, and on **all 34 images** `nonControlUsedByAnyTreatment = 0` and
  `directionsNeedingNonControl = 0`. First-wins de-duplication at `palette-core.ts:3606-3609`
  guarantees a control proposal shadows any identically-identified all-lane proposal, and no
  treatment can reference a hypothesis id that no control proposal produced. ≈ 34.5 s per
  corpus (17 %) for rows nothing queries.
* **`buildRegionGraph` runs twice** (`candidate-domain.ts:245` and `gradient-support.ts:207`),
  each a full-image flood fill plus up to 66 BFS traversals, for zero output (finding 8).

**Direction.** Carry `fieldDomains` / `evaluatedGradientFits` on `PaletteSeedDomain` and drop
`diagnoseGradientFits`'s recomputation; delete the all-ranked-lane pass after confirming the
zero-usage result on a second corpus; memoise the region graph. That is ≈ 38 % of runtime with
no behaviour change, which is the cheapest available win for iteration velocity.

## 16. Duplication that is already drifting

* **The two ~100-line candidate-generation blocks are still there** and have already diverged:
  `palette-core.ts:3335-3429` (control) vs `3720-3829` (seed additions). Differences: the
  control loop slices accents to `distinctAccentsPerForeground` (line 3414) while the additions
  loop iterates the full retained list (3814); the additions loop carries an unreachable
  `"all"` branch. Any future change to accent ranking has to be made twice, correctly, in
  loops that are no longer identical.
* **Two `supportedGeometry` predicates with different semantics.**
  `candidate-domain.ts:56-64` **rejects** `radial-offset`; `palette-core.ts:4011-4021`
  **accepts** it (`center-0.35-0.50` etc.). Today the divergence is masked because
  `candidate-domain` filters first and `additionalGeometries` is off; enable either and the two
  disagree silently, with `constructAlbumArtworkPaletteV2Phase3SupplementalTreatments` throwing
  or admitting depending on which one ran.
* `assignFieldRoles` + `roleOwnershipProfile` duplicated: `field-transition.ts:441,457` vs
  `palette-core.ts:1063,1079` (`candidate-domain.ts` imports the exported one;
  `field-transition.ts` uses its private copy).
* `gradientPosition` (`palette-core.ts:1995`) vs `rawGradientPosition`
  (`endpoint-refinement.ts:312`) — identical bodies.
* `segmentAmount` / `distanceToSegment` duplicated (`palette-core.ts:1847,1854` vs
  `endpoint-refinement.ts:239,248`).
* `treatmentStructuralKey` duplicated (`palette.ts:69` vs `winner-scoring.ts:376`) — and the
  promotion path compares them across the two copies.
* `MAXIMUM_WINNER_QUALITY_LOSS = 0.12` (`transition-promotion.ts:15`) duplicates
  `WINNER_SCORING_POLICY.maximumQualityLoss = 0.12` (`winner-scoring.ts:313`) with no link.
* The evidence quantum `0.04` is declared five times: `base-scoring.ts:24`,
  `winner-scoring.ts:308`, `palette-core.ts:662` (`RANKING_EVIDENCE_RESOLUTION`),
  `candidate-materialization.ts:9` (`EVIDENCE_RESOLUTION`), `role-obligations.ts:16`
  (`orderingEvidenceResolution`). `0.005` twice.
* `compareAscii` / `clamp` are defined 24 times across the 12 runtime modules.

## 17. Representativity (charter rule 4) is applied unevenly — minor

`band-representative.ts` encodes the strict standard (`minimumNeighborhoodPopulation = 4`,
`minimumNeighborhoodShare = 0.02`, `minimumFieldSpreadRatio = 0.8`) and is used for **exactly
one colour in the pipeline**: the gradient field midpoint (`palette-core.ts:2257`).

Measured over every lane-eligible family representative the palette can actually select
(`probe-representativity.json`): neighbourhood *share* is healthy everywhere (minimum 0.32,
i.e. 16× the band standard), so there is no bare-pixel snapping. But 0–12 representatives per
image have a neighbourhood *population* below the 4-pixel absolute floor (`ybbb` 12,
`toxicity` 11, `disney` 10, `greenday` 8, `knuckles` 8) — tiny families that can nonetheless
supply a foreground or accent. Low risk, but the strict standard exists and is not applied.

**Direction.** Reuse `analyzeBandPopulation`'s `densitySupported` predicate as an admission
test for lane families, or at least apply the absolute pixel floor.

---

## Suggested ordering for follow-up work

1. **Finding 15 + 14** (mechanical, no behaviour change, ~38 % runtime back) — do this first;
   every subsequent experiment gets ~1.6× more iterations per hour.
2. **Finding 1** (gradient geometry discarded at render) — largest single output-quality gap;
   affects 9/34 outputs and invalidates the contrast evidence for all of them.
3. **Finding 2** (midpoint endpoint-proximity veto) — 5/34 outputs, small localised change.
4. **Finding 3** (obligation-slot crowding) — unblocks `authorizedIdentity` on 8/34 artworks.
5. **Finding 8 / 10 / 11** — decide-and-delete or decide-and-fix; whatever the answer, the
   codebase should stop carrying 2,500 lines that produce nothing measurable.
6. **Findings 4, 5, 6, 7, 16** — coherence repairs that reduce the chance the next incremental
   integration lands on a contradiction.
