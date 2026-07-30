import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	generateCompletePaletteTreatments,
} from "../src/album-artwork-palette-v2.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	CompletePaletteTreatment,
	ComponentEvidence,
	FieldHypothesis,
	FieldRoleAssignmentEvidence,
	NativePaletteEvidence,
	RegionObservation,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY,
	materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates,
} from "../src/album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput,
} from "../src/album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath,
} from "../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
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
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import { rgbToHex, rgbToOKLab } from "../src/color.ts"
import type { RGB } from "../src/types.ts"

const WIDTH = 10
const HEIGHT = 6
const PIXEL_COUNT = WIDTH * HEIGHT
const PATH_POPULATION = 52
const FAMILY_BIN_STEP = 0.02
const FIRST_RGB = [25, 46, 118] as const
const MIDDLE_RGB = [50, 140, 170] as const
const SECOND_RGB = [219, 164, 47] as const
const FOREGROUND_RGB = [245, 245, 238] as const
const ACCENT_RGB = [225, 35, 102] as const
const SECOND_FOREGROUND_RGB = [232, 239, 231] as const

function roleFactors(score: number) {
	return {
		geometry: score,
		fill: score,
		repetition: score,
		localContrast: score,
		borderInterior: score,
		sourceSupport: score,
		score,
	}
}

function observation(score: number): RegionObservation {
	return {
		widthFraction: 0.5,
		heightFraction: 1,
		boundsFraction: 0.5,
		elongation: 0.5,
		fill: 1,
		repetition: 0.8,
		localContrast: 0.8,
		boundaryLightnessContrast: 0.5,
		boundaryLightnessPolarity: 1,
		borderContact: 0.8,
		interiorMargin: 0.2,
		componentFamilyFraction: 1,
		foregroundTypography: roleFactors(score),
		signatureAccent: roleFactors(score),
	}
}

function component(
	id: string,
	startPixelIndex: number,
	population: number,
	minX: number,
	maxX: number,
	score: number,
	minY = 0,
	maxY = HEIGHT - 1,
): ComponentEvidence {
	return {
		id,
		startPixelIndex,
		population,
		populationFraction: population / PIXEL_COUNT,
		minX,
		minY,
		maxX,
		maxY,
		borderPixels: population,
		retainedFor: ["connected-support", "role-observation"],
		observation: observation(score),
	}
}

