import { constants } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { link, lstat, open, readFile, realpath, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { namePalette } from "./src/color-name.ts"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPECTED_BASELINE_VERSION = "region-graph-0.19.0"
const EXPECTED_POC10_VERSION = "region-chromatic-role-0.1.0-poc.10"
const EXPECTED_CANDIDATE_HASH = "d41bd338a39fbd89bcdc1f200cbbb36c30ead374e5b53ce8e6fb9e3bcc624754"
const EXPECTED_FRESH_MANIFEST_ID = "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91"
const EXPECTED_FRESH_SEAL = "cd780b094b2a83117a2fd767566df657017ae4491f0555db7a999d40a8e3f180"

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
	manifestId: string
	sealCommitment: string
	sourceCount: number
	sources: readonly SourceRecord[]
}>

type Phase4Protocol = Readonly<{
	protocolId: string
	experimentVersion: string
	outputDirectory: string
	candidate: Readonly<{ frozenImplementationHash: string }>
	baseline: Readonly<{
		version: string
		promotedPoc10: Readonly<{ path: string; sha256: string; historicalVersion: string }>
	}>
	freshManifest: Readonly<{ manifestId: string; sealCommitment: string }>
	execution: Readonly<{ reuse: false }>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")

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

function parseProtocol(value: unknown): Phase4Protocol {
	if (!isRecord(value) || typeof value.protocolId !== "string" || typeof value.experimentVersion !== "string" ||
		typeof value.outputDirectory !== "string" || !isRecord(value.candidate) || !isRecord(value.baseline) ||
		!isRecord(value.freshManifest) || !isRecord(value.execution)) throw new Error("Phase 4 protocol is invalid")
	const { protocolId: _protocolId, ...identity } = value
	if (sha256(canonicalJson(identity)) !== value.protocolId ||
		value.experimentVersion !== "album-artwork-palette-v2-0.4.4-phase-4" ||
		value.outputDirectory !== "research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4" ||
		value.candidate.frozenImplementationHash !== EXPECTED_CANDIDATE_HASH ||
		value.baseline.version !== EXPECTED_BASELINE_VERSION || !isRecord(value.baseline.promotedPoc10) ||
		value.baseline.promotedPoc10.historicalVersion !== EXPECTED_POC10_VERSION ||
		typeof value.baseline.promotedPoc10.path !== "string" ||
		typeof value.baseline.promotedPoc10.sha256 !== "string" ||
		value.freshManifest.manifestId !== EXPECTED_FRESH_MANIFEST_ID ||
		value.freshManifest.sealCommitment !== EXPECTED_FRESH_SEAL || value.execution.reuse !== false) {
		throw new Error("Phase 4 baseline protocol binding is invalid")
	}
	return value as unknown as Phase4Protocol
}

function parseFreshManifest(value: unknown): FreshManifest {
	if (!isRecord(value) || value.manifestId !== EXPECTED_FRESH_MANIFEST_ID ||
		value.sealCommitment !== EXPECTED_FRESH_SEAL || value.sourceCount !== 12 || !Array.isArray(value.sources) ||
		value.sources.length !== 12) throw new Error("Fresh manifest binding is invalid")
	return value as unknown as FreshManifest
}

function sameRgb(first: readonly number[], second: readonly number[]): boolean {
	return first.length === 3 && second.length === 3 && first.every((channel, index) => channel === second[index])
}

function presentationFor(palette: Palette) {
	const roleColors = [palette.background, palette.surface, palette.foreground, palette.accent] as const
	const names = namePalette(roleColors.map(({ rgb }) => rgb))
	const surfaceCollapsed = sameRgb(roleColors[0].rgb, roleColors[1].rgb)
	const accentCollapsed = sameRgb(roleColors[2].rgb, roleColors[3].rgb)
	return {
		roles: {
			background: { rgb: [...roleColors[0].rgb], hex: names[0].sourceHex, generated: roleColors[0].generated,
				collapsedTo: null, colorName: names[0] },
			surface: { rgb: [...roleColors[1].rgb], hex: names[1].sourceHex, generated: roleColors[1].generated,
				collapsedTo: surfaceCollapsed ? "background" : null, colorName: names[1] },
			foreground: { rgb: [...roleColors[2].rgb], hex: names[2].sourceHex, generated: roleColors[2].generated,
				collapsedTo: null, colorName: names[2] },
			accent: { rgb: [...roleColors[3].rgb], hex: names[3].sourceHex, generated: roleColors[3].generated,
				collapsedTo: accentCollapsed ? "foreground" : null, colorName: names[3] },
		},
		gradient: palette.gradient.isGradient,
		collapse: { surface: surfaceCollapsed, accent: accentCollapsed },
	}
}

async function readBoundSource(source: SourceRecord): Promise<Buffer> {
	if (!/^0f\/[A-Za-z0-9._-]+$/.test(source.path) || basename(source.path) !== source.path.slice(3)) {
		throw new Error(`Unsafe fresh source path for ${source.caseId}`)
	}
	const sourcePath = join(projectRoot, "0f", basename(source.path))
	if (sourcePath !== resolve(projectRoot, source.path)) throw new Error(`Fresh source path escaped 0f for ${source.caseId}`)
	const before = await lstat(sourcePath)
	if (!before.isFile() || before.isSymbolicLink() || await realpath(sourcePath) !== sourcePath) {
		throw new Error(`Fresh source is not a physical regular file for ${source.caseId}`)
	}
	if (before.size !== source.byteCount) throw new Error(`Fresh source size changed for ${source.caseId}`)
	const handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
	try {
		const opened = await handle.stat()
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== source.byteCount) {
			throw new Error(`Fresh source changed while opening ${source.caseId}`)
		}
		const bytes = await handle.readFile()
		const after = await handle.stat()
		if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
			bytes.byteLength !== source.byteCount || sha256(bytes) !== source.sha256) {
			throw new Error(`Fresh source custody mismatch for ${source.caseId}`)
		}
		return bytes
	} finally {
		await handle.close()
	}
}

