import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	buildJointPaletteEvidence,
	evaluateJointPaletteOverlayContrast,
	JOINT_PALETTE_EVIDENCE_VERSION,
} from "./src/joint-palette-evidence.ts"
import type { CorpusResult } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-evidence-frontier-0.1.1-development"
const STAGE_2_EXPERIMENT_ID = "b5681a99e635dfa94bac6d6bc33f35a96264f341d2743f3d9e92341c949ddd17"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	stage2Manifest:
		"research/data/experiments/connected-family-representative-fidelity-0.1.0-development/manifest.json",
	stage2Analysis:
		"research/data/experiments/connected-family-representative-fidelity-0.1.0-development/analysis.json",
	completeAccentAttribution:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/complete-review-attribution.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/field-relation.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/joint-palette-evidence.ts",
	"research/evaluate-joint-palette-evidence-frontier-development.ts",
	"research/tests/joint-palette-evidence.test.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	counts: {
		fieldNodes: number
		fieldTreatments: number
		collapsedTreatments: number
		distinctFlatTreatments: number
		gradientTreatments: number
		baseOverlays: number
		localOverlays: number
		overlayAlternatives: number
		pairOverlayRelations: number
		logicalCompleteTuples: number
		subtlePositiveDistanceGradients: number
	}
	hashes: { fieldTreatmentsSha256: string; overlaysSha256: string }
	structural: { violations: string[] }
	elapsedMs: number
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

