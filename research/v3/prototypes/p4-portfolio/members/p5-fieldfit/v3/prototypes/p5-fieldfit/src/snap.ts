/**
 * P5 field-fit — mass-maximizing snap (W-CORE, SPEC decision 4).
 *
 * The fit produces *continuous* OKLab targets: an endpoint of a ramp, a cluster centre, a field
 * value at some position. Invariant 2 says the palette may only publish exact source pixels, so
 * every one of those targets has to be replaced by a triple that actually occurs in the artwork.
 *
 * **How that replacement is made is a design decision, not a formality, and this module makes the
 * one the SPEC picked.** Nearest-neighbour — what the toy candidate does, and what it says in its
 * own docstring is the wrong half to copy — is the failure mode: on a dithered or noisy region the
 * nearest triple to a target is whichever single stray pixel happens to sit closest, so a ±1-LSB
 * change in the source moves the published colour to a different, equally arbitrary stray. Instead:
 *
 *  1. take the ball of radius `ballRadius` around the target — the colours a viewer would call the
 *     same colour as the target;
 *  2. among those, publish the one with the most **mass**, where a triple's mass is the pixel count
 *     of its own bar-neighbourhood (itself plus every inventory triple within `ballRadius` of it).
 *
 * Step 2's smoothing is the point. Raw per-triple count is not stable under dither either — dither
 * splits one region's mass across dozens of adjacent triples, and which of them is largest is
 * noise. Summing over the neighbourhood puts that split mass back together, so the winner is the
 * *region* the target landed in, and the published pixel is that region's representative.
 *
 * Ties: OKLab distance to the target, then the packed integer. The second tie-break is total and
 * deterministic, so the output never depends on `Map` iteration order.
 *
 * An empty ball means the target is a colour the artwork does not contain at all. That is
 * information the caller needs — it is what `Diagnostics.offArtwork` reports — so it is flagged
 * rather than hidden, and the fallback is the nearest triple by the one ruler.
 */

import { okLabDistance } from "../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import type { Inventory, SnapResult } from "./types.ts"

/** Thrown when a snap is asked for something the inventory cannot answer. */
export class SnapError extends Error {
	override readonly name = "SnapError"
}

// ---------------------------------------------------------------------------------------------
// Flattened inventory + OKLab spatial hash
// ---------------------------------------------------------------------------------------------

/**
 * The inventory as parallel typed arrays. A `Map<number, TripleStats>` is the right shape for
 * lookup by colour and the wrong shape for the inner loop below, which touches every field of tens
 * of thousands of entries several times per call.
 */
type TripleTable = Readonly<{
	size: number
	packed: Int32Array
	/** 3 doubles per entry. */
	lab: Float64Array
	count: Float64Array
	rgb: readonly Rgb8[]
}>

/**
 * A uniform grid over OKLab with cell edge equal to the query radius, bucketed by hash.
 *
 * Cell edge = radius means a radius-`r` ball spans at most 2 cells per axis, so a neighbourhood
 * query visits at most 27 buckets. Buckets are keyed by a hash of the integer cell coordinates
 * rather than by the coordinates themselves, so the key is a plain number and OKLab's unbounded
 * (in principle) extent needs no offset table. **Hash collisions are harmless here and cannot cause
 * a miss:** a cell's entries are always in its own bucket, and every entry a query returns is
 * distance-tested afterwards regardless, so a colliding cell's entries are simply filtered out.
 * Visited bucket keys are de-duplicated per query so a collision between two cells in the same
 * neighbourhood cannot double-count mass.
 */
type HashGrid = Readonly<{
	cell: number
	buckets: ReadonlyMap<number, readonly number[]>
}>

/**
 * The three large primes of the classic spatial hash.
 *
 * `[INHERITED]` — Teschner et al., "Optimized Spatial Hashing for Collision Detection of Deformable
 * Objects" (VMV 2003), §4.1. They are hash multipliers, not perceptual quantities: no output of
 * this module depends on their value, only its speed does.
 */
