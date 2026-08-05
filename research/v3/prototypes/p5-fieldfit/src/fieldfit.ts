/**
 * P5 — robust parametric field fit (W-FIT, `SPEC.md` decision 1 and decision 9).
 *
 * Fits a low-order OKLab colour surface to the whole raster with a redescending robust estimator
 * (Tukey biweight IRLS on the residual *norm*, three channels sharing one weight per pixel). The
 * fit is the segmentation: the per-pixel rejection weight it returns is the overlay score every
 * downstream module reads. Nothing here masks, labels, thresholds by size, or runs plain least
 * squares.
 *
 * What this module owns, per `SPEC.md`:
 *
 * - order-0 fit (robust centre) and order-1 fit (per-channel affine in normalized position),
 * - the model-selection margin between them, reported in pooled-bar units,
 * - the full-resolution weight map, inlier fraction and residual scale,
 * - the `noField` verdict (decision 9) that tells callers to take the declared retreat.
 *
 * Everything is deterministic: no randomness, no time, no iteration over hash-ordered containers.
 * The only sampling is a fixed stratified lattice derived from the raster dimensions.
 *
 * Conventions
 *
 * - Positions are normalized to [-1, 1] on both axes with the **pixel-centre** convention (see
 *   `normalizedX`). The convention is exported so W-CORE/W-READ read the same coordinates the fit
 *   was solved in.
 * - `residualScale` (σ̂) is in OKLab *norm* units — the scale of ‖c(x) − f(x)‖, not of one channel.
 *   The `noField` threshold in decision 9 is stated in the same units.
 */

import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab } from "../../../src/contract/types.ts"

import type { FieldComponent, FieldReading } from "./components.ts"
import { normalizedX, normalizedY } from "./decode.ts"
import type { DecodedRaster, FieldFit } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * Tukey biweight cut, in multiples of σ̂.
 *
 * `[INHERITED]` — Beaton & Tukey's standard tuning for 95% efficiency at the Gaussian, taken from
 * the robust-statistics literature via `SPEC.md` decision 1 / `arm-f-r3.md` §4.2. Not fitted here
 * and not a knob: changing it changes what "far from the surface" means.
 */
const TUKEY_CUT_SIGMAS = 4.685

/**
 * MAD → σ consistency constant for the normal distribution.
 *
 * `[INHERITED]` — standard robust statistics (1/Φ⁻¹(0.75)), stated in `SPEC.md` decision 1.
 */
const MAD_TO_SIGMA = 1.4826

/**
 * Minimum number of observations solved against.
 *
 * `[HELD]` — `SPEC.md` decision 1 ("deterministic stratified lattice subsample ≥ 10^5 samples, or
 * all pixels if fewer"). A 3-coefficient-per-channel model does not need two million observations;
 * arm-f-r3 §2.2 is the argument that 10^5 puts the endpoint standard error orders of magnitude
 * below any bar this pipeline compares against.
 */
const MIN_SOLVE_SAMPLES = 100_000

/**
 * IRLS iteration cap.
 *
 * `[HELD]` — `SPEC.md` decision 1. Reaching the cap is not an error; the last iterate is returned
 * and the residual diagnostics describe it honestly.
 */
const MAX_IRLS_ITERATIONS = 12

/**
 * IRLS convergence test: stop when no coefficient moves more than this in one iteration.
 *
 * `[HELD]` — `SPEC.md` decision 1. In OKLab units, ~15× below the pooled same-colour bar, so a
 * converged fit is converged relative to the only scale the project judges colour on.
 */
const COEFFICIENT_CONVERGENCE = 1e-4

/**
 * Floor on σ̂ when forming the Tukey cut.
 *
 * `[UNCALIBRATED]` — chosen here, not measured. Purpose is numerical, not perceptual: when a fit is
 * exact (a synthetic ramp, a flat undithered image) the MAD of the residual norms collapses to the
 * float32 storage error ~1e-7 and an unfloored cut would reject every pixel including the perfect
 * ones, leaving a singular solve. 1e-6 sits above float32 raster noise and three orders of
 * magnitude below one 8-bit sRGB step in OKLab (~1e-3), so it can never bind on real imagery.
 */
const RESIDUAL_SCALE_FLOOR = 1e-6

/**
 * Weight above which a pixel counts as field for `inlierFraction`.
 *
 * `[HELD]` — fixed by `types.ts` ("Fraction of pixels with weight above 0.5").
 */
const INLIER_WEIGHT_THRESHOLD = 0.5

/**
 * **How close to the field a pixel must sit to count as explained by it**, in pooled bars.
 *
 * `[UNCALIBRATED]` — `SPEC.md` decision 9 states the value and says to expect retuning; round-1
 * covers are chosen to straddle the line so the reviewer's grades inform it. The principle it
 * encodes is the calibrated part: *a field must explain the image in the contract's own perceptual
 * units*. Four bars is "a few just-noticeable steps away", which is the loosest reading of
 * "explained" that is still a statement about perception rather than about arithmetic.
 *
 * `POOLED_SAME_COLOR_BAR` is `[INHERITED]`; what is uncalibrated here is only the multiple.
 */
const NO_FIELD_EXPLAINED_BAR_MULTIPLE = 4

/**
 * `noField` when the field explains less than this fraction of the image.
 *
 * `[UNCALIBRATED]` — `SPEC.md` decision 9. "At least half the image" is the principle; the exact
 * half is the convention.
 *
 * Exported for the tests that pin it. **It is now used in exactly one place** — the global `noField`
 * verdict below. v0.5.0's component smooth gate borrowed it; v0.5.1's smooth-gate ruling gave that
 * gate its own `COMPONENT_CORE_FRACTION`, and decision 9's own "same two constants, no new ones"
 * clause was about the two-block rescue, which v0.5.0 deleted as subsumed by the component reading.
 */
export const NO_FIELD_EXPLAINED_FRACTION = 0.5

/**
 * **How close to the field a pixel must sit to count as explained**, in OKLab.
 *
 * One name for the radius decision 9 states and the component recursion holds its Tukey cut to. It
 * is `NO_FIELD_EXPLAINED_BAR_MULTIPLE × POOLED_SAME_COLOR_BAR` and nothing else — hoisted out of
 * `evaluateFullResolution`, where it used to be a local, precisely so the recursion cannot fork a
 * second copy of it. Exported: `components.ts`'s documentation quotes it and the tests pin it.
 */
export const EXPLAINED_RADIUS = NO_FIELD_EXPLAINED_BAR_MULTIPLE * POOLED_SAME_COLOR_BAR

