import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import type { Candidate } from "./src/candidates.ts"
import { buildCandidateComparisonReport, roleNames } from "./src/candidate-comparison.ts"
import { validateCandidateArtifacts } from "./src/candidate-validation.ts"
import { contrastRatio, okDistance, rgbToOKLab } from "./src/color.ts"
import { validateCurationStore, type CurationStore } from "./src/corpus-curation.ts"
import { validateSelectionManifest, type SelectionManifest } from "./src/corpus-selection.ts"
import {
	FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
	FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION,
	extractForegroundContrastFloorPaletteWithContext,
	type ForegroundContrastFloorCertificate,
} from "./src/foreground-contrast-floor-extract.ts"
import { FOREGROUND_CONTRAST_ALGORITHM_VERSION } from "./src/foreground-contrast-extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE,
	DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
	hasStrongTypographyEvidence,
	resolveForegroundBackgroundRequirement,
	resolveForegroundSurfaceRequirement,
	resolveSourceForegroundPreferenceMinimum,
	sourceForegroundIsPreferred,
} from "./src/foreground-contrast.ts"
import { loadImage } from "./src/image.ts"
import { parsePaletteRole00AuditFeedbackStore, parsePaletteRole00AuditManifest } from "./src/palette-role-00-audit.ts"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "foreground-contrast-0.2.0-poc.2-development"
const PRIOR_EXPERIMENT_VERSION = "foreground-contrast-0.1.0-poc.1-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputRoot = join(projectRoot, "research/data/experiments", EXPERIMENT_VERSION)
const profile = DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE
const maximumCanonical00ChangesForReview = 20
const substantialAcceptedChangeShare = 0.1
const inputFiles = {
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	selection: "research/data/selection.json",
	curation: "research/data/curation.json",
	absoluteFeedback: "research/data/absolute-feedback.json",
	auditManifest: "research/data/experiments/palette-role-00-audit-0.2.0-development/manifest.json",
	auditFeedback: "research/data/experiments/palette-role-00-audit-0.2.0-development/feedback.json",
	auditAnalysis: "research/data/experiments/palette-role-00-audit-0.2.0-development/analysis-complete.json",
	auditInterpretation: "research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json",
	priorManifest: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/manifest.json`,
	priorBaselineDevelopment: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/baseline-results.json`,
	priorBaseline00: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/baseline-00-results.json`,
	priorCandidateDevelopment: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/candidate-results.json`,
	priorCandidate00: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/candidate-00-results.json`,
	priorCertificates: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/candidate-certificates.json`,
	priorAnalysis: `research/data/experiments/${PRIOR_EXPERIMENT_VERSION}/analysis.json`,
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"gradientDetection.ts",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/foreground-contrast.ts",
	"research/src/palette.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/region-graph-0.17-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/foreground-contrast-extract.ts",
	"research/src/foreground-contrast-floor-extract.ts",
	"research/src/extract.ts",
	"research/src/candidate-validation.ts",
	"research/src/candidate-comparison.ts",
	"research/src/corpus-selection.ts",
	"research/src/corpus-curation.ts",
	"research/src/palette-role-00-audit.ts",
	"research/evaluate-foreground-contrast-floor.ts",
] as const

