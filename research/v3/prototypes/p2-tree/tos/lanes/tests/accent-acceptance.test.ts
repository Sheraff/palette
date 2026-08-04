/**
 * **The round-1 acceptance case**, `00/ab67616d00001e0200000f92552b0935b967964d.jpg`.
 *
 * The reviewer's note on this cover is the reason this worker exists:
 * *"accent wrongly collapsed — vivid red-orange missed"*, and the cycle-2 obligation derived from it,
 * *"artwork identity binds: vivid accents must be mined."* The artwork is an embroidered tree of
 * coral-red leaves on cream linen with a green border; the red is the identity of the picture and
 * both cycle-1 candidates published a pale near-neutral instead.
 *
 * **Nothing here asserts a hex.** A test that pins `#d25068` would pass for the wrong reason the
 * moment the representative rule moves by one LSB, and would say nothing about *why* the colour
 * arrived. What is asserted is the structure the fix claims:
 *
 *  1. the accent does not collapse, and is an exact triple of the artwork;
 *  2. a retained node in the shared pool carries that colour — it is a *region's* colour, not a
 *     statistic;
 *  3. that node ranks far past `MARK_NODE_LIMIT` in the area ordering, so the cycle-1 pipeline
 *     **had** it and threw it away before ranking. This is the diagnosis, as an assertion;
 *  4. the published accent is the top of the accent ranking, and is more chromatic than *every*
 *     candidate the L-only pool could offer.
 *
 * (3) and (4) are what make this a recall test rather than a taste test: no threshold admitted the
 * red, no score preferred it. It was already the most chromatic thing in the picture; the ordering it
 * was ranked in is what changed.
 */

import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { colorFromRgb, rgbToHex, rgbToOkLab } from "../../../../../src/contract/color.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { paletteOf as chromaPaletteOf } from "../../candidate-chroma.ts"
import { paletteOf as lOnlyPaletteOf } from "../../candidate.ts"
import { MARK_NODE_LIMIT } from "../../constants.ts"
import { TEXT_COMPONENT_LIMIT } from "../../roles/constants.ts"
import { decodeImage, parseTree, unpack } from "../../pipeline.ts"
import { quantiseLanes } from "../channels.ts"
import { LANES } from "../constants.ts"
import { buildLane } from "../nodes.ts"
import { adoptThinness, mergePools, runChromaPipeline } from "../pool.ts"

const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")
/** The round-1 item, by its corpus path. Cited in `review-rounds/round-1-tree-families/OUTCOME.md`. */
const ACCEPTANCE_IMAGE = resolve(REPO_ROOT, "00", "ab67616d00001e0200000f92552b0935b967964d.jpg")

/** Present in this worktree? The corpus shards are symlinked in; a missing one is a setup fault. */
async function requireImage(): Promise<string> {
	await access(ACCEPTANCE_IMAGE).catch(() => {
		throw new Error(`the acceptance cover is missing at ${ACCEPTANCE_IMAGE}; the corpus shards must be linked in`)
	})
	return ACCEPTANCE_IMAGE
}

