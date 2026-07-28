import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	analyzeAlbumArtworkPaletteV2074Development,
	verifyAlbumArtworkPaletteV2074Development,
} from "./analyze-album-artwork-palette-v2-0.7.4-development.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CALIBRATION_TIMEOUT_MS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHILD_OUTPUT_LIMIT_BYTES,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_STDIO_LIMIT_BYTES,
	albumArtworkPaletteV2074CanonicalJson,
	albumArtworkPaletteV2074ContentId,
	albumArtworkPaletteV2074FileSha256,
	albumArtworkPaletteV2074OrderedFileRoot,
	albumArtworkPaletteV2074ScientificSha256,
	buildAlbumArtworkPaletteV2074ImplementationClosure,
	buildAlbumArtworkPaletteV2074Results,
	buildAlbumArtworkPaletteV2074Summary,
	verifyAlbumArtworkPaletteV2074FrozenInputs,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import type {
	AlbumArtworkPaletteV2074CalibrationArtifact,
	AlbumArtworkPaletteV2074CandidateArtifact,
	AlbumArtworkPaletteV2074ExecutionManifest,
	AlbumArtworkPaletteV2074FileRow,
	AlbumArtworkPaletteV2074FrozenInputs,
	AlbumArtworkPaletteV2074SourceArtifact,
	AlbumArtworkPaletteV2074SourceRecord,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
} from "./src/album-artwork-palette-v2-0.7.4-protocol.ts"

type Schedule = Readonly<{
	id: "schedule-a" | "schedule-b"
	workerCount: 1 | 6
	dispatchOrder: "case-id-ascending" | "case-id-descending"
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const childPath = resolve(moduleDirectory, "album-artwork-palette-v2-0.7.4-development-child.ts")
const defaultOutputDirectory = resolve(
	moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.4-development",
)

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

async function assertAbsent(path: string): Promise<void> {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite existing namespace ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	await assertAbsent(path)
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function childTimeout(phase: "calibration" | "candidate", ceiling: number | null): number {
	return phase === "calibration"
		? ALBUM_ARTWORK_PALETTE_V2_0_7_4_CALIBRATION_TIMEOUT_MS
		: (ceiling ?? 60_000) + 120_000
}

function runChild(requestPath: string, outputPath: string, timeoutMs: number): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, requestPath], {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
		})
		let stdout = ""
		let stderr = ""
		let settled = false
		const finish = async (error?: Error): Promise<void> => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			if (error) {
				reject(error)
				return
			}
			try {
				const metadata = await stat(outputPath)
				invariant(metadata.isFile() && metadata.size <= ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHILD_OUTPUT_LIMIT_BYTES,
					`Child artifact exceeded ${ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHILD_OUTPUT_LIMIT_BYTES} bytes`)
				if (stdout) process.stdout.write(stdout)
				resolvePromise()
			} catch (caught) {
				reject(caught)
			}
		}
		const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
			if (stream === "stdout") stdout += chunk.toString("utf8")
			else stderr += chunk.toString("utf8")
			if (Buffer.byteLength(stdout) > ALBUM_ARTWORK_PALETTE_V2_0_7_4_STDIO_LIMIT_BYTES ||
				Buffer.byteLength(stderr) > ALBUM_ARTWORK_PALETTE_V2_0_7_4_STDIO_LIMIT_BYTES) {
				child.kill("SIGTERM")
				void finish(new Error(`Child output exceeded its bounded stdio limit for ${basename(requestPath)}`))
			}
		}
		child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk))
		child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk))
		child.once("error", (error) => void finish(error))
		child.once("close", (code, signal) => {
			if (code === 0) void finish()
			else void finish(new Error(
				`Child ${basename(requestPath)} failed (${code ?? signal}): ${stderr.trim()}`,
			))
		})
		const timer = setTimeout(() => {
			child.kill("SIGTERM")
			void finish(new Error(`Child ${basename(requestPath)} exceeded its ${timeoutMs}ms timeout`))
		}, timeoutMs)
	})
}

async function runPool<T>(
	values: readonly T[],
	workerCount: number,
	operation: (value: T) => Promise<void>,
): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (true) {
			const index = next++
			if (index >= values.length) return
			await operation(values[index])
		}
	}
	await Promise.all(Array.from({ length: Math.min(workerCount, values.length) }, worker))
}

function sourceHash(
	map: ReadonlyMap<string, string>,
	caseId: string,
	label: string,
): string {
	const value = map.get(caseId)
	invariant(value !== undefined, `Missing ${label} source hash for ${caseId}`)
	return value
}

