import { createHash, randomUUID } from "node:crypto"
import { link, lstat, open, readFile, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCandidateComparisonReport } from "./src/candidate-comparison.ts"
import { validateCandidateArtifacts, validateCandidateSummaryVersions } from "./src/candidate-validation.ts"
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
import { ALGORITHM_VERSION } from "./src/extract.ts"
import type { CorpusResult } from "./src/types.ts"

type ReviewMethod = "spatial" | "previous"
type Preference = "left" | "right" | "tie"
type ShipDecision = "left" | "right" | "both" | "neither"

type CandidateFeedback = {
	image: string
	comparison: "iteration"
	leftMethod: ReviewMethod
	rightMethod: ReviewMethod
	preference: Preference
	ship: ShipDecision
	reasons: string[]
	note: string
	id: string
	timestamp: string
	reviewSchema: 2
	presentationVersion: 4
	algorithmVersion: string
	previousAlgorithmVersion: string
}

type CandidateFeedbackStore = {
	schemaVersion: 1
	baselineAlgorithmVersion: string
	baselineResultsSemanticSha256: string
	baselineHoldoutSemanticSha256: string
	candidateAlgorithmVersion: string
	candidateResultsSemanticSha256: string
	candidateHoldoutSemanticSha256: string
	selectionManifestId: string
	presentationVersion: 4
	sourceHashes: Record<string, string>
	entries: CandidateFeedback[]
}

type AbsoluteFeedbackEntry = {
	image: string
	shippable: boolean
	reasons: string[]
	note: string
	decidedAt: string
}

type AbsoluteFeedbackStore = {
	schemaVersion: 3
	manifestId: string
	algorithmVersion: string
	semanticResultsSha256: string
	presentationVersion: 1
	entries: AbsoluteFeedbackEntry[]
}

const checkpointCommit = "b56e4197bb734ece89a9b9ab1163c1954c21115f"
const expectedBaselineAlgorithmVersion = "region-graph-0.16.0"
const expectedCandidateAlgorithmVersion = "region-graph-0.17.0"
const expectedReviewedAlgorithmVersion = "region-joint-spatial-0.1.0-poc.3"
const expectedCandidateHoldoutSummarySha256 = "7b7b1937efab11b153e583ee6138e6d1cfe1e4635ab7b9e73d890eda90e19db8"
const expectedCandidateRobustnessSha256 = "2b704d8600431df4fb587928d7d3e6faf08e0120f144a3e639b93239b388719f"
const expectedReviewedJointCertificatesSha256 = "113f55517ad1097f692f08f2df9ea446bc67e6b5819a17f3bb08e9f09f9f675c"
const expectedReviewedHoldoutJointCertificatesSha256 = "a06af0464dc206df4c58de33df17081320c9779f630137cfa8f4d3f99201ea33"
const expectedChangedLegacyReviewableTargets = new Set(["once.jpg"])
const expectedChangedLegacyDiagnosticTargets = new Set(["maroon5-masked.jpg"])
const expectedChangedAcceptedTargets = new Set([
	"00/ab67616d00001e020000d1502df8d8aaf3418f0f.jpg",
	"00/ab67616d0000b2730000089bb2fab58ed5653b0b.jpg",
	"00/ab67616d0000b273000037d5a2d47245cb9abc79.jpg",
	"00/ab67616d0000b27300004554beea0eaa5fef3858.jpg",
	"00/ab67616d0000b27300004851d00ca04301880f47.jpg",
	"00/ab67616d0000b2730000685cd0e9597f68328ca8.jpg",
])
const expectedChangedRejectedTargets = new Set([
	"00/ab67616d00001e02000045be7b6dfb8bf9fe7a15.jpg",
	"00/ab67616d00001e0200005ddc313068597b41ae3b.jpg",
	"00/ab67616d0000b27300003bdffa5565ae80d51afa.jpg",
	"00/ab67616d0000b27300003d2a08ce63af9a2c19b0.jpg",
])
const expectedChangedUnselectedTargets = new Set([
	"00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg",
	"00/ab67616d00001e02000023e98b7381eaed77a9cb.jpg",
	"00/ab67616d00001e02000048e988ab5b276f2faf93.jpg",
	"00/ab67616d00001e02000070d555a0bc90060282c4.jpg",
	"00/ab67616d00001e0200009cc217370640dba6c2b2.jpg",
	"00/ab67616d00001e020000e7f187b75529eda4b178.jpg",
	"00/ab67616d0000b273000018eeb2fbe34ab01638ce.jpg",
	"00/ab67616d0000b273000030b6e37a6c32606d9eb7.jpg",
	"00/ab67616d0000b27300003428f1c912cafa855fff.jpg",
	"00/ab67616d0000b273000058c3996b51b7579968f0.jpg",
	"00/ab67616d0000b27300005f98559139b7dbc802fd.jpg",
	"00/ab67616d0000b27300007f06d53e3868928f9d8f.jpg",
	"00/ab67616d0000b273000087f3e406c09740e0a34e.jpg",
	"00/ab67616d0000b2730000928d22696c584836c540.jpg",
	"00/ab67616d0000b27300009a10085a7a721a344040.jpg",
	"00/ab67616d0000b27300009dc4234926af8340af73.jpg",
	"00/ab67616d0000b2730000b08cbffa8436ded16a82.jpg",
	"00/ab67616d0000b2730000c12779d6bc733df89c32.jpg",
	"00/ab67616d0000b2730000c258ff41ad4f15ddc953.jpg",
	"00/ab67616d0000b2730000c57a2d9bcbd2b5c5cc3b.jpg",
	"00/ab67616d0000b2730000ce131af8496d1d5d37d3.jpg",
	"00/ab67616d0000b2730000f329bdedf99c818740d1.jpg",
	"00/ab67616d0000b2730000f8cf5df83cfdce135f6a.jpg",
])
const sha256Pattern = /^[a-f0-9]{64}$/
const preferences = new Set<Preference>(["left", "right", "tie"])
const shipDecisions = new Set<ShipDecision>(["left", "right", "both", "neither"])
const candidateFeedbackReasons = new Set([
	"background",
	"foreground",
	"surface",
	"accent",
	"unfaithful",
	"flat",
	"unreadable",
	"tiny-detail-dominates",
	"missing-gradient",
	"unnecessary-gradient",
	"unnecessary-surface",
	"missing-source-color",
])
const absoluteReasons = new Set([
	"background",
	"foreground",
	"surface",
	"accent",
	"gradient",
	"lacks-artwork-identity",
	"other",
])

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const dataRoot = join(researchRoot, "data")
const roundsRoot = join(dataRoot, "rounds")
const imagesRoot = join(projectRoot, "images")

