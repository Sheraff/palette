/**
 * The standing perturbation-cover sample.
 *
 * Where the pair set asks "does the same artwork at two encodings give one palette?", this set asks
 * the sharper question: "does the same artwork, perturbed by an amount nobody can see, give one
 * palette?" v2-3's answer was no — a ±1 LSB dither moved **114 of 114** covers.
 *
 * This is also the instrument that carries **item 4**, the reviewed-vs-unseen split, and it carries
 * it much better than the pair set does. Only 23 eligible rendition pairs touch a graded artwork,
 * but perturbation works on a single cover, so the sample can be allocated **half reviewed, half
 * unseen** by construction. That is what makes the reviewed/unseen ratio — v2-3's 1.61×
 * overfitting alarm, healthy ≈ 1.0 — a number with real power rather than a gesture. It is the
 * measurement `PHASE_0_LOOSE_ENDS.md` row **B30** says is "tracked nowhere", and the reviewer's
 * **TB-06** ("In the previous version the tuned pictures were 1.6 times more stable than the unseen
 * ones … and nothing currently measures it").
 *
 * The eligible universe is not invented here. It is the same album-artwork candidate filter the
 * holdout freeze and the coverage set use — square best rendition, long edge > 150 px, no real
 * transparency — via {@link musicArtworkDropReason}, minus the frozen holdout and its quarantine.
 * Sharded artworks carry one rendition each and take no candidate filter.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import {
	buildMusicArtworks,
	buildShardedArtworks,
	loadTransparentArtworkIds,
	musicArtworkDropReason,
	mulberry32,
	readIdRows,
	shuffle,
} from "../coverage-set/corpus.ts"
import type { Artwork, TierName } from "../coverage-set/corpus.ts"
import { PAIR_SET_ARM, REVIEWEDNESS_DEFINITION, loadExcludedArtworkIds, loadReviewedArtworkIds, provenanceOf } from "./pair-set.ts"
import { PERTURBATION_ARMS } from "./perturb.ts"
import type { PerturbationCover, PerturbationSetFile, Reviewedness, StratumAllocation } from "./types.ts"

/**
 * `[HELD]` — an identifier, not a measurement, and deliberately **not** the pair set's seed: the
 * two samples are drawn from overlapping populations and sharing a seed would correlate them for
 * no reason. Frozen on the first draw.
 */
export const PERTURBATION_SET_SEED = 0xc0ffee

/**
 * `[REVIEWED]` — the sample size the reviewer approved conversationally for the perturbation half
 * of TB-05 ("If we re-save a picture at a slightly different quality … a person would call it the
 * same picture and expect the same colours"). 100 covers × 4 arms is 400 comparisons, which is the
 * "minutes on the samples" budget. Same standing as {@link PAIR_SET_TARGET_SIZE}: a chat approval,
 * recorded with an empty `fundedBy`.
 */
export const PERTURBATION_SET_TARGET_SIZE = 100

/**
 * `[UNCALIBRATED]` — a balanced half-and-half allocation. Chosen because the reviewed-vs-unseen
 * *ratio* is the quantity of interest and a balanced split minimises its variance for a fixed total;
 * not measured against anything. If the reviewed pool ever grows past 50 usable artworks this stays
 * at 50 and the surplus goes unsampled, which keeps the set comparable across re-draws.
 */
export const PERTURBATION_REVIEWED_QUOTA = 50
export const PERTURBATION_UNSEEN_QUOTA = 50

export type BuildPerturbationSetOptions = {
	repoRoot: string
	overlayPath: string
	holdoutPath: string
	warehousePath: string
	embeddingsDir: string
	transparencyPath: string
	seed?: number
	reviewedQuota?: number
	unseenQuota?: number
	setId?: string
	now?: () => string
}

function coverOf(artwork: Artwork, reviewedness: Reviewedness): PerturbationCover {
	const row = artwork.chosen
	return {
		artworkId: artwork.artworkId,
		collection: artwork.collection,
		path: row.path,
		sha256: row.sha256,
		width: row.width,
		height: row.height,
		format: row.format,
		bytes: row.bytes,
		tier: artwork.tier,
		reviewedness,
	}
}

/**
 * Draw `quota` artworks stratified by resolution tier, proportionally to the tier's population.
 *
 * Deterministic: the pool is sorted by artwork id before any randomness, tiers are visited in the
 * fixed {@link TierName} order, and the leftovers after proportional allocation are filled from a
 * single seeded permutation of everything not already taken.
 */
