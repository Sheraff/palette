import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import {
	createSourceFile,
	isExportDeclaration,
	isImportDeclaration,
	isStringLiteralLike,
	ScriptKind,
	ScriptTarget,
} from "typescript"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	phase4ReviewManifestId,
	type Phase4ReviewPalette,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS,
	futureSampleSha256,
	verifyAlbumArtworkPaletteV2FutureSample,
	type FutureSampleBuildInput,
} from "./src/album-artwork-palette-v2-future-sample.ts"
import { ALBUM_ARTWORK_PALETTE_V2_VERSION } from "./src/album-artwork-palette-v2-protocol.ts"
import { parseSourceProvenanceInventory } from "./src/source-provenance-inventory.ts"

const EXPERIMENT_VERSION = "album-artwork-palette-v2-0.5.2-phase-4-future-02"
const EXPECTED_CANDIDATE_VERSION = "album-artwork-first-principles-0.5.2"
const EXPECTED_CANDIDATE_HASH = "ea1205ebd2d33abf99d8eed8a0e5e7625f1af6722dbe7879c90350c23d36fd40"
const EXPECTED_FREEZE_ID = "8a401a451b1c824c70ad1f0394870719b6786f092e27a19eda8a4b626fa7b01b"
const EXPECTED_FREEZE_RAW_SHA256 = "782b90d43e001eb04ee7bde89f67095c15e5fa0be346f7db39559d82b5ae7f75"
const EXPECTED_BASELINE_VERSION = "region-graph-0.19.0"
const EXPECTED_FUTURE_MANIFEST_ID = "9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671"
const EXPECTED_FUTURE_SEAL = "9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846"
const EXPECTED_FUTURE_RAW_SHA256 = "2224603f5a4801cedf9f96375e86f2dd5624ed6895ab941fbcad5c6d8646fc8c"
const SIDE_ASSIGNMENT_DOMAIN = "album-artwork-palette-v2-phase-4-side-assignment-v1"
const CANDIDATE_WORKERS = 6

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	selectionKey: string
	familyCommitment: string
}>

type ImplementationClosure = Readonly<{
	version: "album-artwork-palette-v2-phase-4-static-import-closure-v1"
	roots: readonly string[]
	files: ReadonlyArray<Readonly<{ path: string; rawSha256: string }>>
	sha256: string
}>

type SourceArtifact = Readonly<{
	schemaVersion: 1
	method: "candidate" | "baseline"
	protocolId: string
	candidateVersion?: string
	frozenImplementationHash?: string
	candidateFreezeId?: string
	candidateClosureSha256?: string
	baselineVersion?: string
	baselineClosureSha256?: string
	futureSampleManifestId: string
	futureSampleSealCommitment: string
	source: SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: unknown
	presentation: unknown
	presentationSha256: string
	scientificSha256: string
	runtime: Readonly<{ wallMs: number; cpuUserMicros: number; cpuSystemMicros: number }>
}>

type ValidatedArtifact = Readonly<{
	artifact: SourceArtifact
	relativePath: string
	rawSha256: string
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const experimentRelativeDirectory = `research/data/experiments/${EXPERIMENT_VERSION}`
const experimentDirectory = resolve(projectRoot, experimentRelativeDirectory)
const experimentsDirectory = dirname(experimentDirectory)
const protocolPath = join(experimentDirectory, "protocol.json")
const candidateDirectory = join(experimentDirectory, "candidate")
const baselineDirectory = join(experimentDirectory, "baseline")
const futureRelativePath = ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.sealedSample
const freezeRelativePath = "research/data/experiments/album-artwork-palette-v2-0.5.2-development/candidate-freeze.json"
const candidateChildRelativePath = "research/album-artwork-palette-v2-0.5.2-phase-4-candidate-child.ts"
const baselineChildRelativePath = "research/album-artwork-palette-v2-0.5.2-phase-4-baseline-child.ts"
const runnerRelativePath = "research/run-album-artwork-palette-v2-0.5.2-phase-4.ts"
const executionProtocolRelativePath = "research/ALBUM_ARTWORK_UI_PALETTE_PHASE_4_FUTURE_02_PROTOCOL.md"
const candidateChildPath = resolve(projectRoot, candidateChildRelativePath)
const baselineChildPath = resolve(projectRoot, baselineChildRelativePath)

let outputDirectoryCreated = false
let activeProtocolId: string | null = null
let futureSampleAccessStarted = false

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function projectPath(relativePath: string): string {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const rel = relative(projectRoot, path)
	if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Path escapes project: ${relativePath}`)
	return path
}

async function requirePhysicalFile(relativePath: string): Promise<Buffer> {
	const path = projectPath(relativePath)
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Control input must be a physical file: ${relativePath}`)
	}
	return readFile(path)
}

