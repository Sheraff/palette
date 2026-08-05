/**
 * **D2, as a regression test: a line of type the lightness tree cannot see.**
 *
 * `DECISIONS.md` D2 deferred one thing to the integration pass. Cycle 2's first pass let the chromatic
 * lanes reach the **accent** only, because grafting their nodes into the foreground needed the component
 * chain-collapse rule to run per lane, and that rule lives in `pipeline.ts` — a file the lane worker did
 * not own. The gap was recorded rather than discovered: *"isoluminant foregrounds remain invisible, as
 * in cycle 1."*
 *
 * This file is that gap closed, stated as an artefact rather than as a claim in a comment. The fixture
 * is six strokes of one width, one height and one baseline — every clause of arm-b §2.4's conjunction
 * satisfied on purpose — drawn in an ink whose OKLab lightness is **the same as its field's** and whose
 * chroma is far from it. A tree over L cannot contain a node separating two regions of equal lightness:
 * they are the same level set, so there is nothing to retain, and no constant repairs it.
 *
 * The test asserts the mechanism from both sides, because only the pair is evidence:
 *
 *  1. the **L-only** parse — `parseTree` with no extra lanes, which is `p2-tos` as round 1 judged it —
 *     finds no type at all on this cover, and its foreground falls through to the residual;
 *  2. the **merged** parse finds one text group, its members are nodes of the chromatic lanes, and its
 *     representative is the ink — and is what the candidate publishes as the foreground.
 *
 * (2) alone would pass if the detector had found the glyphs some other way. (1) alone would only say the
 * L lane is blind, which cycle 1 already recorded. Together they say the lanes are what carried it.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { quantiseLanes } from "../../lanes/channels.ts"
import { buildLane } from "../../lanes/nodes.ts"
import { laneInputOf } from "../../lanes/pool.ts"
import { decodeImage, parseTree } from "../../pipeline.ts"
import { GLYPH_ROW, isoluminantInkAndField, writeChromaticBars } from "./fixtures.ts"

/** The contract's one ruler, asked whether two exact triples are the same colour. */
function sameColor(first: Rgb8, second: Rgb8): boolean {
	return okLabDistance(rgbToOkLab(first), rgbToOkLab(second)) < sameColorBar(colorFromRgb(first), colorFromRgb(second))
}

test("a title that only moves in chroma: invisible to L, found and published through the lanes", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-isoluminant-text-"))
	try {
		const { ink, field } = isoluminantInkAndField()

		// The fixture's premise, asserted rather than assumed: same lightness, far apart in chroma.
		const inkLab = rgbToOkLab(ink)
		const fieldLab = rgbToOkLab(field)
		assert.ok(
			Math.abs(inkLab[0] - fieldLab[0]) < 1e-3,
			`the ink and the field are not isoluminant: L ${inkLab[0]} against ${fieldLab[0]}`,
		)
		assert.ok(
			Math.hypot(inkLab[1] - fieldLab[1], inkLab[2] - fieldLab[2]) > 0.1,
			"the ink and the field are not chromatically separated, so the fixture tests nothing",
		)

		const path = await writeChromaticBars(join(directory, "isoluminant-title.png"), 128, GLYPH_ROW, ink, field)

		// ---- 1. the L lane alone is blind to it ---------------------------------------------------
		const image = await decodeImage(path)
		const lanes = quantiseLanes(image).map((channel) => buildLane(image, channel))
		const lOnly = parseTree(image, lanes[0].tree)
		assert.deepEqual(
			lOnly.textGroups.map((group) => rgbToHex(group.repr)),
			[],
			"the L-only parse found type on a cover whose type does not move in lightness — the fixture is wrong",
		)
		assert.ok(
			!sameColor(lOnly.roles.foreground, ink),
			`the L-only parse published ${rgbToHex(lOnly.roles.foreground)} as the ink's colour without a text group`,
		)

		// ---- 2. the merged parse finds it, through the chromatic lanes ------------------------------
		const merged = parseTree(image, lanes[0].tree, lanes.slice(1).map(laneInputOf))
		assert.equal(merged.textGroups.length, 1, "the merged parse must find exactly the one line of type that is there")
		const leading = merged.textGroups[0]
		assert.ok(leading.nodeIds.length >= 4, `the leading group has ${leading.nodeIds.length} components`)
		assert.ok(
			sameColor(leading.repr, ink),
			`the text group's colour ${rgbToHex(leading.repr)} is not the ink ${rgbToHex(ink)}`,
		)

		// Every component of it is a node of a chromatic lane: the L block is `lOnly.nodes.length` long,
		// and the a and b lanes are appended after it. This is the sentence "the lanes carried it".
		const lBlockLength = lOnly.nodes.length
		for (const nodeId of leading.nodeIds) {
			assert.ok(
				nodeId >= lBlockLength,
				`component ${nodeId} came from the L lane, whose whole retained set is ${lBlockLength} nodes`,
			)
		}

		// ---- 3. and it is what the candidate publishes ---------------------------------------------
		const { palette, parse } = await paletteWithDiagnostics(path)
		assert.deepEqual(parse.roles.foreground, leading.repr, "the text group's colour must lead the foreground pool")
		assert.deepEqual(palette.roles.foreground.rgb, leading.repr, "the published foreground is not the artwork's ink")
		assert.deepEqual(validatePalette(palette).violations, [], "the published palette must satisfy the contract")
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