export function drawStratifiedByTier(
	pool: Artwork[],
	quota: number,
	rng: () => number,
	label: string,
): { picked: Artwork[]; strata: StratumAllocation[] } {
	const sorted = [...pool].sort((x, y) => (x.artworkId < y.artworkId ? -1 : x.artworkId > y.artworkId ? 1 : 0))
	const tiers = new Map<TierName, Artwork[]>()
	for (const artwork of sorted) {
		const bucket = tiers.get(artwork.tier)
		if (bucket) bucket.push(artwork)
		else tiers.set(artwork.tier, [artwork])
	}
	const tierNames = [...tiers.keys()].sort()
	const total = sorted.length
	const picked: Artwork[] = []
	const strata: StratumAllocation[] = []
	for (const tier of tierNames) {
		const population = tiers.get(tier)!
		const ideal = total === 0 ? 0 : Math.floor((population.length * quota) / total)
		const take = Math.min(ideal, population.length)
		const chosen = shuffle(population, rng).slice(0, take)
		picked.push(...chosen)
		strata.push({
			stratum: `${label}|${tier}`,
			population: population.length,
			drawn: chosen.length,
			exhaustive: take >= population.length,
		})
	}
	// Fill the largest-remainder shortfall from everything not yet taken, in one seeded pass.
	if (picked.length < quota) {
		const takenIds = new Set(picked.map((a) => a.artworkId))
		const rest = shuffle(sorted.filter((a) => !takenIds.has(a.artworkId)), rng)
		picked.push(...rest.slice(0, quota - picked.length))
	}
	picked.sort((x, y) => (x.artworkId < y.artworkId ? -1 : 1))
	return { picked, strata }
}

export async function buildPerturbationSet(options: BuildPerturbationSetOptions): Promise<PerturbationSetFile> {
	const seed = options.seed ?? PERTURBATION_SET_SEED
	const reviewedQuota = options.reviewedQuota ?? PERTURBATION_REVIEWED_QUOTA
	const unseenQuota = options.unseenQuota ?? PERTURBATION_UNSEEN_QUOTA

	const shardedRows = await readIdRows(path.join(options.embeddingsDir, `sharded.${PAIR_SET_ARM}.ids.jsonl`))
	const musicRows = await readIdRows(path.join(options.embeddingsDir, `music_artworks.${PAIR_SET_ARM}.ids.jsonl`))
	const sharded = buildShardedArtworks(shardedRows)
	const music = buildMusicArtworks(musicRows)
	const transparent = await loadTransparentArtworkIds(options.transparencyPath)
	const excluded = await loadExcludedArtworkIds(options.holdoutPath, options.overlayPath)
	const reviewed = loadReviewedArtworkIds(options.warehousePath)

	const dropCounts: Record<string, number> = { "non-square": 0, "thumbnail-only": 0, "real-transparency": 0, "held-out": 0 }
	const eligible: Artwork[] = []
	for (const artwork of sharded.values()) {
		if (excluded.has(artwork.artworkId)) {
			dropCounts["held-out"]! += 1
			continue
		}
		eligible.push(artwork)
	}
	for (const artwork of music.values()) {
		if (excluded.has(artwork.artworkId)) {
			dropCounts["held-out"]! += 1
			continue
		}
		const reason = musicArtworkDropReason(artwork, transparent)
		if (reason) {
			dropCounts[reason]! += 1
			continue
		}
		eligible.push(artwork)
	}

	const reviewedPool = eligible.filter((a) => reviewed.has(a.artworkId))
	const unseenPool = eligible.filter((a) => !reviewed.has(a.artworkId))

	const rng = mulberry32(seed)
	const reviewedDraw = drawStratifiedByTier(reviewedPool, Math.min(reviewedQuota, reviewedPool.length), rng, "reviewed")
	const unseenDraw = drawStratifiedByTier(unseenPool, unseenQuota, rng, "unseen")

	const covers = [
		...reviewedDraw.picked.map((a) => coverOf(a, "reviewed")),
		...unseenDraw.picked.map((a) => coverOf(a, "unseen")),
	].sort((x, y) => (x.artworkId < y.artworkId ? -1 : 1))

	const now = options.now ? options.now() : new Date().toISOString()
	return {
		what: "Standing perturbation-cover sample for the v3 robustness harness: covers re-encoded and dithered below the visible threshold.",
		writtenAt: now,
		generatedBy: "research/v3/src/robustness/build-perturbation-set.ts",
		setId: options.setId ?? "perturbation-set-1",
		seed,
		seedHex: `0x${seed.toString(16)}`,
		criterion: {
			holdoutExcluded: true,
			reviewednessDefinition: REVIEWEDNESS_DEFINITION,
			reviewedQuota,
			unseenQuota,
		},
		sources: {
			holdout: await provenanceOf(options.holdoutPath, options.repoRoot),
			censusHoldoutOverlay: await provenanceOf(options.overlayPath, options.repoRoot, "quarantined_artwork_ids only"),
			warehouse: await provenanceOf(options.warehousePath, options.repoRoot),
			transparencySurvey: await provenanceOf(options.transparencyPath, options.repoRoot),
		},
		counts: {
			shardedArtworks: sharded.size,
			musicArtworks: music.size,
			eligibleArtworks: eligible.length,
			reviewedPool: reviewedPool.length,
			unseenPool: unseenPool.length,
			droppedNonSquare: dropCounts["non-square"]!,
			droppedThumbnailOnly: dropCounts["thumbnail-only"]!,
			droppedRealTransparency: dropCounts["real-transparency"]!,
			droppedHeldOut: dropCounts["held-out"]!,
			drawn: covers.length,
			drawnReviewed: covers.filter((c) => c.reviewedness === "reviewed").length,
			drawnUnseen: covers.filter((c) => c.reviewedness === "unseen").length,
			arms: PERTURBATION_ARMS.length,
			trials: covers.length * PERTURBATION_ARMS.length,
		},
		strata: [...reviewedDraw.strata, ...unseenDraw.strata],
		arms: PERTURBATION_ARMS,
		covers,
	}
}
