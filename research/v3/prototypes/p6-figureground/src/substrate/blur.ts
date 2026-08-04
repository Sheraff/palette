/**
 * Separable Gaussian blur at full resolution, by repeated small box passes — proposal §2.1.
 *
 * ## Why boxes and not a Gaussian FIR
 *
 * The proposal forbids decimation ("nothing here resamples the image") and asks for the coarsest
 * surround at σ ≈ shortEdge/2. On a 1000×1000 image that is σ = 500 px, so a truncated Gaussian FIR
 * would need a ~3000-tap kernel — about 6·10⁹ multiply-adds for the ladder, two orders of magnitude
 * outside the 100 ms the proposal prices (§5). The classical repeated-box construction gives a
 * near-Gaussian for O(1) work per pixel per pass, independent of σ, and the ladder composes *more*
 * boxes at every rung, so the coarse levels are closer to Gaussian than the fine ones.
 *
 * **How close, measured rather than asserted** (`tests/substrate.test.ts`, and the numbers are the
 * test's): three boxes realise the requested σ to within **about 0.17 px, flat in σ** — 2% at σ = 8,
 * 0.3% at σ = 64, so the error matters least exactly where the ladder is coarsest, which is the
 * quantity that matters for a *scale* ladder. The kernel *shape* is a piecewise-quadratic B-spline,
 * which
 * differs from the Gaussian of the same σ by about **7% of the peak and 5% of the mass**, being
 * slightly more peaked and shorter-tailed. That is a real approximation and this comment previously
 * called it "a fraction of a percent", which was wrong. What the design needs from the ladder is a
 * smooth, strictly positive, centred, normalised, monotone-in-σ surround operator with correct
 * second moment; it does not need Gaussian tails, and none of the figure–ground statistics reads
 * one. If a later measurement shows the shape mattering, the remedy is more passes (the composite
 * converges to a Gaussian in the pass count), not a different family.
 *
 * This is quadrature and is declared as such (`GAUSSIAN_BOX_PASSES`). It is the one place the
 * substrate computes an approximation rather than an exact quantity, and `tests/substrate.test.ts`
 * bounds it two ways: an independent naive re-derivation of the composite kernel at an interior
 * pixel (exact agreement with what the code claims to compute), and the two error figures above
 * against a true sampled Gaussian.
 *
 * ## Boundaries
 *
 * Clamp-to-edge (replicate). It is the only padding that leaves a flat field exactly flat, which
 * matters because "a field is its own surround" is the semantic the whole module rests on: a
 * zero-padded blur would manufacture displacement all along the frame edge and mark every border
 * pixel as figure.
 *
 * ## Determinism
 *
 * Fixed pass order (three horizontal, then three vertical), fixed box widths from a closed form, a
 * float64 sliding accumulator, and no allocation inside any loop. Same input ⇒ same bytes.
 */

import { GAUSSIAN_BOX_PASSES, MIN_BLUR_SIGMA } from "./constants.ts"

/**
 * Box widths whose repeated convolution best matches a Gaussian of this σ.
 *
 * Kovesi's construction (2010, "Fast Almost-Gaussian Filtering"): pick the odd width `wl` just below
 * the ideal, use it for `m` of the `passes` passes and `wl + 2` for the rest. Widths are always odd
 * so every box is centred and the filter introduces no half-pixel shift — an even width would drift
 * the surround relative to the image, which would read as displacement.
 *
 * `m` is chosen by **exhaustive minimisation** of `|realised σ − σ|` over the `passes + 1`
 * possibilities rather than by Kovesi's rounded closed form. The closed form rounds a continuous
 * estimate and can land one step off (at σ = 3 it picks the width set realising σ = 2.83 over the
 * one realising 3.16, which is further from the target); the scan is four comparisons and is exact.
 * Ties go to the wider set, so the choice is a total function of σ with no ordering ambiguity.
 *
 * The residual error is **integer-width quantisation, not the box approximation**: box variance
 * moves in steps of `(wl + 1)/3`, so it is a few percent at σ ≈ 3 and well under one percent by
 * σ ≈ 10 — and the ladder's finest rung is shortEdge/64, which is 10 px on a 640-px cover.
 */
export function boxSizesForSigma(sigma: number, passes: number = GAUSSIAN_BOX_PASSES): number[] {
	if (!(sigma > MIN_BLUR_SIGMA)) return new Array(passes).fill(1)

	const variance = sigma * sigma
	const idealWidth = Math.sqrt((12 * variance) / passes + 1)
	let lower = Math.floor(idealWidth)
	if (lower % 2 === 0) lower -= 1
	if (lower < 1) lower = 1
	const upper = lower + 2

	// Variance of a box of odd width w is (w² − 1)/12; independent boxes add variances.
	const lowerVariance = (lower * lower - 1) / 12
	const upperVariance = (upper * upper - 1) / 12
	let bestCount = 0
	let bestError = Number.POSITIVE_INFINITY
	for (let count = 0; count <= passes; count += 1) {
		const realised = Math.sqrt(count * lowerVariance + (passes - count) * upperVariance)
		const error = Math.abs(realised - sigma)
		if (error < bestError) {
			bestError = error
			bestCount = count
		}
	}

	const sizes: number[] = []
	for (let pass = 0; pass < passes; pass += 1) sizes.push(pass < bestCount ? lower : upper)
	return sizes
}

