import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises"
import { basename, dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	analyzeAlbumArtworkPaletteV2073Development,
	verifyAlbumArtworkPaletteV2073Development,
} from "./analyze-album-artwork-palette-v2-0.7.3-development.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_CALIBRATION_TIMEOUT_MS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_IMPLEMENTATION_PATHS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_STDIO_LIMIT_BYTES,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT,
	albumArtworkPaletteV2073ContentId,
	albumArtworkPaletteV2073OrderedRoot,
	albumArtworkPaletteV2073ResultSourceEvidence,
	albumArtworkPaletteV2073ScientificSha256,
	albumArtworkPaletteV2073Sha256,
	albumArtworkPaletteV2073SourceScientificIdentity,
	buildAlbumArtworkPaletteV2073ResultsFromEvidence,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import type {
	AlbumArtworkPaletteV2073CalibrationArtifact,
	AlbumArtworkPaletteV2073ControlArtifact,
	AlbumArtworkPaletteV2073DevelopmentManifest,
	AlbumArtworkPaletteV2073ExecutionManifest,
	AlbumArtworkPaletteV2073FactorizedArtifact,
	AlbumArtworkPaletteV2073ManifestFile,
	AlbumArtworkPaletteV2073RecallArtifact,
	AlbumArtworkPaletteV2073ResultSourceEvidence,
	AlbumArtworkPaletteV2073SourceArtifact,
	AlbumArtworkPaletteV2073SourceRecord,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
} from "./src/album-artwork-palette-v2-0.7.3-protocol.ts"

type ChildPhase = "calibration" | "control" | "recall" | "factorized-3000" | "factorized-6000"

type FrozenSummary = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	workerCount: number
	sourceCount: number
	scientificSha256: string
}>

type FrozenAnalysis = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const childPath = resolve(moduleDirectory, "album-artwork-palette-v2-0.7.3-development-child.ts")
const defaultOutputDirectory = resolve(
	moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.3-development",
)