/**
 * **Extensive**: a component must claim at least this fraction of the image.
 *
 * `[UNCALIBRATED]` — the *principle* is the calibrated part: **a field-like component is a region of
 * the picture, not a detail in it.** The number is **measured, not chosen**, in the same style as
 * SPEC decision 14's multiple, because `E2_BRIEF.md`'s suggested 0.15 was measured and found to sit
 * exactly on top of the evidence it was pulled forward for. The three second components the round-2
 * covers name, as claimed fractions of their frame:
 *
 * | cover | second component | claim |
 * |---|---|---|
 * | `28279e9184` | the depicted polaroid (decision 12: *"there is literally a surface"*) | **0.144** |
 * | `2376a6b67d` | the red block of the cover decision 9's precedence ruling was written for | **0.138** |
 * | `fc8d58e0af` | its second field | **0.131** |
 *
 * At 0.15 all three are excluded by between one and two points, the polaroid is not published as a
 * surface, and the two-block cover **regresses** — v0.4.1's rescue published two colours there and
 * the component reading published one, which `E2_BRIEF.md`'s obligation (c) forbids. The smallest
 * evidenced claim with the same ≥20% margin decision 14 used is `0.131 / 1.2 = 0.109`, so the floor
 * is 0.10 and every evidenced component clears it. It is still `[UNCALIBRATED]` in the sense that no
 * reviewer has been asked "is a seventh of the frame an area?" — what is measured is that 0.15
 * contradicts three covers the reviewer has already spoken about.
 *
 * It doubles as the recursion's **minimum claim**: a level that claims less than this can never
 * yield a component, and a level that claims at least this shrinks the domain by at least this — so
 * the loop cannot run more than `⌈1 / 0.10⌉ = 10` times even without the depth cap. That is the
 * termination proof, and it is one constant rather than two so it cannot rot into an infinite loop.
 */
export const EXTENSIVE_SUPPORT_FRACTION = 0.1

/**
 * Hard cap on recursion depth.
 *
 * `[UNCALIBRATED]` — `E2_BRIEF.md` suggests 4. Termination does not depend on it (see
 * `EXTENSIVE_SUPPORT_FRACTION`); it is a *statement*, not a guard: a picture read as more than four
 * fields is not being read, and past four the reading has stopped being about background/surface.
 */
export const MAX_COMPONENT_DEPTH = 4

/**
 * **Smooth**: at least this fraction of a component's claim must sit inside the fit's own inlier core.
 *
 * `[UNCALIBRATED]`. Its own constant as of v0.5.1, by `SPEC.md` decision 12's *smooth-gate ruling
 * 2026-08-05* (evidence cover `16a8247378`, round-2 UNACCEPTABLE), quoted:
 *
 * > the component smooth gate decouples from `NO_FIELD_EXPLAINED_FRACTION` — new constant
 * > `COMPONENT_CORE_FRACTION = 0.4` (`[UNCALIBRATED]`, anchored to the one evidence cover whose
 * > painted sky sits at 0.40; relaxing the shared 0.5 instead would silently flip every global explF
 * > 0.4–0.5 cover's retreat).
 *
 * **Anchor corrected 2026-08-05 (P5 orchestrator, from W-P9's measurement):** the evidence sky's
 * core fraction is **0.3966 measured**, not the 0.40 the ruling transcribed — a gate at 0.4 fails
 * to admit the very component it exists to admit (W-P9: the cover's palette moved only via a
 * smaller secondary component). The constant is defined by its anchor ("admit the evidence sky"),
 * so it is corrected to sit just under the measured value: **0.39**. Measured collateral: over all
 * 22 dev covers the gate's next behavioural change below .40 is the sky itself at .3966 and
 * nothing else (next change upward .4202), so this correction moves exactly one cover.
 *
 * **The evidence is a single cover, and that is the whole of it.** `16a8247378` is an autumn-sky
 * painting; its sky claims 0.237 of the frame with a core fraction of **0.3966**, so under v0.5.0's
 * reuse of `NO_FIELD_EXPLAINED_FRACTION` (0.5) it failed *smooth* by a tenth and the cover kept its
 * black field — the reading round 2 called UNACCEPTABLE. A painted sky is brushwork: its pixels sit
 * spread across the explained radius rather than piled at its centre, which is what a core fraction
 * near 0.4 *is*. The value is the measured one, not a bracket: there is no second cover to bracket
 * against, so unlike `EXTENSIVE_SUPPORT_FRACTION` (three covers, margin rule) and
 * `FOREGROUND_MIN_RAW_APCA` (a reviewer-evidenced interval) this constant sits **on** its single
 * datum. Round 3 is what moves it.
 *
 * Why a new constant rather than lowering the shared 0.5: `NO_FIELD_EXPLAINED_FRACTION` is decision
 * 9's global verdict — every cover whose *global* explained fraction lands in [0.4, 0.5) would have
 * stopped retreating, which is a change to the trigger and not to the gate the evidence is about.
 * The two numbers were only ever equal by reuse; they answer different questions ("does one surface
 * explain the picture" vs. "does this component hold its pixels close"), so they are now two names.
 */
export const COMPONENT_CORE_FRACTION = 0.39

/**
 * **Why the verdict reads an absolute distance and not a scale — two retired clauses, both recorded.**
 *
 * `SPEC.md` decision 9's ruling history, in the form that matters to this file:
 *
 *  1. The original clause was `σ̂ > 3 × POOLED_SAME_COLOR_BAR`. It fired on 11 of 20 demo-20 covers
 *     at inlier fractions of 0.79–1.00 — textured but perfectly fittable photographs, where the
 *     biweight had a large majority and was simply sitting on grain.
 *  2. Its replacement, `inlierFraction < 0.5`, is **unreachable**. σ̂ here is 1.4826 · median(‖r‖) —
 *     the MAD about zero (see `updateWeights`) — and a pixel is an inlier when
 *     ‖r‖ < 0.5412 · 4.685 · σ̂ = 3.759 · median(‖r‖). Every pixel at or below the median satisfies
 *     that, and at least half the pixels are, so `inlierFraction > 0.5` identically, for every
 *     possible image. `tests/fieldfit.test.ts` test 3 pins this.
 *  3. Redefining σ̂ as the MAD about the *median* was considered and **rejected**: that measures
 *     dispersion, and an image of uniformly large residuals that all miss the field by about the
 *     same amount would pass it while being exactly the case the detector exists to catch. The
 *     failure being detected is absolute residual **location**, not spread — so the quantity is a
 *     count of pixels inside a fixed perceptual radius, and the IRLS fit's own σ̂ is left alone.
 *
 * `inlierFraction` remains on `FieldFit` and in diagnostics as evidence; it is no longer a vote.
 */

