import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	acceptedCandidates,
	curationExhausted,
	curationProgress,
	curationReasonValues,
	pendingCandidates,
	selectionCandidateMap,
	validateCurationStore,
	type CurationStore,
} from "./src/corpus-curation.ts"
import { selectionTracks, validateSelectionManifest, type SelectionCandidate } from "./src/corpus-selection.ts"
import { findCarriedReviews, hasSubmittedFeedback } from "./src/review-queue.ts"
import {
	buildReviewColorNames,
	REVIEW_COLOR_NAME_POLICY,
	REVIEW_PRESENTATION_VERSION,
} from "./src/review-presentation.ts"
import type { CorpusResult } from "./src/types.ts"

type Preference = "left" | "right" | "tie"
type ShipDecision = "left" | "right" | "both" | "neither"
type Feedback = {
	id: string
	timestamp: string
	reviewSchema: 2
	presentationVersion: 3
	image: string
	comparison: "iteration" | "baseline" | "variant"
	leftMethod: "spatial" | "expressive" | "quantized" | "previous"
	rightMethod: "spatial" | "expressive" | "quantized" | "previous"
	preference: Preference
	ship: ShipDecision
	reasons: string[]
	note: string
	algorithmVersion: string
	previousAlgorithmVersion: string
}

type FeedbackStore = {
	schemaVersion: 2
	entries: Array<Feedback | Record<string, unknown>>
}

type AbsoluteFeedback = {
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
	entries: AbsoluteFeedback[]
}

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = join(researchRoot, "review")
const imagesRoot = join(projectRoot, "images")
const resultsPath = join(researchRoot, "data", "results.json")
const holdoutResultsPath = join(researchRoot, "data", "holdout-results.json")
const feedbackPath = join(researchRoot, "data", "feedback.json")
const selectionPath = join(researchRoot, "data", "selection.json")
const curationPath = join(researchRoot, "data", "curation.json")
const absoluteFeedbackPath = join(researchRoot, "data", "absolute-feedback.json")
const roundsRoot = join(researchRoot, "data", "rounds")
const previousRoundPath = join(roundsRoot, "region-graph-0.13.0.json")
const port = Number(process.env.PORT || 3100)
const pairwisePresentationVersion = REVIEW_PRESENTATION_VERSION
const absolutePresentationVersion = 1

const results = JSON.parse(await readFile(resultsPath, "utf8")) as CorpusResult
const holdoutResultsSource = await readFile(holdoutResultsPath)
const sourceResultsSha256 = createHash("sha256").update(holdoutResultsSource).digest("hex")
const holdoutResults = JSON.parse(holdoutResultsSource.toString("utf8")) as CorpusResult
const selectionValue: unknown = JSON.parse(await readFile(selectionPath, "utf8"))
if (holdoutResults.algorithmVersion !== results.algorithmVersion) {
	throw new Error(`Holdout results use ${holdoutResults.algorithmVersion}, expected ${results.algorithmVersion}`)
}
validateSelectionManifest(selectionValue, holdoutResults, sourceResultsSha256)
const selection = selectionValue
for (const candidate of selectionTracks.flatMap((track) => selection.tracks[track])) {
	const path = candidate.file.startsWith("00/") ? join(projectRoot, candidate.file) : join(imagesRoot, candidate.file)
	const digest = createHash("sha256").update(await readFile(path)).digest("hex")
	if (digest !== candidate.sha256) throw new Error(`On-disk SHA-256 does not match selection for ${candidate.file}`)
}
const galleryDataRoot = process.env.GALLERY_DATA_DIR ? resolve(researchRoot, process.env.GALLERY_DATA_DIR) : null
const galleryDevelopment = galleryDataRoot
	? JSON.parse(await readFile(join(galleryDataRoot, "results.json"), "utf8")) as CorpusResult
	: results
const galleryHoldout = galleryDataRoot
	? JSON.parse(await readFile(join(galleryDataRoot, "holdout-results.json"), "utf8")) as CorpusResult
	: holdoutResults
