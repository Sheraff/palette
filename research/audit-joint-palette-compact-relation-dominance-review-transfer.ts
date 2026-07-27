import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	parseNextPaletteReviewFeedbackStore as parseFeedbackStoreV2,
	parseNextPaletteReviewManifest as parseManifestV2,
} from "./src/next-palette-review-v2.ts"
import {
	parseNextPaletteReviewFeedbackStore as parseFeedbackStoreV1,
	parseNextPaletteReviewManifest as parseManifestV1,
} from "./src/next-palette-review.ts"
import type { Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const CANDIDATE_VERSION = "joint-palette-compact-relation-dominance-0.1.0-development"
const CANDIDATE_EXPERIMENT_ID = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const BASELINE_ALGORITHM_VERSION = "region-graph-0.19.0"
const TRANSFER_REVIEW_CANDIDATE_VERSION = "joint-palette-ablation-stable-noncollapsed-field-0.1.0-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const candidateRoot = `research/data/experiments/${CANDIDATE_VERSION}`
const roles = ["background", "foreground", "surface", "accent"] as const

const candidateArtifacts = [
	{ name: "manifest", path: `${candidateRoot}/manifest.json` },
	{ name: "protocol", path: `${candidateRoot}/protocol.json` },
	{ name: "analysis", path: `${candidateRoot}/analysis.json` },
	{ name: "results", path: `${candidateRoot}/results.json` },
	{ name: "frontier", path: `${candidateRoot}/frontier.json` },
] as const

// This is the complete registry at audit creation. It is intentionally fixed so later files cannot change the audit.
const priorV2Registry = [
	{
		manifestPath: "research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-04-manifest.json",
		feedbackPath: null,
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-03-manifest.json",
		feedbackPath: null,
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-manifest.json",
		feedbackPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-feedback.json",
	},
] as const

const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/next-palette-review-v2.ts",
	"research/audit-joint-palette-compact-relation-dominance-review-transfer.ts",
] as const

type SemanticPalette = {
	roles: Record<RoleName, { rgb: RGB; generated: boolean }>
	gradient: { isGradient: boolean }
}
type CandidateFrontierEntry = {
	file: string
	cohort: "development" | "00"
	source: { path: string; sha256: string; bytes: number }
	changedRoles: RoleName[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	selected: {
		changed: boolean
		admitted: boolean
		fieldState: string
		changedSemanticBlocks: number
		changedSemanticAtoms: number
	}
}
type ReviewManifest = ReturnType<typeof parseManifestV1> | ReturnType<typeof parseManifestV2>
type ReviewFeedback = ReturnType<typeof parseFeedbackStoreV1> | ReturnType<typeof parseFeedbackStoreV2>
type RegistryEntry = {
	manifestPath: string
	manifestSha256: string
	manifest: ReviewManifest
	feedbackPath: string | null
	feedbackSha256: string | null
	feedback: ReviewFeedback | null
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function candidateSemantics(palette: Palette): SemanticPalette {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette[role].rgb,
			generated: palette[role].generated,
		}])) as SemanticPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient },
	}
}

function presentedSemantics(palette: ReviewManifest["entries"][number]["options"]["A"]): SemanticPalette {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette.roles[role].rgb,
			generated: palette.roles[role].generated,
		}])) as SemanticPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient },
	}
}

function unblind(entry: ReviewManifest["entries"][number]): { baseline: SemanticPalette; candidate: SemanticPalette } {
	const baselineOption = entry.assignment.A === "baseline" ? entry.options.A : entry.options.B
	const candidateOption = entry.assignment.A === "candidate" ? entry.options.A : entry.options.B
	return { baseline: presentedSemantics(baselineOption), candidate: presentedSemantics(candidateOption) }
}

