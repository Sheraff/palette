import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import { loadImage } from "./src/image.ts"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	NEXT_PALETTE_REVIEW_VERSION,
	nextPaletteReviewManifestId,
	nextPaletteReviewRoles,
	parseNextPaletteReviewManifest,
	type NextPalettePresentedPalette,
	type NextPaletteReviewEntry,
	type NextPaletteReviewManifest,
} from "./src/next-palette-review.ts"
import type { Palette, RoleName } from "./src/types.ts"

const EXPERIMENT_ID = "4956afc31f06ffe17a4503057f4c89ee9dc884ae81d330ada6d0cf03c6e94b99"
const BASELINE_ALGORITHM_VERSION = "region-graph-next-0.3.0-dev"
const CANDIDATE_ALGORITHM_VERSION = "region-graph-next-0.4.0-connected-family-dev"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/next-palette-0.4.0-connected-family-development")
const baselineRoot = join(researchRoot, "data/experiments/next-palette-0.3.0-relation-development")
const attributionRoot = join(researchRoot, "data/experiments/next-palette-0.1.0-development/review-v2")
const outputRoot = join(experimentRoot, "review-v1")
const authorizationPath = join(experimentRoot, "review-authorization.json")
const inputFiles = [
	{ key: "manifest.json", path: join(experimentRoot, "manifest.json") },
	{ key: "protocol.json", path: join(experimentRoot, "protocol.json") },
	{ key: "analysis.json", path: join(experimentRoot, "analysis.json") },
	{ key: "results.json", path: join(experimentRoot, "results.json") },
	{ key: "certificates.json", path: join(experimentRoot, "certificates.json") },
	{ key: "../next-palette-0.3.0-relation-development/manifest.json", path: join(baselineRoot, "manifest.json") },
	{ key: "../next-palette-0.3.0-relation-development/results.json", path: join(baselineRoot, "results.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
		path: join(attributionRoot, "technical-attribution-batches-01-02.json") },
] as const
const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/color-name.ts",
	"research/prepare-next-palette-connected-family-review.ts",
	"research/serve-next-palette-review.ts",
	"research/analyze-next-palette-review.ts",
] as const
const presentationFiles = [
	"research/next-palette-review/index.html",
	"research/next-palette-review/app.js",
	"research/next-palette-review/styles.css",
] as const

type ExperimentManifest = {
	experimentId: string
	candidateIdentity: { algorithmVersion: string }
	sources: Array<{ cohort: "development" | "00"; path: string; sha256: string; bytes: number }>
}
type ResultArtifact = {
	experimentId: string
	algorithmVersion: string
	entries: Array<{ cohort: "development" | "00"; file: string; palette: Palette }>
}
type Analysis = { experimentId: string; structural: { pass: boolean; violationCount: number } }
type Attribution = {
	experimentId: string
	identityOmissionAttribution: Array<{ file: string; attribution: string; evidence: string }>
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function jsonBytes(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(resolve(projectRoot, file)))] as const)))
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({ roles: nextPaletteReviewRoles.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient })
}

function presentPalette(palette: Palette): NextPalettePresentedPalette {
	const names = namePalette(nextPaletteReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(nextPaletteReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as NextPalettePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

function changedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return nextPaletteReviewRoles.filter((role) => baseline[role].generated !== candidate[role].generated ||
		baseline[role].rgb.some((channel, index) => channel !== candidate[role].rgb[index]))
}

async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, bytes, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

if (process.argv.slice(2).length > 0) throw new Error("prepare-next-palette-connected-family-review.ts does not accept arguments")
try {
	await access(outputRoot)
	throw new Error(`Refusing to overwrite existing review: ${outputRoot}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}
try {
	await access(authorizationPath)
	throw new Error(`Refusing to overwrite existing review authorization: ${authorizationPath}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}

const inputs = Object.fromEntries(await Promise.all(inputFiles.map(async ({ key, path }) => {
	const raw = await readFile(path)
	return [key, { raw, sha256: sha256(raw) }] as const
})))
const parse = <T>(key: keyof typeof inputs): T => JSON.parse(inputs[key].raw.toString("utf8")) as T
const manifest = parse<ExperimentManifest>("manifest.json")
const analysis = parse<Analysis>("analysis.json")
const candidate = parse<ResultArtifact>("results.json")
const baselineManifest = parse<ExperimentManifest>("../next-palette-0.3.0-relation-development/manifest.json")
const baseline = parse<ResultArtifact>("../next-palette-0.3.0-relation-development/results.json")
const attribution = parse<Attribution>(
	"../next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
)
if (manifest.experimentId !== EXPERIMENT_ID || analysis.experimentId !== EXPERIMENT_ID ||
	candidate.experimentId !== EXPERIMENT_ID || candidate.algorithmVersion !== CANDIDATE_ALGORITHM_VERSION ||
	manifest.candidateIdentity.algorithmVersion !== CANDIDATE_ALGORITHM_VERSION || !analysis.structural.pass ||
	analysis.structural.violationCount !== 0 || baseline.algorithmVersion !== BASELINE_ALGORITHM_VERSION ||
	baseline.experimentId !== baselineManifest.experimentId || attribution.experimentId !==
	"883e547342ea726d4ba914b2405c5ec92b9489f2efd152d0d68ae2b6361389d1") {
	throw new Error("Connected family diagnostic review inputs disagree")
}
const known = attribution.identityOmissionAttribution.filter((entry) => entry.attribution === "candidate-availability")
if (known.length !== 6) throw new Error("Expected six known availability-attributed cases")
const baselineByFile = new Map(baseline.entries.map((entry) => [entry.file, entry]))
const candidateByFile = new Map(candidate.entries.map((entry) => [entry.file, entry]))
const sourceByFile = new Map(manifest.sources.map((source) => [source.path, source]))
const changed = known.filter((entry) => {
	const first = baselineByFile.get(entry.file)
	const second = candidateByFile.get(entry.file)
	if (!first || !second) throw new Error(`Known case is outside the result matrix: ${entry.file}`)
	return semanticKey(first.palette) !== semanticKey(second.palette)
})
const unchanged = known.filter((entry) => !changed.includes(entry))
if (changed.length !== 4 || unchanged.length !== 2) throw new Error("Expected four changed and two exact connected-family cases")

const boundArtifacts = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.sha256]))
const authorization = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	candidateAlgorithmVersion: CANDIDATE_ALGORITHM_VERSION,
	authorizationBasis: "explicit-user-selection-targeted-diagnostic-review-2026-07-22",
	boundArtifacts,
	effectiveStructuralAssessment: { pass: true, violationCount: 0 },
	review: {
		authorized: true,
		comparisonAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
		knownAvailabilityCases: 6,
		freshVisualCases: 4,
		exactUnchangedCases: 2,
	},
	prohibitions: {
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [] as string[],
		sourceRoots: ["images", "00"],
		broaderReviewAuthorized: false,
	},
}
const authorizationBytes = jsonBytes(authorization)
const experimentProvenance = { ...boundArtifacts, "review-authorization.json": sha256(authorizationBytes) }
const implementation = await fileHashes(implementationFiles)
const presentation = await fileHashes(presentationFiles)

