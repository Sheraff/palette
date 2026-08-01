import { apcaContrast, chroma, labAt, mixOKLab, okDistance, oklabToRGB, perceptualDifference, rgbAt, rgbToHex, rgbToOKLab, toLabBuffer } from "./color.ts";

import { ALBUM_ARTWORK_PALETTE_V2_POLICY, ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "./policy.ts";

import type { AlbumArtworkPaletteV2QualityBlock } from "./policy.ts";

import { analyzeBandPopulation, createBandSpatialSpreadAccumulator } from "./band-representative.ts";

import type { BandRepresentativeSample, BandSpatialSpreadLookup } from "./band-representative.ts";

import { familyAccentRoleEvidence } from "./role-obligations.ts";

import type { OKLab, RGB, RawImage } from "./types.ts";

export type RepresentativeStrategy = "dense-exact" | "nearest-prototype" | "density-synthesized"

export type FieldTreatmentKind = "one-field" | "separate-flat-fields" | "gradient-field"

export type GradientTopology = "linear" | "radial-center" | "radial-upper-center" | "radial-offset"

export type GradientDirection =
	"horizontal" | "vertical" | "diagonal-down" | "diagonal-up" | "center-out" |
	"angle-22.5" | "angle-67.5" | "angle-112.5" | "angle-157.5" |
	"center-0.35-0.50" | "center-0.65-0.50" | "center-0.50-0.65"

export type Role = "background" | "surface" | "foreground" | "accent"

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
	/**
	 * Region-observation evidence that the anchor family is a deliberate mark
	 * (see `ALBUM_ARTWORK_PALETTE_V2_POLICY.mark`). Bounded to `[0, 1]` and
	 * measured, never assumed: it substitutes for the population-normalised
	 * support terms of a family too small to satisfy them.
	 */
	markSupport: number
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
	/**
	 * Bounded region-observation evidence that this family is a deliberate mark
	 * — repeated, resolved, interior strokes materially separated from the
	 * field — rather than a fraction of a percent of noise. See
	 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.mark`.
	 */
	markSupport: number
	markComponentCount: number
	observedComponentCount: number
	/**
	 * Set when `mountFamilyIds` reads this family as a frame or matte rather than ground — a
	 * family that owns the border while a materially larger field family it encloses owns none
	 * of it. Absent means "not measured as a mount"; see
	 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.mount`. It is recorded rather than recomputed because the
	 * test needs every family at once, and both consumers (the `fieldScore` border credit and
	 * the role-ownership peripheral credit) must agree on the answer.
	 */
	isMount?: boolean
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
	/**
	 * Families withdrawn from the field lane as optical mixtures of the two
	 * dominant fields (`ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend`) — colours that
	 * exist only because two fields meet, so they cannot be published as a field
	 * colour. Diagnostic only elsewhere: every other consumer sees these families
	 * unchanged.
	 */
	absorbedFieldFamilyIds: readonly string[]
	familyBinStep: number
	familyAnchorRadius: number
}>