async function runSchedule(
	phase: "calibration" | "candidate",
	schedule: Schedule,
	sources: readonly AlbumArtworkPaletteV2074SourceRecord[],
	stagingRoot: string,
	workRoot: string,
	implementationSha256: string,
	frozen: AlbumArtworkPaletteV2074FrozenInputs,
	executionManifestPath: string | undefined,
	ceiling: number | null,
): Promise<void> {
	const outputDirectory = resolve(workRoot, `${phase}-${schedule.id}`)
	await mkdir(outputDirectory)
	const dispatch = schedule.dispatchOrder === "case-id-ascending" ? [...sources] : [...sources].reverse()
	await runPool(dispatch, schedule.workerCount, async (source) => {
		const outputPath = resolve(outputDirectory, `${source.caseId}.json`)
		const requestPath = resolve(workRoot, "requests", `${phase}-${schedule.id}-${source.caseId}.json`)
		const request = {
			schemaVersion: 1,
			phase,
			scheduleId: schedule.id,
			caseId: source.caseId,
			implementationSha256,
			stagingRoot,
			outputPath,
			...executionManifestPath === undefined ? {} : { executionManifestPath },
			frozenSourceArtifactRawSha256: sourceHash(frozen.frozenSourceArtifactHashes, source.caseId, "0.7.2"),
			productSourceArtifactRawSha256: sourceHash(frozen.productSourceArtifactHashes, source.caseId, "0.6.0"),
			historical073SourceArtifactRawSha256: sourceHash(
				frozen.historical073SourceArtifactHashes, source.caseId, "0.7.3"),
		}
		await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" })
		await runChild(requestPath, outputPath, childTimeout(phase, ceiling))
	})
}

async function readScheduleArtifacts<T>(
	phase: "calibration" | "candidate",
	schedule: Schedule,
	sources: readonly AlbumArtworkPaletteV2074SourceRecord[],
	workRoot: string,
): Promise<T[]> {
	const values: T[] = []
	for (const source of sources) {
		values.push(JSON.parse(await readFile(
			resolve(workRoot, `${phase}-${schedule.id}`, `${source.caseId}.json`),
			"utf8",
		)) as T)
	}
	return values
}

async function manifestRow(root: string, path: string): Promise<AlbumArtworkPaletteV2074FileRow> {
	invariant(!path.startsWith("/") && !path.split("/").includes(".."), `Unsafe artifact path ${path}`)
	const absolute = resolve(root, path)
	const metadata = await stat(absolute)
	invariant(metadata.isFile(), `Artifact path is not a file: ${path}`)
	return { path, byteCount: metadata.size, rawSha256: await albumArtworkPaletteV2074FileSha256(absolute) }
}

function parseArguments(): Readonly<{ outputDirectory: string; smokeCaseId: string | null }> {
	let outputDirectory = defaultOutputDirectory
	let outputExplicit = false
	let smokeCaseId: string | null = null
	const argumentsList = process.argv.slice(2)
	for (let index = 0; index < argumentsList.length; index++) {
		const argument = argumentsList[index]
		if (argument === "--output") {
			const value = argumentsList[++index]
			invariant(value !== undefined, "--output requires a path")
			outputDirectory = resolve(value)
			outputExplicit = true
		} else if (argument.startsWith("--output=")) {
			outputDirectory = resolve(argument.slice("--output=".length))
			outputExplicit = true
		} else if (argument === "--smoke-source") {
			const value = argumentsList[++index]
			invariant(value !== undefined, "--smoke-source requires a case ID")
			smokeCaseId = value
		} else if (argument.startsWith("--smoke-source=")) {
			smokeCaseId = argument.slice("--smoke-source=".length)
		} else {
			throw new Error(`Unknown argument ${argument}`)
		}
	}
	if (smokeCaseId !== null) {
		invariant(outputExplicit && outputDirectory !== defaultOutputDirectory,
			"A one-source smoke requires an explicit non-final --output namespace")
	} else {
		invariant(outputDirectory === defaultOutputDirectory,
			"The full 28-source execution must publish to the canonical 0.7.4 namespace")
	}
	return { outputDirectory, smokeCaseId }
}

