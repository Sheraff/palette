/**
 * The field carve and the field's model (arm-b §2.3).
 *
 * ## The carve is a union-find query, not a segmentation
 *
 * **The field is what reaches the frame.** The α-zones containing border pixels *are* the field;
 * their union is the mask. Arm-b: this is where most of the stability comes from, because a
 * one-pixel crop, a re-encode or a ±1 LSB dither cannot change what is connected to the frame at bar
 * scale. There is no region-growing, no seed choice and no threshold here at all.
 *
 * ## The gradient boolean is a model-adequacy outcome, not a heuristic
 *
 * The field is typed by trying models in a fixed order and stopping at the first whose residual
 * falls under `FIELD_ADEQUACY_BARS`:
 *
 *  1. **flat** — the constant model. Its constant is the field's representative under the SPEC's own
 *     rule, so this test asks exactly "does one colour speak for this field, by the ruler?"
 *  2. **linear** — each OKLab channel regressed on normalized position. Three planes, closed form,
 *     one pass. The fitted direction is the ramp's parameter `t`.
 *  3. **none** — no progression fits, and the parse says so rather than guessing. `roles.ts` runs
 *     arm-b §2.8's degenerate branch.
 *
 * So the gradient boolean is *"no single colour represents this field within the ruler, and a
 * progression does"* — a definition, using no constant the campaign has not at least named.
 *
 * ## Cycle-1 cuts, recorded
 *
 * **Radial and conic models are not implemented** (SPEC "cycle-1 scope cuts"). A radial field
 * therefore reaches `none` and takes the degenerate branch: dull, valid, and countable as a known
 * gap rather than as a mystery. **Enclosure re-entry and the giant-type re-carve** (arm-b §2.3's two
 * structural cases) are also out of scope for this cycle, by the orchestrator's instruction.
 *
 * ## Residuals are measured in bars
 *
 * Every residual is `‖model error‖ / bar`, RMS over the field's pixels, where `bar` is the pair's
 * own regional bar. The adequacy test is therefore parasitic on the contract's ruler and introduces
 * no perceptual quantity of this pipeline's own — arm-b §3's third judgment call, implemented.
 */

import { FIELD_ADEQUACY_BARS } from "./constants.ts"
import { barOfRegionIndex, regionIndexOfLab } from "./decode.ts"
import type { DecodedImage } from "./decode.ts"
import { buildAccumulator, representativeOf } from "./accumulator.ts"
import type { Representative } from "./accumulator.ts"
import type { Hierarchy } from "./hierarchy.ts"

export type FieldCarve = Readonly<{
	/** Zone ids that touch the image border, ascending. Their union is the field. */
	zones: Int32Array
	/** Every field pixel, grouped by zone in ascending zone order, raster order inside a zone. */
	pixels: Uint32Array
	/** `pixels.length / image.pixelCount`. */
	areaFraction: number
}>

/** The α-zone(s) containing border pixels. One query over what the hierarchy already computed. */
export function carveField(image: DecodedImage, hierarchy: Hierarchy): FieldCarve {
	const zones: number[] = []
	let total = 0
	for (let zone = 0; zone < hierarchy.zoneCount; zone += 1) {
		if (hierarchy.zoneTouchesBorder[zone] === 1) {
			zones.push(zone)
			total += hierarchy.zoneSize[zone]
		}
	}
	const pixels = new Uint32Array(total)
	let cursor = 0
	for (const zone of zones) {
		// `pixelOrder` groups pixels by the zone's DFS leaf position; take that group whole.
		const position = hierarchy.firstLeaf[zone]
		for (let i = hierarchy.leafStart[position]; i < hierarchy.leafStart[position + 1]; i += 1) {
			pixels[cursor] = hierarchy.pixelOrder[i]
			cursor += 1
		}
	}
	return { zones: Int32Array.from(zones), pixels, areaFraction: total / image.pixelCount }
}

/** Three plane coefficients `[intercept, dx, dy]` per OKLab channel. */
export type LinearFit = Readonly<{
	lightness: readonly [number, number, number]
	a: readonly [number, number, number]
	b: readonly [number, number, number]
}>

export type FieldModel =
	| Readonly<{
		kind: "flat"
		residualBars: number
		representative: Representative
	}>
	| Readonly<{
		kind: "linear"
		residualBars: number
		flatResidualBars: number
		fit: LinearFit
		/** The unit direction in normalized image coordinates along which the ramp runs. */
		direction: readonly [number, number]
		/** Field pixels at the `t = 0` half of the ramp, and at the `t = 1` half. */
		lowPixels: Uint32Array
		highPixels: Uint32Array
		/** Normalized ramp endpoints, clamped into the unit square, for the optional geometry. */
		start: readonly [number, number]
		end: readonly [number, number]
		angleDegrees: number
	}>
	| Readonly<{
		kind: "none"
		flatResidualBars: number
		linearResidualBars: number
	}>

