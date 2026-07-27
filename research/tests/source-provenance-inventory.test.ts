import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	artworkIdFromSourcePath,
	buildSourceProvenanceInventory,
	compareSourceVariants,
	createSourceProvenanceImplementation,
	parseSourceProvenanceInventory,
	SOURCE_PROVENANCE_IMPLEMENTATION_FILES,
	sourceProvenanceInventoryId,
	sourceVariantFromBytes,
	type SourceProvenanceImplementation,
	type SourceProvenanceInventory,
	type SourceProvenanceInventoryIdentity,
	type SourceVariant,
} from "../src/source-provenance-inventory.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

function implementation(): SourceProvenanceImplementation {
	return createSourceProvenanceImplementation(SOURCE_PROVENANCE_IMPLEMENTATION_FILES.map((path, index) => ({
		path,
		sha256: String(index + 1).repeat(64),
	})))
}

function jpeg(marker: number): Buffer {
	return Buffer.from([0xff, 0xd8, marker, 0xff, 0xd9])
}

function spotifyPath(root: string, prefix: "0000b273" | "00001e02", artworkId: string, extension = ""): string {
	return `${root}/ab67616d${prefix}${artworkId}${extension}`
}

function family(inventory: SourceProvenanceInventory, artworkId: string) {
	const result = inventory.families.find((candidate) => candidate.artworkId === artworkId)
	assert.ok(result)
	return result
}

test("extracts stable artwork identity and applies prefix-first source preference", () => {
	const artworkId = "0010da2732248f519c60d357"
	const b273 = sourceVariantFromBytes(spotifyPath("10", "0000b273", artworkId), jpeg(1))
	const oneE02 = sourceVariantFromBytes(spotifyPath("10", "00001e02", artworkId), jpeg(2))
	const other = sourceVariantFromBytes(`10/zz-${artworkId}`, jpeg(3))
	assert.equal(artworkIdFromSourcePath(`00/ab67616d0000b273${artworkId}.jpg`), artworkId)
	assert.equal(artworkIdFromSourcePath(b273.path), artworkIdFromSourcePath(oneE02.path))
	assert.deepEqual([other, oneE02, b273].sort(compareSourceVariants).map((source) => source.path),
		[b273.path, oneE02.path, other.path])
})

test("retains every artwork variant while marking one preferred source", () => {
	const artworkId = "0010aaaaaaaaaaaaaaaaaaaa"
	const variants = [
		sourceVariantFromBytes(spotifyPath("10", "00001e02", artworkId), jpeg(1)),
		sourceVariantFromBytes(spotifyPath("10", "0000b273", artworkId), jpeg(2)),
	]
	const inventory = buildSourceProvenanceInventory(variants, implementation())
	const grouped = family(inventory, artworkId)
	assert.equal(grouped.variants.length, 2)
	assert.equal(grouped.preferredSourcePath, variants[1].path)
	assert.deepEqual(new Set(grouped.variants.map((variant) => variant.path)), new Set(variants.map((variant) => variant.path)))
	assert.equal(grouped.reserve?.provenanceState, "source-inventoried/output-unseen")
})

test("checks only raw JPEG start and end signatures for extensionless sources", () => {
	const path = spotifyPath("10", "0000b273", "0010bbbbbbbbbbbbbbbbbbbb")
	const valid = sourceVariantFromBytes(path, jpeg(7))
	const missingEnd = sourceVariantFromBytes(spotifyPath("10", "0000b273", "0010cccccccccccccccccccc"),
		Buffer.from([0xff, 0xd8, 0x00]))
	assert.deepEqual(valid.jpegSignatures, { startsWithSoi: true, endsWithEoi: true })
	assert.deepEqual(missingEnd.jpegSignatures, { startsWithSoi: true, endsWithEoi: false })
	assert.equal(valid.path.includes("."), false)
})

test("assigns prior and internal raw-byte ownership and enforces eligibility", () => {
	const sharedPriorBytes = jpeg(1)
	const sharedReserveBytes = jpeg(2)
	const firstId = "0010aaaaaaaaaaaaaaaaaaaa"
	const secondId = "0014bbbbbbbbbbbbbbbbbbbb"
	const ownerId = "0010cccccccccccccccccccc"
	const nonOwnerId = "0014dddddddddddddddddddd"
	const variants = [
		sourceVariantFromBytes(spotifyPath("00", "0000b273", "0000eeeeeeeeeeeeeeeeeeee", ".jpg"), sharedPriorBytes),
		sourceVariantFromBytes(spotifyPath("10", "0000b273", firstId), sharedPriorBytes),
		sourceVariantFromBytes(spotifyPath("14", "0000b273", secondId), sharedPriorBytes),
		sourceVariantFromBytes(spotifyPath("10", "0000b273", ownerId), sharedReserveBytes),
		sourceVariantFromBytes(spotifyPath("14", "0000b273", nonOwnerId), sharedReserveBytes),
	]
	const inventory = buildSourceProvenanceInventory(variants, implementation())
	const priorGroup = inventory.rawSha256Groups.find((group) => group.priorContentPaths.length > 0)
	assert.ok(priorGroup)
	assert.equal(priorGroup.priorContentOwnerPath, variants[0].path)
	assert.equal(priorGroup.reserveContentOwnerArtworkId, firstId)
	assert.equal(family(inventory, firstId).reserve?.futureValidationEligible, false)
	assert.equal(family(inventory, secondId).reserve?.futureValidationEligible, false)
	const internalGroup = inventory.rawSha256Groups.find((group) => group.sha256 !== priorGroup.sha256)
	assert.equal(internalGroup?.reserveContentOwnerArtworkId, ownerId)
	assert.equal(family(inventory, ownerId).reserve?.futureValidationEligible, true)
	assert.deepEqual(family(inventory, nonOwnerId).reserve?.exclusionReasons,
		["reserve-content-owned-by-lexical-artwork"])
})

