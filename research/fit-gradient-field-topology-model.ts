import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import sharp from "sharp"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import {
	GRADIENT_FIELD_TOPOLOGY_CONSTANTS,
	GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
} from "./src/gradient-field-topology.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const developmentPath = resolve(researchRoot, "data/experiments/gradient-field-topology-3.0.0-development.json")
const modelVersion = "gradient-field-topology-model-3.0.0-dev" as const
const fitVersion = "gradient-field-topology-fit-3.0.0" as const

const judgments = [
	"should-be-gradient",
	"should-not-be-gradient",
	"either-way",
	"no-visible-difference",
	"selected-colors-not-identifiable",
	"uncertain",
] as const
type Judgment = typeof judgments[number]

const reviewBatches = ["music", "targeted", "00", "01", "02", "03", "04", "05", "06"] as const
type ReviewBatch = typeof reviewBatches[number]

type AvailableFeatureName = "massDistribution" | "topology" | "progression" | "fieldOwnership" |
	"distributionContinuity" | "ownedProgression" | "ownedConnectivity" | "surfaceRoleOwnership" |
	"spatialFieldOwnership" | "connectedIntermediateContinuity" | "legacySurfaceFieldOwnership" |
	"ownedAllContinuity" | "surfaceOwnedContinuity" | "spatialOwnedContinuity" | "unifiedOwnedContinuity"
type FeatureDefinition = { name: AvailableFeatureName; formula: string; transform: "identity" }
type VariantName = "positive-structural" | "owned-structural" | "role-spatial" | "legacy-proxy-benchmark" |
	"owned-all" | "separate-owned-modes" | "unified-owned-continuity" | "unified-only"
type VariantDefinition = {
	name: VariantName
	shippable: boolean
	description: string
	features: readonly FeatureDefinition[]
}

const variantDefinitions: readonly VariantDefinition[] = [
	{
		name: "positive-structural",
		shippable: true,
		description: "V2 absolute structural evidence plus candidate-independent v3 field ownership.",
		features: [
			{ name: "massDistribution", formula: "features.massDistribution", transform: "identity" },
			{ name: "topology", formula: "features.topology", transform: "identity" },
			{ name: "progression", formula: "features.progression", transform: "identity" },
			{ name: "fieldOwnership", formula: "features.fieldOwnership", transform: "identity" },
		],
	},
	{
		name: "owned-structural",
		shippable: true,
		description: "Candidate-independent distribution continuity with ownership-gated raw progression and connectivity.",
		features: [
			{ name: "distributionContinuity", formula: "features.distributionContinuity", transform: "identity" },
			{ name: "ownedProgression", formula: "features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)", transform: "identity" },
			{ name: "ownedConnectivity", formula: "features.fieldOwnership * topology.rootedConnectivity", transform: "identity" },
		],
	},
	{
		name: "role-spatial",
		shippable: true,
		description: "Separates candidate-independent surface-role and spatial ownership alongside v2 structural evidence.",
		features: [
			{ name: "distributionContinuity", formula: "features.distributionContinuity", transform: "identity" },
			{ name: "progression", formula: "features.progression", transform: "identity" },
			{ name: "topology", formula: "features.topology", transform: "identity" },
			{ name: "surfaceRoleOwnership", formula: "ownership.surfaceRoleOwnership", transform: "identity" },
			{ name: "spatialFieldOwnership", formula: "ownership.spatialFieldOwnership", transform: "identity" },
		],
	},
	{
		name: "legacy-proxy-benchmark",
		shippable: false,
		description: "Diagnostic D/connected/role proxy using candidate-dependent legacy surface field ownership; never selectable.",
		features: [
			{ name: "distributionContinuity", formula: "features.distributionContinuity", transform: "identity" },
			{ name: "connectedIntermediateContinuity", formula: "features.connectedIntermediateContinuity", transform: "identity" },
			{ name: "legacySurfaceFieldOwnership", formula: "legacyDiagnostics.candidates.surfaceFieldOwnership", transform: "identity" },
		],
	},
	{
		name: "owned-all",
		shippable: true,
		description: "E: unified field ownership gates distribution continuity, raw progression, and raw connectivity.",
		features: [
			{ name: "ownedAllContinuity", formula: "sqrt(features.distributionContinuity * features.fieldOwnership)", transform: "identity" },
			{ name: "ownedProgression", formula: "features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)", transform: "identity" },
			{ name: "ownedConnectivity", formula: "features.fieldOwnership * topology.rootedConnectivity", transform: "identity" },
		],
	},
	{
		name: "separate-owned-modes",
		shippable: true,
		description: "F: separate surface-role and spatial geometric-mean continuity modes plus owned progression and connectivity.",
		features: [
			{ name: "surfaceOwnedContinuity", formula: "sqrt(features.distributionContinuity * ownership.surfaceRoleOwnership)", transform: "identity" },
			{ name: "spatialOwnedContinuity", formula: "sqrt(features.distributionContinuity * ownership.spatialFieldOwnership)", transform: "identity" },
			{ name: "ownedProgression", formula: "features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)", transform: "identity" },
			{ name: "ownedConnectivity", formula: "features.fieldOwnership * topology.rootedConnectivity", transform: "identity" },
		],
	},
	{
		name: "unified-owned-continuity",
		shippable: true,
		description: "G: soft-OR of surface-role and spatial geometric-mean continuity plus owned progression and connectivity.",
		features: [
			{ name: "unifiedOwnedContinuity", formula: "1 - (1 - sqrt(features.distributionContinuity * ownership.surfaceRoleOwnership)) * (1 - sqrt(features.distributionContinuity * ownership.spatialFieldOwnership))", transform: "identity" },
			{ name: "ownedProgression", formula: "features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)", transform: "identity" },
			{ name: "ownedConnectivity", formula: "features.fieldOwnership * topology.rootedConnectivity", transform: "identity" },
		],
	},
	{
		name: "unified-only",
		shippable: true,
		description: "H: unified surface-role/spatial owned continuity alone.",
		features: [
			{ name: "unifiedOwnedContinuity", formula: "1 - (1 - sqrt(features.distributionContinuity * ownership.surfaceRoleOwnership)) * (1 - sqrt(features.distributionContinuity * ownership.spatialFieldOwnership))", transform: "identity" },
		],
	},
] as const
let featureDefinitions: readonly FeatureDefinition[] = variantDefinitions[0].features

const expectedJudgments: Record<Judgment, number> = {
	"should-be-gradient": 135,
	"should-not-be-gradient": 139,
	"either-way": 111,
	"no-visible-difference": 15,
	"selected-colors-not-identifiable": 11,
	"uncertain": 1,
}

