import { readFile, realpath, rename, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import {
	auditAlbumArtworkPaletteV2FactorizedParetoRecall,
	auditAlbumArtworkPaletteV2Recall,
} from "./src/album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2FactorizedParetoAudit,
	AlbumArtworkPaletteV2RecallAudit,
} from "./src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS,
	albumArtworkPaletteV2073ByteJsonSha256,
	albumArtworkPaletteV2073CanonicalJson,
	albumArtworkPaletteV2073ContentId,
	albumArtworkPaletteV2073ScientificSha256,
	albumArtworkPaletteV2073Sha256,
	projectAlbumArtworkPaletteV2073Control,
	projectAlbumArtworkPaletteV2073Diagnostic,
	projectAlbumArtworkPaletteV2073Factorized,
	projectAlbumArtworkPaletteV2073Recall,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import type {
	AlbumArtworkPaletteV2073CalibrationArtifact,
	AlbumArtworkPaletteV2073ControlScientific,
	AlbumArtworkPaletteV2073ControlArtifact,
	AlbumArtworkPaletteV2073DevelopmentManifest,
	AlbumArtworkPaletteV2073ExecutionManifest,
	AlbumArtworkPaletteV2073FactorizedArtifact,
	AlbumArtworkPaletteV2073FactorizedArmArtifact,
	AlbumArtworkPaletteV2073FactorizedScientific,
	AlbumArtworkPaletteV2073RecallArtifact,
	AlbumArtworkPaletteV2073RecallArmArtifact,
	AlbumArtworkPaletteV2073RecallScientific,
	AlbumArtworkPaletteV2073RunEvidence,
	AlbumArtworkPaletteV2073SourceRecord,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type ChildPhase = "calibration" | "control" | "recall" | "factorized-3000" | "factorized-6000"

type ChildRequest = Readonly<{
	schemaVersion: 1
	phase: ChildPhase
	caseId: string
	implementationSha256: string
	stagingRoot: string
	outputPath: string
	executionManifestPath?: string
	frozenSourceArtifactRawSha256: string
	storedFactorized3000Path?: string
}>

type FrozenSourceArtifact = Readonly<{
	source: AlbumArtworkPaletteV2073SourceRecord
	extraction: unknown
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")

function pathInside(root: string, path: string): boolean {
	const normalizedRoot = resolve(root)
	const normalizedPath = resolve(path)
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`)
}

function safeSourcePath(path: string): boolean {
	return path.length > 0 && !isAbsolute(path) && !path.split(/[\\/]/u).includes("..")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

async function readBoundJson(path: string, expectedSha256: string): Promise<unknown> {
	const raw = await readFile(path)
	if (albumArtworkPaletteV2073Sha256(raw) !== expectedSha256) throw new Error(`Raw binding mismatch for ${path}`)
	return JSON.parse(raw.toString("utf8")) as unknown
}

function protectedHashes(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	const record = value as Record<string, unknown>
	const directSources = Array.isArray(record.sources)
		? record.sources.flatMap((entry) => {
			const source = entry as Record<string, unknown>
			return typeof source.sha256 === "string" ? [source.sha256] : []
		})
		: []
	const familyVariants = Array.isArray(record.families)
		? record.families.flatMap((family) => {
			const variants = (family as Record<string, unknown>).variants
			return Array.isArray(variants) ? variants.flatMap((entry) => {
				const variant = entry as Record<string, unknown>
				return typeof variant.sha256 === "string" ? [variant.sha256] : []
			}) : []
		})
		: []
	return [...directSources, ...familyVariants]
}

async function loadCustodiedSource(request: ChildRequest): Promise<Readonly<{
	source: AlbumArtworkPaletteV2073SourceRecord
	image: Awaited<ReturnType<typeof loadNativeImage>>
	frozen: FrozenSourceArtifact
}>> {
	const panelBinding = ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS.developmentPanel
	const panelValue = await readBoundJson(resolve(projectRoot, panelBinding.path), panelBinding.rawSha256)
	const panel = panelValue as AlbumArtworkPaletteV2073DevelopmentManifest
	if (panel.manifestId !== panelBinding.manifestId || panel.sourceCount !== panelBinding.sourceCount ||
		panel.sources.length !== panelBinding.sourceCount) throw new Error("Development-panel binding is invalid")
	const source = panel.sources.find(({ caseId }) => caseId === request.caseId)
	if (!source) throw new Error(`Unknown development source ${request.caseId}`)

	const protectedValues = await Promise.all(ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS.protectedSamples.map(async (binding) => {
		const value = await readBoundJson(resolve(projectRoot, binding.path), binding.rawSha256)
		if ((value as Record<string, unknown>).manifestId !== binding.manifestId) {
			throw new Error(`Protected-sample manifest ID mismatch for ${binding.path}`)
		}
		return value
	}))
	if (new Set(protectedValues.flatMap(protectedHashes)).has(source.sha256)) {
		throw new Error(`Development source ${request.caseId} overlaps a protected sample`)
	}
	if (!safeSourcePath(source.path)) throw new Error(`Unsafe development source path for ${request.caseId}`)
	const rootRealPath = await realpath(projectRoot)
	const sourcePath = resolve(projectRoot, source.path)
	const sourceRealPath = await realpath(sourcePath)
	if (!pathInside(rootRealPath, sourceRealPath)) throw new Error(`Development source escaped the project root for ${request.caseId}`)
	const bytes = await readFile(sourceRealPath)
	if (bytes.byteLength !== source.byteCount || albumArtworkPaletteV2073Sha256(bytes) !== source.sha256) {
		throw new Error(`Source byte custody mismatch for ${request.caseId}`)
	}

	const frozenPath = resolve(
		projectRoot,
		`research/data/experiments/album-artwork-palette-v2-0.7.2-development/sources/${request.caseId}.json`,
	)
	const frozen = await readBoundJson(frozenPath, request.frozenSourceArtifactRawSha256) as FrozenSourceArtifact
	if (albumArtworkPaletteV2073CanonicalJson(frozen.source) !== albumArtworkPaletteV2073CanonicalJson(source)) {
		throw new Error(`Frozen control source custody mismatch for ${request.caseId}`)
	}
	return { source, image: await loadNativeImage(bytes), frozen }
}

function executionManifestIsValid(value: AlbumArtworkPaletteV2073ExecutionManifest, request: ChildRequest): boolean {
	return value.implementationSha256 === request.implementationSha256 &&
		value.sourceCaseIds.includes(request.caseId) &&
		value.executionManifestId === albumArtworkPaletteV2073ContentId(value, "executionManifestId")
}

async function loadExecutionManifest(request: ChildRequest): Promise<AlbumArtworkPaletteV2073ExecutionManifest> {
	if (!request.executionManifestPath || !pathInside(request.stagingRoot, request.executionManifestPath)) {
		throw new Error(`Execution manifest is required for ${request.phase}`)
	}
	const value = JSON.parse(await readFile(request.executionManifestPath, "utf8")) as AlbumArtworkPaletteV2073ExecutionManifest
	if (!executionManifestIsValid(value, request)) throw new Error("Execution manifest binding is invalid")
	return value
}

function exactFrozenControl(
	audit: AlbumArtworkPaletteV2RecallAudit | AlbumArtworkPaletteV2FactorizedParetoAudit,
	frozen: FrozenSourceArtifact,
): void {
	if (albumArtworkPaletteV2073ByteJsonSha256(audit.controlExtraction) !==
		albumArtworkPaletteV2073ByteJsonSha256(frozen.extraction)) {
		throw new Error("Instrumented controlExtraction differs byte-for-byte from frozen 0.7.2 extraction")
	}
}

async function timed<T>(operation: () => T): Promise<Readonly<{ value: T; wallMs: number }>> {
	const start = performance.now()
	const value = operation()
	return { value, wallMs: performance.now() - start }
}

function repeatedRunEvidence(
	firstFullOutputSha256: string,
	secondFullOutputSha256: string,
	firstWallMs: number,
	secondWallMs: number,
	scientificValue: unknown,
	repeatedScientificValue: unknown = scientificValue,
): AlbumArtworkPaletteV2073RunEvidence {
	if (firstFullOutputSha256 !== secondFullOutputSha256) throw new Error("Repeated arm output is not byte-identical")
	const scientificSha256 = albumArtworkPaletteV2073ScientificSha256(scientificValue)
	const repeatScientificSha256 = albumArtworkPaletteV2073ScientificSha256(repeatedScientificValue)
	if (scientificSha256 !== repeatScientificSha256) throw new Error("Repeated scientific projection is not byte-identical")
	return {
		wallMs: [firstWallMs, secondWallMs],
		deterministicRepeatedRun: true,
		fullOutputSha256: firstFullOutputSha256,
		repeatFullOutputSha256: secondFullOutputSha256,
		scientificSha256,
		repeatScientificSha256,
	}
}

function enforceCeiling(wallMs: readonly number[], ceiling: number, label: string): void {
	if (wallMs.some((value) => !Number.isFinite(value) || value < 0 || value > ceiling)) {
		throw new Error(`${label} exceeded the frozen ${ceiling}ms per-arm wall ceiling`)
	}
}

async function measureControlAudit(
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	frozen: FrozenSourceArtifact,
): Promise<Readonly<{
	control: AlbumArtworkPaletteV2073ControlScientific
	fullOutputSha256: string
	wallMs: number
}>> {
	const measured = await timed(() => auditAlbumArtworkPaletteV2Recall(image, "control-0.7.2"))
	exactFrozenControl(measured.value, frozen)
	return {
		control: projectAlbumArtworkPaletteV2073Control(measured.value),
		fullOutputSha256: albumArtworkPaletteV2073ByteJsonSha256(measured.value),
		wallMs: measured.wallMs,
	}
}

async function measureRecallAudit(
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	arm: typeof ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS[number],
): Promise<Readonly<{
	scientific: AlbumArtworkPaletteV2073RecallScientific
	controlScientificSha256: string
	fullOutputSha256: string
	wallMs: number
}>> {
	const measured = await timed(() => auditAlbumArtworkPaletteV2Recall(image, arm))
	return {
		scientific: projectAlbumArtworkPaletteV2073Recall(measured.value),
		controlScientificSha256: albumArtworkPaletteV2073ScientificSha256(
			projectAlbumArtworkPaletteV2073Control(measured.value),
		),
		fullOutputSha256: albumArtworkPaletteV2073ByteJsonSha256(measured.value),
		wallMs: measured.wallMs,
	}
}

async function measureFactorizedAudit(
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	arm: "factorized-pareto-3000" | "factorized-pareto-6000",
	triggerCertificate?: AlbumArtworkPaletteV2FactorizedParetoAudit["escalation"],
): Promise<Readonly<{
	scientific: AlbumArtworkPaletteV2073FactorizedScientific
	escalation: AlbumArtworkPaletteV2FactorizedParetoAudit["escalation"]
	controlScientificSha256: string
	fullOutputSha256: string
	wallMs: number
}>> {
	const measured = await timed(() => auditAlbumArtworkPaletteV2FactorizedParetoRecall(image, arm, triggerCertificate))
	return {
		scientific: projectAlbumArtworkPaletteV2073Factorized(measured.value),
		escalation: measured.value.escalation,
		controlScientificSha256: albumArtworkPaletteV2073ScientificSha256(
			projectAlbumArtworkPaletteV2073Control(measured.value),
		),
		fullOutputSha256: albumArtworkPaletteV2073ByteJsonSha256(measured.value),
		wallMs: measured.wallMs,
	}
}

async function runControl(
	request: ChildRequest,
	source: AlbumArtworkPaletteV2073SourceRecord,
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	frozen: FrozenSourceArtifact,
	execution: AlbumArtworkPaletteV2073ExecutionManifest | null,
): Promise<AlbumArtworkPaletteV2073CalibrationArtifact | AlbumArtworkPaletteV2073ControlArtifact> {
	const first = await measureControlAudit(image, frozen)
	const second = await measureControlAudit(image, frozen)
	const control = first.control
	const controlScientificSha256 = albumArtworkPaletteV2073ScientificSha256(control)
	const run = repeatedRunEvidence(
		first.fullOutputSha256,
		second.fullOutputSha256,
		first.wallMs,
		second.wallMs,
		control,
		second.control,
	)
	const dimensions = { width: image.width, height: image.height }
	const frozenControlExtractionSha256 = albumArtworkPaletteV2073ScientificSha256(frozen.extraction)
	if (execution === null) {
		return {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
			phase: "calibration",
			implementationSha256: request.implementationSha256,
			source,
			dimensions,
			frozenSourceArtifactRawSha256: request.frozenSourceArtifactRawSha256,
			controlScientificSha256,
			frozenControlExtractionSha256,
			run,
		}
	}
	enforceCeiling(run.wallMs, execution.calibration.wallCeilingMsPerArmPerSource, "control-0.7.2")
	return {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
		phase: "control",
		implementationSha256: request.implementationSha256,
		executionManifestId: execution.executionManifestId,
		source,
		dimensions,
		control,
		controlScientificSha256,
		frozenControlExtractionSha256,
		run,
	}
}

async function runRecall(
	request: ChildRequest,
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	execution: AlbumArtworkPaletteV2073ExecutionManifest,
	controlScientificSha256: string,
): Promise<AlbumArtworkPaletteV2073RecallArtifact> {
	const firstScientific: AlbumArtworkPaletteV2073RecallScientific[] = []
	const arms: AlbumArtworkPaletteV2073RecallArmArtifact[] = []
	for (const arm of ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS) {
		const first = await measureRecallAudit(image, arm)
		const second = await measureRecallAudit(image, arm)
		if (first.controlScientificSha256 !== controlScientificSha256 ||
			second.controlScientificSha256 !== controlScientificSha256) {
			throw new Error(`${arm} did not start independently from the calibrated control`)
		}
		const scientific = first.scientific
		const run = repeatedRunEvidence(
			first.fullOutputSha256,
			second.fullOutputSha256,
			first.wallMs,
			second.wallMs,
			scientific,
			second.scientific,
		)
		enforceCeiling(run.wallMs, execution.calibration.wallCeilingMsPerArmPerSource, arm)
		firstScientific.push(scientific)
		arms.push({ controlScientificSha256, scientific, run })
	}
	const firstDiagnostic = await timed(() => projectAlbumArtworkPaletteV2073Diagnostic(firstScientific))
	const secondDiagnostic = await timed(() => projectAlbumArtworkPaletteV2073Diagnostic(firstScientific))
	const diagnosticRun = repeatedRunEvidence(
		albumArtworkPaletteV2073ByteJsonSha256(firstDiagnostic.value),
		albumArtworkPaletteV2073ByteJsonSha256(secondDiagnostic.value),
		firstDiagnostic.wallMs,
		secondDiagnostic.wallMs,
		firstDiagnostic.value,
		secondDiagnostic.value,
	)
	enforceCeiling(diagnosticRun.wallMs, execution.calibration.wallCeilingMsPerArmPerSource,
		"diagnostic-joint-availability-matrix")
	return {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
		phase: "recall",
		implementationSha256: request.implementationSha256,
		executionManifestId: execution.executionManifestId,
		sourceCaseId: request.caseId,
		arms,
		diagnostic: { scientific: firstDiagnostic.value, run: diagnosticRun },
	}
}

async function runFactorized(
	request: ChildRequest,
	image: Awaited<ReturnType<typeof loadNativeImage>>,
	execution: AlbumArtworkPaletteV2073ExecutionManifest,
	controlScientificSha256: string,
): Promise<AlbumArtworkPaletteV2073FactorizedArtifact> {
	let recomputed3000ScientificSha256: string | undefined
	let certificateRecomputationWallMs: number | undefined
	let triggerCertificate: AlbumArtworkPaletteV2FactorizedParetoAudit["escalation"] | undefined
	if (request.phase === "factorized-6000") {
		if (!request.storedFactorized3000Path || !pathInside(request.stagingRoot, request.storedFactorized3000Path)) {
			throw new Error("Stored factorized-3000 artifact is required for 6000 recomputation")
		}
		const stored = JSON.parse(await readFile(request.storedFactorized3000Path, "utf8")) as AlbumArtworkPaletteV2073FactorizedArtifact
		const recomputed = await measureFactorizedAudit(image, "factorized-pareto-3000")
		recomputed3000ScientificSha256 = albumArtworkPaletteV2073ScientificSha256(recomputed.scientific)
		certificateRecomputationWallMs = recomputed.wallMs
		enforceCeiling([recomputed.wallMs], execution.calibration.wallCeilingMsPerArmPerSource,
			"factorized-pareto-3000-certificate-recomputation")
		if (recomputed3000ScientificSha256 !== stored.arm.run.scientificSha256 ||
			albumArtworkPaletteV2073CanonicalJson(recomputed.escalation) !==
				albumArtworkPaletteV2073CanonicalJson(stored.arm.scientific.escalation)) {
			throw new Error("Recomputed process-local 3000 scientific certificate differs from stored evidence")
		}
		triggerCertificate = recomputed.escalation
	}
	const arm = request.phase === "factorized-6000" ? "factorized-pareto-6000" : "factorized-pareto-3000"
	const first = await measureFactorizedAudit(image, arm, triggerCertificate)
	const second = await measureFactorizedAudit(image, arm, triggerCertificate)
	if (first.controlScientificSha256 !== controlScientificSha256 ||
		second.controlScientificSha256 !== controlScientificSha256) {
		throw new Error(`${arm} did not start independently from the calibrated control`)
	}
	const scientific = first.scientific
	const run = repeatedRunEvidence(
		first.fullOutputSha256,
		second.fullOutputSha256,
		first.wallMs,
		second.wallMs,
		scientific,
		second.scientific,
	)
	enforceCeiling(run.wallMs, execution.calibration.wallCeilingMsPerArmPerSource, arm)
	const factorizedArm: AlbumArtworkPaletteV2073FactorizedArmArtifact = {
		controlScientificSha256,
		...recomputed3000ScientificSha256 === undefined ? {} : { recomputed3000ScientificSha256 },
		...certificateRecomputationWallMs === undefined ? {} : { certificateRecomputationWallMs },
		scientific,
		run,
	}
	return {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
		phase: arm === "factorized-pareto-6000" ? "factorized-6000" : "factorized-3000",
		implementationSha256: request.implementationSha256,
		executionManifestId: execution.executionManifestId,
		sourceCaseId: request.caseId,
		arm: factorizedArm,
	}
}

async function main(): Promise<void> {
	const requestPath = process.argv[2]
	if (!requestPath || !isAbsolute(requestPath)) throw new Error("Usage: child <absolute-request-path>")
	const request = JSON.parse(await readFile(requestPath, "utf8")) as ChildRequest
	if (request.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(request.implementationSha256) ||
		!isAbsolute(request.stagingRoot) || !pathInside(request.stagingRoot, requestPath) ||
		!isAbsolute(request.outputPath) || !pathInside(request.stagingRoot, request.outputPath)) {
		throw new Error("Child request custody is invalid")
	}
	const { source, image, frozen } = await loadCustodiedSource(request)
	let artifact: unknown
	if (request.phase === "calibration") {
		artifact = await runControl(request, source, image, frozen, null)
	} else {
		const execution = await loadExecutionManifest(request)
		const calibration = execution.calibration.sources.find(({ caseId }) => caseId === request.caseId)
		if (!calibration || calibration.frozenSourceArtifactRawSha256 !== request.frozenSourceArtifactRawSha256) {
			throw new Error("Source calibration is absent from the execution manifest")
		}
		if (request.phase === "control") {
			artifact = await runControl(request, source, image, frozen, execution)
		} else if (request.phase === "recall") {
			artifact = await runRecall(request, image, execution, calibration.controlScientificSha256)
		} else {
			artifact = await runFactorized(request, image, execution, calibration.controlScientificSha256)
		}
	}
	await atomicJson(request.outputPath, artifact)
	process.stdout.write(`${request.caseId} ${request.phase} complete\n`)
}

await main()
