import { createHash } from "node:crypto"
import type {
	AlbumArtworkPaletteV2FactorizedParetoAudit,
	AlbumArtworkPaletteV2RecallAudit,
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
	FactorizedPareto6000TriggerCertificate,
	FactorizedParetoLogicalCounts,
	FactorizedParetoTruncationWitnesses,
	FactorizedParetoUpstreamCertificate,
	RecallAuditDomain,
	RecallAuditNewTreatment,
	AlbumArtworkPaletteV2RecallRegistry,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
} from "./album-artwork-palette-v2-0.7.3-protocol.ts"

export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION = 1 as const
export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT = 6 as const
export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_STDIO_LIMIT_BYTES = 64 * 1024
export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_CALIBRATION_TIMEOUT_MS = 150_000

export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_IMPLEMENTATION_PATHS = Object.freeze([
	"research/src/album-artwork-palette-v2.ts",
	"research/src/album-artwork-palette-v2-protocol.ts",
	"research/src/album-artwork-palette-v2-0.7.3-protocol.ts",
	"research/src/album-artwork-palette-v2-0.7.3-artifact.ts",
	"research/src/color.ts",
	"research/src/native-resolution-image.ts",
	"research/src/types.ts",
	"research/album-artwork-palette-v2-0.7.3-development-child.ts",
	"research/evaluate-album-artwork-palette-v2-0.7.3-development.ts",
	"research/analyze-album-artwork-palette-v2-0.7.3-development.ts",
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_3.md",
	"research/tests/album-artwork-palette-v2-0.7.3-recall.test.ts",
	"research/tests/album-artwork-palette-v2-0.7.3-artifact.test.ts",
	"package.json",
	"pnpm-lock.yaml",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS = Object.freeze(
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER.slice(1, 5).map(({ id }) => id),
) as readonly [
	"all-existing-representative-strategies",
	"all-retained-representative-cross-pairs",
	"widened-field-hypothesis-retention",
	"widened-family-lane-retention",
]

export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_SELECTION_ARMS = Object.freeze([
	...ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS,
	"factorized-pareto-3000",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS = Object.freeze({
	developmentPanel: Object.freeze({
		path: "research/data/album-artwork-palette-v2-development-panel.json",
		manifestId: "bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305",
		rawSha256: "9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4",
		sourceCount: 28,
	}),
	protectedSamples: Object.freeze([
		Object.freeze({
			path: "research/data/album-artwork-palette-v2-fresh-sample.sealed.json",
			manifestId: "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91",
			rawSha256: "6625aea0e38b93f6830a349468681a5dc6e93c99fe4bc3f38ca66ad23e0d16f3",
		}),
		Object.freeze({
			path: "research/data/album-artwork-palette-v2-future-sample-02.sealed.json",
			manifestId: "9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671",
			rawSha256: "2224603f5a4801cedf9f96375e86f2dd5624ed6895ab941fbcad5c6d8646fc8c",
		}),
		Object.freeze({
			path: "research/data/album-artwork-palette-v2-future-sample-03.sealed.json",
			manifestId: "bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060",
			rawSha256: "690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183",
		}),
	]),
	frozenControl: Object.freeze({
		version: "album-artwork-first-principles-0.7.2",
		implementationSha256: "6b29ebc3f6e88e170a3d283009d3e5868c8fa92e72efb350c5dc0abe6750e28e",
		scientificSha256: "fdc4207bd1e4d4d3431fd6c1ced031aa32d9593cabd33f6a6164938a610a72c8",
		files: Object.freeze({
			summary: Object.freeze({
				path: "research/data/experiments/album-artwork-palette-v2-0.7.2-development/summary.json",
				rawSha256: "0974ef010e58fb1e4558748e07746e28a4d6cf7959dddac44c708d064036d636",
			}),
			aggregate: Object.freeze({
				path: "research/data/experiments/album-artwork-palette-v2-0.7.2-development/aggregate.json",
				rawSha256: "f0e8bb06accb8b7a7eb0c02955ddbf00e015655751b013581fb18454eb40d9d3",
			}),
			analysis: Object.freeze({
				path: "research/data/experiments/album-artwork-palette-v2-0.7.2-development/development-analysis.json",
				rawSha256: "6aa97a83217aee20852c1a371d05909cf11e28f74ebdcd0826b0fb72162c25b0",
			}),
			protocol: Object.freeze({
				path: "research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_2.md",
				rawSha256: "07017658a2b3b0b702bb5ac73c43e5a4f931d5429be9898ae318b6341a34c7b0",
			}),
			postmortem: Object.freeze({
				path: "research/ALBUM_ARTWORK_UI_PALETTE_0_7_2_COMPLETE_QUALITY_DOMAIN_POSTMORTEM.md",
				rawSha256: "f3449b8306c09622dc07c56814620cf2b0f4009301c724729fc4249f63841f0e",
			}),
		}),
	}),
})

export type AlbumArtworkPaletteV2073SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

export type AlbumArtworkPaletteV2073DevelopmentManifest = Readonly<{
	manifestId: string
	sourceCount: number
	sources: readonly AlbumArtworkPaletteV2073SourceRecord[]
}>

export type AlbumArtworkPaletteV2073RunEvidence = Readonly<{
	wallMs: readonly [number, number]
	deterministicRepeatedRun: true
	fullOutputSha256: string
	repeatFullOutputSha256: string
	scientificSha256: string
	repeatScientificSha256: string
}>

export type AlbumArtworkPaletteV2073ControlScientific = Readonly<{
	controlExtraction: AlbumArtworkPaletteV2Result
	control: RecallAuditDomain
}>

export type AlbumArtworkPaletteV2073RecallScientific = Readonly<{
	arm: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS[number]
	changedStages: RecallAuditDomain["changedStages"]
	domain: Readonly<{
		rawCandidateCount: number
		materializedCandidateCount: number
		capacity: number
		capacityReached: boolean
		addedCompleteTreatmentKeys: readonly string[]
		ordinaryParetoAddedKeys: readonly string[]
		publicSlateKeys: readonly string[]
		qualityIncumbentTreatmentId: string
	}>
	additions: readonly RecallAuditNewTreatment[]
	registry: AlbumArtworkPaletteV2RecallRegistry
	availability: Readonly<{
		fieldDirectionKeys: readonly string[]
		roleDirectionKeys: readonly string[]
		identityObligationRoleDirectionKeys: readonly string[]
		cellCount: number
		cellOrderedRoot: string
	}>
	custody: Readonly<{
		cellCount: number
		fullCellOrderedRoot: string
		stageNames: readonly string[]
		templates: ReadonlyArray<Readonly<{
			stages: ReadonlyArray<Readonly<{
			stage: string
			status: "available" | "unavailable" | "bypassed"
			reason: string
			}>>
			firstLossStage: string | null
			firstLossReason: string | null
		}>>
		templateRuns: readonly (readonly [templateIndex: number, runLength: number])[]
	}>
}>

export type AlbumArtworkPaletteV2073RecallArmArtifact = Readonly<{
	controlScientificSha256: string
	scientific: AlbumArtworkPaletteV2073RecallScientific
	run: AlbumArtworkPaletteV2073RunEvidence
}>

export type AlbumArtworkPaletteV2073DiagnosticScientific = Readonly<{
	arm: "diagnostic-joint-availability-matrix"
	selectionEligible: false
	completedFromRecallArms: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS
	matrices: ReadonlyArray<Readonly<{
		arm: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS[number]
		fieldDirectionCount: number
		roleDirectionCount: number
		cellCount: number
		registrySha256: string
		matrixSha256: string
		custodySha256: string
	}>>
}>

export type AlbumArtworkPaletteV2073FactorizedScientific = Readonly<{
	arm: "factorized-pareto-3000" | "factorized-pareto-6000"
	domain: Readonly<{
		checkpoint: 3_000 | 6_000
		rawCandidateCount: number
		materializedCandidateCount: number
		capacity: number
		capacityReached: boolean
		addedCompleteTreatmentKeys: readonly string[]
		publicSlateKeys: readonly string[]
		qualityIncumbentTreatmentId: string
	}>
	registry: AlbumArtworkPaletteV2RecallRegistry
	upstream: FactorizedParetoUpstreamCertificate
	logical: FactorizedParetoLogicalCounts
	truncationWitnesses: FactorizedParetoTruncationWitnesses
	additions: readonly RecallAuditNewTreatment[]
	escalation: FactorizedPareto6000TriggerCertificate
}>

export type AlbumArtworkPaletteV2073FactorizedArmArtifact = Readonly<{
	controlScientificSha256: string
	recomputed3000ScientificSha256?: string
	certificateRecomputationWallMs?: number
	scientific: AlbumArtworkPaletteV2073FactorizedScientific
	run: AlbumArtworkPaletteV2073RunEvidence
}>

export type AlbumArtworkPaletteV2073CalibrationArtifact = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	phase: "calibration"
	implementationSha256: string
	source: AlbumArtworkPaletteV2073SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	frozenSourceArtifactRawSha256: string
	controlScientificSha256: string
	frozenControlExtractionSha256: string
	run: AlbumArtworkPaletteV2073RunEvidence
}>

export type AlbumArtworkPaletteV2073ControlArtifact = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	phase: "control"
	implementationSha256: string
	executionManifestId: string
	source: AlbumArtworkPaletteV2073SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	control: AlbumArtworkPaletteV2073ControlScientific
	controlScientificSha256: string
	frozenControlExtractionSha256: string
	run: AlbumArtworkPaletteV2073RunEvidence
}>

export type AlbumArtworkPaletteV2073RecallArtifact = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	phase: "recall"
	implementationSha256: string
	executionManifestId: string
	sourceCaseId: string
	arms: readonly AlbumArtworkPaletteV2073RecallArmArtifact[]
	diagnostic: Readonly<{
		scientific: AlbumArtworkPaletteV2073DiagnosticScientific
		run: AlbumArtworkPaletteV2073RunEvidence
	}>
}>

export type AlbumArtworkPaletteV2073FactorizedArtifact = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	phase: "factorized-3000" | "factorized-6000"
	implementationSha256: string
	executionManifestId: string
	sourceCaseId: string
	arm: AlbumArtworkPaletteV2073FactorizedArmArtifact
}>

