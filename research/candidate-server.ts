import { createHash, randomUUID } from "node:crypto"
import { readFileSync, rmSync } from "node:fs"
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { hostname } from "node:os"
import { extname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCandidateComparisonReport } from "./src/candidate-comparison.ts"
import { validateCandidateArtifacts } from "./src/candidate-validation.ts"
import { validateCurationStore, type CurationStore } from "./src/corpus-curation.ts"
import {
	computeSemanticResultsSha256,
	selectionTracks,
	validateSelectionManifest,
	type SelectionManifest,
} from "./src/corpus-selection.ts"
import type { CorpusResult } from "./src/types.ts"

type Preference = "left" | "right" | "tie"
type ShipDecision = "left" | "right" | "both" | "neither"
type ReviewMethod = "spatial" | "previous"

type FeedbackInput = {
	image: string
	comparison: "iteration"
	leftMethod: ReviewMethod
	rightMethod: ReviewMethod
	preference: Preference
	ship: ShipDecision
	reasons: string[]
	note: string
}

type CandidateFeedback = FeedbackInput & {
	id: string
	timestamp: string
	reviewSchema: 2
	presentationVersion: 2
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
	presentationVersion: 2
	sourceHashes: Record<string, string>
	entries: CandidateFeedback[]
}

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const dataRoot = join(researchRoot, "data")
const reviewRoot = join(researchRoot, "review")
const imagesRoot = join(projectRoot, "images")
const candidateDirectoryValue = process.env.RESEARCH_CANDIDATE_DIR
if (!candidateDirectoryValue?.trim()) throw new Error("RESEARCH_CANDIDATE_DIR is required")
const candidateDirectory = isAbsolute(candidateDirectoryValue)
	? resolve(candidateDirectoryValue)
	: resolve(projectRoot, candidateDirectoryValue)
const candidateDirectoryStat = await stat(candidateDirectory).catch((error: unknown) => {
	throw new Error(`Unable to access candidate directory ${candidateDirectory}`, { cause: error })
})
if (!candidateDirectoryStat.isDirectory()) throw new Error(`Candidate path is not a directory: ${candidateDirectory}`)

const port = Number(process.env.PORT ?? 3102)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be an integer from 1 to 65535")
const presentationVersion = 2 as const
const feedbackPath = join(candidateDirectory, "feedback.json")
const candidateLockPath = join(candidateDirectory, ".candidate-server.lock")
const acceptedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
const acceptedOrigins = new Set([...acceptedHosts].map((host) => `http://${host}`))
const trustedBaseUrl = `http://127.0.0.1:${port}`

