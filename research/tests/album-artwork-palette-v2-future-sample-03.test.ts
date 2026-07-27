import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS,
	buildAlbumArtworkPaletteV2FutureSample03,
	futureSample03CanonicalJson,
	futureSample03Sha256,
	parseAlbumArtworkPaletteV2FutureSample03,
	verifyAlbumArtworkPaletteV2FutureSample03,
	type FutureSample03BuildInput,
} from "../src/album-artwork-palette-v2-future-sample-03.ts"
import { parseAlbumArtworkPaletteV2FutureSample } from "../src/album-artwork-palette-v2-future-sample.ts"
import { parseSourceProvenanceInventory } from "../src/source-provenance-inventory.ts"

async function metadata(path: string): Promise<{ value: unknown; rawSha256: string }> {
	const bytes = await readFile(new URL(`../../${path}`, import.meta.url))
	return { value: JSON.parse(bytes.toString("utf8")) as unknown, rawSha256: futureSample03Sha256(bytes) }
}

async function inputs(): Promise<FutureSample03BuildInput> {
	const [inventory, consumedSample02, consumptionReceipt02, protocolDocument] = await Promise.all([
		metadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.inventory),
		metadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumedSample02),
		metadata(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumptionReceipt02),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_03_PROTOCOL.md", import.meta.url)),
	])
	return {
		inventory: parseSourceProvenanceInventory(inventory.value),
		inventoryRawSha256: inventory.rawSha256,
		protocolDocumentRawSha256: futureSample03Sha256(protocolDocument),
		consumedSample02,
		consumptionReceipt02,
	}
}

function keys(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	if (Array.isArray(value)) return value.flatMap(keys)
	return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)])
}

test("future sample 03 deterministically seals independent root-11 families", async () => {
	const input = await inputs()
	const first = buildAlbumArtworkPaletteV2FutureSample03(input)
	const second = buildAlbumArtworkPaletteV2FutureSample03(input)
	assert.deepEqual(first, second)
	assert.equal(first.families.length, 12)
	assert.equal(first.selection.root, "11")
	assert.deepEqual(first.selection.preservedReserveRoots, ["12", "13", "14"])
	assert.ok(first.families.every((family) => family.preferredSourcePath.startsWith("11/") &&
		family.variants.every(({ path }) => path.startsWith("11/"))))
	assert.ok(first.families.every((family) => {
		const source = input.inventory.families.find(({ artworkId }) => artworkId === family.artworkId)
		return source?.reserve?.futureValidationEligible === true && source.reserve.roots.length === 1 && source.reserve.roots[0] === "11"
	}))
	assert.deepEqual(parseAlbumArtworkPaletteV2FutureSample03(structuredClone(first)), first)
})

test("future sample 03 binds consumed sample 02 without result-dependent selection", async () => {
	const input = await inputs()
	const sample = buildAlbumArtworkPaletteV2FutureSample03(input)
	const consumed = parseAlbumArtworkPaletteV2FutureSample(input.consumedSample02.value)
	const consumedArtwork = new Set(consumed.families.map(({ artworkId }) => artworkId))
	const consumedHashes = new Set(consumed.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)))
	assert.ok(sample.families.every((family) => !consumedArtwork.has(family.artworkId) &&
		family.variants.every(({ sha256 }) => !consumedHashes.has(sha256))))
	assert.equal(sample.exclusions.consumptionReceipt02.futureSampleConsumed, true)
	assert.equal(sample.exclusions.consumptionReceipt02.sourceCount, 12)
	assert.equal(sample.exclusions.consumedSample02.manifestId, consumed.manifestId)
	assert.equal(sample.exclusions.consumedSample02.sealCommitment, consumed.sealCommitment)
	const forbidden = new Set(["candidateVersion", "palette", "quality", "comparison", "comment", "dimensions", "timestamp"])
	assert.ok(keys(sample).every((key) => !forbidden.has(key)))
	assert.doesNotMatch(futureSample03CanonicalJson(sample), /candidateOutput|baselineOutput|phase-4-analysis|feedback/)
})

test("future sample 03 strict parsing and full verification reject stale data", async () => {
	const input = await inputs()
	const sample = buildAlbumArtworkPaletteV2FutureSample03(input)
	assert.deepEqual(verifyAlbumArtworkPaletteV2FutureSample03(structuredClone(sample), input), sample)
	const stale = structuredClone(sample) as unknown as { families: Array<{ variants: Array<{ byteCount: number }> }> }
	stale.families[0].variants[0].byteCount += 1
	assert.throws(() => parseAlbumArtworkPaletteV2FutureSample03(stale), /commitment is stale/)
	const extra = { ...structuredClone(sample), candidateVersion: "forbidden" }
	assert.throws(() => parseAlbumArtworkPaletteV2FutureSample03(extra), /unexpected keys/)
	assert.throws(() => verifyAlbumArtworkPaletteV2FutureSample03(sample, {
		...input,
		protocolDocumentRawSha256: "0".repeat(64),
	}), /does not match/)
})

test("future sample 03 sealer has a closed metadata-only static surface", async () => {
	const [moduleSource, sealerSource] = await Promise.all([
		readFile(new URL("../src/album-artwork-palette-v2-future-sample-03.ts", import.meta.url), "utf8"),
		readFile(new URL("../prepare-album-artwork-palette-v2-future-sample-03.ts", import.meta.url), "utf8"),
	])
	assert.doesNotMatch(moduleSource, /node:fs|sharp|extractPalette|loadImage|readdir|opendir/)
	assert.doesNotMatch(sealerSource, /sharp|extractPalette|loadImage|readdir|opendir|glob/)
	assert.match(sealerSource, /parseSourceProvenanceInventory/)
	assert.match(sealerSource, /writeJsonAtomic/)
	assert.match(sealerSource, /refuseOverwrite: true/)
	assert.doesNotMatch(sealerSource, /families\.map|family\.artworkId|preferredSourcePath/)
})
