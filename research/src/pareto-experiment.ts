import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	unlink,
	writeFile,
	type FileHandle,
} from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { contrastRatio, okDistance, rgbToOKLab } from "./color.ts"
import { computeSemanticResultsSha256 } from "./corpus-selection.ts"
import { validateCandidateArtifacts } from "./candidate-validation.ts"
import { loadImage } from "./image.ts"
import {
	minimumParetoAccentBackgroundContrast,
	minimumParetoAccentBackgroundDistance,
	minimumParetoAccentSurfaceDistance,
	minimumParetoForegroundBackgroundContrast,
	minimumParetoForegroundSurfaceContrast,
	paretoObjectiveOrder,
	type ParetoPaletteCertificate,
} from "./pareto-palette.ts"
import {
	PARETO_BASELINE_VERSION,
	PARETO_EXPERIMENT_VERSION,
	type ParetoExtractionResult,
} from "./pareto-extract.ts"
import type { CorpusResult } from "./types.ts"

export const paretoArtifactNames = [
	"results.json",
	"holdout-results.json",
	"pareto-certificates.json",
	"holdout-pareto-certificates.json",
] as const

export const paretoImplementationFiles = [
	"run-pareto-experiment.ts",
	"src/pareto-experiment.ts",
	"src/pareto-extract.ts",
	"src/pareto-palette.ts",
	"src/corpus-selection.ts",
	"src/candidate-validation.ts",
	"src/image.ts",
	"src/regions.ts",
	"src/candidates.ts",
	"src/palette.ts",
	"src/color.ts",
	"src/types.ts",
] as const

export type ParetoArtifactName = typeof paretoArtifactNames[number]
export type ParetoCompletionState = "running" | "complete" | "failed"

type BaselineHash = {
	file: string
	rawSha256: string
	semanticSha256: string
}

export type ParetoExperimentManifest = {
	schemaVersion: 2
	experimentVersion: typeof PARETO_EXPERIMENT_VERSION
	baselineAlgorithmVersion: typeof PARETO_BASELINE_VERSION
	command: string[]
	nodeVersion: string
	startedAt: string
	completedAt: string | null
	baseline: {
		development: BaselineHash
		holdout: BaselineHash
	}
	sourceHashes: Record<string, string>
	implementationHashes: Record<string, string>
	artifactHashes: Partial<Record<ParetoArtifactName, string>>
	artifactSemanticHashes: Partial<Record<ParetoArtifactName, string>>
	completion: {
		state: ParetoCompletionState
		developmentEntries: number
		holdoutEntries: number
		developmentCertificates: number
		holdoutCertificates: number
	}
	failure: string | null
}

export type ParetoCertificateArtifact = {
	generatedAt: string
	experimentVersion: typeof PARETO_EXPERIMENT_VERSION
	baselineAlgorithmVersion: typeof PARETO_BASELINE_VERSION
	cohort: "development" | "holdout"
	entries: Array<{
		file: string
		kind: CorpusResult["entries"][number]["kind"]
		review: boolean
		width: number
		height: number
		sourceSha256: string
		certificate: ParetoPaletteCertificate
	}>
}

export type ExperimentOutputAttempt = {
	outputDirectory: string
	stagingDirectory: string
	failedDirectory: string
	lockPath: string
	lock: FileHandle
	researchRoot: string
	experimentsRoot: string
	realExperimentsRoot: string
}

export type ParetoExperimentValidation = {
	experimentVersion: string
	developmentEntries: number
	holdoutEntries: number
	developmentCertificates: number
	holdoutCertificates: number
}

type RunOptions = {
	researchRoot: string
	projectRoot: string
	outputArgument: string
	command: string[]
	extract: (image: Awaited<ReturnType<typeof loadImage>>) => ParetoExtractionResult
	log?: (message: string) => void
}

type ValidationOptions = {
	researchRoot: string
	projectRoot: string
	implementationFiles?: readonly string[]
}

const sha256Pattern = /^[a-f0-9]{64}$/
const hexPattern = /^#[a-f0-9]{6}$/
const certificateRolePattern = /^#[a-f0-9]{6}!?$/
const roleNames = ["background", "foreground", "surface", "accent"] as const
const bundleNames = ["manifest.json", ...paretoArtifactNames] as const

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function assertSha256(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error(`${label} is not a SHA-256 digest`)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	const expected = new Set(keys)
	const missing = keys.filter((key) => !Object.hasOwn(value, key))
	const extra = Object.keys(value).filter((key) => !expected.has(key))
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(`${label} fields do not match the experiment schema`)
	}
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function resolveExperimentOutput(researchRoot: string, outputArgument: string): string {
	if (outputArgument.trim().length === 0) throw new Error("The experiment output directory must not be empty")
	const experimentsRoot = resolve(researchRoot, "data", "experiments")
	const output = isAbsolute(outputArgument) ? resolve(outputArgument) : resolve(researchRoot, outputArgument)
	if (dirname(output) !== experimentsRoot || basename(output) === "." || basename(output) === "..") {
		throw new Error(`Experiment output must be exactly one direct child under ${experimentsRoot}`)
	}
	return output
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
		throw error
	}
}

