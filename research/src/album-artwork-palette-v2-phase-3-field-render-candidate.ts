import { mixOKLab, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type {
	FieldTransitionExactStageColor,
	FieldTransitionPathStageEvidence,
	SupportedFieldTransitionPathEvidence,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"
import type { OKLab } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID =
	"album-artwork-palette-v2-phase-3-source-field-render-candidate-v2" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_IDENTITY = Object.freeze({
	evaluatorId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID,
	version: 2 as const,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY = Object.freeze({
	maximumStageCount: 16,
	midpointPosition: 0.5,
	maximumMidpointPositionDelta: 0.2,
	midpointEndpointAxisInterval: Object.freeze([0.15, 0.85] as const),
	minimumMidpointPopulationFraction: 0.01,
	minimumMidpointQuadrantCoverage: 0.5,
	minimumMidpointDistanceInFamilyBinSteps: 1,
	fidelityResolution: 0.005,
	minimumSigma: 0.04,
	familyBinSigmaMultiplier: 2,
	endpointDistanceSigmaMultiplier: 0.2,
	massRmseWeight: 0.5,
	stageRmseWeight: 0.3,
	weightedP90Weight: 0.2,
	weightedP90SigmaMultiplier: 1.5,
	exactColorOKLabTolerance: 0.000001,
	fractionCoherenceTolerance: 0.000000001,
	minimumEndpointAxisDistance: 0.000000000001,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_FORMULAS = Object.freeze({
	flatRender: "minimum OKLab distance from each exact source stage color to either exact endpoint",
	twoStopRender: "direct OKLab interpolation between exact endpoints at each source stage spatial position",
	threeStopRender:
		"piecewise OKLab interpolation through one exact source midpoint at render position 0.5, evaluated at each source stage spatial position",
	sigma: "max(0.04, 2 * familyBinStep, 0.20 * exact endpoint OKLab distance)",
	fidelity:
		"0.50 * exp(-(massRMSE / sigma)^2) + 0.30 * exp(-(stageRMSE / sigma)^2) + 0.20 * exp(-(weightedP90 / (1.5 * sigma))^2)",
	midpointEligibility:
		"interior source stage; spatial and endpoint-axis positions within 0.20 of 0.5; endpoint-axis position inside [0.15, 0.85]; population fraction at least 0.01; quadrant coverage at least 0.5; exact color at least one family-bin step from direct halfway and both exact endpoints",
	midpointOrdering:
		"every eligible exact midpoint is published as a supported three-stop candidate and enters the common render ordering; midpoint diagnostics mark only the selected render",
	renderOrdering:
		"descending 0.005 fidelity level, descending raw fidelity, ascending stop count, then ASCII render identity",
	pathRenderOrdering:
		"render ordering through raw fidelity, then descending existing transition population fraction, quadrant coverage, family count, and hypothesis field fidelity, then ascending stop count and ASCII path/render identity",
	pathAdmissibility:
		"connected legacy-eligible path with a non-null hypothesis and valid structural evidence; strict ineligibility is tolerated only when every inherited rejection is one of the two strict color-interval reasons",
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS =
	Object.freeze([
		"transition has no color-intermediate family inside the endpoint interval",
		"color-intermediate families lack broad transition coverage",
	] as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS = Object.freeze({
	identity: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_IDENTITY,
	policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY,
	formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_FORMULAS,
})

export type AlbumArtworkPaletteV2Phase3FieldRenderKind =
	"flat" | "supported-two-stop" | "supported-three-stop"

export type AlbumArtworkPaletteV2Phase3FieldRenderExactStop = Readonly<{
	position: number
	sourceStageIndex: number
	sourceSpatialPosition: number
	sourceColorPosition: number
	familyId: string
	regionId: string
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderEndpointCustody = Readonly<{
	familyId: string
	regionId: string
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody = readonly [
	AlbumArtworkPaletteV2Phase3FieldRenderEndpointCustody,
	AlbumArtworkPaletteV2Phase3FieldRenderEndpointCustody,
]

export type AlbumArtworkPaletteV2Phase3FieldRenderStageError = Readonly<{
	stageIndex: number
	spatialPosition: number
	populationFraction: number
	distance: number
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderFidelity = Readonly<{
	massRMSE: number
	stageRMSE: number
	weightedP90: number
	sigma: number
	value: number
	level: number
	quantizedValue: number
	stageErrors: readonly AlbumArtworkPaletteV2Phase3FieldRenderStageError[]
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderCandidate = Readonly<{
	id: string
	kind: AlbumArtworkPaletteV2Phase3FieldRenderKind
	stopCount: 0 | 2 | 3
	endpoints: readonly [
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	]
	midpoint: AlbumArtworkPaletteV2Phase3FieldRenderExactStop | null
	stops: readonly AlbumArtworkPaletteV2Phase3FieldRenderExactStop[]
	fidelity: AlbumArtworkPaletteV2Phase3FieldRenderFidelity
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderMidpointDiagnostic = Readonly<{
	id: string
	stageIndex: number
	spatialPosition: number
	colorPosition: number
	populationFraction: number
	quadrantCoverage: number
	spatialHalfwayDelta: number
	colorHalfwayDelta: number
	halfwayPositionDelta: number
	directHalfwayDistance: number
	firstEndpointDistance: number
	secondEndpointDistance: number
	spatialPositionEligible: boolean
	endpointAxisIntervalEligible: boolean
	colorHalfwayEligible: boolean
	colorPositionEligible: boolean
	populationEligible: boolean
	quadrantCoverageEligible: boolean
	directHalfwayDistanceEligible: boolean
	endpointDistanceEligible: boolean
	eligible: boolean
	threeStopFidelity: number | null
	threeStopGain: number | null
	selected: boolean
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderPathSupport = Readonly<{
	transitionPopulationFraction: number
	transitionQuadrantCoverage: number
	transitionFamilyCount: number
	hypothesisFieldFidelity: number
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderInheritedEligibility = Readonly<{
	legacyEligible: boolean
	strictEligible: boolean
	rejectionReasons: readonly string[]
	strictColorIntervalOnly: boolean
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle = Readonly<{
	id: string
	path: SupportedFieldTransitionPathEvidence
	support: AlbumArtworkPaletteV2Phase3FieldRenderPathSupport
	inheritedEligibility: AlbumArtworkPaletteV2Phase3FieldRenderInheritedEligibility
	eligible: boolean
	rejectionReasons: readonly string[]
	endpoints: readonly [
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	] | null
	midpointDiagnostics: readonly AlbumArtworkPaletteV2Phase3FieldRenderMidpointDiagnostic[]
	candidates: readonly AlbumArtworkPaletteV2Phase3FieldRenderCandidate[]
	selectedRender: AlbumArtworkPaletteV2Phase3FieldRenderCandidate | null
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderSelection = Readonly<{
	pathId: string
	renderId: string
	path: SupportedFieldTransitionPathEvidence
	support: AlbumArtworkPaletteV2Phase3FieldRenderPathSupport
	render: AlbumArtworkPaletteV2Phase3FieldRenderCandidate
}>

export type AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation = Readonly<{
	identity: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_IDENTITY
	diagnostics: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS
	familyBinStep: number
	bundles: readonly AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle[]
	selected: AlbumArtworkPaletteV2Phase3FieldRenderSelection | null
	summary: Readonly<{
		inputPathCount: number
		eligiblePathCount: number
		candidateCount: number
	}>
}>

type RenderColor = (spatialPosition: number) => OKLab

type MidpointWork = Readonly<{
	diagnostic: Omit<AlbumArtworkPaletteV2Phase3FieldRenderMidpointDiagnostic, "selected">
	stop: AlbumArtworkPaletteV2Phase3FieldRenderExactStop
	candidate: AlbumArtworkPaletteV2Phase3FieldRenderCandidate | null
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null
}

function finiteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function finiteOKLab(color: unknown): color is OKLab {
	return Array.isArray(color) && color.length === 3 && color.every(finiteNumber)
}

function safeIdentityPart(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "invalid"
}

function safeStageIdentity(value: unknown): string {
	if (!isRecord(value)) return "invalid-stage"
	const exactColor = isRecord(value.exactColor) ? value.exactColor : null
	const provenance = exactColor !== null && isRecord(exactColor.provenance)
		? exactColor.provenance
		: null
	return [
		value.familyId,
		value.regionId,
		provenance?.pixelIndex,
		value.spatialPosition,
		value.colorPosition,
		value.populationFraction,
		value.quadrantCoverage,
		exactColor?.hex,
	].map(safeIdentityPart).join(":")
}

function stageIdentity(stage: FieldTransitionPathStageEvidence): string {
	return [
		stage.familyId,
		stage.regionId,
		stage.exactColor.provenance.pixelIndex,
		stage.spatialPosition,
		stage.colorPosition,
		stage.populationFraction,
		stage.quadrantCoverage,
		stage.exactColor.hex,
	].join(":")
}

function pathIdentity(value: unknown): string {
	if (!isRecord(value)) return "invalid-source-transition-evidence"
	const sourceStages = Array.isArray(value.stages) ? value.stages : []
	const stages = sourceStages.length === 0 ? "empty" : sourceStages.map(safeStageIdentity).join(">")
	return [value.fieldDomainId, value.topology, value.direction, stages]
		.map(safeIdentityPart).join("|")
}

function endpointIdentity(value: unknown): string {
	if (!isRecord(value)) return "invalid-endpoint"
	const exactColor = isRecord(value.exactColor) ? value.exactColor : null
	const provenance = exactColor !== null && isRecord(exactColor.provenance)
		? exactColor.provenance
		: null
	const rgb = exactColor !== null && Array.isArray(exactColor.rgb)
		? exactColor.rgb.map(safeIdentityPart).join(",")
		: "invalid"
	const oklab = exactColor !== null && Array.isArray(exactColor.oklab)
		? exactColor.oklab.map(safeIdentityPart).join(",")
		: "invalid"
	return [
		value.familyId,
		value.regionId,
		provenance?.pixelIndex,
		provenance?.x,
		provenance?.y,
		exactColor?.hex,
		rgb,
		oklab,
	].map(safeIdentityPart).join(":")
}

function renderPathIdentity(path: unknown, endpoints: unknown): string {
	const endpointValues = Array.isArray(endpoints) ? endpoints : []
	return `${pathIdentity(path)}|endpoints:${endpointValues.map(endpointIdentity).join(">") || "invalid"}`
}

function defaultEndpointCustody(value: unknown): unknown {
	if (!isRecord(value) || !Array.isArray(value.stages) || value.stages.length < 2) return null
	const first = value.stages[0]
	const second = value.stages.at(-1)
	if (!isRecord(first) || !isRecord(second)) return null
	return [
		{ familyId: first.familyId, regionId: first.regionId, exactColor: first.exactColor },
		{ familyId: second.familyId, regionId: second.regionId, exactColor: second.exactColor },
	]
}

function stageStop(
	stage: FieldTransitionPathStageEvidence,
	position: number,
	sourceColorPosition = stage.colorPosition,
): AlbumArtworkPaletteV2Phase3FieldRenderExactStop {
	return Object.freeze({
		position,
		sourceStageIndex: stage.stageIndex,
		sourceSpatialPosition: stage.spatialPosition,
		sourceColorPosition,
		familyId: stage.familyId,
		regionId: stage.regionId,
		exactColor: stage.exactColor,
	})
}

function endpointStop(
	stage: FieldTransitionPathStageEvidence,
	custody: AlbumArtworkPaletteV2Phase3FieldRenderEndpointCustody,
	position: 0 | 1,
): AlbumArtworkPaletteV2Phase3FieldRenderExactStop {
	return Object.freeze({
		position,
		sourceStageIndex: stage.stageIndex,
		sourceSpatialPosition: stage.spatialPosition,
		sourceColorPosition: position,
		familyId: custody.familyId,
		regionId: custody.regionId,
		exactColor: custody.exactColor,
	})
}

function validExactColor(
	value: unknown,
	familyId: string,
	regionId: string,
): value is FieldTransitionExactStageColor {
	if (!isRecord(value) || !isRecord(value.provenance)) return false
	const provenance = value.provenance
	if (provenance.exactSource !== true || provenance.familyId !== familyId ||
		provenance.regionId !== regionId ||
		!Number.isSafeInteger(provenance.pixelIndex) || (provenance.pixelIndex as number) < 0 ||
		!Number.isSafeInteger(provenance.x) || (provenance.x as number) < 0 ||
		!Number.isSafeInteger(provenance.y) || (provenance.y as number) < 0 ||
		!Array.isArray(value.rgb) || value.rgb.length !== 3 ||
		!value.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) ||
		typeof value.hex !== "string" || !/^#[0-9a-f]{6}$/u.test(value.hex) ||
		!finiteOKLab(value.oklab)) {
		return false
	}
	const rgb = value.rgb as unknown as readonly [number, number, number]
	if (rgbToHex(rgb) !== value.hex) return false
	return okDistance(rgbToOKLab(rgb), value.oklab) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.exactColorOKLabTolerance
}

function validEndpointCustody(
	value: unknown,
	expectedStage: FieldTransitionPathStageEvidence,
): value is AlbumArtworkPaletteV2Phase3FieldRenderEndpointCustody {
	return isRecord(value) && typeof value.familyId === "string" &&
		typeof value.regionId === "string" && value.familyId === expectedStage.familyId &&
		value.regionId === expectedStage.regionId &&
		validExactColor(value.exactColor, value.familyId, value.regionId)
}

function orderedEndpointRejectionReasons(
	value: unknown,
	stages: readonly FieldTransitionPathStageEvidence[],
): string[] {
	if (!Array.isArray(value) || value.length !== 2 ||
		!validEndpointCustody(value[0], stages[0]) ||
		!validEndpointCustody(value[1], stages.at(-1)!)) {
		return ["source-render-endpoint-custody-invalid-or-misaligned"]
	}
	if (okDistance(value[0].exactColor.oklab, value[1].exactColor.oklab) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.minimumEndpointAxisDistance) {
		return ["source-render-endpoint-custody-has-no-color-axis"]
	}
	return []
}

function validStage(value: unknown): value is FieldTransitionPathStageEvidence {
	if (!isRecord(value) || !isRecord(value.exactColor)) {
		return false
	}
	const exactColor = value.exactColor
	const provenance = exactColor.provenance
	if (!isRecord(provenance)) return false
	if (!Number.isSafeInteger(value.stageIndex) || (value.stageIndex as number) < 0 ||
		typeof value.familyId !== "string" || value.familyId.length === 0 ||
		typeof value.regionId !== "string" || value.regionId.length === 0 ||
		!finiteNumber(value.spatialPosition) || !finiteNumber(value.colorPosition) ||
		!Number.isSafeInteger(value.population) || (value.population as number) <= 0 ||
		!finiteNumber(value.populationFraction) || value.populationFraction <= 0 ||
		value.populationFraction > 1 ||
		!finiteNumber(value.imagePopulationFraction) || value.imagePopulationFraction <= 0 ||
		value.imagePopulationFraction > 1 ||
		!finiteNumber(value.quadrantCoverage) || value.quadrantCoverage < 0 ||
		value.quadrantCoverage > 1 || !finiteOKLab(value.prototype) ||
		!validExactColor(exactColor, value.familyId, value.regionId)) {
		return false
	}
	return true
}

function alignedArray<T>(
	value: unknown,
	stages: readonly FieldTransitionPathStageEvidence[],
	stageValue: (stage: FieldTransitionPathStageEvidence) => T,
): boolean {
	return Array.isArray(value) && value.length === stages.length &&
		value.every((entry, index) => entry === stageValue(stages[index]))
}

function sameNumbers(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function sameStageEvidence(
	first: FieldTransitionPathStageEvidence,
	second: FieldTransitionPathStageEvidence,
): boolean {
	return first.stageIndex === second.stageIndex && first.familyId === second.familyId &&
		first.regionId === second.regionId && first.spatialPosition === second.spatialPosition &&
		first.colorPosition === second.colorPosition && first.population === second.population &&
		first.populationFraction === second.populationFraction &&
		first.imagePopulationFraction === second.imagePopulationFraction &&
		first.quadrantCoverage === second.quadrantCoverage &&
		sameNumbers(first.prototype, second.prototype) &&
		sameNumbers(first.exactColor.rgb, second.exactColor.rgb) &&
		sameNumbers(first.exactColor.oklab, second.exactColor.oklab) &&
		first.exactColor.hex === second.exactColor.hex &&
		first.exactColor.provenance.exactSource === second.exactColor.provenance.exactSource &&
		first.exactColor.provenance.familyId === second.exactColor.provenance.familyId &&
		first.exactColor.provenance.regionId === second.exactColor.provenance.regionId &&
		first.exactColor.provenance.pixelIndex === second.exactColor.provenance.pixelIndex &&
		first.exactColor.provenance.x === second.exactColor.provenance.x &&
		first.exactColor.provenance.y === second.exactColor.provenance.y
}

function coherentRatio(
	stages: readonly FieldTransitionPathStageEvidence[],
	fraction: (stage: FieldTransitionPathStageEvidence) => number,
): boolean {
	const denominator = stages[0].population / fraction(stages[0])
	const roundedDenominator = Math.round(denominator)
	if (!Number.isSafeInteger(roundedDenominator) || roundedDenominator <= 0) return false
	const tolerance = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY
		.fractionCoherenceTolerance
	if (Math.abs(denominator - roundedDenominator) >
		tolerance * Math.max(1, Math.abs(denominator))) return false
	return stages.every((stage) => {
		const expectedPopulation = fraction(stage) * roundedDenominator
		return Math.abs(stage.population - expectedPopulation) <=
			tolerance * Math.max(1, stage.population, expectedPopulation)
	})
}

function nearlyEqual(first: number, second: number): boolean {
	return Math.abs(first - second) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fractionCoherenceTolerance *
			Math.max(1, Math.abs(first), Math.abs(second))
}

function inheritedEligibility(value: unknown): AlbumArtworkPaletteV2Phase3FieldRenderInheritedEligibility {
	const path = isRecord(value) ? value : {}
	const rejectionReasons = Array.isArray(path.rejectionReasons) &&
		path.rejectionReasons.every((reason) => typeof reason === "string")
		? path.rejectionReasons as string[]
		: []
	const strictColorIntervalOnly = rejectionReasons.length > 0 && rejectionReasons.every((reason) =>
		(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS as readonly string[])
			.includes(reason))
	return Object.freeze({
		legacyEligible: path.legacyEligible === true,
		strictEligible: path.eligible === true,
		rejectionReasons: Object.freeze([...rejectionReasons]),
		strictColorIntervalOnly,
	})
}

function pathRejectionReasons(value: unknown): string[] {
	const reasons: string[] = []
	if (!isRecord(value)) return ["source-transition-path-has-invalid-evidence"]
	const inherited = inheritedEligibility(value)
	const hardInheritedReasons = inherited.rejectionReasons.filter((reason) =>
		!(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS as readonly string[])
			.includes(reason))
	reasons.push(...hardInheritedReasons)
	if (value.legacyEligible !== true) reasons.push("source-transition-path-legacy-ineligible")
	if (value.connected !== true) reasons.push("source-transition-path-disconnected")
	if (value.hypothesis === null) reasons.push("source-transition-path-has-no-hypothesis")
	if (value.eligible !== true && value.eligible !== false) {
		reasons.push("source-transition-path-has-invalid-strict-eligibility")
	} else if (value.eligible === false && !inherited.strictColorIntervalOnly) {
		if (hardInheritedReasons.length === 0) {
			reasons.push("source-transition-path-strict-ineligibility-is-not-interval-only")
		}
	}
	if (!Array.isArray(value.stages)) {
		reasons.push("source-transition-path-has-invalid-stage-evidence")
		return reasons
	}
	const sourceStages = value.stages
	if (sourceStages.length < 2) reasons.push("source-transition-path-lacks-two-endpoints")
	if (sourceStages.length >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.maximumStageCount) {
		reasons.push("source-transition-path-exceeds-stage-bound")
	}
	if (sourceStages.some((stage, index) => !validStage(stage) || stage.stageIndex !== index)) {
		reasons.push("source-transition-path-has-invalid-stage-evidence")
	}
	if (!sourceStages.every(validStage)) return reasons
	if (sourceStages.length < 2) return reasons
	const stages = sourceStages
	const validTopologies = ["linear", "radial-center", "radial-upper-center", "radial-offset"]
	const validDirections = [
		"horizontal", "vertical", "diagonal-down", "diagonal-up", "center-out",
		"angle-22.5", "angle-67.5", "angle-112.5", "angle-157.5",
		"center-0.35-0.50", "center-0.65-0.50", "center-0.50-0.65",
	]
	const center = value.spatialCenter
	if (typeof value.fieldDomainId !== "string" || value.fieldDomainId.length === 0 ||
		typeof value.topology !== "string" || !validTopologies.includes(value.topology) ||
		typeof value.direction !== "string" || !validDirections.includes(value.direction) ||
		(value.legacyEligible !== true && value.legacyEligible !== false) ||
		center !== null && (!Array.isArray(center) || center.length !== 2 ||
			!center.every(finiteNumber))) {
		reasons.push("source-transition-path-has-invalid-path-metadata")
	}
	if (stages.some(({ spatialPosition }, index) => spatialPosition < 0 || spatialPosition > 1 ||
		(index > 0 && spatialPosition < stages[index - 1].spatialPosition)) ||
		stages[0].spatialPosition !== 0 || stages.at(-1)!.spatialPosition !== 1) {
		reasons.push("source-transition-path-has-invalid-stage-positions")
	}
	const populationFraction = stages.reduce((sum, stage) => sum + stage.populationFraction, 0)
	const imagePopulationFraction = stages.reduce((sum, stage) => sum + stage.imagePopulationFraction, 0)
	if (populationFraction > 1 +
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fractionCoherenceTolerance ||
		imagePopulationFraction > 1 +
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fractionCoherenceTolerance ||
		!coherentRatio(stages, (stage) => stage.populationFraction) ||
		!coherentRatio(stages, (stage) => stage.imagePopulationFraction)) {
		reasons.push("source-transition-path-has-incoherent-stage-population")
	}
	if (!Array.isArray(value.endpointFamilyIds) || value.endpointFamilyIds.length !== 2 ||
		value.endpointFamilyIds[0] !== stages[0].familyId ||
		value.endpointFamilyIds[1] !== stages.at(-1)!.familyId ||
		!alignedArray(value.stageFamilyIds, stages, (stage) => stage.familyId) ||
		!alignedArray(value.stageRegionIds, stages, (stage) => stage.regionId) ||
		!alignedArray(value.stagePositions, stages, (stage) => stage.spatialPosition) ||
		!alignedArray(value.stageColorPositions, stages, (stage) => stage.colorPosition) ||
		!alignedArray(value.stagePopulationFractions, stages, (stage) => stage.populationFraction)) {
		reasons.push("source-transition-path-metadata-does-not-match-stages")
	}
	const interval = value.endpointInterval
	if (!Array.isArray(interval) || interval.length !== 2 || interval[0] !== 0.15 || interval[1] !== 0.85) {
		reasons.push("source-transition-path-has-invalid-endpoint-interval")
	}
	const expectedAccepted = stages.slice(1, -1).filter(({ colorPosition }) =>
		colorPosition >= 0.15 && colorPosition <= 0.85)
	const accepted = value.acceptedIntermediateSupport
	if (!Array.isArray(accepted) || accepted.length !== expectedAccepted.length ||
		!accepted.every((stage, index) => validStage(stage) &&
			sameStageEvidence(stage, expectedAccepted[index]))) {
		reasons.push("source-transition-path-has-misaligned-intermediate-support")
	}
	const transitionPopulationFraction = expectedAccepted.reduce((sum, stage) =>
		sum + stage.populationFraction, 0)
	const transitionFamilyCount = new Set(expectedAccepted.map(({ familyId }) => familyId)).size
	if (!finiteNumber(value.transitionPopulationFraction) || value.transitionPopulationFraction < 0 ||
		!nearlyEqual(value.transitionPopulationFraction, transitionPopulationFraction) ||
		!Number.isSafeInteger(value.transitionFamilyCount) ||
		(value.transitionFamilyCount as number) < 0 ||
		value.transitionFamilyCount !== transitionFamilyCount ||
		!finiteNumber(value.transitionQuadrantCoverage) || value.transitionQuadrantCoverage < 0 ||
		value.transitionQuadrantCoverage > 1 ||
		!isRecord(value.hypothesis) || !finiteNumber(value.hypothesis.fieldFidelity)) {
		reasons.push("source-transition-path-has-invalid-support-evidence")
	}
	if (!Array.isArray(value.rejectionReasons) ||
		!value.rejectionReasons.every((reason) => typeof reason === "string")) {
		reasons.push("source-transition-path-has-incoherent-rejection-evidence")
	}
	return reasons
}

function fidelityLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fidelityResolution)
}

function renderFidelity(
	stages: readonly FieldTransitionPathStageEvidence[],
	firstEndpoint: OKLab,
	secondEndpoint: OKLab,
	familyBinStep: number,
	renderColor: RenderColor | null,
): AlbumArtworkPaletteV2Phase3FieldRenderFidelity {
	const errors = stages.map((stage): AlbumArtworkPaletteV2Phase3FieldRenderStageError => {
		const distance = renderColor === null
			? Math.min(
				okDistance(stage.exactColor.oklab, firstEndpoint),
				okDistance(stage.exactColor.oklab, secondEndpoint),
			)
			: okDistance(stage.exactColor.oklab, renderColor(stage.spatialPosition))
		return Object.freeze({
			stageIndex: stage.stageIndex,
			spatialPosition: stage.spatialPosition,
			populationFraction: stage.populationFraction,
			distance,
		})
	})
	const population = stages.reduce((sum, stage) => sum + stage.populationFraction, 0)
	const massRMSE = Math.sqrt(errors.reduce((sum, error) =>
		sum + error.populationFraction * error.distance ** 2, 0) / population)
	const stageRMSE = Math.sqrt(errors.reduce((sum, error) => sum + error.distance ** 2, 0) /
		errors.length)
	const orderedErrors = [...errors].sort((first, second) =>
		first.distance - second.distance || first.stageIndex - second.stageIndex)
	const p90Target = population * 0.9
	let cumulativePopulation = 0
	let weightedP90 = orderedErrors.at(-1)!.distance
	for (const error of orderedErrors) {
		cumulativePopulation += error.populationFraction
		if (cumulativePopulation + 1e-12 >= p90Target) {
			weightedP90 = error.distance
			break
		}
	}
	const sigma = Math.max(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.minimumSigma,
		familyBinStep *
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.familyBinSigmaMultiplier,
		okDistance(firstEndpoint, secondEndpoint) *
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.endpointDistanceSigmaMultiplier,
	)
	const value =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.massRmseWeight *
			Math.exp(-((massRMSE / sigma) ** 2)) +
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.stageRmseWeight *
			Math.exp(-((stageRMSE / sigma) ** 2)) +
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.weightedP90Weight *
			Math.exp(-((weightedP90 / (
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY
					.weightedP90SigmaMultiplier * sigma
			)) ** 2))
	const level = fidelityLevel(value)
	return Object.freeze({
		massRMSE,
		stageRMSE,
		weightedP90,
		sigma,
		value,
		level,
		quantizedValue: level *
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fidelityResolution,
		stageErrors: Object.freeze(errors),
	})
}

function candidate(
	pathId: string,
	kind: AlbumArtworkPaletteV2Phase3FieldRenderKind,
	endpoints: AlbumArtworkPaletteV2Phase3FieldRenderCandidate["endpoints"],
	midpoint: AlbumArtworkPaletteV2Phase3FieldRenderExactStop | null,
	fidelity: AlbumArtworkPaletteV2Phase3FieldRenderFidelity,
): AlbumArtworkPaletteV2Phase3FieldRenderCandidate {
	const stops = kind === "flat"
		? []
		: midpoint === null ? [...endpoints] : [endpoints[0], midpoint, endpoints[1]]
	const stopCount = kind === "flat" ? 0 : kind === "supported-two-stop" ? 2 : 3
	const midpointIdentity = midpoint === null ? "" : `:${stageIdentityFromStop(midpoint)}`
	return Object.freeze({
		id: `${pathId}|${kind}${midpointIdentity}`,
		kind,
		stopCount,
		endpoints,
		midpoint,
		stops: Object.freeze(stops),
		fidelity,
	})
}

function stageIdentityFromStop(stop: AlbumArtworkPaletteV2Phase3FieldRenderExactStop): string {
	return [stop.familyId, stop.regionId, stop.exactColor.provenance.pixelIndex].join(":")
}

function compareRenderCandidates(
	first: AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
	second: AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
): number {
	return compareDescending(first.fidelity.level, second.fidelity.level) ||
		compareDescending(first.fidelity.value, second.fidelity.value) ||
		first.stopCount - second.stopCount || compareAscii(first.id, second.id)
}

function midpointWork(
	pathId: string,
	stage: FieldTransitionPathStageEvidence,
	colorPosition: number,
	stages: readonly FieldTransitionPathStageEvidence[],
	endpoints: AlbumArtworkPaletteV2Phase3FieldRenderCandidate["endpoints"],
	familyBinStep: number,
	twoStopFidelity: number,
): MidpointWork {
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY
	const midpointPosition = policy.midpointPosition
	const firstEndpoint = endpoints[0].exactColor.oklab
	const secondEndpoint = endpoints[1].exactColor.oklab
	const directHalfway = mixOKLab(firstEndpoint, secondEndpoint, midpointPosition)
	const spatialHalfwayDelta = Math.abs(stage.spatialPosition - midpointPosition)
	const colorHalfwayDelta = Math.abs(colorPosition - midpointPosition)
	const halfwayPositionDelta = Math.max(spatialHalfwayDelta, colorHalfwayDelta)
	const directHalfwayDistance = okDistance(stage.exactColor.oklab, directHalfway)
	const firstEndpointDistance = okDistance(stage.exactColor.oklab, firstEndpoint)
	const secondEndpointDistance = okDistance(stage.exactColor.oklab, secondEndpoint)
	const spatialPositionEligible = spatialHalfwayDelta <= policy.maximumMidpointPositionDelta
	const endpointAxisIntervalEligible = colorPosition >= policy.midpointEndpointAxisInterval[0] &&
		colorPosition <= policy.midpointEndpointAxisInterval[1]
	const colorHalfwayEligible = colorHalfwayDelta <= policy.maximumMidpointPositionDelta
	const colorPositionEligible = endpointAxisIntervalEligible && colorHalfwayEligible
	const populationEligible = stage.populationFraction >= policy.minimumMidpointPopulationFraction
	const quadrantCoverageEligible = stage.quadrantCoverage >= policy.minimumMidpointQuadrantCoverage
	const minimumDistance = familyBinStep * policy.minimumMidpointDistanceInFamilyBinSteps
	const directHalfwayDistanceEligible = directHalfwayDistance >= minimumDistance
	const endpointDistanceEligible = firstEndpointDistance >= minimumDistance &&
		secondEndpointDistance >= minimumDistance
	const eligible = spatialPositionEligible && colorPositionEligible && populationEligible &&
		quadrantCoverageEligible && directHalfwayDistanceEligible && endpointDistanceEligible
	const stop = stageStop(stage, midpointPosition, colorPosition)
	const threeStopFidelity = eligible
		? renderFidelity(stages, firstEndpoint, secondEndpoint, familyBinStep, (spatialPosition) =>
			spatialPosition <= midpointPosition
				? mixOKLab(firstEndpoint, stage.exactColor.oklab, spatialPosition / midpointPosition)
				: mixOKLab(
					stage.exactColor.oklab,
					secondEndpoint,
					(spatialPosition - midpointPosition) / (1 - midpointPosition),
			))
		: null
	const diagnostic = Object.freeze({
		id: stageIdentity(stage),
		stageIndex: stage.stageIndex,
		spatialPosition: stage.spatialPosition,
		colorPosition,
		populationFraction: stage.populationFraction,
		quadrantCoverage: stage.quadrantCoverage,
		spatialHalfwayDelta,
		colorHalfwayDelta,
		halfwayPositionDelta,
		directHalfwayDistance,
		firstEndpointDistance,
		secondEndpointDistance,
		spatialPositionEligible,
		endpointAxisIntervalEligible,
		colorHalfwayEligible,
		colorPositionEligible,
		populationEligible,
		quadrantCoverageEligible,
		directHalfwayDistanceEligible,
		endpointDistanceEligible,
		eligible,
		threeStopFidelity: threeStopFidelity?.value ?? null,
		threeStopGain: threeStopFidelity === null ? null : threeStopFidelity.value - twoStopFidelity,
		exactColor: stage.exactColor,
	})
	return {
		diagnostic,
		stop,
		candidate: threeStopFidelity === null
			? null
			: candidate(pathId, "supported-three-stop", endpoints, stop, threeStopFidelity),
	}
}

function pathSupport(
	value: unknown,
): AlbumArtworkPaletteV2Phase3FieldRenderPathSupport {
	const path = isRecord(value) ? value : {}
	return Object.freeze({
		transitionPopulationFraction: finiteNumber(path.transitionPopulationFraction)
			? path.transitionPopulationFraction : 0,
		transitionQuadrantCoverage: finiteNumber(path.transitionQuadrantCoverage)
			? path.transitionQuadrantCoverage : 0,
		transitionFamilyCount: Number.isSafeInteger(path.transitionFamilyCount)
			? path.transitionFamilyCount as number : 0,
		hypothesisFieldFidelity: isRecord(path.hypothesis) && finiteNumber(path.hypothesis.fieldFidelity)
			? path.hypothesis.fieldFidelity : 0,
	})
}

function endpointAxisColorPosition(
	color: OKLab,
	firstEndpoint: OKLab,
	secondEndpoint: OKLab,
): number {
	const delta: OKLab = [
		secondEndpoint[0] - firstEndpoint[0],
		secondEndpoint[1] - firstEndpoint[1],
		secondEndpoint[2] - firstEndpoint[2],
	]
	const squaredDistance = delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2
	return (
		(color[0] - firstEndpoint[0]) * delta[0] +
		(color[1] - firstEndpoint[1]) * delta[1] +
		(color[2] - firstEndpoint[2]) * delta[2]
	) / squaredDistance
}

function evaluatePathAgainstEndpoints(
	path: SupportedFieldTransitionPathEvidence,
	endpointInput: unknown,
	familyBinStep: number,
): AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle {
	const id = renderPathIdentity(path, endpointInput)
	const support = pathSupport(path)
	const inherited = inheritedEligibility(path)
	const rejectionReasons = pathRejectionReasons(path)
	if (rejectionReasons.length === 0) {
		rejectionReasons.push(...orderedEndpointRejectionReasons(endpointInput, path.stages))
	}
	if (rejectionReasons.length > 0) {
		return Object.freeze({
			id,
			path,
			support,
			inheritedEligibility: inherited,
			eligible: false,
			rejectionReasons: Object.freeze(rejectionReasons),
			endpoints: null,
			midpointDiagnostics: Object.freeze([]),
			candidates: Object.freeze([]),
			selectedRender: null,
		})
	}

	const firstStage = path.stages[0]
	const secondStage = path.stages.at(-1)!
	const endpointCustody = endpointInput as AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody
	const endpoints = Object.freeze([
		endpointStop(firstStage, endpointCustody[0], 0),
		endpointStop(secondStage, endpointCustody[1], 1),
	] as const)
	const firstEndpoint = endpoints[0].exactColor.oklab
	const secondEndpoint = endpoints[1].exactColor.oklab
	const flat = candidate(
		id,
		"flat",
		endpoints,
		null,
		renderFidelity(path.stages, firstEndpoint, secondEndpoint, familyBinStep, null),
	)
	const twoStop = candidate(
		id,
		"supported-two-stop",
		endpoints,
		null,
		renderFidelity(path.stages, firstEndpoint, secondEndpoint, familyBinStep,
			(spatialPosition) => mixOKLab(firstEndpoint, secondEndpoint, spatialPosition)),
	)
	const midpointWorkItems = path.stages.slice(1, -1).map((stage) => midpointWork(
		id,
		stage,
		endpointAxisColorPosition(stage.exactColor.oklab, firstEndpoint, secondEndpoint),
		path.stages,
		endpoints,
		familyBinStep,
		twoStop.fidelity.value,
	))
	const threeStopCandidates = midpointWorkItems.flatMap(({ candidate: value }) =>
		value === null ? [] : [value]).sort((first, second) => compareAscii(first.id, second.id))
	const candidates = [flat, twoStop, ...threeStopCandidates]
	const selectedRender = [...candidates].sort(compareRenderCandidates)[0]
	const midpointDiagnostics = midpointWorkItems.map(({ diagnostic, candidate: value }) => Object.freeze({
		...diagnostic,
		selected: value?.id === selectedRender.id,
	}))
	return Object.freeze({
		id,
		path,
		support,
		inheritedEligibility: inherited,
		eligible: true,
		rejectionReasons: Object.freeze([]),
		endpoints,
		midpointDiagnostics: Object.freeze(midpointDiagnostics),
		candidates: Object.freeze(candidates),
		selectedRender,
	})
}

export function evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
	path: SupportedFieldTransitionPathEvidence,
	endpoints: AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody,
	familyBinStep: number,
): AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle {
	if (!Number.isFinite(familyBinStep) || familyBinStep <= 0) {
		throw new RangeError("Field render candidate evaluation requires a positive finite family-bin step")
	}
	return evaluatePathAgainstEndpoints(path, endpoints, familyBinStep)
}

function comparePathSupport(
	first: AlbumArtworkPaletteV2Phase3FieldRenderPathSupport,
	second: AlbumArtworkPaletteV2Phase3FieldRenderPathSupport,
): number {
	return compareDescending(first.transitionPopulationFraction, second.transitionPopulationFraction) ||
		compareDescending(first.transitionQuadrantCoverage, second.transitionQuadrantCoverage) ||
		compareDescending(first.transitionFamilyCount, second.transitionFamilyCount) ||
		compareDescending(first.hypothesisFieldFidelity, second.hypothesisFieldFidelity)
}

function compareBundles(
	first: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	second: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
): number {
	if (first.selectedRender !== null && second.selectedRender !== null) {
		return compareDescending(first.selectedRender.fidelity.level, second.selectedRender.fidelity.level) ||
			compareDescending(first.selectedRender.fidelity.value, second.selectedRender.fidelity.value) ||
			comparePathSupport(first.support, second.support) ||
			first.selectedRender.stopCount - second.selectedRender.stopCount ||
			compareAscii(first.id, second.id) ||
			compareAscii(first.selectedRender.id, second.selectedRender.id)
	}
	if (first.selectedRender !== null) return -1
	if (second.selectedRender !== null) return 1
	return compareAscii(first.id, second.id)
}

export function evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
	paths: readonly SupportedFieldTransitionPathEvidence[],
	familyBinStep: number,
): AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation {
	if (!Number.isFinite(familyBinStep) || familyBinStep <= 0) {
		throw new RangeError("Field render candidate evaluation requires a positive finite family-bin step")
	}
	const bundles = paths.map((path) =>
		evaluatePathAgainstEndpoints(path, defaultEndpointCustody(path), familyBinStep)).sort(compareBundles)
	const selectedBundle = bundles.find(({ selectedRender }) => selectedRender !== null) ?? null
	const selected = selectedBundle === null
		? null
		: Object.freeze({
			pathId: selectedBundle.id,
			renderId: selectedBundle.selectedRender!.id,
			path: selectedBundle.path,
			support: selectedBundle.support,
			render: selectedBundle.selectedRender!,
		})
	return Object.freeze({
		identity: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_IDENTITY,
		diagnostics: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS,
		familyBinStep,
		bundles: Object.freeze(bundles),
		selected,
		summary: Object.freeze({
			inputPathCount: paths.length,
			eligiblePathCount: bundles.filter(({ eligible }) => eligible).length,
			candidateCount: bundles.reduce((sum, bundle) => sum + bundle.candidates.length, 0),
		}),
	})
}
