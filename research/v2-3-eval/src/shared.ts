import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Shared vocabulary for the v2-3 evaluation harness (run-corpus / diff-report / make-batch / serve-review). */

export const evalRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const researchRoot = dirname(evalRoot)
export const repoRoot = dirname(researchRoot)
export const imagesRoot = resolve(repoRoot, "images")
export const dataRoot = resolve(evalRoot, "data")
export const resultsRoot = resolve(dataRoot, "results")
export const batchesRoot = resolve(dataRoot, "batches")
export const verdictsPath = resolve(dataRoot, "verdicts.jsonl")

export const roles = ["background", "surface", "foreground", "accent"] as const
export type Role = typeof roles[number]

export const algorithms = {
	"v2-2": "../v2-2/index.ts",
	"v2-3": "../v2-3/index.ts",
} as const
export type AlgorithmName = keyof typeof algorithms

export const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])

export type RGB = readonly [number, number, number]
export type OKLab = readonly [number, number, number]

export type PaletteColor = Readonly<{
	rgb: RGB
	oklab: OKLab
	hex: string
	generated: boolean
}>

export type PaletteTreatment = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	foreground: PaletteColor
	accent: PaletteColor
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

export type ResearchRender = Readonly<{
	schemaVersion: 1
	field: Readonly<{
		kind: "linear-gradient"
		angleDegrees: 135
		interpolation: "oklab"
		stops: readonly Readonly<{ kind: string; hex?: string; role?: string; position: number }>[]
	}>
}>

/** Structural mirror of the `PaletteExtraction` exported by both `research/v2-2` and `research/v2-3`. */
export type PaletteExtraction = Readonly<{
	algorithm: string
	width: number
	height: number
	winner: PaletteTreatment
	researchRender?: ResearchRender
}>

export type PaletteModule = Readonly<{
	algorithmIdentity: string
	extractPaletteFromBytes: (source: string | Uint8Array) => Promise<PaletteExtraction>
}>

/** One cached corpus run: the full extraction plus the custody of the bytes that produced it. */
export type CachedResult = Readonly<{
	schemaVersion: 1
	label: string
	algorithm: AlgorithmName
	algorithmIdentity: string
	image: string
	imagePath: string
	sourceSha256: string
	byteCount: number
	extraction: PaletteExtraction
}>

/**
 * The label-free projection of a palette handed to the review UI. The algorithm identity is
 * deliberately absent so a blinded side cannot be recognised from its payload.
 */
export type BlindPalette = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	foreground: PaletteColor
	accent: PaletteColor
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	midpoint: string | null
	width: number
	height: number
}>

export type BatchItem = Readonly<{
	image: string
	imagePath: string
	sourceSha256: string
	byteCount: number
	A: BlindPalette
	B: BlindPalette
}>

export type Batch = Readonly<{
	schemaVersion: 1
	name: string
	items: readonly BatchItem[]
}>

/**
 * The un-blinding key. `sides[i].labels` is the authoritative label pair for that item and is what a
 * verdict record carries; it is absent in keys written before per-item pairs existed, where the
 * batch-level `labels` applies to every item.
 */
export type BatchKey = Readonly<{
	schemaVersion: 1
	name: string
	labels: readonly string[]
	sides: readonly Readonly<{
		image: string
		sourceSha256: string
		labels?: readonly [string, string]
		A: string
		B: string
	}>[]
}>

export function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function isAlgorithmName(value: string): value is AlgorithmName {
	return Object.hasOwn(algorithms, value)
}

export async function loadAlgorithm(name: AlgorithmName): Promise<PaletteModule> {
	// Literal specifiers keep the dependency statically visible to tooling.
	const loaded = name === "v2-2" ? await import("../../v2-2/index.ts") : await import("../../v2-3/index.ts")
	return loaded as unknown as PaletteModule
}

export function midpointHex(extraction: PaletteExtraction): string | null {
	const stop = extraction.researchRender?.field.stops[1]
	return stop?.kind === "source-supported-color" && typeof stop.hex === "string" ? stop.hex : null
}

export function blindPalette(extraction: PaletteExtraction): BlindPalette {
	const winner = extraction.winner
	return {
		background: winner.background,
		surface: winner.surface,
		foreground: winner.foreground,
		accent: winner.accent,
		gradient: winner.gradient,
		collapse: winner.collapse,
		midpoint: midpointHex(extraction),
		width: extraction.width,
		height: extraction.height,
	}
}

export function resultPath(label: string, image: string): string {
	return resolve(resultsRoot, label, `${image}.json`)
}

export async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T
}

export async function readJsonIfPresent<T>(path: string): Promise<T | null> {
	try {
		return await readJson<T>(path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
		throw error
	}
}

/** Write-to-temp-then-rename so a crashed run never leaves a half-written cache entry. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

export async function loadResultSet(label: string): Promise<Map<string, CachedResult>> {
	const directory = resolve(resultsRoot, label)
	let entries: string[]
	try {
		entries = await readdir(directory)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`No cached results for label "${label}" (expected ${directory})`)
		}
		throw error
	}
	const results = new Map<string, CachedResult>()
	for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
		const result = await readJson<CachedResult>(resolve(directory, entry))
		results.set(result.image, result)
	}
	return results
}

function globToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&")
		.replaceAll("*", "[^/]*")
		.replaceAll("?", "[^/]")
	return new RegExp(`^${escaped}$`, "u")
}

export type ImageEntry = Readonly<{ image: string; path: string }>

/**
 * Resolve the corpus selection. `patterns` is a comma-separated list; an entry containing a path
 * separator is treated as a path relative to the repository root, anything else is matched against
 * `images/` basenames (with or without extension, `*` and `?` supported). Always returns ASCII order.
 */
export async function selectImages(patterns: string | undefined): Promise<ImageEntry[]> {
	const available = (await readdir(imagesRoot))
		.filter((name) => imageExtensions.has(name.slice(name.lastIndexOf(".")).toLowerCase()))
		.sort()
	if (patterns === undefined) return available.map((image) => ({ image, path: resolve(imagesRoot, image) }))
	const selected = new Map<string, ImageEntry>()
	for (const raw of patterns.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
		if (raw.includes("/")) {
			const path = resolve(repoRoot, raw)
			selected.set(basename(path), { image: basename(path), path })
			continue
		}
		const expression = globToRegExp(raw)
		const matches = available.filter((name) =>
			name === raw || name.slice(0, name.lastIndexOf(".")) === raw || expression.test(name))
		invariant(matches.length > 0, `No image in images/ matches "${raw}"`)
		for (const name of matches) selected.set(name, { image: name, path: resolve(imagesRoot, name) })
	}
	return [...selected.values()].sort((a, b) => (a.image < b.image ? -1 : a.image > b.image ? 1 : 0))
}

export function imageContentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		return "image/png"
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp"
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
		const brand = bytes.toString("ascii", 8, 12)
		if (brand.startsWith("avi")) return "image/avif"
		if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic"
	}
	throw new Error("Unsupported image type")
}
