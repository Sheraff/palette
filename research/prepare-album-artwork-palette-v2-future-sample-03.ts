import { lstat, readFile, realpath } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget, writeJsonAtomic, type OutputTarget } from "./src/candidate-output.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS,
	buildAlbumArtworkPaletteV2FutureSample03,
	futureSample03Sha256,
	verifyAlbumArtworkPaletteV2FutureSample03,
	type FutureSample03BuildInput,
} from "./src/album-artwork-palette-v2-future-sample-03.ts"
import { parseSourceProvenanceInventory } from "./src/source-provenance-inventory.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

async function physicalMetadata(relativePath: string): Promise<{ value: unknown; rawSha256: string }> {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const projectRelative = relative(projectRoot, path)
	if (projectRelative === ".." || projectRelative.startsWith(`..${sep}`)) throw new Error("Metadata path escapes project")
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Metadata input must be a physical file: ${relativePath}`)
	}
	const bytes = await readFile(path)
	return { value: JSON.parse(bytes.toString("utf8")) as unknown, rawSha256: futureSample03Sha256(bytes) }
}

async function physicalDocument(relativePath: string): Promise<Buffer> {
	const path = resolve(projectRoot, ...relativePath.split("/"))
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error(`Protocol document must be a physical file: ${relativePath}`)
	}
	return readFile(path)
}

async function inputs(): Promise<FutureSample03BuildInput> {
	const [inventory, consumedSample02, consumptionReceipt02, protocolDocument] = await Promise.all([
		physicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.inventory),
		physicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumedSample02),
		physicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumptionReceipt02),
		physicalDocument(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.protocolDocument),
	])
	return {
		inventory: parseSourceProvenanceInventory(inventory.value),
		inventoryRawSha256: inventory.rawSha256,
		protocolDocumentRawSha256: futureSample03Sha256(protocolDocument),
		consumedSample02,
		consumptionReceipt02,
	}
}

async function main(): Promise<void> {
	const mode = process.argv[2]
	if (process.argv.length !== 3 || (mode !== "seal" && mode !== "verify")) {
		throw new Error("Usage: prepare-album-artwork-palette-v2-future-sample-03.ts <seal|verify>")
	}
	const input = await inputs()
	const outputPath = resolve(projectRoot, ...ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.sealedSample.split("/"))
	if (mode === "seal") {
		const sample = buildAlbumArtworkPaletteV2FutureSample03(input)
		const target: OutputTarget = { path: outputPath, refuseOverwrite: true }
		await prepareOutputTarget(target)
		await writeJsonAtomic(target, sample)
		process.stdout.write(`Future sample 03 sealed: manifest=${sample.manifestId} seal=${sample.sealCommitment}\n`)
		return
	}
	const sealed = await physicalMetadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.sealedSample)
	const sample = verifyAlbumArtworkPaletteV2FutureSample03(sealed.value, input)
	process.stdout.write(`Future sample 03 verified: manifest=${sample.manifestId} seal=${sample.sealCommitment}\n`)
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
