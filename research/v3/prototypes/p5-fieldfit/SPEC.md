# P5 — robust parametric field fit + residual marks: prototype spec v0.1

**Authored 2026-08-04 by the P5 orchestrator.** Sources: `phase-1/proposals/arm-f.md`,
`arm-f-r3.md`, `arm-e-r3.md` (field-pricing and agglomeration only), `PRIOR_ART_CHECK.md` §P5.
Where the arms disagree, the choice below is **picked and stated** (reviewer standard: principles
bind, numbers do not). Decisions marked (E*n*) are internal experiments to revisit with evidence.

## Mechanism, one paragraph

Fit a low-order colour surface (OKLab affine in normalized position) to the whole image with a
redescending robust estimator (Tukey biweight IRLS). The fit **is** the segmentation: no masks, no
connected components, no size thresholds. What the fit converges to is the field; the per-pixel
rejection weight defines the overlay. Background and surface are the projected ends of the field's
dominant ramp (or one collapsed colour); foreground and accent are read off the overlay by mass and
by departure direction. Never segment first. Never plain least squares.

## Pipeline and module ownership

All code in `research/v3/prototypes/p5-fieldfit/`. Shared interfaces in `src/types.ts` (authored,
frozen; change only via orchestrator). Contract imports from `../../../src/contract/*` (read-only).

| module | owner | contents |
|---|---|---|
| `src/decode.ts` | W-CORE | sharp decode (header dims, refuse transparency like toy candidate), full-res OKLab Float32 raster, exact-triple inventory: per-triple count + Σx + Σy (normalized coords), per-triple OKLab, presence test |
| `src/snap.ts` | W-CORE | mass-maximizing snap: among triples within the same-colour bar of a target (OKLab ball), maximize count-mass smoothed over the triple's bar-neighbourhood; tie: OKLab distance, then packed int. Empty ball → nearest triple + `offArtwork: true` |
| `src/fieldfit.ts` | W-FIT | IRLS Tukey biweight on residual norm; order-0 and order-1 fits; per-pixel weight map; inlier fraction; residual scale; no-field verdict; `fieldAt(x,y)` |
| `src/ramp.ts` | W-READ | dominant direction from the 3×2 affine matrix (largest right singular vector), t-parameterisation, orientation, endpoint targets, excursion test against the inventory, third-stop insertion |
| `src/overlay.ts` | W-MARKS | overlay mass per triple, bar-neighbourhood agglomeration, foreground/accent selection, collapse decisions, escape |
| `candidate.ts` | W-INTEG (wave 2) | assembly into contract `Palette`; `candidateId = "p5-fieldfit"`, `ALGORITHM_VERSION = "p5-fieldfit-0.1.0"`, `PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"` |
| `diagnose.ts` | W-INTEG | CLI: one image → JSON of every margin/diagnostic in `Diagnostics` |
| `tests/*.test.ts` | each owner | synthetic self-tests, see per-module requirements |

## Decisions (picked, stated, held)

1. **Fit** — order 0 and order 1 only in v0 (order 2 deferred; the third stop comes from excursion
   instead). Tukey biweight, cut `c = 4.685·σ̂` (95% Gaussian efficiency — standard robust
   statistics, provenance `[INHERITED]` from the literature per arm-f-r3 §4.2); `σ̂ = 1.4826·MAD`
   of residual norms, recomputed each iteration; deterministic stratified lattice subsample
   ≥ 10^5 samples (or all pixels if fewer); ≤ 12 iterations; convergence when max coefficient
   change < 1e-4. **Single start from the order-0 robust centre** (arm-f-r3), not arm-f's
   multi-start. (E1: if demo-20 shows type-dominant figure/field inversion, revisit multi-start.)
2. **Field reading** — v0 has flat vs ramp only, no two-field/panel reading (E2, deferred; arm-f
   §2.5's two-component reading is the known gap on hard two-block covers; the fallback below
   covers them legally). The gradient boolean is **forced, not thresholded** (arm-f-r3 §2.3):
   gradient true iff the two snapped ends differ under `sameColor()`. Same ends ⇒ surface collapses
   exactly, gradient null.
3. **Orientation** — background is the larger field: the end the weighted median of t (over inlier
   weight) leans **toward** is the background (majority end). *Ruling 2026-08-04: arm-f-r3's "leans
   away from" wording contradicts its own "background is the larger field" principle; the principle
   binds (both arms agree: background is what the field mostly is).* Tie/near-tie: darker end is
   background. Margin reported.
4. **Snap** — mass-maximizing in the bar-ball (decision above); never nearest-neighbour first.
5. **Stops** — ends are the published background/surface (same objects, positions 0 and 1). Third
   stop only if max excursion of the straight OKLab chord from the artwork's occupied colours
   exceeds the bar; insert at argmax, snapped; keep only if new max excursion < bar OR reduced ≥ 2×
   (`[UNCALIBRATED]`, stated here); must stay monotone in t. No fourth stop; residual excursion goes
   in diagnostics. If no polyline fixes it (two-block cover): gradient false, background/surface =
   two highest-field-mass agglomerated colours separated by the bar (arm-f-r3 §2.4 fallback).
