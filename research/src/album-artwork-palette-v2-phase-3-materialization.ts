import {
	completeDirectionKey,
	completeTreatmentKey,
	evaluateIdentityQualityGuard,
	extractAlbumArtworkPaletteV2074Details,
	fieldDirectionKey,
	isExactOverlayGradientChallenger,
	paretoFrontier,
	roleDirectionKeys,
	selectExactOverlayGradientChallenger,
	selectQualityGuardedIdentityChallenger,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	AlbumArtworkPaletteV2074CoreAudit,
	AlbumArtworkPaletteV2074Details,
	CompletePaletteTreatment,
	FieldHypothesis,
	IdentityObligation,
	IdentityWinnerSelectionReason,
	RecallAuditTreatmentLineage,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRESERVED_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_RANKING_PRIORITY_BLOCKS,
} from "./album-artwork-palette-v2-0.7.4-protocol.ts"
import type { AlbumArtworkPaletteV2Phase3AttemptAdapter } from
	"./album-artwork-palette-v2-phase-3-contract.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT_ID =
	"wave-1-factorized-materialization" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CONFIGURATION_ID =
	"closed-0.7.4-domain-fair-1500-quality-diverse-8-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY = 1_500 as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SLATE_CAPACITY = 8 as const

const EVIDENCE_RESOLUTION = 0.04

export type AlbumArtworkPaletteV2Phase3LogicalDescriptor = Readonly<{
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3DescriptorStratumKind =
	"field-direction" |
	"identity-obligation-role" |
	"legal-collapse-cardinality-form" |
	"source-hypothesis-mode" |
	"source-mode"

export type AlbumArtworkPaletteV2Phase3DescriptorStratum = Readonly<{
	kind: AlbumArtworkPaletteV2Phase3DescriptorStratumKind
	key: string
}>

export type AlbumArtworkPaletteV2Phase3MaterializedTreatment = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	strata: readonly AlbumArtworkPaletteV2Phase3DescriptorStratum[]
}>

export type AlbumArtworkPaletteV2Phase3MaterializationDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-factorized-materialization-v1"
	inputDescriptorCount: number
	uniqueDescriptorCount: number
	duplicateDescriptorCount: number
	uniqueCanonicalTreatmentCount: number
	duplicateCanonicalTreatmentCount: number
	capacity: number
	materializedTreatmentCount: number
	capacityReached: boolean
	truncatedCanonicalTreatmentCount: number
	rawCardinalityReward: false
	strata: ReadonlyArray<Readonly<{
		kind: AlbumArtworkPaletteV2Phase3DescriptorStratumKind
		key: string
		availableCanonicalTreatmentCount: number
		materializedCanonicalTreatmentCount: number
		strongestCanonicalTreatmentKey: string
		strongestMaterialized: boolean
	}>>
	uncoveredStratumKeys: readonly string[]
	failureSources: readonly (
		"canonical-duplicates" | "capacity-truncation" | "uncovered-logical-strata"
	)[]
}>

export type AlbumArtworkPaletteV2Phase3Materialization = Readonly<{
	materialized: readonly AlbumArtworkPaletteV2Phase3MaterializedTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3SlateDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-factorized-slate-v1"
	capacity: number
	qualityIncumbentKey: string
	primaryWinnerKey: string
	winnerKey: string
	selectedCanonicalTreatmentKeys: readonly string[]
	coveredStratumKeys: readonly string[]
	uncoveredObligationIds: readonly string[]
	uncoveredObligationRoleStratumKeys: readonly string[]
	uncoveredSourceModeStratumKeys: readonly string[]
	rawCardinalityReward: false
	failureSources: readonly (
		"slate-capacity" | "uncovered-obligation" | "uncovered-source-mode"
	)[]
}>

