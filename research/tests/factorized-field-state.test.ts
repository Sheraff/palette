import assert from "node:assert/strict"
import test from "node:test"
import {
	FIELD_MULTIPLICITY_FEATURES,
	FIELD_PAIR_FEATURES,
	fieldMultiplicityFeatures,
	fieldPairFeatures,
	fitFactorizedRanker,
	leaveOneFactorizedSourceGroupOut,
	mapQueriedFieldPalette,
	scoreFactorizedFeatures,
} from "../src/factorized-field-state.ts"
import {
	buildNativeFieldHypothesisGraph,
	buildNativeFieldHypothesisGraphWithFamilyQueries,
	queryNativeFieldFamiliesAndTopology,
} from "../src/native-field-hypothesis-graph.ts"
import type { RawImage, RGB } from "../src/types.ts"

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

test("native family and topology queries do not mutate the frozen graph domain", () => {
	const source = image(96, 64, (x) => x < 48 ? [18, 34, 74] : [226, 174, 92])
	const sourceSha256 = "0".repeat(64)
	const ordinary = buildNativeFieldHypothesisGraph(source, sourceSha256)
	const queried = buildNativeFieldHypothesisGraphWithFamilyQueries(
		source,
		sourceSha256,
		[[18, 34, 74], [225, 174, 92]],
		[{ backgroundRgb: [18, 34, 74], surfaceRgb: [226, 174, 92] }],
	)
	assert.deepEqual(queried.graph, ordinary)
	assert.equal(queried.queries[0].status, "exact-rgb")
	assert.equal(queried.queries[1].status, "unique-nearest")
	assert.equal(queried.topologyQueries[0].status, "mapped")
	assert.equal(queried.topologyQueries[0].profiles.length, 3)
	assert.ok(queried.topologyQueries[0].observation224)
	const queryOnly = queryNativeFieldFamiliesAndTopology(
		source,
		sourceSha256,
		[[18, 34, 74], [225, 174, 92]],
		[{ backgroundRgb: [18, 34, 74], surfaceRgb: [226, 174, 92] }],
	)
	assert.deepEqual(queryOnly, {
		queryPolicy: queried.queryPolicy,
		queries: queried.queries,
		topologyQueries: queried.topologyQueries,
	})
})

test("flat and gradient aliases have exactly one state-free pair representation", () => {
	const source = image(96, 64, (x) => x < 48 ? [18, 34, 74] : [226, 174, 92])
	const result = buildNativeFieldHypothesisGraphWithFamilyQueries(
		source,
		"1".repeat(64),
		[[18, 34, 74], [226, 174, 92]],
	)
	const flat = mapQueriedFieldPalette(result.graph, result.queries, {
		background: { rgb: [18, 34, 74], generated: false },
		surface: { rgb: [226, 174, 92], generated: false },
		gradient: false,
	})
	const gradient = mapQueriedFieldPalette(result.graph, result.queries, {
		background: { rgb: [18, 34, 74], generated: false },
		surface: { rgb: [226, 174, 92], generated: false },
		gradient: true,
	})
	assert.equal(flat.status, "mapped")
	assert.equal(gradient.status, "mapped")
	if (flat.status !== "mapped" || gradient.status !== "mapped") return
	assert.notEqual(flat.hypothesis.stableKey, gradient.hypothesis.stableKey)
	assert.deepEqual(
		fieldPairFeatures(result.graph, flat.backgroundFamilyStableKey, flat.surfaceFamilyStableKey!),
		fieldPairFeatures(result.graph, gradient.backgroundFamilyStableKey, gradient.surfaceFamilyStableKey!),
	)
	assert.notDeepEqual(
		fieldMultiplicityFeatures(result.graph, flat.hypothesis),
		fieldMultiplicityFeatures(result.graph, result.graph.hypotheses.find((entry) => entry.state === "collapsed")!),
	)
})

function vector(size: number, value: number): number[] {
	return Array.from({ length: size }, (_, index) => index === 0 ? value : 0)
}

test("factorized fitting is deterministic and group-isolated", () => {
	const comparisons = [
		{ id: "a", groupId: "a", preferred: vector(FIELD_PAIR_FEATURES.length, 1), other: vector(FIELD_PAIR_FEATURES.length, 0) },
		{ id: "b", groupId: "b", preferred: vector(FIELD_PAIR_FEATURES.length, 0.9), other: vector(FIELD_PAIR_FEATURES.length, 0.1) },
		{ id: "c", groupId: "c", preferred: vector(FIELD_PAIR_FEATURES.length, 0.8), other: vector(FIELD_PAIR_FEATURES.length, 0.2) },
	]
	const first = fitFactorizedRanker(FIELD_PAIR_FEATURES, comparisons)
	assert.deepEqual(fitFactorizedRanker(FIELD_PAIR_FEATURES, comparisons), first)
	assert.equal(first.converged, true)
	assert.ok(scoreFactorizedFeatures(first, vector(FIELD_PAIR_FEATURES.length, 1)) >
		scoreFactorizedFeatures(first, vector(FIELD_PAIR_FEATURES.length, 0)))
	assert.ok(leaveOneFactorizedSourceGroupOut(FIELD_PAIR_FEATURES, comparisons).every((entry) => entry.correct))
	assert.equal(FIELD_MULTIPLICITY_FEATURES.length, FIELD_PAIR_FEATURES.length)
})
