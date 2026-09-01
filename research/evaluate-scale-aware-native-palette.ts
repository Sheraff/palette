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
import { contrastRatio, okDistance, rgbToOKLab } from "./src/color.ts"
import {
	SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
	SCALE_AWARE_NATIVE_POLICY,
	SCALE_AWARE_NATIVE_POLICY_SHA256,
	type ScaleAwareNativeExtractionContext,
} from "./src/scale-aware-native-extract.ts"
import type { CorpusResult, ExtractionResult, Palette, RoleName } from "./src/types.ts"

export const SCALE_AWARE_NATIVE_EXPERIMENT_ID = SCALE_AWARE_NATIVE_ALGORITHM_VERSION
export const SCALE_AWARE_NATIVE_BASELINE_SHA256 =
	"546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID =
	"region-graph-0.19.0-native-resolution-0.1.1-development" as const
export const SCALE_AWARE_NATIVE_MATERIAL_DISTANCE = 0.025
export const SCALE_AWARE_NATIVE_CHILD_TIMEOUT_MS = 120_000
export const SCALE_AWARE_NATIVE_REVIEW_ID = "scale-aware-native-spatial-pair-review-v2" as const
export const SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION = 1 as const
export const SCALE_AWARE_NATIVE_ARTIFACT_FILES = [
	"comparison.json",
	"manifest.json",
	"protocol.json",
	"results.json",
	"review-manifest.json",
] as const

const roles: readonly RoleName[] = ["background", "foreground", "surface", "accent"]

type ChildResult = {
	schemaVersion: 1
	algorithmVersion: typeof SCALE_AWARE_NATIVE_ALGORITHM_VERSION
	policySha256: typeof SCALE_AWARE_NATIVE_POLICY_SHA256
	source: { relativePath: string; bytes: number; sha256: string }
	context: ScaleAwareNativeExtractionContext
	resource: { elapsedMs: number; maximumRssBytes: number }
}

export function compareScaleAwareSpatial(first: Palette, second: Palette) {
	const materiallyChangedRoles = roles.filter((role) =>
		first[role].generated !== second[role].generated ||
		okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)) > SCALE_AWARE_NATIVE_MATERIAL_DISTANCE)
	const exactChangedRoles = roles.filter((role) =>
		first[role].generated !== second[role].generated || first[role].hex !== second[role].hex)
	const gradientChanged = first.gradient.isGradient !== second.gradient.isGradient
	return {
		exactChanged: exactChangedRoles.length > 0 || gradientChanged,
		materiallyChanged: materiallyChangedRoles.length > 0 || gradientChanged,
		exactChangedRoles,
		materiallyChangedRoles,
		gradientChanged,
	}
}

function hardGateViolations(extraction: ExtractionResult): string[] {
	const palette = extraction.methods.spatial
	const violations: string[] = []
	for (const role of roles) {
		if (palette[role].rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
			violations.push(`${role}-out-of-gamut`)
		}
	}
	if (contrastRatio(palette.background.rgb, palette.foreground.rgb) + 1e-9 < 3) violations.push("foreground-background-contrast")
	if (contrastRatio(palette.surface.rgb, palette.foreground.rgb) + 1e-9 < 2.5) violations.push("foreground-surface-contrast")
	if (palette.foreground.generated && (
		contrastRatio(palette.background.rgb, palette.foreground.rgb) + 1e-9 < 4.5 ||
		contrastRatio(palette.surface.rgb, palette.foreground.rgb) + 1e-9 < 4.5
	)) violations.push("generated-foreground-contrast")
	if (contrastRatio(palette.background.rgb, palette.accent.rgb) + 1e-9 < 1.2) violations.push("accent-background-visibility")
	const accent = rgbToOKLab(palette.accent.rgb)
	if (okDistance(accent, rgbToOKLab(palette.background.rgb)) + 1e-9 < 0.025 ||
		okDistance(accent, rgbToOKLab(palette.surface.rgb)) + 1e-9 < 0.025) violations.push("accent-role-distance")
	return violations
}