const arguments_ = process.argv.slice(2)
const dryRun = arguments_.includes("--dry-run")
const positionalArguments = arguments_.filter((argument) => argument !== "--dry-run")
if (positionalArguments.length !== 2 || arguments_.length !== positionalArguments.length + (dryRun ? 1 : 0)) {
	throw new Error("Usage: research/promote-candidate.ts [--dry-run] <candidate-dir> <reviewed-candidate-dir>")
}
const candidateDirectory = isAbsolute(positionalArguments[0])
	? resolve(positionalArguments[0])
	: resolve(projectRoot, positionalArguments[0])
const reviewedCandidateDirectory = isAbsolute(positionalArguments[1])
	? resolve(positionalArguments[1])
	: resolve(projectRoot, positionalArguments[1])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const expectedKeys = new Set(expected)
	if (Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expectedKeys.has(key))) {
		throw new Error(`${label} has unexpected or missing fields`)
	}
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function sha256(source: string | Uint8Array): string {
	return createHash("sha256").update(source).digest("hex")
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

async function readSource(path: string): Promise<Buffer> {
	try {
		return await readFile(path)
	} catch (error) {
		throw new Error(`Unable to read ${path}`, { cause: error })
	}
}

function parseJson(source: Buffer, path: string): unknown {
	try {
		return JSON.parse(source.toString("utf8")) as unknown
	} catch (error) {
		throw new Error(`Invalid JSON in ${path}`, { cause: error })
	}
}

function validateCandidateRobustness(value: unknown, expectedVersion: string): void {
	if (!isRecord(value) || value.algorithmVersion !== expectedVersion || !isRecord(value.source) ||
		value.source.corpus !== "images" || value.source.fileCount !== 35 ||
		typeof value.source.semanticSha256 !== "string" || !sha256Pattern.test(value.source.semanticSha256)) {
		throw new Error("Candidate robustness provenance does not match the implemented algorithm and source corpus")
	}
}

function validateJointCertificates(value: unknown, expectedVersion: string, corpus: CorpusResult, label: string): void {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.algorithmVersion !== expectedVersion || !isRecord(value.entries)) {
		throw new Error(`${label} provenance is invalid`)
	}
	const expectedFiles = new Set(corpus.entries.map((entry) => entry.file))
	const certificateFiles = Object.keys(value.entries)
	if (certificateFiles.length !== expectedFiles.size || certificateFiles.some((file) => !expectedFiles.has(file))) {
		throw new Error(`${label} does not exactly cover its reviewed corpus`)
	}
	for (const file of certificateFiles) {
		const certificate = value.entries[file]
		if (!isRecord(certificate) || certificate.schemaVersion !== 1 || certificate.algorithmVersion !== expectedVersion ||
			certificate.baselineAlgorithmVersion !== expectedBaselineAlgorithmVersion) {
			throw new Error(`${label} contains invalid provenance for ${file}`)
		}
	}
}

function sourcePath(file: string): string {
	if (file.startsWith("00/")) {
		if (!/^00\/[^/\\]+$/.test(file)) throw new Error(`Invalid holdout source path: ${file}`)
		return resolve(projectRoot, file)
	}
	if (!file || file === "." || file.includes("/") || file.includes("\\")) {
		throw new Error(`Invalid legacy source path: ${file}`)
	}
	return resolve(imagesRoot, file)
}

function reviewMethodsFor(image: string, candidateResultsSemanticSha256: string): readonly [ReviewMethod, ReviewMethod] {
	const digest = createHash("sha256")
		.update(`${candidateResultsSemanticSha256}:${image}:iteration`)
		.digest()
	return digest[0] % 2 === 0 ? ["spatial", "previous"] : ["previous", "spatial"]
}

function methodSide(entry: CandidateFeedback, method: ReviewMethod): "left" | "right" {
	return entry.leftMethod === method ? "left" : "right"
}

function methodIsShippable(entry: CandidateFeedback, method: ReviewMethod): boolean {
	return entry.ship === "both" || entry.ship === methodSide(entry, method)
}

function methodIsPreferred(entry: CandidateFeedback, method: ReviewMethod): boolean {
	return entry.preference === methodSide(entry, method)
}

function requireExactSet(actual: ReadonlySet<string>, expected: ReadonlySet<string>, label: string): void {
	if (actual.size !== expected.size || [...actual].some((file) => !expected.has(file))) {
		throw new Error(`${label} does not match the reviewed 0.17 transition`)
	}
}