function transferredComparison(
	preference: string | null,
	candidateOption: "A" | "B",
): "candidate-stronger" | "baseline-stronger" | "both-similarly-valid" | "neither-acceptable" | "uncertain" | null {
	if (preference === null) return null
	if (preference === "both-similarly-valid" || preference === "neither-acceptable" || preference === "uncertain") return preference
	if (preference === "a-stronger") return candidateOption === "A" ? "candidate-stronger" : "baseline-stronger"
	if (preference === "b-stronger") return candidateOption === "B" ? "candidate-stronger" : "baseline-stronger"
	throw new Error(`Unknown review preference: ${preference}`)
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite transfer audit: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

if (process.argv.slice(2).length > 0) {
	throw new Error("audit-joint-palette-compact-relation-dominance-review-transfer.ts does not accept arguments")
}
await assertOutputAbsent()

if (priorV2Registry.length !== 8 || priorV2Registry.filter((entry) => entry.feedbackPath !== null).length !== 6 ||
	new Set(priorV2Registry.map((entry) => entry.manifestPath)).size !== priorV2Registry.length) {
	throw new Error("The explicit prior presentation registry is incomplete")
}

const candidateInputEntries = await Promise.all(candidateArtifacts.map(async ({ name, path }) => {
	const raw = await readFile(join(projectRoot, path))
	return [name, { path, raw, sha256: sha256(raw) }] as const
}))
const candidateInputs = Object.fromEntries(candidateInputEntries) as Record<
	typeof candidateArtifacts[number]["name"], { path: string; raw: Buffer; sha256: string }
>
const parseCandidate = <T>(name: keyof typeof candidateInputs): T =>
	JSON.parse(candidateInputs[name].raw.toString("utf8")) as T

const registry: RegistryEntry[] = await Promise.all(priorV2Registry.map(async (registered) => {
	const manifestRaw = await readFile(join(projectRoot, registered.manifestPath))
	const manifestValue = JSON.parse(manifestRaw.toString("utf8")) as { presentationVersion?: string }
	const manifest = manifestValue.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION
		? parseManifestV2(manifestValue)
		: parseManifestV1(manifestValue)
	let feedback: ReviewFeedback | null = null
	let feedbackSha256: string | null = null
	if (registered.feedbackPath !== null) {
		const feedbackRaw = await readFile(join(projectRoot, registered.feedbackPath))
		const feedbackValue = JSON.parse(feedbackRaw.toString("utf8"))
		feedback = manifest.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION
			? parseFeedbackStoreV2(feedbackValue, manifest as ReturnType<typeof parseManifestV2>)
			: parseFeedbackStoreV1(feedbackValue, manifest as ReturnType<typeof parseManifestV1>)
		feedbackSha256 = sha256(feedbackRaw)
	}
	return {
		manifestPath: registered.manifestPath,
		manifestSha256: sha256(manifestRaw),
		manifest,
		feedbackPath: registered.feedbackPath,
		feedbackSha256,
		feedback,
	}
}))

const candidateManifest = parseCandidate<{
	experimentId: string
	experimentVersion: string
	protocol: unknown
	policy: { incumbentAlgorithmVersion: string; fixedApcaAdmissionFloor: null }
	sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
}>("manifest")
const candidateProtocol = parseCandidate<{
	experimentVersion: string
	authorization: Record<string, unknown>
	selector: { fixedApcaAdmissionFloor: null }
	stoppingRules: { frontierIsCompleteChangedSetWithoutSampling: boolean }
}>("protocol")
const candidateAnalysis = parseCandidate<{
	experimentId: string
	candidateCount: number
	classification: string
	structural: { pass: boolean; violationCount: number }
	matrix: { changed: number }
	frontier: { count: number; completeChangedSet: boolean; sampled: boolean }
}>("analysis")
const candidateResults = parseCandidate<{
	experimentId: string
	entries: Array<{
		file: string
		source: { sha256: string; bytes: number }
		canonical: Palette
		candidate: Palette
		certificate: { selected: { changed: boolean } }
		structural: { violations: string[] }
	}>
}>("results")
const candidateFrontier = parseCandidate<{ experimentId: string; entries: CandidateFrontierEntry[] }>("frontier")
const changedResults = candidateResults.entries.filter((entry) => entry.certificate.selected.changed)
const changedBySource = new Map(changedResults.map((entry) => [entry.source.sha256, entry]))

const candidateChecks = {
	experimentIdentity: candidateManifest.experimentId === CANDIDATE_EXPERIMENT_ID &&
		candidateAnalysis.experimentId === CANDIDATE_EXPERIMENT_ID && candidateResults.experimentId === CANDIDATE_EXPERIMENT_ID &&
		candidateFrontier.experimentId === CANDIDATE_EXPERIMENT_ID,
	version: candidateManifest.experimentVersion === CANDIDATE_VERSION && candidateProtocol.experimentVersion === CANDIDATE_VERSION,
	protocolBinding: isDeepStrictEqual(candidateManifest.protocol, candidateProtocol),
	baselineBinding: candidateManifest.policy.incumbentAlgorithmVersion === BASELINE_ALGORITHM_VERSION,
	noFixedApcaGate: candidateManifest.policy.fixedApcaAdmissionFloor === null && candidateProtocol.selector.fixedApcaAdmissionFloor === null,
	structurallyClean: candidateAnalysis.structural.pass && candidateAnalysis.structural.violationCount === 0 &&
		candidateResults.entries.every((entry) => entry.structural.violations.length === 0),
	completeChangedSet: candidateAnalysis.candidateCount === 18 && candidateAnalysis.matrix.changed === 18 &&
		candidateAnalysis.frontier.count === 18 && candidateAnalysis.frontier.completeChangedSet &&
		!candidateAnalysis.frontier.sampled && candidateProtocol.stoppingRules.frontierIsCompleteChangedSetWithoutSampling &&
		changedResults.length === 18 && candidateFrontier.entries.length === 18,
	frontierSemantics: candidateFrontier.entries.every((entry) => {
		const result = changedBySource.get(entry.source.sha256)
		return result !== undefined && result.file === entry.file && result.source.bytes === entry.source.bytes &&
			entry.source.path === entry.file && isDeepStrictEqual(candidateSemantics(result.canonical), candidateSemantics(entry.baseline)) &&
			isDeepStrictEqual(candidateSemantics(result.candidate), candidateSemantics(entry.candidate)) && entry.selected.changed &&
			entry.selected.admitted && entry.selected.changedSemanticBlocks === 1 && entry.selected.fieldState !== "collapsed"
	}),
	allowedSourceRootsOnly: candidateFrontier.entries.every((entry) => /^(?:images|00)\/[^/\\]+$/.test(entry.source.path)) &&
		candidateFrontier.entries.every((entry) => !/^(?:10|11|12|13|14)\//.test(entry.source.path)),
}
if (Object.values(candidateChecks).some((value) => !value)) {
	throw new Error(`Frozen candidate binding or structural checks failed: ${JSON.stringify(candidateChecks)}`)
}

const comparisonResults = candidateFrontier.entries.map((candidate) => {
	const baseline = candidateSemantics(candidate.baseline)
	const challenger = candidateSemantics(candidate.candidate)
	const sameSourceComparisons = registry.flatMap((prior) => prior.manifest.entries.flatMap((entry) => {
		if (entry.source.sha256 !== candidate.source.sha256) return []
		const shown = unblind(entry)
		const identity = {
			samePresentationVersion: prior.manifest.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
			exactSourceSha256: entry.source.sha256 === candidate.source.sha256,
			exactBaselineSemanticPalette: isDeepStrictEqual(shown.baseline, baseline),
			exactCandidateSemanticPalette: isDeepStrictEqual(shown.candidate, challenger),
		}
		const exact = Object.values(identity).every(Boolean)
		const feedback = prior.feedback?.entries.find((item) => item.caseId === entry.caseId) ?? null
		const candidateOption = entry.assignment.A === "candidate" ? "A" as const : "B" as const
		const baselineOption = candidateOption === "A" ? "B" as const : "A" as const
		return [{
			manifestPath: prior.manifestPath,
			manifestSha256: prior.manifestSha256,
			manifestId: prior.manifest.manifestId,
			candidateAlgorithmVersion: prior.manifest.candidateAlgorithmVersion,
			presentationVersion: prior.manifest.presentationVersion,
			priorCaseId: entry.caseId,
			feedbackPath: prior.feedbackPath,
			feedbackSha256: prior.feedbackSha256,
			identity,
			exact,
			reviewed: feedback !== null,
			sourceEligibility: feedback?.sourceEligibility ?? null,
			baselineQuality: feedback ? feedback[`quality${baselineOption}`] : null,
			candidateQuality: feedback ? feedback[`quality${candidateOption}`] : null,
			comparison: feedback ? transferredComparison(feedback.preference, candidateOption) : null,
		}]
	}))
	const exactAppearances = sameSourceComparisons.filter((entry) => entry.exact)
	return {
		file: candidate.file,
		cohort: candidate.cohort,
		source: candidate.source,
		semanticIdentitySha256: sha256(JSON.stringify({
			presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
			sourceSha256: candidate.source.sha256,
			baseline,
			candidate: challenger,
		})),
		sameSourceComparisons,
		exactAppearances,
		classification: exactAppearances.length === 0 ? "never-presented-exactly" as const : "exactly-presented" as const,
	}
})

const exactCases = comparisonResults.filter((entry) => entry.exactAppearances.length > 0)
const freshCases = comparisonResults.filter((entry) => entry.exactAppearances.length === 0)
const exactAppearances = exactCases.flatMap((entry) => entry.exactAppearances.map((appearance) => ({ entry, appearance })))
const transferChecks = {
	exactCaseCount: exactCases.length === 2,
	exactAppearanceCount: exactAppearances.length === 2,
	allExactCasesReviewedOnce: exactCases.every((entry) => entry.exactAppearances.length === 1 && entry.exactAppearances[0].reviewed),
	allEligible: exactAppearances.every(({ appearance }) => appearance.sourceEligibility === "eligible-artwork"),
	allCandidateQualityStrong: exactAppearances.every(({ appearance }) => appearance.candidateQuality === "strong"),
	allCandidateStronger: exactAppearances.every(({ appearance }) => appearance.comparison === "candidate-stronger"),
	allFromComputedAblationStableReview: exactAppearances.every(({ appearance }) =>
		appearance.candidateAlgorithmVersion === TRANSFER_REVIEW_CANDIDATE_VERSION),
	freshCaseCount: freshCases.length === 16,
	freshNeverPresented: freshCases.every((entry) => entry.classification === "never-presented-exactly"),
	completeAccounting: exactCases.length + freshCases.length === candidateFrontier.entries.length &&
		new Set(comparisonResults.map((entry) => entry.source.sha256)).size === 18,
}
if (Object.values(transferChecks).some((value) => !value)) {
	throw new Error(`Exact-presentation novelty/transfer evidence disagrees: ${JSON.stringify(transferChecks)}`)
}

const protocol = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	auditType: "exact-presentation-v2-novelty-and-positive-transfer",
	candidateBinding: {
		candidateExperimentId: CANDIDATE_EXPERIMENT_ID,
		candidateAlgorithmVersion: CANDIDATE_VERSION,
		baselineAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
		completeChangedComparisons: candidateFrontier.entries.length,
	},
	priorV2RegistryAtCreation: {
		manifestCount: priorV2Registry.length,
		feedbackStoreCount: priorV2Registry.filter((entry) => entry.feedbackPath !== null).length,
		entries: priorV2Registry,
		discoveryPolicy: "explicit-fixed-registry-no-future-file-discovery",
	},
	exactIdentityPolicy: {
		required: [
			"same-presentation-version",
			"exact-source-sha256",
			"exact-unblinded-baseline-role-rgb-generated-and-gradient-decision",
			"exact-unblinded-candidate-role-rgb-generated-and-gradient-decision",
		],
		nonIdentifying: ["metrics", "scores", "names", "gradient-confidence"],
		perceptualMatching: false,
	},
	inferencePolicy: {
		commentsEnterInference: false,
		targetColorsConsumed: false,
		fixedApcaAdmissionFloor: null,
	},
	stoppingRules: {
		candidateStructuralPassRequired: true,
		completeChangedComparisonsMustEqual: 18,
		exactReviewedPositiveTransfersMustEqual: 2,
		neverPresentedFreshComparisonsMustEqual: 16,
		allTransfersMustBeEligibleStrongAndCandidateStronger: true,
		completeAccountingRequired: true,
		evidenceDisagreementStopsBeforeReviewAuthorization: true,
	},
	authorization: {
		freshPresentationV2ReviewAuthorized: true,
		authorizedFreshComparisonCount: 16,
		completeFreshFrontierOnly: true,
		broaderReviewAuthorized: false,
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		extractionChangeAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [] as string[],
		allowedSourceRoots: ["images", "00"],
	},
}
const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
	[path, sha256(await readFile(join(projectRoot, path)))] as const)))