function representative(
	id: string,
	rgb: RGB,
	startPixelIndex: number,
	population: number,
): ColorRepresentative {
	return {
		strategy: "dense-exact",
		rgb,
		oklab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		support: {
			exactSource: true,
			exemplar: {
				x: startPixelIndex % WIDTH,
				y: Math.floor(startPixelIndex / WIDTH),
			},
			anchorFamilyId: id,
			regionIds: [`${id}-region-${startPixelIndex}`],
			perceptualDensity: 1,
			totalSupport: population / PIXEL_COUNT,
			connectedSupport: population / PIXEL_COUNT,
			spatialCoverage: 1,
			concentration: 1,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function family(
	id: string,
	rgb: RGB,
	startPixelIndex: number,
	population: number,
	minX: number,
	maxX: number,
	roles: Readonly<{ field: number; foreground: number; signature: number }>,
	minY = 0,
	maxY = HEIGHT - 1,
): ColorFamilyEvidence {
	const familyComponent = component(
		`${id}-region-${startPixelIndex}`,
		startPixelIndex,
		population,
		minX,
		maxX,
		Math.max(roles.foreground, roles.signature),
		minY,
		maxY,
	)
	return {
		id,
		prototype: rgbToOKLab(rgb),
		population,
		populationFraction: population / PIXEL_COUNT,
		perceptualBinCount: 1,
		borderCoverage: roles.field,
		centerCoverage: roles.field * 0.5,
		quadrantCoverage: 1,
		cornerCoverage: roles.field,
		centroid: [(minX + maxX) / 2 / (WIDTH - 1), (minY + maxY) / 2 / (HEIGHT - 1)],
		spatialSpread: 0.5,
		largestComponentFraction: population / PIXEL_COUNT,
		familyConcentration: 1,
		componentCount: 1,
		repeatedComponentCount: 1,
		edgeDensity: 0.5,
		localContrast: 0.5,
		chroma: Math.hypot(rgbToOKLab(rgb)[1], rgbToOKLab(rgb)[2]),
		fieldScore: roles.field,
		signatureScore: roles.signature,
		foregroundScore: roles.foreground,
		foregroundTypographyObservation: roles.foreground,
		foregroundPolarityObservation: {
			polarity: 1,
			confidence: roles.foreground,
			componentIds: [familyComponent.id],
		},
		signatureAccentObservation: roles.signature,
		observedComponentCount: 1,
		components: [familyComponent],
		representatives: [representative(id, rgb, startPixelIndex, population)],
	}
}

type Fixture = Readonly<{
	sourceEvidence: NativePaletteEvidence
	treatmentEvidence: NativePaletteEvidence
	path: SupportedFieldTransitionPathEvidence
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle
}>

function profile(score: number): FieldRoleAssignmentEvidence["backgroundProfile"] {
	const level = Math.floor(score / 0.04)
	return {
		frameCoverage: score,
		peripheralCoverage: score,
		connectedCoverage: score,
		fieldScore: score,
		populationCoverage: score,
		evidenceLevels: [level, level, level, level, level],
	}
}

function exactColor(rgb: RGB, pixelIndex: number, familyId: string, regionId: string): FieldTransitionExactStageColor {
	return {
		rgb,
		oklab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		provenance: {
			exactSource: true,
			familyId,
			regionId,
			pixelIndex,
			x: pixelIndex % WIDTH,
			y: Math.floor(pixelIndex / WIDTH),
		},
	}
}

function stage(
	familyId: string,
	rgb: RGB,
	pixelIndex: number,
	stageIndex: number,
	spatialPosition: number,
	population: number,
	regionStart = pixelIndex,
	pathPopulation = PATH_POPULATION,
): FieldTransitionPathStageEvidence {
	const regionId = `${familyId}-transition-region-${regionStart}`
	const exact = exactColor(rgb, pixelIndex, familyId, regionId)
	return {
		stageIndex,
		familyId,
		regionId,
		spatialPosition,
		colorPosition: spatialPosition,
		population,
		populationFraction: population / pathPopulation,
		imagePopulationFraction: population / PIXEL_COUNT,
		quadrantCoverage: stageIndex === 1 ? 1 : 0.5,
		prototype: exact.oklab,
		exactColor: exact,
	}
}

function fixture(options: Readonly<{
	id?: string
	backgroundTopologyEndpoint?: "low" | "high"
	strictIntervalOnly?: boolean
	wrongFirstRegionStart?: number
	fieldFidelity?: number
	accentSignatureScore?: number
	secondForeground?: boolean
	topology?: SupportedFieldTransitionPathEvidence["topology"]
	direction?: SupportedFieldTransitionPathEvidence["direction"]
	spatialCenter?: SupportedFieldTransitionPathEvidence["spatialCenter"]
}> = {}): Fixture {
	const id = options.id ?? "path-a"
	const firstId = "field-first"
	const middleId = "field-middle"
	const secondId = "field-second"
	const foregroundId = "copy-family"
	const secondForegroundId = "copy-family-second"
	const accentId = "mark-family"
	const pathPopulation = options.secondForeground ? PATH_POPULATION - 2 : PATH_POPULATION
	const middlePopulation = options.secondForeground ? 14 : 16
	const sourceFamilies = [
		family(firstId, FIRST_RGB, 0, 18, 0, 2, { field: 0.95, foreground: 0.05, signature: 0.05 }),
		family(middleId, MIDDLE_RGB, 3, middlePopulation, 3, 6,
			{ field: 0.8, foreground: 0.05, signature: 0.05 }),
		family(secondId, SECOND_RGB, 7, 18, 7, 9, { field: 0.65, foreground: 0.05, signature: 0.05 }),
		family(
			foregroundId, FOREGROUND_RGB, 14, 4, 4, 5,
			{ field: 0.05, foreground: 0.95, signature: 0.2 }, 1, 2,
		),
		family(
			accentId, ACCENT_RGB, 44, 4, 4, 5,
			{ field: 0.05, foreground: 0.2, signature: options.accentSignatureScore ?? 0.95 }, 4, 5,
		),
		...options.secondForeground ? [family(
			secondForegroundId, SECOND_FOREGROUND_RGB, 4, 2, 4, 5,
			{ field: 0.05, foreground: 0.88, signature: 0.1 }, 0, 0,
		)] : [],
	]
	const rgbData = new Uint8Array(PIXEL_COUNT * 3)
	const labs = new Float32Array(PIXEL_COUNT * 3)
	const familyAt = new Uint16Array(PIXEL_COUNT)
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			const pixelIndex = y * WIDTH + x
			let familyIndex = x <= 2 ? 0 : x <= 6 ? 1 : 2
			if (x >= 4 && x <= 5 && y >= 1 && y <= 2) familyIndex = 3
			if (x >= 4 && x <= 5 && y >= 4 && y <= 5) familyIndex = 4
			if (options.secondForeground && x >= 4 && x <= 5 && y === 0) familyIndex = 5
			const rgb = [
				FIRST_RGB,
				MIDDLE_RGB,
				SECOND_RGB,
				FOREGROUND_RGB,
				ACCENT_RGB,
				SECOND_FOREGROUND_RGB,
			][familyIndex]
			const lab = rgbToOKLab(rgb)
			rgbData.set(rgb, pixelIndex * 3)
			labs.set(lab, pixelIndex * 3)
			familyAt[pixelIndex] = familyIndex
		}
	}
	const sourceEvidence: NativePaletteEvidence = {
		width: WIDTH,
		height: HEIGHT,
		pixelCount: PIXEL_COUNT,
		rgbData,
		labs,
		familyAt,
		families: sourceFamilies,
		adjacencies: [],
		retainedFamilyIds: sourceFamilies.map(({ id: familyId }) => familyId),
		lanes: [
			{ name: "field", maximumFamilies: 3, familyIds: [firstId, middleId, secondId] },
			{ name: "signature", maximumFamilies: 1, familyIds: [accentId] },
			{ name: "foreground", maximumFamilies: options.secondForeground ? 2 : 1,
				familyIds: options.secondForeground ? [foregroundId, secondForegroundId] : [foregroundId] },
		],
		laneRetention: [],
		familyBinStep: FAMILY_BIN_STEP,
		familyAnchorRadius: 0.04,
	}
	const treatmentEvidence: NativePaletteEvidence = {
		...sourceEvidence,
	}
	const stages = [
		stage(firstId, FIRST_RGB, 0, 0, 0, 18, options.wrongFirstRegionStart ?? 0, pathPopulation),
		stage(middleId, MIDDLE_RGB, 3, 1, 0.5, middlePopulation, 3, pathPopulation),
		stage(secondId, SECOND_RGB, 7, 2, 1, 18, 7, pathPopulation),
	]
	const backgroundTopologyEndpoint = options.backgroundTopologyEndpoint ?? "low"
	const topology = options.topology ?? "linear"
	const direction = options.direction ?? "horizontal"
	const centerByDirection = {
		"center-0.35-0.50": [0.35, 0.5] as const,
		"center-0.65-0.50": [0.65, 0.5] as const,
		"center-0.50-0.65": [0.5, 0.65] as const,
	}
	const spatialCenter = "spatialCenter" in options
		? options.spatialCenter!
		: direction in centerByDirection
			? centerByDirection[direction as keyof typeof centerByDirection]
			: topology === "radial-center"
				? [0.5, 0.5] as const
				: topology === "radial-upper-center" ? [0.5, 0.35] as const : null
	const backgroundFamilyId = backgroundTopologyEndpoint === "low" ? firstId : secondId
	const surfaceFamilyId = backgroundTopologyEndpoint === "low" ? secondId : firstId
	const roleAssignment: FieldRoleAssignmentEvidence = {
		backgroundFamilyId,
		surfaceFamilyId,
		backgroundProfile: profile(0.9),
		surfaceProfile: profile(0.6),
		decisiveCriterion: "frameCoverage",
		confidence: 0.3,
	}
	const gradientEvidence = {
		topology,
		direction,
		endpointBands: [0.15, 0.85] as const,
		progression: 0.9,
		modeProgression: 0.8,
		monotonicity: 0.9,
		residual: 0.02,
		span: 0.4,
		texture: 0.02,
		bandDispersion: 0.05,
		edgeContinuity: 0.9,
		coverage: 1,
		supportingFamilyIds: [firstId, secondId] as const,
		supportingEndpointHexes: [rgbToHex(FIRST_RGB), rgbToHex(SECOND_RGB)] as const,
		backgroundTopologyEndpoint,
		roleAssignment,
		fieldDomainId: `field-domain:${id}`,
		fieldDomainPopulationFraction: 1,
		fieldDomainBorderCoverage: 1,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: stages.map(({ regionId }) => regionId),
	}
	const hypothesis: FieldHypothesis = {
		id: `hypothesis:${id}`,
		kind: "gradient-field",
		backgroundFamilyId,
		surfaceFamilyId,
		backgroundRepresentatives: [],
		surfaceRepresentatives: [],
		fieldFidelity: options.fieldFidelity ?? 0.9,
		surfaceContribution: 0.8,
		spatialRelation: null,
		roleAssignment,
		gradientEvidence,
		pruningNotes: [],
	}
	const rejectionReasons = options.strictIntervalOnly
		? [ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS[0]]
		: []
	const path: SupportedFieldTransitionPathEvidence = {
		fieldDomainId: gradientEvidence.fieldDomainId,
		topology,
		direction,
		spatialCenter,
		endpointFamilyIds: [firstId, secondId],
		endpointInterval: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
		stageFamilyIds: stages.map(({ familyId }) => familyId),
		stageRegionIds: stages.map(({ regionId }) => regionId),
		stagePositions: stages.map(({ spatialPosition }) => spatialPosition),
		stageColorPositions: stages.map(({ colorPosition }) => colorPosition),
		stagePopulationFractions: stages.map(({ populationFraction }) => populationFraction),
		stages,
		acceptedIntermediateSupport: [stages[1]],
		transitionFamilyCount: 1,
		transitionPopulationFraction: middlePopulation / pathPopulation,
		transitionQuadrantCoverage: 1,
		connected: true,
		legacyEligible: true,
		eligible: !options.strictIntervalOnly,
		rejectionReasons,
		hypothesis,
	}
	const endpointCustody: AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody = [
		{ familyId: firstId, regionId: stages[0].regionId, exactColor: stages[0].exactColor },
		{ familyId: secondId, regionId: stages[2].regionId, exactColor: stages[2].exactColor },
	]
	const bundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		path,
		endpointCustody,
		FAMILY_BIN_STEP,
	)
	return { sourceEvidence, treatmentEvidence, path, bundle }
}

