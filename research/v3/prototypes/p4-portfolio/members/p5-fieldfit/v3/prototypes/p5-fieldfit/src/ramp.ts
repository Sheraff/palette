/**
 * P5 field-fit prototype — **ramp reading** (W-READ). Owner module per `../SPEC.md`'s pipeline
 * table: dominant direction from the affine part, t-parameterisation, orientation, endpoint
 * targets, the excursion test against the inventory, and third-stop insertion.
 *
 * This module reads a *fitted field* into the two (or three) continuous OKLab targets the caller
 * will snap and publish. It never snaps, never touches the ledger's discrete choice, and never
 * segments: everything it knows about the image comes from the fit's per-pixel weights and from
 * the inventory of occupied colours.
 *
 * ## What the spec says and what this implementation does
 *
 * SPEC decisions 2, 3 and 5 are the binding ones. Three places where the letter of the spec needed
 * a reading, all stated here rather than buried:
 *
 * 1. **Endpoints are robust, not extremal.** `arm-f-r3` §2.3 parameterises by `t = d·x` "over the
 *    image extent" and takes `g(t_min)`, `g(t_max)`. Taken literally that reads the field at the
 *    image corners, where the affine model is extrapolating hardest and where a single stray
 *    corner pixel moves the published colour. This module instead evaluates the field at the
 *    **weighted 2nd and 98th percentiles of t** (inlier weight as the weight). Same construction,
 *    same ends, but the endpoint colour is one a non-trivial area of the image actually shows.
 *    This is a refinement of "the extremes", declared, and it is the only place where a numeric
 *    choice was added that the spec did not name. `[UNCALIBRATED]` — 2/98 is a convention.
 *
 * 2. **Orientation sign.** SPEC decision 3 and `arm-f-r3` §2.3 both open with the principle —
 *    *"background is the larger field"* — and then restate it mechanically as *"the weighted median
 *    of t leans away from the background end"*. Those two clauses contradict each other: if the
 *    median leans toward one end, that end is where the inlier mass is, i.e. the **larger** field.
 *    The principle binds and the restatement does not (SPEC preamble: "principles bind, numbers do
 *    not"), so this module puts the background at the end the median leans **toward**, and the
 *    contradiction is reported upward rather than silently resolved. The rule is a single named
 *    constant, `BACKGROUND_IS_MAJORITY_END`, so the orchestrator can invert it in one line if the
 *    literal reading was meant.
 *
 * 3. **The excursion test runs on the endpoint _targets_, not on the snapped ends.** `arm-f-r3`
 *    §2.4 insists the projection comes first, because the rendered ramp interpolates published
 *    colours. That is true and remains the caller's obligation to re-check after snapping; but
 *    `snap.ts` is W-CORE's module and this one is given only the fit, so the test here is the
 *    pre-snap one. Since a snap moves each end by less than the bar, the pre-snap excursion and
 *    the post-snap excursion differ by less than the bar as well.
 *    *v0.7.1: that last sentence is true of the **occupied-colour** excursion and false of decision
 *    17's path excursion* — the path sits bars away from the chord, so rotating the chord by a
 *    sub-bar move at each end changes the measurement by more than a bar (measured: 1.90 → 2.57 bars
 *    on `16a8247378`). The stop rule is therefore exported (`bestGuideStop`) and re-run by the caller
 *    on the published colours, which is arm-f-r3 §2.4's own instruction taken literally. This module
 *    still does not snap and still never touches the ledger's discrete choice.
 *
 * Everything is deterministic: no randomness, no map-iteration-order dependence (every candidate
 * list is sorted on `(value, …, packed int)`), and every accumulation is in a fixed pixel order.
 *
 * ## v0.5: reading **one component's** ramp, with no support-restriction code in this file
 *
 * `E2_BRIEF.md` asks for the gradient of the most extensive field-like component — "its affine term
 * over its own support, by the existing ramp machinery restricted to the component's support". The
 * restriction is applied to the *input*, not here: `components.ts`'s `componentFieldFit` hands this
 * module a `FieldFit` whose weight map is zero off the component's support, and every quantity below
 * that reads weights — the t-histogram, both endpoint quantiles, the orientation median and its
 * standard error, the two-block mass ranking — is thereby computed over that support and nothing
 * else. The coefficients are the component's, so `fieldAt` is the component's surface.
 *
 * That is the whole of the change, and it is deliberate: a support-restricted *reader* would have
 * been a second implementation of the same six statistics, free to drift from this one. The two
 * things worth stating about the substitution:
 *
 *  - the endpoint quantiles are 2/98 **of the component's own weight mass**, so the ends are colours
 *    a non-trivial area *of the component* shows — the same refinement as before, one scale down;
 *  - `excursionMax` still measures against the whole artwork's inventory, not the component's
 *    colours. That is intended: the excursion test asks whether the rendered ramp passes through
 *    colours the *picture* contains, and the picture is the picture whichever field is being read.
 *
 * ## v0.6: the guide-stop doctrine (SPEC decision 5, ruling of 2026-08-05)
 *
 * Until v0.5 an excursion above the bar was refused into the two-block fallback unless a middle stop
 * either brought it under the bar outright or divided it by two. The `≥2×` prong was uncalibrated and
 * it rejected the exact case guide stops exist for — round-3 item 8, a chromatic arc at 2.36 bars
 * whose best stop lands at 1.3 bars, refused into a two-block reading of a cover that is one field.
 * The ruling replaces the prong with a **discriminator and a preference**:
 *
 * 1. **Which reading applies is decided by the continuity of inlier mass over the ramp coordinate**,
 *    not by how well a polyline happens to fit. `rampContinuity` projects every inlier pixel's colour
 *    onto the chord background→surface and measures how much weight sits in the chord's **middle
 *    third**. One field with a bend fills the middle (its colours run continuously from one end to
 *    the other, off the straight chord but along the path); two blocks leave it empty. Continuous ⇒
 *    ramp-with-bend; bimodal ⇒ two blocks, and **that is now the only route to the two-block
 *    fallback**.
 * 2. **On a continuous ramp above the bar, the best monotone excursion-reducing stop is accepted and
 *    its residual is published**, even when the residual stays above the bar. Under-bar remains the
 *    ideal and is unchanged when it is achievable. Ties within the measurement's own resolution go to
 *    the **flattest path** — the smallest turning angle at the stop — which is the doctrine's guard
 *    against meandering, together with the monotonicity requirement that was already here.
 *
 * "Within the measurement's own resolution" is `excursionResolution`, not a tunable: `nearestDistance`
 * is 1-Lipschitz in its query colour and the excursion is a max over samples spaced
 * `length / (samples − 1)` apart, so the sampled max can understate the true max by at most half a
 * sample step and two excursions closer than that are the same measurement. Nothing new is
 * `[UNCALIBRATED]` there. The one genuinely uncalibrated number is the continuity threshold, and it is
 * anchored on two measured covers — see `CONTINUOUS_MIDDLE_BAND_MASS`.
 *
 * ## v0.7.1: the **ramp-path excursion** is what decides a stop (SPEC decision 17)
 *
 * Round-3 items 1 and 4 asked, unprompted, for *"a 3rd or 4th stop added to lead the interpolation
 * through colors that better match the artwork"*. Decision 17 answers it by restoring arm-f §2.6's
 * original formulation: the deciding quantity is the distance from **the field's own colour path
 * `g(t)`** to the rendered polyline — not the distance from the polyline to the nearest occupied
 * colour, which is what v0.1–v0.7.0 measured. The two questions differ: "does the drawn line pass
 * through colours the picture contains" (any colours, anywhere on it) versus "does the drawn line
 * follow the colours the field actually runs through". Only the second can ask for a stop that leads
 * the interpolation somewhere.
 *
 * **What `g(t)` is, and the one reading that has content.** Taken literally, "the fitted field
 * evaluated along the ramp coordinate" is `fieldAt(t·d)`, and `fieldAt` is affine
 * (`fieldfit.ts::fieldAtCoefficients`), so `fieldAt(t·d) = c + t·(B d)` is **exactly linear in t**:
 * that path *is* the chord, for every image, with excursion identically zero. A second reading —
 * average `fieldAt` over the support's slice at each t — bends only through `B`'s *second* singular
 * direction weighted by where the support happens to sit, which measures the shape of the mask, not
 * the colours of the picture. arm-f §2.6 states the intended construction and it is neither of those:
 *
 * > *"Parameterise the field's true colour path by the ramp coordinate `t ∈ [0,1]` — this is a
 * > one-dimensional curve obtained by binning the field-weighted pixels along `t` and taking the
 * > robust colour per bin, so it is again an integral."*
 *
 * So `g(t)` is **empirical in colour and fitted in everything else**: the coordinate is the fit's own
 * ramp coordinate, the support and the weights are the fit's (the component's, when a component is
 * being read), and the estimator is the fit's own weighted mean. "Robust colour per bin" is the
 * biweight weight doing the work it already does — a rejected pixel has `w = 0` and contributes
 * nothing, and the pixels left inside the cut are what the fit calls this field. Applying a *second*
 * robust estimator on top of the first would be a new uncalibrated choice inside a bin that the IRLS
 * has already cleaned.
 *
 * **Bins are equal-inlier-mass, not equal-t.** Every sample of `g` then rests on the same amount of
 * evidence, so no sample is noisier than another and a sparsely-travelled stretch of t cannot
 * manufacture a bend out of a handful of pixels. The failure mode this picks is the conservative one:
 * a bend in a region the field barely occupies is under-sampled rather than invented.
 *
 * **Only the span the ramp renders counts.** Path samples projecting outside `[0, 1]` of the chord
 * are excluded from the excursion and reported separately (`beyondEnds`), for the reason
 * `rampContinuity` already excludes out-of-span mass and W-P10's premise correction to decision 5
 * already gave: no interior vertex can shorten an endpoint's own distance, so deviation past an end is
 * an endpoint signal, not a stop one. Measured consequence on the dev sets: it is the *majority*
 * signal — 8 of 16 gradient covers put their worst path deviation past an end, and including it
 * admitted two stops on covers whose in-span path sat 0.19 and 0.69 bars from the chord.
 *
 * **What is decided by which quantity, stated.** Ramp-versus-two-blocks is *unchanged* — SPEC
 * decision 5's t-continuity discriminator owns it, and it is still triggered by the chord's distance
 * to the occupied colours. What decision 17 moves is **stop insertion**: the trigger, the candidate
 * neighbourhood, the ranking and the acceptance all run on `g(t)`→polyline. The occupied-colour
 * distance stays measured and stays published (`excursionMax`, `residualExcursion`) as the
 * "stays-on-artwork" half of the doctrine — it is a report, no longer a decision.
 *
 * **Where the rule runs.** `bestGuideStop` is the whole of it, and it is invoked twice: here on the
 * fit's own targets (the pre-snap proxy `RampReading` publishes), and again by `candidate.ts` on the
 * snapped, collapse-resolved colours that are actually drawn. Under the old quantity a re-check
 * sufficed; under this one the frame matters — see `bestGuideStop`.
 */

