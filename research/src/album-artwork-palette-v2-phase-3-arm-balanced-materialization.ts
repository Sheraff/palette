import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	FieldHypothesis,
	IdentityObligation,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import { ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS } from
	"./album-artwork-palette-v2-protocol.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
	albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata,
	materializeAlbumArtworkPaletteV2Phase3V2,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationV2,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3Materialization,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
	AlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID =
	"album-artwork-palette-v2-phase-3-balanced-materialization-arm-v1" as const

const EVIDENCE_RESOLUTION = 0.04

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind =
	"transition" |
	"endpoint" |
	"role-combination" |
	"representative" |
	"collapse" |
	"field-mode"

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusedStratum = Readonly<{
	kind: AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind
	key: string
	availableCanonicalTreatmentCount: number
	strongestCanonicalTreatmentKey: string
	currentMaterializedCanonicalTreatmentCount: number
	balancedMaterializedCanonicalTreatmentCount: number
	currentStrongestMaterialized: boolean
	balancedStrongestMaterialized: boolean
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusSummary = Readonly<{
	kind: AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind
	availableStratumCount: number
	currentCoveredStratumCount: number
	balancedCoveredStratumCount: number
	currentMaterializedStrongestStratumCount: number
	balancedMaterializedStrongestStratumCount: number
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationDomainDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID
	capacity: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY
	rawCardinalityReward: false
	proposalSourceIsCoverageOnly: true
	canonicalKeys: Readonly<{
		input: readonly string[]
		currentMaterialized: readonly string[]
		balancedMaterialized: readonly string[]
		currentOnly: readonly string[]
		balancedOnly: readonly string[]
	}>
	focusedStrata: readonly AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusedStratum[]
	focusedStrataByKind: readonly AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusSummary[]
	uncoveredStratumKeys: Readonly<{
		current: readonly string[]
		balanced: readonly string[]
	}>
	unmaterializedStrongestStratumKeys: Readonly<{
		current: readonly string[]
		balanced: readonly string[]
	}>
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationDomain = Readonly<{
	current: AlbumArtworkPaletteV2Phase3Materialization
	balanced: AlbumArtworkPaletteV2Phase3MaterializationV2<AlbumArtworkPaletteV2Phase3LogicalDescriptor>
	diagnostics: AlbumArtworkPaletteV2Phase3BalancedMaterializationDomainDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationSourceCoverage = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	inputCanonicalTreatmentCount: number
	currentMaterializedTreatmentCount: number
	balancedMaterializedTreatmentCount: number
	currentSelectedTreatmentCount: number
	balancedSelectedTreatmentCount: number
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationArmDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID
	modules: Readonly<{
		materialization: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION
		selector: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
		custody: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID
	}>
	domain: AlbumArtworkPaletteV2Phase3BalancedMaterializationDomainDiagnostics
	selectedSourceTypes: Readonly<{
		current: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
		balanced: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	}>
	sourceCoverage: readonly AlbumArtworkPaletteV2Phase3BalancedMaterializationSourceCoverage[]
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationArmInput = Readonly<{
	evidence: NativePaletteEvidence
	fieldHypotheses: readonly FieldHypothesis[]
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	identityObligations: readonly IdentityObligation[]
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationLane<
	TMaterialization,
> = Readonly<{
	materialization: TMaterialization
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	custodyMaterialized: readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[]
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationArm = Readonly<{
	current: AlbumArtworkPaletteV2Phase3BalancedMaterializationLane<
		AlbumArtworkPaletteV2Phase3Materialization
	>
	balanced: AlbumArtworkPaletteV2Phase3BalancedMaterializationLane<
		AlbumArtworkPaletteV2Phase3MaterializationV2<AlbumArtworkPaletteV2Phase3LogicalDescriptor>
	>
	roleEvidence: AlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence
	diagnostics: AlbumArtworkPaletteV2Phase3BalancedMaterializationArmDiagnostics
}>

type FocusedStratumState = {
	kind: AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind
	key: string
	canonicalKeys: Set<string>
}

const FOCUS_KINDS: readonly AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind[] = [
	"transition",
	"endpoint",
	"role-combination",
	"representative",
	"collapse",
	"field-mode",
]

const SOURCE_TYPES: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[] = [
	"closed-0.7.4-seed",
	"native-field-transition",
	"band-local-endpoint",
	"field-proposal-v2",
]

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

function sortedKeys(values: Iterable<string>): string[] {
	return [...values].sort(compareAscii)
}

function focusedDescriptorStrata(
	descriptor: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	identityObligations: readonly IdentityObligation[],
): ReadonlyArray<Readonly<{
	kind: AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind
	key: string
}>> {
	const focused: Array<{
		kind: AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusKind
		key: string
	}> = []
	if (descriptor.sourceType === "native-field-transition") {
		focused.push({
			kind: "transition",
			key: `transition:${descriptor.lineage.fieldDirectionKey}`,
		})
	}
	if (descriptor.sourceType === "band-local-endpoint") {
		focused.push({
			kind: "endpoint",
			key: `endpoint:${descriptor.lineage.fieldDirectionKey}`,
		})
	}
	for (const stratum of albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(
		descriptor,
		identityObligations,
	)) {
		switch (stratum.kind) {
			case "foreground-accent-combination":
			case "role-specific-obligation-carrier":
				focused.push({ kind: "role-combination", key: stratum.key })
				break
			case "representative-strategy":
				focused.push({ kind: "representative", key: stratum.key })
				break
			case "legal-collapse-cardinality-form":
				focused.push({ kind: "collapse", key: stratum.key })
				break
			case "field-mode":
				focused.push({ kind: "field-mode", key: stratum.key })
				break
			case "source-field-direction":
			case "field-proposal-source":
				break
		}
	}
	return [...new Map(focused.map((stratum) => [`${stratum.kind}\0${stratum.key}`, stratum])).values()]
		.sort((first, second) => compareAscii(first.kind, second.kind) || compareAscii(first.key, second.key))
}

function domainDiagnostics(
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	identityObligations: readonly IdentityObligation[],
	current: AlbumArtworkPaletteV2Phase3Materialization,
	balanced: AlbumArtworkPaletteV2Phase3MaterializationV2<AlbumArtworkPaletteV2Phase3LogicalDescriptor>,
): AlbumArtworkPaletteV2Phase3BalancedMaterializationDomainDiagnostics {
	const treatmentByKey = new Map<string, CompletePaletteTreatment>()
	const focusedByIdentity = new Map<string, FocusedStratumState>()
	for (const descriptor of logicalDescriptors) {
		const canonicalKey = completeTreatmentKey(descriptor.treatment)
		const incumbent = treatmentByKey.get(canonicalKey)
		if (!incumbent || compareTreatmentQuality(descriptor.treatment, incumbent) < 0) {
			treatmentByKey.set(canonicalKey, descriptor.treatment)
		}
		for (const stratum of focusedDescriptorStrata(descriptor, identityObligations)) {
			const identity = `${stratum.kind}\0${stratum.key}`
			const state = focusedByIdentity.get(identity) ?? {
				kind: stratum.kind,
				key: stratum.key,
				canonicalKeys: new Set<string>(),
			}
			state.canonicalKeys.add(canonicalKey)
			focusedByIdentity.set(identity, state)
		}
	}
	const currentKeys = new Set(current.materialized.map(({ key }) => key))
	const balancedKeys = new Set(balanced.materialized.map(({ key }) => key))
	const focusedStrata = [...focusedByIdentity.values()]
		.sort((first, second) => compareAscii(first.kind, second.kind) || compareAscii(first.key, second.key))
		.map((state): AlbumArtworkPaletteV2Phase3BalancedMaterializationFocusedStratum => {
			const available = [...state.canonicalKeys].sort((first, second) =>
				compareTreatmentQuality(treatmentByKey.get(first)!, treatmentByKey.get(second)!))
			const strongestCanonicalTreatmentKey = available[0]
			return {
				kind: state.kind,
				key: state.key,
				availableCanonicalTreatmentCount: available.length,
				strongestCanonicalTreatmentKey,
				currentMaterializedCanonicalTreatmentCount: available.filter((key) => currentKeys.has(key)).length,
				balancedMaterializedCanonicalTreatmentCount: available.filter((key) => balancedKeys.has(key)).length,
				currentStrongestMaterialized: currentKeys.has(strongestCanonicalTreatmentKey),
				balancedStrongestMaterialized: balancedKeys.has(strongestCanonicalTreatmentKey),
			}
		})
	const inputKeys = sortedKeys(treatmentByKey.keys())
	const currentMaterializedKeys = sortedKeys(currentKeys)
	const balancedMaterializedKeys = sortedKeys(balancedKeys)
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID,
		capacity: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
		rawCardinalityReward: false,
		proposalSourceIsCoverageOnly: true,
		canonicalKeys: {
			input: inputKeys,
			currentMaterialized: currentMaterializedKeys,
			balancedMaterialized: balancedMaterializedKeys,
			currentOnly: currentMaterializedKeys.filter((key) => !balancedKeys.has(key)),
			balancedOnly: balancedMaterializedKeys.filter((key) => !currentKeys.has(key)),
		},
		focusedStrata,
		focusedStrataByKind: FOCUS_KINDS.map((kind) => {
			const strata = focusedStrata.filter((stratum) => stratum.kind === kind)
			return {
				kind,
				availableStratumCount: strata.length,
				currentCoveredStratumCount: strata.filter(({ currentMaterializedCanonicalTreatmentCount }) =>
					currentMaterializedCanonicalTreatmentCount > 0).length,
				balancedCoveredStratumCount: strata.filter(({ balancedMaterializedCanonicalTreatmentCount }) =>
					balancedMaterializedCanonicalTreatmentCount > 0).length,
				currentMaterializedStrongestStratumCount: strata.filter(({ currentStrongestMaterialized }) =>
					currentStrongestMaterialized).length,
				balancedMaterializedStrongestStratumCount: strata.filter(({ balancedStrongestMaterialized }) =>
					balancedStrongestMaterialized).length,
			}
		}),
		uncoveredStratumKeys: {
			current: focusedStrata.filter(({ currentMaterializedCanonicalTreatmentCount }) =>
				currentMaterializedCanonicalTreatmentCount === 0).map(({ key }) => key),
			balanced: focusedStrata.filter(({ balancedMaterializedCanonicalTreatmentCount }) =>
				balancedMaterializedCanonicalTreatmentCount === 0).map(({ key }) => key),
		},
		unmaterializedStrongestStratumKeys: {
			current: focusedStrata.filter(({ currentStrongestMaterialized }) =>
				!currentStrongestMaterialized).map(({ key }) => key),
			balanced: focusedStrata.filter(({ balancedStrongestMaterialized }) =>
				!balancedStrongestMaterialized).map(({ key }) => key),
		},
	}
}

export function materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain(
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	identityObligations: readonly IdentityObligation[],
): AlbumArtworkPaletteV2Phase3BalancedMaterializationDomain {
	const current = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		logicalDescriptors,
		identityObligations,
	)
	const balanced = materializeAlbumArtworkPaletteV2Phase3V2({
		logicalDescriptors,
		identityObligations,
	}, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY)
	return {
		current,
		balanced,
		diagnostics: domainDiagnostics(logicalDescriptors, identityObligations, current, balanced),
	}
}

export function adaptAlbumArtworkPaletteV2Phase3BalancedMaterializationForCustody(
	materialization: AlbumArtworkPaletteV2Phase3MaterializationV2<AlbumArtworkPaletteV2Phase3LogicalDescriptor>,
): readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[] {
	return materialization.materialized.map((candidate) => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.logicalDescriptors,
	}))
}

function adaptCurrentMaterializationForCustody(
	materialization: AlbumArtworkPaletteV2Phase3Materialization,
): readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[] {
	return materialization.materialized.map((candidate) => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	}))
}

