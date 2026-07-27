import assert from "node:assert/strict"
import test from "node:test"
import { buildPaletteEvidenceGraph, type PaletteEvidenceEdge, type PaletteEvidenceGraph } from "../src/palette-evidence-graph.ts"
import {
	extractNextPaletteFieldPairWithContext,
	NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
	NEXT_PALETTE_FIELD_PAIR_IDENTITY,
	orderedFieldPairSupport,
	solveNextPaletteFieldPair,
} from "../src/next-palette-field-pair.ts"
import { NEXT_PALETTE_DEVELOPMENT_POLICY, solveNextPalette } from "../src/next-palette.ts"
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

function permuteGraph(graph: PaletteEvidenceGraph): PaletteEvidenceGraph {
	return {
		...graph,
		nodes: [...graph.nodes].reverse(),
		edges: [...graph.edges].reverse(),
		fieldNodeIds: [...graph.fieldNodeIds].reverse(),
	}
}

test("ordered field-pair support combines coverage-weighted endpoints with directed ownership", () => {
	const graph = buildPaletteEvidenceGraph(perceivePaletteImage(fixture()))
	const source = graph.edges.find((edge) => edge.field)!
	const edge: PaletteEvidenceEdge = {
		...source,
		field: {
			...source.field!,
			topology: {
				...source.field!.topology,
				features: {
					...source.field!.topology.features,
					endpointSupport: 0.8,
					fieldOwnership: 0.25,
				},
				histogram: {
					...source.field!.topology.histogram,
					absolutePairCoverage: 0.5,
				},
			},
		},
	}

	assert.ok(Math.abs(orderedFieldPairSupport(edge) - 0.55) < 1e-12)
	assert.throws(() => orderedFieldPairSupport({ ...edge, field: undefined }), /requires topology evidence/)
})

test("field-pair inference changes only ranking and is deterministic and recomputable", () => {
	const graph = buildPaletteEvidenceGraph(perceivePaletteImage(fixture()))
	const baseline = solveNextPalette(graph)
	const first = solveNextPaletteFieldPair(graph)
	const second = solveNextPaletteFieldPair(permuteGraph(graph))
	const { certificate, palette } = first

	assert.deepEqual(first, second)
	assert.deepEqual(certificate.counts, baseline.certificate.counts)
	assert.deepEqual(certificate.hardConstraintRejections, baseline.certificate.hardConstraintRejections)
	assert.equal(certificate.algorithmVersion, NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION)
	assert.equal(certificate.identity.objectiveNames[2], "orderedFieldPairSupport")
	assert.equal(certificate.identity, NEXT_PALETTE_FIELD_PAIR_IDENTITY)
	assert.equal(certificate.invariants.orderedFieldPairObjective, true)
	assert.notEqual(certificate.selected.candidateIds.background, certificate.selected.candidateIds.surface)
	assert.ok(certificate.selected.fieldEdge)
	assert.equal(certificate.selected.objectives[2], orderedFieldPairSupport(certificate.selected.fieldEdge))
	const deficits = certificate.selected.objectives.map((objective) => 1 - objective)
	assert.equal(certificate.selected.maximumDeficit, Math.max(...deficits))
	assert.equal(certificate.selected.totalDeficit, deficits.reduce((sum, deficit) => sum + deficit, 0))
	assert.equal(palette.score, 1 - certificate.selected.maximumDeficit)
	assert.throws(() => { (certificate.selected.objectives as unknown as number[])[2] = 0 }, TypeError)
})

test("collapsed field-pair support ignores policy-forbidden alternatives", () => {
	const source = image(15, 15, (x, y) => {
		if (x < 3 && y < 3) return [18, 22, 28]
		if (x >= 12 && y >= 12) return [190, 38, 68]
		return [239, 236, 225]
	})
	const result = extractNextPaletteFieldPairWithContext(source, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		version: "field-pair-two-color-collapse-test",
		maximumDistinctRoleColors: 2,
	})

	assert.equal(result.certificate.selected.candidateIds.surface, result.certificate.selected.candidateIds.background)
	assert.equal(result.certificate.selected.objectives[2], 1)
	assert.equal(result.certificate.selected.gradientState, "flat")
	assert.equal(result.certificate.selected.fieldEdge, undefined)
	assert.ok(new Set([
		result.palette.background.hex,
		result.palette.foreground.hex,
		result.palette.surface.hex,
		result.palette.accent.hex,
	]).size <= 2)
})

test("one-field fallback remains unchanged", () => {
	const source = image(12, 12, () => [245, 245, 240])
	const graph = buildPaletteEvidenceGraph(perceivePaletteImage(source))
	const baseline = solveNextPalette(graph)
	const result = solveNextPaletteFieldPair(graph)

	assert.deepEqual(result.certificate.counts, baseline.certificate.counts)
	assert.deepEqual(result.certificate.hardConstraintRejections, baseline.certificate.hardConstraintRejections)
	assert.equal(result.palette.foreground.hex, "#000000")
	assert.equal(result.palette.accent.hex, "#000000")
	assert.equal(result.certificate.selected.objectives[2], 1)
})