async function main(): Promise<void> {
	const { outputDirectory, smokeCaseId } = parseArguments()
	await assertAbsent(outputDirectory)
	const outputParent = dirname(outputDirectory)
	invariant((await stat(outputParent)).isDirectory(), `Output parent is not a directory: ${outputParent}`)

	const [frozen, closure] = await Promise.all([
		verifyAlbumArtworkPaletteV2074FrozenInputs(projectRoot),
		buildAlbumArtworkPaletteV2074ImplementationClosure(projectRoot),
	])
	const sources = (smokeCaseId === null
		? [...frozen.panel.sources]
		: frozen.panel.sources.filter(({ caseId }) => caseId === smokeCaseId))
		.sort((first, second) => first.caseId < second.caseId ? -1 : first.caseId > second.caseId ? 1 : 0)
	invariant(sources.length === (smokeCaseId === null ? 28 : 1), `Unknown smoke source ${smokeCaseId}`)
	const schedules = ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME.candidatePasses as readonly Schedule[]
	const stagingRoot = await mkdtemp(resolve(outputParent, `.${basename(outputDirectory)}.staging-`))
	const workRoot = resolve(stagingRoot, ".work")
	const executionManifestPath = resolve(stagingRoot, "execution-manifest.json")
	try {
		await mkdir(workRoot)
		await mkdir(resolve(workRoot, "requests"))
		await mkdir(resolve(stagingRoot, "sources"))
		process.stdout.write(`0.7.4 implementation: ${closure.implementationSha256}\n`)

		for (const schedule of schedules) {
			await runSchedule("calibration", schedule, sources, stagingRoot, workRoot,
				closure.implementationSha256, frozen, undefined, null)
		}
		const calibrationBySchedule = new Map<string, AlbumArtworkPaletteV2074CalibrationArtifact[]>()
		for (const schedule of schedules) {
			calibrationBySchedule.set(schedule.id,
				await readScheduleArtifacts("calibration", schedule, sources, workRoot))
		}
		for (const [index, source] of sources.entries()) {
			const first = calibrationBySchedule.get("schedule-a")![index]
			const second = calibrationBySchedule.get("schedule-b")![index]
			invariant(first.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
				second.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
				first.phase === "calibration" && second.phase === "calibration" &&
				first.scheduleId === "schedule-a" && second.scheduleId === "schedule-b" &&
				first.implementationSha256 === closure.implementationSha256 &&
				second.implementationSha256 === closure.implementationSha256,
				`Control calibration artifact identity is invalid for ${source.caseId}`)
			const stable = (value: AlbumArtworkPaletteV2074CalibrationArtifact): unknown => ({
				source: value.source,
				dimensions: value.dimensions,
				frozenSourceArtifactRawSha256: value.frozenSourceArtifactRawSha256,
				controlJsonByteSha256: value.controlJsonByteSha256,
				controlScientificSha256: value.controlScientificSha256,
			})
			invariant(first.source.caseId === source.caseId &&
				albumArtworkPaletteV2074CanonicalJson(stable(first)) ===
				albumArtworkPaletteV2074CanonicalJson(stable(second)),
				`Control calibration changed across worker schedules for ${source.caseId}`)
		}
		const calibrationValues = [...calibrationBySchedule.values()].flat()
		const maximumControlCalibrationWallMs = Math.max(...calibrationValues.map(({ wallMs }) => wallMs))
		const candidateWallCeilingMsPerSourcePerPass = Math.max(
			60_000,
			Math.ceil(6 * maximumControlCalibrationWallMs / 1_000) * 1_000,
		)
		const closureAfterCalibration = await buildAlbumArtworkPaletteV2074ImplementationClosure(projectRoot)
		invariant(albumArtworkPaletteV2074CanonicalJson(closureAfterCalibration) ===
			albumArtworkPaletteV2074CanonicalJson(closure), "Implementation closure changed during calibration")
		const executionWithoutId = {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
			candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
			protocolId: ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
			closureId: ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID,
			mode: smokeCaseId === null ? "full-28-source" as const : "one-source-smoke" as const,
			fixedPanelSourceCount: 28 as const,
			executedSourceCount: sources.length,
			sourceCaseIds: sources.map(({ caseId }) => caseId),
			implementationClosure: closure,
			implementationSha256: closure.implementationSha256,
			frozenBindings: ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS,
			historical073Verification: frozen.historical073Verification,
			calibration: {
				formula: "max(60000,ceil(6*maximumControlCalibrationWallMs/1000)*1000)" as const,
				maximumControlCalibrationWallMs,
				candidateWallCeilingMsPerSourcePerPass,
				schedules: schedules.map((schedule) => ({
					id: schedule.id,
					workerCount: schedule.workerCount,
					dispatchOrder: schedule.dispatchOrder,
					sources: calibrationBySchedule.get(schedule.id)!.map((calibration) => ({
						caseId: calibration.source.caseId,
						sourceSha256: calibration.source.sha256,
						frozenSourceArtifactRawSha256: calibration.frozenSourceArtifactRawSha256,
						productSourceArtifactRawSha256: sourceHash(
							frozen.productSourceArtifactHashes, calibration.source.caseId, "0.6.0"),
						historical073SourceArtifactRawSha256: sourceHash(
							frozen.historical073SourceArtifactHashes, calibration.source.caseId, "0.7.3"),
						controlJsonByteSha256: calibration.controlJsonByteSha256,
						controlScientificSha256: calibration.controlScientificSha256,
						wallMs: calibration.wallMs,
					})),
				})),
			},
			candidateSchedules: ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME.candidatePasses,
			canonicalAggregateOrder: "case-id-ascending" as const,
		}
		const execution: AlbumArtworkPaletteV2074ExecutionManifest = {
			...executionWithoutId,
			executionManifestId: albumArtworkPaletteV2074ScientificSha256(executionWithoutId),
		}
		await atomicJson(executionManifestPath, execution)
		process.stdout.write(`Frozen candidate wall ceiling: ${candidateWallCeilingMsPerSourcePerPass}ms\n`)

		for (const schedule of schedules) {
			await runSchedule("candidate", schedule, sources, stagingRoot, workRoot,
				closure.implementationSha256, frozen, executionManifestPath, candidateWallCeilingMsPerSourcePerPass)
		}
		const candidates = new Map<string, AlbumArtworkPaletteV2074CandidateArtifact[]>()
		for (const schedule of schedules) {
			candidates.set(schedule.id, await readScheduleArtifacts("candidate", schedule, sources, workRoot))
		}
		const sourceArtifacts: AlbumArtworkPaletteV2074SourceArtifact[] = []
		for (const [index, source] of sources.entries()) {
			const first = candidates.get("schedule-a")![index]
			const second = candidates.get("schedule-b")![index]
			invariant(first.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
				second.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
				first.phase === "candidate" && second.phase === "candidate" &&
				first.scheduleId === "schedule-a" && second.scheduleId === "schedule-b" &&
				first.implementationSha256 === closure.implementationSha256 &&
				second.implementationSha256 === closure.implementationSha256 &&
				first.executionManifestId === execution.executionManifestId &&
				second.executionManifestId === execution.executionManifestId &&
				first.scientific.source.caseId === source.caseId && second.scientific.source.caseId === source.caseId &&
				first.scientificSha256 === albumArtworkPaletteV2074ScientificSha256(first.scientific) &&
				second.scientificSha256 === albumArtworkPaletteV2074ScientificSha256(second.scientific) &&
				first.scientificSha256 === second.scientificSha256 &&
				albumArtworkPaletteV2074CanonicalJson(first.scientific) ===
				albumArtworkPaletteV2074CanonicalJson(second.scientific),
				`Candidate scientific payload changed across schedules for ${source.caseId}`)
			const artifact: AlbumArtworkPaletteV2074SourceArtifact = {
				schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
				candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
				protocolId: ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
				implementationSha256: closure.implementationSha256,
				executionManifestId: execution.executionManifestId,
				scientific: first.scientific,
				scientificSha256: first.scientificSha256,
				schedules: schedules.map((schedule, scheduleIndex) => {
					const candidate = scheduleIndex === 0 ? first : second
					return {
						id: schedule.id,
						workerCount: schedule.workerCount,
						dispatchOrder: schedule.dispatchOrder,
						payloadSha256: candidate.scientificSha256,
						wallMs: candidate.wallMs,
					}
				}),
			}
			await atomicJson(resolve(stagingRoot, "sources", `${source.caseId}.json`), artifact)
			sourceArtifacts.push(artifact)
		}

		const results = buildAlbumArtworkPaletteV2074Results(execution, sourceArtifacts)
		await atomicJson(resolve(stagingRoot, "results.json"), results)
		await atomicJson(resolve(stagingRoot, "summary.json"), buildAlbumArtworkPaletteV2074Summary(results))
		await rm(workRoot, { recursive: true, force: true })
		const analysis = await analyzeAlbumArtworkPaletteV2074Development(stagingRoot)
		await atomicJson(resolve(stagingRoot, "analysis.json"), analysis)
		const artifactPaths = [
			"analysis.json",
			"execution-manifest.json",
			"results.json",
			"summary.json",
			...sources.map(({ caseId }) => `sources/${caseId}.json`),
		].sort()
		const files: AlbumArtworkPaletteV2074FileRow[] = []
		for (const path of artifactPaths) files.push(await manifestRow(stagingRoot, path))
		const manifestWithoutId = {
			schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
			candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
			executionManifestId: execution.executionManifestId,
			files,
			orderedRoot: albumArtworkPaletteV2074OrderedFileRoot(
				"album-artwork-palette-v2-0.7.4-artifact-root-v1", files),
		}
		await atomicJson(resolve(stagingRoot, "manifest.json"), {
			...manifestWithoutId,
			manifestId: albumArtworkPaletteV2074ScientificSha256(manifestWithoutId),
		})
		await verifyAlbumArtworkPaletteV2074Development(stagingRoot)
		await assertAbsent(outputDirectory)
		await rename(stagingRoot, outputDirectory)
		process.stdout.write(`Published atomically to ${outputDirectory}\n`)
	} catch (error) {
		await rm(stagingRoot, { recursive: true, force: true })
		throw error
	}
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
