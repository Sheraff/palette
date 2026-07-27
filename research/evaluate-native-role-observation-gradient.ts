import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
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
	NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
	NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY,
	NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
	type NativeRoleObservationGradientExtractionContext,
} from "./src/native-role-observation-gradient-extract.ts"
import type { CorpusResult, ExtractionResult, GradientEvidence, Palette, RoleName } from "./src/types.ts"

export const NATIVE_ROLE_OBSERVATION_GRADIENT_BASELINE_SHA256 =
	"546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_RESULTS_SHA256 =
	"f8db190b1f2a6c46877d28963cecfabf0ac37a03f114423c52314d64300ad9e2" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_RESULTS_SHA256 =
	"c30c632d6790f1902de9844d9ad1e98fb219a0a839ed1f25974baea9291ac2ef" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID =
	"region-graph-0.19.0-native-resolution-0.1.1-development" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID =
	"region-graph-0.19.0-scale-aware-native-0.2.1-development" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_MATERIAL_DISTANCE = 0.025
export const NATIVE_ROLE_OBSERVATION_GRADIENT_CHILD_TIMEOUT_MS = 120_000
export const NATIVE_ROLE_OBSERVATION_GRADIENT_DEVELOPMENT_PATH =
	"research/data/native-role-observation-gradient-development.json" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID =
	"native-role-observation-gradient-spatial-pair-review-v1" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_PRESENTATION_VERSION = 1 as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_ARTIFACT_FILES = [
	"comparison.json",
	"manifest.json",
	"protocol.json",
	"results.json",
	"review-manifest.json",
] as const

const rawReviewManifestSha256 = "68b613d9743fe3c6cd28f464441b5bcf2895e54a9f80700b9acd5f17a4e48bdb"
const rawFeedbackSha256 = "415d463c2600df908e0a8caed40f928a4a2a1095ee182681f9980ffab913ebfd"
const scaleAwareReviewManifestSha256 = "92126b647dd8a2fa02ac93d4f250f3060aca7594d8e3b66350c7b23dc16e217e"
const scaleAwareFeedbackSha256 = "b3d7f936cc96d51f6f79e2a74339e36869b611ce5db7577f36d6faf8f516384e"
const foregroundDiagnosticSha256 = "c9d1fac06065fe3f6f777fd0f8d415f554a0d93b7cf0a0edc446276491785cb2"
const planPath = "research/NATIVE_ROLE_OBSERVATION_GRADIENT_PLAN.md"
const implementationRoots = [
	"research/evaluate-native-role-observation-gradient.ts",
	"research/native-role-observation-gradient-child.ts",
	"research/serve-native-role-observation-gradient-review.ts",
] as const
const implementationExtras = [
	"package.json",
	"pnpm-lock.yaml",
	planPath,
	"research/review/app.js",
	"research/review/index.html",
	"research/review/styles.css",
	"research/tests/native-role-observation-gradient-evaluation.test.ts",
	"research/tests/native-role-observation-gradient-extract.test.ts",
] as const

const roles: readonly RoleName[] = ["background", "foreground", "surface", "accent"]

type ChildResult = {
	schemaVersion: 1
	algorithmVersion: typeof NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION
	policySha256: typeof NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256
	source: { relativePath: string; bytes: number; sha256: string }
	context: NativeRoleObservationGradientExtractionContext
	resource: { elapsedMs: number; maximumRssBytes: number }
}

function gradientEvidenceChanged(first: GradientEvidence, second: GradientEvidence): boolean {
	return first.isGradient !== second.isGradient || first.confidence !== second.confidence ||
		first.coverage !== second.coverage || first.continuity !== second.continuity || first.coherence !== second.coherence
}