const SPATIAL_HASH_PRIMES = [73856093, 19349663, 83492791] as const

function cellHash(il: number, ia: number, ib: number): number {
	return (
		(Math.imul(il, SPATIAL_HASH_PRIMES[0]) ^
			Math.imul(ia, SPATIAL_HASH_PRIMES[1]) ^
			Math.imul(ib, SPATIAL_HASH_PRIMES[2])) >>>
		0
	)
}

/**
 * Per-inventory caches. `snapToArtwork` is called a handful of times per image (four roles plus the
 * gradient stops), always against the same inventory, so the flattening and the grid build are done
 * once and reused. Weakly held: nothing here keeps a decoded image alive.
 */
const tableCache = new WeakMap<Inventory, TripleTable>()
const gridCache = new WeakMap<Inventory, Map<number, HashGrid>>()

function tableOf(inventory: Inventory): TripleTable {
	const cached = tableCache.get(inventory)
	if (cached !== undefined) return cached

	const size = inventory.triples.size
	const packed = new Int32Array(size)
	const lab = new Float64Array(size * 3)
	const count = new Float64Array(size)
	const rgb: Rgb8[] = new Array(size)

	let index = 0
	for (const stats of inventory.triples.values()) {
		packed[index] = stats.packed
		lab[index * 3] = stats.lab[0]
		lab[index * 3 + 1] = stats.lab[1]
		lab[index * 3 + 2] = stats.lab[2]
		count[index] = stats.count
		rgb[index] = stats.rgb
		index += 1
	}

	const table: TripleTable = { size, packed, lab, count, rgb }
	tableCache.set(inventory, table)
	return table
}

function gridOf(inventory: Inventory, table: TripleTable, radius: number): HashGrid {
	let byRadius = gridCache.get(inventory)
	if (byRadius === undefined) {
		byRadius = new Map<number, HashGrid>()
		gridCache.set(inventory, byRadius)
	}
	const cached = byRadius.get(radius)
	if (cached !== undefined) return cached

	const buckets = new Map<number, number[]>()
	for (let index = 0; index < table.size; index += 1) {
		const base = index * 3
		const key = cellHash(
			Math.floor(table.lab[base] / radius),
			Math.floor(table.lab[base + 1] / radius),
			Math.floor(table.lab[base + 2] / radius),
		)
		const bucket = buckets.get(key)
		if (bucket === undefined) buckets.set(key, [index])
		else bucket.push(index)
	}

	const grid: HashGrid = { cell: radius, buckets }
	byRadius.set(radius, grid)
	return grid
}

/** Collect the (de-duplicated) bucket keys a radius-`radius` ball around `lab` can touch. */
function bucketKeysAround(grid: HashGrid, l: number, a: number, b: number, radius: number): number[] {
	const cell = grid.cell
	const lLow = Math.floor((l - radius) / cell)
	const lHigh = Math.floor((l + radius) / cell)
	const aLow = Math.floor((a - radius) / cell)
	const aHigh = Math.floor((a + radius) / cell)
	const bLow = Math.floor((b - radius) / cell)
	const bHigh = Math.floor((b + radius) / cell)

	const seen = new Set<number>()
	const keys: number[] = []
	for (let il = lLow; il <= lHigh; il += 1) {
		for (let ia = aLow; ia <= aHigh; ia += 1) {
			for (let ib = bLow; ib <= bHigh; ib += 1) {
				const key = cellHash(il, ia, ib)
				if (seen.has(key)) continue
				seen.add(key)
				keys.push(key)
			}
		}
	}
	return keys
}

// ---------------------------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------------------------

/**
 * **Bar-neighbourhood mass of an OKLab point**: the total pixel count of every inventory triple
 * strictly within `ballRadius` of it.
 *
 * Exported because it is the quantity the snap decision turns on, and a test that only checks which
 * colour came out cannot tell a correct mass comparison from a lucky one.
 *
 * Strict `<` throughout, matching `sameColor()` in `src/contract/color.ts`, which is `distance <
 * bar`. "Within the bar" means the same thing in both places.
 */
