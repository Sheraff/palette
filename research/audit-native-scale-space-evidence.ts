import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
	lstat,
	mkdir,
	open,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
} from "node:fs/promises"
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path"
import { createInterface } from "node:readline"
import { Session } from "node:inspector"
import { fileURLToPath } from "node:url"
import { getHeapStatistics } from "node:v8"
import sharpModern from "sharp-modern"
import {
	NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
	NATIVE_SCALE_SPACE_EXPECTATIONS,
	NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
	NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
	NATIVE_SCALE_SPACE_EXPERIMENT_ID,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
	NATIVE_SCALE_SPACE_IMPORT_POLICY,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
	NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
	NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION,
	NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
	NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
	accumulateNativeScaleSpaceReconstructionBinaryCandidate,
	accumulateNativeScaleSpaceReconstructionCandidate,
	assertNativeScaleSpaceMetricRecord,
	createNativeScaleSpaceAvailability,
	createNativeScaleSpaceComponentScratch,
	createNativeScaleSpaceFieldView,
	evaluateNativeScaleSpaceBcSampleStabilityMetrics,
	evaluateNativeScaleSpaceBinaryFieldMetrics,
	evaluateNativeScaleSpaceBinaryPairMetrics,
	evaluateNativeScaleSpaceFieldMetrics,
	evaluateNativeScaleSpaceFixtureStructuralRows,
	evaluateNativeScaleSpaceGraphMetrics,
	evaluateNativeScaleSpacePairMetrics,
	evaluateNativeScaleSpacePartitionStabilityMetrics,
	evaluateNativeScaleSpaceScientificPredicates,
	fillNativeScaleSpaceCandidateMask,
	fillNativeScaleSpaceFamilyMask,
	finalizeNativeScaleSpaceReconstruction,
	nativeScaleSpaceFixtureDisposition,
	nativeScaleSpaceOrderedCandidateEdges,
	createNativeScaleSpaceReconstructionAccumulator,
	type NativeScaleSpaceAvailability,
	type NativeScaleSpaceComponentScratch,
	type NativeScaleSpaceFixtureDisposition,
	type NativeScaleSpaceMetricRecord,
	type NativeScaleSpaceMetricValue,
} from "./src/native-scale-space-evidence.ts"
import {
	NATIVE_SCALE_SPACE_CORPUS_TARGETS,
	NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY,
	NATIVE_SCALE_SPACE_MAX_CANDIDATES,
	NATIVE_SCALE_SPACE_MAX_FAMILIES,
	NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
	NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES,
	NATIVE_SCALE_SPACE_Q24,
	NATIVE_SCALE_SPACE_RASTER_LIMITS,
	NATIVE_SCALE_SPACE_RASTER_VERSION,
	accumulateQ24PartitionSummedAreaTable,
	buildBinaryMaskSummedAreaTable,
	canonicalJson,
	canonicalTypedArrayHash,
	createArmAViewIdentityFromMask,
	createArmViewIdentity,
	createCenteredClippedBoxGeometry,
	createCenteredClippedBoxQ24Evaluator,
	createLowPassFilterIdentity,
	createQ24PartitionResidualAccumulator,
	domainSeparatedCanonicalSha256,
	filterSummedAreaTableQ24,
	finalizeQ24PartitionResidual,
	nativeScaleSpaceRasterBounds,
	resolveNativeScaleSpaceTarget,
	sampleQ24PlaneAtTargetCenters,
	verifyQ24CenterSamplesExact,
	type NativeScaleSpaceTarget,
} from "./src/native-scale-space-raster.ts"
import {
	createNativeScaleSpaceNoPublishAttempt,
	createNativeScaleSpacePublicationAttempt,
	preserveFailedNativeScaleSpaceNoPublish,
	preserveFailedNativeScaleSpacePublication,
	publishNativeScaleSpacePublication,
	removeSuccessfulNativeScaleSpaceNoPublish,
	resolveNativeScaleSpaceArtifactPath,
	validateNativeScaleSpaceArtifactRelativePath,
	type NativeScaleSpaceNoPublishAttempt,
	type NativeScaleSpacePublicationAttempt,
} from "./src/native-scale-space-output.ts"
import {
	MODERN_RASTER_RUNTIME,
	NATIVE_DECODE_POLICY,
	decodeNativeRaster,
	validateDecodedNativeRaster,
	type DecodedNativeRaster,
	type EncodedImageInput,
} from "./src/resolution-raster.ts"

export const NATIVE_SCALE_SPACE_MODERN_SHARP_EXECUTION_POLICY = Object.freeze({
	cache: false,
	concurrency: 1,
	sequentialSources: true,
})
sharpModern.cache(false)
sharpModern.concurrency(NATIVE_SCALE_SPACE_MODERN_SHARP_EXECUTION_POLICY.concurrency)

export {
	NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
	NATIVE_SCALE_SPACE_EXPECTATIONS,
	NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
	NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
	NATIVE_SCALE_SPACE_EXPERIMENT_ID,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
	NATIVE_SCALE_SPACE_IMPORT_POLICY,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
	NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
	NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION,
	NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
	NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
	NATIVE_SCALE_SPACE_CORPUS_TARGETS,
	NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY,
	NATIVE_SCALE_SPACE_Q24,
	NATIVE_SCALE_SPACE_RASTER_LIMITS,
	NATIVE_SCALE_SPACE_RASTER_VERSION,
	MODERN_RASTER_RUNTIME,
	canonicalJson,
	canonicalTypedArrayHash,
	domainSeparatedCanonicalSha256,
}

export const NATIVE_SCALE_SPACE_AUDIT_ID = NATIVE_SCALE_SPACE_EXPERIMENT_ID
export const NATIVE_SCALE_SPACE_AUDIT_SCHEMA_VERSION = "native-scale-space-evidence-audit-artifacts-v1" as const
export const NATIVE_SCALE_SPACE_PROTOCOL_VERSION = "native-scale-space-protocol-v1" as const
export const NATIVE_SCALE_SPACE_CANONICAL_CHILD_PROTOCOL_VERSION = "resolution-canonical-raster-child-v1" as const
export const NATIVE_SCALE_SPACE_SCIENTIFIC_IDENTITY_VERSION = "native-scale-space-scientific-identity-v1" as const
export const NATIVE_SCALE_SPACE_RESULT_LEAF_VERSION = "native-scale-space-result-leaf-v1" as const
export const NATIVE_SCALE_SPACE_RESULT_NODE_VERSION = "native-scale-space-result-node-v1" as const
export const NATIVE_SCALE_SPACE_IMPLEMENTATION_CLOSURE_VERSION = "native-scale-space-implementation-closure-v1" as const
export const NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION = "native-scale-space-source-certificate-v1" as const
export const NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT = 392
export const NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT = 37
export const NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT = 355
export const NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES = 2_097_152
export const NATIVE_SCALE_SPACE_MAX_RSS_BYTES = 536_870_912
export const NATIVE_SCALE_SPACE_MAX_ENCODED_PIXELS = 2_100_000
export const NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION =
	"region-chromatic-role-0.1.0-poc.10" as const
export const NATIVE_SCALE_SPACE_CANONICAL_ALGORITHM_VERSION = "region-graph-0.19.0" as const
export const NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256 =
	"8c3c42e6a173fc63e4764320ee1b8c6b10c36af828d0427e19d1e3a251296948" as const
export const NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256 =
	"9adadc964bcb94964a1cb4ac4b6c6e7a833f8c76e07afd05028e128e786acfab" as const
export const NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256 =
	"387a9126c301a24aaf0406a87f8ff49fe88a6ea5fde47eb742bf98927a4ee9d3" as const
export const FULL_SOURCE_COUNT = NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT
export const DEVELOPMENT_SOURCE_COUNT = NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT
export const HOLDOUT_SOURCE_COUNT = NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT
export const MAX_RESULT_SHARD_BYTES = NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES
export const RESULT_SHARD_SCHEMA_VERSION = NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION
export const RESULT_COLUMN_SCHEMA_VERSION = NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION
export const RESULT_SHARD_MERKLE_VERSION = NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION
export const PROMOTION_CERTIFICATE_ALGORITHM_VERSION = NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION
export const CANONICAL_CHILD_PROTOCOL_VERSION = NATIVE_SCALE_SPACE_CANONICAL_CHILD_PROTOCOL_VERSION

export const NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA = Object.freeze({
	version: NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
	metricColumns: "object keyed by registered metric ID; each value is aligned to frozen candidate, family, or ordered-edge order",
	availabilityOrder: {
		candidates: "frozen numeric candidate ID order",
		families: "frozen numeric family ID order",
		edges: "lexicographic from stable key then lexicographic to stable key; distinct ordered endpoints",
	},
	reconstructionWinnerRun: "[winningStableKeyIndex,tieCount,runLength] in common-domain sample order; index addresses the frozen candidateStableKeys column",
	contradictionTuple: [
		"entity", "entityIndex", "positiveMetricId", "negativeMetricId",
		"positiveFromArmValue", "positiveToArmValue", "negativeFromArmValue", "negativeToArmValue",
	],
	deltas: "signed to-arm minus from-arm values; arrays retain registered component order",
} as const)
export const RESULT_COLUMN_SCHEMA = NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA

export const NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES = Object.freeze({
	development: Object.freeze({
		path: "research/data/results.json",
		rawSha256: "546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec",
		entries: NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT,
	}),
	holdout00: Object.freeze({
		path: "research/data/holdout-results.json",
		rawSha256: "5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984",
		entries: NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT,
	}),
})

export const NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES = Object.freeze({
	development: Object.freeze({
		path: "research/data/candidates/region-chromatic-role-0.1.0-poc.10/chromatic-role-certificates.json",
		rawSha256: "6c9086c08ddb583ade810d8391b10ce04c38fbdb85b7f2344a2af0a84d16b2b3",
		entries: NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT,
	}),
	holdout00: Object.freeze({
		path: "research/data/candidates/region-chromatic-role-0.1.0-poc.10/holdout-chromatic-role-certificates.json",
		rawSha256: "ce6bca08b738860ba014adf717889844e860a6fb99459ffd2297929808095163",
		entries: NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT,
	}),
})
export const PROMOTION_CERTIFICATE_REFERENCES = NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES

export const NATIVE_SCALE_SPACE_PACKAGE_REFERENCES = Object.freeze({
	"package.json": "6d01b7ca68aae4015b98c3cc560c0dfaf774d0020348271d302b62322ce27ff3",
	"pnpm-lock.yaml": "a858afe1d3946e113b58fc0c7bea25ed6a418d8190ce57951b6a4d0fe3af6058",
})

export const NATIVE_SCALE_SPACE_PREDECESSOR_BASIS = Object.freeze({
	experimentId: "multi-resolution-palette-evidence-audit-0.3.0-development",
	protocolId: "a47dbec1c74f598af2e3c0a9d1e3105ca451bfd8e85292142b95ef44aa5830a4",
	scientificIdentitySha256: "596a1d15e6e6598431fe8a9db53c6a0479660c9d98d34d15e5985e152c1abaed",
	implementationIdentitySha256: "1b4ec4e7b105335fd31ae2a27679262be318d12bd716e528b1899ad2a117cb7e",
	resultMerkleRootSha256: "db4411f3efeac31becc3e839af8578307fb0f5cfa33bb9ec4d424dd9c8c51923",
	disposition: "diagnostic-only-no-selection-no-review-no-promotion",
})

export const NATIVE_SCALE_SPACE_CANONICAL_CHILD_URL = new URL(
	"./resolution-canonical-raster-child.ts",
	import.meta.url,
)
export const NATIVE_SCALE_SPACE_CANONICAL_CHILD_PATH = fileURLToPath(NATIVE_SCALE_SPACE_CANONICAL_CHILD_URL)

export const NATIVE_SCALE_SPACE_IMPLEMENTATION_ROOTS = Object.freeze([
	"research/audit-native-scale-space-evidence.ts",
	"research/src/native-scale-space-raster.ts",
	"research/src/native-scale-space-evidence.ts",
	"research/src/native-scale-space-output.ts",
	"research/resolution-canonical-raster-child.ts",
] as const)

export const NATIVE_SCALE_SPACE_IMPLEMENTATION_EXTRAS = Object.freeze([
	"package.json",
	"pnpm-lock.yaml",
	"research/tests/native-scale-space-raster.test.ts",
	"research/tests/native-scale-space-evidence.test.ts",
	"research/tests/native-scale-space-evidence-audit.test.ts",
	"research/tests/native-scale-space-evidence-artifact.test.ts",
] as const)

export type NativeScaleSpaceAuditArguments = Readonly<{ limit: number | null; noPublish: boolean }>
export type NativeScaleSpaceCohort = "development" | "00"
export type NativeScaleSpaceSourceEntryKey = Readonly<{ cohort: NativeScaleSpaceCohort; file: string }>

export type NativeScaleSpaceCanonicalRosterEntry = Readonly<{
	cohort: NativeScaleSpaceCohort
	artifactIndex: number
	file: string
	sourceRelativePath: string
	canonicalWidth: number
	canonicalHeight: number
}>

export type NativeScaleSpaceBoundRosterEntry = NativeScaleSpaceCanonicalRosterEntry & Readonly<{
	sourceBytes: number
	sourceSha256: string
}>

export type NativeScaleSpaceNarrowPromotionEntry = Readonly<{
	schemaVersion: 1
	algorithmVersion: typeof NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION
	normalizedImageSha256: string
}>

export type NativeScaleSpacePromotionCertificateBinding = Readonly<{
	path: string
	rawSha256: string
	entries: Readonly<Record<string, NativeScaleSpaceNarrowPromotionEntry>>
}>

export type NativeScaleSpaceCanonicalDecode = Readonly<{
	width: number
	height: number
	data: Uint8Array
	sourceSha256: string
	versions: Readonly<Record<string, string>>
}>

export type NativeScaleSpaceMetadataPreflight = Readonly<{
	version: "native-scale-space-metadata-preflight-v1"
	rawMetadata: Readonly<Record<string, unknown>>
	pageCount: 1
	encodedWidth: number
	encodedHeight: number
	encodedPixels: number
	orientation: number | null
	semanticSha256: string
}>

export type NativeScaleSpaceRssCheckpoint = Readonly<{
	label: string
	maxRssKilobytes: number
	peakBytes: number
}>

export type NativeScaleSpaceRssTracker = {
	readonly checkpoints: NativeScaleSpaceRssCheckpoint[]
	maximumBytes: number
}

export type NativeScaleSpaceResultShardRecord = Readonly<{
	path: string
	shardIndex: number
	sourceStartIndex: number
	sourceEndIndexExclusive: number
	sourceCount: 1
	sourceEntryKeys: readonly NativeScaleSpaceSourceEntryKey[]
	bytes: number
	rawSha256: string
	semanticSha256: string
}>

export type NativeScaleSpaceShardedResultsIndex = NativeScaleSpaceCommonHeader & Readonly<{
	shardSchemaVersion: typeof NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION
	columnSchemaVersion: typeof NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION
	columnSchema: typeof NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA
	merkleVersion: typeof NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION
	executionSourceCount: number
	fullSourceCount: typeof NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT
	shards: readonly NativeScaleSpaceResultShardRecord[]
	orderedShardMerkleRootSha256: string
}>

export type NativeScaleSpaceCommonHeader = Readonly<{
	schemaVersion: 1
	experimentId: typeof NATIVE_SCALE_SPACE_EXPERIMENT_ID
	protocolId: string
	metricDefinitionsSha256: typeof NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256
	fixtureManifestSha256: typeof NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256
	expectationsSha256: typeof NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256
	importPolicySha256: typeof NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256
}>

export type NativeScaleSpaceImplementationClosure = Readonly<{
	version: typeof NATIVE_SCALE_SPACE_IMPLEMENTATION_CLOSURE_VERSION
	files: readonly Readonly<{ path: string; rawSha256: string }>[]
	identitySha256: string
}>

export type NativeScaleSpaceSourcePredicates = Readonly<{
	canonicalControlExact: boolean
	nativeIdentityValid: boolean
	availabilityFrozen: boolean
	candidatePartitionExact: boolean
	familyUnionExact: boolean
	witnessMembershipExact: boolean
	q24BoundsValid: boolean
	bcSampleExact: boolean
	coordinatesExact: boolean
	graphComplete: boolean
	metricsFinite: boolean
	artifactRowComplete: boolean
}>

const nativeScaleSpaceSourcePredicateKeys = [
	"canonicalControlExact", "nativeIdentityValid", "availabilityFrozen", "candidatePartitionExact", "familyUnionExact",
	"witnessMembershipExact", "q24BoundsValid", "bcSampleExact", "coordinatesExact", "graphComplete", "metricsFinite",
	"artifactRowComplete",
] as const

type MetricColumns = Readonly<Record<string, readonly NativeScaleSpaceMetricValue[]>>
type ArmEntityColumns = Readonly<{
	metrics: MetricColumns
	viewIdentitySha256: readonly string[]
	valuesSha256: readonly string[]
	lowPassFilterIdentitySha256: readonly (string | null)[]
}>

type NativeScaleSpaceRunnerScratch = Readonly<{
	maximumPixels: number
	mask: Uint8Array
	sat: Uint32Array
	fieldBuffer: ArrayBuffer
	cValues: Uint32Array
	cSourceIndices: Uint32Array
	component: NativeScaleSpaceComponentScratch
}>

type ReconstructionCompact = Readonly<{
	metrics: NativeScaleSpaceMetricRecord
	columns: number
	rows: number
	nativeReferenceCoordinatesSha256: string
	armMappingSha256: string
	winnerCandidateIdsSha256: string
	winnerStableKeyDictionarySha256: string
	tieCountsSha256: string
	winnerRuns: readonly (readonly [stableKeyIndex: number, tieCount: number, runLength: number])[]
}>

export type NativeScaleSpaceArmResult = Readonly<{
	arm: "A" | "B" | "C"
	dimensions: Readonly<{ width: number; height: number }>
	candidates: ArmEntityColumns
	families: ArmEntityColumns
	graphMetrics: NativeScaleSpaceMetricRecord
	edgeMetrics: MetricColumns
	reconstruction: ReconstructionCompact
	sourceIndicesSha256: string | null
}>

export type NativeScaleSpaceTargetResult = Readonly<{
	target: NativeScaleSpaceTarget
	resolved: ReturnType<typeof resolveNativeScaleSpaceTarget>
	coordinateHashes: Readonly<{ sourceIndicesSha256: string; targetFootprintsSha256: string }>
	partitionResidual: ReturnType<typeof finalizeQ24PartitionResidual>
	partitionMetrics: NativeScaleSpaceMetricRecord
	bcMetrics: NativeScaleSpaceMetricRecord
	b: NativeScaleSpaceArmResult
	c: NativeScaleSpaceArmResult
	deltas: Readonly<{ ab: NativeScaleSpaceMetricDeltaSet; bc: NativeScaleSpaceMetricDeltaSet }>
	contradictions: readonly NativeScaleSpaceContradiction[]
}>

export type NativeScaleSpaceMetricDeltaSet = Readonly<{
	candidate: MetricColumns
	family: MetricColumns
	edge: MetricColumns
	reconstruction: MetricColumns
	ties: Readonly<{ candidate: number; family: number; edge: number; reconstruction: number }>
}>

export type NativeScaleSpaceContradiction = readonly [
	entity: "candidate" | "family" | "edge" | "reconstruction",
	entityIndex: number,
	positiveMetricId: string,
	negativeMetricId: string,
	fromPositive: number,
	toPositive: number,
	fromNegative: number,
	toNegative: number,
]

