import { link, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ABSOLUTE_QUALITY_VALUES,
	BOUND_REVIEW_CASES,
	FORBIDDEN_AUTHORIZATIONS,
	ISSUE_TAGS,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	canonicalJson,
	parsePrivateReviewManifest,
	parseStoredReviewFeedback,
	sha256,
	type AbsoluteQuality,
	type IssueTag,
	type RelativeJudgment,
	type ReviewSide,
} from "./src/album-artwork-palette-v2-0.7.4-candidate-review.ts"

const ANALYSIS_VERSION = "album-artwork-palette-v2-0.7.4-candidate-review-analysis-1.0.0" as const
const RELATIVE_OUTCOMES = [
	"candidate-stronger",
	"baseline-stronger",
	"similarly-valid",
	"neither-acceptable",
	"uncertain",
] as const
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const protocolRelativePath = "research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4_CANDIDATE_REVIEW.md"
const manifestRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-manifest.private.json"
const feedbackRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-feedback.json"
const analysisRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-analysis.json"
const scriptRelativePath = "research/analyze-album-artwork-palette-v2-0.7.4-candidate-review.ts"
const analysisPath = resolve(projectRoot, analysisRelativePath)

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function domainCounts<T extends string>(domain: readonly T[], values: readonly T[]): Record<T, number> {
	return Object.fromEntries(domain.map((value) => [value, values.filter((entry) => entry === value).length])) as Record<T, number>
}

function relativeOutcome(value: RelativeJudgment, candidateSide: ReviewSide): typeof RELATIVE_OUTCOMES[number] {
	if (value === "similarly-valid" || value === "neither-acceptable" || value === "uncertain") return value
	const strongerSide = value === "a-stronger" ? "A" : "B"
	return strongerSide === candidateSide ? "candidate-stronger" : "baseline-stronger"
}