async function evaluate(source: Source): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(source.path)) throw new Error(`Unauthorized source path: ${source.path}`)
	const bytes = await readFile(join(projectRoot, source.path))
	if (bytes.byteLength !== source.bytes || sha256(bytes) !== source.sha256) throw new Error(`Source binding changed: ${source.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const evidence = buildJointPaletteEvidence(image)
	const violations: string[] = []
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	const fieldIds = new Set(evidence.graph.fieldNodeIds)
	if (evidence.counts.fieldNodes !== fieldIds.size || [...fieldIds].some((id) => !nodeById.get(id)?.fieldEligibility.eligible)) {
		violations.push("field-domain")
	}
	for (const overlay of evidence.overlays) {
		const pixel = overlay.provenance.representativePixelIndex
		const offset = pixel * 3
		if (overlay.rgb[0] !== image.data[offset] || overlay.rgb[1] !== image.data[offset + 1] ||
			overlay.rgb[2] !== image.data[offset + 2]) violations.push("overlay-source-provenance")
		if (overlay.generated || overlay.evidence.foregroundSupport < 0 || overlay.evidence.foregroundSupport > 1 ||
			overlay.evidence.accentIdentitySupport < 0 || overlay.evidence.accentIdentitySupport > 1) {
			violations.push("overlay-evidence")
		}
	}
	const pairKeys = new Set<string>()
	let pairOverlayRelations = 0
	for (const treatment of evidence.fieldTreatments) {
		const background = nodeById.get(treatment.backgroundNodeId)
		const surface = nodeById.get(treatment.surfaceNodeId)
		if (!background || !surface || !fieldIds.has(background.id) || !fieldIds.has(surface.id)) {
			violations.push("field-treatment-membership")
			continue
		}
		const collapsed = background.rgb.join(",") === surface.rgb.join(",")
		if (collapsed !== (treatment.state === "collapsed") || treatment.state === "gradient" && treatment.endpointDistance <= 0) {
			violations.push("field-treatment-state")
		}
		const pairKey = `${background.id}>${surface.id}`
		if (pairKeys.has(pairKey)) continue
		pairKeys.add(pairKey)
		for (const overlay of evidence.overlays) {
			const contrast = evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb)
			pairOverlayRelations += 2
			if (!Number.isFinite(contrast.background.signedLc) || !Number.isFinite(contrast.surface.signedLc)) {
				violations.push("non-finite-apca")
			}
		}
	}
	if (!evidence.invariants.fixedApcaAdmissionFloorAbsent || !evidence.invariants.fieldEvidenceIndependentOfOverlays) {
		violations.push("policy-invariant")
	}
	const elapsedMs = performance.now() - started
	return {
		cohort: source.cohort,
		file: source.path,
		source: { sha256: source.sha256, bytes: source.bytes },
		counts: {
			...evidence.counts,
			pairOverlayRelations,
			logicalCompleteTuples: evidence.counts.fieldTreatments * evidence.counts.overlayAlternatives ** 2,
			subtlePositiveDistanceGradients: evidence.fieldTreatments.filter((treatment) =>
				treatment.state === "gradient" && treatment.endpointDistance > 0 && treatment.endpointDistance < 0.025).length,
		},
		hashes: {
			fieldTreatmentsSha256: sha256(JSON.stringify(canonicalValue(evidence.fieldTreatments))),
			overlaysSha256: sha256(JSON.stringify(canonicalValue(evidence.overlays))),
		},
		structural: { violations: [...new Set(violations)].sort() },
		elapsedMs,
	}
}

async function runWorker(sources: Source[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const source of sources) {
		results.push(await evaluate(source))
		parentPort?.postMessage({ progress: 1 })
	}
	return results
}

async function runParallel(sources: Source[]): Promise<WorkerResult[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, sources.length)
	const partitions = Array.from({ length: workerCount }, () => [] as Source[])
	for (const [index, source] of sources.entries()) partitions[index % workerCount].push(source)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 10 === 0 || completed === sources.length) {
					process.stderr.write(`joint evidence frontier: ${completed}/${sources.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Joint evidence worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`joint evidence frontier: ${results.length}/${sources.length}\n`)
	return results
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing joint evidence experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-evidence-frontier-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const stage2Manifest = parse<{ experimentId: string; sources: Source[] }>("stage2Manifest")
	const stage2Analysis = parse<{ experimentId: string; stoppingRules: { pass: boolean } }>("stage2Analysis")
	const attribution = parse<{ coverage: { complete: boolean }; disposition: { nextStageAuthorized: string } }>(
		"completeAccentAttribution",
	)
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (stage2Manifest.experimentId !== STAGE_2_EXPERIMENT_ID || stage2Analysis.experimentId !== STAGE_2_EXPERIMENT_ID ||
		!stage2Analysis.stoppingRules.pass || stage2Manifest.sources.length !== 392 || !attribution.coverage.complete ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Joint evidence frontier input bindings disagree")
	}
	const canonicalHashesBefore = {
		development: inputs.canonicalDevelopment.sha256,
		cohort00: inputs.canonical00.sha256,
	}
	const results = await runParallel(stage2Manifest.sources)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const canonicalHashesAfter = {
		development: sha256(await readFile(join(projectRoot, inputFiles.canonicalDevelopment))),
		cohort00: sha256(await readFile(join(projectRoot, inputFiles.canonical00))),
	}
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		evidenceVersion: JOINT_PALETTE_EVIDENCE_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			changesPaletteOutput: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			all392SourcesRequired: true,
			everyOverlayMustBeSourceExact: true,
			connectedLocalRepresentativesMustRemainOverlayOnly: true,
			allSignedApcaMustBeFinite: true,
			noFixedApcaAdmissionFloor: true,
			canonicalArtifactsMustRemainByteIdentical: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		evidenceVersion: JOINT_PALETTE_EVIDENCE_VERSION,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: stage2Manifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const aggregate = <K extends keyof WorkerResult["counts"]>(key: K) =>
		results.reduce((sum, result) => sum + result.counts[key], 0)
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		coverage: {
			total: results.length,
			development: results.filter((result) => result.cohort === "development").length,
			cohort00: results.filter((result) => result.cohort === "00").length,
		},
		totals: {
			fieldNodes: aggregate("fieldNodes"),
			fieldTreatments: aggregate("fieldTreatments"),
			collapsedTreatments: aggregate("collapsedTreatments"),
			distinctFlatTreatments: aggregate("distinctFlatTreatments"),
			gradientTreatments: aggregate("gradientTreatments"),
			baseOverlays: aggregate("baseOverlays"),
			localOverlays: aggregate("localOverlays"),
			overlayAlternatives: aggregate("overlayAlternatives"),
			pairOverlayRelations: aggregate("pairOverlayRelations"),
			logicalCompleteTuples: aggregate("logicalCompleteTuples"),
			subtlePositiveDistanceGradients: aggregate("subtlePositiveDistanceGradients"),
		},
		canonicalPreservation: {
			pass: JSON.stringify(canonicalHashesBefore) === JSON.stringify(canonicalHashesAfter),
			rawHashesBefore: canonicalHashesBefore,
			rawHashesAfter: canonicalHashesAfter,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		stoppingRules: {
			pass: violations.length === 0 && results.length === 392 &&
				JSON.stringify(canonicalHashesBefore) === JSON.stringify(canonicalHashesAfter),
		},
		disposition: violations.length === 0 ? "stage-4-evidence-complete-proceed-to-joint-candidate" : "stage-4-rejected",
	}
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		evidenceVersion: JOINT_PALETTE_EVIDENCE_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
	])
	process.stderr.write(`Wrote joint evidence frontier ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Source[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
