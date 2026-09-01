import assert from "node:assert/strict"
import test from "node:test"
import { apcaContrast } from "../src/color.ts"
import { buildPaletteEvidenceGraph, type PaletteEvidenceGraph } from "../src/palette-evidence-graph.ts"
import { perceivePaletteImage, type PalettePerception } from "../src/palette-perception.ts"
import {
	extractNextPaletteWithContext,
	NEXT_PALETTE_ALGORITHM_VERSION,
	NEXT_PALETTE_DEVELOPMENT_POLICY,
	NEXT_PALETTE_IDENTITY,
	solveNextPalette,
} from "../src/next-palette.ts"
import type { RawImage, RGB, RoleName } from "../src/types.ts"

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

function passes(lc: number, positive: number, negativeMagnitude: number): boolean {
	return lc >= positive || lc <= -negativeMagnitude
}

function permuteGraph(graph: PaletteEvidenceGraph): PaletteEvidenceGraph {
	return {
		...graph,
		nodes: [...graph.nodes].reverse(),
		edges: [...graph.edges].reverse(),
		fieldNodeIds: [...graph.fieldNodeIds].reverse(),
	}
}

function expectedCompleteDomain(graph: PaletteEvidenceGraph): number {
	const fields = graph.nodes.filter((node) => !node.typographyOnly)
	let count = 0
	for (const background of fields) {
		for (const surface of fields) {
			const sourcePasses = graph.nodes.some((foreground) => {
				const contrast = (fieldId: number): number => foreground.id === fieldId
					? apcaContrast(foreground.rgb, graph.nodes.find((node) => node.id === fieldId)!.rgb)
					: graph.edges.find((edge) => edge.fromId === foreground.id && edge.toId === fieldId)!.apcaLc
				return passes(
					contrast(background.id),
					NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
					NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
				) && passes(
					contrast(surface.id),
					NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
					NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
				)
			})
			const sourceAssignments = graph.nodes.length ** 2
			const fallbackAssignments = sourcePasses ? 0 : 2 * (graph.nodes.length + 1)
			count += (sourceAssignments + fallbackAssignments) * (background.id === surface.id ? 1 : 2)
		}
	}
	return count
}

test("perception is deterministic, input-preserving, frozen, and source-exact", () => {
	const source = fixture()
	const before = new Uint8Array(source.data)
	const first = perceivePaletteImage(source)
	const second = perceivePaletteImage(source)

	assert.deepEqual(source.data, before)
	assert.deepEqual(first, second)
	assert.ok(Object.isFrozen(first))
	assert.ok(Object.isFrozen(first.candidates))
	assert.ok(Object.isFrozen(first.candidates[0]))
	const originalData = first.analysis.data[0]
	const mutableAnalysis = first.analysis
	mutableAnalysis.data[0] = originalData ^ 255
	assert.equal(first.analysis.data[0], originalData)
	const originalPixelBin = first.pixelBinIds[0]
	const mutablePixelBins = first.pixelBinIds
	mutablePixelBins[0] = originalPixelBin + 100
	assert.equal(first.pixelBinIds[0], originalPixelBin)
	const originalMask = first.candidateRecords[0].mask[0]
	const mutableMask = first.candidateRecords[0].mask
	mutableMask[0] = originalMask ^ 1
	assert.equal(first.candidateRecords[0].mask[0], originalMask)
	const originalFamilyMask = first.families[0].mask[0]
	const mutableFamilyMask = first.families[0].mask
	mutableFamilyMask[0] = originalFamilyMask ^ 1
	assert.equal(first.families[0].mask[0], originalFamilyMask)
	const candidates = new Map(first.candidates.map((candidate) => [candidate.id, candidate]))
	const primary = first.candidateRecords.filter((record) => !candidates.get(record.candidateId)!.typographyOnly)
		.map((record) => ({ ...record, mask: record.mask }))
	for (let pixel = 0; pixel < first.analysis.width * first.analysis.height; pixel++) {
		assert.equal(primary.reduce((sum, record) => sum + record.mask[pixel], 0), 1)
	}
	for (const record of first.candidateRecords) {
		const offset = record.representativePixelIndex * 3
		assert.deepEqual(candidates.get(record.candidateId)!.rgb, [
			first.analysis.data[offset], first.analysis.data[offset + 1], first.analysis.data[offset + 2],
		])
	}
})