function withSpatialCenter(
	value: Fixture,
	spatialCenter: SupportedFieldTransitionPathEvidence["spatialCenter"],
): Fixture {
	const path = { ...value.path, spatialCenter }
	return { ...value, path, bundle: { ...value.bundle, path } }
}

function expandedRoleFixture(
	foregroundCount = 13,
	accentCount = 2,
	id = `expanded-${foregroundCount}-${accentCount}`,
): Fixture {
	const width = Math.max(45, 2 * (foregroundCount + accentCount) + 10)
	const height = 6
	const pixelCount = width * height
	const firstId = "expanded-field-first"
	const middleId = "expanded-field-middle"
	const secondId = "expanded-field-second"
	const roleDefinitions = [
		...Array.from({ length: foregroundCount }, (_, index) => ({
			id: `expanded-copy-${String(index).padStart(3, "0")}`,
			rgb: [242 - index % 20, 246 - index % 17, 238 - index % 13] as RGB,
			foreground: 0.9 - index * 0.001,
			signature: 0.05,
		})),
		...Array.from({ length: accentCount }, (_, index) => ({
			id: `expanded-mark-${String(index).padStart(3, "0")}`,
			rgb: (index % 4 === 0 ? [225, 35, 102]
				: index % 4 === 1 ? [22, 184, 156]
					: index % 4 === 2 ? [180, 72, 218] : [238, 112, 28]) as RGB,
			foreground: 0.1,
			signature: 0.9 - index * 0.001,
		})),
	]
	const roleStartByPixel = new Map<number, number>()
	roleDefinitions.forEach((_role, index) => {
		const start = 2 * width + 4 + index * 2
		roleStartByPixel.set(start, index)
		roleStartByPixel.set(start + 1, index)
	})
	const firstPopulation = 3 * height
	const secondPopulation = 3 * height
	const middlePopulation = (width - 6) * height - roleDefinitions.length * 2
	const pathPopulation = firstPopulation + middlePopulation + secondPopulation
	const dynamicFamily = (
		familyId: string,
		rgb: RGB,
		startPixelIndex: number,
		population: number,
		bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>,
		roles: Readonly<{ field: number; foreground: number; signature: number }>,
	): ColorFamilyEvidence => {
		const base = family(
			familyId,
			rgb,
			startPixelIndex,
			population,
			bounds.minX,
			bounds.maxX,
			roles,
			bounds.minY,
			bounds.maxY,
		)
		const componentId = `${familyId}-region-${startPixelIndex}`
		return {
			...base,
			populationFraction: population / pixelCount,
			centroid: [
				(bounds.minX + bounds.maxX) / 2 / (width - 1),
				(bounds.minY + bounds.maxY) / 2 / (height - 1),
			],
			largestComponentFraction: population / pixelCount,
			foregroundPolarityObservation: {
				...base.foregroundPolarityObservation,
				componentIds: [componentId],
			},
			components: [{
				...base.components[0],
				id: componentId,
				startPixelIndex,
				population,
				populationFraction: population / pixelCount,
				...bounds,
			}],
			representatives: [{
				...base.representatives[0],
				support: {
					...base.representatives[0].support,
					exactSource: true,
					exemplar: {
						x: startPixelIndex % width,
						y: Math.floor(startPixelIndex / width),
					},
					anchorFamilyId: familyId,
					regionIds: [componentId],
					totalSupport: population / pixelCount,
					connectedSupport: population / pixelCount,
				},
			}],
		}
	}
	const families = [
		dynamicFamily(firstId, FIRST_RGB, 0, firstPopulation,
			{ minX: 0, minY: 0, maxX: 2, maxY: height - 1 },
			{ field: 0.95, foreground: 0.05, signature: 0.05 }),
		dynamicFamily(middleId, MIDDLE_RGB, 3, middlePopulation,
			{ minX: 3, minY: 0, maxX: width - 4, maxY: height - 1 },
			{ field: 0.8, foreground: 0.05, signature: 0.05 }),
		dynamicFamily(secondId, SECOND_RGB, width - 3, secondPopulation,
			{ minX: width - 3, minY: 0, maxX: width - 1, maxY: height - 1 },
			{ field: 0.65, foreground: 0.05, signature: 0.05 }),
		...roleDefinitions.map((role, index) => {
			const startPixelIndex = 2 * width + 4 + index * 2
			return dynamicFamily(
				role.id,
				role.rgb,
				startPixelIndex,
				2,
				{ minX: 4 + index * 2, minY: 2, maxX: 5 + index * 2, maxY: 2 },
				{ field: 0.03, foreground: role.foreground, signature: role.signature },
			)
		}),
	]
	const rgbData = new Uint8Array(pixelCount * 3)
	const labs = new Float32Array(pixelCount * 3)
	const familyAt = new Uint16Array(pixelCount)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixelIndex = y * width + x
			let familyIndex = x <= 2 ? 0 : x >= width - 3 ? 2 : 1
			const roleIndex = roleStartByPixel.get(pixelIndex)
			if (roleIndex !== undefined) familyIndex = 3 + roleIndex
			const rgb = families[familyIndex].representatives[0].rgb
			rgbData.set(rgb, pixelIndex * 3)
			labs.set(rgbToOKLab(rgb), pixelIndex * 3)
			familyAt[pixelIndex] = familyIndex
		}
	}
	const foregroundIds = roleDefinitions.slice(0, foregroundCount).map(({ id: familyId }) => familyId)
	const accentIds = roleDefinitions.slice(foregroundCount).map(({ id: familyId }) => familyId)
	const sourceEvidence: NativePaletteEvidence = {
		width,
		height,
		pixelCount,
		rgbData,
		labs,
		familyAt,
		families,
		adjacencies: [],
		retainedFamilyIds: families.map(({ id: familyId }) => familyId),
		lanes: [
			{ name: "field", maximumFamilies: 3, familyIds: [firstId, middleId, secondId] },
			{ name: "signature", maximumFamilies: accentIds.length, familyIds: accentIds },
			{ name: "foreground", maximumFamilies: foregroundIds.length, familyIds: foregroundIds },
		],
		laneRetention: [],
		familyBinStep: FAMILY_BIN_STEP,
		familyAnchorRadius: 0.04,
	}
	const exact = (rgb: RGB, pixelIndex: number, familyId: string): FieldTransitionExactStageColor => {
		const regionId = `${familyId}-transition-region-${pixelIndex}`
		return {
			rgb,
			oklab: rgbToOKLab(rgb),
			hex: rgbToHex(rgb),
			provenance: {
				exactSource: true,
				familyId,
				regionId,
				pixelIndex,
				x: pixelIndex % width,
				y: Math.floor(pixelIndex / width),
			},
		}
	}
	const stageValues = [
		{ familyId: firstId, exactColor: exact(FIRST_RGB, 0, firstId), population: firstPopulation,
			spatialPosition: 0, quadrantCoverage: 0.5 },
		{ familyId: middleId, exactColor: exact(MIDDLE_RGB, 3, middleId), population: middlePopulation,
			spatialPosition: 0.5, quadrantCoverage: 1 },
		{ familyId: secondId, exactColor: exact(SECOND_RGB, width - 3, secondId), population: secondPopulation,
			spatialPosition: 1, quadrantCoverage: 0.5 },
	]
	const stages: FieldTransitionPathStageEvidence[] = stageValues.map((value, stageIndex) => ({
		stageIndex,
		familyId: value.familyId,
		regionId: value.exactColor.provenance.regionId,
		spatialPosition: value.spatialPosition,
		colorPosition: value.spatialPosition,
		population: value.population,
		populationFraction: value.population / pathPopulation,
		imagePopulationFraction: value.population / pixelCount,
		quadrantCoverage: value.quadrantCoverage,
		prototype: value.exactColor.oklab,
		exactColor: value.exactColor,
	}))
	const roleAssignment: FieldRoleAssignmentEvidence = {
		backgroundFamilyId: firstId,
		surfaceFamilyId: secondId,
		backgroundProfile: profile(0.9),
		surfaceProfile: profile(0.6),
		decisiveCriterion: "frameCoverage",
		confidence: 0.3,
	}
	const gradientEvidence = {
		topology: "linear" as const,
		direction: "horizontal" as const,
		endpointBands: [0.15, 0.85] as const,
		progression: 0.9,
		modeProgression: 0.8,
		monotonicity: 0.9,
		residual: 0.02,
		span: 0.4,
		texture: 0.02,
		bandDispersion: 0.05,
		edgeContinuity: 0.9,
		coverage: pathPopulation / pixelCount,
		supportingFamilyIds: [firstId, secondId] as const,
		supportingEndpointHexes: [rgbToHex(FIRST_RGB), rgbToHex(SECOND_RGB)] as const,
		backgroundTopologyEndpoint: "low" as const,
		roleAssignment,
		fieldDomainId: `expanded-field-domain:${id}`,
		fieldDomainPopulationFraction: pathPopulation / pixelCount,
		fieldDomainBorderCoverage: 1,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: stages.map(({ regionId }) => regionId),
	}
	const hypothesis: FieldHypothesis = {
		id: `expanded-hypothesis:${id}`,
		kind: "gradient-field",
		backgroundFamilyId: firstId,
		surfaceFamilyId: secondId,
		backgroundRepresentatives: [],
		surfaceRepresentatives: [],
		fieldFidelity: 0.9,
		surfaceContribution: 0.8,
		spatialRelation: null,
		roleAssignment,
		gradientEvidence,
		pruningNotes: [],
	}
	const path: SupportedFieldTransitionPathEvidence = {
		fieldDomainId: gradientEvidence.fieldDomainId,
		topology: "linear",
		direction: "horizontal",
		spatialCenter: null,
		endpointFamilyIds: [firstId, secondId],
		endpointInterval: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
		stageFamilyIds: stages.map(({ familyId }) => familyId),
		stageRegionIds: stages.map(({ regionId }) => regionId),
		stagePositions: stages.map(({ spatialPosition }) => spatialPosition),
		stageColorPositions: stages.map(({ colorPosition }) => colorPosition),
		stagePopulationFractions: stages.map(({ populationFraction }) => populationFraction),
		stages,
		acceptedIntermediateSupport: [stages[1]],
		transitionFamilyCount: 1,
		transitionPopulationFraction: middlePopulation / pathPopulation,
		transitionQuadrantCoverage: 1,
		connected: true,
		legacyEligible: true,
		eligible: true,
		rejectionReasons: [],
		hypothesis,
	}
	const bundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(path, [
		{ familyId: firstId, regionId: stages[0].regionId, exactColor: stages[0].exactColor },
		{ familyId: secondId, regionId: stages[2].regionId, exactColor: stages[2].exactColor },
	], FAMILY_BIN_STEP)
	return { sourceEvidence, treatmentEvidence: sourceEvidence, path, bundle }
}