export function parseScaleAwareNativeArguments(arguments_: readonly string[]) {
	if ((arguments_.length !== 2 && arguments_.length !== 3) || arguments_[0] !== "--limit" ||
		!/^[1-9][0-9]*$/.test(arguments_[1]) ||
		(arguments_.length === 3 && arguments_[2] !== "--summary" && arguments_[2] !== "--publish")) {
		throw new Error("Usage: evaluate-scale-aware-native-palette.ts --limit <1..37> [--summary|--publish]")
	}
	const limit = Number(arguments_[1])
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new Error("--limit must be between 1 and 37")
	const publish = arguments_[2] === "--publish"
	if (publish && limit !== 37) throw new Error("Publication requires the complete 37-source development cohort")
	return { limit, summaryOnly: arguments_[2] === "--summary", publish }
}

async function runChild(projectRoot: string, relativePath: string): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./scale-aware-native-extraction-child.ts", import.meta.url))
	return await new Promise<ChildResult>((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, relativePath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), SCALE_AWARE_NATIVE_CHILD_TIMEOUT_MS)
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
				rejectChild(new Error(`Scale-aware child failed (${code ?? signal ?? "unknown"}): ${stderr.trim()}`))
				return
			}
			try {
				const parsed = JSON.parse(stdout) as ChildResult
				if (parsed.schemaVersion !== 1 || parsed.algorithmVersion !== SCALE_AWARE_NATIVE_ALGORITHM_VERSION ||
					parsed.policySha256 !== SCALE_AWARE_NATIVE_POLICY_SHA256 || parsed.source.relativePath !== relativePath) {
					throw new Error("Scale-aware child result identity is invalid")
				}
				resolveChild(parsed)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

export async function evaluateScaleAwareNativeDevelopment(
	limit: number,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new RangeError("Development limit must be between 1 and 37")
	const baselineBytes = await readFile(resolve(projectRoot, "research/data/results.json"))
	if (createHash("sha256").update(baselineBytes).digest("hex") !== SCALE_AWARE_NATIVE_BASELINE_SHA256) {
		throw new Error("Frozen canonical development artifact changed")
	}
	const baseline = JSON.parse(baselineBytes.toString("utf8")) as CorpusResult
	const raw = JSON.parse(await readFile(resolve(
		projectRoot,
		`research/data/experiments/${SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID}/results.json`,
	), "utf8")) as CorpusResult
	if (baseline.entries.length !== 37 || raw.entries.length !== 37) throw new Error("Comparison corpus coverage is invalid")
	const rawEntries = new Map(raw.entries.map((entry) => [entry.file, entry]))
	const entries = []
	for (const [sourceIndex, baselineEntry] of baseline.entries.slice(0, limit).entries()) {
		const rawEntry = rawEntries.get(baselineEntry.file)
		if (!rawEntry) throw new Error(`Missing raw-native result for ${baselineEntry.file}`)
		const child = await runChild(projectRoot, `images/${baselineEntry.file}`)
		const treatment = child.context.extraction.methods.spatial
		const canonical = baselineEntry.extraction.methods.spatial
		const rawNative = rawEntry.extraction.methods.spatial
		entries.push({
			sourceIndex,
			file: baselineEntry.file,
			kind: baselineEntry.kind,
			review: baselineEntry.review,
			source: child.source,
			canonicalComparison: compareScaleAwareSpatial(canonical, treatment),
			rawNativeComparison: compareScaleAwareSpatial(rawNative, treatment),
			rawNativeGradientFlip: canonical.gradient.isGradient !== rawNative.gradient.isGradient,
			treatmentGradientFlip: canonical.gradient.isGradient !== treatment.gradient.isGradient,
			hardGateViolations: hardGateViolations(child.context.extraction),
			projection: child.context.projection,
			treatment: child.context.extraction,
			resource: child.resource,
		})
		process.stderr.write(`[${sourceIndex + 1}/${limit}] ${baselineEntry.file}\n`)
	}
	return {
		schemaVersion: 1 as const,
		experimentId: SCALE_AWARE_NATIVE_EXPERIMENT_ID,
		policy: SCALE_AWARE_NATIVE_POLICY,
		policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		execution: { sourceCount: entries.length, fullDevelopmentSourceCount: 37, limited: entries.length !== 37 },
		summary: {
			canonicalMateriallyChangedSources: entries.filter((entry) => entry.canonicalComparison.materiallyChanged).length,
			rawNativeMateriallyChangedSources: entries.filter((entry) => entry.rawNativeComparison.materiallyChanged).length,
			canonicalExactPreservations: entries.filter((entry) => !entry.canonicalComparison.exactChanged).length,
			rawNativeExactPreservations: entries.filter((entry) => !entry.rawNativeComparison.exactChanged).length,
			treatmentGradientFlips: entries.filter((entry) => entry.treatmentGradientFlip).length,
			reproducedRawNativeGradientFlips: entries.filter((entry) => entry.rawNativeGradientFlip && entry.treatmentGradientFlip).length,
			hardGateViolationSources: entries.filter((entry) => entry.hardGateViolations.length > 0).length,
			reviewQueueSources: entries.filter((entry) => entry.review && entry.canonicalComparison.materiallyChanged).length,
			maximumRssBytes: Math.max(...entries.map((entry) => entry.resource.maximumRssBytes)),
			maximumElapsedMs: Math.max(...entries.map((entry) => entry.resource.elapsedMs)),
		},
		entries,
	}
}

type ScaleAwareNativeDevelopmentResult = Awaited<ReturnType<typeof evaluateScaleAwareNativeDevelopment>>

const scaleAwarePlanPath = "research/SCALE_AWARE_NATIVE_PALETTE_PLAN.md"
const scaleAwareImplementationRoots = [
	"research/evaluate-scale-aware-native-palette.ts",
	"research/scale-aware-native-extraction-child.ts",
	"research/serve-scale-aware-native-review.ts",
] as const
const scaleAwareImplementationExtras = [
	"package.json",
	"pnpm-lock.yaml",
	scaleAwarePlanPath,
	"research/review/app.js",
	"research/review/index.html",
	"research/review/styles.css",
	"research/tests/scale-aware-native-evaluation.test.ts",
	"research/tests/scale-aware-native-extract.test.ts",
] as const
const rawNativeResultsSha256 = "f8db190b1f2a6c46877d28963cecfabf0ac37a03f114423c52314d64300ad9e2"
const rawNativeReviewManifestSha256 = "68b613d9743fe3c6cd28f464441b5bcf2895e54a9f80700b9acd5f17a4e48bdb"
const rawNativeFeedbackSha256 = "415d463c2600df908e0a8caed40f928a4a2a1095ee182681f9980ffab913ebfd"

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

async function buildScaleAwareImplementationClosure(projectRoot: string) {
	const pending: string[] = [...scaleAwareImplementationRoots]
	const runtimeFiles = new Map<string, string>()
	while (pending.length > 0) {
		const path = pending.pop()!
		if (runtimeFiles.has(path)) continue
		const absolutePath = resolve(projectRoot, ...path.split("/"))
		const relativePath = relative(projectRoot, absolutePath)
		if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) throw new Error(`Implementation path escapes project: ${path}`)
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
			const dependency = resolve(dirname(absolutePath), specifier)
			const dependencyPath = relative(projectRoot, dependency).split(sep).join("/")
			if (dependencyPath === ".." || dependencyPath.startsWith("../")) throw new Error(`Local import escapes project: ${path}`)
			pending.push(dependencyPath)
		}
	}
	const extras = await Promise.all(scaleAwareImplementationExtras.map(async (path) => {
		const absolutePath = resolve(projectRoot, ...path.split("/"))
		const metadata = await lstat(absolutePath)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(absolutePath) !== absolutePath) {
			throw new Error(`Implementation extra must be a physical file: ${path}`)
		}
		return { path, rawSha256: sha256(await readFile(absolutePath)) }
	}))
	return {
		version: "scale-aware-native-static-import-closure-v1" as const,
		roots: [...scaleAwareImplementationRoots],
		extras: [...scaleAwareImplementationExtras],
		files: [...runtimeFiles].map(([path, rawSha256]) => ({ path, rawSha256 })).concat(extras)
			.sort((first, second) => first.path.localeCompare(second.path, "en")),
	}
}

