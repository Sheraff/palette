import { createHash } from "node:crypto"
import {
	apcaContrast,
	chroma,
	contrastRatio,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import { GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY } from "./gradient-field-topology-model.ts"
import {
	buildNativeFieldHypothesisGraphWithFamilyQueries,
	NATIVE_FIELD_FAMILY_QUERY_POLICY,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	queryNativeFieldFamiliesAndTopology,
	type NativeFieldFamilyQuery,
	type NativeFieldHypothesisGraph,
	type NativeFieldRepresentative,
	type NativeFieldTopologyQuery,
	type NativeFieldTopologyQueryInput,
} from "./native-field-hypothesis-graph.ts"
import type { GradientEvidence, OKLab, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const NATIVE_COMPLETE_PALETTE_VERSION = "native-complete-palette-0.2.5-development" as const
export const NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION = "native-complete-palette-protocol-v2.5" as const
export const NATIVE_COMPLETE_PALETTE_POLICY_VERSION = "native-complete-palette-policy-v2.3" as const
export const NATIVE_COMPLETE_PALETTE_CANONICAL_VERSION = "region-graph-0.19.0" as const
export const NATIVE_COMPLETE_PALETTE_COMPARATOR_SHA256 =
	"546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN_SHA256 =
	"079691998bcc510cea2abd912e23390d78b16ba369a3ee4bf13b64650bcd4e21" as const
export const NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER = deepFreeze({
	path: "research/data/experiments/next-palette-0.4.0-connected-family-development/manifest.json#sources",
	artifactSha256: "8cb313d9be72a6f3765f43d2cc4c1cb3021bd09d66cbdebd95d34f44eda0f03d",
	asciiSortedSemanticSha256: "ab017ea6e3cffc52a1a3af94d40ad703afcdd5654bab13ffb7e6a66a3232868c",
	rows: 392,
	developmentRows: 37,
	cohort00Rows: 355,
	uniqueEncodedSha256Groups: 391,
} as const)

const epsilon = 1e-12
const roleNames = ["background", "foreground", "surface", "accent"] as const
const blockNames = ["Field", "Foreground", "Accent", "Composition", "Robustness"] as const

export const NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER = Object.freeze([
	"field.backgroundSupport",
	"field.surfaceSupport",
	"field.multiplicityFit",
	"field.relationStateSupport",
	"field.scaleAgreement",
	"field.exactTopologyState",
	"foreground.roleSupportOrNecessity",
	"foreground.populationOrNecessity",
	"foreground.backgroundApca",
	"foreground.surfaceApca",
	"accent.identitySupport",
	"accent.localSupport",
	"accent.population",
	"accent.backgroundApca",
	"accent.surfaceApca",
	"composition.familyCoverage",
	"composition.foregroundFieldSeparation",
	"composition.accentFieldSeparation",
	"composition.accentForegroundSeparation",
	"composition.sourceChromaCoverage",
	"composition.toneSpan",
	"robustness.backgroundFamily",
	"robustness.surfaceFamily",
	"robustness.foregroundFamily",
	"robustness.accentFamily",
	"robustness.topologyScale",
	"robustness.exactIdentity",
] as const)

export type NativeCompletePaletteComponentName = typeof NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER[number]
export type NativeCompletePaletteBlockName = typeof blockNames[number]
export type NativeCompletePaletteFieldState = "collapsed" | "distinct-flat" | "gradient"
export type NativeCompletePaletteAblationName =
	| "canonical-background"
	| "canonical-surface"
	| "canonical-field-state"
	| "canonical-field-block"
	| "canonical-foreground"
	| "canonical-accent"
	| "canonical-overlay-block"
	| "without-connected-family-local"

export const NATIVE_COMPLETE_PALETTE_ABLATIONS = Object.freeze([
	"canonical-background",
	"canonical-surface",
	"canonical-field-state",
	"canonical-field-block",
	"canonical-foreground",
	"canonical-accent",
	"canonical-overlay-block",
	"without-connected-family-local",
] as const satisfies readonly NativeCompletePaletteAblationName[])

export const NATIVE_COMPLETE_PALETTE_THRESHOLDS: Readonly<Record<NativeCompletePaletteComponentName, number>> =
	Object.freeze({
		"field.backgroundSupport": 0.05,
		"field.surfaceSupport": 0.03,
		"field.multiplicityFit": 0.03,
		"field.relationStateSupport": 0.03,
		"field.scaleAgreement": 0.5,
		"field.exactTopologyState": 0.05,
		"foreground.roleSupportOrNecessity": 0.05,
		"foreground.populationOrNecessity": 0.02,
		"foreground.backgroundApca": 0,
		"foreground.surfaceApca": 0,
		"accent.identitySupport": 0.05,
		"accent.localSupport": 0.02,
		"accent.population": 0.01,
		"accent.backgroundApca": 0,
		"accent.surfaceApca": 0,
		"composition.familyCoverage": 0.1,
		"composition.foregroundFieldSeparation": 0.1388888888888889,
		"composition.accentFieldSeparation": 0.1388888888888889,
		"composition.accentForegroundSeparation": 0.1388888888888889,
		"composition.sourceChromaCoverage": 0,
		"composition.toneSpan": 0.1,
		"robustness.backgroundFamily": 0.25,
		"robustness.surfaceFamily": 0.25,
		"robustness.foregroundFamily": 0.25,
		"robustness.accentFamily": 0.25,
		"robustness.topologyScale": 0.5,
		"robustness.exactIdentity": 1,
	})

export const NATIVE_COMPLETE_PALETTE_POLICY = deepFreeze({
	version: NATIVE_COMPLETE_PALETTE_POLICY_VERSION,
	comparisonEpsilon: epsilon,
	ordering: "ascii-code-unit",
	allowedSourceRoots: ["00", "images"],
	forbiddenSourceRoots: ["10", "11", "12", "13", "14"],
	maximumChangedExactSourceGroups: 40,
	perSourceWallMilliseconds: 600_000,
	perSourceChildRssBytes: 1_342_177_280,
	concurrency: 4,
	aggregateDeclaredChildCeilingBytes: 5_368_709_120,
	maximumDistinctColors: 4,
	distinctFieldMinimumDistance: 0.025,
	accentMinimumDistance: 0.025,
	foregroundApca: { eligibility: "finite-only-no-minimum", positiveMinimumLc: 0, negativeMinimumMagnitudeLc: 0 },
	accentApca: { eligibility: "finite-only-no-minimum", positiveMinimumLc: 0, negativeMinimumMagnitudeLc: 0 },
	normalization: {
		distance: "clamp01(oklab-distance/0.18)",
		population: "sqrt(clamp01(population/max-representative-population))",
		chroma: "clamp01(chroma/max-representative-chroma)",
		foregroundApca: "clamp01(abs(signed-lc)/120)",
		accentApca: "clamp01(abs(signed-lc)/20)",
		familySupport: "minimum(native-and-profile-field-eligibility-support)",
		familyStability: "1-clamp01(max-profile-population-movement/max(native-population,1e-12))",
		topologyStability: "1-clamp01(max-profile-score-min-profile-score)",
	},
	componentFormulas: {
		"field.backgroundSupport": "familySupport(background-family)",
		"field.surfaceSupport": "collapsed?background-support:familySupport(surface-family)",
		"field.multiplicityFit": "collapsed?oneFieldFit.minimum:twoFieldFit.minimum",
		"field.relationStateSupport": "collapsed?stateSupport.minimum:selected-relation-state-support.minimum",
		"field.scaleAgreement": "collapsed?1-clamp01(oneFieldFit.range):min(stateAgreement,1-clamp01(selected-state-support.range))",
		"field.exactTopologyState": "collapsed?1:gradient?exact-224-score:1-exact-224-score",
		"foreground.roleSupportOrNecessity": "source?clamp01(max(text,detail)):necessary-fallback?1:0",
		"foreground.populationOrNecessity": "source?sqrt(clamp01(population/max-representative-population)):necessary-fallback?1:0",
		"foreground.backgroundApca": "clamp01(abs(foreground-on-background-signed-lc)/120)",
		"foreground.surfaceApca": "clamp01(abs(foreground-on-surface-signed-lc)/120)",
		"accent.identitySupport": "clamp01(max(chroma/max-representative-chroma,saliency))",
		"accent.localSupport": "clamp01(max(text,detail))",
		"accent.population": "sqrt(clamp01(population/max-representative-population))",
		"accent.backgroundApca": "clamp01(abs(accent-on-background-signed-lc)/20)",
		"accent.surfaceApca": "clamp01(abs(accent-on-surface-signed-lc)/20)",
		"composition.familyCoverage": "clamp01(sum(unique-selected-primary-field-family-native-population))",
		"composition.foregroundFieldSeparation": "clamp01(min(foreground-background-distance,foreground-surface-distance)/0.18)",
		"composition.accentFieldSeparation": "clamp01(min(accent-background-distance,accent-surface-distance)/0.18)",
		"composition.accentForegroundSeparation": "clamp01(accent-foreground-distance/0.18)",
		"composition.sourceChromaCoverage": "clamp01(max-selected-source-role-chroma/max-representative-chroma)",
		"composition.toneSpan": "clamp01((max-selected-oklab-L-min-selected-oklab-L)/0.60)",
		"robustness.backgroundFamily": "familyStability(background-family)",
		"robustness.surfaceFamily": "collapsed?familyStability(background-family):familyStability(surface-family)",
		"robustness.foregroundFamily": "source?familyStability(foreground-family):necessary-fallback?1:0",
		"robustness.accentFamily": "familyStability(accent-family)",
		"robustness.topologyScale": "collapsed?1:1-clamp01(max-profile-score-min-profile-score)",
		"robustness.exactIdentity": "all-source-roles-exact-and-generated-foreground-necessary?1:0",
	},
	marginFormulas: {
		component: "value-threshold;pass-iff-margin>=-1e-12",
		signedApca: "abs(lc);finite-only;polarity=sign(lc)",
	},
	completeTupleMemory: {
		dominanceWitnessHashDomain: "native-complete-palette-dominance-witness-v1",
		dominanceWitnessExampleLimit: 16,
		dominanceWitnessExampleRule: "first-16-in-deterministic-tuple-enumeration-order",
		admittedTupleHashDomain: "native-complete-palette-admitted-tuple-v1",
		canonicalInterpretationHashDomain: "native-complete-palette-canonical-interpretation-v1",
		nondominatingRetention: "stream-count-hash-and-at-most-16-examples",
		admittedRetention: "stream-exact-candidate-pareto-frontiers-only",
		canonicalInterpretationRetention: "stream-equality-compressed-pareto-frontier-only",
	},
	componentOrder: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER,
	thresholds: NATIVE_COMPLETE_PALETTE_THRESHOLDS,
	selectionOrder: [
		"incumbent-componentwise-strict-dominance",
		"fewest-changed-semantic-blocks",
		"candidate-pareto-within-minimum-block-class",
		"fewest-changed-atoms",
		"ascii-semantic-key",
		"ascii-provenance-identity",
	],
	ablationEvaluation: {
		standardStream: "main-plus-seven-canonical-constraint-independent-accumulators",
		separateStream: "without-connected-family-local",
		exactTupleReuse: "evaluate-each-standard-domain-tuple-once-and-route-in-original-order",
		pruningAdded: false,
	},
	ablations: NATIVE_COMPLETE_PALETTE_ABLATIONS,
	generatedForeground: "black-or-white-only-when-no-source-foreground-is-structurally-eligible-for-that-treatment",
	generatedAccent: "forbidden",
	introducedForegroundAccentCollapse: "forbidden",
	fieldPruning: "hard-illegal-or-fixed-field-component-nonacceptability-only-no-top-k",
} as const)

export const NATIVE_COMPLETE_PALETTE_POLICY_SHA256 = sha256(stableJson(NATIVE_COMPLETE_PALETTE_POLICY))
export const NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256 = sha256(stableJson(NATIVE_FIELD_FAMILY_QUERY_POLICY))

export const NATIVE_COMPLETE_PALETTE_IDENTITY = deepFreeze({
	candidate: NATIVE_COMPLETE_PALETTE_VERSION,
	protocolVersion: NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION,
	policyVersion: NATIVE_COMPLETE_PALETTE_POLICY_VERSION,
	policySha256: NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
	canonicalVersion: NATIVE_COMPLETE_PALETTE_CANONICAL_VERSION,
	canonicalComparatorSha256: NATIVE_COMPLETE_PALETTE_COMPARATOR_SHA256,
	executionPlan: {
		path: "research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md",
		sha256: NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN_SHA256,
	},
	sourceRoster: NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER,
	nativeGraph: {
		version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policyVersion: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	},
	nativeFamilyQuery: {
		...NATIVE_FIELD_FAMILY_QUERY_POLICY,
		policySha256: NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256,
	},
	exactPairScorer: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
	exactPairTransfer: {
		developmentSha256: "cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30",
		scientificIdentitySha256: "8bb9a1597397ee1d63fc89e04bfa7ba45c23aaeb4ce4c30f6d96390e28524de9",
	},
} as const)

export type NativeCompletePaletteProtocolArtifact = {
	schemaVersion: 1
	candidate: typeof NATIVE_COMPLETE_PALETTE_VERSION
	protocolVersion: typeof NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION
	policyVersion: typeof NATIVE_COMPLETE_PALETTE_POLICY_VERSION
	policySha256: string
	status: "phase-5-matrix-authorized"
	authorization: Record<string, boolean>
	sources: {
		allowedRoots: string[]
		forbiddenRoots: string[]
		maximumChangedExactSourceGroups: number
		roster: Record<string, unknown>
		rosterStatus: string
		[key: string]: unknown
	}
	numeric: Record<string, number | string>
	componentOrder: string[]
	thresholds: Record<string, number>
	ablations: string[]
	[key: string]: unknown
}

export function parseNativeCompletePaletteProtocol(text: string): Readonly<NativeCompletePaletteProtocolArtifact> {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new Error("Native complete-palette protocol is not valid JSON")
	}
	const artifact = record(parsed, "Native complete-palette protocol") as NativeCompletePaletteProtocolArtifact
	if (artifact.schemaVersion !== 1 || artifact.candidate !== NATIVE_COMPLETE_PALETTE_VERSION ||
		artifact.protocolVersion !== NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION ||
		artifact.policyVersion !== NATIVE_COMPLETE_PALETTE_POLICY_VERSION ||
		artifact.policySha256 !== NATIVE_COMPLETE_PALETTE_POLICY_SHA256 ||
		artifact.status !== "phase-5-matrix-authorized") {
		throw new Error("Native complete-palette protocol identity is invalid")
	}
	if (!Array.isArray(artifact.componentOrder) ||
		stableJson(artifact.componentOrder) !== stableJson(NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER) ||
		stableJson(artifact.thresholds) !== stableJson(NATIVE_COMPLETE_PALETTE_THRESHOLDS) ||
		stableJson(artifact.ablations) !== stableJson(NATIVE_COMPLETE_PALETTE_ABLATIONS) ||
		stableJson(artifact.ablationEvaluation) !== stableJson(NATIVE_COMPLETE_PALETTE_POLICY.ablationEvaluation)) {
		throw new Error("Native complete-palette protocol policy mathematics drifted")
	}
	if (stableJson(artifact.sources?.allowedRoots) !== stableJson(NATIVE_COMPLETE_PALETTE_POLICY.allowedSourceRoots) ||
		stableJson(artifact.sources?.forbiddenRoots) !== stableJson(NATIVE_COMPLETE_PALETTE_POLICY.forbiddenSourceRoots) ||
		artifact.sources?.maximumChangedExactSourceGroups !== NATIVE_COMPLETE_PALETTE_POLICY.maximumChangedExactSourceGroups) {
		throw new Error("Native complete-palette protocol source custody drifted")
	}
	const roster = record(artifact.sources.roster, "Native complete-palette protocol source roster")
	if (roster.path !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.path ||
		roster.artifactSha256 !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.artifactSha256 ||
		roster.asciiSortedSemanticSha256 !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.asciiSortedSemanticSha256 ||
		roster.uniquePaths !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.rows ||
		roster.uniqueEncodedSha256Groups !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.uniqueEncodedSha256Groups ||
		artifact.sources.rosterStatus !== "frozen-existing-source-facts-no-candidate-output") {
		throw new Error("Native complete-palette protocol source roster drifted")
	}
	const canonical = record(artifact.canonical, "Native complete-palette protocol canonical")
	const executionPlan = record(artifact.executionPlan, "Native complete-palette protocol execution plan")
	const nativeGraph = record(artifact.nativeGraph, "Native complete-palette protocol native graph")
	const exactPair = record(artifact.exactPairScorer, "Native complete-palette protocol exact-pair scorer")
	const resources = record(artifact.resources, "Native complete-palette protocol resources")
	if (canonical.version !== NATIVE_COMPLETE_PALETTE_CANONICAL_VERSION ||
		canonical.comparatorSha256 !== NATIVE_COMPLETE_PALETTE_COMPARATOR_SHA256 ||
		executionPlan.path !== "research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md" ||
		executionPlan.sha256 !== NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN_SHA256 ||
		nativeGraph.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
		nativeGraph.policyVersion !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION ||
		nativeGraph.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256 ||
		nativeGraph.queryPolicyVersion !== NATIVE_FIELD_FAMILY_QUERY_POLICY.version ||
		exactPair.modelVersion !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.modelVersion ||
		exactPair.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion ||
		exactPair.parameterSha256 !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 ||
		exactPair.threshold !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold ||
		resources.perSourceWallMilliseconds !== NATIVE_COMPLETE_PALETTE_POLICY.perSourceWallMilliseconds ||
		resources.perSourceChildRssBytes !== NATIVE_COMPLETE_PALETTE_POLICY.perSourceChildRssBytes ||
		resources.concurrency !== NATIVE_COMPLETE_PALETTE_POLICY.concurrency ||
		resources.aggregateDeclaredChildCeilingBytes !== NATIVE_COMPLETE_PALETTE_POLICY.aggregateDeclaredChildCeilingBytes ||
		resources.liveRssPollIntervalMilliseconds !== 100 || resources.nodeVersion !== "v25.8.1" ||
		resources.platform !== "darwin" || resources.arch !== "arm64" || resources.sharpVersion !== "0.33.5" ||
		resources.vipsVersion !== "8.15.3") {
		throw new Error("Native complete-palette protocol bound identity drifted")
	}
	const numeric = record(artifact.numeric, "Native complete-palette protocol numeric policy")
	const expectedNumeric = {
		epsilon: NATIVE_COMPLETE_PALETTE_POLICY.comparisonEpsilon,
		ordering: NATIVE_COMPLETE_PALETTE_POLICY.ordering,
		maximumDistinctColors: NATIVE_COMPLETE_PALETTE_POLICY.maximumDistinctColors,
		distinctFieldMinimumOklabDistance: NATIVE_COMPLETE_PALETTE_POLICY.distinctFieldMinimumDistance,
		accentSeparationMinimumOklabDistance: NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance,
		foregroundPositiveMinimumLc: NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
		foregroundNegativeMinimumMagnitudeLc: NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc,
		accentPositiveMinimumLc: NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
		accentNegativeMinimumMagnitudeLc: NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc,
	}
	if (stableJson(numeric) !== stableJson(expectedNumeric)) {
		throw new Error("Native complete-palette protocol numeric policy drifted")
	}
	const authorization = record(artifact.authorization, "Native complete-palette protocol authorization")
	if (authorization.implementation !== true || authorization.syntheticTests !== true ||
		authorization.developmentMatrix !== true || authorization.realSourceOutputInspection !== true ||
		["reviewManifest", "server", "reserveAccess", "promotion"].some((key) => authorization[key] !== false)) {
		throw new Error("Native complete-palette protocol grants unauthorized execution")
	}
	const phase5 = record(artifact.phase5AuthorizationAmendment,
		"Native complete-palette protocol Phase 5 authorization amendment")
	if (phase5.predeclared !== true || stableJson(phase5.requiredEvaluatorFiles) !== stableJson([
		"research/evaluate-native-complete-palette.ts",
		"research/native-complete-palette-child.ts",
	]) || stableJson(phase5.allowedArtifactChanges) !== stableJson([
		"status:frozen-before-development-matrix->phase-5-matrix-authorized",
		"authorization.developmentMatrix:false->true",
		"authorization.realSourceOutputInspection:false->true-for-mechanical-analysis-after-complete-sealed-run",
		"implementationClosure:add-evaluator-child-tests-and-execution-only-dependencies",
	]) || phase5.scientificPolicyMustRemainByteSemanticEqual !== true ||
		phase5.policySha256MustRemain !== NATIVE_COMPLETE_PALETTE_POLICY_SHA256 ||
		phase5.mustFreezeBeforeFirstCandidateOutput !== true || phase5.reviewManifestAuthorizationRemains !== false ||
		phase5.reserveAccessAuthorizationRemains !== false || phase5.finalized !== true ||
		phase5.finalizedStatus !== "phase-5-matrix-authorized-not-executed") {
		throw new Error("Native complete-palette Phase 5 authorization amendment drifted")
	}
	const execution = record(artifact.phase5Execution, "Native complete-palette Phase 5 execution freeze")
	const processPolicy = record(execution.process, "Native complete-palette Phase 5 process policy")
	const schedule = record(execution.schedule, "Native complete-palette Phase 5 schedule")
	const transport = record(execution.transport, "Native complete-palette Phase 5 transport")
	const artifacts = record(execution.artifacts, "Native complete-palette Phase 5 artifact paths")
	const diagnostics = record(execution.diagnostics, "Native complete-palette Phase 5 diagnostics")
	if (execution.version !== "native-complete-palette-phase-5-execution-v2.5" || execution.matrixExecuted !== false ||
		processPolicy.concurrency !== NATIVE_COMPLETE_PALETTE_POLICY.concurrency ||
		processPolicy.aggregateDeclaredChildCeilingBytes !== NATIVE_COMPLETE_PALETTE_POLICY.aggregateDeclaredChildCeilingBytes ||
		processPolicy.perSourceTimeoutMilliseconds !== 600_000 || processPolicy.perSourceLiveAndReportedRssBytes !== 1_342_177_280 ||
		processPolicy.stdinBytes !== 2 * 1024 * 1024 || processPolicy.stdoutBytes !== 12 * 1024 * 1024 ||
		processPolicy.stderrBytes !== 256 * 1024 || processPolicy.silentTruncation !== false ||
		schedule.order !== "encoded-sha256-then-relative-path-ascii" || schedule.rosterPaths !== 392 ||
		schedule.exactSourceGroups !== 391 || schedule.exactAliasesAreIndependentRuns !== false ||
		schedule.successfulExtractionRuns !== 2 || schedule.separateChildren !== true ||
		transport.format !== "stable-json+gzip-base64-child-then-stable-json-gzip-shard" ||
		transport.gzipLevel !== 9 || transport.certificateJsonBytes !== 32 * 1024 * 1024 ||
		transport.certificateGzipBytes !== 8 * 1024 * 1024 || stableJson(transport.artifactFileBytes) !== stableJson({
			"results.json": 64 * 1024 * 1024,
			"analysis.json": 8 * 1024 * 1024,
			"certificate-index.json": 8 * 1024 * 1024,
			"manifest.json": 1024 * 1024,
			"failure.json": 4 * 1024 * 1024,
		}) || transport.silentTruncation !== false ||
		artifacts.staging !== "research/data/experiments/native-complete-palette-0.2.5-development/.phase-5.staging" ||
		artifacts.final !== "research/data/experiments/native-complete-palette-0.2.5-development/phase-5" ||
		artifacts.failure !== "research/data/experiments/native-complete-palette-0.2.5-development/phase-5-failed" ||
		diagnostics.sampleSize !== 16 || diagnostics.transforms !== 4 || diagnostics.gateUse !==
		"reporting-only-except-structural-nondeterminism-resource-or-invalid-output") {
		throw new Error("Native complete-palette Phase 5 execution freeze drifted")
	}
	const phase5Closure = record(artifact.phase5Closure, "Native complete-palette Phase 5 closure")
	if (phase5Closure.status !== "execution-frozen-matrix-not-run" || phase5Closure.matrixExecuted !== false ||
		phase5Closure.candidateOutputProduced !== false || phase5Closure.reviewManifestGenerated !== false ||
		phase5Closure.serverStarted !== false || phase5Closure.reserveAccessed !== false ||
		phase5Closure.nextBoundary !== "human-pause-1-only-after-gate-a-pass-otherwise-terminal-rejection") {
		throw new Error("Native complete-palette Phase 5 closure is invalid")
	}
	const memory = record(artifact.completeTupleMemory, "Native complete-palette protocol memory policy")
	if (memory.dominanceWitnessHashDomain !==
		NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessHashDomain ||
		memory.dominanceWitnessExampleLimit !==
		NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessExampleLimit ||
		memory.dominanceWitnessExampleRule !==
		NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessExampleRule ||
		memory.admittedTupleHashDomain !== NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.admittedTupleHashDomain ||
		memory.canonicalInterpretationHashDomain !==
		NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.canonicalInterpretationHashDomain ||
		memory.nondominatingRetention !== NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.nondominatingRetention ||
		memory.admittedRetention !== NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.admittedRetention ||
		memory.canonicalInterpretationRetention !==
		NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.canonicalInterpretationRetention ||
		memory.completeRejectedTupleSerialization !== false) {
		throw new Error("Native complete-palette complete-tuple memory policy drifted")
	}
	const closure = record(artifact.implementationClosure, "Native complete-palette protocol implementation closure")
	if (closure.status !== "phase-5-execution-frozen" || !Array.isArray(closure.files) ||
		closure.files.length === 0 || closure.matrixExecuted !== false) {
		throw new Error("Native complete-palette implementation closure is not frozen")
	}
	const closurePaths = new Set<string>()
	for (const entry of closure.files) {
		const file = record(entry, "Native complete-palette implementation closure file")
		if (typeof file.path !== "string" || !/^[0-9a-f]{64}$/.test(String(file.sha256)) ||
			closurePaths.has(file.path)) throw new Error("Native complete-palette implementation closure file is invalid")
		closurePaths.add(file.path)
	}
	return deepFreeze(artifact)
}

export type NativeCompletePaletteRoleDomain = "primary" | "typography" | "connected-overlay"

export type NativeCompletePaletteRepresentativeEvidence = {
	stableKey: string
	familyStableKey: string
	familyKind: "primary-field" | "connected-overlay"
	roleDomain: NativeCompletePaletteRoleDomain
	rgb: RGB
	lab: OKLab
	representativePixelIndex: number
	construction: NativeFieldRepresentative["construction"]
	selectedBy: readonly string[]
	population: number
	saliency: number
	text: number
	chroma: number
	detail: number
	familyPopulation: number
	familySupport: number
	familyStability: number
}

export type NativeCompletePaletteFamilyEvidence = {
	stableKey: string
	kind: "primary-field" | "connected-overlay"
	population: number
	support: number
	stability: number
	oneFieldFitMinimum: number
	oneFieldFitRange: number
	representatives: readonly NativeCompletePaletteRepresentativeEvidence[]
}

export type NativeCompletePaletteRelationEvidence = {
	stableKey: string
	backgroundFamilyStableKey: string
	surfaceFamilyStableKey: string
	twoFieldFitMinimum: number
	stateAgreement: number
	distinctFlatSupportMinimum: number
	distinctFlatSupportRange: number
	gradientSupportMinimum: number
	gradientSupportRange: number
}

export type NativeCompletePalettePreparedEvidence = {
	version: "native-complete-palette-prepared-evidence-v1"
	source: {
		sha256: string
		nativeWidth: number
		nativeHeight: number
		nativeRasterSha256: string
		profiles: readonly { id: string; rasterSha256: string }[]
	}
	graph: {
		version: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION
		policyVersion: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION
		policySha256: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256
		counts: NativeFieldHypothesisGraph["certificate"]["counts"]
	}
	families: readonly NativeCompletePaletteFamilyEvidence[]
	relations: readonly NativeCompletePaletteRelationEvidence[]
}

export type NativeCompletePaletteTopologyResolution = {
	sourceSha256: string
	nativeRasterSha256: string
	queryPolicySha256: string
	queries: readonly NativeFieldTopologyQuery[]
}

export type NativeCompletePaletteTopologyResolver = (
	pairs: readonly NativeFieldTopologyQueryInput[],
) => NativeCompletePaletteTopologyResolution

export type NativeCompletePaletteComponentDecision = {
	name: NativeCompletePaletteComponentName
	value: number
	threshold: number
	margin: number
	passed: boolean
}

export type NativeCompletePaletteBlockDecision = {
	name: NativeCompletePaletteBlockName
	status: "pass" | "fail" | "unavailable"
	components: readonly NativeCompletePaletteComponentDecision[]
}

export type NativeCompletePaletteSignedApcaDecision = {
	lc: number
	positiveMinimumLc: number
	negativeMinimumMagnitudeLc: number
	polarity: "positive" | "negative" | "none"
	margin: number
	passed: boolean
}

type SourceRoleProvenance = {
	status: "exact-source"
	stableKey: string
	familyStableKey: string
	familyKind: NativeCompletePaletteRepresentativeEvidence["familyKind"]
	roleDomain: NativeCompletePaletteRoleDomain
	rgb: RGB
	representativePixelIndex: number
	construction: NativeCompletePaletteRepresentativeEvidence["construction"]
	selectedBy: readonly string[]
}

type GeneratedForegroundProvenance = {
	status: "generated-fallback"
	stableKey: "generated-black" | "generated-white"
	rgb: RGB
	necessity: {
		sourceForegroundsEvaluated: number
		sourceForegroundsPassing: 0
		perTreatmentAuthorized: true
	}
}

type CanonicalRoleProvenance = {
	status: "canonical-normalized" | "canonical-generated"
	rgb: RGB
	generated: boolean
	nativeLinkage: NativeFieldFamilyQuery | null
	evidenceAlias: SourceRoleProvenance | GeneratedForegroundProvenance | null
}

type SelectedRoleProvenance = SourceRoleProvenance | GeneratedForegroundProvenance | CanonicalRoleProvenance

export type NativeCompletePalettePruningWitness = {
	stage: "hard-field" | "field-nonacceptability" | "topology-nonacceptability"
	treatment: string
	provenance: string
	component: NativeCompletePaletteComponentName | "field.positiveDistance" | "field.minimumDistance" | "field.topologyStatus"
	value: number | string
	required: number | string
	margin: number | null
	proof: string
}

export type NativeCompletePaletteDominanceWitness = {
	tuple: string
	provenanceIdentity: string
	reason: "incumbent-unavailable" | "weaker-component" | "no-strict-component" | "unchanged-semantics"
	component: NativeCompletePaletteComponentName | null
	challengerValue: number | null
	incumbentValue: number | null
	margin: number | null
}

export type NativeCompletePaletteDominanceWitnessSummary = {
	total: number
	byReason: Readonly<Record<NativeCompletePaletteDominanceWitness["reason"], number>>
	byComponent: Readonly<Partial<Record<NativeCompletePaletteComponentName, number>>>
	streamingSha256: string
	hashDomain: "native-complete-palette-dominance-witness-v1"
	exampleLimit: 16
	exampleRule: "first-16-in-deterministic-tuple-enumeration-order"
	examples: readonly NativeCompletePaletteDominanceWitness[]
	reconciliation: {
		totalMatchesNondominatingCount: true
		byReasonSumsToTotal: true
		byComponentSumsToWeakerReason: true
	}
}

export type NativeCompletePaletteAdmittedDomain = {
	exactCount: number
	streamingSha256: string
	hashDomain: "native-complete-palette-admitted-tuple-v1"
	retainedCompleteParetoTuples: number
	retainedMinimumBlockParetoTuples: number
	retentionRule: "stream-exact-candidate-pareto-frontiers-only"
}

export type NativeCompletePaletteRunCounts = {
	foregroundSourceEvaluated: number
	foregroundSourceApcaRejected: number
	foregroundSourceRetained: number
	foregroundFallbackTreatments: number
	foregroundFallbackEvaluated: number
	foregroundFallbackRetained: number
	attemptedCompleteTuples: number
	hardRejectedCompleteTuples: number
	hardRejections: Readonly<Record<string, number>>
	hardFeasibleCompleteTuples: number
	blockRejectedCompleteTuples: number
	blockRejections: Readonly<Record<NativeCompletePaletteBlockName, number>>
	blockPassingCompleteTuples: number
	incumbentNondominatingCompleteTuples: number
	incumbentDominatingCompleteTuples: number
	completeParetoFrontier: number
	minimumBlockClass: number
	withinClassParetoFrontier: number
	selectedChallengers: 0 | 1
}

export type NativeCompletePaletteSelectionSummary = {
	independentAccumulator: true
	route: "challenger-selected" | "preserve-canonical"
	semanticKey: string
	provenanceIdentity: string
	changedSemanticBlocks: number
	changedAtoms: number
	flattenedVector: readonly number[] | null
	counts: NativeCompletePaletteRunCounts
	admittedDomain: NativeCompletePaletteAdmittedDomain
	dominanceWitnessSummary: NativeCompletePaletteDominanceWitnessSummary
	domainSha256: string
}

export type NativeCompletePaletteCertificate = {
	schemaVersion: 1
	identity: typeof NATIVE_COMPLETE_PALETTE_IDENTITY
	policy: typeof NATIVE_COMPLETE_PALETTE_POLICY
	source: NativeCompletePalettePreparedEvidence["source"] & {
		graphSourceMatchesSuppliedSource: true
		nativeRasterMatchesGraph: true
		topologyBoundToSameSourceAndRaster: true
	}
	graph: NativeCompletePalettePreparedEvidence["graph"]
	canonical: {
		version: typeof NATIVE_COMPLETE_PALETTE_CANONICAL_VERSION
		comparatorSha256: typeof NATIVE_COMPLETE_PALETTE_COMPARATOR_SHA256
		semanticSha256: string
		fieldState: NativeCompletePaletteFieldState
		roles: Record<RoleName, CanonicalRoleProvenance>
		evidenceComplete: boolean
		unavailableReasons: readonly string[]
		materiallyAmbiguous: boolean
		blocks: readonly NativeCompletePaletteBlockDecision[]
		flattenedVector: readonly number[] | null
		interpretations: {
			exactCount: number
			streamingSha256: string
			hashDomain: "native-complete-palette-canonical-interpretation-v1"
			retainedParetoTuples: number
			retentionRule: "stream-equality-compressed-pareto-frontier-only"
		}
	}
	stagedDomain: {
		counts: {
			rawFieldProvenanceTreatments: number
			hardFieldRejectedProvenanceTreatments: number
			hardFieldEligibleProvenanceTreatments: number
			semanticFieldTreatments: number
			semanticAliasDuplicates: number
			nonTopologyRejectedAliases: number
			topologyRejectedAliases: number
			retainedFieldAliases: number
			topologySemanticPairsRequested: number
		}
		hardFieldRejections: Readonly<Record<string, number>>
		witnesses: readonly NativeCompletePalettePruningWitness[]
		retainedFieldTreatments: readonly {
			semanticKey: string
			state: NativeCompletePaletteFieldState
			backgroundRgb: RGB
			surfaceRgb: RGB
			aliases: readonly {
				provenanceIdentity: string
				background: SourceRoleProvenance
				surface: SourceRoleProvenance
				fieldComponents: Readonly<Partial<Record<NativeCompletePaletteComponentName, number>>>
			}[]
		}[]
		topologyQueries: readonly NativeFieldTopologyQuery[]
		reconciliation: {
			raw: true
			hardEligible: true
			stagedAliases: true
		}
	}
	selection: {
		route:
			| "challenger-selected"
			| "preserve-canonical-incomplete-evidence"
			| "preserve-canonical-incomparable-or-weak"
			| "preserve-canonical-no-admissible-challenger"
		semanticKey: string
		provenanceIdentity: string
		changedSemanticBlocks: number
		changedAtoms: number
		roles: Record<RoleName, SelectedRoleProvenance>
		apca: {
			foregroundOnBackground: NativeCompletePaletteSignedApcaDecision
			foregroundOnSurface: NativeCompletePaletteSignedApcaDecision
			accentOnBackground: NativeCompletePaletteSignedApcaDecision
			accentOnSurface: NativeCompletePaletteSignedApcaDecision
		}
		blocks: readonly NativeCompletePaletteBlockDecision[]
		flattenedVector: readonly number[] | null
		topology: NativeFieldTopologyQuery | { status: "collapsed"; score: 1; stability: 1 } | null
	}
	counts: NativeCompletePaletteRunCounts & {
		reconciliation: {
			attempted: true
			hardFeasible: true
			blockPassing: true
			selectedWithinPareto: true
		}
	}
	dominanceWitnessSummary: NativeCompletePaletteDominanceWitnessSummary
	admittedDomain: NativeCompletePaletteAdmittedDomain
	frontiers: {
		completePareto: readonly NativeCompletePaletteFrontierEntry[]
		minimumBlockPareto: readonly NativeCompletePaletteFrontierEntry[]
	}
	hashes: {
		fieldDomainSha256: string
		feasibleDomainSha256: string
		selectedPaletteSha256: string
		selectedTupleSha256: string
	}
	ablations: Record<NativeCompletePaletteAblationName, NativeCompletePaletteSelectionSummary>
	unchangedCanonicalAssertion: {
		unchanged: boolean
		exactObjectReferencePreserved: boolean
		semanticHashBefore: string
		semanticHashAfter: string
		canonicalNotMutated: true
	}
	invariants: {
		canonicalExtractorInvokedInternally: false
		primaryFieldsOnly: true
		connectedFamiliesOverlayOnly: true
		exactSourceChallengerRoles: true
		signedApcaPolarity: true
		generatedForegroundPerTreatmentOnly: true
		generatedAccentAbsent: true
		challengerOverlayCollapseAbsent: true
		maximumFourColors: true
		componentwiseIncumbentDominance: true
		noncompensatoryBlocks: true
		noHeuristicTopK: true
		exactConstrainedAblationAccumulators: true
		nondominatingCompleteTuplesStreamed: true
		admittedCompleteTuplesParetoStreamed: true
		completeRejectedTupleDomainsSerialized: false
		noPostselectionMutation: true
		deeplyImmutableCertificate: true
	}
}

export type NativeCompletePaletteFrontierEntry = {
	semanticKey: string
	provenanceIdentity: string
	changedSemanticBlocks: number
	changedAtoms: number
	flattenedVector: readonly number[]
}

export type NativeCompletePaletteComparable = {
	semanticKey: string
	provenanceIdentity: string
	changedSemanticBlocks: number
	changedAtoms: number
	vector: readonly number[]
}

export type NativeCompletePaletteParetoSelection<T extends NativeCompletePaletteComparable> = {
	admittedCount: number
	completePareto: T[]
	minimumBlockClassCount: number
	withinClassPareto: T[]
	selected: T | null
}

export type NativeCompletePaletteResult = {
	palette: Palette
	certificate: NativeCompletePaletteCertificate
}

type FieldAlias = {
	semanticKey: string
	provenanceIdentity: string
	state: NativeCompletePaletteFieldState
	background: NativeCompletePaletteRepresentativeEvidence
	surface: NativeCompletePaletteRepresentativeEvidence
	values: Partial<Record<NativeCompletePaletteComponentName, number>>
	topology: NativeFieldTopologyQuery | { status: "collapsed"; score: 1; stability: 1 } | null
}

type SemanticFieldTreatment = {
	semanticKey: string
	backgroundRgb: RGB
	surfaceRgb: RGB
	state: NativeCompletePaletteFieldState
	aliases: FieldAlias[]
}

type SourceChoice = { kind: "source"; representative: NativeCompletePaletteRepresentativeEvidence }
type GeneratedChoice = {
	kind: "generated"
	stableKey: "generated-black" | "generated-white"
	rgb: RGB
	lab: OKLab
	necessity: GeneratedForegroundProvenance["necessity"]
}
type ForegroundChoice = SourceChoice | GeneratedChoice

type TupleEvidence = {
	field: FieldAlias
	foreground: ForegroundChoice
	accent: SourceChoice
	semanticKey: string
	provenanceIdentity: string
	changedSemanticBlocks: number
	changedAtoms: number
	blocks: NativeCompletePaletteBlockDecision[]
	vector: number[]
	apca: NativeCompletePaletteCertificate["selection"]["apca"]
}

type CanonicalEvidence = {
	complete: boolean
	reasons: string[]
	materiallyAmbiguous: boolean
	selection: TupleEvidence | null
	interpretationCount: number
	interpretationSha256: string
	retainedParetoTuples: number
}

type FieldStage = {
	retained: FieldAlias[]
	topologyByPair: Map<string, NativeFieldTopologyQuery>
	counts: NativeCompletePaletteCertificate["stagedDomain"]["counts"]
	hardRejections: Record<string, number>
	witnesses: NativeCompletePalettePruningWitness[]
}

type Constraints = {
	canonicalBackground?: true
	canonicalSurface?: true
	canonicalFieldState?: true
	canonicalFieldBlock?: true
	canonicalForeground?: true
	canonicalAccent?: true
	canonicalOverlayBlock?: true
	withoutConnectedFamilyLocal?: true
}

type SelectionRun = {
	selection: TupleEvidence | null
	completePareto: TupleEvidence[]
	minimumBlockPareto: TupleEvidence[]
	counts: NativeCompletePaletteRunCounts
	feasibleDomainSha256: string
	dominanceWitnessSummary: NativeCompletePaletteDominanceWitnessSummary
	admittedDomain: NativeCompletePaletteAdmittedDomain
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
	return value as Record<string, unknown>
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	const entries = Object.entries(value as Record<string, unknown>).sort(([first], [second]) => compareAscii(first, second))
	return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function rasterSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) throw new Error("Native complete-palette evidence is not finite")
	return Math.max(0, Math.min(1, value))
}