const expectedReviewBatches: Record<ReviewBatch, { total: number; judgments: Record<Judgment, number> }> = {
	music: { total: 190, judgments: {
		"should-be-gradient": 65, "should-not-be-gradient": 86, "either-way": 38,
		"no-visible-difference": 0, "selected-colors-not-identifiable": 0, uncertain: 1,
	} },
	targeted: { total: 4, judgments: {
		"should-be-gradient": 4, "should-not-be-gradient": 0, "either-way": 0,
		"no-visible-difference": 0, "selected-colors-not-identifiable": 0, uncertain: 0,
	} },
	"00": { total: 5, judgments: {
		"should-be-gradient": 0, "should-not-be-gradient": 1, "either-way": 4,
		"no-visible-difference": 0, "selected-colors-not-identifiable": 0, uncertain: 0,
	} },
	"01": { total: 14, judgments: {
		"should-be-gradient": 1, "should-not-be-gradient": 8, "either-way": 2,
		"no-visible-difference": 3, "selected-colors-not-identifiable": 0, uncertain: 0,
	} },
	"02": { total: 16, judgments: {
		"should-be-gradient": 0, "should-not-be-gradient": 6, "either-way": 8,
		"no-visible-difference": 2, "selected-colors-not-identifiable": 0, uncertain: 0,
	} },
	"03": { total: 114, judgments: {
		"should-be-gradient": 48, "should-not-be-gradient": 18, "either-way": 40,
		"no-visible-difference": 3, "selected-colors-not-identifiable": 5, uncertain: 0,
	} },
	"04": { total: 14, judgments: {
		"should-be-gradient": 2, "should-not-be-gradient": 6, "either-way": 2,
		"no-visible-difference": 3, "selected-colors-not-identifiable": 1, uncertain: 0,
	} },
	"05": { total: 16, judgments: {
		"should-be-gradient": 2, "should-not-be-gradient": 5, "either-way": 5,
		"no-visible-difference": 2, "selected-colors-not-identifiable": 2, uncertain: 0,
	} },
	"06": { total: 39, judgments: {
		"should-be-gradient": 13, "should-not-be-gradient": 9, "either-way": 12,
		"no-visible-difference": 2, "selected-colors-not-identifiable": 3, uncertain: 0,
	} },
}

const fittingConfig = {
	variants: variantDefinitions,
	standardization: {
		kind: "training-fold-population-mean-and-standard-deviation",
		minimumScale: 1e-12,
		leakageControl: "means and scales are computed separately inside each training fold",
	},
	objective: {
		kind: "class-balanced-log-loss-with-l2",
		classWeights: "each observed class has total weight 0.5",
		l2Lambda: 0.01,
		l2Penalty: "lambda / 2 * sum(featureCoefficient^2)",
		interceptRegularized: false,
	},
	optimizer: {
		kind: "deterministic-projected-gradient",
		initialIntercept: 0,
		initialFeatureCoefficients: 0,
		featureCoefficientConstraint: "nonnegative",
		interceptConstraint: "unconstrained",
		stepSize: "reciprocal of a weighted Frobenius upper bound on the logistic-plus-L2 Hessian",
		maximumIterations: 100_000,
		projectedGradientTolerance: 1e-9,
	},
	thresholdSelection: {
		minimumSensitivity: 0.95,
		candidateThresholds: "0, 1, and midpoints between consecutive unique training scores",
		order: ["sensitivity-at-least-0.95", "maximum-balanced-accuracy", "maximum-specificity",
			"maximum-sensitivity", "highest-threshold"],
		predictionRule: "score >= threshold",
	},
	calibration: {
		bins: 10,
		kind: "fixed-width expected-calibration-error",
		probabilityInterpretation: "balanced-prior discrimination score; not prevalence-calibrated",
	},
	variantSelection: {
		eligibleVariants: "shippable variants A-C and E-H only; diagnostic variant D is never selectable",
		minimumPooledLeaveTemporalBatchOutSensitivity: 0.95,
		order: ["maximum-pooled-balanced-accuracy", "maximum-pooled-roc-auc", "fewest-features", "declaration-order"],
		failureBehavior: "model is null when no shippable variant meets the pooled sensitivity requirement",
	},
} as const

type Entry = {
	index: number
	reviewBatch: ReviewBatch
	familyId: string
	sourceFile: string
	sourceSha256: string
	sourceHashProvenance: "artifact-bound" | "computed-only"
	judgment: Judgment
	availableFeatures: Record<AvailableFeatureName, number>
	features: number[]
	label: 0 | 1 | null
}

type Parameters = {
	intercept: number
	coefficients: number[]
	featureMeans: number[]
	featureScales: number[]
}

type FitResult = Parameters & {
	iterations: number
	converged: boolean
	objective: number
	classBalancedLogLoss: number
	l2Penalty: number
	projectedGradientNorm: number
	stepSize: number
}

type ScoredEntry = {
	entry: Entry
	score: number
	predicted: boolean
	threshold: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	if (isRecord(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
	}
	return JSON.stringify(value)
}

function hashObject(value: unknown): string {
	return sha256(canonicalJson(value))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const expected = [...keys].sort()
	if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} fields are invalid: ${actual.join(", ")}`)
}

function nonemptyString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a nonempty string`)
	return value
}

function sha256String(value: unknown, label: string): string {
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be SHA-256`)
	return value
}

function countValue(value: unknown, label: string): number {
	if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a nonnegative integer`)
	return value as number
}

function finiteUnit(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`${label} must be finite and within [0, 1]`)
	}
	return value
}

function judgmentValue(value: unknown, label: string): Judgment {
	if ((judgments as readonly unknown[]).includes(value)) return value as Judgment
	throw new Error(`${label} is invalid: ${String(value)}`)
}

function reviewBatchValue(value: unknown, label: string): ReviewBatch {
	if ((reviewBatches as readonly unknown[]).includes(value)) return value as ReviewBatch
	throw new Error(`${label} is invalid: ${String(value)}`)
}

function countJudgments(entries: Array<{ judgment: Judgment }>): Record<Judgment, number> {
	const counts = Object.fromEntries(judgments.map((judgment) => [judgment, 0])) as Record<Judgment, number>
	for (const entry of entries) counts[entry.judgment]++
	return counts
}

function rgbIdentity(value: unknown, label: string): string {
	if (!isRecord(value) || !Array.isArray(value.rgb) || value.rgb.length !== 3 ||
		value.rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
		throw new Error(`${label}.rgb is invalid`)
	}
	return value.rgb.join(",")
}