function validateCandidateFeedbackStore(value: unknown, expected: {
	baselineAlgorithmVersion: string
	baselineResultsSemanticSha256: string
	baselineHoldoutSemanticSha256: string
	candidateAlgorithmVersion: string
	candidateResultsSemanticSha256: string
	candidateHoldoutSemanticSha256: string
	selectionManifestId: string
	reviewFiles: readonly string[]
	sourceHashes: Readonly<Record<string, string>>
}): asserts value is CandidateFeedbackStore {
	if (!isRecord(value)) throw new Error("Candidate feedback store must be an object")
	requireExactKeys(value, [
		"schemaVersion",
		"baselineAlgorithmVersion",
		"baselineResultsSemanticSha256",
		"baselineHoldoutSemanticSha256",
		"candidateAlgorithmVersion",
		"candidateResultsSemanticSha256",
		"candidateHoldoutSemanticSha256",
		"selectionManifestId",
		"presentationVersion",
		"sourceHashes",
		"entries",
	], "Candidate feedback store")
	if (value.schemaVersion !== 1 || value.presentationVersion !== 4 ||
		value.baselineAlgorithmVersion !== expected.baselineAlgorithmVersion ||
		value.baselineResultsSemanticSha256 !== expected.baselineResultsSemanticSha256 ||
		value.baselineHoldoutSemanticSha256 !== expected.baselineHoldoutSemanticSha256 ||
		value.candidateAlgorithmVersion !== expected.candidateAlgorithmVersion ||
		value.candidateResultsSemanticSha256 !== expected.candidateResultsSemanticSha256 ||
		value.candidateHoldoutSemanticSha256 !== expected.candidateHoldoutSemanticSha256 ||
		value.selectionManifestId !== expected.selectionManifestId) {
		throw new Error("Candidate feedback provenance does not match the promotion artifacts")
	}

	if (!isRecord(value.sourceHashes)) throw new Error("Candidate feedback source hashes are invalid")
	const storedSourceHashes = value.sourceHashes
	const expectedFiles = new Set(expected.reviewFiles)
	const storedHashFiles = Object.keys(storedSourceHashes)
	if (storedHashFiles.length !== expectedFiles.size || storedHashFiles.some((file) => !expectedFiles.has(file)) ||
		expected.reviewFiles.some((file) => storedSourceHashes[file] !== expected.sourceHashes[file])) {
		throw new Error("Candidate feedback source hashes do not exactly match the changed review entries")
	}
	for (const digest of Object.values(storedSourceHashes)) {
		if (typeof digest !== "string" || !sha256Pattern.test(digest)) throw new Error("Candidate feedback source hash is invalid")
	}

	if (!Array.isArray(value.entries) || value.entries.length !== expectedFiles.size) {
		throw new Error("Candidate feedback must exactly cover every changed review entry")
	}
	const ids = new Set<string>()
	const images = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Candidate feedback entry is invalid")
		requireExactKeys(entryValue, [
			"image",
			"comparison",
			"leftMethod",
			"rightMethod",
			"preference",
			"ship",
			"reasons",
			"note",
			"id",
			"timestamp",
			"reviewSchema",
			"presentationVersion",
			"algorithmVersion",
			"previousAlgorithmVersion",
		], "Candidate feedback entry")
		const image = entryValue.image
		if (typeof image !== "string" || !expectedFiles.has(image) || images.has(image)) {
			throw new Error("Candidate feedback images are unknown or duplicated")
		}
		const [leftMethod, rightMethod] = reviewMethodsFor(image, expected.candidateResultsSemanticSha256)
		if (entryValue.comparison !== "iteration" || entryValue.leftMethod !== leftMethod || entryValue.rightMethod !== rightMethod) {
			throw new Error(`Candidate feedback method assignment is invalid for ${image}`)
		}
		if (typeof entryValue.preference !== "string" || !preferences.has(entryValue.preference as Preference)) {
			throw new Error(`Candidate feedback preference is invalid for ${image}`)
		}
		if (typeof entryValue.ship !== "string" || !shipDecisions.has(entryValue.ship as ShipDecision)) {
			throw new Error(`Candidate feedback shippability is invalid for ${image}`)
		}
		if (!Array.isArray(entryValue.reasons) || entryValue.reasons.some((reason) =>
			typeof reason !== "string" || !candidateFeedbackReasons.has(reason)) ||
			new Set(entryValue.reasons).size !== entryValue.reasons.length) {
			throw new Error(`Candidate feedback reasons are invalid for ${image}`)
		}
		if (typeof entryValue.note !== "string" || entryValue.note.length > 500) {
			throw new Error(`Candidate feedback note is invalid for ${image}`)
		}
		if (typeof entryValue.id !== "string" || entryValue.id.length === 0 || ids.has(entryValue.id)) {
			throw new Error("Candidate feedback IDs are invalid or duplicated")
		}
		if (!validTimestamp(entryValue.timestamp) || entryValue.reviewSchema !== 2 || entryValue.presentationVersion !== 4 ||
			entryValue.algorithmVersion !== expected.candidateAlgorithmVersion ||
			entryValue.previousAlgorithmVersion !== expected.baselineAlgorithmVersion) {
			throw new Error(`Candidate feedback entry provenance is invalid for ${image}`)
		}
		ids.add(entryValue.id)
		images.add(image)
	}
	if (images.size !== expectedFiles.size || expected.reviewFiles.some((file) => !images.has(file))) {
		throw new Error("Candidate feedback coverage is incomplete")
	}
}

function validateAbsoluteFeedbackStore(
	value: unknown,
	selection: SelectionManifest,
	curation: CurationStore,
): asserts value is AbsoluteFeedbackStore {
	if (!isRecord(value)) throw new Error("Absolute feedback store must be an object")
	requireExactKeys(value, [
		"schemaVersion",
		"manifestId",
		"algorithmVersion",
		"semanticResultsSha256",
		"presentationVersion",
		"entries",
	], "Absolute feedback store")
	if (value.schemaVersion !== 3 || value.manifestId !== selection.manifestId ||
		value.algorithmVersion !== selection.algorithmVersion ||
		value.semanticResultsSha256 !== selection.semanticResultsSha256 || value.presentationVersion !== 1 ||
		!Array.isArray(value.entries)) {
		throw new Error("Absolute feedback store does not match the frozen selection provenance")
	}
	const included = new Set(acceptedCandidates(selection, curation).map((candidate) => candidate.file))
	if (selection.targetSize !== 100 || included.size !== 100 || value.entries.length !== 100) {
		throw new Error("Absolute feedback must contain exactly 100 curated entries")
	}
	const seen = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Absolute feedback entry is invalid")
		requireExactKeys(entryValue, ["image", "shippable", "reasons", "note", "decidedAt"], "Absolute feedback entry")
		if (typeof entryValue.image !== "string" || !included.has(entryValue.image) || seen.has(entryValue.image)) {
			throw new Error("Absolute feedback images are unknown or duplicated")
		}
		if (typeof entryValue.shippable !== "boolean" || !Array.isArray(entryValue.reasons) ||
			entryValue.reasons.some((reason) => typeof reason !== "string" || !absoluteReasons.has(reason)) ||
			new Set(entryValue.reasons).size !== entryValue.reasons.length ||
			(entryValue.shippable ? entryValue.reasons.length !== 0 : entryValue.reasons.length === 0)) {
			throw new Error(`Absolute feedback decision is invalid for ${entryValue.image}`)
		}
		if (typeof entryValue.note !== "string" || entryValue.note.length > 500 ||
			(entryValue.reasons.includes("other") && entryValue.note.trim().length === 0)) {
			throw new Error(`Absolute feedback note is invalid for ${entryValue.image}`)
		}
		if (!validTimestamp(entryValue.decidedAt)) throw new Error(`Absolute feedback timestamp is invalid for ${entryValue.image}`)
		seen.add(entryValue.image)
	}
	if ([...included].some((image) => !seen.has(image))) throw new Error("Absolute feedback coverage is incomplete")
}