function identityObligations(): AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput[
	"identityObligations"
] {
	return [{
		id: "identity:mark",
		familyId: "mark-family",
		priority: 0,
		source: {
			regionIds: ["mark-family-region-44"],
			connectedPopulationFraction: 4 / PIXEL_COUNT,
			materialDistanceFromField: 0.2,
			signatureRoleScore: 0.95,
			signatureEvidenceLevel: 23,
			regionEvidenceLevel: 23,
		},
	}]
}

function genuineBaselineEvaluation(
	value: Fixture,
	obligations: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput["identityObligations"],
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation {
	const backgroundFamily = value.treatmentEvidence.families.find(({ id }) =>
		id === value.path.endpointFamilyIds[0])!
	const hypothesis: FieldHypothesis = {
		id: `fixed-baseline:${value.path.fieldDomainId}`,
		kind: "one-field",
		backgroundFamilyId: backgroundFamily.id,
		surfaceFamilyId: null,
		backgroundRepresentatives: backgroundFamily.representatives,
		surfaceRepresentatives: backgroundFamily.representatives,
		fieldFidelity: 0.9,
		surfaceContribution: 0,
		spatialRelation: null,
		roleAssignment: null,
		gradientEvidence: null,
		pruningNotes: [],
	}
	const generated = generateCompletePaletteTreatments(value.treatmentEvidence, [hypothesis])
	const selection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		generated.completeTreatments,
		{ obligations },
	)
	return selection.evaluations.find(({ key }) => key === selection.explanation.winner.key)!
}

function genuineEvaluationAtQuality(
	reference: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	targetQualityUtility: number,
	obligations: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput["identityObligations"],
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation {
	const scoreAxes: ReadonlyArray<readonly [
		keyof CompletePaletteTreatment["scores"],
		keyof typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights,
	]> = [
		["fieldFidelity", "fieldFidelity"],
		["surfaceFidelity", "surfaceFidelity"],
		["artworkIdentity", "artworkIdentity"],
		["representativeness", "representativeness"],
		["accentFidelity", "accentFidelity"],
		["coherence", "coherence"],
		["economy", "economy"],
	]
	let treatment: CompletePaletteTreatment = {
		...reference.treatment,
		id: `fixed-quality-reference:${reference.treatment.id}`,
		scores: { ...reference.treatment.scores },
	}
	const evaluate = (): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation =>
		selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
			[treatment],
			{ obligations },
		).evaluations[0]
	let evaluation = evaluate()
	for (const [scoreAxis, qualityAxis] of scoreAxes) {
		const remaining = targetQualityUtility - evaluation.qualityUtility
		if (remaining <= 1e-12) break
		const weight = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY
			.qualityWeights[qualityAxis]
		const increase = Math.min(1 - treatment.scores[scoreAxis], remaining / weight)
		if (increase <= 0) continue
		treatment = {
			...treatment,
			scores: { ...treatment.scores, [scoreAxis]: treatment.scores[scoreAxis] + increase },
		}
		evaluation = evaluate()
	}
	assert.ok(Math.abs(evaluation.qualityUtility - targetQualityUtility) <= 1e-12,
		`unable to construct genuine baseline quality ${targetQualityUtility}`)
	return evaluation
}

function input(
	value: Fixture,
	overrides: Partial<AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput> = {},
): AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput {
	const obligations = identityObligations()
	return {
		sourceEvidence: value.sourceEvidence,
		treatmentEvidence: value.treatmentEvidence,
		renderBundles: [value.bundle],
		identityObligations: obligations,
		baselineUnrestrictedWinnerEvaluation: genuineBaselineEvaluation(value, obligations),
		...overrides,
	}
}