type Cohort = "development" | "00"
type CorpusEntry = CorpusResult["entries"][number]
type Task = {
	cohort: Cohort
	file: string
	sourcePath: string
	expectedSourceSha256: string | null
	baseline: CorpusEntry
}
type GateAssessment = {
	foregroundKind: "generated" | "ordinary" | "strong-typography"
	foregroundBackground: { actual: number; required: number; pass: boolean }
	foregroundSurface: { actual: number; required: number; pass: boolean }
	sourcePreference: { required: number; pass: boolean }
	violations: string[]
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { path: string; sha256: string; bytes: number }
	entry: CorpusEntry
	certificate: ForegroundContrastFloorCertificate
	gates: GateAssessment
}
type MaterialEntry = {
	cohort: Cohort
	file: string
	roles: RoleName[]
	gradient: boolean
	baseline: ReturnType<typeof paletteSnapshot>
	candidate: ReturnType<typeof paletteSnapshot>
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function candidateKey(candidate: Candidate): string {
	return `${candidate.hex.toLowerCase()}${candidate.generated ? "!" : ""}:${candidate.typographyOnly ? "t" : "g"}:${candidate.id}`
}

function selectedCandidate(candidates: readonly Candidate[], palette: Palette): Candidate | null {
	if (palette.foreground.generated) return null
	return [...candidates].filter((candidate) => sameRgb(candidate.rgb, palette.foreground.rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || candidateKey(first).localeCompare(candidateKey(second), "en"))[0] ?? null
}

function roleSolverCandidates(
	candidates: readonly Candidate[],
	certificate: ForegroundContrastFloorCertificate,
): Candidate[] {
	const chromatic = certificate.underlyingChromaticCertificate
	const supplements = new Set(chromatic.availability.supplements.map((supplement) => supplement.id))
	const admitted = new Set(chromatic.decision.admittedSupplementIds)
	return candidates.filter((candidate) => !supplements.has(candidate.id) || admitted.has(candidate.id))
}

function sourceForegroundPool(candidates: readonly Candidate[], background: RGB): Candidate[] {
	const preference = resolveSourceForegroundPreferenceMinimum(profile)
	const eligible = candidates.filter((candidate) => !sameRgb(candidate.rgb, background) &&
		contrastRatio(candidate.rgb, background) >= resolveForegroundBackgroundRequirement(candidate, profile))
	const preferred = candidates.some((candidate) => !sameRgb(candidate.rgb, background) &&
		contrastRatio(candidate.rgb, background) >= preference)
	return preferred
		? eligible.filter((candidate) => sourceForegroundIsPreferred(
			candidate, contrastRatio(candidate.rgb, background), profile,
		))
		: eligible
}

function assessGates(
	palette: Palette,
	candidates: readonly Candidate[],
	certificate: ForegroundContrastFloorCertificate,
): GateAssessment {
	const roleCandidates = roleSolverCandidates(candidates, certificate)
	const foreground = selectedCandidate(roleCandidates, palette)
	const evidence = foreground ?? { generated: true, population: 0, text: 0, saliency: 0 }
	const foregroundBackground = contrastRatio(palette.foreground.rgb, palette.background.rgb)
	const foregroundSurface = contrastRatio(palette.foreground.rgb, palette.surface.rgb)
	const backgroundRequired = resolveForegroundBackgroundRequirement(evidence, profile)
	const surfaceRequired = resolveForegroundSurfaceRequirement(evidence, {
		foregroundBackgroundContrast: foregroundBackground,
		allowRepresentativeSurface: false,
	}, profile)
	const pool = sourceForegroundPool(roleCandidates, palette.background.rgb)
	const sourcePreferencePass = foreground ? pool.includes(foreground) : pool.length === 0
	const violations: string[] = []
	if (foregroundBackground < backgroundRequired) violations.push("foreground-background")
	if (foregroundSurface < surfaceRequired) violations.push("foreground-surface")
	if (!sourcePreferencePass) violations.push("source-foreground-preference")
	return {
		foregroundKind: foreground === null
			? "generated"
			: hasStrongTypographyEvidence(foreground) ? "strong-typography" : "ordinary",
		foregroundBackground: {
			actual: foregroundBackground,
			required: backgroundRequired,
			pass: foregroundBackground >= backgroundRequired,
		},
		foregroundSurface: {
			actual: foregroundSurface,
			required: surfaceRequired,
			pass: foregroundSurface >= surfaceRequired,
		},
		sourcePreference: { required: resolveSourceForegroundPreferenceMinimum(profile), pass: sourcePreferencePass },
		violations,
	}
}

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	if (task.cohort === "development") {
		if (task.file !== basename(task.file) || task.sourcePath !== join(projectRoot, "images", task.file)) {
			throw new Error(`Invalid bound development source path: ${task.file}`)
		}
	} else if (!/^00\/[^/\\]+$/.test(task.file) || task.sourcePath !== join(projectRoot, task.file)) {
		throw new Error(`Invalid bound 00 source path: ${task.file}`)
	}
	const bytes = await readFile(task.sourcePath)
	const sourceSha256 = sha256(bytes)
	if (task.expectedSourceSha256 && sourceSha256 !== task.expectedSourceSha256) {
		throw new Error(`Bound source hash changed for ${task.file}`)
	}
	const image = await loadImage(bytes)
	if (image.width !== task.baseline.width || image.height !== task.baseline.height) {
		throw new Error(`Normalized source dimensions changed for ${task.file}`)
	}
	const canonical = extractPalette(image)
	if (!isDeepStrictEqual(scientificExtraction(canonical), scientificExtraction(task.baseline.extraction))) {
		throw new Error(`No-option canonical scientific output changed for ${task.file}`)
	}
	const candidate = extractForegroundContrastFloorPaletteWithContext(image)
	if (!isDeepStrictEqual(candidate.extraction.methods.expressive, task.baseline.extraction.methods.expressive) ||
		!isDeepStrictEqual(candidate.extraction.methods.quantized, task.baseline.extraction.methods.quantized) ||
		!isDeepStrictEqual(candidate.extraction.candidates, task.baseline.extraction.candidates)) {
		throw new Error(`Candidate changed frozen non-spatial output or candidate diagnostics for ${task.file}`)
	}
	const entry: CorpusEntry = {
		file: task.file,
		kind: task.baseline.kind,
		review: task.baseline.review,
		width: task.baseline.width,
		height: task.baseline.height,
		extraction: candidate.extraction,
	}
	return {
		cohort: task.cohort,
		file: task.file,
		source: {
			path: task.cohort === "development" ? `images/${task.file}` : task.file,
			sha256: sourceSha256,
			bytes: bytes.byteLength,
		},
		entry,
		certificate: candidate.certificate,
		gates: assessGates(candidate.extraction.methods.spatial, candidate.candidates, candidate.certificate),
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const task of tasks) {
		results.push(await evaluateTask(task))
		parentPort?.postMessage({ progress: 1 })
	}
	return results
}

async function runParallel(tasks: Task[]): Promise<WorkerResult[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 10 === 0 || completed === tasks.length) {
					process.stderr.write(`foreground contrast floor evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Foreground contrast floor worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`foreground contrast floor evaluation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort, "en") ||
		first.file.localeCompare(second.file, "en"))
}