export type AlbumArtworkPaletteV2Phase3Slate = Readonly<{
	winner: AlbumArtworkPaletteV2Phase3MaterializedTreatment
	selected: readonly AlbumArtworkPaletteV2Phase3MaterializedTreatment[]
	qualityIncumbent: AlbumArtworkPaletteV2Phase3MaterializedTreatment
	primaryWinner: AlbumArtworkPaletteV2Phase3MaterializedTreatment
	selectedIdentityChallenger: AlbumArtworkPaletteV2Phase3MaterializedTreatment | null
	selectedExactOverlayGradient: AlbumArtworkPaletteV2Phase3MaterializedTreatment | null
	identitySelectionReason: IdentityWinnerSelectionReason
	identityChallengerCount: number
	eligibleIdentityChallengerCount: number
	diagnostics: AlbumArtworkPaletteV2Phase3SlateDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3MaterializationAttemptDiagnostics = Readonly<{
	domain: "closed-0.7.4-complete-domain"
	upstreamEnumerationReplaced: false
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	slate: AlbumArtworkPaletteV2Phase3SlateDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3MaterializationResult = Omit<
	AlbumArtworkPaletteV2Result,
	"diagnostics"
> & Readonly<{
	diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
		phase3FactorizedMaterialization: AlbumArtworkPaletteV2Phase3MaterializationAttemptDiagnostics
	}>
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function orderedObligations(obligations: readonly IdentityObligation[]): IdentityObligation[] {
	return [...obligations].sort((first, second) =>
		second.priority - first.priority || compareAscii(first.id, second.id) ||
		compareAscii(first.familyId, second.familyId))
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / EVIDENCE_RESOLUTION)
}

function effectiveScore(
	treatment: CompletePaletteTreatment,
	block: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_RANKING_PRIORITY_BLOCKS[number],
): number {
	return treatment.scores[block] - treatment.scores.generatedPenalty
}

function compareTreatmentQuality(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): number {
	for (const block of ALBUM_ARTWORK_PALETTE_V2_0_7_4_RANKING_PRIORITY_BLOCKS) {
		const comparison = evidenceLevel(effectiveScore(second, block)) -
			evidenceLevel(effectiveScore(first, block))
		if (comparison !== 0) return comparison
	}
	return compareAscii(completeTreatmentKey(first), completeTreatmentKey(second)) ||
		compareAscii(first.id, second.id)
}

function lineageIdentity(lineage: RecallAuditTreatmentLineage): string {
	return [
		lineage.fieldHypothesisId,
		lineage.fieldDirectionKey,
		[...lineage.roleDirectionKeys].sort(compareAscii).join(","),
		[...lineage.familyIds].sort(compareAscii).join(","),
		[...lineage.representatives]
			.map(({ role, familyId, hex, strategy, sourceConnected }) =>
				`${role}:${familyId}:${hex.toLowerCase()}:${strategy}:${sourceConnected ? "source" : "unsupported"}`)
			.sort(compareAscii)
			.join(","),
		lineage.sourceConnected ? "source" : "unsupported",
	].join("\0")
}

function descriptorIdentity(descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor): string {
	return [
		descriptor.treatment.id,
		descriptor.fieldHypothesis.id,
		lineageIdentity(descriptor.lineage),
	].join("\0")
}

function compareDescriptors(
	first: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	second: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
): number {
	return compareTreatmentQuality(first.treatment, second.treatment) ||
		compareAscii(descriptorIdentity(first), descriptorIdentity(second))
}

function validateDescriptor(descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor): void {
	const { treatment, fieldHypothesis, lineage } = descriptor
	if (treatment.sourceFieldHypothesisId !== fieldHypothesis.id ||
		lineage.fieldHypothesisId !== fieldHypothesis.id) {
		throw new Error("Logical descriptor field-hypothesis lineage is inconsistent")
	}
	if (lineage.fieldDirectionKey !== fieldDirectionKey(treatment)) {
		throw new Error("Logical descriptor field-direction lineage is inconsistent")
	}
	const expectedRoleDirections = roleDirectionKeys(treatment).sort(compareAscii)
	const actualRoleDirections = [...lineage.roleDirectionKeys].sort(compareAscii)
	if (expectedRoleDirections.length !== actualRoleDirections.length ||
		expectedRoleDirections.some((key, index) => key !== actualRoleDirections[index])) {
		throw new Error("Logical descriptor role-direction lineage is inconsistent")
	}
	if (lineage.sourceConnected && lineage.representatives.some(({ sourceConnected }) => !sourceConnected)) {
		throw new Error("Source-connected logical descriptor contains unsupported representative lineage")
	}
}

export function albumArtworkPaletteV2Phase3LogicalDescriptorStrata(
	descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	obligations: readonly IdentityObligation[],
): AlbumArtworkPaletteV2Phase3DescriptorStratum[] {
	validateDescriptor(descriptor)
	const { treatment, fieldHypothesis, lineage } = descriptor
	const mode = treatment.gradient ? "gradient" : "flat"
	const strata: AlbumArtworkPaletteV2Phase3DescriptorStratum[] = [
		{
			kind: "field-direction",
			key: `field-direction:${lineage.fieldDirectionKey}`,
		},
		{
			kind: "legal-collapse-cardinality-form",
			key: [
				"legal-form",
				treatment.fieldTreatment,
				treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
				treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
				`cardinality-${treatment.cardinality}`,
			].join(":"),
		},
	]
	if (lineage.sourceConnected) {
		strata.push({
			kind: "source-hypothesis-mode",
			key: `source-hypothesis-mode:${fieldHypothesis.id}:${mode}`,
		}, {
			kind: "source-mode",
			key: `source-mode:${mode}`,
		})
	}
	for (const obligation of obligations) {
		if (treatment.familyRoles.foreground === obligation.familyId) {
			strata.push({
				kind: "identity-obligation-role",
				key: `identity-obligation-role:${obligation.id}:foreground`,
			})
		}
		if (!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId) {
			strata.push({
				kind: "identity-obligation-role",
				key: `identity-obligation-role:${obligation.id}:accent`,
			})
		}
	}
	const unique = new Map(strata.map((stratum) => [stratum.key, stratum]))
	return [...unique.values()].sort((first, second) => compareAscii(first.key, second.key))
}

export function materializeAlbumArtworkPaletteV2Phase3Descriptors(
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	obligations: readonly IdentityObligation[],
	capacity = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
): AlbumArtworkPaletteV2Phase3Materialization {
	if (!Number.isSafeInteger(capacity) || capacity < 1 ||
		capacity > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY) {
		throw new RangeError(`Materialization capacity must be between 1 and ${ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY}`)
	}
	if (descriptors.length === 0) throw new Error("At least one logical descriptor is required")
	const deterministicObligations = orderedObligations(obligations)

	const uniqueDescriptors = new Map<string, AlbumArtworkPaletteV2Phase3LogicalDescriptor>()
	for (const descriptor of descriptors) {
		validateDescriptor(descriptor)
		const identity = descriptorIdentity(descriptor)
		const incumbent = uniqueDescriptors.get(identity)
		if (!incumbent || compareDescriptors(descriptor, incumbent) < 0) {
			uniqueDescriptors.set(identity, descriptor)
		}
	}

	const descriptorsByCanonicalTreatment = new Map<
		string,
		AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	>()
	for (const descriptor of uniqueDescriptors.values()) {
		const key = completeTreatmentKey(descriptor.treatment)
		const values = descriptorsByCanonicalTreatment.get(key) ?? []
		values.push(descriptor)
		descriptorsByCanonicalTreatment.set(key, values)
	}

	const canonicalTreatments = [...descriptorsByCanonicalTreatment.entries()].map(([
		key,
		values,
	]): AlbumArtworkPaletteV2Phase3MaterializedTreatment => {
		const rankedDescriptors = values.sort(compareDescriptors)
		const strata = new Map<string, AlbumArtworkPaletteV2Phase3DescriptorStratum>()
		for (const descriptor of rankedDescriptors) {
			for (const stratum of albumArtworkPaletteV2Phase3LogicalDescriptorStrata(descriptor, deterministicObligations)) {
				strata.set(stratum.key, stratum)
			}
		}
		return {
			key,
			treatment: rankedDescriptors[0].treatment,
			descriptors: rankedDescriptors,
			strata: [...strata.values()].sort((first, second) => compareAscii(first.key, second.key)),
		}
	}).sort((first, second) =>
		compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))

	const canonicalByStratum = new Map<string, AlbumArtworkPaletteV2Phase3MaterializedTreatment[]>()
	const stratumByKey = new Map<string, AlbumArtworkPaletteV2Phase3DescriptorStratum>()
	for (const candidate of canonicalTreatments) {
		for (const stratum of candidate.strata) {
			stratumByKey.set(stratum.key, stratum)
			const values = canonicalByStratum.get(stratum.key) ?? []
			values.push(candidate)
			canonicalByStratum.set(stratum.key, values)
		}
	}
	for (const values of canonicalByStratum.values()) {
		values.sort((first, second) =>
			compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))
	}

	const selectedKeys = new Set<string>()
	const add = (candidate: AlbumArtworkPaletteV2Phase3MaterializedTreatment): void => {
		if (selectedKeys.size >= capacity || selectedKeys.has(candidate.key)) return
		selectedKeys.add(candidate.key)
	}

	add(canonicalTreatments[0])
	const coverageRepresentatives = [...new Set([...canonicalByStratum.values()]
		.map((values) => values[0]))]
		.sort((first, second) => {
			const firstCoverage = first.strata.filter(({ key }) => canonicalByStratum.get(key)?.[0] === first).length
			const secondCoverage = second.strata.filter(({ key }) => canonicalByStratum.get(key)?.[0] === second).length
			return secondCoverage - firstCoverage ||
				compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key)
		})
	for (const candidate of coverageRepresentatives) add(candidate)

	const bestFairRank = new Map<string, number>()
	for (const values of canonicalByStratum.values()) {
		values.forEach((candidate, rank) => {
			bestFairRank.set(candidate.key, Math.min(bestFairRank.get(candidate.key) ?? Infinity, rank))
		})
	}
	const fairRanked = [...canonicalTreatments].sort((first, second) =>
		(bestFairRank.get(first.key) ?? Infinity) - (bestFairRank.get(second.key) ?? Infinity) ||
		compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))
	for (const candidate of fairRanked) add(candidate)

	const materialized = canonicalTreatments.filter(({ key }) => selectedKeys.has(key))
	const diagnosticsStrata = [...canonicalByStratum.entries()]
		.sort(([first], [second]) => compareAscii(first, second))
		.map(([key, available]) => {
			const selectedCount = available.filter((candidate) => selectedKeys.has(candidate.key)).length
			return {
				kind: stratumByKey.get(key)!.kind,
				key,
				availableCanonicalTreatmentCount: available.length,
				materializedCanonicalTreatmentCount: selectedCount,
				strongestCanonicalTreatmentKey: available[0].key,
				strongestMaterialized: selectedKeys.has(available[0].key),
			}
		})
	const uncoveredStratumKeys = diagnosticsStrata
		.filter(({ materializedCanonicalTreatmentCount }) => materializedCanonicalTreatmentCount === 0)
		.map(({ key }) => key)
	const duplicateDescriptorCount = descriptors.length - uniqueDescriptors.size
	const duplicateCanonicalTreatmentCount = uniqueDescriptors.size - canonicalTreatments.length
	const truncatedCanonicalTreatmentCount = canonicalTreatments.length - materialized.length
	const failureSources: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics["failureSources"][number][] = []
	if (duplicateDescriptorCount > 0 || duplicateCanonicalTreatmentCount > 0) {
		failureSources.push("canonical-duplicates")
	}
	if (truncatedCanonicalTreatmentCount > 0) failureSources.push("capacity-truncation")
	if (uncoveredStratumKeys.length > 0) failureSources.push("uncovered-logical-strata")

	return {
		materialized,
		diagnostics: {
			version: "album-artwork-palette-v2-phase-3-factorized-materialization-v1",
			inputDescriptorCount: descriptors.length,
			uniqueDescriptorCount: uniqueDescriptors.size,
			duplicateDescriptorCount,
			uniqueCanonicalTreatmentCount: canonicalTreatments.length,
			duplicateCanonicalTreatmentCount,
			capacity,
			materializedTreatmentCount: materialized.length,
			capacityReached: materialized.length >= capacity,
			truncatedCanonicalTreatmentCount,
			rawCardinalityReward: false,
			strata: diagnosticsStrata,
			uncoveredStratumKeys,
			failureSources,
		},
	}
}

