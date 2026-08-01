import type { ColorFamilyEvidence, CompletePaletteTreatment, FieldHypothesis, ForegroundPolarityObservation, RegionObservation } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "./policy.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY = Object.freeze({
	localContrastScale: 0.16,
	fieldLightnessContrastScale: 0.18,
	chromaScale: 0.18,
	compactBoundsFraction: 0.08,
	populationSupportFraction: 0.0015,
	connectedSupportFraction: 0.001,
	minimumCoherentSupport: 0.25,
	minimumRoleEvidence: 0.43,
	simultaneousRoleEvidence: 0.62,
	simultaneousRoleMargin: 0.18,
	decisiveRoleMargin: 0.11,
	maximumObligationsPerField: 4,
	orderingEvidenceResolution: ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence,
} as const)

export type FamilyRolePreference = "foreground" | "accent" | "ambiguous"

export type RoleAmbiguityReason =
	"decisive-foreground" |
	"decisive-accent" |
	"simultaneous-role-support" |
	"close-role-evidence" |
	"insufficient-role-evidence" |
	"field-owned-family"

export type FieldConditionalRoleEvidence = Readonly<{
	familyId: string
	fieldHypothesisId: string
	preference: FamilyRolePreference
	reason: RoleAmbiguityReason
	confidence: number
	fieldOwned: boolean
	observedRegionCount: number
	coherentSupport: number
	foreground: Readonly<{
		score: number
		typographyLikeGeometry: number
		repetition: number
		observedLocalContrast: number
		fieldLightnessContrast: number
		polarityAgreement: number
		polarity: Readonly<{
			source: ForegroundPolarityObservation
			fieldDirection: number
			fieldConfidence: number
		}>
	}>
	accent: Readonly<{
		score: number
		compactness: number
		repetition: number
		chroma: number
		observedLocalContrast: number
		signatureObservation: number
	}>
}>

export type RoleSpecificIdentityObligation = Readonly<{
	id: string
	familyId: string
	fieldHypothesisId: string
	requiredRole: FamilyRolePreference
	priority: number
	evidence: FieldConditionalRoleEvidence
}>

export type RoleSpecificObligationCoverageEntry = Readonly<{
	obligationId: string
	familyId: string
	requiredRole: FamilyRolePreference
	fieldMatches: boolean
	foregroundCovered: boolean
	accentCovered: boolean
	covered: boolean
}>

export type RoleSpecificObligationCoverage = Readonly<{
	entries: readonly RoleSpecificObligationCoverageEntry[]
	coveredObligationIds: readonly string[]
	uncoveredObligationIds: readonly string[]
	coveredCount: number
	foregroundCoveredCount: number
	accentCoveredCount: number
	ambiguousCoveredCount: number
	priorityWeight: number
	roleEvidence: number
}>

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

function roleObservations(family: ColorFamilyEvidence): RegionObservation[] {
	return family.components
		.filter(({ retainedFor }) => retainedFor.includes("role-observation"))
		.map(({ observation }) => observation)
}

function compactness(observation: RegionObservation): number {
	const size = 1 - clamp(observation.boundsFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.compactBoundsFraction)
	const reasonableElongation = 1 - clamp((observation.elongation - 12) / 18)
	return clamp(
		0.45 * size +
		0.30 * observation.signatureAccent.geometry +
		0.15 * observation.signatureAccent.fill +
		0.10 * reasonableElongation,
	)
}

function typographyLikeGeometry(observation: RegionObservation): number {
	const size = 1 - clamp(observation.boundsFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.compactBoundsFraction)
	const reasonableElongation = 1 - clamp((observation.elongation - 12) / 18)
	return clamp(
		0.35 * observation.foregroundTypography.geometry +
		0.25 * observation.foregroundTypography.fill +
		0.25 * size +
		0.15 * reasonableElongation,
	)
}

function observedLocalContrast(observation: RegionObservation): number {
	return Math.max(
		clamp(observation.localContrast /
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.localContrastScale),
		observation.foregroundTypography.localContrast,
		observation.signatureAccent.localContrast,
	)
}