async function requireMissing(path: string): Promise<void> {
	try {
		await lstat(path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw new Error(`Unable to inspect archive target ${path}`, { cause: error })
	}
	throw new Error(`Archive already exists: ${path}`)
}

function jsonSource(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

async function writeSyncedTemporary(target: string, source: Uint8Array, mode: number): Promise<string> {
	const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`)
	const handle = await open(temporary, "wx", mode)
	try {
		await handle.writeFile(source)
		await handle.sync()
	} catch (error) {
		await handle.close().catch(() => undefined)
		await rm(temporary, { force: true }).catch(() => undefined)
		throw error
	}
	await handle.close()
	return temporary
}

async function publishArchive(target: string, source: Uint8Array): Promise<void> {
	const temporary = await writeSyncedTemporary(target, source, 0o444)
	try {
		await link(temporary, target)
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => undefined)
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Archive already exists: ${target}`, { cause: error })
		throw new Error(`Unable to publish archive ${target}`, { cause: error })
	}
	await rm(temporary, { force: true }).catch(() => undefined)
}

async function assertSnapshotsUnchanged(snapshots: ReadonlyArray<{ path: string; source: Buffer }>): Promise<void> {
	for (const snapshot of snapshots) {
		const current = await readSource(snapshot.path)
		if (!current.equals(snapshot.source)) throw new Error(`Source changed during promotion validation: ${snapshot.path}`)
	}
}

const candidateStat = await stat(candidateDirectory).catch((error: unknown) => {
	throw new Error(`Unable to access candidate directory ${candidateDirectory}`, { cause: error })
})
if (!candidateStat.isDirectory()) throw new Error(`Candidate path is not a directory: ${candidateDirectory}`)
const reviewedCandidateStat = await stat(reviewedCandidateDirectory).catch((error: unknown) => {
	throw new Error(`Unable to access reviewed candidate directory ${reviewedCandidateDirectory}`, { cause: error })
})
if (!reviewedCandidateStat.isDirectory()) {
	throw new Error(`Reviewed candidate path is not a directory: ${reviewedCandidateDirectory}`)
}
const roundsStat = await stat(roundsRoot).catch((error: unknown) => {
	throw new Error(`Unable to access rounds directory ${roundsRoot}`, { cause: error })
})
if (!roundsStat.isDirectory()) throw new Error(`Rounds path is not a directory: ${roundsRoot}`)

const baselineResultsPath = join(dataRoot, "results.json")
const baselineHoldoutPath = join(dataRoot, "holdout-results.json")
const selectionPath = join(dataRoot, "selection.json")
const curationPath = join(dataRoot, "curation.json")
const absoluteFeedbackPath = join(dataRoot, "absolute-feedback.json")
const baselineHoldoutSummaryPath = join(dataRoot, "holdout-summary.json")
const baselineRobustnessPath = join(dataRoot, "robustness.json")
const candidateResultsPath = join(candidateDirectory, "results.json")
const candidateHoldoutPath = join(candidateDirectory, "holdout-results.json")
const candidateHoldoutSummaryPath = join(candidateDirectory, "holdout-summary.json")
const candidateRobustnessPath = join(candidateDirectory, "robustness.json")
const reviewedResultsPath = join(reviewedCandidateDirectory, "results.json")
const reviewedHoldoutPath = join(reviewedCandidateDirectory, "holdout-results.json")
const reviewedFeedbackPath = join(reviewedCandidateDirectory, "feedback.json")
const reviewedJointCertificatesPath = join(reviewedCandidateDirectory, "joint-certificates.json")
const reviewedHoldoutJointCertificatesPath = join(reviewedCandidateDirectory, "holdout-joint-certificates.json")

const [
	baselineResultsSource,
	baselineHoldoutSource,
	selectionSource,
	curationSource,
	absoluteFeedbackSource,
	baselineHoldoutSummarySource,
	baselineRobustnessSource,
	candidateResultsSource,
	candidateHoldoutSource,
	candidateHoldoutSummarySource,
	candidateRobustnessSource,
	reviewedResultsSource,
	reviewedHoldoutSource,
	reviewedFeedbackSource,
	reviewedJointCertificatesSource,
	reviewedHoldoutJointCertificatesSource,
] = await Promise.all([
	readSource(baselineResultsPath),
	readSource(baselineHoldoutPath),
	readSource(selectionPath),
	readSource(curationPath),
	readSource(absoluteFeedbackPath),
	readSource(baselineHoldoutSummaryPath),
	readSource(baselineRobustnessPath),
	readSource(candidateResultsPath),
	readSource(candidateHoldoutPath),
	readSource(candidateHoldoutSummaryPath),
	readSource(candidateRobustnessPath),
	readSource(reviewedResultsPath),
	readSource(reviewedHoldoutPath),
	readSource(reviewedFeedbackPath),
	readSource(reviewedJointCertificatesPath),
	readSource(reviewedHoldoutJointCertificatesPath),
])

