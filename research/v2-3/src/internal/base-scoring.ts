import { completeTreatmentKey } from "./palette-core.ts";

import { okDistance } from "./color.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import type { OKLab } from "./types.ts";

const QUALITY_AXES = [
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"foregroundPathUtility",
	"accentFidelity",
	"accentPathUtility",
	"coherence",
	"economy",
] as const

export type AlbumArtworkPaletteV2Phase3SelectorQualityAxis = typeof QUALITY_AXES[number]

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY = Object.freeze({
	evidenceResolution: 0.04,
	utilityResolution: 0.005,
	maximumIdentityGain: 0.05,
	accentIdentityCredit: 0.8,
	roleMatchedIdentityCredit: 1,
	roleMismatchedIdentityCredit: 0.35,
	identityRoleSeparation: 0.12,
	identityChromaticSeparation: 0.01,
	qualityWeights: Object.freeze({
		fieldFidelity: 0.16,
		surfaceFidelity: 0.06,
		artworkIdentity: 0.12,
		representativeness: 0.12,
		foregroundPathUtility: 0.19,
		accentFidelity: 0.07,
		accentPathUtility: 0.10,
		coherence: 0.09,
		economy: 0.09,
	}),
} as const)

export type AlbumArtworkPaletteV2Phase3IdentityRole = "foreground" | "accent" | "ambiguous"

/**
 * A family's field-conditional role evidence. An obligation family only carries artwork
 * identity when the treatment places it in a role its own evidence supports, so identity
 * credit is graded by role agreement rather than by mere presence.
 */
export type AlbumArtworkPaletteV2Phase3IdentityRoleRequirement = Readonly<{
	familyId: string
	fieldHypothesisId: string
	requiredRole: AlbumArtworkPaletteV2Phase3IdentityRole
	confidence?: number
}>

export type AlbumArtworkPaletteV2Phase3IdentityInput = Readonly<{
	obligations: ReadonlyArray<Readonly<{
		familyId: string
		priority: number
	}>>
	roleRequirements?: readonly AlbumArtworkPaletteV2Phase3IdentityRoleRequirement[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorQuality = Readonly<
	Record<AlbumArtworkPaletteV2Phase3SelectorQualityAxis, number>
>

export type AlbumArtworkPaletteV2Phase3SelectorEvaluation = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	quality: AlbumArtworkPaletteV2Phase3SelectorQuality
	evidenceLevels: Readonly<Record<AlbumArtworkPaletteV2Phase3SelectorQualityAxis, number>>
	qualityUtility: number
	identityCoverage: number
	identityGain: number
	relationUtility: number
	identityRoles: ReadonlyArray<Readonly<{
		familyId: string
		role: "foreground" | "accent"
		credit: number
	}>>
	paretoMember: boolean
	dominatedByKey: string | null
}>

export type AlbumArtworkPaletteV2Phase3SelectorSelection = Readonly<{
	evaluations: readonly AlbumArtworkPaletteV2Phase3SelectorEvaluation[]
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.evidenceResolution)
}

function utilityLevel(value: number): number {
	return Math.floor((value + 1e-12) / ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.utilityResolution)
}

function rolePathObservability(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): number {
	const activeRole = role === "accent" && treatment.collapse.accent ? "foreground" : role
	const values = treatment.contrast.pairs
		.filter((pair) => pair.role === activeRole)
		.map(({ signedLc }) => signedLc)
	if (values.length === 0) return 1
	return values.filter((value) => Number.isFinite(value) && value !== 0).length / values.length
}

function adjustedScore(treatment: CompletePaletteTreatment, value: number): number {
	return clamp(value - treatment.scores.generatedPenalty)
}

export function albumArtworkPaletteV2Phase3SelectorQuality(
	treatment: CompletePaletteTreatment,
): AlbumArtworkPaletteV2Phase3SelectorQuality {
	const foregroundPathUtility = Math.sqrt(
		clamp(treatment.scores.foregroundUtility) * rolePathObservability(treatment, "foreground"),
	)
	const accentPathUtility = Math.sqrt(
		clamp(treatment.scores.accentUtility) * rolePathObservability(treatment, "accent"),
	)
	return {
		fieldFidelity: adjustedScore(treatment, treatment.scores.fieldFidelity),
		surfaceFidelity: adjustedScore(treatment, treatment.scores.surfaceFidelity),
		artworkIdentity: adjustedScore(treatment, treatment.scores.artworkIdentity),
		representativeness: adjustedScore(treatment, treatment.scores.representativeness),
		foregroundPathUtility: adjustedScore(treatment, foregroundPathUtility),
		accentFidelity: adjustedScore(treatment, treatment.scores.accentFidelity),
		accentPathUtility: adjustedScore(treatment, accentPathUtility),
		coherence: adjustedScore(treatment, treatment.scores.coherence),
		economy: adjustedScore(treatment, treatment.scores.economy),
	}
}

