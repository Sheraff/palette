import { createReadStream } from "node:fs"
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { findCarriedReviews, hasSubmittedFeedback } from "./src/review-queue.ts"
import type { CorpusResult } from "./src/types.ts"

type Preference = "left" | "right" | "tie"
type ShipDecision = "left" | "right" | "both" | "neither"
type Feedback = {
	id: string
	timestamp: string
	reviewSchema: 2
	presentationVersion: 2
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

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = join(researchRoot, "review")
const imagesRoot = join(projectRoot, "images")
const resultsPath = join(researchRoot, "data", "results.json")
const holdoutResultsPath = join(researchRoot, "data", "holdout-results.json")
const feedbackPath = join(researchRoot, "data", "feedback.json")
const roundsRoot = join(researchRoot, "data", "rounds")
const previousRoundPath = join(roundsRoot, "region-graph-0.8.0.json")
const port = Number(process.env.PORT || 3100)
const presentationVersion = 2

const results = JSON.parse(await readFile(resultsPath, "utf8")) as CorpusResult
const holdoutResults = JSON.parse(await readFile(holdoutResultsPath, "utf8")) as CorpusResult
if (holdoutResults.algorithmVersion !== results.algorithmVersion) {
	throw new Error(`Holdout results use ${holdoutResults.algorithmVersion}, expected ${results.algorithmVersion}`)
}
const galleryResults: CorpusResult = {
	generatedAt: holdoutResults.generatedAt,
	algorithmVersion: results.algorithmVersion,
	entries: [...results.entries, ...holdoutResults.entries],
}
const previousRound = JSON.parse(await readFile(previousRoundPath, "utf8")) as { results: CorpusResult }
const previousResults = previousRound.results
const archivedResults = new Map<string, CorpusResult>()
for (const file of await readdir(roundsRoot)) {
	if (!file.endsWith(".json")) continue
	const archive = JSON.parse(await readFile(join(roundsRoot, file), "utf8")) as { results?: CorpusResult }
	if (archive.results?.algorithmVersion) archivedResults.set(archive.results.algorithmVersion, archive.results)
}
const knownImages = new Set(results.entries.map((entry) => entry.file))
const knownGalleryImages = new Set(galleryResults.entries.map((entry) => entry.file))
const methods = new Set(["spatial", "expressive", "quantized", "previous"])
const preferences = new Set<Preference>(["left", "right", "tie"])
const shipDecisions = new Set<ShipDecision>(["left", "right", "both", "neither"])
const comparisons = new Set(["iteration", "baseline", "variant"])
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
	const temporary = `${feedbackPath}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, feedbackPath)
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

function validateFeedback(input: unknown): Omit<Feedback, "id" | "timestamp" | "algorithmVersion" | "previousAlgorithmVersion" | "reviewSchema" | "presentationVersion"> {
	if (!input || typeof input !== "object") throw new Error("Expected an object")
	const value = input as Record<string, unknown>
	if (typeof value.image !== "string" || !knownImages.has(value.image)) throw new Error("Unknown image")
	if (typeof value.comparison !== "string" || !comparisons.has(value.comparison)) throw new Error("Invalid comparison")
	if (typeof value.leftMethod !== "string" || !methods.has(value.leftMethod)) throw new Error("Invalid left method")
	if (typeof value.rightMethod !== "string" || !methods.has(value.rightMethod)) throw new Error("Invalid right method")
	if (value.leftMethod === value.rightMethod) throw new Error("Methods must differ")
	if (typeof value.preference !== "string" || !preferences.has(value.preference as Preference)) throw new Error("Invalid preference")
	if (typeof value.ship !== "string" || !shipDecisions.has(value.ship as ShipDecision)) throw new Error("Invalid ship decision")
	if (!Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string" || !reasons.has(reason))) {
		throw new Error("Invalid reasons")
	}
	if (typeof value.note !== "string" || value.note.length > 500) throw new Error("Invalid note")
	return value as Omit<Feedback, "id" | "timestamp" | "algorithmVersion" | "previousAlgorithmVersion" | "reviewSchema" | "presentationVersion">
}

const staticFiles = new Map<string, readonly [string, string]>([
	["/", ["index.html", "text/html; charset=utf-8"]],
	["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
	["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
	["/gallery", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery/", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery.html", ["gallery.html", "text/html; charset=utf-8"]],
	["/gallery.js", ["gallery.js", "text/javascript; charset=utf-8"]],
	["/gallery.css", ["gallery.css", "text/css; charset=utf-8"]],
])

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const [file, contentType] = staticFiles.get(url.pathname)!
			text(response, 200, await readFile(join(reviewRoot, file), "utf8"), contentType)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			const feedback = await loadFeedback()
			const carriedReviews = findCarriedReviews(
				results,
				archivedResults,
				feedback.entries as Array<Record<string, unknown>>,
				presentationVersion,
			)
			json(response, 200, { results, previousResults, presentationVersion, feedback, carriedReviews })
			return
		}
		if (request.method === "GET" && url.pathname === "/api/results") {
			json(response, 200, galleryResults)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			const value = validateFeedback(await body(request))
			const store = await loadFeedback()
			const duplicate = hasSubmittedFeedback(
				store.entries as Array<Record<string, unknown>>,
				results.algorithmVersion,
				presentationVersion,
				value.image,
				value.comparison,
			)
			if (duplicate) {
				json(response, 409, { error: "Feedback already submitted for this comparison" })
				return
			}
			const entry: Feedback = {
				...value,
				id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
				timestamp: new Date().toISOString(),
				reviewSchema: 2,
				presentationVersion,
				algorithmVersion: results.algorithmVersion,
				previousAlgorithmVersion: previousResults.algorithmVersion,
			}
			store.entries.push(entry)
			await writeFeedback(store)
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
			response.writeHead(200, { "content-type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream" })
			const path = file.startsWith("00/") ? join(projectRoot, file) : join(imagesRoot, file)
			createReadStream(path).pipe(response)
			return
		}
		text(response, 404, "Not found")
	} catch (error) {
		json(response, 400, { error: error instanceof Error ? error.message : String(error) })
	}
})

server.listen(port, "127.0.0.1", () => {
	console.log(`Palette research review: http://127.0.0.1:${port}`)
})
