import assert from "node:assert/strict"
import test from "node:test"
import { mixOKLab, oklabToRGB, rgbToHex, rgbToOKLab } from "../src/color.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates,
} from "../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody,
} from "../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import type {
	FieldTransitionExactStageColor,
	FieldTransitionPathStageEvidence,
	SupportedFieldTransitionPathEvidence,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import type { OKLab, RGB } from "../src/types.ts"

const FAMILY_BIN_STEP = 0.02

function exactColor(rgb: RGB, pixelIndex: number, familyId: string): FieldTransitionExactStageColor {
	return {
		rgb,
		oklab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		provenance: {
			exactSource: true,
			familyId,
			regionId: `region-${pixelIndex}`,
			pixelIndex,
			x: pixelIndex,
			y: 0,
		},
	}
}

function exactColorNear(lab: OKLab, pixelIndex: number, familyId: string): FieldTransitionExactStageColor {
	return exactColor(oklabToRGB(lab), pixelIndex, familyId)
}

function stage(
	exact: FieldTransitionExactStageColor,
	stageIndex: number,
	spatialPosition: number,
	colorPosition = spatialPosition,
	populationFraction = 0.2,
	quadrantCoverage = 1,
): FieldTransitionPathStageEvidence {
	return {
		stageIndex,
		familyId: exact.provenance.familyId,
		regionId: exact.provenance.regionId,
		spatialPosition,
		colorPosition,
		population: Math.round(populationFraction * 1_000),
		populationFraction,
		imagePopulationFraction: populationFraction * 0.5,
		quadrantCoverage,
		prototype: exact.oklab,
		exactColor: exact,
	}
}

function stageWithPopulation(
	exact: FieldTransitionExactStageColor,
	stageIndex: number,
	spatialPosition: number,
	populationFraction: number,
	colorPosition = spatialPosition,
	quadrantCoverage = 1,
): FieldTransitionPathStageEvidence {
	return {
		...stage(exact, stageIndex, spatialPosition, colorPosition, populationFraction, quadrantCoverage),
		population: populationFraction * 1_000,
		imagePopulationFraction: populationFraction / 10,
	}
}

function supportedPath(
	id: string,
	stages: readonly FieldTransitionPathStageEvidence[],
	overrides: Partial<SupportedFieldTransitionPathEvidence> = {},
): SupportedFieldTransitionPathEvidence {
	const acceptedIntermediateSupport = stages.slice(1, -1).filter(({ colorPosition }) =>
		colorPosition >= 0.15 && colorPosition <= 0.85)
	return {
		fieldDomainId: id,
		topology: "linear",
		direction: "horizontal",
		spatialCenter: null,
		endpointFamilyIds: [stages[0]?.familyId ?? "first", stages.at(-1)?.familyId ?? "second"],
		endpointInterval: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
		stageFamilyIds: stages.map(({ familyId }) => familyId),
		stageRegionIds: stages.map(({ regionId }) => regionId),
		stagePositions: stages.map(({ spatialPosition }) => spatialPosition),
		stageColorPositions: stages.map(({ colorPosition }) => colorPosition),
		stagePopulationFractions: stages.map(({ populationFraction }) => populationFraction),
		stages,
		acceptedIntermediateSupport,
		transitionFamilyCount: new Set(acceptedIntermediateSupport.map(({ familyId }) => familyId)).size,
		transitionPopulationFraction: acceptedIntermediateSupport
			.reduce((sum, value) => sum + value.populationFraction, 0),
		transitionQuadrantCoverage: stages.length > 2 ? 1 : 0,
		connected: true,
		legacyEligible: true,
		eligible: true,
		rejectionReasons: [],
		hypothesis: { fieldFidelity: 0.5 } as SupportedFieldTransitionPathEvidence["hypothesis"],
		...overrides,
	}
}