function materialChanges(baseline: Palette, candidate: Palette): { roles: RoleName[]; gradient: boolean } {
	return {
		roles: roleNames.filter((role) =>
			okDistance(rgbToOKLab(baseline[role].rgb), rgbToOKLab(candidate[role].rgb)) > 0.025),
		gradient: baseline.gradient.isGradient !== candidate.gradient.isGradient,
	}
}

function paletteSnapshot(palette: Palette) {
	return {
		roles: Object.fromEntries(roleNames.map((role) => [role, {
			hex: palette[role].hex,
			generated: palette[role].generated,
		}])) as Record<RoleName, { hex: string; generated: boolean }>,
		gradient: palette.gradient.isGradient,
		foregroundBackgroundContrast: palette.metrics.foregroundContrast,
		foregroundSurfaceContrast: palette.metrics.foregroundSurfaceContrast,
	}
}

function corpusByFile(development: CorpusResult, holdout: CorpusResult): Map<string, CorpusEntry> {
	return new Map([...development.entries, ...holdout.entries].map((entry) => [entry.file, entry]))
}

function buildMaterialEntries(
	referenceDevelopment: CorpusResult,
	reference00: CorpusResult,
	candidateDevelopment: CorpusResult,
	candidate00: CorpusResult,
): MaterialEntry[] {
	const referenceByFile = corpusByFile(referenceDevelopment, reference00)
	return [
		...candidateDevelopment.entries.map((entry) => ({ cohort: "development" as const, entry })),
		...candidate00.entries.map((entry) => ({ cohort: "00" as const, entry })),
	].map(({ cohort, entry }) => {
		const baseline = referenceByFile.get(entry.file)?.extraction.methods.spatial
		if (!baseline) throw new Error(`Comparison reference is missing ${entry.file}`)
		const candidate = entry.extraction.methods.spatial
		const changes = materialChanges(baseline, candidate)
		return {
			cohort,
			file: entry.file,
			roles: changes.roles,
			gradient: changes.gradient,
			baseline: paletteSnapshot(baseline),
			candidate: paletteSnapshot(candidate),
		}
	}).filter((entry) => entry.roles.length > 0 || entry.gradient)
}

function roleChangeCounts(entries: readonly MaterialEntry[]): Record<RoleName, number> {
	return Object.fromEntries(roleNames.map((role) => [role,
		entries.filter((entry) => entry.roles.includes(role)).length])) as Record<RoleName, number>
}

function materialSummary(entries: MaterialEntry[]) {
	return {
		total: entries.length,
		development: entries.filter((entry) => entry.cohort === "development").length,
		canonical00: entries.filter((entry) => entry.cohort === "00").length,
		roleCounts: roleChangeCounts(entries),
		gradient: entries.filter((entry) => entry.gradient).length,
		entries,
	}
}

