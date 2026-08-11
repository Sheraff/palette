/**
 * # The colour lattice, and why the coarse alphabet is made this way
 *
 * `DESIGN.md` §"Module layout": *"`src/search/` — v0: coarse exhaustive over a colour lattice with
 * exact re-evaluation of survivors"*. This file is the *coarse* half: it partitions OKLab into cubes
 * of a stated side, keeps the cubes the artwork actually occupies, and elects **one exact image
 * triple** from each as its representative.
 *
 * Three properties, each of which is a rule from somewhere else wearing a data structure:
 *
 * 1. **Every representative is an exact pixel of the artwork.** `PHASE_0_DECISIONS.md` §4 invariant
 *    2, and the M2 brief restates it: *"the representative must be an exact image triple"*. A cell's
 *    centroid would be a colour the artwork may not contain, and a search over centroids would be a
 *    search over inventions that invariant 2 then throws away.
 * 2. **No mass filter, at any scale.** Cells are kept because the artwork occupies them, never
 *    because they are big. This is not fastidiousness: `BELONGS_STUDY.md` and the reviewer's ruling
 *    of 2026-08-04 (*"i stopped reviewing, your color maths is fucked, everything i've seen
 *    belongs"*) are about exactly this failure — rarity read as illegitimacy — and vivid accents are
 *    the rare colours. Coarsening the lattice loses *resolution*, uniformly; it never loses a
 *    region of colour space that the artwork occupies.
 * 3. **Canonical order throughout.** Cells are emitted in ascending packed-key order and the
 *    representative of a cell is chosen by `DESIGN.md`'s tie-break — *smoothed mass descending, hex
 *    ascending*. No `Map` is ever iterated, no comparator ever ties, so the enumeration order is a
 *    function of the image and nothing else.
 *
 * ## The packing
 *
 * Cell coordinates are `floor(coordinate / side)` per OKLab axis, packed into one float64 exactly as
 * `src/measure/smoothed-mass.ts` does it and for the same reason: it makes a `Map` key that sorts
 * the way the coordinates do. OKLab lightness lies in [0,1] and a,b within ±0.5; at the finest side
 * this module will ever be asked for (an eighth of the tightest bar ≈ 0.00117) the coordinates stay
 * inside ±512, well within the offset below.
 */

import { unpackKey } from "../measure/triples.ts"
import { rgbToHex } from "../../../../src/contract/color.ts"
import type { Measurement } from "../measure/types.ts"
import type { Representative } from "./types.ts"

/**
 * Packing offset and radix.
 *
 * `[UNCALIBRATED]` — derived-and-stated, not tuned: the offset only has to exceed the largest
 * magnitude a cell coordinate can reach and the radix only has to exceed twice the offset, so that
 * no coordinate wraps into its neighbour. `4096 / 8192` are the values `src/measure/smoothed-mass.ts`
 * already uses; sharing them keeps two packings from drifting into disagreement, and the packed key
 * stays under 2^40 and therefore exact in a float64.
 */
const LATTICE_COORDINATE_OFFSET = 4096
const LATTICE_RADIX = 8192

/** Pack a cell coordinate triple into one sortable number. */
export function packCell(cl: number, ca: number, cb: number): number {
	return (
		((cl + LATTICE_COORDINATE_OFFSET) * LATTICE_RADIX + (ca + LATTICE_COORDINATE_OFFSET)) *
			LATTICE_RADIX +
		(cb + LATTICE_COORDINATE_OFFSET)
	)
}

/** Which cell an OKLab point falls in, at a given side. */
export function cellOf(lab: readonly number[], side: number): { l: number; a: number; b: number } {
	return {
		l: Math.floor(lab[0] / side),
		a: Math.floor(lab[1] / side),
		b: Math.floor(lab[2] / side),
	}
}

/**
 * How many cells of `side` the artwork occupies.
 *
 * Cheap enough to run for every rung of the ladder before committing to one: it is one pass over the
 * triple table per rung, and the triple table is at most a few tens of thousands of rows.
 */
export function occupiedCellCount(measurement: Measurement, side: number): number {
	const { colorCount, lab } = measurement.triples
	const seen = new Set<number>()
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		seen.add(
			packCell(
				Math.floor(lab[base] / side),
				Math.floor(lab[base + 1] / side),
				Math.floor(lab[base + 2] / side),
			),
		)
	}
	return seen.size
}

/**
 * The representative alphabet at one lattice side.
 *
 * Returns one `Representative` per occupied cell, in ascending packed-cell-key order — the canonical
 * order every enumeration downstream iterates in.
 *
 * **The election rule is `DESIGN.md`'s tie-break verbatim**: within a cell, the triple with the
 * larger smoothed mass wins; on an exact tie, the smaller 24-bit key wins, which is hex ascending
 * because the key *is* the hex. Smoothed mass rather than exact-bin count, because `DESIGN.md` is
 * explicit that *"mass is read smoothed, never exact-bin"* — the 215× gap between the two readings
 * is the whole reason the measurement layer computes `m(c)` at all, and electing a cell's
 * representative on the exact count would be reading the artwork at the wrong scale in the one place
 * where the alphabet gets decided.
 */