test("orders content deterministically and derives identity independently of input order", () => {
	const variants: SourceVariant[] = [
		sourceVariantFromBytes(spotifyPath("14", "00001e02", "0014bbbbbbbbbbbbbbbbbbbb"), jpeg(2)),
		sourceVariantFromBytes(spotifyPath("10", "0000b273", "0010aaaaaaaaaaaaaaaaaaaa"), jpeg(1)),
	]
	const first = buildSourceProvenanceInventory(variants, implementation())
	const second = buildSourceProvenanceInventory([...variants].reverse(), implementation())
	assert.deepEqual(first, second)
	assert.deepEqual(first.families.map((entry) => entry.artworkId),
		["0010aaaaaaaaaaaaaaaaaaaa", "0014bbbbbbbbbbbbbbbbbbbb"])
	assert.equal(first.inventoryId, second.inventoryId)
	assert.equal("generatedAt" in first, false)
})

test("strict parsing rejects stale identities, recomputed derived tampering, and extra fields", () => {
	const inventory = buildSourceProvenanceInventory([
		sourceVariantFromBytes(spotifyPath("10", "0000b273", "0010aaaaaaaaaaaaaaaaaaaa"), jpeg(1)),
	], implementation())
	assert.deepEqual(parseSourceProvenanceInventory(structuredClone(inventory)), inventory)

	const stale = structuredClone(inventory)
	stale.summary.reserve.rawFiles++
	assert.throws(() => parseSourceProvenanceInventory(stale), /identity is stale/)

	const derived = structuredClone(inventory)
	derived.families[0].preferredSourcePath = "10/not-the-preferred-source"
	const { inventoryId: _inventoryId, ...identity } = derived
	derived.inventoryId = sourceProvenanceInventoryId(identity as SourceProvenanceInventoryIdentity)
	assert.throws(() => parseSourceProvenanceInventory(derived), /derived provenance is invalid/)

	const extra = structuredClone(inventory) as SourceProvenanceInventory & { unexpected: boolean }
	extra.unexpected = true
	assert.throws(() => parseSourceProvenanceInventory(extra), /unexpected keys/)
})

test("checked-in 00-14 inventory has the independently observed reserve summary", async () => {
	const source = await readFile(`${projectRoot}/research/data/source-provenance-inventory-00-14.json`, "utf8")
	const inventory = parseSourceProvenanceInventory(JSON.parse(source) as unknown)
	assert.deepEqual(inventory.summary.reserve, {
		rawFiles: 1835,
		artworkFamilies: 1680,
		uniqueHashes: 1834,
		extensionlessFiles: 1835,
		jpegSignaturePasses: 1835,
		jpegSignatureFailures: 0,
		futureValidationEligibleFamilies: 1676,
		priorOverlappingHashes: 3,
		priorOverlappingFamilies: 4,
		internalDuplicateHashes: 1,
		internalDuplicateFamilies: 2,
		artworkIdOverlapWithPrior: 0,
		artworkIdOverlapBetweenReserveRoots: 0,
	})
	assert.deepEqual(inventory.summary.roots.filter((root) => /^1[0-4]$/.test(root.path)).map((root) => ({
		path: root.path,
		rawFiles: root.rawFiles,
		artworkFamilies: root.artworkFamilies,
	})), [
		{ path: "10", rawFiles: 326, artworkFamilies: 300 },
		{ path: "11", rawFiles: 359, artworkFamilies: 325 },
		{ path: "12", rawFiles: 420, artworkFamilies: 383 },
		{ path: "13", rawFiles: 378, artworkFamilies: 345 },
		{ path: "14", rawFiles: 352, artworkFamilies: 327 },
	])
	const internal = inventory.rawSha256Groups.filter((group) => group.reserveArtworkIds.length > 1)
	assert.equal(internal.length, 1)
	assert.ok(internal[0].priorContentOwnerPath)
	assert.deepEqual([...new Set(internal[0].reservePaths.map((path) => path.slice(0, 2)))], ["10", "14"])
})