async function requirePhysicalExperimentsRoot(researchRoot: string): Promise<{
	experimentsRoot: string
	realExperimentsRoot: string
}> {
	const resolvedResearchRoot = resolve(researchRoot)
	const experimentsRoot = join(resolvedResearchRoot, "data", "experiments")
	let metadata
	try {
		metadata = await lstat(experimentsRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`Experiment root must already exist as a real directory: ${experimentsRoot}`)
		}
		throw error
	}
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Experiment root must be a non-symlink directory: ${experimentsRoot}`)
	}
	const [realResearchRoot, realExperimentsRoot] = await Promise.all([
		realpath(resolvedResearchRoot),
		realpath(experimentsRoot),
	])
	if (realExperimentsRoot !== join(realResearchRoot, "data", "experiments")) {
		throw new Error(`Experiment root does not physically reside under ${realResearchRoot}: ${experimentsRoot}`)
	}
	return { experimentsRoot, realExperimentsRoot }
}

async function closeAndRemoveOwnedLock(lock: FileHandle, lockPath: string): Promise<void> {
	let cleanupError: unknown
	try {
		const [opened, current] = await Promise.all([lock.stat(), lstat(lockPath)])
		if (!opened.isFile() || current.isSymbolicLink() || !current.isFile() ||
			opened.dev !== current.dev || opened.ino !== current.ino) {
			throw new Error(`Experiment lock changed while held; refusing to remove ${lockPath}`)
		}
		await unlink(lockPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") cleanupError = error
	}
	try {
		await lock.close()
	} catch (error) {
		cleanupError ??= error
	}
	if (cleanupError) throw cleanupError
}

export async function beginExperimentOutput(researchRoot: string, outputArgument: string): Promise<ExperimentOutputAttempt> {
	const outputDirectory = resolveExperimentOutput(researchRoot, outputArgument)
	const { experimentsRoot, realExperimentsRoot } = await requirePhysicalExperimentsRoot(researchRoot)
	if (await pathExists(outputDirectory)) throw new Error(`Refusing to overwrite existing experiment output: ${outputDirectory}`)

	const name = basename(outputDirectory)
	const lockPath = join(experimentsRoot, `.${name}.lock`)
	let lock: FileHandle
	try {
		lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Experiment lock already exists (including stale or broken locks); refusing ${lockPath}`)
		}
		throw error
	}
	try {
		if (!(await lock.stat()).isFile()) throw new Error(`Experiment lock is not a regular file: ${lockPath}`)
		const currentRoot = await requirePhysicalExperimentsRoot(researchRoot)
		if (currentRoot.realExperimentsRoot !== realExperimentsRoot) {
			throw new Error(`Experiment root changed while acquiring ${lockPath}`)
		}
		if (await pathExists(outputDirectory)) throw new Error(`Refusing to overwrite existing experiment output: ${outputDirectory}`)
		const identity = `${Date.now()}-${process.pid}-${randomUUID()}`
		const stagingDirectory = join(experimentsRoot, `.${name}.staging-${identity}`)
		const failedDirectory = join(experimentsRoot, `${name}.failed-${identity}`)
		await mkdir(stagingDirectory)
		return {
			outputDirectory,
			stagingDirectory,
			failedDirectory,
			lockPath,
			lock,
			researchRoot,
			experimentsRoot,
			realExperimentsRoot,
		}
	} catch (error) {
		try {
			await closeAndRemoveOwnedLock(lock, lockPath)
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], `Failed to initialize and clean up experiment output ${outputDirectory}`)
		}
		throw error
	}
}

export async function releaseExperimentOutput(attempt: ExperimentOutputAttempt): Promise<void> {
	await closeAndRemoveOwnedLock(attempt.lock, attempt.lockPath)
}

export async function publishExperimentOutput(attempt: ExperimentOutputAttempt): Promise<void> {
	const currentRoot = await requirePhysicalExperimentsRoot(attempt.researchRoot)
	if (currentRoot.experimentsRoot !== attempt.experimentsRoot ||
		currentRoot.realExperimentsRoot !== attempt.realExperimentsRoot) {
		throw new Error("Experiment root changed before publication")
	}
	const stagingMetadata = await lstat(attempt.stagingDirectory)
	if (stagingMetadata.isSymbolicLink() || !stagingMetadata.isDirectory() ||
		dirname(attempt.stagingDirectory) !== attempt.experimentsRoot) {
		throw new Error(`Experiment staging path is not a real sibling directory: ${attempt.stagingDirectory}`)
	}
	if (await pathExists(attempt.outputDirectory)) {
		throw new Error(`Refusing to overwrite existing experiment output: ${attempt.outputDirectory}`)
	}
	await rename(attempt.stagingDirectory, attempt.outputDirectory)
}

export async function preserveFailedExperiment(attempt: ExperimentOutputAttempt): Promise<string> {
	if (!await pathExists(attempt.stagingDirectory)) return attempt.outputDirectory
	if (await pathExists(attempt.failedDirectory)) {
		throw new Error(`Refusing to overwrite existing failed experiment output: ${attempt.failedDirectory}`)
	}
	await rename(attempt.stagingDirectory, attempt.failedDirectory)
	return attempt.failedDirectory
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

async function readJson(path: string): Promise<{ bytes: Uint8Array; value: unknown }> {
	let bytes: Uint8Array
	try {
		bytes = await readFile(path)
	} catch (error) {
		throw new Error(`Unable to read ${path}`, { cause: error })
	}
	try {
		return { bytes, value: JSON.parse(Buffer.from(bytes).toString("utf8")) }
	} catch (error) {
		throw new Error(`Invalid JSON in ${path}`, { cause: error })
	}
}

async function readRegularJson(path: string): Promise<{ bytes: Uint8Array; value: unknown }> {
	let handle: FileHandle | undefined
	try {
		const before = await lstat(path)
		if (before.isSymbolicLink() || !before.isFile()) throw new Error(`Bundle entry must be a regular non-symlink file: ${path}`)
		handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
		const opened = await handle.stat()
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
			throw new Error(`Bundle entry changed while opening: ${path}`)
		}
		const bytes = await handle.readFile()
		try {
			return { bytes, value: JSON.parse(bytes.toString("utf8")) }
		} catch (error) {
			throw new Error(`Invalid JSON in ${path}`, { cause: error })
		}
	} catch (error) {
		if (error instanceof Error && (error.message.startsWith("Bundle entry") || error.message.startsWith("Invalid JSON"))) {
			throw error
		}
		throw new Error(`Unable to safely read bundle entry ${path}`, { cause: error })
	} finally {
		await handle?.close()
	}
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

export function computeParetoCertificateSemanticSha256(artifact: ParetoCertificateArtifact): string {
	const { generatedAt: _generatedAt, ...semantic } = artifact
	return sha256(JSON.stringify(canonicalValue(semantic)))
}

function requireCorpus(value: unknown, label: string, expectedCount: number): CorpusResult {
	if (!isRecord(value) || value.algorithmVersion !== PARETO_BASELINE_VERSION || !Array.isArray(value.entries)) {
		throw new Error(`${label} must be a canonical ${PARETO_BASELINE_VERSION} corpus artifact`)
	}
	if (value.entries.length !== expectedCount) throw new Error(`${label} must contain exactly ${expectedCount} entries`)
	const files = new Set<string>()
	const artworkIds = new Set<string>()
	for (const [index, entry] of value.entries.entries()) {
		if (!isRecord(entry) || typeof entry.file !== "string" || typeof entry.kind !== "string" ||
			typeof entry.review !== "boolean" || !Number.isInteger(entry.width) || !Number.isInteger(entry.height)) {
			throw new Error(`${label}.entries[${index}] has invalid metadata`)
		}
		if (files.has(entry.file)) throw new Error(`${label} contains duplicate file ${entry.file}`)
		files.add(entry.file)
		if (label === "Holdout baseline") {
			if (!/^00\/[^/\\]+$/.test(entry.file)) throw new Error(`Invalid holdout source path ${entry.file}`)
			const name = entry.file.slice(3)
			const artworkId = name.startsWith("ab67616d") ? name.slice(16) : name
			if (artworkIds.has(artworkId)) throw new Error(`${label} contains duplicate artwork ${artworkId}`)
			artworkIds.add(artworkId)
		} else if (entry.file.includes("/") || entry.file.includes("\\")) {
			throw new Error(`Invalid development source path ${entry.file}`)
		}
	}
	return value as unknown as CorpusResult
}

function sourcePath(projectRoot: string, file: string): string {
	if (/^00\/[^/\\]+$/.test(file)) return join(projectRoot, file)
	if (file.length > 0 && !file.includes("/") && !file.includes("\\")) return join(projectRoot, "images", file)
	throw new Error(`Unsafe corpus source path ${file}`)
}

async function hashImplementations(researchRoot: string, files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(join(researchRoot, file)))])))
}