test("endpoint materialization preserves path orientation and exact component custody", () => {
	for (const backgroundTopologyEndpoint of ["low", "high"] as const) {
		const value = fixture({ id: `orientation-${backgroundTopologyEndpoint}`, backgroundTopologyEndpoint })
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
		const bundle = result.diagnostics.bundles[0]
		const expectedBackground = backgroundTopologyEndpoint === "low"
			? value.path.stages[0]
			: value.path.stages.at(-1)!
		const expectedSurface = backgroundTopologyEndpoint === "low"
			? value.path.stages.at(-1)!
			: value.path.stages[0]

		assert.equal(bundle.status, "materialized")
		assert.equal(bundle.endpointCustody?.[0].pathEndpointIndex, 0)
		assert.equal(bundle.endpointCustody?.[0].componentStartPixelIndex, 0)
		assert.equal(bundle.endpointCustody?.[1].componentStartPixelIndex, 7)
		assert.equal(bundle.gradientHypothesis?.backgroundRepresentatives[0].hex,
			expectedBackground.exactColor.hex)
		assert.equal(bundle.gradientHypothesis?.surfaceRepresentatives[0].hex,
			expectedSurface.exactColor.hex)
		assert.deepEqual(bundle.gradientHypothesis?.gradientEvidence?.supportingEndpointHexes,
			value.path.stages.filter((_, index) => index !== 1).map(({ exactColor }) => exactColor.hex))
		assert.equal(result.selected?.treatment.background.hex, expectedBackground.exactColor.hex)
		assert.equal(result.selected?.treatment.surface.hex, expectedSurface.exactColor.hex)
	}
})

test("an exact path region mismatch fails closed before treatment construction", () => {
	const value = fixture({ id: "wrong-region", wrongFirstRegionStart: 1 })
	assert.equal(value.bundle.eligible, true)
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))

	assert.equal(result.selected, null)
	assert.deepEqual(result.candidates, [])
	assert.equal(result.diagnostics.bundles[0].status, "rejected")
	assert.ok(result.diagnostics.bundles[0].rejectionReasons.includes(
		"path-stage-pixel-rgb-family-component-or-region-custody-mismatch"))
})

test("legacy-admissible strict-interval paths still materialize all source renders", () => {
	const value = fixture({ id: "strict-interval", strictIntervalOnly: true })
	assert.equal(value.path.eligible, false)
	assert.equal(value.bundle.eligible, true)
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))

	assert.equal(result.diagnostics.bundles[0].status, "materialized")
	assert.deepEqual(result.diagnostics.bundles[0].preselectionRenderIds,
		value.bundle.candidates.map(({ id }) => id).sort())
	assert.deepEqual(new Set(result.candidates.map(({ render }) => render.kind)),
		new Set(["flat", "supported-two-stop", "supported-three-stop"]))
})

test("declared radial-offset center directions reach complete role-binding render materialization", () => {
	for (const direction of [
		"center-0.35-0.50",
		"center-0.65-0.50",
		"center-0.50-0.65",
	] as const) {
		const value = fixture({ id: `radial-offset-${direction}`, topology: "radial-offset", direction })
		assert.equal(value.bundle.eligible, true)
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
		const diagnostic = result.diagnostics.bundles[0]

		assert.equal(diagnostic.status, "materialized", direction)
		assert.ok(diagnostic.sharedRoleBindingCount > 0, direction)
		assert.equal(diagnostic.gradientHypothesis?.gradientEvidence?.topology, "radial-offset")
		assert.equal(diagnostic.gradientHypothesis?.gradientEvidence?.direction, direction)
		assert.equal(result.candidates.length,
			diagnostic.sharedRoleBindingCount * value.bundle.candidates.length)
	}
})

test("source radial center partitions accept near, boundary, and deterministic tie centers", () => {
	const geometries = [
		{ id: "center-radius-boundary", topology: "radial-center" as const,
			direction: "center-out" as const, spatialCenter: [0.58, 0.5] as const },
		{ id: "center-upper-overlap-precedence", topology: "radial-center" as const,
			direction: "center-out" as const, spatialCenter: [0.5, 0.43] as const },
		{ id: "upper-left-lower-boundary", topology: "radial-upper-center" as const,
			direction: "center-out" as const, spatialCenter: [0.4, 0.2] as const },
		{ id: "upper-right-upper-boundary", topology: "radial-upper-center" as const,
			direction: "center-out" as const, spatialCenter: [0.6, 0.44] as const },
		{ id: "offset-left-near", topology: "radial-offset" as const,
			direction: "center-0.35-0.50" as const, spatialCenter: [0.32, 0.52] as const },
		{ id: "offset-right-near", topology: "radial-offset" as const,
			direction: "center-0.65-0.50" as const, spatialCenter: [0.68, 0.48] as const },
		{ id: "offset-lower-near", topology: "radial-offset" as const,
			direction: "center-0.50-0.65" as const, spatialCenter: [0.52, 0.7] as const },
		{ id: "offset-center-boundary-exterior", topology: "radial-offset" as const,
			direction: "center-0.65-0.50" as const, spatialCenter: [0.580000000001, 0.5] as const },
		{ id: "offset-ascii-tie", topology: "radial-offset" as const,
			direction: "center-0.35-0.50" as const, spatialCenter: [0.2, 0.8] as const },
		{ id: "offset-normalized-boundary-tie", topology: "radial-offset" as const,
			direction: "center-0.35-0.50" as const, spatialCenter: [0, 1] as const },
	]
	for (const geometry of geometries) {
		const value = fixture(geometry)
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))

		assert.equal(result.diagnostics.bundles[0].status, "materialized", geometry.id)
		assert.ok(result.candidates.length > 0, geometry.id)
	}
})

test("incoherent source radial center custody fails before supplemental construction", () => {
	const cases = [
		{ id: "linear-center", fixture: { topology: "linear" as const, direction: "horizontal" as const },
			spatialCenter: [0.5, 0.5] as const },
		{ id: "center-missing", fixture: { topology: "radial-center" as const, direction: "center-out" as const },
			spatialCenter: null },
		{ id: "upper-center-missing", fixture: {
			topology: "radial-upper-center" as const, direction: "center-out" as const,
		}, spatialCenter: null },
		{ id: "offset-missing", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: null },
		{ id: "center-outside-radius", fixture: {
			topology: "radial-center" as const, direction: "center-out" as const,
		}, spatialCenter: [0.59, 0.5] as const },
		{ id: "upper-center-outside-band", fixture: {
			topology: "radial-upper-center" as const, direction: "center-out" as const,
		}, spatialCenter: [0.5, 0.45] as const },
		{ id: "upper-center-inside-center-partition", fixture: {
			topology: "radial-upper-center" as const, direction: "center-out" as const,
		}, spatialCenter: [0.5, 0.43] as const },
		{ id: "offset-inside-center-region", fixture: {
			topology: "radial-offset" as const, direction: "center-0.65-0.50" as const,
		}, spatialCenter: [0.57, 0.5] as const },
		{ id: "offset-inside-upper-region", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: [0.4, 0.2] as const },
		{ id: "stale-offset-center", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: [0.99, 0.99] as const },
		{ id: "wrong-nearest-direction", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: [0.68, 0.48] as const },
		{ id: "wrong-ascii-tie-direction", fixture: {
			topology: "radial-offset" as const, direction: "center-0.50-0.65" as const,
		}, spatialCenter: [0.2, 0.8] as const },
		{ id: "offset-x-out-of-bounds", fixture: {
			topology: "radial-offset" as const, direction: "center-0.65-0.50" as const,
		}, spatialCenter: [1.01, 0.5] as const },
		{ id: "offset-y-out-of-bounds", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: [0.35, -0.01] as const },
		{ id: "offset-nan", fixture: {
			topology: "radial-offset" as const, direction: "center-0.35-0.50" as const,
		}, spatialCenter: [Number.NaN, 0.5] as const },
	]
	for (const value of cases) {
		const original = fixture({ id: value.id, ...value.fixture })
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(
			input(withSpatialCenter(original, value.spatialCenter)),
		)
		const diagnostic = result.diagnostics.bundles[0]

		assert.equal(diagnostic.status, "rejected", value.id)
		assert.deepEqual(diagnostic.rejectionReasons,
			["path-spatial-center-topology-direction-custody-is-invalid"], value.id)
		assert.equal(diagnostic.gradientHypothesis, null, value.id)
		assert.equal(diagnostic.generatedGradientTreatmentCount, 0, value.id)
	}
})

