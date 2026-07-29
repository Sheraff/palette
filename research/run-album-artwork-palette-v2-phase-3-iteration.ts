import { createHash } from "node:crypto"
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CLOSED_ANCHOR_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRACT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT,
	extractAlbumArtworkPaletteV2Phase3ClosedAnchor,
	materialDeltaFromAlbumArtworkPaletteV2Phase3Anchor,
	normalizeAlbumArtworkPaletteV2Phase3Result,
} from "./src/album-artwork-palette-v2-phase-3-contract.ts"
import type {
	AlbumArtworkPaletteV2Phase3AttemptAdapter,
	AlbumArtworkPaletteV2Phase3MaterialDelta,
	AlbumArtworkPaletteV2Phase3NormalizedResult,
} from "./src/album-artwork-palette-v2-phase-3-contract.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import type { RawImage } from "./src/types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_CASES_PER_ITERATION = 8
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION = 5

export type AlbumArtworkPaletteV2Phase3DevelopmentSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

type DevelopmentPanel = Readonly<{
	schemaVersion: number
	sourceCount: number
	sources: readonly AlbumArtworkPaletteV2Phase3DevelopmentSource[]
}>

export type AlbumArtworkPaletteV2Phase3Runtime = Readonly<{
	wallMs: number
	cpuUserMs: number
	cpuSystemMs: number
}>

export type AlbumArtworkPaletteV2Phase3CaseArtifact = Readonly<{
	schemaVersion: 1
	contractId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRACT_ID
	source: Readonly<{
		caseId: string
		sha256: string
		byteCount: number
		artworkId: string
		width: number
		height: number
	}>
	anchor: Readonly<{
		identity: Readonly<{ anchorId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CLOSED_ANCHOR_ID }>
		output: AlbumArtworkPaletteV2Phase3NormalizedResult
		runtime: AlbumArtworkPaletteV2Phase3Runtime
	}>
	attempts: ReadonlyArray<Readonly<{
		identity: AlbumArtworkPaletteV2Phase3AttemptAdapter["identity"]
		output: AlbumArtworkPaletteV2Phase3NormalizedResult
		runtime: AlbumArtworkPaletteV2Phase3Runtime
		materialDelta: AlbumArtworkPaletteV2Phase3MaterialDelta
	}>>
}>

export type AlbumArtworkPaletteV2Phase3IterationArguments = Readonly<{
	iterationId: string
	caseIds: readonly string[]
	attemptIds: readonly string[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const scratchRoot = resolve(moduleDirectory, "data/scratch/album-artwork-palette-v2")
const developmentPanelPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const attemptRegistry = new Map([
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT],
	[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT],
])

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function assertIterationId(iterationId: string): void {
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(iterationId) || iterationId === "." || iterationId === "..") {
		throw new Error(`Unsafe Phase 3 iteration ID ${JSON.stringify(iterationId)}`)
	}
}

function assertDevelopmentCaseId(caseId: string): void {
	if (!/^development-[0-9]{2}$/u.test(caseId)) {
		throw new Error(`Protected, reserve, or non-development case ID is forbidden: ${caseId}`)
	}
}

function assertDevelopmentSourcePath(path: string, caseId: string): void {
	const parts = path.split(/[\\/]/u)
	const root = parts[0]
	const developmentDatasetRoot = /^(?:0[0-9]|1[01])$/u.test(root)
	if (path.length === 0 || isAbsolute(path) || parts.includes("..") ||
		(root !== "images" && root !== "music-artworks" && !developmentDatasetRoot)) {
		throw new Error(`Protected, reserve, or unsafe source path is forbidden for ${caseId}`)
	}
}

function uniqueValues(values: readonly string[], label: string): string[] {
	const unique = new Set(values)
	if (unique.size !== values.length) throw new Error(`Duplicate ${label} is forbidden`)
	return [...unique]
}

