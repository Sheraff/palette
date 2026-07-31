import { completeTreatmentKey } from "./palette-core.ts";

import { okDistance } from "./color.ts";

import { ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "./policy.ts";

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
	evidenceResolution: ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence,
	utilityResolution: ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility,
	maximumIdentityGain: 0.05,
	accentIdentityCredit: 0.8,
	roleMatchedIdentityCredit: 1,
	roleMismatchedIdentityCredit: 0.35,
	surfaceIdentityCredit: 0.6,
	identityRoleSeparation: 0.12,
	identityChromaticSeparation: 0.01,
	identityDirectionChroma: 0.06,
	identityDirectionFullChroma: 0.09,
	identityDirectionHueDegrees: 40,
	identityDirectionAuthorityTarget: 2,
	identityForegroundClaimMargin: 0.04,
	authorizedIdentityGain: 0.08,
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

/**
 * When the foreground is admitted to the machinery that reads a palette's carried colour.
 *
 * Two places refuse the foreground outright: the identity objective never lets a foreground
 * placement earn *authority* (`credit` below), and the gamut-coverage axis's `"field-and-accent"`
 * scope never lets it earn *coverage*. Both refusals are written against the same failure and both
 * say so — "the foreground is the reading surface, not where an artwork's color identity lives",
 * and "rewarding it for being chromatic is a documented failure mode ... an artwork's black or
 * white display type lost the role to a chromatic non-text region".
 *
 * The failure is real. The blanket refusal is not the only way to refuse it, and it is now
 * contradicted by the evidence it was drawn from: the premise "every treatment human review has
 * preferred carries its chromatic identity in the field and the accent while the text stays
 * near-neutral" no longer holds, and the coverage axis already records the counter-evidence in its
 * own comment rather than hiding it.
 *
 * `mark-bearing` replaces the blanket refusal with the test the objective already owns for exactly
 * this question. A foreground is mark-bearing when the treatment is **not simultaneously holding
 * materially better text in another of its roles** — `demotesBetterText`, the rule that withholds
 * authority from a non-foreground placement that demoted the artwork's text, asked about the role
 * that answers it. A chromatic non-text region that took the role from the artwork's display type
 * fails it, which is the regression class both refusals were written for; the artwork's own mark
 * colour passes it.
 *
 * `blanket` restores the previous behaviour exactly, in both consumers.
 */
export const FOREGROUND_MARK_ADMISSION: "blanket" | "mark-bearing" = "blanket"

/**
 * What counts as "better text" when `demotesBetterText` withholds a role's identity authority.
 *
 * The rule exists to stop the artwork's own text being moved out of the text role — the krafty
 * case, "the text of the artwork is Golden Mango, so the foreground of the palette should also be
 * golden mango". It implements that by comparing one family's `foregroundEvidence` against **the
 * foreground this treatment happened to choose**, and withholding authority whenever the former
 * wins by `identityForegroundClaimMargin`.
 *
 * Being better text than whatever a treatment chose is not the same as being the artwork's text.
 * Where the artwork's strongest text claim belongs to a *third* family the treatment does not use,
 * `raw-score` withholds authority from a family that would never have held the role under any
 * arrangement — it is not protecting a demotion, it is charging one role for the other role's
 * choice. Measured on `0d5cdb`: the red accent is the same colour, in the same role, with the same
 * credit in both the grey-foreground and gold-foreground arrangements, and it is authorized in one
 * and not the other; the family with the strongest text claim on that artwork is neither of them.
 *
 * `strongest-claim` keeps the whole rule and narrows what it protects to the claim it is about:
 * the greatest `foregroundEvidence` among the artwork's own obligation families under this
 * treatment's field. At most one claim can be the artwork's text, and a family that is not it
 * cannot be demoted out of a role it never had. krafty is unaffected — the golden mango carries
 * that artwork's strongest claim by a wide margin (0.9465, against 0.8132 for the next obligation),
 * so the guard still fires on every arrangement that moves it out of the foreground.
 *
 * `claimed` — fire only where the classifier's `requiredRole` is `"foreground"` — was designed,
 * implemented and **rejected on measurement**: it moved 10 of 141 artworks and reversed krafty
 * outright, because that classifier is *confidently undecided* there (`requiredRole` `"ambiguous"`
 * at confidence 0.902) while its foreground *score* is decisively the highest. `requiredRole` and
 * `foregroundEvidence` are two different outputs, and the guard reads the one that answers its
 * question. The option is kept rather than deleted so the measurement is reproducible.
 *
 * `raw-score` restores the previous behaviour exactly.
 */
export const TEXT_DEMOTION_EVIDENCE: "raw-score" | "claimed" | "strongest-claim" = "strongest-claim"

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
	foregroundEvidence?: number
}>

