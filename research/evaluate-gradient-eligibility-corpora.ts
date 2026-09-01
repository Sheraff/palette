import { availableParallelism } from "node:os"
import { readFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { extractGradientEligiblePalette, type GradientEligibilityCertificate } from "./src/gradient-eligibility-extract.ts"
import { GRADIENT_ELIGIBILITY_CANDIDATE_VERSION } from "./src/gradient-eligibility.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, ExtractionResult } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

type Cohort = "development" | "holdout"
type Task = { cohort: Cohort; file: string; sourcePath: string }
type WorkerResult = { cohort: Cohort; file: string; extraction: ExtractionResult; certificate: GradientEligibilityCertificate }

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const [index, task] of tasks.entries()) {
		const image = await loadImage(task.sourcePath)
		results.push({ cohort: task.cohort, file: task.file, ...extractGradientEligiblePalette(image) })
		if ((index + 1) % 5 === 0) parentPort?.postMessage({ progress: 5 })
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
				process.stderr.write(`validation corpora: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Validation-corpus worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`validation corpora: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort, "en") ||
		first.file.localeCompare(second.file, "en"))
}

function sourcePath(cohort: Cohort, file: string): string {
	if (cohort === "development") {
		if (file !== basename(file)) throw new Error(`Invalid development source file: ${file}`)
		return join(projectRoot, "images", file)
	}
	if (!/^00\/[^/\\]+$/.test(file)) throw new Error(`Invalid holdout source file: ${file}`)
	return join(projectRoot, file)
}

function validateCandidate(candidate: ExtractionResult, baseline: ExtractionResult, file: string): void {
	if (candidate.version !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
		!isDeepStrictEqual(candidate.candidates, baseline.candidates) ||
		!isDeepStrictEqual(candidate.methods.expressive, baseline.methods.expressive) ||
		!isDeepStrictEqual(candidate.methods.quantized, baseline.methods.quantized)) {
		throw new Error(`Eligibility candidate changed frozen non-spatial output for ${file}`)
	}
	const restored = {
		...candidate.methods.spatial,
		gradient: { ...candidate.methods.spatial.gradient, isGradient: baseline.methods.spatial.gradient.isGradient },
	}
	if (!isDeepStrictEqual(restored, baseline.methods.spatial)) {
		throw new Error(`Eligibility candidate changed frozen spatial output beyond the gradient decision for ${file}`)
	}
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	const [developmentArgument, holdoutArgument, outputArgument] = process.argv.slice(2)
	if (!developmentArgument || !holdoutArgument || !outputArgument) {
		throw new Error("Usage: evaluate-gradient-eligibility-corpora.ts <results.json> <holdout-results.json> <output.json>")
	}
	const [developmentSource, holdoutSource] = await Promise.all([
		readFile(resolve(developmentArgument), "utf8"),
		readFile(resolve(holdoutArgument), "utf8"),
	])
	const development = JSON.parse(developmentSource) as CorpusResult
	const holdout = JSON.parse(holdoutSource) as CorpusResult
	if (development.algorithmVersion !== "region-graph-0.17.0" || holdout.algorithmVersion !== "region-graph-0.17.0") {
		throw new Error("Validation corpora are not canonical region-graph-0.17.0 outputs")
	}
	const baselineByKey = new Map<string, ExtractionResult>()
	const tasks: Task[] = []
	for (const [cohort, corpus] of [["development", development], ["holdout", holdout]] as const) {
		for (const entry of corpus.entries) {
			const key = `${cohort}:${entry.file}`
			if (baselineByKey.has(key)) throw new Error(`Duplicate validation entry: ${key}`)
			baselineByKey.set(key, entry.extraction)
			tasks.push({ cohort, file: entry.file, sourcePath: sourcePath(cohort, entry.file) })
		}
	}
	const results = await runParallel(tasks)
	const entries = results.map((result) => {
		const baseline = baselineByKey.get(`${result.cohort}:${result.file}`)!
		validateCandidate(result.extraction, baseline, result.file)
		return {
			cohort: result.cohort,
			file: result.file,
			background: result.extraction.methods.spatial.background.rgb,
			surface: result.extraction.methods.spatial.surface.rgb,
			baselineGradient: result.certificate.baselineGradient,
			candidateEligible: result.certificate.decision.eligible,
			reason: result.certificate.decision.reason,
			evidence: result.certificate.evidence,
		}
	})
	const summary = (cohort: Cohort) => {
		const values = entries.filter((entry) => entry.cohort === cohort)
		const gradients = values.filter((entry) => entry.baselineGradient)
		return {
			entries: values.length,
			baselineGradients: gradients.length,
			candidateEligible: gradients.filter((entry) => entry.candidateEligible).length,
			candidateRejected: gradients.filter((entry) => !entry.candidateEligible).length,
			reasons: Object.fromEntries([...new Set(gradients.map((entry) => entry.reason))].sort().map((reason) =>
				[reason, gradients.filter((entry) => entry.reason === reason).length])),
		}
	}
	await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
		schemaVersion: 1,
		evaluationVersion: "gradient-eligibility-validation-corpora-0.1.0",
		generatedAt: new Date().toISOString(),
		candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
		invariant: "only-spatial-gradient-boolean-may-change",
		summary: { development: summary("development"), holdout: summary("holdout") },
		entries,
	})
	process.stderr.write(`Evaluated eligibility on ${entries.length} frozen validation entries\n`)
}
