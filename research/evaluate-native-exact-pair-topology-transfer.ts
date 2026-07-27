import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { scoreGradientFieldTopologyEvidence } from "./src/gradient-field-topology-model.ts"
import {
	buildNativeFieldHypothesisGraphWithFamilyQueries,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	queryNativeFieldFamiliesAndTopology,
	type NativeFieldFamilyQuery,
	type NativeFieldHypothesisGraph,
	type NativeFieldTopologyQuery,
} from "./src/native-field-hypothesis-graph.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

export const NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_VERSION =
	"native-exact-pair-topology-transfer-0.1.0-development" as const
export const NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_DEVELOPMENT_PATH =
	"research/data/native-exact-pair-topology-transfer-development.json" as const
export const NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_ANALYSIS_PATH =
	"research/data/native-exact-pair-topology-transfer-analysis.json" as const

const registryPath = "research/data/experiments/gradient-field-topology-3.0.0-development.json"
const graphPath = "research/data/native-field-hypothesis-graph-development.json"
const planPath = "research/NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_PLAN.md"
const rawResultsPath =
	"research/data/experiments/region-graph-0.19.0-native-resolution-0.1.1-development/results.json"
const finalResultsPath =
	"research/data/experiments/region-graph-0.19.0-native-role-observation-gradient-0.3.0-development/results.json"
const rawFeedbackPath = "research/data/native-resolution-review-feedback.json"
const finalFeedbackPath = "research/data/native-role-observation-gradient-review-feedback.json"
const expectedRegistrySha256 = "2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983"
const expectedGraphSha256 = "990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281"
const expectedRootCounts = Object.freeze({
	"music-artworks": 151,
	images: 4,
	"00": 1,
	"01": 9,
	"02": 6,
	"03": 66,
	"04": 8,
	"05": 7,
	"06": 22,
} as const)
const expectedSourceIneligible = Object.freeze([
	{ sourceFile: "music-artworks/8/5/5/8558929f7738e6a0d8114dd4581edb06.jpg", width: 1500, height: 1500 },
	{ sourceFile: "music-artworks/8/8/2/882889b2e46b76b5113cbdbff0c84000.jpg", width: 3000, height: 3000 },
	{ sourceFile: "music-artworks/c/e/5/ce5d0da6d5fe216ddfb359bccfa8ef36.jpg", width: 2000, height: 2000 },
	{ sourceFile: "music-artworks/d/6/8/d688397df701fa08bcd9cee0c888c410.jpg", width: 3000, height: 3000 },
] as const)
const childTimeoutMs = 180_000
const concurrency = 2

type RegistryEntry = {
	reviewBatch: string
	familyId: string
	sourceFile: string
	sourceSha256: string
	judgment: "should-be-gradient" | "should-not-be-gradient" | string
	endpoints: { background: { rgb: RGB }; surface: { rgb: RGB } }
	evidence: Parameters<typeof scoreGradientFieldTopologyEvidence>[0]
}

type QueryChildResult = {
	schemaVersion: 1
	version: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION
	policySha256: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256
	source: { relativePath: string; bytes: number; sha256: string }
	resource: { elapsedMs: number; maximumRssBytes: number }
} & ({
	status: "queried"
	queries: NativeFieldFamilyQuery[]
	topologyQueries: NativeFieldTopologyQuery[]
} | {
	status: "source-ineligible"
	reason: "native-pixel-limit"
	metadata: { width: number; height: number; encodedPixels: number }
	queries: []
	topologyQueries: []
})

type GraphChildResult = {
	schemaVersion: 1
	version: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION
	policySha256: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256
	source: { relativePath: string; bytes: number; sha256: string }
	graph: NativeFieldHypothesisGraph
	resource: { elapsedMs: number; maximumRssBytes: number }
}

type TransferRow = ReturnType<typeof transferRow>

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
	}
	return JSON.stringify(value)
}

function hashObject(value: unknown): string {
	return sha256(canonicalJson(value))
}

