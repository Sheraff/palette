# P3 — per-pixel scalar fields and ranks

**Mechanism (PHASE_2_HANDOFF.md §2 P3):** every published colour is the pixel holding a designated
rank in some measurement defined at every pixel. No grouping, no shortlist, no candidate set ever.
Prior art: not tried — measurement-maps existed three times and always fed clustering; publishing
the ranked pixel directly is the one genuine novelty of the six mechanisms.

## The discipline line (decided 2026-08-04, held for the whole prototype)

The two Phase 1 arms disagree about what their own rule forbids. **This prototype holds arm-d's
line:**

> **Nothing colour-bearing is ever created.** Every object the algorithm builds is either a pixel
> of the artwork or a *number attached to a pixel*. All aggregation happens in the scalar domain.

Concretely:

- **Banned:** colour histograms and bins; centroids; any local mean colour; every linear filter on
  a colour channel; any synthesized, blended, or interpolated colour; any data structure indexed by
  colour. (Compositing creates colours, so alpha < 255 pixels are *excluded from eligibility and
  from neighbours' statistics*, never matted.)
- **Allowed:** scalar fields one-value-per-pixel (distances *to the pixel itself*, rank filters,
  depth transforms, projections onto directions); quantiles and trimmed ranks of scalar fields;
  percentiles (rank fields) and products of percentiles as weight-free evidence combination
  (grafted from arm-d′); counts of pixels within the same-colour bar of *a pixel* (a comparison to
  the pixel, not to an average); sorted permutations of the pixel array; the cascade-pixel
  primitive (iterated medians restricted to attaining pixels — terminates on an actual pixel).

**Why this line and not arm-d′'s (invertibility, disc means allowed):**

1. It is the strongest form of the mechanism's structural robustness claim — created colours are
   discontinuous functions of the input; order statistics of large populations are not. Testing
   the weaker line tests less.
2. Portfolio distinctness: disc-mean fields overlap P5 (smooth fit) and P6 (surround-at-scale).
   The six prototypes are an experiment; this one is the rank-discipline arm of it.
3. Auditability: "no colour average anywhere" is checkable by an independent reader of the code;
   invertibility (arm-d′) required its author to name a "soft joint" in his own proposal.

**Audit standard:** an independent verifier re-derives, from the code alone, that no published
colour ever passed through an averaged value. Violations are reported upward, never smoothed.

## Pre-registered falsifier (arm-d §7, run before the selection cascade is trusted)

For each endorsed role colour (351 palettes, `data/legacy/endorsements.json`), find the pixels
bearing that exact triple in the source image and compute where they sit in this prototype's field
orderings. **If endorsed answers sit roughly uniformly in the middle of every ordering rather than
concentrated near the designated ends, the paradigm is wrong** — tuning moves where we cut, never
what the order is. A stable-but-wrong palette is under-tuned; mid-ordering endorsed colours are a
refutation, reported as MECHANISM-FALSIFIED.

## Structure

- `src/` — field machinery and the selection cascade (devloop candidate at `src/candidate.ts`).
- `falsifier/` — independent implementation of the core fields + the rank-position study. Kept
  deliberately separate from `src/` (two implementations of the load-bearing fields, compared).
- `review-rounds/` — staged material for reviewer rounds.

## Provisional constants

All constants introduced here carry provenance tags per `CONVENTIONS.md`; at birth they are
`[UNCALIBRATED]` with the anchoring plan from arm-d §4 noted inline (τ and k are measured against
the robustness harness; β and ρ* await review rounds; ink annulus ratio awaits a stratified sweep).
