/**
 * **The indifference machinery, and the two facts about it that are easy to get wrong.**
 *
 * `../indifference.ts` exists because `stability/q1-dither/REPORT.md` attributes 82% of this
 * candidate's dither failures to a ranking naming a different node while both nodes' colours held. The
 * repair is arm-b′ §2.6's *"comparisons are made against the ruler"*, and it has two failure modes that
 * a passing palette would hide:
 *
 *  1. **it must be a total order.** The naive `|a − b| < ε ⇒ tie` comparator is a semiorder, not an
 *     equivalence; sorting on it is unspecified and its result depends on the input order, which is
 *     *worse* than the exact comparison it replaces. The class construction is asserted here to be
 *     order-invariant, which the semiorder is not.
 *  2. **it must not delete the level.** A band applied by single linkage chains through a dense
 *     population and collapses everything into one class. Leader linkage bounds a class at one band,
 *     and that bound is asserted rather than argued.
 *
 * The polarity rule (D10.2) is a pure function here for the same reason: constructing a real cover
 * whose two ramp ends project within 2.24% of each other is an image-synthesis problem, and what needs
 * testing is the decision, not the raster. The one *real* cover this file runs is round 3a's item 6,
 * because the brief's question about it — does the note flip under the new rule — is answerable only on
 * the artwork.
 */