function mean(values: readonly number[]): number | null {
	return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function sourceRoot(path: string): string {
	return path.split("/")[0]
}

function decisive(entry: RegistryEntry): boolean {
	return entry.judgment === "should-be-gradient" || entry.judgment === "should-not-be-gradient"
}

export function parseNativeExactPairTransferArguments(arguments_: readonly string[]) {
	if ((arguments_.length !== 2 && arguments_.length !== 3) || arguments_[0] !== "--limit" ||
		!/^[1-9][0-9]*$/.test(arguments_[1]) || arguments_.length === 3 && arguments_[2] !== "--write") {
		throw new Error("Usage: evaluate-native-exact-pair-topology-transfer.ts --limit <1..274> [--write]")
	}
	const limit = Number(arguments_[1])
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 274) throw new Error("--limit must be between 1 and 274")
	const write = arguments_[2] === "--write"
	if (write && limit !== 274) throw new Error("Writing requires the complete 274-source transfer audit")
	return { limit, write }
}

function inventory(entries: readonly RegistryEntry[]) {
	const rows = entries.filter(decisive)
	const roots: Record<string, number> = {}
	for (const row of rows) roots[sourceRoot(row.sourceFile)] = (roots[sourceRoot(row.sourceFile)] ?? 0) + 1
	const positive = rows.filter((row) => row.judgment === "should-be-gradient").length
	const negative = rows.filter((row) => row.judgment === "should-not-be-gradient").length
	const valid = rows.length === 274 && positive === 135 && negative === 139 &&
		new Set(rows.map((row) => row.sourceSha256)).size === 274 &&
		rows.every((row) => /^[0-9a-f]{64}$/.test(row.sourceSha256)) &&
		isDeepStrictEqual(roots, expectedRootCounts)
	if (!valid) throw new Error(`Frozen decisive registry inventory changed: ${JSON.stringify({ rows: rows.length, positive, negative, roots })}`)
	return { rows, positive, negative, roots }
}

async function spawnJson<T>(
	projectRoot: string,
	childPath: string,
	arguments_: readonly string[],
	maximumStdoutBytes: number,
): Promise<T> {
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, ...arguments_], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), childTimeoutMs)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > maximumStdoutBytes) child.kill("SIGKILL")
		})
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk
			if (stderr.length > 1024 * 1024) child.kill("SIGKILL")
		})
		child.on("error", rejectChild)
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			if (code !== 0) return rejectChild(new Error(
				`Audit child failed for ${arguments_[0]} (${code ?? signal}): ${stderr.trim()}`,
			))
			try {
				resolveChild(JSON.parse(stdout) as T)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

async function runQueryChild(projectRoot: string, entry: Pick<RegistryEntry,
	"sourceFile" | "sourceSha256" | "endpoints">): Promise<QueryChildResult> {
	const childPath = fileURLToPath(new URL("./native-exact-pair-topology-transfer-child.ts", import.meta.url))
	const pair = {
		backgroundRgb: entry.endpoints.background.rgb,
		surfaceRgb: entry.endpoints.surface.rgb,
	}
	const result = await spawnJson<QueryChildResult>(
		projectRoot,
		childPath,
		[entry.sourceFile, entry.sourceSha256, JSON.stringify(pair)],
		4 * 1024 * 1024,
	)
	if (result.schemaVersion !== 1 || result.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
		result.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256 ||
		result.source.relativePath !== entry.sourceFile || result.source.sha256 !== entry.sourceSha256 ||
		result.status === "queried" && (result.queries.length !== 2 || result.topologyQueries.length !== 1) ||
		result.status === "source-ineligible" &&
			(result.reason !== "native-pixel-limit" || result.queries.length !== 0 || result.topologyQueries.length !== 0)) {
		throw new Error(`Native exact-pair child identity is invalid: ${entry.sourceFile}`)
	}
	return result
}

async function runGraphChild(projectRoot: string, relativePath: string): Promise<GraphChildResult> {
	const childPath = fileURLToPath(new URL("./native-field-hypothesis-graph-child.ts", import.meta.url))
	const result = await spawnJson<GraphChildResult>(projectRoot, childPath, [relativePath], 32 * 1024 * 1024)
	if (result.schemaVersion !== 1 || result.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
		result.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256 ||
		result.source.relativePath !== relativePath || result.source.sha256 !== result.graph.source.sha256) {
		throw new Error(`Native graph reproduction child identity is invalid: ${relativePath}`)
	}
	return result
}

async function mapConcurrent<T, U>(
	values: readonly T[],
	worker: (value: T, index: number) => Promise<U>,
	describe: (value: T) => string,
): Promise<U[]> {
	const results = new Array<U>(values.length)
	let next = 0
	let completed = 0
	let stopped = false
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (true) {
			if (stopped) return
			const index = next++
			if (index >= values.length) return
			try {
				results[index] = await worker(values[index], index)
			} catch (error) {
				stopped = true
				throw error
			}
			completed++
			process.stderr.write(`[${completed}/${values.length}] ${describe(values[index])}\n`)
		}
	}))
	return results
}

