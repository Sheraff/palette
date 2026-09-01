import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	type Phase4Comparison,
	type Phase4ReviewSide,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import type { AbsoluteQualityLabel, ReviewIssueTag } from "./src/album-artwork-palette-v2-protocol.ts"

type Preparation = Readonly<{
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	failedPredecessorVersion: string
	baselineVersion: string
	developmentManifestId: string
	changedFromFailedCount: number
	changedFromBaselineCount: number
	exactBaselineMatchCount: number
	transferredExactReviewAssessments: ReadonlyArray<Readonly<{
		caseId: string
		sourceSha256: string
		candidateQuality: AbsoluteQualityLabel
		predecessorQuality: AbsoluteQualityLabel
		relativeOutcome: string
	}>>
	freshReviewCaseCount: number
	candidateSideCounts: Readonly<{ A: number; B: number }>
	inputHashes: Readonly<{
		currentAggregateSha256: string
		failedAggregateSha256: string
		baselineAggregateSha256: string
		currentSummarySha256: string
		priorReviewManifestSha256: string
		priorReviewAnalysisSha256: string
		reviewProtocolSha256: string
	}>
}>

type SourceArtifact = Readonly<{
	source: Readonly<{ caseId: string; sha256: string }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{
			paretoRanking: Readonly<{
				rankingPriorityBlocks: readonly string[]
				qualityGuardBlocks: readonly string[]
				qualityIncumbentTreatmentId: string
				selectedIdentityChallengerTreatmentId: string | null
				selectedIdentityChallengerQualityGuard: null | Readonly<{ pass: boolean }>
			}>
			identityObligationGraph: Readonly<{
				winnerExplanation: Readonly<{ selectionReason: string }>
			}>
		}>
	}>
}>

type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly SourceArtifact[]
}>

type TechnicalInterpretation = Readonly<{
	caseId: string
	target: "candidate" | "baseline" | "shared"
	commentSha256: string
	classes: readonly string[]
	rationale: string
	uncertain: boolean
	evidence: Readonly<Record<string, unknown>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.1-development")
const failedDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.0-development")
const baselineDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const manifestPath = resolve(experimentDirectory, "quality-guard-review-manifest.private.json")
const preparationPath = resolve(experimentDirectory, "quality-guard-review-preparation.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.7.1-quality-guard-feedback.json")
const currentAggregatePath = resolve(experimentDirectory, "aggregate.json")
const failedAggregatePath = resolve(failedDirectory, "aggregate.json")
const baselineAggregatePath = resolve(baselineDirectory, "aggregate.json")
const summaryPath = resolve(experimentDirectory, "summary.json")
const priorManifestPath = resolve(failedDirectory, "identity-obligation-review-manifest.private.json")
const priorAnalysisPath = resolve(failedDirectory, "identity-obligation-review-analysis.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_1_QUALITY_GUARD_REVIEW.md")
const analysisPath = resolve(experimentDirectory, "quality-guard-review-analysis.json")
const interpretationsPath = resolve(experimentDirectory, "quality-guard-technical-interpretations.json")
const EVIDENCE_RESOLUTION = 0.04

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function counts<T extends string>(values: readonly T[]): Record<T, number> {
	return Object.fromEntries([...new Set(values)].sort().map((value) =>
		[value, values.filter((candidate) => candidate === value).length])) as Record<T, number>
}

function relativeOutcome(
	comparison: Phase4Comparison,
	candidateSide: Phase4ReviewSide,
): "candidate-stronger" | "baseline-stronger" | "similarly-valid" | "neither-acceptable" | "uncertain" {
	if (comparison === "similarly-valid" || comparison === "neither-acceptable" || comparison === "uncertain") return comparison
	const strongerSide = comparison === "a-stronger" ? "A" : "B"
	return strongerSide === candidateSide ? "candidate-stronger" : "baseline-stronger"
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / EVIDENCE_RESOLUTION)
}

const [
	manifestRaw,
	preparationRaw,
	feedbackRaw,
	currentRaw,
	failedRaw,
	baselineRaw,
	summaryRaw,
	priorManifestRaw,
	priorAnalysisRaw,
	protocolRaw,
] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(preparationPath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(currentAggregatePath, "utf8"),
	readFile(failedAggregatePath, "utf8"),
	readFile(baselineAggregatePath, "utf8"),
	readFile(summaryPath, "utf8"),
	readFile(priorManifestPath, "utf8"),
	readFile(priorAnalysisPath, "utf8"),
	readFile(protocolPath, "utf8"),
])
const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
const preparation = JSON.parse(preparationRaw) as Preparation
const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
const current = JSON.parse(currentRaw) as Aggregate
if (preparation.manifestId !== manifest.manifestId || preparation.freshReviewCaseCount !== 3 ||
	preparation.candidateSideCounts.A !== 2 || preparation.candidateSideCounts.B !== 1 ||
	preparation.inputHashes.currentAggregateSha256 !== sha256(currentRaw) ||
	preparation.inputHashes.failedAggregateSha256 !== sha256(failedRaw) ||
	preparation.inputHashes.baselineAggregateSha256 !== sha256(baselineRaw) ||
	preparation.inputHashes.currentSummarySha256 !== sha256(summaryRaw) ||
	preparation.inputHashes.priorReviewManifestSha256 !== sha256(priorManifestRaw) ||
	preparation.inputHashes.priorReviewAnalysisSha256 !== sha256(priorAnalysisRaw) ||
	preparation.inputHashes.reviewProtocolSha256 !== sha256(protocolRaw) ||
	current.candidateVersion !== preparation.candidateVersion ||
	current.implementationHash !== preparation.implementationHash ||
	current.scientificSha256 !== preparation.scientificSha256 ||
	current.developmentManifestId !== preparation.developmentManifestId) {
	throw new Error("Quality-guard review preparation binding is stale")
}
if (feedback.entries.length !== manifest.cases.length ||
	new Set(feedback.entries.map(({ caseId }) => caseId)).size !== manifest.cases.length) {
	throw new Error("Quality-guard review feedback is incomplete")
}

