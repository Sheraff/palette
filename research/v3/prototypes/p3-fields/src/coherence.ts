/**
 * **The continuous coherence field** — the substrate experiment's replacement for the binary edge map
 * and its distance transform (W13, dev-flagged, default OFF).
 *
 * ## What it replaces and why
 *
 * `fields.ts` builds one boolean per pixel — *is the k-th largest neighbour distance over the
 * same-colour bar* — and then a Euclidean distance transform of that boolean map. Every published
 * colour is downstream of it, and `measurements/attribution/PAIRS_ATTRIBUTION.md` §8 measured what that
 * costs: the edge fraction is resolution-coupled at slope **−0.212** (n = 84, correlation −0.403), it
 * drifts a median **0.122 log units** between two renditions against **0.058** under a JPEG re-encode,
 * and in the 16 pairs where the degenerate-depth fallback fired one-side-only the side that took it was
 * the higher-edge-fraction side **16 of 16**. `e1-colour`, the first rank read over the population that
 * map defines, owns **43 of the 54** all-four-role pair flips.
 *
 * A bar is a step function of a noisy measurement, and a distance transform is the operator that takes
 * a one-pixel change in that step and propagates it across a region. The chain amplifies threshold
 * noise by construction. This module removes the step and the transform together.
 *
 * ## The field, in four sentences
 *
 * At each eligible pixel and at each of `COHERENCE_SCALE_COUNT` **dyadic radii** — scale-relative, so
 * the neighbourhood is a fraction of the artwork rather than of the sampling grid — take the *k-th
 * largest* OKLab distance from the pixel to the eight neighbours at that radius (the same rank filter
 * `fields.ts` uses, at the same calibrated k), divided by the pixel's own same-colour bar so the
 * quantity is comparable across regions. Rank that scalar over the eligible pixels and read the
 * **percentile** — no bar is compared against, so there is no threshold to flip. Multiply the three
 * percentiles together (arm-d′'s weight-free percentile product, the sanctioned combination in this
 * prototype) and take the percentile of *that*: the result is a scalar field, uniform on [0, 1], high
 * where a pixel sits inside a region that is homogeneous at **every** scale and low where it does not.
 *
 * **This is a depth field, not an edge field.** A pixel at a boundary is incoherent at radius R and at
 * 2R and at 4R. A pixel two pixels inside a stroke is coherent at radius 1 and incoherent at radius 4,
 * because the ±4 neighbour crosses the stroke's edge. A pixel deep in the background is coherent at all
 * three. So the ordering *edge < stroke interior < field* — exactly the ordering the distance transform
 * produced — falls out of the multi-scale rank filter with no transform, no seeds and no threshold.
 *
 * ## What the design buys, stated as claims a measurement can refute
 *
 * **Read claim 2 with its correction attached.** The three claims below were written as refutable, one
 * of them was refuted by its own pre-registered measurement, and the correction is inline rather than
 * appended so that no reader meets the claim without it.
 *
 * 1. **No binary threshold anywhere in the field's construction.** The bar appears once, as a *divisor*
 *    that puts two regions' local differences in the same units. Nothing is compared against it.
 * 2. **The field-set's size is a rank, so it cannot be resized by noise.** `ATTRIBUTION.md` measured F
 *    drifting by up to **2789.9 %** between a cover and its re-encode; F built as the top (1 − β) of a
 *    percentile field was claimed here to be exactly (1 − β) of the eligible pixels on every rendition
 *    of every artwork, at every resolution, with the `degenerate-depth` fallback and
 *    `DEGENERATE_DEPTH_FLOOR_PX` therefore having nothing left to do on this path.
 *
 *    **Both halves of that claim were measured and are FALSE** (`measurements/substrate/SUBSTRATE_2.md`
 *    §5, the field-drift instrument over **539 files**, shard-verified; ruling in `SUBSTRATE_2_RULING.md`
 *    §4). F's fraction ran **min 9.8e-6, median 0.2500, p90 0.4442, max 0.8922**, and was **not exactly
 *    (1 − β) on 205 of the 539 files (38 %)**. The cause is in this module's own code and not in the
 *    measurement: the strict cut `coherence > threshold` in `field-roles.ts` sits on a **tie-averaged**
 *    percentile field, so a flat artwork puts a large block of pixels on one shared percentile value and
 *    the cut lands far from the rank. One dither-arm file returned **F = 4 pixels of 409 600** — the
 *    degenerate case this paragraph said could not arrive, arriving through a different door, unguarded.
 *
 *    Recorded rather than repaired: `SUBSTRATE_2_RULING.md` FALSIFIED the coherence-field family for P3
 *    on `e1Q95` (0.0890 against a pre-registered ≤ 0.0542, 14.9× its own perturbation drift) and the
 *    flags stay off, so there is nothing shipped to fix. What was owed was the correction of the claim,
 *    and a claim that survived its own refutation in the file's docstring is how the next reader
 *    inherits it as true.
 * 3. **Single-scale noise cannot flip membership on its own.** A ±1-LSB dither moves the radius-1 rank
 *    filter; it does not move the radius-4 one, because the perturbation is not correlated across the
 *    gap. A percentile product demotes a pixel only when *every* scale demotes it.
 *
 * ## Line compliance
 *
 * Every object here is a number attached to a pixel: an OKLab distance from a pixel **to another
 * pixel**, a ratio of two such numbers, a rank of a scalar field, and a product of ranks. No colour is
 * created, averaged, interpolated, binned or indexed; no linear filter touches a colour channel. The
 * rank filter is the same primitive `fields.ts` already uses and the percentile product is the same
 * primitive `accent.ts` already uses.
 *
 * ## Reported rather than smoothed
 *
 * - `COHERENCE_SCALE_BASE_LONG_EDGE` makes the radii scale-relative, but a radius is an **integer
 *   pixel offset**, so `Math.round` quantises it and two renditions 20 % apart in resolution can still
 *   land on the same integer triple or on adjacent ones. The coupling is reduced, not abolished; how
 *   much is a measurement, and it is in `measurements/substrate/SUBSTRATE.md`.
 * - At long edges under `COHERENCE_SCALE_BASE_LONG_EDGE / 2` the smallest two radii both clamp to 1 px
 *   and the product squares one scale. That is stated, not repaired: repairing it by de-duplicating the
 *   radii would make the *number of scales* a discontinuous function of resolution, which is a worse
 *   coupling than the one it fixes.
 * - The field is uniform on [0, 1] by construction, which means **it cannot report that an artwork has
 *   no field in it**. The 0.3.0 degenerate case was a real observation about busy photographs; this
 *   design answers it by refusing to rank noise *against a threshold* rather than by detecting it. If a
 *   busy cover's palette gets worse rather than merely more stable, this paragraph is what failed.
 */

