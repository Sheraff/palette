import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { buildNativePaletteEvidence } from "../src/album-artwork-palette-v2.ts"
import { mixOKLab, okDistance, oklabToRGB, rgbToHex, rgbToOKLab } from "../src/color.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS,
	deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection,
	evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate,
} from "../src/album-artwork-palette-v2-phase-3-arm-midpoint-aware-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates,
} from "../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import type {
	FieldTransitionExactStageColor,
	FieldTransitionPathStageEvidence,
	SupportedFieldTransitionPathEvidence,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import type { OKLab, RawImage, RGB } from "../src/types.ts"

const FAMILY_BIN_STEP = 0.02

function sourceColor(rgb: RGB, pixelIndex: number, familyId: string): FieldTransitionExactStageColor {
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

function sourceColorNear(lab: OKLab, pixelIndex: number, familyId: string): FieldTransitionExactStageColor {
	return sourceColor(oklabToRGB(lab), pixelIndex, familyId)
}

function sourceStage(
	color: FieldTransitionExactStageColor,
	stageIndex: number,
	spatialPosition: number,
	options: Readonly<{
		colorPosition?: number
		populationFraction?: number
		quadrantCoverage?: number
	}> = {},
): FieldTransitionPathStageEvidence {
	const populationFraction = options.populationFraction ?? 0.2
	return {
		stageIndex,
		familyId: color.provenance.familyId,
		regionId: color.provenance.regionId,
		spatialPosition,
		colorPosition: options.colorPosition ?? spatialPosition,
		population: Math.round(populationFraction * 1_000),
		populationFraction,
		imagePopulationFraction: populationFraction / 2,
		quadrantCoverage: options.quadrantCoverage ?? 1,
		prototype: color.oklab,
		exactColor: color,
	}
}

function pathFromStages(
	id: string,
	stages: readonly FieldTransitionPathStageEvidence[],
): SupportedFieldTransitionPathEvidence {
	const acceptedIntermediateSupport = stages.slice(1, -1).filter(({ colorPosition }) =>
		colorPosition >= 0.15 && colorPosition <= 0.85)
	return {
		fieldDomainId: id,
		topology: "linear",
		direction: "horizontal",
		spatialCenter: null,
		endpointFamilyIds: [stages[0].familyId, stages.at(-1)!.familyId],
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
			.reduce((sum, stage) => sum + stage.populationFraction, 0),
		transitionQuadrantCoverage: 1,
		connected: true,
		legacyEligible: true,
		eligible: true,
		rejectionReasons: [],
		hypothesis: { fieldFidelity: 0.5 } as SupportedFieldTransitionPathEvidence["hypothesis"],
	}
}

function curvedPath(
	id: string,
	firstRgb: RGB,
	middleRgb: RGB,
	secondRgb: RGB,
): SupportedFieldTransitionPathEvidence {
	const first = sourceColor(firstRgb, 10, `${id}-first`)
	const middle = sourceColor(middleRgb, 30, `${id}-middle`)
	const second = sourceColor(secondRgb, 50, `${id}-second`)
	const positions = [0, 0.25, 0.5, 0.75, 1]
	const colors = positions.map((position, index) => {
		if (index === 0) return first
		if (index === 2) return middle
		if (index === 4) return second
		return sourceColorNear(
			position < 0.5
				? mixOKLab(first.oklab, middle.oklab, position * 2)
				: mixOKLab(middle.oklab, second.oklab, position * 2 - 1),
			10 + index * 10,
			`${id}-stage-${index}`,
		)
	})
	return pathFromStages(id, colors.map((color, index) => sourceStage(color, index, positions[index])))
}

function directPath(id: string): SupportedFieldTransitionPathEvidence {
	const first = sourceColor([197, 48, 63], 60, `${id}-first`)
	const second = sourceColor([37, 70, 204], 80, `${id}-second`)
	const positions = [0, 0.25, 0.5, 0.75, 1]
	return pathFromStages(id, positions.map((position, index) => sourceStage(
		index === 0
			? first
			: index === 4
				? second
				: sourceColorNear(mixOKLab(first.oklab, second.oklab, position), 60 + index * 5,
					`${id}-stage-${index}`),
		index,
		position,
	)))
}

function flatPath(id: string): SupportedFieldTransitionPathEvidence {
	const first = sourceColor([28, 55, 92], 90, `${id}-first`)
	const second = sourceColor([207, 181, 121], 110, `${id}-second`)
	const positions = [0, 0.25, 0.5, 0.75, 1]
	return pathFromStages(id, [first, first, first, second, second].map((color, index) =>
		sourceStage(color, index, positions[index])))
}

function replaceStage(
	path: SupportedFieldTransitionPathEvidence,
	stageIndex: number,
	patch: Partial<FieldTransitionPathStageEvidence>,
): SupportedFieldTransitionPathEvidence {
	const stages = path.stages.map((source, index) => {
		if (index !== stageIndex) return source
		const populationFraction = patch.populationFraction ?? source.populationFraction
		return {
			...source,
			...patch,
			population: patch.populationFraction === undefined
				? source.population : populationFraction * 1_000,
			imagePopulationFraction: patch.populationFraction === undefined
				? source.imagePopulationFraction : populationFraction / 2,
		}
	})
	return pathFromStages(`${path.fieldDomainId}-gate`, stages)
}

function midpointDiagnostic(
	path: SupportedFieldTransitionPathEvidence,
	familyBinStep = FAMILY_BIN_STEP,
	stageIndex = 2,
) {
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], familyBinStep)
	assert.equal(result.bundles[0].eligible, true)
	return result.bundles[0].midpointDiagnostics.find((diagnostic) =>
		diagnostic.stageIndex === stageIndex)!
}

