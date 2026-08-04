/**
 * The standing pair sample: determinism, exclusions, and the reviewed stratum.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/robustness-*.test.ts
 *
 * `CONVENTIONS.md` says seeded draws *should* be golden-compared, and that is what the hermetic
 * tests below do — over fixtures built in a temp directory, so the assertions are exact and do not
 * move when the corpus or the warehouse does. The committed set file is checked for **invariants**
 * only, because its size depends on the corpus and a corpus-size-dependent diagnostic is never
 * golden-compared (`d-2026-08-03-corpus-size-dependent-diagnostics-never-golden-compared`).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { append } from "../src/warehouse/warehouse.ts"
import { makeArtwork, makeOracleLabel } from "../src/warehouse/fixtures.ts"
import {
	PAIR_SET_COSINE_THRESHOLD,
	PAIR_SET_SEED,
	allocate,
	buildPairSet,
	loadExcludedArtworkIds,
	pairIdOf,
	pairReviewednessOf,
	reviewednessOf,
	similarityBand,
} from "../src/robustness/pair-set.ts"
import type { PairSetFile, RenditionEndpoint } from "../src/robustness/types.ts"

const V3_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const ID = (digit: string) => digit.repeat(32)
const HELD_OUT = ID("a")
const QUARANTINED = ID("b")
const GRADED = ID("c")

/** Six artworks, five pairs, one held out, one quarantined, one graded. */
async function writeFixtures(root: string): Promise<{
	censusPath: string
	overlayPath: string
	holdoutPath: string
	warehousePath: string
	embeddingsDir: string
	transparencyPath: string
}> {
	const ids = ["0", "1", "2", "3", "4", "5", "a", "b", "c"].map(ID)
	const pathFor = (id: string) => `music-artworks/${id[0]}/${id[1]}/${id[2]}/${id}.jpg`

	const embeddingsDir = path.join(root, "embeddings")
	await mkdir(embeddingsDir, { recursive: true })
	const files = [
		...ids.map((id) => ({ id, path: pathFor(id), width: 640, height: 640, format: "jpeg" })),
		// A derived, smaller rendition of artwork 0. The canonical choice must be the 640 original.
		{
			id: ID("0"),
			path: `music-artworks/0/0/0/${ID("0")}_147x147.avif`,
			width: 147,
			height: 147,
			format: "avif",
		},
	]
	const rows = files.map((file, index) => ({
		collection: "music_artworks",
		row: index,
		path: file.path,
		sha256: file.id.repeat(2),
		status: "ok",
		width: file.width,
		height: file.height,
		format: file.format,
		bytes: 100_000,
	}))
	await writeFile(
		path.join(embeddingsDir, "music_artworks.dinov2-vitl14.ids.jsonl"),
		`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
	)
	await writeFile(path.join(embeddingsDir, "sharded.dinov2-vitl14.ids.jsonl"), "")

	const pair = (a: string, b: string, cosine: number, aPath = pathFor(a), arms = ["dinov2-vitl14"]) => ({
		cosine,
		found_by_arms: arms,
		a: { path: aPath, artwork_id: `music_artworks:${a}`, collection: "music_artworks" },
		b: { path: pathFor(b), artwork_id: `music_artworks:${b}`, collection: "music_artworks" },
	})
	const censusPath = path.join(root, "census.json")
	await writeFile(
		censusPath,
		JSON.stringify({
			pairs: [
				pair(ID("0"), ID("1"), 0.999), // plain, unseen
				// The SAME artwork pair, scored again on a different rendition file and a second
				// arm. Both records must collapse into one artwork pair.
				pair(ID("0"), ID("1"), 0.962, `music-artworks/0/0/0/${ID("0")}_147x147.avif`, ["pe-core-l14"]),
				pair(ID("2"), ID("3"), 0.97), // plain, unseen
				pair(ID("4"), ID("5"), 0.985), // plain, unseen
				pair(ID("0"), HELD_OUT, 0.999), // must be dropped: held out
				pair(ID("1"), QUARANTINED, 0.999), // must be dropped: quarantined
				pair(ID("2"), GRADED, 0.999), // reviewed stratum
				pair(ID("3"), ID("4"), 0.9), // below threshold, must be dropped
			],
		}),
	)

	const holdoutPath = path.join(root, "holdout.json")
	await writeFile(holdoutPath, JSON.stringify({ artworks: [{ id: HELD_OUT }] }))

	const overlayPath = path.join(root, "overlay.json")
	await writeFile(overlayPath, JSON.stringify({ holdout: { quarantined_artwork_ids: [QUARANTINED] } }))

	const warehousePath = path.join(root, "warehouse.jsonl")
	append(
		warehousePath,
		makeOracleLabel({
			imageId: `${GRADED}|ground`,
			artwork: makeArtwork({ rendition: { artworkId: GRADED } as never }),
		}),
	)

	// Artwork 5 carries real transparency: the contract refuses transparent input, so a pair
	// touching it could never produce a verdict and must not be sampled at all.
	const transparencyPath = path.join(root, "pixel_results.json")
	await writeFile(transparencyPath, JSON.stringify({ real: [{ path: pathFor(ID("5")) }] }))

	return { censusPath, overlayPath, holdoutPath, warehousePath, embeddingsDir, transparencyPath }
}

/**
 * Write the fixtures ONCE and return a builder.
 *
 * Writing them per build would be wrong in a way worth naming: the warehouse is append-only, so a
 * second `writeFixtures` appends a second grade and moves the very input hash the set file pins.
 * The determinism claim is "same inputs, same draw", and the test has to hold the inputs still to
 * make it.
 */
async function setupFixtures(root: string): Promise<(targetSize?: number) => Promise<PairSetFile>> {
	const inputs = await writeFixtures(root)
	return async (targetSize = 4) =>
		await buildPairSet({ repoRoot: root, ...inputs, targetSize, now: () => "2026-08-04T00:00:00.000Z" })
}

async function buildFixtureSet(root: string, targetSize = 4): Promise<PairSetFile> {
	return await (await setupFixtures(root))(targetSize)
}

test("the seeded draw is byte-identical across runs", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const build = await setupFixtures(root)
	const first = await build()
	const second = await build()
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.equal(first.seed, PAIR_SET_SEED)
	assert.equal(first.seedHex, "0x57ab1e")
})

test("a draw at a larger target size still contains the smaller draw's reviewed pairs", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-monotone-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const build = await setupFixtures(root)
	const small = await build(1)
	const large = await build(10)
	const largeIds = new Set(large.pairs.map((p) => p.pairId))
	for (const pair of small.pairs.filter((p) => p.reviewedness === "reviewed")) {
		assert.ok(largeIds.has(pair.pairId), "the exhaustive reviewed stratum must be stable across sizes")
	}
})

test("the draw is golden — these exact pairs, in this exact order", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-golden-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 4)
	assert.deepEqual(
		set.pairs.map((p) => p.pairId),
		[`${ID("0")}~${ID("1")}`, `${ID("2")}~${ID("3")}`, `${ID("2")}~${GRADED}`],
	)
})

test("an artwork with real transparency is never sampled", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-transparent-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 10)
	// The contract refuses transparent input, so such a pair could only ever produce an error.
	for (const pair of set.pairs) {
		assert.notEqual(pair.a.artworkId, ID("5"))
		assert.notEqual(pair.b.artworkId, ID("5"))
	}
	assert.equal(set.counts.droppedRealTransparency > 0, true)
})

test("held-out and quarantined artworks never appear", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-holdout-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 10)
	for (const pair of set.pairs) {
		for (const id of [pair.a.artworkId, pair.b.artworkId]) {
			assert.notEqual(id, HELD_OUT, "a held-out artwork reached the sample")
			assert.notEqual(id, QUARANTINED, "a quarantined artwork reached the sample")
		}
	}
	assert.equal(set.counts.excludedArtworks, 2)
})

test("pairs below the cosine threshold are not eligible", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-threshold-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 10)
	assert.equal(set.counts.censusPairs, 8)
	assert.equal(set.counts.atThreshold, 7, "the 0.9 pair is below 0.95")
	for (const pair of set.pairs) assert.ok(pair.cosine >= PAIR_SET_COSINE_THRESHOLD)
})

test("file-level census records collapse onto one artwork pair", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-collapse-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 10)

	const ids = set.pairs.map((p) => p.pairId)
	assert.equal(new Set(ids).size, ids.length, "an artwork pair must appear at most once")
	assert.equal(set.counts.fileLevelPairsAfterHoldoutExclusion, 4)
	assert.equal(set.counts.eligibleAfterHoldoutExclusion, 3, "two records collapsed into one pair")

	const collapsed = set.pairs.find((p) => p.pairId === `${ID("0")}~${ID("1")}`)!
	assert.equal(collapsed.renditionPairsInCensus, 2)
	assert.equal(collapsed.cosine, 0.999, "the strongest census score for the artwork pair")
	assert.deepEqual([...collapsed.foundByArms], ["dinov2-vitl14", "pe-core-l14"], "arms are unioned")
})

test("each endpoint is the artwork's canonical rendition, not the file the census scored", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-canonical-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root, 10)
	const collapsed = set.pairs.find((p) => p.pairId === `${ID("0")}~${ID("1")}`)!
	// Artwork 0 has a 640 jpeg and a derived 147 avif; the 640 original must win.
	assert.equal(collapsed.a.path, `music-artworks/0/0/0/${ID("0")}.jpg`)
	assert.equal(collapsed.a.width, 640)
	assert.equal(collapsed.a.format, "jpeg")
})

test("the reviewed stratum is taken whole, never sampled", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-reviewed-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	// A target size smaller than the eligible population still keeps every reviewed pair.
	const set = await buildFixtureSet(root, 1)
	const reviewed = set.pairs.filter((p) => p.reviewedness === "reviewed")
	assert.equal(reviewed.length, 1)
	assert.equal(reviewed[0]!.pairId, `${ID("2")}~${GRADED}`)
	assert.equal(reviewed[0]!.pairReviewedness, "one-reviewed")
	const stratum = set.strata.find((s) => s.stratum === "reviewed")!
	assert.equal(stratum.exhaustive, true)
	assert.equal(stratum.drawn, stratum.population)
})

test("the set file records provenance for every input it read", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-provenance-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const set = await buildFixtureSet(root)
	for (const key of ["census", "censusHoldoutOverlay", "holdout", "warehouse"]) {
		const source = set.sources[key]
		assert.ok(source, `missing provenance for ${key}`)
		assert.match(source.sha256, /^[0-9a-f]{64}$/)
	}
	assert.equal(set.criterion.holdoutExcluded, true)
	assert.match(set.criterion.reviewednessDefinition, /oracle-label/)
})

test("pair ids do not depend on which endpoint is called a or b", () => {
	assert.equal(pairIdOf("zzz", "aaa"), pairIdOf("aaa", "zzz"))
	assert.equal(pairIdOf("aaa", "zzz"), "aaa~zzz")
})

test("pair reviewedness collapses to the reported axis correctly", () => {
	const endpoint = (reviewed: boolean) => ({ reviewed }) as RenditionEndpoint
	assert.equal(pairReviewednessOf(endpoint(true), endpoint(true)), "both-reviewed")
	assert.equal(pairReviewednessOf(endpoint(true), endpoint(false)), "one-reviewed")
	assert.equal(pairReviewednessOf(endpoint(false), endpoint(false)), "neither-reviewed")
	assert.equal(reviewednessOf("both-reviewed"), "reviewed")
	assert.equal(reviewednessOf("one-reviewed"), "reviewed")
	assert.equal(reviewednessOf("neither-reviewed"), "unseen")
})

test("similarity bands partition the eligible range", () => {
	assert.equal(similarityBand(0.95), "0.95-0.98")
	assert.equal(similarityBand(0.98), "0.95-0.98")
	assert.equal(similarityBand(0.9801), "0.98-0.995")
	assert.equal(similarityBand(0.995), "0.98-0.995")
	assert.equal(similarityBand(1), "0.995-1.0")
})

test("allocation is proportional, capped by population, and deterministic", () => {
	const cells = [
		{ key: "a", population: 100 },
		{ key: "b", population: 50 },
		{ key: "c", population: 3 },
	]
	const first = allocate(cells, 30)
	const second = allocate(cells, 30)
	assert.deepEqual([...first.entries()], [...second.entries()])
	assert.equal([...first.values()].reduce((sum, n) => sum + n, 0), 30)
	for (const cell of cells) assert.ok(first.get(cell.key)! <= cell.population)
	assert.ok(first.get("a")! > first.get("b")!, "the larger stratum takes more")
})

test("allocation cannot exceed the total population, and handles empty input", () => {
	const cells = [
		{ key: "a", population: 2 },
		{ key: "b", population: 1 },
	]
	const all = allocate(cells, 99)
	assert.equal([...all.values()].reduce((sum, n) => sum + n, 0), 3)
	assert.equal([...allocate([], 10).values()].length, 0)
	assert.equal([...allocate(cells, 0).values()].reduce((sum, n) => sum + n, 0), 0)
})

test("excluded ids are the holdout plus the overlay's quarantine", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-pairs-excl-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const inputs = await writeFixtures(root)
	const excluded = await loadExcludedArtworkIds(inputs.holdoutPath, inputs.overlayPath)
	assert.deepEqual([...excluded].sort(), [HELD_OUT, QUARANTINED].sort())
})

// ---------------------------------------------------------------------------
// The committed set file: invariants only, never a golden.
// ---------------------------------------------------------------------------

test("the committed pair set holds its invariants", async () => {
	const committed = JSON.parse(
		await readFile(path.join(V3_ROOT, "data/robustness/pair-set-1.json"), "utf8"),
	) as PairSetFile
	assert.equal(committed.seed, PAIR_SET_SEED)
	assert.equal(committed.criterion.cosineThreshold, PAIR_SET_COSINE_THRESHOLD)

	const ids = committed.pairs.map((p) => p.pairId)
	assert.equal(new Set(ids).size, ids.length, "pair ids must be unique")
	assert.deepEqual(ids, [...ids].sort(), "pairs must be in canonical order")

	for (const pair of committed.pairs) {
		assert.notEqual(pair.a.artworkId, pair.b.artworkId, "every pair must be cross-id")
		assert.ok(pair.cosine >= PAIR_SET_COSINE_THRESHOLD)
		assert.equal(pair.pairId, pairIdOf(pair.a.artworkId, pair.b.artworkId))
		assert.equal(pair.reviewedness, reviewednessOf(pair.pairReviewedness))
		for (const endpoint of [pair.a, pair.b]) {
			assert.match(endpoint.sha256, /^[0-9a-f]{64}$/, "endpoints are identified by content hash")
			assert.ok(endpoint.width > 0 && endpoint.height > 0)
		}
	}

	// The reviewed stratum is exhaustive by design, and the counts must agree with the pairs.
	const reviewedStratum = committed.strata.find((s) => s.stratum === "reviewed")!
	assert.equal(reviewedStratum.exhaustive, true)
	assert.equal(reviewedStratum.drawn, committed.counts.drawnReviewed)
	assert.equal(committed.counts.drawn, committed.pairs.length)
	assert.equal(
		committed.counts.drawnReviewed + committed.counts.drawnUnseen,
		committed.pairs.length,
	)
})

test("no held-out artwork is in the committed pair set", async () => {
	const committed = JSON.parse(
		await readFile(path.join(V3_ROOT, "data/robustness/pair-set-1.json"), "utf8"),
	) as PairSetFile
	const excluded = await loadExcludedArtworkIds(
		path.join(V3_ROOT, "data/holdout/holdout.json"),
		path.join(V3_ROOT, "data/embeddings/near-dup-census.holdout-v2.json"),
	)
	assert.ok(excluded.size > 0)
	for (const pair of committed.pairs) {
		assert.equal(excluded.has(pair.a.artworkId), false, `${pair.pairId} touches a held-out artwork`)
		assert.equal(excluded.has(pair.b.artworkId), false, `${pair.pairId} touches a held-out artwork`)
	}
})