function familyRepetition(family: ColorFamilyEvidence, observations: readonly RegionObservation[]): number {
	const observed = aggregate(observations.map((observation) => Math.max(
		observation.repetition,
		observation.foregroundTypography.repetition,
		observation.signatureAccent.repetition,
	)))
	const repeatedComponents = clamp((family.repeatedComponentCount - 1) / 3)
	return clamp(0.65 * observed + 0.35 * repeatedComponents)
}

/**
 * How much of "this family is present enough, and solidly enough, to carry a role" comes from
 * each kind of evidence: the source support its own regions reported, its population crossed with
 * how much of it hangs together as one connected mass, how concentrated it is, and how many
 * regions it was observed in at all. The four sum to 1.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the 0.30
 * population-x-connectivity term is live on all 154 artworks and +-20 % moves 32 of them (21 %).
 * Perturbing one term breaks the sum; nothing renormalises.
 */
export const COHERENT_SUPPORT_WEIGHTS = Object.freeze({
	regionSupport: 0.45,
	populationConnectivity: 0.30,
	familyConcentration: 0.15,
	observationBreadth: 0.10,
} as const)

function coherentSupport(family: ColorFamilyEvidence, observations: readonly RegionObservation[]): number {
	const regionSupport = aggregate(observations.map((observation) => Math.max(
		observation.foregroundTypography.sourceSupport,
		observation.signatureAccent.sourceSupport,
	)))
	const population = clamp(family.populationFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.populationSupportFraction)
	const connected = clamp(family.largestComponentFraction /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.connectedSupportFraction)
	const observationBreadth = clamp(observations.length / 3)
	return clamp(
		COHERENT_SUPPORT_WEIGHTS.regionSupport * regionSupport +
		COHERENT_SUPPORT_WEIGHTS.populationConnectivity * Math.sqrt(population * connected) +
		COHERENT_SUPPORT_WEIGHTS.familyConcentration * family.familyConcentration +
		COHERENT_SUPPORT_WEIGHTS.observationBreadth * observationBreadth,
	)
}

export type FamilyAccentRoleEvidence = Readonly<{
	score: number
	raw: number
	support: number
	compactness: number
	repetition: number
	chroma: number
	observedLocalContrast: number
	signatureObservation: number
}>

/**
 * The **accent half** of `classifyFieldConditionalFamilyRole`, lifted verbatim so there is exactly
 * one statement of what the accent role's evidence is.
 *
 * It is **field-independent by construction**, and that is not an accident of this refactor: none
 * of `compactness`, `familyRepetition`, `chroma`, `observedLocalContrast` or `signatureAccent.score`
 * reads the field hypothesis, and neither does `coherentSupport`. Only the *foreground* half does
 * (it needs `fieldPolarity`). So the accent claim of a family is a property of the family and the
 * artwork, and can be asked outside a field hypothesis without changing its meaning.
 *
 * Read this against `signatureScore` (`palette-core.ts::measureFamilyRoleEvidence`), which is what
 * the accent path scores with today. The two disagree about the accent role in four places, and
 * every disagreement is the classifier saying that an accent is allowed to be small:
 *
 * | property | `signatureScore` | this |
 * |---|---|---|
 * | population | `coherentSupport = largestComponentFraction / 0.002`, weight **0.25 additive** | no additive term; `support` is a **gate** `0.50 + 0.50 * support`, and that support is 45 % region source-support, 30 % population x connectivity, 15 % concentration, 10 % breadth |
 * | region size | — | `compactness` rewards **small** bounds (`1 - boundsFraction / 0.08`) |
 * | recurrence | `repeatedSupport = (repeatedComponentCount - 1) / 3`, weight **0.16** | `familyRepetition` = 0.65 observed-region repetition + 0.35 that same count, weight 0.24 -> the raw count carries **0.084** |
 * | chroma | weight **0.11** | weight **0.25** |
 *
 * Nothing here is chosen: the weights are the ones `accentRaw` has carried since Phase 3.
 */