function parseEntry(value: unknown, index: number, evidenceVersion: string): Entry {
	if (!isRecord(value)) throw new Error(`entries[${index}] is invalid`)
	const reviewBatch = reviewBatchValue(value.reviewBatch, `entries[${index}].reviewBatch`)
	const familyId = nonemptyString(value.familyId, `entries[${index}].familyId`)
	const sourceFile = nonemptyString(value.sourceFile, `entries[${index}].sourceFile`)
	if (!/^(?:music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+|images\/[^/\\]+|0[0-6]\/[^/\\]+)$/i.test(sourceFile)) {
		throw new Error(`entries[${index}].sourceFile is outside music, images, and 00-06: ${sourceFile}`)
	}
	const sourceSha256 = sha256String(value.sourceSha256, `entries[${index}].sourceSha256`)
	if (value.sourceHashProvenance !== "artifact-bound" && value.sourceHashProvenance !== "computed-only") {
		throw new Error(`entries[${index}].sourceHashProvenance is invalid`)
	}
	const judgment = judgmentValue(value.judgment, `entries[${index}].judgment`)
	if (!isRecord(value.endpoints)) throw new Error(`entries[${index}].endpoints is invalid`)
	const backgroundIdentity = rgbIdentity(value.endpoints.background, `entries[${index}].endpoints.background`)
	const surfaceIdentity = rgbIdentity(value.endpoints.surface, `entries[${index}].endpoints.surface`)
	if (!isRecord(value.evidence) || value.evidence.evidenceVersion !== evidenceVersion) {
		throw new Error(`entries[${index}] has unexpected evidence version`)
	}
	const evidence = value.evidence
	if (!isRecord(evidence.features)) throw new Error(`entries[${index}].evidence.features is invalid`)
	const featureValues = evidence.features
	exactKeys(featureValues, ["endpointSupport", "massDistribution", "topology", "progression", "fieldOwnership",
		"distributionContinuity", "connectedIntermediateContinuity"], `entries[${index}].evidence.features`)
	if (!isRecord(evidence.progression) || !isRecord(evidence.topology) || !isRecord(evidence.ownership) ||
		!isRecord(evidence.legacyDiagnostics) || !isRecord(evidence.legacyDiagnostics.candidates)) {
		throw new Error(`entries[${index}].evidence v3 diagnostics are invalid`)
	}
	const unit = (record: Record<string, unknown>, key: string, scope: string): number =>
		finiteUnit(record[key], `entries[${index}].evidence.${scope}.${key}`)
	const massDistribution = unit(featureValues, "massDistribution", "features")
	const topology = unit(featureValues, "topology", "features")
	const progression = unit(featureValues, "progression", "features")
	const fieldOwnership = unit(featureValues, "fieldOwnership", "features")
	const distributionContinuity = unit(featureValues, "distributionContinuity", "features")
	const connectedIntermediateContinuity = unit(featureValues, "connectedIntermediateContinuity", "features")
	const rawProgression = Math.max(
		unit(evidence.progression, "linearFit", "progression"),
		unit(evidence.progression, "nonlinearFit", "progression"),
	)
	const rawConnectivity = unit(evidence.topology, "rootedConnectivity", "topology")
	const surfaceRoleOwnership = unit(evidence.ownership, "surfaceRoleOwnership", "ownership")
	const spatialFieldOwnership = unit(evidence.ownership, "spatialFieldOwnership", "ownership")
	const surfaceOwnedContinuity = Math.sqrt(distributionContinuity * surfaceRoleOwnership)
	const spatialOwnedContinuity = Math.sqrt(distributionContinuity * spatialFieldOwnership)
	const availableFeatures: Record<AvailableFeatureName, number> = {
		massDistribution,
		topology,
		progression,
		fieldOwnership,
		distributionContinuity,
		ownedProgression: fieldOwnership * rawProgression,
		ownedConnectivity: fieldOwnership * rawConnectivity,
		surfaceRoleOwnership,
		spatialFieldOwnership,
		connectedIntermediateContinuity,
		legacySurfaceFieldOwnership: unit(
			evidence.legacyDiagnostics.candidates, "surfaceFieldOwnership", "legacyDiagnostics.candidates",
		),
		ownedAllContinuity: Math.sqrt(distributionContinuity * fieldOwnership),
		surfaceOwnedContinuity,
		spatialOwnedContinuity,
		unifiedOwnedContinuity: 1 - (1 - surfaceOwnedContinuity) * (1 - spatialOwnedContinuity),
	}
	const features = featureDefinitions.map((definition) => availableFeatures[definition.name])
	const label = judgment === "should-be-gradient" ? 1 : judgment === "should-not-be-gradient" ? 0 : null
	return {
		index,
		reviewBatch,
		familyId,
		sourceFile,
		sourceSha256,
		sourceHashProvenance: value.sourceHashProvenance,
		judgment,
		availableFeatures,
		features,
		label,
		identity: `${sourceSha256}\0${backgroundIdentity}\0${surfaceIdentity}`,
	} as Entry & { identity: string }
}

async function validateProvenance(value: Record<string, unknown>): Promise<{
	sourceArtifacts: number
	implementationFiles: number
	runtimeDependenciesBound: true
}> {
	if (!isRecord(value.provenance) || !Array.isArray(value.provenance.sourceArtifacts) ||
		!isRecord(value.provenance.implementationSha256)) throw new Error("Development provenance is invalid")
	const seen = new Set<string>()
	const declaredHashes = new Map<string, string>()
	await Promise.all(value.provenance.sourceArtifacts.map(async (source, index) => {
		if (!isRecord(source)) throw new Error(`provenance.sourceArtifacts[${index}] is invalid`)
		exactKeys(source, ["file", "sha256", "roles"], `provenance.sourceArtifacts[${index}]`)
		const file = nonemptyString(source.file, `provenance.sourceArtifacts[${index}].file`)
		if (seen.has(file)) throw new Error(`Duplicate provenance source artifact: ${file}`)
		seen.add(file)
		const expected = sha256String(source.sha256, `provenance.sourceArtifacts[${index}].sha256`)
		if (!Array.isArray(source.roles) || source.roles.length === 0 ||
			source.roles.some((role) => typeof role !== "string" || role.length === 0)) {
			throw new Error(`provenance.sourceArtifacts[${index}].roles is invalid`)
		}
		const path = resolve(researchRoot, file)
		const relativePath = relative(researchRoot, path)
		if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
			throw new Error(`Provenance source artifact escapes research root: ${file}`)
		}
		if (/(?:^|\/)0(?:7|8|9|a|b)(?:\/|$)/i.test(file)) {
			throw new Error(`Provenance includes reserved 07+ data: ${file}`)
		}
		const actual = sha256(await readFile(path))
		if (actual !== expected) throw new Error(`Provenance hash mismatch for ${file}: expected ${expected}, received ${actual}`)
		declaredHashes.set(file, expected)
	}))
	const implementation = value.provenance.implementationSha256
	for (const [file, hashValue] of Object.entries(implementation)) {
		const hash = sha256String(hashValue, `provenance.implementationSha256.${file}`)
		if (declaredHashes.get(file) !== hash) throw new Error(`Implementation provenance mismatch for ${file}`)
	}
	for (const required of ["prepare-gradient-field-topology-development.ts", "fit-gradient-field-topology-model.ts"]) {
		if (!declaredHashes.has(required)) throw new Error(`Development provenance does not bind ${required}`)
	}
	if (!isRecord(value.provenance.preparation) || value.provenance.preparation.candidateCount !== 12 ||
		value.provenance.preparation.roleAwareCandidates !== true ||
		!isDeepStrictEqual(value.provenance.preparation.evidenceConstants, GRADIENT_FIELD_TOPOLOGY_CONSTANTS)) {
		throw new Error("Development preparation configuration is invalid")
	}
	if (!isRecord(value.provenance.runtimeDependencies)) throw new Error("Runtime dependency provenance is invalid")
	const runtime = value.provenance.runtimeDependencies
	const packageSource = await readFile(resolve(projectRoot, "package.json"))
	const packageValue = JSON.parse(packageSource.toString("utf8")) as { devDependencies?: Record<string, string> }
	if (runtime.node !== process.version || runtime.packageJsonSha256 !== sha256(packageSource) ||
		!isDeepStrictEqual(runtime.nodeVersions, process.versions) || !isDeepStrictEqual(runtime.sharpVersions, sharp.versions) ||
		!isDeepStrictEqual(runtime.declared, {
			sharp: packageValue.devDependencies?.sharp,
			typescript: packageValue.devDependencies?.typescript,
		})) {
		throw new Error("Runtime dependency provenance does not match the fitting runtime")
	}
	return {
		sourceArtifacts: seen.size,
		implementationFiles: Object.keys(implementation).length,
		runtimeDependenciesBound: true,
	}
}

