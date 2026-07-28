import {
	apcaContrast,
	chroma,
	labAt,
	mixOKLab,
	okDistance,
	oklabToRGB,
	rgbAt,
	rgbToHex,
	rgbToOKLab,
	toLabBuffer,
} from "./color.ts"
import { loadNativeImage } from "./native-resolution-image.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./album-artwork-palette-v2-protocol.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
} from "./album-artwork-palette-v2-0.7.4-protocol.ts"
import type { AlbumArtworkPaletteV2QualityBlock } from "./album-artwork-palette-v2-protocol.ts"
import type { OKLab, RGB, RawImage } from "./types.ts"

export type RepresentativeStrategy = "dense-exact" | "nearest-prototype" | "density-synthesized"
export type FieldTreatmentKind = "one-field" | "separate-flat-fields" | "gradient-field"
export type GradientTopology = "linear" | "radial-center" | "radial-upper-center"
export type Role = "background" | "surface" | "foreground" | "accent"

export { ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION }
export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL = ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID

export const ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS = Object.freeze([
	"control-0.7.2",
	"all-existing-representative-strategies",
	"all-retained-representative-cross-pairs",
	"widened-field-hypothesis-retention",
	"widened-family-lane-retention",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_FACTORIZED_PARETO_AUDIT_ARMS = Object.freeze([
	"factorized-pareto-3000",
	"factorized-pareto-6000",
] as const)

export type AlbumArtworkPaletteV2RecallAuditArm =
	typeof ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS[number]

export type AlbumArtworkPaletteV2FactorizedParetoAuditArm =
	typeof ALBUM_ARTWORK_PALETTE_V2_FACTORIZED_PARETO_AUDIT_ARMS[number]

export const ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES = Object.freeze([
	"discovered-family",
	"lane-retention",
	"field-hypothesis-proposal",
	"field-hypothesis-retention",
	"representative-pairing",
	"field-conditional-role-eligibility",
	"complete-treatment-construction",
	"ordinary-pareto-membership",
	"complete-domain-guard",
	"public-slate-retention",
] as const)

export type AlbumArtworkPaletteV2RecallCustodyStage =
	typeof ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES[number]

export type RegionRoleFactors = Readonly<{
	geometry: number
	fill: number
	repetition: number
	localContrast: number
	borderInterior: number
	sourceSupport: number
	score: number
}>

export type RegionObservation = Readonly<{
	widthFraction: number
	heightFraction: number
	boundsFraction: number
	elongation: number
	fill: number
	repetition: number
	localContrast: number
	boundaryLightnessContrast: number
	boundaryLightnessPolarity: number
	borderContact: number
	interiorMargin: number
	componentFamilyFraction: number
	foregroundTypography: RegionRoleFactors
	signatureAccent: RegionRoleFactors
}>

export type ForegroundPolarityObservation = Readonly<{
	polarity: number
	confidence: number
	componentIds: readonly string[]
}>

export type ComponentEvidence = Readonly<{
	id: string
	startPixelIndex: number
	population: number
	populationFraction: number
	minX: number
	minY: number
	maxX: number
	maxY: number
	borderPixels: number
	retainedFor: readonly ("connected-support" | "role-observation")[]
	observation: RegionObservation
}>

export type SourceSupportRecord = Readonly<{
	exactSource: boolean
	exemplar: Readonly<{ x: number; y: number }> | null
	anchorFamilyId: string
	regionIds: readonly string[]
	perceptualDensity: number
	totalSupport: number
	connectedSupport: number
	spatialCoverage: number
	concentration: number
	prototypeDistance: number
	outlierScore: number
	synthesis: Readonly<{
		operation: "dense-neighborhood-mean"
		occupiedDistance: number
	}> | null
}>

export type GeneratedSupportRecord = Readonly<{
	generated: true
	role: "background" | "foreground"
	reason: "degenerate-supported-domain" | "all-supported-pairs-effectively-contrastless"
	supportedPairCount: number
	maximumSupportedAbsoluteLc: number
	thresholdExclusive: number
	preferencePenalty: number
}>

export type ColorRepresentative = Readonly<{
	strategy: RepresentativeStrategy | "generated-emergency"
	rgb: RGB
	oklab: OKLab
	hex: string
	support: SourceSupportRecord | GeneratedSupportRecord
}>

export type ColorFamilyEvidence = Readonly<{
	id: string
	prototype: OKLab
	population: number
	populationFraction: number
	perceptualBinCount: number
	borderCoverage: number
	centerCoverage: number
	quadrantCoverage: number
	cornerCoverage: number
	centroid: readonly [x: number, y: number]
	spatialSpread: number
	largestComponentFraction: number
	familyConcentration: number
	componentCount: number
	repeatedComponentCount: number
	edgeDensity: number
	localContrast: number
	chroma: number
	fieldScore: number
	signatureScore: number
	foregroundScore: number
	foregroundTypographyObservation: number
	foregroundPolarityObservation: ForegroundPolarityObservation
	signatureAccentObservation: number
	observedComponentCount: number
	components: readonly ComponentEvidence[]
	representatives: readonly ColorRepresentative[]
}>

export type FieldRoleOwnershipProfile = Readonly<{
	frameCoverage: number
	peripheralCoverage: number
	connectedCoverage: number
	fieldScore: number
	populationCoverage: number
	evidenceLevels: readonly [number, number, number, number, number]
}>

export type FieldRoleAssignmentEvidence = Readonly<{
	backgroundFamilyId: string
	surfaceFamilyId: string
	backgroundProfile: FieldRoleOwnershipProfile
	surfaceProfile: FieldRoleOwnershipProfile
	decisiveCriterion: "frameCoverage" | "peripheralCoverage" | "connectedCoverage" | "fieldScore" | "populationCoverage" | "ascii-tie"
	confidence: number
}>

export type EvidenceLane = Readonly<{
	name: "field" | "signature" | "foreground"
	maximumFamilies: number
	familyIds: readonly string[]
}>

export type LaneRetentionTrace = Readonly<{
	name: EvidenceLane["name"]
	evaluatedFamilyCount: number
	candidates: ReadonlyArray<Readonly<{
		familyId: string
		familyScore: number
		regionScore: number
		combinedScore: number
		rank: number
		retained: boolean
	}>>
}>

export type FamilyAdjacencyEvidence = Readonly<{
	firstFamilyId: string
	secondFamilyId: string
	boundaryEdges: number
	meanContrast: number
}>

export type NativePaletteEvidence = Readonly<{
	width: number
	height: number
	pixelCount: number
	rgbData: Uint8Array
	labs: Float32Array
	familyAt: Uint16Array
	families: readonly ColorFamilyEvidence[]
	adjacencies: readonly FamilyAdjacencyEvidence[]
	retainedFamilyIds: readonly string[]
	lanes: readonly EvidenceLane[]
	laneRetention: readonly LaneRetentionTrace[]
}>

export type BackgroundFieldDomainEvidence = Readonly<{
	id: string
	kind: "connected" | "paired-corridor"
	sourceDomainIds: readonly string[]
	startPixelIndex: number
	population: number
	populationFraction: number
	borderPixels: number
	borderCoverage: number
	quadrantCoverage: number
	ownedCornerCount: number
	weightedFieldScore: number
	centroid: readonly [x: number, y: number]
	meanColor: OKLab
	transitionFamilyCount: number
	transitionPopulationFraction: number
	transitionQuadrantCoverage: number
	familyIds: readonly string[]
	componentIds: readonly string[]
	eligible: boolean
	rejectionReasons: readonly string[]
}>

export type GradientFieldEvidence = Readonly<{
	topology: GradientTopology
	direction: "horizontal" | "vertical" | "diagonal-down" | "diagonal-up" | "center-out"
	endpointBands: readonly [number, number]
	progression: number
	modeProgression: number
	monotonicity: number
	residual: number
	span: number
	texture: number
	bandDispersion: number
	edgeContinuity: number
	coverage: number
	supportingFamilyIds: readonly [string, string]
	supportingEndpointHexes: readonly [string, string]
	backgroundTopologyEndpoint: "low" | "high"
	roleAssignment: FieldRoleAssignmentEvidence
	fieldDomainId: string
	fieldDomainPopulationFraction: number
	fieldDomainBorderCoverage: number
	fieldDomainOwnedCornerCount: number
	supportingComponentIds: readonly string[]
}>

export type GradientFitDiagnostic = Readonly<{
	topology: GradientTopology
	direction: GradientFieldEvidence["direction"]
	span: number
	progression: number
	modeProgression: number
	monotonicity: number
	residual: number
	texture: number
	bandDispersion: number
	edgeContinuity: number
	score: number
	lowEndpointFamilyId: string | null
	highEndpointFamilyId: string | null
	endpointHexes: readonly [string, string] | null
	fieldDomainId: string
	fieldDomainPopulationFraction: number
	rejectionReasons: readonly string[]
}>

export type FieldHypothesis = Readonly<{
	id: string
	kind: FieldTreatmentKind
	backgroundFamilyId: string
	surfaceFamilyId: string | null
	backgroundRepresentatives: readonly ColorRepresentative[]
	surfaceRepresentatives: readonly ColorRepresentative[]
	fieldFidelity: number
	surfaceContribution: number
	spatialRelation: Readonly<{
		adjacency: number
		borderInterior: number
		separation: number
		coverage: number
		fieldOwnership: number
	}> | null
	roleAssignment: FieldRoleAssignmentEvidence | null
	gradientEvidence: GradientFieldEvidence | null
	pruningNotes: readonly string[]
}>

export type PairContrast = Readonly<{
	role: "foreground" | "accent"
	fieldRole: "background" | "surface" | "gradient-sample"
	position: number
	signedLc: number
	absoluteLc: number
}>

export type ContrastDiagnostics = Readonly<{
	pairs: readonly PairContrast[]
	minimumAbsoluteLc: number
	meanAbsoluteLc: number
}>

export type PaletteRoleColor = Readonly<{
	rgb: RGB
	oklab: OKLab
	hex: string
	generated: boolean
	strategy: ColorRepresentative["strategy"]
	support: ColorRepresentative["support"]
}>

export type CompletePaletteScores = Readonly<{
	fieldFidelity: number
	surfaceFidelity: number
	fieldStructure: number
	fieldIdentity: number
	treatmentFoundation: number
	activeRolePathObservability: number
	artworkIdentity: number
	representativeness: number
	uiUtility: number
	foregroundUtility: number
	foregroundPolarityAgreement: number
	accentFidelity: number
	accentUtility: number
	coherence: number
	economy: number
	generatorConfidence: number
	foundation: number
	balance: number
	generatedPenalty: number
	rankingScore: number
}>

export type CompletePaletteTreatment = Readonly<{
	id: string
	background: PaletteRoleColor
	surface: PaletteRoleColor
	foreground: PaletteRoleColor
	accent: PaletteRoleColor
	gradient: boolean
	fieldTreatment: FieldTreatmentKind
	sourceFieldHypothesisId: string
	familyRoles: Readonly<{
		background: string | "generated"
		surface: string | "generated"
		foreground: string | "generated"
		accent: string | "generated"
	}>
	cardinality: 2 | 3 | 4
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	contrast: ContrastDiagnostics
	scores: CompletePaletteScores
	gradientEvidence: GradientFieldEvidence | null
}>

export type EmergencyEligibility = Readonly<{
	eligible: boolean
	reason: "not-eligible" | "degenerate-supported-domain" | "all-supported-pairs-effectively-contrastless"
	supportedPairCount: number
	maximumSupportedAbsoluteLc: number
	thresholdExclusive: number
}>

export type CandidateAvailabilityTrace = Readonly<{
	foregroundLaneFamilyIds: readonly string[]
	signatureLaneFamilyIds: readonly string[]
	fieldHypothesisFamilyIds: readonly string[]
	foregroundsPerFieldVariantQuota: number
	emergencyCandidateReserve: number
	foregroundPeakUnobservableRejectedOptionCount: number
	distinctAccentPeakUnobservableRejectedOptionCount: number
	completeCandidateForegroundFamilyIds: readonly string[]
	completeCandidateAccentFamilyIds: readonly string[]
	slateForegroundFamilyIds: readonly string[]
	slateAccentFamilyIds: readonly string[]
}>

export type IdentityObligationStage =
	"source-signature" | "role-availability" | "complete-treatment" |
	"retention-frontier" | "retained-slate" | "winner-explanation"

export type IdentityObligation = Readonly<{
	id: string
	familyId: string
	priority: number
	source: Readonly<{
		regionIds: readonly string[]
		connectedPopulationFraction: number
		materialDistanceFromField: number
		signatureRoleScore: number
		signatureEvidenceLevel: number
		regionEvidenceLevel: number
	}>
}>

export type IdentityObligationNode = Readonly<{
	id: string
	obligationId: string
	familyId: string
	stage: IdentityObligationStage
	status: "satisfied" | "blocked" | "deferred"
	availableRoles: readonly ("foreground" | "accent")[]
	treatmentCount: number
	treatmentIds: readonly string[]
	reason: string
}>

export type IdentityQualityGuardBlock = AlbumArtworkPaletteV2QualityBlock

export type IdentityQualityGuardResolvedLoss = Readonly<{
	block: IdentityQualityGuardBlock
	incumbentEvidenceLevel: number
	challengerEvidenceLevel: number
	evidenceLevelLoss: number
}>

export type IdentityQualityGuardEvaluation = Readonly<{
	incumbentTreatmentId: string
	challengerTreatmentId: string
	pass: boolean
	blocks: ReadonlyArray<Readonly<{
		block: IdentityQualityGuardBlock
		incumbentEvidenceLevel: number
		challengerEvidenceLevel: number
		pass: boolean
	}>>
	resolvedLosses: readonly IdentityQualityGuardResolvedLoss[]
}>

export type IdentityObligationDeferral = Readonly<{
	obligationId: string
	reason: "all-complete-treatment-carriers-failed-quality-guard" |
		"quality-eligible-carrier-deferred-by-higher-obligation-coverage-or-priority"
	completeCarrierCount: number
	qualityEligibleCarrierCount: number
	bestCarrierTreatmentId: string
	failedQualityGuardBlocks: readonly IdentityQualityGuardBlock[]
}>

export type IdentityWinnerSelectionReason =
	"no-feasible-identity-obligation" |
	"quality-incumbent-already-identity-optimal" |
	"all-identity-challengers-failed-quality-guard" |
	"quality-guarded-identity-challenger-selected"

export type IdentityObligationGraph = Readonly<{
	version: "identity-obligation-graph-v3"
	selection: Readonly<{
		maximumObligations: number
		evaluatedSignatureFamilyIds: readonly string[]
		fieldOwnedFamilyIds: readonly string[]
		notSourceConnectedFamilyIds: readonly string[]
		notMateriallyDistinctFamilyIds: readonly string[]
		redundantDirectionFamilyIds: readonly string[]
		boundOmittedFamilyIds: readonly string[]
	}>
	obligations: readonly IdentityObligation[]
	nodes: readonly IdentityObligationNode[]
	edges: ReadonlyArray<Readonly<{
		from: string
		to: string
		carried: boolean
	}>>
	winnerExplanation: Readonly<{
		treatmentId: string
		primaryTreatmentId: string
		qualityIncumbentTreatmentId: string
		selectedIdentityChallengerTreatmentId: string | null
		selectionReason: IdentityWinnerSelectionReason
		feasibleObligationIds: readonly string[]
		coveredObligationIds: readonly string[]
		deferredObligationIds: readonly string[]
		qualityDeferredObligationIds: readonly string[]
		priorityDeferredObligationIds: readonly string[]
		obligationDeferrals: readonly IdentityObligationDeferral[]
		maximumCompleteTreatmentCoverage: number
		eligibleIdentityChallengerCount: number
	}>
}>

export type ExactOverlayGradientChallengerTrace = Readonly<{
	triggerEligible: boolean
	reason: "primary-winner-gradient" | "accent-collapsed" | "no-accepted-gradient-variant" |
		"no-legal-exact-overlay-gradient" | "foundation-gap" | "quality-guard" | "challenger-selected"
	acceptedGradientVariantCount: number
	existingExactOverlayGradientCount: number
	projectedAttemptCount: number
	projectedLegalCount: number
	projectedUniqueCount: number
	selectedChallengerId: string | null
	selectedSource: "existing-complete" | "supplemental-projection" | null
	primaryFoundationEvidenceLevel: number
	challengerFoundationEvidenceLevel: number | null
	replacedPrimaryWinner: boolean
	qualityGuardRequired: boolean
	qualityGuardRejectedCandidateCount: number
	selectedChallengerPassesQualityGuard: boolean | null
	qualityGuardEvaluations: readonly IdentityQualityGuardEvaluation[]
}>

export type ParetoRankingTrace = Readonly<{
	version: "pareto-identity-winner-diagnostics-v3"
	qualityGuardVersion: "complete-quality-domain-non-inferiority-v1"
	evidenceResolution: number
	dominanceUsesEvidenceLevels: true
	paretoBlocks: readonly IdentityQualityGuardBlock[]
	rankingPriorityBlocks: readonly IdentityQualityGuardBlock[]
	rawCandidateCount: number
	uniqueCandidateCount: number
	dominatedCandidateCount: number
	frontierCandidateCount: number
	globalParetoFrontierTreatmentIds: readonly string[]
	frontierDirectionCount: number
	identityRetentionFrontierCandidateCount: number
	identityCarriedCandidateCount: number
	identityCoverageRequiresQualityNonInferiority: true
	qualityGuardBlocks: readonly IdentityQualityGuardBlock[]
	globalParetoTopTreatmentId: string
	qualityIncumbentTreatmentId: string
	identityChallengerCount: number
	eligibleIdentityChallengerCount: number
	selectedIdentityChallengerTreatmentId: string | null
	selectedIdentityChallengerQualityGuard: IdentityQualityGuardEvaluation | null
	identityChallengerQualityGuards: readonly IdentityQualityGuardEvaluation[]
	retainedCount: number
	selectedTreatmentId: string
	primaryTreatmentId: string
	legacyScalarTopTreatmentId: string
	differsFromLegacyScalar: boolean
	omittedFrontierDirectionKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2Result = Readonly<{
	version: string
	protocol: string
	width: number
	height: number
	winner: CompletePaletteTreatment
	alternatives: readonly CompletePaletteTreatment[]
	diagnostics: Readonly<{
		nativeDiscovery: true
		preDiscoveryResize: false
		familyCount: number
		retainedFamilyCount: number
		lanes: readonly EvidenceLane[]
		laneRetention: readonly LaneRetentionTrace[]
		families: readonly ColorFamilyEvidence[]
		fieldDomains: readonly BackgroundFieldDomainEvidence[]
		fieldHypotheses: readonly FieldHypothesis[]
		gradientFits: readonly GradientFitDiagnostic[]
		completeCandidateCount: number
		candidateAvailability: CandidateAvailabilityTrace
		identityObligationGraph: IdentityObligationGraph
		exactOverlayGradientChallenger: ExactOverlayGradientChallengerTrace
		paretoRanking: ParetoRankingTrace
		legacyScalarTopTreatment: CompletePaletteTreatment
		emergency: EmergencyEligibility
		bounds: typeof ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds
	}>
}>

export type RecallAuditFamilyRegistryEntry = Readonly<{
	familyId: string
	sourceConnected: boolean
	representativeStrategies: readonly ColorRepresentative["strategy"][]
	laneRanks: Readonly<Record<EvidenceLane["name"], number>>
	controlRetainedLanes: readonly EvidenceLane["name"][]
	identityObligation: boolean
}>

export type RecallAuditFieldHypothesisRegistryEntry = Readonly<{
	hypothesisId: string
	kind: FieldTreatmentKind
	familyIds: readonly string[]
	sourceConnected: boolean
	controlProposed: boolean
	controlRetained: boolean
}>

export type RecallAuditFieldDirectionRegistryEntry = Readonly<{
	key: string
	hypothesisIds: readonly string[]
	familyIds: readonly string[]
	sourceConnected: boolean
}>

export type RecallAuditRoleDirectionRegistryEntry = Readonly<{
	key: string
	role: "foreground" | "accent"
	familyId: string
	sourceConnected: boolean
	identityObligation: boolean
}>

export type AlbumArtworkPaletteV2RecallRegistry = Readonly<{
	version: "album-artwork-palette-v2-recall-registry-0.7.3"
	families: readonly RecallAuditFamilyRegistryEntry[]
	fieldHypotheses: readonly RecallAuditFieldHypothesisRegistryEntry[]
	fieldDirections: readonly RecallAuditFieldDirectionRegistryEntry[]
	roleDirections: readonly RecallAuditRoleDirectionRegistryEntry[]
	identityObligationFamilyIds: readonly string[]
}>

export type RecallAuditAvailabilityCell = Readonly<{
	key: string
	fieldDirectionKey: string
	roleDirectionKey: string
	role: "foreground" | "accent"
	familyId: string
	identityObligation: boolean
	controlTreatmentKeys: readonly string[]
	armTreatmentKeys: readonly string[]
	controlAvailable: boolean
	armAvailable: boolean
	newlyAvailable: boolean
}>

export type RecallAuditAvailabilityMatrix = Readonly<{
	fieldDirectionKeys: readonly string[]
	roleDirectionKeys: readonly string[]
	identityObligationRoleDirectionKeys: readonly string[]
	cells: readonly RecallAuditAvailabilityCell[]
}>

export type RecallAuditCustodyStageDiagnostic = Readonly<{
	stage: AlbumArtworkPaletteV2RecallCustodyStage
	status: "available" | "unavailable" | "bypassed"
	reason: string
	treatmentKeys: readonly string[]
}>

export type RecallAuditCustodyDiagnostic = Readonly<{
	cellKey: string
	fieldDirectionKey: string
	roleDirectionKey: string
	identityObligation: boolean
	stages: readonly RecallAuditCustodyStageDiagnostic[]
	firstLossStage: AlbumArtworkPaletteV2RecallCustodyStage | null
	firstLossReason: string | null
}>

export type RecallAuditQualificationInput = Readonly<{
	treatment: Pick<CompletePaletteTreatment, "background" | "surface" | "foreground" | "accent" | "gradient">
	controlTreatmentKeys: ReadonlySet<string> | readonly string[]
	sourceConnectedFullLineage: boolean
	legalUnderUnchangedRules: boolean
	ordinaryParetoMember: boolean
	completeDomainGuardPass: boolean
	fillsControlEmptyFieldRoleCell: boolean
}>

export type RecallAuditTreatmentQualification = Readonly<{
	treatmentKey: string
	absentFromControl: boolean
	sourceConnectedFullLineage: boolean
	legalUnderUnchangedRules: boolean
	ordinaryParetoMember: boolean
	completeDomainGuardPass: boolean
	fillsControlEmptyFieldRoleCell: boolean
	qualifies: boolean
	reasons: readonly string[]
}>

export type RecallAuditTreatmentLineage = Readonly<{
	fieldHypothesisId: string
	fieldDirectionKey: string
	roleDirectionKeys: readonly string[]
	familyIds: readonly string[]
	representatives: ReadonlyArray<Readonly<{
		role: Role
		familyId: string | "generated"
		hex: string
		strategy: ColorRepresentative["strategy"]
		sourceConnected: boolean
	}>>
	sourceConnected: boolean
}>

export type AlbumArtworkPaletteV2074Registry = Readonly<
	Omit<AlbumArtworkPaletteV2RecallRegistry, "version"> & {
		version: "album-artwork-palette-v2-recall-registry-0.7.4"
	}
>

export type AlbumArtworkPaletteV2074CoreAddition = Readonly<{
	treatment: CompletePaletteTreatment
	key: string
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2074CoreDomain = Readonly<{
	changedStages: readonly AlbumArtworkPaletteV2RecallCustodyStage[]
	rawCandidateCount: number
	materializedCandidateCount: number
	capacity: number
	remainingCapacity: number
	capacityReached: boolean
	fieldHypothesisIds: readonly string[]
	fieldVariantKeys: readonly string[]
	availableIdentityRoles: ReadonlyArray<Readonly<{
		familyId: string
		roles: readonly ("foreground" | "accent")[]
	}>>
	completeTreatments: readonly CompletePaletteTreatment[]
	completeTreatmentKeys: readonly string[]
	result: AlbumArtworkPaletteV2Result
}>

export type AlbumArtworkPaletteV2074CoreAudit = Readonly<{
	version: "album-artwork-palette-v2-0.7.4-core-audit-v1"
	mechanism: "widened-field-hypothesis-retention"
	changedStages: readonly ["field-hypothesis-retention"]
	construction: Readonly<{
		proposalScope: "all-existing-semantics-control-lanes"
		representatives: "preferred"
		fieldRepresentativePairing: "same-index"
		materialization: "additive-control-prefix"
	}>
	controlPrefixLength: number
	control: AlbumArtworkPaletteV2074CoreDomain
	candidate: AlbumArtworkPaletteV2074CoreDomain
	additions: readonly AlbumArtworkPaletteV2074CoreAddition[]
	registry: AlbumArtworkPaletteV2074Registry
}>

export type AlbumArtworkPaletteV2074Details = Readonly<{
	result: AlbumArtworkPaletteV2Result
	audit: AlbumArtworkPaletteV2074CoreAudit
}>

export type RecallAuditNewTreatment = Readonly<{
	treatment: CompletePaletteTreatment
	key: string
	lineage: RecallAuditTreatmentLineage
	qualification: RecallAuditTreatmentQualification
	qualityGuard: IdentityQualityGuardEvaluation
}>

export type RecallAuditDomain = Readonly<{
	arm: AlbumArtworkPaletteV2RecallAuditArm
	changedStages: readonly AlbumArtworkPaletteV2RecallCustodyStage[]
	rawCandidateCount: number
	materializedCandidateCount: number
	capacity: number
	capacityReached: boolean
	completeTreatments: readonly CompletePaletteTreatment[]
	completeTreatmentKeys: readonly string[]
	ordinaryParetoTreatmentKeys: readonly string[]
	publicSlate: readonly CompletePaletteTreatment[]
	qualityIncumbentTreatmentId: string
}>

export type AlbumArtworkPaletteV2RecallAudit = Readonly<{
	version: "album-artwork-palette-v2-recall-audit-0.7.3"
	arm: AlbumArtworkPaletteV2RecallAuditArm
	controlExtraction: AlbumArtworkPaletteV2Result
	control: RecallAuditDomain
	treatment: RecallAuditDomain
	newTreatments: readonly RecallAuditNewTreatment[]
	registry: AlbumArtworkPaletteV2RecallRegistry
	availability: RecallAuditAvailabilityMatrix
	custody: readonly RecallAuditCustodyDiagnostic[]
}>

export type FactorizedParetoLogicalCounts = Readonly<{
	checkpoint: 3_000 | 6_000
	enumerableTupleCount: number
	attemptedTupleCount: number
	legalTupleCount: number
	duplicateLegalKeyCount: number
	uniqueCanonicalKeyCountBeforePareto: number
	checkpointReached: boolean
	truncatedTupleCount: number
	ordinaryParetoKeyCount: number
	completeDomainGuardPassingKeyCount: number
	retainedUnionKeyCount: number
}>

export type FactorizedParetoUpstreamCertificate = Readonly<{
	changedStages: readonly ["complete-treatment-construction"]
	evidenceFamilyIds: readonly string[]
	laneFamilyIds: Readonly<Record<EvidenceLane["name"], readonly string[]>>
	fieldHypothesisIds: readonly string[]
	fieldVariantKeys: readonly string[]
	representativesPerRole: number
	fieldRepresentativePairing: "same-index"
}>

export type FactorizedParetoTruncationWitnesses = Readonly<{
	knownTreatmentKeys: readonly string[]
	knownCellKeys: readonly string[]
	otherwiseQualifyingTreatmentKeys: readonly string[]
	otherwiseQualifyingCellKeys: readonly string[]
}>

export type FactorizedParetoEscalationReason =
	"logical-domain-exhausted-before-checkpoint" |
	"no-post-checkpoint-tuples" |
	"post-checkpoint-qualification-not-evaluated" |
	"verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint"

export type FactorizedPareto6000TriggerCertificate = Readonly<{
	version: "album-artwork-palette-v2-factorized-pareto-6000-trigger-v1"
	sourceBinding: string
	fromArm: "factorized-pareto-3000"
	checkpoint: 3_000
	trigger6000: boolean
	exactCheckpointOnlyProof: boolean
	reason: FactorizedParetoEscalationReason
	witnesses: FactorizedParetoTruncationWitnesses
	verifiedTriggerToken: string | null
}>

export type FactorizedParetoAuditDomain = Readonly<{
	arm: AlbumArtworkPaletteV2FactorizedParetoAuditArm
	checkpoint: 3_000 | 6_000
	rawCandidateCount: number
	materializedCandidateCount: number
	capacity: number
	capacityReached: boolean
	completeTreatments: readonly CompletePaletteTreatment[]
	completeTreatmentKeys: readonly string[]
	publicSlate: readonly CompletePaletteTreatment[]
	qualityIncumbentTreatmentId: string
}>

export type AlbumArtworkPaletteV2FactorizedParetoAudit = Readonly<{
	version: "album-artwork-palette-v2-factorized-pareto-audit-0.7.3"
	arm: AlbumArtworkPaletteV2FactorizedParetoAuditArm
	controlExtraction: AlbumArtworkPaletteV2Result
	control: RecallAuditDomain
	treatment: FactorizedParetoAuditDomain
	registry: AlbumArtworkPaletteV2RecallRegistry
	upstream: FactorizedParetoUpstreamCertificate
	logical: FactorizedParetoLogicalCounts
	truncationWitnesses: FactorizedParetoTruncationWitnesses
	retainedAdditions: readonly RecallAuditNewTreatment[]
	escalation: FactorizedPareto6000TriggerCertificate
}>

type PerceptualBin = {
	key: number
	population: number
	sumL: number
	sumA: number
	sumB: number
	exemplarIndex: number
	familyIndex: number
}

type MutableComponent = {
	start: number
	population: number
	minX: number
	minY: number
	maxX: number
	maxY: number
	borderPixels: number
	boundaryEdges: number
	boundaryContrastSum: number
	boundaryLightnessDeltaSum: number
	boundaryAbsoluteLightnessDeltaSum: number
	rolePreliminary: number
	retainedFor: ("connected-support" | "role-observation")[]
}

type MutableFamily = {
	id: string
	anchor: OKLab
	binIndexes: number[]
	population: number
	sumL: number
	sumA: number
	sumB: number
	sumX: number
	sumY: number
	sumX2: number
	sumY2: number
	borderPixels: number
	centerPixels: number
	cornerPixels: number
	quadrants: number
	boundaryEdges: number
	neighborDistanceSum: number
	neighborEdgeCount: number
	componentCount: number
	components: MutableComponent[]
}

type FieldVariant = Readonly<{
	hypothesis: FieldHypothesis
	background: ColorRepresentative
	surface: ColorRepresentative
	gradient: boolean
	treatment: FieldTreatmentKind
	fieldFidelity: number
	surfaceContribution: number
}>

type GradientFit = Readonly<{
	domain: BackgroundFieldDomain
	topology: GradientTopology
	direction: GradientFieldEvidence["direction"]
	position: (x: number, y: number) => number
	intercept: OKLab
	slope: OKLab
	span: number
	residual: number
	progression: number
	monotonicity: number
	texture: number
	score: number
}>

type MutableAdjacency = {
	firstFamilyIndex: number
	secondFamilyIndex: number
	boundaryEdges: number
	contrastSum: number
}

type BandEndpoint = Readonly<{
	family: ColorFamilyEvidence
	representative: ColorRepresentative
	bandShare: number
}>

type EvaluatedGradientFit = Readonly<{
	fit: GradientFit
	progression: number
	modeProgression: number
	bandDispersion: number
	edgeContinuity: number
	low: BandEndpoint | null
	high: BandEndpoint | null
	rejectionReasons: readonly string[]
}>

type IdentityObligationSelection = Readonly<{
	obligations: readonly IdentityObligation[]
	trace: IdentityObligationGraph["selection"]
}>

type BackgroundFieldDomain = Readonly<{
	evidence: BackgroundFieldDomainEvidence
	pixelIndexes: Uint32Array
}>

const FAMILY_BIN_STEP = 0.04
const FAMILY_ANCHOR_RADIUS = 0.058
const REPRESENTATIVE_DENSITY_RADIUS = 0.04
const MINIMUM_DISTINCT_DISTANCE = 0.018
const GRID_SIZE = 12
const RANKING_EVIDENCE_RESOLUTION = 0.04

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.max(minimum, Math.min(maximum, value))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareNumbersDescending(first: number, second: number): number {
	return second - first
}

function canonicalColorKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function sameColor(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return 0
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function quantizedKey([lightness, a, b]: OKLab): number {
	const lightnessBin = Math.max(0, Math.min(25, Math.floor(lightness / FAMILY_BIN_STEP)))
	const aBin = Math.max(0, Math.min(20, Math.floor((a + 0.4) / FAMILY_BIN_STEP)))
	const bBin = Math.max(0, Math.min(20, Math.floor((b + 0.4) / FAMILY_BIN_STEP)))
	return lightnessBin * 441 + aBin * 21 + bBin
}

function binPrototype(bin: PerceptualBin): OKLab {
	return [bin.sumL / bin.population, bin.sumA / bin.population, bin.sumB / bin.population]
}

function insertComponent(components: MutableComponent[], component: MutableComponent): void {
	const candidates = [...components, component]
	const largest = [...candidates]
		.sort((first, second) => compareNumbersDescending(first.population, second.population) || first.start - second.start)
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.largestComponentsPerFamily)
	const roleObserved = [...candidates]
		.sort((first, second) =>
			compareNumbersDescending(first.rolePreliminary, second.rolePreliminary) ||
			compareNumbersDescending(first.population, second.population) ||
			first.start - second.start)
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.roleObservationComponentsPerFamily)
	const largestStarts = new Set(largest.map(({ start }) => start))
	const roleStarts = new Set(roleObserved.map(({ start }) => start))
	const retained = new Map<number, MutableComponent>()
	for (const candidate of [...largest, ...roleObserved]) {
		candidate.retainedFor = [
			...(largestStarts.has(candidate.start) ? ["connected-support" as const] : []),
			...(roleStarts.has(candidate.start) ? ["role-observation" as const] : []),
		]
		retained.set(candidate.start, candidate)
	}
	components.splice(0, components.length, ...[...retained.values()].sort((first, second) =>
		compareNumbersDescending(first.population, second.population) || first.start - second.start))
}

function componentSimilarity(first: MutableComponent, second: MutableComponent): number {
	const firstWidth = first.maxX - first.minX + 1
	const firstHeight = first.maxY - first.minY + 1
	const secondWidth = second.maxX - second.minX + 1
	const secondHeight = second.maxY - second.minY + 1
	const firstFill = first.population / Math.max(1, firstWidth * firstHeight)
	const secondFill = second.population / Math.max(1, secondWidth * secondHeight)
	return clamp(
		0.45 * Math.min(first.population, second.population) / Math.max(first.population, second.population) +
		0.25 * Math.min(firstHeight, secondHeight) / Math.max(firstHeight, secondHeight) +
		0.15 * Math.min(firstWidth, secondWidth) / Math.max(firstWidth, secondWidth) +
		0.15 * (1 - Math.abs(firstFill - secondFill)),
	)
}

function buildRegionObservations(
	components: readonly MutableComponent[],
	familyPopulation: number,
	pixelCount: number,
	width: number,
	height: number,
): Map<number, RegionObservation> {
	const output = new Map<number, RegionObservation>()
	for (const component of components) {
		const boxWidth = component.maxX - component.minX + 1
		const boxHeight = component.maxY - component.minY + 1
		const boxPixels = boxWidth * boxHeight
		const widthFraction = boxWidth / width
		const heightFraction = boxHeight / height
		const boundsFraction = boxPixels / pixelCount
		const elongation = Math.max(boxWidth, boxHeight) / Math.max(1, Math.min(boxWidth, boxHeight))
		const fill = component.population / Math.max(1, boxPixels)
		const localContrast = component.boundaryContrastSum / Math.max(1, component.boundaryEdges)
		const boundaryLightnessContrast = component.boundaryAbsoluteLightnessDeltaSum / Math.max(1, component.boundaryEdges)
		const boundaryLightnessPolarity = component.boundaryAbsoluteLightnessDeltaSum <= 1e-12
			? 0
			: component.boundaryLightnessDeltaSum / component.boundaryAbsoluteLightnessDeltaSum
		const borderContact = component.borderPixels / Math.max(1, component.population)
		const interiorMargin = Math.min(
			component.minX / Math.max(1, width - 1),
			component.minY / Math.max(1, height - 1),
			(width - 1 - component.maxX) / Math.max(1, width - 1),
			(height - 1 - component.maxY) / Math.max(1, height - 1),
		)
		const componentFamilyFraction = component.population / familyPopulation
		const similarities = components
			.filter(({ start }) => start !== component.start)
			.map((candidate) => componentSimilarity(component, candidate))
			.sort(compareNumbersDescending)
		const repetition = clamp(similarities.slice(0, 3).reduce((sum, similarity) => sum + similarity, 0) / 2)
		const resolved = clamp(Math.log2(component.population + 1) / 8)
		const nonField = 1 - clamp(boundsFraction / 0.18)
		const geometry = Math.sqrt(resolved * nonField) * (1 - 0.2 * clamp((elongation - 20) / 20))
		const typographyFill = clamp(fill / 0.12) * (1 - 0.5 * clamp((fill - 0.82) / 0.18))
		const signatureFill = clamp(fill / 0.12)
		const contrast = clamp(localContrast / 0.16)
		const borderInterior = 0.75 * (1 - clamp(borderContact / 0.25)) + 0.25 * clamp(interiorMargin / 0.08)
		const sourceSupport = clamp(
			0.55 * resolved +
			0.25 * clamp(component.population / pixelCount / 0.001) +
			0.20 * clamp(familyPopulation / pixelCount / 0.001) * clamp(componentFamilyFraction / 0.1),
		)
		const typographyCues = 0.24 * geometry + 0.14 * typographyFill + 0.22 * repetition + 0.24 * contrast + 0.16 * borderInterior
		const signatureCues = 0.20 * geometry + 0.16 * signatureFill + 0.16 * repetition + 0.30 * contrast + 0.18 * borderInterior
		const factors = (
			role: "typography" | "signature",
			fillFactor: number,
			cues: number,
		): RegionRoleFactors => ({
			geometry,
			fill: fillFactor,
			repetition,
			localContrast: contrast,
			borderInterior,
			sourceSupport,
			score: clamp(sourceSupport * (0.45 + 0.55 * cues) * (role === "typography" ? 1 : 1)),
		})
		output.set(component.start, {
			widthFraction,
			heightFraction,
			boundsFraction,
			elongation,
			fill,
			repetition,
			localContrast,
			boundaryLightnessContrast,
			boundaryLightnessPolarity,
			borderContact,
			interiorMargin,
			componentFamilyFraction,
			foregroundTypography: factors("typography", typographyFill, typographyCues),
			signatureAccent: factors("signature", signatureFill, signatureCues),
		})
	}
	return output
}

function aggregateRegionScores(values: readonly number[]): number {
	const weights = [4, 3, 2, 1]
	const sorted = [...values].sort(compareNumbersDescending).slice(0, weights.length)
	const denominator = weights.slice(0, sorted.length).reduce((sum, weight) => sum + weight, 0)
	return denominator === 0 ? 0 : sorted.reduce((sum, value, index) => sum + value * weights[index], 0) / denominator
}

function foregroundPolarityObservation(
	familyId: string,
	components: readonly MutableComponent[],
	observations: ReadonlyMap<number, RegionObservation>,
): ForegroundPolarityObservation {
	const regions = components
		.filter(({ retainedFor }) => retainedFor.includes("role-observation"))
		.map((component) => {
			const observation = observations.get(component.start)!
			return {
				component,
				observation,
				weight: observation.foregroundTypography.score * observation.repetition *
					clamp(observation.boundaryLightnessContrast / 0.16),
			}
		})
		.filter(({ weight }) => weight > 0)
		.sort((first, second) => compareNumbersDescending(first.weight, second.weight) || first.component.start - second.component.start)
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.typographyPolarityRegions)
	const totalWeight = regions.reduce((sum, { weight }) => sum + weight, 0)
	return {
		polarity: totalWeight === 0
			? 0
			: regions.reduce((sum, { observation, weight }) => sum + observation.boundaryLightnessPolarity * weight, 0) / totalWeight,
		confidence: clamp(totalWeight),
		componentIds: regions.map(({ component }) => `${familyId}-region-${component.start}`),
	}
}

function sourceSupport(
	representativeIndex: number | null,
	representativeLab: OKLab,
	strategy: RepresentativeStrategy,
	family: MutableFamily,
	familyEvidence: Pick<ColorFamilyEvidence, "id" | "populationFraction" | "largestComponentFraction" | "quadrantCoverage" | "familyConcentration">,
	bins: readonly PerceptualBin[],
	labs: Float32Array,
	width: number,
	height: number,
): SourceSupportRecord {
	let neighborhoodPopulation = 0
	let occupiedDistance = Infinity
	for (const binIndex of family.binIndexes) {
		const bin = bins[binIndex]
		const distance = okDistance(representativeLab, binPrototype(bin))
		occupiedDistance = Math.min(occupiedDistance, distance)
		if (distance <= REPRESENTATIVE_DENSITY_RADIUS) neighborhoodPopulation += bin.population
	}
	const exactSource = representativeIndex !== null
	const exemplar = representativeIndex === null
		? null
		: { x: representativeIndex % width, y: Math.floor(representativeIndex / width) }
	const exactDistance = representativeIndex === null ? occupiedDistance : okDistance(representativeLab, labAt(labs, representativeIndex))
	return {
		exactSource,
		exemplar,
		anchorFamilyId: family.id,
		regionIds: family.components.map(({ start }) => `${family.id}-region-${start}`),
		perceptualDensity: neighborhoodPopulation / Math.max(1, family.population),
		totalSupport: familyEvidence.populationFraction,
		connectedSupport: familyEvidence.largestComponentFraction,
		spatialCoverage: familyEvidence.quadrantCoverage,
		concentration: familyEvidence.familyConcentration,
		prototypeDistance: exactDistance,
		outlierScore: 1 - neighborhoodPopulation / Math.max(1, family.population),
		synthesis: strategy === "density-synthesized"
			? { operation: "dense-neighborhood-mean", occupiedDistance }
			: null,
	}
}

function supportQuality(representative: ColorRepresentative): number {
	if ("generated" in representative.support) return 0
	const support = representative.support
	return clamp(
		0.28 * clamp(support.perceptualDensity / 0.5) +
		0.22 * clamp(support.totalSupport / 0.08) +
		0.22 * clamp(support.connectedSupport / 0.08) +
		0.16 * support.spatialCoverage +
		0.12 * (1 - clamp(support.prototypeDistance / 0.06)),
	)
}

function roleColor(representative: ColorRepresentative): PaletteRoleColor {
	return {
		rgb: representative.rgb,
		oklab: representative.oklab,
		hex: representative.hex,
		generated: "generated" in representative.support,
		strategy: representative.strategy,
		support: representative.support,
	}
}

function familyById(evidence: NativePaletteEvidence, id: string): ColorFamilyEvidence {
	const family = evidence.families.find((candidate) => candidate.id === id)
	if (!family) throw new Error(`Unknown color family ${id}`)
	return family
}

const FIELD_ROLE_OWNERSHIP_CRITERIA = [
	"frameCoverage",
	"peripheralCoverage",
	"connectedCoverage",
	"fieldScore",
	"populationCoverage",
] as const

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / RANKING_EVIDENCE_RESOLUTION)
}

