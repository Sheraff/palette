import { createHash } from "node:crypto"
import { readFile, readdir, realpath } from "node:fs/promises"
import { createServer, type Server, type ServerResponse } from "node:http"
import { extname, resolve, sep } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import {
	COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY,
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	COMPLETE_PALETTE_REVIEW_VERSION,
	completePaletteReviewManifestId,
	completePaletteReviewPublicPayload,
	completePaletteReviewRoles,
	parseCompletePaletteReviewManifest,
	type CompletePaletteAbsoluteReviewManifest,
	type CompletePaletteReviewTreatment,
} from "./src/complete-palette-review-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
} from "./src/album-artwork-palette-v2-phase-3-final-candidate.ts"
import { completeTreatmentKey } from "./src/album-artwork-palette-v2.ts"
import {
	projectAlbumArtworkPaletteV2Phase3WinnerResearchRender,
} from "./src/album-artwork-palette-v2-phase-3-review-render.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_VERSION =
	"album-artwork-palette-v2-phase-3-final-showcase-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES = Object.freeze([
	"artofficial.jpg",
	"birdsofprey.jpg",
	"black.jpg",
	"disney.avif",
	"doja.jpg",
	"elephunk.jpg",
	"franz.jpg",
	"greenday.jpg",
	"havana.jpg",
	"horrorwood.jpg",
	"horsley.jpg",
	"infected.jpg",
	"johns.jpg",
	"knuckles.jpg",
	"krafty.jpg",
	"loups.jpg",
	"maroon5.jpg",
	"meteora.jpg",
	"muse.jpg",
	"nada.jpg",
	"nobs.jpg",
	"once.jpg",
	"orelsan.jpg",
	"placebo.jpg",
	"pureblack.jpg",
	"purered.jpg",
	"purewhite.jpg",
	"skap.jpg",
	"slim.jpg",
	"slipknot.jpg",
	"snarky.jpg",
	"toxicity.jpg",
	"vvbrown.jpg",
	"ybbb.jpg",
] as const)

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const generatedVariantSuffix = /-(?:masked|original|saliency|scrambled)\.[^.]+$/iu
const moduleDirectory = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const imagesRoot = resolve(projectRoot, "images")
const showcaseDirectory = resolve(moduleDirectory, "album-artwork-palette-v2-phase-3-showcase")

export type AlbumArtworkPaletteV2Phase3ShowcaseArguments = Readonly<{
	port: number
	files: readonly string[]
	completeRoster: boolean
}>

type ShowcaseSource = Readonly<{
	file: string
	sha256: string
	bytes: number
	width: number
	height: number
}>

type ShowcaseRuntime = Readonly<{
	wallMs: number
	cpuUserMs: number
	cpuSystemMs: number
}>

type PreparedEntry = Readonly<{
	caseId: string
	source: ShowcaseSource
	winnerKey: string
	treatment: CompletePaletteReviewTreatment
	runtime: ShowcaseRuntime
}>

type ArtworkRoute = Readonly<{
	path: string
	sha256: string
	bytes: number
	contentType: string
}>

export type AlbumArtworkPaletteV2Phase3ShowcasePreparation = Readonly<{
	payload: unknown
	artworks: ReadonlyMap<string, ArtworkRoute>
}>

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function ascii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function albumArtworkPaletteV2Phase3ShowcaseBaseFiles(files: readonly string[]): string[] {
	return files
		.filter((file) => supportedExtensions.has(extname(file).toLowerCase()))
		.filter((file) => !generatedVariantSuffix.test(file))
		.sort(ascii)
}

export async function verifyAlbumArtworkPaletteV2Phase3ShowcaseRoster(
	root = imagesRoot,
): Promise<readonly string[]> {
	const actual = albumArtworkPaletteV2Phase3ShowcaseBaseFiles(await readdir(root))
	const expected = [...ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES]
	invariant(actual.length === 34 && JSON.stringify(actual) === JSON.stringify(expected),
		"The canonical 34-artwork showcase roster changed")
	return expected
}