/**
 * Relative pivot floor for the 3×3 Cholesky factorisation.
 *
 * `[UNCALIBRATED]` — numerical guard only. A design matrix that fails this is rank-deficient in
 * position (a one-pixel-wide image, or a weight set collapsed onto a line), and the caller falls
 * back to the order-0 iterate rather than inventing a tilt out of round-off.
 */
const CHOLESKY_PIVOT_FLOOR = 1e-12

// ---------------------------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------------------------

// Positions come from `decode.ts` (`normalizedX` / `normalizedY`, pixel-centre convention
// `(2i + 1)/n − 1`, range (−1, 1) exclusive). W-CORE owns that convention and this module does not
// redefine it: the fit's coefficients are only meaningful against the coordinates every other P5
// module reads positions in, so there must be exactly one definition. Extreme pixels therefore sit
// at ±(1 − 1/n), while the *domain* the field is defined on is the closed square [-1, 1]².

/**
 * Field colour at a normalized position, from a row-major 3×3 coefficient block
 * (`[intercept, coefX, coefY]` per OKLab channel).
 */
export function fieldAtCoefficients(coefficients: Float64Array, x: number, y: number): OkLab {
	return [
		coefficients[0] + coefficients[1] * x + coefficients[2] * y,
		coefficients[3] + coefficients[4] * x + coefficients[5] * y,
		coefficients[6] + coefficients[7] * x + coefficients[8] * y,
	]
}

/**
 * Largest OKLab distance the fitted field spans across the image square [-1, 1]².
 *
 * For an affine field `f(x) = a + Bx` the distance between any two points is ‖B·z‖ with `z` their
 * separation, and the maximum of that over the square is attained at a pair of opposite corners —
 * so the exact span is `max(‖B·(2, 2)‖, ‖B·(2, −2)‖)`. This is the "simpler rule" the SPEC invites
 * in place of projecting onto the dominant singular direction first: it is the same quantity
 * (the corner pair the dominant direction points at is the one that wins the max) with no SVD.
 */
export function fittedSpan(coefficients: Float64Array): number {
	const xL = coefficients[1]
	const yL = coefficients[2]
	const xA = coefficients[4]
	const yA = coefficients[5]
	const xB = coefficients[7]
	const yB = coefficients[8]
	const diagonal = norm3(2 * (xL + yL), 2 * (xA + yA), 2 * (xB + yB))
	const antidiagonal = norm3(2 * (xL - yL), 2 * (xA - yA), 2 * (xB - yB))
	return diagonal > antidiagonal ? diagonal : antidiagonal
}

// ---------------------------------------------------------------------------------------------
// The fit
// ---------------------------------------------------------------------------------------------

/**
 * **The retired two-block rescue, and where its question went.**
 *
 * v0.4 answered decision 9's precedence ruling with `explainedFractionByColors(raster, [a, b])`:
 * when `noField` fired, two flat block colours were tested — *"fraction of pixels within 4×bar of
 * the **nearer** of the two"* — and published if they explained half the image. `E2_BRIEF.md` folds
 * that into the two-component reading ("the two-block rescue becomes a special case of the
 * two-component reading and should merge into it, not survive beside it"), and v0.5 does: two flat
 * blocks are two order-0 components, each tested by the *same* radius on the pixels it claims. The
 * function had no caller left once `candidate.ts` stopped rescuing, so it is deleted rather than
 * kept as a second, unreachable definition of "explained". The ruling it implemented is not
 * reversed — it is now enforced per component instead of per palette, and by a *stricter* rule: the
 * rescue asked for half the image between two colours, the component reading asks each of them to be
 * extensive and smooth on its own.
 */

/**
 * Fit the field. See the module docstring; the shape of the result is fixed by `types.ts`.
 *
 * Sequence: stratified lattice subsample → order-0 robust centre (IRLS) → order-1 affine (IRLS,
 * started from the order-0 centre) → model selection on the robust-RMS margin → full-resolution
 * weight map, inlier fraction and σ̂ against the kept model → `noField` verdict.
 */
export function fitField(raster: DecodedRaster): FieldFit {
	const { width, height } = raster
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		throw new Error(`fitField: raster dimensions must be positive integers, got ${width}×${height}`)
	}
	const pixelCount = width * height
	if (raster.lab.length < pixelCount * 3) {
		throw new Error(
			`fitField: lab raster holds ${raster.lab.length} floats, expected ${pixelCount * 3} for ${width}×${height}`,
		)
	}

	const samples = buildSamples(raster)
	const order0 = fitOrder0(samples)
	const order1 = fitOrder1(samples, order0.coefficients)

	// Robust-RMS improvement, in pooled bars. Each model is scored on its own converged weights:
	// the number answers "how much closer to the pixels it calls field is the affine surface than
	// the constant one", which is the comparison the model choice is about.
	const marginBars = (order0.robustRms - order1.robustRms) / POOLED_SAME_COLOR_BAR

	// Model selection (SPEC decision 1, and the orchestrator's instruction not to gate hard here:
	// the gradient boolean is decided downstream by snapped-end separation, so a tilt that is small
	// but real must survive to be reported, not be silently flattened). Order 1 is kept whenever it
	// improved the robust RMS at all *and* it actually moves colour across the image. Order 0 wins
	// only when the affine fit bought nothing or is exactly flat.
	const span = fittedSpan(order1.coefficients)
	const order: 0 | 1 = marginBars > 0 && span > 0 ? 1 : 0
	const coefficients = order === 1 ? order1.coefficients : order0.coefficients

	// The weights map is the module's product for W-MARKS, so it is evaluated at full resolution
	// against the converged model — never interpolated up from the solve subsample. σ̂ and the
	// inlier fraction are recomputed in the same pass so all three published numbers describe the
	// same pixels.
	const full = evaluateFullResolution(raster, coefficients)

	const noField = full.fieldExplainedFraction < NO_FIELD_EXPLAINED_FRACTION

	return {
		order,
		coefficients,
		fieldAt: (x: number, y: number): OkLab => fieldAtCoefficients(coefficients, x, y),
		weights: full.weights,
		inlierFraction: full.inlierFraction,
		fieldExplainedFraction: full.fieldExplainedFraction,
		residualScale: full.residualScale,
		marginBars,
		noField,
	}
}

// ---------------------------------------------------------------------------------------------
// Subsample
// ---------------------------------------------------------------------------------------------

type SampleSet = {
	count: number
	x: Float64Array
	y: Float64Array
	l: Float64Array
	a: Float64Array
	b: Float64Array
	/** Scratch: residual norm per sample under the current coefficients. */
	residual: Float64Array
	/** Scratch: Tukey weight per sample under the current coefficients. */
	weight: Float64Array
}

