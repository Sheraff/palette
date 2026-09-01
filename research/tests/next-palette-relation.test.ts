import assert from "node:assert/strict"
import test from "node:test"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import {
	extractNextPaletteRelationWithContext,
	NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
	NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
	NEXT_PALETTE_RELATION_IDENTITY,
	solveNextPaletteRelation,
} from "../src/next-palette-relation.ts"
import { buildPaletteRelationGraph, type PaletteRelationGraph } from "../src/palette-relation-graph.ts"
import { perceivePaletteImage } from "../src/palette-perception.ts"
import type { RawImage, RGB } from "../src/types.ts"

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function fixture(): RawImage {
	const colors: RGB[] = [
		[238, 235, 222],
		[202, 186, 152],
		[21, 28, 40],
		[185, 43, 76],
	]
	return image(16, 16, (x, y) => colors[(Math.floor(x / 4) + Math.floor(y / 4)) % colors.length])
}

function permuteGraph(graph: PaletteRelationGraph): PaletteRelationGraph {
	return {
		...graph,
		nodes: [...graph.nodes].reverse(),
		edges: [...graph.edges].reverse(),
		fieldNodeIds: [...graph.fieldNodeIds].reverse(),
	}
}

test("relation graph excludes detail-dominated nodes from field topology", () => {
	const graph = buildPaletteRelationGraph(perceivePaletteImage(fixture()))
	const fields = new Set(graph.fieldNodeIds)

	assert.ok(graph.nodes.some((node) => node.fieldEligibility.eligible))
	assert.ok(graph.nodes.some((node) => !node.fieldEligibility.eligible))
	assert.ok(graph.nodes.every((node) => fields.has(node.id) === node.fieldEligibility.eligible))
	assert.equal(graph.edges.length, graph.nodes.length * (graph.nodes.length - 1))
	assert.equal(graph.edges.filter((edge) => edge.fieldRelation).length, fields.size * (fields.size - 1))
	assert.ok(graph.edges.filter((edge) => edge.fieldRelation).every((edge) =>
		fields.has(edge.fromId) && fields.has(edge.toId)))
})

test("complete relation inference is deterministic, constrained, and recomputable", () => {
	const graph = buildPaletteRelationGraph(perceivePaletteImage(fixture()))
	const first = solveNextPaletteRelation(graph)
	const second = solveNextPaletteRelation(permuteGraph(graph))
	const { certificate, palette } = first

	assert.deepEqual(first, second)
	assert.equal(certificate.algorithmVersion, NEXT_PALETTE_RELATION_ALGORITHM_VERSION)
	assert.equal(certificate.identity, NEXT_PALETTE_RELATION_IDENTITY)
	assert.equal(certificate.counts.completeDomain, certificate.counts.attempted)
	assert.equal(
		Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0) +
			certificate.counts.feasible,
		certificate.counts.attempted,
	)
	assert.equal(
		certificate.counts.fieldPairsWithPassingSourceForeground +
			certificate.counts.fieldPairsWithGeneratedForegroundAuthorization,
		certificate.counts.fieldPairs,
	)
	assert.equal(certificate.selected.objectives.length, 5)
	const deficits = certificate.selected.objectives.map((objective) => 1 - objective)
	assert.equal(certificate.selected.maximumDeficit, Math.max(...deficits))
	assert.equal(certificate.selected.totalDeficit, deficits.reduce((sum, deficit) => sum + deficit, 0))
	assert.equal(palette.score, 1 - certificate.selected.maximumDeficit)
	for (const relation of Object.values(certificate.selected.apcaConstraints)) {
		if (relation.required) assert.equal(relation.passesThreshold, true)
	}
	if (certificate.selected.fieldState === "collapsed") {
		assert.equal(certificate.selected.candidateIds.background, certificate.selected.candidateIds.surface)
		assert.equal(certificate.selected.fieldEdge, undefined)
	} else {
		assert.notEqual(certificate.selected.candidateIds.background, certificate.selected.candidateIds.surface)
		assert.ok(certificate.selected.fieldEdge?.fieldRelation)
		const expected = certificate.selected.fieldState === "gradient"
			? certificate.selected.fieldEdge.fieldRelation.stateSupport.gradient
			: certificate.selected.fieldEdge.fieldRelation.stateSupport.distinctFlat
		assert.equal(certificate.selected.objectives[2], expected)
	}
	assert.throws(() => { (certificate.selected.objectives as unknown as number[])[0] = 0 }, TypeError)
})

