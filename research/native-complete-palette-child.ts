import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { gzipSync } from "node:zlib"
import sharp from "sharp"
import {
	NATIVE_COMPLETE_PALETTE_CANONICAL_00_SHA256,
	NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256,
	NATIVE_COMPLETE_PALETTE_CERTIFICATE_GZIP_BYTES,
	NATIVE_COMPLETE_PALETTE_CERTIFICATE_JSON_BYTES,
	NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES,
	NATIVE_COMPLETE_PALETTE_CHILD_STDIN_BYTES,
	NATIVE_COMPLETE_PALETTE_CHILD_STDOUT_BYTES,
	NATIVE_COMPLETE_PALETTE_DIAGNOSTICS,
	NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
	canonicalExtractionScientificSha256,
	canonicalExtractionScientificValue,
	sha256,
	stableJson,
	validateNativeCompletePaletteResult,
	type NativeCompletePaletteChildMode,
	type NativeCompletePaletteChildOutput,
	type NativeCompletePaletteChildPayload,
} from "./evaluate-native-complete-palette.ts"
import { extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	buildNativeCompletePalette,
	NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
	NATIVE_COMPLETE_PALETTE_VERSION,
} from "./src/native-complete-palette.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import type { RawImage } from "./src/types.ts"

const allowedRoots = new Set(["images", "00"])
const forbiddenRoots = new Set(["10", "11", "12", "13", "14"])
const sha256Pattern = /^[0-9a-f]{64}$/

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
	return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) {
		throw new Error(`${label} has unexpected or missing fields`)
	}
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function parseNativeCompletePaletteChildPayload(source: string): NativeCompletePaletteChildPayload {
	let value: unknown
	try {
		value = JSON.parse(source)
	} catch {
		throw new Error("Expected exactly one valid JSON stdin payload")
	}
	const payload = record(value, "Native complete-palette child payload")
	exactKeys(payload, ["schemaVersion", "mode", "source", "canonical"], "Native complete-palette child payload")
	const sourceRecord = record(payload.source, "Native complete-palette child source")
	const canonical = record(payload.canonical, "Native complete-palette child canonical binding")
	exactKeys(sourceRecord, ["relativePath", "bytes", "sha256"], "Native complete-palette child source")
	exactKeys(canonical, ["artifactPath", "artifactSha256", "entryFile", "extraction"],
		"Native complete-palette child canonical binding")
	const modes: readonly NativeCompletePaletteChildMode[] = ["base", ...NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms]
	if (payload.schemaVersion !== 1 || !modes.includes(payload.mode as NativeCompletePaletteChildMode) ||
		typeof sourceRecord.relativePath !== "string" || !Number.isSafeInteger(sourceRecord.bytes) ||
		Number(sourceRecord.bytes) <= 0 || !sha256Pattern.test(String(sourceRecord.sha256)) ||
		typeof canonical.artifactPath !== "string" || !sha256Pattern.test(String(canonical.artifactSha256)) ||
		typeof canonical.entryFile !== "string") throw new Error("Native complete-palette child payload is invalid")
	const relativePath = sourceRecord.relativePath
	const root = relativePath.split("/", 1)[0]
	const expectedCanonical = root === "images"
		? ["research/data/results.json", NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256, relativePath.slice("images/".length)]
		: ["research/data/holdout-results.json", NATIVE_COMPLETE_PALETTE_CANONICAL_00_SHA256, relativePath]
	if (canonical.artifactPath !== expectedCanonical[0] || canonical.artifactSha256 !== expectedCanonical[1] ||
		canonical.entryFile !== expectedCanonical[2]) throw new Error("Canonical binding does not match the authorized source root")
	return {
		schemaVersion: 1,
		mode: payload.mode as NativeCompletePaletteChildMode,
		source: { relativePath, bytes: Number(sourceRecord.bytes), sha256: String(sourceRecord.sha256) },
		canonical: {
			artifactPath: canonical.artifactPath as NativeCompletePaletteChildPayload["canonical"]["artifactPath"],
			artifactSha256: String(canonical.artifactSha256),
			entryFile: canonical.entryFile,
			extraction: record(canonical.extraction, "Native complete-palette canonical extraction") as
				unknown as NativeCompletePaletteChildPayload["canonical"]["extraction"],
		},
	}
}

export function resolveNativeCompletePaletteSource(projectRoot: string, relativePath: string): string {
	if (relativePath.includes("\\") || relativePath.includes("\0")) throw new Error("Source path syntax is invalid")
	const parts = relativePath.split("/")
	if (forbiddenRoots.has(parts[0])) throw new Error("Reserve source roots are forbidden before file access")
	if (parts.length !== 2 || !allowedRoots.has(parts[0]) ||
		parts.some((part) => !part || part === "." || part === ".." || basename(part) !== part)) {
		throw new Error("Child accepts only direct images/<file> and 00/<file> sources")
	}
	const path = join(projectRoot, parts[0], parts[1])
	if (resolve(path) !== path) throw new Error("Resolved source path is invalid")
	return path
}

async function encodeRaw(image: RawImage): Promise<Buffer> {
	return await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } })
		.png(NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sharp.output)
		.toBuffer()
}