/** Samples an axis takes with this stride, using the centred phase `stride >> 1`. */
function axisSampleCount(size: number, stride: number): number {
	return Math.max(1, Math.ceil((size - (stride >> 1)) / stride))
}

/**
 * Deterministic stratified lattice subsample: one pixel per `stride × stride` cell, phase centred,
 * scanned in row-major order. The stride is the largest one that still yields `MIN_SOLVE_SAMPLES`
 * observations, so the sample count is at least the SPEC's 10^5 (or every pixel, when the raster
 * has fewer). No randomness — the same raster always yields the same observations in the same
 * order, which is what makes the coefficients byte-reproducible.
 */
function buildSamples(raster: DecodedRaster): SampleSet {
	const { width, height, lab } = raster
	const pixelCount = width * height

	let strideX = 1
	let strideY = 1
	if (pixelCount > MIN_SOLVE_SAMPLES) {
		const ideal = Math.max(1, Math.floor(Math.sqrt(pixelCount / MIN_SOLVE_SAMPLES)))
		strideX = Math.min(ideal, width)
		strideY = Math.min(ideal, height)
		// The floor above can leave the ceiling-truncated lattice a hair under target; walk the
		// stride down until it is not. Terminates at stride 1 (= every pixel).
		while (
			(strideX > 1 || strideY > 1) &&
			axisSampleCount(width, strideX) * axisSampleCount(height, strideY) < MIN_SOLVE_SAMPLES
		) {
			if (strideX >= strideY && strideX > 1) strideX -= 1
			else if (strideY > 1) strideY -= 1
			else strideX -= 1
		}
	}

	const count = axisSampleCount(width, strideX) * axisSampleCount(height, strideY)
	const set: SampleSet = {
		count,
		x: new Float64Array(count),
		y: new Float64Array(count),
		l: new Float64Array(count),
		a: new Float64Array(count),
		b: new Float64Array(count),
		residual: new Float64Array(count),
		weight: new Float64Array(count),
	}

	let index = 0
	for (let row = strideY >> 1; row < height; row += strideY) {
		const y = normalizedY(row, height)
		for (let column = strideX >> 1; column < width; column += strideX) {
			const pixel = (row * width + column) * 3
			set.x[index] = normalizedX(column, width)
			set.y[index] = y
			set.l[index] = lab[pixel]
			set.a[index] = lab[pixel + 1]
			set.b[index] = lab[pixel + 2]
			index += 1
		}
	}
	set.count = index
	return set
}

// ---------------------------------------------------------------------------------------------
// IRLS
// ---------------------------------------------------------------------------------------------

type FitResult = {
	/** Row-major 3×3, `[intercept, coefX, coefY]` per channel. */
	coefficients: Float64Array
	/** σ̂ under the returned coefficients, on the subsample. */
	residualScale: number
	/** sqrt(Σ w·r² / Σ w) under the returned coefficients and their own weights. */
	robustRms: number
	iterations: number
}

/**
 * Fills `residual` and `weight` for the current coefficients and returns σ̂ = 1.4826 · MAD.
 *
 * The residual norms are non-negative deviations from the fit by construction, so the median
 * absolute deviation is taken about zero — `MAD = median(rᵢ)` — rather than about the median of the
 * norms. (`SPEC.md` says "1.4826·MAD of residual norms"; this is the reading that keeps σ̂ a scale
 * of the residual and not a scale of the *spread* of residual magnitudes, which would be near zero
 * for a uniformly-off fit.) One consequence to hold on to when reading the numbers: for isotropic
 * per-channel noise of scale s, ‖r‖ follows a χ₃ law, so σ̂ ≈ 2.28·s — σ̂ is a norm-space scale,
 * and decision 9's threshold is stated in the same space.
 */
function updateWeights(
	set: SampleSet,
	coefficients: Float64Array,
	cutCeiling = Number.POSITIVE_INFINITY,
): number {
	const { count, x, y, l, a, b, residual, weight } = set
	for (let i = 0; i < count; i += 1) {
		const px = x[i]
		const py = y[i]
		residual[i] = norm3(
			l[i] - (coefficients[0] + coefficients[1] * px + coefficients[2] * py),
			a[i] - (coefficients[3] + coefficients[4] * px + coefficients[5] * py),
			b[i] - (coefficients[6] + coefficients[7] * px + coefficients[8] * py),
		)
	}
	const sigma = MAD_TO_SIGMA * median(residual, count)
	// `cutCeiling` is the component recursion's one departure from the global fit: it holds the cut
	// at the explained radius so a component can never claim a pixel it does not explain. The default
	// is +∞, and `Math.min(x, +∞)` is `x` bit-for-bit, so the global fit's arithmetic is untouched.
	const cut = Math.min(TUKEY_CUT_SIGMAS * Math.max(sigma, RESIDUAL_SCALE_FLOOR), cutCeiling)
	for (let i = 0; i < count; i += 1) {
		const u = residual[i] / cut
		if (u >= 1) {
			weight[i] = 0
			continue
		}
		const t = 1 - u * u
		weight[i] = t * t
	}
	return sigma
}

/** sqrt(Σ w·r² / Σ w) over the current residuals and weights. Zero when nothing is weighted. */
function weightedRobustRms(set: SampleSet): number {
	let sumWeight = 0
	let sumSquares = 0
	for (let i = 0; i < set.count; i += 1) {
		const w = set.weight[i]
		sumWeight += w
		sumSquares += w * set.residual[i] * set.residual[i]
	}
	return sumWeight > 0 ? Math.sqrt(sumSquares / sumWeight) : 0
}

/**
 * Order-0: the robust centre. Started from the coordinate-wise median (a breakdown-1/2 start, so a
 * heavily marked image cannot start the iteration inside the marks), then IRLS — at fixed weights
 * the M-estimator's stationary point is the weighted mean, so each iteration is one weighted mean.
 */
