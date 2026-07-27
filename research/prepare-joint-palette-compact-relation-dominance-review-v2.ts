import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { namePalette } from "./src/color-name.ts"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	NEXT_PALETTE_REVIEW_VERSION,
	nextPaletteReviewManifestId,
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
	type NextPalettePresentedPalette,
	type NextPaletteReviewEntry,
	type NextPaletteReviewManifest,
} from "./src/next-palette-review-v2.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const AUDIT_VERSION = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const CANDIDATE_VERSION = "joint-palette-compact-relation-dominance-0.1.0-development"
const CANDIDATE_EXPERIMENT_ID = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const BASELINE_ALGORITHM_VERSION = "region-graph-0.19.0"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const auditRoot = join(researchRoot, "data/experiments", AUDIT_VERSION)
const candidateRoot = join(researchRoot, "data/experiments", CANDIDATE_VERSION)
const outputRoot = join(auditRoot, "review-v2")
const authorizationPath = join(auditRoot, "review-v2-authorization.json")

const inputFiles = [
	{ key: "manifest.json", path: join(auditRoot, "manifest.json") },
	{ key: "protocol.json", path: join(auditRoot, "protocol.json") },
	{ key: "analysis.json", path: join(auditRoot, "analysis.json") },
	{ key: "results.json", path: join(auditRoot, "results.json") },
	{ key: "transfer.json", path: join(auditRoot, "transfer.json") },
	{ key: "fresh-frontier.json", path: join(auditRoot, "fresh-frontier.json") },
	{ key: `../${CANDIDATE_VERSION}/manifest.json`, path: join(candidateRoot, "manifest.json") },
	{ key: `../${CANDIDATE_VERSION}/protocol.json`, path: join(candidateRoot, "protocol.json") },
	{ key: `../${CANDIDATE_VERSION}/analysis.json`, path: join(candidateRoot, "analysis.json") },
	{ key: `../${CANDIDATE_VERSION}/results.json`, path: join(candidateRoot, "results.json") },
	{ key: `../${CANDIDATE_VERSION}/frontier.json`, path: join(candidateRoot, "frontier.json") },
	{ key: "../../results.json", path: join(researchRoot, "data/results.json") },
	{ key: "../../holdout-results.json", path: join(researchRoot, "data/holdout-results.json") },
] as const

const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/next-palette-review-v2.ts",
	"research/src/color-name.ts",
	"research/audit-joint-palette-compact-relation-dominance-review-transfer.ts",
	"research/prepare-joint-palette-compact-relation-dominance-review-v2.ts",
	"research/serve-next-palette-review-v2.ts",
	"research/analyze-next-palette-review-v2.ts",
] as const

const presentationFiles = [
	"research/next-palette-review-v2/index.html",
	"research/next-palette-review-v2/app.js",
	"research/next-palette-review-v2/styles.css",
] as const

type FreshEntry = {
	file: string
	cohort: "development" | "00"
	source: { path: string; sha256: string; bytes: number }
	changedRoles: NextPaletteReviewEntry["changedRoles"]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	selected: { changed: boolean; admitted: boolean; fieldState: string; changedSemanticBlocks: number; changedSemanticAtoms: number }
	novelty: { presentationVersion: string; neverPresentedExactlyInBoundRegistry: boolean }
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

function jsonBytes(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(resolve(projectRoot, file)))] as const)))
}