function directPath(id: string, firstRgb: RGB, secondRgb: RGB): SupportedFieldTransitionPathEvidence {
	const first = exactColor(firstRgb, 10, `${id}-first`)
	const second = exactColor(secondRgb, 50, `${id}-second`)
	const positions = [0, 0.25, 0.5, 0.75, 1]
	return supportedPath(id, positions.map((position, index) => stage(
		index === 0
			? first
			: index === positions.length - 1
				? second
				: exactColorNear(mixOKLab(first.oklab, second.oklab, position), 10 + index * 10,
					`${id}-stage-${index}`),
		index,
		position,
	)))
}

function curvedPath(id: string, firstRgb: RGB, middleRgb: RGB, secondRgb: RGB): SupportedFieldTransitionPathEvidence {
	const first = exactColor(firstRgb, 100, `${id}-first`)
	const middle = exactColor(middleRgb, 120, `${id}-middle`)
	const second = exactColor(secondRgb, 140, `${id}-second`)
	const positions = [0, 0.25, 0.5, 0.75, 1]
	const colors = positions.map((position, index) => {
		if (index === 0) return first
		if (index === 2) return middle
		if (index === 4) return second
		return exactColorNear(
			position < 0.5
				? mixOKLab(first.oklab, middle.oklab, position * 2)
				: mixOKLab(middle.oklab, second.oklab, position * 2 - 1),
			100 + index * 10,
			`${id}-stage-${index}`,
		)
	})
	return supportedPath(id, colors.map((color, index) => stage(color, index, positions[index])))
}

function pathEndpointCustody(
	path: SupportedFieldTransitionPathEvidence,
): AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody {
	return [
		{
			familyId: path.stages[0].familyId,
			regionId: path.stages[0].regionId,
			exactColor: path.stages[0].exactColor,
		},
		{
			familyId: path.stages.at(-1)!.familyId,
			regionId: path.stages.at(-1)!.regionId,
			exactColor: path.stages.at(-1)!.exactColor,
		},
	]
}

function endpointRepresentative(
	stage: FieldTransitionPathStageEvidence,
	rgb: RGB,
	pixelIndex: number,
) {
	const color = exactColor(rgb, pixelIndex, stage.familyId)
	return {
		familyId: stage.familyId,
		regionId: stage.regionId,
		exactColor: {
			...color,
			provenance: { ...color.provenance, regionId: stage.regionId },
		},
	}
}

test("a direct cross-hue source path remains a supported two-stop render", () => {
	const path = directPath("direct-cross-hue", [205, 42, 55], [34, 68, 211])
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)

	assert.equal(result.selected?.render.kind, "supported-two-stop")
	assert.deepEqual(result.bundles[0].candidates.map(({ kind }) => kind), [
		"flat",
		"supported-two-stop",
	])
	assert.ok(result.bundles[0].midpointDiagnostics.length > 0)
	assert.ok(result.bundles[0].midpointDiagnostics.every(({ eligible }) => !eligible))
	assert.equal(result.bundles[0].midpointDiagnostics.find(({ stageIndex }) => stageIndex === 2)
		?.directHalfwayDistanceEligible, false)
})

test("all eligible variants are emitted in fixed order before render selection with exact custody", () => {
	const path = curvedPath("curved", [25, 46, 118], [50, 140, 170], [219, 164, 47])
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
	const bundle = result.bundles[0]

	assert.deepEqual(bundle.candidates.map(({ kind }) => kind), [
		"flat",
		"supported-two-stop",
		"supported-three-stop",
	])
	assert.equal(bundle.selectedRender?.kind, "supported-three-stop")
	assert.strictEqual(bundle.endpoints?.[0].exactColor, path.stages[0].exactColor)
	assert.strictEqual(bundle.endpoints?.[1].exactColor, path.stages.at(-1)!.exactColor)
	assert.strictEqual(bundle.candidates[0].endpoints, bundle.candidates[1].endpoints)
	assert.strictEqual(bundle.selectedRender?.midpoint?.exactColor, path.stages[2].exactColor)
	assert.deepEqual(bundle.selectedRender?.midpoint?.exactColor.rgb, path.stages[2].exactColor.rgb)
	assert.equal(bundle.selectedRender?.midpoint?.exactColor.hex, path.stages[2].exactColor.hex)
	assert.equal(bundle.selectedRender?.midpoint?.exactColor.provenance.pixelIndex,
		path.stages[2].exactColor.provenance.pixelIndex)
})