function fitOrder0(
	set: SampleSet,
	cutCeiling = Number.POSITIVE_INFINITY,
	start: OkLab | null = null,
): FitResult {
	const coefficients = new Float64Array(9)
	// The coordinate-wise median is the breakdown-1/2 start the global fit uses. A component level
	// may hand in its domain's modal colour instead (`E2_BRIEF.md`'s recursion needs a start inside
	// a mode: on a two-block domain the median sits between the blocks, where a cut held at the
	// explained radius weights nothing).
	coefficients[0] = start ? start[0] : median(set.l, set.count)
	coefficients[3] = start ? start[1] : median(set.a, set.count)
	coefficients[6] = start ? start[2] : median(set.b, set.count)

	let iterations = 0
	for (; iterations < MAX_IRLS_ITERATIONS; iterations += 1) {
		updateWeights(set, coefficients, cutCeiling)
		let sumWeight = 0
		let sumL = 0
		let sumA = 0
		let sumB = 0
		for (let i = 0; i < set.count; i += 1) {
			const w = set.weight[i]
			sumWeight += w
			sumL += w * set.l[i]
			sumA += w * set.a[i]
			sumB += w * set.b[i]
		}
		if (!(sumWeight > 0)) break
		const nextL = sumL / sumWeight
		const nextA = sumA / sumWeight
		const nextB = sumB / sumWeight
		const delta = Math.max(
			Math.abs(nextL - coefficients[0]),
			Math.abs(nextA - coefficients[3]),
			Math.abs(nextB - coefficients[6]),
		)
		coefficients[0] = nextL
		coefficients[3] = nextA
		coefficients[6] = nextB
		if (delta < COEFFICIENT_CONVERGENCE) break
	}

	const residualScale = updateWeights(set, coefficients, cutCeiling)
	return { coefficients, residualScale, robustRms: weightedRobustRms(set), iterations }
}

/**
 * Order-1: per-channel affine in normalized position, three channels sharing one weight per pixel
 * (the weight comes from the *vector* residual norm — a pixel is on the surface or it is not; it
 * cannot be an inlier in lightness and an outlier in chroma). Single start from the order-0 robust
 * centre per `SPEC.md` decision 1, not arm-f's multi-start.
 *
 * Each iteration solves the weighted normal equations for the shared 3×3 design Gram (one Cholesky,
 * three right-hand sides). If the Gram is rank-deficient in position — a degenerate raster, or a
 * weight set that collapsed onto a line — the iteration stops and the last iterate stands, which
 * for the first iteration means the order-0 centre with exactly zero tilt.
 */
function fitOrder1(
	set: SampleSet,
	start: Float64Array,
	cutCeiling = Number.POSITIVE_INFINITY,
): FitResult {
	const coefficients = start.slice()
	const solution = new Float64Array(3)
	const rhs = new Float64Array(3)

	let iterations = 0
	for (; iterations < MAX_IRLS_ITERATIONS; iterations += 1) {
		updateWeights(set, coefficients, cutCeiling)

		let g00 = 0
		let g01 = 0
		let g02 = 0
		let g11 = 0
		let g12 = 0
		let g22 = 0
		let bL0 = 0
		let bL1 = 0
		let bL2 = 0
		let bA0 = 0
		let bA1 = 0
		let bA2 = 0
		let bB0 = 0
		let bB1 = 0
		let bB2 = 0
		for (let i = 0; i < set.count; i += 1) {
			const w = set.weight[i]
			if (w === 0) continue
			const px = set.x[i]
			const py = set.y[i]
			const wx = w * px
			const wy = w * py
			g00 += w
			g01 += wx
			g02 += wy
			g11 += wx * px
			g12 += wx * py
			g22 += wy * py
			const vl = set.l[i]
			const va = set.a[i]
			const vb = set.b[i]
			bL0 += w * vl
			bL1 += wx * vl
			bL2 += wy * vl
			bA0 += w * va
			bA1 += wx * va
			bA2 += wy * va
			bB0 += w * vb
			bB1 += wx * vb
			bB2 += wy * vb
		}

		const factor = cholesky3(g00, g01, g02, g11, g12, g22)
		if (factor === null) break

		const next = new Float64Array(9)
		rhs[0] = bL0
		rhs[1] = bL1
		rhs[2] = bL2
		choleskySolve3(factor, rhs, solution)
		next[0] = solution[0]
		next[1] = solution[1]
		next[2] = solution[2]
		rhs[0] = bA0
		rhs[1] = bA1
		rhs[2] = bA2
		choleskySolve3(factor, rhs, solution)
		next[3] = solution[0]
		next[4] = solution[1]
		next[5] = solution[2]
		rhs[0] = bB0
		rhs[1] = bB1
		rhs[2] = bB2
		choleskySolve3(factor, rhs, solution)
		next[6] = solution[0]
		next[7] = solution[1]
		next[8] = solution[2]

		let delta = 0
		for (let c = 0; c < 9; c += 1) {
			const move = Math.abs(next[c] - coefficients[c])
			if (move > delta) delta = move
			coefficients[c] = next[c]
		}
		if (delta < COEFFICIENT_CONVERGENCE) break
	}

	const residualScale = updateWeights(set, coefficients, cutCeiling)
	return { coefficients, residualScale, robustRms: weightedRobustRms(set), iterations }
}

// ---------------------------------------------------------------------------------------------
// Full-resolution evaluation
// ---------------------------------------------------------------------------------------------

type FullResolutionEvaluation = {
	weights: Float32Array
	residualScale: number
	inlierFraction: number
	fieldExplainedFraction: number
}

/**
 * Evaluates the converged model against every pixel: residual norms, σ̂ from their MAD, Tukey
 * weights, inlier fraction, explained fraction. Every published number comes from this pass, so they
 * describe the whole image rather than the solve lattice — the subsample exists to make the *solve*
 * cheap, not to make the *report* approximate.
 *
 * The two fractions are deliberately different questions asked of the same residuals.
 * `inlierFraction` is **self-normalized**: its threshold is a multiple of σ̂, which is itself read off
 * these residuals, so it asks "did the biweight find a majority *relative to how far off things
 * are*" — and the answer, provably, is always yes. `fieldExplainedFraction` is **absolute**: its
 * threshold is a multiple of the contract's own bar and does not move when the image gets worse, so
 * it asks "is the field actually near the pixels". Only the second can fail, which is why only the
 * second is the verdict.
 */