const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const freshCaseResults = manifest.cases.map((reviewCase) => {
	const entry = feedbackByCase.get(reviewCase.caseId)
	if (!entry) throw new Error(`Missing feedback for ${reviewCase.caseId}`)
	const candidateSide: Phase4ReviewSide = reviewCase.assignment.A === "candidate" ? "A" : "B"
	const baselineSide: Phase4ReviewSide = candidateSide === "A" ? "B" : "A"
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		candidateSide,
		candidateQuality: entry[`quality${candidateSide}`] as AbsoluteQualityLabel,
		baselineQuality: entry[`quality${baselineSide}`] as AbsoluteQualityLabel,
		relativeOutcome: relativeOutcome(entry.comparison, candidateSide),
		candidateTags: entry[`tags${candidateSide}`] as readonly ReviewIssueTag[],
		baselineTags: entry[`tags${baselineSide}`] as readonly ReviewIssueTag[],
		comment: entry.comment,
		commentSha256: sha256(entry.comment),
		submittedAt: entry.submittedAt,
	}
})

const positive = (quality: AbsoluteQualityLabel): boolean => quality === "strong" || quality === "acceptable"
const failedFreshResults = freshCaseResults.filter(({ candidateQuality, relativeOutcome: outcome }) =>
	!positive(candidateQuality) || outcome === "baseline-stronger")
const interpretations: TechnicalInterpretation[] = failedFreshResults.flatMap((result) => {
	const artifact = current.cases.find(({ source }) => source.caseId === result.caseId)
	if (!artifact || artifact.source.sha256 !== result.sourceSha256) {
		throw new Error(`Failed review case ${result.caseId} is not bound to the current aggregate`)
	}
	const ranking = artifact.extraction.diagnostics.paretoRanking
	const incumbent = artifact.extraction.alternatives.find(({ id }) => id === ranking.qualityIncumbentTreatmentId)
	const challenger = artifact.extraction.winner
	if (!incumbent || ranking.selectedIdentityChallengerTreatmentId !== challenger.id ||
		ranking.selectedIdentityChallengerQualityGuard?.pass !== true ||
		artifact.extraction.diagnostics.identityObligationGraph.winnerExplanation.selectionReason !==
			"quality-guarded-identity-challenger-selected") {
		throw new Error(`Failed review case ${result.caseId} is not a quality-guarded identity challenger`)
	}
	const omittedResolvedLosses = ranking.rankingPriorityBlocks
		.filter((block) => !ranking.qualityGuardBlocks.includes(block))
		.map((block) => {
			const key = block as keyof CompletePaletteTreatment["scores"]
			return {
				block,
				incumbentEvidenceLevel: evidenceLevel(incumbent.scores[key] - incumbent.scores.generatedPenalty),
				challengerEvidenceLevel: evidenceLevel(challenger.scores[key] - challenger.scores.generatedPenalty),
			}
		})
		.filter(({ incumbentEvidenceLevel, challengerEvidenceLevel }) => challengerEvidenceLevel < incumbentEvidenceLevel)
	if (omittedResolvedLosses.length === 0) {
		throw new Error(`Failed review case ${result.caseId} has no resolved loss outside the declared guard`)
	}
	return [
		{
			caseId: result.caseId,
			target: "candidate" as const,
			commentSha256: result.commentSha256,
			classes: ["identity-quality-guard-incomplete-comparison-domain"],
			rationale: "The selected identity challenger passed every declared guard block but was baseline-inferior in review while taking resolved losses in existing ordinary ranking dimensions omitted from the guard.",
			uncertain: false,
			evidence: {
				qualityIncumbentTreatmentId: incumbent.id,
				selectedIdentityChallengerTreatmentId: challenger.id,
				declaredQualityGuardBlocks: ranking.qualityGuardBlocks,
				omittedResolvedLosses,
			},
		},
		{
			caseId: result.caseId,
			target: "shared" as const,
			commentSha256: result.commentSha256,
			classes: ["persistent-foreground-role-identity-misalignment", "persistent-field-chromatic-identity-misalignment"],
			rationale: "The comment repeats previously documented product symptoms for both options: foreground role identity and the artwork's major-hue field transition remain incomplete. These symptoms document the stop decision but are not implementation targets.",
			uncertain: false,
			evidence: {
				candidateIncompleteIdentityTagged: result.candidateTags.includes("incomplete artwork identity"),
				baselineIncompleteIdentityTagged: result.baselineTags.includes("incomplete artwork identity"),
			},
		},
	]
})
const classCounts = counts(interpretations.flatMap(({ classes }) => classes))
const repeatedNewSystemicClasses = Object.entries(classCounts)
	.filter(([name, count]) => name.startsWith("identity-quality-guard-") && count > 1)
	.map(([name]) => name)

