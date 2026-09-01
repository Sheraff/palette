import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseLightweightReviewSubmission,
	type LightweightReviewSubmission,
} from "./src/album-artwork-palette-v2-lightweight-review.ts"

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	sourcePath: string
	winnerTreatmentId: string
	alternatives: ReadonlyArray<Readonly<{ id: string }>>
}>

type ReviewManifest = Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	cases: readonly ReviewCase[]
}>

type StoredFeedback = LightweightReviewSubmission & Readonly<{ submittedAt: string }>
type FeedbackStore = Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	entries: readonly StoredFeedback[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const reviewDirectory = resolve(moduleDirectory, "album-artwork-palette-v2-review")
const manifestPath = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development/absolute-quality-delta-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.4-lightweight-delta-feedback.json")
const port = Number(process.env.PORT ?? 4315)
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new RangeError("PORT must be a valid TCP port")

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function headers(contentType: string): Record<string, string> {
	return { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, headers("application/json; charset=utf-8"))
	response.end(`${JSON.stringify(value)}\n`)
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	if (!(request.headers["content-type"] ?? "").startsWith("application/json")) throw new TypeError("Expected application/json")
	const chunks: Uint8Array[] = []
	let size = 0
	for await (const chunk of request) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk
		size += bytes.byteLength
		if (size > 64 * 1024) throw new RangeError("Request body exceeds 64 KiB")
		chunks.push(bytes)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

async function readFeedback(manifest: ReviewManifest): Promise<FeedbackStore> {
	try {
		const parsed = JSON.parse(await readFile(feedbackPath, "utf8")) as FeedbackStore
		if (parsed.schemaVersion !== 1 || parsed.reviewVersion !== manifest.reviewVersion || parsed.manifestId !== manifest.manifestId || !Array.isArray(parsed.entries)) {
			throw new Error("Feedback store does not match the current lightweight review")
		}
		return parsed
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		return { schemaVersion: 1, reviewVersion: manifest.reviewVersion, manifestId: manifest.manifestId, entries: [] }
	}
}

async function writeFeedback(store: FeedbackStore): Promise<void> {
	const temporary = `${feedbackPath}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`)
	await rename(temporary, feedbackPath)
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ReviewManifest
if (manifest.schemaVersion !== 1 || manifest.cases.length === 0 || manifest.cases.length > 12 ||
	manifest.cases.some(({ alternatives, winnerTreatmentId }) => alternatives.length !== 1 || alternatives[0]?.id !== winnerTreatmentId)) {
	throw new Error("Prepare the bounded 0.4.4 absolute-quality delta review before starting lightweight review")
}
let feedbackMutation = Promise.resolve()

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && ["/", "/index.html", "/app.js", "/styles.css"].includes(url.pathname)) {
			const filename = url.pathname === "/" ? "index.html" : url.pathname.slice(1)
			const path = resolve(reviewDirectory, filename)
			const bytes = await readFile(path)
			const contentType = extname(path) === ".html" ? "text/html; charset=utf-8" : extname(path) === ".js" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8"
			response.writeHead(200, headers(contentType))
			response.end(bytes)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			sendJson(response, 200, { ...manifest, cases: manifest.cases.map(({ sourcePath: _sourcePath, ...reviewCase }) => ({
				...reviewCase,
				artworkUrl: `/artwork/${encodeURIComponent(reviewCase.caseId)}`,
			})) })
			return
		}
		if (request.method === "GET" && url.pathname === "/api/feedback") {
			sendJson(response, 200, await readFeedback(manifest))
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			const origin = request.headers.origin
			if (origin !== undefined && new URL(origin).host !== request.headers.host) throw new TypeError("Cross-origin feedback is forbidden")
			const body = await requestBody(request)
			const rawCaseId = body !== null && typeof body === "object" ? (body as { caseId?: unknown }).caseId : null
			const reviewCase = manifest.cases.find(({ caseId }) => caseId === rawCaseId)
			if (!reviewCase) throw new TypeError("Feedback case does not exist")
			const submission = parseLightweightReviewSubmission(body, {
				caseId: reviewCase.caseId,
				sourceSha256: reviewCase.sourceSha256,
				treatmentId: reviewCase.winnerTreatmentId,
			})
			feedbackMutation = feedbackMutation.then(async () => {
				const store = await readFeedback(manifest)
				const entry: StoredFeedback = { ...submission, submittedAt: new Date().toISOString() }
				const entries = store.entries.filter(({ caseId }) => caseId !== entry.caseId)
				entries.push(entry)
				entries.sort((first, second) => manifest.cases.findIndex(({ caseId }) => caseId === first.caseId) - manifest.cases.findIndex(({ caseId }) => caseId === second.caseId))
				await writeFeedback({ ...store, entries })
			})
			await feedbackMutation
			sendJson(response, 200, { ok: true })
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/artwork/")) {
			const caseId = decodeURIComponent(url.pathname.slice("/artwork/".length))
			const reviewCase = manifest.cases.find((candidate) => candidate.caseId === caseId)
			if (!reviewCase) return sendJson(response, 404, { error: "Artwork not found" })
			if (reviewCase.sourcePath.startsWith("/") || reviewCase.sourcePath.split("/").includes("..")) throw new Error("Unsafe manifest source path")
			const path = resolve(projectRoot, reviewCase.sourcePath)
			if (!path.startsWith(`${projectRoot}/`)) throw new Error("Artwork escaped project root")
			const bytes = await readFile(path)
			if (sha256(bytes) !== reviewCase.sourceSha256) throw new Error("Artwork source hash changed")
			response.writeHead(200, headers("image/jpeg"))
			response.end(bytes)
			return
		}
		sendJson(response, 404, { error: "Not found" })
	} catch (error: unknown) {
		const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500
		sendJson(response, status, { error: error instanceof Error ? error.message : String(error) })
	}
})

server.listen(port, "127.0.0.1", () => process.stdout.write(`Album artwork lightweight review: http://127.0.0.1:${port}\n`))
