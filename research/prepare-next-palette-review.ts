import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
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
import type { CorpusResult, Palette } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/next-palette-0.1.0-development")
const outputRoot = join(experimentRoot, "review-v2")
const experimentFiles = [
	"manifest.json",
	"protocol.json",
	"analysis.json",
	"frontier.json",
	"baseline-results.json",
	"baseline-00-results.json",
	"candidate-results.json",
	"candidate-00-results.json",
	"candidate-certificates.json",
] as const
const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/color-name.ts",
	"research/prepare-next-palette-review.ts",
	"research/serve-next-palette-review.ts",
] as const
const presentationFiles = [
	"research/next-palette-review/index.html",
	"research/next-palette-review/app.js",
	"research/next-palette-review/styles.css",
] as const
const batchSize = 40

type FrontierEntry = {
	file: string
	cohort: NextPaletteReviewEntry["cohort"]
	currentEvidenceClassification: NextPaletteReviewEntry["currentEvidenceClassification"]
	changedRoles: NextPaletteReviewEntry["changedRoles"]
	gradientChanged: boolean
	delta: { gradient: { old: boolean; new: boolean } }
	baseline: Palette
	candidate: Palette
	source: { path: string; sha256: string; bytes: number }
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(resolve(projectRoot, file)))] as const)))
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

function frontierSignature(entry: FrontierEntry): string {
	return [
		entry.cohort,
		entry.currentEvidenceClassification,
		entry.changedRoles.join("+") || "gradient-only",
		`${entry.delta.gradient.old ? "gradient" : "flat"}->${entry.delta.gradient.new ? "gradient" : "flat"}`,
		entry.candidate.background.hex === entry.candidate.surface.hex ? "surface-collapse" : "surface-distinct",
		entry.candidate.foreground.generated ? "generated-foreground" : "source-foreground",
		entry.candidate.accent.hex === entry.candidate.foreground.hex ? "accent-collapse" : "accent-distinct",
	].join("|")
}

function stratifiedOrder(entries: FrontierEntry[]): FrontierEntry[] {
	const buckets = new Map<string, FrontierEntry[]>()
	for (const entry of entries) {
		const signature = frontierSignature(entry)
		let bucket = buckets.get(signature)
		if (!bucket) buckets.set(signature, bucket = [])
		bucket.push(entry)
	}
	for (const bucket of buckets.values()) bucket.sort((first, second) =>
		sha256(`${NEXT_PALETTE_REVIEW_VERSION}\0${first.source.sha256}`).localeCompare(
			sha256(`${NEXT_PALETTE_REVIEW_VERSION}\0${second.source.sha256}`),
		))
	const signatures = [...buckets.keys()].sort((first, second) =>
		sha256(`signature\0${first}`).localeCompare(sha256(`signature\0${second}`)))
	const ordered: FrontierEntry[] = []
	while (ordered.length < entries.length) {
		for (const signature of signatures) {
			const entry = buckets.get(signature)!.shift()
			if (entry) ordered.push(entry)
		}
	}
	return ordered
}

