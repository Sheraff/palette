import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	loadAndBuildNativeFieldHypothesisGraph,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
} from "./src/native-field-hypothesis-graph.ts"

export const NATIVE_FIELD_HYPOTHESIS_GRAPH_MAXIMUM_RSS_BYTES = 1_073_741_824

function resolveSource(projectRoot: string, relativePath: string): string {
	const parts = relativePath.split("/")
	if (parts.length !== 2 || parts[0] !== "images" || parts[1].length === 0 ||
		parts[1] === "." || parts[1] === ".." || basename(parts[1]) !== parts[1] || parts[1].includes("\\")) {
		throw new Error("Native field graph child accepts only direct images/ sources")
	}
	return join(projectRoot, parts[0], parts[1])
}

export async function evaluateNativeFieldHypothesisGraphSource(projectRoot: string, relativePath: string) {
	const path = resolveSource(projectRoot, relativePath)
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error("Native field graph source must be a regular physical file")
	}
	const source = await readFile(path)
	const startedAt = performance.now()
	const graph = await loadAndBuildNativeFieldHypothesisGraph(source)
	const elapsedMs = performance.now() - startedAt
	const maximumRssBytes = process.resourceUsage().maxRSS * 1024
	if (!Number.isSafeInteger(maximumRssBytes) || maximumRssBytes > NATIVE_FIELD_HYPOTHESIS_GRAPH_MAXIMUM_RSS_BYTES) {
		throw new Error(`Native field graph child RSS ${maximumRssBytes} exceeds ${NATIVE_FIELD_HYPOTHESIS_GRAPH_MAXIMUM_RSS_BYTES}`)
	}
	return {
		schemaVersion: 1 as const,
		version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		source: {
			relativePath,
			bytes: source.byteLength,
			sha256: createHash("sha256").update(source).digest("hex"),
		},
		graph,
		resource: { elapsedMs, maximumRssBytes },
	}
}

async function main(): Promise<void> {
	const relativePath = process.argv[2]
	if (relativePath === undefined || process.argv.length !== 3) throw new Error("Expected one source-relative path")
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	process.stdout.write(`${JSON.stringify(await evaluateNativeFieldHypothesisGraphSource(projectRoot, relativePath))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
