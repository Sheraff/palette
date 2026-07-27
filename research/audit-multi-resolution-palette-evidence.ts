import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { rgbToOKLab } from "./src/color.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext, type ExtractionContext } from "./src/extract.ts"
import {
	analyzeResolutionEvidence,
	resolutionEvidenceCandidatePalette,
	RESOLUTION_EVIDENCE_POLICY_SHA256,
	RESOLUTION_EVIDENCE_POLICY_VERSION,
	RESOLUTION_EVIDENCE_VERSION,
	type ResolutionEvidenceInputIdentity,
	type ResolutionEvidenceFrame,
} from "./src/resolution-evidence.ts"
import {
	MODERN_RASTER_RUNTIME,
	RESOLUTION_PROFILES,
	RESOLUTION_PROFILE_VERSION,
	commonSampleOKLab,
	commonSampleRgb,
	createCommonDomainSamples,
	createNativeRgbOccupancy,
	decodeNativeRaster,
	nativeRgbOccupancyHas,
	renderResolutionProfile,
	type CommonDomainSamples,
	type DecodedNativeRaster,
	type RgbUcharRaster,
} from "./src/resolution-raster.ts"
import type { Candidate, CandidateSpatialEvidence } from "./src/candidates.ts"
import type { CorpusResult, ExtractionResult, RawImage, RGB, RoleName } from "./src/types.ts"

export const MULTI_RESOLUTION_AUDIT_ID = "multi-resolution-palette-evidence-audit-0.3.0-development" as const
export const MULTI_RESOLUTION_AUDIT_SCHEMA = "multi-resolution-palette-evidence-audit-artifacts-v1" as const
export const CANONICAL_CHILD_PROTOCOL_VERSION = "resolution-canonical-raster-child-v1" as const
export const OUTPUT_CHILD_PROTOCOL_VERSION = "resolution-experiment-output-child-v1" as const
export const RESULT_SHARD_SCHEMA_VERSION = "multi-resolution-result-source-shard-v1" as const
export const RESULT_COLUMN_SCHEMA_VERSION = "multi-resolution-result-columns-v1" as const
export const RESULT_SHARD_MERKLE_VERSION = "ordered-result-shard-merkle-v1" as const
export const MAX_RESULT_SHARD_BYTES = 2 * 1024 * 1024
export const FULL_SOURCE_COUNT = 392
export const DEVELOPMENT_SOURCE_COUNT = 37
export const HOLDOUT_SOURCE_COUNT = 355
export const REVIEW_CAP = 40
export const PROMOTION_CERTIFICATE_ALGORITHM_VERSION = "region-chromatic-role-0.1.0-poc.10" as const
export const PROMOTION_CERTIFICATE_REFERENCES = Object.freeze({
	development: {
		path: "research/data/candidates/region-chromatic-role-0.1.0-poc.10/chromatic-role-certificates.json",
		rawSha256: "6c9086c08ddb583ade810d8391b10ce04c38fbdb85b7f2344a2af0a84d16b2b3",
		entries: DEVELOPMENT_SOURCE_COUNT,
	},
	holdout00: {
		path: "research/data/candidates/region-chromatic-role-0.1.0-poc.10/holdout-chromatic-role-certificates.json",
		rawSha256: "ce6bca08b738860ba014adf717889844e860a6fb99459ffd2297929808095163",
		entries: HOLDOUT_SOURCE_COUNT,
	},
})
export const RESULT_COLUMN_SCHEMA = Object.freeze({
	version: RESULT_COLUMN_SCHEMA_VERSION,
	alignment: "each named column is an array aligned by descriptor row; nested RGB/Lab/histogram vectors retain source order",
	evidence: {
		candidate: [
			"id", "key", "meanLab", "analysisRgb", "analysisLab", "analysisIndex", "analysisDistance",
			"analysisExactNativePresence", "nativeWitnessRgb", "nativeWitnessLab", "nativeWitnessIndex",
			"nativeWitnessDistance", "nativeWitnessFootprintStartX", "nativeWitnessFootprintEndX",
			"nativeWitnessFootprintStartY", "nativeWitnessFootprintEndY", "nativeWitnessDuplicateCandidateKeys",
			"familyKey", "fieldBroad", "fieldDetail", "fieldFrame", "fieldParetoEligible",
			"familyComponentSignatureSha256", "pixelCount", "population", "edgeDetail", "borderFrame",
			"interiorOwnership", "componentCount", "largestComponentPopulation", "sideCoverage",
			"thinComponentSupport", "typographySupport", "spatialFieldBroad", "spatialFieldDetail",
			"spatialFieldFrame", "componentAreaHistogram", "borderTouchingComponentCount", "thinComponentCount",
			"componentSignatureSha256",
		],
		family: [
			"id", "key", "anchorCandidateKey", "memberCandidateKeys", "pixelCount", "population", "edgeDetail",
			"borderFrame", "interiorOwnership", "componentCount", "largestComponentPopulation", "sideCoverage",
			"thinComponentSupport", "typographySupport", "fieldBroad", "fieldDetail", "fieldFrame",
			"componentAreaHistogram", "borderTouchingComponentCount", "thinComponentCount", "componentSignatureSha256",
		],
		relation: [
			"key", "fromCandidateKey", "toCandidateKey", "endpointDistance", "fromPresence", "toPresence",
			"balance", "mass", "coverage", "middleContinuity", "coarseSpatialProgression",
		],
	},
	extractor: {
		candidate: [
			"id", "key", "rgb", "lab", "hex", "population", "background", "saliency", "text", "chroma",
			"generated", "typographyOnly", "familyId", "exactNativePresence", "spatial", "familySpatial",
		],
		spatial: [
			"population", "regionIds", "sideCoverage", "field", "detail", "frame", "componentSummary",
			"componentSignatureSha256",
		],
		componentSummaryTuple: "[count,populationDistribution,saliencyDistribution,textDistribution,sideCoverageDistributions]",
		distributionTuple: "[count,minimum,maximum,mean,sum]",
	},
	identityMatches: {
		candidateEdge: [
			"fromCandidateKey", "toCandidateKey", "analysisLabDistance", "nativeWitnessRgbExact", "analysisRgbExact",
			"componentSignatureExact", "familyComponentSignatureExact", "populationDelta", "fieldDeltaBroad",
			"fieldDeltaDetail", "fieldDeltaFrame",
		],
		familyEdge: [
			"fromFamilyKey", "toFamilyKey", "anchorAnalysisLabDistance", "anchorNativeWitnessRgbExact",
			"componentSignatureExact", "memberCountDelta", "populationDelta",
		],
	},
})

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputArgument = `data/experiments/${MULTI_RESOLUTION_AUDIT_ID}`
const roleNames = ["background", "foreground", "surface", "accent"] as const
const completeExtractorProfileIds = new Set([
	"max-edge-224-lanczos3",
	"max-edge-224-cubic",
	"max-edge-224-nearest",
	"max-edge-224-area",
	"max-edge-320-lanczos3",
])
const referenceEvidenceId = "canonical-sharp-0.33.5-max-edge-224"
const evidenceComparisonNames = [
	"analysisRepresentativeNativePresence",
	"nativeExactRepresentatives",
	"counts",
	"populations",
	"familyIdentities",
	"components",
	"fieldEligibilityComponents",
	"typographyThinSupport",
	"frameInterior",
	"graphTreatmentCounts",
	"relationEndpointMetrics",
	"alternatives",
] as const
const artifactNames = ["protocol.json", "results.json", "certificates.json", "controls.json", "analysis.json"] as const
const implementationRoots = [
	"research/audit-multi-resolution-palette-evidence.ts",
	"research/resolution-canonical-raster-child.ts",
	"research/resolution-experiment-output-child.ts",
	"research/src/resolution-raster.ts",
	"research/src/resolution-evidence.ts",
	"research/src/extract.ts",
] as const
const implementationExtras = [
	"package.json",
	"pnpm-lock.yaml",
	"research/tests/multi-resolution-palette-evidence-audit.test.ts",
	"research/tests/resolution-raster.test.ts",
	"research/tests/resolution-evidence.test.ts",
] as const

type AuditArguments = { limit: number | null; noPublish: boolean }
type CanonicalEntry = CorpusResult["entries"][number]
type RosterTask = {
	cohort: "development" | "00"
	artifactIndex: number
	file: string
	sourceRelativePath: string
	frozen: CanonicalEntry
}
type BoundRosterEntry = RosterTask & { sourceSha256: string; sourceBytes: number }
type AllowedSourceRoots = {
	projectRoot: string
	physicalProjectRoot: string
	roots: Record<"images" | "00", string>
}
type CanonicalDecode = {
	width: number
	height: number
	data: Uint8Array
	sourceSha256: string
	versions: Record<string, string>
}
type PromotionCertificateEntry = {
	schemaVersion: 1
	algorithmVersion: typeof PROMOTION_CERTIFICATE_ALGORITHM_VERSION
	normalizedImageSha256: string
	[key: string]: unknown
}
export type PromotionCertificateBinding = {
	path: string
	rawSha256: string
	entries: Record<string, PromotionCertificateEntry>
}
type RemoteExperimentOutputAttempt = { outputDirectory: string; stagingDirectory: string }
export type ResultSourceEntryKey = { cohort: RosterTask["cohort"]; file: string }
export type ResultShardRecord = {
	path: string
	shardIndex: number
	sourceStartIndex: number
	sourceEndIndexExclusive: number
	sourceCount: number
	rawSha256: string
	semanticSha256: string
	bytes: number
	sourceEntryKeys: ResultSourceEntryKey[]
}
export type ShardedResultsIndex = {
	schemaVersion: 1
	experimentId: typeof MULTI_RESOLUTION_AUDIT_ID
	protocolId: string
	shardSchemaVersion: typeof RESULT_SHARD_SCHEMA_VERSION
	columnSchemaVersion: typeof RESULT_COLUMN_SCHEMA_VERSION
	columnSchema: typeof RESULT_COLUMN_SCHEMA
	executionSourceCount: number
	fullSourceCount: number
	shards: ResultShardRecord[]
	orderedShardMerkleRootSha256: string
}
type EvidenceComparisonName = typeof evidenceComparisonNames[number]
type CompactSpatialEvidence = {
	pixelCount: number
	population: number
	edgeDetail: number
	borderFrame: number
	interiorOwnership: number
	componentCount: number
	largestComponentPopulation: number
	sideCoverage: number[]
	thinComponentSupport: number
	typographySupport: number
	fieldBroad: number
	fieldDetail: number
	fieldFrame: number
	componentAreaHistogram: number[]
	borderTouchingComponentCount: number
	thinComponentCount: number
	componentSignatureSha256: string
}
type EvidenceCandidateDescriptor = CompactSpatialEvidence & {
	id: number
	key: string
	meanLab: number[]
	analysis: { rgb: number[]; lab: number[]; index: number; distance: number; exactNativePresence: boolean }
	nativeWitness: {
		rgb: number[]
		lab: number[]
		index: number
		distance: number
		footprint: { startX: number; endX: number; startY: number; endY: number }
		duplicateCandidateKeys: string[]
	}
	familyKey: string
	field: { broad: number; detail: number; frame: number; paretoEligible: boolean }
	familyComponentSignatureSha256: string
}
type EvidenceFamilyDescriptor = CompactSpatialEvidence & {
	id: number
	key: string
	anchorCandidateKey: string
	memberCandidateKeys: string[]
}
type EvidenceRelationDescriptor = {
	key: string
	fromCandidateKey: string
	toCandidateKey: string
	endpointDistance: number
	fromPresence: number
	toPresence: number
	balance: number
	mass: number
	coverage: number
	middleContinuity: number
	coarseSpatialProgression: number
}
type EvidenceCompact = {
	version: typeof RESOLUTION_EVIDENCE_VERSION
	occupiedBinCount: number
	candidateCount: number
	familyCount: number
	exactAnalysisRepresentativeNativePresenceCount: number
	eligibleNodeCount: number
	relationCount: number
	graph: ResolutionEvidenceFrame["graph"]
	fieldEligibilityCounts: { paretoEligible: number; fieldEligible: number; ineligible: number }
	policySha256: string
	planeHashes: ResolutionEvidenceFrame["planeHashes"]
	provenanceSha256: string
	invariants: ResolutionEvidenceFrame["invariants"]
	candidates: EvidenceCandidateDescriptor[]
	families: EvidenceFamilyDescriptor[]
	eligibleCandidateKeys: string[]
	relations: EvidenceRelationDescriptor[]
	hashes: Record<EvidenceComparisonName, string>
	semanticSha256: string
}
type EvidenceBuild = { compact: EvidenceCompact; metrics: Record<string, number[]> }
type NumericDistribution = { count: number; minimum: number | null; maximum: number | null; mean: number | null }
type Accumulator = { count: number; minimum: number; maximum: number; sum: number }
type ProfileResult = {
	profileId: string
	dimensions: { width: number; height: number }
	raster: { rawSha256: string; identitySha256: string }
	distortion: {
		meanOklabDistance: number
		maximumOklabDistance: number
		meanAbsoluteRgbChannelDifference: number
		exactRgbSampleCount: number
		changedRgbSampleCount: number
	}
	reconstruction: {
		analysisRepresentativeMeanOklabDistance: number
		nativeWitnessMeanOklabDistance: number
	}
	evidence: EvidenceCompact
	changesFromReference: EvidenceComparisonName[]
	identityMatches: ReturnType<typeof directedEvidenceMatches>
	canonicalRasterExactMatch: boolean | null
	completeExtraction: null | {
		semanticSha256: string
		context: ReturnType<typeof compactExtractorContext>
		visibleSemantics: ReturnType<typeof visiblePaletteSemantics>
		changedRoles: Record<string, RoleName[]>
		changedRoleCount: number
		gradientChangedMethods: string[]
		visibleSemanticsChanged: boolean
	}
}
type SourceResult = {
	cohort: RosterTask["cohort"]
	file: string
	source: { relativePath: string; bytes: number; sha256: string }
	baseline: {
		exactReproduction: true
		promotionCertificate: {
			path: string
			rawSha256: string
			normalizedImageSha256: string
			computedNormalizedImageSha256: string
			exactRasterIdentity: true
		}
		frozenExtractionSemanticSha256: string
		canonicalExtractionSemanticSha256: string
		canonicalRaster: { width: number; height: number; rawSha256: string; identitySha256: string }
		evidence: EvidenceCompact
		distortion: ProfileResult["distortion"]
		reconstruction: {
			extractorCandidateMeanOklabDistance: number
			analysisRepresentativeMeanOklabDistance: number
			nativeWitnessMeanOklabDistance: number
		}
		context: ReturnType<typeof compactExtractorContext>
	}
	modernNative: { width: number; height: number; rawSha256: string; identitySha256: string }
	commonSample: { columns: number; rows: number; count: number; indicesSha256: string; nativeRgbSha256: string }
	modernMaxEdge224Lanczos3CanonicalRasterExactMatch: boolean
	profiles: ProfileResult[]
	structuralViolations: []
}
type SourceCertificate = {
	cohort: RosterTask["cohort"]
	file: string
	sourceSha256: string
	canonicalRuntimeSha256: string
	canonicalRasterIdentitySha256: string
	canonicalRasterDimensions: { width: number; height: number }
	canonicalExtractionSemanticSha256: string
	canonicalEvidenceSemanticSha256: string
	promotionCertificateRawSha256: string
	promotionNormalizedImageSha256: string
	modernRuntimeSha256: string
	modernNativeIdentitySha256: string
	modernNativeDimensions: { width: number; height: number }
	commonSampleIndicesSha256: string
	commonSampleNativeRgbSha256: string
	profiles: Array<{
		profileId: string
		rasterIdentitySha256: string
		dimensions: { width: number; height: number }
		typedEvidenceSemanticSha256: string
		completeExtractionSemanticSha256: string | null
	}>
	identitySha256: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalValue(value))
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function semanticSha256(value: unknown): string {
	return sha256(canonicalJson(value))
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} keys do not match the promotion-bound schema`)
	}
}

export function normalizedImageSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

const promotionCertificateEntryKeys = [
	"schemaVersion", "algorithmVersion", "baselineAlgorithmVersion", "availabilityAlgorithmVersion", "selectionRule",
	"normalizedImageSha256", "candidateIdentity", "availability", "solver", "baseline", "treatment", "emitted",
	"decision", "invariants",
] as const
const promotionAvailabilityKeys = [
	"anchorsEvaluated", "qualifiedProposals", "alreadyRepresented", "suppressedProposals", "droppedByCap",
	"selectedSupplements", "supplements",
] as const
const promotionDecisionKeys = [
	"solverRan", "availableSupplementIds", "admittedSupplementIds", "selectedSupplementIds", "selectedSupplementRoles",
	"changedRoles", "gradientChanged", "emittedTreatment", "accentVisibilityEligible", "accentIdentityEligible",
	"selectedRoleEligible", "collapsedBackgroundEligible", "accentChromaEligible", "collateralRoleChromaEligible",
] as const
const promotionInvariantKeys = [
	"canonicalCandidatePrefixUnchanged", "supplementsAppendedOnly", "uniqueCandidateIds", "supplementIdsAboveBaseline",
	"exactNormalizedSourcePixels", "canonicalCandidatesNotMutated", "noSupplementPreservesCanonical",
	"unselectedSupplementsPreserveCanonical", "expressiveFrozen", "quantizedFrozen", "everyChangedOutputSelectsSupplement",
	"canonicalFamilyAssignmentsFrozen", "overlappingPopulationNotRenormalized", "minorFamilyRoleAdmissionBound",
	"typographySupportedRoleAdmission", "emittedAccentVisibilityBound", "emittedAccentIdentityBound",
	"emittedRoleEvidenceBound", "emittedCollapsedBackgroundBound", "emittedAccentChromaBound",
	"emittedCollateralRoleChromaBound",
] as const

function requirePromotionRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} is not an object`)
	requireExactKeys(value, keys, label)
	return value
}