const baselineResultsValue = parseJson(baselineResultsSource, baselineResultsPath)
const baselineHoldoutValue = parseJson(baselineHoldoutSource, baselineHoldoutPath)
const selectionValue = parseJson(selectionSource, selectionPath)
const curationValue = parseJson(curationSource, curationPath)
const absoluteFeedbackValue = parseJson(absoluteFeedbackSource, absoluteFeedbackPath)
const baselineHoldoutSummaryValue = parseJson(baselineHoldoutSummarySource, baselineHoldoutSummaryPath)
const baselineRobustnessValue = parseJson(baselineRobustnessSource, baselineRobustnessPath)
const candidateResultsValue = parseJson(candidateResultsSource, candidateResultsPath)
const candidateHoldoutValue = parseJson(candidateHoldoutSource, candidateHoldoutPath)
const candidateHoldoutSummaryValue = parseJson(candidateHoldoutSummarySource, candidateHoldoutSummaryPath)
const candidateRobustnessValue = parseJson(candidateRobustnessSource, candidateRobustnessPath)
const reviewedResultsValue = parseJson(reviewedResultsSource, reviewedResultsPath)
const reviewedHoldoutValue = parseJson(reviewedHoldoutSource, reviewedHoldoutPath)
const reviewedFeedbackValue = parseJson(reviewedFeedbackSource, reviewedFeedbackPath)
const reviewedJointCertificatesValue = parseJson(reviewedJointCertificatesSource, reviewedJointCertificatesPath)
const reviewedHoldoutJointCertificatesValue = parseJson(
	reviewedHoldoutJointCertificatesSource,
	reviewedHoldoutJointCertificatesPath,
)

validateCandidateArtifacts(baselineResultsValue, baselineHoldoutValue, "<baseline-validation>")
const candidateValidation = validateCandidateArtifacts(
	candidateResultsValue,
	candidateHoldoutValue,
	baselineResultsValue,
	baselineHoldoutValue,
)
const reviewedValidation = validateCandidateArtifacts(
	reviewedResultsValue,
	reviewedHoldoutValue,
	baselineResultsValue,
	baselineHoldoutValue,
)
const baselineResults = baselineResultsValue as CorpusResult
const baselineHoldout = baselineHoldoutValue as CorpusResult
const candidateResults = candidateResultsValue as CorpusResult
const candidateHoldout = candidateHoldoutValue as CorpusResult
const reviewedResults = reviewedResultsValue as CorpusResult
const reviewedHoldout = reviewedHoldoutValue as CorpusResult
const baselineAlgorithmVersion = baselineResults.algorithmVersion
const candidateAlgorithmVersion = candidateValidation.algorithmVersion
const reviewedAlgorithmVersion = reviewedValidation.algorithmVersion
if (baselineAlgorithmVersion !== expectedBaselineAlgorithmVersion) {
	throw new Error(`Expected baseline ${expectedBaselineAlgorithmVersion}, received ${baselineAlgorithmVersion}`)
}
if (candidateAlgorithmVersion !== expectedCandidateAlgorithmVersion || candidateAlgorithmVersion !== ALGORITHM_VERSION) {
	throw new Error(`Candidate ${candidateAlgorithmVersion} does not match expected and implemented version ${ALGORITHM_VERSION}`)
}
if (reviewedAlgorithmVersion !== expectedReviewedAlgorithmVersion) {
	throw new Error(`Reviewed candidate ${reviewedAlgorithmVersion} does not match ${expectedReviewedAlgorithmVersion}`)
}
validateCandidateSummaryVersions(candidateResults, candidateHoldout, expectedCandidateAlgorithmVersion)
validateCandidateSummaryVersions(reviewedResults, reviewedHoldout, expectedReviewedAlgorithmVersion)
if (!isRecord(candidateHoldoutSummaryValue) || candidateHoldoutSummaryValue.algorithmVersion !== expectedCandidateAlgorithmVersion) {
	throw new Error("Candidate holdout summary does not match the expected candidate version")
}
validateCandidateRobustness(candidateRobustnessValue, expectedCandidateAlgorithmVersion)
if (sha256(candidateHoldoutSummarySource) !== expectedCandidateHoldoutSummarySha256 ||
	sha256(candidateRobustnessSource) !== expectedCandidateRobustnessSha256) {
	throw new Error("Candidate diagnostic artifacts do not match the reviewed 0.17 inputs")
}
validateJointCertificates(reviewedJointCertificatesValue, expectedReviewedAlgorithmVersion, reviewedResults, "Joint certificates")
validateJointCertificates(
	reviewedHoldoutJointCertificatesValue,
	expectedReviewedAlgorithmVersion,
	reviewedHoldout,
	"Holdout joint certificates",
)
if (sha256(reviewedJointCertificatesSource) !== expectedReviewedJointCertificatesSha256 ||
	sha256(reviewedHoldoutJointCertificatesSource) !== expectedReviewedHoldoutJointCertificatesSha256) {
	throw new Error("Reviewed joint certificates do not match the frozen POC3 artifacts")
}

const candidateResultsScientificSha256 = sha256(jsonSource(scientificPayload(candidateResults)))
const candidateHoldoutScientificSha256 = sha256(jsonSource(scientificPayload(candidateHoldout)))
const reviewedResultsScientificSha256 = sha256(jsonSource(scientificPayload(reviewedResults)))
const reviewedHoldoutScientificSha256 = sha256(jsonSource(scientificPayload(reviewedHoldout)))
if (candidateResultsScientificSha256 !== reviewedResultsScientificSha256 ||
	candidateHoldoutScientificSha256 !== reviewedHoldoutScientificSha256) {
	throw new Error("Canonical candidate scientific payload differs from the reviewed POC")
}

const baselineHoldoutRawSha256 = sha256(baselineHoldoutSource)
validateSelectionManifest(selectionValue, baselineHoldout, baselineHoldoutRawSha256)
const selection = selectionValue
validateCurationStore(selection, curationValue)
const curation = curationValue
if (curation.frozenAt === null) throw new Error("Curation store must be frozen before promotion")
validateAbsoluteFeedbackStore(absoluteFeedbackValue, selection, curation)
const absoluteFeedback = absoluteFeedbackValue

const report = buildCandidateComparisonReport({
	baselineResults,
	baselineHoldoutResults: baselineHoldout,
	baselineHoldoutSource,
	candidateResults,
	candidateHoldoutResults: candidateHoldout,
	selection,
	curation,
	absoluteFeedback,
})