export type BackgroundFieldDomainEvidence = Readonly<{
	id: string
	kind: "connected" | "paired-corridor" | "diffuse-composite"
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

/**
 * The colour the field actually carries at the gradient's spatial midpoint.
 *
 * The public render is a two-stop background -> surface interpolation. That is only faithful
 * when the artwork's field runs straight between its endpoints in OKLab. When the field bows
 * away from that chord -- sweeping through an amber that neither end contains, say -- the
 * two-stop render invents a colour the artwork does not have and omits one it does. This
 * record carries the measured evidence needed to decide, at render time and against the
 * endpoints actually selected, whether a third stop is earned.
 */
export type FieldMidpointEvidence = Readonly<{
	rgb: RGB
	oklab: OKLab
	hex: string
	/** Share of the domain lying in the sampled midpoint band. */
	bandPopulationFraction: number
	/** Share of that band occupied by this colour's own neighbourhood. */
	occupancyShare: number
	spatialSpreadRatio: number
	/**
	 * How far off the endpoint chord this colour must sit before a third stop is earned.
	 * Carried here so the earn rule is answerable from the evidence plus a candidate's own
	 * endpoints, with no access to the family bin step.
	 */
	minimumChordDeviation: number
	provenance: Readonly<{
		exactSource: true
		familyId: string
		fieldDomainId: string
		pixelIndex: number
		x: number
		y: number
	}>
}>

export type GradientFieldEvidence = Readonly<{
	topology: GradientTopology
	direction: GradientDirection
	endpointBands: readonly [number, number]
	/** Present only for fit-derived gradient fields; null when no representative colour qualified. */
	fieldMidpoint: FieldMidpointEvidence | null
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
	/**
	 * For a gradient hypothesis, the RMS spatial extent inside the endpoint band of each
	 * published representative, index-aligned with the arrays above. Every gradient
	 * producer supplies it — the seed fit, the band-local endpoint refinement, and the
	 * native field transition — so a same-family pair from two different producers is
	 * comparable on this axis instead of one of them silently reading as zero.
	 *
	 * Absent as a whole only for flat hypotheses, which have no band. A `null` *entry* is
	 * a representative whose colour no band pixel carries: the statistic is not measured
	 * for it, and comparators must treat that as incomparable rather than as zero.
	 */
	endpointBandSpread?: Readonly<{
		background: readonly (number | null)[]
		surface: readonly (number | null)[]
	}>

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
	foregroundUtility: number
	foregroundPolarityAgreement: number
	accentFidelity: number
	accentUtility: number
	coherence: number
	economy: number
	generatedPenalty: number
	/**
	 * Summed RMS spatial extent of the two field endpoints inside their bands.
	 * Zero for every non-gradient treatment, which has no band. `null` for a
	 * gradient whose endpoint spread could not be measured — an axis this
	 * candidate carries no evidence on, on which it can neither win nor lose.
	 */
	endpointBandSpread: number | null
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

export type IdentityObligation = Readonly<{
	id: string
	familyId: string
	priority: number
	/**
	 * The colour direction this obligation stands for: its family's OKLab prototype.
	 *
	 * An obligation is a claim that the artwork shows *this colour*. The family id records which
	 * evidence made the claim; it is not the claim itself, and two families can carry one colour
	 * direction. The identity objective needs the direction in order to say whether a palette shows
	 * it, rather than only whether the palette drew its pixels from that particular family.
	 */
	direction: OKLab
	source: Readonly<{
		regionIds: readonly string[]
		connectedPopulationFraction: number
		materialDistanceFromField: number
		signatureRoleScore: number
		signatureEvidenceLevel: number
		regionEvidenceLevel: number
	}>
}>

type IdentitySelectionTrace = Readonly<{
	maximumObligations: number
	evaluatedSignatureFamilyIds: readonly string[]
	fieldOwnedFamilyIds: readonly string[]
	notSourceConnectedFamilyIds: readonly string[]
	notMateriallyDistinctFamilyIds: readonly string[]
	redundantDirectionFamilyIds: readonly string[]
	neutralQuotaOmittedFamilyIds: readonly string[]
	/** Neutrals the quota was full for, admitted because their polarity claim opposed every selected neutral's. */
	polarityExemptFamilyIds: readonly string[]
	/** Obligations whose priority moved when opposite-polarity neutrals were re-ordered by polarity decisiveness. */
	polarityReorderedFamilyIds: readonly string[]
	boundOmittedFamilyIds: readonly string[]
	reservedMajorFamilyIds: readonly string[]
}>

export type FamilyRegistryEntry = Readonly<{
	familyId: string
	sourceConnected: boolean
	representativeStrategies: readonly ColorRepresentative["strategy"][]
	laneRanks: Readonly<Record<EvidenceLane["name"], number>>
	controlRetainedLanes: readonly EvidenceLane["name"][]
	identityObligation: boolean
}>

export type FieldHypothesisRegistryEntry = Readonly<{
	hypothesisId: string
	kind: FieldTreatmentKind
	familyIds: readonly string[]
	sourceConnected: boolean
	controlProposed: boolean
	controlRetained: boolean
}>

export type FieldDirectionRegistryEntry = Readonly<{
	key: string
	hypothesisIds: readonly string[]
	familyIds: readonly string[]
	sourceConnected: boolean
}>

export type RoleDirectionRegistryEntry = Readonly<{
	key: string
	role: "foreground" | "accent"
	familyId: string
	sourceConnected: boolean
	identityObligation: boolean
}>

export type SourceRegistry = Readonly<{
	families: readonly FamilyRegistryEntry[]
	fieldHypotheses: readonly FieldHypothesisRegistryEntry[]
	fieldDirections: readonly FieldDirectionRegistryEntry[]
	roleDirections: readonly RoleDirectionRegistryEntry[]
	identityObligationFamilyIds: readonly string[]
}>

export type TreatmentLineage = Readonly<{
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

export type SeedAddition = Readonly<{
	treatment: CompletePaletteTreatment
	key: string
	lineage: TreatmentLineage
}>

/**
 * Extraction parameters a library user may set. Every field defaults to the value in
 * `ALBUM_ARTWORK_PALETTE_V2_POLICY`, and the defaults reproduce the reviewed behaviour exactly.
 */
export type PaletteExtractionOptions = Readonly<{
	/**
	 * APCA |Lc| a role must exceed somewhere along the field to be considered observable at all.
	 *
	 * Charter rule 2: the contrast here is deliberately very low and this is **not** an
	 * accessibility floor, so the default is `0` — a role only has to be outside APCA's exact
	 * zero-contrast dead-zone. A library user who needs a stricter floor raises it; nothing in the
	 * algorithm may raise it on their behalf.
	 */
	contrastHardMinimum: number
}>

export const DEFAULT_PALETTE_EXTRACTION_OPTIONS: PaletteExtractionOptions = Object.freeze({
	contrastHardMinimum: ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum,
})

export type PaletteSeedDomain = Readonly<{
	evidence: NativePaletteEvidence
	fieldDomains: readonly BackgroundFieldDomainEvidence[]
	/**
	 * The gradient-fit diagnostics for `evidence`, computed once here.
	 *
	 * `buildAlbumArtworkPaletteV2Phase3CommonBase` needs exactly this, and used to recompute it
	 * by calling `diagnoseGradientFits(seed.evidence)` — a second full `buildBackgroundFieldDomains`
	 * plus `evaluateGradientFits` over the identical object, which is ~20 % of a run. Both are
	 * deterministic functions of the evidence, so carrying the result is behaviour-identical.
	 */
	gradientFitDiagnostics: readonly GradientFitDiagnostic[]
	fieldHypotheses: readonly FieldHypothesis[]
	completeTreatments: readonly CompletePaletteTreatment[]
	additions: readonly SeedAddition[]
	registry: SourceRegistry
	identityObligations: readonly IdentityObligation[]
	emergency: EmergencyEligibility
}>

export type AlbumArtworkPaletteV2Phase3SupplementalTreatment = Readonly<{
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: TreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3SupplementalConstruction = Readonly<{
	hypotheses: readonly FieldHypothesis[]
	treatments: readonly AlbumArtworkPaletteV2Phase3SupplementalTreatment[]
	constructedTreatmentCountByHypothesis: Readonly<Record<string, number>>
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
	/**
	 * Summed RMS spatial extent of the two endpoint representatives inside their
	 * bands. Two variants of one gradient hypothesis differ only in which
	 * representative carries each endpoint; this says which pair covers more of
	 * the gradient's surface. `null` when either endpoint's spread was not
	 * measured, which is incomparable — never a substitute zero.
	 */
	endpointBandSpread: number | null
	/**
	 * Midpoint evidence this variant's hypothesis carries, before the earn decision.
	 * Present so contrast is measured against the ramp this variant would actually render.
	 */
	fieldMidpoint: FieldMidpointEvidence | null
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
	/**
	 * RMS spatial extent, inside the endpoint band, of the pixels carrying a queried
	 * colour's bin. Lets endpoint selection ask how much of the band's *surface* a
	 * candidate representative actually covers, which colour distance alone cannot
	 * express. `null` for a colour no band pixel carries — not measured, not zero.
	 */
	bandSpread: BandSpatialSpreadLookup
}>

type EvaluatedGradientFit = Readonly<{
	fit: GradientFit
	progression: number
	modeProgression: number
	bandDispersion: number
	edgeContinuity: number
	low: BandEndpoint | null
	high: BandEndpoint | null
	fieldMidpoint: FieldMidpointEvidence | null
	rejectionReasons: readonly string[]
}>

type IdentityObligationSelection = Readonly<{
	obligations: readonly IdentityObligation[]
	trace: IdentitySelectionTrace
}>

type BackgroundFieldDomain = Readonly<{
	evidence: BackgroundFieldDomainEvidence
	pixelIndexes: Uint32Array
}>

// PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:290`): +-20 % moves 150 of the 154 artworks
// it is live on — 97 % of published palettes, the largest blast radius of any constant measured in
// this algorithm. Exported only so `test/configuration.test.ts` can pin it; nothing else reads it
// from outside. Treat any change as a full re-review.
export const FAMILY_BIN_STEP = 0.04

const FAMILY_ANCHOR_RADIUS = 0.058

// PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:295`): +-20 % moves 51 of 154. Exported for
// the pin in `test/configuration.test.ts`. NOT the same quantity as `FAMILY_BIN_STEP` above or
// `RESOLUTIONS.evidence` (see `policy.ts:9-13`); they merely share the literal 0.04.
export const REPRESENTATIVE_DENSITY_RADIUS = 0.04

const MINIMUM_DISTINCT_DISTANCE = 0.018

const GRID_SIZE = 12

const RANKING_EVIDENCE_RESOLUTION = ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence

// A diffuse or multiscale continuous field is shattered by grain, texture, and wide
// progression into many perceptual families, most of which fall outside the ranked field
// lane. A fragment of such a field is *embedded* in it: nearly its whole inter-family
// boundary is a low-contrast adjacency to the field. A separate object, a stripe, or a
// hard region is not, because it meets the field across a step the anchor radius rejects.
// This fraction is the admission test for field-composite membership.
const FIELD_COMPOSITE_EMBEDDED_BOUNDARY_FRACTION = 0.75

type NativeEvidenceOptions = Readonly<{
	familyBinStep: number
	familyAnchorRadius: number
	largestComponentsPerFamily: number
	roleObservationComponentsPerFamily: number
	familyIdPrefix: string
}>

const DEFAULT_NATIVE_EVIDENCE_OPTIONS: NativeEvidenceOptions = Object.freeze({
	familyBinStep: FAMILY_BIN_STEP,
	familyAnchorRadius: FAMILY_ANCHOR_RADIUS,
	largestComponentsPerFamily: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.largestComponentsPerFamily,
	roleObservationComponentsPerFamily: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.roleObservationComponentsPerFamily,
	familyIdPrefix: "",
})

type GradientFitOptions = Readonly<{
	fitGridSize: number
	nativeBandCount: number
	additionalGeometries: boolean
}>

const DEFAULT_GRADIENT_FIT_OPTIONS: GradientFitOptions = Object.freeze({
	fitGridSize: GRID_SIZE,
	nativeBandCount: GRID_SIZE,
	additionalGeometries: false,
})

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

/**
 * Exported so the other producers of gradient field hypotheses
 * (`endpoint-refinement.ts`, `field-transition.ts`) bin band colours into exactly the bins
 * this module's evidence uses, instead of each growing its own quantisation.
 */
export function quantizedKey([lightness, a, b]: OKLab, step = FAMILY_BIN_STEP): number {
	return quantizedKeyOf(lightness, a, b, step)
}

/**
 * `quantizedKey` on loose channels, for the per-pixel loops that would otherwise have to build an
 * `OKLab` tuple purely to hand it to the destructuring signature above. Same body, so the two can
 * never drift apart.
 */
export function quantizedKeyOf(lightness: number, a: number, b: number, step = FAMILY_BIN_STEP): number {
	if (step === FAMILY_BIN_STEP) {
		const lightnessBin = Math.max(0, Math.min(25, Math.floor(lightness / FAMILY_BIN_STEP)))
		const aBin = Math.max(0, Math.min(20, Math.floor((a + 0.4) / FAMILY_BIN_STEP)))
		const bBin = Math.max(0, Math.min(20, Math.floor((b + 0.4) / FAMILY_BIN_STEP)))
		return lightnessBin * 441 + aBin * 21 + bBin
	}
	const lightnessMaximum = Math.round(1 / step)
	const channelMaximum = Math.round(0.8 / step)
	const channelCount = channelMaximum + 1
	const lightnessBin = Math.max(0, Math.min(lightnessMaximum, Math.floor(lightness / step)))
	const aBin = Math.max(0, Math.min(channelMaximum, Math.floor((a + 0.4) / step)))
	const bBin = Math.max(0, Math.min(channelMaximum, Math.floor((b + 0.4) / step)))
	return lightnessBin * channelCount * channelCount + aBin * channelCount + bBin
}

function binPrototype(bin: PerceptualBin): OKLab {
	return [bin.sumL / bin.population, bin.sumA / bin.population, bin.sumB / bin.population]
}

/**
 * How much a connected component looks like a deliberate element rather than a patch of field,
 * before any family-level evidence exists. It is the key `retainFamilyComponents` ranks role
 * observation by, so every producer of components has to compute it the same way.
 */
export function componentRolePreliminary(
	component: Readonly<{
		population: number; minX: number; minY: number; maxX: number; maxY: number
		borderPixels: number; boundaryEdges: number; boundaryContrastSum: number
	}>,
	pixelCount: number,
): number {
	const width = component.maxX - component.minX + 1
	const height = component.maxY - component.minY + 1
	const bounds = width * height
	const resolved = clamp(Math.log2(component.population + 1) / 8)
	const nonField = 1 - clamp(bounds / pixelCount / 0.18)
	const fill = component.population / Math.max(1, bounds)
	const localContrast = component.boundaryContrastSum / Math.max(1, component.boundaryEdges)
	const borderInterior = 1 - clamp(component.borderPixels / Math.max(1, component.population) / 0.25)
	return clamp(
		Math.sqrt(resolved * nonField) *
		(0.35 + 0.25 * clamp(fill / 0.12) + 0.25 * clamp(localContrast / 0.16) + 0.15 * borderInterior),
	)
}

/**
 * The component-retention policy: a family keeps its largest components as connected support and
 * its most element-like ones as role observation, and nothing else.
 *
 * Exported because the band-local endpoint families in `endpoint-refinement.ts` must earn their
 * role evidence under exactly this rule rather than a second one written beside it. The native
 * scan reaches it through `insertComponent`, one component at a time, because it cannot hold every
 * component of every family at once; a producer that already has the whole set calls it directly.
 * Both take the same ranking and the same bounds.
 */
function compareComponentsByPopulation(first: MutableComponent, second: MutableComponent): number {
	return compareNumbersDescending(first.population, second.population) || first.start - second.start
}

function compareComponentsByRoleObservation(first: MutableComponent, second: MutableComponent): number {
	return compareNumbersDescending(first.rolePreliminary, second.rolePreliminary) ||
		compareNumbersDescending(first.population, second.population) ||
		first.start - second.start
}

/**
 * The `limit` best candidates under `compare`, in `compare` order, written into `top`.
 *
 * Both retention rankings end in `first.start - second.start`, and a component's `start` is the
 * pixel the flood entered it from, so no two components can tie: each comparator is a *total* order
 * over the candidate set. That is what makes selection interchangeable with the sort it replaces —
 * `sort(compare).slice(0, limit)` has exactly one possible answer when no two elements compare
 * equal, so any correct top-`limit` produces the identical array, element for element.
 */
function selectTopComponents(
	candidates: readonly MutableComponent[],
	limit: number,
	compare: (first: MutableComponent, second: MutableComponent) => number,
	top: MutableComponent[],
): void {
	top.length = 0
	if (limit <= 0) return
	for (const candidate of candidates) {
		let index = top.length
		while (index > 0 && compare(candidate, top[index - 1]!) < 0) index -= 1
		if (index >= limit) continue
		for (let shift = Math.min(top.length, limit - 1); shift > index; shift -= 1) {
			top[shift] = top[shift - 1]!
		}
		top[index] = candidate
	}
}

/** Whether `components` holds the component that entered the flood at `start`. */
function containsComponentStart(components: readonly MutableComponent[], start: number): boolean {
	for (let index = 0; index < components.length; index++) {
		if (components[index]!.start === start) return true
	}
	return false
}

/**
 * Rewrite `retainedFor` only when the retention actually changed.
 *
 * A component keeps its list across inserts far more often than it changes it — the eight largest
 * of a family are mostly stable once the family has a few hundred components — and the array's
 * *contents* are all any consumer reads (`retainedFor.includes(...)`, and one field copy into the
 * public record). Nothing observes its identity, so leaving an equal array in place is invisible.
 */
function applyComponentRetention(component: MutableComponent, support: boolean, role: boolean): void {
	const existing = component.retainedFor
	const expected = (support ? 1 : 0) + (role ? 1 : 0)
	if (existing.length === expected &&
		(!support || existing[0] === "connected-support") &&
		(!role || existing[expected - 1] === "role-observation")) {
		return
	}
	component.retainedFor = support
		? (role ? ["connected-support", "role-observation"] : ["connected-support"])
		: ["role-observation"]
}

/**
 * Scratch for the two rankings. `retainInto` is a leaf — it calls only the two comparators and the
 * helpers above, none of which re-enter it — so one pair of buffers serves every call and the
 * ~325k retentions a ten-artwork run performs allocate nothing for them.
 */
const largestScratch: MutableComponent[] = []
const roleObservedScratch: MutableComponent[] = []

function retainInto(
	candidates: readonly MutableComponent[],
	options: NativeEvidenceOptions,
	retained: MutableComponent[],
): MutableComponent[] {
	selectTopComponents(candidates, options.largestComponentsPerFamily,
		compareComponentsByPopulation, largestScratch)
	selectTopComponents(candidates, options.roleObservationComponentsPerFamily,
		compareComponentsByRoleObservation, roleObservedScratch)
	retained.length = 0
	// The reference walked `[...largest, ...roleObserved]` into a `Map` keyed by `start`, which keeps
	// each component once and in that order; the two loops below are that dedup written out. The
	// final ordering is a total order over the union, so the intermediate order cannot show through.
	for (const candidate of largestScratch) {
		applyComponentRetention(candidate, true, containsComponentStart(roleObservedScratch, candidate.start))
		retained.push(candidate)
	}
	for (const candidate of roleObservedScratch) {
		if (containsComponentStart(largestScratch, candidate.start)) continue
		applyComponentRetention(candidate, false, true)
		retained.push(candidate)
	}
	return retained.sort(compareComponentsByPopulation)
}

export function retainFamilyComponents(
	candidates: readonly MutableComponent[],
	options: NativeEvidenceOptions = DEFAULT_NATIVE_EVIDENCE_OPTIONS,
): MutableComponent[] {
	return retainInto(candidates, options, [])
}

/**
 * The flood calls this once per connected component — ~325k times over ten artworks, and ~100k on a
 * single busy one. The reference spent roughly a hundred allocations on each of those calls: a
 * concatenated candidate array, two full copies of it, two `slice`s, two `map`s, two `Set`s, a
 * `Map`, another concatenation, three array literals per retained component for the `retainedFor`
 * spread, and a spread into `splice`. None of that is the retention *policy*, which is unchanged.
 */
const insertScratch: MutableComponent[] = []

function insertComponent(
	components: MutableComponent[],
	component: MutableComponent,
	options: NativeEvidenceOptions,
): void {
	components.push(component)
	retainInto(components, options, insertScratch)
	components.length = 0
	for (let index = 0; index < insertScratch.length; index++) components.push(insertScratch[index]!)
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

/**
 * The region role score is `sourceSupport` shaded by the role cues:
 * `sourceSupport * (BASE + CUE_SPAN * cues)`. The two sum to 1, so a component with every cue
 * saturated scores exactly its source support and one with no cue at all keeps `BASE` of it. That
 * complementarity is the only thing on record about either number — it is one degree of freedom
 * written as two literals, and nothing derives where in [0, 1] the split sits.
 *
 * PERVASIVE CLIFFS, both (Track P tier A, `track-p/LEDGER.md:296-297`): each is live on all 154
 * artworks; +-20 % on the base moves 49 (32 %) and on the cue span moves 45 (29 %). Lifted from
 * their single use site below, values unchanged.
 */
export const REGION_ROLE_SCORE_SUPPORT_BASE = 0.45

export const REGION_ROLE_SCORE_CUE_SPAN = 0.55

/**
 * How big a component has to be before its size stops counting for anything, on a log2 pixel
 * scale: `clamp(log2(population + 1) / SCALE)`. At 8 a component reaches full credit at 255
 * pixels, and every component larger than that is treated the same.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): live on all 154
 * artworks, and moving it to 7 or 9 moves 32 of them (21 %). It is an integer, so it was perturbed
 * to the adjacent integers rather than scaled. It also carries the strongest over-fitting
 * signature in that sweep — it moves unseen artwork 2.1x as often as reviewed artwork.
 *
 * `componentRolePreliminary` computes the same expression from its own bare `8`. The sweep
 * measured the two as independent sites and only this one reached the top bucket, so they are not
 * unified here — whether they are one quantity or two that happen to agree is an open question,
 * not something this lift decides.
 */
export const REGION_RESOLVED_POPULATION_LOG2_SCALE = 8

/**
 * The boundary contrast at which a component counts as fully contrasting against its
 * surroundings: `clamp(localContrast / FULL)`. Everything above this reads the same to the role
 * cues, so this number decides what "high contrast" means for typography and signature detection
 * alike.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): live on all 154
 * artworks, +-20 % moves 43 of them (28 %). It is a scale divisor, not a weight — it does not
 * belong to any vector and nothing renormalises when it moves.
 *
 * `componentRolePreliminary` and `distinctive` each divide a local contrast by their own bare
 * `0.16`. Same caveat as the population scale above: three sites, measured independently, one of
 * them a cliff, and nothing on record says whether they are one quantity or three.
 */
export const REGION_FULL_LOCAL_CONTRAST = 0.16

/**
 * The share of its own colour family that a single component must hold before it counts as fully
 * representative of that family: `clamp(componentFamilyFraction / FULL)`. At 0.1 a component
 * holding a tenth of its family's pixels already gets full credit.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): live on all 154
 * artworks, +-20 % moves 36 of them (23 %). Also a scale divisor rather than a weight.
 */
export const REGION_FULL_COMPONENT_FAMILY_FRACTION = 0.1

/**
 * How much of "this component sits inside the frame rather than running off it" comes from each
 * of the two ways of asking. `borderClearance` is how little of the component's outline touches
 * the image border; `interiorMargin` is how far its bounding box keeps away from every edge. The
 * two sum to 1.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the 0.75 term is live
 * on all 154 artworks and +-20 % moves 44 of them (29 %). Perturbing one term breaks the sum —
 * nothing renormalises downstream — so the vector is one decision, not two.
 */
export const REGION_BORDER_INTERIOR_WEIGHTS = Object.freeze({
	borderClearance: 0.75,
	interiorMargin: 0.25,
} as const)

/**
 * How much of a component's claim to be a real mark, rather than noise, comes from each kind of
 * size evidence: its own resolved pixel count, its share of the whole image, and its family's
 * share of the image scaled by how much of that family the component itself is. The three sum
 * to 1.
 *
 * PERVASIVE CLIFFS, all three (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): live on
 * all 154 artworks, and +-20 % moves 64 (42 %), 44 (29 %) and 40 (26 %) respectively. The 0.55
 * term is the largest single non-artifact cliff the tier-B sweep found.
 */
export const REGION_SOURCE_SUPPORT_WEIGHTS = Object.freeze({
	resolvedPopulation: 0.55,
	componentShare: 0.25,
	familyShare: 0.20,
} as const)

/**
 * How much of "this component looks like a logo, wordmark or other signature graphic" comes from
 * each cue. The five sum to 1.
 *
 * The typography cues on the next line down are the same five cues with different weights
 * (.24 / .14 / .22 / .24 / .16), and they are deliberately **not** lifted here: the tier-B sweep
 * measured them as load-bearing but not cliffs (6, 5, 4, 4 and 2 flips against 40, 39, 36, 35 and
 * 35 for these). Two structurally identical formulas ten lines apart differ 7-20x in blast radius,
 * and nothing in the file says why.
 *
 * PERVASIVE CLIFFS, all five (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): each live
 * on all 154 artworks. +-20 % moves 40 artworks (26 %) on `geometry`, 39 (25 %) on
 * `localContrast`, 36 (23 %) on `borderInterior`, and 35 (23 %) on each of `fill` and
 * `repetition`. Perturbing one term breaks the sum, so treat the vector as one decision.
 */
export const SIGNATURE_CUE_WEIGHTS = Object.freeze({
	geometry: 0.20,
	fill: 0.16,
	repetition: 0.16,
	localContrast: 0.30,
	borderInterior: 0.18,
} as const)

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
		const resolved = clamp(Math.log2(component.population + 1) / REGION_RESOLVED_POPULATION_LOG2_SCALE)
		const nonField = 1 - clamp(boundsFraction / 0.18)
		const geometry = Math.sqrt(resolved * nonField) * (1 - 0.2 * clamp((elongation - 20) / 20))
		const typographyFill = clamp(fill / 0.12) * (1 - 0.5 * clamp((fill - 0.82) / 0.18))
		const signatureFill = clamp(fill / 0.12)
		const contrast = clamp(localContrast / REGION_FULL_LOCAL_CONTRAST)
		const borderInterior = REGION_BORDER_INTERIOR_WEIGHTS.borderClearance * (1 - clamp(borderContact / 0.25)) +
			REGION_BORDER_INTERIOR_WEIGHTS.interiorMargin * clamp(interiorMargin / 0.08)
		const sourceSupport = clamp(
			REGION_SOURCE_SUPPORT_WEIGHTS.resolvedPopulation * resolved +
			REGION_SOURCE_SUPPORT_WEIGHTS.componentShare * clamp(component.population / pixelCount / 0.001) +
			REGION_SOURCE_SUPPORT_WEIGHTS.familyShare * clamp(familyPopulation / pixelCount / 0.001) *
				clamp(componentFamilyFraction / REGION_FULL_COMPONENT_FAMILY_FRACTION),
		)
		const typographyCues = 0.24 * geometry + 0.14 * typographyFill + 0.22 * repetition + 0.24 * contrast + 0.16 * borderInterior
		const signatureCues = SIGNATURE_CUE_WEIGHTS.geometry * geometry +
			SIGNATURE_CUE_WEIGHTS.fill * signatureFill +
			SIGNATURE_CUE_WEIGHTS.repetition * repetition +
			SIGNATURE_CUE_WEIGHTS.localContrast * contrast +
			SIGNATURE_CUE_WEIGHTS.borderInterior * borderInterior
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
			score: clamp(sourceSupport * (REGION_ROLE_SCORE_SUPPORT_BASE + REGION_ROLE_SCORE_CUE_SPAN * cues)),
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

/** The family-level facts the role scores read, apart from the components themselves. */
export type FamilyRoleEvidenceInput = Readonly<{
	familyId: string
	/** Every component the family owns, unretained: `retainFamilyComponents` is applied here. */
	components: readonly MutableComponent[]
	population: number
	pixelCount: number
	width: number
	height: number
	populationFraction: number
	largestComponentFraction: number
	familyConcentration: number
	localContrast: number
	chroma: number
	borderCoverage: number
	centerCoverage: number
}>

export type FamilyRoleEvidence = Readonly<{
	signatureScore: number
	foregroundScore: number
	foregroundTypographyObservation: number
	foregroundPolarityObservation: ForegroundPolarityObservation
	signatureAccentObservation: number
	observedComponentCount: number
	components: readonly ComponentEvidence[]
}>

/**
 * Everything a colour family's *role* claim is made of: how much it looks like the artwork's
 * signature, how much it looks like its text, the region observations behind both, and the
 * polarity of its foreground claim.
 *
 * This is the single implementation. The native scan reaches it for every family it builds, and
 * `endpoint-refinement.ts` reaches it for every band-local endpoint family, so a family measured
 * inside a gradient band is judged by the same evidence as a family measured across the whole
 * image. It used to be native-only, and the band-local constructor filled these fields with
 * zeroes — which meant a band-local family could win a *field* but was structurally incapable of
 * ever earning a role or an identity obligation, whatever its pixels showed.
 *
 * Mark support is deliberately *not* computed here: it is measured against the families that own
 * the field, so it can only be known once every family exists (`markSupportOf`).
 *
 * `retainFamilyComponents` is applied here on the default bounds, which is why the native scan can
 * hand its already-retained list straight in: incremental top-k retention by population and by
 * `rolePreliminary` yields the exact top-k, so re-applying the same bounds to the result is the
 * identity. `buildNativePaletteEvidence` has one call site and it takes the defaults; a caller that
 * ever passes different bounds has to pass them here too.
 */
export function measureFamilyRoleEvidence(input: FamilyRoleEvidenceInput): FamilyRoleEvidence {
	const components = retainFamilyComponents(input.components)
	const observations = buildRegionObservations(
		components, input.population, input.pixelCount, input.width, input.height)
	const foregroundTypographyObservation = aggregateRegionScores(components.map(({ start }) =>
		observations.get(start)?.foregroundTypography.score ?? 0))
	const signatureAccentObservation = aggregateRegionScores(components.map(({ start }) =>
		observations.get(start)?.signatureAccent.score ?? 0))
	const componentCoherence = clamp(input.familyConcentration)
	const coherentSupport = clamp(input.largestComponentFraction / SIGNATURE_COHERENT_SUPPORT_SCALE)
	const repeatCount = components.filter(({ population }) => population / input.pixelCount >= 0.00025).length
	const repeatedSupport = clamp((repeatCount - 1) / 3)
	const distinctive = clamp(input.localContrast / 0.16)
	const chromatic = clamp(input.chroma / 0.18)
	const notBroad = 1 - clamp((input.populationFraction - 0.18) / 0.35)
	return {
		signatureScore: clamp(
			SIGNATURE_COHERENT_SUPPORT_WEIGHT * coherentSupport +
			0.18 * componentCoherence +
			0.16 * repeatedSupport +
			0.22 * distinctive +
			0.11 * chromatic +
			0.08 * notBroad,
		),
		foregroundScore: clamp(
			0.34 * clamp(input.populationFraction / 0.025) +
			0.25 * componentCoherence +
			0.20 * distinctive +
			0.13 * chromatic +
			0.08 * clamp((input.borderCoverage + input.centerCoverage) / 2),
		),
		foregroundTypographyObservation,
		foregroundPolarityObservation: foregroundPolarityObservation(input.familyId, components, observations),
		signatureAccentObservation,
		observedComponentCount: components.filter(({ retainedFor }) => retainedFor.includes("role-observation")).length,
		components: components.map((component) => ({
			id: `${input.familyId}-region-${component.start}`,
			startPixelIndex: component.start,
			population: component.population,
			populationFraction: component.population / input.pixelCount,
			minX: component.minX,
			minY: component.minY,
			maxX: component.maxX,
			maxY: component.maxY,
			borderPixels: component.borderPixels,
			retainedFor: component.retainedFor,
			observation: observations.get(component.start)!,
		})),
	}
}

/**
 * The field prototypes mark evidence measures separation against: the strongest field families of
 * the image, in the algorithm's own ordering. Exported so a producer outside this module asks the
 * same question of the same references.
 */
export function markFieldReferencePrototypes(families: readonly ColorFamilyEvidence[]): OKLab[] {
	return [...families]
		.sort((first, second) =>
			compareNumbersDescending(first.fieldScore, second.fieldScore) ||
			compareNumbersDescending(first.population, second.population) ||
			compareAscii(first.id, second.id))
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.fieldReferenceFamilies)
		.map(({ prototype }) => prototype)
}

const MARK = ALBUM_ARTWORK_PALETTE_V2_POLICY.mark

/** The "same colour" bars. See `ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness`. */
const DISTINCTNESS = ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness

/**
 * Population-independent evidence that a family is a deliberate mark.
 *
 * The factors are multiplied, not averaged, so every one of them is a necessary
 * condition: the family must have *several* qualifying components (never a bare
 * pixel), they must *look like each other* (repetition), they must be *resolved*
 * shapes rather than specks (geometry), the family must be *materially
 * separated* from the families that own the field, and those components must
 * account for essentially all of the family, by population and by count. A
 * family that fails any one of them earns near zero and the rest of the
 * algorithm is untouched.
 *
 * `fieldSeparation` is measured prototype-to-prototype rather than across the
 * component boundary on purpose: a small element's perimeter is mostly
 * anti-aliased blend, so pixel-adjacent boundary contrast under-reads it in
 * proportion to how small it is — precisely the elements this evidence exists
 * to recover.
 */
export function markSupportOf(
	family: Pick<ColorFamilyEvidence, "prototype" | "population" | "componentCount" | "components">,
	pixelCount: number,
	fieldPrototypes: readonly OKLab[],
): Readonly<{ markSupport: number; markComponentCount: number }> {
	if (MARK.substitution <= 0) return { markSupport: 0, markComponentCount: 0 }
	const minimumPopulation = Math.max(MARK.minimumComponentPopulation, MARK.minimumComponentFraction * pixelCount)
	const qualifying = family.components
		.filter(({ population, retainedFor, observation }) =>
			retainedFor.includes("role-observation") &&
			population >= minimumPopulation &&
			observation.repetition >= MARK.minimumRepetition &&
			observation.borderContact <= MARK.maximumBorderContact &&
			observation.fill >= MARK.minimumFill)
		.sort((first, second) =>
			compareNumbersDescending(first.observation.signatureAccent.score, second.observation.signatureAccent.score) ||
			compareNumbersDescending(first.population, second.population) ||
			first.startPixelIndex - second.startPixelIndex)
	if (qualifying.length < MARK.minimumComponentCount) return { markSupport: 0, markComponentCount: qualifying.length }
	const strokes = qualifying.slice(0, MARK.saturationComponentCount)
	const plurality = clamp(
		(qualifying.length - MARK.minimumComponentCount + 1) /
		(MARK.saturationComponentCount - MARK.minimumComponentCount + 1))
	const coherence = mean(strokes.map(({ observation }) => observation.repetition))
	const resolution = mean(strokes.map(({ observation }) => observation.signatureAccent.geometry))
	const separation = fieldPrototypes.length === 0
		? 0
		: clamp(Math.min(...fieldPrototypes.map((prototype) => okDistance(family.prototype, prototype))) / MARK.fieldSeparation)
	// The family must *be* the mark, structurally and by population. A scattered
	// texture also produces plenty of small, mutually similar, interior
	// components, but they are a handful out of thousands and account for a sliver
	// of the family; lettering is an enumerable set of strokes that accounts for
	// nearly all of its own family on both counts. Because the retained component
	// set is bounded, a family fragmented into thousands of pieces cannot reach
	// `enumerability` even in principle — which is the intent.
	const strokeCoverage = clamp(
		qualifying.reduce((sum, { population }) => sum + population, 0) / Math.max(1, family.population))
	const enumerability = clamp(qualifying.length / Math.max(1, family.componentCount))
	return {
		markSupport: clamp(plurality * coherence * resolution * separation * strokeCoverage * enumerability),
		markComponentCount: qualifying.length,
	}
}

/**
 * The population-normalised support term a mark may stand in for, bounded by
 * `MARK.substitution`.
 */
function markSubstituted(populationTerm: number, markSupport: number): number {
	return Math.max(populationTerm, MARK.substitution * markSupport)
}

function sourceSupport(
	representativeIndex: number | null,
	representativeLab: OKLab,
	strategy: RepresentativeStrategy,
	family: MutableFamily,
	familyEvidence: Pick<ColorFamilyEvidence, "id" | "populationFraction" | "largestComponentFraction" | "quadrantCoverage" | "familyConcentration" | "markSupport">,
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
		markSupport: familyEvidence.markSupport,
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
		0.22 * markSubstituted(clamp(support.totalSupport / 0.08), support.markSupport) +
		0.22 * markSubstituted(clamp(support.connectedSupport / 0.08), support.markSupport) +
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

/**
 * Background-fidelity switch. `"off"` is the shipped trunk behaviour, byte-for-byte: every
 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.backgroundFidelity` value is replaced by its incumbent at the
 * use site. See that policy block, and
 * `research/v2-3-experiments/background-fidelity/EXPERIMENT.md`.
 */
export const BACKGROUND_FIDELITY: "off" | "on" = "on"

/** Levels of separation a role-ownership criterion needs before it may decide. */
function fieldRoleMinimumEvidenceLevels(): number {
	if (BACKGROUND_FIDELITY !== "on") return 1
	return ALBUM_ARTWORK_PALETTE_V2_POLICY.backgroundFidelity.minimumRoleOwnershipEvidenceLevels
}

/** Enclosed-to-mount population ratio at which a border-owning family reads as a frame. */
function mountMinimumEnclosedPopulationRatio(): number {
	if (BACKGROUND_FIDELITY !== "on") return ALBUM_ARTWORK_PALETTE_V2_POLICY.mount.minimumEnclosedPopulationRatio
	return ALBUM_ARTWORK_PALETTE_V2_POLICY.backgroundFidelity.minimumEnclosedPopulationRatio
}

/**
 * The share of its peripheral evidence `family` keeps in the role-ownership profile: withdrawn
 * for a recognised mount, whose edge ownership the mount test has already explained as framing.
 */
function roleOwnershipPeripheralCredit(family: ColorFamilyEvidence): number {
	if (BACKGROUND_FIDELITY !== "on" || family.isMount !== true) return 1
	return ALBUM_ARTWORK_PALETTE_V2_POLICY.backgroundFidelity.mountRoleOwnershipBorderCredit
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / RANKING_EVIDENCE_RESOLUTION)
}

function fieldRoleOwnershipProfile(family: ColorFamilyEvidence): FieldRoleOwnershipProfile {
	const credit = roleOwnershipPeripheralCredit(family)
	const frameCoverage = ((family.borderCoverage + family.cornerCoverage) / 2) * credit
	const peripheralCoverage =
		((family.borderCoverage + family.cornerCoverage + (1 - family.centerCoverage)) / 3) * credit
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

export function assignFieldRoles(first: ColorFamilyEvidence, second: ColorFamilyEvidence): FieldRoleAssignmentEvidence {
	const firstProfile = fieldRoleOwnershipProfile(first)
	const secondProfile = fieldRoleOwnershipProfile(second)
	const minimumLevels = fieldRoleMinimumEvidenceLevels()
	let background = first
	let surface = second
	let backgroundProfile = firstProfile
	let surfaceProfile = secondProfile
	let decisiveCriterion: FieldRoleAssignmentEvidence["decisiveCriterion"] = "ascii-tie"
	let confidence = 0
	for (let index = 0; index < FIELD_ROLE_OWNERSHIP_CRITERIA.length; index++) {
		const difference = firstProfile.evidenceLevels[index] - secondProfile.evidenceLevels[index]
		if (Math.abs(difference) < minimumLevels) continue
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

/**
 * How much of a family's claim to the foreground role comes from the family-level evidence versus
 * from what the region observations actually saw of its typography. The two sum to 1.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the 0.40 observation
 * term is live on all 154 artworks and +-20 % moves 31 of them (20 %). Perturbing one term breaks
 * the sum; nothing renormalises.
 */
export const FOREGROUND_ROLE_SCORE_WEIGHTS = Object.freeze({
	familyEvidence: 0.60,
	typographyObservation: 0.40,
} as const)

function foregroundRoleScore(family: ColorFamilyEvidence): number {
	return clamp(FOREGROUND_ROLE_SCORE_WEIGHTS.familyEvidence * family.foregroundScore +
		FOREGROUND_ROLE_SCORE_WEIGHTS.typographyObservation * family.foregroundTypographyObservation)
}

// `signatureScore` carries a population ratio of the same class as the support
// terms (`coherentSupport = clamp(largestComponentFraction / 0.002)`, which a
// word set in seven letters cannot satisfy in any one of them), and mark
// evidence was substituted for it here in an earlier revision. Measured: it is
// a no-op on all 38 sweep cases once the support substitution is in place, so
// it is left out rather than carried as an unexercised path that would move
// rankings on inputs no review has seen. It remains the obvious next site if
// evidence for it ever appears.
function signatureRoleScore(family: ColorFamilyEvidence): number {
	return clamp(0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation)
}

/**
 * `signatureRoleScore` with its one population-normalised term repaired by mark evidence —
 * for scoring an accent the treatment has **already** put on screen, never for deciding who
 * gets to be a candidate.
 *
 * That division is the whole point. Track E's revision 2 established the rule this respects:
 * *mark evidence repairs a handicap in fair competition, it does not confer an entitlement*.
 * Review rejected substituting it into the identity-obligation shortlist, because that
 * manufactures a claim ("this family must appear") out of a repaired measurement. Nothing here
 * touches candidacy: lane ranking, obligation nomination and the accent shortlist all keep
 * reading the unrepaired `signatureRoleScore`, so which families compete is decided exactly as
 * before. What changes is that once a family has won its place on its own region evidence, the
 * quality domain stops charging it for being small.
 *
 * The handicap is real and it is charged three times over. `signatureRoleScore` multiplies into
 * `accentIdentity`, `accentFidelity` and `accentEconomy`, and 25 % of its `signatureScore` half
 * is `coherentSupport = largestComponentFraction / 0.002` — a pure population ratio. Measured on
 * an artwork whose album title is the accent human review asked for: the title's family scores
 * `coherentSupport = 0.116` against the incumbent near-black's saturated `1.000`, though the
 * title is nine qualifying marks of eleven components and carries the highest `markSupport` in
 * the artwork. Track E measured this same substitution as a no-op on its 38-case sweep and left
 * it out rather than carry an unexercised path, noting in this file that it "remains the obvious
 * next site if evidence for it ever appears". The evidence appeared: human review has now named
 * the wanted accent on six artworks of this class.
 */
function signatureAccentRoleScore(family: ColorFamilyEvidence): number {
	if (ACCENT_EVIDENCE_CHANNEL === "quality" || ACCENT_EVIDENCE_CHANNEL === "both") {
		return accentEvidenceRoleScore(family)
	}
	const coherentSupport = clamp(family.largestComponentFraction / SIGNATURE_COHERENT_SUPPORT_SCALE)
	const repaired = clamp(family.signatureScore +
		SIGNATURE_COHERENT_SUPPORT_WEIGHT * (Math.max(coherentSupport, family.markSupport) - coherentSupport))
	return clamp(0.55 * repaired + 0.45 * family.signatureAccentObservation)
}

/**
 * THE ACCENT EVIDENCE CHANNEL — the accent role scored by the accent role's own description.
 *
 * `"off"` is trunk. `"quality"` swaps the score at the three winner axes that already read
 * `signatureAccentRoleScore` (`accentIdentity`, `accentFidelity`, `accentEconomy`). `"both"` also
 * swaps it in the *accent shortlist* (`rankAccentOptions`), which is the only candidacy gate that
 * exists to rank accents specifically.
 *
 * The argument for the site, stated as a principle rather than a tuning:
 *
 * Every one of those sites asks "how good an accent does this family make", and every one of them
 * answers with `signatureScore` — a score whose job is to find the artwork's *signature*: a big
 * connected blob (`coherentSupport`, weight 0.25, a pure population ratio) that *recurs*
 * (`repeatedSupport`, weight 0.16). Human review has adjudicated the opposite for this role: in the
 * `sr-batch` A/B the reviewer preferred a small, vivid, single-occurrence mark as the accent on 5
 * of 8 artworks it was shown on, and the accent's job (icons and UI chrome, never text) does not
 * carry the readability stakes that make blob-and-recurrence the right question for the foreground.
 *
 * The algorithm already contains the right question. `classifyFieldConditionalFamilyRole` scores
 * exactly this role with `accentRaw`, which has **no additive population term at all** — support is
 * a gate with a 0.50 floor — rewards *small* bounds through `compactness`, discounts the raw
 * component-repeat count to 0.084 of its weight, and weights chroma 0.25 against
 * `signatureScore`'s 0.11. So the channel invents nothing: it calls
 * `familyAccentRoleEvidence` (`role-obligations.ts`) and uses its score directly.
 *
 * Deliberately *no* `0.55 / 0.45` wrapper. That split exists because `signatureScore` carries no
 * accent-region term whatsoever, so `signatureRoleScore` has to add `signatureAccentObservation`
 * back at 0.45. `accentRaw` already carries `signatureObservation`, at its own weight of 0.08;
 * re-adding it at 0.45 would weight the classifier's own term 5.6x more than the classifier does.
 * Measured both ways (`analysis/accent-decompose.ts`, forms `H` and `H0`): the wrapper costs three
 * of the adjudicated asks.
 *
 * Representativity (charter rule 4) is carried by the gate, not waived. `accentRaw`'s support is
 * 45 % region source-support + 30 % sqrt(population x connectivity) + 15 % concentration + 10 %
 * observation breadth, and it multiplies the whole claim between 0.50 and 1.00 — a bare pixel has
 * no retained region observation at all and scores zero, while a reviewed-endorsed lettering accent
 * covering 0.023 % of an artwork's pixels lands mid-gate rather than being excluded. That is the
 * reviewed floor's order of magnitude, and it is the same standard `SourceSupportRecord` applies.
 *
 * `"fidelity"` is the **bounded** setting, and it exists because of a measured side-effect.
 * `accentIdentity` and `accentEconomy` do not stay inside the accent: they multiply into
 * `artworkIdentity` (0.12) and `economy` (0.09), which are whole-palette axes carrying the
 * foreground's contribution too. So raising an accent's evidence there can pay for a *worse
 * foreground* in the same candidate — the winner is a complete four-tuple and the accent shortlist
 * is built per foreground, so a better accent available under foreground B can pull B's whole tuple
 * past foreground A. That is exactly what review caught on one artwork: the arm swapped a
 * four-times-endorsed gold foreground for a dim grey in order to reach a deeper red accent, and the
 * reviewer's note was "both accents work, but the foreground is better on option B".
 *
 * `"fidelity"` confines the channel to `accentFidelity` — the one axis that is *only* about how good
 * an accent a colour makes. Identity and economy keep trunk's score, so the channel can reorder
 * accents but cannot buy a foreground swap with accent evidence.
 */
export const ACCENT_EVIDENCE_CHANNEL: "off" | "fidelity" | "quality" | "both" = "both"

/**
 * Memoised per family. `familyAccentRoleEvidence` aggregates over the family's retained region
 * observations, and the accent sites ask for it once per scored candidate — thousands of times per
 * artwork for the same handful of families. The cache is keyed on the family object itself and the
 * function is pure, so this is a speed detail with no behavioural surface; determinism is
 * unaffected because the value depends on nothing but the family.
 */
const accentEvidenceCache = new WeakMap<ColorFamilyEvidence, number>()

function accentEvidenceRoleScore(family: ColorFamilyEvidence): number {
	const cached = accentEvidenceCache.get(family)
	if (cached !== undefined) return cached
	const score = clamp(familyAccentRoleEvidence(family).score)
	accentEvidenceCache.set(family, score)
	return score
}

/**
 * Where the chromatic-candidacy reservations apply. Shipped `"off"`, which is byte-for-byte the
 * behaviour this file had before the reservations existed.
 *
 * INHERITED VERBATIM from the `accent-candidacy` arm (branch `worktree-agent-a5161402d51c76cf3`,
 * commit `6f3ab16`), where it ships `"off"` and was measured on 223 artworks: it doubles the
 * reach of the salient-accent class (5 -> 10 of 19 offered in an accent slot) at a 2.2 % winner
 * footprint, and published nothing on its own. That arm could not justify the trade because no
 * verdict spoke for the class; the `sr-batch` adjudication now does. It is reused rather than
 * rebuilt, and the credit is the point: the reservations are its measurement, not this arm's.
 *
 * `"lane"` reserves one signature-lane seat, `"obligation"` reserves one identity-obligation
 * place, `"both"` does both. Reverting is deleting this constant and the two functions below.
 */
export const CHROMATIC_CANDIDACY_RESERVATION: "off" | "lane" | "obligation" | "both" = "both"

/** The highest chroma the artwork offers in any populated family — its chromatic ceiling. */
function chromaticCeiling(families: readonly ColorFamilyEvidence[]): number {
	return families.reduce((peak, family) => (family.population > 0 ? Math.max(peak, family.chroma) : peak), 0)
}

/**
 * A family's *chromatic accent claim*: how vivid it is measured against the artwork's own
 * chromatic ceiling, weighted by how strongly its own regions read as a signature accent.
 *
 * Both factors are measurements the evidence already carries and the product introduces no
 * constant. Relative chroma alone is not usable as a selector — the artwork's raw chroma argmax is
 * a handful of pixels on most artworks (`accent-candidacy` measured population fraction below 1e-4
 * on 11 of 19 target artworks), so it selects noise, which charter rule 4 forbids outright.
 */
function chromaticAccentClaim(family: ColorFamilyEvidence, ceiling: number): number {
	return (ceiling <= 0 ? 0 : family.chroma / ceiling) * family.signatureAccentObservation
}

/**
 * Reserve one signature-lane seat for the artwork's strongest chromatic accent claim.
 *
 * The lane keeps the top `bounds.signatureFamilies` families by `signatureRoleScore`, which is
 * 55 % `signatureScore` — a population-weighted measure. A small vivid mark therefore loses to
 * sixteen larger duller families, and once out of the lane it is not a candidate for any role.
 *
 * The admission bar is not a new number. The challenger must beat **every family the lane already
 * retained** on the reservation's own key — the lane's own weakest-retained-member standard,
 * applied to the statistic the reservation exists to protect. So the seat is spent only when the
 * bound cut the artwork's single best chromatic accent claim, and it costs exactly one seat.
 */
function reserveChromaticSignatureSeat(
	result: Readonly<{ lane: EvidenceLane; trace: LaneRetentionTrace }>,
	families: readonly ColorFamilyEvidence[],
): Readonly<{ lane: EvidenceLane; trace: LaneRetentionTrace }> {
	const retainedIds = result.lane.familyIds
	if (retainedIds.length < result.lane.maximumFamilies) return result
	const ceiling = chromaticCeiling(families)
	const byId = new Map(families.map((family) => [family.id, family]))
	const retained = retainedIds.map((id) => byId.get(id)).filter((family) => family !== undefined)
	const bar = retained.reduce((peak, family) => Math.max(peak, chromaticAccentClaim(family, ceiling)), 0)
	const challenger = families
		.filter(({ id, population }) => population > 0 && !retainedIds.includes(id) &&
			chromaticAccentClaim(byId.get(id)!, ceiling) > bar)
		.sort((first, second) =>
			compareNumbersDescending(chromaticAccentClaim(first, ceiling), chromaticAccentClaim(second, ceiling)) ||
			compareNumbersDescending(first.population, second.population) ||
			compareAscii(first.id, second.id))[0]
	if (challenger === undefined) return result
	const familyIds = [...retainedIds.slice(0, retainedIds.length - 1), challenger.id]
	return {
		lane: { ...result.lane, familyIds },
		trace: {
			...result.trace,
			candidates: result.trace.candidates.map((candidate) => ({
				...candidate,
				retained: familyIds.includes(candidate.familyId),
			})),
		},
	}
}

type RankedRoleOption<TExtra> = Readonly<{
	family: ColorFamilyEvidence
	representative: ColorRepresentative
	signedContrasts: readonly number[]
}> & TExtra

/**
 * Weight on the role-evidence term of the foreground ranking score, against `0.16` each for
 * support quality and contrast.
 *
 * PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:292`): live on all 154 artworks, +-20 %
 * moves 88 of them (57 %). Lifted out of the comparator below — where it appeared twice, once per
 * side, at the identical value — so that it can be pinned; the two sides must always carry the
 * same weight, which is precisely what a shared constant states and two literals do not.
 */
export const FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT = 0.68

/**
 * Rank the foreground candidates for one field variant.
 *
 * The control domain (`buildCompletePaletteTreatmentDomain`) and the seed-addition generator
 * (`generateSeedAdditions`) both need exactly this ranking, and each carried its own verbatim copy
 * of the formula and the tie-break. They differ only in what they do with the result — retention
 * policy, treatment sink, and bookkeeping — which stays at each call site.
 */
function rankForegroundOptions(
	variant: FieldVariant,
	supportedRepresentatives: readonly Readonly<{ family: ColorFamilyEvidence; representative: ColorRepresentative }>[],
): RankedRoleOption<{ contrast: number; polarityAgreement: number }>[] {
	const samples = fieldSamples(variant)
	return supportedRepresentatives
		.filter(({ representative }) =>
			!sameColor(representative.rgb, variant.background.rgb) &&
			!sameColor(representative.rgb, variant.surface.rgb))
		.map((option) => {
			const signedContrasts = samples.map((sample) => apcaContrast(option.representative.rgb, sample.rgb))
			return {
				...option,
				signedContrasts,
				contrast: mean(signedContrasts.map(Math.abs)),
				polarityAgreement: foregroundPolarityAgreement(option.family, signedContrasts),
			}
		})
		.sort((first, second) =>
			compareNumbersDescending(
				FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT * foregroundRoleScore(first.family) * first.polarityAgreement +
					0.16 * supportQuality(first.representative) + 0.16 * clamp(first.contrast / 90),
				FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT * foregroundRoleScore(second.family) * second.polarityAgreement +
					0.16 * supportQuality(second.representative) + 0.16 * clamp(second.contrast / 90),
			) ||
			compareAscii(
				`${first.family.id}:${first.representative.hex}`,
				`${second.family.id}:${second.representative.hex}`,
			))
}

/**
 * Rank the distinct-accent candidates for one field variant and foreground choice. `representativesOf`
 * is the call site's representative policy, which is the one thing the two generators legitimately
 * disagree about.
 */
/**
 * A two-colour artwork publishes one field colour and one ink colour which, between
 * them, own nearly every pixel. A colour on the chord between those two is the edge
 * where they meet — the anti-aliased boundary, JPEG ringing, a soft shadow — not a
 * third material. Publishing it as an accent asserts a cardinality the artwork does
 * not have.
 *
 * Returns a predicate over accent representatives. It answers `false` for every
 * artwork that is not two-colour, which is nearly all of them: reviewed accents that
 * sit *closer* to their own palette's chord than the case this was built for belong
 * to artworks whose two published colours cover only about half the pixels.
 *
 * The mixture geometry is `fieldBlend`'s, deliberately — "is this an optical
 * mixture" means one thing in this algorithm. See
 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.accentBlend`.
 */
function edgeOfTheOnlyTwoColours(
	background: ColorRepresentative,
	foreground: ColorRepresentative,
	twoColourCoverage: number,
): (accent: ColorRepresentative) => boolean {
	const blend = ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend
	const chordLength = okDistance(background.oklab, foreground.oklab)
	const applies = twoColourCoverage >= ALBUM_ARTWORK_PALETTE_V2_POLICY.accentBlend.minimumTwoColourCoverage &&
		chordLength >= blend.minimumFieldSeparation
	if (!applies) return () => false
	return (accent) => {
		const { offset, position } = chordProjection(accent.oklab, background.oklab, foreground.oklab)
		return position > blend.interiorMargin && position < 1 - blend.interiorMargin &&
			offset / chordLength <= blend.maximumRelativeOffset
	}
}

/**
 * Weight on the fidelity term of the accent ranking score, against `0.25` each for support quality
 * and utility.
 *
 * PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:293`): live on 151 artworks, +-20 % moves 78
 * of them (52 %). Lifted out of the comparator below, where it appeared twice at the identical
 * value (written `0.50`), once per side. Same reasoning as
 * `FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT`.
 */
export const ACCENT_RANK_FIDELITY_WEIGHT = 0.50

function rankAccentOptions(
	variant: FieldVariant,
	signatureFamilies: readonly ColorFamilyEvidence[],
	foreground: Readonly<{ family: ColorFamilyEvidence; representative: ColorRepresentative }>,
	representativesOf: (family: ColorFamilyEvidence) => readonly ColorRepresentative[],
	fieldFamilyPopulationFraction = 0,
): RankedRoleOption<{ utility: number; fidelity: number }>[] {
	const samples = fieldSamples(variant)
	/**
	 * The candidate is left in the slate — candidacy is not the question — but an
	 * edge between the artwork's only two colours is not a distinct accent anyone
	 * gave up by collapsing, so its fidelity is zero. That matters twice: it ranks
	 * the mixture last, and it stops `accentOpportunity` from charging the
	 * collapsed treatment for an accent the artwork does not actually offer.
	 */
	const isEdgeOfTheOnlyTwoColours = edgeOfTheOnlyTwoColours(
		variant.background, foreground.representative,
		fieldFamilyPopulationFraction + foreground.family.populationFraction)
	return signatureFamilies
		.flatMap((family) => representativesOf(family).map((representative) => ({ family, representative })))
		.filter(({ family, representative }) =>
			family.id !== variant.hypothesis.backgroundFamilyId &&
			family.id !== variant.hypothesis.surfaceFamilyId &&
			family.id !== foreground.family.id &&
			!sameColor(representative.rgb, variant.background.rgb) &&
			!sameColor(representative.rgb, variant.surface.rgb) &&
			!sameColor(representative.rgb, foreground.representative.rgb))
		.map((option) => {
			const signedContrasts = samples.map((sample) => apcaContrast(option.representative.rgb, sample.rgb))
			return {
				...option,
				signedContrasts,
				utility: clamp(mean(signedContrasts.map(Math.abs)) / 75),
				fidelity: isEdgeOfTheOnlyTwoColours(option.representative)
					? 0
					// The accent shortlist is the one candidacy gate whose entire job is to rank
					// *accents*, so scoring it by the accent role's own evidence is role-conditional
					// by construction: no other role's shortlist is touched, and which families
					// reach this point is still decided upstream by the unrepaired
					// `signatureRoleScore`. See `ACCENT_EVIDENCE_CHANNEL`.
					: distinctAccentFidelity(option.family, option.representative, foreground.representative,
						ACCENT_EVIDENCE_CHANNEL === "both" ? accentEvidenceRoleScore : signatureRoleScore),
			}
		})
		.sort((first, second) =>
			compareNumbersDescending(
				ACCENT_RANK_FIDELITY_WEIGHT * first.fidelity + 0.25 * supportQuality(first.representative) + 0.25 * first.utility,
				ACCENT_RANK_FIDELITY_WEIGHT * second.fidelity + 0.25 * supportQuality(second.representative) + 0.25 * second.utility,
			) ||
			compareAscii(
				`${first.family.id}:${first.representative.hex}`,
				`${second.family.id}:${second.representative.hex}`,
			))
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

/** The terms `fieldScore` reads, so it can be recomputed with a discounted border credit. */
type FieldScoreTerms = Readonly<{
	populationFraction: number
	borderCoverage: number
	familyConcentration: number
	quadrantCoverage: number
	edgeDensity: number
}>

/**
 * How much of "this family looks like the ground the artwork sits on" comes from each piece of
 * evidence: being broad, reaching the border, being one coherent mass rather than scattered,
 * reaching every quadrant, and being calm rather than busy. The five sum to 1.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the 0.22
 * `familyConcentration` term is live on all 154 artworks and +-20 % moves 35 of them (23 %).
 * Perturbing one term breaks the sum; nothing renormalises.
 */
export const FIELD_SCORE_WEIGHTS = Object.freeze({
	populationFraction: 0.28,
	borderCoverage: 0.22,
	familyConcentration: 0.22,
	quadrantCoverage: 0.13,
	edgeDensity: 0.15,
} as const)

/**
 * How much this family looks like the ground the artwork sits on: broad, reaching
 * the edges and every quadrant, coherent rather than scattered, and calm.
 *
 * `borderCreditRetained` scales the border term alone. It is 1 for every family
 * except a mount, whose border coverage is not evidence of ground — see
 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.mount`.
 */
function fieldScoreFrom(terms: FieldScoreTerms, borderCreditRetained = 1): number {
	return clamp(
		FIELD_SCORE_WEIGHTS.populationFraction * clamp(terms.populationFraction / 0.24) +
		FIELD_SCORE_WEIGHTS.borderCoverage * terms.borderCoverage * borderCreditRetained +
		FIELD_SCORE_WEIGHTS.familyConcentration * clamp(terms.familyConcentration) +
		FIELD_SCORE_WEIGHTS.quadrantCoverage * terms.quadrantCoverage +
		FIELD_SCORE_WEIGHTS.edgeDensity * (1 - clamp(terms.edgeDensity / 0.7)),
	)
}

/**
 * Families whose border coverage is not evidence that they are the artwork's
 * ground, because a materially larger field family is enclosed by them — a frame
 * or matte rather than a background. See
 * `ALBUM_ARTWORK_PALETTE_V2_POLICY.mount`. Returns ids, ASCII-ordered.
 */
function mountFamilyIds(families: readonly ColorFamilyEvidence[]): Set<string> {
	const policy = ALBUM_ARTWORK_PALETTE_V2_POLICY.mount
	const mounts = new Set<string>()
	if (policy.borderCreditRetained >= 1) return mounts
	const enclosed = families.filter(({ borderCoverage }) => borderCoverage <= policy.maximumEnclosedBorderCoverage)
	if (enclosed.length === 0) return mounts
	const largestEnclosed = enclosed.reduce((best, family) =>
		family.populationFraction > best.populationFraction ||
		(family.populationFraction === best.populationFraction && compareAscii(family.id, best.id) < 0)
			? family
			: best)
	for (const family of families) {
		if (family.borderCoverage < policy.minimumBorderCoverage) continue
		if (family.id === largestEnclosed.id) continue
		if (largestEnclosed.populationFraction < family.populationFraction * mountMinimumEnclosedPopulationRatio()) continue
		mounts.add(family.id)
	}
	return mounts
}

/**
 * Where `point` falls on the OKLab chord `[start, end]`: how far along it (`position`,
 * in chord fractions, so `0` is `start` and `1` is `end`) and how far off it
 * (`offset`, an absolute OKLab distance).
 */
function chordProjection(point: OKLab, start: OKLab, end: OKLab): Readonly<{ offset: number; position: number }> {
	const axis: OKLab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
	const lengthSquared = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
	if (lengthSquared === 0) return { offset: okDistance(point, start), position: 0 }
	const delta: OKLab = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
	const position = (delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2]) / lengthSquared
	return {
		offset: okDistance(point, [
			start[0] + axis[0] * position,
			start[1] + axis[1] * position,
			start[2] + axis[2] * position,
		]),
		position,
	}
}

/**
 * Families the quantizer sliced out of the optical mixture between the two
 * dominant fields, rather than out of a material the artwork actually contains.
 * See `ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend` for why this is measured the
 * way it is. Returns the ids to withdraw from the field lane, ASCII-ordered.
 */
function opticalBlendFamilyIds(
	families: readonly ColorFamilyEvidence[],
	provisionalFieldFamilies: readonly ColorFamilyEvidence[],
	adjacencies: readonly MutableAdjacency[],
	familyIdByIndex: readonly string[],
): Set<string> {
	const policy = ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend
	const absorbed = new Set<string>()
	if (policy.maximumRelativeOffset <= 0) return absorbed
	// The two dominant fields anchor the mixture. They are read off the field
	// ranking the artwork already produced, by population, with explicit tie-breaks.
	const anchors = [...provisionalFieldFamilies]
		.sort((first, second) =>
			compareNumbersDescending(first.population, second.population) ||
			compareAscii(first.id, second.id))
		.slice(0, 2)
	if (anchors.length < 2) return absorbed
	const [first, second] = anchors
	const chordLength = okDistance(first.prototype, second.prototype)
	if (chordLength < policy.minimumFieldSeparation) return absorbed

	// Colour test: strictly between the two fields, and close enough to the chord
	// that a linear mixture explains it.
	const rungs: Array<Readonly<{ id: string; position: number }>> = []
	for (const family of families) {
		if (family.id === first.id || family.id === second.id) continue
		const { offset, position } = chordProjection(family.prototype, first.prototype, second.prototype)
		if (position <= policy.interiorMargin || position >= 1 - policy.interiorMargin) continue
		if (offset / chordLength > policy.maximumRelativeOffset) continue
		rungs.push({ id: family.id, position })
	}
	if (rungs.length === 0) return absorbed

	// Continuum test: ordered along the chord and bounded by the two fields, the
	// ramp must have no gap. A sliced continuum is present in full; coincidental
	// colinearity is not.
	rungs.sort((left, right) => left.position - right.position || compareAscii(left.id, right.id))
	let previous = 0
	for (const { position } of [...rungs, { id: "", position: 1 }]) {
		if (position - previous > policy.maximumRungGap) return absorbed
		previous = position
	}
	const mixture = new Set(rungs.map(({ id }) => id))

	// Spatial test: the family never borders anything outside the mixture it
	// belongs to (the two fields, or another mixture of the same pair).
	const corridor = new Set<string>([first.id, second.id, ...mixture])
	const total = new Map<string, number>()
	const inside = new Map<string, number>()
	for (const { firstFamilyIndex, secondFamilyIndex, boundaryEdges } of adjacencies) {
		const firstId = familyIdByIndex[firstFamilyIndex]
		const secondId = familyIdByIndex[secondFamilyIndex]
		for (const [self, other] of [[firstId, secondId], [secondId, firstId]] as const) {
			total.set(self, (total.get(self) ?? 0) + boundaryEdges)
			if (corridor.has(other)) inside.set(self, (inside.get(self) ?? 0) + boundaryEdges)
		}
	}
	for (const familyId of [...mixture].sort(compareAscii)) {
		const closure = (inside.get(familyId) ?? 0) / Math.max(1, total.get(familyId) ?? 0)
		if (closure >= policy.minimumCorridorClosure) absorbed.add(familyId)
	}
	return absorbed
}

function distinctAccentFidelity(
	family: ColorFamilyEvidence,
	accent: ColorRepresentative,
	foreground: ColorRepresentative,
	roleScore: (family: ColorFamilyEvidence) => number = signatureRoleScore,
): number {
	const separation = clamp((okDistance(accent.oklab, foreground.oklab) - MINIMUM_DISTINCT_DISTANCE) / 0.18)
	return roleScore(family) * Math.sqrt(separation)
}

export function buildNativePaletteEvidence(
	image: RawImage,
	options: NativeEvidenceOptions = DEFAULT_NATIVE_EVIDENCE_OPTIONS,
): NativePaletteEvidence {
	if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
		throw new RangeError("Native image dimensions must be positive safe integers")
	}
	const pixelCount = image.width * image.height
	if (!Number.isSafeInteger(pixelCount) || image.data.length !== pixelCount * 3) {
		throw new RangeError("Native image must contain row-major three-channel RGB pixels")
	}

	const labs = toLabBuffer(image.data)
	const pixelBinKeys = new Uint32Array(pixelCount)
	const binsByKey = new Map<number, PerceptualBin>()
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		const labOffset = pixelIndex * 3
		const lightness = labs[labOffset]
		const a = labs[labOffset + 1]
		const b = labs[labOffset + 2]
		const key = quantizedKeyOf(lightness, a, b, options.familyBinStep)
		pixelBinKeys[pixelIndex] = key
		const existing = binsByKey.get(key)
		if (existing) {
			existing.population += 1
			existing.sumL += lightness
			existing.sumA += a
			existing.sumB += b
		} else {
			binsByKey.set(key, {
				key,
				population: 1,
				sumL: lightness,
				sumA: a,
				sumB: b,
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
			if (distance <= options.familyAnchorRadius && distance < nearestDistance) {
				familyIndex = candidateIndex
				nearestDistance = distance
			}
		}
		if (familyIndex < 0) {
			familyIndex = mutableFamilies.length
			mutableFamilies.push({
				id: `${options.familyIdPrefix}family-${bin.key}`,
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
		const labOffset = pixelIndex * 3
		const x = pixelIndex % image.width
		const y = (pixelIndex / image.width) | 0
		const normalizedX = x / widthDenominator
		const normalizedY = y / heightDenominator
		family.population += 1
		family.sumL += labs[labOffset]
		family.sumA += labs[labOffset + 1]
		family.sumB += labs[labOffset + 2]
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

	// Keyed on the packed family pair rather than a `"first:second"` string. The pair is only ever
	// used to group adjacencies — `firstFamilyIndex`/`secondFamilyIndex` on the record carry the
	// identity downstream — so nothing observes the key itself, and building one string per
	// boundary crossing was pure overhead on a busy artwork.
	const familyPairStride = mutableFamilies.length
	const mutableAdjacencies = new Map<number, MutableAdjacency>()
	const recordAdjacency = (firstFamilyIndex: number, secondFamilyIndex: number, distance: number): void => {
		const first = firstFamilyIndex < secondFamilyIndex ? firstFamilyIndex : secondFamilyIndex
		const second = firstFamilyIndex < secondFamilyIndex ? secondFamilyIndex : firstFamilyIndex
		const key = first * familyPairStride + second
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
	// `[familyIndex, neighborFamilyIndex]` used to be materialised per crossing just to be walked
	// once; the two updates are written out instead, in the same order.
	const creditBoundary = (firstIndex: number, secondIndex: number, distance: number): void => {
		const first = mutableFamilies[firstIndex]
		first.boundaryEdges += 1
		first.neighborDistanceSum += distance
		first.neighborEdgeCount += 1
		const second = mutableFamilies[secondIndex]
		second.boundaryEdges += 1
		second.neighborDistanceSum += distance
		second.neighborEdgeCount += 1
	}
	const imageWidth = image.width
	const lastColumn = image.width - 1
	const lastRow = image.height - 1
	for (let y = 0; y < image.height; y++) {
		const rowOffset = y * image.width
		for (let x = 0; x < image.width; x++) {
			const pixelIndex = rowOffset + x
			const familyIndex = familyAt[pixelIndex]
			const labOffset = pixelIndex * 3
			if (x < lastColumn) {
				const neighborIndex = pixelIndex + 1
				const neighborFamilyIndex = familyAt[neighborIndex]
				if (neighborFamilyIndex !== familyIndex) {
					const neighborOffset = neighborIndex * 3
					// Same three subtractions in the same order as `okDistance(labAt(a), labAt(b))`.
					const distance = Math.hypot(
						labs[labOffset] - labs[neighborOffset],
						labs[labOffset + 1] - labs[neighborOffset + 1],
						labs[labOffset + 2] - labs[neighborOffset + 2],
					)
					recordAdjacency(familyIndex, neighborFamilyIndex, distance)
					creditBoundary(familyIndex, neighborFamilyIndex, distance)
				}
			}
			if (y < lastRow) {
				const neighborIndex = pixelIndex + image.width
				const neighborFamilyIndex = familyAt[neighborIndex]
				if (neighborFamilyIndex !== familyIndex) {
					const neighborOffset = neighborIndex * 3
					const distance = Math.hypot(
						labs[labOffset] - labs[neighborOffset],
						labs[labOffset + 1] - labs[neighborOffset + 1],
						labs[labOffset + 2] - labs[neighborOffset + 2],
					)
					recordAdjacency(familyIndex, neighborFamilyIndex, distance)
					creditBoundary(familyIndex, neighborFamilyIndex, distance)
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
		// Accumulate into locals for the duration of the flood — these are per-pixel writes over the
		// whole artwork — and flush to the component afterwards. Every sum keeps its operand order.
		let population = 0
		let minX = component.minX
		let minY = component.minY
		let maxX = component.maxX
		let maxY = component.maxY
		let borderPixels = 0
		let boundaryEdges = 0
		let boundaryContrastSum = 0
		let boundaryLightnessDeltaSum = 0
		let boundaryAbsoluteLightnessDeltaSum = 0
		while (queueRead < queueLength) {
			const pixelIndex = queue[queueRead++]
			const x = pixelIndex % imageWidth
			const y = (pixelIndex / imageWidth) | 0
			const labOffset = pixelIndex * 3
			population += 1
			if (x < minX) minX = x
			if (y < minY) minY = y
			if (x > maxX) maxX = x
			if (y > maxY) maxY = y
			if (x === 0 || y === 0 || x === lastColumn || y === lastRow) borderPixels += 1
			// Unrolled in the original left/right/up/down order: the visit order sets the queue
			// order, and the boundary sums below accumulate in that same order.
			for (let direction = 0; direction < 4; direction++) {
				const neighbor = direction === 0
					? (x > 0 ? pixelIndex - 1 : -1)
					: direction === 1
						? (x < lastColumn ? pixelIndex + 1 : -1)
						: direction === 2
							? (y > 0 ? pixelIndex - imageWidth : -1)
							: (y < lastRow ? pixelIndex + imageWidth : -1)
				if (neighbor < 0) continue
				if (familyAt[neighbor] === familyIndex) {
					if (visited[neighbor]) continue
					visited[neighbor] = 1
					queue[queueLength++] = neighbor
				} else {
					boundaryEdges += 1
					const neighborOffset = neighbor * 3
					const lightnessDelta = labs[neighborOffset] - labs[labOffset]
					// Same three subtractions in the same order as `okDistance(pixelLab, neighborLab)`.
					boundaryContrastSum += Math.hypot(
						labs[labOffset] - labs[neighborOffset],
						labs[labOffset + 1] - labs[neighborOffset + 1],
						labs[labOffset + 2] - labs[neighborOffset + 2],
					)
					boundaryLightnessDeltaSum += lightnessDelta
					boundaryAbsoluteLightnessDeltaSum += Math.abs(lightnessDelta)
				}
			}
		}
		component.population = population
		component.minX = minX
		component.minY = minY
		component.maxX = maxX
		component.maxY = maxY
		component.borderPixels = borderPixels
		component.boundaryEdges = boundaryEdges
		component.boundaryContrastSum = boundaryContrastSum
		component.boundaryLightnessDeltaSum = boundaryLightnessDeltaSum
		component.boundaryAbsoluteLightnessDeltaSum = boundaryAbsoluteLightnessDeltaSum
		component.rolePreliminary = componentRolePreliminary(component, pixelCount)
		const family = mutableFamilies[familyIndex]
		family.componentCount += 1
		insertComponent(family.components, component, options)
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
		const fieldScore = fieldScoreFrom({
			populationFraction,
			borderCoverage,
			familyConcentration,
			quadrantCoverage,
			edgeDensity,
		})
		const repeatCount = family.components.filter(({ population }) => population / pixelCount >= 0.00025).length
		const roleEvidence = measureFamilyRoleEvidence({
			familyId: family.id,
			components: family.components,
			population: family.population,
			pixelCount,
			width: image.width,
			height: image.height,
			populationFraction,
			largestComponentFraction,
			familyConcentration,
			localContrast,
			chroma: chroma(prototype),
			borderCoverage,
			centerCoverage,
		})
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
			signatureScore: roleEvidence.signatureScore,
			foregroundScore: roleEvidence.foregroundScore,
			foregroundTypographyObservation: roleEvidence.foregroundTypographyObservation,
			foregroundPolarityObservation: roleEvidence.foregroundPolarityObservation,
			signatureAccentObservation: roleEvidence.signatureAccentObservation,
			markSupport: 0,
			markComponentCount: 0,
			observedComponentCount: roleEvidence.observedComponentCount,
			components: roleEvidence.components,
			representatives: [],
		}
	})

	// Enclosure can only be read once every family has been measured, so mounts are
	// recognised here and their border credit withdrawn before any consumer — mark
	// evidence included — reads a field score.
	const mountIds = mountFamilyIds(preliminary)
	const scored = mountIds.size === 0 ? preliminary : preliminary.map((family): ColorFamilyEvidence =>
		mountIds.has(family.id)
			? {
				...family,
				fieldScore: fieldScoreFrom(family, ALBUM_ARTWORK_PALETTE_V2_POLICY.mount.borderCreditRetained),
				// Carried so the role-ownership profile can withdraw the same credit from the
				// criteria that actually decide the background role — `fieldScore` is only the
				// fourth of five, and the lexicographic scan almost never reaches it.
				isMount: true,
			}
			: family)

	// Mark evidence is measured against the families that own the field, so it can
	// only be computed once every family has been measured. It is folded into the
	// same `ColorFamilyEvidence` records before any of them is consumed.
	const fieldPrototypes = markFieldReferencePrototypes(scored)
	const marked = scored.map((family): ColorFamilyEvidence =>
		({ ...family, ...markSupportOf(family, pixelCount, fieldPrototypes) }))

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

	const families = marked.map((familyEvidence, familyIndex): ColorFamilyEvidence => {
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
		withdrawn: ReadonlySet<string> = new Set(),
	): Readonly<{ lane: EvidenceLane; trace: LaneRetentionTrace }> => {
		const ranked = families
			.filter(({ population, id }) => population > 0 && !withdrawn.has(id))
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
	const fieldScoreOf = ({ fieldScore }: ColorFamilyEvidence): number => fieldScore
	// The field lane is ranked twice: once to learn which two families dominate the
	// artwork's field, then again with the optical mixtures between them withdrawn.
	const provisionalField = rankLane("field", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldFamilies, fieldScoreOf, () => 0, fieldScoreOf)
	const familyIdByIndex = families.map(({ id }) => id)
	const provisionalFieldIds = new Set(provisionalField.lane.familyIds)
	const absorbedFieldFamilyIds = opticalBlendFamilyIds(
		families,
		families.filter(({ id }) => provisionalFieldIds.has(id)),
		[...mutableAdjacencies.values()],
		familyIdByIndex,
	)
	const laneResults = [
		absorbedFieldFamilyIds.size === 0
			? provisionalField
			: rankLane("field", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldFamilies, fieldScoreOf, () => 0, fieldScoreOf, absorbedFieldFamilyIds),
		rankLane("signature", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.signatureFamilies, ({ signatureScore }) => signatureScore, ({ signatureAccentObservation }) => signatureAccentObservation, signatureRoleScore),
		rankLane("foreground", ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.foregroundFamilies, ({ foregroundScore }) => foregroundScore, ({ foregroundTypographyObservation }) => foregroundTypographyObservation, foregroundRoleScore),
	]
	if (CHROMATIC_CANDIDACY_RESERVATION === "lane" || CHROMATIC_CANDIDACY_RESERVATION === "both") {
		laneResults[1] = reserveChromaticSignatureSeat(laneResults[1], families)
	}
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
		absorbedFieldFamilyIds: [...absorbedFieldFamilyIds].sort(compareAscii),
		familyBinStep: options.familyBinStep,
		familyAnchorRadius: options.familyAnchorRadius,
	}
}

// Families that are field evidence for *domain membership only*: the ranked field lane
// plus every family transitively reachable from it across low-contrast adjacencies that
// carry the overwhelming majority of that family's boundary. This never enters lane
// ranking, role assignment, or obligation selection — it only lets a continuous field
// that fragmented below the lane cut-off be walked as one region.
function fieldCompositeFamilyIds(evidence: NativePaletteEvidence): Set<string> {
	const members = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const totalBoundary = new Map<string, number>()
	for (const { firstFamilyId, secondFamilyId, boundaryEdges } of evidence.adjacencies) {
		totalBoundary.set(firstFamilyId, (totalBoundary.get(firstFamilyId) ?? 0) + boundaryEdges)
		totalBoundary.set(secondFamilyId, (totalBoundary.get(secondFamilyId) ?? 0) + boundaryEdges)
	}
	const smooth = evidence.adjacencies.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
	for (;;) {
		const memberBoundary = new Map<string, number>()
		for (const { firstFamilyId, secondFamilyId, boundaryEdges } of smooth) {
			for (const [inside, outside] of [[firstFamilyId, secondFamilyId], [secondFamilyId, firstFamilyId]] as const) {
				if (!members.has(inside) || members.has(outside)) continue
				memberBoundary.set(outside, (memberBoundary.get(outside) ?? 0) + boundaryEdges)
			}
		}
		const additions = [...memberBoundary.entries()]
			.filter(([familyId, edges]) =>
				edges / Math.max(1, totalBoundary.get(familyId) ?? 0) >= FIELD_COMPOSITE_EMBEDDED_BOUNDARY_FRACTION)
			.map(([familyId]) => familyId)
			.sort(compareAscii)
		if (additions.length === 0) return members
		for (const familyId of additions) members.add(familyId)
	}
}

function buildBackgroundFieldDomains(evidence: NativePaletteEvidence): BackgroundFieldDomain[] {
	const fieldIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	// Family ids are unique per index in `evidence.families`, so an unordered id *pair* and an
	// unordered index pair are in bijection. Testing membership on a packed numeric pair does the
	// same job as the sorted `"a:b"` string this used to build once per neighbour visit — same
	// answers, no per-pixel array allocation, sort and join in the BFS below.
	const familyCount = evidence.families.length
	const familyIndexById = new Map<string, number>()
	for (let index = 0; index < familyCount; index++) familyIndexById.set(evidence.families[index].id, index)
	const smoothPairs = new Set<number>()
	for (const { firstFamilyId, secondFamilyId, meanContrast } of evidence.adjacencies) {
		if (meanContrast > evidence.familyAnchorRadius) continue
		const first = familyIndexById.get(firstFamilyId)
		const second = familyIndexById.get(secondFamilyId)
		// An adjacency naming a family the evidence does not carry could never be matched by the
		// lookup below either, since that only ever asks about families it just read out of `familyAt`.
		if (first === undefined || second === undefined) continue
		smoothPairs.add(first < second ? first * familyCount + second : second * familyCount + first)
	}
	// The BFS below asks "does a component start at this pixel?" once per pixel per pass, which was a
	// `Map<number, string>` lookup on a hash of every component in the artwork. Component ids are
	// `${familyId}-region-${start}` and so never empty, which is what made the reference's truthiness
	// test a membership test; the `+ 1` offset below carries the same meaning into a typed array.
	const componentIdList: string[] = []
	const componentAtStart = new Int32Array(evidence.pixelCount)
	for (const family of evidence.families) {
		for (const component of family.components) {
			componentAtStart[component.startPixelIndex] = componentIdList.length + 1
			componentIdList.push(component.id)
		}
	}
	let visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	const domains: BackgroundFieldDomain[] = []
	const cornerWidth = Math.max(1, Math.ceil(evidence.width * 0.15))
	const cornerHeight = Math.max(1, Math.ceil(evidence.height * 0.15))
	const cornerPopulation = cornerWidth * cornerHeight
	// Pass one walks the ranked field lane and is byte-identical to the single-pass
	// behaviour. Pass two walks the field composite and only ever *adds* domains the lane
	// walk could not reach; every lane domain is preserved unchanged.
	const composite = fieldCompositeFamilyIds(evidence)
	const passes: Array<Readonly<{ members: ReadonlySet<string>; kind: "connected" | "diffuse-composite"; prefix: string }>> = [
		{ members: fieldIds, kind: "connected", prefix: "field-domain" },
	]
	if (composite.size > fieldIds.size) {
		passes.push({ members: composite, kind: "diffuse-composite", prefix: "diffuse-field-domain" })
	}
	let laneDomainCount = 0
	const laneShapes = new Set<string>()
	// Pixels already covered by a field the lane walk proposes on its own. The composite
	// walk exists to rescue fields that are otherwise unproposable, not to enlarge fields
	// that are already proposed, so a composite region overlapping one of these is dropped.
	const laneProposedAt = new Uint8Array(evidence.pixelCount)
	// Hot-loop locals: the BFS below runs once per pixel per pass, and every one of these was a
	// property load on `evidence` inside it.
	const width = evidence.width
	const height = evidence.height
	const pixelCount = evidence.pixelCount
	const labs = evidence.labs
	const familyAt = evidence.familyAt
	const families = evidence.families
	const anchorRadius = evidence.familyAnchorRadius
	const widthDenominator = Math.max(1, width - 1)
	const heightDenominator = Math.max(1, height - 1)
	const halfWidth = width / 2
	const halfHeight = height / 2
	const lastX = width - 1
	const lastY = height - 1
	const rightCornerX = width - cornerWidth
	const bottomCornerY = height - cornerHeight
	// Per-domain tallies, hoisted out of the BFS and reset through their own order lists so a reset
	// costs what the domain touched rather than what the artwork contains. `familyPopulationOrder`
	// records first-encounter order, which is the `Map`'s insertion order — and `weightedFieldScore`
	// sums in exactly that sequence, so it is load-bearing, not incidental.
	const familyPopulationCounts = new Float64Array(familyCount)
	const familyPopulationOrder: number[] = []
	const componentSeen = new Uint8Array(componentIdList.length)
	const domainComponentSlots: number[] = []
	for (const pass of passes) {
		const memberIds = pass.members
		// Same predicate as `memberIds.has(family.id)`, resolved once per family instead of once
		// per neighbour visit.
		const memberMask = new Uint8Array(familyCount)
		for (let index = 0; index < familyCount; index++) {
			if (memberIds.has(families[index].id)) memberMask[index] = 1
		}
		if (pass.kind === "diffuse-composite") {
			for (const { evidence: domain, pixelIndexes } of domains) {
				if (!domain.eligible) continue
				for (const pixelIndex of pixelIndexes) laneProposedAt[pixelIndex] = 1
			}
			visited = new Uint8Array(evidence.pixelCount)
		}
		for (let start = 0; start < pixelCount; start++) {
			const startFamilyIndex = familyAt[start]
			if (visited[start] || !memberMask[startFamilyIndex]) continue
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
			// Keyed by family *index* rather than id. The insertion sequence is unchanged (index
			// and id are in bijection), so the `weightedFieldScore` sum below still accumulates in
			// exactly the same order — reassociating it would move the low bits.
			for (let index = 0; index < familyPopulationOrder.length; index++) {
				familyPopulationCounts[familyPopulationOrder[index]!] = 0
			}
			familyPopulationOrder.length = 0
			for (let index = 0; index < domainComponentSlots.length; index++) {
				componentSeen[domainComponentSlots[index]!] = 0
			}
			domainComponentSlots.length = 0
			let overlapsLaneProposal = false
			while (queueRead < queueLength) {
				const pixelIndex = queue[queueRead++]
				if (laneProposedAt[pixelIndex]) overlapsLaneProposal = true
				const x = pixelIndex % width
				const y = (pixelIndex / width) | 0
				const familyIndex = familyAt[pixelIndex]
				const labOffset = pixelIndex * 3
				sumX += x / widthDenominator
				sumY += y / heightDenominator
				sumL += labs[labOffset]
				sumA += labs[labOffset + 1]
				sumB += labs[labOffset + 2]
				if (familyPopulationCounts[familyIndex] === 0) familyPopulationOrder.push(familyIndex)
				familyPopulationCounts[familyIndex] += 1
				const componentSlot = componentAtStart[pixelIndex]
				if (componentSlot !== 0 && componentSeen[componentSlot - 1] === 0) {
					componentSeen[componentSlot - 1] = 1
					domainComponentSlots.push(componentSlot - 1)
				}
				if (x === 0 || y === 0 || x === lastX || y === lastY) borderPixels += 1
				quadrants |= 1 << ((x >= halfWidth ? 1 : 0) + (y >= halfHeight ? 2 : 0))
				if (x < cornerWidth && y < cornerHeight) cornerCounts[0] += 1
				if (x >= rightCornerX && y < cornerHeight) cornerCounts[1] += 1
				if (x < cornerWidth && y >= bottomCornerY) cornerCounts[2] += 1
				if (x >= rightCornerX && y >= bottomCornerY) cornerCounts[3] += 1
				// Unrolled in the original left/right/up/down order: the visit order decides the
				// queue order, which decides `startPixelIndex` and every downstream domain id.
				for (let direction = 0; direction < 4; direction++) {
					const neighbor = direction === 0
						? (x > 0 ? pixelIndex - 1 : -1)
						: direction === 1
							? (x < lastX ? pixelIndex + 1 : -1)
							: direction === 2
								? (y > 0 ? pixelIndex - width : -1)
								: (y < lastY ? pixelIndex + width : -1)
					if (neighbor < 0 || visited[neighbor]) continue
					const neighborFamilyIndex = familyAt[neighbor]
					if (!memberMask[neighborFamilyIndex]) continue
					if (familyIndex !== neighborFamilyIndex) {
						const pairKey = familyIndex < neighborFamilyIndex
							? familyIndex * familyCount + neighborFamilyIndex
							: neighborFamilyIndex * familyCount + familyIndex
						if (!smoothPairs.has(pairKey)) continue
						const neighborOffset = neighbor * 3
						// Same three subtractions in the same order as `okDistance(labAt(a), labAt(b))`.
						if (Math.hypot(
							labs[labOffset] - labs[neighborOffset],
							labs[labOffset + 1] - labs[neighborOffset + 1],
							labs[labOffset + 2] - labs[neighborOffset + 2],
						) > anchorRadius) continue
					}
					visited[neighbor] = 1
					queue[queueLength++] = neighbor
				}
			}
			const populationFraction = queueLength / pixelCount
			const ownedCornerCount = cornerCounts.filter((count) => count >= cornerPopulation * 0.5).length
			const weightedFieldScore = familyPopulationOrder.reduce((sum, familyIndex) =>
				sum + families[familyIndex].fieldScore * familyPopulationCounts[familyIndex], 0) / queueLength
			const rejectionReasons: string[] = []
			if (populationFraction < 0.08) rejectionReasons.push("field domain population below 0.08")
			if (ownedCornerCount < 2) rejectionReasons.push("field domain owns fewer than two native corner fields")
			if (weightedFieldScore < 0.35) rejectionReasons.push("field domain weighted field score below 0.35")
			const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
			const quadrantCoverage = ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) +
				(quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4
			const domainEvidence: BackgroundFieldDomainEvidence = {
				id: `${pass.prefix}-${start}`,
				kind: pass.kind,
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
				familyIds: familyPopulationOrder.map((index) => families[index].id).sort(compareAscii),
				componentIds: domainComponentSlots.map((slot) => componentIdList[slot]!).sort(compareAscii),
				eligible: rejectionReasons.length === 0,
				rejectionReasons,
			}
			const shape = `${start}:${queueLength}`
			if (pass.kind === "connected") laneShapes.add(shape)
			// A composite domain that reproduces a lane domain exactly, or that covers a field
			// the lane walk already proposes, carries no new evidence.
			const redundant = pass.kind === "diffuse-composite" && (laneShapes.has(shape) || overlapsLaneProposal)
			if (domainComponentSlots.length > 0 && !redundant) {
				domains.push({ evidence: domainEvidence, pixelIndexes: Uint32Array.from(queue.subarray(0, queueLength)) })
			}
		}
		if (pass.kind === "connected") laneDomainCount = domains.length
	}
	// Paired corridors are seeded from the lane pass alone, so the corridor set is exactly
	// what the single-pass build produced.
	const connectedDomains = domains.slice(0, laneDomainCount)
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
	if (direction === "center-0.35-0.50") return (x, y) => Math.hypot(x - 0.35, y - 0.5)
	if (direction === "center-0.65-0.50") return (x, y) => Math.hypot(x - 0.65, y - 0.5)
	if (direction === "center-0.50-0.65") return (x, y) => Math.hypot(x - 0.5, y - 0.65)
	if (direction === "horizontal") return (x) => x
	if (direction === "vertical") return (_x, y) => y
	if (direction === "diagonal-down") return (x, y) => (x + y) / 2
	if (direction === "diagonal-up") return (x, y) => (x + 1 - y) / 2
	const angle = Number(direction.slice("angle-".length)) * Math.PI / 180
	return (x, y) => Math.cos(angle) * x + Math.sin(angle) * y
}

function fitGradients(
	evidence: NativePaletteEvidence,
	domains: readonly BackgroundFieldDomain[],
	options: GradientFitOptions = DEFAULT_GRADIENT_FIT_OPTIONS,
): GradientFit[] {
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
	if (options.additionalGeometries) definitions.push(
		{ topology: "linear", direction: "angle-22.5" },
		{ topology: "linear", direction: "angle-67.5" },
		{ topology: "linear", direction: "angle-112.5" },
		{ topology: "linear", direction: "angle-157.5" },
		{ topology: "radial-offset", direction: "center-0.35-0.50" },
		{ topology: "radial-offset", direction: "center-0.65-0.50" },
		{ topology: "radial-offset", direction: "center-0.50-0.65" },
	)
	const fits: GradientFit[] = []
	for (const domain of domains.filter(({ evidence: domainEvidence }) => domainEvidence.eligible)
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldDomains)) {
		const gridSize = options.fitGridSize
		const cells: Cell[] = Array.from({ length: gridSize * gridSize }, () => ({
			count: 0,
			sum: [0, 0, 0],
			sumSquares: 0,
			sumX: 0,
			sumY: 0,
		}))
		for (const pixelIndex of domain.pixelIndexes) {
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const gridX = Math.min(gridSize - 1, Math.floor(x * gridSize / evidence.width))
			const gridY = Math.min(gridSize - 1, Math.floor(y * gridSize / evidence.height))
			const cell = cells[gridY * gridSize + gridX]
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
		if (observations.length < gridSize) continue
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
			const bands = Array.from({ length: gridSize }, () => ({ sum: 0, weight: 0 }))
			for (const { t, value, weight } of positioned) {
				const band = Math.min(gridSize - 1, Math.floor(t * gridSize))
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
			const monotonicity = monotonicTransitions / (gridSize - 1)
			const progression = progressiveTransitions / (gridSize - 1)
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

/**
 * The fit's own geometry evaluated once at every pixel of its field domain, indexed in step with
 * `fit.domain.pixelIndexes`.
 *
 * Every consumer of a fit needs this exact vector, and before this existed each of them rebuilt it
 * from scratch — `fit.position` is two nested closure calls plus a modulo and two divisions per
 * pixel, and `endpointBandRepresentatives` paid for it once per pixel *per candidate family*.
 */
function domainPositions(evidence: NativePaletteEvidence, fit: GradientFit): Float64Array {
	const pixelIndexes = fit.domain.pixelIndexes
	const width = evidence.width
	const widthDenominator = Math.max(1, width - 1)
	const heightDenominator = Math.max(1, evidence.height - 1)
	const positions = new Float64Array(pixelIndexes.length)
	for (let index = 0; index < pixelIndexes.length; index++) {
		const pixelIndex = pixelIndexes[index]
		positions[index] = fit.position(
			(pixelIndex % width) / widthDenominator,
			Math.floor(pixelIndex / width) / heightDenominator,
		)
	}
	return positions
}

/**
 * Where along the fitted gradient each end band's expected colour is read off. The bands
 * themselves are everything below position 0.2 and everything above 0.8; the colour a band's
 * candidates are scored against is sampled one tenth in from each end rather than at the very
 * extremes, so a fit that overshoots at its edges does not set the target.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the high position is
 * live on 113 artworks and +-20 % moves 27 of them (24 %). It also carries the strongest
 * over-fitting signature in that sweep alongside the region population scale — 2.1x more likely to
 * move unseen artwork than reviewed artwork. The low position was a separate site and did not
 * reach the top bucket; the pair is symmetric about 0.5 and should stay so.
 */
export const ENDPOINT_BAND_SAMPLE_POSITIONS = Object.freeze({
	low: 0.1,
	high: 0.9,
} as const)

function endpointBandRepresentatives(
	evidence: NativePaletteEvidence,
	fit: GradientFit,
	positions: Float64Array,
	lowBand: boolean,
): BandEndpoint[] {
	const counts = new Uint32Array(evidence.families.length)
	const pixelIndexes = fit.domain.pixelIndexes
	let bandPopulation = 0
	for (let index = 0; index < pixelIndexes.length; index++) {
		const position = positions[index]
		if ((lowBand && position <= 0.2) || (!lowBand && position >= 0.8)) {
			counts[evidence.familyAt[pixelIndexes[index]]] += 1
			bandPopulation += 1
		}
	}
	const endpointPosition = lowBand ? ENDPOINT_BAND_SAMPLE_POSITIONS.low : ENDPOINT_BAND_SAMPLE_POSITIONS.high
	const expected: OKLab = [
		fit.intercept[0] + fit.slope[0] * endpointPosition,
		fit.intercept[1] + fit.slope[1] * endpointPosition,
		fit.intercept[2] + fit.slope[2] * endpointPosition,
	]
	const selected = evidence.families
		.map((family, index) => ({
			family,
			familyIndex: index,
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
	return selected.flatMap(({ family, familyIndex, count }) => {
		let exemplarIndex = -1
		let exemplarDistance = Infinity
		const spread = createBandSpatialSpreadAccumulator((lab) => quantizedKey(lab, evidence.familyBinStep))
		const width = evidence.width
		const widthDenominator = Math.max(1, width - 1)
		const heightDenominator = Math.max(1, evidence.height - 1)
		for (let index = 0; index < pixelIndexes.length; index++) {
			const pixelIndex = pixelIndexes[index]
			// `familyAt` holds the index into `evidence.families`, and family ids are unique per
			// index, so this is the same test as comparing `.id` — without the double indirection
			// and the string compare, per pixel, per family, per fit.
			if (evidence.familyAt[pixelIndex] !== familyIndex) continue
			const position = positions[index]
			if (!((lowBand && position <= 0.2) || (!lowBand && position >= 0.8))) continue
			const x = (pixelIndex % width) / widthDenominator
			const y = Math.floor(pixelIndex / width) / heightDenominator
			const lab = labAt(evidence.labs, pixelIndex)
			const distance = okDistance(lab, expected)
			if (distance < exemplarDistance) {
				exemplarDistance = distance
				exemplarIndex = pixelIndex
			}
			spread.add(lab, x, y)
		}
		if (exemplarIndex < 0) return []
		const bandSpread = spread.finish()
		const baseSupport = family.representatives.find(({ support }) => !("generated" in support))?.support
		if (!baseSupport || "generated" in baseSupport) return []
		const rgb = rgbAt(evidence.rgbData, exemplarIndex)
		const oklab = labAt(evidence.labs, exemplarIndex)
		return [{
			family,
			bandShare: count / Math.max(1, bandPopulation),
			bandSpread,
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

/**
 * The APCA |Lc| at which an accent *on a gradient* counts as fully observable, for ranking.
 *
 * The foreground normalizes its contrast against 90, a text-legibility scale: body copy has to
 * be read, so more contrast really is better right up to the top of the range. The accent is not
 * text. The recorded design rule is explicit — the accent is not used for text, it is used for
 * icons or UI elements — and an icon only has to be findable. Past that point extra contrast
 * buys nothing a viewer can use, so it must not buy ranking advantage either.
 *
 * Normalizing the accent against the full range made this axis monotone in raw contrast all the
 * way up, which systematically favours whichever candidate accent is most *foreign* to the
 * artwork: a colour the field does not contain contrasts against that field precisely because it
 * is alien to it. Reviewed cases show the failure directly — an off-palette accent can beat the
 * artwork's own on mean *and* minimum |Lc| simultaneously (20.8/15.5 against 15.9/7.8), so no
 * re-mixing of mean against minimum can separate them. The scale is wrong, not the blend.
 *
 * Saturating instead means candidates that are all adequately visible tie on this axis, and the
 * decision falls through to the axes that should own it — accent fidelity and artwork identity.
 * The value is where human review has repeatedly put the floor of "clearly good": Lc ≈ 9 outputs
 * have been judged good, and an accent holding |Lc| ≈ 8 across a gradient was described as
 * remaining distinguishable over a large part of it. Outcomes are stable anywhere in roughly
 * 6..12, so this is a plateau rather than a tuned point.
 */
const ACCENT_OBSERVABILITY_ADEQUATE_LC = 9

/**
 * The accent's contrast range on a flat field, unchanged from the reviewed behaviour.
 *
 * Only gradient sampling was made render-truthful, so only gradient accent contrast carries new
 * evidence. A flat treatment's accent pairs are byte-identical to what review already judged;
 * re-scaling them would move rankings on cases whose evidence did not change, which is exactly
 * the blast radius a compensating change must not have.
 */
const ACCENT_CONTRAST_RANGE = 75

/**
 * The reference |Lc| the **foreground**'s contrast ramp divides by.
 *
 * `foregroundUtility` is `sqrt(0.5*clamp(mean|Lc|/S) + 0.5*clamp(min|Lc|/S))`, and it feeds
 * `foregroundPath`, which carries weight 0.15 — the joint-largest in the winner objective. `S` was
 * a bare literal `90`.
 *
 * **90 is an accessibility-grade target, and this library disclaims accessibility grading.** APCA's
 * own guidance puts Lc 90 at body text in the smallest sizes; charter constraint 2 says the
 * opposite in as many words — "APCA contrast is intentionally very low. This is not web
 * accessibility; human review has judged Lc ≈ 9 outputs as good. APCA is one piece of evidence
 * among others." The charter forbids introducing an accessibility-level *floor*; a ramp that keeps
 * paying all the way to 90 on the objective's largest role axis is the same policy error written as
 * a *reward*, and it is the one this codebase never audited because it is not a floor.
 *
 * The correction is not a new idea and not a new number. `ACCENT_OBSERVABILITY_ADEQUATE_LC` is the
 * same question — "is this role adequately visible?" — already answered for the accent, and its
 * rationale is precisely this argument: "the scale is wrong, not the blend. Saturating instead
 * means candidates that are all adequately visible tie on this axis, and the decision falls through
 * to the axes that should own it." That constant is where "review has repeatedly put the floor of
 * 'clearly good'", with outcomes "stable anywhere in roughly 6..12, so this is a plateau rather
 * than a tuned point". It was applied to the gradient accent only, and the reason recorded at the
 * time was *blast radius*, not correctness: "only gradient accent contrast carries new evidence".
 *
 * The foreground is the one mark-bearing role that never got that treatment. Pointing it at the
 * same constant makes one adequacy notion serve both mark-bearing roles instead of two references
 * an order of magnitude apart, and it is emphatically not fitted to the cases that motivated it:
 * both clear the plateau by a wide margin (`0cd48f`'s endorsed teal at |Lc| 24.3, `03e50500`'s
 * endorsed band-name gold at 34.5–39.2, against 9). Any value at or below ~24 flips `0cd48f`; the
 * value shipped is the reviewed one, chosen before the boundary was measured.
 *
 * `90` restores the previous behaviour exactly. The intermediate values were measured and are
 * recorded in `research/v2-3-experiments/carrier-ranking/EXPERIMENT.md`: 75 (the flat accent's own
 * range) and 40 both leave the reviewed outcome losing, so neither is a cheaper version of this
 * change — they are just smaller numbers with no argument behind them.
 */
const FOREGROUND_CONTRAST_SCALE: number = 90

/**
 * The population ratio inside `signatureScore`, and its weight there. Named because
 * `signatureAccentRoleScore` has to repair exactly this term with exactly these numbers — a
 * repair computed from different constants than the score it repairs would be a second scoring
 * rule wearing the first one's name.
 */
const SIGNATURE_COHERENT_SUPPORT_SCALE = 0.002

const SIGNATURE_COHERENT_SUPPORT_WEIGHT = 0.25

// PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:301`): the lower edge 0.42 is live on 113
// artworks and +-20 % moves 28 of them. Exported for the pin in `test/configuration.test.ts`.
export const FIELD_MIDPOINT_BAND = Object.freeze([0.42, 0.58] as const)

/**
 * How far the field's midpoint colour must sit off the endpoint chord before a third stop is
 * warranted, in family bin steps. One bin step is the same bar the transition-path route
 * applies to its own intermediate stages, and — because the maximum difference between the
 * three-stop and two-stop renders is exactly the chord deviation — it is also a direct bar on
 * how much the third stop moves the render.
 */
export const ALBUM_ARTWORK_PALETTE_V2_MINIMUM_CHORD_DEVIATION_IN_FAMILY_BIN_STEPS = 1

/**
 * How different, in ΔE, a midpoint colour must be from each endpoint to count as a different
 * colour at all.
 *
 * The chord-deviation test above asks whether the third stop moves the *render*; it is silent on
 * whether the stop is a colour distinct from the ones already on screen. Those come apart: a
 * midpoint that equals the background exactly still bends the ramp maximally away from the
 * chord, because it makes the gradient hold at one end and then run. Review rejected precisely
 * that output — "a midpoint cannot be the same color as either endpoint", and, of a pair of
 * near-blacks, "visually indistinguishable … too close, too black … consider them the same
 * color". So distinctness is a second, independent requirement.
 *
 * The threshold is read off those judgements rather than chosen. Seven anchors bracket it: the
 * refused midpoints score 0.00 (identical to the background), 1.00, and 3.01, while the accepted
 * ones score 3.64, 9.78, 19.75 and 62.58. The 3.01 case was declined on the grounds that the
 * midpoint was drawn from *shadow* material — "this is not the vibe of the artwork" — which is a
 * statement about what the colour is made of rather than how far away it is; it is included here
 * because a bar in (3.01, 3.64) is the only currently available way to refuse it, not because
 * distance is the right account of it. See the caveat below.
 *
 * Note this test is *not* expressible in OKLab: the 1.00 refusal and a 3.64 acceptance sit at
 * OKLab distance 0.0101 and 0.0100 respectively — the wrong side of each other — which is the
 * shadow-inflation `perceptualDifference` documents.
 *
 * A former CAVEAT here claimed the bar was over-strict by one case (a ΔE 2.58 midpoint carried by
 * a preferred output). REFUTED by the midpoint-fidelity arm (2026-08-02): that artwork
 * (`000637ff`) has a later de-confounded rerun (`verdicts.jsonl:98`) where all four roles are
 * identical and only the midpoint differs — and the reviewer chose the NO-midpoint side, strong.
 * The original preference bundled an accent change; the clean comparison endorses the bar. The
 * anchors' full provenance is in `research/v2-3-experiments/midpoint-fidelity/EXPERIMENT.md`.
 */
export const ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE =
	ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor

/**
 * The midpoint a candidate would actually render, or null for a two-stop ramp.
 *
 * The earn decision depends on the endpoints the candidate carries, not only on the measured
 * band, so it cannot be settled when the evidence is built. Both the renderer and the contrast
 * evidence ask through here so they can never disagree about what is on screen.
 *
 * Two independent things must hold: the third stop has to move the render (chord deviation),
 * and it has to be a colour the ramp does not already show at an endpoint (perceptual
 * distinctness).
 */
export function earnedRenderMidpoint(
	background: Readonly<{ rgb: RGB; oklab: OKLab }>,
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>,
	midpoint: FieldMidpointEvidence | null | undefined,
): FieldMidpointEvidence | null {
	if (!midpoint) return null
	const chord = mixOKLab(background.oklab, surface.oklab, 0.5)
	if (okDistance(midpoint.oklab, chord) < midpoint.minimumChordDeviation) return null
	const endpointDifference = Math.min(
		perceptualDifference(midpoint.rgb, background.rgb),
		perceptualDifference(midpoint.rgb, surface.rgb),
	)
	if (endpointDifference < ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE) return null
	return midpoint
}

/** The rendered field colour at `position`, for a two- or three-stop ramp. */
export function renderedFieldColor(
	background: OKLab,
	surface: OKLab,
	midpoint: FieldMidpointEvidence | null,
	position: number,
): OKLab {
	if (midpoint === null) return mixOKLab(background, surface, position)
	return position <= 0.5
		? mixOKLab(background, midpoint.oklab, position / 0.5)
		: mixOKLab(midpoint.oklab, surface, (position - 0.5) / 0.5)
}

/**
 * The representative colour of the field at the gradient's spatial midpoint.
 *
 * Same standard as the endpoints: the modal colour of the band's occupancy, snapped to an
 * exact source pixel drawn from that mode, and required to be field material rather than an
 * object standing in the band. Whether the colour is different enough from the endpoint
 * chord to earn a third render stop is decided later, against the endpoints actually
 * selected, because the two questions are independent.
 */
function fieldMidpointEvidence(
	evidence: NativePaletteEvidence,
	fit: GradientFit,
	positions: Float64Array,
): FieldMidpointEvidence | null {
	const [minimumPosition, maximumPosition] = FIELD_MIDPOINT_BAND
	const samples: BandRepresentativeSample[] = []
	const pixelIndexes = fit.domain.pixelIndexes
	for (let index = 0; index < pixelIndexes.length; index++) {
		const position = positions[index]
		if (position < minimumPosition || position > maximumPosition) continue
		const pixelIndex = pixelIndexes[index]
		samples.push({ pixelIndex, lab: labAt(evidence.labs, pixelIndex) })
	}
	const population = analyzeBandPopulation(samples, evidence)
	const representative = population.representative
	if (representative === null || !representative.densitySupported) return null
	const colorEvidence = population.evidenceFor(representative.lab)
	if (!colorEvidence.fieldLike) return null
	const rgb = rgbAt(evidence.rgbData, representative.pixelIndex)
	return {
		rgb,
		oklab: representative.lab,
		hex: rgbToHex(rgb),
		bandPopulationFraction: samples.length / Math.max(1, fit.domain.pixelIndexes.length),
		occupancyShare: colorEvidence.share,
		spatialSpreadRatio: colorEvidence.spatialSpreadRatio,
		minimumChordDeviation: evidence.familyBinStep *
			ALBUM_ARTWORK_PALETTE_V2_MINIMUM_CHORD_DEVIATION_IN_FAMILY_BIN_STEPS,
		provenance: {
			exactSource: true,
			familyId: evidence.families[evidence.familyAt[representative.pixelIndex]].id,
			fieldDomainId: fit.domain.evidence.id,
			pixelIndex: representative.pixelIndex,
			x: representative.pixelIndex % evidence.width,
			y: Math.floor(representative.pixelIndex / evidence.width),
		},
	}
}

/**
 * The band mode histogram, as open addressing on typed arrays.
 *
 * `nativeBandEvidence`'s pixel loop ran one `Map.get` plus one `Map.set` for **every pixel of every
 * field domain of every fit**. Ablating those two calls (and nothing else) from a ten-artwork run
 * moved it from 9889ms to 9358ms of CPU: 531ms, 5.4% of total extraction time, spent hashing boxed
 * numbers.
 *
 * Only one thing is ever read back — the argmax under `count desc || key asc`, which is a total
 * order over distinct keys — so the table's slot order cannot show through, exactly as the `Map`'s
 * insertion order could not. Slots hold `key + 1` so that `0` can mark "empty"; mode keys are
 * `familyIndex * 131072 + quantizedKey` and therefore never negative.
 */
type BandModeTable = {
	keys: Float64Array
	counts: Float64Array
	mask: number
	size: number
	growthLimit: number
}

const BAND_MODE_INITIAL_CAPACITY = 256

function createBandModeTable(): BandModeTable {
	return {
		keys: new Float64Array(BAND_MODE_INITIAL_CAPACITY),
		counts: new Float64Array(BAND_MODE_INITIAL_CAPACITY),
		mask: BAND_MODE_INITIAL_CAPACITY - 1,
		size: 0,
		growthLimit: BAND_MODE_INITIAL_CAPACITY >> 1,
	}
}

/**
 * Deterministic and total: `>>> 0` reduces the stored key modulo 2^32 before mixing, so two keys
 * that differ only above 2^32 would land in the same bucket. That costs a probe step and nothing
 * else — the slot comparison below is on the full value.
 */
function bandModeBucket(table: BandModeTable, stored: number): number {
	return (Math.imul(stored >>> 0, 0x9e37_79b1) >>> 0) & table.mask
}

function growBandModeTable(table: BandModeTable): void {
	const previousKeys = table.keys
	const previousCounts = table.counts
	const capacity = previousKeys.length * 2
	table.keys = new Float64Array(capacity)
	table.counts = new Float64Array(capacity)
	table.mask = capacity - 1
	table.growthLimit = capacity >> 1
	for (let slot = 0; slot < previousKeys.length; slot++) {
		const stored = previousKeys[slot]!
		if (stored === 0) continue
		let probe = bandModeBucket(table, stored)
		while (table.keys[probe] !== 0) probe = (probe + 1) & table.mask
		table.keys[probe] = stored
		table.counts[probe] = previousCounts[slot]!
	}
}

function incrementBandMode(table: BandModeTable, key: number): void {
	const stored = key + 1
	let probe = bandModeBucket(table, stored)
	for (;;) {
		const found = table.keys[probe]!
		if (found === stored) {
			table.counts[probe] += 1
			return
		}
		if (found === 0) {
			table.keys[probe] = stored
			table.counts[probe] = 1
			table.size += 1
			if (table.size > table.growthLimit) growBandModeTable(table)
			return
		}
		probe = (probe + 1) & table.mask
	}
}

/**
 * The key with the highest count, ties broken by the smaller key; `-1` when the band is empty.
 *
 * That is `[...modes.entries()].sort(count desc || key asc)[0]?.[0] ?? -1` with the sort removed:
 * the comparator is a total order over distinct keys, so a single scan holding the running best
 * reaches the same element from any starting order.
 */
function dominantBandMode(table: BandModeTable): number {
	let bestKey = -1
	let bestCount = -1
	for (let slot = 0; slot < table.keys.length; slot++) {
		const stored = table.keys[slot]!
		if (stored === 0) continue
		const key = stored - 1
		const count = table.counts[slot]!
		if (count > bestCount || (count === bestCount && key < bestKey)) {
			bestKey = key
			bestCount = count
		}
	}
	return bestKey
}

function nativeBandEvidence(
	evidence: NativePaletteEvidence,
	fit: GradientFit,
	positions: Float64Array,
	bandCount = GRID_SIZE,
): Readonly<{
	progression: number
	modeProgression: number
	dispersion: number
	edgeContinuity: number
}> {
	const bands = Array.from({ length: bandCount }, () => ({ sum: 0, sumSquares: 0, count: 0, modes: createBandModeTable() }))
	const unit: OKLab = [fit.slope[0] / fit.span, fit.slope[1] / fit.span, fit.slope[2] / fit.span]
	const pixelIndexes = fit.domain.pixelIndexes
	const width = evidence.width
	// Doubles as the domain-membership test this used to keep in a separate Uint8Array: entries are
	// `denseIndex + 1`, so a zero still means "not in this domain" and no `fill(-1)` pass is needed.
	// The offset lets the neighbour below read its position out of the same cache.
	const denseIndexPlusOne = new Int32Array(evidence.pixelCount)
	for (let index = 0; index < pixelIndexes.length; index++) denseIndexPlusOne[pixelIndexes[index]] = index + 1
	let totalProgressiveEdgeChange = 0
	let jumpProgressiveEdgeChange = 0
	// The colour reads below go straight to the Float32Array rather than through `labAt`, which
	// returns a fresh tuple: this loop runs once per domain pixel per fit, and allocated one tuple
	// for the pixel plus one per in-domain neighbour. Arithmetic and operand order are unchanged.
	const labs = evidence.labs
	const familyAt = evidence.familyAt
	const unitL = unit[0]
	const unitA = unit[1]
	const unitB = unit[2]
	for (let index = 0; index < pixelIndexes.length; index++) {
		const pixelIndex = pixelIndexes[index]
		const position = positions[index]
		const bandIndex = Math.min(bandCount - 1, Math.floor(position * bandCount))
		const labOffset = pixelIndex * 3
		const labL = labs[labOffset]
		const labA = labs[labOffset + 1]
		const labB = labs[labOffset + 2]
		const projected = labL * unitL + labA * unitA + labB * unitB
		const band = bands[bandIndex]
		band.sum += projected
		band.sumSquares += projected * projected
		band.count += 1
		const modeKey = familyAt[pixelIndex] * 131_072 + quantizedKeyOf(labL, labA, labB, evidence.familyBinStep)
		incrementBandMode(band.modes, modeKey)
		const pixelX = pixelIndex % width
		for (let direction = 0; direction < 2; direction++) {
			const neighbor = direction === 0
				? (pixelX + 1 < width ? pixelIndex + 1 : -1)
				: (pixelIndex + width < evidence.pixelCount ? pixelIndex + width : -1)
			if (neighbor < 0) continue
			const neighborDense = denseIndexPlusOne[neighbor]
			if (neighborDense === 0) continue
			const positionDelta = positions[neighborDense - 1] - position
			if (Math.abs(positionDelta) < 1e-8) continue
			const neighborOffset = neighbor * 3
			const neighborL = labs[neighborOffset]
			const neighborA = labs[neighborOffset + 1]
			const neighborB = labs[neighborOffset + 2]
			const projectedDelta = (
				(neighborL - labL) * unitL +
				(neighborA - labA) * unitA +
				(neighborB - labB) * unitB
			) * Math.sign(positionDelta)
			if (projectedDelta <= 0) continue
			totalProgressiveEdgeChange += projectedDelta
			// Same three subtractions in the same order as `okDistance(lab, neighborLab)`.
			if (Math.hypot(labL - neighborL, labA - neighborA, labB - neighborB) > FAMILY_BIN_STEP) {
				jumpProgressiveEdgeChange += projectedDelta
			}
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
	const dominantModes = bands.map(({ modes }) => dominantBandMode(modes))
	let modeTransitions = 0
	for (let index = 1; index < dominantModes.length; index++) {
		if (dominantModes[index] >= 0 && dominantModes[index - 1] >= 0 && dominantModes[index] !== dominantModes[index - 1]) {
			modeTransitions += 1
		}
	}
	return {
		progression: progressiveTransitions / (bandCount - 1),
		modeProgression: modeTransitions / (bandCount - 1),
		dispersion: Math.sqrt(variance) / Math.max(1e-8, fit.span),
		edgeContinuity: totalProgressiveEdgeChange <= 1e-8
			? 0
			: clamp(1 - jumpProgressiveEdgeChange / totalProgressiveEdgeChange),
	}
}

function evaluateGradientFits(
	evidence: NativePaletteEvidence,
	domains: readonly BackgroundFieldDomain[],
	options: GradientFitOptions = DEFAULT_GRADIENT_FIT_OPTIONS,
): EvaluatedGradientFit[] {
	return fitGradients(evidence, domains, options).flatMap((fit): EvaluatedGradientFit[] => {
		// `fit.position` is a pure function of the pixel's normalised coordinates, and all four
		// consumers below walk the same `fit.domain.pixelIndexes` asking it the same questions —
		// `endpointBandRepresentatives` alone asked once per pixel and then again once per pixel
		// per selected family, twice over (low band and high band). Evaluating it once per pixel
		// per fit and reading the answers back out of a Float64Array is the same double every
		// time, so nothing downstream can tell the difference.
		const positions = domainPositions(evidence, fit)
		const nativeBands = nativeBandEvidence(evidence, fit, positions, options.nativeBandCount)
		const progression = Math.min(fit.progression, nativeBands.progression)
		const modeProgression = nativeBands.modeProgression
		const bandDispersion = nativeBands.dispersion
		const edgeContinuity = nativeBands.edgeContinuity
		const lows = endpointBandRepresentatives(evidence, fit, positions, true)
		const highs = endpointBandRepresentatives(evidence, fit, positions, false)
		// Deferred, not skipped. The only reader of `fieldMidpoint` is
		// `buildFieldHypothesesFromEvaluatedFits`, which reaches it *after*
		// `if (rejectionReasons.length > 0 || !low || !high) continue` — so on most artworks this
		// scanned the whole field domain, allocated a sample record per pixel in the midpoint band
		// and ran a full band-population analysis for fits that were then discarded unread.
		// Memoised per fit (its inputs are the fit and the evidence, both fixed here) so the
		// endpoint pairs below still share one computation, exactly as the eager call did.
		let midpointComputed = false
		let midpointValue: FieldMidpointEvidence | null = null
		const fieldMidpoint = (): FieldMidpointEvidence | null => {
			if (!midpointComputed) {
				midpointValue = fieldMidpointEvidence(evidence, fit, positions)
				midpointComputed = true
			}
			return midpointValue
		}
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
			return {
				fit, progression, modeProgression, bandDispersion, edgeContinuity, low, high, rejectionReasons,
				// A getter, so the field still answers with the true value for anyone who asks —
				// the work is only deferred to the first ask, not conditioned on the caller.
				get fieldMidpoint(): FieldMidpointEvidence | null { return fieldMidpoint() },
			}
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
	// `fieldMidpoint` is deliberately NOT destructured here. It is a memoised getter that scans the
	// whole field domain on first read, and destructuring in the loop header would read it for
	// every fit — including the ones the very next line discards, which on most artworks is most
	// of them. It is read below, past the guard, where its value is actually wanted.
	for (const evaluated of evaluatedGradientFits) {
		const { fit, progression, modeProgression, bandDispersion, edgeContinuity, low, high, rejectionReasons } = evaluated
		if (rejectionReasons.length > 0 || !low || !high) continue
		const fieldMidpoint = evaluated.fieldMidpoint
		const roleAssignment = assignFieldRoles(low.family, high.family)
		const backgroundEndpoint = roleAssignment.backgroundFamilyId === low.family.id ? low : high
		const surfaceEndpoint = backgroundEndpoint === low ? high : low
		const gradientEvidence: GradientFieldEvidence = {
			topology: fit.topology,
			direction: fit.direction,
			endpointBands: [0.2, 0.8],
			fieldMidpoint,
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
		const bandSpreadOf = (endpoint: BandEndpoint) => (representative: ColorRepresentative): number | null =>
			endpoint.bandSpread.spreadFor(representative.oklab)
		const endpointBandSpread = {
			background: backgroundRepresentatives.map(bandSpreadOf(backgroundEndpoint)),
			surface: surfaceRepresentatives.map(bandSpreadOf(surfaceEndpoint)),
		}
		gradientCandidates.push({
			id: `gradient:${fit.domain.evidence.id}:${fit.topology}:${fit.direction}:${backgroundEndpoint.family.id}:${surfaceEndpoint.family.id}:${backgroundEndpoint.representative.hex}:${surfaceEndpoint.representative.hex}`,
			kind: "gradient-field",
			backgroundFamilyId: backgroundEndpoint.family.id,
			surfaceFamilyId: surfaceEndpoint.family.id,
			backgroundRepresentatives,
			surfaceRepresentatives,
			endpointBandSpread,
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
	/**
	 * `"collapsed-only"` emits every pair as its degenerate single field — background only, no
	 * gradient claim, no surface — and skips the distinctness guards, which exist to refuse a
	 * *gradient* claim and have nothing to say about a field read as one colour.
	 *
	 * Omitted (the default) is the normal reading and is what every ordinary caller uses. The one
	 * caller that passes it does so only after the normal reading returned nothing at all; see the
	 * fallback in `buildCompletePaletteTreatmentDomain`.
	 */
	treatments?: "all" | "collapsed-only"
}>

/**
 * How many background/surface representative pairs the `"control"` representative policy walks
 * when it is not cross-pairing. A pure search-truncation bound: raising it can only add candidate
 * pairs, so every flip it produces is a candidate the search never saw, not a preference.
 *
 * PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:294`): live on all 154 artworks, and -20 %
 * moves 60 of them (39 %) — one-sided, 0 flips upward at +20 % because 2 -> 2.4 truncates back to
 * the same pair count. Lifted from its single use site below, value unchanged.
 */
export const CONTROL_FIELD_VARIANT_PAIRS = 2

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
		/**
		 * `preferredRepresentatives` re-sorts by strategy, so the published
		 * spread array is matched by colour identity rather than by index.
		 *
		 * `null` is "not measured" and propagates: a pair is only comparable on band
		 * extent when both of its endpoints were measured.
		 */
		const bandSpreadOf = (role: "background" | "surface", representative: ColorRepresentative): number | null => {
			const published = hypothesis.endpointBandSpread
			if (!published) return null
			const representatives = role === "background"
				? hypothesis.backgroundRepresentatives
				: hypothesis.surfaceRepresentatives
			const index = representatives.findIndex(({ rgb }) => sameColor(rgb, representative.rgb))
			if (index < 0) return null
			return (role === "background" ? published.background : published.surface)[index] ?? null
		}
		const pairBandSpread = (background: ColorRepresentative, surface: ColorRepresentative): number | null => {
			const first = bandSpreadOf("background", background)
			const second = bandSpreadOf("surface", surface)
			return first === null || second === null ? null : first + second
		}
		const pairs: Array<readonly [ColorRepresentative | undefined, ColorRepresentative | undefined]> =
			options.pairing === "cross-pair" && hypothesis.kind !== "one-field"
				? backgrounds.flatMap((background) => surfaces.map((surface) => [background, surface] as const))
				: Array.from(
					{ length: Math.min(backgrounds.length, surfaces.length, options.representatives === "control" ? CONTROL_FIELD_VARIANT_PAIRS : Infinity) },
					(_value, strategyIndex) => [backgrounds[strategyIndex] ?? backgrounds[0], surfaces[strategyIndex] ?? surfaces[0]] as const,
				)
		for (const [background, surface] of pairs) {
			if (!background || !surface) continue
			if (options.treatments === "collapsed-only") {
				// The collapsed reading of this pair, and nothing else. Identical in shape to the
				// `one-field` push at the bottom of the ordinary path — the same discount, the same
				// zero band spread, the same dropped midpoint — because it *is* that treatment,
				// reached without first having to survive guards that only ever judge a gradient.
				variants.push({
					hypothesis,
					background,
					surface: background,
					gradient: false,
					treatment: "one-field",
					fieldFidelity: clamp(hypothesis.fieldFidelity * (1 - hypothesis.surfaceContribution * 0.35)),
					surfaceContribution: hypothesis.surfaceContribution,
					endpointBandSpread: 0,
					fieldMidpoint: null,
				})
				continue
			}
			if (hypothesis.kind !== "one-field" && sameColor(background.rgb, surface.rgb)) continue
			if (hypothesis.kind === "gradient-field" && okDistance(background.oklab, surface.oklab) < 0.028) continue
			// A ramp between two colours a viewer would call the same colour renders as flat, so
			// the gradient claim is refused here while the pair's collapsed variant below is left
			// standing: the honest treatment of two colours that are one colour is the one that
			// says so. Measured in ΔE rather than in OKLab because the artworks this catches are
			// near-black, where no single `okDistance` bar can express sameness — the guard on the
			// line above admits them. See `distinctness.gradientEndpoints`.
			if (hypothesis.kind !== "gradient-field" ||
				perceptualDifference(background.rgb, surface.rgb) >= DISTINCTNESS.gradientEndpoints) {
				variants.push({
					hypothesis,
					background,
					surface: hypothesis.kind === "one-field" ? background : surface,
					gradient: hypothesis.kind === "gradient-field",
					treatment: hypothesis.kind,
					fieldFidelity: hypothesis.fieldFidelity,
					surfaceContribution: hypothesis.surfaceContribution,
					endpointBandSpread: pairBandSpread(background, surface),
					fieldMidpoint: hypothesis.gradientEvidence?.fieldMidpoint ?? null,
				})
			}
			if (hypothesis.kind !== "one-field") {
				variants.push({
					hypothesis,
					background,
					surface: background,
					gradient: false,
					treatment: "one-field",
					fieldFidelity: clamp(hypothesis.fieldFidelity * (1 - hypothesis.surfaceContribution * 0.35)),
					surfaceContribution: hypothesis.surfaceContribution,
					endpointBandSpread: 0,
					fieldMidpoint: null,
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
			// Deliberately *not* mark-substituted. Mark evidence repairs a handicap
			// in fair competition; it does not confer an entitlement. An identity
			// obligation is the strongest claim in this system — it grants priority
			// retention in the role shortlists over better-scoring alternatives and
			// carries identity coverage into the winner objective — so it must keep
			// being nominated by the artwork's own source-connected region evidence.
			//
			// Measured (reviewed batch 10): substituting here promoted one artwork's
			// red lettering from being no identity direction at all to the top
			// obligation, and the resulting red accent was rejected in favour of the
			// incumbent dark accent, which reads better as a UI element against that
			// artwork's chromatic field. Where the region evidence *already*
			// nominates the mark, removing the support handicap alone is enough for
			// it to win on its own merits — which is the outcome review preferred.
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
	const neutralQuotaOmittedFamilyIds: string[] = []
	const polarityExemptFamilyIds: string[] = []
	const boundOmitted: typeof ranked = []
	const isNeutral = (family: ColorFamilyEvidence): boolean =>
		family.chroma < ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.neutralObligationChroma
	// A neutral's foreground-polarity claim, signed: negative where the family is the lighter
	// side of its own boundaries (light mark on darker ground), positive where it is the darker.
	// Scaled by the observation's confidence so an unpolarised or thinly observed family reads
	// as no claim at all rather than as a weak one.
	const polarityClaim = (family: ColorFamilyEvidence): number =>
		clamp(family.foregroundPolarityObservation.polarity, -1, 1) *
		clamp(family.foregroundPolarityObservation.confidence)
	const decisivelyOpposes = (candidate: ColorFamilyEvidence, incumbents: readonly ColorFamilyEvidence[]): boolean => {
		const claim = polarityClaim(candidate)
		const decisive = ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.decisiveForegroundPolarity
		return Math.abs(claim) >= decisive && incumbents.every((incumbent) => {
			const other = polarityClaim(incumbent)
			return Math.abs(other) >= decisive && Math.sign(other) !== Math.sign(claim)
		})
	}
	for (const candidate of ranked) {
		if (selected.some(({ family }) =>
			okDistance(family.prototype, candidate.family.prototype) < ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.materialDistance)) {
			redundantDirectionFamilyIds.push(candidate.family.id)
			continue
		}
		// Material distance separates two greys that differ only in lightness, so without a quota
		// a neutral-heavy artwork spends every obligation slot restating one identity direction
		// while chromatic directions that carry real region evidence are never nominated at all.
		// This declines the redundant restatement; it does not promote anyone — the freed slots
		// are filled by the next candidates in the artwork's own evidence order.
		//
		// The exception is polarity. "One direction" is a claim about hue, and for neutrals the
		// direction that decides a role is *lightness polarity*: a near-white and a near-black
		// are opposite foreground claims, not one claim stated twice, so refusing the second is
		// not declining a restatement — it is making the artwork's light text unrepresentable in
		// any role. A candidate is let past the full quota only when its own polarity claim and
		// every selected neutral's are decisive and point opposite ways. That is deliberately
		// self-limiting: once both directions are represented no further neutral can oppose them
		// all, so the quota still bites on the neutral-heavy artworks it was written for.
		if (isNeutral(candidate.family)) {
			const selectedNeutrals = selected.filter(({ family }) => isNeutral(family)).map(({ family }) => family)
			if (selectedNeutrals.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.maximumNeutralObligations) {
				if (!decisivelyOpposes(candidate.family, selectedNeutrals)) {
					neutralQuotaOmittedFamilyIds.push(candidate.family.id)
					continue
				}
				polarityExemptFamilyIds.push(candidate.family.id)
			}
		}
		if (selected.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations) {
			boundOmitted.push(candidate)
			continue
		}
		selected.push(candidate)
	}
	// The obligation shortlist ranks crisp local signature evidence, which can crowd out a
	// family that covers a large share of the artwork. Reserve one place for the broadest
	// otherwise-unrepresented family so a major identity direction is never silently erased
	// by the capacity bound alone.
	const reserved = boundOmitted
		.filter(({ family }) => family.populationFraction >=
			ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.reservedMajorFamilyPopulationFraction)
		.sort((first, second) =>
			compareNumbersDescending(first.family.populationFraction, second.family.populationFraction) ||
			compareAscii(first.family.id, second.family.id))[0]
	const reservedFamilyIds: string[] = []
	if (reserved !== undefined) {
		reservedFamilyIds.push(reserved.family.id)
		selected.push(reserved)
	}
	// The same argument as `reserveChromaticSignatureSeat`, for the other axis the shortlist's
	// ordering key is blind to. `regionEvidenceLevel` ranks the best single region's signature-accent
	// score and nothing in it reads chroma, so on an artwork whose obligations are all spent on large
	// dull directions the one vivid direction is cut by the capacity bound alone — measured by
	// `accent-candidacy` on 5 of its 19 target artworks, and it costs candidacy twice over, because
	// an obligation is also what buys priority retention against the per-foreground accent bound of 4.
	const chromaticReservedFamilyIds: string[] = []
	if (CHROMATIC_CANDIDACY_RESERVATION === "obligation" || CHROMATIC_CANDIDACY_RESERVATION === "both") {
		const ceiling = chromaticCeiling(evidence.families)
		const bar = selected.reduce((peak, { family }) => Math.max(peak, chromaticAccentClaim(family, ceiling)), 0)
		const chromatic = boundOmitted
			.filter((candidate) => candidate !== reserved &&
				chromaticAccentClaim(candidate.family, ceiling) > bar)
			.sort((first, second) =>
				compareNumbersDescending(
					chromaticAccentClaim(first.family, ceiling),
					chromaticAccentClaim(second.family, ceiling)) ||
				compareAscii(first.family.id, second.family.id))[0]
		if (chromatic !== undefined) {
			chromaticReservedFamilyIds.push(chromatic.family.id)
			selected.push(chromatic)
		}
	}
	const boundOmittedFamilyIds = boundOmitted
		.filter((candidate) => candidate !== reserved && !chromaticReservedFamilyIds.includes(candidate.family.id))
		.map(({ family }) => family.id)
	// Ordering, for the same reason the quota now counts polarity. The shortlist's ordering key is
	// the *best single region's* signature-accent score. Between two near-neutrals whose polarity
	// claims oppose each other that is the wrong instrument twice over: it is accent-flavoured,
	// while the question their opposition raises is which of them the artwork sets its text in;
	// and it is a one-region measure, while polarity is observed across the family's regions. So
	// where such a pair exists, the members are re-ordered among the slots they already hold, by
	// how decisive their polarity claim is. Nothing enters or leaves the obligation set, no
	// candidate is promoted past a family that is not its polarity opposite, and a pair that is
	// not decisive on both sides is left exactly as the region evidence ranked it.
	const polarityRanked = [...selected]
	const decisiveNeutralIndexes = polarityRanked
		.map((candidate, index) => ({ candidate, index }))
		.filter(({ candidate }) => isNeutral(candidate.family) &&
			Math.abs(polarityClaim(candidate.family)) >=
				ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.decisiveForegroundPolarity)
	const polarityReorderedFamilyIds: string[] = []
	if (new Set(decisiveNeutralIndexes.map(({ candidate }) =>
		Math.sign(polarityClaim(candidate.family)))).size > 1) {
		const slots = decisiveNeutralIndexes.map(({ index }) => index)
		// Overturning the region evidence has to be earned by a *material* difference in polarity,
		// never by its last decimal: two families that are both perfectly polarised are equally
		// good claims however their measurements round, and one artwork here separates them by
		// 1.4e-4. So claims are banded at the same evidence resolution the rest of the shortlist
		// is ranked at, and within a band the region evidence's order stands.
		const byClaim = [...decisiveNeutralIndexes].sort((first, second) =>
			compareNumbersDescending(
				Math.abs(polarityClaim(first.candidate.family)),
				Math.abs(polarityClaim(second.candidate.family))) ||
			first.index - second.index)
		let band = 0
		let bandLeader = Math.abs(polarityClaim(byClaim[0].candidate.family))
		const banded = byClaim.map((entry) => {
			const claim = Math.abs(polarityClaim(entry.candidate.family))
			if (bandLeader - claim > RANKING_EVIDENCE_RESOLUTION) {
				band += 1
				bandLeader = claim
			}
			return { ...entry, band }
		})
		const reordered = [...banded].sort((first, second) =>
			first.band - second.band || first.index - second.index)
		reordered.forEach(({ candidate }, position) => {
			if (polarityRanked[slots[position]] !== candidate) polarityReorderedFamilyIds.push(candidate.family.id)
			polarityRanked[slots[position]] = candidate
		})
	}
	return {
		obligations: polarityRanked.map((candidate, priority): IdentityObligation => ({
			id: `identity-obligation:${candidate.family.id}`,
			familyId: candidate.family.id,
			priority,
			direction: candidate.family.prototype,
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
			neutralQuotaOmittedFamilyIds: neutralQuotaOmittedFamilyIds.sort(compareAscii),
			polarityExemptFamilyIds: polarityExemptFamilyIds.sort(compareAscii),
			polarityReorderedFamilyIds: polarityReorderedFamilyIds.sort(compareAscii),
			boundOmittedFamilyIds: boundOmittedFamilyIds.sort(compareAscii),
			reservedMajorFamilyIds: reservedFamilyIds.sort(compareAscii),
		},
	}
}

/**
 * The colours UI content will actually sit on.
 *
 * These samples feed every contrast judgement the algorithm makes — foreground utility, the
 * hue-aware sign guard, accent salience — so they have to describe the *render*, which is what a
 * reader's eye meets. That is neither the artwork's detected field nor an abstraction of it: the
 * render contract is a fixed 135-degree ramp between the chosen endpoints, through an earned
 * midpoint when there is one.
 *
 * Sampling a straight two-stop mix for a treatment that renders three stops measures a field
 * that exists nowhere, and it is wrong in the direction that matters — the third stop is earned
 * precisely when it moves the ramp furthest from the straight line, so the treatments whose
 * contrast is most mis-measured are exactly the ones carrying a midpoint.
 */
export function fieldSamples(variant: Readonly<{
	background: Readonly<{ rgb: RGB; oklab: OKLab }>
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>
	gradient: boolean
	fieldMidpoint?: FieldMidpointEvidence | null
}>): Array<Readonly<{ role: PairContrast["fieldRole"]; position: number; rgb: RGB }>> {
	if (variant.gradient) {
		const midpoint = earnedRenderMidpoint(variant.background, variant.surface, variant.fieldMidpoint)
		return ALBUM_ARTWORK_PALETTE_V2_POLICY.gradient.contrastSamplePositions.map((position) => ({
			role: "gradient-sample" as const,
			position,
			rgb: oklabToRGB(renderedFieldColor(
				variant.background.oklab, variant.surface.oklab, midpoint, position)),
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
	variant: Pick<FieldVariant, "background" | "surface" | "gradient" | "fieldMidpoint">,
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

/**
 * The APCA hard minimum a role must clear somewhere along the field to count as observable.
 *
 * Charter rule 2: APCA contrast is deliberately very low here — human review has judged Lc ≈ 9
 * outputs as good — so this is **not** an accessibility floor and its default must stay `0`. But
 * it must be a parameter a library user can raise. It previously existed only as the name
 * `policy.contrast.hardMinimum`, which no code read; the gate was a hard-coded `value !== 0`.
 *
 * At the default `0`, `Math.abs(value) > 0` is exactly `value !== 0` for every finite value, so
 * the default reproduces the previous behaviour bit-for-bit.
 */
export function hasPeakAPCAObservability(values: readonly number[], hardMinimum: number): boolean {
	return values.some((value) => Number.isFinite(value) && Math.abs(value) > hardMinimum)
}

export function pathObservability(values: readonly number[], hardMinimum: number): number {
	if (values.length === 0) return 1
	return values.filter((value) => Number.isFinite(value) && Math.abs(value) > hardMinimum).length / values.length
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

export function fieldDirectionKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.collapse.surface ? "=" : treatment.familyRoles.surface,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

/**
 * Only the ranking blocks, never every score field: `endpointBandSpread` is a spatial
 * extent that may not have been measured at all, so it is not a block one subtracts a
 * penalty from and ranks by.
 */
function effectiveBlock(treatment: CompletePaletteTreatment, block: AlbumArtworkPaletteV2QualityBlock): number {
	return treatment.scores[block] - treatment.scores.generatedPenalty
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
	hardMinimum: number,
	obligationFamilyIds: readonly string[] = [],
): Readonly<{ retained: readonly T[]; rejectedCount: number }> {
	const observable = options.filter(({ signedContrasts }) => hasPeakAPCAObservability(signedContrasts, hardMinimum))
	return {
		retained: retainRoleFamilyDirections(observable, maximum, obligationFamilyIds),
		rejectedCount: options.length - observable.length,
	}
}

export function treatmentFoundation(
	fieldStructure: number,
	artworkIdentity: number,
	foregroundUtility: number,
	activeRolePathObservability: number,
): number {
	return Math.cbrt(fieldStructure * artworkIdentity * foregroundUtility * activeRolePathObservability)
}

/**
 * The foreground/surface zero-contrast guard.
 *
 * The surface is not merely the far end of the field. It is drawn as a panel with the foreground
 * as text on top of it, so foreground-over-surface is a flat pair covering a large area, and a
 * foreground that cannot be read there is unreadable everywhere it sits — there is no thin sliver
 * of the ramp for the eye to recover it from, and no hue separation that excuses it, because the
 * pair is the same two flat colours across the whole panel.
 *
 * Every existing gate misses it, for two independent reasons:
 *
 * 1. `hasPeakAPCAObservability` is a `some` over field samples — a maximum, never a minimum. A
 *    foreground at no contrast against the surface passes on the strength of the background end
 *    alone. `pathObservability` measures the *fraction* of samples that clear the bar, which would
 *    see this, but it is only ever a score and never a gate.
 * 2. The one perceptual field gate, `distinctness.foregroundField`, compares the foreground with
 *    the **background** only, and it asks whether two colours are *the same colour* rather than
 *    whether one can be read on the other.
 *
 * Those two rulers are independent, which is why this class survived the rule that fixed the
 * background side. A foreground can sit at CIE76 ΔE 94 from the surface — nowhere near "the same
 * colour", vividly different in hue — while matching its luminance closely enough that APCA
 * reports no contrast whatsoever. Colour distance cannot see it and peak contrast cannot see it.
 *
 * Turning this on changes published output, so it stays off until human review has seen the
 * movement it causes. `off` reproduces the previous behaviour exactly.
 */
export const FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD = false

/**
 * The bar for "essentially no contrast" — and it is not a tuned number.
 *
 * APCA's reported magnitude is discontinuous at the bottom. It clips small results to exactly
 * zero, and the smallest non-zero magnitude it can return for *any* pair of colours is 7.30;
 * measured exhaustively over sixteen million luminance pairs spanning the entire range, nothing is
 * ever reported between 0 and 7.3. Every bar inside that open band therefore selects exactly the
 * same treatments — the ones APCA itself calls contrastless — and no value inside it can change
 * any outcome. This is the same argument `distinctness.foregroundField` makes from its own empty
 * band, and the reason neither of them is a tuned threshold.
 *
 * **It is not an accessibility floor**, and charter constraint 2 is safe from it by construction:
 * the bar sits below the smallest contrast APCA can express, so the deliberately low outputs this
 * library exists to allow — human review has graded Lc ≈ 9 palettes good — are above it
 * necessarily, not by luck. `contrast.hardMinimum` stays 0 and stays the caller's parameter; this
 * refuses a pathology rather than raising a floor.
 */
export const MINIMUM_FOREGROUND_SURFACE_ABSOLUTE_LC = 1

/**
 * Can the foreground be read on the surface panel at all? See
 * `FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD`, which is what makes this answerable.
 *
 * A collapsed surface needs no special case: it is the background, so this asks the same question
 * the existing background-side observability gate already asks, and agrees with it.
 */
export function foregroundIsUnreadableOnSurface(foreground: RGB, surface: RGB): boolean {
	if (!FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD) return false
	return Math.abs(apcaContrast(foreground, surface)) < MINIMUM_FOREGROUND_SURFACE_ABSOLUTE_LC
}

function validateTreatment(treatment: CompletePaletteTreatment, hardMinimum: number): void {
	const surfaceCollapsed = sameColor(treatment.surface.rgb, treatment.background.rgb)
	const accentCollapsed = sameColor(treatment.accent.rgb, treatment.foreground.rgb)
	if (!surfaceCollapsed && (
		sameColor(treatment.surface.rgb, treatment.foreground.rgb) || sameColor(treatment.surface.rgb, treatment.accent.rgb)
	)) throw new Error("Surface has an illegal role equality")
	if (sameColor(treatment.background.rgb, treatment.accent.rgb)) {
		throw new Error("Background has an illegal role equality")
	}
	// The published form of the `distinctness.foregroundField` rule `createTreatment` filters on.
	// Stated as an invariant rather than left implicit because "the text is a different colour from
	// the field" is the kind of guarantee a caller is entitled to read off the output.
	if (perceptualDifference(treatment.background.rgb, treatment.foreground.rgb) < DISTINCTNESS.foregroundField) {
		throw new Error("Foreground is perceptually the same color as the background")
	}
	// The published form of the rule `createTreatment` filters on, for the surface side of the same
	// question. See `FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD`.
	if (foregroundIsUnreadableOnSurface(treatment.foreground.rgb, treatment.surface.rgb)) {
		throw new Error("Foreground has essentially no contrast against the surface")
	}
	if (!accentCollapsed && sameColor(treatment.accent.rgb, treatment.surface.rgb)) throw new Error("Accent has an illegal role equality")
	if (surfaceCollapsed && treatment.gradient) throw new Error("A collapsed surface cannot form a gradient")
	if (surfaceCollapsed !== treatment.collapse.surface || accentCollapsed !== treatment.collapse.accent) {
		throw new Error("Collapse state disagrees with canonical equality")
	}
	if (!hasPeakAPCAObservability(treatment.contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ signedLc }) => signedLc), hardMinimum)) {
		throw new Error("The required foreground is never outside APCA's zero-contrast dead-zone")
	}
	if (!accentCollapsed && !hasPeakAPCAObservability(treatment.contrast.pairs
		.filter(({ role }) => role === "accent")
		.map(({ signedLc }) => signedLc), hardMinimum)) {
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
	hardMinimum: number,
	fieldFamilyPopulationFraction = 0,
): CompletePaletteTreatment | null {
	const background = variant.background
	const surface = variant.surface
	if (sameColor(surface.rgb, foreground.rgb)) return null
	// The surface side of the distinctness question, asked with the contrast ruler rather than the
	// colour-distance one because the two are independent and this pair defeats the second.
	// See `FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD`.
	if (foregroundIsUnreadableOnSurface(foreground.rgb, surface.rgb)) return null
	// Role distinctness used to be byte equality on both sides of this test, which let a treatment
	// render its text one 8-bit code value away from its own background. `perceptualDifference`
	// subsumes `sameColor` — an identical pair is ΔE 0 — and refuses the near-identical pair too.
	// See `distinctness.foregroundField`; this is not a contrast floor and does not touch
	// `hardMinimum`.
	if (perceptualDifference(background.rgb, foreground.rgb) < DISTINCTNESS.foregroundField) return null
	const accentCollapsed = sameColor(accent.rgb, foreground.rgb)
	if (!accentCollapsed && (
		sameColor(accent.rgb, background.rgb) || sameColor(accent.rgb, surface.rgb)
	)) return null
	const surfaceCollapsed = sameColor(surface.rgb, background.rgb)
	const contrast = measureContrast(variant, foreground, accent)
	if (!hasPeakAPCAObservability(contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ signedLc }) => signedLc), hardMinimum)) return null
	if (!accentCollapsed && !hasPeakAPCAObservability(contrast.pairs
		.filter(({ role }) => role === "accent")
		.map(({ signedLc }) => signedLc), hardMinimum)) return null
	const backgroundFamily = "generated" in background.support ? null : background.support.anchorFamilyId
	const surfaceFamily = "generated" in surface.support ? null : surface.support.anchorFamilyId
	const backgroundCoverage = "generated" in background.support ? 0 : clamp(background.support.totalSupport / 0.2)
	const surfaceCoverage = "generated" in surface.support ? 0 : clamp(surface.support.totalSupport / 0.2)
	const fieldCoverage = surfaceCollapsed
		? backgroundCoverage
		: clamp(Math.max(backgroundCoverage, surfaceCoverage) + 0.25 * Math.min(backgroundCoverage, surfaceCoverage) * variant.surfaceContribution)
	// An edge between the artwork's only two colours has no identity of its own to
	// claim, so the three sites below read zero for it. See `edgeOfTheOnlyTwoColours`.
	const accentIsEdge = !accentCollapsed && accentFamily !== null &&
		edgeOfTheOnlyTwoColours(background, foreground,
			fieldFamilyPopulationFraction + (foregroundFamily?.populationFraction ?? 0))(accent)
	// The three sites where an accent's own evidence is scored, all reading the mark-repaired
	// role score. See `signatureAccentRoleScore`: candidacy is decided upstream and unrepaired.
	const accentRoleScore = (family: ColorFamilyEvidence): number =>
		accentIsEdge ? 0 : signatureAccentRoleScore(family)
	// `accentFidelity` is the only one of the three that is purely about the accent. The other two
	// multiply into whole-palette axes, so the channel reaches them only above `"fidelity"`.
	// See `ACCENT_EVIDENCE_CHANNEL`.
	const accentFidelityRoleScore = (family: ColorFamilyEvidence): number =>
		accentIsEdge ? 0 : ACCENT_EVIDENCE_CHANNEL === "off"
			? signatureAccentRoleScore(family)
			: accentEvidenceRoleScore(family)
	const accentIdentity = accentCollapsed || accentFamily === null ? 0 : accentRoleScore(accentFamily)
	const accentFidelity = accentCollapsed
		? clamp(1 - accentOpportunity)
		: accentFamily === null ? 0 : distinctAccentFidelity(accentFamily, accent, foreground, accentFidelityRoleScore)
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
	const foregroundPathObservability = pathObservability(foregroundSignedContrasts, hardMinimum)
	const accentPathObservability = accentContrast.length === 0
		? foregroundPathObservability
		: pathObservability(contrast.pairs.filter(({ role }) => role === "accent")
			.map(({ signedLc }) => signedLc), hardMinimum)
	const activeRolePathObservability = Math.min(foregroundPathObservability, accentPathObservability)
	const foregroundUtility = Math.sqrt(clamp(
		0.5 * clamp(mean(foregroundContrast) / FOREGROUND_CONTRAST_SCALE) +
		0.5 * clamp(Math.min(...foregroundContrast) / FOREGROUND_CONTRAST_SCALE),
	))
	const accentScale = variant.gradient ? ACCENT_OBSERVABILITY_ADEQUATE_LC : ACCENT_CONTRAST_RANGE
	const accentUtility = accentContrast.length === 0
		? foregroundUtility
		: Math.sqrt(clamp(
			0.5 * clamp(mean(accentContrast) / accentScale) +
			0.5 * clamp(Math.min(...accentContrast) / accentScale),
		))
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
		: accentFamily === null ? 0 : accentRoleScore(accentFamily) * separation(accent, foreground)
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
	const generatedPenalty = representatives.some(({ support }) => "generated" in support)
		? ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyGeneratedPenalty
		: 0
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
			foregroundUtility,
			foregroundPolarityAgreement: polarityAgreement,
			accentFidelity,
			accentUtility,
			coherence,
			economy,
			generatedPenalty,
			endpointBandSpread: variant.gradient ? variant.endpointBandSpread : 0,
		},
		gradientEvidence: variant.gradient ? variant.hypothesis.gradientEvidence : null,
	}
	validateTreatment(output, hardMinimum)
	return output
}

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
	hardMinimum: number,
): CompletePaletteTreatmentDomain {
	const proposedVariants = buildFieldVariants(hypotheses)
	/**
	 * `buildFieldVariants` can legitimately return nothing: every one of its guards refuses a
	 * *gradient* claim, and a hypothesis list that has been narrowed to a single gradient-field
	 * proposal — as endpoint refinement is entitled to do — can have that one proposal refused,
	 * leaving the empty set. The pair is still two real colours and the artwork is still an artwork,
	 * so the answer is the collapsed reading of those same hypotheses, not an exception. This is the
	 * treatment the ordinary path already builds beside every pair it keeps; the gradient-endpoint
	 * guard one line below the OKLab one says as much in its own comment ("the pair's collapsed
	 * variant below is left standing"), and the OKLab guard's `continue` is the reason that
	 * reasoning does not reach here.
	 *
	 * Deliberately a fallback rather than a repair of the OKLab guard: widening that guard to drop
	 * only the gradient claim would add candidates wherever it fires *alongside* other surviving
	 * pairs, which moves outputs and owes a sweep and a review. This branch can only be taken where
	 * the previous code threw, so it changes nothing that ever produced a palette: the grain sweep's
	 * shipped-configuration arm ran the whole 7,587-artwork corpus without once reaching it. See
	 * `research/v2-3-experiments/zero-variant-fallback/FIX.md`.
	 */
	const fieldVariants = proposedVariants.length > 0
		? proposedVariants
		: buildFieldVariants(hypotheses, { representatives: "control", pairing: "same-index", treatments: "collapsed-only" })
	// Still reachable, and still correct to refuse: with no hypothesis carrying a representative
	// there is no colour to collapse to, and inventing one is not this function's business.
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
		const fieldFamilyPopulationFraction = familyById(evidence, variant.hypothesis.backgroundFamilyId).populationFraction
		const rankedForegroundOptions = rankForegroundOptions(variant, supportedRepresentatives)
		const foregroundRetention = retainPeakObservableFamilyDirections(
			rankedForegroundOptions,
			foregroundsPerFieldVariantQuota,
			hardMinimum,
			obligationFamilyIds,
		)
		for (const option of rankedForegroundOptions) {
			if (hasPeakAPCAObservability(option.signedContrasts, hardMinimum)) recordAvailableRole(option.family.id, "foreground")
		}
		foregroundPeakUnobservableRejectedOptionCount += foregroundRetention.rejectedCount
		const foregroundOptions = foregroundRetention.retained

		for (const foregroundOption of foregroundOptions) {
			const rankedAccents = rankAccentOptions(variant, signatureFamilies, foregroundOption,
				(family) => preferredRepresentatives(family.representatives), fieldFamilyPopulationFraction)
			const accentRetention = retainPeakObservableFamilyDirections(
				rankedAccents,
				ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground,
				hardMinimum,
				obligationFamilyIds,
			)
			for (const option of rankedAccents) {
				if (hasPeakAPCAObservability(option.signedContrasts, hardMinimum)) recordAvailableRole(option.family.id, "accent")
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
				hardMinimum,
				fieldFamilyPopulationFraction,
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
					hardMinimum,
					fieldFamilyPopulationFraction,
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
					hardMinimum,
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
				endpointBandSpread: 0,
				fieldMidpoint: null,
			}
			const emergencySourceOptions = retainRoleFamilyDirections(supportedRepresentatives, 8, obligationFamilyIds)
			for (const option of emergencySourceOptions) {
				if (sameColor(option.representative.rgb, background.rgb)) continue
				const signedContrasts = fieldSamples(emergencyVariant).map((sample) =>
					apcaContrast(option.representative.rgb, sample.rgb))
				if (hasPeakAPCAObservability(signedContrasts, hardMinimum)) recordAvailableRole(option.family.id, "foreground")
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
					hardMinimum,
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

type SeedMechanics = Readonly<{
	evidence: NativePaletteEvidence
	hypotheses: readonly FieldHypothesis[]
	fieldVariants: readonly FieldVariant[]
	representatives: "control" | "all"
}>

type SeedAdditions = Readonly<{
	additions: readonly CompletePaletteTreatment[]
}>

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

/**
 * The registry a treatment's lineage is validated against.
 *
 * `proposals` used to be widened with a second set built from *all-ranked-lane* evidence — a full
 * extra `buildBackgroundFieldDomains` + `evaluateGradientFits` pass (~20 % of a run). Measured over
 * 71 artworks (`research/v2-3-experiments/adversarial-arch/registry-usage.ts`): that pass
 * contributed 17,512 registry rows, of which **0** were referenced by any treatment and **0**
 * changed any lineage resolution. First-wins de-duplication guaranteed a control proposal shadowed
 * any identically-identified all-lane one, and no treatment can name a hypothesis id that no
 * control proposal produced, so the extra rows were unreachable by construction.
 */
function buildSourceRegistry(
	evidence: NativePaletteEvidence,
	controlProposals: readonly FieldHypothesis[],
	controlHypotheses: readonly FieldHypothesis[],
	identityObligationFamilyIds: readonly string[],
): SourceRegistry {
	const familiesById = new Map(evidence.families.map((family) => [family.id, family]))
	const controlProposalIds = new Set(controlProposals.map(({ id }) => id))
	const controlHypothesisIds = new Set(controlHypotheses.map(({ id }) => id))
	const identityIds = new Set(identityObligationFamilyIds)
	const rankedByLane = new Map(evidence.lanes.map(({ name }) =>
		[name, rankAllLaneFamilies(evidence.families, name)] as const))
	const controlLaneIds = new Map(evidence.lanes.map(({ name, familyIds }) => [name, new Set(familyIds)] as const))
	const families = evidence.families
		.filter(sourceConnectedFamily)
		.map((family): FamilyRegistryEntry => ({
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
	for (const proposal of controlProposals) {
		if (!proposalById.has(proposal.id)) proposalById.set(proposal.id, proposal)
	}
	const fieldHypotheses = [...proposalById.values()]
		.map((hypothesis): FieldHypothesisRegistryEntry => ({
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
		.map(([key, entry]): FieldDirectionRegistryEntry => ({
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
		families,
		fieldHypotheses,
		fieldDirections,
		roleDirections,
		identityObligationFamilyIds: [...identityIds].sort(compareAscii),
	}
}

function generateSeedAdditions(
	mechanics: SeedMechanics,
	controlTreatments: readonly CompletePaletteTreatment[],
	controlCandidateCount: number,
	registry: SourceRegistry,
	obligationFamilyIds: readonly string[],
	hardMinimum: number,
): SeedAdditions {
	const controlKeys = new Set(controlTreatments.map(completeTreatmentKey))
	const additions = new Map<string, CompletePaletteTreatment>()
	const maximum = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates
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
		if (!treatmentLineage(treatment, registry).sourceConnected) return
		if (controlCandidateCount + additions.size >= maximum) return
		additions.set(key, treatment)
	}
	const canMaterialize = (): boolean => {
		if (controlCandidateCount + additions.size < maximum) return true
		return false
	}

	for (const variant of mechanics.fieldVariants) {
		const surfaceOpportunity = surfaceOpportunityByBackgroundFamily.get(variant.hypothesis.backgroundFamilyId) ?? 0
		const fieldFamilyPopulationFraction = familyById(mechanics.evidence, variant.hypothesis.backgroundFamilyId).populationFraction
		const rankedForegroundOptions = rankForegroundOptions(variant, supportedRepresentatives)
		const observableForegrounds = rankedForegroundOptions.filter(({ signedContrasts }) =>
			hasPeakAPCAObservability(signedContrasts, hardMinimum))
		const foregroundRetention = retainPeakObservableFamilyDirections(
			rankedForegroundOptions,
			foregroundsPerFieldVariantQuota,
			hardMinimum,
			obligationFamilyIds,
		)
		const retainedForegroundFamilyIds = new Set(foregroundRetention.retained.map(({ family }) => family.id))
		const foregroundOptions = mechanics.representatives === "all"
			? observableForegrounds.filter(({ family }) => retainedForegroundFamilyIds.has(family.id))
			: foregroundRetention.retained

		for (const foregroundOption of foregroundOptions) {
			// The representative policy is the one thing the two generators legitimately differ on.
			const rankedAccents = rankAccentOptions(variant, signatureFamilies, foregroundOption, roleRepresentatives, fieldFamilyPopulationFraction)
			const observableAccents = rankedAccents.filter(({ signedContrasts }) =>
				hasPeakAPCAObservability(signedContrasts, hardMinimum))
			const accentRetention = retainPeakObservableFamilyDirections(
				rankedAccents,
				ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground,
				hardMinimum,
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
					hardMinimum,
					fieldFamilyPopulationFraction,
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
					hardMinimum,
					fieldFamilyPopulationFraction,
				))
			}
		}
	}
	return { additions: [...additions.values()] }
}

function treatmentLineage(
	treatment: CompletePaletteTreatment,
	registry: SourceRegistry,
): TreatmentLineage {
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

export function buildPaletteSeedDomain(
	image: RawImage,
	options: PaletteExtractionOptions = DEFAULT_PALETTE_EXTRACTION_OPTIONS,
): PaletteSeedDomain {
	const hardMinimum = options.contrastHardMinimum
	const evidence = buildNativePaletteEvidence(image)
	const fieldDomains = buildBackgroundFieldDomains(evidence)
	const evaluatedGradientFits = evaluateGradientFits(evidence, fieldDomains)
	const controlHypotheses = buildFieldHypothesesFromEvaluatedFits(evidence, evaluatedGradientFits)
	if (controlHypotheses.length === 0) throw new Error("No defensible field hypothesis was found")

	const controlDomain = buildCompletePaletteTreatmentDomain(evidence, controlHypotheses, hardMinimum)
	const controlTreatments = [...new Map(controlDomain.treatments.map((treatment) =>
		[treatmentKey(treatment), treatment])).values()]
	const controlProposals = buildFieldHypothesisProposalsFromEvaluatedFits(
		evidence,
		evaluatedGradientFits,
		"all",
	)
	const identityObligations = controlDomain.identitySelection.obligations
	const obligationFamilyIds = identityObligations.map(({ familyId }) => familyId)
	const sourceRegistry = buildSourceRegistry(
		evidence,
		controlProposals,
		controlHypotheses,
		obligationFamilyIds,
	)
	const candidateMechanics: SeedMechanics = {
		evidence,
		hypotheses: controlProposals,
		fieldVariants: buildFieldVariants(controlProposals),
		representatives: "control",
	}
	const controlHypothesisIds = new Set(controlHypotheses.map(({ id }) => id))
	const sourceConnectedHypothesisIds = new Set(sourceRegistry.fieldHypotheses
		.filter(({ sourceConnected }) => sourceConnected)
		.map(({ hypothesisId }) => hypothesisId))
	const candidateHypotheses = candidateMechanics.hypotheses.filter(({ id }) =>
		controlHypothesisIds.has(id) || sourceConnectedHypothesisIds.has(id))
	const candidateAdditions = generateSeedAdditions(
		candidateMechanics,
		controlTreatments,
		controlDomain.candidateCount,
		sourceRegistry,
		obligationFamilyIds,
		hardMinimum,
	)
	const additions = candidateAdditions.additions.map((treatment): SeedAddition => {
		const key = completeTreatmentKey(treatment)
		const lineage = treatmentLineage(treatment, sourceRegistry)
		if (!lineage.sourceConnected) throw new Error(`Seed addition ${key} lacks complete source lineage`)
		return { treatment, key, lineage }
	})
	const candidateTreatments = [
		...controlTreatments,
		...additions.map(({ treatment }) => treatment),
	]
	const candidateCount = controlDomain.candidateCount + additions.length
	if (candidateCount > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error("Seed candidate domain exceeds the complete-treatment bound")
	}
	return {
		evidence,
		fieldDomains: fieldDomains
			.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedDiagnosticFieldDomains)
			.map(({ evidence: domainEvidence }) => domainEvidence),
		gradientFitDiagnostics: gradientFitDiagnostics(evaluatedGradientFits),
		fieldHypotheses: candidateHypotheses,
		completeTreatments: [...new Map(candidateTreatments.map((treatment) =>
			[treatmentKey(treatment), treatment])).values()],
		additions,
		registry: sourceRegistry,
		identityObligations,
		emergency: controlDomain.emergency,
	}
}

function phase3SourceSupportedTreatment(
	treatment: CompletePaletteTreatment,
	familiesById: ReadonlyMap<string, ColorFamilyEvidence>,
): boolean {
	return (["background", "surface", "foreground", "accent"] as const).every((role) => {
		const color = treatment[role]
		const familyId = treatment.familyRoles[role]
		if (color.generated || familyId === "generated" || "generated" in color.support) return false
		const family = familiesById.get(familyId)
		return family !== undefined && sourceConnectedFamily(family) &&
			color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
	})
}

function phase3SupplementalLineage(treatment: CompletePaletteTreatment): TreatmentLineage {
	const familyIds = [...new Set(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const representatives = (["background", "surface", "foreground", "accent"] as const).map((role) => ({
		role,
		familyId: treatment.familyRoles[role],
		hex: treatment[role].hex,
		strategy: treatment[role].strategy,
		sourceConnected: !treatment[role].generated && !("generated" in treatment[role].support) &&
			treatment[role].support.anchorFamilyId.length > 0 && treatment[role].support.regionIds.length > 0,
	}))
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: fieldDirectionKey(treatment),
		roleDirectionKeys: roleDirectionKeys(treatment),
		familyIds,
		representatives,
		sourceConnected: representatives.every(({ sourceConnected }) => sourceConnected),
	}
}

export function constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	evidence: NativePaletteEvidence,
	hypotheses: readonly FieldHypothesis[],
	options: PaletteExtractionOptions = DEFAULT_PALETTE_EXTRACTION_OPTIONS,
): AlbumArtworkPaletteV2Phase3SupplementalConstruction {
	const hardMinimum = options.contrastHardMinimum
	const uniqueHypotheses = new Map<string, FieldHypothesis>()
	for (const hypothesis of hypotheses) {
		const incumbent = uniqueHypotheses.get(hypothesis.id)
		if (!incumbent || hypothesis.fieldFidelity > incumbent.fieldFidelity) {
			uniqueHypotheses.set(hypothesis.id, hypothesis)
		}
	}
	const orderedHypotheses = [...uniqueHypotheses.values()].sort((first, second) =>
		compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
	if (orderedHypotheses.length === 0) {
		return { hypotheses: [], treatments: [], constructedTreatmentCountByHypothesis: {} }
	}

	const familiesById = new Map(evidence.families.map((family) => [family.id, family]))
	for (const hypothesis of orderedHypotheses) {
		const gradient = hypothesis.gradientEvidence
		const endpointFamilyIds = new Set([hypothesis.backgroundFamilyId, hypothesis.surfaceFamilyId]
			.filter((familyId): familyId is string => familyId !== null))
		const representativeGroups = [hypothesis.backgroundRepresentatives, hypothesis.surfaceRepresentatives]
		const sourceSupportedEndpoints = representativeGroups.every((representatives) =>
			representatives.length > 0 && representatives.every(sourceConnectedRepresentative) &&
			representatives.some((representative) => !("generated" in representative.support) &&
				representative.support.exactSource))
		const supportedGeometry = gradient !== null && (
			(gradient.topology === "linear" &&
				["horizontal", "vertical", "diagonal-down", "diagonal-up"].includes(gradient.direction)) ||
			((gradient.topology === "radial-center" || gradient.topology === "radial-upper-center") &&
				gradient.direction === "center-out") ||
			(gradient.topology === "radial-offset" && [
				"center-0.35-0.50",
				"center-0.65-0.50",
				"center-0.50-0.65",
			].includes(gradient.direction))
		)
		if (hypothesis.kind !== "gradient-field" || gradient === null || !supportedGeometry ||
			gradient.supportingComponentIds.length === 0 ||
			!gradient.supportingFamilyIds.every((familyId) => endpointFamilyIds.has(familyId)) ||
			!sourceSupportedEndpoints || !sourceConnectedHypothesis(hypothesis, familiesById)) {
			throw new Error(`Supplemental field hypothesis ${hypothesis.id} lacks source-local endpoint support`)
		}
	}

	const domain = buildCompletePaletteTreatmentDomain(evidence, orderedHypotheses, hardMinimum)
	const supported = domain.treatments.filter((treatment) =>
		phase3SourceSupportedTreatment(treatment, familiesById))
	const constructedByHypothesis = new Map<string, CompletePaletteTreatment[]>()
	for (const hypothesis of orderedHypotheses) constructedByHypothesis.set(hypothesis.id, [])
	for (const treatment of supported) constructedByHypothesis.get(treatment.sourceFieldHypothesisId)?.push(treatment)

	// Variant canonicalization can merge equivalent hypotheses. Materialize one legal
	// representative independently so every source-derived field enters the pre-cap union.
	for (const hypothesis of orderedHypotheses) {
		const existing = constructedByHypothesis.get(hypothesis.id)!
		if (existing.length > 0) continue
		const isolated = buildCompletePaletteTreatmentDomain(evidence, [hypothesis], hardMinimum).treatments
			.filter((treatment) => phase3SourceSupportedTreatment(treatment, familiesById))
			.sort((first, second) => compareParetoTreatments(first, second) ||
				compareAscii(completeTreatmentKey(first), completeTreatmentKey(second)))
		const representative = isolated[0]
		if (representative) existing.push(representative)
	}

	const constructedHypotheses = orderedHypotheses.filter(({ id }) => constructedByHypothesis.get(id)!.length > 0)
	const hypothesisById = new Map(constructedHypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const treatments = [...constructedByHypothesis.values()].flat().map((treatment) => {
		const fieldHypothesis = hypothesisById.get(treatment.sourceFieldHypothesisId)
		if (!fieldHypothesis) throw new Error(`Unknown supplemental hypothesis ${treatment.sourceFieldHypothesisId}`)
		const lineage = phase3SupplementalLineage(treatment)
		if (!lineage.sourceConnected) throw new Error(`Supplemental treatment ${treatment.id} lacks source lineage`)
		return { treatment, fieldHypothesis, lineage }
	})
	return {
		hypotheses: constructedHypotheses,
		treatments,
		constructedTreatmentCountByHypothesis: Object.fromEntries(constructedHypotheses.map(({ id }) => [
			id,
			constructedByHypothesis.get(id)!.length,
		])),
	}
}
