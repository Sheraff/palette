/**
 * The guide-stop doctrine, asserted in both directions.
 *
 * `DECISIONS.md` D6 says the dangerous error is **symmetric**: publishing a stop that meanders is one
 * failure, and publishing two stops whose straight line leaves the artwork is the other, and P2 could
 * previously not even detect the second. So every case below is paired — a ramp that owes a stop and
 * gets one, a ramp that owes nothing and is left untouched byte for byte, and each of the three ways
 * an owed stop is refused with its class named.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { colorFromRgb, okLabToRgb, rgbToHex, rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { GradientStop, Rgb8 } from "../../../../../src/contract/types.ts"
import { EXCURSION_BAR_MULTIPLE } from "../constants.ts"
import { measureExcursion } from "../excursion.ts"
import { type GuideCandidate, guideStop, preservesMonotoneOrder } from "../guide-stop.ts"
import { occupancyOf } from "../occupancy.ts"
import { BENT_FIRST, BENT_LAST, bentPath, pixelsOf, straightPath } from "./fixtures.ts"

function rampOf(first: Rgb8, last: Rgb8): [GradientStop, GradientStop] {
	return [
		{ color: colorFromRgb(first), position: 0 },
		{ color: colorFromRgb(last), position: 1 },
	]
}

/** Every eighth colour of the path, standing in for the ground chain's retained nodes. */
function chainOf(path: readonly Rgb8[]): GuideCandidate[] {
	const candidates: GuideCandidate[] = []
	for (let index = 0; index < path.length; index += 8) candidates.push({ nodeId: index, rgb: path[index] })
	return candidates
}

test("the artwork's own colours are found exactly, and a colour it lacks is not", () => {
	const path = bentPath()
	const occupancy = occupancyOf(pixelsOf(path))
	assert.equal(occupancy.count, new Set(path.map((rgb) => rgbToHex(rgb))).size)
	for (const colour of path) {
		const found = measureExcursion(rampOf(colour, colour), occupancy)
		assert.equal(found.maxBars, 0, `${rgbToHex(colour)} is a pixel of the fixture and must measure zero`)
	}
})

test("a three-colour ramp whose straight line leaves the artwork gains exactly one guide stop", () => {
	const path = bentPath()
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	const result = guideStop({ stops, occupancy, candidates: chainOf(path) })
	const report = result.report

	// The straight line demonstrably leaves the artwork — the one admissible reason for a third stop.
	assert.equal(report.owed, true)
	assert.ok(report.before.maxBars > EXCURSION_BAR_MULTIPLE, `before ${report.before.maxBars}`)
	assert.equal(report.inserted, true)
	assert.equal(report.refusal, "none")

	// One stop, not two, and the ends are untouched — the contract's endpoint ruling.
	assert.equal(result.stops.length, 3)
	assert.equal(result.stops[0].color.hex, colorFromRgb(BENT_FIRST).hex)
	assert.equal(result.stops[2].color.hex, colorFromRgb(BENT_LAST).hex)
	assert.equal(result.stops[0].position, 0)
	assert.equal(result.stops[2].position, 1)

	// The excursion falls, and by more than the rule required.
	assert.ok(report.after !== null)
	assert.ok(report.after.maxBars < report.before.maxBars)
	assert.ok((report.actualFallBars ?? 0) >= report.requiredFallBars)
	assert.equal(report.after.overBar, false, "the guide stop pulls the ramp back onto the artwork")

	// The inserted colour is an exact pixel of the artwork, drawn from the ramp's own chain.
	const stop = report.stop
	assert.ok(stop !== null)
	assert.ok(path.some((rgb) => rgbToHex(rgb) === stop.hex), "the stop must be an exact artwork triple")
	assert.ok(chainOf(path).some((candidate) => candidate.nodeId === stop.nodeId))

	// D5's precondition, asserted on the published ramp rather than only inside the implementation.
	assert.equal(preservesMonotoneOrder(BENT_FIRST, result.stops[1].color.rgb, BENT_LAST), true)

	// D4's spacing, in the units the rule is stated in, and the positional spacing D4's 3.1% is about.
	assert.ok(stop.stepFromFirst > 0 && stop.stepToLast > 0)
	assert.ok(stop.positionSpacing > 0 && stop.positionSpacing <= 0.5)
})

