/**
 * Field-model constants and the declared total order used for tie-breaks (SPEC rule 1).
 *
 * Every value here carries a provenance tag and one line saying where it comes from, per
 * `CONVENTIONS.md`. **No exchange rate lives in this file** — SPEC rule 4 puts every free rate in
 * `src/energy/rates.ts`, so the field model's description-length rate arrives as an argument
 * (`FieldModelRates`) and is never read from a module constant. The one rate-adjacent number below
 * is `FIELD_DL_STEP_REJECTION_FLOOR`, which is not a rate but an **analytic lower bound on one** —
 * the value the registry's rate has to clear for the proposal's own hard case to be rejected
 * structurally rather than by taste. It is exported so `src/energy/rates.ts` can be set safely and
 * so the bound is auditable rather than folded into prose.
 */

import { MAX_GRADIENT_STOPS } from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"

/**
 * Parameters the 1-D field model spends that the 0-D model does not.
 *
 * `[HELD]` — a counting decision, not a measurement. The 1-D model adds, over "one point plus
 * noise": the segment's **direction** in OKLab (2 degrees of freedom on the unit sphere), the
 * segment's **extent** (1), and the **spatial slope** of position-along-segment against the two
 * image coordinates (2). Total 5. The segment's centre and the noise scale are shared with the 0-D
 * model (the noise scale is inherited from the contract, not fitted), so neither is counted.
 *
 * An auditor may reasonably count the extent as part of the direction or charge the polyline knot
 * separately; the number is deliberately visible rather than dissolved into the exchange rate, so
 * moving it is a one-line, reviewable change.
 */
export const FIELD_1D_EXTRA_PARAMETERS = 5

/**
 * The smallest description-length exchange rate at which **two flat areas of different colour**
 * cannot be read as a gradient. Analytic; re-derived numerically in `tests/fieldmodel.test.ts`.
 *
 * `[HELD — analytic, re-derived in tests/fieldmodel.test.ts]`. The proposal names this case as the
 * one the covariance alone cannot separate (`arm-e-prime.md` §2.3): *"two flat areas of different
 * colour produce an elongated covariance exactly as a ramp does, and only the spatial regression
 * separates them."* The regression separates them by a **provable margin**, which is what this
 * bound is:
 *
 * Let the field be two regions of colours `a` and `b`, split at fraction `p` along the fitted
 * spatial direction. Position-along-segment `t` is then a step function of that coordinate, and the
 * weighted least-squares fit of a step against a uniform coordinate explains exactly
 * `R² = 3p(1 − p)` of `t`'s variance — maximised at `p = ½`, where `R² = ¾`. So the 1-D model can
 * never remove more than three quarters of the variance of a two-region field, whatever the two
 * colours are and however far apart they sit. Its data-cost gain is therefore bounded by
 * `½·ln(1 / (1 − ¾)) = ln 2 ≈ 0.6931` nats, **independently of the colour separation and of the
 * noise scale**.
 *
 * A genuine ramp has no such ceiling: its residual falls to the noise floor, so its gain grows like
 * `½·ln(extent² / bar²)` and exceeds `ln 2` as soon as the ramp is a few same-colour bars long.
 * Charging the 1-D model more than `ln 2` in total therefore rejects every two-region field by
 * construction while leaving every ramp longer than a handful of bars intact. Dividing by the
 * parameter count gives the floor on the per-parameter rate.
 *
 * **Consumer obligation:** `src/energy/rates.ts` must set `fieldDescriptionLength` strictly above
 * this value. Below it, the field model is knowingly able to publish two flat halves as a ramp.
 */
export const FIELD_DL_STEP_REJECTION_FLOOR = Math.LN2 / FIELD_1D_EXTRA_PARAMETERS

/**
 * Mass quantile trimmed from each end when reading the segment's ends off Φ's projection.
 *
 * `[HELD]` — a robustness choice with no measurement behind it. The ends of the fitted segment are
 * read as the 2nd and 98th mass percentiles of `t` rather than its extremes, because a single
 * outlying field pixel (a JPEG ringing artefact at a letter's edge that still scored field-like at
 * every scale) would otherwise set a published stop. Trimming by mass keeps the reading scale-free.
 */
export const FIELD_END_QUANTILE = 0.02