test("explicit consumer adjacency leaves undeclared APCA relations diagnostic", () => {
	const source = image(24, 16, (x) => x < 12 ? [240, 238, 230] : x < 20 ? [35, 40, 50] : [190, 45, 75])
	const backgroundOnly = extractNextPaletteRelationWithContext(source)
	const both = extractNextPaletteRelationWithContext(source, {
		...NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
		version: "both-field-relation-test",
		requiredApcaRelations: {
			foreground: ["background", "surface"],
			accent: ["background", "surface"],
		},
	})

	assert.equal(backgroundOnly.certificate.selected.fieldState, "distinct-flat")
	assert.equal(backgroundOnly.certificate.selected.apcaConstraints.foregroundOnSurface.required, false)
	assert.equal(backgroundOnly.certificate.selected.apcaConstraints.foregroundOnSurface.passesThreshold, false)
	assert.equal(both.certificate.selected.apcaConstraints.foregroundOnSurface.required, true)
	assert.equal(both.certificate.selected.apcaConstraints.foregroundOnSurface.passesThreshold, true)
	assert.equal(both.certificate.selected.fieldState, "collapsed")
})

test("subtle gradients are legal below the flat-field distance", () => {
	const first = rgbToOKLab([205, 172, 92])
	const second = rgbToOKLab([205, 176, 107])
	const source = image(48, 24, (x) => oklabToRGB(mixOKLab(first, second, x / 47)))
	const result = extractNextPaletteRelationWithContext(source)

	assert.equal(result.certificate.selected.fieldState, "gradient")
	assert.ok(result.certificate.selected.fieldEdge)
	assert.ok(result.certificate.selected.fieldEdge.distance > 0)
	assert.ok(result.certificate.selected.fieldEdge.distance < NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY.flatFieldMinimumDistance)
	assert.ok(result.certificate.selected.fieldEdge.fieldRelation!.stateSupport.gradient > 0)
	assert.ok(result.certificate.hardConstraintRejections.flatFieldDistance > 0)
	assert.equal(result.certificate.hardConstraintRejections.gradientEndpointDistance, 0)
})

test("relation policy rejects implicit, empty, duplicate, reversed, and extra adjacency", () => {
	const graph = buildPaletteRelationGraph(perceivePaletteImage(fixture()))
	const solve = (requiredApcaRelations: unknown) => solveNextPaletteRelation(graph, {
		...NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
		version: "invalid-relation-test",
		requiredApcaRelations,
	} as typeof NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY)

	assert.throws(() => solve({ foreground: [], accent: ["background"] }), /canonical and non-empty/)
	assert.throws(() => solve({ foreground: ["background", "background"], accent: ["background"] }), /canonical and non-empty/)
	assert.throws(() => solve({ foreground: ["surface", "background"], accent: ["background"] }), /canonical and non-empty/)
	assert.throws(() => solve({ foreground: ["background"], accent: ["background"], extra: [] }), /relation roles are invalid/)
	assert.throws(() => solveNextPaletteRelation(graph, {
		...NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
		version: " ",
	}), /version must be non-empty/)
	const result = solveNextPaletteRelation(graph)
	assert.ok(Object.isFrozen(result.certificate.policy.requiredApcaRelations))
	assert.ok(Object.isFrozen(result.certificate.policy.requiredApcaRelations.foreground))
})

test("single-field generated fallback remains source-provenance constrained", () => {
	const result = extractNextPaletteRelationWithContext(image(12, 12, () => [245, 245, 240]))

	assert.equal(result.graph.fieldNodeIds.length, 1)
	assert.equal(result.certificate.selected.fieldState, "collapsed")
	assert.equal(result.certificate.selected.candidateIds.foreground, "generated-black")
	assert.equal(result.certificate.selected.candidateIds.accent, "generated-black")
	assert.equal(result.certificate.selected.generatedColorAuthorization.foregroundFallback.authorized, true)
	assert.deepEqual(result.certificate.selected.generatedColorAuthorization.foregroundFallback.passingSourceCandidateIds, [])
	assert.equal(result.certificate.selected.generatedColorAuthorization.accentCollapse.authorized, true)
	assert.equal(result.palette.foreground.hex, "#000000")
})