test("the pure path API retains explicit endpoint custody and endpoint identity changes selection", () => {
	const path = directPath("explicit-endpoints", [0, 0, 0], [255, 255, 255])
	const defaultEndpoints = pathEndpointCustody(path)
	const explicitEndpoints = [
		endpointRepresentative(path.stages[0], [0, 0, 0], 501),
		endpointRepresentative(path.stages.at(-1)!, [20, 20, 20], 502),
	] as const
	const baseline = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		path, defaultEndpoints, FAMILY_BIN_STEP)
	const explicit = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		path, explicitEndpoints, FAMILY_BIN_STEP)

	assert.strictEqual(explicit.endpoints?.[0].exactColor, explicitEndpoints[0].exactColor)
	assert.strictEqual(explicit.endpoints?.[1].exactColor, explicitEndpoints[1].exactColor)
	assert.notEqual(explicit.id, baseline.id)
	assert.notEqual(explicit.selectedRender?.id, baseline.selectedRender?.id)
	assert.notEqual(
		explicit.candidates.find(({ kind }) => kind === "supported-two-stop")?.fidelity.value,
		baseline.candidates.find(({ kind }) => kind === "supported-two-stop")?.fidelity.value,
	)
	assert.notEqual(explicit.selectedRender?.kind, baseline.selectedRender?.kind)
})

test("the pure path API recomputes endpoint-axis position instead of trusting stage metadata", () => {
	const source = curvedPath("recomputed-axis", [25, 46, 118], [50, 140, 170], [219, 164, 47])
	const stages = source.stages.map((value, index) => index === 2
		? { ...value, colorPosition: 0.05 }
		: value)
	const misleading = supportedPath("recomputed-axis-misleading", stages)
	const bundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		misleading, pathEndpointCustody(misleading), FAMILY_BIN_STEP)
	const diagnostic = bundle.midpointDiagnostics.find(({ stageIndex }) => stageIndex === 2)!

	assert.equal(misleading.stages[2].colorPosition, 0.05)
	assert.ok(diagnostic.colorPosition > 0.3 && diagnostic.colorPosition < 0.7)
	assert.equal(diagnostic.colorPositionEligible, true)
	assert.ok(bundle.candidates.some(({ kind }) => kind === "supported-three-stop"))
})

test("the pure path API rejects mismatched or corrupt endpoint custody without throwing", () => {
	const path = directPath("endpoint-rejection", [31, 57, 118], [201, 160, 66])
	const valid = pathEndpointCustody(path)
	const mismatched = [
		{ ...valid[0], familyId: "wrong-family" },
		valid[1],
	] as unknown as AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody
	const corrupt = structuredClone(valid) as any
	corrupt[1].exactColor.hex = corrupt[1].exactColor.hex.toUpperCase()

	for (const endpoints of [mismatched, corrupt]) {
		let bundle: ReturnType<typeof evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath> | null = null
		assert.doesNotThrow(() => {
			bundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
				path, endpoints, FAMILY_BIN_STEP)
		})
		assert.equal(bundle!.eligible, false)
		assert.equal(bundle!.endpoints, null)
		assert.deepEqual(bundle!.candidates, [])
	}
})