/**
 * How much of a family's accent claim comes from each cue: how compact its regions are, how often
 * the same shape recurs, how chromatic it is, how hard it contrasts against what surrounds it, and
 * what the region observations made of it as a signature graphic. The five sum to 1.
 *
 * PERVASIVE CLIFF (tier-B sweep 2026-08-01, cliff dossier, agent aa68beee): the 0.14
 * `localContrast` term is live on all 154 artworks and +-20 % moves 36 of them (23 %). Perturbing
 * one term breaks the sum; nothing renormalises.
 */
export const ACCENT_ROLE_EVIDENCE_WEIGHTS = Object.freeze({
	compactness: 0.29,
	repetition: 0.24,
	chroma: 0.25,
	localContrast: 0.14,
	signatureObservation: 0.08,
} as const)

export function familyAccentRoleEvidence(family: ColorFamilyEvidence): FamilyAccentRoleEvidence {
	const observations = roleObservations(family)
	const repetition = familyRepetition(family, observations)
	const support = coherentSupport(family, observations)
	const compact = aggregate(observations.map(compactness))
	const localContrast = aggregate(observations.map(observedLocalContrast))
	const signatureObservation = aggregate(observations.map(({ signatureAccent }) => signatureAccent.score))
	const chroma = clamp(family.chroma / ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.chromaScale)
	const raw = clamp(
		ACCENT_ROLE_EVIDENCE_WEIGHTS.compactness * compact +
		ACCENT_ROLE_EVIDENCE_WEIGHTS.repetition * repetition +
		ACCENT_ROLE_EVIDENCE_WEIGHTS.chroma * chroma +
		ACCENT_ROLE_EVIDENCE_WEIGHTS.localContrast * localContrast +
		ACCENT_ROLE_EVIDENCE_WEIGHTS.signatureObservation * signatureObservation,
	)
	return {
		score: raw * (0.50 + 0.50 * support),
		raw,
		support,
		compactness: compact,
		repetition,
		chroma,
		observedLocalContrast: localContrast,
		signatureObservation,
	}
}

function representativeLightnesses(field: FieldHypothesis): number[] {
	const values = [
		...field.backgroundRepresentatives.map(({ oklab }) => oklab[0]),
		...field.surfaceRepresentatives.map(({ oklab }) => oklab[0]),
	]
	return values.filter((value, index) => Number.isFinite(value) && values.indexOf(value) === index)
}

function fieldPolarity(
	family: ColorFamilyEvidence,
	field: FieldHypothesis,
): Readonly<{ direction: number; confidence: number; lightnessContrast: number }> {
	const deltas = representativeLightnesses(field).map((lightness) => lightness - family.prototype[0])
	if (deltas.length === 0) return { direction: 0, confidence: 0, lightnessContrast: 0 }
	const signed = deltas.reduce((sum, value) => sum + value, 0)
	const magnitude = deltas.reduce((sum, value) => sum + Math.abs(value), 0)
	const direction = magnitude <= Number.EPSILON ? 0 : signed / magnitude
	const lightnessContrast = clamp(
		(magnitude / deltas.length) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.fieldLightnessContrastScale,
	)
	return {
		direction,
		confidence: lightnessContrast * Math.abs(direction),
		lightnessContrast,
	}
}

function polarityAgreement(
	source: ForegroundPolarityObservation,
	fieldDirection: number,
	fieldConfidence: number,
): number {
	const reliability = clamp(source.confidence) * clamp(fieldConfidence)
	const directionalAgreement = clamp((1 + clampSigned(source.polarity) * clampSigned(fieldDirection)) / 2)
	return reliability * directionalAgreement
}

