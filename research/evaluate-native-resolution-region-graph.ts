import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ScriptKind,
	ScriptTarget,
	createSourceFile,
	isExportDeclaration,
	isImportDeclaration,
	isStringLiteralLike,
} from "typescript"
import {
	NATIVE_RESOLUTION_ALGORITHM_VERSION,
	NATIVE_RESOLUTION_POLICY,
	NATIVE_RESOLUTION_POLICY_SHA256,
} from "./src/native-resolution-extract.ts"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import type { CorpusResult, ExtractionResult, Palette, RoleName } from "./src/types.ts"

export const NATIVE_RESOLUTION_EXPERIMENT_ID = "region-graph-0.19.0-native-resolution-0.1.1-development" as const
export const NATIVE_RESOLUTION_BASELINE_ALGORITHM_VERSION = "region-graph-0.19.0" as const
export const NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256 = "546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const NATIVE_RESOLUTION_CHILD_TIMEOUT_MS = 120_000
export const NATIVE_RESOLUTION_MATERIAL_OKLAB_DISTANCE = 0.025
export const NATIVE_RESOLUTION_REVIEW_ID = "native-resolution-spatial-pair-review-v2" as const
export const NATIVE_RESOLUTION_REVIEW_PRESENTATION_VERSION = 1 as const
export const NATIVE_RESOLUTION_ARTIFACT_FILES = [
	"comparison.json",
	"manifest.json",
	"protocol.json",
	"results.json",
	"review-manifest.json",
] as const

const roleNames: readonly RoleName[] = ["background", "foreground", "surface", "accent"]
const methodNames = ["spatial", "expressive", "quantized"] as const

type ChildResult = {
	schemaVersion: 1
	algorithmVersion: typeof NATIVE_RESOLUTION_ALGORITHM_VERSION
	source: { relativePath: string; bytes: number; sha256: string }
	extraction: ExtractionResult
	resolution: {
		policy: typeof NATIVE_RESOLUTION_POLICY
		policySha256: typeof NATIVE_RESOLUTION_POLICY_SHA256
		nativeImageSha256: string
	}
	resource: { elapsedMs: number; maximumRssBytes: number }
}

function roleSummary(palette: Palette) {
	return Object.fromEntries(roleNames.map((role) => [role, {
		hex: palette[role].hex,
		generated: palette[role].generated,
	}])) as Record<RoleName, { hex: string; generated: boolean }>
}

