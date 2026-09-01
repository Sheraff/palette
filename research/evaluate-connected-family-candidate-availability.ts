import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import {
	buildConnectedFamilyCandidateAvailability,
	CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
} from "./src/connected-family-candidate-availability.ts"
import { okDistance } from "./src/color.ts"
import { loadImage } from "./src/image.ts"
import { PALETTE_PERCEPTION_VERSION, perceivePaletteImage } from "./src/palette-perception.ts"

const EXPERIMENT_VERSION = "connected-family-candidate-availability-0.1.0-development"
const INPUT_EXPERIMENT_ID = "37d74b745d07fda30af10ceee98e5440ac262e3fca2995ba5270bc0118c72f0a"
const ATTRIBUTION_EXPERIMENT_ID = "883e547342ea726d4ba914b2405c5ec92b9489f2efd152d0d68ae2b6361389d1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const inputFiles = {
	paletteManifest: "research/data/experiments/next-palette-0.3.0-relation-development/manifest.json",
	technicalAttribution: "research/data/experiments/next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette-perception.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/evaluate-connected-family-candidate-availability.ts",
	"research/tests/connected-family-candidate-availability.test.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Task = Source
type Manifest = { experimentId: string; sources: Source[] }
type Attribution = {
	experimentId: string
	identityOmissionAttribution: Array<{ file: string; attribution: string; evidence: string }>
}
type Result = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	baselineCandidateCount: number
	violations: string[]
	proposals: Array<{
		stableKey: string
		anchorDegrees: number
		hex: string
		rgb: readonly number[]
		representativePixelIndex: number
		maskSha256: string
		population: number
		chroma: number
		saliency: number
		text: number
		componentCount: number
		evidencedRegionCount: number
		supportingRegionCount: number
		nearestBaselineCandidateId: number | null
		nearestBaselineDistance: number | null
	}>
	anchors: ReturnType<typeof buildConnectedFamilyCandidateAvailability>["anchors"]
	diagnostics: ReturnType<typeof buildConnectedFamilyCandidateAvailability>["diagnostics"]
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

async function evaluate(task: Task): Promise<Result> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Invalid source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	const sourceSha256 = sha256(bytes)
	if (sourceSha256 !== task.sha256 || bytes.byteLength !== task.bytes) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const perception = perceivePaletteImage(image)
	const started = performance.now()
	const availability = buildConnectedFamilyCandidateAvailability(perception)
	const elapsedMs = performance.now() - started
	const violations: string[] = []
	const recordsById = new Map(perception.candidateRecords.map((record) => [record.candidateId, record]))
	const stableKeys = new Set<string>()
	for (const proposal of availability.proposals) {
		const mask = proposal.mask
		const support = mask.reduce((sum, value) => sum + value, 0)
		const offset = proposal.representativePixelIndex * 3
		if (!mask[proposal.representativePixelIndex] || proposal.rgb[0] !== image.data[offset] ||
			proposal.rgb[1] !== image.data[offset + 1] || proposal.rgb[2] !== image.data[offset + 2]) {
			violations.push(`source-provenance:${proposal.stableKey}`)
		}
		if (sha256(mask) !== proposal.maskSha256 || Math.abs(support / mask.length - proposal.population) > 1e-12) {
			violations.push(`mask-provenance:${proposal.stableKey}`)
		}
		if (stableKeys.has(proposal.stableKey)) violations.push(`duplicate-stable-key:${proposal.stableKey}`)
		stableKeys.add(proposal.stableKey)
		for (const candidate of perception.candidates) {
			const record = recordsById.get(candidate.id)!
			if (okDistance(proposal.lab, candidate.lab) <= availability.thresholds.representedDistance &&
				mask[record.representativePixelIndex]) violations.push(`already-represented:${proposal.stableKey}:${candidate.id}`)
		}
		const trace = availability.anchors.find((anchor) => anchor.proposalStableKey === proposal.stableKey)
		if (!trace || trace.outcome !== "qualified" || trace.populationRoute === null) {
			violations.push(`unbound-anchor:${proposal.stableKey}`)
		}
	}
	if (availability.anchors.length !== availability.thresholds.hueAnchorCount ||
		availability.diagnostics.selected !== availability.proposals.length) violations.push("diagnostic-reconciliation")
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: sourceSha256, bytes: bytes.byteLength },
		baselineCandidateCount: perception.candidates.length,
		violations: [...new Set(violations)],
		proposals: availability.proposals.map((proposal) => ({
			stableKey: proposal.stableKey,
			anchorDegrees: proposal.anchorDegrees,
			hex: proposal.hex,
			rgb: proposal.rgb,
			representativePixelIndex: proposal.representativePixelIndex,
			maskSha256: proposal.maskSha256,
			population: proposal.population,
			chroma: proposal.chroma,
			saliency: proposal.saliency,
			text: proposal.text,
			componentCount: proposal.componentFirstPixelIndices.length,
			evidencedRegionCount: proposal.evidencedRegionCount,
			supportingRegionCount: proposal.supportingRegionCount,
			nearestBaselineCandidateId: proposal.nearestBaselineCandidateId,
			nearestBaselineDistance: proposal.nearestBaselineDistance,
		})),
		anchors: availability.anchors,
		diagnostics: availability.diagnostics,
		elapsedMs,
	}
}