/**
 * Bins in the weighted histogram of `t` used to read those quantiles.
 *
 * `[HELD]` — quadrature, not a decision about the image. At 4096 bins over the ±8σ range below, a
 * bin is σ/256 wide, three orders of magnitude below the same-colour bar for any field with a
 * measurable extent, so the quantile's bin-edge sensitivity cannot move a published stop.
 */
export const FIELD_T_HISTOGRAM_BINS = 4096

/**
 * Half-width of that histogram's range, in standard deviations of `t`.
 *
 * `[HELD — analytic]`. Chebyshev's inequality bounds the mass outside ±kσ by 1/k²; at k = 8 that is
 * 1.5625%, strictly below `FIELD_END_QUANTILE` = 2%. So both trimmed quantiles are guaranteed to
 * fall in an interior bin, and clamping the (at most 1.5625% of) out-of-range mass into the two end
 * bins cannot move them — clamping preserves both total mass and ordering. This is why no
 * min/max pass over the pixels is needed.
 */
export const FIELD_T_HISTOGRAM_SIGMAS = 8

/**
 * The excursion bar, as a multiple of the same-colour bar at the sampled point's region.
 *
 * `[INHERITED]` — `PHASE_0_DECISIONS.md` §3, pathology **P1 — Off-artwork ramp**: *"rendered
 * gradient's worst excursion from populated artwork colors above the excursion bar, after guide
 * stops. Bar inherited (2.5× same-color) — recalibrate in the bracketing round."* Re-affirmed as
 * still inherited and still unrecalibrated by `PHASE_0_LOOSE_ENDS.md` B12 and §"still open"
 * (2.5×), and listed as inherited-not-ours by the proposal (`arm-e-prime.md` §4) and this
 * prototype's `README.md`.
 *
 * **Deviation reported to the orchestrator:** the multiplier has **no named export in
 * `src/contract/constants.ts`** — the contract file carries `SAME_COLOR_BAR_BY_REGION` and the ramp
 * sampling constants but not this multiple, so it is declared here rather than imported. If it is
 * hoisted into the contract, this constant should be deleted and the import taken, not duplicated.
 */
export const EXCURSION_BAR_MULTIPLIER = 2.5

/**
 * Uniform samples per ramp segment in the excursion profile.
 *
 * `[HELD — analytic]`, and deliberately **not** `RAMP_SAMPLES_PER_SEGMENT` (2048). That contract
 * constant is measured for APCA over the *rendered 8-bit* ramp, where the integrand is a step
 * function and density has to beat quantisation cells. This integrand is different: distance to the
 * nearest populated artwork colour is **1-Lipschitz in OKLab** by construction (it is a distance
 * function), and it is measured on the ideal OKLab segment. So a peak between two samples can be
 * understated by at most half the sample spacing in OKLab units: for a segment of length ℓ, at most
 * `ℓ / (2 × 512)`. At ℓ = 0.6 — a long ramp — that is 0.0006, about 2.5% of the tightest excursion
 * bar (2.5 × 0.00932 = 0.0233). The bound is a proof about the integrand rather than a measurement,
 * which is why the density can be four times cheaper than the contract's.
 */
export const EXCURSION_SAMPLES_PER_SEGMENT = 512

/**
 * The most stops this module will ever **publish** in `stops`.
 *
 * `[REVIEWED]` — the guide-stop ruling quoted in `PHASE_1_AUTHOR_BRIEF.md` §3.1: *"A gradient can
 * have 2 or 3 stops (4 is negociable if proven utility)"*, and the fourth stop is *"negotiable on
 * proven utility rather than granted"*. The contract's `MAX_GRADIENT_STOPS` is 4 and is the
 * validator's ceiling; 3 is the ceiling on what a fitter may publish without a negotiation, so a
 * useful fourth stop leaves this module in `reportedFourthStop` with its excursion evidence and
 * never in `stops`. Asserted against the contract's own ceiling at module load.
 */
export const MAX_PUBLISHED_GRADIENT_STOPS = 3

if (MAX_PUBLISHED_GRADIENT_STOPS > MAX_GRADIENT_STOPS) {
	throw new RangeError(
		`the published-stop ceiling ${MAX_PUBLISHED_GRADIENT_STOPS} exceeds the contract's ${MAX_GRADIENT_STOPS}`,
	)
}

