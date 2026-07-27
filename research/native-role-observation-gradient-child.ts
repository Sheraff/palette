import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	loadAndExtractNativeRoleObservationGradientPaletteWithContext,
	NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
	NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
} from "./src/native-role-observation-gradient-extract.ts"

export const NATIVE_ROLE_OBSERVATION_GRADIENT_MAX_RSS_BYTES = 1_073_741_824

function resolveSource(projectRoot: string, relativePath: string): string {
	const parts = relativePath.split("/")
	if (parts.length !== 2 || parts[0] !== "images" || parts[1].length === 0 ||
		parts[1] === "." || parts[1] === ".." || basename(parts[1]) !== parts[1] || parts[1].includes("\\")) {
		throw new Error("Native-role observation-gradient child accepts only direct images/ sources")
	}
	return join(projectRoot, parts[0], parts[1])
}

export async function evaluateNativeRoleObservationGradientSource(projectRoot: string, relativePath: string) {
	const sourcePath = resolveSource(projectRoot, relativePath)
	const metadata = await lstat(sourcePath)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(sourcePath) !== sourcePath) {
		throw new Error("Native-role observation-gradient source must be a regular physical file")
	}
	const source = await readFile(sourcePath)
	const startedAt = performance.now()
	const context = await loadAndExtractNativeRoleObservationGradientPaletteWithContext(source)
	const elapsedMs = performance.now() - startedAt
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > NATIVE_ROLE_OBSERVATION_GRADIENT_MAX_RSS_BYTES) {
		throw new Error(`Native-role observation-gradient child RSS ${maximumRssBytes} exceeds ${NATIVE_ROLE_OBSERVATION_GRADIENT_MAX_RSS_BYTES}`)
	}
	return {
		schemaVersion: 1 as const,
		algorithmVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		policySha256: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
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
	process.stdout.write(`${JSON.stringify(await evaluateNativeRoleObservationGradientSource(projectRoot, relativePath))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
