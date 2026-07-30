import {
	completeTreatmentKey,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
	fieldDirectionKey,
	generateCompletePaletteTreatments,
	roleDirectionKeys,
} from "./album-artwork-palette-v2.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	CompletePaletteTreatment,
	FieldHypothesis,
	IdentityObligation,
	NativePaletteEvidence,
	PaletteRoleColor,
	RecallAuditTreatmentLineage,
} from "./album-artwork-palette-v2.ts"
import {
	evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility,
	AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
	AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody,
	AlbumArtworkPaletteV2Phase3FieldRenderPathSupport,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	FieldTransitionExactStageColor,
	FieldTransitionPathStageEvidence,
	SupportedFieldTransitionPathEvidence,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import { okDistance, rgbToHex, rgbToOKLab } from "./color.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_ID =
	"album-artwork-palette-v2-phase-3-path-component-render-materialization-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY = Object.freeze({
	maximumBundles: 90,
	maximumRenderCandidatesPerBundle: 16,
	maximumCompleteRenderCandidates: 1_440,
	qualityUtilityResolution:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.utilityResolution,
	maximumQualityLoss:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
	qualityBoundaryTolerance: 1e-12,
} as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_FORMULAS =
	Object.freeze({
		roleBindingSelection:
			"every source-valid ordinary-lineage shared flat/gradient role binding enters the complete binding-by-render cross-product without preliminary selection",
		qualityGate:
			"fixed baseline unrestricted winner quality utility minus the unchanged 0.12 maximum quality loss",
		finalOrdering:
			"eligible and within bound; descending recovery relation-utility 0.005 level; quality-utility 0.005 level; render-fidelity 0.005 level; raw render fidelity; existing path support; fewer stops; ASCII internal render key",
		numericsCustody:
			"flat and endpoint two-stop complete-treatment contrast and quality are independently generated; three-stop reuses endpoint-gradient complete-treatment numerics while source-field reconstruction is separately scored by render fidelity",
	} as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR =
	"Path-bound render materialization input exceeds its fixed bound" as const

const ROLES = ["background", "surface", "foreground", "accent"] as const
const ENDPOINT_ROLES = ["background", "surface"] as const
const RADIAL_OFFSET_CENTERS = [
	{ direction: "center-0.35-0.50" as const, center: [0.35, 0.5] as const },
	{ direction: "center-0.65-0.50" as const, center: [0.65, 0.5] as const },
	{ direction: "center-0.50-0.65" as const, center: [0.5, 0.65] as const },
] as const

type EndpointRole = typeof ENDPOINT_ROLES[number]

export type AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput = Readonly<{
	sourceEvidence: NativePaletteEvidence
	treatmentEvidence: NativePaletteEvidence
	renderBundles: readonly AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle[]
	identityObligations: readonly IdentityObligation[]
	baselineUnrestrictedWinnerEvaluation:
		AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
}>

export type AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody = Readonly<{
	pathEndpointIndex: 0 | 1
	role: EndpointRole
	familyId: string
	pathRegionId: string
	derivedPathRegionId: string
	componentId: string
	componentStartPixelIndex: number
	componentPopulation: number
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3PathBoundStageLineage = Readonly<{
	stageIndex: number
	familyId: string
	regionId: string
	componentStartPixelIndex: number
	spatialPosition: number
	colorPosition: number
	population: number
	populationFraction: number
	imagePopulationFraction: number
	quadrantCoverage: number
	exactColor: FieldTransitionExactStageColor
}>

export type AlbumArtworkPaletteV2Phase3PathBoundRoleCustody = Readonly<{
	role: typeof ROLES[number]
	endpoint: boolean
	familyId: string
	componentId: string
	componentStartPixelIndex: number
	componentPopulation: number
	componentQuadrantCoverage: number
	exemplar: Readonly<{ x: number; y: number }>
	supportRegionIds: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3PathBoundRenderLineage = Readonly<{
	bundleId: string
	fieldDomainId: string
	topology: SupportedFieldTransitionPathEvidence["topology"]
	direction: SupportedFieldTransitionPathEvidence["direction"]
	stages: readonly AlbumArtworkPaletteV2Phase3PathBoundStageLineage[]
	endpoints: readonly [
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	]
	midpoint: AlbumArtworkPaletteV2Phase3FieldRenderExactStop | null
}>

export type AlbumArtworkPaletteV2Phase3PathBoundCompleteNumericsCustody = Readonly<{
	completeTreatmentSource:
		"independently-generated-flat-endpoint-treatment" |
		"independently-generated-endpoint-gradient-treatment" |
		"reused-endpoint-gradient-treatment-for-three-stop-render"
	contrastAndQualityIndependentlyGeneratedForThisRender: boolean
	threeStopAPCARecomputed: false
	renderFidelitySeparatelyScored: boolean
}>

export type AlbumArtworkPaletteV2Phase3PathBoundOrdinaryLineage = Readonly<{
	descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor
	evaluation: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility
	candidateEligibility: AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility
}>

export type AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate = Readonly<{
	renderKey: string
	publicTreatmentKey: string
	bundleId: string
	treatment: CompletePaletteTreatment
	render: AlbumArtworkPaletteV2Phase3FieldRenderCandidate
	recoveryEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	support: AlbumArtworkPaletteV2Phase3FieldRenderPathSupport
	roleBindingKey: string
	roleCustody: readonly AlbumArtworkPaletteV2Phase3PathBoundRoleCustody[]
	ordinaryCompleteLineage: AlbumArtworkPaletteV2Phase3PathBoundOrdinaryLineage
	pathLineage: AlbumArtworkPaletteV2Phase3PathBoundRenderLineage
	numericsCustody: AlbumArtworkPaletteV2Phase3PathBoundCompleteNumericsCustody
	qualityLossFromBaseline: number
	qualityFloor: number
	withinQualityBound: boolean
	withinMaterializationBounds: true
	eligible: boolean
}>

export type AlbumArtworkPaletteV2Phase3PathBoundSharedRoleBindingDiagnostic = Readonly<{
	key: string
	flatTreatmentKey: string
	gradientTreatmentKey: string
	foregroundFamilyId: string
	foregroundHex: string
	accentFamilyId: string
	accentHex: string
	surfaceCollapsed: false
	accentCollapsed: boolean
	minimumQualityUtilityLevel: number
	minimumQualityUtility: number
	minimumIdentityCoverage: number
	flatOrdinaryLineageEligible: boolean
	gradientOrdinaryLineageEligible: boolean
	selected: boolean
}>

export type AlbumArtworkPaletteV2Phase3PathBoundBundleDiagnostic = Readonly<{
	bundleId: string
	eligible: boolean
	status: "materialized" | "rejected"
	rejectionReasons: readonly string[]
	endpointCustody: readonly [
		AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
		AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
	] | null
	gradientHypothesis: FieldHypothesis | null
	flatHypothesis: FieldHypothesis | null
	generatedGradientTreatmentCount: number
	generatedFlatTreatmentCount: number
	validGradientTreatmentCount: number
	validFlatTreatmentCount: number
	sharedRoleBindings: readonly AlbumArtworkPaletteV2Phase3PathBoundSharedRoleBindingDiagnostic[]
	sharedRoleBindingCount: number
	completeCrossProductCount: number
	selectedRoleBindingKey: string | null
	selectedRoleCustody: readonly AlbumArtworkPaletteV2Phase3PathBoundRoleCustody[]
	preselectionRenderIds: readonly string[]
	completeRenderKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_FORMULAS
	baselineUnrestrictedWinnerKey: string
	baselineUnrestrictedWinnerQualityUtility: number
	baselineUnrestrictedWinnerRelationUtility: number
	baselineUnrestrictedWinnerEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	qualityFloor: number
	inputBundleCount: number
	inputRenderCandidateCount: number
	materializedBundleCount: number
	rejectedBundleCount: number
	sharedRoleBindingCount: number
	completeCrossProductCount: number
	completeRenderCandidateCount: number
	qualityEligibleCompleteRenderCandidateCount: number
	selectedRenderKey: string | null
	selectedPublicTreatmentKey: string | null
	selectedRenderId: string | null
	publicTreatmentStateDerivedHere: false
	bounds: Readonly<{
		bundleCountWithinBound: boolean
		renderCandidatesPerBundleWithinBound: boolean
		completeRenderCandidateCountWithinBound: boolean
	}>
	bundles: readonly AlbumArtworkPaletteV2Phase3PathBoundBundleDiagnostic[]
}>

export type AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization = Readonly<{
	selected: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate | null
	candidates: readonly AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[]
	eligibleCandidates: readonly AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[]
	diagnostics: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationDiagnostics
}>

type SourceComponent = Readonly<{
	familyIndex: number
	familyId: string
	startPixelIndex: number
	population: number
	quadrantBits: number
	quadrantCoverage: number
	pathRegionId: string
}>

type StageCustody = Readonly<{
	stage: FieldTransitionPathStageEvidence
	component: SourceComponent
}>

type BoundEndpointWork = Readonly<{
	role: EndpointRole
	stage: FieldTransitionPathStageEvidence
	component: SourceComponent
	family: ColorFamilyEvidence
	familyComponent: ColorFamilyEvidence["components"][number]
	representative: ColorRepresentative
	publicCustody: AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody
}>

type SharedRoleBindingWork = Readonly<{
	key: string
	flat: CompletePaletteTreatment
	gradient: CompletePaletteTreatment
	flatEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	gradientEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	flatLineage: AlbumArtworkPaletteV2Phase3PathBoundOrdinaryLineage
	gradientLineage: AlbumArtworkPaletteV2Phase3PathBoundOrdinaryLineage
	roleCustody: readonly AlbumArtworkPaletteV2Phase3PathBoundRoleCustody[]
	minimumQualityUtilityLevel: number
	minimumQualityUtility: number
	minimumIdentityCoverage: number
}>

type BundleWork = Readonly<{
	diagnostic: AlbumArtworkPaletteV2Phase3PathBoundBundleDiagnostic
	candidates: readonly AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[]
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function sameNumbers(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function utilityLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
			.qualityUtilityResolution)
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function treatmentStructuralKey(treatment: CompletePaletteTreatment): string {
	return [
		completeTreatmentKey(treatment),
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.familyRoles.foreground,
		treatment.familyRoles.accent,
		treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
		`cardinality-${treatment.cardinality}`,
		gradientRenderingKey(treatment),
		treatment.sourceFieldHypothesisId,
	].join("\0")
}

function validBaselineEvaluation(
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
): boolean {
	if (evaluation === null || typeof evaluation !== "object" ||
		evaluation.treatment === null || typeof evaluation.treatment !== "object" ||
		evaluation.quality === null || typeof evaluation.quality !== "object" ||
		evaluation.evidenceLevels === null || typeof evaluation.evidenceLevels !== "object" ||
		evaluation.key !== completeTreatmentKey(evaluation.treatment) ||
		evaluation.structuralKey !== treatmentStructuralKey(evaluation.treatment) ||
		!["earned-rendered", "missing", "unearned", "not-applicable"].includes(evaluation.gradientStatus) ||
		!Number.isFinite(evaluation.qualityUtility) || !Number.isFinite(evaluation.relationUtility) ||
		!Number.isFinite(evaluation.identityCoverage) || !Number.isFinite(evaluation.identityGain) ||
		!Number.isSafeInteger(utilityLevel(evaluation.qualityUtility)) ||
		!Number.isSafeInteger(utilityLevel(evaluation.relationUtility)) ||
		Math.abs(evaluation.relationUtility -
			(evaluation.qualityUtility + evaluation.identityGain)) > 1e-12 ||
		typeof evaluation.paretoMember !== "boolean" ||
		(evaluation.dominatedByKey !== null && typeof evaluation.dominatedByKey !== "string") ||
		!Array.isArray(evaluation.identityRoles)) return false
	let expectedQualityUtility = 0
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES) {
		const quality = evaluation.quality[axis]
		const level = evaluation.evidenceLevels[axis]
		if (!Number.isFinite(quality) || !Number.isSafeInteger(level) ||
			level !== Math.floor((quality + 1e-12) /
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.evidenceResolution)) return false
		expectedQualityUtility +=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights[axis] * quality
	}
	return Math.abs(evaluation.qualityUtility - expectedQualityUtility) <= 1e-12
}

function validEvidenceShape(evidence: NativePaletteEvidence): boolean {
	return Number.isSafeInteger(evidence.width) && evidence.width > 0 &&
		Number.isSafeInteger(evidence.height) && evidence.height > 0 &&
		Number.isSafeInteger(evidence.pixelCount) && evidence.pixelCount > 0 &&
		evidence.width * evidence.height === evidence.pixelCount &&
		evidence.rgbData.length === evidence.pixelCount * 3 &&
		evidence.labs.length === evidence.pixelCount * 3 &&
		evidence.familyAt.length === evidence.pixelCount &&
		evidence.families.length > 0 && Number.isFinite(evidence.familyBinStep) &&
		evidence.familyBinStep > 0
}

function createSourceComponentIndex(evidence: NativePaletteEvidence): Readonly<{
	at: (pixelIndex: number) => SourceComponent | null
}> {
	const componentAt = new Int32Array(evidence.pixelCount).fill(-1)
	const components: SourceComponent[] = []
	const queue = new Int32Array(evidence.pixelCount)
	return {
		at(pixelIndex): SourceComponent | null {
			if (!Number.isSafeInteger(pixelIndex) || pixelIndex < 0 || pixelIndex >= evidence.pixelCount) {
				return null
			}
			const cached = componentAt[pixelIndex]
			if (cached >= 0) return components[cached] ?? null
			const familyIndex = evidence.familyAt[pixelIndex]
			const family = evidence.families[familyIndex]
			if (!family) return null
			const componentIndex = components.length
			let queueRead = 0
			let queueLength = 1
			let startPixelIndex = pixelIndex
			let quadrantBits = 0
			queue[0] = pixelIndex
			componentAt[pixelIndex] = componentIndex
			while (queueRead < queueLength) {
				const current = queue[queueRead++]
				startPixelIndex = Math.min(startPixelIndex, current)
				const x = current % evidence.width
				const y = Math.floor(current / evidence.width)
				quadrantBits |= 1 << ((x >= evidence.width / 2 ? 1 : 0) +
					(y >= evidence.height / 2 ? 2 : 0))
				const neighbors = [
					x > 0 ? current - 1 : -1,
					x + 1 < evidence.width ? current + 1 : -1,
					current >= evidence.width ? current - evidence.width : -1,
					current + evidence.width < evidence.pixelCount ? current + evidence.width : -1,
				]
				for (const neighbor of neighbors) {
					if (neighbor < 0 || componentAt[neighbor] >= 0 ||
						evidence.familyAt[neighbor] !== familyIndex) continue
					componentAt[neighbor] = componentIndex
					queue[queueLength++] = neighbor
				}
			}
			const component: SourceComponent = {
				familyIndex,
				familyId: family.id,
				startPixelIndex,
				population: queueLength,
				quadrantBits,
				quadrantCoverage: ((quadrantBits & 1 ? 1 : 0) + (quadrantBits & 2 ? 1 : 0) +
					(quadrantBits & 4 ? 1 : 0) + (quadrantBits & 8 ? 1 : 0)) / 4,
				pathRegionId: `${family.id}-transition-region-${startPixelIndex}`,
			}
			components.push(component)
			return component
		},
	}
}

function exactColorMatchesStage(
	first: FieldTransitionExactStageColor,
	second: FieldTransitionExactStageColor,
): boolean {
	return first.hex === second.hex && sameNumbers(first.rgb, second.rgb) &&
		sameNumbers(first.oklab, second.oklab) &&
		first.provenance.exactSource === second.provenance.exactSource &&
		first.provenance.familyId === second.provenance.familyId &&
		first.provenance.regionId === second.provenance.regionId &&
		first.provenance.pixelIndex === second.provenance.pixelIndex &&
		first.provenance.x === second.provenance.x && first.provenance.y === second.provenance.y
}

function stopMatchesStage(
	stop: AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	stage: FieldTransitionPathStageEvidence,
): boolean {
	return stop.sourceStageIndex === stage.stageIndex && stop.familyId === stage.familyId &&
		stop.regionId === stage.regionId && stop.sourceSpatialPosition === stage.spatialPosition &&
		exactColorMatchesStage(stop.exactColor, stage.exactColor)
}

function sameStop(
	first: AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	second: AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
): boolean {
	return first.position === second.position && first.sourceStageIndex === second.sourceStageIndex &&
		first.sourceSpatialPosition === second.sourceSpatialPosition &&
		first.sourceColorPosition === second.sourceColorPosition && first.familyId === second.familyId &&
		first.regionId === second.regionId && exactColorMatchesStage(first.exactColor, second.exactColor)
}

function stageSourceCustody(
	stage: FieldTransitionPathStageEvidence,
	evidence: NativePaletteEvidence,
	components: ReturnType<typeof createSourceComponentIndex>,
): StageCustody | null {
	const exact = stage.exactColor
	const provenance = exact.provenance
	if (!provenance.exactSource || provenance.familyId !== stage.familyId ||
		provenance.regionId !== stage.regionId ||
		provenance.pixelIndex !== provenance.y * evidence.width + provenance.x ||
		provenance.x < 0 || provenance.x >= evidence.width ||
		provenance.y < 0 || provenance.y >= evidence.height ||
		rgbToHex(exact.rgb) !== exact.hex ||
		okDistance(rgbToOKLab(exact.rgb), exact.oklab) >
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.exactColorOKLabTolerance) {
		return null
	}
	const offset = provenance.pixelIndex * 3
	if (evidence.rgbData[offset] !== exact.rgb[0] || evidence.rgbData[offset + 1] !== exact.rgb[1] ||
		evidence.rgbData[offset + 2] !== exact.rgb[2]) return null
	const familyIndex = evidence.familyAt[provenance.pixelIndex]
	if (evidence.families[familyIndex]?.id !== stage.familyId) return null
	const component = components.at(provenance.pixelIndex)
	if (component === null || component.familyId !== stage.familyId ||
		component.pathRegionId !== stage.regionId) return null
	return { stage, component }
}

function nearlyEqual(first: number, second: number): boolean {
	return Math.abs(first - second) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.fractionCoherenceTolerance *
			Math.max(1, Math.abs(first), Math.abs(second))
}

function sourceStageMetricsCoherent(
	path: SupportedFieldTransitionPathEvidence,
	stageCustodies: readonly StageCustody[],
	evidence: NativePaletteEvidence,
): boolean {
	const pathPopulation = stageCustodies.reduce((sum, { component }) => sum + component.population, 0)
	if (!Number.isSafeInteger(pathPopulation) || pathPopulation <= 0) return false
	for (const { stage, component } of stageCustodies) {
		if (stage.population !== component.population ||
			!nearlyEqual(stage.populationFraction, component.population / pathPopulation) ||
			!nearlyEqual(stage.imagePopulationFraction, component.population / evidence.pixelCount) ||
			!nearlyEqual(stage.quadrantCoverage, component.quadrantCoverage)) return false
	}
	const acceptedIndexes = new Set(path.acceptedIntermediateSupport.map(({ stageIndex }) => stageIndex))
	const accepted = stageCustodies.filter(({ stage }) => acceptedIndexes.has(stage.stageIndex))
	const transitionPopulationFraction = accepted.reduce((sum, { component }) =>
		sum + component.population, 0) / pathPopulation
	const transitionFamilyCount = new Set(accepted.map(({ component }) => component.familyIndex)).size
	const quadrantBits = accepted.reduce((bits, { component }) => bits | component.quadrantBits, 0)
	const transitionQuadrantCoverage = ((quadrantBits & 1 ? 1 : 0) + (quadrantBits & 2 ? 1 : 0) +
		(quadrantBits & 4 ? 1 : 0) + (quadrantBits & 8 ? 1 : 0)) / 4
	return nearlyEqual(path.transitionPopulationFraction, transitionPopulationFraction) &&
		path.transitionFamilyCount === transitionFamilyCount &&
		nearlyEqual(path.transitionQuadrantCoverage, transitionQuadrantCoverage)
}

function fidelityShapeValid(candidate: AlbumArtworkPaletteV2Phase3FieldRenderCandidate): boolean {
	const fidelity = candidate.fidelity
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY
	return [
		fidelity.massRMSE,
		fidelity.stageRMSE,
		fidelity.weightedP90,
		fidelity.sigma,
		fidelity.value,
		fidelity.quantizedValue,
	].every(Number.isFinite) && fidelity.massRMSE >= 0 && fidelity.stageRMSE >= 0 &&
		fidelity.weightedP90 >= 0 && fidelity.sigma >= policy.minimumSigma &&
		fidelity.value >= 0 && fidelity.value <= 1 && Number.isSafeInteger(fidelity.level) &&
		fidelity.level === Math.floor((fidelity.value + 1e-12) / policy.fidelityResolution) &&
		fidelity.quantizedValue === fidelity.level * policy.fidelityResolution &&
		fidelity.stageErrors.length > 0 && fidelity.stageErrors.every((error) =>
			Number.isSafeInteger(error.stageIndex) && error.stageIndex >= 0 &&
			Number.isFinite(error.spatialPosition) && Number.isFinite(error.populationFraction) &&
			error.populationFraction > 0 && Number.isFinite(error.distance) && error.distance >= 0)
}

function sameFidelity(
	first: AlbumArtworkPaletteV2Phase3FieldRenderCandidate["fidelity"],
	second: AlbumArtworkPaletteV2Phase3FieldRenderCandidate["fidelity"],
): boolean {
	return first.massRMSE === second.massRMSE && first.stageRMSE === second.stageRMSE &&
		first.weightedP90 === second.weightedP90 && first.sigma === second.sigma &&
		first.value === second.value && first.level === second.level &&
		first.quantizedValue === second.quantizedValue &&
		first.stageErrors.length === second.stageErrors.length &&
		first.stageErrors.every((error, index) => {
			const other = second.stageErrors[index]
			return other !== undefined && error.stageIndex === other.stageIndex &&
				error.spatialPosition === other.spatialPosition &&
				error.populationFraction === other.populationFraction && error.distance === other.distance
		})
}

function coreRenderBundleMatches(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	core: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
): boolean {
	if (!core.eligible || bundle.id !== core.id || bundle.eligible !== core.eligible ||
		bundle.support.transitionPopulationFraction !== core.support.transitionPopulationFraction ||
		bundle.support.transitionQuadrantCoverage !== core.support.transitionQuadrantCoverage ||
		bundle.support.transitionFamilyCount !== core.support.transitionFamilyCount ||
		bundle.support.hypothesisFieldFidelity !== core.support.hypothesisFieldFidelity ||
		bundle.candidates.length !== core.candidates.length ||
		bundle.selectedRender?.id !== core.selectedRender?.id ||
		bundle.midpointDiagnostics.length !== core.midpointDiagnostics.length) return false
	const coreById = new Map(core.candidates.map((candidate) => [candidate.id, candidate]))
	return bundle.candidates.every((candidate) => {
		const expected = coreById.get(candidate.id)
		return expected !== undefined && fidelityShapeValid(candidate) &&
			renderCandidateStructureValid(candidate, bundle) &&
			candidate.kind === expected.kind && candidate.stopCount === expected.stopCount &&
			sameStop(candidate.endpoints[0], expected.endpoints[0]) &&
			sameStop(candidate.endpoints[1], expected.endpoints[1]) &&
			(candidate.midpoint === null
				? expected.midpoint === null
				: expected.midpoint !== null && sameStop(candidate.midpoint, expected.midpoint)) &&
			candidate.stops.length === expected.stops.length &&
			candidate.stops.every((stop, index) => sameStop(stop, expected.stops[index])) &&
			sameFidelity(candidate.fidelity, expected.fidelity)
	}) && bundle.midpointDiagnostics.every((diagnostic, index) =>
		JSON.stringify(diagnostic) === JSON.stringify(core.midpointDiagnostics[index]))
}

function renderCandidateStructureValid(
	candidate: AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
): boolean {
	if (bundle.endpoints === null || candidate.endpoints.length !== 2 ||
		!sameStop(candidate.endpoints[0], bundle.endpoints[0]) ||
		!sameStop(candidate.endpoints[1], bundle.endpoints[1]) ||
		!Number.isFinite(candidate.fidelity.value) || candidate.fidelity.value < 0 ||
		!Number.isSafeInteger(candidate.fidelity.level) || candidate.fidelity.level < 0) return false
	if (candidate.kind === "flat") {
		return candidate.stopCount === 0 && candidate.midpoint === null && candidate.stops.length === 0
	}
	if (candidate.kind === "supported-two-stop") {
		return candidate.stopCount === 2 && candidate.midpoint === null && candidate.stops.length === 2 &&
			sameStop(candidate.stops[0], candidate.endpoints[0]) &&
			sameStop(candidate.stops[1], candidate.endpoints[1])
	}
	if (candidate.kind !== "supported-three-stop" || candidate.stopCount !== 3 ||
		candidate.midpoint === null || candidate.stops.length !== 3 ||
		!sameStop(candidate.stops[0], candidate.endpoints[0]) ||
		!sameStop(candidate.stops[1], candidate.midpoint) ||
		!sameStop(candidate.stops[2], candidate.endpoints[1])) return false
	const stage = bundle.path.stages[candidate.midpoint.sourceStageIndex]
	return stage !== undefined && stopMatchesStage(candidate.midpoint, stage)
}

function pathAdmissible(bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle): boolean {
	const path = bundle.path
	const strictOnly = path.rejectionReasons.length > 0 && path.rejectionReasons.every((reason) =>
		(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_STRICT_INTERVAL_REASONS as
			readonly string[]).includes(reason))
	return bundle.eligible && path.legacyEligible && path.connected && path.hypothesis !== null &&
		(path.eligible ? path.rejectionReasons.length === 0 : strictOnly) &&
		bundle.inheritedEligibility.legacyEligible &&
		bundle.inheritedEligibility.strictEligible === path.eligible &&
		sameStrings(bundle.inheritedEligibility.rejectionReasons, path.rejectionReasons) &&
		bundle.inheritedEligibility.strictColorIntervalOnly === strictOnly
}

export function pathSpatialCenterMatchesDiscoveryGeometry(path: SupportedFieldTransitionPathEvidence): boolean {
	const center = path.spatialCenter
	if (path.topology === "linear") return center === null
	if (!Array.isArray(center) || center.length !== 2 || center.some((coordinate) =>
		!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1)) return false
	const [x, y] = center
	// Preserve discovery's center-first radial partition before interpreting the named direction.
	const inCenterRegion = Math.hypot(x - 0.5, y - 0.5) <= 0.08
	const inUpperCenterRegion = !inCenterRegion &&
		Math.abs(x - 0.5) <= 0.1 && y >= 0.2 && y <= 0.44
	if (path.topology === "radial-center") {
		return path.direction === "center-out" && inCenterRegion
	}
	if (path.topology === "radial-upper-center") {
		return path.direction === "center-out" && inUpperCenterRegion
	}
	if (path.topology !== "radial-offset" || inCenterRegion || inUpperCenterRegion) return false
	const nearest = [...RADIAL_OFFSET_CENTERS].sort((first, second) =>
		Math.hypot(x - first.center[0], y - first.center[1]) -
		Math.hypot(x - second.center[0], y - second.center[1]) ||
		compareAscii(first.direction, second.direction))[0]
	return path.direction === nearest.direction
}

function supportedTreatmentGeometry(hypothesis: FieldHypothesis): boolean {
	const gradient = hypothesis.gradientEvidence
	return gradient !== null && (
		(gradient.topology === "linear" &&
			["horizontal", "vertical", "diagonal-down", "diagonal-up"].includes(gradient.direction)) ||
		((gradient.topology === "radial-center" || gradient.topology === "radial-upper-center") &&
			gradient.direction === "center-out") ||
		(gradient.topology === "radial-offset" && RADIAL_OFFSET_CENTERS.some(({ direction }) =>
			direction === gradient.direction))
	)
}

function hypothesisMatchesPathOrientation(path: SupportedFieldTransitionPathEvidence): boolean {
	const hypothesis = path.hypothesis
	const gradient = hypothesis?.gradientEvidence
	if (!hypothesis || !gradient || !supportedTreatmentGeometry(hypothesis) ||
		gradient.fieldDomainId !== path.fieldDomainId || gradient.topology !== path.topology ||
		gradient.direction !== path.direction ||
		!sameStrings(gradient.supportingFamilyIds, path.endpointFamilyIds)) return false
	const backgroundAtFirst = gradient.backgroundTopologyEndpoint === "low"
	const backgroundFamilyId = backgroundAtFirst ? path.endpointFamilyIds[0] : path.endpointFamilyIds[1]
	const surfaceFamilyId = backgroundAtFirst ? path.endpointFamilyIds[1] : path.endpointFamilyIds[0]
	return hypothesis.kind === "gradient-field" &&
		hypothesis.backgroundFamilyId === backgroundFamilyId &&
		hypothesis.surfaceFamilyId === surfaceFamilyId &&
		hypothesis.roleAssignment?.backgroundFamilyId === backgroundFamilyId &&
		hypothesis.roleAssignment.surfaceFamilyId === surfaceFamilyId &&
		gradient.roleAssignment.backgroundFamilyId === backgroundFamilyId &&
		gradient.roleAssignment.surfaceFamilyId === surfaceFamilyId
}

function endpointRepresentative(
	stage: FieldTransitionPathStageEvidence,
	component: SourceComponent,
	family: ColorFamilyEvidence,
	familyComponent: ColorFamilyEvidence["components"][number],
): ColorRepresentative {
	const componentFamilyFraction = component.population / Math.max(1, family.population)
	return {
		strategy: "dense-exact",
		rgb: stage.exactColor.rgb,
		oklab: stage.exactColor.oklab,
		hex: stage.exactColor.hex,
		support: {
			exactSource: true,
			exemplar: {
				x: stage.exactColor.provenance.x,
				y: stage.exactColor.provenance.y,
			},
			anchorFamilyId: family.id,
			regionIds: [stage.regionId],
			perceptualDensity: componentFamilyFraction,
			totalSupport: family.populationFraction,
			connectedSupport: familyComponent.populationFraction,
			spatialCoverage: stage.quadrantCoverage,
			concentration: componentFamilyFraction,
			prototypeDistance: okDistance(stage.exactColor.oklab, family.prototype),
			outlierScore: Math.max(0, 1 - componentFamilyFraction),
			synthesis: null,
		},
	}
}

function bindEndpoints(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	stageCustodies: readonly StageCustody[],
	treatmentEvidence: NativePaletteEvidence,
): readonly [BoundEndpointWork, BoundEndpointWork] | null {
	const path = bundle.path
	const gradient = path.hypothesis?.gradientEvidence
	if (!gradient || stageCustodies.length < 2) return null
	const endpointStages = [stageCustodies[0], stageCustodies.at(-1)!] as const
	const pathRoles: readonly [EndpointRole, EndpointRole] = gradient.backgroundTopologyEndpoint === "low"
		? ["background", "surface"]
		: ["surface", "background"]
	const entries = endpointStages.map((custody, index): BoundEndpointWork | null => {
		const family = treatmentEvidence.families.find(({ id }) => id === custody.stage.familyId)
		const familyComponent = family?.components.find(({ startPixelIndex, population }) =>
			startPixelIndex === custody.component.startPixelIndex && population === custody.component.population)
		if (!family || !familyComponent ||
			familyComponent.id !== `${family.id}-region-${custody.component.startPixelIndex}`) return null
		const role = pathRoles[index]
		const representative = endpointRepresentative(
			custody.stage,
			custody.component,
			family,
			familyComponent,
		)
		return {
			role,
			stage: custody.stage,
			component: custody.component,
			family,
			familyComponent,
			representative,
			publicCustody: {
				pathEndpointIndex: index as 0 | 1,
				role,
				familyId: family.id,
				pathRegionId: custody.stage.regionId,
				derivedPathRegionId: custody.component.pathRegionId,
				componentId: familyComponent.id,
				componentStartPixelIndex: custody.component.startPixelIndex,
				componentPopulation: custody.component.population,
				exactColor: custody.stage.exactColor,
			},
		}
	})
	return entries.every((entry) => entry !== null)
		? entries as unknown as readonly [BoundEndpointWork, BoundEndpointWork]
		: null
}

function clonedHypotheses(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	endpoints: readonly [BoundEndpointWork, BoundEndpointWork],
): readonly [FieldHypothesis, FieldHypothesis] {
	const source = bundle.path.hypothesis!
	const sourceGradient = source.gradientEvidence!
	const background = endpoints.find(({ role }) => role === "background")!
	const surface = endpoints.find(({ role }) => role === "surface")!
	const id = `path-component:${bundle.id}:${source.id}`
	const gradient: FieldHypothesis = {
		...source,
		id: `${id}:gradient`,
		kind: "gradient-field",
		backgroundFamilyId: background.family.id,
		surfaceFamilyId: surface.family.id,
		backgroundRepresentatives: [background.representative],
		surfaceRepresentatives: [surface.representative],
		gradientEvidence: {
			...sourceGradient,
			supportingFamilyIds: [endpoints[0].family.id, endpoints[1].family.id],
			supportingEndpointHexes: [endpoints[0].representative.hex, endpoints[1].representative.hex],
			supportingComponentIds: bundle.path.stages.map(({ regionId }) => regionId),
		},
		pruningNotes: [
			...source.pruningNotes,
			"materialized from exact path-component endpoint custody",
		],
	}
	const flat: FieldHypothesis = {
		...gradient,
		id: `${id}:flat`,
		kind: "separate-flat-fields",
		gradientEvidence: null,
		pruningNotes: [
			...source.pruningNotes,
			"materialized as the distinct exact-endpoint flat counterfactual",
		],
	}
	return [gradient, flat]
}

function sourceConnectedRole(color: PaletteRoleColor, familyId: string): boolean {
	return familyId !== "generated" && !color.generated && !("generated" in color.support) &&
		color.support.exactSource && color.support.anchorFamilyId === familyId &&
		color.support.regionIds.length > 0
}

function sourceSupportedRole(color: PaletteRoleColor, familyId: string, evidence: NativePaletteEvidence): boolean {
	return sourceConnectedRole(color, familyId) && evidence.families.some(({ id }) => id === familyId)
}

function roleSourceCustody(
	treatment: CompletePaletteTreatment,
	role: typeof ROLES[number],
	endpoints: readonly [BoundEndpointWork, BoundEndpointWork],
	evidence: NativePaletteEvidence,
	components: ReturnType<typeof createSourceComponentIndex>,
): AlbumArtworkPaletteV2Phase3PathBoundRoleCustody | null {
	const color = treatment[role]
	const familyId = treatment.familyRoles[role]
	if (!sourceConnectedRole(color, familyId) || "generated" in color.support ||
		rgbToHex(color.rgb) !== color.hex ||
		okDistance(rgbToOKLab(color.rgb), color.oklab) >
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY.exactColorOKLabTolerance) return null
	const exemplar = color.support.exemplar
	if (exemplar === null || !Number.isSafeInteger(exemplar.x) || !Number.isSafeInteger(exemplar.y) ||
		exemplar.x < 0 || exemplar.x >= evidence.width || exemplar.y < 0 || exemplar.y >= evidence.height) {
		return null
	}
	const pixelIndex = exemplar.y * evidence.width + exemplar.x
	const offset = pixelIndex * 3
	if (evidence.rgbData[offset] !== color.rgb[0] || evidence.rgbData[offset + 1] !== color.rgb[1] ||
		evidence.rgbData[offset + 2] !== color.rgb[2]) return null
	const familyIndex = evidence.familyAt[pixelIndex]
	const family = evidence.families[familyIndex]
	if (!family || family.id !== familyId) return null
	const component = components.at(pixelIndex)
	if (!component || component.familyIndex !== familyIndex || component.familyId !== familyId) return null
	const familyComponent = family.components.find(({ id, startPixelIndex, population }) =>
		id === `${familyId}-region-${component.startPixelIndex}` &&
		startPixelIndex === component.startPixelIndex && population === component.population)
	if (!familyComponent) return null
	const endpoint = endpoints.find((entry) => entry.role === role) ?? null
	if (endpoint !== null) {
		if (endpoint.family.id !== familyId || endpoint.component.startPixelIndex !== component.startPixelIndex ||
			endpoint.component.population !== component.population ||
			color.support.regionIds.length !== 1 || color.support.regionIds[0] !== endpoint.stage.regionId) return null
	} else if (!color.support.regionIds.includes(familyComponent.id)) {
		return null
	}
	return {
		role,
		endpoint: endpoint !== null,
		familyId,
		componentId: familyComponent.id,
		componentStartPixelIndex: component.startPixelIndex,
		componentPopulation: component.population,
		componentQuadrantCoverage: component.quadrantCoverage,
		exemplar,
		supportRegionIds: color.support.regionIds,
	}
}

function treatmentRoleCustody(
	treatment: CompletePaletteTreatment,
	endpoints: readonly [BoundEndpointWork, BoundEndpointWork],
	evidence: NativePaletteEvidence,
	components: ReturnType<typeof createSourceComponentIndex>,
): readonly AlbumArtworkPaletteV2Phase3PathBoundRoleCustody[] | null {
	const custody = ROLES.map((role) => roleSourceCustody(treatment, role, endpoints, evidence, components))
	return custody.every((entry) => entry !== null)
		? custody as AlbumArtworkPaletteV2Phase3PathBoundRoleCustody[]
		: null
}

function exactEndpointRoleBinding(
	treatment: CompletePaletteTreatment,
	endpoints: readonly [BoundEndpointWork, BoundEndpointWork],
): boolean {
	return endpoints.every(({ role, family, representative, stage }) => {
		const color = treatment[role]
		if (treatment.familyRoles[role] !== family.id || !sourceConnectedRole(color, family.id) ||
			color.strategy !== representative.strategy ||
			color.hex !== representative.hex || !sameNumbers(color.rgb, representative.rgb) ||
			!sameNumbers(color.oklab, representative.oklab) || "generated" in color.support) return false
		return color.support.exemplar?.x === stage.exactColor.provenance.x &&
			color.support.exemplar.y === stage.exactColor.provenance.y &&
			color.support.regionIds.length === 1 && color.support.regionIds[0] === stage.regionId
	})
}

function validCompleteTreatment(
	treatment: CompletePaletteTreatment,
	kind: "flat" | "gradient",
	hypothesis: FieldHypothesis,
	endpoints: readonly [BoundEndpointWork, BoundEndpointWork],
	treatmentEvidence: NativePaletteEvidence,
	sourceEvidence: NativePaletteEvidence,
	components: ReturnType<typeof createSourceComponentIndex>,
): boolean {
	if (treatment.sourceFieldHypothesisId !== hypothesis.id || treatment.collapse.surface ||
		treatment.background.hex === treatment.surface.hex || !exactEndpointRoleBinding(treatment, endpoints) ||
		!ROLES.every((role) => sourceSupportedRole(
			treatment[role],
			treatment.familyRoles[role],
			treatmentEvidence,
		)) || treatmentRoleCustody(treatment, endpoints, sourceEvidence, components) === null) {
		return false
	}
	return kind === "gradient"
		? treatment.gradient && treatment.fieldTreatment === "gradient-field" &&
			treatment.gradientEvidence !== null &&
			sameStrings(treatment.gradientEvidence.supportingEndpointHexes,
				[endpoints[0].representative.hex, endpoints[1].representative.hex])
		: !treatment.gradient && treatment.fieldTreatment === "separate-flat-fields" &&
			treatment.gradientEvidence === null
}

function roleColorIdentityKey(familyId: string, color: PaletteRoleColor): string {
	return [
		familyId,
		color.rgb.join(","),
		color.oklab.join(","),
		color.hex,
		color.generated ? "generated" : "source",
		color.strategy,
		JSON.stringify(color.support),
	].join("\0")
}

function sameRoleColorIdentity(
	firstFamilyId: string,
	first: PaletteRoleColor,
	secondFamilyId: string,
	second: PaletteRoleColor,
): boolean {
	return roleColorIdentityKey(firstFamilyId, first) === roleColorIdentityKey(secondFamilyId, second)
}

function roleBindingKey(treatment: CompletePaletteTreatment): string {
	return [
		roleColorIdentityKey(treatment.familyRoles.foreground, treatment.foreground),
		roleColorIdentityKey(treatment.familyRoles.accent, treatment.accent),
		treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
	].join("\0")
}

function treatmentLineage(treatment: CompletePaletteTreatment): RecallAuditTreatmentLineage {
	const representatives = ROLES.map((role) => ({
		role,
		familyId: treatment.familyRoles[role],
		hex: treatment[role].hex,
		strategy: treatment[role].strategy,
		sourceConnected: sourceConnectedRole(treatment[role], treatment.familyRoles[role]),
	}))
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: fieldDirectionKey(treatment),
		roleDirectionKeys: roleDirectionKeys(treatment),
		familyIds: [...new Set(Object.values(treatment.familyRoles)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
		representatives,
		sourceConnected: representatives.every(({ sourceConnected }) => sourceConnected),
	}
}

function ordinaryLineage(
	treatment: CompletePaletteTreatment,
	hypothesis: FieldHypothesis,
	lineage: RecallAuditTreatmentLineage,
): AlbumArtworkPaletteV2Phase3PathBoundOrdinaryLineage {
	const key = completeTreatmentKey(treatment)
	const descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor = {
		treatment,
		fieldHypothesis: hypothesis,
		lineage,
	}
	const evaluation = evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(key, descriptor)
	const domain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([{
		key,
		treatment,
		descriptors: [descriptor],
	}])
	return {
		descriptor,
		evaluation,
		candidateEligibility: domain.diagnostics.candidates[0],
	}
}

function compareSharedRoleBindings(first: SharedRoleBindingWork, second: SharedRoleBindingWork): number {
	return compareDescending(first.minimumQualityUtilityLevel, second.minimumQualityUtilityLevel) ||
		compareDescending(first.minimumQualityUtility, second.minimumQualityUtility) ||
		compareDescending(first.minimumIdentityCoverage, second.minimumIdentityCoverage) ||
		compareAscii(first.key, second.key) ||
		compareAscii(completeTreatmentKey(first.flat), completeTreatmentKey(second.flat)) ||
		compareAscii(completeTreatmentKey(first.gradient), completeTreatmentKey(second.gradient))
}

function pathLineage(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	stageCustodies: readonly StageCustody[],
	render: AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
	sourcePixelCount: number,
): AlbumArtworkPaletteV2Phase3PathBoundRenderLineage {
	const pathPopulation = stageCustodies.reduce((sum, { component }) => sum + component.population, 0)
	return {
		bundleId: bundle.id,
		fieldDomainId: bundle.path.fieldDomainId,
		topology: bundle.path.topology,
		direction: bundle.path.direction,
		stages: stageCustodies.map(({ stage, component }) => ({
			stageIndex: stage.stageIndex,
			familyId: stage.familyId,
			regionId: stage.regionId,
			componentStartPixelIndex: component.startPixelIndex,
			spatialPosition: stage.spatialPosition,
			colorPosition: stage.colorPosition,
			population: component.population,
			populationFraction: component.population / pathPopulation,
			imagePopulationFraction: component.population / sourcePixelCount,
			quadrantCoverage: component.quadrantCoverage,
			exactColor: stage.exactColor,
		})),
		endpoints: render.endpoints,
		midpoint: render.midpoint,
	}
}

function numericsCustody(
	render: AlbumArtworkPaletteV2Phase3FieldRenderCandidate,
): AlbumArtworkPaletteV2Phase3PathBoundCompleteNumericsCustody {
	if (render.kind === "flat") {
		return {
			completeTreatmentSource: "independently-generated-flat-endpoint-treatment",
			contrastAndQualityIndependentlyGeneratedForThisRender: true,
			threeStopAPCARecomputed: false,
			renderFidelitySeparatelyScored: true,
		}
	}
	if (render.kind === "supported-two-stop") {
		return {
			completeTreatmentSource: "independently-generated-endpoint-gradient-treatment",
			contrastAndQualityIndependentlyGeneratedForThisRender: true,
			threeStopAPCARecomputed: false,
			renderFidelitySeparatelyScored: true,
		}
	}
	return {
		completeTreatmentSource: "reused-endpoint-gradient-treatment-for-three-stop-render",
		contrastAndQualityIndependentlyGeneratedForThisRender: false,
		threeStopAPCARecomputed: false,
		renderFidelitySeparatelyScored: true,
	}
}

function rejectedBundle(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	reasons: readonly string[],
	overrides: Partial<AlbumArtworkPaletteV2Phase3PathBoundBundleDiagnostic> = {},
): BundleWork {
	return {
		diagnostic: {
			bundleId: bundle.id,
			eligible: false,
			status: "rejected",
			rejectionReasons: [...new Set(reasons)],
			endpointCustody: null,
			gradientHypothesis: null,
			flatHypothesis: null,
			generatedGradientTreatmentCount: 0,
			generatedFlatTreatmentCount: 0,
			validGradientTreatmentCount: 0,
			validFlatTreatmentCount: 0,
			sharedRoleBindings: [],
			sharedRoleBindingCount: 0,
			completeCrossProductCount: 0,
			selectedRoleBindingKey: null,
			selectedRoleCustody: [],
			preselectionRenderIds: bundle.candidates.map(({ id }) => id).sort(compareAscii),
			completeRenderKeys: [],
			...overrides,
		},
		candidates: [],
	}
}

function materializeBundle(
	bundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle,
	input: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput,
	components: ReturnType<typeof createSourceComponentIndex>,
	qualityFloor: number,
): BundleWork {
	if (!pathAdmissible(bundle)) return rejectedBundle(bundle, ["render-bundle-is-not-path-admissible"])
	if (!pathSpatialCenterMatchesDiscoveryGeometry(bundle.path)) {
		return rejectedBundle(bundle, ["path-spatial-center-topology-direction-custody-is-invalid"])
	}
	if (bundle.endpoints === null || bundle.path.stages.length < 2 || bundle.candidates.length === 0) {
		return rejectedBundle(bundle, ["render-bundle-lacks-endpoint-or-render-custody"])
	}
	const firstStage = bundle.path.stages[0]
	const lastStage = bundle.path.stages.at(-1)!
	if (!stopMatchesStage(bundle.endpoints[0], firstStage) ||
		!stopMatchesStage(bundle.endpoints[1], lastStage)) {
		return rejectedBundle(bundle, ["render-endpoints-do-not-exactly-bind-first-and-last-path-stages"])
	}
	if (new Set(bundle.candidates.map(({ id }) => id)).size !== bundle.candidates.length ||
		bundle.candidates.some((candidate) => !renderCandidateStructureValid(candidate, bundle))) {
		return rejectedBundle(bundle, ["render-candidate-structure-or-identity-is-invalid"])
	}
	const stageCustodies = bundle.path.stages.map((stage) =>
		stageSourceCustody(stage, input.sourceEvidence, components))
	if (stageCustodies.some((custody) => custody === null)) {
		return rejectedBundle(bundle, ["path-stage-pixel-rgb-family-component-or-region-custody-mismatch"])
	}
	const exactStageCustodies = stageCustodies as StageCustody[]
	if (!sourceStageMetricsCoherent(bundle.path, exactStageCustodies, input.sourceEvidence)) {
		return rejectedBundle(bundle, ["path-stage-source-population-or-coverage-metrics-mismatch"])
	}
	let coreBundle: AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle
	try {
		coreBundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
			bundle.path,
			bundle.endpoints.map(({ familyId, regionId, exactColor }) => ({
				familyId,
				regionId,
				exactColor,
			})) as unknown as AlbumArtworkPaletteV2Phase3FieldRenderOrderedEndpointCustody,
			input.sourceEvidence.familyBinStep,
		)
	} catch {
		return rejectedBundle(bundle, ["core-render-bundle-reevaluation-failed"])
	}
	if (!coreRenderBundleMatches(bundle, coreBundle)) {
		return rejectedBundle(bundle, ["render-fidelity-support-or-core-identity-mismatch"])
	}
	if (!hypothesisMatchesPathOrientation(bundle.path)) {
		return rejectedBundle(bundle, ["path-gradient-hypothesis-orientation-binding-is-invalid"])
	}
	const endpoints = bindEndpoints(bundle, exactStageCustodies, input.treatmentEvidence)
	if (endpoints === null) {
		return rejectedBundle(bundle, ["path-endpoint-treatment-family-component-custody-mismatch"])
	}
	const [gradientHypothesis, flatHypothesis] = clonedHypotheses(bundle, endpoints)

	let gradientDescriptors: ReturnType<
		typeof constructAlbumArtworkPaletteV2Phase3SupplementalTreatments
	>["treatments"] = []
	let generatedFlatTreatments: readonly CompletePaletteTreatment[] = []
	try {
		gradientDescriptors = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
			input.treatmentEvidence,
			[gradientHypothesis],
		).treatments
	} catch {
		return rejectedBundle(bundle, ["source-supported-gradient-complete-treatment-construction-failed"], {
			endpointCustody: endpoints.map(({ publicCustody }) => publicCustody) as unknown as readonly [
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
			],
			gradientHypothesis,
			flatHypothesis,
		})
	}
	try {
		generatedFlatTreatments = generateCompletePaletteTreatments(
			input.treatmentEvidence,
			[flatHypothesis],
		).completeTreatments
	} catch {
		return rejectedBundle(bundle, ["distinct-endpoint-flat-complete-treatment-construction-failed"], {
			endpointCustody: endpoints.map(({ publicCustody }) => publicCustody) as unknown as readonly [
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
			],
			gradientHypothesis,
			flatHypothesis,
			generatedGradientTreatmentCount: gradientDescriptors.length,
		})
	}
	const validGradientDescriptors = gradientDescriptors.filter(({ treatment, fieldHypothesis }) =>
		fieldHypothesis.id === gradientHypothesis.id &&
		validCompleteTreatment(
			treatment,
			"gradient",
			gradientHypothesis,
			endpoints,
			input.treatmentEvidence,
			input.sourceEvidence,
			components,
		))
	const validFlatTreatments = generatedFlatTreatments.filter((treatment) =>
		validCompleteTreatment(
			treatment,
			"flat",
			flatHypothesis,
			endpoints,
			input.treatmentEvidence,
			input.sourceEvidence,
			components,
		))
	const gradientByKey = new Map(validGradientDescriptors.map((descriptor) =>
		[completeTreatmentKey(descriptor.treatment), descriptor]))
	const flatByKey = new Map(validFlatTreatments.map((treatment) => [completeTreatmentKey(treatment), treatment]))
	const baseTreatments = [
		...flatByKey.values(),
		...[...gradientByKey.values()].map(({ treatment }) => treatment),
	].sort((first, second) => compareAscii(completeTreatmentKey(first), completeTreatmentKey(second)))
	if (baseTreatments.length === 0) {
		return rejectedBundle(bundle, ["no-source-supported-endpoint-bound-complete-treatment"], {
			endpointCustody: endpoints.map(({ publicCustody }) => publicCustody) as unknown as readonly [
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
			],
			gradientHypothesis,
			flatHypothesis,
			generatedGradientTreatmentCount: gradientDescriptors.length,
			generatedFlatTreatmentCount: generatedFlatTreatments.length,
			validGradientTreatmentCount: gradientByKey.size,
			validFlatTreatmentCount: flatByKey.size,
		})
	}
	const recovery = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		baseTreatments,
		{ obligations: input.identityObligations },
	)
	const evaluationByKey = new Map(recovery.evaluations.map((evaluation) => [evaluation.key, evaluation]))
	const flatByBinding = new Map<string, CompletePaletteTreatment>()
	const gradientByBinding = new Map<string, typeof validGradientDescriptors[number]>()
	for (const treatment of flatByKey.values()) flatByBinding.set(roleBindingKey(treatment), treatment)
	for (const descriptor of gradientByKey.values()) {
		gradientByBinding.set(roleBindingKey(descriptor.treatment), descriptor)
	}
	const shared: SharedRoleBindingWork[] = []
	for (const [key, flat] of flatByBinding) {
		const gradientDescriptor = gradientByBinding.get(key)
		if (!gradientDescriptor) continue
		const gradient = gradientDescriptor.treatment
		const flatEvaluation = evaluationByKey.get(completeTreatmentKey(flat))
		const gradientEvaluation = evaluationByKey.get(completeTreatmentKey(gradient))
		if (!flatEvaluation || !gradientEvaluation || !sameRoleColorIdentity(
			flat.familyRoles.foreground,
			flat.foreground,
			gradient.familyRoles.foreground,
			gradient.foreground,
		) || !sameRoleColorIdentity(
			flat.familyRoles.accent,
			flat.accent,
			gradient.familyRoles.accent,
			gradient.accent,
		) ||
			flat.collapse.surface !== gradient.collapse.surface ||
			flat.collapse.accent !== gradient.collapse.accent) continue
		const flatLineage = ordinaryLineage(flat, flatHypothesis, treatmentLineage(flat))
		const gradientLineage = ordinaryLineage(
			gradient,
			gradientHypothesis,
			gradientDescriptor.lineage,
		)
		if (!flatLineage.evaluation.ordinaryEligible ||
			!flatLineage.candidateEligibility.eligible ||
			flatLineage.candidateEligibility.basis !== "ordinary-complete-source-lineage" ||
			!gradientLineage.evaluation.ordinaryEligible ||
			!gradientLineage.candidateEligibility.eligible ||
			gradientLineage.candidateEligibility.basis !== "ordinary-complete-source-lineage") continue
		const flatRoleCustody = treatmentRoleCustody(
			flat,
			endpoints,
			input.sourceEvidence,
			components,
		)
		const gradientRoleCustody = treatmentRoleCustody(
			gradient,
			endpoints,
			input.sourceEvidence,
			components,
		)
		if (flatRoleCustody === null || gradientRoleCustody === null ||
			JSON.stringify(flatRoleCustody) !== JSON.stringify(gradientRoleCustody)) continue
		const minimumQualityUtility = Math.min(
			flatEvaluation.qualityUtility,
			gradientEvaluation.qualityUtility,
		)
		shared.push({
			key,
			flat,
			gradient,
			flatEvaluation,
			gradientEvaluation,
			flatLineage,
			gradientLineage,
			roleCustody: flatRoleCustody,
			minimumQualityUtilityLevel: Math.min(
				utilityLevel(flatEvaluation.qualityUtility),
				utilityLevel(gradientEvaluation.qualityUtility),
			),
			minimumQualityUtility,
			minimumIdentityCoverage: Math.min(
				flatEvaluation.identityCoverage,
				gradientEvaluation.identityCoverage,
			),
		})
	}
	shared.sort(compareSharedRoleBindings)
	const sharedDiagnostics = shared.map((binding):
		AlbumArtworkPaletteV2Phase3PathBoundSharedRoleBindingDiagnostic => ({
		key: binding.key,
		flatTreatmentKey: completeTreatmentKey(binding.flat),
		gradientTreatmentKey: completeTreatmentKey(binding.gradient),
		foregroundFamilyId: binding.flat.familyRoles.foreground,
		foregroundHex: binding.flat.foreground.hex,
		accentFamilyId: binding.flat.familyRoles.accent,
		accentHex: binding.flat.accent.hex,
		surfaceCollapsed: false,
		accentCollapsed: binding.flat.collapse.accent,
		minimumQualityUtilityLevel: binding.minimumQualityUtilityLevel,
		minimumQualityUtility: binding.minimumQualityUtility,
		minimumIdentityCoverage: binding.minimumIdentityCoverage,
		flatOrdinaryLineageEligible: binding.flatLineage.evaluation.ordinaryEligible,
		gradientOrdinaryLineageEligible: binding.gradientLineage.evaluation.ordinaryEligible,
		selected: false,
	}))
	if (shared.length === 0) {
		return rejectedBundle(bundle, ["no-ordinary-lineage-shared-flat-gradient-role-binding"], {
			endpointCustody: endpoints.map(({ publicCustody }) => publicCustody) as unknown as readonly [
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
			],
			gradientHypothesis,
			flatHypothesis,
			generatedGradientTreatmentCount: gradientDescriptors.length,
			generatedFlatTreatmentCount: generatedFlatTreatments.length,
			validGradientTreatmentCount: gradientByKey.size,
			validFlatTreatmentCount: flatByKey.size,
			sharedRoleBindings: sharedDiagnostics,
			sharedRoleBindingCount: 0,
		})
	}
	const completeCrossProductCount = shared.length * bundle.candidates.length
	if (completeCrossProductCount >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
			.maximumCompleteRenderCandidates) {
		throw new RangeError(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR)
	}
	const completeCandidates = shared.flatMap((binding) => bundle.candidates.map((render):
		AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate => {
		const flat = render.kind === "flat"
		const treatment = flat ? binding.flat : binding.gradient
		const recoveryEvaluation = flat
			? binding.flatEvaluation
			: binding.gradientEvaluation
		const ordinaryCompleteLineage = flat
			? binding.flatLineage
			: binding.gradientLineage
		const publicTreatmentKey = completeTreatmentKey(treatment)
		const renderKey = `${publicTreatmentKey}\0${render.id}`
		const qualityLossFromBaseline = Math.max(0,
			input.baselineUnrestrictedWinnerEvaluation.qualityUtility - recoveryEvaluation.qualityUtility)
		const withinQualityBound = recoveryEvaluation.qualityUtility +
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
				.qualityBoundaryTolerance >= qualityFloor
		return {
			renderKey,
			publicTreatmentKey,
			bundleId: bundle.id,
			treatment,
			render,
			recoveryEvaluation,
			support: bundle.support,
			roleBindingKey: binding.key,
			roleCustody: binding.roleCustody,
			ordinaryCompleteLineage,
			pathLineage: pathLineage(
				bundle,
				exactStageCustodies,
				render,
				input.sourceEvidence.pixelCount,
			),
			numericsCustody: numericsCustody(render),
			qualityLossFromBaseline,
			qualityFloor,
			withinQualityBound,
			withinMaterializationBounds: true,
			eligible: withinQualityBound,
		}
	}))
	return {
		diagnostic: {
			bundleId: bundle.id,
			eligible: true,
			status: "materialized",
			rejectionReasons: [],
			endpointCustody: endpoints.map(({ publicCustody }) => publicCustody) as unknown as readonly [
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
				AlbumArtworkPaletteV2Phase3PathBoundEndpointCustody,
			],
			gradientHypothesis,
			flatHypothesis,
			generatedGradientTreatmentCount: gradientDescriptors.length,
			generatedFlatTreatmentCount: generatedFlatTreatments.length,
			validGradientTreatmentCount: gradientByKey.size,
			validFlatTreatmentCount: flatByKey.size,
			sharedRoleBindings: sharedDiagnostics,
			sharedRoleBindingCount: shared.length,
			completeCrossProductCount,
			selectedRoleBindingKey: null,
			selectedRoleCustody: [],
			preselectionRenderIds: bundle.candidates.map(({ id }) => id).sort(compareAscii),
			completeRenderKeys: completeCandidates.map(({ renderKey }) => renderKey).sort(compareAscii),
		},
		candidates: completeCandidates,
	}
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

export function compareCompleteRenderCandidates(
	first: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate,
	second: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate,
): number {
	return compareDescending(Number(first.eligible && first.withinMaterializationBounds),
		Number(second.eligible && second.withinMaterializationBounds)) ||
		compareDescending(utilityLevel(first.recoveryEvaluation.relationUtility),
			utilityLevel(second.recoveryEvaluation.relationUtility)) ||
		compareDescending(utilityLevel(first.recoveryEvaluation.qualityUtility),
			utilityLevel(second.recoveryEvaluation.qualityUtility)) ||
		compareDescending(first.render.fidelity.level, second.render.fidelity.level) ||
		compareDescending(first.render.fidelity.value, second.render.fidelity.value) ||
		comparePathSupport(first.support, second.support) ||
		first.render.stopCount - second.render.stopCount ||
		compareAscii(first.renderKey, second.renderKey)
}

function validateBounds(
	bundles: readonly AlbumArtworkPaletteV2Phase3FieldRenderCandidateBundle[],
): number {
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
	if (bundles.length > policy.maximumBundles || bundles.some(({ candidates }) =>
		candidates.length > policy.maximumRenderCandidatesPerBundle)) {
		throw new RangeError(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR)
	}
	const renderCandidateCount = bundles.reduce((sum, { candidates }) => sum + candidates.length, 0)
	if (renderCandidateCount > policy.maximumCompleteRenderCandidates) {
		throw new RangeError(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR)
	}
	return renderCandidateCount
}

export function materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates(
	input: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterializationInput,
): AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization {
	if (!validEvidenceShape(input.sourceEvidence) || !validEvidenceShape(input.treatmentEvidence)) {
		throw new TypeError("Path-bound render materialization requires structurally valid native evidence")
	}
	const baseline = input.baselineUnrestrictedWinnerEvaluation
	if (!validBaselineEvaluation(baseline)) {
		throw new TypeError("Path-bound render materialization requires a complete fixed baseline recovery evaluation")
	}
	const inputRenderCandidateCount = validateBounds(input.renderBundles)
	const qualityFloor = baseline.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumQualityLoss
	const components = createSourceComponentIndex(input.sourceEvidence)
	const bundles = [...input.renderBundles].sort((first, second) => compareAscii(first.id, second.id))
	const duplicateBundleIds = new Set(bundles.filter((bundle, index) =>
		index > 0 && bundle.id === bundles[index - 1].id).map(({ id }) => id))
	const work: BundleWork[] = []
	let completeCrossProductCount = 0
	for (const bundle of bundles) {
		const bundleWork = duplicateBundleIds.has(bundle.id)
			? rejectedBundle(bundle, ["duplicate-render-bundle-identity"])
			: materializeBundle(bundle, input, components, qualityFloor)
		completeCrossProductCount += bundleWork.candidates.length
		if (completeCrossProductCount >
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
				.maximumCompleteRenderCandidates) {
			throw new RangeError(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_BOUNDS_ERROR)
		}
		work.push(bundleWork)
	}
	const candidates = work.flatMap(({ candidates: values }) => values)
	const ordered = [...candidates].sort(compareCompleteRenderCandidates)
	const eligibleCandidates = ordered.filter(({ eligible, withinMaterializationBounds }) =>
		eligible && withinMaterializationBounds)
	const selected = eligibleCandidates[0] ?? null
	const bundleDiagnostics = work.map(({ diagnostic }) => {
		const selectedBindingKey = selected?.bundleId === diagnostic.bundleId
			? selected.roleBindingKey
			: null
		return {
			...diagnostic,
			sharedRoleBindings: diagnostic.sharedRoleBindings.map((binding) => ({
				...binding,
				selected: selectedBindingKey === binding.key,
			})),
			selectedRoleBindingKey: selectedBindingKey,
			selectedRoleCustody: selectedBindingKey === null ? [] : selected!.roleCustody,
		}
	})
	return {
		selected,
		candidates: ordered,
		eligibleCandidates,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_ID,
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_FORMULAS,
			baselineUnrestrictedWinnerKey: baseline.key,
			baselineUnrestrictedWinnerQualityUtility: baseline.qualityUtility,
			baselineUnrestrictedWinnerRelationUtility: baseline.relationUtility,
			baselineUnrestrictedWinnerEvaluation: baseline,
			qualityFloor,
			inputBundleCount: bundles.length,
			inputRenderCandidateCount,
			materializedBundleCount: bundleDiagnostics.filter(({ status }) => status === "materialized").length,
			rejectedBundleCount: bundleDiagnostics.filter(({ status }) => status === "rejected").length,
			sharedRoleBindingCount: bundleDiagnostics.reduce((sum, diagnostic) =>
				sum + diagnostic.sharedRoleBindingCount, 0),
			completeCrossProductCount,
			completeRenderCandidateCount: ordered.length,
			qualityEligibleCompleteRenderCandidateCount: eligibleCandidates.length,
			selectedRenderKey: selected?.renderKey ?? null,
			selectedPublicTreatmentKey: selected?.publicTreatmentKey ?? null,
			selectedRenderId: selected?.render.id ?? null,
			publicTreatmentStateDerivedHere: false,
			bounds: {
				bundleCountWithinBound: bundles.length <=
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumBundles,
				renderCandidatesPerBundleWithinBound: bundles.every(({ candidates: values }) =>
					values.length <=
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
						.maximumRenderCandidatesPerBundle),
				completeRenderCandidateCountWithinBound: ordered.length <=
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
						.maximumCompleteRenderCandidates,
			},
			bundles: bundleDiagnostics,
		},
	}
}
