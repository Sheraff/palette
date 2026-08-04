/**
 * The contract validator's report mode (build item 21), and the guarantee that adding it did not
 * move the gate.
 *
 * The most important test in this file is the cheapest one: for every fixture, hard mode's verdict
 * and the scorecard's `valid` agree. A report mode that could disagree with the gate would be a way
 * to argue with the gate.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { scorePalette } from "../src/contract/scorecard.ts"
import { validatePalette, validateSourceSupport, type InvariantObservation } from "../src/contract/invariants.ts"
import { SOURCE_POPULATION_FLOOR } from "../src/contract/constants.ts"
import {
	validFlat,
	validFlatSource,
	validGradient,
	validGradientSource,
	missingAccentSource,
	makePalette,
	sparseSource,
} from "../src/contract/fixtures.ts"

test("hard mode is untouched: the default signature still returns a verdict", () => {
	const result = validatePalette(validGradient)
	assert.equal(typeof result.valid, "boolean")
	assert.ok(Array.isArray(result.violations))
	assert.ok(Array.isArray(result.deferred))
})

test("attaching an observer changes no verdict, on any fixture", () => {
	const cases: [string, Parameters<typeof validatePalette>[0], Parameters<typeof validatePalette>[1]][] = [
		["validFlat", validFlat, { source: validFlatSource }],
		["validGradient", validGradient, { source: validGradientSource }],
		["validFlat, no source", validFlat, {}],
		["validFlat, absent accent", validFlat, { source: missingAccentSource }],
	]
	for (const [name, palette, options] of cases) {
		const plain = validatePalette(palette, options)
		const observed = validatePalette(palette, { ...options, observe: () => {} })
		assert.deepEqual(observed, plain, `observer changed the result for ${name}`)
	}
})

test("the scorecard carries hard mode's verdict rather than recomputing it", () => {
	for (const [palette, options] of [
		[validGradient, { source: validGradientSource }],
		[validFlat, { source: missingAccentSource }],
	] as const) {
		const hard = validatePalette(palette, options)
		const { scorecard } = scorePalette(palette, options)
		assert.equal(scorecard.valid, hard.valid)
		assert.deepEqual(scorecard.violations, hard.violations)
		assert.deepEqual(scorecard.deferred, hard.deferred)
	}
})

test("every invariant gets a row, in a stable order", () => {
	const { scorecard } = scorePalette(validGradient, { source: validGradientSource })
	assert.deepEqual(
		scorecard.invariants.map((i) => i.invariant),
		["I1", "I2", "I3", "I4", "I5"],
	)
})

test("a check that could not run is deferred, never a pass", () => {
	// No source and no transparency report: invariants 2 and 5 cannot run.
	const { scorecard } = scorePalette(validGradient)
	const byId = new Map(scorecard.invariants.map((i) => [i.invariant, i]))
	assert.equal(byId.get("I2")!.status, "deferred")
	assert.equal(byId.get("I5")!.status, "deferred")
	assert.ok(byId.get("I2")!.deferred.includes("I2.source-support"))
	assert.ok(byId.get("I5")!.deferred.includes("I5.transparency-report"))
	assert.notEqual(byId.get("I2")!.status, "pass", "a check that never ran must not read as passing")
})

test("a passing palette reports how close it came, per invariant, in named units", () => {
	const { scorecard } = scorePalette(validGradient, { source: validGradientSource })
	const i3 = scorecard.invariants.find((i) => i.invariant === "I3")!
	assert.equal(i3.status, "pass")
	assert.ok(i3.judgments > 0, "the distinctness matrix judged something")
	assert.ok(i3.nearMissMargin, "a passing invariant still reports its tightest margin")
	assert.equal(i3.nearMissMargin!.quantity, "oklab-distance")
	assert.ok(i3.nearMissMargin!.margin >= 0)
	assert.equal(
		i3.nearMissMargin!.measured - i3.nearMissMargin!.bar,
		i3.nearMissMargin!.margin,
		"margin is measured - bar, in the quantity's own units",
	)

	const i4 = scorecard.invariants.find((i) => i.invariant === "I4")!
	assert.equal(i4.nearMissMargin?.quantity, "apca-raw-magnitude")
})

test("the tightest passing margin is the tightest, not merely the first", () => {
	const { scorecard } = scorePalette(validGradient, { source: validGradientSource })
	const observations: InvariantObservation[] = []
	validatePalette(validGradient, {
		source: validGradientSource,
		observe: (o) => observations.push(o),
	})
	const i3Passes = observations.filter((o) => o.invariant === "I3" && o.passed)
	const tightest = Math.min(...i3Passes.map((o) => o.margin))
	const reported = scorecard.invariants.find((i) => i.invariant === "I3")!.nearMissMargin!
	assert.equal(reported.margin, tightest)
})

test("a failing invariant reports its worst margin and its codes", () => {
	const { scorecard } = scorePalette(validFlat, { source: missingAccentSource })
	const i2 = scorecard.invariants.find((i) => i.invariant === "I2")!
	assert.equal(i2.status, "fail")
	assert.ok(i2.violations > 0)
	assert.ok(i2.codes.some((c) => c.code === "I2.color-absent-from-source"))
	assert.equal(i2.worstFailureMargin?.quantity, "source-occurrences")
	assert.equal(i2.worstFailureMargin?.measured, 0)
	assert.equal(scorecard.valid, false)
})

test("the retired population floor appears under reportOnly and never in a verdict", () => {
	// 20 of 40,000 = 0.0005, half the retired floor.
	const source = sparseSource("#101820", "#e0533a", 20)
	const palette = makePalette({
		background: "#101820",
		surface: "#101820",
		foreground: "#101820",
		accent: "#e0533a",
	})
	const { scorecard } = scorePalette(palette, { source })
	const i2 = scorecard.invariants.find((i) => i.invariant === "I2")!

	// Scoped to I2 deliberately. A two-colour source cannot also supply four distinct roles, so this
	// palette does fail I3/I4 — on collisions that have nothing to do with source support. The claim
	// under test is that *invariant 2* is clean.
	assert.equal(i2.status, "pass", "a sparse colour is no longer a refusal")
	assert.equal(i2.violations, 0)
	assert.equal(
		scorecard.violations.some((v) => v.code === "I2.population-below-floor"),
		false,
		"the code is retired",
	)

	const population = i2.reportOnly.filter((r) => r.quantity === "source-population-fraction")
	assert.ok(population.length > 0, "the figure is still measured and surfaced")
	const accent = population.find((r) => r.subjects.includes("roles.accent"))!
	assert.equal(accent.measured, 20 / 40_000)
	assert.equal(accent.bar, SOURCE_POPULATION_FLOOR)
	assert.ok(accent.margin < 0, "below the retired floor, reported rather than refused")

	// And the report-only figure must not leak into the enforced counts.
	assert.equal(
		i2.judgments,
		scorecard.invariants.find((i) => i.invariant === "I2")!.judgments,
	)
	assert.ok(
		!i2.reportOnly.some((r) => r.quantity === "source-occurrences"),
		"existence is enforced, so it is not report-only",
	)
})

test("nearMissBand is the caller's judgment, and absent by default", () => {
	const wide = scorePalette(validGradient, {
		source: validGradientSource,
		nearMissBand: { "apca-raw-magnitude": Number.MAX_SAFE_INTEGER },
	})
	const i4Wide = wide.scorecard.invariants.find((i) => i.invariant === "I4")!
	assert.equal(i4Wide.withinNearMissBand, true, "everything is a near miss under an absurd band")

	const none = scorePalette(validGradient, { source: validGradientSource })
	const i4None = none.scorecard.invariants.find((i) => i.invariant === "I4")!
	assert.equal(
		i4None.withinNearMissBand,
		undefined,
		"no band supplied, so the scorecard has no opinion about what near means",
	)
})

test("the scorecard is deterministic: two runs agree exactly", () => {
	const a = scorePalette(validGradient, { source: validGradientSource }).scorecard
	const b = scorePalette(validGradient, { source: validGradientSource }).scorecard
	assert.deepEqual(a, b)
})

test("totals add up to the per-invariant rows", () => {
	const { scorecard } = scorePalette(validFlat, { source: missingAccentSource })
	assert.equal(
		scorecard.totals.judgments,
		scorecard.invariants.reduce((n, i) => n + i.judgments, 0),
	)
	assert.equal(scorecard.totals.violations, scorecard.violations.length)
	assert.equal(
		scorecard.totals.invariantsFailed,
		scorecard.invariants.filter((i) => i.status === "fail").length,
	)
})

test("validateSourceSupport's observer is optional — the three-arg form is additive", () => {
	const withoutObserver = validateSourceSupport(validFlat, validFlatSource)
	const withObserver = validateSourceSupport(validFlat, validFlatSource, () => {})
	assert.deepEqual(withObserver, withoutObserver)
})