const baselineResultsSemanticSha256 = computeSemanticResultsSha256(baselineResults)
const baselineHoldoutSemanticSha256 = computeSemanticResultsSha256(baselineHoldout)
const candidateResultsSemanticSha256 = computeSemanticResultsSha256(candidateResults)
const candidateHoldoutSemanticSha256 = computeSemanticResultsSha256(candidateHoldout)
const reviewedResultsSemanticSha256 = computeSemanticResultsSha256(reviewedResults)
const reviewedHoldoutSemanticSha256 = computeSemanticResultsSha256(reviewedHoldout)
const candidateHoldoutRawSha256 = sha256(candidateHoldoutSource)

const unchangedSourceHashes = new Map<string, string>()
for (const selected of selectionTracks.flatMap((track) => selection.tracks[track])) {
	const digest = sha256(await readSource(sourcePath(selected.file)))
	if (digest !== selected.sha256) throw new Error(`On-disk SHA-256 does not match selection for ${selected.file}`)
	if (unchangedSourceHashes.has(selected.file)) throw new Error(`Duplicate baseline source hash for ${selected.file}`)
	unchangedSourceHashes.set(selected.file, selected.sha256)
}
const candidateHoldoutFiles = new Set(candidateHoldout.entries.map((entry) => entry.file))
if (candidateHoldoutFiles.size !== candidateHoldout.entries.length || unchangedSourceHashes.size !== candidateHoldoutFiles.size ||
	[...candidateHoldoutFiles].some((file) => !unchangedSourceHashes.has(file)) ||
	[...unchangedSourceHashes].some(([file]) => !candidateHoldoutFiles.has(file))) {
	throw new Error("Baseline source hashes do not exactly cover candidate holdout results")
}

const promotedAt = new Date().toISOString()
const promotedSelection = migrateFrozenSelectionManifest(
	selection,
	candidateHoldout,
	unchangedSourceHashes,
	candidateHoldoutRawSha256,
	promotedAt,
)
validateSelectionManifest(promotedSelection, candidateHoldout, candidateHoldoutRawSha256)

const promotedCuration: CurationStore = {
	schemaVersion: 3,
	manifestId: promotedSelection.manifestId,
	semanticResultsSha256: promotedSelection.semanticResultsSha256,
	frozenAt: curation.frozenAt,
	entries: curation.entries.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
}
validateCurationStore(promotedSelection, promotedCuration)
const promotedCurationProgress = curationProgress(promotedSelection, promotedCuration)
if (!promotedCurationProgress.complete || promotedCurationProgress.accepted !== promotedSelection.targetSize ||
	selectionTracks.some((track) =>
		promotedCurationProgress.tracks[track].accepted !== promotedSelection.quotas[track])) {
	throw new Error("Frozen curation does not retain complete exact quotas under the candidate selection manifest")
}

const changedLegacyReviewable = new Set(report.legacyResearch.reviewable.changedFiles)
const changedLegacyDiagnostics = new Set(report.legacyResearch.diagnostics.changedFiles)
const changedAccepted = new Set(report.accepted.changedFiles)
const changedRejected = new Set(report.rejected.changedFiles)
const changedUnselected = new Set(report.unselectedHoldout.changedFiles)
requireExactSet(changedLegacyReviewable, expectedChangedLegacyReviewableTargets, "Changed legacy reviewable set")
requireExactSet(changedLegacyDiagnostics, expectedChangedLegacyDiagnosticTargets, "Changed legacy diagnostic set")
requireExactSet(changedAccepted, expectedChangedAcceptedTargets, "Changed accepted set")
requireExactSet(changedRejected, expectedChangedRejectedTargets, "Changed rejected set")
requireExactSet(changedUnselected, expectedChangedUnselectedTargets, "Changed unselected holdout set")
const reviewFiles = [
	...baselineResults.entries.filter((entry) => changedLegacyReviewable.has(entry.file)).map((entry) => entry.file),
	...baselineHoldout.entries.filter((entry) => changedAccepted.has(entry.file) || changedRejected.has(entry.file))
		.map((entry) => entry.file),
]
if (reviewFiles.length === 0) throw new Error("Candidate has no perceptually changed review entries")
if (new Set(reviewFiles).size !== reviewFiles.length ||
	reviewFiles.length !== changedLegacyReviewable.size + changedAccepted.size + changedRejected.size) {
	throw new Error("Candidate comparison produced missing or duplicated changed review entries")
}

const expectedFeedbackSourceHashes: Record<string, string> = {}
for (const file of reviewFiles) {
	const selectedHash = unchangedSourceHashes.get(file)
	expectedFeedbackSourceHashes[file] = selectedHash ?? sha256(await readSource(sourcePath(file)))
}
validateCandidateFeedbackStore(reviewedFeedbackValue, {
	baselineAlgorithmVersion,
	baselineResultsSemanticSha256,
	baselineHoldoutSemanticSha256,
	candidateAlgorithmVersion: reviewedAlgorithmVersion,
	candidateResultsSemanticSha256: reviewedResultsSemanticSha256,
	candidateHoldoutSemanticSha256: reviewedHoldoutSemanticSha256,
	selectionManifestId: selection.manifestId,
	reviewFiles,
	sourceHashes: expectedFeedbackSourceHashes,
})
const candidateFeedback = reviewedFeedbackValue
const candidateFeedbackByImage = new Map(candidateFeedback.entries.map((entry) => [entry.image, entry]))