function evaluateFullResolution(raster: DecodedRaster, coefficients: Float64Array): FullResolutionEvaluation {
	const { width, height, lab } = raster
	const pixelCount = width * height
	const residual = new Float32Array(pixelCount)

	for (let row = 0; row < height; row += 1) {
		const py = normalizedY(row, height)
		const baseL = coefficients[0] + coefficients[2] * py
		const baseA = coefficients[3] + coefficients[5] * py
		const baseB = coefficients[6] + coefficients[8] * py
		for (let column = 0; column < width; column += 1) {
			const px = normalizedX(column, width)
			const index = row * width + column
			const offset = index * 3
			residual[index] = norm3(
				lab[offset] - (baseL + coefficients[1] * px),
				lab[offset + 1] - (baseA + coefficients[4] * px),
				lab[offset + 2] - (baseB + coefficients[7] * px),
			)
		}
	}

	const residualScale = MAD_TO_SIGMA * median(residual, pixelCount)
	const cut = TUKEY_CUT_SIGMAS * Math.max(residualScale, RESIDUAL_SCALE_FLOOR)

	// The explained radius, in OKLab, fixed by the contract's bar and never by these residuals.
	const explainedRadius = EXPLAINED_RADIUS

	const weights = new Float32Array(pixelCount)
	let inliers = 0
	let explained = 0
	for (let index = 0; index < pixelCount; index += 1) {
		// Counted over every pixel, including the ones the biweight zeroed: a mark that the fit
		// rejected is still a pixel the field does not explain, and hiding it behind the weight map
		// would make the two fractions the same question again.
		if (residual[index] < explainedRadius) explained += 1
		const u = residual[index] / cut
		if (u >= 1) continue
		const t = 1 - u * u
		const w = t * t
		weights[index] = w
		if (w > INLIER_WEIGHT_THRESHOLD) inliers += 1
	}

	return {
		weights,
		residualScale,
		inlierFraction: pixelCount > 0 ? inliers / pixelCount : 0,
		fieldExplainedFraction: pixelCount > 0 ? explained / pixelCount : 0,
	}
}

// ---------------------------------------------------------------------------------------------
// Field-like components (W-E2, `E2_BRIEF.md`; `SPEC.md` decision 12)
// ---------------------------------------------------------------------------------------------

/**
 * **The recursion, and the three things that make it a fit rather than a segmentation.**
 *
 * `fitField` answers "does one surface describe this image". When it does not — decision 9's
 * `noField`, which decision 12 demotes from a verdict to a *trigger* — this runs the same robust
 * affine fit again on the pixels nothing has explained yet, and keeps the surfaces that are both
 * **extensive** and **smooth**.
 *
 *  1. **No masks as primitives.** The only mask in here (`claim`) is the fit's own residual field
 *     thresholded at the radius decision 9 already uses. Nothing looks at connectivity, at shape, at
 *     size-in-pixels-of-a-blob, or at colour identity. A component is "a surface plus what it
 *     explains", which is exactly what `FieldFit` has always been, restricted to a domain.
 *  2. **The cut is held at the explained radius.** `min(4.685·σ̂, 4×bar)`: a component may not claim
 *     a pixel it does not explain. This is the whole reason the recursion converges on the mode
 *     rather than floating between two of them — with the global fit's σ̂ (a MAD *about zero*, see
 *     `updateWeights`), a domain that is 50/50 two colours inflates σ̂ until the biweight has no
 *     rejection power at all and the surface settles in between, explaining neither. On any domain
 *     the fit already sits tightly on, σ̂ is far below the radius and the cut is the ordinary one, so
 *     this is a *ceiling*, not a new estimator.
 *  3. **The start is the domain's modal colour** (`modalSeed`), with the ordinary median start run
 *     beside it and the larger claim kept — arm-f's multi-start, at component level, and the reason
 *     a two-block domain yields two components instead of nothing. Ties go to the median start.
 *
 * **Termination.** The domain only shrinks, and it shrinks by at least `EXTENSIVE_SUPPORT_FRACTION`
 * of the image on every iteration that does not stop the loop: a level whose claim is smaller than
 * that can never produce an extensive component, so the loop stops there. At most `⌈1/0.10⌉ = 10`
 * iterations even with the depth cap removed; `MAX_COMPONENT_DEPTH` stops it at 4.
 *
 * **Determinism.** No randomness, no map-iteration-order dependence (the modal cell is chosen by
 * count with the lattice key as tie-break, so the `Map`'s insertion order cannot matter), and every
 * accumulation is in a fixed pixel order. The pool is sorted on (support pixels, support mass,
 * depth) — depth is unique, so no tie survives to be decided by anything else.
 */
export function fitFieldComponents(raster: DecodedRaster): FieldReading {
	const { width, height } = raster
	const pixelCount = width * height
	const domain = new Uint8Array(pixelCount).fill(1)
	let domainCount = pixelCount
	// One number for "can never be extensive" and for "the loop makes progress": see the constant.
	const minimumClaim = Math.ceil(EXTENSIVE_SUPPORT_FRACTION * pixelCount)

	const attempts: FieldComponent[] = []
	const accepted: FieldComponent[] = []
	let depthCapReached = false

	for (let depth = 0; depth < MAX_COMPONENT_DEPTH; depth += 1) {
		if (domainCount < minimumClaim) break
		const component = fitComponentLevel(raster, domain, domainCount, depth)
		if (component === null) break
		// Recorded before the gates, so a report can say what the level found and which test it
		// failed — a level that claimed too little to be a component is evidence, not silence.
		attempts.push(component)
		if (component.supportPixels < minimumClaim) break
		if (component.smooth) accepted.push(component)
		for (let index = 0; index < pixelCount; index += 1) {
			if (component.claim[index] === 1 && domain[index] === 1) {
				domain[index] = 0
				domainCount -= 1
			}
		}
		if (depth === MAX_COMPONENT_DEPTH - 1) depthCapReached = domainCount >= minimumClaim
	}

	accepted.sort((first, second) =>
		second.supportPixels - first.supportPixels ||
		second.supportMass - first.supportMass ||
		first.depth - second.depth
	)

	const labels = new Uint8Array(pixelCount)
	for (let rank = 0; rank < accepted.length; rank += 1) {
		const claim = accepted[rank].claim
		for (let index = 0; index < pixelCount; index += 1) {
			if (claim[index] === 1) labels[index] = rank + 1
		}
	}

	return {
		components: accepted,
		attempts,
		depthCapReached,
		retreat: accepted.length === 0,
		labels,
	}
}

/**
 * One level: two starts, the better claim kept, the component measured against both gates.
 *
 * "Better" is the larger claim, ties to the median start — the same order the starts are tried in,
 * so the choice is a total order and not a preference.
 */
function fitComponentLevel(
	raster: DecodedRaster,
	domain: Uint8Array,
	domainCount: number,
	depth: number,
): FieldComponent | null {
	const samples = buildDomainSamples(raster, domain, domainCount)
	if (samples.count === 0) return null

	const seeds: (OkLab | null)[] = [null, modalSeed(raster, domain)]
	let best: FieldComponent | null = null
	for (const seed of seeds) {
		const order0 = fitOrder0(samples, EXPLAINED_RADIUS, seed)
		const order1 = fitOrder1(samples, order0.coefficients, EXPLAINED_RADIUS)
		const marginBars = (order0.robustRms - order1.robustRms) / POOLED_SAME_COLOR_BAR
		const span = fittedSpan(order1.coefficients)
		const order: 0 | 1 = marginBars > 0 && span > 0 ? 1 : 0
		const coefficients = order === 1 ? order1.coefficients : order0.coefficients
		const candidate = measureComponent(
			raster,
			domain,
			domainCount,
			coefficients,
			order,
			marginBars,
			depth,
			seed ?? [order0.coefficients[0], order0.coefficients[3], order0.coefficients[6]],
		)
		if (best === null || candidate.supportPixels > best.supportPixels) best = candidate
	}
	return best
}

