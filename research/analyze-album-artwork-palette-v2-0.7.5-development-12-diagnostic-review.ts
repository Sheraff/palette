import { link, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ABSOLUTE_QUALITY_VALUES,
	BOUND_CASE,
	ISSUE_TAGS,
	RELATIVE_OUTCOME_VALUES,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	alternativeSide,
	canonicalJson,
	parsePrivateReviewManifest,
	sha256,
	type AbsoluteQuality,
	type IssueTag,
	type RelativeOutcome,
	type ReviewSide,
} from "./src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"

const ANALYSIS_VERSION =
	"album-artwork-palette-v2-0.7.5-development-12-diagnostic-review-analysis-1.0.0" as const
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const protocolRelativePath =
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_5_DEVELOPMENT_12_DIAGNOSTIC_REVIEW.md"
const manifestRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-manifest.private.json"
const feedbackRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-feedback.json"
const analysisRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-analysis.json"
const scriptRelativePath =
	"research/analyze-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"
const analysisPath = resolve(projectRoot, analysisRelativePath)

type StoredResponse = Readonly<{
	itemId: string
	qualityA: AbsoluteQuality
	qualityB: AbsoluteQuality
	relativeOutcome: RelativeOutcome
	issuesA: readonly IssueTag[]
	issuesB: readonly IssueTag[]
	comment: string
}>

type StoredFeedback = Readonly<{
	schemaVersion: 1
	reviewVersion: typeof REVIEW_VERSION
	contentId: string
	responses: readonly [StoredResponse]
	manifestRawSha256: string
	submittedAt: string
	submissionId: string
}>

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
		`${label} keys changed`)
}

function parseIssues(value: unknown, label: string): readonly IssueTag[] {
	assert(Array.isArray(value) && new Set(value).size === value.length &&
		value.every((entry) => typeof entry === "string" && ISSUE_TAGS.includes(entry as IssueTag)),
	`${label} is invalid`)
	return value as IssueTag[]
}

function parseFeedback(value: unknown, manifestContentId: string, manifestRawSha256: string): StoredFeedback {
	assert(isRecord(value), "Stored feedback must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "contentId", "responses", "manifestRawSha256", "submittedAt", "submissionId",
	], "Stored feedback")
	assert(value.schemaVersion === 1 && value.reviewVersion === REVIEW_VERSION && value.contentId === manifestContentId &&
		value.manifestRawSha256 === manifestRawSha256 && Array.isArray(value.responses) && value.responses.length === 1 &&
		typeof value.submittedAt === "string" && new Date(value.submittedAt).toISOString() === value.submittedAt &&
		typeof value.submissionId === "string" && /^[a-f0-9]{64}$/.test(value.submissionId),
	"Stored feedback header is invalid")
	const response = value.responses[0]
	assert(isRecord(response), "Stored response must be an object")
	exactKeys(response, ["itemId", "qualityA", "qualityB", "relativeOutcome", "issuesA", "issuesB", "comment"],
		"Stored response")
	assert(typeof response.itemId === "string" && ABSOLUTE_QUALITY_VALUES.includes(response.qualityA as AbsoluteQuality) &&
		ABSOLUTE_QUALITY_VALUES.includes(response.qualityB as AbsoluteQuality) &&
		RELATIVE_OUTCOME_VALUES.includes(response.relativeOutcome as RelativeOutcome) &&
		typeof response.comment === "string" && response.comment.length <= 2_000,
	"Stored response values are invalid")
	parseIssues(response.issuesA, "Option A issues")
	parseIssues(response.issuesB, "Option B issues")
	const feedback = value as unknown as StoredFeedback
	const { submissionId, ...identity } = feedback
	assert(submissionId === sha256(canonicalJson(identity)), "Stored feedback submission ID is stale")
	return feedback
}

