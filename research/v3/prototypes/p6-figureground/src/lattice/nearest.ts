/**
 * Nearest populated artwork colour, over the artwork's 10⁴–10⁵ distinct triples.
 *
 * A uniform bucket grid over OKLab in CSR form (counts → offsets → member indices), searched by
 * expanding Chebyshev shells around the query's bucket. The search is **exact**, not approximate:
 * a shell at radius `s` can only be abandoned once the incumbent distance is no greater than the
 * minimum possible distance to anything outside the examined box, which is computed from the actual
 * query coordinate rather than assumed. Queries outside the bucket grid are handled by *not*
 * clamping the query's bucket, so the same bound stays valid and the search still terminates on the
 * first or second shell.
 *
 * Ties are broken by the declared total order on the 8-bit triple (ascending 24-bit key), reachable
 * only on exactly equal distances — SPEC rule 1.
 */

import type { OkLab } from "../../../../src/contract/types.ts"
import type { DistinctTriple } from "../types.ts"

/**
 * Cap on buckets per axis, so a wide-gamut artwork does not build a bucket grid larger than its own
 * triple list.
 *
 * `[REVIEWED]` — a data-structure size, not a decision: the bucket width only changes how many
 * distance evaluations the exact search performs, never which triple it returns (asserted against
 * brute force in `tests/lattice.test.ts`). The width is otherwise chosen for ~1 triple per bucket;
 * this cap only binds on a pathologically wide-gamut image, where it holds the offsets array to
 * 128³ Int32 (8 MB) and measured 2.2 µs per query at 9.7×10⁵ triples — an order of magnitude past
 * the 10⁴–10⁵ the design is specified over, where the measured cost is 0.9–2.5 µs.
 */
const MAX_BUCKETS_PER_AXIS = 128

export type NearestIndex = Readonly<{
	nearest: (lab: OkLab) => DistinctTriple
	distance: (lab: OkLab) => number
	/** Bucket width actually used, in OKLab units. Reported for the bench, not read by the energy. */
	bucketWidth: number
}>