const preferences = new Set<Preference>(["left", "right", "tie"])
const shipDecisions = new Set<ShipDecision>(["left", "right", "both", "neither"])
const feedbackReasons = new Set([
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
const absoluteReasons = new Set(["background", "foreground", "surface", "accent", "gradient", "lacks-artwork-identity", "other"])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const expectedSet = new Set(expected)
	if (Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expectedSet.has(key))) {
		throw new Error(`${label} has unexpected or missing fields`)
	}
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

async function readJson(path: string): Promise<unknown> {
	let source: string
	try {
		source = await readFile(path, "utf8")
	} catch (error) {
		throw new Error(`Unable to read ${path}`, { cause: error })
	}
	try {
		return JSON.parse(source) as unknown
	} catch (error) {
		throw new Error(`Invalid JSON in ${path}`, { cause: error })
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

async function fileSha256(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

type CandidateLockOwner = {
	pid: number
	hostname: string
	startedAt: string
	token: string
}

const candidateLockOwner: CandidateLockOwner = {
	pid: process.pid,
	hostname: hostname(),
	startedAt: new Date().toISOString(),
	token: randomUUID(),
}
let candidateLockHeld = false
let server: ReturnType<typeof createServer> | undefined

function validCandidateLockOwner(value: unknown): value is CandidateLockOwner {
	return isRecord(value) && Number.isInteger(value.pid) && (value.pid as number) > 0 &&
		typeof value.hostname === "string" && value.hostname.length > 0 && validTimestamp(value.startedAt) &&
		typeof value.token === "string" && value.token.length > 0
}

function pidIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH"
	}
}

async function writeCandidateLock(): Promise<void> {
	await writeFile(candidateLockPath, `${JSON.stringify(candidateLockOwner)}\n`, { flag: "wx", mode: 0o600 })
	candidateLockHeld = true
}

async function acquireCandidateLock(): Promise<void> {
	try {
		await writeCandidateLock()
		return
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw new Error(`Unable to acquire candidate directory lock ${candidateLockPath}`, { cause: error })
		}
	}

	let existingSource: string
	try {
		existingSource = await readFile(candidateLockPath, "utf8")
	} catch (error) {
		throw new Error(`Candidate directory is locked and its owner cannot be inspected: ${candidateLockPath}`, { cause: error })
	}
	let existingValue: unknown
	try {
		existingValue = JSON.parse(existingSource) as unknown
	} catch (error) {
		throw new Error(`Candidate directory has an invalid lock file: ${candidateLockPath}`, { cause: error })
	}
	if (!validCandidateLockOwner(existingValue)) {
		throw new Error(`Candidate directory has an unverifiable lock owner: ${candidateLockPath}`)
	}
	if (existingValue.hostname !== candidateLockOwner.hostname) {
		throw new Error(`Candidate directory is locked by PID ${existingValue.pid} on ${existingValue.hostname}`)
	}
	if (pidIsAlive(existingValue.pid)) {
		throw new Error(`Candidate directory is locked by live PID ${existingValue.pid} on ${existingValue.hostname}`)
	}

	const currentSource = await readFile(candidateLockPath, "utf8").catch((error: unknown) => {
		throw new Error(`Candidate directory lock changed while reclaiming it: ${candidateLockPath}`, { cause: error })
	})
	if (currentSource !== existingSource) throw new Error(`Candidate directory lock changed while reclaiming it: ${candidateLockPath}`)
	await rm(candidateLockPath)
	try {
		await writeCandidateLock()
	} catch (error) {
		throw new Error(`Candidate directory became locked while reclaiming ${candidateLockPath}`, { cause: error })
	}
}

function releaseCandidateLock(): void {
	if (!candidateLockHeld) return
	try {
		const value = JSON.parse(readFileSync(candidateLockPath, "utf8")) as unknown
		if (validCandidateLockOwner(value) && value.token === candidateLockOwner.token &&
			value.pid === candidateLockOwner.pid && value.hostname === candidateLockOwner.hostname) {
			rmSync(candidateLockPath)
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`Unable to release candidate directory lock ${candidateLockPath}`)
		}
	} finally {
		candidateLockHeld = false
	}
}

let shuttingDown = false
function shutdown(exitCode: number): void {
	if (shuttingDown) return
	shuttingDown = true
	const finish = (error?: Error) => {
		releaseCandidateLock()
		process.exit(error ? 1 : exitCode)
	}
	if (server?.listening) server.close(finish)
	else finish()
}

await acquireCandidateLock()
process.once("exit", releaseCandidateLock)
process.once("SIGINT", () => shutdown(130))
process.once("SIGTERM", () => shutdown(143))