import {
	COHERENCE_SCALE_BASE_LONG_EDGE,
	COHERENCE_SCALE_COUNT,
	edgeRankInUse,
} from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import { labDistance } from "./primitives.ts"

/**
 * The eight offsets of a radius-`r` neighbourhood, in a fixed order.
 *
 * [INHERITED] — the same eight compass directions `fields.ts`'s `NEIGHBOUR_OFFSETS` enumerates, with
 * the unit step replaced by `r`. The rank filter's `k` is defined over exactly this set of eight, which
 * is what lets the same calibrated `EDGE_RANK` be reused at every scale rather than re-anchored per
 * radius.
 */
function offsetsAt(r: number): readonly (readonly [number, number])[] {
	return [
		[-r, -r], [0, -r], [r, -r],
		[-r, 0], [r, 0],
		[-r, r], [0, r], [r, r],
	]
}

/**
 * The dyadic radii, in pixels, ascending. Scale-relative with a one-pixel floor at the grid.
 */
export function coherenceRadii(longEdge: number): readonly number[] {
	const base = longEdge / COHERENCE_SCALE_BASE_LONG_EDGE
	const radii: number[] = []
	for (let j = 0; j < COHERENCE_SCALE_COUNT; j += 1) {
		radii.push(Math.max(1, Math.round(base * Math.pow(2, j))))
	}
	return radii
}

/**
 * Percentile ranks of `value` restricted to `indices`, ties averaged, written into `out` at the same
 * pixel indices. Pixels not in `indices` are left untouched.
 *
 * `primitives.ts`'s `percentileRanks` takes a dense run and allocates a boxed `Array` to sort; this one
 * sorts an `Int32Array` of positions and is the same arithmetic. It is here rather than there because
 * it is the only caller that needs the sparse form, and the shipped path must not change.
 */
function percentileOver(indices: Int32Array, value: Float64Array, out: Float64Array): void {
	const n = indices.length
	if (n === 0) return
	if (n === 1) {
		out[indices[0]] = 1
		return
	}
	const order = new Int32Array(n)
	for (let i = 0; i < n; i += 1) order[i] = i
	// Ties broken by position so the sort is a total order and the result is reproducible to the bit.
	order.sort((left, right) => {
		const difference = value[indices[left]] - value[indices[right]]
		if (difference !== 0) return difference < 0 ? -1 : 1
		return left - right
	})
	const denominator = n - 1
	let i = 0
	while (i < n) {
		let j = i
		const at = value[indices[order[i]]]
		while (j + 1 < n && value[indices[order[j + 1]]] === at) j += 1
		const shared = ((i + j) / 2) / denominator
		for (let k = i; k <= j; k += 1) out[indices[order[k]]] = shared
		i = j + 1
	}
}

