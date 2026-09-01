import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { extractGradientEligiblePalette } from "./src/gradient-eligibility-extract.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import { loadImage } from "./src/image.ts"
import type { RGB } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

type SourceImage = { file: string; sha256: string; width: number; height: number }
type ManifestFamily = { familyId: string; anchor: SourceImage; variants: SourceImage[] }
type Manifest = { manifestId: string; families: ManifestFamily[] }
type DevelopmentEntry = {
	familyId: string
	anchor: SourceImage
	palette: { background: { rgb: RGB }; surface: { rgb: RGB } }
	evidence: Parameters<typeof decideGradientEligibility>[0]
}
type Development = {
	sourceManifest: { id: string; sha256: string }
	entries: DevelopmentEntry[]
}
type Task = { familyId: string; source: SourceImage }
type WorkerResult = {
	familyId: string
	source: SourceImage
	background: RGB
	surface: RGB
	baselineGradient: boolean
	candidateEligible: boolean
	reason: string
	connectedFieldContinuity: number | null
	connectedFieldShare: number | null
	flatBackgroundIsolatedSurfaceRisk: number | null
	evidence: GradientEligibilityEvidence | null
}

function sha256(value: Buffer | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSource(value: unknown): SourceImage {
	if (!isRecord(value) || typeof value.file !== "string" || typeof value.sha256 !== "string" ||
		!Number.isInteger(value.width) || !Number.isInteger(value.height) ||
		!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(value.file) ||
		!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("Variant source is invalid")
	return value as SourceImage
}

function parseManifest(value: unknown): Manifest {
	if (!isRecord(value) || typeof value.manifestId !== "string" || !Array.isArray(value.families)) {
		throw new Error("Music-family manifest is invalid")
	}
	const seen = new Set<string>()
	const families = value.families.map((family): ManifestFamily => {
		if (!isRecord(family) || typeof family.familyId !== "string" || seen.has(family.familyId) ||
			!Array.isArray(family.variants)) throw new Error("Music-family manifest contains an invalid family")
		seen.add(family.familyId)
		return { familyId: family.familyId, anchor: parseSource(family.anchor), variants: family.variants.map(parseSource) }
	})
	return { manifestId: value.manifestId, families }
}

function parseDevelopment(value: unknown): Development {
	if (!isRecord(value) || !isRecord(value.sourceManifest) || typeof value.sourceManifest.id !== "string" ||
		typeof value.sourceManifest.sha256 !== "string" || !Array.isArray(value.entries)) {
		throw new Error("Gradient development evidence is invalid")
	}
	return value as unknown as Development
}

function sourcePath(file: string): string {
	if (!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(file)) {
		throw new Error(`Invalid music-artwork source path: ${file}`)
	}
	return resolve(projectRoot, file)
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	const bytes = await readFile(sourcePath(task.source.file))
	if (sha256(bytes) !== task.source.sha256) throw new Error(`Source hash changed for ${task.source.file}`)
	const image = await loadImage(bytes)
	const result = extractGradientEligiblePalette(image)
	const spatial = result.extraction.methods.spatial
	return {
		familyId: task.familyId,
		source: task.source,
		background: spatial.background.rgb,
		surface: spatial.surface.rgb,
		baselineGradient: result.certificate.baselineGradient,
		candidateEligible: result.certificate.decision.eligible,
		reason: result.certificate.decision.reason,
		connectedFieldContinuity: result.certificate.evidence?.connectedField.continuity ?? null,
		connectedFieldShare: result.certificate.evidence?.connectedField.shareOfColorPath ?? null,
		flatBackgroundIsolatedSurfaceRisk: result.certificate.evidence?.flatBackgroundIsolatedSurfaceRisk ?? null,
		evidence: result.certificate.evidence,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const [index, task] of tasks.entries()) {
		results.push(await evaluateTask(task))
		if ((index + 1) % 10 === 0) parentPort?.postMessage({ progress: 10 })
	}
	return results
}

async function runParallel(tasks: Task[]): Promise<WorkerResult[]> {
	if (tasks.length === 0) return []
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
				process.stderr.write(`native variants: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Native-variant worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`native variants: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.familyId.localeCompare(second.familyId, "en") ||
		first.source.file.localeCompare(second.source.file, "en"))
}

function endpointDistance(first: RGB, second: RGB): number {
	return okDistance(rgbToOKLab(first), rgbToOKLab(second))
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	const [manifestArgument, developmentArgument, outputArgument] = process.argv.slice(2)
	if (!manifestArgument || !developmentArgument || !outputArgument) {
		throw new Error("Usage: evaluate-gradient-eligibility-variants.ts <manifest.json> <development.json> <output.json>")
	}
	const [manifestSource, developmentSource] = await Promise.all([
		readFile(resolve(manifestArgument)),
		readFile(resolve(developmentArgument)),
	])
	const manifest = parseManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	const development = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
	if (development.sourceManifest.id !== manifest.manifestId || development.sourceManifest.sha256 !== sha256(manifestSource)) {
		throw new Error("Development evidence does not match the music-family manifest")
	}
	const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
	const tasks = manifest.families.filter((family) => developmentByFamily.has(family.familyId))
		.flatMap((family) => family.variants.filter((variant) => variant.file !== family.anchor.file &&
			Math.min(variant.width, variant.height) >= 224).map((source) => ({ familyId: family.familyId, source })))
	const results = await runParallel(tasks)
	const byFamily = new Map<string, WorkerResult[]>()
	for (const result of results) {
		const family = byFamily.get(result.familyId) ?? []
		family.push(result)
		byFamily.set(result.familyId, family)
	}
	const details = [...byFamily].map(([familyId, variants]) => {
		const anchor = developmentByFamily.get(familyId)!
		const anchorDecision = decideGradientEligibility(anchor.evidence)
		const comparisons = variants.map((variant) => {
			const backgroundDistance = endpointDistance(anchor.palette.background.rgb, variant.background)
			const surfaceDistance = endpointDistance(anchor.palette.surface.rgb, variant.surface)
			const endpointComparable = backgroundDistance <= 0.025 && surfaceDistance <= 0.025
			return {
				file: variant.source.file,
				backgroundDistance,
				surfaceDistance,
				endpointComparable,
				baselineGradient: variant.baselineGradient,
				candidateEligible: variant.candidateEligible,
				reason: variant.reason,
				connectedFieldContinuity: variant.connectedFieldContinuity,
				connectedFieldShare: variant.connectedFieldShare,
				flatBackgroundIsolatedSurfaceRisk: variant.flatBackgroundIsolatedSurfaceRisk,
				evidence: variant.evidence,
				candidateStable: endpointComparable && variant.candidateEligible === anchorDecision.eligible,
			}
		})
		const comparable = comparisons.filter((comparison) => comparison.endpointComparable)
		return {
			familyId,
			anchorEligible: anchorDecision.eligible,
			variants: comparisons.length,
			comparableVariants: comparable.length,
			candidateStable: comparable.length > 0 && comparable.every((comparison) => comparison.candidateStable),
			comparisons,
		}
	}).sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
	const comparable = details.flatMap((detail) => detail.comparisons.filter((comparison) => comparison.endpointComparable))
	await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
		schemaVersion: 1,
		evaluationVersion: "gradient-eligibility-native-variants-0.1.0",
		generatedAt: new Date().toISOString(),
		candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
		developmentSha256: sha256(developmentSource),
		manifestId: manifest.manifestId,
		manifestSha256: sha256(manifestSource),
		summary: {
			developmentGradientFamilies: development.entries.length,
			familiesWithNativeVariants: details.length,
			variantEvaluations: results.length,
			comparableVariants: comparable.length,
			stableComparableVariants: comparable.filter((comparison) => comparison.candidateStable).length,
			familiesWithComparableVariants: details.filter((detail) => detail.comparableVariants > 0).length,
			stableComparableFamilies: details.filter((detail) => detail.candidateStable).length,
			canonicalGradientStableComparableVariants: comparable.filter((comparison) => comparison.baselineGradient).length,
		},
		details,
	})
	process.stderr.write(`Evaluated ${results.length} native variants for ${details.length} gradient families\n`)
}