function validateAbsoluteFeedbackStore(value: unknown, selection: SelectionManifest, curation: CurationStore): void {
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
		value.algorithmVersion !== selection.algorithmVersion || value.semanticResultsSha256 !== selection.semanticResultsSha256 ||
		value.presentationVersion !== 1 || !Array.isArray(value.entries)) {
		throw new Error("Absolute feedback store does not match the frozen selection provenance")
	}
	const included = new Set(curation.entries.filter((entry) => entry.decision === "include").map((entry) => entry.image))
	if (value.entries.length !== included.size) throw new Error("Absolute feedback must exactly cover the curated sources")
	const seen = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Invalid absolute feedback entry")
		requireExactKeys(entryValue, ["image", "shippable", "reasons", "note", "decidedAt"], "Absolute feedback entry")
		if (typeof entryValue.image !== "string" || !included.has(entryValue.image) || seen.has(entryValue.image)) {
			throw new Error("Absolute feedback images are unknown or duplicated")
		}
		if (typeof entryValue.shippable !== "boolean" || !Array.isArray(entryValue.reasons) ||
			entryValue.reasons.some((reason) => typeof reason !== "string" || !absoluteReasons.has(reason)) ||
			new Set(entryValue.reasons).size !== entryValue.reasons.length ||
			(entryValue.shippable ? entryValue.reasons.length !== 0 : entryValue.reasons.length === 0)) {
			throw new Error("Invalid absolute feedback decision")
		}
		if (typeof entryValue.note !== "string" || entryValue.note.length > 500 ||
			(entryValue.reasons.includes("other") && entryValue.note.trim().length === 0)) {
			throw new Error("Invalid absolute feedback note")
		}
		if (!validTimestamp(entryValue.decidedAt)) throw new Error("Invalid absolute feedback timestamp")
		seen.add(entryValue.image)
	}
}

const baselineHoldoutPath = join(dataRoot, "holdout-results.json")
const [
	baselineResultsValue,
	baselineHoldoutSource,
	candidateResultsValue,
	candidateHoldoutValue,
	selectionValue,
	curationValue,
	absoluteFeedbackValue,
] = await Promise.all([
	readJson(join(dataRoot, "results.json")),
	readFile(baselineHoldoutPath),
	readJson(join(candidateDirectory, "results.json")),
	readJson(join(candidateDirectory, "holdout-results.json")),
	readJson(join(dataRoot, "selection.json")),
	readJson(join(dataRoot, "curation.json")),
	readJson(join(dataRoot, "absolute-feedback.json")),
])

let baselineHoldoutValue: unknown
try {
	baselineHoldoutValue = JSON.parse(baselineHoldoutSource.toString("utf8")) as unknown
} catch (error) {
	throw new Error(`Invalid JSON in ${baselineHoldoutPath}`, { cause: error })
}

const baselineValidation = validateCandidateArtifacts(baselineResultsValue, baselineHoldoutValue, "<baseline-validation>")
validateCandidateArtifacts(candidateResultsValue, candidateHoldoutValue, baselineValidation.algorithmVersion)
const report = buildCandidateComparisonReport({
	baselineResults: baselineResultsValue,
	baselineHoldoutResults: baselineHoldoutValue,
	candidateResults: candidateResultsValue,
	candidateHoldoutResults: candidateHoldoutValue,
	curation: curationValue,
	absoluteFeedback: absoluteFeedbackValue,
})
const baselineResults = baselineResultsValue as CorpusResult
const baselineHoldout = baselineHoldoutValue as CorpusResult
const candidateResults = candidateResultsValue as CorpusResult
const candidateHoldout = candidateHoldoutValue as CorpusResult

const baselineHoldoutSourceSha256 = createHash("sha256").update(baselineHoldoutSource).digest("hex")
validateSelectionManifest(selectionValue, baselineHoldout, baselineHoldoutSourceSha256)
const selection = selectionValue
validateCurationStore(selection, curationValue)
const curation = curationValue
if (curation.frozenAt === null) throw new Error("Curation store must be frozen before candidate review")
validateAbsoluteFeedbackStore(absoluteFeedbackValue, selection, curation)