async function parseDevelopment(source: Buffer): Promise<{
	value: Record<string, unknown>
	entries: Entry[]
	provenanceValidation: { sourceArtifacts: number; implementationFiles: number; runtimeDependenciesBound: true }
}> {
	let parsed: unknown
	try {
		parsed = JSON.parse(source.toString("utf8"))
	} catch {
		throw new Error(`Invalid development JSON: ${developmentPath}`)
	}
	if (!isRecord(parsed)) throw new Error("Development artifact must be an object")
	if (parsed.schemaVersion !== 1 || parsed.developmentVersion !== "gradient-field-topology-development-3.0.0" ||
		parsed.algorithmVersion !== "region-graph-0.17.0" || parsed.developmentOnly !== true ||
		parsed.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION) {
		throw new Error("Development artifact identity is invalid")
	}
	if (!Array.isArray(parsed.entries) || parsed.entries.length !== 412) {
		throw new Error(`Development entry count mismatch: expected 412, received ${Array.isArray(parsed.entries) ? parsed.entries.length : "invalid"}`)
	}
	const entries = parsed.entries.map((entry, index) => parseEntry(entry, index, parsed.evidenceVersion as string))
	const identities = new Set<string>()
	for (const entry of entries as Array<Entry & { identity?: string }>) {
		if (!entry.identity || identities.has(entry.identity)) throw new Error(`Duplicate exact directed pair: ${entry.familyId}`)
		identities.add(entry.identity)
		delete entry.identity
	}
	const counts = countJudgments(entries)
	if (!isDeepStrictEqual(counts, expectedJudgments)) {
		throw new Error(`Development judgment count mismatch: ${JSON.stringify(counts)}`)
	}
	const computedReviewBatches = Object.fromEntries(reviewBatches.map((reviewBatch) => {
		const batchEntries = entries.filter((entry) => entry.reviewBatch === reviewBatch)
		return [reviewBatch, { total: batchEntries.length, judgments: countJudgments(batchEntries) }]
	}))
	if (!isDeepStrictEqual(computedReviewBatches, expectedReviewBatches)) {
		throw new Error(`Development temporal review batch count mismatch: ${JSON.stringify(computedReviewBatches)}`)
	}
	if (!isRecord(parsed.summary) || parsed.summary.total !== 412 ||
		!isDeepStrictEqual(parsed.summary.judgments, counts) ||
		!isDeepStrictEqual(parsed.summary.temporalReviewBatches, computedReviewBatches)) {
		throw new Error("Development summary does not match entries")
	}
	const artifactBound = entries.filter((entry) => entry.sourceHashProvenance === "artifact-bound").length
	const computedOnly = entries.length - artifactBound
	if (parsed.summary.artifactBoundSourceHashes !== artifactBound ||
		parsed.summary.computedOnlySourceHashes !== computedOnly || artifactBound !== 408 || computedOnly !== 4) {
		throw new Error("Development source-hash provenance counts do not match entries")
	}
	const provenanceValidation = await validateProvenance(parsed)
	return { value: parsed, entries, provenanceValidation }
}

function sigmoid(value: number): number {
	if (value >= 0) return 1 / (1 + Math.exp(-value))
	const exponential = Math.exp(value)
	return exponential / (1 + exponential)
}

function featureScaling(entries: Entry[]): { featureMeans: number[]; featureScales: number[] } {
	if (entries.length === 0) throw new Error("Feature scaling requires entries")
	const featureMeans = featureDefinitions.map((_, index) =>
		entries.reduce((sum, entry) => sum + entry.features[index], 0) / entries.length)
	const featureScales = featureDefinitions.map((_, index) => {
		const variance = entries.reduce((sum, entry) =>
			sum + (entry.features[index] - featureMeans[index]) ** 2, 0) / entries.length
		return Math.max(fittingConfig.standardization.minimumScale, Math.sqrt(variance))
	})
	return { featureMeans, featureScales }
}

function standardizedFeatures(parameters: Parameters, features: number[]): number[] {
	return features.map((feature, index) =>
		(feature - parameters.featureMeans[index]) / parameters.featureScales[index])
}

function linearScore(parameters: Parameters, features: number[]): number {
	return parameters.intercept + standardizedFeatures(parameters, features).reduce((sum, feature, index) =>
		sum + feature * parameters.coefficients[index], 0)
}

function score(parameters: Parameters, features: number[]): number {
	return sigmoid(linearScore(parameters, features))
}

function logisticLoss(logit: number, label: 0 | 1): number {
	return Math.max(logit, 0) - logit * label + Math.log1p(Math.exp(-Math.abs(logit)))
}