function emptyManifest(command: string[], startedAt: string): ParetoExperimentManifest {
	return {
		schemaVersion: 2,
		experimentVersion: PARETO_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: PARETO_BASELINE_VERSION,
		command,
		nodeVersion: process.version,
		startedAt,
		completedAt: null,
		baseline: {
			development: { file: "data/results.json", rawSha256: "", semanticSha256: "" },
			holdout: { file: "data/holdout-results.json", rawSha256: "", semanticSha256: "" },
		},
		sourceHashes: {},
		implementationHashes: {},
		artifactHashes: {},
		artifactSemanticHashes: {},
		completion: {
			state: "running",
			developmentEntries: 0,
			holdoutEntries: 0,
			developmentCertificates: 0,
			holdoutCertificates: 0,
		},
		failure: null,
	}
}

async function generateCohort(
	baseline: CorpusResult,
	cohort: "development" | "holdout",
	projectRoot: string,
	generatedAt: string,
	extract: RunOptions["extract"],
	sourceHashes: Record<string, string>,
	log: (message: string) => void,
): Promise<{ results: CorpusResult; certificates: ParetoCertificateArtifact }> {
	const results: CorpusResult = { generatedAt, algorithmVersion: PARETO_EXPERIMENT_VERSION, entries: [] }
	const certificates: ParetoCertificateArtifact = {
		generatedAt,
		experimentVersion: PARETO_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: PARETO_BASELINE_VERSION,
		cohort,
		entries: [],
	}
	for (const [index, baselineEntry] of baseline.entries.entries()) {
		const path = sourcePath(projectRoot, baselineEntry.file)
		const bytes = await readFile(path)
		const sourceSha256 = sha256(bytes)
		sourceHashes[baselineEntry.file] = sourceSha256
		const image = await loadImage(bytes)
		if (image.width !== baselineEntry.width || image.height !== baselineEntry.height) {
			throw new Error(`Normalized dimensions changed for ${baselineEntry.file}`)
		}
		const { extraction, certificate } = extract(image)
		results.entries.push({
			file: baselineEntry.file,
			kind: baselineEntry.kind,
			review: baselineEntry.review,
			width: image.width,
			height: image.height,
			extraction,
		})
		certificates.entries.push({
			file: baselineEntry.file,
			kind: baselineEntry.kind,
			review: baselineEntry.review,
			width: image.width,
			height: image.height,
			sourceSha256,
			certificate,
		})
		log(`[${index + 1}/${baseline.entries.length}] ${baselineEntry.file}: ${extraction.diagnostics.processingMs}ms`)
	}
	return { results, certificates }
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export async function runParetoExperiment(options: RunOptions): Promise<string> {
	const attempt = await beginExperimentOutput(options.researchRoot, options.outputArgument)
	let manifest: ParetoExperimentManifest | undefined
	let manifestPath: string | undefined
	try {
		const startedAt = new Date().toISOString()
		manifest = emptyManifest(options.command, startedAt)
		manifestPath = join(attempt.stagingDirectory, "manifest.json")
		await writeJsonAtomic(manifestPath, manifest)
		const developmentInput = await readJson(join(options.researchRoot, "data", "results.json"))
		const holdoutInput = await readJson(join(options.researchRoot, "data", "holdout-results.json"))
		const developmentBaseline = requireCorpus(developmentInput.value, "Development baseline", 37)
		const holdoutBaseline = requireCorpus(holdoutInput.value, "Holdout baseline", 355)
		manifest.baseline.development.rawSha256 = sha256(developmentInput.bytes)
		manifest.baseline.development.semanticSha256 = computeSemanticResultsSha256(developmentBaseline)
		manifest.baseline.holdout.rawSha256 = sha256(holdoutInput.bytes)
		manifest.baseline.holdout.semanticSha256 = computeSemanticResultsSha256(holdoutBaseline)
		manifest.implementationHashes = await hashImplementations(options.researchRoot, paretoImplementationFiles)
		await writeJsonAtomic(manifestPath, manifest)

		const log = options.log ?? (() => undefined)
		const development = await generateCohort(
			developmentBaseline, "development", options.projectRoot, startedAt, options.extract, manifest.sourceHashes, log,
		)
		manifest.completion.developmentEntries = development.results.entries.length
		manifest.completion.developmentCertificates = development.certificates.entries.length
		await writeJsonAtomic(manifestPath, manifest)
		const holdout = await generateCohort(
			holdoutBaseline, "holdout", options.projectRoot, startedAt, options.extract, manifest.sourceHashes, log,
		)
		manifest.completion.holdoutEntries = holdout.results.entries.length
		manifest.completion.holdoutCertificates = holdout.certificates.entries.length

		const artifacts: Record<ParetoArtifactName, unknown> = {
			"results.json": development.results,
			"holdout-results.json": holdout.results,
			"pareto-certificates.json": development.certificates,
			"holdout-pareto-certificates.json": holdout.certificates,
		}
		for (const name of paretoArtifactNames) await writeJsonAtomic(join(attempt.stagingDirectory, name), artifacts[name])
		for (const name of paretoArtifactNames) {
			manifest.artifactHashes[name] = sha256(await readFile(join(attempt.stagingDirectory, name)))
		}
		manifest.artifactSemanticHashes["results.json"] = computeSemanticResultsSha256(development.results)
		manifest.artifactSemanticHashes["holdout-results.json"] = computeSemanticResultsSha256(holdout.results)
		manifest.artifactSemanticHashes["pareto-certificates.json"] = computeParetoCertificateSemanticSha256(development.certificates)
		manifest.artifactSemanticHashes["holdout-pareto-certificates.json"] = computeParetoCertificateSemanticSha256(holdout.certificates)
		manifest.completedAt = new Date().toISOString()
		manifest.completion.state = "complete"
		await writeJsonAtomic(manifestPath, manifest)
		await validateParetoExperimentDirectory(attempt.stagingDirectory, options)
		await publishExperimentOutput(attempt)
		return attempt.outputDirectory
	} catch (error) {
		if (manifest && manifestPath) {
			manifest.completedAt = new Date().toISOString()
			manifest.completion.state = "failed"
			manifest.failure = failureMessage(error)
			try {
				await writeJsonAtomic(manifestPath, manifest)
			} catch {
				// The staging directory itself is retained even if its failure manifest cannot be updated.
			}
		}
		const failedDirectory = await preserveFailedExperiment(attempt)
		throw new Error(`Pareto experiment failed; staging attempt preserved at ${failedDirectory}`, { cause: error })
	} finally {
		await releaseExperimentOutput(attempt)
	}
}

function parseHashMap(value: unknown, expectedKeys: readonly string[], label: string): Record<string, string> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, expectedKeys, label)
	for (const key of expectedKeys) assertSha256(value[key], `${label}.${key}`)
	return value as Record<string, string>
}

