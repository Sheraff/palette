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
} from "./src/next-palette-review.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPERIMENT_ID = "23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe"
const BASELINE_ALGORITHM_VERSION = "region-graph-0.19.0"
const CANDIDATE_ALGORITHM_VERSION = "region-graph-next-incumbent-accent-0.1.0-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/next-palette-incumbent-accent-0.1.0-development")
const outputRoot = join(experimentRoot, "review-v1")
const authorizationPath = join(experimentRoot, "review-authorization.json")
const batchSize = 40

const inputFiles = [
	{ key: "manifest.json", path: join(experimentRoot, "manifest.json") },
	{ key: "protocol.json", path: join(experimentRoot, "protocol.json") },
	{ key: "analysis.json", path: join(experimentRoot, "analysis.json") },
	{ key: "results.json", path: join(experimentRoot, "results.json") },
	{ key: "certificates.json", path: join(experimentRoot, "certificates.json") },
	{ key: "frontier.json", path: join(experimentRoot, "frontier.json") },
	{ key: "../../results.json", path: join(researchRoot, "data/results.json") },
	{ key: "../../holdout-results.json", path: join(researchRoot, "data/holdout-results.json") },
	{ key: "../../selection.json", path: join(researchRoot, "data/selection.json") },
	{ key: "../../curation.json", path: join(researchRoot, "data/curation.json") },
] as const

const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/color-name.ts",
	"research/prepare-next-palette-incumbent-accent-review.ts",
	"research/serve-next-palette-review.ts",
] as const

const presentationFiles = [
	"research/next-palette-review/index.html",
	"research/next-palette-review/app.js",
	"research/next-palette-review/styles.css",
] as const

type FrontierEntry = {
	file: string
	cohort: "development" | "00"
	currentEvidenceClassification: "unknown"
	changedRoles: ["accent"]
	gradientChanged: false
	material: boolean
	baseline: Palette
	candidate: Palette
	source: { path: string; sha256: string; bytes: number }
	selected: { optionId: string; identitySupportDelta: number; backgroundContrastMagnitudeDelta: number }
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
	throw new Error("prepare-next-palette-incumbent-accent-review.ts does not accept arguments")
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
const manifest = parse<{
	experimentId: string
	candidateIdentity: { algorithmVersion: string }
	protocol: { baselineAlgorithmVersion: string }
	sources: Array<{ path: string; sha256: string; bytes: number }>
}>("manifest.json")
const analysis = parse<{
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	matrix: {
		exactChanged: number
		materialChanged: number
		developmentChanged: number
		cohort00Changed: number
		curated00Changed: number
		authorizedExtended00Changed: number
	}
	review: { authorized: boolean; completeChangedSetSize: number }
}>("analysis.json")
const frontier = parse<{ experimentId: string; algorithmVersion: string; entries: FrontierEntry[] }>("frontier.json")
const development = parse<CorpusResult>("../../results.json")
const canonical00 = parse<CorpusResult>("../../holdout-results.json")
if (manifest.experimentId !== EXPERIMENT_ID || analysis.experimentId !== EXPERIMENT_ID ||
	manifest.candidateIdentity.algorithmVersion !== CANDIDATE_ALGORITHM_VERSION ||
	manifest.protocol.baselineAlgorithmVersion !== BASELINE_ALGORITHM_VERSION || !analysis.structural.pass ||
	analysis.structural.violationCount !== 0 || !analysis.review.authorized || analysis.review.completeChangedSetSize !== 55 ||
	frontier.experimentId !== EXPERIMENT_ID || frontier.algorithmVersion !== CANDIDATE_ALGORITHM_VERSION ||
	frontier.entries.length !== analysis.matrix.exactChanged || analysis.matrix.exactChanged !== 55 ||
	analysis.matrix.materialChanged !== 55 || frontier.entries.some((entry) => !entry.material ||
		entry.changedRoles.join(",") !== "accent" || entry.gradientChanged)) {
	throw new Error("Incumbent accent review inputs disagree")
}

const sourceByFile = new Map(manifest.sources.map((source) => [source.path, source]))
const dimensions = new Map([
	...development.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
	...canonical00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
])
for (const entry of frontier.entries) {
	const source = sourceByFile.get(entry.file)
	if (!source || source.sha256 !== entry.source.sha256 || source.bytes !== entry.source.bytes ||
		!(/^(?:images|00)\/[^/\\]+$/.test(source.path))) throw new Error(`Review source is unbound: ${entry.file}`)
	const raw = await readFile(resolve(projectRoot, source.path))
	if (raw.byteLength !== source.bytes || sha256(raw) !== source.sha256) throw new Error(`Review source changed: ${source.path}`)
}

const boundArtifacts = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.sha256]))
const authorization = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	candidateAlgorithmVersion: CANDIDATE_ALGORITHM_VERSION,
	authorizationBasis: "explicit-user-request-execute-plan-and-request-review-2026-07-22",
	boundArtifacts,
	effectiveStructuralAssessment: { pass: true, violationCount: 0 },
	review: {
		authorized: true,
		completeChangedSet: true,
		freshBlindedComparisons: frontier.entries.length,
		developmentSources: analysis.matrix.developmentChanged,
		cohort00Sources: analysis.matrix.cohort00Changed,
		previouslyCurated00Sources: analysis.matrix.curated00Changed,
		authorizedExtended00Sources: analysis.matrix.authorizedExtended00Changed,
	},
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
	experiment: { ...boundArtifacts, "review-authorization.json": sha256(authorizationBytes) },
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}