export function buildNearestIndex(triples: readonly DistinctTriple[], keys: Uint32Array): NearestIndex {
	const count = triples.length
	if (count === 0) throw new Error("lattice: an artwork with no distinct triples is not a thing")

	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	for (let index = 0; index < count; index++) {
		const lab = triples[index]!.lab
		for (let axis = 0; axis < 3; axis++) {
			if (lab[axis]! < min[axis]!) min[axis] = lab[axis]!
			if (lab[axis]! > max[axis]!) max[axis] = lab[axis]!
		}
	}

	// Aim at roughly one triple per bucket if the triples were spread over their own bounding box,
	// floored so the bucket grid never exceeds MAX_BUCKETS_PER_AXIS³. Both are sizing choices: the
	// search is exact at any bucket width, and the brute-force test asserts that.
	const widestSpan = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!, 0)
	const volume = Math.max((max[0]! - min[0]!) * (max[1]! - min[1]!) * (max[2]! - min[2]!), 1e-12)
	const targetWidth = Math.cbrt(volume / count)
	const bucketWidth = Math.max(targetWidth, widestSpan / MAX_BUCKETS_PER_AXIS, 1e-9)
	const buckets = [0, 0, 0] as [number, number, number]
	for (let axis = 0; axis < 3; axis++) {
		buckets[axis] = Math.max(1, Math.floor((max[axis]! - min[axis]!) / bucketWidth) + 1)
	}
	const [bucketsL, bucketsA, bucketsB] = buckets
	const totalBuckets = bucketsL * bucketsA * bucketsB

	const bucketOf = (lab: readonly number[], axis: number): number => {
		const raw = Math.floor((lab[axis]! - min[axis]!) / bucketWidth)
		return raw
	}

	const offsets = new Int32Array(totalBuckets + 1)
	const membership = new Int32Array(count)
	for (let index = 0; index < count; index++) {
		const lab = triples[index]!.lab
		const bucketL = Math.min(bucketsL! - 1, Math.max(0, bucketOf(lab, 0)))
		const bucketA = Math.min(bucketsA! - 1, Math.max(0, bucketOf(lab, 1)))
		const bucketB = Math.min(bucketsB! - 1, Math.max(0, bucketOf(lab, 2)))
		const bucket = (bucketB * bucketsA! + bucketA) * bucketsL! + bucketL
		membership[index] = bucket
		offsets[bucket + 1]!++
	}
	for (let bucket = 0; bucket < totalBuckets; bucket++) offsets[bucket + 1]! += offsets[bucket]!
	const cursor = offsets.slice(0, totalBuckets)
	const members = new Int32Array(count)
	for (let index = 0; index < count; index++) members[cursor[membership[index]!]!++] = index

	const search = (lab: OkLab): number => {
		const queryL = Math.floor((lab[0] - min[0]!) / bucketWidth)
		const queryA = Math.floor((lab[1] - min[1]!) / bucketWidth)
		const queryB = Math.floor((lab[2] - min[2]!) / bucketWidth)

		// Enough shells to reach the far corner of the grid from wherever the query sits, so a query
		// outside the occupied box still terminates with the true nearest rather than nothing.
		const maximumShell = Math.max(
			Math.abs(queryL),
			Math.abs(queryL - (bucketsL! - 1)),
			Math.abs(queryA),
			Math.abs(queryA - (bucketsA! - 1)),
			Math.abs(queryB),
			Math.abs(queryB - (bucketsB! - 1)),
		)

		let bestIndex = -1
		let bestDistance = Infinity
		let bestKey = 0

		for (let shell = 0; shell <= maximumShell; shell++) {
			const lowL = Math.max(0, queryL - shell)
			const highL = Math.min(bucketsL! - 1, queryL + shell)
			const lowA = Math.max(0, queryA - shell)
			const highA = Math.min(bucketsA! - 1, queryA + shell)
			const lowB = Math.max(0, queryB - shell)
			const highB = Math.min(bucketsB! - 1, queryB + shell)

			for (let bucketB = lowB; bucketB <= highB; bucketB++) {
				const onShellB = bucketB === queryB - shell || bucketB === queryB + shell
				for (let bucketA = lowA; bucketA <= highA; bucketA++) {
					const onShellA = bucketA === queryA - shell || bucketA === queryA + shell
					for (let bucketL = lowL; bucketL <= highL; bucketL++) {
						const onShellL = bucketL === queryL - shell || bucketL === queryL + shell
						// Shell, not box: skip everything an earlier shell already examined.
						if (shell > 0 && !onShellB && !onShellA && !onShellL) continue
						const bucket = (bucketB * bucketsA! + bucketA) * bucketsL! + bucketL
						const end = offsets[bucket + 1]!
						for (let slot = offsets[bucket]!; slot < end; slot++) {
							const candidate = members[slot]!
							const candidateLab = triples[candidate]!.lab
							const deltaL = candidateLab[0] - lab[0]
							const deltaA = candidateLab[1] - lab[1]
							const deltaB = candidateLab[2] - lab[2]
							const distance = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)
							const key = keys[candidate]!
							if (distance < bestDistance || (distance === bestDistance && key < bestKey)) {
								bestDistance = distance
								bestIndex = candidate
								bestKey = key
							}
						}
					}
				}
			}

			if (bestIndex >= 0) {
				// Minimum possible distance to anything outside the examined box.
				let bound = Infinity
				for (let axis = 0; axis < 3; axis++) {
					const query = axis === 0 ? queryL : axis === 1 ? queryA : queryB
					const lowPlane = min[axis]! + (query - shell) * bucketWidth
					const highPlane = min[axis]! + (query + shell + 1) * bucketWidth
					const axisBound = Math.min(lab[axis]! - lowPlane, highPlane - lab[axis]!)
					if (axisBound < bound) bound = axisBound
				}
				if (bestDistance <= Math.max(bound, 0)) break
			}
		}

		return bestIndex
	}

	const nearest = (lab: OkLab): DistinctTriple => triples[search(lab)]!

	const distance = (lab: OkLab): number => {
		const triple = triples[search(lab)]!
		const deltaL = triple.lab[0] - lab[0]
		const deltaA = triple.lab[1] - lab[1]
		const deltaB = triple.lab[2] - lab[2]
		return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)
	}

	return { nearest, distance, bucketWidth }
}