function parseBaselineHash(value: unknown, expectedFile: string, label: string): BaselineHash {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["file", "rawSha256", "semanticSha256"], label)
	if (value.file !== expectedFile) throw new Error(`${label}.file must be ${expectedFile}`)
	assertSha256(value.rawSha256, `${label}.rawSha256`)
	assertSha256(value.semanticSha256, `${label}.semanticSha256`)
	return value as unknown as BaselineHash
}

function parseManifest(value: unknown): ParetoExperimentManifest {
	if (!isRecord(value)) throw new Error("Experiment manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "experimentVersion", "baselineAlgorithmVersion", "command", "nodeVersion", "startedAt",
		"completedAt", "baseline", "sourceHashes", "implementationHashes", "artifactHashes", "artifactSemanticHashes",
		"completion", "failure",
	], "Experiment manifest")
	if (value.schemaVersion !== 2 || value.experimentVersion !== PARETO_EXPERIMENT_VERSION ||
		value.baselineAlgorithmVersion !== PARETO_BASELINE_VERSION) throw new Error("Experiment manifest version is invalid")
	if (!Array.isArray(value.command) || value.command.length === 0 || value.command.some((part) => typeof part !== "string")) {
		throw new Error("Experiment manifest command is invalid")
	}
	if (typeof value.nodeVersion !== "string" || value.nodeVersion.length === 0) throw new Error("Experiment manifest nodeVersion is invalid")
	if (!validTimestamp(value.startedAt) || !validTimestamp(value.completedAt)) throw new Error("Experiment manifest timestamps are invalid")
	if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) throw new Error("Experiment manifest completedAt precedes startedAt")
	if (!isRecord(value.baseline)) throw new Error("Experiment manifest baseline is invalid")
	exactKeys(value.baseline, ["development", "holdout"], "Experiment manifest baseline")
	parseBaselineHash(value.baseline.development, "data/results.json", "Experiment manifest development baseline")
	parseBaselineHash(value.baseline.holdout, "data/holdout-results.json", "Experiment manifest holdout baseline")
	if (!isRecord(value.completion)) throw new Error("Experiment manifest completion is invalid")
	exactKeys(value.completion, [
		"state", "developmentEntries", "holdoutEntries", "developmentCertificates", "holdoutCertificates",
	], "Experiment manifest completion")
	if (value.completion.state !== "complete") throw new Error(`Experiment is not complete: ${String(value.completion.state)}`)
	if (value.completion.developmentEntries !== 37 || value.completion.holdoutEntries !== 355 ||
		value.completion.developmentCertificates !== 37 || value.completion.holdoutCertificates !== 355) {
		throw new Error("Experiment manifest completion coverage is invalid")
	}
	if (value.failure !== null) throw new Error("A completed experiment cannot contain a failure")
	return value as unknown as ParetoExperimentManifest
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
}

function assertUnitInterval(value: unknown, label: string): asserts value is number {
	assertFiniteNumber(value, label)
	if (value < 0 || value > 1) throw new Error(`${label} must be from 0 to 1`)
}

function approximatelyEqual(first: number, second: number): boolean {
	return Math.abs(first - second) <= 1e-10 * Math.max(1, Math.abs(first), Math.abs(second))
}

function parseObjectiveVector(value: unknown, label: string): readonly [number, number, number, number, number] {
	if (!Array.isArray(value) || value.length !== paretoObjectiveOrder.length) {
		throw new Error(`${label} must contain exactly ${paretoObjectiveOrder.length} values`)
	}
	for (const [index, component] of value.entries()) assertUnitInterval(component, `${label}[${index}]`)
	return value as [number, number, number, number, number]
}

function parseRegretVector(value: unknown, label: string): readonly [number, number, number, number, number] {
	if (!Array.isArray(value) || value.length !== paretoObjectiveOrder.length) {
		throw new Error(`${label} must contain exactly ${paretoObjectiveOrder.length} values`)
	}
	for (const [index, component] of value.entries()) assertUnitInterval(component, `${label}[${index}]`)
	return value as [number, number, number, number, number]
}

function validateNumericObject(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, number> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, keys, label)
	for (const key of keys) assertFiniteNumber(value[key], `${label}.${key}`)
}