const changedLegacy = new Set(report.legacyResearch.reviewable.changedFiles)
const changedCurated = new Set([...report.accepted.changedFiles, ...report.rejected.changedFiles])
const reviewFiles = [
	...baselineResults.entries.filter((entry) => changedLegacy.has(entry.file)).map((entry) => entry.file),
	...baselineHoldout.entries.filter((entry) => changedCurated.has(entry.file)).map((entry) => entry.file),
]
if (reviewFiles.length === 0) throw new Error("Candidate has no perceptually changed review entries")
if (new Set(reviewFiles).size !== reviewFiles.length ||
	reviewFiles.length !== changedLegacy.size + changedCurated.size) {
	throw new Error("Candidate comparison produced missing or duplicated review entries")
}

const reviewFileSet = new Set(reviewFiles)
const sourceHashes: Record<string, string> = {}
for (const candidate of selectionTracks.flatMap((track) => selection.tracks[track])) {
	const digest = await fileSha256(sourcePath(candidate.file))
	if (digest !== candidate.sha256) throw new Error(`On-disk SHA-256 does not match selection for ${candidate.file}`)
	if (reviewFileSet.has(candidate.file)) sourceHashes[candidate.file] = digest
}
for (const file of reviewFiles) {
	if (!(file in sourceHashes)) sourceHashes[file] = await fileSha256(sourcePath(file))
}

const baselineEntries = new Map([...baselineResults.entries, ...baselineHoldout.entries].map((entry) => [entry.file, entry]))
const candidateEntries = new Map([...candidateResults.entries, ...candidateHoldout.entries].map((entry) => [entry.file, entry]))
const responseResults: CorpusResult = {
	generatedAt: candidateResults.generatedAt,
	algorithmVersion: candidateResults.algorithmVersion,
	entries: reviewFiles.map((file) => ({ ...candidateEntries.get(file)!, review: true })),
}
const responsePreviousResults: CorpusResult = {
	generatedAt: baselineResults.generatedAt,
	algorithmVersion: baselineResults.algorithmVersion,
	entries: reviewFiles.map((file) => ({ ...baselineEntries.get(file)!, review: true })),
}

const expectedFeedbackStore = {
	schemaVersion: 1 as const,
	baselineAlgorithmVersion: baselineResults.algorithmVersion,
	baselineResultsSemanticSha256: computeSemanticResultsSha256(baselineResults),
	baselineHoldoutSemanticSha256: computeSemanticResultsSha256(baselineHoldout),
	candidateAlgorithmVersion: candidateResults.algorithmVersion,
	candidateResultsSemanticSha256: computeSemanticResultsSha256(candidateResults),
	candidateHoldoutSemanticSha256: computeSemanticResultsSha256(candidateHoldout),
	selectionManifestId: selection.manifestId,
	presentationVersion,
	sourceHashes,
}

function validateReasonList(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((reason) => typeof reason !== "string" || !feedbackReasons.has(reason)) ||
		new Set(value).size !== value.length) throw new Error("Invalid reasons")
	return [...value] as string[]
}

function reviewMethodsFor(image: string): readonly [ReviewMethod, ReviewMethod] {
	let result = 2166136261
	const value = `${image}:iteration`
	for (let index = 0; index < value.length; index++) {
		result = Math.imul(result ^ value.charCodeAt(index), 16777619)
	}
	return (result >>> 0) % 2 === 0 ? ["spatial", "previous"] : ["previous", "spatial"]
}

function validateFeedbackInput(value: unknown): FeedbackInput {
	if (!isRecord(value)) throw new Error("Expected an object")
	requireExactKeys(value, ["image", "comparison", "leftMethod", "rightMethod", "preference", "ship", "reasons", "note"], "Feedback")
	if (typeof value.image !== "string" || !reviewFileSet.has(value.image)) throw new Error("Unknown image")
	if (value.comparison !== "iteration") throw new Error("Only iteration comparisons are accepted")
	const [leftMethod, rightMethod] = reviewMethodsFor(value.image)
	if (value.leftMethod !== leftMethod || value.rightMethod !== rightMethod) {
		throw new Error("Review method order does not match the deterministic presentation")
	}
	if (typeof value.preference !== "string" || !preferences.has(value.preference as Preference)) throw new Error("Invalid preference")
	if (typeof value.ship !== "string" || !shipDecisions.has(value.ship as ShipDecision)) throw new Error("Invalid ship decision")
	const reasons = validateReasonList(value.reasons)
	if (typeof value.note !== "string" || value.note.length > 500) throw new Error("Invalid note")
	return {
		image: value.image,
		comparison: "iteration",
		leftMethod,
		rightMethod,
		preference: value.preference as Preference,
		ship: value.ship as ShipDecision,
		reasons,
		note: value.note,
	}
}

