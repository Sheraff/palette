import { access, readFile, realpath, rename, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import {
	extractAlbumArtworkPaletteV2,
	extractAlbumArtworkPaletteV2074Details,
} from "./src/album-artwork-palette-v2.ts"
import type { AlbumArtworkPaletteV2Result } from "./src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
	albumArtworkPaletteV2074ByteJsonSha256,
	albumArtworkPaletteV2074ContentId,
	albumArtworkPaletteV2074PathInside,
	albumArtworkPaletteV2074ScientificSha256,
	albumArtworkPaletteV2074Sha256,
	buildAlbumArtworkPaletteV2074ScientificPayload,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRODUCT_BASELINE,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE,
} from "./src/album-artwork-palette-v2-0.7.4-protocol.ts"
import type {
	AlbumArtworkPaletteV2074CalibrationArtifact,
	AlbumArtworkPaletteV2074CandidateArtifact,
	AlbumArtworkPaletteV2074DevelopmentManifest,
	AlbumArtworkPaletteV2074ExecutionManifest,
	AlbumArtworkPaletteV2074SourceRecord,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type ChildRequest = Readonly<{
	schemaVersion: 1
	phase: "calibration" | "candidate"
	scheduleId: "schedule-a" | "schedule-b"
	caseId: string
	implementationSha256: string
	stagingRoot: string
	outputPath: string
	executionManifestPath?: string
	frozenSourceArtifactRawSha256: string
	productSourceArtifactRawSha256: string
	historical073SourceArtifactRawSha256: string
}>

type FrozenSourceArtifact = Readonly<{
	implementationHash: string
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: AlbumArtworkPaletteV2Result
}>

type Historical073Source = Readonly<{
	source: AlbumArtworkPaletteV2074SourceRecord
	recallArms: ReadonlyArray<Readonly<{
		scientific: Readonly<{
			arm: string
			additions: readonly unknown[]
		}>
	}>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function safeRelativePath(path: string): boolean {
	return path.length > 0 && !isAbsolute(path) && !path.split(/[\\/]/u).includes("..")
}

async function assertAbsent(path: string): Promise<void> {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite child artifact ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	await assertAbsent(path)
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

async function readBoundJson<T>(path: string, expectedSha256: string): Promise<T> {
	const raw = await readFile(path)
	invariant(albumArtworkPaletteV2074Sha256(raw) === expectedSha256, `Raw binding mismatch for ${path}`)
	return JSON.parse(raw.toString("utf8")) as T
}

async function loadSource(caseId: string): Promise<Readonly<{
	source: AlbumArtworkPaletteV2074SourceRecord
	image: Awaited<ReturnType<typeof loadNativeImage>>
}>> {
	const panel = await readBoundJson<AlbumArtworkPaletteV2074DevelopmentManifest>(
		resolve(projectRoot, ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL.path),
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL.rawSha256,
	)
	invariant(panel.manifestId === ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL.manifestId &&
		panel.sourceCount === 28 && panel.sources.length === 28, "Development panel binding is invalid")
	const source = panel.sources.find((entry) => entry.caseId === caseId)
	invariant(source !== undefined && safeRelativePath(source.path), `Unknown or unsafe source ${caseId}`)
	const rootRealPath = await realpath(projectRoot)
	const sourcePath = await realpath(resolve(projectRoot, source.path))
	invariant(albumArtworkPaletteV2074PathInside(rootRealPath, sourcePath), `Source path escaped project root for ${caseId}`)
	const bytes = await readFile(sourcePath)
	invariant(bytes.byteLength === source.byteCount && albumArtworkPaletteV2074Sha256(bytes) === source.sha256,
		`Source byte custody failed for ${caseId}`)
	return { source, image: await loadNativeImage(bytes) }
}

async function loadFrozenSource(
	version: "0.7.2" | "0.6.0",
	caseId: string,
	expectedSha256: string,
): Promise<FrozenSourceArtifact> {
	const path = resolve(
		projectRoot,
		`research/data/experiments/album-artwork-palette-v2-${version}-development/sources/${caseId}.json`,
	)
	return readBoundJson<FrozenSourceArtifact>(path, expectedSha256)
}

async function loadHistorical073(caseId: string, expectedSha256: string): Promise<Historical073Source> {
	return readBoundJson<Historical073Source>(resolve(
		projectRoot,
		`research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/${caseId}.json`,
	), expectedSha256)
}

async function loadExecution(request: ChildRequest): Promise<AlbumArtworkPaletteV2074ExecutionManifest> {
	invariant(request.executionManifestPath !== undefined && isAbsolute(request.executionManifestPath) &&
		albumArtworkPaletteV2074PathInside(request.stagingRoot, request.executionManifestPath),
		"Candidate execution manifest custody is invalid")
	const execution = JSON.parse(await readFile(request.executionManifestPath, "utf8")) as
		AlbumArtworkPaletteV2074ExecutionManifest
	invariant(execution.executionManifestId === albumArtworkPaletteV2074ContentId(execution, "executionManifestId") &&
		execution.implementationSha256 === request.implementationSha256 &&
		execution.sourceCaseIds.includes(request.caseId), "Candidate execution manifest binding is invalid")
	return execution
}

function validateFrozenSource(
	frozen: FrozenSourceArtifact,
	source: AlbumArtworkPaletteV2074SourceRecord,
	expectedImplementation: string,
	label: string,
): void {
	invariant(frozen.implementationHash === expectedImplementation &&
		albumArtworkPaletteV2074ScientificSha256(frozen.source) === albumArtworkPaletteV2074ScientificSha256(source),
		`${label} source binding is invalid for ${source.caseId}`)
}

async function runCalibration(
	request: ChildRequest,
	source: AlbumArtworkPaletteV2074SourceRecord,
	image: Awaited<ReturnType<typeof loadNativeImage>>,
): Promise<AlbumArtworkPaletteV2074CalibrationArtifact> {
	const frozen = await loadFrozenSource("0.7.2", source.caseId, request.frozenSourceArtifactRawSha256)
	validateFrozenSource(frozen, source, "6b29ebc3f6e88e170a3d283009d3e5868c8fa92e72efb350c5dc0abe6750e28e",
		"Frozen 0.7.2")
	const started = performance.now()
	const control = extractAlbumArtworkPaletteV2(image)
	const wallMs = performance.now() - started
	invariant(JSON.stringify(control) === JSON.stringify(frozen.extraction),
		"Live extractAlbumArtworkPaletteV2 is not JSON-byte-equal to frozen 0.7.2")
	return {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		phase: "calibration",
		scheduleId: request.scheduleId,
		implementationSha256: request.implementationSha256,
		source,
		dimensions: { width: image.width, height: image.height },
		frozenSourceArtifactRawSha256: request.frozenSourceArtifactRawSha256,
		controlJsonByteSha256: albumArtworkPaletteV2074ByteJsonSha256(control),
		controlScientificSha256: albumArtworkPaletteV2074ScientificSha256(control),
		wallMs,
	}
}

async function runCandidate(
	request: ChildRequest,
	source: AlbumArtworkPaletteV2074SourceRecord,
	image: Awaited<ReturnType<typeof loadNativeImage>>,
): Promise<AlbumArtworkPaletteV2074CandidateArtifact> {
	const execution = await loadExecution(request)
	const started = performance.now()
	// Historical palette output is intentionally unavailable until current-pixel extraction completes.
	const details = extractAlbumArtworkPaletteV2074Details(image)
	const wallMs = performance.now() - started
	invariant(wallMs <= execution.calibration.candidateWallCeilingMsPerSourcePerPass,
		`Candidate exceeded the frozen ${execution.calibration.candidateWallCeilingMsPerSourcePerPass}ms ceiling`)

	const [frozenControl, productBaseline, historical073] = await Promise.all([
		loadFrozenSource("0.7.2", source.caseId, request.frozenSourceArtifactRawSha256),
		loadFrozenSource("0.6.0", source.caseId, request.productSourceArtifactRawSha256),
		loadHistorical073(source.caseId, request.historical073SourceArtifactRawSha256),
	])
	validateFrozenSource(frozenControl, source,
		"6b29ebc3f6e88e170a3d283009d3e5868c8fa92e72efb350c5dc0abe6750e28e", "Frozen 0.7.2")
	validateFrozenSource(productBaseline, source,
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRODUCT_BASELINE.implementationSha256, "Frozen 0.6.0")
	invariant(albumArtworkPaletteV2074ScientificSha256(historical073.source) ===
		albumArtworkPaletteV2074ScientificSha256(source), "Immutable 0.7.3 source binding is invalid")
	invariant(historical073.recallArms.some(({ scientific }) =>
		scientific.arm === ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.selection.mechanism),
		"Immutable 0.7.3 selected arm is missing")
	const scientific = buildAlbumArtworkPaletteV2074ScientificPayload({
		details,
		source,
		dimensions: { width: image.width, height: image.height },
		frozenSourceArtifactRawSha256: request.frozenSourceArtifactRawSha256,
		productSourceArtifactRawSha256: request.productSourceArtifactRawSha256,
		historical073SourceArtifactRawSha256: request.historical073SourceArtifactRawSha256,
		frozenControl,
		productBaseline,
		historical073: historical073 as Parameters<typeof buildAlbumArtworkPaletteV2074ScientificPayload>[0]["historical073"],
	})
	const calibration = execution.calibration.schedules[0].sources.find(({ caseId }) => caseId === source.caseId)
	invariant(calibration !== undefined && calibration.controlScientificSha256 === scientific.controlScientificSha256,
		"Candidate control differs from pre-candidate calibration")
	return {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		phase: "candidate",
		scheduleId: request.scheduleId,
		implementationSha256: request.implementationSha256,
		executionManifestId: execution.executionManifestId,
		scientific,
		scientificSha256: albumArtworkPaletteV2074ScientificSha256(scientific),
		wallMs,
	}
}

async function main(): Promise<void> {
	const requestPath = process.argv[2]
	invariant(requestPath !== undefined && isAbsolute(requestPath), "Usage: child <absolute-request-path>")
	const request = JSON.parse(await readFile(requestPath, "utf8")) as ChildRequest
	invariant(request.schemaVersion === 1 && /^(?:[a-f0-9]{64})$/u.test(request.implementationSha256) &&
		(request.phase === "calibration" || request.phase === "candidate") &&
		(request.scheduleId === "schedule-a" || request.scheduleId === "schedule-b") &&
		isAbsolute(request.stagingRoot) && albumArtworkPaletteV2074PathInside(request.stagingRoot, requestPath) &&
		isAbsolute(request.outputPath) && albumArtworkPaletteV2074PathInside(request.stagingRoot, request.outputPath),
		"Child request custody is invalid")
	const { source, image } = await loadSource(request.caseId)
	const artifact = request.phase === "calibration"
		? await runCalibration(request, source, image)
		: await runCandidate(request, source, image)
	await atomicJson(request.outputPath, artifact)
	process.stdout.write(`${request.caseId} ${request.scheduleId} ${request.phase} complete\n`)
}

await main()