/** Solve a 3×3 system by Gaussian elimination with partial pivoting. `null` when singular. */
function solve3(matrix: number[][], rhs: number[]): [number, number, number] | null {
	const m = matrix.map((row, index) => [...row, rhs[index]])
	for (let column = 0; column < 3; column += 1) {
		let pivot = column
		for (let row = column + 1; row < 3; row += 1) {
			if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row
		}
		if (Math.abs(m[pivot][column]) < Number.EPSILON) return null
		if (pivot !== column) {
			const swap = m[column]
			m[column] = m[pivot]
			m[pivot] = swap
		}
		for (let row = column + 1; row < 3; row += 1) {
			const factor = m[row][column] / m[column][column]
			for (let k = column; k < 4; k += 1) m[row][k] -= factor * m[column][k]
		}
	}
	const solution: number[] = [0, 0, 0]
	for (let row = 2; row >= 0; row -= 1) {
		let value = m[row][3]
		for (let k = row + 1; k < 3; k += 1) value -= m[row][k] * solution[k]
		solution[row] = value / m[row][row]
	}
	if (!solution.every((value) => Number.isFinite(value))) return null
	return [solution[0], solution[1], solution[2]]
}

/**
 * Type the field by model adequacy. The order is fixed and stops at the first adequate model.
 */