async function requireMissing(path: string): Promise<void> {
	try {
		await lstat(path)
		throw new Error(`One-way output namespace already exists: ${relative(projectRoot, path)}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

async function syncDirectory(path: string): Promise<void> {
	const handle = await open(path, constants.O_RDONLY)
	try {
		await handle.sync()
	} finally {
		await handle.close()
	}
}

async function writeExclusiveDurableJson(path: string, value: unknown): Promise<void> {
	const temporary = join(dirname(path), `.${relative(dirname(path), path)}.${process.pid}.${randomUUID()}.tmp`)
	const handle = await open(temporary, "wx", 0o600)
	try {
		await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
		await handle.sync()
	} finally {
		await handle.close()
	}
	try {
		await link(temporary, path)
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined)
	}
	await syncDirectory(dirname(path))
}

async function metadataInput(relativePath: string): Promise<{ value: unknown; rawSha256: string }> {
	const bytes = await requirePhysicalFile(relativePath)
	return { value: JSON.parse(bytes.toString("utf8")) as unknown, rawSha256: sha256(bytes) }
}

async function verifiedFutureSample() {
	const [inventory, development, openedFresh, openedProtocol, protocolDocument, sealed] = await Promise.all([
		metadataInput(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory),
		metadataInput(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.developmentPanel),
		metadataInput(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal),
		metadataInput(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedPhase4Protocol),
		requirePhysicalFile(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.protocolDocument),
		metadataInput(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.sealedSample),
	])
	if (sealed.rawSha256 !== EXPECTED_FUTURE_RAW_SHA256) throw new Error("Future sample raw hash changed")
	const input: FutureSampleBuildInput = {
		inventory: parseSourceProvenanceInventory(inventory.value),
		inventoryRawSha256: inventory.rawSha256,
		protocolDocumentRawSha256: futureSampleSha256(protocolDocument),
		developmentPanel: development,
		openedFreshSeal: openedFresh,
		openedPhase4Protocol: openedProtocol,
	}
	const sample = verifyAlbumArtworkPaletteV2FutureSample(sealed.value, input)
	if (sample.manifestId !== EXPECTED_FUTURE_MANIFEST_ID || sample.sealCommitment !== EXPECTED_FUTURE_SEAL ||
		sample.families.length !== 12) throw new Error("Future sample identity changed")
	return { sample, rawSha256: sealed.rawSha256 }
}

function sourcesFromSample(sample: Awaited<ReturnType<typeof verifiedFutureSample>>["sample"]): SourceRecord[] {
	const sources = sample.families.map((family) => {
		const preferred = family.variants.filter(({ path }) => path === family.preferredSourcePath)
		if (preferred.length !== 1) throw new Error(`Preferred source is ambiguous for ${family.caseId}`)
		return {
			caseId: family.caseId,
			path: preferred[0].path,
			sha256: preferred[0].sha256,
			byteCount: preferred[0].byteCount,
			artworkId: family.artworkId,
			selectionKey: family.selectionKey,
			familyCommitment: family.familyCommitment,
		}
	})
	for (const key of ["caseId", "path", "sha256", "artworkId"] as const) {
		if (new Set(sources.map((source) => source[key])).size !== sources.length) throw new Error(`Future sources duplicate ${key}`)
	}
	if (sources.some(({ path }) => !/^10\/[A-Za-z0-9._-]+$/.test(path))) throw new Error("Future source is not a direct root-10 child")
	return sources
}

async function validateCandidateFreeze(raw: Buffer): Promise<Record<string, unknown>> {
	if (sha256(raw) !== EXPECTED_FREEZE_RAW_SHA256) throw new Error("Candidate freeze raw hash changed")
	const freeze = JSON.parse(raw.toString("utf8")) as unknown
	if (!isRecord(freeze) || freeze.schemaVersion !== 1 || freeze.candidateVersion !== EXPECTED_CANDIDATE_VERSION ||
		freeze.implementationHash !== EXPECTED_CANDIDATE_HASH || freeze.freezeId !== EXPECTED_FREEZE_ID ||
		!isRecord(freeze.runtime) || freeze.runtime.node !== process.version || freeze.runtime.platform !== process.platform ||
		freeze.runtime.architecture !== process.arch || !Array.isArray(freeze.implementationFiles) ||
		!isRecord(freeze.gates) || freeze.gates.mechanism !== true || freeze.gates.exactDevelopmentReviewTransfer !== true ||
		!isRecord(freeze.futureSample) || freeze.futureSample.manifestId !== EXPECTED_FUTURE_MANIFEST_ID ||
		freeze.futureSample.sealCommitment !== EXPECTED_FUTURE_SEAL || freeze.futureSample.opened !== false ||
		!isRecord(freeze.authorization) || freeze.authorization.futureSample02OneWayExecutionEligible !== true ||
		freeze.authorization.phase5 !== false || freeze.authorization.promotion !== false ||
		freeze.authorization.persistence !== false || freeze.authorization.fullRoster !== false) {
		throw new Error("Candidate freeze does not authorize future sample 02")
	}
	const { freezeId: _freezeId, ...identity } = freeze
	if (sha256(canonicalJson(identity)) !== EXPECTED_FREEZE_ID) throw new Error("Candidate freeze identity is stale")
	const implementationHash = createHash("sha256")
	implementationHash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const [index, item] of freeze.implementationFiles.entries()) {
		if (!isRecord(item) || typeof item.path !== "string" || typeof item.sha256 !== "string" ||
			!Number.isSafeInteger(item.byteCount)) throw new Error(`Candidate implementation file ${index} is invalid`)
		const path = projectPath(item.path)
		const bytes = await requirePhysicalFile(item.path)
		if (bytes.byteLength !== item.byteCount || sha256(bytes) !== item.sha256) {
			throw new Error(`Frozen candidate file changed: ${item.path}`)
		}
		implementationHash.update(path.slice(moduleDirectory.length))
		implementationHash.update("\0")
		implementationHash.update(bytes)
		implementationHash.update("\0")
	}
	if (implementationHash.digest("hex") !== EXPECTED_CANDIDATE_HASH) throw new Error("Frozen candidate implementation hash changed")
	return freeze
}

async function buildImplementationClosure(roots: readonly string[]): Promise<ImplementationClosure> {
	const pending = [...roots]
	const files = new Map<string, string>()
	while (pending.length > 0) {
		const relativePath = pending.pop()!
		if (files.has(relativePath)) continue
		const source = await requirePhysicalFile(relativePath)
		files.set(relativePath, sha256(source))
		if (!relativePath.endsWith(".ts")) continue
		const syntax = createSourceFile(relativePath, source.toString("utf8"), ScriptTarget.ESNext, false, ScriptKind.TS)
		for (const statement of syntax.statements) {
			if ((!isImportDeclaration(statement) && !isExportDeclaration(statement)) || !statement.moduleSpecifier ||
				!isStringLiteralLike(statement.moduleSpecifier)) continue
			const specifier = statement.moduleSpecifier.text
			if (!specifier.startsWith(".")) continue
			const dependency = resolve(dirname(resolve(projectRoot, relativePath)), specifier)
			const dependencyRelative = relative(projectRoot, dependency).split(sep).join("/")
			if (dependencyRelative === ".." || dependencyRelative.startsWith("../")) {
				throw new Error(`Local implementation import escapes project: ${relativePath} -> ${specifier}`)
			}
			pending.push(dependencyRelative)
		}
	}
	const entries = [...files].map(([path, rawSha256]) => ({ path, rawSha256 }))
		.sort((first, second) => compareText(first.path, second.path))
	return {
		version: "album-artwork-palette-v2-phase-4-static-import-closure-v1",
		roots: [...roots],
		files: entries,
		sha256: sha256(canonicalJson(entries)),
	}
}

async function controlFileBindings(paths: readonly string[]) {
	return Promise.all([...paths].sort(compareText).map(async (path) => ({ path, rawSha256: sha256(await requirePhysicalFile(path)) })))
}

function sideAssignments(sources: readonly SourceRecord[]) {
	const keyed = sources.map((source) => ({
		source,
		key: sha256(`${SIDE_ASSIGNMENT_DOMAIN}\0${EXPECTED_FUTURE_SEAL}\0${source.sha256}`),
	})).sort((first, second) => compareText(first.key, second.key))
	if (new Set(keyed.map(({ key }) => key)).size !== keyed.length) throw new Error("Side-assignment key collision")
	return keyed.map(({ source, key }, index) => ({
		caseId: source.caseId,
		sourceSha256: source.sha256,
		key,
		candidateSide: index < 6 ? "A" as const : "B" as const,
		baselineSide: index < 6 ? "B" as const : "A" as const,
	}))
}

function runChild(childPath: string, source: SourceRecord, outputPath: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, protocolPath,
			projectPath(futureRelativePath), source.caseId, outputPath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
		child.on("error", reject)
		child.on("exit", (code, signal) => {
			if (stdout) process.stdout.write(stdout)
			if (code === 0 && signal === null) resolvePromise()
			else reject(new Error(`${source.caseId} child failed (exit=${String(code)}, signal=${String(signal)}): ${stderr.trim()}`))
		})
	})
}

async function runCandidateChildren(sources: readonly SourceRecord[]): Promise<void> {
	let nextIndex = 0
	let stopped = false
	const errors: Error[] = []
	const worker = async () => {
		while (!stopped) {
			const index = nextIndex++
			if (index >= sources.length) return
			const source = sources[index]
			try {
				await runChild(candidateChildPath, source, join(candidateDirectory, `${source.caseId}.json`))
			} catch (error) {
				stopped = true
				errors.push(error instanceof Error ? error : new Error(String(error)))
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(CANDIDATE_WORKERS, sources.length) }, worker))
	if (errors.length > 0) throw errors[0]
}

async function validateArtifactDirectory(
	directory: string,
	method: "candidate" | "baseline",
	protocolId: string,
	sources: readonly SourceRecord[],
	candidateClosure: string,
	baselineClosure: string,
): Promise<ValidatedArtifact[]> {
	const expectedNames = sources.map(({ caseId }) => `${caseId}.json`).sort(compareText)
	const actualNames = (await readdir(directory)).sort(compareText)
	if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) throw new Error(`${method} artifact set is incomplete`)
	return Promise.all(sources.map(async (source) => {
		const path = join(directory, `${source.caseId}.json`)
		const metadata = await lstat(path)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
			throw new Error(`${method} artifact is not a physical file for ${source.caseId}`)
		}
		const raw = await readFile(path)
		const artifact = JSON.parse(raw.toString("utf8")) as SourceArtifact
		if (artifact.schemaVersion !== 1 || artifact.method !== method || artifact.protocolId !== protocolId ||
			canonicalJson(artifact.source) !== canonicalJson(source) || artifact.futureSampleManifestId !== EXPECTED_FUTURE_MANIFEST_ID ||
			artifact.futureSampleSealCommitment !== EXPECTED_FUTURE_SEAL ||
			artifact.presentationSha256 !== sha256(canonicalJson(artifact.presentation)) ||
			!Number.isFinite(artifact.runtime.wallMs) || artifact.runtime.wallMs < 0 ||
			!Number.isSafeInteger(artifact.runtime.cpuUserMicros) || !Number.isSafeInteger(artifact.runtime.cpuSystemMicros)) {
			throw new Error(`${method} artifact validation failed for ${source.caseId}`)
		}
		if (method === "candidate") {
			if (artifact.candidateVersion !== EXPECTED_CANDIDATE_VERSION || artifact.frozenImplementationHash !== EXPECTED_CANDIDATE_HASH ||
				artifact.candidateFreezeId !== EXPECTED_FREEZE_ID || artifact.candidateClosureSha256 !== candidateClosure ||
				artifact.scientificSha256 !== sha256(canonicalJson(artifact.extraction))) {
				throw new Error(`Candidate identity failed for ${source.caseId}`)
			}
		} else {
			if (artifact.baselineVersion !== EXPECTED_BASELINE_VERSION || artifact.baselineClosureSha256 !== baselineClosure ||
				!isRecord(artifact.extraction) || !isRecord(artifact.extraction.methods)) {
				throw new Error(`Baseline identity failed for ${source.caseId}`)
			}
			const scientific = {
				version: artifact.extraction.version,
				width: artifact.extraction.width,
				height: artifact.extraction.height,
				spatial: artifact.extraction.methods.spatial,
			}
			if (artifact.scientificSha256 !== sha256(canonicalJson(scientific))) throw new Error(`Baseline scientific hash failed for ${source.caseId}`)
		}
		return { artifact, relativePath: relative(projectRoot, path).split(sep).join("/"), rawSha256: sha256(raw) }
	}))
}

function publicPalette(presentation: unknown): Phase4ReviewPalette {
	if (!isRecord(presentation) || !isRecord(presentation.roles) || !isRecord(presentation.collapse)) {
		throw new Error("Review presentation is invalid")
	}
	const roles = presentation.roles
	const colorFor = (role: "background" | "surface" | "foreground" | "accent") => {
		const color = roles[role]
		if (!isRecord(color) || !isRecord(color.colorName) || typeof color.hex !== "string" ||
			typeof color.generated !== "boolean" || typeof color.colorName.nearestName !== "string") {
			throw new Error(`Review presentation ${role} is invalid`)
		}
		return { hex: color.hex, nearestName: color.colorName.nearestName, generated: color.generated }
	}
	if (typeof presentation.gradient !== "boolean" || typeof presentation.collapse.surface !== "boolean" ||
		typeof presentation.collapse.accent !== "boolean") throw new Error("Review treatment is invalid")
	return {
		roles: {
			background: colorFor("background"),
			surface: colorFor("surface"),
			foreground: colorFor("foreground"),
			accent: colorFor("accent"),
		},
		gradient: presentation.gradient,
		collapse: { surface: presentation.collapse.surface, accent: presentation.collapse.accent },
	}
}

async function recordFailure(error: unknown): Promise<void> {
	if (!outputDirectoryCreated) return
	await writeExclusiveDurableJson(join(experimentDirectory, "failure.json"), {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocolId: activeProtocolId,
		failedAt: new Date().toISOString(),
		error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack ?? null } : { message: String(error) },
		futureSampleConsumed: futureSampleAccessStarted,
		automaticRetryAttempted: false,
		partialOutputPreserved: true,
	}).catch(() => undefined)
}

async function main(): Promise<void> {
	if (process.argv.length !== 2) throw new Error("Future Phase 4 runner accepts no arguments")
	if (ALBUM_ARTWORK_PALETTE_V2_VERSION !== EXPECTED_CANDIDATE_VERSION) throw new Error("Candidate source version is not frozen 0.5.2")
	if (await realpath(projectRoot) !== projectRoot) throw new Error("Project root must be physical")
	await requireMissing(experimentDirectory)

	// Everything before protocol publication is metadata and source-code custody only.
	const [future, freezeRaw, candidateClosure, baselineClosure] = await Promise.all([
		verifiedFutureSample(),
		requirePhysicalFile(freezeRelativePath),
		buildImplementationClosure([candidateChildRelativePath]),
		buildImplementationClosure([baselineChildRelativePath]),
	])
	const freeze = await validateCandidateFreeze(freezeRaw)
	const sources = sourcesFromSample(future.sample)
	const candidateFiles = new Set(candidateClosure.files.map(({ path }) => path))
	for (const prohibited of ["research/src/extract.ts", "research/src/image.ts", baselineChildRelativePath]) {
		if (candidateFiles.has(prohibited)) throw new Error(`Candidate closure imports baseline code: ${prohibited}`)
	}
	const baselineFiles = new Set(baselineClosure.files.map(({ path }) => path))
	if (!baselineFiles.has("research/src/extract.ts") || !baselineFiles.has("research/src/image.ts")) {
		throw new Error("Baseline closure lacks canonical entry points")
	}
	const controls = await controlFileBindings([
		runnerRelativePath,
		candidateChildRelativePath,
		baselineChildRelativePath,
		executionProtocolRelativePath,
		"research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md",
		"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_5_2.md",
		"research/ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_02_PROTOCOL.md",
		freezeRelativePath,
		"research/freeze-album-artwork-palette-v2-0.5.2.ts",
		futureRelativePath,
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory,
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.developmentPanel,
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal,
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedPhase4Protocol,
		"research/src/album-artwork-palette-v2-phase-4-review.ts",
		"research/serve-album-artwork-palette-v2-phase-4-review.ts",
		"research/analyze-album-artwork-palette-v2-0.5.2-phase-4-review.ts",
		"research/album-artwork-palette-v2-phase-4-review/index.html",
		"research/album-artwork-palette-v2-phase-4-review/app.js",
		"research/album-artwork-palette-v2-phase-4-review/styles.css",
		"research/tests/album-artwork-palette-v2-phase-4.test.ts",
		"research/tsconfig.json",
		"package.json",
		"pnpm-lock.yaml",
	])
	const assignments = sideAssignments(sources)
	if (assignments.filter(({ candidateSide }) => candidateSide === "A").length !== 6) throw new Error("Side assignment is unbalanced")
	const protocolIdentity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		createdAt: new Date().toISOString(),
		outputDirectory: experimentRelativeDirectory,
		candidateFreeze: {
			path: freezeRelativePath,
			rawSha256: sha256(freezeRaw),
			freezeId: EXPECTED_FREEZE_ID,
			implementationHash: EXPECTED_CANDIDATE_HASH,
			scientificSha256: freeze.scientificSha256,
			futureSample02OneWayExecutionEligible: true,
		},
		candidate: {
			version: EXPECTED_CANDIDATE_VERSION,
			frozenImplementationHash: EXPECTED_CANDIDATE_HASH,
			freezeId: EXPECTED_FREEZE_ID,
			closure: candidateClosure,
		},
		baseline: {
			version: EXPECTED_BASELINE_VERSION,
			entryPoints: ["research/src/image.ts#loadImage(bytes)", "research/src/extract.ts#extractPalette(image).methods.spatial"],
			scientificPayload: "version-width-height-complete-spatial-result; processingMs-excluded",
			closure: baselineClosure,
		},
		futureSample: {
			path: futureRelativePath,
			rawSha256: future.rawSha256,
			manifestId: future.sample.manifestId,
			sealCommitment: future.sample.sealCommitment,
			root: "10",
			familyCount: future.sample.families.length,
			preferredSourcePolicy: "unique-variant-matching-preferredSourcePath",
			inventory: future.sample.inventory,
			effectiveExclusionCommitment: future.sample.selection.effectiveExclusionCommitment,
			sources,
		},
		sourceCustody: {
			pathRule: "direct-root-10-child-only",
			checksBeforeDecode: ["bound-path", "realpath", "regular-file", "non-symlink", "device-inode-size", "byte-count", "sha256"],
			candidateAndBaselineReadSeparately: true,
			alternateVariantsOpened: false,
			preservedRootsOpened: false,
		},
		sideAssignment: {
			domain: SIDE_ASSIGNMENT_DOMAIN,
			digest: "SHA256(domain || NUL || future seal commitment || NUL || preferred-source SHA-256)",
			rule: "candidate-is-A-for-first-six-and-B-for-last-six",
			assignments,
			assignmentSha256: sha256(canonicalJson(assignments)),
		},
		presentation: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
			roles: ["background", "surface", "foreground", "accent"],
			colorNames: "colornames-oklab-0.6.0-presentation-only",
		},
		execution: {
			arguments: [],
			candidateWorkers: CANDIDATE_WORKERS,
			candidateFirst: true as const,
			baselineStartsAfterDurableCandidateCompleteMarker: true as const,
			baselineMode: "sequential-separate-children-stop-on-first-error",
			force: false,
			overwrite: false as const,
			reuse: false as const,
			automaticRetry: false as const,
		},
		runtime: { node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, execPath: process.execPath },
		controls: { method: "raw-sha256", files: controls, sha256: sha256(canonicalJson(controls)) },
	}
	const protocol = { ...protocolIdentity, protocolId: sha256(canonicalJson(protocolIdentity)) }

	await mkdir(experimentDirectory, { recursive: false, mode: 0o700 })
	outputDirectoryCreated = true
	await syncDirectory(experimentsDirectory)
	await writeExclusiveDurableJson(protocolPath, protocol)
	activeProtocolId = protocol.protocolId
	await mkdir(candidateDirectory, { recursive: false, mode: 0o700 })
	await mkdir(baselineDirectory, { recursive: false, mode: 0o700 })
	await syncDirectory(experimentDirectory)

	const runWallStart = performance.now()
	const candidateWallStart = performance.now()
	futureSampleAccessStarted = true
	await runCandidateChildren(sources)
	const candidateWallMs = performance.now() - candidateWallStart
	const candidateArtifacts = await validateArtifactDirectory(candidateDirectory, "candidate", protocol.protocolId, sources,
		candidateClosure.sha256, baselineClosure.sha256)
	const candidateComplete = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocolId: protocol.protocolId,
		completedAt: new Date().toISOString(),
		sourceCount: candidateArtifacts.length,
		workerCount: CANDIDATE_WORKERS,
		wallMs: candidateWallMs,
		artifacts: candidateArtifacts.map(({ artifact, relativePath, rawSha256 }) => ({
			caseId: artifact.source.caseId,
			path: relativePath,
			rawSha256,
			presentationSha256: artifact.presentationSha256,
			scientificSha256: artifact.scientificSha256,
		})),
	}
	const candidateCompletePath = join(experimentDirectory, "candidate-complete.json")
	await writeExclusiveDurableJson(candidateCompletePath, candidateComplete)

	const baselineWallStart = performance.now()
	for (const source of sources) await runChild(baselineChildPath, source, join(baselineDirectory, `${source.caseId}.json`))
	const baselineWallMs = performance.now() - baselineWallStart
	const baselineArtifacts = await validateArtifactDirectory(baselineDirectory, "baseline", protocol.protocolId, sources,
		candidateClosure.sha256, baselineClosure.sha256)
	const candidateArtifactsAfterBaseline = await validateArtifactDirectory(candidateDirectory, "candidate", protocol.protocolId, sources,
		candidateClosure.sha256, baselineClosure.sha256)
	if (canonicalJson(candidateArtifactsAfterBaseline.map(({ rawSha256 }) => rawSha256)) !==
		canonicalJson(candidateArtifacts.map(({ rawSha256 }) => rawSha256))) {
		throw new Error("Candidate artifacts changed during baseline execution")
	}
	const candidateByCase = new Map(candidateArtifacts.map((entry) => [entry.artifact.source.caseId, entry]))
	const baselineByCase = new Map(baselineArtifacts.map((entry) => [entry.artifact.source.caseId, entry]))
	const sourceByCase = new Map(sources.map((source) => [source.caseId, source]))
	const reviewCases = assignments.map((assignment, index) => {
		const source = sourceByCase.get(assignment.caseId)!
		const candidate = candidateByCase.get(assignment.caseId)!
		const baseline = baselineByCase.get(assignment.caseId)!
		return {
			reviewCaseId: `future02-${String(index + 1).padStart(2, "0")}-${assignment.key.slice(0, 12)}`,
			publicSafe: { options: assignment.candidateSide === "A"
				? { A: candidate.artifact.presentation, B: baseline.artifact.presentation }
				: { A: baseline.artifact.presentation, B: candidate.artifact.presentation } },
			private: {
				futureCaseId: source.caseId,
				source,
				assignmentKey: assignment.key,
				candidateSide: assignment.candidateSide,
				baselineSide: assignment.baselineSide,
				candidate: { artifactPath: candidate.relativePath, artifactSha256: candidate.rawSha256,
					presentationSha256: candidate.artifact.presentationSha256, scientificSha256: candidate.artifact.scientificSha256,
					runtime: candidate.artifact.runtime },
				baseline: { artifactPath: baseline.relativePath, artifactSha256: baseline.rawSha256,
					presentationSha256: baseline.artifact.presentationSha256, scientificSha256: baseline.artifact.scientificSha256,
					runtime: baseline.artifact.runtime },
			},
		}
	})
	const protocolRaw = await readFile(protocolPath)
	const candidateCompleteRaw = await readFile(candidateCompletePath)
	const provenanceIdentity = {
		schemaVersion: 1,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION,
		generatedAt: new Date().toISOString(),
		protocolId: protocol.protocolId,
		futureSampleManifestId: future.sample.manifestId,
		futureSampleSealCommitment: future.sample.sealCommitment,
		caseCount: reviewCases.length,
		publicOptionPolicy: "method-identities-omitted-from-publicSafe-options",
		hashes: {
			protocolSha256: sha256(protocolRaw),
			candidateCompleteSha256: sha256(candidateCompleteRaw),
			candidateArtifactsSha256: sha256(canonicalJson(candidateArtifacts.map(({ rawSha256 }) => rawSha256))),
			baselineArtifactsSha256: sha256(canonicalJson(baselineArtifacts.map(({ rawSha256 }) => rawSha256))),
		},
		runtime: {
			candidate: { workerCount: CANDIDATE_WORKERS, wallMs: candidateWallMs,
				totalChildWallMs: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.wallMs, 0),
				totalCpuUserMicros: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuUserMicros, 0),
				totalCpuSystemMicros: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuSystemMicros, 0) },
			baseline: { mode: "sequential-stop-on-first-error", wallMs: baselineWallMs,
				totalChildWallMs: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.wallMs, 0),
				totalCpuUserMicros: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuUserMicros, 0),
				totalCpuSystemMicros: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuSystemMicros, 0) },
			totalWallMs: performance.now() - runWallStart,
		},
		cases: reviewCases,
	}
	const provenance = { ...provenanceIdentity, manifestId: sha256(canonicalJson(provenanceIdentity)) }
	const provenancePath = join(experimentDirectory, "review-provenance.private.json")
	await writeExclusiveDurableJson(provenancePath, provenance)
	const reviewIdentity = {
		schemaVersion: 1 as const,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION,
		presentationVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
		cases: reviewCases.map((reviewCase, order) => ({
			caseId: reviewCase.reviewCaseId,
			order,
			source: { file: reviewCase.private.source.path, sha256: reviewCase.private.source.sha256,
				bytes: reviewCase.private.source.byteCount },
			options: { A: publicPalette(reviewCase.publicSafe.options.A), B: publicPalette(reviewCase.publicSafe.options.B) },
			assignment: reviewCase.private.candidateSide === "A"
				? { A: "candidate" as const, B: "baseline" as const }
				: { A: "baseline" as const, B: "candidate" as const },
		})),
	}
	const reviewManifest = { ...reviewIdentity, manifestId: phase4ReviewManifestId(reviewIdentity) }
	const reviewPath = join(experimentDirectory, "review-manifest.private.json")
	await writeExclusiveDurableJson(reviewPath, reviewManifest)
	const [reviewRaw, provenanceRaw] = await Promise.all([readFile(reviewPath), readFile(provenancePath)])
	await writeExclusiveDurableJson(join(experimentDirectory, "run-complete.json"), {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocolId: protocol.protocolId,
		completedAt: new Date().toISOString(),
		futureSampleConsumed: true,
		sourceCount: sources.length,
		candidateCount: candidateArtifacts.length,
		baselineCount: baselineArtifacts.length,
		privateReviewManifestId: reviewManifest.manifestId,
		privateReviewManifestSha256: sha256(reviewRaw),
		reviewProvenanceId: provenance.manifestId,
		reviewProvenanceSha256: sha256(provenanceRaw),
	})
	process.stdout.write(`Future Phase 4 extraction complete: ${experimentRelativeDirectory}\n`)
}

main().catch(async (error: unknown) => {
	await recordFailure(error)
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