async function atomicExclusiveJson(path: string, value: unknown): Promise<Buffer> {
	const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
	const temporary = `${path}.${process.pid}.${sha256(bytes).slice(0, 12)}.tmp`
	await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Refusing to overwrite existing analysis artifact: ${path}`)
		}
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
	return bytes
}

async function buildAnalysis() {
	const [protocolRaw, manifestRaw, feedbackRaw, scriptRaw] = await Promise.all([
		readFile(resolve(projectRoot, protocolRelativePath)),
		readFile(resolve(projectRoot, manifestRelativePath)),
		readFile(resolve(projectRoot, feedbackRelativePath)),
		readFile(resolve(projectRoot, scriptRelativePath)),
	])
	assert(sha256(protocolRaw) === "9ee26ea72dc1260a66ce5f28eaf0c667554f888890fa125831e8060649e7f60f",
		"Bound review protocol raw hash changed")
	assert(sha256(manifestRaw) === "fc7fcbb3a8e85bc5228728f66be15ec6d5cc39f211fa53d91b46cf35634fe3e4",
		"Bound private review manifest raw hash changed")
	const manifest = parsePrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	const feedback = parseStoredReviewFeedback(JSON.parse(feedbackRaw.toString("utf8")), manifest)
	assert(manifest.protocolId === REVIEW_PROTOCOL_ID && manifest.reviewVersion === REVIEW_VERSION &&
		manifest.contentId === "7fcabe477a5d4e9d05a5fee128ae7faea19b3cbc453f3b2a4d27df794eeec16e",
	"Review semantic binding changed")
	assert(feedback.manifestRawSha256 === sha256(manifestRaw) && feedback.contentId === manifest.contentId &&
		feedback.responses.length === 2 && manifest.items.length === 2,
	"Feedback is not a complete submission for the bound private manifest")
	assert(manifest.analysisPlan.descriptiveCountsOnly === true && manifest.analysisPlan.technicalInterpretationsSeparate === true &&
		manifest.analysisPlan.candidateSupportAuthority === false && manifest.analysisPlan.phase4Authority === false,
	"Private manifest does not authorize this descriptive-only analysis")
	for (const key of FORBIDDEN_AUTHORIZATIONS) assert(manifest.authorization[key] === false,
		`Forbidden review authorization ${key} changed`)
	assert(canonicalJson(manifest.items.map(({ internalCaseId }) => internalCaseId)) ===
		canonicalJson(BOUND_REVIEW_CASES.map(({ caseId }) => caseId)), "The exact two-item denominator changed")

	const responseByItem = new Map(feedback.responses.map((response) => [response.itemId, response]))
	assert(responseByItem.size === 2 && manifest.items.every(({ publicItemId }) => responseByItem.has(publicItemId)),
		"Feedback item denominator is incomplete or duplicated")
	const items = manifest.items.map((item, order) => {
		const response = responseByItem.get(item.publicItemId)!
		const candidateSide: ReviewSide = item.assignment.A === "candidate" ? "A" : "B"
		const controlSide: ReviewSide = candidateSide === "A" ? "B" : "A"
		const candidateQuality = response[`quality${candidateSide}`] as AbsoluteQuality
		const controlQuality = response[`quality${controlSide}`] as AbsoluteQuality
		const candidateIssues = response[`issues${candidateSide}`] as readonly IssueTag[]
		const controlIssues = response[`issues${controlSide}`] as readonly IssueTag[]
		return {
			order,
			caseId: item.internalCaseId,
			sourceSha256: item.source.sha256,
			evidence: {
				assignmentDigest: item.assignment.digest,
				candidateSide,
				controlSide,
				candidateVersion: item.comparison.candidate.version,
				candidateTreatmentKey: item.comparison.candidate.key,
				candidateTreatmentRecordSha256: item.comparison.candidate.treatmentRecordSha256,
				controlVersion: item.comparison.control.version,
				controlTreatmentKey: item.comparison.control.key,
				controlTreatmentRecordSha256: item.comparison.control.treatmentRecordSha256,
			},
			blindedResponse: {
				qualityA: response.qualityA,
				qualityB: response.qualityB,
				relative: response.relative,
				issuesA: response.issuesA,
				issuesB: response.issuesB,
				comment: response.comment,
			},
			unblindedResult: {
				candidateQuality,
				controlQuality,
				relativeOutcome: relativeOutcome(response.relative, candidateSide),
				candidateIssues,
				controlIssues,
				comment: response.comment,
				commentSha256: sha256(response.comment),
			},
			technicalInterpretation: null,
		}
	})
	const candidateQualities = items.map(({ unblindedResult }) => unblindedResult.candidateQuality)
	const controlQualities = items.map(({ unblindedResult }) => unblindedResult.controlQuality)
	const relativeOutcomes = items.map(({ unblindedResult }) => unblindedResult.relativeOutcome)
	const candidateIssues = items.flatMap(({ unblindedResult }) => unblindedResult.candidateIssues)
	const controlIssues = items.flatMap(({ unblindedResult }) => unblindedResult.controlIssues)
	const nonEmptyCommentCount = items.filter(({ unblindedResult }) => unblindedResult.comment.length > 0).length
	const identity = {
		schemaVersion: 1,
		analysisVersion: ANALYSIS_VERSION,
		analysisType: "read-only-predeclared-descriptive",
		protocolId: manifest.protocolId,
		reviewVersion: manifest.reviewVersion,
		manifestContentId: manifest.contentId,
		submissionId: feedback.submissionId,
		bindings: {
			protocol: { path: protocolRelativePath, rawSha256: sha256(protocolRaw) },
			privateManifest: {
				path: manifestRelativePath,
				contentId: manifest.contentId,
				rawSha256: sha256(manifestRaw),
			},
			feedback: {
				path: feedbackRelativePath,
				submissionId: feedback.submissionId,
				rawSha256: sha256(feedbackRaw),
				submittedAt: feedback.submittedAt,
			},
			analysisScript: { path: scriptRelativePath, rawSha256: sha256(scriptRaw) },
		},
		denominator: {
			expectedItemCount: 2,
			receivedItemCount: feedback.responses.length,
			complete: true,
			caseIds: items.map(({ caseId }) => caseId),
		},
		counts: {
			candidateAbsoluteQuality: domainCounts(ABSOLUTE_QUALITY_VALUES, candidateQualities),
			controlAbsoluteQuality: domainCounts(ABSOLUTE_QUALITY_VALUES, controlQualities),
			relativeOutcome: domainCounts(RELATIVE_OUTCOMES, relativeOutcomes),
			candidateIssues: domainCounts(ISSUE_TAGS, candidateIssues),
			controlIssues: domainCounts(ISSUE_TAGS, controlIssues),
			comments: { empty: items.length - nonEmptyCommentCount, nonEmpty: nonEmptyCommentCount },
		},
		items,
		technicalInterpretations: {
			status: nonEmptyCommentCount === 0 ? "not-performed-no-non-empty-comments" : "not-performed-separate-step-required",
			entries: [],
		},
		limitations: {
			repeatedDevelopmentEvidence: true,
			statement: "These are two repeatedly exposed development sources selected because their closed candidate winners changed. The result is not independent generalization, population, protected-sample, fresh directional, or Phase 4 evidence.",
			sourceCount: 2,
			populationClaim: false,
			phase4Claim: false,
		},
		descriptiveConclusion: "Both closed 0.7.4 winners and both exact 0.7.2 controls were rated strong; both pairwise judgments were similarly valid; no issue tags or comments were submitted.",
		authorization: {
			descriptiveAnalysisComplete: true,
			decisionAuthority: false,
			candidateSupport: false,
			candidateFreeze: false,
			promotion: false,
			phase4: false,
			inferenceChange: false,
			rankingChange: false,
			protectedArtworkAccess: false,
			freshOrDirectionalSample: false,
			persistence: false,
			fullRoster: false,
			fullRunGo: false,
		},
		nextAuthorizationBoundary: "Any candidate-support decision, candidate freeze, Phase 4 fresh directional review, promotion, persistence, or inference/ranking change requires separate explicit user authorization.",
	}
	return { ...identity, analysisId: sha256(canonicalJson(identity)) }
}

async function verifyCheckedAnalysis(expected: Awaited<ReturnType<typeof buildAnalysis>>) {
	const raw = await readFile(analysisPath)
	const actual = JSON.parse(raw.toString("utf8"))
	assert(canonicalJson(actual) === canonicalJson(expected), "Checked review analysis does not match independently reconstructed output")
	assert(actual.analysisId === sha256(canonicalJson(Object.fromEntries(
		Object.entries(actual).filter(([key]) => key !== "analysisId"),
	))), "Checked review analysis content ID is stale")
	return { analysisId: actual.analysisId as string, analysisRawSha256: sha256(raw), byteCount: raw.byteLength }
}

const argument = process.argv[2]
if (argument !== undefined && argument !== "--verify") throw new Error(`Unknown argument: ${argument}`)
const expected = await buildAnalysis()
let report: { mode: "created" | "verified"; analysisId: string; analysisRawSha256: string; byteCount: number }
if (argument === "--verify") {
	report = { mode: "verified", ...await verifyCheckedAnalysis(expected) }
} else {
	try {
		const verified = await verifyCheckedAnalysis(expected)
		report = { mode: "verified", ...verified }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		const bytes = await atomicExclusiveJson(analysisPath, expected)
		report = { mode: "created", analysisId: expected.analysisId, analysisRawSha256: sha256(bytes), byteCount: bytes.byteLength }
	}
}
process.stdout.write(`${JSON.stringify({
	...report,
	analysisVersion: ANALYSIS_VERSION,
	itemCount: expected.denominator.receivedItemCount,
	submissionId: expected.submissionId,
	feedbackRawSha256: expected.bindings.feedback.rawSha256,
}, null, 2)}\n`)