test("invalid topology and direction pairings fail at center custody before supplemental construction", () => {
	for (const geometry of [
		{ topology: "radial-offset" as const, direction: "center-out" as const },
		{ topology: "linear" as const, direction: "center-0.35-0.50" as const },
		{ topology: "radial-center" as const, direction: "center-0.65-0.50" as const },
	]) {
		const value = fixture({ id: `invalid-${geometry.topology}-${geometry.direction}`, ...geometry })
		assert.equal(value.bundle.eligible, true)
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))

		assert.equal(result.selected, null)
		assert.ok(result.diagnostics.bundles[0].rejectionReasons.includes(
			"path-spatial-center-topology-direction-custody-is-invalid"))
		assert.equal(result.diagnostics.bundles[0].gradientHypothesis, null)
	}
})

test("flat, two-stop, and every three-stop candidate enter complete preselection", () => {
	const value = fixture({ id: "all-renders" })
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
	const kinds = result.candidates.map(({ render }) => render.kind)
	const flat = result.candidates.find(({ render }) => render.kind === "flat")!
	const two = result.candidates.find(({ render }) => render.kind === "supported-two-stop")!
	const threes = result.candidates.filter(({ render }) => render.kind === "supported-three-stop")

	assert.ok(kinds.includes("flat"))
	assert.ok(kinds.includes("supported-two-stop"))
	assert.ok(threes.length > 0)
	assert.equal(result.candidates.length,
		result.diagnostics.bundles[0].sharedRoleBindingCount * value.bundle.candidates.length)
	assert.equal(result.diagnostics.bundles[0].completeCrossProductCount, result.candidates.length)
	assert.equal(flat.treatment.fieldTreatment, "separate-flat-fields")
	assert.equal(flat.treatment.gradient, false)
	assert.equal(flat.treatment.gradientEvidence, null)
	assert.equal(flat.treatment.collapse.surface, false)
	assert.notEqual(flat.treatment.background.hex, flat.treatment.surface.hex)
	assert.equal(two.treatment.gradient, true)
	const bindingThrees = threes.filter(({ roleBindingKey }) => roleBindingKey === two.roleBindingKey)
	assert.ok(bindingThrees.every(({ publicTreatmentKey }) => publicTreatmentKey === two.publicTreatmentKey))
	assert.ok(new Set([two.renderKey, ...bindingThrees.map(({ renderKey }) => renderKey)]).size > 1)
	assert.notStrictEqual(flat.treatment.contrast, two.treatment.contrast)
	assert.notStrictEqual(flat.treatment.scores, two.treatment.scores)
	assert.notDeepEqual(flat.treatment.contrast.pairs, two.treatment.contrast.pairs)
	assert.notDeepEqual(flat.treatment.scores, two.treatment.scores)
	assert.ok(flat.treatment.contrast.pairs.some(({ fieldRole }) => fieldRole !== "gradient-sample"))
	assert.ok(two.treatment.contrast.pairs.every(({ fieldRole }) => fieldRole === "gradient-sample"))
	assert.notEqual(flat.recoveryEvaluation.qualityUtility, two.recoveryEvaluation.qualityUtility)
})

test("the selected shared role binding causes both base treatments and ordinary lineage", () => {
	const value = fixture({ id: "shared-causality" })
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
	const diagnostic = result.diagnostics.bundles[0]
	const selectedBinding = diagnostic.sharedRoleBindings.find(({ selected }) => selected)!
	const flat = result.candidates.find(({ render }) => render.kind === "flat")!
	const gradient = result.candidates.find(({ render }) => render.kind === "supported-two-stop")!

	assert.equal(diagnostic.selectedRoleBindingKey, selectedBinding.key)
	assert.equal(flat.roleBindingKey, gradient.roleBindingKey)
	assert.equal(flat.treatment.familyRoles.foreground, gradient.treatment.familyRoles.foreground)
	assert.equal(flat.treatment.foreground.hex, gradient.treatment.foreground.hex)
	assert.equal(flat.treatment.familyRoles.accent, gradient.treatment.familyRoles.accent)
	assert.equal(flat.treatment.accent.hex, gradient.treatment.accent.hex)
	assert.equal(flat.treatment.collapse.accent, gradient.treatment.collapse.accent)
	assert.deepEqual(flat.treatment.foreground, gradient.treatment.foreground)
	assert.deepEqual(flat.treatment.accent, gradient.treatment.accent)
	assert.deepEqual(flat.treatment.foreground.support, gradient.treatment.foreground.support)
	assert.deepEqual(flat.treatment.accent.support, gradient.treatment.accent.support)
	assert.deepEqual(diagnostic.selectedRoleCustody.map(({ role, componentStartPixelIndex }) => ({
		role,
		componentStartPixelIndex,
	})), [
		{ role: "background", componentStartPixelIndex: 0 },
		{ role: "surface", componentStartPixelIndex: 7 },
		{ role: "foreground", componentStartPixelIndex: 14 },
		{ role: "accent", componentStartPixelIndex: 44 },
	])
	for (const candidate of [flat, gradient]) {
		assert.equal(candidate.ordinaryCompleteLineage.evaluation.ordinaryEligible, true)
		assert.equal(candidate.ordinaryCompleteLineage.candidateEligibility.basis,
			"ordinary-complete-source-lineage")
		assert.equal(candidate.ordinaryCompleteLineage.candidateEligibility.eligible, true)
	}
})

test("outer path lineage contains every stage plus exact endpoint and midpoint provenance", () => {
	const value = fixture({ id: "outer-lineage" })
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
	const three = result.candidates.find(({ render }) => render.kind === "supported-three-stop")!

	assert.equal(three.pathLineage.stages.length, value.path.stages.length)
	assert.deepEqual(three.pathLineage.stages.map(({ exactColor }) => exactColor.provenance),
		value.path.stages.map(({ exactColor }) => exactColor.provenance))
	assert.deepEqual(three.pathLineage.endpoints.map(({ exactColor }) => exactColor.provenance), [
		value.path.stages[0].exactColor.provenance,
		value.path.stages.at(-1)!.exactColor.provenance,
	])
	assert.deepEqual(three.pathLineage.midpoint?.exactColor.provenance,
		value.path.stages[1].exactColor.provenance)
	assert.equal(three.numericsCustody.completeTreatmentSource,
		"reused-endpoint-gradient-treatment-for-three-stop-render")
	assert.equal(three.numericsCustody.contrastAndQualityIndependentlyGeneratedForThisRender, false)
	assert.equal(three.numericsCustody.threeStopAPCARecomputed, false)
	assert.equal(three.numericsCustody.renderFidelitySeparatelyScored, true)
})