export type AlbumArtworkPaletteV2073SourceArtifact = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION
	protocolId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID
	auditId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID
	implementationSha256: string
	executionManifestId: string
	source: AlbumArtworkPaletteV2073SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	control: AlbumArtworkPaletteV2073ControlArtifact
	recallArms: readonly AlbumArtworkPaletteV2073RecallArmArtifact[]
	diagnostic: AlbumArtworkPaletteV2073RecallArtifact["diagnostic"]
	factorized3000: AlbumArtworkPaletteV2073FactorizedArmArtifact
	factorized6000: AlbumArtworkPaletteV2073FactorizedArmArtifact | null
	scientificSha256: string
}>

export type AlbumArtworkPaletteV2073ExecutionManifest = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION
	protocolId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID
	auditId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID
	mode: "full-28-source" | "one-source-smoke"
	workerCount: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT
	fixedPanelSourceCount: 28
	executedSourceCount: number
	sourceCaseIds: readonly string[]
	implementationSha256: string
	frozenBindings: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS
	calibration: Readonly<{
		formula: "max(60000,ceil(6*maximumCalibrationWallMs/1000)*1000)"
		maximumCalibrationWallMs: number
		wallCeilingMsPerArmPerSource: number
		sources: ReadonlyArray<Readonly<{
			caseId: string
			sourceSha256: string
			frozenSourceArtifactRawSha256: string
			controlScientificSha256: string
			wallMs: readonly [number, number]
			fullOutputSha256: string
			repeatFullOutputSha256: string
		}>>
	}>
	executionManifestId: string
}>