export type NativeScaleSpaceSourceResult = {
	schemaVersion: 1
	sourceIndex: number
	cohort: NativeScaleSpaceCohort
	file: string
	source: Readonly<{ relativePath: string; bytes: number; sha256: string }>
	canonicalControl: Readonly<{
		width: number
		height: number
		normalizedImageSha256: string
		computedNormalizedImageSha256: string
		promotionCertificatePath: string
		promotionCertificateRawSha256: string
		canonicalRuntimeSha256: string
	}>
	metadataPreflight: NativeScaleSpaceMetadataPreflight
	native: Readonly<{
		width: number
		height: number
		pixels: number
		rgbBytes: number
		rawSha256: string
		identitySha256: string
		decodePolicy: string
		bounds: ReturnType<typeof nativeScaleSpaceRasterBounds>
	}>
	availability: Readonly<{
		version: typeof NATIVE_SCALE_SPACE_AVAILABILITY_VERSION
		identitySha256: string
		candidateLabelsSha256: string
		candidateStableKeys: readonly string[]
		candidateMaskSha256: readonly string[]
		candidateWitnessRgb: readonly (readonly number[])[]
		candidateWitnessOklab: readonly (readonly number[])[]
		candidateMeanOklab: readonly (readonly number[])[]
		candidateWitnessIndex: readonly number[]
		candidateAnalysisRgb: readonly (readonly number[])[]
		candidateAnalysisOklab: readonly (readonly number[])[]
		candidateAnalysisIndex: readonly number[]
		candidateAnalysisDistance: readonly number[]
		candidateAnalysisNativeExact: readonly boolean[]
		nativeVersusAnalysisWitnessExact: readonly boolean[]
		familyStableKeys: readonly string[]
		familyMaskSha256: readonly string[]
		familyAnchorCandidateIds: readonly number[]
		familyMemberOffsets: readonly number[]
		familyMemberCandidateIds: readonly number[]
		orderedEdges: readonly Readonly<{ fromCandidateId: number; toCandidateId: number }>[]
	}>
	a: NativeScaleSpaceArmResult
	targets: NativeScaleSpaceTargetResult[]
	targetDimensionEqualities: readonly Readonly<{ firstTargetIndex: number; secondTargetIndex: number; equal: boolean }>[]
	predicates: NativeScaleSpaceSourcePredicates
	resource: Readonly<{
		satBytes: number
		maximumRssBytes: number
		checkpoints: readonly NativeScaleSpaceRssCheckpoint[]
	}>
}

export type NativeScaleSpaceSourceCertificate = NativeScaleSpaceCommonHeader & Readonly<{
	certificateVersion: typeof NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION
	sourceIndex: number
	cohort: NativeScaleSpaceCohort
	file: string
	sourceSha256: string
	normalizedImageSha256: string
	metadataSemanticSha256: string
	canonicalRuntimeSha256: string
	modernRuntimeSha256: string
	nativeIdentitySha256: string
	availabilityIdentitySha256: string
	resultShardPath: string
	resultShardSemanticSha256: string
	predicates: NativeScaleSpaceSourcePredicates
	resource: Readonly<{ maximumRssBytes: number; checkpoints: readonly NativeScaleSpaceRssCheckpoint[] }>
	identitySha256: string
}>

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function stringChunkEnd(value: string, start: number, maximumEnd: number): number {
	let end = Math.min(value.length, maximumEnd)
	if (end < value.length) {
		const finalCodeUnit = value.charCodeAt(end - 1)
		if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) end--
	}
	if (end <= start) throw new Error("Canonical UTF-8 chunk boundary did not advance")
	return end
}

function sha256StringChunks(value: string, endExclusive = value.length): string {
	const hash = createHash("sha256")
	const chunkCodeUnits = 64 * 1024
	for (let start = 0; start < endExclusive;) {
		const end = stringChunkEnd(value, start, Math.min(endExclusive, start + chunkCodeUnits))
		hash.update(value.slice(start, end), "utf8")
		start = end
	}
	return hash.digest("hex")
}

async function writeCanonicalSerializedAtomic(path: string, serialized: string): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	const handle = await open(temporary, "wx")
	try {
		const chunkCodeUnits = 64 * 1024
		for (let start = 0; start < serialized.length;) {
			const end = stringChunkEnd(serialized, start, start + chunkCodeUnits)
			await handle.write(serialized.slice(start, end), null, "utf8")
			start = end
		}
	} finally {
		await handle.close()
	}
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

async function writeCanonicalJsonStream(
	path: string,
	value: unknown,
	maximumBytes: number,
): Promise<Readonly<{ rawSha256: string; semanticSha256: string; bytes: number }>> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	const handle = await open(temporary, "wx")
	const rawHash = createHash("sha256")
	const semanticHash = createHash("sha256")
	const pending: string[] = []
	const ancestors = new Set<object>()
	let pendingCodeUnits = 0
	let bytes = 0
	const flush = async (): Promise<void> => {
		if (pending.length === 0) return
		const chunk = pending.join("")
		pending.length = 0
		pendingCodeUnits = 0
		const chunkBytes = Buffer.byteLength(chunk)
		bytes += chunkBytes
		if (bytes + 1 > maximumBytes) throw new Error(`Result shard exceeds ${maximumBytes} bytes: at least ${bytes + 1}`)
		rawHash.update(chunk, "utf8")
		semanticHash.update(chunk, "utf8")
		await handle.write(chunk, null, "utf8")
	}
	const append = async (token: string): Promise<void> => {
		pending.push(token)
		pendingCodeUnits += token.length
		if (pendingCodeUnits >= 64 * 1024) await flush()
	}
	const visit = async (current: unknown): Promise<void> => {
		if (current === null) {
			await append("null")
			return
		}
		switch (typeof current) {
			case "string": await append(JSON.stringify(current)); return
			case "boolean": await append(current ? "true" : "false"); return
			case "number":
				if (!Number.isFinite(current)) throw new TypeError("canonical JSON numbers must be finite")
				await append(JSON.stringify(Object.is(current, -0) ? 0 : current))
				return
			case "undefined": throw new TypeError("canonical JSON rejects undefined")
			case "bigint": throw new TypeError("canonical JSON rejects BigInt values")
			case "function": throw new TypeError("canonical JSON rejects functions")
			case "symbol": throw new TypeError("canonical JSON rejects symbols")
			case "object": break
		}
		const object = current as object
		if (ancestors.has(object)) throw new TypeError("canonical JSON rejects cyclic values")
		if (Object.getOwnPropertySymbols(object).length > 0) throw new TypeError("canonical JSON rejects symbol keys")
		ancestors.add(object)
		try {
			if (Array.isArray(current)) {
				const keys = Object.keys(current)
				if (keys.length !== current.length) throw new TypeError("canonical JSON rejects sparse arrays or array properties")
				await append("[")
				for (let index = 0; index < current.length; index++) {
					if (!Object.prototype.hasOwnProperty.call(current, index) || keys[index] !== String(index)) {
						throw new TypeError("canonical JSON rejects sparse arrays or array properties")
					}
					if (index > 0) await append(",")
					await visit(current[index])
				}
				await append("]")
				return
			}
			const prototype = Object.getPrototypeOf(current)
			if (prototype !== Object.prototype && prototype !== null) throw new TypeError("canonical JSON rejects unsupported objects")
			await append("{")
			const keys = Object.keys(current).sort()
			for (let index = 0; index < keys.length; index++) {
				const key = keys[index]
				const descriptor = Object.getOwnPropertyDescriptor(current, key)
				if (!descriptor || !("value" in descriptor)) throw new TypeError("canonical JSON rejects accessor properties")
				if (index > 0) await append(",")
				await append(`${JSON.stringify(key)}:`)
				await visit(descriptor.value)
			}
			await append("}")
		} finally {
			ancestors.delete(object)
		}
	}
	try {
		await visit(value)
		await flush()
		bytes++
		if (bytes > maximumBytes) throw new Error(`Result shard exceeds ${maximumBytes} bytes: ${bytes}`)
		rawHash.update("\n", "utf8")
		await handle.write("\n", null, "utf8")
	} catch (error) {
		await handle.close()
		await rm(temporary, { force: true })
		throw error
	}
	await handle.close()
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
	return Object.freeze({ rawSha256: rawHash.digest("hex"), semanticSha256: semanticHash.digest("hex"), bytes })
}

export function semanticSha256(value: unknown): string {
	return sha256(canonicalJson(value))
}

export function canonicalSerialize(value: unknown): string {
	return `${canonicalJson(value)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has an invalid exact schema`)
	}
}

function assertSha256(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest`)
	}
}

function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive safe integer`)
}

function safeProduct(first: number, second: number, label: string): number {
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 0 || second < 0 ||
		(first !== 0 && second > Math.floor(Number.MAX_SAFE_INTEGER / first))) {
		throw new Error(`${label} exceeds safe integer precision`)
	}
	return first * second
}

export function parseNativeScaleSpaceAuditArguments(arguments_: readonly string[]): NativeScaleSpaceAuditArguments {
	let limit: number | null = null
	let noPublish = false
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index]
		if (argument === "--no-publish") {
			if (noPublish) throw new Error("--no-publish may only be supplied once")
			noPublish = true
			continue
		}
		if (argument === "--limit") {
			if (limit !== null) throw new Error("--limit may only be supplied once")
			const raw = arguments_[++index]
			if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) throw new Error("--limit requires a positive integer")
			limit = Number(raw)
			if (!Number.isSafeInteger(limit) || limit > NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT) {
				throw new Error(`--limit cannot exceed ${NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT}`)
			}
			continue
		}
		throw new Error(`Unknown argument: ${argument}`)
	}
	if (limit !== null && !noPublish) throw new Error("--limit requires --no-publish")
	return Object.freeze({ limit, noPublish })
}

export const parseAuditArguments = parseNativeScaleSpaceAuditArguments

function developmentSourcePath(file: string): string {
	if (file.length === 0 || file === "." || file === ".." || file.includes("\0") || file.includes("/") ||
		file.includes("\\") || basename(file) !== file) throw new Error(`Unsafe development source path: ${file}`)
	return `images/${file}`
}

function holdoutSourcePath(file: string): string {
	if (!/^00\/[^/\\]+$/.test(file) || file.includes("\0")) throw new Error(`Unsafe 00 source path: ${file}`)
	return file
}

function parseCanonicalCohort(
	value: unknown,
	cohort: NativeScaleSpaceCohort,
	expectedCount: number,
): NativeScaleSpaceCanonicalRosterEntry[] {
	if (!isRecord(value) || value.algorithmVersion !== NATIVE_SCALE_SPACE_CANONICAL_ALGORITHM_VERSION ||
		!Array.isArray(value.entries)) throw new Error(`${cohort} canonical artifact header is invalid`)
	if (value.entries.length !== expectedCount) throw new Error(`${cohort} canonical roster must contain exactly ${expectedCount} entries`)
	const files = new Set<string>()
	return value.entries.map((entry, artifactIndex) => {
		if (!isRecord(entry) || typeof entry.file !== "string") throw new Error(`${cohort} canonical entry ${artifactIndex} is invalid`)
		assertPositiveSafeInteger(entry.width, `${cohort} canonical width`)
		assertPositiveSafeInteger(entry.height, `${cohort} canonical height`)
		if (entry.width > 224 || entry.height > 224) throw new Error(`${cohort} canonical dimensions exceed max-edge 224`)
		if (files.has(entry.file)) throw new Error(`${cohort} canonical roster contains a duplicate file`)
		files.add(entry.file)
		return Object.freeze({
			cohort,
			artifactIndex,
			file: entry.file,
			sourceRelativePath: cohort === "development" ? developmentSourcePath(entry.file) : holdoutSourcePath(entry.file),
			canonicalWidth: entry.width,
			canonicalHeight: entry.height,
		})
	})
}

export function deriveNativeScaleSpaceCanonicalRoster(
	development: unknown,
	holdout: unknown,
): NativeScaleSpaceCanonicalRosterEntry[] {
	const roster = [
		...parseCanonicalCohort(development, "development", NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT),
		...parseCanonicalCohort(holdout, "00", NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT),
	]
	if (roster.length !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT) throw new Error("Canonical roster count does not reconcile")
	return roster
}

export const deriveCanonicalRoster = deriveNativeScaleSpaceCanonicalRoster

export function resolveNativeScaleSpaceBoundSourcePath(projectRoot: string, sourceRelativePath: string): string {
	const root = resolve(projectRoot)
	if (sourceRelativePath.startsWith("images/")) {
		const name = sourceRelativePath.slice("images/".length)
		if (developmentSourcePath(name) !== sourceRelativePath) throw new Error("Unsafe bound images source path")
		return join(root, "images", name)
	}
	if (sourceRelativePath.startsWith("00/")) {
		if (holdoutSourcePath(sourceRelativePath) !== sourceRelativePath) throw new Error("Unsafe bound 00 source path")
		return join(root, "00", sourceRelativePath.slice(3))
	}
	throw new Error("Bound source must be one direct child of images/ or 00/")
}

export const resolveBoundSourcePath = resolveNativeScaleSpaceBoundSourcePath

async function requirePhysicalRoot(path: string, label: string): Promise<string> {
	const normalized = resolve(path)
	const metadata = await lstat(normalized)
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label} must be a real directory`)
	const physical = await realpath(normalized)
	if (physical !== normalized) throw new Error(`${label} physical identity is not exact`)
	return physical
}

export async function readNativeScaleSpaceBoundSource(projectRoot: string, sourceRelativePath: string): Promise<Uint8Array> {
	const physicalRoot = await requirePhysicalRoot(projectRoot, "Project root")
	const rootName = sourceRelativePath.startsWith("images/") ? "images" : sourceRelativePath.startsWith("00/") ? "00" : null
	if (rootName === null) throw new Error("Bound source must be one direct child of images/ or 00/")
	const allowedRoot = join(physicalRoot, rootName)
	const rootMetadata = await lstat(allowedRoot)
	if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory() || await realpath(allowedRoot) !== allowedRoot) {
		throw new Error(`${rootName}/ must be a real direct child of the project root`)
	}
	const path = resolveNativeScaleSpaceBoundSourcePath(physicalRoot, sourceRelativePath)
	const before = await lstat(path)
	if (before.isSymbolicLink() || !before.isFile()) throw new Error(`Source is not a regular non-symlink file: ${sourceRelativePath}`)
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
	try {
		const opened = await handle.stat()
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
			throw new Error(`Source changed while opening: ${sourceRelativePath}`)
		}
		return await handle.readFile()
	} finally {
		await handle.close()
	}
}

export async function bindNativeScaleSpaceSourceRoster(
	projectRoot: string,
	roster: readonly NativeScaleSpaceCanonicalRosterEntry[],
): Promise<NativeScaleSpaceBoundRosterEntry[]> {
	if (roster.length !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT) throw new Error("Complete source roster binding requires 392 entries")
	const bound: NativeScaleSpaceBoundRosterEntry[] = []
	for (const entry of roster) {
		const bytes = await readNativeScaleSpaceBoundSource(projectRoot, entry.sourceRelativePath)
		bound.push(Object.freeze({ ...entry, sourceBytes: bytes.byteLength, sourceSha256: sha256(bytes) }))
	}
	const identity = nativeScaleSpaceSourceRosterIdentity(bound)
	if (identity.sha256 !== NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256) {
		throw new Error("Bound source roster SHA-256 does not equal the exact canonical roster")
	}
	return bound
}

export function nativeScaleSpaceSourceRosterIdentity(roster: readonly NativeScaleSpaceBoundRosterEntry[]) {
	const entries = roster.map((entry) => ({
		cohort: entry.cohort,
		artifactIndex: entry.artifactIndex,
		file: entry.file,
		relativePath: entry.sourceRelativePath,
		bytes: entry.sourceBytes,
		sha256: entry.sourceSha256,
	}))
	return Object.freeze({ count: entries.length, entries, sha256: semanticSha256(entries) })
}

export function parseNativeScaleSpacePromotionCertificate(
	bytes: Uint8Array,
	cohort: NativeScaleSpaceCohort,
	expectedFiles: readonly string[],
): NativeScaleSpacePromotionCertificateBinding {
	const reference = cohort === "development"
		? NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development
		: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.holdout00
	const rawSha256 = sha256(bytes)
	if (rawSha256 !== reference.rawSha256) throw new Error(`${cohort} promotion certificate raw SHA-256 changed`)
	let parsed: unknown
	try {
		parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
	} catch (error) {
		throw new Error(`${cohort} promotion certificate JSON is invalid`, { cause: error })
	}
	if (!isRecord(parsed)) throw new Error(`${cohort} promotion certificate is not an object`)
	requireExactKeys(parsed, ["schemaVersion", "algorithmVersion", "entries"], `${cohort} promotion certificate`)
	if (parsed.schemaVersion !== 1 || parsed.algorithmVersion !== NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION ||
		!isRecord(parsed.entries)) throw new Error(`${cohort} promotion certificate header is invalid`)
	const actualFiles = Object.keys(parsed.entries)
	const expectedFileSet = new Set(expectedFiles)
	if (actualFiles.length !== reference.entries || expectedFiles.length !== reference.entries ||
		expectedFileSet.size !== expectedFiles.length || actualFiles.some((file) => !expectedFileSet.has(file))) {
		throw new Error(`${cohort} promotion certificate keys/count do not match the canonical roster`)
	}
	const projected: Record<string, NativeScaleSpaceNarrowPromotionEntry> = Object.create(null)
	for (const file of actualFiles) {
		const value = parsed.entries[file]
		if (!isRecord(value) || value.schemaVersion !== 1 ||
			value.algorithmVersion !== NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION) {
			throw new Error(`${cohort} promotion certificate entry ${file} has an invalid narrow header`)
		}
		assertSha256(value.normalizedImageSha256, `${cohort} promotion normalized image`)
		projected[file] = Object.freeze({
			schemaVersion: 1,
			algorithmVersion: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_ALGORITHM_VERSION,
			normalizedImageSha256: value.normalizedImageSha256,
		})
	}
	return Object.freeze({ path: reference.path, rawSha256, entries: Object.freeze(projected) })
}

export const parsePromotionCertificateArtifact = parseNativeScaleSpacePromotionCertificate

export function normalizedImageSha256(image: { width: number; height: number; data: Uint8Array }): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

type CanonicalChildWireResponse = {
	id: string | null
	ok: boolean
	protocolVersion: string
	width?: number
	height?: number
	dataBase64?: string
	sourceSha256?: string
	versions?: Record<string, string>
	error?: string
}

export class CanonicalRasterChild {
	readonly #child: ChildProcessWithoutNullStreams
	readonly #pending = new Map<string, { resolve: (value: CanonicalChildWireResponse) => void; reject: (error: Error) => void }>()
	readonly #exit: Promise<void>
	#nextId = 1
	#stderr = ""

	constructor(projectRoot: string) {
		this.#child = spawn(process.execPath, [
			"--no-warnings",
			"--experimental-strip-types",
			NATIVE_SCALE_SPACE_CANONICAL_CHILD_PATH,
			"--project-root",
			resolve(projectRoot),
		], { stdio: ["pipe", "pipe", "pipe"] })
		this.#child.stderr.setEncoding("utf8")
		this.#child.stderr.on("data", (chunk: string) => {
			this.#stderr = `${this.#stderr}${chunk}`.slice(-16_384)
		})
		const output = createInterface({ input: this.#child.stdout, crlfDelay: Infinity })
		output.on("line", (line) => this.#handleLine(line))
		this.#exit = new Promise((resolveExit, rejectExit) => {
			this.#child.once("error", rejectExit)
			this.#child.once("exit", (code, signal) => {
				const error = code === 0 ? null : new Error(
					`Canonical raster child exited with ${signal ?? `code ${String(code)}`}: ${this.#stderr.trim()}`,
				)
				for (const pending of this.#pending.values()) pending.reject(error ?? new Error("Canonical raster child closed"))
				this.#pending.clear()
				if (error) rejectExit(error)
				else resolveExit()
			})
		})
	}

	#handleLine(line: string): void {
		let response: CanonicalChildWireResponse
		try {
			response = JSON.parse(line) as CanonicalChildWireResponse
		} catch {
			for (const pending of this.#pending.values()) pending.reject(new Error("Canonical child emitted invalid JSON-lines data"))
			this.#pending.clear()
			this.#child.kill()
			return
		}
		if (typeof response.id !== "string") return
		const pending = this.#pending.get(response.id)
		if (!pending) return
		this.#pending.delete(response.id)
		if (!response.ok) {
			pending.reject(new Error(response.error ?? "Canonical child rejected the request"))
			return
		}
		if (response.protocolVersion !== NATIVE_SCALE_SPACE_CANONICAL_CHILD_PROTOCOL_VERSION) {
			pending.reject(new Error("Canonical child returned an invalid protocol version"))
			return
		}
		pending.resolve(response)
	}

	#request(request: Record<string, unknown>): Promise<CanonicalChildWireResponse> {
		const id = String(this.#nextId++)
		return new Promise((resolveRequest, rejectRequest) => {
			this.#pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
			this.#child.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
				if (!error) return
				this.#pending.delete(id)
				rejectRequest(error)
			})
		})
	}

	async decode(source: string): Promise<NativeScaleSpaceCanonicalDecode> {
		const response = await this.#request({ operation: "decode-224", source })
		assertPositiveSafeInteger(response.width, "Canonical child width")
		assertPositiveSafeInteger(response.height, "Canonical child height")
		if (typeof response.dataBase64 !== "string" || typeof response.sourceSha256 !== "string" || !isRecord(response.versions)) {
			throw new Error("Canonical child returned an invalid decode response")
		}
		const data = new Uint8Array(Buffer.from(response.dataBase64, "base64"))
		if (data.length !== response.width * response.height * 3) throw new Error("Canonical child byte length is invalid")
		assertSha256(response.sourceSha256, "Canonical child source identity")
		if (Object.values(response.versions).some((value) => typeof value !== "string") || response.versions.sharp !== "0.33.5") {
			throw new Error("Canonical child runtime is invalid")
		}
		return Object.freeze({
			width: response.width,
			height: response.height,
			data,
			sourceSha256: response.sourceSha256,
			versions: Object.freeze({ ...response.versions as Record<string, string> }),
		})
	}

	async close(): Promise<void> {
		if (!this.#child.stdin.destroyed) this.#child.stdin.end()
		await this.#exit
	}
}

