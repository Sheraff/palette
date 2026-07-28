import {
	completeTreatmentKey,
	fieldDirectionKey,
	roleDirectionKeys,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	IdentityObligation,
	RecallAuditTreatmentLineage,
} from "./album-artwork-palette-v2.ts"
import { ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS } from
	"./album-artwork-palette-v2-protocol.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3MaterializationV2Input,
	AlbumArtworkPaletteV2Phase3MaterializationV2Module,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION =
	"album-artwork-palette-v2-phase-3-materialization-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY = 1_500 as const

const EVIDENCE_RESOLUTION = 0.04

export type AlbumArtworkPaletteV2Phase3MaterializationV2StratumKind =
	"source-field-direction" |
	"field-proposal-source" |
	"role-specific-obligation-carrier" |
	"foreground-accent-combination" |
	"representative-strategy" |
	"legal-collapse-cardinality-form" |
	"field-mode"

export type AlbumArtworkPaletteV2Phase3MaterializationV2Stratum = Readonly<{
	kind: AlbumArtworkPaletteV2Phase3MaterializationV2StratumKind
	key: string
}>

export type AlbumArtworkPaletteV2Phase3MaterializedTreatmentV2<
	TDescriptor extends AlbumArtworkPaletteV2Phase3LogicalDescriptor =
		AlbumArtworkPaletteV2Phase3LogicalDescriptor,
> = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	logicalDescriptors: readonly TDescriptor[]
	strata: readonly AlbumArtworkPaletteV2Phase3MaterializationV2Stratum[]
}>

export type AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION
	inputLogicalDescriptorCount: number
	uniqueLogicalDescriptorCount: number
	duplicateLogicalDescriptorCount: number
	uniqueCanonicalTreatmentCount: number
	duplicateCanonicalTreatmentCount: number
	capacity: number
	materializedTreatmentCount: number
	truncatedCanonicalTreatmentCount: number
	capacityReached: boolean
	rawCardinalityReward: false
	proposalSourceIsCoverageOnly: true
	usefulStratumCount: number
	strongestReservationCount: number
	strongestMaterializedCount: number
	balancedFillCount: number
	strataByKind: ReadonlyArray<Readonly<{
		kind: AlbumArtworkPaletteV2Phase3MaterializationV2StratumKind
		availableStratumCount: number
		coveredStratumCount: number
	}>>
	strata: ReadonlyArray<Readonly<{
		kind: AlbumArtworkPaletteV2Phase3MaterializationV2StratumKind
		key: string
		availableCanonicalTreatmentCount: number
		materializedCanonicalTreatmentCount: number
		strongestCanonicalTreatmentKey: string
		strongestMaterialized: boolean
	}>>
	uncoveredStratumKeys: readonly string[]
	unmaterializedStrongestStratumKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3MaterializationV2<
	TDescriptor extends AlbumArtworkPaletteV2Phase3LogicalDescriptor =
		AlbumArtworkPaletteV2Phase3LogicalDescriptor,