function qualityLoss(
	incumbent: CompletePaletteTreatment,
	candidate: CompletePaletteTreatment,
): Readonly<{ maximum: number; total: number }> {
	let maximum = 0
	let total = 0
	for (const block of ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMPLETE_QUALITY_GUARD_BLOCKS) {
		const loss = Math.max(0, evidenceLevel(
			incumbent.scores[block] - incumbent.scores.generatedPenalty,
		) - evidenceLevel(candidate.scores[block] - candidate.scores.generatedPenalty))
		maximum = Math.max(maximum, loss)
		total += loss
	}
	return { maximum, total }
}

function slateStratumWeight(stratum: AlbumArtworkPaletteV2Phase3DescriptorStratum): number {
	switch (stratum.kind) {
		case "identity-obligation-role": return 16
		case "source-mode": return 12
		case "source-hypothesis-mode": return 6
		case "legal-collapse-cardinality-form": return 5
		case "field-direction": return 3
	}
}

function coversObligation(
	treatment: CompletePaletteTreatment,
	obligation: IdentityObligation,
): boolean {
	return treatment.familyRoles.foreground === obligation.familyId ||
		(!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId)
}

export function buildAlbumArtworkPaletteV2Phase3Slate(
	materialization: AlbumArtworkPaletteV2Phase3Materialization,
	obligations: readonly IdentityObligation[],
	capacity = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SLATE_CAPACITY,
): AlbumArtworkPaletteV2Phase3Slate {
	if (!Number.isSafeInteger(capacity) || capacity < 1 ||
		capacity > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SLATE_CAPACITY) {
		throw new RangeError(`Slate capacity must be between 1 and ${ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SLATE_CAPACITY}`)
	}
	if (materialization.materialized.length === 0) throw new Error("Cannot build a slate from an empty domain")
	const deterministicObligations = orderedObligations(obligations)
	const byCanonicalKey = new Map(materialization.materialized.map((candidate) => [candidate.key, candidate]))
	const frontier = paretoFrontier(materialization.materialized.map(({ treatment }) => treatment))
	const qualityIncumbent = byCanonicalKey.get(completeTreatmentKey(frontier[0]))!
	const identitySelection = selectQualityGuardedIdentityChallenger(
		qualityIncumbent.treatment,
		materialization.materialized.map(({ treatment }) => treatment),
		deterministicObligations,
	)
	const selectedIdentityChallenger = identitySelection.selectedIdentityChallenger === null
		? null
		: byCanonicalKey.get(completeTreatmentKey(identitySelection.selectedIdentityChallenger))!
	const primaryWinner = selectedIdentityChallenger ?? qualityIncumbent
	const exactOverlayCandidates = materialization.materialized
		.filter((candidate) => candidate.descriptors.some(({ lineage }) => lineage.sourceConnected))
		.filter(({ treatment }) => isExactOverlayGradientChallenger(primaryWinner.treatment, treatment))
		.filter(({ treatment }) => selectedIdentityChallenger === null ||
			evaluateIdentityQualityGuard(qualityIncumbent.treatment, treatment).pass)
	const selectedOverlayTreatment = selectExactOverlayGradientChallenger(
		primaryWinner.treatment,
		exactOverlayCandidates.map(({ treatment }) => treatment),
	)
	const selectedExactOverlayGradient = selectedOverlayTreatment === null
		? null
		: byCanonicalKey.get(completeTreatmentKey(selectedOverlayTreatment))!
	const winner = selectedExactOverlayGradient ?? primaryWinner
	const feasibleObligation = deterministicObligations.some((obligation) => materialization.materialized.some(({ treatment }) =>
		coversObligation(treatment, obligation)))
	const identitySelectionReason: IdentityWinnerSelectionReason = !feasibleObligation
		? "no-feasible-identity-obligation"
		: identitySelection.identityChallengers.length === 0
			? "quality-incumbent-already-identity-optimal"
			: selectedIdentityChallenger === null
				? "all-identity-challengers-failed-quality-guard"
				: "quality-guarded-identity-challenger-selected"

	const selectedKeys = new Set([winner.key])
	const coveredStrata = new Set(winner.strata.map(({ key }) => key))
	const coveredObligationIds = new Set(deterministicObligations
		.filter((obligation) => coversObligation(winner.treatment, obligation))
		.map(({ id }) => id))
	const addSlateCandidate = (candidate: AlbumArtworkPaletteV2Phase3MaterializedTreatment): void => {
		selectedKeys.add(candidate.key)
		for (const { key } of candidate.strata) coveredStrata.add(key)
		for (const obligation of deterministicObligations) {
			if (coversObligation(candidate.treatment, obligation)) coveredObligationIds.add(obligation.id)
		}
	}
	while (selectedKeys.size < capacity && deterministicObligations.some(({ id }) => !coveredObligationIds.has(id))) {
		const next = materialization.materialized
			.filter(({ key }) => !selectedKeys.has(key))
			.map((candidate) => ({
				candidate,
				obligationGain: deterministicObligations.filter((obligation) =>
					!coveredObligationIds.has(obligation.id) && coversObligation(candidate.treatment, obligation)).length,
				loss: qualityLoss(qualityIncumbent.treatment, candidate.treatment),
			}))
			.filter(({ obligationGain }) => obligationGain > 0)
			.sort((first, second) =>
				second.obligationGain - first.obligationGain ||
				first.loss.maximum - second.loss.maximum ||
				first.loss.total - second.loss.total ||
				compareTreatmentQuality(first.candidate.treatment, second.candidate.treatment) ||
				compareAscii(first.candidate.key, second.candidate.key))[0]?.candidate
		if (!next) break
		addSlateCandidate(next)
	}
	const sourceModeKeys = new Set(materialization.materialized.flatMap(({ strata }) => strata
		.filter(({ kind }) => kind === "source-mode")
		.map(({ key }) => key)))
	while (selectedKeys.size < capacity && [...sourceModeKeys].some((key) => !coveredStrata.has(key))) {
		const next = materialization.materialized
			.filter(({ key }) => !selectedKeys.has(key))
			.map((candidate) => ({
				candidate,
				modeGain: candidate.strata.filter(({ kind, key }) =>
					kind === "source-mode" && !coveredStrata.has(key)).length,
				loss: qualityLoss(qualityIncumbent.treatment, candidate.treatment),
			}))
			.filter(({ modeGain }) => modeGain > 0)
			.sort((first, second) =>
				first.loss.maximum - second.loss.maximum ||
				first.loss.total - second.loss.total ||
				compareTreatmentQuality(first.candidate.treatment, second.candidate.treatment) ||
				compareAscii(first.candidate.key, second.candidate.key))[0]?.candidate
		if (!next) break
		addSlateCandidate(next)
	}
	while (selectedKeys.size < capacity) {
		const candidates = materialization.materialized
			.filter(({ key }) => !selectedKeys.has(key))
			.map((candidate) => {
				const uncovered = candidate.strata.filter(({ key }) => !coveredStrata.has(key))
				return {
					candidate,
					gain: uncovered.reduce((sum, stratum) => sum + slateStratumWeight(stratum), 0),
					loss: qualityLoss(qualityIncumbent.treatment, candidate.treatment),
				}
			})
			.filter(({ gain }) => gain > 0)
			.sort((first, second) =>
				first.loss.maximum - second.loss.maximum ||
				first.loss.total - second.loss.total ||
				second.gain - first.gain ||
				compareTreatmentQuality(first.candidate.treatment, second.candidate.treatment) ||
				compareAscii(first.candidate.key, second.candidate.key))
		const next = candidates[0]?.candidate
		if (!next) break
		addSlateCandidate(next)
	}

	const selected = [
		winner,
		...materialization.materialized
			.filter(({ key }) => key !== winner.key && selectedKeys.has(key))
			.sort((first, second) =>
				compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key)),
	]
	const allStrata = new Map(materialization.materialized.flatMap(({ strata }) =>
		strata.map((stratum) => [stratum.key, stratum] as const)))
	const uncoveredObligationRoleStratumKeys = [...allStrata.values()]
		.filter(({ kind, key }) => kind === "identity-obligation-role" && !coveredStrata.has(key))
		.map(({ key }) => key)
		.sort(compareAscii)
	const uncoveredSourceModeStratumKeys = [...allStrata.values()]
		.filter(({ kind, key }) => kind === "source-mode" && !coveredStrata.has(key))
		.map(({ key }) => key)
		.sort(compareAscii)
	const uncoveredObligationIds = deterministicObligations
		.filter(({ id }) => !coveredObligationIds.has(id))
		.map(({ id }) => id)
	const failureSources: AlbumArtworkPaletteV2Phase3SlateDiagnostics["failureSources"][number][] = []
	if (materialization.materialized.length > selected.length) failureSources.push("slate-capacity")
	if (uncoveredObligationIds.length > 0) failureSources.push("uncovered-obligation")
	if (uncoveredSourceModeStratumKeys.length > 0) failureSources.push("uncovered-source-mode")

	return {
		winner,
		selected,
		qualityIncumbent,
		primaryWinner,
		selectedIdentityChallenger,
		selectedExactOverlayGradient,
		identitySelectionReason,
		identityChallengerCount: identitySelection.identityChallengers.length,
		eligibleIdentityChallengerCount: identitySelection.eligibleIdentityChallengers.length,
		diagnostics: {
			version: "album-artwork-palette-v2-phase-3-factorized-slate-v1",
			capacity,
			qualityIncumbentKey: qualityIncumbent.key,
			primaryWinnerKey: primaryWinner.key,
			winnerKey: winner.key,
			selectedCanonicalTreatmentKeys: selected.map(({ key }) => key),
			coveredStratumKeys: [...coveredStrata].sort(compareAscii),
			uncoveredObligationIds,
			uncoveredObligationRoleStratumKeys,
			uncoveredSourceModeStratumKeys,
			rawCardinalityReward: false,
			failureSources,
		},
	}
}

