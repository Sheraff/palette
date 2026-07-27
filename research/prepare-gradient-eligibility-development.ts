import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	analyzeGradientEligibility,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import { loadImage } from "./src/image.ts"
import {
	extractRegionGraph017PaletteWithContext as extractPaletteWithContext,
	REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION,
} from "./src/region-graph-0.17-extract.ts"
import type { Palette, RGB } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const developmentVersion = "gradient-eligibility-development-0.2.0" as const
const pilotReviewSize = 24
const knownFlatBackgroundFailures = new Set([
	"gc-3d4814e8282c18d359bf",
	"gc-d67d2a270d9ef853e69b",
])

type SourceImage = {
	file: string
	sha256: string
	width: number
	height: number
}

type ManifestFamily = {
	familyId: string
	anchor: SourceImage
}

type Manifest = {
	schemaVersion: 1
	manifestVersion: string
	manifestId: string
	families: ManifestFamily[]
}

type Task = {
	familyId: string
	anchor: SourceImage
}

type DevelopmentEntry = {
	familyId: string
	anchor: SourceImage
	normalized: { width: number; height: number }
	palette: Palette
	evidence: GradientEligibilityEvidence
}

type ReviewStratum = "suspected-flat-isolated" | "pair-continuous" | "pair-rejected" | "representative"

type ReviewQueueEntry = {
	familyId: string
	batch: number
	stratum: ReviewStratum
}