const ordered = [...frontier.entries].sort((first, second) =>
	first.cohort.localeCompare(second.cohort) ||
	sha256(`${EXPERIMENT_ID}\0${first.source.sha256}`).localeCompare(sha256(`${EXPERIMENT_ID}\0${second.source.sha256}`)))
const generatedAt = new Date().toISOString()
const totalBatches = Math.ceil(ordered.length / batchSize)
const reviewManifests: NextPaletteReviewManifest[] = []
for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
	const batch = ordered.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
	const entries: NextPaletteReviewEntry[] = batch.map((entry, index) => {
		const order = batchIndex * batchSize + index
		const source = sourceByFile.get(entry.file)!
		const normalized = dimensions.get(entry.file)
		if (!normalized) throw new Error(`Missing review dimensions: ${entry.file}`)
		const baselineFirst = Number.parseInt(sha256(`${EXPERIMENT_ID}\0${source.sha256}\0assignment`).slice(0, 2), 16) % 2 === 0
		const baseline = presentPalette(entry.baseline)
		const candidate = presentPalette(entry.candidate)
		return {
			caseId: `npr-${sha256(`${EXPERIMENT_ID}\0${source.path}\0${source.sha256}`).slice(0, 20)}`,
			order,
			// The existing review schema calls its authorized 00 bucket curated-00; plan.json records the extended subset explicitly.
			cohort: entry.cohort === "development" ? "reviewable-development" : "curated-00",
			currentEvidenceClassification: "unknown",
			frontierSignature: `incumbent-accent|${entry.candidate.accent.hex === entry.candidate.foreground.hex
				? "foreground-collapse" : "connected-family-local"}`,
			source: { file: source.path, sha256: source.sha256, bytes: source.bytes, ...normalized },
			changedRoles: ["accent"],
			gradientChanged: false,
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
		batch: { index: batchIndex + 1, size: entries.length, totalBatches, totalCases: ordered.length },
		provenance,
		entries,
	}
	const reviewManifest: NextPaletteReviewManifest = {
		...identity,
		generatedAt,
		manifestId: nextPaletteReviewManifestId(identity),
	}
	parseNextPaletteReviewManifest(reviewManifest)
	reviewManifests.push(reviewManifest)
}

await mkdir(outputRoot)
await writeExclusive(authorizationPath, authorizationBytes)
await Promise.all([
	writeExclusive(join(outputRoot, "plan.json"), jsonBytes({
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		status: "complete-changed-set-authorized",
		experimentId: EXPERIMENT_ID,
		generatedAt,
		scope: {
			freshBlindedComparisons: ordered.length,
			developmentSources: analysis.matrix.developmentChanged,
			cohort00Sources: analysis.matrix.cohort00Changed,
			previouslyCurated00Sources: analysis.matrix.curated00Changed,
			authorizedExtended00Sources: analysis.matrix.authorizedExtended00Changed,
			totalBatches,
			batchSize,
		},
		passingRule: {
			candidateWeakOrUnacceptableMustEqual: 0,
			baselineStrongerMustEqual: 0,
			candidateStrongerMinimum: 1,
			allEligibleChangedPalettesReviewed: true,
		},
		interpretationPolicy: {
			independentPaletteQualityRequired: true,
			commentsDoNotEnterInference: true,
			targetColorsInferred: false,
			promotionAuthorized: false,
		},
		manifestIds: reviewManifests.map((reviewManifest) => reviewManifest.manifestId),
	})),
	...reviewManifests.flatMap((reviewManifest) => [
		writeExclusive(join(outputRoot, `batch-${String(reviewManifest.batch.index).padStart(2, "0")}-manifest.json`),
			jsonBytes(reviewManifest)),
		writeExclusive(join(outputRoot, `batch-${String(reviewManifest.batch.index).padStart(2, "0")}-feedback.json`),
			jsonBytes({ schemaVersion: 1, reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
				manifestId: reviewManifest.manifestId, entries: [] })),
	]),
])
process.stderr.write(`Prepared ${ordered.length} incumbent accent review cases in ${totalBatches} batches at ${outputRoot}\n`)
