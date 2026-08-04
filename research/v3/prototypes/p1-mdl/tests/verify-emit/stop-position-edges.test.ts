/**
 * # Independent verifier — the two stop positions the quantiser can emit and the ramp cannot hold
 *
 * Written by the P1 emit-layer verifier, not by the implementer. It probes one boundary the existing
 * suite deliberately skirts.
 *
 * `cost.ts`'s `STOP_POSITION_BITS = 8` says an interior stop lives *"on a 1/256 grid"*. That grid is
 * the search's own alphabet: whatever P1's lattice enumerates for an interior stop, it enumerates a
 * codeword of this code. **Two of those codewords are the endpoint positions themselves** — 0 and 1 —
 * and invariant 1 pins `stops[0].position` to exactly 0 and `stops[last].position` to exactly 1 and
 * requires strict increase. So an interior stop at either edge is a codeword the search can name and
 * the contract can never accept.
 *
 * The existing `serialization-cost.test.ts` checks that position does not change L(P) using
 * `0.001 / 0.5 / 0.999` — three values that are *inside* (0,1) and none of them on the 1/256 grid.
 * It therefore never reaches the boundary. This file does, and asks the three questions that matter
 * for `DESIGN.md`'s *"the contract is the feasible set, never a term"*:
 *
 * 1. does `serializationCost` price the edge codewords identically to an interior one (it must — the
 *    code is fixed-width, and a cost function that discounted an illegal position would be a second
 *    feasible set wearing a price);
 * 2. does `toPalette` publish them untouched rather than clamping (it must, for the same reason);
 * 3. does the **contract** reject them, and reject *only* them — i.e. is the rejection exactly one
 *    codeword wide at each end, so the adjacent grid codewords `1/256` and `255/256` stay legal.
 *
 * The configuration below is the one `tests/emit/to-palette.test.ts` established as feasible against
 * a real corpus image, reused verbatim so that the interior stop's position is the *only* thing that
 * varies. Anything this file reports is therefore attributable to the position and to nothing else.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import sharp from "sharp"
import type { PixelAccessor, Rgb8, TransparencyReport } from "../../../../src/contract/types.ts"
import { serializationCost, IN_ARTWORK_COST_BOUNDS, STOP_POSITION_BITS } from "../../src/emit/cost.ts"
import { feasibility } from "../../src/emit/feasibility.ts"
import { ALGORITHM_VERSIONS, toPalette } from "../../src/emit/palette.ts"
import { sourceMetaOf } from "../../src/emit/source-meta.ts"
import { resolveCorpusPath } from "../../src/emit/paths.ts"
import type { Configuration } from "../../src/emit/types.ts"

/** `[INHERITED]` — the cover and the quintuple `tests/emit/to-palette.test.ts` proved legal. */
const IMAGE = "00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg"

const LEGAL: Configuration = {
	background: [87, 96, 93],
	surface: [227, 211, 222],
	foreground: [27, 24, 17],
	accent: [55, 58, 51],
	gradient: true,
	stops: [
		{ rgb: [87, 96, 93], position: 0 },
		{ rgb: [73, 82, 77], position: 0.5 },
		{ rgb: [227, 211, 222], position: 1 },
	],
	surfaceCollapsed: false,
	accentCollapsed: false,
	escape: null,
}

/** The same configuration with the interior stop moved, and nothing else touched. */
const withInteriorAt = (position: number): Configuration => ({
	...LEGAL,
	stops: [LEGAL.stops[0], { ...LEGAL.stops[1], position }, LEGAL.stops[2]],
})

async function fixture() {
	const path = resolveCorpusPath(IMAGE)
	assert.notEqual(path, null, `corpus image ${IMAGE} not on disk; the shards live in the primary checkout, not the worktree`)
	const { data, info } = await sharp(path as string).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	let hasTransparentPixels = false
	if (channels === 4) {
		for (let offset = 3; offset < data.length; offset += 4) {
			if (data[offset] !== 255) { hasTransparentPixels = true; break }
		}
	}
	const source: PixelAccessor = {
		width: info.width,
		height: info.height,
		getPixel(x: number, y: number): Rgb8 {
			const offset = (y * info.width + x) * channels
			return [data[offset], data[offset + 1], data[offset + 2]]
		},
	}
	const transparency: TransparencyReport = { hasAlphaChannel: channels === 4, hasTransparentPixels }
	return { source, transparency, meta: await sourceMetaOf(path as string, ALGORITHM_VERSIONS.p1ap) }
}