function fieldRoleOwnershipProfile(family: ColorFamilyEvidence): FieldRoleOwnershipProfile {
	const frameCoverage = (family.borderCoverage + family.cornerCoverage) / 2
	const peripheralCoverage = (family.borderCoverage + family.cornerCoverage + (1 - family.centerCoverage)) / 3
	const connectedCoverage = Math.sqrt(clamp(family.largestComponentFraction / 0.24) * family.familyConcentration)
	const populationCoverage = clamp(family.populationFraction / 0.24)
	const values = [frameCoverage, peripheralCoverage, connectedCoverage, family.fieldScore, populationCoverage] as const
	return {
		frameCoverage,
		peripheralCoverage,
		connectedCoverage,
		fieldScore: family.fieldScore,
		populationCoverage,
		evidenceLevels: values.map(evidenceLevel) as [number, number, number, number, number],
	}
}

function assignFieldRoles(first: ColorFamilyEvidence, second: ColorFamilyEvidence): FieldRoleAssignmentEvidence {
	const firstProfile = fieldRoleOwnershipProfile(first)
	const secondProfile = fieldRoleOwnershipProfile(second)
	let background = first
	let surface = second
	let backgroundProfile = firstProfile
	let surfaceProfile = secondProfile
	let decisiveCriterion: FieldRoleAssignmentEvidence["decisiveCriterion"] = "ascii-tie"
	let confidence = 0
	for (let index = 0; index < FIELD_ROLE_OWNERSHIP_CRITERIA.length; index++) {
		const difference = firstProfile.evidenceLevels[index] - secondProfile.evidenceLevels[index]
		if (difference === 0) continue
		decisiveCriterion = FIELD_ROLE_OWNERSHIP_CRITERIA[index]
		confidence = clamp(Math.abs(difference) * RANKING_EVIDENCE_RESOLUTION)
		if (difference < 0) {
			background = second
			surface = first
			backgroundProfile = secondProfile
			surfaceProfile = firstProfile
		}
		break
	}
	if (decisiveCriterion === "ascii-tie" && compareAscii(first.id, second.id) > 0) {
		background = second
		surface = first
		backgroundProfile = secondProfile
		surfaceProfile = firstProfile
	}
	return {
		backgroundFamilyId: background.id,
		surfaceFamilyId: surface.id,
		backgroundProfile,
		surfaceProfile,
		decisiveCriterion,
		confidence,
	}
}

function foregroundRoleScore(family: ColorFamilyEvidence): number {
	return clamp(0.60 * family.foregroundScore + 0.40 * family.foregroundTypographyObservation)
}

function signatureRoleScore(family: ColorFamilyEvidence): number {
	return clamp(0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation)
}

function rankAllLaneFamilies(
	families: readonly ColorFamilyEvidence[],
	name: EvidenceLane["name"],
): ColorFamilyEvidence[] {
	const score = name === "field"
		? (family: ColorFamilyEvidence): number => family.fieldScore
		: name === "signature" ? signatureRoleScore : foregroundRoleScore
	return families
		.filter(({ population }) => population > 0)
		.sort((first, second) =>
			compareNumbersDescending(score(first), score(second)) ||
			compareNumbersDescending(first.population, second.population) ||
			compareAscii(first.id, second.id))
}

function distinctAccentFidelity(
	family: ColorFamilyEvidence,
	accent: ColorRepresentative,
	foreground: ColorRepresentative,
): number {
	const separation = clamp((okDistance(accent.oklab, foreground.oklab) - MINIMUM_DISTINCT_DISTANCE) / 0.18)
	return signatureRoleScore(family) * Math.sqrt(separation)
}

export function buildNativePaletteEvidence(image: RawImage): NativePaletteEvidence {
	if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
		throw new RangeError("Native image dimensions must be positive safe integers")
	}
	const pixelCount = image.width * image.height
	if (!Number.isSafeInteger(pixelCount) || image.data.length !== pixelCount * 3) {
		throw new RangeError("Native image must contain row-major three-channel RGB pixels")
	}

	const labs = toLabBuffer(image.data)
	const pixelBinKeys = new Uint16Array(pixelCount)
	const binsByKey = new Map<number, PerceptualBin>()
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		const lab = labAt(labs, pixelIndex)
		const key = quantizedKey(lab)
		pixelBinKeys[pixelIndex] = key
		const existing = binsByKey.get(key)
		if (existing) {
			existing.population += 1
			existing.sumL += lab[0]
			existing.sumA += lab[1]
			existing.sumB += lab[2]
		} else {
			binsByKey.set(key, {
				key,
				population: 1,
				sumL: lab[0],
				sumA: lab[1],
				sumB: lab[2],
				exemplarIndex: pixelIndex,
				familyIndex: -1,
			})
		}
	}

	const bins = [...binsByKey.values()].sort((first, second) =>
		compareNumbersDescending(first.population, second.population) || first.key - second.key)
	const mutableFamilies: MutableFamily[] = []
	for (let binIndex = 0; binIndex < bins.length; binIndex++) {
		const bin = bins[binIndex]
		const prototype = binPrototype(bin)
		let familyIndex = -1
		let nearestDistance = Infinity
		for (let candidateIndex = 0; candidateIndex < mutableFamilies.length; candidateIndex++) {
			const distance = okDistance(prototype, mutableFamilies[candidateIndex].anchor)
			if (distance <= FAMILY_ANCHOR_RADIUS && distance < nearestDistance) {
				familyIndex = candidateIndex
				nearestDistance = distance
			}
		}
		if (familyIndex < 0) {
			familyIndex = mutableFamilies.length
			mutableFamilies.push({
				id: `family-${bin.key}`,
				anchor: prototype,
				binIndexes: [],
				population: 0,
				sumL: 0,
				sumA: 0,
				sumB: 0,
				sumX: 0,
				sumY: 0,
				sumX2: 0,
				sumY2: 0,
				borderPixels: 0,
				centerPixels: 0,
				cornerPixels: 0,
				quadrants: 0,
				boundaryEdges: 0,
				neighborDistanceSum: 0,
				neighborEdgeCount: 0,
				componentCount: 0,
				components: [],
			})
		}
		bin.familyIndex = familyIndex
		mutableFamilies[familyIndex].binIndexes.push(binIndex)
	}

	const familyForBinKey = new Map<number, number>()
	for (const bin of bins) familyForBinKey.set(bin.key, bin.familyIndex)
	const familyAt = new Uint16Array(pixelCount)
	const widthDenominator = Math.max(1, image.width - 1)
	const heightDenominator = Math.max(1, image.height - 1)
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		const familyIndex = familyForBinKey.get(pixelBinKeys[pixelIndex])
		if (familyIndex === undefined) throw new Error("Perceptual family assignment is incomplete")
		familyAt[pixelIndex] = familyIndex
		const family = mutableFamilies[familyIndex]
		const lab = labAt(labs, pixelIndex)
		const x = pixelIndex % image.width
		const y = Math.floor(pixelIndex / image.width)
		const normalizedX = x / widthDenominator
		const normalizedY = y / heightDenominator
		family.population += 1
		family.sumL += lab[0]
		family.sumA += lab[1]
		family.sumB += lab[2]
		family.sumX += normalizedX
		family.sumY += normalizedY
		family.sumX2 += normalizedX * normalizedX
		family.sumY2 += normalizedY * normalizedY
		if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) family.borderPixels += 1
		if (normalizedX >= 0.25 && normalizedX <= 0.75 && normalizedY >= 0.25 && normalizedY <= 0.75) {
			family.centerPixels += 1
		}
		if ((normalizedX <= 0.15 || normalizedX >= 0.85) && (normalizedY <= 0.15 || normalizedY >= 0.85)) {
			family.cornerPixels += 1
		}
		const quadrant = (normalizedX >= 0.5 ? 1 : 0) + (normalizedY >= 0.5 ? 2 : 0)
		family.quadrants |= 1 << quadrant
	}

	const mutableAdjacencies = new Map<string, MutableAdjacency>()
	const recordAdjacency = (firstFamilyIndex: number, secondFamilyIndex: number, distance: number): void => {
		const first = Math.min(firstFamilyIndex, secondFamilyIndex)
		const second = Math.max(firstFamilyIndex, secondFamilyIndex)
		const key = `${first}:${second}`
		const existing = mutableAdjacencies.get(key)
		if (existing) {
			existing.boundaryEdges += 1
			existing.contrastSum += distance
		} else {
			mutableAdjacencies.set(key, {
				firstFamilyIndex: first,
				secondFamilyIndex: second,
				boundaryEdges: 1,
				contrastSum: distance,
			})
		}
	}
	for (let y = 0; y < image.height; y++) {
		for (let x = 0; x < image.width; x++) {
			const pixelIndex = y * image.width + x
			const familyIndex = familyAt[pixelIndex]
			if (x + 1 < image.width) {
				const neighborIndex = pixelIndex + 1
				const neighborFamilyIndex = familyAt[neighborIndex]
				if (neighborFamilyIndex !== familyIndex) {
					const distance = okDistance(labAt(labs, pixelIndex), labAt(labs, neighborIndex))
					recordAdjacency(familyIndex, neighborFamilyIndex, distance)
					for (const index of [familyIndex, neighborFamilyIndex]) {
						mutableFamilies[index].boundaryEdges += 1
						mutableFamilies[index].neighborDistanceSum += distance
						mutableFamilies[index].neighborEdgeCount += 1
					}
				}
			}
			if (y + 1 < image.height) {
				const neighborIndex = pixelIndex + image.width
				const neighborFamilyIndex = familyAt[neighborIndex]
				if (neighborFamilyIndex !== familyIndex) {
					const distance = okDistance(labAt(labs, pixelIndex), labAt(labs, neighborIndex))
					recordAdjacency(familyIndex, neighborFamilyIndex, distance)
					for (const index of [familyIndex, neighborFamilyIndex]) {
						mutableFamilies[index].boundaryEdges += 1
						mutableFamilies[index].neighborDistanceSum += distance
						mutableFamilies[index].neighborEdgeCount += 1
					}
				}
			}
		}
	}

	const visited = new Uint8Array(pixelCount)
	const queue = new Int32Array(pixelCount)
	for (let start = 0; start < pixelCount; start++) {
		if (visited[start]) continue
		const familyIndex = familyAt[start]
		let queueRead = 0
		let queueLength = 1
		queue[0] = start
		visited[start] = 1
		const component: MutableComponent = {
			start,
			population: 0,
			minX: image.width,
			minY: image.height,
			maxX: 0,
			maxY: 0,
			borderPixels: 0,
			boundaryEdges: 0,
			boundaryContrastSum: 0,
			boundaryLightnessDeltaSum: 0,
			boundaryAbsoluteLightnessDeltaSum: 0,
			rolePreliminary: 0,
			retainedFor: [],
		}
		while (queueRead < queueLength) {
			const pixelIndex = queue[queueRead++]
			const x = pixelIndex % image.width
			const y = Math.floor(pixelIndex / image.width)
			component.population += 1
			component.minX = Math.min(component.minX, x)
			component.minY = Math.min(component.minY, y)
			component.maxX = Math.max(component.maxX, x)
			component.maxY = Math.max(component.maxY, y)
			if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) component.borderPixels += 1
			const neighbors = [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < image.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - image.width : -1,
				y + 1 < image.height ? pixelIndex + image.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && !visited[neighbor] && familyAt[neighbor] === familyIndex) {
					visited[neighbor] = 1
					queue[queueLength++] = neighbor
				} else if (neighbor >= 0 && familyAt[neighbor] !== familyIndex) {
					component.boundaryEdges += 1
					const pixelLab = labAt(labs, pixelIndex)
					const neighborLab = labAt(labs, neighbor)
					const lightnessDelta = neighborLab[0] - pixelLab[0]
					component.boundaryContrastSum += okDistance(pixelLab, neighborLab)
					component.boundaryLightnessDeltaSum += lightnessDelta
					component.boundaryAbsoluteLightnessDeltaSum += Math.abs(lightnessDelta)
				}
			}
		}
		const componentWidth = component.maxX - component.minX + 1
		const componentHeight = component.maxY - component.minY + 1
		const componentBounds = componentWidth * componentHeight
		const resolved = clamp(Math.log2(component.population + 1) / 8)
		const nonField = 1 - clamp(componentBounds / pixelCount / 0.18)
		const fill = component.population / Math.max(1, componentBounds)
		const localContrast = component.boundaryContrastSum / Math.max(1, component.boundaryEdges)
		const borderInterior = 1 - clamp(component.borderPixels / Math.max(1, component.population) / 0.25)
		component.rolePreliminary = clamp(
			Math.sqrt(resolved * nonField) *
			(0.35 + 0.25 * clamp(fill / 0.12) + 0.25 * clamp(localContrast / 0.16) + 0.15 * borderInterior),
		)
		const family = mutableFamilies[familyIndex]
		family.componentCount += 1
		insertComponent(family.components, component)
	}

	const preliminary = mutableFamilies.map((family): ColorFamilyEvidence => {
		const populationFraction = family.population / pixelCount
		const prototype: OKLab = [
			family.sumL / family.population,
			family.sumA / family.population,
			family.sumB / family.population,
		]
		const centroidX = family.sumX / family.population
		const centroidY = family.sumY / family.population
		const varianceX = Math.max(0, family.sumX2 / family.population - centroidX * centroidX)
		const varianceY = Math.max(0, family.sumY2 / family.population - centroidY * centroidY)
		const largestComponentPopulation = family.components[0]?.population ?? 0
		const largestComponentFraction = largestComponentPopulation / pixelCount
		const familyConcentration = largestComponentPopulation / family.population
		const borderDenominator = Math.max(1, image.width * 2 + image.height * 2 - 4)
		const cornerDenominator = Math.max(1, Math.ceil(image.width * 0.3) * Math.ceil(image.height * 0.3))
		const borderCoverage = clamp(family.borderPixels / borderDenominator)
		const centerCoverage = clamp(family.centerPixels / Math.max(1, Math.ceil(pixelCount * 0.25)))
		const cornerCoverage = clamp(family.cornerPixels / cornerDenominator)
		const quadrantCoverage = ((family.quadrants & 1 ? 1 : 0) + (family.quadrants & 2 ? 1 : 0) +
			(family.quadrants & 4 ? 1 : 0) + (family.quadrants & 8 ? 1 : 0)) / 4
		const edgeDensity = clamp(family.boundaryEdges / Math.max(1, family.population * 2))
		const localContrast = family.neighborDistanceSum / Math.max(1, family.neighborEdgeCount)
		const regionObservations = buildRegionObservations(family.components, family.population, pixelCount, image.width, image.height)
		const foregroundTypographyObservation = aggregateRegionScores(family.components.map(({ start }) =>
			regionObservations.get(start)?.foregroundTypography.score ?? 0))
		const foregroundPolarity = foregroundPolarityObservation(family.id, family.components, regionObservations)
		const signatureAccentObservation = aggregateRegionScores(family.components.map(({ start }) =>
			regionObservations.get(start)?.signatureAccent.score ?? 0))
		const broadSupport = clamp(populationFraction / 0.24)
		const componentCoherence = clamp(familyConcentration)
		const textureCalm = 1 - clamp(edgeDensity / 0.7)
		const fieldScore = clamp(
			0.28 * broadSupport +
			0.22 * borderCoverage +
			0.22 * componentCoherence +
			0.13 * quadrantCoverage +
			0.15 * textureCalm,
		)
		const coherentSupport = clamp(largestComponentFraction / 0.002)
		const repeatCount = family.components.filter(({ population }) => population / pixelCount >= 0.00025).length
		const repeatedSupport = clamp((repeatCount - 1) / 3)
		const distinctive = clamp(localContrast / 0.16)
		const chromatic = clamp(chroma(prototype) / 0.18)
		const notBroad = 1 - clamp((populationFraction - 0.18) / 0.35)
		const signatureScore = clamp(
			0.25 * coherentSupport +
			0.18 * componentCoherence +
			0.16 * repeatedSupport +
			0.22 * distinctive +
			0.11 * chromatic +
			0.08 * notBroad,
		)
		const foregroundScore = clamp(
			0.34 * clamp(populationFraction / 0.025) +
			0.25 * componentCoherence +
			0.20 * distinctive +
			0.13 * chromatic +
			0.08 * clamp((borderCoverage + centerCoverage) / 2),
		)
		return {
			id: family.id,
			prototype,
			population: family.population,
			populationFraction,
			perceptualBinCount: family.binIndexes.length,
			borderCoverage,
			centerCoverage,
			quadrantCoverage,
			cornerCoverage,
			centroid: [centroidX, centroidY],
			spatialSpread: clamp(Math.sqrt(varianceX + varianceY) / 0.5),
			largestComponentFraction,
			familyConcentration,
			componentCount: family.componentCount,
			repeatedComponentCount: repeatCount,
			edgeDensity,
			localContrast,
			chroma: chroma(prototype),
			fieldScore,
			signatureScore,
			foregroundScore,
			foregroundTypographyObservation,
			foregroundPolarityObservation: foregroundPolarity,
			signatureAccentObservation,
			observedComponentCount: family.components.filter(({ retainedFor }) => retainedFor.includes("role-observation")).length,
			components: family.components.map((component) => ({
				id: `${family.id}-region-${component.start}`,
				startPixelIndex: component.start,
				population: component.population,
				populationFraction: component.population / pixelCount,
				minX: component.minX,
				minY: component.minY,
				maxX: component.maxX,
				maxY: component.maxY,
				borderPixels: component.borderPixels,
				retainedFor: component.retainedFor,
				observation: regionObservations.get(component.start)!,
			})),
			representatives: [],
		}
	})

	const denseTargets = mutableFamilies.map((family) => {
		const denseBinIndex = [...family.binIndexes].sort((first, second) =>
			compareNumbersDescending(bins[first].population, bins[second].population) || bins[first].key - bins[second].key)[0]
		return binPrototype(bins[denseBinIndex])
	})
	const prototypeTargets = preliminary.map(({ prototype }) => prototype)
	const nearestDenseIndexes = new Int32Array(mutableFamilies.length).fill(-1)
	const nearestPrototypeIndexes = new Int32Array(mutableFamilies.length).fill(-1)
	const nearestDenseDistances = new Float64Array(mutableFamilies.length).fill(Infinity)
	const nearestPrototypeDistances = new Float64Array(mutableFamilies.length).fill(Infinity)
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		const familyIndex = familyAt[pixelIndex]
		const lab = labAt(labs, pixelIndex)
		const denseDistance = okDistance(lab, denseTargets[familyIndex])
		if (denseDistance < nearestDenseDistances[familyIndex]) {
			nearestDenseDistances[familyIndex] = denseDistance
			nearestDenseIndexes[familyIndex] = pixelIndex
		}
		const prototypeDistance = okDistance(lab, prototypeTargets[familyIndex])
		if (prototypeDistance < nearestPrototypeDistances[familyIndex]) {
			nearestPrototypeDistances[familyIndex] = prototypeDistance
			nearestPrototypeIndexes[familyIndex] = pixelIndex
		}
	}

	const families = preliminary.map((familyEvidence, familyIndex): ColorFamilyEvidence => {
		const mutable = mutableFamilies[familyIndex]
		const representatives: ColorRepresentative[] = []
		const addExact = (strategy: "dense-exact" | "nearest-prototype", pixelIndex: number): void => {
			const rgb = rgbAt(image.data, pixelIndex)
			const oklab = labAt(labs, pixelIndex)
			if (representatives.some((candidate) => sameColor(candidate.rgb, rgb))) return
			representatives.push({
				strategy,
				rgb,
				oklab,
				hex: rgbToHex(rgb),
				support: sourceSupport(pixelIndex, oklab, strategy, mutable, familyEvidence, bins, labs, image.width, image.height),
			})
		}
		addExact("dense-exact", nearestDenseIndexes[familyIndex])
		addExact("nearest-prototype", nearestPrototypeIndexes[familyIndex])

		const synthesizedRgb = oklabToRGB(familyEvidence.prototype)
		const synthesizedLab = rgbToOKLab(synthesizedRgb)
		const synthesizedSupport = sourceSupport(
			null,
			synthesizedLab,
			"density-synthesized",
			mutable,
			familyEvidence,
			bins,
			labs,
			image.width,
			image.height,
		)
		if (
			synthesizedSupport.synthesis !== null &&
			synthesizedSupport.synthesis.occupiedDistance <= ALBUM_ARTWORK_PALETTE_V2_POLICY.representatives.maximumSynthesizedOccupiedDistance &&
			synthesizedSupport.perceptualDensity >= 0.2 &&
			!representatives.some((candidate) => sameColor(candidate.rgb, synthesizedRgb))
		) {
			representatives.push({
				strategy: "density-synthesized",
				rgb: synthesizedRgb,
				oklab: synthesizedLab,
				hex: rgbToHex(synthesizedRgb),
				support: synthesizedSupport,
			})
		}
		return { ...familyEvidence, representatives }
	})

	const rankLane = (
		name: EvidenceLane["name"],
		maximumFamilies: number,
		familyScore: (family: ColorFamilyEvidence) => number,
		regionScore: (family: ColorFamilyEvidence) => number,
		combinedScore: (family: ColorFamilyEvidence) => number,
	): Readonly<{ lane: EvidenceLane; trace: LaneRetentionTrace }> => {
		const ranked = families
			.filter(({ population }) => population > 0)
			.sort((first, second) =>
				compareNumbersDescending(combinedScore(first), combinedScore(second)) ||
				compareNumbersDescending(first.population, second.population) ||
				compareAscii(first.id, second.id))
		return {
			lane: { name, maximumFamilies, familyIds: ranked.slice(0, maximumFamilies).map(({ id }) => id) },
			trace: {
				name,
				evaluatedFamilyCount: ranked.length,
				candidates: ranked.slice(0, maximumFamilies + 4).map((family, rank) => ({
					familyId: family.id,
					familyScore: familyScore(family),
					regionScore: regionScore(family),
					combinedScore: combinedScore(family),
					rank,
					retained: rank < maximumFamilies,
				})),
			},
		}
	}
	const laneResults = [
		rankLane("field", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldFamilies, ({ fieldScore }) => fieldScore, () => 0, ({ fieldScore }) => fieldScore),
		rankLane("signature", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.signatureFamilies, ({ signatureScore }) => signatureScore, ({ signatureAccentObservation }) => signatureAccentObservation, signatureRoleScore),
		rankLane("foreground", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.foregroundFamilies, ({ foregroundScore }) => foregroundScore, ({ foregroundTypographyObservation }) => foregroundTypographyObservation, foregroundRoleScore),
	]
	const lanes = laneResults.map(({ lane }) => lane)
	const laneRetention = laneResults.map(({ trace }) => trace)
	const laneIds = new Set(lanes.flatMap(({ familyIds }) => familyIds))
	const retainedFamilyIds = families
		.filter(({ id }) => laneIds.has(id))
		.sort((first, second) =>
			compareNumbersDescending(Math.max(first.fieldScore, signatureRoleScore(first), foregroundRoleScore(first)), Math.max(second.fieldScore, signatureRoleScore(second), foregroundRoleScore(second))) ||
			compareAscii(first.id, second.id))
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedDiagnosticFamilies)
		.map(({ id }) => id)

	const adjacencies = [...mutableAdjacencies.values()]
		.map((adjacency): FamilyAdjacencyEvidence => ({
			firstFamilyId: families[adjacency.firstFamilyIndex].id,
			secondFamilyId: families[adjacency.secondFamilyIndex].id,
			boundaryEdges: adjacency.boundaryEdges,
			meanContrast: adjacency.contrastSum / adjacency.boundaryEdges,
		}))
		.sort((first, second) =>
			compareNumbersDescending(first.boundaryEdges, second.boundaryEdges) ||
			compareAscii(`${first.firstFamilyId}:${first.secondFamilyId}`, `${second.firstFamilyId}:${second.secondFamilyId}`))

	return {
		width: image.width,
		height: image.height,
		pixelCount,
		rgbData: image.data,
		labs,
		familyAt,
		families,
		adjacencies,
		retainedFamilyIds,
		lanes,
		laneRetention,
	}
}