test("hand-calculated fidelity uses every stage, independent population mass, and weighted p90", () => {
	const black = { ...exactColor([0, 0, 0], 180, "manual-black"), oklab: [0, 0, 0] as const }
	const middleBlack = { ...exactColor([0, 0, 0], 181, "manual-middle"), oklab: [0, 0, 0] as const }
	const white = { ...exactColor([255, 255, 255], 182, "manual-white"), oklab: [1, 0, 0] as const }
	const path = supportedPath("manual-fidelity", [
		stageWithPopulation(black, 0, 0, 0.25),
		stageWithPopulation(middleBlack, 1, 0.5, 0.5),
		stageWithPopulation(white, 2, 1, 0.25),
	])
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
	const flat = result.bundles[0].candidates[0].fidelity
	const twoStop = result.bundles[0].candidates[1].fidelity
	const expectedMassRMSE = Math.sqrt(0.125)
	const expectedStageRMSE = Math.sqrt(1 / 12)
	const expectedWeightedP90 = 0.5
	const expectedSigma = 0.2
	const expectedValue = 0.5 * Math.exp(-((expectedMassRMSE / expectedSigma) ** 2)) +
		0.3 * Math.exp(-((expectedStageRMSE / expectedSigma) ** 2)) +
		0.2 * Math.exp(-((expectedWeightedP90 / (1.5 * expectedSigma)) ** 2))

	assert.deepEqual(twoStop.stageErrors.map(({ distance }) => distance), [0, 0.5, 0])
	assert.ok(Math.abs(twoStop.massRMSE - expectedMassRMSE) < 1e-14)
	assert.ok(Math.abs(twoStop.stageRMSE - expectedStageRMSE) < 1e-14)
	assert.equal(twoStop.weightedP90, expectedWeightedP90)
	assert.equal(twoStop.sigma, expectedSigma)
	assert.ok(Math.abs(twoStop.value - expectedValue) < 1e-14)
	assert.equal(twoStop.level, Math.floor((expectedValue + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fidelityResolution))
	assert.deepEqual([flat.massRMSE, flat.stageRMSE, flat.weightedP90, flat.value], [0, 0, 0, 1])
})

test("a hand-calculated piecewise fixture has exact three-stop fidelity", () => {
	const black = exactColor([0, 0, 0], 183, "piecewise-black")
	const darkMiddle = exactColor([50, 50, 50], 184, "piecewise-middle")
	const white = exactColor([255, 255, 255], 185, "piecewise-white")
	const path = supportedPath("manual-piecewise", [
		stageWithPopulation(black, 0, 0, 0.3),
		stageWithPopulation(darkMiddle, 1, 0.5, 0.2),
		stageWithPopulation(white, 2, 1, 0.3),
	])
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
	const threeStop = result.bundles[0].candidates.find(({ kind }) => kind === "supported-three-stop")!

	assert.deepEqual(threeStop.fidelity.stageErrors.map(({ distance }) => distance), [0, 0, 0])
	assert.deepEqual([
		threeStop.fidelity.massRMSE,
		threeStop.fidelity.stageRMSE,
		threeStop.fidelity.weightedP90,
		threeStop.fidelity.value,
	], [0, 0, 0, 1])
	assert.equal(result.selected?.render.kind, "supported-three-stop")
})

test("flat can win the common render comparison", () => {
	const first = exactColor([31, 52, 91], 200, "flat-first")
	const second = exactColor([202, 179, 125], 240, "flat-second")
	const positions = [0, 0.25, 0.5, 0.75, 1]
	const colors = [first, first, first, second, second]
	const path = supportedPath("flat-winner", colors.map((color, index) =>
		stage(color, index, positions[index])))
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)

	assert.equal(result.selected?.render.kind, "flat")
	assert.equal(result.selected?.render.fidelity.value, 1)
	assert.equal(result.selected?.render.stopCount, 0)
})

test("legacy-supported paths rejected only by strict interval evidence still enter render comparison", () => {
	const base = directPath("legacy-strict-only", [205, 42, 55], [34, 68, 211])
	for (const rejectionReasons of [
		[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS[0]],
		[...ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS],
	]) {
		const path = { ...base, eligible: false, rejectionReasons }
		const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
		const bundle = result.bundles[0]
		assert.equal(bundle.eligible, true)
		assert.deepEqual(bundle.candidates.map(({ kind }) => kind), ["flat", "supported-two-stop"])
		assert.equal(bundle.selectedRender?.kind, "supported-two-stop")
		assert.deepEqual(bundle.inheritedEligibility, {
			legacyEligible: true,
			strictEligible: false,
			rejectionReasons,
			strictColorIntervalOnly: true,
		})
	}
})

