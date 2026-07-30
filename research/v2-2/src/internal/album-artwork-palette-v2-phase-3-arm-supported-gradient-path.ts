import type { FieldHypothesis, NativePaletteEvidence } from "./album-artwork-palette-v2.ts";

import { mixOKLab, okDistance } from "./color.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_MINIMUM_POPULATION_FRACTION, discoverSupportedNativeFieldTransitionPaths } from "./album-artwork-palette-v2-phase-3-field-transition.ts";

import type { FieldTransitionExactStageColor, FieldTransitionPathStageEvidence, SupportedFieldTransitionPathEvidence } from "./album-artwork-palette-v2-phase-3-field-transition.ts";

import type { OKLab } from "./types.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID =
	"album-artwork-palette-v2-phase-3-arm-supported-gradient-path-midpoint-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID =
	"strict-color-interval-bridge-cross-hue-source-midpoint-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY = Object.freeze({
	endpointInterval: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
	minimumTransitionPopulationFraction:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_MINIMUM_POPULATION_FRACTION,
	midpointPosition: 0.5 as const,
	maximumHalfwayPositionDelta: 0.2,
	minimumCrossHueRadians: Math.PI / 3,
	minimumChromaticEndpointChromaInFamilyBinSteps: 0.5,
	minimumDirectPathDifferenceInFamilyBinSteps: 1,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS = Object.freeze({
	bridgeSupport:
		"connected interior path stages whose OKLab endpoint-axis projection is inside [0.15, 0.85]",
	crossHue:
		"both endpoint chromas at least one-half the native family-bin step and circular OKLab hue separation at least pi/3",
	midpoint:
		"exact source color from accepted bridge support within 0.2 of halfway in both spatial and color position, differing from direct endpoint interpolation by at least one native family-bin step",
	eligibility:
		"strict supported transition path and, for cross-hue endpoints, source-supported three-stop midpoint custody",
})

export type AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor =
	Readonly<{
		kind: "none"
		position: null
		color: null
		provenance: null
	}> |
	Readonly<{
		kind: "ordinary-two-stop"
		position: null
		color: null
		provenance: null
	}> |
	Readonly<{
		kind: "source-supported-three-stop"
		position: 0.5
		color: Readonly<{
			rgb: FieldTransitionExactStageColor["rgb"]
			oklab: OKLab
			hex: string
		}>
		provenance: FieldTransitionExactStageColor["provenance"] & Readonly<{
			fieldDomainId: string
			stageIndex: number
			spatialPosition: number
			colorPosition: number
			populationFraction: number
		}>
	}>