function validateObjectiveComponents(value: unknown, label: string): void {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["background", "foreground", "surface", "accent", "salientIdentityCoverage"], label)
	validateNumericObject(value.background, ["coherentField", "frameRisk", "value"], `${label}.background`)
	validateNumericObject(value.foreground, ["typographyEvidence", "identity", "source", "value"], `${label}.foreground`)
	if (!isRecord(value.surface)) throw new Error(`${label}.surface must be an object`)
	exactKeys(value.surface, ["model", "fieldEvidence", "gradientEvidence", "collapseEvidence", "value"], `${label}.surface`)
	if (!(["collapsed", "field", "gradient"] as const).includes(value.surface.model as never)) {
		throw new Error(`${label}.surface.model is invalid`)
	}
	for (const key of ["fieldEvidence", "gradientEvidence", "collapseEvidence", "value"] as const) {
		assertFiniteNumber(value.surface[key], `${label}.surface.${key}`)
	}
	validateNumericObject(value.accent, ["identity", "visibility", "value"], `${label}.accent`)
	validateNumericObject(value.salientIdentityCoverage, ["coveredWeight", "totalWeight", "value"], `${label}.salientIdentityCoverage`)
	for (const [component, fields] of [
		[value.background, ["coherentField", "frameRisk", "value"]],
		[value.foreground, ["typographyEvidence", "identity", "source", "value"]],
		[value.surface, ["fieldEvidence", "gradientEvidence", "collapseEvidence", "value"]],
		[value.accent, ["identity", "visibility", "value"]],
	] as const) {
		for (const field of fields) assertUnitInterval(component[field], `${label}.${field}`)
	}
	const coverage = value.salientIdentityCoverage as Record<string, number>
	if (coverage.coveredWeight < 0 || coverage.totalWeight < 0 || coverage.coveredWeight > coverage.totalWeight + 1e-12) {
		throw new Error(`${label}.salientIdentityCoverage weights are invalid`)
	}
	assertUnitInterval(coverage.value, `${label}.salientIdentityCoverage.value`)
}

function validateGatePair(value: unknown, label: string): void {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["actual", "required"], label)
	assertFiniteNumber(value.actual, `${label}.actual`)
	assertFiniteNumber(value.required, `${label}.required`)
}

type ParsedFrontierSummary = ParetoPaletteCertificate["frontierSummaries"][number]

function validateFrontierSummary(value: unknown, label: string): ParsedFrontierSummary {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["semanticKey", "roles", "surfaceModel", "objectiveVector", "regret", "lexicographicRegret"], label)
	if (typeof value.semanticKey !== "string" || value.semanticKey.length === 0) throw new Error(`${label}.semanticKey is invalid`)
	if (!isRecord(value.roles)) throw new Error(`${label}.roles must be an object`)
	const roles = value.roles
	exactKeys(roles, roleNames, `${label}.roles`)
	for (const role of roleNames) {
		if (typeof roles[role] !== "string" || !certificateRolePattern.test(roles[role])) {
			throw new Error(`${label}.roles.${role} is invalid`)
		}
	}
	if (!(["collapsed", "field", "gradient"] as const).includes(value.surfaceModel as never)) {
		throw new Error(`${label}.surfaceModel is invalid`)
	}
	parseObjectiveVector(value.objectiveVector, `${label}.objectiveVector`)
	const regret = parseRegretVector(value.regret, `${label}.regret`)
	const lexicographicRegret = parseRegretVector(value.lexicographicRegret, `${label}.lexicographicRegret`)
	const sortedRegret = [...regret].sort((first, second) => second - first)
	if (!vectorsEqual(lexicographicRegret, sortedRegret)) throw new Error(`${label}.lexicographicRegret is not sorted regret`)
	const semanticKey = `${roleNames.map((role) => roles[role]).join(":")}:${value.surfaceModel}`
	if (value.semanticKey !== semanticKey) throw new Error(`${label}.semanticKey does not match its roles and surface model`)
	return value as unknown as ParsedFrontierSummary
}