function validateFeedbackStore(value: unknown): asserts value is CandidateFeedbackStore {
	if (!isRecord(value)) throw new Error("Candidate feedback store must be an object")
	requireExactKeys(value, [...Object.keys(expectedFeedbackStore), "entries"], "Candidate feedback store")
	for (const [key, expected] of Object.entries(expectedFeedbackStore)) {
		if (key === "sourceHashes") continue
		if (value[key] !== expected) throw new Error("Candidate feedback provenance does not match the current artifacts")
	}
	const storedSourceHashes = value.sourceHashes
	if (!isRecord(storedSourceHashes) || Object.keys(storedSourceHashes).length !== reviewFiles.length ||
		reviewFiles.some((file) => storedSourceHashes[file] !== sourceHashes[file])) {
		throw new Error("Candidate feedback source hashes do not match the review queue")
	}
	if (!Array.isArray(value.entries) || value.entries.length > reviewFiles.length) throw new Error("Invalid candidate feedback entries")
	const ids = new Set<string>()
	const images = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Invalid candidate feedback entry")
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
		validateFeedbackInput(Object.fromEntries(Object.entries(entryValue).filter(([key]) =>
			!["id", "timestamp", "reviewSchema", "presentationVersion", "algorithmVersion", "previousAlgorithmVersion"].includes(key))))
		if (typeof entryValue.id !== "string" || entryValue.id.length === 0 || ids.has(entryValue.id) || images.has(entryValue.image as string)) {
			throw new Error("Candidate feedback entries are duplicated")
		}
		if (!validTimestamp(entryValue.timestamp) || entryValue.reviewSchema !== 2 ||
			entryValue.presentationVersion !== presentationVersion || entryValue.algorithmVersion !== candidateResults.algorithmVersion ||
			entryValue.previousAlgorithmVersion !== baselineResults.algorithmVersion) {
			throw new Error("Candidate feedback entry provenance is invalid")
		}
		ids.add(entryValue.id)
		images.add(entryValue.image as string)
	}
}

function emptyFeedbackStore(): CandidateFeedbackStore {
	return { ...expectedFeedbackStore, sourceHashes: { ...sourceHashes }, entries: [] }
}