function jsonMetadataProjection(value: unknown, label: string): unknown {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${label} contains a nonfinite number`)
		return Object.is(value, -0) ? 0 : value
	}
	if (Array.isArray(value)) return value.map((entry, index) => jsonMetadataProjection(entry, `${label}[${index}]`))
	if (!isRecord(value)) throw new Error(`${label} contains an unsupported value`)
	return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
		const child = value[key]
		return child === undefined ? [] : [[key, jsonMetadataProjection(child, `${label}.${key}`)]]
	}))
}

export function validateNativeScaleSpaceMetadata(metadata: unknown): NativeScaleSpaceMetadataPreflight {
	if (!isRecord(metadata)) throw new Error("Encoded metadata must be an object")
	assertPositiveSafeInteger(metadata.width, "Encoded metadata width")
	assertPositiveSafeInteger(metadata.height, "Encoded metadata height")
	const encodedPixels = safeProduct(metadata.width, metadata.height, "Encoded metadata pixel count")
	if (encodedPixels > NATIVE_SCALE_SPACE_MAX_ENCODED_PIXELS) throw new Error("Encoded metadata exceeds the input pixel bound")
	const pageCount = metadata.pages ?? 1
	if (pageCount !== 1) throw new Error("Encoded metadata must contain exactly one page")
	const orientation = metadata.orientation ?? null
	if (orientation !== null && (!Number.isSafeInteger(orientation) || (orientation as number) < 1 || (orientation as number) > 8)) {
		throw new Error("Encoded metadata orientation must be absent or 1 through 8")
	}
	const rawMetadata = jsonMetadataProjection(metadata, "Encoded metadata") as Readonly<Record<string, unknown>>
	const descriptor = {
		version: "native-scale-space-metadata-preflight-v1" as const,
		rawMetadata,
		pageCount: 1 as const,
		encodedWidth: metadata.width,
		encodedHeight: metadata.height,
		encodedPixels,
		orientation: orientation as number | null,
	}
	return Object.freeze({ ...descriptor, semanticSha256: semanticSha256(descriptor) })
}

export async function preflightNativeRasterMetadata(input: EncodedImageInput): Promise<NativeScaleSpaceMetadataPreflight> {
	const metadata = await sharpModern(input, { limitInputPixels: 2_100_000 }).metadata()
	return validateNativeScaleSpaceMetadata(metadata)
}

export function createNativeScaleSpaceRssTracker(initial?: NativeScaleSpaceRssCheckpoint): NativeScaleSpaceRssTracker {
	if (initial && (!Number.isSafeInteger(initial.maxRssKilobytes) || initial.maxRssKilobytes < 0 ||
		!Number.isSafeInteger(initial.peakBytes) || initial.peakBytes !== initial.maxRssKilobytes * 1024 ||
		initial.peakBytes > NATIVE_SCALE_SPACE_MAX_RSS_BYTES)) throw new Error("Initial RSS checkpoint is invalid")
	return { checkpoints: initial ? [initial] : [], maximumBytes: initial?.peakBytes ?? 0 }
}

export function sampleNativeScaleSpaceRss(
	tracker: NativeScaleSpaceRssTracker,
	label: string,
): NativeScaleSpaceRssCheckpoint {
	if (typeof label !== "string" || label.length === 0) throw new Error("RSS checkpoint label must be nonempty")
	const maxRssKilobytes = process.resourceUsage().maxRSS
	if (!Number.isSafeInteger(maxRssKilobytes) || maxRssKilobytes < 0) throw new Error("process.resourceUsage().maxRSS is invalid")
	const peakBytes = safeProduct(maxRssKilobytes, 1024, "RSS peak bytes")
	const checkpoint = Object.freeze({ label, maxRssKilobytes, peakBytes })
	tracker.checkpoints.push(checkpoint)
	tracker.maximumBytes = Math.max(tracker.maximumBytes, peakBytes)
	if (tracker.maximumBytes > NATIVE_SCALE_SPACE_MAX_RSS_BYTES) {
		throw new Error(`Peak process RSS at ${label} is ${tracker.maximumBytes} bytes; limit is ${NATIVE_SCALE_SPACE_MAX_RSS_BYTES}; current=${canonicalJson(process.memoryUsage())}; heap=${canonicalJson(getHeapStatistics())}`)
	}
	return checkpoint
}

let nativeScaleSpaceInspector: Session | undefined

async function collectReleasedNativeScaleSpaceSourceMemory(): Promise<void> {
	if (nativeScaleSpaceInspector === undefined) {
		nativeScaleSpaceInspector = new Session()
		nativeScaleSpaceInspector.connect()
	}
	await new Promise<void>((resolveCollection, rejectCollection) => {
		nativeScaleSpaceInspector?.post("HeapProfiler.collectGarbage", (error) => {
			if (error) rejectCollection(error)
			else resolveCollection()
		})
	})
}

export function computeNativeScaleSpaceProtocolId(protocolWithoutProtocolId: unknown): string {
	return domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_PROTOCOL_VERSION, protocolWithoutProtocolId)
}

export function buildNativeScaleSpaceEvidenceProtocol() {
	const identity = {
		schemaVersion: 1,
		experimentId: NATIVE_SCALE_SPACE_EXPERIMENT_ID,
		artifactSchemaVersion: NATIVE_SCALE_SPACE_AUDIT_SCHEMA_VERSION,
		versions: {
			protocol: NATIVE_SCALE_SPACE_PROTOCOL_VERSION,
			raster: NATIVE_SCALE_SPACE_RASTER_VERSION,
			availability: NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
			lowPassFilter: NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY.version,
			output: NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION,
			metricDefinitions: NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
			fixtureManifest: NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
			expectations: NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
			resultShard: NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
			resultColumns: NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
			merkle: NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION,
			importPolicy: NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
		},
		registries: {
			metricDefinitions: NATIVE_SCALE_SPACE_METRIC_DEFINITIONS,
			metricDefinitionsSha256: NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
			fixtureManifest: NATIVE_SCALE_SPACE_FIXTURE_MANIFEST,
			fixtureManifestSha256: NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
			expectations: NATIVE_SCALE_SPACE_EXPECTATIONS,
			expectationsSha256: NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
			importPolicy: NATIVE_SCALE_SPACE_IMPORT_POLICY,
			importPolicySha256: NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
		},
		canonicalLane: {
			algorithmVersion: NATIVE_SCALE_SPACE_CANONICAL_ALGORITHM_VERSION,
			sharpVersion: "0.33.5",
			childProtocolVersion: NATIVE_SCALE_SPACE_CANONICAL_CHILD_PROTOCOL_VERSION,
			childExecutable: "research/resolution-canonical-raster-child.ts",
			operation: "decode-224",
			normalizedRasterIdentity: "SHA256(UTF8(width+'x'+height+':')||RGBBytes)",
			requiredRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256,
			artifacts: NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES,
			promotionCertificates: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES,
			adapterProjection: ["schemaVersion", "algorithmVersion", "normalizedImageSha256"],
		},
		modernLane: {
			sharpVersion: "0.35.3",
			requiredRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256,
			metadataCall: "sharpModern(input,{limitInputPixels:2100000}).metadata()",
			decodePolicy: NATIVE_DECODE_POLICY,
			decodeNativeOnce: true,
			concurrentSources: 1,
			executionPolicy: NATIVE_SCALE_SPACE_MODERN_SHARP_EXECUTION_POLICY,
		},
		sourceRoster: {
			development: NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT,
			holdout00: NATIVE_SCALE_SPACE_HOLDOUT_SOURCE_COUNT,
			total: NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT,
			requiredSha256: NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256,
			order: "37 development entries then 355 00 entries in canonical artifact order",
		},
		targets: {
			corpus: NATIVE_SCALE_SPACE_CORPUS_TARGETS,
			fixture: NATIVE_SCALE_SPACE_EXPECTATIONS.targetMatrix,
			attributionsNeverPooled: true,
			withoutEnlargement: true,
		},
		arms: {
			A: "one frozen native binary Q0.24 row",
			B: "centered clipped box Q0.24 at native dimensions per target",
			C: "exact nearest-center samples of corresponding B per target",
			cardinality: { A: 1, BPerTarget: 1, CPerTarget: 1, targets: 4 },
		},
		resourcePolicy: {
			...NATIVE_SCALE_SPACE_RASTER_LIMITS,
			maximumEncodedPixels: NATIVE_SCALE_SPACE_MAX_ENCODED_PIXELS,
			maximumProcessRssBytes: NATIVE_SCALE_SPACE_MAX_RSS_BYTES,
			rssSourceUnits: "process.resourceUsage().maxRSS-kibibytes-times-1024",
			maximumSourceShardBytes: NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES,
			commonDomainSamples: 16_384,
			releaseCollection: "v8-compacting-full-gc-at-availability-arm-target-and-source-lifetime-boundaries",
			oneLabelPlane: true,
			oneLazyMask: true,
			oneLazySummedAreaTable: true,
			oneLazyQ24Plane: true,
			sequentialSourcesMasksTargets: true,
			executionSchedule: "selected-prefix-metadata-preflight-once;encoded-pixels-descending;roster-index-tie;artifacts-roster-ordered",
		},
		resultPolicy: {
			shardVersion: NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
			columnVersion: NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
			columnSchema: NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA,
			merkleVersion: NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION,
			oneSourcePerShard: true,
			wholeSourceResultMatrix: false,
			maximumShardBytes: NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES,
			leafDomain: NATIVE_SCALE_SPACE_RESULT_LEAF_VERSION,
			nodeDomain: NATIVE_SCALE_SPACE_RESULT_NODE_VERSION,
		},
		implementationIdentity: {
			version: NATIVE_SCALE_SPACE_IMPLEMENTATION_CLOSURE_VERSION,
			method: "recursive-local-static-import-closure-plus-declared-extras",
			roots: NATIVE_SCALE_SPACE_IMPLEMENTATION_ROOTS,
			extras: NATIVE_SCALE_SPACE_IMPLEMENTATION_EXTRAS,
			packages: NATIVE_SCALE_SPACE_PACKAGE_REFERENCES,
		},
		identityPolicy: {
			protocolDomain: NATIVE_SCALE_SPACE_PROTOCOL_VERSION,
			scientificIdentityDomain: NATIVE_SCALE_SPACE_SCIENTIFIC_IDENTITY_VERSION,
			limitChangesExecutionOnly: true,
			fullIdentityUnchangedUnderLimit: true,
		},
		dispositionRules: NATIVE_SCALE_SPACE_EXPECTATIONS.dispositionPrecedence,
		corpusAnalysis: {
			outputs: ["diagnostic-distributions", "counts", "ties", "contradictions"],
			aggregateWinner: false,
			qualityScalar: false,
			ranking: false,
		},
		publication: {
			finalJsonFiles: 398,
			topLevelJsonFiles: ["protocol.json", "results.json", "certificates.json", "controls.json", "analysis.json", "manifest.json"],
			atomicFinalRename: true,
			preexistingFinalHardStop: true,
			limitRequiresNoPublish: true,
		},
		predecessorBasis: NATIVE_SCALE_SPACE_PREDECESSOR_BASIS,
		authorization: "diagnostic-evidence-only-no-selection-no-review-no-promotion",
	}
	return Object.freeze({ ...identity, protocolId: computeNativeScaleSpaceProtocolId(identity) })
}

export const buildNativeScaleSpaceAuditProtocol = buildNativeScaleSpaceEvidenceProtocol

type ScannedImport = { kind: "static" | "dynamic" | "executable"; specifier: string }

function maskTypeScriptCommentsAndStrings(source: string): { code: string; strings: string[] } {
	let output = ""
	const strings: string[] = []
	for (let index = 0; index < source.length;) {
		if (source[index] === "/" && source[index + 1] === "/") {
			let end = index + 2
			while (end < source.length && source[end] !== "\n") end++
			output += " ".repeat(end - index)
			index = end
			continue
		}
		if (source[index] === "/" && source[index + 1] === "*") {
			const end = source.indexOf("*/", index + 2)
			if (end < 0) throw new Error("Implementation source contains an unterminated block comment")
			output += source.slice(index, end + 2).replace(/[^\n]/g, " ")
			index = end + 2
			continue
		}
		const quote = source[index]
		if (quote === "\"" || quote === "'" || quote === "`") {
			let end = index + 1
			let value = ""
			for (; end < source.length; end++) {
				if (source[end] === "\\") {
					value += source[end + 1] ?? ""
					end++
					continue
				}
				if (source[end] === quote) break
				value += source[end]
			}
			if (end >= source.length) throw new Error("Implementation source contains an unterminated string")
			const placeholder = `__NSS_STRING_${strings.length}__`
			strings.push(value)
			output += `${quote}${placeholder}${quote}`
			index = end + 1
			continue
		}
		output += source[index]
		index++
	}
	return { code: output, strings }
}

function stringFromPlaceholder(value: string, strings: readonly string[]): string {
	const match = /^__NSS_STRING_(\d+)__$/.exec(value)
	if (!match) throw new Error("Implementation import string could not be decoded")
	const result = strings[Number(match[1])]
	if (result === undefined) throw new Error("Implementation import string index is invalid")
	return result
}

export function scanNativeScaleSpaceImplementationImports(source: string): readonly ScannedImport[] {
	const { code, strings } = maskTypeScriptCommentsAndStrings(source)
	const edges: ScannedImport[] = []
	const placeholder = "[\"'](__NSS_STRING_\\d+__)[\"']"
	const declaration = new RegExp(`\\b(?:import|export)\\s+(?:type\\s+)?(?:[^;]*?\\s+from\\s+)?${placeholder}`, "gs")
	for (const match of code.matchAll(declaration)) edges.push({ kind: "static", specifier: stringFromPlaceholder(match[1], strings) })
	const dynamic = new RegExp(`\\b(?:import|require)\\s*\\(\\s*${placeholder}`, "g")
	for (const match of code.matchAll(dynamic)) edges.push({ kind: "dynamic", specifier: stringFromPlaceholder(match[1], strings) })
	const executable = new RegExp(`\\bnew\\s+URL\\s*\\(\\s*${placeholder}\\s*,\\s*import\\.meta\\.url`, "g")
	for (const match of code.matchAll(executable)) {
		const specifier = stringFromPlaceholder(match[1], strings)
		if (/\.(?:[cm]?js|ts)$/.test(specifier)) edges.push({ kind: "executable", specifier })
	}
	const directExecutable = new RegExp(`\\b(?:spawn|fork|new\\s+Worker)\\s*\\(\\s*${placeholder}`, "g")
	for (const match of code.matchAll(directExecutable)) {
		const specifier = stringFromPlaceholder(match[1], strings)
		if (specifier.startsWith(".")) edges.push({ kind: "executable", specifier })
	}
	const evaluated = new RegExp(`\\beval\\s*\\(\\s*${placeholder}`, "g")
	for (const match of code.matchAll(evaluated)) {
		const script = stringFromPlaceholder(match[1], strings)
		const generated = /\b(?:import|require)\s*\(\s*["']([^"']+)["']/.exec(script)
		if (generated?.[1].startsWith(".")) edges.push({ kind: "dynamic", specifier: generated[1] })
	}
	return edges
}

function flattenedAllowlist(): Set<string> {
	return new Set(Object.values(NATIVE_SCALE_SPACE_IMPORT_POLICY.localFileAllowlist).flat())
}

export function isForbiddenNativeScaleSpaceImplementationPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/")
	if (NATIVE_SCALE_SPACE_IMPORT_POLICY.forbiddenRegistry.exactFiles.includes(normalized as never)) return true
	const name = posix.basename(normalized).toLowerCase()
	if (NATIVE_SCALE_SPACE_IMPORT_POLICY.forbiddenRegistry.basenameTokens.some((token) => name.includes(token))) return true
	if (NATIVE_SCALE_SPACE_IMPORT_POLICY.forbiddenRegistry.roleAndCandidateSelectorTokens.some((token) => name.includes(token))) return true
	return normalized.startsWith("research/src/") && name.includes("palette") && !name.startsWith("native-scale-space-")
}

export function assertNativeScaleSpaceProvenancePath(path: string): string {
	validateNativeScaleSpaceArtifactRelativePath(path)
	if (isForbiddenNativeScaleSpaceImplementationPath(path)) throw new Error(`Forbidden implementation provenance path: ${path}`)
	return path
}

