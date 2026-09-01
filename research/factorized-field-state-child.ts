import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	buildNativeFieldHypothesisGraphWithFamilyQueries,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	type NativeFieldTopologyQueryInput,
} from "./src/native-field-hypothesis-graph.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import type { RGB } from "./src/types.ts"

export const FACTORIZED_FIELD_STATE_MAXIMUM_RSS_BYTES = 1_073_741_824

function resolveSource(projectRoot: string, relativePath: string): string {
	const parts = relativePath.split("/")
	if (parts.length !== 2 || !["images", "00"].includes(parts[0]) || parts[1].length === 0 ||
		parts[1] === "." || parts[1] === ".." || basename(parts[1]) !== parts[1] || parts[1].includes("\\")) {
		throw new Error("Factorized field-state child accepts only direct images/ or 00/ sources")
	}
	return join(projectRoot, parts[0], parts[1])
}

function parseRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 &&
		value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function parseQueries(source: string): { rgbs: RGB[]; topologyPairs: NativeFieldTopologyQueryInput[] } {
	const value = JSON.parse(source) as unknown
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Factorized field-state query payload is invalid")
	}
	const record = value as Record<string, unknown>
	if (!Array.isArray(record.rgbs) || record.rgbs.length > 16 || record.rgbs.some((rgb) => !parseRgb(rgb)) ||
		!Array.isArray(record.topologyPairs) || record.topologyPairs.length > 16 || record.topologyPairs.some((pair) =>
			!pair || typeof pair !== "object" || Array.isArray(pair) ||
			!parseRgb((pair as Record<string, unknown>).backgroundRgb) ||
			!parseRgb((pair as Record<string, unknown>).surfaceRgb))) {
		throw new Error("Factorized field-state query payload is invalid")
	}
	return {
		rgbs: record.rgbs.map((rgb) => [rgb[0], rgb[1], rgb[2]] as RGB),
		topologyPairs: record.topologyPairs.map((pair) => ({
			backgroundRgb: [...(pair as { backgroundRgb: RGB }).backgroundRgb],
			surfaceRgb: [...(pair as { surfaceRgb: RGB }).surfaceRgb],
		})),
	}
}

export async function evaluateFactorizedFieldStateSource(
	projectRoot: string,
	relativePath: string,
	queryRgbs: readonly RGB[],
	topologyPairs: readonly NativeFieldTopologyQueryInput[] = [],
) {
	const path = resolveSource(projectRoot, relativePath)
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error("Factorized field-state source must be a regular physical file")
	}
	const source = await readFile(path)
	const sourceSha256 = createHash("sha256").update(source).digest("hex")
	const startedAt = performance.now()
	const result = buildNativeFieldHypothesisGraphWithFamilyQueries(
		await loadNativeImage(source),
		sourceSha256,
		queryRgbs,
		topologyPairs,
	)
	const elapsedMs = performance.now() - startedAt
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > FACTORIZED_FIELD_STATE_MAXIMUM_RSS_BYTES) {
		throw new Error(`Factorized field-state child RSS ${maximumRssBytes} exceeds ${FACTORIZED_FIELD_STATE_MAXIMUM_RSS_BYTES}`)
	}
	return {
		schemaVersion: 1 as const,
		version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		source: { relativePath, bytes: source.byteLength, sha256: sourceSha256 },
		...result,
		resource: { elapsedMs, maximumRssBytes },
	}
}

async function main(): Promise<void> {
	const relativePath = process.argv[2]
	const querySource = process.argv[3]
	if (relativePath === undefined || querySource === undefined || process.argv.length !== 4) {
		throw new Error("Expected source-relative path and JSON RGB query payload")
	}
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	const queries = parseQueries(querySource)
	process.stdout.write(`${JSON.stringify(await evaluateFactorizedFieldStateSource(
		projectRoot,
		relativePath,
		queries.rgbs,
		queries.topologyPairs,
	))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
