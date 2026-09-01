import { completeTreatmentKey, fieldDirectionKey, roleDirectionKeys } from "./palette-core.ts";

import type { CompletePaletteTreatment, FieldHypothesis, IdentityObligation, TreatmentLineage } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "./policy.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY = 1_500 as const

const EVIDENCE_RESOLUTION = ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence

export type AlbumArtworkPaletteV2Phase3LogicalDescriptor = Readonly<{
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: TreatmentLineage
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

export type AlbumArtworkPaletteV2Phase3Materialization = Readonly<{
	materialized: readonly AlbumArtworkPaletteV2Phase3MaterializedTreatment[]
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
	block: typeof ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS[number],
): number {
	return treatment.scores[block] - treatment.scores.generatedPenalty
}

function compareTreatmentQuality(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): number {
	for (const block of ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS) {
		const comparison = evidenceLevel(effectiveScore(second, block)) -
			evidenceLevel(effectiveScore(first, block))
		if (comparison !== 0) return comparison
	}
	return compareAscii(completeTreatmentKey(first), completeTreatmentKey(second)) ||
		compareAscii(first.id, second.id)
}

function lineageIdentity(lineage: TreatmentLineage): string {
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
	for (const candidate of canonicalTreatments) {
		for (const stratum of candidate.strata) {
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
	return { materialized }
}
