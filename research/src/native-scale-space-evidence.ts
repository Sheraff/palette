import { createHash } from "node:crypto"
import { rgbToOKLab } from "./color.ts"
import {
	NATIVE_SCALE_SPACE_MAX_CANDIDATES,
	NATIVE_SCALE_SPACE_MAX_FAMILIES,
	NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
	NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES,
	NATIVE_SCALE_SPACE_Q24,
	accumulateQ24PartitionPlane,
	buildBinaryMaskSummedAreaTable,
	canonicalJson,
	canonicalTypedArrayHash,
	centeredClippedBoxQ24At,
	createQ24PartitionResidualAccumulator,
	domainSeparatedCanonicalSha256,
	filterSummedAreaTableQ24,
	finalizeQ24PartitionResidual,
	nativeScaleSpacePixelBudgetDimensions,
	nativeScaleSpaceRasterBounds,
	nativeScaleSpaceTargetDimensions,
	sampleQ24PlaneAtTargetCenters,
	verifyQ24CenterSamplesExact,
	type NativeScaleSpaceArm,
	type NativeScaleSpaceCenterSamples,
	type Q24PartitionResidualSummary,
	type NativeScaleSpaceTarget,
} from "./native-scale-space-raster.ts"
import { analyzeResolutionEvidence, type ResolutionEvidenceInputIdentity } from "./resolution-evidence.ts"
import type { RawImage, RGB } from "./types.ts"

export const NATIVE_SCALE_SPACE_EXPERIMENT_ID = "native-scale-space-evidence-audit-0.1.0-development" as const
export const NATIVE_SCALE_SPACE_AVAILABILITY_VERSION = "native-scale-space-availability-v1" as const
export const NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION = "native-scale-space-output-v1" as const
export const NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION = "native-scale-space-metric-definitions-v1" as const
export const NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION = "native-scale-space-fixtures-v1" as const
export const NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION = "native-scale-space-expectations-v1" as const
export const NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION = "native-scale-space-result-source-shard-v1" as const
export const NATIVE_SCALE_SPACE_RESULT_COLUMNS_VERSION = "native-scale-space-result-columns-v1" as const
export const NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION = "native-scale-space-result-merkle-v1" as const
export const NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION = "native-scale-space-import-policy-v1" as const
export const NATIVE_SCALE_SPACE_EXPERIMENT_VERSION = NATIVE_SCALE_SPACE_EXPERIMENT_ID
export const NATIVE_SCALE_SPACE_EVIDENCE_VERSION = NATIVE_SCALE_SPACE_AVAILABILITY_VERSION
export const NATIVE_SCALE_SPACE_OUTPUT_VERSION = NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION
export const NATIVE_SCALE_SPACE_METRIC_REGISTRY_VERSION = NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION
export const NATIVE_SCALE_SPACE_FIXTURES_VERSION = NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION
export const NATIVE_SCALE_SPACE_MERKLE_VERSION = NATIVE_SCALE_SPACE_MERKLE_TREE_VERSION
export const NATIVE_SCALE_SPACE_COMPONENT_SIGNATURE_VERSION = "native-scale-space-component-signature-v1" as const
export const NATIVE_SCALE_SPACE_CANDIDATE_STABLE_KEY_VERSION = "native-scale-space-candidate-stable-key-v1" as const
export const NATIVE_SCALE_SPACE_FAMILY_STABLE_KEY_VERSION = "native-scale-space-family-stable-key-v1" as const
export const NATIVE_SCALE_SPACE_AVAILABILITY_IDENTITY_VERSION = "native-scale-space-availability-identity-v1" as const
export const NATIVE_SCALE_SPACE_FIXTURE_IDENTITY_VERSION = "native-scale-space-fixture-v1" as const
export const NATIVE_SCALE_SPACE_TRANSFORM_IDENTITY_VERSION = "native-scale-space-transform-v1" as const
export const NATIVE_SCALE_SPACE_TRANSFORM_CORRESPONDENCE_VERSION = "native-scale-space-transform-correspondence-v1" as const
export const NATIVE_SCALE_SPACE_COMMON_DOMAIN_SAMPLE_BUDGET = 16_384
export const NATIVE_SCALE_SPACE_THRESHOLDS = Object.freeze([
	NATIVE_SCALE_SPACE_Q24 / 4,
	NATIVE_SCALE_SPACE_Q24 / 2,
	3 * NATIVE_SCALE_SPACE_Q24 / 4,
] as const)

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export const NATIVE_SCALE_SPACE_AVAILABILITY_POLICY = deepFreeze({
	version: NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
	candidateMean: "exact-bootstrap.candidates.meanLab-copy",
	analysisRepresentative: "compact-exact-bootstrap-analysis-representative-copy",
	nativeWitness: "minimum-squared-oklab-distance-to-bootstrap-mean-then-lower-native-index",
	transformCorrespondenceExactRgb: "lexicographically-smallest-exact-native-rgb-in-candidate-mask",
	transformCorrespondenceKey: "exactRgb-plus-inverse-mapped-native-mask-sha256",
} as const)

export const NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256 = domainSeparatedCanonicalSha256(
	NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
	NATIVE_SCALE_SPACE_AVAILABILITY_POLICY,
)

function assertSha256(value: string, name: string): void {
	if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`${name} must be a lowercase SHA-256 digest`)
}

function assertPositiveSafeInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`)
}

function assertExactUint8Array(value: unknown, name: string): asserts value is Uint8Array {
	if (!(value instanceof Uint8Array) || value.constructor !== Uint8Array) {
		throw new TypeError(`${name} must be exactly a Uint8Array`)
	}
}

function assertExactUint32Array(value: unknown, name: string): asserts value is Uint32Array {
	if (!(value instanceof Uint32Array) || value.constructor !== Uint32Array) {
		throw new TypeError(`${name} must be exactly a Uint32Array`)
	}
}

function assertQ24(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > NATIVE_SCALE_SPACE_Q24) {
		throw new RangeError(`${name} must be an unsigned Q0.24 value`)
	}
}

function thresholdSuffix(thresholdQ24: number): "Q/4" | "Q/2" | "3Q/4" {
	if (thresholdQ24 === NATIVE_SCALE_SPACE_Q24 / 4) return "Q/4"
	if (thresholdQ24 === NATIVE_SCALE_SPACE_Q24 / 2) return "Q/2"
	if (thresholdQ24 === 3 * NATIVE_SCALE_SPACE_Q24 / 4) return "3Q/4"
	throw new RangeError("threshold must be Q/4, Q/2, or 3Q/4")
}

export type NativeScaleSpaceMetricStatus = "structural" | "diagnostic" | "synthetic-directional"

export interface NativeScaleSpaceMetricDefinition {
	readonly id: string
	readonly version: typeof NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION
	readonly inputs: readonly string[]
	readonly formula: string
	readonly units: string
	readonly normalization: string
	readonly tieRule: string
	readonly emptyCase: string
	readonly numericEncoding: string
	readonly status: NativeScaleSpaceMetricStatus
	readonly arms: readonly NativeScaleSpaceArm[]
}

function metricDefinition(
	id: string,
	inputs: readonly string[],
	formula: string,
	units: string,
	normalization: string,
	tieRule: string,
	emptyCase: string,
	numericEncoding: string,
	status: NativeScaleSpaceMetricStatus,
	arms: readonly NativeScaleSpaceArm[],
): NativeScaleSpaceMetricDefinition {
	return {
		id,
		version: NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
		inputs,
		formula,
		units,
		normalization,
		tieRule,
		emptyCase,
		numericEncoding,
		status,
		arms,
	}
}

const allArms = ["A", "B", "C"] as const
const thresholdDefinitions = NATIVE_SCALE_SPACE_THRESHOLDS.flatMap((thresholdQ24) => {
	const suffix = thresholdSuffix(thresholdQ24)
	const thresholdInput = `thresholdQ24=${thresholdQ24}`
	return [
		metricDefinition(`field.activeMass.${suffix}`, ["q24", thresholdInput], "count(q24>=thresholdQ24)/n", "fraction", "lattice-cell-count", "none", "no active cells gives 0", "Float64", "diagnostic", allArms),
		metricDefinition(`component.count.${suffix}`, ["q24", "width", "height", thresholdInput], "four-connected active component count", "count", "none", "row-major first; mark on push; visit left/right/up/down", "no active cells gives 0", "unsigned-safe-integer", "synthetic-directional", allArms),
		metricDefinition(`component.countDensity.${suffix}`, ["q24", "width", "height", thresholdInput], "componentCount/n", "components/cell", "lattice-cell-count", "component traversal is fixed", "n=0 invalid", "Float64", "diagnostic", allArms),
		metricDefinition(`component.largestMass.${suffix}`, ["q24", "width", "height", thresholdInput], "largestComponentCells/n", "fraction", "lattice-cell-count", "equal component sizes retain traversal order", "no active cells gives 0", "Float64", "synthetic-directional", allArms),
		metricDefinition(`component.signature.${suffix}`, ["q24", "width", "height", thresholdInput], "SHA256(component-signature-domain||canonical-header||NUL||ordered-seven-u32be-records)", "digest", "none", "records ordered by ascending firstIndex", "empty hashes header and zero record bytes", "lowercase-sha256-hex", "structural", allArms),
		metricDefinition(`field.broad.${suffix}`, ["activeMass", "largestMass", thresholdInput], "p=activeMass;p=0?0:min(1,largestMass/sqrt(p))", "fraction", "lattice-cell-count", "none", "exact p=0 branch gives 0", "Float64", "synthetic-directional", allArms),
		metricDefinition(`detail.boundaryDensity.${suffix}`, ["q24", "width", "height", thresholdInput], "discordant-horizontal-and-vertical-active-neighbor-edges/total-neighbor-edges", "fraction", "horizontal-plus-vertical-lattice-edges", "none", "zero-edge lattice gives 0", "Float64", "synthetic-directional", allArms),
		metricDefinition(`frame.borderOwnership.${suffix}`, ["q24", "width", "height", thresholdInput], "active-border-band-cells/border-band-cells", "fraction", "border-band-cell-count", "none", "empty border invalid", "Float64", "diagnostic", allArms),
		metricDefinition(`frame.interiorOwnership.${suffix}`, ["q24", "width", "height", thresholdInput], "active-interior-cells/interior-cells", "fraction", "interior-cell-count", "none", "no interior gives 0 and interiorEmpty=true", "Float64", "diagnostic", allArms),
		metricDefinition(`frame.excess.${suffix}`, ["borderOwnership", "interiorOwnership", thresholdInput], "max(0,borderOwnership-interiorOwnership)", "fraction", "none", "none", "follows ownership cases", "Float64", "synthetic-directional", allArms),
		metricDefinition(`frame.sideCoverage.${suffix}`, ["q24", "width", "height", thresholdInput], "active top/right/bottom/left cells divided by each side length", "four-fractions", "side-length-per-entry", "side order top,right,bottom,left", "positive dimensions required", "Float64[4]", "diagnostic", allArms),
		metricDefinition(`typography.thinMass.${suffix}`, ["active-components", "width", "height", thresholdInput], "qualify iff 50*min(boxWidth*height,boxHeight*width)<=width*height and max(boxWidth*height,boxHeight*width)>=3*min(...);sum qualifying area/n", "fraction", "lattice-cell-count", "component traversal is fixed", "no qualifying component gives 0", "Float64", "synthetic-directional", allArms),
	]
})

export const NATIVE_SCALE_SPACE_METRIC_DEFINITIONS: readonly NativeScaleSpaceMetricDefinition[] = deepFreeze([
	metricDefinition("field.mass", ["q24"], "sum(q24)/(Q*n)", "fraction", "Q0.24-and-lattice-cell-count", "none", "n=0 invalid", "Float64", "diagnostic", allArms),
	...thresholdDefinitions,
	metricDefinition("detail.lowPassChange", ["native-binary-mask", "q24"], "sum(abs(Q*binary-q24))/(Q*n)", "fraction", "Q0.24-and-lattice-cell-count", "none", "A/C unavailable: null with reason", "Float64-or-null", "diagnostic", ["B"]),
	metricDefinition("graph.nodeCount", ["frozen-availability"], "frozen candidate count", "count", "none", "candidate IDs retain frozen order", "none", "unsigned-safe-integer", "structural", allArms),
	metricDefinition("graph.orderedEdgeCount", ["frozen-availability"], "K*(K-1)", "count", "none", "stable-key ordering breaks endpoint ordering ties", "K<2 gives 0", "unsigned-safe-integer", "structural", allArms),
	metricDefinition("endpoint.distance", ["from-native-witness-oklab", "to-native-witness-oklab"], "euclidean OKLab distance", "OKLab-distance", "none", "lower stable-key endpoint wins ordering ties", "equal RGB may give 0", "Float64", "diagnostic", allArms),
	metricDefinition("endpoint.fromPresence", ["from-q24"], "field.mass(from)", "fraction", "Q0.24-and-lattice-cell-count", "none", "none", "Float64", "diagnostic", allArms),
	metricDefinition("endpoint.toPresence", ["to-q24"], "field.mass(to)", "fraction", "Q0.24-and-lattice-cell-count", "none", "none", "Float64", "diagnostic", allArms),
	metricDefinition("endpoint.balance", ["fromPresence", "toPresence"], "s=from+to;s=0?0:1-abs(from-to)/s", "fraction", "none", "none", "exact zero branch gives 0", "Float64", "diagnostic", allArms),
	metricDefinition("continuity.pairCoverage", ["from-q24", "to-q24"], "sum(min(Q,qFrom+qTo))/(Q*n)", "fraction", "Q0.24-and-lattice-cell-count", "none", "n=0 invalid", "Float64", "synthetic-directional", allArms),
	metricDefinition("continuity.overlap", ["from-q24", "to-q24"], "sum(min(qFrom,qTo))/sum(max(qFrom,qTo))", "fraction", "pair-maximum-mass", "none", "zero denominator gives 0", "Float64", "diagnostic", allArms),
	...NATIVE_SCALE_SPACE_THRESHOLDS.map((thresholdQ24) => metricDefinition(
		`topology.pairConnectedShare.${thresholdSuffix(thresholdQ24)}`,
		["from-q24", "to-q24", `thresholdQ24=${thresholdQ24}`],
		"largest four-connected component of qFrom+qTo>=thresholdQ24 divided by pair-active cells",
		"fraction",
		"pair-active-cell-count",
		"component traversal is fixed",
		"no pair-active cells gives 0",
		"Float64",
		"synthetic-directional",
		allArms,
	)),
	metricDefinition("reconstruction.meanOklab", ["native-reference-rgb", "argmax-witness-rgb"], "mean sample OKLab distance", "OKLab-distance", "common-domain-sample-count", "argmax ties choose lexicographically smaller stable key", "no samples invalid", "Float64", "diagnostic", allArms),
	metricDefinition("reconstruction.p95Oklab", ["native-reference-rgb", "argmax-witness-rgb"], "ascending distances at ceil(0.95*n)-1", "OKLab-distance", "common-domain-sample-order", "equal values retain sample order; argmax ties use stable key", "no samples invalid", "Float64", "diagnostic", allArms),
	metricDefinition("reconstruction.maxOklab", ["native-reference-rgb", "argmax-witness-rgb"], "maximum sample OKLab distance", "OKLab-distance", "none", "argmax ties choose lexicographically smaller stable key", "no samples invalid", "Float64", "diagnostic", allArms),
	metricDefinition("stability.bcSampleExact", ["B-q24", "C-q24", "C-source-indices"], "every C value equals indexed B value", "boolean", "none", "none", "any mismatch false", "boolean", "structural", ["C"]),
	metricDefinition("stability.partitionResidualBound", ["all-candidate-q24"], "all abs(sumCandidateQ24-Q)<=floor(K/2)", "boolean", "Q0.24", "none", "none", "boolean", "structural", ["B"]),
	metricDefinition("stability.transformBDeltaQ24", ["parent-B", "transformed-B", "transform-inverse"], "B'(p')-B(inverseTransform(p'))", "Int32-Q0.24-vector-and-reductions", "none", "transform output row-major", "empty transform invalid", "Int32Array-hash-min-max-BigInt-sum-Float64-mean-absolute", "diagnostic", ["B"]),
	metricDefinition("stability.transformCToParentBDeltaQ24", ["transformed-C", "transformed-C-source-indices", "parent-B", "transform-inverse"], "C'(cell)-B(inverseTransform(declared-B'-source-index))", "Int32-Q0.24-vector-and-reductions", "none", "target row-major", "empty target invalid", "Int32Array-hash-min-max-BigInt-sum-Float64-mean-absolute", "diagnostic", ["C"]),
] as const)

export const NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256 = domainSeparatedCanonicalSha256(
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS,
)

const metricDefinitionIds = new Set(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.map(({ id }) => id))

export const NATIVE_SCALE_SPACE_FIXTURE_RGB = deepFreeze({
	D: [16, 24, 40],
	L: [232, 184, 72],
	F: [220, 48, 64],
	G: [36, 180, 112],
	T: [244, 240, 224],
	S0: [100, 110, 120],
	S1: [108, 116, 124],
} as const satisfies Readonly<Record<string, RGB>>)

export const NATIVE_SCALE_SPACE_FIXTURE_TARGETS: readonly NativeScaleSpaceTarget[] = deepFreeze([
	{ kind: "max-edge", value: 8 },
	{ kind: "max-edge", value: 16 },
	{ kind: "pixel-budget", value: 64 },
	{ kind: "pixel-budget", value: 256 },
] as const)

export type NativeScaleSpaceFixtureId =
	| "uniform-d"
	| "vertical-split"
	| "checker-1px"
	| "interior-specks"
	| "frame-interior"
	| "thin-line"
	| "broad-ramp"
	| "local-ramp"
	| "subtle-ramp"
	| "seeded-noise"

export interface NativeScaleSpaceFixtureManifestEntry {
	readonly id: NativeScaleSpaceFixtureId
	readonly width: number
	readonly height: number
	readonly pattern: string
}

const fixtureEntries: readonly NativeScaleSpaceFixtureManifestEntry[] = [
	{ id: "uniform-d", width: 32, height: 24, pattern: "every-pixel-D" },
	{ id: "vertical-split", width: 32, height: 24, pattern: "x<16?D:L" },
	{ id: "checker-1px", width: 32, height: 24, pattern: "(x+y)%2===0?D:L" },
	{ id: "interior-specks", width: 32, height: 24, pattern: "L-at-x-{4,12,20,28}-and-y-{3,11,19};otherwise-D" },
	{ id: "frame-interior", width: 32, height: 32, pattern: "F-at-two-cell-frame;G-at-[10,22)x[10,22);otherwise-D" },
	{ id: "thin-line", width: 32, height: 24, pattern: "y===11?T:D" },
	{ id: "broad-ramp", width: 32, height: 24, pattern: "floor((D_c*(31-x)+L_c*x+15)/31)" },
	{ id: "local-ramp", width: 32, height: 24, pattern: "x-in-[8,24):floor((D_c*(23-x)+L_c*(x-8)+7)/15);outside:(x+y)%2===1?F:G" },
	{ id: "subtle-ramp", width: 32, height: 24, pattern: "floor((S0_c*(31-x)+S1_c*x+15)/31)" },
	{ id: "seeded-noise", width: 32, height: 24, pattern: "vertical-split-plus-row-major-rgb-xorshift32-0x5eed1234-(next%3)-1-clamped" },
]

export const NATIVE_SCALE_SPACE_FIXTURE_MANIFEST = deepFreeze({
	version: NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
	byteLayout: "row-major-interleaved-rgb-uchar;offset=((y*width+x)*3+c)",
	maskLayout: "row-major-uint8;offset=y*width+x",
	rgb: NATIVE_SCALE_SPACE_FIXTURE_RGB,
	fixtures: fixtureEntries,
	xorshift32: {
		seed: 0x5eed1234,
		step: "s^=s<<13;s^=s>>>17;s^=s<<5;unsigned-after-each-assignment",
		iteration: "row-major-then-r-g-b",
	},
} as const)

export const NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256 = domainSeparatedCanonicalSha256(
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST,
)

export type NativeScaleSpaceTransformId =
	| "identity"
	| "nearest-2x"
	| "reflect-horizontal"
	| "rotate-180"
	| "rotate-90-clockwise"

export interface NativeScaleSpaceTransformDefinition {
	readonly id: NativeScaleSpaceTransformId
	readonly outputDimensions: string
	readonly inverseSourceCoordinate: string
}

export const NATIVE_SCALE_SPACE_TRANSFORMS: readonly NativeScaleSpaceTransformDefinition[] = deepFreeze([
	{ id: "identity", outputDimensions: "W x H", inverseSourceCoordinate: "(x',y')" },
	{ id: "nearest-2x", outputDimensions: "2W x 2H", inverseSourceCoordinate: "(floor(x'/2),floor(y'/2))" },
	{ id: "reflect-horizontal", outputDimensions: "W x H", inverseSourceCoordinate: "(W-1-x',y')" },
	{ id: "rotate-180", outputDimensions: "W x H", inverseSourceCoordinate: "(W-1-x',H-1-y')" },
	{ id: "rotate-90-clockwise", outputDimensions: "H x W", inverseSourceCoordinate: "(y',H-1-x')" },
] as const)

export interface NativeScaleSpaceOperandTuple {
	readonly fixtureId: NativeScaleSpaceFixtureId
	readonly transformId: "identity"
	readonly arm: NativeScaleSpaceArm
	readonly target: NativeScaleSpaceTarget | null
	readonly thresholdQ24: number
	readonly candidateSelectors: readonly Readonly<{ rgbKey: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB; rgb: RGB }>[]
	readonly resolvedCandidateKeys: readonly string[]
	readonly orderedEndpoint: Readonly<{ from: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB; to: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB }> | null
	readonly metricIds: readonly string[]
	readonly applicability: string
}

function operand(
	fixtureId: NativeScaleSpaceFixtureId,
	arm: NativeScaleSpaceArm,
	target: NativeScaleSpaceTarget | null,
	selectors: readonly (keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB)[],
	orderedEndpoint: { from: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB; to: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB } | null,
	metricIds: readonly string[],
	applicability: string,
): NativeScaleSpaceOperandTuple {
	for (const metricId of metricIds) {
		if (!metricDefinitionIds.has(metricId)) throw new Error(`expectation references unregistered metric ${metricId}`)
	}
	return {
		fixtureId,
		transformId: "identity",
		arm,
		target,
		thresholdQ24: NATIVE_SCALE_SPACE_Q24 / 2,
		candidateSelectors: selectors.map((rgbKey) => ({ rgbKey, rgb: NATIVE_SCALE_SPACE_FIXTURE_RGB[rgbKey] })),
		resolvedCandidateKeys: [],
		orderedEndpoint,
		metricIds,
		applicability,
	}
}

const target8 = { kind: "max-edge", value: 8 } as const
const target16 = { kind: "max-edge", value: 16 } as const
const uniformMetrics = ["field.mass", "field.activeMass.Q/2", "component.count.Q/2", "detail.boundaryDensity.Q/2", "stability.bcSampleExact"] as const
const geometryMetrics = ["field.mass", "component.count.Q/2", "component.signature.Q/2"] as const

export const NATIVE_SCALE_SPACE_EXPECTATIONS = deepFreeze({
	version: NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
	transforms: NATIVE_SCALE_SPACE_TRANSFORMS,
	targetMatrix: NATIVE_SCALE_SPACE_FIXTURE_TARGETS,
	fixtureMatrix: [
		{ id: "source-bytes", rows: "F x {identity}", predicate: "fixture bytes and fixture identity recompute exactly" },
		{ id: "native-transform", rows: "F x X+ x {A}", predicate: "transformed bytes and inverse-mapped native candidate masks correspond" },
		{ id: "filter-recompute", rows: "F x X x Y x {B}", predicate: "B recomputes by the exact SAT/BigInt/Q0.24 policy" },
		{ id: "sample-recompute", rows: "F x X x Y x {C}", predicate: "C equals sampled B at every declared source index" },
		{ id: "phase-diagnostics", rows: "F x X+ x Y x {B,C}", predicate: "emit registered transform deltas without an invariance assertion" },
		{ id: "deterministic-rerun", rows: "F x X x Y x {B,C} plus F x X x {A}", predicate: "typed hashes and metrics repeat exactly" },
	],
	applicabilityRules: {
		candidate: "applicable when at least one declared candidate resolves",
		orderedEndpoint: "from and to resolve independently to distinct stable keys and the ordered complete-graph edge exists",
		unmatchedTransformCandidate: "explicit-inapplicable-no-substitution",
		transformCorrespondenceExactRgb: "lexicographically-smallest-exact-native-rgb-in-candidate-mask;separate-from-native-and-analysis-witnesses",
	},
	structuralPredicates: [
		"source-and-transform-bytes-exact",
		"source-and-transform-identities-exact",
		"native-witness-membership-exact",
		"native-candidate-partition-exact",
		"q24-residual-bounded",
		"B-recompute-exact",
		"C-sample-exact",
		"metrics-finite-and-registry-closed",
		"transform-coordinate-inversion-exact",
		"typed-hashes-exact",
		"deterministic-rerun-exact",
	],
	scientificPredicates: [
		{
			id: "uniformInvariantSubset", required: true,
			operands: [
				operand("uniform-d", "A", null, ["D"], null, uniformMetrics, "D resolves"),
				operand("uniform-d", "B", target8, ["D"], null, uniformMetrics, "D resolves"),
				operand("uniform-d", "C", target8, ["D"], null, uniformMetrics, "D resolves"),
			],
			applicability: "D resolves in all rows",
			boolean: "every mass and active mass is 1; component count is 1; boundary density is 0; C samples B exactly",
		},
		{
			id: "checkerAttenuated", required: true,
			operands: [
				operand("checker-1px", "A", null, ["D"], null, ["detail.boundaryDensity.Q/2"], "D resolves"),
				operand("checker-1px", "B", target8, ["D"], null, ["detail.boundaryDensity.Q/2"], "D resolves"),
			],
			applicability: "D resolves in both rows", boolean: "B is strictly less than A",
		},
		{
			id: "splitRetained", required: true,
			operands: [
				operand("vertical-split", "A", null, ["D", "L"], { from: "D", to: "L" }, ["continuity.pairCoverage"], "distinct ordered edge applies"),
				operand("vertical-split", "B", target8, ["D", "L"], { from: "D", to: "L" }, ["continuity.pairCoverage"], "distinct ordered edge applies"),
			],
			applicability: "distinct ordered edge applies in both rows", boolean: "B is at least 0.95*A using Float64 operands",
		},
		{
			id: "geometryDistinguished", required: true,
			operands: [
				operand("vertical-split", "A", null, ["D"], null, geometryMetrics, "D resolves"),
				operand("checker-1px", "A", null, ["D"], null, geometryMetrics, "D resolves"),
			],
			applicability: "D resolves in both rows", boolean: "masses have equal Float64 encoding; signatures differ; split component count is lower",
		},
		{
			id: "broadBeatsLocal", required: true,
			operands: [
				operand("broad-ramp", "B", target8, ["D", "L"], { from: "D", to: "L" }, ["continuity.pairCoverage"], "distinct ordered edge applies"),
				operand("local-ramp", "B", target8, ["D", "L"], { from: "D", to: "L" }, ["continuity.pairCoverage"], "distinct ordered edge applies"),
			],
			applicability: "distinct ordered edge applies in both rows", boolean: "broad is strictly greater than local",
		},
		{
			id: "frameDistinguished", required: true,
			operands: [operand("frame-interior", "B", target16, ["F", "G"], { from: "F", to: "G" }, ["frame.excess.Q/2", "frame.interiorOwnership.Q/2"], "F and G resolve to distinct candidates and edge exists")],
			applicability: "F and G resolve to distinct candidates and edge exists", boolean: "F frame excess is greater than G and G interior ownership is greater than F",
		},
		{
			id: "thinIdentityRetained", required: true,
			operands: [
				operand("thin-line", "A", null, ["T"], null, ["typography.thinMass.Q/2"], "T resolves"),
				operand("thin-line", "B", target16, ["T"], null, ["typography.thinMass.Q/2"], "T resolves"),
				operand("thin-line", "C", target16, ["T"], null, ["typography.thinMass.Q/2"], "T resolves"),
			],
			applicability: "T resolves in all rows", boolean: "resolved witness RGB is exactly T in every row and every thin-mass value is finite",
		},
	],
	dispositionPrecedence: [
		"invalid-structural",
		"valid-fixture-falsified",
		"valid-fixture-supported-diagnostic",
		"valid-fixture-unsupported",
	],
} as const)

export const NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256 = domainSeparatedCanonicalSha256(
	NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
	NATIVE_SCALE_SPACE_EXPECTATIONS,
)

export const NATIVE_SCALE_SPACE_IMPORT_POLICY = deepFreeze({
	version: NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
	localFileAllowlist: {
		successorRuntime: [
			"research/audit-native-scale-space-evidence.ts",
			"research/src/native-scale-space-raster.ts",
			"research/src/native-scale-space-evidence.ts",
			"research/src/native-scale-space-output.ts",
		],
		successorTests: [
			"research/tests/native-scale-space-raster.test.ts",
			"research/tests/native-scale-space-evidence.test.ts",
			"research/tests/native-scale-space-evidence-audit.test.ts",
			"research/tests/native-scale-space-evidence-artifact.test.ts",
		],
		frozenDirectDependencies: [
			"research/src/resolution-raster.ts",
			"research/src/resolution-evidence.ts",
			"research/src/color.ts",
			"research/src/types.ts",
		],
		canonicalChildExecutable: ["research/resolution-canonical-raster-child.ts"],
		canonicalChildTransitiveOnly: ["research/src/image.ts"],
	},
	dependencyRules: {
		canonicalChildTransitiveIncomingEdge: "research/resolution-canonical-raster-child.ts",
		modernSharp: "runner-or-raster-lane-only",
		canonicalSharp: "canonical-child-closure-only",
		localStaticImports: "must-resolve-to-allowlist",
		canonicalChild: "spawned-executable-never-imported-in-modern-process",
	},
	forbiddenRegistry: {
		exactFiles: [
			"research/src/extract.ts",
			"research/src/palette.ts",
			"research/src/candidates.ts",
			"research/src/candidate-output.ts",
			"research/src/candidate-validation.ts",
			"research/src/guarded-palette.ts",
			"research/src/pareto-experiment.ts",
			"research/resolution-experiment-output-child.ts",
		],
		basenameTokens: ["next", "joint", "review", "gallery", "feedback"],
		roleAndCandidateSelectorTokens: ["role", "selector", "solver", "candidate-availability", "candidate-generation"],
		paletteModules: "research/src/*palette* except exact native-scale-space successor modules",
		dynamicLoading: "all local import(),require,eval-generated-import,worker,child,plugin paths except exact canonical child executable",
	},
} as const)

export const NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256 = domainSeparatedCanonicalSha256(
	NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
	NATIVE_SCALE_SPACE_IMPORT_POLICY,
)

export interface NativeScaleSpaceCandidateAvailability {
	readonly id: number
	readonly meanOklab: RGB
	readonly nativePixelCount: number
	readonly analysisRepresentativeRgb: RGB
	readonly analysisRepresentativeLab: RGB
	readonly analysisRepresentativeIndex: number
	readonly analysisRepresentativeDistance: number
	readonly analysisRepresentativeNativeExact: boolean
	readonly witnessRgb: RGB
	readonly witnessOklab: RGB
	readonly witnessIndex: number
	readonly witnessSquaredDistance: number
	readonly correspondenceRgb: RGB
	readonly nativeMaskSha256: string
	readonly stableKey: string
}

export interface NativeScaleSpaceFamilyAvailability {
	readonly id: number
	readonly anchorCandidateId: number
	readonly memberOffset: number
	readonly memberCount: number
	readonly nativePixelCount: number
	readonly nativeMaskSha256: string
	readonly stableKey: string
}

export interface NativeScaleSpaceAvailability {
	readonly version: typeof NATIVE_SCALE_SPACE_AVAILABILITY_VERSION
	readonly policy: typeof NATIVE_SCALE_SPACE_AVAILABILITY_POLICY
	readonly policySha256: typeof NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256
	readonly identitySha256: string
	readonly sourceSha256: string
	readonly decodedNativeIdentity: string
	readonly width: number
	readonly height: number
	readonly candidateLabels: Uint8Array
	readonly candidateLabelsSha256: string
	readonly candidates: readonly NativeScaleSpaceCandidateAvailability[]
	readonly families: readonly NativeScaleSpaceFamilyAvailability[]
	readonly candidateFamilyIds: Uint8Array
	readonly familyMemberOffsets: Uint8Array
	readonly familyMemberCandidateIds: Uint8Array
	readonly orderedCandidateEdgeCount: number
	readonly predecessorMetadata: Readonly<{
		version: string
		policySha256: string
		occupiedBinCount: number
		candidateLabelsSha256: string
	}>
}

export interface NativeScaleSpaceAvailabilityIdentityInput {
	readonly sourceSha256: string
	readonly decodedNativeIdentity: string
	readonly rasterPolicyIdentity?: string
}

function rgbAt(data: Uint8Array, pixel: number): RGB {
	const offset = pixel * 3
	return [data[offset], data[offset + 1], data[offset + 2]]
}

function squaredDistance(first: RGB, second: RGB): number {
	return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2
}

function compareRgb(first: RGB, second: RGB): number {
	return first[0] - second[0] || first[1] - second[1] || first[2] - second[2]
}

/** Bootstrap predecessor availability exactly once, then discard every non-authorized predecessor field. */
export function createNativeScaleSpaceAvailability(
	native: RawImage,
	input: NativeScaleSpaceAvailabilityIdentityInput,
): NativeScaleSpaceAvailability {
	const bounds = nativeScaleSpaceRasterBounds(native.width, native.height)
	assertExactUint8Array(native.data, "native RGB data")
	if (native.data.length !== bounds.rgbBytes) throw new RangeError("native RGB byte length does not match dimensions")
	assertSha256(input.sourceSha256, "sourceSha256")
	assertSha256(input.decodedNativeIdentity, "decodedNativeIdentity")
	if (input.rasterPolicyIdentity !== undefined && input.rasterPolicyIdentity.length === 0) {
		throw new TypeError("rasterPolicyIdentity must be nonempty when supplied")
	}
	const identity: ResolutionEvidenceInputIdentity = {
		analysisRasterIdentity: input.decodedNativeIdentity,
		decodedNativeRasterIdentity: input.decodedNativeIdentity,
		rasterPolicyIdentity: input.rasterPolicyIdentity,
	}
	let bootstrap: ReturnType<typeof analyzeResolutionEvidence> | null = analyzeResolutionEvidence(native, native, identity)
	const candidateCount = bootstrap.candidates.count
	const familyCount = bootstrap.families.count
	const orderedCandidateEdgeCount = candidateCount * Math.max(0, candidateCount - 1)
	if (candidateCount <= 0 || candidateCount > NATIVE_SCALE_SPACE_MAX_CANDIDATES) {
		throw new Error("frozen candidate count is outside its structural limit")
	}
	if (familyCount <= 0 || familyCount > NATIVE_SCALE_SPACE_MAX_FAMILIES) {
		throw new Error("frozen family count is outside its structural limit")
	}
	if (orderedCandidateEdgeCount > NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES) {
		throw new Error("ordered candidate edge count is outside its structural limit")
	}

	const candidateLabels = bootstrap.candidateLabels
	const bootstrapCandidatePixelCounts = bootstrap.candidates.pixelCounts.slice()
	const candidateMeans = bootstrap.candidates.meanLab.slice()
	const analysisRepresentativeRgbValues = bootstrap.candidates.analysisRepresentativeRgb.slice()
	const analysisRepresentativeLabValues = bootstrap.candidates.analysisRepresentativeLab.slice()
	const analysisRepresentativeIndices = bootstrap.candidates.analysisRepresentativeIndices.slice()
	const analysisRepresentativeDistances = bootstrap.candidates.analysisRepresentativeDistance.slice()
	const analysisRepresentativeNativeExactValues = bootstrap.candidates.analysisRepresentativeNativeExact.slice()
	const candidateFamilyIds = bootstrap.candidates.familyIds.slice()
	const anchorCandidateIds = bootstrap.families.anchorCandidateIds.slice()
	const predecessorMetadata = deepFreeze({
		version: bootstrap.version,
		policySha256: bootstrap.policySha256,
		occupiedBinCount: bootstrap.occupiedBinCount,
		candidateLabelsSha256: bootstrap.planeHashes.candidateLabels,
	})
	bootstrap = null
	const observedCounts = new Uint32Array(candidateCount)
	for (const label of candidateLabels) {
		if (label === 0xff || label >= candidateCount) throw new Error("candidate label plane contains an unassigned or out-of-domain label")
		observedCounts[label]++
	}
	for (let candidate = 0; candidate < candidateCount; candidate++) {
		if (observedCounts[candidate] === 0) throw new Error("frozen candidate mask is empty")
		if (observedCounts[candidate] !== bootstrapCandidatePixelCounts[candidate]) {
			throw new Error("candidate labels do not reconcile with copied native populations")
		}
	}
	if (observedCounts.reduce((sum, count) => sum + count, 0) !== bounds.pixels) {
		throw new Error("candidate labels do not partition native pixels")
	}

	const mask = new Uint8Array(bounds.pixels)
	const candidates: NativeScaleSpaceCandidateAvailability[] = []
	for (let candidate = 0; candidate < candidateCount; candidate++) {
		const meanOffset = candidate * 3
		const meanOklab: RGB = [
			candidateMeans[meanOffset],
			candidateMeans[meanOffset + 1],
			candidateMeans[meanOffset + 2],
		]
		const analysisRepresentativeRgb: RGB = [
			analysisRepresentativeRgbValues[meanOffset],
			analysisRepresentativeRgbValues[meanOffset + 1],
			analysisRepresentativeRgbValues[meanOffset + 2],
		]
		const analysisRepresentativeLab: RGB = [
			analysisRepresentativeLabValues[meanOffset],
			analysisRepresentativeLabValues[meanOffset + 1],
			analysisRepresentativeLabValues[meanOffset + 2],
		]
		const analysisRepresentativeIndex = analysisRepresentativeIndices[candidate]
		const analysisRepresentativeDistance = analysisRepresentativeDistances[candidate]
		const analysisRepresentativeNativeExact = analysisRepresentativeNativeExactValues[candidate] === 1
		let witnessIndex = -1
		let witnessSquaredDistance = Infinity
		let correspondenceRgb: RGB | null = null
		for (let pixel = 0; pixel < candidateLabels.length; pixel++) {
			const member = candidateLabels[pixel] === candidate
			mask[pixel] = member ? 1 : 0
			if (!member) continue
			const rgb = rgbAt(native.data, pixel)
			const lab = rgbToOKLab(rgb)
			const distance = squaredDistance(lab, meanOklab)
			if (distance < witnessSquaredDistance) {
				witnessSquaredDistance = distance
				witnessIndex = pixel
			}
			if (correspondenceRgb === null || compareRgb(rgb, correspondenceRgb) < 0) correspondenceRgb = rgb
		}
		if (witnessIndex < 0 || candidateLabels[witnessIndex] !== candidate) throw new Error("candidate witness is outside its mask")
		if (correspondenceRgb === null) throw new Error("candidate correspondence RGB is missing exact native membership")
		const witnessRgb = rgbAt(native.data, witnessIndex)
		const witnessOffset = witnessIndex * 3
		if (witnessRgb[0] !== native.data[witnessOffset] || witnessRgb[1] !== native.data[witnessOffset + 1] || witnessRgb[2] !== native.data[witnessOffset + 2]) {
			throw new Error("candidate witness bytes are not source exact")
		}
		const nativeMaskSha256 = canonicalTypedArrayHash(mask, [native.height, native.width])
		const keyDescriptor = {
			version: NATIVE_SCALE_SPACE_CANDIDATE_STABLE_KEY_VERSION,
			sourceSha256: input.sourceSha256,
			decodedNativeIdentity: input.decodedNativeIdentity,
			witnessRgb,
			witnessIndex,
			nativeMaskSha256,
		}
		candidates.push(deepFreeze({
			id: candidate,
			meanOklab,
			nativePixelCount: observedCounts[candidate],
			analysisRepresentativeRgb,
			analysisRepresentativeLab,
			analysisRepresentativeIndex,
			analysisRepresentativeDistance,
			analysisRepresentativeNativeExact,
			witnessRgb,
			witnessOklab: rgbToOKLab(witnessRgb),
			witnessIndex,
			witnessSquaredDistance,
			correspondenceRgb,
			nativeMaskSha256,
			stableKey: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_CANDIDATE_STABLE_KEY_VERSION, keyDescriptor),
		}))
	}
	if (new Set(candidates.map(({ stableKey }) => stableKey)).size !== candidates.length) {
		throw new Error("candidate stable-key identity collision")
	}

	const memberLists = Array.from({ length: familyCount }, () => [] as number[])
	for (let candidate = 0; candidate < candidateCount; candidate++) {
		const family = candidateFamilyIds[candidate]
		if (family === 0xff || family >= familyCount) throw new Error("candidate family membership is unassigned or out of domain")
		memberLists[family].push(candidate)
	}
	const familyMemberOffsets = new Uint8Array(familyCount + 1)
	for (let family = 0; family < familyCount; family++) {
		if (memberLists[family].length === 0) throw new Error("frozen family is empty")
		if (!memberLists[family].includes(anchorCandidateIds[family])) throw new Error("family anchor is not a family member")
		familyMemberOffsets[family + 1] = familyMemberOffsets[family] + memberLists[family].length
	}
	const familyMemberCandidateIds = new Uint8Array(candidateCount)
	for (let family = 0; family < familyCount; family++) {
		familyMemberCandidateIds.set(memberLists[family], familyMemberOffsets[family])
	}
	const families: NativeScaleSpaceFamilyAvailability[] = []
	for (let family = 0; family < familyCount; family++) {
		let nativePixelCount = 0
		for (let pixel = 0; pixel < candidateLabels.length; pixel++) {
			const member = candidateFamilyIds[candidateLabels[pixel]] === family
			mask[pixel] = member ? 1 : 0
			if (member) nativePixelCount++
		}
		if (nativePixelCount === 0) throw new Error("frozen family union mask is empty")
		const nativeMaskSha256 = canonicalTypedArrayHash(mask, [native.height, native.width])
		const memberOffset = familyMemberOffsets[family]
		const memberCount = familyMemberOffsets[family + 1] - memberOffset
		const orderedMemberKeys = Array.from(
			familyMemberCandidateIds.subarray(memberOffset, memberOffset + memberCount),
			(candidate) => candidates[candidate].stableKey,
		)
		const anchorCandidateId = anchorCandidateIds[family]
		const keyDescriptor = {
			version: NATIVE_SCALE_SPACE_FAMILY_STABLE_KEY_VERSION,
			orderedMemberKeys,
			anchorKey: candidates[anchorCandidateId].stableKey,
			unionMaskSha256: nativeMaskSha256,
		}
		families.push(deepFreeze({
			id: family,
			anchorCandidateId,
			memberOffset,
			memberCount,
			nativePixelCount,
			nativeMaskSha256,
			stableKey: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_FAMILY_STABLE_KEY_VERSION, keyDescriptor),
		}))
	}
	if (new Set(families.map(({ stableKey }) => stableKey)).size !== families.length) {
		throw new Error("family stable-key identity collision")
	}

	const candidateLabelsSha256 = canonicalTypedArrayHash(candidateLabels, [native.height, native.width])
	const identityDescriptor = {
		version: NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
		policySha256: NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256,
		sourceSha256: input.sourceSha256,
		decodedNativeIdentity: input.decodedNativeIdentity,
		width: native.width,
		height: native.height,
		candidateLabelsSha256,
		candidates: candidates.map(({
			stableKey,
			nativePixelCount,
			meanOklab,
			analysisRepresentativeRgb,
			analysisRepresentativeLab,
			analysisRepresentativeIndex,
			analysisRepresentativeDistance,
			analysisRepresentativeNativeExact,
			correspondenceRgb,
		}) => ({
			stableKey,
			nativePixelCount,
			meanOklab,
			analysisRepresentativeRgb,
			analysisRepresentativeLab,
			analysisRepresentativeIndex,
			analysisRepresentativeDistance,
			analysisRepresentativeNativeExact,
			correspondenceRgb,
		})),
		families: families.map(({ stableKey, anchorCandidateId, memberOffset, memberCount, nativePixelCount }) => ({ stableKey, anchorCandidateId, memberOffset, memberCount, nativePixelCount })),
		candidateFamilyIdsSha256: canonicalTypedArrayHash(candidateFamilyIds),
		familyMemberOffsetsSha256: canonicalTypedArrayHash(familyMemberOffsets),
		familyMemberCandidateIdsSha256: canonicalTypedArrayHash(familyMemberCandidateIds),
		predecessorMetadata,
	}
	return Object.freeze({
		version: NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
		policy: NATIVE_SCALE_SPACE_AVAILABILITY_POLICY,
		policySha256: NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256,
		identitySha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_AVAILABILITY_IDENTITY_VERSION, identityDescriptor),
		sourceSha256: input.sourceSha256,
		decodedNativeIdentity: input.decodedNativeIdentity,
		width: native.width,
		height: native.height,
		candidateLabels,
		candidateLabelsSha256,
		candidates: Object.freeze(candidates),
		families: Object.freeze(families),
		candidateFamilyIds,
		familyMemberOffsets,
		familyMemberCandidateIds,
		orderedCandidateEdgeCount,
		predecessorMetadata,
	})
}

function maskOutput(availability: NativeScaleSpaceAvailability, output?: Uint8Array): Uint8Array {
	const mask = output ?? new Uint8Array(availability.candidateLabels.length)
	assertExactUint8Array(mask, "lazy binary mask output")
	if (mask.length !== availability.candidateLabels.length) throw new RangeError("lazy binary mask output length is invalid")
	return mask
}

export function fillNativeScaleSpaceCandidateMask(
	availability: NativeScaleSpaceAvailability,
	candidateId: number,
	output?: Uint8Array,
): Uint8Array {
	if (!Number.isSafeInteger(candidateId) || candidateId < 0 || candidateId >= availability.candidates.length) {
		throw new RangeError("candidateId is outside frozen availability")
	}
	const mask = maskOutput(availability, output)
	let count = 0
	for (let pixel = 0; pixel < mask.length; pixel++) {
		const member = availability.candidateLabels[pixel] === candidateId
		mask[pixel] = member ? 1 : 0
		if (member) count++
	}
	if (count !== availability.candidates[candidateId].nativePixelCount || count === 0) throw new Error("lazy candidate mask does not reconcile")
	if (canonicalTypedArrayHash(mask, [availability.height, availability.width]) !== availability.candidates[candidateId].nativeMaskSha256) {
		throw new Error("lazy candidate mask hash does not reconcile")
	}
	return mask
}

export function fillNativeScaleSpaceFamilyMask(
	availability: NativeScaleSpaceAvailability,
	familyId: number,
	output?: Uint8Array,
): Uint8Array {
	if (!Number.isSafeInteger(familyId) || familyId < 0 || familyId >= availability.families.length) {
		throw new RangeError("familyId is outside frozen availability")
	}
	const mask = maskOutput(availability, output)
	let count = 0
	for (let pixel = 0; pixel < mask.length; pixel++) {
		const member = availability.candidateFamilyIds[availability.candidateLabels[pixel]] === familyId
		mask[pixel] = member ? 1 : 0
		if (member) count++
	}
	const family = availability.families[familyId]
	if (count !== family.nativePixelCount || count === 0) throw new Error("lazy family union mask does not reconcile")
	if (canonicalTypedArrayHash(mask, [availability.height, availability.width]) !== family.nativeMaskSha256) {
		throw new Error("lazy family union-mask hash does not reconcile")
	}
	return mask
}

export function assertNativeScaleSpaceAvailabilityFrozen(
	expected: NativeScaleSpaceAvailability,
	actual: NativeScaleSpaceAvailability,
): true {
	if (expected.identitySha256 !== actual.identitySha256 || expected.candidateLabelsSha256 !== actual.candidateLabelsSha256 ||
		canonicalJson(expected.candidates) !== canonicalJson(actual.candidates) ||
		canonicalJson(expected.families) !== canonicalJson(actual.families) ||
		canonicalTypedArrayHash(expected.candidateFamilyIds) !== canonicalTypedArrayHash(actual.candidateFamilyIds) ||
		canonicalTypedArrayHash(expected.familyMemberOffsets) !== canonicalTypedArrayHash(actual.familyMemberOffsets) ||
		canonicalTypedArrayHash(expected.familyMemberCandidateIds) !== canonicalTypedArrayHash(actual.familyMemberCandidateIds)) {
		throw new Error("frozen availability differs between observations")
	}
	return true
}

export interface NativeScaleSpaceComponentRecord {
	readonly firstIndex: number
	readonly area: number
	readonly minX: number
	readonly minY: number
	readonly maxX: number
	readonly maxY: number
	readonly borderCells: number
}

export interface NativeScaleSpaceThresholdAnalysis {
	readonly thresholdQ24: number
	readonly activeCount: number
	readonly componentCount: number
	readonly largestComponentArea: number
	readonly componentSignature: string
	readonly records: readonly NativeScaleSpaceComponentRecord[]
	readonly activeMass: number
	readonly componentCountDensity: number
	readonly largestMass: number
	readonly broad: number
	readonly boundaryDensity: number
	readonly borderOwnership: number
	readonly interiorOwnership: number
	readonly interiorEmpty: boolean
	readonly excess: number
	readonly sideCoverage: readonly [number, number, number, number]
	readonly thinMass: number
}

export interface NativeScaleSpaceComponentScratch {
	readonly maximumPixels: number
	readonly visited: Uint8Array
	readonly stack: Int32Array
}

export function createNativeScaleSpaceComponentScratch(maximumPixels: number): NativeScaleSpaceComponentScratch {
	assertPositiveSafeInteger(maximumPixels, "component scratch maximumPixels")
	if (maximumPixels > NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS) {
		throw new RangeError(`component scratch maximumPixels cannot exceed ${NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS}`)
	}
	return {
		maximumPixels,
		visited: new Uint8Array(maximumPixels),
		stack: new Int32Array(maximumPixels),
	}
}

function validateComponentScratch(
	pixelCount: number,
	scratch: NativeScaleSpaceComponentScratch | undefined,
): NativeScaleSpaceComponentScratch {
	const resolved = scratch ?? createNativeScaleSpaceComponentScratch(pixelCount)
	assertPositiveSafeInteger(resolved.maximumPixels, "component scratch maximumPixels")
	assertExactUint8Array(resolved.visited, "component scratch visited")
	if (!(resolved.stack instanceof Int32Array) || resolved.stack.constructor !== Int32Array) {
		throw new TypeError("component scratch stack must be exactly an Int32Array")
	}
	if (resolved.visited.length !== resolved.maximumPixels || resolved.stack.length !== resolved.maximumPixels) {
		throw new RangeError("component scratch arrays must equal maximumPixels")
	}
	if (pixelCount > resolved.maximumPixels) throw new RangeError("component scratch is insufficient for the field view")
	return resolved
}

function prepareComponentScratch(
	pixelCount: number,
	scratch: NativeScaleSpaceComponentScratch | undefined,
): NativeScaleSpaceComponentScratch {
	const resolved = validateComponentScratch(pixelCount, scratch)
	resolved.visited.fill(0, 0, pixelCount)
	resolved.stack.fill(0, 0, pixelCount)
	return resolved
}

function createComponentSignatureHash(
	width: number,
	height: number,
	thresholdQ24: number,
): { readonly hash: ReturnType<typeof createHash>; readonly bytes: Uint8Array; readonly view: DataView } {
	const header = {
		version: NATIVE_SCALE_SPACE_COMPONENT_SIGNATURE_VERSION,
		width,
		height,
		thresholdQ24,
		connectivity: 4,
		traversal: "row-major-first;mark-on-push;visit-left-right-up-down",
		bbox: "inclusive",
		borderCells: "outer-lattice",
		record: "firstIndex,area,minX,minY,maxX,maxY,borderCells:u32be",
	}
	const hash = createHash("sha256")
		.update(NATIVE_SCALE_SPACE_COMPONENT_SIGNATURE_VERSION, "utf8")
		.update("\0")
		.update(canonicalJson(header), "utf8")
		.update("\0")
	const bytes = new Uint8Array(7 * 4)
	const view = new DataView(bytes.buffer)
	return { hash, bytes, view }
}

interface ActiveComponentAnalysis {
	readonly componentCount: number
	readonly largestComponentArea: number
	readonly thinCells: number
	readonly componentSignature: string | null
	readonly records: readonly NativeScaleSpaceComponentRecord[]
}

function analyzeActiveComponents(
	width: number,
	height: number,
	thresholdQ24: number,
	isActive: (index: number) => boolean,
	scratch: NativeScaleSpaceComponentScratch | undefined,
	options: Readonly<{ retainRecords: boolean; computeSignature: boolean; computeThin: boolean }>,
): ActiveComponentAnalysis {
	const total = width * height
	const prepared = prepareComponentScratch(total, scratch)
	const visited = prepared.visited
	const stack = prepared.stack
	const records: NativeScaleSpaceComponentRecord[] = []
	const signature = options.computeSignature ? createComponentSignatureHash(width, height, thresholdQ24) : null
	let componentCount = 0
	let largestComponentArea = 0
	let thinCells = 0
	for (let start = 0; start < total; start++) {
		if (visited[start] || !isActive(start)) continue
		let stackSize = 0
		let area = 0
		let minX = width
		let minY = height
		let maxX = -1
		let maxY = -1
		let borderCells = 0
		stack[stackSize++] = start
		visited[start] = 1
		while (stackSize > 0) {
			const pixel = stack[--stackSize]
			const x = pixel % width
			const y = Math.floor(pixel / width)
			area++
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x)
			maxY = Math.max(maxY, y)
			if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderCells++
			const down = pixel + width
			if (y + 1 < height && !visited[down] && isActive(down)) {
				visited[down] = 1
				stack[stackSize++] = down
			}
			const up = pixel - width
			if (y > 0 && !visited[up] && isActive(up)) {
				visited[up] = 1
				stack[stackSize++] = up
			}
			const right = pixel + 1
			if (x + 1 < width && !visited[right] && isActive(right)) {
				visited[right] = 1
				stack[stackSize++] = right
			}
			const left = pixel - 1
			if (x > 0 && !visited[left] && isActive(left)) {
				visited[left] = 1
				stack[stackSize++] = left
			}
		}
		componentCount++
		largestComponentArea = Math.max(largestComponentArea, area)
		if (options.computeThin) {
			const boxWidth = maxX - minX + 1
			const boxHeight = maxY - minY + 1
			const first = boxWidth * height
			const second = boxHeight * width
			const minor = Math.min(first, second)
			const major = Math.max(first, second)
			if (50 * minor <= total && major >= 3 * minor) thinCells += area
		}
		if (signature !== null) {
			const values = [start, area, minX, minY, maxX, maxY, borderCells]
			for (let index = 0; index < values.length; index++) signature.view.setUint32(index * 4, values[index], false)
			signature.hash.update(signature.bytes)
		}
		if (options.retainRecords) records.push({ firstIndex: start, area, minX, minY, maxX, maxY, borderCells })
	}
	return {
		componentCount,
		largestComponentArea,
		thinCells,
		componentSignature: signature === null ? null : signature.hash.digest("hex"),
		records,
	}
}

function borderBandSize(width: number, height: number): number {
	const minimum = Math.min(width, height)
	if (minimum <= 2) return minimum
	return Math.max(1, Math.min(Math.floor(minimum * 0.08), Math.floor((minimum - 1) / 2)))
}

function fieldPlane(values: Uint32Array, width: number, height: number): void {
	assertPositiveSafeInteger(width, "field width")
	assertPositiveSafeInteger(height, "field height")
	assertExactUint32Array(values, "field Q0.24 values")
	if (values.length !== width * height) throw new RangeError("field values length does not match dimensions")
	for (const value of values) assertQ24(value, "field value")
}

function analyzeNativeScaleSpaceActiveThreshold(
	width: number,
	height: number,
	thresholdQ24: number,
	isActive: (index: number) => boolean,
	scratch: NativeScaleSpaceComponentScratch | undefined,
	retainRecords: boolean,
): NativeScaleSpaceThresholdAnalysis {
	thresholdSuffix(thresholdQ24)
	const total = width * height
	const components = analyzeActiveComponents(width, height, thresholdQ24, isActive, scratch, {
		retainRecords,
		computeSignature: true,
		computeThin: true,
	})
	let activeCount = 0
	let discordantEdges = 0
	let top = 0
	let right = 0
	let bottom = 0
	let left = 0
	const band = borderBandSize(width, height)
	const allBorder = Math.min(width, height) <= 2
	let borderCells = 0
	let activeBorderCells = 0
	let interiorCells = 0
	let activeInteriorCells = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const active = isActive(pixel)
			if (active) {
				activeCount++
				if (y === 0) top++
				if (x === width - 1) right++
				if (y === height - 1) bottom++
				if (x === 0) left++
			}
			const border = allBorder || x < band || y < band || x >= width - band || y >= height - band
			if (border) {
				borderCells++
				if (active) activeBorderCells++
			} else {
				interiorCells++
				if (active) activeInteriorCells++
			}
			if (x + 1 < width && active !== isActive(pixel + 1)) discordantEdges++
			if (y + 1 < height && active !== isActive(pixel + width)) discordantEdges++
		}
	}
	if (borderCells === 0) throw new Error("field border band is empty")
	const totalEdges = height * Math.max(0, width - 1) + width * Math.max(0, height - 1)
	const activeMass = activeCount / total
	const largestMass = components.largestComponentArea / total
	const interiorEmpty = interiorCells === 0
	const borderOwnership = activeBorderCells / borderCells
	const interiorOwnership = interiorEmpty ? 0 : activeInteriorCells / interiorCells
	if (components.componentSignature === null) throw new Error("component signature was not computed")
	return {
		thresholdQ24,
		activeCount,
		componentCount: components.componentCount,
		largestComponentArea: components.largestComponentArea,
		componentSignature: components.componentSignature,
		records: components.records,
		activeMass,
		componentCountDensity: components.componentCount / total,
		largestMass,
		broad: activeMass === 0 ? 0 : Math.min(1, largestMass / Math.sqrt(activeMass)),
		boundaryDensity: totalEdges === 0 ? 0 : discordantEdges / totalEdges,
		borderOwnership,
		interiorOwnership,
		interiorEmpty,
		excess: Math.max(0, borderOwnership - interiorOwnership),
		sideCoverage: [top / width, right / height, bottom / width, left / height],
		thinMass: components.thinCells / total,
	}
}

function analyzeNativeScaleSpaceThresholdInternal(
	values: Uint32Array,
	width: number,
	height: number,
	thresholdQ24: number,
	scratch: NativeScaleSpaceComponentScratch | undefined,
	retainRecords: boolean,
): NativeScaleSpaceThresholdAnalysis {
	fieldPlane(values, width, height)
	return analyzeNativeScaleSpaceActiveThreshold(
		width,
		height,
		thresholdQ24,
		(index) => values[index] >= thresholdQ24,
		scratch,
		retainRecords,
	)
}

export function analyzeNativeScaleSpaceThreshold(
	values: Uint32Array,
	width: number,
	height: number,
	thresholdQ24: number,
	scratch?: NativeScaleSpaceComponentScratch,
): NativeScaleSpaceThresholdAnalysis {
	return analyzeNativeScaleSpaceThresholdInternal(values, width, height, thresholdQ24, scratch, true)
}

export interface NativeScaleSpaceFieldView {
	readonly arm: NativeScaleSpaceArm
	readonly width: number
	readonly height: number
	readonly values: Uint32Array
	readonly nativeBinaryMask: Uint8Array | null
	readonly sourceIndices: Uint32Array | null
}

export function createNativeScaleSpaceFieldView(input: {
	readonly arm: NativeScaleSpaceArm
	readonly width: number
	readonly height: number
	readonly values: Uint32Array
	readonly nativeBinaryMask?: Uint8Array | null
	readonly sourceIndices?: Uint32Array | null
}): NativeScaleSpaceFieldView {
	fieldPlane(input.values, input.width, input.height)
	const nativeBinaryMask = input.nativeBinaryMask ?? null
	const sourceIndices = input.sourceIndices ?? null
	if (input.arm === "B") {
		assertExactUint8Array(nativeBinaryMask, "Arm B native binary mask")
		if (nativeBinaryMask.length !== input.values.length) throw new RangeError("Arm B native binary mask length is invalid")
		for (const value of nativeBinaryMask) if (value !== 0 && value !== 1) throw new RangeError("binary mask values must be 0 or 1")
	} else if (nativeBinaryMask !== null) {
		throw new Error("only Arm B field views retain the native binary mask used by lowPassChange")
	}
	if (input.arm === "C") {
		assertExactUint32Array(sourceIndices, "Arm C source indices")
		if (sourceIndices.length !== input.values.length) throw new RangeError("Arm C source-index length is invalid")
	} else if (sourceIndices !== null) {
		throw new Error("only Arm C field views have source indices")
	}
	return { arm: input.arm, width: input.width, height: input.height, values: input.values, nativeBinaryMask, sourceIndices }
}

export function createNativeScaleSpaceAFieldView(mask: Uint8Array, width: number, height: number): NativeScaleSpaceFieldView {
	assertExactUint8Array(mask, "Arm A binary mask")
	if (mask.length !== width * height) throw new RangeError("Arm A binary mask length is invalid")
	const values = new Uint32Array(mask.length)
	for (let index = 0; index < mask.length; index++) {
		if (mask[index] !== 0 && mask[index] !== 1) throw new RangeError("binary mask values must be 0 or 1")
		values[index] = mask[index] * NATIVE_SCALE_SPACE_Q24
	}
	return createNativeScaleSpaceFieldView({ arm: "A", width, height, values })
}

function binaryMaskPlane(mask: Uint8Array, width: number, height: number): void {
	assertPositiveSafeInteger(width, "binary field width")
	assertPositiveSafeInteger(height, "binary field height")
	assertExactUint8Array(mask, "binary field mask")
	const pixelCount = width * height
	if (!Number.isSafeInteger(pixelCount) || mask.length !== pixelCount) {
		throw new RangeError("binary field mask length does not match dimensions")
	}
	for (const value of mask) if (value !== 0 && value !== 1) throw new RangeError("binary mask values must be 0 or 1")
}

export type NativeScaleSpaceMetricValue = number | string | boolean | null | readonly number[] | NativeScaleSpaceTransformDelta
export type NativeScaleSpaceMetricRecord = Readonly<Record<string, NativeScaleSpaceMetricValue>>

export interface NativeScaleSpaceMetricObservation {
	readonly metricId: string
	readonly value: NativeScaleSpaceMetricValue
	readonly unavailableReason: string | null
}

function finiteMetricValue(value: NativeScaleSpaceMetricValue): boolean {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true
	if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0)
	if (Array.isArray(value)) return value.every((entry) => Number.isFinite(entry) && !Object.is(entry, -0))
	const delta = value as NativeScaleSpaceTransformDelta
	return Number.isFinite(delta.minimum) && Number.isFinite(delta.maximum) && Number.isFinite(delta.meanAbsolute) &&
		!Object.is(delta.meanAbsolute, -0) && /^-?\d+$/.test(delta.sumDecimal) && /^[0-9a-f]{64}$/.test(delta.typedSha256)
}

export function assertNativeScaleSpaceMetricRecord(record: NativeScaleSpaceMetricRecord): true {
	for (const [metricId, value] of Object.entries(record)) {
		if (!metricDefinitionIds.has(metricId)) throw new Error(`unregistered metric output ${metricId}`)
		if (!finiteMetricValue(value)) throw new Error(`metric ${metricId} contains a nonfinite or noncanonical value`)
	}
	return true
}

function appendNativeScaleSpaceThresholdMetrics(
	metrics: Record<string, NativeScaleSpaceMetricValue>,
	analysis: NativeScaleSpaceThresholdAnalysis,
): void {
	const suffix = thresholdSuffix(analysis.thresholdQ24)
	metrics[`field.activeMass.${suffix}`] = analysis.activeMass
	metrics[`component.count.${suffix}`] = analysis.componentCount
	metrics[`component.countDensity.${suffix}`] = analysis.componentCountDensity
	metrics[`component.largestMass.${suffix}`] = analysis.largestMass
	metrics[`component.signature.${suffix}`] = analysis.componentSignature
	metrics[`field.broad.${suffix}`] = analysis.broad
	metrics[`detail.boundaryDensity.${suffix}`] = analysis.boundaryDensity
	metrics[`frame.borderOwnership.${suffix}`] = analysis.borderOwnership
	metrics[`frame.interiorOwnership.${suffix}`] = analysis.interiorOwnership
	metrics[`frame.excess.${suffix}`] = analysis.excess
	metrics[`frame.sideCoverage.${suffix}`] = analysis.sideCoverage
	metrics[`typography.thinMass.${suffix}`] = analysis.thinMass
}

export function evaluateNativeScaleSpaceFieldMetrics(
	view: NativeScaleSpaceFieldView,
	scratch?: NativeScaleSpaceComponentScratch,
): NativeScaleSpaceMetricRecord {
	fieldPlane(view.values, view.width, view.height)
	const componentScratch = validateComponentScratch(view.values.length, scratch)
	let q24Sum = 0
	for (const value of view.values) q24Sum += value
	const metrics: Record<string, NativeScaleSpaceMetricValue> = {
		"field.mass": q24Sum / (NATIVE_SCALE_SPACE_Q24 * view.values.length),
		"detail.lowPassChange": null,
	}
	for (const thresholdQ24 of NATIVE_SCALE_SPACE_THRESHOLDS) {
		const analysis = analyzeNativeScaleSpaceThresholdInternal(
			view.values,
			view.width,
			view.height,
			thresholdQ24,
			componentScratch,
			false,
		)
		appendNativeScaleSpaceThresholdMetrics(metrics, analysis)
	}
	if (view.arm === "B") {
		if (view.nativeBinaryMask === null) throw new Error("Arm B lowPassChange requires its frozen binary mask")
		let change = 0
		for (let index = 0; index < view.values.length; index++) {
			change += Math.abs(NATIVE_SCALE_SPACE_Q24 * view.nativeBinaryMask[index] - view.values[index])
		}
		metrics["detail.lowPassChange"] = change / (NATIVE_SCALE_SPACE_Q24 * view.values.length)
	}
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

/** Arm A field metrics directly over a frozen binary mask, without materializing Q0.24 values. */
export function evaluateNativeScaleSpaceBinaryFieldMetrics(
	mask: Uint8Array,
	width: number,
	height: number,
	scratch?: NativeScaleSpaceComponentScratch,
): NativeScaleSpaceMetricRecord {
	binaryMaskPlane(mask, width, height)
	const componentScratch = validateComponentScratch(mask.length, scratch)
	let activeCount = 0
	for (const value of mask) activeCount += value
	const metrics: Record<string, NativeScaleSpaceMetricValue> = {
		"field.mass": activeCount / mask.length,
		"detail.lowPassChange": null,
	}
	for (const thresholdQ24 of NATIVE_SCALE_SPACE_THRESHOLDS) {
		const analysis = analyzeNativeScaleSpaceActiveThreshold(
			width,
			height,
			thresholdQ24,
			(index) => mask[index] === 1,
			componentScratch,
			false,
		)
		appendNativeScaleSpaceThresholdMetrics(metrics, analysis)
	}
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function evaluateNativeScaleSpaceFieldMetricRows(
	view: NativeScaleSpaceFieldView,
	scratch?: NativeScaleSpaceComponentScratch,
): readonly NativeScaleSpaceMetricObservation[] {
	const metrics = evaluateNativeScaleSpaceFieldMetrics(view, scratch)
	return Object.freeze(Object.entries(metrics).map(([metricId, value]) => Object.freeze({
		metricId,
		value,
		unavailableReason: metricId === "detail.lowPassChange" && value === null
			? `unavailable-for-arm-${view.arm}`
			: null,
	})))
}

export function evaluateNativeScaleSpaceGraphMetrics(availability: NativeScaleSpaceAvailability): NativeScaleSpaceMetricRecord {
	const metrics = {
		"graph.nodeCount": availability.candidates.length,
		"graph.orderedEdgeCount": availability.orderedCandidateEdgeCount,
	}
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function nativeScaleSpaceOrderedCandidateEdges(
	availability: NativeScaleSpaceAvailability,
): readonly Readonly<{ fromCandidateId: number; toCandidateId: number }>[] {
	const ids = availability.candidates.map(({ id }) => id)
	ids.sort((first, second) => availability.candidates[first].stableKey.localeCompare(availability.candidates[second].stableKey))
	const edges: Array<{ fromCandidateId: number; toCandidateId: number }> = []
	for (const fromCandidateId of ids) {
		for (const toCandidateId of ids) {
			if (fromCandidateId !== toCandidateId) edges.push({ fromCandidateId, toCandidateId })
		}
	}
	if (edges.length !== availability.orderedCandidateEdgeCount) throw new Error("complete ordered graph does not reconcile")
	return Object.freeze(edges.map((edge) => Object.freeze(edge)))
}

export type NativeScaleSpaceQ24ValueSource = Uint32Array | ((index: number) => number)

function q24At(source: NativeScaleSpaceQ24ValueSource, index: number): number {
	const value = source instanceof Uint32Array ? source[index] : source(index)
	assertQ24(value, "pair field value")
	return value
}

function finalizeNativeScaleSpacePairMetrics(input: {
	readonly availability: NativeScaleSpaceAvailability
	readonly fromCandidateId: number
	readonly toCandidateId: number
	readonly width: number
	readonly height: number
	readonly cellCount: number
	readonly fromSum: number
	readonly toSum: number
	readonly coverageSum: number
	readonly overlapNumerator: number
	readonly overlapDenominator: number
	readonly activeCounts: readonly number[]
	readonly pairActive: Uint8Array
	readonly componentScratch: NativeScaleSpaceComponentScratch
}): NativeScaleSpaceMetricRecord {
	const fromPresence = input.fromSum / (NATIVE_SCALE_SPACE_Q24 * input.cellCount)
	const toPresence = input.toSum / (NATIVE_SCALE_SPACE_Q24 * input.cellCount)
	const presenceSum = fromPresence + toPresence
	const fromLab = input.availability.candidates[input.fromCandidateId].witnessOklab
	const toLab = input.availability.candidates[input.toCandidateId].witnessOklab
	const metrics: Record<string, NativeScaleSpaceMetricValue> = {
		"endpoint.distance": Math.sqrt(squaredDistance(fromLab, toLab)),
		"endpoint.fromPresence": fromPresence,
		"endpoint.toPresence": toPresence,
		"endpoint.balance": presenceSum === 0 ? 0 : 1 - Math.abs(fromPresence - toPresence) / presenceSum,
		"continuity.pairCoverage": input.coverageSum / (NATIVE_SCALE_SPACE_Q24 * input.cellCount),
		"continuity.overlap": input.overlapDenominator === 0 ? 0 : input.overlapNumerator / input.overlapDenominator,
	}
	for (let thresholdIndex = 0; thresholdIndex < NATIVE_SCALE_SPACE_THRESHOLDS.length; thresholdIndex++) {
		const thresholdQ24 = NATIVE_SCALE_SPACE_THRESHOLDS[thresholdIndex]
		const activeCount = input.activeCounts[thresholdIndex]
		const activationBit = 1 << thresholdIndex
		const components = analyzeActiveComponents(
			input.width,
			input.height,
			thresholdQ24,
			(index) => (input.pairActive[index] & activationBit) !== 0,
			input.componentScratch,
			{ retainRecords: false, computeSignature: false, computeThin: false },
		)
		metrics[`topology.pairConnectedShare.${thresholdSuffix(thresholdQ24)}`] = activeCount === 0
			? 0
			: components.largestComponentArea / activeCount
	}
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function evaluateNativeScaleSpacePairMetrics(input: {
	readonly availability: NativeScaleSpaceAvailability
	readonly fromCandidateId: number
	readonly toCandidateId: number
	readonly fromValues: Uint32Array
	readonly toValues: NativeScaleSpaceQ24ValueSource
	readonly width: number
	readonly height: number
	readonly pairActiveScratch?: Uint8Array
}, scratch?: NativeScaleSpaceComponentScratch): NativeScaleSpaceMetricRecord {
	const { availability, fromCandidateId, toCandidateId, fromValues, toValues, width, height } = input
	if (fromCandidateId === toCandidateId || fromCandidateId < 0 || toCandidateId < 0 ||
		fromCandidateId >= availability.candidates.length || toCandidateId >= availability.candidates.length) {
		throw new RangeError("pair endpoints must be distinct frozen candidates")
	}
	fieldPlane(fromValues, width, height)
	if (toValues instanceof Uint32Array) fieldPlane(toValues, width, height)
	const componentScratch = validateComponentScratch(fromValues.length, scratch)
	const pairActive = input.pairActiveScratch ?? new Uint8Array(fromValues.length)
	assertExactUint8Array(pairActive, "pair-active scratch")
	if (pairActive.length < fromValues.length) throw new RangeError("pair-active scratch is insufficient for the field view")
	let fromSum = 0
	let toSum = 0
	let coverageSum = 0
	let overlapNumerator = 0
	let overlapDenominator = 0
	const activeCounts = [0, 0, 0]
	for (let index = 0; index < fromValues.length; index++) {
		const from = fromValues[index]
		const to = q24At(toValues, index)
		const pairValue = from + to
		fromSum += from
		toSum += to
		coverageSum += Math.min(NATIVE_SCALE_SPACE_Q24, pairValue)
		overlapNumerator += Math.min(from, to)
		overlapDenominator += Math.max(from, to)
		let activationBits = 0
		for (let thresholdIndex = 0; thresholdIndex < NATIVE_SCALE_SPACE_THRESHOLDS.length; thresholdIndex++) {
			if (pairValue >= NATIVE_SCALE_SPACE_THRESHOLDS[thresholdIndex]) {
				activationBits |= 1 << thresholdIndex
				activeCounts[thresholdIndex]++
			}
		}
		pairActive[index] = activationBits
	}
	return finalizeNativeScaleSpacePairMetrics({
		availability,
		fromCandidateId,
		toCandidateId,
		width,
		height,
		cellCount: fromValues.length,
		fromSum,
		toSum,
		coverageSum,
		overlapNumerator,
		overlapDenominator,
		activeCounts,
		pairActive,
		componentScratch,
	})
}

/** Complete Arm A pair metrics directly from the frozen label partition, without Q0.24 planes. */
export function evaluateNativeScaleSpaceBinaryPairMetrics(
	input: Readonly<{
		availability: NativeScaleSpaceAvailability
		fromCandidateId: number
		toCandidateId: number
	}>,
	scratch?: NativeScaleSpaceComponentScratch,
	pairActiveScratch?: Uint8Array,
): NativeScaleSpaceMetricRecord {
	const { availability, fromCandidateId, toCandidateId } = input
	if (fromCandidateId === toCandidateId || fromCandidateId < 0 || toCandidateId < 0 ||
		fromCandidateId >= availability.candidates.length || toCandidateId >= availability.candidates.length) {
		throw new RangeError("pair endpoints must be distinct frozen candidates")
	}
	const cellCount = availability.candidateLabels.length
	if (cellCount !== availability.width * availability.height) throw new Error("frozen candidate labels do not match availability dimensions")
	const componentScratch = validateComponentScratch(cellCount, scratch)
	const pairActive = pairActiveScratch ?? new Uint8Array(cellCount)
	assertExactUint8Array(pairActive, "pair-active scratch")
	if (pairActive.length < cellCount) throw new RangeError("pair-active scratch is insufficient for the field view")
	let fromSum = 0
	let toSum = 0
	let coverageSum = 0
	let overlapNumerator = 0
	let overlapDenominator = 0
	const activeCounts = [0, 0, 0]
	for (let index = 0; index < cellCount; index++) {
		const label = availability.candidateLabels[index]
		if (label >= availability.candidates.length) throw new Error("frozen candidate label escapes its partition")
		const from = label === fromCandidateId ? NATIVE_SCALE_SPACE_Q24 : 0
		const to = label === toCandidateId ? NATIVE_SCALE_SPACE_Q24 : 0
		const pairValue = from + to
		fromSum += from
		toSum += to
		coverageSum += Math.min(NATIVE_SCALE_SPACE_Q24, pairValue)
		overlapNumerator += Math.min(from, to)
		overlapDenominator += Math.max(from, to)
		let activationBits = 0
		for (let thresholdIndex = 0; thresholdIndex < NATIVE_SCALE_SPACE_THRESHOLDS.length; thresholdIndex++) {
			if (pairValue >= NATIVE_SCALE_SPACE_THRESHOLDS[thresholdIndex]) {
				activationBits |= 1 << thresholdIndex
				activeCounts[thresholdIndex]++
			}
		}
		pairActive[index] = activationBits
	}
	return finalizeNativeScaleSpacePairMetrics({
		availability,
		fromCandidateId,
		toCandidateId,
		width: availability.width,
		height: availability.height,
		cellCount,
		fromSum,
		toSum,
		coverageSum,
		overlapNumerator,
		overlapDenominator,
		activeCounts,
		pairActive,
		componentScratch,
	})
}

function nearestCenterCoordinate(cell: number, cellCount: number, extent: number): number {
	assertPositiveSafeInteger(cellCount, "cellCount")
	assertPositiveSafeInteger(extent, "extent")
	if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount) throw new RangeError("cell is outside its center-mapping domain")
	return Math.min(extent - 1, Number(BigInt(2 * cell + 1) * BigInt(extent) / BigInt(2 * cellCount)))
}

export interface NativeScaleSpaceReconstructionAccumulator {
	readonly native: RawImage
	readonly availability: NativeScaleSpaceAvailability
	readonly arm: NativeScaleSpaceArm
	readonly columns: number
	readonly rows: number
	readonly nativeReferenceIndices: Uint32Array
	readonly nativeReferenceCoordinatesSha256: string
	readonly winnerValues: Uint32Array
	readonly winnerCandidateIds: Uint8Array
	readonly tieCounts: Uint8Array
	readonly candidatesSeen: Uint8Array
	armMappingIndices: Uint32Array | null
	armMappingSha256: string | null
	viewWidth: number | null
	viewHeight: number | null
}

export function createNativeScaleSpaceReconstructionAccumulator(
	native: RawImage,
	availability: NativeScaleSpaceAvailability,
	arm: NativeScaleSpaceArm,
): NativeScaleSpaceReconstructionAccumulator {
	const bounds = nativeScaleSpaceRasterBounds(native.width, native.height)
	assertExactUint8Array(native.data, "reconstruction native RGB")
	if (native.data.length !== bounds.rgbBytes || native.width !== availability.width || native.height !== availability.height) {
		throw new Error("reconstruction native raster does not match frozen availability")
	}
	const grid = nativeScaleSpacePixelBudgetDimensions(native.width, native.height, NATIVE_SCALE_SPACE_COMMON_DOMAIN_SAMPLE_BUDGET)
	const count = grid.width * grid.height
	if (count <= 0 || count > NATIVE_SCALE_SPACE_COMMON_DOMAIN_SAMPLE_BUDGET) throw new Error("common-domain sample count is invalid")
	const nativeReferenceIndices = new Uint32Array(count)
	let sample = 0
	for (let row = 0; row < grid.height; row++) {
		const y = nearestCenterCoordinate(row, grid.height, native.height)
		for (let column = 0; column < grid.width; column++) {
			const x = nearestCenterCoordinate(column, grid.width, native.width)
			nativeReferenceIndices[sample++] = y * native.width + x
		}
	}
	return {
		native,
		availability,
		arm,
		columns: grid.width,
		rows: grid.height,
		nativeReferenceIndices,
		nativeReferenceCoordinatesSha256: canonicalTypedArrayHash(nativeReferenceIndices, [grid.height, grid.width]),
		winnerValues: new Uint32Array(count),
		winnerCandidateIds: new Uint8Array(count).fill(0xff),
		tieCounts: new Uint8Array(count),
		candidatesSeen: new Uint8Array(availability.candidates.length),
		armMappingIndices: null,
		armMappingSha256: null,
		viewWidth: null,
		viewHeight: null,
	}
}

function reconstructionMappingForDimensions(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
	arm: NativeScaleSpaceArm,
	width: number,
	height: number,
): Uint32Array {
	if (arm !== accumulator.arm) throw new Error("reconstruction field arm does not match its accumulator")
	if (accumulator.arm !== "C" && (width !== accumulator.native.width || height !== accumulator.native.height)) {
		throw new Error("Arm A/B reconstruction views must use native dimensions")
	}
	if (accumulator.arm === "C" && (width > accumulator.native.width || height > accumulator.native.height)) {
		throw new Error("Arm C reconstruction view cannot enlarge native dimensions")
	}
	if (accumulator.armMappingIndices !== null) {
		if (accumulator.viewWidth !== width || accumulator.viewHeight !== height) throw new Error("reconstruction candidate views have inconsistent dimensions")
		return accumulator.armMappingIndices
	}
	let mapping: Uint32Array
	if (accumulator.arm === "C") {
		mapping = new Uint32Array(accumulator.nativeReferenceIndices.length)
		let sample = 0
		for (let row = 0; row < accumulator.rows; row++) {
			const y = nearestCenterCoordinate(row, accumulator.rows, height)
			for (let column = 0; column < accumulator.columns; column++) {
				const x = nearestCenterCoordinate(column, accumulator.columns, width)
				mapping[sample++] = y * width + x
			}
		}
	} else {
		mapping = accumulator.nativeReferenceIndices
	}
	accumulator.armMappingIndices = mapping
	accumulator.armMappingSha256 = canonicalTypedArrayHash(mapping, [accumulator.rows, accumulator.columns])
	accumulator.viewWidth = width
	accumulator.viewHeight = height
	return mapping
}

function reconstructionMapping(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
	view: NativeScaleSpaceFieldView,
): Uint32Array {
	return reconstructionMappingForDimensions(accumulator, view.arm, view.width, view.height)
}

function accumulateNativeScaleSpaceReconstructionValues(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
	candidateId: number,
	mapping: Uint32Array,
	valueAt: (mappedIndex: number) => number,
): void {
	if (!Number.isSafeInteger(candidateId) || candidateId < 0 || candidateId >= accumulator.availability.candidates.length) {
		throw new RangeError("reconstruction candidate is outside frozen availability")
	}
	if (accumulator.candidatesSeen[candidateId]) throw new Error("reconstruction candidate was accumulated more than once")
	const stableKey = accumulator.availability.candidates[candidateId].stableKey
	for (let sample = 0; sample < mapping.length; sample++) {
		const value = valueAt(mapping[sample])
		assertQ24(value, "reconstruction field value")
		const previousId = accumulator.winnerCandidateIds[sample]
		if (previousId === 0xff || value > accumulator.winnerValues[sample]) {
			accumulator.winnerValues[sample] = value
			accumulator.winnerCandidateIds[sample] = candidateId
			accumulator.tieCounts[sample] = 1
		} else if (value === accumulator.winnerValues[sample]) {
			accumulator.tieCounts[sample]++
			if (stableKey < accumulator.availability.candidates[previousId].stableKey) {
				accumulator.winnerCandidateIds[sample] = candidateId
			}
		}
	}
	accumulator.candidatesSeen[candidateId] = 1
}

export function accumulateNativeScaleSpaceReconstructionCandidate(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
	candidateId: number,
	view: NativeScaleSpaceFieldView,
): void {
	const mapping = reconstructionMapping(accumulator, view)
	accumulateNativeScaleSpaceReconstructionValues(accumulator, candidateId, mapping, (index) => view.values[index])
}

/** Arm A reconstruction directly from a binary candidate mask, without a Q0.24 field plane. */
export function accumulateNativeScaleSpaceReconstructionBinaryCandidate(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
	candidateId: number,
	mask: Uint8Array,
	width: number,
	height: number,
): void {
	binaryMaskPlane(mask, width, height)
	const mapping = reconstructionMappingForDimensions(accumulator, "A", width, height)
	accumulateNativeScaleSpaceReconstructionValues(
		accumulator,
		candidateId,
		mapping,
		(index) => mask[index] === 1 ? NATIVE_SCALE_SPACE_Q24 : 0,
	)
}

export interface NativeScaleSpaceReconstructionResult {
	readonly metrics: NativeScaleSpaceMetricRecord
	readonly columns: number
	readonly rows: number
	readonly nativeReferenceCoordinatesSha256: string
	readonly armMappingSha256: string
	readonly winnerCandidateIds: Uint8Array
	readonly winningStableKeys: readonly string[]
	readonly tieCounts: Uint8Array
}

export function finalizeNativeScaleSpaceReconstruction(
	accumulator: NativeScaleSpaceReconstructionAccumulator,
): NativeScaleSpaceReconstructionResult {
	if (accumulator.candidatesSeen.some((seen) => seen !== 1)) throw new Error("reconstruction is missing one or more frozen candidates")
	if (accumulator.armMappingSha256 === null) throw new Error("reconstruction has no arm mapping")
	const distances: Array<{ distance: number; sample: number }> = []
	const winningStableKeys: string[] = []
	let sum = 0
	let maximum = 0
	for (let sample = 0; sample < accumulator.nativeReferenceIndices.length; sample++) {
		const candidateId = accumulator.winnerCandidateIds[sample]
		if (candidateId === 0xff) throw new Error("reconstruction sample has no argmax winner")
		const reference = rgbToOKLab(rgbAt(accumulator.native.data, accumulator.nativeReferenceIndices[sample]))
		const distance = Math.sqrt(squaredDistance(reference, accumulator.availability.candidates[candidateId].witnessOklab))
		if (!Number.isFinite(distance)) throw new Error("reconstruction distance is nonfinite")
		distances.push({ distance, sample })
		winningStableKeys.push(accumulator.availability.candidates[candidateId].stableKey)
		sum += distance
		maximum = Math.max(maximum, distance)
	}
	distances.sort((first, second) => first.distance - second.distance || first.sample - second.sample)
	const percentileIndex = Math.ceil(0.95 * distances.length) - 1
	const metrics = {
		"reconstruction.meanOklab": sum / distances.length,
		"reconstruction.p95Oklab": distances[percentileIndex].distance,
		"reconstruction.maxOklab": maximum,
	}
	assertNativeScaleSpaceMetricRecord(metrics)
	return {
		metrics: Object.freeze(metrics),
		columns: accumulator.columns,
		rows: accumulator.rows,
		nativeReferenceCoordinatesSha256: accumulator.nativeReferenceCoordinatesSha256,
		armMappingSha256: accumulator.armMappingSha256,
		winnerCandidateIds: accumulator.winnerCandidateIds,
		winningStableKeys: Object.freeze(winningStableKeys),
		tieCounts: accumulator.tieCounts,
	}
}

export interface NativeScaleSpaceTransformDelta {
	readonly values: Int32Array
	readonly typedSha256: string
	readonly minimum: number
	readonly maximum: number
	readonly sumDecimal: string
	readonly meanAbsolute: number
}

export function reduceNativeScaleSpaceTransformDelta(
	values: Int32Array,
	shape: readonly number[] = [values.length],
): NativeScaleSpaceTransformDelta {
	if (!(values instanceof Int32Array) || values.constructor !== Int32Array || values.length === 0) {
		throw new TypeError("transform delta must be a nonempty exact Int32Array")
	}
	let minimum = values[0]
	let maximum = values[0]
	let sum = 0n
	let absoluteSum = 0
	for (const value of values) {
		minimum = Math.min(minimum, value)
		maximum = Math.max(maximum, value)
		sum += BigInt(value)
		absoluteSum += Math.abs(value)
	}
	return {
		values,
		typedSha256: canonicalTypedArrayHash(values, shape),
		minimum,
		maximum,
		sumDecimal: sum.toString(10),
		meanAbsolute: absoluteSum / values.length,
	}
}

export function nativeScaleSpaceTransformDimensions(
	width: number,
	height: number,
	transformId: NativeScaleSpaceTransformId,
): Readonly<{ width: number; height: number }> {
	assertPositiveSafeInteger(width, "transform source width")
	assertPositiveSafeInteger(height, "transform source height")
	if (transformId === "nearest-2x") return { width: width * 2, height: height * 2 }
	if (transformId === "rotate-90-clockwise") return { width: height, height: width }
	if (NATIVE_SCALE_SPACE_TRANSFORMS.some(({ id }) => id === transformId)) return { width, height }
	throw new RangeError("unknown native scale-space transform")
}

export function nativeScaleSpaceInverseTransformCoordinate(
	transformId: NativeScaleSpaceTransformId,
	outputX: number,
	outputY: number,
	parentWidth: number,
	parentHeight: number,
): Readonly<{ x: number; y: number }> {
	const output = nativeScaleSpaceTransformDimensions(parentWidth, parentHeight, transformId)
	if (!Number.isSafeInteger(outputX) || !Number.isSafeInteger(outputY) || outputX < 0 || outputY < 0 ||
		outputX >= output.width || outputY >= output.height) throw new RangeError("transform output coordinate is out of range")
	switch (transformId) {
		case "identity": return { x: outputX, y: outputY }
		case "nearest-2x": return { x: Math.floor(outputX / 2), y: Math.floor(outputY / 2) }
		case "reflect-horizontal": return { x: parentWidth - 1 - outputX, y: outputY }
		case "rotate-180": return { x: parentWidth - 1 - outputX, y: parentHeight - 1 - outputY }
		case "rotate-90-clockwise": return { x: outputY, y: parentHeight - 1 - outputX }
	}
}

export function transformNativeScaleSpaceRgb(
	data: Uint8Array,
	width: number,
	height: number,
	transformId: NativeScaleSpaceTransformId,
): RawImage {
	assertExactUint8Array(data, "transform RGB data")
	if (data.length !== width * height * 3) throw new RangeError("transform RGB byte length is invalid")
	const output = nativeScaleSpaceTransformDimensions(width, height, transformId)
	const transformed = new Uint8Array(output.width * output.height * 3)
	for (let y = 0; y < output.height; y++) {
		for (let x = 0; x < output.width; x++) {
			const source = nativeScaleSpaceInverseTransformCoordinate(transformId, x, y, width, height)
			const sourceOffset = (source.y * width + source.x) * 3
			const targetOffset = (y * output.width + x) * 3
			transformed[targetOffset] = data[sourceOffset]
			transformed[targetOffset + 1] = data[sourceOffset + 1]
			transformed[targetOffset + 2] = data[sourceOffset + 2]
		}
	}
	return { ...output, data: transformed }
}

export function transformNativeScaleSpaceBinaryMask(
	mask: Uint8Array,
	width: number,
	height: number,
	transformId: NativeScaleSpaceTransformId,
): Readonly<{ width: number; height: number; mask: Uint8Array }> {
	assertExactUint8Array(mask, "transform binary mask")
	if (mask.length !== width * height) throw new RangeError("transform binary mask length is invalid")
	const output = nativeScaleSpaceTransformDimensions(width, height, transformId)
	const transformed = new Uint8Array(output.width * output.height)
	for (let y = 0; y < output.height; y++) {
		for (let x = 0; x < output.width; x++) {
			const source = nativeScaleSpaceInverseTransformCoordinate(transformId, x, y, width, height)
			const value = mask[source.y * width + source.x]
			if (value !== 0 && value !== 1) throw new RangeError("binary mask values must be 0 or 1")
			transformed[y * output.width + x] = value
		}
	}
	return { ...output, mask: transformed }
}

export function inverseMapNativeScaleSpaceBinaryMask(
	transformedMask: Uint8Array,
	parentWidth: number,
	parentHeight: number,
	transformId: NativeScaleSpaceTransformId,
): Uint8Array {
	assertExactUint8Array(transformedMask, "inverse-mapped binary mask")
	const output = nativeScaleSpaceTransformDimensions(parentWidth, parentHeight, transformId)
	if (transformedMask.length !== output.width * output.height) throw new RangeError("transformed mask dimensions are invalid")
	const parent = new Uint8Array(parentWidth * parentHeight)
	const counts = new Uint8Array(parent.length)
	for (let y = 0; y < output.height; y++) {
		for (let x = 0; x < output.width; x++) {
			const value = transformedMask[y * output.width + x]
			if (value !== 0 && value !== 1) throw new RangeError("binary mask values must be 0 or 1")
			const source = nativeScaleSpaceInverseTransformCoordinate(transformId, x, y, parentWidth, parentHeight)
			const index = source.y * parentWidth + source.x
			if (counts[index] > 0 && parent[index] !== value) throw new Error("nearest-2x child mask values do not agree")
			parent[index] = value
			counts[index]++
		}
	}
	const expected = transformId === "nearest-2x" ? 4 : 1
	if (counts.some((count) => count !== expected)) throw new Error("transform inverse mask correspondence is incomplete")
	return parent
}

export function computeNativeScaleSpaceTransformBDeltaQ24(input: {
	readonly parentValues: Uint32Array
	readonly parentWidth: number
	readonly parentHeight: number
	readonly transformedValues: NativeScaleSpaceQ24ValueSource
	readonly transformId: NativeScaleSpaceTransformId
}): NativeScaleSpaceTransformDelta {
	fieldPlane(input.parentValues, input.parentWidth, input.parentHeight)
	const output = nativeScaleSpaceTransformDimensions(input.parentWidth, input.parentHeight, input.transformId)
	if (input.transformedValues instanceof Uint32Array) fieldPlane(input.transformedValues, output.width, output.height)
	const delta = new Int32Array(output.width * output.height)
	for (let y = 0; y < output.height; y++) {
		for (let x = 0; x < output.width; x++) {
			const source = nativeScaleSpaceInverseTransformCoordinate(input.transformId, x, y, input.parentWidth, input.parentHeight)
			const index = y * output.width + x
			delta[index] = q24At(input.transformedValues, index) - input.parentValues[source.y * input.parentWidth + source.x]
		}
	}
	return reduceNativeScaleSpaceTransformDelta(delta, [output.height, output.width])
}

export function computeNativeScaleSpaceTransformCToParentBDeltaQ24(input: {
	readonly parentBValues: Uint32Array
	readonly parentWidth: number
	readonly parentHeight: number
	readonly transformedCValues: Uint32Array
	readonly transformedCSourceIndices: Uint32Array
	readonly transformedWidth: number
	readonly transformedHeight: number
	readonly transformId: NativeScaleSpaceTransformId
}): NativeScaleSpaceTransformDelta {
	fieldPlane(input.parentBValues, input.parentWidth, input.parentHeight)
	assertExactUint32Array(input.transformedCValues, "transformed C values")
	assertExactUint32Array(input.transformedCSourceIndices, "transformed C source indices")
	if (input.transformedCValues.length === 0 || input.transformedCValues.length !== input.transformedCSourceIndices.length) {
		throw new RangeError("transformed C values and source indices must have equal nonzero lengths")
	}
	const transformed = nativeScaleSpaceTransformDimensions(input.parentWidth, input.parentHeight, input.transformId)
	const delta = new Int32Array(input.transformedCValues.length)
	for (let cell = 0; cell < delta.length; cell++) {
		assertQ24(input.transformedCValues[cell], "transformed C value")
		const sourceIndex = input.transformedCSourceIndices[cell]
		if (sourceIndex >= transformed.width * transformed.height) throw new RangeError("transformed C source index is out of range")
		const source = nativeScaleSpaceInverseTransformCoordinate(
			input.transformId,
			sourceIndex % transformed.width,
			Math.floor(sourceIndex / transformed.width),
			input.parentWidth,
			input.parentHeight,
		)
		delta[cell] = input.transformedCValues[cell] - input.parentBValues[source.y * input.parentWidth + source.x]
	}
	return reduceNativeScaleSpaceTransformDelta(delta, [input.transformedHeight, input.transformedWidth])
}

export interface NativeScaleSpaceFixture {
	readonly entry: NativeScaleSpaceFixtureManifestEntry
	readonly width: number
	readonly height: number
	readonly data: Uint8Array
	readonly bytesSha256: string
	readonly identity: string
}

function fixtureEntry(id: NativeScaleSpaceFixtureId): NativeScaleSpaceFixtureManifestEntry {
	const entry = fixtureEntries.find((candidate) => candidate.id === id)
	if (!entry) throw new RangeError(`unknown fixture ${id}`)
	return entry
}

function writeFixturePixel(data: Uint8Array, pixel: number, rgb: RGB): void {
	data[pixel * 3] = rgb[0]
	data[pixel * 3 + 1] = rgb[1]
	data[pixel * 3 + 2] = rgb[2]
}

function nextXorshift32(state: number): number {
	state = (state ^ (state << 13)) >>> 0
	state = (state ^ (state >>> 17)) >>> 0
	state = (state ^ (state << 5)) >>> 0
	return state
}

export function createNativeScaleSpaceFixture(id: NativeScaleSpaceFixtureId): NativeScaleSpaceFixture {
	const entry = fixtureEntry(id)
	const data = new Uint8Array(entry.width * entry.height * 3)
	const { D, L, F, G, T, S0, S1 } = NATIVE_SCALE_SPACE_FIXTURE_RGB
	for (let y = 0; y < entry.height; y++) {
		for (let x = 0; x < entry.width; x++) {
			const pixel = y * entry.width + x
			let rgb: RGB
			switch (id) {
				case "uniform-d": rgb = D; break
				case "vertical-split": rgb = x < 16 ? D : L; break
				case "checker-1px": rgb = (x + y) % 2 === 0 ? D : L; break
				case "interior-specks": rgb = [4, 12, 20, 28].includes(x) && [3, 11, 19].includes(y) ? L : D; break
				case "frame-interior":
					rgb = x < 2 || x >= 30 || y < 2 || y >= 30 ? F : x >= 10 && x < 22 && y >= 10 && y < 22 ? G : D
					break
				case "thin-line": rgb = y === 11 ? T : D; break
				case "broad-ramp": rgb = [0, 1, 2].map((channel) => Math.floor((D[channel] * (31 - x) + L[channel] * x + 15) / 31)) as unknown as RGB; break
				case "local-ramp":
					rgb = x >= 8 && x < 24
						? [0, 1, 2].map((channel) => Math.floor((D[channel] * (23 - x) + L[channel] * (x - 8) + 7) / 15)) as unknown as RGB
						: (x + y) % 2 === 1 ? F : G
					break
				case "subtle-ramp": rgb = [0, 1, 2].map((channel) => Math.floor((S0[channel] * (31 - x) + S1[channel] * x + 15) / 31)) as unknown as RGB; break
				case "seeded-noise": rgb = x < 16 ? D : L; break
			}
			writeFixturePixel(data, pixel, rgb)
		}
	}
	if (id === "seeded-noise") {
		let state = 0x5eed1234
		for (let offset = 0; offset < data.length; offset++) {
			state = nextXorshift32(state)
			data[offset] = Math.max(0, Math.min(255, data[offset] + state % 3 - 1))
		}
	}
	const identity = createHash("sha256")
		.update(NATIVE_SCALE_SPACE_FIXTURE_IDENTITY_VERSION, "utf8")
		.update("\0")
		.update(canonicalJson(entry), "utf8")
		.update("\0")
		.update(data)
		.digest("hex")
	return {
		entry,
		width: entry.width,
		height: entry.height,
		data,
		bytesSha256: createHash("sha256").update(data).digest("hex"),
		identity,
	}
}

export const NATIVE_SCALE_SPACE_FIXTURE_BYTE_SHA256 = deepFreeze(Object.fromEntries(
	fixtureEntries.map(({ id }) => [id, createNativeScaleSpaceFixture(id).bytesSha256]),
) as Readonly<Record<NativeScaleSpaceFixtureId, string>>)

export const NATIVE_SCALE_SPACE_FIXTURE_IDENTITIES = deepFreeze(Object.fromEntries(
	fixtureEntries.map(({ id }) => [id, createNativeScaleSpaceFixture(id).identity]),
) as Readonly<Record<NativeScaleSpaceFixtureId, string>>)

export function createNativeScaleSpaceTransformIdentity(
	parentFixtureIdentity: string,
	transformId: NativeScaleSpaceTransformId,
): string {
	assertSha256(parentFixtureIdentity, "parentFixtureIdentity")
	const transform = NATIVE_SCALE_SPACE_TRANSFORMS.find(({ id }) => id === transformId)
	if (!transform) throw new RangeError("unknown native scale-space transform")
	return createHash("sha256")
		.update(NATIVE_SCALE_SPACE_TRANSFORM_IDENTITY_VERSION, "utf8")
		.update("\0")
		.update(parentFixtureIdentity, "utf8")
		.update("\0")
		.update(canonicalJson(transform), "utf8")
		.digest("hex")
}

export interface TransformedNativeScaleSpaceFixture extends RawImage {
	readonly fixtureId: NativeScaleSpaceFixtureId
	readonly transformId: NativeScaleSpaceTransformId
	readonly parentFixtureIdentity: string
	readonly identity: string
	readonly bytesSha256: string
}

export function transformNativeScaleSpaceFixture(
	fixture: NativeScaleSpaceFixture | NativeScaleSpaceFixtureId,
	transformId: NativeScaleSpaceTransformId,
): TransformedNativeScaleSpaceFixture {
	const parent = typeof fixture === "string" ? createNativeScaleSpaceFixture(fixture) : fixture
	const transformed = transformNativeScaleSpaceRgb(parent.data, parent.width, parent.height, transformId)
	return {
		...transformed,
		fixtureId: parent.entry.id,
		transformId,
		parentFixtureIdentity: parent.identity,
		identity: createNativeScaleSpaceTransformIdentity(parent.identity, transformId),
		bytesSha256: createHash("sha256").update(transformed.data).digest("hex"),
	}
}

export interface NativeScaleSpaceTransformCorrespondence {
	readonly version: typeof NATIVE_SCALE_SPACE_TRANSFORM_CORRESPONDENCE_VERSION
	readonly exactRgb: RGB
	readonly inverseMappedMaskSha256: string
	readonly key: string
}

export function createNativeScaleSpaceTransformCorrespondence(
	exactRgb: RGB,
	inverseMappedMask: Uint8Array,
	parentWidth: number,
	parentHeight: number,
): NativeScaleSpaceTransformCorrespondence {
	assertExactUint8Array(inverseMappedMask, "inverse-mapped correspondence mask")
	if (inverseMappedMask.length !== parentWidth * parentHeight) throw new RangeError("inverse-mapped correspondence mask length is invalid")
	const inverseMappedMaskSha256 = canonicalTypedArrayHash(inverseMappedMask, [parentHeight, parentWidth])
	const descriptor = { version: NATIVE_SCALE_SPACE_TRANSFORM_CORRESPONDENCE_VERSION, exactRgb, inverseMappedMaskSha256 }
	return deepFreeze({ ...descriptor, key: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_TRANSFORM_CORRESPONDENCE_VERSION, descriptor) })
}

export interface NativeScaleSpaceCandidateCorrespondenceMatch {
	readonly transformedCandidateId: number
	readonly parentCandidateId: number | null
	readonly correspondenceKey: string
	readonly applicable: boolean
	readonly inapplicableReason: "no-exact-rgb-inverse-mask-match" | "duplicate-parent-match" | null
}

/** Reconcile transform-local candidate IDs without comparing source-scoped stable keys. */
export function matchNativeScaleSpaceTransformedCandidates(
	parent: NativeScaleSpaceAvailability,
	transformed: NativeScaleSpaceAvailability,
	transformId: NativeScaleSpaceTransformId,
): readonly NativeScaleSpaceCandidateCorrespondenceMatch[] {
	const parentRows = parent.candidates.map((candidate) => {
		const mask = fillNativeScaleSpaceCandidateMask(parent, candidate.id)
		const correspondence = createNativeScaleSpaceTransformCorrespondence(candidate.correspondenceRgb, mask, parent.width, parent.height)
		return { candidate, correspondence }
	})
	const usedParentIds = new Set<number>()
	const matches: NativeScaleSpaceCandidateCorrespondenceMatch[] = []
	for (const candidate of transformed.candidates) {
		const transformedMask = fillNativeScaleSpaceCandidateMask(transformed, candidate.id)
		const inverseMask = inverseMapNativeScaleSpaceBinaryMask(transformedMask, parent.width, parent.height, transformId)
		const correspondence = createNativeScaleSpaceTransformCorrespondence(candidate.correspondenceRgb, inverseMask, parent.width, parent.height)
		const possible = parentRows.filter((row) => row.correspondence.key === correspondence.key)
		possible.sort((first, second) =>
			first.correspondence.inverseMappedMaskSha256.localeCompare(second.correspondence.inverseMappedMaskSha256) ||
			first.candidate.witnessIndex - second.candidate.witnessIndex)
		const selected = possible[0]
		const duplicate = selected !== undefined && usedParentIds.has(selected.candidate.id)
		if (selected === undefined || duplicate) {
			matches.push({
				transformedCandidateId: candidate.id,
				parentCandidateId: null,
				correspondenceKey: correspondence.key,
				applicable: false,
				inapplicableReason: selected === undefined ? "no-exact-rgb-inverse-mask-match" : "duplicate-parent-match",
			})
			continue
		}
		usedParentIds.add(selected.candidate.id)
		matches.push({
			transformedCandidateId: candidate.id,
			parentCandidateId: selected.candidate.id,
			correspondenceKey: correspondence.key,
			applicable: true,
			inapplicableReason: null,
		})
	}
	return deepFreeze(matches)
}

export interface NativeScaleSpaceResolvedRgbOperand {
	readonly declaredRgbKey: string
	readonly declaredRgb: RGB
	readonly resolvedExactRgb: RGB
	readonly stableKey: string
	readonly candidateId: number
	readonly witnessIndex: number
	readonly distance: number
}

export function resolveNativeScaleSpaceOperandRgb(
	availability: NativeScaleSpaceAvailability,
	declaredRgbKey: string,
	declaredRgb: RGB,
): NativeScaleSpaceResolvedRgbOperand | null {
	if (availability.candidates.length === 0) return null
	const declaredLab = rgbToOKLab(declaredRgb)
	let selected = availability.candidates[0]
	let selectedDistance = Math.sqrt(squaredDistance(declaredLab, selected.witnessOklab))
	for (let candidate = 1; candidate < availability.candidates.length; candidate++) {
		const current = availability.candidates[candidate]
		const distance = Math.sqrt(squaredDistance(declaredLab, current.witnessOklab))
		if (distance < selectedDistance || distance === selectedDistance && current.stableKey < selected.stableKey) {
			selected = current
			selectedDistance = distance
		}
	}
	return deepFreeze({
		declaredRgbKey,
		declaredRgb,
		resolvedExactRgb: selected.witnessRgb,
		stableKey: selected.stableKey,
		candidateId: selected.id,
		witnessIndex: selected.witnessIndex,
		distance: selectedDistance,
	})
}

export interface NativeScaleSpaceResolvedOperandTuple {
	readonly tuple: NativeScaleSpaceOperandTuple
	readonly candidateResolutions: readonly NativeScaleSpaceResolvedRgbOperand[]
	readonly resolvedOrderedEndpoint: Readonly<{ from: NativeScaleSpaceResolvedRgbOperand; to: NativeScaleSpaceResolvedRgbOperand }> | null
	readonly applicable: boolean
	readonly inapplicableReason: string | null
}

export function resolveNativeScaleSpaceOperandTuple(
	tuple: NativeScaleSpaceOperandTuple,
	availability: NativeScaleSpaceAvailability,
): NativeScaleSpaceResolvedOperandTuple {
	const candidateResolutions = tuple.candidateSelectors.flatMap(({ rgbKey, rgb }) => {
		const resolved = resolveNativeScaleSpaceOperandRgb(availability, rgbKey, rgb)
		return resolved === null ? [] : [resolved]
	})
	let resolvedOrderedEndpoint: { from: NativeScaleSpaceResolvedRgbOperand; to: NativeScaleSpaceResolvedRgbOperand } | null = null
	let inapplicableReason: string | null = null
	if (candidateResolutions.length === 0) inapplicableReason = "no-candidate-resolved"
	if (tuple.orderedEndpoint !== null) {
		const from = resolveNativeScaleSpaceOperandRgb(availability, tuple.orderedEndpoint.from, NATIVE_SCALE_SPACE_FIXTURE_RGB[tuple.orderedEndpoint.from])
		const to = resolveNativeScaleSpaceOperandRgb(availability, tuple.orderedEndpoint.to, NATIVE_SCALE_SPACE_FIXTURE_RGB[tuple.orderedEndpoint.to])
		if (from === null || to === null) inapplicableReason = "ordered-endpoint-did-not-resolve"
		else if (from.stableKey === to.stableKey || from.candidateId === to.candidateId) inapplicableReason = "ordered-endpoint-collapsed"
		else if (availability.orderedCandidateEdgeCount !== availability.candidates.length * (availability.candidates.length - 1)) {
			inapplicableReason = "ordered-edge-missing"
		} else resolvedOrderedEndpoint = { from, to }
	}
	const evaluatedTuple: NativeScaleSpaceOperandTuple = {
		...tuple,
		resolvedCandidateKeys: candidateResolutions.map(({ stableKey }) => stableKey),
	}
	return deepFreeze({
		tuple: evaluatedTuple,
		candidateResolutions,
		resolvedOrderedEndpoint,
		applicable: inapplicableReason === null,
		inapplicableReason,
	})
}

export type NativeScaleSpaceFixtureDisposition =
	| "invalid-structural"
	| "valid-fixture-falsified"
	| "valid-fixture-supported-diagnostic"
	| "valid-fixture-unsupported"

export interface NativeScaleSpaceScientificPredicateResult {
	readonly id: string
	readonly required: true
	readonly applicable: boolean
	readonly passed: boolean | null
	readonly details: Readonly<Record<string, number | string | boolean | null>>
}

export function nativeScaleSpaceFixtureDisposition(
	structuralValid: boolean,
	predicates: readonly NativeScaleSpaceScientificPredicateResult[],
): NativeScaleSpaceFixtureDisposition {
	if (!structuralValid) return "invalid-structural"
	const requiredIds = NATIVE_SCALE_SPACE_EXPECTATIONS.scientificPredicates.map(({ id }) => id)
	if (predicates.length !== requiredIds.length || new Set(predicates.map(({ id }) => id)).size !== requiredIds.length ||
		requiredIds.some((id) => !predicates.some((predicate) => predicate.id === id))) {
		throw new Error("scientific predicate result set is incomplete or duplicated")
	}
	if (predicates.some(({ applicable, passed }) => applicable && passed === false)) return "valid-fixture-falsified"
	if (predicates.every(({ applicable, passed }) => applicable && passed === true)) return "valid-fixture-supported-diagnostic"
	return "valid-fixture-unsupported"
}

function fixtureAvailability(id: NativeScaleSpaceFixtureId): NativeScaleSpaceAvailability {
	const fixture = createNativeScaleSpaceFixture(id)
	return createNativeScaleSpaceAvailability(fixture, {
		sourceSha256: fixture.bytesSha256,
		decodedNativeIdentity: fixture.identity,
		rasterPolicyIdentity: NATIVE_SCALE_SPACE_FIXTURE_IDENTITY_VERSION,
	})
}

function fixtureCandidateView(
	availability: NativeScaleSpaceAvailability,
	candidateId: number,
	arm: NativeScaleSpaceArm,
	target: NativeScaleSpaceTarget | null,
): NativeScaleSpaceFieldView {
	const mask = fillNativeScaleSpaceCandidateMask(availability, candidateId)
	if (arm === "A") return createNativeScaleSpaceAFieldView(mask, availability.width, availability.height)
	if (target === null) throw new Error("B/C fixture view requires a target")
	const dimensions = nativeScaleSpaceTargetDimensions(availability.width, availability.height, target)
	const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height)
	const bValues = filterSummedAreaTableQ24(sat, dimensions.width, dimensions.height)
	if (arm === "B") return createNativeScaleSpaceFieldView({
		arm,
		width: availability.width,
		height: availability.height,
		values: bValues,
		nativeBinaryMask: mask,
	})
	const samples = sampleQ24PlaneAtTargetCenters(
		bValues,
		availability.width,
		availability.height,
		dimensions.width,
		dimensions.height,
	)
	verifyQ24CenterSamplesExact(bValues, availability.width, availability.height, samples)
	return createNativeScaleSpaceFieldView({ arm, width: samples.width, height: samples.height, values: samples.values, sourceIndices: samples.sourceIndices })
}

function fixtureResolvedCandidate(availability: NativeScaleSpaceAvailability, rgbKey: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB): NativeScaleSpaceResolvedRgbOperand {
	const resolved = resolveNativeScaleSpaceOperandRgb(availability, rgbKey, NATIVE_SCALE_SPACE_FIXTURE_RGB[rgbKey])
	if (resolved === null) throw new Error("fixture candidate did not resolve")
	return resolved
}

function fixturePairCoverage(
	availability: NativeScaleSpaceAvailability,
	fromCandidateId: number,
	toCandidateId: number,
	arm: "A" | "B",
	target: NativeScaleSpaceTarget | null,
): number {
	const fromView = fixtureCandidateView(availability, fromCandidateId, arm, target)
	let toValues: NativeScaleSpaceQ24ValueSource
	if (arm === "A") {
		toValues = (index) => availability.candidateLabels[index] === toCandidateId ? NATIVE_SCALE_SPACE_Q24 : 0
	} else {
		if (target === null) throw new Error("Arm B pair fixture requires a target")
		const mask = fillNativeScaleSpaceCandidateMask(availability, toCandidateId)
		const dimensions = nativeScaleSpaceTargetDimensions(availability.width, availability.height, target)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height)
		toValues = (index) => centeredClippedBoxQ24At(
			sat,
			index % availability.width,
			Math.floor(index / availability.width),
			dimensions.width,
			dimensions.height,
		)
	}
	return evaluateNativeScaleSpacePairMetrics({
		availability,
		fromCandidateId,
		toCandidateId,
		fromValues: fromView.values,
		toValues,
		width: fromView.width,
		height: fromView.height,
	})["continuity.pairCoverage"] as number
}

/** Evaluate the complete seven predeclared scientific fixture predicates without retaining fixture planes. */
export function evaluateNativeScaleSpaceScientificPredicates(): readonly NativeScaleSpaceScientificPredicateResult[] {
	const availability = new Map<NativeScaleSpaceFixtureId, NativeScaleSpaceAvailability>()
	const get = (id: NativeScaleSpaceFixtureId): NativeScaleSpaceAvailability => {
		let value = availability.get(id)
		if (!value) {
			value = fixtureAvailability(id)
			availability.set(id, value)
		}
		return value
	}
	const results: NativeScaleSpaceScientificPredicateResult[] = []

	{
		const frozen = get("uniform-d")
		const candidate = fixtureResolvedCandidate(frozen, "D")
		const views = [
			fixtureCandidateView(frozen, candidate.candidateId, "A", null),
			fixtureCandidateView(frozen, candidate.candidateId, "B", target8),
			fixtureCandidateView(frozen, candidate.candidateId, "C", target8),
		]
		const metrics = views.map((view) => evaluateNativeScaleSpaceFieldMetrics(view))
		const passed = metrics.every((row) => row["field.mass"] === 1 && row["field.activeMass.Q/2"] === 1 &&
			row["component.count.Q/2"] === 1 && row["detail.boundaryDensity.Q/2"] === 0)
		results.push({ id: "uniformInvariantSubset", required: true, applicable: true, passed, details: { rows: metrics.length, bcSampleExact: true } })
	}
	{
		const frozen = get("checker-1px")
		const candidate = fixtureResolvedCandidate(frozen, "D")
		const a = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(frozen, candidate.candidateId, "A", null))["detail.boundaryDensity.Q/2"] as number
		const b = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(frozen, candidate.candidateId, "B", target8))["detail.boundaryDensity.Q/2"] as number
		results.push({ id: "checkerAttenuated", required: true, applicable: true, passed: b < a, details: { a, b } })
	}
	{
		const frozen = get("vertical-split")
		const from = fixtureResolvedCandidate(frozen, "D")
		const to = fixtureResolvedCandidate(frozen, "L")
		const applicable = from.stableKey !== to.stableKey
		const a = applicable ? fixturePairCoverage(frozen, from.candidateId, to.candidateId, "A", null) : 0
		const b = applicable ? fixturePairCoverage(frozen, from.candidateId, to.candidateId, "B", target8) : 0
		results.push({ id: "splitRetained", required: true, applicable, passed: applicable ? b >= 0.95 * a : null, details: { a, b } })
	}
	{
		const split = get("vertical-split")
		const checker = get("checker-1px")
		const splitCandidate = fixtureResolvedCandidate(split, "D")
		const checkerCandidate = fixtureResolvedCandidate(checker, "D")
		const splitMetrics = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(split, splitCandidate.candidateId, "A", null))
		const checkerMetrics = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(checker, checkerCandidate.candidateId, "A", null))
		const passed = splitMetrics["field.mass"] === checkerMetrics["field.mass"] &&
			splitMetrics["component.signature.Q/2"] !== checkerMetrics["component.signature.Q/2"] &&
			(splitMetrics["component.count.Q/2"] as number) < (checkerMetrics["component.count.Q/2"] as number)
		results.push({ id: "geometryDistinguished", required: true, applicable: true, passed, details: {
			splitMass: splitMetrics["field.mass"] as number,
			checkerMass: checkerMetrics["field.mass"] as number,
			splitCount: splitMetrics["component.count.Q/2"] as number,
			checkerCount: checkerMetrics["component.count.Q/2"] as number,
		} })
	}
	{
		const broad = get("broad-ramp")
		const local = get("local-ramp")
		const broadFrom = fixtureResolvedCandidate(broad, "D")
		const broadTo = fixtureResolvedCandidate(broad, "L")
		const localFrom = fixtureResolvedCandidate(local, "D")
		const localTo = fixtureResolvedCandidate(local, "L")
		const applicable = broadFrom.stableKey !== broadTo.stableKey && localFrom.stableKey !== localTo.stableKey
		const broadValue = applicable ? fixturePairCoverage(broad, broadFrom.candidateId, broadTo.candidateId, "B", target8) : 0
		const localValue = applicable ? fixturePairCoverage(local, localFrom.candidateId, localTo.candidateId, "B", target8) : 0
		results.push({ id: "broadBeatsLocal", required: true, applicable, passed: applicable ? broadValue > localValue : null, details: { broad: broadValue, local: localValue } })
	}
	{
		const frozen = get("frame-interior")
		const frame = fixtureResolvedCandidate(frozen, "F")
		const interior = fixtureResolvedCandidate(frozen, "G")
		const applicable = frame.stableKey !== interior.stableKey
		const frameMetrics = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(frozen, frame.candidateId, "B", target16))
		const interiorMetrics = evaluateNativeScaleSpaceFieldMetrics(fixtureCandidateView(frozen, interior.candidateId, "B", target16))
		const frameExcess = frameMetrics["frame.excess.Q/2"] as number
		const interiorExcess = interiorMetrics["frame.excess.Q/2"] as number
		const frameOwnership = frameMetrics["frame.interiorOwnership.Q/2"] as number
		const interiorOwnership = interiorMetrics["frame.interiorOwnership.Q/2"] as number
		results.push({ id: "frameDistinguished", required: true, applicable, passed: applicable ? frameExcess > interiorExcess && interiorOwnership > frameOwnership : null, details: { frameExcess, interiorExcess, frameOwnership, interiorOwnership } })
	}
	{
		const frozen = get("thin-line")
		const candidate = fixtureResolvedCandidate(frozen, "T")
		const exactWitness = candidate.resolvedExactRgb.every((channel, index) => channel === NATIVE_SCALE_SPACE_FIXTURE_RGB.T[index])
		const values = [
			fixtureCandidateView(frozen, candidate.candidateId, "A", null),
			fixtureCandidateView(frozen, candidate.candidateId, "B", target16),
			fixtureCandidateView(frozen, candidate.candidateId, "C", target16),
		].map((view) => evaluateNativeScaleSpaceFieldMetrics(view)["typography.thinMass.Q/2"] as number)
		const passed = exactWitness && values.every(Number.isFinite)
		results.push({ id: "thinIdentityRetained", required: true, applicable: true, passed, details: { exactWitness, a: values[0], b: values[1], c: values[2] } })
	}
	return deepFreeze(results)
}

export interface NativeScaleSpaceFixtureStructuralRow {
	readonly matrixId: "source-bytes" | "native-transform" | "filter-recompute" | "sample-recompute" | "phase-diagnostics" | "deterministic-rerun"
	readonly fixtureId: NativeScaleSpaceFixtureId
	readonly transformId: NativeScaleSpaceTransformId
	readonly arm: NativeScaleSpaceArm | null
	readonly target: NativeScaleSpaceTarget | null
	readonly passed: boolean
	readonly diagnostic: Readonly<Record<string, unknown>>
}

interface FixtureFieldSnapshot {
	readonly bHash: string
	readonly cHash: string
	readonly sourceIndicesHash: string
	readonly bMetricsJson: string
	readonly cMetricsJson: string
	readonly sampleExact: boolean
}

interface FixtureTransformContext {
	readonly transformId: NativeScaleSpaceTransformId
	readonly fixture: TransformedNativeScaleSpaceFixture
	readonly availability: NativeScaleSpaceAvailability
	readonly sourceDeterministic: boolean
}

function fixtureTransformBytesExact(
	parent: NativeScaleSpaceFixture,
	transformed: TransformedNativeScaleSpaceFixture,
): boolean {
	for (let y = 0; y < transformed.height; y++) {
		for (let x = 0; x < transformed.width; x++) {
			const source = nativeScaleSpaceInverseTransformCoordinate(
				transformed.transformId,
				x,
				y,
				parent.width,
				parent.height,
			)
			const parentOffset = (source.y * parent.width + source.x) * 3
			const transformedOffset = (y * transformed.width + x) * 3
			for (let channel = 0; channel < 3; channel++) {
				if (transformed.data[transformedOffset + channel] !== parent.data[parentOffset + channel]) return false
			}
		}
	}
	return true
}

export interface NativeScaleSpaceFixturePhaseCandidateDiagnostic {
	readonly transformedCandidateId: number
	readonly parentCandidateId: number | null
	readonly correspondenceKey: string
	readonly metricId: "stability.transformBDeltaQ24" | "stability.transformCToParentBDeltaQ24"
	readonly applicable: boolean
	readonly inapplicableReason: string | null
	readonly reduction: Readonly<{
		typedSha256: string
		length: number
		minimum: number
		maximum: number
		sumDecimal: string
		meanAbsolute: number
	}> | null
}

function fixtureFieldSnapshot(
	mask: Uint8Array,
	width: number,
	height: number,
	targetWidth: number,
	targetHeight: number,
): FixtureFieldSnapshot {
	const sat = buildBinaryMaskSummedAreaTable(mask, width, height)
	const values = filterSummedAreaTableQ24(sat, targetWidth, targetHeight)
	const samples = sampleQ24PlaneAtTargetCenters(values, width, height, targetWidth, targetHeight)
	let sampleExact = true
	try {
		verifyQ24CenterSamplesExact(values, width, height, samples)
	} catch {
		sampleExact = false
	}
	const bMetrics = evaluateNativeScaleSpaceFieldMetrics(createNativeScaleSpaceFieldView({
		arm: "B", width, height, values, nativeBinaryMask: mask,
	}))
	const cMetrics = evaluateNativeScaleSpaceFieldMetrics(createNativeScaleSpaceFieldView({
		arm: "C", width: samples.width, height: samples.height, values: samples.values, sourceIndices: samples.sourceIndices,
	}))
	return {
		bHash: canonicalTypedArrayHash(values, [height, width]),
		cHash: canonicalTypedArrayHash(samples.values, [samples.height, samples.width]),
		sourceIndicesHash: canonicalTypedArrayHash(samples.sourceIndices, [samples.height, samples.width]),
		bMetricsJson: canonicalJson(bMetrics),
		cMetricsJson: canonicalJson(cMetrics),
		sampleExact,
	}
}

function compactFixtureDelta(
	metricId: NativeScaleSpaceFixturePhaseCandidateDiagnostic["metricId"],
	delta: NativeScaleSpaceTransformDelta,
): NativeScaleSpaceFixturePhaseCandidateDiagnostic["reduction"] {
	assertNativeScaleSpaceMetricRecord({ [metricId]: delta })
	return Object.freeze({
		typedSha256: delta.typedSha256,
		length: delta.values.length,
		minimum: delta.minimum,
		maximum: delta.maximum,
		sumDecimal: delta.sumDecimal,
		meanAbsolute: delta.meanAbsolute,
	})
}

function fixtureFilterRecompute(
	availability: NativeScaleSpaceAvailability,
	target: NativeScaleSpaceTarget,
): Readonly<{ passed: boolean; candidateCount: number; valuesManifestSha256: string; partitionMaximumAbsolute: number }> {
	const dimensions = nativeScaleSpaceTargetDimensions(availability.width, availability.height, target)
	const mask = new Uint8Array(availability.width * availability.height)
	const residual = createQ24PartitionResidualAccumulator(mask.length, availability.candidates.length)
	const hashes: string[] = []
	let passed = true
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height)
		const values = filterSummedAreaTableQ24(sat, dimensions.width, dimensions.height)
		for (let index = 0; index < values.length; index++) {
			const recomputed = centeredClippedBoxQ24At(
				sat,
				index % availability.width,
				Math.floor(index / availability.width),
				dimensions.width,
				dimensions.height,
			)
			if (values[index] !== recomputed) passed = false
		}
		hashes.push(canonicalTypedArrayHash(values, [availability.height, availability.width]))
		accumulateQ24PartitionPlane(residual, values)
	}
	let partitionMaximumAbsolute = -1
	try {
		partitionMaximumAbsolute = finalizeQ24PartitionResidual(residual).maximumAbsolute
	} catch {
		passed = false
	}
	return Object.freeze({
		passed,
		candidateCount: availability.candidates.length,
		valuesManifestSha256: domainSeparatedCanonicalSha256("native-scale-space-fixture-filter-recompute-v1", hashes),
		partitionMaximumAbsolute,
	})
}

function fixtureSampleRecompute(
	availability: NativeScaleSpaceAvailability,
	target: NativeScaleSpaceTarget,
): Readonly<{ passed: boolean; candidateCount: number; valuesManifestSha256: string; sourceIndicesSha256: string }> {
	const dimensions = nativeScaleSpaceTargetDimensions(availability.width, availability.height, target)
	const mask = new Uint8Array(availability.width * availability.height)
	const valueHashes: string[] = []
	let sourceIndicesSha256 = ""
	let passed = true
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const sat = buildBinaryMaskSummedAreaTable(mask, availability.width, availability.height)
		const bValues = filterSummedAreaTableQ24(sat, dimensions.width, dimensions.height)
		const samples = sampleQ24PlaneAtTargetCenters(
			bValues,
			availability.width,
			availability.height,
			dimensions.width,
			dimensions.height,
		)
		let cell = 0
		for (let v = 0; v < dimensions.height; v++) {
			const sourceY = nearestCenterCoordinate(v, dimensions.height, availability.height)
			for (let u = 0; u < dimensions.width; u++) {
				const sourceX = nearestCenterCoordinate(u, dimensions.width, availability.width)
				const sourceIndex = sourceY * availability.width + sourceX
				if (samples.sourceIndices[cell] !== sourceIndex || samples.values[cell] !== bValues[sourceIndex]) passed = false
				cell++
			}
		}
		valueHashes.push(canonicalTypedArrayHash(samples.values, [samples.height, samples.width]))
		const currentSourceIndicesSha256 = canonicalTypedArrayHash(samples.sourceIndices, [samples.height, samples.width])
		if (sourceIndicesSha256 !== "" && currentSourceIndicesSha256 !== sourceIndicesSha256) passed = false
		sourceIndicesSha256 = currentSourceIndicesSha256
	}
	return Object.freeze({
		passed,
		candidateCount: availability.candidates.length,
		valuesManifestSha256: domainSeparatedCanonicalSha256("native-scale-space-fixture-sample-recompute-v1", valueHashes),
		sourceIndicesSha256,
	})
}

function fixtureDeterministicA(
	availability: NativeScaleSpaceAvailability,
): Readonly<{ passed: boolean; candidateCount: number; manifestSha256: string }> {
	const mask = new Uint8Array(availability.width * availability.height)
	const manifests: string[] = []
	let passed = true
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const first = createNativeScaleSpaceAFieldView(mask, availability.width, availability.height)
		const firstManifest = canonicalJson({
			valuesSha256: canonicalTypedArrayHash(first.values, [first.height, first.width]),
			metrics: evaluateNativeScaleSpaceFieldMetrics(first),
		})
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const second = createNativeScaleSpaceAFieldView(mask, availability.width, availability.height)
		const secondManifest = canonicalJson({
			valuesSha256: canonicalTypedArrayHash(second.values, [second.height, second.width]),
			metrics: evaluateNativeScaleSpaceFieldMetrics(second),
		})
		if (firstManifest !== secondManifest) passed = false
		manifests.push(firstManifest)
	}
	return Object.freeze({
		passed,
		candidateCount: availability.candidates.length,
		manifestSha256: domainSeparatedCanonicalSha256("native-scale-space-fixture-deterministic-a-v1", manifests),
	})
}

function fixtureDeterministicBC(
	availability: NativeScaleSpaceAvailability,
	target: NativeScaleSpaceTarget,
): Readonly<{
	bPassed: boolean
	cPassed: boolean
	candidateCount: number
	bManifestSha256: string
	cManifestSha256: string
}> {
	const dimensions = nativeScaleSpaceTargetDimensions(availability.width, availability.height, target)
	const mask = new Uint8Array(availability.width * availability.height)
	const bManifests: string[] = []
	const cManifests: string[] = []
	let bPassed = true
	let cPassed = true
	for (const candidate of availability.candidates) {
		fillNativeScaleSpaceCandidateMask(availability, candidate.id, mask)
		const first = fixtureFieldSnapshot(mask, availability.width, availability.height, dimensions.width, dimensions.height)
		const second = fixtureFieldSnapshot(mask, availability.width, availability.height, dimensions.width, dimensions.height)
		if (first.bHash !== second.bHash || first.bMetricsJson !== second.bMetricsJson) bPassed = false
		if (!first.sampleExact || !second.sampleExact || first.cHash !== second.cHash ||
			first.sourceIndicesHash !== second.sourceIndicesHash || first.cMetricsJson !== second.cMetricsJson) cPassed = false
		bManifests.push(canonicalJson({ valuesSha256: first.bHash, metrics: first.bMetricsJson }))
		cManifests.push(canonicalJson({ valuesSha256: first.cHash, sourceIndicesSha256: first.sourceIndicesHash, metrics: first.cMetricsJson }))
	}
	return Object.freeze({
		bPassed,
		cPassed,
		candidateCount: availability.candidates.length,
		bManifestSha256: domainSeparatedCanonicalSha256("native-scale-space-fixture-deterministic-b-v1", bManifests),
		cManifestSha256: domainSeparatedCanonicalSha256("native-scale-space-fixture-deterministic-c-v1", cManifests),
	})
}

function fixturePhaseDiagnostics(
	parent: NativeScaleSpaceAvailability,
	transformed: NativeScaleSpaceAvailability,
	transformId: NativeScaleSpaceTransformId,
	target: NativeScaleSpaceTarget,
	correspondence: readonly NativeScaleSpaceCandidateCorrespondenceMatch[],
): Readonly<{
	bPassed: boolean
	cPassed: boolean
	b: readonly NativeScaleSpaceFixturePhaseCandidateDiagnostic[]
	c: readonly NativeScaleSpaceFixturePhaseCandidateDiagnostic[]
}> {
	const parentTarget = nativeScaleSpaceTargetDimensions(parent.width, parent.height, target)
	const transformedTarget = nativeScaleSpaceTargetDimensions(transformed.width, transformed.height, target)
	const parentMask = new Uint8Array(parent.width * parent.height)
	const transformedMask = new Uint8Array(transformed.width * transformed.height)
	const b: NativeScaleSpaceFixturePhaseCandidateDiagnostic[] = []
	const c: NativeScaleSpaceFixturePhaseCandidateDiagnostic[] = []
	let bPassed = true
	let cPassed = true
	for (const match of correspondence) {
		const base = {
			transformedCandidateId: match.transformedCandidateId,
			parentCandidateId: match.parentCandidateId,
			correspondenceKey: match.correspondenceKey,
		}
		if (!match.applicable || match.parentCandidateId === null) {
			b.push({ ...base, metricId: "stability.transformBDeltaQ24", applicable: false, inapplicableReason: match.inapplicableReason, reduction: null })
			c.push({ ...base, metricId: "stability.transformCToParentBDeltaQ24", applicable: false, inapplicableReason: match.inapplicableReason, reduction: null })
			continue
		}
		fillNativeScaleSpaceCandidateMask(parent, match.parentCandidateId, parentMask)
		const parentSat = buildBinaryMaskSummedAreaTable(parentMask, parent.width, parent.height)
		const parentB = filterSummedAreaTableQ24(parentSat, parentTarget.width, parentTarget.height)
		fillNativeScaleSpaceCandidateMask(transformed, match.transformedCandidateId, transformedMask)
		const transformedSat = buildBinaryMaskSummedAreaTable(transformedMask, transformed.width, transformed.height)
		try {
			const delta = computeNativeScaleSpaceTransformBDeltaQ24({
				parentValues: parentB,
				parentWidth: parent.width,
				parentHeight: parent.height,
				transformedValues: (index) => centeredClippedBoxQ24At(
					transformedSat,
					index % transformed.width,
					Math.floor(index / transformed.width),
					transformedTarget.width,
					transformedTarget.height,
				),
				transformId,
			})
			b.push({ ...base, metricId: "stability.transformBDeltaQ24", applicable: true, inapplicableReason: null,
				reduction: compactFixtureDelta("stability.transformBDeltaQ24", delta) })
		} catch {
			bPassed = false
			b.push({ ...base, metricId: "stability.transformBDeltaQ24", applicable: true, inapplicableReason: "exact-computation-failed", reduction: null })
		}
		try {
			const cValues = new Uint32Array(transformedTarget.width * transformedTarget.height)
			const sourceIndices = new Uint32Array(cValues.length)
			let cell = 0
			for (let v = 0; v < transformedTarget.height; v++) {
				const y = nearestCenterCoordinate(v, transformedTarget.height, transformed.height)
				for (let u = 0; u < transformedTarget.width; u++) {
					const x = nearestCenterCoordinate(u, transformedTarget.width, transformed.width)
					const sourceIndex = y * transformed.width + x
					sourceIndices[cell] = sourceIndex
					cValues[cell] = centeredClippedBoxQ24At(
						transformedSat,
						x,
						y,
						transformedTarget.width,
						transformedTarget.height,
					)
					cell++
				}
			}
			const delta = computeNativeScaleSpaceTransformCToParentBDeltaQ24({
				parentBValues: parentB,
				parentWidth: parent.width,
				parentHeight: parent.height,
				transformedCValues: cValues,
				transformedCSourceIndices: sourceIndices,
				transformedWidth: transformedTarget.width,
				transformedHeight: transformedTarget.height,
				transformId,
			})
			c.push({ ...base, metricId: "stability.transformCToParentBDeltaQ24", applicable: true, inapplicableReason: null,
				reduction: compactFixtureDelta("stability.transformCToParentBDeltaQ24", delta) })
		} catch {
			cPassed = false
			c.push({ ...base, metricId: "stability.transformCToParentBDeltaQ24", applicable: true, inapplicableReason: "exact-computation-failed", reduction: null })
		}
	}
	return deepFreeze({ bPassed, cPassed, b, c })
}

/** Evaluate the exact enumerated fixture matrix with one row per declared Cartesian operand. */
export function evaluateNativeScaleSpaceFixtureStructuralRows(
	fixtureIds: readonly NativeScaleSpaceFixtureId[] = fixtureEntries.map(({ id }) => id),
	transformIds: readonly NativeScaleSpaceTransformId[] = NATIVE_SCALE_SPACE_TRANSFORMS.map(({ id }) => id),
	targets: readonly NativeScaleSpaceTarget[] = NATIVE_SCALE_SPACE_FIXTURE_TARGETS,
): readonly NativeScaleSpaceFixtureStructuralRow[] {
	const rows: NativeScaleSpaceFixtureStructuralRow[] = []
	for (const fixtureId of fixtureIds) {
		const fixture = createNativeScaleSpaceFixture(fixtureId)
		const repeated = createNativeScaleSpaceFixture(fixtureId)
		rows.push({
			matrixId: "source-bytes",
			fixtureId,
			transformId: "identity",
			arm: null,
			target: null,
			passed: fixture.identity === repeated.identity && fixture.bytesSha256 === repeated.bytesSha256 && fixture.data.every((value, index) => value === repeated.data[index]),
			diagnostic: { bytesSha256: fixture.bytesSha256, fixtureIdentity: fixture.identity },
		})
		const parentAvailability = createNativeScaleSpaceAvailability(fixture, {
			sourceSha256: fixture.bytesSha256,
			decodedNativeIdentity: fixture.identity,
			rasterPolicyIdentity: NATIVE_SCALE_SPACE_FIXTURE_IDENTITY_VERSION,
		})
		const contexts: FixtureTransformContext[] = []
		for (const transformId of transformIds) {
			const transformed = transformNativeScaleSpaceFixture(fixture, transformId)
			const transformedRepeat = transformNativeScaleSpaceFixture(fixture, transformId)
			const transformedAvailability = createNativeScaleSpaceAvailability(transformed, {
				sourceSha256: transformed.bytesSha256,
				decodedNativeIdentity: transformed.identity,
				rasterPolicyIdentity: NATIVE_SCALE_SPACE_TRANSFORM_IDENTITY_VERSION,
			})
			contexts.push({
				transformId,
				fixture: transformed,
				availability: transformedAvailability,
				sourceDeterministic: transformed.identity === transformedRepeat.identity && transformed.bytesSha256 === transformedRepeat.bytesSha256 &&
					transformed.data.every((value, index) => value === transformedRepeat.data[index]),
			})
		}

		for (const context of contexts.filter(({ transformId }) => transformId !== "identity")) {
			const correspondence = matchNativeScaleSpaceTransformedCandidates(parentAvailability, context.availability, context.transformId)
			const correspondenceExact = context.availability.candidates.length === parentAvailability.candidates.length &&
				correspondence.every(({ applicable }) => applicable) &&
				new Set(correspondence.map(({ parentCandidateId }) => parentCandidateId)).size === parentAvailability.candidates.length
			const transformedBytesExact = fixtureTransformBytesExact(fixture, context.fixture)
			rows.push({
				matrixId: "native-transform",
				fixtureId,
				transformId: context.transformId,
				arm: "A",
				target: null,
				passed: context.sourceDeterministic && transformedBytesExact && correspondenceExact,
				diagnostic: { transformedBytesExact, correspondence },
			})
		}

		for (const context of contexts) {
			for (const target of targets) {
				const filter = fixtureFilterRecompute(context.availability, target)
				rows.push({ matrixId: "filter-recompute", fixtureId, transformId: context.transformId, arm: "B", target,
					passed: filter.passed, diagnostic: filter })
				const sample = fixtureSampleRecompute(context.availability, target)
				rows.push({ matrixId: "sample-recompute", fixtureId, transformId: context.transformId, arm: "C", target,
					passed: sample.passed, diagnostic: sample })
			}
		}

		for (const context of contexts.filter(({ transformId }) => transformId !== "identity")) {
			const correspondence = matchNativeScaleSpaceTransformedCandidates(parentAvailability, context.availability, context.transformId)
			for (const target of targets) {
				const phase = fixturePhaseDiagnostics(parentAvailability, context.availability, context.transformId, target, correspondence)
				rows.push({ matrixId: "phase-diagnostics", fixtureId, transformId: context.transformId, arm: "B", target,
					passed: phase.bPassed, diagnostic: { candidates: phase.b } })
				rows.push({ matrixId: "phase-diagnostics", fixtureId, transformId: context.transformId, arm: "C", target,
					passed: phase.cPassed, diagnostic: { candidates: phase.c } })
			}
		}

		for (const context of contexts) {
			const a = fixtureDeterministicA(context.availability)
			rows.push({ matrixId: "deterministic-rerun", fixtureId, transformId: context.transformId, arm: "A", target: null,
				passed: context.sourceDeterministic && a.passed, diagnostic: a })
			for (const target of targets) {
				const bc = fixtureDeterministicBC(context.availability, target)
				rows.push({ matrixId: "deterministic-rerun", fixtureId, transformId: context.transformId, arm: "B", target,
					passed: context.sourceDeterministic && bc.bPassed,
					diagnostic: { candidateCount: bc.candidateCount, manifestSha256: bc.bManifestSha256 } })
				rows.push({ matrixId: "deterministic-rerun", fixtureId, transformId: context.transformId, arm: "C", target,
					passed: context.sourceDeterministic && bc.cPassed,
					diagnostic: { candidateCount: bc.candidateCount, manifestSha256: bc.cManifestSha256 } })
			}
		}
	}
	return deepFreeze(rows)
}

export function nativeScaleSpaceBcSampleExact(
	source: Uint32Array,
	sourceWidth: number,
	sourceHeight: number,
	samples: NativeScaleSpaceCenterSamples,
): boolean {
	try {
		return verifyQ24CenterSamplesExact(source, sourceWidth, sourceHeight, samples)
	} catch {
		return false
	}
}

export function evaluateNativeScaleSpaceBcSampleStabilityMetrics(
	source: Uint32Array,
	sourceWidth: number,
	sourceHeight: number,
	samples: NativeScaleSpaceCenterSamples,
): NativeScaleSpaceMetricRecord {
	const metrics = { "stability.bcSampleExact": nativeScaleSpaceBcSampleExact(source, sourceWidth, sourceHeight, samples) }
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function evaluateNativeScaleSpacePartitionStabilityMetrics(
	summary: Q24PartitionResidualSummary,
): NativeScaleSpaceMetricRecord {
	const valid = summary.boundSatisfied === true && summary.maximumAbsolute <= Math.floor(summary.candidateCount / 2) &&
		summary.bound === Math.floor(summary.candidateCount / 2) && summary.pixelCount > 0
	const metrics = { "stability.partitionResidualBound": valid }
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function evaluateNativeScaleSpaceTransformBStabilityMetrics(input: Parameters<typeof computeNativeScaleSpaceTransformBDeltaQ24>[0]): NativeScaleSpaceMetricRecord {
	const metrics = { "stability.transformBDeltaQ24": computeNativeScaleSpaceTransformBDeltaQ24(input) }
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}

export function evaluateNativeScaleSpaceTransformCStabilityMetrics(input: Parameters<typeof computeNativeScaleSpaceTransformCToParentBDeltaQ24>[0]): NativeScaleSpaceMetricRecord {
	const metrics = { "stability.transformCToParentBDeltaQ24": computeNativeScaleSpaceTransformCToParentBDeltaQ24(input) }
	assertNativeScaleSpaceMetricRecord(metrics)
	return Object.freeze(metrics)
}