export function compareNativeRoleObservationGradientSpatial(first: Palette, second: Palette) {
	const exactChangedRoles = roles.filter((role) => !isDeepStrictEqual(first[role], second[role]))
	const materiallyChangedRoles = roles.filter((role) =>
		first[role].generated !== second[role].generated ||
		okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)) >
			NATIVE_ROLE_OBSERVATION_GRADIENT_MATERIAL_DISTANCE)
	const gradientDecisionChanged = first.gradient.isGradient !== second.gradient.isGradient
	const evidenceChanged = gradientEvidenceChanged(first.gradient, second.gradient)
	return {
		exactChanged: exactChangedRoles.length > 0 || evidenceChanged,
		materiallyChanged: materiallyChangedRoles.length > 0 || gradientDecisionChanged,
		exactChangedRoles,
		materiallyChangedRoles,
		gradientDecisionChanged,
		gradientEvidenceChanged: evidenceChanged,
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

export function parseNativeRoleObservationGradientArguments(arguments_: readonly string[]) {
	if ((arguments_.length !== 2 && arguments_.length !== 3) || arguments_[0] !== "--limit" ||
		!/^[1-9][0-9]*$/.test(arguments_[1]) ||
		(arguments_.length === 3 && arguments_[2] !== "--write" && arguments_[2] !== "--publish")) {
		throw new Error("Usage: evaluate-native-role-observation-gradient.ts --limit <1..37> [--write|--publish]")
	}
	const limit = Number(arguments_[1])
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new Error("--limit must be between 1 and 37")
	const write = arguments_[2] === "--write"
	const publish = arguments_[2] === "--publish"
	if ((write || publish) && limit !== 37) throw new Error("Writing or publication requires the complete 37-source development cohort")
	return { limit, write, publish }
}

async function checkedCorpus(path: string, expectedSha256: string): Promise<CorpusResult> {
	const bytes = await readFile(path)
	if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error(`Frozen corpus changed: ${path}`)
	const corpus = JSON.parse(bytes.toString("utf8")) as CorpusResult
	if (corpus.entries.length !== 37) throw new Error(`Expected 37 sources in ${path}`)
	return corpus
}

async function runChild(projectRoot: string, relativePath: string): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./native-role-observation-gradient-child.ts", import.meta.url))
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, relativePath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), NATIVE_ROLE_OBSERVATION_GRADIENT_CHILD_TIMEOUT_MS)
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
				rejectChild(new Error(`Native-role observation-gradient child failed (${code ?? signal ?? "unknown"}): ${stderr.trim()}`))
				return
			}
			try {
				const parsed = JSON.parse(stdout) as ChildResult
				if (parsed.schemaVersion !== 1 || parsed.algorithmVersion !== NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION ||
					parsed.policySha256 !== NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256 || parsed.source.relativePath !== relativePath) {
					throw new Error("Native-role observation-gradient child identity is invalid")
				}
				resolveChild(parsed)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

function nativeOutputPreserved(treatment: ExtractionResult, raw: ExtractionResult): boolean {
	return roles.every((role) => isDeepStrictEqual(treatment.methods.spatial[role], raw.methods.spatial[role])) &&
		treatment.methods.spatial.score === raw.methods.spatial.score &&
		isDeepStrictEqual(treatment.methods.spatial.metrics, raw.methods.spatial.metrics) &&
		isDeepStrictEqual(treatment.methods.expressive, raw.methods.expressive) &&
		isDeepStrictEqual(treatment.methods.quantized, raw.methods.quantized)
}

export async function evaluateNativeRoleObservationGradientDevelopment(
	limit: number,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 37) throw new RangeError("Development limit must be between 1 and 37")
	const [canonical, raw, scaleAware] = await Promise.all([
		checkedCorpus(resolve(projectRoot, "research/data/results.json"), NATIVE_ROLE_OBSERVATION_GRADIENT_BASELINE_SHA256),
		checkedCorpus(resolve(projectRoot,
			`research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID}/results.json`),
		NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_RESULTS_SHA256),
		checkedCorpus(resolve(projectRoot,
			`research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID}/results.json`),
		NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_RESULTS_SHA256),
	])
	const rawEntries = new Map(raw.entries.map((entry) => [entry.file, entry]))
	const scaleEntries = new Map(scaleAware.entries.map((entry) => [entry.file, entry]))
	const entries = []
	for (const [sourceIndex, canonicalEntry] of canonical.entries.slice(0, limit).entries()) {
		const rawEntry = rawEntries.get(canonicalEntry.file)
		const scaleEntry = scaleEntries.get(canonicalEntry.file)
		if (!rawEntry || !scaleEntry) throw new Error(`Missing predecessor result for ${canonicalEntry.file}`)
		const child = await runChild(projectRoot, `images/${canonicalEntry.file}`)
		if (!nativeOutputPreserved(child.context.extraction, rawEntry.extraction)) {
			throw new Error(`Native non-gradient output changed for ${canonicalEntry.file}`)
		}
		const treatment = child.context.extraction.methods.spatial
		entries.push({
			sourceIndex,
			file: canonicalEntry.file,
			kind: canonicalEntry.kind,
			review: canonicalEntry.review,
			source: child.source,
			canonicalComparison: compareNativeRoleObservationGradientSpatial(
				canonicalEntry.extraction.methods.spatial, treatment,
			),
			rawComparison: compareNativeRoleObservationGradientSpatial(rawEntry.extraction.methods.spatial, treatment),
			scaleAwareComparison: compareNativeRoleObservationGradientSpatial(scaleEntry.extraction.methods.spatial, treatment),
			canonicalGradientDisagreement:
				canonicalEntry.extraction.methods.spatial.gradient.isGradient !== treatment.gradient.isGradient,
			hardGateViolations: hardGateViolations(child.context.extraction),
			treatment: child.context.extraction,
			certificate: child.context.certificate,
			resource: child.resource,
		})
		process.stderr.write(`[${sourceIndex + 1}/${limit}] ${canonicalEntry.file}\n`)
	}
	const bird = entries.find((entry) => entry.file === "birdsofprey.jpg")
	const krafty = entries.find((entry) => entry.file === "krafty.jpg")
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		policy: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY,
		policySha256: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
		execution: { sourceCount: entries.length, fullDevelopmentSourceCount: 37, limited: entries.length !== 37 },
		summary: {
			canonicalMateriallyChangedSources: entries.filter((entry) => entry.canonicalComparison.materiallyChanged).length,
			rawMateriallyChangedSources: entries.filter((entry) => entry.rawComparison.materiallyChanged).length,
			scaleAwareMateriallyChangedSources: entries.filter((entry) => entry.scaleAwareComparison.materiallyChanged).length,
			rawExactRoleChanges: entries.filter((entry) => entry.rawComparison.exactChangedRoles.length > 0).length,
			rawGradientDecisionChanges: entries.filter((entry) => entry.rawComparison.gradientDecisionChanged).length,
			rawGradientEvidenceChanges: entries.filter((entry) => entry.rawComparison.gradientEvidenceChanged).length,
			canonicalGradientDisagreements: entries.filter((entry) => entry.canonicalGradientDisagreement).length,
			hardGateViolationSources: entries.filter((entry) => entry.hardGateViolations.length > 0).length,
			reviewQueueSources: entries.filter((entry) => entry.review && entry.canonicalComparison.materiallyChanged).length,
			birdsofpreyGradientCorrected: bird === undefined ? null : bird.certificate.gradient.native.isGradient === false &&
				bird.certificate.gradient.observation.isGradient === true,
			kraftyGradientCorrected: krafty === undefined ? null : krafty.certificate.gradient.native.isGradient === true &&
				krafty.certificate.gradient.observation.isGradient === false,
			maximumRssBytes: Math.max(...entries.map((entry) => entry.resource.maximumRssBytes)),
			maximumElapsedMs: Math.max(...entries.map((entry) => entry.resource.elapsedMs)),
		},
		entries,
	}
}