function buildBackgroundFieldDomains(evidence: NativePaletteEvidence): BackgroundFieldDomain[] {
	const fieldIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const smoothAdjacencies = new Set(evidence.adjacencies
		.filter(({ meanContrast }) => meanContrast <= FAMILY_ANCHOR_RADIUS)
		.map(({ firstFamilyId, secondFamilyId }) => [firstFamilyId, secondFamilyId].sort(compareAscii).join(":")))
	const componentAtStart = new Map<number, string>()
	for (const family of evidence.families) {
		for (const component of family.components) componentAtStart.set(component.startPixelIndex, component.id)
	}
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	const domains: BackgroundFieldDomain[] = []
	const cornerWidth = Math.max(1, Math.ceil(evidence.width * 0.15))
	const cornerHeight = Math.max(1, Math.ceil(evidence.height * 0.15))
	const cornerPopulation = cornerWidth * cornerHeight
	for (let start = 0; start < evidence.pixelCount; start++) {
		const startFamily = evidence.families[evidence.familyAt[start]]
		if (visited[start] || !fieldIds.has(startFamily.id)) continue
		let queueRead = 0
		let queueLength = 1
		queue[0] = start
		visited[start] = 1
		let borderPixels = 0
		let quadrants = 0
		let sumX = 0
		let sumY = 0
		let sumL = 0
		let sumA = 0
		let sumB = 0
		const cornerCounts = [0, 0, 0, 0]
		const familyPopulations = new Map<string, number>()
		const componentIds = new Set<string>()
		while (queueRead < queueLength) {
			const pixelIndex = queue[queueRead++]
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const family = evidence.families[evidence.familyAt[pixelIndex]]
			const lab = labAt(evidence.labs, pixelIndex)
			sumX += x / Math.max(1, evidence.width - 1)
			sumY += y / Math.max(1, evidence.height - 1)
			sumL += lab[0]
			sumA += lab[1]
			sumB += lab[2]
			familyPopulations.set(family.id, (familyPopulations.get(family.id) ?? 0) + 1)
			const componentId = componentAtStart.get(pixelIndex)
			if (componentId) componentIds.add(componentId)
			if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
			quadrants |= 1 << ((x >= evidence.width / 2 ? 1 : 0) + (y >= evidence.height / 2 ? 2 : 0))
			if (x < cornerWidth && y < cornerHeight) cornerCounts[0] += 1
			if (x >= evidence.width - cornerWidth && y < cornerHeight) cornerCounts[1] += 1
			if (x < cornerWidth && y >= evidence.height - cornerHeight) cornerCounts[2] += 1
			if (x >= evidence.width - cornerWidth && y >= evidence.height - cornerHeight) cornerCounts[3] += 1
			const neighbors = [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < evidence.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - evidence.width : -1,
				y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor < 0 || visited[neighbor]) continue
				const neighborFamily = evidence.families[evidence.familyAt[neighbor]]
				if (!fieldIds.has(neighborFamily.id)) continue
				const sameFamily = family.id === neighborFamily.id
				const adjacencyKey = [family.id, neighborFamily.id].sort(compareAscii).join(":")
				if (!sameFamily && (
					!smoothAdjacencies.has(adjacencyKey) ||
					okDistance(labAt(evidence.labs, pixelIndex), labAt(evidence.labs, neighbor)) > FAMILY_ANCHOR_RADIUS
				)) continue
				visited[neighbor] = 1
				queue[queueLength++] = neighbor
			}
		}
		const populationFraction = queueLength / evidence.pixelCount
		const ownedCornerCount = cornerCounts.filter((count) => count >= cornerPopulation * 0.5).length
		const weightedFieldScore = [...familyPopulations.entries()].reduce((sum, [familyId, population]) =>
			sum + familyById(evidence, familyId).fieldScore * population, 0) / queueLength
		const rejectionReasons: string[] = []
		if (populationFraction < 0.08) rejectionReasons.push("field domain population below 0.08")
		if (ownedCornerCount < 2) rejectionReasons.push("field domain owns fewer than two native corner fields")
		if (weightedFieldScore < 0.35) rejectionReasons.push("field domain weighted field score below 0.35")
		const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
		const quadrantCoverage = ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) +
			(quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4
		const domainEvidence: BackgroundFieldDomainEvidence = {
			id: `field-domain-${start}`,
			kind: "connected",
			sourceDomainIds: [],
			startPixelIndex: start,
			population: queueLength,
			populationFraction,
			borderPixels,
			borderCoverage: clamp(borderPixels / perimeter),
			quadrantCoverage,
			ownedCornerCount,
			weightedFieldScore,
			centroid: [sumX / queueLength, sumY / queueLength],
			meanColor: [sumL / queueLength, sumA / queueLength, sumB / queueLength],
			transitionFamilyCount: 0,
			transitionPopulationFraction: 0,
			transitionQuadrantCoverage: 0,
			familyIds: [...familyPopulations.keys()].sort(compareAscii),
			componentIds: [...componentIds].sort(compareAscii),
			eligible: rejectionReasons.length === 0,
			rejectionReasons,
		}
		if (componentIds.size > 0) {
			domains.push({ evidence: domainEvidence, pixelIndexes: Uint32Array.from(queue.subarray(0, queueLength)) })
		}
	}
	const connectedDomains = [...domains]
	const pairSeeds = connectedDomains
		.filter(({ evidence: domain }) =>
			domain.populationFraction >= 0.08 &&
			domain.borderCoverage >= 0.035 &&
			domain.quadrantCoverage >= 0.5 &&
			domain.weightedFieldScore >= 0.35)
		.sort((first, second) =>
			compareNumbersDescending(first.evidence.population, second.evidence.population) ||
			compareAscii(first.evidence.id, second.evidence.id))
		.slice(0, 4)
	const segmentAmount = (value: OKLab, first: OKLab, second: OKLab): number => {
		const delta: OKLab = [second[0] - first[0], second[1] - first[1], second[2] - first[2]]
		const denominator = delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2
		return denominator <= 1e-12
			? 0
			: clamp(((value[0] - first[0]) * delta[0] + (value[1] - first[1]) * delta[1] + (value[2] - first[2]) * delta[2]) / denominator)
	}
	const distanceToSegment = (value: OKLab, first: OKLab, second: OKLab): number => {
		const delta: OKLab = [second[0] - first[0], second[1] - first[1], second[2] - first[2]]
		const amount = segmentAmount(value, first, second)
		return okDistance(value, [first[0] + delta[0] * amount, first[1] + delta[1] * amount, first[2] + delta[2] * amount])
	}
	for (let firstIndex = 0; firstIndex < pairSeeds.length; firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < pairSeeds.length; secondIndex++) {
			const first = pairSeeds[firstIndex]
			const second = pairSeeds[secondIndex]
			const centroidSeparation = Math.hypot(
				first.evidence.centroid[0] - second.evidence.centroid[0],
				first.evidence.centroid[1] - second.evidence.centroid[1],
			)
			if (centroidSeparation < 0.18 || okDistance(first.evidence.meanColor, second.evidence.meanColor) < 0.06) continue
			const pairVisited = new Uint8Array(evidence.pixelCount)
			const secondMembership = new Uint8Array(evidence.pixelCount)
			for (const pixelIndex of second.pixelIndexes) secondMembership[pixelIndex] = 1
			let queueRead = 0
			let queueLength = 0
			let reachedSecond = 0
			for (const pixelIndex of first.pixelIndexes) {
				if (pairVisited[pixelIndex]) continue
				pairVisited[pixelIndex] = 1
				queue[queueLength++] = pixelIndex
			}
			while (queueRead < queueLength) {
				const pixelIndex = queue[queueRead++]
				if (secondMembership[pixelIndex]) reachedSecond += 1
				const x = pixelIndex % evidence.width
				const y = Math.floor(pixelIndex / evidence.width)
				const neighbors = [
					x > 0 ? pixelIndex - 1 : -1,
					x + 1 < evidence.width ? pixelIndex + 1 : -1,
					y > 0 ? pixelIndex - evidence.width : -1,
					y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
				]
				for (const neighbor of neighbors) {
					if (neighbor < 0 || pairVisited[neighbor] ||
						distanceToSegment(labAt(evidence.labs, neighbor), first.evidence.meanColor, second.evidence.meanColor) > 0.08) continue
					pairVisited[neighbor] = 1
					queue[queueLength++] = neighbor
				}
			}
			if (reachedSecond / second.pixelIndexes.length < 0.25) continue
			let borderPixels = 0
			let quadrants = 0
			let sumX = 0
			let sumY = 0
			let sumL = 0
			let sumA = 0
			let sumB = 0
			let transitionPixels = 0
			let transitionQuadrants = 0
			const cornerCounts = [0, 0, 0, 0]
			const familyPopulations = new Map<string, number>()
			const componentIds = new Set([
				...first.evidence.componentIds,
				...second.evidence.componentIds,
			])
			for (let index = 0; index < queueLength; index++) {
				const pixelIndex = queue[index]
				const x = pixelIndex % evidence.width
				const y = Math.floor(pixelIndex / evidence.width)
				const lab = labAt(evidence.labs, pixelIndex)
				const family = evidence.families[evidence.familyAt[pixelIndex]]
				familyPopulations.set(family.id, (familyPopulations.get(family.id) ?? 0) + 1)
				const transitionAmount = segmentAmount(lab, first.evidence.meanColor, second.evidence.meanColor)
				if (transitionAmount >= 0.15 && transitionAmount <= 0.85) {
					transitionPixels += 1
					transitionQuadrants |= 1 << ((x >= evidence.width / 2 ? 1 : 0) + (y >= evidence.height / 2 ? 2 : 0))
				}
				sumX += x / Math.max(1, evidence.width - 1)
				sumY += y / Math.max(1, evidence.height - 1)
				sumL += lab[0]
				sumA += lab[1]
				sumB += lab[2]
				if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
				quadrants |= 1 << ((x >= evidence.width / 2 ? 1 : 0) + (y >= evidence.height / 2 ? 2 : 0))
				if (x < cornerWidth && y < cornerHeight) cornerCounts[0] += 1
				if (x >= evidence.width - cornerWidth && y < cornerHeight) cornerCounts[1] += 1
				if (x < cornerWidth && y >= evidence.height - cornerHeight) cornerCounts[2] += 1
				if (x >= evidence.width - cornerWidth && y >= evidence.height - cornerHeight) cornerCounts[3] += 1
			}
			const populationFraction = queueLength / evidence.pixelCount
			const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
			const borderCoverage = clamp(borderPixels / perimeter)
			const ownedCornerCount = cornerCounts.filter((count) => count >= cornerPopulation * 0.5).length
			const quadrantCoverage = ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) +
				(quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4
			const weightedFieldScore = (
				first.evidence.weightedFieldScore * first.evidence.population +
				second.evidence.weightedFieldScore * second.evidence.population
			) / (first.evidence.population + second.evidence.population)
			const transitionFamilyCount = [...familyPopulations.entries()].filter(([familyId, population]) => {
				const prototype = familyById(evidence, familyId).prototype
				const amount = segmentAmount(prototype, first.evidence.meanColor, second.evidence.meanColor)
				return amount >= 0.15 && amount <= 0.85 &&
					population / queueLength >= 0.002 &&
					distanceToSegment(prototype, first.evidence.meanColor, second.evidence.meanColor) <= 0.08
			}).length
			const transitionQuadrantCoverage = ((transitionQuadrants & 1 ? 1 : 0) + (transitionQuadrants & 2 ? 1 : 0) +
				(transitionQuadrants & 4 ? 1 : 0) + (transitionQuadrants & 8 ? 1 : 0)) / 4
			const rejectionReasons: string[] = []
			if (populationFraction < 0.2) rejectionReasons.push("paired field corridor population below 0.20")
			if (borderCoverage < 0.2) rejectionReasons.push("paired field corridor border coverage below 0.20")
			if (quadrantCoverage < 0.75) rejectionReasons.push("paired field corridor covers fewer than three quadrants")
			if (ownedCornerCount < 1) rejectionReasons.push("paired field corridor owns no native corner field")
			if (weightedFieldScore < 0.35) rejectionReasons.push("paired field corridor weighted field score below 0.35")
			if (transitionFamilyCount < 3) rejectionReasons.push("paired field corridor has fewer than three supported intermediate families")
			const sourceDomainIds = [first.evidence.id, second.evidence.id].sort(compareAscii)
			const domainEvidence: BackgroundFieldDomainEvidence = {
				id: `paired-field-domain:${sourceDomainIds.join("+")}`,
				kind: "paired-corridor",
				sourceDomainIds,
				startPixelIndex: Math.min(first.evidence.startPixelIndex, second.evidence.startPixelIndex),
				population: queueLength,
				populationFraction,
				borderPixels,
				borderCoverage,
				quadrantCoverage,
				ownedCornerCount,
				weightedFieldScore,
				centroid: [sumX / queueLength, sumY / queueLength],
				meanColor: [sumL / queueLength, sumA / queueLength, sumB / queueLength],
				transitionFamilyCount,
				transitionPopulationFraction: transitionPixels / queueLength,
				transitionQuadrantCoverage,
				familyIds: [...familyPopulations.keys()].sort(compareAscii),
				componentIds: [...componentIds].sort(compareAscii),
				eligible: rejectionReasons.length === 0,
				rejectionReasons,
			}
			domains.push({ evidence: domainEvidence, pixelIndexes: Uint32Array.from(queue.subarray(0, queueLength)) })
		}
	}
	return domains.sort((first, second) =>
		compareNumbersDescending(first.evidence.population, second.evidence.population) ||
		compareNumbersDescending(first.evidence.borderCoverage, second.evidence.borderCoverage) ||
		compareAscii(first.evidence.id, second.evidence.id))
}

function gradientPosition(
	topology: GradientTopology,
	direction: GradientFieldEvidence["direction"],
): (x: number, y: number) => number {
	if (topology === "radial-center") return (x, y) => clamp(Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2)
	if (topology === "radial-upper-center") return (x, y) => clamp(Math.hypot(x - 0.5, y - 0.35) / 0.82)
	if (direction === "horizontal") return (x) => x
	if (direction === "vertical") return (_x, y) => y
	if (direction === "diagonal-down") return (x, y) => (x + y) / 2
	return (x, y) => (x + 1 - y) / 2
}

function fitGradients(evidence: NativePaletteEvidence, domains: readonly BackgroundFieldDomain[]): GradientFit[] {
	type Cell = { count: number; sum: [number, number, number]; sumSquares: number; sumX: number; sumY: number }
	const definitions: Array<Readonly<{
		topology: GradientTopology
		direction: GradientFieldEvidence["direction"]
	}>> = [
		{ topology: "linear", direction: "horizontal" },
		{ topology: "linear", direction: "vertical" },
		{ topology: "linear", direction: "diagonal-down" },
		{ topology: "linear", direction: "diagonal-up" },
		{ topology: "radial-center", direction: "center-out" },
		{ topology: "radial-upper-center", direction: "center-out" },
	]
	const fits: GradientFit[] = []
	for (const domain of domains.filter(({ evidence: domainEvidence }) => domainEvidence.eligible)
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldDomains)) {
		const cells: Cell[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => ({
			count: 0,
			sum: [0, 0, 0],
			sumSquares: 0,
			sumX: 0,
			sumY: 0,
		}))
		for (const pixelIndex of domain.pixelIndexes) {
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const gridX = Math.min(GRID_SIZE - 1, Math.floor(x * GRID_SIZE / evidence.width))
			const gridY = Math.min(GRID_SIZE - 1, Math.floor(y * GRID_SIZE / evidence.height))
			const cell = cells[gridY * GRID_SIZE + gridX]
			const lab = labAt(evidence.labs, pixelIndex)
			cell.count += 1
			cell.sum[0] += lab[0]
			cell.sum[1] += lab[1]
			cell.sum[2] += lab[2]
			cell.sumSquares += lab[0] ** 2 + lab[1] ** 2 + lab[2] ** 2
			cell.sumX += x / Math.max(1, evidence.width - 1)
			cell.sumY += y / Math.max(1, evidence.height - 1)
		}
		const observations = cells.filter(({ count }) => count > 0).map((cell) => {
			const value: OKLab = [cell.sum[0] / cell.count, cell.sum[1] / cell.count, cell.sum[2] / cell.count]
			return {
				x: cell.sumX / cell.count,
				y: cell.sumY / cell.count,
				value,
				texture: Math.sqrt(Math.max(0, cell.sumSquares / cell.count - value[0] ** 2 - value[1] ** 2 - value[2] ** 2)),
				weight: cell.count,
			}
		})
		if (observations.length < GRID_SIZE) continue
		for (const definition of definitions) {
			const rawPosition = gradientPosition(definition.topology, definition.direction)
			const rawValues = observations.map(({ x, y }) => rawPosition(x, y))
			const minimumT = Math.min(...rawValues)
			const maximumT = Math.max(...rawValues)
			if (maximumT - minimumT < 0.25) continue
			const position = (x: number, y: number): number => clamp((rawPosition(x, y) - minimumT) / (maximumT - minimumT))
			const positioned = observations.map((observation) => ({ ...observation, t: position(observation.x, observation.y) }))
			const totalWeight = positioned.reduce((sum, { weight }) => sum + weight, 0)
			const weightedMean = (values: readonly number[]): number =>
				values.reduce((sum, value, index) => sum + value * positioned[index].weight, 0) / totalWeight
			const meanT = weightedMean(positioned.map(({ t }) => t))
			const varianceT = weightedMean(positioned.map(({ t }) => (t - meanT) ** 2))
			const meanValue: OKLab = [
				weightedMean(positioned.map(({ value }) => value[0])),
				weightedMean(positioned.map(({ value }) => value[1])),
				weightedMean(positioned.map(({ value }) => value[2])),
			]
			const slope: OKLab = [0, 1, 2].map((channel) =>
				weightedMean(positioned.map(({ t, value }) => (t - meanT) * (value[channel] - meanValue[channel]))) / Math.max(1e-12, varianceT),
			) as unknown as OKLab
			const intercept: OKLab = [
				meanValue[0] - slope[0] * meanT,
				meanValue[1] - slope[1] * meanT,
				meanValue[2] - slope[2] * meanT,
			]
			const span = Math.hypot(slope[0], slope[1], slope[2])
			if (span < 1e-8) continue
			const residual = Math.sqrt(weightedMean(positioned.map(({ t, value }) => {
				const predicted: OKLab = [intercept[0] + slope[0] * t, intercept[1] + slope[1] * t, intercept[2] + slope[2] * t]
				return okDistance(value, predicted) ** 2
			})))
			const unit: OKLab = [slope[0] / span, slope[1] / span, slope[2] / span]
			const bands = Array.from({ length: GRID_SIZE }, () => ({ sum: 0, weight: 0 }))
			for (const { t, value, weight } of positioned) {
				const band = Math.min(GRID_SIZE - 1, Math.floor(t * GRID_SIZE))
				bands[band].sum += (value[0] * unit[0] + value[1] * unit[1] + value[2] * unit[2]) * weight
				bands[band].weight += weight
			}
			const bandValues = bands.map(({ sum, weight }) => weight === 0 ? null : sum / weight)
			let monotonicTransitions = 0
			let progressiveTransitions = 0
			for (let index = 1; index < bandValues.length; index++) {
				if (bandValues[index] === null || bandValues[index - 1] === null) continue
				const delta = bandValues[index]! - bandValues[index - 1]!
				if (delta >= -span * 0.03) monotonicTransitions += 1
				if (delta > span * 0.025) progressiveTransitions += 1
			}
			const monotonicity = monotonicTransitions / (GRID_SIZE - 1)
			const progression = progressiveTransitions / (GRID_SIZE - 1)
			const texture = weightedMean(positioned.map(({ texture: value }) => value))
			const residualScore = 1 - clamp(residual / Math.max(0.001, span * 0.75))
			const spanScore = clamp((span - 0.06) / 0.18)
			const textureScore = 1 - clamp(texture / 0.1)
			const score = clamp(0.28 * monotonicity + 0.25 * progression + 0.25 * residualScore + 0.12 * spanScore + 0.10 * textureScore)
			fits.push({ domain, ...definition, position, intercept, slope, span, residual, progression, monotonicity, texture, score })
		}
	}
	return fits.sort((first, second) =>
		compareNumbersDescending(first.score, second.score) ||
		compareAscii(`${first.domain.evidence.id}:${first.topology}:${first.direction}`, `${second.domain.evidence.id}:${second.topology}:${second.direction}`))
}

function endpointBandRepresentatives(
	evidence: NativePaletteEvidence,
	fit: GradientFit,
	lowBand: boolean,
): BandEndpoint[] {
	const counts = new Uint32Array(evidence.families.length)
	let bandPopulation = 0
	for (const pixelIndex of fit.domain.pixelIndexes) {
		const x = (pixelIndex % evidence.width) / Math.max(1, evidence.width - 1)
		const y = Math.floor(pixelIndex / evidence.width) / Math.max(1, evidence.height - 1)
		const position = fit.position(x, y)
		if ((lowBand && position <= 0.2) || (!lowBand && position >= 0.8)) {
			counts[evidence.familyAt[pixelIndex]] += 1
			bandPopulation += 1
		}
	}
	const endpointPosition = lowBand ? 0.1 : 0.9
	const expected: OKLab = [
		fit.intercept[0] + fit.slope[0] * endpointPosition,
		fit.intercept[1] + fit.slope[1] * endpointPosition,
		fit.intercept[2] + fit.slope[2] * endpointPosition,
	]
	const selected = evidence.families
		.map((family, index) => ({
			family,
			score: 0.52 * clamp(counts[index] / Math.max(1, bandPopulation) / 0.18) +
				0.28 * family.fieldScore +
				0.20 * (1 - clamp(okDistance(family.prototype, expected) / 0.16)),
			count: counts[index],
		}))
		.filter(({ count }) => count / Math.max(1, bandPopulation) >= 0.015)
		.sort((first, second) =>
			compareNumbersDescending(first.score, second.score) ||
			compareNumbersDescending(first.count, second.count) ||
			compareAscii(first.family.id, second.family.id))
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.gradientEndpointFamiliesPerBand)
	return selected.flatMap(({ family, count }) => {
		let exemplarIndex = -1
		let exemplarDistance = Infinity
		for (const pixelIndex of fit.domain.pixelIndexes) {
			if (evidence.families[evidence.familyAt[pixelIndex]].id !== family.id) continue
			const x = (pixelIndex % evidence.width) / Math.max(1, evidence.width - 1)
			const y = Math.floor(pixelIndex / evidence.width) / Math.max(1, evidence.height - 1)
			const position = fit.position(x, y)
			if (!((lowBand && position <= 0.2) || (!lowBand && position >= 0.8))) continue
			const distance = okDistance(labAt(evidence.labs, pixelIndex), expected)
			if (distance < exemplarDistance) {
				exemplarDistance = distance
				exemplarIndex = pixelIndex
			}
		}
		if (exemplarIndex < 0) return []
		const baseSupport = family.representatives.find(({ support }) => !("generated" in support))?.support
		if (!baseSupport || "generated" in baseSupport) return []
		const rgb = rgbAt(evidence.rgbData, exemplarIndex)
		const oklab = labAt(evidence.labs, exemplarIndex)
		return [{
			family,
			bandShare: count / Math.max(1, bandPopulation),
			representative: {
				strategy: "dense-exact" as const,
				rgb,
				oklab,
				hex: rgbToHex(rgb),
				support: {
					...baseSupport,
					exactSource: true,
					exemplar: { x: exemplarIndex % evidence.width, y: Math.floor(exemplarIndex / evidence.width) },
					prototypeDistance: exemplarDistance,
					synthesis: null,
				},
			},
		}]
	})
}