export function parseAlbumArtworkPaletteV2Phase3ShowcaseArguments(
	args: readonly string[],
): AlbumArtworkPaletteV2Phase3ShowcaseArguments {
	let port = 4318
	let completeRoster = false
	const files: string[] = []
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]
		if (argument === "--port") {
			const value = args[++index]
			if (value === undefined || !/^\d+$/u.test(value)) throw new Error("--port requires an integer")
			port = Number(value)
		} else if (argument === "--only") {
			const file = args[++index]
			if (file === undefined || file.startsWith("--")) throw new Error("--only requires a canonical filename")
			files.push(file)
		} else if (argument === "--all") {
			if (completeRoster) throw new Error("Duplicate --all")
			completeRoster = true
		} else {
			throw new Error(`Unknown showcase argument ${argument}`)
		}
	}
	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new RangeError("Port must be an integer from 1 through 65535")
	}
	if (completeRoster && files.length > 0) throw new Error("--all and --only cannot be combined")
	if (!completeRoster && files.length === 0) {
		throw new Error("Use one or more bounded --only files, or use --all after the separately required literal GO")
	}
	if (!completeRoster && files.length > 8) throw new Error("Bounded showcase preflights accept at most eight files")
	if (new Set(files).size !== files.length) throw new Error("Duplicate --only filename")
	const canonical = new Set<string>(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES)
	for (const file of files) {
		if (!canonical.has(file)) throw new Error(`Unknown canonical showcase artwork ${file}`)
	}
	return {
		port,
		files: completeRoster ? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES : files,
		completeRoster,
	}
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
	throw new TypeError("Showcase artwork type is unsupported")
}

function normalizeFinalResult(
	result: ReturnType<typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.extract>,
) {
	const normalizeTreatment = (treatment: typeof result.winner) => ({
		key: completeTreatmentKey(treatment),
		treatment,
	})
	return {
		version: result.version,
		protocol: result.protocol,
		dimensions: { width: result.width, height: result.height },
		winner: normalizeTreatment(result.winner),
		alternatives: result.alternatives.map(normalizeTreatment),
		diagnostics: result.diagnostics,
	}
}

function treatmentForReview(entry: ReturnType<typeof normalizeFinalResult>, label: string):
	CompletePaletteReviewTreatment {
	const winner = entry.winner.treatment
	const researchRender = projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		entry,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity,
		label,
	)
	return {
		roles: Object.fromEntries(completePaletteReviewRoles.map((role) => [role, {
			hex: winner[role].hex,
			generated: winner[role].generated,
		}])) as CompletePaletteReviewTreatment["roles"],
		gradient: winner.gradient,
		collapse: winner.collapse,
		...(researchRender ? { researchRender } : {}),
	}
}

async function prepareEntry(file: string): Promise<Readonly<{
	entry: PreparedEntry
	artwork: ArtworkRoute
}>> {
	const path = resolve(imagesRoot, file)
	const realImagesRoot = await realpath(imagesRoot)
	const realPath = await realpath(path)
	invariant(realPath.startsWith(`${realImagesRoot}${sep}`), `Showcase artwork escaped images/: ${file}`)
	const bytes = await readFile(realPath)
	const sourceSha256 = sha256(bytes)
	const cpuStarted = process.cpuUsage()
	const wallStarted = performance.now()
	const image = await loadNativeImage(bytes)
	const output = normalizeFinalResult(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.extract(image),
	)
	const cpu = process.cpuUsage(cpuStarted)
	return {
		entry: {
			caseId: file,
			source: {
				file: `images/${file}`,
				sha256: sourceSha256,
				bytes: bytes.byteLength,
				width: image.width,
				height: image.height,
			},
			winnerKey: output.winner.key,
			treatment: treatmentForReview(output, `Showcase ${file}`),
			runtime: {
				wallMs: performance.now() - wallStarted,
				cpuUserMs: cpu.user / 1_000,
				cpuSystemMs: cpu.system / 1_000,
			},
		},
		artwork: {
			path: realPath,
			sha256: sourceSha256,
			bytes: bytes.byteLength,
			contentType: imageContentType(bytes),
		},
	}
}