function presentationKey(entry: FrontierEntry): string {
	const visible = (palette: Palette) => ({
		roles: Object.fromEntries(nextPaletteReviewRoles.map((role) => [role, {
			rgb: palette[role].rgb,
			generated: palette[role].generated,
		}])),
		gradient: palette.gradient.isGradient,
	})
	return JSON.stringify([entry.source.sha256, visible(entry.baseline), visible(entry.candidate)])
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

try {
	await access(outputRoot)
	throw new Error(`Refusing to overwrite existing review plan: ${outputRoot}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}

const experimentSources = Object.fromEntries(await Promise.all(experimentFiles.map(async (file) => {
	const raw = await readFile(join(experimentRoot, file))
	return [file, { raw, sha256: sha256(raw) }] as const
})))
const experimentManifest = JSON.parse(experimentSources["manifest.json"].raw.toString("utf8")) as {
	experimentId: string
	candidateIdentity: { algorithmVersion: string }
	protocol: { baselineAlgorithmVersion: string }
}
const analysis = JSON.parse(experimentSources["analysis.json"].raw.toString("utf8")) as {
	structural: { pass: boolean; violationCount: number }
	reviewFrontier: { total: number; reviewRequired: boolean }
}
const frontier = JSON.parse(experimentSources["frontier.json"].raw.toString("utf8")) as {
	experimentId: string
	algorithmVersion: string
	entries: FrontierEntry[]
}
const baselineDevelopment = JSON.parse(experimentSources["baseline-results.json"].raw.toString("utf8")) as CorpusResult
const baseline00 = JSON.parse(experimentSources["baseline-00-results.json"].raw.toString("utf8")) as CorpusResult
const dimensions = new Map([...baselineDevelopment.entries, ...baseline00.entries].map((entry) =>
	[entry.file, { width: entry.width, height: entry.height }]))
if (!analysis.structural.pass || analysis.structural.violationCount !== 0 || !analysis.reviewFrontier.reviewRequired ||
	frontier.experimentId !== experimentManifest.experimentId ||
	frontier.algorithmVersion !== experimentManifest.candidateIdentity.algorithmVersion ||
	frontier.entries.length !== analysis.reviewFrontier.total || frontier.entries.length !== 125) {
	throw new Error("Next palette development frontier is not review-ready")
}
for (const entry of frontier.entries) {
	if (!/^(?:images|00)\/[^/\\]+$/.test(entry.source.path)) throw new Error(`Unauthorized review source: ${entry.source.path}`)
	const bytes = await readFile(resolve(projectRoot, entry.source.path))
	if (bytes.byteLength !== entry.source.bytes || sha256(bytes) !== entry.source.sha256) {
		throw new Error(`Review source changed: ${entry.source.path}`)
	}
}

const presentationGroups = new Map<string, FrontierEntry[]>()
for (const entry of frontier.entries) {
	const key = presentationKey(entry)
	let group = presentationGroups.get(key)
	if (!group) presentationGroups.set(key, group = [])
	group.push(entry)
}
const duplicateCarryEdges: Array<{
	representativeFile: string
	duplicateFile: string
	sourceSha256: string
	exactSourceBytes: true
	exactBaselinePresentation: true
	exactCandidatePresentation: true
}> = []
const reviewEntries = [...presentationGroups.values()].map((group) => {
	group.sort((first, second) => first.source.path.localeCompare(second.source.path))
	const representative = group[0]
	for (const duplicate of group.slice(1)) duplicateCarryEdges.push({
		representativeFile: representative.source.path,
		duplicateFile: duplicate.source.path,
		sourceSha256: representative.source.sha256,
		exactSourceBytes: true,
		exactBaselinePresentation: true,
		exactCandidatePresentation: true,
	})
	return representative
})
const ordered = stratifiedOrder(reviewEntries)
const totalBatches = Math.ceil(ordered.length / batchSize)
const generatedAt = new Date().toISOString()
const provenance = {
	experiment: Object.fromEntries(Object.entries(experimentSources).map(([file, source]) => [file, source.sha256])),
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}
const manifests: NextPaletteReviewManifest[] = []
for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
	const batchEntries = ordered.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
	const entries: NextPaletteReviewEntry[] = batchEntries.map((entry, entryIndex) => {
		const order = batchIndex * batchSize + entryIndex
		const normalized = dimensions.get(entry.file)
		if (!normalized) throw new Error(`Missing normalized dimensions for ${entry.file}`)
		const baselineFirst = Number.parseInt(sha256(
			`${NEXT_PALETTE_REVIEW_PRESENTATION_VERSION}\0${entry.source.sha256}`,
		).slice(0, 2), 16) % 2 === 0
		return {
			caseId: `npr-${sha256(`${experimentManifest.experimentId}\0${entry.source.path}\0${entry.source.sha256}`).slice(0, 20)}`,
			order,
			cohort: entry.cohort,
			currentEvidenceClassification: entry.currentEvidenceClassification,
			frontierSignature: frontierSignature(entry),
			source: {
				file: entry.source.path,
				sha256: entry.source.sha256,
				bytes: entry.source.bytes,
				width: normalized.width,
				height: normalized.height,
			},
			changedRoles: entry.changedRoles,
			gradientChanged: entry.gradientChanged,
			options: baselineFirst
				? { A: presentPalette(entry.baseline), B: presentPalette(entry.candidate) }
				: { A: presentPalette(entry.candidate), B: presentPalette(entry.baseline) },
			assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
		}
	})
	const identity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		experimentId: experimentManifest.experimentId,
		baselineAlgorithmVersion: experimentManifest.protocol.baselineAlgorithmVersion,
		candidateAlgorithmVersion: experimentManifest.candidateIdentity.algorithmVersion,
		batch: { index: batchIndex + 1, size: entries.length, totalBatches, totalCases: ordered.length },
		provenance,
		entries,
	}
	const manifest: NextPaletteReviewManifest = {
		...identity,
		generatedAt,
		manifestId: nextPaletteReviewManifestId(identity),
	}
	parseNextPaletteReviewManifest(manifest)
	manifests.push(manifest)
}

await mkdir(outputRoot)
for (const manifest of manifests) {
	await writeExclusive(join(outputRoot, `batch-${String(manifest.batch.index).padStart(2, "0")}-manifest.json`), manifest)
}
await writeExclusive(join(outputRoot, "plan.json"), {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	experimentId: experimentManifest.experimentId,
	generatedAt,
	frontierCases: frontier.entries.length,
	reviewCases: ordered.length,
	totalBatches,
	batchSize,
	stratification: "round-robin across cohort, prior evidence, role delta, gradient transition, and collapse/fallback state",
	duplicateCarryPolicy: "exact source bytes and exact baseline/candidate visible presentations",
	duplicateCarryEdges,
	manifestIds: manifests.map((manifest) => manifest.manifestId),
})
process.stderr.write(`Prepared ${ordered.length} cases in ${totalBatches} blinded batches at ${relative(projectRoot, outputRoot)}\n`)