function nativeBandEvidence(evidence: NativePaletteEvidence, fit: GradientFit): Readonly<{
	progression: number
	modeProgression: number
	dispersion: number
	edgeContinuity: number
}> {
	const bands = Array.from({ length: GRID_SIZE }, () => ({ sum: 0, sumSquares: 0, count: 0, modes: new Map<number, number>() }))
	const unit: OKLab = [fit.slope[0] / fit.span, fit.slope[1] / fit.span, fit.slope[2] / fit.span]
	const domainMembership = new Uint8Array(evidence.pixelCount)
	for (const pixelIndex of fit.domain.pixelIndexes) domainMembership[pixelIndex] = 1
	let totalProgressiveEdgeChange = 0
	let jumpProgressiveEdgeChange = 0
	for (const pixelIndex of fit.domain.pixelIndexes) {
		const x = (pixelIndex % evidence.width) / Math.max(1, evidence.width - 1)
		const y = Math.floor(pixelIndex / evidence.width) / Math.max(1, evidence.height - 1)
		const bandIndex = Math.min(GRID_SIZE - 1, Math.floor(fit.position(x, y) * GRID_SIZE))
		const lab = labAt(evidence.labs, pixelIndex)
		const projected = lab[0] * unit[0] + lab[1] * unit[1] + lab[2] * unit[2]
		bands[bandIndex].sum += projected
		bands[bandIndex].sumSquares += projected * projected
		bands[bandIndex].count += 1
		const modeKey = evidence.familyAt[pixelIndex] * 16_384 + quantizedKey(lab)
		bands[bandIndex].modes.set(modeKey, (bands[bandIndex].modes.get(modeKey) ?? 0) + 1)
		const pixelX = pixelIndex % evidence.width
		const neighbors = [
			pixelX + 1 < evidence.width ? pixelIndex + 1 : -1,
			pixelIndex + evidence.width < evidence.pixelCount ? pixelIndex + evidence.width : -1,
		]
		for (const neighbor of neighbors) {
			if (neighbor < 0 || !domainMembership[neighbor]) continue
			const neighborX = (neighbor % evidence.width) / Math.max(1, evidence.width - 1)
			const neighborY = Math.floor(neighbor / evidence.width) / Math.max(1, evidence.height - 1)
			const positionDelta = fit.position(neighborX, neighborY) - fit.position(x, y)
			if (Math.abs(positionDelta) < 1e-8) continue
			const neighborLab = labAt(evidence.labs, neighbor)
			const projectedDelta = (
				(neighborLab[0] - lab[0]) * unit[0] +
				(neighborLab[1] - lab[1]) * unit[1] +
				(neighborLab[2] - lab[2]) * unit[2]
			) * Math.sign(positionDelta)
			if (projectedDelta <= 0) continue
			totalProgressiveEdgeChange += projectedDelta
			if (okDistance(lab, neighborLab) > FAMILY_BIN_STEP) jumpProgressiveEdgeChange += projectedDelta
		}
	}
	let progressiveTransitions = 0
	for (let index = 1; index < bands.length; index++) {
		if (bands[index].count === 0 || bands[index - 1].count === 0) continue
		const delta = bands[index].sum / bands[index].count - bands[index - 1].sum / bands[index - 1].count
		if (delta > fit.span * 0.025) progressiveTransitions += 1
	}
	const populated = bands.filter(({ count }) => count > 0)
	const populatedCount = populated.reduce((sum, { count }) => sum + count, 0)
	const variance = populated.reduce((sum, band) => {
		const bandMean = band.sum / band.count
		return sum + Math.max(0, band.sumSquares / band.count - bandMean * bandMean) * band.count
	}, 0) / Math.max(1, populatedCount)
	const dominantModes = bands.map(({ modes }) => [...modes.entries()]
		.sort((first, second) => compareNumbersDescending(first[1], second[1]) || first[0] - second[0])[0]?.[0] ?? -1)
	let modeTransitions = 0
	for (let index = 1; index < dominantModes.length; index++) {
		if (dominantModes[index] >= 0 && dominantModes[index - 1] >= 0 && dominantModes[index] !== dominantModes[index - 1]) {
			modeTransitions += 1
		}
	}
	return {
		progression: progressiveTransitions / (GRID_SIZE - 1),
		modeProgression: modeTransitions / (GRID_SIZE - 1),
		dispersion: Math.sqrt(variance) / Math.max(1e-8, fit.span),
		edgeContinuity: totalProgressiveEdgeChange <= 1e-8
			? 0
			: clamp(1 - jumpProgressiveEdgeChange / totalProgressiveEdgeChange),
	}
}

function evaluateGradientFits(evidence: NativePaletteEvidence, domains: readonly BackgroundFieldDomain[]): EvaluatedGradientFit[] {
	return fitGradients(evidence, domains).flatMap((fit): EvaluatedGradientFit[] => {
		const nativeBands = nativeBandEvidence(evidence, fit)
		const progression = Math.min(fit.progression, nativeBands.progression)
		const modeProgression = nativeBands.modeProgression
		const bandDispersion = nativeBands.dispersion
		const edgeContinuity = nativeBands.edgeContinuity
		const lows = endpointBandRepresentatives(evidence, fit, true)
		const highs = endpointBandRepresentatives(evidence, fit, false)
		const endpointPairs: Array<readonly [BandEndpoint | null, BandEndpoint | null]> = lows.length > 0 && highs.length > 0
			? lows.flatMap((low) => highs.map((high) => [low, high] as const))
			: [[lows[0] ?? null, highs[0] ?? null]]
		return endpointPairs.map(([low, high]) => {
			const rejectionReasons: string[] = []
			if (fit.span < 0.06) rejectionReasons.push("transition span below 0.06 OKLab")
			if (progression < 0.27) rejectionReasons.push("native continuous progression below 0.27")
			if (fit.monotonicity < 0.54) rejectionReasons.push("spatial monotonicity below 0.54")
			if (fit.residual > fit.span * 0.9) rejectionReasons.push("fit residual exceeds 0.9 of transition span")
			if (fit.texture > 0.14 && (fit.score < 0.65 || progression < 0.45)) {
				rejectionReasons.push("high within-cell texture lacks compensating transition evidence")
			}
			if (fit.domain.evidence.kind === "paired-corridor" &&
				progression < 0.8 && fit.domain.evidence.transitionPopulationFraction < 0.3) {
				rejectionReasons.push("paired field corridor lacks broad native transition continuity")
			}
			if (fit.score < 0.45) rejectionReasons.push("combined transition evidence below 0.45")
			if (!low || !high) rejectionReasons.push("one or both endpoint bands lack supported representatives")
			if (low && high && low.family.id === high.family.id && bandDispersion > 0.16) {
				rejectionReasons.push("same-family native within-band dispersion exceeds 0.16 of transition span")
			}
			if (low && high && fit.domain.evidence.kind === "connected" && low.family.id !== high.family.id && modeProgression < 0.27) {
				rejectionReasons.push("cross-family native mode progression below 0.27")
			}
			if (low && high && (
				sameColor(low.representative.rgb, high.representative.rgb) ||
				okDistance(low.representative.oklab, high.representative.oklab) < 0.028
			)) rejectionReasons.push("endpoint representatives are not materially distinct")
			return { fit, progression, modeProgression, bandDispersion, edgeContinuity, low, high, rejectionReasons }
		})
	})
}

function gradientFitDiagnostics(evaluatedFits: readonly EvaluatedGradientFit[]): GradientFitDiagnostic[] {
	return evaluatedFits.map(({ fit, progression, modeProgression, bandDispersion, edgeContinuity, low, high, rejectionReasons }) => ({
		topology: fit.topology,
		direction: fit.direction,
		span: fit.span,
		progression,
		modeProgression,
		monotonicity: fit.monotonicity,
		residual: fit.residual,
		texture: fit.texture,
		bandDispersion,
		edgeContinuity,
		score: fit.score,
		lowEndpointFamilyId: low?.family.id ?? null,
		highEndpointFamilyId: high?.family.id ?? null,
		endpointHexes: low && high ? [low.representative.hex, high.representative.hex] : null,
		fieldDomainId: fit.domain.evidence.id,
		fieldDomainPopulationFraction: fit.domain.evidence.populationFraction,
		rejectionReasons,
	}))
}

export function diagnoseGradientFits(evidence: NativePaletteEvidence): GradientFitDiagnostic[] {
	const domains = buildBackgroundFieldDomains(evidence)
	return gradientFitDiagnostics(evaluateGradientFits(evidence, domains))
}

function buildFieldHypothesisProposalsFromEvaluatedFits(
	evidence: NativePaletteEvidence,
	evaluatedGradientFits: readonly EvaluatedGradientFit[],
	scope: "control" | "all",
): FieldHypothesis[] {
	const fieldLaneIds = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const fieldFamilies = fieldLaneIds.map((id) => familyById(evidence, id))
	const hypotheses: FieldHypothesis[] = []
	for (const family of fieldFamilies.slice(0, scope === "control" ? 5 : fieldFamilies.length)) {
		hypotheses.push({
			id: `one:${family.id}`,
			kind: "one-field",
			backgroundFamilyId: family.id,
			surfaceFamilyId: null,
			backgroundRepresentatives: family.representatives,
			surfaceRepresentatives: family.representatives,
			fieldFidelity: family.fieldScore,
			surfaceContribution: 0,
			spatialRelation: null,
			roleAssignment: null,
			gradientEvidence: null,
			pruningNotes: ["surface collapsed because this hypothesis represents one broad field"],
		})
	}

	const flatCandidates: FieldHypothesis[] = []
	const flatFieldOwnership = (family: ColorFamilyEvidence): number => {
		const largest = family.components[0]?.observation
		const distributed = (0.45 * clamp(family.spatialSpread / 0.6) +
			0.30 * family.quadrantCoverage +
			0.25 * clamp(family.borderCoverage / 0.2)) * Math.sqrt(1 - family.familyConcentration)
		const resolvedLayer = largest === undefined
			? 0
			: Math.sqrt(
				clamp(largest.boundsFraction / 0.12) *
				clamp((largest.fill - 0.45) / 0.4),
			)
		return clamp(Math.max(distributed, resolvedLayer))
	}
	const flatFamilyCount = scope === "control" ? Math.min(8, fieldFamilies.length) : fieldFamilies.length
	for (let firstIndex = 0; firstIndex < flatFamilyCount; firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < flatFamilyCount; secondIndex++) {
			const first = fieldFamilies[firstIndex]
			const second = fieldFamilies[secondIndex]
			const distance = okDistance(first.prototype, second.prototype)
			if (distance < 0.055) continue
			const centroidDistance = Math.hypot(first.centroid[0] - second.centroid[0], first.centroid[1] - second.centroid[1])
			const separation = clamp(centroidDistance / 0.55)
			const borderInterior = clamp(Math.abs(first.borderCoverage - second.borderCoverage) + Math.abs(first.centerCoverage - second.centerCoverage)) / 2
			const coverage = Math.min(clamp(first.populationFraction / 0.04), clamp(second.populationFraction / 0.04))
			const sharedBoundary = evidence.adjacencies.find((candidate) =>
				candidate.firstFamilyId === first.id && candidate.secondFamilyId === second.id ||
				candidate.firstFamilyId === second.id && candidate.secondFamilyId === first.id)
			const adjacency = sharedBoundary === undefined
				? 0
				: clamp(sharedBoundary.boundaryEdges / Math.max(1, 2 * Math.sqrt(Math.min(first.population, second.population))))
			const roleAssignment = assignFieldRoles(first, second)
			const background = roleAssignment.backgroundFamilyId === first.id ? first : second
			const surface = background === first ? second : first
			const fieldOwnership = flatFieldOwnership(surface)
			if (fieldOwnership < 0.45) continue
			const relationScore = 0.35 * adjacency + 0.25 * borderInterior + 0.20 * separation + 0.20 * coverage
			if (relationScore < 0.31 || (adjacency < 0.12 && borderInterior < 0.18 && separation < 0.3)) continue
			const fieldFidelity = clamp(
				0.35 * background.fieldScore +
				0.10 * surface.fieldScore +
				0.25 * relationScore +
				0.30 * fieldOwnership,
			)
			flatCandidates.push({
				id: `flat:${background.id}:${surface.id}`,
				kind: "separate-flat-fields",
				backgroundFamilyId: background.id,
				surfaceFamilyId: surface.id,
				backgroundRepresentatives: background.representatives,
				surfaceRepresentatives: surface.representatives,
				fieldFidelity,
				surfaceContribution: clamp(0.4 * relationScore + 0.25 * clamp(distance / 0.18) + 0.15 * surface.fieldScore + 0.2 * fieldOwnership),
				spatialRelation: { adjacency, borderInterior, separation, coverage, fieldOwnership },
				roleAssignment,
				gradientEvidence: null,
				pruningNotes: ["retained from adjacency, border/interior, coverage, spatial separation, and component-backed field ownership"],
			})
		}
	}
	flatCandidates.sort((first, second) => compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
	hypotheses.push(...flatCandidates)

	const gradientCandidates: FieldHypothesis[] = []
	for (const { fit, progression, modeProgression, bandDispersion, edgeContinuity, low, high, rejectionReasons } of evaluatedGradientFits) {
		if (rejectionReasons.length > 0 || !low || !high) continue
		const roleAssignment = assignFieldRoles(low.family, high.family)
		const backgroundEndpoint = roleAssignment.backgroundFamilyId === low.family.id ? low : high
		const surfaceEndpoint = backgroundEndpoint === low ? high : low
		const gradientEvidence: GradientFieldEvidence = {
			topology: fit.topology,
			direction: fit.direction,
			endpointBands: [0.2, 0.8],
			progression,
			modeProgression,
			monotonicity: fit.monotonicity,
			residual: fit.residual,
			span: fit.span,
			texture: fit.texture,
			bandDispersion,
			edgeContinuity,
			coverage: clamp(1 - fit.residual / Math.max(0.001, fit.span)),
			supportingFamilyIds: [low.family.id, high.family.id],
			supportingEndpointHexes: [low.representative.hex, high.representative.hex],
			backgroundTopologyEndpoint: backgroundEndpoint === low ? "low" : "high",
			roleAssignment,
			fieldDomainId: fit.domain.evidence.id,
			fieldDomainPopulationFraction: fit.domain.evidence.populationFraction,
			fieldDomainBorderCoverage: fit.domain.evidence.borderCoverage,
			fieldDomainOwnedCornerCount: fit.domain.evidence.ownedCornerCount,
			supportingComponentIds: fit.domain.evidence.componentIds,
		}
		const backgroundRepresentatives = [backgroundEndpoint.representative, ...backgroundEndpoint.family.representatives]
			.filter((representative, index, values) => values.findIndex(({ rgb }) => sameColor(rgb, representative.rgb)) === index)
		const surfaceRepresentatives = [surfaceEndpoint.representative, ...surfaceEndpoint.family.representatives]
			.filter((representative, index, values) => values.findIndex(({ rgb }) => sameColor(rgb, representative.rgb)) === index)
		gradientCandidates.push({
			id: `gradient:${fit.domain.evidence.id}:${fit.topology}:${fit.direction}:${backgroundEndpoint.family.id}:${surfaceEndpoint.family.id}:${backgroundEndpoint.representative.hex}:${surfaceEndpoint.representative.hex}`,
			kind: "gradient-field",
			backgroundFamilyId: backgroundEndpoint.family.id,
			surfaceFamilyId: surfaceEndpoint.family.id,
			backgroundRepresentatives,
			surfaceRepresentatives,
			fieldFidelity: clamp(0.60 * fit.score + 0.30 * fit.domain.evidence.weightedFieldScore + 0.10 * Math.min(low.bandShare, high.bandShare) / 0.15),
			surfaceContribution: clamp(0.5 * progression + 0.3 * (1 - fit.residual / fit.span) + 0.2 * clamp(fit.span / 0.2)),
			spatialRelation: null,
			roleAssignment,
			gradientEvidence,
			pruningNotes: [`retained from connected background field ${fit.domain.evidence.id}; topology endpoints are role-oriented by ${roleAssignment.decisiveCriterion}`],
		})
	}
	gradientCandidates.sort((first, second) => compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
	hypotheses.push(...gradientCandidates)
	return hypotheses
		.sort((first, second) => compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
}

function retainFieldHypotheses(proposals: readonly FieldHypothesis[]): FieldHypothesis[] {
	const hypotheses = [
		...proposals.filter(({ kind }) => kind === "one-field").slice(0, 5),
		...proposals.filter(({ kind }) => kind === "separate-flat-fields").slice(0, 4),
	]
	let retainedGradients = 0
	for (const candidate of proposals.filter(({ kind }) => kind === "gradient-field")) {
		if (hypotheses.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldHypotheses || retainedGradients >= 3) break
		if (hypotheses.some(({ id }) => id === candidate.id)) continue
		hypotheses.push(candidate)
		retainedGradients += 1
	}

	return hypotheses
		.sort((first, second) => compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldHypotheses)
}

function buildFieldHypothesesFromEvaluatedFits(
	evidence: NativePaletteEvidence,
	evaluatedGradientFits: readonly EvaluatedGradientFit[],
): FieldHypothesis[] {
	return retainFieldHypotheses(buildFieldHypothesisProposalsFromEvaluatedFits(
		evidence,
		evaluatedGradientFits,
		"control",
	))
}

export function buildFieldHypotheses(evidence: NativePaletteEvidence): FieldHypothesis[] {
	const domains = buildBackgroundFieldDomains(evidence)
	return buildFieldHypothesesFromEvaluatedFits(evidence, evaluateGradientFits(evidence, domains))
}

function preferredRepresentatives(representatives: readonly ColorRepresentative[]): ColorRepresentative[] {
	const strategyOrder: Record<ColorRepresentative["strategy"], number> = {
		"dense-exact": 0,
		"nearest-prototype": 1,
		"density-synthesized": 2,
		"generated-emergency": 3,
	}
	return [...representatives]
		.sort((first, second) => strategyOrder[first.strategy] - strategyOrder[second.strategy])
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.representativesPerRole)
}

function allRepresentatives(representatives: readonly ColorRepresentative[]): ColorRepresentative[] {
	const preferred = preferredRepresentatives(representatives)
	return preferred.concat(representatives.filter((candidate) =>
		!preferred.some(({ rgb }) => sameColor(rgb, candidate.rgb))))
}

type FieldVariantOptions = Readonly<{
	representatives: "control" | "all"
	pairing: "same-index" | "cross-pair"
}>

function buildFieldVariants(
	hypotheses: readonly FieldHypothesis[],
	options: FieldVariantOptions = { representatives: "control", pairing: "same-index" },
): FieldVariant[] {
	const variants: FieldVariant[] = []
	for (const hypothesis of hypotheses) {
		const backgrounds = options.representatives === "all"
			? allRepresentatives(hypothesis.backgroundRepresentatives)
			: preferredRepresentatives(hypothesis.backgroundRepresentatives)
		const surfaces = hypothesis.surfaceFamilyId === null
			? backgrounds
			: options.representatives === "all"
				? allRepresentatives(hypothesis.surfaceRepresentatives)
				: preferredRepresentatives(hypothesis.surfaceRepresentatives)
		const pairs: Array<readonly [ColorRepresentative | undefined, ColorRepresentative | undefined]> =
			options.pairing === "cross-pair" && hypothesis.kind !== "one-field"
				? backgrounds.flatMap((background) => surfaces.map((surface) => [background, surface] as const))
				: Array.from(
					{ length: Math.min(backgrounds.length, surfaces.length, options.representatives === "control" ? 2 : Infinity) },
					(_value, strategyIndex) => [backgrounds[strategyIndex] ?? backgrounds[0], surfaces[strategyIndex] ?? surfaces[0]] as const,
				)
		for (const [background, surface] of pairs) {
			if (!background || !surface) continue
			if (hypothesis.kind !== "one-field" && sameColor(background.rgb, surface.rgb)) continue
			if (hypothesis.kind === "gradient-field" && okDistance(background.oklab, surface.oklab) < 0.028) continue
			variants.push({
				hypothesis,
				background,
				surface: hypothesis.kind === "one-field" ? background : surface,
				gradient: hypothesis.kind === "gradient-field",
				treatment: hypothesis.kind,
				fieldFidelity: hypothesis.fieldFidelity,
				surfaceContribution: hypothesis.surfaceContribution,
			})
			if (hypothesis.kind !== "one-field") {
				variants.push({
					hypothesis,
					background,
					surface: background,
					gradient: false,
					treatment: "one-field",
					fieldFidelity: clamp(hypothesis.fieldFidelity * (1 - hypothesis.surfaceContribution * 0.35)),
					surfaceContribution: hypothesis.surfaceContribution,
				})
			}
		}
	}
	const unique = new Map<string, FieldVariant>()
	for (const variant of variants) {
		const key = `${variant.treatment}:${canonicalColorKey(variant.background.rgb)}:${canonicalColorKey(variant.surface.rgb)}:${variant.gradient}`
		const incumbent = unique.get(key)
		if (!incumbent || variant.fieldFidelity > incumbent.fieldFidelity) unique.set(key, variant)
	}
	return [...unique.values()].sort((first, second) =>
		compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.hypothesis.id, second.hypothesis.id))
}

function buildIdentityObligationSelection(
	evidence: NativePaletteEvidence,
	hypotheses: readonly FieldHypothesis[],
): IdentityObligationSelection {
	const evaluatedSignatureFamilyIds = evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const fieldOwnedFamilyIds = new Set(evaluatedSignatureFamilyIds.filter((familyId) => {
		const family = familyById(evidence, familyId)
		return evidenceLevel(family.fieldScore) >= evidenceLevel(signatureRoleScore(family))
	}))
	const notSourceConnectedFamilyIds: string[] = []
	const notMateriallyDistinctFamilyIds: string[] = []
	const ranked: Array<Readonly<{
		family: ColorFamilyEvidence
		regionIds: readonly string[]
		connectedPopulationFraction: number
		materialDistanceFromField: number
		regionEvidenceLevel: number
	}>> = []
	const fieldFamilies = [...fieldOwnedFamilyIds].map((id) => familyById(evidence, id))

	for (const familyId of evaluatedSignatureFamilyIds) {
		if (fieldOwnedFamilyIds.has(familyId)) continue
		const family = familyById(evidence, familyId)
		const connectedRegions = family.components
			.filter(({ population, retainedFor }) => population > 1 && retainedFor.includes("role-observation"))
			.sort((first, second) =>
				compareNumbersDescending(first.observation.signatureAccent.score, second.observation.signatureAccent.score) ||
				compareNumbersDescending(first.population, second.population) ||
				first.startPixelIndex - second.startPixelIndex)
		if (connectedRegions.length === 0) {
			notSourceConnectedFamilyIds.push(family.id)
			continue
		}
		const materialDistanceFromField = fieldFamilies.length === 0
			? 1
			: Math.min(...fieldFamilies.map((fieldFamily) => okDistance(family.prototype, fieldFamily.prototype)))
		if (materialDistanceFromField < ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.materialDistance) {
			notMateriallyDistinctFamilyIds.push(family.id)
			continue
		}
		ranked.push({
			family,
			regionIds: connectedRegions.slice(0, 4).map(({ id }) => id),
			connectedPopulationFraction: connectedRegions[0].populationFraction,
			materialDistanceFromField,
			regionEvidenceLevel: evidenceLevel(connectedRegions[0].observation.signatureAccent.score),
		})
	}
	ranked.sort((first, second) =>
		compareNumbersDescending(first.regionEvidenceLevel, second.regionEvidenceLevel) ||
		compareNumbersDescending(evidenceLevel(signatureRoleScore(first.family)), evidenceLevel(signatureRoleScore(second.family))) ||
		compareNumbersDescending(first.connectedPopulationFraction, second.connectedPopulationFraction) ||
		compareAscii(first.family.id, second.family.id))

	const selected: typeof ranked = []
	const redundantDirectionFamilyIds: string[] = []
	const boundOmittedFamilyIds: string[] = []
	for (const candidate of ranked) {
		if (selected.some(({ family }) =>
			okDistance(family.prototype, candidate.family.prototype) < ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.materialDistance)) {
			redundantDirectionFamilyIds.push(candidate.family.id)
			continue
		}
		if (selected.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations) {
			boundOmittedFamilyIds.push(candidate.family.id)
			continue
		}
		selected.push(candidate)
	}
	return {
		obligations: selected.map((candidate, priority): IdentityObligation => ({
			id: `identity-obligation:${candidate.family.id}`,
			familyId: candidate.family.id,
			priority,
			source: {
				regionIds: candidate.regionIds,
				connectedPopulationFraction: candidate.connectedPopulationFraction,
				materialDistanceFromField: candidate.materialDistanceFromField,
				signatureRoleScore: signatureRoleScore(candidate.family),
				signatureEvidenceLevel: evidenceLevel(signatureRoleScore(candidate.family)),
				regionEvidenceLevel: candidate.regionEvidenceLevel,
			},
		})),
		trace: {
			maximumObligations: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations,
			evaluatedSignatureFamilyIds,
			fieldOwnedFamilyIds: [...fieldOwnedFamilyIds].sort(compareAscii),
			notSourceConnectedFamilyIds: notSourceConnectedFamilyIds.sort(compareAscii),
			notMateriallyDistinctFamilyIds: notMateriallyDistinctFamilyIds.sort(compareAscii),
			redundantDirectionFamilyIds: redundantDirectionFamilyIds.sort(compareAscii),
			boundOmittedFamilyIds: boundOmittedFamilyIds.sort(compareAscii),
		},
	}
}

export function fieldSamples(variant: Readonly<{
	background: Readonly<{ rgb: RGB; oklab: OKLab }>
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>
	gradient: boolean
}>): Array<Readonly<{ role: PairContrast["fieldRole"]; position: number; rgb: RGB }>> {
	if (variant.gradient) {
		return ALBUM_ARTWORK_PALETTE_V2_POLICY.gradient.contrastSamplePositions.map((position) => ({
			role: "gradient-sample" as const,
			position,
			rgb: oklabToRGB(mixOKLab(variant.background.oklab, variant.surface.oklab, position)),
		}))
	}
	const samples: Array<Readonly<{ role: PairContrast["fieldRole"]; position: number; rgb: RGB }>> = [
		{ role: "background", position: 0, rgb: variant.background.rgb },
	]
	if (!sameColor(variant.background.rgb, variant.surface.rgb)) {
		samples.push({ role: "surface", position: 1, rgb: variant.surface.rgb })
	}
	return samples
}

function measureContrast(
	variant: Pick<FieldVariant, "background" | "surface" | "gradient">,
	foreground: ColorRepresentative,
	accent: ColorRepresentative,
): ContrastDiagnostics {
	const pairs: PairContrast[] = []
	for (const sample of fieldSamples(variant)) {
		const foregroundLc = apcaContrast(foreground.rgb, sample.rgb)
		pairs.push({
			role: "foreground",
			fieldRole: sample.role,
			position: sample.position,
			signedLc: foregroundLc,
			absoluteLc: Math.abs(foregroundLc),
		})
		if (!sameColor(accent.rgb, foreground.rgb)) {
			const accentLc = apcaContrast(accent.rgb, sample.rgb)
			pairs.push({
				role: "accent",
				fieldRole: sample.role,
				position: sample.position,
				signedLc: accentLc,
				absoluteLc: Math.abs(accentLc),
			})
		}
	}
	const magnitudes = pairs.map(({ absoluteLc }) => absoluteLc)
	if (magnitudes.some((value) => !Number.isFinite(value))) throw new Error("APCA returned non-finite contrast")
	return {
		pairs,
		minimumAbsoluteLc: Math.min(...magnitudes),
		meanAbsoluteLc: mean(magnitudes),
	}
}

export function hasPeakAPCAObservability(values: readonly number[]): boolean {
	return values.some((value) => Number.isFinite(value) && value !== 0)
}

export function pathObservability(values: readonly number[]): number {
	if (values.length === 0) return 1
	return values.filter((value) => Number.isFinite(value) && value !== 0).length / values.length
}

function signedContrastPolarity(values: readonly number[]): number {
	const magnitude = values.reduce((sum, value) => sum + Math.abs(value), 0)
	return magnitude <= 1e-12 ? 0 : values.reduce((sum, value) => sum + value, 0) / magnitude
}

function foregroundPolarityAgreement(
	family: ColorFamilyEvidence,
	signedContrasts: readonly number[],
): number {
	const sourcePolarity = family.foregroundPolarityObservation.polarity * family.foregroundPolarityObservation.confidence
	const uiPolarity = signedContrastPolarity(signedContrasts)
	return clamp(1 - 0.5 * (Math.abs(sourcePolarity) - sourcePolarity * uiPolarity))
}

function emergencyEligibility(
	fieldVariants: readonly FieldVariant[],
	supportedRepresentatives: readonly ColorRepresentative[],
): EmergencyEligibility {
	let supportedPairCount = 0
	let maximumSupportedAbsoluteLc = 0
	for (const variant of fieldVariants) {
		for (const foreground of supportedRepresentatives) {
			if (sameColor(foreground.rgb, variant.background.rgb) || sameColor(foreground.rgb, variant.surface.rgb)) continue
			supportedPairCount += 1
			for (const sample of fieldSamples(variant)) {
				maximumSupportedAbsoluteLc = Math.max(maximumSupportedAbsoluteLc, Math.abs(apcaContrast(foreground.rgb, sample.rgb)))
			}
		}
	}
	const thresholdExclusive = ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyMaximumAbsoluteLc
	if (supportedPairCount === 0) {
		return {
			eligible: true,
			reason: "degenerate-supported-domain",
			supportedPairCount,
			maximumSupportedAbsoluteLc,
			thresholdExclusive,
		}
	}
	if (maximumSupportedAbsoluteLc < thresholdExclusive) {
		return {
			eligible: true,
			reason: "all-supported-pairs-effectively-contrastless",
			supportedPairCount,
			maximumSupportedAbsoluteLc,
			thresholdExclusive,
		}
	}
	return {
		eligible: false,
		reason: "not-eligible",
		supportedPairCount,
		maximumSupportedAbsoluteLc,
		thresholdExclusive,
	}
}

function generatedRepresentative(
	rgb: RGB,
	role: "background" | "foreground",
	emergency: EmergencyEligibility,
): ColorRepresentative {
	if (!emergency.eligible || emergency.reason === "not-eligible") throw new Error("Generated color is not eligible")
	return {
		strategy: "generated-emergency",
		rgb,
		oklab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		support: {
			generated: true,
			role,
			reason: emergency.reason,
			supportedPairCount: emergency.supportedPairCount,
			maximumSupportedAbsoluteLc: emergency.maximumSupportedAbsoluteLc,
			thresholdExclusive: emergency.thresholdExclusive,
			preferencePenalty: ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyGeneratedPenalty,
		},
	}
}