export type CoherenceField = Readonly<{
	/**
	 * The percentile of the multi-scale coherence product, per pixel — **the depth-like ordering**.
	 * Uniform on [0, 1] over the eligible pixels; 0 at ineligible ones, which are never read.
	 */
	coherence: Float64Array
	/**
	 * A **length**, scale-free: how far out the pixel stays coherent, accumulated over the scale
	 * increments and divided by the long edge.
	 *
	 * The percentile field above has no units, and one consumer needs units — `computeInkField`'s
	 * annulus radius is `INK_ANNULUS_RATIO · depth · longEdge`, which is meaningless applied to a rank.
	 * So the scale increments are accumulated weighted by the pixel's coherence at each scale:
	 * `Σ_j c_j · (R_j − R_{j−1}) / longEdge`, which is `R_max/longEdge` for a pixel coherent everywhere
	 * and `~0` for one coherent nowhere. It is a weighted sum of **scalars**, not of colours.
	 */
	scaleDepth: Float64Array
	/** The radii actually used, in pixels. */
	radii: readonly number[]
	/** Per-scale mean of the raw bar-relative local difference — diagnostics only, never read back. */
	scaleMeanRatio: readonly number[]
}>

/**
 * Build the coherence field. `COHERENCE_SCALE_COUNT` passes of eight distances per pixel, plus one rank
 * per scale and one over the product — no distance transform, no seed set, no threshold.
 */
export function computeCoherenceField(image: DecodedImage): CoherenceField {
	const { width, height, lab, bar, eligible, eligibleIndices, longEdge } = image
	const count = width * height
	const rank = edgeRankInUse()
	const radii = coherenceRadii(longEdge)

	const product = new Float64Array(count)
	for (let i = 0; i < eligibleIndices.length; i += 1) product[eligibleIndices[i]] = 1
	const scaleDepth = new Float64Array(count)

	const ratio = new Float64Array(count)
	const percentile = new Float64Array(count)
	const distances = new Float64Array(8)
	const scaleMeanRatio: number[] = []

	let previousRadius = 0
	for (let scale = 0; scale < radii.length; scale += 1) {
		const r = radii[scale]
		const offsets = offsetsAt(r)
		let ratioSum = 0

		for (let i = 0; i < eligibleIndices.length; i += 1) {
			const index = eligibleIndices[i]
			const y = Math.floor(index / width)
			const x = index - y * width

			let found = 0
			for (const [dx, dy] of offsets) {
				const nx = x + dx
				const ny = y + dy
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
				const neighbour = ny * width + nx
				if (eligible[neighbour] === 0) continue
				const distance = labDistance(lab, index, neighbour)
				let slot = found
				while (slot > 0 && distances[slot - 1] < distance) {
					distances[slot] = distances[slot - 1]
					slot -= 1
				}
				distances[slot] = distance
				found += 1
			}
			if (found === 0) {
				// No neighbour at this radius at all — an isolated eligible pixel, or a radius wider than
				// the image. `fields.ts`'s convention for a truncated neighbourhood is the conservative
				// direction (fewer edges); the same direction here is *maximally coherent*, i.e. a local
				// difference of zero, because a pixel with nothing to differ from does not differ.
				ratio[index] = 0
				continue
			}
			// The k-th largest, or the smallest available when the neighbourhood is shorter than k —
			// `fields.ts`'s convention, verbatim, so the two implementations of the rank filter agree.
			const slot = Math.min(rank, found) - 1
			// The bar divides rather than being compared against: it is the contract's calibrated ruler
			// used as a *unit*, which is what makes one region's local difference commensurable with
			// another's. A zero bar would be a decode bug; the guard keeps it finite rather than hiding it.
			const barAt = bar[index] > 0 ? bar[index] : 1
			const value = distances[slot] / barAt
			ratio[index] = value
			ratioSum += value
		}

		scaleMeanRatio.push(eligibleIndices.length === 0 ? 0 : ratioSum / eligibleIndices.length)

		// Coherence is the *complement* of the incoherence percentile: high where the local difference is
		// small relative to the whole image's distribution of local differences.
		percentileOver(eligibleIndices, ratio, percentile)
		const increment = (r - previousRadius) / longEdge
		for (let i = 0; i < eligibleIndices.length; i += 1) {
			const index = eligibleIndices[i]
			const coherent = 1 - percentile[index]
			product[index] *= coherent
			scaleDepth[index] += coherent * increment
		}
		previousRadius = r
	}

	const coherence = new Float64Array(count)
	percentileOver(eligibleIndices, product, coherence)

	return { coherence, scaleDepth, radii, scaleMeanRatio }
}
