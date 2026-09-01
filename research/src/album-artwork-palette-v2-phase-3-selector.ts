import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
} from "./album-artwork-palette-v2.ts"
import type { AlbumArtworkPaletteV2Phase3AttemptAdapter } from "./album-artwork-palette-v2-phase-3-contract.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION =
	"album-artwork-palette-v2-phase-3-relation-pareto-selector-wave-1" as const

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
	maximumSlateDiversityGain: 0.03,
	maximumSlateTreatments: 8,
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

export type AlbumArtworkPaletteV2Phase3IdentityInput = Readonly<{
	obligations: ReadonlyArray<Readonly<{
		familyId: string
		priority: number
	}>>
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

export type AlbumArtworkPaletteV2Phase3SelectorSlateExplanation = Readonly<{
	key: string
	index: number
	qualityUtility: number
	identityGain: number
	relationUtility: number
	diversityGain: number
	slateUtility: number
	novelDimensions: readonly ("field" | "foreground" | "accent" | "structure" | "identity")[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorExplanation = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION
	formulas: Readonly<{
		dominance: string
		foregroundPathUtility: string
		accentPathUtility: string
		qualityUtility: string
		identityGain: string
		ordering: string
		slateUtility: string
	}>
	domain: Readonly<{
		rawTreatmentCount: number
		uniqueTreatmentCount: number
		duplicateTreatmentCount: number
		paretoTreatmentCount: number
		dominatedTreatmentCount: number
	}>
	qualityAxes: readonly AlbumArtworkPaletteV2Phase3SelectorQualityAxis[]
	paretoKeys: readonly string[]
	winner: Readonly<{
		key: string
		qualityUtility: number
		identityCoverage: number
		identityGain: number
		relationUtility: number
		reasons: readonly string[]
	}>
	slate: readonly AlbumArtworkPaletteV2Phase3SelectorSlateExplanation[]
}>

export type AlbumArtworkPaletteV2Phase3SelectorSelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	evaluations: readonly AlbumArtworkPaletteV2Phase3SelectorEvaluation[]
	explanation: AlbumArtworkPaletteV2Phase3SelectorExplanation
}>

export type AlbumArtworkPaletteV2Phase3SelectorResult = Readonly<
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & {
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3Selector: AlbumArtworkPaletteV2Phase3SelectorExplanation
		}>
	}
>

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

function normalizedObligations(identity: AlbumArtworkPaletteV2Phase3IdentityInput | undefined): Array<{
	familyId: string
	priority: number
}> {
	const byFamily = new Map<string, number>()
	for (const obligation of identity?.obligations ?? []) {
		if (!Number.isFinite(obligation.priority) || obligation.familyId.length === 0) continue
		byFamily.set(obligation.familyId, Math.min(byFamily.get(obligation.familyId) ?? Infinity, obligation.priority))
	}
	return [...byFamily].map(([familyId, priority]) => ({ familyId, priority }))
		.sort((first, second) => first.priority - second.priority ||
			compareAscii(first.familyId, second.familyId))
}