function rgbKey(rgb: RGB): string {
	return rgbToHex(rgb).toLowerCase()
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function fieldState(palette: Palette): NativeCompletePaletteFieldState {
	if (sameRgb(palette.background.rgb, palette.surface.rgb)) return "collapsed"
	return palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function pairKey(background: RGB, surface: RGB): string {
	return `${rgbKey(background)}>${rgbKey(surface)}`
}

function fieldSemanticKey(background: RGB, surface: RGB, state: NativeCompletePaletteFieldState): string {
	return `${pairKey(background, surface)}:${state}`
}

function tupleSemanticKey(background: RGB, surface: RGB, state: NativeCompletePaletteFieldState,
	foreground: RGB, accent: RGB): string {
	return `${fieldSemanticKey(background, surface, state)}|fg:${rgbKey(foreground)}|ac:${rgbKey(accent)}`
}

function finiteByteRgb(rgb: RGB): boolean {
	return rgb.length === 3 && rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function assertPalette(palette: Palette): void {
	for (const role of roleNames) {
		if (!finiteByteRgb(palette[role].rgb) || typeof palette[role].generated !== "boolean" ||
			!Number.isFinite(palette[role].sourceDistance)) throw new Error(`Canonical ${role} is invalid`)
	}
	const numeric = [palette.score, ...Object.values(palette.metrics), ...Object.values(palette.gradient)]
	if (numeric.some((value) => typeof value !== "number" && typeof value !== "boolean" ||
		typeof value === "number" && !Number.isFinite(value))) throw new Error("Canonical palette evidence is not finite")
}

function familyStability(population: number, movements: readonly number[]): number {
	return 1 - clamp01(Math.max(0, ...movements.map(Math.abs)) / Math.max(population, epsilon))
}

export function prepareNativeCompletePaletteEvidence(
	graph: NativeFieldHypothesisGraph,
): NativeCompletePalettePreparedEvidence {
	if (graph.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
		graph.policy.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION ||
		graph.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256) {
		throw new Error("Native complete-palette graph identity is invalid")
	}
	const families = graph.families.map((family): NativeCompletePaletteFamilyEvidence => {
		const support = Math.min(family.native.fieldEligibility.support,
			...family.profiles.map((profile) => profile.evidence.fieldEligibility.support))
		const stability = familyStability(family.population,
			family.profiles.map((profile) => profile.evidence.nativePopulationMovement))
		const collapsed = graph.hypotheses.find((hypothesis) =>
			hypothesis.state === "collapsed" && hypothesis.backgroundFamilyStableKey === family.stableKey)
		if (family.kind === "primary-field" && !collapsed) {
			throw new Error(`Native primary family ${family.stableKey} has no collapsed hypothesis`)
		}
		const observedOneFieldFit = family.profiles.map((profile) => profile.evidence.oneFieldFit)
		const observedMinimum = Math.min(...observedOneFieldFit)
		const observedRange = Math.max(...observedOneFieldFit) - observedMinimum
		const representatives = family.representatives.map((representative): NativeCompletePaletteRepresentativeEvidence => ({
			stableKey: representative.stableKey,
			familyStableKey: family.stableKey,
			familyKind: family.kind,
			roleDomain: family.kind === "connected-overlay"
				? "connected-overlay"
				: representative.fieldRoleAllowed ? "primary" : "typography",
			rgb: [...representative.rgb],
			lab: [...representative.lab],
			representativePixelIndex: representative.representativePixelIndex,
			construction: representative.construction,
			selectedBy: [...representative.selectedBy],
			population: representative.evidence.population,
			saliency: representative.evidence.saliency,
			text: representative.evidence.text,
			chroma: representative.evidence.chroma,
			detail: Math.max(representative.evidence.detail, family.native.spatial.detail),
			familyPopulation: family.population,
			familySupport: support,
			familyStability: stability,
		}))
		return {
			stableKey: family.stableKey,
			kind: family.kind,
			population: family.population,
			support,
			stability,
			oneFieldFitMinimum: collapsed?.oneFieldFit.minimum ?? observedMinimum,
			oneFieldFitRange: collapsed?.oneFieldFit.range ?? observedRange,
			representatives,
		}
	})
	const relations = graph.relations.map((relation): NativeCompletePaletteRelationEvidence => ({
		stableKey: relation.stableKey,
		backgroundFamilyStableKey: relation.backgroundFamilyStableKey,
		surfaceFamilyStableKey: relation.surfaceFamilyStableKey,
		twoFieldFitMinimum: relation.scale.twoFieldFit.minimum,
		stateAgreement: relation.scale.stateAgreement,
		distinctFlatSupportMinimum: relation.scale.distinctFlatSupport.minimum,
		distinctFlatSupportRange: relation.scale.distinctFlatSupport.range,
		gradientSupportMinimum: relation.scale.gradientSupport.minimum,
		gradientSupportRange: relation.scale.gradientSupport.range,
	}))
	return deepFreeze({
		version: "native-complete-palette-prepared-evidence-v1" as const,
		source: {
			sha256: graph.source.sha256,
			nativeWidth: graph.native.width,
			nativeHeight: graph.native.height,
			nativeRasterSha256: graph.native.rasterSha256,
			profiles: graph.profiles.map((profile) => ({ id: profile.id, rasterSha256: profile.rasterSha256 })),
		},
		graph: {
			version: graph.version,
			policyVersion: graph.policy.version,
			policySha256: graph.policySha256,
			counts: graph.certificate.counts,
		},
		families,
		relations,
	})
}

function allRepresentatives(evidence: NativeCompletePalettePreparedEvidence): NativeCompletePaletteRepresentativeEvidence[] {
	return evidence.families.flatMap((family) => family.representatives)
		.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
}

function fieldRepresentatives(evidence: NativeCompletePalettePreparedEvidence): NativeCompletePaletteRepresentativeEvidence[] {
	return allRepresentatives(evidence).filter((representative) => representative.familyKind === "primary-field" &&
		representative.roleDomain === "primary")
}

function relationMap(evidence: NativeCompletePalettePreparedEvidence): Map<string, NativeCompletePaletteRelationEvidence> {
	return new Map(evidence.relations.map((relation) => [
		`${relation.backgroundFamilyStableKey}>${relation.surfaceFamilyStableKey}`, relation,
	]))
}

function fieldAlias(
	background: NativeCompletePaletteRepresentativeEvidence,
	surface: NativeCompletePaletteRepresentativeEvidence,
	state: NativeCompletePaletteFieldState,
	families: ReadonlyMap<string, NativeCompletePaletteFamilyEvidence>,
	relations: ReadonlyMap<string, NativeCompletePaletteRelationEvidence>,
): FieldAlias {
	const backgroundFamily = families.get(background.familyStableKey)
	const surfaceFamily = families.get(surface.familyStableKey)
	if (!backgroundFamily || !surfaceFamily) throw new Error("Field representative family evidence is unavailable")
	const values: FieldAlias["values"] = {
		"field.backgroundSupport": backgroundFamily.support,
		"field.surfaceSupport": state === "collapsed" ? backgroundFamily.support : surfaceFamily.support,
	}
	if (state === "collapsed") {
		values["field.multiplicityFit"] = backgroundFamily.oneFieldFitMinimum
		values["field.relationStateSupport"] = backgroundFamily.oneFieldFitMinimum
		values["field.scaleAgreement"] = 1 - clamp01(backgroundFamily.oneFieldFitRange)
	} else {
		const relation = relations.get(`${background.familyStableKey}>${surface.familyStableKey}`)
		if (!relation) throw new Error("Distinct field treatment has no complete family relation")
		const minimum = state === "gradient" ? relation.gradientSupportMinimum : relation.distinctFlatSupportMinimum
		const range = state === "gradient" ? relation.gradientSupportRange : relation.distinctFlatSupportRange
		values["field.multiplicityFit"] = relation.twoFieldFitMinimum
		values["field.relationStateSupport"] = minimum
		values["field.scaleAgreement"] = Math.min(relation.stateAgreement, 1 - clamp01(range))
	}
	return {
		semanticKey: fieldSemanticKey(background.rgb, surface.rgb, state),
		provenanceIdentity: `${background.stableKey}>${surface.stableKey}:${state}`,
		state,
		background,
		surface,
		values,
		topology: null,
	}
}

function componentPass(name: NativeCompletePaletteComponentName, value: number): boolean {
	return Number.isFinite(value) && value - NATIVE_COMPLETE_PALETTE_THRESHOLDS[name] >= -epsilon
}

function validateTopology(query: NativeFieldTopologyQuery, requested: NativeFieldTopologyQueryInput): void {
	if (!sameRgb(query.backgroundRgb, requested.backgroundRgb) || !sameRgb(query.surfaceRgb, requested.surfaceRgb)) {
		throw new Error("Exact topology resolver changed a requested endpoint")
	}
	if (query.status !== "mapped") return
	if (query.profiles.length !== 3 || query.profiles.some((profile) => !Number.isFinite(profile.endpointDistance) ||
		!Number.isFinite(profile.score) || profile.score < 0 || profile.score > 1 ||
		!Number.isFinite(profile.margin) || Object.values(profile.features).some((value) => !Number.isFinite(value)) ||
		Math.abs(profile.threshold - GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold) > epsilon ||
		Math.abs(profile.margin - (profile.score - profile.threshold)) > epsilon ||
		profile.eligible !== (profile.score >= profile.threshold))) {
		throw new Error("Exact topology resolver returned invalid scorer evidence")
	}
	const observation = query.profiles.find((profile) => profile.profileId === "max-edge-224-area-srgb")
	if (!observation || Math.abs(observation.score - query.observation224.score) > epsilon ||
		Math.abs(observation.margin - query.observation224.margin) > epsilon) {
		throw new Error("Exact topology resolver returned inconsistent 224 evidence")
	}
}

function stageFieldDomain(
	evidence: NativeCompletePalettePreparedEvidence,
	canonical: Palette,
	resolveTopology: NativeCompletePaletteTopologyResolver,
): FieldStage {
	const fields = fieldRepresentatives(evidence)
	const families = new Map(evidence.families.map((family) => [family.stableKey, family]))
	const relations = relationMap(evidence)
	const semantic = new Map<string, SemanticFieldTreatment>()
	const witnesses: NativeCompletePalettePruningWitness[] = []
	const hardRejections: Record<string, number> = { nonPositiveDistance: 0, minimumDistance: 0 }
	let raw = 0
	let hardRejected = 0
	const add = (alias: FieldAlias) => {
		let treatment = semantic.get(alias.semanticKey)
		if (!treatment) {
			treatment = {
				semanticKey: alias.semanticKey,
				backgroundRgb: alias.background.rgb,
				surfaceRgb: alias.surface.rgb,
				state: alias.state,
				aliases: [],
			}
			semantic.set(alias.semanticKey, treatment)
		}
		treatment.aliases.push(alias)
	}
	for (const background of fields) {
		raw++
		add(fieldAlias(background, background, "collapsed", families, relations))
		for (const surface of fields) {
			if (background.familyStableKey === surface.familyStableKey) continue
			const distance = okDistance(background.lab, surface.lab)
			for (const state of ["distinct-flat", "gradient"] as const) {
				raw++
				const provenance = `${background.stableKey}>${surface.stableKey}:${state}`
				const treatment = fieldSemanticKey(background.rgb, surface.rgb, state)
				if (!(distance > epsilon)) {
					hardRejected++
					hardRejections.nonPositiveDistance++
					witnesses.push({
						stage: "hard-field", treatment, provenance, component: "field.positiveDistance",
						value: distance, required: `>${epsilon}`, margin: distance - epsilon,
						proof: "A later component cannot turn an equal representative pair into distinct fields.",
					})
					continue
				}
				if (distance + epsilon < NATIVE_COMPLETE_PALETTE_POLICY.distinctFieldMinimumDistance) {
					hardRejected++
					hardRejections.minimumDistance++
					witnesses.push({
						stage: "hard-field", treatment, provenance, component: "field.minimumDistance",
						value: distance, required: NATIVE_COMPLETE_PALETTE_POLICY.distinctFieldMinimumDistance,
						margin: distance - NATIVE_COMPLETE_PALETTE_POLICY.distinctFieldMinimumDistance,
						proof: "Topology and overlays cannot increase fixed endpoint distance.",
					})
					continue
				}
				add(fieldAlias(background, surface, state, families, relations))
			}
		}
	}
	for (const treatment of semantic.values()) treatment.aliases.sort((first, second) =>
		compareAscii(first.provenanceIdentity, second.provenanceIdentity))
	const hardEligible = raw - hardRejected
	let nonTopologyRejectedAliases = 0
	const nonTopologyRetained = new Map<string, FieldAlias[]>()
	for (const treatment of [...semantic.values()].sort((first, second) => compareAscii(first.semanticKey, second.semanticKey))) {
		for (const alias of treatment.aliases) {
			const failure = NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(0, 5).find((name) =>
				!componentPass(name, alias.values[name]!))
			if (failure) {
				nonTopologyRejectedAliases++
				const value = alias.values[failure]!
				witnesses.push({
					stage: "field-nonacceptability", treatment: alias.semanticKey,
					provenance: alias.provenanceIdentity, component: failure, value,
					required: NATIVE_COMPLETE_PALETTE_THRESHOLDS[failure],
					margin: value - NATIVE_COMPLETE_PALETTE_THRESHOLDS[failure],
					proof: "The failed Field component is fixed for this provenance alias; topology and overlays cannot repair it.",
				})
				continue
			}
			const aliases = nonTopologyRetained.get(treatment.semanticKey) ?? []
			aliases.push(alias)
			nonTopologyRetained.set(treatment.semanticKey, aliases)
		}
	}
	const requestMap = new Map<string, NativeFieldTopologyQueryInput>()
	for (const aliases of nonTopologyRetained.values()) {
		const alias = aliases[0]
		if (alias.state === "collapsed") continue
		requestMap.set(pairKey(alias.background.rgb, alias.surface.rgb), {
			backgroundRgb: alias.background.rgb, surfaceRgb: alias.surface.rgb,
		})
	}
	const canonicalFields = canonicalFieldAliases(canonical, evidence)
	for (const alias of canonicalFields) if (alias.state !== "collapsed") {
		requestMap.set(pairKey(alias.background.rgb, alias.surface.rgb), {
			backgroundRgb: alias.background.rgb, surfaceRgb: alias.surface.rgb,
		})
	}
	const requests = [...requestMap.entries()].sort(([first], [second]) => compareAscii(first, second)).map(([, value]) => value)
	const resolution = requests.length === 0 ? {
		sourceSha256: evidence.source.sha256,
		nativeRasterSha256: evidence.source.nativeRasterSha256,
		queryPolicySha256: NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256,
		queries: [] as readonly NativeFieldTopologyQuery[],
	} : resolveTopology(requests)
	if (resolution.sourceSha256 !== evidence.source.sha256 ||
		resolution.nativeRasterSha256 !== evidence.source.nativeRasterSha256 ||
		resolution.queryPolicySha256 !== NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256) {
		throw new Error("Exact topology resolver is not bound to the graph source, raster, and query policy")
	}
	const resolved = [...resolution.queries]
	if (resolved.length !== requests.length) throw new Error("Exact topology resolver did not return every requested pair")
	const topologyByPair = new Map<string, NativeFieldTopologyQuery>()
	for (let index = 0; index < requests.length; index++) {
		validateTopology(resolved[index], requests[index])
		const key = pairKey(requests[index].backgroundRgb, requests[index].surfaceRgb)
		if (topologyByPair.has(key)) throw new Error("Exact topology resolver returned a duplicate pair")
		topologyByPair.set(key, resolved[index])
	}
	let topologyRejectedAliases = 0
	const retained: FieldAlias[] = []
	for (const [semanticKey, aliases] of [...nonTopologyRetained.entries()].sort(([first], [second]) =>
		compareAscii(first, second))) {
		for (const alias of aliases) {
			if (alias.state === "collapsed") {
				alias.values["field.exactTopologyState"] = 1
				alias.topology = { status: "collapsed", score: 1, stability: 1 }
				retained.push(alias)
				continue
			}
			const topology = topologyByPair.get(pairKey(alias.background.rgb, alias.surface.rgb))
			if (!topology || topology.status !== "mapped") {
				topologyRejectedAliases++
				witnesses.push({
					stage: "topology-nonacceptability", treatment: semanticKey,
					provenance: alias.provenanceIdentity, component: "field.topologyStatus",
					value: topology?.status ?? "missing", required: "mapped", margin: null,
					proof: "A missing exact-pair topology result cannot be inferred from family-level or overlay evidence.",
				})
				continue
			}
			const value = alias.state === "gradient" ? topology.observation224.score : 1 - topology.observation224.score
			alias.values["field.exactTopologyState"] = value
			alias.topology = topology
			if (!componentPass("field.exactTopologyState", value)) {
				topologyRejectedAliases++
				witnesses.push({
					stage: "topology-nonacceptability", treatment: semanticKey,
					provenance: alias.provenanceIdentity, component: "field.exactTopologyState", value,
					required: NATIVE_COMPLETE_PALETTE_THRESHOLDS["field.exactTopologyState"],
					margin: value - NATIVE_COMPLETE_PALETTE_THRESHOLDS["field.exactTopologyState"],
					proof: "Overlay evidence cannot change exact topology state support for fixed endpoints.",
				})
				continue
			}
			retained.push(alias)
		}
	}
	retained.sort((first, second) => compareAscii(first.semanticKey, second.semanticKey) ||
		compareAscii(first.provenanceIdentity, second.provenanceIdentity))
	const counts = {
		rawFieldProvenanceTreatments: raw,
		hardFieldRejectedProvenanceTreatments: hardRejected,
		hardFieldEligibleProvenanceTreatments: hardEligible,
		semanticFieldTreatments: semantic.size,
		semanticAliasDuplicates: hardEligible - semantic.size,
		nonTopologyRejectedAliases,
		topologyRejectedAliases,
		retainedFieldAliases: retained.length,
		topologySemanticPairsRequested: requests.length,
	}
	if (raw !== hardRejected + hardEligible || hardEligible !== counts.semanticAliasDuplicates + semantic.size ||
		hardEligible !== nonTopologyRejectedAliases + topologyRejectedAliases + retained.length) {
		throw new Error("Native complete-palette staged field counts do not reconcile")
	}
	return { retained, topologyByPair, counts, hardRejections, witnesses }
}

function signedApca(lc: number, positiveMinimumLc: number,
	negativeMinimumMagnitudeLc: number): NativeCompletePaletteSignedApcaDecision {
	if (!Number.isFinite(lc)) throw new Error("Native complete-palette APCA is not finite")
	const positiveMargin = lc - positiveMinimumLc
	const negativeMargin = -lc - negativeMinimumMagnitudeLc
	const margin = Math.max(positiveMargin, negativeMargin)
	return {
		lc,
		positiveMinimumLc,
		negativeMinimumMagnitudeLc,
		polarity: lc > epsilon ? "positive" : lc < -epsilon ? "negative" : "none",
		margin,
		passed: true,
	}
}

function foregroundApca(rgb: RGB, field: FieldAlias): Pick<TupleEvidence["apca"],
	"foregroundOnBackground" | "foregroundOnSurface"> {
	return {
		foregroundOnBackground: signedApca(apcaContrast(rgb, field.background.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc),
		foregroundOnSurface: signedApca(apcaContrast(rgb, field.surface.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc),
	}
}

function accentApca(rgb: RGB, field: FieldAlias): Pick<TupleEvidence["apca"],
	"accentOnBackground" | "accentOnSurface"> {
	return {
		accentOnBackground: signedApca(apcaContrast(rgb, field.background.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc),
		accentOnSurface: signedApca(apcaContrast(rgb, field.surface.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc),
	}
}

function sourceForegroundCanFormCompleteTuple(
	representative: NativeCompletePaletteRepresentativeEvidence,
	field: FieldAlias,
	overlayRepresentatives: readonly NativeCompletePaletteRepresentativeEvidence[],
): boolean {
	const contrast = foregroundApca(representative.rgb, field)
	if (!contrast.foregroundOnBackground.passed || !contrast.foregroundOnSurface.passed ||
		sameRgb(representative.rgb, field.background.rgb) || sameRgb(representative.rgb, field.surface.rgb)) return false
	return overlayRepresentatives.some((accent) => !sameRgb(accent.rgb, representative.rgb) &&
		!sameRgb(accent.rgb, field.background.rgb) && !sameRgb(accent.rgb, field.surface.rgb) &&
		okDistance(accent.lab, representative.lab) + epsilon >= NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance &&
		okDistance(accent.lab, field.background.lab) + epsilon >= NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance &&
		okDistance(accent.lab, field.surface.lab) + epsilon >= NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance)
}

function choiceRgb(choice: ForegroundChoice): RGB {
	return choice.kind === "source" ? choice.representative.rgb : choice.rgb
}

function choiceLab(choice: ForegroundChoice): OKLab {
	return choice.kind === "source" ? choice.representative.lab : choice.lab
}

function componentBlock(name: NativeCompletePaletteBlockName,
	components: readonly NativeCompletePaletteComponentName[],
	values: Readonly<Partial<Record<NativeCompletePaletteComponentName, number>>>): NativeCompletePaletteBlockDecision {
	const decisions = components.map((component): NativeCompletePaletteComponentDecision => {
		const value = values[component]
		if (value === undefined || !Number.isFinite(value)) throw new Error(`Missing finite component ${component}`)
		const threshold = NATIVE_COMPLETE_PALETTE_THRESHOLDS[component]
		const margin = value - threshold
		return { name: component, value, threshold, margin, passed: margin >= -epsilon }
	})
	return { name, status: decisions.every((component) => component.passed) ? "pass" : "fail", components: decisions }
}

const componentsByBlock: Readonly<Record<NativeCompletePaletteBlockName,
	readonly NativeCompletePaletteComponentName[]>> = deepFreeze({
	Field: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(0, 6),
	Foreground: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(6, 10),
	Accent: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(10, 15),
	Composition: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(15, 21),
	Robustness: NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.slice(21, 27),
})

function unavailableBlocks(): NativeCompletePaletteBlockDecision[] {
	return blockNames.map((name) => ({ name, status: "unavailable", components: [] }))
}

export function evaluateNativeCompletePaletteBlocks(
	values: Readonly<Record<NativeCompletePaletteComponentName, number>>,
): readonly NativeCompletePaletteBlockDecision[] {
	return deepFreeze(blockNames.map((name) => componentBlock(name, componentsByBlock[name], values)))
}

function topologyStability(field: FieldAlias): number {
	if (field.state === "collapsed") return 1
	if (!field.topology || field.topology.status !== "mapped") throw new Error("Distinct field lacks mapped topology")
	const scores = field.topology.profiles.map((profile) => profile.score)
	return 1 - clamp01(Math.max(...scores) - Math.min(...scores))
}

function evaluateTuple(
	field: FieldAlias,
	foreground: ForegroundChoice,
	accent: SourceChoice,
	maximumPopulation: number,
	maximumChroma: number,
	canonical: Palette,
): TupleEvidence {
	const foregroundRgb = choiceRgb(foreground)
	const accentRgb = accent.representative.rgb
	const foregroundContrast = foregroundApca(foregroundRgb, field)
	const accentContrast = accentApca(accentRgb, field)
	const values: Partial<Record<NativeCompletePaletteComponentName, number>> = { ...field.values }
	if (foreground.kind === "generated") {
		values["foreground.roleSupportOrNecessity"] = 1
		values["foreground.populationOrNecessity"] = 1
	} else {
		values["foreground.roleSupportOrNecessity"] = clamp01(Math.max(
			foreground.representative.text, foreground.representative.detail))
		values["foreground.populationOrNecessity"] = Math.sqrt(clamp01(
			foreground.representative.population / Math.max(maximumPopulation, epsilon)))
	}
	values["foreground.backgroundApca"] = clamp01(Math.abs(foregroundContrast.foregroundOnBackground.lc) / 120)
	values["foreground.surfaceApca"] = clamp01(Math.abs(foregroundContrast.foregroundOnSurface.lc) / 120)
	values["accent.identitySupport"] = clamp01(Math.max(
		accent.representative.chroma / Math.max(maximumChroma, epsilon), accent.representative.saliency))
	values["accent.localSupport"] = clamp01(Math.max(accent.representative.text, accent.representative.detail))
	values["accent.population"] = Math.sqrt(clamp01(
		accent.representative.population / Math.max(maximumPopulation, epsilon)))
	values["accent.backgroundApca"] = clamp01(Math.abs(accentContrast.accentOnBackground.lc) / 20)
	values["accent.surfaceApca"] = clamp01(Math.abs(accentContrast.accentOnSurface.lc) / 20)
	const sourceRepresentatives = [field.background, field.surface,
		...(foreground.kind === "source" ? [foreground.representative] : []), accent.representative]
	const familyPopulations = new Map<string, number>()
	for (const representative of sourceRepresentatives) {
		if (representative.familyKind !== "primary-field") continue
		familyPopulations.set(representative.familyStableKey, representative.familyPopulation)
	}
	values["composition.familyCoverage"] = clamp01([...familyPopulations.values()].reduce((sum, value) => sum + value, 0))
	values["composition.foregroundFieldSeparation"] = clamp01(Math.min(
		okDistance(choiceLab(foreground), field.background.lab), okDistance(choiceLab(foreground), field.surface.lab)) / 0.18)
	values["composition.accentFieldSeparation"] = clamp01(Math.min(
		okDistance(accent.representative.lab, field.background.lab),
		okDistance(accent.representative.lab, field.surface.lab)) / 0.18)
	values["composition.accentForegroundSeparation"] = clamp01(
		okDistance(accent.representative.lab, choiceLab(foreground)) / 0.18)
	values["composition.sourceChromaCoverage"] = clamp01(
		Math.max(...sourceRepresentatives.map((representative) => representative.chroma)) / Math.max(maximumChroma, epsilon))
	const lightness = [field.background.lab[0], field.surface.lab[0], choiceLab(foreground)[0], accent.representative.lab[0]]
	values["composition.toneSpan"] = clamp01((Math.max(...lightness) - Math.min(...lightness)) / 0.6)
	values["robustness.backgroundFamily"] = field.background.familyStability
	values["robustness.surfaceFamily"] = field.state === "collapsed"
		? field.background.familyStability : field.surface.familyStability
	values["robustness.foregroundFamily"] = foreground.kind === "generated" ? 1 : foreground.representative.familyStability
	values["robustness.accentFamily"] = accent.representative.familyStability
	values["robustness.topologyScale"] = topologyStability(field)
	values["robustness.exactIdentity"] = 1
	const blocks = blockNames.map((name) => componentBlock(name, componentsByBlock[name], values))
	const vector = NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.map((name) => values[name]!)
	const semanticKey = tupleSemanticKey(field.background.rgb, field.surface.rgb, field.state, foregroundRgb, accentRgb)
	const provenanceIdentity = `${field.provenanceIdentity}|fg:${foreground.kind === "source"
		? foreground.representative.stableKey : foreground.stableKey}|ac:${accent.representative.stableKey}`
	const fieldChanged = !sameRgb(field.background.rgb, canonical.background.rgb) ||
		!sameRgb(field.surface.rgb, canonical.surface.rgb) || field.state !== fieldState(canonical)
	const foregroundChanged = !sameRgb(foregroundRgb, canonical.foreground.rgb)
	const accentChanged = !sameRgb(accentRgb, canonical.accent.rgb)
	return deepFreeze({
		field, foreground, accent, semanticKey, provenanceIdentity,
		changedSemanticBlocks: Number(fieldChanged) + Number(foregroundChanged) + Number(accentChanged),
		changedAtoms: Number(!sameRgb(field.background.rgb, canonical.background.rgb)) +
			Number(!sameRgb(field.surface.rgb, canonical.surface.rgb)) + Number(field.state !== fieldState(canonical)) +
			Number(foregroundChanged) + Number(accentChanged),
		blocks,
		vector,
		apca: { ...foregroundContrast, ...accentContrast },
	})
}

export function nativeCompletePaletteStrictlyDominates(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function vectorEqual(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) <= epsilon)
}

function compareComparable(first: NativeCompletePaletteComparable, second: NativeCompletePaletteComparable): number {
	return first.changedSemanticBlocks - second.changedSemanticBlocks || first.changedAtoms - second.changedAtoms ||
		compareAscii(first.semanticKey, second.semanticKey) || compareAscii(first.provenanceIdentity, second.provenanceIdentity)
}

function insertPareto<T extends NativeCompletePaletteComparable>(
	frontier: T[],
	candidate: T,
	compressEqualVectors = false,
): void {
	for (let index = 0; index < frontier.length; index++) {
		const existing = frontier[index]
		if (nativeCompletePaletteStrictlyDominates(existing.vector, candidate.vector)) return
		if (compressEqualVectors && vectorEqual(existing.vector, candidate.vector)) {
			if (compareComparable(candidate, existing) < 0) frontier[index] = candidate
			return
		}
	}
	for (let index = frontier.length - 1; index >= 0; index--) {
		if (nativeCompletePaletteStrictlyDominates(candidate.vector, frontier[index].vector)) frontier.splice(index, 1)
	}
	frontier.push(candidate)
}

function sortedFrontier<T extends NativeCompletePaletteComparable>(frontier: readonly T[]): T[] {
	return [...frontier].sort(compareComparable)
}

export function selectNativeCompletePalettePareto<T extends NativeCompletePaletteComparable>(
	candidates: readonly T[],
	incumbentVector: readonly number[],
): NativeCompletePaletteParetoSelection<T> {
	let admittedCount = 0
	let minimumBlocks = Infinity
	let minimumBlockClassCount = 0
	const completePareto: T[] = []
	const withinClassPareto: T[] = []
	for (const candidate of candidates) {
		if (!nativeCompletePaletteStrictlyDominates(candidate.vector, incumbentVector)) continue
		admittedCount++
		insertPareto(completePareto, candidate)
		if (candidate.changedSemanticBlocks < minimumBlocks) {
			minimumBlocks = candidate.changedSemanticBlocks
			minimumBlockClassCount = 1
			withinClassPareto.length = 0
			insertPareto(withinClassPareto, candidate)
		} else if (candidate.changedSemanticBlocks === minimumBlocks) {
			minimumBlockClassCount++
			insertPareto(withinClassPareto, candidate)
		}
	}
	const complete = sortedFrontier(completePareto)
	const within = sortedFrontier(withinClassPareto)
	return {
		admittedCount,
		completePareto: complete,
		minimumBlockClassCount,
		withinClassPareto: within,
		selected: within[0] ?? null,
	}
}

function tupleComparisonIdentity(tuple: TupleEvidence) {
	return {
		semanticKey: tuple.semanticKey,
		provenanceIdentity: tuple.provenanceIdentity,
		changedSemanticBlocks: tuple.changedSemanticBlocks,
		changedAtoms: tuple.changedAtoms,
		vector: tuple.vector,
	}
}

function canonicalFieldAliases(canonical: Palette, evidence: NativeCompletePalettePreparedEvidence): FieldAlias[] {
	if (canonical.background.generated || canonical.surface.generated) return []
	const representatives = fieldRepresentatives(evidence)
	const backgrounds = representatives.filter((representative) => sameRgb(representative.rgb, canonical.background.rgb))
	const surfaces = representatives.filter((representative) => sameRgb(representative.rgb, canonical.surface.rgb))
	const state = fieldState(canonical)
	const families = new Map(evidence.families.map((family) => [family.stableKey, family]))
	const relations = relationMap(evidence)
	const aliases: FieldAlias[] = []
	if (state === "collapsed") {
		for (const background of backgrounds) aliases.push(fieldAlias(background, background, state, families, relations))
	} else {
		for (const background of backgrounds) for (const surface of surfaces) {
			if (background.familyStableKey === surface.familyStableKey) continue
			aliases.push(fieldAlias(background, surface, state, families, relations))
		}
	}
	return aliases.sort((first, second) => compareAscii(first.provenanceIdentity, second.provenanceIdentity))
}

function canonicalEvidence(
	canonical: Palette,
	evidence: NativeCompletePalettePreparedEvidence,
	topologyByPair: ReadonlyMap<string, NativeFieldTopologyQuery>,
	maximumPopulation: number,
	maximumChroma: number,
): CanonicalEvidence {
	const reasons: string[] = []
	const interpretationHash = createHash("sha256")
		.update(NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.canonicalInterpretationHashDomain, "utf8")
		.update("\0")
	const incomplete = (unavailableReasons: string[]): CanonicalEvidence => ({
		complete: false,
		reasons: unavailableReasons,
		materiallyAmbiguous: false,
		selection: null,
		interpretationCount: 0,
		interpretationSha256: interpretationHash.digest("hex"),
		retainedParetoTuples: 0,
	})
	const fields = canonicalFieldAliases(canonical, evidence)
	if (fields.length === 0) reasons.push("canonical-field-exact-alias-unavailable")
	for (const field of fields) {
		if (field.state === "collapsed") {
			field.values["field.exactTopologyState"] = 1
			field.topology = { status: "collapsed", score: 1, stability: 1 }
		} else {
			const topology = topologyByPair.get(pairKey(field.background.rgb, field.surface.rgb))
			if (topology?.status !== "mapped") continue
			field.topology = topology
			field.values["field.exactTopologyState"] = field.state === "gradient"
				? topology.observation224.score : 1 - topology.observation224.score
		}
	}
	const completeFields = fields.filter((field) => field.topology !== null)
	if (fields.length > 0 && completeFields.length === 0) reasons.push("canonical-exact-topology-unavailable")
	const representatives = allRepresentatives(evidence)
	let foregrounds: ForegroundChoice[] = []
	if (canonical.foreground.generated) {
		if (!sameRgb(canonical.foreground.rgb, [0, 0, 0]) && !sameRgb(canonical.foreground.rgb, [255, 255, 255])) {
			reasons.push("canonical-generated-foreground-is-not-black-or-white")
		} else if (completeFields.length > 0) {
			const noSourcePassesEveryInterpretation = completeFields.every((field) =>
				!representatives.some((representative) =>
					sourceForegroundCanFormCompleteTuple(representative, field, representatives)))
			if (!noSourcePassesEveryInterpretation) reasons.push("canonical-generated-foreground-not-necessary")
			else foregrounds = [{
				kind: "generated",
				stableKey: sameRgb(canonical.foreground.rgb, [0, 0, 0]) ? "generated-black" : "generated-white",
				rgb: [...canonical.foreground.rgb],
				lab: rgbToOKLab(canonical.foreground.rgb),
				necessity: {
					sourceForegroundsEvaluated: representatives.length,
					sourceForegroundsPassing: 0,
					perTreatmentAuthorized: true,
				},
			}]
		}
	} else {
		foregrounds = representatives.filter((representative) => sameRgb(representative.rgb, canonical.foreground.rgb))
			.map((representative) => ({ kind: "source", representative }))
		if (foregrounds.length === 0) reasons.push("canonical-foreground-exact-alias-unavailable")
	}
	let accents: SourceChoice[] = []
	if (canonical.accent.generated) reasons.push("canonical-generated-accent-evidence-unavailable")
	else {
		accents = representatives.filter((representative) => sameRgb(representative.rgb, canonical.accent.rgb))
			.map((representative) => ({ kind: "source", representative }))
		if (accents.length === 0) reasons.push("canonical-accent-exact-alias-unavailable")
	}
	if (reasons.length > 0) return incomplete([...new Set(reasons)].sort(compareAscii))
	let interpretationCount = 0
	const interpretationFrontier: TupleEvidence[] = []
	for (const field of completeFields) for (const foreground of foregrounds) for (const accent of accents) {
		const tuple = evaluateTuple(field, foreground, accent, maximumPopulation, maximumChroma, canonical)
		interpretationCount++
		interpretationHash.update(stableJson(tupleComparisonIdentity(tuple)), "utf8").update("\n")
		insertPareto(interpretationFrontier, tuple, true)
	}
	const retained = sortedFrontier(interpretationFrontier)
	const interpretationSha256 = interpretationHash.digest("hex")
	if (retained.length !== 1) return {
		complete: false,
		reasons: ["canonical-provenance-interpretations-materially-incomparable"],
		materiallyAmbiguous: true,
		selection: null,
		interpretationCount,
		interpretationSha256,
		retainedParetoTuples: retained.length,
	}
	return {
		complete: true,
		reasons: [],
		materiallyAmbiguous: false,
		selection: retained[0],
		interpretationCount,
		interpretationSha256,
		retainedParetoTuples: 1,
	}
}

function constraintsPass(tuple: Pick<TupleEvidence, "field" | "foreground" | "accent">,
	canonical: Palette, constraints: Constraints): boolean {
	const foregroundRgb = choiceRgb(tuple.foreground)
	const accentRgb = tuple.accent.representative.rgb
	if ((constraints.canonicalBackground || constraints.canonicalFieldBlock) &&
		!sameRgb(tuple.field.background.rgb, canonical.background.rgb)) return false
	if ((constraints.canonicalSurface || constraints.canonicalFieldBlock) &&
		!sameRgb(tuple.field.surface.rgb, canonical.surface.rgb)) return false
	if ((constraints.canonicalFieldState || constraints.canonicalFieldBlock) && tuple.field.state !== fieldState(canonical)) return false
	if ((constraints.canonicalForeground || constraints.canonicalOverlayBlock) &&
		!sameRgb(foregroundRgb, canonical.foreground.rgb)) return false
	if ((constraints.canonicalAccent || constraints.canonicalOverlayBlock) && !sameRgb(accentRgb, canonical.accent.rgb)) return false
	if (constraints.withoutConnectedFamilyLocal && (tuple.foreground.kind === "source" &&
		tuple.foreground.representative.roleDomain === "connected-overlay" ||
		tuple.accent.representative.roleDomain === "connected-overlay")) return false
	return true
}

function increment(counts: Record<string, number>, key: string): void {
	counts[key] = (counts[key] ?? 0) + 1
}

function createDominanceWitnessAccumulator() {
	const byReason: Record<NativeCompletePaletteDominanceWitness["reason"], number> = {
		"incumbent-unavailable": 0,
		"weaker-component": 0,
		"no-strict-component": 0,
		"unchanged-semantics": 0,
	}
	const byComponent: Partial<Record<NativeCompletePaletteComponentName, number>> = {}
	const examples: NativeCompletePaletteDominanceWitness[] = []
	const hash = createHash("sha256")
		.update(NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessHashDomain, "utf8")
		.update("\0")
	let total = 0
	return {
		add(witness: NativeCompletePaletteDominanceWitness): void {
			total++
			byReason[witness.reason]++
			if (witness.component) byComponent[witness.component] = (byComponent[witness.component] ?? 0) + 1
			hash.update(stableJson(witness), "utf8").update("\n")
			if (examples.length < NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessExampleLimit) {
				examples.push(witness)
			}
		},
		finish(expectedTotal: number): NativeCompletePaletteDominanceWitnessSummary {
			const reasonTotal = Object.values(byReason).reduce((sum, count) => sum + count, 0)
			const componentTotal = Object.values(byComponent).reduce((sum, count) => sum + count, 0)
			if (total !== expectedTotal || reasonTotal !== total || componentTotal !== byReason["weaker-component"] ||
				examples.length > 16) throw new Error("Native complete-palette dominance witness summary does not reconcile")
			return {
				total,
				byReason,
				byComponent,
				streamingSha256: hash.digest("hex"),
				hashDomain: "native-complete-palette-dominance-witness-v1",
				exampleLimit: 16,
				exampleRule: "first-16-in-deterministic-tuple-enumeration-order",
				examples,
				reconciliation: {
					totalMatchesNondominatingCount: true,
					byReasonSumsToTotal: true,
					byComponentSumsToWeakerReason: true,
				},
			}
		},
	}
}

function emptyRunCounts(): NativeCompletePaletteRunCounts {
	return {
		foregroundSourceEvaluated: 0,
		foregroundSourceApcaRejected: 0,
		foregroundSourceRetained: 0,
		foregroundFallbackTreatments: 0,
		foregroundFallbackEvaluated: 0,
		foregroundFallbackRetained: 0,
		attemptedCompleteTuples: 0,
		hardRejectedCompleteTuples: 0,
		hardRejections: {},
		hardFeasibleCompleteTuples: 0,
		blockRejectedCompleteTuples: 0,
		blockRejections: { Field: 0, Foreground: 0, Accent: 0, Composition: 0, Robustness: 0 },
		blockPassingCompleteTuples: 0,
		incumbentNondominatingCompleteTuples: 0,
		incumbentDominatingCompleteTuples: 0,
		completeParetoFrontier: 0,
		minimumBlockClass: 0,
		withinClassParetoFrontier: 0,
		selectedChallengers: 0,
	}
}

function hardTupleFailure(field: FieldAlias, foreground: ForegroundChoice, accent: SourceChoice,
	apca: TupleEvidence["apca"]): string | null {
	const foregroundRgb = choiceRgb(foreground)
	const accentRgb = accent.representative.rgb
	if (!apca.foregroundOnBackground.passed || !apca.foregroundOnSurface.passed) return "foreground-apca"
	if (!apca.accentOnBackground.passed || !apca.accentOnSurface.passed) return "accent-apca"
	if (sameRgb(foregroundRgb, field.background.rgb) || sameRgb(foregroundRgb, field.surface.rgb)) return "foreground-field-duplicate"
	if (sameRgb(accentRgb, foregroundRgb)) return "foreground-accent-collapse"
	if (sameRgb(accentRgb, field.background.rgb) || sameRgb(accentRgb, field.surface.rgb)) return "accent-field-duplicate"
	if (okDistance(accent.representative.lab, field.background.lab) + epsilon < NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance ||
		okDistance(accent.representative.lab, field.surface.lab) + epsilon < NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance) {
		return "accent-field-distance"
	}
	if (okDistance(accent.representative.lab, choiceLab(foreground)) + epsilon <
		NATIVE_COMPLETE_PALETTE_POLICY.accentMinimumDistance) return "accent-foreground-distance"
	if (field.state === "collapsed" !== sameRgb(field.background.rgb, field.surface.rgb)) return "field-collapse-semantics"
	if (field.state === "gradient" && sameRgb(field.background.rgb, field.surface.rgb)) return "gradient-legality"
	if (foreground.kind === "generated" && foreground.necessity.sourceForegroundsPassing !== 0) return "fallback-necessity"
	const colors = [field.background.rgb, field.surface.rgb, foregroundRgb, accentRgb]
	if (new Set(colors.map(rgbKey)).size > NATIVE_COMPLETE_PALETTE_POLICY.maximumDistinctColors) return "cardinality"
	return null
}

type SelectionAccumulator = {
	counts: NativeCompletePaletteRunCounts
	dominanceWitnesses: ReturnType<typeof createDominanceWitnessAccumulator>
	feasibleHash: ReturnType<typeof createHash>
	admittedHash: ReturnType<typeof createHash>
	completePareto: TupleEvidence[]
	minimumBlockPareto: TupleEvidence[]
	minimumBlocks: number
	minimumBlockClassCount: number
}

type ForegroundDomain = {
	foregrounds: ForegroundChoice[]
	sourceEvaluated: number
	sourceApcaRejected: number
	sourceRetained: number
	fallbackTreatment: boolean
	fallbackEvaluated: number
	fallbackRetained: number
}

type StandardSelectionLaneName = "main" |
	Exclude<NativeCompletePaletteAblationName, "without-connected-family-local">

function createSelectionAccumulator(): SelectionAccumulator {
	return {
		counts: emptyRunCounts(),
		dominanceWitnesses: createDominanceWitnessAccumulator(),
		feasibleHash: createHash("sha256"),
		admittedHash: createHash("sha256")
			.update(NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.admittedTupleHashDomain, "utf8")
			.update("\0"),
		completePareto: [],
		minimumBlockPareto: [],
		minimumBlocks: Infinity,
		minimumBlockClassCount: 0,
	}
}

function foregroundDomain(
	field: FieldAlias,
	overlayRepresentatives: readonly NativeCompletePaletteRepresentativeEvidence[],
): ForegroundDomain {
	const passingSourceForegrounds: SourceChoice[] = []
	let sourceApcaRejected = 0
	for (const representative of overlayRepresentatives) {
		const contrast = foregroundApca(representative.rgb, field)
		if (!contrast.foregroundOnBackground.passed || !contrast.foregroundOnSurface.passed) {
			sourceApcaRejected++
			continue
		}
		passingSourceForegrounds.push({ kind: "source", representative })
	}
	const structurallyEligible = passingSourceForegrounds.filter(({ representative }) =>
		sourceForegroundCanFormCompleteTuple(representative, field, overlayRepresentatives))
	if (structurallyEligible.length > 0) {
		return {
			foregrounds: structurallyEligible,
			sourceEvaluated: overlayRepresentatives.length,
			sourceApcaRejected,
			sourceRetained: passingSourceForegrounds.length,
			fallbackTreatment: false,
			fallbackEvaluated: 0,
			fallbackRetained: 0,
		}
	}
	const generated: GeneratedChoice[] = []
	for (const [stableKey, rgb] of [["generated-black", [0, 0, 0]], ["generated-white", [255, 255, 255]]] as const) {
		const contrast = foregroundApca(rgb, field)
		if (!contrast.foregroundOnBackground.passed || !contrast.foregroundOnSurface.passed) continue
		generated.push({
			kind: "generated",
			stableKey,
			rgb,
			lab: rgbToOKLab(rgb),
			necessity: {
				sourceForegroundsEvaluated: overlayRepresentatives.length,
				sourceForegroundsPassing: 0,
				perTreatmentAuthorized: true,
			},
		})
	}
	return {
		foregrounds: generated,
		sourceEvaluated: overlayRepresentatives.length,
		sourceApcaRejected,
		sourceRetained: passingSourceForegrounds.length,
		fallbackTreatment: true,
		fallbackEvaluated: 2,
		fallbackRetained: generated.length,
	}
}

function addForegroundDomainCounts(accumulator: SelectionAccumulator, domain: ForegroundDomain): void {
	accumulator.counts.foregroundSourceEvaluated += domain.sourceEvaluated
	accumulator.counts.foregroundSourceApcaRejected += domain.sourceApcaRejected
	accumulator.counts.foregroundSourceRetained += domain.sourceRetained
	accumulator.counts.foregroundFallbackTreatments += Number(domain.fallbackTreatment)
	accumulator.counts.foregroundFallbackEvaluated += domain.fallbackEvaluated
	accumulator.counts.foregroundFallbackRetained += domain.fallbackRetained
}

function fieldConstraintsPass(field: FieldAlias, canonical: Palette, constraints: Constraints): boolean {
	if ((constraints.canonicalBackground || constraints.canonicalFieldBlock) &&
		!sameRgb(field.background.rgb, canonical.background.rgb)) return false
	if ((constraints.canonicalSurface || constraints.canonicalFieldBlock) &&
		!sameRgb(field.surface.rgb, canonical.surface.rgb)) return false
	if ((constraints.canonicalFieldState || constraints.canonicalFieldBlock) && field.state !== fieldState(canonical)) return false
	return true
}

function foregroundConstraintsPass(foreground: ForegroundChoice, canonical: Palette, constraints: Constraints): boolean {
	return !(constraints.canonicalForeground || constraints.canonicalOverlayBlock) ||
		sameRgb(choiceRgb(foreground), canonical.foreground.rgb)
}

function accentConstraintsPass(accent: NativeCompletePaletteRepresentativeEvidence,
	canonical: Palette, constraints: Constraints): boolean {
	return !(constraints.canonicalAccent || constraints.canonicalOverlayBlock) || sameRgb(accent.rgb, canonical.accent.rgb)
}

function accountHardFailure(accumulator: SelectionAccumulator, failure: string): void {
	accumulator.counts.attemptedCompleteTuples++
	accumulator.counts.hardRejectedCompleteTuples++
	increment(accumulator.counts.hardRejections as Record<string, number>, failure)
}

function accountFeasibleTuple(
	accumulator: SelectionAccumulator,
	tuple: TupleEvidence,
	incumbent: CanonicalEvidence,
): void {
	const { counts } = accumulator
	counts.attemptedCompleteTuples++
	counts.hardFeasibleCompleteTuples++
	const failedBlock = tuple.blocks.find((block) => block.status !== "pass")
	accumulator.feasibleHash.update(stableJson({
		semanticKey: tuple.semanticKey,
		provenanceIdentity: tuple.provenanceIdentity,
		vector: tuple.vector,
		failedBlock: failedBlock?.name ?? null,
	}), "utf8").update("\n")
	if (failedBlock) {
		counts.blockRejectedCompleteTuples++
		;(counts.blockRejections as Record<NativeCompletePaletteBlockName, number>)[failedBlock.name]++
		return
	}
	counts.blockPassingCompleteTuples++
	if (!incumbent.complete || !incumbent.selection) {
		counts.incumbentNondominatingCompleteTuples++
		accumulator.dominanceWitnesses.add({
			tuple: tuple.semanticKey,
			provenanceIdentity: tuple.provenanceIdentity,
			reason: "incumbent-unavailable",
			component: null,
			challengerValue: null,
			incumbentValue: null,
			margin: null,
		})
		return
	}
	if (tuple.changedAtoms === 0) {
		counts.incumbentNondominatingCompleteTuples++
		accumulator.dominanceWitnesses.add({
			tuple: tuple.semanticKey,
			provenanceIdentity: tuple.provenanceIdentity,
			reason: "unchanged-semantics",
			component: null,
			challengerValue: null,
			incumbentValue: null,
			margin: null,
		})
		return
	}
	if (!nativeCompletePaletteStrictlyDominates(tuple.vector, incumbent.selection.vector)) {
		counts.incumbentNondominatingCompleteTuples++
		const weakerIndex = tuple.vector.findIndex((value, index) =>
			value + epsilon < incumbent.selection!.vector[index])
		const component = weakerIndex < 0 ? null : NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER[weakerIndex]
		accumulator.dominanceWitnesses.add({
			tuple: tuple.semanticKey,
			provenanceIdentity: tuple.provenanceIdentity,
			reason: weakerIndex < 0 ? "no-strict-component" : "weaker-component",
			component,
			challengerValue: weakerIndex < 0 ? null : tuple.vector[weakerIndex],
			incumbentValue: weakerIndex < 0 ? null : incumbent.selection.vector[weakerIndex],
			margin: weakerIndex < 0 ? null : tuple.vector[weakerIndex] - incumbent.selection.vector[weakerIndex],
		})
		return
	}
	counts.incumbentDominatingCompleteTuples++
	accumulator.admittedHash.update(stableJson(tupleComparisonIdentity(tuple)), "utf8").update("\n")
	insertPareto(accumulator.completePareto, tuple)
	if (tuple.changedSemanticBlocks < accumulator.minimumBlocks) {
		accumulator.minimumBlocks = tuple.changedSemanticBlocks
		accumulator.minimumBlockClassCount = 1
		accumulator.minimumBlockPareto.length = 0
		insertPareto(accumulator.minimumBlockPareto, tuple)
	} else if (tuple.changedSemanticBlocks === accumulator.minimumBlocks) {
		accumulator.minimumBlockClassCount++
		insertPareto(accumulator.minimumBlockPareto, tuple)
	}
}

function finishSelectionAccumulator(accumulator: SelectionAccumulator): SelectionRun {
	const { counts } = accumulator
	const orderedCompletePareto = sortedFrontier(accumulator.completePareto)
	const orderedMinimumBlockPareto = sortedFrontier(accumulator.minimumBlockPareto)
	const selection = orderedMinimumBlockPareto[0] ?? null
	counts.completeParetoFrontier = orderedCompletePareto.length
	counts.minimumBlockClass = accumulator.minimumBlockClassCount
	counts.withinClassParetoFrontier = orderedMinimumBlockPareto.length
	counts.selectedChallengers = selection ? 1 : 0
	if (counts.attemptedCompleteTuples !== counts.hardRejectedCompleteTuples + counts.hardFeasibleCompleteTuples ||
		counts.hardFeasibleCompleteTuples !== counts.blockRejectedCompleteTuples + counts.blockPassingCompleteTuples ||
		counts.blockPassingCompleteTuples !== counts.incumbentNondominatingCompleteTuples +
			counts.incumbentDominatingCompleteTuples || selection && !orderedMinimumBlockPareto.includes(selection)) {
		throw new Error("Native complete-palette complete tuple counts do not reconcile")
	}
	const dominanceWitnessSummary = accumulator.dominanceWitnesses.finish(counts.incumbentNondominatingCompleteTuples)
	return {
		selection,
		completePareto: orderedCompletePareto,
		minimumBlockPareto: orderedMinimumBlockPareto,
		counts,
		feasibleDomainSha256: accumulator.feasibleHash.digest("hex"),
		dominanceWitnessSummary,
		admittedDomain: {
			exactCount: counts.incumbentDominatingCompleteTuples,
			streamingSha256: accumulator.admittedHash.digest("hex"),
			hashDomain: "native-complete-palette-admitted-tuple-v1",
			retainedCompleteParetoTuples: orderedCompletePareto.length,
			retainedMinimumBlockParetoTuples: orderedMinimumBlockPareto.length,
			retentionRule: "stream-exact-candidate-pareto-frontiers-only",
		},
	}
}

function runSelection(
	fields: readonly FieldAlias[],
	representatives: readonly NativeCompletePaletteRepresentativeEvidence[],
	canonical: Palette,
	incumbent: CanonicalEvidence,
	maximumPopulation: number,
	maximumChroma: number,
	constraints: Constraints = {},
): SelectionRun {
	const accumulator = createSelectionAccumulator()
	const overlayRepresentatives = constraints.withoutConnectedFamilyLocal
		? representatives.filter((representative) => representative.roleDomain !== "connected-overlay")
		: [...representatives]
	for (const field of fields) {
		if (!fieldConstraintsPass(field, canonical, constraints)) continue
		const domain = foregroundDomain(field, overlayRepresentatives)
		addForegroundDomainCounts(accumulator, domain)
		for (const foreground of domain.foregrounds) {
			if (!foregroundConstraintsPass(foreground, canonical, constraints)) continue
			for (const representative of overlayRepresentatives) {
				const accent: SourceChoice = { kind: "source", representative }
				if (!accentConstraintsPass(representative, canonical, constraints)) continue
				const foregroundContrast = foregroundApca(choiceRgb(foreground), field)
				const accentContrast = accentApca(representative.rgb, field)
				const apca = { ...foregroundContrast, ...accentContrast }
				const failure = hardTupleFailure(field, foreground, accent, apca)
				if (failure) {
					accountHardFailure(accumulator, failure)
					continue
				}
				const tuple = evaluateTuple(field, foreground, accent, maximumPopulation, maximumChroma, canonical)
				if (!constraintsPass(tuple, canonical, constraints)) {
					throw new Error("Native complete-palette constrained domain was not filtered before tuple accounting")
				}
				accountFeasibleTuple(accumulator, tuple, incumbent)
			}
		}
	}
	return finishSelectionAccumulator(accumulator)
}

function runStandardSelectionLanes(
	fields: readonly FieldAlias[],
	representatives: readonly NativeCompletePaletteRepresentativeEvidence[],
	canonical: Palette,
	incumbent: CanonicalEvidence,
	maximumPopulation: number,
	maximumChroma: number,
): Record<StandardSelectionLaneName, SelectionRun> {
	const allConstraints = ablationConstraints()
	const laneEntries: Array<[StandardSelectionLaneName, Constraints]> = [
		["main", {}],
		...NATIVE_COMPLETE_PALETTE_ABLATIONS
			.filter((name) => name !== "without-connected-family-local")
			.map((name) => [name, allConstraints[name]] as [StandardSelectionLaneName, Constraints]),
	]
	const accumulators = new Map(laneEntries.map(([name]) => [name, createSelectionAccumulator()]))
	for (const field of fields) {
		const fieldLanes = laneEntries.filter(([, constraints]) => fieldConstraintsPass(field, canonical, constraints))
		const domain = foregroundDomain(field, representatives)
		for (const [name] of fieldLanes) addForegroundDomainCounts(accumulators.get(name)!, domain)
		for (const foreground of domain.foregrounds) {
			const foregroundLanes = fieldLanes.filter(([, constraints]) =>
				foregroundConstraintsPass(foreground, canonical, constraints))
			for (const representative of representatives) {
				const lanes = foregroundLanes.filter(([, constraints]) =>
					accentConstraintsPass(representative, canonical, constraints))
				if (lanes.length === 0) continue
				const accent: SourceChoice = { kind: "source", representative }
				const apca = {
					...foregroundApca(choiceRgb(foreground), field),
					...accentApca(representative.rgb, field),
				}
				const failure = hardTupleFailure(field, foreground, accent, apca)
				if (failure) {
					for (const [name] of lanes) accountHardFailure(accumulators.get(name)!, failure)
					continue
				}
				const tuple = evaluateTuple(field, foreground, accent, maximumPopulation, maximumChroma, canonical)
				for (const [name, constraints] of lanes) {
					if (!constraintsPass(tuple, canonical, constraints)) {
						throw new Error("Native complete-palette lane constraints were not filtered before tuple accounting")
					}
					accountFeasibleTuple(accumulators.get(name)!, tuple, incumbent)
				}
			}
		}
	}
	return Object.fromEntries(laneEntries.map(([name]) => [name,
		finishSelectionAccumulator(accumulators.get(name)!)])) as Record<StandardSelectionLaneName, SelectionRun>
}

function sourceProvenance(representative: NativeCompletePaletteRepresentativeEvidence): SourceRoleProvenance {
	return {
		status: "exact-source",
		stableKey: representative.stableKey,
		familyStableKey: representative.familyStableKey,
		familyKind: representative.familyKind,
		roleDomain: representative.roleDomain,
		rgb: representative.rgb,
		representativePixelIndex: representative.representativePixelIndex,
		construction: representative.construction,
		selectedBy: representative.selectedBy,
	}
}

function generatedProvenance(choice: GeneratedChoice): GeneratedForegroundProvenance {
	return { status: "generated-fallback", stableKey: choice.stableKey, rgb: choice.rgb, necessity: choice.necessity }
}

function canonicalLinks(
	canonical: Palette,
	queries: readonly NativeFieldFamilyQuery[],
): Record<RoleName, NativeFieldFamilyQuery | null> {
	const byRgb = new Map(queries.map((query) => [rgbKey(query.rgb), {
		...query,
		rgb: [...query.rgb] as RGB,
		nativeRgb: query.nativeRgb ? [...query.nativeRgb] as RGB : null,
	}]))
	return Object.fromEntries(roleNames.map((role) => [role,
		canonical[role].generated ? null : byRgb.get(rgbKey(canonical[role].rgb)) ?? null])) as
		Record<RoleName, NativeFieldFamilyQuery | null>
}

function canonicalRoleProvenance(
	canonical: Palette,
	links: Record<RoleName, NativeFieldFamilyQuery | null>,
	canonicalSelection: TupleEvidence | null,
): Record<RoleName, CanonicalRoleProvenance> {
	const aliases: Partial<Record<RoleName, SourceRoleProvenance | GeneratedForegroundProvenance>> = {}
	if (canonicalSelection) {
		aliases.background = sourceProvenance(canonicalSelection.field.background)
		aliases.surface = sourceProvenance(canonicalSelection.field.surface)
		aliases.foreground = canonicalSelection.foreground.kind === "source"
			? sourceProvenance(canonicalSelection.foreground.representative)
			: generatedProvenance(canonicalSelection.foreground)
		aliases.accent = sourceProvenance(canonicalSelection.accent.representative)
	}
	return Object.fromEntries(roleNames.map((role) => [role, {
		status: canonical[role].generated ? "canonical-generated" as const : "canonical-normalized" as const,
		rgb: [...canonical[role].rgb] as RGB,
		generated: canonical[role].generated,
		nativeLinkage: links[role],
		evidenceAlias: aliases[role] ?? null,
	}])) as Record<RoleName, CanonicalRoleProvenance>
}

function selectedRoleProvenance(selection: TupleEvidence): Record<RoleName, SelectedRoleProvenance> {
	return {
		background: sourceProvenance(selection.field.background),
		surface: sourceProvenance(selection.field.surface),
		foreground: selection.foreground.kind === "source"
			? sourceProvenance(selection.foreground.representative) : generatedProvenance(selection.foreground),
		accent: sourceProvenance(selection.accent.representative),
	}
}

function roleColor(choice: NativeCompletePaletteRepresentativeEvidence | GeneratedChoice): RoleColor {
	if ("kind" in choice) return {
		rgb: choice.rgb,
		hex: rgbToHex(choice.rgb),
		generated: true,
		sourceDistance: 0,
	}
	return { rgb: choice.rgb, hex: rgbToHex(choice.rgb), generated: false, sourceDistance: 0 }
}

function paletteMetrics(selection: TupleEvidence,
	evidence: NativeCompletePalettePreparedEvidence): PaletteMetrics {
	const foregroundRgb = choiceRgb(selection.foreground)
	const foregroundLab = choiceLab(selection.foreground)
	const colors = [selection.field.background.lab, foregroundLab, selection.field.surface.lab,
		selection.accent.representative.lab]
	const populations = evidence.families.filter((family) => family.kind === "primary-field")
		.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const total = populations.reduce((sum, family) => sum + family.population, 0)
	const reconstruction = populations.reduce((sum, family) => sum + family.population * Math.min(
		...family.representatives.map((representative) => Math.min(...colors.map((color) =>
			okDistance(representative.lab, color)))),
	), 0) / Math.max(total, epsilon)
	const generatedDistance = selection.foreground.kind === "generated" ? Math.min(
		...allRepresentatives(evidence).map((representative) => okDistance(choiceLab(selection.foreground), representative.lab))) : 0
	return {
		foregroundContrast: contrastRatio(foregroundRgb, selection.field.background.rgb),
		foregroundSurfaceContrast: contrastRatio(foregroundRgb, selection.field.surface.rgb),
		accentContrast: contrastRatio(selection.accent.representative.rgb, selection.field.background.rgb),
		accentSurfaceContrast: contrastRatio(selection.accent.representative.rgb, selection.field.surface.rgb),
		minimumRoleDistance: roleMinimumDistance(colors),
		meanSourceDistance: generatedDistance / 4,
		meanReconstructionError: reconstruction,
	}
}

function gradientEvidence(selection: TupleEvidence): GradientEvidence {
	if (selection.field.state === "collapsed") {
		return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	}
	const topology = selection.field.topology
	if (!topology || topology.status !== "mapped") throw new Error("Selected distinct field has no exact topology")
	const score = topology.observation224.score
	const profile = topology.profiles.find((entry) => entry.profileId === "max-edge-224-area-srgb")!
	return {
		isGradient: selection.field.state === "gradient",
		confidence: selection.field.state === "gradient" ? score : 1 - score,
		coverage: profile.features.unifiedOwnedContinuity,
		continuity: profile.features.ownedProgression,
		coherence: profile.features.ownedConnectivity,
	}
}

function toPalette(selection: TupleEvidence,
	evidence: NativeCompletePalettePreparedEvidence): Palette {
	const foreground = selection.foreground.kind === "source"
		? roleColor(selection.foreground.representative)
		: {
			rgb: selection.foreground.rgb,
			hex: rgbToHex(selection.foreground.rgb),
			generated: true,
			sourceDistance: Math.min(...allRepresentatives(evidence).map((representative) =>
				okDistance(selection.foreground.kind === "generated" ? selection.foreground.lab : representative.lab,
					representative.lab))),
		}
	const palette: Palette = {
		background: roleColor(selection.field.background),
		foreground,
		surface: roleColor(selection.field.surface),
		accent: roleColor(selection.accent.representative),
		gradient: gradientEvidence(selection),
		score: Math.min(...selection.vector),
		metrics: paletteMetrics(selection, evidence),
	}
	return deepFreeze(palette)
}

function canonicalApca(canonical: Palette): NativeCompletePaletteCertificate["selection"]["apca"] {
	return {
		foregroundOnBackground: signedApca(apcaContrast(canonical.foreground.rgb, canonical.background.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc),
		foregroundOnSurface: signedApca(apcaContrast(canonical.foreground.rgb, canonical.surface.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc),
		accentOnBackground: signedApca(apcaContrast(canonical.accent.rgb, canonical.background.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc),
		accentOnSurface: signedApca(apcaContrast(canonical.accent.rgb, canonical.surface.rgb),
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
			NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc),
	}
}

function frontierEntry(tuple: TupleEvidence): NativeCompletePaletteFrontierEntry {
	return {
		semanticKey: tuple.semanticKey,
		provenanceIdentity: tuple.provenanceIdentity,
		changedSemanticBlocks: tuple.changedSemanticBlocks,
		changedAtoms: tuple.changedAtoms,
		flattenedVector: tuple.vector,
	}
}

function selectionSummary(run: SelectionRun, canonical: Palette,
	incumbent: CanonicalEvidence): NativeCompletePaletteSelectionSummary {
	const selected = run.selection
	return {
		independentAccumulator: true,
		route: selected ? "challenger-selected" : "preserve-canonical",
		semanticKey: selected?.semanticKey ?? tupleSemanticKey(
			canonical.background.rgb, canonical.surface.rgb, fieldState(canonical), canonical.foreground.rgb, canonical.accent.rgb),
		provenanceIdentity: selected?.provenanceIdentity ?? incumbent.selection?.provenanceIdentity ?? "canonical-unresolved",
		changedSemanticBlocks: selected?.changedSemanticBlocks ?? 0,
		changedAtoms: selected?.changedAtoms ?? 0,
		flattenedVector: selected?.vector ?? incumbent.selection?.vector ?? null,
		counts: run.counts,
		admittedDomain: run.admittedDomain,
		dominanceWitnessSummary: run.dominanceWitnessSummary,
		domainSha256: sha256(stableJson({
			constraintsResult: selected?.provenanceIdentity ?? null,
			counts: run.counts,
			admittedDomain: run.admittedDomain,
			dominanceWitnessSummary: run.dominanceWitnessSummary,
			frontier: run.minimumBlockPareto.map((tuple) => tuple.provenanceIdentity),
		})),
	}
}

function ablationConstraints(): Record<NativeCompletePaletteAblationName, Constraints> {
	return {
		"canonical-background": { canonicalBackground: true },
		"canonical-surface": { canonicalSurface: true },
		"canonical-field-state": { canonicalFieldState: true },
		"canonical-field-block": { canonicalFieldBlock: true },
		"canonical-foreground": { canonicalForeground: true },
		"canonical-accent": { canonicalAccent: true },
		"canonical-overlay-block": { canonicalOverlayBlock: true },
		"without-connected-family-local": { withoutConnectedFamilyLocal: true },
	}
}

function assertPreparedEvidence(
	native: RawImage,
	sourceSha256: string,
	evidence: NativeCompletePalettePreparedEvidence,
): void {
	if (!/^[0-9a-f]{64}$/.test(sourceSha256) || evidence.source.sha256 !== sourceSha256) {
		throw new Error("Native complete-palette encoded-source SHA-256 is invalid or mismatched")
	}
	if (native.width !== evidence.source.nativeWidth || native.height !== evidence.source.nativeHeight ||
		native.data.length !== native.width * native.height * 3 || rasterSha256(native) !== evidence.source.nativeRasterSha256) {
		throw new Error("Native complete-palette raster does not match prepared graph evidence")
	}
	if (evidence.graph.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
		evidence.graph.policyVersion !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION ||
		evidence.graph.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256) {
		throw new Error("Native complete-palette prepared graph identity drifted")
	}
	for (const family of evidence.families) for (const representative of family.representatives) {
		const index = representative.representativePixelIndex
		if (index < 0 || index >= native.width * native.height || representative.familyStableKey !== family.stableKey ||
			!sameRgb(representative.rgb, [native.data[index * 3], native.data[index * 3 + 1], native.data[index * 3 + 2]])) {
			throw new Error(`Representative ${representative.stableKey} is not an exact supplied native pixel`)
		}
		if (family.kind === "connected-overlay" && representative.roleDomain !== "connected-overlay" ||
			family.kind === "primary-field" && representative.roleDomain === "connected-overlay") {
			throw new Error(`Representative ${representative.stableKey} has an invalid role domain`)
		}
		if ([...representative.lab, representative.population, representative.saliency, representative.text,
			representative.chroma, representative.detail, representative.familyPopulation,
			representative.familySupport, representative.familyStability].some((value) => !Number.isFinite(value))) {
			throw new Error(`Representative ${representative.stableKey} has non-finite evidence`)
		}
	}
	for (const family of evidence.families) {
		if ([family.population, family.support, family.stability, family.oneFieldFitMinimum,
			family.oneFieldFitRange].some((value) => !Number.isFinite(value))) {
			throw new Error(`Family ${family.stableKey} has non-finite evidence`)
		}
	}
	for (const relation of evidence.relations) {
		if ([relation.twoFieldFitMinimum, relation.stateAgreement, relation.distinctFlatSupportMinimum,
			relation.distinctFlatSupportRange, relation.gradientSupportMinimum,
			relation.gradientSupportRange].some((value) => !Number.isFinite(value))) {
			throw new Error(`Relation ${relation.stableKey} has non-finite evidence`)
		}
	}
}

export function selectNativeCompletePaletteFromEvidence(input: {
	native: RawImage
	sourceSha256: string
	canonical: Palette
	evidence: NativeCompletePalettePreparedEvidence
	canonicalQueries?: readonly NativeFieldFamilyQuery[]
	resolveTopology: NativeCompletePaletteTopologyResolver
}): NativeCompletePaletteResult {
	const { native, sourceSha256, canonical, resolveTopology } = input
	const evidence = deepFreeze(structuredClone(input.evidence)) as NativeCompletePalettePreparedEvidence
	assertPalette(canonical)
	assertPreparedEvidence(native, sourceSha256, evidence)
	const canonicalBefore = sha256(stableJson(canonical))
	const representatives = allRepresentatives(evidence)
	if (representatives.length === 0) throw new Error("Native complete-palette evidence has no exact representatives")
	const maximumPopulation = Math.max(...representatives.map((representative) => representative.population), epsilon)
	const maximumChroma = Math.max(...representatives.map((representative) => representative.chroma), epsilon)
	const stage = stageFieldDomain(evidence, canonical, resolveTopology)
	const incumbent = canonicalEvidence(canonical, evidence, stage.topologyByPair, maximumPopulation, maximumChroma)
	const standardLanes = runStandardSelectionLanes(
		stage.retained, representatives, canonical, incumbent, maximumPopulation, maximumChroma)
	const main = standardLanes.main
	const selection = main.selection
	const palette = selection ? toPalette(selection, evidence) : canonical
	const canonicalAfter = sha256(stableJson(canonical))
	if (canonicalBefore !== canonicalAfter) throw new Error("Native complete-palette inference mutated canonical")
	if (!selection && palette !== canonical) throw new Error("Native complete-palette did not preserve exact canonical object semantics")
	const links = canonicalLinks(canonical, input.canonicalQueries ?? [])
	const canonicalRoles = canonicalRoleProvenance(canonical, links, incumbent.selection)
	const route = selection
		? "challenger-selected" as const
		: !incumbent.complete
			? "preserve-canonical-incomplete-evidence" as const
			: main.counts.blockPassingCompleteTuples > 0
				? "preserve-canonical-incomparable-or-weak" as const
				: "preserve-canonical-no-admissible-challenger" as const
	const selectedSemanticKey = selection?.semanticKey ?? tupleSemanticKey(
		canonical.background.rgb, canonical.surface.rgb, fieldState(canonical), canonical.foreground.rgb, canonical.accent.rgb)
	const selectedProvenanceIdentity = selection?.provenanceIdentity ?? incumbent.selection?.provenanceIdentity ?? "canonical-unresolved"
	const constraints = ablationConstraints()
	const ablationRuns: Record<NativeCompletePaletteAblationName, SelectionRun> = {
		"canonical-background": standardLanes["canonical-background"],
		"canonical-surface": standardLanes["canonical-surface"],
		"canonical-field-state": standardLanes["canonical-field-state"],
		"canonical-field-block": standardLanes["canonical-field-block"],
		"canonical-foreground": standardLanes["canonical-foreground"],
		"canonical-accent": standardLanes["canonical-accent"],
		"canonical-overlay-block": standardLanes["canonical-overlay-block"],
		"without-connected-family-local": runSelection(stage.retained, representatives, canonical, incumbent,
			maximumPopulation, maximumChroma, constraints["without-connected-family-local"]),
	}
	const ablations = Object.fromEntries(NATIVE_COMPLETE_PALETTE_ABLATIONS.map((name) => {
		return [name, selectionSummary(ablationRuns[name], canonical, incumbent)]
	})) as Record<NativeCompletePaletteAblationName, NativeCompletePaletteSelectionSummary>
	const fieldDomainIdentity = {
		counts: stage.counts,
		retained: stage.retained.map((field) => ({
			semanticKey: field.semanticKey,
			provenanceIdentity: field.provenanceIdentity,
			values: field.values,
			topologyStatus: field.topology?.status,
		})),
		witnesses: stage.witnesses,
	}
	const retainedBySemantic = new Map<string, FieldAlias[]>()
	for (const field of stage.retained) {
		const aliases = retainedBySemantic.get(field.semanticKey) ?? []
		aliases.push(field)
		retainedBySemantic.set(field.semanticKey, aliases)
	}
	const retainedFieldTreatments = [...retainedBySemantic.entries()].sort(([first], [second]) =>
		compareAscii(first, second)).map(([semanticKey, aliases]) => ({
		semanticKey,
		state: aliases[0].state,
		backgroundRgb: aliases[0].background.rgb,
		surfaceRgb: aliases[0].surface.rgb,
		aliases: aliases.map((field) => ({
			provenanceIdentity: field.provenanceIdentity,
			background: sourceProvenance(field.background),
			surface: sourceProvenance(field.surface),
			fieldComponents: field.values,
		})),
	}))
	const selectedBlocks = selection?.blocks ?? incumbent.selection?.blocks ?? unavailableBlocks()
	const selectedVector = selection?.vector ?? incumbent.selection?.vector ?? null
	const selectedApca = selection?.apca ?? canonicalApca(canonical)
	const selectedRoles = selection ? selectedRoleProvenance(selection) : canonicalRoles
	const selectedTopology = selection?.field.topology ?? incumbent.selection?.field.topology ?? null
	const counts = {
		...main.counts,
		reconciliation: {
			attempted: true as const,
			hardFeasible: true as const,
			blockPassing: true as const,
			selectedWithinPareto: true as const,
		},
	}
	const certificate: NativeCompletePaletteCertificate = {
		schemaVersion: 1,
		identity: NATIVE_COMPLETE_PALETTE_IDENTITY,
		policy: NATIVE_COMPLETE_PALETTE_POLICY,
		source: {
			...evidence.source,
			graphSourceMatchesSuppliedSource: true,
			nativeRasterMatchesGraph: true,
			topologyBoundToSameSourceAndRaster: true,
		},
		graph: evidence.graph,
		canonical: {
			version: NATIVE_COMPLETE_PALETTE_CANONICAL_VERSION,
			comparatorSha256: NATIVE_COMPLETE_PALETTE_COMPARATOR_SHA256,
			semanticSha256: canonicalBefore,
			fieldState: fieldState(canonical),
			roles: canonicalRoles,
			evidenceComplete: incumbent.complete,
			unavailableReasons: incumbent.reasons,
			materiallyAmbiguous: incumbent.materiallyAmbiguous,
			blocks: incumbent.selection?.blocks ?? unavailableBlocks(),
			flattenedVector: incumbent.selection?.vector ?? null,
			interpretations: {
				exactCount: incumbent.interpretationCount,
				streamingSha256: incumbent.interpretationSha256,
				hashDomain: "native-complete-palette-canonical-interpretation-v1",
				retainedParetoTuples: incumbent.retainedParetoTuples,
				retentionRule: "stream-equality-compressed-pareto-frontier-only",
			},
		},
		stagedDomain: {
			counts: stage.counts,
			hardFieldRejections: stage.hardRejections,
			witnesses: stage.witnesses,
			retainedFieldTreatments,
			topologyQueries: [...stage.topologyByPair.entries()].sort(([first], [second]) =>
				compareAscii(first, second)).map(([, topology]) => topology),
			reconciliation: { raw: true, hardEligible: true, stagedAliases: true },
		},
		selection: {
			route,
			semanticKey: selectedSemanticKey,
			provenanceIdentity: selectedProvenanceIdentity,
			changedSemanticBlocks: selection?.changedSemanticBlocks ?? 0,
			changedAtoms: selection?.changedAtoms ?? 0,
			roles: selectedRoles,
			apca: selectedApca,
			blocks: selectedBlocks,
			flattenedVector: selectedVector,
			topology: selectedTopology,
		},
		counts,
		dominanceWitnessSummary: main.dominanceWitnessSummary,
		admittedDomain: main.admittedDomain,
		frontiers: {
			completePareto: main.completePareto.map(frontierEntry),
			minimumBlockPareto: main.minimumBlockPareto.map(frontierEntry),
		},
		hashes: {
			fieldDomainSha256: sha256(stableJson(fieldDomainIdentity)),
			feasibleDomainSha256: main.feasibleDomainSha256,
			selectedPaletteSha256: sha256(stableJson(palette)),
			selectedTupleSha256: sha256(stableJson({
				semanticKey: selectedSemanticKey,
				provenanceIdentity: selectedProvenanceIdentity,
				vector: selectedVector,
				roles: selectedRoles,
			})),
		},
		ablations,
		unchangedCanonicalAssertion: {
			unchanged: !selection,
			exactObjectReferencePreserved: !selection && palette === canonical,
			semanticHashBefore: canonicalBefore,
			semanticHashAfter: canonicalAfter,
			canonicalNotMutated: true,
		},
		invariants: {
			canonicalExtractorInvokedInternally: false,
			primaryFieldsOnly: true,
			connectedFamiliesOverlayOnly: true,
			exactSourceChallengerRoles: true,
			signedApcaPolarity: true,
			generatedForegroundPerTreatmentOnly: true,
			generatedAccentAbsent: true,
			challengerOverlayCollapseAbsent: true,
			maximumFourColors: true,
			componentwiseIncumbentDominance: true,
			noncompensatoryBlocks: true,
			noHeuristicTopK: true,
			exactConstrainedAblationAccumulators: true,
			nondominatingCompleteTuplesStreamed: true,
			admittedCompleteTuplesParetoStreamed: true,
			completeRejectedTupleDomainsSerialized: false,
			noPostselectionMutation: true,
			deeplyImmutableCertificate: true,
		},
	}
	deepFreeze(certificate)
	return Object.freeze({ palette, certificate })
}

export function buildNativeCompletePalette(
	native: RawImage,
	sourceSha256: string,
	canonical: Palette,
): NativeCompletePaletteResult {
	const before = rasterSha256(native)
	const requestedCanonicalRgbs = roleNames.map((role) => canonical[role].rgb)
	const built = buildNativeFieldHypothesisGraphWithFamilyQueries(native, sourceSha256, requestedCanonicalRgbs)
	if (stableJson(built.queryPolicy) !== stableJson(NATIVE_FIELD_FAMILY_QUERY_POLICY)) {
		throw new Error("Native complete-palette family-query policy drifted")
	}
	const evidence = prepareNativeCompletePaletteEvidence(built.graph)
	const result = selectNativeCompletePaletteFromEvidence({
		native,
		sourceSha256,
		canonical,
		evidence,
		canonicalQueries: built.queries,
		resolveTopology: (pairs) => {
			const queried = queryNativeFieldFamiliesAndTopology(native, sourceSha256, [], pairs)
			if (stableJson(queried.queryPolicy) !== stableJson(NATIVE_FIELD_FAMILY_QUERY_POLICY)) {
				throw new Error("Native complete-palette exact topology query policy drifted")
			}
			return {
				sourceSha256,
				nativeRasterSha256: evidence.source.nativeRasterSha256,
				queryPolicySha256: NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256,
				queries: queried.topologyQueries,
			}
		},
	})
	if (rasterSha256(native) !== before) throw new Error("Native complete-palette graph or selector mutated its native raster")
	return result
}