function classifyDifferences(first: unknown, second: unknown) {
	const classes: Record<string, number> = {}
	const firstDifferences: Array<{ path: string; frozen: unknown; current: unknown }> = []
	let changedLeafCount = 0
	const visit = (frozen: any, current: any, path: string): void => {
		if (Object.is(frozen, current)) return
		if (typeof frozen !== typeof current || frozen === null || current === null || typeof frozen !== "object" ||
			Array.isArray(frozen) !== Array.isArray(current)) {
			changedLeafCount++
			const pathClass = path.replace(/\[\d+\]/g, "[*]")
			classes[pathClass] = (classes[pathClass] ?? 0) + 1
			if (firstDifferences.length < 16) firstDifferences.push({ path, frozen, current })
			return
		}
		const keys = [...new Set([...Object.keys(frozen), ...Object.keys(current)])].sort(compareAscii)
		for (const key of keys) visit(frozen[key], current[key],
			`${path}${Array.isArray(frozen) ? `[${key}]` : `.${key}`}`)
	}
	visit(first, second, "graph")
	return { changedLeafCount, classes, firstDifferences }
}

async function graphReproductionAudit(projectRoot: string, graphDevelopment: any) {
	const rows = await mapConcurrent(graphDevelopment.entries, async (entry: any) => {
		const current = await runGraphChild(projectRoot, entry.source.relativePath)
		if (current.source.sha256 !== entry.source.sha256) throw new Error(`Frozen graph source hash changed: ${entry.file}`)
		const equal = isDeepStrictEqual(entry.graph, current.graph)
		let deterministic = true
		let differences = null
		if (!equal) {
			differences = classifyDifferences(entry.graph, current.graph)
			const repeated = await runGraphChild(projectRoot, entry.source.relativePath)
			deterministic = isDeepStrictEqual(current.graph, repeated.graph)
		}
		return {
			file: entry.file,
			sourceSha256: entry.source.sha256,
			frozenGraphSha256: hashObject(entry.graph),
			currentGraphSha256: hashObject(current.graph),
			equal,
			deterministic,
			differences,
			resource: current.resource,
		}
	}, (entry: any) => `graph reproduction ${entry.source.relativePath}`)
	return {
		sourceCount: rows.length,
		mismatchCount: rows.filter((row) => !row.equal).length,
		deterministic: rows.every((row) => row.deterministic),
		rows,
	}
}

function transferRow(entry: RegistryEntry, child: QueryChildResult) {
	const registry = scoreGradientFieldTopologyEvidence(entry.evidence)
	const topology = child.status === "queried" ? child.topologyQueries[0] : {
		backgroundRgb: [...entry.endpoints.background.rgb] as RGB,
		surfaceRgb: [...entry.endpoints.surface.rgb] as RGB,
		status: "source-ineligible" as const,
		reason: child.reason,
		metadata: child.metadata,
	}
	return {
		familyId: entry.familyId,
		sourceFile: entry.sourceFile,
		sourceRoot: sourceRoot(entry.sourceFile),
		sourceSha256: entry.sourceSha256,
		reviewBatch: entry.reviewBatch,
		judgment: entry.judgment as "should-be-gradient" | "should-not-be-gradient",
		endpoints: entry.endpoints,
		familyQueries: child.queries,
		topology,
		registry: {
			score: registry.score,
			margin: registry.margin,
			eligible: registry.eligible,
		},
		...(topology.status === "mapped" ? {
			transfer: {
				scoreDelta224: topology.observation224.score - registry.score,
				decisionAgreement224: topology.observation224.eligible === registry.eligible,
			},
		} : { transfer: null }),
		resource: child.resource,
	}
}

