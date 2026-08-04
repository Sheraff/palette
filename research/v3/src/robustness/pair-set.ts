/**
 * The standing rendition-pair sample.
 *
 * A *rendition pair* is one artwork that exists twice in the corpus under two different ids —
 * two encodings, two sizes, two deliveries of the same cover. The near-duplicate census already
 * found them: it excludes same-id pairs by construction, so **every census pair is cross-id**, and
 * pairs at high cosine are the same artwork rather than two similar ones.
 *
 * A palette system that is right should give the same answer to both halves. v2-3 gave the same
 * answer 72.8% of the time. This module freezes the sample that number will be measured on from
 * Phase 1 onward, so it is a standing number and not a post-hoc discovery.
 *
 * Three choices are load-bearing and are recorded in the set file itself:
 *
 * - **Holdout exclusion goes through `holdout.json`, never through the census's `side` field.**
 *   The census's sides were computed against holdout **1.0.0** and
 *   `near-dup-census.holdout-v2.json` supersedes them: 2,875 of 12,472 music-artworks endpoints
 *   (23.05%) carry a wrong side label. Joining artwork ids against the frozen holdout file is
 *   immune to that, so this module does the join and ignores the field.
 * - **The reviewed stratum is taken whole, not sampled.** Only 23 eligible pairs have an endpoint
 *   the reviewer has graded, and none have two. A stratified draw would have taken one or two of
 *   them by chance and the reviewed-vs-unseen split would have been noise. Taking all 23 is the
 *   most the corpus can offer; the report says so and widens its interval accordingly.
 * - **Reviewedness means "the reviewer has ever graded this artwork", of any question kind.** A
 *   SAM mask grade is not a palette grade, but the artwork has been *in front of the reviewer*,
 *   and that is what "tuned to the reviewed set" is about.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
	buildMusicArtworks,
	buildShardedArtworks,
	censusArtworkId,
	loadTransparentArtworkIds,
	mulberry32,
	musicArtworkDropReason,
	readIdRows,
	shuffle,
	tierOf,
} from "../coverage-set/corpus.ts"
import type { Artwork, Collection } from "../coverage-set/corpus.ts"
import { readAll, resolve, supersededIds } from "../warehouse/warehouse.ts"
import type {
	PairReviewedness,
	PairSetFile,
	RenditionEndpoint,
	RenditionPair,
	Reviewedness,
	SourceProvenance,
	StratumAllocation,
} from "./types.ts"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * `[HELD]` — an identifier, not a measurement. Frozen on the first draw; changing it draws a
 * different standing sample, which is a new set file with a new `setId`, never an edit to this one.
 * Spelled to read as "stable", in the house style of the holdout's `0x5ea1f00d` and the coverage
 * set's `0xc0efface`.
 */
export const PAIR_SET_SEED = 0x57ab1e

/**
 * `[REVIEWED]` — the size the reviewer approved for this sample, conversationally. Sized to run in
 * minutes rather than to hit a power target; the Wilson intervals in the report are what say how
 * much any given stratum's rate is worth.
 *
 * On the strength of that word: the robustness item is **TB-05** in
 * `reviews/toolbox-review/adjudication-items.json` ("Check that results survive harmless changes to
 * the picture", tier HIGH, blocks Phase 2 entry, recommendation `build-now`), and the 42-item
 * toolbox round it belongs to is **not answered in the warehouse** — the approval arrived in chat.
 * Per `CONVENTIONS.md` that still gets a decision record, with an **empty `fundedBy`**, which is the
 * honest statement that no machine can re-check it. It is `[REVIEWED]` because the reviewer said
 * so, not because a graded round says so.
 */
export const PAIR_SET_TARGET_SIZE = 200

/**
 * `[REVIEWED]` — TB-05's "the matched pairs of the same artwork we already have on disk but have
 * never compared", at the census's own near-duplicate threshold. Cross-id pairs at ≥0.95 are the
 * same artwork at different renditions; it is also the threshold the census and the holdout freeze
 * already use, so the three instruments agree on what "near-duplicate" means.
 */
export const PAIR_SET_COSINE_THRESHOLD = 0.95