test("the fixed baseline quality gate includes the exact 0.12 boundary and excludes excess loss", () => {
	const value = fixture({ id: "quality-boundary", fieldFidelity: 0.45 })
	const initialInput = input(value)
	const initial = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(initialInput)
	const target = initial.candidates[0]
	const boundaryEvaluation = genuineEvaluationAtQuality(
		target.recoveryEvaluation,
		target.recoveryEvaluation.qualityUtility + 0.12,
		initialInput.identityObligations,
	)
	const beyondEvaluation = genuineEvaluationAtQuality(
		target.recoveryEvaluation,
		target.recoveryEvaluation.qualityUtility + 0.120001,
		initialInput.identityObligations,
	)
	const boundary = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		baselineUnrestrictedWinnerEvaluation: boundaryEvaluation,
	}))
	const beyond = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		baselineUnrestrictedWinnerEvaluation: beyondEvaluation,
	}))

	assert.equal(boundary.candidates.find(({ renderKey }) => renderKey === target.renderKey)?.withinQualityBound, true)
	assert.equal(beyond.candidates.find(({ renderKey }) => renderKey === target.renderKey)?.withinQualityBound, false)
	assert.ok(Math.abs(boundary.diagnostics.qualityFloor -
		target.recoveryEvaluation.qualityUtility) <= 1e-12)
})

test("render fidelity orders two and three sharing one public treatment and ASCII resolves a genuine tie", () => {
	const value = fixture({ id: "fidelity-order" })
	const first = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))
	const gradients = first.candidates.filter(({ render }) => render.kind !== "flat")
	for (const bindingKey of new Set(gradients.map(({ roleBindingKey }) => roleBindingKey))) {
		const bindingGradients = gradients.filter(({ roleBindingKey }) => roleBindingKey === bindingKey)
		const expected = [...bindingGradients].sort((left, right) =>
			right.render.fidelity.level - left.render.fidelity.level ||
			right.render.fidelity.value - left.render.fidelity.value ||
			left.render.stopCount - right.render.stopCount ||
			(left.renderKey < right.renderKey ? -1 : 1))
		assert.deepEqual(bindingGradients.map(({ renderKey }) => renderKey),
			expected.map(({ renderKey }) => renderKey))
	}
	const tiedValue = fixture({ id: "fidelity-tie-a" })
	const tiedOther = fixture({ id: "fidelity-tie-b" })
	const tied = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(tiedValue, {
		renderBundles: [tiedOther.bundle, tiedValue.bundle],
	}))
	const tiedBinding = tied.candidates[0].roleBindingKey
	const tiedThrees = tied.candidates.filter(({ render, roleBindingKey }) =>
		render.kind === "supported-three-stop" && roleBindingKey === tiedBinding)
	assert.equal(tiedThrees.length, 2)
	assert.equal(tiedThrees[0].render.fidelity.value, tiedThrees[1].render.fidelity.value)
	assert.ok(tiedThrees[0].renderKey < tiedThrees[1].renderKey)
})

test("final comparison can select a binding that is not first by minimum pair quality", () => {
	const value = fixture({ id: "full-domain-winner", secondForeground: true })
	const obligations = [{
		id: "identity:second-copy",
		familyId: "copy-family-second",
		priority: 0,
		source: {
			regionIds: ["copy-family-second-region-4"],
			connectedPopulationFraction: 2 / PIXEL_COUNT,
			materialDistanceFromField: 0.2,
			signatureRoleScore: 0.88,
			signatureEvidenceLevel: 22,
			regionEvidenceLevel: 22,
		},
	}]
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		identityObligations: obligations,
		baselineUnrestrictedWinnerEvaluation: genuineBaselineEvaluation(value, obligations),
	}))
	const diagnostic = result.diagnostics.bundles[0]
	const minimumFirst = [...diagnostic.sharedRoleBindings].sort((first, second) =>
		second.minimumQualityUtilityLevel - first.minimumQualityUtilityLevel ||
		second.minimumQualityUtility - first.minimumQualityUtility ||
		second.minimumIdentityCoverage - first.minimumIdentityCoverage ||
		(first.key < second.key ? -1 : 1))[0]
	const selected = diagnostic.sharedRoleBindings.find(({ selected }) => selected)!
	assert.ok(diagnostic.sharedRoleBindingCount > 1)
	assert.equal(selected.key, result.selected?.roleBindingKey)
	assert.notEqual(selected.key, minimumFirst.key)
	assert.equal(selected.foregroundFamilyId, "copy-family-second")
	assert.equal(diagnostic.sharedRoleBindings.filter(({ selected: value }) => value).length, 1)
})

test("bundle and render permutations cannot change materialization or selection", () => {
	const firstFixture = fixture({ id: "permutation-b" })
	const secondFixture = fixture({ id: "permutation-a", backgroundTopologyEndpoint: "high" })
	const firstBundle = {
		...firstFixture.bundle,
		candidates: [...firstFixture.bundle.candidates].reverse(),
	}
	const first = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(firstFixture, {
		renderBundles: [firstBundle, secondFixture.bundle],
	}))
	const second = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(firstFixture, {
		renderBundles: [secondFixture.bundle, firstFixture.bundle],
	}))

	assert.equal(first.selected?.renderKey, second.selected?.renderKey)
	assert.deepEqual(first.candidates.map(({ renderKey }) => renderKey),
		second.candidates.map(({ renderKey }) => renderKey))
	assert.deepEqual(first.diagnostics.bundles.map(({ bundleId }) => bundleId),
		second.diagnostics.bundles.map(({ bundleId }) => bundleId))
})

test("mutated fidelity, path support, and source lineage metrics fail closed", () => {
	const value = fixture({ id: "mutated-core-custody" })
	const mutatedFidelity = structuredClone(value.bundle) as any
	mutatedFidelity.candidates[0].fidelity.value += 0.001
	const mutatedSupport = structuredClone(value.bundle) as any
	mutatedSupport.support.transitionPopulationFraction += 0.01
	const mutatedLineage = structuredClone(value.bundle) as any
	mutatedLineage.path.stages[1].population += 1

	const fidelityResult = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		renderBundles: [mutatedFidelity],
	}))
	const supportResult = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		renderBundles: [mutatedSupport],
	}))
	const lineageResult = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		renderBundles: [mutatedLineage],
	}))

	assert.equal(fidelityResult.selected, null)
	assert.ok(fidelityResult.diagnostics.bundles[0].rejectionReasons.includes(
		"render-fidelity-support-or-core-identity-mismatch"))
	assert.equal(supportResult.selected, null)
	assert.ok(supportResult.diagnostics.bundles[0].rejectionReasons.includes(
		"render-fidelity-support-or-core-identity-mismatch"))
	assert.equal(lineageResult.selected, null)
	assert.ok(lineageResult.diagnostics.bundles[0].rejectionReasons.includes(
		"path-stage-source-population-or-coverage-metrics-mismatch"))
})