function objectiveAndGradient(entries: Entry[], parameters: Parameters): {
	objective: number
	classBalancedLogLoss: number
	l2Penalty: number
	interceptGradient: number
	coefficientGradients: number[]
} {
	const positiveCount = entries.filter((entry) => entry.label === 1).length
	const negativeCount = entries.filter((entry) => entry.label === 0).length
	if (positiveCount === 0 || negativeCount === 0) throw new Error("Fitting requires both decisive classes")
	let classBalancedLogLoss = 0
	let interceptGradient = 0
	const coefficientGradients = new Array(featureDefinitions.length).fill(0)
	for (const entry of entries) {
		if (entry.label === null) throw new Error("Nondecisive entry reached optimizer")
		const weight = entry.label === 1 ? 0.5 / positiveCount : 0.5 / negativeCount
		const logit = linearScore(parameters, entry.features)
		const probability = sigmoid(logit)
		const residual = probability - entry.label
		const features = standardizedFeatures(parameters, entry.features)
		classBalancedLogLoss += weight * logisticLoss(logit, entry.label)
		interceptGradient += weight * residual
		for (let index = 0; index < coefficientGradients.length; index++) {
			coefficientGradients[index] += weight * residual * features[index]
		}
	}
	let squaredNorm = 0
	for (let index = 0; index < parameters.coefficients.length; index++) {
		const coefficient = parameters.coefficients[index]
		squaredNorm += coefficient * coefficient
		coefficientGradients[index] += fittingConfig.objective.l2Lambda * coefficient
	}
	const l2Penalty = fittingConfig.objective.l2Lambda * squaredNorm / 2
	return {
		objective: classBalancedLogLoss + l2Penalty,
		classBalancedLogLoss,
		l2Penalty,
		interceptGradient,
		coefficientGradients,
	}
}

function optimizerStepSize(entries: Entry[], scaling: { featureMeans: number[]; featureScales: number[] }): number {
	const positiveCount = entries.filter((entry) => entry.label === 1).length
	const negativeCount = entries.filter((entry) => entry.label === 0).length
	let weightedSquaredNorm = 0
	for (const entry of entries) {
		if (entry.label === null) continue
		const weight = entry.label === 1 ? 0.5 / positiveCount : 0.5 / negativeCount
		const features = entry.features.map((value, index) =>
			(value - scaling.featureMeans[index]) / scaling.featureScales[index])
		weightedSquaredNorm += weight * (1 + features.reduce((sum, value) => sum + value * value, 0))
	}
	return 1 / (weightedSquaredNorm * 0.25 + fittingConfig.objective.l2Lambda)
}

function fit(entries: Entry[], excludedFeatureIndex?: number): FitResult {
	const decisive = entries.filter((entry) => entry.label !== null)
	const scaling = featureScaling(decisive)
	const stepSize = optimizerStepSize(decisive, scaling)
	let parameters: Parameters = {
		intercept: 0,
		coefficients: new Array(featureDefinitions.length).fill(0),
		...scaling,
	}
	let projectedGradientNorm = Infinity
	let iterations = 0
	for (iterations = 1; iterations <= fittingConfig.optimizer.maximumIterations; iterations++) {
		const state = objectiveAndGradient(decisive, parameters)
		const next: Parameters = {
			intercept: parameters.intercept - stepSize * state.interceptGradient,
			coefficients: parameters.coefficients.map((coefficient, index) =>
				index === excludedFeatureIndex ? 0 : Math.max(0, coefficient - stepSize * state.coefficientGradients[index])),
			featureMeans: parameters.featureMeans,
			featureScales: parameters.featureScales,
		}
		projectedGradientNorm = Math.max(
			Math.abs(next.intercept - parameters.intercept) / stepSize,
			...next.coefficients.map((coefficient, index) =>
				Math.abs(coefficient - parameters.coefficients[index]) / stepSize),
		)
		parameters = next
		if (projectedGradientNorm <= fittingConfig.optimizer.projectedGradientTolerance) break
	}
	const converged = iterations <= fittingConfig.optimizer.maximumIterations
	if (!converged) throw new Error(`Projected-gradient optimizer failed to converge after ${iterations - 1} iterations`)
	const final = objectiveAndGradient(decisive, parameters)
	return {
		...parameters,
		iterations,
		converged,
		objective: final.objective,
		classBalancedLogLoss: final.classBalancedLogLoss,
		l2Penalty: final.l2Penalty,
		projectedGradientNorm,
		stepSize,
	}
}

function quantile(values: number[], probability: number): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((first, second) => first - second)
	const position = (sorted.length - 1) * probability
	const lower = Math.floor(position)
	const upper = Math.ceil(position)
	if (lower === upper) return sorted[lower]
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function distribution(values: number[]): {
	count: number
	minimum: number
	q1: number
	median: number
	q3: number
	maximum: number
	mean: number
} | null {
	if (values.length === 0) return null
	return {
		count: values.length,
		minimum: Math.min(...values),
		q1: quantile(values, 0.25)!,
		median: quantile(values, 0.5)!,
		q3: quantile(values, 0.75)!,
		maximum: Math.max(...values),
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
	}
}

function rocAuc(scored: Array<{ label: 0 | 1; score: number }>): number | null {
	const positive = scored.filter((entry) => entry.label === 1)
	const negative = scored.filter((entry) => entry.label === 0)
	if (positive.length === 0 || negative.length === 0) return null
	let wins = 0
	for (const first of positive) {
		for (const second of negative) {
			if (first.score > second.score) wins++
			else if (first.score === second.score) wins += 0.5
		}
	}
	return wins / (positive.length * negative.length)
}

function divide(numerator: number, denominator: number): number | null {
	return denominator === 0 ? null : numerator / denominator
}

function thresholdMetrics(entries: Array<{ label: 0 | 1; score: number }>, threshold: number): {
	threshold: number
	truePositive: number
	falseNegative: number
	trueNegative: number
	falsePositive: number
	sensitivity: number | null
	specificity: number | null
	balancedAccuracy: number | null
	precision: number | null
	accuracy: number | null
	meetsSensitivityTarget: boolean
} {
	let truePositive = 0
	let falseNegative = 0
	let trueNegative = 0
	let falsePositive = 0
	for (const entry of entries) {
		const predicted = entry.score >= threshold
		if (entry.label === 1 && predicted) truePositive++
		else if (entry.label === 1) falseNegative++
		else if (predicted) falsePositive++
		else trueNegative++
	}
	const sensitivity = divide(truePositive, truePositive + falseNegative)
	const specificity = divide(trueNegative, trueNegative + falsePositive)
	return {
		threshold,
		truePositive,
		falseNegative,
		trueNegative,
		falsePositive,
		sensitivity,
		specificity,
		balancedAccuracy: sensitivity === null || specificity === null ? null : (sensitivity + specificity) / 2,
		precision: divide(truePositive, truePositive + falsePositive),
		accuracy: divide(truePositive + trueNegative, entries.length),
		meetsSensitivityTarget: sensitivity !== null && sensitivity >= fittingConfig.thresholdSelection.minimumSensitivity,
	}
}