export type AlbumArtworkPaletteV2073ArmSummary = Readonly<{
	arm: string
	selectionEligible: boolean
	executedSourceCount: number
	qualifyingSourceCount: number
	qualifyingSourceCaseIds: readonly string[]
	addedUniqueCanonicalKeyCount: number
	meanWallMs: number
	pass: boolean
}>

export type AlbumArtworkPaletteV2073Results = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION
	implementationSha256: string
	executionManifestId: string
	fixedPanelSourceCount: 28
	executedSourceCount: number
	scientificSha256: string
	arms: readonly AlbumArtworkPaletteV2073ArmSummary[]
	factorizedEscalation: Readonly<{
		factorized3000QualifyingSourceCount: number
		exactSourceBoundTriggerCaseIds: readonly string[]
		factorized6000ExecutedCaseIds: readonly string[]
		executed: boolean
		policySatisfied: boolean
	}>
	selection: Readonly<{
		gateThreshold: 3
		gateDenominator: 28
		fullPanelEligible: boolean
		selectedArm: string | null
		pass: boolean
	}>
	authorization: Readonly<{
		humanReview: false
		directionalSample: false
		phase5: false
		promotion: false
		persistence: false
		fullRoster: false
	}>
	resultsId: string
}>

export function albumArtworkPaletteV2073Sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function albumArtworkPaletteV2073CanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(albumArtworkPaletteV2073CanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) =>
		`${JSON.stringify(key)}:${albumArtworkPaletteV2073CanonicalJson(record[key])}`).join(",")}}`
}

function updateJsonHash(hash: ReturnType<typeof createHash>, value: unknown, canonical: boolean): void {
	if (value === null || typeof value !== "object") {
		hash.update(JSON.stringify(value) ?? "null")
		return
	}
	if (Array.isArray(value)) {
		hash.update("[")
		for (const [index, entry] of value.entries()) {
			if (index > 0) hash.update(",")
			updateJsonHash(hash, entry, canonical)
		}
		hash.update("]")
		return
	}
	const record = value as Record<string, unknown>
	const keys = Object.keys(record).filter((key) => record[key] !== undefined)
	if (canonical) keys.sort()
	hash.update("{")
	for (const [index, key] of keys.entries()) {
		if (index > 0) hash.update(",")
		hash.update(JSON.stringify(key))
		hash.update(":")
		updateJsonHash(hash, record[key], canonical)
	}
	hash.update("}")
}

export function albumArtworkPaletteV2073ByteJsonSha256(value: unknown): string {
	const hash = createHash("sha256")
	updateJsonHash(hash, value, false)
	return hash.digest("hex")
}

export function albumArtworkPaletteV2073ScientificSha256(value: unknown): string {
	const hash = createHash("sha256")
	updateJsonHash(hash, value, true)
	return hash.digest("hex")
}

export function albumArtworkPaletteV2073OrderedValueRoot(domain: string, values: Iterable<unknown>): string {
	let root = albumArtworkPaletteV2073Sha256(domain)
	let index = 0
	for (const value of values) {
		root = albumArtworkPaletteV2073Sha256(
			`${root}\0${index}\0${albumArtworkPaletteV2073ScientificSha256(value)}`,
		)
		index += 1
	}
	return root
}

export function albumArtworkPaletteV2073ContentId(
	value: object,
	idField: string,
): string {
	const identity = { ...value } as Record<string, unknown>
	delete identity[idField]
	return albumArtworkPaletteV2073ScientificSha256(identity)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex.toLowerCase(),
		treatment.surface.hex.toLowerCase(),
		treatment.foreground.hex.toLowerCase(),
		treatment.accent.hex.toLowerCase(),
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

export function projectAlbumArtworkPaletteV2073Control(
	audit: AlbumArtworkPaletteV2RecallAudit | AlbumArtworkPaletteV2FactorizedParetoAudit,
): AlbumArtworkPaletteV2073ControlScientific {
	return { controlExtraction: audit.controlExtraction, control: audit.control }
}

export function projectAlbumArtworkPaletteV2073Recall(
	audit: AlbumArtworkPaletteV2RecallAudit,
): AlbumArtworkPaletteV2073RecallScientific {
	if (audit.arm === "control-0.7.2") throw new Error("Control is not a treatment-arm projection")
	const controlKeys = new Set(audit.control.completeTreatmentKeys)
	const custodyTemplates: AlbumArtworkPaletteV2073RecallScientific["custody"]["templates"][number][] = []
	const custodyTemplateIndexes: number[] = []
	for (const entry of audit.custody) {
		const template = {
			stages: entry.stages.map(({ stage, status, reason }) => ({ stage, status, reason })),
			firstLossStage: entry.firstLossStage,
			firstLossReason: entry.firstLossReason,
		}
		const canonical = albumArtworkPaletteV2073CanonicalJson(template)
		let templateIndex = custodyTemplates.findIndex((candidate) =>
			albumArtworkPaletteV2073CanonicalJson(candidate) === canonical)
		if (templateIndex < 0) {
			templateIndex = custodyTemplates.length
			custodyTemplates.push(template)
		}
		custodyTemplateIndexes.push(templateIndex)
	}
	const templateRuns: [number, number][] = []
	for (const templateIndex of custodyTemplateIndexes) {
		const prior = templateRuns[templateRuns.length - 1]
		if (prior?.[0] === templateIndex) prior[1] += 1
		else templateRuns.push([templateIndex, 1])
	}
	return {
		arm: audit.arm,
		changedStages: audit.treatment.changedStages,
		domain: {
			rawCandidateCount: audit.treatment.rawCandidateCount,
			materializedCandidateCount: audit.treatment.materializedCandidateCount,
			capacity: audit.treatment.capacity,
			capacityReached: audit.treatment.capacityReached,
			addedCompleteTreatmentKeys: audit.treatment.completeTreatmentKeys.filter((key) => !controlKeys.has(key)),
			ordinaryParetoAddedKeys: audit.treatment.ordinaryParetoTreatmentKeys.filter((key) => !controlKeys.has(key)),
			publicSlateKeys: audit.treatment.publicSlate.map(treatmentKey),
			qualityIncumbentTreatmentId: audit.treatment.qualityIncumbentTreatmentId,
		},
		additions: audit.newTreatments,
		registry: audit.registry,
		availability: {
			fieldDirectionKeys: audit.availability.fieldDirectionKeys,
			roleDirectionKeys: audit.availability.roleDirectionKeys,
			identityObligationRoleDirectionKeys: audit.availability.identityObligationRoleDirectionKeys,
			cellCount: audit.availability.cells.length,
			cellOrderedRoot: albumArtworkPaletteV2073OrderedValueRoot(
				"album-artwork-palette-v2-0.7.3-availability-cells-v1",
				audit.availability.cells,
			),
		},
		custody: {
			cellCount: audit.custody.length,
			fullCellOrderedRoot: albumArtworkPaletteV2073OrderedValueRoot(
				"album-artwork-palette-v2-0.7.3-custody-cells-v1",
				audit.custody,
			),
			stageNames: audit.custody[0]?.stages.map(({ stage }) => stage) ?? [],
			templates: custodyTemplates,
			templateRuns,
		},
	}
}

export function projectAlbumArtworkPaletteV2073Diagnostic(
	arms: readonly AlbumArtworkPaletteV2073RecallScientific[],
): AlbumArtworkPaletteV2073DiagnosticScientific {
	return {
		arm: "diagnostic-joint-availability-matrix",
		selectionEligible: false,
		completedFromRecallArms: ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS,
		matrices: arms.map((arm) => ({
			arm: arm.arm,
			fieldDirectionCount: arm.availability.fieldDirectionKeys.length,
			roleDirectionCount: arm.availability.roleDirectionKeys.length,
			cellCount: arm.availability.cellCount,
			registrySha256: albumArtworkPaletteV2073ScientificSha256(arm.registry),
			matrixSha256: albumArtworkPaletteV2073ScientificSha256(arm.availability),
			custodySha256: albumArtworkPaletteV2073ScientificSha256(arm.custody),
		})),
	}
}

export function projectAlbumArtworkPaletteV2073Factorized(
	audit: AlbumArtworkPaletteV2FactorizedParetoAudit,
): AlbumArtworkPaletteV2073FactorizedScientific {
	const controlKeys = new Set(audit.control.completeTreatmentKeys)
	return {
		arm: audit.arm,
		domain: {
			checkpoint: audit.treatment.checkpoint,
			rawCandidateCount: audit.treatment.rawCandidateCount,
			materializedCandidateCount: audit.treatment.materializedCandidateCount,
			capacity: audit.treatment.capacity,
			capacityReached: audit.treatment.capacityReached,
			addedCompleteTreatmentKeys: audit.treatment.completeTreatmentKeys.filter((key) => !controlKeys.has(key)),
			publicSlateKeys: audit.treatment.publicSlate.map(treatmentKey),
			qualityIncumbentTreatmentId: audit.treatment.qualityIncumbentTreatmentId,
		},
		registry: audit.registry,
		upstream: audit.upstream,
		logical: audit.logical,
		truncationWitnesses: audit.truncationWitnesses,
		additions: audit.retainedAdditions,
		escalation: audit.escalation,
	}
}

export function albumArtworkPaletteV2073SourceScientificIdentity(
	artifact: Omit<AlbumArtworkPaletteV2073SourceArtifact, "scientificSha256">,
): unknown {
	return {
		sourceSha256: artifact.source.sha256,
		control: artifact.control.control,
		recallArms: artifact.recallArms.map(({ scientific }) => scientific),
		diagnostic: artifact.diagnostic.scientific,
		factorized3000: artifact.factorized3000.scientific,
		factorized6000: artifact.factorized6000?.scientific ?? null,
	}
}

export type AlbumArtworkPaletteV2073ResultSourceEvidence = Readonly<{
	caseId: string
	sourceSha256: string
	scientificSha256: string
	arms: ReadonlyArray<Readonly<{
		arm: string
		wallMs: readonly [number, number]
		additionKeys: readonly string[]
		qualifies: boolean
	}>>
	factorized3000Escalation: FactorizedPareto6000TriggerCertificate
	factorized6000Present: boolean
}>

export function albumArtworkPaletteV2073ResultSourceEvidence(
	source: AlbumArtworkPaletteV2073SourceArtifact,
): AlbumArtworkPaletteV2073ResultSourceEvidence {
	return {
		caseId: source.source.caseId,
		sourceSha256: source.source.sha256,
		scientificSha256: source.scientificSha256,
		arms: [
			{ arm: "control-0.7.2", wallMs: source.control.run.wallMs, additionKeys: [], qualifies: false },
			...source.recallArms.map(({ scientific, run }) => ({
				arm: scientific.arm,
				wallMs: run.wallMs,
				additionKeys: scientific.additions.map(({ key }) => key),
				qualifies: scientific.additions.some(({ qualification }) => qualification.qualifies),
			})),
			{
				arm: "diagnostic-joint-availability-matrix",
				wallMs: source.diagnostic.run.wallMs,
				additionKeys: [],
				qualifies: false,
			},
			{
				arm: "factorized-pareto-3000",
				wallMs: source.factorized3000.run.wallMs,
				additionKeys: source.factorized3000.scientific.additions.map(({ key }) => key),
				qualifies: source.factorized3000.scientific.additions.some(({ qualification }) => qualification.qualifies),
			},
			...source.factorized6000 === null ? [] : [{
				arm: "factorized-pareto-6000",
				wallMs: source.factorized6000.run.wallMs,
				additionKeys: source.factorized6000.scientific.additions.map(({ key }) => key),
				qualifies: source.factorized6000.scientific.additions.some(({ qualification }) => qualification.qualifies),
			}],
		],
		factorized3000Escalation: source.factorized3000.scientific.escalation,
		factorized6000Present: source.factorized6000 !== null,
	}
}

function armSummary(
	arm: string,
	selectionEligible: boolean,
	sources: readonly AlbumArtworkPaletteV2073ResultSourceEvidence[],
): AlbumArtworkPaletteV2073ArmSummary {
	const entries = sources.flatMap((source) => {
		const artifact = source.arms.find((entry) => entry.arm === arm)
		return artifact === undefined ? [] : [{ source, artifact }]
	})
	const qualifyingSourceCaseIds = entries
		.filter(({ artifact }) => artifact.qualifies)
		.map(({ source }) => source.caseId)
	const addedKeys = new Set(entries.flatMap(({ source, artifact }) =>
		artifact.additionKeys.map((key) => `${source.caseId}\0${key}`)))
	const wallValues = entries.flatMap(({ artifact }) => artifact.wallMs)
	return {
		arm,
		selectionEligible,
		executedSourceCount: entries.length,
		qualifyingSourceCount: qualifyingSourceCaseIds.length,
		qualifyingSourceCaseIds,
		addedUniqueCanonicalKeyCount: addedKeys.size,
		meanWallMs: wallValues.length === 0 ? 0 : wallValues.reduce((sum, value) => sum + value, 0) / wallValues.length,
		pass: selectionEligible && qualifyingSourceCaseIds.length >= 3 && sources.length === 28,
	}
}

export function buildAlbumArtworkPaletteV2073Results(
	execution: AlbumArtworkPaletteV2073ExecutionManifest,
	sources: readonly AlbumArtworkPaletteV2073SourceArtifact[],
): AlbumArtworkPaletteV2073Results {
	return buildAlbumArtworkPaletteV2073ResultsFromEvidence(
		execution,
		sources.map(albumArtworkPaletteV2073ResultSourceEvidence),
	)
}

export function buildAlbumArtworkPaletteV2073ResultsFromEvidence(
	execution: AlbumArtworkPaletteV2073ExecutionManifest,
	sources: readonly AlbumArtworkPaletteV2073ResultSourceEvidence[],
): AlbumArtworkPaletteV2073Results {
	const baseArms = ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER.map(({ id, selectionEligible }) =>
		armSummary(id, selectionEligible, sources))
	const has6000 = sources.some(({ factorized6000Present }) => factorized6000Present)
	const arms = has6000
		? [...baseArms, armSummary("factorized-pareto-6000", true, sources)]
		: baseArms
	const factorized3000 = arms.find(({ arm }) => arm === "factorized-pareto-3000")!
	const exactSourceBoundTriggerCaseIds = sources.filter(({ factorized3000Escalation: certificate }) => {
		return certificate.trigger6000 && certificate.exactCheckpointOnlyProof &&
			certificate.reason === "verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint" &&
			certificate.witnesses.otherwiseQualifyingTreatmentKeys.length > 0 &&
			certificate.witnesses.otherwiseQualifyingCellKeys.length > 0 &&
			certificate.verifiedTriggerToken !== null
	}).map(({ caseId }) => caseId)
	const factorized6000ExecutedCaseIds = sources
		.filter(({ factorized6000Present }) => factorized6000Present)
		.map(({ caseId }) => caseId)
	const shouldEscalate = factorized3000.qualifyingSourceCount < 3 && exactSourceBoundTriggerCaseIds.length > 0
	const factorizedArm = shouldEscalate ? arms.find(({ arm }) => arm === "factorized-pareto-6000") : factorized3000
	const selectionOrder = [
		...ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS,
		factorizedArm?.arm ?? "factorized-pareto-3000",
	]
	const selectedArm = selectionOrder.find((arm) => arms.find((entry) => entry.arm === arm)?.pass) ?? null
	const scientificSha256 = albumArtworkPaletteV2073ScientificSha256(sources.map(({ caseId, sourceSha256, scientificSha256 }) => ({
		caseId,
		sourceSha256,
		scientificSha256,
	})))
	const withoutId = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
		implementationSha256: execution.implementationSha256,
		executionManifestId: execution.executionManifestId,
		fixedPanelSourceCount: 28 as const,
		executedSourceCount: sources.length,
		scientificSha256,
		arms,
		factorizedEscalation: {
			factorized3000QualifyingSourceCount: factorized3000.qualifyingSourceCount,
			exactSourceBoundTriggerCaseIds,
			factorized6000ExecutedCaseIds,
			executed: has6000,
			policySatisfied: shouldEscalate === has6000 && (!has6000 ||
				albumArtworkPaletteV2073CanonicalJson(factorized6000ExecutedCaseIds) ===
					albumArtworkPaletteV2073CanonicalJson(exactSourceBoundTriggerCaseIds)),
		},
		selection: {
			gateThreshold: 3 as const,
			gateDenominator: 28 as const,
			fullPanelEligible: execution.mode === "full-28-source" && sources.length === 28,
			selectedArm,
			pass: selectedArm !== null,
		},
		authorization: {
			humanReview: false as const,
			directionalSample: false as const,
			phase5: false as const,
			promotion: false as const,
			persistence: false as const,
			fullRoster: false as const,
		},
	}
	return { ...withoutId, resultsId: albumArtworkPaletteV2073ScientificSha256(withoutId) }
}

export type AlbumArtworkPaletteV2073ManifestFile = Readonly<{
	path: string
	byteCount: number
	rawSha256: string
}>

export function albumArtworkPaletteV2073OrderedRoot(
	files: readonly AlbumArtworkPaletteV2073ManifestFile[],
): string {
	let root = albumArtworkPaletteV2073Sha256("album-artwork-palette-v2-0.7.3-artifact-root-v1")
	for (const file of files) {
		root = albumArtworkPaletteV2073Sha256(`${root}\0${file.path}\0${file.byteCount}\0${file.rawSha256}`)
	}
	return root
}
