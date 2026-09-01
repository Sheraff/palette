import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY,
	selectAlbumArtworkPaletteV2Phase3Treatments,
} from "./album-artwork-palette-v2-phase-3-selector.ts"
import type {
	AlbumArtworkPaletteV2Phase3IdentityInput,
	AlbumArtworkPaletteV2Phase3SelectorEvaluation,
} from "./album-artwork-palette-v2-phase-3-selector.ts"
import {
	albumArtworkPaletteV2Phase3SelectorV2Quality,
} from "./album-artwork-palette-v2-phase-3-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
} from "./album-artwork-palette-v2-phase-3-selector-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID =
	"album-artwork-palette-v2-phase-3-recovery-quality-selector-v2" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES = [
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"sourceSupport",
	"renderedGradientSalience",
	"foregroundPath",
	"accentFidelity",
	"accentPath",
	"coherence",
	"economy",
] as const

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis =
	typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES[number]

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY = Object.freeze({
	evidenceResolution: 0.04,
	utilityResolution: 0.005,
	maximumIdentityGain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain,
	maximumSlateDiversityGain: 0.03,
	maximumSlateQualityLoss: 0.12,
	maximumSlateTreatments: 8,
	nearColorDistance: 0.025,
	materialColorDistance: 0.04,
	qualityWeights: Object.freeze({
		fieldFidelity: 0.15,
		surfaceFidelity: 0.06,
		artworkIdentity: 0.11,
		representativeness: 0.10,
		sourceSupport: 0.10,
		renderedGradientSalience: 0.08,
		foregroundPath: 0.15,
		accentFidelity: 0.06,
		accentPath: 0.08,
		coherence: 0.06,
		economy: 0.05,
	}),
} as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_FORMULAS = Object.freeze({
	dominance:
		"all eleven 0.04 quality levels are non-worse and at least one is better; identity is excluded",
	gradientExpectation:
		"an earned rendered gradient applies to the same ordered background/surface families and rendered endpoint hexes across field hypotheses",
	renderedGradientSalience:
		"not-applicable, missing, and unearned are 0; earned-rendered uses the reusable endpoint/evidence salience",
	qualityUtility:
		"0.15*fieldFidelity + 0.06*surfaceFidelity + 0.11*artworkIdentity + 0.10*representativeness + 0.10*sourceSupport + 0.08*renderedGradientSalience + 0.15*foregroundPath + 0.06*accentFidelity + 0.08*accentPath + 0.06*coherence + 0.05*economy",
	identityGain:
		"reuse Wave 1 priority-weighted family-role coverage as an ordering gain bounded at 0.05",
	ordering:
		"quality frontier by descending 0.005 level of quality utility plus bounded identity gain, then quality utility, identity gain, leximin quality, declared quality axes, and canonical/structural keys",
	slate:
		"consider the full quality frontier within 0.12 quality utility of the winner; retain visually distinct field rendering, foreground, accent, structure, or identity novelty up to 8",
})

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality = Readonly<
	Record<AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis, number>
>

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation = Readonly<{
	key: string
	structuralKey: string
	treatment: CompletePaletteTreatment
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	quality: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
	evidenceLevels: Readonly<Record<AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis, number>>
	qualityUtility: number
	identityCoverage: number
	identityGain: number
	identityRoles: AlbumArtworkPaletteV2Phase3SelectorEvaluation["identityRoles"]
	relationUtility: number
	paretoMember: boolean
	dominatedByKey: string | null
}>

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateDimension =
	"field-rendering" | "foreground" | "accent" | "structure" | "identity"

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateEntry = Readonly<{
	key: string
	index: number
	qualityUtility: number
	identityGain: number
	relationUtility: number
	diversityGain: number
	slateUtility: number
	novelDimensions: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateDimension[]
	reasons: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2EvaluationDiagnostic = Readonly<
	Omit<AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation, "treatment" | "identityRoles"> & {
		identityRoles: AlbumArtworkPaletteV2Phase3SelectorEvaluation["identityRoles"]
	}
>

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_FORMULAS
	domain: Readonly<{
		materializedTreatmentCount: number
		uniqueTreatmentCount: number
		duplicateTreatmentCount: number
		paretoTreatmentCount: number
		dominatedTreatmentCount: number
		earnedGradientClaimCount: number
	}>
	qualityAxes: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
	paretoKeys: readonly string[]
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2EvaluationDiagnostic[]
	winner: Readonly<{
		key: string
		gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
		qualityUtility: number
		identityCoverage: number
		identityGain: number
		relationUtility: number
		reasons: readonly string[]
	}>
	slate: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateEntry[]
}>

export type AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[]
	explanation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.evidenceResolution)
}

function utilityLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.utilityResolution)
}

function colorDistance(first: PaletteRoleColor, second: PaletteRoleColor): number {
	return Math.hypot(
		first.oklab[0] - second.oklab[0],
		first.oklab[1] - second.oklab[1],
		first.oklab[2] - second.oklab[2],
	)
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function renderedFieldClaimKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.background.hex.toLowerCase(),
		treatment.surface.hex.toLowerCase(),
	].join("\0")
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