test("a two-colour ramp that stays on the artwork is left byte-identical", () => {
	const path = straightPath(BENT_FIRST, BENT_LAST)
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	const result = guideStop({ stops, occupancy, candidates: chainOf(path) })

	assert.equal(result.report.owed, false)
	assert.equal(result.report.inserted, false)
	assert.equal(result.report.refusal, "not-owed")
	assert.equal(result.report.after, null, "nothing is even attempted on a ramp that owes nothing")
	assert.ok(result.report.before.maxBars <= EXCURSION_BAR_MULTIPLE)

	// The published ramp is unchanged, stop for stop, position for position.
	assert.equal(result.stops.length, 2)
	assert.deepEqual(
		result.stops.map((stop) => [stop.color.hex, stop.position]),
		stops.map((stop) => [stop.color.hex, stop.position]),
	)
})

test("an owed stop inside one same-colour bar of an endpoint is refused, with its class named", () => {
	const path = bentPath()
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	// The chain offers one interior colour only, two steps along from the background end — a distinct
	// triple, but not a distinct *colour* by the contract's ruler.
	const result = guideStop({ stops, occupancy, candidates: [{ nodeId: 2, rgb: path[2] }] })

	assert.equal(result.report.owed, true)
	assert.equal(result.report.inserted, false)
	assert.equal(result.report.refusal, "spacing-below-bar")
	assert.equal(result.stops.length, 2)
	assert.equal(result.report.after, null, "a refused stop is never measured as if it had published")
})

test("an owed stop that would reverse the ramp's colour order is refused as a meander", () => {
	const beyond: Rgb8 = [8, 12, 70]
	const path = [...bentPath(), beyond]
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	const result = guideStop({ stops, occupancy, candidates: [{ nodeId: 900, rgb: beyond }] })

	assert.equal(preservesMonotoneOrder(BENT_FIRST, beyond, BENT_LAST), false)
	assert.equal(result.report.owed, true)
	assert.equal(result.report.inserted, false)
	assert.equal(result.report.refusal, "meander")
	assert.equal(result.stops.length, 2)
})

test("an owed stop that does not buy the required fall is inserted, measured, and reverted", () => {
	const path = bentPath()
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	// Four steps along: past the spacing floor, but far from the bend that causes the excursion.
	const result = guideStop({ stops, occupancy, candidates: [{ nodeId: 4, rgb: path[4] }] })

	assert.equal(result.report.owed, true)
	assert.equal(result.report.inserted, false)
	assert.equal(result.report.refusal, "excursion-not-materially-reduced")
	assert.ok(result.report.after !== null, "the revert is a measurement, not a guess")
	assert.ok((result.report.actualFallBars ?? 0) > 0, "the stop helped a little")
	assert.ok((result.report.actualFallBars ?? 0) < result.report.requiredFallBars, "but not materially")
	assert.equal(result.stops.length, 2)
})

test("a ramp whose chain offers no interior colour is refused rather than invented around", () => {
	const path = bentPath()
	const occupancy = occupancyOf(pixelsOf(path))
	const stops = rampOf(BENT_FIRST, BENT_LAST)
	const result = guideStop({
		stops,
		occupancy,
		candidates: [{ nodeId: 0, rgb: BENT_FIRST }, { nodeId: 1, rgb: BENT_LAST }],
	})

	assert.equal(result.report.owed, true)
	assert.equal(result.report.candidates, 0)
	assert.equal(result.report.refusal, "no-candidate")
	assert.equal(result.stops.length, 2)
})

test("the monotone test accepts an interior colour and refuses both reversals", () => {
	const path = bentPath()
	const middle = path[Math.floor(path.length / 2)]
	assert.equal(preservesMonotoneOrder(BENT_FIRST, middle, BENT_LAST), true)
	assert.equal(preservesMonotoneOrder(BENT_FIRST, BENT_FIRST, BENT_LAST), false)
	assert.equal(preservesMonotoneOrder(BENT_FIRST, BENT_LAST, BENT_LAST), false)
	// A colour past the far end — the axis itself, overshot — projects beyond the last stop and is a
	// reversal of the second segment. Built from the axis so the claim is exact rather than eyeballed.
	const firstLab = rgbToOkLab(BENT_FIRST)
	const lastLab = rgbToOkLab(BENT_LAST)
	const overshot = okLabToRgb([
		firstLab[0] + (lastLab[0] - firstLab[0]) * 1.05,
		firstLab[1] + (lastLab[1] - firstLab[1]) * 1.05,
		firstLab[2] + (lastLab[2] - firstLab[2]) * 1.05,
	])
	assert.equal(preservesMonotoneOrder(BENT_FIRST, overshot, BENT_LAST), false)
})