function grayscaleGatePath(id: string, middleValue: number): SupportedFieldTransitionPathEvidence {
	const first = sourceColor([0, 0, 0], 200, `${id}-first`)
	const middle = sourceColor([middleValue, middleValue, middleValue], 210, `${id}-middle`)
	const second = sourceColor([255, 255, 255], 220, `${id}-second`)
	return pathFromStages(id, [
		sourceStage(first, 0, 0, { populationFraction: 0.3, colorPosition: 0 }),
		sourceStage(middle, 1, 0.5, { populationFraction: 0.2, colorPosition: 0.5 }),
		sourceStage(second, 2, 1, { populationFraction: 0.3, colorPosition: 1 }),
	])
}

test("curved same-hue and cross-hue endpoint paths can both select exact three-stop renders", () => {
	const sameHue = curvedPath("same-hue", [24, 48, 101], [116, 55, 177], [119, 181, 239])
	const crossHue = curvedPath("cross-hue", [202, 45, 58], [40, 181, 108], [33, 69, 208])

	for (const path of [sameHue, crossHue]) {
		const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
		assert.equal(result.selected?.render.kind, "supported-three-stop")
		assert.equal(result.selected?.render.midpoint?.position, 0.5)
		assert.strictEqual(result.selected?.render.midpoint?.exactColor, path.stages[2].exactColor)
	}
})

test("midpoint position, endpoint-axis, population, and quadrant gates include exact boundaries", () => {
	const base = curvedPath("thresholds", [30, 51, 111], [47, 180, 104], [213, 160, 49])
	for (const spatialPosition of [0.3, 0.7]) {
		assert.equal(midpointDiagnostic(replaceStage(base, 2, { spatialPosition }))
			.spatialPositionEligible, true)
	}
	for (const spatialPosition of [0.299999, 0.700001]) {
		assert.equal(midpointDiagnostic(replaceStage(base, 2, { spatialPosition }))
			.spatialPositionEligible, false)
	}
	for (const middleValue of [13, 202]) {
		assert.equal(midpointDiagnostic(grayscaleGatePath(`axis-inside-${middleValue}`, middleValue),
			0.001, 1).endpointAxisIntervalEligible, true)
	}
	for (const middleValue of [9, 209]) {
		assert.equal(midpointDiagnostic(grayscaleGatePath(`axis-outside-${middleValue}`, middleValue),
			0.001, 1).endpointAxisIntervalEligible, false)
	}
	for (const middleValue of [48, 155]) {
		assert.equal(midpointDiagnostic(grayscaleGatePath(`halfway-inside-${middleValue}`, middleValue),
			0.001, 1).colorHalfwayEligible, true)
	}
	for (const middleValue of [43, 161]) {
		const diagnostic = midpointDiagnostic(grayscaleGatePath(`halfway-outside-${middleValue}`, middleValue),
			0.001, 1)
		assert.equal(diagnostic.endpointAxisIntervalEligible, true)
		assert.equal(diagnostic.colorHalfwayEligible, false)
	}
	assert.equal(midpointDiagnostic(replaceStage(base, 2, { populationFraction: 0.01 }))
		.populationEligible, true)
	assert.equal(midpointDiagnostic(replaceStage(base, 2, { populationFraction: 0.009 }))
		.populationEligible, false)
	assert.equal(midpointDiagnostic(replaceStage(base, 2, { quadrantCoverage: 0.5 }))
		.quadrantCoverageEligible, true)
	assert.equal(midpointDiagnostic(replaceStage(base, 2, { quadrantCoverage: 0.499999 }))
		.quadrantCoverageEligible, false)
})

