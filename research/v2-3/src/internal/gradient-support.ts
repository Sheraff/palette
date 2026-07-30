import type { NativePaletteEvidence } from "./palette-core.ts";

import { mixOKLab, okDistance } from "./color.ts";

import { discoverSupportedNativeFieldTransitionPaths } from "./field-transition.ts";

import type { FieldTransitionExactStageColor, FieldTransitionPathStageEvidence, SupportedFieldTransitionPathEvidence } from "./field-transition.ts";

import type { OKLab } from "./types.ts";

const POLICY = Object.freeze({
	midpointPosition: 0.5 as const,
	maximumHalfwayPositionDelta: 0.2,
	minimumCrossHueRadians: Math.PI / 3,
	minimumChromaticEndpointChromaInFamilyBinSteps: 0.5,
	minimumDirectPathDifferenceInFamilyBinSteps: 1,
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

export type SupportedGradientPath = Readonly<{
	hypothesisId: string | null
	eligible: boolean
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}>

export type AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult = Readonly<{
	paths: readonly SupportedGradientPath[]
}>

type Intermediate = Readonly<{
	stageIndex: number
	spatialPosition: number
	colorPosition: number
	populationFraction: number
	directPathDifference: number
	spatialHalfwayDelta: number
	colorHalfwayDelta: number
	accepted: boolean
	exactColor: FieldTransitionExactStageColor
}>

const NO_MIDPOINT = Object.freeze({ kind: "none" as const, position: null, color: null, provenance: null })

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

function evaluateIntermediate(
	stage: FieldTransitionPathStageEvidence,
	firstEndpoint: OKLab,
	secondEndpoint: OKLab,
	familyBinStep: number,
): Intermediate {
	const directPathDifference = okDistance(
		stage.prototype,
		mixOKLab(firstEndpoint, secondEndpoint, stage.colorPosition),
	)
	const spatialHalfwayDelta = Math.abs(stage.spatialPosition - POLICY.midpointPosition)
	const colorHalfwayDelta = Math.abs(stage.colorPosition - POLICY.midpointPosition)
	return {
		stageIndex: stage.stageIndex,
		spatialPosition: stage.spatialPosition,
		colorPosition: stage.colorPosition,
		populationFraction: stage.populationFraction,
		directPathDifference,
		spatialHalfwayDelta,
		colorHalfwayDelta,
		accepted: spatialHalfwayDelta <= POLICY.maximumHalfwayPositionDelta &&
			colorHalfwayDelta <= POLICY.maximumHalfwayPositionDelta &&
			directPathDifference >= familyBinStep * POLICY.minimumDirectPathDifferenceInFamilyBinSteps,
		exactColor: stage.exactColor,
	}
}

function midpointDescriptor(
	path: SupportedFieldTransitionPathEvidence,
	intermediate: Intermediate,
): AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor {
	return {
		kind: "source-supported-three-stop",
		position: POLICY.midpointPosition,
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
	familyBinStep: number,
): SupportedGradientPath {
	const firstEndpoint = path.stages[0]?.prototype ?? [0, 0, 0]
	const secondEndpoint = path.stages.at(-1)?.prototype ?? [0, 0, 0]
	const crossHue = [chroma(firstEndpoint), chroma(secondEndpoint)].every((value) =>
		value >= familyBinStep * POLICY.minimumChromaticEndpointChromaInFamilyBinSteps) &&
		circularHueDistance(firstEndpoint, secondEndpoint) >= POLICY.minimumCrossHueRadians
	const midpointSupport = path.acceptedIntermediateSupport
		.map((stage) => evaluateIntermediate(stage, firstEndpoint, secondEndpoint, familyBinStep))
		.filter(({ accepted }) => accepted)
		.sort((first, second) =>
			Math.max(first.spatialHalfwayDelta, first.colorHalfwayDelta) -
				Math.max(second.spatialHalfwayDelta, second.colorHalfwayDelta) ||
			first.colorHalfwayDelta - second.colorHalfwayDelta ||
			first.spatialHalfwayDelta - second.spatialHalfwayDelta ||
			second.directPathDifference - first.directPathDifference ||
			second.populationFraction - first.populationFraction ||
			first.stageIndex - second.stageIndex)[0] ?? null
	const eligible = path.eligible && path.rejectionReasons.length === 0 && path.hypothesis !== null &&
		(!crossHue || midpointSupport !== null)
	return {
		hypothesisId: path.hypothesis?.id ?? null,
		eligible,
		midpoint: !eligible ? NO_MIDPOINT : crossHue ? midpointDescriptor(path, midpointSupport!) : ORDINARY_TWO_STOP,
	}
}

export function evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
	evidence: NativePaletteEvidence,
): AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult {
	return {
		paths: discoverSupportedNativeFieldTransitionPaths(evidence)
			.map((path) => evaluatePath(path, evidence.familyBinStep)),
	}
}