function buildScaleAwareProtocol(planSha256: string, implementationSha256: string) {
	return {
		schemaVersion: 1 as const,
		experimentId: SCALE_AWARE_NATIVE_EXPERIMENT_ID,
		plan: { path: scaleAwarePlanPath, sha256: planSha256 },
		canonicalComparator: {
			algorithmVersion: "region-graph-0.19.0",
			path: "research/data/results.json",
			sha256: SCALE_AWARE_NATIVE_BASELINE_SHA256,
			roleInInference: "none",
		},
		rawNativeBasis: {
			experimentId: SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID,
			resultsSha256: rawNativeResultsSha256,
			reviewManifestSha256: rawNativeReviewManifestSha256,
			feedbackSha256: rawNativeFeedbackSha256,
		},
		treatment: {
			algorithmVersion: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
			policy: SCALE_AWARE_NATIVE_POLICY,
			policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		},
		difference: { materialOklabDistance: SCALE_AWARE_NATIVE_MATERIAL_DISTANCE },
		execution: { sourceCount: 37, childTimeoutMs: SCALE_AWARE_NATIVE_CHILD_TIMEOUT_MS, childMaximumRssBytes: 1_073_741_824 },
		review: {
			identity: SCALE_AWARE_NATIVE_REVIEW_ID,
			presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
			method: "spatial",
			exactPriorPairCarryOnly: true,
		},
		implementation: {
			version: "scale-aware-native-static-import-closure-v1",
			method: "recursive-local-static-import-closure-plus-declared-extras",
			sha256: implementationSha256,
		},
	}
}