test("coordinated endpoint, midpoint, and stop position tampering cannot survive core rebinding", () => {
	const value = fixture({ id: "position-rebinding" })
	const mutations: Array<Readonly<{ label: string; mutate: (bundle: any) => void }>> = []
	for (const endpointIndex of [0, 1] as const) {
		for (const field of ["position", "sourceSpatialPosition", "sourceColorPosition"] as const) {
			mutations.push({
				label: `endpoint-${endpointIndex}-${field}`,
				mutate(bundle) {
					const replacement = endpointIndex === 0 ? 0.1 : 0.9
					bundle.endpoints[endpointIndex][field] = replacement
					for (const candidate of bundle.candidates) {
						candidate.endpoints[endpointIndex][field] = replacement
						if (candidate.stops.length > 0) {
							candidate.stops[endpointIndex === 0 ? 0 : candidate.stops.length - 1][field] = replacement
						}
					}
				},
			})
		}
	}
	for (const field of ["position", "sourceSpatialPosition", "sourceColorPosition"] as const) {
		mutations.push({
			label: `midpoint-${field}`,
			mutate(bundle) {
				const candidate = bundle.candidates.find(({ kind }: { kind: string }) =>
					kind === "supported-three-stop")
				candidate.midpoint[field] = 0.4
				candidate.stops[1][field] = 0.4
			},
		})
	}
	for (const { label, mutate } of mutations) {
		const bundle = structuredClone(value.bundle) as any
		mutate(bundle)
		const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
			renderBundles: [bundle],
		}))
		assert.equal(result.selected, null, label)
		assert.equal(result.diagnostics.bundles[0].status, "rejected", label)
	}
})

test("orphan role families and incorrect source support regions cannot materialize", () => {
	const value = fixture({ id: "role-source-rejection" })
	const orphanSource = {
		...value.sourceEvidence,
		families: value.sourceEvidence.families.slice(0, 3),
	}
	const wrongSupportTreatment = structuredClone(value.treatmentEvidence) as any
	wrongSupportTreatment.families[3].representatives[0].support.regionIds = ["copy-family-region-orphan"]
	const orphan = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		sourceEvidence: orphanSource,
	}))
	const wrongSupport = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		treatmentEvidence: wrongSupportTreatment,
	}))

	assert.equal(orphan.selected, null)
	assert.equal(wrongSupport.selected, null)
	assert.ok(orphan.diagnostics.bundles[0].validFlatTreatmentCount === 0)
	assert.ok(wrongSupport.diagnostics.bundles[0].validGradientTreatmentCount === 0)
})

test("role exemplar RGB and retained component population must match the source raster", () => {
	const value = fixture({ id: "role-raster-rejection" })
	const wrongRgbData = new Uint8Array(value.sourceEvidence.rgbData)
	wrongRgbData[14 * 3] += 1
	const wrongRgbSource = { ...value.sourceEvidence, rgbData: wrongRgbData }
	const wrongComponentSource = structuredClone(value.sourceEvidence) as any
	wrongComponentSource.families[3].components[0].population += 1
	const wrongRgb = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		sourceEvidence: wrongRgbSource,
	}))
	const wrongComponent = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		sourceEvidence: wrongComponentSource,
	}))

	assert.equal(wrongRgb.selected, null)
	assert.equal(wrongComponent.selected, null)
	assert.equal(wrongRgb.diagnostics.bundles[0].validFlatTreatmentCount, 0)
	assert.equal(wrongComponent.diagnostics.bundles[0].validGradientTreatmentCount, 0)
})

test("baseline custody requires a complete genuine recovery evaluation", () => {
	const value = fixture({ id: "baseline-custody" })
	const validInput = input(value)
	assert.doesNotThrow(() =>
		materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(validInput))
	assert.throws(() => materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates({
		...validInput,
		baselineUnrestrictedWinnerEvaluation: {
			key: validInput.baselineUnrestrictedWinnerEvaluation.key,
			qualityUtility: validInput.baselineUnrestrictedWinnerEvaluation.qualityUtility,
		} as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	}), /complete fixed baseline recovery evaluation/u)
})

test("fixed bundle and per-bundle render bounds fail closed on overflow", () => {
	const value = fixture({ id: "bounds" })
	const tooManyBundles = Array.from(
		{ length: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumBundles + 1 },
		() => value.bundle,
	)
	const tooManyCandidates = {
		...value.bundle,
		candidates: Array.from(
			{ length: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
				.maximumRenderCandidatesPerBundle + 1 },
			() => value.bundle.candidates[0],
		),
	}

	assert.throws(() => materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		renderBundles: tooManyBundles,
	})), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR))
	assert.throws(() => materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		renderBundles: [tooManyCandidates],
	})), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR))
})

test("thirty-nine shared bindings cross every real render candidate without preselection", () => {
	const value = expandedRoleFixture()
	const obligations: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput[
		"identityObligations"
	] = []
	const baseline = genuineBaselineEvaluation(value, obligations)
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		identityObligations: obligations,
		baselineUnrestrictedWinnerEvaluation: baseline,
	}))
	const diagnostic = result.diagnostics.bundles[0]

	assert.equal(value.bundle.candidates.length, 3)
	assert.equal(diagnostic.sharedRoleBindingCount, 39)
	assert.equal(diagnostic.completeCrossProductCount, 39 * 3)
	assert.equal(result.diagnostics.sharedRoleBindingCount, 39)
	assert.equal(result.diagnostics.completeCrossProductCount, 39 * 3)
	assert.equal(result.candidates.length, 39 * 3)
	assert.equal(new Set(result.candidates.map(({ roleBindingKey }) => roleBindingKey)).size, 39)
	for (const bindingKey of new Set(result.candidates.map(({ roleBindingKey }) => roleBindingKey))) {
		assert.equal(result.candidates.filter(({ roleBindingKey }) => roleBindingKey === bindingKey).length, 3)
	}

	const permutedEvidence = {
		...value.treatmentEvidence,
		lanes: value.treatmentEvidence.lanes.map((lane) => ({
			...lane,
			familyIds: [...lane.familyIds].reverse(),
		})),
	}
	const permutedBundle = { ...value.bundle, candidates: [...value.bundle.candidates].reverse() }
	const permuted = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		treatmentEvidence: permutedEvidence,
		renderBundles: [permutedBundle],
		identityObligations: obligations,
		baselineUnrestrictedWinnerEvaluation: baseline,
	}))
	assert.equal(permuted.selected?.renderKey, result.selected?.renderKey)
	assert.deepEqual(permuted.candidates.map(({ renderKey }) => renderKey),
		result.candidates.map(({ renderKey }) => renderKey))
})

test("the actual shared-binding render cross-product fails closed above 1,440", () => {
	const value = expandedRoleFixture(150, 4, "expanded-overflow")
	const obligations: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput[
		"identityObligations"
	] = []
	const baseline = genuineBaselineEvaluation(value, obligations)

	assert.throws(() => materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value, {
		identityObligations: obligations,
		baselineUnrestrictedWinnerEvaluation: baseline,
	})), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR))
})

test("the result selects a complete render candidate without deriving a public palette boolean", () => {
	const value = fixture({ id: "selected-render-only" })
	const result = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(input(value))

	assert.ok(result.selected)
	assert.equal(result.diagnostics.selectedRenderId, result.selected.render.id)
	assert.equal(result.diagnostics.selectedPublicTreatmentKey, result.selected.publicTreatmentKey)
	assert.equal(result.diagnostics.publicTreatmentStateDerivedHere, false)
	assert.equal("winner" in result, false)
	assert.equal("gradient" in result, false)
})

test("the isolated materializer has no filesystem or outcome-specific dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|filename|feedback|review|manifest|historical)/iu)
	assert.doesNotMatch(source, /relationUtility\s*[+*]\s*[^\n]*fidelity/iu)
})