export type AlbumArtworkPaletteV2Phase3SupportedGradientIntermediateDiagnostic = Readonly<{
	stageIndex: number
	familyId: string
	regionId: string
	spatialPosition: number
	colorPosition: number
	populationFraction: number
	directPathDifference: number
	spatialHalfwayDelta: number
	colorHalfwayDelta: number
	spatiallyHalfwayCompatible: boolean
	colorHalfwayCompatible: boolean
	materiallyDifferentFromDirectPath: boolean
	acceptedForMidpoint: boolean
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3SupportedGradientPathRejectionReason =
	"strict-transition-path-ineligible" |
	"eligible-transition-path-has-no-hypothesis" |
	"cross-hue-path-lacks-material-halfway-intermediate"

export type AlbumArtworkPaletteV2Phase3SupportedGradientPathDiagnostic = Readonly<{
	pathIndex: number
	hypothesisId: string | null
	fieldDomainId: string
	topology: SupportedFieldTransitionPathEvidence["topology"]
	direction: SupportedFieldTransitionPathEvidence["direction"]
	connected: boolean
	legacyEligible: boolean
	strictTransitionEligible: boolean
	endpointInterval: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL
	endpointHueSeparation: number
	endpointChromas: readonly [number, number]
	crossHue: boolean
	stagePositions: readonly number[]
	stageColorPositions: readonly number[]
	stagePopulationFractions: readonly number[]
	transitionFamilyCount: number
	transitionPopulationFraction: number
	transitionQuadrantCoverage: number
	acceptedIntermediateSupport: readonly AlbumArtworkPaletteV2Phase3SupportedGradientIntermediateDiagnostic[]
	midpointCustody: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
	eligible: boolean
	rejectionReasons: readonly (
		SupportedFieldTransitionPathEvidence["rejectionReasons"][number] |
		AlbumArtworkPaletteV2Phase3SupportedGradientPathRejectionReason
	)[]
}>

export type AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult = Readonly<{
	identity: Readonly<{
		armId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID
		configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID
	}>
	gradientEligible: boolean
	fieldTreatment: "gradient-field" | "separate-flat-fields"
	hypothesis: FieldHypothesis | null
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
	diagnostics: Readonly<{
		policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY
		formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS
		discoveredPathCount: number
		strictTransitionEligiblePathCount: number
		eligiblePathCount: number
		selectedPathIndex: number | null
		paths: readonly AlbumArtworkPaletteV2Phase3SupportedGradientPathDiagnostic[]
	}>
}>

type EvaluatedPath = Readonly<{
	path: SupportedFieldTransitionPathEvidence
	diagnostic: AlbumArtworkPaletteV2Phase3SupportedGradientPathDiagnostic
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}>

const NO_MIDPOINT = Object.freeze({
	kind: "none" as const,
	position: null,
	color: null,
	provenance: null,
})

const ORDINARY_TWO_STOP = Object.freeze({
	kind: "ordinary-two-stop" as const,
	position: null,
	color: null,
	provenance: null,
})

function chroma([, a, b]: OKLab): number {
	return Math.hypot(a, b)
}

function hue([, a, b]: OKLab): number {
	const angle = Math.atan2(b, a)
	return angle < 0 ? angle + Math.PI * 2 : angle
}

function circularHueDistance(first: OKLab, second: OKLab): number {
	const difference = Math.abs(hue(first) - hue(second))
	return Math.min(difference, Math.PI * 2 - difference)
}

function intermediateDiagnostic(
	stage: FieldTransitionPathStageEvidence,
	firstEndpoint: OKLab,
	secondEndpoint: OKLab,
	familyBinStep: number,
): AlbumArtworkPaletteV2Phase3SupportedGradientIntermediateDiagnostic {
	const directPathDifference = okDistance(
		stage.prototype,
		mixOKLab(firstEndpoint, secondEndpoint, stage.colorPosition),
	)
	const spatialHalfwayDelta = Math.abs(stage.spatialPosition -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.midpointPosition)
	const colorHalfwayDelta = Math.abs(stage.colorPosition -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.midpointPosition)
	const spatiallyHalfwayCompatible = spatialHalfwayDelta <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.maximumHalfwayPositionDelta
	const colorHalfwayCompatible = colorHalfwayDelta <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.maximumHalfwayPositionDelta
	const materiallyDifferentFromDirectPath = directPathDifference >= familyBinStep *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY
			.minimumDirectPathDifferenceInFamilyBinSteps
	return {
		stageIndex: stage.stageIndex,
		familyId: stage.familyId,
		regionId: stage.regionId,
		spatialPosition: stage.spatialPosition,
		colorPosition: stage.colorPosition,
		populationFraction: stage.populationFraction,
		directPathDifference,
		spatialHalfwayDelta,
		colorHalfwayDelta,
		spatiallyHalfwayCompatible,
		colorHalfwayCompatible,
		materiallyDifferentFromDirectPath,
		acceptedForMidpoint: spatiallyHalfwayCompatible && colorHalfwayCompatible &&
			materiallyDifferentFromDirectPath,
		exactColor: stage.exactColor,
	}
}

function midpointDescriptor(
	path: SupportedFieldTransitionPathEvidence,
	intermediate: AlbumArtworkPaletteV2Phase3SupportedGradientIntermediateDiagnostic,
): AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor {
	return {
		kind: "source-supported-three-stop",
		position: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.midpointPosition,
		color: {
			rgb: intermediate.exactColor.rgb,
			oklab: intermediate.exactColor.oklab,
			hex: intermediate.exactColor.hex,
		},
		provenance: {
			...intermediate.exactColor.provenance,
			fieldDomainId: path.fieldDomainId,
			stageIndex: intermediate.stageIndex,
			spatialPosition: intermediate.spatialPosition,
			colorPosition: intermediate.colorPosition,
			populationFraction: intermediate.populationFraction,
		},
	}
}

function evaluatePath(
	path: SupportedFieldTransitionPathEvidence,
	pathIndex: number,
	familyBinStep: number,
): EvaluatedPath {
	const firstEndpoint = path.stages[0]?.prototype ?? [0, 0, 0]
	const secondEndpoint = path.stages.at(-1)?.prototype ?? [0, 0, 0]
	const endpointChromas = [chroma(firstEndpoint), chroma(secondEndpoint)] as const
	const endpointHueSeparation = circularHueDistance(firstEndpoint, secondEndpoint)
	const crossHue = endpointChromas.every((value) => value >= familyBinStep *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY
			.minimumChromaticEndpointChromaInFamilyBinSteps) &&
		endpointHueSeparation >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY.minimumCrossHueRadians
	const acceptedIntermediateSupport = path.acceptedIntermediateSupport.map((stage) =>
		intermediateDiagnostic(stage, firstEndpoint, secondEndpoint, familyBinStep))
	const midpointSupport = acceptedIntermediateSupport.filter(({ acceptedForMidpoint }) => acceptedForMidpoint)
		.sort((first, second) =>
			Math.max(first.spatialHalfwayDelta, first.colorHalfwayDelta) -
				Math.max(second.spatialHalfwayDelta, second.colorHalfwayDelta) ||
			first.colorHalfwayDelta - second.colorHalfwayDelta ||
			first.spatialHalfwayDelta - second.spatialHalfwayDelta ||
			second.directPathDifference - first.directPathDifference ||
			second.populationFraction - first.populationFraction ||
			first.stageIndex - second.stageIndex)[0] ?? null
	const rejectionReasons: AlbumArtworkPaletteV2Phase3SupportedGradientPathDiagnostic["rejectionReasons"][number][] = [
		...path.rejectionReasons,
	]
	if (!path.eligible) rejectionReasons.push("strict-transition-path-ineligible")
	if (path.eligible && path.hypothesis === null) {
		rejectionReasons.push("eligible-transition-path-has-no-hypothesis")
	}
	if (path.eligible && crossHue && midpointSupport === null) {
		rejectionReasons.push("cross-hue-path-lacks-material-halfway-intermediate")
	}
	const eligible = rejectionReasons.length === 0
	const midpoint = !eligible
		? NO_MIDPOINT
		: crossHue
			? midpointDescriptor(path, midpointSupport!)
			: ORDINARY_TWO_STOP
	return {
		path,
		midpoint,
		diagnostic: {
			pathIndex,
			hypothesisId: path.hypothesis?.id ?? null,
			fieldDomainId: path.fieldDomainId,
			topology: path.topology,
			direction: path.direction,
			connected: path.connected,
			legacyEligible: path.legacyEligible,
			strictTransitionEligible: path.eligible,
			endpointInterval: path.endpointInterval,
			endpointHueSeparation,
			endpointChromas,
			crossHue,
			stagePositions: path.stagePositions,
			stageColorPositions: path.stageColorPositions,
			stagePopulationFractions: path.stagePopulationFractions,
			transitionFamilyCount: path.transitionFamilyCount,
			transitionPopulationFraction: path.transitionPopulationFraction,
			transitionQuadrantCoverage: path.transitionQuadrantCoverage,
			acceptedIntermediateSupport,
			midpointCustody: midpoint,
			eligible,
			rejectionReasons,
		},
	}
}

export function evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
	evidence: NativePaletteEvidence,
): AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult {
	const paths = discoverSupportedNativeFieldTransitionPaths(evidence)
	const evaluated = paths.map((path, pathIndex) => evaluatePath(path, pathIndex, evidence.familyBinStep))
	const eligible = evaluated.filter(({ diagnostic }) => diagnostic.eligible)
	const selected = eligible[0] ?? null
	return {
		identity: {
			armId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID,
		},
		gradientEligible: selected !== null,
		fieldTreatment: selected === null ? "separate-flat-fields" : "gradient-field",
		hypothesis: selected?.path.hypothesis ?? null,
		midpoint: selected?.midpoint ?? NO_MIDPOINT,
		diagnostics: {
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS,
			discoveredPathCount: paths.length,
			strictTransitionEligiblePathCount: evaluated.filter(({ path }) => path.eligible).length,
			eligiblePathCount: eligible.length,
			selectedPathIndex: selected?.diagnostic.pathIndex ?? null,
			paths: evaluated.map(({ diagnostic }) => diagnostic),
		},
	}
}