import { colorFromRgb, okLabDistance, okLabToRgb, sameColor } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab, PaletteColor, Rgb8 } from "../../../src/contract/types.ts"
import { normalizedX, normalizedY } from "./decode.ts"
import type {
	DecodedRaster,
	FieldFit,
	Inventory,
	RampContinuity,
	RampReading,
	StopTarget,
	TripleStats,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Tunables — all `[UNCALIBRATED]` conventions, all stated
// ---------------------------------------------------------------------------------------------

/** Quantiles of t (weighted by inlier weight) used as the ramp's ends. See header note 1. */
const ENDPOINT_QUANTILE_LOW = 0.02
const ENDPOINT_QUANTILE_HIGH = 0.98

/** Bins of the weighted t histogram the quantiles and the median are read from. */
const T_HISTOGRAM_BINS = 4096

/** Samples along the two-stop chord for the excursion test (SPEC decision 5: "~64"). */
const CHORD_SAMPLES = 64

/** Samples per segment of a three-stop polyline (64 in total, matching the chord's budget). */
const POLYLINE_SAMPLES_PER_SEGMENT = 32

/**
 * **The t-continuity discriminator's band and its threshold** (SPEC decision 5, ruling 2026-08-05).
 *
 * The band is the chord's middle third: mass at `u ∈ [1/3, 2/3]` of the projection onto
 * background→surface, as a fraction of the inlier mass that falls inside the chord's own span. A
 * uniform distribution along the ramp puts exactly 1/3 of its mass there, so the quantity reads as a
 * fraction of "what a straight, evenly-travelled ramp would show".
 *
 * `CONTINUOUS_MIDDLE_BAND_MASS = 1/6` is `[UNCALIBRATED]` and is **half the uniform expectation** —
 * the middle third must carry at least half the mass an evenly travelled ramp would put there. (Half,
 * not the whole, because 1/3 is a *floor* for a travelled ramp rather than its value: a ramp read
 * along a diagonal projects a rectangle onto its axis and the resulting tent density puts nearer 0.47
 * in the middle third. See `tests/ramp.test.ts`.) It is anchored, per the ruling, on the two covers
 * the ruling names, both measured before the constant was set:
 *
 *  - round-3 item 8, `09/…78343d` (must read **continuous**): **0.2982**, the discriminator's own
 *    measurement on the global fit's weights and the field's chord. The histogram is flat from end to
 *    end apart from the red field's spike at `u ≈ 0`;
 *  - `00/…2376a6b67d` (must read **bimodal**): **0.0446** on the global fit's weights over the chord
 *    between the two colours the cover publishes, and **0.0000** on the component weights its
 *    two-component reading actually uses. The yellow field sits at `u ≈ 0` and the white at `u ≈ 1`
 *    with nothing between; 0.0446 is the more generous of the two and is the one the threshold has to
 *    clear.
 *
 * 1/6 therefore sits **1.79× below** the continuous anchor and **3.74× above** the strictest bimodal
 * one. The two anchors are 6.7× apart in this number and the value is picked in the gap on a stated
 * principle, not fitted to either end of it. Both anchors are pinned as tests.
 */
const CONTINUITY_BAND_LOW = 1 / 3
const CONTINUITY_BAND_HIGH = 2 / 3
const CONTINUOUS_MIDDLE_BAND_MASS = 1 / 6

/**
 * **Samples of the field's colour path `g(t)`** (SPEC decision 17), as equal-inlier-mass bands of the
 * ramp coordinate over the published span (`ENDPOINT_QUANTILE_LOW`…`HIGH`).
 *
 * 64 because that is the chord's own sample budget (`CHORD_SAMPLES`): the two things being compared —
 * a path and a polyline — are then measured at the same density, and one number was fixed before this
 * one existed. Not `[UNCALIBRATED]`: it is a sampling budget shared with a budget already stated, and
 * the resolution it implies is computed rather than assumed (`pathSamplingResolution`).
 */
const PATH_BANDS = CHORD_SAMPLES

/**
 * **The adjacent-stop spacing floor**, as a fraction of the ramp (SPEC decision 17). `[UNCALIBRATED]`.
 *
 * Anchor, quoted: *"adjacent stops 3.1% apart read as 'very significant banding' to the reviewer"*
 * (`review-rounds/round-3/NOTES-cross-arm.md` §2 — another arm's round, folded in before ours). That
 * is one measured **complaint**, so it bounds the floor from below and says nothing about where above
 * it the floor belongs; a floor set *at* the complaint would re-publish the geometry that drew it.
 *
 * 0.10 is chosen for two stated reasons and no fitting. (a) It clears the anchor by **3.2×**, which is
 * the same order of margin decision 14 required of its twin-exclusion multiple (≥20% was the minimum
 * there; this is far past it) — one complaint at 3.1% is thin evidence and a thin margin over thin
 * evidence is not a floor. (b) It is the coarsest fraction that still leaves the guide stop the
 * **middle 80% of the ramp** to land in, and every guide stop this prototype has ever accepted sat
 * inside that band (the two-lobe fixture's is at 0.35, the bend fixture's at 0.50), so the floor is
 * paid for by geometry nothing has yet needed rather than by refusing observed stops.
 *
 * With one interior stop there are exactly two adjacent gaps — `position` and `1 − position` — so the
 * floor reads as `position ∈ [0.10, 0.90]`. It is not the only guard: monotonicity and the reduction
 * requirement already bind, and this one exists because *those two* say nothing about how close to an
 * end a stop may sit.
 */
export const STOP_SPACING_MIN_FRACTION = 0.1

/** Candidate colours are occupied triples within `max(this × excursion, 3 × bar)` of the worst sample. */
const THIRD_STOP_RADIUS_FACTOR = 2

/** Ceiling on evaluated candidates; more than this and the sorted list is strided (see `pickCandidates`). */
const THIRD_STOP_CANDIDATE_LIMIT = 256

/** Cell size of the OKLab hash grid used for nearest-occupied-colour queries. */
const COLOR_GRID_CELL = 0.02

/**
 * **The orientation sign.** `true` = background sits at the end the weighted median of t leans
 * *toward* (the majority-inlier-mass end, i.e. "background is the larger field"). See header note 2:
 * this is the principle clause of SPEC decision 3, not its mechanical restatement.
 */
const BACKGROUND_IS_MAJORITY_END = true

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

function packedOf(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

function subtract(a: OkLab, b: OkLab): [number, number, number] {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: readonly number[], b: readonly number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function mix(a: OkLab, b: OkLab, u: number): OkLab {
	return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** Where `color` falls on the parameterisation of the segment `from`→`to` (0 = from, 1 = to). */
export function projectionFraction(from: OkLab, to: OkLab, color: OkLab): number {
	const axis = subtract(to, from)
	const lengthSquared = dot(axis, axis)
	if (lengthSquared <= 0) return 0
	return dot(subtract(color, from), axis) / lengthSquared
}

/** Turning angle in radians at the middle vertex of `from`→`middle`→`to`. Ties break on this. */
function turningAngle(from: OkLab, middle: OkLab, to: OkLab): number {
	const incoming = subtract(middle, from)
	const outgoing = subtract(to, middle)
	const norms = Math.sqrt(dot(incoming, incoming)) * Math.sqrt(dot(outgoing, outgoing))
	if (norms <= 0) return 0
	return Math.acos(Math.min(1, Math.max(-1, dot(incoming, outgoing) / norms)))
}

// ---------------------------------------------------------------------------------------------
// Dominant direction: largest right singular vector of the 3×2 position-coefficient matrix
// ---------------------------------------------------------------------------------------------

/**
 * The image-plane direction along which the field's colour moves fastest.
 *
 * `B` is 3×2 (one row per OKLab channel, columns x and y). Its largest right singular vector is the
 * top eigenvector of the 2×2 symmetric `BᵀB`, which has a closed form — no iteration, hence exactly
 * reproducible. Returns `null` when the position coefficients are (numerically) zero, i.e. the
 * order-1 fit is a constant in disguise.
 *
 * The sign is canonicalised (first non-zero component positive) so the result does not depend on
 * floating-point luck; orientation flips it afterwards if the background turns out to be the high-t
 * end.
 */
function dominantDirection(coefficients: Float64Array): [number, number] | null {
	let mxx = 0
	let mxy = 0
	let myy = 0
	for (let channel = 0; channel < 3; channel++) {
		const bx = coefficients[channel * 3 + 1]
		const by = coefficients[channel * 3 + 2]
		mxx += bx * bx
		mxy += bx * by
		myy += by * by
	}
	if (!(mxx + myy > 1e-24)) return null

	const mean = (mxx + myy) / 2
	const largest = mean + Math.hypot((mxx - myy) / 2, mxy)

	let vx: number
	let vy: number
	if (mxy !== 0) {
		vx = mxy
		vy = largest - mxx
	} else if (mxx >= myy) {
		vx = 1
		vy = 0
	} else {
		vx = 0
		vy = 1
	}
	const norm = Math.hypot(vx, vy)
	if (!(norm > 0)) return null
	vx /= norm
	vy /= norm
	if (vx < 0 || (vx === 0 && vy < 0)) {
		vx = -vx
		vy = -vy
	}
	return [vx, vy]
}

// ---------------------------------------------------------------------------------------------
// Weighted t statistics
// ---------------------------------------------------------------------------------------------

type TStatistics = Readonly<{
	/** Weighted `ENDPOINT_QUANTILE_LOW`/`HIGH` quantiles of t. */
	tLow: number
	tHigh: number
	/** Weighted median of t. */
	tMedian: number
	/** Standard error of the weighted median (uniform-density approximation, see below). */
	medianStandardError: number
	weightSum: number
	/**
	 * The weighted t histogram the three order statistics were read from, kept so decision 17's colour
	 * path can cut its equal-mass bands out of **the same** distribution the ends came from rather than
	 * re-accumulating a second one that could differ from it.
	 */
	histogram: Float64Array
	tMin: number
	binWidth: number
}>

/**
 * One pass over the raster accumulating the weighted distribution of `t = d·(x, y)` into a fixed
 * histogram, from which the quantiles and the median are read with linear interpolation inside the
 * containing bin. A histogram rather than a sort because the raster is full-resolution: sorting
 * 10⁷ keys per image to find three order statistics is the wrong shape, and the bin width here
 * (range / 4096) is three orders of magnitude below the colour differences that follow.
 *
 * **Standard error of the median.** `SE ≈ 1 / (2·f(m)·√n_eff)` with the density `f` approximated as
 * uniform over the 2–98 span — i.e. `SE = (tHigh − tLow) / (2·√n_eff)` — and `n_eff = (Σw)² / Σw²`,
 * the effective sample size the weight mass carries. This is the "computable from the weight mass"
 * quantity SPEC decision 3's near-tie clause needs; it is an approximation and is declared as one.
 */
function tStatistics(
	fit: FieldFit,
	raster: DecodedRaster,
	direction: readonly [number, number],
): TStatistics | null {
	const { width, height } = raster
	// The coordinate frame is `decode.ts`'s pixel-centre convention, imported rather than restated
	// so the t-axis is the same frame the fit's coefficients were estimated in.
	const xs = new Float64Array(width)
	for (let px = 0; px < width; px++) xs[px] = normalizedX(px, width) * direction[0]
	const ys = new Float64Array(height)
	for (let py = 0; py < height; py++) ys[py] = normalizedY(py, height) * direction[1]

	// Exact t range over the sampled pixel centres (the convention is exclusive of ±1).
	const extentX = Math.abs(direction[0]) * (1 - 1 / width)
	const extentY = Math.abs(direction[1]) * (1 - 1 / height)
	const tMin = -(extentX + extentY)
	const tMax = extentX + extentY
	if (!(tMax > tMin)) return null

	const binWidth = (tMax - tMin) / T_HISTOGRAM_BINS
	const histogram = new Float64Array(T_HISTOGRAM_BINS)
	let weightSum = 0
	let weightSquareSum = 0

	const weights = fit.weights
	for (let py = 0; py < height; py++) {
		const rowOffset = py * width
		const yPart = ys[py]
		for (let px = 0; px < width; px++) {
			const weight = weights[rowOffset + px]
			if (!(weight > 0)) continue
			const t = xs[px] + yPart
			let bin = Math.floor((t - tMin) / binWidth)
			if (bin < 0) bin = 0
			else if (bin >= T_HISTOGRAM_BINS) bin = T_HISTOGRAM_BINS - 1
			histogram[bin] += weight
			weightSum += weight
			weightSquareSum += weight * weight
		}
	}
	if (!(weightSum > 0) || !(weightSquareSum > 0)) return null

	const quantile = (q: number): number => {
		const target = q * weightSum
		let cumulative = 0
		for (let bin = 0; bin < T_HISTOGRAM_BINS; bin++) {
			const mass = histogram[bin]
			if (mass > 0 && cumulative + mass >= target) {
				return tMin + (bin + (target - cumulative) / mass) * binWidth
			}
			cumulative += mass
		}
		return tMax
	}

	const tLow = quantile(ENDPOINT_QUANTILE_LOW)
	const tHigh = quantile(ENDPOINT_QUANTILE_HIGH)
	const tMedian = quantile(0.5)
	const effectiveSamples = (weightSum * weightSum) / weightSquareSum
	const medianStandardError = effectiveSamples > 0
		? (tHigh - tLow) / (2 * Math.sqrt(effectiveSamples))
		: 0

	return {
		tLow,
		tHigh,
		tMedian,
		medianStandardError,
		weightSum,
		histogram,
		tMin,
		binWidth,
	}
}

// ---------------------------------------------------------------------------------------------
// The field's own colour path g(t) (SPEC decision 17, arm-f §2.6)
// ---------------------------------------------------------------------------------------------

/**
 * **`g(t)`: the colour the field actually runs through, sampled along the ramp coordinate.**
 *
 * See the header for why this is empirical in colour rather than a re-evaluation of the affine
 * surface (which is the chord, identically, for every image). Construction, in one pass:
 *
 *  1. cut the ramp's published span — the mass between the two endpoint quantiles — into `PATH_BANDS`
 *     **equal-inlier-mass** bands, using the same t histogram the endpoints were read from. A band is
 *     a contiguous run of histogram bins, so the assignment is exact at the histogram's own
 *     resolution (`range / 4096`, three orders below the colour differences that follow) and needs no
 *     per-pixel search;
 *  2. accumulate `Σw·colour` and `Σw` per band over the raster, in fixed pixel order;
 *  3. the band's sample is `Σw·colour / Σw` — the fit's own weighted mean, which is where the
 *     robustness lives (rejected pixels carry `w = 0`).
 *
 * Bands that no bin fell into are dropped rather than interpolated: a gap in t is an absence of
 * evidence, and inventing a sample there would be inventing the very bend the caller is about to
 * measure. The result is ordered by t (background end first), so a caller may compare it against a
 * polyline drawn between the same two ends.
 */
function fittedColourPath(
	fit: FieldFit,
	raster: DecodedRaster,
	direction: readonly [number, number],
	statistics: TStatistics,
): { samples: readonly OkLab[]; precision: number } {
	const { histogram, tMin, binWidth, weightSum } = statistics
	const lowMass = ENDPOINT_QUANTILE_LOW * weightSum
	const highMass = ENDPOINT_QUANTILE_HIGH * weightSum
	const spanMass = highMass - lowMass
	if (!(spanMass > 0)) return { samples: [], precision: 0 }

	// Bin → band, over the published span only. A bin is placed by where the *middle* of its mass
	// sits, which is the same convention the quantile reader uses when it interpolates inside a bin.
	const bandOfBin = new Int32Array(T_HISTOGRAM_BINS).fill(-1)
	let cumulative = 0
	for (let bin = 0; bin < T_HISTOGRAM_BINS; bin++) {
		const mass = histogram[bin]
		if (mass > 0) {
			const centre = cumulative + mass / 2
			if (centre >= lowMass && centre <= highMass) {
				const band = Math.floor(((centre - lowMass) / spanMass) * PATH_BANDS)
				bandOfBin[bin] = band < 0 ? 0 : band >= PATH_BANDS ? PATH_BANDS - 1 : band
			}
		}
		cumulative += mass
	}

	// Per band: Σw·L, Σw·a, Σw·b, Σw, Σw·L², Σw·a², Σw·b², Σw². The second moments are what turn the
	// band mean into a mean **with a standard error** — see `precision` below.
	const STRIDE = 8
	const sums = new Float64Array(PATH_BANDS * STRIDE)
	const { width, height, lab } = raster
	const weights = fit.weights
	const xs = new Float64Array(width)
	for (let px = 0; px < width; px++) xs[px] = normalizedX(px, width) * direction[0]
	const ys = new Float64Array(height)
	for (let py = 0; py < height; py++) ys[py] = normalizedY(py, height) * direction[1]

	for (let py = 0; py < height; py++) {
		const rowOffset = py * width
		const yPart = ys[py]
		for (let px = 0; px < width; px++) {
			const index = rowOffset + px
			const weight = weights[index]
			if (!(weight > 0)) continue
			let bin = Math.floor((xs[px] + yPart - tMin) / binWidth)
			if (bin < 0) bin = 0
			else if (bin >= T_HISTOGRAM_BINS) bin = T_HISTOGRAM_BINS - 1
			const band = bandOfBin[bin]
			if (band < 0) continue
			const slot = band * STRIDE
			const offset = index * 3
			const l = lab[offset]
			const a = lab[offset + 1]
			const b = lab[offset + 2]
			sums[slot] += weight * l
			sums[slot + 1] += weight * a
			sums[slot + 2] += weight * b
			sums[slot + 3] += weight
			sums[slot + 4] += weight * l * l
			sums[slot + 5] += weight * a * a
			sums[slot + 6] += weight * b * b
			sums[slot + 7] += weight * weight
		}
	}

	const path: OkLab[] = []
	let precision = 0
	for (let band = 0; band < PATH_BANDS; band++) {
		const slot = band * STRIDE
		const mass = sums[slot + 3]
		if (!(mass > 0)) continue
		const mean: OkLab = [sums[slot] / mass, sums[slot + 1] / mass, sums[slot + 2] / mass]
		path.push(mean)
		// **How precisely this sample locates the field's colour.** Weighted variance per channel
		// `Σw·c²/Σw − c̄²`, divided by the effective sample size the band's weight carries
		// (`n_eff = (Σw)² / Σw²`); the standard error is the norm of the three per-channel errors. This
		// is the honest noise floor of the path — *not* the gap between consecutive samples, which the
		// band budget was measured against and found not to shrink with it (that gap is a real jump in
		// the field's colour where the ramp coordinate carries little mass, so it is a fact about the
		// picture rather than about the sampling).
		let variance = 0
		for (let channel = 0; channel < 3; channel++) {
			const spread = sums[slot + 4 + channel] / mass - mean[channel] * mean[channel]
			if (spread > 0) variance += spread
		}
		const effective = (mass * mass) / sums[slot + 7]
		const error = effective > 0 ? Math.sqrt(variance / effective) : 0
		if (error > precision) precision = error
	}
	return { samples: path, precision }
}

/**
 * **Why a guide stop is inadmissible before its excursion is even measured** — the three conjuncts of
 * SPEC decision 17 that are properties of the *stop*, not of the reduction it buys. `null` means
 * admissible. Exported so the rule can be tested as a rule: the geometries that isolate each refusal
 * are knife-edge to construct out of a raster, and a fixture tuned until it trips a clause is a test
 * of the tuning.
 *
 *  - `"monotone"` — the stop does not project strictly between the ends (C7's measured midpoint hazard;
 *    the check decision 5's ruling points at, carried forward unchanged);
 *  - `"spacing"` — it sits closer to an end than `STOP_SPACING_MIN_FRACTION` of the ramp. With one
 *    interior stop the two adjacent gaps are `position` and `1 − position`, so one test covers both;
 *  - `"endpoint-colour"` — it is not a colour the endpoints do not already carry. Judged by the
 *    calibrated formula on the 8-bit colours, which is the test decision 2 applies to the ends
 *    themselves: a stop inside a bar of an end is that end published twice and leads the interpolation
 *    nowhere.
 */
export type GuideStopRefusal = "monotone" | "spacing" | "endpoint-colour" | null

export function guideStopRefusal(
	position: number,
	candidate: PaletteColor,
	background: PaletteColor,
	surface: PaletteColor,
): GuideStopRefusal {
	if (!(position > 0 && position < 1)) return "monotone"
	if (position < STOP_SPACING_MIN_FRACTION || position > 1 - STOP_SPACING_MIN_FRACTION) {
		return "spacing"
	}
	if (sameColor(candidate, background) || sameColor(candidate, surface)) return "endpoint-colour"
	return null
}

/** OKLab distance from `point` to the segment `from`→`to` (not to its infinite line). */
function pointToSegmentDistance(point: OkLab, from: OkLab, to: OkLab): number {
	const axis = subtract(to, from)
	const lengthSquared = dot(axis, axis)
	if (!(lengthSquared > 0)) return okLabDistance(point, from)
	let u = dot(subtract(point, from), axis) / lengthSquared
	if (u < 0) u = 0
	else if (u > 1) u = 1
	return okLabDistance(point, mix(from, to, u))
}

type PathExcursion = Readonly<{
	/** Largest distance to the polyline over path samples **inside the ramp's span**. */
	max: number
	worst: OkLab
	/** Largest such distance over the samples that projected **outside** it. Reported, never compared. */
	beyondEnds: number
}>

/**
 * **Decision 17's deciding quantity**: the largest distance from the field's colour path to the
 * rendered polyline, over the stretch of the path the interpolation is responsible for.
 *
 * Exact against the polyline (point-to-segment, minimised over segments) and sampled only along the
 * path, so the only discretisation is the path's own — and the path is a finite measured object, not a
 * curve being approximated (see `fittedColourPath`).
 *
 * **Samples projecting outside `[0, 1]` of the chord are excluded, not clamped**, and their worst
 * distance is reported separately. Two reasons, one house precedent and one measurement:
 *
 *  - `rampContinuity` already draws this exact line, in this file, for this reason — *"a colour beyond
 *    the ends is not evidence about what happens between them"*. The rendered ramp only exists for
 *    `u ∈ [0, 1]`; a field colour that projects past an end is a statement about **endpoint choice**;
 *  - W-P10's premise correction to decision 5 (2026-08-05) is the same point in the older quantity:
 *    *"no middle vertex can shorten an endpoint's own distance"*. Measured here on the 27-cover dev
 *    sets: **8 of 16** gradient covers put their worst path deviation outside the span, and on two of
 *    them an interior stop was admitted that shaved an irreducible endpoint term while the in-span
 *    path sat 0.19 and 0.69 bars from the chord — under the bar, i.e. exactly the "the straight line
 *    is already right, adding a stop is metric fitting" case the doctrine names inadmissible.
 *
 * The span is the polyline's own two ends, so the chord and the three-stop polyline are always scored
 * over the **same** set of samples and the comparison between them is a comparison.
 */
export function pathToPolylineExcursion(
	path: readonly OkLab[],
	polyline: readonly OkLab[],
): PathExcursion {
	if (path.length === 0 || polyline.length < 2) {
		return { max: 0, worst: polyline[0] ?? [0, 0, 0], beyondEnds: 0 }
	}
	const from = polyline[0]
	const to = polyline[polyline.length - 1]
	let max = -1
	let worst = path[0]
	let beyondEnds = 0
	for (let index = 0; index < path.length; index++) {
		const point = path[index]
		let nearest = Number.POSITIVE_INFINITY
		for (let vertex = 0; vertex + 1 < polyline.length; vertex++) {
			const distance = pointToSegmentDistance(point, polyline[vertex], polyline[vertex + 1])
			if (distance < nearest) nearest = distance
		}
		const span = projectionFraction(from, to, point)
		if (span < 0 || span > 1) {
			if (nearest > beyondEnds) beyondEnds = nearest
			continue
		}
		if (nearest > max) {
			max = nearest
			worst = point
		}
	}
	return { max: max < 0 ? 0 : max, worst, beyondEnds }
}

/**
 * **The widest gap between consecutive path samples**, halved — reported, never compared against.
 *
 * This is the quantity `excursionResolution` would be if `g` were a continuum sampled at these points:
 * distance-to-a-polyline is 1-Lipschitz, so between two samples the true maximum could exceed the
 * sampled one by half the gap. It is *measured and published* rather than used, because the
 * measurement refuted the premise: quadrupling `PATH_BANDS` (64 → 256) left the worst cover's gap at
 * 1.10 bars against 1.22 — it does not shrink with density, because it is a genuine jump in the
 * field's colour across a stretch of the ramp coordinate that carries almost no mass. A guard built on
 * it would be charging a real property of the picture as if it were sampling noise, and it refused a
 * measured 30% reduction on the very cover decision 17 was written for (`16a8247378`, 1.90 → 1.32
 * bars against a 0.70-bar gap). The acceptance guard is the band means' own standard error instead —
 * see `fittedColourPath`.
 */
export function pathLargestGap(path: readonly OkLab[]): number {
	let widest = 0
	for (let index = 0; index + 1 < path.length; index++) {
		const gap = okLabDistance(path[index], path[index + 1])
		if (gap > widest) widest = gap
	}
	return widest / 2
}

// ---------------------------------------------------------------------------------------------
// Occupied-colour index: coarse OKLab hash grid over the inventory's triples
// ---------------------------------------------------------------------------------------------

type ColorGrid = Readonly<{
	size: number
	/** OKLab distance from `color` to the nearest occupied triple; `Infinity` on an empty grid. */
	nearestDistance(color: OkLab): number
	/** Every occupied triple within `radius` of `color`, sorted by (distance asc, packed asc). */
	within(color: OkLab, radius: number): readonly TripleStats[]
}>

const GRID_KEY_OFFSET = 512
const GRID_KEY_STRIDE = 1024

function gridIndex(value: number): number {
	return Math.floor(value / COLOR_GRID_CELL)
}

function gridKey(i: number, j: number, k: number): number {
	return ((i + GRID_KEY_OFFSET) * GRID_KEY_STRIDE + (j + GRID_KEY_OFFSET)) * GRID_KEY_STRIDE +
		(k + GRID_KEY_OFFSET)
}

function buildColorGrid(inventory: Inventory): ColorGrid {
	const cells = new Map<number, TripleStats[]>()
	let minI = Number.POSITIVE_INFINITY
	let maxI = Number.NEGATIVE_INFINITY
	let minJ = Number.POSITIVE_INFINITY
	let maxJ = Number.NEGATIVE_INFINITY
	let minK = Number.POSITIVE_INFINITY
	let maxK = Number.NEGATIVE_INFINITY

	for (const triple of inventory.triples.values()) {
		const i = gridIndex(triple.lab[0])
		const j = gridIndex(triple.lab[1])
		const k = gridIndex(triple.lab[2])
		const key = gridKey(i, j, k)
		const bucket = cells.get(key)
		if (bucket) bucket.push(triple)
		else cells.set(key, [triple])
		if (i < minI) minI = i
		if (i > maxI) maxI = i
		if (j < minJ) minJ = j
		if (j > maxJ) maxJ = j
		if (k < minK) minK = k
		if (k > maxK) maxK = k
	}

	const size = inventory.triples.size

	function scanCell(key: number, color: OkLab, best: number): number {
		const bucket = cells.get(key)
		if (!bucket) return best
		let current = best
		for (const triple of bucket) {
			const distance = okLabDistance(color, triple.lab)
			if (distance < current) current = distance
		}
		return current
	}

	return {
		size,
		nearestDistance(color: OkLab): number {
			if (size === 0) return Number.POSITIVE_INFINITY
			const ci = gridIndex(color[0])
			const cj = gridIndex(color[1])
			const ck = gridIndex(color[2])
			// Exact ring limit: beyond this every occupied cell has already been scanned.
			const ringLimit = Math.max(
				Math.abs(ci - minI),
				Math.abs(ci - maxI),
				Math.abs(cj - minJ),
				Math.abs(cj - maxJ),
				Math.abs(ck - minK),
				Math.abs(ck - maxK),
			)
			let best = Number.POSITIVE_INFINITY
			for (let ring = 0; ring <= ringLimit; ring++) {
				// Any cell not yet scanned sits at Chebyshev ring ≥ ring + 1, so no point in it can
				// be closer than `ring × cell`. Stop as soon as the incumbent beats that bound.
				if (best <= ring * COLOR_GRID_CELL) break
				for (let di = -ring; di <= ring; di++) {
					const onI = Math.abs(di) === ring
					for (let dj = -ring; dj <= ring; dj++) {
						const onJ = onI || Math.abs(dj) === ring
						for (let dk = -ring; dk <= ring; dk++) {
							if (!onJ && Math.abs(dk) !== ring) continue
							best = scanCell(gridKey(ci + di, cj + dj, ck + dk), color, best)
						}
					}
				}
			}
			return best
		},
		within(color: OkLab, radius: number): readonly TripleStats[] {
			if (size === 0 || !(radius > 0)) return []
			const loI = gridIndex(color[0] - radius)
			const hiI = gridIndex(color[0] + radius)
			const loJ = gridIndex(color[1] - radius)
			const hiJ = gridIndex(color[1] + radius)
			const loK = gridIndex(color[2] - radius)
			const hiK = gridIndex(color[2] + radius)
			const found: { triple: TripleStats; distance: number }[] = []
			for (let i = loI; i <= hiI; i++) {
				for (let j = loJ; j <= hiJ; j++) {
					for (let k = loK; k <= hiK; k++) {
						const bucket = cells.get(gridKey(i, j, k))
						if (!bucket) continue
						for (const triple of bucket) {
							const distance = okLabDistance(color, triple.lab)
							if (distance <= radius) found.push({ triple, distance })
						}
					}
				}
			}
			found.sort((a, b) =>
				a.distance - b.distance || a.triple.packed - b.triple.packed
			)
			return found.map((entry) => entry.triple)
		},
	}
}

// ---------------------------------------------------------------------------------------------
// Excursion
// ---------------------------------------------------------------------------------------------

type Excursion = Readonly<{ max: number; worst: OkLab; worstFraction: number }>

/** Max distance from the straight chord `from`→`to` to the nearest occupied colour. */
function chordExcursion(from: OkLab, to: OkLab, grid: ColorGrid): Excursion {
	let max = -1
	let worst: OkLab = from
	let worstFraction = 0
	for (let sample = 0; sample < CHORD_SAMPLES; sample++) {
		const fraction = sample / (CHORD_SAMPLES - 1)
		const color = mix(from, to, fraction)
		const distance = grid.nearestDistance(color)
		if (distance > max) {
			max = distance
			worst = color
			worstFraction = fraction
		}
	}
	return { max: max < 0 ? 0 : max, worst, worstFraction }
}

/**
 * **The resolution of an excursion measurement**, in OKLab units — the noise floor two excursions
 * have to differ by before the difference is a fact about the paths rather than about the sampling.
 *
 * `nearestDistance` is 1-Lipschitz in its query colour (it is a minimum of distances), and the
 * excursion is a maximum over samples spaced `segment length / (samples − 1)` apart, so the true
 * maximum along the continuous path can exceed the sampled one by at most **half a sample step**, and
 * by the coarsest of the path's segments. Two excursions closer together than that are one
 * measurement twice, which is exactly what the ruling's "ties within measurement noise" names.
 *
 * Derived, not chosen: the two sample budgets are already fixed above, and there is no constant here
 * to calibrate. Takes the same 2-or-3-point path `pathExcursion` takes, and answers for that path —
 * a chord is sampled at a different density from a polyline, so one number for both would be a
 * guess about which.
 */
export function excursionResolution(path: readonly OkLab[]): number {
	if (path.length === 2) {
		return okLabDistance(path[0], path[1]) / (2 * (CHORD_SAMPLES - 1))
	}
	if (path.length === 3) {
		const longest = Math.max(
			okLabDistance(path[0], path[1]),
			okLabDistance(path[1], path[2]),
		)
		return longest / (2 * (POLYLINE_SAMPLES_PER_SEGMENT - 1))
	}
	throw new RangeError(`excursionResolution takes 2 or 3 points, got ${path.length}`)
}

/** Max excursion of the two-segment polyline `from`→`middle`→`to`. */
function polylineExcursion(from: OkLab, middle: OkLab, to: OkLab, grid: ColorGrid): number {
	let max = 0
	for (const [start, end] of [[from, middle], [middle, to]] as const) {
		for (let sample = 0; sample < POLYLINE_SAMPLES_PER_SEGMENT; sample++) {
			const fraction = sample / (POLYLINE_SAMPLES_PER_SEGMENT - 1)
			const distance = grid.nearestDistance(mix(start, end, fraction))
			if (distance > max) max = distance
		}
	}
	return max
}

/**
 * Candidate middle stops: occupied triples in a neighbourhood of the worst sample. When the
 * neighbourhood holds more than the evaluation budget, the distance-sorted list is **strided**
 * rather than truncated — truncation would keep only colours hugging the worst sample and would
 * systematically exclude the far vertex of a genuinely bent path, which is exactly the colour the
 * third stop exists to find.
 */
function pickCandidates(grid: ColorGrid, worst: OkLab, radius: number): readonly TripleStats[] {
	const neighbourhood = grid.within(worst, radius)
	if (neighbourhood.length <= THIRD_STOP_CANDIDATE_LIMIT) return neighbourhood
	const stride = neighbourhood.length / THIRD_STOP_CANDIDATE_LIMIT
	const picked: TripleStats[] = []
	for (let index = 0; index < THIRD_STOP_CANDIDATE_LIMIT; index++) {
		picked.push(neighbourhood[Math.min(neighbourhood.length - 1, Math.floor(index * stride))])
	}
	return picked
}

// ---------------------------------------------------------------------------------------------
// The guide stop (SPEC decision 17)
// ---------------------------------------------------------------------------------------------

/** An admitted interior stop. Always an **exact occupied triple**, so a caller publishes it directly. */
export type GuideStopChoice = Readonly<{
	target: OkLab
	rgb: Rgb8
	packed: number
	position: number
	/** Decision 17's quantity for the polyline this stop makes: path → `background`→stop→`surface`. */
	pathExcursion: number
	/** The same polyline's distance to the nearest occupied colour. Reported, never compared. */
	occupiedExcursion: number
	turn: number
}>

/**
 * **The whole of decision 17's stop rule, in one place, over one pair of ends.**
 *
 * Returns the stop to publish, or `null` when the chord already follows the path to within the bar,
 * when nothing admissible exists, or when nothing admissible reduces the path excursion.
 *
 * *Called twice per image, and that is the point.* `ramp.ts`'s own header note 3 records arm-f-r3
 * §2.4's insistence that *"the projection comes first, because the rendered ramp interpolates
 * published colours"*, and that the pre-snap test "remains the caller's obligation to re-check after
 * snapping". Under the old occupied-colour quantity re-checking was enough: a snap moves each end by
 * less than the bar, so the two measurements differed by less than the bar. Under decision 17 it is
 * not: the path sits one to three bars off the chord, and rotating the chord by a sub-bar move at each
 * end changes the path excursion by **more than a bar** (measured on `16a8247378`: 1.90 bars pre-snap,
 * 2.57 post-snap). A stop chosen against the pre-snap chord is then chosen in the wrong frame — on
 * that cover it survived selection and was refused by the re-check, while the best stop *for the
 * published ends* cut 2.57 bars to 1.07. So the rule is exported and `candidate.ts` re-runs it on the
 * published colours; the perceptual decision stays in this module, and the polyline that is judged is
 * the polyline that is drawn.
 *
 * Ranking, in order: lowest path excursion; ties within the path's own precision go to the **flattest
 * path** (smallest turning angle — the doctrine's anti-meander guard, and the reason a tie band exists
 * at all); exact ties to the packed integer. Two passes rather than one running argmin, because a
 * tolerant comparator is not a total order and a single scan would make the answer depend on the order
 * candidates arrive in.
 */
export function bestGuideStop(options: {
	inventory: Inventory
	/** `g(t)` from `RampPathReading.samples`. */
	path: readonly OkLab[]
	/** `RampPathReading.precision` — the tie band and the reduction floor. */
	precision: number
	background: { target: OkLab; color: PaletteColor }
	surface: { target: OkLab; color: PaletteColor }
}): GuideStopChoice | null {
	const { inventory, path, precision, background, surface } = options
	if (path.length === 0) return null
	const grid = buildColorGrid(inventory)
	if (grid.size === 0) return null

	const chord = pathToPolylineExcursion(path, [background.target, surface.target])
	// The chord follows the path to within the bar: a stop would be metric fitting (arm-f §2.6).
	if (chord.max <= POOLED_SAME_COLOR_BAR) return null

	// Candidates are occupied triples around **the path's worst point** — the colour the field shows
	// where the chord is furthest from it. Searching the artwork's own colours there is what keeps a
	// guide stop on-artwork (decision 5's surviving half) while decision 17 decides *whether* it helps.
	const radius = Math.max(THIRD_STOP_RADIUS_FACTOR * chord.max, 3 * POOLED_SAME_COLOR_BAR)
	// `occupiedExcursion` is reported, never compared, so it is measured **once, on the winner** rather
	// than on every candidate: it costs 64 nearest-occupied-colour queries a piece and the ranking does
	// not read it. (Measured over the 27-cover dev sets: computing it for every candidate cost 1.48×
	// the v0.7.0 palette; deferring it to the winner brings that to 1.36×, byte-identical output.)
	type Ranked = Omit<GuideStopChoice, "occupiedExcursion">
	const admissible: Ranked[] = []
	for (const candidate of pickCandidates(grid, chord.worst, radius)) {
		const position = projectionFraction(background.target, surface.target, candidate.lab)
		// Monotonicity, decision 17's spacing floor and decision 17's new-colour requirement, in the one
		// predicate that states them.
		if (
			guideStopRefusal(position, colorFromRgb(candidate.rgb), background.color, surface.color) !==
				null
		) continue
		admissible.push({
			target: candidate.lab,
			rgb: candidate.rgb,
			packed: candidate.packed,
			position,
			pathExcursion: pathToPolylineExcursion(
				path,
				[background.target, candidate.lab, surface.target],
			).max,
			turn: turningAngle(background.target, candidate.lab, surface.target),
		})
	}
	if (admissible.length === 0) return null

	let lowest = admissible[0]
	for (const candidate of admissible) {
		if (
			candidate.pathExcursion < lowest.pathExcursion ||
			(candidate.pathExcursion === lowest.pathExcursion && candidate.packed < lowest.packed)
		) lowest = candidate
	}
	// The tie band is the *minimum's* own band, fixed before any candidate is preferred — a per-pair
	// tolerance would not be an equivalence relation.
	const tieBand = lowest.pathExcursion + precision
	let best: Ranked | null = null
	for (const candidate of admissible) {
		if (candidate.pathExcursion > tieBand) continue
		if (
			best === null ||
			candidate.turn < best.turn ||
			(candidate.turn === best.turn && candidate.packed < best.packed)
		) best = candidate
	}
	if (best === null) return null

	// Decision 17's first conjunct: admitted only when it **reduces the path excursion** — by more than
	// the precision with which the path's own samples are located, or it is one measurement twice. No
	// "under the bar outright" clause is needed beside it: the chord is above the bar by the guard
	// above, so any stop that lands under the bar has reduced it by more than the gap between them.
	if (!(best.pathExcursion + precision < chord.max)) return null
	return {
		...best,
		occupiedExcursion: polylineExcursion(
			background.target,
			best.target,
			surface.target,
			grid,
		),
	}
}

// ---------------------------------------------------------------------------------------------
// t-continuity: is this one field with a bend, or two blocks? (SPEC decision 5, ruling 2026-08-05)
// ---------------------------------------------------------------------------------------------

// `RampContinuity` moved into `src/types.ts` in v0.6.1: the discriminator's reading is now a
// `Diagnostics` field, and the interface contract is where the shapes the sidecar publishes live.
// This module reads it from there and defines nothing of its own — there is exactly one definition.

/**
 * **Inlier mass along the ramp coordinate.**
 *
 * The ramp coordinate of a *colour* is its projection onto the chord `from`→`to`, which is the same
 * `projectionFraction` a middle stop's published `position` uses — so this measures the distribution
 * of the field's own pixels over the positions the published ramp would give them. Mass that projects
 * outside `[0, 1]` is left out rather than clamped into the ends: a colour beyond the ends is not
 * evidence about what happens *between* them, and folding it into an end bin would deepen the
 * bimodality of anything with saturated tails.
 *
 * Weighted by the fit's own inlier weight, per the ruling's "inlier-mass": marks are what the fit
 * rejected, and a black title crossing the middle of a two-block cover's chord must not be read as
 * the field passing through it. On a fit with no support this returns a fully bimodal reading, which
 * is the conservative answer — no evidence of continuity is not evidence of continuity.
 */
export function rampContinuity(
	fit: FieldFit,
	raster: DecodedRaster,
	from: OkLab,
	to: OkLab,
): RampContinuity {
	const lab = raster.lab
	const weights = fit.weights
	const pixels = raster.width * raster.height
	let total = 0
	let spanMass = 0
	let bandMass = 0
	for (let index = 0; index < pixels; index++) {
		const weight = weights[index]
		if (!(weight > 0)) continue
		total += weight
		const offset = index * 3
		const position = projectionFraction(from, to, [lab[offset], lab[offset + 1], lab[offset + 2]])
		if (position < 0 || position > 1) continue
		spanMass += weight
		if (position >= CONTINUITY_BAND_LOW && position <= CONTINUITY_BAND_HIGH) bandMass += weight
	}
	const middleBandMass = spanMass > 0 ? bandMass / spanMass : 0
	return {
		middleBandMass,
		spanMassFraction: total > 0 ? spanMass / total : 0,
		bimodal: middleBandMass < CONTINUOUS_MIDDLE_BAND_MASS,
	}
}

// ---------------------------------------------------------------------------------------------
// Two-block fallback
// ---------------------------------------------------------------------------------------------

type FieldMassEntry = Readonly<{ packed: number; mass: number; triple: TripleStats }>

/** Σw (field-side mass) per distinct triple, descending, ties on packed int ascending. */
function fieldMassRanking(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): readonly FieldMassEntry[] {
	const mass = new Map<number, number>()
	const weights = fit.weights
	const packed = raster.packed
	for (let index = 0; index < packed.length; index++) {
		const weight = weights[index]
		if (!(weight > 0)) continue
		const key = packed[index]
		mass.set(key, (mass.get(key) ?? 0) + weight)
	}
	const entries: FieldMassEntry[] = []
	for (const [key, value] of mass) {
		const triple = inventory.triples.get(key)
		if (triple) entries.push({ packed: key, mass: value, triple })
	}
	entries.sort((a, b) => b.mass - a.mass || a.packed - b.packed)
	return entries
}

/**
 * SPEC decision 5's two blocks: the two highest-field-mass colours **separated by their pairwise
 * `sameColorBar`**. Background is the heavier of the two (the larger field, consistent with
 * decision 3's principle). `surface` is `null` when no second separated colour exists at all, which
 * is a one-colour image and not a two-block one.
 *
 * *v0.5: no longer exported.* It was split out and exported for `candidate.ts`, which used it for
 * decision 9's two-block rescue; that rescue has merged into the component reading (`E2_BRIEF.md`:
 * "the two-block rescue becomes a special case of the two-component reading and should merge into
 * it, not survive beside it"), so the only caller left is this module's own decision-5 fallback —
 * a *different* question (no polyline stayed on-artwork), which is why the function survives at all.
 */
function twoBlockCandidates(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): { background: TripleStats; surface: TripleStats | null } | null {
	const ranking = fieldMassRanking(fit, raster, inventory)
	if (ranking.length === 0) return null
	const first = ranking[0].triple
	const firstColor = colorFromRgb(first.rgb)
	for (let index = 1; index < ranking.length; index++) {
		const candidate = ranking[index].triple
		if (!sameColor(firstColor, colorFromRgb(candidate.rgb))) {
			return { background: first, surface: candidate }
		}
	}
	return { background: first, surface: null }
}

/** The same two blocks as OKLab targets, for `readRamp`'s own decision-5 fallback. */
function twoBlockTargets(
	blocks: { background: TripleStats; surface: TripleStats | null } | null,
	fallbackTarget: OkLab,
): { background: OkLab; surface: OkLab } {
	if (blocks === null) return { background: fallbackTarget, surface: fallbackTarget }
	return {
		background: blocks.background.lab,
		surface: (blocks.surface ?? blocks.background).lab,
	}
}

// ---------------------------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------------------------

function flatReading(
	constant: OkLab,
	direction: readonly [number, number] | null,
	orientationMargin: number,
): RampReading {
	return {
		gradientCandidate: false,
		direction,
		backgroundTarget: constant,
		surfaceTarget: constant,
		orientationMargin,
		stops: [],
		excursionMax: 0,
		thirdStopAccepted: false,
		residualExcursion: 0,
		twoBlockFallback: false,
	}
}

/**
 * **What decision 17 measured** — the field's own colour path and its distance to the two polylines
 * that were considered. `null` when no ramp was read at all (flat, collapsed, or the two-block
 * fallback, none of which draw an interpolation for a path to lead).
 *
 * This lives here rather than in `src/types.ts` because `types.ts` is the orchestrator's to change;
 * the shape is proposed for `Diagnostics` in `reports/wp13-types.md` and is carried through
 * `candidate.ts`'s `Analysis` in the meantime, so `diagnose.ts` can print the numbers the ruling turns
 * on without a frozen file being edited by a worker.
 */
export type RampPathReading = Readonly<{
	/** `g(t)`, background end first. Fewer than `PATH_BANDS` entries when bands came up empty. */
	samples: readonly OkLab[]
	/** Path → straight chord: the quantity that asks for a stop. */
	chordExcursion: number
	/** Path → the polyline actually returned (equal to `chordExcursion` when no stop was accepted). */
	publishedExcursion: number
	/** The measurement's noise floor: the worst band mean's own standard error. What accepts a stop. */
	precision: number
	/** Half the widest gap between consecutive samples. Reported only — see `pathLargestGap`. */
	largestGap: number
	/**
	 * Worst distance to the chord among path samples that project **outside** the ramp's span — the
	 * field colours the published ends do not reach. Reported only: no interior stop can shorten an
	 * endpoint's own distance (W-P10's premise correction), so this is an endpoint signal, not a stop
	 * one. Large here with a small `chordExcursion` means the ends are cut short of the field, which is
	 * decision 18's territory rather than decision 17's.
	 */
	beyondEnds: number
}>

/** A reading, plus what the t-continuity discriminator and decision 17's path measurement saw. */
export type RampDetail = Readonly<{
	reading: RampReading
	continuity: RampContinuity | null
	path: RampPathReading | null
}>

function withoutContinuity(reading: RampReading): RampDetail {
	return { reading, continuity: null, path: null }
}

/**
 * Read a fitted field into the continuous ramp targets the caller will snap and publish.
 *
 * Order-0 fits, `noField` verdicts and degenerate order-1 fits (zero position coefficients, zero
 * inlier mass) all return the flat reading: one constant target, no stops, no gradient. Everything
 * else runs the full path — direction, orientation, robust ends, excursion, and, when the straight
 * chord leaves the artwork, the t-continuity discriminator that decides between a guide stop and the
 * two-block fallback.
 *
 * `readRamp` is this function with the discriminator's measurement dropped; callers that report
 * diagnostics take `readRampDetailed` instead. There is one implementation, so the palette and the
 * sidecar cannot disagree about what was measured.
 */
export function readRampDetailed(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): RampDetail {
	const expectedPixels = raster.width * raster.height
	if (fit.weights.length !== expectedPixels) {
		throw new RangeError(
			`weight map has ${fit.weights.length} entries, raster has ${expectedPixels} pixels`,
		)
	}

	const constant = fit.fieldAt(0, 0)
	if (fit.noField || fit.order === 0) return withoutContinuity(flatReading(constant, null, 0))

	const axis = dominantDirection(fit.coefficients)
	if (!axis) return withoutContinuity(flatReading(constant, null, 0))

	const statistics = tStatistics(fit, raster, axis)
	if (!statistics) return withoutContinuity(flatReading(constant, axis, 0))

	const { tLow, tHigh, tMedian, medianStandardError } = statistics
	const lowEnd = fit.fieldAt(tLow * axis[0], tLow * axis[1])
	const highEnd = fit.fieldAt(tHigh * axis[0], tHigh * axis[1])

	// --- orientation (SPEC decision 3) ---------------------------------------------------------
	const lean = tMedian - (tLow + tHigh) / 2
	const orientationMargin = medianStandardError > 0 ? lean / medianStandardError : 0
	let backgroundAtHigh: boolean
	if (Math.abs(lean) <= medianStandardError) {
		// Near-tie: the darker end is background; exact tie in L breaks on the packed int.
		if (highEnd[0] !== lowEnd[0]) backgroundAtHigh = highEnd[0] < lowEnd[0]
		else backgroundAtHigh = packedOf(okLabToRgb(highEnd)) < packedOf(okLabToRgb(lowEnd))
	} else if (BACKGROUND_IS_MAJORITY_END) {
		backgroundAtHigh = lean > 0
	} else {
		backgroundAtHigh = lean < 0
	}

	const backgroundTarget = backgroundAtHigh ? highEnd : lowEnd
	const surfaceTarget = backgroundAtHigh ? lowEnd : highEnd
	// The published direction points background → surface, so that t and the stop positions agree.
	const direction: readonly [number, number] = backgroundAtHigh ? [-axis[0], -axis[1]] : axis

	// --- the forced gradient boolean (SPEC decision 2) ------------------------------------------
	// Pre-snap proxy: the 8-bit rounding of each target. The caller re-runs this on the snapped
	// ends, which is where the decision is final; two targets that already fail to separate here
	// cannot separate after a sub-bar snap, so the collapse is safe to make now.
	const backgroundColor = colorFromRgb(okLabToRgb(backgroundTarget))
	const surfaceColor = colorFromRgb(okLabToRgb(surfaceTarget))
	if (sameColor(backgroundColor, surfaceColor)) {
		return withoutContinuity({
			gradientCandidate: false,
			direction,
			backgroundTarget,
			surfaceTarget: backgroundTarget, // collapses exactly, per decision 2
			orientationMargin,
			stops: [],
			excursionMax: 0,
			thirdStopAccepted: false,
			residualExcursion: 0,
			twoBlockFallback: false,
		})
	}

	// --- the occupied-colour excursion: the "stays on-artwork" half, now a report ------------------
	//
	// Decision 17 moved the *deciding* quantity to the path measurement below. This one is still
	// measured, still published, and still owns exactly one decision that is not decision 17's: it is
	// what asks decision 5's t-continuity discriminator whether this cover is a ramp at all.
	const grid = buildColorGrid(inventory)
	// An empty inventory carries no evidence either way; it cannot make a chord "off-artwork".
	const excursion = grid.size === 0
		? { max: 0, worst: backgroundTarget, worstFraction: 0 }
		: chordExcursion(backgroundTarget, surfaceTarget, grid)

	const twoStops: readonly StopTarget[] = [
		{ target: backgroundTarget, position: 0 },
		{ target: surfaceTarget, position: 1 },
	]

	// --- which reading applies (SPEC decision 5, ruling 2026-08-05) ---------------------------------
	//
	// Unchanged by decision 17, deliberately: when the chord leaves the artwork, before asking whether
	// a stop can fix it — a question about the polyline — ask what the picture is: one field the
	// straight chord is cutting the corner of, or two blocks the fit spanned. The inlier mass along the
	// ramp coordinate answers it, and it is the only thing that decides. A guide stop is never the
	// reason a cover is called a ramp, and a failure to find one is never the reason a cover is called
	// two blocks. A chord that never left the artwork never raised the question at all.
	let continuity: RampContinuity | null = null
	if (excursion.max > POOLED_SAME_COLOR_BAR) {
		continuity = rampContinuity(fit, raster, backgroundTarget, surfaceTarget)
		if (continuity.bimodal) {
			// --- two blocks: no polyline can describe what is not a path (SPEC decision 5) ------------
			const blocks = twoBlockTargets(twoBlockCandidates(fit, raster, inventory), backgroundTarget)
			return {
				reading: {
					gradientCandidate: false,
					direction,
					backgroundTarget: blocks.background,
					surfaceTarget: blocks.surface,
					orientationMargin,
					stops: [],
					excursionMax: excursion.max,
					thirdStopAccepted: false,
					residualExcursion: excursion.max,
					twoBlockFallback: true,
				},
				continuity,
				// Two flat blocks draw no interpolation, so there is no path to lead through anything.
				path: null,
			}
		}
	}

	// --- the ramp path (SPEC decision 17) -----------------------------------------------------------
	//
	// From here the cover is a ramp, and the only question left is whether the straight line between
	// its ends follows the colours the field runs through. That is `g(t)` against the chord.
	const { samples: path, precision } = fittedColourPath(fit, raster, axis, statistics)
	const largestGap = pathLargestGap(path)
	const chordPathExcursion = pathToPolylineExcursion(path, [backgroundTarget, surfaceTarget])

	const straightRamp = (pathExcursionMax: number): RampDetail => ({
		reading: {
			gradientCandidate: true,
			direction,
			backgroundTarget,
			surfaceTarget,
			orientationMargin,
			stops: twoStops,
			excursionMax: excursion.max,
			thirdStopAccepted: false,
			residualExcursion: excursion.max,
			twoBlockFallback: false,
		},
		continuity,
		path: {
			samples: path,
			chordExcursion: chordPathExcursion.max,
			publishedExcursion: pathExcursionMax,
			precision,
			largestGap,
			beyondEnds: chordPathExcursion.beyondEnds,
		},
	})

	// The chord follows the path to within the bar: the straight line never visibly leaves the colours
	// the field runs through, and a stop would be metric fitting — arm-f §2.6's own words, and the
	// clause decision 17 restores. Two stops is the answer, including on covers whose chord *does* pass
	// off-artwork: that is a report about the picture's colour density, not about the interpolation.
	if (chordPathExcursion.max <= POOLED_SAME_COLOR_BAR) return straightRamp(chordPathExcursion.max)

	// --- the guide stop (SPEC decision 17) -----------------------------------------------------------
	const best = bestGuideStop({
		inventory,
		path,
		precision,
		background: { target: backgroundTarget, color: backgroundColor },
		surface: { target: surfaceTarget, color: surfaceColor },
	})

	if (best !== null) {
		return {
			reading: {
				gradientCandidate: true,
				direction,
				backgroundTarget,
				surfaceTarget,
				orientationMargin,
				stops: [
					{ target: backgroundTarget, position: 0 },
					{ target: best.target, position: best.position },
					{ target: surfaceTarget, position: 1 },
				],
				excursionMax: excursion.max,
				thirdStopAccepted: true,
				residualExcursion: best.occupiedExcursion,
				twoBlockFallback: false,
			},
			continuity,
			path: {
				samples: path,
				chordExcursion: chordPathExcursion.max,
				publishedExcursion: best.pathExcursion,
				precision,
				largestGap,
				beyondEnds: chordPathExcursion.beyondEnds,
			},
		}
	}

	// --- the chord leaves the path, and nothing admissible leads it back ----------------------------
	//
	// The two-block fallback is not the answer here and is not reachable from this branch: the mass
	// said one field, and refusing the ramp because no *stop* helped would be the ≥2× prong's mistake
	// in a new place. The straight ramp is published with both residuals — the path's and the
	// artwork's — which is what "the residual is published" means when the residual is all there is.
	return straightRamp(chordPathExcursion.max)
}

/** `readRampDetailed` for callers that do not report the discriminator's measurement. */
export function readRamp(fit: FieldFit, raster: DecodedRaster, inventory: Inventory): RampReading {
	return readRampDetailed(fit, raster, inventory).reading
}

// ---------------------------------------------------------------------------------------------
// Post-snap re-measurement (added for W-INTEG, wave 2)
// ---------------------------------------------------------------------------------------------

/**
 * **Excursion of an already-discrete path**, for the caller to re-run the decision 5 test on the
 * *snapped* ends rather than on the continuous targets.
 *
 * Header note 3 states the obligation this discharges: the excursion this module measures runs on
 * the endpoint targets, because it is handed the fit and not the ledger's discrete choice, and
 * "remains the caller's obligation to re-check after snapping". `candidate.ts` is the caller, and
 * this is the same measurement with the same sample budgets so the two numbers are comparable —
 * a re-implementation there would have been a second definition of the quantity.
 *
 * Two or three points; anything else is a caller bug rather than a shape this prototype publishes.
 */
export function pathExcursion(inventory: Inventory, path: readonly OkLab[]): number {
	if (path.length !== 2 && path.length !== 3) {
		throw new RangeError(`pathExcursion takes 2 or 3 points, got ${path.length}`)
	}
	const grid = buildColorGrid(inventory)
	// An empty inventory carries no evidence either way — same reading as `readRamp`.
	if (grid.size === 0) return 0
	return path.length === 2
		? chordExcursion(path[0], path[1], grid).max
		: polylineExcursion(path[0], path[1], path[2], grid)
}

/**
 * **The highest-field-mass occupied colour**, for SPEC decision 9's declared retreat.
 *
 * `noField` says the fitted surface is not a description of this image, so the retreat may not read
 * an endpoint off it. What it reads instead is the colour the fit still called field most of:
 * `Σw` per exact triple, descending, ties on the packed integer. `null` only when nothing carried
 * positive weight. The caller snaps it, and the snap's bar-neighbourhood mass maximisation is what
 * makes the published colour "agglomerated" in decision 9's sense.
 */
export function highestFieldMassTriple(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): TripleStats | null {
	const ranking = fieldMassRanking(fit, raster, inventory)
	return ranking.length === 0 ? null : ranking[0].triple
}
