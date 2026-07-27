import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	NEXT_PALETTE_REVIEW_VERSION,
	nextPaletteReviewManifestId,
	parseNextPaletteReviewManifest,
	type NextPalettePresentedPalette,
	type NextPaletteReviewEntry,
	type NextPaletteReviewManifest,
} from "./src/next-palette-review-v2.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPERIMENT_ID = "43bf44701c2678214e7000e0d426775e3139e8ee01fd3d24b1883e8c4c5cdbd1"
const BASELINE_ALGORITHM_VERSION = "region-graph-0.19.0"
const CANDIDATE_ALGORITHM_VERSION = "joint-field-tradeoff-diagnostic-0.1.1-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/joint-palette-field-tradeoff-0.1.1-development")
const outputRoot = join(experimentRoot, "review-v2")
const authorizationPath = join(experimentRoot, "review-v2-authorization.json")

const inputFiles = [
	{ key: "manifest.json", path: join(experimentRoot, "manifest.json") },
	{ key: "protocol.json", path: join(experimentRoot, "protocol.json") },
	{ key: "analysis.json", path: join(experimentRoot, "analysis.json") },
	{ key: "results.json", path: join(experimentRoot, "results.json") },
	{ key: "frontier.json", path: join(experimentRoot, "frontier.json") },
	{ key: "../../results.json", path: join(researchRoot, "data/results.json") },
	{ key: "../../holdout-results.json", path: join(researchRoot, "data/holdout-results.json") },
] as const

const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/next-palette-review-v2.ts",
	"research/src/color-name.ts",
	"research/prepare-joint-palette-field-tradeoff-review-v2.ts",
	"research/serve-next-palette-review-v2.ts",
] as const

const presentationFiles = [
	"research/next-palette-review-v2/index.html",
	"research/next-palette-review-v2/app.js",
	"research/next-palette-review-v2/styles.css",
] as const

