import { randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, rename, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
	SCALE_AWARE_NATIVE_EXPERIMENT_ID,
	SCALE_AWARE_NATIVE_REVIEW_ID,
	SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
	verifyScaleAwareNativeArtifact,
} from "./evaluate-scale-aware-native-palette.ts"

type Preference = "left" | "right" | "tie"
type ShipDecision = "left" | "right" | "both" | "neither"
type Method = "spatial" | "previous"
type FeedbackEntry = {
	id: string
	timestamp: string
	reviewSchema: 2
	presentationVersion: typeof SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION
	image: string
	comparison: "iteration"
	leftMethod: Method
	rightMethod: Method
	preference: Preference
	ship: ShipDecision
	reasons: string[]
	note: string
	algorithmVersion: string
	previousAlgorithmVersion: string
	sourceSha256: string
	pairSha256: string
	manifestSha256: string
}
type FeedbackStore = {
	schemaVersion: 1
	experimentId: typeof SCALE_AWARE_NATIVE_EXPERIMENT_ID
	reviewIdentity: typeof SCALE_AWARE_NATIVE_REVIEW_ID
	presentationVersion: typeof SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION
	scientificIdentitySha256: string
	manifestSha256: string
	entries: FeedbackEntry[]
}

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = join(researchRoot, "review")
const artifactDirectory = join(researchRoot, "data", "experiments", SCALE_AWARE_NATIVE_EXPERIMENT_ID)
const feedbackPath = join(researchRoot, "data", "scale-aware-native-review-feedback.json")
const artifact = await verifyScaleAwareNativeArtifact(artifactDirectory, projectRoot)
const baseline = JSON.parse(await readFile(join(researchRoot, "data", "results.json"), "utf8"))
const queueEntries = new Map(artifact.reviewManifest.entries.map((entry) => [entry.file, entry]))
const assignments = Object.fromEntries(artifact.reviewManifest.entries.map((entry) => [
	entry.file,
	entry.left === "canonical" ? ["previous", "spatial"] : ["spatial", "previous"],
]))
const reviewResults = {
	...artifact.results,
	entries: artifact.results.entries.map((entry) => ({ ...entry, review: queueEntries.has(entry.file) })),
}
const allowedReasons = new Set([
	"background", "foreground", "surface", "accent", "unfaithful", "flat", "unreadable",
	"tiny-detail-dominates", "missing-gradient", "unnecessary-gradient", "unnecessary-surface", "missing-source-color",
])
const preferences = new Set<Preference>(["left", "right", "tie"])
const shipDecisions = new Set<ShipDecision>(["left", "right", "both", "neither"])
const contentTypes: Record<string, string> = {
	".avif": "image/avif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
}
const staticFiles = new Map<string, readonly [string, string]>([
	["/", ["index.html", "text/html; charset=utf-8"]],
	["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
	["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
])

function emptyFeedbackStore(): FeedbackStore {
	return {
		schemaVersion: 1,
		experimentId: SCALE_AWARE_NATIVE_EXPERIMENT_ID,
		reviewIdentity: SCALE_AWARE_NATIVE_REVIEW_ID,
		presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
		scientificIdentitySha256: artifact.reviewManifest.scientificIdentitySha256,
		manifestSha256: artifact.manifestSha256,
		entries: [],
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateFeedbackStore(value: unknown): asserts value is FeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.experimentId !== SCALE_AWARE_NATIVE_EXPERIMENT_ID ||
		value.reviewIdentity !== SCALE_AWARE_NATIVE_REVIEW_ID ||
		value.presentationVersion !== SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION ||
		value.scientificIdentitySha256 !== artifact.reviewManifest.scientificIdentitySha256 ||
		value.manifestSha256 !== artifact.manifestSha256 || !Array.isArray(value.entries)) {
		throw new Error("Scale-aware feedback provenance is invalid")
	}
	const seen = new Set<string>()
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue) || typeof entryValue.image !== "string" || seen.has(entryValue.image)) {
			throw new Error("Scale-aware feedback entry is invalid")
		}
		const queueEntry = queueEntries.get(entryValue.image)
		const assignment = assignments[entryValue.image]
		if (!queueEntry || !assignment || entryValue.reviewSchema !== 2 || entryValue.comparison !== "iteration" ||
			entryValue.presentationVersion !== SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION ||
			entryValue.leftMethod !== assignment[0] || entryValue.rightMethod !== assignment[1] ||
			entryValue.sourceSha256 !== queueEntry.sourceSha256 || entryValue.pairSha256 !== queueEntry.pairSha256 ||
			entryValue.manifestSha256 !== artifact.manifestSha256 ||
			typeof entryValue.preference !== "string" || !preferences.has(entryValue.preference as Preference) ||
			typeof entryValue.ship !== "string" || !shipDecisions.has(entryValue.ship as ShipDecision) ||
			!Array.isArray(entryValue.reasons) || entryValue.reasons.some((reason) => typeof reason !== "string" || !allowedReasons.has(reason)) ||
			typeof entryValue.note !== "string" || entryValue.note.length > 500 ||
			typeof entryValue.id !== "string" || typeof entryValue.timestamp !== "string") {
			throw new Error(`Scale-aware feedback entry failed validation: ${entryValue.image}`)
		}
		seen.add(entryValue.image)
	}
}