let baselineOnlyShippable = 0
for (const entry of candidateFeedback.entries) {
	if (methodIsShippable(entry, "previous") && !methodIsShippable(entry, "spatial")) baselineOnlyShippable++
}
if (baselineOnlyShippable !== 0) throw new Error("Candidate feedback contains baseline-only shippability")
const changedLegacyCount = report.legacyResearch.reviewable.changedCount + report.legacyResearch.diagnostics.changedCount
for (const file of changedAccepted) {
	const feedback = candidateFeedbackByImage.get(file)
	if (!feedback) throw new Error(`Candidate feedback is missing changed accepted target ${file}`)
	if (!methodIsShippable(feedback, "spatial")) {
		throw new Error(`Candidate is not shippable for changed accepted target ${file}`)
	}
}
let candidatePreferredChangedRejectedTargets = 0
let candidateShippableChangedRejectedTargets = 0
for (const file of changedRejected) {
	const feedback = candidateFeedbackByImage.get(file)
	if (!feedback) throw new Error(`Candidate feedback is missing changed rejected target ${file}`)
	if (methodIsPreferred(feedback, "spatial")) candidatePreferredChangedRejectedTargets++
	if (methodIsShippable(feedback, "spatial")) candidateShippableChangedRejectedTargets++
}
if (candidatePreferredChangedRejectedTargets !== 2 || candidateShippableChangedRejectedTargets !== 3) {
	throw new Error("Changed rejected outcomes do not match the reviewed 0.17 transition")
}
const candidatePreferredReviewEntries = candidateFeedback.entries.filter((entry) => methodIsPreferred(entry, "spatial")).length
const baselinePreferredReviewEntries = candidateFeedback.entries.filter((entry) => methodIsPreferred(entry, "previous")).length
const tiedReviewEntries = candidateFeedback.entries.filter((entry) => entry.preference === "tie").length
const candidateShippableReviewEntries = candidateFeedback.entries.filter((entry) => methodIsShippable(entry, "spatial")).length
if (candidatePreferredReviewEntries !== 7 || baselinePreferredReviewEntries !== 1 || tiedReviewEntries !== 3 ||
	candidateShippableReviewEntries !== 10) {
	throw new Error("Aggregate feedback outcomes do not match the completed POC3 review")
}

const changedReviewedSources = new Set([...changedAccepted, ...changedRejected])
const promotedAbsoluteFeedback: AbsoluteFeedbackStore = {
	schemaVersion: 3,
	manifestId: promotedSelection.manifestId,
	algorithmVersion: candidateAlgorithmVersion,
	semanticResultsSha256: promotedSelection.semanticResultsSha256,
	presentationVersion: 1,
	entries: absoluteFeedback.entries.map((entry) => {
		if (!changedReviewedSources.has(entry.image)) return { ...entry, reasons: [...entry.reasons] }
		const feedback = candidateFeedbackByImage.get(entry.image)
		if (!feedback) throw new Error(`Candidate feedback is missing changed reviewed source ${entry.image}`)
		const shippable = methodIsShippable(feedback, "spatial")
		return {
			image: entry.image,
			shippable,
			reasons: shippable ? [] : [...entry.reasons],
			note: shippable ? "" : entry.note,
			decidedAt: feedback.timestamp,
		}
	}),
}
validateAbsoluteFeedbackStore(promotedAbsoluteFeedback, promotedSelection, promotedCuration)
const oldShippableTotal = absoluteFeedback.entries.filter((entry) => entry.shippable).length
const newShippableTotal = promotedAbsoluteFeedback.entries.filter((entry) => entry.shippable).length
if (oldShippableTotal !== 92 || newShippableTotal !== 95) {
	throw new Error(`Expected the reviewed 92-to-95 shippable transition, received ${oldShippableTotal}-to-${newShippableTotal}`)
}

function comparisonGroupSummary(group: { total: number; changedCount: number; unchangedCount: number; changedFiles: string[] }) {
	return {
		total: group.total,
		changedCount: group.changedCount,
		unchangedCount: group.unchangedCount,
		changedFiles: [...group.changedFiles],
	}
}

const comparisonSummary = {
	thresholds: report.thresholds,
	coverage: report.coverage,
	legacyResearch: {
		reviewable: comparisonGroupSummary(report.legacyResearch.reviewable),
		diagnostics: comparisonGroupSummary(report.legacyResearch.diagnostics),
	},
	accepted: comparisonGroupSummary(report.accepted),
	rejected: comparisonGroupSummary(report.rejected),
	unselectedHoldout: comparisonGroupSummary(report.unselectedHoldout),
	absoluteFeedback: {
		entries: promotedAbsoluteFeedback.entries.length,
		oldShippableTotal,
		newShippableTotal,
	},
}
const acceptance = {
	decision: "accepted" as const,
	changedReviewEntries: reviewFiles.length,
	changedRejectedTargets: changedRejected.size,
	candidatePreferredChangedRejectedTargets,
	candidateShippableChangedRejectedTargets,
	candidatePreferredReviewEntries,
	baselinePreferredReviewEntries,
	tiedReviewEntries,
	candidateShippableReviewEntries,
	baselineOnlyShippable,
	changedAcceptedEntries: report.accepted.changedCount,
	changedLegacyEntries: changedLegacyCount,
	changedUnselectedEntries: report.unselectedHoldout.changedCount,
}

const baselineCorpusArchive = {
	schemaVersion: 1,
	archivedAt: promotedAt,
	algorithmVersion: baselineAlgorithmVersion,
	checkpointCommit,
	holdoutResults: baselineHoldout,
	selection,
	curation,
	absoluteFeedback,
	holdoutSummary: baselineHoldoutSummaryValue,
	robustness: baselineRobustnessValue,
	baselineHoldoutSemanticSha256,
	baselineHoldoutRawSha256,
}
const candidateRoundArchive = {
	schemaVersion: 1,
	archivedAt: promotedAt,
	algorithmVersion: candidateAlgorithmVersion,
	baselineAlgorithmVersion,
	results: candidateResults,
	holdoutSummary: candidateHoldoutSummaryValue,
	robustness: candidateRobustnessValue,
	reviewProvenance: {
		algorithmVersion: reviewedAlgorithmVersion,
		results: reviewedResults,
		holdoutResults: reviewedHoldout,
		feedback: candidateFeedback,
		jointCertificates: reviewedJointCertificatesValue,
		holdoutJointCertificates: reviewedHoldoutJointCertificatesValue,
		jointCertificatesSha256: expectedReviewedJointCertificatesSha256,
		holdoutJointCertificatesSha256: expectedReviewedHoldoutJointCertificatesSha256,
		resultsSemanticSha256: reviewedResultsSemanticSha256,
		holdoutSemanticSha256: reviewedHoldoutSemanticSha256,
		resultsScientificSha256: reviewedResultsScientificSha256,
		holdoutScientificSha256: reviewedHoldoutScientificSha256,
		canonicalResultsScientificSha256: candidateResultsScientificSha256,
		canonicalHoldoutScientificSha256: candidateHoldoutScientificSha256,
	},
	comparisonSummary,
	candidateHoldoutSemanticSha256,
	acceptance,
}

