/**
 * Comparison semantics for the robustness harness.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/robustness-*.test.ts
 *
 * The claim under test is narrow and load-bearing: **"same palette" here means every role within
 * its regional same-colour bar, using the contract's own ruler and nothing else.** If this drifts,
 * every agreement rate the harness has ever reported changes meaning silently.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { makePalette } from "../src/contract/fixtures.ts"
import {
	POOLED_SAME_COLOR_BAR,
	SAME_COLOR_BAR_BY_REGION,
	colorDistance,
	colorFromHex,
	colorRegion,
	sameColorBar,
} from "../src/contract/index.ts"
import { DEFAULT_COMPARE_OPTIONS, comparePalettes, compareRolePair } from "../src/robustness/compare.ts"

const BASE = { background: "#101820", surface: "#1e2a38", foreground: "#f2f4f7", accent: "#e08a3c" }

test("identical palettes agree on every role, with zero distance", () => {
	const palette = makePalette(BASE)
	const result = comparePalettes(palette, palette)
	assert.equal(result.same, true)
	assert.deepEqual(result.disagreeingRoles, [])
	assert.equal(result.rolesCompared.length, 4)
	assert.equal(result.worstRoleBarRatio, 0)
	for (const comparison of result.comparisons) {
		assert.equal(comparison.distance, 0)
		assert.equal(comparison.same, true)
	}
})

test("a role moved far beyond its bar disagrees, and is named", () => {
	const left = makePalette(BASE)
	const right = makePalette({ ...BASE, accent: "#3ca0e0" })
	const result = comparePalettes(left, right)
	assert.equal(result.same, false)
	assert.deepEqual(result.disagreeingRoles, ["accent"])
	// The other three are untouched, so they must still agree.
	for (const comparison of result.comparisons) {
		assert.equal(comparison.same, comparison.role !== "accent")
	}
	assert.ok(result.worstRoleBarRatio !== null && result.worstRoleBarRatio > 1)
})

test("the bar is the contract's regional bar, not a local reimplementation", () => {
	const left = makePalette(BASE)
	const right = makePalette({ ...BASE, background: "#111921" })
	const result = comparePalettes(left, right)
	for (const comparison of result.comparisons) {
		const a = colorFromHex(comparison.left)
		const b = colorFromHex(comparison.right)
		assert.equal(comparison.bar, sameColorBar(a, b))
		assert.equal(comparison.distance, colorDistance(a, b))
		// The verdict is exactly `distance < bar` — strict, as the contract defines it.
		assert.equal(comparison.same, comparison.distance! < comparison.bar!)
	}
})

test("a straddling pair takes the LARGER of the two regional bars", () => {
	// A dark neutral against a light saturated colour: the two regions have different bars, and the
	// contract's rule is to take the larger. This is the case most likely to be got wrong.
	const dark = colorFromHex("#101820")
	const light = colorFromHex("#f0a0a0")
	assert.notEqual(colorRegion(dark), colorRegion(light))
	const expected = Math.max(
		SAME_COLOR_BAR_BY_REGION[colorRegion(dark)],
		SAME_COLOR_BAR_BY_REGION[colorRegion(light)],
	)
	const comparison = compareRolePair("background", dark, light, "regional")
	assert.equal(comparison.bar, expected)
})

test("comparison is symmetric in its verdict", () => {
	const left = makePalette(BASE)
	const right = makePalette({ ...BASE, surface: "#1e2a39", accent: "#e08a3d" })
	assert.equal(comparePalettes(left, right).same, comparePalettes(right, left).same)
	assert.equal(
		comparePalettes(left, right).worstRoleBarRatio,
		comparePalettes(right, left).worstRoleBarRatio,
	)
})

test("exact-hex mode measures no distance and reports no bar", () => {
	const left = makePalette(BASE)
	const right = makePalette({ ...BASE, background: "#101821" })
	const result = comparePalettes(left, right, { ...DEFAULT_COMPARE_OPTIONS, barMode: "exact-hex" })
	assert.equal(result.same, false)
	assert.deepEqual(result.disagreeingRoles, ["background"])
	assert.equal(result.worstRoleBarRatio, null)
	for (const comparison of result.comparisons) {
		assert.equal(comparison.distance, null)
		assert.equal(comparison.bar, null)
	}
})

test("pooled mode uses the pooled bar, which is not the gate's bar", () => {
	const comparison = compareRolePair(
		"background",
		colorFromHex("#101820"),
		colorFromHex("#111921"),
		"pooled",
	)
	assert.equal(comparison.bar, POOLED_SAME_COLOR_BAR)
})

test("fixed mode refuses a missing or nonsensical bar", () => {
	assert.throws(() => compareRolePair("background", colorFromHex("#000000"), colorFromHex("#ffffff"), "fixed"))
	assert.throws(() =>
		compareRolePair("background", colorFromHex("#000000"), colorFromHex("#ffffff"), "fixed", -1),
	)
})

test("collapse and gradient disagreement are reported but never fold into the verdict", () => {
	// Same four colours; one side collapsed its surface and emitted a gradient, the other did not.
	const left = makePalette(BASE)
	const right = {
		...makePalette(BASE),
		collapse: { surfaceCollapsed: true, accentCollapsed: false },
		gradient: makePalette({ ...BASE, stops: [["#101820", 0], ["#1e2a38", 1]] }).gradient,
	}
	const result = comparePalettes(left, right)
	assert.equal(result.same, true, "colour verdict is unchanged by collapse or gradient")
	assert.equal(result.collapseAgrees, false)
	assert.equal(result.gradientPresenceAgrees, false)
})

test("only the requested roles are compared", () => {
	const left = makePalette(BASE)
	const right = makePalette({ ...BASE, accent: "#3ca0e0" })
	const result = comparePalettes(left, right, { ...DEFAULT_COMPARE_OPTIONS, roles: ["background", "foreground"] })
	assert.equal(result.same, true, "the moved role was not in scope")
	assert.deepEqual([...result.rolesCompared], ["background", "foreground"])
	assert.equal(result.comparisons.length, 2)
})