function pathInside(root: string, path: string): boolean {
	const normalizedRoot = resolve(root)
	const normalizedPath = resolve(path)
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`)
}

async function fileSha256(path: string): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		const hash = createHash("sha256")
		const stream = createReadStream(path)
		stream.on("data", (chunk) => hash.update(chunk))
		stream.on("error", reject)
		stream.on("end", () => resolvePromise(hash.digest("hex")))
	})
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

async function assertAbsent(path: string): Promise<void> {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite existing final namespace ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

function collectProtectedHashes(value: unknown): string[] {
	const record = value as Record<string, unknown>
	const sourceHashes = Array.isArray(record.sources) ? record.sources.flatMap((entry) => {
		const sha256 = (entry as Record<string, unknown>).sha256
		return typeof sha256 === "string" ? [sha256] : []
	}) : []
	const variantHashes = Array.isArray(record.families) ? record.families.flatMap((family) => {
		const variants = (family as Record<string, unknown>).variants
		return Array.isArray(variants) ? variants.flatMap((entry) => {
			const sha256 = (entry as Record<string, unknown>).sha256
			return typeof sha256 === "string" ? [sha256] : []
		}) : []
	}) : []
	return [...sourceHashes, ...variantHashes]
}

async function verifyFrozenInputs(): Promise<Readonly<{
	panel: AlbumArtworkPaletteV2073DevelopmentManifest
	frozenSourceArtifactHashes: ReadonlyMap<string, string>
}>> {
	const bindings = ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS
	const allFileBindings = [
		bindings.developmentPanel,
		...bindings.protectedSamples,
		...Object.values(bindings.frozenControl.files),
	]
	for (const binding of allFileBindings) {
		const actual = await fileSha256(resolve(projectRoot, binding.path))
		if (actual !== binding.rawSha256) throw new Error(`Frozen raw hash mismatch for ${binding.path}`)
	}
	const [panelRaw, protectedRaw, summaryRaw, analysisRaw] = await Promise.all([
		readFile(resolve(projectRoot, bindings.developmentPanel.path), "utf8"),
		Promise.all(bindings.protectedSamples.map(({ path }) => readFile(resolve(projectRoot, path), "utf8"))),
		readFile(resolve(projectRoot, bindings.frozenControl.files.summary.path), "utf8"),
		readFile(resolve(projectRoot, bindings.frozenControl.files.analysis.path), "utf8"),
	])
	const panel = JSON.parse(panelRaw) as AlbumArtworkPaletteV2073DevelopmentManifest
	const protectedValues = protectedRaw.map((raw) => JSON.parse(raw) as Record<string, unknown>)
	const summary = JSON.parse(summaryRaw) as FrozenSummary
	const analysis = JSON.parse(analysisRaw) as FrozenAnalysis
	if (panel.manifestId !== bindings.developmentPanel.manifestId ||
		panel.sourceCount !== bindings.developmentPanel.sourceCount || panel.sources.length !== 28 ||
		new Set(panel.sources.map(({ caseId }) => caseId)).size !== 28 ||
		new Set(panel.sources.map(({ sha256 }) => sha256)).size !== 28) {
		throw new Error("Fixed development-panel binding is invalid")
	}
	if (protectedValues.some((value, index) => value.manifestId !== bindings.protectedSamples[index].manifestId)) {
		throw new Error("A protected sample manifest ID is invalid")
	}
	const protectedSourceHashes = new Set(protectedValues.flatMap(collectProtectedHashes))
	if (panel.sources.some(({ sha256 }) => protectedSourceHashes.has(sha256))) {
		throw new Error("Fixed development panel overlaps a protected fresh or future sample")
	}
	for (const value of [summary, analysis]) {
		if (value.candidateVersion !== bindings.frozenControl.version ||
			value.implementationHash !== bindings.frozenControl.implementationSha256 ||
			value.scientificSha256 !== bindings.frozenControl.scientificSha256 ||
			value.developmentManifestId !== bindings.developmentPanel.manifestId) {
			throw new Error("Frozen 0.7.2 semantic binding is invalid")
		}
	}
	if (summary.workerCount !== ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT || summary.sourceCount !== 28) {
		throw new Error("Frozen 0.7.2 execution did not use the required fixed panel and worker count")
	}
	const frozenSourceArtifactHashes = new Map<string, string>()
	for (const source of panel.sources) {
		const path = resolve(
			projectRoot,
			`research/data/experiments/album-artwork-palette-v2-0.7.2-development/sources/${source.caseId}.json`,
		)
		frozenSourceArtifactHashes.set(source.caseId, await fileSha256(path))
	}
	return { panel, frozenSourceArtifactHashes }
}

async function implementationSha256(): Promise<string> {
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const path of ALBUM_ARTWORK_PALETTE_V2_0_7_3_IMPLEMENTATION_PATHS) {
		hash.update(path)
		hash.update("\0")
		hash.update(await readFile(resolve(projectRoot, path)))
		hash.update("\0")
	}
	return hash.digest("hex")
}

function childTimeout(phase: ChildPhase, ceiling: number | null): number {
	if (phase === "calibration") return ALBUM_ARTWORK_PALETTE_V2_0_7_3_CALIBRATION_TIMEOUT_MS
	const armRuns = phase === "recall" ? 9 : phase === "factorized-6000" ? 3 : 2
	return (ceiling ?? 60_000) * armRuns + 30_000
}

function runChild(requestPath: string, timeoutMs: number): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, requestPath], {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
		})
		let stdout = ""
		let stderr = ""
		let settled = false
		const finish = (error?: Error): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			if (error) reject(error)
			else resolvePromise()
		}
		const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
			if (stream === "stdout") stdout += chunk.toString("utf8")
			else stderr += chunk.toString("utf8")
			if (Buffer.byteLength(stdout) > ALBUM_ARTWORK_PALETTE_V2_0_7_3_STDIO_LIMIT_BYTES ||
				Buffer.byteLength(stderr) > ALBUM_ARTWORK_PALETTE_V2_0_7_3_STDIO_LIMIT_BYTES) {
				child.kill("SIGTERM")
				finish(new Error(`Child output exceeded the bounded stdio limit for ${basename(requestPath)}`))
			}
		}
		child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk))
		child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk))
		child.once("error", (error) => finish(error))
		child.once("close", (code, signal) => {
			if (code === 0) {
				if (stdout) process.stdout.write(stdout)
				finish()
			} else {
				finish(new Error(`Child ${basename(requestPath)} failed (${code ?? signal}): ${stderr.trim()}`))
			}
		})
		const timer = setTimeout(() => {
			child.kill("SIGTERM")
			finish(new Error(`Child ${basename(requestPath)} exceeded its ${timeoutMs}ms phase timeout`))
		}, timeoutMs)
	})
}

async function runPool<T>(values: readonly T[], operation: (value: T) => Promise<void>): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (true) {
			const index = next++
			if (index >= values.length) return
			await operation(values[index])
		}
	}
	await Promise.all(Array.from({ length: Math.min(ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT, values.length) }, worker))
}

async function runPhase(
	phase: ChildPhase,
	sources: readonly AlbumArtworkPaletteV2073SourceRecord[],
	stagingRoot: string,
	workRoot: string,
	implementation: string,
	frozenSourceHashes: ReadonlyMap<string, string>,
	executionManifestPath: string | undefined,
	ceiling: number | null,
): Promise<void> {
	const phaseDirectory = resolve(workRoot, phase)
	const requestDirectory = resolve(workRoot, "requests")
	await mkdir(phaseDirectory, { recursive: false })
	await runPool(sources, async (source) => {
		const outputPath = resolve(phaseDirectory, `${source.caseId}.json`)
		const requestPath = resolve(requestDirectory, `${phase}-${source.caseId}.json`)
		const frozenSourceArtifactRawSha256 = frozenSourceHashes.get(source.caseId)
		if (!frozenSourceArtifactRawSha256) throw new Error(`Missing frozen source binding for ${source.caseId}`)
		const request = {
			schemaVersion: 1,
			phase,
			caseId: source.caseId,
			implementationSha256: implementation,
			stagingRoot,
			outputPath,
			...executionManifestPath === undefined ? {} : { executionManifestPath },
			frozenSourceArtifactRawSha256,
			...phase === "factorized-6000" ? {
				storedFactorized3000Path: resolve(workRoot, "factorized-3000", `${source.caseId}.json`),
			} : {},
		}
		await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" })
		await runChild(requestPath, childTimeout(phase, ceiling))
	})
}

async function manifestFile(root: string, path: string): Promise<AlbumArtworkPaletteV2073ManifestFile> {
	if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`Unsafe artifact manifest path ${path}`)
	const absolute = resolve(root, path)
	if (!pathInside(root, absolute)) throw new Error(`Artifact manifest path escaped publication root: ${path}`)
	const metadata = await stat(absolute)
	return { path, byteCount: metadata.size, rawSha256: await fileSha256(absolute) }
}

function parseArguments(): Readonly<{
	outputDirectory: string
	smokeCaseId: string | null
}> {
	let outputDirectory = defaultOutputDirectory
	let smokeCaseId: string | null = null
	for (const argument of process.argv.slice(2)) {
		if (argument.startsWith("--output=")) outputDirectory = resolve(argument.slice("--output=".length))
		else if (argument.startsWith("--smoke-source=")) smokeCaseId = argument.slice("--smoke-source=".length)
		else throw new Error(`Unknown argument ${argument}`)
	}
	if (smokeCaseId !== null && outputDirectory === defaultOutputDirectory) {
		throw new Error("A one-source smoke run requires an explicit non-final --output namespace")
	}
	return { outputDirectory, smokeCaseId }
}

async function main(): Promise<void> {
	const { outputDirectory, smokeCaseId } = parseArguments()
	await assertAbsent(outputDirectory)
	const outputParent = dirname(outputDirectory)
	if (!(await stat(outputParent)).isDirectory()) throw new Error(`Output parent is not a directory: ${outputParent}`)
	const { panel, frozenSourceArtifactHashes } = await verifyFrozenInputs()
	const sources = smokeCaseId === null
		? panel.sources
		: panel.sources.filter(({ caseId }) => caseId === smokeCaseId)
	if (sources.length !== (smokeCaseId === null ? 28 : 1)) throw new Error(`Unknown smoke source ${smokeCaseId}`)
	const implementation = await implementationSha256()
	const stagingRoot = await mkdtemp(resolve(outputParent, `.${basename(outputDirectory)}.staging-`))
	const workRoot = resolve(stagingRoot, ".work")
	const executionManifestPath = resolve(stagingRoot, "execution-manifest.json")
	try {
		await mkdir(workRoot)
		await mkdir(resolve(workRoot, "requests"))
		await mkdir(resolve(stagingRoot, "sources"))
		process.stdout.write(`0.7.3 implementation: ${implementation}\n`)
		process.stdout.write(`Fixed worker count: ${ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT}\n`)

		await runPhase("calibration", sources, stagingRoot, workRoot, implementation,
			frozenSourceArtifactHashes, undefined, null)
		const calibrations: AlbumArtworkPaletteV2073CalibrationArtifact[] = []
		for (const source of sources) {
			calibrations.push(JSON.parse(await readFile(
				resolve(workRoot, "calibration", `${source.caseId}.json`), "utf8")) as AlbumArtworkPaletteV2073CalibrationArtifact)
		}
		const maximumCalibrationWallMs = Math.max(...calibrations.flatMap(({ run }) => run.wallMs))
		const wallCeilingMsPerArmPerSource = Math.max(
			60_000,
			Math.ceil(6 * maximumCalibrationWallMs / 1_000) * 1_000,
		)
		const executionWithoutId = {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
			candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
			protocolId: ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID,
			auditId: ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID,
			mode: smokeCaseId === null ? "full-28-source" as const : "one-source-smoke" as const,
			workerCount: ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT,
			fixedPanelSourceCount: 28 as const,
			executedSourceCount: sources.length,
			sourceCaseIds: sources.map(({ caseId }) => caseId),
			implementationSha256: implementation,
			frozenBindings: ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS,
			calibration: {
				formula: "max(60000,ceil(6*maximumCalibrationWallMs/1000)*1000)" as const,
				maximumCalibrationWallMs,
				wallCeilingMsPerArmPerSource,
				sources: calibrations.map((calibration) => ({
					caseId: calibration.source.caseId,
					sourceSha256: calibration.source.sha256,
					frozenSourceArtifactRawSha256: calibration.frozenSourceArtifactRawSha256,
					controlScientificSha256: calibration.controlScientificSha256,
					wallMs: calibration.run.wallMs,
					fullOutputSha256: calibration.run.fullOutputSha256,
					repeatFullOutputSha256: calibration.run.repeatFullOutputSha256,
				})),
			},
		}
		const execution: AlbumArtworkPaletteV2073ExecutionManifest = {
			...executionWithoutId,
			executionManifestId: albumArtworkPaletteV2073ScientificSha256(executionWithoutId),
		}
		await atomicJson(executionManifestPath, execution)
		process.stdout.write(`Frozen per-arm wall ceiling: ${wallCeilingMsPerArmPerSource}ms\n`)

		await runPhase("control", sources, stagingRoot, workRoot, implementation,
			frozenSourceArtifactHashes, executionManifestPath, wallCeilingMsPerArmPerSource)
		await runPhase("recall", sources, stagingRoot, workRoot, implementation,
			frozenSourceArtifactHashes, executionManifestPath, wallCeilingMsPerArmPerSource)
		await runPhase("factorized-3000", sources, stagingRoot, workRoot, implementation,
			frozenSourceArtifactHashes, executionManifestPath, wallCeilingMsPerArmPerSource)

		let factorized3000QualifyingSources = 0
		const triggerSources: AlbumArtworkPaletteV2073SourceRecord[] = []
		for (const source of sources) {
			const artifact = JSON.parse(await readFile(
				resolve(workRoot, "factorized-3000", `${source.caseId}.json`), "utf8")) as AlbumArtworkPaletteV2073FactorizedArtifact
			if (artifact.arm.scientific.additions.some(({ qualification }) => qualification.qualifies)) {
				factorized3000QualifyingSources += 1
			}
			const certificate = artifact.arm.scientific.escalation
			if (certificate.trigger6000 && certificate.exactCheckpointOnlyProof &&
				certificate.reason === "verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint" &&
				certificate.witnesses.otherwiseQualifyingTreatmentKeys.length > 0 &&
				certificate.witnesses.otherwiseQualifyingCellKeys.length > 0 &&
				certificate.verifiedTriggerToken !== null) triggerSources.push(source)
		}
		if (factorized3000QualifyingSources < 3 && triggerSources.length > 0) {
			await runPhase("factorized-6000", triggerSources, stagingRoot, workRoot, implementation,
				frozenSourceArtifactHashes, executionManifestPath, wallCeilingMsPerArmPerSource)
		}

		const resultEvidence: AlbumArtworkPaletteV2073ResultSourceEvidence[] = []
		for (const source of sources) {
			const [control, recall, factorized3000] = await Promise.all([
				readFile(resolve(workRoot, "control", `${source.caseId}.json`), "utf8")
					.then((raw) => JSON.parse(raw) as AlbumArtworkPaletteV2073ControlArtifact),
				readFile(resolve(workRoot, "recall", `${source.caseId}.json`), "utf8")
					.then((raw) => JSON.parse(raw) as AlbumArtworkPaletteV2073RecallArtifact),
				readFile(resolve(workRoot, "factorized-3000", `${source.caseId}.json`), "utf8")
					.then((raw) => JSON.parse(raw) as AlbumArtworkPaletteV2073FactorizedArtifact),
			])
			const factorized6000Path = resolve(workRoot, "factorized-6000", `${source.caseId}.json`)
			let factorized6000: AlbumArtworkPaletteV2073FactorizedArtifact | null = null
			try {
				factorized6000 = JSON.parse(await readFile(factorized6000Path, "utf8")) as AlbumArtworkPaletteV2073FactorizedArtifact
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
			}
			const calibration = calibrations.find(({ source: candidate }) => candidate.caseId === source.caseId)!
			if (control.controlScientificSha256 !== calibration.controlScientificSha256 ||
				control.run.scientificSha256 !== calibration.controlScientificSha256) {
				throw new Error(`Manifest-bound control differs from calibration for ${source.caseId}`)
			}
			const sourceWithoutScientific = {
				schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
				candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
				protocolId: ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID,
				auditId: ALBUM_ARTWORK_PALETTE_V2_0_7_3_AUDIT_ID,
				implementationSha256: implementation,
				executionManifestId: execution.executionManifestId,
				source,
				dimensions: control.dimensions,
				control,
				recallArms: recall.arms,
				diagnostic: recall.diagnostic,
				factorized3000: factorized3000.arm,
				factorized6000: factorized6000?.arm ?? null,
			}
			const artifact: AlbumArtworkPaletteV2073SourceArtifact = {
				...sourceWithoutScientific,
				scientificSha256: albumArtworkPaletteV2073ScientificSha256(
					albumArtworkPaletteV2073SourceScientificIdentity(sourceWithoutScientific)),
			}
			await atomicJson(resolve(stagingRoot, "sources", `${source.caseId}.json`), artifact)
			resultEvidence.push(albumArtworkPaletteV2073ResultSourceEvidence(artifact))
		}

		const results = buildAlbumArtworkPaletteV2073ResultsFromEvidence(execution, resultEvidence)
		await atomicJson(resolve(stagingRoot, "results.json"), results)
		const summaryWithoutId = {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
			candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
			implementationSha256: implementation,
			executionManifestId: execution.executionManifestId,
			fixedPanelSourceCount: 28,
			executedSourceCount: sources.length,
			scientificSha256: results.scientificSha256,
			wallCeilingMsPerArmPerSource,
			arms: results.arms,
			factorizedEscalation: results.factorizedEscalation,
			selection: results.selection,
			authorization: results.authorization,
			disposition: results.selection.pass
				? "bounded-recall-mechanism-selected-no-next-step-authorized"
				: "next-research-unit-multi-hue-field-structure",
		}
		await atomicJson(resolve(stagingRoot, "summary.json"), {
			...summaryWithoutId,
			summaryId: albumArtworkPaletteV2073ScientificSha256(summaryWithoutId),
		})

		await rm(workRoot, { recursive: true, force: true })
		const analysis = await analyzeAlbumArtworkPaletteV2073Development(stagingRoot)
		await atomicJson(resolve(stagingRoot, "analysis.json"), analysis)
		const artifactPaths = [
			"analysis.json",
			"execution-manifest.json",
			"results.json",
			"summary.json",
			...sources.map(({ caseId }) => `sources/${caseId}.json`),
		].sort()
		const files = await Promise.all(artifactPaths.map((path) => manifestFile(stagingRoot, path)))
		const manifestWithoutId = {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
			candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
			executionManifestId: execution.executionManifestId,
			files,
			orderedRoot: albumArtworkPaletteV2073OrderedRoot(files),
		}
		await atomicJson(resolve(stagingRoot, "manifest.json"), {
			...manifestWithoutId,
			manifestId: albumArtworkPaletteV2073ScientificSha256(manifestWithoutId),
		})
		await verifyAlbumArtworkPaletteV2073Development(stagingRoot)
		await rename(stagingRoot, outputDirectory)
		process.stdout.write(`Published atomically to ${outputDirectory}\n`)
	} catch (error) {
		await rm(stagingRoot, { recursive: true, force: true })
		throw error
	}
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