test("legacy weakness, missing hypothesis, disconnection, empty paths, discontinuity, and other reasons stay hard", () => {
	const valid = directPath("admissibility-negative", [39, 66, 119], [184, 158, 91])
	const discontinuousStages = valid.stages.map((stage, index) => index === 2
		? { ...stage, spatialPosition: 0.1 }
		: stage)
	const discontinuous = supportedPath("spatial-discontinuity", discontinuousStages)
	const otherReason = "transition path lacks broad perimeter coverage"
	const invalid = [
		{ ...valid, fieldDomainId: "legacy-ineligible", legacyEligible: false },
		{ ...valid, fieldDomainId: "missing-hypothesis", hypothesis: null },
		{ ...valid, fieldDomainId: "disconnected-admissibility", connected: false },
		supportedPath("empty-admissibility", []),
		discontinuous,
		{ ...valid, fieldDomainId: "other-rejection", eligible: false,
			rejectionReasons: [otherReason] },
	]
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(invalid, FAMILY_BIN_STEP)

	assert.equal(result.selected, null)
	assert.equal(result.summary.eligiblePathCount, 0)
	assert.ok(result.bundles.every(({ candidates }) => candidates.length === 0))
	const inheritedHardFailure = result.bundles.find(({ path }) =>
		path?.fieldDomainId === "other-rejection")
	assert.ok(inheritedHardFailure?.rejectionReasons.includes(otherReason))
})

test("empty, disconnected, and ineligible paths fail closed without endpoint fallback", () => {
	const valid = directPath("invalid-base", [39, 66, 119], [184, 158, 91])
	const invalid = [
		supportedPath("empty", []),
		{ ...valid, fieldDomainId: "disconnected", connected: false },
		{ ...valid, fieldDomainId: "ineligible", eligible: false,
			rejectionReasons: ["upstream evidence rejected this transition"] },
	]
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(invalid, FAMILY_BIN_STEP)

	assert.equal(result.selected, null)
	assert.equal(result.summary.eligiblePathCount, 0)
	assert.equal(result.summary.candidateCount, 0)
	for (const bundle of result.bundles) {
		assert.equal(bundle.eligible, false)
		assert.equal(bundle.endpoints, null)
		assert.deepEqual(bundle.candidates, [])
		assert.equal(bundle.selectedRender, null)
	}
})