export async function transformNativeCompletePaletteSource(
	source: Uint8Array,
	mode: Exclude<NativeCompletePaletteChildMode, "base">,
): Promise<Buffer> {
	if (mode === "resize") {
		return await sharp(source)
			.rotate()
			.flatten({ background: { r: 255, g: 255, b: 255 } })
			.toColourspace("srgb")
			.resize({ width: 192, height: 192, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
			.removeAlpha()
			.png(NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sharp.output)
			.toBuffer()
	}
	const native = await loadNativeImage(source)
	if (mode === "reencode") return await encodeRaw(native)
	if (mode === "crop") {
		if (native.width < 4 || native.height < 4) return await encodeRaw(native)
		const width = native.width - 2
		const height = native.height - 2
		const data = new Uint8Array(width * height * 3)
		for (let y = 0; y < height; y++) {
			const start = ((y + 1) * native.width + 1) * 3
			data.set(native.data.subarray(start, start + width * 3), y * width * 3)
		}
		return await encodeRaw({ width, height, data })
	}
	const data = native.data.slice()
	for (let index = 0; index < data.length; index++) {
		const delta = ((index * 1103515245 + 12345) >>> 29) - 3
		data[index] = Math.max(0, Math.min(255, data[index] + Math.sign(delta)))
	}
	return await encodeRaw({ ...native, data })
}

export async function evaluateNativeCompletePaletteSource(
	projectRoot: string,
	payload: NativeCompletePaletteChildPayload,
): Promise<NativeCompletePaletteChildOutput> {
	if (sharp.versions.sharp !== NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sharp.version ||
		sharp.versions.vips !== NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sharp.vips) {
		throw new Error("Sharp or libvips runtime differs from the frozen execution binding")
	}
	const path = resolveNativeCompletePaletteSource(projectRoot, payload.source.relativePath)
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== payload.source.bytes ||
		await realpath(path) !== path) throw new Error("Source must be the bound regular non-symbolic physical file")
	const boundSource = await readFile(path)
	if (boundSource.byteLength !== payload.source.bytes || sha256(boundSource) !== payload.source.sha256) {
		throw new Error("Bound encoded source byte count or SHA-256 changed")
	}
	const startedAt = performance.now()
	const canonicalControl = extractPalette(await loadImage(boundSource))
	if (!isDeepStrictEqual(canonicalExtractionScientificValue(canonicalControl),
		canonicalExtractionScientificValue(payload.canonical.extraction))) {
		throw new Error("Canonical region-graph-0.19.0 extraction differs from the bound artifact row")
	}
	const evaluatedSource = payload.mode === "base" ? boundSource :
		await transformNativeCompletePaletteSource(boundSource, payload.mode)
	const evaluatedSourceSha256 = sha256(evaluatedSource)
	const canonicalExtraction = payload.mode === "base" ? canonicalControl : extractPalette(await loadImage(evaluatedSource))
	const canonical = canonicalExtraction.methods.spatial
	const native = await loadNativeImage(evaluatedSource)
	const result = buildNativeCompletePalette(native, evaluatedSourceSha256, canonical)
	const scientific = validateNativeCompletePaletteResult({
		result,
		canonical,
		sourceSha256: evaluatedSourceSha256,
		native,
		exactReferenceRequired: true,
	})
	scientific.canonicalExtractionSha256 = canonicalExtractionScientificSha256(payload.canonical.extraction)
	const certificateJson = stableJson(result.certificate)
	const certificateJsonBytes = Buffer.byteLength(certificateJson)
	if (certificateJsonBytes > NATIVE_COMPLETE_PALETTE_CERTIFICATE_JSON_BYTES) {
		throw new Error("Certificate JSON exceeds its frozen byte ceiling")
	}
	const certificateGzip = gzipSync(certificateJson, { level: 9 })
	if (certificateGzip.byteLength > NATIVE_COMPLETE_PALETTE_CERTIFICATE_GZIP_BYTES) {
		throw new Error("Compressed certificate exceeds its frozen byte ceiling")
	}
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES) {
		throw new Error("Child reported RSS exceeds its frozen ceiling")
	}
	return {
		schemaVersion: 1,
		executionVersion: NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
		candidate: NATIVE_COMPLETE_PALETTE_VERSION,
		policySha256: NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
		mode: payload.mode,
		source: payload.source,
		scientific,
		transport: {
			format: "stable-json+gzip-base64",
			gzipLevel: 9,
			certificateJsonBytes,
			certificateGzipBytes: certificateGzip.byteLength,
			certificateSha256: createHash("sha256").update(certificateJson).digest("hex"),
			certificateGzipSha256: createHash("sha256").update(certificateGzip).digest("hex"),
			certificateGzipBase64: certificateGzip.toString("base64"),
		},
		resource: { elapsedMs: performance.now() - startedAt, maximumRssBytes },
	}
}

async function readBoundedStdin(): Promise<string> {
	const chunks: Buffer[] = []
	let bytes = 0
	for await (const chunk of process.stdin) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		bytes += buffer.byteLength
		if (bytes > NATIVE_COMPLETE_PALETTE_CHILD_STDIN_BYTES) throw new Error("Child stdin exceeds its frozen byte ceiling")
		chunks.push(buffer)
	}
	if (bytes === 0) throw new Error("Expected exactly one JSON stdin payload")
	return Buffer.concat(chunks).toString("utf8")
}

async function main(): Promise<void> {
	if (process.argv.length !== 2) throw new Error("Native complete-palette child accepts no command-line payload")
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	const output = await evaluateNativeCompletePaletteSource(projectRoot,
		parseNativeCompletePaletteChildPayload(await readBoundedStdin()))
	const source = `${JSON.stringify(output)}\n`
	if (Buffer.byteLength(source) > NATIVE_COMPLETE_PALETTE_CHILD_STDOUT_BYTES) {
		throw new Error("Child result exceeds its frozen stdout byte ceiling")
	}
	process.stdout.write(source)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
