import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import {
	buildConnectedFamilyRepresentativeFidelity,
	CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
	type ConnectedFamilyRepresentativeFidelity,
} from "./src/connected-family-representative-fidelity.ts"
import { perceivePaletteImageWithConnectedFamilies } from "./src/connected-family-palette-perception.ts"
import { loadImage } from "./src/image.ts"
import { buildConnectedFamilyPaletteRelationGraph } from "./src/palette-relation-graph.ts"
import { perceivePaletteImage } from "./src/palette-perception.ts"
import type { CorpusResult, ExtractionResult, RawImage, RGB } from "./src/types.ts"

const EXPERIMENT_VERSION = "connected-family-representative-fidelity-0.1.0-development"
const STAGE_1_EXPERIMENT_ID = "c305907f352afd35f71f85818b6a2149b5baa3a1e8984b969ceb20c6bdb6f2ed"
const AVAILABILITY_EXPERIMENT_ID = "5a82cc8dc56a7663217e2058bfdb9d684cb78f369942a11b3f0c2460e00f152a"
const TARGET_FILE = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"
const TARGET_SOURCE_SHA256 = "0770d36aab0b3de441354d34221ea1f6af1fd0ad2c0f8f6476f9e16de73bde93"
const TARGET_FAMILY_MASK_SHA256 = "f8c6cdcc12c31698f427a18f48879df2bad0c6ebbd515b60139f7a12ff98f5fb"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	stage1Manifest:
		"research/data/experiments/next-palette-soft-contrast-frontier-0.1.0-development/manifest.json",
	stage1Analysis:
		"research/data/experiments/next-palette-soft-contrast-frontier-0.1.0-development/analysis.json",
	availabilityManifest:
		"research/data/experiments/connected-family-candidate-availability-0.1.0-development/manifest.json",
	availabilityEvaluation:
		"research/data/experiments/connected-family-candidate-availability-0.1.0-development/evaluation.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	review04Manifest:
		"research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/batch-01-manifest.json",
	review04Interpretation:
		"research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/interpretation.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette-perception.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/connected-family-palette-perception.ts",
	"research/src/connected-family-palette-evidence-graph.ts",
	"research/src/field-relation.ts",
	"research/src/palette-relation-graph.ts",
	"research/evaluate-connected-family-representative-fidelity.ts",
	"research/tests/connected-family-representative-fidelity.test.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Stage1Manifest = { experimentId: string; sources: Source[] }
type AvailabilityProposal = { stableKey: string; maskSha256: string }
type AvailabilityEntry = { file: string; proposals: AvailabilityProposal[] }
type AvailabilityEvaluation = {
	experimentId: string
	matrix: { total: number; withProposals: number; totalProposals: number }
	knownAvailabilityCohort: { entries: Array<{ file: string; proposals: AvailabilityProposal[] }> }
	entries: AvailabilityEntry[]
}
type Task = Source & { canonical: ExtractionResult; expectedProposals: AvailabilityProposal[] }

type PresentedFidelity = {
	version: string
	availabilityVersion: string
	diagnostics: ConnectedFamilyRepresentativeFidelity["diagnostics"]
	invariants: ConnectedFamilyRepresentativeFidelity["invariants"]
	families: Array<{
		stableKey: string
		availabilityStableKey: string
		anchorIndex: number
		anchorDegrees: number
		binIds: readonly number[]
		maskSha256: string
		population: number
		componentFirstPixelIndices: readonly number[]
		availabilityRepresentative: ConnectedFamilyRepresentativeFidelity["families"][number]["availabilityRepresentative"]
		components: Array<{
			stableKey: string
			firstPixelIndex: number
			pixelCount: number
			population: number
			maskSha256: string
			representatives: Array<{
				stableKey: string
				sourceRegionId: number | null
				supportPixelCount: number
				supportMaskSha256: string
				binIds: readonly number[]
				center: readonly number[]
				representativePixelIndex: number
				rgb: RGB
				lab: readonly number[]
				hex: string
				chroma: number
				distanceToCenter: number
				membership: { field: false; overlay: true }
			}>
		}>
	}>
}

type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	canonicalRecomputed: true
	availabilityFamilyMaskSetSha256: string
	fidelity: PresentedFidelity
	violations: string[]
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