function validatePromotionPaletteSummary(value: unknown, label: string): void {
	const summary = requirePromotionRecord(value, ["roles", "gradient"], label)
	if (typeof summary.gradient !== "boolean") throw new Error(`${label}.gradient is invalid`)
	const roles = requirePromotionRecord(summary.roles, roleNames, `${label}.roles`)
	for (const role of roleNames) {
		const color = requirePromotionRecord(roles[role], ["hex", "generated"], `${label}.roles.${role}`)
		if (typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) || typeof color.generated !== "boolean") {
			throw new Error(`${label}.roles.${role} is invalid`)
		}
	}
}

export function parsePromotionCertificateArtifact(
	bytes: Uint8Array,
	cohort: "development" | "00",
	expectedFiles: readonly string[],
): PromotionCertificateBinding {
	const reference = cohort === "development" ? PROMOTION_CERTIFICATE_REFERENCES.development : PROMOTION_CERTIFICATE_REFERENCES.holdout00
	const rawSha256 = sha256(bytes)
	if (rawSha256 !== reference.rawSha256) throw new Error(`${cohort} promotion certificate raw SHA-256 changed`)
	let parsed: unknown
	try {
		parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
	} catch (error) {
		throw new Error(`${cohort} promotion certificate JSON is invalid`, { cause: error })
	}
	if (!isRecord(parsed)) throw new Error(`${cohort} promotion certificate artifact is not an object`)
	requireExactKeys(parsed, ["schemaVersion", "algorithmVersion", "entries"], `${cohort} promotion certificate artifact`)
	if (parsed.schemaVersion !== 1 || parsed.algorithmVersion !== PROMOTION_CERTIFICATE_ALGORITHM_VERSION ||
		!isRecord(parsed.entries)) throw new Error(`${cohort} promotion certificate header is invalid`)
	const actualFiles = Object.keys(parsed.entries)
	if (actualFiles.length !== reference.entries || expectedFiles.length !== reference.entries ||
		actualFiles.some((file, index) => file !== expectedFiles[index])) {
		throw new Error(`${cohort} promotion certificate keys/count do not match the canonical roster`)
	}
	for (const file of actualFiles) {
		const entry = parsed.entries[file]
		if (!isRecord(entry)) throw new Error(`${cohort} promotion certificate entry ${file} is invalid`)
		requireExactKeys(entry, promotionCertificateEntryKeys, `${cohort} promotion certificate entry ${file}`)
		if (entry.schemaVersion !== 1 || entry.algorithmVersion !== PROMOTION_CERTIFICATE_ALGORITHM_VERSION ||
			typeof entry.normalizedImageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.normalizedImageSha256) ||
			entry.baselineAlgorithmVersion !== "region-graph-0.17.0" ||
			entry.availabilityAlgorithmVersion !== "region-candidate-availability-0.1.0-poc.1" ||
			entry.selectionRule !== "canonical-spatial-pipeline-with-bounded-chromatic-supplements") {
			throw new Error(`${cohort} promotion certificate entry ${file} failed schema/identity validation`)
		}
		const candidateIdentity = requirePromotionRecord(entry.candidateIdentity,
			["baselineSha256", "augmentedSha256", "roleSolverSha256"], `${cohort}.${file}.candidateIdentity`)
		if (Object.values(candidateIdentity).some((value) => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))) {
			throw new Error(`${cohort}.${file}.candidateIdentity is invalid`)
		}
		requirePromotionRecord(entry.availability, promotionAvailabilityKeys, `${cohort}.${file}.availability`)
		requirePromotionRecord(entry.solver, ["guarded", "joint"], `${cohort}.${file}.solver`)
		validatePromotionPaletteSummary(entry.baseline, `${cohort}.${file}.baseline`)
		validatePromotionPaletteSummary(entry.treatment, `${cohort}.${file}.treatment`)
		validatePromotionPaletteSummary(entry.emitted, `${cohort}.${file}.emitted`)
		requirePromotionRecord(entry.decision, promotionDecisionKeys, `${cohort}.${file}.decision`)
		const invariants = requirePromotionRecord(entry.invariants, promotionInvariantKeys, `${cohort}.${file}.invariants`)
		if (Object.values(invariants).some((value) => value !== true)) {
			throw new Error(`${cohort}.${file}.invariants are not all true`)
		}
	}
	return {
		path: reference.path,
		rawSha256,
		entries: parsed.entries as Record<string, PromotionCertificateEntry>,
	}
}

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

export function parseAuditArguments(arguments_: readonly string[]): AuditArguments {
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
			if (!Number.isSafeInteger(limit) || limit > FULL_SOURCE_COUNT) {
				throw new Error(`--limit cannot exceed ${FULL_SOURCE_COUNT}`)
			}
			continue
		}
		throw new Error(`Unknown argument: ${argument}`)
	}
	if (limit !== null && !noPublish) throw new Error("--limit requires --no-publish and cannot publish a partial matrix")
	return { limit, noPublish }
}

function validateDevelopmentFile(file: string): string {
	if (file.length === 0 || file === "." || file === ".." || file.includes("\0") || file.includes("/") ||
		file.includes("\\") || basename(file) !== file) throw new Error(`Unsafe development source path: ${file}`)
	return `images/${file}`
}

function validateHoldoutFile(file: string): string {
	if (!/^00\/[^/\\]+$/.test(file) || file.includes("\0") || file.endsWith("/.") || file.endsWith("/..")) {
		throw new Error(`Unsafe 00 source path: ${file}`)
	}
	return file
}

function parseCanonicalCorpus(value: unknown, cohort: RosterTask["cohort"], expectedCount: number): CanonicalEntry[] {
	if (!isRecord(value) || value.algorithmVersion !== ALGORITHM_VERSION || !Array.isArray(value.entries)) {
		throw new Error(`${cohort} canonical artifact is not ${ALGORITHM_VERSION}`)
	}
	if (value.entries.length !== expectedCount) {
		throw new Error(`${cohort} canonical roster must contain exactly ${expectedCount} entries`)
	}
	return value.entries.map((entry, index) => {
		if (!isRecord(entry) || typeof entry.file !== "string" || typeof entry.kind !== "string" ||
			typeof entry.review !== "boolean" || !Number.isSafeInteger(entry.width) || !Number.isSafeInteger(entry.height) ||
			(entry.width as number) <= 0 || (entry.height as number) <= 0 || (entry.width as number) > 224 ||
			(entry.height as number) > 224 || !isRecord(entry.extraction) || entry.extraction.version !== ALGORITHM_VERSION) {
			throw new Error(`${cohort} canonical entry ${index} is invalid`)
		}
		if (cohort === "development") validateDevelopmentFile(entry.file)
		else validateHoldoutFile(entry.file)
		return entry as unknown as CanonicalEntry
	})
}

export function deriveCanonicalRoster(development: unknown, holdout: unknown): RosterTask[] {
	const developmentEntries = parseCanonicalCorpus(development, "development", DEVELOPMENT_SOURCE_COUNT)
	const holdoutEntries = parseCanonicalCorpus(holdout, "00", HOLDOUT_SOURCE_COUNT)
	const tasks = [
		...developmentEntries.map((frozen, artifactIndex): RosterTask => ({
			cohort: "development",
			artifactIndex,
			file: frozen.file,
			sourceRelativePath: validateDevelopmentFile(frozen.file),
			frozen,
		})),
		...holdoutEntries.map((frozen, artifactIndex): RosterTask => ({
			cohort: "00",
			artifactIndex,
			file: frozen.file,
			sourceRelativePath: validateHoldoutFile(frozen.file),
			frozen,
		})),
	]
	if (tasks.length !== FULL_SOURCE_COUNT) throw new Error("Canonical roster count does not reconcile")
	return tasks
}

export function resolveBoundSourcePath(root: string, sourceRelativePath: string): string {
	const normalizedRoot = resolve(root)
	let name: string
	let directory: "images" | "00"
	if (sourceRelativePath.startsWith("images/")) {
		directory = "images"
		name = sourceRelativePath.slice("images/".length)
		if (validateDevelopmentFile(name) !== sourceRelativePath) throw new Error("Unsafe bound images/ source path")
	} else if (sourceRelativePath.startsWith("00/")) {
		directory = "00"
		name = sourceRelativePath.slice("00/".length)
		if (validateHoldoutFile(sourceRelativePath) !== sourceRelativePath) throw new Error("Unsafe bound 00/ source path")
	} else {
		throw new Error("Bound source must be one direct child of images/ or 00/")
	}
	return join(normalizedRoot, directory, name)
}

async function requireAllowedSourceRoots(root: string): Promise<AllowedSourceRoots> {
	const normalizedRoot = resolve(root)
	const metadata = await lstat(normalizedRoot)
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Project root must be a real directory")
	const physicalProjectRoot = await realpath(normalizedRoot)
	if (physicalProjectRoot !== normalizedRoot) throw new Error("Project root physical identity is not exact")
	const roots = {} as AllowedSourceRoots["roots"]
	for (const name of ["images", "00"] as const) {
		const path = join(normalizedRoot, name)
		const childMetadata = await lstat(path)
		if (childMetadata.isSymbolicLink() || !childMetadata.isDirectory() ||
			await realpath(path) !== join(physicalProjectRoot, name)) {
			throw new Error(`${name}/ must be a real direct child of the project root`)
		}
		roots[name] = path
	}
	return { projectRoot: normalizedRoot, physicalProjectRoot, roots }
}

async function readBoundSource(roots: AllowedSourceRoots, sourceRelativePath: string): Promise<Uint8Array> {
	const path = resolveBoundSourcePath(roots.projectRoot, sourceRelativePath)
	const directory = sourceRelativePath.startsWith("images/") ? roots.roots.images : roots.roots["00"]
	if (resolve(path).slice(0, directory.length + 1) !== `${directory}/`) throw new Error("Bound source escaped its allowed root")
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

async function bindCompleteSourceRoster(tasks: readonly RosterTask[], roots: AllowedSourceRoots): Promise<BoundRosterEntry[]> {
	const bound: BoundRosterEntry[] = []
	const duplicatePaths = new Map<string, string>()
	for (const task of tasks) {
		const bytes = await readBoundSource(roots, task.sourceRelativePath)
		const sourceSha256 = sha256(bytes)
		const duplicate = duplicatePaths.get(task.sourceRelativePath)
		if (duplicate !== undefined && duplicate !== sourceSha256) {
			throw new Error(`Duplicate roster path is not byte-identical: ${task.sourceRelativePath}`)
		}
		duplicatePaths.set(task.sourceRelativePath, sourceSha256)
		bound.push({ ...task, sourceSha256, sourceBytes: bytes.byteLength })
	}
	if (bound.length !== FULL_SOURCE_COUNT) throw new Error("Complete source roster binding is incomplete")
	return bound
}

type ChildWireResponse = {
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
	readonly #pending = new Map<string, { resolve: (value: ChildWireResponse) => void; reject: (error: Error) => void }>()
	readonly #exit: Promise<void>
	#nextId = 1
	#stderr = ""

	constructor(root: string, childPath = fileURLToPath(new URL("./resolution-canonical-raster-child.ts", import.meta.url))) {
		this.#child = spawn(process.execPath, [
			"--no-warnings",
			"--experimental-strip-types",
			childPath,
			"--project-root",
			resolve(root),
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
				const error = code === 0
					? null
					: new Error(`Canonical raster child exited with ${signal ?? `code ${String(code)}`}: ${this.#stderr.trim()}`)
				for (const pending of this.#pending.values()) pending.reject(error ?? new Error("Canonical raster child closed"))
				this.#pending.clear()
				if (error) rejectExit(error)
				else resolveExit()
			})
		})
	}

	#handleLine(line: string): void {
		let response: ChildWireResponse
		try {
			response = JSON.parse(line) as ChildWireResponse
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
		if (response.protocolVersion !== CANONICAL_CHILD_PROTOCOL_VERSION) {
			pending.reject(new Error("Canonical child returned an invalid protocol version"))
			return
		}
		pending.resolve(response)
	}

	#request(request: Record<string, unknown>): Promise<ChildWireResponse> {
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

	async decode(source: string): Promise<CanonicalDecode> {
		const response = await this.#request({ operation: "decode-224", source })
		if (!Number.isSafeInteger(response.width) || !Number.isSafeInteger(response.height) ||
			(response.width as number) <= 0 || (response.height as number) <= 0 ||
			typeof response.dataBase64 !== "string" || typeof response.sourceSha256 !== "string" ||
			!isRecord(response.versions)) throw new Error("Canonical child returned an invalid decode response")
		const data = new Uint8Array(Buffer.from(response.dataBase64, "base64"))
		if (data.length !== (response.width as number) * (response.height as number) * 3) {
			throw new Error("Canonical child raw byte length does not match dimensions")
		}
		if (!/^[a-f0-9]{64}$/.test(response.sourceSha256) ||
			Object.values(response.versions).some((version) => typeof version !== "string")) {
			throw new Error("Canonical child returned invalid provenance")
		}
		return {
			width: response.width as number,
			height: response.height as number,
			data,
			sourceSha256: response.sourceSha256,
			versions: response.versions as Record<string, string>,
		}
	}

	async close(): Promise<void> {
		if (!this.#child.stdin.destroyed) this.#child.stdin.end()
		await this.#exit
	}
}

type OutputWireResponse = {
	id: string | null
	ok: boolean
	protocolVersion: string
	outputDirectory?: string
	stagingDirectory?: string
	preservedDirectory?: string
	error?: string
}

export class ExperimentOutputChild {
	readonly #child: ChildProcessWithoutNullStreams
	readonly #pending = new Map<string, { resolve: (value: OutputWireResponse) => void; reject: (error: Error) => void }>()
	readonly #exit: Promise<void>
	#nextId = 1
	#stderr = ""

	constructor(root: string, childPath = fileURLToPath(new URL("./resolution-experiment-output-child.ts", import.meta.url))) {
		this.#child = spawn(process.execPath, [
			"--no-warnings",
			"--experimental-strip-types",
			childPath,
			"--research-root",
			resolve(root),
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
				const error = code === 0
					? null
					: new Error(`Experiment output child exited with ${signal ?? `code ${String(code)}`}: ${this.#stderr.trim()}`)
				for (const pending of this.#pending.values()) pending.reject(error ?? new Error("Experiment output child closed"))
				this.#pending.clear()
				if (error) rejectExit(error)
				else resolveExit()
			})
		})
	}

	#handleLine(line: string): void {
		let response: OutputWireResponse
		try {
			response = JSON.parse(line) as OutputWireResponse
		} catch {
			for (const pending of this.#pending.values()) pending.reject(new Error("Output child emitted invalid JSON-lines data"))
			this.#pending.clear()
			this.#child.kill()
			return
		}
		if (typeof response.id !== "string") return
		const pending = this.#pending.get(response.id)
		if (!pending) return
		this.#pending.delete(response.id)
		if (!response.ok) {
			pending.reject(new Error(response.error ?? "Output child rejected the request"))
			return
		}
		if (response.protocolVersion !== OUTPUT_CHILD_PROTOCOL_VERSION) {
			pending.reject(new Error("Output child returned an invalid protocol version"))
			return
		}
		pending.resolve(response)
	}

	#request(request: Record<string, unknown>): Promise<OutputWireResponse> {
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

	async beginOutput(output: string): Promise<RemoteExperimentOutputAttempt> {
		const response = await this.#request({ operation: "begin-output", outputArgument: output })
		if (typeof response.outputDirectory !== "string" || typeof response.stagingDirectory !== "string") {
			throw new Error("Output child returned an invalid output attempt")
		}
		return { outputDirectory: response.outputDirectory, stagingDirectory: response.stagingDirectory }
	}

	async publishOutput(): Promise<string> {
		const response = await this.#request({ operation: "publish-output" })
		if (typeof response.outputDirectory !== "string") throw new Error("Output child returned an invalid publication path")
		return response.outputDirectory
	}

	async preserveOutput(): Promise<string> {
		const response = await this.#request({ operation: "preserve-output" })
		if (typeof response.preservedDirectory !== "string") throw new Error("Output child returned an invalid preservation path")
		return response.preservedDirectory
	}

	async releaseOutput(): Promise<void> {
		await this.#request({ operation: "release-output" })
	}

	async close(): Promise<void> {
		if (!this.#child.stdin.destroyed) this.#child.stdin.end()
		await this.#exit
	}
}

