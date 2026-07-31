# Track A — Winner Ranking And Selection

Branch: `worktree-agent-add3a333983c3a97c` (worktree of `research/palette-0.9-checkpoint`).
Target: the failure class the Phase 3 final showcase postmortem attributed to **ranking / custody** —
8 of the 10 below-acceptable winners, where a materially better treatment existed in the slate and
top-one selection picked a worse one.

Changes are in `research/v2-3/src/internal/winner-scoring.ts`, plus one `export` keyword in
`palette-quality.ts`. `research/v2-2/` untouched. Determinism, full resolution, the parametric APCA
floor, representativity, and architecture invariants unchanged.

> **Revision note.** This report was rewritten after the orchestrator measured the first
> configuration over the full 34-artwork base corpus and found 14 changed artworks, 8 of them
> unattributed by my original 15-case subset. Two of the three mechanisms in that configuration were
> wrong and have been replaced. The corrections are the substance of this experiment.

## Method

- `run-subset.ts` runs `research/v2-3/index.ts:extractPaletteFromBytes`. `--base-corpus` runs all 34
  unsuffixed base artworks — the exact corpus of the Phase 3 absolute review. **Every mechanism
  below was measured over all 34, not over a hand-picked subset.** That was the process error in
  the first round.
- `diagnose.ts` rebuilds the candidate domain for one image and dumps the ranked winner evaluations
  with per-axis evidence levels.
- `sign-flip-census.ts` counts materialized gradient treatments whose signed APCA samples change
  sign across the rendered field.
- `base-corpus-baseline.json` (all flags off) reproduces `research/v2-3/test/review-fixtures.ts`
  exactly on all 34 cases. With all flags off the ranking is bit-identical to the pre-change
  behaviour; the refactor itself is inert.
- Determinism: `meteora.jpg` and `greenday.jpg` each run twice under the adopted configuration →
  identical winners.
- `tsc -p research/v2-3/tsconfig.json` clean; `research/v2-3/test/architecture.test.ts` passes 2/2.
- The 34-fixture parity test is **expected to fail** for the 11 changed cases. No fixture was edited.

## Corrections to the first round

**1. The `renderedGradientSalience` lead as given (and as I repeated it) is wrong.**
`palette-quality.ts:118-126` does return 1 for a not-applicable flat, but `winner-scoring.ts` has
always overridden the axis to `status === "earned-rendered" ? salience : 0`. At winner level every
flat scored **0**, so the axis was a *pro-gradient bonus* of up to 0.08, not an anti-gradient
handicap. I verified the standalone function and not the override. My first fix (earned → 1)
therefore **doubled** a pro-gradient bonus while claiming to remove an anti-gradient bias, and it
promoted a reviewed-strong flat (`nada`) to a gradient.

**2. Both H2 mechanisms were wrong.** Measured separately over the base corpus:

| Mechanism | Changed | Reviewed failures fixed |
| --- | ---: | --- |
| `decorrelateEconomy` (drop `surfaceFidelity` from `economy`) | 6/34 | **none** |
| `weightTransfer` 0.04 `surfaceFidelity`→`fieldFidelity` | 8/34 | greenday, meteora, elephunk |

The decorrelation is structurally defensible (it removes a real double-count) and empirically
worthless: all cost, no benefit, including a `krafty` role swap and a `nada` collapse. The weight
transfer works but cuts the reward of a *distinct* surface as well as the collapse justification,
which demoted the reviewed-strong 4-colour flat `nada` to a 3-colour collapsed winner — the
opposite of the postmortem's collapse direction.

## Hypotheses (final)

### H1 `identityAuthority` — implemented, **disabled**

Coverage guards winner-level domination (it already guards wave-1 domination); coverage out-ranks
`qualityUtility` inside one utility band; winner-level `maximumIdentityGain` 0.05 → 0.10.

Verified against the numbers: `vvbrown`'s reviewed candidate is identical to the winner on 10 of 11
axes, loses only `accentPath` 17-vs-25, and is therefore *dominated off the frontier* despite 4× the
identity coverage — exactly the postmortem's account. `skap`'s alternative has strictly higher
`relationUtility` (0.7394 vs 0.7376) but loses because both fall in one 0.005 band and the tie is
then broken by identity-free `qualityUtility`.

Held: at gain 0.10 it undoes the `doja` fix, inverts `vvbrown`'s field polarity, restores `slim`'s
cyan foreground, and changes `nobs` (strong) red→purple. The two structural fixes at the unchanged
0.05 gain are untested and are the cheapest next experiment.

### H2 `fieldOwnershipBeforeCollapseEconomy` — **enabled**, mechanism replaced