test("the vivid red-orange is a node, wins the accent ranking, and publishes", async () => {
	const path = await requireImage()
	const result = await runChromaPipeline(path)
	const palette = await chromaPaletteOf(path)

	// ---- 1. it publishes, it is exact, and the palette is legal -----------------------------------
	assert.equal(palette.collapse.accentCollapsed, false, "the accent must not collapse onto the foreground")
	assert.deepEqual(validatePalette(palette).violations, [], "the palette must satisfy the contract")

	const image = await decodeImage(path)
	const present = new Set<string>()
	for (const packed of image.packed) present.add(colorFromRgb(unpack(packed)).hex)
	assert.ok(present.has(palette.roles.accent.hex), "the accent must be an exact triple the artwork contains")

	// ---- 2. it is a region's colour ----------------------------------------------------------------
	const accentHex = palette.roles.accent.hex
	const marks = result.lanes.flatMap((lane, laneIndex) =>
		lane.nodes.filter((node) => node.kind === "mark").map((node) => ({ node, laneIndex })),
	)
	const carriers = marks.filter(({ node }) => rgbToHex(node.repr) === accentHex)
	assert.ok(carriers.length > 0, `no retained node carries the published accent ${accentHex}`)
	for (const { node } of carriers) assert.ok(LANES.includes(node.lane), "every pool node records its lane")

	// ---- 3. the cycle-1 pipeline had it and dropped it before ranking -------------------------------
	const byArea = marks
		.slice()
		.sort(
			(first, second) =>
				second.node.areaFraction - first.node.areaFraction ||
				first.laneIndex - second.laneIndex ||
				first.node.id - second.node.id,
		)
	const bestAreaRank = Math.min(...carriers.map((carrier) => byArea.findIndex((entry) => entry.node === carrier.node)))
	assert.ok(
		bestAreaRank >= TEXT_COMPONENT_LIMIT,
		`the accent's node ranks ${bestAreaRank} by area out of ${marks.length}, inside the role stage's ` +
			`area-ordered truncation (cycle 1's MARK_NODE_LIMIT=${MARK_NODE_LIMIT}, cycle 2's ` +
			`TEXT_COMPONENT_LIMIT=${TEXT_COMPONENT_LIMIT}) — the round-1 diagnosis no longer holds, so this ` +
			"test is no longer testing what it says it tests",
	)

	// ---- 4. it wins its own ranking, against everything L alone could offer -------------------------
	const backgroundLab = rgbToOkLab(result.parse.roles.background)
	const chromaFromField = (color: Rgb8): number => {
		const lab = rgbToOkLab(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
	const accentChroma = chromaFromField(palette.roles.accent.rgb)

	assert.equal(rgbToHex(result.parse.accentPool[0]), accentHex, "the top of the accent ranking must be what publishes")
	assert.equal(
		accentChroma,
		Math.max(...result.parse.accentPool.map(chromaFromField)),
		"the published accent must be the most chromatic candidate in the pool",
	)

	const lOnlyBest = Math.max(...result.base.accentPool.map(chromaFromField))
	assert.ok(
		accentChroma > lOnlyBest,
		`the accent's chromatic distance from the field is ${accentChroma}, no better than the ${lOnlyBest} the ` +
			"L-only pool already offered — the recall gap is not closed",
	)

	const lOnlyPalette = await lOnlyPaletteOf(path)
	assert.ok(
		accentChroma > chromaFromField(lOnlyPalette.roles.accent.rgb),
		`p2-tos published ${lOnlyPalette.roles.accent.hex} at ${chromaFromField(lOnlyPalette.roles.accent.rgb)}; ` +
			`p2-tos-chroma published ${accentHex} at ${accentChroma}`,
	)
	assert.ok(accentChroma > chromaFromField(palette.roles.foreground.rgb), "the accent must out-chroma the foreground")
})

test("on the acceptance cover too, the pools grow only where they are meant to", async () => {
	// The parity fixtures are simple by construction; this runs the same pin on a busy real cover,
	// where the mark population is in the hundreds and the clustering actually does something.
	const path = await requireImage()
	const image = await decodeImage(path)
	const [lChannel] = quantiseLanes(image)
	const built = buildLane(image, lChannel)
	const base = parseTree(image, built.tree)
	adoptThinness(base, built)
	const restricted = mergePools(image, [built], base)
	assert.deepEqual(
		restricted.parse.foregroundPool.map(rgbToHex),
		base.foregroundPool.map(rgbToHex),
		"the foreground pool is the sibling's ranking and must pass through untouched",
	)
	let cursor = -1
	const merged = restricted.parse.accentPool.map(rgbToHex)
	for (const color of base.accentPool.map(rgbToHex)) {
		const position = merged.indexOf(color)
		assert.ok(position > cursor, `${color} is missing from, or reordered in, the accent pool`)
		cursor = position
	}
})