const prepared = await Promise.all(changed.map(async (attributionEntry) => {
	const baselineEntry = baselineByFile.get(attributionEntry.file)!
	const candidateEntry = candidateByFile.get(attributionEntry.file)!
	const source = sourceByFile.get(attributionEntry.file)
	if (!source) throw new Error(`Review source is unbound: ${attributionEntry.file}`)
	const raw = await readFile(resolve(projectRoot, source.path))
	if (raw.byteLength !== source.bytes || sha256(raw) !== source.sha256) throw new Error(`Review source changed: ${source.path}`)
	const image = await loadImage(raw)
	return { attribution: attributionEntry, baseline: baselineEntry.palette, candidate: candidateEntry.palette, source,
		dimensions: { width: image.width, height: image.height } }
}))
prepared.sort((first, second) => sha256(`connected-family-review\0${first.source.sha256}`).localeCompare(
	sha256(`connected-family-review\0${second.source.sha256}`),
))
const entries: NextPaletteReviewEntry[] = prepared.map((entry, order) => {
	const baselineFirst = Number.parseInt(sha256(`${EXPERIMENT_ID}\0${entry.source.sha256}\0assignment`).slice(0, 2), 16) % 2 === 0
	const baselinePresented = presentPalette(entry.baseline)
	const candidatePresented = presentPalette(entry.candidate)
	const roles = changedRoles(entry.baseline, entry.candidate)
	const gradientChanged = entry.baseline.gradient.isGradient !== entry.candidate.gradient.isGradient
	return {
		caseId: `npr-${sha256(`${EXPERIMENT_ID}\0${entry.source.sha256}`).slice(0, 20)}`,
		order,
		cohort: entry.source.cohort === "development" ? "reviewable-development" : "curated-00",
		currentEvidenceClassification: "unknown",
		frontierSignature: `connected-family-diagnostic|candidate-availability|${roles.join("+") || "gradient-only"}`,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.bytes, ...entry.dimensions },
		changedRoles: roles,
		gradientChanged,
		options: baselineFirst ? { A: baselinePresented, B: candidatePresented } : { A: candidatePresented, B: baselinePresented },
		assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
	}
})
const manifestIdentity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	experimentId: EXPERIMENT_ID,
	baselineAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
	candidateAlgorithmVersion: CANDIDATE_ALGORITHM_VERSION,
	batch: { index: 1, size: entries.length, totalBatches: 1, totalCases: entries.length },
	provenance: { experiment: experimentProvenance, implementation, presentation },
	entries,
}
const reviewManifest: NextPaletteReviewManifest = {
	...manifestIdentity,
	generatedAt: new Date().toISOString(),
	manifestId: nextPaletteReviewManifestId(manifestIdentity),
}
parseNextPaletteReviewManifest(reviewManifest)
const plan = {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	status: "targeted-diagnostic-authorized",
	experimentId: EXPERIMENT_ID,
	manifestId: reviewManifest.manifestId,
	scope: {
		knownAvailabilityCases: known.length,
		freshBlindedComparisons: changed.length,
		exactUnchangedNoReview: unchanged.map((entry) => entry.file),
		broaderReviewAuthorized: false,
	},
	interpretationPolicy: {
		independentPaletteQualityRequired: true,
		positiveJudgmentsAreNonExclusive: true,
		commentsDoNotEnterInference: true,
		targetColorsInferred: false,
		promotionAuthorized: false,
	},
	commentEvidence: known,
}
const feedback = {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	manifestId: reviewManifest.manifestId,
	entries: [],
}
await mkdir(outputRoot)
await Promise.all([
	writeExclusive(authorizationPath, authorizationBytes),
	writeExclusive(join(outputRoot, "plan.json"), jsonBytes(plan)),
	writeExclusive(join(outputRoot, "batch-01-manifest.json"), jsonBytes(reviewManifest)),
	writeExclusive(join(outputRoot, "batch-01-feedback.json"), jsonBytes(feedback)),
])
process.stderr.write(`Prepared ${entries.length} connected-family diagnostic review cases in ${outputRoot}\n`)