function presentPalette(palette: Palette): NextPalettePresentedPalette {
	const roles = ["background", "foreground", "surface", "accent"] as const
	const names = namePalette(roles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(roles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as NextPalettePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

async function writeExclusive(path: string, value: Uint8Array): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, value, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

if (process.argv.slice(2).length > 0) {
	throw new Error("prepare-joint-palette-compact-relation-dominance-review-v2.ts does not accept arguments")
}
for (const path of [outputRoot, authorizationPath]) {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

const inputs = Object.fromEntries(await Promise.all(inputFiles.map(async ({ key, path }) => {
	const raw = await readFile(path)
	return [key, { raw, sha256: sha256(raw) }] as const
})))
const parse = <T>(key: keyof typeof inputs): T => JSON.parse(inputs[key].raw.toString("utf8")) as T
const auditManifest = parse<Record<string, unknown> & {
	experimentId: string
	generatedAt: string
	experimentVersion: string
	protocol: { authorization: Record<string, unknown> }
}>("manifest.json")
const auditProtocol = parse<{
	experimentVersion: string
	candidateBinding: { candidateExperimentId: string; completeChangedComparisons: number }
	inferencePolicy: { commentsEnterInference: boolean; targetColorsConsumed: boolean; fixedApcaAdmissionFloor: null }
	authorization: Record<string, unknown>
}>("protocol.json")
const auditAnalysis = parse<{
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	accounting: {
		completeChangedComparisons: number
		eligibleStrongCandidateStrongerTransfers: number
		neverPresentedFreshComparisons: number
		complete: boolean
	}
	review: { authorized: boolean; freshBlindedComparisonsRequired: number; exactPositiveTransfers: number; diagnosticOnly: boolean }
	disposition: string
}>("analysis.json")
const auditResults = parse<{ experimentId: string; entries: unknown[] }>("results.json")
const transfer = parse<{ experimentId: string; entries: Array<{ sourceSha256: string; candidateQuality: string; comparison: string }> }>(
	"transfer.json",
)
const fresh = parse<{ experimentId: string; entries: FreshEntry[] }>("fresh-frontier.json")
const candidateManifest = parse<{ experimentId: string }>(`../${CANDIDATE_VERSION}/manifest.json`)
const candidateFrontier = parse<{ experimentId: string; entries: FreshEntry[] }>(`../${CANDIDATE_VERSION}/frontier.json`)
const { experimentId: _experimentId, generatedAt: _generatedAt, ...auditIdentity } = auditManifest
const recomputedAuditId = sha256(JSON.stringify(canonicalValue(auditIdentity)))
const freshSourceHashes = new Set(fresh.entries.map((entry) => entry.source.sha256))

const auditChecks = {
	identity: auditManifest.experimentId === recomputedAuditId,
	version: auditManifest.experimentVersion === AUDIT_VERSION && auditProtocol.experimentVersion === AUDIT_VERSION,
	protocolBinding: isDeepStrictEqual(auditManifest.protocol, auditProtocol),
	candidateBinding: auditProtocol.candidateBinding.candidateExperimentId === CANDIDATE_EXPERIMENT_ID &&
		candidateManifest.experimentId === CANDIDATE_EXPERIMENT_ID && candidateFrontier.experimentId === CANDIDATE_EXPERIMENT_ID,
	outputBinding: auditAnalysis.experimentId === recomputedAuditId && auditResults.experimentId === recomputedAuditId &&
		transfer.experimentId === recomputedAuditId && fresh.experimentId === recomputedAuditId,
	structural: auditAnalysis.structural.pass && auditAnalysis.structural.violationCount === 0,
	accounting: auditProtocol.candidateBinding.completeChangedComparisons === 18 && auditAnalysis.accounting.completeChangedComparisons === 18 &&
		auditAnalysis.accounting.eligibleStrongCandidateStrongerTransfers === 2 &&
		auditAnalysis.accounting.neverPresentedFreshComparisons === 16 && auditAnalysis.accounting.complete &&
		auditResults.entries.length === 18 && transfer.entries.length === 2 && fresh.entries.length === 16,
	positiveTransfers: transfer.entries.every((entry) => entry.candidateQuality === "strong" && entry.comparison === "candidate-stronger"),
	freshBinding: fresh.entries.every((entry) => entry.novelty.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION &&
		entry.novelty.neverPresentedExactlyInBoundRegistry && entry.selected.changed && entry.selected.admitted &&
		entry.selected.changedSemanticBlocks === 1 && entry.selected.fieldState !== "collapsed") &&
		fresh.entries.every((entry) => {
			const { novelty: _novelty, ...candidatePayload } = entry
			return candidateFrontier.entries.some((candidate) =>
				candidate.source.sha256 === entry.source.sha256 && isDeepStrictEqual(candidate, candidatePayload))
		}) &&
		freshSourceHashes.size === 16,
	authorization: auditAnalysis.review.authorized && auditAnalysis.review.freshBlindedComparisonsRequired === 16 &&
		auditAnalysis.review.exactPositiveTransfers === 2 && auditAnalysis.review.diagnosticOnly &&
		auditAnalysis.disposition === "presentation-v2-complete-fresh-frontier-review-authorized" &&
		auditProtocol.authorization.freshPresentationV2ReviewAuthorized === true &&
		auditProtocol.authorization.authorizedFreshComparisonCount === 16 &&
		auditProtocol.authorization.broaderReviewAuthorized === false &&
		auditProtocol.authorization.canonicalPromotionAuthorized === false &&
		auditProtocol.authorization.candidateFreezeAuthorized === false &&
		auditProtocol.authorization.extractionChangeAuthorized === false &&
		auditProtocol.authorization.reserveAccessAuthorized === false,
	inferencePolicy: !auditProtocol.inferencePolicy.commentsEnterInference && !auditProtocol.inferencePolicy.targetColorsConsumed &&
		auditProtocol.inferencePolicy.fixedApcaAdmissionFloor === null,
}
if (Object.values(auditChecks).some((value) => !value)) {
	throw new Error(`Transfer audit does not authorize review preparation: ${JSON.stringify(auditChecks)}`)
}

const development = parse<CorpusResult>("../../results.json")
const canonical00 = parse<CorpusResult>("../../holdout-results.json")
const dimensions = new Map([
	...development.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
	...canonical00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
])
for (const entry of fresh.entries) {
	if (!/^(?:images|00)\/[^/\\]+$/.test(entry.source.path) || /^(?:10|11|12|13|14)\//.test(entry.source.path) ||
		entry.file !== entry.source.path) throw new Error(`Fresh review source root is forbidden or unbound: ${entry.file}`)
	const raw = await readFile(resolve(projectRoot, entry.source.path))
	if (raw.byteLength !== entry.source.bytes || sha256(raw) !== entry.source.sha256 || !dimensions.has(entry.file)) {
		throw new Error(`Fresh review source provenance disagrees: ${entry.file}`)
	}
}

const boundArtifacts = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.sha256]))
const authorization = {
	schemaVersion: 1,
	experimentId: recomputedAuditId,
	candidateExperimentId: CANDIDATE_EXPERIMENT_ID,
	baselineAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
	candidateAlgorithmVersion: CANDIDATE_VERSION,
	authorizationBasis: "passing-provenance-bound-exact-presentation-novelty-transfer-audit",
	presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	boundArtifacts,
	review: {
		authorized: true,
		diagnosticOnly: true,
		completeFreshFrontierOnly: true,
		freshBlindedComparisons: 16,
		exactPositiveTransfers: 2,
		completeChangedComparisons: 18,
	},
	inferencePolicy: {
		commentsDoNotEnterInference: true,
		targetColorsConsumed: false,
		fixedApcaAdmissionFloor: null,
	},
	prohibitions: {
		broaderReviewAuthorized: false,
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		extractionChangeAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [] as string[],
		sourceRoots: ["images", "00"],
	},
}
const authorizationBytes = jsonBytes(authorization)
const provenance = {
	experiment: { ...boundArtifacts, "review-v2-authorization.json": sha256(authorizationBytes) },
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}
const ordered = [...fresh.entries].sort((first, second) =>
	sha256(`${recomputedAuditId}\0${first.source.sha256}`).localeCompare(sha256(`${recomputedAuditId}\0${second.source.sha256}`)))
const entries: NextPaletteReviewEntry[] = ordered.map((entry, order) => {
	const normalized = dimensions.get(entry.file)
	if (!normalized) throw new Error(`Missing canonical dimensions: ${entry.file}`)
	const baselineFirst = Number.parseInt(sha256(`${recomputedAuditId}\0${entry.source.sha256}\0assignment`).slice(0, 2), 16) % 2 === 0
	const baseline = presentPalette(entry.baseline)
	const candidate = presentPalette(entry.candidate)
	return {
		caseId: `npr-${sha256(`${recomputedAuditId}\0${entry.source.path}`).slice(0, 20)}`,
		order,
		cohort: entry.cohort === "development" ? "reviewable-development" : "curated-00",
		currentEvidenceClassification: "unknown",
		frontierSignature: `compact-relation-dominance|complete-fresh-frontier|${entry.selected.fieldState}`,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.bytes, ...normalized },
		changedRoles: entry.changedRoles,
		gradientChanged: entry.gradientChanged,
		options: baselineFirst ? { A: baseline, B: candidate } : { A: candidate, B: baseline },
		assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
	}
})
const identity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	experimentId: recomputedAuditId,
	baselineAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
	candidateAlgorithmVersion: CANDIDATE_VERSION,
	batch: { index: 1, size: entries.length, totalBatches: 1, totalCases: entries.length },
	provenance,
	entries,
}
const generatedAt = new Date().toISOString()
const reviewManifest: NextPaletteReviewManifest = {
	...identity,
	generatedAt,
	manifestId: nextPaletteReviewManifestId(identity),
}
parseNextPaletteReviewManifest(reviewManifest)
const feedback = {
	schemaVersion: 1 as const,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	manifestId: reviewManifest.manifestId,
	entries: [],
}
parseNextPaletteReviewFeedbackStore(feedback, reviewManifest)

