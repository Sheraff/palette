import { constants } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { link, lstat, open, readFile, realpath, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { extractAlbumArtworkPaletteV2, type CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import { parseAlbumArtworkPaletteV2FutureSample } from "./src/album-artwork-palette-v2-future-sample.ts"
import { namePalette } from "./src/color-name.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import { ALBUM_ARTWORK_PALETTE_V2_VERSION } from "./src/album-artwork-palette-v2-protocol.ts"

const EXPERIMENT_VERSION = "album-artwork-palette-v2-0.5.2-phase-4-future-02"
const OUTPUT_DIRECTORY = `research/data/experiments/${EXPERIMENT_VERSION}`
const EXPECTED_CANDIDATE_VERSION = "album-artwork-first-principles-0.5.2"
const EXPECTED_CANDIDATE_HASH = "ea1205ebd2d33abf99d8eed8a0e5e7625f1af6722dbe7879c90350c23d36fd40"
const EXPECTED_FREEZE_ID = "8a401a451b1c824c70ad1f0394870719b6786f092e27a19eda8a4b626fa7b01b"
const EXPECTED_FUTURE_MANIFEST_ID = "9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671"
const EXPECTED_FUTURE_SEAL = "9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846"
const EXPECTED_FUTURE_RAW_SHA256 = "2224603f5a4801cedf9f96375e86f2dd5624ed6895ab941fbcad5c6d8646fc8c"

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	selectionKey: string
	familyCommitment: string
}>

type Phase4Protocol = Readonly<{
	protocolId: string
	experimentVersion: string
	outputDirectory: string
	candidate: Readonly<{
		version: string
		frozenImplementationHash: string
		freezeId: string
		closure: Readonly<{ sha256: string; files: ReadonlyArray<Readonly<{ path: string; rawSha256: string }>> }>
	}>
	futureSample: Readonly<{
		manifestId: string
		sealCommitment: string
		sources: readonly SourceRecord[]
	}>
	execution: Readonly<{ candidateWorkers: number; reuse: false; overwrite: false; automaticRetry: false }>
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
	if (!isRecord(value) || typeof value.protocolId !== "string" || !isRecord(value.candidate) ||
		!isRecord(value.futureSample) || !isRecord(value.execution)) throw new Error("Future Phase 4 protocol is invalid")
	const { protocolId: _protocolId, ...identity } = value
	if (sha256(canonicalJson(identity)) !== value.protocolId || value.experimentVersion !== EXPERIMENT_VERSION ||
		value.outputDirectory !== OUTPUT_DIRECTORY || value.candidate.version !== EXPECTED_CANDIDATE_VERSION ||
		value.candidate.frozenImplementationHash !== EXPECTED_CANDIDATE_HASH || value.candidate.freezeId !== EXPECTED_FREEZE_ID ||
		!isRecord(value.candidate.closure) || typeof value.candidate.closure.sha256 !== "string" ||
		!Array.isArray(value.candidate.closure.files) ||
		value.futureSample.manifestId !== EXPECTED_FUTURE_MANIFEST_ID ||
		value.futureSample.sealCommitment !== EXPECTED_FUTURE_SEAL || !Array.isArray(value.futureSample.sources) ||
		value.futureSample.sources.length !== 12 || value.execution.candidateWorkers !== 6 || value.execution.reuse !== false ||
		value.execution.overwrite !== false || value.execution.automaticRetry !== false) {
		throw new Error("Future Phase 4 candidate protocol binding is invalid")
	}
	return value as unknown as Phase4Protocol
}

async function verifyClosure(closure: Phase4Protocol["candidate"]["closure"]): Promise<void> {
	if (sha256(canonicalJson(closure.files)) !== closure.sha256) throw new Error("Candidate closure identity is stale")
	for (const entry of closure.files) {
		if (!/^[a-f0-9]{64}$/.test(entry.rawSha256) || entry.path.startsWith("/") || entry.path.split("/").includes("..")) {
			throw new Error("Candidate closure entry is invalid")
		}
		const path = resolve(projectRoot, entry.path)
		if (!path.startsWith(`${projectRoot}/`)) throw new Error("Candidate closure escapes project")
		const metadata = await lstat(path)
		if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path ||
			sha256(await readFile(path)) !== entry.rawSha256) throw new Error(`Candidate closure changed: ${entry.path}`)
	}
}