test("evidence graph is complete, directed, finite, and candidate-order invariant", () => {
	const perception = perceivePaletteImage(fixture())
	const graph = buildPaletteEvidenceGraph(perception)
	const candidateCount = perception.candidates.length
	const fieldCount = perception.candidates.filter((candidate) => !candidate.typographyOnly).length

	assert.equal(graph.edges.length, candidateCount * (candidateCount - 1))
	assert.equal(graph.edges.filter((edge) => edge.field).length, fieldCount * (fieldCount - 1))
	const originalNodeMask = graph.nodes[0].mask[0]
	const mutableNodeMask = graph.nodes[0].mask
	mutableNodeMask[0] = originalNodeMask ^ 1
	assert.equal(graph.nodes[0].mask[0], originalNodeMask)
	for (const edge of graph.edges) {
		const foreground = graph.nodes.find((node) => node.id === edge.fromId)!
		const background = graph.nodes.find((node) => node.id === edge.toId)!
		assert.equal(edge.apcaLc, apcaContrast(foreground.rgb, background.rgb))
		assert.ok(Number.isFinite(edge.distance))
		assert.ok(Number.isFinite(edge.wcagRatio))
		if (edge.field) {
			assert.ok(Number.isFinite(edge.field.model.score))
			assert.equal(edge.field.topology.endpointDistance, edge.distance)
		}
	}
	const reversed: PalettePerception = { ...perception, candidates: [...perception.candidates].reverse() }
	assert.deepEqual(buildPaletteEvidenceGraph(reversed), graph)
})

test("complete inference is deterministic, permutation invariant, APCA-feasible, and bounded to four colors", () => {
	const perception = perceivePaletteImage(fixture())
	const graph = buildPaletteEvidenceGraph(perception)
	const first = solveNextPalette(graph)
	const second = solveNextPalette(permuteGraph(graph))
	const { certificate, palette } = first

	assert.deepEqual(first, second)
	assert.equal(certificate.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(certificate.counts.completeDomain, certificate.counts.attempted)
	assert.equal(certificate.counts.completeDomain, expectedCompleteDomain(graph))
	assert.equal(
		certificate.counts.sourceForegroundFieldPairs + certificate.counts.fallbackForegroundFieldPairs,
		certificate.counts.fieldPairs,
	)
	assert.ok(certificate.counts.feasible > 0)
	assert.ok(certificate.counts.feasible <= certificate.counts.attempted)
	assert.equal(
		Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0) +
			certificate.counts.feasible,
		certificate.counts.attempted,
	)
	assert.equal(certificate.selected.objectives.length, 6)
	assert.ok(certificate.selected.objectives.every((objective) => Number.isFinite(objective) && objective >= 0 && objective <= 1))
	assert.ok(passes(
		certificate.selected.apcaLc.foregroundOnBackground,
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
	))
	assert.ok(passes(
		certificate.selected.apcaLc.foregroundOnSurface,
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
	))
	assert.ok(passes(
		certificate.selected.apcaLc.accentOnBackground,
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentLightOnDarkMinimumMagnitudeLc,
	))
	assert.ok(passes(
		certificate.selected.apcaLc.accentOnSurface,
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentLightOnDarkMinimumMagnitudeLc,
	))
	const distinct = new Set((["background", "foreground", "surface", "accent"] as RoleName[])
		.map((role) => palette[role].hex))
	assert.ok(distinct.size <= NEXT_PALETTE_DEVELOPMENT_POLICY.maximumDistinctRoleColors)
	if (certificate.selected.candidateIds.background === certificate.selected.candidateIds.surface) {
		assert.equal(certificate.selected.gradientState, "flat")
		assert.equal(certificate.selected.fieldEdge, undefined)
	}
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const id = certificate.selected.candidateIds[role]
		if (typeof id === "number") {
			assert.equal(palette[role].hex, graph.nodes.find((node) => node.id === id)!.hex)
			assert.equal(palette[role].sourceDistance, 0)
		} else {
			assert.ok(role === "foreground" || role === "accent")
		}
	}
	assert.throws(() => { certificate.selected.apcaLc.foregroundOnBackground = 0 }, TypeError)
	assert.throws(() => { (certificate.selected.objectives as unknown as number[])[0] = 0 }, TypeError)
	assert.throws(() => { palette.background.hex = "#000000" }, TypeError)
})