function thresholdCurve(entries: Entry[], parameters: Parameters): ReturnType<typeof thresholdMetrics>[] {
	const decisive = entries.filter((entry): entry is Entry & { label: 0 | 1 } => entry.label !== null)
	const scored = decisive.map((entry) => ({ label: entry.label, score: score(parameters, entry.features) }))
	const unique = [...new Set(scored.map((entry) => entry.score))].sort((first, second) => first - second)
	const thresholds = [0]
	for (let index = 0; index + 1 < unique.length; index++) thresholds.push((unique[index] + unique[index + 1]) / 2)
	thresholds.push(1)
	return [...new Set(thresholds)].sort((first, second) => second - first)
		.map((threshold) => thresholdMetrics(scored, threshold))
}

function compareThresholds(
	first: ReturnType<typeof thresholdMetrics>,
	second: ReturnType<typeof thresholdMetrics>,
): number {
	const epsilon = 1e-15
	const compare = (firstValue: number | null, secondValue: number | null): number => {
		const left = firstValue ?? -Infinity
		const right = secondValue ?? -Infinity
		return Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1
	}
	for (const [left, right] of [
		[first.balancedAccuracy, second.balancedAccuracy],
		[first.specificity, second.specificity],
		[first.sensitivity, second.sensitivity],
		[first.threshold, second.threshold],
	] as Array<[number | null, number | null]>) {
		const result = compare(left, right)
		if (result !== 0) return result
	}
	return 0
}

function selectThreshold(curve: ReturnType<typeof thresholdMetrics>[]): ReturnType<typeof thresholdMetrics> {
	const eligible = curve.filter((point) => point.meetsSensitivityTarget)
	if (eligible.length === 0) throw new Error("Threshold curve contains no point meeting sensitivity target")
	return eligible.reduce((best, point) => compareThresholds(point, best) > 0 ? point : best)
}

function calibration(scored: ScoredEntry[]): {
	brierScore: number | null
	expectedCalibrationError: number | null
	bins: Array<{ lower: number; upper: number; count: number; meanScore: number | null; observedPositiveRate: number | null }>
} {
	const decisive = scored.filter((entry): entry is ScoredEntry & { entry: Entry & { label: 0 | 1 } } =>
		entry.entry.label !== null)
	const bins = Array.from({ length: fittingConfig.calibration.bins }, (_, index) => {
		const lower = index / fittingConfig.calibration.bins
		const upper = (index + 1) / fittingConfig.calibration.bins
		const values = decisive.filter((entry) => Math.min(fittingConfig.calibration.bins - 1,
			Math.floor(entry.score * fittingConfig.calibration.bins)) === index)
		return {
			lower,
			upper,
			count: values.length,
			meanScore: values.length === 0 ? null : values.reduce((sum, entry) => sum + entry.score, 0) / values.length,
			observedPositiveRate: values.length === 0 ? null :
				values.reduce((sum, entry) => sum + entry.entry.label, 0) / values.length,
		}
	})
	if (decisive.length === 0) return { brierScore: null, expectedCalibrationError: null, bins }
	const brierScore = decisive.reduce((sum, entry) => sum + (entry.score - entry.entry.label) ** 2, 0) / decisive.length
	const expectedCalibrationError = bins.reduce((sum, bin) => bin.count === 0 ? sum : sum +
		bin.count / decisive.length * Math.abs(bin.meanScore! - bin.observedPositiveRate!), 0)
	return { brierScore, expectedCalibrationError, bins }
}

function evaluate(scored: ScoredEntry[]) {
	const decisive = scored.filter((entry): entry is ScoredEntry & { entry: Entry & { label: 0 | 1 } } =>
		entry.entry.label !== null)
	const positive = decisive.filter((entry) => entry.entry.label === 1)
	const negative = decisive.filter((entry) => entry.entry.label === 0)
	let truePositive = 0
	let falseNegative = 0
	let trueNegative = 0
	let falsePositive = 0
	for (const entry of decisive) {
		if (entry.entry.label === 1 && entry.predicted) truePositive++
		else if (entry.entry.label === 1) falseNegative++
		else if (entry.predicted) falsePositive++
		else trueNegative++
	}
	const sensitivity = divide(truePositive, positive.length)
	const specificity = divide(trueNegative, negative.length)
	const clipped = (value: number): number => Math.max(1e-15, Math.min(1 - 1e-15, value))
	const loss = (entry: typeof decisive[number]): number => entry.entry.label === 1
		? -Math.log(clipped(entry.score))
		: -Math.log(1 - clipped(entry.score))
	const logLoss = decisive.length === 0 ? null : decisive.reduce((sum, entry) => sum + loss(entry), 0) / decisive.length
	const classBalancedLogLoss = positive.length === 0 || negative.length === 0 ? null :
		(positive.reduce((sum, entry) => sum + loss(entry), 0) / positive.length +
		negative.reduce((sum, entry) => sum + loss(entry), 0) / negative.length) / 2
	return {
		counts: { total: decisive.length, positive: positive.length, negative: negative.length },
		confusion: { truePositive, falseNegative, trueNegative, falsePositive },
		sensitivity,
		specificity,
		balancedAccuracy: sensitivity === null || specificity === null ? null : (sensitivity + specificity) / 2,
		precision: divide(truePositive, truePositive + falsePositive),
		accuracy: divide(truePositive + trueNegative, decisive.length),
		rocAuc: rocAuc(decisive.map((entry) => ({ label: entry.entry.label, score: entry.score }))),
		logLoss,
		classBalancedLogLoss,
		calibration: calibration(decisive),
		scoreDistributions: {
			positive: distribution(positive.map((entry) => entry.score)),
			negative: distribution(negative.map((entry) => entry.score)),
			all: distribution(decisive.map((entry) => entry.score)),
		},
	}
}

function classificationErrors(scored: ScoredEntry[]): {
	falseNegatives: Array<Record<string, unknown>>
	falsePositives: Array<Record<string, unknown>>
} {
	const describe = (entry: ScoredEntry): Record<string, unknown> => ({
		index: entry.entry.index,
		temporalReviewBatch: entry.entry.reviewBatch,
		familyId: entry.entry.familyId,
		sourceFile: entry.entry.sourceFile,
		judgment: entry.entry.judgment,
		score: entry.score,
		threshold: entry.threshold,
		margin: entry.score - entry.threshold,
	})
	return {
		falseNegatives: scored.filter((entry) => entry.entry.label === 1 && !entry.predicted).map(describe),
		falsePositives: scored.filter((entry) => entry.entry.label === 0 && entry.predicted).map(describe),
	}
}

function scoreEntries(entries: Entry[], parameters: Parameters, threshold: number): ScoredEntry[] {
	return entries.map((entry) => {
		const probability = score(parameters, entry.features)
		return { entry, score: probability, predicted: probability >= threshold, threshold }
	})
}