async function writeExclusiveAtomicJson(path: string, value: unknown): Promise<void> {
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
	const directory = await open(dirname(path), constants.O_RDONLY)
	try {
		await directory.sync()
	} finally {
		await directory.close()
	}
}

async function main(): Promise<void> {
	const [protocolArgument, freshArgument, caseId, outputArgument] = process.argv.slice(2)
	if (!protocolArgument || !freshArgument || !caseId || !outputArgument || process.argv.length !== 6) {
		throw new Error("Expected <protocol> <fresh-manifest> <case-id> <output>")
	}
	if (ALGORITHM_VERSION !== EXPECTED_BASELINE_VERSION) {
		throw new Error(`Baseline runtime must be ${EXPECTED_BASELINE_VERSION}, got ${ALGORITHM_VERSION}`)
	}
	const expectedProtocolPath = resolve(projectRoot, "research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/protocol.json")
	const expectedFreshPath = resolve(projectRoot, "research/data/album-artwork-palette-v2-fresh-sample.sealed.json")
	if (resolve(protocolArgument) !== expectedProtocolPath || resolve(freshArgument) !== expectedFreshPath) {
		throw new Error("Baseline child received an unbound control path")
	}
	const [protocol, fresh] = await Promise.all([
		readFile(expectedProtocolPath, "utf8").then((source) => parseProtocol(JSON.parse(source) as unknown)),
		readFile(expectedFreshPath, "utf8").then((source) => parseFreshManifest(JSON.parse(source) as unknown)),
	])
	const markerPath = resolve(projectRoot, protocol.outputDirectory, "candidate-complete.json")
	const markerMetadata = await lstat(markerPath)
	if (!markerMetadata.isFile() || markerMetadata.isSymbolicLink() || await realpath(markerPath) !== markerPath) {
		throw new Error("Candidate-complete marker is not a physical file")
	}
	const marker = JSON.parse(await readFile(markerPath, "utf8")) as unknown
	if (!isRecord(marker) || marker.protocolId !== protocol.protocolId || marker.sourceCount !== 12 ||
		!Array.isArray(marker.artifacts) || marker.artifacts.length !== 12) {
		throw new Error("Candidate-complete marker is invalid")
	}
	const source = fresh.sources.find((entry) => entry.caseId === caseId)
	if (!source || source.cohort !== "fresh") throw new Error(`Unknown fresh case ${caseId}`)
	const expectedOutput = resolve(projectRoot, protocol.outputDirectory, "baseline", `${caseId}.json`)
	if (resolve(outputArgument) !== expectedOutput) throw new Error("Baseline output path is not protocol-bound")

	const poc10Path = resolve(projectRoot, protocol.baseline.promotedPoc10.path)
	const expectedPoc10Path = resolve(projectRoot,
		"research/data/experiments/chromatic-role-reserve-validation-0.8.0-0f/candidate-results.json")
	if (poc10Path !== expectedPoc10Path) throw new Error("POC.10 comparison path is not frozen")
	const poc10Source = await readFile(poc10Path)
	if (sha256(poc10Source) !== protocol.baseline.promotedPoc10.sha256) {
		throw new Error("Promoted POC.10 output hash changed")
	}
	const poc10 = JSON.parse(poc10Source.toString("utf8")) as CorpusResult
	if (poc10.algorithmVersion !== EXPECTED_POC10_VERSION || poc10.entries.length !== 324) {
		throw new Error("Promoted POC.10 output identity changed")
	}
	const matchingRows = poc10.entries.filter((entry) => entry.file === source.path)
	if (matchingRows.length !== 1) throw new Error(`Expected one promoted POC.10 row for ${source.path}`)
	const expectedRow = matchingRows[0]

	const bytes = await readBoundSource(source)
	const cpuStart = process.cpuUsage()
	const wallStart = performance.now()
	const image = await loadImage(bytes)
	const extraction = extractPalette(image)
	const wallMs = performance.now() - wallStart
	const cpu = process.cpuUsage(cpuStart)
	if (extraction.version !== EXPECTED_BASELINE_VERSION || expectedRow.width !== image.width ||
		expectedRow.height !== image.height || expectedRow.extraction.width !== image.width ||
		expectedRow.extraction.height !== image.height) {
		throw new Error(`Baseline dimensions or version changed for ${caseId}`)
	}
	const presentation = presentationFor(extraction.methods.spatial)
	const expectedPresentation = presentationFor(expectedRow.extraction.methods.spatial)
	if (!isDeepStrictEqual(presentation, expectedPresentation)) {
		throw new Error(`Canonical ${EXPECTED_BASELINE_VERSION} no longer matches promoted POC.10 for ${caseId}`)
	}
	const artifact = {
		schemaVersion: 1,
		method: "baseline",
		protocolId: protocol.protocolId,
		baselineVersion: EXPECTED_BASELINE_VERSION,
		promotedPoc10HistoricalVersion: EXPECTED_POC10_VERSION,
		freshManifestId: fresh.manifestId,
		freshSealCommitment: fresh.sealCommitment,
		source,
		dimensions: { width: image.width, height: image.height },
		extraction,
		presentation,
		presentationSha256: sha256(canonicalJson(presentation)),
		scientificSha256: sha256(canonicalJson(extraction)),
		promotedPoc10PresentationSha256: sha256(canonicalJson(expectedPresentation)),
		promotedPoc10ExactPresentationMatch: true,
		runtime: { wallMs, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system },
	}
	await writeExclusiveAtomicJson(expectedOutput, artifact)
	process.stdout.write(`${caseId} baseline ${image.width}x${image.height} ${wallMs.toFixed(1)}ms\n`)
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
