import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	loadAndExtractScaleAwareNativePaletteWithContext,
	SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
	SCALE_AWARE_NATIVE_POLICY_SHA256,
} from "./src/scale-aware-native-extract.ts"

export const SCALE_AWARE_NATIVE_MAX_RSS_BYTES = 1_073_741_824

function resolveSource(projectRoot: string, relativePath: string): string {
	const parts = relativePath.split("/")
	if (parts.length !== 2 || parts[0] !== "images" || parts[1].length === 0 ||
		parts[1] === "." || parts[1] === ".." || basename(parts[1]) !== parts[1] || parts[1].includes("\\")) {
		throw new Error("Scale-aware child accepts only direct images/ sources")
	}
	return join(projectRoot, parts[0], parts[1])
}

export async function evaluateScaleAwareNativeSource(projectRoot: string, relativePath: string) {
	const sourcePath = resolveSource(projectRoot, relativePath)
	const metadata = await lstat(sourcePath)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(sourcePath) !== sourcePath) {
		throw new Error("Scale-aware source must be a regular physical file")
	}
	const source = await readFile(sourcePath)
	const startedAt = performance.now()
	const context = await loadAndExtractScaleAwareNativePaletteWithContext(source)
	const elapsedMs = performance.now() - startedAt
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > SCALE_AWARE_NATIVE_MAX_RSS_BYTES) {
		throw new Error(`Scale-aware child RSS ${maximumRssBytes} exceeds ${SCALE_AWARE_NATIVE_MAX_RSS_BYTES}`)
	}
	return {
		schemaVersion: 1 as const,
		algorithmVersion: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
		policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		source: {
			relativePath,
			bytes: source.byteLength,
			sha256: createHash("sha256").update(source).digest("hex"),
		},
		context,
		resource: { elapsedMs, maximumRssBytes },
	}
}

async function main(): Promise<void> {
	const relativePath = process.argv[2]
	if (relativePath === undefined || process.argv.length !== 3) throw new Error("Expected one source-relative path")
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	process.stdout.write(`${JSON.stringify(await evaluateScaleAwareNativeSource(projectRoot, relativePath))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