/**
 * Columns carried at once by the vertical pass.
 *
 * `[MEASURED]` — 2026-08-04 on this machine (Apple Silicon, Node 25), at 1000×1000 over the six-rung
 * three-channel ladder, i.e. 108 full-frame passes. A vertical box blur written the obvious way
 * walks one column at a time with stride `width`, touching a fresh cache line for every sample;
 * blocking the columns turns every inner loop back into a sequential read of `BLOCK` contiguous
 * floats. Measured on that ladder: **263 ms → 195 ms** of blur time, with no change to any output
 * value (the naive re-derivation and flat-field tests pin that). 64 floats is a 256-byte span — four
 * cache lines — and a block's accumulators are 512 bytes, so its working set stays resident while a
 * whole image column would not.
 *
 * Purely a memory-layout constant: it cannot change a result, only a runtime.
 */
const VERTICAL_COLUMN_BLOCK = 64

/**
 * ## Seeding the window in closed form
 *
 * Both passes below seed their sliding window at position 0 rather than walking it. The window there
 * covers `radius + 1` copies of sample 0 (the left tail plus the sample itself) and samples
 * `1..radius` on the right, each clamped to `last`. When `radius > last` that clamp means
 * `radius - last` extra copies of the final sample, and adding those in closed form rather than
 * iterating matters: the coarsest rung's box is about 1500 wide on a 1000-px image, so a naive seed
 * would cost as much again as the entire pass. Written out in both functions rather than shared
 * through a callback, because a per-row closure in the hot loop measurably costs more than the
 * duplication does.
 */

/** One horizontal box pass, clamp-padded. `radius` 0 is the identity (a copy). */
export function boxBlurHorizontal(
	source: Float32Array,
	target: Float32Array,
	width: number,
	height: number,
	radius: number,
): void {
	if (radius <= 0) {
		target.set(source)
		return
	}
	const inverse = 1 / (2 * radius + 1)
	const last = width - 1
	const walk = radius < last ? radius : last
	const overhang = radius > last ? radius - last : 0
	for (let y = 0; y < height; y += 1) {
		const row = y * width
		let sum = source[row] * (radius + 1)
		for (let offset = 1; offset <= walk; offset += 1) sum += source[row + offset]
		if (overhang > 0) sum += source[row + last] * overhang
		for (let x = 0; x < width; x += 1) {
			target[row + x] = sum * inverse
			const enter = x + radius + 1
			const leave = x - radius
			sum += source[row + (enter < last ? enter : last)] - source[row + (leave > 0 ? leave : 0)]
		}
	}
}

/** One vertical box pass, clamp-padded, blocked by column (see `VERTICAL_COLUMN_BLOCK`). */
export function boxBlurVertical(
	source: Float32Array,
	target: Float32Array,
	width: number,
	height: number,
	radius: number,
): void {
	if (radius <= 0) {
		target.set(source)
		return
	}
	const inverse = 1 / (2 * radius + 1)
	const last = height - 1
	// Float64 accumulators: the sliding window adds and subtracts a few thousand times per column,
	// and float32 accumulation would drift visibly at the coarsest rung.
	const accumulator = new Float64Array(VERTICAL_COLUMN_BLOCK)
	const walk = radius < last ? radius : last
	const overhang = radius > last ? radius - last : 0

	for (let firstColumn = 0; firstColumn < width; firstColumn += VERTICAL_COLUMN_BLOCK) {
		const columns = Math.min(VERTICAL_COLUMN_BLOCK, width - firstColumn)

		for (let column = 0; column < columns; column += 1) {
			accumulator[column] = source[firstColumn + column] * (radius + 1)
		}
		for (let offset = 1; offset <= walk; offset += 1) {
			const row = offset * width + firstColumn
			for (let column = 0; column < columns; column += 1) accumulator[column] += source[row + column]
		}
		if (overhang > 0) {
			const row = last * width + firstColumn
			for (let column = 0; column < columns; column += 1) {
				accumulator[column] += source[row + column] * overhang
			}
		}

		for (let y = 0; y < height; y += 1) {
			const outRow = y * width + firstColumn
			const enter = y + radius + 1
			const leave = y - radius
			const enterRow = (enter < last ? enter : last) * width + firstColumn
			const leaveRow = (leave > 0 ? leave : 0) * width + firstColumn
			for (let column = 0; column < columns; column += 1) {
				target[outRow + column] = accumulator[column] * inverse
				accumulator[column] += source[enterRow + column] - source[leaveRow + column]
			}
		}
	}
}

/**
 * Blur one plane by σ, in place.
 *
 * `plane` holds the result on return and `scratch` is clobbered. The pass count is even
 * (`GAUSSIAN_BOX_PASSES` horizontal then the same number vertical), so the ping-pong lands back in
 * `plane` by construction — a radius-0 pass is still executed as a copy rather than skipped,
 * precisely so that parity never depends on σ.
 */
export function blurPlaneInPlace(
	plane: Float32Array,
	scratch: Float32Array,
	width: number,
	height: number,
	sigma: number,
): void {
	const sizes = boxSizesForSigma(sigma)
	let source = plane
	let target = scratch
	for (const size of sizes) {
		boxBlurHorizontal(source, target, width, height, (size - 1) / 2)
		const swap = source
		source = target
		target = swap
	}
	for (const size of sizes) {
		boxBlurVertical(source, target, width, height, (size - 1) / 2)
		const swap = source
		source = target
		target = swap
	}
	// The two loops run an even number of passes, so `source` is `plane` again and this copy never
	// executes at the shipped pass count. It is here because the alternative to handling the parity
	// is a silent one: at an even `GAUSSIAN_BOX_PASSES` the answer would sit in `scratch` and every
	// rung of the ladder would read the previous rung's input instead of its output.
	if (source !== plane) plane.set(source)
}