type WorkerResult = {
	familyId: string
	canonicalGradient: boolean
	entry: DevelopmentEntry | null
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSource(value: unknown, label: string): SourceImage {
	if (!isRecord(value) || typeof value.file !== "string" || typeof value.sha256 !== "string" ||
		!Number.isInteger(value.width) || !Number.isInteger(value.height) ||
		!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(value.file) ||
		!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error(`${label} is invalid`)
	return value as SourceImage
}

function parseManifest(value: unknown): Manifest {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.manifestVersion !== "string" ||
		typeof value.manifestId !== "string" || !Array.isArray(value.families)) {
		throw new Error("Development source manifest is invalid")
	}
	const familyIds = new Set<string>()
	const anchorFiles = new Set<string>()
	const families = value.families.map((family, index): ManifestFamily => {
		if (!isRecord(family) || typeof family.familyId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(family.familyId) ||
			familyIds.has(family.familyId)) throw new Error(`Manifest family ${index} is invalid or duplicated`)
		const anchor = parseSource(family.anchor, `Manifest family ${family.familyId} anchor`)
		if (anchorFiles.has(anchor.file)) throw new Error(`Manifest anchor is duplicated: ${anchor.file}`)
		familyIds.add(family.familyId)
		anchorFiles.add(anchor.file)
		return { familyId: family.familyId, anchor }
	})
	return {
		schemaVersion: 1,
		manifestVersion: value.manifestVersion,
		manifestId: value.manifestId,
		families,
	}
}

function sourcePath(file: string): string {
	if (!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(file)) {
		throw new Error(`Invalid music-artwork source path: ${file}`)
	}
	return resolve(projectRoot, file)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	const bytes = await readFile(sourcePath(task.anchor.file))
	if (sha256(bytes) !== task.anchor.sha256) throw new Error(`Source hash changed for ${task.anchor.file}`)
	const image = await loadImage(bytes)
	const { extraction, analysis, candidates } = extractPaletteWithContext(image)
	const palette = extraction.methods.spatial
	if (!palette.gradient.isGradient) return { familyId: task.familyId, canonicalGradient: false, entry: null }

	const background = candidates.find((candidate) => sameRgb(candidate.rgb, palette.background.rgb))
	const surface = candidates.find((candidate) => sameRgb(candidate.rgb, palette.surface.rgb))
	if (!background || !surface) throw new Error(`Selected endpoints are absent from candidates for ${task.anchor.file}`)
	return {
		familyId: task.familyId,
		canonicalGradient: true,
		entry: {
			familyId: task.familyId,
			anchor: task.anchor,
			normalized: { width: image.width, height: image.height },
			palette,
			evidence: analyzeGradientEligibility(background, surface, analysis),
		},
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const [index, task] of tasks.entries()) {
		results.push(await evaluateTask(task))
		if ((index + 1) % 20 === 0) parentPort?.postMessage({ progress: 20 })
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
				process.stderr.write(`gradient eligibility: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Gradient eligibility worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`gradient eligibility: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
}

function quality(entry: DevelopmentEntry): number {
	const field = entry.evidence.connectedField
	return field.continuity * 0.32 + field.localTransitionCoverage * 0.28 +
		field.directionalOrdering * 0.22 + field.coverage * 0.18
}

function stableOrder(manifestId: string, familyId: string): string {
	return sha256(`${manifestId}/${familyId}/gradient-eligibility-review-order`)
}

function buildReviewQueue(entries: DevelopmentEntry[], manifestId: string): ReviewQueueEntry[] {
	const selected = new Map<string, ReviewStratum>()
	const take = (values: DevelopmentEntry[], count: number, stratum: ReviewStratum): void => {
		for (const entry of values) {
			if (selected.has(entry.familyId)) continue
			selected.set(entry.familyId, stratum)
			if ([...selected.values()].filter((value) => value === stratum).length >= count) break
		}
	}
	take([...entries].sort((first, second) =>
		Number(knownFlatBackgroundFailures.has(second.familyId)) - Number(knownFlatBackgroundFailures.has(first.familyId)) ||
		second.evidence.flatBackgroundIsolatedSurfaceRisk - first.evidence.flatBackgroundIsolatedSurfaceRisk ||
		first.familyId.localeCompare(second.familyId, "en")), 6, "suspected-flat-isolated")
	take(entries.filter((entry) => entry.evidence.pairSpecific.isGradient)
		.sort((first, second) => quality(second) - quality(first) || first.familyId.localeCompare(second.familyId, "en")),
	6, "pair-continuous")
	take(entries.filter((entry) => !entry.evidence.pairSpecific.isGradient)
		.sort((first, second) => quality(second) - quality(first) || first.familyId.localeCompare(second.familyId, "en")),
	6, "pair-rejected")
	take([...entries].sort((first, second) =>
		stableOrder(manifestId, first.familyId).localeCompare(stableOrder(manifestId, second.familyId))),
	6, "representative")

	return [...selected].map(([familyId, stratum]) => ({ familyId, batch: 1, stratum }))
		.sort((first, second) => stableOrder(manifestId, first.familyId).localeCompare(stableOrder(manifestId, second.familyId)))
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	const [manifestArgument, outputArgument] = process.argv.slice(2)
	if (!manifestArgument || !outputArgument) {
		throw new Error("Usage: prepare-gradient-eligibility-development.ts <source-manifest.json> <output.json>")
	}
	if (ALGORITHM_VERSION !== "region-graph-0.17.0") throw new Error(`Unexpected canonical version: ${ALGORITHM_VERSION}`)
	const manifestSource = await readFile(resolve(manifestArgument))
	const manifestValue: unknown = JSON.parse(manifestSource.toString("utf8"))
	const manifest = parseManifest(manifestValue)
	if (isRecord(manifestValue)) {
		const { manifestId: _manifestId, ...draft } = manifestValue
		if (sha256(JSON.stringify(draft)) !== manifest.manifestId) throw new Error("Source manifest ID is invalid")
	}
	const results = await runParallel(manifest.families.map((family) => ({ familyId: family.familyId, anchor: family.anchor })))
	const entries = results.flatMap((result) => result.entry ? [result.entry] : [])
	const reviewQueue = buildReviewQueue(entries, manifest.manifestId)
	await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
		schemaVersion: 1,
		developmentVersion,
		experimentVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
		generatedAt: new Date().toISOString(),
		algorithmVersion: ALGORITHM_VERSION,
		sourceManifest: {
			version: manifest.manifestVersion,
			id: manifest.manifestId,
			sha256: sha256(manifestSource),
		},
		summary: {
			families: results.length,
			canonicalGradients: entries.length,
			pairSpecificGradients: entries.filter((entry) => entry.evidence.pairSpecific.isGradient).length,
			dominantFlatBackgrounds: entries.filter((entry) => entry.evidence.background.dominantFlat).length,
			isolatedSurfaces: entries.filter((entry) => entry.evidence.surface.isolated).length,
			flatBackgroundIsolatedSurfaces: entries.filter((entry) =>
				entry.evidence.background.dominantFlat && entry.evidence.surface.isolated).length,
				reviewCases: reviewQueue.length,
				reviewBatches: 1,
		},
		reviewQueue,
		entries,
	})
	if (reviewQueue.length !== pilotReviewSize) throw new Error(`Expected ${pilotReviewSize} pilot cases, received ${reviewQueue.length}`)
	process.stderr.write(`Prepared ${entries.length} gradient candidates and one ${reviewQueue.length}-case pilot review\n`)
}
