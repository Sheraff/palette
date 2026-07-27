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
	ALBUM_ARTWORK_PALETTE_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./album-artwork-palette-v2-protocol.ts"
import type { OKLab, RGB, RawImage } from "./types.ts"

export type RepresentativeStrategy = "dense-exact" | "nearest-prototype" | "density-synthesized"
export type FieldTreatmentKind = "one-field" | "separate-flat-fields" | "gradient-field"
export type GradientTopology = "linear" | "radial-center" | "radial-upper-center"
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

export type ExactOverlayGradientChallengerTrace = Readonly<{
	triggerEligible: boolean
	reason: "primary-winner-gradient" | "accent-collapsed" | "no-accepted-gradient-variant" |
		"no-legal-exact-overlay-gradient" | "foundation-gap" | "challenger-selected"
	acceptedGradientVariantCount: number
	existingExactOverlayGradientCount: number
	projectedAttemptCount: number
	projectedLegalCount: number
	selectedChallengerId: string | null
	selectedSource: "existing-complete" | "supplemental-projection" | null
	primaryFoundationEvidenceLevel: number
	challengerFoundationEvidenceLevel: number | null
	replacedPrimaryWinner: boolean
}>

export type ParetoRankingTrace = Readonly<{
	evidenceResolution: number
	dominanceUsesEvidenceLevels: true
	rankingPriorityBlocks: readonly string[]
	rawCandidateCount: number
	uniqueCandidateCount: number
	dominatedCandidateCount: number
	frontierCandidateCount: number
	frontierDirectionCount: number
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
		exactOverlayGradientChallenger: ExactOverlayGradientChallengerTrace
		paretoRanking: ParetoRankingTrace
		legacyScalarTopTreatment: CompletePaletteTreatment
		emergency: EmergencyEligibility
		bounds: typeof ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds
	}>
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

