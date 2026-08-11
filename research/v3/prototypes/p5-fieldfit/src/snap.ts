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
// The one-pass neighbourhood (v0.9.1) — wv9a's second named optimization, and why it is *exact*
// ---------------------------------------------------------------------------------------------
//
// wv9a profiled `barNeighbourhoodMass` at **3.4 s of an 8.2 s** 3000² mark read and wv9b re-measured
// the term at **5.0 s of 9.4 s**, in one entry: an 8.3 M-pixel region carrying 426 200 distinct
// triples. The shape of the cost is a product, and both factors are large — for every candidate in
// the ball around the target, the old path ran an **independent grid query** (a `Set`, 27 `cellHash`
// calls, 27 `Map` lookups, then a `Math.hypot` per entry of each bucket). With a few thousand
// candidates each seeing tens of thousands of neighbours, that is `O(10⁸)` `Math.hypot` calls made
// through three levels of pointer chasing.
//
// **This is an exact-value optimization or it does not ship** (the pass's hard requirement), so
// nothing below changes which triples are summed or which comparison decides a tie. Three changes,
// each with its own exactness argument:
//
//  1. **One pool instead of one query per candidate.** Every candidate is within `r` of the target,
//     so every neighbour of every candidate is within `2r` of the target (triangle inequality). The
//     pool is collected once, into flat typed arrays, and each candidate then scans it linearly —
//     contiguous memory instead of 27 hash-bucket dereferences. The pool is built at
//     `2r × (1 + POOL_SLACK)` and with a non-strict comparison, so it is a **superset** of what the
//     triangle inequality guarantees even after floating-point rounding; a superset is safe because
//     every pool member is still distance-tested against the candidate exactly as before, so extra
//     members are filtered out rather than summed.
//  2. **A squared-distance prefilter around the one comparison that matters.** The decision is
//     `Math.hypot(dl, da, db) < radius`, and `Math.hypot` is *implementation-approximated* by the
//     spec — so it is never replaced. Instead the squared distance `s = dl² + da² + db²` is used only
//     to skip the call where the answer cannot be in doubt: `s < r²(1 − ε)` ⇒ certainly inside,
//     `s > r²(1 + ε)` ⇒ certainly outside, and the thin shell in between calls `Math.hypot` and takes
//     its verdict. `ε = 1e-9` is seven orders of magnitude above any plausible `hypot` error (V8's is
//     sub-ulp, ~1e-16 relative), so the shell is a correctness margin rather than a tuning knob, and
//     `tests/snap.test.ts` asserts pairwise agreement with the direct comparison over randomized
//     inventories.
//  3. **The sum is over the same set, and float addition order cannot matter here** — the summands
//     are `TripleStats.count`, i.e. pixel counts, so every partial sum is an integer far below `2⁵³`
//     and is represented exactly. That is what makes reordering the accumulation safe at all; it
//     would not be for a general float mass, and this is the reason to state it rather than assume it.

/**
 * The relative half-width of the shell where the squared-distance prefilter defers to `Math.hypot`.
 *
 * `[UNCALIBRATED]` and deliberately enormous: it is not a threshold on any perceptual quantity, it is
 * a bound on floating-point disagreement between `sqrt(Σd²)` and `Math.hypot(d…)`. Any value between
 * ~1e-14 and ~1e-6 produces byte-identical answers; smaller only risks the bound, larger only costs
 * `hypot` calls.
 */
const POOL_SLACK = 1e-9

/**
 * `Math.hypot(dl, da, db) < radius`, decided by the squared distance wherever that is certain.
 *
 * Takes the squared distance and the squared radius already computed by the caller (they are loop
 * invariants there). The `Math.hypot` branch is the same expression `okLabDistance` evaluates, so a
 * pair in the shell gets exactly the answer the unoptimized path gave it.
 */
function withinRadius(
	dl: number,
	da: number,
	db: number,
	squared: number,
	radiusSquaredLow: number,
	radiusSquaredHigh: number,
	radius: number,
): boolean {
	if (squared < radiusSquaredLow) return true
	if (squared > radiusSquaredHigh) return false
	return Math.hypot(dl, da, db) < radius
}

/** The pool: every table index whose colour is within `2 × radius` (plus slack) of the target. */
type Pool = { readonly indices: Int32Array; readonly size: number }

