import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { computeSemanticResultsSha256, validateSelectionManifest } from "./src/corpus-selection.ts"
import {
	PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT,
	PALETTE_ROLE_00_AUDIT_VERSION,
	paletteRole00AuditImplementationFiles,
	paletteRole00AuditPresentationFiles,
	parsePaletteRole00AuditFeedbackEntry,
	parsePaletteRole00AuditFeedbackStore,
	parsePaletteRole00AuditManifest,
	validatePaletteRole00AuditSample,
	type PaletteRole00AuditFeedbackStore,
} from "./src/palette-role-00-audit.ts"
import type { CorpusResult } from "./src/types.ts"

const [manifestArgument, feedbackArgument, portArgument = "3121", ...unexpected] = process.argv.slice(2)
if (!manifestArgument || !feedbackArgument || unexpected.length > 0 || !/^\d+$/.test(portArgument)) {
	throw new Error("Usage: serve-palette-role-00-audit.ts <manifest.json> <feedback.json> [port]")
}
const port = Number(portArgument)
if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535")

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const auditRoot = fileURLToPath(new URL("./palette-role-00-audit", import.meta.url))
const manifestPath = resolve(manifestArgument)
const feedbackPath = resolve(feedbackArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function contentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp"
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "image/avif"
	throw new Error("Selected artwork type is unsupported")
}

function respond(response: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8"): void {
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
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		if (refuseOverwrite) {
			try {
				await link(temporary, path)
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
				throw error
			}
		} else {
			await rename(temporary, path)
		}
	} finally {
		await rm(temporary, { force: true })
	}
}

const manifestSource = await readFile(manifestPath)
const manifest = parsePaletteRole00AuditManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
for (const file of [...paletteRole00AuditImplementationFiles, ...paletteRole00AuditPresentationFiles]) {
	const expected = manifest.provenance.implementation[file] ?? manifest.provenance.presentation[file]
	if (!expected || sha256(await readFile(resolve(projectRoot, file))) !== expected) {
		throw new Error(`Bound audit file changed after preparation: ${file}`)
	}
}

const [holdoutSource, selectionSource] = await Promise.all([
	readFile(resolve(researchRoot, "data/holdout-results.json")),
	readFile(resolve(researchRoot, "data/selection.json")),
])
if (sha256(holdoutSource) !== manifest.provenance.canonicalHoldout.rawSha256 ||
	sha256(selectionSource) !== manifest.provenance.sourceSelection.rawSha256) {
	throw new Error("Canonical audit artifacts changed after preparation")
}
const holdout = JSON.parse(holdoutSource.toString("utf8")) as CorpusResult
const selectionValue: unknown = JSON.parse(selectionSource.toString("utf8"))
if (holdout.algorithmVersion !== PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION ||
	holdout.entries.length !== PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT ||
	computeSemanticResultsSha256(holdout) !== manifest.provenance.canonicalHoldout.semanticSha256) {
	throw new Error("Canonical holdout semantic provenance changed after preparation")
}
validateSelectionManifest(selectionValue, holdout, sha256(holdoutSource))
if (selectionValue.manifestId !== manifest.provenance.sourceSelection.manifestId) {
	throw new Error("Source selection identity changed after preparation")
}
validatePaletteRole00AuditSample(manifest, selectionValue)

const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) {
	staticFiles.set(route, { bytes: await readFile(resolve(auditRoot, file)), type })
}

const root = await realpath(projectRoot)
const artworks = new Map<string, { bytes: Buffer; type: string }>()
for (const entry of manifest.entries) {
	const path = await realpath(resolve(projectRoot, entry.source.file))
	if (!path.startsWith(`${root}${sep}`)) throw new Error(`Selected source escapes the project root: ${entry.source.file}`)
	const bytes = await readFile(path)
	if (bytes.byteLength !== entry.source.bytes || sha256(bytes) !== entry.source.sha256) {
		throw new Error(`Selected source changed after preparation: ${entry.source.file}`)
	}
	artworks.set(entry.caseId, { bytes, type: contentType(bytes) })
}

let feedback: PaletteRole00AuditFeedbackStore
if (await exists(feedbackPath)) {
	feedback = parsePaletteRole00AuditFeedbackStore(JSON.parse(await readFile(feedbackPath, "utf8")) as unknown, manifest)
} else {
	feedback = {
		schemaVersion: 1,
		auditVersion: PALETTE_ROLE_00_AUDIT_VERSION,
		manifestId: manifest.manifestId,
		entries: [],
	}
	await atomicWrite(feedbackPath, feedback, true)
}

const publicAudit = {
	auditVersion: manifest.auditVersion,
	presentationVersion: manifest.presentationVersion,
	algorithmVersion: manifest.algorithmVersion,
	manifestId: manifest.manifestId,
	batchSize: manifest.batchSize,
	totalBatches: manifest.totalBatches,
	entries: manifest.entries.map(({ source, ...entry }) => ({
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
		if (request.method === "GET" && url.pathname === "/api/audit") {
			respond(response, 200, JSON.stringify(publicAudit), "application/json; charset=utf-8")
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
			const entry = parsePaletteRole00AuditFeedbackEntry(await requestBody(request), manifest, false)
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
			const caseId = decodeURIComponent(url.pathname.slice("/artwork/".length))
			const artwork = artworks.get(caseId)
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
	process.stderr.write(`Palette role 00 development audit: http://127.0.0.1:${port}/\n`)
})