function qualityUtility(quality: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality): number {
	return ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES.reduce((sum, axis) =>
		sum + ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights[axis] *
			quality[axis], 0)
}

function evaluateTreatment(
	wave1: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	gradientExpected: boolean,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation {
	const reusable = albumArtworkPaletteV2Phase3SelectorV2Quality(wave1.treatment, gradientExpected)
	const quality: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality = {
		fieldFidelity: wave1.quality.fieldFidelity,
		surfaceFidelity: wave1.quality.surfaceFidelity,
		artworkIdentity: wave1.quality.artworkIdentity,
		representativeness: wave1.quality.representativeness,
		sourceSupport: reusable.quality.sourceSupport,
		renderedGradientSalience: reusable.gradientStatus === "earned-rendered"
			? reusable.quality.renderedGradientSalience
			: 0,
		foregroundPath: reusable.quality.foregroundPath,
		accentFidelity: wave1.quality.accentFidelity,
		accentPath: reusable.quality.accentPath,
		coherence: wave1.quality.coherence,
		economy: wave1.quality.economy,
	}
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite recovery quality axis ${axis}`)
	}
	const utility = qualityUtility(quality)
	return {
		key: wave1.key,
		structuralKey: treatmentStructuralKey(wave1.treatment),
		treatment: wave1.treatment,
		gradientStatus: reusable.gradientStatus,
		quality,
		evidenceLevels: Object.fromEntries(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES.map((axis) =>
				[axis, evidenceLevel(quality[axis])]),
		) as Record<AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis, number>,
		qualityUtility: utility,
		identityCoverage: wave1.identityCoverage,
		identityGain: wave1.identityGain,
		identityRoles: wave1.identityRoles,
		relationUtility: utility + wave1.identityGain,
		paretoMember: false,
		dominatedByKey: null,
	}
}

function dominates(
	first: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	second: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
): boolean {
	let strictlyBetter = false
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

function compareEvaluations(
	first: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	second: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
): number {
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility)) ||
		compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility)) ||
		compareDescending(first.identityGain, second.identityGain)
	if (comparison !== 0) return comparison
	const firstLevels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
		.map((axis) => first.evidenceLevels[axis]).sort((left, right) => left - right)
	const secondLevels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
		.map((axis) => second.evidenceLevels[axis]).sort((left, right) => left - right)
	for (let index = 0; index < firstLevels.length; index++) {
		comparison = compareDescending(firstLevels[index], secondLevels[index])
		if (comparison !== 0) return comparison
	}
	for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES) {
		comparison = compareDescending(first.evidenceLevels[axis], second.evidenceLevels[axis])
		if (comparison !== 0) return comparison
	}
	return compareAscii(first.key, second.key) || compareAscii(first.structuralKey, second.structuralKey)
}

function visuallyNear(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): boolean {
	if (gradientRenderingKey(first) !== gradientRenderingKey(second)) return false
	return (["background", "surface", "foreground", "accent"] as const).every((role) =>
		colorDistance(first[role], second[role]) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.nearColorDistance)
}

function similarRole(
	candidate: CompletePaletteTreatment,
	selected: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[],
	role: "foreground" | "accent",
): boolean {
	return selected.some(({ treatment }) => {
		if (role === "accent" && candidate.collapse.accent !== treatment.collapse.accent) return false
		return candidate.familyRoles[role] === treatment.familyRoles[role] &&
			colorDistance(candidate[role], treatment[role]) <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.materialColorDistance
	})
}

function novelty(
	candidate: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	selected: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[],
): Readonly<{
	dimensions: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateDimension[]
	gain: number
}> {
	const treatment = candidate.treatment
	const dimensions: AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateDimension[] = []
	const similarField = selected.some(({ treatment: existing }) =>
		existing.familyRoles.background === treatment.familyRoles.background &&
		existing.familyRoles.surface === treatment.familyRoles.surface &&
		gradientRenderingKey(existing) === gradientRenderingKey(treatment) &&
		Math.max(
			colorDistance(existing.background, treatment.background),
			colorDistance(existing.surface, treatment.surface),
		) < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.materialColorDistance)
	if (!similarField) dimensions.push("field-rendering")
	if (!similarRole(treatment, selected, "foreground")) dimensions.push("foreground")
	if (!similarRole(treatment, selected, "accent")) dimensions.push("accent")
	const structure = [
		treatment.fieldTreatment,
		treatment.collapse.surface,
		treatment.collapse.accent,
		treatment.cardinality,
	].join(":")
	if (!selected.some(({ treatment: existing }) => [
		existing.fieldTreatment,
		existing.collapse.surface,
		existing.collapse.accent,
		existing.cardinality,
	].join(":") === structure)) dimensions.push("structure")
	const coveredIdentity = new Set(selected.flatMap(({ identityRoles }) =>
		identityRoles.map(({ familyId, role }) => `${familyId}\0${role}`)))
	if (candidate.identityRoles.some(({ familyId, role }) => !coveredIdentity.has(`${familyId}\0${role}`))) {
		dimensions.push("identity")
	}
	return {
		dimensions,
		gain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateDiversityGain *
			dimensions.length / 5,
	}
}

function selectSlate(
	frontier: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[],
): Readonly<{
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[]
	explanation: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateEntry[]
}> {
	const winner = frontier[0]
	const selected = [winner]
	const explanation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateEntry[] = [{
		key: winner.key,
		index: 0,
		qualityUtility: winner.qualityUtility,
		identityGain: winner.identityGain,
		relationUtility: winner.relationUtility,
		diversityGain: 0,
		slateUtility: winner.relationUtility,
		novelDimensions: [],
		reasons: ["winner-first"],
	}]
	while (selected.length <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateTreatments) {
		const next = frontier.filter((candidate) =>
			!selected.includes(candidate) &&
			candidate.qualityUtility >= winner.qualityUtility -
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss &&
			!selected.some(({ treatment }) => visuallyNear(treatment, candidate.treatment)))
			.map((candidate) => {
				const diversity = novelty(candidate, selected)
				return {
					candidate,
					diversity,
					slateUtility: candidate.relationUtility + diversity.gain,
				}
			})
			.filter(({ diversity }) => diversity.dimensions.length > 0)
			.sort((first, second) =>
				compareDescending(utilityLevel(first.slateUtility), utilityLevel(second.slateUtility)) ||
				compareEvaluations(first.candidate, second.candidate))[0]
		if (!next) break
		selected.push(next.candidate)
		explanation.push({
			key: next.candidate.key,
			index: selected.length - 1,
			qualityUtility: next.candidate.qualityUtility,
			identityGain: next.candidate.identityGain,
			relationUtility: next.candidate.relationUtility,
			diversityGain: next.diversity.gain,
			slateUtility: next.slateUtility,
			novelDimensions: next.diversity.dimensions,
			reasons: [
				"quality-bounded-frontier-member",
				...next.diversity.dimensions.map((dimension) => `novel-${dimension}`),
			],
		})
	}
	return { evaluations: selected, explanation }
}

export function selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
	treatments: readonly CompletePaletteTreatment[],
	identity?: AlbumArtworkPaletteV2Phase3IdentityInput,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection {
	if (treatments.length === 0) throw new RangeError("The recovery complete-treatment domain is empty")
	const orderedTreatments = [...treatments].sort((first, second) =>
		compareAscii(treatmentStructuralKey(first), treatmentStructuralKey(second)))
	const wave1 = selectAlbumArtworkPaletteV2Phase3Treatments(orderedTreatments, identity)
	const earnedGradientClaims = new Set(orderedTreatments.filter((treatment) =>
		albumArtworkPaletteV2Phase3SelectorV2Quality(treatment).gradientStatus === "earned-rendered")
		.map(renderedFieldClaimKey))
	const rawEvaluations = wave1.evaluations.map((evaluation) => evaluateTreatment(
		evaluation,
		earnedGradientClaims.has(renderedFieldClaimKey(evaluation.treatment)),
	)).sort(compareEvaluations)
	const evaluations = rawEvaluations.map((evaluation):
		AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation => {
		const dominators = rawEvaluations.filter((candidate) =>
			candidate !== evaluation && dominates(candidate, evaluation)).sort(compareEvaluations)
		return {
			...evaluation,
			paretoMember: dominators.length === 0,
			dominatedByKey: dominators[0]?.key ?? null,
		}
	}).sort(compareEvaluations)
	const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compareEvaluations)
	if (frontier.length === 0) throw new Error("The recovery quality frontier is empty")
	const winner = frontier[0]
	const slate = selectSlate(frontier)
	const reasons = [
		"non-dominated-on-quantized-recovery-quality",
		"maximum-quality-plus-bounded-family-identity",
		...winner.identityGain > 0 ? ["bounded-wave-1-family-identity-gain"] : [],
		...winner.gradientStatus === "earned-rendered" ? ["earned-rendered-gradient-salience"] : [],
	]
	const diagnosticEvaluations = evaluations.map(({ treatment: _treatment, ...evaluation }) => evaluation)
	return {
		winner: winner.treatment,
		slate: slate.evaluations.map(({ treatment }) => treatment),
		evaluations,
		explanation: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_FORMULAS,
			domain: {
				materializedTreatmentCount: treatments.length,
				uniqueTreatmentCount: evaluations.length,
				duplicateTreatmentCount: treatments.length - evaluations.length,
				paretoTreatmentCount: frontier.length,
				dominatedTreatmentCount: evaluations.length - frontier.length,
				earnedGradientClaimCount: earnedGradientClaims.size,
			},
			qualityAxes: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES,
			paretoKeys: frontier.map(({ key }) => key),
			evaluations: diagnosticEvaluations,
			winner: {
				key: winner.key,
				gradientStatus: winner.gradientStatus,
				qualityUtility: winner.qualityUtility,
				identityCoverage: winner.identityCoverage,
				identityGain: winner.identityGain,
				relationUtility: winner.relationUtility,
				reasons,
			},
			slate: slate.explanation,
		},
	}
}
