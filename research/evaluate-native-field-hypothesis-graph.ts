import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { harmonicConjunction } from "./src/field-relation.ts"
import { nameRGB } from "./src/color-name.ts"
import {
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	type NativeFieldHypothesis,
	type NativeFieldHypothesisGraph,
} from "./src/native-field-hypothesis-graph.ts"
import type { CorpusResult } from "./src/types.ts"

export const NATIVE_FIELD_HYPOTHESIS_GRAPH_CANONICAL_ROSTER_SHA256 =
	"546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const NATIVE_FIELD_HYPOTHESIS_GRAPH_CHILD_TIMEOUT_MS = 120_000
export const NATIVE_FIELD_HYPOTHESIS_GRAPH_DEVELOPMENT_PATH =
	"research/data/native-field-hypothesis-graph-development.json" as const

const diagnosticFiles = new Set([
	"maroon5-original.jpg",
	"once.jpg",
	"knuckles.jpg",
	"birdsofprey.jpg",
	"krafty.jpg",
])

type ChildResult = {
	schemaVersion: 1
	version: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION
	policySha256: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256
	source: { relativePath: string; bytes: number; sha256: string }
	graph: NativeFieldHypothesisGraph
	resource: { elapsedMs: number; maximumRssBytes: number }
}

export function parseNativeFieldHypothesisGraphArguments(arguments_: readonly string[]) {
	if ((arguments_.length !== 2 && arguments_.length !== 3) || arguments_[0] !== "--limit" ||
		!/^[1-9][0-9]*$/.test(arguments_[1]) || arguments_.length === 3 && arguments_[2] !== "--write") {
		throw new Error("Usage: evaluate-native-field-hypothesis-graph.ts --limit <1..37> [--write]")
	}
	const limit = Number(arguments_[1])
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new Error("--limit must be between 1 and 37")
	const write = arguments_[2] === "--write"
	if (write && limit !== 37) throw new Error("Writing requires the complete 37-source development corpus")
	return { limit, write }
}