function compactCandidateSpatialEvidence(spatial: CandidateSpatialEvidence) {
	const distribution = (values: readonly number[]) => {
		let minimum = Infinity
		let maximum = -Infinity
		let sum = 0
		for (const value of values) {
			minimum = Math.min(minimum, value)
			maximum = Math.max(maximum, value)
			sum += value
		}
		return {
			count: values.length,
			minimum: values.length === 0 ? null : minimum,
			maximum: values.length === 0 ? null : maximum,
			mean: values.length === 0 ? null : sum / values.length,
			sum,
		}
	}
	const componentValues = spatial.components.map((component) => ({
		population: component.population,
		regionIds: [...component.regionIds],
		sideCoverage: [...component.sideCoverage],
		saliency: component.saliency,
		text: component.text,
	}))
	const values = {
		population: spatial.population,
		regionIds: [...spatial.regionIds],
		sideCoverage: [...spatial.sideCoverage],
		field: spatial.field,
		detail: spatial.detail,
		frame: spatial.frame,
		components: {
			count: componentValues.length,
			population: distribution(componentValues.map((component) => component.population)),
			saliency: distribution(componentValues.map((component) => component.saliency)),
			text: distribution(componentValues.map((component) => component.text)),
			sideCoverage: Array.from({ length: 4 }, (_, side) =>
				distribution(componentValues.map((component) => component.sideCoverage[side]))),
		},
	}
	return { ...values, componentSignatureSha256: semanticSha256(componentValues) }
}

function compactExtractorCandidate(candidate: Candidate, nativeRgbOccupancy: Uint32Array) {
	return {
		id: candidate.id,
		key: `candidate-${candidate.id}`,
		rgb: [...candidate.rgb],
		lab: [...candidate.lab],
		hex: candidate.hex,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
		generated: candidate.generated,
		typographyOnly: candidate.typographyOnly,
		familyId: candidate.familyId,
		exactNativePresence: nativeRgbOccupancyHas(nativeRgbOccupancy, candidate.rgb),
		spatial: compactCandidateSpatialEvidence(candidate.spatial),
		familySpatial: compactCandidateSpatialEvidence(candidate.familySpatial),
	}
}

export function compactExtractorContext(context: ExtractionContext, nativeRgbOccupancy: Uint32Array) {
	const candidates = context.candidates.map((candidate) => compactExtractorCandidate(candidate, nativeRgbOccupancy))
	const values = {
		dimensions: { width: context.analysis.width, height: context.analysis.height },
		candidateCount: candidates.length,
		exactNativePresenceCount: candidates.reduce((count, candidate) => count + (candidate.exactNativePresence ? 1 : 0), 0),
		candidates,
	}
	return { ...values, semanticSha256: semanticSha256(values) }
}

function spatialView(spatial: ResolutionEvidenceFrame["candidates"] | ResolutionEvidenceFrame["families"]) {
	return {
		pixelCounts: Array.from(spatial.pixelCounts),
		population: Array.from(spatial.population),
		edgeDetail: Array.from(spatial.edgeDetail),
		borderFrame: Array.from(spatial.borderFrame),
		interiorOwnership: Array.from(spatial.interiorOwnership),
		componentCounts: Array.from(spatial.componentCounts),
		largestComponentPopulation: Array.from(spatial.largestComponentPopulation),
		sideCoverage: Array.from(spatial.sideCoverage),
		thinComponentSupport: Array.from(spatial.thinComponentSupport),
		typographySupport: Array.from(spatial.typographySupport),
		fieldBroad: Array.from(spatial.fieldBroad),
		fieldDetail: Array.from(spatial.fieldDetail),
		fieldFrame: Array.from(spatial.fieldFrame),
	}
}

function componentSignature(frame: ResolutionEvidenceFrame, candidate: boolean, id: number): string {
	const bytes = candidate ? frame.candidates.componentSignatureSha256 : frame.families.componentSignatureSha256
	return Buffer.from(bytes.subarray(id * 32, id * 32 + 32)).toString("hex")
}

function compactSpatialEvidence(
	frame: ResolutionEvidenceFrame,
	kind: "candidate" | "family",
	id: number,
): CompactSpatialEvidence {
	const spatial = kind === "candidate" ? frame.candidates : frame.families
	return {
		pixelCount: spatial.pixelCounts[id],
		population: spatial.population[id],
		edgeDetail: spatial.edgeDetail[id],
		borderFrame: spatial.borderFrame[id],
		interiorOwnership: spatial.interiorOwnership[id],
		componentCount: spatial.componentCounts[id],
		largestComponentPopulation: spatial.largestComponentPopulation[id],
		sideCoverage: Array.from(spatial.sideCoverage.subarray(id * 4, id * 4 + 4)),
		thinComponentSupport: spatial.thinComponentSupport[id],
		typographySupport: spatial.typographySupport[id],
		fieldBroad: spatial.fieldBroad[id],
		fieldDetail: spatial.fieldDetail[id],
		fieldFrame: spatial.fieldFrame[id],
		componentAreaHistogram: Array.from(spatial.componentAreaHistogram.subarray(id * 16, id * 16 + 16)),
		borderTouchingComponentCount: spatial.borderTouchingComponentCounts[id],
		thinComponentCount: spatial.thinComponentCounts[id],
		componentSignatureSha256: componentSignature(frame, kind === "candidate", id),
	}
}

const analyzeTypedEvidence = analyzeResolutionEvidence as unknown as (
	analysis: RawImage,
	decodedNative: RawImage,
	identity?: ResolutionEvidenceInputIdentity,
) => ResolutionEvidenceFrame

function fieldEligibilityCounts(frame: ResolutionEvidenceFrame) {
	const paretoEligible = frame.field.paretoEligible.reduce((sum, value) => sum + value, 0)
	return {
		paretoEligible,
		fieldEligible: frame.field.eligibleNodeIds.length,
		ineligible: frame.candidates.count - paretoEligible,
	}
}

export function compactResolutionEvidence(frame: ResolutionEvidenceFrame): EvidenceBuild {
	const candidateSpatial = spatialView(frame.candidates)
	const familySpatial = spatialView(frame.families)
	const eligibilityCounts = fieldEligibilityCounts(frame)
	const candidateKey = (id: number): string => `candidate-${id}`
	const familyKey = (id: number): string => `family-${id}`
	const triple = (values: ArrayLike<number>, id: number): number[] =>
		[values[id * 3], values[id * 3 + 1], values[id * 3 + 2]]
	const candidates: EvidenceCandidateDescriptor[] = Array.from({ length: frame.candidates.count }, (_, id) => {
		const familyId = frame.candidates.familyIds[id]
		const duplicateStart = frame.candidates.nativeWitnessDuplicateOffsets[id]
		const duplicateEnd = frame.candidates.nativeWitnessDuplicateOffsets[id + 1]
		return {
			id,
			key: candidateKey(id),
			meanLab: triple(frame.candidates.meanLab, id),
			analysis: {
				rgb: triple(frame.candidates.analysisRepresentativeRgb, id),
				lab: triple(frame.candidates.analysisRepresentativeLab, id),
				index: frame.candidates.analysisRepresentativeIndices[id],
				distance: frame.candidates.analysisRepresentativeDistance[id],
				exactNativePresence: frame.candidates.analysisRepresentativeNativeExact[id] === 1,
			},
			nativeWitness: {
				rgb: triple(frame.candidates.nativeWitnessRgb, id),
				lab: triple(frame.candidates.nativeWitnessLab, id),
				index: frame.candidates.nativeWitnessIndices[id],
				distance: frame.candidates.nativeWitnessDistance[id],
				footprint: {
					startX: frame.candidates.nativeWitnessFootprintStartX[id],
					endX: frame.candidates.nativeWitnessFootprintEndX[id],
					startY: frame.candidates.nativeWitnessFootprintStartY[id],
					endY: frame.candidates.nativeWitnessFootprintEndY[id],
				},
				duplicateCandidateKeys: Array.from(frame.candidates.nativeWitnessDuplicateIds.subarray(
					duplicateStart,
					duplicateEnd,
				), candidateKey),
			},
			familyKey: familyKey(familyId),
			field: {
				broad: frame.field.broad[id],
				detail: frame.field.detail[id],
				frame: frame.field.frame[id],
				paretoEligible: frame.field.paretoEligible[id] === 1,
			},
			familyComponentSignatureSha256: componentSignature(frame, false, familyId),
			...compactSpatialEvidence(frame, "candidate", id),
		}
	})
	const families: EvidenceFamilyDescriptor[] = Array.from({ length: frame.families.count }, (_, id) => ({
		id,
		key: familyKey(id),
		anchorCandidateKey: candidateKey(frame.families.anchorCandidateIds[id]),
		memberCandidateKeys: candidates.filter((candidate) => candidate.familyKey === familyKey(id)).map((candidate) => candidate.key),
		...compactSpatialEvidence(frame, "family", id),
	}))
	const relations: EvidenceRelationDescriptor[] = Array.from({ length: frame.relations.count }, (_, id) => {
		const fromCandidateKey = candidateKey(frame.relations.fromNodeIds[id])
		const toCandidateKey = candidateKey(frame.relations.toNodeIds[id])
		return {
			key: `${fromCandidateKey}->${toCandidateKey}`,
			fromCandidateKey,
			toCandidateKey,
			endpointDistance: frame.relations.endpointDistance[id],
			fromPresence: frame.relations.fromPresence[id],
			toPresence: frame.relations.toPresence[id],
			balance: frame.relations.balance[id],
			mass: frame.relations.mass[id],
			coverage: frame.relations.coverage[id],
			middleContinuity: frame.relations.middleContinuity[id],
			coarseSpatialProgression: frame.relations.coarseSpatialProgression[id],
		}
	})
	const eligibleCandidateKeys = Array.from(frame.field.eligibleNodeIds, candidateKey)
	const views: Record<EvidenceComparisonName, unknown> = {
		analysisRepresentativeNativePresence: {
			candidates: candidates.map((candidate) => ({
				key: candidate.key,
				rgb: candidate.analysis.rgb,
				exactNativePresence: candidate.analysis.exactNativePresence,
			})),
		},
		nativeExactRepresentatives: {
			candidates: candidates.map((candidate) => ({ key: candidate.key, ...candidate.nativeWitness })),
			invariants: frame.invariants,
		},
		counts: {
			occupiedBinCount: frame.occupiedBinCount,
			candidatePixelCounts: candidateSpatial.pixelCounts,
			familyPixelCounts: familySpatial.pixelCounts,
			candidateCount: frame.candidates.count,
			familyCount: frame.families.count,
			relationCount: frame.relations.count,
		},
		populations: {
			candidate: candidateSpatial.population,
			family: familySpatial.population,
			candidateLargestComponent: candidateSpatial.largestComponentPopulation,
			familyLargestComponent: familySpatial.largestComponentPopulation,
		},
		familyIdentities: {
			candidates: candidates.map((candidate) => ({
				key: candidate.key,
				analysis: candidate.analysis,
				familyKey: candidate.familyKey,
				familyComponentSignatureSha256: candidate.familyComponentSignatureSha256,
			})),
			families,
		},
		components: {
			candidateCounts: candidateSpatial.componentCounts,
			familyCounts: familySpatial.componentCounts,
			candidateLargestPopulation: candidateSpatial.largestComponentPopulation,
			familyLargestPopulation: familySpatial.largestComponentPopulation,
		},
		fieldEligibilityComponents: {
			broad: Array.from(frame.field.broad),
			detail: Array.from(frame.field.detail),
			frame: Array.from(frame.field.frame),
			paretoEligible: Array.from(frame.field.paretoEligible),
			eligibleNodeIds: Array.from(frame.field.eligibleNodeIds),
			counts: eligibilityCounts,
			candidateFieldBroad: candidateSpatial.fieldBroad,
			candidateFieldDetail: candidateSpatial.fieldDetail,
			candidateFieldFrame: candidateSpatial.fieldFrame,
			familyFieldBroad: familySpatial.fieldBroad,
			familyFieldDetail: familySpatial.fieldDetail,
			familyFieldFrame: familySpatial.fieldFrame,
		},
		typographyThinSupport: {
			candidateEdgeDetail: candidateSpatial.edgeDetail,
			candidateThin: candidateSpatial.thinComponentSupport,
			candidateTypography: candidateSpatial.typographySupport,
			familyEdgeDetail: familySpatial.edgeDetail,
			familyThin: familySpatial.thinComponentSupport,
			familyTypography: familySpatial.typographySupport,
		},
		frameInterior: {
			candidateBorderFrame: candidateSpatial.borderFrame,
			candidateInteriorOwnership: candidateSpatial.interiorOwnership,
			candidateSideCoverage: candidateSpatial.sideCoverage,
			familyBorderFrame: familySpatial.borderFrame,
			familyInteriorOwnership: familySpatial.interiorOwnership,
			familySideCoverage: familySpatial.sideCoverage,
		},
		graphTreatmentCounts: {
			graph: frame.graph,
			fieldEligibilityCounts: eligibilityCounts,
		},
		relationEndpointMetrics: {
			relations,
		},
		alternatives: {
			candidates,
			families,
			eligibleCandidateKeys,
			relations,
		},
	}
	const hashes = Object.fromEntries(evidenceComparisonNames.map((name) => [name, semanticSha256(views[name])])) as
		Record<EvidenceComparisonName, string>
	const compact: EvidenceCompact = {
		version: frame.version,
		occupiedBinCount: frame.occupiedBinCount,
		candidateCount: frame.candidates.count,
		familyCount: frame.families.count,
		exactAnalysisRepresentativeNativePresenceCount: frame.candidates.analysisRepresentativeNativeExact
			.reduce((sum, value) => sum + value, 0),
		eligibleNodeCount: frame.field.eligibleNodeIds.length,
		relationCount: frame.relations.count,
		graph: { ...frame.graph },
		fieldEligibilityCounts: eligibilityCounts,
		policySha256: frame.policySha256,
		planeHashes: frame.planeHashes,
		provenanceSha256: semanticSha256(frame.provenance),
		invariants: frame.invariants,
		candidates,
		families,
		eligibleCandidateKeys,
		relations,
		hashes,
		semanticSha256: semanticSha256({
			version: frame.version,
			policySha256: frame.policySha256,
			provenance: frame.provenance,
			planeHashes: frame.planeHashes,
			invariants: frame.invariants,
			views,
		}),
	}
	return {
		compact,
		metrics: {
			candidatePopulation: candidateSpatial.population,
			familyPopulation: familySpatial.population,
			candidateComponentCount: candidateSpatial.componentCounts,
			familyComponentCount: familySpatial.componentCounts,
			fieldBroad: Array.from(frame.field.broad),
			fieldDetail: Array.from(frame.field.detail),
			fieldFrame: Array.from(frame.field.frame),
			thinComponentSupport: candidateSpatial.thinComponentSupport,
			typographySupport: candidateSpatial.typographySupport,
			borderFrame: candidateSpatial.borderFrame,
			interiorOwnership: candidateSpatial.interiorOwnership,
			relationEndpointDistance: Array.from(frame.relations.endpointDistance),
			relationFromPresence: Array.from(frame.relations.fromPresence),
			relationToPresence: Array.from(frame.relations.toPresence),
			relationBalance: Array.from(frame.relations.balance),
			relationMass: Array.from(frame.relations.mass),
			relationCoverage: Array.from(frame.relations.coverage),
			relationMiddleContinuity: Array.from(frame.relations.middleContinuity),
			relationCoarseSpatialProgression: Array.from(frame.relations.coarseSpatialProgression),
		},
	}
}

function spatialDescriptorColumns(values: readonly CompactSpatialEvidence[]) {
	return {
		pixelCount: values.map((value) => value.pixelCount),
		population: values.map((value) => value.population),
		edgeDetail: values.map((value) => value.edgeDetail),
		borderFrame: values.map((value) => value.borderFrame),
		interiorOwnership: values.map((value) => value.interiorOwnership),
		componentCount: values.map((value) => value.componentCount),
		largestComponentPopulation: values.map((value) => value.largestComponentPopulation),
		sideCoverage: values.map((value) => value.sideCoverage),
		thinComponentSupport: values.map((value) => value.thinComponentSupport),
		typographySupport: values.map((value) => value.typographySupport),
		fieldBroad: values.map((value) => value.fieldBroad),
		fieldDetail: values.map((value) => value.fieldDetail),
		fieldFrame: values.map((value) => value.fieldFrame),
		componentAreaHistogram: values.map((value) => value.componentAreaHistogram),
		borderTouchingComponentCount: values.map((value) => value.borderTouchingComponentCount),
		thinComponentCount: values.map((value) => value.thinComponentCount),
		componentSignatureSha256: values.map((value) => value.componentSignatureSha256),
	}
}