export function completeTreatmentKey(treatment: Pick<
	CompletePaletteTreatment,
	"background" | "surface" | "foreground" | "accent" | "gradient"
>): string {
	return [
		treatment.background.hex.toLowerCase(),
		treatment.surface.hex.toLowerCase(),
		treatment.foreground.hex.toLowerCase(),
		treatment.accent.hex.toLowerCase(),
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return completeTreatmentKey(treatment)
}

export function roleDirectionKeys(treatment: CompletePaletteTreatment): string[] {
	return [
		`foreground:${treatment.familyRoles.foreground}`,
		...treatment.collapse.accent ? [] : [`accent:${treatment.familyRoles.accent}`],
	]
}

export function qualifyRecallAuditTreatment(
	input: RecallAuditQualificationInput,
): RecallAuditTreatmentQualification {
	const treatmentKey = completeTreatmentKey(input.treatment)
	const controlTreatmentKeys = input.controlTreatmentKeys instanceof Set
		? input.controlTreatmentKeys
		: new Set(input.controlTreatmentKeys)
	const absentFromControl = !controlTreatmentKeys.has(treatmentKey)
	const reasons = [
		...absentFromControl ? [] : ["complete-treatment-key-present-in-control"],
		...input.sourceConnectedFullLineage ? [] : ["lineage-is-not-fully-source-connected"],
		...input.legalUnderUnchangedRules ? [] : ["fails-unchanged-treatment-legality"],
		...input.ordinaryParetoMember || input.completeDomainGuardPass
			? []
			: ["neither-ordinary-pareto-member-nor-complete-domain-non-inferior"],
		...input.fillsControlEmptyFieldRoleCell ? [] : ["does-not-fill-control-empty-field-role-cell"],
	]
	return {
		treatmentKey,
		absentFromControl,
		sourceConnectedFullLineage: input.sourceConnectedFullLineage,
		legalUnderUnchangedRules: input.legalUnderUnchangedRules,
		ordinaryParetoMember: input.ordinaryParetoMember,
		completeDomainGuardPass: input.completeDomainGuardPass,
		fillsControlEmptyFieldRoleCell: input.fillsControlEmptyFieldRoleCell,
		qualifies: reasons.length === 0,
		reasons,
	}
}

export function fieldDirectionKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.collapse.surface ? "=" : treatment.familyRoles.surface,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

export function completeDirectionKey(treatment: CompletePaletteTreatment): string {
	return [
		fieldDirectionKey(treatment),
		treatment.familyRoles.foreground,
		treatment.collapse.accent ? "=" : treatment.familyRoles.accent,
		treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
	].join(":")
}

export function visuallyNear(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	if (first.gradient !== second.gradient) return false
	return (["background", "surface", "foreground", "accent"] as const).every((role) =>
		okDistance(first[role].oklab, second[role].oklab) < 0.025)
}

function effectiveBlock(treatment: CompletePaletteTreatment, block: keyof CompletePaletteScores): number {
	return treatment.scores[block] - treatment.scores.generatedPenalty
}

export function evaluateIdentityQualityGuard(
	incumbent: CompletePaletteTreatment,
	challenger: CompletePaletteTreatment,
): IdentityQualityGuardEvaluation {
	const blocks = ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) => {
		const incumbentEvidenceLevel = evidenceLevel(effectiveBlock(incumbent, block))
		const challengerEvidenceLevel = evidenceLevel(effectiveBlock(challenger, block))
		return {
			block,
			incumbentEvidenceLevel,
			challengerEvidenceLevel,
			pass: challengerEvidenceLevel >= incumbentEvidenceLevel,
		}
	})
	const resolvedLosses = blocks.filter(({ pass }) => !pass).map(({
		block,
		incumbentEvidenceLevel,
		challengerEvidenceLevel,
	}) => ({
		block,
		incumbentEvidenceLevel,
		challengerEvidenceLevel,
		evidenceLevelLoss: incumbentEvidenceLevel - challengerEvidenceLevel,
	}))
	return {
		incumbentTreatmentId: incumbent.id,
		challengerTreatmentId: challenger.id,
		pass: resolvedLosses.length === 0,
		blocks,
		resolvedLosses,
	}
}

export function filterIdentityQualityGuardCandidates(
	incumbent: CompletePaletteTreatment,
	candidates: readonly CompletePaletteTreatment[],
): Readonly<{
	eligibleCandidates: readonly CompletePaletteTreatment[]
	evaluations: readonly IdentityQualityGuardEvaluation[]
}> {
	const evaluations = candidates.map((candidate) => evaluateIdentityQualityGuard(incumbent, candidate))
	return {
		eligibleCandidates: candidates.filter((_candidate, index) => evaluations[index].pass),
		evaluations,
	}
}

export function paretoDominates(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	let strictlyBetter = false
	for (const block of ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS) {
		const firstValue = evidenceLevel(effectiveBlock(first, block))
		const secondValue = evidenceLevel(effectiveBlock(second, block))
		if (firstValue < secondValue) return false
		if (firstValue > secondValue) strictlyBetter = true
	}
	return strictlyBetter
}

function compareParetoTreatments(first: CompletePaletteTreatment, second: CompletePaletteTreatment): number {
	for (const block of ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS) {
		const comparison = compareNumbersDescending(
			evidenceLevel(effectiveBlock(first, block)),
			evidenceLevel(effectiveBlock(second, block)),
		)
		if (comparison !== 0) return comparison
	}
	return compareAscii(first.id, second.id)
}

function treatmentCoversIdentityObligation(
	treatment: CompletePaletteTreatment,
	obligation: IdentityObligation,
): boolean {
	return treatment.familyRoles.foreground === obligation.familyId ||
		(!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId)
}

function coveredIdentityObligations(
	treatment: CompletePaletteTreatment,
	obligations: readonly IdentityObligation[],
): IdentityObligation[] {
	return obligations.filter((obligation) => treatmentCoversIdentityObligation(treatment, obligation))
}

function compareIdentityObligationCoverage(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
	obligations: readonly IdentityObligation[],
): number {
	const firstCovered = coveredIdentityObligations(first, obligations)
	const secondCovered = coveredIdentityObligations(second, obligations)
	const coverageComparison = compareNumbersDescending(firstCovered.length, secondCovered.length)
	if (coverageComparison !== 0) return coverageComparison
	for (const obligation of obligations) {
		const firstHas = treatmentCoversIdentityObligation(first, obligation)
		const secondHas = treatmentCoversIdentityObligation(second, obligation)
		if (firstHas !== secondHas) return firstHas ? -1 : 1
	}
	return 0
}

function compareIdentityTreatments(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
	obligations: readonly IdentityObligation[],
): number {
	const identityComparison = compareIdentityObligationCoverage(first, second, obligations)
	if (identityComparison !== 0) return identityComparison
	return compareParetoTreatments(first, second)
}

export function selectQualityGuardedIdentityChallenger(
	qualityIncumbent: CompletePaletteTreatment,
	candidates: readonly CompletePaletteTreatment[],
	obligations: readonly IdentityObligation[],
): Readonly<{
	identityChallengers: readonly CompletePaletteTreatment[]
	eligibleIdentityChallengers: readonly CompletePaletteTreatment[]
	selectedIdentityChallenger: CompletePaletteTreatment | null
	qualityGuardEvaluations: readonly IdentityQualityGuardEvaluation[]
}> {
	const identityChallengers = candidates.filter((treatment) =>
		compareIdentityObligationCoverage(treatment, qualityIncumbent, obligations) < 0)
	const {
		eligibleCandidates,
		evaluations: qualityGuardEvaluations,
	} = filterIdentityQualityGuardCandidates(qualityIncumbent, identityChallengers)
	const eligibleIdentityChallengers = [...eligibleCandidates]
		.sort((first, second) => compareIdentityTreatments(first, second, obligations))
	return {
		identityChallengers,
		eligibleIdentityChallengers,
		selectedIdentityChallenger: eligibleIdentityChallengers[0] ?? null,
		qualityGuardEvaluations,
	}
}

function retainRoleFamilyDirections<T extends Readonly<{ family: Readonly<{ id: string }> }>>(
	options: readonly T[],
	maximum: number,
	obligationFamilyIds: readonly string[] = [],
): T[] {
	const retained: T[] = []
	const familyIds = new Set<string>()
	for (const familyId of obligationFamilyIds) {
		const option = options.find(({ family }) => family.id === familyId)
		if (!option || familyIds.has(familyId)) continue
		retained.push(option)
		familyIds.add(familyId)
		if (retained.length >= maximum) return retained
	}
	for (const option of options) {
		if (familyIds.has(option.family.id)) continue
		retained.push(option)
		familyIds.add(option.family.id)
		if (retained.length >= maximum) break
	}
	return retained
}

export function retainPeakObservableFamilyDirections<
	T extends Readonly<{ family: Readonly<{ id: string }>; signedContrasts: readonly number[] }>,
>(
	options: readonly T[],
	maximum: number,
	obligationFamilyIds: readonly string[] = [],
): Readonly<{ retained: readonly T[]; rejectedCount: number }> {
	const observable = options.filter(({ signedContrasts }) => hasPeakAPCAObservability(signedContrasts))
	return {
		retained: retainRoleFamilyDirections(observable, maximum, obligationFamilyIds),
		rejectedCount: options.length - observable.length,
	}
}

export function paretoFrontier(treatments: readonly CompletePaletteTreatment[]): CompletePaletteTreatment[] {
	return treatments
		.filter((candidate, candidateIndex) => !treatments.some((other, otherIndex) =>
			otherIndex !== candidateIndex && paretoDominates(other, candidate)))
		.sort(compareParetoTreatments)
}

function buildIdentityObligationGraph(
	selection: IdentityObligationSelection,
	availableRolesByFamily: ReadonlyMap<string, ReadonlySet<"foreground" | "accent">>,
	completeTreatments: readonly CompletePaletteTreatment[],
	retentionFrontier: readonly CompletePaletteTreatment[],
	retainedSlate: readonly CompletePaletteTreatment[],
	winner: CompletePaletteTreatment,
	primaryWinner: CompletePaletteTreatment,
	qualityIncumbent: CompletePaletteTreatment,
	selectedIdentityChallenger: CompletePaletteTreatment | null,
	eligibleIdentityChallengers: readonly CompletePaletteTreatment[],
	selectionReason: IdentityWinnerSelectionReason,
): IdentityObligationGraph {
	const nodes: IdentityObligationNode[] = []
	const edges: IdentityObligationGraph["edges"][number][] = []
	const stages: readonly IdentityObligationStage[] = [
		"source-signature",
		"role-availability",
		"complete-treatment",
		"retention-frontier",
		"retained-slate",
		"winner-explanation",
	]
	const nodeId = (obligation: IdentityObligation, stage: IdentityObligationStage): string => `${obligation.id}:${stage}`
	const stageTreatments = (
		values: readonly CompletePaletteTreatment[],
		obligation: IdentityObligation,
	): CompletePaletteTreatment[] => values
		.filter((treatment) => treatmentCoversIdentityObligation(treatment, obligation))
		.sort((first, second) => compareIdentityTreatments(first, second, selection.obligations))
	const feasibleObligations = selection.obligations.filter((obligation) =>
		completeTreatments.some((treatment) => treatmentCoversIdentityObligation(treatment, obligation)))
	const winnerCovered = coveredIdentityObligations(winner, selection.obligations)
	const maximumCompleteTreatmentCoverage = completeTreatments.reduce((maximum, treatment) =>
		Math.max(maximum, coveredIdentityObligations(treatment, selection.obligations).length), 0)
	if (winnerCovered.length > maximumCompleteTreatmentCoverage) {
		throw new Error("Identity-obligation winner exceeds complete-treatment coverage")
	}
	if (selectedIdentityChallenger && !evaluateIdentityQualityGuard(qualityIncumbent, selectedIdentityChallenger).pass) {
		throw new Error("Selected identity challenger violates the quality guard")
	}
	if (selectedIdentityChallenger && !evaluateIdentityQualityGuard(qualityIncumbent, winner).pass) {
		throw new Error("Final identity-selected winner violates the quality guard")
	}
	const obligationDeferrals: IdentityObligationDeferral[] = []

	for (const obligation of selection.obligations) {
		const availableRoles = [...(availableRolesByFamily.get(obligation.familyId) ?? [])]
			.sort(compareAscii) as ("foreground" | "accent")[]
		const complete = stageTreatments(completeTreatments, obligation)
		const frontier = stageTreatments(retentionFrontier, obligation)
		const slate = stageTreatments(retainedSlate, obligation)
		if (availableRoles.length > 0 && complete.length === 0) {
			throw new Error(`Identity obligation ${obligation.id} was lost during complete-treatment construction`)
		}
		if (complete.length > 0 && availableRoles.length === 0) {
			throw new Error(`Identity obligation ${obligation.id} has a complete treatment without role availability`)
		}
		if (complete.length > 0 && frontier.length === 0) {
			throw new Error(`Identity obligation ${obligation.id} was lost during frontier retention`)
		}
		if (frontier.length > 0 && slate.length === 0) {
			throw new Error(`Identity obligation ${obligation.id} was lost during slate retention`)
		}
		const pushNode = (
			stage: IdentityObligationStage,
			status: IdentityObligationNode["status"],
			treatments: readonly CompletePaletteTreatment[],
			reason: string,
		): void => {
			nodes.push({
				id: nodeId(obligation, stage),
				obligationId: obligation.id,
				familyId: obligation.familyId,
				stage,
				status,
				availableRoles: stage === "role-availability" ? availableRoles : [],
				treatmentCount: treatments.length,
				treatmentIds: treatments.slice(0, 8).map(({ id }) => id),
				reason,
			})
		}
		pushNode("source-signature", "satisfied", [], "source-connected-materially-distinct-signature-evidence")
		pushNode(
			"role-availability",
			availableRoles.length > 0 ? "satisfied" : "blocked",
			[],
			availableRoles.length > 0
				? "peak-observable-obligation-role-available"
				: "no-legal-peak-observable-foreground-or-distinct-accent-role",
		)
		pushNode(
			"complete-treatment",
			complete.length > 0 ? "satisfied" : "blocked",
			complete,
			complete.length > 0 ? "obligation-carried-by-complete-treatment" : "blocked-at-role-availability",
		)
		pushNode(
			"retention-frontier",
			frontier.length > 0 ? "satisfied" : "blocked",
			frontier,
			frontier.length > 0 ? "obligation-stratified-frontier-representative-retained" : "no-complete-treatment-to-retain",
		)
		pushNode(
			"retained-slate",
			slate.length > 0 ? "satisfied" : "blocked",
			slate,
			slate.length > 0 ? "obligation-reserved-in-retained-slate" : "no-frontier-representative-to-retain",
		)
		const winnerHasObligation = treatmentCoversIdentityObligation(winner, obligation)
		const qualityEligibleCarriers = complete.filter((treatment) =>
			evaluateIdentityQualityGuard(qualityIncumbent, treatment).pass)
		const bestCarrier = complete.length === 0 ? null : [...complete].sort(compareParetoTreatments)[0]
		const bestCarrierGuard = bestCarrier === null ? null : evaluateIdentityQualityGuard(qualityIncumbent, bestCarrier)
		if (!winnerHasObligation && bestCarrier && bestCarrierGuard) {
			obligationDeferrals.push({
				obligationId: obligation.id,
				reason: qualityEligibleCarriers.length === 0
					? "all-complete-treatment-carriers-failed-quality-guard"
					: "quality-eligible-carrier-deferred-by-higher-obligation-coverage-or-priority",
				completeCarrierCount: complete.length,
				qualityEligibleCarrierCount: qualityEligibleCarriers.length,
				bestCarrierTreatmentId: bestCarrier.id,
				failedQualityGuardBlocks: bestCarrierGuard.blocks
					.filter(({ pass }) => !pass)
					.map(({ block }) => block),
			})
		}
		pushNode(
			"winner-explanation",
			winnerHasObligation ? "satisfied" : complete.length > 0 ? "deferred" : "blocked",
			winnerHasObligation ? [winner] : [],
			winnerHasObligation
				? "selected-winner-covers-obligation"
				: complete.length > 0
					? qualityEligibleCarriers.length === 0
						? "all-complete-treatment-carriers-failed-quality-guard"
						: "quality-eligible-carrier-deferred-by-higher-obligation-coverage-or-priority"
					: "obligation-infeasible-before-winner-selection",
		)
		for (let index = 1; index < stages.length; index++) {
			const destination = nodes.find((node) => node.id === nodeId(obligation, stages[index]))!
			edges.push({
				from: nodeId(obligation, stages[index - 1]),
				to: destination.id,
				carried: destination.status === "satisfied",
			})
		}
	}

	return {
		version: "identity-obligation-graph-v3",
		selection: selection.trace,
		obligations: selection.obligations,
		nodes,
		edges,
		winnerExplanation: {
			treatmentId: winner.id,
			primaryTreatmentId: primaryWinner.id,
			qualityIncumbentTreatmentId: qualityIncumbent.id,
			selectedIdentityChallengerTreatmentId: selectedIdentityChallenger?.id ?? null,
			selectionReason,
			feasibleObligationIds: feasibleObligations.map(({ id }) => id),
			coveredObligationIds: winnerCovered.map(({ id }) => id),
			deferredObligationIds: feasibleObligations
				.filter((obligation) => !treatmentCoversIdentityObligation(winner, obligation))
				.map(({ id }) => id),
			qualityDeferredObligationIds: obligationDeferrals
				.filter(({ reason }) => reason === "all-complete-treatment-carriers-failed-quality-guard")
				.map(({ obligationId }) => obligationId),
			priorityDeferredObligationIds: obligationDeferrals
				.filter(({ reason }) => reason === "quality-eligible-carrier-deferred-by-higher-obligation-coverage-or-priority")
				.map(({ obligationId }) => obligationId),
			obligationDeferrals,
			maximumCompleteTreatmentCoverage,
			eligibleIdentityChallengerCount: eligibleIdentityChallengers.length,
		},
	}
}

export function isExactOverlayGradientChallenger(
	primary: CompletePaletteTreatment,
	candidate: CompletePaletteTreatment,
): boolean {
	return !primary.gradient && !primary.collapse.accent && candidate.gradient && !candidate.collapse.accent &&
		candidate.gradientEvidence !== null &&
		sameColor(primary.foreground.rgb, candidate.foreground.rgb) && sameColor(primary.accent.rgb, candidate.accent.rgb) &&
		primary.familyRoles.foreground === candidate.familyRoles.foreground &&
		primary.familyRoles.accent === candidate.familyRoles.accent
}

export function selectExactOverlayGradientChallenger(
	primary: CompletePaletteTreatment,
	candidates: readonly CompletePaletteTreatment[],
): CompletePaletteTreatment | null {
	const primaryLevel = evidenceLevel(effectiveBlock(primary, "treatmentFoundation"))
	return [...candidates]
		.filter((candidate) => isExactOverlayGradientChallenger(primary, candidate) &&
			evidenceLevel(effectiveBlock(candidate, "treatmentFoundation")) >= primaryLevel - 1)
		.sort(compareParetoTreatments)[0] ?? null
}

export function treatmentFoundation(
	fieldStructure: number,
	artworkIdentity: number,
	foregroundUtility: number,
	activeRolePathObservability: number,
): number {
	return Math.cbrt(fieldStructure * artworkIdentity * foregroundUtility * activeRolePathObservability)
}

function validateTreatment(treatment: CompletePaletteTreatment): void {
	const surfaceCollapsed = sameColor(treatment.surface.rgb, treatment.background.rgb)
	const accentCollapsed = sameColor(treatment.accent.rgb, treatment.foreground.rgb)
	if (!surfaceCollapsed && (
		sameColor(treatment.surface.rgb, treatment.foreground.rgb) || sameColor(treatment.surface.rgb, treatment.accent.rgb)
	)) throw new Error("Surface has an illegal role equality")
	if (sameColor(treatment.background.rgb, treatment.foreground.rgb) || sameColor(treatment.background.rgb, treatment.accent.rgb)) {
		throw new Error("Background has an illegal role equality")
	}
	if (!accentCollapsed && sameColor(treatment.accent.rgb, treatment.surface.rgb)) throw new Error("Accent has an illegal role equality")
	if (surfaceCollapsed && treatment.gradient) throw new Error("A collapsed surface cannot form a gradient")
	if (treatment.gradient && surfaceCollapsed) throw new Error("Gradient requires a distinct surface")
	if (surfaceCollapsed !== treatment.collapse.surface || accentCollapsed !== treatment.collapse.accent) {
		throw new Error("Collapse diagnostics disagree with canonical equality")
	}
	if (!hasPeakAPCAObservability(treatment.contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ signedLc }) => signedLc))) {
		throw new Error("The required foreground is never outside APCA's zero-contrast dead-zone")
	}
	if (!accentCollapsed && !hasPeakAPCAObservability(treatment.contrast.pairs
		.filter(({ role }) => role === "accent")
		.map(({ signedLc }) => signedLc))) {
		throw new Error("A distinct accent is never outside APCA's zero-contrast dead-zone")
	}
	const distinct = new Set([treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex]).size
	if (distinct !== treatment.cardinality || distinct < 2 || distinct > 4) throw new Error("Treatment cardinality is invalid")
	const generated = [treatment.background, treatment.surface, treatment.foreground, treatment.accent].filter(({ generated }) => generated)
	const generatedHexes = new Set(generated.map(({ hex }) => hex))
	if (generatedHexes.size > 1 || generated.some(({ hex }) => hex !== "#000000" && hex !== "#ffffff")) {
		throw new Error("Emergency output contains an unsupported generated color")
	}
}

function createTreatment(
	variant: FieldVariant,
	foreground: ColorRepresentative,
	accent: ColorRepresentative,
	foregroundFamilyId: string | "generated",
	accentFamilyId: string | "generated",
	foregroundFamily: ColorFamilyEvidence | null,
	accentFamily: ColorFamilyEvidence | null,
	accentOpportunity: number,
	surfaceOpportunity: number,
): CompletePaletteTreatment | null {
	const background = variant.background
	const surface = variant.surface
	if (sameColor(background.rgb, foreground.rgb) || sameColor(surface.rgb, foreground.rgb)) return null
	const accentCollapsed = sameColor(accent.rgb, foreground.rgb)
	if (!accentCollapsed && (
		sameColor(accent.rgb, background.rgb) || sameColor(accent.rgb, surface.rgb)
	)) return null
	const surfaceCollapsed = sameColor(surface.rgb, background.rgb)
	const contrast = measureContrast(variant, foreground, accent)
	if (!hasPeakAPCAObservability(contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ signedLc }) => signedLc))) return null
	if (!accentCollapsed && !hasPeakAPCAObservability(contrast.pairs
		.filter(({ role }) => role === "accent")
		.map(({ signedLc }) => signedLc))) return null
	const backgroundFamily = "generated" in background.support ? null : background.support.anchorFamilyId
	const surfaceFamily = "generated" in surface.support ? null : surface.support.anchorFamilyId
	const backgroundCoverage = "generated" in background.support ? 0 : clamp(background.support.totalSupport / 0.2)
	const surfaceCoverage = "generated" in surface.support ? 0 : clamp(surface.support.totalSupport / 0.2)
	const fieldCoverage = surfaceCollapsed
		? backgroundCoverage
		: clamp(Math.max(backgroundCoverage, surfaceCoverage) + 0.25 * Math.min(backgroundCoverage, surfaceCoverage) * variant.surfaceContribution)
	const accentIdentity = accentCollapsed || accentFamily === null ? 0 : signatureRoleScore(accentFamily)
	const accentFidelity = accentCollapsed
		? clamp(1 - accentOpportunity)
		: accentFamily === null ? 0 : distinctAccentFidelity(accentFamily, accent, foreground)
	const foregroundSignedContrasts = contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ signedLc }) => signedLc)
	const polarityAgreement = foregroundFamily === null
		? 1
		: foregroundPolarityAgreement(foregroundFamily, foregroundSignedContrasts)
	const foregroundIdentity = foregroundFamily === null ? 0 : foregroundRoleScore(foregroundFamily) * polarityAgreement
	const artworkIdentity = clamp(0.48 * fieldCoverage + 0.25 * foregroundIdentity + 0.27 * accentIdentity)
	const representatives = [background, surface, foreground, accent].filter((candidate, index, values) =>
		values.findIndex((other) => sameColor(other.rgb, candidate.rgb)) === index)
	const representativeness = mean(representatives.map(supportQuality))
	const foregroundContrast = contrast.pairs.filter(({ role }) => role === "foreground").map(({ absoluteLc }) => absoluteLc)
	const accentContrast = contrast.pairs.filter(({ role }) => role === "accent").map(({ absoluteLc }) => absoluteLc)
	const foregroundPathObservability = pathObservability(foregroundSignedContrasts)
	const accentPathObservability = accentContrast.length === 0
		? foregroundPathObservability
		: pathObservability(contrast.pairs.filter(({ role }) => role === "accent").map(({ signedLc }) => signedLc))
	const activeRolePathObservability = Math.min(foregroundPathObservability, accentPathObservability)
	const foregroundUtility = Math.sqrt(clamp(
		0.5 * clamp(mean(foregroundContrast) / 90) +
		0.5 * clamp(Math.min(...foregroundContrast) / 90),
	))
	const accentUtility = accentContrast.length === 0
		? foregroundUtility
		: Math.sqrt(clamp(
			0.5 * clamp(mean(accentContrast) / 75) +
			0.5 * clamp(Math.min(...accentContrast) / 75),
		))
	const uiUtility = clamp(
		0.72 * clamp(mean(foregroundContrast) / 90) +
		0.28 * (accentContrast.length === 0 ? clamp(mean(foregroundContrast) / 90) : clamp(mean(accentContrast) / 75)),
	)
	const separation = (first: ColorRepresentative, second: ColorRepresentative): number =>
		clamp((okDistance(first.oklab, second.oklab) - MINIMUM_DISTINCT_DISTANCE) / 0.1)
	const fieldCoherence = surfaceCollapsed ? 0.6 : clamp(0.55 + 0.45 * separation(background, surface))
	const foregroundCoherence = mean([
		separation(foreground, background),
		surfaceCollapsed ? separation(foreground, background) : separation(foreground, surface),
	])
	const accentCoherence = accentCollapsed
		? 0.6
		: mean([separation(accent, background), separation(accent, surface), separation(accent, foreground)])
	const coherence = clamp(0.25 * fieldCoherence + 0.45 * foregroundCoherence + 0.30 * accentCoherence)
	const surfaceFidelity = surfaceCollapsed
		? 1 - surfaceOpportunity
		: variant.surfaceContribution
	const accentEconomy = accentCollapsed
		? 1 - accentOpportunity
		: accentFamily === null ? 0 : signatureRoleScore(accentFamily) * separation(accent, foreground)
	const economy = clamp((surfaceFidelity + accentEconomy) / 2)
	const fieldFidelity = variant.fieldFidelity
	const fieldStructure = fieldFidelity * Math.sqrt(surfaceFidelity)
	const fieldIdentity = Math.sqrt(fieldStructure * artworkIdentity)
	const activeRoleTreatmentFoundation = treatmentFoundation(
		fieldStructure,
		artworkIdentity,
		foregroundUtility,
		activeRolePathObservability,
	)
	const generatorConfidence = clamp(0.55 * fieldFidelity + 0.25 * representativeness + 0.20 * coherence)
	const foundation = mean([fieldFidelity, artworkIdentity, representativeness])
	const balance = Math.min(fieldFidelity, artworkIdentity, representativeness, coherence, economy)
	const generatedPenalty = representatives.some(({ support }) => "generated" in support)
		? ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyGeneratedPenalty
		: 0
	const rankingScore = 0.50 * foundation + 0.15 * uiUtility + 0.15 * coherence + 0.12 * economy + 0.08 * generatorConfidence - generatedPenalty
	const familyRoles = {
		background: backgroundFamily ?? "generated",
		surface: surfaceCollapsed ? backgroundFamily ?? "generated" : surfaceFamily ?? "generated",
		foreground: foregroundFamilyId,
		accent: accentCollapsed ? foregroundFamilyId : accentFamilyId,
	} as const
	const output: CompletePaletteTreatment = {
		id: [
			variant.hypothesis.id,
			canonicalColorKey(background.rgb),
			canonicalColorKey(surface.rgb),
			canonicalColorKey(foreground.rgb),
			canonicalColorKey(accent.rgb),
			variant.gradient ? "gradient" : "flat",
		].join("|"),
		background: roleColor(background),
		surface: roleColor(surface),
		foreground: roleColor(foreground),
		accent: roleColor(accent),
		gradient: variant.gradient,
		fieldTreatment: variant.treatment,
		sourceFieldHypothesisId: variant.hypothesis.id,
		familyRoles,
		cardinality: new Set([background.hex, surface.hex, foreground.hex, accent.hex]).size as 2 | 3 | 4,
		collapse: { surface: surfaceCollapsed, accent: accentCollapsed },
		contrast,
		scores: {
			fieldFidelity,
			surfaceFidelity,
			fieldStructure,
			fieldIdentity,
			treatmentFoundation: activeRoleTreatmentFoundation,
			activeRolePathObservability,
			artworkIdentity,
			representativeness,
			uiUtility,
			foregroundUtility,
			foregroundPolarityAgreement: polarityAgreement,
			accentFidelity,
			accentUtility,
			coherence,
			economy,
			generatorConfidence,
			foundation,
			balance,
			generatedPenalty,
			rankingScore,
		},
		gradientEvidence: variant.gradient ? variant.hypothesis.gradientEvidence : null,
	}
	validateTreatment(output)
	return output
}

type CompletePaletteTreatmentGeneration = Readonly<{
	winner: CompletePaletteTreatment
	alternatives: readonly CompletePaletteTreatment[]
	completeTreatments: readonly CompletePaletteTreatment[]
	candidateCount: number
	emergency: EmergencyEligibility
	candidateAvailability: CandidateAvailabilityTrace
	identityObligationGraph: IdentityObligationGraph
	exactOverlayGradientChallenger: ExactOverlayGradientChallengerTrace
	paretoRanking: ParetoRankingTrace
	legacyScalarTopTreatment: CompletePaletteTreatment
}>

type CompletePaletteTreatmentDomain = Readonly<{
	evidence: NativePaletteEvidence
	hypotheses: readonly FieldHypothesis[]
	fieldVariants: readonly FieldVariant[]
	identitySelection: IdentityObligationSelection
	availableRolesByObligationFamily: ReadonlyMap<string, ReadonlySet<"foreground" | "accent">>
	foregroundIds: ReadonlySet<string>
	signatureIds: ReadonlySet<string>
	treatments: readonly CompletePaletteTreatment[]
	candidateCount: number
	emergency: EmergencyEligibility
	foregroundsPerFieldVariantQuota: number
	emergencyCandidateReserve: number
	foregroundPeakUnobservableRejectedOptionCount: number
	distinctAccentPeakUnobservableRejectedOptionCount: number
	surfaceOpportunityByBackgroundFamily: ReadonlyMap<string, number>
}>

