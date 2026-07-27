import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { buildCandidateComparisonReport } from "./src/candidate-comparison.ts"
import { validateCandidateArtifacts } from "./src/candidate-validation.ts"
import {
	acceptedCandidates,
	curationProgress,
	validateCurationStore,
	type CurationStore,
} from "./src/corpus-curation.ts"
import {
	computeSemanticResultsSha256,
	migrateFrozenSelectionManifest,
	selectionTracks,
	validateSelectionManifest,
	type SelectionManifest,
} from "./src/corpus-selection.ts"
import type { CorpusResult } from "./src/types.ts"

type AbsoluteFeedbackStore = {
	schemaVersion: 3
	manifestId: string
	algorithmVersion: string
	semanticResultsSha256: string
	presentationVersion: 1
	entries: Array<{
		image: string
		shippable: boolean
		reasons: string[]
		note: string
		decidedAt: string
	}>
}

type ReserveAnalysis = {
	protocolId: string
	candidateAlgorithmVersion: string
	summary: {
		reviewed: number
		materialChanges: number
		candidatePreferred: number
		baselinePreferred: number
		similarlyValid: number
		neitherAcceptable: number
		weakOrWorseCandidate: number
	}
	decision: { promotionEligible: boolean }
}

const baselineVersion = "region-graph-0.17.0"
const candidateVersion = "region-graph-0.19.0"
const reviewedVersion = "region-chromatic-role-0.1.0-poc.10"
const expectedAcceptedChanges = new Set([
	"00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg",
	"00/ab67616d0000b273000064c47077c5d50085297f.jpg",
	"00/ab67616d0000b273000082b6e9ba2855c904fd26.jpg",
])
const expectedUnselectedChanges = new Set([
	"00/ab67616d00001e020000595ccfa3cb070cc761e2.jpg",
	"00/ab67616d00001e020000d55460e8982bda5cc695.jpg",
	"00/ab67616d0000b27300000ee5a62175fc8d58e0af.jpg",
	"00/ab67616d0000b27300004cb6234ff5606b29e27d.jpg",
])

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const dataRoot = join(researchRoot, "data")
const roundsRoot = join(dataRoot, "rounds")
const arguments_ = process.argv.slice(2)
const dryRun = arguments_.includes("--dry-run")
const positional = arguments_.filter((argument) => argument !== "--dry-run")
if (positional.length !== 1 || arguments_.length !== positional.length + (dryRun ? 1 : 0)) {
	throw new Error("Usage: promote-chromatic-role.ts [--dry-run] <candidate-dir>")
}
const candidateRoot = isAbsolute(positional[0]) ? resolve(positional[0]) : resolve(projectRoot, positional[0])
const reviewedRoot = join(dataRoot, "candidates", reviewedVersion)
const reserveRoot = join(dataRoot, "experiments", "chromatic-role-reserve-validation-0.8.0-0f")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function json(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function parse<T>(source: Buffer): T {
	return JSON.parse(source.toString("utf8")) as T
}

function scientificPayload(corpus: CorpusResult): unknown {
	return corpus.entries.map((entry) => ({
		file: entry.file,
		kind: entry.kind,
		review: entry.review,
		width: entry.width,
		height: entry.height,
		extraction: {
			width: entry.extraction.width,
			height: entry.extraction.height,
			methods: entry.extraction.methods,
			candidates: entry.extraction.candidates,
			diagnostics: {
				regionCount: entry.extraction.diagnostics.regionCount,
				candidateCount: entry.extraction.diagnostics.candidateCount,
			},
		},
	}))
}

function requireExactSet(actual: readonly string[], expected: ReadonlySet<string>, label: string): void {
	const values = new Set(actual)
	if (values.size !== expected.size || [...values].some((value) => !expected.has(value))) {
		throw new Error(`${label} does not match the frozen POC.10 transition`)
	}
}

function validateAbsoluteFeedback(
	store: AbsoluteFeedbackStore,
	selection: SelectionManifest,
	curation: CurationStore,
): void {
	const accepted = new Set(acceptedCandidates(selection, curation).map((entry) => entry.file))
	if (store.schemaVersion !== 3 || store.manifestId !== selection.manifestId ||
		store.algorithmVersion !== selection.algorithmVersion ||
		store.semanticResultsSha256 !== selection.semanticResultsSha256 || store.presentationVersion !== 1 ||
		store.entries.length !== accepted.size || store.entries.some((entry) => !accepted.has(entry.image)) ||
		new Set(store.entries.map((entry) => entry.image)).size !== store.entries.length) {
		throw new Error("Absolute feedback does not match the frozen reviewed corpus")
	}
}

async function missing(path: string): Promise<boolean> {
	try {
		await access(path)
		return false
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true
		throw error
	}
}

async function exclusiveWrite(path: string, source: Buffer): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, source, { flag: "wx" })
	try {
		await link(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

async function replaceAll(targets: Array<{ path: string; source: Buffer }>): Promise<void> {
	const temporaries: string[] = []
	const rollbacks = targets.map((target) =>
		join(dirname(target.path), `.${basename(target.path)}.${process.pid}.${randomUUID()}.rollback`))
	let replaced = 0
	try {
		for (const target of targets) {
			const temporary = `${target.path}.${process.pid}.${randomUUID()}.tmp`
			await writeFile(temporary, target.source, { flag: "wx" })
			temporaries.push(temporary)
		}
		for (const [index, target] of targets.entries()) await link(target.path, rollbacks[index])
		for (const [index, target] of targets.entries()) {
			await rename(temporaries[index], target.path)
			replaced++
		}
	} catch (error) {
		for (let index = replaced - 1; index >= 0; index--) await rename(rollbacks[index], targets[index].path)
		throw error
	} finally {
		await Promise.all([...temporaries, ...rollbacks].map((path) => rm(path, { force: true }).catch(() => undefined)))
	}
}

const canonicalPaths = {
	results: join(dataRoot, "results.json"),
	holdout: join(dataRoot, "holdout-results.json"),
	selection: join(dataRoot, "selection.json"),
	curation: join(dataRoot, "curation.json"),
	absolute: join(dataRoot, "absolute-feedback.json"),
	summary: join(dataRoot, "holdout-summary.json"),
	robustness: join(dataRoot, "robustness.json"),
}
const candidatePaths = {
	results: join(candidateRoot, "results.json"),
	holdout: join(candidateRoot, "holdout-results.json"),
	summary: join(candidateRoot, "holdout-summary.json"),
	robustness: join(candidateRoot, "robustness.json"),
}
const reviewedPaths = {
	results: join(reviewedRoot, "results.json"),
	holdout: join(reviewedRoot, "holdout-results.json"),
}
const sources = Object.fromEntries(await Promise.all([
	...Object.entries(canonicalPaths),
	...Object.entries(candidatePaths).map(([key, path]) => [`candidate-${key}`, path] as const),
	...Object.entries(reviewedPaths).map(([key, path]) => [`reviewed-${key}`, path] as const),
	["reserve-analysis", join(reserveRoot, "analysis.json")],
].map(async ([key, path]) => [key, await readFile(path)] as const)))

const baselineResults = parse<CorpusResult>(sources.results)
const baselineHoldout = parse<CorpusResult>(sources.holdout)
const candidateResults = parse<CorpusResult>(sources["candidate-results"])
const candidateHoldout = parse<CorpusResult>(sources["candidate-holdout"])
const reviewedResults = parse<CorpusResult>(sources["reviewed-results"])
const reviewedHoldout = parse<CorpusResult>(sources["reviewed-holdout"])
const selection = parse<SelectionManifest>(sources.selection)
const curation = parse<CurationStore>(sources.curation)
const absoluteFeedback = parse<AbsoluteFeedbackStore>(sources.absolute)
const reserveAnalysis = parse<ReserveAnalysis>(sources["reserve-analysis"])

if (baselineResults.algorithmVersion !== baselineVersion || baselineHoldout.algorithmVersion !== baselineVersion ||
	candidateResults.algorithmVersion !== candidateVersion || candidateHoldout.algorithmVersion !== candidateVersion ||
	reviewedResults.algorithmVersion !== reviewedVersion || reviewedHoldout.algorithmVersion !== reviewedVersion) {
	throw new Error("Promotion artifact versions are inconsistent")
}
if (!reserveAnalysis.decision.promotionEligible || reserveAnalysis.candidateAlgorithmVersion !== reviewedVersion ||
	reserveAnalysis.summary.reviewed !== 5 || reserveAnalysis.summary.materialChanges !== 5 ||
	reserveAnalysis.summary.candidatePreferred !== 4 || reserveAnalysis.summary.baselinePreferred !== 0 ||
	reserveAnalysis.summary.similarlyValid !== 1 || reserveAnalysis.summary.neitherAcceptable !== 0 ||
	reserveAnalysis.summary.weakOrWorseCandidate !== 0) {
	throw new Error("Final reserve analysis does not authorize promotion")
}
const validation = validateCandidateArtifacts(candidateResults, candidateHoldout, baselineResults, baselineHoldout)
if (validation.violations !== 0) throw new Error("Candidate has hard-gate violations")
if (!isDeepStrictEqual(scientificPayload(candidateResults), scientificPayload(reviewedResults)) ||
	!isDeepStrictEqual(scientificPayload(candidateHoldout), scientificPayload(reviewedHoldout))) {
	throw new Error("Canonical candidate scientific payload differs from POC.10")
}

const baselineHoldoutSha256 = sha256(sources.holdout)
const candidateHoldoutSha256 = sha256(sources["candidate-holdout"])
validateSelectionManifest(selection, baselineHoldout, baselineHoldoutSha256)
validateCurationStore(selection, curation)
validateAbsoluteFeedback(absoluteFeedback, selection, curation)
const sourceHashes = new Map(selectionTracks.flatMap((track) => selection.tracks[track])
	.map((entry) => [entry.file, entry.sha256] as const))
const promotedAt = new Date().toISOString()
const promotedSelection = migrateFrozenSelectionManifest(
	selection,
	candidateHoldout,
	sourceHashes,
	candidateHoldoutSha256,
	promotedAt,
)
validateSelectionManifest(promotedSelection, candidateHoldout, candidateHoldoutSha256)
const promotedCuration: CurationStore = {
	...curation,
	manifestId: promotedSelection.manifestId,
	semanticResultsSha256: promotedSelection.semanticResultsSha256,
	entries: curation.entries.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
}
validateCurationStore(promotedSelection, promotedCuration)
if (!curationProgress(promotedSelection, promotedCuration).complete) throw new Error("Promoted curation is incomplete")
const promotedAbsoluteFeedback: AbsoluteFeedbackStore = {
	...absoluteFeedback,
	manifestId: promotedSelection.manifestId,
	algorithmVersion: candidateVersion,
	semanticResultsSha256: promotedSelection.semanticResultsSha256,
	entries: absoluteFeedback.entries.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
}
validateAbsoluteFeedback(promotedAbsoluteFeedback, promotedSelection, promotedCuration)
if (absoluteFeedback.entries.filter((entry) => entry.shippable).length !== 95 ||
	promotedAbsoluteFeedback.entries.filter((entry) => entry.shippable).length !== 95) {
	throw new Error("Promotion must preserve the reviewed 95/5 corpus labels")
}

const report = buildCandidateComparisonReport({
	baselineResults,
	baselineHoldoutResults: baselineHoldout,
	baselineHoldoutSource: sources.holdout,
	candidateResults,
	candidateHoldoutResults: candidateHoldout,
	selection,
	curation,
	absoluteFeedback,
})
requireExactSet(report.accepted.changedFiles, expectedAcceptedChanges, "Changed accepted set")
requireExactSet(report.unselectedHoldout.changedFiles, expectedUnselectedChanges, "Changed unselected set")
requireExactSet(report.rejected.changedFiles, new Set(), "Changed rejected set")
requireExactSet(report.legacyResearch.reviewable.changedFiles, new Set(), "Changed development set")
requireExactSet(report.legacyResearch.diagnostics.changedFiles, new Set(), "Changed diagnostic set")

const evidenceFiles = [
	"data/candidates/region-chromatic-role-0.1.0-poc.10/results.json",
	"data/candidates/region-chromatic-role-0.1.0-poc.10/holdout-results.json",
	"data/candidates/region-chromatic-role-0.1.0-poc.10/chromatic-role-certificates.json",
	"data/candidates/region-chromatic-role-0.1.0-poc.10/holdout-chromatic-role-certificates.json",
	"data/experiments/chromatic-role-0.1.0-poc.3-carry/analysis.json",
	"data/experiments/chromatic-role-reserve-validation-0.8.0-0f/protocol.json",
	"data/experiments/chromatic-role-reserve-validation-0.8.0-0f/evaluation.json",
	"data/experiments/chromatic-role-reserve-validation-0.8.0-0f/review-manifest.json",
	"data/experiments/chromatic-role-reserve-validation-0.8.0-0f/review-feedback.json",
	"data/experiments/chromatic-role-reserve-validation-0.8.0-0f/analysis.json",
] as const
const evidence = Object.fromEntries(await Promise.all(evidenceFiles.map(async (file) => [
	file,
	sha256(await readFile(join(researchRoot, file))),
] as const)))
const comparison = {
	thresholds: report.thresholds,
	coverage: report.coverage,
	changedAccepted: [...report.accepted.changedFiles],
	changedRejected: [...report.rejected.changedFiles],
	changedUnselected: [...report.unselectedHoldout.changedFiles],
	changedDevelopment: [...report.legacyResearch.reviewable.changedFiles],
	changedDiagnostics: [...report.legacyResearch.diagnostics.changedFiles],
}
const baselineArchive = {
	schemaVersion: 1,
	archivedAt: promotedAt,
	algorithmVersion: baselineVersion,
	results: baselineResults,
	holdoutResults: baselineHoldout,
	selection,
	curation,
	absoluteFeedback,
	holdoutSummary: parse(sources.summary),
	robustness: parse(sources.robustness),
	acceptance: { decision: "accepted", shippable: 95, unshippable: 5 },
}
const candidateArchive = {
	schemaVersion: 1,
	archivedAt: promotedAt,
	algorithmVersion: candidateVersion,
	baselineAlgorithmVersion: baselineVersion,
	results: candidateResults,
	holdoutResults: candidateHoldout,
	selection: promotedSelection,
	curation: promotedCuration,
	absoluteFeedback: promotedAbsoluteFeedback,
	holdoutSummary: parse(sources["candidate-summary"]),
	robustness: parse(sources["candidate-robustness"]),
	reviewProvenance: {
		algorithmVersion: reviewedVersion,
		resultsScientificSha256: sha256(JSON.stringify(scientificPayload(reviewedResults))),
		holdoutScientificSha256: sha256(JSON.stringify(scientificPayload(reviewedHoldout))),
		canonicalResultsScientificSha256: sha256(JSON.stringify(scientificPayload(candidateResults))),
		canonicalHoldoutScientificSha256: sha256(JSON.stringify(scientificPayload(candidateHoldout))),
		finalReserve: reserveAnalysis,
		evidence,
	},
	comparison,
	acceptance: {
		decision: "accepted",
		candidatePreferred: reserveAnalysis.summary.candidatePreferred,
		similarlyValid: reserveAnalysis.summary.similarlyValid,
		shippable: 95,
		unshippable: 5,
	},
}

const baselineArchivePath = join(roundsRoot, `${baselineVersion}-corpus-review.json`)
const candidateArchivePath = join(roundsRoot, `${candidateVersion}.json`)
if (!await missing(baselineArchivePath) || !await missing(candidateArchivePath)) {
	throw new Error("Promotion archive already exists")
}
const summary = {
	dryRun,
	promoted: !dryRun,
	baselineVersion,
	candidateVersion,
	reviewedVersion,
	validation,
	comparison,
	archives: [relative(projectRoot, baselineArchivePath), relative(projectRoot, candidateArchivePath)],
}
if (dryRun) {
	console.log(JSON.stringify(summary, null, 2))
	process.exit(0)
}

const created: string[] = []
try {
	await exclusiveWrite(baselineArchivePath, json(baselineArchive))
	created.push(baselineArchivePath)
	await exclusiveWrite(candidateArchivePath, json(candidateArchive))
	created.push(candidateArchivePath)
	await replaceAll([
		{ path: canonicalPaths.results, source: sources["candidate-results"] },
		{ path: canonicalPaths.holdout, source: sources["candidate-holdout"] },
		{ path: canonicalPaths.selection, source: json(promotedSelection) },
		{ path: canonicalPaths.curation, source: json(promotedCuration) },
		{ path: canonicalPaths.absolute, source: json(promotedAbsoluteFeedback) },
		{ path: canonicalPaths.summary, source: sources["candidate-summary"] },
		{ path: canonicalPaths.robustness, source: sources["candidate-robustness"] },
	])
} catch (error) {
	await Promise.all(created.map((path) => rm(path, { force: true }).catch(() => undefined)))
	throw error
}
console.log(JSON.stringify(summary, null, 2))
