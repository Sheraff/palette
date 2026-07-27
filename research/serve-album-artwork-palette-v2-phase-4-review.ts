import { createHash, randomUUID } from "node:crypto"
import { access, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	parsePhase4ReviewSubmission,
	type Phase4ReviewFeedbackStore,
	type Phase4StoredReviewFeedback,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const reviewDirectory = resolve(moduleDirectory, "album-artwork-palette-v2-phase-4-review")

function configuredPath(environmentName: string, fallback: string): string {
	const configured = process.env[environmentName]
	const path = resolve(projectRoot, configured ?? fallback)
	if (!path.startsWith(`${projectRoot}${sep}`)) throw new Error(`${environmentName} must remain inside the project root`)
	return path
}

const manifestPath = configuredPath("REVIEW_MANIFEST_PATH",
	"research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/review-manifest.private.json")
const feedbackPath = configuredPath("REVIEW_FEEDBACK_PATH",
	"research/data/album-artwork-palette-v2-0.4.4-phase-4-feedback.json")
const port = Number(process.env.PORT ?? 4317)
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new RangeError("PORT must be a valid TCP port")

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function imageContentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp"
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "image/avif"
	throw new Error("Manifest-bound artwork type is unsupported")
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
		size += bytes.length
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

async function atomicWriteFeedback(value: Phase4ReviewFeedbackStore): Promise<void> {
	const temporary = `${feedbackPath}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await rename(temporary, feedbackPath)
	} finally {
		await rm(temporary, { force: true })
	}
}

const manifest = parsePhase4PrivateReviewManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown)
const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/index.html", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) staticFiles.set(route, { bytes: await readFile(resolve(reviewDirectory, file)), type })

const root = await realpath(projectRoot)
const artworks = new Map<string, { bytes: Buffer; type: string }>()
for (const reviewCase of manifest.cases) {
	const sourcePath = await realpath(resolve(projectRoot, reviewCase.source.file))
	if (!sourcePath.startsWith(`${root}${sep}`)) throw new Error("Manifest-bound artwork escapes the project root")
	const bytes = await readFile(sourcePath)
	if (bytes.byteLength !== reviewCase.source.bytes || sha256(bytes) !== reviewCase.source.sha256) {
		throw new Error(`Manifest-bound artwork custody changed for ${reviewCase.caseId}`)
	}
	artworks.set(reviewCase.caseId, { bytes, type: imageContentType(bytes) })
}

let feedback: Phase4ReviewFeedbackStore = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	entries: [],
}
if (await pathExists(feedbackPath)) {
	feedback = parsePhase4ReviewFeedbackStore(JSON.parse(await readFile(feedbackPath, "utf8")) as unknown, manifest)
}

const publicReview = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	presentationVersion: manifest.presentationVersion,
	manifestId: manifest.manifestId,
	cases: manifest.cases.map((reviewCase) => ({
		caseId: reviewCase.caseId,
		order: reviewCase.order,
		sourceSha256: reviewCase.source.sha256,
		artworkUrl: `/artwork/${encodeURIComponent(reviewCase.caseId)}`,
		options: Object.fromEntries((["A", "B"] as const).map((side) => [side, {
			roles: Object.fromEntries((["background", "surface", "foreground", "accent"] as const).map((role) =>
				[role, {
					hex: reviewCase.options[side].roles[role].hex,
					nearestName: reviewCase.options[side].roles[role].nearestName,
					generated: reviewCase.options[side].roles[role].generated,
				}]
			)),
			gradient: reviewCase.options[side].gradient,
			collapse: {
				surface: reviewCase.options[side].collapse.surface,
				accent: reviewCase.options[side].collapse.accent,
			},
		}])) as typeof reviewCase.options,
	})),
}
const orderByCase = new Map(manifest.cases.map(({ caseId, order }) => [caseId, order]))
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
			if (!origin || new URL(origin).origin !== url.origin) {
				respondJson(response, 403, { error: "Only same-origin feedback writes are allowed" })
				return
			}
			const body = await requestBody(request)
			const caseId = body !== null && typeof body === "object" ? (body as { caseId?: unknown }).caseId : null
			const reviewCase = manifest.cases.find((candidate) => candidate.caseId === caseId)
			if (!reviewCase) throw new TypeError("Feedback case does not exist")
			const submission = parsePhase4ReviewSubmission(body, {
				caseId: reviewCase.caseId,
				sourceSha256: reviewCase.source.sha256,
			})
			const entry: Phase4StoredReviewFeedback = { ...submission, submittedAt: new Date().toISOString() }
			const write = async () => {
				const entries = [...feedback.entries.filter((stored) => stored.caseId !== entry.caseId), entry]
					.sort((first, second) => orderByCase.get(first.caseId)! - orderByCase.get(second.caseId)!)
				const next: Phase4ReviewFeedbackStore = { ...feedback, entries }
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
		respondJson(response, status, { error: error instanceof Error ? error.message : "Request failed" })
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Blinded palette review: http://127.0.0.1:${port}/\n`)
})
