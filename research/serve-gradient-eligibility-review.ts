import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

type Classification = "true-background-gradient" | "flat-background-isolated-surface" | "not-gradient-other" |
	"gradient-wrong-endpoints" | "uncertain"
type Confidence = "high" | "medium" | "low"
type FeedbackEntry = {
	familyId: string
	classification: Classification
	confidence: Confidence
	note: string
	submittedAt: string
}
type FeedbackStore = {
	schemaVersion: 1
	experimentVersion: string
	developmentSha256: string
	htmlSha256: string
	entries: FeedbackEntry[]
}
type Development = {
	schemaVersion: 1
	experimentVersion: string
	entries: Array<{ familyId: string; anchor: { file: string } }>
}

const [developmentArgument, htmlArgument, feedbackArgument, portArgument = "3118"] = process.argv.slice(2)
if (!developmentArgument || !htmlArgument || !feedbackArgument || !/^\d+$/.test(portArgument)) {
	throw new Error("Usage: serve-gradient-eligibility-review.ts <development.json> <html> <feedback.json> [port]")
}
const port = Number(portArgument)
if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535")
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const musicRoot = await realpath(resolve(projectRoot, "music-artworks"))
const imagesRoot = await realpath(resolve(projectRoot, "images"))
const holdoutRoot = await realpath(resolve(projectRoot, "00"))
const feedbackPath = resolve(feedbackArgument)
const classifications = new Set<Classification>([
	"true-background-gradient",
	"flat-background-isolated-surface",
	"not-gradient-other",
	"gradient-wrong-endpoints",
	"uncertain",
])
const confidences = new Set<Confidence>(["high", "medium", "low"])
const contentTypes = new Map([
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".png", "image/png"],
	[".webp", "image/webp"],
	[".avif", "image/avif"],
])

function sha256(value: Buffer): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	const sortedExpected = [...expected].sort()
	return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function parseDevelopment(value: unknown): Development {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.experimentVersion !== "string" ||
		!Array.isArray(value.entries)) throw new Error("Development evidence is invalid")
	const seen = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || seen.has(entry.familyId) ||
			!isRecord(entry.anchor) || typeof entry.anchor.file !== "string" ||
			!/^((music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f])|images|00)\/[^/\\]+$/i.test(entry.anchor.file)) {
			throw new Error("Development entry is invalid or duplicated")
		}
		seen.add(entry.familyId)
	}
	return value as unknown as Development
}

function allowedRoot(relative: string): string {
	if (relative.startsWith("music-artworks/")) return musicRoot
	if (relative.startsWith("images/")) return imagesRoot
	if (relative.startsWith("00/")) return holdoutRoot
	throw new Error("Artwork path is outside an allowed corpus")
}

function parseFeedbackEntry(value: unknown, stored: boolean, familyIds: ReadonlySet<string>): FeedbackEntry {
	if (!isRecord(value) || !exactKeys(value, stored
		? ["familyId", "classification", "confidence", "note", "submittedAt"]
		: ["familyId", "classification", "confidence", "note"]) ||
		typeof value.familyId !== "string" || !familyIds.has(value.familyId) ||
		typeof value.classification !== "string" || !classifications.has(value.classification as Classification) ||
		typeof value.confidence !== "string" || !confidences.has(value.confidence as Confidence) ||
		typeof value.note !== "string" || value.note.length > 2000 ||
		stored && (typeof value.submittedAt !== "string" || !Number.isFinite(Date.parse(value.submittedAt)))) {
		throw new Error("Feedback entry is invalid")
	}
	return {
		familyId: value.familyId,
		classification: value.classification as Classification,
		confidence: value.confidence as Confidence,
		note: value.note,
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

function respond(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
	response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" })
	response.end(body)
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		size += buffer.length
		if (size > 64 * 1024) throw new Error("Request body is too large")
		chunks.push(buffer)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

const [developmentSource, htmlSource] = await Promise.all([
	readFile(resolve(developmentArgument)),
	readFile(resolve(htmlArgument)),
])
const development = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
const developmentSha256 = sha256(developmentSource)
const htmlSha256 = sha256(htmlSource)
const sources = new Map(development.entries.map((entry) => [entry.familyId, entry.anchor.file]))
const familyIds = new Set(sources.keys())
let feedback: FeedbackStore
try {
	const source = await readFile(feedbackPath)
	const value: unknown = JSON.parse(source.toString("utf8"))
	if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "experimentVersion", "developmentSha256", "htmlSha256", "entries"]) ||
		value.schemaVersion !== 1 || value.experimentVersion !== development.experimentVersion ||
		value.developmentSha256 !== developmentSha256 || value.htmlSha256 !== htmlSha256 || !Array.isArray(value.entries)) {
		throw new Error("Feedback store does not match this development review")
	}
	const entries = value.entries.map((entry) => parseFeedbackEntry(entry, true, familyIds))
	if (new Set(entries.map((entry) => entry.familyId)).size !== entries.length) throw new Error("Feedback entries are duplicated")
	feedback = { schemaVersion: 1, experimentVersion: development.experimentVersion, developmentSha256, htmlSha256, entries }
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	feedback = { schemaVersion: 1, experimentVersion: development.experimentVersion, developmentSha256, htmlSha256, entries: [] }
	await atomicWrite(feedbackPath, feedback)
}

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && url.pathname === "/") {
			respond(response, 200, htmlSource.toString("utf8"), "text/html; charset=utf-8")
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
			const entry = parseFeedbackEntry(await requestBody(request), false, familyIds)
			feedback.entries = [...feedback.entries.filter((stored) => stored.familyId !== entry.familyId), entry]
				.sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
			await atomicWrite(feedbackPath, feedback)
			respond(response, 200, JSON.stringify(entry), "application/json; charset=utf-8")
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/artwork/")) {
			const familyId = decodeURIComponent(url.pathname.slice("/artwork/".length))
			const relative = sources.get(familyId)
			if (!relative) {
				respond(response, 404, "Unknown artwork")
				return
			}
			const path = await realpath(resolve(projectRoot, relative))
			if (!path.startsWith(`${allowedRoot(relative)}${sep}`)) throw new Error("Artwork path escapes its corpus")
			const metadata = await stat(path)
			const contentType = contentTypes.get(extname(path).toLowerCase())
			if (!metadata.isFile() || !contentType) throw new Error("Artwork type is unsupported")
			response.writeHead(200, { "content-type": contentType, "content-length": metadata.size, "cache-control": "private, max-age=3600" })
			createReadStream(path).pipe(response)
			return
		}
		respond(response, 404, "Not found")
	} catch (error) {
		respond(response, 400, error instanceof Error ? error.message : "Request failed")
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`Gradient eligibility review: http://127.0.0.1:${port}/\n`)
})