const registryBindings = registry.map((entry) => ({
	manifestPath: entry.manifestPath,
	manifestSha256: entry.manifestSha256,
	manifestId: entry.manifest.manifestId,
	presentationVersion: entry.manifest.presentationVersion,
	feedbackPath: entry.feedbackPath,
	feedbackSha256: entry.feedbackSha256,
}))
const identity = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	protocol,
	inputs: {
		candidateArtifacts: candidateArtifacts.map(({ name }) => ({
			name,
			path: candidateInputs[name].path,
			sha256: candidateInputs[name].sha256,
		})),
		priorV2Registry: registryBindings,
	},
	sources: candidateFrontier.entries.map((entry) => ({ cohort: entry.cohort, ...entry.source })),
	implementation,
}
const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
const generatedAt = new Date().toISOString()
const transfers = exactAppearances.map(({ entry, appearance }) => ({
	file: entry.file,
	sourceSha256: entry.source.sha256,
	priorCaseId: appearance.priorCaseId,
	sourceEligibility: appearance.sourceEligibility,
	baselineQuality: appearance.baselineQuality,
	candidateQuality: appearance.candidateQuality,
	comparison: appearance.comparison,
	transferBasis: "exact-presentation-v2-source-and-unblinded-semantic-comparison-identity",
	prior: {
		manifestPath: appearance.manifestPath,
		manifestId: appearance.manifestId,
		manifestSha256: appearance.manifestSha256,
		feedbackPath: appearance.feedbackPath,
		feedbackSha256: appearance.feedbackSha256,
	},
}))
const freshBySha = new Set(freshCases.map((entry) => entry.source.sha256))
const freshFrontier = candidateFrontier.entries.filter((entry) => freshBySha.has(entry.source.sha256)).map((entry) => ({
	...entry,
	novelty: {
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		neverPresentedExactlyInBoundRegistry: true,
	},
}))
const analysis = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	experimentId,
	generatedAt,
	structural: { pass: true, violationCount: 0, checks: candidateChecks },
	registry: {
		manifests: registry.length,
		feedbackStores: registry.filter((entry) => entry.feedback !== null).length,
		presentationVersions: Object.fromEntries([...new Set(registry.map((entry) => entry.manifest.presentationVersion))].sort().map(
			(version) => [version, registry.filter((entry) => entry.manifest.presentationVersion === version).length],
		)),
	},
	accounting: {
		completeChangedComparisons: candidateFrontier.entries.length,
		exactPreviouslyReviewedComparisons: exactCases.length,
		eligibleStrongCandidateStrongerTransfers: transfers.length,
		neverPresentedFreshComparisons: freshFrontier.length,
		complete: transfers.length + freshFrontier.length === candidateFrontier.entries.length,
	},
	transferChecks,
	review: {
		authorized: true,
		freshBlindedComparisonsRequired: freshFrontier.length,
		exactPositiveTransfers: transfers.length,
		diagnosticOnly: true,
	},
	disposition: "presentation-v2-complete-fresh-frontier-review-authorized",
}

await mkdir(outputRoot)
await Promise.all([
	writeExclusive(join(outputRoot, "protocol.json"), protocol),
	writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
	writeExclusive(join(outputRoot, "analysis.json"), analysis),
	writeExclusive(join(outputRoot, "results.json"), { schemaVersion: 1, experimentId, entries: comparisonResults }),
	writeExclusive(join(outputRoot, "transfer.json"), {
		schemaVersion: 1,
		experimentId,
		policy: "Only reviewed exact presentation-v2 source and unblinded semantic comparison identities transfer; comments are excluded.",
		entries: transfers,
	}),
	writeExclusive(join(outputRoot, "fresh-frontier.json"), {
		schemaVersion: 1,
		experimentId,
		definition: "Complete candidate changed set never presented with exact presentation-v2 comparison identity in the fixed registry.",
		entries: freshFrontier,
	}),
])
process.stderr.write(`Wrote compact relation presentation transfer audit ${experimentId}: ${transfers.length} transfers, ${freshFrontier.length} fresh\n`)