async function requireRegularImplementationFile(root: string, path: string): Promise<Uint8Array> {
	validateNativeScaleSpaceArtifactRelativePath(path)
	const absolute = join(root, ...path.split("/"))
	const metadata = await lstat(absolute).catch((error) => {
		throw new Error(`Unresolved local implementation import: ${path}`, { cause: error })
	})
	if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Implementation dependency is not a regular file: ${path}`)
	const physicalRoot = await realpath(root)
	if (await realpath(absolute) !== join(physicalRoot, ...path.split("/"))) throw new Error(`Implementation dependency escaped its root: ${path}`)
	return readFile(absolute)
}

async function resolveLocalImplementationSpecifier(root: string, importer: string, specifier: string): Promise<string> {
	const unresolved = posix.normalize(posix.join(posix.dirname(importer), specifier))
	if (unresolved.startsWith("../") || posix.isAbsolute(unresolved)) throw new Error(`Local implementation import escaped the project root: ${importer} -> ${specifier}`)
	const candidates = /\.(?:ts|json)$/.test(unresolved)
		? [unresolved]
		: [`${unresolved}.ts`, `${unresolved}.d.ts`, posix.join(unresolved, "index.ts")]
	for (const candidate of candidates) {
		try {
			await requireRegularImplementationFile(root, candidate)
			return candidate
		} catch (error) {
			if (candidate === candidates[candidates.length - 1]) throw error
		}
	}
	throw new Error(`Unresolved local implementation import: ${importer} -> ${specifier}`)
}

export async function verifyNativeScaleSpaceImplementationClosure(
	projectRoot: string,
	options: Readonly<{
		roots?: readonly string[]
		extras?: readonly string[]
		allowedPaths?: readonly string[]
	}> = {},
): Promise<NativeScaleSpaceImplementationClosure> {
	const root = resolve(projectRoot)
	await requirePhysicalRoot(root, "Implementation project root")
	const roots = options.roots ?? NATIVE_SCALE_SPACE_IMPLEMENTATION_ROOTS
	const extras = options.extras ?? NATIVE_SCALE_SPACE_IMPLEMENTATION_EXTRAS
	const allowed = new Set(options.allowedPaths ?? flattenedAllowlist())
	const queue = [...roots, ...extras.filter((path) => path.endsWith(".ts"))]
	const files = new Map<string, string>()
	const incoming = new Map<string, string[]>()
	while (queue.length > 0) {
		const path = queue.shift()!
		if (files.has(path)) continue
		if (!allowed.has(path) || isForbiddenNativeScaleSpaceImplementationPath(path)) {
			throw new Error(`Implementation path is not allowed: ${path}`)
		}
		const bytes = await requireRegularImplementationFile(root, path)
		files.set(path, sha256(bytes))
		if (!path.endsWith(".ts")) continue
		const source = Buffer.from(bytes).toString("utf8")
		for (const edge of scanNativeScaleSpaceImplementationImports(source)) {
			if (edge.kind === "dynamic" && edge.specifier.startsWith(".")) {
				throw new Error(`Dynamic local implementation import is forbidden: ${path} -> ${edge.specifier}`)
			}
			if (edge.kind === "executable") {
				const dependency = await resolveLocalImplementationSpecifier(root, path, edge.specifier)
				if (path !== "research/audit-native-scale-space-evidence.ts" ||
					dependency !== "research/resolution-canonical-raster-child.ts") {
					throw new Error(`Forbidden local executable edge: ${path} -> ${dependency}`)
				}
				if (!queue.includes(dependency)) queue.push(dependency)
				continue
			}
			if (edge.kind !== "static") continue
			if (edge.specifier.startsWith(".")) {
				const dependency = await resolveLocalImplementationSpecifier(root, path, edge.specifier)
				if (dependency === "research/resolution-canonical-raster-child.ts") {
					throw new Error("The canonical child executable must never be imported")
				}
				if (!allowed.has(dependency) || isForbiddenNativeScaleSpaceImplementationPath(dependency)) {
					throw new Error(`Resolved local implementation import is forbidden: ${path} -> ${dependency}`)
				}
				const parents = incoming.get(dependency) ?? []
				parents.push(path)
				incoming.set(dependency, parents)
				if (!files.has(dependency)) queue.push(dependency)
			} else if (edge.specifier === "sharp-modern" &&
				path !== "research/audit-native-scale-space-evidence.ts" && path !== "research/src/resolution-raster.ts") {
				throw new Error(`sharp-modern is forbidden outside the modern runner/raster lane: ${path}`)
			} else if (edge.specifier === "sharp" && path !== "research/resolution-canonical-raster-child.ts" &&
				path !== "research/src/image.ts") {
				throw new Error(`bare sharp is forbidden outside the canonical child closure: ${path}`)
			}
		}
	}
	for (const extra of extras) {
		if (!allowed.has(extra) && !["package.json", "pnpm-lock.yaml"].includes(extra)) throw new Error(`Implementation extra is not allowed: ${extra}`)
		const bytes = await requireRegularImplementationFile(root, extra)
		files.set(extra, sha256(bytes))
	}
	const imageParents = incoming.get("research/src/image.ts") ?? []
	if (imageParents.some((parent) => parent !== "research/resolution-canonical-raster-child.ts")) {
		throw new Error("research/src/image.ts has a forbidden incoming local edge")
	}
	const fileRows = [...files].sort(([first], [second]) => first.localeCompare(second))
		.map(([path, rawSha256]) => Object.freeze({ path, rawSha256 }))
	const descriptor = { version: NATIVE_SCALE_SPACE_IMPLEMENTATION_CLOSURE_VERSION, files: fileRows }
	return Object.freeze({ ...descriptor, identitySha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_IMPLEMENTATION_CLOSURE_VERSION, descriptor) })
}

export const discoverImplementationClosure = verifyNativeScaleSpaceImplementationClosure

export async function verifyNativeScaleSpacePackageReferences(projectRoot: string): Promise<typeof NATIVE_SCALE_SPACE_PACKAGE_REFERENCES> {
	for (const [path, expected] of Object.entries(NATIVE_SCALE_SPACE_PACKAGE_REFERENCES)) {
		const actual = sha256(await requireRegularImplementationFile(resolve(projectRoot), path))
		if (actual !== expected) throw new Error(`${path} raw SHA-256 changed`)
	}
	return NATIVE_SCALE_SPACE_PACKAGE_REFERENCES
}

export function createNativeScaleSpaceCommonHeader(protocolId: string): NativeScaleSpaceCommonHeader {
	assertSha256(protocolId, "Protocol ID")
	return Object.freeze({
		schemaVersion: 1,
		experimentId: NATIVE_SCALE_SPACE_EXPERIMENT_ID,
		protocolId,
		metricDefinitionsSha256: NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
		fixtureManifestSha256: NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
		expectationsSha256: NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
		importPolicySha256: NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
	})
}

const nativeScaleSpaceCommonHeaderKeys = [
	"schemaVersion", "experimentId", "protocolId", "metricDefinitionsSha256", "fixtureManifestSha256",
	"expectationsSha256", "importPolicySha256",
] as const

export async function writeCanonicalJson(path: string, value: unknown): Promise<Readonly<{
	rawSha256: string
	semanticSha256: string
	bytes: number
}>> {
	const serialized = canonicalSerialize(value)
	await writeCanonicalSerializedAtomic(path, serialized)
	return Object.freeze({
		rawSha256: sha256StringChunks(serialized),
		semanticSha256: sha256StringChunks(serialized, serialized.length - 1),
		bytes: Buffer.byteLength(serialized),
	})
}

export function assertNativeScaleSpaceResultShardSize(bytes: string | Uint8Array): number {
	const size = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength
	if (size > NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES) {
		throw new Error(`Result shard exceeds ${NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES} bytes: ${size}`)
	}
	return size
}

export const assertResultShardSize = assertNativeScaleSpaceResultShardSize

export function nativeScaleSpaceResultMerkleLeaf(record: NativeScaleSpaceResultShardRecord): string {
	const projection = {
		path: record.path,
		shardIndex: record.shardIndex,
		sourceStartIndex: record.sourceStartIndex,
		sourceEndIndexExclusive: record.sourceEndIndexExclusive,
		sourceCount: record.sourceCount,
		sourceEntryKeys: record.sourceEntryKeys,
		bytes: record.bytes,
		rawSha256: record.rawSha256,
		semanticSha256: record.semanticSha256,
	}
	return domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_RESULT_LEAF_VERSION, projection)
}

export function orderedNativeScaleSpaceResultMerkleRoot(records: readonly NativeScaleSpaceResultShardRecord[]): string {
	if (records.length === 0) throw new Error("Result Merkle tree requires at least one shard")
	const ordered = [...records].sort((first, second) => first.shardIndex - second.shardIndex)
	if (ordered.some((record, index) => record.shardIndex !== index)) throw new Error("Result Merkle shard indices must be contiguous from zero")
	let level = ordered.map(nativeScaleSpaceResultMerkleLeaf)
	while (level.length > 1) {
		const next: string[] = []
		for (let index = 0; index < level.length; index += 2) {
			const left = level[index]
			const right = level[index + 1] ?? left
			next.push(createHash("sha256")
				.update(NATIVE_SCALE_SPACE_RESULT_NODE_VERSION, "utf8")
				.update("\0")
				.update(Buffer.from(left, "hex"))
				.update(Buffer.from(right, "hex"))
				.digest("hex"))
		}
		level = next
	}
	return level[0]
}

export const orderedResultShardMerkleRoot = orderedNativeScaleSpaceResultMerkleRoot

export async function writeNativeScaleSpaceSourceResultShard(
	artifactDirectory: string,
	header: NativeScaleSpaceCommonHeader,
	shardIndex: number,
	entry: NativeScaleSpaceSourceResult,
): Promise<NativeScaleSpaceResultShardRecord> {
	if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT ||
		entry.sourceIndex !== shardIndex) throw new Error("Source shard index is invalid")
	const sourceEntryKeys = [Object.freeze({ cohort: entry.cohort, file: entry.file })]
	const path = `results/source-${String(shardIndex).padStart(4, "0")}.json`
	const shard = {
		...header,
		shardSchemaVersion: NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
		columnSchemaVersion: NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
		shardIndex,
		sourceStartIndex: shardIndex,
		sourceEndIndexExclusive: shardIndex + 1,
		sourceCount: 1,
		sourceEntryKeys,
		entry,
	}
	const target = resolveNativeScaleSpaceArtifactPath(artifactDirectory, path)
	const hashes = await writeCanonicalJsonStream(target, shard, NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES)
	return Object.freeze({
		path,
		shardIndex,
		sourceStartIndex: shardIndex,
		sourceEndIndexExclusive: shardIndex + 1,
		sourceCount: 1,
		sourceEntryKeys,
		bytes: hashes.bytes,
		rawSha256: hashes.rawSha256,
		semanticSha256: hashes.semanticSha256,
	})
}

export async function validateNativeScaleSpaceShardedResultsIndex(
	artifactDirectory: string,
	index: NativeScaleSpaceShardedResultsIndex,
): Promise<Readonly<{ totalBytes: number; maximumShardBytes: number }>> {
	if (index.schemaVersion !== 1 || index.experimentId !== NATIVE_SCALE_SPACE_EXPERIMENT_ID ||
		index.shardSchemaVersion !== NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION ||
		index.columnSchemaVersion !== NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION ||
		canonicalJson(index.columnSchema) !== canonicalJson(NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA) ||
		index.merkleVersion !== NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION || index.fullSourceCount !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT ||
		index.executionSourceCount !== index.shards.length || index.shards.length === 0) {
		throw new Error("Sharded results index header/count is invalid")
	}
	const entries = await readdir(join(artifactDirectory, "results"), { withFileTypes: true })
	const expectedNames = index.shards.map(({ path }) => path.slice("results/".length)).sort()
	if (entries.some((entry) => entry.isSymbolicLink() || !entry.isFile()) ||
		canonicalJson(entries.map(({ name }) => name).sort()) !== canonicalJson(expectedNames)) {
		throw new Error("Sharded results directory has missing, extra, or non-regular files")
	}
	let totalBytes = 0
	let maximumShardBytes = 0
	for (const [shardIndex, record] of index.shards.entries()) {
		if (record.shardIndex !== shardIndex || record.path !== `results/source-${String(shardIndex).padStart(4, "0")}.json` ||
			record.sourceStartIndex !== shardIndex || record.sourceEndIndexExclusive !== shardIndex + 1 || record.sourceCount !== 1 ||
			record.sourceEntryKeys.length !== 1) throw new Error(`Result shard ${shardIndex} coverage is invalid`)
		const bytes = await readFile(resolveNativeScaleSpaceArtifactPath(artifactDirectory, record.path))
		assertNativeScaleSpaceResultShardSize(bytes)
		if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.rawSha256) throw new Error(`Result shard ${shardIndex} raw identity changed`)
		let shard: unknown
		try {
			shard = JSON.parse(bytes.toString("utf8")) as unknown
		} catch (error) {
			throw new Error(`Result shard ${shardIndex} is invalid JSON`, { cause: error })
		}
		if (!isRecord(shard) || bytes.toString("utf8") !== canonicalSerialize(shard) || semanticSha256(shard) !== record.semanticSha256 ||
			shard.protocolId !== index.protocolId || shard.shardIndex !== shardIndex ||
			canonicalJson(shard.sourceEntryKeys) !== canonicalJson(record.sourceEntryKeys)) {
			throw new Error(`Result shard ${shardIndex} content identity changed`)
		}
		totalBytes += bytes.byteLength
		maximumShardBytes = Math.max(maximumShardBytes, bytes.byteLength)
	}
	if (orderedNativeScaleSpaceResultMerkleRoot(index.shards) !== index.orderedShardMerkleRootSha256) {
		throw new Error("Sharded results Merkle root is invalid")
	}
	return Object.freeze({ totalBytes, maximumShardBytes })
}

export const validateShardedResultsIndex = validateNativeScaleSpaceShardedResultsIndex

function metricColumns(records: readonly NativeScaleSpaceMetricRecord[]): MetricColumns {
	if (records.length === 0) return Object.freeze({})
	const ids = Object.keys(records[0]).sort()
	for (const record of records) {
		assertNativeScaleSpaceMetricRecord(record)
		const current = Object.keys(record).sort()
		if (current.length !== ids.length || current.some((id, index) => id !== ids[index])) {
			throw new Error("Metric rows do not have one exact column schema")
		}
	}
	return Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze(records.map((record) => record[id]))])))
}

function compactReconstruction(
	result: ReturnType<typeof finalizeNativeScaleSpaceReconstruction>,
	availability: NativeScaleSpaceAvailability,
): ReconstructionCompact {
	const winnerRuns: Array<readonly [number, number, number]> = []
	for (let index = 0; index < result.winnerCandidateIds.length;) {
		const candidateId = result.winnerCandidateIds[index]
		const ties = result.tieCounts[index]
		let end = index + 1
		while (end < result.winnerCandidateIds.length && result.winnerCandidateIds[end] === candidateId && result.tieCounts[end] === ties) end++
		winnerRuns.push(Object.freeze([candidateId, ties, end - index] as const))
		index = end
	}
	return Object.freeze({
		metrics: result.metrics,
		columns: result.columns,
		rows: result.rows,
		nativeReferenceCoordinatesSha256: result.nativeReferenceCoordinatesSha256,
		armMappingSha256: result.armMappingSha256,
		winnerCandidateIdsSha256: canonicalTypedArrayHash(result.winnerCandidateIds, [result.rows, result.columns]),
		winnerStableKeyDictionarySha256: semanticSha256(availability.candidates.map(({ stableKey }) => stableKey)),
		tieCountsSha256: canonicalTypedArrayHash(result.tieCounts, [result.rows, result.columns]),
		winnerRuns: Object.freeze(winnerRuns),
	})
}

function availabilitySnapshot(availability: NativeScaleSpaceAvailability): string {
	return semanticSha256({
		identitySha256: availability.identitySha256,
		candidateLabelsSha256: canonicalTypedArrayHash(availability.candidateLabels, [availability.height, availability.width]),
		candidates: availability.candidates,
		families: availability.families,
		candidateFamilyIdsSha256: canonicalTypedArrayHash(availability.candidateFamilyIds),
		familyMemberOffsetsSha256: canonicalTypedArrayHash(availability.familyMemberOffsets),
		familyMemberCandidateIdsSha256: canonicalTypedArrayHash(availability.familyMemberCandidateIds),
	})
}

function allSourcePredicatesTrue(predicates: NativeScaleSpaceSourcePredicates): boolean {
	return Object.values(predicates).every((value) => value === true)
}

function evaluateFamilyAndWitnessControls(
	native: DecodedNativeRaster,
	availability: NativeScaleSpaceAvailability,
	mask: Uint8Array,
) {
	let familyUnionExact = true
	let witnessMembershipExact = true
	if (mask.length !== availability.candidateLabels.length) throw new Error("Source scratch mask length is invalid")
	for (const family of availability.families) {
		try {
			fillNativeScaleSpaceFamilyMask(availability, family.id, mask)
		} catch {
			familyUnionExact = false
		}
	}
	for (const candidate of availability.candidates) {
		const offset = candidate.witnessIndex * 3
		if (availability.candidateLabels[candidate.witnessIndex] !== candidate.id ||
			native.data[offset] !== candidate.witnessRgb[0] || native.data[offset + 1] !== candidate.witnessRgb[1] ||
			native.data[offset + 2] !== candidate.witnessRgb[2]) witnessMembershipExact = false
	}
	return { familyUnionExact, witnessMembershipExact }
}

function reverseNativeScaleSpacePairMetrics(metrics: NativeScaleSpaceMetricRecord): NativeScaleSpaceMetricRecord {
	const reversed = Object.freeze({
		...metrics,
		"endpoint.fromPresence": metrics["endpoint.toPresence"],
		"endpoint.toPresence": metrics["endpoint.fromPresence"],
	})
	assertNativeScaleSpaceMetricRecord(reversed)
	return reversed
}

function evaluateArmA(
	native: DecodedNativeRaster,
	availability: NativeScaleSpaceAvailability,
	componentScratch: NativeScaleSpaceComponentScratch,
	mask: Uint8Array,
): NativeScaleSpaceArmResult {
	if (mask.length !== availability.candidateLabels.length) throw new Error("Arm A scratch mask length is invalid")
	const candidateMetrics: NativeScaleSpaceMetricRecord[] = []
	const candidateViewIdentitySha256: string[] = []
	const candidateValuesSha256: string[] = []
	const candidateReconstruction = createNativeScaleSpaceReconstructionAccumulator(native, availability, "A")
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		candidateMetrics.push(evaluateNativeScaleSpaceBinaryFieldMetrics(mask, availability.width, availability.height, componentScratch))
		accumulateNativeScaleSpaceReconstructionBinaryCandidate(
			candidateReconstruction, candidate.id, mask, availability.width, availability.height,
		)
		const identity = createArmAViewIdentityFromMask({
			width: availability.width, height: availability.height, mask, parentMaskSha256: candidate.nativeMaskSha256,
		})
		candidateViewIdentitySha256.push(identity.sha256)
		candidateValuesSha256.push(identity.valuesSha256)
	}
	const familyMetrics: NativeScaleSpaceMetricRecord[] = []
	const familyViewIdentitySha256: string[] = []
	const familyValuesSha256: string[] = []
	for (const family of availability.families) {
		fillNativeScaleSpaceFamilyMask(availability, family.id, mask)
		familyMetrics.push(evaluateNativeScaleSpaceBinaryFieldMetrics(mask, availability.width, availability.height, componentScratch))
		const identity = createArmAViewIdentityFromMask({
			width: availability.width, height: availability.height, mask, parentMaskSha256: family.nativeMaskSha256,
		})
		familyViewIdentitySha256.push(identity.sha256)
		familyValuesSha256.push(identity.valuesSha256)
	}
	const orderedEdges = nativeScaleSpaceOrderedCandidateEdges(availability)
	const candidateOrder = availability.candidates.map(({ id }) => id).sort((first, second) =>
		availability.candidates[first].stableKey.localeCompare(availability.candidates[second].stableKey))
	const edgeMetricMap = new Map<string, NativeScaleSpaceMetricRecord>()
	for (let fromIndex = 0; fromIndex < candidateOrder.length; fromIndex++) {
		const fromCandidateId = candidateOrder[fromIndex]
		for (let toIndex = fromIndex + 1; toIndex < candidateOrder.length; toIndex++) {
			const toCandidateId = candidateOrder[toIndex]
			const forward = evaluateNativeScaleSpaceBinaryPairMetrics({
				availability,
				fromCandidateId,
				toCandidateId,
			}, componentScratch, mask)
			edgeMetricMap.set(`${fromCandidateId}:${toCandidateId}`, forward)
			edgeMetricMap.set(`${toCandidateId}:${fromCandidateId}`, reverseNativeScaleSpacePairMetrics(forward))
		}
	}
	const edgeMetrics = orderedEdges.map(({ fromCandidateId, toCandidateId }) => {
		const metrics = edgeMetricMap.get(`${fromCandidateId}:${toCandidateId}`)
		if (!metrics) throw new Error("Arm A complete edge metric is missing")
		return metrics
	})
	return Object.freeze({
		arm: "A",
		dimensions: Object.freeze({ width: availability.width, height: availability.height }),
		candidates: Object.freeze({
			metrics: metricColumns(candidateMetrics),
			viewIdentitySha256: Object.freeze(candidateViewIdentitySha256),
			valuesSha256: Object.freeze(candidateValuesSha256),
			lowPassFilterIdentitySha256: Object.freeze(candidateMetrics.map(() => null)),
		}),
		families: Object.freeze({
			metrics: metricColumns(familyMetrics),
			viewIdentitySha256: Object.freeze(familyViewIdentitySha256),
			valuesSha256: Object.freeze(familyValuesSha256),
			lowPassFilterIdentitySha256: Object.freeze(familyMetrics.map(() => null)),
		}),
		graphMetrics: evaluateNativeScaleSpaceGraphMetrics(availability),
		edgeMetrics: metricColumns(edgeMetrics),
		reconstruction: compactReconstruction(finalizeNativeScaleSpaceReconstruction(candidateReconstruction), availability),
		sourceIndicesSha256: null,
	})
}

export function validateNativeScaleSpaceCoordinates(
	sourceWidth: number,
	sourceHeight: number,
	targetWidth: number,
	targetHeight: number,
	sourceIndices: Uint32Array,
): Readonly<{ sourceIndicesSha256: string; targetFootprintsSha256: string }> {
	nativeScaleSpaceRasterBounds(sourceWidth, sourceHeight)
	assertPositiveSafeInteger(targetWidth, "Target coordinate width")
	assertPositiveSafeInteger(targetHeight, "Target coordinate height")
	if (targetWidth > sourceWidth || targetHeight > sourceHeight || sourceIndices.length !== targetWidth * targetHeight) {
		throw new Error("Target coordinate dimensions or source-index length are invalid")
	}
	const footprints = new Uint32Array(sourceIndices.length * 4)
	let cell = 0
	for (let v = 0; v < targetHeight; v++) {
		const expectedY = Math.min(sourceHeight - 1,
			Number((2n * BigInt(v) + 1n) * BigInt(sourceHeight) / (2n * BigInt(targetHeight))))
		const startY = Math.floor(v * sourceHeight / targetHeight)
		const endY = Math.ceil((v + 1) * sourceHeight / targetHeight)
		for (let u = 0; u < targetWidth; u++) {
			const expectedX = Math.min(sourceWidth - 1,
				Number((2n * BigInt(u) + 1n) * BigInt(sourceWidth) / (2n * BigInt(targetWidth))))
			if (sourceIndices[cell] !== expectedY * sourceWidth + expectedX) {
				throw new Error("C source index does not equal its exact nearest-center coordinate")
			}
			const startX = Math.floor(u * sourceWidth / targetWidth)
			const endX = Math.ceil((u + 1) * sourceWidth / targetWidth)
			if (startX < 0 || startY < 0 || endX <= startX || endY <= startY || endX > sourceWidth || endY > sourceHeight) {
				throw new Error("Target-cell native footprint is out of range")
			}
			const offset = cell * 4
			footprints[offset] = startX
			footprints[offset + 1] = endX
			footprints[offset + 2] = startY
			footprints[offset + 3] = endY
			cell++
		}
	}
	return Object.freeze({
		sourceIndicesSha256: canonicalTypedArrayHash(sourceIndices, [targetHeight, targetWidth]),
		targetFootprintsSha256: canonicalTypedArrayHash(footprints, [targetHeight, targetWidth, 4]),
	})
}

function evaluateTargetArms(
	native: DecodedNativeRaster,
	availability: NativeScaleSpaceAvailability,
	target: NativeScaleSpaceTarget,
	componentScratch: NativeScaleSpaceComponentScratch,
	runnerScratch: NativeScaleSpaceRunnerScratch,
): Omit<NativeScaleSpaceTargetResult, "deltas" | "contradictions"> {
	const resolved = resolveNativeScaleSpaceTarget(availability.width, availability.height, target)
	const filterGeometry = createCenteredClippedBoxGeometry(
		availability.width, availability.height, resolved.width, resolved.height,
	)
	const bounds = nativeScaleSpaceRasterBounds(availability.width, availability.height)
	let mask = runnerScratch.mask.subarray(0, bounds.pixels)
	let satData = runnerScratch.sat.subarray(0, bounds.satLength)
	let residual = createQ24PartitionResidualAccumulator(
		bounds.pixels,
		availability.candidates.length,
		new Int32Array(runnerScratch.fieldBuffer, 0, bounds.pixels),
	)
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height, satData)
		accumulateQ24PartitionSummedAreaTable(residual, sat, filterGeometry)
	}
	const partitionResidual = finalizeQ24PartitionResidual(residual)
	const partitionMetrics = evaluateNativeScaleSpacePartitionStabilityMetrics(partitionResidual)
	// The residual plane is intentionally unreachable before any metric field plane is reused.
	residual = null as unknown as typeof residual
	let q24 = new Uint32Array(runnerScratch.fieldBuffer, 0, bounds.pixels)

	const targetPixels = resolved.width * resolved.height
	let cValues = runnerScratch.cValues.subarray(0, targetPixels)
	let cSourceIndices = runnerScratch.cSourceIndices.subarray(0, targetPixels)
	const bCandidateMetrics: NativeScaleSpaceMetricRecord[] = []
	const cCandidateMetrics: NativeScaleSpaceMetricRecord[] = []
	const bCandidateView: string[] = []
	const cCandidateView: string[] = []
	const bCandidateValues: string[] = []
	const cCandidateValues: string[] = []
	const candidateFilters: string[] = []
	const bReconstruction = createNativeScaleSpaceReconstructionAccumulator(native, availability, "B")
	const cReconstruction = createNativeScaleSpaceReconstructionAccumulator(native, availability, "C")
	let sourceIndicesSha256: string | null = null
	let bcSampleExact = true
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height, satData)
		filterSummedAreaTableQ24(sat, resolved.width, resolved.height, q24, filterGeometry)
		const filter = createLowPassFilterIdentity({
			sourceWidth: availability.width,
			sourceHeight: availability.height,
			targetWidth: resolved.width,
			targetHeight: resolved.height,
			parentNativeIdentity: availability.decodedNativeIdentity,
			binaryMaskSha256: candidate.nativeMaskSha256,
		})
		const bView = createNativeScaleSpaceFieldView({
			arm: "B", width: availability.width, height: availability.height, values: q24, nativeBinaryMask: mask,
		})
		bCandidateMetrics.push(evaluateNativeScaleSpaceFieldMetrics(bView, componentScratch))
		accumulateNativeScaleSpaceReconstructionCandidate(bReconstruction, candidate.id, bView)
		const bIdentity = createArmViewIdentity({
			arm: "B", width: bView.width, height: bView.height, values: bView.values,
			parentMaskSha256: candidate.nativeMaskSha256, lowPassFilterIdentitySha256: filter.sha256,
		})
		const samples = sampleQ24PlaneAtTargetCenters(
			q24, availability.width, availability.height, resolved.width, resolved.height, cValues, cSourceIndices,
		)
		try {
			verifyQ24CenterSamplesExact(q24, availability.width, availability.height, samples)
		} catch {
			bcSampleExact = false
		}
		const cView = createNativeScaleSpaceFieldView({
			arm: "C", width: resolved.width, height: resolved.height, values: samples.values, sourceIndices: samples.sourceIndices,
		})
		cCandidateMetrics.push(evaluateNativeScaleSpaceFieldMetrics(cView, componentScratch))
		accumulateNativeScaleSpaceReconstructionCandidate(cReconstruction, candidate.id, cView)
		const cIdentity = createArmViewIdentity({
			arm: "C", width: cView.width, height: cView.height, values: cView.values, sourceIndices: samples.sourceIndices,
			parentMaskSha256: candidate.nativeMaskSha256, lowPassFilterIdentitySha256: filter.sha256,
		})
		if (bIdentity.sha256 === cIdentity.sha256) {
			throw new Error("B/C arm view identities are not structurally distinct")
		}
		const mappingHash = canonicalTypedArrayHash(samples.sourceIndices, [resolved.height, resolved.width])
		if (sourceIndicesSha256 !== null && sourceIndicesSha256 !== mappingHash) throw new Error("C source-index mapping changed between candidates")
		sourceIndicesSha256 = mappingHash
		candidateFilters.push(filter.sha256)
		bCandidateView.push(bIdentity.sha256)
		cCandidateView.push(cIdentity.sha256)
		bCandidateValues.push(bIdentity.valuesSha256)
		cCandidateValues.push(cIdentity.valuesSha256)
	}

	const bFamilyMetrics: NativeScaleSpaceMetricRecord[] = []
	const cFamilyMetrics: NativeScaleSpaceMetricRecord[] = []
	const bFamilyView: string[] = []
	const cFamilyView: string[] = []
	const bFamilyValues: string[] = []
	const cFamilyValues: string[] = []
	const familyFilters: string[] = []
	for (const family of availability.families) {
		fillNativeScaleSpaceFamilyMask(availability, family.id, mask)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height, satData)
		filterSummedAreaTableQ24(sat, resolved.width, resolved.height, q24, filterGeometry)
		const filter = createLowPassFilterIdentity({
			sourceWidth: availability.width,
			sourceHeight: availability.height,
			targetWidth: resolved.width,
			targetHeight: resolved.height,
			parentNativeIdentity: availability.decodedNativeIdentity,
			binaryMaskSha256: family.nativeMaskSha256,
		})
		const bView = createNativeScaleSpaceFieldView({ arm: "B", width: availability.width, height: availability.height, values: q24, nativeBinaryMask: mask })
		bFamilyMetrics.push(evaluateNativeScaleSpaceFieldMetrics(bView, componentScratch))
		const bIdentity = createArmViewIdentity({
			arm: "B", width: bView.width, height: bView.height, values: bView.values,
			parentMaskSha256: family.nativeMaskSha256, lowPassFilterIdentitySha256: filter.sha256,
		})
		const samples = sampleQ24PlaneAtTargetCenters(q24, availability.width, availability.height, resolved.width, resolved.height, cValues, cSourceIndices)
		verifyQ24CenterSamplesExact(q24, availability.width, availability.height, samples)
		const cView = createNativeScaleSpaceFieldView({ arm: "C", width: resolved.width, height: resolved.height, values: samples.values, sourceIndices: samples.sourceIndices })
		cFamilyMetrics.push(evaluateNativeScaleSpaceFieldMetrics(cView, componentScratch))
		const cIdentity = createArmViewIdentity({
			arm: "C", width: cView.width, height: cView.height, values: cView.values, sourceIndices: samples.sourceIndices,
			parentMaskSha256: family.nativeMaskSha256, lowPassFilterIdentitySha256: filter.sha256,
		})
		familyFilters.push(filter.sha256)
		bFamilyView.push(bIdentity.sha256)
		cFamilyView.push(cIdentity.sha256)
		bFamilyValues.push(bIdentity.valuesSha256)
		cFamilyValues.push(cIdentity.valuesSha256)
	}

	const orderedEdges = nativeScaleSpaceOrderedCandidateEdges(availability)
	const candidateOrder = availability.candidates.map(({ id }) => id).sort((first, second) =>
		availability.candidates[first].stableKey.localeCompare(availability.candidates[second].stableKey))
	const bEdgeMetricMap = new Map<string, NativeScaleSpaceMetricRecord>()
	const cEdgeMetricMap = new Map<string, NativeScaleSpaceMetricRecord>()
	for (let fromIndex = 0; fromIndex < candidateOrder.length; fromIndex++) {
		const fromCandidateId = candidateOrder[fromIndex]
		fillNativeScaleSpaceCandidateMask(availability, fromCandidateId, mask)
		let sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height, satData)
		filterSummedAreaTableQ24(sat, resolved.width, resolved.height, q24, filterGeometry)
		const fromC = sampleQ24PlaneAtTargetCenters(
			q24, availability.width, availability.height, resolved.width, resolved.height, cValues, cSourceIndices,
		)
		for (let toIndex = fromIndex + 1; toIndex < candidateOrder.length; toIndex++) {
			const toCandidateId = candidateOrder[toIndex]
			fillNativeScaleSpaceCandidateMask(availability, toCandidateId, mask)
			sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height, satData)
			const toB = createCenteredClippedBoxQ24Evaluator(sat, filterGeometry)
			const forwardB = evaluateNativeScaleSpacePairMetrics({
				availability, fromCandidateId, toCandidateId, fromValues: q24, toValues: toB,
				width: availability.width, height: availability.height, pairActiveScratch: mask,
			}, componentScratch)
			const forwardC = evaluateNativeScaleSpacePairMetrics({
				availability,
				fromCandidateId,
				toCandidateId,
				fromValues: fromC.values,
				toValues: (index) => toB(fromC.sourceIndices[index]),
				width: resolved.width,
				height: resolved.height,
				pairActiveScratch: mask,
			}, componentScratch)
			bEdgeMetricMap.set(`${fromCandidateId}:${toCandidateId}`, forwardB)
			bEdgeMetricMap.set(`${toCandidateId}:${fromCandidateId}`, reverseNativeScaleSpacePairMetrics(forwardB))
			cEdgeMetricMap.set(`${fromCandidateId}:${toCandidateId}`, forwardC)
			cEdgeMetricMap.set(`${toCandidateId}:${fromCandidateId}`, reverseNativeScaleSpacePairMetrics(forwardC))
		}
	}
	const bEdgeMetrics = orderedEdges.map(({ fromCandidateId, toCandidateId }) => {
		const metrics = bEdgeMetricMap.get(`${fromCandidateId}:${toCandidateId}`)
		if (!metrics) throw new Error("Arm B complete edge metric is missing")
		return metrics
	})
	const cEdgeMetrics = orderedEdges.map(({ fromCandidateId, toCandidateId }) => {
		const metrics = cEdgeMetricMap.get(`${fromCandidateId}:${toCandidateId}`)
		if (!metrics) throw new Error("Arm C complete edge metric is missing")
		return metrics
	})
	const graphMetrics = evaluateNativeScaleSpaceGraphMetrics(availability)
	const b: NativeScaleSpaceArmResult = Object.freeze({
		arm: "B",
		dimensions: Object.freeze({ width: availability.width, height: availability.height }),
		candidates: Object.freeze({
			metrics: metricColumns(bCandidateMetrics), viewIdentitySha256: Object.freeze(bCandidateView),
			valuesSha256: Object.freeze(bCandidateValues), lowPassFilterIdentitySha256: Object.freeze(candidateFilters),
		}),
		families: Object.freeze({
			metrics: metricColumns(bFamilyMetrics), viewIdentitySha256: Object.freeze(bFamilyView),
			valuesSha256: Object.freeze(bFamilyValues), lowPassFilterIdentitySha256: Object.freeze(familyFilters),
		}),
		graphMetrics,
		edgeMetrics: metricColumns(bEdgeMetrics),
		reconstruction: compactReconstruction(finalizeNativeScaleSpaceReconstruction(bReconstruction), availability),
		sourceIndicesSha256: null,
	})
	const c: NativeScaleSpaceArmResult = Object.freeze({
		arm: "C",
		dimensions: Object.freeze({ width: resolved.width, height: resolved.height }),
		candidates: Object.freeze({
			metrics: metricColumns(cCandidateMetrics), viewIdentitySha256: Object.freeze(cCandidateView),
			valuesSha256: Object.freeze(cCandidateValues), lowPassFilterIdentitySha256: Object.freeze(candidateFilters),
		}),
		families: Object.freeze({
			metrics: metricColumns(cFamilyMetrics), viewIdentitySha256: Object.freeze(cFamilyView),
			valuesSha256: Object.freeze(cFamilyValues), lowPassFilterIdentitySha256: Object.freeze(familyFilters),
		}),
		graphMetrics,
		edgeMetrics: metricColumns(cEdgeMetrics),
		reconstruction: compactReconstruction(finalizeNativeScaleSpaceReconstruction(cReconstruction), availability),
		sourceIndicesSha256,
	})
	const bcMetrics = evaluateNativeScaleSpaceBcSampleStabilityMetrics(q24, availability.width, availability.height,
		sampleQ24PlaneAtTargetCenters(q24, availability.width, availability.height, resolved.width, resolved.height, cValues, cSourceIndices))
	if (!bcSampleExact || bcMetrics["stability.bcSampleExact"] !== true) throw new Error("B/C exact sampling failed")
	const coordinateHashes = validateNativeScaleSpaceCoordinates(
		availability.width, availability.height, resolved.width, resolved.height, cSourceIndices,
	)
	mask = null as unknown as Uint8Array
	satData = null as unknown as Uint32Array
	q24 = null as unknown as Uint32Array
	cValues = null as unknown as Uint32Array
	cSourceIndices = null as unknown as Uint32Array
	return Object.freeze({
		target: Object.freeze({ ...target }), resolved, coordinateHashes, partitionResidual, partitionMetrics, bcMetrics, b, c,
	})
}

function numericDelta(first: NativeScaleSpaceMetricValue, second: NativeScaleSpaceMetricValue): number | readonly number[] | null {
	if (typeof first === "number" && typeof second === "number") return second - first
	if (Array.isArray(first) && Array.isArray(second) && first.length === second.length &&
		first.every((value) => typeof value === "number") && second.every((value) => typeof value === "number")) {
		return Object.freeze(first.map((value, index) => (second[index] as number) - (value as number)))
	}
	return null
}

function deltaColumns(first: MetricColumns, second: MetricColumns): { columns: MetricColumns; ties: number; contradictions: NativeScaleSpaceContradiction[] } {
	const columns: Record<string, readonly NativeScaleSpaceMetricValue[]> = {}
	let ties = 0
	const byEntity = new Map<number, Array<{ id: string; direction: number; first: number; second: number }>>()
	for (const id of Object.keys(first).sort()) {
		if (!(id in second) || first[id].length !== second[id].length) continue
		const values: NativeScaleSpaceMetricValue[] = []
		let available = true
		for (let index = 0; index < first[id].length; index++) {
			const delta = numericDelta(first[id][index], second[id][index])
			if (delta === null) {
				available = false
				break
			}
			values.push(delta)
			if (canonicalJson(first[id][index]) === canonicalJson(second[id][index])) ties++
			if (typeof delta === "number" && delta !== 0 && typeof first[id][index] === "number" && typeof second[id][index] === "number") {
				const rows = byEntity.get(index) ?? []
				rows.push({ id, direction: Math.sign(delta), first: first[id][index] as number, second: second[id][index] as number })
				byEntity.set(index, rows)
			}
		}
		if (available) columns[id] = Object.freeze(values)
	}
	const contradictions: NativeScaleSpaceContradiction[] = []
	for (const [entityIndex, rows] of byEntity) {
		const positive = rows.find(({ direction }) => direction > 0)
		const negative = rows.find(({ direction }) => direction < 0)
		if (positive && negative) contradictions.push([
			"candidate", entityIndex, positive.id, negative.id,
			positive.first, positive.second, negative.first, negative.second,
		])
	}
	return { columns: Object.freeze(columns), ties, contradictions }
}

function relabelContradictions(
	rows: readonly NativeScaleSpaceContradiction[],
	entity: NativeScaleSpaceContradiction[0],
): NativeScaleSpaceContradiction[] {
	return rows.map((row) => [entity, row[1], row[2], row[3], row[4], row[5], row[6], row[7]])
}

export function createNativeScaleSpaceMetricDeltas(
	first: NativeScaleSpaceArmResult,
	second: NativeScaleSpaceArmResult,
): Readonly<{ deltas: NativeScaleSpaceMetricDeltaSet; contradictions: readonly NativeScaleSpaceContradiction[] }> {
	const candidate = deltaColumns(first.candidates.metrics, second.candidates.metrics)
	const family = deltaColumns(first.families.metrics, second.families.metrics)
	const edge = deltaColumns(first.edgeMetrics, second.edgeMetrics)
	const reconstruction = deltaColumns(metricColumns([first.reconstruction.metrics]), metricColumns([second.reconstruction.metrics]))
	return Object.freeze({
		deltas: Object.freeze({
			candidate: candidate.columns,
			family: family.columns,
			edge: edge.columns,
			reconstruction: reconstruction.columns,
			ties: Object.freeze({ candidate: candidate.ties, family: family.ties, edge: edge.ties, reconstruction: reconstruction.ties }),
		}),
		contradictions: Object.freeze([
			...candidate.contradictions,
			...relabelContradictions(family.contradictions, "family"),
			...relabelContradictions(edge.contradictions, "edge"),
			...relabelContradictions(reconstruction.contradictions, "reconstruction"),
		]),
	})
}

export async function evaluateNativeScaleSpaceSource(input: Readonly<{
	entry: NativeScaleSpaceBoundRosterEntry
	sourceIndex: number
	projectRoot: string
	canonicalChild: CanonicalRasterChild
	promotionCertificate: NativeScaleSpacePromotionCertificateBinding
	rss: NativeScaleSpaceRssTracker
	metadataPreflight: NativeScaleSpaceMetadataPreflight
	runnerScratch: NativeScaleSpaceRunnerScratch
}>): Promise<Readonly<{
	result: NativeScaleSpaceSourceResult
	canonicalRuntime: Readonly<Record<string, string>>
}>> {
	const { entry, sourceIndex, projectRoot, canonicalChild, promotionCertificate, rss, metadataPreflight, runnerScratch } = input
	const sourceBytes = await readNativeScaleSpaceBoundSource(projectRoot, entry.sourceRelativePath)
	if (sourceBytes.byteLength !== entry.sourceBytes || sha256(sourceBytes) !== entry.sourceSha256) throw new Error(`Bound source changed: ${entry.file}`)
	const canonical = await canonicalChild.decode(entry.sourceRelativePath)
	const canonicalRuntimeSha256 = semanticSha256(canonical.versions)
	const promotion = promotionCertificate.entries[entry.file]
	if (!promotion || canonical.sourceSha256 !== entry.sourceSha256 || canonical.width !== entry.canonicalWidth ||
		canonical.height !== entry.canonicalHeight || canonicalRuntimeSha256 !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256) {
		throw new Error(`Canonical control identity changed: ${entry.file}`)
	}
	const computedNormalizedImageSha256 = normalizedImageSha256(canonical)
	if (computedNormalizedImageSha256 !== promotion.normalizedImageSha256) throw new Error(`Canonical normalized raster mismatch: ${entry.file}`)

	if (rss.checkpoints.length !== 3 || rss.checkpoints[1].label !== "before-metadata" ||
		rss.checkpoints[2].label !== "after-metadata") {
		throw new Error("Source metadata preflight checkpoints were not prepared exactly once")
	}
	const native = await decodeNativeRaster(sourceBytes)
	const bounds = nativeScaleSpaceRasterBounds(native.width, native.height)
	const nativeIdentityValid = validateDecodedNativeRaster(native).sha256 === native.identity.sha256 &&
		native.channels === 3 && native.depth === "uchar" && native.colorSpace === "srgb" && native.data.length === bounds.rgbBytes
	sampleNativeScaleSpaceRss(rss, "after-decode")
	const availability = createNativeScaleSpaceAvailability(native, {
		sourceSha256: entry.sourceSha256,
		decodedNativeIdentity: native.identity.sha256,
		rasterPolicyIdentity: semanticSha256(NATIVE_DECODE_POLICY),
	})
	const frozenSnapshot = availabilitySnapshot(availability)
	await collectReleasedNativeScaleSpaceSourceMemory()
	sampleNativeScaleSpaceRss(rss, "after-availability")
	if (bounds.pixels > runnerScratch.maximumPixels) throw new Error("Decoded source exceeds prepared reusable scratch capacity")
	const sourceMask = runnerScratch.mask.subarray(0, bounds.pixels)
	const availabilityControls = evaluateFamilyAndWitnessControls(native, availability, sourceMask)
	const componentScratch = runnerScratch.component
	const a = evaluateArmA(native, availability, componentScratch, sourceMask)
	await collectReleasedNativeScaleSpaceSourceMemory()
	sampleNativeScaleSpaceRss(rss, "after-arm-A")
	const targets: NativeScaleSpaceTargetResult[] = []
	const targetArmsByDimensions = new Map<string, Omit<NativeScaleSpaceTargetResult, "deltas" | "contradictions">>()
	for (const target of NATIVE_SCALE_SPACE_CORPUS_TARGETS) {
		const resolved = resolveNativeScaleSpaceTarget(availability.width, availability.height, target)
		const dimensionKey = `${resolved.width}:${resolved.height}`
		const prior = targetArmsByDimensions.get(dimensionKey)
		const evaluated = prior === undefined
			? evaluateTargetArms(native, availability, target, componentScratch, runnerScratch)
			: Object.freeze({ ...prior, target: Object.freeze({ ...target }), resolved })
		if (prior === undefined) targetArmsByDimensions.set(dimensionKey, evaluated)
		const ab = createNativeScaleSpaceMetricDeltas(a, evaluated.b)
		const bc = createNativeScaleSpaceMetricDeltas(evaluated.b, evaluated.c)
		targets.push(Object.freeze({
			...evaluated,
			deltas: Object.freeze({ ab: ab.deltas, bc: bc.deltas }),
			contradictions: Object.freeze([...ab.contradictions, ...bc.contradictions]),
		}))
		await collectReleasedNativeScaleSpaceSourceMemory()
		sampleNativeScaleSpaceRss(rss, `after-target-${target.kind}-${target.value}`)
	}
	const edges = nativeScaleSpaceOrderedCandidateEdges(availability)
	const targetDimensionEqualities: Array<{ firstTargetIndex: number; secondTargetIndex: number; equal: boolean }> = []
	for (let firstTargetIndex = 0; firstTargetIndex < targets.length; firstTargetIndex++) {
		for (let secondTargetIndex = firstTargetIndex + 1; secondTargetIndex < targets.length; secondTargetIndex++) {
			if (targets[firstTargetIndex].target.kind === targets[secondTargetIndex].target.kind) continue
			targetDimensionEqualities.push(Object.freeze({
				firstTargetIndex,
				secondTargetIndex,
				equal: targets[firstTargetIndex].resolved.width === targets[secondTargetIndex].resolved.width &&
					targets[firstTargetIndex].resolved.height === targets[secondTargetIndex].resolved.height,
			}))
		}
	}
	const predicates: NativeScaleSpaceSourcePredicates = Object.freeze({
		canonicalControlExact: true,
		nativeIdentityValid,
		availabilityFrozen: availabilitySnapshot(availability) === frozenSnapshot,
		candidatePartitionExact: !availability.candidateLabels.includes(0xff) &&
			availability.candidates.reduce((sum, candidate) => sum + candidate.nativePixelCount, 0) === bounds.pixels,
		familyUnionExact: availabilityControls.familyUnionExact,
		witnessMembershipExact: availabilityControls.witnessMembershipExact,
		q24BoundsValid: targets.every(({ partitionResidual }) => partitionResidual.boundSatisfied),
		bcSampleExact: targets.every(({ bcMetrics }) => bcMetrics["stability.bcSampleExact"] === true),
		coordinatesExact: targets.every(({ c, resolved }) => c.sourceIndicesSha256 !== null &&
			resolved.width > 0 && resolved.height > 0 && resolved.width <= native.width && resolved.height <= native.height),
		graphComplete: availability.candidates.length <= NATIVE_SCALE_SPACE_MAX_CANDIDATES &&
			availability.families.length <= NATIVE_SCALE_SPACE_MAX_FAMILIES && edges.length === availability.orderedCandidateEdgeCount &&
			edges.length <= NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES,
		metricsFinite: true,
		artifactRowComplete: targets.length === NATIVE_SCALE_SPACE_CORPUS_TARGETS.length &&
			targets.every((row, index) => canonicalJson(row.target) === canonicalJson(NATIVE_SCALE_SPACE_CORPUS_TARGETS[index]) && row.b.arm === "B" && row.c.arm === "C"),
	})
	if (!allSourcePredicatesTrue(predicates)) throw new Error(`Source structural predicate failed: ${entry.file}`)
	const result: NativeScaleSpaceSourceResult = {
		schemaVersion: 1,
		sourceIndex,
		cohort: entry.cohort,
		file: entry.file,
		source: Object.freeze({ relativePath: entry.sourceRelativePath, bytes: entry.sourceBytes, sha256: entry.sourceSha256 }),
		canonicalControl: Object.freeze({
			width: canonical.width,
			height: canonical.height,
			normalizedImageSha256: promotion.normalizedImageSha256,
			computedNormalizedImageSha256,
			promotionCertificatePath: promotionCertificate.path,
			promotionCertificateRawSha256: promotionCertificate.rawSha256,
			canonicalRuntimeSha256,
		}),
		metadataPreflight,
		native: Object.freeze({
			width: native.width,
			height: native.height,
			pixels: bounds.pixels,
			rgbBytes: bounds.rgbBytes,
			rawSha256: sha256(native.data),
			identitySha256: native.identity.sha256,
			decodePolicy: NATIVE_DECODE_POLICY,
			bounds,
		}),
		availability: Object.freeze({
			version: availability.version,
			identitySha256: availability.identitySha256,
			candidateLabelsSha256: availability.candidateLabelsSha256,
			candidateStableKeys: Object.freeze(availability.candidates.map(({ stableKey }) => stableKey)),
			candidateMaskSha256: Object.freeze(availability.candidates.map(({ nativeMaskSha256 }) => nativeMaskSha256)),
			candidateWitnessRgb: Object.freeze(availability.candidates.map(({ witnessRgb }) => Object.freeze([...witnessRgb]))),
			candidateWitnessOklab: Object.freeze(availability.candidates.map(({ witnessOklab }) => Object.freeze([...witnessOklab]))),
			candidateMeanOklab: Object.freeze(availability.candidates.map(({ meanOklab }) => Object.freeze([...meanOklab]))),
			candidateWitnessIndex: Object.freeze(availability.candidates.map(({ witnessIndex }) => witnessIndex)),
			candidateAnalysisRgb: Object.freeze(availability.candidates.map(({ analysisRepresentativeRgb }) => Object.freeze([...analysisRepresentativeRgb]))),
			candidateAnalysisOklab: Object.freeze(availability.candidates.map(({ analysisRepresentativeLab }) => Object.freeze([...analysisRepresentativeLab]))),
			candidateAnalysisIndex: Object.freeze(availability.candidates.map(({ analysisRepresentativeIndex }) => analysisRepresentativeIndex)),
			candidateAnalysisDistance: Object.freeze(availability.candidates.map(({ analysisRepresentativeDistance }) => analysisRepresentativeDistance)),
			candidateAnalysisNativeExact: Object.freeze(availability.candidates.map(({ analysisRepresentativeNativeExact }) => analysisRepresentativeNativeExact)),
			nativeVersusAnalysisWitnessExact: Object.freeze(availability.candidates.map(({ witnessRgb, analysisRepresentativeRgb }) =>
				witnessRgb.every((channel, index) => channel === analysisRepresentativeRgb[index]))),
			familyStableKeys: Object.freeze(availability.families.map(({ stableKey }) => stableKey)),
			familyMaskSha256: Object.freeze(availability.families.map(({ nativeMaskSha256 }) => nativeMaskSha256)),
			familyAnchorCandidateIds: Object.freeze(availability.families.map(({ anchorCandidateId }) => anchorCandidateId)),
			familyMemberOffsets: Object.freeze(Array.from(availability.familyMemberOffsets)),
			familyMemberCandidateIds: Object.freeze(Array.from(availability.familyMemberCandidateIds)),
			orderedEdges: edges,
		}),
		a,
		targets,
		targetDimensionEqualities: Object.freeze(targetDimensionEqualities),
		predicates,
		resource: Object.freeze({ satBytes: bounds.satBytes, maximumRssBytes: rss.maximumBytes, checkpoints: Object.freeze([...rss.checkpoints]) }),
	}
	return Object.freeze({ result, canonicalRuntime: canonical.versions })
}

export function createNativeScaleSpaceControlsArtifact(protocolId: string) {
	const header = createNativeScaleSpaceCommonHeader(protocolId)
	const structuralRows = evaluateNativeScaleSpaceFixtureStructuralRows()
	const scientificPredicates = evaluateNativeScaleSpaceScientificPredicates()
	const structuralValid = structuralRows.length === 1_220 && structuralRows.every(({ passed }) => passed)
	const disposition = nativeScaleSpaceFixtureDisposition(structuralValid, scientificPredicates)
	return Object.freeze({
		...header,
		structuralRows,
		structuralRowCount: structuralRows.length,
		structuralValid,
		scientificPredicates,
		disposition,
	})
}

type DistributionAccumulator = { count: number; minimum: number; maximum: number; sum: number }

export type NativeScaleSpaceAnalysisAccumulator = {
	distributions: Map<string, DistributionAccumulator>
	tieCount: number
	contradictionCount: number
}

export function createNativeScaleSpaceAnalysisAccumulator(): NativeScaleSpaceAnalysisAccumulator {
	return { distributions: new Map(), tieCount: 0, contradictionCount: 0 }
}

function addMetricColumnsToAnalysis(accumulator: NativeScaleSpaceAnalysisAccumulator, prefix: string, columns: MetricColumns): void {
	for (const [metricId, values] of Object.entries(columns)) for (const value of values) {
		const numbers = typeof value === "number" ? [value] : Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : []
		for (const number of numbers) {
			const key = `${prefix}.${metricId}`
			const row = accumulator.distributions.get(key) ?? { count: 0, minimum: Infinity, maximum: -Infinity, sum: 0 }
			row.count++
			row.minimum = Math.min(row.minimum, number)
			row.maximum = Math.max(row.maximum, number)
			row.sum += number
			accumulator.distributions.set(key, row)
		}
	}
}

export function accumulateNativeScaleSpaceAnalysis(
	accumulator: NativeScaleSpaceAnalysisAccumulator,
	result: NativeScaleSpaceSourceResult,
): void {
	const addArm = (arm: NativeScaleSpaceArmResult, label: string) => {
		addMetricColumnsToAnalysis(accumulator, `${label}.candidate`, arm.candidates.metrics)
		addMetricColumnsToAnalysis(accumulator, `${label}.family`, arm.families.metrics)
		addMetricColumnsToAnalysis(accumulator, `${label}.edge`, arm.edgeMetrics)
		addMetricColumnsToAnalysis(accumulator, `${label}.reconstruction`, metricColumns([arm.reconstruction.metrics]))
		for (const run of arm.reconstruction.winnerRuns) accumulator.tieCount += run[1] > 1 ? run[2] : 0
	}
	addArm(result.a, "A")
	for (const target of result.targets) {
		const label = `${target.target.kind}-${target.target.value}`
		addArm(target.b, `${label}.B`)
		addArm(target.c, `${label}.C`)
		accumulator.contradictionCount += target.contradictions.length
		accumulator.tieCount += Object.values(target.deltas.ab.ties).reduce((sum, count) => sum + count, 0)
		accumulator.tieCount += Object.values(target.deltas.bc.ties).reduce((sum, count) => sum + count, 0)
	}
}

export function finalizeNativeScaleSpaceAnalysisArtifact(
	protocolId: string,
	executionSourceCount: number,
	disposition: NativeScaleSpaceFixtureDisposition,
	accumulator: NativeScaleSpaceAnalysisAccumulator,
) {
	const distributions = Object.fromEntries([...accumulator.distributions].sort(([first], [second]) => first.localeCompare(second)).map(
		([id, row]) => [id, Object.freeze({
			count: row.count,
			minimum: row.minimum,
			maximum: row.maximum,
			mean: row.sum / row.count,
		})],
	))
	return Object.freeze({
		...createNativeScaleSpaceCommonHeader(protocolId),
		executionSourceCount,
		fullSourceCount: NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT,
		distributions: Object.freeze(distributions),
		counts: Object.freeze({ ties: accumulator.tieCount, contradictions: accumulator.contradictionCount }),
		disposition,
		diagnosticOnly: true,
	})
}

export function createNativeScaleSpaceSourceCertificate(
	header: NativeScaleSpaceCommonHeader,
	result: NativeScaleSpaceSourceResult,
	record: NativeScaleSpaceResultShardRecord,
	canonicalRuntimeSha256: string,
	rss: NativeScaleSpaceRssTracker,
): NativeScaleSpaceSourceCertificate {
	const base = {
		...header,
		certificateVersion: NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION,
		sourceIndex: result.sourceIndex,
		cohort: result.cohort,
		file: result.file,
		sourceSha256: result.source.sha256,
		normalizedImageSha256: result.canonicalControl.normalizedImageSha256,
		metadataSemanticSha256: result.metadataPreflight.semanticSha256,
		canonicalRuntimeSha256,
		modernRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256,
		nativeIdentitySha256: result.native.identitySha256,
		availabilityIdentitySha256: result.availability.identitySha256,
		resultShardPath: record.path,
		resultShardSemanticSha256: record.semanticSha256,
		predicates: result.predicates,
		resource: Object.freeze({ maximumRssBytes: rss.maximumBytes, checkpoints: Object.freeze([...rss.checkpoints]) }),
	}
	return Object.freeze({
		...base,
		identitySha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION, base),
	})
}

export type NativeScaleSpaceArtifactFinalizeInput = Readonly<{
	artifactDirectory: string
	protocol: ReturnType<typeof buildNativeScaleSpaceEvidenceProtocol>
	execution: Readonly<{
		mode: "publish" | "limited-no-publish" | "full-no-publish"
		limit: number | null
		noPublish: boolean
		publishable: boolean
		processedSources: number
	}>
	sourceRoster: ReturnType<typeof nativeScaleSpaceSourceRosterIdentity>
	shards: readonly NativeScaleSpaceResultShardRecord[]
	certificates: readonly NativeScaleSpaceSourceCertificate[]
	controls: ReturnType<typeof createNativeScaleSpaceControlsArtifact>
	analysis: ReturnType<typeof finalizeNativeScaleSpaceAnalysisArtifact>
	implementation: NativeScaleSpaceImplementationClosure
	canonicalRuntime: Readonly<Record<string, string>>
}>

export async function finalizeNativeScaleSpaceArtifactDirectory(input: NativeScaleSpaceArtifactFinalizeInput) {
	const { artifactDirectory, protocol, execution, sourceRoster, shards, certificates, controls, analysis, implementation, canonicalRuntime } = input
	if (sourceRoster.count !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT || sourceRoster.sha256 !== NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256) {
		throw new Error("Artifact assembly requires the exact full canonical source roster")
	}
	if (execution.processedSources !== shards.length || certificates.length !== shards.length || shards.length <= 0) {
		throw new Error("Artifact assembly source coverage is incomplete")
	}
	if (execution.publishable && (execution.noPublish || execution.limit !== null || shards.length !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT)) {
		throw new Error("Only a complete unlimited run is publishable")
	}
	const header = createNativeScaleSpaceCommonHeader(protocol.protocolId)
	const merkleRoot = orderedNativeScaleSpaceResultMerkleRoot(shards)
	const results = Object.freeze({
		...header,
		shardSchemaVersion: NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
		columnSchemaVersion: NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION,
		columnSchema: NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA,
		merkleVersion: NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION,
		executionSourceCount: shards.length,
		fullSourceCount: NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT,
		shards,
		orderedShardMerkleRootSha256: merkleRoot,
	})
	const certificatesArtifact = Object.freeze({ ...header, entries: certificates })
	await writeCanonicalJson(join(artifactDirectory, "protocol.json"), protocol)
	await writeCanonicalJson(join(artifactDirectory, "results.json"), results)
	await writeCanonicalJson(join(artifactDirectory, "certificates.json"), certificatesArtifact)
	await writeCanonicalJson(join(artifactDirectory, "controls.json"), controls)
	await writeCanonicalJson(join(artifactDirectory, "analysis.json"), analysis)
	await validateNativeScaleSpaceShardedResultsIndex(artifactDirectory, results)

	const expectedPaths = [
		"protocol.json", "results.json", "certificates.json", "controls.json", "analysis.json",
		...shards.map(({ path }) => path),
	]
	const artifactHashes: Record<string, string> = {}
	const artifactSemanticHashes: Record<string, string> = {}
	for (const path of expectedPaths) {
		const bytes = await readFile(resolveNativeScaleSpaceArtifactPath(artifactDirectory, path))
		artifactHashes[path] = sha256(bytes)
		artifactSemanticHashes[path] = semanticSha256(JSON.parse(bytes.toString("utf8")) as unknown)
	}
	const canonicalRuntimeSha256 = semanticSha256(canonicalRuntime)
	if (canonicalRuntimeSha256 !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256) throw new Error("Canonical runtime identity is not exact")
	if (semanticSha256(MODERN_RASTER_RUNTIME) !== NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256) throw new Error("Modern runtime identity is not exact")
	const manifestWithoutScientificIdentity = {
		...header,
		execution,
		canonicalArtifacts: NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES,
		promotionCertificates: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES,
		sourceRoster,
		implementation,
		packages: NATIVE_SCALE_SPACE_PACKAGE_REFERENCES,
		runtimes: Object.freeze({
			canonical: canonicalRuntime,
			canonicalSha256: canonicalRuntimeSha256,
			modern: MODERN_RASTER_RUNTIME,
			modernSha256: NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256,
		}),
		artifactHashes: Object.freeze(artifactHashes),
		artifactSemanticHashes: Object.freeze(artifactSemanticHashes),
		resultMerkleRootSha256: merkleRoot,
		hardStopsPassed: true,
		disposition: controls.disposition,
	}
	const manifest = Object.freeze({
		...manifestWithoutScientificIdentity,
		scientificIdentitySha256: domainSeparatedCanonicalSha256(
			NATIVE_SCALE_SPACE_SCIENTIFIC_IDENTITY_VERSION,
			manifestWithoutScientificIdentity,
		),
	})
	await writeCanonicalJson(join(artifactDirectory, "manifest.json"), manifest)
	return Object.freeze({ protocol, results, certificates: certificatesArtifact, controls, analysis, manifest })
}

export async function assembleNativeScaleSpaceArtifactDirectory(input: Readonly<{
	artifactDirectory: string
	protocol: ReturnType<typeof buildNativeScaleSpaceEvidenceProtocol>
	execution: NativeScaleSpaceArtifactFinalizeInput["execution"]
	sourceRoster: NativeScaleSpaceArtifactFinalizeInput["sourceRoster"]
	sources: readonly Readonly<{ result: NativeScaleSpaceSourceResult; certificate: Omit<NativeScaleSpaceSourceCertificate, "resultShardPath" | "resultShardSemanticSha256" | "identitySha256"> }>[]
	controls: NativeScaleSpaceArtifactFinalizeInput["controls"]
	analysis: NativeScaleSpaceArtifactFinalizeInput["analysis"]
	implementation: NativeScaleSpaceImplementationClosure
	canonicalRuntime: Readonly<Record<string, string>>
}>) {
	await mkdir(join(input.artifactDirectory, "results"), { recursive: false })
	const header = createNativeScaleSpaceCommonHeader(input.protocol.protocolId)
	const shards: NativeScaleSpaceResultShardRecord[] = []
	const certificates: NativeScaleSpaceSourceCertificate[] = []
	for (const [index, source] of input.sources.entries()) {
		const record = await writeNativeScaleSpaceSourceResultShard(input.artifactDirectory, header, index, source.result)
		shards.push(record)
		const base = { ...source.certificate, resultShardPath: record.path, resultShardSemanticSha256: record.semanticSha256 }
		certificates.push(Object.freeze({
			...base,
			identitySha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION, base),
		}))
	}
	return finalizeNativeScaleSpaceArtifactDirectory({ ...input, shards, certificates })
}

function manifestProjection(value: Record<string, unknown>): Record<string, unknown> {
	const projection = { ...value }
	delete projection.scientificIdentitySha256
	return projection
}

async function readCanonicalArtifactFile(path: string, label: string): Promise<{ bytes: Uint8Array; value: unknown }> {
	const metadata = await lstat(path)
	if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} must be a regular non-symlink file`)
	const bytes = await readFile(path)
	let value: unknown
	try {
		value = JSON.parse(bytes.toString("utf8")) as unknown
	} catch (error) {
		throw new Error(`${label} is invalid JSON`, { cause: error })
	}
	return { bytes, value }
}