const candidateQualityCounts = counts(freshCaseResults.map(({ candidateQuality }) => candidateQuality))
const baselineQualityCounts = counts(freshCaseResults.map(({ baselineQuality }) => baselineQuality))
const relativeCounts = counts(freshCaseResults.map(({ relativeOutcome: outcome }) => outcome))
const candidatePositiveCount = freshCaseResults.filter(({ candidateQuality }) => positive(candidateQuality)).length
const baselinePositiveCount = freshCaseResults.filter(({ baselineQuality }) => positive(baselineQuality)).length
const candidateIncompleteIdentityTagCount = freshCaseResults.filter(({ candidateTags }) =>
	 candidateTags.includes("incomplete artwork identity")).length
const baselineIncompleteIdentityTagCount = freshCaseResults.filter(({ baselineTags }) =>
	baselineTags.includes("incomplete artwork identity")).length
const transferredPositiveCount = preparation.transferredExactReviewAssessments.filter(({ candidateQuality }) =>
	positive(candidateQuality)).length
const gate = {
	everyFreshCandidateStrongOrAcceptable: {
		pass: candidatePositiveCount === freshCaseResults.length,
		candidatePositiveCount,
		required: freshCaseResults.length,
	},
	noFreshBaselineStronger: {
		pass: (relativeCounts["baseline-stronger"] ?? 0) === 0,
		baselineStronger: relativeCounts["baseline-stronger"] ?? 0,
	},
	candidateIncompleteIdentityDoesNotExceedBaseline: {
		pass: candidateIncompleteIdentityTagCount <= baselineIncompleteIdentityTagCount,
		candidate: candidateIncompleteIdentityTagCount,
		baseline: baselineIncompleteIdentityTagCount,
	},
	transferredExactTreatmentRemainsPositive: {
		pass: transferredPositiveCount === preparation.transferredExactReviewAssessments.length,
		positiveCount: transferredPositiveCount,
		required: preparation.transferredExactReviewAssessments.length,
	},
	noRepeatedNewSystemicFailureClass: {
		pass: repeatedNewSystemicClasses.length === 0,
		repeatedClasses: repeatedNewSystemicClasses,
	},
}
const gatePass = Object.values(gate).every(({ pass }) => pass)
const interpretationsWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	entries: interpretations,
	classCounts,
	repeatedNewSystemicClasses,
}
const interpretationArtifact = {
	...interpretationsWithoutId,
	interpretationId: sha256(canonicalJson(interpretationsWithoutId)),
}
const analysisWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: preparation.candidateVersion,
	implementationHash: preparation.implementationHash,
	scientificSha256: preparation.scientificSha256,
	failedPredecessorVersion: preparation.failedPredecessorVersion,
	baselineVersion: preparation.baselineVersion,
	developmentManifestId: preparation.developmentManifestId,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		preparationSha256: sha256(preparationRaw),
		feedbackSha256: sha256(feedbackRaw),
		interpretationId: interpretationArtifact.interpretationId,
	},
	developmentDelta: {
		exactBaselineMatchCount: preparation.exactBaselineMatchCount,
		changedFromBaselineCount: preparation.changedFromBaselineCount,
		changedFromFailedCount: preparation.changedFromFailedCount,
		freshReviewCaseCount: preparation.freshReviewCaseCount,
		transferredReviewCaseCount: preparation.transferredExactReviewAssessments.length,
	},
	freshReview: {
		candidateQualityCounts,
		baselineQualityCounts,
		candidatePositiveCount,
		baselinePositiveCount,
		relativeCounts,
		candidateIncompleteIdentityTagCount,
		baselineIncompleteIdentityTagCount,
		caseResults: freshCaseResults,
	},
	transferredExactReviewAssessments: preparation.transferredExactReviewAssessments,
	gate,
	gatePass,
	disposition: gatePass
		? "quality-guard-development-review-passed-postmortem-only"
		: "quality-guard-mechanics-passed-human-development-gate-failed-revise-comparison-domain",
	authorization: {
		futureSample: false,
		phase5: false,
		promotion: false,
		persistence: false,
		fullRoster: false,
	},
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await Promise.all([
	atomicJson(interpretationsPath, interpretationArtifact),
	atomicJson(analysisPath, analysis),
])
process.stdout.write(`${JSON.stringify({
	candidateQualityCounts,
	baselineQualityCounts,
	relativeCounts,
	gate,
	gatePass,
	disposition: analysis.disposition,
})}\n`)