function binaryMetrics(rows: readonly TransferRow[], score: (row: TransferRow) => number, decision: (row: TransferRow) => boolean) {
	if (rows.length === 0) return null
	const positives = rows.filter((row) => row.judgment === "should-be-gradient")
	const negatives = rows.filter((row) => row.judgment === "should-not-be-gradient")
	const positiveRecall = positives.length === 0 ? null :
		positives.filter((row) => decision(row)).length / positives.length
	const negativeRecall = negatives.length === 0 ? null :
		negatives.filter((row) => !decision(row)).length / negatives.length
	return {
		count: rows.length,
		accuracy: rows.filter((row) => decision(row) === (row.judgment === "should-be-gradient")).length / rows.length,
		balancedAccuracy: positiveRecall === null || negativeRecall === null ? null : (positiveRecall + negativeRecall) / 2,
		meanLogLoss: mean(rows.map((row) => {
			const probability = Math.max(1e-15, Math.min(1 - 1e-15, score(row)))
			return row.judgment === "should-be-gradient" ? -Math.log(probability) : -Math.log(1 - probability)
		}))!,
		positiveRecall,
		negativeRecall,
	}
}

function transferSummary(rows: readonly TransferRow[]) {
	const mapped = rows.filter((row) => row.topology.status === "mapped")
	const positives = rows.filter((row) => row.judgment === "should-be-gradient")
	const negatives = rows.filter((row) => row.judgment === "should-not-be-gradient")
	const mappedPositive = mapped.filter((row) => row.judgment === "should-be-gradient")
	const mappedNegative = mapped.filter((row) => row.judgment === "should-not-be-gradient")
	const native = binaryMetrics(
		mapped,
		(row) => row.topology.status === "mapped" ? row.topology.observation224.score : 0,
		(row) => row.topology.status === "mapped" && row.topology.observation224.eligible,
	)
	const registry = binaryMetrics(mapped, (row) => row.registry.score, (row) => row.registry.eligible)
	return {
		total: rows.length,
		mapped: mapped.length,
		statusCounts: Object.fromEntries(["mapped", "ambiguous", "unmappable", "indistinguishable", "source-ineligible"].map((status) => [
			status, rows.filter((row) => row.topology.status === status).length,
		])),
		coverage: rows.length === 0 ? null : mapped.length / rows.length,
		positiveCoverage: positives.length === 0 ? null : mappedPositive.length / positives.length,
		negativeCoverage: negatives.length === 0 ? null : mappedNegative.length / negatives.length,
		native,
		registryOnMappedSubset: registry,
		transferDelta: native && registry ? {
			accuracy: native.accuracy - registry.accuracy,
			meanLogLoss: native.meanLogLoss - registry.meanLogLoss,
			decisionAgreement: mean(mapped.map((row) => row.transfer!.decisionAgreement224 ? 1 : 0)),
			meanScoreDelta: mean(mapped.map((row) => row.transfer!.scoreDelta224)),
		} : null,
	}
}

function groupedSummaries(rows: readonly TransferRow[], key: (row: TransferRow) => string) {
	return Object.fromEntries([...new Set(rows.map(key))].sort(compareAscii).map((group) => [
		group,
		transferSummary(rows.filter((row) => key(row) === group)),
	]))
}