function identityEvaluation(
	treatment: CompletePaletteTreatment,
	obligations: readonly Readonly<{ familyId: string; priority: number }>[],
): Readonly<{
	coverage: number
	gain: number
	roles: AlbumArtworkPaletteV2Phase3SelectorEvaluation["identityRoles"]
}> {
	const maximumPriority = Math.max(0, ...obligations.map(({ priority }) => priority))
	const priorityWeight = (priority: number): number => Math.max(0, maximumPriority - priority + 1)
	const denominator = obligations.reduce((sum, { priority }) => sum + priorityWeight(priority), 0)
	let numerator = 0
	const roles: Array<{ familyId: string; role: "foreground" | "accent"; credit: number }> = []
	for (const obligation of obligations) {
		const weight = priorityWeight(obligation.priority)
		if (treatment.familyRoles.foreground === obligation.familyId) {
			numerator += weight
			roles.push({ familyId: obligation.familyId, role: "foreground", credit: 1 })
		} else if (!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId) {
			const credit = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.accentIdentityCredit
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
	obligations: readonly Readonly<{ familyId: string; priority: number }>[],
): AlbumArtworkPaletteV2Phase3SelectorEvaluation {
	const quality = albumArtworkPaletteV2Phase3SelectorQuality(treatment)
	for (const axis of QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite selector quality axis ${axis}`)
	}
	const identity = identityEvaluation(treatment, obligations)
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

function colorDistance(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
	role: "background" | "surface" | "foreground" | "accent",
): number {
	return Math.hypot(
		first[role].oklab[0] - second[role].oklab[0],
		first[role].oklab[1] - second[role].oklab[1],
		first[role].oklab[2] - second[role].oklab[2],
	)
}

function visuallyNear(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	return first.gradient === second.gradient &&
		(["background", "surface", "foreground", "accent"] as const)
			.every((role) => colorDistance(first, second, role) < 0.025)
}

function novelty(
	candidate: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	selected: readonly AlbumArtworkPaletteV2Phase3SelectorEvaluation[],
): Readonly<{
	gain: number
	dimensions: readonly ("field" | "foreground" | "accent" | "structure" | "identity")[]
}> {
	if (selected.length === 0) return { gain: 0, dimensions: [] }
	const treatment = candidate.treatment
	const field = `${treatment.background.hex}:${treatment.surface.hex}:${treatment.gradient ? "gradient" : "flat"}`
	const accent = treatment.collapse.accent ? "=" : treatment.accent.hex
	const structure = `${treatment.fieldTreatment}:${treatment.collapse.surface}:${treatment.collapse.accent}`
	const dimensions: Array<"field" | "foreground" | "accent" | "structure" | "identity"> = []
	if (!selected.some(({ treatment: value }) =>
		`${value.background.hex}:${value.surface.hex}:${value.gradient ? "gradient" : "flat"}` === field)) {
		dimensions.push("field")
	}
	if (!selected.some(({ treatment: value }) => value.foreground.hex === treatment.foreground.hex)) {
		dimensions.push("foreground")
	}
	if (!selected.some(({ treatment: value }) => (value.collapse.accent ? "=" : value.accent.hex) === accent)) {
		dimensions.push("accent")
	}
	if (!selected.some(({ treatment: value }) =>
		`${value.fieldTreatment}:${value.collapse.surface}:${value.collapse.accent}` === structure)) {
		dimensions.push("structure")
	}
	if (candidate.identityRoles.some(({ familyId, role }) => !selected.some((evaluation) =>
		evaluation.identityRoles.some((existing) => existing.familyId === familyId && existing.role === role)))) {
		dimensions.push("identity")
	}
	return {
		gain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumSlateDiversityGain *
			dimensions.length / 5,
		dimensions,
	}
}

function selectSlate(
	frontier: readonly AlbumArtworkPaletteV2Phase3SelectorEvaluation[],
): Readonly<{
	evaluations: readonly AlbumArtworkPaletteV2Phase3SelectorEvaluation[]
	explanations: readonly AlbumArtworkPaletteV2Phase3SelectorSlateExplanation[]
}> {
	const selected = [frontier[0]]
	const explanations: AlbumArtworkPaletteV2Phase3SelectorSlateExplanation[] = [{
		key: frontier[0].key,
		index: 0,
		qualityUtility: frontier[0].qualityUtility,
		identityGain: frontier[0].identityGain,
		relationUtility: frontier[0].relationUtility,
		diversityGain: 0,
		slateUtility: frontier[0].relationUtility,
		novelDimensions: [],
	}]
	const remaining = frontier.slice(1)
	while (selected.length < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumSlateTreatments) {
		const candidates = remaining
			.filter((candidate) => !selected.includes(candidate) &&
				!selected.some(({ treatment }) => visuallyNear(treatment, candidate.treatment)))
			.map((candidate) => {
				const diversity = novelty(candidate, selected)
				return { candidate, diversity, slateUtility: candidate.relationUtility + diversity.gain }
			})
			.sort((first, second) => compareDescending(
				utilityLevel(first.slateUtility),
				utilityLevel(second.slateUtility),
			) ||
				compareEvaluations(first.candidate, second.candidate))
		const next = candidates[0]
		if (!next) break
		selected.push(next.candidate)
		explanations.push({
			key: next.candidate.key,
			index: selected.length - 1,
			qualityUtility: next.candidate.qualityUtility,
			identityGain: next.candidate.identityGain,
			relationUtility: next.candidate.relationUtility,
			diversityGain: next.diversity.gain,
			slateUtility: next.slateUtility,
			novelDimensions: next.diversity.dimensions,
		})
	}
	return { evaluations: selected, explanations }
}

export function selectAlbumArtworkPaletteV2Phase3Treatments(
	treatments: readonly CompletePaletteTreatment[],
	identity?: AlbumArtworkPaletteV2Phase3IdentityInput,
): AlbumArtworkPaletteV2Phase3SelectorSelection {
	if (treatments.length === 0) throw new RangeError("The complete treatment domain is empty")
	const obligations = normalizedObligations(identity)
	const allEvaluations = treatments.map((treatment) => evaluateTreatment(treatment, obligations))
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
	const winner = frontier[0]
	const relationTies = frontier.filter(({ relationUtility }) =>
		utilityLevel(relationUtility) === utilityLevel(winner.relationUtility))
	const reasons = [
		"non-dominated-on-quantized-complete-quality-relation",
		winner.identityGain > 0
			? "maximized-quality-plus-bounded-source-role-identity"
			: "maximized-complete-quality-utility",
		...relationTies.length > 1 ? ["canonical-treatment-order-resolved-exact-relation-tie"] : [],
	]
	const slate = selectSlate(frontier)
	const explanation: AlbumArtworkPaletteV2Phase3SelectorExplanation = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
		formulas: {
			dominance: "identity coverage and all nine generated-penalty-adjusted 0.04 quality levels >= and at least one >",
			foregroundPathUtility: "sqrt(foregroundUtility * nonzeroForegroundPathFraction) - generatedPenalty",
			accentPathUtility: "sqrt(accentUtility * nonzeroAccentPathFraction) - generatedPenalty; collapsed accent shares foreground path",
			qualityUtility: "0.16*fieldFidelity + 0.06*surfaceFidelity + 0.12*artworkIdentity + 0.12*representativeness + 0.19*foregroundPathUtility + 0.07*accentFidelity + 0.10*accentPathUtility + 0.09*coherence + 0.09*economy",
			identityGain: "min(0.05, 0.05*priorityWeightedRoleCoverage); foreground credit 1, distinct accent credit 0.8",
			ordering: "descending 0.005 relation-utility level, quality-utility level, identity coverage, leximin quality levels, declared quality levels, canonical treatment order",
			slateUtility: "relationUtility + at most 0.03 for new field, foreground, accent, structure, and source-role identity dimensions",
		},
		domain: {
			rawTreatmentCount: treatments.length,
			uniqueTreatmentCount: unique.length,
			duplicateTreatmentCount: treatments.length - unique.length,
			paretoTreatmentCount: frontier.length,
			dominatedTreatmentCount: unique.length - frontier.length,
		},
		qualityAxes: QUALITY_AXES,
		paretoKeys: frontier.map(({ key }) => key),
		winner: {
			key: winner.key,
			qualityUtility: winner.qualityUtility,
			identityCoverage: winner.identityCoverage,
			identityGain: winner.identityGain,
			relationUtility: winner.relationUtility,
			reasons,
		},
		slate: slate.explanations,
	}
	return {
		winner: winner.treatment,
		slate: slate.evaluations.map(({ treatment }) => treatment),
		evaluations,
		explanation,
	}
}

export function extractAlbumArtworkPaletteV2Phase3SelectorDetails(
	image: RawImage,
): Readonly<{
	result: AlbumArtworkPaletteV2Phase3SelectorResult
	selection: AlbumArtworkPaletteV2Phase3SelectorSelection
}> {
	const closed = extractAlbumArtworkPaletteV2074Details(image)
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(
		closed.audit.candidate.completeTreatments,
		closed.result.diagnostics.identityObligationGraph,
	)
	return {
		selection,
		result: {
			...closed.result,
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
			winner: selection.winner,
			alternatives: selection.slate,
			diagnostics: {
				...closed.result.diagnostics,
				phase3Selector: selection.explanation,
			},
		},
	}
}

export function extractAlbumArtworkPaletteV2Phase3Selector(image: RawImage): AlbumArtworkPaletteV2Phase3SelectorResult {
	return extractAlbumArtworkPaletteV2Phase3SelectorDetails(image).result
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_ATTEMPT: AlbumArtworkPaletteV2Phase3AttemptAdapter =
	Object.freeze({
		identity: Object.freeze({
			attemptId: "deterministic-relation-pareto-wave-1",
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
		}),
		extract: extractAlbumArtworkPaletteV2Phase3Selector,
	})