function buildCompletePaletteTreatmentDomain(
	evidence: NativePaletteEvidence,
	hypotheses: readonly FieldHypothesis[],
): CompletePaletteTreatmentDomain {
	const fieldVariants = buildFieldVariants(hypotheses)
	if (fieldVariants.length === 0) throw new Error("No field variants are available")
	const identitySelection = buildIdentityObligationSelection(evidence, hypotheses)
	const obligationFamilyIds = identitySelection.obligations.map(({ familyId }) => familyId)
	const obligationFamilyIdSet = new Set(obligationFamilyIds)
	const availableRolesByObligationFamily = new Map<string, Set<"foreground" | "accent">>()
	const recordAvailableRole = (familyId: string, role: "foreground" | "accent"): void => {
		if (!obligationFamilyIdSet.has(familyId)) return
		const roles = availableRolesByObligationFamily.get(familyId) ?? new Set<"foreground" | "accent">()
		roles.add(role)
		availableRolesByObligationFamily.set(familyId, roles)
	}
	const foregroundLaneIds = evidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? []
	const foregroundIds = new Set(foregroundLaneIds)
	const foregroundFamilies = foregroundLaneIds.map((id) => familyById(evidence, id))
	const supportedRepresentatives = foregroundFamilies.flatMap((family) =>
		preferredRepresentatives(family.representatives).map((representative) => ({ family, representative })))
	const emergency = emergencyEligibility(fieldVariants, supportedRepresentatives.map(({ representative }) => representative))
	const emergencyCandidateReserve = emergency.eligible
		? 2 * Math.min(fieldVariants.length, 8) + 2 * Math.min(supportedRepresentatives.length, 8)
		: 0
	const treatmentsPerForeground = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground + 1
	const foregroundsPerFieldVariantQuota = Math.min(
		foregroundFamilies.length,
		Math.max(
			ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.foregroundsPerFieldVariant,
			Math.floor(
				(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates - emergencyCandidateReserve) /
				(fieldVariants.length * treatmentsPerForeground),
			),
		),
	)
	const signatureLaneIds = evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const signatureIds = new Set(signatureLaneIds)
	const signatureFamilies = signatureLaneIds.map((id) => familyById(evidence, id))
	const treatments: CompletePaletteTreatment[] = []
	let foregroundPeakUnobservableRejectedOptionCount = 0
	let distinctAccentPeakUnobservableRejectedOptionCount = 0
	const surfaceOpportunityByBackgroundFamily = new Map<string, number>()
	for (const variant of fieldVariants) {
		if (sameColor(variant.background.rgb, variant.surface.rgb)) continue
		const familyId = variant.hypothesis.backgroundFamilyId
		const opportunity = variant.surfaceContribution
		surfaceOpportunityByBackgroundFamily.set(familyId, Math.max(surfaceOpportunityByBackgroundFamily.get(familyId) ?? 0, opportunity))
	}

	for (const variant of fieldVariants) {
		const surfaceOpportunity = surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0
		const rankedForegroundOptions = supportedRepresentatives
			.filter(({ representative }) =>
				!sameColor(representative.rgb, variant.background.rgb) && !sameColor(representative.rgb, variant.surface.rgb))
			.map((option) => {
				const signedContrasts = fieldSamples(variant).map((sample) => apcaContrast(option.representative.rgb, sample.rgb))
				return {
					...option,
					signedContrasts,
					contrast: mean(signedContrasts.map(Math.abs)),
					polarityAgreement: foregroundPolarityAgreement(option.family, signedContrasts),
				}
			})
			.sort((first, second) =>
				compareNumbersDescending(
					0.68 * foregroundRoleScore(first.family) * first.polarityAgreement + 0.16 * supportQuality(first.representative) + 0.16 * clamp(first.contrast / 90),
					0.68 * foregroundRoleScore(second.family) * second.polarityAgreement + 0.16 * supportQuality(second.representative) + 0.16 * clamp(second.contrast / 90),
				) ||
				compareAscii(`${first.family.id}:${first.representative.hex}`, `${second.family.id}:${second.representative.hex}`))
		const foregroundRetention = retainPeakObservableFamilyDirections(
			rankedForegroundOptions,
			foregroundsPerFieldVariantQuota,
			obligationFamilyIds,
		)
		for (const option of rankedForegroundOptions) {
			if (hasPeakAPCAObservability(option.signedContrasts)) recordAvailableRole(option.family.id, "foreground")
		}
		foregroundPeakUnobservableRejectedOptionCount += foregroundRetention.rejectedCount
		const foregroundOptions = foregroundRetention.retained

		for (const foregroundOption of foregroundOptions) {
			const rankedAccents = signatureFamilies
				.flatMap((family) => preferredRepresentatives(family.representatives).map((representative) => ({ family, representative })))
				.filter(({ family, representative }) =>
					family.id !== variant.hypothesis.backgroundFamilyId &&
					family.id !== variant.hypothesis.surfaceFamilyId &&
					family.id !== foregroundOption.family.id &&
					!sameColor(representative.rgb, variant.background.rgb) &&
					!sameColor(representative.rgb, variant.surface.rgb) &&
					!sameColor(representative.rgb, foregroundOption.representative.rgb))
				.map((option) => {
					const signedContrasts = fieldSamples(variant).map((sample) => apcaContrast(option.representative.rgb, sample.rgb))
					return {
						...option,
						signedContrasts,
						utility: clamp(mean(signedContrasts.map(Math.abs)) / 75),
						fidelity: distinctAccentFidelity(option.family, option.representative, foregroundOption.representative),
					}
				})
				.sort((first, second) =>
					compareNumbersDescending(
						0.50 * first.fidelity + 0.25 * supportQuality(first.representative) + 0.25 * first.utility,
						0.50 * second.fidelity + 0.25 * supportQuality(second.representative) + 0.25 * second.utility,
					) ||
					compareAscii(`${first.family.id}:${first.representative.hex}`, `${second.family.id}:${second.representative.hex}`))
			const accentRetention = retainPeakObservableFamilyDirections(
				rankedAccents,
				ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground,
				obligationFamilyIds,
			)
			for (const option of rankedAccents) {
				if (hasPeakAPCAObservability(option.signedContrasts)) recordAvailableRole(option.family.id, "accent")
			}
			distinctAccentPeakUnobservableRejectedOptionCount += accentRetention.rejectedCount
			const accents = accentRetention.retained
			const accentOpportunity = accents[0]?.fidelity ?? 0
			const collapsed = createTreatment(
				variant,
				foregroundOption.representative,
				foregroundOption.representative,
				foregroundOption.family.id,
				foregroundOption.family.id,
				foregroundOption.family,
				foregroundOption.family,
				accentOpportunity,
				surfaceOpportunity,
			)
			if (collapsed) treatments.push(collapsed)
			for (const accentOption of accents.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground)) {
				const treatment = createTreatment(
					variant,
					foregroundOption.representative,
					accentOption.representative,
					foregroundOption.family.id,
					accentOption.family.id,
					foregroundOption.family,
					accentOption.family,
					accentOpportunity,
					surfaceOpportunity,
				)
				if (treatment) treatments.push(treatment)
			}
		}
	}

	if (emergency.eligible) {
		const generatedForegrounds = [
			generatedRepresentative([0, 0, 0], "foreground", emergency),
			generatedRepresentative([255, 255, 255], "foreground", emergency),
		]
		for (const variant of fieldVariants.slice(0, 8)) {
			for (const foreground of generatedForegrounds) {
				const treatment = createTreatment(
					variant,
					foreground,
					foreground,
					"generated",
					"generated",
					null,
					null,
					0,
					surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0,
				)
				if (treatment) treatments.push(treatment)
			}
		}
		const generatedBackgrounds = [
			generatedRepresentative([0, 0, 0], "background", emergency),
			generatedRepresentative([255, 255, 255], "background", emergency),
		]
		for (const background of generatedBackgrounds) {
			const sourceHypothesis = hypotheses[0]
			if (!sourceHypothesis) continue
			const emergencyVariant: FieldVariant = {
				hypothesis: sourceHypothesis,
				background,
				surface: background,
				gradient: false,
				treatment: "one-field",
				fieldFidelity: clamp(sourceHypothesis.fieldFidelity * 0.35),
				surfaceContribution: 0,
			}
			const emergencySourceOptions = retainRoleFamilyDirections(supportedRepresentatives, 8, obligationFamilyIds)
			for (const option of emergencySourceOptions) {
				if (sameColor(option.representative.rgb, background.rgb)) continue
				const signedContrasts = fieldSamples(emergencyVariant).map((sample) =>
					apcaContrast(option.representative.rgb, sample.rgb))
				if (hasPeakAPCAObservability(signedContrasts)) recordAvailableRole(option.family.id, "foreground")
				const treatment = createTreatment(
					emergencyVariant,
					option.representative,
					option.representative,
					option.family.id,
					option.family.id,
					option.family,
					option.family,
					0,
					0,
				)
				if (treatment) {
					treatments.push(treatment)
				}
			}
		}
	}

	if (treatments.length === 0) throw new Error("No legal complete palette treatment could be generated")
	if (treatments.length > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error(`Complete candidate count ${treatments.length} exceeds the bound ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates}`)
	}
	return {
		evidence,
		hypotheses,
		fieldVariants,
		identitySelection,
		availableRolesByObligationFamily,
		foregroundIds,
		signatureIds,
		treatments,
		candidateCount: treatments.length,
		emergency,
		foregroundsPerFieldVariantQuota,
		emergencyCandidateReserve,
		foregroundPeakUnobservableRejectedOptionCount,
		distinctAccentPeakUnobservableRejectedOptionCount,
		surfaceOpportunityByBackgroundFamily,
	}
}

