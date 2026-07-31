# Track I — F8 fix, border/frame prior audit, `additionalGeometries` re-test

Branch `worktree-agent-a34c764aa4d59880c`, based on `research/palette-0.9-checkpoint` at
`83ee25b` ("v2-3: integrate Track B2 midpoint distinctness + render-truthful accent scale").

## Corpus used by every measurement here

`PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images` — the **shared checkout**, i.e. the
real artwork. The worktree's own `images/` holds only the `-scrambled` decoys (charter
§"Corpus trap"), and every probe in this folder prints the root it read so a scrambled-corpus
result can never be mistaken for a real one.

| set | contents |
| --- | --- |
| `base` | 37 non-scrambled files in `images/` — the 34 reviewed artworks plus 3 extra `maroon5` variants |
| `scrambled` | 34 `-scrambled` decoys |
| `offpanel` | deterministic 30-image stride sample of the numbered corpus directories, plus 4 pinned ids |
| `full` | all three: **101 images** |

Acceptance is the sha256 of the **complete** `PaletteExtraction` (all four roles' rgb/oklab/
hex/generated, gradient and collapse flags, dimensions, and the whole `researchRender`
midpoint block) — not just the four hexes. `sweep.ts` is adopted from
`research/v2-3-experiments/adversarial-arch/sweep.ts` (branch `worktree-agent-aea17683dcda2e5f4`)
so these manifests are directly comparable with the ones F8 was measured against.

**Trunk baseline** (`83ee25b`, unmodified) = the `trunk-b8` label for this report:
corpus hash `dbb3e17e9b3e9f734dfb71558cb28ad41786a3799c7e575d1cfd648c2bd1256c`, 270.9 s.
Recorded in `sweep-trunk-b8.json`.

---

## Task 1 — F8: `endpointBandSpread` absent ≡ zero

### The defect, re-measured on trunk

`FieldHypothesis.endpointBandSpread` was published only by the seed gradient fit.
`field-transition.ts` and `candidate-domain.ts` both built `kind: "gradient-field"`
hypotheses without it, and `buildFieldVariants`' `bandSpreadOf` substituted `0` — a legal
*measured* value. `dominates` and the `compareEvaluations` tie-break in `winner-scoring.ts`
then read the substitute as evidence.

`spread-census.ts` over the 37 base files (`spread-census-before.json`):

| producer | gradient candidates carrying a spread |
| --- | --- |
| seed gradient fit | **3641 / 3641** |
| band-local-endpoint | **0 / 622** |
| native-field-transition | **0 / 99** |

Confirms F8's shape. The counts differ slightly from the review's (491 / 94 over 11 images)
because this is the full base set.

### What the census adds: the asymmetry has no live pair

F8 argues the substitute zero is read *asymmetrically* — a candidate with spread `0` can
never block domination by a same-family candidate with spread `> 0`, while the reverse
always blocks. That is true of the code, but it only bites where a same-family pair actually
spans two producers. The census counts those pairs directly, using a copy of
`winner-scoring.ts`'s own `sameFamilyAssignment`:

> **0 asymmetric same-family gradient pairs, on every one of the 37 base files.**

On `birdsofprey` specifically: 537 gradient candidates, 438 same-family pairs, **0** of them
asymmetric. The 164 candidates with no spread (65 band-local + 99 field-transition) never
share a four-role family assignment with any of the 373 seed candidates that do have one —
band-local hypotheses carry synthetic `band-local:…` family ids, which cannot equal a native
family id. So the review's "159/541 affected" is a correct count of the *population*, but the
asymmetry it implies never had a pair to act on.

This is why the fix below is byte-preserving. It is **not** a reason to leave the defect: the
field is optional evidence whose absent value is a legal measured value, and any future
producer that adds a gradient hypothesis inherits the trap.

### The fix

Complete the data; treat genuinely-unmeasurable as incomparable.

* **`band-representative.ts`** gains `createBandSpatialSpreadAccumulator` — one streaming
  definition of the statistic, so there is one definition rather than three.
  `endpointBandRepresentatives` now uses it instead of its own inline bins.
* **`endpoint-refinement.ts`** measures it over `measureBand`'s own `samples`, which is
  *exactly* the pixel set the seed fit bins (parent-family pixels inside the endpoint band),
  and publishes one value per `family.representatives` entry. `candidate-domain.ts` forwards
  it onto the hypothesis.
* **`field-transition.ts`** cuts its endpoint bands from the path domain using its own
  geometry (a per-pixel form of the existing node-level `linearPosition` / radial extent) and
  its own declared `ENDPOINT_INTERVAL` of `[0.15, 0.85]`, mirroring how the seed fit cuts
  its. `RegionGraph` publishes the `regionAt` map it already computed, so this needs no
  second segmentation.