export function representativesAt(measurement: Measurement, side: number): Representative[] {
	const { colorCount, keys, lab } = measurement.triples
	const mass = measurement.smoothedMass.mass

	const bestRowByCell = new Map<number, number>()
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		const cellKey = packCell(
			Math.floor(lab[base] / side),
			Math.floor(lab[base + 1] / side),
			Math.floor(lab[base + 2] / side),
		)
		const incumbent = bestRowByCell.get(cellKey)
		if (incumbent === undefined) {
			bestRowByCell.set(cellKey, row)
			continue
		}
		// Smoothed mass descending, then key ascending. The table is already in ascending-key order,
		// so `row > incumbent` implies a larger key and the second clause is a strict `>`.
		if (mass[row] > mass[incumbent]) bestRowByCell.set(cellKey, row)
	}

	// Never iterate the map: drain it through an explicit sort on the packed key.
	const cellKeys = Array.from(bestRowByCell.keys()).sort((left, right) => left - right)
	return cellKeys.map((cellKey) => {
		const row = bestRowByCell.get(cellKey) as number
		const base = row * 3
		const rgb = unpackKey(keys[row])
		return {
			row,
			rgb,
			hex: rgbToHex(rgb),
			cellKey,
			cell: {
				l: Math.floor(lab[base] / side),
				a: Math.floor(lab[base + 1] / side),
				b: Math.floor(lab[base + 2] / side),
			},
			smoothedMass: mass[row],
		}
	})
}

/**
 * The triple table row holding an exact triple, or `-1`.
 *
 * Binary search: `TripleTable.keys` is *"strictly ascending"* by construction (`src/measure/
 * triples.ts` sorts it once and calls it the canonical order everything downstream uses), so this is
 * exact and needs no auxiliary index.
 */
export function rowOfTriple(measurement: Measurement, rgb: readonly number[]): number {
	const target = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
	const { keys, colorCount } = measurement.triples
	let low = 0
	let high = colorCount - 1
	while (low <= high) {
		const middle = (low + high) >> 1
		const key = keys[middle]
		if (key === target) return middle
		if (key < target) low = middle + 1
		else high = middle - 1
	}
	return -1
}

/**
 * Wrap an exact image triple as a `Representative` at a given lattice side.
 *
 * Refinement needs this because an incumbent's colours arrive as triples — they were elected at some
 * *other* level, or came out of a move — and the conventions in `conventions.ts` read a
 * representative's row (for decision 5's two rules) rather than a bare triple.
 *
 * Throws rather than inventing a row if the triple is not in the artwork. Every colour the search
 * constructs is an image triple by construction; the one exception, the escape colour, never reaches
 * this function because the escape branch builds its own stand-in.
 */
export function representativeFor(
	measurement: Measurement,
	rgb: readonly [number, number, number],
	side: number,
): Representative {
	const row = rowOfTriple(measurement, rgb)
	if (row === -1) {
		throw new RangeError(
			`representativeFor: ${rgbToHex(rgb as [number, number, number])} is not a triple of ${measurement.source.path}; only exact image colours can be refined`,
		)
	}
	const base = row * 3
	const cell = cellOf(
		[measurement.triples.lab[base], measurement.triples.lab[base + 1], measurement.triples.lab[base + 2]],
		side,
	)
	return {
		row,
		rgb: [rgb[0], rgb[1], rgb[2]],
		hex: rgbToHex(rgb as [number, number, number]),
		cellKey: packCell(cell.l, cell.a, cell.b),
		cell,
		smoothedMass: measurement.smoothedMass.mass[row],
	}
}

/**
 * A lattice level: the side, its representatives, and an index from cell key to representative.
 *
 * Built once per level and reused by every neighbourhood query, because the refinement sweep asks
 * "what is near this colour?" a few hundred times per level and rebuilding the alphabet each time
 * would dominate the level's cost.
 */
export type LatticeLevel = Readonly<{
	side: number
	barMultiple: number
	representatives: readonly Representative[]
	byCellKey: ReadonlyMap<number, Representative>
}>

export function buildLevel(
	measurement: Measurement,
	barMultiple: number,
	side: number,
): LatticeLevel {
	const representatives = representativesAt(measurement, side)
	const byCellKey = new Map<number, Representative>()
	for (const representative of representatives) byCellKey.set(representative.cellKey, representative)
	return { side, barMultiple, representatives, byCellKey }
}

/**
 * The representatives within a Chebyshev radius of a colour's cell, in canonical order.
 *
 * Includes the colour's own cell's representative, which may not be the colour itself — at a coarse
 * level a role colour inherited from a coarser stage can sit in a cell whose elected representative
 * is a different (higher-mass) triple. That is not a bug to correct: it is the finer level offering
 * a better-supported colour from the same neighbourhood, which is exactly what refinement is for.
 * The incumbent's own colour is always also a legal move because "no change" is what the sweep
 * compares against.
 */
export function neighbourhood(
	level: LatticeLevel,
	lab: readonly number[],
	radius: number,
): Representative[] {
	const centre = cellOf(lab, level.side)
	const found: Representative[] = []
	for (let dl = -radius; dl <= radius; dl += 1) {
		for (let da = -radius; da <= radius; da += 1) {
			for (let db = -radius; db <= radius; db += 1) {
				const representative = level.byCellKey.get(
					packCell(centre.l + dl, centre.a + da, centre.b + db),
				)
				if (representative !== undefined) found.push(representative)
			}
		}
	}
	found.sort((left, right) => left.cellKey - right.cellKey)
	return found
}
