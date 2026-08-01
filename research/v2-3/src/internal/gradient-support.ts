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

/**
 * Where a three-stop midpoint colour came from, and the evidence that earned it.
 *
 * The two origins answer the same question by different routes and have genuinely different
 * evidence to show for it, so they are separate members rather than one shape with holes in
 * it. A transition-path stage knows its index and its position along a staged path; a field
 * midpoint band has no stages at all, and instead knows how much of the domain it sampled and
 * how far the colour sits off the endpoint chord.
 */
export type AlbumArtworkPaletteV2Phase3SupportedGradientMidpointProvenance =
	FieldTransitionExactStageColor["provenance"] & Readonly<{
		origin: "transition-path-stage"
		fieldDomainId: string
		stageIndex: number
		spatialPosition: number
		colorPosition: number
		populationFraction: number
	}> |
	Readonly<{
		origin: "field-midpoint-band"
		exactSource: true
		familyId: string
		fieldDomainId: string
		pixelIndex: number
		x: number
		y: number
		/** Share of the field domain that fell inside the sampled midpoint band. */
		bandPopulationFraction: number
		/** Share of that band occupied by this colour's own neighbourhood. */
		occupancyShare: number
		spatialSpreadRatio: number
		/** Distance from the straight interpolation between the rendered endpoints. */
		chordDeviation: number
	}> |
	/**
	 * A third stop nominated in colour space rather than in the field's geometry: see
	 * `ramp-midpoint.ts`. It knows nothing about a field domain or a spatial band, because it was
	 * not measured in one — it knows which populated colour of the artwork it is, and how much
	 * closer to the artwork it puts the rendered ramp.
	 */
	Readonly<{
		origin: "ramp-support"
		exactSource: true
		familyId: string
		pixelIndex: number
		x: number
		y: number
		/** Share of the artwork occupied by this colour's own quantisation cell. */
		populationFraction: number
		/** Distance from the straight interpolation between the rendered endpoints. */
		chordDeviation: number
		/** ΔE to the nearer of the two endpoints. */
		endpointDifference: number
		/** Worst ΔE from the ramp to the artwork before this stop, and after it. */
		excursionBefore: number
		excursionAfter: number
	}>

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
		provenance: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointProvenance
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
			origin: "transition-path-stage",
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