function minimum(entries: readonly CorpusEntry[], field: "foregroundContrast" | "foregroundSurfaceContrast") {
	return entries.map((entry) => ({ file: entry.file, value: entry.extraction.methods.spatial.metrics[field] }))
		.sort((first, second) => first.value - second.value || first.file.localeCompare(second.file, "en"))[0]
}

function minima(development: CorpusResult, holdout: CorpusResult) {
	return {
		development: {
			foregroundBackground: minimum(development.entries, "foregroundContrast"),
			foregroundSurface: minimum(development.entries, "foregroundSurfaceContrast"),
		},
		canonical00: {
			foregroundBackground: minimum(holdout.entries, "foregroundContrast"),
			foregroundSurface: minimum(holdout.entries, "foregroundSurfaceContrast"),
		},
		combined: {
			foregroundBackground: minimum([...development.entries, ...holdout.entries], "foregroundContrast"),
			foregroundSurface: minimum([...development.entries, ...holdout.entries], "foregroundSurfaceContrast"),
		},
	}
}

type ComparisonReport = ReturnType<typeof buildCandidateComparisonReport>

function conciseComparison(comparison: ComparisonReport) {
	return {
		coverage: comparison.coverage,
		accepted: {
			total: comparison.accepted.total,
			changedCount: comparison.accepted.changedCount,
			changedShare: comparison.accepted.changedCount / comparison.accepted.total,
			changedFiles: comparison.accepted.changedFiles,
		},
		rejected: {
			total: comparison.rejected.total,
			changedCount: comparison.rejected.changedCount,
			changedFiles: comparison.rejected.changedFiles,
		},
		unselected00: {
			total: comparison.unselectedHoldout.total,
			changedCount: comparison.unselectedHoldout.changedCount,
			changedFiles: comparison.unselectedHoldout.changedFiles,
		},
		development: {
			reviewable: {
				total: comparison.legacyResearch.reviewable.total,
				changedCount: comparison.legacyResearch.reviewable.changedCount,
				changedFiles: comparison.legacyResearch.reviewable.changedFiles,
			},
			diagnostics: {
				total: comparison.legacyResearch.diagnostics.total,
				changedCount: comparison.legacyResearch.diagnostics.changedCount,
				changedFiles: comparison.legacyResearch.diagnostics.changedFiles,
			},
		},
	}
}

function classifiedDelta(entries: MaterialEntry[], canonicalComparison: ComparisonReport) {
	const accepted = new Set(canonicalComparison.accepted.entries.map((entry) => entry.file))
	const rejected = new Set(canonicalComparison.rejected.entries.map((entry) => entry.file))
	const unselected = new Set(canonicalComparison.unselectedHoldout.entries.map((entry) => entry.file))
	const changed = (files: ReadonlySet<string>) => entries.filter((entry) => files.has(entry.file)).map((entry) => entry.file)
	const acceptedChanged = changed(accepted)
	const rejectedChanged = changed(rejected)
	const unselectedChanged = changed(unselected)
	const reviewableChanged = entries.filter((entry) => entry.cohort === "development" &&
		canonicalComparison.legacyResearch.reviewable.entries.some((candidate) => candidate.file === entry.file))
		.map((entry) => entry.file)
	const diagnosticChanged = entries.filter((entry) => entry.cohort === "development" &&
		canonicalComparison.legacyResearch.diagnostics.entries.some((candidate) => candidate.file === entry.file))
		.map((entry) => entry.file)
	return {
		accepted: { total: accepted.size, changedCount: acceptedChanged.length, changedFiles: acceptedChanged },
		rejected: { total: rejected.size, changedCount: rejectedChanged.length, changedFiles: rejectedChanged },
		unselected00: { total: unselected.size, changedCount: unselectedChanged.length, changedFiles: unselectedChanged },
		development: {
			reviewable: {
				total: canonicalComparison.legacyResearch.reviewable.total,
				changedCount: reviewableChanged.length,
				changedFiles: reviewableChanged,
			},
			diagnostics: {
				total: canonicalComparison.legacyResearch.diagnostics.total,
				changedCount: diagnosticChanged.length,
				changedFiles: diagnosticChanged,
			},
		},
	}
}