function deterministicId(value: unknown): string {
	return sha256(JSON.stringify(canonicalValue(value)))
}

function extractionWithoutRuntime(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function presentFidelity(fidelity: ConnectedFamilyRepresentativeFidelity): PresentedFidelity {
	return {
		version: fidelity.version,
		availabilityVersion: fidelity.availabilityVersion,
		diagnostics: fidelity.diagnostics,
		invariants: fidelity.invariants,
		families: fidelity.families.map((family) => ({
			stableKey: family.stableKey,
			availabilityStableKey: family.availabilityStableKey,
			anchorIndex: family.anchorIndex,
			anchorDegrees: family.anchorDegrees,
			binIds: family.binIds,
			maskSha256: family.maskSha256,
			population: family.population,
			componentFirstPixelIndices: family.componentFirstPixelIndices,
			availabilityRepresentative: family.availabilityRepresentative,
			components: family.components.map((component) => ({
				stableKey: component.stableKey,
				firstPixelIndex: component.firstPixelIndex,
				pixelCount: component.pixelCount,
				population: component.population,
				maskSha256: component.maskSha256,
				representatives: component.representatives.map((representative) => ({
					stableKey: representative.stableKey,
					sourceRegionId: representative.sourceRegionId,
					supportPixelCount: representative.supportPixelCount,
					supportMaskSha256: representative.supportMaskSha256,
					binIds: representative.binIds,
					center: representative.center,
					representativePixelIndex: representative.representativePixelIndex,
					rgb: representative.rgb,
					lab: representative.lab,
					hex: representative.hex,
					chroma: representative.chroma,
					distanceToCenter: representative.distanceToCenter,
					membership: representative.membership,
				})),
			})),
		})),
	}
}

function connected(mask: Uint8Array, width: number, height: number): boolean {
	const first = mask.findIndex((value) => value === 1)
	if (first < 0) return false
	const visited = new Uint8Array(mask.length)
	const stack = [first]
	visited[first] = 1
	let count = 0
	while (stack.length > 0) {
		const pixel = stack.pop()!
		const x = pixel % width
		const y = Math.floor(pixel / width)
		count++
		for (const neighbor of [
			x > 0 ? pixel - 1 : -1,
			x + 1 < width ? pixel + 1 : -1,
			y > 0 ? pixel - width : -1,
			y + 1 < height ? pixel + width : -1,
		]) {
			if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
				visited[neighbor] = 1
				stack.push(neighbor)
			}
		}
	}
	return count === mask.reduce((sum, value) => sum + value, 0)
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const recomputed = extractPalette(image)
	if (!isDeepStrictEqual(extractionWithoutRuntime(recomputed), extractionWithoutRuntime(task.canonical))) {
		throw new Error(`Canonical ${ALGORITHM_VERSION} output changed: ${task.path}`)
	}
	const perception = perceivePaletteImage(image)
	const started = performance.now()
	const first = buildConnectedFamilyRepresentativeFidelity(perception)
	const second = buildConnectedFamilyRepresentativeFidelity(perception)
	const elapsedMs = performance.now() - started
	const presented = presentFidelity(first)
	const violations: string[] = []
	if (!isDeepStrictEqual(presented, presentFidelity(second))) violations.push("nondeterministic-fidelity")
	const expectedMasks = task.expectedProposals.map((proposal) => proposal.maskSha256).sort()
	const actualMasks = first.families.map((family) => family.maskSha256).sort()
	if (!isDeepStrictEqual(actualMasks, expectedMasks)) violations.push("predecessor-family-mask-set")
	const expectedStableKeys = task.expectedProposals.map((proposal) => proposal.stableKey).sort()
	const actualStableKeys = first.families.map((family) => family.availabilityStableKey).sort()
	if (!isDeepStrictEqual(actualStableKeys, expectedStableKeys)) violations.push("predecessor-family-stable-key-set")
	const stableKeys = new Set<string>()
	for (const family of first.families) {
		if (stableKeys.has(family.stableKey)) violations.push(`duplicate-family:${family.stableKey}`)
		stableKeys.add(family.stableKey)
		if (sha256(family.mask) !== family.maskSha256) violations.push(`family-mask:${family.stableKey}`)
		const union = new Uint8Array(family.mask.length)
		for (const component of family.components) {
			if (stableKeys.has(component.stableKey)) violations.push(`duplicate-component:${component.stableKey}`)
			stableKeys.add(component.stableKey)
			const mask = component.mask
			if (sha256(mask) !== component.maskSha256 || !connected(mask, image.width, image.height)) {
				violations.push(`component-mask:${component.stableKey}`)
			}
			for (let pixel = 0; pixel < mask.length; pixel++) {
				if (union[pixel] && mask[pixel]) violations.push(`component-overlap:${family.stableKey}`)
				union[pixel] |= mask[pixel]
			}
			for (const representative of component.representatives) {
				if (stableKeys.has(representative.stableKey)) violations.push(`duplicate-representative:${representative.stableKey}`)
				stableKeys.add(representative.stableKey)
				const supportMask = representative.supportMask
				const offset = representative.representativePixelIndex * 3
				if (!mask[representative.representativePixelIndex] || !supportMask[representative.representativePixelIndex] ||
					representative.rgb[0] !== image.data[offset] || representative.rgb[1] !== image.data[offset + 1] ||
					representative.rgb[2] !== image.data[offset + 2]) {
					violations.push(`representative-provenance:${representative.stableKey}`)
				}
				if (sha256(supportMask) !== representative.supportMaskSha256 || representative.membership.field ||
					!representative.membership.overlay) violations.push(`representative-membership:${representative.stableKey}`)
			}
		}
		if (!isDeepStrictEqual(union, family.mask)) violations.push(`component-partition:${family.stableKey}`)
	}
	const integrated = perceivePaletteImageWithConnectedFamilies(image)
	const graph = buildConnectedFamilyPaletteRelationGraph(integrated)
	const reserveIds = new Set(graph.nodes.filter((node) => node.construction === "connected-family-reserve").map((node) => node.id))
	const fieldIds = new Set(graph.fieldNodeIds)
	if ([...reserveIds].some((id) => fieldIds.has(id))) violations.push("reserve-field-membership")
	if (graph.edges.some((edge) => (reserveIds.has(edge.fromId) || reserveIds.has(edge.toId)) && edge.fieldRelation)) {
		violations.push("reserve-field-relation")
	}
	const lloydIds = new Set(integrated.candidates.filter((candidate) => candidate.construction === "lloyd-cluster")
		.map((candidate) => candidate.id))
	const coverage = new Uint8Array(image.width * image.height)
	for (const record of integrated.candidateRecords) {
		if (!lloydIds.has(record.candidateId)) continue
		for (let pixel = 0; pixel < coverage.length; pixel++) coverage[pixel] += record.mask[pixel]
	}
	if (coverage.some((value) => value !== 1)) violations.push("lloyd-partition")
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonicalRecomputed: true,
		availabilityFamilyMaskSetSha256: deterministicId(actualMasks),
		fidelity: presented,
		violations: [...new Set(violations)].sort(),
		elapsedMs,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const task of tasks) {
		results.push(await evaluate(task))
		parentPort?.postMessage({ progress: 1 })
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
				if (completed % 10 === 0 || completed === tasks.length) {
					process.stderr.write(`connected family representative fidelity: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Representative fidelity worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`connected family representative fidelity: ${results.length}/${tasks.length}\n`)
	return results
}

function fixtureImage(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function isolatedSpeckQualifies(): boolean {
	const pink: RGB = [245, 70, 150]
	const black: RGB = [16, 18, 22]
	const isolatedPixels = new Set(Array.from({ length: 32 }, (_, index) => `${(index * 29) % 100},${(index * 47) % 100}`))
	const isolated = fixtureImage(100, 100, (x, y) => isolatedPixels.has(`${x},${y}`) ? pink : black)
	return buildConnectedFamilyRepresentativeFidelity(perceivePaletteImage(isolated)).families
		.some((family) => family.availabilityRepresentative.hex === "#f54696")
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing representative fidelity experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-connected-family-representative-fidelity.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, {
		path: string
		raw: Buffer
		sha256: string
	}>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const stage1Manifest = parse<Stage1Manifest>("stage1Manifest")
	const stage1Analysis = parse<{ experimentId: string; stoppingRules: { pass: boolean } }>("stage1Analysis")
	const availabilityManifest = parse<{ experimentId: string }>("availabilityManifest")
	const availability = parse<AvailabilityEvaluation>("availabilityEvaluation")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	const reviewManifest = parse<{ entries: Array<{ source: { file: string; sha256: string } }> }>("review04Manifest")
	const reviewInterpretation = parse<{ entries: Array<{ file: string; unresolved: string[] }> }>("review04Interpretation")
	if (stage1Manifest.experimentId !== STAGE_1_EXPERIMENT_ID || stage1Analysis.experimentId !== STAGE_1_EXPERIMENT_ID ||
		!stage1Analysis.stoppingRules.pass || availabilityManifest.experimentId !== AVAILABILITY_EXPERIMENT_ID ||
		availability.experimentId !== AVAILABILITY_EXPERIMENT_ID || availability.matrix.total !== 392 ||
		availability.matrix.withProposals !== 329 || availability.matrix.totalProposals !== 965 ||
		stage1Manifest.sources.length !== 392 || canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION ||
		canonical00.algorithmVersion !== ALGORITHM_VERSION) throw new Error("Representative fidelity input bindings disagree")
	const targetReview = reviewManifest.entries.find((entry) => entry.source.file === TARGET_FILE)
	const targetInterpretation = reviewInterpretation.entries.find((entry) => entry.file === TARGET_FILE)
	if (!targetReview || targetReview.source.sha256 !== TARGET_SOURCE_SHA256 || !targetInterpretation ||
		!targetInterpretation.unresolved.includes("connected-family representative fidelity")) {
		throw new Error("Representative fidelity stopping case binding changed")
	}
	const previousByFile = new Map(availability.entries.map((entry) => [entry.file, entry.proposals]))
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = stage1Manifest.sources.map((source): Task => {
		if (!/^(?:images|00)\/[^/\\]+$/.test(source.path)) throw new Error(`Unauthorized source path: ${source.path}`)
		const canonical = canonicalByFile.get(source.path)
		const expectedProposals = previousByFile.get(source.path)
		if (!canonical || !expectedProposals) throw new Error(`Missing fidelity predecessor: ${source.path}`)
		return { ...source, canonical, expectedProposals }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.violations.length > 0)
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const knownEntries = availability.knownAvailabilityCohort.entries.map((entry) => {
		const result = resultByFile.get(entry.file)
		if (!result) throw new Error(`Known availability case is outside fidelity matrix: ${entry.file}`)
		return {
			file: entry.file,
			expectedFamilyMasks: entry.proposals.map((proposal) => proposal.maskSha256).sort(),
			actualFamilyMasks: result.fidelity.families.map((family) => family.maskSha256).sort(),
		}
	})
	const target = resultByFile.get(TARGET_FILE)
	const targetFamily = target?.fidelity.families.find((family) => family.maskSha256 === TARGET_FAMILY_MASK_SHA256)
	const targetBright = targetFamily?.components.flatMap((component) => component.representatives)
		.find((representative) => representative.sourceRegionId === 143)
	if (!target || !targetFamily || !targetBright || targetBright.hex !== "#d8d418" ||
		targetBright.representativePixelIndex !== 25874) throw new Error("Target representative fidelity stop failed")
	const targetAvailabilityDistance = Math.hypot(
		targetFamily.availabilityRepresentative.lab[0] - targetBright.center[0],
		targetFamily.availabilityRepresentative.lab[1] - targetBright.center[1],
		targetFamily.availabilityRepresentative.lab[2] - targetBright.center[2],
	)
	if (targetBright.distanceToCenter >= targetAvailabilityDistance) throw new Error("Target representative did not improve fidelity")
	const speckQualified = isolatedSpeckQualifies()
	if (speckQualified) throw new Error("Representative fidelity promoted isolated specks")
	const canonicalRawHashesBefore = {
		development: inputs.canonicalDevelopment.sha256,
		canonical00: inputs.canonical00.sha256,
	}
	const canonicalRawHashesAfter = {
		development: sha256(await readFile(join(projectRoot, inputFiles.canonicalDevelopment))),
		canonical00: sha256(await readFile(join(projectRoot, inputFiles.canonical00))),
	}
	if (!isDeepStrictEqual(canonicalRawHashesBefore, canonicalRawHashesAfter)) {
		throw new Error("Canonical result artifacts changed during representative fidelity evaluation")
	}
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		fidelityVersion: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			proposalsPassedToRoleSolver: false,
			roleSolverInvocationCount: 0,
			newHumanReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
		},
		scope: "Expose component-region-local exact representatives without changing family masks or role inference.",
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			predecessorFamilyMaskSetsMustRemainExact: true,
			allSixKnownAvailabilityCasesMustRemainExact: true,
			isolatedEqualHistogramSpecksMustRemainRejected: true,
			targetFamilyMustExposeMoreFaithfulExactRepresentative: true,
			lloydPartitionAndFieldMembershipMustRemainExact: true,
			canonicalOutputMustRemainExact: true,
			targetColorsInferred: false,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		fidelityVersion: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sources: stage1Manifest.sources,
		implementation,
	}
	const experimentId = deterministicId(identity)
	const generatedAt = new Date().toISOString()
	const totalFamilies = results.reduce((sum, result) => sum + result.fidelity.diagnostics.familyCount, 0)
	const totalRepresentatives = results.reduce((sum, result) => sum + result.fidelity.diagnostics.localRepresentativeCount, 0)
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		stoppingRules: {
			pass: violations.length === 0 && knownEntries.every((entry) =>
				isDeepStrictEqual(entry.expectedFamilyMasks, entry.actualFamilyMasks)) && !speckQualified,
			structuralViolationCount: violations.reduce((sum, result) => sum + result.violations.length, 0),
			structuralCaseCount: violations.length,
			predecessorFamilyMaskSetMismatches: results.filter((result) =>
				result.violations.includes("predecessor-family-mask-set")).length,
			nondeterministicCases: results.filter((result) => result.violations.includes("nondeterministic-fidelity")).length,
			lloydPartitionViolations: results.filter((result) => result.violations.includes("lloyd-partition")).length,
			fieldMembershipViolations: results.filter((result) => result.violations.includes("reserve-field-membership") ||
				result.violations.includes("reserve-field-relation")).length,
			roleSolverInvocationCount: 0,
			canonicalRecomputationMismatches: 0,
			canonicalRawHashesBefore,
			canonicalRawHashesAfter,
			unauthorizedSourceRootsOpened: [] as string[],
			commentDerivedTargetFamilies: 0,
		},
		coverage: {
			sources: results.length,
			families: totalFamilies,
			localRepresentatives: totalRepresentatives,
			multiRepresentativeFamilies: results.reduce((sum, result) =>
				sum + result.fidelity.diagnostics.multiRepresentativeFamilyCount, 0),
			sourcesWithFamilies: results.filter((result) => result.fidelity.diagnostics.familyCount > 0).length,
		},
		knownAvailabilityCohort: {
			total: knownEntries.length,
			exactlyPreserved: knownEntries.filter((entry) =>
				isDeepStrictEqual(entry.expectedFamilyMasks, entry.actualFamilyMasks)).length,
			entries: knownEntries,
		},
		isolatedEqualHistogramSpecksQualify: speckQualified,
		targetRepresentativeFidelity: {
			file: TARGET_FILE,
			sourceSha256: TARGET_SOURCE_SHA256,
			familyMaskSha256: TARGET_FAMILY_MASK_SHA256,
			familyMaskPreserved: true,
			availabilityRepresentative: targetFamily.availabilityRepresentative,
			localRepresentative: targetBright,
			availabilityDistanceToDominantModeCenter: targetAvailabilityDistance,
			localDistanceToDominantModeCenter: targetBright.distanceToCenter,
			improved: targetBright.distanceToCenter < targetAvailabilityDistance,
		},
		disposition: violations.length === 0 ? "stage-2-complete-proceed-to-stage-3" : "stage-2-rejected",
	}
	const evaluation = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		fidelityVersion: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
		entries: results,
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "evaluation.json"), evaluation),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
	])
	process.stderr.write(`Wrote representative fidelity experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
