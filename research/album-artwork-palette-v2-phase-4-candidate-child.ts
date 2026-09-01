import { constants } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { link, lstat, open, readFile, realpath, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { extractAlbumArtworkPaletteV2, type CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import { namePalette } from "./src/color-name.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./src/album-artwork-palette-v2-protocol.ts"

const EXPECTED_CANDIDATE_VERSION = "album-artwork-first-principles-0.4.4"
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
	candidate: Readonly<{ version: string; frozenImplementationHash: string }>
	freshManifest: Readonly<{ manifestId: string; sealCommitment: string }>
	execution: Readonly<{ candidateWorkers: number; reuse: false }>
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
		typeof value.outputDirectory !== "string" || !isRecord(value.candidate) || !isRecord(value.freshManifest) ||
		!isRecord(value.execution)) throw new Error("Phase 4 protocol is invalid")
	const { protocolId: _protocolId, ...identity } = value
	if (sha256(canonicalJson(identity)) !== value.protocolId ||
		value.experimentVersion !== "album-artwork-palette-v2-0.4.4-phase-4" ||
		value.outputDirectory !== "research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4" ||
		value.candidate.version !== EXPECTED_CANDIDATE_VERSION ||
		value.candidate.frozenImplementationHash !== EXPECTED_CANDIDATE_HASH ||
		value.freshManifest.manifestId !== EXPECTED_FRESH_MANIFEST_ID ||
		value.freshManifest.sealCommitment !== EXPECTED_FRESH_SEAL ||
		value.execution.candidateWorkers !== 6 || value.execution.reuse !== false) {
		throw new Error("Phase 4 candidate protocol binding is invalid")
	}
	return value as unknown as Phase4Protocol
}

function parseFreshManifest(value: unknown): FreshManifest {
	if (!isRecord(value) || value.manifestId !== EXPECTED_FRESH_MANIFEST_ID ||
		value.sealCommitment !== EXPECTED_FRESH_SEAL || value.sourceCount !== 12 || !Array.isArray(value.sources) ||
		value.sources.length !== 12) throw new Error("Fresh manifest binding is invalid")
	return value as unknown as FreshManifest
}

function presentationFor(treatment: CompletePaletteTreatment) {
	const roles = [treatment.background, treatment.surface, treatment.foreground, treatment.accent] as const
	const names = namePalette(roles.map(({ rgb }) => rgb))
	return {
		roles: {
			background: { rgb: [...roles[0].rgb], hex: names[0].sourceHex, generated: roles[0].generated,
				collapsedTo: null, colorName: names[0] },
			surface: { rgb: [...roles[1].rgb], hex: names[1].sourceHex, generated: roles[1].generated,
				collapsedTo: treatment.collapse.surface ? "background" : null, colorName: names[1] },
			foreground: { rgb: [...roles[2].rgb], hex: names[2].sourceHex, generated: roles[2].generated,
				collapsedTo: null, colorName: names[2] },
			accent: { rgb: [...roles[3].rgb], hex: names[3].sourceHex, generated: roles[3].generated,
				collapsedTo: treatment.collapse.accent ? "foreground" : null, colorName: names[3] },
		},
		gradient: treatment.gradient,
		collapse: { surface: treatment.collapse.surface, accent: treatment.collapse.accent },
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
	if (ALBUM_ARTWORK_PALETTE_V2_VERSION !== EXPECTED_CANDIDATE_VERSION) {
		throw new Error("Candidate runtime version is not the frozen Phase 4 version")
	}
	const expectedProtocolPath = resolve(projectRoot, "research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/protocol.json")
	const expectedFreshPath = resolve(projectRoot, "research/data/album-artwork-palette-v2-fresh-sample.sealed.json")
	if (resolve(protocolArgument) !== expectedProtocolPath || resolve(freshArgument) !== expectedFreshPath) {
		throw new Error("Candidate child received an unbound control path")
	}
	const [protocol, fresh] = await Promise.all([
		readFile(expectedProtocolPath, "utf8").then((source) => parseProtocol(JSON.parse(source) as unknown)),
		readFile(expectedFreshPath, "utf8").then((source) => parseFreshManifest(JSON.parse(source) as unknown)),
	])
	const source = fresh.sources.find((entry) => entry.caseId === caseId)
	if (!source || source.cohort !== "fresh") throw new Error(`Unknown fresh case ${caseId}`)
	const expectedOutput = resolve(projectRoot, protocol.outputDirectory, "candidate", `${caseId}.json`)
	if (resolve(outputArgument) !== expectedOutput) throw new Error("Candidate output path is not protocol-bound")

	const bytes = await readBoundSource(source)
	const cpuStart = process.cpuUsage()
	const wallStart = performance.now()
	const image = await loadNativeImage(bytes)
	const extraction = extractAlbumArtworkPaletteV2(image)
	const wallMs = performance.now() - wallStart
	const cpu = process.cpuUsage(cpuStart)
	if (extraction.version !== EXPECTED_CANDIDATE_VERSION || extraction.winner !== extraction.alternatives[0]) {
		throw new Error(`Candidate extraction identity changed for ${caseId}`)
	}
	const presentation = presentationFor(extraction.winner)
	const artifact = {
		schemaVersion: 1,
		method: "candidate",
		protocolId: protocol.protocolId,
		candidateVersion: EXPECTED_CANDIDATE_VERSION,
		frozenImplementationHash: EXPECTED_CANDIDATE_HASH,
		freshManifestId: fresh.manifestId,
		freshSealCommitment: fresh.sealCommitment,
		source,
		dimensions: { width: image.width, height: image.height },
		extraction,
		presentation,
		presentationSha256: sha256(canonicalJson(presentation)),
		scientificSha256: sha256(canonicalJson(extraction)),
		runtime: { wallMs, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system },
	}
	await writeExclusiveAtomicJson(expectedOutput, artifact)
	process.stdout.write(`${caseId} candidate ${image.width}x${image.height} ${wallMs.toFixed(1)}ms\n`)
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