function vectorsEqual(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function parseParetoPaletteCertificate(value: unknown, label: string): {
	certificate: ParetoPaletteCertificate
	selectedSummary: ParsedFrontierSummary
} {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["counts", "objectiveOrder", "selected", "frontierSummaries", "selectionRule", "gradientHandling"], label)
	if (!isRecord(value.counts)) throw new Error(`${label}.counts must be an object`)
	exactKeys(value.counts, ["attempted", "feasible", "frontier", "dominated"], `${label}.counts`)
	for (const key of ["attempted", "feasible", "frontier", "dominated"] as const) {
		if (!Number.isInteger(value.counts[key]) || (value.counts[key] as number) < 0) {
			throw new Error(`${label}.counts.${key} must be a non-negative integer`)
		}
	}
	if (!Array.isArray(value.objectiveOrder) || value.objectiveOrder.length !== paretoObjectiveOrder.length ||
		value.objectiveOrder.some((name, index) => name !== paretoObjectiveOrder[index])) {
		throw new Error(`${label}.objectiveOrder is invalid`)
	}
	if (!isRecord(value.selected)) throw new Error(`${label}.selected must be an object`)
	const selected = value.selected
	exactKeys(selected, ["semanticKey", "objectiveVector", "objectiveComponents", "regret", "lexicographicRegret", "gates"], `${label}.selected`)
	if (typeof selected.semanticKey !== "string" || selected.semanticKey.length === 0) {
		throw new Error(`${label}.selected.semanticKey is invalid`)
	}
	const selectedObjective = parseObjectiveVector(selected.objectiveVector, `${label}.selected.objectiveVector`)
	validateObjectiveComponents(selected.objectiveComponents, `${label}.selected.objectiveComponents`)
	const selectedRegret = parseRegretVector(selected.regret, `${label}.selected.regret`)
	const selectedLexicographicRegret = parseRegretVector(
		selected.lexicographicRegret,
		`${label}.selected.lexicographicRegret`,
	)
	if (!isRecord(selected.gates)) throw new Error(`${label}.selected.gates must be an object`)
	const gates = selected.gates
	exactKeys(gates, [
		"foregroundBackground", "foregroundSurface", "accentBackground", "accentBackgroundDistance",
		"accentSurfaceDistance", "generatedFallbackNecessary",
	], `${label}.selected.gates`)
	validateGatePair(gates.foregroundBackground, `${label}.selected.gates.foregroundBackground`)
	validateGatePair(gates.foregroundSurface, `${label}.selected.gates.foregroundSurface`)
	validateGatePair(gates.accentBackground, `${label}.selected.gates.accentBackground`)
	assertFiniteNumber(gates.accentBackgroundDistance, `${label}.selected.gates.accentBackgroundDistance`)
	assertFiniteNumber(gates.accentSurfaceDistance, `${label}.selected.gates.accentSurfaceDistance`)
	if (typeof gates.generatedFallbackNecessary !== "boolean") {
		throw new Error(`${label}.selected.gates.generatedFallbackNecessary must be boolean`)
	}
	for (const [name, gate, minimum] of [
		["foregroundBackground", gates.foregroundBackground, minimumParetoForegroundBackgroundContrast],
		["foregroundSurface", gates.foregroundSurface, minimumParetoForegroundSurfaceContrast],
		["accentBackground", gates.accentBackground, minimumParetoAccentBackgroundContrast],
	] as const) {
		const parsed = gate as { actual: number; required: number }
		if (parsed.required < minimum || parsed.actual + 1e-12 < parsed.required) {
			throw new Error(`${label}.selected.gates.${name} does not satisfy its required minimum`)
		}
	}
	if ((gates.accentBackgroundDistance as number) < 0 || (gates.accentSurfaceDistance as number) < 0) {
		throw new Error(`${label}.selected accent distances must be non-negative`)
	}
	if (!Array.isArray(value.frontierSummaries) || value.frontierSummaries.length === 0) {
		throw new Error(`${label}.frontierSummaries must be a non-empty array`)
	}
	const summaries = value.frontierSummaries.map((summary, index) =>
		validateFrontierSummary(summary, `${label}.frontierSummaries[${index}]`))
	if (new Set(summaries.map((summary) => summary.semanticKey)).size !== summaries.length) {
		throw new Error(`${label}.frontierSummaries contains duplicate semantic keys`)
	}
	const selectedSummary = summaries.find((summary) => summary.semanticKey === selected.semanticKey)
	if (!selectedSummary) throw new Error(`${label}.selected is absent from frontierSummaries`)
	if (!vectorsEqual(selectedObjective, selectedSummary.objectiveVector) ||
		!vectorsEqual(selectedRegret, selectedSummary.regret) ||
		!vectorsEqual(selectedLexicographicRegret, selectedSummary.lexicographicRegret)) {
		throw new Error(`${label}.selected vectors differ from its frontier summary`)
	}
	const components = selected.objectiveComponents as ParetoPaletteCertificate["selected"]["objectiveComponents"]
	const componentVector = [
		components.background.value,
		components.foreground.value,
		components.surface.value,
		components.accent.value,
		components.salientIdentityCoverage.value,
	]
	if (!vectorsEqual(selectedObjective, componentVector) || components.surface.model !== selectedSummary.surfaceModel) {
		throw new Error(`${label}.selected objective components differ from its objective vector or surface model`)
	}
	const counts = value.counts as Record<string, number>
	if (counts.frontier !== summaries.length || counts.feasible !== counts.frontier + counts.dominated ||
		counts.attempted < counts.feasible) {
		throw new Error(`${label}.counts are internally inconsistent`)
	}
	for (const first of summaries) {
		for (const second of summaries) {
			if (first === second) continue
			const dominates = first.objectiveVector.every((component, index) => component + 1e-12 >= second.objectiveVector[index]) &&
				first.objectiveVector.some((component, index) => component > second.objectiveVector[index] + 1e-12)
			if (dominates) throw new Error(`${label}.frontierSummaries contains a dominated selection`)
		}
	}
	const ideals = paretoObjectiveOrder.map((_, index) =>
		Math.max(...summaries.map((summary) => summary.objectiveVector[index])))
	for (const summary of summaries) {
		const expectedRegret = summary.objectiveVector.map((component, index) => ideals[index] - component)
		if (!summary.regret.every((component, index) => approximatelyEqual(component, expectedRegret[index]))) {
			throw new Error(`${label}.frontierSummaries contains invalid regret arithmetic`)
		}
	}
	const compareSelection = (first: ParsedFrontierSummary, second: ParsedFrontierSummary): number => {
		for (let index = 0; index < first.lexicographicRegret.length; index++) {
			if (approximatelyEqual(first.lexicographicRegret[index], second.lexicographicRegret[index])) continue
			return first.lexicographicRegret[index] < second.lexicographicRegret[index] ? -1 : 1
		}
		return first.semanticKey < second.semanticKey ? -1 : first.semanticKey > second.semanticKey ? 1 : 0
	}
	if ([...summaries].sort(compareSelection)[0].semanticKey !== selected.semanticKey) {
		throw new Error(`${label}.selected does not satisfy the declared minimax-regret selection rule`)
	}
	if (value.selectionRule !== "lexicographic-minimax-regret-then-semantic-key") {
		throw new Error(`${label}.selectionRule is invalid`)
	}
	if (!isRecord(value.gradientHandling)) throw new Error(`${label}.gradientHandling must be an object`)
	exactKeys(value.gradientHandling, ["kind", "description", "limitation"], `${label}.gradientHandling`)
	if (value.gradientHandling.kind !== "local-current-pixel-evidence" ||
		typeof value.gradientHandling.description !== "string" || value.gradientHandling.description.length === 0 ||
		typeof value.gradientHandling.limitation !== "string" || value.gradientHandling.limitation.length === 0) {
		throw new Error(`${label}.gradientHandling is invalid`)
	}
	return { certificate: value as unknown as ParetoPaletteCertificate, selectedSummary }
}