async function runWorker(tasks: Task[]): Promise<Result[]> {
	const results: Result[] = []
	for (const task of tasks) {
		results.push(await evaluate(task))
		parentPort?.postMessage({ progress: 1 })
	}
	return results
}

async function runParallel(tasks: Task[]): Promise<Result[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<Result[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: Result[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 20 === 0 || completed === tasks.length) {
					process.stderr.write(`connected family availability: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Connected family worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`connected family availability: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing availability experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("evaluate-connected-family-candidate-availability.ts does not accept arguments")
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const manifest = JSON.parse(inputs.paletteManifest.raw.toString("utf8")) as Manifest
	const attribution = JSON.parse(inputs.technicalAttribution.raw.toString("utf8")) as Attribution
	if (manifest.experimentId !== INPUT_EXPERIMENT_ID || attribution.experimentId !== ATTRIBUTION_EXPERIMENT_ID ||
		manifest.sources.length !== 392) throw new Error("Availability input bindings disagree")
	const known = attribution.identityOmissionAttribution.filter((entry) => entry.attribution === "candidate-availability")
	if (known.length !== 6) throw new Error("Known availability cohort binding changed")
	const results = await runParallel(manifest.sources)
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const knownEntries = known.map((entry) => {
		const result = resultByFile.get(entry.file)
		if (!result) throw new Error(`Known availability case is outside matrix: ${entry.file}`)
		return { ...entry, proposals: result.proposals }
	})
	const violations = results.filter((result) => result.violations.length > 0)
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAvailabilityVersion: CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
		baselinePerceptionVersion: PALETTE_PERCEPTION_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			proposalsPassedToRoleSolver: false,
			newHumanReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			allSixKnownAvailabilityCasesMustEmitSourceExactConnectedProposals: true,
			isolatedChromaticSpecksMustNotQualify: true,
			targetColorsInferred: false,
		},
	}
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: results.map((result) => ({ cohort: result.cohort, path: result.file, ...result.source })),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const proposalCounts = new Map<number, number>()
	for (const result of results) proposalCounts.set(result.proposals.length, (proposalCounts.get(result.proposals.length) ?? 0) + 1)
	const evaluation = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ file: result.file, violations: result.violations })),
		},
		matrix: {
			total: results.length,
			withProposals: results.filter((result) => result.proposals.length > 0).length,
			withoutProposals: results.filter((result) => result.proposals.length === 0).length,
			totalProposals: results.reduce((sum, result) => sum + result.proposals.length, 0),
			maximumProposals: Math.max(...results.map((result) => result.proposals.length)),
			meanProposals: results.reduce((sum, result) => sum + result.proposals.length, 0) / results.length,
			proposalCountDistribution: Object.fromEntries([...proposalCounts].sort((first, second) => first[0] - second[0])),
			populationRoutes: Object.fromEntries(["ordinary", "large-component", "repeated-components"].map((route) => [route,
				results.flatMap((result) => result.anchors).filter((anchor) => anchor.outcome === "qualified" &&
					anchor.populationRoute === route).length])),
		},
		knownAvailabilityCohort: {
			total: knownEntries.length,
			withProposals: knownEntries.filter((entry) => entry.proposals.length > 0).length,
			pass: knownEntries.every((entry) => entry.proposals.length > 0),
			entries: knownEntries,
		},
		roleIntegrationAuthorized: false,
		disposition: violations.length === 0 && knownEntries.every((entry) => entry.proposals.length > 0)
			? "availability-stop-passes-role-integration-not-yet-authorized"
			: "availability-development-rejected",
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
		},
		entries: results,
		limitations: [
			"Proposal presence does not infer a target color from qualitative comments.",
			"Availability does not authorize any field, foreground, or accent role.",
			"The matrix is restricted to the same 392 development sources; 10 through 14 remain unopened.",
		],
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "evaluation.json"), evaluation),
	])
	process.stderr.write(`Wrote connected family availability experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