*Claim.* For a collapsed surface, `palette-core.ts:2953-2962` sets
`surfaceFidelity = 1 - surfaceOpportunity`, where `surfaceOpportunity` is the best
`surfaceContribution` any *other* variant of the same background family achieved. It is a statement
about a different treatment. Comparing it across treatments with different background families
rewards choosing a background family that had **no good surface partner** — the inverse of field
quality, and the mechanism by which collapse economy beat field ownership.

*Evidence.* `greenday`: the black-field candidate has `fieldFidelity` 24 vs the winner's 16 (black
is 60.1% of pixels, fieldScore 0.972; white 23.9%, 0.676) and identity coverage 0.62 vs 0.32, and
loses purely on `surfaceFidelity` 9 vs 25.

*Change (`collapsedSurfaceFidelity`).* Replace **only the collapsed reading** with a constant.
Weights untouched; a distinct surface keeps its full honestly-measured contribution. Collapsed
treatments can then no longer out-score each other on the availability of alternatives. The constant
sets the global collapse-vs-distinct prior, and the corpus disagrees about it:

| Constant | Changed | Effect |
| --- | ---: | --- |
| 0.00 | 8/34 | Also fixes `skap` (the postmortem's exact 4-colour candidate `#ffffff:#bacd36:#000103:#5e753d`) and carries `vvbrown`'s bright yellow — but **breaks `black.jpg`**, a true 2-colour collapse control (5/5 strong stratum), and un-collapses `disney`. |
| **0.25 (adopted)** | 5/34 | `greenday`, `meteora`, `elephunk`, `johns` — all documented failures. Collapse controls intact. |
| 0.50 | 5/34 | Loses `johns`, and demotes reviewed-strong `nada` to collapsed. |

At 0.00 the `black.jpg` competitor claims a "distinct" surface of `#030303` against a `#000000`
background — a surface that is not perceptually distinct at all. The principled fix is a materiality
guard on distinct surfaces in the candidate domain, not a tuned constant; that is outside winner
ranking and is flagged as follow-up work.

### H3 `gradientClaimConsistency` — **enabled**, claim axis replaced

Three independent parts, now measured separately:

| Part | Changed | Verdict |
| --- | ---: | --- |
| `routeUnearnedFieldFidelity` — read the gradient-aware `fieldFidelity` so the unearned-claim penalty is not silently dropped at the one stage that picks a winner | 0/34 | Real defect, currently latent. Keep. |
| APCA sign agreement discount on the role paths | 1/34 | Fires on `birdsofprey` only. Keep — see below. |
| `claimAxis` | see below | Replaced. |

*Claim axis.* The defect the postmortem names is that `endpointSalience = clamp(distance / 0.18)`
rewards a fitted endpoint pair purely for being further apart in OKLab, so it beats exact dense
family representatives ("Abstract salience should not dominate source fidelity").

| Variant | Changed | Effect |
| --- | ---: | --- |
| `legacy-salience` | 0/34 | `doja` and `placebo` stay wrong. |
| `earned-only` (score 1) | 9/34 | Fixes `doja`/`placebo` but doubles the pro-gradient bonus: promotes `nada` flat→gradient, and combined with the new H2 demotes `doja` and `infected` to flats. |
| `honest-claims-only` (also score `missing` 1) | 9/34 | Demotes three reviewed gradients (`doja`, `infected`, `once`) to flats. `missing → 0` is load-bearing; the axis is not a simple honesty indicator. |
| **`evidence-strength` (adopted)** | 6/34 in combination | Drop only the endpoint-distance factor, keep `gradientEvidenceStrength` (progression, mode progression, monotonicity, edge continuity, coverage). Removes exactly the criticised term without inflating the magnitude. |

**`birdsofprey` is not a false positive.** Its baseline hot-pink accent `#d02981` has APCA sign
agreement **0.50** across the rendered gradient from `#141975` to `#3fa72a` — half the samples are
positive and half negative, so the accent crosses zero contrast and becomes invisible somewhere
inside the rendered field. Charter §2 names this defect class explicitly. The guard is right about
the defect; whether the remedy is a different accent or a different field is a human call.

## Results — full 34-artwork base corpus

Adopted = `collapsedSurfaceFidelity: 0.25` + `claimAxis: "evidence-strength"` + unearned routing +
sign guard. **11 of 34 changed** (down from 14), all attributed. Per-arm data in
`base-corpus-arms.json`.

| Case | Reviewed verdict | Baseline → adopted | Cause | Assessment |
| --- | --- | --- | --- | --- |
| `greenday` | weak, polarity inverted | `#fefefe #fefefe #000211 #c13033` → `#000211 #000211 #fefefe #c13131` | H2 | **Exact** postmortem candidate. Polarity corrected. |
| `meteora` | weak, khaki collapse | `#a48f72 #a48f72 #000000 #161109` → `#000000 #151108 #fafafa #a59073` | H2 | **Exact** postmortem candidate: black field, white foreground, khaki accent. |
| `elephunk` | weak, main blue omitted | `#022833 #022833 #f5fbd7 #a5c7c8` → `#55919b #022833 #fcfdd1 #a5c7c8` | H2 | Postmortem's families and roles (`#579099:#032833:#fcfdd1:#a5c7c8`), sibling representatives. |
| `johns` | weak, major blue omitted | `#0d181c #0d181c #f7f8fa #ff5a62` → `#0d181c #0e2340 #f7f8fa #ff5a62` | H2 | Partial: the omitted blue is now carried, as surface rather than the suggested accent. |
| `doja` | weak, wrong surface | `#fd75b5 #f79e80 #fff6fc #ce5e52` grad → `#fd75b5 #fd3d86 #fff6fc #fda8cf` grad | H3 claim axis | **Exact** postmortem candidate; the "two pink field shades" the reviewer asked for. |
| `placebo` | weak, endpoints unrepresentative | `#607b76 #a0a39a #fbfdfa #111312` → `#6c8a8a #86a5aa #fbfdfa #111312` | H3 claim axis | **Exact** postmortem candidate: dense family representatives instead of fitted endpoints. |
| `birdsofprey` | strong | accent `#d02981` → `#bcddb0` | H3 sign guard | Removes a measured zero-contrast crossing (sign agreement 0.50). The reviewer never saw the defect. Needs a human call. |
| `disney` | strong | `#c72690 #c72690 #fbfdfc #f68121` → `#74c044 #f68121 #fbfdfc #c72690` | H2 | **The one genuine regression-direction change.** Background magenta→green, un-collapses to 4 colours. Large identity shift on a strong case. |
| `infected` | strong | endpoints `#241a4e`/`#2b439d` → `#30388d`/`#2f2959` | H3 claim axis | Stays a gradient; endpoint pair re-picked. Unjudgeable without review. |
| `horsley` | strong | endpoints `#bd7042`/`#d6a944` → `#b8753e`/`#c99242` | H3 claim axis | Small representative shift inside the same families. Low risk. |
| `orelsan` | strong | endpoints `#293949`/`#0c1222` → `#2a2f42`/`#111a2b` | H3 claim axis | Small shift, both dark blue-greys. Low risk. |

Reported as changed by the first configuration and now **restored to their reviewed winners**:
`artofficial`, `krafty`, `loups`, `nada`, `havana`, `muse`. All six were artefacts of the two
rejected H2 mechanisms or of `earned-only`.

Unchanged reviewed failures: `skap`, `vvbrown`, `slim`, `loups`. `loups` is a documented
field-topology availability failure, not a ranking failure, and is out of scope for this track.

## Honest assessment

- **Six of the eleven changes are on documented reviewed failures**, and four of those land on the
  postmortem's *exact* cited candidate hexes (`greenday`, `meteora`, `doja`, `placebo`). Those were
  not fitted to; they fell out of removing mechanisms that were provably measuring the wrong thing.
- **`disney` is the only change I cannot defend.** It is a strong case, the background changes
  family, and nothing in the review evidence says the new answer is better. It is caused by the
  collapsed-surface constant, and no value of that constant both preserves `disney` and fixes
  `elephunk`/`meteora` — those cases genuinely disagree about the collapse-vs-distinct prior. It
  must go to human review; a "worse" verdict is a reason to raise the constant and accept losing
  `johns`.
- **The collapsed-surface constant is a tuned parameter (0.25).** The *structure* — do not import a
  statement about another treatment — is principled and I stand behind it. The magnitude is not
  derived, and the corpus shows it trades `skap`/`vvbrown` (fixed at 0.00) against the two-colour
  collapse control (broken at 0.00) and `nada`/`johns` (0.50). A materiality guard on
  perceptually-degenerate distinct surfaces would probably let the constant go lower safely.
- **`slim` — the only *unacceptable* case — is still not fixed.** Its `sourceSupport` differs by one
  evidence level between the 0.1%-population cyan foreground and the gray counterexample, because
  the axis averages four roles. A foreground-specific support axis is the obvious next arm.
- **I under-measured in round one.** A 15-case subset chosen from the failure list cannot show
  blast radius; three of the four mechanisms I originally shipped were only visible as wrong at 34
  cases. Every future arm in this track should be measured on `--base-corpus` before any claim.
- **Coverage caveat.** 34 images, all development evidence. Nothing here estimates generalization.

## Proposed human review batch (7 items)

Before/after, absolute verdict on "after" plus a preference between the two.

| # | Image | Comparison | Decides |
| --- | --- | --- | --- |
| 1 | `greenday.jpg` | `#fefefe/#fefefe/#000211/#c13033` → `#000211/#000211/#fefefe/#c13131` | Field polarity. Clearest polarity test in the corpus. |
| 2 | `meteora.jpg` | `#a48f72/#a48f72/#000000/#161109` → `#000000/#151108/#fafafa/#a59073` | Black field + white foreground + khaki accent, the postmortem's literal ask. |
| 3 | `elephunk.jpg` | `#022833/#022833/#f5fbd7/#a5c7c8` → `#55919b/#022833/#fcfdd1/#a5c7c8` | Main medium blue promoted to background with a distinct dark surface. |
| 4 | `doja.jpg` | `#fd75b5/#f79e80/#fff6fc/#ce5e52` grad → `#fd75b5/#fd3d86/#fff6fc/#fda8cf` grad | Two pink field shades. Confirms the claim-axis repair. |
| 5 | `placebo.jpg` | `#607b76/#a0a39a/#fbfdfa/#111312` grad → `#6c8a8a/#86a5aa/#fbfdfa/#111312` grad | Whether exact dense representatives beat fitted endpoints. Decides the general principle. |
| 6 | `disney.avif` | `#c72690/#c72690/#fbfdfc/#f68121` → `#74c044/#f68121/#fbfdfc/#c72690` | **Regression check.** Previously strong. A "worse" verdict caps the collapsed-surface constant. |
| 7 | `birdsofprey.jpg` | accent `#d02981` → `#bcddb0`, gradient and midpoint `#1880a7` unchanged | **Defect call.** The hot pink crosses zero APCA contrast inside the rendered gradient. Is losing the artwork's signature colour the right remedy, or should the guard steer the field instead? |

Optional 8th: `johns.jpg` `#0d181c/#0d181c/#f7f8fa/#ff5a62` → `#0d181c/#0e2340/#f7f8fa/#ff5a62` —
the omitted blue family now appears as surface rather than the accent the reviewer suggested; a
verdict tells us whether role placement matters or only coverage.

## Reproduction

```
PALETTE_IMAGES_ROOT=<checkout>/images node research/v2-3-experiments/track-a/run-subset.ts \
  --base-corpus --out research/v2-3-experiments/track-a/base-corpus-adopted.json
PALETTE_IMAGES_ROOT=<checkout>/images node research/v2-3-experiments/track-a/diagnose.ts greenday.jpg --top 10
PALETTE_IMAGES_ROOT=<checkout>/images node research/v2-3-experiments/track-a/sign-flip-census.ts birdsofprey.jpg
node_modules/.bin/tsc -p research/v2-3/tsconfig.json
node --test research/v2-3/test/architecture.test.ts
```

Arms are reproduced by toggling `WINNER_RANKING_HYPOTHESES`, `FIELD_OWNERSHIP` and `GRADIENT_CLAIM`
in `research/v2-3/src/internal/winner-scoring.ts`. `arm-results.json` holds the original 15-case
subset arms; `base-corpus-arms.json` holds all 34-case arms.

---

# Round 3 — batch-4 calibration, hue-aware sign guard, meteora

Batch-4 human verdicts on the round-2 configuration: **6 strong + 1 acceptable of 8**.
Preferred and strong: `greenday`, `elephunk`, `doja`, `disney` (distinct surface explicitly
welcomed), `placebo` (beat Track B's reviewed field head-to-head). `johns` preferred, acceptable.
Calibration against: `birdsofprey` (baseline pink preferred, strong) and `loups` (equal, both
strong). `meteora` pulled — superseded by a batch-3 verdict of only *acceptable*.

## The hue-aware sign guard

**Design rule (from review):** an APCA sign flip across the gradient is a defect *only* when the
role is near-hue to the field, so lightness is the only separator. When hue distance is large,
chromatic contrast carries readability and the flip is acceptable.

**Formulation.** The rendered field interpolates in OKLab, so in the (a, b) chromatic plane the
rendered path is exactly the segment between the endpoints. The minimum chromatic separation
anywhere along the gradient is therefore the point-to-segment distance from the role's (a, b) to
that segment. Lightness is deliberately excluded — this measures what is left to carry readability
at the point where lightness contrast passes through zero.

```
carry     = clamp(chromaticSeparation / chromaticCarryFull)   // chromaticCarryFull = 0.15
effective = signAgreement + (1 - signAgreement) * carry
```

**Calibration measurements:**

| Role vs field | Chromatic separation | Human verdict |
| --- | ---: | --- |
| `birdsofprey` pink `#d02981` over `#141975`→`#3fa72a` | **0.2479** | readable, preferred |
| `placebo` accent `#9d8060` (flipped) | 0.0872 | — |
| `doja` accent `#fda8cf` | 0.0681 | — |
| `birdsofprey` green `#bcddb0` | 0.0483 | rejected |
| `loups` accent `#fab14a` | 0.0286 | unreadable zone |
| `muse` foreground `#024c8b` (flipped) | 0.0196 | — |
| `loups` accent `#fc8831` | 0.0167 | unreadable zone |

The one flip judged readable is 2.8x the largest near-hue case. `chromaticCarryFull = 0.15` sits
clear of both. **Verified:** with an otherwise-baseline claim axis the guard restores the pink
accent exactly, while every near-hue flip stays discounted.

## birdsofprey is not restored — and the sign guard is not why

The flip **survives disabling the sign guard entirely**. Diagnosis:

- `birdsofprey`'s winner carries a midpoint, so it is **transition-promoted** — the winner comes
  from `selectWinner`'s transition path, not from `scorePaletteCandidates`. (This also explains why
  the ranked list in `diagnose.ts` does not contain the final output.)
- Transition candidates are gated by `qualityUtility >= unrestricted.qualityUtility -
  MAXIMUM_WINNER_QUALITY_LOSS`, then ordered by `compareTransitionCandidates`, which ranks
  `decisiveCoverage` and `totalObligationCoverage` **above any quality term**.
- Any change to the claim axis moves the unrestricted winner's utility, which loosens or tightens
  that envelope. Once more candidates are admitted, coverage-first ordering prefers the
  higher-coverage accent (green, coverage 0.44/0.64) over the pink (0.24).

Reordering the comparator was implemented and measured (`TRANSITION_PROMOTION_ORDER`, left at the
previous `coverage-first`): `quality-after-decisive` yields a *third* accent (`#e0cdc7`), not the
pink. **The fix is not a simple reorder, and it is not in winner scoring.** It belongs to whoever
owns transition promotion. The hue-aware guard is correct and should be kept regardless.

Also measured and rejected: claim axis `endpoint-source-fidelity` (`sqrt(endpointSourceSupport *
evidenceStrength)`, the postmortem's literal ask). It preserves `doja` and `placebo` but costs
`muse`, giving 12/34 instead of 11/34. `evidence-strength` is retained.

## meteora — negative result

Target: Flo's arrangement (a) collapsed black surface, or (b) khaki surface + white accent.

**Arrangement (b) is unreachable by ranking.** Every `#000000`/`#a59073` candidate scores
`foregroundPath` level 10 against the winner's 25, because a foreground must contrast against both
black and khaki. The gap is ~0.14 of utility. No ranking term closes that without overriding
contrast evidence wholesale. This is a candidate-availability question, not a ranking one.

**Arrangement (a) needs 0.0134.** The two candidates differ as: collapsed wins `fieldFidelity`
22-vs-16 (the extra surface *degrades* the field claim); distinct wins `surfaceFidelity` 17-vs-6,
`economy` 18-vs-13, `coherence` 25-vs-22. Five levers were tried:

| Lever | Result |
| --- | --- |
| `collapsedSurfaceFidelity` -> 0.50 | Does not flip meteora (raising the constant strengthens *every* collapsed treatment, including the reviewed-weak khaki collapse); loses `johns`, demotes `nada`. |
| OKLab background-surface distance (materiality) | Does not separate: meteora 0.181 > horrorwood 0.159, maroon5 0.157, knuckles 0.089, johns 0.073. |
| Surface source support | Does not separate: meteora 0.079 vs horrorwood 0.084, johns 0.064, nada 0.015 — all must stay distinct. |
| Surface/background support ratio | Does not separate: meteora 0.178 vs horrorwood 0.172. |
| `fieldFidelityWeightBoost` 0.05 | Does not flip meteora; already breaks `nada`. |

**On every source-derived signal available at ranking time, meteora's rejected surface looks
*better* than surfaces human review accepted elsewhere** — including connected support, where its
0.052 is the highest of the group (horrorwood 0.0096, johns 0.0057, nada 0.0003). Flo's objection
("doesn't feel like it belongs") is not represented in the current evidence at all. The plausible
reading is that the olive-brown is *texture inside* the black region rather than a second field —
a segmentation question (postmortem item 9 and the Segmentation Finding on texture/JPEG
fragmentation), not a ranking one. `fieldFidelityWeightBoost` is left at 0.

## johns — "sailor blue" question

The blue field family (`family-2843`) exposes `#0e2340` as its only retained representative in the
candidate slate; no lighter or mid blue of that family appears among the ranked candidates.
`representativesPerRole: 2` in `policy.ts` bounds how many representatives each family offers. A
lighter sailor blue would need either a wider representative bound or a different family — again
candidate availability, not ranking.

## Adopted configuration (round 3)

`collapsedSurfaceFidelity: 0.25` + `claimAxis: "evidence-strength"` + unearned routing +
**hue-aware** sign guard (`chromaticCarryFull: 0.15`). **11 of 34 changed, byte-identical to the
orchestrator-verified set** — all five batch-4 wins plus `johns` preserved exactly. Determinism
reconfirmed on `placebo` and `birdsofprey`. Typecheck clean; architecture test 2/2.

## Open items for the orchestrator

1. **`birdsofprey`** — the only unmet acceptance criterion. Root cause located in transition
   promotion (coverage ordered above quality), not in winner scoring. Needs an owner for that stage.
2. **`meteora`** — not solvable in ranking; evidence points at segmentation/texture.
3. **Next arm (mine):** foreground/accent support axis, now with three human-endorsed targets —
   `placebo` accent `#d01510` (0.023% of pixels), `slim` foreground (stop the 0.1% cyan),
   `knuckles` white text. The `sourceSupport` axis averages four roles, which dilutes exactly this
   signal; the region-observation typography cues are the principled support source, and the
   representativity rule must still exclude noise pixels.

---

# Round 4 — transition promotion (stage ownership), trunk integration

Trunk merged: v2-2 + Track D + Track C (`b8cffce`). Trunk baseline re-recorded with all Track A
flags off — **34/34 identical to `review-fixtures.ts`**, so the harness measures the real trunk.

## birdsofprey — restored

`transition-trace.ts` (new) mirrors `selectWinner` and dumps every promotion gate. The verdict was
unambiguous:

```
incumbent decisiveCoverage = 0
  #141975:#3fa72a:#030102:#d02981:gradient        <- the reviewed baseline
    earnedNativeTransition=true  promotionEligible=false
    decisiveCoverage=1 (needs > 0)  total=2  identity=1.000
    envelopeUtility=0.6318  threshold=0.6334  pass=false
```

The pink candidate passed **every** gate — earned native transition, coverage strictly above the
incumbent, and the highest identity of any candidate (1.000 against the green accent's 0.905, which
wins the existing comparator outright) — and failed only the quality envelope, **by 0.0016**. Its
promotion costs 0.1216 against a hard 0.12 budget; on the trunk baseline the identical promotion
costs 0.1188 and passes. A reviewed-strong palette was decided by a knife-edge.

**Diagnosis.** Promotion exists to replace the *field*. Gating it on `fieldFidelity`,
`surfaceFidelity` and `renderedGradientSalience` is circular: the incumbent is a *different field*,
so its field scores are not a yardstick for the candidate's, and the fixed 0.12 budget ends up
measuring claim-axis scale rather than treatment quality.

**Fix — `PROMOTION_ENVELOPE: "field-axis-neutral"`.** The envelope compares utility with those three
axes removed from both sides. Subtraction is exact because `qualityUtility` is a weighted sum. Every
other axis gates promotion exactly as before, so promotion is now gated on whether it damages the
**roles** — which is the thing it is not entitled to do.

No comparator change was needed. With the pink admitted, the existing coverage-first order selects
it on identity 1.000 vs 0.905. Result: `#141975 #3fa72a #030102 #d02981` with midpoint `#1880a7`,
**byte-identical to baseline**.

Both alternatives the orchestrator suggested were implemented and measured, and both are left in the
code as documented rejected options:

| Option | Result |
| --- | --- |
| `TRANSITION_PROMOTION_ORDER: "quality-after-decisive"` | Lands on a *third* accent (`#e0cdc7`), not the pink. The ordering was never the problem — the pink was not in the eligible set at all. |
| Accent-replacement gate | Would exclude all four eligible candidates (every one replaces the incumbent's pink accent), leaving the incumbent `#1d127b:#132f78:...` — also not the baseline. The pink had to be *admitted*, not the others excluded. |

## Track C interactions found by re-verifying on the real trunk

| Case | Effect | Resolution |
| --- | --- | --- |
| `johns` | Track C's role-aware credit rates `#cfd4d8`/`#f8fcfd` at coverage 0.714 vs the reviewed `#f7f8fa`/`#ff5a62` at 0.179. At `collapsedSurfaceFidelity` 0.25 my shift tipped the trunk onto the grey/near-white pair. | `collapsedSurfaceFidelity` **0.25 → 0.45**: johns returns to the trunk baseline. **The reviewed johns win (`#0d181c/#0e2340/#f7f8fa/#ff5a62`, distinct blue surface) is no longer reachable as a winner on this trunk** — it is present and Pareto-valid at rank 8, but loses to Track C's identity credit. Track A no longer changes johns at all. |
| `vvbrown` | Track C changed the baseline; at 0.25 my H2 flipped the field polarity to black-background. | At 0.45 only a 1-unit representative shift remains (`#ffffff` → `#fffffe`), no role or family change. |

`collapsedSurfaceFidelity` is now 0.45. The earlier sweep (0.00 / 0.25 / 0.50) was measured
pre-trunk; on the current trunk 0.45 is the value that holds every reviewed win.

## Unreviewed endpoint re-picks — characterised

| Case | Change | Family evidence | Nature |
| --- | --- | --- | --- |
| `horsley` | `#bd7042`/`#d6a944` → `#b8753e`/`#c99242` | identical roles `family-6858 / family-7719 / family-1984 / family-10343`; ru differs by **0.0005** | **Pure same-family representative re-pick.** Incidental. |
| `orelsan` | `#293949`/`#0c1222` → `#2a2f42`/`#111a2b` | identical roles `family-2844 / family-1962 / family-9922 / family-5512` | **Pure same-family representative re-pick.** Incidental. |
| `infected` | `#241a4e`/`#2b439d` → `#30388d`/`#2f2959` | same two families (`family-3745`, `family-2863`) but **swapped between background and surface** | **Substantive**: the field now runs blue→dark instead of dark→blue. Needs review. |

I tried to revert the two incidental ones with a principled rule (`BAND_TIE_BREAK`) rather than
accept them, since a sub-resolution difference deciding the winner is the documented quantization
defect. Both variants cost more than they fix and are left disabled:

| Variant | Result |
| --- | --- |
| `raw-utility-first` | Reverts horsley, but demotes reviewed-strong `nada` to a collapsed surface. 12/34. |
| `same-family-raw-utility` (fires only when both treatments assign the same families to the same roles) | Reverts horsley, but adds representative noise to `nada`, `nobs` and `ybbb`. 11/34. |

Recommendation: keep `sorted-evidence-levels`, and put `horsley` and `orelsan` in the confirmation
batch as near-identical representative re-picks, with `infected` flagged as a real polarity question.

## Final sweep — 10 of 34 (was 14)

| Case | Baseline → adopted | Status |
| --- | --- | --- |
| `greenday` | `#fefefe #fefefe #000211 #c13033` → `#000211 #000211 #fefefe #c13131` | reviewed win, preserved |
| `elephunk` | `#022833 #022833 #f5fbd7 #a5c7c8` → `#55919b #022833 #fcfdd1 #a5c7c8` | reviewed win, preserved |
| `doja` | `#fd75b5 #f79e80 #fff6fc #ce5e52` → `#fd75b5 #fd3d86 #fff6fc #fda8cf` | reviewed win, preserved |
| `placebo` | `#607b76 #a0a39a #fbfdfa #111312` → `#6c8a8a #86a5aa #fbfdfa #111312` | reviewed win, preserved |
| `disney` | `#c72690 #c72690 #fbfdfc #2199d6` → `#74c044 #f68121 #fbfdfc #c72690` | reviewed win, preserved |
| `meteora` | `#a48f72 #a48f72 #000000 #161109` → `#000000 #151108 #fafafa #a59073` | reviewed acceptable, unchanged from round 3 |
| `horsley`, `orelsan` | endpoint representative re-picks | unreviewed, incidental |
| `infected` | endpoint polarity swap within the same families | unreviewed, substantive |
| `vvbrown` | `#ffffff` → `#fffffe` field representative | cosmetic, 1 unit per channel |

`birdsofprey`, `johns` and `loups` are no longer changed by Track A. Determinism reconfirmed on
`birdsofprey`; typecheck clean; architecture test 2/2.

## Confirmation batch proposal

`birdsofprey` needs no review — it is byte-identical to baseline. Propose: **`infected`** (real
polarity question), **`horsley`** and **`orelsan`** (near-identical representative re-picks, likely
a formality), and optionally **`vvbrown`** (1-unit representative, almost certainly invisible).

## Open, for the record

- The reviewed `johns` improvement is lost to Track C's identity credit and is not recoverable from
  the ranking stage. If it is wanted back, it is a Track C question.
- `meteora` remains deferred to a segmentation arm (round 3).
- Next Track A arm remains the foreground/accent support axis (`placebo` accent at 0.023% of pixels,
  `slim`'s 0.1% cyan foreground, `knuckles`' white text).

---

# Round 5 — band-extent endpoint tie-break

Batch-7 verdicts on the integrated round-4 config: both same-family endpoint re-picks are mildly
**dispreferred**. `horsley` baseline `#bd7042`/`#d6a944` preferred strong, reason given — *"it
encompasses a greater surface of the gradient"*. `orelsan` baseline preferred strong, no note.

Track B (`43d3727`) located the mechanism: every gradient hypothesis publishes its endpoints twice —
variant 0 the band exemplar pair, variant 1 the family dense-exact pair — through
`buildFieldVariants` same-index pairing, and ranking picks between them. B quantified Flo's
principle as the summed `spatialSpread` of the endpoint pair.

## Colour span is the wrong proxy — measured

Before doing any plumbing I checked whether the OKLab endpoint distance (which I already had, and
which is what `endpointSalience` used to reward) reproduces the human ordering:

| Pair | OKLab span | Verdict |
| --- | ---: | --- |
| `horsley` `#bd7042`→`#d6a944` | 0.1549 | preferred |
| `horsley` `#b8753e`→`#c99242` | 0.0819 | dispreferred |
| `orelsan` `#172737`→`#0c1222` | **0.0821** | spread-preferred (target) |
| `orelsan` `#2a2f42`→`#111a2b` | **0.0909** | dispreferred (integrated) |

It agrees on `horsley` and **inverts on `orelsan`**. Flo's "surface" means *spatial* extent, not
colour range, and the two measures disagree in sign on one of the two cases. Track B's statistic is
required; the cheap proxy is rejected on evidence.

## What was built

All additive, no existing behaviour rewritten:

- `endpointBandRepresentatives` already walks each selected family's band pixels to find its
  exemplar. That same pass now accumulates per colour bin the count and first/second spatial
  moments, and publishes `bandSpreadByBin` — the RMS spatial extent of the pixels carrying each
  occupied colour — on `BandEndpoint`. No new pass over the image.
- A gradient `FieldHypothesis` publishes `endpointBandSpread` per representative. It is matched by
  **colour identity, not index**: `preferredRepresentatives` re-sorts by strategy, so the published
  array and the variant's representative order are not aligned.
- `FieldVariant` and `CompletePaletteScores` carry the summed pair spread. **It is zero for every
  non-gradient treatment**, so flats are untouched by construction — which is precisely why the two
  earlier `BAND_TIE_BREAK` variants disturbed `nada`, `nobs` and `ybbb` and this one does not.

Ranking, `BAND_TIE_BREAK: "same-family-band-extent"`. Both rules are gated on *two gradients that
assign the same families to the same roles*, so they can only ever choose between representatives of
one field:

1. **Tie-break** — inside a quantized utility tie, prefer the greater summed band spread.
2. **Dominance guard** — a pair with strictly greater band spread is not dominated by a narrower
   pair of the same families.

`horsley` needed only rule 1. `orelsan` needed rule 2: `#172737`/`#0c1222` sits one evidence level
below `#2a2f42`/`#111a2b` on `coherence` and is otherwise equal, so it was **dominated** and never
reached the frontier — the tie-break could not see it. This is the same shape as the identity-
coverage dominance guard from round 1, and it is what B's numbers predict: the integrated `orelsan`
background occupies **1.2% of its own band** against 61.9% for `#172737`.

## Sweep — 2 of 34

| Case | Before → after | Status |
| --- | --- | --- |
| `horsley` | `#b8753e #c99242 #0f0f0f #f2eec1` → `#bd7042 #d6a944 #0f0f0f #f2eec1` | **byte-identical to the v2-2 baseline pair** |
| `orelsan` | `#2a2f42 #111a2b #e9dec8 #6c5f57` → `#172737 #0c1222 #e9dec8 #6c5f57` | B's spread-preferred pair; surface exactly baseline, background closer than before |

**Nothing else moved.** `nada`, `nobs`, `ybbb` undisturbed; every reviewed outcome undisturbed;
`infected` unchanged (its two endpoints swap *families* between background and surface, so the
same-family gate correctly does not fire — it remains the one open unreviewed change).

Determinism reconfirmed on `horsley`; typecheck clean; architecture test 2/2. Runtime diff is 92
lines across `palette-core.ts` and `winner-scoring.ts`, all behind the existing flag, so it should
compose with the pending Track B and Track C arms.

## Note on B's caveat

B warned that two agreeing cases are weak-but-real evidence. The sweep is the stronger result: the
statistic is available on every gradient in the corpus, and applying it changes **only** the two
cases the human flagged. That is the neutrality evidence, not the agreement of two examples.