function spatialDescriptorAt(columns: ReturnType<typeof spatialDescriptorColumns>, index: number): CompactSpatialEvidence {
	return {
		pixelCount: columns.pixelCount[index],
		population: columns.population[index],
		edgeDetail: columns.edgeDetail[index],
		borderFrame: columns.borderFrame[index],
		interiorOwnership: columns.interiorOwnership[index],
		componentCount: columns.componentCount[index],
		largestComponentPopulation: columns.largestComponentPopulation[index],
		sideCoverage: columns.sideCoverage[index],
		thinComponentSupport: columns.thinComponentSupport[index],
		typographySupport: columns.typographySupport[index],
		fieldBroad: columns.fieldBroad[index],
		fieldDetail: columns.fieldDetail[index],
		fieldFrame: columns.fieldFrame[index],
		componentAreaHistogram: columns.componentAreaHistogram[index],
		borderTouchingComponentCount: columns.borderTouchingComponentCount[index],
		thinComponentCount: columns.thinComponentCount[index],
		componentSignatureSha256: columns.componentSignatureSha256[index],
	}
}

export function columnarizeResolutionEvidence(evidence: EvidenceCompact) {
	const { candidates, families, relations, ...header } = evidence
	const candidateSpatial = spatialDescriptorColumns(candidates)
	return {
		...header,
		columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
		candidates: {
			id: candidates.map((value) => value.id),
			key: candidates.map((value) => value.key),
			meanLab: candidates.map((value) => value.meanLab),
			analysisRgb: candidates.map((value) => value.analysis.rgb),
			analysisLab: candidates.map((value) => value.analysis.lab),
			analysisIndex: candidates.map((value) => value.analysis.index),
			analysisDistance: candidates.map((value) => value.analysis.distance),
			analysisExactNativePresence: candidates.map((value) => value.analysis.exactNativePresence),
			nativeWitnessRgb: candidates.map((value) => value.nativeWitness.rgb),
			nativeWitnessLab: candidates.map((value) => value.nativeWitness.lab),
			nativeWitnessIndex: candidates.map((value) => value.nativeWitness.index),
			nativeWitnessDistance: candidates.map((value) => value.nativeWitness.distance),
			nativeWitnessFootprintStartX: candidates.map((value) => value.nativeWitness.footprint.startX),
			nativeWitnessFootprintEndX: candidates.map((value) => value.nativeWitness.footprint.endX),
			nativeWitnessFootprintStartY: candidates.map((value) => value.nativeWitness.footprint.startY),
			nativeWitnessFootprintEndY: candidates.map((value) => value.nativeWitness.footprint.endY),
			nativeWitnessDuplicateCandidateKeys: candidates.map((value) => value.nativeWitness.duplicateCandidateKeys),
			familyKey: candidates.map((value) => value.familyKey),
			fieldBroad: candidates.map((value) => value.field.broad),
			fieldDetail: candidates.map((value) => value.field.detail),
			fieldFrame: candidates.map((value) => value.field.frame),
			fieldParetoEligible: candidates.map((value) => value.field.paretoEligible),
			familyComponentSignatureSha256: candidates.map((value) => value.familyComponentSignatureSha256),
			...Object.fromEntries(Object.entries(candidateSpatial).map(([name, values]) => [
				name.startsWith("field") ? `spatial${name[0].toUpperCase()}${name.slice(1)}` : name,
				values,
			])) as Omit<typeof candidateSpatial, "fieldBroad" | "fieldDetail" | "fieldFrame"> & {
				spatialFieldBroad: number[]
				spatialFieldDetail: number[]
				spatialFieldFrame: number[]
			},
		},
		families: {
			id: families.map((value) => value.id),
			key: families.map((value) => value.key),
			anchorCandidateKey: families.map((value) => value.anchorCandidateKey),
			memberCandidateKeys: families.map((value) => value.memberCandidateKeys),
			...spatialDescriptorColumns(families),
		},
		relations: {
			key: relations.map((value) => value.key),
			fromCandidateKey: relations.map((value) => value.fromCandidateKey),
			toCandidateKey: relations.map((value) => value.toCandidateKey),
			endpointDistance: relations.map((value) => value.endpointDistance),
			fromPresence: relations.map((value) => value.fromPresence),
			toPresence: relations.map((value) => value.toPresence),
			balance: relations.map((value) => value.balance),
			mass: relations.map((value) => value.mass),
			coverage: relations.map((value) => value.coverage),
			middleContinuity: relations.map((value) => value.middleContinuity),
			coarseSpatialProgression: relations.map((value) => value.coarseSpatialProgression),
		},
	}
}

export function expandColumnarResolutionEvidence(
	columnar: ReturnType<typeof columnarizeResolutionEvidence>,
): EvidenceCompact {
	const { columnSchemaVersion, candidates, families, relations, ...header } = columnar
	if (columnSchemaVersion !== RESULT_COLUMN_SCHEMA_VERSION) throw new Error("Unsupported result evidence column schema")
	const candidateSpatial = {
		pixelCount: candidates.pixelCount,
		population: candidates.population,
		edgeDetail: candidates.edgeDetail,
		borderFrame: candidates.borderFrame,
		interiorOwnership: candidates.interiorOwnership,
		componentCount: candidates.componentCount,
		largestComponentPopulation: candidates.largestComponentPopulation,
		sideCoverage: candidates.sideCoverage,
		thinComponentSupport: candidates.thinComponentSupport,
		typographySupport: candidates.typographySupport,
		fieldBroad: candidates.spatialFieldBroad,
		fieldDetail: candidates.spatialFieldDetail,
		fieldFrame: candidates.spatialFieldFrame,
		componentAreaHistogram: candidates.componentAreaHistogram,
		borderTouchingComponentCount: candidates.borderTouchingComponentCount,
		thinComponentCount: candidates.thinComponentCount,
		componentSignatureSha256: candidates.componentSignatureSha256,
	}
	return {
		...header,
		candidates: candidates.id.map((id, index) => ({
			id,
			key: candidates.key[index],
			meanLab: candidates.meanLab[index],
			analysis: {
				rgb: candidates.analysisRgb[index],
				lab: candidates.analysisLab[index],
				index: candidates.analysisIndex[index],
				distance: candidates.analysisDistance[index],
				exactNativePresence: candidates.analysisExactNativePresence[index],
			},
			nativeWitness: {
				rgb: candidates.nativeWitnessRgb[index],
				lab: candidates.nativeWitnessLab[index],
				index: candidates.nativeWitnessIndex[index],
				distance: candidates.nativeWitnessDistance[index],
				footprint: {
					startX: candidates.nativeWitnessFootprintStartX[index],
					endX: candidates.nativeWitnessFootprintEndX[index],
					startY: candidates.nativeWitnessFootprintStartY[index],
					endY: candidates.nativeWitnessFootprintEndY[index],
				},
				duplicateCandidateKeys: candidates.nativeWitnessDuplicateCandidateKeys[index],
			},
			familyKey: candidates.familyKey[index],
			field: {
				broad: candidates.fieldBroad[index],
				detail: candidates.fieldDetail[index],
				frame: candidates.fieldFrame[index],
				paretoEligible: candidates.fieldParetoEligible[index],
			},
			familyComponentSignatureSha256: candidates.familyComponentSignatureSha256[index],
			...spatialDescriptorAt(candidateSpatial, index),
		})),
		families: families.id.map((id, index) => ({
			id,
			key: families.key[index],
			anchorCandidateKey: families.anchorCandidateKey[index],
			memberCandidateKeys: families.memberCandidateKeys[index],
			...spatialDescriptorAt(families, index),
		})),
		relations: relations.key.map((key, index) => ({
			key,
			fromCandidateKey: relations.fromCandidateKey[index],
			toCandidateKey: relations.toCandidateKey[index],
			endpointDistance: relations.endpointDistance[index],
			fromPresence: relations.fromPresence[index],
			toPresence: relations.toPresence[index],
			balance: relations.balance[index],
			mass: relations.mass[index],
			coverage: relations.coverage[index],
			middleContinuity: relations.middleContinuity[index],
			coarseSpatialProgression: relations.coarseSpatialProgression[index],
		})),
	}
}

function rgbEqual(first: readonly number[], second: readonly number[]): boolean {
	return first.length === 3 && second.length === 3 && first.every((channel, index) => channel === second[index])
}

function labDistance(first: readonly number[], second: readonly number[]): number {
	return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function directedMatchSummary(source: EvidenceCompact, target: EvidenceCompact) {
	const candidateEdges = source.candidates.flatMap((from) => target.candidates.flatMap((to) => {
		const analysisLabDistance = labDistance(from.analysis.lab, to.analysis.lab)
		const nativeWitnessRgbExact = rgbEqual(from.nativeWitness.rgb, to.nativeWitness.rgb)
		if (!nativeWitnessRgbExact && analysisLabDistance > 0.055) return []
		return [{
			fromCandidateKey: from.key,
			toCandidateKey: to.key,
			analysisLabDistance,
			nativeWitnessRgbExact,
			analysisRgbExact: rgbEqual(from.analysis.rgb, to.analysis.rgb),
			componentSignatureExact: from.componentSignatureSha256 === to.componentSignatureSha256,
			familyComponentSignatureExact:
				from.familyComponentSignatureSha256 === to.familyComponentSignatureSha256,
			populationDelta: to.population - from.population,
			fieldDelta: {
				broad: to.field.broad - from.field.broad,
				detail: to.field.detail - from.field.detail,
				frame: to.field.frame - from.field.frame,
			},
		}]
	}))
	const familyEdges = source.families.flatMap((from) => target.families.flatMap((to) => {
		const fromAnchor = source.candidates.find((candidate) => candidate.key === from.anchorCandidateKey)!
		const toAnchor = target.candidates.find((candidate) => candidate.key === to.anchorCandidateKey)!
		const anchorAnalysisLabDistance = labDistance(fromAnchor.analysis.lab, toAnchor.analysis.lab)
		const anchorNativeWitnessRgbExact = rgbEqual(fromAnchor.nativeWitness.rgb, toAnchor.nativeWitness.rgb)
		if (!anchorNativeWitnessRgbExact && anchorAnalysisLabDistance > 0.055) return []
		return [{
			fromFamilyKey: from.key,
			toFamilyKey: to.key,
			anchorAnalysisLabDistance,
			anchorNativeWitnessRgbExact,
			componentSignatureExact: from.componentSignatureSha256 === to.componentSignatureSha256,
			memberCountDelta: to.memberCandidateKeys.length - from.memberCandidateKeys.length,
			populationDelta: to.population - from.population,
		}]
	}))
	const summarize = <T extends Record<string, unknown>>(
		sourceKeys: readonly string[],
		targetKeys: readonly string[],
		edges: readonly T[],
		fromField: string,
		toField: string,
	) => {
		const sourceDegrees = Object.fromEntries(sourceKeys.map((key) => [key,
			edges.filter((edge) => edge[fromField] === key).length]))
		const targetDegrees = Object.fromEntries(targetKeys.map((key) => [key,
			edges.filter((edge) => edge[toField] === key).length]))
		return {
			sourceCount: sourceKeys.length,
			targetCount: targetKeys.length,
			edgeCount: edges.length,
			unmatchedSourceCount: Object.values(sourceDegrees).filter((degree) => degree === 0).length,
			splitSourceCount: Object.values(sourceDegrees).filter((degree) => degree > 1).length,
			mergedTargetCount: Object.values(targetDegrees).filter((degree) => degree > 1).length,
			sourceDegrees,
			targetDegrees,
			edges,
		}
	}
	return {
		candidates: summarize(
			source.candidates.map((candidate) => candidate.key),
			target.candidates.map((candidate) => candidate.key),
			candidateEdges,
			"fromCandidateKey",
			"toCandidateKey",
		),
		families: summarize(
			source.families.map((family) => family.key),
			target.families.map((family) => family.key),
			familyEdges,
			"fromFamilyKey",
			"toFamilyKey",
		),
	}
}

export function directedEvidenceMatches(reference: EvidenceCompact, profile: EvidenceCompact) {
	return {
		policy: {
			version: "resolution-evidence-directed-identity-match-v1",
			admission: "exact-native-witness-rgb-or-analysis-oklab-distance-at-most-0.055",
			maximumAnalysisOklabDistance: 0.055,
			scalarScore: false,
		},
		referenceToProfile: directedMatchSummary(reference, profile),
		profileToReference: directedMatchSummary(profile, reference),
	}
}

function extractorSpatialColumns(
	values: ReadonlyArray<ReturnType<typeof compactCandidateSpatialEvidence>>,
) {
	const distributionTuple = (distribution: {
		count: number
		minimum: number | null
		maximum: number | null
		mean: number | null
		sum: number
	}) => [distribution.count, distribution.minimum, distribution.maximum, distribution.mean, distribution.sum]
	return {
		population: values.map((value) => value.population),
		regionIds: values.map((value) => value.regionIds),
		sideCoverage: values.map((value) => value.sideCoverage),
		field: values.map((value) => value.field),
		detail: values.map((value) => value.detail),
		frame: values.map((value) => value.frame),
		componentSummary: values.map((value) => [
			value.components.count,
			distributionTuple(value.components.population),
			distributionTuple(value.components.saliency),
			distributionTuple(value.components.text),
			value.components.sideCoverage.map(distributionTuple),
		]),
		componentSignatureSha256: values.map((value) => value.componentSignatureSha256),
	}
}

export function columnarizeExtractorContext(context: ReturnType<typeof compactExtractorContext>) {
	const { candidates, ...header } = context
	return {
		...header,
		columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
		candidates: {
			id: candidates.map((value) => value.id),
			key: candidates.map((value) => value.key),
			rgb: candidates.map((value) => value.rgb),
			lab: candidates.map((value) => value.lab),
			hex: candidates.map((value) => value.hex),
			population: candidates.map((value) => value.population),
			background: candidates.map((value) => value.background),
			saliency: candidates.map((value) => value.saliency),
			text: candidates.map((value) => value.text),
			chroma: candidates.map((value) => value.chroma),
			generated: candidates.map((value) => value.generated),
			typographyOnly: candidates.map((value) => value.typographyOnly),
			familyId: candidates.map((value) => value.familyId),
			exactNativePresence: candidates.map((value) => value.exactNativePresence),
			spatial: extractorSpatialColumns(candidates.map((value) => value.spatial)),
			familySpatial: extractorSpatialColumns(candidates.map((value) => value.familySpatial)),
		},
	}
}

function extractorDistributionFromTuple(values: readonly (number | null)[]) {
	return { count: values[0]!, minimum: values[1], maximum: values[2], mean: values[3], sum: values[4]! }
}

function extractorSpatialAt(columns: ReturnType<typeof extractorSpatialColumns>, index: number) {
	const summary = columns.componentSummary[index] as unknown as [
		number,
		Array<number | null>,
		Array<number | null>,
		Array<number | null>,
		Array<Array<number | null>>,
	]
	return {
		population: columns.population[index],
		regionIds: columns.regionIds[index],
		sideCoverage: columns.sideCoverage[index],
		field: columns.field[index],
		detail: columns.detail[index],
		frame: columns.frame[index],
		components: {
			count: summary[0],
			population: extractorDistributionFromTuple(summary[1]),
			saliency: extractorDistributionFromTuple(summary[2]),
			text: extractorDistributionFromTuple(summary[3]),
			sideCoverage: summary[4].map(extractorDistributionFromTuple),
		},
		componentSignatureSha256: columns.componentSignatureSha256[index],
	}
}

export function expandColumnarExtractorContext(columnar: ReturnType<typeof columnarizeExtractorContext>) {
	const { columnSchemaVersion, candidates, ...header } = columnar
	if (columnSchemaVersion !== RESULT_COLUMN_SCHEMA_VERSION) throw new Error("Unsupported result extractor column schema")
	return {
		...header,
		candidates: candidates.id.map((id, index) => ({
			id,
			key: candidates.key[index],
			rgb: candidates.rgb[index],
			lab: candidates.lab[index],
			hex: candidates.hex[index],
			population: candidates.population[index],
			background: candidates.background[index],
			saliency: candidates.saliency[index],
			text: candidates.text[index],
			chroma: candidates.chroma[index],
			generated: candidates.generated[index],
			typographyOnly: candidates.typographyOnly[index],
			familyId: candidates.familyId[index],
			exactNativePresence: candidates.exactNativePresence[index],
			spatial: extractorSpatialAt(candidates.spatial, index),
			familySpatial: extractorSpatialAt(candidates.familySpatial, index),
		})),
	}
}

function columnarizeMatchDirection(direction: ReturnType<typeof directedMatchSummary>) {
	const { edges: candidateEdges, ...candidateHeader } = direction.candidates
	const { edges: familyEdges, ...familyHeader } = direction.families
	return {
		candidates: {
			...candidateHeader,
			edges: {
				fromCandidateKey: candidateEdges.map((edge) => edge.fromCandidateKey),
				toCandidateKey: candidateEdges.map((edge) => edge.toCandidateKey),
				analysisLabDistance: candidateEdges.map((edge) => edge.analysisLabDistance),
				nativeWitnessRgbExact: candidateEdges.map((edge) => edge.nativeWitnessRgbExact),
				analysisRgbExact: candidateEdges.map((edge) => edge.analysisRgbExact),
				componentSignatureExact: candidateEdges.map((edge) => edge.componentSignatureExact),
				familyComponentSignatureExact: candidateEdges.map((edge) => edge.familyComponentSignatureExact),
				populationDelta: candidateEdges.map((edge) => edge.populationDelta),
				fieldDeltaBroad: candidateEdges.map((edge) => (edge.fieldDelta as { broad: number }).broad),
				fieldDeltaDetail: candidateEdges.map((edge) => (edge.fieldDelta as { detail: number }).detail),
				fieldDeltaFrame: candidateEdges.map((edge) => (edge.fieldDelta as { frame: number }).frame),
			},
		},
		families: {
			...familyHeader,
			edges: {
				fromFamilyKey: familyEdges.map((edge) => edge.fromFamilyKey),
				toFamilyKey: familyEdges.map((edge) => edge.toFamilyKey),
				anchorAnalysisLabDistance: familyEdges.map((edge) => edge.anchorAnalysisLabDistance),
				anchorNativeWitnessRgbExact: familyEdges.map((edge) => edge.anchorNativeWitnessRgbExact),
				componentSignatureExact: familyEdges.map((edge) => edge.componentSignatureExact),
				memberCountDelta: familyEdges.map((edge) => edge.memberCountDelta),
				populationDelta: familyEdges.map((edge) => edge.populationDelta),
			},
		},
	}
}

export function columnarizeIdentityMatches(matches: ReturnType<typeof directedEvidenceMatches>) {
	return {
		policy: matches.policy,
		referenceToProfile: columnarizeMatchDirection(matches.referenceToProfile),
		profileToReference: columnarizeMatchDirection(matches.profileToReference),
	}
}

function expandColumnarMatchDirection(columnar: ReturnType<typeof columnarizeMatchDirection>) {
	const { edges: candidateEdges, ...candidateHeader } = columnar.candidates
	const { edges: familyEdges, ...familyHeader } = columnar.families
	return {
		candidates: {
			...candidateHeader,
			edges: candidateEdges.fromCandidateKey.map((fromCandidateKey, index) => ({
				fromCandidateKey,
				toCandidateKey: candidateEdges.toCandidateKey[index],
				analysisLabDistance: candidateEdges.analysisLabDistance[index],
				nativeWitnessRgbExact: candidateEdges.nativeWitnessRgbExact[index],
				analysisRgbExact: candidateEdges.analysisRgbExact[index],
				componentSignatureExact: candidateEdges.componentSignatureExact[index],
				familyComponentSignatureExact: candidateEdges.familyComponentSignatureExact[index],
				populationDelta: candidateEdges.populationDelta[index],
				fieldDelta: {
					broad: candidateEdges.fieldDeltaBroad[index],
					detail: candidateEdges.fieldDeltaDetail[index],
					frame: candidateEdges.fieldDeltaFrame[index],
				},
			})),
		},
		families: {
			...familyHeader,
			edges: familyEdges.fromFamilyKey.map((fromFamilyKey, index) => ({
				fromFamilyKey,
				toFamilyKey: familyEdges.toFamilyKey[index],
				anchorAnalysisLabDistance: familyEdges.anchorAnalysisLabDistance[index],
				anchorNativeWitnessRgbExact: familyEdges.anchorNativeWitnessRgbExact[index],
				componentSignatureExact: familyEdges.componentSignatureExact[index],
				memberCountDelta: familyEdges.memberCountDelta[index],
				populationDelta: familyEdges.populationDelta[index],
			})),
		},
	}
}

export function expandColumnarIdentityMatches(columnar: ReturnType<typeof columnarizeIdentityMatches>) {
	return {
		policy: columnar.policy,
		referenceToProfile: expandColumnarMatchDirection(columnar.referenceToProfile),
		profileToReference: expandColumnarMatchDirection(columnar.profileToReference),
	}
}

function columnarizeSourceResult(result: SourceResult) {
	return {
		...result,
		baseline: {
			...result.baseline,
			evidence: columnarizeResolutionEvidence(result.baseline.evidence),
			context: columnarizeExtractorContext(result.baseline.context),
		},
		profiles: result.profiles.map((profile) => ({
			...profile,
			evidence: columnarizeResolutionEvidence(profile.evidence),
			identityMatches: columnarizeIdentityMatches(profile.identityMatches),
			completeExtraction: profile.completeExtraction === null ? null : {
				...profile.completeExtraction,
				context: columnarizeExtractorContext(profile.completeExtraction.context),
			},
		})),
	}
}

function assertFiniteEvidence(frame: ResolutionEvidenceFrame, label: string): void {
	const visit = (value: unknown, path: string): void => {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) throw new Error(`Nonfinite evidence at ${label}.${path}`)
			return
		}
		if (value instanceof Float32Array || value instanceof Float64Array) {
			for (const number of value) if (!Number.isFinite(number)) throw new Error(`Nonfinite evidence at ${label}.${path}`)
			return
		}
		if (ArrayBuffer.isView(value) || value === null || typeof value !== "object") return
		for (const [key, child] of Object.entries(value)) visit(child, path.length === 0 ? key : `${path}.${key}`)
	}
	visit(frame, "")
}