function parseCertificateArtifact(
	value: unknown,
	cohort: "development" | "holdout",
	expectedCorpus: CorpusResult,
	sourceHashes: Record<string, string>,
	expectedGeneratedAt: string,
): ParetoCertificateArtifact {
	const label = `${cohort} certificate artifact`
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	exactKeys(value, ["generatedAt", "experimentVersion", "baselineAlgorithmVersion", "cohort", "entries"], label)
	if (!validTimestamp(value.generatedAt) || value.generatedAt !== expectedGeneratedAt ||
		value.experimentVersion !== expectedCorpus.algorithmVersion || value.experimentVersion !== PARETO_EXPERIMENT_VERSION ||
		value.baselineAlgorithmVersion !== PARETO_BASELINE_VERSION || value.cohort !== cohort || !Array.isArray(value.entries)) {
		throw new Error(`${label} header or timestamp does not match its result artifact`)
	}
	if (value.entries.length !== expectedCorpus.entries.length) throw new Error(`${label} coverage is invalid`)
	const expectedByFile = new Map(expectedCorpus.entries.map((entry) => [entry.file, entry]))
	const seen = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		const entryLabel = `${label}.entries[${index}]`
		if (!isRecord(entryValue)) throw new Error(`${entryLabel} must be an object`)
		exactKeys(entryValue, ["file", "kind", "review", "width", "height", "sourceSha256", "certificate"], entryLabel)
		if (typeof entryValue.file !== "string" || seen.has(entryValue.file)) throw new Error(`${label} contains invalid duplicate coverage`)
		seen.add(entryValue.file)
		const expected = expectedByFile.get(entryValue.file)
		if (!expected || entryValue.kind !== expected.kind || entryValue.review !== expected.review ||
			entryValue.width !== expected.width || entryValue.height !== expected.height) {
			throw new Error(`${label} metadata differs for ${entryValue.file}`)
		}
		assertSha256(entryValue.sourceSha256, `${entryLabel}.sourceSha256`)
		if (entryValue.sourceSha256 !== sourceHashes[entryValue.file]) throw new Error(`${label} source hash differs for ${entryValue.file}`)
		const parsed = parseParetoPaletteCertificate(entryValue.certificate, `${entryLabel}.certificate`)
		const palette = expected.extraction.methods.spatial
		for (const role of roleNames) {
			if (!hexPattern.test(palette[role].hex.toLowerCase())) throw new Error(`${entryLabel} result ${role} hex is invalid`)
			const expectedRole = `${palette[role].hex.toLowerCase()}${palette[role].generated ? "!" : ""}`
			if (parsed.selectedSummary.roles[role] !== expectedRole) {
				throw new Error(`${entryLabel} selected ${role} differs from the corresponding result palette`)
			}
		}
		const selectedModel = parsed.selectedSummary.surfaceModel
		if ((selectedModel === "gradient") !== palette.gradient.isGradient ||
			(selectedModel === "collapsed") !== (palette.background.hex === palette.surface.hex &&
				palette.background.generated === palette.surface.generated)) {
			throw new Error(`${entryLabel} selected surface model differs from the corresponding result palette`)
		}
		const gates = parsed.certificate.selected.gates
		const expectedGateValues = {
			foregroundBackground: contrastRatio(palette.background.rgb, palette.foreground.rgb),
			foregroundSurface: contrastRatio(palette.surface.rgb, palette.foreground.rgb),
			accentBackground: contrastRatio(palette.background.rgb, palette.accent.rgb),
			accentBackgroundDistance: okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.background.rgb)),
			accentSurfaceDistance: okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.surface.rgb)),
		}
		if (!approximatelyEqual(gates.foregroundBackground.actual, expectedGateValues.foregroundBackground) ||
			!approximatelyEqual(gates.foregroundSurface.actual, expectedGateValues.foregroundSurface) ||
			!approximatelyEqual(gates.accentBackground.actual, expectedGateValues.accentBackground) ||
			!approximatelyEqual(gates.accentBackgroundDistance, expectedGateValues.accentBackgroundDistance) ||
			!approximatelyEqual(gates.accentSurfaceDistance, expectedGateValues.accentSurfaceDistance)) {
			throw new Error(`${entryLabel} selected gate evidence differs from the corresponding result palette`)
		}
		const collapsedAccent = palette.accent.hex === palette.foreground.hex &&
			palette.accent.generated === palette.foreground.generated
		if (gates.accentBackgroundDistance + 1e-12 < (collapsedAccent ? 0.025 : minimumParetoAccentBackgroundDistance) ||
			gates.accentSurfaceDistance + 1e-12 < (collapsedAccent ? 0.025 : minimumParetoAccentSurfaceDistance)) {
			throw new Error(`${entryLabel} selected accent distances do not satisfy the solver gates`)
		}
		if (parsed.certificate.selected.gates.generatedFallbackNecessary !== palette.foreground.generated) {
			throw new Error(`${entryLabel} generated foreground evidence differs from the corresponding result palette`)
		}
	}
	return value as unknown as ParetoCertificateArtifact
}

function assertFrozenBaselineControls(candidate: CorpusResult, baseline: CorpusResult, label: string): void {
	const baselineByFile = new Map(baseline.entries.map((entry) => [entry.file, entry]))
	for (const entry of candidate.entries) {
		const control = baselineByFile.get(entry.file)
		if (!control) throw new Error(`${label} has no baseline control for ${entry.file}`)
		for (const method of ["expressive", "quantized"] as const) {
			if (!isDeepStrictEqual(entry.extraction.methods[method], control.extraction.methods[method])) {
				throw new Error(`${label} ${entry.file} changed the frozen ${method} control`)
			}
		}
		if (!isDeepStrictEqual(entry.extraction.candidates, control.extraction.candidates)) {
			throw new Error(`${label} ${entry.file} changed the frozen candidate shortlist`)
		}
		if (entry.extraction.diagnostics.regionCount !== control.extraction.diagnostics.regionCount ||
			entry.extraction.diagnostics.candidateCount !== control.extraction.diagnostics.candidateCount) {
			throw new Error(`${label} ${entry.file} changed frozen structural diagnostics`)
		}
	}
}