function assertCommonHeader(value: Record<string, unknown>, protocolId: string, label: string): void {
	if (value.schemaVersion !== 1 || value.experimentId !== NATIVE_SCALE_SPACE_EXPERIMENT_ID || value.protocolId !== protocolId ||
		value.metricDefinitionsSha256 !== NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256 ||
		value.fixtureManifestSha256 !== NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256 ||
		value.expectationsSha256 !== NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256 ||
		value.importPolicySha256 !== NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256) throw new Error(`${label} common header is invalid`)
}

function rejectAnalysisDecisionKeys(value: unknown, path = "analysis"): void {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => rejectAnalysisDecisionKeys(entry, `${path}[${index}]`))
		return
	}
	if (!isRecord(value)) return
	for (const [key, child] of Object.entries(value)) {
		if (/winner|score|rank|review/i.test(key)) throw new Error(`Analysis contains a forbidden decision field: ${path}.${key}`)
		rejectAnalysisDecisionKeys(child, `${path}.${key}`)
	}
}

export type NativeScaleSpaceArtifactVerificationOptions = Readonly<{
	projectRoot?: string
	allowLimited?: boolean
	verifyCanonicalRasters?: boolean
	verifyScientificControls?: boolean
	verifyResourceCheckpoints?: boolean
}>