function nondecisiveDistributions(scored: ScoredEntry[]): Record<string, unknown> {
	const categories = judgments.filter((judgment) => judgment !== "should-be-gradient" && judgment !== "should-not-be-gradient")
	const summarize = (values: ScoredEntry[]): Record<string, unknown> => Object.fromEntries(categories.map((judgment) => {
		const matching = values.filter((entry) => entry.entry.judgment === judgment)
		return [judgment, {
			count: matching.length,
			scores: distribution(matching.map((entry) => entry.score)),
			predictedGradient: matching.filter((entry) => entry.predicted).length,
		}]
	}))
	return {
		overall: summarize(scored),
		byTemporalReviewBatch: Object.fromEntries(reviewBatches.map((reviewBatch) => [reviewBatch,
			summarize(scored.filter((entry) => entry.entry.reviewBatch === reviewBatch))])),
	}
}

function featureDiagnostics(entries: Entry[]): Record<string, unknown> {
	const decisive = entries.filter((entry): entry is Entry & { label: 0 | 1 } => entry.label !== null)
	return Object.fromEntries(featureDefinitions.map((definition, index) => {
		const positiveOriginal = decisive.filter((entry) => entry.label === 1)
			.map((entry) => entry.availableFeatures[definition.name])
		const negativeOriginal = decisive.filter((entry) => entry.label === 0)
			.map((entry) => entry.availableFeatures[definition.name])
		return [definition.name, {
			formula: definition.formula,
			transform: definition.transform,
			positiveOriginal: distribution(positiveOriginal),
			negativeOriginal: distribution(negativeOriginal),
			orientedRocAuc: rocAuc(decisive.map((entry) => ({ label: entry.label, score: entry.features[index] }))),
		}]
	}))
}

function entriesForVariant(entries: Entry[], variant: VariantDefinition): Entry[] {
	featureDefinitions = variant.features
	return entries.map((entry) => ({
		...entry,
		features: variant.features.map((definition) => entry.availableFeatures[definition.name]),
	}))
}

function conditionalFeatureDiagnostics(entries: Entry[], fullFit: FitResult): Record<string, unknown> {
	const decisive = entries.filter((entry): entry is Entry & { label: 0 | 1 } => entry.label !== null)
	const fullAuc = rocAuc(decisive.map((entry) => ({ label: entry.label, score: score(fullFit, entry.features) })))!
	return {
		interpretation: "Positive loss deltas and negative AUC deltas indicate unique conditional value after refitting all remaining features.",
		fullModel: {
			classBalancedLogLoss: fullFit.classBalancedLogLoss,
			rocAuc: fullAuc,
		},
		leaveOneFeatureOut: Object.fromEntries(featureDefinitions.map((definition, excludedFeatureIndex) => {
			const omitted = fit(decisive, excludedFeatureIndex)
			const auc = rocAuc(decisive.map((entry) => ({ label: entry.label, score: score(omitted, entry.features) })))!
			const selected = selectThreshold(thresholdCurve(decisive, omitted))
			return [definition.name, {
				classBalancedLogLoss: omitted.classBalancedLogLoss,
				classBalancedLogLossIncrease: omitted.classBalancedLogLoss - fullFit.classBalancedLogLoss,
				rocAuc: auc,
				rocAucDecrease: fullAuc - auc,
				selectedThresholdMetrics: selected,
			}]
		})),
	}
}

function coefficientStability(folds: Array<{ fit: FitResult; threshold: number }>): Record<string, unknown> {
	const summarize = (values: number[]): Record<string, unknown> => {
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length
		return {
			...distribution(values),
			standardDeviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
			zeroCount: values.filter((value) => value === 0).length,
		}
	}
	return {
		intercept: summarize(folds.map((fold) => fold.fit.intercept)),
		threshold: summarize(folds.map((fold) => fold.threshold)),
		features: Object.fromEntries(featureDefinitions.map((definition, index) => [definition.name, {
			formula: definition.formula,
			transform: definition.transform,
			...summarize(folds.map((fold) => fold.fit.coefficients[index])),
		}])),
	}
}

const [outputArgument, ...unexpectedArguments] = process.argv.slice(2)
if (!outputArgument || unexpectedArguments.length > 0) {
	throw new Error("Usage: fit-gradient-field-topology-model.ts <output.json>")
}
const outputPath = resolve(outputArgument)
await prepareOutputTarget({ path: outputPath, refuseOverwrite: true })

const developmentSource = await readFile(developmentPath)
const trainingArtifactSha256 = sha256(developmentSource)
const development = await parseDevelopment(developmentSource)
const decisive = development.entries.filter((entry) => entry.label !== null)
const fittingConfigSha256 = hashObject(fittingConfig)