await mkdir(outputRoot)
await writeExclusive(authorizationPath, authorizationBytes)
await Promise.all([
	writeExclusive(join(outputRoot, "plan.json"), jsonBytes({
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		status: "compact-relation-complete-fresh-frontier-review-authorized",
		experimentId: recomputedAuditId,
		candidateExperimentId: CANDIDATE_EXPERIMENT_ID,
		generatedAt,
		scope: {
			completeChangedComparisons: 18,
			freshBlindedComparisons: 16,
			exactPositiveTransfers: 2,
			totalBatches: 1,
			diagnosticOnly: true,
		},
		interpretationPolicy: {
			completePaletteQualityIsDiagnostic: true,
			pairedPreferenceTestsOnlyTheCompleteNeverPresentedFreshFrontier: true,
			commentsDoNotEnterInference: true,
			targetColorsConsumed: false,
			fixedApcaAdmissionFloor: null,
			resultsDoNotAuthorizeBroaderChangesOrPromotion: true,
		},
		manifestIds: [reviewManifest.manifestId],
	})),
	writeExclusive(join(outputRoot, "batch-01-manifest.json"), jsonBytes(reviewManifest)),
	writeExclusive(join(outputRoot, "batch-01-feedback.json"), jsonBytes(feedback)),
])
process.stderr.write(`Prepared ${entries.length} fresh compact relation presentation-v2 comparisons at ${outputRoot}\n`)