function candidateMultiset(extraction: ExtractionResult): Map<string, number> {
	const counts = new Map<string, number>()
	for (const candidate of extraction.candidates) {
		const key = `${candidate.rgb.join(",")}|${candidate.hex.toLowerCase()}`
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	return counts
}

function multisetDifference(first: Map<string, number>, second: Map<string, number>): string[] {
	const difference: string[] = []
	for (const [key, count] of first) {
		for (let index = second.get(key) ?? 0; index < count; index++) difference.push(key)
	}
	return difference.sort()
}

function candidateKey(extraction: ExtractionResult, index: number): string {
	const candidate = extraction.candidates[index]
	return `${candidate.rgb.join(",")}|${candidate.hex.toLowerCase()}`
}

function materialCandidateDifference(baseline: ExtractionResult, treatment: ExtractionResult) {
	const baselineLabs = baseline.candidates.map((candidate) => rgbToOKLab(candidate.rgb))
	const treatmentLabs = treatment.candidates.map((candidate) => rgbToOKLab(candidate.rgb))
	const adjacency = baselineLabs.map((lab) => treatmentLabs
		.map((other, index) => ({ index, distance: okDistance(lab, other) }))
		.filter(({ distance }) => distance <= NATIVE_RESOLUTION_MATERIAL_OKLAB_DISTANCE)
		.sort((first, second) => first.distance - second.distance || first.index - second.index)
		.map(({ index }) => index))
	const treatmentMatches = new Int16Array(treatment.candidates.length).fill(-1)

	function augment(baselineIndex: number, seen: Uint8Array): boolean {
		for (const treatmentIndex of adjacency[baselineIndex]) {
			if (seen[treatmentIndex] === 1) continue
			seen[treatmentIndex] = 1
			const previousBaselineIndex = treatmentMatches[treatmentIndex]
			if (previousBaselineIndex === -1 || augment(previousBaselineIndex, seen)) {
				treatmentMatches[treatmentIndex] = baselineIndex
				return true
			}
		}
		return false
	}

	for (let baselineIndex = 0; baselineIndex < baseline.candidates.length; baselineIndex++) {
		augment(baselineIndex, new Uint8Array(treatment.candidates.length))
	}
	const matchedBaseline = new Set(treatmentMatches.filter((index) => index >= 0))
	return {
		materiallyRemovedCandidates: baseline.candidates
			.map((_, index) => index)
			.filter((index) => !matchedBaseline.has(index))
			.map((index) => candidateKey(baseline, index))
			.sort(),
		materiallyAddedCandidates: treatment.candidates
			.map((_, index) => index)
			.filter((index) => treatmentMatches[index] === -1)
			.map((index) => candidateKey(treatment, index))
			.sort(),
	}
}

export function compareNativeResolutionExtractions(baseline: ExtractionResult, treatment: ExtractionResult) {
	const changedRoles: string[] = []
	const materiallyChangedRoles: string[] = []
	const changedGradients: string[] = []
	for (const method of methodNames) {
		for (const role of roleNames) {
			const first = baseline.methods[method][role]
			const second = treatment.methods[method][role]
			if (first.hex !== second.hex || first.generated !== second.generated) changedRoles.push(`${method}.${role}`)
			if (first.generated !== second.generated ||
				okDistance(rgbToOKLab(first.rgb), rgbToOKLab(second.rgb)) > NATIVE_RESOLUTION_MATERIAL_OKLAB_DISTANCE) {
				materiallyChangedRoles.push(`${method}.${role}`)
			}
		}
		if (baseline.methods[method].gradient.isGradient !== treatment.methods[method].gradient.isGradient) {
			changedGradients.push(method)
		}
	}
	const baselineCandidates = candidateMultiset(baseline)
	const treatmentCandidates = candidateMultiset(treatment)
	const materialCandidateChanges = materialCandidateDifference(baseline, treatment)
	return {
		visibleChanged: changedRoles.length > 0 || changedGradients.length > 0,
		materiallyChanged: materiallyChangedRoles.length > 0 || changedGradients.length > 0,
		semanticChanged: JSON.stringify(baseline.methods) !== JSON.stringify(treatment.methods),
		changedRoles,
		materiallyChangedRoles,
		changedGradients,
		removedCandidates: multisetDifference(baselineCandidates, treatmentCandidates),
		addedCandidates: multisetDifference(treatmentCandidates, baselineCandidates),
		...materialCandidateChanges,
		baselineSpatial: roleSummary(baseline.methods.spatial),
		treatmentSpatial: roleSummary(treatment.methods.spatial),
	}
}

export function parseNativeResolutionArguments(arguments_: readonly string[]) {
	if ((arguments_.length !== 2 && arguments_.length !== 3) || arguments_[0] !== "--limit" ||
		!/^[1-9][0-9]*$/.test(arguments_[1]) ||
		(arguments_.length === 3 && arguments_[2] !== "--summary" && arguments_[2] !== "--publish")) {
		throw new Error("Usage: evaluate-native-resolution-region-graph.ts --limit <1..37> [--summary|--publish]")
	}
	const limit = Number(arguments_[1])
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new Error("--limit must be between 1 and 37")
	const publish = arguments_[2] === "--publish"
	if (publish && limit !== 37) throw new Error("Publication requires the complete 37-source development cohort")
	return { limit, summaryOnly: arguments_[2] === "--summary", publish }
}

async function runChild(projectRoot: string, relativePath: string): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./native-resolution-extraction-child.ts", import.meta.url))
	return await new Promise<ChildResult>((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, relativePath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), NATIVE_RESOLUTION_CHILD_TIMEOUT_MS)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > 4 * 1024 * 1024) child.kill("SIGKILL")
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
				rejectChild(new Error(`Native child failed (${code ?? signal ?? "unknown"}): ${stderr.trim()}`))
				return
			}
			try {
				const parsed = JSON.parse(stdout) as ChildResult
				if (parsed.schemaVersion !== 1 || parsed.algorithmVersion !== NATIVE_RESOLUTION_ALGORITHM_VERSION ||
					parsed.source.relativePath !== relativePath || parsed.resolution.policySha256 !== NATIVE_RESOLUTION_POLICY_SHA256) {
					throw new Error("Native child result identity is invalid")
				}
				resolveChild(parsed)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

export async function evaluateNativeResolutionDevelopment(limit: number, projectRoot = fileURLToPath(new URL("..", import.meta.url))) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new RangeError("Development limit must be between 1 and 37")
	const baselineBytes = await readFile(resolve(projectRoot, "research/data/results.json"))
	const baselineSha256 = createHash("sha256").update(baselineBytes).digest("hex")
	if (baselineSha256 !== NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256) throw new Error("Frozen 0.19 baseline results hash changed")
	const baseline = JSON.parse(baselineBytes.toString("utf8")) as CorpusResult
	if (baseline.algorithmVersion !== NATIVE_RESOLUTION_BASELINE_ALGORITHM_VERSION || baseline.entries.length !== 37) {
		throw new Error("Frozen 0.19 development corpus identity is invalid")
	}
	const entries = []
	for (const [sourceIndex, entry] of baseline.entries.slice(0, limit).entries()) {
		const child = await runChild(projectRoot, `images/${entry.file}`)
		const comparison = compareNativeResolutionExtractions(entry.extraction, child.extraction)
		entries.push({
			sourceIndex,
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			source: child.source,
			baseline: {
				width: entry.extraction.width,
				height: entry.extraction.height,
				regionCount: entry.extraction.diagnostics.regionCount,
				candidateCount: entry.extraction.diagnostics.candidateCount,
			},
			treatment: {
				width: child.extraction.width,
				height: child.extraction.height,
				regionCount: child.extraction.diagnostics.regionCount,
				candidateCount: child.extraction.diagnostics.candidateCount,
				nativeImageSha256: child.resolution.nativeImageSha256,
				extraction: child.extraction,
			},
			comparison,
			resource: child.resource,
		})
		process.stderr.write(`[${sourceIndex + 1}/${limit}] ${entry.file}\n`)
	}
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_RESOLUTION_EXPERIMENT_ID,
		baseline: {
			algorithmVersion: NATIVE_RESOLUTION_BASELINE_ALGORITHM_VERSION,
			resultsSha256: NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256,
		},
		treatment: {
			algorithmVersion: NATIVE_RESOLUTION_ALGORITHM_VERSION,
			policy: NATIVE_RESOLUTION_POLICY,
			policySha256: NATIVE_RESOLUTION_POLICY_SHA256,
		},
		execution: { sourceCount: entries.length, fullDevelopmentSourceCount: 37, limited: entries.length !== 37 },
		summary: {
			visibleChangedSources: entries.filter(({ comparison }) => comparison.visibleChanged).length,
			materiallyChangedSources: entries.filter(({ comparison }) => comparison.materiallyChanged).length,
			semanticChangedSources: entries.filter(({ comparison }) => comparison.semanticChanged).length,
			totalAddedCandidates: entries.reduce((sum, { comparison }) => sum + comparison.addedCandidates.length, 0),
			totalRemovedCandidates: entries.reduce((sum, { comparison }) => sum + comparison.removedCandidates.length, 0),
			totalMateriallyAddedCandidates: entries.reduce((sum, { comparison }) => sum + comparison.materiallyAddedCandidates.length, 0),
			totalMateriallyRemovedCandidates: entries.reduce((sum, { comparison }) => sum + comparison.materiallyRemovedCandidates.length, 0),
			maximumRssBytes: Math.max(...entries.map(({ resource }) => resource.maximumRssBytes)),
			maximumElapsedMs: Math.max(...entries.map(({ resource }) => resource.elapsedMs)),
		},
		entries,
	}
}