export function typeField(image: DecodedImage, carve: FieldCarve): FieldModel {
	const pixels = carve.pixels
	const count = pixels.length
	const accumulator = buildAccumulator(image, pixels, 0, count)
	const representative = representativeOf(accumulator)

	// ------------------------------------------------------------------------------------------
	// 1. Flat: does one colour speak for this field, by the ruler?
	// ------------------------------------------------------------------------------------------
	let flatResidual = Number.POSITIVE_INFINITY
	if (representative !== null) {
		const reprBar = barOfRegionIndex(
			regionIndexOfLab(representative.lab[0], representative.lab[1], representative.lab[2]),
		)
		let sum = 0
		for (let i = 0; i < count; i += 1) {
			const pixel = pixels[i]
			const base = pixel * 3
			const distance = Math.hypot(
				image.lab[base] - representative.lab[0],
				image.lab[base + 1] - representative.lab[1],
				image.lab[base + 2] - representative.lab[2],
			)
			const bar = image.bar[pixel] > reprBar ? image.bar[pixel] : reprBar
			const scaled = distance / bar
			sum += scaled * scaled
		}
		flatResidual = Math.sqrt(sum / count)
		if (flatResidual < FIELD_ADEQUACY_BARS) {
			return { kind: "flat", residualBars: flatResidual, representative }
		}
	}

	// ------------------------------------------------------------------------------------------
	// 2. Linear: three planes on normalized position, closed form.
	// ------------------------------------------------------------------------------------------
	const width = image.width
	const height = image.height
	let s00 = 0
	let s0x = 0
	let s0y = 0
	let sxx = 0
	let sxy = 0
	let syy = 0
	const rhs = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]
	for (let i = 0; i < count; i += 1) {
		const pixel = pixels[i]
		// Normalized, scale-free coordinates (`CONVENTIONS.md`), pixel centres.
		const xn = ((pixel % width) + 0.5) / width
		const yn = (Math.floor(pixel / width) + 0.5) / height
		s00 += 1
		s0x += xn
		s0y += yn
		sxx += xn * xn
		sxy += xn * yn
		syy += yn * yn
		const base = pixel * 3
		for (let channel = 0; channel < 3; channel += 1) {
			const value = image.lab[base + channel]
			rhs[channel][0] += value
			rhs[channel][1] += value * xn
			rhs[channel][2] += value * yn
		}
	}
	const normal = [
		[s00, s0x, s0y],
		[s0x, sxx, sxy],
		[s0y, sxy, syy],
	]
	const betas = rhs.map((right) => solve3(normal, right))
	if (betas.some((beta) => beta === null)) {
		return { kind: "none", flatResidualBars: flatResidual, linearResidualBars: Number.POSITIVE_INFINITY }
	}
	const fit: LinearFit = {
		lightness: betas[0] as [number, number, number],
		a: betas[1] as [number, number, number],
		b: betas[2] as [number, number, number],
	}

	let linearSum = 0
	for (let i = 0; i < count; i += 1) {
		const pixel = pixels[i]
		const xn = ((pixel % width) + 0.5) / width
		const yn = (Math.floor(pixel / width) + 0.5) / height
		const base = pixel * 3
		let squared = 0
		for (let channel = 0; channel < 3; channel += 1) {
			const beta = betas[channel] as [number, number, number]
			const predicted = beta[0] + beta[1] * xn + beta[2] * yn
			const error = image.lab[base + channel] - predicted
			squared += error * error
		}
		const scaled = Math.sqrt(squared) / image.bar[pixel]
		linearSum += scaled * scaled
	}
	const linearResidual = Math.sqrt(linearSum / count)
	if (!(linearResidual < FIELD_ADEQUACY_BARS)) {
		return { kind: "none", flatResidualBars: flatResidual, linearResidualBars: linearResidual }
	}

	// ------------------------------------------------------------------------------------------
	// The ramp's parameter: the image-plane direction along which the fitted colour moves fastest.
	// Top eigenvector of J Jᵀ where J's rows are ∂lab/∂x and ∂lab/∂y — closed form for a 2×2.
	// ------------------------------------------------------------------------------------------
	let m11 = 0
	let m12 = 0
	let m22 = 0
	for (const beta of betas) {
		const b = beta as [number, number, number]
		m11 += b[1] * b[1]
		m12 += b[1] * b[2]
		m22 += b[2] * b[2]
	}
	if (m11 + m22 === 0) {
		// A perfectly constant plane fit that the flat model already rejected is a contradiction; the
		// honest answer is that no progression was found.
		return { kind: "none", flatResidualBars: flatResidual, linearResidualBars: linearResidual }
	}
	const trace = m11 + m22
	const eigen = (trace + Math.sqrt((m11 - m22) * (m11 - m22) + 4 * m12 * m12)) / 2
	let vx = m12
	let vy = eigen - m11
	if (Math.abs(vx) + Math.abs(vy) === 0) {
		vx = eigen - m22
		vy = m12
	}
	if (Math.abs(vx) + Math.abs(vy) === 0) {
		vx = 1
		vy = 0
	}
	const norm = Math.hypot(vx, vy)
	vx /= norm
	vy /= norm
	// **The sign convention, and it is a convention.** An eigenvector is defined up to sign, and
	// something has to fix it or the palette would depend on a floating-point accident. The rule
	// here is geometric — `t` runs left to right, and top to bottom when the ramp is vertical — so
	// `t = 0` is the end nearer the image origin. It carries no constant and no colour bias, but it
	// does mean a mirrored artwork swaps `background` and `surface`. Recorded as a cycle-1 cut in
	// NOTES.md; the principled replacement is arm-b §2.6's "field nodes by area fraction", which a
	// median split cannot express because both halves have equal area by construction.
	if (vx < 0 || (vx === 0 && vy < 0)) {
		vx = -vx
		vy = -vy
	}

	const projection = new Float64Array(count)
	let tMin = Number.POSITIVE_INFINITY
	let tMax = Number.NEGATIVE_INFINITY
	let sumX = 0
	let sumY = 0
	for (let i = 0; i < count; i += 1) {
		const pixel = pixels[i]
		const xn = ((pixel % width) + 0.5) / width
		const yn = (Math.floor(pixel / width) + 0.5) / height
		const t = vx * xn + vy * yn
		projection[i] = t
		if (t < tMin) tMin = t
		if (t > tMax) tMax = t
		sumX += xn
		sumY += yn
	}

	// The median split. Both halves have the same area by construction, so `t = 0` and `t = 1` are
	// two equally sized field ends rather than two arbitrary slices.
	const order = Array.from({ length: count }, (_unused, index) => index)
		.sort((first, second) => projection[first] - projection[second] || pixels[first] - pixels[second])
	const half = count >> 1
	const lowPixels = new Uint32Array(half)
	const highPixels = new Uint32Array(count - half)
	for (let i = 0; i < half; i += 1) lowPixels[i] = pixels[order[i]]
	for (let i = half; i < count; i += 1) highPixels[i - half] = pixels[order[i]]
	// Raster order inside each half, so the accumulator's first-pixel lookups are stable.
	lowPixels.sort()
	highPixels.sort()

	const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)
	const centreX = sumX / count
	const centreY = sumY / count
	const centreT = vx * centreX + vy * centreY
	const start: [number, number] = [
		clamp(centreX + (tMin - centreT) * vx),
		clamp(centreY + (tMin - centreT) * vy),
	]
	const end: [number, number] = [
		clamp(centreX + (tMax - centreT) * vx),
		clamp(centreY + (tMax - centreT) * vy),
	]

	return {
		kind: "linear",
		residualBars: linearResidual,
		flatResidualBars: flatResidual,
		fit,
		direction: [vx, vy],
		lowPixels,
		highPixels,
		start,
		end,
		angleDegrees: (Math.atan2(vy, vx) * 180) / Math.PI,
	}
}