function queryEquivalenceFixture() {
	const width = 96
	const height = 64
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		data.set(x < width / 2 ? [18, 34, 74] : [226, 174, 92], (y * width + x) * 3)
	}
	const pair = { backgroundRgb: [18, 34, 74] as RGB, surfaceRgb: [226, 174, 92] as RGB }
	const complete = buildNativeFieldHypothesisGraphWithFamilyQueries(
		{ width, height, data: new Uint8Array(data) }, "0".repeat(64), [pair.backgroundRgb, pair.surfaceRgb], [pair],
	)
	const queryOnly = queryNativeFieldFamiliesAndTopology(
		{ width, height, data: new Uint8Array(data) }, "0".repeat(64), [pair.backgroundRgb, pair.surfaceRgb], [pair],
	)
	return isDeepStrictEqual(queryOnly, {
		queryPolicy: complete.queryPolicy,
		queries: complete.queries,
		topologyQueries: complete.topologyQueries,
	})
}

function corpusPalette(corpus: CorpusResult, file: string): Palette {
	const entry = corpus.entries.find((candidate) => candidate.file === file)
	if (!entry) throw new Error(`Corpus palette is missing: ${corpus.algorithmVersion}/${file}`)
	return entry.extraction.methods.spatial
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first.every((channel, index) => channel === second[index])
}

async function kraftyAudit(
	projectRoot: string,
	rawResultsSource: string,
	finalResultsSource: string,
	rawFeedbackSource: string,
	finalFeedbackSource: string,
) {
	const raw = corpusPalette(JSON.parse(rawResultsSource), "krafty.jpg")
	const final = corpusPalette(JSON.parse(finalResultsSource), "krafty.jpg")
	const rawFeedback = JSON.parse(rawFeedbackSource).entries.find((entry: any) => entry.image === "krafty.jpg")
	const finalFeedback = JSON.parse(finalFeedbackSource).entries.find((entry: any) => entry.image === "krafty.jpg")
	if (!rawFeedback?.reasons?.includes("unnecessary-gradient") || rawFeedback.ship !== "left" ||
		finalFeedback?.ship !== "both" || !raw.gradient.isGradient || final.gradient.isGradient ||
		!sameRgb(raw.background.rgb, final.background.rgb) || !sameRgb(raw.surface.rgb, final.surface.rgb)) {
		throw new Error("Structured Krafty exact-pair evidence changed")
	}
	const child = await runQueryChild(projectRoot, {
		sourceFile: "images/krafty.jpg",
		sourceSha256: rawFeedback.sourceSha256,
		endpoints: { background: { rgb: raw.background.rgb }, surface: { rgb: raw.surface.rgb } },
	})
	if (child.status !== "queried") throw new Error("Structured Krafty source is ineligible for native topology")
	return {
		sourceSha256: rawFeedback.sourceSha256,
		rawEvidenceId: rawFeedback.id,
		finalEvidenceId: finalFeedback.id,
		rawStructuredReason: "unnecessary-gradient",
		exactEndpointsPreserved: true,
		topology: child.topologyQueries[0],
		resource: child.resource,
	}
}

async function inputHashes(projectRoot: string) {
	const paths = [
		registryPath,
		graphPath,
		planPath,
		rawResultsPath,
		finalResultsPath,
		rawFeedbackPath,
		finalFeedbackPath,
		"research/src/native-field-hypothesis-graph.ts",
		"research/src/gradient-field-topology-model.ts",
		"research/native-exact-pair-topology-transfer-child.ts",
	]
	return Object.fromEntries(await Promise.all(paths.sort(compareAscii).map(async (path) => [
		path, sha256(await readFile(resolve(projectRoot, path))),
	])))
}

