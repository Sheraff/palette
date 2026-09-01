import { createHash, randomUUID } from "node:crypto"
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	COMPLETE_PALETTE_REVIEW_VERSION,
	completePaletteReviewPublicPayload,
	parseCompletePaletteReviewFeedback,
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	type CompletePaletteReviewFeedbackStore,
} from "./src/complete-palette-review-v2.ts"

const [manifestArgument, feedbackArgument, portArgument = "4317", ...unexpected] = process.argv.slice(2)
if (!manifestArgument || !feedbackArgument || unexpected.length > 0 || !/^\d+$/.test(portArgument)) {
	throw new Error("Usage: serve-complete-palette-review-v2.ts <manifest> <feedback> [port]")
}
const port = Number(portArgument)
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
	throw new RangeError("Port must be an integer from 1 through 65535")
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(process.cwd())
const reviewDirectory = resolve(moduleDirectory, "complete-palette-review-v2")
const manifestPath = resolve(projectRoot, manifestArgument)
const feedbackPath = resolve(projectRoot, feedbackArgument)

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function imageContentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		return "image/png"
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp"
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "image/avif"
	throw new TypeError("Manifest-bound artwork type is unsupported")
}

function responseHeaders(contentType: string, length: number): Record<string, string | number> {
	return {
		"Content-Type": contentType,
		"Content-Length": length,
		"Cache-Control": "no-store, max-age=0",
		"Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
	}
}

function respond(response: ServerResponse, status: number, body: string | Buffer,
	contentType = "text/plain; charset=utf-8"): void {
	response.writeHead(status, responseHeaders(contentType, Buffer.byteLength(body)))
	response.end(body)
}

function respondJson(response: ServerResponse, status: number, value: unknown): void {
	respond(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8")
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	if (request.headers["content-type"]?.split(";", 1)[0].toLowerCase() !== "application/json") {
		throw new TypeError("Expected application/json")
	}
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		size += bytes.byteLength
		if (size > 64 * 1024) throw new RangeError("Request body exceeds 64 KiB")
		chunks.push(bytes)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
		throw error
	}
}

async function atomicWriteFeedback(value: CompletePaletteReviewFeedbackStore): Promise<void> {
	const temporary = `${feedbackPath}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await rename(temporary, feedbackPath)
	} finally {
		await rm(temporary, { force: true })
	}
}

const manifest = parseCompletePaletteReviewManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown)
const publicReview = completePaletteReviewPublicPayload(manifest)
const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/index.html", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) staticFiles.set(route, { bytes: await readFile(resolve(reviewDirectory, file)), type })

const realProjectRoot = await realpath(projectRoot)
const artworks = new Map<string, { bytes: Buffer; type: string }>()
for (const reviewCase of manifest.cases) {
	const sourcePath = await realpath(resolve(projectRoot, reviewCase.source.file))
	if (sourcePath !== realProjectRoot && !sourcePath.startsWith(`${realProjectRoot}${sep}`)) {
		throw new Error(`Manifest-bound artwork escapes the project root: ${reviewCase.caseId}`)
	}
	const bytes = await readFile(sourcePath)
	if (bytes.byteLength !== reviewCase.source.bytes || sha256(bytes) !== reviewCase.source.sha256) {
		throw new Error(`Manifest-bound artwork custody changed for ${reviewCase.caseId}`)
	}
	artworks.set(reviewCase.caseId, { bytes, type: imageContentType(bytes) })
}

await mkdir(dirname(feedbackPath), { recursive: true })
let feedback: CompletePaletteReviewFeedbackStore = {
	schemaVersion: 1,
	reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
	manifestId: manifest.manifestId,
	entries: [],
}
if (await pathExists(feedbackPath)) {
	feedback = parseCompletePaletteReviewFeedbackStore(JSON.parse(await readFile(feedbackPath, "utf8")) as unknown, manifest)
} else {
	await atomicWriteFeedback(feedback)
}

const orderByCase = new Map<string, number>(manifest.cases.map(({ caseId, order }) =>
	[caseId, order] as const))
let mutationQueue = Promise.resolve()
const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const file = staticFiles.get(url.pathname)!
			respond(response, 200, file.bytes, file.type)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/review") {
			respondJson(response, 200, publicReview)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/feedback") {
			respondJson(response, 200, feedback)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			const origin = request.headers.origin
			if (origin && new URL(origin).origin !== url.origin) {
				respondJson(response, 403, { error: "Only same-origin feedback writes are allowed" })
				return
			}
			const entry = parseCompletePaletteReviewFeedback(await requestBody(request), manifest, false)
			const write = async () => {
				const entries = [...feedback.entries.filter((stored) => stored.caseId !== entry.caseId), entry]
					.sort((first, second) => orderByCase.get(first.caseId)! - orderByCase.get(second.caseId)!)
				const next: CompletePaletteReviewFeedbackStore = { ...feedback, entries }
				await atomicWriteFeedback(next)
				feedback = next
			}
			const result = mutationQueue.then(write, write)
			mutationQueue = result.then(() => undefined, () => undefined)
			await result
			respondJson(response, 200, entry)
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/artwork/")) {
			const artwork = artworks.get(decodeURIComponent(url.pathname.slice("/artwork/".length)))
			if (!artwork) {
				respondJson(response, 404, { error: "Artwork not found" })
				return
			}
			respond(response, 200, artwork.bytes, artwork.type)
			return
		}
		respondJson(response, 404, { error: "Not found" })
	} catch (error) {
		const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500
		respondJson(response, status, { error: status === 400 && error instanceof Error ? error.message : "Request failed" })
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Complete-palette review: http://127.0.0.1:${port}/\n`)
})
