import { createHash, randomUUID } from "node:crypto"
import { access, link, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget } from "./src/candidate-output.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" |
	"no-visible-difference" | "selected-colors-not-identifiable"
type Entry = { familyId: string; anchor: { file: string; sha256: string; bytes: number }; pairSha256: string;
	palette: Record<string, unknown>; gradientFirst: boolean }
type Review = { schemaVersion: 1; reviewVersion: string; generatedAt: string; manifestId: string;
	provenance: Record<string, string>; entries: Entry[] }
type FeedbackEntry = { familyId: string; pairSha256: string; decision: Decision; comment: string; submittedAt: string }
type Feedback = { schemaVersion: 1; reviewVersion: string; reviewSha256: string; htmlSha256: string;
	entries: FeedbackEntry[] }

const [reviewArgument, htmlArgument, renderArgument, feedbackArgument, portArgument = "3118", ...unexpected] =
	process.argv.slice(2)
if (!reviewArgument || !htmlArgument || !renderArgument || !feedbackArgument || unexpected.length > 0 ||
	!/^\d+$/.test(portArgument)) {
	throw new Error("Usage: serve-gradient-field-topology-music-repeat-review.ts <review.json> <review.html> <render.json> <feedback.json> [port]")
}
const port = Number(portArgument)
if (port < 1 || port > 65535) throw new Error("Port is invalid")
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const feedbackPath = resolve(feedbackArgument)
const decisions = new Set<Decision>(["should-be-gradient", "should-not-be-gradient", "either-way",
	"no-visible-difference", "selected-colors-not-identifiable"])

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} has unexpected keys`)
}

function parseReview(value: unknown): Review {
	if (!isRecord(value)) throw new Error("Review is invalid")
	exactKeys(value, ["schemaVersion", "reviewVersion", "generatedAt", "manifestId", "provenance", "entries"], "Review")
	if (value.schemaVersion !== 1 || value.reviewVersion !== "gradient-field-topology-3.0.0-music-repeat-review-1" ||
		typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
		typeof value.manifestId !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestId) ||
		!isRecord(value.provenance) || !Array.isArray(value.entries) || value.entries.length !== 25) throw new Error("Review header is invalid")
	exactKeys(value.provenance, ["manifestSha256", "evaluationSha256", "developmentSha256", "modelFileSha256",
		"modelIdentitySha256", "parameterSha256"], "Review provenance")
	const families = new Set<string>(), pairs = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue, ["familyId", "anchor", "pairSha256", "palette", "gradientFirst"], `Entry ${index}`)
		if (typeof entryValue.familyId !== "string" || families.has(entryValue.familyId) ||
			typeof entryValue.pairSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.pairSha256) ||
			pairs.has(entryValue.pairSha256) || typeof entryValue.gradientFirst !== "boolean" ||
			!isRecord(entryValue.anchor) || !isRecord(entryValue.palette)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue.anchor, ["file", "sha256", "bytes"], `Entry ${index} anchor`)
		if (typeof entryValue.anchor.file !== "string" ||
			!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(entryValue.anchor.file) ||
			typeof entryValue.anchor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.anchor.sha256) ||
			!Number.isInteger(entryValue.anchor.bytes) || (entryValue.anchor.bytes as number) <= 0) throw new Error(`Entry ${index} anchor is invalid`)
		exactKeys(entryValue.palette, ["background", "foreground", "surface", "accent"], `Entry ${index} palette`)
		for (const role of ["background", "foreground", "surface", "accent"]) {
			const color = entryValue.palette[role]
			if (!isRecord(color)) throw new Error(`Entry ${index} ${role} is invalid`)
			exactKeys(color, ["rgb", "hex"], `Entry ${index} ${role}`)
			if (!Array.isArray(color.rgb) || color.rgb.length !== 3 || color.rgb.some((channel) =>
				!Number.isInteger(channel) || channel < 0 || channel > 255) ||
				typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(color.hex)) throw new Error(`Entry ${index} ${role} is invalid`)
		}
		families.add(entryValue.familyId)
		pairs.add(entryValue.pairSha256)
	}
	return value as unknown as Review
}

function parseRender(value: unknown, reviewSha256: string, htmlSha256: string): void {
	if (!isRecord(value)) throw new Error("Render binding is invalid")
	exactKeys(value, ["schemaVersion", "renderVersion", "generatedAt", "planFile", "planSha256", "htmlFile", "htmlSha256"], "Render")
	if (value.schemaVersion !== 1 || value.renderVersion !== "gradient-field-topology-3.0.0-music-repeat-render-1" ||
		typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
		value.planSha256 !== reviewSha256 || value.htmlSha256 !== htmlSha256 ||
		typeof value.planFile !== "string" || typeof value.htmlFile !== "string") throw new Error("Render binding is stale")
}

function parseFeedbackEntry(value: unknown, stored: boolean, plans: ReadonlyMap<string, Entry>): FeedbackEntry {
	if (!isRecord(value)) throw new Error("Feedback entry is invalid")
	exactKeys(value, stored ? ["familyId", "pairSha256", "decision", "comment", "submittedAt"] :
		["familyId", "pairSha256", "decision", "comment"], "Feedback entry")
	const plan = typeof value.familyId === "string" ? plans.get(value.familyId) : undefined
	if (!plan || value.pairSha256 !== plan.pairSha256 || typeof value.decision !== "string" ||
		!decisions.has(value.decision as Decision) || typeof value.comment !== "string" || value.comment.length > 2000 ||
		stored && (typeof value.submittedAt !== "string" || !Number.isFinite(Date.parse(value.submittedAt)))) {
		throw new Error("Feedback entry is invalid or unbound")
	}
	return { familyId: value.familyId as string, pairSha256: value.pairSha256 as string,
		decision: value.decision as Decision, comment: value.comment,
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString() }
}

async function exists(path: string): Promise<boolean> {
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
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		if (refuseOverwrite) await link(temporary, path)
		else await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

function contentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp"
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "image/avif"
	throw new Error("Unsupported selected artwork type")
}

function respond(response: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8"): void {
	response.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body), "cache-control": "no-store" })
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

const [reviewSource, htmlSource, renderSource] = await Promise.all([
	readFile(resolve(reviewArgument)), readFile(resolve(htmlArgument)), readFile(resolve(renderArgument)),
])
const reviewSha256 = sha256(reviewSource), htmlSha256 = sha256(htmlSource)
const review = parseReview(JSON.parse(reviewSource.toString("utf8")) as unknown)
parseRender(JSON.parse(renderSource.toString("utf8")) as unknown, reviewSha256, htmlSha256)
const plans = new Map(review.entries.map((entry) => [entry.familyId, entry]))
const existing = await exists(feedbackPath)
if (!existing) await prepareOutputTarget({ path: feedbackPath, refuseOverwrite: true })
let feedback: Feedback
if (existing) {
	const value = JSON.parse(await readFile(feedbackPath, "utf8")) as unknown
	if (!isRecord(value)) throw new Error("Feedback store is invalid")
	exactKeys(value, ["schemaVersion", "reviewVersion", "reviewSha256", "htmlSha256", "entries"], "Feedback store")
	if (value.schemaVersion !== 1 || value.reviewVersion !== review.reviewVersion || value.reviewSha256 !== reviewSha256 ||
		value.htmlSha256 !== htmlSha256 || !Array.isArray(value.entries)) throw new Error("Feedback store is stale")
	const entries = value.entries.map((entry) => parseFeedbackEntry(entry, true, plans))
	if (new Set(entries.map((entry) => entry.familyId)).size !== entries.length) throw new Error("Feedback is duplicated")
	feedback = { schemaVersion: 1, reviewVersion: review.reviewVersion, reviewSha256, htmlSha256, entries }
} else feedback = { schemaVersion: 1, reviewVersion: review.reviewVersion, reviewSha256, htmlSha256, entries: [] }
const musicRoot = await realpath(resolve(projectRoot, "music-artworks"))
const artworks = new Map<string, { bytes: Buffer; type: string }>()
for (const entry of review.entries) {
	const path = await realpath(resolve(projectRoot, entry.anchor.file))
	if (!path.startsWith(`${musicRoot}${sep}`)) throw new Error(`Source escapes music-artworks: ${entry.anchor.file}`)
	const bytes = await readFile(path)
	if (bytes.byteLength !== entry.anchor.bytes || sha256(bytes) !== entry.anchor.sha256) throw new Error(`Source changed: ${entry.anchor.file}`)
	artworks.set(entry.familyId, { bytes, type: contentType(bytes) })
}
if (!existing) await atomicWrite(feedbackPath, feedback, true)

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && url.pathname === "/") return respond(response, 200, htmlSource, "text/html; charset=utf-8")
		if (request.method === "GET" && url.pathname === "/api/feedback") return respond(response, 200, JSON.stringify(feedback), "application/json; charset=utf-8")
		if (request.method === "POST" && url.pathname === "/api/feedback") {
			if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") return respond(response, 415, "Expected application/json")
			const entry = parseFeedbackEntry(await requestBody(request), false, plans)
			feedback.entries = [...feedback.entries.filter((stored) => stored.familyId !== entry.familyId), entry]
				.sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
			await atomicWrite(feedbackPath, feedback, false)
			return respond(response, 200, JSON.stringify(entry), "application/json; charset=utf-8")
		}
		if (request.method === "GET" && url.pathname.startsWith("/artwork/")) {
			const artwork = artworks.get(decodeURIComponent(url.pathname.slice("/artwork/".length)))
			return artwork ? respond(response, 200, artwork.bytes, artwork.type) : respond(response, 404, "Unknown artwork")
		}
		respond(response, 404, "Not found")
	} catch (error) {
		respond(response, 400, error instanceof Error ? error.message : "Request failed")
	}
})
server.listen(port, "127.0.0.1", () => process.stderr.write(`Music repeat review: http://127.0.0.1:${port}/\n`))