export async function prepareAlbumArtworkPaletteV2Phase3Showcase(
	options: Pick<AlbumArtworkPaletteV2Phase3ShowcaseArguments, "files" | "completeRoster">,
): Promise<AlbumArtworkPaletteV2Phase3ShowcasePreparation> {
	await verifyAlbumArtworkPaletteV2Phase3ShowcaseRoster()
	const entries: PreparedEntry[] = []
	const artworks = new Map<string, ArtworkRoute>()
	for (const [index, file] of options.files.entries()) {
		const prepared = await prepareEntry(file)
		entries.push(prepared.entry)
		artworks.set(prepared.entry.caseId, prepared.artwork)
		process.stderr.write(`[${index + 1}/${options.files.length}] ${file}\n`)
	}
	const manifestIdentity: Omit<CompletePaletteAbsoluteReviewManifest, "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
		title: "Phase 3 final individual-palette showcase",
		mode: "absolute",
		blinded: false,
		cases: entries.map((entry, order) => ({
			caseId: entry.caseId,
			order,
			source: {
				file: entry.source.file,
				sha256: entry.source.sha256,
				bytes: entry.source.bytes,
			},
			treatment: entry.treatment,
		})),
	}
	const manifest = parseCompletePaletteReviewManifest({
		...manifestIdentity,
		manifestId: completePaletteReviewManifestId(manifestIdentity),
	})
	invariant(manifest.mode === "absolute", "Showcase presentation manifest changed mode")
	const publicReview = completePaletteReviewPublicPayload(manifest)
	const metadata = new Map(entries.map((entry) => [entry.caseId, entry]))
	const presentedEntries = publicReview.cases.map((entry) => {
		invariant("treatment" in entry, `Showcase ${entry.caseId} lost its absolute treatment`)
		const details = metadata.get(entry.caseId)
		invariant(details !== undefined, `Showcase ${entry.caseId} lost extraction metadata`)
		return {
			...entry,
			file: details.source.file,
			dimensions: { width: details.source.width, height: details.source.height },
			winnerKey: details.winnerKey,
			runtime: details.runtime,
		}
	})
	return {
		payload: {
			schemaVersion: 1,
			showcaseVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_VERSION,
			attempt: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity,
			presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
			colorNamePolicy: COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY,
			rosterCount: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES.length,
			entryCount: presentedEntries.length,
			completeRoster: options.completeRoster,
			entries: presentedEntries,
		},
		artworks,
	}
}

function responseHeaders(contentType: string, length: number): Record<string, string | number> {
	return {
		"Content-Type": contentType,
		"Content-Length": length,
		"Cache-Control": "no-store, max-age=0",
		"Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
	}
}

function respond(response: ServerResponse, status: number, body: string | Buffer, contentType: string,
	headOnly = false): void {
	response.writeHead(status, responseHeaders(contentType, Buffer.byteLength(body)))
	response.end(headOnly ? undefined : body)
}

export async function createAlbumArtworkPaletteV2Phase3ShowcaseServer(
	preparation: AlbumArtworkPaletteV2Phase3ShowcasePreparation,
): Promise<Server> {
	const staticFiles = new Map<string, Readonly<{ bytes: Buffer; contentType: string }>>()
	for (const [route, file, contentType] of [
		["/", "index.html", "text/html; charset=utf-8"],
		["/index.html", "index.html", "text/html; charset=utf-8"],
		["/app.js", "app.js", "text/javascript; charset=utf-8"],
		["/styles.css", "styles.css", "text/css; charset=utf-8"],
	] as const) staticFiles.set(route, { bytes: await readFile(resolve(showcaseDirectory, file)), contentType })
	const payload = `${JSON.stringify(preparation.payload)}\n`
	return createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
			const headOnly = request.method === "HEAD"
			if (request.method !== "GET" && !headOnly) {
				respond(response, 405, "Method not allowed", "text/plain; charset=utf-8")
				return
			}
			const staticFile = staticFiles.get(url.pathname)
			if (staticFile) {
				respond(response, 200, staticFile.bytes, staticFile.contentType, headOnly)
				return
			}
			if (url.pathname === "/api/showcase") {
				respond(response, 200, payload, "application/json; charset=utf-8", headOnly)
				return
			}
			if (url.pathname.startsWith("/artwork/")) {
				const caseId = decodeURIComponent(url.pathname.slice("/artwork/".length))
				const artwork = preparation.artworks.get(caseId)
				if (!artwork) {
					respond(response, 404, "Artwork not found", "text/plain; charset=utf-8", headOnly)
					return
				}
				const bytes = await readFile(artwork.path)
				invariant(bytes.byteLength === artwork.bytes && sha256(bytes) === artwork.sha256,
					`Showcase artwork custody changed: ${caseId}`)
				respond(response, 200, bytes, artwork.contentType, headOnly)
				return
			}
			respond(response, 404, "Not found", "text/plain; charset=utf-8", headOnly)
		} catch (error) {
			const clientError = error instanceof URIError || error instanceof TypeError || error instanceof RangeError
			respond(response, clientError ? 400 : 500,
				clientError && error instanceof Error ? error.message : "Request failed", "text/plain; charset=utf-8")
		}
	})
}

async function main(): Promise<void> {
	const options = parseAlbumArtworkPaletteV2Phase3ShowcaseArguments(process.argv.slice(2))
	const preparation = await prepareAlbumArtworkPaletteV2Phase3Showcase(options)
	const server = await createAlbumArtworkPaletteV2Phase3ShowcaseServer(preparation)
	server.listen(options.port, "127.0.0.1", () => {
		process.stderr.write(`Phase 3 final palette showcase: http://127.0.0.1:${options.port}/\n`)
	})
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
