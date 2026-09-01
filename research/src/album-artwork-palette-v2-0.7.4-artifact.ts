import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { resolve, sep } from "node:path"
import {
	completeTreatmentKey,
	evaluateIdentityQualityGuard,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	AlbumArtworkPaletteV2074CoreDomain,
	AlbumArtworkPaletteV2074Details,
	CompletePaletteTreatment,
	IdentityQualityGuardEvaluation,
	RecallAuditTreatmentLineage,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_AUTHORIZATION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONSTRUCTION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONTROL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRODUCT_BASELINE,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTECTED_SAMPLES,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_SOLE_DELTA,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
} from "./album-artwork-palette-v2-0.7.4-protocol.ts"
import type { AlbumArtworkPaletteV2074Disposition } from
	"./album-artwork-palette-v2-0.7.4-protocol.ts"

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION = 1 as const
export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_STDIO_LIMIT_BYTES = 64 * 1024
export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHILD_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024
export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_CALIBRATION_TIMEOUT_MS = 180_000

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMMANDS = Object.freeze({
	evaluate: "NODE_NO_WARNINGS=1 node --experimental-strip-types research/evaluate-album-artwork-palette-v2-0.7.4-development.ts",
	analyze: "NODE_NO_WARNINGS=1 node --experimental-strip-types research/analyze-album-artwork-palette-v2-0.7.4-development.ts",
	verify: "NODE_NO_WARNINGS=1 node --experimental-strip-types research/analyze-album-artwork-palette-v2-0.7.4-development.ts --verify",
	test: "NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/album-artwork-palette-v2.test.ts research/tests/album-artwork-palette-v2-0.7.2.test.ts research/tests/album-artwork-palette-v2-0.7.3-recall.test.ts research/tests/album-artwork-palette-v2-0.7.3-artifact.test.ts research/tests/album-artwork-palette-v2-0.7.4-core.test.ts research/tests/album-artwork-palette-v2-0.7.4-artifact.test.ts",
	child: "NODE_NO_WARNINGS=1 node --experimental-strip-types research/album-artwork-palette-v2-0.7.4-development-child.ts <absolute-request-path>",
})

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_IMPLEMENTATION_PATHS = Object.freeze([
	"package.json",
	"pnpm-lock.yaml",
	"research/ALBUM_ARTWORK_UI_PALETTE_0_7_3_CANDIDATE_RECALL_POSTMORTEM.md",
	"research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md",
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4.md",
	"research/album-artwork-palette-v2-0.7.4-development-child.ts",
	"research/analyze-album-artwork-palette-v2-0.7.4-development.ts",
	"research/data/album-artwork-palette-v2-development-panel.json",
	"research/data/album-artwork-palette-v2-fresh-sample.sealed.json",
	"research/data/album-artwork-palette-v2-future-sample-02.sealed.json",
	"research/data/album-artwork-palette-v2-future-sample-03.sealed.json",
	"research/evaluate-album-artwork-palette-v2-0.7.4-development.ts",
	"research/src/album-artwork-palette-v2-0.7.4-artifact.ts",
	"research/src/album-artwork-palette-v2-0.7.4-protocol.ts",
	"research/src/album-artwork-palette-v2-0.7.3-artifact.ts",
	"research/src/album-artwork-palette-v2-0.7.3-protocol.ts",
	"research/src/album-artwork-palette-v2-protocol.ts",
	"research/src/album-artwork-palette-v2.ts",
	"research/src/color.ts",
	"research/src/native-resolution-image.ts",
	"research/src/types.ts",
	"research/tests/album-artwork-palette-v2-0.7.3-artifact.test.ts",
	"research/tests/album-artwork-palette-v2-0.7.3-recall.test.ts",
	"research/tests/album-artwork-palette-v2-0.7.4-artifact.test.ts",
	"research/tests/album-artwork-palette-v2-0.7.4-core.test.ts",
	"research/tests/album-artwork-palette-v2-0.7.2.test.ts",
	"research/tests/album-artwork-palette-v2.test.ts",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_PUBLISHED_ARTIFACT = Object.freeze({
	root: "research/data/experiments/album-artwork-palette-v2-0.7.4-development",
	version: "album-artwork-first-principles-0.7.4",
	implementationSha256: "b1139a62047bcb5d454c39c19b74e0c518de07145c49efa784d416305b8d2f3e",
	scientificSha256: "3dd20b73f39ebca33ca6dd762f9a4d5db13867dc85e685aa15f8d4a17708cc21",
	executionManifest: Object.freeze({
		path: "execution-manifest.json",
		id: "a80f75b402a12516fb00f2afb3dd56e4c0fb8a4a5f7d8d5284e557eec87a3d09",
		rawSha256: "4166864322673fb250a2ea9c7da23f5d324fde60c0a250c1a271ac70ce2fc549",
	}),
	results: Object.freeze({
		path: "results.json",
		id: "5b2526b05267bf7df7aea80e91fd8f7fad0aed27044fc8bfe5bdb4b7e9ef1a7a",
		rawSha256: "aed8e386717a45020b8eccadf1362bc31157a47aef4804b4b3d8b8fb31a4a4b8",
	}),
	summary: Object.freeze({
		path: "summary.json",
		id: "02a2bc1987a84e5567ff95316b11847c68b0df399cea9d3bdb11d7ef8d9bef37",
		rawSha256: "d7a5686d6127027dd0eabb3568dcd303ac3f92332d4af3eaf340d172efed0bc3",
	}),
	analysis: Object.freeze({
		path: "analysis.json",
		id: "b2d542377ec21b9861155216ddcff5003bf501ce08fc355f277cf9303a3d8576",
		rawSha256: "b49cb58c1c6a3cdd1f66ab5a1689ec5da0676470c30f7e50cb46ba1b88c45bd8",
	}),
	manifest: Object.freeze({
		path: "manifest.json",
		id: "4f5278d454cfd7223fad9c1bd174a75892c0f17fdf40d04a3623d35f1f910aef",
		rawSha256: "ea070636d10353d72e131c70638d792540ffddae894a0be568df2985bfdf80f4",
		orderedRoot: "863290bfc38e96d7297353d7cf997e853baea511ccdedf71b8d768047664bd12",
		sourceOrderedRoot: "afdae1de7c68c0311d40d39a769dba5e3accecf9d93c134ba15bb62195ef6cb2",
	}),
})

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS = Object.freeze({
	documents: ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS,
	developmentPanel: ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL,
	control: ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONTROL,
	selectionEvidence: ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE,
	productBaseline: ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRODUCT_BASELINE,
	protectedSamples: ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTECTED_SAMPLES,
})

export type AlbumArtworkPaletteV2074SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

export type AlbumArtworkPaletteV2074DevelopmentManifest = Readonly<{
	manifestId: string
	sourceCount: number
	sources: readonly AlbumArtworkPaletteV2074SourceRecord[]
}>

export type AlbumArtworkPaletteV2074FileRow = Readonly<{
	path: string
	byteCount: number
	rawSha256: string
}>

export type AlbumArtworkPaletteV2074ImplementationClosure = Readonly<{
	schemaVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION
	closureId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID
	soleDelta: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_SOLE_DELTA
	runtime: Readonly<{ node: string; platform: string; architecture: string }>
	commands: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMMANDS
	frozenBindingsSha256: string
	files: readonly AlbumArtworkPaletteV2074FileRow[]
	orderedFileRoot: string
	implementationSha256: string
}>

export type AlbumArtworkPaletteV2074CalibrationArtifact = Readonly<{
	schemaVersion: 1
	phase: "calibration"
	scheduleId: "schedule-a" | "schedule-b"
	implementationSha256: string
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	frozenSourceArtifactRawSha256: string
	controlJsonByteSha256: string
	controlScientificSha256: string
	wallMs: number
}>

export type AlbumArtworkPaletteV2074ExecutionManifest = Readonly<{
	schemaVersion: 1
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION
	protocolId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID
	closureId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID
	mode: "full-28-source" | "one-source-smoke"
	fixedPanelSourceCount: 28
	executedSourceCount: number
	sourceCaseIds: readonly string[]
	implementationClosure: AlbumArtworkPaletteV2074ImplementationClosure
	implementationSha256: string
	frozenBindings: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS
	historical073Verification: AlbumArtworkPaletteV2073ImmutableVerification
	calibration: Readonly<{
		formula: "max(60000,ceil(6*maximumControlCalibrationWallMs/1000)*1000)"
		maximumControlCalibrationWallMs: number
		candidateWallCeilingMsPerSourcePerPass: number
		schedules: ReadonlyArray<Readonly<{
			id: "schedule-a" | "schedule-b"
			workerCount: 1 | 6
			dispatchOrder: "case-id-ascending" | "case-id-descending"
			sources: ReadonlyArray<Readonly<{
				caseId: string
				sourceSha256: string
				frozenSourceArtifactRawSha256: string
				productSourceArtifactRawSha256: string
				historical073SourceArtifactRawSha256: string
				controlJsonByteSha256: string
				controlScientificSha256: string
				wallMs: number
			}>>
		}>>
	}>
	candidateSchedules: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME.candidatePasses
	canonicalAggregateOrder: "case-id-ascending"
	executionManifestId: string
}>

export type AlbumArtworkPaletteV2074TreatmentRow = Readonly<{
	key: string
	treatmentSha256: string
}>

export type AlbumArtworkPaletteV2074SelectionCertificate = Readonly<{
	version: string
	protocol: string
	domain: Readonly<{
		changedStages: readonly string[]
		rawCandidateCount: number
		materializedCandidateCount: number
		capacity: number
		remainingCapacity: number
		capacityReached: boolean
		fieldHypothesisCount: number
		fieldHypothesisOrderedRoot: string
		fieldVariantCount: number
		fieldVariantOrderedRoot: string
		availableIdentityRoleCount: number
		availableIdentityRoleOrderedRoot: string
		treatments: readonly AlbumArtworkPaletteV2074TreatmentRow[]
	}>
	selectorMetadata: Readonly<{
		version: string
		qualityGuardVersion: string
		evidenceResolution: number
		dominanceUsesEvidenceLevels: true
		paretoBlocks: readonly string[]
		rankingPriorityBlocks: readonly string[]
		qualityGuardBlocks: readonly string[]
		identityCoverageRequiresQualityNonInferiority: true
	}>
	counts: Readonly<{
		dominated: number
		globalFrontier: number
		frontierDirections: number
		identityRetentionFrontier: number
		identityCarried: number
		identityChallengers: number
		eligibleIdentityChallengers: number
		retained: number
	}>
	globalFrontierKeys: readonly string[]
	qualityIncumbent: Readonly<{ key: string; treatment: CompletePaletteTreatment }>
	identity: Readonly<{
		selectedKey: string | null
		selectedGuard: IdentityQualityGuardEvaluation | null
		challengerGuardCount: number
		challengerGuardOrderedRoot: string
		obligationGraph: AlbumArtworkPaletteV2Result["diagnostics"]["identityObligationGraph"]
	}>
	overlay: Readonly<{
		selectedKey: string | null
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"]["exactOverlayGradientChallenger"]
	}>
	winner: Readonly<{ key: string; treatment: CompletePaletteTreatment }>
	slate: ReadonlyArray<Readonly<{ key: string; treatment: CompletePaletteTreatment }>>
}>

export type AlbumArtworkPaletteV2074AdditionTerminalStage =
	"complete-treatment-construction" | "ordinary-pareto-membership" | "complete-domain-guard" |
	"identity-selection" | "exact-overlay-selection" | "public-slate-retention" | "top-one"

export type AlbumArtworkPaletteV2074AdditionRow = Readonly<{
	key: string
	treatmentSha256: string
	scoreSha256: string
	lineage: RecallAuditTreatmentLineage
	terminalStage: AlbumArtworkPaletteV2074AdditionTerminalStage
}>

export type AlbumArtworkPaletteV2074Delta = Readonly<{
	domainAdditionKeys: readonly string[]
	frontierAddedKeys: readonly string[]
	frontierRemovedKeys: readonly string[]
	qualityIncumbentMatch: boolean
	winner: Readonly<{ baselineKey: string; candidateKey: string; exactMatch: boolean }>
	slateAddedKeys: readonly string[]
	slateRemovedKeys: readonly string[]
	novelFinalWinnerKey: string | null
	novelRetainedSlateKeys: readonly string[]
	changedWinnerGuardAgainstControlQualityIncumbent: IdentityQualityGuardEvaluation | null
	resolvedCrossVersionLosses: IdentityQualityGuardEvaluation["resolvedLosses"]
}>

export type AlbumArtworkPaletteV2074ProductDelta = Readonly<{
	winner: Readonly<{ baselineKey: string; candidateKey: string; exactMatch: boolean }>
	slateAddedKeys: readonly string[]
	slateRemovedKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2074ScientificPayload = Readonly<{
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	frozenSourceArtifactRawSha256: string
	productSourceArtifactRawSha256: string
	historical073SourceArtifactRawSha256: string
	controlScientificSha256: string
	candidateScientificSha256: string
	control: AlbumArtworkPaletteV2074SelectionCertificate
	candidate: AlbumArtworkPaletteV2074SelectionCertificate
	additions: readonly AlbumArtworkPaletteV2074AdditionRow[]
	registry: Readonly<{
		families: ReadonlyArray<Readonly<{ familyId: string; sourceConnected: boolean }>>
		fieldHypotheses: ReadonlyArray<Readonly<{ hypothesisId: string; sourceConnected: boolean }>>
		fieldDirections: ReadonlyArray<Readonly<{
			key: string
			hypothesisIds: readonly string[]
			sourceConnected: boolean
		}>>
		roleDirections: ReadonlyArray<Readonly<{ key: string; sourceConnected: boolean }>>
		identityObligationFamilyIds: readonly string[]
		orderedRoot: string
	}>
	guardPassingAdditionKeys: readonly string[]
	historical073SelectedArmEquality: Readonly<{
		mechanism: "widened-field-hypothesis-retention"
		additionCount: number
		additionOrderedRoot: string
		exactKeyAndTreatmentHashEquality: true
	}>
	deltaFrom072: AlbumArtworkPaletteV2074Delta
	deltaFrom060: AlbumArtworkPaletteV2074ProductDelta
	gateFailures: readonly string[]
}>

export type AlbumArtworkPaletteV2074CandidateArtifact = Readonly<{
	schemaVersion: 1
	phase: "candidate"
	scheduleId: "schedule-a" | "schedule-b"
	implementationSha256: string
	executionManifestId: string
	scientific: AlbumArtworkPaletteV2074ScientificPayload
	scientificSha256: string
	wallMs: number
}>

export type AlbumArtworkPaletteV2074SourceArtifact = Readonly<{
	schemaVersion: 1
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION
	protocolId: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID
	implementationSha256: string
	executionManifestId: string
	scientific: AlbumArtworkPaletteV2074ScientificPayload
	scientificSha256: string
	schedules: ReadonlyArray<Readonly<{
		id: "schedule-a" | "schedule-b"
		workerCount: 1 | 6
		dispatchOrder: "case-id-ascending" | "case-id-descending"
		payloadSha256: string
		wallMs: number
	}>>
}>

export type AlbumArtworkPaletteV2074ResultSourceRow = Readonly<{
	caseId: string
	sourceSha256: string
	scientificSha256: string
	candidateDomainCount: number
	additionCount: number
	frontierAdditionCount: number
	winnerMatches072: boolean
	winnerMatches060: boolean
	novelFinalWinnerKey: string | null
	novelRetainedSlateKeys: readonly string[]
	changedWinnerGuardPass: boolean | null
	resolvedCrossVersionLossCount: number
	novelAlternativesReachingSlateWithoutTopOne: readonly string[]
}>

export type AlbumArtworkPaletteV2074Results = Readonly<{
	schemaVersion: 1
	candidateVersion: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION
	implementationSha256: string
	executionManifestId: string
	mode: "full-28-source" | "one-source-smoke"
	fixedPanelSourceCount: 28
	executedSourceCount: number
	scientificSha256: string
	scheduleScientificSha256: Readonly<{ scheduleA: string; scheduleB: string }>
	sources: readonly AlbumArtworkPaletteV2074ResultSourceRow[]
	counts: AlbumArtworkPaletteV2074AggregateCounts
	caseIds: AlbumArtworkPaletteV2074AggregateCaseIds
	mechanicalGate: Readonly<{ pass: boolean; failures: readonly string[] }>
	dispositionAuthority: boolean
	disposition: AlbumArtworkPaletteV2074Disposition | null
	authorization: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_4_AUTHORIZATION.forbidden
	resultsId: string
}>

export type AlbumArtworkPaletteV2074AggregateCounts = Readonly<{
	exactWinnerMatches072: number
	exactWinnerChanges072: number
	exactWinnerMatches060: number
	exactWinnerChanges060: number
	novelFinalWinners: number
	novelRetainedSlateKeys: number
	changedWinnerGuardPasses: number
	changedWinnerGuardFailures: number
	resolvedCrossVersionLosses: number
	novelAlternativesReachingSlateWithoutTopOne: number
	candidateAdditions: number
	frontierAdditions: number
}>

export type AlbumArtworkPaletteV2074AggregateCaseIds = Readonly<{
	exactWinnerMatches072: readonly string[]
	exactWinnerChanges072: readonly string[]
	exactWinnerMatches060: readonly string[]
	exactWinnerChanges060: readonly string[]
	novelFinalWinners: readonly string[]
	novelRetainedSlateKeys: readonly string[]
	changedWinnerGuardPasses: readonly string[]
	changedWinnerGuardFailures: readonly string[]
	resolvedCrossVersionLosses: readonly string[]
	novelAlternativesReachingSlateWithoutTopOne: readonly string[]
	candidateAdditions: readonly string[]
	frontierAdditions: readonly string[]
}>

export type AlbumArtworkPaletteV2073ImmutableVerification = Readonly<{
	manifestId: string
	orderedRoot: string
	sourceOrderedRoot: string
	executionManifestId: string
	resultsId: string
	summaryId: string
	analysisId: string
	scientificSha256: string
	mechanicalPass: true
	selectedArm: "widened-field-hypothesis-retention"
	fileCount: number
}>

export type AlbumArtworkPaletteV2074ImmutableVerification = Readonly<{
	manifestId: string
	orderedRoot: string
	sourceOrderedRoot: string
	executionManifestId: string
	resultsId: string
	summaryId: string
	analysisId: string
	implementationSha256: string
	scientificSha256: string
	mechanicalPass: true
	dispositionAuthority: true
	fileCount: number
}>

export type AlbumArtworkPaletteV2074FrozenInputs = Readonly<{
	panel: AlbumArtworkPaletteV2074DevelopmentManifest
	historical073Verification: AlbumArtworkPaletteV2073ImmutableVerification
	frozenSourceArtifactHashes: ReadonlyMap<string, string>
	productSourceArtifactHashes: ReadonlyMap<string, string>
	historical073SourceArtifactHashes: ReadonlyMap<string, string>
}>

type HistoricalManifest = Readonly<{
	schemaVersion: number
	candidateVersion: string
	executionManifestId: string
	files: readonly AlbumArtworkPaletteV2074FileRow[]
	orderedRoot: string
	manifestId: string
}>

type FrozenSourceArtifact = Readonly<{
	implementationHash: string
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: AlbumArtworkPaletteV2Result
}>

type Historical073Source = Readonly<{
	source: AlbumArtworkPaletteV2074SourceRecord
	recallArms: ReadonlyArray<Readonly<{
		scientific: Readonly<{
			arm: string
			additions: ReadonlyArray<Readonly<{ key: string; treatment: CompletePaletteTreatment }>>
		}>
	}>>
}>

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

export function albumArtworkPaletteV2074Sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function albumArtworkPaletteV2074CanonicalJson(value: unknown): string {
	if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not permit non-finite numbers")
		return JSON.stringify(value)
	}
	if (Array.isArray(value)) return `[${value.map(albumArtworkPaletteV2074CanonicalJson).join(",")}]`
	if (typeof value !== "object") throw new TypeError(`Canonical JSON does not permit ${typeof value}`)
	const record = value as Record<string, unknown>
	const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
	return `{${keys.map((key) => `${JSON.stringify(key)}:${albumArtworkPaletteV2074CanonicalJson(record[key])}`).join(",")}}`
}

export function albumArtworkPaletteV2074ScientificSha256(value: unknown): string {
	return albumArtworkPaletteV2074Sha256(albumArtworkPaletteV2074CanonicalJson(value))
}

export function albumArtworkPaletteV2074ByteJsonSha256(value: unknown): string {
	return albumArtworkPaletteV2074Sha256(JSON.stringify(value))
}

export function albumArtworkPaletteV2074ContentId(value: object, idField: string): string {
	const identity = { ...value } as Record<string, unknown>
	delete identity[idField]
	return albumArtworkPaletteV2074ScientificSha256(identity)
}

export function albumArtworkPaletteV2074OrderedValueRoot(domain: string, values: Iterable<unknown>): string {
	let root = albumArtworkPaletteV2074Sha256(domain)
	let index = 0
	for (const value of values) {
		root = albumArtworkPaletteV2074Sha256(
			`${root}\0${index}\0${albumArtworkPaletteV2074ScientificSha256(value)}`,
		)
		index += 1
	}
	return root
}

export function albumArtworkPaletteV2074OrderedFileRoot(
	domain: string,
	files: readonly AlbumArtworkPaletteV2074FileRow[],
): string {
	let root = albumArtworkPaletteV2074Sha256(domain)
	for (const file of files) {
		root = albumArtworkPaletteV2074Sha256(`${root}\0${file.path}\0${file.byteCount}\0${file.rawSha256}`)
	}
	return root
}

export async function albumArtworkPaletteV2074FileSha256(path: string): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		const hash = createHash("sha256")
		const stream = createReadStream(path)
		stream.on("data", (chunk) => hash.update(chunk))
		stream.on("error", reject)
		stream.on("end", () => resolvePromise(hash.digest("hex")))
	})
}

