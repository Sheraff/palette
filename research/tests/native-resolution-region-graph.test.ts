import assert from "node:assert/strict"
import test from "node:test"
import {
	compareNativeResolutionExtractions,
	parseNativeResolutionArguments,
} from "../evaluate-native-resolution-region-graph.ts"
import type { ExtractionResult, Palette, RGB } from "../src/types.ts"

function role(rgb: RGB) {
	return { rgb, hex: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`, generated: false, sourceDistance: 0 }
}

function palette(accent: RGB, gradient = false): Palette {
	return {
		background: role([0, 0, 0]),
		foreground: role([255, 255, 255]),
		surface: role([32, 32, 32]),
		accent: role(accent),
		gradient: { isGradient: gradient, confidence: 0, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: 21,
			foregroundSurfaceContrast: 16,
			accentContrast: 3,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function extraction(accent: RGB, candidates: readonly RGB[], gradient = false): ExtractionResult {
	const value = palette(accent, gradient)
	return {
		version: "test",
		width: 10,
		height: 10,
		methods: { spatial: value, expressive: value, quantized: value },
		candidates: candidates.map((rgb) => ({
			rgb,
			hex: role(rgb).hex,
			population: 0.5,
			background: 0,
			saliency: 0,
			text: 0,
			chroma: 0,
		})),
		diagnostics: { regionCount: 1, candidateCount: candidates.length, processingMs: 0 },
	}
}

test("arguments require one bounded development prefix", () => {
	assert.deepEqual(parseNativeResolutionArguments(["--limit", "3"]), { limit: 3, summaryOnly: false, publish: false })
	assert.deepEqual(parseNativeResolutionArguments(["--limit", "3", "--summary"]), { limit: 3, summaryOnly: true, publish: false })
	assert.deepEqual(parseNativeResolutionArguments(["--limit", "37", "--publish"]), { limit: 37, summaryOnly: false, publish: true })
	assert.throws(() => parseNativeResolutionArguments([]), /Usage/)
	assert.throws(() => parseNativeResolutionArguments(["--limit", "0"]), /Usage|between/)
	assert.throws(() => parseNativeResolutionArguments(["--limit", "38"]), /between/)
	assert.throws(() => parseNativeResolutionArguments(["--limit", "3", "--publish"]), /complete 37-source/)
	assert.throws(() => parseNativeResolutionArguments(["--limit", "3", "--other"]), /Usage/)
})

test("comparison reports exact role, gradient, and candidate multiset changes", () => {
	const baseline = extraction([255, 255, 255], [[0, 0, 0], [255, 255, 255]])
	const treatment = extraction([200, 20, 10], [[0, 0, 0], [200, 20, 10]], true)
	const comparison = compareNativeResolutionExtractions(baseline, treatment)
	assert.equal(comparison.visibleChanged, true)
	assert.equal(comparison.materiallyChanged, true)
	assert.equal(comparison.semanticChanged, true)
	assert.deepEqual(comparison.changedRoles, ["spatial.accent", "expressive.accent", "quantized.accent"])
	assert.deepEqual(comparison.materiallyChangedRoles, ["spatial.accent", "expressive.accent", "quantized.accent"])
	assert.deepEqual(comparison.changedGradients, ["spatial", "expressive", "quantized"])
	assert.deepEqual(comparison.removedCandidates, ["255,255,255|#ffffff"])
	assert.deepEqual(comparison.addedCandidates, ["200,20,10|#c8140a"])
	assert.deepEqual(comparison.materiallyRemovedCandidates, ["255,255,255|#ffffff"])
	assert.deepEqual(comparison.materiallyAddedCandidates, ["200,20,10|#c8140a"])
})

test("comparison preserves exact ties and duplicate candidate multiplicity", () => {
	const baseline = extraction([20, 30, 40], [[20, 30, 40], [20, 30, 40]])
	const treatment = extraction([20, 30, 40], [[20, 30, 40]])
	const comparison = compareNativeResolutionExtractions(baseline, treatment)
	assert.equal(comparison.visibleChanged, false)
	assert.equal(comparison.materiallyChanged, false)
	assert.equal(comparison.semanticChanged, false)
	assert.deepEqual(comparison.removedCandidates, ["20,30,40|#141e28"])
	assert.deepEqual(comparison.addedCandidates, [])
	assert.deepEqual(comparison.materiallyRemovedCandidates, ["20,30,40|#141e28"])
	assert.deepEqual(comparison.materiallyAddedCandidates, [])
})

test("comparison separates nearby representative drift from material role changes", () => {
	const baseline = extraction([100, 100, 100], [[100, 100, 100]])
	const treatment = extraction([102, 101, 100], [[102, 101, 100]])
	const comparison = compareNativeResolutionExtractions(baseline, treatment)
	assert.equal(comparison.visibleChanged, true)
	assert.equal(comparison.materiallyChanged, false)
	assert.deepEqual(comparison.materiallyChangedRoles, [])
	assert.deepEqual(comparison.materiallyRemovedCandidates, [])
	assert.deepEqual(comparison.materiallyAddedCandidates, [])
})

test("material candidate matching preserves multiplicity", () => {
	const baseline = extraction([100, 100, 100], [[100, 100, 100], [101, 101, 101]])
	const treatment = extraction([100, 100, 100], [[100, 100, 100]])
	const comparison = compareNativeResolutionExtractions(baseline, treatment)
	assert.equal(comparison.materiallyRemovedCandidates.length, 1)
	assert.deepEqual(comparison.materiallyAddedCandidates, [])
})