export function classifyFieldConditionalFamilyRole(
	family: ColorFamilyEvidence,
	field: FieldHypothesis,
): FieldConditionalRoleEvidence {
	const observations = roleObservations(family)
	const accentEvidence = familyAccentRoleEvidence(family)
	const repetition = accentEvidence.repetition
	const support = accentEvidence.support
	const geometry = aggregate(observations.map(typographyLikeGeometry))
	const compact = accentEvidence.compactness
	const localContrast = accentEvidence.observedLocalContrast
	const signatureObservation = accentEvidence.signatureObservation
	const polarity = fieldPolarity(family, field)
	const polarityMatch = polarityAgreement(
		family.foregroundPolarityObservation,
		polarity.direction,
		polarity.confidence,
	)
	const chroma = accentEvidence.chroma
	const foregroundRaw = clamp(
		0.30 * geometry +
		0.22 * repetition +
		0.20 * localContrast +
		0.16 * polarityMatch +
		0.12 * polarity.lightnessContrast,
	)
	const foregroundScore = foregroundRaw * (0.55 + 0.45 * support)
	const accentScore = accentEvidence.score
	const fieldOwned = family.id === field.backgroundFamilyId || family.id === field.surfaceFamilyId
	const strongest = Math.max(foregroundScore, accentScore)
	const weakest = Math.min(foregroundScore, accentScore)
	const margin = Math.abs(foregroundScore - accentScore)
	let preference: FamilyRolePreference = "ambiguous"
	let reason: RoleAmbiguityReason
	let confidence: number
	if (fieldOwned) {
		reason = "field-owned-family"
		confidence = 1
	} else if (strongest < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumRoleEvidence ||
		support < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumCoherentSupport) {
		reason = "insufficient-role-evidence"
		confidence = 1 - clamp(strongest /
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumRoleEvidence)
	} else if (weakest >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.simultaneousRoleEvidence &&
		margin < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.simultaneousRoleMargin) {
		reason = "simultaneous-role-support"
		confidence = clamp(weakest)
	} else if (margin < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.decisiveRoleMargin) {
		reason = "close-role-evidence"
		confidence = clamp(1 - margin /
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.decisiveRoleMargin)
	} else if (foregroundScore > accentScore) {
		preference = "foreground"
		reason = "decisive-foreground"
		confidence = clamp(margin /
			(1 - ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumRoleEvidence))
	} else {
		preference = "accent"
		reason = "decisive-accent"
		confidence = clamp(margin /
			(1 - ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumRoleEvidence))
	}

	return {
		familyId: family.id,
		fieldHypothesisId: field.id,
		preference,
		reason,
		confidence,
		fieldOwned,
		observedRegionCount: observations.length,
		coherentSupport: support,
		foreground: {
			score: foregroundScore,
			typographyLikeGeometry: geometry,
			repetition,
			observedLocalContrast: localContrast,
			fieldLightnessContrast: polarity.lightnessContrast,
			polarityAgreement: polarityMatch,
			polarity: {
				source: family.foregroundPolarityObservation,
				fieldDirection: polarity.direction,
				fieldConfidence: polarity.confidence,
			},
		},
		accent: {
			score: accentScore,
			compactness: compact,
			repetition,
			chroma,
			observedLocalContrast: localContrast,
			signatureObservation,
		},
	}
}

function evidenceStrength(evidence: FieldConditionalRoleEvidence): number {
	return evidence.preference === "foreground"
		? evidence.foreground.score
		: evidence.preference === "accent"
			? evidence.accent.score
			: Math.max(evidence.foreground.score, evidence.accent.score)
}

function obligationEvidenceOrder(
	first: FieldConditionalRoleEvidence,
	second: FieldConditionalRoleEvidence,
): number {
	const resolution = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.orderingEvidenceResolution
	const level = (value: number): number => Math.floor((value + 1e-12) / resolution)
	return compareDescending(level(evidenceStrength(first)), level(evidenceStrength(second))) ||
		compareDescending(level(first.coherentSupport), level(second.coherentSupport)) ||
		compareDescending(level(Math.max(first.foreground.repetition, first.accent.repetition)),
			level(Math.max(second.foreground.repetition, second.accent.repetition))) ||
		compareAscii(first.fieldHypothesisId, second.fieldHypothesisId) ||
		compareAscii(first.familyId, second.familyId) ||
		compareAscii(first.preference, second.preference)
}

