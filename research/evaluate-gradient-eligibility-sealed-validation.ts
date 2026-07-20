import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { extractGradientEligiblePalette, type GradientEligibilityCertificate } from "./src/gradient-eligibility-extract.ts"
import {
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
} from "./src/gradient-eligibility.ts"
import { loadImage } from "./src/image.ts"
import type { Palette } from "./src/types.ts"

type Source = { file: string; sha256: string; width: number; height: number; bytes: number }
type Family = { familyId: string; anchor: Source; variants: Source[] }
type Manifest = {
	manifestVersion: string
	protocolSha256: string
	baselineAlgorithmVersion: string
	candidateAlgorithmVersion: string
	evidenceVersion: string
	thresholds: unknown
	implementationSha256: Record<string, string>
	inputs: { sourceDirectory: string }
	families: Family[]
	manifestId: string
}
type Task = { familyId: string; anchor: Source; variants: Source[]; sourceDirectory: string }
type WorkerResult = {
	familyId: string
	anchor: Source
	normalized: { width: number; height: number }
	palette: Palette
	certificate: GradientEligibilityCertificate
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const [manifestArgument, outputArgument] = process.argv.slice(2)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	if (!/^0[1-6]$/.test(task.sourceDirectory) || task.variants.length === 0 || task.variants.some((source) =>
		!new RegExp(`^${task.sourceDirectory}/[^/\\\\]+$`).test(source.file))) {
		throw new Error(`Invalid sealed source path for ${task.familyId}`)
	}
	const verified = await Promise.all(task.variants.map(async (source) => {
		const bytes = await readFile(join(projectRoot, source.file))
		if (bytes.byteLength !== source.bytes || sha256(bytes) !== source.sha256) {
			throw new Error(`Sealed source changed: ${source.file}`)
		}
		return { source, bytes }
	}))
	const anchor = verified.find((entry) => entry.source.file === task.anchor.file &&
		entry.source.sha256 === task.anchor.sha256)
	if (!anchor) {
		throw new Error(`Sealed anchor is absent from its family variants: ${task.anchor.file}`)
	}
	const image = await loadImage(anchor.bytes)
	const result = extractGradientEligiblePalette(image)
	return {
		familyId: task.familyId,
		anchor: task.anchor,
		normalized: { width: image.width, height: image.height },
		palette: result.extraction.methods.spatial,
		certificate: result.certificate,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const [index, task] of tasks.entries()) {
		results.push(await evaluateTask(task))
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
				process.stderr.write(`sealed validation: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Sealed-validation worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`sealed validation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	if (!manifestArgument || !outputArgument) {
		throw new Error("Usage: evaluate-gradient-eligibility-sealed-validation.ts <manifest.json> <output.json>")
	}
	const manifestSource = await readFile(resolve(manifestArgument))
	const manifest = JSON.parse(manifestSource.toString("utf8")) as Manifest
	const round = manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.1.0" ? 1 :
		manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.2.0" ? 2 :
		manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.3.0" ? 3 :
		manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.4.0" ? 4 :
		manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.5.0" ? 5 :
		manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.6.0" ? 6 : 0
	const protocolFile = round === 1 ? "GRADIENT_ELIGIBILITY_VALIDATION.md" :
		round === 2 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8.md" :
		round === 3 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_1.md" :
		round === 4 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_4.md" :
		round === 5 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_5.md" :
		round === 6 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_6.md" : ""
	if (round === 0 || manifest.inputs?.sourceDirectory !== `0${round}` ||
		manifest.baselineAlgorithmVersion !== ALGORITHM_VERSION ||
		manifest.candidateAlgorithmVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
		manifest.evidenceVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
		!isDeepStrictEqual(manifest.thresholds, GRADIENT_ELIGIBILITY_THRESHOLDS) || !Array.isArray(manifest.families)) {
		throw new Error("Manifest does not match the frozen candidate")
	}
	const { manifestId: _manifestId, ...draft } = manifest
	if (sha256(JSON.stringify(draft)) !== manifest.manifestId) throw new Error("Manifest ID is invalid")
	const protocolSource = await readFile(join(researchRoot, protocolFile))
	if (sha256(protocolSource) !== manifest.protocolSha256) throw new Error("Validation protocol changed after sealing")
	for (const [file, expected] of Object.entries(manifest.implementationSha256)) {
		if (sha256(await readFile(join(researchRoot, file))) !== expected) {
			throw new Error(`Frozen candidate implementation changed: ${file}`)
		}
	}
	const familyIds = new Set<string>()
	const sourceFiles = new Set<string>()
	for (const family of manifest.families) {
		if (familyIds.has(family.familyId) || sourceFiles.has(family.anchor.file)) {
			throw new Error("Manifest contains duplicated validation coverage")
		}
		familyIds.add(family.familyId)
		sourceFiles.add(family.anchor.file)
	}
	const results = await runParallel(manifest.families.map((family) => ({ familyId: family.familyId,
		anchor: family.anchor, variants: family.variants, sourceDirectory: manifest.inputs.sourceDirectory })))
	for (const result of results) {
		const certificate = result.certificate
		if (certificate.algorithmVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
			certificate.baselineAlgorithmVersion !== ALGORITHM_VERSION || !certificate.invariants.rolesUnchanged ||
			!certificate.invariants.pairSpecificEvidenceOnly || !certificate.invariants.globalSmoothFallbackDisabled ||
			certificate.baselineGradient !== (certificate.evidence !== null) ||
			result.palette.gradient.isGradient !== certificate.decision.eligible) {
			throw new Error(`Invalid candidate certificate for ${result.familyId}`)
		}
	}
	const gradients = results.filter((result) => result.certificate.baselineGradient)
	const eligible = gradients.filter((result) => result.certificate.decision.eligible)
	const rejected = gradients.filter((result) => !result.certificate.decision.eligible)
	const evaluatorSource = await readFile(fileURLToPath(import.meta.url))
	await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
		schemaVersion: 1,
		evaluationVersion: `gradient-eligibility-sealed-validation-evaluation-0.${round}.0`,
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		manifestSha256: sha256(manifestSource),
		evaluatorSha256: sha256(evaluatorSource),
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		candidateAlgorithmVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
		evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
		invariant: "only-spatial-gradient-boolean-may-change",
		summary: {
			families: results.length,
			baselineGradients: gradients.length,
			candidateEligible: eligible.length,
			candidateRejected: rejected.length,
			reasons: Object.fromEntries([...new Set(rejected.map((result) => result.certificate.decision.reason))]
				.sort().map((reason) => [reason, rejected.filter((result) => result.certificate.decision.reason === reason).length])),
		},
		entries: results,
	})
	process.stderr.write(`Evaluated frozen eligibility on ${results.length} sealed families; ${rejected.length} require review\n`)
}