function assertEvidenceStructure(
	frame: ResolutionEvidenceFrame,
	analysis: RawImage,
	native: RawImage,
	label: string,
	expectedIdentity?: ResolutionEvidenceInputIdentity,
): void {
	const total = analysis.width * analysis.height
	const candidatePixels = frame.candidates.pixelCounts.reduce((sum, count) => sum + count, 0)
	const familyPixels = frame.families.pixelCounts.reduce((sum, count) => sum + count, 0)
	const memberCount = frame.families.memberCounts.reduce((sum, count) => sum + count, 0)
	if (frame.width !== analysis.width || frame.height !== analysis.height || frame.nativeWidth !== native.width ||
		frame.nativeHeight !== native.height || frame.pixelBinIds.length !== total || frame.candidateLabels.length !== total ||
		frame.familyLabels.length !== total || candidatePixels !== total || familyPixels !== total ||
		memberCount !== frame.candidates.count) throw new Error(`Structural evidence partition violation for ${label}`)
	if (frame.candidates.analysisRepresentativeNativeExact.some((value) => value !== 0 && value !== 1)) {
		throw new Error(`Candidate exact native-membership violation for ${label}`)
	}
	if (frame.policySha256 !== RESOLUTION_EVIDENCE_POLICY_SHA256 ||
		Object.values(frame.invariants).some((value) => value !== true)) {
		throw new Error(`Evidence policy/invariant violation for ${label}`)
	}
	if (expectedIdentity && (frame.provenance.analysisRasterIdentity !== (expectedIdentity.analysisRasterIdentity ?? null) ||
		frame.provenance.decodedNativeRasterIdentity !== (expectedIdentity.decodedNativeRasterIdentity ?? null) ||
		frame.provenance.rasterPolicyIdentity !== (expectedIdentity.rasterPolicyIdentity ?? null))) {
		throw new Error(`Evidence raster provenance violation for ${label}`)
	}
	for (let candidate = 0; candidate < frame.candidates.count; candidate++) {
		const analysisIndex = frame.candidates.analysisRepresentativeIndices[candidate]
		const nativeIndex = frame.candidates.nativeWitnessIndices[candidate]
		if (analysisIndex < 0 || analysisIndex >= analysis.width * analysis.height ||
			nativeIndex < 0 || nativeIndex >= native.width * native.height) {
			throw new Error(`Evidence representative index violation for ${label}`)
		}
		for (let channel = 0; channel < 3; channel++) {
			if (frame.candidates.analysisRepresentativeRgb[candidate * 3 + channel] !== analysis.data[analysisIndex * 3 + channel] ||
				frame.candidates.nativeWitnessRgb[candidate * 3 + channel] !== native.data[nativeIndex * 3 + channel]) {
				throw new Error(`Evidence representative byte violation for ${label}`)
			}
		}
	}
	if (frame.candidates.familyIds.some((family) => family >= frame.families.count) ||
		frame.graph.nodes !== frame.candidates.count ||
		frame.graph.edges !== frame.candidates.count * Math.max(0, frame.candidates.count - 1) ||
		frame.graph.eligibleNodes !== frame.field.eligibleNodeIds.length ||
		frame.graph.eligibleOrderedEdges !== frame.relations.count ||
		frame.relations.count !== frame.field.eligibleNodeIds.length * Math.max(0, frame.field.eligibleNodeIds.length - 1) ||
		frame.graph.fieldTreatments !== frame.graph.collapsedFieldTreatments + frame.graph.distinctFlatFieldTreatments +
			frame.graph.gradientFieldTreatments) {
		throw new Error(`Graph/treatment structural violation for ${label}`)
	}
	assertFiniteEvidence(frame, label)
}

export function nearestCandidateReconstructionMean(samples: Float32Array, candidates: readonly RGB[]): number {
	if (samples.length === 0 || samples.length % 3 !== 0 || candidates.length === 0) {
		throw new Error("Nearest-color reconstruction requires samples and candidates")
	}
	const candidateLabs = candidates.map(rgbToOKLab)
	let total = 0
	for (let offset = 0; offset < samples.length; offset += 3) {
		let nearest = Infinity
		for (const candidate of candidateLabs) {
			nearest = Math.min(nearest, Math.hypot(
				samples[offset] - candidate[0],
				samples[offset + 1] - candidate[1],
				samples[offset + 2] - candidate[2],
			))
		}
		total += nearest
	}
	const mean = total / (samples.length / 3)
	if (!Number.isFinite(mean)) throw new Error("Nearest-color reconstruction produced a nonfinite mean")
	return mean
}

function profileDistortion(
	nativeRgb: Uint8Array,
	nativeLabs: Float32Array,
	profile: RgbUcharRaster,
	samples: CommonDomainSamples,
): ProfileResult["distortion"] {
	const profileRgb = commonSampleRgb(profile, samples)
	const profileLabs = commonSampleOKLab(profile, samples)
	let oklabTotal = 0
	let maximumOklabDistance = 0
	let absoluteChannelTotal = 0
	let exactRgbSampleCount = 0
	for (let offset = 0; offset < nativeRgb.length; offset += 3) {
		const distance = Math.hypot(
			nativeLabs[offset] - profileLabs[offset],
			nativeLabs[offset + 1] - profileLabs[offset + 1],
			nativeLabs[offset + 2] - profileLabs[offset + 2],
		)
		oklabTotal += distance
		maximumOklabDistance = Math.max(maximumOklabDistance, distance)
		absoluteChannelTotal += Math.abs(nativeRgb[offset] - profileRgb[offset]) +
			Math.abs(nativeRgb[offset + 1] - profileRgb[offset + 1]) +
			Math.abs(nativeRgb[offset + 2] - profileRgb[offset + 2])
		if (nativeRgb[offset] === profileRgb[offset] && nativeRgb[offset + 1] === profileRgb[offset + 1] &&
			nativeRgb[offset + 2] === profileRgb[offset + 2]) exactRgbSampleCount++
	}
	const count = nativeRgb.length / 3
	return {
		meanOklabDistance: oklabTotal / count,
		maximumOklabDistance,
		meanAbsoluteRgbChannelDifference: absoluteChannelTotal / nativeRgb.length,
		exactRgbSampleCount,
		changedRgbSampleCount: count - exactRgbSampleCount,
	}
}

function visiblePaletteSemantics(extraction: ExtractionResult) {
	return Object.fromEntries(Object.entries(extraction.methods).map(([method, palette]) => [method, {
		roles: Object.fromEntries(roleNames.map((role) => [role, {
			rgb: [...palette[role].rgb],
			hex: palette[role].hex,
			generated: palette[role].generated,
		}])),
		gradient: { ...palette.gradient },
	}]))
}

function compareVisibleSemantics(extraction: ExtractionResult, canonical: ExtractionResult) {
	const changedRoles: Record<string, RoleName[]> = {}
	const gradientChangedMethods: string[] = []
	let changedRoleCount = 0
	for (const method of Object.keys(extraction.methods) as Array<keyof ExtractionResult["methods"]>) {
		const changed = roleNames.filter((role) => {
			const first = extraction.methods[method][role]
			const second = canonical.methods[method][role]
			return first.generated !== second.generated || first.rgb.some((channel, index) => channel !== second.rgb[index])
		})
		changedRoles[method] = changed
		changedRoleCount += changed.length
		if (!isDeepStrictEqual(extraction.methods[method].gradient, canonical.methods[method].gradient)) {
			gradientChangedMethods.push(method)
		}
	}
	const visibleSemantics = visiblePaletteSemantics(extraction)
	return {
		visibleSemantics,
		changedRoles,
		changedRoleCount,
		gradientChangedMethods,
		visibleSemanticsChanged: !isDeepStrictEqual(visibleSemantics, visiblePaletteSemantics(canonical)),
	}
}

function canonicalRasterIdentity(decode: CanonicalDecode) {
	const rawSha256 = sha256(decode.data)
	const identity = {
		policy: "research/src/image.ts:loadImage(maxSize=224);rotate;flatten-white;srgb;inside-no-enlarge;lanczos3;rgb-uchar",
		dimensions: { width: decode.width, height: decode.height },
		byteLength: decode.data.length,
		rawSha256,
		runtime: decode.versions,
	}
	return { rawSha256, identitySha256: semanticSha256(identity) }
}

function commonSampleIdentity(samples: CommonDomainSamples, nativeRgb: Uint8Array) {
	const hash = createHash("sha256")
	hash.update(canonicalJson({
		columns: samples.columns,
		rows: samples.rows,
		count: samples.count,
		nativeWidth: samples.native.width,
		nativeHeight: samples.native.height,
	}))
	for (const array of [samples.native.x, samples.native.y, samples.native.indices]) {
		hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
	}
	return {
		columns: samples.columns,
		rows: samples.rows,
		count: samples.count,
		indicesSha256: hash.digest("hex"),
		nativeRgbSha256: sha256(nativeRgb),
	}
}

function addValues(accumulators: Map<string, Accumulator>, metric: string, values: readonly number[]): void {
	let accumulator = accumulators.get(metric)
	if (!accumulator) {
		accumulator = { count: 0, minimum: Infinity, maximum: -Infinity, sum: 0 }
		accumulators.set(metric, accumulator)
	}
	for (const value of values) {
		if (!Number.isFinite(value)) throw new Error(`Nonfinite aggregate metric ${metric}`)
		accumulator.count++
		accumulator.minimum = Math.min(accumulator.minimum, value)
		accumulator.maximum = Math.max(accumulator.maximum, value)
		accumulator.sum += value
	}
}

function finalizeDistributions(accumulators: Map<string, Accumulator>): Record<string, NumericDistribution> {
	return Object.fromEntries([...accumulators.entries()].sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
		.map(([name, value]) => [name, {
			count: value.count,
			minimum: value.count === 0 ? null : value.minimum,
			maximum: value.count === 0 ? null : value.maximum,
			mean: value.count === 0 ? null : value.sum / value.count,
		}]))
}

function makeImage(width: number, height: number, at: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const rgb = at(x, y)
			const offset = (y * width + x) * 3
			data[offset] = rgb[0]
			data[offset + 1] = rgb[1]
			data[offset + 2] = rgb[2]
		}
	}
	return { width, height, data }
}

function cropBorder(image: RawImage, border: number): RawImage {
	const width = image.width - border * 2
	const height = image.height - border * 2
	if (width <= 0 || height <= 0) throw new Error("Crop removes the complete image")
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		const start = ((y + border) * image.width + border) * 3
		data.set(image.data.subarray(start, start + width * 3), y * width * 3)
	}
	return { width, height, data }
}

function rotate90(image: RawImage): RawImage {
	const data = new Uint8Array(image.data.length)
	for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
		const targetX = image.height - 1 - y
		const targetY = x
		data.set(image.data.subarray((y * image.width + x) * 3, (y * image.width + x) * 3 + 3),
			(targetY * image.height + targetX) * 3)
	}
	return { width: image.height, height: image.width, data }
}

function rotate180(image: RawImage): RawImage {
	return rotate90(rotate90(image))
}

function reflectHorizontal(image: RawImage): RawImage {
	const data = new Uint8Array(image.data.length)
	for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
		const source = (y * image.width + x) * 3
		const target = (y * image.width + image.width - 1 - x) * 3
		data.set(image.data.subarray(source, source + 3), target)
	}
	return { ...image, data }
}

function deterministicNoise(image: RawImage): RawImage {
	const data = image.data.slice()
	for (let index = 0; index < data.length; index++) {
		const delta = ((index * 2_654_435_761 + 1_013_904_223) >>> 31) === 0 ? -1 : 1
		data[index] = Math.max(0, Math.min(255, data[index] + delta))
	}
	return { ...image, data }
}