function qualityUtility(quality: AlbumArtworkPaletteV2Phase3SelectorQuality): number {
	return QUALITY_AXES.reduce((sum, axis) =>
		sum + ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.qualityWeights[axis] * quality[axis], 0)
}

type NormalizedRoleRequirement = Readonly<{
	requiredRole: AlbumArtworkPaletteV2Phase3IdentityRole
	confidence: number
}>

type NormalizedIdentity = Readonly<{
	obligations: ReadonlyArray<Readonly<{ familyId: string; priority: number }>>
	requiredRoleByFamilyField: ReadonlyMap<string, NormalizedRoleRequirement>
}>

function requirementKey(familyId: string, fieldHypothesisId: string): string {
	return `${familyId}\0${fieldHypothesisId}`
}

function normalizedIdentity(identity: AlbumArtworkPaletteV2Phase3IdentityInput | undefined): NormalizedIdentity {
	const byFamily = new Map<string, number>()
	for (const obligation of identity?.obligations ?? []) {
		if (!Number.isFinite(obligation.priority) || obligation.familyId.length === 0) continue
		byFamily.set(obligation.familyId, Math.min(byFamily.get(obligation.familyId) ?? Infinity, obligation.priority))
	}
	const requiredRoleByFamilyField = new Map<string, NormalizedRoleRequirement>()
	for (const requirement of identity?.roleRequirements ?? []) {
		if (!byFamily.has(requirement.familyId) || requirement.fieldHypothesisId.length === 0) continue
		const key = requirementKey(requirement.familyId, requirement.fieldHypothesisId)
		if (requiredRoleByFamilyField.has(key)) continue
		requiredRoleByFamilyField.set(key, {
			requiredRole: requirement.requiredRole,
			confidence: clamp(Number.isFinite(requirement.confidence) ? requirement.confidence! : 1),
		})
	}
	return {
		obligations: [...byFamily].map(([familyId, priority]) => ({ familyId, priority }))
			.sort((first, second) => first.priority - second.priority ||
				compareAscii(first.familyId, second.familyId)),
		requiredRoleByFamilyField,
	}
}

/**
 * Role-agnostic baseline credit, then a move toward the matched or mismatched credit in
 * proportion to the classifier's own confidence. The field-conditional role classifier is
 * evidence, not ground truth: a barely decided classification must barely move the credit.
 */
function placementCredit(
	requirement: NormalizedRoleRequirement | undefined,
	placedRole: "foreground" | "accent",
): number {
	const baseline = placedRole === "foreground"
		? 1
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.accentIdentityCredit
	if (requirement === undefined || requirement.requiredRole === "ambiguous") return baseline
	const target = requirement.requiredRole === placedRole
		? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.roleMatchedIdentityCredit
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.roleMismatchedIdentityCredit
	return baseline + (target - baseline) * requirement.confidence
}

/**
 * Obligation priority weight. The reciprocal rank matches the weight the role-specific
 * obligation system already uses, so both identity systems value priority identically, and
 * unlike a rank-linear weight its ratios do not flatten as the obligation list grows: a
 * lower-priority family can never quietly become as valuable as the strongest one.
 */
function priorityWeight(priority: number): number {
	return 1 / (Math.max(0, priority) + 1)
}

/** Distance in the OKLab chroma plane: how different two colors are apart from lightness. */
function chromaticDistance(first: OKLab, second: OKLab): number {
	return Math.hypot(first[1] - second[1], first[2] - second[2])
}

/**
 * The greatest identity credit any one complete treatment could carry: a treatment owns two
 * identity-bearing roles (foreground and a distinct accent), so the two strongest obligations
 * are the achievable ceiling. Normalizing coverage by this ceiling — rather than by the sum
 * over every obligation — keeps an omitted family's cost visible instead of diluting every
 * treatment's coverage as the obligation list grows.
 */
function achievableIdentityCredit(weights: readonly number[]): number {
	const ranked = [...weights].sort(compareDescending)
	if (ranked.length === 0) return 0
	return ranked[0] + (ranked.length > 1
		? ranked[1] * ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.accentIdentityCredit
		: 0)
}