const baselineArchivePath = join(roundsRoot, `${baselineAlgorithmVersion}-corpus-review.json`)
const candidateArchivePath = join(roundsRoot, `${candidateAlgorithmVersion}.json`)
if (baselineArchivePath === candidateArchivePath) throw new Error("Baseline and candidate archive paths must differ")
await requireMissing(baselineArchivePath)
await requireMissing(candidateArchivePath)

const snapshots = [
	{ path: baselineResultsPath, source: baselineResultsSource },
	{ path: baselineHoldoutPath, source: baselineHoldoutSource },
	{ path: selectionPath, source: selectionSource },
	{ path: curationPath, source: curationSource },
	{ path: absoluteFeedbackPath, source: absoluteFeedbackSource },
	{ path: baselineHoldoutSummaryPath, source: baselineHoldoutSummarySource },
	{ path: baselineRobustnessPath, source: baselineRobustnessSource },
	{ path: candidateResultsPath, source: candidateResultsSource },
	{ path: candidateHoldoutPath, source: candidateHoldoutSource },
	{ path: candidateHoldoutSummaryPath, source: candidateHoldoutSummarySource },
	{ path: candidateRobustnessPath, source: candidateRobustnessSource },
	{ path: reviewedResultsPath, source: reviewedResultsSource },
	{ path: reviewedHoldoutPath, source: reviewedHoldoutSource },
	{ path: reviewedFeedbackPath, source: reviewedFeedbackSource },
	{ path: reviewedJointCertificatesPath, source: reviewedJointCertificatesSource },
	{ path: reviewedHoldoutJointCertificatesPath, source: reviewedHoldoutJointCertificatesSource },
]
await assertSnapshotsUnchanged(snapshots)

const promotionSummary = {
	promoted: !dryRun,
	dryRun,
	baselineAlgorithmVersion,
	candidateAlgorithmVersion,
	reviewedAlgorithmVersion,
	reviewedScientificPayloadMatches: true,
	changedRejectedTargets: changedRejected.size,
	absoluteFeedback: {
		entries: promotedAbsoluteFeedback.entries.length,
		oldShippableTotal,
		newShippableTotal,
	},
	archives: {
		baselineCorpusReview: relative(projectRoot, baselineArchivePath),
		candidateRound: relative(projectRoot, candidateArchivePath),
	},
}

if (dryRun) {
	console.log(JSON.stringify(promotionSummary, null, 2))
	process.exit(0)
}

const archiveTargets = [
	{ path: baselineArchivePath, source: jsonSource(baselineCorpusArchive) },
	{ path: candidateArchivePath, source: jsonSource(candidateRoundArchive) },
]
const createdArchives: string[] = []
try {
	for (const archive of archiveTargets) {
		await publishArchive(archive.path, archive.source)
		createdArchives.push(archive.path)
	}
} catch (error) {
	await Promise.all(createdArchives.map((path) => rm(path, { force: true }).catch(() => undefined)))
	throw error
}

try {
	await assertSnapshotsUnchanged(snapshots)
} catch (error) {
	await Promise.all(createdArchives.map((path) => rm(path, { force: true }).catch(() => undefined)))
	throw error
}

const canonicalTargets = [
	{ path: baselineResultsPath, source: candidateResultsSource },
	{ path: baselineHoldoutPath, source: candidateHoldoutSource },
	{ path: selectionPath, source: jsonSource(promotedSelection) },
	{ path: curationPath, source: jsonSource(promotedCuration) },
	{ path: absoluteFeedbackPath, source: jsonSource(promotedAbsoluteFeedback) },
	{ path: baselineHoldoutSummaryPath, source: candidateHoldoutSummarySource },
	{ path: baselineRobustnessPath, source: candidateRobustnessSource },
]
const canonicalTemporaries: string[] = []
const rollbackLinks = canonicalTargets.map((target) =>
	join(dirname(target.path), `.${basename(target.path)}.${process.pid}.${randomUUID()}.rollback`))
const preservedRollbackLinks = new Set<string>()
let replacementsCompleted = 0
try {
	for (const target of canonicalTargets) {
		canonicalTemporaries.push(await writeSyncedTemporary(target.path, target.source, 0o644))
	}
	for (const [index, target] of canonicalTargets.entries()) await link(target.path, rollbackLinks[index])
	for (const [index, target] of canonicalTargets.entries()) {
		await rename(canonicalTemporaries[index], target.path)
		replacementsCompleted++
	}
} catch (error) {
	await Promise.all(canonicalTemporaries.map((path) => rm(path, { force: true }).catch(() => undefined)))
	const rollbackErrors: unknown[] = []
	for (let index = replacementsCompleted - 1; index >= 0; index--) {
		try {
			await rename(rollbackLinks[index], canonicalTargets[index].path)
		} catch (rollbackError) {
			preservedRollbackLinks.add(rollbackLinks[index])
			rollbackErrors.push(new Error(`Failed to restore ${canonicalTargets[index].path} from ${rollbackLinks[index]}`, {
				cause: rollbackError,
			}))
		}
	}
	if (rollbackErrors.length === 0) {
		await Promise.all(createdArchives.map((path) => rm(path, { force: true }).catch(() => undefined)))
	}
	if (rollbackErrors.length > 0) {
		throw new AggregateError([error, ...rollbackErrors], "Candidate promotion failed and canonical rollback was incomplete")
	}
	throw new Error("Candidate promotion write failed", { cause: error })
} finally {
	await Promise.all([...canonicalTemporaries, ...rollbackLinks.filter((path) => !preservedRollbackLinks.has(path))]
		.map((path) => rm(path, { force: true }).catch(() => undefined)))
}

console.log(JSON.stringify(promotionSummary, null, 2))