import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import { colorFromRgb, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import { ROLE_NAMES } from "../../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { RENDER_AXIS_UNIT } from "../../constants.ts"
import { runChromaPipeline } from "../../lanes/pool.ts"
import {
	AREA_FRACTION_RELATIVE_INDIFFERENCE,
	NORMALISED_LENGTH_INDIFFERENCE,
	RAW_APCA_INDIFFERENCE,
	areaFractionBand,
	colorQuantityBand,
	indifferenceClasses,
	ramPolarityAIsBackground,
	roleMargins,
	stableCut,
} from "../indifference.ts"

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../../../..")

/** Round 3a item 6, `…d5fd547eb7f3` — the cover D10.2's polarity ruling was written about. */
const ITEM_6 = "02/ab67616d00001e020002fc520894d5fd547eb7f3.jpg"

// ---------------------------------------------------------------------------------------------
// The class construction
// ---------------------------------------------------------------------------------------------

const constantBand = (band: number) => () => band

test("a class spans strictly less than one band — leader linkage, not single linkage", () => {
	// A dense ladder: 200 values 0.001 apart, band 0.01. Single linkage would chain all 200 into one
	// class and delete the level; leader linkage must produce classes of at most ten members.
	const values = Array.from({ length: 200 }, (_unused, index) => index * 0.001)
	const classes = indifferenceClasses(values.length, (index) => values[index], constantBand(0.01))
	const members = new Map<number, number[]>()
	for (let index = 0; index < values.length; index += 1) {
		const bucket = members.get(classes[index])
		if (bucket === undefined) members.set(classes[index], [values[index]])
		else bucket.push(values[index])
	}
	assert.ok(members.size >= 20, `${members.size} classes over 200 values 0.001 apart at band 0.01 — the level collapsed`)
	for (const [classIndex, bucket] of members) {
		const span = Math.max(...bucket) - Math.min(...bucket)
		assert.ok(span < 0.01, `class ${classIndex} spans ${span}, which is not under the band`)
	}
})

test("the classes are a function of the values, not of the input order", () => {
	const values = [0.5, 0.503, 0.49, 0.2, 0.199, 0.9]
	const forward = indifferenceClasses(values.length, (index) => values[index], constantBand(0.01))
	// The same multiset, permuted. Class *numbers* must follow the values, so the value→class map agrees.
	const permutation = [5, 0, 3, 1, 4, 2]
	const permuted = permutation.map((index) => values[index])
	const backward = indifferenceClasses(permuted.length, (index) => permuted[index], constantBand(0.01))
	for (let index = 0; index < permutation.length; index += 1) {
		assert.equal(backward[index], forward[permutation[index]], `value ${permuted[index]} changed class under a permutation`)
	}
})

test("a difference under the band is indifferent and one over it is not", () => {
	const band = RAW_APCA_INDIFFERENCE
	const under = indifferenceClasses(2, (index) => (index === 0 ? 40 : 40 - band / 2), constantBand(band))
	assert.equal(under[0], under[1], "scores half a band apart must share a class")
	const over = indifferenceClasses(2, (index) => (index === 0 ? 40 : 40 - band * 1.01), constantBand(band))
	assert.notEqual(over[0], over[1], "scores over a band apart must not share a class")
})

test("two unplaceable candidates are indifferent to each other, and sort behind everything", () => {
	const values = [Number.NEGATIVE_INFINITY, 3, Number.NEGATIVE_INFINITY]
	const classes = indifferenceClasses(values.length, (index) => values[index], constantBand(1))
	assert.equal(classes[1], 0, "the finite candidate leads")
	assert.equal(classes[0], classes[2], "two −Infinity scores share a class")
	assert.ok(classes[0] > classes[1], "an unplaceable candidate does not lead a placeable one")
})

test("the colour band is the contract's regional bar for the pair, and nothing else", () => {
	const first: Rgb8 = [210, 80, 104]
	const second: Rgb8 = [17, 17, 17]
	assert.equal(colorQuantityBand(first, second), sameColorBar(colorFromRgb(first), colorFromRgb(second)))
})

test("the area band is relative and derived from the chain-collapse ratio", () => {
	// `1 − COMPONENT_CHAIN_AREA_AGREEMENT`: the smaller must cover that fraction of the larger.
	assert.equal(areaFractionBand(0.01, 0.008), AREA_FRACTION_RELATIVE_INDIFFERENCE * 0.01)
	const classes = indifferenceClasses(
		2,
		(index) => (index === 0 ? 0.01 : 0.0081),
		(leader, candidate) => areaFractionBand([0.01, 0.0081][leader], [0.01, 0.0081][candidate]),
	)
	assert.equal(classes[0], classes[1], "0.0081 is 81% of 0.01 and is indifferent from it")
	const apart = indifferenceClasses(
		2,
		(index) => (index === 0 ? 0.01 : 0.0079),
		(leader, candidate) => areaFractionBand([0.01, 0.0079][leader], [0.01, 0.0079][candidate]),
	)
	assert.notEqual(apart[0], apart[1], "0.0079 is under 80% of 0.01 and is distinguishable")
})

// ---------------------------------------------------------------------------------------------
// The truncation
// ---------------------------------------------------------------------------------------------

test("the cut extends through the class that straddles it, and stops at its boundary", () => {
	//         0    1    2    3    4    5    6
	const values = [9, 8.99, 8.98, 8.97, 1, 0.99, 0.5]
	const classes = indifferenceClasses(values.length, (index) => values[index], constantBand(0.05))
	const order = Array.from({ length: values.length }, (_unused, index) => index).sort(
		(first, second) => classes[first] - classes[second] || first - second,
	)
	// A limit of 2 lands inside the four-member leading class; the cut must take all four.
	const cut = stableCut(order, 2, (first, second) => classes[first] === classes[second])
	assert.equal(cut, 4, "the cut must not divide an indifference class")
	// A limit already at a boundary is not extended.
	assert.equal(stableCut(order, 4, (first, second) => classes[first] === classes[second]), 4)
	// A limit at or above the population is the population.
	assert.equal(stableCut(order, 99, () => true), values.length)
})

// ---------------------------------------------------------------------------------------------
// D10.2 — polarity
// ---------------------------------------------------------------------------------------------

test("the 135° projection keeps priority whenever it clears the band", () => {
	// The darker end projects smaller, so geometry says it is the background — and it stays the
	// background, because D10.2 is a tie-break level and not an override.
	const decision = ramPolarityAIsBackground({
		projectionA: 0.2,
		projectionB: 0.2 + NORMALISED_LENGTH_INDIFFERENCE * 1.01,
		reprA: [40, 40, 40],
		reprB: [250, 250, 250],
		areaFractionA: 1,
		areaFractionB: 0.5,
	})
	assert.equal(decision.decidedBy, "projection")
	assert.equal(decision.aIsBackground, true, "the smaller projection is stop 0")
})

test("inside the band, the lighter end becomes the background — D10.2", () => {
	const dark: Rgb8 = [100, 100, 100]
	const light: Rgb8 = [250, 250, 250]
	assert.ok(
		Math.abs(rgbToOkLab(light)[0] - rgbToOkLab(dark)[0]) >= colorQuantityBand(light, dark),
		"the fixture's two ends must differ in lightness beyond the bar, or the rule does not apply",
	)
	const decision = ramPolarityAIsBackground({
		projectionA: 0.2,
		projectionB: 0.2 + NORMALISED_LENGTH_INDIFFERENCE / 2,
		reprA: dark,
		reprB: light,
		areaFractionA: 1,
		areaFractionB: 0.5,
	})
	assert.equal(decision.decidedBy, "lightness")
	assert.equal(decision.aIsBackground, false, "the lighter end is the background once the projection is indifferent")
})

test("inside both bands, arm-b′'s declared chain still decides", () => {
	const decision = ramPolarityAIsBackground({
		projectionA: 0.2,
		projectionB: 0.2,
		reprA: [128, 128, 128],
		reprB: [129, 129, 129],
		areaFractionA: 1,
		areaFractionB: 0.5,
	})
	assert.equal(decision.decidedBy, "declared-chain")
	assert.equal(decision.aIsBackground, true, "larger area leads")
})

test("round 3a item 6: the projection decides clearly, so the note does NOT flip", async (context) => {
	const path = resolve(REPOSITORY_ROOT, ITEM_6)
	if (!existsSync(path)) {
		context.skip(`the corpus shard is missing: ${path}`)
		return
	}
	const { parse } = await runChromaPipeline(path)
	assert.equal(parse.verdict, "laminar", "item 6 publishes a ramp; if it stops doing so this test is measuring nothing")
	const ends = [parse.groundChain[0], parse.groundChain[parse.groundChain.length - 1]].map((id) => parse.nodes[id])
	const projections = ends.map((node) => node.centroidX * RENDER_AXIS_UNIT[0] + node.centroidY * RENDER_AXIS_UNIT[1])
	const gap = Math.abs(projections[0] - projections[1])

	// **The measurement the brief asked for.** D10.2 licenses a lightness tie-break *only* where the
	// projection is indifferent. Here the gap is ~0.0978 against a band of ~0.0224 — 4.4× — so level 1
	// decides, the darker end stays the background, and the reviewer's "background should be white" is
	// **not** satisfied by this rule. Recorded as an assertion so the finding cannot rot: the note needs a
	// different mechanism, and widening the band until it fires would be taste with a derivation stapled
	// to it.
	assert.ok(
		gap >= NORMALISED_LENGTH_INDIFFERENCE,
		`item 6's ramp ends project ${gap} apart, now inside the ${NORMALISED_LENGTH_INDIFFERENCE} band — the ` +
			"polarity finding recorded in indifference.ts and in the cycle-3 report has changed and must be re-read",
	)
	assert.ok(parse.notes.includes("ramp-polarity:projection"), "the parse must record which level decided")

	const darker = rgbToOkLab(ends[0].repr)[0] < rgbToOkLab(ends[1].repr)[0] ? ends[0] : ends[1]
	assert.equal(
		parse.roles.background,
		projections[0] < projections[1] ? ends[0].repr : ends[1].repr,
		"the smaller projection is the background",
	)
	assert.equal(parse.roles.background, darker.repr, "on item 6 that is the darker end — the reviewer asked for the lighter")
})

// ---------------------------------------------------------------------------------------------
// D7 — margins
// ---------------------------------------------------------------------------------------------

test("the margin report covers all six pairs, worst ratio first, against the pair's own bar", () => {
	const roles = {
		background: { rgb: [19, 25, 25] as Rgb8 },
		surface: { rgb: [24, 32, 35] as Rgb8 },
		foreground: { rgb: [255, 255, 255] as Rgb8 },
		accent: { rgb: [210, 80, 104] as Rgb8 },
	}
	const margins = roleMargins(roles, ROLE_NAMES)
	assert.equal(margins.length, 6, "four roles make six pairs")
	assert.deepEqual(
		margins.map((margin) => margin.pair).slice().sort(),
		["background|surface", "background|foreground", "background|accent", "surface|foreground", "surface|accent", "foreground|accent"].sort(),
	)
	for (let index = 1; index < margins.length; index += 1) {
		assert.ok(margins[index].ratio >= margins[index - 1].ratio, "margins are ordered worst first")
	}
	const worst = margins[0]
	assert.equal(worst.pair, "background|surface", "the round-3 margin probe's pair is the tightest here")
	// The literal D10.5 quotes: 0.0304 OKLab, and it survived contact with the reviewer.
	assert.ok(Math.abs(worst.distance - 0.0304) < 5e-4, `background/surface distance ${worst.distance}, expected ≈0.0304`)
	assert.equal(worst.bar, sameColorBar(colorFromRgb(roles.background.rgb), colorFromRgb(roles.surface.rgb)))
	assert.equal(worst.ratio, worst.distance / worst.bar)
})

test("the published palette carries its own margins, and they are the published colours'", async (context) => {
	const path = resolve(REPOSITORY_ROOT, ITEM_6)
	if (!existsSync(path)) {
		context.skip(`the corpus shard is missing: ${path}`)
		return
	}
	const diagnostics = await paletteWithDiagnostics(path)
	assert.equal(diagnostics.margins.length, 6)
	assert.deepEqual(diagnostics.margins, roleMargins(diagnostics.palette.roles, ROLE_NAMES))
	// Every pair the contract accepted as distinct must be at or over its bar; a sanctioned collapse is
	// exactly zero. Both are facts about the *published* palette, which is what D7 asks to be reported.
	for (const margin of diagnostics.margins) {
		assert.ok(margin.ratio === 0 || margin.ratio >= 1, `${margin.pair} publishes at ratio ${margin.ratio}`)
	}
})
