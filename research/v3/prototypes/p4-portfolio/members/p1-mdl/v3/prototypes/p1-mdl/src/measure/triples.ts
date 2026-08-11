/**
 * The per-triple table — the one pass over pixels.
 *
 * Arm A §2.1: the image is reduced to a table indexed by the distinct 8-bit triples that actually
 * occur, and *that table is the only thing the rest of the computation sees*. Arm A′ §2.1 fixes what
 * it holds: the exact integer count and the integer spatial moments Σx, Σy, Σx², Σxy, Σy².
 *
 * **Why integers.** These are integer sums of integers: exact, associative, order-free. That single
 * choice satisfies the determinism gate and the iteration-order-invariance gate *by construction*
 * rather than by test, and it survives parallelisation across scanlines with no reduction-order
 * caveat. They are held in `Float64Array` because a float64 represents every integer up to 2^53
 * exactly; `assertMomentsFitExactly` refuses any image where that bound could be reached, so the
 * exactness is a checked property and not a hope.
 *
 * Positions are accumulated in **raw pixel coordinates** and normalised to the short edge only when
 * read (`derived.ts`). Normalising first would make the sums floats and throw away the exactness for
 * nothing.
 *
 * **Canonical ordering.** The table is sorted by 24-bit key ascending, once, here. Every later stage
 * iterates the table in index order, so no stage can see a hash order.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { DecodedImage } from "./decode.ts"
import { ImageTooLargeForExactMomentsError } from "./errors.ts"

/** The distinct-triple table, structure-of-arrays, in ascending 24-bit key order. */
export type TripleTable = Readonly<{
	/** Number of distinct triples, `K`. */
	colorCount: number
	/** Number of pixels, `N`. Equals the sum of `counts`. */
	pixelCount: number
	/** `r << 16 | g << 8 | b`, strictly ascending. The canonical order everything downstream uses. */
	keys: Int32Array
	/** Exact pixel counts. Integer-valued. */
	counts: Float64Array
	/** Exact Σx over the pixels carrying each triple, raw pixel coordinates. Integer-valued. */
	sumX: Float64Array
	/** Exact Σy. Integer-valued. */
	sumY: Float64Array
	/** Exact Σx². Integer-valued. */
	sumXX: Float64Array
	/** Exact Σxy. Integer-valued. */
	sumXY: Float64Array
	/** Exact Σy². Integer-valued. */
	sumYY: Float64Array
	/** OKLab per triple, flat `3K`, via the contract's `rgbToOkLab` and no other conversion. */
	lab: Float64Array
}>

/** The table plus the per-pixel index into it, which later passes need and the measurement does not keep. */
export type TripleScan = Readonly<{
	table: TripleTable
	/** For each pixel in raster order, its row in `table`. */
	pixelTripleIndex: Int32Array
}>

/** Unpack a 24-bit key back to the triple it came from. */
export function unpackKey(key: number): Rgb8 {
	return [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]
}

/**
 * Refuse an image whose second spatial moments could leave float64's exact integer range.
 *
 * The largest moment any pixel can contribute to is `max(W-1, H-1)²`, and there are `N` pixels, so
 * `max(W-1, H-1)² · N` bounds every sum in the table. At a square image that bound is `W⁴`, so the
 * refusal starts at roughly 9,700 × 9,700 — four hundred times the area of an album cover, and well
 * past anything `PHASE_0_DECISIONS.md` §1's no-resample rule was written for.
 */
export function assertMomentsFitExactly(image: DecodedImage): void {
	const pixelCount = image.width * image.height
	const largestCoordinate = Math.max(image.width, image.height) - 1
	const largestMoment = largestCoordinate * largestCoordinate * pixelCount
	if (largestMoment > Number.MAX_SAFE_INTEGER) {
		throw new ImageTooLargeForExactMomentsError(
			`${image.path} is ${image.width}x${image.height}; its second spatial moments could reach ${largestMoment}, past float64's exact integer range (${Number.MAX_SAFE_INTEGER}). The per-triple moments are exact by construction and this layer refuses to quietly stop being so.`,
			image.path,
			largestMoment,
		)
	}
}

