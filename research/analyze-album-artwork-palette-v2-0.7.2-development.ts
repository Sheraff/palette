import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type {
	Phase4Comparison,
	Phase4PrivateReviewManifest,
	Phase4ReviewPalette,
	Phase4ReviewSide,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import type { AbsoluteQualityLabel, ReviewIssueTag } from "./src/album-artwork-palette-v2-protocol.ts"

type SourceArtifact = Readonly<{
	source: Readonly<{ caseId: string; sha256: string }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		diagnostics: Readonly<{
			paretoRanking: Readonly<{
				primaryTreatmentId: string
				selectedIdentityChallengerTreatmentId: string | null
				identityChallengerQualityGuards: ReadonlyArray<Readonly<{
					challengerTreatmentId: string
					pass: boolean
					resolvedLosses: readonly unknown[]
				}>>
			}>
		}>
	}>
}>

type Aggregate = Readonly<{
	schemaVersion: number
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	sourceCount: number
	identityObligationGate?: Readonly<{
		pass: boolean
		winnerChangesFromPredecessor: readonly string[]
		failedCaseIds: readonly string[]
	}>
	cases: readonly SourceArtifact[]
}>

type ReviewCaseResult = Readonly<{
	caseId: string
	sourceSha256: string
	candidateSide: Phase4ReviewSide
	candidateQuality: AbsoluteQualityLabel
	baselineQuality?: AbsoluteQualityLabel
	predecessorQuality?: AbsoluteQualityLabel
	relativeOutcome: string
	candidateTags?: readonly ReviewIssueTag[]
	baselineTags?: readonly ReviewIssueTag[]
	predecessorTags?: readonly ReviewIssueTag[]
	commentSha256: string
}>

type ReviewAnalysis = Readonly<{
	analysisId: string
	manifestId: string
	inputHashes: Readonly<{
		manifestSha256: string
		preparationSha256: string
		feedbackSha256: string
		interpretationId: string
	}>
	caseResults?: readonly ReviewCaseResult[]
	freshReview?: Readonly<{ caseResults: readonly ReviewCaseResult[] }>
}>

type ReviewInterpretations = Readonly<{
	interpretationId: string
	entries: ReadonlyArray<Readonly<{
		caseId: string
		target: "candidate" | "baseline" | "shared"
		classes: readonly string[]
	}>>
}>

type ReviewPreparation = Readonly<{
	preparationId: string
	manifestId: string
}>