test("an interior stop at 0 or 1 is priced, published, and refused by the contract alone", async () => {
	const { source, transparency, meta } = await fixture()
	const facts = { source, transparency }

	// The control: the position the existing suite uses, and the palette it proved feasible.
	const control = feasibility(toPalette(LEGAL, meta), facts)
	assert.equal(control.valid, true, control.violations.map((v) => v.code).join(", "))
	const CONTROL_BITS = serializationCost(LEGAL).bits
	assert.equal(CONTROL_BITS, 133) // 2 + 1 + 4·24 + 2 + (24 + 8)

	for (const edge of [0, 1]) {
		const configuration = withInteriorAt(edge)

		// (1) L(P) is blind to it. An illegal position costs exactly what a legal one costs — the price
		// prices structure, and legality is somewhere else entirely.
		assert.equal(serializationCost(configuration).bits, CONTROL_BITS, `L(P) at interior position ${edge}`)
		assert.equal(serializationCost(configuration).breakdown.stops, 32, `stop charge at ${edge}`)

		// (2) `toPalette` publishes it verbatim. No clamp, no nudge, no throw.
		const palette = toPalette(configuration, meta)
		assert.equal(palette.gradient?.stops[1].position, edge, `published position at ${edge}`)
		assert.equal(palette.gradient?.stops.length, 3)

		// (3) The contract refuses it, and this is the *only* thing wrong with the palette: every code
		// reported is the ordering code. If any other invariant fired, the boundary would be confounded
		// and this test would not be measuring the position.
		const report = feasibility(palette, facts)
		assert.equal(report.valid, false, `interior stop at ${edge} must be infeasible`)
		assert.deepEqual(
			[...new Set(report.violations.map((violation) => violation.code))],
			["I1.stop-positions-not-ordered"],
			`interior stop at ${edge}: only the ordering clause may fire`,
		)
	}
})

test("the refusal is exactly one codeword wide: the adjacent grid positions stay feasible", async () => {
	const { source, transparency, meta } = await fixture()
	const facts = { source, transparency }
	const grid = 2 ** STOP_POSITION_BITS // 256

	// The first and last interior codewords of the 1/256 grid `cost.ts` names. If either of these were
	// also refused, the usable alphabet would be narrower than the code and `STOP_POSITION_BITS`'s
	// "finer than the ramp is ever inspected at" would be describing a grid that does not exist.
	for (const position of [1 / grid, (grid - 1) / grid]) {
		const report = feasibility(toPalette(withInteriorAt(position), meta), facts)
		assert.deepEqual(report.violations, [], `interior stop at ${position}: ${report.violations.map((v) => v.code).join(", ")}`)
		assert.equal(report.valid, true)
	}

	// Stated as the arithmetic it is: 8 bits buy 256 codewords, and the edge positions among them are
	// forever outside the feasible set — one of them under a `k/256` reading of the grid (only 0 is
	// representable), two under `k/255` (both 0 and 1 are). Either way the usable alphabet is 254 or
	// 255 values and the code is 8 bits, an overhead of 0.006–0.011 bits per interior stop. Recorded,
	// not corrected: it is three orders of magnitude below the 32-bit charge the stop carries and is
	// exactly the kind of constant `STOP_POSITION_BITS`'s refinement-invariance argument already covers.
	assert.equal(grid, 256)
	assert.ok(STOP_POSITION_BITS - Math.log2(grid - 1) < 0.01)
	assert.ok(STOP_POSITION_BITS - Math.log2(grid - 2) < 0.02)
})

test("IN_ARTWORK_COST_BOUNDS re-derived from serializationCost over the whole shape space", () => {
	// The existing suite asserts the two bounds as literals (51 and 165) and compares one hand-picked
	// escape against `.max`. Neither checks that `.max` is actually the maximum of the function over the
	// configurations the contract permits — a constant and a function that are only ever compared to
	// literals can drift apart silently. So: enumerate every legal in-artwork *shape*.
	const rgb: Rgb8 = [1, 2, 3]
	const shape = (surfaceCollapsed: boolean, accentCollapsed: boolean, stopCount: number): Configuration => ({
		background: rgb, surface: rgb, foreground: rgb, accent: rgb,
		gradient: stopCount > 0,
		stops: Array.from({ length: stopCount }, (_, index) => ({ rgb, position: index / Math.max(1, stopCount - 1) })),
		surfaceCollapsed, accentCollapsed, escape: null,
	})

	const inArtwork: number[] = []
	for (const surfaceCollapsed of [false, true]) {
		for (const accentCollapsed of [false, true]) {
			// 0 stops = flat; MIN_GRADIENT_STOPS..MAX_GRADIENT_STOPS = the contract's whole ramp range.
			for (const stopCount of [0, 2, 3, 4]) {
				inArtwork.push(serializationCost(shape(surfaceCollapsed, accentCollapsed, stopCount)).bits)
			}
		}
	}
	assert.equal(inArtwork.length, 16)
	assert.equal(Math.min(...inArtwork), IN_ARTWORK_COST_BOUNDS.min)
	assert.equal(Math.max(...inArtwork), IN_ARTWORK_COST_BOUNDS.max)

	// And the barrier, over **every** escape shape rather than the cheapest one somebody wrote down.
	const escapes: number[] = []
	for (const role of ["background", "foreground"] as const) {
		for (const surfaceCollapsed of [false, true]) {
			for (const accentCollapsed of [false, true]) {
				for (const stopCount of [0, 2, 3, 4]) {
					const base = shape(surfaceCollapsed, accentCollapsed, stopCount)
					escapes.push(serializationCost({ ...base, escape: { role, color: "#ffffff" } }).bits)
				}
			}
		}
	}
	assert.equal(escapes.length, 32)
	// `ESCAPE_COST_BITS`'s stated requirement, as an assertion over the product space:
	// no in-artwork configuration is ever outranked on structural cost by an escape configuration.
	assert.ok(Math.min(...escapes) > Math.max(...inArtwork))
	assert.equal(Math.min(...escapes), 1051)
	assert.equal(Math.min(...escapes) - Math.max(...inArtwork), 886)
})
