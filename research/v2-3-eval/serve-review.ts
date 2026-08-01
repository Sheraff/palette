import { appendFile, mkdir, readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import {
	type Batch,
	type BatchKey,
	type BlindPalette,
	batchesRoot,
	dataRoot,
	evalRoot,
	imageContentType,
	invariant,
	readJson,
	repoRoot,
	roles,
	sha256,
	verdictsPath,
} from "./src/shared.ts"
import { sampleImageSwatches, withPaletteSwatches, type Swatch } from "./src/swatches.ts"
import { namePalette } from "../src/color-name.ts"

/**
 * Serve the blinded A/B human review UI for one batch.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts <batch-name> [--port 3005]
 *
 * The unblinding key never leaves the server: `/api/batch` carries only sides A and B, and the
 * submitted preference is resolved back to true labels before it is appended to the warehouse.
 */

const { values, positionals } = parseArgs({
	options: { port: { type: "string", default: "3005" } },
	allowPositionals: true,
	strict: true,
})

invariant(positionals.length === 1, "usage: serve-review.ts <batch-name> [--port 3005]")
const batchName = positionals[0]
invariant(/^[a-z0-9][a-z0-9._-]*$/iu.test(batchName), "batch name must be a filesystem-safe token")
const port = Number(values.port)
invariant(Number.isSafeInteger(port) && port > 0 && port < 65_536, "--port must be a valid TCP port")

export const verdicts = ["strong", "acceptable", "weak-fallback", "unacceptable"] as const
// The gradient decision's own channel (2026-08-01): three arms were blocked because every gradient
// opinion lived in free text — the warehouse could not distinguish "should be flat" from silence.
// Optional per item; null means the reviewer was not judging the field treatment.
export const gradientVerdicts = ["as-preferred", "should-be-gradient", "should-be-flat", "either-works"] as const
export const starterTags = ["wrong-role", "incomplete-identity", "contrast", "missing-gradient",
	"extraneous-gradient", "wrong-midpoint", "other"] as const
const preferences = ["A", "B", "equal"] as const

const batch = await readJson<Batch>(resolve(batchesRoot, `${batchName}.json`))
const key = await readJson<BatchKey>(resolve(batchesRoot, `${batchName}.key.json`))
invariant(batch.name === batchName && key.name === batchName, "Batch and key names disagree")
invariant(batch.items.length >= 4 && batch.items.length <= 10, "A review batch must hold 4-10 items")
invariant(key.sides.length === batch.items.length, "Key does not cover every batch item")

type LoadedItem = Readonly<{
	image: string
	bytes: Buffer
	contentType: string
	swatches: readonly Swatch[]
	sides: BatchKey["sides"][number]
	/** The label pair this item compares: per-item when the key carries one, batch-level otherwise. */
	labels: readonly string[]
	A: BlindPalette
	B: BlindPalette
	/** True when both algorithms produced exactly the same displayed treatment: not a real comparison. */
	identical: boolean
	sourceSha256: string
}>

/** The complete displayed surface of a palette, used for identity comparison. */
function displayedKey(palette: BlindPalette): string {
	return [
		...roles.map((role) => palette[role].hex),
		palette.gradient ? "gradient" : "flat",
		palette.collapse.surface ? "surface-collapsed" : "surface-distinct",
		palette.collapse.accent ? "accent-collapsed" : "accent-distinct",
		palette.midpoint ?? "no-midpoint",
	].join("\0")
}

const items: LoadedItem[] = []
for (const [index, item] of batch.items.entries()) {
	const sides = key.sides[index]
	invariant(sides.image === item.image, `Key entry ${index} does not match batch item ${item.image}`)
	invariant(sides.A !== sides.B, `Key entry ${index} (${item.image}) compares a label with itself`)
	// Keys written before per-item pairs existed carry only the batch-level pair, which then applies to every item.
	const labels = sides.labels ?? key.labels
	invariant(labels.length === 2 && labels.includes(sides.A) && labels.includes(sides.B),
		`Key entry ${index} (${item.image}) has sides outside its label pair`)
	const bytes = await readFile(resolve(repoRoot, item.imagePath))
	invariant(bytes.byteLength === item.byteCount && sha256(bytes) === item.sourceSha256,
		`Artwork custody changed for ${item.image}`)
	const paletteHexes = [item.A, item.B].flatMap((palette) =>
		[...roles.map((role) => palette[role].hex), ...(palette.midpoint === null ? [] : [palette.midpoint])])
	items.push({
		image: item.image,
		bytes,
		contentType: imageContentType(bytes),
		swatches: withPaletteSwatches(await sampleImageSwatches(bytes), paletteHexes),
		sides,
		labels,
		A: item.A,
		B: item.B,
		identical: displayedKey(item.A) === displayedKey(item.B),
		sourceSha256: item.sourceSha256,
	})
}

/**
 * Presentation-only nearest color names, from the repository's `colornames-oklab` wrapper. Every color
 * the review UI displays carries one. They never feed extraction, scoring, or any recorded judgement.
 */
const allHexes = [...new Set(items.flatMap((item) => [
	...[item.A, item.B].flatMap((palette) =>
		[...roles.map((role) => palette[role].hex), ...(palette.midpoint === null ? [] : [palette.midpoint])]),
	...item.swatches.map((swatch) => swatch.hex),
]))].sort()
const namesByHex = new Map(namePalette(allHexes.map((hex) => [
	Number.parseInt(hex.slice(1, 3), 16),
	Number.parseInt(hex.slice(3, 5), 16),
	Number.parseInt(hex.slice(5, 7), 16),
] as const)).map((descriptor, index) => [allHexes[index], descriptor.nearestName]))

function colorName(hex: string): string {
	const name = namesByHex.get(hex)
	invariant(name !== undefined, `Missing color name for ${hex}`)
	return name
}

function namedPalette(palette: BlindPalette) {
	return {
		...palette,
		...Object.fromEntries(roles.map((role) =>
			[role, { ...palette[role], name: colorName(palette[role].hex) }])),
		midpointName: palette.midpoint === null ? null : colorName(palette.midpoint),
	}
}

const publicPayload = {
	batch: batchName,
	verdicts,
	gradientVerdicts,
	starterTags,
	roles,
	items: items.map((item, index) => ({
		index,
		image: item.image,
		media: `/media/${encodeURIComponent(item.image)}`,
		identical: item.identical,
		swatches: item.swatches.map((swatch) => ({ ...swatch, name: colorName(swatch.hex) })),
		A: namedPalette(item.A),
		B: namedPalette(item.B),
	})),
}

const staticFiles = new Map<string, { bytes: Buffer; type: string }>()
for (const [route, file, type] of [
	["/", "index.html", "text/html; charset=utf-8"],
	["/index.html", "index.html", "text/html; charset=utf-8"],
	["/app.js", "app.js", "text/javascript; charset=utf-8"],
	["/styles.css", "styles.css", "text/css; charset=utf-8"],
] as const) {
	staticFiles.set(route, { bytes: await readFile(resolve(evalRoot, "review-app", file)), type })
}

function headers(contentType: string, length: number): Record<string, string | number> {
	return {
		"Content-Type": contentType,
		"Content-Length": length,
		"Cache-Control": "no-store, max-age=0",
		"Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; "
			+ "img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
	}
}

function respond(response: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8") {
	response.writeHead(status, headers(type, Buffer.byteLength(body)))
	response.end(body)
}

function respondJson(response: ServerResponse, status: number, value: unknown): void {
	respond(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8")
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		size += bytes.byteLength
		if (size > 256 * 1024) throw new RangeError("Request body exceeds 256 KiB")
		chunks.push(bytes)
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

type SubmittedItem = Readonly<{
	image: string
	preference: typeof preferences[number]
	verdict: typeof verdicts[number]
	gradientVerdict: typeof gradientVerdicts[number] | null
	corrections: Readonly<Record<string, string>>
	tags: readonly string[]
	notes: string
}>

function parseSubmission(value: unknown): SubmittedItem[] {
	invariant(typeof value === "object" && value !== null, "Submission must be an object")
	const record = value as Record<string, unknown>
	invariant(record.batch === batchName, "Submission targets a different batch")
	invariant(Array.isArray(record.items) && record.items.length === items.length,
		`Submission must carry exactly ${items.length} items`)
	return record.items.map((raw, index) => {
		invariant(typeof raw === "object" && raw !== null, `Item ${index} must be an object`)
		const entry = raw as Record<string, unknown>
		const item = items[index]
		invariant(entry.image === item.image, `Item ${index} must be ${item.image}`)
		invariant(typeof entry.preference === "string" && (preferences as readonly string[]).includes(entry.preference),
			`Item ${item.image} needs a preference of ${preferences.join(" / ")}`)
		// An identical pair is not a comparison: a side preference on it would be a meaningless judgement.
		invariant(!item.identical || entry.preference === "equal",
			`Item ${item.image} shows one identical palette on both sides and cannot carry a side preference`)
		invariant(typeof entry.verdict === "string" && (verdicts as readonly string[]).includes(entry.verdict),
			`Item ${item.image} needs a verdict of ${verdicts.join(" / ")}`)
		const gradientVerdict = entry.gradientVerdict === undefined || entry.gradientVerdict === null
			? null
			: entry.gradientVerdict
		invariant(gradientVerdict === null || (gradientVerdicts as readonly string[]).includes(gradientVerdict as string),
			`Item ${item.image} gradient verdict must be one of ${gradientVerdicts.join(" / ")} or absent`)
		const corrections: Record<string, string> = {}
		if (entry.corrections !== undefined && entry.corrections !== null) {
			invariant(typeof entry.corrections === "object", `Item ${item.image} corrections must be an object`)
			const allowed = new Set(item.swatches.map((swatch) => swatch.hex))
			for (const [role, hex] of Object.entries(entry.corrections as Record<string, unknown>)) {
				invariant((roles as readonly string[]).includes(role), `Unknown corrected role ${role}`)
				invariant(typeof hex === "string" && allowed.has(hex),
					`Correction for ${role} on ${item.image} must be one of the sampled swatches`)
				corrections[role] = hex
			}
		}
		const tags = entry.tags === undefined || entry.tags === null ? [] : entry.tags
		invariant(Array.isArray(tags) && tags.length <= 12, `Item ${item.image} carries too many tags`)
		for (const tag of tags) {
			invariant(typeof tag === "string" && tag.length > 0 && tag.length <= 64, `Invalid tag on ${item.image}`)
		}
		const notes = entry.notes === undefined || entry.notes === null ? "" : entry.notes
		invariant(typeof notes === "string" && notes.length <= 4_000, `Item ${item.image} notes are too long`)
		return {
			image: item.image,
			preference: entry.preference as typeof preferences[number],
			verdict: entry.verdict as typeof verdicts[number],
			gradientVerdict: gradientVerdict as typeof gradientVerdicts[number] | null,
			corrections,
			tags: [...new Set(tags as string[])].sort(),
			notes,
		}
	})
}

/** One self-contained warehouse record per reviewed item, un-blinded server-side. */
function warehouseRecord(submitted: SubmittedItem, item: LoadedItem, recordedAt: string) {
	const preferredLabel = submitted.preference === "equal" ? null : item.sides[submitted.preference]
	return {
		schemaVersion: 1,
		recordedAt,
		batch: batchName,
		image: item.image,
		imageSha256: item.sourceSha256,
		// The pair this item compares. Batches may mix pairs, so this is per record, never batch-global.
		labels: item.labels,
		blindSides: { A: item.sides.A, B: item.sides.B },
		palettes: { [item.sides.A]: item.A, [item.sides.B]: item.B },
		// "identical" means both labels produced the same displayed treatment and the reviewer judged one
		// palette in an absolute-only flow. It must never be mined as a genuine preference for equality.
		comparison: item.identical ? "identical" : "ab",
		preference: { side: submitted.preference === "equal" ? null : submitted.preference, label: preferredLabel },
		verdict: submitted.verdict,
		verdictApplies: preferredLabel === null ? item.labels : [preferredLabel],
		corrections: submitted.corrections,
		// Epistemology travels with the data: a correction is ONE palette this reviewer would endorse, not
		// the unique correct answer, and an empty one is not disagreement. Mining must never treat it as an
		// oracle - several palettes can be valid for the same artwork.
		correctionsKind: "endorsed-sample",
		tags: submitted.tags,
		notes: submitted.notes,
	}
}

let mutations = Promise.resolve()

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const file = staticFiles.get(url.pathname)!
			respond(response, 200, file.bytes, file.type)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/batch") {
			respondJson(response, 200, publicPayload)
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/media/")) {
			const wanted = decodeURIComponent(url.pathname.slice("/media/".length))
			const item = items.find((entry) => entry.image === wanted)
			if (item === undefined) {
				respondJson(response, 404, { error: "Unknown artwork" })
				return
			}
			respond(response, 200, item.bytes, item.contentType)
			return
		}
		if (request.method === "POST" && url.pathname === "/api/submit") {
			const submitted = parseSubmission(await requestBody(request))
			const recordedAt = new Date().toISOString()
			const lines = submitted
				.map((entry, index) => `${JSON.stringify(warehouseRecord(entry, items[index], recordedAt))}\n`).join("")
			const write = async () => {
				await mkdir(dataRoot, { recursive: true })
				await appendFile(verdictsPath, lines)
			}
			const result = mutations.then(write, write)
			mutations = result.then(() => undefined, () => undefined)
			await result
			process.stdout.write(`appended ${submitted.length} verdict record(s) to ${verdictsPath}\n`)
			respondJson(response, 201, { appended: submitted.length, warehouse: "data/verdicts.jsonl" })
			return
		}
		respondJson(response, 404, { error: "Not found" })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		respondJson(response, 400, { error: message })
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stdout.write(`v2-3 review batch "${batchName}" (${items.length} items): http://127.0.0.1:${port}/\n`)
})