function scale2x(image: RawImage): RawImage {
	const width = image.width * 2
	const height = image.height * 2
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const source = (Math.floor(y / 2) * image.width + Math.floor(x / 2)) * 3
		data.set(image.data.subarray(source, source + 3), (y * width + x) * 3)
	}
	return { width, height, data }
}

function sameRaw(first: RawImage, second: RawImage): boolean {
	return first.width === second.width && first.height === second.height && isDeepStrictEqual(first.data, second.data)
}

export function runControls() {
	const base = makeImage(24, 16, (x, y) => {
		if ((x + y) % 11 === 0) return [240, 222, 72]
		if (x < 8) return [24, 42, 88]
		if (y > 10) return [175, 48, 106]
		return [48, 158, 118]
	})
	const onePixel = cropBorder(base, 1)
	const proportional = cropBorder(base, 2)
	const noiseFirst = deterministicNoise(base)
	const noiseSecond = deterministicNoise(base)
	const doubled = scale2x(base)
	const transformed = {
		onePixelCrop: onePixel,
		proportionalCrop: proportional,
		rotation90: rotate90(base),
		rotation180: rotate180(base),
		horizontalReflection: reflectHorizontal(base),
		deterministicPlusMinusOneNoise: noiseFirst,
		integer2xScale: doubled,
	}
	const deterministicFirst = analyzeTypedEvidence(base, base)
	const deterministicSecond = analyzeTypedEvidence(base, base)
	assertEvidenceStructure(deterministicFirst, base, base, "control.deterministic.first")
	assertEvidenceStructure(deterministicSecond, base, base, "control.deterministic.second")
	const firstHash = compactResolutionEvidence(deterministicFirst).compact.semanticSha256
	const secondHash = compactResolutionEvidence(deterministicSecond).compact.semanticSha256
	if (firstHash !== secondHash) throw new Error("Deterministic evidence rerun control failed")

	const thin = makeImage(48, 32, (_x, y) => y === 15 ? [246, 240, 220] : [15, 19, 28])
	const split = makeImage(32, 32, (x) => x < 16 ? [22, 30, 45] : [228, 188, 92])
	const checker = makeImage(32, 32, (x, y) => (x + y) % 2 === 0 ? [22, 30, 45] : [228, 188, 92])
	const broadRamp = makeImage(48, 32, (x) => {
		const amount = x / 47
		return [Math.round(18 + amount * 212), Math.round(36 + amount * 142), Math.round(76 + amount * 12)]
	})
	const localRamp = makeImage(48, 32, (x, y) => {
		if (x < 12 || x >= 36 || y < 8 || y >= 24) return (x + y) % 2 === 0 ? [25, 180, 80] : [185, 25, 150]
		const amount = (x - 12) / 23
		return [Math.round(18 + amount * 212), Math.round(36 + amount * 142), Math.round(76 + amount * 12)]
	})
	const frameInterior = makeImage(32, 32, (x, y) => {
		if (x === 0 || y === 0 || x === 31 || y === 31) return [225, 55, 42]
		if (x >= 10 && x < 21 && y >= 10 && y < 21) return [45, 190, 105]
		return [28, 31, 38]
	})
	const synthetic = { thin, split, checker, broadRamp, localRamp, frameInterior }
	const observations: Record<string, unknown> = {}
	const frames: Record<string, ResolutionEvidenceFrame> = {}
	for (const [name, image] of Object.entries({ ...transformed, ...synthetic })) {
		const frame = analyzeTypedEvidence(image, image)
		assertEvidenceStructure(frame, image, image, `control.${name}`)
		frames[name] = frame
		observations[name] = {
			dimensions: { width: image.width, height: image.height },
			evidenceSemanticSha256: compactResolutionEvidence(frame).compact.semanticSha256,
			candidateCount: frame.candidates.count,
			familyCount: frame.families.count,
			relationCount: frame.relations.count,
		}
	}
	const splitFrame = frames.split
	const checkerFrame = frames.checker
	const splitHistogram = Array.from(splitFrame.bins.counts).filter(Boolean).sort((first, second) => first - second)
	const checkerHistogram = Array.from(checkerFrame.bins.counts).filter(Boolean).sort((first, second) => first - second)
	const equalHistograms = isDeepStrictEqual(splitHistogram, checkerHistogram)
	const geometryChanged = compactResolutionEvidence(splitFrame).compact.hashes.components !==
		compactResolutionEvidence(checkerFrame).compact.hashes.components
	if (!equalHistograms) throw new Error("Equal-histogram geometry exact control failed")
	const rotation90Exact = sameRaw(rotate90(rotate90(rotate90(rotate90(base)))), base)
	const rotation180Exact = sameRaw(rotate180(rotate180(base)), base)
	const horizontalReflectionExact = sameRaw(reflectHorizontal(reflectHorizontal(base)), base)
	const deterministicNoiseExact = sameRaw(noiseFirst, noiseSecond)
	if (!rotation90Exact || !rotation180Exact || !horizontalReflectionExact || !deterministicNoiseExact) {
		throw new Error("Declared exact transform equivalence failed")
	}
	let integer2xExact = true
	for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
		const source = (y * base.width + x) * 3
		const target = ((y * 2) * doubled.width + x * 2) * 3
		if (!isDeepStrictEqual(doubled.data.subarray(target, target + 3), base.data.subarray(source, source + 3))) {
			integer2xExact = false
		}
	}
	if (!integer2xExact) throw new Error("Integer 2x exact replication control failed")
	for (const unsafe of ["../outside.png", "images/nested/file.png", "other/file.png", "00/../file.png"]) {
		let rejected = false
		try { resolveBoundSourcePath(projectRoot, unsafe) } catch { rejected = true }
		if (!rejected) throw new Error(`Path-safety control accepted ${unsafe}`)
	}
	const thinComponentSupport = Math.max(0, ...frames.thin.candidates.thinComponentSupport)
	const typographySupport = Math.max(0, ...frames.thin.candidates.typographySupport)
	const broadCoverage = Math.max(0, ...frames.broadRamp.relations.coverage)
	const localCoverage = Math.max(0, ...frames.localRamp.relations.coverage)
	const frameOwnership = Math.max(0, ...frames.frameInterior.candidates.borderFrame)
	const interiorOwnership = Math.max(0, ...frames.frameInterior.candidates.interiorOwnership)
	const measured = {
		thinDetails: { thinComponentSupport, typographySupport },
		equalHistogramGeometry: { equalHistograms, geometryChanged },
		broadVersusLocalRamp: {
			broadCoverage,
			localCoverage,
			coverageDelta: broadCoverage - localCoverage,
		},
		frameVersusInterior: {
			frameOwnership,
			interiorOwnership,
			ownershipDelta: frameOwnership - interiorOwnership,
		},
	}
	Object.assign(observations, measured)
	const deterministicRerunPassed = firstHash === secondHash
	const onePixelCropPassed = onePixel.width === base.width - 2 && onePixel.height === base.height - 2
	const proportionalCropPassed = proportional.width === base.width - 4 && proportional.height === base.height - 4
	const thinDetailsPassed = thinComponentSupport > 0 && typographySupport > 0
	const equalHistogramGeometryPassed = equalHistograms && geometryChanged
	const broadVersusLocalRampPassed = broadCoverage > localCoverage
	const frameVersusInteriorPassed = frameOwnership > 0 && interiorOwnership > 0
	return {
		schemaVersion: 1,
		experimentId: MULTI_RESOLUTION_AUDIT_ID,
		gateScope: ["determinism", "finiteness", "source-and-path-safety", "declared-exact-transform-equivalences"],
		visualQualityGates: [],
		allGatesPassed: deterministicRerunPassed && onePixelCropPassed && proportionalCropPassed && rotation90Exact &&
			rotation180Exact && horizontalReflectionExact && deterministicNoiseExact && integer2xExact,
		controls: {
			deterministicRerun: { passed: deterministicRerunPassed, firstSha256: firstHash, secondSha256: secondHash },
			onePixelCrop: { passed: onePixelCropPassed },
			proportionalCrop: { passed: proportionalCropPassed },
			rotation90: { passed: rotation90Exact, exactEquivalence: "four rotations equal source bytes" },
			rotation180: { passed: rotation180Exact, exactEquivalence: "two rotations equal source bytes" },
			horizontalReflection: { passed: horizontalReflectionExact, exactEquivalence: "two reflections equal source bytes" },
			deterministicPlusMinusOneNoise: { passed: deterministicNoiseExact, exactEquivalence: "same index policy equals same bytes" },
			integer2xScale: { passed: integer2xExact, exactEquivalence: "each source pixel is one exact 2x2 block" },
			thinDetails: { passed: thinDetailsPassed, qualityGate: false, ...measured.thinDetails },
			equalHistogramGeometry: {
				passed: equalHistogramGeometryPassed,
				exactEquivalence: "nonzero bin populations are equal",
				...measured.equalHistogramGeometry,
			},
			broadVersusLocalRamp: { passed: broadVersusLocalRampPassed, qualityGate: false, ...measured.broadVersusLocalRamp },
			frameVersusInterior: { passed: frameVersusInteriorPassed, qualityGate: false, ...measured.frameVersusInterior },
			pathSafety: { passed: true, allowedRoots: ["images", "00"], directChildrenOnly: true },
		},
		observations,
	}
}

export function buildMultiResolutionAuditProtocol() {
	const identity = {
		schemaVersion: 1,
		experimentId: MULTI_RESOLUTION_AUDIT_ID,
		artifactSchema: MULTI_RESOLUTION_AUDIT_SCHEMA,
		canonicalLane: {
			algorithmVersion: ALGORITHM_VERSION,
			sharpVersion: "0.33.5",
			childProtocolVersion: CANONICAL_CHILD_PROTOCOL_VERSION,
			decode: "research/src/image.ts loadImage maxSize 224",
			comparison: "deep exact after normalizing only diagnostics.processingMs to zero",
			evidenceReferenceId: referenceEvidenceId,
			promotionCertificates: PROMOTION_CERTIFICATE_REFERENCES,
			normalizedImageIdentity: "SHA256(UTF8(width+'x'+height+':')||RGB-bytes)",
		},
		artifactOutput: {
			protocolVersion: OUTPUT_CHILD_PROTOCOL_VERSION,
			processIsolation: "separate-from-canonical-decode-and-modern-analysis",
			helpers: ["beginExperimentOutput", "publishExperimentOutput", "preserveFailedExperiment", "releaseExperimentOutput"],
			appendOnly: true,
			detailedResults: {
				indexPath: "results.json",
				shardDirectory: "results/",
				shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
				columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
				columnSchema: RESULT_COLUMN_SCHEMA,
				shardPolicy: "one-source-per-compact-canonical-json-shard",
				maximumShardBytes: MAX_RESULT_SHARD_BYTES,
				orderedRootVersion: RESULT_SHARD_MERKLE_VERSION,
				wholeMatrixSerialization: false,
			},
		},
		modernLane: {
			profileVersion: RESOLUTION_PROFILE_VERSION,
			evidenceVersion: RESOLUTION_EVIDENCE_VERSION,
			evidencePolicyVersion: RESOLUTION_EVIDENCE_POLICY_VERSION,
			evidencePolicySha256: RESOLUTION_EVIDENCE_POLICY_SHA256,
			profiles: RESOLUTION_PROFILES,
			completeExtractorProfileIds: [...completeExtractorProfileIds],
			referenceEvidenceId,
			decodeNativeOnce: true,
			sequentialSourcesAndProfiles: true,
		},
		matrix: { development: DEVELOPMENT_SOURCE_COUNT, holdout00: HOLDOUT_SOURCE_COUNT, total: FULL_SOURCE_COUNT, profiles: 11 },
		comparisons: evidenceComparisonNames,
		reconstruction: {
			domain: "shared-native-common-domain-center-sample",
			means: [
				"extractorCandidateMeanOklabDistance",
				"analysisRepresentativeMeanOklabDistance",
				"nativeWitnessMeanOklabDistance",
			],
			scalarQualityScore: false,
		},
		candidateIdentityMatching: {
			directions: ["baseline-to-profile", "profile-to-baseline"],
			maximumAnalysisLabDistance: 0.055,
			exactNativeRgbEquality: true,
			componentAndFamilySignatures: true,
			scalarScore: false,
		},
		implementationIdentity: {
			method: "recursive-local-static-import-closure-v1",
			roots: implementationRoots,
			extras: implementationExtras,
			unresolvedLocalImports: "hard-stop",
		},
		controls: [
			"deterministic-rerun", "one-pixel-crop", "proportional-crop", "rotation-90", "rotation-180",
			"horizontal-reflection", "deterministic-plus-minus-one-noise", "integer-2x-scale", "thin-details",
			"equal-histogram-geometry", "broad-versus-local-ramp", "frame-versus-interior",
		],
		controlGateScope: ["determinism", "finiteness", "source-and-path-safety", "declared-exact-transform-equivalences"],
		hardStops: ["baseline-mismatch", "nondeterminism", "nonfinite-evidence", "structural-or-provenance-issue", "incomplete-matrix"],
		review: { cap: REVIEW_CAP, authorized: false },
		disposition: "diagnostic-only-no-selection-no-review-no-promotion",
		defaultExecution: { completeRoster: true, publishAppendOnly: true },
		limitSemantics: "execution-only dry-run coverage; does not alter this scientific full-run protocol",
	}
	return { ...identity, protocolId: semanticSha256(identity) }
}

function localStaticImportSpecifiers(source: string): string[] {
	const specifiers: string[] = []
	const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g
	for (const match of source.matchAll(pattern)) if (match[1].startsWith(".")) specifiers.push(match[1])
	return specifiers
}