function verifyRssResourceRecord(value: unknown, expectedLabels: readonly string[], label: string): void {
	if (!isRecord(value) || !Array.isArray(value.checkpoints) || value.checkpoints.length !== expectedLabels.length ||
		!Number.isSafeInteger(value.maximumRssBytes) || (value.maximumRssBytes as number) < 0 ||
		(value.maximumRssBytes as number) > NATIVE_SCALE_SPACE_MAX_RSS_BYTES) throw new Error(`${label} RSS resource record is invalid`)
	let maximum = 0
	for (const [index, checkpoint] of value.checkpoints.entries()) {
		if (!isRecord(checkpoint) || checkpoint.label !== expectedLabels[index] ||
			!Number.isSafeInteger(checkpoint.maxRssKilobytes) || (checkpoint.maxRssKilobytes as number) < 0 ||
			checkpoint.peakBytes !== (checkpoint.maxRssKilobytes as number) * 1024) {
			throw new Error(`${label} RSS checkpoint ${index} is invalid`)
		}
		maximum = Math.max(maximum, checkpoint.peakBytes as number)
	}
	if (maximum !== value.maximumRssBytes) throw new Error(`${label} RSS maximum does not reconcile`)
}

export async function verifyNativeScaleSpaceArtifactDirectory(
	artifactDirectory: string,
	options: NativeScaleSpaceArtifactVerificationOptions = {},
) {
	const directory = resolve(artifactDirectory)
	const projectRoot = resolve(options.projectRoot ?? fileURLToPath(new URL("..", import.meta.url)))
	const rootMetadata = await lstat(directory)
	if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory() || await realpath(directory) !== directory) {
		throw new Error("Artifact directory must be a real exact directory")
	}
	const topEntries = await readdir(directory, { withFileTypes: true })
	const topNames = topEntries.map(({ name }) => name).sort()
	const expectedTop = ["analysis.json", "certificates.json", "controls.json", "manifest.json", "protocol.json", "results", "results.json"]
	if (canonicalJson(topNames) !== canonicalJson(expectedTop) || topEntries.some((entry) => entry.isSymbolicLink() ||
		(entry.name === "results" ? !entry.isDirectory() : !entry.isFile()))) throw new Error("Artifact top-level paths are not exact")
	const topValues: Record<string, Record<string, unknown>> = {}
	for (const path of ["protocol.json", "results.json", "certificates.json", "controls.json", "analysis.json", "manifest.json"]) {
		const { bytes, value } = await readCanonicalArtifactFile(join(directory, path), path)
		if (Buffer.from(bytes).toString("utf8") !== canonicalSerialize(value) || !isRecord(value)) throw new Error(`${path} is not canonical JSON`)
		topValues[path] = value
	}
	const protocol = topValues["protocol.json"]
	const protocolId = protocol.protocolId
	assertSha256(protocolId, "protocol.json protocolId")
	const { protocolId: ignoredProtocolId, ...protocolIdentity } = protocol
	void ignoredProtocolId
	if (computeNativeScaleSpaceProtocolId(protocolIdentity) !== protocolId || canonicalJson(protocol) !== canonicalJson(buildNativeScaleSpaceEvidenceProtocol())) {
		throw new Error("Protocol schema or self-ID is invalid")
	}
	for (const path of ["results.json", "certificates.json", "controls.json", "analysis.json", "manifest.json"]) {
		assertCommonHeader(topValues[path], protocolId, path)
	}
	const manifest = topValues["manifest.json"]
	requireExactKeys(manifest, [
		...nativeScaleSpaceCommonHeaderKeys,
		"execution", "canonicalArtifacts", "promotionCertificates", "sourceRoster", "implementation", "packages",
		"runtimes", "artifactHashes", "artifactSemanticHashes", "resultMerkleRootSha256", "hardStopsPassed",
		"disposition", "scientificIdentitySha256",
	], "manifest.json")
	requireExactKeys(topValues["certificates.json"], [...nativeScaleSpaceCommonHeaderKeys, "entries"], "certificates.json")
	requireExactKeys(topValues["controls.json"], [
		...nativeScaleSpaceCommonHeaderKeys, "structuralRows", "structuralRowCount", "structuralValid",
		"scientificPredicates", "disposition",
	], "controls.json")
	requireExactKeys(topValues["analysis.json"], [
		...nativeScaleSpaceCommonHeaderKeys, "executionSourceCount", "fullSourceCount", "distributions", "counts",
		"disposition", "diagnosticOnly",
	], "analysis.json")
	assertSha256(manifest.scientificIdentitySha256, "Manifest scientific identity")
	if (domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_SCIENTIFIC_IDENTITY_VERSION, manifestProjection(manifest)) !== manifest.scientificIdentitySha256) {
		throw new Error("Manifest scientific identity projection is invalid")
	}
	if (!isRecord(manifest.execution)) throw new Error("Manifest execution is invalid")
	const executionCount = manifest.execution.processedSources
	assertPositiveSafeInteger(executionCount, "Manifest processed source count")
	const publishable = manifest.execution.publishable === true
	if (publishable) {
		if (executionCount !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT || manifest.execution.limit !== null ||
			manifest.execution.noPublish !== false || manifest.execution.mode !== "publish") throw new Error("Publishable artifact coverage is invalid")
	} else {
		if (!options.allowLimited || manifest.execution.noPublish !== true ||
			(manifest.execution.mode !== "limited-no-publish" && manifest.execution.mode !== "full-no-publish")) {
			throw new Error("Nonpublishable artifact requires explicit limited verification")
		}
		if (manifest.execution.limit !== null && manifest.execution.limit !== executionCount) throw new Error("Limited execution prefix is invalid")
	}
	const resultEntries = await readdir(join(directory, "results"), { withFileTypes: true })
	const expectedResultNames = Array.from({ length: executionCount }, (_, index) => `source-${String(index).padStart(4, "0")}.json`)
	if (resultEntries.some((entry) => entry.isSymbolicLink() || !entry.isFile()) ||
		canonicalJson(resultEntries.map(({ name }) => name).sort()) !== canonicalJson(expectedResultNames)) {
		throw new Error("Result shard paths/count are not exact")
	}
	if (publishable && 6 + resultEntries.length !== 398) throw new Error("Final artifact must contain exactly 398 JSON files")

	const expectedArtifactPaths = ["protocol.json", "results.json", "certificates.json", "controls.json", "analysis.json",
		...expectedResultNames.map((name) => `results/${name}`)]
	if (!isRecord(manifest.artifactHashes) || !isRecord(manifest.artifactSemanticHashes) ||
		canonicalJson(Object.keys(manifest.artifactHashes).sort()) !== canonicalJson([...expectedArtifactPaths].sort()) ||
		canonicalJson(Object.keys(manifest.artifactSemanticHashes).sort()) !== canonicalJson([...expectedArtifactPaths].sort())) {
		throw new Error("Manifest artifact hash path tables are incomplete")
	}
	for (const path of expectedArtifactPaths) {
		const bytes = await readFile(resolveNativeScaleSpaceArtifactPath(directory, path))
		const value = JSON.parse(bytes.toString("utf8")) as unknown
		if (bytes.toString("utf8") !== canonicalSerialize(value) || manifest.artifactHashes[path] !== sha256(bytes) ||
			manifest.artifactSemanticHashes[path] !== semanticSha256(value)) throw new Error(`Artifact hash changed: ${path}`)
	}

	const canonicalDevelopment = await readCanonicalArtifactFile(join(projectRoot, NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.development.path), "Canonical development artifact")
	const canonicalHoldout = await readCanonicalArtifactFile(join(projectRoot, NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.holdout00.path), "Canonical holdout artifact")
	if (sha256(canonicalDevelopment.bytes) !== NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.development.rawSha256 ||
		sha256(canonicalHoldout.bytes) !== NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.holdout00.rawSha256 ||
		canonicalJson(manifest.canonicalArtifacts) !== canonicalJson(NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES)) {
		throw new Error("Canonical artifact references are not exact")
	}
	if (canonicalJson(manifest.promotionCertificates) !== canonicalJson(NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES)) {
		throw new Error("Promotion certificate references are not exact")
	}
	const roster = deriveNativeScaleSpaceCanonicalRoster(canonicalDevelopment.value, canonicalHoldout.value)
	if (!isRecord(manifest.sourceRoster) || manifest.sourceRoster.count !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT ||
		manifest.sourceRoster.sha256 !== NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256 || !Array.isArray(manifest.sourceRoster.entries) ||
		semanticSha256(manifest.sourceRoster.entries) !== NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256) {
		throw new Error("Manifest source roster identity is invalid")
	}
	const manifestRosterEntries = manifest.sourceRoster.entries as Array<Record<string, unknown>>
	for (const [index, canonicalEntry] of roster.entries()) {
		const row = manifestRosterEntries[index]
		if (!isRecord(row) || row.cohort !== canonicalEntry.cohort || row.artifactIndex !== canonicalEntry.artifactIndex ||
			row.file !== canonicalEntry.file || row.relativePath !== canonicalEntry.sourceRelativePath) throw new Error("Manifest source roster is not the canonical ordered roster")
	}
	await verifyNativeScaleSpacePackageReferences(projectRoot)
	if (canonicalJson(manifest.packages) !== canonicalJson(NATIVE_SCALE_SPACE_PACKAGE_REFERENCES)) throw new Error("Manifest package references changed")
	const closure = await verifyNativeScaleSpaceImplementationClosure(projectRoot)
	if (canonicalJson(manifest.implementation) !== canonicalJson(closure)) throw new Error("Manifest implementation closure changed")
	for (const file of closure.files) assertNativeScaleSpaceProvenancePath(file.path)
	if (!isRecord(manifest.runtimes) || semanticSha256(manifest.runtimes.modern) !== NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256 ||
		manifest.runtimes.modernSha256 !== NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256 ||
		semanticSha256(manifest.runtimes.canonical) !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256 ||
		manifest.runtimes.canonicalSha256 !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256) throw new Error("Manifest runtime identities changed")

	if (options.verifyScientificControls !== false) {
		const expectedControls = createNativeScaleSpaceControlsArtifact(protocolId)
		if (!expectedControls.structuralValid || expectedControls.disposition === "invalid-structural" ||
			canonicalJson(topValues["controls.json"]) !== canonicalJson(expectedControls) ||
			manifest.disposition !== expectedControls.disposition || manifest.hardStopsPassed !== true) {
			throw new Error("Fixture controls or disposition changed")
		}
	}
	rejectAnalysisDecisionKeys(topValues["analysis.json"])
	const results = topValues["results.json"]
	requireExactKeys(results, [
		...nativeScaleSpaceCommonHeaderKeys, "shardSchemaVersion", "columnSchemaVersion", "columnSchema", "merkleVersion",
		"executionSourceCount", "fullSourceCount", "shards", "orderedShardMerkleRootSha256",
	], "results.json")
	if (!Array.isArray(results.shards) || results.shards.length !== executionCount || results.executionSourceCount !== executionCount ||
		results.fullSourceCount !== NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT || results.shardSchemaVersion !== NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION ||
		results.columnSchemaVersion !== NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION ||
		canonicalJson(results.columnSchema) !== canonicalJson(NATIVE_SCALE_SPACE_RESULT_COLUMN_SCHEMA) ||
		results.merkleVersion !== NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION) {
		throw new Error("Results index schema/count is invalid")
	}
	const records = results.shards as NativeScaleSpaceResultShardRecord[]
	const certificatesArtifact = topValues["certificates.json"]
	if (!Array.isArray(certificatesArtifact.entries) || certificatesArtifact.entries.length !== executionCount) throw new Error("Source certificates are incomplete")
	const developmentPromotion = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path),
		"Development promotion certificate",
	)
	const holdoutPromotion = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.holdout00.path),
		"Holdout promotion certificate",
	)
	const promotionBindings: Record<NativeScaleSpaceCohort, NativeScaleSpacePromotionCertificateBinding> = {
		development: parseNativeScaleSpacePromotionCertificate(
			developmentPromotion.bytes,
			"development", roster.slice(0, NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT).map(({ file }) => file),
		),
		"00": parseNativeScaleSpacePromotionCertificate(
			holdoutPromotion.bytes,
			"00", roster.slice(NATIVE_SCALE_SPACE_DEVELOPMENT_SOURCE_COUNT).map(({ file }) => file),
		),
	}
	let canonicalChild: CanonicalRasterChild | undefined
	try {
		if (options.verifyCanonicalRasters !== false) canonicalChild = new CanonicalRasterChild(projectRoot)
		for (let index = 0; index < executionCount; index++) {
			const record = records[index]
			const rosterRow = manifestRosterEntries[index]
			if (!record || record.shardIndex !== index || record.path !== `results/source-${String(index).padStart(4, "0")}.json` ||
				record.sourceStartIndex !== index || record.sourceEndIndexExclusive !== index + 1 || record.sourceCount !== 1 ||
				canonicalJson(record.sourceEntryKeys) !== canonicalJson([{ cohort: rosterRow.cohort, file: rosterRow.file }])) {
				throw new Error(`Result shard record coverage is invalid at ${index}`)
			}
			const bytes = await readFile(join(directory, record.path))
			if (bytes.byteLength !== record.bytes || bytes.byteLength > NATIVE_SCALE_SPACE_MAX_RESULT_SHARD_BYTES ||
				sha256(bytes) !== record.rawSha256) throw new Error(`Result shard raw identity changed at ${index}`)
			const shard = JSON.parse(bytes.toString("utf8")) as unknown
			if (!isRecord(shard) || semanticSha256(shard) !== record.semanticSha256 || !isRecord(shard.entry)) throw new Error(`Result shard schema is invalid at ${index}`)
			requireExactKeys(shard, [
				...nativeScaleSpaceCommonHeaderKeys, "shardSchemaVersion", "columnSchemaVersion", "shardIndex",
				"sourceStartIndex", "sourceEndIndexExclusive", "sourceCount", "sourceEntryKeys", "entry",
			], `result shard ${index}`)
			assertCommonHeader(shard, protocolId, `result shard ${index}`)
			const entry = shard.entry
			requireExactKeys(entry, [
				"schemaVersion", "sourceIndex", "cohort", "file", "source", "canonicalControl", "metadataPreflight",
				"native", "availability", "a", "targets", "targetDimensionEqualities", "predicates", "resource",
			], `source result ${index}`)
			if (entry.schemaVersion !== 1 || entry.sourceIndex !== index || entry.cohort !== rosterRow.cohort || entry.file !== rosterRow.file ||
				!isRecord(entry.source) || entry.source.sha256 !== rosterRow.sha256 || !isRecord(entry.canonicalControl) ||
				!isRecord(entry.metadataPreflight) || !isRecord(entry.native) || !isRecord(entry.availability) ||
				!isRecord(entry.resource) || !isRecord(entry.predicates) ||
				Object.values(entry.predicates).some((value) => value !== true) || !isRecord(entry.a) || entry.a.arm !== "A" ||
				!Array.isArray(entry.targets) || entry.targets.length !== NATIVE_SCALE_SPACE_CORPUS_TARGETS.length) {
				throw new Error(`Source result structural schema failed at ${index}`)
			}
			requireExactKeys(entry.source, ["relativePath", "bytes", "sha256"], `source identity ${index}`)
			if (entry.source.relativePath !== rosterRow.relativePath || entry.source.bytes !== rosterRow.bytes) {
				throw new Error(`Source roster binding failed at ${index}`)
			}
			requireExactKeys(entry.canonicalControl, [
				"width", "height", "normalizedImageSha256", "computedNormalizedImageSha256", "promotionCertificatePath",
				"promotionCertificateRawSha256", "canonicalRuntimeSha256",
			], `canonical control ${index}`)
			if (entry.canonicalControl.normalizedImageSha256 !== entry.canonicalControl.computedNormalizedImageSha256 ||
				entry.canonicalControl.canonicalRuntimeSha256 !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256) {
				throw new Error(`Canonical control projection failed at ${index}`)
			}
			const promotionReference = rosterRow.cohort === "development"
				? NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development
				: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.holdout00
			if (entry.canonicalControl.promotionCertificatePath !== promotionReference.path ||
				entry.canonicalControl.promotionCertificateRawSha256 !== promotionReference.rawSha256) {
				throw new Error(`Canonical promotion binding failed at ${index}`)
			}
			requireExactKeys(entry.metadataPreflight, [
				"version", "rawMetadata", "pageCount", "encodedWidth", "encodedHeight", "encodedPixels", "orientation", "semanticSha256",
			], `metadata preflight ${index}`)
			const { semanticSha256: metadataIdentity, ...metadataProjection } = entry.metadataPreflight
			if (metadataIdentity !== semanticSha256(metadataProjection) || entry.metadataPreflight.pageCount !== 1 ||
				!Number.isSafeInteger(entry.metadataPreflight.encodedPixels) || (entry.metadataPreflight.encodedPixels as number) <= 0 ||
				(entry.metadataPreflight.encodedPixels as number) > NATIVE_SCALE_SPACE_MAX_ENCODED_PIXELS) {
				throw new Error(`Metadata preflight identity failed at ${index}`)
			}
			requireExactKeys(entry.native, [
				"width", "height", "pixels", "rgbBytes", "rawSha256", "identitySha256", "decodePolicy", "bounds",
			], `native raster ${index}`)
			assertSha256(entry.native.rawSha256, `native raster raw identity ${index}`)
			assertSha256(entry.native.identitySha256, `native raster identity ${index}`)
			requireExactKeys(entry.availability, [
				"version", "identitySha256", "candidateLabelsSha256", "candidateStableKeys", "candidateMaskSha256",
				"candidateWitnessRgb", "candidateWitnessOklab", "candidateMeanOklab", "candidateWitnessIndex", "candidateAnalysisRgb",
				"candidateAnalysisOklab", "candidateAnalysisIndex", "candidateAnalysisDistance", "candidateAnalysisNativeExact",
				"nativeVersusAnalysisWitnessExact", "familyStableKeys", "familyMaskSha256", "familyAnchorCandidateIds",
				"familyMemberOffsets", "familyMemberCandidateIds", "orderedEdges",
			], `availability ${index}`)
			if (!Array.isArray(entry.availability.candidateStableKeys) || entry.availability.candidateStableKeys.length <= 0 ||
				entry.availability.candidateStableKeys.length > NATIVE_SCALE_SPACE_MAX_CANDIDATES ||
				!Array.isArray(entry.availability.familyStableKeys) || entry.availability.familyStableKeys.length <= 0 ||
				entry.availability.familyStableKeys.length > NATIVE_SCALE_SPACE_MAX_FAMILIES ||
				!Array.isArray(entry.availability.orderedEdges) || entry.availability.orderedEdges.length > NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES) {
				throw new Error(`Availability bounds failed at ${index}`)
			}
			requireExactKeys(entry.predicates as Record<string, unknown>, nativeScaleSpaceSourcePredicateKeys, `source predicates ${index}`)
			if (options.verifyResourceCheckpoints !== false) {
				const targetLabels = NATIVE_SCALE_SPACE_CORPUS_TARGETS.map(({ kind, value }) => `after-target-${kind}-${value}`)
				verifyRssResourceRecord(entry.resource, [
					"process-start", "before-metadata", "after-metadata", "after-decode", "after-availability", "after-arm-A",
					...targetLabels, "before-shard-write",
				], `source result ${index}`)
			}
			for (const [targetIndex, target] of entry.targets.entries()) {
				if (!isRecord(target) || canonicalJson(target.target) !== canonicalJson(NATIVE_SCALE_SPACE_CORPUS_TARGETS[targetIndex]) ||
					!isRecord(target.b) || target.b.arm !== "B" || !isRecord(target.c) || target.c.arm !== "C") {
					throw new Error(`Source target matrix failed at ${index}:${targetIndex}`)
				}
			}
			const certificate = certificatesArtifact.entries[index]
			if (!isRecord(certificate)) throw new Error(`Source certificate ${index} is invalid`)
			requireExactKeys(certificate, [
				...nativeScaleSpaceCommonHeaderKeys, "certificateVersion", "sourceIndex", "cohort", "file", "sourceSha256",
				"normalizedImageSha256", "metadataSemanticSha256", "canonicalRuntimeSha256", "modernRuntimeSha256",
				"nativeIdentitySha256", "availabilityIdentitySha256", "resultShardPath", "resultShardSemanticSha256",
				"predicates", "resource", "identitySha256",
			], `source certificate ${index}`)
			assertCommonHeader(certificate, protocolId, `source certificate ${index}`)
			const { identitySha256, ...certificateIdentity } = certificate
			assertSha256(identitySha256, `Source certificate ${index} identity`)
			if (domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION, certificateIdentity) !== identitySha256 ||
				certificate.sourceIndex !== index || certificate.cohort !== rosterRow.cohort || certificate.file !== rosterRow.file ||
				certificate.sourceSha256 !== rosterRow.sha256 || certificate.resultShardPath !== record.path ||
				certificate.resultShardSemanticSha256 !== record.semanticSha256 ||
				certificate.metadataSemanticSha256 !== entry.metadataPreflight.semanticSha256 ||
				certificate.canonicalRuntimeSha256 !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256 ||
				certificate.modernRuntimeSha256 !== NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256 ||
				certificate.nativeIdentitySha256 !== entry.native.identitySha256 ||
				certificate.availabilityIdentitySha256 !== entry.availability.identitySha256 || !isRecord(certificate.predicates) ||
				Object.values(certificate.predicates).some((value) => value !== true) ||
				canonicalJson(certificate.predicates) !== canonicalJson(entry.predicates) ||
				certificate.normalizedImageSha256 !== entry.canonicalControl.normalizedImageSha256 || certificate.normalizedImageSha256 !==
				promotionBindings[rosterRow.cohort as NativeScaleSpaceCohort].entries[rosterRow.file as string].normalizedImageSha256) {
				throw new Error(`Source certificate binding failed at ${index}`)
			}
			requireExactKeys(certificate.predicates as Record<string, unknown>, nativeScaleSpaceSourcePredicateKeys,
				`source certificate predicates ${index}`)
			if (options.verifyResourceCheckpoints !== false) {
				const targetLabels = NATIVE_SCALE_SPACE_CORPUS_TARGETS.map(({ kind, value }) => `after-target-${kind}-${value}`)
				verifyRssResourceRecord(certificate.resource, [
					"process-start", "before-metadata", "after-metadata", "after-decode", "after-availability", "after-arm-A",
					...targetLabels, "before-shard-write", "after-source-release",
				], `source certificate ${index}`)
			}
			if (canonicalChild) {
				const decoded = await canonicalChild.decode(rosterRow.relativePath as string)
				if (decoded.sourceSha256 !== rosterRow.sha256 || normalizedImageSha256(decoded) !== certificate.normalizedImageSha256 ||
					decoded.width !== roster[index].canonicalWidth || decoded.height !== roster[index].canonicalHeight) {
					throw new Error(`Canonical raster certificate failed at ${index}`)
				}
			}
		}
	} finally {
		if (canonicalChild) await canonicalChild.close()
	}
	if (orderedNativeScaleSpaceResultMerkleRoot(records) !== results.orderedShardMerkleRootSha256 ||
		results.orderedShardMerkleRootSha256 !== manifest.resultMerkleRootSha256) throw new Error("Result Merkle root is invalid")
	return Object.freeze({
		publishable,
		executionSourceCount: executionCount,
		fileCount: 6 + executionCount,
		protocolId,
		scientificIdentitySha256: manifest.scientificIdentitySha256,
		resultMerkleRootSha256: manifest.resultMerkleRootSha256,
		disposition: manifest.disposition,
	})
}