/** Growable float64 column. */
function grow(previous: Float64Array, capacity: number): Float64Array {
	const next = new Float64Array(capacity)
	next.set(previous)
	return next
}

/**
 * Build the table in one raster pass.
 *
 * The distinct-colour lookup is a direct-addressed `Int32Array` over the whole 24-bit key space,
 * holding `row + 1` so that the zero-filled allocation already means "absent" — a `calloc` rather
 * than a 16-million-element fill. It costs 64 MB transiently and turns the per-pixel lookup into one
 * array read, which is what keeps the pass linear in practice as well as in principle.
 */
export function scanTriples(image: DecodedImage): TripleScan {
	assertMomentsFitExactly(image)

	const { data, width, height, channels } = image
	const pixelCount = width * height

	const lookup = new Int32Array(1 << 24)
	const pixelTripleIndex = new Int32Array(pixelCount)

	let capacity = 1024
	let colorCount = 0
	let keys = new Int32Array(capacity)
	let counts = new Float64Array(capacity)
	let sumX = new Float64Array(capacity)
	let sumY = new Float64Array(capacity)
	let sumXX = new Float64Array(capacity)
	let sumXY = new Float64Array(capacity)
	let sumYY = new Float64Array(capacity)

	let offset = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1, offset += channels) {
			const key = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
			let row = lookup[key] - 1
			if (row < 0) {
				if (colorCount === capacity) {
					capacity *= 2
					const nextKeys = new Int32Array(capacity)
					nextKeys.set(keys)
					keys = nextKeys
					counts = grow(counts, capacity)
					sumX = grow(sumX, capacity)
					sumY = grow(sumY, capacity)
					sumXX = grow(sumXX, capacity)
					sumXY = grow(sumXY, capacity)
					sumYY = grow(sumYY, capacity)
				}
				row = colorCount
				colorCount += 1
				keys[row] = key
				lookup[key] = row + 1
			}
			counts[row] += 1
			sumX[row] += x
			sumY[row] += y
			sumXX[row] += x * x
			sumXY[row] += x * y
			sumYY[row] += y * y
			pixelTripleIndex[y * width + x] = row
		}
	}

	// Canonical order: ascending 24-bit key. Sorting the *indices* and permuting is what lets the
	// per-pixel index be remapped in one sweep instead of rebuilt.
	const order = new Int32Array(colorCount)
	for (let row = 0; row < colorCount; row += 1) order[row] = row
	const sorted = Array.from(order).sort((left, right) => keys[left] - keys[right])
	const rank = new Int32Array(colorCount)
	for (let position = 0; position < colorCount; position += 1) rank[sorted[position]] = position

	const outKeys = new Int32Array(colorCount)
	const outCounts = new Float64Array(colorCount)
	const outSumX = new Float64Array(colorCount)
	const outSumY = new Float64Array(colorCount)
	const outSumXX = new Float64Array(colorCount)
	const outSumXY = new Float64Array(colorCount)
	const outSumYY = new Float64Array(colorCount)
	const lab = new Float64Array(colorCount * 3)

	for (let position = 0; position < colorCount; position += 1) {
		const row = sorted[position]
		outKeys[position] = keys[row]
		outCounts[position] = counts[row]
		outSumX[position] = sumX[row]
		outSumY[position] = sumY[row]
		outSumXX[position] = sumXX[row]
		outSumXY[position] = sumXY[row]
		outSumYY[position] = sumYY[row]
		const converted = rgbToOkLab(unpackKey(keys[row]))
		lab[position * 3] = converted[0]
		lab[position * 3 + 1] = converted[1]
		lab[position * 3 + 2] = converted[2]
	}

	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		pixelTripleIndex[pixel] = rank[pixelTripleIndex[pixel]]
	}

	return {
		table: {
			colorCount,
			pixelCount,
			keys: outKeys,
			counts: outCounts,
			sumX: outSumX,
			sumY: outSumY,
			sumXX: outSumXX,
			sumXY: outSumXY,
			sumYY: outSumYY,
			lab,
		},
		pixelTripleIndex,
	}
}
