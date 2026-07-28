import {
	fieldDirectionKey,
	generateCompletePaletteTreatments,
	roleDirectionKeys,
} from "./album-artwork-palette-v2.ts"
import type {
	ColorFamilyEvidence,
	CompletePaletteTreatment,
	FieldHypothesis,
	ForegroundPolarityObservation,
	NativePaletteEvidence,
	RecallAuditTreatmentLineage,
	RegionObservation,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Input,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Module,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Output as CommonRoleDomainV2Output,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION =
	"album-artwork-palette-v2-phase-3-role-domain-v2-wave-3" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY = Object.freeze({
	localContrastScale: 0.16,
	fieldLightnessContrastScale: 0.18,
	chromaScale: 0.18,
	compactBoundsFraction: 0.08,
	populationSupportFraction: 0.0015,
	connectedSupportFraction: 0.001,
	minimumCoherentSupport: 0.25,
	minimumTypographyGeometry: 0.48,
	minimumFieldLightnessContrast: 0.20,
	minimumForegroundEvidence: 0.54,
	minimumAccentEvidence: 0.58,
	maximumAmbiguousRoleMargin: 0.10,
	maximumObligationsPerRolePerField: 3,
	maximumAmbiguousFamiliesPerField: 1,
	maximumRoleFamiliesPerField: 4,
	maximumDescriptorsPerField: 16,
	qualityResolution: 0.02,
} as const)

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Role = "foreground" | "accent"

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Disposition =
	"foreground" | "accent" | "both" | "none" | "field-owned" | "unsupported"

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence = Readonly<{
	familyId: string
	fieldHypothesisId: string
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	disposition: AlbumArtworkPaletteV2Phase3RoleDomainV2Disposition
	preference: "foreground" | "accent" | "ambiguous"
	reason: "decisive-foreground" | "decisive-accent" | "simultaneous-role-support" |
		"insufficient-role-evidence" | "field-owned-family"
	confidence: number
	fieldOwned: boolean
	sourceSupported: boolean
	componentIds: readonly string[]
	observedRegionCount: number
	coherentSupport: number
	foreground: Readonly<{
		defensible: boolean
		score: number
		geometry: number
		typographyLikeGeometry: number
		repetition: number
		localContrast: number
		observedLocalContrast: number
		fieldLightnessContrast: number
		polarityAgreement: number
		polarity: Readonly<{
			observation: ForegroundPolarityObservation
			source: ForegroundPolarityObservation
			fieldDirection: number
			fieldConfidence: number
		}>
	}>
	accent: Readonly<{
		defensible: boolean
		score: number
		compactness: number
		repetition: number
		localContrast: number
		observedLocalContrast: number
		chroma: number
		signatureGeometry: number
		signatureObservation: number
	}>
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation = Readonly<{
	id: string
	familyId: string
	fieldHypothesisId: string
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	requiredRole: AlbumArtworkPaletteV2Phase3RoleDomainV2Role
	priority: number
	ambiguousDirection: boolean
	strength: number
	evidence: AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2CoverageEntry = Readonly<{
	obligationId: string
	familyId: string
	fieldHypothesisId: string
	requiredRole: AlbumArtworkPaletteV2Phase3RoleDomainV2Role
	fieldMatches: boolean
	roleMatches: boolean
	foregroundCovered: boolean
	accentCovered: boolean
	covered: boolean
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Coverage = Readonly<{
	entries: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2CoverageEntry[]
	coveredObligationIds: readonly string[]
	uncoveredObligationIds: readonly string[]
	coveredCount: number
	foregroundCoveredCount: number
	accentCoveredCount: number
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2FieldDiagnostics = Readonly<{
	fieldHypothesisId: string
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	evaluatedFamilyCount: number
	candidateRoleObligationCount: number
	foregroundObligationCount: number
	accentObligationCount: number
	infeasibleObligationCount: number
	ambiguousFamilyCount: number
	constructedTreatmentCount: number
	sourceSupportedTreatmentCount: number
	logicalDescriptorCount: number
	completeRoleDescriptorCount: number
	collapsedDescriptorCount: number
	coveredObligationCount: number
	uncoveredObligationIds: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION
	fieldHypothesisCount: number
	evaluatedFamilyFieldCount: number
	roleEvidenceCount: number
	candidateRoleObligationCount: number
	roleObligationCount: number
	foregroundObligationCount: number
	accentObligationCount: number
	infeasibleObligationCount: number
	ambiguousFamilyCount: number
	constructedTreatmentCount: number
	sourceSupportedTreatmentCount: number
	logicalDescriptorCount: number
	completeRoleDescriptorCount: number
	collapsedDescriptorCount: number
	constructedToSupportedDelta: number
	supportedToRetainedDelta: number
	coveredObligationCount: number
	uncoveredObligationIds: readonly string[]
	fields: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2FieldDiagnostics[]
}>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2Output = Readonly<
	Omit<CommonRoleDomainV2Output, "logicalDescriptors" | "diagnostics"> & {
		logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor[]
		roleEvidence: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence[]
		roleObligations: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[]
		obligations: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[]
		diagnostics: AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics
	}
>

export type AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor =
	AlbumArtworkPaletteV2Phase3LogicalDescriptor & Readonly<{
		roleCoverage: AlbumArtworkPaletteV2Phase3RoleDomainV2Coverage
	}>

const QUALITY_AXES = [
	"treatmentFoundation",
	"fieldIdentity",
	"fieldFidelity",
	"fieldStructure",
	"artworkIdentity",
	"foregroundUtility",
	"accentFidelity",
	"accentUtility",
	"representativeness",
	"coherence",
	"economy",
	"rankingScore",
] as const satisfies readonly (keyof CompletePaletteTreatment["scores"])[]

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function clampSigned(value: number): number {
	return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function aggregate(values: readonly number[]): number {
	const weights = [4, 3, 2, 1]
	const ranked = values.map(clamp).sort(compareDescending).slice(0, weights.length)
	const denominator = weights.slice(0, ranked.length).reduce((sum, weight) => sum + weight, 0)
	return denominator === 0
		? 0
		: ranked.reduce((sum, value, index) => sum + value * weights[index], 0) / denominator
}

function roleComponents(family: ColorFamilyEvidence) {
	return family.components.filter(({ population, retainedFor }) =>
		population > 1 && retainedFor.includes("role-observation"))
}

function sourceConnectedFamily(family: ColorFamilyEvidence): boolean {
	return family.population > 1 && family.components.some(({ population }) => population > 1) &&
		family.representatives.some(({ support }) =>
			!("generated" in support) && support.anchorFamilyId === family.id && support.regionIds.length > 0)
}

function typographyGeometry(observation: RegionObservation): number {
	const boundedSize = 1 - clamp(observation.boundsFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.compactBoundsFraction)
	const elongation = 1 - clamp((observation.elongation - 12) / 18)
	return clamp(
		0.38 * observation.foregroundTypography.geometry +
		0.24 * observation.foregroundTypography.fill +
		0.18 * boundedSize +
		0.12 * elongation +
		0.08 * observation.foregroundTypography.borderInterior,
	)
}

function componentCompactness(observation: RegionObservation): number {
	const boundedSize = 1 - clamp(observation.boundsFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.compactBoundsFraction)
	const elongation = 1 - clamp((observation.elongation - 10) / 16)
	return clamp(
		0.35 * boundedSize +
		0.30 * observation.signatureAccent.geometry +
		0.20 * observation.signatureAccent.fill +
		0.10 * elongation +
		0.05 * observation.signatureAccent.borderInterior,
	)
}

function localContrast(observation: RegionObservation): number {
	return Math.max(
		clamp(observation.localContrast /
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.localContrastScale),
		clamp(observation.foregroundTypography.localContrast),
		clamp(observation.signatureAccent.localContrast),
	)
}

function repetition(family: ColorFamilyEvidence, observations: readonly RegionObservation[]): number {
	const observed = aggregate(observations.map((observation) => Math.max(
		observation.repetition,
		observation.foregroundTypography.repetition,
		observation.signatureAccent.repetition,
	)))
	const components = clamp((family.repeatedComponentCount - 1) / 3)
	return clamp(0.65 * observed + 0.35 * components)
}

function coherentSupport(family: ColorFamilyEvidence, observations: readonly RegionObservation[]): number {
	const observed = aggregate(observations.map((observation) => Math.max(
		observation.foregroundTypography.sourceSupport,
		observation.signatureAccent.sourceSupport,
	)))
	const population = clamp(family.populationFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.populationSupportFraction)
	const connected = clamp(family.largestComponentFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.connectedSupportFraction)
	const breadth = clamp(observations.length / 3)
	return clamp(
		0.45 * observed +
		0.30 * Math.sqrt(population * connected) +
		0.15 * family.familyConcentration +
		0.10 * breadth,
	)
}

function fieldPolarity(
	family: ColorFamilyEvidence,
	field: FieldHypothesis,
): Readonly<{ direction: number; confidence: number; contrast: number }> {
	const values = [
		...field.backgroundRepresentatives.map(({ oklab }) => oklab[0]),
		...field.surfaceRepresentatives.map(({ oklab }) => oklab[0]),
	].filter((value, index, all) => Number.isFinite(value) && all.indexOf(value) === index)
	const deltas = values.map((value) => value - family.prototype[0])
	if (deltas.length === 0) return { direction: 0, confidence: 0, contrast: 0 }
	const signed = deltas.reduce((sum, value) => sum + value, 0)
	const magnitude = deltas.reduce((sum, value) => sum + Math.abs(value), 0)
	const direction = magnitude <= Number.EPSILON ? 0 : signed / magnitude
	const contrast = clamp(
		(magnitude / deltas.length) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.fieldLightnessContrastScale,
	)
	return { direction, confidence: contrast * Math.abs(direction), contrast }
}

function polarityAgreement(
	observation: ForegroundPolarityObservation,
	fieldDirection: number,
	fieldConfidence: number,
): number {
	const reliability = clamp(observation.confidence) * clamp(fieldConfidence)
	const agreement = clamp((1 + clampSigned(observation.polarity) * clampSigned(fieldDirection)) / 2)
	return reliability * agreement
}

export function classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(
	family: ColorFamilyEvidence,
	field: FieldHypothesis,
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType = "field-proposal-v2",
): AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence {
	const components = roleComponents(family)
	const observations = components.map(({ observation }) => observation)
	const repeated = repetition(family, observations)
	const support = coherentSupport(family, observations)
	const geometry = aggregate(observations.map(typographyGeometry))
	const compactness = aggregate(observations.map(componentCompactness))
	const contrast = aggregate(observations.map(localContrast))
	const signatureGeometry = aggregate(observations.map(({ signatureAccent }) =>
		Math.max(signatureAccent.geometry, signatureAccent.score)))
	const chroma = clamp(family.chroma /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.chromaScale)
	const polarity = fieldPolarity(family, field)
	const polarityMatch = polarityAgreement(
		family.foregroundPolarityObservation,
		polarity.direction,
		polarity.confidence,
	)
	const foregroundRaw = clamp(
		0.34 * geometry +
		0.20 * repeated +
		0.19 * contrast +
		0.15 * polarity.contrast +
		0.12 * polarityMatch,
	)
	const accentRaw = clamp(
		0.28 * compactness +
		0.22 * repeated +
		0.24 * chroma +
		0.16 * contrast +
		0.10 * signatureGeometry,
	)
	const foregroundScore = foregroundRaw * (0.60 + 0.40 * support)
	const accentScore = accentRaw * (0.55 + 0.45 * support)
	const fieldOwned = family.id === field.backgroundFamilyId || family.id === field.surfaceFamilyId
	const sourceSupported = sourceConnectedFamily(family)
	const enoughSupport = observations.length > 0 &&
		support >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumCoherentSupport
	const foregroundEligible = enoughSupport && sourceSupported &&
		geometry >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumTypographyGeometry &&
		polarity.contrast >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumFieldLightnessContrast &&
		foregroundScore >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumForegroundEvidence
	const accentEligible = enoughSupport && sourceSupported &&
		polarity.contrast >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumFieldLightnessContrast &&
		accentScore >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.minimumAccentEvidence
	const simultaneous = foregroundEligible && accentEligible &&
		Math.abs(foregroundScore - accentScore) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.maximumAmbiguousRoleMargin
	const foregroundDefensible = foregroundEligible &&
		(!accentEligible || simultaneous || foregroundScore > accentScore)
	const accentDefensible = accentEligible &&
		(!foregroundEligible || simultaneous || accentScore > foregroundScore)
	const disposition: AlbumArtworkPaletteV2Phase3RoleDomainV2Disposition = fieldOwned
		? "field-owned"
		: !sourceSupported
			? "unsupported"
			: foregroundDefensible && accentDefensible
				? "both"
				: foregroundDefensible
					? "foreground"
					: accentDefensible ? "accent" : "none"
	const preference = disposition === "foreground" || disposition === "accent"
		? disposition
		: "ambiguous"
	const reason = disposition === "foreground"
		? "decisive-foreground"
		: disposition === "accent"
			? "decisive-accent"
			: disposition === "both"
				? "simultaneous-role-support"
				: disposition === "field-owned" ? "field-owned-family" : "insufficient-role-evidence"
	const confidence = disposition === "both"
		? Math.min(foregroundScore, accentScore)
		: disposition === "foreground"
			? foregroundScore
			: disposition === "accent"
				? accentScore
				: clamp(1 - Math.max(foregroundScore, accentScore))
	return {
		familyId: family.id,
		fieldHypothesisId: field.id,
		sourceType,
		disposition,
		preference,
		reason,
		confidence,
		fieldOwned,
		sourceSupported,
		componentIds: components.map(({ id }) => id).sort(compareAscii),
		observedRegionCount: observations.length,
		coherentSupport: support,
		foreground: {
			defensible: !fieldOwned && foregroundDefensible,
			score: foregroundScore,
			geometry,
			typographyLikeGeometry: geometry,
			repetition: repeated,
			localContrast: contrast,
			observedLocalContrast: contrast,
			fieldLightnessContrast: polarity.contrast,
			polarityAgreement: polarityMatch,
			polarity: {
				observation: family.foregroundPolarityObservation,
				source: family.foregroundPolarityObservation,
				fieldDirection: polarity.direction,
				fieldConfidence: polarity.confidence,
			},
		},
		accent: {
			defensible: !fieldOwned && accentDefensible,
			score: accentScore,
			compactness,
			repetition: repeated,
			localContrast: contrast,
			observedLocalContrast: contrast,
			chroma,
			signatureGeometry,
			signatureObservation: signatureGeometry,
		},
	}
}

function roleStrength(
	evidence: AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence,
	role: AlbumArtworkPaletteV2Phase3RoleDomainV2Role,
): number {
	return evidence[role].score
}

function evidenceOrder(
	role: AlbumArtworkPaletteV2Phase3RoleDomainV2Role,
	first: AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence,
	second: AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence,
): number {
	return compareDescending(roleStrength(first, role), roleStrength(second, role)) ||
		compareDescending(first.coherentSupport, second.coherentSupport) ||
		compareDescending(first[role].repetition, second[role].repetition) ||
		compareAscii(first.familyId, second.familyId)
}

export function buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations(
	evidence: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence[],
	maximumPerRolePerField: number =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.maximumObligationsPerRolePerField,
): AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[] {
	if (!Number.isSafeInteger(maximumPerRolePerField) || maximumPerRolePerField < 0) {
		throw new RangeError("Role obligation maximum must be a nonnegative integer")
	}
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence>()
	for (const candidate of evidence) {
		const identity = `${candidate.sourceType}\0${candidate.fieldHypothesisId}\0${candidate.familyId}`
		const incumbent = unique.get(identity)
		if (!incumbent || Math.max(candidate.foreground.score, candidate.accent.score) >
			Math.max(incumbent.foreground.score, incumbent.accent.score)) unique.set(identity, candidate)
	}
	const fields = new Map<string, AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence[]>()
	for (const candidate of unique.values()) {
		const identity = `${candidate.sourceType}\0${candidate.fieldHypothesisId}`
		const values = fields.get(identity) ?? []
		values.push(candidate)
		fields.set(identity, values)
	}
	const obligations: AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[] = []
	for (const [identity, values] of [...fields].sort(([first], [second]) => compareAscii(first, second))) {
		const ambiguous = values.filter((candidate) =>
			candidate.foreground.defensible && candidate.accent.defensible)
			.sort((first, second) =>
				compareDescending(
					Math.min(first.foreground.score, first.accent.score),
					Math.min(second.foreground.score, second.accent.score),
				) || compareAscii(first.familyId, second.familyId))
			.slice(0, Math.min(
				maximumPerRolePerField,
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.maximumAmbiguousFamiliesPerField,
			))
		const ambiguousIds = new Set(ambiguous.map(({ familyId }) => familyId))
		for (const role of ["foreground", "accent"] as const) {
			const exclusive = values.filter((candidate) =>
				candidate[role].defensible && !ambiguousIds.has(candidate.familyId) &&
				!(candidate.foreground.defensible && candidate.accent.defensible))
				.sort((first, second) => evidenceOrder(role, first, second))
			const ranked = [
				...ambiguous,
				...exclusive.slice(0, Math.max(0, maximumPerRolePerField - ambiguous.length)),
			].sort((first, second) => evidenceOrder(role, first, second))
			for (let priority = 0; priority < ranked.length; priority++) {
				const candidate = ranked[priority]
				obligations.push({
					id: `role-domain-v2:${identity.replace("\0", ":")}:${candidate.familyId}:${role}`,
					familyId: candidate.familyId,
					fieldHypothesisId: candidate.fieldHypothesisId,
					sourceType: candidate.sourceType,
					requiredRole: role,
					priority,
					ambiguousDirection: candidate.foreground.defensible && candidate.accent.defensible,
					strength: roleStrength(candidate, role),
					evidence: candidate,
				})
			}
		}
	}
	return obligations
}

export function albumArtworkPaletteV2Phase3RoleDomainV2Coverage(
	treatment: CompletePaletteTreatment,
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[],
): AlbumArtworkPaletteV2Phase3RoleDomainV2Coverage {
	let foregroundCoveredCount = 0
	let accentCoveredCount = 0
	const entries = [...obligations]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((obligation): AlbumArtworkPaletteV2Phase3RoleDomainV2CoverageEntry => {
			const fieldMatches = treatment.sourceFieldHypothesisId === obligation.fieldHypothesisId
			const foregroundCovered = fieldMatches && treatment.familyRoles.foreground === obligation.familyId
			const accentCovered = fieldMatches && !treatment.collapse.accent &&
				treatment.familyRoles.accent === obligation.familyId
			const roleMatches = obligation.requiredRole === "foreground" ? foregroundCovered : accentCovered
			const covered = fieldMatches && roleMatches
			if (covered && obligation.requiredRole === "foreground") foregroundCoveredCount++
			if (covered && obligation.requiredRole === "accent") accentCoveredCount++
			return {
				obligationId: obligation.id,
				familyId: obligation.familyId,
				fieldHypothesisId: obligation.fieldHypothesisId,
				requiredRole: obligation.requiredRole,
				fieldMatches,
				roleMatches,
				foregroundCovered,
				accentCovered,
				covered,
			}
		})
	const covered = entries.filter((entry) => entry.covered)
	return {
		entries,
		coveredObligationIds: covered.map(({ obligationId }) => obligationId),
		uncoveredObligationIds: entries.filter((entry) => !entry.covered)
			.map(({ obligationId }) => obligationId),
		coveredCount: covered.length,
		foregroundCoveredCount,
		accentCoveredCount,
	}
}

function fieldLocalEvidence(
	evidence: NativePaletteEvidence,
	roleEvidence: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Evidence[],
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[],
): NativePaletteEvidence {
	const families = new Set(evidence.families.map(({ id }) => id))
	const laneFor = (name: "foreground" | "signature", role: AlbumArtworkPaletteV2Phase3RoleDomainV2Role) => {
		const existing = evidence.lanes.find((lane) => lane.name === name)
		const required = obligations.filter((obligation) => obligation.requiredRole === role)
			.sort((first, second) => first.priority - second.priority || compareAscii(first.familyId, second.familyId))
			.map(({ familyId }) => familyId)
		const defensible = roleEvidence.filter((candidate) => candidate[role].defensible)
			.sort((first, second) => evidenceOrder(role, first, second))
			.map(({ familyId }) => familyId)
		const familyIds = [...new Set([
			...required,
			...defensible,
			...[...(existing?.familyIds ?? [])].sort(compareAscii),
		])].filter((id) => families.has(id))
			.slice(0, Math.max(
				required.length,
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.maximumRoleFamiliesPerField,
			))
		return {
			name,
			maximumFamilies: Math.max(existing?.maximumFamilies ?? 0, familyIds.length),
			familyIds,
		} as const
	}
	const field = evidence.lanes.find((lane) => lane.name === "field") ?? {
		name: "field" as const,
		maximumFamilies: 0,
		familyIds: [],
	}
	return {
		...evidence,
		lanes: [field, laneFor("signature", "accent"), laneFor("foreground", "foreground")],
	}
}

function sourceConnectedTreatment(
	treatment: CompletePaletteTreatment,
	families: ReadonlyMap<string, ColorFamilyEvidence>,
): boolean {
	return (["background", "surface", "foreground", "accent"] as const).every((role) => {
		const familyId = treatment.familyRoles[role]
		const color = treatment[role]
		if (familyId === "generated" || color.generated || "generated" in color.support) return false
		return families.has(familyId) && color.support.anchorFamilyId === familyId &&
			color.support.regionIds.length > 0
	})
}

function treatmentIdentity(treatment: CompletePaletteTreatment): string {
	return [
		treatment.sourceFieldHypothesisId,
		treatment.fieldTreatment,
		...(["background", "surface", "foreground", "accent"] as const)
			.map((role) => treatment[role].rgb.join(",")),
		treatment.gradient ? "gradient" : "flat",
	].join("\0")
}

function treatmentOrder(first: CompletePaletteTreatment, second: CompletePaletteTreatment): number {
	const level = (value: number): number => Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.qualityResolution)
	for (const axis of QUALITY_AXES) {
		const comparison = compareDescending(
			level(first.scores[axis] - first.scores.generatedPenalty),
			level(second.scores[axis] - second.scores.generatedPenalty),
		)
		if (comparison !== 0) return comparison
	}
	return compareAscii(treatmentIdentity(first), treatmentIdentity(second)) ||
		compareAscii(first.id, second.id)
}

function treatmentLineage(treatment: CompletePaletteTreatment): RecallAuditTreatmentLineage {
	const representatives = (["background", "surface", "foreground", "accent"] as const).map((role) => {
		const color = treatment[role]
		return {
			role,
			familyId: treatment.familyRoles[role],
			hex: color.hex,
			strategy: color.strategy,
			sourceConnected: !color.generated && !("generated" in color.support) &&
				color.support.anchorFamilyId === treatment.familyRoles[role] && color.support.regionIds.length > 0,
		}
	})
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

function bestTreatment(
	treatments: readonly CompletePaletteTreatment[],
	predicate: (treatment: CompletePaletteTreatment) => boolean,
): CompletePaletteTreatment | null {
	return treatments.filter(predicate).sort(treatmentOrder)[0] ?? null
}

function retainFieldTreatments(
	treatments: readonly CompletePaletteTreatment[],
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[],
): CompletePaletteTreatment[] {
	const retained = new Map<string, CompletePaletteTreatment>()
	const add = (treatment: CompletePaletteTreatment | null): void => {
		if (treatment) retained.set(treatmentIdentity(treatment), treatment)
	}
	const foreground = obligations.filter(({ requiredRole }) => requiredRole === "foreground")
	const accent = obligations.filter(({ requiredRole }) => requiredRole === "accent")
	for (const foregroundObligation of foreground) {
		for (const accentObligation of accent) {
			add(bestTreatment(treatments, (treatment) =>
				!treatment.collapse.accent &&
				treatment.familyRoles.foreground === foregroundObligation.familyId &&
				treatment.familyRoles.accent === accentObligation.familyId))
		}
	}
	for (const obligation of obligations) {
		if ([...retained.values()].some((treatment) =>
			albumArtworkPaletteV2Phase3RoleDomainV2Coverage(treatment, [obligation]).coveredCount === 1)) continue
		const covers = (treatment: CompletePaletteTreatment): boolean =>
			albumArtworkPaletteV2Phase3RoleDomainV2Coverage(treatment, [obligation]).coveredCount === 1
		if (obligation.requiredRole === "foreground" && accent.length === 0) {
			add(bestTreatment(treatments, (treatment) => covers(treatment) && treatment.collapse.accent))
		}
		if (![...retained.values()].some(covers)) {
			add(bestTreatment(treatments, (treatment) => covers(treatment) && !treatment.collapse.accent))
		}
		if (![...retained.values()].some(covers)) add(bestTreatment(treatments, covers))
	}
	if (retained.size === 0) {
		add(bestTreatment(treatments, ({ collapse }) => collapse.accent))
		if (retained.size === 0) add(bestTreatment(treatments, () => true))
	}
	const result = [...retained.values()].sort(treatmentOrder)
	if (result.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_POLICY.maximumDescriptorsPerField) {
		throw new Error("Role-domain descriptor retention exceeded its field-local bound")
	}
	return result
}

function uniqueSourcedFields(
	fields: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[],
): AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] {
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis>()
	for (const field of fields) {
		const identity = `${field.sourceType}\0${field.hypothesis.id}`
		const incumbent = unique.get(identity)
		if (!incumbent || field.hypothesis.fieldFidelity > incumbent.hypothesis.fieldFidelity) {
			unique.set(identity, field)
		}
	}
	return [...unique.values()].sort((first, second) =>
		compareAscii(first.sourceType, second.sourceType) ||
		compareAscii(first.hypothesis.id, second.hypothesis.id))
}

export function constructAlbumArtworkPaletteV2Phase3RoleDomainV2(
	input: AlbumArtworkPaletteV2Phase3RoleDomainV2Input,
): AlbumArtworkPaletteV2Phase3RoleDomainV2Output {
	const fields = uniqueSourcedFields(input.fieldHypotheses)
	const families = [...input.evidence.families].sort((first, second) => compareAscii(first.id, second.id))
	const roleEvidence = fields.flatMap(({ sourceType, hypothesis }) => families.map((family) =>
		classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(family, hypothesis, sourceType)))
	const candidateRoleObligations = buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations(roleEvidence)
	const roleObligations: AlbumArtworkPaletteV2Phase3RoleDomainV2Obligation[] = []
	const familiesById = new Map(families.map((family) => [family.id, family]))
	const logicalDescriptors: AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor[] = []
	const fieldDiagnostics: AlbumArtworkPaletteV2Phase3RoleDomainV2FieldDiagnostics[] = []
	let constructedTreatmentCount = 0
	let sourceSupportedTreatmentCount = 0
	for (const field of fields) {
		const matchingEvidence = roleEvidence.filter((candidate) =>
			candidate.sourceType === field.sourceType && candidate.fieldHypothesisId === field.hypothesis.id)
		const candidateObligations = candidateRoleObligations.filter((obligation) =>
			obligation.sourceType === field.sourceType && obligation.fieldHypothesisId === field.hypothesis.id)
		const localEvidence = fieldLocalEvidence(input.evidence, matchingEvidence, candidateObligations)
		const hasForegrounds = localEvidence.lanes.some(({ name, familyIds }) =>
			name === "foreground" && familyIds.length > 0)
		let constructed: readonly CompletePaletteTreatment[] = []
		if (hasForegrounds && field.hypothesis.backgroundRepresentatives.length > 0) {
			constructed = generateCompletePaletteTreatments(localEvidence, [field.hypothesis]).completeTreatments
		}
		const supported = constructed.filter((treatment) => sourceConnectedTreatment(treatment, familiesById))
		const matchingObligations = candidateObligations.filter((obligation) => supported.some((treatment) =>
			albumArtworkPaletteV2Phase3RoleDomainV2Coverage(treatment, [obligation]).coveredCount === 1))
		roleObligations.push(...matchingObligations)
		const retained = retainFieldTreatments(supported, matchingObligations)
		const descriptors = retained.map((treatment): AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor => {
			const lineage = treatmentLineage(treatment)
			if (!lineage.sourceConnected) throw new Error("Role-domain descriptor lacks complete source lineage")
			return {
				sourceType: field.sourceType,
				treatment,
				fieldHypothesis: field.hypothesis,
				lineage,
				roleCoverage: albumArtworkPaletteV2Phase3RoleDomainV2Coverage(treatment, matchingObligations),
			}
		})
		logicalDescriptors.push(...descriptors)
		constructedTreatmentCount += constructed.length
		sourceSupportedTreatmentCount += supported.length
		const coveredIds = new Set(descriptors.flatMap(({ treatment }) =>
			albumArtworkPaletteV2Phase3RoleDomainV2Coverage(treatment, matchingObligations)
				.coveredObligationIds))
		const uncovered = matchingObligations.filter(({ id }) => !coveredIds.has(id)).map(({ id }) => id)
		const ambiguousFamilies = new Set(matchingObligations
			.filter(({ ambiguousDirection }) => ambiguousDirection).map(({ familyId }) => familyId))
		fieldDiagnostics.push({
			fieldHypothesisId: field.hypothesis.id,
			sourceType: field.sourceType,
			evaluatedFamilyCount: matchingEvidence.length,
			candidateRoleObligationCount: candidateObligations.length,
			foregroundObligationCount: matchingObligations
				.filter(({ requiredRole }) => requiredRole === "foreground").length,
			accentObligationCount: matchingObligations
				.filter(({ requiredRole }) => requiredRole === "accent").length,
			infeasibleObligationCount: candidateObligations.length - matchingObligations.length,
			ambiguousFamilyCount: ambiguousFamilies.size,
			constructedTreatmentCount: constructed.length,
			sourceSupportedTreatmentCount: supported.length,
			logicalDescriptorCount: descriptors.length,
			completeRoleDescriptorCount: descriptors.filter(({ treatment }) => !treatment.collapse.accent).length,
			collapsedDescriptorCount: descriptors.filter(({ treatment }) => treatment.collapse.accent).length,
			coveredObligationCount: matchingObligations.length - uncovered.length,
			uncoveredObligationIds: uncovered.sort(compareAscii),
		})
	}
	logicalDescriptors.sort((first, second) =>
		compareAscii(first.sourceType, second.sourceType) ||
		compareAscii(first.fieldHypothesis.id, second.fieldHypothesis.id) ||
		treatmentOrder(first.treatment, second.treatment))
	const uncoveredIds = new Set(fieldDiagnostics.flatMap(({ uncoveredObligationIds }) => uncoveredObligationIds))
	const uncoveredObligationIds = [...uncoveredIds].sort(compareAscii)
	const ambiguousFamilies = new Set(roleObligations
		.filter(({ ambiguousDirection }) => ambiguousDirection)
		.map(({ sourceType, fieldHypothesisId, familyId }) => `${sourceType}\0${fieldHypothesisId}\0${familyId}`))
	const diagnostics: AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
		fieldHypothesisCount: fields.length,
		evaluatedFamilyFieldCount: roleEvidence.length,
		roleEvidenceCount: roleEvidence.filter(({ disposition }) =>
			disposition === "foreground" || disposition === "accent" || disposition === "both").length,
		candidateRoleObligationCount: candidateRoleObligations.length,
		roleObligationCount: roleObligations.length,
		foregroundObligationCount: roleObligations.filter(({ requiredRole }) => requiredRole === "foreground").length,
		accentObligationCount: roleObligations.filter(({ requiredRole }) => requiredRole === "accent").length,
		infeasibleObligationCount: candidateRoleObligations.length - roleObligations.length,
		ambiguousFamilyCount: ambiguousFamilies.size,
		constructedTreatmentCount,
		sourceSupportedTreatmentCount,
		logicalDescriptorCount: logicalDescriptors.length,
		completeRoleDescriptorCount: logicalDescriptors.filter(({ treatment }) => !treatment.collapse.accent).length,
		collapsedDescriptorCount: logicalDescriptors.filter(({ treatment }) => treatment.collapse.accent).length,
		constructedToSupportedDelta: sourceSupportedTreatmentCount - constructedTreatmentCount,
		supportedToRetainedDelta: logicalDescriptors.length - sourceSupportedTreatmentCount,
		coveredObligationCount: roleObligations.length - uncoveredObligationIds.length,
		uncoveredObligationIds,
		fields: fieldDiagnostics,
	}
	return {
		logicalDescriptors,
		roleEvidence,
		roleObligations,
		obligations: roleObligations,
		diagnostics,
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_MODULE = Object.freeze({
	construct: constructAlbumArtworkPaletteV2Phase3RoleDomainV2,
}) satisfies AlbumArtworkPaletteV2Phase3RoleDomainV2Module