function identityEvaluation(
	treatment: CompletePaletteTreatment,
	identity: NormalizedIdentity,
): Readonly<{
	coverage: number
	gain: number
	roles: AlbumArtworkPaletteV2Phase3SelectorEvaluation["identityRoles"]
}> {
	const obligations = identity.obligations
	const denominator = achievableIdentityCredit(obligations.map(({ priority }) => priorityWeight(priority)))
	const requiredRole = (familyId: string): NormalizedRoleRequirement | undefined =>
		identity.requiredRoleByFamilyField.get(requirementKey(familyId, treatment.sourceFieldHypothesisId))
	// Two roles rendering nearly the same color do not carry two identity directions. Without
	// this the objective can reward splitting one direction across foreground and accent —
	// which reads as a redundant palette and, on genuinely two-color artwork, as a reason to
	// break a correct collapse. Identity directions are chromatic: a second near-neutral, however
	// much lighter or darker, restates the direction the foreground already carries.
	const identityBearingAccent = !treatment.collapse.accent &&
		okDistance(treatment.foreground.oklab, treatment.accent.oklab) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityRoleSeparation &&
		chromaticDistance(treatment.foreground.oklab, treatment.accent.oklab) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityChromaticSeparation
	let numerator = 0
	const roles: Array<{ familyId: string; role: "foreground" | "accent"; credit: number }> = []
	for (const obligation of obligations) {
		const weight = priorityWeight(obligation.priority)
		if (treatment.familyRoles.foreground === obligation.familyId) {
			const credit = placementCredit(requiredRole(obligation.familyId), "foreground")
			numerator += weight * credit
			roles.push({ familyId: obligation.familyId, role: "foreground", credit })
		} else if (identityBearingAccent && treatment.familyRoles.accent === obligation.familyId) {
			const credit = placementCredit(requiredRole(obligation.familyId), "accent")
			numerator += weight * credit
			roles.push({ familyId: obligation.familyId, role: "accent", credit })
		}
	}
	const coverage = denominator === 0 ? 0 : clamp(numerator / denominator)
	return {
		coverage,
		gain: Math.min(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain * coverage,
		),
		roles,
	}
}

function qualityDominates(
	first: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	second: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
): boolean {
	let strictlyBetter = false
	if (first.identityCoverage < second.identityCoverage) return false
	if (first.identityCoverage > second.identityCoverage) strictlyBetter = true
	for (const axis of QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

function compareEvaluations(
	first: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	second: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
): number {
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility)) ||
		compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility)) ||
		compareDescending(first.identityCoverage, second.identityCoverage)
	if (comparison !== 0) return comparison
	const firstLevels = QUALITY_AXES.map((axis) => first.evidenceLevels[axis]).sort((a, b) => a - b)
	const secondLevels = QUALITY_AXES.map((axis) => second.evidenceLevels[axis]).sort((a, b) => a - b)
	for (let index = 0; index < firstLevels.length; index++) {
		comparison = compareDescending(firstLevels[index], secondLevels[index])
		if (comparison !== 0) return comparison
	}
	for (const axis of QUALITY_AXES) {
		comparison = compareDescending(first.evidenceLevels[axis], second.evidenceLevels[axis])
		if (comparison !== 0) return comparison
	}
	return compareAscii(first.key, second.key)
}

function evaluateTreatment(
	treatment: CompletePaletteTreatment,
	normalized: NormalizedIdentity,
): AlbumArtworkPaletteV2Phase3SelectorEvaluation {
	const quality = albumArtworkPaletteV2Phase3SelectorQuality(treatment)
	for (const axis of QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite selector quality axis ${axis}`)
	}
	const identity = identityEvaluation(treatment, normalized)
	const utility = qualityUtility(quality)
	return {
		key: completeTreatmentKey(treatment),
		treatment,
		quality,
		evidenceLevels: Object.fromEntries(QUALITY_AXES.map((axis) => [axis, evidenceLevel(quality[axis])])) as
			Record<AlbumArtworkPaletteV2Phase3SelectorQualityAxis, number>,
		qualityUtility: utility,
		identityCoverage: identity.coverage,
		identityGain: identity.gain,
		relationUtility: utility + identity.gain,
		identityRoles: identity.roles,
		paretoMember: false,
		dominatedByKey: null,
	}
}

export function selectAlbumArtworkPaletteV2Phase3Treatments(
	treatments: readonly CompletePaletteTreatment[],
	identity?: AlbumArtworkPaletteV2Phase3IdentityInput,
): AlbumArtworkPaletteV2Phase3SelectorSelection {
	if (treatments.length === 0) throw new RangeError("The complete treatment domain is empty")
	const normalized = normalizedIdentity(identity)
	const allEvaluations = treatments.map((treatment) => evaluateTreatment(treatment, normalized))
		.sort(compareEvaluations)
	const uniqueByKey = new Map<string, AlbumArtworkPaletteV2Phase3SelectorEvaluation>()
	for (const evaluation of allEvaluations) {
		if (!uniqueByKey.has(evaluation.key)) uniqueByKey.set(evaluation.key, evaluation)
	}
	const unique = [...uniqueByKey.values()]
	const evaluations = unique.map((evaluation): AlbumArtworkPaletteV2Phase3SelectorEvaluation => {
		const dominators = unique.filter((candidate) => candidate !== evaluation && qualityDominates(candidate, evaluation))
			.sort((first, second) => compareDescending(first.qualityUtility, second.qualityUtility) ||
				compareAscii(first.key, second.key))
		return {
			...evaluation,
			paretoMember: dominators.length === 0,
			dominatedByKey: dominators[0]?.key ?? null,
		}
	}).sort(compareEvaluations)
	const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compareEvaluations)
	if (frontier.length === 0) throw new Error("The complete treatment Pareto frontier is empty")
	return { evaluations }
}