/**
 * `[REVIEWED]` — `decisions.json` `d-2026-08-02-embedding-canonical-model`. The census carries
 * three arms; `cosine` is this one, and the threshold is applied to it so the eligibility rule is
 * single-armed and reproducible.
 */
export const PAIR_SET_ARM = "dinov2-vitl14"

/**
 * `[UNCALIBRATED]` — three bands chosen to split the eligible population into usefully unequal
 * thirds, not measured. They exist so the draw cannot accidentally concentrate on cosine ≈ 1.0
 * pairs, which are the easy ones. Nothing downstream reads the band as a quantity.
 */
export const SIMILARITY_BANDS = [
	{ name: "0.95-0.98", maxCosine: 0.98 },
	{ name: "0.98-0.995", maxCosine: 0.995 },
	{ name: "0.995-1.0", maxCosine: Number.POSITIVE_INFINITY },
] as const

/** The definition recorded in the set file, so a reader never has to infer it. */
export const REVIEWEDNESS_DEFINITION =
	"an artwork is `reviewed` when the warehouse holds at least one live (non-retracted, " +
	"non-superseded) oracle-label whose artwork.rendition.artworkId is this artwork, for any " +
	"question kind — including SAM mask grades, which are not palette grades but do mean the " +
	"reviewer has seen the artwork"