type AssessmentLedgerEntry = Readonly<{
	caseId: string
	sourceSha256: string
	candidateTreatmentKey: string
	baselineTreatmentKey: string
	candidateQuality: AbsoluteQualityLabel
	baselineQuality: AbsoluteQualityLabel
	relativeOutcome: string
	candidateTags: readonly ReviewIssueTag[]
	baselineTags: readonly ReviewIssueTag[]
	commentSha256: string
	technicalInterpretationClasses: readonly string[]
	origin: Readonly<{
		reviewVersion: string
		manifestId: string
		analysisId: string
	}>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.2-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.1-development")
const failedDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.0-development")
const baselineDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_2.md")
const postmortemPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_0_7_1_QUALITY_GUARD_POSTMORTEM.md")
const analysisPath = resolve(currentDirectory, "development-analysis.json")
const FROZEN_INPUTS = Object.freeze({
	predecessor: Object.freeze({
		implementationHash: "a24561fd38227afdc6e68928a8cffc51e2e22213591bef6680290637a635103e",
		scientificSha256: "0c3780a114cab31a0ae8384548d93c8ee49a541f70c3da214ca4527e3909d642",
		aggregateSha256: "15d31bba183f9c645327ed6f204d9be08fd80cd16092626097fe39f5af16d702",
	}),
	failed: Object.freeze({
		implementationHash: "82487ab0e22ba6e5863c310001153652f9fbe113eaef3ec98470845b17051594",
		scientificSha256: "d05f05c56aab803ed4b8b00c327e5af6bf908f154b84ada76b562fc4419f4881",
		aggregateSha256: "abccff26cb806cbaa01a6a5a2068919767b552ff3e6b1683db974746662281d9",
	}),
	baseline: Object.freeze({
		implementationHash: "3f25579340ec3dea5efaa0d8aeeceb35483610b7519fa8892a5b99a96261f315",
		scientificSha256: "f0437a4ab86f321d3723e30527ff455222ed6e5590e891e3f590ab1b920e7d52",
		aggregateSha256: "44fc6ab503208e1be29f697cb5acb0477d2a88092bd192b0068d1f9fde1bdef1",
	}),
	qualityGuardReview: Object.freeze({
		manifestSha256: "0d10397551fab94bfa44763a9c808d319703ac7877a02cda72ed6f9b67ad0132",
		preparationSha256: "a6ae2c4db0e706ddc83b8dba8d4deaca57660e05f7738d9c65d67bcae2366722",
		feedbackSha256: "3f221d945f05e258c2bab95d2860d5fab2bfb9e610caa6d26e7a048637228be7",
		interpretationsSha256: "b25e7e0f123f24fe7ba3d4c7ca5600de42bd15a893f4e56c9ed2bc3961b928dc",
		analysisSha256: "3ecaa90543f6924402e96f9766f322d2a1d74f56d9e00f12634be2b6988651eb",
	}),
	identityReview: Object.freeze({
		manifestSha256: "02ba912a0f31c4f887daa96bcdee8415933ea078e4b7b1e3f233f5bc685fea5b",
		preparationSha256: "cc5afca23ca6d1d1a4ac964745698fb45d2dd40bfaa0697ae6bf4ea1b18bbb93",
		feedbackSha256: "70adcd339ec32578dbbac4b97ae3e3ed028b89c73ce637d729e5b762f1391b63",
		interpretationsSha256: "441e8f1b591207fd54aae5af78956150881e152ca8ee86a96a6b66840b73f35c",
		analysisSha256: "2afcf69982bdf9dc924462c43bd41bd8d24db10fe2c469319ae0c8488f1897aa",
	}),
})

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function contentIdIsValid(value: Readonly<Record<string, unknown>>, idField: string): boolean {
	const id = value[idField]
	if (typeof id !== "string") return false
	const identity = { ...value }
	delete identity[idField]
	return sha256(canonicalJson(identity)) === id
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function reviewPaletteKey(palette: Phase4ReviewPalette): string {
	return [
		palette.roles.background.hex,
		palette.roles.surface.hex,
		palette.roles.foreground.hex,
		palette.roles.accent.hex,
		palette.gradient ? "gradient" : "flat",
	].join(":")
}

function normalizedRelativeOutcome(
	comparison: Phase4Comparison,
	candidateSide: Phase4ReviewSide,
): "candidate-stronger" | "baseline-stronger" | "similarly-valid" | "neither-acceptable" | "uncertain" {
	if (comparison === "similarly-valid" || comparison === "neither-acceptable" || comparison === "uncertain") {
		return comparison
	}
	const strongerSide = comparison === "a-stronger" ? "A" : "B"
	return strongerSide === candidateSide ? "candidate-stronger" : "baseline-stronger"
}

function resultRows(analysis: ReviewAnalysis): readonly ReviewCaseResult[] {
	return analysis.caseResults ?? analysis.freshReview?.caseResults ?? []
}

function buildReviewLedger(
	manifest: Phase4PrivateReviewManifest,
	analysis: ReviewAnalysis,
	interpretations: ReviewInterpretations,
	feedback: ReturnType<typeof parsePhase4ReviewFeedbackStore>,
): AssessmentLedgerEntry[] {
	const resultByCase = new Map(resultRows(analysis).map((result) => [result.caseId, result]))
	const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
	return manifest.cases.map((reviewCase) => {
		const result = resultByCase.get(reviewCase.caseId)
		const entry = feedbackByCase.get(reviewCase.caseId)
		if (!result || !entry || result.sourceSha256 !== reviewCase.source.sha256) {
			throw new Error(`Review result binding is incomplete for ${reviewCase.caseId}`)
		}
		const candidateSide: Phase4ReviewSide = reviewCase.assignment.A === "candidate" ? "A" : "B"
		const baselineSide: Phase4ReviewSide = candidateSide === "A" ? "B" : "A"
		const baselineQuality = result.baselineQuality ?? result.predecessorQuality
		const candidateTags = result.candidateTags ?? entry[`tags${candidateSide}`]
		const baselineTags = result.baselineTags ?? result.predecessorTags ?? entry[`tags${baselineSide}`]
		if (!baselineQuality || result.candidateSide !== candidateSide ||
			result.candidateQuality !== entry[`quality${candidateSide}`] ||
			baselineQuality !== entry[`quality${baselineSide}`] ||
			result.relativeOutcome.replace("predecessor-", "baseline-") !==
				normalizedRelativeOutcome(entry.comparison, candidateSide) ||
			canonicalJson(candidateTags) !== canonicalJson(entry[`tags${candidateSide}`]) ||
			canonicalJson(baselineTags) !== canonicalJson(entry[`tags${baselineSide}`]) ||
			result.commentSha256 !== sha256(entry.comment)) {
			throw new Error(`Review analysis is stale for ${reviewCase.caseId}`)
		}
		return {
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.source.sha256,
			candidateTreatmentKey: reviewPaletteKey(reviewCase.options[candidateSide]),
			baselineTreatmentKey: reviewPaletteKey(reviewCase.options[baselineSide]),
			candidateQuality: result.candidateQuality,
			baselineQuality,
			relativeOutcome: result.relativeOutcome.replace("predecessor-", "baseline-"),
			candidateTags,
			baselineTags,
			commentSha256: result.commentSha256,
			technicalInterpretationClasses: interpretations.entries
				.filter(({ caseId, target }) => caseId === reviewCase.caseId && target === "candidate")
				.flatMap(({ classes }) => classes),
			origin: {
				reviewVersion: manifest.reviewVersion,
				manifestId: manifest.manifestId,
				analysisId: analysis.analysisId,
			},
		}
	})
}

async function loadReviewBundle(
	directory: string,
	manifestName: string,
	preparationName: string,
	feedbackPath: string,
	interpretationsName: string,
	analysisName: string,
): Promise<Readonly<{ ledger: readonly AssessmentLedgerEntry[]; hashes: Readonly<Record<string, string>> }>> {
	const manifestPath = resolve(directory, manifestName)
	const preparationPath = resolve(directory, preparationName)
	const interpretationsPath = resolve(directory, interpretationsName)
	const reviewAnalysisPath = resolve(directory, analysisName)
	const [manifestRaw, preparationRaw, feedbackRaw, interpretationsRaw, analysisRaw] = await Promise.all([
		readFile(manifestPath, "utf8"),
		readFile(preparationPath, "utf8"),
		readFile(feedbackPath, "utf8"),
		readFile(interpretationsPath, "utf8"),
		readFile(reviewAnalysisPath, "utf8"),
	])
	const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
	const preparation = JSON.parse(preparationRaw) as ReviewPreparation
	const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
	const interpretations = JSON.parse(interpretationsRaw) as ReviewInterpretations
	const analysis = JSON.parse(analysisRaw) as ReviewAnalysis
	if (!contentIdIsValid(preparation as unknown as Record<string, unknown>, "preparationId") ||
		!contentIdIsValid(interpretations as unknown as Record<string, unknown>, "interpretationId") ||
		!contentIdIsValid(analysis as unknown as Record<string, unknown>, "analysisId") ||
		preparation.manifestId !== manifest.manifestId || analysis.manifestId !== manifest.manifestId ||
		analysis.inputHashes.manifestSha256 !== sha256(manifestRaw) ||
		analysis.inputHashes.preparationSha256 !== sha256(preparationRaw) ||
		analysis.inputHashes.feedbackSha256 !== sha256(feedbackRaw) ||
		analysis.inputHashes.interpretationId !== interpretations.interpretationId) {
		throw new Error(`Review bundle is stale for ${manifest.reviewVersion}`)
	}
	return {
		ledger: buildReviewLedger(manifest, analysis, interpretations, feedback),
		hashes: {
			manifestSha256: sha256(manifestRaw),
			preparationSha256: sha256(preparationRaw),
			feedbackSha256: sha256(feedbackRaw),
			interpretationsSha256: sha256(interpretationsRaw),
			analysisSha256: sha256(analysisRaw),
		},
	}
}

const currentAggregatePath = resolve(currentDirectory, "aggregate.json")
const currentSummaryPath = resolve(currentDirectory, "summary.json")
const predecessorAggregatePath = resolve(predecessorDirectory, "aggregate.json")
const failedAggregatePath = resolve(failedDirectory, "aggregate.json")
const baselineAggregatePath = resolve(baselineDirectory, "aggregate.json")
const [
	currentRaw,
	summaryRaw,
	predecessorRaw,
	failedRaw,
	baselineRaw,
	protocolRaw,
	postmortemRaw,
	qualityGuardReview,
	identityReview,
] = await Promise.all([
	readFile(currentAggregatePath, "utf8"),
	readFile(currentSummaryPath, "utf8"),
	readFile(predecessorAggregatePath, "utf8"),
	readFile(failedAggregatePath, "utf8"),
	readFile(baselineAggregatePath, "utf8"),
	readFile(protocolPath, "utf8"),
	readFile(postmortemPath, "utf8"),
	loadReviewBundle(
		predecessorDirectory,
		"quality-guard-review-manifest.private.json",
		"quality-guard-review-preparation.json",
		resolve(moduleDirectory, "data/album-artwork-palette-v2-0.7.1-quality-guard-feedback.json"),
		"quality-guard-technical-interpretations.json",
		"quality-guard-review-analysis.json",
	),
	loadReviewBundle(
		failedDirectory,
		"identity-obligation-review-manifest.private.json",
		"identity-obligation-review-preparation.json",
		resolve(moduleDirectory, "data/album-artwork-palette-v2-0.7.0-identity-obligation-feedback.json"),
		"identity-obligation-technical-interpretations.json",
		"identity-obligation-review-analysis.json",
	),
])
const current = JSON.parse(currentRaw) as Aggregate
const summary = JSON.parse(summaryRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const failed = JSON.parse(failedRaw) as Aggregate
const baseline = JSON.parse(baselineRaw) as Aggregate
const aggregates = [current, predecessor, failed, baseline]
if (current.candidateVersion !== "album-artwork-first-principles-0.7.2" ||
	predecessor.candidateVersion !== "album-artwork-first-principles-0.7.1" ||
	failed.candidateVersion !== "album-artwork-first-principles-0.7.0" ||
	baseline.candidateVersion !== "album-artwork-first-principles-0.6.0" ||
	sha256(predecessorRaw) !== FROZEN_INPUTS.predecessor.aggregateSha256 ||
	predecessor.implementationHash !== FROZEN_INPUTS.predecessor.implementationHash ||
	predecessor.scientificSha256 !== FROZEN_INPUTS.predecessor.scientificSha256 ||
	sha256(failedRaw) !== FROZEN_INPUTS.failed.aggregateSha256 ||
	failed.implementationHash !== FROZEN_INPUTS.failed.implementationHash ||
	failed.scientificSha256 !== FROZEN_INPUTS.failed.scientificSha256 ||
	sha256(baselineRaw) !== FROZEN_INPUTS.baseline.aggregateSha256 ||
	baseline.implementationHash !== FROZEN_INPUTS.baseline.implementationHash ||
	baseline.scientificSha256 !== FROZEN_INPUTS.baseline.scientificSha256 ||
	canonicalJson(qualityGuardReview.hashes) !== canonicalJson(FROZEN_INPUTS.qualityGuardReview) ||
	canonicalJson(identityReview.hashes) !== canonicalJson(FROZEN_INPUTS.identityReview) ||
	aggregates.some((aggregate) => aggregate.sourceCount !== 28 || aggregate.cases.length !== 28 ||
		aggregate.developmentManifestId !== current.developmentManifestId ||
		new Set(aggregate.cases.map(({ source }) => source.caseId)).size !== aggregate.cases.length) ||
	current.implementationHash !== summary.implementationHash || current.scientificSha256 !== summary.scientificSha256 ||
	current.identityObligationGate?.pass !== true || current.identityObligationGate.failedCaseIds.length !== 0) {
	throw new Error("The 0.7.2 development artifacts are not eligible for transfer analysis")
}

const byCase = (aggregate: Aggregate): Map<string, SourceArtifact> =>
	new Map(aggregate.cases.map((artifact) => [artifact.source.caseId, artifact]))
const predecessorByCase = byCase(predecessor)
const failedByCase = byCase(failed)
const baselineByCase = byCase(baseline)
const comparison = (aggregate: Aggregate) => {
	const priorByCase = byCase(aggregate)
	const changedCaseIds = current.cases.filter((artifact) => {
		const prior = priorByCase.get(artifact.source.caseId)
		if (!prior || prior.source.sha256 !== artifact.source.sha256) {
			throw new Error(`Comparison source binding failed for ${artifact.source.caseId}`)
		}
		return treatmentKey(artifact.extraction.winner) !== treatmentKey(prior.extraction.winner)
	}).map(({ source }) => source.caseId)
	return {
		version: aggregate.candidateVersion,
		exactMatchCount: current.cases.length - changedCaseIds.length,
		changedCaseIds,
	}
}
const baselineComparison = comparison(baseline)
const failedComparison = comparison(failed)
const predecessorComparison = comparison(predecessor)
const predecessorChangesAreGuardOnly = predecessorComparison.changedCaseIds.every((caseId) => {
	const artifact = byCase(current).get(caseId)!
	const prior = predecessorByCase.get(caseId)!
	const baselineArtifact = baselineByCase.get(caseId)!
	return treatmentKey(artifact.extraction.winner) === treatmentKey(baselineArtifact.extraction.winner) &&
		prior.extraction.diagnostics.paretoRanking.selectedIdentityChallengerTreatmentId !== null &&
		artifact.extraction.diagnostics.paretoRanking.identityChallengerQualityGuards.some((evaluation) =>
			evaluation.challengerTreatmentId === prior.extraction.diagnostics.paretoRanking.primaryTreatmentId &&
			!evaluation.pass && evaluation.resolvedLosses.length > 0)
})
if (!predecessorChangesAreGuardOnly || canonicalJson(predecessorComparison.changedCaseIds) !==
	canonicalJson(current.identityObligationGate?.winnerChangesFromPredecessor ?? [])) {
	throw new Error("A 0.7.2 winner change is not attributable to the complete-domain guard")
}

const ledger = [...qualityGuardReview.ledger, ...identityReview.ledger]
const baselineDelta = current.cases.filter((artifact) => {
	const baselineArtifact = baselineByCase.get(artifact.source.caseId)!
	return treatmentKey(artifact.extraction.winner) !== treatmentKey(baselineArtifact.extraction.winner)
})
const transfers = baselineDelta.map((artifact) => {
	const baselineArtifact = baselineByCase.get(artifact.source.caseId)!
	const candidateKey = treatmentKey(artifact.extraction.winner)
	const baselineKey = treatmentKey(baselineArtifact.extraction.winner)
	const matches = ledger.filter((assessment) => assessment.sourceSha256 === artifact.source.sha256 &&
		assessment.candidateTreatmentKey === candidateKey && assessment.baselineTreatmentKey === baselineKey)
	if (matches.length !== 1) return null
	const assessment = matches[0]
	return {
		caseId: artifact.source.caseId,
		sourceSha256: artifact.source.sha256,
		candidateTreatmentKeySha256: sha256(candidateKey),
		baselineTreatmentKeySha256: sha256(baselineKey),
		candidateQuality: assessment.candidateQuality,
		baselineQuality: assessment.baselineQuality,
		relativeOutcome: assessment.relativeOutcome,
		candidateTags: assessment.candidateTags,
		baselineTags: assessment.baselineTags,
		commentSha256: assessment.commentSha256,
		technicalInterpretationClasses: assessment.technicalInterpretationClasses,
		origin: assessment.origin,
	}
})
const transferred = transfers.filter((transfer): transfer is NonNullable<typeof transfer> => transfer !== null)
const freshCaseIds = baselineDelta.filter((_artifact, index) => transfers[index] === null).map(({ source }) => source.caseId)
const positive = (quality: AbsoluteQualityLabel): boolean => quality === "strong" || quality === "acceptable"
const transferGate = {
	allBaselineDeltaTreatmentsExactlyAssessed: transferred.length === baselineDelta.length,
	everyTransferredCandidateStrongOrAcceptable: transferred.every(({ candidateQuality }) => positive(candidateQuality)),
	noTransferredBaselineStronger: transferred.every(({ relativeOutcome }) => relativeOutcome !== "baseline-stronger"),
	noTransferredCandidateFailureClass: transferred.every(({ technicalInterpretationClasses }) =>
		technicalInterpretationClasses.length === 0),
	noFreshReviewCases: freshCaseIds.length === 0,
}
const gatePass = current.identityObligationGate.pass && Object.values(transferGate).every(Boolean)
if (!gatePass) throw new Error("The 0.7.2 transfer-only development gate failed")

const priorWinnerKeysByCase = new Map<string, Set<string>>()
for (const aggregate of [baseline, failed, predecessor]) {
	for (const artifact of aggregate.cases) {
		const keys = priorWinnerKeysByCase.get(artifact.source.caseId) ?? new Set<string>()
		keys.add(treatmentKey(artifact.extraction.winner))
		priorWinnerKeysByCase.set(artifact.source.caseId, keys)
	}
}
const novelWinnerCaseIds = current.cases.filter((artifact) =>
	!priorWinnerKeysByCase.get(artifact.source.caseId)?.has(treatmentKey(artifact.extraction.winner)))
	.map(({ source }) => source.caseId)
if (novelWinnerCaseIds.length !== 0) throw new Error("The transfer-only analysis found a novel 0.7.2 winner")

const analysisWithoutId = {
	schemaVersion: 1,
	candidateVersion: current.candidateVersion,
	implementationHash: current.implementationHash,
	scientificSha256: current.scientificSha256,
	developmentManifestId: current.developmentManifestId,
	qualityBaselineVersion: baseline.candidateVersion,
	failedPredecessorVersion: failed.candidateVersion,
	immediatePredecessorVersion: predecessor.candidateVersion,
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		currentSummarySha256: sha256(summaryRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		failedAggregateSha256: sha256(failedRaw),
		baselineAggregateSha256: sha256(baselineRaw),
		protocolSha256: sha256(protocolRaw),
		postmortemSha256: sha256(postmortemRaw),
		qualityGuardReview: qualityGuardReview.hashes,
		identityReview: identityReview.hashes,
	},
	winnerComparisons: {
		qualityBaseline: baselineComparison,
		failedPredecessor: failedComparison,
		immediatePredecessor: predecessorComparison,
		novelWinnerCaseIds,
	},
	mechanicalGate: current.identityObligationGate,
	baselineDelta: {
		exactBaselineMatchCount: current.sourceCount - baselineDelta.length,
		changedFromBaselineCount: baselineDelta.length,
		transferredAssessmentCount: transferred.length,
		freshReviewCaseCount: freshCaseIds.length,
		freshCaseIds,
		transferredAssessments: transferred,
	},
	transferGate,
	gatePass,
	disposition: "complete-quality-domain-development-gate-passed-no-novel-review-cases",
	authorization: {
		futureSample: false,
		phase5: false,
		promotion: false,
		persistence: false,
		fullRoster: false,
	},
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(analysisPath, analysis)
process.stdout.write(`${JSON.stringify({
	winnerComparisons: analysis.winnerComparisons,
	baselineDelta: {
		exactBaselineMatchCount: analysis.baselineDelta.exactBaselineMatchCount,
		transferredAssessmentCount: analysis.baselineDelta.transferredAssessmentCount,
		freshReviewCaseCount: analysis.baselineDelta.freshReviewCaseCount,
	},
	gatePass,
	disposition: analysis.disposition,
})}\n`)