> = Readonly<{
	materialized: readonly AlbumArtworkPaletteV2Phase3MaterializedTreatmentV2<TDescriptor>[]
	diagnostics: AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function evidenceLevel(value: number): number {
	if (!Number.isFinite(value)) return Number.NEGATIVE_INFINITY
	return Math.floor((value + 1e-12) / EVIDENCE_RESOLUTION)
}

function compareTreatmentQuality(
	first: CompletePaletteTreatment,
	second: CompletePaletteTreatment,
): number {
	for (const block of ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS) {
		const firstLevel = evidenceLevel(first.scores[block] - first.scores.generatedPenalty)
		const secondLevel = evidenceLevel(second.scores[block] - second.scores.generatedPenalty)
		if (firstLevel !== secondLevel) return secondLevel - firstLevel
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

function stableIdentity(value: unknown, seen = new Set<object>()): string {
	if (value === null || typeof value !== "object") {
		if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify(String(value))
		return JSON.stringify(value) ?? String(value)
	}
	if (seen.has(value)) return '"[circular]"'
	seen.add(value)
	const result = Array.isArray(value)
		? `[${value.map((entry) => stableIdentity(entry, seen)).join(",")}]`
		: `{${Object.entries(value as Readonly<Record<string, unknown>>)
			.sort(([first], [second]) => compareAscii(first, second))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableIdentity(entry, seen)}`)
			.join(",")}}`
	seen.delete(value)
	return result
}

function descriptorIdentity(descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor): string {
	const record = descriptor as unknown as Readonly<Record<string, unknown>>
	const extension = Object.fromEntries(Object.entries(record)
		.filter(([key]) => !["sourceType", "treatment", "fieldHypothesis", "lineage"].includes(key)))
	return [
		descriptor.sourceType,
		descriptor.treatment.id,
		descriptor.fieldHypothesis.id,
		lineageIdentity(descriptor.lineage),
		stableIdentity(extension),
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
}

type RoleCarrier = Readonly<{
	obligationId: string
	role: "foreground" | "accent"
}>

function firstString(record: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "string" && value.length > 0) return value
	}
	return null
}

function roleCarriersFromDescriptorExtensions(
	descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
): RoleCarrier[] {
	const treatment = descriptor.treatment
	const carriers = new Map<string, RoleCarrier>()
	const add = (obligationId: string, role: RoleCarrier["role"]): void => {
		if (role === "accent" && treatment.collapse.accent) return
		const key = `${obligationId}\0${role}`
		carriers.set(key, { obligationId, role })
	}
	const visited = new Set<object>()
	const visit = (value: unknown, path: string, depth: number): void => {
		if (depth > 6 || value === null || typeof value !== "object" || visited.has(value)) return
		visited.add(value)
		if (Array.isArray(value)) {
			for (const entry of value) visit(entry, path, depth + 1)
			return
		}
		const record = value as Readonly<Record<string, unknown>>
		const obligationId = firstString(record, ["obligationId", "id"])
		const obligationContext = "obligationId" in record || /obligation|carrier|coverage/iu.test(path)
		if (obligationId && obligationContext && record.covered !== false && record.carried !== false &&
			record.fieldMatches !== false) {
			if (record.foregroundCovered === true) add(obligationId, "foreground")
			if (record.accentCovered === true) add(obligationId, "accent")
			const fieldHypothesisId = firstString(record, ["fieldHypothesisId", "fieldId"])
			const fieldMatches = fieldHypothesisId === null || fieldHypothesisId === treatment.sourceFieldHypothesisId
			const familyId = firstString(record, ["familyId", "carrierFamilyId"])
			const requiredRole = firstString(record, ["carrierRole", "requiredRole", "role"])
			const foregroundMatches = familyId === null || treatment.familyRoles.foreground === familyId
			const accentMatches = !treatment.collapse.accent &&
				(familyId === null || treatment.familyRoles.accent === familyId)
			const directCoverage = record.covered === true || record.carried === true ||
				record.foregroundCovered === true || record.accentCovered === true || familyId !== null
			if (fieldMatches && directCoverage) {
				if ((requiredRole === "foreground" || requiredRole === "ambiguous") && foregroundMatches) {
					add(obligationId, "foreground")
				}
				if ((requiredRole === "accent" || requiredRole === "ambiguous") && accentMatches) {
					add(obligationId, "accent")
				}
			}
		}
		for (const [key, entry] of Object.entries(record).sort(([first], [second]) => compareAscii(first, second))) {
			visit(entry, `${path}.${key}`, depth + 1)
		}
	}
	const record = descriptor as unknown as Readonly<Record<string, unknown>>
	for (const [key, value] of Object.entries(record)) {
		if (["sourceType", "treatment", "fieldHypothesis", "lineage"].includes(key)) continue
		visit(value, key, 0)
	}
	return [...carriers.values()].sort((first, second) =>
		compareAscii(first.obligationId, second.obligationId) || compareAscii(first.role, second.role))
}

function roleCarriers(
	descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	obligations: readonly IdentityObligation[],
): RoleCarrier[] {
	const treatment = descriptor.treatment
	const carriers = new Map<string, RoleCarrier>()
	const add = (obligationId: string, role: RoleCarrier["role"]): void => {
		carriers.set(`${obligationId}\0${role}`, { obligationId, role })
	}
	for (const obligation of obligations) {
		if (treatment.familyRoles.foreground === obligation.familyId) add(obligation.id, "foreground")
		if (!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId) {
			add(obligation.id, "accent")
		}
	}
	for (const carrier of roleCarriersFromDescriptorExtensions(descriptor)) {
		add(carrier.obligationId, carrier.role)
	}
	return [...carriers.values()].sort((first, second) =>
		compareAscii(first.obligationId, second.obligationId) || compareAscii(first.role, second.role))
}

export function albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(
	descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	obligations: readonly IdentityObligation[],
): AlbumArtworkPaletteV2Phase3MaterializationV2Stratum[] {
	validateDescriptor(descriptor)
	const treatment = descriptor.treatment
	const mode = treatment.gradient ? "gradient" : "flat"
	const accentFamily = treatment.collapse.accent ? "=" : treatment.familyRoles.accent
	const strategies = (["background", "surface", "foreground", "accent"] as const)
		.map((role) => `${role}:${treatment[role].strategy}`)
	const strata: AlbumArtworkPaletteV2Phase3MaterializationV2Stratum[] = [
		{
			kind: "source-field-direction",
			key: `source-field-direction:${descriptor.lineage.fieldDirectionKey}`,
		},
		{
			kind: "field-proposal-source",
			key: `field-proposal-source:${descriptor.sourceType}`,
		},
		{
			kind: "foreground-accent-combination",
			key: `foreground-accent-combination:${treatment.familyRoles.foreground}:${accentFamily}`,
		},
		...strategies.map((strategy): AlbumArtworkPaletteV2Phase3MaterializationV2Stratum => ({
			kind: "representative-strategy",
			key: `representative-strategy:${strategy}`,
		})),
		{
			kind: "representative-strategy",
			key: `representative-strategy:complete:${strategies.join("|")}`,
		},
		{
			kind: "legal-collapse-cardinality-form",
			key: [
				"legal-collapse-cardinality-form",
				treatment.fieldTreatment,
				treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
				treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
				`cardinality-${treatment.cardinality}`,
			].join(":"),
		},
		{
			kind: "field-mode",
			key: `field-mode:${mode}`,
		},
	]
	for (const carrier of roleCarriers(descriptor, obligations)) {
		strata.push({
			kind: "role-specific-obligation-carrier",
			key: `role-specific-obligation-carrier:${carrier.obligationId}:${carrier.role}`,
		})
	}
	return [...new Map(strata.map((stratum) => [stratum.key, stratum])).values()]
		.sort((first, second) => compareAscii(first.key, second.key))
}

export function materializeAlbumArtworkPaletteV2Phase3DescriptorsV2<
	TDescriptor extends AlbumArtworkPaletteV2Phase3LogicalDescriptor,
>(
	logicalDescriptors: readonly TDescriptor[],
	identityObligations: readonly IdentityObligation[],
	capacity = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
): AlbumArtworkPaletteV2Phase3MaterializationV2<TDescriptor> {
	if (!Number.isSafeInteger(capacity) || capacity < 1 ||
		capacity > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY) {
		throw new RangeError(
			`Materialization V2 capacity must be between 1 and ${ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY}`,
		)
	}
	if (logicalDescriptors.length === 0) throw new Error("At least one logical descriptor is required")
	const obligations = [...identityObligations].sort((first, second) =>
		compareAscii(first.id, second.id) || compareAscii(first.familyId, second.familyId) ||
		first.priority - second.priority)

	const uniqueDescriptors = new Map<string, TDescriptor>()
	for (const descriptor of logicalDescriptors) {
		validateDescriptor(descriptor)
		const identity = descriptorIdentity(descriptor)
		const incumbent = uniqueDescriptors.get(identity)
		if (!incumbent || compareDescriptors(descriptor, incumbent) < 0) {
			uniqueDescriptors.set(identity, descriptor)
		}
	}

	const descriptorsByCanonicalTreatment = new Map<string, TDescriptor[]>()
	for (const descriptor of uniqueDescriptors.values()) {
		const key = completeTreatmentKey(descriptor.treatment)
		const values = descriptorsByCanonicalTreatment.get(key) ?? []
		values.push(descriptor)
		descriptorsByCanonicalTreatment.set(key, values)
	}
	const canonicalTreatments = [...descriptorsByCanonicalTreatment.entries()].map(([key, values]):
		AlbumArtworkPaletteV2Phase3MaterializedTreatmentV2<TDescriptor> => {
		const rankedDescriptors = values.sort(compareDescriptors)
		const strata = new Map<string, AlbumArtworkPaletteV2Phase3MaterializationV2Stratum>()
		for (const descriptor of rankedDescriptors) {
			for (const stratum of albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(
				descriptor,
				obligations,
			)) strata.set(stratum.key, stratum)
		}
		return {
			key,
			treatment: rankedDescriptors[0].treatment,
			logicalDescriptors: rankedDescriptors,
			strata: [...strata.values()].sort((first, second) => compareAscii(first.key, second.key)),
		}
	}).sort((first, second) =>
		compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))

	const canonicalByStratum = new Map<
		string,
		AlbumArtworkPaletteV2Phase3MaterializedTreatmentV2<TDescriptor>[]
	>()
	const stratumByKey = new Map<string, AlbumArtworkPaletteV2Phase3MaterializationV2Stratum>()
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
	const orderedStratumKeys = [...canonicalByStratum.keys()].sort(compareAscii)

	const selectedKeys = new Set<string>()
	const add = (candidate: AlbumArtworkPaletteV2Phase3MaterializedTreatmentV2<TDescriptor>): void => {
		if (selectedKeys.size < capacity) selectedKeys.add(candidate.key)
	}
	const strongestCounts = new Map<string, number>()
	for (const values of canonicalByStratum.values()) {
		strongestCounts.set(values[0].key, (strongestCounts.get(values[0].key) ?? 0) + 1)
	}
	const strongestReservations = canonicalTreatments
		.filter(({ key }) => strongestCounts.has(key))
		.sort((first, second) =>
			(strongestCounts.get(second.key) ?? 0) - (strongestCounts.get(first.key) ?? 0) ||
			compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))
	for (const candidate of strongestReservations) add(candidate)
	const strongestMaterializedCount = strongestReservations.filter(({ key }) => selectedKeys.has(key)).length

	let depth = 1
	const maximumDepth = Math.max(0, ...[...canonicalByStratum.values()].map(({ length }) => length - 1))
	while (selectedKeys.size < capacity && depth <= maximumDepth) {
		const roundCounts = new Map<string, number>()
		for (const key of orderedStratumKeys) {
			const candidate = canonicalByStratum.get(key)?.[depth]
			if (candidate && !selectedKeys.has(candidate.key)) {
				roundCounts.set(candidate.key, (roundCounts.get(candidate.key) ?? 0) + 1)
			}
		}
		if (roundCounts.size === 0) {
			depth++
			continue
		}
		const round = canonicalTreatments
			.filter(({ key }) => roundCounts.has(key))
			.sort((first, second) =>
				(roundCounts.get(second.key) ?? 0) - (roundCounts.get(first.key) ?? 0) ||
				compareTreatmentQuality(first.treatment, second.treatment) || compareAscii(first.key, second.key))
		for (const candidate of round) add(candidate)
		depth++
	}
	for (const candidate of canonicalTreatments) add(candidate)

	const materialized = canonicalTreatments.filter(({ key }) => selectedKeys.has(key))
	const diagnosticsStrata = orderedStratumKeys.map((key) => {
		const available = canonicalByStratum.get(key)!
		return {
			kind: stratumByKey.get(key)!.kind,
			key,
			availableCanonicalTreatmentCount: available.length,
			materializedCanonicalTreatmentCount: available.filter(({ key: candidateKey }) =>
				selectedKeys.has(candidateKey)).length,
			strongestCanonicalTreatmentKey: available[0].key,
			strongestMaterialized: selectedKeys.has(available[0].key),
		}
	})
	const kinds: readonly AlbumArtworkPaletteV2Phase3MaterializationV2StratumKind[] = [
		"source-field-direction",
		"field-proposal-source",
		"role-specific-obligation-carrier",
		"foreground-accent-combination",
		"representative-strategy",
		"legal-collapse-cardinality-form",
		"field-mode",
	]
	const uncoveredStratumKeys = diagnosticsStrata
		.filter(({ materializedCanonicalTreatmentCount }) => materializedCanonicalTreatmentCount === 0)
		.map(({ key }) => key)
	const unmaterializedStrongestStratumKeys = diagnosticsStrata
		.filter(({ strongestMaterialized }) => !strongestMaterialized)
		.map(({ key }) => key)
	const duplicateLogicalDescriptorCount = logicalDescriptors.length - uniqueDescriptors.size
	const duplicateCanonicalTreatmentCount = uniqueDescriptors.size - canonicalTreatments.length
	return {
		materialized,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
			inputLogicalDescriptorCount: logicalDescriptors.length,
			uniqueLogicalDescriptorCount: uniqueDescriptors.size,
			duplicateLogicalDescriptorCount,
			uniqueCanonicalTreatmentCount: canonicalTreatments.length,
			duplicateCanonicalTreatmentCount,
			capacity,
			materializedTreatmentCount: materialized.length,
			truncatedCanonicalTreatmentCount: canonicalTreatments.length - materialized.length,
			capacityReached: materialized.length === capacity,
			rawCardinalityReward: false,
			proposalSourceIsCoverageOnly: true,
			usefulStratumCount: diagnosticsStrata.length,
			strongestReservationCount: strongestReservations.length,
			strongestMaterializedCount,
			balancedFillCount: materialized.length - strongestMaterializedCount,
			strataByKind: kinds.map((kind) => {
				const values = diagnosticsStrata.filter((stratum) => stratum.kind === kind)
				return {
					kind,
					availableStratumCount: values.length,
					coveredStratumCount: values.filter(({ materializedCanonicalTreatmentCount }) =>
						materializedCanonicalTreatmentCount > 0).length,
				}
			}),
			strata: diagnosticsStrata,
			uncoveredStratumKeys,
			unmaterializedStrongestStratumKeys,
		},
	}
}

export function materializeAlbumArtworkPaletteV2Phase3V2<
	TDescriptor extends AlbumArtworkPaletteV2Phase3LogicalDescriptor =
		AlbumArtworkPaletteV2Phase3LogicalDescriptor,
>(
	input: Readonly<{
		logicalDescriptors: readonly TDescriptor[]
		identityObligations: readonly IdentityObligation[]
	}>,
	capacity = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
): AlbumArtworkPaletteV2Phase3MaterializationV2<TDescriptor> {
	return materializeAlbumArtworkPaletteV2Phase3DescriptorsV2(
		input.logicalDescriptors,
		input.identityObligations,
		capacity,
	)
}

const materializationV2Module = Object.freeze({
	materialize(input: AlbumArtworkPaletteV2Phase3MaterializationV2Input) {
		return materializeAlbumArtworkPaletteV2Phase3V2(input)
	},
}) satisfies AlbumArtworkPaletteV2Phase3MaterializationV2Module<
	AlbumArtworkPaletteV2Phase3MaterializationV2
>

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2 = materializationV2Module
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_MODULE = materializationV2Module