test("candidate identity and runtime boundaries reject stale graphs and malformed policies", () => {
	const perception = perceivePaletteImage(fixture())
	const graph = buildPaletteEvidenceGraph(perception)
	assert.equal(NEXT_PALETTE_IDENTITY.objectiveNames.length, 6)
	assert.equal(NEXT_PALETTE_IDENTITY.objectiveFormulas.length, 6)
	assert.equal(NEXT_PALETTE_IDENTITY.candidateConstruction.count, 12)
	assert.equal(NEXT_PALETTE_IDENTITY.candidateConstruction.familyRadius, 0.055)
	assert.equal(NEXT_PALETTE_IDENTITY.comparisonEpsilon, 1e-12)
	assert.throws(() => solveNextPalette({ ...graph, version: "stale" as typeof graph.version }),
		/Unexpected palette evidence graph version/)
	assert.throws(() => solveNextPalette({
		...graph,
		perceptionVersion: "stale" as typeof graph.perceptionVersion,
	}), /Unexpected palette perception version/)
	assert.throws(() => buildPaletteEvidenceGraph({
		...perception,
		version: "stale" as typeof perception.version,
	}), /Unexpected palette perception version/)
	assert.throws(() => solveNextPalette(graph, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		version: "",
	}), /version must be a non-empty string/)
	assert.throws(() => solveNextPalette(graph, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		extra: true,
	} as unknown as typeof NEXT_PALETTE_DEVELOPMENT_POLICY), /exactly the versioned consumer constraint fields/)
})

test("black and white enter only as foreground fallback and accent collapse", () => {
	const source = image(12, 12, () => [245, 245, 240])
	const { graph, palette, certificate } = extractNextPaletteWithContext(source)

	assert.equal(graph.nodes.length, 1)
	assert.equal(graph.edges.length, 0)
	assert.equal(certificate.counts.fieldPairs, 1)
	assert.equal(certificate.counts.authorizedFieldPairs, 1)
	assert.equal(certificate.counts.sourceForegroundFieldPairs, 0)
	assert.equal(certificate.counts.fallbackForegroundFieldPairs, 1)
	assert.equal(certificate.counts.completeDomain, 5)
	assert.equal(certificate.counts.attempted, 5)
	assert.equal(certificate.counts.feasible, 1)
	assert.equal(Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0), 4)
	assert.equal(certificate.selected.candidateIds.foreground, "generated-black")
	assert.equal(certificate.selected.candidateIds.accent, "generated-black")
	assert.equal(certificate.selected.familyIds.foreground, null)
	assert.equal(palette.foreground.generated, true)
	assert.equal(palette.accent.generated, true)
	assert.equal(palette.foreground.hex, "#000000")
	assert.equal(palette.accent.hex, palette.foreground.hex)
	assert.equal(certificate.selected.gradientState, "flat")
})

test("asymmetric APCA polarity thresholds select the correct generated fallback", () => {
	const dark = image(12, 12, () => [10, 12, 18])
	const light = image(12, 12, () => [245, 245, 240])
	const lightOnDark = extractNextPaletteWithContext(dark, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		version: "asymmetric-light-on-dark-test",
		foregroundDarkOnLightMinimumLc: 120,
		foregroundLightOnDarkMinimumMagnitudeLc: 60,
	})
	const darkOnLight = extractNextPaletteWithContext(light, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		version: "asymmetric-dark-on-light-test",
		foregroundDarkOnLightMinimumLc: 60,
		foregroundLightOnDarkMinimumMagnitudeLc: 120,
	})

	assert.equal(lightOnDark.certificate.selected.candidateIds.foreground, "generated-white")
	assert.ok(lightOnDark.certificate.selected.apcaLc.foregroundOnBackground <= -60)
	assert.equal(lightOnDark.palette.foreground.hex, "#ffffff")
	assert.equal(darkOnLight.certificate.selected.candidateIds.foreground, "generated-black")
	assert.ok(darkOnLight.certificate.selected.apcaLc.foregroundOnBackground >= 60)
	assert.equal(darkOnLight.palette.foreground.hex, "#000000")
})

test("collapse support ignores alternatives forbidden by a two-color cardinality policy", () => {
	const source = image(15, 15, (x, y) => {
		if (x < 3 && y < 3) return [18, 22, 28]
		if (x >= 12 && y >= 12) return [190, 38, 68]
		return [239, 236, 225]
	})
	const result = extractNextPaletteWithContext(source, {
		...NEXT_PALETTE_DEVELOPMENT_POLICY,
		version: "two-color-collapse-test",
		maximumDistinctRoleColors: 2,
	})
	const { certificate, palette } = result

	assert.equal(certificate.selected.candidateIds.surface, certificate.selected.candidateIds.background)
	assert.equal(palette.accent.hex, palette.foreground.hex)
	assert.equal(certificate.selected.objectives[2], 1)
	assert.equal(certificate.selected.objectives[3], 1)
	assert.ok(new Set([palette.background.hex, palette.foreground.hex, palette.surface.hex, palette.accent.hex]).size <= 2)
})