function sourceForCase(protocol: Phase4Protocol, sampleValue: unknown, caseId: string): SourceRecord {
	const sample = parseAlbumArtworkPaletteV2FutureSample(sampleValue)
	if (sample.manifestId !== EXPECTED_FUTURE_MANIFEST_ID || sample.sealCommitment !== EXPECTED_FUTURE_SEAL) {
		throw new Error("Future sample identity is invalid")
	}
	const family = sample.families.find((entry) => entry.caseId === caseId)
	const protocolSource = protocol.futureSample.sources.find((entry) => entry.caseId === caseId)
	if (!family || !protocolSource) throw new Error(`Unknown future sample case ${caseId}`)
	const preferred = family.variants.filter(({ path }) => path === family.preferredSourcePath)
	if (preferred.length !== 1) throw new Error(`Future preferred source is ambiguous for ${caseId}`)
	const expected: SourceRecord = {
		caseId: family.caseId,
		path: preferred[0].path,
		sha256: preferred[0].sha256,
		byteCount: preferred[0].byteCount,
		artworkId: family.artworkId,
		selectionKey: family.selectionKey,
		familyCommitment: family.familyCommitment,
	}
	if (canonicalJson(expected) !== canonicalJson(protocolSource)) throw new Error(`Protocol source mismatch for ${caseId}`)
	return expected
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
		collapse: treatment.collapse,
	}
}

async function readBoundSource(source: SourceRecord): Promise<Buffer> {
	if (!/^10\/[A-Za-z0-9._-]+$/.test(source.path) || basename(source.path) !== source.path.slice(3)) {
		throw new Error(`Unsafe future source path for ${source.caseId}`)
	}
	const sourcePath = join(projectRoot, "10", basename(source.path))
	if (sourcePath !== resolve(projectRoot, source.path)) throw new Error(`Future source escaped root 10 for ${source.caseId}`)
	const before = await lstat(sourcePath)
	if (!before.isFile() || before.isSymbolicLink() || await realpath(sourcePath) !== sourcePath || before.size !== source.byteCount) {
		throw new Error(`Future source is not the bound physical file for ${source.caseId}`)
	}
	const handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
	try {
		const opened = await handle.stat()
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== source.byteCount) {
			throw new Error(`Future source changed while opening ${source.caseId}`)
		}
		const bytes = await handle.readFile()
		const after = await handle.stat()
		if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
			bytes.byteLength !== source.byteCount || sha256(bytes) !== source.sha256) {
			throw new Error(`Future source custody mismatch for ${source.caseId}`)
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
	const [protocolArgument, sampleArgument, caseId, outputArgument] = process.argv.slice(2)
	if (!protocolArgument || !sampleArgument || !caseId || !outputArgument || process.argv.length !== 6) {
		throw new Error("Expected <protocol> <future-sample> <case-id> <output>")
	}
	if (ALBUM_ARTWORK_PALETTE_V2_VERSION !== EXPECTED_CANDIDATE_VERSION) {
		throw new Error("Candidate runtime is not the frozen 0.5.2 version")
	}
	const expectedProtocolPath = resolve(projectRoot, OUTPUT_DIRECTORY, "protocol.json")
	const expectedSamplePath = resolve(projectRoot, "research/data/album-artwork-palette-v2-future-sample-02.sealed.json")
	if (resolve(protocolArgument) !== expectedProtocolPath || resolve(sampleArgument) !== expectedSamplePath) {
		throw new Error("Candidate child received an unbound control path")
	}
	const [protocolRaw, sampleRaw] = await Promise.all([readFile(expectedProtocolPath), readFile(expectedSamplePath)])
	if (sha256(sampleRaw) !== EXPECTED_FUTURE_RAW_SHA256) throw new Error("Future sample raw hash changed")
	const protocol = parseProtocol(JSON.parse(protocolRaw.toString("utf8")) as unknown)
	const source = sourceForCase(protocol, JSON.parse(sampleRaw.toString("utf8")) as unknown, caseId)
	const expectedOutput = resolve(projectRoot, protocol.outputDirectory, "candidate", `${caseId}.json`)
	if (resolve(outputArgument) !== expectedOutput) throw new Error("Candidate output path is not protocol-bound")
	await verifyClosure(protocol.candidate.closure)
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
	await writeExclusiveAtomicJson(expectedOutput, {
		schemaVersion: 1,
		method: "candidate",
		protocolId: protocol.protocolId,
		candidateVersion: EXPECTED_CANDIDATE_VERSION,
		frozenImplementationHash: EXPECTED_CANDIDATE_HASH,
		candidateFreezeId: EXPECTED_FREEZE_ID,
		candidateClosureSha256: protocol.candidate.closure.sha256,
		futureSampleManifestId: EXPECTED_FUTURE_MANIFEST_ID,
		futureSampleSealCommitment: EXPECTED_FUTURE_SEAL,
		source,
		dimensions: { width: image.width, height: image.height },
		extraction,
		presentation,
		presentationSha256: sha256(canonicalJson(presentation)),
		scientificSha256: sha256(canonicalJson(extraction)),
		runtime: { wallMs, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system },
	})
	process.stdout.write(`${caseId} candidate ${image.width}x${image.height} ${wallMs.toFixed(1)}ms\n`)
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