type FrontierEntry = {
	caseId: string
	file: string
	cohort: "development" | "00"
	changedRoles: string[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	source: { path: string; sha256: string; bytes: number }
	selected: { fieldState: string }
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

function presentPalette(palette: Palette): NextPalettePresentedPalette {
	const roles = ["background", "foreground", "surface", "accent"] as const
	const names = namePalette(roles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(roles.map((role, index) => [role, {
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

async function writeExclusive(path: string, value: Uint8Array): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, value, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

if (process.argv.slice(2).length > 0) {
	throw new Error("prepare-joint-palette-field-tradeoff-review-v2.ts does not accept arguments")
}
for (const path of [outputRoot, authorizationPath]) {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

const inputs = Object.fromEntries(await Promise.all(inputFiles.map(async ({ key, path }) => {
	const raw = await readFile(path)
	return [key, { raw, sha256: sha256(raw) }] as const
})))
const parse = <T>(key: keyof typeof inputs): T => JSON.parse(inputs[key].raw.toString("utf8")) as T
const manifest = parse<{ experimentId: string; protocol: { authorization: { targetedDiagnosticReviewAuthorized: boolean } } }>(
	"manifest.json",
)
const analysis = parse<{
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	coverage: { reviewCases: number }
	review: { authorized: boolean; freshBlindedComparisonsRequired: number; diagnosticOnly: boolean }
}>("analysis.json")
const frontier = parse<{ experimentId: string; entries: FrontierEntry[] }>("frontier.json")
if (manifest.experimentId !== EXPERIMENT_ID || analysis.experimentId !== EXPERIMENT_ID ||
	frontier.experimentId !== EXPERIMENT_ID || !manifest.protocol.authorization.targetedDiagnosticReviewAuthorized ||
	!analysis.structural.pass || analysis.structural.violationCount !== 0 || !analysis.review.authorized ||
	!analysis.review.diagnosticOnly || frontier.entries.length !== analysis.coverage.reviewCases ||
	frontier.entries.length !== analysis.review.freshBlindedComparisonsRequired || frontier.entries.length !== 10) {
	throw new Error("Field tradeoff review inputs disagree")
}

const development = parse<CorpusResult>("../../results.json")
const canonical00 = parse<CorpusResult>("../../holdout-results.json")
const dimensions = new Map([
	...development.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
	...canonical00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
])
for (const entry of frontier.entries) {
	const raw = await readFile(resolve(projectRoot, entry.source.path))
	if (entry.file !== entry.source.path || raw.byteLength !== entry.source.bytes || sha256(raw) !== entry.source.sha256 ||
		!(/^(?:images|00)\/[^/\\]+$/.test(entry.file))) throw new Error(`Review source is unbound: ${entry.file}`)
}

const boundArtifacts = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.sha256]))
const authorization = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	candidateAlgorithmVersion: CANDIDATE_ALGORITHM_VERSION,
	authorizationBasis: "explicit-user-approval-joint-inference-plan-2026-07-22",
	presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	boundArtifacts,
	review: { authorized: true, diagnosticOnly: true, freshBlindedComparisons: frontier.entries.length },
	prohibitions: {
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [] as string[],
		sourceRoots: ["images", "00"],
	},
}
const authorizationBytes = jsonBytes(authorization)
const provenance = {
	experiment: { ...boundArtifacts, "review-v2-authorization.json": sha256(authorizationBytes) },
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}
const ordered = [...frontier.entries].sort((first, second) =>
	sha256(`${EXPERIMENT_ID}\0${first.source.sha256}`).localeCompare(sha256(`${EXPERIMENT_ID}\0${second.source.sha256}`)))
const entries: NextPaletteReviewEntry[] = ordered.map((entry, order) => {
	const normalized = dimensions.get(entry.file)
	if (!normalized) throw new Error(`Missing review dimensions: ${entry.file}`)
	const baselineFirst = Number.parseInt(sha256(`${EXPERIMENT_ID}\0${entry.source.sha256}\0assignment`).slice(0, 2), 16) % 2 === 0
	const baseline = presentPalette(entry.baseline)
	const candidate = presentPalette(entry.candidate)
	return {
		caseId: `npr-${sha256(`${EXPERIMENT_ID}\0${entry.source.path}`).slice(0, 20)}`,
		order,
		cohort: entry.cohort === "development" ? "reviewable-development" : "curated-00",
		currentEvidenceClassification: "unknown",
		frontierSignature: `joint-field-tradeoff|minimax-regret|${entry.selected.fieldState}`,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.bytes, ...normalized },
		changedRoles: entry.changedRoles as NextPaletteReviewEntry["changedRoles"],
		gradientChanged: entry.gradientChanged,
		options: baselineFirst ? { A: baseline, B: candidate } : { A: candidate, B: baseline },
		assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
	}
})
const identity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	experimentId: EXPERIMENT_ID,
	baselineAlgorithmVersion: BASELINE_ALGORITHM_VERSION,
	candidateAlgorithmVersion: CANDIDATE_ALGORITHM_VERSION,
	batch: { index: 1, size: entries.length, totalBatches: 1, totalCases: entries.length },
	provenance,
	entries,
}
const generatedAt = new Date().toISOString()
const reviewManifest: NextPaletteReviewManifest = {
	...identity,
	generatedAt,
	manifestId: nextPaletteReviewManifestId(identity),
}
parseNextPaletteReviewManifest(reviewManifest)

await mkdir(outputRoot)
await writeExclusive(authorizationPath, authorizationBytes)
await Promise.all([
	writeExclusive(join(outputRoot, "plan.json"), jsonBytes({
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		status: "targeted-diagnostic-review-authorized",
		experimentId: EXPERIMENT_ID,
		generatedAt,
		scope: { freshBlindedComparisons: entries.length, totalBatches: 1, diagnosticOnly: true },
		interpretationPolicy: {
			completePaletteQualityIsDiagnostic: true,
			pairedPreferenceTestsTheCompleteFieldTradeoff: true,
			commentsDoNotEnterInference: true,
			resultsDoNotAuthorizePromotion: true,
		},
		manifestIds: [reviewManifest.manifestId],
	})),
	writeExclusive(join(outputRoot, "batch-01-manifest.json"), jsonBytes(reviewManifest)),
	writeExclusive(join(outputRoot, "batch-01-feedback.json"), jsonBytes({
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		manifestId: reviewManifest.manifestId,
		entries: [],
	})),
])
process.stderr.write(`Prepared ${entries.length} blinded field tradeoff diagnostic comparisons at ${outputRoot}\n`)