async function assertRealExperimentDirectory(directory: string, researchRoot: string): Promise<void> {
	const { experimentsRoot, realExperimentsRoot } = await requirePhysicalExperimentsRoot(researchRoot)
	const resolvedDirectory = resolve(directory)
	if (dirname(resolvedDirectory) !== experimentsRoot) {
		throw new Error(`Experiment directory must be exactly one direct child under ${experimentsRoot}`)
	}
	const metadata = await lstat(resolvedDirectory)
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Experiment path must be a non-symlink directory: ${resolvedDirectory}`)
	}
	const realDirectory = await realpath(resolvedDirectory)
	if (dirname(realDirectory) !== realExperimentsRoot) {
		throw new Error(`Experiment directory is not a physical child of ${realExperimentsRoot}`)
	}
}

async function assertExactBundleEntries(directory: string): Promise<void> {
	const entries = await readdir(directory, { withFileTypes: true })
	const names = entries.map((entry) => entry.name)
	const expected = new Set<string>(bundleNames)
	const missing = bundleNames.filter((name) => !names.includes(name))
	const unexpected = names.filter((name) => !expected.has(name))
	if (missing.length > 0 || unexpected.length > 0) {
		throw new Error(`Experiment bundle entries are invalid; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`)
	}
	for (const entry of entries) {
		if (!entry.isFile()) throw new Error(`Bundle entry must be a regular non-symlink file: ${join(directory, entry.name)}`)
	}
}

export async function validateParetoExperimentDirectory(
	directory: string,
	options: ValidationOptions,
): Promise<ParetoExperimentValidation> {
	await assertRealExperimentDirectory(directory, options.researchRoot)
	await assertExactBundleEntries(directory)
	const manifestInput = await readRegularJson(join(directory, "manifest.json"))
	const manifest = parseManifest(manifestInput.value)

	const developmentBaselineInput = await readJson(join(options.researchRoot, manifest.baseline.development.file))
	const holdoutBaselineInput = await readJson(join(options.researchRoot, manifest.baseline.holdout.file))
	const developmentBaseline = requireCorpus(developmentBaselineInput.value, "Development baseline", 37)
	const holdoutBaseline = requireCorpus(holdoutBaselineInput.value, "Holdout baseline", 355)
	if (sha256(developmentBaselineInput.bytes) !== manifest.baseline.development.rawSha256 ||
		computeSemanticResultsSha256(developmentBaseline) !== manifest.baseline.development.semanticSha256) {
		throw new Error("Development baseline hashes do not match the manifest")
	}
	if (sha256(holdoutBaselineInput.bytes) !== manifest.baseline.holdout.rawSha256 ||
		computeSemanticResultsSha256(holdoutBaseline) !== manifest.baseline.holdout.semanticSha256) {
		throw new Error("Holdout baseline hashes do not match the manifest")
	}

	const artifactInputs = Object.fromEntries(await Promise.all(paretoArtifactNames.map(async (name) => [
		name,
		await readRegularJson(join(directory, name)),
	]))) as Record<ParetoArtifactName, { bytes: Uint8Array; value: unknown }>
	await assertExactBundleEntries(directory)
	const artifactHashes = parseHashMap(manifest.artifactHashes, paretoArtifactNames, "Experiment artifact hashes")
	for (const name of paretoArtifactNames) {
		if (sha256(artifactInputs[name].bytes) !== artifactHashes[name]) throw new Error(`Artifact hash mismatch for ${name}`)
	}

	const development = artifactInputs["results.json"].value
	const holdout = artifactInputs["holdout-results.json"].value
	const candidateSummary = validateCandidateArtifacts(development, holdout, developmentBaseline, holdoutBaseline)
	if (candidateSummary.algorithmVersion !== PARETO_EXPERIMENT_VERSION) throw new Error("Candidate artifact version is not the Pareto experiment version")
	const developmentCorpus = development as CorpusResult
	const holdoutCorpus = holdout as CorpusResult
	assertFrozenBaselineControls(developmentCorpus, developmentBaseline, "Development experiment")
	assertFrozenBaselineControls(holdoutCorpus, holdoutBaseline, "Holdout experiment")
	if (developmentCorpus.generatedAt !== manifest.startedAt || holdoutCorpus.generatedAt !== manifest.startedAt) {
		throw new Error("Result artifact timestamps do not match the experiment manifest startedAt")
	}

	const expectedSourceFiles = [...developmentCorpus.entries, ...holdoutCorpus.entries].map((entry) => entry.file).sort()
	const sourceHashes = parseHashMap(manifest.sourceHashes, expectedSourceFiles, "Experiment source hashes")
	await Promise.all(expectedSourceFiles.map(async (file) => {
		if (sha256(await readFile(sourcePath(options.projectRoot, file))) !== sourceHashes[file]) {
			throw new Error(`Source hash mismatch for ${file}`)
		}
	}))

	const developmentCertificates = parseCertificateArtifact(
		artifactInputs["pareto-certificates.json"].value, "development", developmentCorpus, sourceHashes, manifest.startedAt,
	)
	const holdoutCertificates = parseCertificateArtifact(
		artifactInputs["holdout-pareto-certificates.json"].value, "holdout", holdoutCorpus, sourceHashes, manifest.startedAt,
	)
	const artifactSemanticHashes = parseHashMap(
		manifest.artifactSemanticHashes,
		paretoArtifactNames,
		"Experiment semantic artifact hashes",
	)
	const computedSemanticHashes: Record<ParetoArtifactName, string> = {
		"results.json": computeSemanticResultsSha256(developmentCorpus),
		"holdout-results.json": computeSemanticResultsSha256(holdoutCorpus),
		"pareto-certificates.json": computeParetoCertificateSemanticSha256(developmentCertificates),
		"holdout-pareto-certificates.json": computeParetoCertificateSemanticSha256(holdoutCertificates),
	}
	for (const name of paretoArtifactNames) {
		if (computedSemanticHashes[name] !== artifactSemanticHashes[name]) {
			throw new Error(`Semantic artifact hash mismatch for ${name}`)
		}
	}

	const implementationFiles = options.implementationFiles ?? paretoImplementationFiles
	const implementationHashes = parseHashMap(manifest.implementationHashes, implementationFiles, "Experiment implementation hashes")
	await Promise.all(implementationFiles.map(async (file) => {
		if (sha256(await readFile(join(options.researchRoot, file))) !== implementationHashes[file]) {
			throw new Error(`Implementation hash mismatch for ${file}`)
		}
	}))

	return {
		experimentVersion: candidateSummary.algorithmVersion,
		developmentEntries: candidateSummary.development.entries,
		holdoutEntries: candidateSummary.holdout.entries,
		developmentCertificates: developmentCorpus.entries.length,
		holdoutCertificates: holdoutCorpus.entries.length,
	}
}