test("direct-halfway and both endpoint-distance gates include their exact family-bin boundaries", () => {
	const firstBoundary = grayscaleGatePath("first-distance", 50)
	const firstDistance = okDistance(firstBoundary.stages[1].exactColor.oklab,
		firstBoundary.stages[0].exactColor.oklab)
	assert.equal(midpointDiagnostic(firstBoundary, firstDistance, 1).endpointDistanceEligible, true)
	assert.equal(midpointDiagnostic(firstBoundary, firstDistance + 1e-12, 1).endpointDistanceEligible, false)

	const secondBoundary = grayscaleGatePath("second-distance", 220)
	const secondDistance = okDistance(secondBoundary.stages[1].exactColor.oklab,
		secondBoundary.stages[2].exactColor.oklab)
	assert.equal(midpointDiagnostic(secondBoundary, secondDistance, 1).endpointDistanceEligible, true)
	assert.equal(midpointDiagnostic(secondBoundary, secondDistance + 1e-12, 1).endpointDistanceEligible, false)

	const halfwayBoundary = grayscaleGatePath("halfway-distance", 80)
	const directHalfway = mixOKLab(
		halfwayBoundary.stages[0].exactColor.oklab,
		halfwayBoundary.stages[2].exactColor.oklab,
		0.5,
	)
	const halfwayDistance = okDistance(halfwayBoundary.stages[1].exactColor.oklab, directHalfway)
	assert.equal(midpointDiagnostic(halfwayBoundary, halfwayDistance, 1).directHalfwayDistanceEligible, true)
	assert.equal(midpointDiagnostic(halfwayBoundary, halfwayDistance + 1e-12, 1)
		.directHalfwayDistanceEligible, false)
})

test("every eligible midpoint enters the common comparator and a non-first winner survives permutation", () => {
	const first = sourceColor([25, 46, 118], 120, "multi-first")
	const weaker = sourceColor([160, 80, 100], 130, "multi-weaker")
	const stronger = sourceColor([50, 140, 170], 140, "multi-stronger")
	const second = sourceColor([219, 164, 47], 150, "multi-second")
	const stages = [
		sourceStage(first, 0, 0, { populationFraction: 0.2 }),
		sourceStage(weaker, 1, 0.5, { populationFraction: 0.01 }),
		sourceStage(stronger, 2, 0.5, { populationFraction: 0.5 }),
		sourceStage(second, 3, 1, { populationFraction: 0.2 }),
	]
	const path = pathFromStages("multiple-midpoints", stages)
	const permuted = pathFromStages("multiple-midpoints-permuted", [
		stages[0],
		{ ...stages[2], stageIndex: 1 },
		{ ...stages[1], stageIndex: 2 },
		stages[3],
	])
	const result = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([path], FAMILY_BIN_STEP)
	const permutedResult = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[permuted], FAMILY_BIN_STEP)

	assert.deepEqual(result.bundles[0].candidates.map(({ kind }) => kind), [
		"flat", "supported-two-stop", "supported-three-stop", "supported-three-stop",
	])
	assert.equal(result.summary.candidateCount, 4)
	assert.equal(result.selected?.render.midpoint?.exactColor.provenance.pixelIndex, 140)
	assert.equal(result.bundles[0].midpointDiagnostics[0].selected, false)
	assert.equal(result.bundles[0].midpointDiagnostics[1].selected, true)
	assert.equal(permutedResult.selected?.render.midpoint?.exactColor.provenance.pixelIndex, 140)
	assert.equal(permutedResult.bundles[0].midpointDiagnostics.filter(({ selected }) => selected).length, 1)
})

