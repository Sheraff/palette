/**
 * Distinct-triple enumeration — the feasible set.
 *
 * One pass over the pixels sets bits in a 2²⁴ bitset; a rank table over that bitset then gives an
 * O(1) key → index map, and a second pass fills exact per-triple pixel counts. The result is
 * **never filtered**: proposal §2.2's list *is* the feasible set for every role, and anything that
 * dropped an entry here would reintroduce the candidacy wall the design exists to remove.
 *
 * Memory is 4 MB of index structure (two `Uint32Array(2^19)`) rather than the 64 MB a direct
 * `Uint32Array(2^24)` count table would take, which matters because the substrate already holds the
 * OKLab planes and the blur ladder.
 *
 * Ordering is ascending 24-bit key `(r << 16) | (g << 8) | b`, which is lexicographic on
 * (r, g, b) — the declared total order SPEC rule 1 breaks ties by.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { DistinctTriple, ImagePlanes } from "../types.ts"

/** 2²⁴ bits / 32 bits per word. */
const BITSET_WORDS = 1 << 19

function popcount(word: number): number {
	let value = word - ((word >>> 1) & 0x55555555)
	value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
	value = (value + (value >>> 4)) & 0x0f0f0f0f
	return Math.imul(value, 0x01010101) >>> 24
}

export type TripleTable = Readonly<{
	/** Ascending by 24-bit key. */
	triples: readonly DistinctTriple[]
	/** `keys[i]` is `triples[i]`'s 24-bit key, for tie-breaks without re-packing. */
	keys: Uint32Array
	/** Index of a 24-bit key in `triples`, or -1 when the artwork does not contain it. */
	indexOfKey: (key: number) => number
}>

/** The declared total order's key for an 8-bit triple. */
export function tripleKey(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

/**
 * Enumerate every distinct 8-bit triple of the artwork with its exact pixel count.
 *
 * Two passes over the pixels, both in raster order, no allocation inside either.
 */
export function enumerateDistinctTriples(planes: ImagePlanes): TripleTable {
	const { r8, g8, b8, width, height } = planes
	const pixelCount = width * height

	const present = new Uint32Array(BITSET_WORDS)
	for (let index = 0; index < pixelCount; index++) {
		const key = (r8[index]! << 16) | (g8[index]! << 8) | b8[index]!
		present[key >>> 5]! |= 1 << (key & 31)
	}

	// Prefix popcount: rank[w] is how many triples live in words strictly before w.
	const rank = new Uint32Array(BITSET_WORDS)
	let distinct = 0
	for (let word = 0; word < BITSET_WORDS; word++) {
		rank[word] = distinct
		distinct += popcount(present[word]!)
	}

	const keys = new Uint32Array(distinct)
	let cursor = 0
	for (let word = 0; word < BITSET_WORDS; word++) {
		let bits = present[word]!
		while (bits !== 0) {
			const lowest = bits & -bits
			keys[cursor++] = (word << 5) | (31 - Math.clz32(lowest))
			bits ^= lowest
		}
	}

	const counts = new Uint32Array(distinct)
	for (let index = 0; index < pixelCount; index++) {
		const key = (r8[index]! << 16) | (g8[index]! << 8) | b8[index]!
		const word = key >>> 5
		const below = present[word]! & ((1 << (key & 31)) - 1)
		counts[rank[word]! + popcount(below)]!++
	}

	const triples: DistinctTriple[] = new Array(distinct)
	for (let index = 0; index < distinct; index++) {
		const key = keys[index]!
		const rgb: Rgb8 = [(key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff]
		triples[index] = { rgb, lab: rgbToOkLab(rgb), count: counts[index]! }
	}

	const indexOfKey = (key: number): number => {
		if (key < 0 || key > 0xffffff) return -1
		const word = key >>> 5
		if ((present[word]! & (1 << (key & 31))) === 0) return -1
		return rank[word]! + popcount(present[word]! & ((1 << (key & 31)) - 1))
	}

	return { triples, keys, indexOfKey }
}
