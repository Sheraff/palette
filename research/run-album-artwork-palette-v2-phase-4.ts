import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
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
	ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./src/album-artwork-palette-v2-protocol.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION,
	phase4ReviewManifestId,
	type Phase4ReviewPalette,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import {
	parseSourceProvenanceInventory,
	type SourceArtworkFamily,
	type SourceProvenanceInventory,
	type SourceVariant,
} from "./src/source-provenance-inventory.ts"

const EXPERIMENT_VERSION = "album-artwork-palette-v2-0.4.4-phase-4"
const EXPECTED_CANDIDATE_VERSION = "album-artwork-first-principles-0.4.4"
const EXPECTED_CANDIDATE_HASH = "d41bd338a39fbd89bcdc1f200cbbb36c30ead374e5b53ce8e6fb9e3bcc624754"
const EXPECTED_BASELINE_VERSION = "region-graph-0.19.0"
const EXPECTED_POC10_VERSION = "region-chromatic-role-0.1.0-poc.10"
const EXPECTED_POC10_SHA256 = "5d0cfdaf80575046ecf8273bde4bc19a8ccd8ecccd95f74991230b397e4ed6f8"
const EXPECTED_FRESH_MANIFEST_ID = "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91"
const EXPECTED_FRESH_SEAL = "cd780b094b2a83117a2fd767566df657017ae4491f0555db7a999d40a8e3f180"
const EXPECTED_INVENTORY_ID = "3907c57f94cd7dfea992c5d1ce98da6de2165c720b75259b32f0250da1881c7f"
const EXPECTED_INVENTORY_SHA256 = "80b53c77a025083ff0cfcb736bc425ec0917f70b9e325741899e8b8d92f4fac9"
const SIDE_ASSIGNMENT_DOMAIN = "album-artwork-palette-v2-phase-4-side-assignment-v1"
const CANDIDATE_WORKERS = 6

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "fresh"
	structureTags: readonly string[]
}>

type FreshManifest = Readonly<{
	schemaVersion: 1
	protocol: string
	candidateVersion: string
	inventoryVersion: string
	inventoryId: string
	inventorySha256: string
	selectionPolicy: string
	selectionDomain: string
	candidateOutputOpened: false
	phaseRequiredToOpen: 4
	sourceCount: 12
	sources: readonly SourceRecord[]
	manifestId: string
	sealCommitment: string
}>

type Phase3Freeze = Readonly<{
	schemaVersion: 1
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	phase3Gate: Readonly<{
		pass: boolean
		positiveCount: number
		freezeCandidateForPhase4: boolean
	}>
	phaseDisposition: string
	freshSampleOpened: boolean
}>

type Poc10Corpus = Readonly<{
	algorithmVersion: string
	entries: ReadonlyArray<Readonly<{ file: string }>>
}>

type ImplementationClosure = Readonly<{
	version: "album-artwork-palette-v2-phase-4-static-import-closure-v1"
	roots: readonly string[]
	files: ReadonlyArray<Readonly<{ path: string; rawSha256: string }>>
	sha256: string
}>

type SideAssignment = Readonly<{
	caseId: string
	sourceSha256: string
	key: string
	candidateSide: "A" | "B"
	baselineSide: "A" | "B"
}>

