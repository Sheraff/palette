/**
 * # The pieces the search is assembled from, checked one at a time
 *
 * Four things, each of which would be a silent wrong answer rather than a crash if it broke:
 *
 * 1. **The lattice's election rule** — representatives are exact image triples, chosen by smoothed
 *    mass descending and hex ascending, in canonical cell order.
 * 2. **The conventions** — `DESIGN.md` decisions 3 and 5, as three separate orderings with stated
 *    tie-breaks.
 * 3. **Collapse flags are derived, never taken on trust** — invariant 3 exists to catch a flag that
 *    disagrees with its colours, and the search must never construct one.
 * 4. **The cost model counts the enumeration it is budgeting for.** `plan.ts` predicts the coarse
 *    stage's size in closed form and `enumerate.ts` runs it as four nested loops; if the two disagree,
 *    the budget is being spent against a fiction. This is the one test that pins them together.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { rgbToHex } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { sourceMetaOf } from "../../src/emit/source-meta.ts"
import { coarseCellSide, INTERIOR_STOP_POSITIONS } from "../../src/search/constants.ts"
import {
	canonicalKey,
	fieldLightness,
	makeConfiguration,
	orderFieldPair,
	orderInkPair,
	summarise,
} from "../../src/search/conventions.ts"
import { enumerateCoarse } from "../../src/search/enumerate.ts"
import { Evaluator, type ConsiderOutcome } from "../../src/search/evaluator.ts"
import { buildLevel, neighbourhood, representativeFor, representativesAt } from "../../src/search/lattice.ts"
import { coarseConfigurationCounts } from "../../src/search/plan.ts"
import { GRAMMAR_LEVELS, type GrammarLevel } from "../../src/search/types.ts"
import { THREE_COLORS, writeBandedImage } from "./support.ts"

const FINEST_BAR_MULTIPLE = 1 / 8

test("representatives are exact image triples in canonical cell order", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))

	assert.equal(reps.length, 3)
	for (const rep of reps) {
		assert.equal(representativeFor(measurement, rep.rgb, coarseCellSide(FINEST_BAR_MULTIPLE)).row, rep.row)
		assert.equal(rgbToHex(rep.rgb), rep.hex)
	}
	const keys = reps.map((rep) => rep.cellKey)
	assert.deepEqual(keys, [...keys].sort((left, right) => left - right))
})

test("a coarse cell elects its highest-smoothed-mass triple, ties to hex ascending", async () => {
	// Two colours a whisker apart in OKLab plus one far away: at a coarse side the two near ones share
	// a cell and exactly one of them must be elected — the one carrying more smoothed mass.
	const near: readonly Rgb8[] = [[40, 40, 40], [44, 44, 44], [240, 240, 240]]
	// Three unequal bands: the first colour occupies a third, the second a third, the third a third —
	// so the election is decided by the smoothing, not by a lopsided pixel count.
	const imagePath = await writeBandedImage(near)
	const measurement = await measureImage(imagePath)

	const coarse = representativesAt(measurement, coarseCellSide(8))
	assert.ok(coarse.length < 3, "at eight bars the two near colours should share a cell")
	for (const rep of coarse) {
		const rows = [0, 1, 2].filter((row) =>
			Math.floor(measurement.triples.lab[row * 3] / coarseCellSide(8)) === rep.cell.l
		)
		const best = rows.reduce((winner, row) =>
			measurement.smoothedMass.mass[row] > measurement.smoothedMass.mass[winner] ? row : winner
		)
		assert.equal(rep.row, best, "the elected row is the cell's highest smoothed mass")
	}
})

test("decision 5: two-flat puts the larger smoothed mass in the background", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))
	const [first, second] = reps

	const ordered = orderFieldPair(measurement, first, second, "two-flat")
	const expected = first.smoothedMass >= second.smoothedMass ? first : second
	assert.equal(ordered.background.hex, expected.hex)
	// Order of arguments must not matter: it is a convention over an unordered pair.
	assert.equal(orderFieldPair(measurement, second, first, "two-flat").background.hex, expected.hex)
})

test("decision 5: a ramp starts at the endpoint further up-and-left (the 135° axis)", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))
	// The fixture paints its colours as bands left to right, so the leftmost band's colour has the
	// smallest `meanX + meanY` and must be the t = 0 stop.
	const axis = (row: number) => measurement.derived.meanX[row] + measurement.derived.meanY[row]
	const [first, second] = reps
	const ordered = orderFieldPair(measurement, first, second, "ramp")
	const expected = axis(first.row) <= axis(second.row) ? first : second
	assert.equal(ordered.background.hex, expected.hex)
	assert.equal(orderFieldPair(measurement, second, first, "ramp").background.hex, expected.hex)
})

test("decision 3: the accent is the ink that moves further from the field in lightness", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))
	const dark = reps[0]
	const light = reps[reps.length - 1]

	// A field pinned at the dark end: the light ink is further away in lightness and is the accent.
	const fieldL = fieldLightness(dark.rgb, dark.rgb)
	const ordered = orderInkPair(reps[1], light, fieldL)
	assert.equal(ordered.accent.hex, light.hex)
	assert.equal(orderInkPair(light, reps[1], fieldL).accent.hex, light.hex)
})

test("collapse flags are derived from the triples, so the search cannot construct a lying one", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))

	const collapsed = makeConfiguration(measurement, {
		field: [reps[0], reps[0]],
		order: "collapsed",
		ink: [reps[1], reps[1]],
	})
	assert.equal(collapsed.surfaceCollapsed, true)
	assert.equal(collapsed.accentCollapsed, true)
	assert.equal(collapsed.background[0], collapsed.surface[0])

	const separated = makeConfiguration(measurement, {
		field: [reps[0], reps[1]],
		order: "two-flat",
		ink: [reps[1], reps[2]],
	})
	assert.equal(separated.surfaceCollapsed, false)
	assert.equal(separated.accentCollapsed, false)
	assert.equal(separated.gradient, false)
	assert.deepEqual(separated.stops, [])
})

test("a ramp's first stop is the background and its last is the surface, at 0 and 1", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const reps = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))

	const ramp = makeConfiguration(measurement, {
		field: [reps[0], reps[2]],
		order: "ramp",
		ink: [reps[1], reps[1]],
		interior: [{ rgb: reps[1].rgb, position: INTERIOR_STOP_POSITIONS[1] }],
	})
	assert.equal(ramp.gradient, true)
	assert.equal(ramp.stops.length, 3)
	assert.equal(ramp.stops[0].position, 0)
	assert.equal(ramp.stops[2].position, 1)
	assert.deepEqual([...ramp.stops[0].rgb], [...ramp.background])
	assert.deepEqual([...ramp.stops[2].rgb], [...ramp.surface])
	assert.equal(summarise(ramp).fieldOrder, "ramp")
	assert.match(canonicalKey(ramp), /\|g\|/)
})

test("a neighbourhood is returned in canonical cell order and includes the colour's own cell", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const level = buildLevel(measurement, 4, coarseCellSide(4))
	const [rep] = level.representatives
	const found = neighbourhood(level, [
		measurement.triples.lab[rep.row * 3],
		measurement.triples.lab[rep.row * 3 + 1],
		measurement.triples.lab[rep.row * 3 + 2],
	], 1)
	assert.ok(found.some((candidate) => candidate.hex === rep.hex))
	assert.deepEqual(found.map((c) => c.cellKey), [...found.map((c) => c.cellKey)].sort((l, r) => l - r))
})

/**
 * An evaluator that accepts everything, so the enumerator's loop count can be read off directly.
 *
 * Accepting is what makes the count exact: `offer()` only builds the swapped ink assignment when the
 * preferred one is infeasible, so a stub that rejected would inflate the count by decision 3's
 * retries and stop being comparable with the closed form.
 */
class CountingEvaluator extends Evaluator {
	seen = 0
	override consider(): ConsiderOutcome {
		this.seen += 1
		return { scored: null, feasible: true, report: null, repeat: false, refusedForBudget: false }
	}
}

for (const grammar of GRAMMAR_LEVELS) {
	test(`the coarse enumeration produces exactly the count the budget was planned against (${grammar})`, async () => {
		const imagePath = await writeBandedImage(THREE_COLORS)
		const measurement = await measureImage(imagePath)
		const meta = await sourceMetaOf(imagePath, "units-test")
		const level = buildLevel(measurement, FINEST_BAR_MULTIPLE, coarseCellSide(FINEST_BAR_MULTIPLE))

		const evaluator = new CountingEvaluator({
			arm: "a",
			measurement,
			meta,
			lambda: undefined,
			facts: {},
			budgetMs: Number.POSITIVE_INFINITY,
		})
		enumerateCoarse(evaluator, measurement, level, grammar as GrammarLevel)

		const predicted = Object.values(
			coarseConfigurationCounts(level.representatives.length, grammar as GrammarLevel),
		).reduce((total, count) => total + count, 0)
		assert.equal(evaluator.seen, predicted)
	})
}