if (galleryDevelopment.algorithmVersion !== galleryHoldout.algorithmVersion) {
	throw new Error("Gallery development and holdout algorithm versions differ")
}
if (galleryDevelopment.entries.length !== results.entries.length || galleryHoldout.entries.length !== holdoutResults.entries.length) {
	throw new Error("Gallery override corpus coverage differs from canonical data")
}
const galleryResults: CorpusResult = {
	generatedAt: galleryHoldout.generatedAt,
	algorithmVersion: galleryDevelopment.algorithmVersion,
	entries: [...galleryDevelopment.entries, ...galleryHoldout.entries],
}
const previousRound = JSON.parse(await readFile(previousRoundPath, "utf8")) as { results: CorpusResult }
const previousResults = previousRound.results
const reviewColorNames = buildReviewColorNames(results, previousResults)
const archivedResults = new Map<string, CorpusResult>()
for (const file of await readdir(roundsRoot)) {
	if (!file.endsWith(".json")) continue
	const archive = JSON.parse(await readFile(join(roundsRoot, file), "utf8")) as { results?: CorpusResult }
	if (archive.results?.algorithmVersion) archivedResults.set(archive.results.algorithmVersion, archive.results)
}
const knownImages = new Set(results.entries.map((entry) => entry.file))
const knownGalleryImages = new Set(galleryResults.entries.map((entry) => entry.file))
const selectionCandidates = selectionCandidateMap(selection)
const holdoutEntries = new Map(holdoutResults.entries.map((entry) => [entry.file, entry]))
const methods = new Set(["spatial", "expressive", "quantized", "previous"])
const preferences = new Set<Preference>(["left", "right", "tie"])
const shipDecisions = new Set<ShipDecision>(["left", "right", "both", "neither"])
const comparisons = new Set(["iteration", "baseline", "variant"])
const comparisonMethodPairs = {
	iteration: ["spatial", "previous"],
	baseline: ["spatial", "quantized"],
	variant: ["spatial", "expressive"],
} as const
const reasons = new Set([
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
const curationReasons = new Set<string>(curationReasonValues)
const absoluteReasons = new Set(["background", "foreground", "surface", "accent", "gradient", "lacks-artwork-identity", "other"])

async function loadFeedback(): Promise<FeedbackStore> {
	try {
		const parsed = JSON.parse(await readFile(feedbackPath, "utf8")) as { schemaVersion?: number; entries?: Array<Record<string, unknown>> }
		if (![1, 2].includes(parsed.schemaVersion || 0) || !Array.isArray(parsed.entries)) {
			throw new Error("Unsupported feedback schema")
		}
		return { schemaVersion: 2, entries: parsed.entries }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		return { schemaVersion: 2, entries: [] }
	}
}

async function writeFeedback(value: FeedbackStore): Promise<void> {
	await mkdir(join(researchRoot, "data"), { recursive: true })
	const temporary = `${feedbackPath}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, feedbackPath)
}

async function readStore(path: string, fallback: () => unknown): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		return fallback()
	}
}

async function writeStore(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

async function loadCurationStore(): Promise<CurationStore> {
	const value = await readStore(curationPath, () => ({
		schemaVersion: 3,
		manifestId: selection.manifestId,
		semanticResultsSha256: selection.semanticResultsSha256,
		frozenAt: null,
		entries: [],
	}))
	validateCurationStore(selection, value)
	return value
}

async function loadAbsoluteStore(curation: CurationStore): Promise<AbsoluteFeedbackStore> {
	const value = await readStore(absoluteFeedbackPath, () => ({
		schemaVersion: 3,
		manifestId: selection.manifestId,
		algorithmVersion: selection.algorithmVersion,
		semanticResultsSha256: selection.semanticResultsSha256,
		presentationVersion: absolutePresentationVersion,
		entries: [],
	}))
	validateAbsoluteFeedbackStore(value, curation)
	return value
}

function curationState(store: CurationStore) {
	const progress = curationProgress(selection, store)
	const pending = pendingCandidates(selection, store)
	const exhausted = curationExhausted(selection, store)
	const nextByTrack = selectionTracks.flatMap((track) => pending.find((candidate) => candidate.track === track) ?? [])
	const next = exhausted ? null : [...nextByTrack].sort((left, right) => {
		const leftRatio = progress.tracks[left.track].accepted / progress.tracks[left.track].quota
		const rightRatio = progress.tracks[right.track].accepted / progress.tracks[right.track].quota
		return leftRatio - rightRatio || selectionTracks.indexOf(left.track) - selectionTracks.indexOf(right.track)
	})[0] ?? null
	return { progress, next, exhausted }
}

async function curationPayload() {
	const store = await loadCurationStore()
	return { store, ...curationState(store) }
}

async function ensureCurationFrozen(store: CurationStore): Promise<void> {
	if (store.frozenAt !== null) return
	if (!curationProgress(selection, store).complete) throw new Error("Incomplete curation cannot be frozen")
	store.frozenAt = new Date().toISOString()
	validateCurationStore(selection, store)
	await writeStore(curationPath, store)
}

function publicProgress(progress: ReturnType<typeof curationProgress>) {
	return {
		target: progress.target,
		accepted: progress.accepted,
		vetoed: progress.vetoed,
		screened: progress.screened,
		complete: progress.complete,
	}
}

function sourceDto(candidate: SelectionCandidate) {
	return {
		file: candidate.file,
		sha256: candidate.sha256,
		width: candidate.width,
		height: candidate.height,
	}
}

let storeMutationQueue: Promise<void> = Promise.resolve()

function serializeStoreMutation<T>(mutation: () => Promise<T>): Promise<T> {
	const result = storeMutationQueue.then(mutation, mutation)
	storeMutationQueue = result.then(() => undefined, () => undefined)
	return result
}

function json(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
	response.end(JSON.stringify(value))
}

function text(response: ServerResponse, status: number, value: string, contentType = "text/plain; charset=utf-8"): void {
	response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" })
	response.end(value)
}

async function body(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let length = 0
	for await (const chunk of request) {
		const buffer = Buffer.from(chunk)
		length += buffer.length
		if (length > 32_768) throw new Error("Request body is too large")
		chunks.push(buffer)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

class HttpError extends Error {
	readonly status: number

	constructor(status: number, message: string) {
		super(message)
		this.status = status
	}
}

function requireJsonMutation(request: IncomingMessage, url: URL): void {
	const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase()
	if (contentType !== "application/json") throw new HttpError(415, "POST requests require application/json")
	const origin = request.headers.origin
	if (origin) {
		let originValue: string
		try {
			originValue = new URL(origin).origin
		} catch {
			throw new HttpError(403, "Invalid Origin")
		}
		if (originValue !== url.origin) throw new HttpError(403, "Cross-origin mutations are not allowed")
	}
}

function validateFeedback(input: unknown): Omit<Feedback, "id" | "timestamp" | "algorithmVersion" | "previousAlgorithmVersion" | "reviewSchema" | "presentationVersion"> {
	if (!input || typeof input !== "object") throw new Error("Expected an object")
	const value = input as Record<string, unknown>
	if (typeof value.image !== "string" || !knownImages.has(value.image)) throw new Error("Unknown image")
	if (typeof value.comparison !== "string" || !comparisons.has(value.comparison)) throw new Error("Invalid comparison")
	if (typeof value.leftMethod !== "string" || !methods.has(value.leftMethod)) throw new Error("Invalid left method")
	if (typeof value.rightMethod !== "string" || !methods.has(value.rightMethod)) throw new Error("Invalid right method")
	if (value.leftMethod === value.rightMethod) throw new Error("Methods must differ")
	const expectedMethods = comparisonMethodPairs[value.comparison as keyof typeof comparisonMethodPairs]
	if (!expectedMethods || !(
		(value.leftMethod === expectedMethods[0] && value.rightMethod === expectedMethods[1]) ||
		(value.leftMethod === expectedMethods[1] && value.rightMethod === expectedMethods[0])
	)) {
		throw new Error("Methods do not match the comparison")
	}
	if (typeof value.preference !== "string" || !preferences.has(value.preference as Preference)) throw new Error("Invalid preference")
	if (typeof value.ship !== "string" || !shipDecisions.has(value.ship as ShipDecision)) throw new Error("Invalid ship decision")
	if (!Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string" || !reasons.has(reason))) {
		throw new Error("Invalid reasons")
	}
	if (typeof value.note !== "string" || value.note.length > 500) throw new Error("Invalid note")
	return value as Omit<Feedback, "id" | "timestamp" | "algorithmVersion" | "previousAlgorithmVersion" | "reviewSchema" | "presentationVersion">
}

function validateReasonList(value: unknown, allowed: Set<string>): string[] {
	if (!Array.isArray(value) || value.some((reason) => typeof reason !== "string" || !allowed.has(reason)) || new Set(value).size !== value.length) {
		throw new Error("Invalid reasons")
	}
	return value as string[]
}

function validateNote(value: unknown): string {
	if (typeof value !== "string" || value.length > 500) throw new Error("Invalid note")
	return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateAbsoluteFeedbackStore(value: unknown, curation: CurationStore): asserts value is AbsoluteFeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 3 || value.manifestId !== selection.manifestId ||
		value.algorithmVersion !== selection.algorithmVersion || value.semanticResultsSha256 !== selection.semanticResultsSha256 ||
		value.presentationVersion !== absolutePresentationVersion || !Array.isArray(value.entries)) {
		throw new Error("Absolute feedback store does not match the current selection provenance")
	}
	const progress = curationProgress(selection, curation)
	if (value.entries.length > 0 && !progress.complete) throw new Error("Absolute feedback requires complete curation")
	if (value.entries.length > 0 && curation.frozenAt === null) throw new Error("Absolute feedback requires frozen curation")
	const accepted = new Set(acceptedCandidates(selection, curation).map((candidate) => candidate.file))
	const seen = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Invalid absolute feedback entry")
		const entry = entryValue as Record<string, unknown>
		if (typeof entry.image !== "string" || !accepted.has(entry.image)) throw new Error("Unknown absolute feedback image")
		if (seen.has(entry.image)) throw new Error(`Duplicate absolute feedback for ${entry.image}`)
		if (typeof entry.shippable !== "boolean") throw new Error("Invalid absolute feedback decision")
		if (!Array.isArray(entry.reasons) || entry.reasons.some((reason) => typeof reason !== "string" || !absoluteReasons.has(reason)) ||
			new Set(entry.reasons).size !== entry.reasons.length) throw new Error("Invalid absolute feedback reasons")
		if (entry.shippable && entry.reasons.length !== 0) throw new Error("Shippable palettes cannot have failure reasons")
		if (!entry.shippable && entry.reasons.length === 0) throw new Error("An unshippable palette requires at least one reason")
		if (typeof entry.note !== "string" || entry.note.length > 500) throw new Error("Invalid absolute feedback note")
		if (entry.reasons.includes("other") && entry.note.trim().length === 0) throw new Error("The other reason requires a note")
		if (typeof entry.decidedAt !== "string" || !Number.isFinite(Date.parse(entry.decidedAt)) ||
			new Date(entry.decidedAt).toISOString() !== entry.decidedAt) {
			throw new Error("Invalid absolute feedback timestamp")
		}
		seen.add(entry.image)
	}
}

await loadAbsoluteStore(await loadCurationStore())

const staticFiles = new Map<string, readonly [string, string]>([
	["/", ["index.html", "text/html; charset=utf-8"]],
	["/app.js", ["app-v2.js", "text/javascript; charset=utf-8"]],
	["/app-v1.js", ["app.js", "text/javascript; charset=utf-8"]],
	["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
	["/gallery", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery/", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery.html", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery.js", ["gallery.js", "text/javascript; charset=utf-8"]],
	["/gallery.css", ["gallery.css", "text/css; charset=utf-8"]],
	["/curate", ["curate.html", "text/html; charset=utf-8"]],
	["/curate/", ["curate.html", "text/html; charset=utf-8"]],
	["/curate.js", ["curate.js", "text/javascript; charset=utf-8"]],
	["/absolute", ["absolute.html", "text/html; charset=utf-8"]],
	["/absolute/", ["absolute.html", "text/html; charset=utf-8"]],
	["/absolute.js", ["absolute.js", "text/javascript; charset=utf-8"]],
	["/corpus.css", ["corpus.css", "text/css; charset=utf-8"]],
])

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const [file, contentType] = staticFiles.get(url.pathname)!
			text(response, 200, await readFile(join(reviewRoot, file), "utf8"), contentType)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/curation") {
			const { store, progress, next, exhausted } = await curationPayload()
			json(response, 200, {
				progress: publicProgress(progress),
				next: next ? sourceDto(next) : null,
				exhausted,
				frozen: store.frozenAt !== null,
				recent: [...store.entries].reverse(),
			})
			return
		}
		if (request.method === "POST" && url.pathname === "/api/curation") {
			requireJsonMutation(request, url)
			const input = await body(request)
			if (!isRecord(input)) throw new Error("Expected an object")
			const value = input
			const candidate = typeof value.image === "string" ? selectionCandidates.get(value.image) : undefined
			if (!candidate) throw new Error("Unknown selection candidate")
			if (value.decision !== "include" && value.decision !== "veto") throw new Error("Invalid eligibility decision")
			const decision = value.decision
			const decisionReasons = validateReasonList(value.reasons, curationReasons)
			const note = validateNote(value.note)
			if (decision === "include" && decisionReasons.length !== 0) throw new Error("Included sources cannot have veto reasons")
			if (decision === "veto" && decisionReasons.length === 0) throw new Error("A veto requires at least one reason")
			if (decisionReasons.includes("other") && note.length === 0) throw new Error("The other reason requires a note")
			await serializeStoreMutation(async () => {
				const store = await loadCurationStore()
				if (store.frozenAt !== null) throw new HttpError(409, "Curation is frozen")
				const { progress, next, exhausted } = curationState(store)
				if (exhausted) throw new HttpError(409, "Selection candidates are exhausted before curation is complete")
				if (next?.file !== candidate.file) throw new HttpError(409, "Curation submission is stale or out of order")
				if (decision === "include" && progress.tracks[candidate.track].accepted >= selection.quotas[candidate.track]) {
					throw new HttpError(409, "This selection track is already complete")
				}
				store.entries.push({
					image: candidate.file,
					decision,
					reasons: decisionReasons,
					note,
					decidedAt: new Date().toISOString(),
				})
				validateCurationStore(selection, store)
				await writeStore(curationPath, store)
			})
			json(response, 201, { ok: true })
			return
		}
		if (request.method === "DELETE" && url.pathname === "/api/curation") {
			const image = url.searchParams.get("image")
			if (!image || !selectionCandidates.has(image)) throw new Error("Unknown selection candidate")
			await serializeStoreMutation(async () => {
				const store = await loadCurationStore()
				if (store.frozenAt !== null) throw new HttpError(409, "Curation is frozen")
				if (!store.entries.some((entry) => entry.image === image)) throw new HttpError(404, "Curation decision not found")
				store.entries = store.entries.filter((entry) => entry.image !== image)
				await writeStore(curationPath, store)
			})
			json(response, 200, { ok: true })
			return
		}
		if (request.method === "GET" && url.pathname === "/api/absolute") {
			const payload = await serializeStoreMutation(async () => {
				const store = await loadCurationStore()
				const progress = curationProgress(selection, store)
				if (!progress.complete) return { locked: true as const, progress: publicProgress(progress) }
				await ensureCurationFrozen(store)
				const feedback = await loadAbsoluteStore(store)
				const accepted = acceptedCandidates(selection, store)
				const reviewed = new Set(feedback.entries.map((entry) => entry.image))
				const candidate = accepted.find((entry) => !reviewed.has(entry.file)) ?? null
				const next = candidate ? {
					...sourceDto(candidate),
					palette: holdoutEntries.get(candidate.file)!.extraction.methods.spatial,
				} : null
				return {
					locked: false as const,
					value: {
						algorithmVersion: holdoutResults.algorithmVersion,
						total: accepted.length,
						reviewed: accepted.filter((entry) => reviewed.has(entry.file)).length,
						next,
						recent: [...feedback.entries].reverse(),
					},
				}
			})
			if (payload.locked) {
				json(response, 409, { error: "Source eligibility must be completed before palette review", progress: payload.progress })
				return
			}
			json(response, 200, payload.value)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/absolute") {
			requireJsonMutation(request, url)
			const input = await body(request)
			if (!isRecord(input)) throw new Error("Expected an object")
			const value = input
			if (typeof value.image !== "string" || !selectionCandidates.has(value.image)) throw new Error("Unknown selection candidate")
			const image = value.image
			if (typeof value.shippable !== "boolean") throw new Error("Invalid shippability decision")
			const shippable = value.shippable
			const decisionReasons = validateReasonList(value.reasons, absoluteReasons)
			const note = validateNote(value.note)
			if (shippable && decisionReasons.length !== 0) throw new Error("Shippable palettes cannot have failure reasons")
			if (!shippable && decisionReasons.length === 0) throw new Error("An unshippable palette requires at least one reason")
			if (decisionReasons.includes("other") && note.length === 0) throw new Error("The other reason requires a note")
			const entry = await serializeStoreMutation(async (): Promise<AbsoluteFeedback> => {
				const store = await loadCurationStore()
				const progress = curationProgress(selection, store)
				if (!progress.complete) throw new HttpError(409, "Source eligibility must be completed before palette review")
				await ensureCurationFrozen(store)
				const feedback = await loadAbsoluteStore(store)
				if (feedback.entries.some((item) => item.image === image)) {
					throw new HttpError(409, "Absolute feedback already exists for this image")
				}
				const reviewed = new Set(feedback.entries.map((item) => item.image))
				const next = acceptedCandidates(selection, store).find((candidate) => !reviewed.has(candidate.file))
				if (next?.file !== image) throw new HttpError(409, "Absolute feedback submission is stale or out of order")
				const decision: AbsoluteFeedback = { image, shippable, reasons: decisionReasons, note, decidedAt: new Date().toISOString() }
				feedback.entries.push(decision)
				validateAbsoluteFeedbackStore(feedback, store)
				await writeStore(absoluteFeedbackPath, feedback)
				return decision
			})
			json(response, 201, entry)
			return
		}
		if (request.method === "DELETE" && url.pathname === "/api/absolute") {
			const image = url.searchParams.get("image")
			if (!image) throw new Error("Missing image")
			await serializeStoreMutation(async () => {
				const store = await loadCurationStore()
				if (!curationProgress(selection, store).complete) {
					throw new HttpError(409, "Source eligibility must be completed before changing palette review")
				}
				const feedback = await loadAbsoluteStore(store)
				if (!feedback.entries.some((entry) => entry.image === image)) throw new HttpError(404, "Absolute feedback not found")
				feedback.entries = feedback.entries.filter((entry) => entry.image !== image)
				await writeStore(absoluteFeedbackPath, feedback)
			})
			json(response, 200, { ok: true })
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			const feedback = await loadFeedback()
			const carriedReviews = findCarriedReviews(
				results,
				archivedResults,
				feedback.entries as Array<Record<string, unknown>>,
				pairwisePresentationVersion,
			)
			json(response, 200, {
				results,
				previousResults,
				presentationVersion: REVIEW_PRESENTATION_VERSION,
				colorNamePolicy: REVIEW_COLOR_NAME_POLICY,
				colorNames: reviewColorNames,
				feedback,
				carriedReviews,
			})
			return
		}
		if (request.method === "GET" && url.pathname === "/api/results") {
			const visibleResults = await serializeStoreMutation(async () => {
				const store = await loadCurationStore()
				if (!curationProgress(selection, store).complete) {
					return { ...results, entries: results.entries.filter((entry) => entry.kind !== "holdout") }
				}
				await ensureCurationFrozen(store)
				return galleryResults
			})
			json(response, 200, visibleResults)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			requireJsonMutation(request, url)
			const value = validateFeedback(await body(request))
			const entry = await serializeStoreMutation(async (): Promise<Feedback> => {
				const store = await loadFeedback()
				const duplicate = hasSubmittedFeedback(
					store.entries as Array<Record<string, unknown>>,
					results.algorithmVersion,
					pairwisePresentationVersion,
					value.image,
					value.comparison,
				)
				if (duplicate) throw new HttpError(409, "Feedback already submitted for this comparison")
				const feedback: Feedback = {
					...value,
					id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
					timestamp: new Date().toISOString(),
					reviewSchema: 2,
					presentationVersion: pairwisePresentationVersion,
					algorithmVersion: results.algorithmVersion,
					previousAlgorithmVersion: previousResults.algorithmVersion,
				}
				store.entries.push(feedback)
				await writeFeedback(store)
				return feedback
			})
			json(response, 201, entry)
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/images/")) {
			const file = decodeURIComponent(url.pathname.slice("/images/".length))
			if (!knownGalleryImages.has(file)) {
				text(response, 404, "Not found")
				return
			}
			const contentTypes: Record<string, string> = {
				".jpg": "image/jpeg",
				".jpeg": "image/jpeg",
				".png": "image/png",
				".avif": "image/avif",
				".webp": "image/webp",
			}
			const path = file.startsWith("00/") ? join(projectRoot, file) : join(imagesRoot, file)
			const stream = createReadStream(path)
			stream.once("error", (error) => {
				if (!response.headersSent) text(response, 404, "Not found")
				else response.destroy(error)
			})
			stream.once("open", () => {
				response.writeHead(200, { "content-type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream" })
				stream.pipe(response)
			})
			response.once("close", () => stream.destroy())
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
	console.log(`Palette research review: http://127.0.0.1:${port}`)
})