test("malformed custody, metadata, geometry, and population evidence rejects without throwing", () => {
	const base = directPath("validation-base", [37, 63, 119], [190, 157, 79])
	const toleratedRoundtrip: any = structuredClone(base)
	toleratedRoundtrip.stages[0].exactColor.oklab[0] +=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.exactColorOKLabTolerance / 2
	const toleratedResult = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[toleratedRoundtrip], FAMILY_BIN_STEP)
	assert.equal(toleratedResult.bundles[0].eligible, true)
	const malformed: SupportedFieldTransitionPathEvidence[] = [
		null as unknown as SupportedFieldTransitionPathEvidence,
		{} as SupportedFieldTransitionPathEvidence,
	]
	const add = (mutate: (path: any) => void): void => {
		const path = structuredClone(base)
		mutate(path)
		malformed.push(path)
	}
	add((path) => { path.stages[0].exactColor.hex = path.stages[0].exactColor.hex.toUpperCase() })
	add((path) => { path.stages[0].exactColor.hex = "#000000" })
	add((path) => { path.stages[0].exactColor.rgb[0] += 1 })
	add((path) => { path.stages[0].exactColor.oklab[0] += 0.00001 })
	add((path) => { path.stages[0].exactColor.provenance.pixelIndex = -1 })
	add((path) => { path.stages[0].exactColor.provenance.pixelIndex = Number.MAX_SAFE_INTEGER + 1 })
	add((path) => { path.stages[0].exactColor.provenance.x = -1 })
	add((path) => { path.stages[0].exactColor.provenance.y = -1 })
	for (const key of [
		"stageFamilyIds", "stageRegionIds", "stagePositions", "stageColorPositions",
		"stagePopulationFractions",
	]) {
		add((path) => { path[key][0] = typeof path[key][0] === "number" ? path[key][0] + 0.01 : "wrong" })
	}
	add((path) => { path.endpointFamilyIds[0] = "wrong-endpoint" })
	add((path) => { path.endpointInterval[0] = 0.14 })
	add((path) => { path.acceptedIntermediateSupport[0].regionId = "wrong-interior" })
	add((path) => { path.acceptedIntermediateSupport.pop() })
	add((path) => { path.rejectionReasons.push("contradicts eligible evidence") })
	add((path) => {
		path.stages[2].spatialPosition = 0.1
		path.stagePositions[2] = 0.1
	})
	add((path) => {
		path.stages[2].spatialPosition = 1.1
		path.stagePositions[2] = 1.1
	})
	add((path) => {
		path.stages[2].spatialPosition = Number.NaN
		path.stagePositions[2] = Number.NaN
	})
	add((path) => {
		path.stages[0].spatialPosition = 0.01
		path.stagePositions[0] = 0.01
	})
	add((path) => { path.stages[0].population = 0 })
	add((path) => { path.stages[0].population = Number.POSITIVE_INFINITY })
	add((path) => {
		path.stages[0].populationFraction += 0.001
		path.stagePopulationFractions[0] = path.stages[0].populationFraction
	})
	add((path) => {
		path.stages[0].populationFraction = Number.NaN
		path.stagePopulationFractions[0] = Number.NaN
	})
	add((path) => {
		path.stages[0].population = 500
		path.stages[0].populationFraction = 0.5
		path.stages[0].imagePopulationFraction = 0.25
		path.stagePopulationFractions[0] = 0.5
	})
	add((path) => { path.stages[0].imagePopulationFraction += 0.001 })
	add((path) => { path.transitionPopulationFraction += 0.01 })
	add((path) => { path.transitionFamilyCount += 1 })
	add((path) => { delete path.stages[0].exactColor })

	for (const path of malformed) {
		let result: ReturnType<typeof evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates> | null = null
		assert.doesNotThrow(() => {
			result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
		})
		assert.equal(result!.selected, null)
		assert.equal(result!.bundles[0].eligible, false)
		assert.deepEqual(result!.bundles[0].candidates, [])
	}
})

test("path permutation cannot change bundles or the selected path/render", () => {
	const firstPath = curvedPath("ascii-b", [22, 43, 112], [43, 180, 109], [218, 161, 43])
	const secondPath = directPath("ascii-a", [193, 53, 66], [35, 73, 203])
	const first = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[firstPath, secondPath], FAMILY_BIN_STEP)
	const second = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[secondPath, firstPath], FAMILY_BIN_STEP)

	assert.deepEqual(first, second)
	assert.equal(first.selected?.pathId, second.selected?.pathId)
	assert.equal(first.selected?.renderId, second.selected?.renderId)
})

function zeroErrorFlatPath(
	id: string,
	interiorFractions: readonly number[] = [0.1, 0.1],
	interiorFamilies: readonly string[] = ["shared-interior", "shared-interior"],
	transitionQuadrantCoverage = 0.75,
	hypothesisFieldFidelity: number | null = null,
): SupportedFieldTransitionPathEvidence {
	const black = exactColor([0, 0, 0], 300, `${id}-first`)
	const white = exactColor([255, 255, 255], 399, `${id}-second`)
	const interiors = interiorFractions.map((fraction, index) =>
		stageWithPopulation(exactColor([0, 0, 0], 310 + index, interiorFamilies[index]),
			index + 1, 0, fraction, 0.5))
	const stages = [
		stageWithPopulation(black, 0, 0, 0.2, 0),
		...interiors,
		stageWithPopulation(white, interiors.length + 1, 1, 0.2, 1),
	]
	return supportedPath(id, stages, {
		transitionQuadrantCoverage,
		hypothesis: {
			fieldFidelity: hypothesisFieldFidelity ?? 0.5,
		} as SupportedFieldTransitionPathEvidence["hypothesis"],
	})
}

