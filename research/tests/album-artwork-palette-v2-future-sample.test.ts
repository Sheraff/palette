import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { prepareOutputTarget, writeJsonAtomic } from "../src/candidate-output.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS,
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN,
	buildAlbumArtworkPaletteV2FutureSample,
	futureSampleCanonicalJson,
	futureSampleSha256,
	parseAlbumArtworkPaletteV2FutureSample,
	verifyAlbumArtworkPaletteV2FutureSample,
	type FutureSampleBuildInput,
} from "../src/album-artwork-palette-v2-future-sample.ts"
import { parseSourceProvenanceInventory } from "../src/source-provenance-inventory.ts"

async function source(path: string): Promise<{ value: unknown; rawSha256: string }> {
	const bytes = await readFile(new URL(`../../${path}`, import.meta.url))
	return { value: JSON.parse(bytes.toString("utf8")) as unknown, rawSha256: futureSampleSha256(bytes) }
}

async function inputs(): Promise<FutureSampleBuildInput> {
	const [inventory, developmentPanel, openedFreshSeal, openedPhase4Protocol, protocolDocument] = await Promise.all([
		source(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory),
		source(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.developmentPanel),
		source(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal),
		source(ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedPhase4Protocol),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_02_PROTOCOL.md", import.meta.url)),
	])
	return {
		inventory: parseSourceProvenanceInventory(inventory.value),
		inventoryRawSha256: inventory.rawSha256,
		protocolDocumentRawSha256: futureSampleSha256(protocolDocument),
		developmentPanel,
		openedFreshSeal,
		openedPhase4Protocol,
	}
}

function exposedIdentities(input: FutureSampleBuildInput): { artworkIds: Set<string>; hashes: Set<string> } {
	const values = [input.developmentPanel.value, input.openedFreshSeal.value] as Array<{
		sources: Array<{ artworkId: string; sha256: string }>
	}>
	return {
		artworkIds: new Set(values.flatMap(({ sources }) => sources.map(({ artworkId }) => artworkId))),
		hashes: new Set(values.flatMap(({ sources }) => sources.map(({ sha256 }) => sha256))),
	}
}

function keys(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	if (Array.isArray(value)) return value.flatMap(keys)
	return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)])
}

test("builds a deterministic candidate-independent metadata-only root-10 family seal", async () => {
	const input = await inputs()
	const first = buildAlbumArtworkPaletteV2FutureSample(input)
	const second = buildAlbumArtworkPaletteV2FutureSample(input)
	assert.deepEqual(first, second)
	assert.equal(first.families.length, 12)
	assert.equal(first.selection.domain, ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN)
	assert.deepEqual(first.selection.preservedReserveRoots, ["11", "12", "13", "14"])
	assert.ok(first.families.every((family) => family.preferredSourcePath.startsWith("10/") &&
		family.variants.every(({ path }) => path.startsWith("10/"))))
	assert.ok(first.families.every((family) => {
		const inventoryFamily = input.inventory.families.find(({ artworkId }) => artworkId === family.artworkId)
		return inventoryFamily?.reserve?.futureValidationEligible === true &&
			inventoryFamily.reserve.roots.length === 1 && inventoryFamily.reserve.roots[0] === "10"
	}))
	const forbidden = new Set(["timestamp", "outputOpened", "candidateOutputOpened", "dimensions", "colors"])
	assert.ok(keys(first).every((key) => !forbidden.has(key)))
	assert.doesNotMatch(futureSampleCanonicalJson(first), /candidateVersion|candidateOutput|baselineOutput|paletteOutput/)
	assert.deepEqual(parseAlbumArtworkPaletteV2FutureSample(structuredClone(first)), first)
})

test("excludes all exposed identities, binds broad prior development, and isolates preserved roots", async () => {
	const input = await inputs()
	const sample = buildAlbumArtworkPaletteV2FutureSample(input)
	const exposed = exposedIdentities(input)
	assert.ok(sample.families.every((family) => !exposed.artworkIds.has(family.artworkId) &&
		family.variants.every(({ sha256 }) => !exposed.hashes.has(sha256))))
	assert.deepEqual(sample.exclusions.broadPriorDevelopment.roots,
		["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f"])
	assert.ok(sample.exclusions.broadPriorDevelopment.artworkIdCount > sample.exclusions.exposedV2.artworkIdCount)
	for (const family of sample.families) {
		for (const variant of family.variants) {
			const group = input.inventory.rawSha256Groups.find(({ sha256 }) => sha256 === variant.sha256)
			assert.ok(group)
			assert.deepEqual(group.reserveArtworkIds, [family.artworkId])
			assert.equal(group.priorContentPaths.length, 0)
			assert.ok(group.reservePaths.every((path) => path.startsWith("10/")))
		}
	}
	assert.deepEqual(sample.exclusions.artifacts.map(({ semanticIds }) => semanticIds.map(({ name }) => name)), [
		["manifestId"],
		["manifestId", "sealCommitment"],
		["protocolId"],
	])
})

test("strict parsing and full verification reject stale or extra data", async () => {
	const input = await inputs()
	const sample = buildAlbumArtworkPaletteV2FutureSample(input)
	assert.deepEqual(verifyAlbumArtworkPaletteV2FutureSample(structuredClone(sample), input), sample)
	const stale = structuredClone(sample) as unknown as {
		families: Array<{ variants: Array<{ byteCount: number }> }>
	}
	stale.families[0].variants[0].byteCount++
	assert.throws(() => parseAlbumArtworkPaletteV2FutureSample(stale), /commitment is stale/)
	const extra = structuredClone(sample) as typeof sample & { generatedAt: string }
	extra.generatedAt = "not-allowed"
	assert.throws(() => parseAlbumArtworkPaletteV2FutureSample(extra), /unexpected keys/)
	const wrongInput = { ...input, protocolDocumentRawSha256: "0".repeat(64) }
	assert.throws(() => verifyAlbumArtworkPaletteV2FutureSample(sample, wrongInput), /does not match/)
})

test("exclusive atomic publication cannot replace an existing seal", async () => {
	const directory = await mkdtemp(join(tmpdir(), "future-sample-seal-"))
	try {
		const path = join(directory, "sample.sealed.json")
		const target = { path, refuseOverwrite: true }
		await prepareOutputTarget(target)
		await writeJsonAtomic(target, { first: true })
		await assert.rejects(writeJsonAtomic(target, { first: false }), /Refusing to overwrite/)
		assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { first: true })
		await writeFile(join(directory, "control"), "unchanged")
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("sealer and pure module have a closed metadata-only static surface", async () => {
	const [moduleSource, sealerSource] = await Promise.all([
		readFile(new URL("../src/album-artwork-palette-v2-future-sample.ts", import.meta.url), "utf8"),
		readFile(new URL("../prepare-album-artwork-palette-v2-future-sample.ts", import.meta.url), "utf8"),
	])
	assert.doesNotMatch(moduleSource, /node:fs|sharp|extractPalette|loadImage|readdir|opendir/)
	assert.doesNotMatch(sealerSource, /sharp|extractPalette|loadImage|readdir|opendir|glob/)
	assert.match(sealerSource, /parseSourceProvenanceInventory/)
	assert.match(sealerSource, /writeJsonAtomic/)
	assert.match(sealerSource, /refuseOverwrite: true/)
	assert.match(sealerSource, /mode !== "seal" && mode !== "verify"/)
	assert.doesNotMatch(sealerSource, /families\.map|family\.artworkId|preferredSourcePath/)
})