export function albumArtworkPaletteV2074PathInside(root: string, path: string): boolean {
	const normalizedRoot = resolve(root)
	const normalizedPath = resolve(path)
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`)
}

export async function buildAlbumArtworkPaletteV2074ImplementationClosure(
	projectRoot: string,
): Promise<AlbumArtworkPaletteV2074ImplementationClosure> {
	const files: AlbumArtworkPaletteV2074FileRow[] = []
	for (const path of ALBUM_ARTWORK_PALETTE_V2_0_7_4_IMPLEMENTATION_PATHS) {
		const absolute = resolve(projectRoot, path)
		const metadata = await stat(absolute)
		invariant(metadata.isFile(), `Implementation closure input is not a file: ${path}`)
		files.push({ path, byteCount: metadata.size, rawSha256: await albumArtworkPaletteV2074FileSha256(absolute) })
	}
	const withoutImplementation = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		closureId: ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID,
		soleDelta: ALBUM_ARTWORK_PALETTE_V2_0_7_4_SOLE_DELTA,
		runtime: { node: process.version, platform: process.platform, architecture: process.arch },
		commands: ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMMANDS,
		frozenBindingsSha256: albumArtworkPaletteV2074ScientificSha256(ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS),
		files,
		orderedFileRoot: albumArtworkPaletteV2074OrderedFileRoot(
			"album-artwork-palette-v2-0.7.4-implementation-files-v1",
			files,
		),
	}
	return {
		...withoutImplementation,
		implementationSha256: albumArtworkPaletteV2074ScientificSha256(withoutImplementation),
	}
}

async function readBoundJson<T>(projectRoot: string, path: string, expectedSha256: string): Promise<T> {
	const raw = await readFile(resolve(projectRoot, path))
	invariant(albumArtworkPaletteV2074Sha256(raw) === expectedSha256, `Frozen raw hash mismatch for ${path}`)
	return JSON.parse(raw.toString("utf8")) as T
}

export async function verifyImmutableAlbumArtworkPaletteV2073Artifact(
	projectRoot: string,
): Promise<AlbumArtworkPaletteV2073ImmutableVerification> {
	const binding = ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE
	const manifest = await readBoundJson<HistoricalManifest>(
		projectRoot,
		binding.artifactManifest.path,
		binding.artifactManifest.rawSha256,
	)
	invariant(manifest.schemaVersion === 1 && manifest.candidateVersion === binding.version,
		"Immutable 0.7.3 manifest schema is invalid")
	invariant(manifest.manifestId === binding.artifactManifest.id &&
		manifest.manifestId === albumArtworkPaletteV2074ContentId(manifest, "manifestId"),
		"Immutable 0.7.3 manifest ID is invalid")
	const paths = manifest.files.map(({ path }) => path)
	invariant(new Set(paths).size === paths.length && JSON.stringify(paths) === JSON.stringify([...paths].sort()),
		"Immutable 0.7.3 manifest paths are not unique and ordered")
	for (const file of manifest.files) {
		invariant(!file.path.startsWith("/") && !file.path.split("/").includes(".."),
			`Unsafe immutable 0.7.3 path ${file.path}`)
		const absolute = resolve(projectRoot, "research/data/experiments/album-artwork-palette-v2-0.7.3-development", file.path)
		const artifactRoot = resolve(projectRoot, "research/data/experiments/album-artwork-palette-v2-0.7.3-development")
		invariant(albumArtworkPaletteV2074PathInside(artifactRoot, absolute), `Immutable 0.7.3 path escaped: ${file.path}`)
		const metadata = await stat(absolute)
		invariant(metadata.isFile() && metadata.size === file.byteCount &&
			await albumArtworkPaletteV2074FileSha256(absolute) === file.rawSha256,
			`Immutable 0.7.3 file binding failed for ${file.path}`)
	}
	const historicalRoot = albumArtworkPaletteV2074OrderedFileRoot(
		"album-artwork-palette-v2-0.7.3-artifact-root-v1",
		manifest.files,
	)
	const sourceFiles = manifest.files.filter(({ path }) => path.startsWith("sources/"))
	const sourceRoot = albumArtworkPaletteV2074OrderedFileRoot(
		"album-artwork-palette-v2-0.7.3-artifact-root-v1",
		sourceFiles,
	)
	invariant(manifest.orderedRoot === historicalRoot && historicalRoot === binding.artifactManifest.orderedRoot &&
		sourceRoot === binding.artifactManifest.sourceOrderedRoot, "Immutable 0.7.3 ordered roots are invalid")

	const [execution, results, summary, analysis] = await Promise.all([
		readBoundJson<Record<string, unknown>>(projectRoot, binding.executionManifest.path, binding.executionManifest.rawSha256),
		readBoundJson<Record<string, unknown>>(projectRoot, binding.results.path, binding.results.rawSha256),
		readBoundJson<Record<string, unknown>>(projectRoot, binding.summary.path, binding.summary.rawSha256),
		readBoundJson<Record<string, unknown>>(projectRoot, binding.analysis.path, binding.analysis.rawSha256),
	])
	invariant(execution.executionManifestId === binding.executionManifest.id &&
		albumArtworkPaletteV2074ContentId(execution, "executionManifestId") === binding.executionManifest.id,
		"Immutable 0.7.3 execution-manifest ID is invalid")
	invariant(results.resultsId === binding.results.id &&
		albumArtworkPaletteV2074ContentId(results, "resultsId") === binding.results.id,
		"Immutable 0.7.3 results ID is invalid")
	invariant(summary.summaryId === binding.summary.id &&
		albumArtworkPaletteV2074ContentId(summary, "summaryId") === binding.summary.id,
		"Immutable 0.7.3 summary ID is invalid")
	invariant(analysis.analysisId === binding.analysis.id &&
		albumArtworkPaletteV2074ContentId(analysis, "analysisId") === binding.analysis.id,
		"Immutable 0.7.3 analysis ID is invalid")
	const selection = results.selection as Record<string, unknown>
	invariant(results.scientificSha256 === binding.scientificSha256 && analysis.mechanicalPass === true &&
		selection.pass === true && selection.selectedArm === binding.selection.mechanism,
		"Immutable 0.7.3 mechanical selection evidence is invalid")
	return {
		manifestId: manifest.manifestId,
		orderedRoot: historicalRoot,
		sourceOrderedRoot: sourceRoot,
		executionManifestId: binding.executionManifest.id,
		resultsId: binding.results.id,
		summaryId: binding.summary.id,
		analysisId: binding.analysis.id,
		scientificSha256: binding.scientificSha256,
		mechanicalPass: true,
		selectedArm: "widened-field-hypothesis-retention",
		fileCount: manifest.files.length,
	}
}

export async function verifyImmutableAlbumArtworkPaletteV2074Artifact(
	projectRoot: string,
): Promise<AlbumArtworkPaletteV2074ImmutableVerification> {
	const binding = ALBUM_ARTWORK_PALETTE_V2_0_7_4_PUBLISHED_ARTIFACT
	const manifestPath = `${binding.root}/${binding.manifest.path}`
	const manifest = await readBoundJson<HistoricalManifest>(projectRoot, manifestPath, binding.manifest.rawSha256)
	invariant(manifest.schemaVersion === 1 && manifest.candidateVersion === binding.version,
		"Immutable 0.7.4 manifest schema is invalid")
	invariant(manifest.manifestId === binding.manifest.id &&
		manifest.manifestId === albumArtworkPaletteV2074ContentId(manifest, "manifestId"),
		"Immutable 0.7.4 manifest ID is invalid")
	const paths = manifest.files.map(({ path }) => path)
	invariant(new Set(paths).size === paths.length && JSON.stringify(paths) === JSON.stringify([...paths].sort()),
		"Immutable 0.7.4 manifest paths are not unique and ordered")
	const artifactRoot = resolve(projectRoot, binding.root)
	for (const file of manifest.files) {
		invariant(!file.path.startsWith("/") && !file.path.split("/").includes(".."),
			`Unsafe immutable 0.7.4 path ${file.path}`)
		const absolute = resolve(artifactRoot, file.path)
		invariant(albumArtworkPaletteV2074PathInside(artifactRoot, absolute), `Immutable 0.7.4 path escaped: ${file.path}`)
		const metadata = await stat(absolute)
		invariant(metadata.isFile() && metadata.size === file.byteCount &&
			await albumArtworkPaletteV2074FileSha256(absolute) === file.rawSha256,
			`Immutable 0.7.4 file binding failed for ${file.path}`)
	}
	const orderedRoot = albumArtworkPaletteV2074OrderedFileRoot(
		"album-artwork-palette-v2-0.7.4-artifact-root-v1",
		manifest.files,
	)
	const sourceOrderedRoot = albumArtworkPaletteV2074OrderedFileRoot(
		"album-artwork-palette-v2-0.7.4-artifact-root-v1",
		manifest.files.filter(({ path }) => path.startsWith("sources/")),
	)
	invariant(orderedRoot === manifest.orderedRoot && orderedRoot === binding.manifest.orderedRoot &&
		sourceOrderedRoot === binding.manifest.sourceOrderedRoot, "Immutable 0.7.4 ordered roots are invalid")

	const readArtifact = async (entry: Readonly<{ path: string; rawSha256: string }>): Promise<Record<string, unknown>> =>
		readBoundJson(projectRoot, `${binding.root}/${entry.path}`, entry.rawSha256)
	const [execution, results, summary, analysis] = await Promise.all([
		readArtifact(binding.executionManifest),
		readArtifact(binding.results),
		readArtifact(binding.summary),
		readArtifact(binding.analysis),
	])
	invariant(execution.executionManifestId === binding.executionManifest.id &&
		albumArtworkPaletteV2074ContentId(execution, "executionManifestId") === binding.executionManifest.id,
		"Immutable 0.7.4 execution-manifest ID is invalid")
	invariant(results.resultsId === binding.results.id &&
		albumArtworkPaletteV2074ContentId(results, "resultsId") === binding.results.id,
		"Immutable 0.7.4 results ID is invalid")
	invariant(summary.summaryId === binding.summary.id &&
		albumArtworkPaletteV2074ContentId(summary, "summaryId") === binding.summary.id,
		"Immutable 0.7.4 summary ID is invalid")
	invariant(analysis.analysisId === binding.analysis.id &&
		albumArtworkPaletteV2074ContentId(analysis, "analysisId") === binding.analysis.id,
		"Immutable 0.7.4 analysis ID is invalid")
	invariant(execution.implementationSha256 === binding.implementationSha256 &&
		results.implementationSha256 === binding.implementationSha256 &&
		summary.implementationSha256 === binding.implementationSha256 &&
		analysis.implementationSha256 === binding.implementationSha256,
		"Immutable 0.7.4 implementation identity is invalid")
	invariant(results.scientificSha256 === binding.scientificSha256 &&
		summary.scientificSha256 === binding.scientificSha256 &&
		analysis.scientificSha256 === binding.scientificSha256 &&
		(results.mechanicalGate as Record<string, unknown>).pass === true &&
		(summary.mechanicalGate as Record<string, unknown>).pass === true &&
		analysis.mechanicalPass === true && results.dispositionAuthority === true &&
		summary.dispositionAuthority === true && analysis.dispositionAuthority === true,
		"Immutable 0.7.4 mechanical result is invalid")
	return {
		manifestId: binding.manifest.id,
		orderedRoot,
		sourceOrderedRoot,
		executionManifestId: binding.executionManifest.id,
		resultsId: binding.results.id,
		summaryId: binding.summary.id,
		analysisId: binding.analysis.id,
		implementationSha256: binding.implementationSha256,
		scientificSha256: binding.scientificSha256,
		mechanicalPass: true,
		dispositionAuthority: true,
		fileCount: manifest.files.length,
	}
}

function protectedSourceHashes(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	const record = value as Record<string, unknown>
	const direct = Array.isArray(record.sources) ? record.sources.flatMap((entry) => {
		const sha256 = (entry as Record<string, unknown>).sha256
		return typeof sha256 === "string" ? [sha256] : []
	}) : []
	const variants = Array.isArray(record.families) ? record.families.flatMap((family) => {
		const entries = (family as Record<string, unknown>).variants
		return Array.isArray(entries) ? entries.flatMap((entry) => {
			const sha256 = (entry as Record<string, unknown>).sha256
			return typeof sha256 === "string" ? [sha256] : []
		}) : []
	}) : []
	return [...direct, ...variants]
}

export async function verifyAlbumArtworkPaletteV2074FrozenInputs(
	projectRoot: string,
): Promise<AlbumArtworkPaletteV2074FrozenInputs> {
	const bindings = ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS
	for (const binding of [
		bindings.documents.plan,
		bindings.documents.handoff,
		bindings.developmentPanel,
		...Object.values(bindings.control.files),
		bindings.selectionEvidence.protocol,
		bindings.productBaseline.aggregate,
		bindings.productBaseline.candidateFreeze,
		...bindings.protectedSamples,
	]) {
		invariant("rawSha256" in binding &&
			await albumArtworkPaletteV2074FileSha256(resolve(projectRoot, binding.path)) === binding.rawSha256,
			`Frozen raw hash mismatch for ${binding.path}`)
	}
	const panel = JSON.parse(await readFile(resolve(projectRoot, bindings.developmentPanel.path), "utf8")) as
		AlbumArtworkPaletteV2074DevelopmentManifest
	invariant(panel.manifestId === bindings.developmentPanel.manifestId && panel.sourceCount === 28 &&
		panel.sources.length === 28 && new Set(panel.sources.map(({ caseId }) => caseId)).size === 28 &&
		new Set(panel.sources.map(({ sha256 }) => sha256)).size === 28, "Fixed development panel is invalid")

	const protectedHashes = new Set<string>()
	for (const binding of bindings.protectedSamples) {
		const value = JSON.parse(await readFile(resolve(projectRoot, binding.path), "utf8")) as Record<string, unknown>
		invariant(value.manifestId === binding.manifestId && value.sealCommitment === binding.sealCommitment,
			`Protected seal metadata mismatch for ${binding.path}`)
		for (const sha256 of protectedSourceHashes(value)) protectedHashes.add(sha256)
	}
	invariant(panel.sources.every(({ sha256 }) => !protectedHashes.has(sha256)),
		"Development panel overlaps protected artwork")

	const [controlSummary, controlAnalysis, controlAggregate, productAggregate, productFreeze] = await Promise.all([
		readFile(resolve(projectRoot, bindings.control.files.summary.path), "utf8").then(JSON.parse) as Promise<Record<string, unknown>>,
		readFile(resolve(projectRoot, bindings.control.files.analysis.path), "utf8").then(JSON.parse) as Promise<Record<string, unknown>>,
		readFile(resolve(projectRoot, bindings.control.files.aggregate.path), "utf8").then(JSON.parse) as Promise<Record<string, unknown>>,
		readFile(resolve(projectRoot, bindings.productBaseline.aggregate.path), "utf8").then(JSON.parse) as Promise<Record<string, unknown>>,
		readFile(resolve(projectRoot, bindings.productBaseline.candidateFreeze.path), "utf8").then(JSON.parse) as Promise<Record<string, unknown>>,
	])
	for (const value of [controlSummary, controlAnalysis, controlAggregate]) {
		invariant(value.candidateVersion === bindings.control.version &&
			value.implementationHash === bindings.control.implementationSha256 &&
			value.scientificSha256 === bindings.control.scientificSha256 &&
			value.developmentManifestId === bindings.developmentPanel.manifestId,
			"Frozen 0.7.2 semantic binding is invalid")
	}
	invariant(productAggregate.candidateVersion === bindings.productBaseline.version &&
		productAggregate.implementationHash === bindings.productBaseline.implementationSha256 &&
		productAggregate.scientificSha256 === bindings.productBaseline.scientificSha256 &&
		productAggregate.developmentManifestId === bindings.developmentPanel.manifestId,
		"Frozen 0.6.0 aggregate semantic binding is invalid")
	invariant(productFreeze.freezeId === bindings.productBaseline.candidateFreeze.id &&
		productFreeze.candidateVersion === bindings.productBaseline.version &&
		productFreeze.implementationHash === bindings.productBaseline.implementationSha256,
		"Frozen 0.6.0 candidate-freeze semantic binding is invalid")

	const historical073Verification = await verifyImmutableAlbumArtworkPaletteV2073Artifact(projectRoot)
	const historicalManifest = JSON.parse(await readFile(resolve(
		projectRoot,
		bindings.selectionEvidence.artifactManifest.path,
	), "utf8")) as HistoricalManifest
	const historicalRows = new Map(historicalManifest.files
		.filter(({ path }) => /^sources\/development-[0-9]{2}\.json$/u.test(path))
		.map((row) => [row.path.slice("sources/".length, -".json".length), row]))
	const controlCases = new Map((controlAggregate.cases as FrozenSourceArtifact[])
		.map((entry) => [entry.source.caseId, entry]))
	const productCases = new Map((productAggregate.cases as FrozenSourceArtifact[])
		.map((entry) => [entry.source.caseId, entry]))
	const frozenSourceArtifactHashes = new Map<string, string>()
	const productSourceArtifactHashes = new Map<string, string>()
	const historical073SourceArtifactHashes = new Map<string, string>()
	for (const source of panel.sources) {
		for (const [version, aggregateCases, target] of [
			["0.7.2", controlCases, frozenSourceArtifactHashes],
			["0.6.0", productCases, productSourceArtifactHashes],
		] as const) {
			const path = resolve(projectRoot,
				`research/data/experiments/album-artwork-palette-v2-${version}-development/sources/${source.caseId}.json`)
			const raw = await readFile(path)
			const value = JSON.parse(raw.toString("utf8")) as FrozenSourceArtifact
			invariant(albumArtworkPaletteV2074CanonicalJson(value) ===
				albumArtworkPaletteV2074CanonicalJson(aggregateCases.get(source.caseId)) &&
				albumArtworkPaletteV2074CanonicalJson(value.source) === albumArtworkPaletteV2074CanonicalJson(source),
				`Frozen ${version} source does not reconcile with its bound aggregate for ${source.caseId}`)
			target.set(source.caseId, albumArtworkPaletteV2074Sha256(raw))
		}
		const historical = historicalRows.get(source.caseId)
		invariant(historical !== undefined, `Immutable 0.7.3 source row is missing for ${source.caseId}`)
		historical073SourceArtifactHashes.set(source.caseId, historical.rawSha256)
	}
	return {
		panel,
		historical073Verification,
		frozenSourceArtifactHashes,
		productSourceArtifactHashes,
		historical073SourceArtifactHashes,
	}
}

function keyForTreatmentId(treatments: readonly CompletePaletteTreatment[], id: string | null): string | null {
	if (id === null) return null
	const treatment = treatments.find((candidate) => candidate.id === id)
	invariant(treatment !== undefined, `Selector treatment ${id} is absent from its complete domain`)
	return completeTreatmentKey(treatment)
}

function selectionCertificate(domain: AlbumArtworkPaletteV2074CoreDomain): AlbumArtworkPaletteV2074SelectionCertificate {
	const ranking = domain.result.diagnostics.paretoRanking
	const incumbent = domain.completeTreatments.find(({ id }) => id === ranking.qualityIncumbentTreatmentId)
	invariant(incumbent !== undefined, "Quality incumbent is absent from its complete domain")
	const allSelectedTreatments = [...domain.completeTreatments, domain.result.winner, ...domain.result.alternatives]
	return {
		version: domain.result.version,
		protocol: domain.result.protocol,
		domain: {
			changedStages: domain.changedStages,
			rawCandidateCount: domain.rawCandidateCount,
			materializedCandidateCount: domain.materializedCandidateCount,
			capacity: domain.capacity,
			remainingCapacity: domain.remainingCapacity,
			capacityReached: domain.capacityReached,
			fieldHypothesisCount: domain.fieldHypothesisIds.length,
			fieldHypothesisOrderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-field-hypotheses-v1", domain.fieldHypothesisIds),
			fieldVariantCount: domain.fieldVariantKeys.length,
			fieldVariantOrderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-field-variants-v1", domain.fieldVariantKeys),
			availableIdentityRoleCount: domain.availableIdentityRoles.length,
			availableIdentityRoleOrderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-available-identity-roles-v1", domain.availableIdentityRoles),
			treatments: domain.completeTreatments.map((treatment) => ({
				key: completeTreatmentKey(treatment),
				treatmentSha256: albumArtworkPaletteV2074ScientificSha256(treatment),
			})),
		},
		selectorMetadata: {
			version: ranking.version,
			qualityGuardVersion: ranking.qualityGuardVersion,
			evidenceResolution: ranking.evidenceResolution,
			dominanceUsesEvidenceLevels: ranking.dominanceUsesEvidenceLevels,
			paretoBlocks: ranking.paretoBlocks,
			rankingPriorityBlocks: ranking.rankingPriorityBlocks,
			qualityGuardBlocks: ranking.qualityGuardBlocks,
			identityCoverageRequiresQualityNonInferiority: ranking.identityCoverageRequiresQualityNonInferiority,
		},
		counts: {
			dominated: ranking.dominatedCandidateCount,
			globalFrontier: ranking.frontierCandidateCount,
			frontierDirections: ranking.frontierDirectionCount,
			identityRetentionFrontier: ranking.identityRetentionFrontierCandidateCount,
			identityCarried: ranking.identityCarriedCandidateCount,
			identityChallengers: ranking.identityChallengerCount,
			eligibleIdentityChallengers: ranking.eligibleIdentityChallengerCount,
			retained: ranking.retainedCount,
		},
		globalFrontierKeys: ranking.globalParetoFrontierTreatmentIds.map((id) => keyForTreatmentId(domain.completeTreatments, id)!),
		qualityIncumbent: { key: completeTreatmentKey(incumbent), treatment: incumbent },
		identity: {
			selectedKey: keyForTreatmentId(domain.completeTreatments, ranking.selectedIdentityChallengerTreatmentId),
			selectedGuard: ranking.selectedIdentityChallengerQualityGuard,
			challengerGuardCount: ranking.identityChallengerQualityGuards.length,
			challengerGuardOrderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-identity-challenger-guards-v1",
				ranking.identityChallengerQualityGuards,
			),
			obligationGraph: domain.result.diagnostics.identityObligationGraph,
		},
		overlay: {
			selectedKey: keyForTreatmentId(allSelectedTreatments,
				domain.result.diagnostics.exactOverlayGradientChallenger.selectedChallengerId),
			diagnostics: domain.result.diagnostics.exactOverlayGradientChallenger,
		},
		winner: { key: completeTreatmentKey(domain.result.winner), treatment: domain.result.winner },
		slate: domain.result.alternatives.map((treatment) => ({ key: completeTreatmentKey(treatment), treatment })),
	}
}

function difference(first: readonly string[], second: ReadonlySet<string>): string[] {
	return first.filter((key) => !second.has(key))
}

function productDelta(
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	baseline: AlbumArtworkPaletteV2Result,
): AlbumArtworkPaletteV2074ProductDelta {
	const baselineWinner = completeTreatmentKey(baseline.winner)
	const baselineSlate = baseline.alternatives.map(completeTreatmentKey)
	const candidateSlate = candidate.slate.map(({ key }) => key)
	return {
		winner: {
			baselineKey: baselineWinner,
			candidateKey: candidate.winner.key,
			exactMatch: baselineWinner === candidate.winner.key,
		},
		slateAddedKeys: difference(candidateSlate, new Set(baselineSlate)),
		slateRemovedKeys: difference(baselineSlate, new Set(candidateSlate)),
	}
}

function controlDelta(
	control: AlbumArtworkPaletteV2074SelectionCertificate,
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	additionKeys: readonly string[],
): AlbumArtworkPaletteV2074Delta {
	const controlDomainKeys = new Set(control.domain.treatments.map(({ key }) => key))
	const controlFrontier = new Set(control.globalFrontierKeys)
	const candidateFrontier = new Set(candidate.globalFrontierKeys)
	const controlSlate = control.slate.map(({ key }) => key)
	const candidateSlate = candidate.slate.map(({ key }) => key)
	const exactWinner = control.winner.key === candidate.winner.key
	const changedGuard = exactWinner ? null : evaluateIdentityQualityGuard(
		control.qualityIncumbent.treatment,
		candidate.winner.treatment,
	)
	return {
		domainAdditionKeys: additionKeys,
		frontierAddedKeys: difference(candidate.globalFrontierKeys, controlFrontier),
		frontierRemovedKeys: difference(control.globalFrontierKeys, candidateFrontier),
		qualityIncumbentMatch: control.qualityIncumbent.key === candidate.qualityIncumbent.key,
		winner: {
			baselineKey: control.winner.key,
			candidateKey: candidate.winner.key,
			exactMatch: exactWinner,
		},
		slateAddedKeys: difference(candidateSlate, new Set(controlSlate)),
		slateRemovedKeys: difference(controlSlate, new Set(candidateSlate)),
		novelFinalWinnerKey: controlDomainKeys.has(candidate.winner.key) ? null : candidate.winner.key,
		novelRetainedSlateKeys: candidateSlate.filter((key) => !controlDomainKeys.has(key)),
		changedWinnerGuardAgainstControlQualityIncumbent: changedGuard,
		resolvedCrossVersionLosses: changedGuard?.resolvedLosses ?? [],
	}
}

function terminalStage(
	key: string,
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	guardPassing: ReadonlySet<string>,
): AlbumArtworkPaletteV2074AdditionTerminalStage {
	if (candidate.winner.key === key) return "top-one"
	if (candidate.slate.some((entry) => entry.key === key)) return "public-slate-retention"
	if (candidate.overlay.selectedKey === key) return "exact-overlay-selection"
	if (candidate.identity.selectedKey === key) return "identity-selection"
	if (guardPassing.has(key)) return "complete-domain-guard"
	if (candidate.globalFrontierKeys.includes(key)) return "ordinary-pareto-membership"
	return "complete-treatment-construction"
}

export function buildAlbumArtworkPaletteV2074ScientificPayload(input: Readonly<{
	details: AlbumArtworkPaletteV2074Details
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	frozenSourceArtifactRawSha256: string
	productSourceArtifactRawSha256: string
	historical073SourceArtifactRawSha256: string
	frozenControl: FrozenSourceArtifact
	productBaseline: FrozenSourceArtifact
	historical073: Historical073Source
}>): AlbumArtworkPaletteV2074ScientificPayload {
	const { details } = input
	const control = selectionCertificate(details.audit.control)
	const candidate = selectionCertificate(details.audit.candidate)
	invariant(JSON.stringify(details.audit.control.result) === JSON.stringify(input.frozenControl.extraction),
		"Live 0.7.4 control is not JSON-byte-equal to frozen 0.7.2 extraction")
	const guardByKey = new Map(details.audit.additions.map(({ key, treatment }) => [
		key,
		evaluateIdentityQualityGuard(candidate.qualityIncumbent.treatment, treatment),
	]))
	const guardPassingKeys = details.audit.additions
		.filter(({ key }) => guardByKey.get(key)!.pass)
		.map(({ key }) => key)
	const guardPassing = new Set(guardPassingKeys)
	const additions: AlbumArtworkPaletteV2074AdditionRow[] = details.audit.additions.map(({ key, treatment, lineage }) => ({
		key,
		treatmentSha256: albumArtworkPaletteV2074ScientificSha256(treatment),
		scoreSha256: albumArtworkPaletteV2074ScientificSha256(treatment.scores),
		lineage,
		terminalStage: terminalStage(key, candidate, guardPassing),
	}))
	const selectedArm = input.historical073.recallArms.find(({ scientific }) =>
		scientific.arm === ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.selection.mechanism)
	invariant(selectedArm !== undefined, "Immutable 0.7.3 selected arm is absent")
	const historicalRows = selectedArm.scientific.additions.map(({ key, treatment }) => ({
		key,
		treatmentSha256: albumArtworkPaletteV2074ScientificSha256(treatment),
	}))
	const currentRows = additions.map(({ key, treatmentSha256 }) => ({ key, treatmentSha256 }))
	invariant(albumArtworkPaletteV2074CanonicalJson(currentRows) === albumArtworkPaletteV2074CanonicalJson(historicalRows),
		"Generated 0.7.4 additions differ from the immutable selected 0.7.3 arm")
	const registry = {
		families: details.audit.registry.families.map(({ familyId, sourceConnected }) => ({ familyId, sourceConnected })),
		fieldHypotheses: details.audit.registry.fieldHypotheses.map(({ hypothesisId, sourceConnected }) => ({
			hypothesisId,
			sourceConnected,
		})),
		fieldDirections: details.audit.registry.fieldDirections.map(({ key, hypothesisIds, sourceConnected }) => ({
			key,
			hypothesisIds,
			sourceConnected,
		})),
		roleDirections: details.audit.registry.roleDirections.map(({ key, sourceConnected }) => ({ key, sourceConnected })),
		identityObligationFamilyIds: details.audit.registry.identityObligationFamilyIds,
	}
	const registryWithRoot = {
		...registry,
		orderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
			"album-artwork-palette-v2-0.7.4-compact-registry-v1",
			[registry.families, registry.fieldHypotheses, registry.fieldDirections, registry.roleDirections,
				registry.identityObligationFamilyIds],
		),
	}
	return {
		source: input.source,
		dimensions: input.dimensions,
		frozenSourceArtifactRawSha256: input.frozenSourceArtifactRawSha256,
		productSourceArtifactRawSha256: input.productSourceArtifactRawSha256,
		historical073SourceArtifactRawSha256: input.historical073SourceArtifactRawSha256,
		controlScientificSha256: albumArtworkPaletteV2074ScientificSha256(details.audit.control.result),
		candidateScientificSha256: albumArtworkPaletteV2074ScientificSha256(details.audit.candidate.result),
		control,
		candidate,
		additions,
		registry: registryWithRoot,
		guardPassingAdditionKeys: guardPassingKeys,
		historical073SelectedArmEquality: {
			mechanism: "widened-field-hypothesis-retention",
			additionCount: currentRows.length,
			additionOrderedRoot: albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-selected-additions-v1", currentRows),
			exactKeyAndTreatmentHashEquality: true,
		},
		deltaFrom072: controlDelta(control, candidate, additions.map(({ key }) => key)),
		deltaFrom060: productDelta(candidate, input.productBaseline.extraction),
		gateFailures: [],
	}
}

export function albumArtworkPaletteV2074ResultSourceRow(
	source: AlbumArtworkPaletteV2074SourceArtifact,
): AlbumArtworkPaletteV2074ResultSourceRow {
	const scientific = source.scientific
	const novelWinner = scientific.deltaFrom072.novelFinalWinnerKey
	return {
		caseId: scientific.source.caseId,
		sourceSha256: scientific.source.sha256,
		scientificSha256: source.scientificSha256,
		candidateDomainCount: scientific.candidate.domain.materializedCandidateCount,
		additionCount: scientific.additions.length,
		frontierAdditionCount: scientific.deltaFrom072.frontierAddedKeys.length,
		winnerMatches072: scientific.deltaFrom072.winner.exactMatch,
		winnerMatches060: scientific.deltaFrom060.winner.exactMatch,
		novelFinalWinnerKey: novelWinner,
		novelRetainedSlateKeys: scientific.deltaFrom072.novelRetainedSlateKeys,
		changedWinnerGuardPass: scientific.deltaFrom072.changedWinnerGuardAgainstControlQualityIncumbent?.pass ?? null,
		resolvedCrossVersionLossCount: scientific.deltaFrom072.resolvedCrossVersionLosses.length,
		novelAlternativesReachingSlateWithoutTopOne: scientific.deltaFrom072.novelRetainedSlateKeys
			.filter((key) => key !== novelWinner),
	}
}

function selectedCaseIds(
	sources: readonly AlbumArtworkPaletteV2074ResultSourceRow[],
	predicate: (source: AlbumArtworkPaletteV2074ResultSourceRow) => boolean,
): string[] {
	return sources.filter(predicate).map(({ caseId }) => caseId)
}

function aggregateCounts(sources: readonly AlbumArtworkPaletteV2074ResultSourceRow[]): Readonly<{
	counts: AlbumArtworkPaletteV2074AggregateCounts
	caseIds: AlbumArtworkPaletteV2074AggregateCaseIds
}> {
	const caseIds = {
		exactWinnerMatches072: selectedCaseIds(sources, ({ winnerMatches072 }) => winnerMatches072),
		exactWinnerChanges072: selectedCaseIds(sources, ({ winnerMatches072 }) => !winnerMatches072),
		exactWinnerMatches060: selectedCaseIds(sources, ({ winnerMatches060 }) => winnerMatches060),
		exactWinnerChanges060: selectedCaseIds(sources, ({ winnerMatches060 }) => !winnerMatches060),
		novelFinalWinners: selectedCaseIds(sources, ({ novelFinalWinnerKey }) => novelFinalWinnerKey !== null),
		novelRetainedSlateKeys: selectedCaseIds(sources, ({ novelRetainedSlateKeys }) => novelRetainedSlateKeys.length > 0),
		changedWinnerGuardPasses: selectedCaseIds(sources, ({ changedWinnerGuardPass }) => changedWinnerGuardPass === true),
		changedWinnerGuardFailures: selectedCaseIds(sources, ({ changedWinnerGuardPass }) => changedWinnerGuardPass === false),
		resolvedCrossVersionLosses: selectedCaseIds(sources, ({ resolvedCrossVersionLossCount }) => resolvedCrossVersionLossCount > 0),
		novelAlternativesReachingSlateWithoutTopOne: selectedCaseIds(sources,
			({ novelAlternativesReachingSlateWithoutTopOne }) => novelAlternativesReachingSlateWithoutTopOne.length > 0),
		candidateAdditions: selectedCaseIds(sources, ({ additionCount }) => additionCount > 0),
		frontierAdditions: selectedCaseIds(sources, ({ frontierAdditionCount }) => frontierAdditionCount > 0),
	}
	return {
		caseIds,
		counts: {
			exactWinnerMatches072: caseIds.exactWinnerMatches072.length,
			exactWinnerChanges072: caseIds.exactWinnerChanges072.length,
			exactWinnerMatches060: caseIds.exactWinnerMatches060.length,
			exactWinnerChanges060: caseIds.exactWinnerChanges060.length,
			novelFinalWinners: sources.filter(({ novelFinalWinnerKey }) => novelFinalWinnerKey !== null).length,
			novelRetainedSlateKeys: sources.reduce((sum, { novelRetainedSlateKeys }) => sum + novelRetainedSlateKeys.length, 0),
			changedWinnerGuardPasses: caseIds.changedWinnerGuardPasses.length,
			changedWinnerGuardFailures: caseIds.changedWinnerGuardFailures.length,
			resolvedCrossVersionLosses: sources.reduce((sum, { resolvedCrossVersionLossCount }) =>
				sum + resolvedCrossVersionLossCount, 0),
			novelAlternativesReachingSlateWithoutTopOne: sources.reduce((sum, row) =>
				sum + row.novelAlternativesReachingSlateWithoutTopOne.length, 0),
			candidateAdditions: sources.reduce((sum, { additionCount }) => sum + additionCount, 0),
			frontierAdditions: sources.reduce((sum, { frontierAdditionCount }) => sum + frontierAdditionCount, 0),
		},
	}
}

export function buildAlbumArtworkPaletteV2074Results(
	execution: AlbumArtworkPaletteV2074ExecutionManifest,
	sources: readonly AlbumArtworkPaletteV2074SourceArtifact[],
): AlbumArtworkPaletteV2074Results {
	const rows = sources.map(albumArtworkPaletteV2074ResultSourceRow)
	const { counts, caseIds } = aggregateCounts(rows)
	const failures = sources.flatMap(({ scientific }) =>
		scientific.gateFailures.map((failure) => `${scientific.source.caseId}:${failure}`))
	const mechanicalPass = failures.length === 0
	const dispositionAuthority = execution.mode === "full-28-source" && rows.length === 28
	let disposition: AlbumArtworkPaletteV2074Disposition | null = null
	if (dispositionAuthority) {
		disposition = !mechanicalPass
			? "mechanical-closure-failed"
			: counts.novelFinalWinners > 0
				? "novel-final-winner-delta-awaiting-separate-review-authorization"
				: counts.novelRetainedSlateKeys > 0
					? "novel-slate-only-delta-awaiting-separate-review-authorization"
					: "no-product-visible-delta"
	}
	const scheduleScientific = (scheduleIndex: number): string => albumArtworkPaletteV2074ScientificSha256(
		sources.map((source) => ({
			caseId: source.scientific.source.caseId,
			sourceSha256: source.scientific.source.sha256,
			scientificSha256: source.schedules[scheduleIndex]?.payloadSha256,
		})),
	)
	const scheduleA = scheduleScientific(0)
	const scheduleB = scheduleScientific(1)
	if (scheduleA !== scheduleB) throw new Error("Candidate aggregate scientific output differs across schedules")
	const scientificSha256 = scheduleA
	const withoutId = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
		implementationSha256: execution.implementationSha256,
		executionManifestId: execution.executionManifestId,
		mode: execution.mode,
		fixedPanelSourceCount: 28 as const,
		executedSourceCount: rows.length,
		scientificSha256,
		scheduleScientificSha256: { scheduleA, scheduleB },
		sources: rows,
		counts,
		caseIds,
		mechanicalGate: { pass: mechanicalPass, failures },
		dispositionAuthority,
		disposition,
		authorization: ALBUM_ARTWORK_PALETTE_V2_0_7_4_AUTHORIZATION.forbidden,
	}
	return { ...withoutId, resultsId: albumArtworkPaletteV2074ScientificSha256(withoutId) }
}

export function buildAlbumArtworkPaletteV2074Summary(results: AlbumArtworkPaletteV2074Results): Readonly<Record<string, unknown>> {
	const withoutId = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		candidateVersion: results.candidateVersion,
		implementationSha256: results.implementationSha256,
		executionManifestId: results.executionManifestId,
		mode: results.mode,
		fixedPanelSourceCount: results.fixedPanelSourceCount,
		executedSourceCount: results.executedSourceCount,
		scientificSha256: results.scientificSha256,
		counts: results.counts,
		mechanicalGate: results.mechanicalGate,
		dispositionAuthority: results.dispositionAuthority,
		disposition: results.disposition,
		authorization: results.authorization,
	}
	return { ...withoutId, summaryId: albumArtworkPaletteV2074ScientificSha256(withoutId) }
}

export function validateAlbumArtworkPaletteV2074NoResourceFields(value: unknown, label: string): void {
	if (value === null || typeof value !== "object") return
	if (Array.isArray(value)) {
		for (const entry of value) validateAlbumArtworkPaletteV2074NoResourceFields(entry, label)
		return
	}
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		invariant(!/(?:^|_)(?:rss|memory|heap)(?:$|_)/iu.test(key), `${label} contains resource field ${key}`)
		validateAlbumArtworkPaletteV2074NoResourceFields(entry, label)
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHANGED_STAGES =
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONSTRUCTION.changedStages
export const ALBUM_ARTWORK_PALETTE_V2_0_7_4_GUARD_BLOCKS =
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_COMPLETE_QUALITY_GUARD_BLOCKS
