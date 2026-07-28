import { randomUUID } from "node:crypto"
import { link, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	BOUND_CASE,
	FEEDBACK_RELATIVE_PATH,
	MANIFEST_RELATIVE_PATH,
	REVIEW_APP_RELATIVE_PATH,
	buildStoredReviewFeedback,
	parsePrivateReviewManifest,
	parseReviewSubmission,
	publicReviewPayload,
	sha256,
	type StoredReviewFeedback,
} from "./src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"
import { verifyDiagnosticReview } from "./verify-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const reviewDirectory = resolve(projectRoot, REVIEW_APP_RELATIVE_PATH)
const manifestPath = resolve(projectRoot, MANIFEST_RELATIVE_PATH)
const feedbackPath = resolve(projectRoot, FEEDBACK_RELATIVE_PATH)
const port = Number(process.env.PORT ?? 4375)
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new RangeError("PORT must be a valid TCP port")

class AlreadySubmittedError extends Error {}

function imageContentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp"
	}
	throw new Error("Bound development artwork type is unsupported")
}

function headers(contentType: string, length: number): Record<string, string | number> {
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
	response.writeHead(status, headers(contentType, Buffer.byteLength(body)))
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

async function atomicFeedback(value: StoredReviewFeedback): Promise<void> {
	const temporary = `${feedbackPath}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, feedbackPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new AlreadySubmittedError("Review already submitted")
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

await verifyDiagnosticReview()
const manifestRaw = await readFile(manifestPath)
const manifestRawSha256 = sha256(manifestRaw)
const manifest = parsePrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
const publicPayload = publicReviewPayload(manifest)
const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/index.html", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) staticFiles.set(route, { bytes: await readFile(resolve(reviewDirectory, file)), type })

const realProjectRoot = await realpath(projectRoot)
const exactSourcePath = await realpath(resolve(projectRoot, BOUND_CASE.file))
if (!exactSourcePath.startsWith(`${realProjectRoot}${sep}`)) throw new Error("Bound artwork escapes the project root")
const artworkBytes = await readFile(exactSourcePath)
if (artworkBytes.byteLength !== BOUND_CASE.byteCount || sha256(artworkBytes) !== BOUND_CASE.sourceSha256) {
	throw new Error("Bound development artwork custody changed")
}
const artwork = { bytes: artworkBytes, type: imageContentType(artworkBytes) }
let feedbackSubmitted = false
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
			respondJson(response, 200, publicPayload)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/status") {
			respondJson(response, 200, { reviewId: manifest.contentId, submitted: feedbackSubmitted })
			return
		}
		if (request.method === "GET" && url.pathname === `/media/${manifest.items[0].mediaToken}`) {
			respond(response, 200, artwork.bytes, artwork.type)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/submit") {
			const origin = request.headers.origin
			if (!origin || new URL(origin).origin !== url.origin) {
				respondJson(response, 403, { error: "Only same-origin writes are allowed" })
				return
			}
			const submission = parseReviewSubmission(await requestBody(request), manifest)
			const write = async () => {
				if (feedbackSubmitted) throw new AlreadySubmittedError("Review already submitted")
				const stored = buildStoredReviewFeedback(submission, manifest, manifestRawSha256, new Date().toISOString())
				await atomicFeedback(stored)
				feedbackSubmitted = true
				return stored
			}
			const result = mutationQueue.then(write, write)
			mutationQueue = result.then(() => undefined, () => undefined)
			const stored = await result
			respondJson(response, 201, { submitted: true, submissionId: stored.submissionId })
			return
		}
		respondJson(response, 404, { error: "Not found" })
	} catch (error) {
		if (error instanceof AlreadySubmittedError) {
			respondJson(response, 409, { error: "This bound review already has a submission" })
			return
		}
		const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500
		respondJson(response, status, { error: status === 400 ? (error as Error).message : "Request failed" })
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Prepared blinded diagnostic review: http://127.0.0.1:${port}/\n`)
})