export function similarityBand(cosine: number): string {
	for (const band of SIMILARITY_BANDS) if (cosine <= band.maxCosine) return band.name
	throw new Error(`no similarity band for cosine ${cosine}`)
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type CensusPair = {
	cosine: number
	cosine_by_arm?: Record<string, number>
	found_by_arms?: string[]
	a: { path: string; artwork_id: string; collection: string }
	b: { path: string; artwork_id: string; collection: string }
}

export async function sha256Of(absolutePath: string): Promise<string> {
	return createHash("sha256").update(await readFile(absolutePath)).digest("hex")
}

export async function provenanceOf(absolutePath: string, repoRoot: string, note?: string): Promise<SourceProvenance> {
	return { path: path.relative(repoRoot, absolutePath), sha256: await sha256Of(absolutePath), ...(note ? { note } : {}) }
}

/**
 * Every artwork id that must not appear in the sample.
 *
 * Two sources: the 413 frozen holdout artworks, and the 12 artworks the holdout-v2 overlay
 * quarantined. The quarantine list exists because those artworks leak across the holdout boundary
 * through the near-duplicate graph; a pair set that used them would be training-on-holdout by a
 * side door.
 */
export async function loadExcludedArtworkIds(holdoutPath: string, overlayPath: string): Promise<Set<string>> {
	const holdout = JSON.parse(await readFile(holdoutPath, "utf8")) as { artworks: Array<{ id: string }> }
	const excluded = new Set(holdout.artworks.map((a) => a.id))
	const overlay = JSON.parse(await readFile(overlayPath, "utf8")) as {
		holdout?: { quarantined_artwork_ids?: string[] }
	}
	for (const id of overlay.holdout?.quarantined_artwork_ids ?? []) excluded.add(id)
	return excluded
}

/**
 * Artworks the reviewer has graded, per {@link REVIEWEDNESS_DEFINITION}.
 *
 * Retractions and supersessions are honoured through the warehouse's own `resolve`/`supersededIds`
 * rather than by re-deriving them here — a grade the reviewer took back must not make an artwork
 * count as seen.
 */
export function loadReviewedArtworkIds(warehousePath: string): Set<string> {
	const entries = resolve(readAll(warehousePath))
	const superseded = supersededIds(entries)
	const reviewed = new Set<string>()
	for (const entry of entries) {
		const record = entry.record as { type: string; id: string; artwork?: { rendition?: { artworkId?: string } } }
		if (record.type !== "oracle-label") continue
		if (entry.retracted || superseded.has(record.id)) continue
		const artworkId = record.artwork?.rendition?.artworkId
		if (artworkId && (/^[0-9a-f]{24}$/.test(artworkId) || /^[0-9a-f]{32}$/.test(artworkId))) {
			reviewed.add(artworkId)
		}
	}
	return reviewed
}

/**
 * Artwork id → artwork, over both collections, with each artwork's canonical rendition chosen.
 *
 * The same index the coverage set and the holdout freeze build, from the same ids files, so
 * "the canonical rendition of artwork X" means one thing across all of v3.
 */
export async function loadArtworkIndex(embeddingsDir: string, arm: string): Promise<Map<string, Artwork>> {
	const sharded = buildShardedArtworks(await readIdRows(path.join(embeddingsDir, `sharded.${arm}.ids.jsonl`)))
	const music = buildMusicArtworks(await readIdRows(path.join(embeddingsDir, `music_artworks.${arm}.ids.jsonl`)))
	const index = new Map<string, Artwork>(sharded)
	for (const [id, artwork] of music) index.set(id, artwork)
	return index
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

/**
 * One endpoint, represented by the artwork's **canonical rendition**.
 *
 * Not by the file the census happened to score. Two artworks can appear in the census as several
 * file-level pairs — `.jpg` against `.jpg`, `_147x147.avif` against `_482x482.avif`, and so on —
 * and in the committed draw 23 artwork pairs arrived four times over that way. Sampling file pairs
 * would both double-count those artworks and over-weight whichever artworks happen to carry the
 * most derived renditions, which is a property of the CDN and not of the artwork.
 *
 * So the sample is a sample of **artwork pairs**, and each side is the artwork's canonical
 * rendition — `isBetterRendition` in `coverage-set/corpus.ts`, the same choice the holdout freeze
 * and the coverage set make. The two standing samples therefore point at the same files.
 */
function endpointOf(
	taggedArtworkId: string,
	collection: Collection,
	artworks: Map<string, Artwork>,
	reviewed: Set<string>,
): RenditionEndpoint {
	const artworkId = censusArtworkId(taggedArtworkId)
	const artwork = artworks.get(artworkId)
	if (!artwork) throw new Error(`census endpoint has no artwork in the ids index: ${taggedArtworkId}`)
	const row = artwork.chosen
	return {
		artworkId,
		collection,
		path: row.path,
		sha256: row.sha256,
		width: row.width,
		height: row.height,
		format: row.format,
		bytes: row.bytes,
		reviewed: reviewed.has(artworkId),
	}
}

/** Stable across re-draws and independent of census ordering. */
export function pairIdOf(a: string, b: string): string {
	return [a, b].sort().join("~")
}

export function pairReviewednessOf(a: RenditionEndpoint, b: RenditionEndpoint): PairReviewedness {
	if (a.reviewed && b.reviewed) return "both-reviewed"
	if (a.reviewed || b.reviewed) return "one-reviewed"
	return "neither-reviewed"
}

export function reviewednessOf(pairReviewedness: PairReviewedness): Reviewedness {
	return pairReviewedness === "neither-reviewed" ? "unseen" : "reviewed"
}

/**
 * Largest-remainder proportional allocation.
 *
 * Deterministic given the cell order: ties on the remainder go to the larger population, then to
 * the lexicographically smaller key, so no random tiebreak can move a count between runs.
 */
export function allocate(cells: Array<{ key: string; population: number }>, quota: number): Map<string, number> {
	const total = cells.reduce((sum, c) => sum + c.population, 0)
	const allocation = new Map<string, number>()
	if (total === 0 || quota <= 0) {
		for (const cell of cells) allocation.set(cell.key, 0)
		return allocation
	}
	const exact = cells.map((cell) => ({ ...cell, ideal: (cell.population * quota) / total }))
	let assigned = 0
	for (const cell of exact) {
		const floor = Math.min(cell.population, Math.floor(cell.ideal))
		allocation.set(cell.key, floor)
		assigned += floor
	}
	const remaining = exact
		.filter((cell) => allocation.get(cell.key)! < cell.population)
		.sort((x, y) => {
			const rx = x.ideal - Math.floor(x.ideal)
			const ry = y.ideal - Math.floor(y.ideal)
			if (rx !== ry) return ry - rx
			if (x.population !== y.population) return y.population - x.population
			return x.key < y.key ? -1 : 1
		})
	let index = 0
	while (assigned < quota && remaining.length > 0) {
		const cell = remaining[index % remaining.length]!
		const current = allocation.get(cell.key)!
		if (current < cell.population) {
			allocation.set(cell.key, current + 1)
			assigned += 1
		} else if (remaining.every((c) => allocation.get(c.key)! >= c.population)) {
			break
		}
		index += 1
	}
	return allocation
}

export type BuildPairSetOptions = {
	repoRoot: string
	censusPath: string
	overlayPath: string
	holdoutPath: string
	warehousePath: string
	embeddingsDir: string
	transparencyPath: string
	seed?: number
	targetSize?: number
	setId?: string
	now?: () => string
}

export async function buildPairSet(options: BuildPairSetOptions): Promise<PairSetFile> {
	const seed = options.seed ?? PAIR_SET_SEED
	const targetSize = options.targetSize ?? PAIR_SET_TARGET_SIZE
	const census = JSON.parse(await readFile(options.censusPath, "utf8")) as { pairs: CensusPair[] }
	const excluded = await loadExcludedArtworkIds(options.holdoutPath, options.overlayPath)
	const reviewed = loadReviewedArtworkIds(options.warehousePath)
	const artworks = await loadArtworkIndex(options.embeddingsDir, PAIR_SET_ARM)
	const transparent = await loadTransparentArtworkIds(options.transparencyPath)

	const atThreshold = census.pairs.filter((p) => p.cosine >= PAIR_SET_COSINE_THRESHOLD)

	/**
	 * The album-artwork candidate filter, identical to the perturbation set's and the coverage
	 * set's, so both standing samples draw from one universe.
	 *
	 * Transparency is the part that is not merely tidiness: the contract **refuses transparent
	 * input**, so a pair touching a transparent artwork can never produce a verdict — it produces an
	 * error, forever, in every run. Two such pairs were in the first committed draw and showed up as
	 * permanent errored trials. A standing sample should not contain trials that are impossible by
	 * construction.
	 */
	const dropCounts: Record<string, number> = { "non-square": 0, "thumbnail-only": 0, "real-transparency": 0 }
	const ineligible = (id: string): boolean => {
		const artwork = artworks.get(id)
		if (!artwork || artwork.collection !== "music_artworks") return false
		const reason = musicArtworkDropReason(artwork, transparent)
		if (reason) {
			dropCounts[reason]! += 1
			return true
		}
		return false
	}

	// Collapse the census's file-level pairs onto artwork pairs. See `endpointOf`.
	const grouped = new Map<string, { records: CensusPair[]; idA: string; idB: string }>()
	for (const raw of atThreshold) {
		const idA = censusArtworkId(raw.a.artwork_id)
		const idB = censusArtworkId(raw.b.artwork_id)
		if (excluded.has(idA) || excluded.has(idB)) continue
		if (ineligible(idA) || ineligible(idB)) continue
		const key = pairIdOf(idA, idB)
		const existing = grouped.get(key)
		if (existing) existing.records.push(raw)
		else grouped.set(key, { records: [raw], idA, idB })
	}

	const eligible: RenditionPair[] = []
	for (const [pairId, group] of grouped) {
		// `a` is the endpoint whose artwork id sorts first, so the pair is orientation-free.
		const [firstId, secondId] = [group.idA, group.idB].sort() as [string, string]
		const record = group.records[0]!
		const collectionOf = (id: string) =>
			(censusArtworkId(record.a.artwork_id) === id ? record.a.collection : record.b.collection) as Collection
		const a = endpointOf(firstId, collectionOf(firstId), artworks, reviewed)
		const b = endpointOf(secondId, collectionOf(secondId), artworks, reviewed)
		const pairReviewedness = pairReviewednessOf(a, b)
		// Cosine is a property of a FILE pair, not of an artwork pair. The strongest score the
		// census recorded for these two artworks is the one reported, and the band follows it.
		const cosine = Math.max(...group.records.map((r) => r.cosine))
		const arms = new Set<string>()
		for (const record of group.records) for (const arm of record.found_by_arms ?? []) arms.add(arm)
		eligible.push({
			pairId,
			cosine,
			foundByArms: [...arms].sort(),
			renditionPairsInCensus: group.records.length,
			similarityBand: similarityBand(cosine),
			pairReviewedness,
			reviewedness: reviewednessOf(pairReviewedness),
			collection: a.collection,
			tierPair: [tierOf(Math.max(a.width, a.height)), tierOf(Math.max(b.width, b.height))],
			a,
			b,
		})
	}
	// Canonical order before any randomness, so the draw cannot inherit census ordering.
	eligible.sort((x, y) => (x.pairId < y.pairId ? -1 : x.pairId > y.pairId ? 1 : 0))

	const rng = mulberry32(seed)
	const strata: StratumAllocation[] = []
	const drawn: RenditionPair[] = []

	// The reviewed stratum, taken whole. See the module docstring.
	const reviewedPairs = eligible.filter((p) => p.reviewedness === "reviewed")
	strata.push({
		stratum: "reviewed",
		population: reviewedPairs.length,
		drawn: reviewedPairs.length,
		exhaustive: true,
	})
	drawn.push(...reviewedPairs)

	// The unseen strata, allocated proportionally over collection × similarity band.
	const unseen = eligible.filter((p) => p.reviewedness === "unseen")
	const cellsByKey = new Map<string, RenditionPair[]>()
	for (const pair of unseen) {
		const key = `unseen|${pair.collection}|${pair.similarityBand}`
		const bucket = cellsByKey.get(key)
		if (bucket) bucket.push(pair)
		else cellsByKey.set(key, [pair])
	}
	const cellKeys = [...cellsByKey.keys()].sort()
	const quota = Math.max(0, targetSize - drawn.length)
	const allocation = allocate(
		cellKeys.map((key) => ({ key, population: cellsByKey.get(key)!.length })),
		quota,
	)
	for (const key of cellKeys) {
		const population = cellsByKey.get(key)!
		const take = allocation.get(key) ?? 0
		const picked = shuffle(population, rng).slice(0, take)
		picked.sort((x, y) => (x.pairId < y.pairId ? -1 : 1))
		strata.push({ stratum: key, population: population.length, drawn: picked.length, exhaustive: take >= population.length })
		drawn.push(...picked)
	}
	drawn.sort((x, y) => (x.pairId < y.pairId ? -1 : x.pairId > y.pairId ? 1 : 0))

	const now = options.now ? options.now() : new Date().toISOString()
	return {
		what: "Standing rendition-pair sample for the v3 robustness harness: the same artwork at two encodings.",
		writtenAt: now,
		generatedBy: "research/v3/src/robustness/build-pair-set.ts",
		setId: options.setId ?? "pair-set-1",
		seed,
		seedHex: `0x${seed.toString(16)}`,
		criterion: {
			cosineThreshold: PAIR_SET_COSINE_THRESHOLD,
			arm: PAIR_SET_ARM,
			holdoutExcluded: true,
			reviewednessDefinition: REVIEWEDNESS_DEFINITION,
		},
		sources: {
			census: await provenanceOf(options.censusPath, options.repoRoot),
			censusHoldoutOverlay: await provenanceOf(
				options.overlayPath,
				options.repoRoot,
				"consulted for quarantined_artwork_ids only; the census `side` fields are superseded and unused",
			),
			holdout: await provenanceOf(options.holdoutPath, options.repoRoot),
			warehouse: await provenanceOf(options.warehousePath, options.repoRoot),
			transparencySurvey: await provenanceOf(options.transparencyPath, options.repoRoot),
		},
		counts: {
			censusPairs: census.pairs.length,
			atThreshold: atThreshold.length,
			fileLevelPairsAfterHoldoutExclusion: [...grouped.values()].reduce((sum, g) => sum + g.records.length, 0),
			eligibleAfterHoldoutExclusion: eligible.length,
			reviewedArtworksInWarehouse: reviewed.size,
			excludedArtworks: excluded.size,
			droppedNonSquare: dropCounts["non-square"]!,
			droppedThumbnailOnly: dropCounts["thumbnail-only"]!,
			droppedRealTransparency: dropCounts["real-transparency"]!,
			eligibleReviewedPairs: reviewedPairs.length,
			eligibleUnseenPairs: unseen.length,
			drawn: drawn.length,
			drawnReviewed: drawn.filter((p) => p.reviewedness === "reviewed").length,
			drawnUnseen: drawn.filter((p) => p.reviewedness === "unseen").length,
		},
		strata,
		pairs: drawn,
	}
}