function changeSummary<T extends { file: string; materialChanges: { roles: RoleName[]; gradient: boolean } }>(entries: T[]) {
	const changed = entries.filter((entry) => entry.materialChanges.roles.length > 0 || entry.materialChanges.gradient)
	return {
		total: entries.length,
		changedCount: changed.length,
		changedFiles: changed.map((entry) => entry.file),
		roleCounts: Object.fromEntries(roleNames.map((role) => [role,
			changed.filter((entry) => entry.materialChanges.roles.includes(role)).length])) as Record<RoleName, number>,
		gradient: changed.filter((entry) => entry.materialChanges.gradient).length,
	}
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing foreground contrast floor experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-foreground-contrast-floor.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, {
		path: string
		raw: Buffer
		sha256: string
	}>
	const parseInput = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const baselineDevelopment = parseInput<CorpusResult>("canonicalDevelopment")
	const baseline00 = parseInput<CorpusResult>("canonical00")
	if (baselineDevelopment.algorithmVersion !== ALGORITHM_VERSION || baseline00.algorithmVersion !== ALGORITHM_VERSION ||
		ALGORITHM_VERSION !== FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION || baselineDevelopment.entries.length !== 37 ||
		baseline00.entries.length !== 355) throw new Error("Canonical 0.19 corpus bindings are invalid")

	const priorBaselineDevelopment = parseInput<CorpusResult>("priorBaselineDevelopment")
	const priorBaseline00 = parseInput<CorpusResult>("priorBaseline00")
	const priorCandidateDevelopment = parseInput<CorpusResult>("priorCandidateDevelopment")
	const priorCandidate00 = parseInput<CorpusResult>("priorCandidate00")
	if (!isDeepStrictEqual(priorBaselineDevelopment, baselineDevelopment) || !isDeepStrictEqual(priorBaseline00, baseline00) ||
		priorCandidateDevelopment.algorithmVersion !== FOREGROUND_CONTRAST_ALGORITHM_VERSION ||
		priorCandidate00.algorithmVersion !== FOREGROUND_CONTRAST_ALGORITHM_VERSION) {
		throw new Error("Frozen POC.1 artifacts do not bind the canonical corpora and wrapper version")
	}
	validateCandidateArtifacts(
		priorCandidateDevelopment,
		priorCandidate00,
		baselineDevelopment,
		baseline00,
		{ foregroundContrastProfile: DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE },
	)
	const priorManifest = parseInput<Record<string, unknown>>("priorManifest")
	const priorCertificates = parseInput<Record<string, unknown>>("priorCertificates")
	const priorAnalysis = parseInput<Record<string, unknown>>("priorAnalysis")
	if (priorManifest.experimentVersion !== PRIOR_EXPERIMENT_VERSION ||
		priorCertificates.algorithmVersion !== FOREGROUND_CONTRAST_ALGORITHM_VERSION ||
		priorAnalysis.experimentVersion !== PRIOR_EXPERIMENT_VERSION) {
		throw new Error("Frozen POC.1 provenance is invalid")
	}

	const selection = parseInput<SelectionManifest>("selection")
	const curation = parseInput<CurationStore>("curation")
	validateSelectionManifest(selection, baseline00, inputs.canonical00.sha256)
	validateCurationStore(selection, curation)
	const auditManifest = parsePaletteRole00AuditManifest(parseInput("auditManifest"))
	const auditFeedback = parsePaletteRole00AuditFeedbackStore(parseInput("auditFeedback"), auditManifest)
	if (auditManifest.provenance.canonicalHoldout.rawSha256 !== inputs.canonical00.sha256 ||
		auditManifest.entries.length !== 30 || auditFeedback.entries.length !== 30) {
		throw new Error("Frozen 00 audit does not bind the canonical corpus")
	}
	const auditAnalysis = parseInput<Record<string, unknown>>("auditAnalysis")
	const interpretation = parseInput<Record<string, unknown>>("auditInterpretation")
	const auditAnalysisProvenance = isRecord(auditAnalysis.provenance) ? auditAnalysis.provenance : null
	const interpretationProvenance = isRecord(interpretation.provenance) ? interpretation.provenance : null
	if (auditAnalysisProvenance?.manifestSha256 !== inputs.auditManifest.sha256 ||
		auditAnalysisProvenance.feedbackSha256 !== inputs.auditFeedback.sha256 ||
		auditAnalysisProvenance.canonicalHoldoutRawSha256 !== inputs.canonical00.sha256 ||
		interpretationProvenance?.analysisSha256 !== inputs.auditAnalysis.sha256 ||
		!Array.isArray(interpretation.commentInterpretations) || interpretation.commentInterpretations.length !== 12) {
		throw new Error("Frozen audit analysis and interpretation provenance is invalid")
	}

	const sourceHashes = new Map<string, string>()
	for (const track of Object.values(selection.tracks)) {
		for (const entry of track) {
			const current = sourceHashes.get(entry.file)
			if (current && current !== entry.sha256) throw new Error(`Selection source hashes disagree for ${entry.file}`)
			sourceHashes.set(entry.file, entry.sha256)
		}
	}
	if (baseline00.entries.some((entry) => !sourceHashes.has(entry.file))) {
		throw new Error("Selection does not bind every canonical 00 source path")
	}
	const tasks: Task[] = [
		...baselineDevelopment.entries.map((baseline) => ({
			cohort: "development" as const,
			file: baseline.file,
			sourcePath: join(projectRoot, "images", baseline.file),
			expectedSourceSha256: null,
			baseline,
		})),
		...baseline00.entries.map((baseline) => ({
			cohort: "00" as const,
			file: baseline.file,
			sourcePath: join(projectRoot, baseline.file),
			expectedSourceSha256: sourceHashes.get(baseline.file)!,
			baseline,
		})),
	]
	const results = await runParallel(tasks)
	const generatedAt = new Date().toISOString()
	const developmentResults = results.filter((result) => result.cohort === "development")
	const holdoutResults = results.filter((result) => result.cohort === "00")
	const candidateDevelopment: CorpusResult = {
		generatedAt,
		algorithmVersion: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
		entries: developmentResults.map((result) => result.entry),
	}
	const candidate00: CorpusResult = {
		generatedAt,
		algorithmVersion: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
		entries: holdoutResults.map((result) => result.entry),
	}
	const validation = validateCandidateArtifacts(
		candidateDevelopment,
		candidate00,
		baselineDevelopment,
		baseline00,
		{ foregroundContrastProfile: profile },
	)
	const absoluteFeedback = parseInput("absoluteFeedback")
	const comparison = buildCandidateComparisonReport({
		baselineResults: baselineDevelopment,
		baselineHoldoutResults: baseline00,
		baselineHoldoutSource: inputs.canonical00.raw,
		candidateResults: candidateDevelopment,
		candidateHoldoutResults: candidate00,
		selection,
		curation,
		absoluteFeedback,
	})
	const priorComparison = buildCandidateComparisonReport({
		baselineResults: baselineDevelopment,
		baselineHoldoutResults: baseline00,
		baselineHoldoutSource: inputs.canonical00.raw,
		candidateResults: priorCandidateDevelopment,
		candidateHoldoutResults: priorCandidate00,
		selection,
		curation,
		absoluteFeedback,
	})
	const againstCanonical = buildMaterialEntries(
		baselineDevelopment, baseline00, candidateDevelopment, candidate00,
	)
	const priorAgainstCanonical = buildMaterialEntries(
		baselineDevelopment, baseline00, priorCandidateDevelopment, priorCandidate00,
	)
	const againstPrior = buildMaterialEntries(
		priorCandidateDevelopment, priorCandidate00, candidateDevelopment, candidate00,
	)
	if (priorAgainstCanonical.length !== 166 ||
		priorAgainstCanonical.filter((entry) => entry.cohort === "00").length !== 150 ||
		roleChangeCounts(priorAgainstCanonical).foreground !== 151 || priorComparison.accepted.changedCount !== 44 ||
		priorComparison.accepted.total !== 95) {
		throw new Error("Frozen POC.1 breadth does not match its rejection basis")
	}
	const frozenPriorMaterial = isRecord(priorAnalysis.materialChanges) ? priorAnalysis.materialChanges : null
	if (frozenPriorMaterial?.total !== 166 || frozenPriorMaterial.canonical00 !== 150) {
		throw new Error("Frozen POC.1 analysis does not record the rejected breadth")
	}

	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: {
			algorithmVersion: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
			baselineAlgorithmVersion: FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION,
			profile,
			strictGradientSurfaceRecovery: false,
		},
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sources: results.map((result) => ({ cohort: result.cohort, ...result.source })),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const baselineByFile = corpusByFile(baselineDevelopment, baseline00)
	const priorByFile = corpusByFile(priorCandidateDevelopment, priorCandidate00)
	const candidateByFile = corpusByFile(candidateDevelopment, candidate00)
	const comparisonByFile = new Map<string, "accepted" | "rejected" | "unselected-00">([
		...comparison.accepted.entries.map((entry) => [entry.file, "accepted"] as const),
		...comparison.rejected.entries.map((entry) => [entry.file, "rejected"] as const),
		...comparison.unselectedHoldout.entries.map((entry) => [entry.file, "unselected-00"] as const),
	])
	const feedbackByCase = new Map(auditFeedback.entries.map((entry) => [entry.caseId, entry]))
	const interpretedByCase = new Map((interpretation.commentInterpretations as Array<Record<string, unknown>>)
		.map((entry) => [entry.caseId as string, entry]))
	const auditCases = auditManifest.entries.map((entry) => {
		const feedback = feedbackByCase.get(entry.caseId)!
		const frozenCohort = comparisonByFile.get(entry.source.file)
		if (!frozenCohort) throw new Error(`Audit file is absent from frozen 00 cohorts: ${entry.source.file}`)
		const baseline = baselineByFile.get(entry.source.file)!.extraction.methods.spatial
		const candidate = candidateByFile.get(entry.source.file)!.extraction.methods.spatial
		return {
			caseId: entry.caseId,
			order: entry.order,
			sampleTrack: entry.sampleTrack,
			file: entry.source.file,
			frozenCohort,
			judgment: { overallQuality: feedback.overallQuality, skipReason: feedback.skipReason },
			commented: feedback.comment.trim().length > 0,
			materialChanges: materialChanges(baseline, candidate),
			baseline: paletteSnapshot(baseline),
			candidate: paletteSnapshot(candidate),
		}
	})
	const commentedCases = auditCases.filter((entry) => entry.commented).map((entry) => {
		const interpretationEntry = interpretedByCase.get(entry.caseId)
		if (!interpretationEntry) throw new Error(`Commented audit case lacks frozen interpretation: ${entry.caseId}`)
		return {
			...entry,
			classifications: interpretationEntry.classifications,
			finding: interpretationEntry.finding,
			evidencePolicy: "qualitative-non-exclusive",
			targetColorsInferred: false,
		}
	})
	if (auditCases.length !== 30 || commentedCases.length !== 12) throw new Error("Audit analysis coverage is incomplete")
	const priorAuditChanges = auditManifest.entries.map((entry) => ({
		file: entry.source.file,
		materialChanges: materialChanges(
			baselineByFile.get(entry.source.file)!.extraction.methods.spatial,
			priorByFile.get(entry.source.file)!.extraction.methods.spatial,
		),
	}))
	const priorCommentedFiles = new Set(commentedCases.map((entry) => entry.file))
	const againstPriorAuditChanges = auditManifest.entries.map((entry) => ({
		file: entry.source.file,
		materialChanges: materialChanges(
			priorByFile.get(entry.source.file)!.extraction.methods.spatial,
			candidateByFile.get(entry.source.file)!.extraction.methods.spatial,
		),
	}))
	const redSurfaceFile = "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg"
	const redCase = (reference: Map<string, CorpusEntry>, candidate: Map<string, CorpusEntry>) => {
		const baseline = reference.get(redSurfaceFile)!.extraction.methods.spatial
		const treatment = candidate.get(redSurfaceFile)!.extraction.methods.spatial
		const changes = materialChanges(baseline, treatment)
		return {
			file: redSurfaceFile,
			roles: changes.roles,
			gradient: changes.gradient,
			changed: changes.roles.length > 0 || changes.gradient,
			surfaceChanged: changes.roles.includes("surface"),
			baseline: paletteSnapshot(baseline),
			candidate: paletteSnapshot(treatment),
		}
	}
	const canonical00Changes = againstCanonical.filter((entry) => entry.cohort === "00").length
	const acceptedChangedShare = comparison.accepted.changedCount / comparison.accepted.total
	const exceedsBreadthLimit = canonical00Changes > maximumCanonical00ChangesForReview
	const substantialAcceptedImpact = acceptedChangedShare >= substantialAcceptedChangeShare
	const reviewWarranted = canonical00Changes > 0 && !exceedsBreadthLimit && !substantialAcceptedImpact
	const decision = reviewWarranted ? "review-warranted" : "rejected"
	const gateViolations = results.filter((result) => result.gates.violations.length > 0).map((result) => ({
		cohort: result.cohort,
		file: result.file,
		...result.gates,
	}))
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		profile,
		policy: {
			developmentOnly: true,
			positiveRatingsAreNonExclusive: true,
			positiveRatingsDoNotRejectCandidateAlternatives: true,
			targetColorsInferred: false,
			evidenceStatement: "Positive ratings are non-exclusive and do not infer target colors.",
			strictGradientSurfaceRecoveryUsed: false,
			accentGatesChanged: false,
			objectiveWeightsChanged: false,
			paretoFloorChanged: false,
			candidateAdmissionChanged: false,
			gradientLogicChanged: false,
			reviewThresholds: {
				maximumCanonical00ChangesInclusive: maximumCanonical00ChangesForReview,
				substantialAcceptedChangeShareInclusive: substantialAcceptedChangeShare,
			},
		},
		validation,
		hardGateViolations: { count: gateViolations.length, entries: gateViolations },
		priorPoc1: {
			experimentVersion: PRIOR_EXPERIMENT_VERSION,
			decision: "rejected",
			rationale: "POC.1 is rejected for breadth: 150 of 355 canonical 00 palettes changed, including 44 of 95 accepted palettes and 151 foreground roles.",
			againstCanonical: materialSummary(priorAgainstCanonical),
			frozenReviewCohorts: conciseComparison(priorComparison),
		},
		comparisons: {
			poc2AgainstCanonical: {
				materialChanges: materialSummary(againstCanonical),
				frozenReviewCohorts: conciseComparison(comparison),
			},
			poc2AgainstPoc1: {
				materialChanges: materialSummary(againstPrior),
				frozenReviewCohorts: classifiedDelta(againstPrior, comparison),
			},
		},
		minima: {
			canonical: minima(baselineDevelopment, baseline00),
			poc1: minima(priorCandidateDevelopment, priorCandidate00),
			poc2: minima(candidateDevelopment, candidate00),
		},
		audit: {
			poc2AgainstCanonical: {
				summary: changeSummary(auditCases),
				commentedSummary: changeSummary(commentedCases),
				cases: auditCases,
				commentedCases,
			},
			poc1AgainstCanonical: {
				summary: changeSummary(priorAuditChanges),
				commentedSummary: changeSummary(priorAuditChanges.filter((entry) => priorCommentedFiles.has(entry.file))),
			},
			poc2AgainstPoc1: {
				summary: changeSummary(againstPriorAuditChanges),
				commentedSummary: changeSummary(againstPriorAuditChanges.filter((entry) => priorCommentedFiles.has(entry.file))),
			},
		},
		priorRedSurfaceCase: {
			poc1AgainstCanonical: redCase(baselineByFile, priorByFile),
			poc2AgainstCanonical: redCase(baselineByFile, candidateByFile),
			poc2AgainstPoc1: redCase(priorByFile, candidateByFile),
		},
		decision: {
			value: decision,
			reviewWarranted,
			exceedsCanonical00BreadthLimit: exceedsBreadthLimit,
			substantialAcceptedImpact,
			canonical00ChangedCount: canonical00Changes,
			acceptedChangedCount: comparison.accepted.changedCount,
			acceptedTotal: comparison.accepted.total,
			acceptedChangedShare,
			rationale: reviewWarranted
				? "POC.2 stays within the bounded breadth gates; human review is warranted, but no review UI was prepared."
				: canonical00Changes === 0
					? "POC.2 has no material canonical 00 effect, so review is not warranted and the experiment is rejected."
					: "POC.2 exceeds a bounded breadth gate, so review is not warranted and the experiment is rejected.",
			humanReviewUiPrepared: false,
		},
		limitations: [
			"Evaluation is exclusive to the 37 bound development entries and 355 bound canonical 00 entries.",
			"No corpus or extraction under 10/ through 14/ was inspected or run.",
			"Strict gradient-surface recovery is disabled for the explicit POC.2 profile; all other gradient logic is unchanged.",
			"Profile-aware hard-gate validation is bound to POC.2; canonical omitted-option validation remains unchanged.",
			"Positive ratings are non-exclusive and do not infer target colors.",
		],
	}
	const manifest = { ...identity, experimentId, generatedAt }
	const certificates = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
		profile,
		development: Object.fromEntries(developmentResults.map((result) => [result.file, result.certificate])),
		canonical00: Object.fromEntries(holdoutResults.map((result) => [result.file, result.certificate])),
	}

	try {
		await mkdir(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Refusing to overwrite existing foreground contrast floor experiment: ${outputRoot}`)
		}
		throw error
	}
	await Promise.all([
		writeExclusive(join(outputRoot, "manifest.json"), manifest),
		writeExclusive(join(outputRoot, "baseline-results.json"), baselineDevelopment),
		writeExclusive(join(outputRoot, "baseline-00-results.json"), baseline00),
		writeExclusive(join(outputRoot, "candidate-results.json"), candidateDevelopment),
		writeExclusive(join(outputRoot, "candidate-00-results.json"), candidate00),
		writeExclusive(join(outputRoot, "candidate-certificates.json"), certificates),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
	])
	process.stderr.write(`Wrote foreground contrast floor experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	await main()
}
