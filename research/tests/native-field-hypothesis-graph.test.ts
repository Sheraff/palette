import assert from "node:assert/strict"
import test from "node:test"
import {
	buildNativeFieldHypothesisGraph,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	NATIVE_FIELD_HYPOTHESIS_MAXIMUM_REPRESENTATIVES,
} from "../src/native-field-hypothesis-graph.ts"
import type { RawImage, RGB } from "../src/types.ts"

const sourceSha256 = "0".repeat(64)

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

test("uniform source produces one complete collapsed-only graph", () => {
	const source = image(48, 32, () => [25, 35, 45])
	const graph = buildNativeFieldHypothesisGraph(source, sourceSha256)

	assert.equal(graph.version, NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION)
	assert.equal(graph.certificate.counts.primaryFieldFamilies, 1)
	assert.equal(graph.certificate.counts.orderedRelations, 0)
	assert.equal(graph.certificate.counts.totalHypotheses, 1)
	assert.equal(graph.hypotheses[0].state, "collapsed")
	assert.equal("palette" in graph, false)
	assert.equal(Object.isFrozen(graph), true)
})

test("hard two-field split enumerates every ordered flat and gradient state", () => {
	const source = image(96, 64, (x) => x < 48 ? [18, 34, 74] : [226, 174, 92])
	const graph = buildNativeFieldHypothesisGraph(source, sourceSha256)
	const fields = graph.certificate.counts.primaryFieldFamilies
	const ordered = fields * (fields - 1)

	assert.ok(fields >= 2)
	assert.equal(graph.relations.length, ordered)
	assert.equal(graph.certificate.counts.collapsedHypotheses, fields)
	assert.equal(graph.certificate.counts.distinctFlatHypotheses, ordered)
	assert.equal(graph.certificate.counts.gradientHypotheses, ordered)
	assert.ok(graph.relations.some((relation) =>
		relation.scale.distinctFlatSupport.mean > relation.scale.gradientSupport.mean))
	assert.ok(graph.relations.every((relation) => relation.profiles.length === 3))
})

test("broad progression exposes a gradient-supported ordered relation", () => {
	const source = image(96, 64, (x) => {
		const amount = x / 95
		return [
			Math.round(18 + (226 - 18) * amount),
			Math.round(34 + (174 - 34) * amount),
			Math.round(74 + (92 - 74) * amount),
		]
	})
	const graph = buildNativeFieldHypothesisGraph(source, sourceSha256)
	const strongest = [...graph.relations].sort((first, second) =>
		second.scale.gradientSupport.mean - first.scale.gradientSupport.mean)[0]

	assert.ok(strongest)
	assert.ok(strongest.scale.gradientSupport.mean > strongest.scale.distinctFlatSupport.mean)
	assert.ok(strongest.scale.stateCounts.gradient >= 2)
})

test("representative frontiers are bounded, deterministic, and exact native pixels", () => {
	const source = image(120, 80, (x, y) => {
		if (x > 35 && x < 85 && y > 20 && y < 60) return [220, 45 + y, 120 + x % 30]
		return x < 60 ? [20, 30, 55] : [170, 145, 105]
	})
	const first = buildNativeFieldHypothesisGraph(source, sourceSha256)
	const second = buildNativeFieldHypothesisGraph(source, sourceSha256)

	assert.deepEqual(second, first)
	for (const family of first.families) {
		assert.ok(family.representatives.length <= NATIVE_FIELD_HYPOTHESIS_MAXIMUM_REPRESENTATIVES)
		for (const representative of family.representatives) {
			const offset = representative.representativePixelIndex * 3
			assert.deepEqual(representative.rgb, [...source.data.subarray(offset, offset + 3)])
			assert.ok(representative.selectedBy.length >= 1)
		}
	}
	assert.ok(first.families.filter((family) => family.kind === "connected-overlay")
		.every((family) => family.representatives.every((representative) => !representative.fieldRoleAllowed)))
})

test("area observation profiles preserve bounds and projected partitions", () => {
	const source = image(512, 256, (x) => x < 256 ? [12, 24, 48] : [180, 130, 80])
	const graph = buildNativeFieldHypothesisGraph(source, sourceSha256)

	assert.deepEqual(graph.profiles.map(({ maxEdge, width, height }) => ({ maxEdge, width, height })), [
		{ maxEdge: 448, width: 448, height: 224 },
		{ maxEdge: 224, width: 224, height: 112 },
		{ maxEdge: 112, width: 112, height: 56 },
	])
	assert.equal(Object.keys(graph.certificate.partitions.profilePrimaryPartitionSha256).length, 3)
	assert.equal(graph.certificate.invariants.projectedPrimaryPartitions, true)
})