function scientificProjection(
	protocol: ReturnType<typeof buildScaleAwareProtocol>,
	result: ScaleAwareNativeDevelopmentResult,
) {
	return {
		protocol,
		entries: result.entries.map((entry) => ({
			sourceIndex: entry.sourceIndex,
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			source: entry.source,
			projection: entry.projection,
			extraction: semanticExtraction(entry.treatment),
		})),
	}
}

function treatmentResults(result: ScaleAwareNativeDevelopmentResult, generatedAt: string): CorpusResult {
	return {
		generatedAt,
		algorithmVersion: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
		entries: result.entries.map((entry) => ({
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			width: entry.treatment.width,
			height: entry.treatment.height,
			extraction: entry.treatment,
		})),
	}
}

function renderedSpatialPayload(palette: Palette) {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex,
			generated: palette[role].generated,
		}])),
		gradient: palette.gradient.isGradient,
	}
}

type PriorReviewEntry = {
	file: string
	sourceSha256: string
	pairSha256: string
	left: "baseline" | "treatment"
	right: "baseline" | "treatment"
}
type PriorFeedbackEntry = {
	id: string
	image: string
	preference: "left" | "right" | "tie"
	ship: "left" | "right" | "both" | "neither"
	pairSha256: string
	sourceSha256: string
	presentationVersion: number
}