type DevelopmentResult = Awaited<ReturnType<typeof evaluateNativeRoleObservationGradientDevelopment>>

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

async function buildImplementationClosure(projectRoot: string) {
	const pending: string[] = [...implementationRoots]
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
	const extras = await Promise.all(implementationExtras.map(async (path) => ({
		path,
		rawSha256: sha256(await readFile(resolve(projectRoot, ...path.split("/")))),
	})))
	return {
		version: "native-role-observation-gradient-static-import-closure-v1" as const,
		roots: [...implementationRoots],
		extras: [...implementationExtras],
		files: [...runtimeFiles].map(([path, rawSha256]) => ({ path, rawSha256 })).concat(extras)
			.sort((first, second) => first.path.localeCompare(second.path, "en")),
	}
}

function buildProtocol(planSha256: string, implementationSha256: string) {
	return {
		schemaVersion: 1 as const,
		experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		plan: { path: planPath, sha256: planSha256 },
		diagnosticBasis: {
			path: "research/data/scale-aware-native-foreground-diagnostics.json",
			sha256: foregroundDiagnosticSha256,
			roleInInference: "none",
		},
		canonicalComparator: {
			algorithmVersion: "region-graph-0.19.0",
			path: "research/data/results.json",
			sha256: NATIVE_ROLE_OBSERVATION_GRADIENT_BASELINE_SHA256,
			roleInInference: "none",
		},
		predecessors: {
			rawNative: {
				experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID,
				resultsSha256: NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_RESULTS_SHA256,
				reviewManifestSha256: rawReviewManifestSha256,
				feedbackSha256: rawFeedbackSha256,
			},
			scaleAwareNative: {
				experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID,
				resultsSha256: NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_RESULTS_SHA256,
				reviewManifestSha256: scaleAwareReviewManifestSha256,
				feedbackSha256: scaleAwareFeedbackSha256,
			},
		},
		treatment: {
			algorithmVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
			policy: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY,
			policySha256: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
		},
		difference: { materialOklabDistance: NATIVE_ROLE_OBSERVATION_GRADIENT_MATERIAL_DISTANCE },
		execution: {
			sourceCount: 37,
			childTimeoutMs: NATIVE_ROLE_OBSERVATION_GRADIENT_CHILD_TIMEOUT_MS,
			childMaximumRssBytes: 1_073_741_824,
		},
		review: {
			identity: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID,
			presentationVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_PRESENTATION_VERSION,
			method: "spatial",
			exactRenderedPriorPairCarryOnly: true,
		},
		implementation: {
			version: "native-role-observation-gradient-static-import-closure-v1",
			method: "recursive-local-static-import-closure-plus-declared-extras",
			sha256: implementationSha256,
		},
	}
}

