import { lstat, readFile, realpath } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget, writeJsonAtomic, type OutputTarget } from "./src/candidate-output.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS,
	buildAlbumArtworkPaletteV2FutureSample,
	futureSampleSha256,
	verifyAlbumArtworkPaletteV2FutureSample,
	type FutureSampleBuildInput,
} from "./src/album-artwork-palette-v2-future-sample.ts"
import { parseSourceProvenanceInventory } from "./src/source-provenance-inventory.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

type MetadataSource = Readonly<{
	bytes: Buffer
	value: unknown
	rawSha256: string
}>

async function readPhysicalMetadata(relativePath: string): Promise<MetadataSource> {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const projectRelative = relative(projectRoot, path)
	if (projectRelative === ".." || projectRelative.startsWith(`..${sep}`)) {
		throw new Error(`Metadata path escapes the project: ${relativePath}`)
	}
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Metadata input must be a physical file: ${relativePath}`)
	}
	const bytes = await readFile(path)
	return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown, rawSha256: futureSampleSha256(bytes) }
}

async function readPhysicalDocument(relativePath: string): Promise<Buffer> {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Protocol document must be a physical file: ${relativePath}`)
	}
	return readFile(path)
}

async function boundInputs(): Promise<FutureSampleBuildInput> {
	const [inventorySource, developmentPanel, openedFreshSeal, openedPhase4Protocol, protocolDocument] = await Promise.all([
		readPhysicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory),
		readPhysicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.developmentPanel),
		readPhysicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal),
		readPhysicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedPhase4Protocol),
		readPhysicalDocument(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.protocolDocument),
	])
	return {
		inventory: parseSourceProvenanceInventory(inventorySource.value),
		inventoryRawSha256: inventorySource.rawSha256,
		protocolDocumentRawSha256: futureSampleSha256(protocolDocument),
		developmentPanel: { value: developmentPanel.value, rawSha256: developmentPanel.rawSha256 },
		openedFreshSeal: { value: openedFreshSeal.value, rawSha256: openedFreshSeal.rawSha256 },
		openedPhase4Protocol: { value: openedPhase4Protocol.value, rawSha256: openedPhase4Protocol.rawSha256 },
	}
}

async function main(): Promise<void> {
	const mode = process.argv[2]
	if (process.argv.length !== 3 || (mode !== "seal" && mode !== "verify")) {
		throw new Error("Usage: node --experimental-strip-types research/prepare-album-artwork-palette-v2-future-sample.ts <seal|verify>")
	}
	const input = await boundInputs()
	const outputPath = resolve(projectRoot, ...ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.sealedSample.split("/"))
	if (mode === "seal") {
		const sample = buildAlbumArtworkPaletteV2FutureSample(input)
		const target: OutputTarget = { path: outputPath, refuseOverwrite: true }
		await prepareOutputTarget(target)
		await writeJsonAtomic(target, sample)
		process.stdout.write(`Future sample sealed: manifest=${sample.manifestId} seal=${sample.sealCommitment}\n`)
		return
	}
	const sealed = await readPhysicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.sealedSample)
	const sample = verifyAlbumArtworkPaletteV2FutureSample(sealed.value, input)
	process.stdout.write(`Future sample verified: manifest=${sample.manifestId} seal=${sample.sealCommitment}\n`)
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