function buildScaleAwareReviewManifest(
	result: ScaleAwareNativeDevelopmentResult,
	baseline: CorpusResult,
	raw: CorpusResult,
	priorReviewEntries: PriorReviewEntry[],
	priorFeedbackEntries: PriorFeedbackEntry[],
	scientificIdentitySha256: string,
) {
	const baselineEntries = new Map(baseline.entries.map((entry) => [entry.file, entry]))
	const rawEntries = new Map(raw.entries.map((entry) => [entry.file, entry]))
	const priorReviews = new Map(priorReviewEntries.map((entry) => [entry.file, entry]))
	const priorFeedback = new Map(priorFeedbackEntries.map((entry) => [entry.image, entry]))
	const carried = []
	const queued = []
	for (const entry of result.entries) {
		if (!entry.review || !entry.canonicalComparison.materiallyChanged) continue
		const baselineEntry = baselineEntries.get(entry.file)
		const rawEntry = rawEntries.get(entry.file)
		if (!baselineEntry || !rawEntry) throw new Error(`Missing review comparator for ${entry.file}`)
		const priorReview = priorReviews.get(entry.file)
		const feedback = priorFeedback.get(entry.file)
		const exactRawTreatment = JSON.stringify(renderedSpatialPayload(entry.treatment.methods.spatial)) ===
			JSON.stringify(renderedSpatialPayload(rawEntry.extraction.methods.spatial))
		const carryEligible = exactRawTreatment && priorReview !== undefined && feedback !== undefined &&
			feedback.presentationVersion === SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION &&
			feedback.pairSha256 === priorReview.pairSha256 && feedback.sourceSha256 === entry.source.sha256 &&
			priorReview.sourceSha256 === entry.source.sha256
		if (carryEligible) {
			const identityAt = (side: "left" | "right"): "canonical" | "treatment" =>
				priorReview[side] === "baseline" ? "canonical" : "treatment"
			carried.push({
				file: entry.file,
				sourceSha256: entry.source.sha256,
				priorFeedbackId: feedback.id,
				priorPairSha256: priorReview.pairSha256,
				preference: feedback.preference === "tie" ? "tie" : identityAt(feedback.preference),
				canonicalShippable: feedback.ship === "both" ||
					(feedback.ship !== "neither" && identityAt(feedback.ship) === "canonical"),
				treatmentShippable: feedback.ship === "both" ||
					(feedback.ship !== "neither" && identityAt(feedback.ship) === "treatment"),
			})
		continue
		}
		const assignmentSha256 = sha256(`${SCALE_AWARE_NATIVE_REVIEW_ID}\0${scientificIdentitySha256}\0${entry.source.relativePath}`)
		const canonicalOnLeft = Number.parseInt(assignmentSha256.slice(0, 2), 16) < 128
		queued.push({
			queueIndex: 0,
			file: entry.file,
			sourceRelativePath: entry.source.relativePath,
			sourceSha256: entry.source.sha256,
			pairSha256: sha256(JSON.stringify({
				reviewIdentity: SCALE_AWARE_NATIVE_REVIEW_ID,
				scientificIdentitySha256,
				file: entry.file,
				sourceSha256: entry.source.sha256,
				canonical: baselineEntry.extraction.methods.spatial,
				treatment: entry.treatment.methods.spatial,
			})),
			assignmentSha256,
			left: canonicalOnLeft ? "canonical" as const : "treatment" as const,
			right: canonicalOnLeft ? "treatment" as const : "canonical" as const,
		})
	}
	const entries = queued.map((entry, queueIndex) => ({ ...entry, queueIndex }))
	return {
		schemaVersion: 1 as const,
		experimentId: SCALE_AWARE_NATIVE_EXPERIMENT_ID,
		reviewIdentity: SCALE_AWARE_NATIVE_REVIEW_ID,
		presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
		scientificIdentitySha256,
		method: "spatial" as const,
		eligiblePairCount: carried.length + entries.length,
		carriedCount: carried.length,
		queueCount: entries.length,
		carried,
		entries,
	}
}