/**
 * The full-resolution measurement of one candidate surface over one domain: its claim, its weights,
 * its support mass and position, and the two gates.
 *
 * The claim is `‖r‖ < 4×bar` **within the domain** — the same radius, the same units, the same
 * question decision 9 asks of the whole image, asked of the pixels still unexplained. Weights use
 * the level's ceiling-held cut, so `w > 0` implies claimed and the two never disagree.
 */
function measureComponent(
	raster: DecodedRaster,
	domain: Uint8Array,
	domainCount: number,
	coefficients: Float64Array,
	order: 0 | 1,
	marginBars: number,
	depth: number,
	seed: OkLab,
): FieldComponent {
	const { width, height, lab } = raster
	const pixelCount = width * height
	const residual = new Float32Array(pixelCount)
	const domainResiduals = new Float32Array(domainCount)

	let cursor = 0
	for (let row = 0; row < height; row += 1) {
		const py = normalizedY(row, height)
		const baseL = coefficients[0] + coefficients[2] * py
		const baseA = coefficients[3] + coefficients[5] * py
		const baseB = coefficients[6] + coefficients[8] * py
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			if (domain[index] !== 1) continue
			const px = normalizedX(column, width)
			const offset = index * 3
			const value = norm3(
				lab[offset] - (baseL + coefficients[1] * px),
				lab[offset + 1] - (baseA + coefficients[4] * px),
				lab[offset + 2] - (baseB + coefficients[7] * px),
			)
			residual[index] = value
			if (cursor < domainCount) domainResiduals[cursor] = value
			cursor += 1
		}
	}

	const residualScale = MAD_TO_SIGMA * median(domainResiduals, Math.min(cursor, domainCount))
	const cut = Math.min(
		TUKEY_CUT_SIGMAS * Math.max(residualScale, RESIDUAL_SCALE_FLOOR),
		EXPLAINED_RADIUS,
	)

	const claim = new Uint8Array(pixelCount)
	const weights = new Float32Array(pixelCount)
	let supportPixels = 0
	let supportMass = 0
	let coreCount = 0
	let sumX = 0
	let sumY = 0
	let plainX = 0
	let plainY = 0
	for (let row = 0; row < height; row += 1) {
		const py = normalizedY(row, height)
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			if (domain[index] !== 1) continue
			const value = residual[index]
			if (!(value < EXPLAINED_RADIUS)) continue
			claim[index] = 1
			supportPixels += 1
			const px = normalizedX(column, width)
			plainX += px
			plainY += py
			const u = value / cut
			if (u >= 1) continue
			const t = 1 - u * u
			const weight = t * t
			weights[index] = weight
			supportMass += weight
			if (weight > INLIER_WEIGHT_THRESHOLD) coreCount += 1
			sumX += weight * px
			sumY += weight * py
		}
	}

	const supportFraction = pixelCount > 0 ? supportPixels / pixelCount : 0
	const meanX = supportMass > 0 ? sumX / supportMass : supportPixels > 0 ? plainX / supportPixels : 0
	const meanY = supportMass > 0 ? sumY / supportMass : supportPixels > 0 ? plainY / supportPixels : 0
	// **Smooth**, and why it is this and not the brief's literal wording. `E2_BRIEF.md` says "the
	// component's own explained fraction over its support ≥ 0.5, using the existing 4×bar radius".
	// Under a claim-defined support that quantity is 1 by construction (the claim *is* the explained
	// set), so it cannot fail and would be a gate that never fires — the exact defect decision 9's
	// second ruling was retired for. The non-vacuous form of the same sentence, with the same two
	// constants and no new ones, asks how much of what the component claims sits in the fit's own
	// **inlier core** (`w > 0.5`, i.e. within 0.5412 of the cut) rather than out at the rim: a real
	// field holds its pixels close, a surface floating over a spread-out cloud claims them only at
	// the edge of the radius. Both numbers are published; only this one is a vote.
	//
	// v0.5.1: the fraction it is voted against is `COMPONENT_CORE_FRACTION`, its own constant, and no
	// longer `NO_FIELD_EXPLAINED_FRACTION` borrowed from decision 9 — see that constant's provenance
	// for the ruling and its one evidence cover.
	const coreFraction = supportPixels > 0 ? coreCount / supportPixels : 0

	return {
		depth,
		order,
		coefficients,
		fieldAt: (x: number, y: number): OkLab => fieldAtCoefficients(coefficients, x, y),
		claim,
		weights,
		supportMass,
		supportPixels,
		supportFraction,
		explainedFractionOwn: supportPixels > 0 ? 1 : 0,
		coreFraction,
		meanX,
		meanY,
		residualScale,
		marginBars,
		seed,
		extensive: supportFraction >= EXTENSIVE_SUPPORT_FRACTION,
		smooth: supportFraction >= EXTENSIVE_SUPPORT_FRACTION &&
			coreFraction >= COMPONENT_CORE_FRACTION,
	}
}

/**
 * The same stratified lattice as `buildSamples`, restricted to the domain.
 *
 * The stride is derived from the **domain's** pixel count, so the lattice over the whole raster is
 * `MIN_SOLVE_SAMPLES × (pixels / domainPixels)` points and the share of them that lands inside the
 * domain is about `MIN_SOLVE_SAMPLES` again. That is the same guarantee `buildSamples` gives, one
 * level down, and it is an expectation rather than a floor — a domain that is spatially clumped can
 * come in under it. Stated rather than corrected: the model has 3 coefficients per channel and
 * arm-f-r3 §2.2's argument (10^5 puts the endpoint standard error orders of magnitude below any bar
 * this pipeline compares against) has orders of magnitude of headroom.
 */