function scientificProjection(protocol: ReturnType<typeof buildProtocol>, result: DevelopmentResult) {
	return {
		protocol,
		entries: result.entries.map((entry) => ({
			sourceIndex: entry.sourceIndex,
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			source: entry.source,
			certificate: entry.certificate,
			extraction: semanticExtraction(entry.treatment),
		})),
	}
}

function treatmentResults(result: DevelopmentResult, generatedAt: string): CorpusResult {
	return {
		generatedAt,
		algorithmVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
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

type PriorFeedback = {
	id: string
	image: string
	preference: "left" | "right" | "tie"
	ship: "left" | "right" | "both" | "neither"
	pairSha256: string
	sourceSha256: string
	presentationVersion: number
}

type PriorJudgment = {
	file: string
	sourceSha256: string
	priorExperimentId: string
	priorFeedbackId: string
	priorPairSha256: string
	preference: "canonical" | "treatment" | "tie"
	canonicalShippable: boolean
	treatmentShippable: boolean
	treatmentPayload: ReturnType<typeof renderedSpatialPayload>
}

function normalizedFeedbackJudgment(
	file: string,
	sourceSha256: string,
	experimentId: string,
	reviewEntry: {
		pairSha256: string
		sourceSha256: string
		left: "baseline" | "canonical" | "treatment"
		right: "baseline" | "canonical" | "treatment"
	},
	feedback: PriorFeedback,
	treatmentPayload: ReturnType<typeof renderedSpatialPayload>,
): PriorJudgment {
	if (reviewEntry.sourceSha256 !== sourceSha256 || feedback.sourceSha256 !== sourceSha256 ||
		feedback.pairSha256 !== reviewEntry.pairSha256 || feedback.image !== file ||
		feedback.presentationVersion !== NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_PRESENTATION_VERSION) {
		throw new Error(`Prior feedback provenance mismatch for ${file}`)
	}
	const identityAt = (side: "left" | "right"): "canonical" | "treatment" =>
		reviewEntry[side] === "treatment" ? "treatment" : "canonical"
	return {
		file,
		sourceSha256,
		priorExperimentId: experimentId,
		priorFeedbackId: feedback.id,
		priorPairSha256: feedback.pairSha256,
		preference: feedback.preference === "tie" ? "tie" : identityAt(feedback.preference),
		canonicalShippable: feedback.ship === "both" ||
			(feedback.ship !== "neither" && identityAt(feedback.ship) === "canonical"),
		treatmentShippable: feedback.ship === "both" ||
			(feedback.ship !== "neither" && identityAt(feedback.ship) === "treatment"),
		treatmentPayload,
	}
}

function buildPriorJudgments(
	raw: CorpusResult,
	scaleAware: CorpusResult,
	rawReview: { entries: Array<{ file: string; sourceSha256: string; pairSha256: string; left: "baseline" | "treatment"; right: "baseline" | "treatment" }> },
	rawFeedback: { entries: PriorFeedback[] },
	scaleReview: {
		carried: Array<Omit<PriorJudgment, "priorExperimentId" | "treatmentPayload">>
		entries: Array<{ file: string; sourceSha256: string; pairSha256: string; left: "canonical" | "treatment"; right: "canonical" | "treatment" }>
	},
	scaleFeedback: { entries: PriorFeedback[] },
): { raw: Map<string, PriorJudgment>; scaleAware: Map<string, PriorJudgment> } {
	const rawResults = new Map(raw.entries.map((entry) => [entry.file, entry]))
	const scaleResults = new Map(scaleAware.entries.map((entry) => [entry.file, entry]))
	const rawFeedbackByFile = new Map(rawFeedback.entries.map((entry) => [entry.image, entry]))
	const scaleFeedbackByFile = new Map(scaleFeedback.entries.map((entry) => [entry.image, entry]))
	const rawJudgments = new Map<string, PriorJudgment>()
	for (const review of rawReview.entries) {
		const result = rawResults.get(review.file)
		const feedback = rawFeedbackByFile.get(review.file)
		if (!result || !feedback) throw new Error(`Missing raw-native prior evidence for ${review.file}`)
		rawJudgments.set(review.file, normalizedFeedbackJudgment(
			review.file, review.sourceSha256, NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID,
			review, feedback, renderedSpatialPayload(result.extraction.methods.spatial),
		))
	}
	const scaleJudgments = new Map<string, PriorJudgment>()
	for (const carried of scaleReview.carried) {
		const result = scaleResults.get(carried.file)
		if (!result) throw new Error(`Missing scale-aware carried result for ${carried.file}`)
		scaleJudgments.set(carried.file, {
			...carried,
			priorExperimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID,
			treatmentPayload: renderedSpatialPayload(result.extraction.methods.spatial),
		})
	}
	for (const review of scaleReview.entries) {
		const result = scaleResults.get(review.file)
		const feedback = scaleFeedbackByFile.get(review.file)
		if (!result || !feedback) throw new Error(`Missing scale-aware prior evidence for ${review.file}`)
		scaleJudgments.set(review.file, normalizedFeedbackJudgment(
			review.file, review.sourceSha256, NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID,
			review, feedback, renderedSpatialPayload(result.extraction.methods.spatial),
		))
	}
	return { raw: rawJudgments, scaleAware: scaleJudgments }
}

function buildReviewManifest(
	result: DevelopmentResult,
	canonical: CorpusResult,
	prior: ReturnType<typeof buildPriorJudgments>,
	scientificIdentitySha256: string,
) {
	const canonicalEntries = new Map(canonical.entries.map((entry) => [entry.file, entry]))
	const carried = []
	const queued = []
	for (const entry of result.entries) {
		if (!entry.review || !entry.canonicalComparison.materiallyChanged) continue
		const canonicalEntry = canonicalEntries.get(entry.file)
		if (!canonicalEntry) throw new Error(`Missing canonical review comparator for ${entry.file}`)
		const treatmentPayload = renderedSpatialPayload(entry.treatment.methods.spatial)
		const priorJudgment = [prior.scaleAware.get(entry.file), prior.raw.get(entry.file)].find((judgment) =>
			judgment !== undefined && judgment.sourceSha256 === entry.source.sha256 &&
			JSON.stringify(judgment.treatmentPayload) === JSON.stringify(treatmentPayload))
		if (priorJudgment) {
			const { treatmentPayload: _treatmentPayload, ...carry } = priorJudgment
			carried.push(carry)
			continue
		}
		const assignmentSha256 = sha256(
			`${NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID}\0${scientificIdentitySha256}\0${entry.source.relativePath}`,
		)
		const canonicalOnLeft = Number.parseInt(assignmentSha256.slice(0, 2), 16) < 128
		queued.push({
			queueIndex: 0,
			file: entry.file,
			sourceRelativePath: entry.source.relativePath,
			sourceSha256: entry.source.sha256,
			pairSha256: sha256(JSON.stringify({
				reviewIdentity: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID,
				scientificIdentitySha256,
				file: entry.file,
				sourceSha256: entry.source.sha256,
				canonical: canonicalEntry.extraction.methods.spatial,
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
		experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		reviewIdentity: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID,
		presentationVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_PRESENTATION_VERSION,
		scientificIdentitySha256,
		method: "spatial" as const,
		eligiblePairCount: carried.length + entries.length,
		carriedCount: carried.length,
		queueCount: entries.length,
		carried,
		entries,
	}
}

async function readArtifactInputs(projectRoot: string) {
	const paths = {
		canonical: "research/data/results.json",
		rawResults: `research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID}/results.json`,
		rawReview: `research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_EXPERIMENT_ID}/review-manifest.json`,
		rawFeedback: "research/data/native-resolution-review-feedback.json",
		scaleResults: `research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID}/results.json`,
		scaleReview: `research/data/experiments/${NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_EXPERIMENT_ID}/review-manifest.json`,
		scaleFeedback: "research/data/scale-aware-native-review-feedback.json",
		diagnostic: "research/data/scale-aware-native-foreground-diagnostics.json",
	} as const
	const sources = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) =>
		[name, await readFile(resolve(projectRoot, path))] as const))) as Record<keyof typeof paths, Buffer>
	const expected = {
		canonical: NATIVE_ROLE_OBSERVATION_GRADIENT_BASELINE_SHA256,
		rawResults: NATIVE_ROLE_OBSERVATION_GRADIENT_RAW_RESULTS_SHA256,
		rawReview: rawReviewManifestSha256,
		rawFeedback: rawFeedbackSha256,
		scaleResults: NATIVE_ROLE_OBSERVATION_GRADIENT_SCALE_AWARE_RESULTS_SHA256,
		scaleReview: scaleAwareReviewManifestSha256,
		scaleFeedback: scaleAwareFeedbackSha256,
		diagnostic: foregroundDiagnosticSha256,
	}
	for (const [name, digest] of Object.entries(expected)) {
		if (sha256(sources[name as keyof typeof paths]) !== digest) throw new Error(`Artifact input changed: ${name}`)
	}
	return {
		canonical: JSON.parse(sources.canonical.toString("utf8")) as CorpusResult,
		raw: JSON.parse(sources.rawResults.toString("utf8")) as CorpusResult,
		rawReview: JSON.parse(sources.rawReview.toString("utf8")) as Parameters<typeof buildPriorJudgments>[2],
		rawFeedback: JSON.parse(sources.rawFeedback.toString("utf8")) as Parameters<typeof buildPriorJudgments>[3],
		scaleAware: JSON.parse(sources.scaleResults.toString("utf8")) as CorpusResult,
		scaleReview: JSON.parse(sources.scaleReview.toString("utf8")) as Parameters<typeof buildPriorJudgments>[4],
		scaleFeedback: JSON.parse(sources.scaleFeedback.toString("utf8")) as Parameters<typeof buildPriorJudgments>[5],
	}
}

async function buildArtifact(result: DevelopmentResult, projectRoot: string, generatedAt = new Date().toISOString()) {
	if (result.execution.limited || result.entries.length !== 37 || result.summary.hardGateViolationSources !== 0 ||
		result.summary.rawExactRoleChanges !== 0 || result.summary.canonicalGradientDisagreements > 1 ||
		result.summary.birdsofpreyGradientCorrected !== true || result.summary.kraftyGradientCorrected !== true) {
		throw new Error("Only a complete gate-clean native-role observation-gradient result can be published")
	}
	const inputs = await readArtifactInputs(projectRoot)
	const implementation = await buildImplementationClosure(projectRoot)
	const planSource = await readFile(resolve(projectRoot, planPath))
	const protocol = buildProtocol(sha256(planSource), sha256(JSON.stringify(implementation)))
	const scientificIdentitySha256 = sha256(JSON.stringify(scientificProjection(protocol, result)))
	const prior = buildPriorJudgments(
		inputs.raw, inputs.scaleAware, inputs.rawReview, inputs.rawFeedback, inputs.scaleReview, inputs.scaleFeedback,
	)
	const results = treatmentResults(result, generatedAt)
	const reviewManifest = buildReviewManifest(result, inputs.canonical, prior, scientificIdentitySha256)
	if (reviewManifest.carriedCount !== 21 || reviewManifest.queueCount !== 4) {
		throw new Error(`Expected 21 carried and 4 queued review pairs, got ${reviewManifest.carriedCount} and ${reviewManifest.queueCount}`)
	}
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
		experimentId: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		generatedAt,
		scientificIdentitySha256,
		canonicalComparator: protocol.canonicalComparator,
		predecessors: protocol.predecessors,
		treatment: protocol.treatment,
		review: {
			identity: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID,
			presentationVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_PRESENTATION_VERSION,
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

export async function verifyNativeRoleObservationGradientArtifact(
	artifactDirectory: string,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	const metadata = await lstat(artifactDirectory)
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(artifactDirectory) !== resolve(artifactDirectory)) {
		throw new Error("Native-role observation-gradient artifact must be a physical directory")
	}
	const names = (await readdir(artifactDirectory)).sort()
	if (JSON.stringify(names) !== JSON.stringify([...NATIVE_ROLE_OBSERVATION_GRADIENT_ARTIFACT_FILES].sort())) {
		throw new Error("Artifact file set is invalid")
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
	if (!isRecord(manifestValue) || manifestValue.schemaVersion !== 1 ||
		manifestValue.experimentId !== NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION ||
		typeof manifestValue.scientificIdentitySha256 !== "string" || !isRecord(manifestValue.artifactHashes) ||
		!isRecord(manifestValue.implementation) || !isRecord(manifestValue.sourceFiles)) throw new Error("Manifest header is invalid")
	for (const name of NATIVE_ROLE_OBSERVATION_GRADIENT_ARTIFACT_FILES.filter((name) => name !== "manifest.json")) {
		if (manifestValue.artifactHashes[name] !== sha256(sources[name])) throw new Error(`Artifact hash mismatch: ${name}`)
	}
	const inputs = await readArtifactInputs(projectRoot)
	const implementation = await buildImplementationClosure(projectRoot)
	if (JSON.stringify(manifestValue.implementation) !== JSON.stringify(implementation)) throw new Error("Implementation closure mismatch")
	const planSource = await readFile(resolve(projectRoot, planPath))
	const expectedProtocol = buildProtocol(sha256(planSource), sha256(JSON.stringify(implementation)))
	if (JSON.stringify(parsed["protocol.json"]) !== JSON.stringify(expectedProtocol)) throw new Error("Protocol mismatch")
	const comparisonValue = parsed["comparison.json"]
	if (!isRecord(comparisonValue) || comparisonValue.experimentId !== NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION ||
		!isRecord(comparisonValue.execution) || comparisonValue.execution.limited !== false ||
		!Array.isArray(comparisonValue.entries) || comparisonValue.entries.length !== 37) throw new Error("Comparison is incomplete")
	const comparison = comparisonValue as DevelopmentResult
	const scientificIdentitySha256 = sha256(JSON.stringify(scientificProjection(expectedProtocol, comparison)))
	if (manifestValue.scientificIdentitySha256 !== scientificIdentitySha256) throw new Error("Scientific identity mismatch")
	const prior = buildPriorJudgments(
		inputs.raw, inputs.scaleAware, inputs.rawReview, inputs.rawFeedback, inputs.scaleReview, inputs.scaleFeedback,
	)
	const expectedReview = buildReviewManifest(comparison, inputs.canonical, prior, scientificIdentitySha256)
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

export async function publishNativeRoleObservationGradientArtifact(
	result: DevelopmentResult,
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<string> {
	const experimentsRoot = resolve(projectRoot, "research/data/experiments")
	const rootMetadata = await lstat(experimentsRoot)
	if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || await realpath(experimentsRoot) !== experimentsRoot) {
		throw new Error("Experiment root must be a physical directory")
	}
	const finalDirectory = join(experimentsRoot, NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION)
	try {
		await lstat(finalDirectory)
		throw new Error(`Refusing to overwrite existing artifact: ${finalDirectory}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
	const stagingDirectory = join(experimentsRoot,
		`.${NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION}.staging-${randomUUID()}`)
	await mkdir(stagingDirectory, { recursive: false, mode: 0o700 })
	try {
		const artifact = await buildArtifact(result, projectRoot)
		for (const name of NATIVE_ROLE_OBSERVATION_GRADIENT_ARTIFACT_FILES) {
			await writeFile(join(stagingDirectory, name), artifact[name], { encoding: "utf8", flag: "wx", mode: 0o600 })
		}
		await verifyNativeRoleObservationGradientArtifact(stagingDirectory, projectRoot)
		await rename(stagingDirectory, finalDirectory)
		await verifyNativeRoleObservationGradientArtifact(finalDirectory, projectRoot)
		return finalDirectory
	} catch (error) {
		for (const name of NATIVE_ROLE_OBSERVATION_GRADIENT_ARTIFACT_FILES) {
			try {
				await import("node:fs/promises").then(({ unlink }) => unlink(join(stagingDirectory, name)))
			} catch {}
		}
		try {
			await import("node:fs/promises").then(({ rmdir }) => rmdir(stagingDirectory))
		} catch {}
		throw error
	}
}

async function main(): Promise<void> {
	const { limit, write, publish } = parseNativeRoleObservationGradientArguments(process.argv.slice(2))
	const projectRoot = fileURLToPath(new URL("..", import.meta.url))
	const result = await evaluateNativeRoleObservationGradientDevelopment(limit, projectRoot)
	if (publish) {
		process.stdout.write(`${await publishNativeRoleObservationGradientArtifact(result, projectRoot)}\n`)
		return
	}
	if (write) {
		await writeFile(resolve(projectRoot, NATIVE_ROLE_OBSERVATION_GRADIENT_DEVELOPMENT_PATH),
			`${JSON.stringify(result, null, 2)}\n`)
		process.stdout.write(`${NATIVE_ROLE_OBSERVATION_GRADIENT_DEVELOPMENT_PATH}\n`)
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
