import assert from "node:assert/strict"
import test from "node:test"
import {
	compareScaleAwareSpatial,
	parseScaleAwareNativeArguments,
} from "../evaluate-scale-aware-native-palette.ts"
import type { Palette, RGB } from "../src/types.ts"

function palette(rgb: RGB, gradient = false): Palette {
	const role = (color: RGB) => ({ rgb: color, hex: `#${color.map((value) => value.toString(16).padStart(2, "0")).join("")}`, generated: false, sourceDistance: 0 })
	return {
		background: role([0, 0, 0]),
		foreground: role([255, 255, 255]),
		surface: role([0, 0, 0]),
		accent: role(rgb),
		gradient: { isGradient: gradient, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 0,
		metrics: {
			foregroundContrast: 21,
			foregroundSurfaceContrast: 21,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("scale-aware evaluation arguments require a bounded development prefix", () => {
	assert.deepEqual(parseScaleAwareNativeArguments(["--limit", "3"]), { limit: 3, summaryOnly: false, publish: false })
	assert.deepEqual(parseScaleAwareNativeArguments(["--limit", "37", "--summary"]), { limit: 37, summaryOnly: true, publish: false })
	assert.deepEqual(parseScaleAwareNativeArguments(["--limit", "37", "--publish"]), { limit: 37, summaryOnly: false, publish: true })
	assert.throws(() => parseScaleAwareNativeArguments([]), /Usage/)
	assert.throws(() => parseScaleAwareNativeArguments(["--limit", "0"]), /Usage|between/)
	assert.throws(() => parseScaleAwareNativeArguments(["--limit", "38"]), /between/)
	assert.throws(() => parseScaleAwareNativeArguments(["--limit", "3", "--publish"]), /complete 37-source/)
})

test("spatial comparison separates exact drift, material movement, and gradient changes", () => {
	const baseline = palette([100, 100, 100])
	const nearby = compareScaleAwareSpatial(baseline, palette([101, 100, 100]))
	assert.equal(nearby.exactChanged, true)
	assert.equal(nearby.materiallyChanged, false)
	const material = compareScaleAwareSpatial(baseline, palette([220, 20, 20]))
	assert.equal(material.materiallyChanged, true)
	assert.deepEqual(material.materiallyChangedRoles, ["accent"])
	const gradient = compareScaleAwareSpatial(baseline, palette([100, 100, 100], true))
	assert.equal(gradient.materiallyChanged, true)
	assert.equal(gradient.gradientChanged, true)
})
