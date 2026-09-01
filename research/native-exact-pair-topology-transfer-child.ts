import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import {
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	queryNativeFieldFamiliesAndTopology,
	type NativeFieldTopologyQueryInput,
} from "./src/native-field-hypothesis-graph.ts"
import { loadNativeImage, NATIVE_IMAGE_MAXIMUM_PIXELS } from "./src/native-resolution-image.ts"
import type { RGB } from "./src/types.ts"

export const NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_MAXIMUM_RSS_BYTES = 1_342_177_280

const directRoots = new Set(["images", "00", "01", "02", "03", "04", "05", "06"])

export function resolveNativeExactPairSource(projectRoot: string, relativePath: string): string {
	if (relativePath.includes("\\")) throw new Error("Native exact-pair source path must use forward slashes")
	const parts = relativePath.split("/")
	if (parts.some((part) => part.length === 0 || part === "." || part === ".." || basename(part) !== part)) {
		throw new Error("Native exact-pair source path is invalid")
	}
	if (parts[0] === "music-artworks" ? parts.length < 2 : !directRoots.has(parts[0]) || parts.length !== 2) {
		throw new Error("Native exact-pair source root is not authorized")
	}
	return join(projectRoot, ...parts)
}

function parseRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 &&
		value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

export function parseNativeExactPairPayload(source: string): NativeFieldTopologyQueryInput {
	const value = JSON.parse(source) as unknown
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Native exact-pair payload is invalid")
	const record = value as Record<string, unknown>
	if (Object.keys(record).sort().join(",") !== "backgroundRgb,surfaceRgb" ||
		!parseRgb(record.backgroundRgb) || !parseRgb(record.surfaceRgb)) {
		throw new Error("Native exact-pair payload is invalid")
	}
	return { backgroundRgb: [...record.backgroundRgb], surfaceRgb: [...record.surfaceRgb] }
}

export async function evaluateNativeExactPairSource(
	projectRoot: string,
	relativePath: string,
	expectedSourceSha256: string,
	pair: NativeFieldTopologyQueryInput,
) {
	if (!/^[0-9a-f]{64}$/.test(expectedSourceSha256)) throw new Error("Expected source SHA-256 is invalid")
	const path = resolveNativeExactPairSource(projectRoot, relativePath)
	const fileMetadata = await lstat(path)
	if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error("Native exact-pair source must be a regular physical file")
	}
	const source = await readFile(path)
	const sourceSha256 = createHash("sha256").update(source).digest("hex")
	if (sourceSha256 !== expectedSourceSha256) throw new Error(`Native exact-pair source hash changed: ${relativePath}`)
	const startedAt = performance.now()
	const imageMetadata = await sharp(source, { limitInputPixels: false }).metadata()
	if ((imageMetadata.pages ?? 1) !== 1 || !Number.isSafeInteger(imageMetadata.width) || !Number.isSafeInteger(imageMetadata.height) ||
		(imageMetadata.width ?? 0) <= 0 || (imageMetadata.height ?? 0) <= 0) {
		throw new Error("Native exact-pair source metadata is invalid")
	}
	const encodedPixels = imageMetadata.width! * imageMetadata.height!
	if (!Number.isSafeInteger(encodedPixels)) throw new Error("Native exact-pair source dimensions are unsafe")
	if (encodedPixels > NATIVE_IMAGE_MAXIMUM_PIXELS) {
		const elapsedMs = performance.now() - startedAt
		const maximumRssBytes = process.resourceUsage().maxRSS * 1024
		return {
			schemaVersion: 1 as const,
			version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
			policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
			status: "source-ineligible" as const,
			source: { relativePath, bytes: source.byteLength, sha256: sourceSha256 },
			reason: "native-pixel-limit" as const,
			metadata: { width: imageMetadata.width!, height: imageMetadata.height!, encodedPixels },
			queries: [],
			topologyQueries: [],
			resource: { elapsedMs, maximumRssBytes },
		}
	}
	const query = queryNativeFieldFamiliesAndTopology(
		await loadNativeImage(source),
		sourceSha256,
		[pair.backgroundRgb, pair.surfaceRgb],
		[pair],
	)
	const elapsedMs = performance.now() - startedAt
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_MAXIMUM_RSS_BYTES) {
		throw new Error(`Native exact-pair child RSS ${maximumRssBytes} exceeds ${NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_MAXIMUM_RSS_BYTES}`)
	}
	return {
		schemaVersion: 1 as const,
		version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		status: "queried" as const,
		source: { relativePath, bytes: source.byteLength, sha256: sourceSha256 },
		...query,
		resource: { elapsedMs, maximumRssBytes },
	}
}

async function main(): Promise<void> {
	const relativePath = process.argv[2]
	const expectedSourceSha256 = process.argv[3]
	const payload = process.argv[4]
	if (relativePath === undefined || expectedSourceSha256 === undefined || payload === undefined || process.argv.length !== 5) {
		throw new Error("Expected source path, source SHA-256, and exact-pair JSON payload")
	}
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	process.stdout.write(`${JSON.stringify(await evaluateNativeExactPairSource(
		projectRoot,
		relativePath,
		expectedSourceSha256,
		parseNativeExactPairPayload(payload),
	))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