function sourceConnectedRole(treatment: CompletePaletteTreatment, role: "background" | "surface" | "foreground" | "accent"): boolean {
	const color = treatment[role]
	return !color.generated && !("generated" in color.support) &&
		color.support.anchorFamilyId.length > 0 && color.support.regionIds.length > 0
}

function lineageFromClosedDomain(
	treatment: CompletePaletteTreatment,
	audit: AlbumArtworkPaletteV2074CoreAudit,
): RecallAuditTreatmentLineage {
	const familyIds = [...new Set(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const representatives = (["background", "surface", "foreground", "accent"] as const).map((role) => ({
		role,
		familyId: treatment.familyRoles[role],
		hex: treatment[role].hex,
		strategy: treatment[role].strategy,
		sourceConnected: sourceConnectedRole(treatment, role),
	}))
	const treatmentFieldDirectionKey = fieldDirectionKey(treatment)
	const treatmentRoleDirectionKeys = roleDirectionKeys(treatment)
	const fieldHypothesis = audit.registry.fieldHypotheses.find(({ hypothesisId }) =>
		hypothesisId === treatment.sourceFieldHypothesisId)
	const fieldDirection = audit.registry.fieldDirections.find(({ key, hypothesisIds }) =>
		key === treatmentFieldDirectionKey && hypothesisIds.includes(treatment.sourceFieldHypothesisId))
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: treatmentFieldDirectionKey,
		roleDirectionKeys: treatmentRoleDirectionKeys,
		familyIds,
		representatives,
		sourceConnected: fieldHypothesis?.sourceConnected === true && fieldDirection?.sourceConnected === true &&
			treatmentRoleDirectionKeys.every((key) => audit.registry.roleDirections.some((direction) =>
				direction.key === key && direction.sourceConnected)) &&
			familyIds.every((familyId) => audit.registry.families.some((family) =>
				family.familyId === familyId && family.sourceConnected)) &&
			representatives.every(({ sourceConnected }) => sourceConnected),
	}
}

export function albumArtworkPaletteV2Phase3DescriptorsFromClosed074(
	details: AlbumArtworkPaletteV2074Details,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor[] {
	const hypothesesById = new Map(details.result.diagnostics.fieldHypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const additionLineageByKey = new Map(details.audit.additions.map(({ key, lineage }) => [key, lineage]))
	return details.audit.candidate.completeTreatments.map((treatment) => {
		const fieldHypothesis = hypothesesById.get(treatment.sourceFieldHypothesisId)
		if (!fieldHypothesis) throw new Error(`Closed domain omitted field hypothesis ${treatment.sourceFieldHypothesisId}`)
		return {
			treatment,
			fieldHypothesis,
			lineage: additionLineageByKey.get(completeTreatmentKey(treatment)) ??
				lineageFromClosedDomain(treatment, details.audit),
		}
	})
}

function updateSelectionDiagnostics(
	base: AlbumArtworkPaletteV2Result,
	materialization: AlbumArtworkPaletteV2Phase3Materialization,
	slate: AlbumArtworkPaletteV2Phase3Slate,
): AlbumArtworkPaletteV2Phase3MaterializationResult["diagnostics"] {
	const selectedTreatments = slate.selected.map(({ treatment }) => treatment)
	const obligations = base.diagnostics.identityObligationGraph.obligations
	const completeTreatments = materialization.materialized.map(({ treatment }) => treatment)
	const feasibleObligationIds = obligations
		.filter((obligation) => completeTreatments.some((treatment) => coversObligation(treatment, obligation)))
		.map(({ id }) => id)
	const coveredObligationIds = obligations
		.filter((obligation) => coversObligation(slate.winner.treatment, obligation))
		.map(({ id }) => id)
	const deferredObligationIds = feasibleObligationIds.filter((id) => !coveredObligationIds.includes(id))
	const maximumCompleteTreatmentCoverage = completeTreatments.reduce((maximum, treatment) =>
		Math.max(maximum, obligations.filter((obligation) => coversObligation(treatment, obligation)).length), 0)
	const updatedNodes = base.diagnostics.identityObligationGraph.nodes.map((node) => {
		if (node.stage !== "retained-slate" && node.stage !== "winner-explanation") return node
		const source = node.stage === "retained-slate" ? selectedTreatments : [slate.winner.treatment]
		const treatments = source.filter((treatment) => treatment.familyRoles.foreground === node.familyId ||
			(!treatment.collapse.accent && treatment.familyRoles.accent === node.familyId))
		const completeCarrierExists = completeTreatments.some((treatment) =>
			treatment.familyRoles.foreground === node.familyId ||
			(!treatment.collapse.accent && treatment.familyRoles.accent === node.familyId))
		return {
			...node,
			status: treatments.length > 0 ? "satisfied" as const : completeCarrierExists ? "deferred" as const : "blocked" as const,
			treatmentCount: treatments.length,
			treatmentIds: treatments.map(({ id }) => id),
			reason: treatments.length > 0
				? `Factorized ${node.stage} carries the obligation`
				: completeCarrierExists
					? `Factorized ${node.stage} deferred an available carrier under its bound`
					: "No complete carrier is available",
		}
	})
	const statusByNodeId = new Map(updatedNodes.map(({ id, status }) => [id, status]))
	const frontier = paretoFrontier(completeTreatments)
	const frontierDirections = new Set(frontier.map(completeDirectionKey))
	const selectedDirections = new Set(selectedTreatments.map(completeDirectionKey))
	const overlayCandidates = completeTreatments.filter((treatment) =>
		isExactOverlayGradientChallenger(slate.primaryWinner.treatment, treatment))
	const rejectedOverlayCount = slate.selectedIdentityChallenger === null
		? 0
		: overlayCandidates.filter((treatment) =>
			!evaluateIdentityQualityGuard(slate.qualityIncumbent.treatment, treatment).pass).length
	const acceptedGradientVariantCount = base.diagnostics.exactOverlayGradientChallenger.acceptedGradientVariantCount
	const overlayReason = slate.primaryWinner.treatment.gradient
		? "primary-winner-gradient" as const
		: slate.primaryWinner.treatment.collapse.accent
			? "accent-collapsed" as const
			: acceptedGradientVariantCount === 0
				? "no-accepted-gradient-variant" as const
				: slate.selectedExactOverlayGradient !== null
					? "challenger-selected" as const
					: rejectedOverlayCount > 0 && rejectedOverlayCount === overlayCandidates.length
						? "quality-guard" as const
						: overlayCandidates.length > 0
							? "foundation-gap" as const
							: "no-legal-exact-overlay-gradient" as const
	return {
		...base.diagnostics,
		completeCandidateCount: materialization.materialized.length,
		candidateAvailability: {
			...base.diagnostics.candidateAvailability,
			slateForegroundFamilyIds: [...new Set(selectedTreatments
				.map(({ familyRoles }) => familyRoles.foreground)
				.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
			slateAccentFamilyIds: [...new Set(selectedTreatments
				.filter(({ collapse }) => !collapse.accent)
				.map(({ familyRoles }) => familyRoles.accent)
				.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
		},
		identityObligationGraph: {
			...base.diagnostics.identityObligationGraph,
			nodes: updatedNodes,
			edges: base.diagnostics.identityObligationGraph.edges.map((edge) => ({
				...edge,
				carried: statusByNodeId.get(edge.from) === "satisfied" && statusByNodeId.get(edge.to) === "satisfied",
			})),
			winnerExplanation: {
				...base.diagnostics.identityObligationGraph.winnerExplanation,
				treatmentId: slate.winner.treatment.id,
				primaryTreatmentId: slate.primaryWinner.treatment.id,
				qualityIncumbentTreatmentId: slate.qualityIncumbent.treatment.id,
				selectedIdentityChallengerTreatmentId: slate.selectedIdentityChallenger?.treatment.id ?? null,
				selectionReason: slate.identitySelectionReason,
				feasibleObligationIds,
				coveredObligationIds,
				deferredObligationIds,
				qualityDeferredObligationIds: slate.selectedIdentityChallenger === null ? deferredObligationIds : [],
				priorityDeferredObligationIds: slate.selectedIdentityChallenger === null ? [] : deferredObligationIds,
				obligationDeferrals: [],
				maximumCompleteTreatmentCoverage,
				eligibleIdentityChallengerCount: slate.eligibleIdentityChallengerCount,
			},
		},
		exactOverlayGradientChallenger: {
			...base.diagnostics.exactOverlayGradientChallenger,
			triggerEligible: !slate.primaryWinner.treatment.gradient && !slate.primaryWinner.treatment.collapse.accent &&
				acceptedGradientVariantCount > 0,
			reason: overlayReason,
			acceptedGradientVariantCount,
			existingExactOverlayGradientCount: overlayCandidates.length,
			projectedAttemptCount: 0,
			projectedLegalCount: 0,
			projectedUniqueCount: 0,
			selectedChallengerId: slate.selectedExactOverlayGradient?.treatment.id ?? null,
			selectedSource: slate.selectedExactOverlayGradient === null ? null : "existing-complete",
			primaryFoundationEvidenceLevel: evidenceLevel(
				slate.primaryWinner.treatment.scores.treatmentFoundation - slate.primaryWinner.treatment.scores.generatedPenalty,
			),
			challengerFoundationEvidenceLevel: slate.selectedExactOverlayGradient === null ? null : evidenceLevel(
				slate.selectedExactOverlayGradient.treatment.scores.treatmentFoundation -
				slate.selectedExactOverlayGradient.treatment.scores.generatedPenalty,
			),
			replacedPrimaryWinner: slate.selectedExactOverlayGradient !== null,
			qualityGuardRequired: slate.selectedIdentityChallenger !== null,
			qualityGuardRejectedCandidateCount: rejectedOverlayCount,
			selectedChallengerPassesQualityGuard: slate.selectedExactOverlayGradient === null ||
				slate.selectedIdentityChallenger === null
				? null
				: evaluateIdentityQualityGuard(
					slate.qualityIncumbent.treatment,
					slate.selectedExactOverlayGradient.treatment,
				).pass,
			qualityGuardEvaluations: slate.selectedIdentityChallenger === null ? [] : overlayCandidates.map((treatment) =>
				evaluateIdentityQualityGuard(slate.qualityIncumbent.treatment, treatment)),
		},
		paretoRanking: {
			...base.diagnostics.paretoRanking,
			rawCandidateCount: materialization.diagnostics.inputDescriptorCount,
			uniqueCandidateCount: materialization.materialized.length,
			dominatedCandidateCount: materialization.materialized.length - frontier.length,
			frontierCandidateCount: frontier.length,
			globalParetoFrontierTreatmentIds: frontier.map(({ id }) => id),
			frontierDirectionCount: frontierDirections.size,
			globalParetoTopTreatmentId: frontier[0].id,
			qualityIncumbentTreatmentId: slate.qualityIncumbent.treatment.id,
			identityChallengerCount: slate.identityChallengerCount,
			eligibleIdentityChallengerCount: slate.eligibleIdentityChallengerCount,
			selectedIdentityChallengerTreatmentId: slate.selectedIdentityChallenger?.treatment.id ?? null,
			selectedIdentityChallengerQualityGuard: slate.selectedIdentityChallenger === null ? null :
				evaluateIdentityQualityGuard(slate.qualityIncumbent.treatment, slate.selectedIdentityChallenger.treatment),
			retainedCount: selectedTreatments.length,
			selectedTreatmentId: slate.winner.treatment.id,
			primaryTreatmentId: slate.primaryWinner.treatment.id,
			differsFromLegacyScalar: completeTreatmentKey(slate.winner.treatment) !==
				completeTreatmentKey(base.diagnostics.legacyScalarTopTreatment),
			omittedFrontierDirectionKeys: [...frontierDirections]
				.filter((key) => !selectedDirections.has(key))
				.sort(compareAscii),
		},
		phase3FactorizedMaterialization: {
			domain: "closed-0.7.4-complete-domain",
			upstreamEnumerationReplaced: false,
			materialization: materialization.diagnostics,
			slate: slate.diagnostics,
		},
	}
}

export function attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails(
	details: AlbumArtworkPaletteV2074Details,
): Readonly<{
	result: AlbumArtworkPaletteV2Phase3MaterializationResult
	materialization: AlbumArtworkPaletteV2Phase3Materialization
	slate: AlbumArtworkPaletteV2Phase3Slate
}> {
	const obligations = details.result.diagnostics.identityObligationGraph.obligations
	const descriptors = albumArtworkPaletteV2Phase3DescriptorsFromClosed074(details)
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations)
	const slate = buildAlbumArtworkPaletteV2Phase3Slate(materialization, obligations)
	const base = details.result
	const result: AlbumArtworkPaletteV2Phase3MaterializationResult = {
		...base,
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT_ID,
		protocol: "album-artwork-palette-v2-phase-3-factorized-materialization-v1",
		winner: slate.winner.treatment,
		alternatives: slate.selected.map(({ treatment }) => treatment),
		diagnostics: updateSelectionDiagnostics(base, materialization, slate),
	}
	return { result, materialization, slate }
}

export function extractAlbumArtworkPaletteV2Phase3Materialization(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3MaterializationResult {
	return attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails(
		extractAlbumArtworkPaletteV2074Details(image),
	).result
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT:
	AlbumArtworkPaletteV2Phase3AttemptAdapter = Object.freeze({
		identity: Object.freeze({
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CONFIGURATION_ID,
		}),
		extract: extractAlbumArtworkPaletteV2Phase3Materialization,
	})

if (ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRESERVED_POLICY.selection.rawCardinalityReward !== false) {
	throw new Error("The closed quality policy unexpectedly rewards raw cardinality")
}