export async function evaluateNativeExactPairTopologyTransfer(
	limit = 274,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 274) throw new Error("Audit limit must be between 1 and 274")
	const [registrySource, graphSource, rawResultsSource, finalResultsSource, rawFeedbackSource, finalFeedbackSource, hashes] =
		await Promise.all([
			readFile(resolve(projectRoot, registryPath), "utf8"),
			readFile(resolve(projectRoot, graphPath)),
			readFile(resolve(projectRoot, rawResultsPath), "utf8"),
			readFile(resolve(projectRoot, finalResultsPath), "utf8"),
			readFile(resolve(projectRoot, rawFeedbackPath), "utf8"),
			readFile(resolve(projectRoot, finalFeedbackPath), "utf8"),
			inputHashes(projectRoot),
		])
	if (sha256(registrySource) !== expectedRegistrySha256) throw new Error("Frozen gradient registry changed")
	if (sha256(graphSource) !== expectedGraphSha256) throw new Error("Frozen native field graph changed")
	const registry = JSON.parse(registrySource) as { entries: RegistryEntry[] }
	const frozenInventory = inventory(registry.entries)
	const selected = [...frozenInventory.rows].sort((first, second) =>
		compareAscii(first.sourceFile, second.sourceFile) || compareAscii(first.familyId, second.familyId)).slice(0, limit)
	const graphDevelopment = JSON.parse(graphSource.toString("utf8"))
	const reproduction = await graphReproductionAudit(projectRoot, graphDevelopment)
	const children = await mapConcurrent(selected, (entry) => runQueryChild(projectRoot, entry),
		(entry) => `exact-pair transfer ${entry.sourceFile}`)
	const rows = selected.map((entry, index) => transferRow(entry, children[index]))
	const overall = transferSummary(rows)
	const krafty = await kraftyAudit(projectRoot, rawResultsSource, finalResultsSource, rawFeedbackSource, finalFeedbackSource)
	const fixtureEquivalent = queryEquivalenceFixture()
	const complete = limit === 274
	const sourceIneligible = rows.filter((row) => row.topology.status === "source-ineligible").map((row) => ({
		sourceFile: row.sourceFile,
		width: row.topology.status === "source-ineligible" ? row.topology.metadata.width : 0,
		height: row.topology.status === "source-ineligible" ? row.topology.metadata.height : 0,
	})).sort((first, second) => compareAscii(first.sourceFile, second.sourceFile))
	const gates = {
		completeFrozenInventory: complete && rows.length === 274 && new Set(rows.map((row) => row.sourceSha256)).size === 274,
		sourceEligibilityInventory: complete && isDeepStrictEqual(sourceIneligible, expectedSourceIneligible),
		completeTerminalCoverage: complete && rows.every((row) =>
			["mapped", "ambiguous", "unmappable", "indistinguishable", "source-ineligible"].includes(row.topology.status)),
		queryOnlyEqualsCompleteGraph: fixtureEquivalent,
		deterministicGraphReconstruction: reproduction.sourceCount === 37 && reproduction.deterministic,
		mappedCoverage: (overall.coverage ?? 0) >= 0.8,
		positiveMappedCoverage: (overall.positiveCoverage ?? 0) >= 0.75,
		negativeMappedCoverage: (overall.negativeCoverage ?? 0) >= 0.75,
		mappedAccuracy: (overall.native?.accuracy ?? 0) >= 0.8,
		mappedBalancedAccuracy: (overall.native?.balancedAccuracy ?? 0) >= 0.75,
		mappedLogLoss: (overall.native?.meanLogLoss ?? Infinity) < Math.log(2),
		mappedPositiveRecall: (overall.native?.positiveRecall ?? 0) >= 0.8,
		mappedNegativeRecall: (overall.native?.negativeRecall ?? 0) >= 0.7,
		accuracyTransfer: (overall.transferDelta?.accuracy ?? -Infinity) >= -0.05,
		logLossTransfer: (overall.transferDelta?.meanLogLoss ?? Infinity) <= 0.1,
		kraftyRegressionPrevented: krafty.topology.status === "mapped" &&
			krafty.topology.observation224?.eligible === false,
		noFittingOrCommentTargets: true,
	}
	const passed = Object.values(gates).every(Boolean)
	const policy = {
		version: NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_VERSION,
		registrySha256: expectedRegistrySha256,
		frozenGraphSha256: expectedGraphSha256,
		nativeGraphPolicySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		decisionProfile: "max-edge-224-area-srgb",
		concurrency,
		fitting: "forbidden",
		commentsUsedAsLabels: false,
		paletteOutput: "forbidden",
		humanReview: "forbidden",
		reserveRoots: "forbidden",
	}
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_VERSION,
		policy,
		policySha256: hashObject(policy),
		scientificIdentitySha256: hashObject({ policy, inputs: hashes }),
		inputs: hashes,
		execution: {
			sourceLimit: limit,
			fullSourceCount: 274,
			complete,
			concurrency,
			maximumRssBytes: Math.max(
				...children.map((child) => child.resource.maximumRssBytes),
				...reproduction.rows.map((row) => row.resource.maximumRssBytes),
				krafty.resource.maximumRssBytes,
			),
			maximumElapsedMs: Math.max(
				...children.map((child) => child.resource.elapsedMs),
				...reproduction.rows.map((row) => row.resource.elapsedMs),
				krafty.resource.elapsedMs,
			),
		},
		inventory: {
			decisiveRows: 274,
			positive: frozenInventory.positive,
			negative: frozenInventory.negative,
			roots: frozenInventory.roots,
			sourceIneligible,
		},
		reproducibility: reproduction,
		rows,
		summary: {
			overall,
			byLabel: groupedSummaries(rows, (row) => row.judgment),
			bySourceRoot: groupedSummaries(rows, (row) => row.sourceRoot),
			byReviewBatch: groupedSummaries(rows, (row) => row.reviewBatch),
		},
		krafty,
		gates,
		decision: {
			status: !complete ? "limited" : passed ? "pass" : "withhold",
			nativeExactPairTopologyTransfer: complete && passed,
			futureStructuredFieldStatePlanAuthorized: complete && passed,
			completeTuplePlanAuthorized: false,
			paletteOutputAuthorized: false,
			humanReviewAuthorized: false,
			reserveRootsAuthorized: false,
		},
	}
}