async function runChild(projectRoot: string, relativePath: string): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./native-field-hypothesis-graph-child.ts", import.meta.url))
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, relativePath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), NATIVE_FIELD_HYPOTHESIS_GRAPH_CHILD_TIMEOUT_MS)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > 32 * 1024 * 1024) child.kill("SIGKILL")
		})
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk
			if (stderr.length > 1024 * 1024) child.kill("SIGKILL")
		})
		child.on("error", (error) => {
			clearTimeout(timer)
			rejectChild(error)
		})
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			if (code !== 0) {
				rejectChild(new Error(`Native field graph child failed (${code ?? signal ?? "unknown"}): ${stderr.trim()}`))
				return
			}
			try {
				const parsed = JSON.parse(stdout) as ChildResult
				if (parsed.schemaVersion !== 1 || parsed.version !== NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION ||
					parsed.policySha256 !== NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256 ||
					parsed.source.relativePath !== relativePath || parsed.source.sha256 !== parsed.graph.source.sha256) {
					throw new Error("Native field graph child identity is invalid")
				}
				resolveChild(parsed)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

function diagnosticSupport(hypothesis: NativeFieldHypothesis): number {
	if (hypothesis.state === "collapsed") return hypothesis.oneFieldFit.mean
	return harmonicConjunction([
		hypothesis.stateSupport.mean,
		hypothesis.twoFieldFit!.mean,
		hypothesis.incrementalSurfaceIdentity!.mean,
	])
}

function presentHypothesis(graph: NativeFieldHypothesisGraph, hypothesis: NativeFieldHypothesis) {
	const families = new Map(graph.families.map((family) => [family.stableKey, family]))
	const presentFamily = (stableKey: string | null) => {
		if (stableKey === null) return null
		const family = families.get(stableKey)!
		const representative = family.representatives.find((entry) => entry.stableKey === family.centerRepresentativeKey)!
		return {
			stableKey,
			hex: representative.hex,
			nearestName: nameRGB(representative.rgb).nearestName,
			population: family.population,
		}
	}
	return {
		stableKey: hypothesis.stableKey,
		state: hypothesis.state,
		diagnosticSupport: diagnosticSupport(hypothesis),
		stateSupport: hypothesis.stateSupport,
		oneFieldFit: hypothesis.oneFieldFit,
		twoFieldFit: hypothesis.twoFieldFit,
		incrementalSurfaceIdentity: hypothesis.incrementalSurfaceIdentity,
		background: presentFamily(hypothesis.backgroundFamilyStableKey),
		surface: presentFamily(hypothesis.surfaceFamilyStableKey),
		overlayComplements: hypothesis.overlayComplements.map((entry) => ({
			hex: entry.hex,
			nearestName: nameRGB(graph.families.flatMap((family) => family.representatives)
				.find((representative) => representative.stableKey === entry.representativeKey)!.rgb).nearestName,
			support: entry.support,
		})),
	}
}

function diagnostics(graph: NativeFieldHypothesisGraph) {
	const byState = (state: NativeFieldHypothesis["state"]) => [...graph.hypotheses]
		.filter((hypothesis) => hypothesis.state === state)
		.sort((first, second) => diagnosticSupport(second) - diagnosticSupport(first) ||
			first.stableKey.localeCompare(second.stableKey, "en"))
		.slice(0, 5)
		.map((hypothesis) => presentHypothesis(graph, hypothesis))
	return {
		topCollapsed: byState("collapsed"),
		topDistinctFlat: byState("distinct-flat"),
		topGradient: byState("gradient"),
		scaleDisagreements: graph.relations.filter((relation) => relation.scale.stateAgreement < 1).length,
		connectedOverlayFamilies: graph.certificate.counts.connectedOverlayFamilies,
	}
}

function distribution(values: readonly number[]) {
	if (values.length === 0) return { minimum: 0, maximum: 0, mean: 0 }
	return {
		minimum: Math.min(...values),
		maximum: Math.max(...values),
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
	}
}

export async function evaluateNativeFieldHypothesisGraphDevelopment(
	limit: number,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new Error("Development limit must be between 1 and 37")
	const rosterSource = await readFile(resolve(projectRoot, "research/data/results.json"))
	if (createHash("sha256").update(rosterSource).digest("hex") !== NATIVE_FIELD_HYPOTHESIS_GRAPH_CANONICAL_ROSTER_SHA256) {
		throw new Error("Frozen development source roster changed")
	}
	const roster = JSON.parse(rosterSource.toString("utf8")) as CorpusResult
	if (roster.entries.length !== 37) throw new Error("Development source roster is incomplete")
	const entries = []
	for (const [sourceIndex, sourceEntry] of roster.entries.slice(0, limit).entries()) {
		const child = await runChild(projectRoot, `images/${sourceEntry.file}`)
		entries.push({
			sourceIndex,
			file: sourceEntry.file,
			kind: sourceEntry.kind,
			review: sourceEntry.review,
			source: child.source,
			graph: child.graph,
			resource: child.resource,
			...(diagnosticFiles.has(sourceEntry.file) ? { diagnostics: diagnostics(child.graph) } : {}),
		})
		process.stderr.write(`[${sourceIndex + 1}/${limit}] ${sourceEntry.file}\n`)
	}
	const allRelations = entries.flatMap((entry) => entry.graph.relations)
	const allFamilies = entries.flatMap((entry) => entry.graph.families)
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policy: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		execution: { sourceCount: entries.length, fullDevelopmentSourceCount: 37, limited: entries.length !== 37 },
		summary: {
			primaryFieldFamilies: distribution(entries.map((entry) => entry.graph.certificate.counts.primaryFieldFamilies)),
			connectedOverlayFamilies: distribution(entries.map((entry) => entry.graph.certificate.counts.connectedOverlayFamilies)),
			representatives: distribution(entries.map((entry) => entry.graph.certificate.counts.representatives)),
			relations: distribution(entries.map((entry) => entry.graph.certificate.counts.orderedRelations)),
			hypotheses: distribution(entries.map((entry) => entry.graph.certificate.counts.totalHypotheses)),
			representativeBoundReachedFamilies: allFamilies.filter((family) => family.representatives.length === 8).length,
			scaleDisagreementRelations: allRelations.filter((relation) => relation.scale.stateAgreement < 1).length,
			scaleUnanimousRelations: allRelations.filter((relation) => relation.scale.stateAgreement === 1).length,
			distinctFlatMeanSupport: distribution(allRelations.map((relation) => relation.scale.distinctFlatSupport.mean)),
			gradientMeanSupport: distribution(allRelations.map((relation) => relation.scale.gradientSupport.mean)),
			twoFieldMeanFit: distribution(allRelations.map((relation) => relation.scale.twoFieldFit.mean)),
			incrementalSurfaceIdentity: distribution(allRelations.map((relation) =>
				relation.scale.incrementalSurfaceIdentity.mean)),
			maximumRssBytes: Math.max(...entries.map((entry) => entry.resource.maximumRssBytes)),
			maximumElapsedMs: Math.max(...entries.map((entry) => entry.resource.elapsedMs)),
		},
		entries,
	}
}

async function main(): Promise<void> {
	const { limit, write } = parseNativeFieldHypothesisGraphArguments(process.argv.slice(2))
	const projectRoot = fileURLToPath(new URL("..", import.meta.url))
	const result = await evaluateNativeFieldHypothesisGraphDevelopment(limit, projectRoot)
	if (write) {
		await writeFile(resolve(projectRoot, NATIVE_FIELD_HYPOTHESIS_GRAPH_DEVELOPMENT_PATH),
			`${JSON.stringify(result, null, 2)}\n`)
		process.stdout.write(`${NATIVE_FIELD_HYPOTHESIS_GRAPH_DEVELOPMENT_PATH}\n`)
		return
	}
	process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