export function parseAlbumArtworkPaletteV2Phase3IterationArguments(
	args: readonly string[],
): AlbumArtworkPaletteV2Phase3IterationArguments {
	let iterationId: string | undefined
	const caseIds: string[] = []
	const attemptIds: string[] = []
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]
		if (argument === "--iteration") {
			iterationId = args[++index]
			if (iterationId === undefined) throw new Error("--iteration requires a value")
		} else if (argument === "--case") {
			const caseId = args[++index]
			if (caseId === undefined) throw new Error("--case requires a value")
			caseIds.push(caseId)
		} else if (argument === "--attempt") {
			const attemptId = args[++index]
			if (attemptId === undefined) throw new Error("--attempt requires a value")
			attemptIds.push(attemptId)
		} else if (argument.startsWith("--")) {
			throw new Error(`Unknown argument ${argument}`)
		} else {
			caseIds.push(argument)
		}
	}
	if (iterationId === undefined) throw new Error("An explicit --iteration ID is required")
	assertIterationId(iterationId)
	if (caseIds.length === 0) throw new Error("At least one explicit development case ID is required")
	for (const caseId of caseIds) assertDevelopmentCaseId(caseId)
	const uniqueCaseIds = uniqueValues(caseIds, "development case ID")
	if (uniqueCaseIds.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_CASES_PER_ITERATION) {
		throw new Error(`Phase 3 scratch iterations are limited to ${ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_CASES_PER_ITERATION} cases`)
	}
	const selectedAttemptIds = attemptIds.length === 0
		? [ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT.identity.attemptId]
		: uniqueValues(attemptIds, "attempt ID")
	if (selectedAttemptIds.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION) {
		throw new Error(`Phase 3 scratch iterations are limited to ${ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION} attempts`)
	}
	for (const attemptId of selectedAttemptIds) {
		if (!attemptRegistry.has(attemptId)) throw new Error(`Unknown Phase 3 attempt ${attemptId}`)
	}
	return {
		iterationId,
		caseIds: uniqueCaseIds.sort(),
		attemptIds: selectedAttemptIds,
	}
}

export function selectAlbumArtworkPaletteV2Phase3DevelopmentSources(
	panel: DevelopmentPanel,
	caseIds: readonly string[],
): AlbumArtworkPaletteV2Phase3DevelopmentSource[] {
	invariant(panel.schemaVersion === 1 && panel.sourceCount === panel.sources.length,
		"The Phase 3 development panel is invalid")
	if (caseIds.length === 0 || caseIds.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_CASES_PER_ITERATION) {
		throw new Error("The Phase 3 source selection is empty or exceeds its bound")
	}
	const sourceByCaseId = new Map<string, AlbumArtworkPaletteV2Phase3DevelopmentSource>()
	for (const source of panel.sources) {
		assertDevelopmentCaseId(source.caseId)
		assertDevelopmentSourcePath(source.path, source.caseId)
		if (sourceByCaseId.has(source.caseId)) throw new Error(`Duplicate development panel case ${source.caseId}`)
		sourceByCaseId.set(source.caseId, source)
	}
	return uniqueValues(caseIds, "development case ID").sort().map((caseId) => {
		assertDevelopmentCaseId(caseId)
		const source = sourceByCaseId.get(caseId)
		if (!source) throw new Error(`Case ${caseId} is not in the authorized development panel`)
		return source
	})
}

function measure<T>(operation: () => T): Readonly<{ value: T; runtime: AlbumArtworkPaletteV2Phase3Runtime }> {
	const cpuStarted = process.cpuUsage()
	const wallStarted = performance.now()
	const value = operation()
	const cpu = process.cpuUsage(cpuStarted)
	return {
		value,
		runtime: {
			wallMs: performance.now() - wallStarted,
			cpuUserMs: cpu.user / 1_000,
			cpuSystemMs: cpu.system / 1_000,
		},
	}
}

export function executeAlbumArtworkPaletteV2Phase3Case(
	source: AlbumArtworkPaletteV2Phase3DevelopmentSource,
	image: RawImage,
	adapters: readonly AlbumArtworkPaletteV2Phase3AttemptAdapter[],
): AlbumArtworkPaletteV2Phase3CaseArtifact {
	assertDevelopmentCaseId(source.caseId)
	assertDevelopmentSourcePath(source.path, source.caseId)
	if (adapters.length === 0 || adapters.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION) {
		throw new Error("The Phase 3 attempt selection is empty or exceeds its bound")
	}
	const identities = adapters.map(({ identity }) => `${identity.attemptId}\0${identity.configurationId}`)
	uniqueValues(identities, "attempt identity")
	const anchorExtraction = measure(() => extractAlbumArtworkPaletteV2Phase3ClosedAnchor(image))
	const anchor = normalizeAlbumArtworkPaletteV2Phase3Result(anchorExtraction.value)
	const attempts = adapters.map((adapter) => {
		const extraction = measure(() => adapter.extract(image))
		const output = normalizeAlbumArtworkPaletteV2Phase3Result(extraction.value)
		return {
			identity: adapter.identity,
			output,
			runtime: extraction.runtime,
			materialDelta: materialDeltaFromAlbumArtworkPaletteV2Phase3Anchor(output, anchor),
		}
	})
	return {
		schemaVersion: 1,
		contractId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRACT_ID,
		source: {
			caseId: source.caseId,
			sha256: source.sha256,
			byteCount: source.byteCount,
			artworkId: source.artworkId,
			width: image.width,
			height: image.height,
		},
		anchor: {
			identity: { anchorId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CLOSED_ANCHOR_ID },
			output: anchor,
			runtime: anchorExtraction.runtime,
		},
		attempts,
	}
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporaryPath = `${path}.${process.pid}.tmp`
	await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporaryPath, path)
}