test("the public derivation maps only a selected render to gradient state and creates no midpoint role", () => {
	const flatSelection = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[flatPath("public-flat")], FAMILY_BIN_STEP).selected
	const twoStopSelection = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		[directPath("public-two")], FAMILY_BIN_STEP).selected
	const threeStopSelection = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates([
		curvedPath("public-three", [25, 46, 106], [50, 140, 170], [216, 161, 46]),
	], FAMILY_BIN_STEP).selected

	const unsupported = deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(null)
	const flat = deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(flatSelection)
	const twoStop = deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(twoStopSelection)
	const threeStop = deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(threeStopSelection)
	assert.deepEqual([unsupported.gradient, flat.gradient, twoStop.gradient, threeStop.gradient],
		[false, false, true, true])
	assert.deepEqual([flat.fieldTreatment, twoStop.fieldTreatment, threeStop.fieldTreatment],
		["separate-flat-fields", "gradient-field", "gradient-field"])
	assert.equal(flat.renderStops.length, 0)
	assert.equal(twoStop.renderStops.length, 2)
	assert.equal(threeStop.renderStops.length, 3)
	assert.equal("midpoint" in threeStop, false)
	assert.deepEqual(Object.keys(threeStop), [
		"selected", "renderKind", "gradient", "fieldTreatment", "endpointStops", "renderStops",
	])
})

function image(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function directSyntheticField(): RawImage {
	const first = rgbToOKLab([34, 52, 142])
	const second = rgbToOKLab([212, 164, 48])
	return image(112, 68, (x) => oklabToRGB(mixOKLab(first, second, x / 111)))
}

function curvedSyntheticField(): RawImage {
	const first = rgbToOKLab([31, 52, 137])
	const middle = rgbToOKLab([40, 174, 151])
	const last = rgbToOKLab([221, 170, 58])
	return image(112, 68, (x, y) => {
		const amount = Math.max(0, Math.min(1, x / 111 + 0.025 * Math.sin(Math.PI * y / 67)))
		return oklabToRGB(amount < 0.5
			? mixOKLab(first, middle, amount * 2)
			: mixOKLab(middle, last, amount * 2 - 1))
	})
}

test("the public arm selects real direct and curved synthetic source renders", () => {
	const direct = evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate(
		buildNativePaletteEvidence(directSyntheticField()),
	)
	const curved = evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate(
		buildNativePaletteEvidence(curvedSyntheticField()),
	)
	assert.equal(direct.fieldRender.renderKind, "supported-two-stop")
	assert.equal(direct.fieldRender.gradient, true)
	assert.equal(direct.fieldRender.renderStops.length, 2)
	assert.equal(curved.fieldRender.renderKind, "supported-three-stop")
	assert.equal(curved.fieldRender.gradient, true)
	assert.equal(curved.fieldRender.renderStops.length, 3)
	assert.equal(curved.fieldRender.renderStops[1].exactColor.provenance.exactSource, true)
})

test("v2 identity, policy, and formula diagnostics are frozen and inference remains source-only", async () => {
	for (const diagnostics of [
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS,
	]) {
		assert.equal(Object.isFrozen(diagnostics), true)
		assert.equal(Object.isFrozen(diagnostics.identity), true)
		assert.equal(Object.isFrozen(diagnostics.policy), true)
		assert.equal(Object.isFrozen(diagnostics.formulas), true)
	}
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS.identity.version, 2)
	assert.equal(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS.identity.version,
		2,
	)
	assert.match(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS
			.identity.configurationId,
		/-v2$/u,
	)

	for (const sourceUrl of [
		new URL("../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts", import.meta.url),
		new URL("../src/album-artwork-palette-v2-phase-3-arm-midpoint-aware-render-candidate.ts", import.meta.url),
		new URL("../src/album-artwork-palette-v2-phase-3-field-transition.ts", import.meta.url),
		new URL("../src/color.ts", import.meta.url),
	]) {
		const source = await readFile(sourceUrl, "utf8")
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:\bcaseId\b|\bartworkId\b|pathname|filePath|filename|feedback|review|manifest|target.?color|#[0-9a-f]{6})/iu)
	}
})
