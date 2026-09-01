import {
	completeTreatmentKey,
	fieldDirectionKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	FieldHypothesis,
	GradientDirection,
	GradientTopology,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	buildRoleSpecificIdentityObligations,
	classifyFieldConditionalFamilyRole,
	roleSpecificObligationCoverage,
} from "./album-artwork-palette-v2-phase-3-role-aware.ts"
import type {
	FieldConditionalRoleEvidence,
	RoleSpecificIdentityObligation,
	RoleSpecificObligationCoverage,
} from "./album-artwork-palette-v2-phase-3-role-aware.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID =
	"album-artwork-palette-v2-phase-3-recovery-slate-custody-v3" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY = Object.freeze({
	maximumQualityLoss: 0.12,
	maximumSlateTreatments: 8,
	nearColorDistance: 0.025,
})

export type AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim = Readonly<{
	key: string
	fieldHypothesisId: string
	fieldDirectionKey: string
	topology: GradientTopology
	direction: GradientDirection
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3SelectionKind =
	"winner" | "custody-reserve" | "ordinary-quality-slate-fill"

export type AlbumArtworkPaletteV2Phase3RecoveryV3SelectedItemDiagnostic = Readonly<{
	index: number
	selectionKind: AlbumArtworkPaletteV2Phase3RecoveryV3SelectionKind
	recoveryV2: Readonly<{
		key: string
		qualityUtility: number
		paretoMember: boolean
	}>
	qualityLossFromWinner: number
	sourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	sourceConnectedDescriptorLineage: boolean
	coveredRoleObligationIds: readonly string[]
	renderedFieldClaim: AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim | null
	novelDimensions: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY
	domain: Readonly<{
		materializedTreatmentCount: number
		recoveryV2EvaluationCount: number
		roleObligationCount: number
		qualityBoundedCandidateCount: number
	}>
	selected: readonly AlbumArtworkPaletteV2Phase3RecoveryV3SelectedItemDiagnostic[]
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence = Readonly<{
	evidence: readonly FieldConditionalRoleEvidence[]
	obligations: readonly RoleSpecificIdentityObligation[]
}>

type CoverageState = {
	role: Set<string>
	field: Set<string>
	mechanism: Set<string>
}

type CandidateDimensions = Readonly<{
	role: readonly string[]
	field: readonly string[]
	mechanism: readonly string[]
}>

type CustodyCandidate = Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	sourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	sourceConnectedDescriptorLineage: boolean
	coverage: RoleSpecificObligationCoverage
	renderedFieldClaim: AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim | null
	dimensions: CandidateDimensions
}>

const CUSTODY_SOURCE_MECHANISMS = new Set<AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType>([
	"closed-0.7.4-seed",
	"native-field-transition",
	"band-local-endpoint",
])

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function colorDistance(
	first: CompletePaletteTreatment["background"],
	second: CompletePaletteTreatment["background"],
): number {
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

function visuallyNear(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): boolean {
	if (gradientRenderingKey(first) !== gradientRenderingKey(second)) return false
	return (["background", "surface", "foreground", "accent"] as const).every((role) =>
		colorDistance(first[role], second[role]) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY.nearColorDistance)
}

function renderedFieldClaim(
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
): AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim | null {
	const treatment = evaluation.treatment
	const gradient = treatment.gradientEvidence
	if (evaluation.gradientStatus !== "earned-rendered" || !treatment.gradient || !gradient) return null
	return {
		key: [
			treatment.familyRoles.background,
			treatment.familyRoles.surface,
			treatment.background.hex.toLowerCase(),
			treatment.surface.hex.toLowerCase(),
			gradient.topology,
			gradient.direction,
		].join("\0"),
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: fieldDirectionKey(treatment),
		topology: gradient.topology,
		direction: gradient.direction,
	}
}

function candidateDimensions(
	coverage: RoleSpecificObligationCoverage,
	claim: AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim | null,
	connectedSourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[],
): CandidateDimensions {
	const role = new Set(coverage.coveredObligationIds.map((id) => `role-obligation:${id}`))
	for (const entry of coverage.entries) {
		if (!entry.covered) continue
		if (entry.requiredRole !== "accent" && entry.foregroundCovered) {
			role.add(`role-carrier:${entry.obligationId}:foreground`)
		}
		if (entry.requiredRole !== "foreground" && entry.accentCovered) {
			role.add(`role-carrier:${entry.obligationId}:accent`)
		}
	}
	const field = claim === null ? [] : [
		`rendered-field-claim:${claim.key}`,
		`rendered-topology-direction:${claim.topology}:${claim.direction}`,
	]
	return {
		role: [...role].sort(compareAscii),
		field,
		mechanism: connectedSourceTypes
			.filter((sourceType) => CUSTODY_SOURCE_MECHANISMS.has(sourceType))
			.map((sourceType) => `source-mechanism:${sourceType}`)
			.sort(compareAscii),
	}
}

function novelDimensions(candidate: CustodyCandidate, covered: CoverageState): CandidateDimensions {
	return {
		role: candidate.dimensions.role.filter((dimension) => !covered.role.has(dimension)),
		field: candidate.dimensions.field.filter((dimension) => !covered.field.has(dimension)),
		mechanism: candidate.dimensions.mechanism.filter((dimension) => !covered.mechanism.has(dimension)),
	}
}

function addCoverage(candidate: CustodyCandidate, covered: CoverageState): void {
	for (const dimension of candidate.dimensions.role) covered.role.add(dimension)
	for (const dimension of candidate.dimensions.field) covered.field.add(dimension)
	for (const dimension of candidate.dimensions.mechanism) covered.mechanism.add(dimension)
}

function flattenedDimensions(dimensions: CandidateDimensions): string[] {
	return [...dimensions.role, ...dimensions.field, ...dimensions.mechanism]
}

export function buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence(
	evidence: NativePaletteEvidence,
	fieldHypotheses: readonly FieldHypothesis[],
): AlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence {
	const families = [...new Map([...evidence.families]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((family) => [family.id, family] as const)).values()]
	const fields = [...new Map([...fieldHypotheses]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((field) => [field.id, field] as const)).values()]
	const roleEvidence = fields.flatMap((field) => families.map((family) =>
		classifyFieldConditionalFamilyRole(family, field)))
	return {
		evidence: roleEvidence,
		obligations: buildRoleSpecificIdentityObligations(roleEvidence),
	}
}

export function selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
	recoveryV2: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
	materialized: readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[],
	roleObligations: readonly RoleSpecificIdentityObligation[],
): AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection {
	const materializedByKey = new Map<string, AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate>()
	for (const candidate of materialized) {
		if (materializedByKey.has(candidate.key)) throw new Error("Recovery v3 custody received a duplicate materialized key")
		materializedByKey.set(candidate.key, candidate)
	}
	const candidates = recoveryV2.evaluations.map((evaluation): CustodyCandidate => {
		const materializedCandidate = materializedByKey.get(evaluation.key)
		if (!materializedCandidate) throw new Error("Recovery v3 custody omitted a recovery-v2 evaluation descriptor")
		const descriptors = materializedCandidate.descriptors
		const sourceTypes = [...new Set(descriptors.map(({ sourceType }) => sourceType))].sort(compareAscii)
		const connectedSourceTypes = [...new Set(descriptors
			.filter(({ lineage }) => lineage.sourceConnected)
			.map(({ sourceType }) => sourceType))].sort(compareAscii)
		const coverage = roleSpecificObligationCoverage(evaluation.treatment, roleObligations)
		const claim = renderedFieldClaim(evaluation)
		return {
			evaluation,
			sourceTypes,
			sourceConnectedDescriptorLineage: connectedSourceTypes.length > 0,
			coverage,
			renderedFieldClaim: claim,
			dimensions: candidateDimensions(coverage, claim, connectedSourceTypes),
		}
	})
	const candidateByKey = new Map(candidates.map((candidate) => [candidate.evaluation.key, candidate]))
	const winnerKey = completeTreatmentKey(recoveryV2.winner)
	const winner = candidateByKey.get(winnerKey)
	if (!winner) throw new Error("Recovery v3 custody omitted the recovery-v2 winner evaluation")

	const selected: CustodyCandidate[] = [winner]
	const selectionKinds = new Map<string, AlbumArtworkPaletteV2Phase3RecoveryV3SelectionKind>([[winnerKey, "winner"]])
	const selectedNovelDimensions = new Map<string, readonly string[]>()
	const covered: CoverageState = { role: new Set(), field: new Set(), mechanism: new Set() }
	selectedNovelDimensions.set(winnerKey, flattenedDimensions(novelDimensions(winner, covered)))
	addCoverage(winner, covered)
	const qualityFloor = winner.evaluation.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY.maximumQualityLoss

	while (selected.length < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY.maximumSlateTreatments) {
		const ranked = candidates
			.filter((candidate) => !selectionKinds.has(candidate.evaluation.key))
			.filter((candidate) => candidate.evaluation.qualityUtility + 1e-12 >= qualityFloor)
			.filter((candidate) => candidate.sourceConnectedDescriptorLineage)
			.filter((candidate) => !selected.some((existing) =>
				visuallyNear(existing.evaluation.treatment, candidate.evaluation.treatment)))
			.map((candidate) => ({ candidate, novel: novelDimensions(candidate, covered) }))
			.filter(({ novel }) => flattenedDimensions(novel).length > 0)
			.sort((first, second) =>
				second.novel.role.length - first.novel.role.length ||
				second.novel.field.length - first.novel.field.length ||
				second.novel.mechanism.length - first.novel.mechanism.length ||
				second.candidate.evaluation.qualityUtility - first.candidate.evaluation.qualityUtility ||
				compareAscii(first.candidate.evaluation.key, second.candidate.evaluation.key))
		const next = ranked[0]
		if (!next) break
		selected.push(next.candidate)
		selectionKinds.set(next.candidate.evaluation.key, "custody-reserve")
		selectedNovelDimensions.set(next.candidate.evaluation.key, flattenedDimensions(next.novel))
		addCoverage(next.candidate, covered)
	}

	for (const treatment of recoveryV2.slate) {
		if (selected.length >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY.maximumSlateTreatments) break
		const candidate = candidateByKey.get(completeTreatmentKey(treatment))
		if (!candidate || selectionKinds.has(candidate.evaluation.key) ||
			selected.some((existing) => visuallyNear(existing.evaluation.treatment, candidate.evaluation.treatment))) continue
		const novel = novelDimensions(candidate, covered)
		selected.push(candidate)
		selectionKinds.set(candidate.evaluation.key, "ordinary-quality-slate-fill")
		selectedNovelDimensions.set(candidate.evaluation.key, flattenedDimensions(novel))
		addCoverage(candidate, covered)
	}

	if (completeTreatmentKey(selected[0].evaluation.treatment) !== winnerKey) {
		throw new Error("Recovery v3 custody did not preserve the recovery-v2 winner at index zero")
	}
	const diagnostics: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY,
		domain: {
			materializedTreatmentCount: materialized.length,
			recoveryV2EvaluationCount: recoveryV2.evaluations.length,
			roleObligationCount: roleObligations.length,
			qualityBoundedCandidateCount: candidates.filter(({ evaluation }) =>
				evaluation.qualityUtility + 1e-12 >= qualityFloor).length,
		},
		selected: selected.map((candidate, index) => ({
			index,
			selectionKind: selectionKinds.get(candidate.evaluation.key)!,
			recoveryV2: {
				key: candidate.evaluation.key,
				qualityUtility: candidate.evaluation.qualityUtility,
				paretoMember: candidate.evaluation.paretoMember,
			},
			qualityLossFromWinner: Math.max(0,
				winner.evaluation.qualityUtility - candidate.evaluation.qualityUtility),
			sourceTypes: candidate.sourceTypes,
			sourceConnectedDescriptorLineage: candidate.sourceConnectedDescriptorLineage,
			coveredRoleObligationIds: candidate.coverage.coveredObligationIds,
			renderedFieldClaim: candidate.renderedFieldClaim,
			novelDimensions: selectedNovelDimensions.get(candidate.evaluation.key) ?? [],
		})),
	}
	return {
		winner: recoveryV2.winner,
		slate: selected.map(({ evaluation }) => evaluation.treatment),
		diagnostics,
	}
}