async function requireImplementationFile(path: string, label: string): Promise<void> {
	let metadata
	try {
		metadata = await lstat(path)
	} catch (error) {
		throw new Error(`Unresolved local implementation import ${label}`, { cause: error })
	}
	if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Implementation dependency is not a regular file: ${label}`)
}

async function resolveLocalImplementationImport(importer: string, specifier: string, root: string): Promise<string> {
	const unresolved = resolve(dirname(importer), specifier)
	const candidates = specifier.endsWith(".ts") || specifier.endsWith(".json")
		? [unresolved]
		: [`${unresolved}.ts`, `${unresolved}.d.ts`, join(unresolved, "index.ts")]
	for (const candidate of candidates) {
		try {
			await requireImplementationFile(candidate, `${importer} -> ${specifier}`)
			const relative = candidate.slice(root.length + 1)
			if (candidate === root || !candidate.startsWith(`${root}/`) || relative.startsWith("../")) {
				throw new Error(`Local implementation import escaped the project root: ${importer} -> ${specifier}`)
			}
			return relative
		} catch (error) {
			if (candidate === candidates[candidates.length - 1]) throw error
		}
	}
	throw new Error(`Unresolved local implementation import ${importer} -> ${specifier}`)
}

export async function discoverImplementationClosure(
	root = projectRoot,
	roots: readonly string[] = implementationRoots,
	extras: readonly string[] = implementationExtras,
): Promise<string[]> {
	const normalizedRoot = resolve(root)
	const queue: string[] = [...roots, ...extras.filter((file) => file.endsWith(".ts"))]
	const visited = new Set<string>()
	while (queue.length > 0) {
		const file = queue.shift()!
		if (visited.has(file)) continue
		const absolute = join(normalizedRoot, file)
		await requireImplementationFile(absolute, file)
		visited.add(file)
		const source = await readFile(absolute, "utf8")
		for (const specifier of localStaticImportSpecifiers(source)) {
			const dependency = await resolveLocalImplementationImport(absolute, specifier, normalizedRoot)
			if (!visited.has(dependency)) queue.push(dependency)
		}
	}
	for (const extra of extras) {
		await requireImplementationFile(join(normalizedRoot, extra), extra)
		visited.add(extra)
	}
	return [...visited].sort()
}

async function hashImplementations(): Promise<Record<string, string>> {
	const files = await discoverImplementationClosure(projectRoot)
	return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(join(projectRoot, file)))])))
}

async function evaluateProfile(
	profile: typeof RESOLUTION_PROFILES[number],
	native: DecodedNativeRaster,
	samples: CommonDomainSamples,
	nativeRgb: Uint8Array,
	nativeLabs: Float32Array,
	nativeRgbOccupancy: Uint32Array,
	canonicalImage: RgbUcharRaster,
	canonical: ExtractionResult,
	referenceEvidence: EvidenceCompact,
): Promise<{ result: ProfileResult; metrics: Record<string, number[]> }> {
	const raster = await renderResolutionProfile(native, profile)
	const evidenceIdentity: ResolutionEvidenceInputIdentity = {
		analysisRasterIdentity: raster.identity.sha256,
		decodedNativeRasterIdentity: native.identity.sha256,
		rasterPolicyIdentity: semanticSha256(raster.identity.policy),
	}
	const evidence = analyzeTypedEvidence(raster, native, evidenceIdentity)
	assertEvidenceStructure(evidence, raster, native, profile.id, evidenceIdentity)
	const evidenceBuild = compactResolutionEvidence(evidence)
	const analysisCandidates = resolutionEvidenceCandidatePalette(evidence, "analysis")
	const nativeWitnessCandidates = resolutionEvidenceCandidatePalette(evidence, "native-witness")
	const distortion = profileDistortion(nativeRgb, nativeLabs, raster, samples)
	let completeExtraction: ProfileResult["completeExtraction"] = null
	if (completeExtractorProfileIds.has(profile.id)) {
		const extractionContext = extractPaletteWithContext(raster)
		const extraction = extractionContext.extraction
		if (extraction.version !== ALGORITHM_VERSION || extraction.width !== raster.width || extraction.height !== raster.height) {
			throw new Error(`Complete extractor structural mismatch for ${profile.id}`)
		}
		const normalized = scientificExtraction(extraction)
		const comparison = compareVisibleSemantics(normalized, scientificExtraction(canonical))
		completeExtraction = {
			semanticSha256: semanticSha256(normalized),
			context: compactExtractorContext(extractionContext, nativeRgbOccupancy),
			...comparison,
		}
	}
	const canonicalRasterExactMatch = profile.id === "max-edge-224-lanczos3"
		? raster.width === canonicalImage.width && raster.height === canonicalImage.height &&
			isDeepStrictEqual(raster.data, canonicalImage.data)
		: null
	const result: ProfileResult = {
		profileId: profile.id,
		dimensions: { width: raster.width, height: raster.height },
		raster: { rawSha256: sha256(raster.data), identitySha256: raster.identity.sha256 },
		distortion,
		reconstruction: {
			analysisRepresentativeMeanOklabDistance: nearestCandidateReconstructionMean(nativeLabs, analysisCandidates),
			nativeWitnessMeanOklabDistance: nearestCandidateReconstructionMean(nativeLabs, nativeWitnessCandidates),
		},
		evidence: evidenceBuild.compact,
		changesFromReference: evidenceComparisonNames.filter((name) =>
			evidenceBuild.compact.hashes[name] !== referenceEvidence.hashes[name]),
		identityMatches: directedEvidenceMatches(referenceEvidence, evidenceBuild.compact),
		canonicalRasterExactMatch,
		completeExtraction,
	}
	return {
		result,
		metrics: {
			...evidenceBuild.metrics,
			rasterMeanOklabDistortion: [distortion.meanOklabDistance],
			rasterMaximumOklabDistortion: [distortion.maximumOklabDistance],
			rasterMeanAbsoluteRgbChannelDifference: [distortion.meanAbsoluteRgbChannelDifference],
			exactRgbSampleCount: [distortion.exactRgbSampleCount],
			analysisRepresentativeMeanOklabReconstruction: [result.reconstruction.analysisRepresentativeMeanOklabDistance],
			nativeWitnessMeanOklabReconstruction: [result.reconstruction.nativeWitnessMeanOklabDistance],
			extractorExactNativePresenceCount: [completeExtraction?.context.exactNativePresenceCount ?? 0],
		},
	}
}

async function evaluateSource(
	task: BoundRosterEntry,
	roots: AllowedSourceRoots,
	child: CanonicalRasterChild,
	promotionCertificates: Record<"development" | "00", PromotionCertificateBinding>,
	canonicalRuntime: { value: Record<string, string> | null },
	profileAccumulators: Map<string, Map<string, Accumulator>>,
	changeCounts: Map<string, Record<EvidenceComparisonName, number>>,
): Promise<{ result: SourceResult; certificateBase: Omit<SourceCertificate, "canonicalRuntimeSha256" | "modernRuntimeSha256" | "identitySha256"> }> {
	const sourceBytes = await readBoundSource(roots, task.sourceRelativePath)
	if (sourceBytes.byteLength !== task.sourceBytes || sha256(sourceBytes) !== task.sourceSha256) {
		throw new Error(`Bound source bytes changed for ${task.file}`)
	}
	const canonicalDecode = await child.decode(task.sourceRelativePath)
	if (canonicalDecode.sourceSha256 !== task.sourceSha256) throw new Error(`Canonical child source binding mismatch for ${task.file}`)
	if (canonicalDecode.versions.sharp !== "0.33.5") {
		throw new Error(`Canonical child must use Sharp 0.33.5; received ${String(canonicalDecode.versions.sharp)}`)
	}
	if (canonicalRuntime.value === null) canonicalRuntime.value = canonicalDecode.versions
	else if (!isDeepStrictEqual(canonicalRuntime.value, canonicalDecode.versions)) {
		throw new Error("Canonical child runtime changed within the audit")
	}
	if (canonicalDecode.width !== task.frozen.width || canonicalDecode.height !== task.frozen.height) {
		throw new Error(`Canonical raster dimensions changed for ${task.file}`)
	}
	const canonicalImage: RgbUcharRaster = {
		width: canonicalDecode.width,
		height: canonicalDecode.height,
		channels: 3,
		depth: "uchar",
		colorSpace: "srgb",
		data: canonicalDecode.data,
	}
	const promotionCertificate = promotionCertificates[task.cohort]
	const promotionEntry = promotionCertificate.entries[task.file]
	if (!promotionEntry) throw new Error(`Promotion certificate is missing ${task.file}`)
	const computedNormalizedImageSha256 = normalizedImageSha256(canonicalImage)
	if (computedNormalizedImageSha256 !== promotionEntry.normalizedImageSha256) {
		throw new Error(`Promotion-bound canonical raster identity mismatch for ${task.file}`)
	}
	const canonicalContext = extractPaletteWithContext(canonicalImage)
	const canonicalExtraction = canonicalContext.extraction
	const normalizedCanonical = scientificExtraction(canonicalExtraction)
	const normalizedFrozen = scientificExtraction(task.frozen.extraction)
	if (!isDeepStrictEqual(normalizedCanonical, normalizedFrozen)) {
		throw new Error(`Exact canonical baseline mismatch for ${task.file}`)
	}
	const canonicalRaster = canonicalRasterIdentity(canonicalDecode)
	const canonicalExtractionSemanticSha256 = semanticSha256(normalizedCanonical)
	const frozenExtractionSemanticSha256 = semanticSha256(normalizedFrozen)

	const native = await decodeNativeRaster(sourceBytes)
	const samples = createCommonDomainSamples(native)
	const nativeRgb = commonSampleRgb(native, samples)
	const nativeLabs = commonSampleOKLab(native, samples)
	const nativeRgbOccupancy = createNativeRgbOccupancy(native)
	const commonSample = commonSampleIdentity(samples, nativeRgb)
	const canonicalEvidenceIdentity: ResolutionEvidenceInputIdentity = {
		analysisRasterIdentity: canonicalRaster.identitySha256,
		decodedNativeRasterIdentity: native.identity.sha256,
		rasterPolicyIdentity: semanticSha256({
			referenceEvidenceId,
			decode: "research/src/image.ts loadImage maxSize 224",
		}),
	}
	const canonicalEvidenceFrame = analyzeTypedEvidence(canonicalImage, native, canonicalEvidenceIdentity)
	assertEvidenceStructure(canonicalEvidenceFrame, canonicalImage, native, referenceEvidenceId, canonicalEvidenceIdentity)
	const canonicalEvidenceBuild = compactResolutionEvidence(canonicalEvidenceFrame)
	const extractorCandidateMeanOklabDistance = nearestCandidateReconstructionMean(
		nativeLabs,
		canonicalContext.candidates.map((candidate) => candidate.rgb),
	)
	const analysisRepresentativeMeanOklabDistance = nearestCandidateReconstructionMean(
		nativeLabs,
		resolutionEvidenceCandidatePalette(canonicalEvidenceFrame, "analysis"),
	)
	const nativeWitnessMeanOklabDistance = nearestCandidateReconstructionMean(
		nativeLabs,
		resolutionEvidenceCandidatePalette(canonicalEvidenceFrame, "native-witness"),
	)
	const canonicalDistortion = profileDistortion(nativeRgb, nativeLabs, canonicalImage, samples)
	const canonicalExtractorContext = compactExtractorContext(canonicalContext, nativeRgbOccupancy)
	const profileBuilds: Array<{ result: ProfileResult; metrics: Record<string, number[]> }> = []
	for (const profile of RESOLUTION_PROFILES) {
		profileBuilds.push(await evaluateProfile(
			profile,
			native,
			samples,
			nativeRgb,
			nativeLabs,
			nativeRgbOccupancy,
			canonicalImage,
			normalizedCanonical,
			canonicalEvidenceBuild.compact,
		))
	}
	if (profileBuilds.length !== RESOLUTION_PROFILES.length) throw new Error(`Incomplete profile matrix for ${task.file}`)
	for (const build of profileBuilds) {
		const profileChanges = changeCounts.get(build.result.profileId)
		if (!profileChanges) throw new Error(`Missing change accumulator for ${build.result.profileId}`)
		for (const name of build.result.changesFromReference) profileChanges[name]++
		const accumulators = profileAccumulators.get(build.result.profileId)
		if (!accumulators) throw new Error(`Missing profile accumulator for ${build.result.profileId}`)
		for (const [metric, values] of Object.entries(build.metrics)) addValues(accumulators, metric, values)
		addValues(accumulators, "extractorCandidateMeanOklabReconstruction", [extractorCandidateMeanOklabDistance])
		addValues(accumulators, "referenceAnalysisRepresentativeMeanOklabReconstruction",
			[analysisRepresentativeMeanOklabDistance])
		addValues(accumulators, "referenceNativeWitnessMeanOklabReconstruction", [nativeWitnessMeanOklabDistance])
	}
	const modern224 = profileBuilds.find((build) => build.result.profileId === "max-edge-224-lanczos3")
	if (!modern224 || modern224.result.canonicalRasterExactMatch === null) {
		throw new Error(`Modern 224 raster diagnostic is missing for ${task.file}`)
	}
	const result: SourceResult = {
		cohort: task.cohort,
		file: task.file,
		source: { relativePath: task.sourceRelativePath, bytes: task.sourceBytes, sha256: task.sourceSha256 },
		baseline: {
			exactReproduction: true,
			promotionCertificate: {
				path: promotionCertificate.path,
				rawSha256: promotionCertificate.rawSha256,
				normalizedImageSha256: promotionEntry.normalizedImageSha256,
				computedNormalizedImageSha256,
				exactRasterIdentity: true,
			},
			frozenExtractionSemanticSha256,
			canonicalExtractionSemanticSha256,
			canonicalRaster: { width: canonicalImage.width, height: canonicalImage.height, ...canonicalRaster },
			evidence: canonicalEvidenceBuild.compact,
			distortion: canonicalDistortion,
			reconstruction: {
				extractorCandidateMeanOklabDistance,
				analysisRepresentativeMeanOklabDistance,
				nativeWitnessMeanOklabDistance,
			},
			context: canonicalExtractorContext,
		},
		modernNative: {
			width: native.width,
			height: native.height,
			rawSha256: sha256(native.data),
			identitySha256: native.identity.sha256,
		},
		commonSample,
		modernMaxEdge224Lanczos3CanonicalRasterExactMatch: modern224.result.canonicalRasterExactMatch,
		profiles: profileBuilds.map((build) => build.result),
		structuralViolations: [],
	}
	return {
		result,
		certificateBase: {
			cohort: task.cohort,
			file: task.file,
			sourceSha256: task.sourceSha256,
			canonicalRasterIdentitySha256: canonicalRaster.identitySha256,
			canonicalRasterDimensions: { width: canonicalImage.width, height: canonicalImage.height },
			canonicalExtractionSemanticSha256,
			canonicalEvidenceSemanticSha256: canonicalEvidenceBuild.compact.semanticSha256,
			promotionCertificateRawSha256: promotionCertificate.rawSha256,
			promotionNormalizedImageSha256: promotionEntry.normalizedImageSha256,
			modernNativeIdentitySha256: native.identity.sha256,
			modernNativeDimensions: { width: native.width, height: native.height },
			commonSampleIndicesSha256: commonSample.indicesSha256,
			commonSampleNativeRgbSha256: commonSample.nativeRgbSha256,
			profiles: result.profiles.map((profile) => ({
				profileId: profile.profileId,
				rasterIdentitySha256: profile.raster.identitySha256,
				dimensions: profile.dimensions,
				typedEvidenceSemanticSha256: profile.evidence.semanticSha256,
				completeExtractionSemanticSha256: profile.completeExtraction?.semanticSha256 ?? null,
			})),
		},
	}
}

async function writeCanonicalJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(canonicalValue(value), null, 2)}\n`, { flag: "wx" })
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

export function assertResultShardSize(bytes: string | Uint8Array): number {
	const size = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength
	if (size > MAX_RESULT_SHARD_BYTES) {
		throw new Error(`Result shard exceeds ${MAX_RESULT_SHARD_BYTES} bytes: ${size}`)
	}
	return size
}

async function writeCompactCanonicalJson(path: string, value: unknown): Promise<{
	rawSha256: string
	semanticSha256: string
	bytes: number
}> {
	const canonical = canonicalJson(value)
	const serialized = `${canonical}\n`
	const bytes = assertResultShardSize(serialized)
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, serialized, { flag: "wx" })
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
	return { rawSha256: sha256(serialized), semanticSha256: sha256(canonical), bytes }
}

function resultShardMerkleLeaf(record: ResultShardRecord): string {
	return createHash("sha256")
		.update(`${RESULT_SHARD_MERKLE_VERSION}:leaf\0`, "utf8")
		.update(canonicalJson(record), "utf8")
		.digest("hex")
}

export function orderedResultShardMerkleRoot(records: readonly ResultShardRecord[]): string {
	if (records.length === 0) throw new Error("Ordered result shard Merkle root requires at least one shard")
	let level = records.map(resultShardMerkleLeaf)
	while (level.length > 1) {
		const next: string[] = []
		for (let index = 0; index < level.length; index += 2) {
			const left = level[index]
			const right = level[index + 1] ?? left
			next.push(createHash("sha256")
				.update(`${RESULT_SHARD_MERKLE_VERSION}:node\0`, "utf8")
				.update(Buffer.from(left, "hex"))
				.update(Buffer.from(right, "hex"))
				.digest("hex"))
		}
		level = next
	}
	return level[0]
}

function sourceEntryKey(result: Pick<SourceResult, "cohort" | "file">): ResultSourceEntryKey {
	return { cohort: result.cohort, file: result.file }
}

async function writeSourceResultShard(
	stagingDirectory: string,
	protocolId: string,
	shardIndex: number,
	result: SourceResult,
): Promise<ResultShardRecord> {
	const sourceEntryKeys = [sourceEntryKey(result)]
	const path = `results/source-${String(shardIndex).padStart(4, "0")}.json`
	const shard = {
		schemaVersion: 1,
		shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
		columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
		experimentId: MULTI_RESOLUTION_AUDIT_ID,
		protocolId,
		shardIndex,
		sourceStartIndex: shardIndex,
		sourceEndIndexExclusive: shardIndex + 1,
		sourceCount: 1,
		sourceEntryKeys,
		entry: columnarizeSourceResult(result),
	}
	const hashes = await writeCompactCanonicalJson(join(stagingDirectory, path), shard)
	return {
		path,
		shardIndex,
		sourceStartIndex: shardIndex,
		sourceEndIndexExclusive: shardIndex + 1,
		sourceCount: 1,
		...hashes,
		sourceEntryKeys,
	}
}