async function buildScaleAwareArtifact(
	result: ScaleAwareNativeDevelopmentResult,
	projectRoot: string,
	generatedAt = new Date().toISOString(),
) {
	if (result.execution.limited || result.entries.length !== 37 || result.summary.hardGateViolationSources !== 0) {
		throw new Error("Only a complete hard-gate-clean result can be published")
	}
	const baselineSource = await readFile(resolve(projectRoot, "research/data/results.json"))
	const rawResultsSource = await readFile(resolve(projectRoot,
		`research/data/experiments/${SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID}/results.json`))
	const priorReviewSource = await readFile(resolve(projectRoot,
		`research/data/experiments/${SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID}/review-manifest.json`))
	const priorFeedbackSource = await readFile(resolve(projectRoot, "research/data/native-resolution-review-feedback.json"))
	if (sha256(baselineSource) !== SCALE_AWARE_NATIVE_BASELINE_SHA256 || sha256(rawResultsSource) !== rawNativeResultsSha256 ||
		sha256(priorReviewSource) !== rawNativeReviewManifestSha256 || sha256(priorFeedbackSource) !== rawNativeFeedbackSha256) {
		throw new Error("Scale-aware artifact inputs changed")
	}
	const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
	const raw = JSON.parse(rawResultsSource.toString("utf8")) as CorpusResult
	const priorReview = JSON.parse(priorReviewSource.toString("utf8")) as { entries: PriorReviewEntry[] }
	const priorFeedback = JSON.parse(priorFeedbackSource.toString("utf8")) as { entries: PriorFeedbackEntry[] }
	const planSource = await readFile(resolve(projectRoot, scaleAwarePlanPath))
	const implementation = await buildScaleAwareImplementationClosure(projectRoot)
	const protocol = buildScaleAwareProtocol(sha256(planSource), sha256(JSON.stringify(implementation)))
	const scientificIdentitySha256 = sha256(JSON.stringify(scientificProjection(protocol, result)))
	const results = treatmentResults(result, generatedAt)
	const reviewManifest = buildScaleAwareReviewManifest(
		result, baseline, raw, priorReview.entries, priorFeedback.entries, scientificIdentitySha256,
	)
	const immutableValues = {
		"comparison.json": result,
		"protocol.json": protocol,
		"results.json": results,
		"review-manifest.json": reviewManifest,
	}
	const immutableSources = Object.fromEntries(Object.entries(immutableValues).map(([name, value]) => [name, prettyJson(value)]))
	const sourceFiles = Object.fromEntries(result.entries.map((entry) => [entry.source.relativePath, entry.source.sha256]))
	const manifest = {
		schemaVersion: 1 as const,
		experimentId: SCALE_AWARE_NATIVE_EXPERIMENT_ID,
		generatedAt,
		scientificIdentitySha256,
		canonicalComparator: protocol.canonicalComparator,
		rawNativeBasis: protocol.rawNativeBasis,
		treatment: protocol.treatment,
		review: {
			identity: SCALE_AWARE_NATIVE_REVIEW_ID,
			presentationVersion: SCALE_AWARE_NATIVE_REVIEW_PRESENTATION_VERSION,
			eligiblePairCount: reviewManifest.eligiblePairCount,
			carriedCount: reviewManifest.carriedCount,
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

export async function verifyScaleAwareNativeArtifact(
	artifactDirectory: string,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	const metadata = await lstat(artifactDirectory)
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(artifactDirectory) !== resolve(artifactDirectory)) {
		throw new Error("Scale-aware artifact must be a physical directory")
	}
	const names = (await readdir(artifactDirectory)).sort()
	if (JSON.stringify(names) !== JSON.stringify([...SCALE_AWARE_NATIVE_ARTIFACT_FILES].sort())) throw new Error("Artifact file set is invalid")
	const sources = Object.fromEntries(await Promise.all(names.map(async (name) => {
		if (basename(name) !== name) throw new Error("Invalid artifact filename")
		const path = join(artifactDirectory, name)
		const fileMetadata = await lstat(path)
		if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) throw new Error(`Invalid artifact file: ${name}`)
		return [name, await readFile(path, "utf8")] as const
	})))
	const parsed = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, JSON.parse(source) as unknown]))
	const manifestValue = parsed["manifest.json"]
	if (!isRecord(manifestValue) || manifestValue.schemaVersion !== 1 || manifestValue.experimentId !== SCALE_AWARE_NATIVE_EXPERIMENT_ID ||
		typeof manifestValue.scientificIdentitySha256 !== "string" || !isRecord(manifestValue.artifactHashes) ||
		!isRecord(manifestValue.implementation) || !isRecord(manifestValue.sourceFiles)) throw new Error("Manifest header is invalid")
	for (const name of SCALE_AWARE_NATIVE_ARTIFACT_FILES.filter((name) => name !== "manifest.json")) {
		if (manifestValue.artifactHashes[name] !== sha256(sources[name])) throw new Error(`Artifact hash mismatch: ${name}`)
	}
	const baselineSource = await readFile(resolve(projectRoot, "research/data/results.json"))
	const rawResultsSource = await readFile(resolve(projectRoot,
		`research/data/experiments/${SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID}/results.json`))
	const priorReviewSource = await readFile(resolve(projectRoot,
		`research/data/experiments/${SCALE_AWARE_NATIVE_RAW_EXPERIMENT_ID}/review-manifest.json`))
	const priorFeedbackSource = await readFile(resolve(projectRoot, "research/data/native-resolution-review-feedback.json"))
	if (sha256(baselineSource) !== SCALE_AWARE_NATIVE_BASELINE_SHA256 || sha256(rawResultsSource) !== rawNativeResultsSha256 ||
		sha256(priorReviewSource) !== rawNativeReviewManifestSha256 || sha256(priorFeedbackSource) !== rawNativeFeedbackSha256) {
		throw new Error("Artifact comparison inputs changed")
	}
	const implementation = await buildScaleAwareImplementationClosure(projectRoot)
	if (JSON.stringify(manifestValue.implementation) !== JSON.stringify(implementation)) throw new Error("Implementation closure mismatch")
	const planSource = await readFile(resolve(projectRoot, scaleAwarePlanPath))
	const expectedProtocol = buildScaleAwareProtocol(sha256(planSource), sha256(JSON.stringify(implementation)))
	if (JSON.stringify(parsed["protocol.json"]) !== JSON.stringify(expectedProtocol)) throw new Error("Protocol mismatch")
	const comparisonValue = parsed["comparison.json"]
	if (!isRecord(comparisonValue) || comparisonValue.experimentId !== SCALE_AWARE_NATIVE_EXPERIMENT_ID ||
		!isRecord(comparisonValue.execution) || comparisonValue.execution.limited !== false ||
		!Array.isArray(comparisonValue.entries) || comparisonValue.entries.length !== 37) throw new Error("Comparison is incomplete")
	const comparison = comparisonValue as ScaleAwareNativeDevelopmentResult
	const scientificIdentitySha256 = sha256(JSON.stringify(scientificProjection(expectedProtocol, comparison)))
	if (manifestValue.scientificIdentitySha256 !== scientificIdentitySha256) throw new Error("Scientific identity mismatch")
	const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
	const raw = JSON.parse(rawResultsSource.toString("utf8")) as CorpusResult
	const priorReview = JSON.parse(priorReviewSource.toString("utf8")) as { entries: PriorReviewEntry[] }
	const priorFeedback = JSON.parse(priorFeedbackSource.toString("utf8")) as { entries: PriorFeedbackEntry[] }
	const expectedReview = buildScaleAwareReviewManifest(
		comparison, baseline, raw, priorReview.entries, priorFeedback.entries, scientificIdentitySha256,
	)
	if (JSON.stringify(parsed["review-manifest.json"]) !== JSON.stringify(expectedReview)) throw new Error("Review manifest mismatch")
	const resultsValue = parsed["results.json"]
	if (!isRecord(resultsValue) || typeof resultsValue.generatedAt !== "string" || manifestValue.generatedAt !== resultsValue.generatedAt) {
		throw new Error("Treatment results header is invalid")
	}
	const expectedResults = treatmentResults(comparison, resultsValue.generatedAt)
	if (JSON.stringify(resultsValue) !== JSON.stringify(expectedResults)) throw new Error("Treatment results mismatch")
	const expectedSourceFiles = Object.fromEntries(comparison.entries.map((entry) => [entry.source.relativePath, entry.source.sha256]))
	if (JSON.stringify(manifestValue.sourceFiles) !== JSON.stringify(expectedSourceFiles)) throw new Error("Source registry mismatch")
	for (const [path, digest] of Object.entries(expectedSourceFiles)) {
		if (sha256(await readFile(resolve(projectRoot, path))) !== digest) throw new Error(`Source hash mismatch: ${path}`)
	}
	return {
		manifest: manifestValue,
		manifestSha256: sha256(sources["manifest.json"]),
		protocol: expectedProtocol,
		comparison,
		results: expectedResults,
		reviewManifest: expectedReview,
	}
}

