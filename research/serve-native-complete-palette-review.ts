import { randomUUID } from "node:crypto"
import { access, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	parseNativeCompletePaletteReviewFeedbackEntry,
	parseNativeCompletePaletteReviewFeedbackStore,
	type NativeCompletePaletteReviewFeedbackStore,
} from "./src/native-complete-palette-review.ts"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST,
	NATIVE_COMPLETE_PALETTE_REVIEW_ROOT,
	verifyNativeCompletePaletteReview,
} from "./verify-native-complete-palette-review.ts"

const [portArgument = "3132", ...unexpected] = process.argv.slice(2)
if (unexpected.length > 0 || !/^\d+$/.test(portArgument)) {
	throw new Error("Usage: serve-native-complete-palette-review.ts [port]")
}
const port = Number(portArgument)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Port must be between 1 and 65535")

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = fileURLToPath(new URL("./native-complete-palette-review", import.meta.url))
const feedbackPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_ROOT, "feedback.json")
const artifact = await verifyNativeCompletePaletteReview(resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST), projectRoot)
const manifest = artifact.manifest

function contentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp"
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "image/avif"
	throw new Error("Selected artwork type is unsupported")
}

function respond(response: ServerResponse, status: number, body: string | Buffer,
	type = "text/plain; charset=utf-8"): void {
	response.writeHead(status, {
		"content-type": type,
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body),
		"x-content-type-options": "nosniff",
	})
	response.end(body)
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		size += bytes.length
		if (size > 64 * 1024) throw new Error("Request body is too large")
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

async function atomicWrite(path: string, value: unknown, refuseOverwrite: boolean): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		if (refuseOverwrite) {
			await writeFile(path, await readFile(temporary), { flag: "wx", mode: 0o600 })
		} else {
			await rename(temporary, path)
		}
	} finally {
		await rm(temporary, { force: true })
	}
}

const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) {
	staticFiles.set(route, { bytes: await readFile(resolve(reviewRoot, file)), type })
}
const artworks = new Map<string, { bytes: Buffer; type: string }>()
for (const entry of manifest.entries) {
	const bytes = await readFile(resolve(projectRoot, entry.source.file))
	artworks.set(entry.caseId, { bytes, type: contentType(bytes) })
}

let feedback: NativeCompletePaletteReviewFeedbackStore
if (await pathExists(feedbackPath)) {
	feedback = parseNativeCompletePaletteReviewFeedbackStore(JSON.parse(await readFile(feedbackPath, "utf8")), manifest)
} else {
	feedback = { schemaVersion: 1, reviewVersion: NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: manifest.manifestId, entries: [] }
	await atomicWrite(feedbackPath, feedback, true)
}

const publicReview = {
	reviewVersion: manifest.reviewVersion,
	presentationVersion: manifest.presentationVersion,
	manifestId: manifest.manifestId,
	batch: manifest.batch,
	entries: manifest.entries.map(({ assignment: _assignment, kind: _kind, cohort: _cohort,
		materialChanged: _material, changedRoles: _roles, gradientChanged: _gradient, source, ...entry }) => ({
		...entry,
		source: { sha256: source.sha256, width: source.width, height: source.height },
	})),
}
const orderByCase = new Map(manifest.entries.map((entry) => [entry.caseId, entry.order]))
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
			respond(response, 200, JSON.stringify(publicReview), "application/json; charset=utf-8")
			return
		}
		if (request.method === "GET" && url.pathname === "/api/feedback") {
			respond(response, 200, JSON.stringify(feedback), "application/json; charset=utf-8")
			return
		}
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
				respond(response, 415, "Expected application/json")
				return
			}
			const origin = request.headers.origin
			if (origin && new URL(origin).origin !== url.origin) {
				respond(response, 403, "Cross-origin mutations are not allowed")
				return
			}
			const entry = parseNativeCompletePaletteReviewFeedbackEntry(await requestBody(request), manifest, false)
			const write = async () => {
				feedback.entries = [...feedback.entries.filter((stored) => stored.caseId !== entry.caseId), entry]
					.sort((first, second) => orderByCase.get(first.caseId)! - orderByCase.get(second.caseId)!)
				await atomicWrite(feedbackPath, feedback, false)
			}
			const result = mutationQueue.then(write, write)
			mutationQueue = result.then(() => undefined, () => undefined)
			await result
			respond(response, 200, JSON.stringify(entry), "application/json; charset=utf-8")
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/artwork/")) {
			const artwork = artworks.get(decodeURIComponent(url.pathname.slice("/artwork/".length)))
			if (!artwork) {
				respond(response, 404, "Unknown artwork")
				return
			}
			respond(response, 200, artwork.bytes, artwork.type)
			return
		}
		respond(response, 404, "Not found")
	} catch (error) {
		respond(response, 400, error instanceof Error ? error.message : "Request failed")
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Native complete-palette review: http://127.0.0.1:${port}/\n`)
})