async function readNativeScaleSpaceCanonicalInputs(projectRoot: string) {
	const development = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.development.path),
		"Canonical development artifact",
	)
	const holdout = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.holdout00.path),
		"Canonical holdout artifact",
	)
	if (sha256(development.bytes) !== NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.development.rawSha256 ||
		sha256(holdout.bytes) !== NATIVE_SCALE_SPACE_CANONICAL_ARTIFACT_REFERENCES.holdout00.rawSha256) {
		throw new Error("Canonical corpus artifact raw SHA-256 changed")
	}
	return deriveNativeScaleSpaceCanonicalRoster(development.value, holdout.value)
}

async function readNativeScaleSpacePromotionBindings(
	projectRoot: string,
	roster: readonly NativeScaleSpaceCanonicalRosterEntry[],
): Promise<Record<NativeScaleSpaceCohort, NativeScaleSpacePromotionCertificateBinding>> {
	const development = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path),
		"Development promotion certificate",
	)
	const holdout = await readCanonicalArtifactFile(
		join(projectRoot, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.holdout00.path),
		"Holdout promotion certificate",
	)
	return {
		development: parseNativeScaleSpacePromotionCertificate(
			development.bytes,
			"development",
			roster.filter(({ cohort }) => cohort === "development").map(({ file }) => file),
		),
		"00": parseNativeScaleSpacePromotionCertificate(
			holdout.bytes,
			"00",
			roster.filter(({ cohort }) => cohort === "00").map(({ file }) => file),
		),
	}
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function createNativeScaleSpaceRunnerScratch(
	preparedSources: readonly Readonly<{ metadataPreflight: NativeScaleSpaceMetadataPreflight }>[],
): NativeScaleSpaceRunnerScratch {
	if (preparedSources.length === 0) throw new Error("Reusable source scratch requires at least one prepared source")
	let maximumPixels = 0
	let maximumSatLength = 0
	let maximumTargetPixels = 0
	for (const { metadataPreflight } of preparedSources) {
		const { encodedWidth: width, encodedHeight: height, encodedPixels: pixels } = metadataPreflight
		maximumPixels = Math.max(maximumPixels, pixels)
		maximumSatLength = Math.max(maximumSatLength, safeProduct(width + 1, height + 1, "Prepared SAT length"))
		for (const target of NATIVE_SCALE_SPACE_CORPUS_TARGETS) {
			maximumTargetPixels = Math.max(maximumTargetPixels, resolveNativeScaleSpaceTarget(width, height, target).pixels)
		}
	}
	if (maximumPixels > NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS) throw new Error("Prepared source scratch exceeds the native pixel bound")
	return Object.freeze({
		maximumPixels,
		mask: new Uint8Array(maximumPixels),
		sat: new Uint32Array(maximumSatLength),
		fieldBuffer: new ArrayBuffer(safeProduct(maximumPixels, Uint32Array.BYTES_PER_ELEMENT, "Prepared field buffer bytes")),
		cValues: new Uint32Array(maximumTargetPixels),
		cSourceIndices: new Uint32Array(maximumTargetPixels),
		component: createNativeScaleSpaceComponentScratch(maximumPixels),
	})
}