* **Representatives are matched to spreads by colour identity, never by index** — the known
  bug class. Producers publish index-aligned arrays; `buildFieldVariants` re-matches by RGB.
* Where a colour genuinely has no band pixels (a `density-synthesized` representative can
  land in an unoccupied bin) the value is `null`.
  `CompletePaletteScores.endpointBandSpread` is `number | null`, and `comparableBandSpread`
  gates both the dominance guard and the tie-break: when either side is unmeasured the axis
  is skipped entirely, so neither candidate wins or loses on it.
* `effectiveBlock` is narrowed from `keyof CompletePaletteScores` to
  `AlbumArtworkPaletteV2QualityBlock`, which never included this field.

Cost: none measurable. 270.9 s → 269.3 s over 101 images.

### After the fix (`spread-census-after.json`)

| producer | before | after |
| --- | --- | --- |
| seed gradient fit | 3641 / 3641 | 3641 / 3641 |
| band-local-endpoint | 0 / 622 | **622 / 622** |
| native-field-transition | 0 / 99 | **99 / 99** |

Zero `null` entries reached a materialized candidate on this corpus; the `null` path exists
for the synthesized-representative case, which did not fire here.

### Blast radius — full corpus

```
101 image(s) compared, 0 differ
corpus hash  before dbb3e17e9b3e9f734dfb71558cb28ad41786a3799c7e575d1cfd648c2bd1256c
             after  dbb3e17e9b3e9f734dfb71558cb28ad41786a3799c7e575d1cfd648c2bd1256c
runtime      before 270.9s  after 269.3s
```

**Every reviewed outcome is byte-preserved.** `birdsofprey` (pink `#d02981` +
midpoint `#1880a7`) is byte-identical; so is every other base, scrambled and off-panel image.
No review item is proposed for Task 1.

Determinism: the `quick` set (18 images) run twice gives corpus hash
`a0f8888a0e317117b275790e70cecfcf825967e02731114f3c4f7eee658a4617` both times.
Typecheck clean; `research/v2-3/test/architecture.test.ts` passes.

### Two corrections to the adversarial findings, measured

`winner-source.ts` over the 67 real artworks (37 base + 30 off-panel) records which producer
the *winning* treatment came from (`winner-source.json`):

| producer | winners |
| --- | --- |
| seed flat (`flat:` / `one:`) | 42 |
| seed gradient fit | 24 |
| **native-field-transition** | **1** |
| band-local-endpoint | 0 |

1. **Logic finding 8 — "the entire native-field-transition stack yields nothing, ~1,400
   lines, 0 output" — is wrong.** The transition stack produces the winner for
   `birdsofprey`, which is the reviewed-**strong** case Track A spent a round restoring.
   Any proposal to delete that stack would delete a reviewed-strong outcome.

2. **`birdsofprey` was itself the case reading a fabricated zero.** Its winning treatment's
   `endpointBandSpread` was `0` before this fix and is `0.30609` after — the one gradient
   winner in 67 whose band extent was unmeasured. The output does not change, because no
   same-family challenger existed to compare against, but the reviewed-strong case was
   sitting exactly on the defect.