export type AlbumArtworkPaletteV2Phase3IdentityInput = Readonly<{
	obligations: ReadonlyArray<Readonly<{
		familyId: string
		priority: number
		/**
		 * The colour direction the obligation stands for (its family's prototype). Optional: an
		 * obligation without one can only ever be covered by its own family, which is the behaviour
		 * that existed before coverage became direction-aware.
		 */
		direction?: OKLab
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
	identityAuthorizedGain: number
	relationUtility: number
	/** See `FOREGROUND_MARK_ADMISSION`: does the artwork's evidence say the text role holds a mark. */
	markBearingForeground: boolean
	identityRoles: ReadonlyArray<Readonly<{
		familyId: string
		role: "foreground" | "accent" | "surface"
		credit: number
	}>>
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
	foregroundEvidence: number
}>

type NormalizedIdentity = Readonly<{
	obligations: ReadonlyArray<Readonly<{ familyId: string; priority: number; direction: OKLab | null }>>
	requiredRoleByFamilyField: ReadonlyMap<string, NormalizedRoleRequirement>
}>

function requirementKey(familyId: string, fieldHypothesisId: string): string {
	return `${familyId}\0${fieldHypothesisId}`
}

function isOKLab(value: OKLab | undefined): value is OKLab {
	return value !== undefined && value.length === 3 && value.every((component) => Number.isFinite(component))
}

function normalizedIdentity(identity: AlbumArtworkPaletteV2Phase3IdentityInput | undefined): NormalizedIdentity {
	const byFamily = new Map<string, number>()
	const directionByFamily = new Map<string, OKLab>()
	for (const obligation of identity?.obligations ?? []) {
		if (!Number.isFinite(obligation.priority) || obligation.familyId.length === 0) continue
		byFamily.set(obligation.familyId, Math.min(byFamily.get(obligation.familyId) ?? Infinity, obligation.priority))
		if (isOKLab(obligation.direction) && !directionByFamily.has(obligation.familyId)) {
			directionByFamily.set(obligation.familyId, obligation.direction)
		}
	}
	const requiredRoleByFamilyField = new Map<string, NormalizedRoleRequirement>()
	for (const requirement of identity?.roleRequirements ?? []) {
		if (requirement.fieldHypothesisId.length === 0) continue
		const key = requirementKey(requirement.familyId, requirement.fieldHypothesisId)
		if (requiredRoleByFamilyField.has(key)) continue
		requiredRoleByFamilyField.set(key, {
			requiredRole: requirement.requiredRole,
			confidence: clamp(Number.isFinite(requirement.confidence) ? requirement.confidence! : 1),
			foregroundEvidence: clamp(Number.isFinite(requirement.foregroundEvidence)
				? requirement.foregroundEvidence!
				: 0),
		})
	}
	return {
		obligations: [...byFamily]
			.map(([familyId, priority]) => ({
				familyId,
				priority,
				direction: directionByFamily.get(familyId) ?? null,
			}))
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
	color: OKLab,
): number {
	// The foreground is worth more identity credit than the accent because text is the most
	// present role — but that premium belongs to a family whose own evidence says "typography".
	// Without this gate the objective pays a chromatic family more for becoming the text than for
	// becoming the accent, which is how a vivid family displaces the artwork's real foreground.
	const chromaticWithoutForegroundEvidence = placedRole === "foreground" &&
		chromaOf(color) >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma &&
		requirement?.requiredRole !== "foreground"
	const baseline = placedRole === "foreground" && !chromaticWithoutForegroundEvidence
		? 1
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.accentIdentityCredit
	if (requirement === undefined || requirement.requiredRole === "ambiguous") return baseline
	const target = requirement.requiredRole === placedRole
		? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.roleMatchedIdentityCredit
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.roleMismatchedIdentityCredit
	return baseline + (target - baseline) * requirement.confidence
}

/**
 * Whether a placed colour carries an obligation's identity direction.
 *
 * An obligation is a claim that the artwork shows a colour; the family that raised the claim is
 * the evidence for it, not the claim itself. Colour families are formed by quantized OKLab
 * proximity, so one visible direction routinely arrives as two neighbouring families — one red
 * title can produce a core family and a brighter one. Testing coverage by family identity alone
 * therefore pays a palette nothing for showing the obligation's own colour, purely because the
 * pixels came from the neighbour, while paying in full for a colour this objective's *other*
 * statement — `identityDirections` — would refuse to count as a second direction at all. Those two
 * readings contradict each other, and this is the one that has never been argued for.
 *
 * Every condition below is a statement this objective already makes elsewhere, applied here for
 * the same reason it is made there. There is no new constant.
 *
 * 1. **A direction is chromatic.** `identityDirections` skips any credited colour under
 *    `identityDirectionChroma`, because "a neutral restates whatever the rest of the palette
 *    already says", and the obligation selector's neutral quota exists because material distance
 *    "cannot separate two greys that differ only in lightness". For a near-neutral obligation
 *    there is no direction for a substitute to be equivalent *about* — what separates two
 *    neutrals is lightness polarity, which the policy calls an *opposite* claim, not the same one.
 *    So equivalence is available to chromatic obligations only; a neutral obligation keeps the
 *    family test, which is the only evidence that can settle it.
 * 2. **At least as strong a statement of it.** `identityDirections` scores a direction by how
 *    saturated it is, "because a barely chromatic family is barely an identity direction". A
 *    washed-out or greyed version of the artwork's colour is therefore not that direction carried
 *    somewhere else, it is a weaker claim — measured on the corpus, this is what separates the
 *    substitutions that read as the same colour from the ones that read as a different, duller one
 *    (a pure grey standing in for gold, a pale yellow for a vivid one).
 * 3. **The same hue**, within `identityDirectionHueDegrees` — the window inside which this
 *    objective already refuses to count a second chromatic colour as its own direction.
 * 4. **Close enough to be one colour**, within `identityRoleSeparation` — the separation below
 *    which it already refuses to treat two roles as carrying distinct identity.
 */
function carriesIdentityDirection(color: OKLab, direction: OKLab): boolean {
	const directionChroma = chromaOf(direction)
	if (directionChroma < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma) return false
	if (chromaOf(color) < directionChroma) return false
	if (hueDifferenceDegrees(color, direction) >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionHueDegrees) return false
	return okDistance(color, direction) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityRoleSeparation
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

function chromaOf([, a, b]: OKLab): number {
	return Math.hypot(a, b)
}

function hueDifferenceDegrees(first: OKLab, second: OKLab): number {
	const difference = Math.abs(Math.atan2(first[2], first[1]) - Math.atan2(second[2], second[1])) * 180 / Math.PI
	return difference > 180 ? 360 - difference : difference
}

/**
 * How much distinct chromatic identity a set of credited colors carries. A direction has to be
 * chromatic — a neutral restates whatever the rest of the palette already says — and two colors of
 * the same hue are one direction however differently they are mixed, so a treatment cannot spend
 * two roles on one hue and be credited twice for it (the reviewer's `skap` note). Each surviving
 * direction counts in proportion to how saturated it is, because a barely chromatic family is
 * barely an identity direction.
 */
function identityDirections(
	credited: ReadonlyArray<Readonly<{ color: OKLab; credit: number }>>,
	established: readonly OKLab[],
): Readonly<{ strength: number; credit: number }> {
	const directions: OKLab[] = established.filter((color) =>
		chromaOf(color) >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma)
	let strength = 0
	let credit = 0
	for (const entry of credited) {
		if (chromaOf(entry.color) < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma) continue
		if (directions.some((direction) => hueDifferenceDegrees(direction, entry.color) <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionHueDegrees)) continue
		directions.push(entry.color)
		strength += clamp(chromaOf(entry.color) /
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionFullChroma)
		credit += entry.credit
	}
	return { strength, credit }
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
	authorizedGain: number
	markBearingForeground: boolean
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
	const distinctRoles = (first: OKLab, second: OKLab): boolean =>
		okDistance(first, second) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityRoleSeparation &&
		chromaticDistance(first, second) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityChromaticSeparation
	const identityBearingAccent = !treatment.collapse.accent &&
		distinctRoles(treatment.foreground.oklab, treatment.accent.oklab)
	// A surface that is a real second field color carries identity exactly as an accent does: the
	// artwork's family is on screen, in a role the treatment chose for it. The same distinctness
	// gate applies against the background, so a surface that only restates the background earns
	// nothing — that is the arrangement human review rejected on `meteora`.
	// ...and only when the surface is a chromatic direction in its own right. A surface that is
	// merely a lighter or darker shade of the field is a field variation, not a second identity the
	// artwork shows, and crediting those overrides field-ranking decisions that are not this
	// objective's to make.
	const identityBearingSurface = !treatment.collapse.surface &&
		distinctRoles(treatment.background.oklab, treatment.surface.oklab) &&
		chromaOf(treatment.surface.oklab) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma
	// Moving a family out of the foreground is a foreground claim by whatever replaces it, and it
	// has to be justified as one. Without this, a hue-novel family is worth more as an accent than
	// as the foreground — an incentive to demote the artwork's own text out of the text role, which
	// human review rejected on `krafty` ("the text of the artwork is Golden Mango, so the foreground
	// of the palette should also be golden mango"). Authority is therefore withheld from a
	// non-foreground placement whose family has materially stronger foreground evidence than the
	// family the treatment actually made its foreground.
	const foregroundEvidenceOf = (familyId: string): number => requiredRole(familyId)?.foregroundEvidence ?? 0
	const placedForegroundEvidence = foregroundEvidenceOf(treatment.familyRoles.foreground)
	// The strongest text claim the artwork itself makes, under this treatment's field. See
	// `TEXT_DEMOTION_EVIDENCE`: at most one obligation can be the artwork's text, and only that one
	// can be demoted out of the text role.
	const strongestTextClaim = obligations.reduce(
		(strongest, { familyId }) => Math.max(strongest, foregroundEvidenceOf(familyId)), 0)
	const demotesBetterText = (familyId: string): boolean => {
		if (TEXT_DEMOTION_EVIDENCE === "claimed" && requiredRole(familyId)?.requiredRole !== "foreground") return false
		if (TEXT_DEMOTION_EVIDENCE === "strongest-claim" && foregroundEvidenceOf(familyId) < strongestTextClaim) return false
		return foregroundEvidenceOf(familyId) > placedForegroundEvidence +
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityForegroundClaimMargin
	}
	// See `FOREGROUND_MARK_ADMISSION`. The same question `demotesBetterText` asks of a credited
	// non-foreground placement, asked of the role that answers it: is this treatment holding
	// materially better text somewhere other than the text role? Every family the treatment places
	// is asked, because the display type this guards can be sitting in any of them.
	// The predicate is computed unconditionally and published on the evaluation; each consumer
	// decides separately whether to read it, so the two admissions can be measured independently.
	const markBearingForeground = !(["background", "surface", "accent"] as const)
		.some((role) => demotesBetterText(treatment.familyRoles[role]))
	let numerator = 0
	const credited: Array<{ color: OKLab; credit: number }> = []
	const roles: Array<{ familyId: string; role: "foreground" | "accent" | "surface"; credit: number }> = []
	const credit = (
		familyId: string,
		role: "foreground" | "accent" | "surface",
		value: number,
		color: OKLab,
	): void => {
		const weight = priorityWeight(obligations.find((obligation) => obligation.familyId === familyId)!.priority)
		numerator += weight * value
		// The foreground used to be refused here outright, on the premise that every treatment human
		// review has preferred carries its chromatic identity in the field and the accent while the
		// text stays near-neutral. `FOREGROUND_MARK_ADMISSION` records why that premise no longer
		// holds and what replaces it: the foreground earns authority when the artwork's own evidence
		// says the colour in the text role is one of its marks, and not when it displaced better text.
		// Note the normalisation has always assumed otherwise — `achievableIdentityCredit` prices the
		// ceiling as "foreground and a distinct accent", so excluding the foreground from the
		// numerator left authority structurally at about half of what its own denominator expects.
		if ((role !== "foreground" || (FOREGROUND_MARK_ADMISSION === "mark-bearing" && markBearingForeground)) &&
			!demotesBetterText(familyId)) {
			credited.push({ color, credit: weight * value })
		}
		roles.push({ familyId, role, credit: value })
	}
	// The identity-bearing roles, in the order the objective has always preferred them: a family
	// that holds two of them is credited once, for the foreground.
	const slots: Array<Readonly<{
		role: "foreground" | "accent" | "surface"
		familyId: string
		color: OKLab
		creditOf: (requirement: NormalizedRoleRequirement | undefined) => number
	}>> = [
		{
			role: "foreground",
			familyId: treatment.familyRoles.foreground,
			color: treatment.foreground.oklab,
			creditOf: (requirement) => placementCredit(requirement, "foreground", treatment.foreground.oklab),
		},
		...identityBearingAccent
			? [{
				role: "accent" as const,
				familyId: treatment.familyRoles.accent,
				color: treatment.accent.oklab,
				creditOf: (requirement: NormalizedRoleRequirement | undefined) =>
					placementCredit(requirement, "accent", treatment.accent.oklab),
			}]
			: [],
		...identityBearingSurface
			? [{
				role: "surface" as const,
				familyId: treatment.familyRoles.surface,
				color: treatment.surface.oklab,
				creditOf: () => ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.surfaceIdentityCredit,
			}]
			: [],
	]
	const claimed = new Set<number>()
	const uncovered: typeof obligations[number][] = []
	// Pass one: the family that raised the obligation is occupying a role. This is the strongest
	// possible evidence that the palette shows the obligation's colour — the pixels came from that
	// family — so it is settled first and at full credit, exactly as before. Running it to
	// completion before any direction match means an equivalence can never displace an exact one.
	for (const obligation of obligations) {
		const index = slots.findIndex((slot, position) =>
			!claimed.has(position) && slot.familyId === obligation.familyId)
		if (index < 0) {
			uncovered.push(obligation)
			continue
		}
		claimed.add(index)
		const slot = slots[index]
		credit(obligation.familyId, slot.role, slot.creditOf(requiredRole(obligation.familyId)), slot.color)
	}
	// Pass two: an obligation no family of its own covers is still covered if the palette shows its
	// colour. The credit is the same credit the role would have earned for the obligation's own
	// family — role agreement, the chromatic-foreground gate and the priority weight all still
	// apply, because what changes here is only *which* colours count as showing the direction, not
	// what showing it is worth. Nearest slot wins so that a palette holding the direction twice
	// spends its closest role on it, and the role order breaks exact ties.
	//
	// The surface takes part in pass one and not in pass two. Pass one is a fact — the field
	// endpoint IS the obligation's family — while pass two is an inference about a colour the
	// endpoint does not own, and the surface is a *field* endpoint: allowing the inference there
	// lets the identity objective choose the field, which is the failure the comment on
	// `identityBearingSurface` already refuses ("crediting those overrides field-ranking decisions
	// that are not this objective's to make"). Measured, and the reason this is stated as a rule
	// rather than assumed: with the surface admitted, five of the eight moved artworks moved on a
	// surface substitution, two of them contradicting a strong human verdict — a gradient review
	// rejected as "pink and Bisque skin color which does not represent this artwork", and a
	// foreground the same batch endorsed — and not one of the five was an improvement. The
	// foreground and the accent are where an artwork's marks live, and a mark is what an obligation
	// is evidence of.
	for (const obligation of uncovered) {
		if (obligation.direction === null) continue
		const direction = obligation.direction
		let bestIndex = -1
		let bestDistance = Infinity
		for (const [position, slot] of slots.entries()) {
			if (claimed.has(position) || slot.role === "surface") continue
			if (!carriesIdentityDirection(slot.color, direction)) continue
			const distance = okDistance(slot.color, direction)
			if (distance < bestDistance) {
				bestDistance = distance
				bestIndex = position
			}
		}
		if (bestIndex < 0) continue
		claimed.add(bestIndex)
		const slot = slots[bestIndex]
		credit(obligation.familyId, slot.role, slot.creditOf(requiredRole(obligation.familyId)), slot.color)
	}
	const coverage = denominator === 0 ? 0 : clamp(numerator / denominator)
	// Authority is the only thing that lets the identity objective outweigh a larger quality
	// margin, and it is earned by one thing only: carrying distinct, genuinely chromatic identity
	// directions in the palette's roles. Coverage alone never earns it — a treatment that covers
	// obligations with neutrals, or spends two roles on one hue, gets the ordinary gain. Role
	// agreement deliberately does not grant authority: it is available to a palette that merely
	// repeats one direction, which is how the two-near-white `johns` treatment used to win.
	// Directions are counted against the whole palette, not just against each other: an accent that
	// repeats the hue the field already shows adds no identity, it restates it. This is the
	// reviewer's `skap` principle — two roles on one hue is paying twice for one direction.
	const creditedColors = new Set(credited.map(({ color }) => color))
	const established = ([
		treatment.background.oklab,
		treatment.surface.oklab,
		treatment.accent.oklab,
	] as const).filter((color) => !creditedColors.has(color))
	const directions = identityDirections(credited, established)
	const authority = clamp(directions.strength /
		Math.max(1, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionAuthorityTarget))
	// Only the coverage the chromatic directions themselves carry is authorized. Coverage earned by
	// a neutral role standing beside one chromatic role is ordinary coverage: it must not lend its
	// weight to the authority that lets identity overturn a quality margin.
	const authorizedCoverage = denominator === 0 ? 0 : clamp(directions.credit / denominator)
	const authorizedGain = authorizedCoverage *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.authorizedIdentityGain * authority
	return {
		coverage,
		gain: coverage * ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain + authorizedGain,
		authorizedGain,
		markBearingForeground,
		roles,
	}
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
		identityAuthorizedGain: identity.authorizedGain,
		relationUtility: utility + identity.gain,
		markBearingForeground: identity.markBearingForeground,
		identityRoles: identity.roles,
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
	/**
	 * `unique` is already in `compareEvaluations` order, because `allEvaluations` was sorted
	 * before de-duplication and first-wins preserves that order.
	 *
	 * This used to run an O(n²) quality-dominance pass (up to 1,500 unique evaluations, so ~2.2 M
	 * comparisons over 9 axes) plus a sort of each candidate's dominator list, to populate
	 * `paretoMember` / `dominatedByKey`. Neither field was ever read: `winner-scoring.ts` builds
	 * its own frontier from its own 11-axis `dominates` and initialises both fields afresh. The
	 * pass's only other effect was an assertion that the wave-1 frontier is non-empty, which has
	 * never fired; the winner stage still asserts the same property on the frontier it actually uses.
	 */
	const evaluations = [...uniqueByKey.values()]
	return { evaluations }
}