function selectedSourceTypes(
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
): AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[] {
	return [...new Set(custody.diagnostics.selected.flatMap(({ sourceTypes }) => sourceTypes))].sort(compareAscii)
}

function sourceCoverage(
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	domain: AlbumArtworkPaletteV2Phase3BalancedMaterializationDomain,
	currentCustody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
	balancedCustody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
): AlbumArtworkPaletteV2Phase3BalancedMaterializationSourceCoverage[] {
	const currentMaterializedKeys = new Set(domain.current.materialized.map(({ key }) => key))
	const balancedMaterializedKeys = new Set(domain.balanced.materialized.map(({ key }) => key))
	const currentSelectedBySource = new Map(SOURCE_TYPES.map((sourceType) => [sourceType, new Set<string>()]))
	const balancedSelectedBySource = new Map(SOURCE_TYPES.map((sourceType) => [sourceType, new Set<string>()]))
	for (const selected of currentCustody.diagnostics.selected) {
		for (const sourceType of selected.sourceTypes) {
			currentSelectedBySource.get(sourceType)!.add(selected.recoveryV2.key)
		}
	}
	for (const selected of balancedCustody.diagnostics.selected) {
		for (const sourceType of selected.sourceTypes) {
			balancedSelectedBySource.get(sourceType)!.add(selected.recoveryV2.key)
		}
	}
	return SOURCE_TYPES.map((sourceType) => {
		const inputKeys = new Set(logicalDescriptors
			.filter((descriptor) => descriptor.sourceType === sourceType)
			.map(({ treatment }) => completeTreatmentKey(treatment)))
		return {
			sourceType,
			inputCanonicalTreatmentCount: inputKeys.size,
			currentMaterializedTreatmentCount: [...inputKeys].filter((key) => currentMaterializedKeys.has(key)).length,
			balancedMaterializedTreatmentCount: [...inputKeys].filter((key) => balancedMaterializedKeys.has(key)).length,
			currentSelectedTreatmentCount: currentSelectedBySource.get(sourceType)!.size,
			balancedSelectedTreatmentCount: balancedSelectedBySource.get(sourceType)!.size,
		}
	})
}