/**
 * Minimum gap in `t` between an inserted interior stop and its neighbours.
 *
 * `[HELD]` — an emitter-safety margin. `src/contract/ramp.ts` records that the CSS emitter rounds
 * stop percentages to two decimals and that two stops within 0.01% of each other collapse into a
 * hard stop; invariant 1 additionally requires strictly increasing positions. 0.01 in position is
 * two orders of magnitude above that rounding granularity, so an inserted stop can neither collapse
 * nor reorder.
 */
export const INTERIOR_STOP_T_MARGIN = 0.01

/**
 * Positions, relative to the excursion peak, at which candidate guide-stop colours are read off the
 * artwork.
 *
 * `[HELD]` — a small deterministic candidate set. The stop is always *placed* at the peak (the
 * ruling admits a stop only for excursion reduction at the peak), but the best colour to place
 * there is not always the artwork colour nearest the peak: on a curved colour path the triple that
 * most flattens the profile often sits slightly along the path. Five candidates, symmetric,
 * ordered smallest-offset-first so the peak's own nearest triple is examined before its neighbours.
 */
export const GUIDE_CANDIDATE_T_OFFSETS = [0, -0.02, 0.02, -0.05, 0.05] as const

/**
 * How much an inserted stop must reduce the normalised excursion maximum to be admitted.
 *
 * `[HELD]` — a strict-improvement epsilon, guarding floating-point ties only. The ruling forbids
 * meandering; requiring strict reduction makes a meandering stop *unreachable* rather than
 * forbidden, which is the form the campaign settled on (`DIVERGENCE_MAP.md` §6.4).
 */
export const EXCURSION_IMPROVEMENT_EPSILON = 1e-12

/**
 * How many field hypotheses are carried forward to the energy.
 *
 * `[HELD]` — the proposal charges itself for this one explicitly (`arm-e-prime.md` §4, the second
 * of "the two I will not pretend away"): *"the number of field hypotheses carried forward, which
 * trades cost against optimality and can in principle be argued to convergence rather than
 * chosen."* Three is what §2.5 enumerates — *"the 0-D model, the 1-D model, the best alternative
 * second-field candidates"* — and nothing here decides the field: the energy evaluates the full
 * tuple under each.
 */
export const FIELD_HYPOTHESIS_COUNT = 3

/**
 * How far apart, in lattice bandwidths, two field colours must sit to count as different fields.
 *
 * `[HELD]` — derived from quadrature rather than chosen against data. The lattice's statistics are
 * one Gaussian of bandwidth `h` (`arm-e-prime.md` §2.2), so two points closer than a couple of
 * bandwidths are one mode read twice, not two field candidates. Expressed in bandwidths so it moves
 * with the lattice instead of drifting from it.
 */
export const FIELD_MODE_SEPARATION_BANDWIDTHS = 2

/**
 * Cyclic Jacobi sweeps used to diagonalise Φ's 3×3 covariance.
 *
 * `[HELD]` — a fixed iteration count, chosen for determinism over a convergence test: SPEC rule 1
 * requires the same file to produce a byte-identical palette, and a tolerance-terminated loop makes
 * the iteration count a function of the last bit of the input. Cyclic Jacobi on a 3×3 symmetric
 * matrix converges quadratically and is at machine precision within about 5 sweeps; 12 is that with
 * margin, at a cost of 36 rotations on a fixed-size matrix.
 */
export const JACOBI_SWEEPS = 12

/**
 * Weight below which the field mass is treated as absent.
 *
 * `[HELD]` — a numeric guard, not a threshold on the image: it exists so that a field-weight plane
 * that is uniformly zero (nothing in the artwork is its own surround at every scale) is detected as
 * such rather than dividing by zero.
 */
export const FIELD_MASS_EPSILON = 1e-12

/**
 * **The declared total order on 8-bit triples** — SPEC rule 1's tie-break, reachable only on exact
 * ties and reading nothing outside the pixel values.
 *
 * `[HELD]` — red, then green, then blue, ascending. Any total order would do; what matters is that
 * it is declared, deterministic, and independent of counts, iteration order and file names.
 */
export function tripleOrderKey(rgb: Rgb8): number {
	return rgb[0] * 65536 + rgb[1] * 256 + rgb[2]
}