export function buildRoleSpecificIdentityObligations(
	evidence: readonly FieldConditionalRoleEvidence[],
	maximumPerField: number = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.maximumObligationsPerField,
): RoleSpecificIdentityObligation[] {
	if (!Number.isSafeInteger(maximumPerField) || maximumPerField < 0) {
		throw new Error("Role obligation maximum per field must be a nonnegative integer")
	}
	const eligible = evidence.filter((candidate) =>
		!candidate.fieldOwned &&
		candidate.observedRegionCount > 0 &&
		candidate.coherentSupport >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumCoherentSupport &&
		evidenceStrength(candidate) >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.minimumRoleEvidence)
	const unique = new Map<string, FieldConditionalRoleEvidence>()
	for (const candidate of eligible) {
		const key = `${candidate.fieldHypothesisId}\0${candidate.familyId}`
		const incumbent = unique.get(key)
		if (!incumbent || obligationEvidenceOrder(candidate, incumbent) < 0) unique.set(key, candidate)
	}
	const byField = new Map<string, FieldConditionalRoleEvidence[]>()
	for (const candidate of unique.values()) {
		const fieldEvidence = byField.get(candidate.fieldHypothesisId) ?? []
		fieldEvidence.push(candidate)
		byField.set(candidate.fieldHypothesisId, fieldEvidence)
	}
	return [...byField.entries()]
		.sort(([first], [second]) => compareAscii(first, second))
		.flatMap(([_fieldHypothesisId, fieldEvidence]) => fieldEvidence
			.sort(obligationEvidenceOrder)
			.slice(0, maximumPerField)
			.map((candidate, priority) => ({
				id: `role-obligation:${candidate.fieldHypothesisId}:${candidate.familyId}:${candidate.preference}`,
				familyId: candidate.familyId,
				fieldHypothesisId: candidate.fieldHypothesisId,
				requiredRole: candidate.preference,
				priority,
				evidence: candidate,
			})))
}

function canonicalObligations(
	obligations: readonly RoleSpecificIdentityObligation[],
): RoleSpecificIdentityObligation[] {
	return [...obligations].sort((first, second) =>
		compareAscii(first.fieldHypothesisId, second.fieldHypothesisId) ||
		first.priority - second.priority ||
		compareAscii(first.familyId, second.familyId) ||
		compareAscii(first.requiredRole, second.requiredRole) ||
		compareAscii(first.id, second.id))
}

export function roleSpecificObligationCoverage(
	treatment: CompletePaletteTreatment,
	obligations: readonly RoleSpecificIdentityObligation[],
): RoleSpecificObligationCoverage {
	let foregroundCoveredCount = 0
	let accentCoveredCount = 0
	let ambiguousCoveredCount = 0
	let priorityWeight = 0
	let roleEvidence = 0
	const entries = canonicalObligations(obligations).map((obligation): RoleSpecificObligationCoverageEntry => {
		const fieldMatches = treatment.sourceFieldHypothesisId === obligation.fieldHypothesisId
		const foregroundCovered = fieldMatches && treatment.familyRoles.foreground === obligation.familyId
		const accentCovered = fieldMatches && !treatment.collapse.accent &&
			treatment.familyRoles.accent === obligation.familyId
		const covered = obligation.requiredRole === "foreground"
			? foregroundCovered
			: obligation.requiredRole === "accent"
				? accentCovered
				: foregroundCovered || accentCovered
		if (covered) {
			priorityWeight += 1 / (obligation.priority + 1)
			if (obligation.requiredRole === "foreground") foregroundCoveredCount++
			else if (obligation.requiredRole === "accent") accentCoveredCount++
			else ambiguousCoveredCount++
			roleEvidence += obligation.requiredRole === "foreground"
				? obligation.evidence.foreground.score
				: obligation.requiredRole === "accent"
					? obligation.evidence.accent.score
					: Math.max(
						...foregroundCovered ? [obligation.evidence.foreground.score] : [],
						...accentCovered ? [obligation.evidence.accent.score] : [],
					)
		}
		return {
			obligationId: obligation.id,
			familyId: obligation.familyId,
			requiredRole: obligation.requiredRole,
			fieldMatches,
			foregroundCovered,
			accentCovered,
			covered,
		}
	})
	const covered = entries.filter((entry) => entry.covered)
	return {
		entries,
		coveredObligationIds: covered.map(({ obligationId }) => obligationId),
		uncoveredObligationIds: entries.filter((entry) => !entry.covered).map(({ obligationId }) => obligationId),
		coveredCount: covered.length,
		foregroundCoveredCount,
		accentCoveredCount,
		ambiguousCoveredCount,
		priorityWeight,
		roleEvidence,
	}
}