async function loadDevelopmentSource(
	source: AlbumArtworkPaletteV2Phase3DevelopmentSource,
): Promise<Readonly<{ image: RawImage; decodeRuntime: AlbumArtworkPaletteV2Phase3Runtime }>> {
	assertDevelopmentSourcePath(source.path, source.caseId)
	const rootRealPath = await realpath(projectRoot)
	const sourceRealPath = await realpath(resolve(projectRoot, source.path))
	const sourceRelativePath = relative(rootRealPath, sourceRealPath)
	invariant(sourceRelativePath !== "" && sourceRelativePath !== ".." &&
		!sourceRelativePath.startsWith(`..${sep}`) && !isAbsolute(sourceRelativePath),
		`Development source escaped the project root for ${source.caseId}`)
	const bytes = await readFile(sourceRealPath)
	invariant(bytes.byteLength === source.byteCount && sha256(bytes) === source.sha256,
		`Development source byte identity failed for ${source.caseId}`)
	const cpuStarted = process.cpuUsage()
	const wallStarted = performance.now()
	const image = await loadNativeImage(bytes)
	const cpu = process.cpuUsage(cpuStarted)
	return {
		image,
		decodeRuntime: {
			wallMs: performance.now() - wallStarted,
			cpuUserMs: cpu.user / 1_000,
			cpuSystemMs: cpu.system / 1_000,
		},
	}
}

export async function runAlbumArtworkPaletteV2Phase3Iteration(
	options: AlbumArtworkPaletteV2Phase3IterationArguments,
): Promise<Readonly<{ outputDirectory: string; caseCount: number; attemptCount: number }>> {
	assertIterationId(options.iterationId)
	const panel = JSON.parse(await readFile(developmentPanelPath, "utf8")) as DevelopmentPanel
	const sources = selectAlbumArtworkPaletteV2Phase3DevelopmentSources(panel, options.caseIds)
	const adapters = options.attemptIds.map((attemptId) => {
		const adapter = attemptRegistry.get(attemptId)
		if (!adapter) throw new Error(`Unknown Phase 3 attempt ${attemptId}`)
		return adapter
	})
	if (adapters.length === 0 || adapters.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION) {
		throw new Error("The Phase 3 attempt selection is empty or exceeds its bound")
	}
	const outputDirectory = resolve(scratchRoot, options.iterationId)
	invariant(outputDirectory.startsWith(`${scratchRoot}${sep}`), "Phase 3 output escaped its scratch root")
	await mkdir(outputDirectory, { recursive: true })
	const summaries = []
	for (const source of sources) {
		const { image, decodeRuntime } = await loadDevelopmentSource(source)
		const artifact = executeAlbumArtworkPaletteV2Phase3Case(source, image, adapters)
		await atomicJson(resolve(outputDirectory, `${source.caseId}.json`), { ...artifact, decodeRuntime })
		summaries.push({
			caseId: source.caseId,
			sourceSha256: source.sha256,
			file: `${source.caseId}.json`,
			materialDeltas: artifact.attempts.map(({ identity, materialDelta }) => ({ identity, materialDelta })),
		})
	}
	await atomicJson(resolve(outputDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRACT_ID,
		iterationId: options.iterationId,
		workerCount: 1,
		caseIds: sources.map(({ caseId }) => caseId),
		attempts: adapters.map(({ identity }) => identity),
		runtime: { node: process.version, platform: process.platform, architecture: process.arch },
		sources: summaries,
	})
	return { outputDirectory, caseCount: sources.length, attemptCount: adapters.length }
}

async function main(): Promise<void> {
	const options = parseAlbumArtworkPaletteV2Phase3IterationArguments(process.argv.slice(2))
	const result = await runAlbumArtworkPaletteV2Phase3Iteration(options)
	process.stdout.write(`Phase 3 scratch iteration wrote ${result.caseCount} cases x ${result.attemptCount} attempts with 1 worker to ${relative(projectRoot, result.outputDirectory)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
