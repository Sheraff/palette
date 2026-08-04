/**
 * **The text detector, on shapes whose answer is known before it runs.**
 *
 * arm-b §2.4's pipeline has two halves and this file tests both: the per-component measurement (stroke
 * width from a distance transform, "twice the median distance along its ridge") and the grouping
 * conjunction (stroke widths, heights, collinearity, colour). The measurement half is tested against
 * masks whose medial axis can be written down; the grouping half against a synthetic line of type and
 * against a negative control that satisfies the count and the colour and nothing else.
 *
 * No corpus is touched here. A detector whose only evidence is album covers has failures that are
 * always ambiguous between "the grouping is wrong" and "that cover is unusual".
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { distanceFieldOf } from "../../pipeline.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { TEXT_MIN_COMPONENTS } from "../constants.ts"
import { findTextGroups, isCoherentRow, lowerMedian, strokeWidthFromDistanceField, type TextComponent } from "../text.ts"
import { GLYPH_ROW, INCOHERENT_MARKS, writeBars } from "./fixtures.ts"

test("the lower median answers with a value the sample contains", () => {
	assert.equal(lowerMedian([3]), 3)
	assert.equal(lowerMedian([5, 1, 3]), 3)
	// Even sample: the lower of the two middles, never their mean — 2 and 4 are in the sample, 3 is not.
	assert.equal(lowerMedian([4, 2, 6, 8]), 4)
	assert.throws(() => lowerMedian([]))
})

test("stroke width is twice the median ridge distance of a bar", () => {
	// A solid bar `width` across. Its ridge is the centre column, whose distance to the nearest outside
	// pixel is (width - 1) / 2 + 1 — the +1 because the transform measures to the first pixel *outside*
	// the mask, which the padding supplies. So the stroke reads (width + 1).
	for (const width of [3, 5, 7, 9]) {
		const height = 40
		const mask = new Uint8Array(width * height).fill(1)
		const field = distanceFieldOf(mask, width, height)
		const stroke = strokeWidthFromDistanceField(field.squared, field.width, field.height)
		assert.equal(stroke, width + 1, `a ${width}px bar should read ${width + 1}`)
	}
})

test("stroke width is a property of the stroke, not of the glyph's extent", () => {
	// An L: a 5px stroke bent through a right angle. Its area, bounding box and inradius all differ
	// from a straight 5px bar's; its stroke width must not.
	const size = 40
	const mask = new Uint8Array(size * size)
	for (let y = 0; y < size; y += 1) for (let x = 0; x < 5; x += 1) mask[y * size + x] = 1
	for (let y = size - 5; y < size; y += 1) for (let x = 0; x < size; x += 1) mask[y * size + x] = 1
	const field = distanceFieldOf(mask, size, size)
	assert.equal(strokeWidthFromDistanceField(field.squared, field.width, field.height), 6)
})

test("an empty mask has no stroke, and says so as zero rather than as a thin one", () => {
	const field = distanceFieldOf(new Uint8Array(16 * 16), 16, 16)
	assert.equal(strokeWidthFromDistanceField(field.squared, field.width, field.height), 0)
})

/** A component with everything agreeing, offset along a baseline. */
function glyph(index: number, overrides: Partial<TextComponent> = {}): TextComponent {
	return {
		nodeId: index + 1,
		clusterId: 0,
		strokeWidth: 6,
		height: 34,
		centroidX: 15 + index * 15,
		centroidY: 57,
		areaFraction: 0.002,
		repr: [8, 8, 8],
		...overrides,
	}
}