async function loadFeedback(): Promise<FeedbackStore> {
	try {
		const value: unknown = JSON.parse(await readFile(feedbackPath, "utf8"))
		validateFeedbackStore(value)
		return value
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyFeedbackStore()
		throw error
	}
}

async function writeFeedback(store: FeedbackStore): Promise<void> {
	validateFeedbackStore(store)
	const temporaryPath = `${feedbackPath}.tmp-${randomUUID()}`
	await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 })
	await rename(temporaryPath, feedbackPath)
}

function json(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
	response.end(JSON.stringify(value))
}

function text(response: ServerResponse, status: number, value: string, contentType = "text/plain; charset=utf-8"): void {
	response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" })
	response.end(value)
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let length = 0
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk)
		length += bytes.byteLength
		if (length > 32_768) throw new Error("Request body is too large")
		chunks.push(bytes)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function validateMutationRequest(request: IncomingMessage, url: URL): void {
	if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
		throw new Error("POST requests require application/json")
	}
	if (request.headers.origin && new URL(request.headers.origin).origin !== url.origin) {
		throw new Error("Cross-origin mutations are not allowed")
	}
}

let mutationQueue: Promise<void> = Promise.resolve()
function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
	const result = mutationQueue.then(operation, operation)
	mutationQueue = result.then(() => undefined, () => undefined)
	return result
}

const port = Number(process.env.PORT || 3124)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be between 1 and 65535")

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const [file, contentType] = staticFiles.get(url.pathname)!
			text(response, 200, await readFile(join(reviewRoot, file), "utf8"), contentType)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			json(response, 200, {
				results: reviewResults,
				previousResults: baseline,
				presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
				feedback: await loadFeedback(),
				carriedReviews: [],
				iterationOnly: true,
				assignments,
			})
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			validateMutationRequest(request, url)
			const input = await requestBody(request)
			if (!isRecord(input) || typeof input.image !== "string") throw new Error("Invalid feedback payload")
			const queueEntry = queueEntries.get(input.image)
			const assignment = assignments[input.image]
			if (!queueEntry || !assignment || input.comparison !== "iteration" || input.leftMethod !== assignment[0] ||
				input.rightMethod !== assignment[1] || typeof input.preference !== "string" ||
				!preferences.has(input.preference as Preference) || typeof input.ship !== "string" ||
				!shipDecisions.has(input.ship as ShipDecision) || !Array.isArray(input.reasons) ||
				input.reasons.some((reason) => typeof reason !== "string" || !allowedReasons.has(reason)) ||
				typeof input.note !== "string" || input.note.length > 500) throw new Error("Feedback fields are invalid")
			const image = input.image
			const note = input.note
			const entry = await serializeMutation(async (): Promise<FeedbackEntry> => {
				const store = await loadFeedback()
				if (store.entries.some((candidate) => candidate.image === image)) throw new Error("Feedback already exists for this pair")
				const value: FeedbackEntry = {
					id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
					timestamp: new Date().toISOString(),
					reviewSchema: 2,
					presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
					image,
					comparison: "iteration",
					leftMethod: input.leftMethod as Method,
					rightMethod: input.rightMethod as Method,
					preference: input.preference as Preference,
					ship: input.ship as ShipDecision,
					reasons: input.reasons as string[],
					note,
					algorithmVersion: artifact.results.algorithmVersion,
					previousAlgorithmVersion: baseline.algorithmVersion,
					sourceSha256: queueEntry.sourceSha256,
					pairSha256: queueEntry.pairSha256,
					manifestSha256: artifact.manifestSha256,
				}
				store.entries.push(value)
				await writeFeedback(store)
				return value
			})
			json(response, 201, entry)
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/images/")) {
			const file = decodeURIComponent(url.pathname.slice("/images/".length))
			const queueEntry = queueEntries.get(file)
			if (!queueEntry) {
				text(response, 404, "Not found")
				return
			}
			const stream = createReadStream(join(projectRoot, queueEntry.sourceRelativePath))
			stream.once("error", () => response.headersSent ? response.destroy() : text(response, 404, "Not found"))
			response.writeHead(200, {
				"content-type": contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
				"cache-control": "no-store",
			})
			stream.pipe(response)
			return
		}
		text(response, 404, "Not found")
	} catch (error) {
		json(response, 400, { error: error instanceof Error ? error.message : "Request failed" })
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Scale-aware native blinded review: http://127.0.0.1:${port}/\n`)
})