function poolAround(
	grid: HashGrid,
	table: TripleTable,
	l: number,
	a: number,
	b: number,
	radius: number,
): Pool {
	// A superset by construction — see exactness argument 1. `<=` and the slack are both deliberate.
	const reach = 2 * radius * (1 + POOL_SLACK)
	const reachSquared = reach * reach
	const indices = new Int32Array(table.size)
	let size = 0
	for (const key of bucketKeysAround(grid, l, a, b, reach)) {
		const bucket = grid.buckets.get(key)
		if (bucket === undefined) continue
		for (const index of bucket) {
			const base = index * 3
			const dl = l - table.lab[base]!
			const da = a - table.lab[base + 1]!
			const db = b - table.lab[base + 2]!
			if (dl * dl + da * da + db * db <= reachSquared) {
				indices[size] = index
				size += 1
			}
		}
	}
	return { indices, size }
}

/** Bar-neighbourhood mass of table entry `index`, summed over `pool`. Exact; see the block above. */
function massWithinPool(
	table: TripleTable,
	pool: Pool,
	index: number,
	radius: number,
	radiusSquaredLow: number,
	radiusSquaredHigh: number,
): number {
	const base = index * 3
	const l = table.lab[base]!
	const a = table.lab[base + 1]!
	const b = table.lab[base + 2]!
	const { indices, size } = pool
	const lab = table.lab
	const count = table.count
	let mass = 0
	for (let slot = 0; slot < size; slot += 1) {
		const other = indices[slot]!
		const otherBase = other * 3
		const dl = l - lab[otherBase]!
		const da = a - lab[otherBase + 1]!
		const db = b - lab[otherBase + 2]!
		const squared = dl * dl + da * da + db * db
		if (withinRadius(dl, da, db, squared, radiusSquaredLow, radiusSquaredHigh, radius)) {
			mass += count[other]!
		}
	}
	return mass
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
 *
 * **v0.9.1: `snapToArtwork` no longer calls this, and it is deliberately left unoptimized.** The snap
 * computes the same quantity over a pre-collected pool (see the one-pass block below) because calling
 * this per candidate was 5.0 s of a 9.4 s 3000² mark read. Keeping the straightforward implementation
 * here costs nothing — it is called by tests and by nothing on the hot path — and buys the one thing
 * an exact-value optimization needs: an independent oracle that `tests/snap.test.ts` checks the fast
 * path against, rather than a fast path checked against itself.
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
		// **v0.9.1's one pass.** The candidates and every neighbour any of them can have both live
		// inside one ball of radius `2 × ballRadius` around the target, so that ball is collected once
		// into a flat index array and every candidate's mass is summed by a linear scan of it. The
		// answers are the answers the per-candidate grid queries gave: see the exactness block above,
		// and `tests/snap.test.ts`, which pins them against a literal transcription of the old path.
		const radiusSquared = ballRadius * ballRadius
		const radiusSquaredLow = radiusSquared * (1 - POOL_SLACK)
		const radiusSquaredHigh = radiusSquared * (1 + POOL_SLACK)
		const pool = poolAround(grid, table, target[0], target[1], target[2], ballRadius)
		const { indices, size } = pool
		for (let slot = 0; slot < size; slot += 1) {
			const index = indices[slot]!
			const base = index * 3
			const dl = target[0] - table.lab[base]!
			const da = target[1] - table.lab[base + 1]!
			const db = target[2] - table.lab[base + 2]!
			const squared = dl * dl + da * da + db * db
			// The candidate test is the target-side one, and it decides a tie-break below, so the
			// *distance itself* is still the `Math.hypot` value wherever it is used — only the
			// membership test is allowed to short-circuit.
			if (!withinRadius(dl, da, db, squared, radiusSquaredLow, radiusSquaredHigh, ballRadius)) {
				continue
			}
			const distance = Math.hypot(dl, da, db)

			const mass = massWithinPool(table, pool, index, ballRadius, radiusSquaredLow, radiusSquaredHigh)
			// Mass first, then proximity to the target, then the packed integer. The last one
			// is a total order, so the answer never depends on iteration order.
			const better = bestIndex < 0 ||
				mass > bestMass ||
				(mass === bestMass &&
					(distance < bestDistance ||
						(distance === bestDistance && table.packed[index]! < table.packed[bestIndex]!)))
			if (better) {
				bestIndex = index
				bestMass = mass
				bestDistance = distance
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