6. **Overlay clustering** — agglomerate non-field triples (overlay mass = Σ(1−w) over the triple's
   pixels) into bar-neighbourhoods in descending-mass order with packed-int tie-break (arm-e-r3
   §2.4: idempotent under sub-bar perturbation — this is the dither answer).
7. **Foreground** — max overlay mass among clusters that are a different colour (`sameColor` false)
   from the field evaluated at the cluster's own mean position, passing the user contrast minimum
   (default filters nothing). Uses `resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)`.
   *Ruling 2026-08-04 (from demo-20 scorecard, I3.pair-not-distinct ×10):* contract feasibility is
   judged on **published** pairs, so foreground candidates must additionally be non-`sameColor`
   against **both snapped field ends** — local-field distinctness selects the mark, published-pair
   distinctness is a hard feasibility constraint (arm-f §2.7: roles assigned jointly with
   feasibility).
   *Ruling 2026-08-04 (I3.foreground-accent-not-separated ×5):* the inherited
   `FOREGROUND_ACCENT_SEPARATION_DISTANCE = 0.07444` is **not** adopted as a collapse guard — the
   reviewer ruled fg/accent "different or collapsed" is decided by the calibrated formula
   (`sameColor`), not by 0.07444, which was never calibrated here. The scorecard rows it produces
   are recorded, not chased; the contract-constant conflict is reported upward.
8. **Accent** — candidates distinct from foreground AND both field ends; Pareto front on
   (|ΔL|, √(ΔC²+ΔH²)) of displacement from local field; winner = max overlay mass on the front
   (arm-f-r3 §2.5 — a direction, never a coefficient). `accentChromaOnly` flag (diagnostics) when
   the winner's |ΔL| < the pair's bar. No candidate ⇒ accent collapses to foreground exactly.
9. **No-field detector** (obligation #1, built in v0, never deferred) — verdict `noField` when
   inlier fraction < 0.5 (`[UNCALIBRATED]`, expect retuning; σ̂ reported in diagnostics but no
   longer part of the verdict — *ruling 2026-08-04: the original `OR σ̂ > 3×POOLED_SAME_COLOR_BAR`
   clause fired on 11/20 demo-20 covers at inlier fractions 0.79–1.00, i.e. on textured-but-fittable
   photographs; the arms' own principle is "the biweight has no majority", which is the inlier
   fraction, not the residual scale*). Retreat: background = highest-field-mass agglomerated
   colour of the order-0 fit, surface collapsed, gradient null, foreground/accent from overlay
   against that flat field. The retreat is **declared** in diagnostics, never silent.
10. **Escape** — only when no ledger colour is separated from the field by the bar: foreground =
    #ffffff or #000000 (further in L from background, must be absent from inventory — if present,
    publish it as an ordinary pixel), accent collapsed, per arm-f-r3 §2.6.
11. **Bar usage** — pairwise comparisons use `sameColorBar(a, b)` / `sameColor(a, b)` from
    `src/contract/color.ts`. Scalar scale (loss scale, ball radius on unpaired targets) uses
    `POOLED_SAME_COLOR_BAR` (`[INHERITED]` from contract). Nothing here depends on the bar's value.
12. **Excluded** — arm-e-r3's five-level lexicographic F/A ranking (revives the recorded main
    failure comparator; PRIOR_ART_CHECK §P1 erratum). arm-f's recursive field-like component pool
    and scale-space mark grouping (v0 scope cut; E2). Any hand-weighted multi-term score (P6's
    failure shape, not ours).

## Verification obligations (designed overlap)

- Every module ships a synthetic self-test with a known right answer: W-FIT — a known affine ramp +
  outlier marks + 1-LSB dither must recover coefficients within tolerance and must NOT split
  (fit stability); a pure-noise image must trigger `noField`. W-READ — known ramp orientation and a
  known two-block image (excursion unfixable → fallback). W-MARKS — synthetic text-on-ramp must
  yield the text colour as foreground; agglomeration must be byte-identical under ±1 LSB dither of
  half the mass. W-CORE — inventory counts/moments exact on a constructed 4×4 image; snap picks
  mass over proximity on a constructed case.
- Wave-2 verifier independently re-runs everything from artifacts and additionally runs the
  early falsifier (arm-f-r3 §7): ±1-LSB dither must move the *fitted continuous endpoints* by less
  than the bar. If it does not, report it — that is the paradigm's main structural claim failing.

## Diagnostics (sidecar, never in the Palette)

Per image: `{ noField, inlierFraction, residualScale, marginBars, orientationMargin,
gradientForced, excursionMax, thirdStopAccepted, residualExcursion, accentChromaOnly,
offArtwork: {role: boolean}, escape }`.