type SourceArtifact = Readonly<{
	schemaVersion: 1
	method: "candidate" | "baseline"
	protocolId: string
	source: SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: unknown
	presentation: unknown
	presentationSha256: string
	scientificSha256: string
	runtime: Readonly<{ wallMs: number; cpuUserMicros: number; cpuSystemMicros: number }>
	promotedPoc10ExactPresentationMatch?: boolean
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
const freshRelativePath = "research/data/album-artwork-palette-v2-fresh-sample.sealed.json"
const inventoryRelativePath = "research/data/source-provenance-inventory-00-14.json"
const phase3RelativePath = "research/data/experiments/album-artwork-palette-v2-0.4.4-development/absolute-quality-delta-analysis.json"
const poc10RelativePath = "research/data/experiments/chromatic-role-reserve-validation-0.8.0-0f/candidate-results.json"
const candidateChildRelativePath = "research/album-artwork-palette-v2-phase-4-candidate-child.ts"
const baselineChildRelativePath = "research/album-artwork-palette-v2-phase-4-baseline-child.ts"
const runnerRelativePath = "research/run-album-artwork-palette-v2-phase-4.ts"
const candidateChildPath = resolve(projectRoot, candidateChildRelativePath)
const baselineChildPath = resolve(projectRoot, baselineChildRelativePath)

let outputDirectoryCreated = false
let activeProtocolId: string | null = null

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

async function requirePhysicalFile(relativePath: string): Promise<Buffer> {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const projectRelative = relative(projectRoot, path)
	if (projectRelative === ".." || projectRelative.startsWith(`..${sep}`)) {
		throw new Error(`Control path escapes project: ${relativePath}`)
	}
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Control path must be a physical file: ${relativePath}`)
	}
	return readFile(path)
}

async function requireMissing(path: string): Promise<void> {
	try {
		await lstat(path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite or reuse existing Phase 4 output: ${path}`)
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
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
	const handle = await open(temporary, "wx", 0o600)
	try {
		await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
		await handle.sync()
	} finally {
		await handle.close()
	}
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`, { cause: error })
		throw error
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined)
	}
	await syncDirectory(dirname(path))
}

function parseFreshManifest(value: unknown): FreshManifest {
	if (!isRecord(value)) throw new Error("Fresh manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "protocol", "candidateVersion", "inventoryVersion", "inventoryId", "inventorySha256",
		"selectionPolicy", "selectionDomain", "candidateOutputOpened", "phaseRequiredToOpen", "sourceCount",
		"sources", "manifestId", "sealCommitment",
	], "Fresh manifest")
	if (value.schemaVersion !== 1 || value.protocol !== ALBUM_ARTWORK_PALETTE_V2_PROTOCOL ||
		value.candidateVersion !== "album-artwork-first-principles-0.1.0" ||
		value.inventoryVersion !== "source-provenance-inventory-00-14-v1" ||
		value.inventoryId !== EXPECTED_INVENTORY_ID || value.inventorySha256 !== EXPECTED_INVENTORY_SHA256 ||
		value.selectionPolicy !== "first-12-independent-0f-source-groups-by-domain-separated-sha256-key" ||
		value.selectionDomain !== "album-artwork-palette-v2-fresh-directional-selection-v1" ||
		value.candidateOutputOpened !== false || value.phaseRequiredToOpen !== 4 || value.sourceCount !== 12 ||
		!Array.isArray(value.sources) || value.sources.length !== 12 ||
		value.manifestId !== EXPECTED_FRESH_MANIFEST_ID || value.sealCommitment !== EXPECTED_FRESH_SEAL) {
		throw new Error("Fresh manifest header does not match the sealed Phase 4 sample")
	}
	const shaPattern = /^[a-f0-9]{64}$/
	for (const [index, source] of value.sources.entries()) {
		if (!isRecord(source)) throw new Error(`Fresh source ${index} is invalid`)
		exactKeys(source, ["caseId", "path", "sha256", "byteCount", "artworkId", "cohort", "structureTags"], `Fresh source ${index}`)
		if (source.caseId !== `fresh-${String(index + 1).padStart(2, "0")}` ||
			typeof source.path !== "string" || !/^0f\/[A-Za-z0-9._-]+$/.test(source.path) ||
			!shaPattern.test(source.sha256 as string) || !Number.isSafeInteger(source.byteCount) ||
			(source.byteCount as number) <= 0 || typeof source.artworkId !== "string" || source.artworkId.length === 0 ||
			source.cohort !== "fresh" || !Array.isArray(source.structureTags) || source.structureTags.length !== 0) {
			throw new Error(`Fresh source ${index} is invalid`)
		}
	}
	const { manifestId: _manifestId, sealCommitment: _sealCommitment, ...identity } = value
	if (sha256(canonicalJson(identity)) !== EXPECTED_FRESH_MANIFEST_ID ||
		sha256(`sealed-fresh-sample-v1\0${canonicalJson(identity)}`) !== EXPECTED_FRESH_SEAL) {
		throw new Error("Fresh manifest ID or seal commitment is invalid")
	}
	const manifest = value as unknown as FreshManifest
	for (const [label, values] of [
		["case IDs", manifest.sources.map(({ caseId }) => caseId)],
		["paths", manifest.sources.map(({ path }) => path)],
		["source hashes", manifest.sources.map(({ sha256: hash }) => hash)],
		["artwork groups", manifest.sources.map(({ artworkId }) => artworkId)],
	] as const) {
		if (new Set(values).size !== 12) throw new Error(`Fresh manifest does not contain 12 unique ${label}`)
	}
	return manifest
}

function preferredVariant(family: SourceArtworkFamily): SourceVariant {
	const variant = family.variants.find(({ path }) => path === family.preferredSourcePath)
	if (!variant || !variant.jpegSignatures.startsWithSoi || !variant.jpegSignatures.endsWithEoi) {
		throw new Error(`Inventory preferred source is invalid: ${family.preferredSourcePath}`)
	}
	return variant
}

function verifyInventoryBinding(inventory: SourceProvenanceInventory, fresh: FreshManifest): void {
	if (inventory.inventoryId !== EXPECTED_INVENTORY_ID || inventory.inventoryVersion !== fresh.inventoryVersion) {
		throw new Error("Fresh manifest inventory identity changed")
	}
	const selection = inventory.families
		.filter(({ preferredSourcePath }) => preferredSourcePath.startsWith("0f/"))
		.map((family) => ({ family, variant: preferredVariant(family) }))
		.sort((first, second) => compareText(
			sha256(`${fresh.selectionDomain}\0${inventory.inventoryId}\0${first.family.artworkId}\0${first.variant.path}\0${first.variant.sha256}`),
			sha256(`${fresh.selectionDomain}\0${inventory.inventoryId}\0${second.family.artworkId}\0${second.variant.path}\0${second.variant.sha256}`),
		))
	const selected: Array<{ family: SourceArtworkFamily; variant: SourceVariant }> = []
	const seenHashes = new Set<string>()
	for (const candidate of selection) {
		if (seenHashes.has(candidate.variant.sha256)) continue
		seenHashes.add(candidate.variant.sha256)
		selected.push(candidate)
		if (selected.length === 12) break
	}
	if (selected.length !== 12) throw new Error("Inventory cannot reproduce the 12 fresh source groups")
	for (const [index, source] of fresh.sources.entries()) {
		const expected = selected[index]
		if (source.path !== expected.variant.path || source.sha256 !== expected.variant.sha256 ||
			source.byteCount !== expected.variant.byteCount || source.artworkId !== expected.family.artworkId) {
			throw new Error(`Fresh source ${source.caseId} is not bound to the inventory selection`)
		}
		const rawGroup = inventory.rawSha256Groups.find(({ sha256: hash }) => hash === source.sha256)
		if (!rawGroup || rawGroup.byteCount !== source.byteCount || !rawGroup.paths.includes(source.path)) {
			throw new Error(`Fresh source ${source.caseId} has no exact inventory hash-group binding`)
		}
	}
}

function parsePhase3Freeze(value: unknown): Phase3Freeze {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.candidateVersion !== EXPECTED_CANDIDATE_VERSION ||
		value.implementationHash !== EXPECTED_CANDIDATE_HASH || typeof value.scientificSha256 !== "string" ||
		!isRecord(value.phase3Gate) || value.phase3Gate.pass !== true ||
		value.phase3Gate.freezeCandidateForPhase4 !== true || value.phase3Gate.positiveCount !== 11 ||
		value.phaseDisposition !== "phase3-passed-freeze-0.4.4-for-one-time-fresh-directional-review" ||
		value.freshSampleOpened !== false) {
		throw new Error("Phase 3 freeze artifact does not authorize the one-time Phase 4 run")
	}
	return value as unknown as Phase3Freeze
}

async function frozenCandidateImplementationHash(): Promise<string> {
	const paths = [
		resolve(moduleDirectory, "evaluate-album-artwork-palette-v2-development.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-protocol.ts"),
		resolve(moduleDirectory, "src/color.ts"),
		resolve(moduleDirectory, "src/color-name.ts"),
		resolve(moduleDirectory, "src/native-resolution-image.ts"),
		resolve(moduleDirectory, "src/types.ts"),
		resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2.md"),
		resolve(moduleDirectory, "album-artwork-palette-v2-development-child.ts"),
		resolve(moduleDirectory, "../package.json"),
		resolve(moduleDirectory, "../pnpm-lock.yaml"),
	]
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const path of paths) {
		hash.update(path.slice(moduleDirectory.length))
		hash.update("\0")
		hash.update(await readFile(path))
		hash.update("\0")
	}
	return hash.digest("hex")
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
			if ((!isImportDeclaration(statement) && !isExportDeclaration(statement)) ||
				!statement.moduleSpecifier || !isStringLiteralLike(statement.moduleSpecifier)) continue
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

function sideAssignments(fresh: FreshManifest): SideAssignment[] {
	return fresh.sources.map((source) => ({
		source,
		key: sha256(`${SIDE_ASSIGNMENT_DOMAIN}\0${fresh.sealCommitment}\0${source.sha256}`),
	})).sort((first, second) => compareText(first.key, second.key)).map(({ source, key }, index) => ({
		caseId: source.caseId,
		sourceSha256: source.sha256,
		key,
		candidateSide: index < 6 ? "A" : "B",
		baselineSide: index < 6 ? "B" : "A",
	}))
}

function validatePoc10(value: unknown, fresh: FreshManifest): Poc10Corpus {
	if (!isRecord(value) || value.algorithmVersion !== EXPECTED_POC10_VERSION ||
		!Array.isArray(value.entries) || value.entries.length !== 324) {
		throw new Error("Frozen promoted POC.10 0f output identity changed")
	}
	const entries = value.entries as Array<{ file?: unknown }>
	if (entries.some(({ file }) => typeof file !== "string") ||
		new Set(entries.map(({ file }) => file)).size !== entries.length) {
		throw new Error("Frozen promoted POC.10 rows are invalid or duplicated")
	}
	for (const source of fresh.sources) {
		if (entries.filter(({ file }) => file === source.path).length !== 1) {
			throw new Error(`Frozen promoted POC.10 output has no unique row for ${source.path}`)
		}
	}
	return value as unknown as Poc10Corpus
}

async function controlFileBindings(paths: readonly string[]): Promise<Array<{ path: string; rawSha256: string }>> {
	return Promise.all([...paths].sort(compareText).map(async (path) => ({ path, rawSha256: sha256(await requirePhysicalFile(path)) })))
}

function runChild(childPath: string, source: SourceRecord, outputPath: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [
			"--experimental-strip-types",
			childPath,
			protocolPath,
			resolve(projectRoot, freshRelativePath),
			source.caseId,
			outputPath,
		], {
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
	const worker = async (): Promise<void> => {
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
	await Promise.all(Array.from({ length: CANDIDATE_WORKERS }, worker))
	if (errors.length > 0) throw errors[0]
}

async function validateArtifactDirectory(
	directory: string,
	method: "candidate" | "baseline",
	protocolId: string,
	sources: readonly SourceRecord[],
): Promise<ValidatedArtifact[]> {
	const expectedNames = sources.map(({ caseId }) => `${caseId}.json`).sort(compareText)
	const actualNames = (await readdir(directory)).sort(compareText)
	if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
		throw new Error(`${method} artifact set is incomplete or contains unexpected files`)
	}
	return Promise.all(sources.map(async (source) => {
		const path = join(directory, `${source.caseId}.json`)
		const metadata = await lstat(path)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
			throw new Error(`${method} artifact is not a physical file for ${source.caseId}`)
		}
		const raw = await readFile(path)
		const artifact = JSON.parse(raw.toString("utf8")) as SourceArtifact
		if (artifact.schemaVersion !== 1 || artifact.method !== method || artifact.protocolId !== protocolId ||
			artifact.source.caseId !== source.caseId || artifact.source.path !== source.path ||
			artifact.source.sha256 !== source.sha256 || artifact.source.byteCount !== source.byteCount ||
			!Number.isSafeInteger(artifact.dimensions.width) || artifact.dimensions.width <= 0 ||
			!Number.isSafeInteger(artifact.dimensions.height) || artifact.dimensions.height <= 0 ||
			artifact.presentationSha256 !== sha256(canonicalJson(artifact.presentation)) ||
			artifact.scientificSha256 !== sha256(canonicalJson(artifact.extraction)) ||
			!Number.isFinite(artifact.runtime.wallMs) || artifact.runtime.wallMs < 0 ||
			!Number.isSafeInteger(artifact.runtime.cpuUserMicros) || artifact.runtime.cpuUserMicros < 0 ||
			!Number.isSafeInteger(artifact.runtime.cpuSystemMicros) || artifact.runtime.cpuSystemMicros < 0 ||
			(method === "baseline" && artifact.promotedPoc10ExactPresentationMatch !== true)) {
			throw new Error(`${method} artifact validation failed for ${source.caseId}`)
		}
		return { artifact, relativePath: relative(projectRoot, path).split(sep).join("/"), rawSha256: sha256(raw) }
	}))
}

async function recordFailure(error: unknown): Promise<void> {
	if (!outputDirectoryCreated) return
	const failure = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocolId: activeProtocolId,
		failedAt: new Date().toISOString(),
		error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack ?? null } : { message: String(error) },
		automaticRetryAttempted: false,
		partialOutputPreserved: true,
	}
	await writeExclusiveDurableJson(join(experimentDirectory, "failure.json"), failure).catch((failureError) => {
		process.stderr.write(`Could not write failure marker: ${String(failureError)}\n`)
	})
}

async function main(): Promise<void> {
	if (process.argv.length !== 2) throw new Error("Phase 4 runner accepts no arguments")
	if (ALBUM_ARTWORK_PALETTE_V2_VERSION !== EXPECTED_CANDIDATE_VERSION) {
		throw new Error("Candidate source version is not the frozen Phase 4 version")
	}
	if (await realpath(projectRoot) !== projectRoot) throw new Error("Project root must be a physical path")
	const experimentsMetadata = await lstat(experimentsDirectory)
	if (!experimentsMetadata.isDirectory() || experimentsMetadata.isSymbolicLink() ||
		await realpath(experimentsDirectory) !== experimentsDirectory) {
		throw new Error("Experiment parent must be a physical directory")
	}
	await requireMissing(experimentDirectory)

	// Every check through protocol publication is metadata-only; no artwork source is opened here.
	const [freshSource, inventorySource, phase3Source, poc10Source] = await Promise.all([
		requirePhysicalFile(freshRelativePath),
		requirePhysicalFile(inventoryRelativePath),
		requirePhysicalFile(phase3RelativePath),
		requirePhysicalFile(poc10RelativePath),
	])
	if (sha256(poc10Source) !== EXPECTED_POC10_SHA256) throw new Error("Frozen promoted POC.10 output hash changed")
	const fresh = parseFreshManifest(JSON.parse(freshSource.toString("utf8")) as unknown)
	if (sha256(inventorySource) !== EXPECTED_INVENTORY_SHA256) throw new Error("Inventory raw hash changed")
	const inventory = parseSourceProvenanceInventory(JSON.parse(inventorySource.toString("utf8")) as unknown)
	verifyInventoryBinding(inventory, fresh)
	const phase3 = parsePhase3Freeze(JSON.parse(phase3Source.toString("utf8")) as unknown)
	validatePoc10(JSON.parse(poc10Source.toString("utf8")) as unknown, fresh)
	const candidateImplementationHash = await frozenCandidateImplementationHash()
	if (candidateImplementationHash !== EXPECTED_CANDIDATE_HASH) {
		throw new Error(`Frozen candidate implementation hash changed: ${candidateImplementationHash}`)
	}
	const [candidateClosure, baselineClosure] = await Promise.all([
		buildImplementationClosure([candidateChildRelativePath]),
		buildImplementationClosure([baselineChildRelativePath]),
	])
	const candidateFiles = new Set(candidateClosure.files.map(({ path }) => path))
	for (const prohibited of ["research/src/extract.ts", "research/src/image.ts", baselineChildRelativePath]) {
		if (candidateFiles.has(prohibited)) throw new Error(`Candidate closure imports baseline code: ${prohibited}`)
	}
	if (!new Set(baselineClosure.files.map(({ path }) => path)).has("research/src/extract.ts") ||
		!new Set(baselineClosure.files.map(({ path }) => path)).has("research/src/image.ts")) {
		throw new Error("Baseline closure does not contain the canonical extractor entry points")
	}
	const controlPaths = [
		runnerRelativePath,
		candidateChildRelativePath,
		baselineChildRelativePath,
		"research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md",
		"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2.md",
		"research/evaluate-album-artwork-palette-v2-development.ts",
		"research/album-artwork-palette-v2-development-child.ts",
		"research/src/source-provenance-inventory.ts",
		"research/src/album-artwork-palette-v2-protocol.ts",
		"research/src/album-artwork-palette-v2-phase-4-review.ts",
		"research/serve-album-artwork-palette-v2-phase-4-review.ts",
		"research/analyze-album-artwork-palette-v2-phase-4-review.ts",
		"research/album-artwork-palette-v2-phase-4-review/index.html",
		"research/album-artwork-palette-v2-phase-4-review/app.js",
		"research/album-artwork-palette-v2-phase-4-review/styles.css",
		"research/tests/album-artwork-palette-v2-phase-4.test.ts",
		freshRelativePath,
		inventoryRelativePath,
		phase3RelativePath,
		poc10RelativePath,
		"research/tsconfig.json",
		"package.json",
		"pnpm-lock.yaml",
	] as const
	const controls = await controlFileBindings(controlPaths)
	const assignments = sideAssignments(fresh)
	if (assignments.filter(({ candidateSide }) => candidateSide === "A").length !== 6 ||
		assignments.filter(({ candidateSide }) => candidateSide === "B").length !== 6) {
		throw new Error("Phase 4 side assignment is not exactly balanced")
	}

	const protocolIdentity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		createdAt: new Date().toISOString(),
		outputDirectory: experimentRelativeDirectory,
		phase3Freeze: {
			path: phase3RelativePath,
			rawSha256: sha256(phase3Source),
			candidateVersion: phase3.candidateVersion,
			implementationHash: phase3.implementationHash,
			scientificSha256: phase3.scientificSha256,
			gatePass: phase3.phase3Gate.pass,
			freezeCandidateForPhase4: phase3.phase3Gate.freezeCandidateForPhase4,
		},
		candidate: {
			version: EXPECTED_CANDIDATE_VERSION,
			frozenImplementationHash: candidateImplementationHash,
			frozenHashMethod: "development-evaluator-runtime-and-declared-files-v1",
			closure: candidateClosure,
		},
		baseline: {
			version: EXPECTED_BASELINE_VERSION,
			entryPoints: ["research/src/image.ts#loadImage(bytes)", "research/src/extract.ts#extractPalette(image).methods.spatial"],
			closure: baselineClosure,
			promotedPoc10: {
				path: poc10RelativePath,
				sha256: sha256(poc10Source),
				historicalVersion: EXPECTED_POC10_VERSION,
				comparison: "normalized-displayed-presentation-exact; historical-version-and-undisplayed-diagnostics-ignored",
			},
		},
		freshManifest: {
			path: freshRelativePath,
			rawSha256: sha256(freshSource),
			manifestId: fresh.manifestId,
			sealCommitment: fresh.sealCommitment,
			sourceCount: fresh.sourceCount,
			uniqueGroupCount: 12,
			inventory: { path: inventoryRelativePath, id: inventory.inventoryId, rawSha256: sha256(inventorySource) },
		},
		sourceCustody: {
			root: "0f",
			pathRule: "direct-child-only",
			checksBeforeDecode: ["bound-path", "realpath", "regular-file", "non-symlink", "byte-count", "sha256"],
			candidateAndBaselineReadSeparately: true,
		},
		sideAssignment: {
			domain: SIDE_ASSIGNMENT_DOMAIN,
			digest: "SHA256(UTF8(domain) || NUL || UTF8(fresh seal commitment) || NUL || UTF8(source SHA-256))",
			order: "ascending-lowercase-hex-digest",
			rule: "candidate-is-A-for-first-six-and-B-for-last-six",
			assignments,
			assignmentSha256: sha256(canonicalJson(assignments)),
		},
		presentation: {
			version: "album-artwork-palette-v2-phase-4-presentation-v1",
			roles: ["background", "surface", "foreground", "accent"],
			fields: ["rgb", "hex", "generated", "collapsedTo", "colorName"],
			gradient: "boolean",
			collapse: ["surface", "accent"],
			colorNames: "colornames-oklab-0.6.0-presentation-only",
		},
		execution: {
			arguments: [],
			candidateWorkers: CANDIDATE_WORKERS,
			candidateFirst: true,
			baselineStartsAfterDurableCandidateCompleteMarker: true,
			baselineMode: "sequential-separate-children-stop-on-first-mismatch",
			force: false,
			overwrite: false,
			reuse: false,
			automaticRetry: false,
		},
		runtime: {
			node: process.version,
			versions: process.versions,
			platform: process.platform,
			arch: process.arch,
			execPath: process.execPath,
		},
		controls: {
			method: "raw-sha256",
			files: controls,
			sha256: sha256(canonicalJson(controls)),
		},
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
	await runCandidateChildren(fresh.sources)
	const candidateWallMs = performance.now() - candidateWallStart
	const candidateArtifacts = await validateArtifactDirectory(candidateDirectory, "candidate", protocol.protocolId, fresh.sources)
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
	for (const source of fresh.sources) {
		await runChild(baselineChildPath, source, join(baselineDirectory, `${source.caseId}.json`))
	}
	const baselineWallMs = performance.now() - baselineWallStart
	const baselineArtifacts = await validateArtifactDirectory(baselineDirectory, "baseline", protocol.protocolId, fresh.sources)
	const candidatesByCase = new Map(candidateArtifacts.map((artifact) => [artifact.artifact.source.caseId, artifact]))
	const baselinesByCase = new Map(baselineArtifacts.map((artifact) => [artifact.artifact.source.caseId, artifact]))
	const sourcesByCase = new Map(fresh.sources.map((source) => [source.caseId, source]))
	const reviewCases = assignments.map((assignment, index) => {
		const source = sourcesByCase.get(assignment.caseId)!
		const candidate = candidatesByCase.get(assignment.caseId)!
		const baseline = baselinesByCase.get(assignment.caseId)!
		const options = assignment.candidateSide === "A"
			? { A: candidate.artifact.presentation, B: baseline.artifact.presentation }
			: { A: baseline.artifact.presentation, B: candidate.artifact.presentation }
		return {
			reviewCaseId: `phase4-${String(index + 1).padStart(2, "0")}-${assignment.key.slice(0, 12)}`,
			publicSafe: { options },
			private: {
				freshCaseId: source.caseId,
				source: { path: source.path, sha256: source.sha256, byteCount: source.byteCount, artworkId: source.artworkId },
				assignmentKey: assignment.key,
				candidateSide: assignment.candidateSide,
				baselineSide: assignment.baselineSide,
				candidate: {
					artifactPath: candidate.relativePath,
					artifactSha256: candidate.rawSha256,
					presentationSha256: candidate.artifact.presentationSha256,
					scientificSha256: candidate.artifact.scientificSha256,
					runtime: candidate.artifact.runtime,
				},
				baseline: {
					artifactPath: baseline.relativePath,
					artifactSha256: baseline.rawSha256,
					presentationSha256: baseline.artifact.presentationSha256,
					scientificSha256: baseline.artifact.scientificSha256,
					runtime: baseline.artifact.runtime,
					promotedPoc10ExactPresentationMatch: true,
				},
			},
		}
	})
	const protocolRaw = await readFile(protocolPath)
	const candidateCompleteRaw = await readFile(candidateCompletePath)
	const reviewProvenanceIdentity = {
		schemaVersion: 1,
		reviewVersion: "album-artwork-palette-v2-phase-4-private-directional-review-v1",
		generatedAt: new Date().toISOString(),
		protocolId: protocol.protocolId,
		freshManifestId: fresh.manifestId,
		freshSealCommitment: fresh.sealCommitment,
		caseCount: reviewCases.length,
		publicOptionPolicy: "method-identities-omitted-from-publicSafe-options",
		hashes: {
			protocolSha256: sha256(protocolRaw),
			candidateCompleteSha256: sha256(candidateCompleteRaw),
			candidateArtifactsSha256: sha256(canonicalJson(candidateArtifacts.map(({ rawSha256 }) => rawSha256))),
			baselineArtifactsSha256: sha256(canonicalJson(baselineArtifacts.map(({ rawSha256 }) => rawSha256))),
		},
		runtime: {
			candidate: {
				workerCount: CANDIDATE_WORKERS,
				wallMs: candidateWallMs,
				totalChildWallMs: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.wallMs, 0),
				totalCpuUserMicros: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuUserMicros, 0),
				totalCpuSystemMicros: candidateArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuSystemMicros, 0),
			},
			baseline: {
				mode: "sequential-stop-on-first-mismatch",
				wallMs: baselineWallMs,
				totalChildWallMs: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.wallMs, 0),
				totalCpuUserMicros: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuUserMicros, 0),
				totalCpuSystemMicros: baselineArtifacts.reduce((sum, { artifact }) => sum + artifact.runtime.cpuSystemMicros, 0),
			},
			totalWallMs: performance.now() - runWallStart,
		},
		cases: reviewCases,
	}
	const reviewProvenance = {
		...reviewProvenanceIdentity,
		manifestId: sha256(canonicalJson(reviewProvenanceIdentity)),
	}
	const reviewProvenancePath = join(experimentDirectory, "review-provenance.private.json")
	await writeExclusiveDurableJson(reviewProvenancePath, reviewProvenance)
	const publicPalette = (presentation: unknown): Phase4ReviewPalette => {
		if (!isRecord(presentation) || !isRecord(presentation.roles) || !isRecord(presentation.collapse)) {
			throw new Error("Review presentation is invalid")
		}
		const presentationRoles = presentation.roles
		const colorFor = (role: "background" | "surface" | "foreground" | "accent") => {
			const color = presentationRoles[role]
			if (!isRecord(color) || !isRecord(color.colorName) || typeof color.hex !== "string" ||
				typeof color.generated !== "boolean" || typeof color.colorName.nearestName !== "string") {
				throw new Error(`Review presentation ${role} is invalid`)
			}
			return { hex: color.hex, nearestName: color.colorName.nearestName, generated: color.generated }
		}
		if (typeof presentation.gradient !== "boolean" || typeof presentation.collapse.surface !== "boolean" ||
			typeof presentation.collapse.accent !== "boolean") throw new Error("Review field treatment is invalid")
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
	const privateReviewIdentity = {
		schemaVersion: 1 as const,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION,
		presentationVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
		cases: reviewCases.map((reviewCase, order) => ({
			caseId: reviewCase.reviewCaseId,
			order,
			source: {
				file: reviewCase.private.source.path,
				sha256: reviewCase.private.source.sha256,
				bytes: sourcesByCase.get(reviewCase.private.freshCaseId)!.byteCount,
			},
			options: {
				A: publicPalette(reviewCase.publicSafe.options.A),
				B: publicPalette(reviewCase.publicSafe.options.B),
			},
			assignment: reviewCase.private.candidateSide === "A"
				? { A: "candidate" as const, B: "baseline" as const }
				: { A: "baseline" as const, B: "candidate" as const },
		})),
	}
	const privateReviewManifest = {
		...privateReviewIdentity,
		manifestId: phase4ReviewManifestId(privateReviewIdentity),
	}
	const reviewPath = join(experimentDirectory, "review-manifest.private.json")
	await writeExclusiveDurableJson(reviewPath, privateReviewManifest)
	const reviewRaw = await readFile(reviewPath)
	const reviewProvenanceRaw = await readFile(reviewProvenancePath)
	await writeExclusiveDurableJson(join(experimentDirectory, "run-complete.json"), {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		protocolId: protocol.protocolId,
		completedAt: new Date().toISOString(),
		sourceCount: fresh.sourceCount,
		candidateCount: candidateArtifacts.length,
		baselineCount: baselineArtifacts.length,
		baselinePoc10ExactPresentationMatchCount: baselineArtifacts.length,
		privateReviewManifestId: privateReviewManifest.manifestId,
		privateReviewManifestSha256: sha256(reviewRaw),
		reviewProvenanceId: reviewProvenance.manifestId,
		reviewProvenanceSha256: sha256(reviewProvenanceRaw),
	})
	process.stdout.write(`Phase 4 extraction complete: ${experimentRelativeDirectory}\n`)
}

main().catch(async (error) => {
	await recordFailure(error)
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