async function loadFeedbackStore(): Promise<CandidateFeedbackStore> {
	let source: string
	try {
		source = await readFile(feedbackPath, "utf8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyFeedbackStore()
		throw new Error(`Unable to read ${feedbackPath}`, { cause: error })
	}
	let value: unknown
	try {
		value = JSON.parse(source) as unknown
	} catch (error) {
		throw new Error(`Invalid JSON in ${feedbackPath}`, { cause: error })
	}
	validateFeedbackStore(value)
	return value
}

async function writeFeedbackStore(value: CandidateFeedbackStore): Promise<void> {
	const temporary = `${feedbackPath}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await rename(temporary, feedbackPath)
	} finally {
		await rm(temporary, { force: true })
	}
}

await loadFeedbackStore()

let feedbackMutationQueue: Promise<void> = Promise.resolve()

function serializeFeedbackMutation<T>(mutation: () => Promise<T>): Promise<T> {
	const result = feedbackMutationQueue.then(mutation, mutation)
	feedbackMutationQueue = result.then(() => undefined, () => undefined)
	return result
}

function json(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
	})
	response.end(JSON.stringify(value))
}

function text(response: ServerResponse, status: number, value: string, contentType = "text/plain; charset=utf-8"): void {
	response.writeHead(status, { "content-type": contentType, "cache-control": "no-store", "x-content-type-options": "nosniff" })
	response.end(value)
}

async function body(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let length = 0
	for await (const chunk of request) {
		const buffer = Buffer.from(chunk)
		length += buffer.length
		if (length > 32_768) throw new HttpError(413, "Request body is too large")
		chunks.push(buffer)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

class HttpError extends Error {
	readonly status: number

	constructor(status: number, message: string) {
		super(message)
		this.status = status
	}
}

function requireJsonMutation(request: IncomingMessage): void {
	const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase()
	if (contentType !== "application/json") throw new HttpError(415, "POST requests require application/json")
	if (request.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-origin mutations are not allowed")
	const origin = request.headers.origin
	if (!origin) return
	if (!acceptedOrigins.has(origin)) throw new HttpError(403, "Cross-origin mutations are not allowed")
}

const staticFiles = new Map<string, readonly [string, string]>([
	["/", ["index.html", "text/html; charset=utf-8"]],
	["/index.html", ["index.html", "text/html; charset=utf-8"]],
	["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
	["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
])

const contentTypes: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".avif": "image/avif",
	".webp": "image/webp",
}

server = createServer(async (request, response) => {
	try {
		const host = request.headers.host?.toLowerCase()
		if (!host || !acceptedHosts.has(host)) throw new HttpError(400, "Invalid Host")
		const url = new URL(request.url || "/", trustedBaseUrl)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const [file, contentType] = staticFiles.get(url.pathname)!
			text(response, 200, await readFile(join(reviewRoot, file), "utf8"), contentType)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			json(response, 200, {
				results: responseResults,
				previousResults: responsePreviousResults,
				presentationVersion,
				feedback: await loadFeedbackStore(),
				carriedReviews: [],
				iterationOnly: true,
			})
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			requireJsonMutation(request)
			const value = validateFeedbackInput(await body(request))
			const entry = await serializeFeedbackMutation(async (): Promise<CandidateFeedback> => {
				const store = await loadFeedbackStore()
				if (store.entries.some((item) => item.image === value.image)) {
					throw new HttpError(409, "Feedback already submitted for this image")
				}
				const feedback: CandidateFeedback = {
					...value,
					id: randomUUID(),
					timestamp: new Date().toISOString(),
					reviewSchema: 2,
					presentationVersion,
					algorithmVersion: candidateResults.algorithmVersion,
					previousAlgorithmVersion: baselineResults.algorithmVersion,
				}
				store.entries.push(feedback)
				validateFeedbackStore(store)
				await writeFeedbackStore(store)
				return feedback
			})
			json(response, 201, entry)
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/images/")) {
			const file = decodeURIComponent(url.pathname.slice("/images/".length))
			if (!reviewFileSet.has(file)) {
				text(response, 404, "Not found")
				return
			}
			let imageSource: Buffer
			try {
				imageSource = await readFile(sourcePath(file))
			} catch (error) {
				const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500
				throw new HttpError(status, "Unable to read image source")
			}
			const digest = createHash("sha256").update(imageSource).digest("hex")
			if (digest !== sourceHashes[file]) throw new HttpError(409, "Image source changed after review initialization")
			response.writeHead(200, {
				"content-type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream",
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
			})
			response.end(imageSource)
			return
		}
		text(response, 404, "Not found")
	} catch (error) {
		const status = error instanceof HttpError ? error.status : 400
		if (!response.headersSent) json(response, status, { error: error instanceof Error ? error.message : String(error) })
		else response.destroy(error instanceof Error ? error : undefined)
	}
})

server.listen(port, "127.0.0.1", () => {
	console.log(`Palette candidate review (${reviewFiles.length} entries): http://127.0.0.1:${port}`)
})