function runVariant(variant: VariantDefinition) {
	const entries = entriesForVariant(development.entries, variant)
	const decisiveEntries = entries.filter((entry) => entry.label !== null)
	const foldReports: Array<Record<string, unknown>> = []
	const foldFits: Array<{ fit: FitResult; threshold: number }> = []
	const outOfBatchByIndex = new Map<number, ScoredEntry>()
	for (const reviewBatch of reviewBatches) {
		const heldOut = entries.filter((entry) => entry.reviewBatch === reviewBatch)
		const heldOutDecisive = heldOut.filter((entry) => entry.label !== null)
		if (heldOutDecisive.length === 0) continue
		const training = decisiveEntries.filter((entry) => entry.reviewBatch !== reviewBatch)
		const fitted = fit(training)
		const curve = thresholdCurve(training, fitted)
		const selected = selectThreshold(curve)
		const scored = scoreEntries(heldOut, fitted, selected.threshold)
		for (const entry of scored) outOfBatchByIndex.set(entry.entry.index, entry)
		foldFits.push({ fit: fitted, threshold: selected.threshold })
		foldReports.push({
			temporalReviewBatch: reviewBatch,
			trainingCounts: {
				total: training.length,
				positive: training.filter((entry) => entry.label === 1).length,
				negative: training.filter((entry) => entry.label === 0).length,
			},
			heldOutJudgments: countJudgments(heldOut),
			fit: fitted,
			thresholdSelection: { selected, curve },
			heldOut: evaluate(scored),
			nondecisive: nondecisiveDistributions(scored).overall,
			featureScaling: { means: fitted.featureMeans, scales: fitted.featureScales },
		})
	}
	if (outOfBatchByIndex.size !== entries.length) {
		throw new Error(`${variant.name} leave-one-temporal-review-batch-out prediction coverage mismatch: ${outOfBatchByIndex.size}/${entries.length}`)
	}
	const outOfBatch = entries.map((entry) => outOfBatchByIndex.get(entry.index)!)
	const groupedOutOfBatchEvaluation = {
		musicDevelopmentBatch: evaluate(outOfBatch.filter((entry) => entry.entry.reviewBatch === "music")),
		temporalReviewBatch03: evaluate(outOfBatch.filter((entry) => entry.entry.reviewBatch === "03")),
		pooledTemporalReviewBatches04Through06: evaluate(outOfBatch.filter((entry) =>
			entry.entry.reviewBatch === "04" || entry.entry.reviewBatch === "05" || entry.entry.reviewBatch === "06")),
		allDecisive: evaluate(outOfBatch),
	}

	const finalFit = fit(decisiveEntries)
	const finalThresholdCurve = thresholdCurve(decisiveEntries, finalFit)
	const finalThreshold = selectThreshold(finalThresholdCurve)
	const finalScored = scoreEntries(entries, finalFit, finalThreshold.threshold)
	const conditionalDiagnostics = conditionalFeatureDiagnostics(decisiveEntries, finalFit)
	const rawEquivalentCoefficients = finalFit.coefficients.map((coefficient, index) =>
		coefficient / finalFit.featureScales[index])
	const rawEquivalentIntercept = finalFit.intercept - rawEquivalentCoefficients.reduce((sum, coefficient, index) =>
		sum + coefficient * finalFit.featureMeans[index], 0)
	const parameterCore = {
		modelVersion,
		variant: variant.name,
		evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
		featureNames: featureDefinitions.map((feature) => feature.name),
		featureFormulas: featureDefinitions.map((feature) => feature.formula),
		featureTransforms: featureDefinitions.map((feature) => feature.transform),
		intercept: finalFit.intercept,
		coefficients: finalFit.coefficients,
		featureMeans: finalFit.featureMeans,
		featureScales: finalFit.featureScales,
		rawEquivalentIntercept,
		rawEquivalentCoefficients,
		threshold: finalThreshold.threshold,
		trainingArtifactSha256,
		fittingConfigSha256,
	}
	const modelCandidate = { ...parameterCore, parameterSha256: hashObject(parameterCore) }
	const pooled = groupedOutOfBatchEvaluation.allDecisive
	return {
		definition: variant,
		selectionMetrics: {
			sensitivity: pooled.sensitivity,
			balancedAccuracy: pooled.balancedAccuracy,
			rocAuc: pooled.rocAuc,
		},
		modelCandidate,
		report: {
			definition: variant,
			featureDiagnostics: featureDiagnostics(entries),
			conditionalFeatureDiagnostics: conditionalDiagnostics,
			leaveOneTemporalReviewBatchOut: {
				interpretation: "Temporal review batches are held out as robustness checks only; no batch-specific threshold is used by the final model.",
				folds: foldReports,
				coefficientStability: coefficientStability(foldFits),
				groupedEvaluation: groupedOutOfBatchEvaluation,
				nondecisiveScoreDistributions: nondecisiveDistributions(outOfBatch),
				errors: classificationErrors(outOfBatch),
			},
			finalAllDevelopmentFit: {
				fit: finalFit,
				featureScaling: { means: finalFit.featureMeans, scales: finalFit.featureScales },
				thresholdSelection: { selected: finalThreshold, curve: finalThresholdCurve },
				trainingEvaluation: evaluate(finalScored),
				nondecisiveScoreDistributions: nondecisiveDistributions(finalScored),
				errors: classificationErrors(finalScored),
			},
			modelCandidate,
		},
	}
}

type VariantRun = ReturnType<typeof runVariant>

function compareVariantRuns(first: VariantRun, second: VariantRun): number {
	const compareMetric = (left: number | null, right: number | null): number => {
		const firstValue = left ?? -Infinity
		const secondValue = right ?? -Infinity
		if (Math.abs(firstValue - secondValue) <= 1e-15) return 0
		return firstValue > secondValue ? 1 : -1
	}
	for (const metric of ["balancedAccuracy", "rocAuc"] as const) {
		const comparison = compareMetric(first.selectionMetrics[metric], second.selectionMetrics[metric])
		if (comparison !== 0) return comparison
	}
	if (first.definition.features.length !== second.definition.features.length) {
		return first.definition.features.length < second.definition.features.length ? 1 : -1
	}
	return variantDefinitions.indexOf(first.definition) < variantDefinitions.indexOf(second.definition) ? 1 : -1
}

const variantRuns = variantDefinitions.map(runVariant)
const eligibleRuns = variantRuns.filter((run) => run.definition.shippable &&
	run.selectionMetrics.sensitivity !== null &&
	run.selectionMetrics.sensitivity >= fittingConfig.variantSelection.minimumPooledLeaveTemporalBatchOutSensitivity)
const selectedRun = eligibleRuns.length === 0
	? null
	: eligibleRuns.reduce((best, run) => compareVariantRuns(run, best) > 0 ? run : best)
const model = selectedRun?.modelCandidate ?? null
const variantSelection = {
	rule: fittingConfig.variantSelection,
	candidates: variantRuns.map((run) => ({
		variant: run.definition.name,
		shippable: run.definition.shippable,
		featureCount: run.definition.features.length,
		...run.selectionMetrics,
		meetsSensitivityRequirement: run.definition.shippable && run.selectionMetrics.sensitivity !== null &&
			run.selectionMetrics.sensitivity >= fittingConfig.variantSelection.minimumPooledLeaveTemporalBatchOutSensitivity,
	})),
	selectedVariant: selectedRun?.definition.name ?? null,
	outcome: selectedRun === null
		? "No shippable variant met the pooled leave-temporal-batch-out sensitivity requirement; model withheld."
		: "Selected by the predeclared pooled leave-temporal-batch-out ordering.",
}

await writeJsonAtomic({ path: outputPath, refuseOverwrite: true }, {
	schemaVersion: 1,
	fitVersion,
	generatedAt: new Date().toISOString(),
	development: {
		file: relative(researchRoot, developmentPath),
		sha256: trainingArtifactSha256,
		developmentVersion: development.value.developmentVersion,
		evidenceVersion: development.value.evidenceVersion,
		counts: { total: development.entries.length, decisive: decisive.length, judgments: countJudgments(development.entries) },
		provenanceValidation: development.provenanceValidation,
		temporalReviewBatchInterpretation: "Batch differences can reflect reviewer drift and adaptive case selection; they are not population or source cohorts.",
	},
	fittingConfig,
	fittingConfigSha256,
	variantSelection,
	variants: Object.fromEntries(variantRuns.map((run) => [run.definition.name, run.report])),
	model,
})
process.stderr.write(`Fit ${modelVersion} from ${decisive.length} decisive exact-pair labels; selected ${selectedRun?.definition.name ?? "no model"} at ${outputPath}\n`)