function selectCompletePaletteTreatmentDomain(
	domain: CompletePaletteTreatmentDomain,
): CompletePaletteTreatmentGeneration {
	const {
		evidence,
		hypotheses,
		fieldVariants,
		identitySelection,
		availableRolesByObligationFamily,
		foregroundIds,
		signatureIds,
		treatments,
		candidateCount,
		emergency,
		foregroundsPerFieldVariantQuota,
		emergencyCandidateReserve,
		foregroundPeakUnobservableRejectedOptionCount,
		distinctAccentPeakUnobservableRejectedOptionCount,
		surfaceOpportunityByBackgroundFamily,
	} = domain
	if (treatments.length === 0) throw new Error("No legal complete palette treatment could be selected")
	if (candidateCount > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error(`Complete candidate count ${candidateCount} exceeds the bound ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates}`)
	}
	const unique = new Map<string, CompletePaletteTreatment>()
	for (const treatment of treatments) if (!unique.has(treatmentKey(treatment))) unique.set(treatmentKey(treatment), treatment)
	const uniqueTreatments = [...unique.values()]
	const legacyScalarTopTreatment = [...uniqueTreatments].sort((first, second) =>
		compareNumbersDescending(first.scores.rankingScore, second.scores.rankingScore) ||
		compareNumbersDescending(first.scores.balance, second.scores.balance) ||
		compareAscii(first.id, second.id))[0]
	const globalFrontier = paretoFrontier(uniqueTreatments)
	if (globalFrontier.length === 0) throw new Error("Pareto frontier is empty")
	const qualityIncumbent = globalFrontier[0]
	const identityRanked = [...uniqueTreatments].sort((first, second) =>
		compareIdentityTreatments(first, second, identitySelection.obligations))
	const {
		identityChallengers,
		eligibleIdentityChallengers,
		selectedIdentityChallenger,
		qualityGuardEvaluations: identityChallengerQualityGuards,
	} = selectQualityGuardedIdentityChallenger(qualityIncumbent, uniqueTreatments, identitySelection.obligations)
	const primaryWinner = selectedIdentityChallenger ?? qualityIncumbent
	const hasFeasibleObligation = identitySelection.obligations.some((obligation) =>
		uniqueTreatments.some((treatment) => treatmentCoversIdentityObligation(treatment, obligation)))
	const identitySelectionReason: IdentityWinnerSelectionReason = !hasFeasibleObligation
		? "no-feasible-identity-obligation"
		: identityChallengers.length === 0
			? "quality-incumbent-already-identity-optimal"
			: selectedIdentityChallenger === null
				? "all-identity-challengers-failed-quality-guard"
				: "quality-guarded-identity-challenger-selected"
	const retentionByTreatment = new Map(globalFrontier.map((treatment) => [treatmentKey(treatment), treatment]))
	const obligationFrontierRepresentative = new Map<string, CompletePaletteTreatment>()
	for (const obligation of identitySelection.obligations) {
		const carriers = uniqueTreatments.filter((treatment) => treatmentCoversIdentityObligation(treatment, obligation))
		const representative = carriers.length === 0
			? null
			: paretoFrontier(carriers).sort((first, second) =>
				compareIdentityTreatments(first, second, identitySelection.obligations))[0]
		if (!representative) continue
		obligationFrontierRepresentative.set(obligation.id, representative)
		retentionByTreatment.set(treatmentKey(representative), representative)
	}
	const unrestrictedIdentityWinner = identityRanked[0]
	retentionByTreatment.set(treatmentKey(unrestrictedIdentityWinner), unrestrictedIdentityWinner)
	const frontier = [...retentionByTreatment.values()].sort((first, second) =>
		compareIdentityTreatments(first, second, identitySelection.obligations))
	const directional = new Map<string, CompletePaletteTreatment>()
	for (const treatment of frontier) {
		const key = completeDirectionKey(treatment)
		if (!directional.has(key)) directional.set(key, treatment)
	}
	const directionalRanked = [...directional.values()].sort((first, second) =>
		compareIdentityTreatments(first, second, identitySelection.obligations))
	const selected: CompletePaletteTreatment[] = [primaryWinner]
	const selectedKeys = new Set([treatmentKey(primaryWinner)])
	const selectedDirections = new Set([completeDirectionKey(primaryWinner)])
	const selectedFieldDirections = new Set([fieldDirectionKey(primaryWinner)])
	const selectedFieldTreatments = new Set([primaryWinner.fieldTreatment])
	const maximumTreatments = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedTreatments
	const addCandidate = (candidate: CompletePaletteTreatment, obligationRequired = false): boolean => {
		const key = treatmentKey(candidate)
		const direction = completeDirectionKey(candidate)
		if (selected.length >= maximumTreatments || selectedKeys.has(key) || selectedDirections.has(direction)) return false
		if (!obligationRequired && selected.some((incumbent) => visuallyNear(incumbent, candidate))) return false
		selected.push(candidate)
		selectedKeys.add(key)
		selectedDirections.add(direction)
		selectedFieldDirections.add(fieldDirectionKey(candidate))
		return true
	}
	for (const obligation of identitySelection.obligations) {
		if (selected.some((treatment) => treatmentCoversIdentityObligation(treatment, obligation))) continue
		const representative = obligationFrontierRepresentative.get(obligation.id)
		if (representative && !addCandidate(representative, true)) {
			throw new Error(`Identity obligation ${obligation.id} could not reserve a retained-slate direction`)
		}
	}
	for (const candidate of directionalRanked) {
		if (selected.length >= maximumTreatments) break
		if (selectedFieldTreatments.has(candidate.fieldTreatment)) continue
		if (addCandidate(candidate)) selectedFieldTreatments.add(candidate.fieldTreatment)
	}
	for (const candidate of directionalRanked) {
		if (selected.length >= maximumTreatments) break
		if (selectedFieldDirections.has(fieldDirectionKey(candidate))) continue
		addCandidate(candidate)
	}
	for (const candidate of directionalRanked) {
		if (selected.length >= maximumTreatments) break
		addCandidate(candidate)
	}
	selected.sort((first, second) => compareIdentityTreatments(first, second, identitySelection.obligations))
	const gradientVariants = fieldVariants.filter(({ gradient }) => gradient)
	const primaryFoundationEvidenceLevel = evidenceLevel(effectiveBlock(primaryWinner, "treatmentFoundation"))
	const existingExactOverlayGradients = uniqueTreatments.filter((candidate) =>
		isExactOverlayGradientChallenger(primaryWinner, candidate))
	const qualityGuardRequired = selectedIdentityChallenger !== null
	const overlayQualityGuardEvaluations: IdentityQualityGuardEvaluation[] = []
	const qualityGuardEligibleOverlays = (candidates: readonly CompletePaletteTreatment[]): CompletePaletteTreatment[] => {
		if (!qualityGuardRequired) return [...candidates]
		const { eligibleCandidates, evaluations } = filterIdentityQualityGuardCandidates(qualityIncumbent, candidates)
		overlayQualityGuardEvaluations.push(...evaluations)
		return [...eligibleCandidates]
	}
	const existingEligibleExactOverlayGradients = qualityGuardEligibleOverlays(existingExactOverlayGradients)
	let challenger = selectExactOverlayGradientChallenger(primaryWinner, existingEligibleExactOverlayGradients)
	let selectedSource: ExactOverlayGradientChallengerTrace["selectedSource"] = challenger ? "existing-complete" : null
	let projectedAttemptCount = 0
	let projectedLegalCount = 0
	const projected: CompletePaletteTreatment[] = []
	let eligibleProjected: CompletePaletteTreatment[] = []
	if (!challenger && !primaryWinner.gradient && !primaryWinner.collapse.accent && gradientVariants.length > 0 &&
		primaryWinner.familyRoles.foreground !== "generated" && primaryWinner.familyRoles.accent !== "generated") {
		const foregroundFamily = familyById(evidence, primaryWinner.familyRoles.foreground)
		const accentFamily = familyById(evidence, primaryWinner.familyRoles.accent)
		for (const variant of gradientVariants.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.gradientChallengerProjections)) {
			projectedAttemptCount += 1
			const treatment = createTreatment(
				variant,
				primaryWinner.foreground,
				primaryWinner.accent,
				foregroundFamily.id,
				accentFamily.id,
				foregroundFamily,
				accentFamily,
				0,
				surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0,
			)
			if (!treatment || !isExactOverlayGradientChallenger(primaryWinner, treatment)) continue
			projectedLegalCount += 1
			if (![...existingExactOverlayGradients, ...projected].some((candidate) =>
				treatmentKey(candidate) === treatmentKey(treatment))) projected.push(treatment)
		}
		eligibleProjected = qualityGuardEligibleOverlays(projected)
		challenger = selectExactOverlayGradientChallenger(primaryWinner, eligibleProjected)
		if (challenger) selectedSource = "supplemental-projection"
	}
	const triggerEligible = !primaryWinner.gradient && !primaryWinner.collapse.accent && gradientVariants.length > 0
	const allExactOverlayGradients = [...existingExactOverlayGradients, ...projected]
	const qualityGuardEligibleExactOverlayCount = existingEligibleExactOverlayGradients.length +
		(qualityGuardRequired ? eligibleProjected.length : projected.length)
	const challengerReason: ExactOverlayGradientChallengerTrace["reason"] = primaryWinner.gradient
		? "primary-winner-gradient"
		: primaryWinner.collapse.accent
			? "accent-collapsed"
			: gradientVariants.length === 0
				? "no-accepted-gradient-variant"
				: challenger
					? "challenger-selected"
					: qualityGuardRequired && allExactOverlayGradients.length > 0 && qualityGuardEligibleExactOverlayCount === 0
						? "quality-guard"
					: allExactOverlayGradients.length > 0
						? "foundation-gap"
						: "no-legal-exact-overlay-gradient"
	const finalWinner = challenger ?? primaryWinner
	const finalSelected: CompletePaletteTreatment[] = []
	const addFinal = (candidate: CompletePaletteTreatment, required = false): void => {
		if (finalSelected.some((existing) => treatmentKey(existing) === treatmentKey(candidate))) return
		if (finalSelected.length >= maximumTreatments) {
			if (required) throw new Error(`Required treatment ${candidate.id} could not be retained in the public slate`)
			return
		}
		finalSelected.push(candidate)
	}
	addFinal(finalWinner, true)
	if (challenger) addFinal(primaryWinner, true)
	addFinal(qualityIncumbent, true)
	for (const obligation of identitySelection.obligations) {
		if (finalSelected.some((treatment) => treatmentCoversIdentityObligation(treatment, obligation))) continue
		const representative = obligationFrontierRepresentative.get(obligation.id)
		if (representative) addFinal(representative, true)
	}
	for (const candidate of selected) addFinal(candidate)
	const challengerTrace: ExactOverlayGradientChallengerTrace = {
		triggerEligible,
		reason: challengerReason,
		acceptedGradientVariantCount: gradientVariants.length,
		existingExactOverlayGradientCount: existingExactOverlayGradients.length,
		projectedAttemptCount,
		projectedLegalCount,
		projectedUniqueCount: projected.length,
		selectedChallengerId: challenger?.id ?? null,
		selectedSource,
		primaryFoundationEvidenceLevel,
		challengerFoundationEvidenceLevel: challenger === null
			? null
			: evidenceLevel(effectiveBlock(challenger, "treatmentFoundation")),
		replacedPrimaryWinner: challenger !== null,
		qualityGuardRequired,
		qualityGuardRejectedCandidateCount: overlayQualityGuardEvaluations.filter(({ pass }) => !pass).length,
		selectedChallengerPassesQualityGuard: challenger === null || !qualityGuardRequired
			? null
			: evaluateIdentityQualityGuard(qualityIncumbent, challenger).pass,
		qualityGuardEvaluations: overlayQualityGuardEvaluations,
	}
	const completeCandidateForegroundFamilyIds = [...new Set(uniqueTreatments.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const completeCandidateAccentFamilyIds = [...new Set(uniqueTreatments.filter(({ collapse }) => !collapse.accent).map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const globalFrontierDirectionKeys = new Set(globalFrontier.map(completeDirectionKey))
	const finalSelectedDirections = new Set(finalSelected.map(completeDirectionKey))
	const omittedFrontierDirectionKeys = [...globalFrontierDirectionKeys].filter((key) => !finalSelectedDirections.has(key)).sort(compareAscii)
	const identityObligationGraph = buildIdentityObligationGraph(
		identitySelection,
		availableRolesByObligationFamily,
		uniqueTreatments,
		frontier,
		finalSelected,
		finalWinner,
		primaryWinner,
		qualityIncumbent,
		selectedIdentityChallenger,
		eligibleIdentityChallengers,
		identitySelectionReason,
	)
	return {
		winner: finalWinner,
		alternatives: finalSelected,
		completeTreatments: uniqueTreatments,
		candidateCount,
		emergency,
		candidateAvailability: {
			foregroundLaneFamilyIds: [...foregroundIds].sort(compareAscii),
			signatureLaneFamilyIds: [...signatureIds].sort(compareAscii),
			fieldHypothesisFamilyIds: [...new Set(hypotheses.flatMap(({ backgroundFamilyId, surfaceFamilyId }) =>
				surfaceFamilyId === null ? [backgroundFamilyId] : [backgroundFamilyId, surfaceFamilyId]))].sort(compareAscii),
			foregroundsPerFieldVariantQuota,
			emergencyCandidateReserve,
			foregroundPeakUnobservableRejectedOptionCount,
			distinctAccentPeakUnobservableRejectedOptionCount,
			completeCandidateForegroundFamilyIds,
			completeCandidateAccentFamilyIds,
			slateForegroundFamilyIds: [...new Set(finalSelected.map(({ familyRoles }) => familyRoles.foreground)
				.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
			slateAccentFamilyIds: [...new Set(finalSelected.filter(({ collapse }) => !collapse.accent).map(({ familyRoles }) => familyRoles.accent)
				.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
		},
		identityObligationGraph,
		exactOverlayGradientChallenger: challengerTrace,
		paretoRanking: {
			version: "pareto-identity-winner-diagnostics-v3",
			qualityGuardVersion: "complete-quality-domain-non-inferiority-v1",
			evidenceResolution: RANKING_EVIDENCE_RESOLUTION,
			dominanceUsesEvidenceLevels: true,
			paretoBlocks: ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
			rankingPriorityBlocks: ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
			rawCandidateCount: candidateCount,
			uniqueCandidateCount: uniqueTreatments.length,
			dominatedCandidateCount: uniqueTreatments.length - globalFrontier.length,
			frontierCandidateCount: globalFrontier.length,
			globalParetoFrontierTreatmentIds: globalFrontier.map(({ id }) => id),
			frontierDirectionCount: globalFrontierDirectionKeys.size,
			identityRetentionFrontierCandidateCount: frontier.length,
			identityCarriedCandidateCount: frontier.filter((candidate) => !globalFrontier.some((global) =>
				treatmentKey(global) === treatmentKey(candidate))).length,
			identityCoverageRequiresQualityNonInferiority: true,
			qualityGuardBlocks: ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
			globalParetoTopTreatmentId: globalFrontier[0].id,
			qualityIncumbentTreatmentId: qualityIncumbent.id,
			identityChallengerCount: identityChallengers.length,
			eligibleIdentityChallengerCount: eligibleIdentityChallengers.length,
			selectedIdentityChallengerTreatmentId: selectedIdentityChallenger?.id ?? null,
			selectedIdentityChallengerQualityGuard: selectedIdentityChallenger === null
				? null
				: evaluateIdentityQualityGuard(qualityIncumbent, selectedIdentityChallenger),
			identityChallengerQualityGuards,
			retainedCount: finalSelected.length,
			selectedTreatmentId: finalWinner.id,
			primaryTreatmentId: primaryWinner.id,
			legacyScalarTopTreatmentId: legacyScalarTopTreatment.id,
			differsFromLegacyScalar: treatmentKey(finalWinner) !== treatmentKey(legacyScalarTopTreatment),
			omittedFrontierDirectionKeys,
		},
		legacyScalarTopTreatment,
	}
}

export function generateCompletePaletteTreatments(
	evidence: NativePaletteEvidence,
	hypotheses: readonly FieldHypothesis[],
): CompletePaletteTreatmentGeneration {
	return selectCompletePaletteTreatmentDomain(buildCompletePaletteTreatmentDomain(evidence, hypotheses))
}

type RecallArmMechanics = Readonly<{
	changedStages: readonly AlbumArtworkPaletteV2RecallCustodyStage[]
	evidence: NativePaletteEvidence
	proposals: readonly FieldHypothesis[]
	hypotheses: readonly FieldHypothesis[]
	fieldVariants: readonly FieldVariant[]
	representatives: "control" | "all"
}>

type RecallArmGeneration = Readonly<{
	additions: readonly CompletePaletteTreatment[]
	conditionalCells: ReadonlySet<string>
	capacityReached: boolean
	availableRolesByObligationFamily: ReadonlyMap<string, ReadonlySet<"foreground" | "accent">>
	foregroundsPerFieldVariantQuota: number
	foregroundPeakUnobservableRejectedOptionCount: number
	distinctAccentPeakUnobservableRejectedOptionCount: number
	surfaceOpportunityByBackgroundFamily: ReadonlyMap<string, number>
}>

function recallCellKey(fieldKey: string, roleKey: string): string {
	return `${fieldKey}=>${roleKey}`
}

function fieldVariantDirectionKey(variant: FieldVariant): string {
	const backgroundFamily = "generated" in variant.background.support
		? "generated"
		: variant.background.support.anchorFamilyId
	const surfaceFamily = "generated" in variant.surface.support
		? "generated"
		: variant.surface.support.anchorFamilyId
	return [
		variant.treatment,
		backgroundFamily,
		sameColor(variant.background.rgb, variant.surface.rgb) ? "=" : surfaceFamily,
		variant.gradient ? "gradient" : "flat",
	].join(":")
}

function sourceConnectedRepresentative(representative: ColorRepresentative): boolean {
	return !("generated" in representative.support) &&
		representative.support.anchorFamilyId.length > 0 &&
		representative.support.regionIds.length > 0
}

function sourceConnectedFamily(family: ColorFamilyEvidence): boolean {
	return family.population > 1 &&
		family.components.some(({ population }) => population > 1) &&
		family.representatives.some(sourceConnectedRepresentative)
}

function sourceConnectedHypothesis(
	hypothesis: FieldHypothesis,
	familiesById: ReadonlyMap<string, ColorFamilyEvidence>,
): boolean {
	const familyIds = [hypothesis.backgroundFamilyId, hypothesis.surfaceFamilyId]
		.filter((familyId): familyId is string => familyId !== null)
	return familyIds.every((familyId) => {
		const family = familiesById.get(familyId)
		return family !== undefined && sourceConnectedFamily(family)
	}) && hypothesis.backgroundRepresentatives.some(sourceConnectedRepresentative) &&
		hypothesis.surfaceRepresentatives.some(sourceConnectedRepresentative)
}

function evidenceWithAllRankedLanes(evidence: NativePaletteEvidence): NativePaletteEvidence {
	return {
		...evidence,
		lanes: evidence.lanes.map((lane) => ({
			...lane,
			familyIds: rankAllLaneFamilies(evidence.families, lane.name).map(({ id }) => id),
		})),
	}
}

function fieldDirectionKeysForHypotheses(hypotheses: readonly FieldHypothesis[]): Set<string> {
	return new Set(buildFieldVariants(hypotheses, { representatives: "all", pairing: "cross-pair" })
		.map(fieldVariantDirectionKey))
}

function buildRecallRegistry(
	evidence: NativePaletteEvidence,
	controlProposals: readonly FieldHypothesis[],
	controlHypotheses: readonly FieldHypothesis[],
	allProposals: readonly FieldHypothesis[],
	identityObligationFamilyIds: readonly string[],
): AlbumArtworkPaletteV2RecallRegistry {
	const familiesById = new Map(evidence.families.map((family) => [family.id, family]))
	const controlProposalIds = new Set(controlProposals.map(({ id }) => id))
	const controlHypothesisIds = new Set(controlHypotheses.map(({ id }) => id))
	const identityIds = new Set(identityObligationFamilyIds)
	const rankedByLane = new Map(evidence.lanes.map(({ name }) =>
		[name, rankAllLaneFamilies(evidence.families, name)] as const))
	const controlLaneIds = new Map(evidence.lanes.map(({ name, familyIds }) => [name, new Set(familyIds)] as const))
	const families = evidence.families
		.filter(sourceConnectedFamily)
		.map((family): RecallAuditFamilyRegistryEntry => ({
			familyId: family.id,
			sourceConnected: true,
			representativeStrategies: allRepresentatives(family.representatives).map(({ strategy }) => strategy),
			laneRanks: Object.fromEntries((["field", "signature", "foreground"] as const).map((lane) => [
				lane,
				rankedByLane.get(lane)!.findIndex(({ id }) => id === family.id),
			])) as Record<EvidenceLane["name"], number>,
			controlRetainedLanes: (["field", "signature", "foreground"] as const)
				.filter((lane) => controlLaneIds.get(lane)?.has(family.id)),
			identityObligation: identityIds.has(family.id),
		}))
		.sort((first, second) => compareAscii(first.familyId, second.familyId))
	const proposalById = new Map<string, FieldHypothesis>()
	for (const proposal of [...controlProposals, ...allProposals]) {
		if (!proposalById.has(proposal.id)) proposalById.set(proposal.id, proposal)
	}
	const fieldHypotheses = [...proposalById.values()]
		.map((hypothesis): RecallAuditFieldHypothesisRegistryEntry => ({
			hypothesisId: hypothesis.id,
			kind: hypothesis.kind,
			familyIds: [...new Set([hypothesis.backgroundFamilyId, hypothesis.surfaceFamilyId]
				.filter((familyId): familyId is string => familyId !== null))].sort(compareAscii),
			sourceConnected: sourceConnectedHypothesis(hypothesis, familiesById),
			controlProposed: controlProposalIds.has(hypothesis.id),
			controlRetained: controlHypothesisIds.has(hypothesis.id),
		}))
		.sort((first, second) => compareAscii(first.hypothesisId, second.hypothesisId))
	const sourceHypothesisIds = new Set(fieldHypotheses
		.filter(({ sourceConnected }) => sourceConnected)
		.map(({ hypothesisId }) => hypothesisId))
	const mutableFieldDirections = new Map<string, { hypothesisIds: Set<string>; familyIds: Set<string> }>()
	for (const variant of buildFieldVariants([...proposalById.values()], {
		representatives: "all",
		pairing: "cross-pair",
	})) {
		if (!sourceHypothesisIds.has(variant.hypothesis.id)) continue
		const key = fieldVariantDirectionKey(variant)
		const entry = mutableFieldDirections.get(key) ?? { hypothesisIds: new Set<string>(), familyIds: new Set<string>() }
		entry.hypothesisIds.add(variant.hypothesis.id)
		entry.familyIds.add(variant.hypothesis.backgroundFamilyId)
		if (variant.hypothesis.surfaceFamilyId) entry.familyIds.add(variant.hypothesis.surfaceFamilyId)
		mutableFieldDirections.set(key, entry)
	}
	const fieldDirections = [...mutableFieldDirections.entries()]
		.map(([key, entry]): RecallAuditFieldDirectionRegistryEntry => ({
			key,
			hypothesisIds: [...entry.hypothesisIds].sort(compareAscii),
			familyIds: [...entry.familyIds].sort(compareAscii),
			sourceConnected: true,
		}))
		.sort((first, second) => compareAscii(first.key, second.key))
	const roleDirections = families.flatMap(({ familyId, identityObligation }) => ([
		{
			key: `foreground:${familyId}`,
			role: "foreground" as const,
			familyId,
			sourceConnected: true,
			identityObligation,
		},
		{
			key: `accent:${familyId}`,
			role: "accent" as const,
			familyId,
			sourceConnected: true,
			identityObligation,
		},
	])).sort((first, second) => compareAscii(first.key, second.key))
	return {
		version: "album-artwork-palette-v2-recall-registry-0.7.3",
		families,
		fieldHypotheses,
		fieldDirections,
		roleDirections,
		identityObligationFamilyIds: [...identityIds].sort(compareAscii),
	}
}

function generateRecallArmAdditions(
	mechanics: RecallArmMechanics,
	controlTreatments: readonly CompletePaletteTreatment[],
	controlCandidateCount: number,
	registry: AlbumArtworkPaletteV2RecallRegistry,
	obligationFamilyIds: readonly string[],
): RecallArmGeneration {
	const controlKeys = new Set(controlTreatments.map(completeTreatmentKey))
	const additions = new Map<string, CompletePaletteTreatment>()
	const conditionalCells = new Set<string>()
	const maximum = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates
	let capacityReached = controlCandidateCount >= maximum
	let foregroundPeakUnobservableRejectedOptionCount = 0
	let distinctAccentPeakUnobservableRejectedOptionCount = 0
	const obligationFamilyIdSet = new Set(obligationFamilyIds)
	const availableRolesByObligationFamily = new Map<string, Set<"foreground" | "accent">>()
	const recordAvailableRole = (familyId: string, role: "foreground" | "accent"): void => {
		if (!obligationFamilyIdSet.has(familyId)) return
		const roles = availableRolesByObligationFamily.get(familyId) ?? new Set<"foreground" | "accent">()
		roles.add(role)
		availableRolesByObligationFamily.set(familyId, roles)
	}
	const roleRepresentatives = (family: ColorFamilyEvidence): ColorRepresentative[] =>
		mechanics.representatives === "all"
			? allRepresentatives(family.representatives)
			: preferredRepresentatives(family.representatives)
	const foregroundLaneIds = mechanics.evidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? []
	const signatureLaneIds = mechanics.evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const foregroundFamilies = foregroundLaneIds.map((id) => familyById(mechanics.evidence, id))
	const signatureFamilies = signatureLaneIds.map((id) => familyById(mechanics.evidence, id))
	const supportedRepresentatives = foregroundFamilies.flatMap((family) =>
		roleRepresentatives(family).map((representative) => ({ family, representative })))
	const treatmentsPerForeground = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground + 1
	const foregroundsPerFieldVariantQuota = Math.min(
		foregroundFamilies.length,
		Math.max(
			ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.foregroundsPerFieldVariant,
			Math.floor(maximum / Math.max(1, mechanics.fieldVariants.length * treatmentsPerForeground)),
		),
	)
	const surfaceOpportunityByBackgroundFamily = new Map<string, number>()
	for (const variant of mechanics.fieldVariants) {
		if (sameColor(variant.background.rgb, variant.surface.rgb)) continue
		const familyId = variant.hypothesis.backgroundFamilyId
		surfaceOpportunityByBackgroundFamily.set(familyId, Math.max(
			surfaceOpportunityByBackgroundFamily.get(familyId) ?? 0,
			variant.surfaceContribution,
		))
	}
	const append = (treatment: CompletePaletteTreatment | null): void => {
		if (!treatment) return
		const key = completeTreatmentKey(treatment)
		if (controlKeys.has(key) || additions.has(key)) return
		if (!recallTreatmentLineage(treatment, registry).sourceConnected) return
		if (controlCandidateCount + additions.size >= maximum) {
			capacityReached = true
			return
		}
		additions.set(key, treatment)
	}
	const canMaterialize = (): boolean => {
		if (controlCandidateCount + additions.size < maximum) return true
		capacityReached = true
		return false
	}

	for (const variant of mechanics.fieldVariants) {
		const fieldKey = fieldVariantDirectionKey(variant)
		const surfaceOpportunity = surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0
		const rankedForegroundOptions = supportedRepresentatives
			.filter(({ representative }) =>
				!sameColor(representative.rgb, variant.background.rgb) && !sameColor(representative.rgb, variant.surface.rgb))
			.map((option) => {
				const signedContrasts = fieldSamples(variant).map((sample) =>
					apcaContrast(option.representative.rgb, sample.rgb))
				return {
					...option,
					signedContrasts,
					contrast: mean(signedContrasts.map(Math.abs)),
					polarityAgreement: foregroundPolarityAgreement(option.family, signedContrasts),
				}
			})
			.sort((first, second) =>
				compareNumbersDescending(
					0.68 * foregroundRoleScore(first.family) * first.polarityAgreement +
						0.16 * supportQuality(first.representative) + 0.16 * clamp(first.contrast / 90),
					0.68 * foregroundRoleScore(second.family) * second.polarityAgreement +
						0.16 * supportQuality(second.representative) + 0.16 * clamp(second.contrast / 90),
				) || compareAscii(
					`${first.family.id}:${first.representative.hex}`,
					`${second.family.id}:${second.representative.hex}`,
				))
		const observableForegrounds = rankedForegroundOptions.filter(({ signedContrasts }) =>
			hasPeakAPCAObservability(signedContrasts))
		for (const { family } of observableForegrounds) {
			conditionalCells.add(recallCellKey(fieldKey, `foreground:${family.id}`))
			recordAvailableRole(family.id, "foreground")
		}
		foregroundPeakUnobservableRejectedOptionCount += rankedForegroundOptions.length - observableForegrounds.length
		const foregroundRetention = retainPeakObservableFamilyDirections(
			rankedForegroundOptions,
			foregroundsPerFieldVariantQuota,
			obligationFamilyIds,
		)
		const retainedForegroundFamilyIds = new Set(foregroundRetention.retained.map(({ family }) => family.id))
		const foregroundOptions = mechanics.representatives === "all"
			? observableForegrounds.filter(({ family }) => retainedForegroundFamilyIds.has(family.id))
			: foregroundRetention.retained

		for (const foregroundOption of foregroundOptions) {
			const rankedAccents = signatureFamilies
				.flatMap((family) => roleRepresentatives(family).map((representative) => ({ family, representative })))
				.filter(({ family, representative }) =>
					family.id !== variant.hypothesis.backgroundFamilyId &&
					family.id !== variant.hypothesis.surfaceFamilyId &&
					family.id !== foregroundOption.family.id &&
					!sameColor(representative.rgb, variant.background.rgb) &&
					!sameColor(representative.rgb, variant.surface.rgb) &&
					!sameColor(representative.rgb, foregroundOption.representative.rgb))
				.map((option) => {
					const signedContrasts = fieldSamples(variant).map((sample) =>
						apcaContrast(option.representative.rgb, sample.rgb))
					return {
						...option,
						signedContrasts,
						utility: clamp(mean(signedContrasts.map(Math.abs)) / 75),
						fidelity: distinctAccentFidelity(
							option.family,
							option.representative,
							foregroundOption.representative,
						),
					}
				})
				.sort((first, second) =>
					compareNumbersDescending(
						0.50 * first.fidelity + 0.25 * supportQuality(first.representative) + 0.25 * first.utility,
						0.50 * second.fidelity + 0.25 * supportQuality(second.representative) + 0.25 * second.utility,
					) || compareAscii(
						`${first.family.id}:${first.representative.hex}`,
						`${second.family.id}:${second.representative.hex}`,
					))
			const observableAccents = rankedAccents.filter(({ signedContrasts }) =>
				hasPeakAPCAObservability(signedContrasts))
			for (const { family } of observableAccents) {
				conditionalCells.add(recallCellKey(fieldKey, `accent:${family.id}`))
				recordAvailableRole(family.id, "accent")
			}
			distinctAccentPeakUnobservableRejectedOptionCount += rankedAccents.length - observableAccents.length
			const accentRetention = retainPeakObservableFamilyDirections(
				rankedAccents,
				ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground,
				obligationFamilyIds,
			)
			const retainedAccentFamilyIds = new Set(accentRetention.retained.map(({ family }) => family.id))
			const accents = mechanics.representatives === "all"
				? observableAccents.filter(({ family }) => retainedAccentFamilyIds.has(family.id))
				: accentRetention.retained
			const accentOpportunity = accents[0]?.fidelity ?? 0
			if (canMaterialize()) {
				append(createTreatment(
					variant,
					foregroundOption.representative,
					foregroundOption.representative,
					foregroundOption.family.id,
					foregroundOption.family.id,
					foregroundOption.family,
					foregroundOption.family,
					accentOpportunity,
					surfaceOpportunity,
				))
			}
			for (const accentOption of accents) {
				if (!canMaterialize()) break
				append(createTreatment(
					variant,
					foregroundOption.representative,
					accentOption.representative,
					foregroundOption.family.id,
					accentOption.family.id,
					foregroundOption.family,
					accentOption.family,
					accentOpportunity,
					surfaceOpportunity,
				))
			}
		}
	}
	return {
		additions: [...additions.values()],
		conditionalCells,
		capacityReached,
		availableRolesByObligationFamily,
		foregroundsPerFieldVariantQuota,
		foregroundPeakUnobservableRejectedOptionCount,
		distinctAccentPeakUnobservableRejectedOptionCount,
		surfaceOpportunityByBackgroundFamily,
	}
}

type FactorizedTupleDescriptor = Readonly<{
	variant: FieldVariant
	foreground: ColorRepresentative
	foregroundFamily: ColorFamilyEvidence
	accent: ColorRepresentative
	accentFamily: ColorFamilyEvidence
	accentOpportunity: number
	surfaceOpportunity: number
	cellKeys: readonly string[]
}>

type FactorizedEnumeration = Readonly<{
	treatments: readonly CompletePaletteTreatment[]
	enumerableTupleCount: number
	attemptedTupleCount: number
	legalTupleCount: number
	duplicateLegalKeyCount: number
	checkpointReached: boolean
	truncatedTupleCount: number
	truncationWitnesses: FactorizedParetoTruncationWitnesses
}>

function factorizedDescriptorTreatmentKey(descriptor: FactorizedTupleDescriptor): string {
	return completeTreatmentKey({
		background: roleColor(descriptor.variant.background),
		surface: roleColor(descriptor.variant.surface),
		foreground: roleColor(descriptor.foreground),
		accent: roleColor(descriptor.accent),
		gradient: descriptor.variant.gradient,
	})
}

function buildFactorizedTupleDescriptors(
	evidence: NativePaletteEvidence,
	fieldVariants: readonly FieldVariant[],
): FactorizedTupleDescriptor[] {
	const foregroundLaneIds = evidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? []
	const signatureLaneIds = evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const foregroundFamilies = foregroundLaneIds.map((id) => familyById(evidence, id))
	const signatureFamilies = signatureLaneIds.map((id) => familyById(evidence, id))
	const supportedForegrounds = foregroundFamilies.flatMap((family) =>
		preferredRepresentatives(family.representatives).map((representative) => ({ family, representative })))
	const surfaceOpportunityByBackgroundFamily = new Map<string, number>()
	for (const variant of fieldVariants) {
		if (sameColor(variant.background.rgb, variant.surface.rgb)) continue
		const familyId = variant.hypothesis.backgroundFamilyId
		surfaceOpportunityByBackgroundFamily.set(familyId, Math.max(
			surfaceOpportunityByBackgroundFamily.get(familyId) ?? 0,
			variant.surfaceContribution,
		))
	}
	const descriptors: FactorizedTupleDescriptor[] = []
	for (const variant of fieldVariants) {
		const fieldKey = fieldVariantDirectionKey(variant)
		const surfaceOpportunity = surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0
		const foregroundOptions = supportedForegrounds
			.filter(({ representative }) =>
				!sameColor(representative.rgb, variant.background.rgb) && !sameColor(representative.rgb, variant.surface.rgb))
			.map((option) => {
				const signedContrasts = fieldSamples(variant).map((sample) =>
					apcaContrast(option.representative.rgb, sample.rgb))
				return {
					...option,
					signedContrasts,
					contrast: mean(signedContrasts.map(Math.abs)),
					polarityAgreement: foregroundPolarityAgreement(option.family, signedContrasts),
				}
			})
			.filter(({ signedContrasts }) => hasPeakAPCAObservability(signedContrasts))
			.sort((first, second) =>
				compareNumbersDescending(
					0.68 * foregroundRoleScore(first.family) * first.polarityAgreement +
						0.16 * supportQuality(first.representative) + 0.16 * clamp(first.contrast / 90),
					0.68 * foregroundRoleScore(second.family) * second.polarityAgreement +
						0.16 * supportQuality(second.representative) + 0.16 * clamp(second.contrast / 90),
				) || compareAscii(
					`${first.family.id}:${first.representative.hex}`,
					`${second.family.id}:${second.representative.hex}`,
				))
		for (const foregroundOption of foregroundOptions) {
			const accentOptions = signatureFamilies
				.flatMap((family) => preferredRepresentatives(family.representatives)
					.map((representative) => ({ family, representative })))
				.filter(({ family, representative }) =>
					family.id !== variant.hypothesis.backgroundFamilyId &&
					family.id !== variant.hypothesis.surfaceFamilyId &&
					family.id !== foregroundOption.family.id &&
					!sameColor(representative.rgb, variant.background.rgb) &&
					!sameColor(representative.rgb, variant.surface.rgb) &&
					!sameColor(representative.rgb, foregroundOption.representative.rgb))
				.map((option) => {
					const signedContrasts = fieldSamples(variant).map((sample) =>
						apcaContrast(option.representative.rgb, sample.rgb))
					return {
						...option,
						signedContrasts,
						utility: clamp(mean(signedContrasts.map(Math.abs)) / 75),
						fidelity: distinctAccentFidelity(
							option.family,
							option.representative,
							foregroundOption.representative,
						),
					}
				})
				.filter(({ signedContrasts }) => hasPeakAPCAObservability(signedContrasts))
				.sort((first, second) =>
					compareNumbersDescending(
						0.50 * first.fidelity + 0.25 * supportQuality(first.representative) + 0.25 * first.utility,
						0.50 * second.fidelity + 0.25 * supportQuality(second.representative) + 0.25 * second.utility,
					) || compareAscii(
						`${first.family.id}:${first.representative.hex}`,
						`${second.family.id}:${second.representative.hex}`,
					))
			const accentOpportunity = accentOptions[0]?.fidelity ?? 0
			descriptors.push({
				variant,
				foreground: foregroundOption.representative,
				foregroundFamily: foregroundOption.family,
				accent: foregroundOption.representative,
				accentFamily: foregroundOption.family,
				accentOpportunity,
				surfaceOpportunity,
				cellKeys: [recallCellKey(fieldKey, `foreground:${foregroundOption.family.id}`)],
			})
			for (const accentOption of accentOptions) {
				descriptors.push({
					variant,
					foreground: foregroundOption.representative,
					foregroundFamily: foregroundOption.family,
					accent: accentOption.representative,
					accentFamily: accentOption.family,
					accentOpportunity,
					surfaceOpportunity,
					cellKeys: [
						recallCellKey(fieldKey, `foreground:${foregroundOption.family.id}`),
						recallCellKey(fieldKey, `accent:${accentOption.family.id}`),
					],
				})
			}
		}
	}
	return descriptors
}

function enumerateFactorizedTreatments(
	descriptors: readonly FactorizedTupleDescriptor[],
	checkpoint: 3_000 | 6_000,
): FactorizedEnumeration {
	const unique = new Map<string, CompletePaletteTreatment>()
	let attemptedTupleCount = 0
	let legalTupleCount = 0
	for (const descriptor of descriptors) {
		if (unique.size >= checkpoint) break
		attemptedTupleCount += 1
		const treatment = createTreatment(
			descriptor.variant,
			descriptor.foreground,
			descriptor.accent,
			descriptor.foregroundFamily.id,
			descriptor.accentFamily.id,
			descriptor.foregroundFamily,
			descriptor.accentFamily,
			descriptor.accentOpportunity,
			descriptor.surfaceOpportunity,
		)
		if (!treatment) continue
		legalTupleCount += 1
		const key = completeTreatmentKey(treatment)
		if (!unique.has(key)) unique.set(key, treatment)
	}
	const truncated = descriptors.slice(attemptedTupleCount)
	const witnessDescriptors = truncated.slice(0, 8)
	const truncationWitnesses: FactorizedParetoTruncationWitnesses = {
		knownTreatmentKeys: [...new Set(witnessDescriptors.map(factorizedDescriptorTreatmentKey))].sort(compareAscii),
		knownCellKeys: [...new Set(witnessDescriptors.flatMap(({ cellKeys }) => cellKeys))].sort(compareAscii),
		otherwiseQualifyingTreatmentKeys: [],
		otherwiseQualifyingCellKeys: [],
	}
	return {
		treatments: [...unique.values()],
		enumerableTupleCount: descriptors.length,
		attemptedTupleCount,
		legalTupleCount,
		duplicateLegalKeyCount: legalTupleCount - unique.size,
		checkpointReached: unique.size >= checkpoint,
		truncatedTupleCount: descriptors.length - attemptedTupleCount,
		truncationWitnesses,
	}
}

function factorizedSourceBinding(image: RawImage): string {
	let hash = 0x811c9dc5
	for (const byte of image.data) {
		hash ^= byte
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return `${image.width}x${image.height}:${image.data.length}:${hash.toString(16).padStart(8, "0")}`
}

function factorizedTriggerToken(certificate: Omit<FactorizedPareto6000TriggerCertificate, "verifiedTriggerToken">): string {
	return [
		"factorized-pareto-6000",
		certificate.sourceBinding,
		...certificate.witnesses.otherwiseQualifyingTreatmentKeys,
		...certificate.witnesses.otherwiseQualifyingCellKeys,
	].join(":")
}

const verifiedFactorized6000Certificates = new WeakSet<FactorizedPareto6000TriggerCertificate>()

export function factorizedPareto6000TriggerPredicate(
	certificate: FactorizedPareto6000TriggerCertificate,
): boolean {
	return verifiedFactorized6000Certificates.has(certificate) &&
		certificate.fromArm === "factorized-pareto-3000" &&
		certificate.checkpoint === 3_000 &&
		certificate.trigger6000 &&
		certificate.exactCheckpointOnlyProof &&
		certificate.reason === "verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint" &&
		certificate.witnesses.otherwiseQualifyingTreatmentKeys.length > 0 &&
		certificate.witnesses.otherwiseQualifyingCellKeys.length > 0 &&
		certificate.verifiedTriggerToken === factorizedTriggerToken(certificate)
}

function treatmentCells(
	treatments: readonly CompletePaletteTreatment[],
): Map<string, string[]> {
	const cells = new Map<string, Set<string>>()
	for (const treatment of treatments) {
		const treatmentKey = completeTreatmentKey(treatment)
		const fieldKey = fieldDirectionKey(treatment)
		for (const roleKey of roleDirectionKeys(treatment)) {
			const key = recallCellKey(fieldKey, roleKey)
			const values = cells.get(key) ?? new Set<string>()
			values.add(treatmentKey)
			cells.set(key, values)
		}
	}
	return new Map([...cells.entries()].map(([key, values]) => [key, [...values].sort(compareAscii)]))
}

function recallTreatmentLineage(
	treatment: CompletePaletteTreatment,
	registry: AlbumArtworkPaletteV2RecallRegistry,
): RecallAuditTreatmentLineage {
	const fieldRoot = registry.fieldHypotheses.find(({ hypothesisId }) =>
		hypothesisId === treatment.sourceFieldHypothesisId)
	const treatmentFieldDirectionKey = fieldDirectionKey(treatment)
	const treatmentRoleDirectionKeys = roleDirectionKeys(treatment)
	const fieldDirectionRoot = registry.fieldDirections.find(({ key }) => key === treatmentFieldDirectionKey)
	const representatives = (["background", "surface", "foreground", "accent"] as const).map((role) => {
		const color = treatment[role]
		const familyId = treatment.familyRoles[role]
		const sourceConnected = familyId !== "generated" && !("generated" in color.support) &&
			color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
		return { role, familyId, hex: color.hex, strategy: color.strategy, sourceConnected }
	})
	const familyIds = [...new Set(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: treatmentFieldDirectionKey,
		roleDirectionKeys: treatmentRoleDirectionKeys,
		familyIds,
		representatives,
		sourceConnected: fieldRoot?.sourceConnected === true &&
			fieldDirectionRoot?.sourceConnected === true &&
			fieldDirectionRoot.hypothesisIds.includes(treatment.sourceFieldHypothesisId) &&
			treatmentRoleDirectionKeys.every((key) => registry.roleDirections.some((direction) =>
				direction.key === key && direction.sourceConnected)) &&
			representatives.every(({ sourceConnected }) => sourceConnected) &&
			familyIds.every((familyId) => registry.families.some((family) =>
				family.familyId === familyId && family.sourceConnected)),
	}
}

function changedStagesForRecallArm(
	arm: AlbumArtworkPaletteV2RecallAuditArm,
): readonly AlbumArtworkPaletteV2RecallCustodyStage[] {
	if (arm === "control-0.7.2") return []
	if (arm === "widened-field-hypothesis-retention") return ["field-hypothesis-retention"]
	if (arm === "widened-family-lane-retention") return ["lane-retention"]
	return ["representative-pairing"]
}

function buildRecallArmMechanics(
	arm: AlbumArtworkPaletteV2RecallAuditArm,
	controlEvidence: NativePaletteEvidence,
	allLaneEvidence: NativePaletteEvidence,
	controlProposals: readonly FieldHypothesis[],
	allLaneProposals: readonly FieldHypothesis[],
	controlHypotheses: readonly FieldHypothesis[],
): RecallArmMechanics {
	const laneArm = arm === "widened-family-lane-retention"
	const proposalArm = arm === "widened-field-hypothesis-retention"
	const evidence = laneArm ? allLaneEvidence : controlEvidence
	const proposals = laneArm ? allLaneProposals : controlProposals
	const hypotheses = proposalArm
		? controlProposals
		: laneArm ? retainFieldHypotheses(allLaneProposals) : controlHypotheses
	const representatives = arm === "all-existing-representative-strategies" ? "all" : "control"
	const pairing = arm === "all-retained-representative-cross-pairs" ? "cross-pair" : "same-index"
	return {
		changedStages: changedStagesForRecallArm(arm),
		evidence,
		proposals,
		hypotheses,
		fieldVariants: buildFieldVariants(hypotheses, { representatives, pairing }),
		representatives,
	}
}

export function auditAlbumArtworkPaletteV2Recall(
	image: RawImage,
	arm: AlbumArtworkPaletteV2RecallAuditArm = "control-0.7.2",
): AlbumArtworkPaletteV2RecallAudit {
	if (!ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS.includes(arm)) {
		throw new RangeError(`Unknown album-artwork palette recall-audit arm ${arm}`)
	}
	const controlExtraction = extractAlbumArtworkPaletteV2(image)
	const evidence = buildNativePaletteEvidence(image)
	const fieldDomains = buildBackgroundFieldDomains(evidence)
	const evaluatedGradientFits = evaluateGradientFits(evidence, fieldDomains)
	const controlProposals = buildFieldHypothesisProposalsFromEvaluatedFits(evidence, evaluatedGradientFits, "all")
	const controlHypotheses = buildFieldHypothesesFromEvaluatedFits(evidence, evaluatedGradientFits)
	const controlGeneration = generateCompletePaletteTreatments(evidence, controlHypotheses)
	const controlTreatments = controlGeneration.completeTreatments
	const controlKeys = new Set(controlTreatments.map(completeTreatmentKey))
	const allLaneEvidence = evidenceWithAllRankedLanes(evidence)
	const allLaneDomains = buildBackgroundFieldDomains(allLaneEvidence)
	const allLaneProposals = buildFieldHypothesisProposalsFromEvaluatedFits(
		allLaneEvidence,
		evaluateGradientFits(allLaneEvidence, allLaneDomains),
		"all",
	)
	const obligationFamilyIds = controlGeneration.identityObligationGraph.obligations.map(({ familyId }) => familyId)
	const registry = buildRecallRegistry(
		evidence,
		controlProposals,
		controlHypotheses,
		allLaneProposals,
		obligationFamilyIds,
	)
	const controlMechanics = buildRecallArmMechanics(
		"control-0.7.2",
		evidence,
		allLaneEvidence,
		controlProposals,
		allLaneProposals,
		controlHypotheses,
	)
	const treatmentMechanics = buildRecallArmMechanics(
		arm,
		evidence,
		allLaneEvidence,
		controlProposals,
		allLaneProposals,
		controlHypotheses,
	)
	const controlTrace = generateRecallArmAdditions(
		controlMechanics,
		controlTreatments,
		controlGeneration.candidateCount,
		registry,
		obligationFamilyIds,
	)
	const armGeneration = arm === "control-0.7.2"
		? controlTrace
		: generateRecallArmAdditions(
			treatmentMechanics,
			controlTreatments,
			controlGeneration.candidateCount,
			registry,
			obligationFamilyIds,
		)
	const combinedTreatments = arm === "control-0.7.2"
		? [...controlTreatments]
		: [...controlTreatments, ...armGeneration.additions]
	if (combinedTreatments.length > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error("Recall-audit candidate domain exceeds the unchanged complete-treatment bound")
	}
	const qualityIncumbent = controlTreatments.find(({ id }) =>
		id === controlGeneration.paretoRanking.qualityIncumbentTreatmentId)
	if (!qualityIncumbent) throw new Error("Control quality incumbent is absent from the complete treatment domain")
	const controlFrontier = paretoFrontier(controlTreatments)
	const armFrontier = paretoFrontier(combinedTreatments)
	const armFrontierKeys = new Set(armFrontier.map(completeTreatmentKey))
	const controlCellTreatments = treatmentCells(controlTreatments)
	const combinedCellTreatments = treatmentCells(combinedTreatments)
	const guardPassingTreatments = combinedTreatments.filter((treatment) =>
		evaluateIdentityQualityGuard(qualityIncumbent, treatment).pass)
	const guardCellTreatments = treatmentCells(guardPassingTreatments)
	const newTreatments = armGeneration.additions.map((treatment): RecallAuditNewTreatment => {
		const key = completeTreatmentKey(treatment)
		const lineage = recallTreatmentLineage(treatment, registry)
		const fillsControlEmptyFieldRoleCell = roleDirectionKeys(treatment).some((roleKey) =>
			!controlCellTreatments.has(recallCellKey(fieldDirectionKey(treatment), roleKey)))
		const qualityGuard = evaluateIdentityQualityGuard(qualityIncumbent, treatment)
		return {
			treatment,
			key,
			lineage,
			qualityGuard,
			qualification: qualifyRecallAuditTreatment({
				treatment,
				controlTreatmentKeys: controlKeys,
				sourceConnectedFullLineage: lineage.sourceConnected,
				legalUnderUnchangedRules: true,
				ordinaryParetoMember: armFrontierKeys.has(key),
				completeDomainGuardPass: qualityGuard.pass,
				fillsControlEmptyFieldRoleCell,
			}),
		}
	})
	const publicSlate = [...controlExtraction.alternatives]
	for (const entry of [...newTreatments]
		.filter(({ qualification }) => qualification.qualifies)
		.sort((first, second) => compareParetoTreatments(first.treatment, second.treatment))) {
		if (publicSlate.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedTreatments) break
		if (!publicSlate.some((treatment) => completeTreatmentKey(treatment) === entry.key)) publicSlate.push(entry.treatment)
	}
	const publicSlateCells = treatmentCells(publicSlate)
	const fieldDirectionKeys = registry.fieldDirections.map(({ key }) => key)
	const roleDirectionKeysFromRegistry = registry.roleDirections.map(({ key }) => key)
	const availabilityCells: RecallAuditAvailabilityCell[] = []
	const custody: RecallAuditCustodyDiagnostic[] = []
	const armFieldLaneIds = new Set(treatmentMechanics.evidence.lanes
		.find(({ name }) => name === "field")?.familyIds ?? [])
	const armForegroundLaneIds = new Set(treatmentMechanics.evidence.lanes
		.find(({ name }) => name === "foreground")?.familyIds ?? [])
	const armSignatureLaneIds = new Set(treatmentMechanics.evidence.lanes
		.find(({ name }) => name === "signature")?.familyIds ?? [])
	const armProposalIds = new Set(treatmentMechanics.proposals.map(({ id }) => id))
	const armProposalDirectionKeys = fieldDirectionKeysForHypotheses(treatmentMechanics.proposals)
	const armRetainedDirectionKeys = fieldDirectionKeysForHypotheses(treatmentMechanics.hypotheses)
	const armPairedDirectionKeys = new Set(treatmentMechanics.fieldVariants.map(fieldVariantDirectionKey))
	const frontierCellTreatments = treatmentCells(armFrontier)

	for (const fieldDirection of registry.fieldDirections) {
		const laneRetainedFieldRoot = fieldDirection.hypothesisIds.some((hypothesisId) => {
			const hypothesis = registry.fieldHypotheses.find((candidate) => candidate.hypothesisId === hypothesisId)
			return hypothesis !== undefined && hypothesis.familyIds.every((familyId) => armFieldLaneIds.has(familyId))
		})
		const proposedFieldRoot = fieldDirection.hypothesisIds.some((id) => armProposalIds.has(id)) &&
			armProposalDirectionKeys.has(fieldDirection.key)
		for (const roleDirection of registry.roleDirections) {
			const cellKey = recallCellKey(fieldDirection.key, roleDirection.key)
			const controlTreatmentKeys = controlCellTreatments.get(cellKey) ?? []
			const armTreatmentKeys = combinedCellTreatments.get(cellKey) ?? []
			availabilityCells.push({
				key: cellKey,
				fieldDirectionKey: fieldDirection.key,
				roleDirectionKey: roleDirection.key,
				role: roleDirection.role,
				familyId: roleDirection.familyId,
				identityObligation: roleDirection.identityObligation,
				controlTreatmentKeys,
				armTreatmentKeys,
				controlAvailable: controlTreatmentKeys.length > 0,
				armAvailable: armTreatmentKeys.length > 0,
				newlyAvailable: controlTreatmentKeys.length === 0 && armTreatmentKeys.length > 0,
			})
			const roleLaneRetained = roleDirection.role === "foreground"
				? armForegroundLaneIds.has(roleDirection.familyId)
				: armSignatureLaneIds.has(roleDirection.familyId)
			const laneRetained = laneRetainedFieldRoot && roleLaneRetained
			const proposalAvailable = laneRetained && proposedFieldRoot
			const retentionAvailable = proposalAvailable && armRetainedDirectionKeys.has(fieldDirection.key)
			const pairingAvailable = retentionAvailable && armPairedDirectionKeys.has(fieldDirection.key)
			const conditionalAvailable = pairingAvailable && armGeneration.conditionalCells.has(cellKey)
			const completeAvailable = armTreatmentKeys.length > 0
			const frontierKeys = frontierCellTreatments.get(cellKey) ?? []
			const guardKeys = guardCellTreatments.get(cellKey) ?? []
			const guardAvailable = frontierKeys.length > 0 || guardKeys.length > 0
			const slateKeys = publicSlateCells.get(cellKey) ?? []
			const stages: RecallAuditCustodyStageDiagnostic[] = [
				{
					stage: "discovered-family",
					status: "available",
					reason: "source-connected-field-and-role-families-discovered",
					treatmentKeys: [],
				},
				{
					stage: "lane-retention",
					status: laneRetained ? "available" : "unavailable",
					reason: laneRetained ? "field-and-role-directions-retained-by-arm-lanes" : "field-or-role-direction-not-retained-by-arm-lanes",
					treatmentKeys: [],
				},
				{
					stage: "field-hypothesis-proposal",
					status: proposalAvailable ? "available" : "unavailable",
					reason: proposalAvailable ? "current-model-field-root-proposed" : "no-current-model-field-root-proposal",
					treatmentKeys: [],
				},
				{
					stage: "field-hypothesis-retention",
					status: retentionAvailable ? "available" : "unavailable",
					reason: retentionAvailable ? "field-root-retained-by-arm" : "field-root-not-retained-by-arm",
					treatmentKeys: [],
				},
				{
					stage: "representative-pairing",
					status: pairingAvailable ? "available" : "unavailable",
					reason: pairingAvailable ? "arm-produced-legal-field-representative-pair" : "no-legal-field-representative-pair-in-arm",
					treatmentKeys: [],
				},
				{
					stage: "field-conditional-role-eligibility",
					status: conditionalAvailable ? "available" : "unavailable",
					reason: conditionalAvailable ? "role-root-is-observable-on-field-direction" : "role-root-is-not-eligible-on-field-direction",
					treatmentKeys: [],
				},
				{
					stage: "complete-treatment-construction",
					status: completeAvailable ? "available" : "unavailable",
					reason: completeAvailable
						? "at-least-one-legal-complete-treatment-constructed"
						: conditionalAvailable && armGeneration.capacityReached
							? "complete-treatment-capacity-exhausted"
							: "no-legal-complete-treatment-constructed",
					treatmentKeys: armTreatmentKeys,
				},
				{
					stage: "ordinary-pareto-membership",
					status: frontierKeys.length > 0 ? "available" : completeAvailable ? "bypassed" : "unavailable",
					reason: frontierKeys.length > 0
						? "ordinary-pareto-member-present"
						: completeAvailable ? "ordinary-frontier-absent-guard-path-evaluated" : "no-complete-treatment-for-pareto-evaluation",
					treatmentKeys: frontierKeys,
				},
				{
					stage: "complete-domain-guard",
					status: guardAvailable ? "available" : "unavailable",
					reason: frontierKeys.length > 0
						? "ordinary-pareto-path-satisfies-recall-ranking-clause"
						: guardKeys.length > 0
							? "complete-domain-non-inferior-treatment-present"
							: "no-ordinary-frontier-or-complete-domain-non-inferior-treatment",
					treatmentKeys: [...new Set([...frontierKeys, ...guardKeys])].sort(compareAscii),
				},
				{
					stage: "public-slate-retention",
					status: slateKeys.length > 0 ? "available" : "unavailable",
					reason: slateKeys.length > 0 ? "treatment-retained-in-additive-public-slate" : "no-treatment-retained-in-public-slate",
					treatmentKeys: slateKeys,
				},
			]
			const firstLoss = stages.find(({ status }) => status === "unavailable") ?? null
			custody.push({
				cellKey,
				fieldDirectionKey: fieldDirection.key,
				roleDirectionKey: roleDirection.key,
				identityObligation: roleDirection.identityObligation,
				stages,
				firstLossStage: firstLoss?.stage ?? null,
				firstLossReason: firstLoss?.reason ?? null,
			})
		}
	}
	const controlDomain: RecallAuditDomain = {
		arm: "control-0.7.2",
		changedStages: [],
		rawCandidateCount: controlGeneration.candidateCount,
		materializedCandidateCount: controlTreatments.length,
		capacity: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
		capacityReached: controlGeneration.candidateCount >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
		completeTreatments: controlTreatments,
		completeTreatmentKeys: controlTreatments.map(completeTreatmentKey),
		ordinaryParetoTreatmentKeys: controlFrontier.map(completeTreatmentKey),
		publicSlate: controlExtraction.alternatives,
		qualityIncumbentTreatmentId: qualityIncumbent.id,
	}
	const treatmentDomain: RecallAuditDomain = arm === "control-0.7.2" ? controlDomain : {
		arm,
		changedStages: treatmentMechanics.changedStages,
		rawCandidateCount: controlGeneration.candidateCount + armGeneration.additions.length,
		materializedCandidateCount: combinedTreatments.length,
		capacity: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
		capacityReached: armGeneration.capacityReached,
		completeTreatments: combinedTreatments,
		completeTreatmentKeys: combinedTreatments.map(completeTreatmentKey),
		ordinaryParetoTreatmentKeys: armFrontier.map(completeTreatmentKey),
		publicSlate,
		qualityIncumbentTreatmentId: qualityIncumbent.id,
	}
	return {
		version: "album-artwork-palette-v2-recall-audit-0.7.3",
		arm,
		controlExtraction,
		control: controlDomain,
		treatment: treatmentDomain,
		newTreatments: arm === "control-0.7.2" ? [] : newTreatments,
		registry,
		availability: {
			fieldDirectionKeys,
			roleDirectionKeys: roleDirectionKeysFromRegistry,
			identityObligationRoleDirectionKeys: registry.roleDirections
				.filter(({ identityObligation }) => identityObligation)
				.map(({ key }) => key),
			cells: availabilityCells,
		},
		custody,
	}
}

export function auditAlbumArtworkPaletteV2FactorizedParetoRecall(
	image: RawImage,
	arm: AlbumArtworkPaletteV2FactorizedParetoAuditArm = "factorized-pareto-3000",
	triggerCertificate?: FactorizedPareto6000TriggerCertificate,
): AlbumArtworkPaletteV2FactorizedParetoAudit {
	if (!ALBUM_ARTWORK_PALETTE_V2_FACTORIZED_PARETO_AUDIT_ARMS.includes(arm)) {
		throw new RangeError(`Unknown album-artwork factorized Pareto audit arm ${arm}`)
	}
	const sourceBinding = factorizedSourceBinding(image)
	if (arm === "factorized-pareto-6000" && (
		!triggerCertificate ||
		triggerCertificate.sourceBinding !== sourceBinding ||
		!factorizedPareto6000TriggerPredicate(triggerCertificate)
	)) {
		throw new Error("factorized-pareto-6000 requires a source-bound verified 3000 trigger certificate")
	}
	const checkpoint = arm === "factorized-pareto-3000" ? 3_000 : 6_000
	const controlExtraction = extractAlbumArtworkPaletteV2(image)
	const evidence = buildNativePaletteEvidence(image)
	const fieldDomains = buildBackgroundFieldDomains(evidence)
	const evaluatedGradientFits = evaluateGradientFits(evidence, fieldDomains)
	const controlProposals = buildFieldHypothesisProposalsFromEvaluatedFits(evidence, evaluatedGradientFits, "all")
	const controlHypotheses = buildFieldHypothesesFromEvaluatedFits(evidence, evaluatedGradientFits)
	const controlGeneration = generateCompletePaletteTreatments(evidence, controlHypotheses)
	const controlTreatments = controlGeneration.completeTreatments
	const controlKeys = new Set(controlTreatments.map(completeTreatmentKey))
	const qualityIncumbent = controlTreatments.find(({ id }) =>
		id === controlGeneration.paretoRanking.qualityIncumbentTreatmentId)
	if (!qualityIncumbent) throw new Error("Control quality incumbent is absent from the factorized audit domain")
	const obligationFamilyIds = controlGeneration.identityObligationGraph.obligations.map(({ familyId }) => familyId)
	const registry = buildRecallRegistry(
		evidence,
		controlProposals,
		controlHypotheses,
		controlProposals,
		obligationFamilyIds,
	)
	const fieldVariants = buildFieldVariants(controlHypotheses, {
		representatives: "control",
		pairing: "same-index",
	})
	const descriptors = buildFactorizedTupleDescriptors(evidence, fieldVariants)
	const enumeration = enumerateFactorizedTreatments(descriptors, checkpoint)
	const logicalTreatments = enumeration.treatments
	const logicalKeys = new Set(logicalTreatments.map(completeTreatmentKey))
	const combinedLogicalByKey = new Map(controlTreatments.map((treatment) =>
		[completeTreatmentKey(treatment), treatment]))
	for (const treatment of logicalTreatments) {
		const key = completeTreatmentKey(treatment)
		if (!combinedLogicalByKey.has(key)) combinedLogicalByKey.set(key, treatment)
	}
	const combinedLogicalTreatments = [...combinedLogicalByKey.values()]
	const ordinaryFrontier = paretoFrontier(combinedLogicalTreatments)
	const ordinaryFrontierKeys = new Set(ordinaryFrontier.map(completeTreatmentKey))
	const guardByLogicalKey = new Map(logicalTreatments.map((treatment) => [
		completeTreatmentKey(treatment),
		evaluateIdentityQualityGuard(qualityIncumbent, treatment),
	] as const))
	const retainedLogicalTreatments = logicalTreatments
		.filter((treatment) => {
			const key = completeTreatmentKey(treatment)
			return ordinaryFrontierKeys.has(key) || guardByLogicalKey.get(key)?.pass === true
		})
		.sort(compareParetoTreatments)
	const retainedLogicalKeys = new Set(retainedLogicalTreatments.map(completeTreatmentKey))
	const novelRetained = retainedLogicalTreatments.filter((treatment) => !controlKeys.has(completeTreatmentKey(treatment)))
	const registeredNovelRetained = novelRetained.filter((treatment) =>
		recallTreatmentLineage(treatment, registry).sourceConnected)
	const availableMaterializationSlots = Math.max(
		0,
		ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates - controlGeneration.candidateCount,
	)
	const materializedAdditions = registeredNovelRetained.slice(0, availableMaterializationSlots)
	const materializedTreatments = [...controlTreatments, ...materializedAdditions]
	const controlCellTreatments = treatmentCells(controlTreatments)
	const retainedAdditions = materializedAdditions.map((treatment): RecallAuditNewTreatment => {
		const key = completeTreatmentKey(treatment)
		const lineage = recallTreatmentLineage(treatment, registry)
		const qualityGuard = guardByLogicalKey.get(key) ?? evaluateIdentityQualityGuard(qualityIncumbent, treatment)
		const fillsControlEmptyFieldRoleCell = roleDirectionKeys(treatment).some((roleKey) =>
			!controlCellTreatments.has(recallCellKey(fieldDirectionKey(treatment), roleKey)))
		return {
			treatment,
			key,
			lineage,
			qualityGuard,
			qualification: qualifyRecallAuditTreatment({
				treatment,
				controlTreatmentKeys: controlKeys,
				sourceConnectedFullLineage: lineage.sourceConnected,
				legalUnderUnchangedRules: true,
				ordinaryParetoMember: ordinaryFrontierKeys.has(key),
				completeDomainGuardPass: qualityGuard.pass,
				fillsControlEmptyFieldRoleCell,
			}),
		}
	})
	const publicSlate = [...controlExtraction.alternatives]
	for (const addition of retainedAdditions.filter(({ qualification }) => qualification.qualifies)) {
		if (publicSlate.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedTreatments) break
		if (!publicSlate.some((treatment) => completeTreatmentKey(treatment) === addition.key)) {
			publicSlate.push(addition.treatment)
		}
	}
	const controlFrontier = paretoFrontier(controlTreatments)
	const controlDomain: RecallAuditDomain = {
		arm: "control-0.7.2",
		changedStages: [],
		rawCandidateCount: controlGeneration.candidateCount,
		materializedCandidateCount: controlTreatments.length,
		capacity: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
		capacityReached: controlGeneration.candidateCount >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
		completeTreatments: controlTreatments,
		completeTreatmentKeys: controlTreatments.map(completeTreatmentKey),
		ordinaryParetoTreatmentKeys: controlFrontier.map(completeTreatmentKey),
		publicSlate: controlExtraction.alternatives,
		qualityIncumbentTreatmentId: qualityIncumbent.id,
	}
	const truncated = enumeration.truncatedTupleCount > 0
	const escalationReason: FactorizedParetoEscalationReason = !enumeration.checkpointReached
		? "logical-domain-exhausted-before-checkpoint"
		: !truncated
			? "no-post-checkpoint-tuples"
			: "post-checkpoint-qualification-not-evaluated"
	const escalation: FactorizedPareto6000TriggerCertificate = arm === "factorized-pareto-6000"
		? triggerCertificate!
		: {
			version: "album-artwork-palette-v2-factorized-pareto-6000-trigger-v1",
			sourceBinding,
			fromArm: "factorized-pareto-3000",
			checkpoint: 3_000,
			trigger6000: false,
			exactCheckpointOnlyProof: false,
			reason: escalationReason,
			witnesses: enumeration.truncationWitnesses,
			verifiedTriggerToken: null,
		}
	const laneFamilyIds: Record<EvidenceLane["name"], readonly string[]> = {
		field: [...(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])],
		signature: [...(evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? [])],
		foreground: [...(evidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? [])],
	}
	return {
		version: "album-artwork-palette-v2-factorized-pareto-audit-0.7.3",
		arm,
		controlExtraction,
		control: controlDomain,
		registry,
		treatment: {
			arm,
			checkpoint,
			rawCandidateCount: controlGeneration.candidateCount + materializedAdditions.length,
			materializedCandidateCount: materializedTreatments.length,
			capacity: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates,
			capacityReached: controlGeneration.candidateCount >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates ||
				materializedAdditions.length < registeredNovelRetained.length,
			completeTreatments: materializedTreatments,
			completeTreatmentKeys: materializedTreatments.map(completeTreatmentKey),
			publicSlate,
			qualityIncumbentTreatmentId: qualityIncumbent.id,
		},
		upstream: {
			changedStages: ["complete-treatment-construction"],
			evidenceFamilyIds: evidence.families.map(({ id }) => id),
			laneFamilyIds,
			fieldHypothesisIds: controlHypotheses.map(({ id }) => id),
			fieldVariantKeys: fieldVariants.map((variant) => [
				variant.hypothesis.id,
				variant.background.hex,
				variant.surface.hex,
				variant.gradient ? "gradient" : "flat",
			].join(":")),
			representativesPerRole: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.representativesPerRole,
			fieldRepresentativePairing: "same-index",
		},
		logical: {
			checkpoint,
			enumerableTupleCount: enumeration.enumerableTupleCount,
			attemptedTupleCount: enumeration.attemptedTupleCount,
			legalTupleCount: enumeration.legalTupleCount,
			duplicateLegalKeyCount: enumeration.duplicateLegalKeyCount,
			uniqueCanonicalKeyCountBeforePareto: logicalKeys.size,
			checkpointReached: enumeration.checkpointReached,
			truncatedTupleCount: enumeration.truncatedTupleCount,
			ordinaryParetoKeyCount: [...logicalKeys].filter((key) => ordinaryFrontierKeys.has(key)).length,
			completeDomainGuardPassingKeyCount: [...guardByLogicalKey.values()].filter(({ pass }) => pass).length,
			retainedUnionKeyCount: retainedLogicalKeys.size,
		},
		truncationWitnesses: enumeration.truncationWitnesses,
		retainedAdditions,
		escalation,
	}
}

export const auditAlbumArtworkPaletteV2FactorizedPareto =
	auditAlbumArtworkPaletteV2FactorizedParetoRecall

function assembleAlbumArtworkPaletteV2Result(
	image: RawImage,
	evidence: NativePaletteEvidence,
	fieldDomains: readonly BackgroundFieldDomain[],
	evaluatedGradientFits: readonly EvaluatedGradientFit[],
	fieldHypotheses: readonly FieldHypothesis[],
	generation: CompletePaletteTreatmentGeneration,
	version: string,
	protocol: string,
): AlbumArtworkPaletteV2Result {
	const retainedIds = new Set(evidence.retainedFamilyIds)
	return {
		version,
		protocol,
		width: image.width,
		height: image.height,
		winner: generation.winner,
		alternatives: generation.alternatives,
		diagnostics: {
			nativeDiscovery: true,
			preDiscoveryResize: false,
			familyCount: evidence.families.length,
			retainedFamilyCount: evidence.retainedFamilyIds.length,
			lanes: evidence.lanes,
			laneRetention: evidence.laneRetention,
			families: evidence.families.filter(({ id }) => retainedIds.has(id)),
			fieldDomains: fieldDomains
				.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedDiagnosticFieldDomains)
				.map(({ evidence: domainEvidence }) => domainEvidence),
			fieldHypotheses,
			gradientFits: gradientFitDiagnostics(evaluatedGradientFits),
			completeCandidateCount: generation.candidateCount,
			candidateAvailability: generation.candidateAvailability,
			identityObligationGraph: generation.identityObligationGraph,
			exactOverlayGradientChallenger: generation.exactOverlayGradientChallenger,
			paretoRanking: generation.paretoRanking,
			legacyScalarTopTreatment: generation.legacyScalarTopTreatment,
			emergency: generation.emergency,
			bounds: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds,
		},
	}
}

function mergeAvailableIdentityRoles(
	...roleMaps: readonly ReadonlyMap<string, ReadonlySet<"foreground" | "accent">>[]
): ReadonlyMap<string, ReadonlySet<"foreground" | "accent">> {
	const merged = new Map<string, Set<"foreground" | "accent">>()
	for (const roleMap of roleMaps) {
		for (const [familyId, roles] of roleMap) {
			const target = merged.get(familyId) ?? new Set<"foreground" | "accent">()
			for (const role of roles) target.add(role)
			merged.set(familyId, target)
		}
	}
	return merged
}

function fieldVariantAuditKey(variant: FieldVariant): string {
	return [
		variant.hypothesis.id,
		variant.background.hex,
		variant.surface.hex,
		variant.gradient ? "gradient" : "flat",
	].join(":")
}

function albumArtworkPaletteV2074CoreDomain(
	domain: CompletePaletteTreatmentDomain,
	generation: CompletePaletteTreatmentGeneration,
	result: AlbumArtworkPaletteV2Result,
	changedStages: readonly AlbumArtworkPaletteV2RecallCustodyStage[],
): AlbumArtworkPaletteV2074CoreDomain {
	const capacity = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates
	return {
		changedStages,
		rawCandidateCount: generation.candidateCount,
		materializedCandidateCount: generation.completeTreatments.length,
		capacity,
		remainingCapacity: capacity - generation.candidateCount,
		capacityReached: generation.candidateCount >= capacity,
		fieldHypothesisIds: domain.hypotheses.map(({ id }) => id),
		fieldVariantKeys: domain.fieldVariants.map(fieldVariantAuditKey),
		availableIdentityRoles: [...domain.availableRolesByObligationFamily]
			.sort(([first], [second]) => compareAscii(first, second))
			.map(([familyId, roles]) => ({
				familyId,
				roles: [...roles].sort(compareAscii) as ("foreground" | "accent")[],
			})),
		completeTreatments: generation.completeTreatments,
		completeTreatmentKeys: generation.completeTreatments.map(completeTreatmentKey),
		result,
	}
}

export function extractAlbumArtworkPaletteV2074Details(
	image: RawImage,
): AlbumArtworkPaletteV2074Details {
	const evidence = buildNativePaletteEvidence(image)
	const fieldDomains = buildBackgroundFieldDomains(evidence)
	const evaluatedGradientFits = evaluateGradientFits(evidence, fieldDomains)
	const controlHypotheses = buildFieldHypothesesFromEvaluatedFits(evidence, evaluatedGradientFits)
	if (controlHypotheses.length === 0) throw new Error("No defensible field hypothesis was found")

	const controlDomain = buildCompletePaletteTreatmentDomain(evidence, controlHypotheses)
	const controlGeneration = selectCompletePaletteTreatmentDomain(controlDomain)
	const controlProposals = buildFieldHypothesisProposalsFromEvaluatedFits(
		evidence,
		evaluatedGradientFits,
		"all",
	)
	const obligationFamilyIds = controlGeneration.identityObligationGraph.obligations.map(({ familyId }) => familyId)
	// The immutable recall audit used the all-lane proposal set only to close its
	// source registry. Candidate construction below remains on the control lanes.
	const allLaneEvidence = evidenceWithAllRankedLanes(evidence)
	const allLaneDomains = buildBackgroundFieldDomains(allLaneEvidence)
	const allLaneProposals = buildFieldHypothesisProposalsFromEvaluatedFits(
		allLaneEvidence,
		evaluateGradientFits(allLaneEvidence, allLaneDomains),
		"all",
	)
	const recallRegistry = buildRecallRegistry(
		evidence,
		controlProposals,
		controlHypotheses,
		allLaneProposals,
		obligationFamilyIds,
	)
	const candidateMechanics = buildRecallArmMechanics(
		"widened-field-hypothesis-retention",
		evidence,
		evidence,
		controlProposals,
		controlProposals,
		controlHypotheses,
	)
	const controlHypothesisIds = new Set(controlHypotheses.map(({ id }) => id))
	const sourceConnectedHypothesisIds = new Set(recallRegistry.fieldHypotheses
		.filter(({ sourceConnected }) => sourceConnected)
		.map(({ hypothesisId }) => hypothesisId))
	const candidateHypotheses = candidateMechanics.hypotheses.filter(({ id }) =>
		controlHypothesisIds.has(id) || sourceConnectedHypothesisIds.has(id))
	const candidateFieldVariants = candidateMechanics.fieldVariants.filter((variant) => {
		if (controlHypothesisIds.has(variant.hypothesis.id)) return true
		return sourceConnectedHypothesisIds.has(variant.hypothesis.id) &&
			sourceConnectedRepresentative(variant.background) &&
			sourceConnectedRepresentative(variant.surface) &&
			recallRegistry.fieldDirections.some((direction) =>
				direction.key === fieldVariantDirectionKey(variant) &&
				direction.sourceConnected &&
				direction.hypothesisIds.includes(variant.hypothesis.id))
	})
	const candidateAdditions = generateRecallArmAdditions(
		candidateMechanics,
		controlGeneration.completeTreatments,
		controlGeneration.candidateCount,
		recallRegistry,
		obligationFamilyIds,
	)
	const additions = candidateAdditions.additions.map((treatment): AlbumArtworkPaletteV2074CoreAddition => {
		const key = completeTreatmentKey(treatment)
		const lineage = recallTreatmentLineage(treatment, recallRegistry)
		if (!lineage.sourceConnected) throw new Error(`0.7.4 addition ${key} lacks complete source lineage`)
		return { treatment, key, lineage }
	})
	const candidateTreatments = [
		...controlGeneration.completeTreatments,
		...additions.map(({ treatment }) => treatment),
	]
	const candidateCount = controlGeneration.candidateCount + additions.length
	if (candidateCount > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error("0.7.4 candidate domain exceeds the unchanged complete-treatment bound")
	}
	const candidateDomain: CompletePaletteTreatmentDomain = {
		...controlDomain,
		hypotheses: candidateHypotheses,
		fieldVariants: candidateFieldVariants,
		identitySelection: buildIdentityObligationSelection(evidence, candidateHypotheses),
		availableRolesByObligationFamily: mergeAvailableIdentityRoles(
			controlDomain.availableRolesByObligationFamily,
			candidateAdditions.availableRolesByObligationFamily,
		),
		treatments: candidateTreatments,
		candidateCount,
		foregroundsPerFieldVariantQuota: candidateAdditions.foregroundsPerFieldVariantQuota,
		foregroundPeakUnobservableRejectedOptionCount:
			candidateAdditions.foregroundPeakUnobservableRejectedOptionCount,
		distinctAccentPeakUnobservableRejectedOptionCount:
			candidateAdditions.distinctAccentPeakUnobservableRejectedOptionCount,
		surfaceOpportunityByBackgroundFamily: candidateAdditions.surfaceOpportunityByBackgroundFamily,
	}
	const candidateGeneration = selectCompletePaletteTreatmentDomain(candidateDomain)
	for (let index = 0; index < controlGeneration.completeTreatments.length; index++) {
		if (candidateGeneration.completeTreatments[index] !== controlGeneration.completeTreatments[index]) {
			throw new Error("0.7.4 candidate domain did not preserve the exact control prefix")
		}
	}
	const controlResult = assembleAlbumArtworkPaletteV2Result(
		image,
		evidence,
		fieldDomains,
		evaluatedGradientFits,
		controlHypotheses,
		controlGeneration,
		ALBUM_ARTWORK_PALETTE_V2_VERSION,
		ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
	)
	const candidateResult = assembleAlbumArtworkPaletteV2Result(
		image,
		evidence,
		fieldDomains,
		evaluatedGradientFits,
		candidateHypotheses,
		candidateGeneration,
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL,
	)
	const registry: AlbumArtworkPaletteV2074Registry = {
		...recallRegistry,
		version: "album-artwork-palette-v2-recall-registry-0.7.4",
	}
	const changedStages = ["field-hypothesis-retention"] as const
	return {
		result: candidateResult,
		audit: {
			version: "album-artwork-palette-v2-0.7.4-core-audit-v1",
			mechanism: "widened-field-hypothesis-retention",
			changedStages,
			construction: {
				proposalScope: "all-existing-semantics-control-lanes",
				representatives: "preferred",
				fieldRepresentativePairing: "same-index",
				materialization: "additive-control-prefix",
			},
			controlPrefixLength: controlGeneration.completeTreatments.length,
			control: albumArtworkPaletteV2074CoreDomain(controlDomain, controlGeneration, controlResult, []),
			candidate: albumArtworkPaletteV2074CoreDomain(
				candidateDomain,
				candidateGeneration,
				candidateResult,
				changedStages,
			),
			additions,
			registry,
		},
	}
}

export function extractAlbumArtworkPaletteV2074(image: RawImage): AlbumArtworkPaletteV2Result {
	return extractAlbumArtworkPaletteV2074Details(image).result
}

export async function extractAlbumArtworkPaletteV2074FromSource(
	source: string | Uint8Array,
): Promise<AlbumArtworkPaletteV2Result> {
	return extractAlbumArtworkPaletteV2074(await loadNativeImage(source))
}

export function extractAlbumArtworkPaletteV2(image: RawImage): AlbumArtworkPaletteV2Result {
	const evidence = buildNativePaletteEvidence(image)
	const fieldDomains = buildBackgroundFieldDomains(evidence)
	const evaluatedGradientFits = evaluateGradientFits(evidence, fieldDomains)
	const fieldHypotheses = buildFieldHypothesesFromEvaluatedFits(evidence, evaluatedGradientFits)
	const gradientFits = gradientFitDiagnostics(evaluatedGradientFits)
	if (fieldHypotheses.length === 0) throw new Error("No defensible field hypothesis was found")
	const generation = generateCompletePaletteTreatments(evidence, fieldHypotheses)
	const retainedIds = new Set(evidence.retainedFamilyIds)
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
		width: image.width,
		height: image.height,
		winner: generation.winner,
		alternatives: generation.alternatives,
		diagnostics: {
			nativeDiscovery: true,
			preDiscoveryResize: false,
			familyCount: evidence.families.length,
			retainedFamilyCount: evidence.retainedFamilyIds.length,
			lanes: evidence.lanes,
			laneRetention: evidence.laneRetention,
			families: evidence.families.filter(({ id }) => retainedIds.has(id)),
			fieldDomains: fieldDomains
				.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedDiagnosticFieldDomains)
				.map(({ evidence: domainEvidence }) => domainEvidence),
			fieldHypotheses,
			gradientFits,
			completeCandidateCount: generation.candidateCount,
			candidateAvailability: generation.candidateAvailability,
			identityObligationGraph: generation.identityObligationGraph,
			exactOverlayGradientChallenger: generation.exactOverlayGradientChallenger,
			paretoRanking: generation.paretoRanking,
			legacyScalarTopTreatment: generation.legacyScalarTopTreatment,
			emergency: generation.emergency,
			bounds: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds,
		},
	}
}

export async function extractAlbumArtworkPaletteV2FromSource(source: string | Uint8Array): Promise<AlbumArtworkPaletteV2Result> {
	return extractAlbumArtworkPaletteV2(await loadNativeImage(source))
}