function directGrayPath(id: string, gray: number, quadrantCoverage = 0.75): SupportedFieldTransitionPathEvidence {
	const black = exactColor([0, 0, 0], 410, `${id}-first`)
	const middle = exactColor([gray, gray, gray], 420, `${id}-middle`)
	const white = exactColor([255, 255, 255], 430, `${id}-second`)
	return supportedPath(id, [
		stageWithPopulation(black, 0, 0, 0.2),
		stageWithPopulation(middle, 1, 0.5, 0.2, 0.5),
		stageWithPopulation(white, 2, 1, 0.2),
	], { transitionQuadrantCoverage: quadrantCoverage })
}

function exactTwoStopPath(id: string): SupportedFieldTransitionPathEvidence {
	const black = exactColor([0, 0, 0], 440, `${id}-first`)
	const middle = exactColor([99, 99, 99], 450, "tie-middle")
	const white = exactColor([255, 255, 255], 460, `${id}-second`)
	const position = middle.oklab[0] / white.oklab[0]
	return supportedPath(id, [
		stageWithPopulation(black, 0, 0, 0.2, 0),
		stageWithPopulation(middle, 1, position, 0.2, 0.5),
		stageWithPopulation(white, 2, 1, 0.2, 1),
	], { transitionQuadrantCoverage: 0.75 })
}

test("quantized ties use raw fidelity before stronger path support", () => {
	const closer = directGrayPath("raw-closer", 99, 0.5)
	const farther = directGrayPath("raw-farther", 100, 1)
	const closerOnly = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([closer], FAMILY_BIN_STEP)
	const fartherOnly = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([farther], FAMILY_BIN_STEP)
	assert.equal(closerOnly.selected?.render.fidelity.level, fartherOnly.selected?.render.fidelity.level)
	assert.ok(closerOnly.selected!.render.fidelity.value > fartherOnly.selected!.render.fidelity.value)
	const combined = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[farther, closer], FAMILY_BIN_STEP)
	assert.equal(combined.selected?.path.fieldDomainId, "raw-closer")
})

test("complete path ordering uses every support tie break and then ASCII identity", () => {
	const assertWinner = (
		first: SupportedFieldTransitionPathEvidence,
		second: SupportedFieldTransitionPathEvidence,
		expected: string,
	): void => {
		const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
			[second, first], FAMILY_BIN_STEP)
		assert.equal(result.selected?.path.fieldDomainId, expected)
	}
	assertWinner(
		zeroErrorFlatPath("population-weaker", [0.1, 0.1]),
		zeroErrorFlatPath("population-stronger", [0.15, 0.15]),
		"population-stronger",
	)
	assertWinner(
		zeroErrorFlatPath("quadrant-weaker", [0.1, 0.1], undefined, 0.5),
		zeroErrorFlatPath("quadrant-stronger", [0.1, 0.1], undefined, 1),
		"quadrant-stronger",
	)
	assertWinner(
		zeroErrorFlatPath("family-weaker", [0.1, 0.1], ["one-family", "one-family"]),
		zeroErrorFlatPath("family-stronger", [0.1, 0.1], ["family-a", "family-b"]),
		"family-stronger",
	)
	assertWinner(
		zeroErrorFlatPath("hypothesis-weaker", [0.1, 0.1], undefined, 0.75, 0.4),
		zeroErrorFlatPath("hypothesis-stronger", [0.1, 0.1], undefined, 0.75, 0.6),
		"hypothesis-stronger",
	)
	const fewerStops = zeroErrorFlatPath("z-fewer-stops", [0.2], ["tie-middle"])
	const moreStops = exactTwoStopPath("a-more-stops")
	const flatEvaluation = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[fewerStops], FAMILY_BIN_STEP)
	const twoStopEvaluation = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[moreStops], FAMILY_BIN_STEP)
	assert.equal(flatEvaluation.selected?.render.kind, "flat")
	assert.equal(twoStopEvaluation.selected?.render.kind, "supported-two-stop")
	assert.equal(flatEvaluation.selected?.render.fidelity.value,
		twoStopEvaluation.selected?.render.fidelity.value)
	assertWinner(fewerStops, moreStops, "z-fewer-stops")
	assertWinner(
		zeroErrorFlatPath("ascii-first"),
		zeroErrorFlatPath("ascii-second"),
		"ascii-first",
	)
})