function buildFieldHypothesesFromEvaluatedFits(
	evidence: NativePaletteEvidence,
	evaluatedGradientFits: readonly EvaluatedGradientFit[],
): FieldHypothesis[] {
	const fieldLaneIds = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const fieldFamilies = fieldLaneIds.map((id) => familyById(evidence, id))
	const hypotheses: FieldHypothesis[] = []
	for (const family of fieldFamilies.slice(0, 5)) {
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
	for (let firstIndex = 0; firstIndex < Math.min(8, fieldFamilies.length); firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < Math.min(8, fieldFamilies.length); secondIndex++) {
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
	hypotheses.push(...flatCandidates.slice(0, 4))

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
	let retainedGradients = 0
	for (const candidate of gradientCandidates) {
		if (hypotheses.length >= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldHypotheses || retainedGradients >= 3) break
		if (hypotheses.some(({ id }) => id === candidate.id)) continue
		hypotheses.push(candidate)
		retainedGradients += 1
	}

	return hypotheses
		.sort((first, second) => compareNumbersDescending(first.fieldFidelity, second.fieldFidelity) || compareAscii(first.id, second.id))
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.fieldHypotheses)
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

function buildFieldVariants(hypotheses: readonly FieldHypothesis[]): FieldVariant[] {
	const variants: FieldVariant[] = []
	for (const hypothesis of hypotheses) {
		const backgrounds = preferredRepresentatives(hypothesis.backgroundRepresentatives)
		const surfaces = hypothesis.surfaceFamilyId === null
			? backgrounds
			: preferredRepresentatives(hypothesis.surfaceRepresentatives)
		for (let strategyIndex = 0; strategyIndex < Math.min(backgrounds.length, surfaces.length, 2); strategyIndex++) {
			const background = backgrounds[strategyIndex] ?? backgrounds[0]
			const surface = surfaces[strategyIndex] ?? surfaces[0]
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

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "1" : "0",
	].join(":")
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

const PARETO_BLOCKS = [
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"foregroundUtility",
	"accentFidelity",
	"accentUtility",
	"coherence",
	"economy",
] as const

const RANKING_PRIORITY_BLOCKS = [
	"treatmentFoundation",
	"fieldIdentity",
	"fieldFidelity",
	"fieldStructure",
	"accentFidelity",
	"accentUtility",
	"artworkIdentity",
	"foregroundUtility",
	"representativeness",
	"coherence",
	"economy",
] as const

function effectiveBlock(treatment: CompletePaletteTreatment, block: keyof CompletePaletteScores): number {
	return treatment.scores[block] - treatment.scores.generatedPenalty
}

export function paretoDominates(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	let strictlyBetter = false
	for (const block of PARETO_BLOCKS) {
		const firstValue = evidenceLevel(effectiveBlock(first, block))
		const secondValue = evidenceLevel(effectiveBlock(second, block))
		if (firstValue < secondValue) return false
		if (firstValue > secondValue) strictlyBetter = true
	}
	return strictlyBetter
}

function compareParetoTreatments(first: CompletePaletteTreatment, second: CompletePaletteTreatment): number {
	for (const block of RANKING_PRIORITY_BLOCKS) {
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
): T[] {
	const retained: T[] = []
	const familyIds = new Set<string>()
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
>(options: readonly T[], maximum: number): Readonly<{ retained: readonly T[]; rejectedCount: number }> {
	const observable = options.filter(({ signedContrasts }) => hasPeakAPCAObservability(signedContrasts))
	return {
		retained: retainRoleFamilyDirections(observable, maximum),
		rejectedCount: options.length - observable.length,
	}
}

export function paretoFrontier(treatments: readonly CompletePaletteTreatment[]): CompletePaletteTreatment[] {
	return treatments
		.filter((candidate, candidateIndex) => !treatments.some((other, otherIndex) =>
			otherIndex !== candidateIndex && paretoDominates(other, candidate)))
		.sort(compareParetoTreatments)
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

export function generateCompletePaletteTreatments(
	evidence: NativePaletteEvidence,
	hypotheses: readonly FieldHypothesis[],
): Readonly<{
	winner: CompletePaletteTreatment
	alternatives: readonly CompletePaletteTreatment[]
	candidateCount: number
	emergency: EmergencyEligibility
	candidateAvailability: CandidateAvailabilityTrace
	exactOverlayGradientChallenger: ExactOverlayGradientChallengerTrace
	paretoRanking: ParetoRankingTrace
	legacyScalarTopTreatment: CompletePaletteTreatment
}> {
	const fieldVariants = buildFieldVariants(hypotheses)
	if (fieldVariants.length === 0) throw new Error("No field variants are available")
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
		)
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
			)
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
			for (const option of supportedRepresentatives.slice(0, 8)) {
				if (sameColor(option.representative.rgb, background.rgb)) continue
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
				if (treatment) treatments.push(treatment)
			}
		}
	}

	if (treatments.length === 0) throw new Error("No legal complete palette treatment could be generated")
	if (treatments.length > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates) {
		throw new Error(`Complete candidate count ${treatments.length} exceeds the bound ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates}`)
	}
	const unique = new Map<string, CompletePaletteTreatment>()
	for (const treatment of treatments) if (!unique.has(treatmentKey(treatment))) unique.set(treatmentKey(treatment), treatment)
	const uniqueTreatments = [...unique.values()]
	const legacyScalarTopTreatment = [...uniqueTreatments].sort((first, second) =>
		compareNumbersDescending(first.scores.rankingScore, second.scores.rankingScore) ||
		compareNumbersDescending(first.scores.balance, second.scores.balance) ||
		compareAscii(first.id, second.id))[0]
	const frontier = paretoFrontier(uniqueTreatments)
	if (frontier.length === 0) throw new Error("Pareto frontier is empty")
	const directional = new Map<string, CompletePaletteTreatment>()
	for (const treatment of frontier) {
		const key = completeDirectionKey(treatment)
		if (!directional.has(key)) directional.set(key, treatment)
	}
	const directionalRanked = [...directional.values()].sort(compareParetoTreatments)
	const selected: CompletePaletteTreatment[] = [frontier[0]]
	const selectedKeys = new Set([treatmentKey(frontier[0])])
	const selectedDirections = new Set([completeDirectionKey(frontier[0])])
	const selectedFieldDirections = new Set([fieldDirectionKey(frontier[0])])
	const selectedFieldTreatments = new Set([frontier[0].fieldTreatment])
	const maximumTreatments = ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedTreatments
	const addCandidate = (candidate: CompletePaletteTreatment): boolean => {
		const key = treatmentKey(candidate)
		const direction = completeDirectionKey(candidate)
		if (selected.length >= maximumTreatments || selectedKeys.has(key) || selectedDirections.has(direction)) return false
		if (selected.some((incumbent) => visuallyNear(incumbent, candidate))) return false
		selected.push(candidate)
		selectedKeys.add(key)
		selectedDirections.add(direction)
		selectedFieldDirections.add(fieldDirectionKey(candidate))
		return true
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
	selected.sort(compareParetoTreatments)
	const primaryWinner = frontier[0]
	const gradientVariants = fieldVariants.filter(({ gradient }) => gradient)
	const primaryFoundationEvidenceLevel = evidenceLevel(effectiveBlock(primaryWinner, "treatmentFoundation"))
	const existingExactOverlayGradients = uniqueTreatments.filter((candidate) =>
		isExactOverlayGradientChallenger(primaryWinner, candidate))
	let challenger = selectExactOverlayGradientChallenger(primaryWinner, existingExactOverlayGradients)
	let selectedSource: ExactOverlayGradientChallengerTrace["selectedSource"] = challenger ? "existing-complete" : null
	let projectedAttemptCount = 0
	let projectedLegalCount = 0
	const projected: CompletePaletteTreatment[] = []
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
			if (!projected.some((candidate) => treatmentKey(candidate) === treatmentKey(treatment))) projected.push(treatment)
		}
		challenger = selectExactOverlayGradientChallenger(primaryWinner, projected)
		if (challenger) selectedSource = "supplemental-projection"
	}
	const triggerEligible = !primaryWinner.gradient && !primaryWinner.collapse.accent && gradientVariants.length > 0
	const allExactOverlayGradients = [...existingExactOverlayGradients, ...projected]
	const challengerReason: ExactOverlayGradientChallengerTrace["reason"] = primaryWinner.gradient
		? "primary-winner-gradient"
		: primaryWinner.collapse.accent
			? "accent-collapsed"
			: gradientVariants.length === 0
				? "no-accepted-gradient-variant"
				: challenger
					? "challenger-selected"
					: allExactOverlayGradients.length > 0
						? "foundation-gap"
						: "no-legal-exact-overlay-gradient"
	const finalSelected = challenger
		? [challenger, primaryWinner, ...selected.filter((candidate) =>
			treatmentKey(candidate) !== treatmentKey(challenger!) && treatmentKey(candidate) !== treatmentKey(primaryWinner))]
			.slice(0, maximumTreatments)
		: selected
	const finalWinner = challenger ?? primaryWinner
	const challengerTrace: ExactOverlayGradientChallengerTrace = {
		triggerEligible,
		reason: challengerReason,
		acceptedGradientVariantCount: gradientVariants.length,
		existingExactOverlayGradientCount: existingExactOverlayGradients.length,
		projectedAttemptCount,
		projectedLegalCount,
		selectedChallengerId: challenger?.id ?? null,
		selectedSource,
		primaryFoundationEvidenceLevel,
		challengerFoundationEvidenceLevel: challenger === null
			? null
			: evidenceLevel(effectiveBlock(challenger, "treatmentFoundation")),
		replacedPrimaryWinner: challenger !== null,
	}
	const completeCandidateForegroundFamilyIds = [...new Set(uniqueTreatments.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const completeCandidateAccentFamilyIds = [...new Set(uniqueTreatments.filter(({ collapse }) => !collapse.accent).map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const omittedFrontierDirectionKeys = [...directional.keys()].filter((key) => !selectedDirections.has(key)).sort(compareAscii)
	return {
		winner: finalWinner,
		alternatives: finalSelected,
		candidateCount: treatments.length,
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
		exactOverlayGradientChallenger: challengerTrace,
		paretoRanking: {
			evidenceResolution: RANKING_EVIDENCE_RESOLUTION,
			dominanceUsesEvidenceLevels: true,
			rankingPriorityBlocks: RANKING_PRIORITY_BLOCKS,
			rawCandidateCount: treatments.length,
			uniqueCandidateCount: uniqueTreatments.length,
			dominatedCandidateCount: uniqueTreatments.length - frontier.length,
			frontierCandidateCount: frontier.length,
			frontierDirectionCount: directional.size,
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
