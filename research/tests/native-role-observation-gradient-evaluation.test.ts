import assert from "node:assert/strict"
import test from "node:test"
import {
	compareNativeRoleObservationGradientSpatial,
	parseNativeRoleObservationGradientArguments,
} from "../evaluate-native-role-observation-gradient.ts"
import type { Palette, RGB } from "../src/types.ts"

function palette(accent: RGB, gradient = false): Palette {
	const role = (rgb: RGB) => ({
		rgb,
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		generated: false,
		sourceDistance: 0,
	})
	return {
		background: role([0, 0, 0]),
		foreground: role([255, 255, 255]),
		surface: role([32, 32, 32]),
		accent: role(accent),
		gradient: { isGradient: gradient, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: 21,
			foregroundSurfaceContrast: 16,
			accentContrast: 2,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("evaluation arguments require a bounded development prefix", () => {
	assert.deepEqual(parseNativeRoleObservationGradientArguments(["--limit", "3"]), { limit: 3, write: false, publish: false })
	assert.deepEqual(parseNativeRoleObservationGradientArguments(["--limit", "37", "--write"]),
		{ limit: 37, write: true, publish: false })
	assert.deepEqual(parseNativeRoleObservationGradientArguments(["--limit", "37", "--publish"]),
		{ limit: 37, write: false, publish: true })
	assert.throws(() => parseNativeRoleObservationGradientArguments([]), /Usage/)
	assert.throws(() => parseNativeRoleObservationGradientArguments(["--limit", "0"]), /Usage|between/)
	assert.throws(() => parseNativeRoleObservationGradientArguments(["--limit", "38"]), /between/)
	assert.throws(() => parseNativeRoleObservationGradientArguments(["--limit", "3", "--write"]), /complete 37-source/)
	assert.throws(() => parseNativeRoleObservationGradientArguments(["--limit", "3", "--publish"]), /complete 37-source/)
})

test("comparison separates exact role, material role, and gradient evidence changes", () => {
	const baseline = palette([100, 100, 100])
	const nearby = compareNativeRoleObservationGradientSpatial(baseline, palette([101, 100, 100]))
	assert.deepEqual(nearby.exactChangedRoles, ["accent"])
	assert.deepEqual(nearby.materiallyChangedRoles, [])
	const material = compareNativeRoleObservationGradientSpatial(baseline, palette([220, 20, 20]))
	assert.deepEqual(material.materiallyChangedRoles, ["accent"])
	const gradient = compareNativeRoleObservationGradientSpatial(baseline, palette([100, 100, 100], true))
	assert.equal(gradient.gradientDecisionChanged, true)
	assert.equal(gradient.materiallyChanged, true)
})
