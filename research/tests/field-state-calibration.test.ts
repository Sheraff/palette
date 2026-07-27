import assert from "node:assert/strict"
import test from "node:test"
import {
	FIELD_STATE_CALIBRATION_FEATURES,
	fitFieldStateRanker,
	leaveOneSourceGroupOut,
	mapPaletteToFieldHypothesis,
	scoreFieldStateFeatures,
	type FieldStatePairwiseComparison,
} from "../src/field-state-calibration.ts"
import { buildNativeFieldHypothesisGraph } from "../src/native-field-hypothesis-graph.ts"
import type { RawImage, RGB } from "../src/types.ts"

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

test("field palettes map only through source-supported primary families", () => {
	const graph = buildNativeFieldHypothesisGraph(
		image(96, 64, (x) => x < 48 ? [18, 34, 74] : [226, 174, 92]),
		"0".repeat(64),
	)
	const families = graph.families.filter((family) => family.kind === "primary-field")
	assert.ok(families.length >= 2)
	const background = families[0].representatives[0].rgb
	const surface = families[1].representatives[0].rgb
	const mapped = mapPaletteToFieldHypothesis(graph, {
		background: { rgb: background, generated: false },
		surface: { rgb: surface, generated: false },
		gradient: { isGradient: false },
	})
	assert.equal(mapped.status, "mapped")
	if (mapped.status !== "mapped") return
	assert.equal(mapped.background.status, "exact-rgb")
	assert.equal(mapped.surface.status, "exact-rgb")
	assert.equal(mapped.hypothesis.state, "distinct-flat")
	assert.equal(mapped.features.length, FIELD_STATE_CALIBRATION_FEATURES.length)

	assert.deepEqual(mapPaletteToFieldHypothesis(graph, {
		background: { rgb: background, generated: true },
		surface: { rgb: surface, generated: false },
		gradient: { isGradient: false },
	}), { status: "generated-color", role: "background" })
})

function vector(primary: number, secondary = 0): number[] {
	return FIELD_STATE_CALIBRATION_FEATURES.map((_, index) => index === 2 ? primary : index === 6 ? secondary : 0)
}

function comparison(id: string, groupId: string, preferred: number, other: number): FieldStatePairwiseComparison {
	return { id, groupId, preferred: vector(preferred), other: vector(other) }
}

test("Bradley-Terry fitting is deterministic and source-group weighted", () => {
	const comparisons = [
		comparison("a-1", "a", 1, 0),
		comparison("a-2", "a", 0.9, 0.1),
		comparison("a-3", "a", 0.8, 0.2),
		comparison("b-1", "b", 0.7, 0.3),
		comparison("c-1", "c", 0.6, 0.4),
	]
	const first = fitFieldStateRanker(comparisons)
	const second = fitFieldStateRanker(comparisons)
	assert.deepEqual(second, first)
	assert.equal(first.converged, true)
	assert.ok(scoreFieldStateFeatures(first, vector(1)) > scoreFieldStateFeatures(first, vector(0)))
	assert.ok(first.coefficients[2] > 0)
})

test("leave-one-source-group-out predicts every held-out comparison exactly once", () => {
	const comparisons = [
		comparison("a-1", "a", 1, 0),
		comparison("b-1", "b", 0.9, 0.1),
		comparison("c-1", "c", 0.8, 0.2),
	]
	const predictions = leaveOneSourceGroupOut(comparisons)
	assert.deepEqual(predictions.map((entry) => entry.id), ["a-1", "b-1", "c-1"])
	assert.ok(predictions.every((entry) => entry.correct && Number.isFinite(entry.logLoss)))
	assert.throws(() => fitFieldStateRanker([...comparisons, comparisons[0]]), /Duplicate calibration comparison/)
})