function domainCounts<T extends string>(domain: readonly T[], values: readonly T[]): Record<T, number> {
	return Object.fromEntries(domain.map((value) => [value, values.filter((entry) => entry === value).length])) as
		Record<T, number>
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
	assert(sha256(protocolRaw) === "882e82336dceae3e819da02b5bb8196056951d778cc42dbda5c8f9515f93624f",
		"Bound review protocol raw hash changed")
	assert(sha256(manifestRaw) === "cb34718220eeff392241e2461d894be7899fe3f7e5907a0348a5796a3db8b19a",
		"Bound private review manifest raw hash changed")
	assert(sha256(feedbackRaw) === "7e8d6198c5e06865b650e056b0f61520fd8f53f6b695eb4d431576ba7fc0596b",
		"Bound review feedback raw hash changed")
	const manifest = parsePrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	const feedback = parseFeedback(JSON.parse(feedbackRaw.toString("utf8")), manifest.contentId, sha256(manifestRaw))
	assert(manifest.protocolId === REVIEW_PROTOCOL_ID && manifest.items.length === 1 && feedback.responses.length === 1,
		"Review denominator changed")
	const item = manifest.items[0]
	const response = feedback.responses[0]
	assert(response.itemId === item.publicItemId, "Feedback item does not match the private manifest")
	const candidateSide = alternativeSide(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	const controlSide: ReviewSide = candidateSide === "A" ? "B" : "A"
	assert(item.assignment[candidateSide] === "alternative" && item.assignment[controlSide] === "control",
		"Deterministic assignment changed")
	const candidateQuality = response[`quality${candidateSide}`]
	const controlQuality = response[`quality${controlSide}`]
	const candidateIssues = response[`issues${candidateSide}`]
	const controlIssues = response[`issues${controlSide}`]
	assert(candidateQuality === "acceptable" && controlQuality === "unacceptable" &&
		response.relativeOutcome === "candidate-stronger" &&
		canonicalJson(candidateIssues) === canonicalJson(["incomplete artwork identity"]) &&
		canonicalJson(controlIssues) === canonicalJson(["incomplete artwork identity"]),
	"Submitted descriptive result changed")

	const analysisIdentity = {
		schemaVersion: 1,
		analysisVersion: ANALYSIS_VERSION,
		analysisType: "read-only-bounded-descriptive-and-frozen-rule-reapplication",
		protocolId: manifest.protocolId,
		reviewVersion: manifest.reviewVersion,
		manifestContentId: manifest.contentId,
		submissionId: feedback.submissionId,
		bindings: {
			protocol: { path: protocolRelativePath, rawSha256: sha256(protocolRaw) },
			privateManifest: { path: manifestRelativePath, contentId: manifest.contentId, rawSha256: sha256(manifestRaw) },
			feedback: {
				path: feedbackRelativePath,
				submissionId: feedback.submissionId,
				rawSha256: sha256(feedbackRaw),
				submittedAt: feedback.submittedAt,
			},
			analysisScript: { path: scriptRelativePath, rawSha256: sha256(scriptRaw) },
		},
		denominator: {
			expectedItemCount: 1,
			receivedItemCount: 1,
			complete: true,
			caseIds: [BOUND_CASE.caseId],
		},
		counts: {
			candidateAbsoluteQuality: domainCounts(ABSOLUTE_QUALITY_VALUES, [candidateQuality]),
			controlAbsoluteQuality: domainCounts(ABSOLUTE_QUALITY_VALUES, [controlQuality]),
			relativeOutcome: domainCounts(RELATIVE_OUTCOME_VALUES, [response.relativeOutcome]),
			candidateIssues: domainCounts(ISSUE_TAGS, candidateIssues),
			controlIssues: domainCounts(ISSUE_TAGS, controlIssues),
			comments: { empty: 0, nonEmpty: 1 },
		},
		item: {
			caseId: BOUND_CASE.caseId,
			sourceSha256: BOUND_CASE.sourceSha256,
			evidence: {
				assignmentDigest: item.assignment.digest,
				candidateSide,
				controlSide,
				candidateTreatmentKey: BOUND_CASE.alternativeKey,
				candidateTreatmentRecordSha256: item.comparison.alternative.treatmentRecordSha256,
				candidatePublicSlateIndex: 1,
				controlTreatmentKey: BOUND_CASE.controlKey,
				controlTreatmentRecordSha256: item.comparison.control.treatmentRecordSha256,
				controlPublicSlateIndex: 0,
			},
			submittedResponse: {
				qualityA: response.qualityA,
				qualityB: response.qualityB,
				relativeOutcome: response.relativeOutcome,
				issuesA: response.issuesA,
				issuesB: response.issuesB,
				comment: response.comment,
			},
			unblindedResult: {
				candidateQuality,
				controlQuality,
				relativeOutcome: response.relativeOutcome,
				candidateIssues,
				controlIssues,
				comment: response.comment,
				commentSha256: sha256(response.comment),
			},
		},
		technicalInterpretations: {
			status: "not-invented-descriptive-human-evidence-is-sufficient-for-custody-classification",
			entries: [],
		},
		custodyUpdate: {
			caseId: BOUND_CASE.caseId,
			priorClass: "unresolved-after-complete-treatment-construction",
			updatedClass: "ranking-failure",
			custodyStage: "winner-selection",
			evidence: "An acceptable public-slate alternative was judged stronger than the unacceptable selected winner.",
			knownFailureStatus: "displaced-not-fully-resolved",
			limitation: "The acceptable alternative remains tagged incomplete artwork identity and the verbatim comment says it is missing black.",
		},
		mechanismSelectionUpdate: {
			severeDenominator: [
				{ caseId: "development-03", class: "discovery-semantic-failure" },
				{ caseId: "development-12", class: "ranking-failure" },
			],
			repeatedSevereFailureClassSupported: false,
			selectedFailureClass: null,
			selectedMechanism: null,
			deterministicRankingCorrectionEligible: false,
			rankingIneligibilityReasons: [
				"the reviewed retained alternative is acceptable rather than strong",
				"only one severe blocker demonstrates ranking failure",
				"the other severe blocker loses evidence before field-hypothesis proposal",
			],
			disposition: "retain-0.7.5-diagnostic-stop-no-one-factor-candidate",
		},
		limitations: {
			repeatedDevelopmentEvidence: true,
			itemCount: 1,
			populationClaim: false,
			phase4Claim: false,
			statement: "This one repeatedly exposed development source resolves a custody classification only; it is not generalization, population, protected-sample, fresh directional, or Phase 4 evidence.",
		},
		descriptiveConclusion: "The retained alternative was acceptable and stronger than the unacceptable current winner, but both were tagged incomplete artwork identity; the current winner misses yellow and the alternative misses black.",
		authorization: {
			descriptiveAnalysisComplete: true,
			mechanismRuleReapplied: true,
			candidateProtocol: false,
			candidateImplementation: false,
			candidateOutput: false,
			inferenceChange: false,
			rankingChange: false,
			candidateSupport: false,
			candidateFreeze: false,
			phase4: false,
			promotion: false,
			persistence: false,
			defaultExtractorChange: false,
			protectedOrFreshArtworkAccess: false,
			fullRoster: false,
		},
		nextAuthorizationBoundary: "Any new evidence unit, candidate protocol, inference or ranking change, candidate support, Phase 4, promotion, persistence, or default-extractor change requires separate explicit authorization.",
	}
	return { ...analysisIdentity, analysisId: sha256(canonicalJson(analysisIdentity)) }
}

async function verifyCheckedAnalysis(expected: Awaited<ReturnType<typeof buildAnalysis>>) {
	const raw = await readFile(analysisPath)
	const actual = JSON.parse(raw.toString("utf8"))
	assert(canonicalJson(actual) === canonicalJson(expected),
		"Checked diagnostic review analysis does not match independent reconstruction")
	const { analysisId, ...identity } = actual
	assert(analysisId === sha256(canonicalJson(identity)), "Checked diagnostic review analysis ID is stale")
	return { analysisId: analysisId as string, analysisRawSha256: sha256(raw), byteCount: raw.byteLength }
}

const argument = process.argv[2]
if (argument !== undefined && argument !== "--verify") throw new Error(`Unknown argument: ${argument}`)
const expected = await buildAnalysis()
let report: { mode: "created" | "verified"; analysisId: string; analysisRawSha256: string; byteCount: number }
if (argument === "--verify") {
	report = { mode: "verified", ...await verifyCheckedAnalysis(expected) }
} else {
	try {
		report = { mode: "verified", ...await verifyCheckedAnalysis(expected) }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		const bytes = await atomicExclusiveJson(analysisPath, expected)
		report = {
			mode: "created",
			analysisId: expected.analysisId,
			analysisRawSha256: sha256(bytes),
			byteCount: bytes.byteLength,
		}
	}
}
process.stdout.write(`${JSON.stringify({
	...report,
	analysisVersion: ANALYSIS_VERSION,
	itemCount: 1,
	submissionId: expected.submissionId,
	feedbackRawSha256: expected.bindings.feedback.rawSha256,
	disposition: expected.mechanismSelectionUpdate.disposition,
}, null, 2)}\n`)
