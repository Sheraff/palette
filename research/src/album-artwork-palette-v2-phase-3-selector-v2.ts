import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
	AlbumArtworkPaletteV2Phase3SelectorV2Input as CommonSelectorV2Input,
	AlbumArtworkPaletteV2Phase3SelectorV2Module,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID =
	"album-artwork-palette-v2-phase-3-dominance-selector-v2-wave-3" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES = [
	"fieldFidelity",
	"representativeness",
	"sourceSupport",
	"renderedGradientSalience",
	"foregroundPath",
	"accentPath",
	"coherence",
	"economy",
] as const

export type AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis =
	typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES[number]

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY = Object.freeze({
	evidenceResolution: 0.04,
	utilityResolution: 0.005,
	maximumRoleIdentityGain: 0.035,
	maximumSlateDiversityGain: 0.03,
	maximumSlateQualityLoss: 0.12,
	maximumSlateTreatments: 8,
	nearColorDistance: 0.025,
	materialColorDistance: 0.04,
	qualityWeights: Object.freeze({
		fieldFidelity: 0.20,
		representativeness: 0.13,
		sourceSupport: 0.13,
		renderedGradientSalience: 0.12,
		foregroundPath: 0.16,
		accentPath: 0.09,
		coherence: 0.09,
		economy: 0.08,
	}),
} as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_FORMULAS = Object.freeze({
	fieldFidelity:
		"clamp(fieldFidelity - generatedPenalty), forced to 0 for an unsupported rendered-gradient claim",
	representativeness: "clamp(representativeness - generatedPenalty)",
	sourceSupport:
		"0.65*mean(active unique role support) + 0.35*minimum(active unique role support); generated, disconnected, or wrong-family roles have support 0",
	renderedGradientSalience:
		"no-gradient-applicable=1; missing-or-unearned=0; earned=sqrt(clamp(rendered endpoint OKLab distance/0.18)*mean(progression, mode progression, monotonicity, edge continuity, coverage))",
	foregroundPath:
		"clamp(sqrt(foregroundUtility*nonzero foreground path fraction) - generatedPenalty)",
	accentPath:
		"clamp(sqrt(accentUtility*nonzero accent path fraction) - generatedPenalty); a collapsed accent uses the foreground path",
	qualityUtility:
		"0.20*fieldFidelity + 0.13*representativeness + 0.13*sourceSupport + 0.12*renderedGradientSalience + 0.16*foregroundPath + 0.09*accentPath + 0.09*coherence + 0.08*economy",
	roleIdentity:
		"field-matching obligations receive exact required-role coverage only; priority/evidence-weighted coverage adds at most 0.035",
	dominance:
		"gradient-claim correctness, exact field-conditional role coverage, and every 0.04 quality level are non-worse, with at least one strictly better",
	ordering:
		"non-dominated candidates by descending 0.005 level of qualityUtility+boundedRoleIdentityGain, then quality utility, role coverage, leximin quality, declared quality axes, canonical rendering",
	slate:
		"non-dominated, non-near candidates within 0.12 quality utility of the winner; add only a materially new field, foreground, accent, structure, or role obligation, up to 8",
})

export type AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus =
	"earned-rendered" | "missing" | "unearned" | "not-applicable"

export type AlbumArtworkPaletteV2Phase3SelectorV2Quality = Readonly<
	Record<AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis, number>
>

export type AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation = Readonly<{
	id: string
	familyId: string
	fieldHypothesisId: string
	requiredRole: "foreground" | "accent" | "ambiguous"
	priority: number
	evidence: Readonly<{
		foreground: Readonly<{ score: number }>
		accent: Readonly<{ score: number }>
	}>
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2RoleCoverageEntry = Readonly<{
	obligationId: string
	familyId: string
	fieldHypothesisId: string
	requiredRole: AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation["requiredRole"]
	coveredRole: "foreground" | "accent" | null
	covered: boolean
	wrongRole: boolean
	weight: number
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2RoleIdentity = Readonly<{
	applicableObligationCount: number
	coveredObligationCount: number
	coveredObligationIds: readonly string[]
	coverage: number
	gain: number
	entries: readonly AlbumArtworkPaletteV2Phase3SelectorV2RoleCoverageEntry[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2Evaluation = Readonly<{
	key: string
	canonicalKey: string
	treatment: CompletePaletteTreatment
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	quality: AlbumArtworkPaletteV2Phase3SelectorV2Quality
	evidenceLevels: Readonly<Record<AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis, number>>
	qualityUtility: number
	roleIdentity: AlbumArtworkPaletteV2Phase3SelectorV2RoleIdentity
	relationUtility: number
	paretoMember: boolean
	dominatedByKey: string | null
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2SlateDimension =
	"field" | "foreground" | "accent" | "structure" | "role-identity"

export type AlbumArtworkPaletteV2Phase3SelectorV2SlateEntry = Readonly<{
	key: string
	index: number
	qualityUtility: number
	roleIdentityGain: number
	diversityGain: number
	slateUtility: number
	novelDimensions: readonly AlbumArtworkPaletteV2Phase3SelectorV2SlateDimension[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2Explanation = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_FORMULAS
	domain: Readonly<{
		materializedTreatmentCount: number
		uniqueTreatmentCount: number
		duplicateTreatmentCount: number
		paretoTreatmentCount: number
		dominatedTreatmentCount: number
		evidenceFamilyCount: number
		roleSpecificObligationCount: number
		familyOnlyObligationCountIgnoredForCredit: number
	}>
	qualityAxes: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES
	paretoKeys: readonly string[]
	winner: Readonly<{
		key: string
		gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
		qualityUtility: number
		roleIdentityCoverage: number
		roleIdentityGain: number
		relationUtility: number
		reasons: readonly string[]
	}>
	slate: readonly AlbumArtworkPaletteV2Phase3SelectorV2SlateEntry[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2Input<
	TDomain extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike =
		AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
> = CommonSelectorV2Input<TDomain> & Readonly<{
	roleSpecificObligations?: readonly AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorV2Selection<
	TDomain extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike =
		AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
> = Readonly<{
	winner: TDomain["materialized"][number]
	slate: readonly TDomain["materialized"][number][]
	evaluations: readonly AlbumArtworkPaletteV2Phase3SelectorV2Evaluation[]
	explanation: AlbumArtworkPaletteV2Phase3SelectorV2Explanation
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.evidenceResolution)
}

function utilityLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.utilityResolution)
}

function adjustedScore(treatment: CompletePaletteTreatment, value: number): number {
	return clamp(value - treatment.scores.generatedPenalty)
}

function colorDistance(first: PaletteRoleColor, second: PaletteRoleColor): number {
	return Math.hypot(
		first.oklab[0] - second.oklab[0],
		first.oklab[1] - second.oklab[1],
		first.oklab[2] - second.oklab[2],
	)
}

function roleSourceSupport(color: PaletteRoleColor, declaredFamilyId: string): number {
	if (color.generated || "generated" in color.support || declaredFamilyId === "generated") return 0
	const support = color.support
	if (support.anchorFamilyId !== declaredFamilyId || support.regionIds.length === 0) return 0
	return clamp(
		0.26 * clamp(support.perceptualDensity / 0.5) +
		0.20 * clamp(support.totalSupport / 0.08) +
		0.20 * clamp(support.connectedSupport / 0.08) +
		0.14 * clamp(support.spatialCoverage) +
		0.10 * clamp(support.concentration) +
		0.10 * (1 - clamp(support.prototypeDistance / 0.06)),
	)
}

function treatmentSourceSupport(treatment: CompletePaletteTreatment): number {
	const activeRoles: Array<"background" | "surface" | "foreground" | "accent"> = ["background"]
	if (!treatment.collapse.surface) activeRoles.push("surface")
	activeRoles.push("foreground")
	if (!treatment.collapse.accent) activeRoles.push("accent")
	const unique = new Map<string, number>()
	for (const role of activeRoles) {
		const color = treatment[role]
		const key = `${color.hex.toLowerCase()}\0${treatment.familyRoles[role]}`
		unique.set(key, roleSourceSupport(color, treatment.familyRoles[role]))
	}
	const values = [...unique.values()]
	return values.length === 0 ? 0 : 0.65 * mean(values) + 0.35 * Math.min(...values)
}

function rolePathFraction(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): number {
	const activeRole = role === "accent" && treatment.collapse.accent ? "foreground" : role
	const path = treatment.contrast.pairs.filter((pair) => pair.role === activeRole)
	if (path.length === 0) return 0
	return path.filter(({ signedLc }) => Number.isFinite(signedLc) && signedLc !== 0).length / path.length
}

function gradientEvidenceStrength(treatment: CompletePaletteTreatment): number {
	const evidence = treatment.gradientEvidence
	if (!evidence) return 0
	return mean([
		evidence.progression,
		evidence.modeProgression,
		evidence.monotonicity,
		evidence.edgeContinuity,
		evidence.coverage,
	].map(clamp))
}

function earnedGradientClaim(treatment: CompletePaletteTreatment): boolean {
	const evidence = treatment.gradientEvidence
	if (!treatment.gradient || treatment.fieldTreatment !== "gradient-field" ||
		treatment.collapse.surface || evidence === null) return false
	if (treatment.familyRoles.background === "generated" || treatment.familyRoles.surface === "generated") return false
	const supportingFamilies = new Set(evidence.supportingFamilyIds)
	return supportingFamilies.has(treatment.familyRoles.background) &&
		supportingFamilies.has(treatment.familyRoles.surface) &&
		Number.isFinite(evidence.span) && evidence.span > 0 &&
		colorDistance(treatment.background, treatment.surface) > 0 &&
		gradientEvidenceStrength(treatment) > 0
}

function gradientStatus(
	treatment: CompletePaletteTreatment,
	gradientExpected: boolean,
): AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus {
	if (earnedGradientClaim(treatment)) return "earned-rendered"
	if (treatment.gradient) return "unearned"
	if (treatment.fieldTreatment === "gradient-field" || gradientExpected) return "missing"
	return "not-applicable"
}

function gradientCorrectness(status: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus): number {
	return status === "missing" || status === "unearned" ? 0 : 1
}

function renderedGradientSalience(
	treatment: CompletePaletteTreatment,
	status: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
): number {
	if (status === "not-applicable") return 1
	if (status !== "earned-rendered") return 0
	const endpointSalience = clamp(colorDistance(treatment.background, treatment.surface) / 0.18)
	return Math.sqrt(endpointSalience * gradientEvidenceStrength(treatment))
}

export function albumArtworkPaletteV2Phase3SelectorV2Quality(
	treatment: CompletePaletteTreatment,
	gradientExpected = false,
): Readonly<{
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	quality: AlbumArtworkPaletteV2Phase3SelectorV2Quality
}> {
	const status = gradientStatus(treatment, gradientExpected)
	const foregroundPath = Math.sqrt(clamp(treatment.scores.foregroundUtility) *
		rolePathFraction(treatment, "foreground"))
	const accentPath = Math.sqrt(clamp(treatment.scores.accentUtility) *
		rolePathFraction(treatment, "accent"))
	return {
		gradientStatus: status,
		quality: {
			fieldFidelity: status === "unearned"
				? 0
				: adjustedScore(treatment, treatment.scores.fieldFidelity),
			representativeness: adjustedScore(treatment, treatment.scores.representativeness),
			sourceSupport: treatmentSourceSupport(treatment),
			renderedGradientSalience: renderedGradientSalience(treatment, status),
			foregroundPath: adjustedScore(treatment, foregroundPath),
			accentPath: adjustedScore(treatment, accentPath),
			coherence: adjustedScore(treatment, treatment.scores.coherence),
			economy: adjustedScore(treatment, treatment.scores.economy),
		},
	}
}

function roleEvidenceStrength(obligation: AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation): number {
	return obligation.requiredRole === "foreground"
		? obligation.evidence.foreground.score
		: obligation.requiredRole === "accent"
			? obligation.evidence.accent.score
			: Math.max(obligation.evidence.foreground.score, obligation.evidence.accent.score)
}

function roleObligationOrder(
	first: AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation,
	second: AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation,
): number {
	return compareAscii(first.fieldHypothesisId, second.fieldHypothesisId) ||
		first.priority - second.priority ||
		compareAscii(first.familyId, second.familyId) ||
		compareAscii(first.requiredRole, second.requiredRole) ||
		compareDescending(roleEvidenceStrength(first), roleEvidenceStrength(second)) ||
		compareAscii(first.id, second.id)
}

function normalizedRoleObligations(
	obligations: readonly AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation[],
): AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation[] {
	const ordered = [...obligations].filter((obligation) =>
		obligation.familyId.length > 0 && obligation.fieldHypothesisId.length > 0 &&
		Number.isFinite(obligation.priority)).sort(roleObligationOrder)
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation>()
	for (const obligation of ordered) {
		const key = [
			obligation.fieldHypothesisId,
			obligation.familyId,
			obligation.requiredRole,
			obligation.priority,
		].join("\0")
		if (!unique.has(key)) unique.set(key, obligation)
	}
	return [...unique.values()].sort(roleObligationOrder)
}

function roleIdentityEvaluation(
	treatment: CompletePaletteTreatment,
	obligations: readonly AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation[],
): AlbumArtworkPaletteV2Phase3SelectorV2RoleIdentity {
	const applicable = obligations.filter(({ fieldHypothesisId }) =>
		fieldHypothesisId === treatment.sourceFieldHypothesisId)
	const entries = applicable.map((obligation): AlbumArtworkPaletteV2Phase3SelectorV2RoleCoverageEntry => {
		const foregroundMatches = treatment.familyRoles.foreground === obligation.familyId
		const accentMatches = !treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId
		const coveredRole = obligation.requiredRole === "foreground"
			? foregroundMatches ? "foreground" as const : null
			: obligation.requiredRole === "accent"
				? accentMatches ? "accent" as const : null
				: foregroundMatches ? "foreground" as const : accentMatches ? "accent" as const : null
		const covered = coveredRole !== null
		const familyPresent = foregroundMatches || accentMatches
		const weight = 1 / (Math.max(0, obligation.priority) + 1) *
			(0.5 + 0.5 * clamp(roleEvidenceStrength(obligation)))
		return {
			obligationId: obligation.id,
			familyId: obligation.familyId,
			fieldHypothesisId: obligation.fieldHypothesisId,
			requiredRole: obligation.requiredRole,
			coveredRole,
			covered,
			wrongRole: familyPresent && !covered,
			weight,
		}
	})
	const denominator = entries.reduce((sum, { weight }) => sum + weight, 0)
	const numerator = entries.filter(({ covered }) => covered)
		.reduce((sum, { weight }) => sum + weight, 0)
	const coverage = denominator === 0 ? 0 : clamp(numerator / denominator)
	return {
		applicableObligationCount: entries.length,
		coveredObligationCount: entries.filter(({ covered }) => covered).length,
		coveredObligationIds: entries.filter(({ covered }) => covered).map(({ obligationId }) => obligationId),
		coverage,
		gain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.maximumRoleIdentityGain * coverage,
		entries,
	}
}

function qualityUtility(quality: AlbumArtworkPaletteV2Phase3SelectorV2Quality): number {
	return ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES.reduce((sum, axis) =>
		sum + ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.qualityWeights[axis] * quality[axis], 0)
}

function structuralKey(treatment: CompletePaletteTreatment): string {
	return [
		completeTreatmentKey(treatment),
		treatment.sourceFieldHypothesisId,
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.familyRoles.foreground,
		treatment.familyRoles.accent,
		treatment.gradientEvidence?.topology ?? "none",
		treatment.gradientEvidence?.direction ?? "none",
	].join("\0")
}

function evaluateTreatment(
	key: string,
	treatment: CompletePaletteTreatment,
	gradientExpected: boolean,
	obligations: readonly AlbumArtworkPaletteV2Phase3SelectorV2RoleObligation[],
): AlbumArtworkPaletteV2Phase3SelectorV2Evaluation {
	const { gradientStatus: status, quality } = albumArtworkPaletteV2Phase3SelectorV2Quality(
		treatment,
		gradientExpected,
	)
	const utility = qualityUtility(quality)
	const roleIdentity = roleIdentityEvaluation(treatment, obligations)
	return {
		key,
		canonicalKey: completeTreatmentKey(treatment),
		treatment,
		gradientStatus: status,
		quality,
		evidenceLevels: Object.fromEntries(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES.map((axis) =>
				[axis, evidenceLevel(quality[axis])]),
		) as Record<AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis, number>,
		qualityUtility: utility,
		roleIdentity,
		relationUtility: utility + roleIdentity.gain,
		paretoMember: false,
		dominatedByKey: null,
	}
}

function dominates(
	first: AlbumArtworkPaletteV2Phase3SelectorV2Evaluation,
	second: AlbumArtworkPaletteV2Phase3SelectorV2Evaluation,
): boolean {
	let strictlyBetter = false
	const firstGradientCorrectness = gradientCorrectness(first.gradientStatus)
	const secondGradientCorrectness = gradientCorrectness(second.gradientStatus)
	if (firstGradientCorrectness < secondGradientCorrectness) return false
	if (firstGradientCorrectness > secondGradientCorrectness) strictlyBetter = true
	if (first.roleIdentity.coverage < second.roleIdentity.coverage) return false
	if (first.roleIdentity.coverage > second.roleIdentity.coverage) strictlyBetter = true
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

function compareEvaluations(
	first: AlbumArtworkPaletteV2Phase3SelectorV2Evaluation,
	second: AlbumArtworkPaletteV2Phase3SelectorV2Evaluation,
): number {
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility)) ||
		compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility)) ||
		compareDescending(first.roleIdentity.coverage, second.roleIdentity.coverage) ||
		compareDescending(gradientCorrectness(first.gradientStatus), gradientCorrectness(second.gradientStatus))
	if (comparison !== 0) return comparison
	const firstLevels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES
		.map((axis) => first.evidenceLevels[axis]).sort((left, right) => left - right)
	const secondLevels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES
		.map((axis) => second.evidenceLevels[axis]).sort((left, right) => left - right)
	for (let index = 0; index < firstLevels.length; index++) {
		comparison = compareDescending(firstLevels[index], secondLevels[index])
		if (comparison !== 0) return comparison
	}
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES) {
		comparison = compareDescending(first.evidenceLevels[axis], second.evidenceLevels[axis])
		if (comparison !== 0) return comparison
	}
	return compareAscii(first.canonicalKey, second.canonicalKey) ||
		compareAscii(structuralKey(first.treatment), structuralKey(second.treatment)) ||
		compareAscii(first.key, second.key)
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function visuallyNear(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): boolean {
	if (gradientRenderingKey(first) !== gradientRenderingKey(second)) return false
	return (["background", "surface", "foreground", "accent"] as const).every((role) =>
		colorDistance(first[role], second[role]) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.nearColorDistance)
}

function hasSimilarRole(
	candidate: CompletePaletteTreatment,
	selected: readonly AlbumArtworkPaletteV2Phase3SelectorV2Evaluation[],
	role: "foreground" | "accent",
): boolean {
	return selected.some(({ treatment }) => {
		if (role === "accent" && candidate.collapse.accent !== treatment.collapse.accent) return false
		return candidate.familyRoles[role] === treatment.familyRoles[role] &&
			colorDistance(candidate[role], treatment[role]) <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.materialColorDistance
	})
}

function novelty(
	candidate: AlbumArtworkPaletteV2Phase3SelectorV2Evaluation,
	selected: readonly AlbumArtworkPaletteV2Phase3SelectorV2Evaluation[],
): Readonly<{
	dimensions: readonly AlbumArtworkPaletteV2Phase3SelectorV2SlateDimension[]
	gain: number
}> {
	const value = candidate.treatment
	const dimensions: AlbumArtworkPaletteV2Phase3SelectorV2SlateDimension[] = []
	const similarField = selected.some(({ treatment }) =>
		treatment.familyRoles.background === value.familyRoles.background &&
		treatment.familyRoles.surface === value.familyRoles.surface &&
		gradientRenderingKey(treatment) === gradientRenderingKey(value) &&
		Math.max(
			colorDistance(treatment.background, value.background),
			colorDistance(treatment.surface, value.surface),
		) < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.materialColorDistance)
	if (!similarField) dimensions.push("field")
	if (!hasSimilarRole(value, selected, "foreground")) dimensions.push("foreground")
	if (!hasSimilarRole(value, selected, "accent")) dimensions.push("accent")
	const structure = `${value.fieldTreatment}:${value.collapse.surface}:${value.collapse.accent}`
	if (!selected.some(({ treatment }) =>
		`${treatment.fieldTreatment}:${treatment.collapse.surface}:${treatment.collapse.accent}` === structure)) {
		dimensions.push("structure")
	}
	const covered = new Set(selected.flatMap(({ roleIdentity }) => roleIdentity.coveredObligationIds))
	if (candidate.roleIdentity.coveredObligationIds.some((obligationId) => !covered.has(obligationId))) {
		dimensions.push("role-identity")
	}
	return {
		dimensions,
		gain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.maximumSlateDiversityGain *
			dimensions.length / 5,
	}
}

function selectSlate(
	frontier: readonly AlbumArtworkPaletteV2Phase3SelectorV2Evaluation[],
): Readonly<{
	evaluations: readonly AlbumArtworkPaletteV2Phase3SelectorV2Evaluation[]
	explanation: readonly AlbumArtworkPaletteV2Phase3SelectorV2SlateEntry[]
}> {
	const winner = frontier[0]
	const selected = [winner]
	const explanation: AlbumArtworkPaletteV2Phase3SelectorV2SlateEntry[] = [{
		key: winner.key,
		index: 0,
		qualityUtility: winner.qualityUtility,
		roleIdentityGain: winner.roleIdentity.gain,
		diversityGain: 0,
		slateUtility: winner.relationUtility,
		novelDimensions: [],
	}]
	while (selected.length < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.maximumSlateTreatments) {
		const next = frontier.filter((candidate) =>
			!selected.includes(candidate) &&
			candidate.qualityUtility >= winner.qualityUtility -
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.maximumSlateQualityLoss &&
			!selected.some(({ treatment }) => visuallyNear(treatment, candidate.treatment)))
			.map((candidate) => {
				const diversity = novelty(candidate, selected)
				return {
					candidate,
					diversity,
					slateUtility: candidate.relationUtility + diversity.gain,
				}
			})
			.filter(({ diversity }) => diversity.dimensions.length > 0 && diversity.gain > 0)
			.sort((first, second) =>
				compareDescending(utilityLevel(first.slateUtility), utilityLevel(second.slateUtility)) ||
				compareEvaluations(first.candidate, second.candidate))[0]
		if (!next) break
		selected.push(next.candidate)
		explanation.push({
			key: next.candidate.key,
			index: selected.length - 1,
			qualityUtility: next.candidate.qualityUtility,
			roleIdentityGain: next.candidate.roleIdentity.gain,
			diversityGain: next.diversity.gain,
			slateUtility: next.slateUtility,
			novelDimensions: next.diversity.dimensions,
		})
	}
	return { evaluations: selected, explanation }
}

export function selectAlbumArtworkPaletteV2Phase3SelectorV2<
	TDomain extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
>(
	input: AlbumArtworkPaletteV2Phase3SelectorV2Input<TDomain>,
): AlbumArtworkPaletteV2Phase3SelectorV2Selection<TDomain> {
	const materialized = input.materializedDomain.materialized
	if (materialized.length === 0) throw new RangeError("The materialized complete-treatment domain is empty")
	const obligations = normalizedRoleObligations(input.roleSpecificObligations ?? [])
	const earnedGradientFields = new Set(materialized.filter(({ treatment }) => earnedGradientClaim(treatment))
		.map(({ treatment }) => treatment.sourceFieldHypothesisId))
	const rawEvaluations = materialized.map(({ key, treatment }) => evaluateTreatment(
		key,
		treatment,
		earnedGradientFields.has(treatment.sourceFieldHypothesisId),
		obligations,
	)).sort(compareEvaluations)
	const uniqueByKey = new Map<string, AlbumArtworkPaletteV2Phase3SelectorV2Evaluation>()
	for (const evaluation of rawEvaluations) {
		if (!uniqueByKey.has(evaluation.key)) uniqueByKey.set(evaluation.key, evaluation)
	}
	const unique = [...uniqueByKey.values()]
	const evaluations = unique.map((evaluation): AlbumArtworkPaletteV2Phase3SelectorV2Evaluation => {
		const dominators = unique.filter((candidate) => candidate !== evaluation && dominates(candidate, evaluation))
			.sort(compareEvaluations)
		return {
			...evaluation,
			paretoMember: dominators.length === 0,
			dominatedByKey: dominators[0]?.key ?? null,
		}
	}).sort(compareEvaluations)
	const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compareEvaluations)
	if (frontier.length === 0) throw new Error("The complete-treatment dominance frontier is empty")
	const materializedByTreatment = new Map(materialized.map((candidate) => [candidate.treatment, candidate]))
	const winner = frontier[0]
	const slate = selectSlate(frontier)
	const reasons = [
		"non-dominated-complete-treatment",
		"maximum-bounded-relation-utility",
		...winner.roleIdentity.gain > 0 ? ["field-conditional-required-role-identity"] : [],
		...winner.gradientStatus === "earned-rendered" ? ["source-earned-rendered-gradient"] : [],
	]
	const explanation: AlbumArtworkPaletteV2Phase3SelectorV2Explanation = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID,
		formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_FORMULAS,
		domain: {
			materializedTreatmentCount: materialized.length,
			uniqueTreatmentCount: unique.length,
			duplicateTreatmentCount: materialized.length - unique.length,
			paretoTreatmentCount: frontier.length,
			dominatedTreatmentCount: unique.length - frontier.length,
			evidenceFamilyCount: input.evidence.families.length,
			roleSpecificObligationCount: obligations.length,
			familyOnlyObligationCountIgnoredForCredit: input.identityObligations.length,
		},
		qualityAxes: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES,
		paretoKeys: frontier.map(({ key }) => key),
		winner: {
			key: winner.key,
			gradientStatus: winner.gradientStatus,
			qualityUtility: winner.qualityUtility,
			roleIdentityCoverage: winner.roleIdentity.coverage,
			roleIdentityGain: winner.roleIdentity.gain,
			relationUtility: winner.relationUtility,
			reasons,
		},
		slate: slate.explanation,
	}
	return {
		winner: materializedByTreatment.get(winner.treatment)!,
		slate: slate.evaluations.map(({ treatment }) => materializedByTreatment.get(treatment)!),
		evaluations,
		explanation,
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2:
	AlbumArtworkPaletteV2Phase3SelectorV2Module<
		AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
		AlbumArtworkPaletteV2Phase3SelectorV2Selection
	> = Object.freeze({
		select: selectAlbumArtworkPaletteV2Phase3SelectorV2,
	})