export async function publishScaleAwareNativeArtifact(
	result: ScaleAwareNativeDevelopmentResult,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<string> {
	const experimentsRoot = resolve(projectRoot, "research/data/experiments")
	const rootMetadata = await lstat(experimentsRoot)
	if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || await realpath(experimentsRoot) !== experimentsRoot) {
		throw new Error("Experiment root must be a physical directory")
	}
	const finalDirectory = join(experimentsRoot, SCALE_AWARE_NATIVE_EXPERIMENT_ID)
	try {
		await lstat(finalDirectory)
		throw new Error(`Refusing to overwrite existing artifact: ${finalDirectory}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
	const stagingDirectory = join(experimentsRoot, `.${SCALE_AWARE_NATIVE_EXPERIMENT_ID}.staging-${randomUUID()}`)
	await mkdir(stagingDirectory, { recursive: false, mode: 0o700 })
	try {
		const artifact = await buildScaleAwareArtifact(result, projectRoot)
		for (const name of SCALE_AWARE_NATIVE_ARTIFACT_FILES) {
			await writeFile(join(stagingDirectory, name), artifact[name], { encoding: "utf8", flag: "wx", mode: 0o600 })
		}
		await verifyScaleAwareNativeArtifact(stagingDirectory, projectRoot)
		await rename(stagingDirectory, finalDirectory)
		await verifyScaleAwareNativeArtifact(finalDirectory, projectRoot)
		return finalDirectory
	} catch (error) {
		const failedDirectory = join(experimentsRoot,
			`${SCALE_AWARE_NATIVE_EXPERIMENT_ID}.failed-${new Date().toISOString().replaceAll(/[-:.]/g, "")}-${randomUUID()}`)
		await rename(stagingDirectory, failedDirectory)
		throw new Error(`Scale-aware publication failed; preserved at ${failedDirectory}`, { cause: error })
	}
}

async function main(): Promise<void> {
	const { limit, summaryOnly, publish } = parseScaleAwareNativeArguments(process.argv.slice(2))
	const result = await evaluateScaleAwareNativeDevelopment(limit)
	const publishedDirectory = publish ? await publishScaleAwareNativeArtifact(result) : null
	process.stdout.write(`${JSON.stringify(summaryOnly ? {
		experimentId: result.experimentId,
		execution: result.execution,
		summary: result.summary,
		changedSources: result.entries.filter((entry) => entry.canonicalComparison.materiallyChanged).map((entry) => ({
			file: entry.file,
			canonicalChangedRoles: entry.canonicalComparison.materiallyChangedRoles,
			rawNativeChangedRoles: entry.rawNativeComparison.materiallyChangedRoles,
			canonicalGradientChanged: entry.canonicalComparison.gradientChanged,
			rawNativeGradientChanged: entry.rawNativeComparison.gradientChanged,
			rawNativeGradientFlip: entry.rawNativeGradientFlip,
			treatmentGradientFlip: entry.treatmentGradientFlip,
			hardGateViolations: entry.hardGateViolations,
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