export async function validateShardedResultsIndex(
	stagingDirectory: string,
	index: ShardedResultsIndex,
): Promise<{ totalBytes: number; maximumShardBytes: number }> {
	if (index.schemaVersion !== 1 || index.experimentId !== MULTI_RESOLUTION_AUDIT_ID ||
		index.shardSchemaVersion !== RESULT_SHARD_SCHEMA_VERSION ||
		index.columnSchemaVersion !== RESULT_COLUMN_SCHEMA_VERSION ||
		!isDeepStrictEqual(index.columnSchema, RESULT_COLUMN_SCHEMA) ||
		index.executionSourceCount !== index.shards.length || index.executionSourceCount <= 0) {
		throw new Error("Sharded results index header/count is invalid")
	}
	const expectedPaths = index.shards.map((record) => record.path)
	if (new Set(expectedPaths).size !== expectedPaths.length || expectedPaths.some((path, shardIndex) =>
		path !== `results/source-${String(shardIndex).padStart(4, "0")}.json`)) {
		throw new Error("Sharded results paths are not unique canonical ordered paths")
	}
	const directoryEntries = await readdir(join(stagingDirectory, "results"), { withFileTypes: true })
	const actualPaths = directoryEntries.map((entry) => `results/${entry.name}`).sort()
	if (directoryEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
		!isDeepStrictEqual(actualPaths, [...expectedPaths].sort())) {
		throw new Error("Sharded results directory has missing, extra, or non-regular files")
	}
	let expectedSourceIndex = 0
	let totalBytes = 0
	let maximumShardBytes = 0
	for (const [shardIndex, record] of index.shards.entries()) {
		if (record.shardIndex !== shardIndex || record.sourceStartIndex !== expectedSourceIndex ||
			record.sourceEndIndexExclusive !== record.sourceStartIndex + record.sourceCount ||
			record.sourceCount !== record.sourceEntryKeys.length || record.sourceCount !== 1) {
			throw new Error(`Result shard ${shardIndex} has incomplete or unordered source coverage`)
		}
		expectedSourceIndex = record.sourceEndIndexExclusive
		const bytes = await readFile(join(stagingDirectory, record.path))
		assertResultShardSize(bytes)
		if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.rawSha256) {
			throw new Error(`Result shard ${shardIndex} raw identity changed`)
		}
		let shard: unknown
		try {
			shard = JSON.parse(bytes.toString("utf8")) as unknown
		} catch (error) {
			throw new Error(`Result shard ${shardIndex} is invalid JSON`, { cause: error })
		}
		const compactBytes = `${canonicalJson(shard)}\n`
		if (compactBytes !== bytes.toString("utf8") || semanticSha256(shard) !== record.semanticSha256) {
			throw new Error(`Result shard ${shardIndex} is not compact canonical JSON or changed semantically`)
		}
		if (!isRecord(shard) || shard.schemaVersion !== 1 || shard.shardSchemaVersion !== RESULT_SHARD_SCHEMA_VERSION ||
			shard.columnSchemaVersion !== RESULT_COLUMN_SCHEMA_VERSION || shard.experimentId !== index.experimentId ||
			shard.protocolId !== index.protocolId || shard.shardIndex !== record.shardIndex ||
			shard.sourceStartIndex !== record.sourceStartIndex ||
			shard.sourceEndIndexExclusive !== record.sourceEndIndexExclusive || shard.sourceCount !== record.sourceCount ||
			!isDeepStrictEqual(shard.sourceEntryKeys, record.sourceEntryKeys) || !isRecord(shard.entry) ||
			shard.entry.cohort !== record.sourceEntryKeys[0].cohort || shard.entry.file !== record.sourceEntryKeys[0].file) {
			throw new Error(`Result shard ${shardIndex} content does not match its index record`)
		}
		totalBytes += bytes.byteLength
		maximumShardBytes = Math.max(maximumShardBytes, bytes.byteLength)
	}
	if (expectedSourceIndex !== index.executionSourceCount ||
		orderedResultShardMerkleRoot(index.shards) !== index.orderedShardMerkleRootSha256) {
		throw new Error("Sharded results coverage or ordered Merkle root is invalid")
	}
	return { totalBytes, maximumShardBytes }
}

type CompleteExtractionAccumulator = {
	sourceChangedCount: number
	semanticChangedCount: number
	changedRoleCount: number
	changedRoles: Record<string, number>
	gradientChangedMethods: Record<string, number>
}

function createCompleteExtractionAccumulators(): Map<string, CompleteExtractionAccumulator> {
	return new Map([...completeExtractorProfileIds].map((profileId) => [profileId, {
		sourceChangedCount: 0,
		semanticChangedCount: 0,
		changedRoleCount: 0,
		changedRoles: {},
		gradientChangedMethods: {},
	}]))
}

function addCompleteExtractionAnalysis(
	accumulators: Map<string, CompleteExtractionAccumulator>,
	result: SourceResult,
): void {
	for (const profileId of completeExtractorProfileIds) {
		const profile = result.profiles.find((candidate) => candidate.profileId === profileId)
		if (!profile?.completeExtraction) throw new Error(`Missing complete extraction ${profileId} for ${result.file}`)
		const accumulator = accumulators.get(profileId)!
		const complete = profile.completeExtraction
		if (complete.visibleSemanticsChanged) accumulator.sourceChangedCount++
		if (complete.semanticSha256 !== result.baseline.canonicalExtractionSemanticSha256) accumulator.semanticChangedCount++
		accumulator.changedRoleCount += complete.changedRoleCount
		for (const [method, roles] of Object.entries(complete.changedRoles)) for (const role of roles) {
			const key = `${method}.${role}`
			accumulator.changedRoles[key] = (accumulator.changedRoles[key] ?? 0) + 1
		}
		for (const method of complete.gradientChangedMethods) {
			accumulator.gradientChangedMethods[method] = (accumulator.gradientChangedMethods[method] ?? 0) + 1
		}
	}
}

function finalizeCompleteExtractionAnalysis(accumulators: Map<string, CompleteExtractionAccumulator>) {
	return Object.fromEntries([...completeExtractorProfileIds].map((profileId) => [profileId, {
		...accumulators.get(profileId)!,
		diagnosticOnly: true,
	}]))
}

async function readCanonicalInputs() {
	const developmentPath = join(researchRoot, "data", "results.json")
	const holdoutPath = join(researchRoot, "data", "holdout-results.json")
	const [developmentBytes, holdoutBytes] = await Promise.all([readFile(developmentPath), readFile(holdoutPath)])
	let development: unknown
	let holdout: unknown
	try {
		development = JSON.parse(developmentBytes.toString("utf8")) as unknown
		holdout = JSON.parse(holdoutBytes.toString("utf8")) as unknown
	} catch (error) {
		throw new Error("Canonical artifact JSON is invalid", { cause: error })
	}
	return {
		development,
		holdout,
		artifacts: {
			development: { path: "research/data/results.json", entries: DEVELOPMENT_SOURCE_COUNT, rawSha256: sha256(developmentBytes) },
			holdout00: { path: "research/data/holdout-results.json", entries: HOLDOUT_SOURCE_COUNT, rawSha256: sha256(holdoutBytes) },
		},
	}
}

async function readPromotionCertificates(tasks: readonly RosterTask[]): Promise<Record<"development" | "00", PromotionCertificateBinding>> {
	const [developmentBytes, holdoutBytes] = await Promise.all([
		readFile(join(projectRoot, PROMOTION_CERTIFICATE_REFERENCES.development.path)),
		readFile(join(projectRoot, PROMOTION_CERTIFICATE_REFERENCES.holdout00.path)),
	])
	return {
		development: parsePromotionCertificateArtifact(
			developmentBytes,
			"development",
			tasks.filter((task) => task.cohort === "development").map((task) => task.file),
		),
		"00": parsePromotionCertificateArtifact(
			holdoutBytes,
			"00",
			tasks.filter((task) => task.cohort === "00").map((task) => task.file),
		),
	}
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function runAudit(arguments_: AuditArguments): Promise<string> {
	let attempt: RemoteExperimentOutputAttempt | undefined
	let child: CanonicalRasterChild | undefined
	let outputChild: ExperimentOutputChild | undefined
	let moved = false
	try {
		outputChild = new ExperimentOutputChild(researchRoot)
		attempt = await outputChild.beginOutput(outputArgument)
		await mkdir(join(attempt.stagingDirectory, "results"))
		const protocol = buildMultiResolutionAuditProtocol()
		await writeCanonicalJson(join(attempt.stagingDirectory, "protocol.json"), protocol)
		const canonicalInputs = await readCanonicalInputs()
		const tasks = deriveCanonicalRoster(canonicalInputs.development, canonicalInputs.holdout)
		const promotionCertificates = await readPromotionCertificates(tasks)
		const roots = await requireAllowedSourceRoots(projectRoot)
		const completeRoster = await bindCompleteSourceRoster(tasks, roots)
		const rosterIdentityEntries = completeRoster.map((entry) => ({
			cohort: entry.cohort,
			artifactIndex: entry.artifactIndex,
			file: entry.file,
			relativePath: entry.sourceRelativePath,
			bytes: entry.sourceBytes,
			sha256: entry.sourceSha256,
		}))
		const sourceRosterSha256 = semanticSha256(rosterIdentityEntries)
		const implementationHashes = await hashImplementations()
		const controls = runControls()
		const selected = completeRoster.slice(0, arguments_.limit ?? FULL_SOURCE_COUNT)
		const profileAccumulators = new Map(RESOLUTION_PROFILES.map((profile) => [profile.id, new Map<string, Accumulator>()]))
		const changeCounts = new Map(RESOLUTION_PROFILES.map((profile) => [profile.id,
			Object.fromEntries(evidenceComparisonNames.map((name) => [name, 0])) as Record<EvidenceComparisonName, number>,
		]))
		const resultShards: ResultShardRecord[] = []
		const completeExtractionAccumulators = createCompleteExtractionAccumulators()
		const certificateBases: Array<Omit<SourceCertificate, "canonicalRuntimeSha256" | "modernRuntimeSha256" | "identitySha256">> = []
		const canonicalRuntime: { value: Record<string, string> | null } = { value: null }
		child = new CanonicalRasterChild(projectRoot)
		for (const [index, task] of selected.entries()) {
			const evaluated = await evaluateSource(
				task,
				roots,
				child,
				promotionCertificates,
				canonicalRuntime,
				profileAccumulators,
				changeCounts,
			)
			if (evaluated.result.profiles.length !== RESOLUTION_PROFILES.length ||
				evaluated.result.profiles.some((profile, profileIndex) => profile.profileId !== RESOLUTION_PROFILES[profileIndex].id)) {
				throw new Error(`Incomplete source/profile matrix for ${task.file}`)
			}
			addCompleteExtractionAnalysis(completeExtractionAccumulators, evaluated.result)
			resultShards.push(await writeSourceResultShard(
				attempt.stagingDirectory,
				protocol.protocolId,
				index,
				evaluated.result,
			))
			certificateBases.push(evaluated.certificateBase)
			process.stderr.write(`[${index + 1}/${selected.length}] ${task.sourceRelativePath}\n`)
		}
		await child.close()
		child = undefined
		if (!canonicalRuntime.value) throw new Error("Canonical runtime was not observed")
		const expectedSources = arguments_.limit ?? FULL_SOURCE_COUNT
		if (resultShards.length !== expectedSources || certificateBases.length !== expectedSources) {
			throw new Error("Incomplete source/profile matrix")
		}
		if (arguments_.limit === null && resultShards.length !== FULL_SOURCE_COUNT) throw new Error("Full audit matrix is incomplete")
		const canonicalRuntimeSha256 = semanticSha256(canonicalRuntime.value)
		const modernRuntimeSha256 = semanticSha256(MODERN_RASTER_RUNTIME)
		const promotionCertificateArtifacts = {
			development: {
				path: promotionCertificates.development.path,
				rawSha256: promotionCertificates.development.rawSha256,
				entries: Object.keys(promotionCertificates.development.entries).length,
			},
			holdout00: {
				path: promotionCertificates["00"].path,
				rawSha256: promotionCertificates["00"].rawSha256,
				entries: Object.keys(promotionCertificates["00"].entries).length,
			},
		}
		const certificates: SourceCertificate[] = certificateBases.map((base) => {
			const identity = { ...base, canonicalRuntimeSha256, modernRuntimeSha256 }
			return { ...identity, identitySha256: semanticSha256(identity) }
		})
		const resultsArtifact: ShardedResultsIndex = {
			schemaVersion: 1,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: protocol.protocolId,
			shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
			columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
			columnSchema: RESULT_COLUMN_SCHEMA,
			executionSourceCount: resultShards.length,
			fullSourceCount: FULL_SOURCE_COUNT,
			shards: resultShards,
			orderedShardMerkleRootSha256: orderedResultShardMerkleRoot(resultShards),
		}
		const certificatesArtifact = {
			schemaVersion: 1,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: protocol.protocolId,
			entries: certificates,
		}
		const analysis = {
			schemaVersion: 1,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: protocol.protocolId,
			coverage: {
				executionSourceCount: resultShards.length,
				fullSourceCount: FULL_SOURCE_COUNT,
				executionMatrixComplete: true,
				fullMatrixComplete: resultShards.length === FULL_SOURCE_COUNT,
				profileCount: RESOLUTION_PROFILES.length,
			},
			exactBaselineReproduction: {
				matched: resultShards.length,
				mismatched: 0,
				normalizedField: "diagnostics.processingMs",
			},
			structuralViolations: { count: 0, entries: [] },
			profiles: Object.fromEntries(RESOLUTION_PROFILES.map((profile) => [profile.id, {
				distributions: finalizeDistributions(profileAccumulators.get(profile.id)!),
				evidenceChangedSourceCountsFromReference: changeCounts.get(profile.id),
			}])),
			completeExtractorSemanticChanges: finalizeCompleteExtractionAnalysis(completeExtractionAccumulators),
			review: { cap: REVIEW_CAP, changedCountDoesNotAuthorizeReview: true, authorized: false },
			disposition: "diagnostic-only-no-selection-no-review-no-promotion",
		}
		const completeControls = {
			...controls,
			sourceRosterSafety: {
				passed: true,
				verifiedEntries: completeRoster.length,
				allowedRoots: ["images", "00"],
				directChildrenOnly: true,
				sourceRosterSha256,
			},
		}
		await writeCanonicalJson(join(attempt.stagingDirectory, "results.json"), resultsArtifact)
		const resultShardStorage = await validateShardedResultsIndex(attempt.stagingDirectory, resultsArtifact)
		await writeCanonicalJson(join(attempt.stagingDirectory, "certificates.json"), certificatesArtifact)
		await writeCanonicalJson(join(attempt.stagingDirectory, "controls.json"), completeControls)
		await writeCanonicalJson(join(attempt.stagingDirectory, "analysis.json"), analysis)
		const artifactHashes: Record<string, string> = {}
		const artifactSemanticHashes: Record<string, string> = {
			"protocol.json": semanticSha256(protocol),
			"results.json": semanticSha256(resultsArtifact),
			"certificates.json": semanticSha256(certificatesArtifact),
			"controls.json": semanticSha256(completeControls),
			"analysis.json": semanticSha256(analysis),
		}
		for (const name of artifactNames) artifactHashes[name] = sha256(await readFile(join(attempt.stagingDirectory, name)))
		const scientificIdentity = {
			protocolId: protocol.protocolId,
			canonicalArtifacts: canonicalInputs.artifacts,
			promotionCertificateArtifacts,
			sourceRosterSha256,
			implementationHashes,
			canonicalRuntime: canonicalRuntime.value,
			modernRuntime: MODERN_RASTER_RUNTIME,
		}
		const manifest = {
			schemaVersion: 1,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: protocol.protocolId,
			scientificIdentitySha256: semanticSha256(scientificIdentity),
			execution: {
				mode: arguments_.limit === null ? "full" : "limited-dry-run",
				limit: arguments_.limit,
				noPublish: arguments_.noPublish,
				processedSources: resultShards.length,
				published: !arguments_.noPublish,
				status: arguments_.noPublish ? "complete-unpublished" : "complete-published",
			},
			canonicalArtifacts: canonicalInputs.artifacts,
			promotionCertificateArtifacts,
			sourceRoster: { count: completeRoster.length, sha256: sourceRosterSha256, entries: rosterIdentityEntries },
			implementationHashes,
			implementationIdentitySha256: semanticSha256(implementationHashes),
			runtimes: {
				canonical: canonicalRuntime.value,
				canonicalSha256: canonicalRuntimeSha256,
				modern: MODERN_RASTER_RUNTIME,
				modernSha256: modernRuntimeSha256,
			},
			artifactHashes,
			artifactSemanticHashes,
			detailedResults: {
				indexPath: "results.json",
				indexRawSha256: artifactHashes["results.json"],
				indexSemanticSha256: artifactSemanticHashes["results.json"],
				shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
				columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
				orderedRootVersion: RESULT_SHARD_MERKLE_VERSION,
				orderedShardMerkleRootSha256: resultsArtifact.orderedShardMerkleRootSha256,
				shards: resultShards,
				totalShardBytes: resultShardStorage.totalBytes,
				maximumShardBytes: resultShardStorage.maximumShardBytes,
				maximumAllowedShardBytes: MAX_RESULT_SHARD_BYTES,
			},
			hardStopsPassed: true,
			disposition: "diagnostic-only-no-selection-no-review-no-promotion",
		}
		await writeCanonicalJson(join(attempt.stagingDirectory, "manifest.json"), manifest)
		if (arguments_.noPublish) {
			const preserved = await outputChild.preserveOutput()
			moved = true
			await outputChild.releaseOutput()
			attempt = undefined
			await outputChild.close()
			outputChild = undefined
			return preserved
		}
		const published = await outputChild.publishOutput()
		moved = true
		await outputChild.releaseOutput()
		attempt = undefined
		await outputChild.close()
		outputChild = undefined
		return published
	} catch (error) {
		if (attempt && outputChild && !moved) {
			let preserved: string
			try {
				preserved = await outputChild.preserveOutput()
				moved = true
			} catch (preserveError) {
				throw new AggregateError([error, preserveError], "Audit failed and its append-only attempt could not be preserved")
			}
			throw new Error(`Audit failed; append-only attempt preserved at ${preserved}: ${failureMessage(error)}`, { cause: error })
		}
		throw error
	} finally {
		if (child) await child.close()
		if (outputChild) {
			if (attempt) await outputChild.releaseOutput()
			await outputChild.close()
		}
	}
}

async function main(): Promise<void> {
	const arguments_ = parseAuditArguments(process.argv.slice(2))
	const output = await runAudit(arguments_)
	process.stdout.write(`${arguments_.noPublish ? "Unpublished audit preserved" : "Published audit"}: ${output}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