test("the grouping conjunction refuses each clause on its own", () => {
	const coherent = [0, 1, 2, 3, 4].map((index) => glyph(index))
	assert.ok(isCoherentRow(coherent, [0, 1, 2, 3, 4]), "a line of type is coherent")

	// Count. Three agreeing shapes is a coincidence; arm-b §2.4 says four.
	assert.equal(isCoherentRow(coherent, [0, 1, 2]), false)
	assert.equal(TEXT_MIN_COMPONENTS, 4)

	// Stroke width.
	const fatOne = coherent.map((component, index) => (index === 2 ? glyph(index, { strokeWidth: 30 }) : component))
	assert.equal(isCoherentRow(fatOne, [0, 1, 2, 3, 4]), false)

	// Height.
	const tallOne = coherent.map((component, index) => (index === 3 ? glyph(index, { height: 120 }) : component))
	assert.equal(isCoherentRow(tallOne, [0, 1, 2, 3, 4]), false)

	// Collinearity. A cloud spread over both axes, not a zigzag: alternating between two far-apart `y`
	// values is *read* as a near-vertical line with a small cross-residual, and correctly so — the
	// measurement is residual over the fit's own length, and it has no opinion about which way the line
	// points.
	const cloud: readonly (readonly [number, number])[] = [[10, 10], [100, 15], [20, 95], [95, 100], [55, 52]]
	const scattered = cloud.map(([x, y], index) => glyph(index, { centroidX: x, centroidY: y }))
	assert.equal(isCoherentRow(scattered, [0, 1, 2, 3, 4]), false)

	// A stroke that could not be measured is not a stroke that happens to be thin.
	const unmeasured = coherent.map((component, index) => (index === 1 ? glyph(index, { strokeWidth: 0 }) : component))
	assert.equal(isCoherentRow(unmeasured, [0, 1, 2, 3, 4]), false)
})

test("colour agreement is structural: two colours are two groups, never one", () => {
	const components = [
		...[0, 1, 2, 3].map((index) => glyph(index)),
		...[4, 5, 6, 7].map((index) => glyph(index, { clusterId: 1, repr: [230, 30, 30], centroidY: 120 })),
	]
	const groups = findTextGroups(components)
	assert.equal(groups.length, 2)
	assert.deepEqual(groups.map((group) => group.clusterId).sort(), [0, 1])
})

test("two lines of one colour are one group, and the group counts both rows", () => {
	const components = [
		...[0, 1, 2, 3].map((index) => glyph(index)),
		...[4, 5, 6, 7].map((index) => glyph(index, { centroidX: 15 + (index - 4) * 15, centroidY: 140 })),
	]
	const groups = findTextGroups(components)
	assert.equal(groups.length, 1, "the same colour must not compete with itself for the same role")
	assert.equal(groups[0].rows, 2)
	assert.equal(groups[0].members.length, 8)
})

test("the group publishes its largest coherent member's representative", () => {
	const components = [0, 1, 2, 3].map((index) =>
		glyph(index, index === 2 ? { areaFraction: 0.01, repr: [4, 4, 4] } : {}),
	)
	assert.deepEqual(findTextGroups(components)[0].repr, [4, 4, 4])
})

test("a synthetic line of glyph-like bars is found end to end, and leads the foreground", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-text-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const path = await writeBars(join(directory, "glyph-row.png"), 128, GLYPH_ROW)
	const { palette, parse } = await paletteWithDiagnostics(path)

	// One group per same-colour cluster: an antialiased stroke is a dark core inside a mid-grey halo,
	// and those are two colours by the contract's bar, so a clean render legitimately yields more than
	// one. What the test asserts is that the row *is* found and that its members are the six strokes.
	assert.ok(parse.textGroups.length >= 1, "six agreeing bars on one baseline are a text group")
	assert.equal(parse.textGroups[0].rows, 1)
	assert.ok(
		parse.textGroups[0].nodeIds.length >= TEXT_MIN_COMPONENTS,
		`the group has ${parse.textGroups[0].nodeIds.length} components`,
	)
	assert.deepEqual(
		palette.roles.foreground.rgb,
		parse.textGroups[0].repr,
		"the artwork's own text colour is the foreground's first candidate",
	)
	// And it is the ink, not the field: the whole point of the graft.
	assert.ok(palette.roles.foreground.rgb[0] < 64, `foreground ${palette.roles.foreground.hex} should be the ink`)
})

test("six marks that agree on nothing are not text", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-nontext-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const path = await writeBars(join(directory, "incoherent.png"), 128, INCOHERENT_MARKS)
	const { parse } = await paletteWithDiagnostics(path)
	assert.equal(parse.textGroups.length, 0, "count and colour alone must not make a text group")
	assert.ok(parse.notes.includes("no-text-groups:contrast-ranking-only"), "the parse says the detector found nothing")
})
