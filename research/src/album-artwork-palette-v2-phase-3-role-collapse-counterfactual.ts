import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	RecallAuditTreatmentLineage,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_ID =
	"album-artwork-palette-v2-phase-3-role-collapse-counterfactual-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_SCORE_AXES = [
	"fieldFidelity",
	"surfaceFidelity",
	"fieldStructure",
	"fieldIdentity",
	"treatmentFoundation",
	"activeRolePathObservability",
	"artworkIdentity",
	"representativeness",
	"uiUtility",
	"foregroundUtility",
	"foregroundPolarityAgreement",
	"accentFidelity",
	"accentUtility",
	"coherence",
	"economy",
	"generatorConfidence",
	"foundation",
	"balance",
	"generatedPenalty",
	"rankingScore",
] as const satisfies readonly (keyof CompletePaletteScores)[]

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_RECOVERY_QUALITY_AXES = [
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
] as const satisfies readonly (keyof AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality)[]

const ROLES = ["background", "surface", "foreground", "accent"] as const
const COLLAPSE_ROLES = ["accent", "surface"] as const

type Role = typeof ROLES[number]

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole =
	typeof COLLAPSE_ROLES[number]

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding = Readonly<{
	sourceType?: string
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualDescriptor = Readonly<{
	sourceType?: string
	treatment?: CompletePaletteTreatment
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	lineages?: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding[]
	descriptors?: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualDescriptor[]
	logicalDescriptors?: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualDescriptor[]
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation = Readonly<{
	key: string
	quality: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
	qualityUtility: number
	identityCoverage: number
	identityGain: number
	relationUtility: number
	paretoMember: boolean
	dominatedByKey: string | null
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation = Readonly<{
	id: string
	familyId: string
	fieldHypothesisId?: string
	requiredRole?: "foreground" | "accent" | "ambiguous"
	priority?: number
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput = Readonly<{
	candidates: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate[]
	recoveryEvaluations: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation[]
	obligations?: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation[]
	selection: Readonly<{
		winnerKey: string
		slateKeys: readonly string[]
	}>
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric = Readonly<{
	distinct: number
	collapsed: number
	delta: number
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualPair = Readonly<{
	id: string
	role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole
	distinctKey: string
	collapsedKey: string
	match: Readonly<{
		fieldHypothesisId: string
		fieldTreatment: string
		topology: string
		direction: string | null
		sourceType: string | null
		lineageSourceConnected: boolean
		sharedRepresentativeRoles: readonly Role[]
		representativeMatch: true
		lineageMatch: true
		sourceSupportMatch: true
	}>
	optionalRole: Readonly<{
		distinct: Readonly<{
			familyId: string
			hex: string
			strategy: string
			sourceConnected: boolean
		}>
		collapsedInto: "background" | "foreground"
	}>
	scores: Readonly<{
		distinct: CompletePaletteScores
		collapsed: CompletePaletteScores
		delta: Readonly<Record<keyof CompletePaletteScores, number>>
	}>
	recovery: Readonly<{
		quality: Readonly<{
			distinct: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
			collapsed: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
			delta: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
		}>
		qualityUtility: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		identityCoverage: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		identityGain: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		relationUtility: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		pareto: Readonly<{
			distinctMember: boolean
			collapsedMember: boolean
			distinctDominatedByKey: string | null
			collapsedDominatedByKey: string | null
		}>
	}>
	cost: Readonly<{
		convention: "collapsed-minus-distinct; positive values are costs of retaining the distinct role"
		representativeness: number
		sourceSupport: number
	}>
	pathAndCoherence: Readonly<{
		foregroundPath: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		accentPath: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
		coherence: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric
	}>
	obligations: Readonly<{
		entries: ReadonlyArray<Readonly<{
			id: string
			familyId: string
			fieldHypothesisId: string | null
			requiredRole: "foreground" | "accent" | "ambiguous" | null
			priority: number | null
			applicable: boolean
			distinctCovered: boolean
			collapsedCovered: boolean
			delta: -1 | 0 | 1
		}>>
		distinctCoveredIds: readonly string[]
		collapsedCoveredIds: readonly string[]
		gainedByDistinctIds: readonly string[]
		lostByDistinctIds: readonly string[]
	}>
	selectionPresence: Readonly<{
		distinct: Readonly<{ winner: boolean; slate: boolean; slateIndex: number | null }>
		collapsed: Readonly<{ winner: boolean; slate: boolean; slateIndex: number | null }>
	}>
}>

export type AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualReport = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_ID
	mode: "diagnostic-only"
	deltaConvention: "distinct-minus-collapsed"
	counts: Readonly<{
		candidateCount: number
		recoveryEvaluationCount: number
		exactPairCount: number
		accentPairCount: number
		surfacePairCount: number
	}>
	selection: Readonly<{
		observedWinnerKey: string
		observedSlateKeys: readonly string[]
	}>
	selectionDeltas: Readonly<{
		winner: 0
		slate: 0
		discovery: 0
		materialization: 0
		runtimeInference: 0
	}>
	pairs: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualPair[]
}>

type PreparedCandidate = Readonly<{
	candidate: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate
	evaluation: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation
	lineagesByRole: Readonly<Record<
		AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
		ReadonlyMap<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding>
	>>
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function stableIdentity(value: unknown, stack = new Set<object>()): string {
	if (value === null) return "null"
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Counterfactual diagnostics require finite numbers")
		return Object.is(value, -0) ? "0" : JSON.stringify(value)
	}
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
	if (typeof value === "undefined") return "undefined"
	if (typeof value !== "object") throw new TypeError("Counterfactual diagnostics require JSON-like evidence")
	if (stack.has(value)) throw new TypeError("Counterfactual diagnostics do not accept circular evidence")
	stack.add(value)
	const identity = Array.isArray(value)
		? `[${value.map((entry) => stableIdentity(entry, stack)).join(",")}]`
		: `{${Object.entries(value as Readonly<Record<string, unknown>>)
			.sort(([first], [second]) => compareAscii(first, second))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableIdentity(entry, stack)}`)
			.join(",")}}`
	stack.delete(value)
	return identity
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareAscii)
}

function roleBindingIdentity(treatment: CompletePaletteTreatment, role: Role): string {
	return stableIdentity({
		familyId: treatment.familyRoles[role],
		representative: treatment[role],
	})
}

function treatmentStructureIdentity(treatment: CompletePaletteTreatment): string {
	return stableIdentity({
		background: roleBindingIdentity(treatment, "background"),
		surface: roleBindingIdentity(treatment, "surface"),
		foreground: roleBindingIdentity(treatment, "foreground"),
		accent: roleBindingIdentity(treatment, "accent"),
		gradient: treatment.gradient,
		fieldTreatment: treatment.fieldTreatment,
		sourceFieldHypothesisId: treatment.sourceFieldHypothesisId,
		collapse: treatment.collapse,
		cardinality: treatment.cardinality,
		gradientEvidence: treatment.gradientEvidence,
	})
}

function expectedFieldDirectionKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.collapse.surface ? "=" : treatment.familyRoles.surface,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function expectedRoleDirectionKeys(treatment: CompletePaletteTreatment): string[] {
	return [
		`foreground:${treatment.familyRoles.foreground}`,
		...treatment.collapse.accent ? [] : [`accent:${treatment.familyRoles.accent}`],
	].sort(compareAscii)
}

function assertLineageBinding(
	candidate: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate,
	binding: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding,
): void {
	const treatment = candidate.treatment
	const lineage = binding.lineage
	if (lineage.fieldHypothesisId !== treatment.sourceFieldHypothesisId ||
		lineage.fieldDirectionKey !== expectedFieldDirectionKey(treatment)) {
		throw new Error(`Candidate ${candidate.key} has inconsistent field lineage`)
	}
	if (!sameStrings([...lineage.roleDirectionKeys].sort(compareAscii), expectedRoleDirectionKeys(treatment))) {
		throw new Error(`Candidate ${candidate.key} has inconsistent role-direction lineage`)
	}
	const expectedFamilies = sortedUnique(ROLES.map((role) => treatment.familyRoles[role])
		.filter((familyId): familyId is string => familyId !== "generated"))
	if (!sameStrings(sortedUnique(lineage.familyIds), expectedFamilies)) {
		throw new Error(`Candidate ${candidate.key} has inconsistent family lineage`)
	}
	if (lineage.representatives.length !== ROLES.length) {
		throw new Error(`Candidate ${candidate.key} does not have complete representative lineage`)
	}
	for (const role of ROLES) {
		const representatives = lineage.representatives.filter((representative) => representative.role === role)
		const representative = representatives[0]
		if (representatives.length !== 1 || !representative ||
			representative.familyId !== treatment.familyRoles[role] ||
			representative.hex.toLowerCase() !== treatment[role].hex.toLowerCase() ||
			representative.strategy !== treatment[role].strategy) {
			throw new Error(`Candidate ${candidate.key} has inconsistent ${role} representative lineage`)
		}
	}
}

function candidateLineages(
	candidate: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate,
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding[] {
	const structure = treatmentStructureIdentity(candidate.treatment)
	const direct = candidate.lineages ?? []
	const descriptors = [...candidate.descriptors ?? [], ...candidate.logicalDescriptors ?? []]
		.filter((descriptor) => descriptor.treatment === undefined ||
			treatmentStructureIdentity(descriptor.treatment) === structure)
		.map(({ sourceType, lineage }) => ({ sourceType, lineage }))
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding>()
	for (const binding of [...direct, ...descriptors]) {
		assertLineageBinding(candidate, binding)
		const identity = stableIdentity({ sourceType: binding.sourceType ?? null, lineage: binding.lineage })
		if (!unique.has(identity)) unique.set(identity, binding)
	}
	return [...unique.values()].sort((first, second) => compareAscii(
		stableIdentity({ sourceType: first.sourceType ?? null, lineage: first.lineage }),
		stableIdentity({ sourceType: second.sourceType ?? null, lineage: second.lineage }),
	))
}

function sharedRoles(role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole): readonly Role[] {
	return role === "accent"
		? ["background", "surface", "foreground"]
		: ["background", "foreground", "accent"]
}

function normalizedLineageIdentity(
	treatment: CompletePaletteTreatment,
	binding: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding,
	role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
): string {
	const representatives = sharedRoles(role).map((sharedRole) => {
		const representative = binding.lineage.representatives.find((entry) => entry.role === sharedRole)!
		return {
			role: sharedRole,
			familyId: representative.familyId,
			hex: representative.hex.toLowerCase(),
			strategy: representative.strategy,
			sourceConnected: representative.sourceConnected,
		}
	})
	return stableIdentity({
		sourceType: binding.sourceType ?? null,
		fieldHypothesisId: binding.lineage.fieldHypothesisId,
		fieldLineage: role === "accent"
			? binding.lineage.fieldDirectionKey
			: `${treatment.familyRoles.background}:flat-surface-counterfactual`,
		roleDirectionKeys: role === "accent"
			? binding.lineage.roleDirectionKeys.filter((key) => !key.startsWith("accent:")).sort(compareAscii)
			: [...binding.lineage.roleDirectionKeys].sort(compareAscii),
		representatives,
		sourceConnected: binding.lineage.sourceConnected,
	})
}

function lineagesByRole(
	candidate: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate,
): PreparedCandidate["lineagesByRole"] {
	const bindings = candidateLineages(candidate)
	const result = {} as Record<
		AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
		ReadonlyMap<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding>
	>
	for (const role of COLLAPSE_ROLES) {
		const values = new Map<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualLineageBinding>()
		for (const binding of bindings) {
			const identity = normalizedLineageIdentity(candidate.treatment, binding, role)
			if (!values.has(identity)) values.set(identity, binding)
		}
		result[role] = values
	}
	return result
}

function exactCollapsedRole(treatment: CompletePaletteTreatment, role: "accent" | "surface"): boolean {
	const target = role === "accent" ? "foreground" : "background"
	return roleBindingIdentity(treatment, role) === roleBindingIdentity(treatment, target)
}

function siblingDisposition(
	treatment: CompletePaletteTreatment,
	role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
): "distinct" | "collapsed" | null {
	if (role === "accent") {
		if (treatment.collapse.accent) return exactCollapsedRole(treatment, "accent") ? "collapsed" : null
		return treatment.accent.hex.toLowerCase() !== treatment.foreground.hex.toLowerCase() ? "distinct" : null
	}
	if (treatment.gradient || treatment.gradientEvidence !== null) return null
	if (treatment.collapse.surface) {
		return treatment.fieldTreatment === "one-field" && exactCollapsedRole(treatment, "surface")
			? "collapsed"
			: null
	}
	return treatment.fieldTreatment === "separate-flat-fields" &&
		treatment.surface.hex.toLowerCase() !== treatment.background.hex.toLowerCase()
		? "distinct"
		: null
}

function siblingTreatmentIdentity(
	treatment: CompletePaletteTreatment,
	role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
): string {
	if (role === "accent") {
		return stableIdentity({
			fieldHypothesisId: treatment.sourceFieldHypothesisId,
			fieldTreatment: treatment.fieldTreatment,
			gradient: treatment.gradient,
			gradientEvidence: treatment.gradientEvidence,
			surfaceCollapsed: treatment.collapse.surface,
			background: roleBindingIdentity(treatment, "background"),
			surface: roleBindingIdentity(treatment, "surface"),
			foreground: roleBindingIdentity(treatment, "foreground"),
		})
	}
	return stableIdentity({
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		rendering: "flat",
		accentCollapsed: treatment.collapse.accent,
		background: roleBindingIdentity(treatment, "background"),
		foreground: roleBindingIdentity(treatment, "foreground"),
		accent: roleBindingIdentity(treatment, "accent"),
	})
}

function metric(distinct: number, collapsed: number): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualMetric {
	return { distinct, collapsed, delta: distinct - collapsed }
}

function scoreDelta(
	distinct: CompletePaletteScores,
	collapsed: CompletePaletteScores,
): Record<keyof CompletePaletteScores, number> {
	return Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_SCORE_AXES
		.map((axis) => [axis, distinct[axis] - collapsed[axis]])) as Record<keyof CompletePaletteScores, number>
}

function orderedScores(scores: CompletePaletteScores): CompletePaletteScores {
	return Object.fromEntries(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_SCORE_AXES
			.map((axis) => [axis, scores[axis]]),
	) as CompletePaletteScores
}

function orderedQuality(
	quality: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality {
	return Object.fromEntries(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_RECOVERY_QUALITY_AXES
			.map((axis) => [axis, quality[axis]]),
	) as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
}

function qualityDelta(
	distinct: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
	collapsed: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality {
	return Object.fromEntries(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_RECOVERY_QUALITY_AXES
			.map((axis) => [axis, distinct[axis] - collapsed[axis]]),
	) as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
}

function obligationCovered(
	treatment: CompletePaletteTreatment,
	obligation: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation,
): boolean {
	if (obligation.fieldHypothesisId !== undefined &&
		obligation.fieldHypothesisId !== treatment.sourceFieldHypothesisId) return false
	const foreground = treatment.familyRoles.foreground === obligation.familyId
	const accent = !treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId
	if (obligation.requiredRole === "foreground") return foreground
	if (obligation.requiredRole === "accent") return accent
	return foreground || accent
}

function compareObligations(
	first: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation,
	second: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation,
): number {
	return compareAscii(first.id, second.id) || compareAscii(first.familyId, second.familyId) ||
		compareAscii(first.fieldHypothesisId ?? "", second.fieldHypothesisId ?? "") ||
		compareAscii(first.requiredRole ?? "", second.requiredRole ?? "") ||
		(first.priority ?? 0) - (second.priority ?? 0)
}

function obligationsDiagnostic(
	distinct: CompletePaletteTreatment,
	collapsed: CompletePaletteTreatment,
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation[],
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualPair["obligations"] {
	const entries = obligations.map((obligation) => {
		const distinctCovered = obligationCovered(distinct, obligation)
		const collapsedCovered = obligationCovered(collapsed, obligation)
		return {
			id: obligation.id,
			familyId: obligation.familyId,
			fieldHypothesisId: obligation.fieldHypothesisId ?? null,
			requiredRole: obligation.requiredRole ?? null,
			priority: obligation.priority ?? null,
			applicable: obligation.fieldHypothesisId === undefined ||
				obligation.fieldHypothesisId === distinct.sourceFieldHypothesisId,
			distinctCovered,
			collapsedCovered,
			delta: (Number(distinctCovered) - Number(collapsedCovered)) as -1 | 0 | 1,
		}
	})
	return {
		entries,
		distinctCoveredIds: entries.filter(({ distinctCovered }) => distinctCovered).map(({ id }) => id),
		collapsedCoveredIds: entries.filter(({ collapsedCovered }) => collapsedCovered).map(({ id }) => id),
		gainedByDistinctIds: entries.filter(({ delta }) => delta === 1).map(({ id }) => id),
		lostByDistinctIds: entries.filter(({ delta }) => delta === -1).map(({ id }) => id),
	}
}

function selectionPresence(key: string, winnerKey: string, slateKeys: readonly string[]) {
	const slateIndex = slateKeys.indexOf(key)
	return {
		winner: key === winnerKey,
		slate: slateIndex >= 0,
		slateIndex: slateIndex < 0 ? null : slateIndex,
	}
}

function pairDiagnostic(
	role: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRole,
	distinct: PreparedCandidate,
	collapsed: PreparedCandidate,
	lineageIdentity: string,
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation[],
	selection: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput["selection"],
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualPair {
	const distinctTreatment = distinct.candidate.treatment
	const collapsedTreatment = collapsed.candidate.treatment
	const distinctEvaluation = distinct.evaluation
	const collapsedEvaluation = collapsed.evaluation
	const binding = distinct.lineagesByRole[role].get(lineageIdentity)!
	const optionalRepresentative = binding.lineage.representatives.find((entry) => entry.role === role)!
	const gradient = distinctTreatment.gradientEvidence
	const fieldTreatment = role === "surface"
		? "flat-surface-counterfactual"
		: distinctTreatment.fieldTreatment
	return {
		id: `${role}:${distinct.candidate.key}->${collapsed.candidate.key}`,
		role,
		distinctKey: distinct.candidate.key,
		collapsedKey: collapsed.candidate.key,
		match: {
			fieldHypothesisId: distinctTreatment.sourceFieldHypothesisId,
			fieldTreatment,
			topology: distinctTreatment.gradient ? gradient?.topology ?? "unsupported" : "flat",
			direction: distinctTreatment.gradient ? gradient?.direction ?? null : null,
			sourceType: binding.sourceType ?? null,
			lineageSourceConnected: binding.lineage.sourceConnected,
			sharedRepresentativeRoles: sharedRoles(role),
			representativeMatch: true,
			lineageMatch: true,
			sourceSupportMatch: true,
		},
		optionalRole: {
			distinct: {
				familyId: distinctTreatment.familyRoles[role],
				hex: distinctTreatment[role].hex.toLowerCase(),
				strategy: distinctTreatment[role].strategy,
				sourceConnected: optionalRepresentative.sourceConnected,
			},
			collapsedInto: role === "accent" ? "foreground" : "background",
		},
		scores: {
			distinct: orderedScores(distinctTreatment.scores),
			collapsed: orderedScores(collapsedTreatment.scores),
			delta: scoreDelta(distinctTreatment.scores, collapsedTreatment.scores),
		},
		recovery: {
			quality: {
				distinct: orderedQuality(distinctEvaluation.quality),
				collapsed: orderedQuality(collapsedEvaluation.quality),
				delta: qualityDelta(distinctEvaluation.quality, collapsedEvaluation.quality),
			},
			qualityUtility: metric(distinctEvaluation.qualityUtility, collapsedEvaluation.qualityUtility),
			identityCoverage: metric(distinctEvaluation.identityCoverage, collapsedEvaluation.identityCoverage),
			identityGain: metric(distinctEvaluation.identityGain, collapsedEvaluation.identityGain),
			relationUtility: metric(distinctEvaluation.relationUtility, collapsedEvaluation.relationUtility),
			pareto: {
				distinctMember: distinctEvaluation.paretoMember,
				collapsedMember: collapsedEvaluation.paretoMember,
				distinctDominatedByKey: distinctEvaluation.dominatedByKey,
				collapsedDominatedByKey: collapsedEvaluation.dominatedByKey,
			},
		},
		cost: {
			convention: "collapsed-minus-distinct; positive values are costs of retaining the distinct role",
			representativeness: collapsedEvaluation.quality.representativeness -
				distinctEvaluation.quality.representativeness,
			sourceSupport: collapsedEvaluation.quality.sourceSupport - distinctEvaluation.quality.sourceSupport,
		},
		pathAndCoherence: {
			foregroundPath: metric(distinctEvaluation.quality.foregroundPath,
				collapsedEvaluation.quality.foregroundPath),
			accentPath: metric(distinctEvaluation.quality.accentPath, collapsedEvaluation.quality.accentPath),
			coherence: metric(distinctEvaluation.quality.coherence, collapsedEvaluation.quality.coherence),
		},
		obligations: obligationsDiagnostic(distinctTreatment, collapsedTreatment, obligations),
		selectionPresence: {
			distinct: selectionPresence(distinct.candidate.key, selection.winnerKey, selection.slateKeys),
			collapsed: selectionPresence(collapsed.candidate.key, selection.winnerKey, selection.slateKeys),
		},
	}
}

function validateAndPrepare(
	input: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput,
): Readonly<{
	candidates: readonly PreparedCandidate[]
	obligations: readonly AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation[]
}> {
	const candidateByKey = new Map<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate>()
	for (const candidate of input.candidates) {
		if (candidate.key.length === 0 || candidateByKey.has(candidate.key)) {
			throw new Error(`Counterfactual candidate keys must be nonempty and unique: ${candidate.key}`)
		}
		for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_SCORE_AXES) {
			if (!Number.isFinite(candidate.treatment.scores[axis])) {
				throw new TypeError(`Counterfactual candidate ${candidate.key} has non-finite ${axis}`)
			}
		}
		candidateByKey.set(candidate.key, candidate)
	}
	const evaluationByKey = new Map<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation>()
	for (const evaluation of input.recoveryEvaluations) {
		if (evaluation.key.length === 0 || evaluationByKey.has(evaluation.key)) {
			throw new Error(`Recovery evaluation keys must be nonempty and unique: ${evaluation.key}`)
		}
		for (const axis of ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_RECOVERY_QUALITY_AXES) {
			if (!Number.isFinite(evaluation.quality[axis])) {
				throw new TypeError(`Recovery evaluation ${evaluation.key} has non-finite ${axis}`)
			}
		}
		for (const value of [evaluation.qualityUtility, evaluation.identityCoverage,
			evaluation.identityGain, evaluation.relationUtility]) {
			if (!Number.isFinite(value)) throw new TypeError(`Recovery evaluation ${evaluation.key} is non-finite`)
		}
		evaluationByKey.set(evaluation.key, evaluation)
	}
	const missingEvaluation = [...candidateByKey.keys()].find((key) => !evaluationByKey.has(key))
	if (missingEvaluation) throw new Error(`Candidate ${missingEvaluation} has no recovery evaluation`)
	const extraEvaluation = [...evaluationByKey.keys()].find((key) => !candidateByKey.has(key))
	if (extraEvaluation) throw new Error(`Recovery evaluation ${extraEvaluation} has no candidate`)
	if (!candidateByKey.has(input.selection.winnerKey)) {
		throw new Error("The observed winner is absent from the diagnostic candidate domain")
	}
	if (new Set(input.selection.slateKeys).size !== input.selection.slateKeys.length) {
		throw new Error("The observed slate contains duplicate keys")
	}
	const missingSlateKey = input.selection.slateKeys.find((key) => !candidateByKey.has(key))
	if (missingSlateKey) throw new Error(`Observed slate key ${missingSlateKey} is absent from the candidate domain`)
	const obligationById = new Map<string, AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualObligation>()
	for (const obligation of input.obligations ?? []) {
		if (obligation.id.length === 0 || obligation.familyId.length === 0 || obligationById.has(obligation.id)) {
			throw new Error(`Counterfactual obligation IDs must be nonempty and unique: ${obligation.id}`)
		}
		if (obligation.priority !== undefined && !Number.isFinite(obligation.priority)) {
			throw new TypeError(`Counterfactual obligation ${obligation.id} has non-finite priority`)
		}
		obligationById.set(obligation.id, obligation)
	}
	const candidates = [...candidateByKey.values()].sort((first, second) => compareAscii(first.key, second.key))
		.map((candidate): PreparedCandidate => ({
			candidate,
			evaluation: evaluationByKey.get(candidate.key)!,
			lineagesByRole: lineagesByRole(candidate),
		}))
	return {
		candidates,
		obligations: [...obligationById.values()].sort(compareObligations),
	}
}

export function diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(
	input: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput,
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualReport {
	const prepared = validateAndPrepare(input)
	const pairs: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualPair[] = []
	for (const role of COLLAPSE_ROLES) {
		const groups = new Map<string, PreparedCandidate[]>()
		for (const candidate of prepared.candidates) {
			if (siblingDisposition(candidate.candidate.treatment, role) === null) continue
			const identity = siblingTreatmentIdentity(candidate.candidate.treatment, role)
			const values = groups.get(identity) ?? []
			values.push(candidate)
			groups.set(identity, values)
		}
		for (const values of groups.values()) {
			const distinct = values.filter(({ candidate }) =>
				siblingDisposition(candidate.treatment, role) === "distinct")
			const collapsed = values.filter(({ candidate }) =>
				siblingDisposition(candidate.treatment, role) === "collapsed")
			for (const distinctCandidate of distinct) {
				for (const collapsedCandidate of collapsed) {
					const matchingLineage = [...distinctCandidate.lineagesByRole[role].keys()]
						.filter((identity) => collapsedCandidate.lineagesByRole[role].has(identity))
						.sort(compareAscii)[0]
					if (!matchingLineage) continue
					pairs.push(pairDiagnostic(role, distinctCandidate, collapsedCandidate, matchingLineage,
						prepared.obligations, input.selection))
				}
			}
		}
	}
	pairs.sort((first, second) => compareAscii(first.role, second.role) ||
		compareAscii(first.distinctKey, second.distinctKey) || compareAscii(first.collapsedKey, second.collapsedKey))
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_ID,
		mode: "diagnostic-only",
		deltaConvention: "distinct-minus-collapsed",
		counts: {
			candidateCount: prepared.candidates.length,
			recoveryEvaluationCount: input.recoveryEvaluations.length,
			exactPairCount: pairs.length,
			accentPairCount: pairs.filter(({ role }) => role === "accent").length,
			surfacePairCount: pairs.filter(({ role }) => role === "surface").length,
		},
		selection: {
			observedWinnerKey: input.selection.winnerKey,
			observedSlateKeys: [...input.selection.slateKeys],
		},
		selectionDeltas: {
			winner: 0,
			slate: 0,
			discovery: 0,
			materialization: 0,
			runtimeInference: 0,
		},
		pairs,
	}
}

export function serializeAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(
	report: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualReport,
): string {
	return `${JSON.stringify(report, null, 2)}\n`
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL = Object.freeze({
	diagnose: diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual,
	serialize: serializeAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual,
})