function buildDomainSamples(raster: DecodedRaster, domain: Uint8Array, domainCount: number): SampleSet {
	const { width, height, lab } = raster

	let strideX = 1
	let strideY = 1
	if (domainCount > MIN_SOLVE_SAMPLES) {
		const ideal = Math.max(1, Math.floor(Math.sqrt(domainCount / MIN_SOLVE_SAMPLES)))
		strideX = Math.min(ideal, width)
		strideY = Math.min(ideal, height)
	}

	const capacity = axisSampleCount(width, strideX) * axisSampleCount(height, strideY)
	const set: SampleSet = {
		count: capacity,
		x: new Float64Array(capacity),
		y: new Float64Array(capacity),
		l: new Float64Array(capacity),
		a: new Float64Array(capacity),
		b: new Float64Array(capacity),
		residual: new Float64Array(capacity),
		weight: new Float64Array(capacity),
	}

	let index = 0
	for (let row = strideY >> 1; row < height; row += strideY) {
		const y = normalizedY(row, height)
		for (let column = strideX >> 1; column < width; column += strideX) {
			const pixel = row * width + column
			if (domain[pixel] !== 1) continue
			set.x[index] = normalizedX(column, width)
			set.y[index] = y
			set.l[index] = lab[pixel * 3]
			set.a[index] = lab[pixel * 3 + 1]
			set.b[index] = lab[pixel * 3 + 2]
			index += 1
		}
	}
	set.count = index
	return set
}

/**
 * **The domain's modal colour**, as a start for the level's IRLS.
 *
 * A count over a fixed OKLab lattice of cell size `POOLED_SAME_COLOR_BAR` (the contract's own bar —
 * no new constant), then the mass-weighted mean of every domain pixel within the explained radius of
 * the winning cell's centroid. The second pass is what makes the seed insensitive to where the cell
 * boundaries happened to fall: a mode split across two cells is re-joined by averaging over a ball
 * the size of the radius the fit itself works in.
 *
 * This is a *start*, never an answer: the IRLS moves from here and the component is whatever it
 * converges to. It is the only place in the module that counts colours rather than fitting them,
 * and it decides nothing on its own — `fitComponentLevel` keeps whichever start claims more.
 */
function modalSeed(raster: DecodedRaster, domain: Uint8Array): OkLab | null {
	const { width, height, lab } = raster
	const pixelCount = width * height
	const cells = new Map<number, { count: number; l: number; a: number; b: number }>()

	for (let index = 0; index < pixelCount; index += 1) {
		if (domain[index] !== 1) continue
		const offset = index * 3
		const l = lab[offset]
		const a = lab[offset + 1]
		const b = lab[offset + 2]
		const key = latticeKey(l, a, b)
		const cell = cells.get(key)
		if (cell === undefined) cells.set(key, { count: 1, l, a, b })
		else {
			cell.count += 1
			cell.l += l
			cell.a += a
			cell.b += b
		}
	}
	if (cells.size === 0) return null

	let bestKey = 0
	let bestCount = -1
	let bestCentre: OkLab = [0, 0, 0]
	for (const [key, cell] of cells) {
		// Count first, lattice key second: the tie-break is a property of the colour, so the Map's
		// iteration order cannot reach the result.
		if (cell.count > bestCount || (cell.count === bestCount && key < bestKey)) {
			bestCount = cell.count
			bestKey = key
			bestCentre = [cell.l / cell.count, cell.a / cell.count, cell.b / cell.count]
		}
	}

	let sumL = 0
	let sumA = 0
	let sumB = 0
	let count = 0
	for (let index = 0; index < pixelCount; index += 1) {
		if (domain[index] !== 1) continue
		const offset = index * 3
		const dl = lab[offset] - bestCentre[0]
		const da = lab[offset + 1] - bestCentre[1]
		const db = lab[offset + 2] - bestCentre[2]
		if (dl * dl + da * da + db * db >= EXPLAINED_RADIUS * EXPLAINED_RADIUS) continue
		sumL += lab[offset]
		sumA += lab[offset + 1]
		sumB += lab[offset + 2]
		count += 1
	}
	if (count === 0) return bestCentre
	return [sumL / count, sumA / count, sumB / count]
}

/** Fixed OKLab lattice at the contract's bar. Offsets keep the key a small non-negative integer. */
function latticeKey(l: number, a: number, b: number): number {
	const i = Math.floor(l / POOLED_SAME_COLOR_BAR) + 512
	const j = Math.floor(a / POOLED_SAME_COLOR_BAR) + 512
	const k = Math.floor(b / POOLED_SAME_COLOR_BAR) + 512
	return (i * 1024 + j) * 1024 + k
}

// ---------------------------------------------------------------------------------------------
// Numerics
// ---------------------------------------------------------------------------------------------

function norm3(first: number, second: number, third: number): number {
	return Math.sqrt(first * first + second * second + third * third)
}

/**
 * Median of the first `count` entries, by sorting a copy. Deterministic (typed-array sort is
 * numeric and total on finite values); even counts average the two central entries.
 */
function median(values: Float64Array | Float32Array, count: number): number {
	if (count === 0) return 0
	const sorted = values.slice(0, count)
	sorted.sort()
	const middle = count >> 1
	if (count % 2 === 1) return sorted[middle]
	return (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Cholesky factor of the symmetric 3×3 Gram, returned as `[l00, l10, l11, l20, l21, l22]`.
 * Null when a pivot fails the relative floor, i.e. the design is rank-deficient in position.
 */
function cholesky3(
	g00: number,
	g01: number,
	g02: number,
	g11: number,
	g12: number,
	g22: number,
): Float64Array | null {
	if (!(g00 > 0)) return null
	const l00 = Math.sqrt(g00)
	const l10 = g01 / l00
	const l20 = g02 / l00
	const d11 = g11 - l10 * l10
	if (!(d11 > g11 * CHOLESKY_PIVOT_FLOOR)) return null
	const l11 = Math.sqrt(d11)
	const l21 = (g12 - l20 * l10) / l11
	const d22 = g22 - l20 * l20 - l21 * l21
	if (!(d22 > g22 * CHOLESKY_PIVOT_FLOOR)) return null
	const l22 = Math.sqrt(d22)
	const factor = new Float64Array(6)
	factor[0] = l00
	factor[1] = l10
	factor[2] = l11
	factor[3] = l20
	factor[4] = l21
	factor[5] = l22
	return factor
}

/** Solves `L Lᵀ z = rhs` for the factor produced by `cholesky3`. */
function choleskySolve3(factor: Float64Array, rhs: Float64Array, out: Float64Array): void {
	const l00 = factor[0]
	const l10 = factor[1]
	const l11 = factor[2]
	const l20 = factor[3]
	const l21 = factor[4]
	const l22 = factor[5]
	const y0 = rhs[0] / l00
	const y1 = (rhs[1] - l10 * y0) / l11
	const y2 = (rhs[2] - l20 * y0 - l21 * y1) / l22
	out[2] = y2 / l22
	out[1] = (y1 - l21 * out[2]) / l11
	out[0] = (y0 - l10 * out[1] - l20 * out[2]) / l00
}