type NativeResolutionDevelopmentResult = Awaited<ReturnType<typeof evaluateNativeResolutionDevelopment>>

const nativeResolutionPlanPath = "research/NATIVE_RESOLUTION_REGION_GRAPH_PLAN.md"
const nativeResolutionImplementationRoots = [
	"research/evaluate-native-resolution-region-graph.ts",
	"research/native-resolution-extraction-child.ts",
	"research/serve-native-resolution-review.ts",
] as const
const nativeResolutionImplementationExtras = [
	"package.json",
	"pnpm-lock.yaml",
	nativeResolutionPlanPath,
	"research/review/app.js",
	"research/review/index.html",
	"research/review/styles.css",
	"research/tests/native-resolution-artifact.test.ts",
	"research/tests/native-resolution-extract.test.ts",
	"research/tests/native-resolution-region-graph.test.ts",
] as const

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function prettyJson(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`
}

function semanticExtraction(extraction: ExtractionResult) {
	return {
		...extraction,
		diagnostics: {
			regionCount: extraction.diagnostics.regionCount,
			candidateCount: extraction.diagnostics.candidateCount,
		},
	}
}

function buildNativeResolutionProtocol(planSha256: string, implementationSha256: string) {
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_RESOLUTION_EXPERIMENT_ID,
		plan: { path: nativeResolutionPlanPath, sha256: planSha256 },
		baseline: {
			algorithmVersion: NATIVE_RESOLUTION_BASELINE_ALGORITHM_VERSION,
			path: "research/data/results.json",
			sha256: NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256,
			sourceCount: 37,
		},
		treatment: {
			algorithmVersion: NATIVE_RESOLUTION_ALGORITHM_VERSION,
			policy: NATIVE_RESOLUTION_POLICY,
			policySha256: NATIVE_RESOLUTION_POLICY_SHA256,
		},
		execution: {
			sourceCount: 37,
			childTimeoutMs: NATIVE_RESOLUTION_CHILD_TIMEOUT_MS,
			childMaximumRssBytes: 1_073_741_824,
		},
		difference: {
			materialOklabDistance: NATIVE_RESOLUTION_MATERIAL_OKLAB_DISTANCE,
			roleRule: "generated-status-differs-or-oklab-distance-greater-than-threshold",
			candidateRule: "deterministic-maximum-cardinality-one-to-one-threshold-matching",
			gradientRule: "isGradient-boolean-differs",
		},
		review: {
			identity: NATIVE_RESOLUTION_REVIEW_ID,
			presentationVersion: NATIVE_RESOLUTION_REVIEW_PRESENTATION_VERSION,
			method: "spatial",
			eligibility: "baseline-review-true-and-material-spatial-role-or-gradient-change",
		},
		implementation: {
			version: "native-resolution-static-import-closure-v1",
			method: "recursive-local-static-import-closure-plus-declared-extras",
			sha256: implementationSha256,
		},
	}
}

async function buildNativeResolutionImplementationClosure(projectRoot: string) {
	const pending: string[] = [...nativeResolutionImplementationRoots]
	const runtimeFiles = new Map<string, string>()
	while (pending.length > 0) {
		const path = pending.pop()!
		if (runtimeFiles.has(path)) continue
		const absolutePath = resolve(projectRoot, ...path.split("/"))
		const projectRelativePath = relative(projectRoot, absolutePath)
		if (projectRelativePath === ".." || projectRelativePath.startsWith(`..${sep}`)) {
			throw new Error(`Implementation path escapes the project root: ${path}`)
		}
		const metadata = await lstat(absolutePath)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(absolutePath) !== absolutePath) {
			throw new Error(`Implementation path must be a physical file: ${path}`)
		}
		const source = await readFile(absolutePath)
		runtimeFiles.set(path, sha256(source))
		if (!path.endsWith(".ts")) continue
		const syntax = createSourceFile(path, source.toString("utf8"), ScriptTarget.ESNext, false, ScriptKind.TS)
		for (const statement of syntax.statements) {
			if ((!isImportDeclaration(statement) && !isExportDeclaration(statement)) ||
				!statement.moduleSpecifier || !isStringLiteralLike(statement.moduleSpecifier)) continue
			const specifier = statement.moduleSpecifier.text
			if (!specifier.startsWith(".")) continue
			const dependencyPath = resolve(dirname(absolutePath), specifier)
			const dependencyRelativePath = relative(projectRoot, dependencyPath).split(sep).join("/")
			if (dependencyRelativePath === ".." || dependencyRelativePath.startsWith("../")) {
				throw new Error(`Local implementation import escapes the project root: ${path} -> ${specifier}`)
			}
			pending.push(dependencyRelativePath)
		}
	}
	const extraFiles = Object.fromEntries(await Promise.all(nativeResolutionImplementationExtras.map(async (path) => {
		const absolutePath = resolve(projectRoot, ...path.split("/"))
		const metadata = await lstat(absolutePath)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(absolutePath) !== absolutePath) {
			throw new Error(`Implementation extra must be a physical file: ${path}`)
		}
		return [path, sha256(await readFile(absolutePath))] as const
	})))
	return {
		version: "native-resolution-static-import-closure-v1" as const,
		roots: [...nativeResolutionImplementationRoots],
		extras: [...nativeResolutionImplementationExtras],
		files: [...runtimeFiles].map(([path, rawSha256]) => ({ path, rawSha256 }))
			.concat(Object.entries(extraFiles).map(([path, rawSha256]) => ({ path, rawSha256 })))
			.sort((first, second) => first.path.localeCompare(second.path, "en")),
	}
}

function nativeResolutionScientificProjection(
	protocol: ReturnType<typeof buildNativeResolutionProtocol>,
	result: NativeResolutionDevelopmentResult,
) {
	return {
		protocol,
		entries: result.entries.map((entry) => ({
			sourceIndex: entry.sourceIndex,
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			source: entry.source,
			nativeImageSha256: entry.treatment.nativeImageSha256,
			extraction: semanticExtraction(entry.treatment.extraction),
		})),
	}
}

export function hasMaterialSpatialChange(comparison: ReturnType<typeof compareNativeResolutionExtractions>): boolean {
	return comparison.materiallyChangedRoles.some((role) => role.startsWith("spatial.")) ||
		comparison.changedGradients.includes("spatial")
}

function buildNativeResolutionTreatmentResults(result: NativeResolutionDevelopmentResult, generatedAt: string): CorpusResult {
	return {
		generatedAt,
		algorithmVersion: NATIVE_RESOLUTION_ALGORITHM_VERSION,
		entries: result.entries.map((entry) => ({
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			width: entry.treatment.extraction.width,
			height: entry.treatment.extraction.height,
			extraction: entry.treatment.extraction,
		})),
	}
}

function buildNativeResolutionReviewManifest(
	result: NativeResolutionDevelopmentResult,
	baseline: CorpusResult,
	 scientificIdentitySha256: string,
) {
	const baselineEntries = new Map(baseline.entries.map((entry) => [entry.file, entry]))
	const entries = result.entries.filter((entry) => entry.review && hasMaterialSpatialChange(entry.comparison)).map((entry) => {
		const baselineEntry = baselineEntries.get(entry.file)
		if (!baselineEntry) throw new Error(`Missing baseline review entry for ${entry.file}`)
		const assignmentSha256 = sha256(
			`${NATIVE_RESOLUTION_REVIEW_ID}\0${scientificIdentitySha256}\0${entry.source.relativePath}`,
		)
		const baselineOnLeft = Number.parseInt(assignmentSha256.slice(0, 2), 16) < 128
		const pairSha256 = sha256(JSON.stringify({
			reviewIdentity: NATIVE_RESOLUTION_REVIEW_ID,
			scientificIdentitySha256,
			file: entry.file,
			sourceSha256: entry.source.sha256,
			baseline: baselineEntry.extraction.methods.spatial,
			treatment: entry.treatment.extraction.methods.spatial,
		}))
		return {
			queueIndex: 0,
			file: entry.file,
			sourceRelativePath: entry.source.relativePath,
			sourceSha256: entry.source.sha256,
			pairSha256,
			assignmentSha256,
			left: baselineOnLeft ? "baseline" as const : "treatment" as const,
			right: baselineOnLeft ? "treatment" as const : "baseline" as const,
		}
	}).map((entry, queueIndex) => ({ ...entry, queueIndex }))
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_RESOLUTION_EXPERIMENT_ID,
		reviewIdentity: NATIVE_RESOLUTION_REVIEW_ID,
		presentationVersion: NATIVE_RESOLUTION_REVIEW_PRESENTATION_VERSION,
		scientificIdentitySha256,
		method: "spatial" as const,
		queueCount: entries.length,
		entries,
	}
}

async function buildNativeResolutionArtifact(
	result: NativeResolutionDevelopmentResult,
	projectRoot: string,
	generatedAt = new Date().toISOString(),
) {
	if (result.execution.limited || result.entries.length !== 37) throw new Error("Only a complete 37-source result can be published")
	const baselineSource = await readFile(resolve(projectRoot, "research/data/results.json"))
	if (sha256(baselineSource) !== NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256) throw new Error("Frozen baseline changed before publication")
	const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
	const planSource = await readFile(resolve(projectRoot, nativeResolutionPlanPath))
	const implementation = await buildNativeResolutionImplementationClosure(projectRoot)
	const implementationSha256 = sha256(JSON.stringify(implementation))
	const protocol = buildNativeResolutionProtocol(sha256(planSource), implementationSha256)
	const scientificIdentitySha256 = sha256(JSON.stringify(nativeResolutionScientificProjection(protocol, result)))
	const results = buildNativeResolutionTreatmentResults(result, generatedAt)
	const reviewManifest = buildNativeResolutionReviewManifest(result, baseline, scientificIdentitySha256)
	const immutableValues = {
		"comparison.json": result,
		"protocol.json": protocol,
		"results.json": results,
		"review-manifest.json": reviewManifest,
	}
	const immutableSources = Object.fromEntries(
		Object.entries(immutableValues).map(([name, value]) => [name, prettyJson(value)]),
	)
	const sourceFiles = Object.fromEntries(result.entries.map((entry) => [entry.source.relativePath, entry.source.sha256]))
	const manifest = {
		schemaVersion: 1 as const,
		experimentId: NATIVE_RESOLUTION_EXPERIMENT_ID,
		generatedAt,
		scientificIdentitySha256,
		baseline: protocol.baseline,
		treatment: protocol.treatment,
		review: {
			identity: NATIVE_RESOLUTION_REVIEW_ID,
			presentationVersion: NATIVE_RESOLUTION_REVIEW_PRESENTATION_VERSION,
			queueCount: reviewManifest.queueCount,
		},
		artifactHashes: Object.fromEntries(Object.entries(immutableSources).map(([name, source]) => [name, sha256(source)])),
		implementation,
		sourceFiles,
		sourceRosterSha256: sha256(JSON.stringify(result.entries.map((entry) => ({
			file: entry.file,
			relativePath: entry.source.relativePath,
			sha256: entry.source.sha256,
		})))),
	}
	return { ...immutableSources, "manifest.json": prettyJson(manifest) } as Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function verifyNativeResolutionArtifact(
	artifactDirectory: string,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	const metadata = await lstat(artifactDirectory)
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(artifactDirectory) !== resolve(artifactDirectory)) {
		throw new Error("Native resolution artifact must be a physical directory")
	}
	const names = (await readdir(artifactDirectory)).sort()
	if (JSON.stringify(names) !== JSON.stringify([...NATIVE_RESOLUTION_ARTIFACT_FILES].sort())) {
		throw new Error("Native resolution artifact file set is invalid")
	}
	const sources = Object.fromEntries(await Promise.all(names.map(async (name) => {
		if (basename(name) !== name) throw new Error("Invalid artifact filename")
		const path = join(artifactDirectory, name)
		const fileMetadata = await lstat(path)
		if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) throw new Error(`Invalid artifact file: ${name}`)
		return [name, await readFile(path, "utf8")] as const
	})))
	const parsed = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, JSON.parse(source) as unknown]))
	const manifestValue = parsed["manifest.json"]
	if (!isRecord(manifestValue) || manifestValue.schemaVersion !== 1 || manifestValue.experimentId !== NATIVE_RESOLUTION_EXPERIMENT_ID ||
		typeof manifestValue.scientificIdentitySha256 !== "string" || !isRecord(manifestValue.artifactHashes) ||
		!isRecord(manifestValue.implementation) || !isRecord(manifestValue.sourceFiles)) {
		throw new Error("Native resolution manifest header is invalid")
	}
	for (const name of NATIVE_RESOLUTION_ARTIFACT_FILES.filter((name) => name !== "manifest.json")) {
		if (manifestValue.artifactHashes[name] !== sha256(sources[name])) throw new Error(`Artifact hash mismatch: ${name}`)
	}
	if (Object.keys(manifestValue.artifactHashes).sort().join("\0") !==
		NATIVE_RESOLUTION_ARTIFACT_FILES.filter((name) => name !== "manifest.json").sort().join("\0")) {
		throw new Error("Artifact hash registry is invalid")
	}
	const baselineSource = await readFile(resolve(projectRoot, "research/data/results.json"))
	if (sha256(baselineSource) !== NATIVE_RESOLUTION_BASELINE_RESULTS_SHA256) throw new Error("Frozen baseline hash mismatch")
	const planSource = await readFile(resolve(projectRoot, nativeResolutionPlanPath))
	const implementation = await buildNativeResolutionImplementationClosure(projectRoot)
	if (JSON.stringify(manifestValue.implementation) !== JSON.stringify(implementation)) throw new Error("Implementation closure mismatch")
	const expectedProtocol = buildNativeResolutionProtocol(sha256(planSource), sha256(JSON.stringify(implementation)))
	if (JSON.stringify(parsed["protocol.json"]) !== JSON.stringify(expectedProtocol)) throw new Error("Protocol does not match the frozen implementation")
	const comparisonValue = parsed["comparison.json"]
	if (!isRecord(comparisonValue) || comparisonValue.experimentId !== NATIVE_RESOLUTION_EXPERIMENT_ID ||
		!isRecord(comparisonValue.execution) || comparisonValue.execution.limited !== false ||
		!Array.isArray(comparisonValue.entries) || comparisonValue.entries.length !== 37) {
		throw new Error("Comparison artifact is incomplete")
	}
	const comparison = comparisonValue as NativeResolutionDevelopmentResult
	const scientificIdentitySha256 = sha256(JSON.stringify(nativeResolutionScientificProjection(expectedProtocol, comparison)))
	if (manifestValue.scientificIdentitySha256 !== scientificIdentitySha256) throw new Error("Scientific identity mismatch")
	if (JSON.stringify(manifestValue.baseline) !== JSON.stringify(expectedProtocol.baseline) ||
		JSON.stringify(manifestValue.treatment) !== JSON.stringify(expectedProtocol.treatment)) {
		throw new Error("Manifest algorithm identity mismatch")
	}
	const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
	const expectedReviewManifest = buildNativeResolutionReviewManifest(comparison, baseline, scientificIdentitySha256)
	if (JSON.stringify(parsed["review-manifest.json"]) !== JSON.stringify(expectedReviewManifest)) throw new Error("Review manifest mismatch")
	if (JSON.stringify(manifestValue.review) !== JSON.stringify({
		identity: NATIVE_RESOLUTION_REVIEW_ID,
		presentationVersion: NATIVE_RESOLUTION_REVIEW_PRESENTATION_VERSION,
		queueCount: expectedReviewManifest.queueCount,
	})) throw new Error("Manifest review identity mismatch")
	const resultsValue = parsed["results.json"]
	if (!isRecord(resultsValue) || typeof resultsValue.generatedAt !== "string") throw new Error("Treatment results header is invalid")
	if (manifestValue.generatedAt !== resultsValue.generatedAt) throw new Error("Artifact timestamps do not reconcile")
	const expectedResults = buildNativeResolutionTreatmentResults(comparison, resultsValue.generatedAt)
	if (JSON.stringify(resultsValue) !== JSON.stringify(expectedResults)) throw new Error("Treatment results do not match comparison payload")
	const expectedSourceFiles = Object.fromEntries(comparison.entries.map((entry) => [entry.source.relativePath, entry.source.sha256]))
	if (JSON.stringify(manifestValue.sourceFiles) !== JSON.stringify(expectedSourceFiles)) throw new Error("Source hash registry mismatch")
	const expectedSourceRosterSha256 = sha256(JSON.stringify(comparison.entries.map((entry) => ({
		file: entry.file,
		relativePath: entry.source.relativePath,
		sha256: entry.source.sha256,
	}))))
	if (manifestValue.sourceRosterSha256 !== expectedSourceRosterSha256) throw new Error("Source roster identity mismatch")
	for (const [relativePath, expectedSha256] of Object.entries(expectedSourceFiles)) {
		if (sha256(await readFile(resolve(projectRoot, relativePath))) !== expectedSha256) throw new Error(`Source hash mismatch: ${relativePath}`)
	}
	return {
		manifest: manifestValue,
		manifestSha256: sha256(sources["manifest.json"]),
		protocol: expectedProtocol,
		comparison,
		results: expectedResults,
		reviewManifest: expectedReviewManifest,
	}
}

export async function publishNativeResolutionArtifact(
	result: NativeResolutionDevelopmentResult,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<string> {
	const experimentsRoot = resolve(projectRoot, "research/data/experiments")
	const rootMetadata = await lstat(experimentsRoot)
	if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || await realpath(experimentsRoot) !== experimentsRoot) {
		throw new Error("Experiment root must be a physical directory")
	}
	const finalDirectory = join(experimentsRoot, NATIVE_RESOLUTION_EXPERIMENT_ID)
	if (dirname(finalDirectory) !== experimentsRoot) throw new Error("Invalid native resolution artifact path")
	try {
		await lstat(finalDirectory)
		throw new Error(`Refusing to overwrite existing artifact: ${finalDirectory}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
	const stagingDirectory = join(experimentsRoot, `.${NATIVE_RESOLUTION_EXPERIMENT_ID}.staging-${randomUUID()}`)
	await mkdir(stagingDirectory, { recursive: false, mode: 0o700 })
	try {
		const artifact = await buildNativeResolutionArtifact(result, projectRoot)
		for (const name of NATIVE_RESOLUTION_ARTIFACT_FILES) {
			await writeFile(join(stagingDirectory, name), artifact[name], { encoding: "utf8", flag: "wx", mode: 0o600 })
		}
		await verifyNativeResolutionArtifact(stagingDirectory, projectRoot)
		await rename(stagingDirectory, finalDirectory)
		await verifyNativeResolutionArtifact(finalDirectory, projectRoot)
		return finalDirectory
	} catch (error) {
		const failedDirectory = join(experimentsRoot,
			`${NATIVE_RESOLUTION_EXPERIMENT_ID}.failed-${new Date().toISOString().replaceAll(/[-:.]/g, "")}-${randomUUID()}`)
		await rename(stagingDirectory, failedDirectory)
		throw new Error(`Native resolution publication failed; preserved at ${failedDirectory}`, { cause: error })
	}
}

async function main(): Promise<void> {
	const { limit, summaryOnly, publish } = parseNativeResolutionArguments(process.argv.slice(2))
	const result = await evaluateNativeResolutionDevelopment(limit)
	const publishedDirectory = publish ? await publishNativeResolutionArtifact(result) : null
	process.stdout.write(`${JSON.stringify(summaryOnly ? {
		experimentId: result.experimentId,
		execution: result.execution,
		summary: result.summary,
		changedSources: result.entries.filter(({ comparison }) => comparison.materiallyChanged).map(({ file, comparison }) => ({
			file,
			changedRoles: comparison.changedRoles,
			materiallyChangedRoles: comparison.materiallyChangedRoles,
			changedGradients: comparison.changedGradients,
			addedCandidates: comparison.addedCandidates.length,
			removedCandidates: comparison.removedCandidates.length,
			materiallyAddedCandidates: comparison.materiallyAddedCandidates.length,
			materiallyRemovedCandidates: comparison.materiallyRemovedCandidates.length,
		})),
	} : publish ? {
		experimentId: result.experimentId,
		execution: result.execution,
		summary: result.summary,
		publishedDirectory,
	} : result)}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