export async function runNativeScaleSpaceAudit(
	arguments_: NativeScaleSpaceAuditArguments,
	paths: Readonly<{ projectRoot?: string; researchRoot?: string }> = {},
): Promise<Readonly<{ mode: "publish" | "no-publish"; outputDirectory: string | null; verified: true; removed: boolean }>> {
	if (arguments_.limit !== null && !arguments_.noPublish) throw new Error("--limit requires --no-publish")
	const projectRoot = resolve(paths.projectRoot ?? fileURLToPath(new URL("..", import.meta.url)))
	const researchRoot = resolve(paths.researchRoot ?? fileURLToPath(new URL(".", import.meta.url)))
	const processStartMaxRss = process.resourceUsage().maxRSS
	const processStart = Object.freeze({
		label: "process-start",
		maxRssKilobytes: processStartMaxRss,
		peakBytes: processStartMaxRss * 1024,
	})
	let publication: NativeScaleSpacePublicationAttempt | undefined
	let noPublish: NativeScaleSpaceNoPublishAttempt | undefined
	let canonicalChild: CanonicalRasterChild | undefined
	let outputDirectory: string | undefined
	let completed = false
	try {
		if (arguments_.noPublish) {
			noPublish = await createNativeScaleSpaceNoPublishAttempt(researchRoot)
			outputDirectory = noPublish.temporaryDirectory
		} else {
			publication = await createNativeScaleSpacePublicationAttempt(researchRoot)
			outputDirectory = publication.stagingDirectory
		}
		await mkdir(join(outputDirectory, "results"), { recursive: false })
		const protocol = buildNativeScaleSpaceEvidenceProtocol()
		const header = createNativeScaleSpaceCommonHeader(protocol.protocolId)
		if (semanticSha256(MODERN_RASTER_RUNTIME) !== NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256) {
			throw new Error("Modern Sharp runtime identity changed")
		}
		const canonicalRoster = await readNativeScaleSpaceCanonicalInputs(projectRoot)
		const promotionBindings = await readNativeScaleSpacePromotionBindings(projectRoot, canonicalRoster)
		const boundRoster = await bindNativeScaleSpaceSourceRoster(projectRoot, canonicalRoster)
		const sourceRoster = nativeScaleSpaceSourceRosterIdentity(boundRoster)
		await verifyNativeScaleSpacePackageReferences(projectRoot)
		const implementation = await verifyNativeScaleSpaceImplementationClosure(projectRoot)
		const selected = boundRoster.slice(0, arguments_.limit ?? NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT)
		const preparedSources: Array<{
			entry: NativeScaleSpaceBoundRosterEntry
			sourceIndex: number
			metadataPreflight: NativeScaleSpaceMetadataPreflight
			rss: NativeScaleSpaceRssTracker
		}> = []
		for (const [sourceIndex, entry] of selected.entries()) {
			const rss = createNativeScaleSpaceRssTracker(processStart)
			const sourceBytes = await readNativeScaleSpaceBoundSource(projectRoot, entry.sourceRelativePath)
			if (sourceBytes.byteLength !== entry.sourceBytes || sha256(sourceBytes) !== entry.sourceSha256) {
				throw new Error(`Bound source changed before metadata preflight: ${entry.file}`)
			}
			sampleNativeScaleSpaceRss(rss, "before-metadata")
			const metadataPreflight = await preflightNativeRasterMetadata(sourceBytes)
			sampleNativeScaleSpaceRss(rss, "after-metadata")
			preparedSources.push({ entry, sourceIndex, metadataPreflight, rss })
			await collectReleasedNativeScaleSpaceSourceMemory()
		}
		preparedSources.sort((first, second) =>
			second.metadataPreflight.encodedPixels - first.metadataPreflight.encodedPixels || first.sourceIndex - second.sourceIndex)
		const runnerScratch = createNativeScaleSpaceRunnerScratch(preparedSources)
		const shards: NativeScaleSpaceResultShardRecord[] = []
		const certificates: NativeScaleSpaceSourceCertificate[] = []
		const analysisAccumulator = createNativeScaleSpaceAnalysisAccumulator()
		let canonicalRuntime: Readonly<Record<string, string>> | null = null
		canonicalChild = new CanonicalRasterChild(projectRoot)
		for (const [executionIndex, prepared] of preparedSources.entries()) {
			const { sourceIndex, entry, metadataPreflight, rss } = prepared
			let evaluated: Awaited<ReturnType<typeof evaluateNativeScaleSpaceSource>> | null = await evaluateNativeScaleSpaceSource({
				entry, sourceIndex, projectRoot, canonicalChild, promotionCertificate: promotionBindings[entry.cohort], rss,
				metadataPreflight, runnerScratch,
			})
			if (canonicalRuntime === null) canonicalRuntime = evaluated.canonicalRuntime
			else if (canonicalJson(canonicalRuntime) !== canonicalJson(evaluated.canonicalRuntime)) throw new Error("Canonical runtime changed within the run")
			sampleNativeScaleSpaceRss(rss, "before-shard-write")
			evaluated.result.resource = Object.freeze({
				...evaluated.result.resource,
				maximumRssBytes: rss.maximumBytes,
				checkpoints: Object.freeze([...rss.checkpoints]),
			})
			const record = await writeNativeScaleSpaceSourceResultShard(outputDirectory, header, sourceIndex, evaluated.result)
			shards.push(record)
			accumulateNativeScaleSpaceAnalysis(analysisAccumulator, evaluated.result)
			const preliminaryCertificate = createNativeScaleSpaceSourceCertificate(
				header, evaluated.result, record, semanticSha256(evaluated.canonicalRuntime), rss,
			)
			evaluated = null
			await collectReleasedNativeScaleSpaceSourceMemory()
			sampleNativeScaleSpaceRss(rss, "after-source-release")
			const { identitySha256: ignoredCertificateIdentity, resource: ignoredCertificateResource, ...certificateSeed } = preliminaryCertificate
			void ignoredCertificateIdentity
			void ignoredCertificateResource
			const certificateBase = {
				...certificateSeed,
				resource: Object.freeze({ maximumRssBytes: rss.maximumBytes, checkpoints: Object.freeze([...rss.checkpoints]) }),
			}
			certificates.push(Object.freeze({
				...certificateBase,
				identitySha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION, certificateBase),
			}))
			process.stderr.write(`[${executionIndex + 1}/${selected.length}] ${entry.sourceRelativePath} (roster ${sourceIndex})\n`)
		}
		shards.sort((first, second) => first.shardIndex - second.shardIndex)
		certificates.sort((first, second) => first.sourceIndex - second.sourceIndex)
		await canonicalChild.close()
		canonicalChild = undefined
		if (canonicalRuntime === null || semanticSha256(canonicalRuntime) !== NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256) {
			throw new Error("Canonical runtime was not observed exactly")
		}
		const controls = createNativeScaleSpaceControlsArtifact(protocol.protocolId)
		if (!controls.structuralValid || controls.disposition === "invalid-structural") {
			throw new Error("Native scale-space fixture controls are structurally invalid")
		}
		const analysis = finalizeNativeScaleSpaceAnalysisArtifact(
			protocol.protocolId, selected.length, controls.disposition, analysisAccumulator,
		)
		const execution = Object.freeze({
			mode: arguments_.noPublish ? arguments_.limit === null ? "full-no-publish" as const : "limited-no-publish" as const : "publish" as const,
			limit: arguments_.limit,
			noPublish: arguments_.noPublish,
			publishable: !arguments_.noPublish && arguments_.limit === null,
			processedSources: selected.length,
		})
		await finalizeNativeScaleSpaceArtifactDirectory({
			artifactDirectory: outputDirectory,
			protocol,
			execution,
			sourceRoster,
			shards,
			certificates,
			controls,
			analysis,
			implementation,
			canonicalRuntime,
		})
		await verifyNativeScaleSpaceArtifactDirectory(outputDirectory, {
			projectRoot,
			allowLimited: arguments_.noPublish,
			verifyCanonicalRasters: true,
		})
		if (noPublish) {
			await removeSuccessfulNativeScaleSpaceNoPublish(noPublish)
			completed = true
			return Object.freeze({ mode: "no-publish", outputDirectory: null, verified: true, removed: true })
		}
		if (!publication) throw new Error("Publication attempt is missing")
		const finalDirectory = await publishNativeScaleSpacePublication(publication)
		completed = true
		return Object.freeze({ mode: "publish", outputDirectory: finalDirectory, verified: true, removed: false })
	} catch (error) {
		if (canonicalChild) await canonicalChild.close().catch(() => undefined)
		canonicalChild = undefined
		if (noPublish && !completed) {
			const preserved = preserveFailedNativeScaleSpaceNoPublish(noPublish)
			throw new Error(`Audit failed; no-publish attempt preserved at ${preserved}: ${failureMessage(error)}`, { cause: error })
		}
		if (publication && !completed) {
			let preserved: string
			try {
				preserved = await preserveFailedNativeScaleSpacePublication(publication)
			} catch (preserveError) {
				throw new AggregateError([error, preserveError], "Audit failed and publish staging could not be preserved")
			}
			throw new Error(`Audit failed; publish staging preserved at ${preserved}: ${failureMessage(error)}`, { cause: error })
		}
		throw error
	}
}

async function main(): Promise<void> {
	const arguments_ = parseNativeScaleSpaceAuditArguments(process.argv.slice(2))
	const result = await runNativeScaleSpaceAudit(arguments_)
	if (result.mode === "no-publish") process.stdout.write("Verified no-publish audit; temporary namespace removed\n")
	else process.stdout.write(`Published audit: ${result.outputDirectory}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