export function barNeighbourhoodMass(lab: OkLab, inventory: Inventory, ballRadius: number): number {
	if (!(ballRadius > 0)) return 0
	const table = tableOf(inventory)
	const grid = gridOf(inventory, table, ballRadius)
	let mass = 0
	for (const key of bucketKeysAround(grid, lab[0], lab[1], lab[2], ballRadius)) {
		const bucket = grid.buckets.get(key)
		if (bucket === undefined) continue
		for (const index of bucket) {
			const base = index * 3
			const distance = Math.hypot(
				lab[0] - table.lab[base],
				lab[1] - table.lab[base + 1],
				lab[2] - table.lab[base + 2],
			)
			if (distance < ballRadius) mass += table.count[index]
		}
	}
	return mass
}

/**
 * Replace a continuous OKLab target with an exact artwork colour, per SPEC decision 4.
 *
 * `ballRadius` is the caller's same-colour scale — `POOLED_SAME_COLOR_BAR` for an unpaired target
 * like this one (SPEC decision 11; a pairwise `sameColorBar()` needs two published colours, and
 * here one of the two does not exist yet). A non-positive radius makes the ball empty by
 * definition and takes the nearest-triple path.
 */
export function snapToArtwork(target: OkLab, inventory: Inventory, ballRadius: number): SnapResult {
	const table = tableOf(inventory)
	if (table.size === 0) {
		throw new SnapError("cannot snap against an empty inventory")
	}

	let bestIndex = -1
	let bestMass = -1
	let bestDistance = Number.POSITIVE_INFINITY

	if (ballRadius > 0) {
		const grid = gridOf(inventory, table, ballRadius)
		for (const key of bucketKeysAround(grid, target[0], target[1], target[2], ballRadius)) {
			const bucket = grid.buckets.get(key)
			if (bucket === undefined) continue
			for (const index of bucket) {
				const base = index * 3
				const candidateLab: OkLab = [table.lab[base], table.lab[base + 1], table.lab[base + 2]]
				const distance = okLabDistance(target, candidateLab)
				if (!(distance < ballRadius)) continue

				const mass = barNeighbourhoodMass(candidateLab, inventory, ballRadius)
				// Mass first, then proximity to the target, then the packed integer. The last one
				// is a total order, so the answer never depends on iteration order.
				const better = bestIndex < 0 ||
					mass > bestMass ||
					(mass === bestMass &&
						(distance < bestDistance ||
							(distance === bestDistance && table.packed[index] < table.packed[bestIndex])))
				if (better) {
					bestIndex = index
					bestMass = mass
					bestDistance = distance
				}
			}
		}
	}

	if (bestIndex >= 0) {
		const base = bestIndex * 3
		return {
			rgb: table.rgb[bestIndex],
			lab: [table.lab[base], table.lab[base + 1], table.lab[base + 2]],
			offArtwork: false,
			distance: bestDistance,
		}
	}

	// Empty ball: no artwork colour is the same colour as this target. Publish the nearest one and
	// say so — SPEC decision 4, and `Diagnostics.offArtwork` is where the caller reports it.
	let nearest = 0
	let nearestDistance = Number.POSITIVE_INFINITY
	for (let index = 0; index < table.size; index += 1) {
		const base = index * 3
		const distance = okLabDistance(target, [
			table.lab[base],
			table.lab[base + 1],
			table.lab[base + 2],
		])
		if (
			distance < nearestDistance ||
			(distance === nearestDistance && table.packed[index] < table.packed[nearest])
		) {
			nearest = index
			nearestDistance = distance
		}
	}

	const base = nearest * 3
	return {
		rgb: table.rgb[nearest],
		lab: [table.lab[base], table.lab[base + 1], table.lab[base + 2]],
		offArtwork: true,
		distance: nearestDistance,
	}
}