export function runAlbumArtworkPaletteV2Phase3BalancedMaterializationArm(
	input: AlbumArtworkPaletteV2Phase3BalancedMaterializationArmInput,
): AlbumArtworkPaletteV2Phase3BalancedMaterializationArm {
	const domain = materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain(
		input.logicalDescriptors,
		input.identityObligations,
	)
	const roleEvidence = buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence(
		input.evidence,
		input.fieldHypotheses,
	)
	const currentSelector = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		domain.current.materialized.map(({ treatment }) => treatment),
		{ obligations: input.identityObligations },
	)
	const currentCustodyMaterialized = adaptCurrentMaterializationForCustody(domain.current)
	const currentCustody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		currentSelector,
		currentCustodyMaterialized,
		roleEvidence.obligations,
	)
	const balancedSelector = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		domain.balanced.materialized.map(({ treatment }) => treatment),
		{ obligations: input.identityObligations },
	)
	const balancedCustodyMaterialized =
		adaptAlbumArtworkPaletteV2Phase3BalancedMaterializationForCustody(domain.balanced)
	const balancedCustody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		balancedSelector,
		balancedCustodyMaterialized,
		roleEvidence.obligations,
	)
	return {
		current: {
			materialization: domain.current,
			selector: currentSelector,
			custodyMaterialized: currentCustodyMaterialized,
			custody: currentCustody,
		},
		balanced: {
			materialization: domain.balanced,
			selector: balancedSelector,
			custodyMaterialized: balancedCustodyMaterialized,
			custody: balancedCustody,
		},
		roleEvidence,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID,
			modules: {
				materialization: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
				selector: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
				custody: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
			},
			domain: domain.diagnostics,
			selectedSourceTypes: {
				current: selectedSourceTypes(currentCustody),
				balanced: selectedSourceTypes(balancedCustody),
			},
			sourceCoverage: sourceCoverage(
				input.logicalDescriptors,
				domain,
				currentCustody,
				balancedCustody,
			),
		},
	}
}