3. Logic finding 11's "band-local endpoint refinement: 0 winners" is **corroborated** —
   0 winners in 67. It still must not be deleted on that basis alone (charter §"deletion
   claims"): it is now a source of real evidence rather than of substitute zeros.

---

## Task 2(a) — Border / frame / matte prior audit (literature item I10)

Probe only; no algorithm change. `border-frame-audit.ts`, results in
`border-frame-audit.json`.

**Detection.** Ring `d` is the one-pixel rectangle outline inset by `d`. A frame of thickness
`D` exists when every ring `0..D` is internally near-uniform (RMS OKLab deviation ≤ 0.030)
and agrees with ring 0 (≤ 0.030); `D` is at least 0.8 % of the short side (so JPEG edge
artefacts and antialiased margins cannot qualify); the run *ends* before 22 % of the short
side (a saturated run means no inner edge was ever found — that is a broad flat field, not a
frame); and the whole interior past `D` differs from the frame colour by at least **0.058**,
the algorithm's own `familyAnchorRadius`. Below that radius the pipeline treats two colours
as one family, so a "frame" it cannot even separate from the interior is not a frame for this
question.

One earlier rule was measured wrong and corrected: testing the *ring immediately past the
run* rejects wide mattes, because that ring is still mostly matte colour and merely stopped
being uniform where the artwork began to intrude on it. `nobs`' 71 px white margin was a
false negative under that rule. The interior mean is the discriminator; the next ring is
reported as diagnostic only.

### Result — 67 artworks (37 base + 30 off-panel)

**6 have a border / frame / matte. In 6 of 6, the winner's background *is* the frame colour.**

| artwork | frame | thickness | winner background | ΔOKLab | winner field |
| --- | --- | --- | --- | --- | --- |
| `images/elephunk.jpg` | `#54919c` | 9 px (1.8 %) | `#55919b` | 0.002 | flat |
| `images/franz.jpg` | `#020612` | 15 px (2.3 %) | `#020612` | 0.001 | flat |
| `images/nobs.jpg` | `#f7ffff` | 71 px (5.9 %) | `#f6ffff` | 0.001 | flat |
| `04/…44e41353e0c7be825ea15` | `#d5d5d5` | 12 px | `#dcdcdc` | 0.023 | gradient |
| `05/…05230fae1822525e5a5ff6` | `#ebeef1` | 19 px | `#e8ebf0` | 0.008 | gradient |
| `08/…08e4f86349a1fac8d2c8e8` | `#e9acb2` | 63 px | `#e8abb2` | 0.002 | flat |

Near misses worth knowing about, since they show the thresholds are doing work rather than
excluding by accident:

* `images/black.jpg` — 13 px uniform black edge, interior only 0.040 away: inside one family,
  so not a frame.
* `images/slipknot.jpg`, `pureblack`, `purered`, `purewhite` — uniform run saturates the 22 %
  cap; no inner edge exists. Correctly excluded.
* `images/snarky.jpg`, `images/ybbb.jpg`, `images/maroon5-saliency.png` — interior within
  0.006 of the edge: flat-field artworks, correctly excluded.

### Assessment

**This is non-trivial and should become a named failure class**, subject to human judgement
on the six cases. The hit rate is what makes it interesting: the frame prior is not
occasionally captured, it is captured **every single time a frame exists** (6/6). A frame is
by construction a broad, perfectly uniform, border-touching, four-quadrant, high-concentration
region — which is precisely the profile `fieldScore` rewards (`0.28·broadSupport +
0.22·borderCoverage + 0.22·familyConcentration + 0.13·quadrantCoverage + 0.15·textureCalm`).
Nothing in the evidence distinguishes "the field the artwork is made of" from "the mount the
artwork was pasted onto", so the mount wins whenever it is present.

What this audit does **not** establish is that all six are *wrong*. For `nobs` (white matte)
a white UI background may well be the right answer, and for the two grey off-panel cases the
frame is nearly the interior's own value. The 3 base cases are proposed for human review
below; that verdict decides whether this becomes a failure class or a non-issue.

---

## Task 2(b) — `additionalGeometries` re-test (logic finding 12 residue)

Probe only; **no integration proposed**, and the flag is reverted in the committed tree
(`DEFAULT_GRADIENT_FIT_OPTIONS.additionalGeometries` is `false` on this branch, as on trunk).
The measurement is "what would this option do to *today's* algorithm", nothing more.

Enabling it adds 7 fit definitions — `angle-22.5/67.5/112.5/157.5` on `linear`, and
`center-0.35-0.50 / 0.65-0.50 / 0.50-0.65` on `radial-offset` — which are the 7
`GradientDirection` members no code path can otherwise produce. (Incidentally: the two
duplicated position functions, `gradientPosition` in `palette-core.ts` and
`rawGradientPosition` in `endpoint-refinement.ts`, are byte-for-byte equivalent for all 7,
so logic finding 16's "enable either and the two diverge" does not hold today.)

### Result — the diff is **not** zero

```
101 image(s) compared, 18 differ
corpus hash  before dbb3e17e9b3e9f734dfb71558cb28ad41786a3799c7e575d1cfd648c2bd1256c
             after  df6dab03b9b7ba0e4e94af6d3766803b3ad0c2d492a21224e207105f553ad27c
runtime      before 269.3s  after 469.0s   (+74 %)
```

18 of 101: **6 base artworks**, 2 scrambled decoys (`doja`, `infected`), 10 off-panel.

Winner diffs on the 6 base artworks (`winners-geometries-off.json` vs
`winners-geometries-on.json`):

| artwork | change |
| --- | --- |
| `doja` | surface `#fd3d86` → `#f79e80`; accent `#fda8cf` → `#ce5e52`; midpoint `#ff8cc6` → `#fe85bb` |
| `havana` | surface `#243a51` → `#263c53`; **midpoint `none` → `#2b3e4f`** |
| `horrorwood` | surface `#36444f` → `#242e3a`; **flat → gradient** |
| `horsley` | background `#bd7042` → `#b8753e`; surface `#d6a944` → `#c99242` |
| `infected` | background `#30388d` → `#2b2153`; surface `#2f2959` → `#2e3c94`; **midpoint `none` → `#2a215a`** |
| `orelsan` | background `#172737` → `#2c3145`; surface `#0c1222` → `#0f1628` |

`birdsofprey` is unchanged.

### Assessment

**Recommendation: do not delete the 7 `GradientDirection` members.** The zero-diff branch of
the brief — "zero diff ⇒ recommend deletion of the dead members" — does not obtain. They are
unreachable today only because one boolean is `false`, and flipping it changes 18 of 101
outcomes including a flat→gradient flip on `horrorwood` and two `none`→hex midpoint
promotions. That is a live capability, not dead code.

It is also, on its face, a **gradient-neutrality risk in one direction** (charter rule 5):
every field change here is toward *more* gradient — one flat→gradient flip, two new
midpoints, zero in the opposite direction. More candidate geometries can only add gradient
fits, never remove them, so the option's effect is structurally asymmetric. Anyone proposing
to enable it must measure incorrectly-allowed gradients as carefully as incorrectly-prevented
ones, and pay a +74 % runtime.

I am **not** proposing these 6 for the review batch as an integration candidate — the brief
forbids it, and a 6-artwork diff bought with a 74 % slowdown and a one-directional gradient
push is not a proposal, it is a measurement. If the orchestrator wants the option evaluated
properly it needs its own track: a directional gradient-neutrality count over the full
corpus, and the four reviewed-strong regression cases held fixed.

---

## Proposed review items

Only from Task 2(a). Task 1 changes no winner; Task 2(b) is measurement only and its diff is
not proposed.

| # | case | question for the reviewer |
| --- | --- | --- |
| 1 | `images/elephunk.jpg` | 9 px teal `#54919c` frame; winner background `#55919b` is the frame, surface `#022833` is the interior. Is the frame the right background, or should the background come from the artwork inside it? |
| 2 | `images/franz.jpg` | 15 px near-black `#020612` frame; winner collapses to it for both background and surface. Interior is 0.125 away. |
| 3 | `images/nobs.jpg` | 71 px white `#f7ffff` matte; winner background `#f6ffff`, accent `#f2f626` from the interior. Interior mean is 0.146 away. |

A "the frame is correct" verdict on all three closes item I10 as a non-issue. Any "should
have come from inside the frame" verdict makes *border/frame capture* a named failure class,
with a measured 6/6 hit rate whenever a frame is present.

---

## Files

Runtime (Task 1 only):
`research/v2-3/src/internal/band-representative.ts`, `palette-core.ts`,
`endpoint-refinement.ts`, `candidate-domain.ts`, `field-transition.ts`, `winner-scoring.ts`.

Probes (this folder): `corpus.ts` (shared, `PALETTE_IMAGES_ROOT`-aware set selection),
`sweep.ts`, `spread-census.ts`, `winner-source.ts`, `winners.ts`, `border-frame-audit.ts`.

Recorded measurements: `sweep-trunk-b8.json`, `sweep-f8.json`,
`sweep-additional-geometries.json`, `spread-census-before.json`, `spread-census-after.json`,
`winner-source.json`, `border-frame-audit.json`, `winners-geometries-off.json`,
`winners-geometries-on.json`.

## Honest self-assessment

* Task 1's fix is correct and free, but its **behavioural** payoff on today's corpus is zero.
  I measured that rather than assuming it, and I measured *why* (no cross-producer same-family
  pair; band-local never wins; the one field-transition winner had no challenger). If the
  orchestrator values only winner movement, this commit earns nothing today. Its value is
  that the reviewed-strong `birdsofprey` no longer wins while carrying a fabricated number,
  and that the next gradient producer cannot inherit the trap.
* The field-transition band definition is the one judgement call I could not make purely
  mechanically. The transition stack has no per-pixel position function of its own, so I
  derived one from its existing node-level geometry and cut the band at its own declared
  `[0.15, 0.85]`. That is the closest analogue of the seed fit's cut, but it is an analogue,
  not an identity — if a future same-family cross-producer pair does appear, the two scales
  should be re-checked against each other before the guard is trusted to arbitrate it.
* The border/frame detector's thresholds are mine, not the algorithm's, except for the 0.058
  distinctness radius. I found and corrected one wrong rule mid-audit (the next-ring test);
  I cannot rule out that a different uniformity threshold would move the count of 6. The 6/6
  capture rate is the robust part of the finding — it does not depend on where the detection
  line is drawn, only on the cases being frames at all.
* Task 2(b)'s 18-image diff was produced with the Task 1 fix already in the tree. Since Task 1
  is byte-identical to trunk over the same 101 images, the diff is attributable to
  `additionalGeometries` alone.