async function main() {
	const { limit, write } = parseNativeExactPairTransferArguments(process.argv.slice(2))
	const projectRoot = fileURLToPath(new URL("..", import.meta.url))
	const development = await evaluateNativeExactPairTopologyTransfer(limit, projectRoot)
	if (!write) {
		process.stdout.write(`${JSON.stringify({
			execution: development.execution,
			reproducibility: {
				sourceCount: development.reproducibility.sourceCount,
				mismatchCount: development.reproducibility.mismatchCount,
				deterministic: development.reproducibility.deterministic,
				mismatches: development.reproducibility.rows.filter((row) => !row.equal),
			},
			summary: development.summary,
			krafty: development.krafty,
			gates: development.gates,
			decision: development.decision,
		}, null, 2)}\n`)
		return
	}
	const developmentSource = `${JSON.stringify(development, null, 2)}\n`
	await writeFile(resolve(projectRoot, NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_DEVELOPMENT_PATH), developmentSource)
	const analysis = {
		schemaVersion: 1,
		experimentId: development.experimentId,
		policySha256: development.policySha256,
		scientificIdentitySha256: development.scientificIdentitySha256,
		developmentSha256: sha256(developmentSource),
		inventory: development.inventory,
		execution: development.execution,
		reproducibility: {
			sourceCount: development.reproducibility.sourceCount,
			mismatchCount: development.reproducibility.mismatchCount,
			deterministic: development.reproducibility.deterministic,
			mismatches: development.reproducibility.rows.filter((row) => !row.equal),
		},
		summary: development.summary,
		krafty: development.krafty,
		gates: development.gates,
		decision: development.decision,
		conclusion: development.decision.nativeExactPairTopologyTransfer
			? "Native exact-pair topology transfer passed; only a future structured field-state plan is authorized."
			: "Native exact-pair topology transfer is withheld; do not use it as field-state authority.",
	}
	await writeFile(resolve(projectRoot, NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_ANALYSIS_PATH), `${JSON.stringify(analysis, null, 2)}\n`)
	process.stdout.write(`${NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_DEVELOPMENT_PATH}\n${NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_ANALYSIS_PATH}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
