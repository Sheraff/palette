import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { extractAlbumArtworkPaletteV2 } from "./src/album-artwork-palette-v2.ts"
import { parseAlbumArtworkPaletteV2FutureSample03 } from "./src/album-artwork-palette-v2-future-sample-03.ts"
import { parseAlbumArtworkPaletteV2FutureSample } from "./src/album-artwork-palette-v2-future-sample.ts"
import { namePalette } from "./src/color-name.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

type DevelopmentManifest = Readonly<{
	manifestId: string
	sources: readonly SourceRecord[]
}>

type FreshManifest = Readonly<{
	manifestId: string
	candidateOutputOpened: false
	sources: ReadonlyArray<Readonly<{ sha256: string }>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const OPENED_FRESH_MANIFEST_ID = "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91"
const FUTURE_SAMPLE_02_MANIFEST_ID = "9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671"
const FUTURE_SAMPLE_03_MANIFEST_ID = "bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060"

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function presentationFor(treatment: ReturnType<typeof extractAlbumArtworkPaletteV2>["winner"]) {
	const names = namePalette([
		treatment.background.rgb,
		treatment.surface.rgb,
		treatment.foreground.rgb,
		treatment.accent.rgb,
	])
	return {
		treatmentId: treatment.id,
		roles: {
			background: names[0],
			surface: names[1],
			foreground: names[2],
			accent: names[3],
		},
	}
}

async function main(): Promise<void> {
	const [developmentPath, openedFreshPath, futureSample02Path, futureSample03Path, outputPath, caseId, implementationHash] = process.argv.slice(2)
	if (!developmentPath || !openedFreshPath || !futureSample02Path || !futureSample03Path || !outputPath || !caseId ||
		!/^[a-f0-9]{64}$/.test(implementationHash ?? "")) {
		throw new Error("Usage: child <development-manifest> <opened-fresh-seal> <future-02-seal> <future-03-seal> <output> <case-id> <implementation-hash>")
	}
	const [development, openedFresh, futureSample02Value, futureSample03Value] = await Promise.all([
		readFile(developmentPath, "utf8").then((value) => JSON.parse(value) as DevelopmentManifest),
		readFile(openedFreshPath, "utf8").then((value) => JSON.parse(value) as FreshManifest),
		readFile(futureSample02Path, "utf8").then((value) => JSON.parse(value) as unknown),
		readFile(futureSample03Path, "utf8").then((value) => JSON.parse(value) as unknown),
	])
	if (openedFresh.candidateOutputOpened !== false) throw new Error("Opened fresh-sample seal-time state is invalid")
	const futureSample02 = parseAlbumArtworkPaletteV2FutureSample(futureSample02Value)
	const futureSample03 = parseAlbumArtworkPaletteV2FutureSample03(futureSample03Value)
	if (openedFresh.manifestId !== OPENED_FRESH_MANIFEST_ID || futureSample02.manifestId !== FUTURE_SAMPLE_02_MANIFEST_ID ||
		futureSample03.manifestId !== FUTURE_SAMPLE_03_MANIFEST_ID) throw new Error("Protected sample manifest binding is invalid")
	const source = development.sources.find((candidate) => candidate.caseId === caseId)
	if (!source) throw new Error(`Unknown development case ${caseId}`)
	const protectedHashes = new Set([
		...openedFresh.sources.map(({ sha256 }) => sha256),
		...futureSample02.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
		...futureSample03.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
	])
	if (protectedHashes.has(source.sha256)) {
		throw new Error(`Development source ${caseId} overlaps a protected directional sample`)
	}
	if (source.path.startsWith("/") || source.path.split("/").includes("..")) throw new Error(`Unsafe source path ${source.path}`)
	const sourcePath = resolve(projectRoot, source.path)
	if (!sourcePath.startsWith(`${projectRoot}/`)) throw new Error(`Source escaped project root: ${source.path}`)
	const bytes = await readFile(sourcePath)
	if (bytes.byteLength !== source.byteCount || sha256(bytes) !== source.sha256) {
		throw new Error(`Source custody mismatch for ${caseId}`)
	}

	const cpuStart = process.cpuUsage()
	const wallStart = performance.now()
	const image = await loadNativeImage(bytes)
	const extraction = extractAlbumArtworkPaletteV2(image)
	const wallMs = performance.now() - wallStart
	const cpu = process.cpuUsage(cpuStart)
	const presentations = extraction.alternatives.map(presentationFor)
	const scientificSha256 = sha256(JSON.stringify({ extraction, presentations }))
	const artifact = {
		schemaVersion: 1,
		implementationHash,
		developmentManifestId: development.manifestId,
		openedFreshSealManifestId: openedFresh.manifestId,
		protectedFutureSampleManifestIds: [futureSample02.manifestId, futureSample03.manifestId],
		source,
		dimensions: { width: image.width, height: image.height },
		extraction,
		presentationPolicy: "colornames-oklab-0.6.0-presentation-only",
		presentations,
		scientificSha256,
		runtime: {
			workerCount: 1,
			wallMs,
			cpuUserMicros: cpu.user,
			cpuSystemMicros: cpu.system,
		},
	}
	await atomicJson(outputPath, artifact)
	process.stdout.write(`${caseId} ${image.width}x${image.height} ${wallMs.toFixed(1)}ms ${extraction.alternatives.length} treatments\n`)
}

await main()
