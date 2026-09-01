/**
 * Build the canonical coverage set — the embedding-stratified artwork sample that
 * becomes the standard bench for tuning v3's instruments.
 *
 *     node --experimental-strip-types research/v3/src/coverage-set/build-coverage-set.ts
 *     node --experimental-strip-types research/v3/src/coverage-set/build-coverage-set.ts --dry-run
 *
 * Writes `research/v3/data/coverage-set/coverage-set-1.json` and
 * `research/v3/data/coverage-set/COVERAGE_SET.md`. Deterministic: two runs over
 * the same inputs produce byte-identical files. No timestamp is written — the
 * build date is a constant below, bumped by hand when the set is redrawn.
 *
 * No image is decoded except the two legacy `images/` enrichment covers, which are
 * outside both embedded collections and therefore have no recorded header. Pure
 * CPU; no GPU, no model, no network.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

import {
	CANONICAL_ARM,
	EXPECTED_HELD_OUT_ARTWORKS,
	EXPECTED_MUSIC_ARTWORKS_CANDIDATES,
	EXPECTED_MUSIC_ARTWORKS_FILES,
	EXPECTED_SHARDED_FILES,
	NearDupComponents,
	TIER_BANDS,
	buildMusicArtworks,
	buildShardedArtworks,
	censusArtworkId,
	loadTransparentArtworkIds,
	mulberry32,
	musicArtworkDropReason,
	readIdRows,
	tierOf,
	type Artwork,
	type Census,
	type TierName,
} from './corpus.ts'
import { ENRICHMENT_ENTRIES, EXPECTED_ENRICHMENT_ENTRIES, OUT_OF_COLLECTION_PREFIX, type EnrichmentEntry } from './enrichment.ts'
import { cosineToCentroid, kmeans, nearestCentroid } from './kmeans.ts'
import { readNpyFloat32Matrix, type NpyMatrix } from './npy.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** [HELD] Shape of coverage-set-1.json. Bumped when fields are added or renamed. */
const SCHEMA_VERSION = 1

/** [REVIEWED] The set's identity. A redraw is a NEW file (`coverage-set-2.json`)
 *  carrying `supersedes`, never an edit of this one — the same rule the holdout
 *  freeze follows, for the same reason: a bench that changes silently is not a bench. */
const SET_ID = 'coverage-set-1'
const SCRIPT_VERSION = '1.0.0'

/** [REVIEWED] Written into the output instead of the wall clock, so two runs are
 *  byte-identical. Bumped by hand when the set is rebuilt. */
const BUILD_DATE = '2026-08-03'

/** [INHERITED] k=36 matches the embedding gallery (`data/embeddings/gallery/summary.json`),
 *  which the reviewer browsed at that granularity and found legible. The gallery
 *  clustered 16,145 FILES; this clusters ~9k ARTWORKS, so cluster ids are not
 *  comparable between the two — only the granularity is inherited. */
const K = 36

/** [UNCALIBRATED] Seed for every random choice in this build: the k-means++ init,
 *  the per-artwork tie-break keys, and the random fills. Any fixed value works;
 *  this one is distinct from the holdout's 0x5ea1f00d and the gallery's 20260802
 *  so the three draws' tie-breaks are not correlated. */
const COVERAGE_SEED = 0xc0_ef_fa_ce

/** [REVIEWED] Core size. Large enough that each of 36 clusters gets an exemplar, a
 *  fringe member and at least one fill; small enough that a reviewer can look at
 *  the whole thing in by-question rounds without the set becoming a second corpus. */
const CORE_TARGET = 200

/** [REVIEWED] Per-cluster floor. Three is the smallest number that fits the
 *  selection rule — nearest-to-centroid, farthest-from-centroid, and at least one
 *  member chosen neither for being typical nor for being extreme. */
const CLUSTER_FLOOR = 3

/** [UNCALIBRATED] How far the core's resolution-tier mix may sit from the
 *  universe's, in percentage points, before the build fails. Three points on a
 *  200-item sample is six artworks — tight enough that a tier cannot quietly
 *  vanish, loose enough to survive integer rounding across 36 clusters. */
const TIER_TOLERANCE_PP = 3.0

/** [REVIEWED] Repair budget for the tier-balancing swap pass. Each swap moves one
 *  fill slot between tiers inside one cluster; the pass stops early when every
 *  tier is inside tolerance. A ceiling makes a pathological case a reported
 *  failure rather than a hang. */
const MAX_TIER_REPAIR_SWAPS = 400

/** [REVIEWED] "Near the core" for the eval-142 overlap report: an eval artwork is
 *  near the core when at least one of its 5 nearest universe neighbours (cosine on
 *  the canonical embedding, itself excluded) is a core member. Five is the
 *  neighbour count the embedding gallery's neighbours panel used. */
const NN_K = 5

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const V3 = path.join(REPO_ROOT, 'research/v3')

const INPUTS = {
	shardedIds: path.join(V3, `data/embeddings/sharded.${CANONICAL_ARM}.ids.jsonl`),
	shardedNpy: path.join(V3, `data/embeddings/sharded.${CANONICAL_ARM}.npy`),
	musicIds: path.join(V3, `data/embeddings/music_artworks.${CANONICAL_ARM}.ids.jsonl`),
	musicNpy: path.join(V3, `data/embeddings/music_artworks.${CANONICAL_ARM}.npy`),
	census: path.join(V3, 'data/embeddings/near-dup-census.json'),
	holdout: path.join(V3, 'data/holdout/holdout.json'),
	transparency: path.join(V3, 'data/source-surveys/pixel_results.json'),
	evalSet: path.join(V3, 'data/oracle-premise/eval-set.json'),
} as const

const OUT_DIR = path.join(V3, 'data/coverage-set')
const OUT_JSON = path.join(OUT_DIR, 'coverage-set-1.json')
const OUT_MD = path.join(OUT_DIR, 'COVERAGE_SET.md')

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function sha256Of(absolutePath: string): Promise<string> {
	return createHash('sha256')
		.update(await readFile(absolutePath))
		.digest('hex')
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function pct(part: number, whole: number): number {
	return whole === 0 ? 0 : round((100 * part) / whole, 2)
}

function fail(message: string): never {
	throw new Error(`coverage-set: ${message}`)
}

/**
 * Hamilton (largest-remainder) apportionment with per-slot capacity.
 * Deterministic: remainder ties go to the lower index, and the redistribution
 * loop walks indices in order.
 */
function apportion(total: number, weights: number[], capacity: number[], floors: number[]): number[] {
	const n = weights.length
	const allocation = floors.map((floor, i) => Math.min(floor, capacity[i]!))
	let remaining = total - allocation.reduce((a, b) => a + b, 0)
	if (remaining <= 0) return allocation

	const headroom = allocation.map((got, i) => capacity[i]! - got)
	const weightSum = weights.reduce((a, b) => a + b, 0)
	const exact = weights.map((w) => (remaining * w) / weightSum)
	const base = exact.map((value, i) => Math.min(Math.floor(value), headroom[i]!))
	for (let i = 0; i < n; i++) {
		allocation[i]! += base[i]!
		headroom[i]! -= base[i]!
	}
	remaining -= base.reduce((a, b) => a + b, 0)

	const order = exact
		.map((value, i) => ({ i, remainder: value - Math.floor(value) }))
		.sort((a, b) => (b.remainder !== a.remainder ? b.remainder - a.remainder : a.i - b.i))
	for (const { i } of order) {
		if (remaining === 0) break
		if (headroom[i]! > 0) {
			allocation[i]!++
			headroom[i]!--
			remaining--
		}
	}
	// Anything still unallocated goes to the largest clusters with headroom.
	if (remaining > 0) {
		const bySize = weights.map((w, i) => ({ i, w })).sort((a, b) => (b.w !== a.w ? b.w - a.w : a.i - b.i))
		let progress = true
		while (remaining > 0 && progress) {
			progress = false
			for (const { i } of bySize) {
				if (remaining === 0) break
				if (headroom[i]! > 0) {
					allocation[i]!++
					headroom[i]!--
					remaining--
					progress = true
				}
			}
		}
	}
	return allocation
}

// ---------------------------------------------------------------------------
// Types local to the build
// ---------------------------------------------------------------------------

type UniverseMember = {
	key: string // `<collection>:<artworkId>`
	artwork: Artwork
	/** Row of the chosen rendition inside its collection's .npy. */
	embeddingRow: number
	componentId: string
	/** Index into the packed point matrix. */
	pointIndex: number
	cluster: number
	cosineToCentroid: number
	/** Deterministic per-artwork random key, drawn once in universe order. */
	tieBreak: number
}

type ClusterRole = 'exemplar' | 'fringe' | 'fill'

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run')

	// ---- inputs ------------------------------------------------------------
	const [shardedRows, musicRows] = await Promise.all([readIdRows(INPUTS.shardedIds), readIdRows(INPUTS.musicIds)])
	if (shardedRows.length !== EXPECTED_SHARDED_FILES) fail(`sharded ids has ${shardedRows.length} rows, expected ${EXPECTED_SHARDED_FILES}`)
	if (musicRows.length !== EXPECTED_MUSIC_ARTWORKS_FILES) fail(`music-artworks ids has ${musicRows.length} rows, expected ${EXPECTED_MUSIC_ARTWORKS_FILES}`)

	const [shardedNpy, musicNpy] = await Promise.all([readNpyFloat32Matrix(INPUTS.shardedNpy), readNpyFloat32Matrix(INPUTS.musicNpy)])
	if (shardedNpy.rows !== shardedRows.length) fail(`sharded .npy has ${shardedNpy.rows} rows, ids file has ${shardedRows.length}`)
	if (musicNpy.rows !== musicRows.length) fail(`music-artworks .npy has ${musicNpy.rows} rows, ids file has ${musicRows.length}`)
	if (shardedNpy.dim !== musicNpy.dim) fail(`dimension mismatch: sharded ${shardedNpy.dim}, music-artworks ${musicNpy.dim}`)
	const dim = shardedNpy.dim
	assertNormalized(shardedNpy, 'sharded')
	assertNormalized(musicNpy, 'music_artworks')

	const shardedArtworks = buildShardedArtworks(shardedRows)
	const musicArtworksAll = buildMusicArtworks(musicRows)

	const transparentIds = await loadTransparentArtworkIds(INPUTS.transparency)
	const censusRaw = await readFile(INPUTS.census)
	const census = JSON.parse(censusRaw.toString('utf8')) as Census
	const components = new NearDupComponents(census)

	const holdout = JSON.parse(await readFile(INPUTS.holdout, 'utf8')) as {
		header: {
			schemaVersion: number
			seedHex: string
			nearDuplicateCensus: { sha256: string; nonCandidateQuarantine: { artworkIds: string[] } }
		}
		artworks: Array<{ id: string }>
	}
	const holdoutIds = new Set(holdout.artworks.map((a) => a.id))
	const quarantineIds = new Set(holdout.header.nearDuplicateCensus.nonCandidateQuarantine.artworkIds)
	if (holdoutIds.size !== EXPECTED_HELD_OUT_ARTWORKS) fail(`holdout has ${holdoutIds.size} artworks, expected ${EXPECTED_HELD_OUT_ARTWORKS}`)

	const censusSha = createHash('sha256').update(censusRaw).digest('hex')
	if (censusSha !== holdout.header.nearDuplicateCensus.sha256) {
		fail(`the near-dup census on disk (${censusSha}) is not the one the holdout was frozen against (${holdout.header.nearDuplicateCensus.sha256}). ` + 'Selecting against a different graph would make the holdout leak assertion meaningless.')
	}

	// ---- universe ----------------------------------------------------------
	const musicDropCounts: Record<string, number> = { 'non-square': 0, 'thumbnail-only': 0, 'real-transparency': 0 }
	const musicCandidates: Artwork[] = []
	for (const artwork of musicArtworksAll.values()) {
		const reason = musicArtworkDropReason(artwork, transparentIds)
		if (reason) {
			musicDropCounts[reason]!++
			continue
		}
		musicCandidates.push(artwork)
	}
	if (musicCandidates.length !== EXPECTED_MUSIC_ARTWORKS_CANDIDATES) {
		fail(`music-artworks candidate filter yielded ${musicCandidates.length}, holdout freeze measured ${EXPECTED_MUSIC_ARTWORKS_CANDIDATES}`)
	}

	let heldOutRemoved = 0
	let quarantineRemoved = 0
	const universeArtworks: Artwork[] = []
	for (const artwork of shardedArtworks.values()) universeArtworks.push(artwork)
	for (const artwork of musicCandidates) {
		if (holdoutIds.has(artwork.artworkId)) {
			heldOutRemoved++
			continue
		}
		if (quarantineIds.has(artwork.artworkId)) {
			quarantineRemoved++
			continue
		}
		universeArtworks.push(artwork)
	}
	universeArtworks.sort((a, b) => {
		const ka = `${a.collection}:${a.artworkId}`
		const kb = `${b.collection}:${b.artworkId}`
		return ka < kb ? -1 : ka > kb ? 1 : 0
	})

	// ---- enrichment resolution --------------------------------------------
	if (ENRICHMENT_ENTRIES.length !== EXPECTED_ENRICHMENT_ENTRIES) {
		fail(`enrichment list has ${ENRICHMENT_ENTRIES.length} entries, expected ${EXPECTED_ENRICHMENT_ENTRIES}`)
	}
	const shardedByPath = new Map(shardedRows.map((r) => [r.path, r]))
	const musicByPath = new Map(musicRows.map((r) => [r.path, r]))

	type ResolvedEnrichment = {
		entry: EnrichmentEntry
		inEmbeddingUniverse: boolean
		collection: 'sharded' | 'music_artworks' | 'images'
		artworkId: string
		artwork: Artwork | null
		row: { path: string; sha256: string; width: number; height: number; format: string; bytes: number } | null
		embeddingRow: number | null
		componentId: string | null
	}
	const enrichment: ResolvedEnrichment[] = []
	for (const entry of ENRICHMENT_ENTRIES) {
		if (entry.path.startsWith(OUT_OF_COLLECTION_PREFIX)) {
			const absolute = path.join(REPO_ROOT, entry.path)
			const bytes = await readFile(absolute)
			const meta = await sharp(absolute).metadata()
			enrichment.push({
				entry,
				inEmbeddingUniverse: false,
				collection: 'images',
				artworkId: path.basename(entry.path).replace(/\.[A-Za-z0-9]+$/, ''),
				artwork: null,
				row: {
					path: entry.path,
					sha256: createHash('sha256').update(bytes).digest('hex'),
					width: meta.width ?? 0,
					height: meta.height ?? 0,
					format: meta.format ?? 'unknown',
					bytes: bytes.length,
				},
				embeddingRow: null,
				componentId: null,
			})
			continue
		}
		const shardedRow = shardedByPath.get(entry.path)
		const musicRow = musicByPath.get(entry.path)
		const row = shardedRow ?? musicRow
		if (!row) fail(`enrichment path not present in either ids file: ${entry.path}`)
		const collection: 'sharded' | 'music_artworks' = shardedRow ? 'sharded' : 'music_artworks'
		const lookup = collection === 'sharded' ? shardedArtworks : musicArtworksAll
		const artwork = [...lookup.values()].find((a) => a.files.some((f) => f.path === row.path))
		if (!artwork) fail(`enrichment path did not map to an artwork: ${entry.path}`)
		enrichment.push({
			entry,
			inEmbeddingUniverse: true,
			collection,
			artworkId: artwork.artworkId,
			artwork,
			row,
			embeddingRow: row.row,
			componentId: components.componentOf(collection, artwork.artworkId),
		})
	}

	// Enrichment artworks — and everything in their near-duplicate components —
	// are removed from the core's candidate pool, so the core never contains a
	// known-content cover or a near-copy of one and stays representative.
	const enrichmentComponentIds = new Set(enrichment.map((e) => e.componentId).filter((id): id is string => id !== null))
	const universeAfterEnrichment = universeArtworks.filter((a) => !enrichmentComponentIds.has(components.componentOf(a.collection, a.artworkId)))
	const enrichmentExcludedFromPool = universeArtworks.length - universeAfterEnrichment.length

	// ---- pack points -------------------------------------------------------
	const members: UniverseMember[] = []
	const points = new Float32Array(universeAfterEnrichment.length * dim)
	for (const [index, artwork] of universeAfterEnrichment.entries()) {
		const source: NpyMatrix = artwork.collection === 'sharded' ? shardedNpy : musicNpy
		const sourceRow = artwork.chosen.row
		points.set(source.data.subarray(sourceRow * dim, (sourceRow + 1) * dim), index * dim)
		members.push({
			key: `${artwork.collection}:${artwork.artworkId}`,
			artwork,
			embeddingRow: sourceRow,
			componentId: components.componentOf(artwork.collection, artwork.artworkId),
			pointIndex: index,
			cluster: -1,
			cosineToCentroid: 0,
			tieBreak: 0,
		})
	}

	// ---- cluster -----------------------------------------------------------
	const rng = mulberry32(COVERAGE_SEED)
	const clustering = kmeans(points, members.length, dim, K, rng)
	for (const member of members) {
		member.cluster = clustering.assignment[member.pointIndex]!
		member.cosineToCentroid = cosineToCentroid(points, member.pointIndex, clustering.centroids, member.cluster, dim)
	}
	// One draw per member, in universe order, so the tie-break keys do not depend
	// on how many picks happened before them.
	for (const member of members) member.tieBreak = rng()

	const byCluster: UniverseMember[][] = Array.from({ length: K }, () => [])
	for (const member of members) byCluster[member.cluster]!.push(member)
	for (const list of byCluster) list.sort((a, b) => (a.key < b.key ? -1 : 1))

	// ---- tier targets ------------------------------------------------------
	const tierNames = TIER_BANDS.map((b) => b.name)
	const universeTierCounts = new Map<TierName, number>(tierNames.map((t) => [t, 0]))
	for (const member of members) universeTierCounts.set(member.artwork.tier, universeTierCounts.get(member.artwork.tier)! + 1)
	const tierTargets = new Map<TierName, number>()
	{
		const weights = tierNames.map((t) => universeTierCounts.get(t)!)
		const allocation = apportion(CORE_TARGET, weights, weights.map(() => CORE_TARGET), tierNames.map(() => 0))
		tierNames.forEach((t, i) => tierTargets.set(t, allocation[i]!))
	}

	// ---- quotas ------------------------------------------------------------
	const clusterSizes = byCluster.map((list) => list.length)
	// Capacity is the number of distinct near-duplicate components in the cluster:
	// no two members of one component may both be chosen, so a cluster of 40
	// near-identical covers can only ever yield one pick.
	const clusterCapacity = byCluster.map((list) => new Set(list.map((m) => m.componentId)).size)
	const quotas = apportion(
		CORE_TARGET,
		clusterSizes,
		clusterCapacity,
		clusterSizes.map(() => CLUSTER_FLOOR),
	)

	// ---- selection ---------------------------------------------------------
	const usedComponents = new Set<string>(enrichmentComponentIds)
	const chosen = new Map<string, { member: UniverseMember; clusterRole: ClusterRole }>()
	const coreTierCounts = new Map<TierName, number>(tierNames.map((t) => [t, 0]))

	function take(member: UniverseMember, clusterRole: ClusterRole): void {
		chosen.set(member.key, { member, clusterRole })
		usedComponents.add(member.componentId)
		coreTierCounts.set(member.artwork.tier, coreTierCounts.get(member.artwork.tier)! + 1)
	}
	function available(list: UniverseMember[]): UniverseMember[] {
		return list.filter((m) => !chosen.has(m.key) && !usedComponents.has(m.componentId))
	}

	// Phase A — coverage first. Every cluster gets its exemplar (nearest the
	// centroid: what this cluster typically looks like) and its fringe member
	// (farthest from the centroid: where the cluster stops looking like itself),
	// before any cluster gets a random fill. Coverage means edges, not just modes.
	const clusterNotes: string[] = []
	for (let c = 0; c < K; c++) {
		if (quotas[c]! < 1) continue
		const pool = available(byCluster[c]!)
		if (pool.length === 0) {
			clusterNotes.push(`cluster ${c}: no unblocked member available for an exemplar`)
			continue
		}
		let exemplar = pool[0]!
		for (const m of pool) if (m.cosineToCentroid > exemplar.cosineToCentroid) exemplar = m
		take(exemplar, 'exemplar')

		if (quotas[c]! < 2) continue
		const fringePool = available(byCluster[c]!)
		if (fringePool.length === 0) {
			clusterNotes.push(`cluster ${c}: no unblocked member left for a fringe pick`)
			continue
		}
		let fringe = fringePool[0]!
		for (const m of fringePool) if (m.cosineToCentroid < fringe.cosineToCentroid) fringe = m
		take(fringe, 'fringe')
	}

	// Phase B — fills, steered toward whichever resolution tier is furthest below
	// its target. Within a tier the order is the seeded tie-break, so the fill is
	// a random draw constrained by tier, not a ranking.
	for (let c = 0; c < K; c++) {
		const alreadyTaken = byCluster[c]!.filter((m) => chosen.has(m.key)).length
		let want = quotas[c]! - alreadyTaken
		while (want > 0) {
			const pool = available(byCluster[c]!)
			if (pool.length === 0) {
				clusterNotes.push(`cluster ${c}: quota ${quotas[c]} but only ${alreadyTaken} distinct components available`)
				break
			}
			let best = pool[0]!
			let bestDeficit = tierTargets.get(best.artwork.tier)! - coreTierCounts.get(best.artwork.tier)!
			for (const m of pool) {
				const deficit = tierTargets.get(m.artwork.tier)! - coreTierCounts.get(m.artwork.tier)!
				if (deficit > bestDeficit || (deficit === bestDeficit && m.tieBreak < best.tieBreak)) {
					best = m
					bestDeficit = deficit
				}
			}
			take(best, 'fill')
			want--
		}
	}

	// Phase C — tier repair. Swap fill slots inside a cluster from an
	// over-represented tier to an under-represented one. Cluster counts never
	// change, so cluster coverage is preserved by construction.
	let repairSwaps = 0
	for (; repairSwaps < MAX_TIER_REPAIR_SWAPS; ) {
		const over = tierNames.filter((t) => coreTierCounts.get(t)! > tierTargets.get(t)!).sort((a, b) => coreTierCounts.get(b)! - tierTargets.get(b)! - (coreTierCounts.get(a)! - tierTargets.get(a)!))
		const under = tierNames.filter((t) => coreTierCounts.get(t)! < tierTargets.get(t)!).sort((a, b) => tierTargets.get(b)! - coreTierCounts.get(b)! - (tierTargets.get(a)! - coreTierCounts.get(a)!))
		if (over.length === 0 || under.length === 0) break
		let swapped = false
		outer: for (const toTier of under) {
			for (const fromTier of over) {
				for (let c = 0; c < K; c++) {
					const donor = byCluster[c]!.find((m) => chosen.get(m.key)?.clusterRole === 'fill' && m.artwork.tier === fromTier)
					if (!donor) continue
					const replacements = available(byCluster[c]!).filter((m) => m.artwork.tier === toTier)
					if (replacements.length === 0) continue
					let replacement = replacements[0]!
					for (const m of replacements) if (m.tieBreak < replacement.tieBreak) replacement = m
					chosen.delete(donor.key)
					usedComponents.delete(donor.componentId)
					coreTierCounts.set(fromTier, coreTierCounts.get(fromTier)! - 1)
					take(replacement, 'fill')
					repairSwaps++
					swapped = true
					break outer
				}
			}
		}
		if (!swapped) break
	}

	const core = [...chosen.values()].sort((a, b) => (a.member.key < b.member.key ? -1 : 1))

	// ---- sanity checks -----------------------------------------------------
	const checks: Array<{ check: string; passed: boolean; detail: string }> = []
	function record(check: string, passed: boolean, detail: string): void {
		checks.push({ check, passed, detail })
		if (!passed) fail(`${check} — ${detail}`)
	}

	record('core size', core.length === CORE_TARGET, `${core.length} artworks, target ${CORE_TARGET}`)

	const holdoutLeaks = core.filter((row) => holdoutIds.has(row.member.artwork.artworkId))
	record('no holdout artwork in the core', holdoutLeaks.length === 0, `${holdoutLeaks.length} held-out ids found`)

	const quarantineLeaks = core.filter((row) => quarantineIds.has(row.member.artwork.artworkId))
	record('no quarantined artwork in the core', quarantineLeaks.length === 0, `${quarantineLeaks.length} quarantined ids found`)

	// The census-graph assertion the holdout-v2 redraw exists to enforce: it is not
	// enough that no held-out ID is present; no SELECTED artwork may sit in the same
	// near-duplicate component as a held-out one.
	const componentMembers = components.members()
	const heldOutComponents = new Set<string>()
	for (const id of holdoutIds) heldOutComponents.add(components.componentOf('music_artworks', id))
	for (const id of quarantineIds) heldOutComponents.add(components.componentOf('music_artworks', id))
	const componentLeaks = [...core.map((r) => r.member.componentId), ...enrichment.map((e) => e.componentId)].filter((id): id is string => id !== null).filter((id) => heldOutComponents.has(id))
	record('no selected artwork shares a near-dup component with a held-out or quarantined one', componentLeaks.length === 0, `${componentLeaks.length} component collisions`)

	const componentCounts = new Map<string, number>()
	for (const row of core) componentCounts.set(row.member.componentId, (componentCounts.get(row.member.componentId) ?? 0) + 1)
	for (const e of enrichment) if (e.componentId) componentCounts.set(e.componentId, (componentCounts.get(e.componentId) ?? 0) + 1)
	const doubledComponents = [...componentCounts.entries()].filter(([, n]) => n > 1)
	record('never two members of one near-duplicate component', doubledComponents.length === 0, `${doubledComponents.length} components appear twice`)

	const emptyClusters = byCluster.map((_, c) => c).filter((c) => !core.some((row) => row.member.cluster === c))
	record('every cluster is represented in the core', emptyClusters.length === 0, `clusters with no core member: [${emptyClusters.join(', ')}]`)

	const exemplarClusters = new Set(core.filter((r) => r.clusterRole === 'exemplar').map((r) => r.member.cluster))
	const fringeClusters = new Set(core.filter((r) => r.clusterRole === 'fringe').map((r) => r.member.cluster))
	record('every cluster has an exemplar and a fringe pick', exemplarClusters.size === K && fringeClusters.size === K, `${exemplarClusters.size} exemplars, ${fringeClusters.size} fringes, k=${K}`)

	const tierDeviations = tierNames.map((t) => ({
		tier: t,
		universePct: pct(universeTierCounts.get(t)!, members.length),
		corePct: pct(coreTierCounts.get(t)!, core.length),
		deviationPp: round(pct(coreTierCounts.get(t)!, core.length) - pct(universeTierCounts.get(t)!, members.length), 2),
	}))
	const worstTier = tierDeviations.reduce((a, b) => (Math.abs(b.deviationPp) > Math.abs(a.deviationPp) ? b : a))
	record('resolution-tier spread within tolerance', Math.abs(worstTier.deviationPp) <= TIER_TOLERANCE_PP, `worst tier ${worstTier.tier} deviates ${worstTier.deviationPp} pp (tolerance ${TIER_TOLERANCE_PP} pp)`)

	const coreKeys = new Set(core.map((r) => r.member.key))
	const enrichmentKeys = new Set(enrichment.filter((e) => e.inEmbeddingUniverse).map((e) => `${e.collection}:${e.artworkId}`))
	const overlap = [...coreKeys].filter((k) => enrichmentKeys.has(k))
	record('core and enrichment are disjoint', overlap.length === 0, `${overlap.length} artworks in both`)

	// ---- eval-142 overlap --------------------------------------------------
	const evalSet = JSON.parse(await readFile(INPUTS.evalSet, 'utf8')) as {
		entries: Array<{ included: boolean; image: { imagePath: string; artworkId: string; artworkIdScheme: string; longEdgePx: number } }>
	}
	const evalEntries = evalSet.entries.filter((e) => e.included)

	const memberByKey = new Map(members.map((m) => [m.key, m]))
	const enrichmentByKey = new Map(enrichment.filter((e) => e.inEmbeddingUniverse).map((e) => [`${e.collection}:${e.artworkId}`, e]))

	type EvalRow = {
		imagePath: string
		artworkId: string
		locatable: boolean
		status: 'in-core' | 'in-enrichment' | 'in-universe-not-selected' | 'not-in-embedded-corpus'
		cluster: number | null
		nearestCoreCosine: number | null
		nearestCoreKey: string | null
		coreInTop5: boolean | null
	}
	const evalRows: EvalRow[] = []
	const evalClusterCounts = new Array<number>(K).fill(0)

	for (const entry of evalEntries) {
		const artworkId = entry.image.artworkId
		const key = `sharded:${artworkId}`
		const member = memberByKey.get(key)
		const enrichmentHit = enrichmentByKey.get(key)

		if (!member && !enrichmentHit) {
			evalRows.push({
				imagePath: entry.image.imagePath,
				artworkId,
				locatable: false,
				status: 'not-in-embedded-corpus',
				cluster: null,
				nearestCoreCosine: null,
				nearestCoreKey: null,
				coreInTop5: null,
			})
			continue
		}

		// Locate the eval artwork in embedding space using the exact rendition the
		// eval set names, when that rendition was embedded; otherwise the artwork's
		// chosen rendition.
		const evalRow = shardedByPath.get(entry.image.imagePath)
		const sourceRow = evalRow ? evalRow.row : (member ?? enrichmentHit!).artwork!.chosen.row
		const vectorOffset = sourceRow * dim
		const { cluster } = nearestCentroid(shardedNpy.data as Float32Array, vectorOffset, clustering.centroids, K, dim)
		evalClusterCounts[cluster]!++

		// One pass over the universe gives both answers: the nearest core member,
		// and whether any core member is inside the eval artwork's top-NN_K
		// neighbourhood.
		let nearestCoreCosine = Number.NEGATIVE_INFINITY
		let nearestCoreKey: string | null = null
		const top: Array<{ key: string; cosine: number; isCore: boolean }> = []
		for (const universeMember of members) {
			if (universeMember.key === key) continue
			const otherOffset = universeMember.pointIndex * dim
			let sum = 0
			for (let i = 0; i < dim; i++) sum += shardedNpy.data[vectorOffset + i]! * points[otherOffset + i]!
			const isCore = coreKeys.has(universeMember.key)
			if (isCore && sum > nearestCoreCosine) {
				nearestCoreCosine = sum
				nearestCoreKey = universeMember.key
			}
			if (top.length < NN_K) {
				top.push({ key: universeMember.key, cosine: sum, isCore })
				top.sort((a, b) => b.cosine - a.cosine || (a.key < b.key ? -1 : 1))
			} else if (sum > top[NN_K - 1]!.cosine) {
				top[NN_K - 1] = { key: universeMember.key, cosine: sum, isCore }
				top.sort((a, b) => b.cosine - a.cosine || (a.key < b.key ? -1 : 1))
			}
		}

		evalRows.push({
			imagePath: entry.image.imagePath,
			artworkId,
			locatable: true,
			status: coreKeys.has(key) ? 'in-core' : enrichmentHit ? 'in-enrichment' : 'in-universe-not-selected',
			cluster,
			nearestCoreCosine: round(nearestCoreCosine, 6),
			nearestCoreKey,
			coreInTop5: top.some((t) => t.isCore),
		})
	}

	const locatable = evalRows.filter((r) => r.locatable)
	const evalUntouchedClusters = evalClusterCounts.map((n, c) => ({ n, c })).filter(({ n }) => n === 0).map(({ c }) => c)

	// Total variation distance between a sample's cluster mix and the universe's:
	// half the sum of absolute differences in share, so 0 means identical and 1
	// means disjoint. This is the number that says "unrepresentative", where
	// proximity to the core does not — a bench can sit close to core artworks and
	// still cover the wrong parts of the corpus in the wrong proportions.
	function clusterShares(counts: number[]): number[] {
		const total = counts.reduce((a, b) => a + b, 0)
		return counts.map((n) => (total === 0 ? 0 : n / total))
	}
	const universeShares = clusterShares(clusterSizes)
	const coreClusterCounts = new Array<number>(K).fill(0)
	for (const row of core) coreClusterCounts[row.member.cluster]!++
	function totalVariationDistance(counts: number[]): number {
		const shares = clusterShares(counts)
		let sum = 0
		for (let c = 0; c < K; c++) sum += Math.abs(shares[c]! - universeShares[c]!)
		return round(sum / 2, 4)
	}
	const coreTvd = totalVariationDistance(coreClusterCounts)
	const evalTvd = totalVariationDistance(evalClusterCounts)

	// Same question on resolution: what tier mix does eval-142 have?
	const evalTierCounts = new Map<TierName, number>(tierNames.map((t) => [t, 0]))
	for (const entry of evalEntries) evalTierCounts.set(tierOf(entry.image.longEdgePx), evalTierCounts.get(tierOf(entry.image.longEdgePx))! + 1)

	// ---- assemble output ---------------------------------------------------
	const inputHashes: Record<string, string> = {}
	for (const [name, absolute] of Object.entries(INPUTS)) inputHashes[name] = await sha256Of(absolute)

	const clusterStats = byCluster.map((list, c) => {
		const coreHere = core.filter((r) => r.member.cluster === c)
		return {
			cluster: c,
			universeArtworks: list.length,
			distinctComponents: clusterCapacity[c]!,
			quota: quotas[c]!,
			coreArtworks: coreHere.length,
			sharded: list.filter((m) => m.artwork.collection === 'sharded').length,
			musicArtworks: list.filter((m) => m.artwork.collection === 'music_artworks').length,
			meanCosineToCentroid: round(list.reduce((sum, m) => sum + m.cosineToCentroid, 0) / Math.max(list.length, 1), 4),
			minCosineToCentroid: round(Math.min(...list.map((m) => m.cosineToCentroid)), 4),
			eval142Artworks: evalClusterCounts[c]!,
		}
	})

	function coreRowJson(row: { member: UniverseMember; clusterRole: ClusterRole }) {
		const { member, clusterRole } = row
		const a = member.artwork
		return {
			role: 'core' as const,
			collection: a.collection,
			artworkId: a.artworkId,
			artworkIdScheme: a.artworkIdScheme,
			path: a.chosen.path,
			sha256: a.chosen.sha256,
			format: a.chosen.format,
			width: a.chosen.width,
			height: a.chosen.height,
			bytes: a.chosen.bytes,
			longEdgePx: a.longEdgePx,
			tier: a.tier,
			renditionCount: a.files.length,
			renditionPaths: a.files.map((f) => f.path),
			renditionChoice: 'largest measured pixel area; ties prefer the un-suffixed original, then the lexicographically smallest path',
			embeddingArm: CANONICAL_ARM,
			embeddingRow: member.embeddingRow,
			cluster: member.cluster,
			clusterRole,
			cosineToCentroid: round(member.cosineToCentroid, 6),
			nearDupComponentId: member.componentId,
			nearDupComponentArtworks: (componentMembers.get(member.componentId) ?? [member.componentId]).length,
			inEmbeddingUniverse: true,
		}
	}

	function enrichmentRowJson(e: ResolvedEnrichment) {
		const a = e.artwork
		const row = e.row!
		const cluster = e.inEmbeddingUniverse
			? nearestCentroid((e.collection === 'sharded' ? shardedNpy : musicNpy).data as Float32Array, e.embeddingRow! * dim, clustering.centroids, K, dim)
			: null
		return {
			role: 'enrichment' as const,
			enrichmentSlices: e.entry.slices,
			enrichmentReason: e.entry.reason,
			enrichmentSource: e.entry.source,
			collection: e.collection,
			artworkId: e.artworkId,
			artworkIdScheme: a ? a.artworkIdScheme : 'legacy-images-stem',
			path: row.path,
			sha256: row.sha256,
			format: row.format,
			width: row.width,
			height: row.height,
			bytes: row.bytes,
			longEdgePx: Math.max(row.width, row.height),
			tier: tierOf(Math.max(row.width, row.height)),
			renditionCount: a ? a.files.length : 1,
			renditionPaths: a ? a.files.map((f) => f.path) : [row.path],
			renditionChoice: 'the exact file a human opened and confirmed — NOT the artwork’s best rendition',
			embeddingArm: e.inEmbeddingUniverse ? CANONICAL_ARM : null,
			embeddingRow: e.embeddingRow,
			cluster: cluster ? cluster.cluster : null,
			clusterRole: null,
			cosineToCentroid: cluster ? round(cluster.cosine, 6) : null,
			nearDupComponentId: e.componentId,
			nearDupComponentArtworks: e.componentId ? (componentMembers.get(e.componentId) ?? [e.componentId]).length : null,
			inEmbeddingUniverse: e.inEmbeddingUniverse,
		}
	}

	const enrichmentSorted = enrichment.slice().sort((a, b) => (a.entry.path < b.entry.path ? -1 : 1))

	const output = {
		header: {
			what: 'The canonical coverage set for the v3 palette rewrite: an embedding-stratified sample of the artwork corpus, plus labelled known-content enrichment slices. The standard bench for tuning instruments (VLM prompts, SAM prompts, thresholds), replacing ad-hoc use of the inherited eval-142.',
			setId: SET_ID,
			schemaVersion: SCHEMA_VERSION,
			scriptVersion: SCRIPT_VERSION,
			generatedBy: 'research/v3/src/coverage-set/build-coverage-set.ts',
			buildDate: BUILD_DATE,
			pathsAreRelativeTo: 'repository root',
			determinism: 'no wall clock is read; all randomness comes from one mulberry32 stream seeded with `seed` below; two runs over the same inputs produce byte-identical output',
			seed: COVERAGE_SEED,
			seedHex: `0x${COVERAGE_SEED.toString(16)}`,
			embedding: {
				arm: CANONICAL_ARM,
				decision: 'd-2026-08-02-embedding-canonical-model',
				dim,
				normalization: 'L2-normalized rows; cosine similarity is a dot product',
			},
			clustering: {
				algorithm: 'k-means++ seeding then Lloyd iterations, float64 centroid accumulation, centroids re-normalized each round',
				k: K,
				kProvenance: 'inherited granularity from research/v3/data/embeddings/gallery/summary.json (k=36 over 16,145 FILES). This run clusters ARTWORKS, so cluster ids are not comparable with the gallery.',
				iterations: clustering.iterations,
				converged: clustering.converged,
				populationClustered: members.length,
			},
			rules: {
				universe: 'artwork-level, not file-level. Sharded: every artwork, one rendition each. music-artworks: album-artwork candidates only (|w/h-1| <= 0.05 on the best rendition, best long edge > 150 px, no real transparency), minus the frozen holdout and its non-candidate quarantine.',
				rendition: 'largest measured pixel area (headers, never filenames); ties prefer the un-suffixed original, then the lexicographically smallest path. For sharded artworks present at both tiers this selects the 640 px rendition.',
				tier: 'resolution band of the chosen rendition’s long edge, using the frozen holdout’s band vocabulary',
				quota: `per cluster: a floor of ${CLUSTER_FLOOR}, then the remainder apportioned by largest remainder on cluster size, capped by the cluster’s distinct near-duplicate component count`,
				within: 'exemplar (highest cosine to the centroid) and fringe (lowest cosine to the centroid) first, across all clusters, then random fills steered toward the resolution tier furthest below its target',
				nearDuplicates: 'no two selected artworks may share a near-duplicate component (census union over dinov2-vitl14, pe-core-l14, dinov3-vitl16 at cosine >= 0.95); enrichment components are removed from the core pool entirely',
				enrichment: 'a deliberately biased, separately labelled slice of covers whose content a human confirmed by eye. NOT part of the representative core. Every consumer reporting a rate or distribution must filter to role === "core".',
			},
			inputs: Object.fromEntries(Object.entries(INPUTS).map(([name, absolute]) => [name, { path: path.relative(REPO_ROOT, absolute), sha256: inputHashes[name] }])),
		},
		counts: {
			shardedFiles: shardedRows.length,
			shardedArtworks: shardedArtworks.size,
			musicArtworksFiles: musicRows.length,
			musicArtworksArtworks: musicArtworksAll.size,
			musicArtworksDropped: musicDropCounts,
			musicArtworksCandidates: musicCandidates.length,
			heldOutArtworksRemoved: heldOutRemoved,
			quarantinedArtworksRemoved: quarantineRemoved,
			universeArtworksBeforeEnrichmentExclusion: universeArtworks.length,
			enrichmentAndNearDupsExcludedFromPool: enrichmentExcludedFromPool,
			universeArtworks: members.length,
			universeSharded: members.filter((m) => m.artwork.collection === 'sharded').length,
			universeMusicArtworks: members.filter((m) => m.artwork.collection === 'music_artworks').length,
			coreArtworks: core.length,
			enrichmentArtworks: enrichment.length,
			enrichmentInEmbeddingUniverse: enrichment.filter((e) => e.inEmbeddingUniverse).length,
			tierRepairSwaps: repairSwaps,
		},
		tiers: {
			tolerancePp: TIER_TOLERANCE_PP,
			rows: tierDeviations.map((row) => ({
				tier: row.tier,
				universeArtworks: universeTierCounts.get(row.tier)!,
				universePct: row.universePct,
				coreTarget: tierTargets.get(row.tier)!,
				coreArtworks: coreTierCounts.get(row.tier)!,
				corePct: row.corePct,
				deviationPp: row.deviationPp,
			})),
		},
		collectionMix: {
			universeShardedPct: pct(members.filter((m) => m.artwork.collection === 'sharded').length, members.length),
			coreShardedPct: pct(core.filter((r) => r.member.artwork.collection === 'sharded').length, core.length),
			coreSharded: core.filter((r) => r.member.artwork.collection === 'sharded').length,
			coreMusicArtworks: core.filter((r) => r.member.artwork.collection === 'music_artworks').length,
		},
		clusters: clusterStats,
		clusterNotes,
		checks,
		eval142Overlap: {
			what: 'How much of the inherited eval-142 bench the coverage set’s universe even contains, and how much of it the core lands on or near.',
			evalSetSource: path.relative(REPO_ROOT, INPUTS.evalSet),
			includedEntries: evalEntries.length,
			notInEmbeddedCorpus: evalRows.filter((r) => !r.locatable).length,
			notInEmbeddedCorpusNote: 'legacy repo-root images/ covers: hand-picked in the v2 era, never embedded, so they cannot be placed in the corpus’s structure at all',
			locatable: locatable.length,
			inCore: locatable.filter((r) => r.status === 'in-core').length,
			inEnrichment: locatable.filter((r) => r.status === 'in-enrichment').length,
			inUniverseNotSelected: locatable.filter((r) => r.status === 'in-universe-not-selected').length,
			coreInTop5: locatable.filter((r) => r.coreInTop5).length,
			inCoreOrNear: locatable.filter((r) => r.status === 'in-core' || r.coreInTop5).length,
			nearestCoreCosine: {
				min: round(Math.min(...locatable.map((r) => r.nearestCoreCosine!)), 4),
				median: round(median(locatable.map((r) => r.nearestCoreCosine!)), 4),
				max: round(Math.max(...locatable.map((r) => r.nearestCoreCosine!)), 4),
			},
			clusterMixDistance: {
				what: 'total variation distance between a sample’s cluster mix and the universe’s: half the summed absolute difference in share. 0 = identical mix, 1 = disjoint. The core is drawn to be small here by construction; eval-142 is not, and the gap is the measurement of how unrepresentative the inherited bench was.',
				coreVsUniverse: coreTvd,
				eval142VsUniverse: evalTvd,
				ratio: coreTvd === 0 ? null : round(evalTvd / coreTvd, 2),
			},
			// The two eval-142 percentage columns in this file have DIFFERENT
			// denominators and used to carry the same name and the same table
			// header four lines apart (review 2026-08-03, MINOR-7). The tier mix
			// is over all 142 entries, because a tier comes from an entry's own
			// measured header and every entry has one, including the 25 that are
			// not in the embedded corpus. The per-cluster mix can only be over
			// the locatable ones, because an artwork outside the corpus has no
			// cluster. Both are right; only one can be called "eval-142 %".
			eval142PctDenominator: 'all included eval-142 entries',
			tierMix: tierNames.map((t) => ({
				tier: t,
				universePct: pct(universeTierCounts.get(t)!, members.length),
				corePct: pct(coreTierCounts.get(t)!, core.length),
				eval142Pct: pct(evalTierCounts.get(t)!, evalEntries.length),
				eval142PctOf: evalEntries.length,
				eval142Artworks: evalTierCounts.get(t)!,
			})),
			clustersEval142NeverTouches: evalUntouchedClusters,
			clustersEval142NeverTouchesCount: evalUntouchedClusters.length,
			clustersEval142NeverTouchesUniverseShare: pct(
				evalUntouchedClusters.reduce((sum, c) => sum + clusterSizes[c]!, 0),
				members.length,
			),
			perCluster: clusterStats.map((row) => ({
				cluster: row.cluster,
				universeArtworks: row.universeArtworks,
				universePct: pct(row.universeArtworks, members.length),
				coreArtworks: row.coreArtworks,
				eval142Artworks: row.eval142Artworks,
				// Denominator is the LOCATABLE entries, not all 142: an entry
				// outside the embedded corpus has no cluster to be counted in.
				eval142Pct: pct(row.eval142Artworks, locatable.length),
				eval142PctOf: locatable.length,
			})),
			rows: evalRows,
		},
		artworks: [...core.map(coreRowJson), ...enrichmentSorted.map(enrichmentRowJson)],
	}

	const json = `${JSON.stringify(output, null, '\t')}\n`
	const markdown = renderMarkdown(output, { clusterSizes, quotas })

	if (dryRun) {
		process.stdout.write(`${summary(output)}\n(dry run — nothing written)\n`)
		return
	}
	await mkdir(OUT_DIR, { recursive: true })
	await writeFile(OUT_JSON, json)
	await writeFile(OUT_MD, markdown)
	process.stdout.write(`${summary(output)}\nwrote ${path.relative(REPO_ROOT, OUT_JSON)} (sha256 ${createHash('sha256').update(json).digest('hex')})\nwrote ${path.relative(REPO_ROOT, OUT_MD)} (sha256 ${createHash('sha256').update(markdown).digest('hex')})\n`)
}

function median(values: number[]): number {
	const sorted = values.slice().sort((a, b) => a - b)
	const middle = sorted.length >> 1
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function assertNormalized(matrix: NpyMatrix, label: string): void {
	// Spot-check the first, middle and last rows: the file is documented as
	// L2-normalized and every cosine in this build assumes it.
	for (const row of [0, matrix.rows >> 1, matrix.rows - 1]) {
		let sum = 0
		for (let i = 0; i < matrix.dim; i++) {
			const value = matrix.data[row * matrix.dim + i]!
			sum += value * value
		}
		if (Math.abs(Math.sqrt(sum) - 1) > 1e-3) fail(`${label} row ${row} has norm ${Math.sqrt(sum)}, expected 1 (vectors must be L2-normalized)`)
	}
}

function summary(output: any): string {
	const c = output.counts
	const e = output.eval142Overlap
	return [
		`universe ${c.universeArtworks} artworks (${c.universeSharded} sharded + ${c.universeMusicArtworks} music-artworks)`,
		`core ${c.coreArtworks}, enrichment ${c.enrichmentArtworks}`,
		`clusters ${output.header.clustering.k}, converged ${output.header.clustering.converged} in ${output.header.clustering.iterations} iterations`,
		`eval-142: ${e.notInEmbeddedCorpus} not in the embedded corpus, ${e.inCore} in the core, ${e.inCoreOrNear}/${e.locatable} in or near it, ${e.clustersEval142NeverTouchesCount} clusters untouched`,
	].join('\n')
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function renderMarkdown(output: any, extra: { clusterSizes: number[]; quotas: number[] }): string {
	const c = output.counts
	const e = output.eval142Overlap
	const h = output.header

	const slices = new Map<string, number>()
	for (const row of output.artworks) {
		if (row.role !== 'enrichment') continue
		for (const slice of row.enrichmentSlices) slices.set(slice, (slices.get(slice) ?? 0) + 1)
	}

	const lines: string[] = []
	const push = (...text: string[]) => lines.push(...text)

	push(
		'# The coverage set',
		'',
		`**File:** \`research/v3/data/coverage-set/coverage-set-1.json\` — built ${h.buildDate} by \`${h.generatedBy}\`, schema v${h.schemaVersion}.`,
		'',
		'## What this is',
		'',
		`A sample of **${c.coreArtworks} artworks** drawn to cover the shape of the corpus, plus **${c.enrichmentArtworks} extra artworks** whose contents a human has already confirmed by eye. It is the standard bench for tuning v3’s instruments — VLM prompts, SAM prompts, score thresholds — so that every instrument is tuned and compared on the same images.`,
		'',
		'The corpus is two collections that have nothing to do with each other: the `00..14/` sharded set (album art, capped at 640 px) and `music-artworks/` (mixed content, resolution up to 3,600 px). The set draws from both, at the level of the **artwork** rather than the file, because many artworks exist as several renditions of the same picture and counting them separately would inflate every number computed over the set.',
		'',
		'## What it is for, and what it is not',
		'',
		'**For:** picking a prompt, a wording, a threshold, or a cut-off, and seeing what it does across the whole range of covers instead of across whichever covers happened to be lying around. It is a *tuning* bench.',
		'',
		'**Not for:** final accuracy claims. The frozen holdout (`research/v3/data/holdout/`) exists for that. Not one held-out artwork is in here, and — checked against the near-duplicate graph, not just against the list of ids — neither is any near-copy of one.',
		'',
		'**What you can measure on it today, with no labels at all:** stability (does the instrument return the same thing on two renditions of one artwork), coverage (does it return anything at all, and on what fraction), cost (seconds and tokens per cover), self-consistency (does a reworded prompt agree with itself), and failure shape (which clusters produce empty or degenerate output). None of those need a right answer to be informative, and all of them will catch a badly-set threshold.',
		'',
		'**What accumulates over time:** reviewer labels. The set is sized so a reviewer can be asked one question at a time about a subset of it — a by-question round, never one long sitting — and each round’s answers stay attached to these artworks. Those accumulated labels become the stage-4 validation sample. Nothing here is a validated label yet; the enrichment slices are the only artworks in the file whose content is established, and they are established for one named thing each.',
		'',
		'## How the core was chosen',
		'',
		`1. **Universe.** ${c.shardedArtworks} sharded artworks (from ${c.shardedFiles} files — the corpus holds many artworks at both 300 px and 640 px) plus ${c.musicArtworksCandidates} music-artworks album-artwork candidates (from ${c.musicArtworksArtworks} artworks; ${c.musicArtworksDropped['non-square']} dropped as non-square, ${c.musicArtworksDropped['thumbnail-only']} as thumbnail-only, ${c.musicArtworksDropped['real-transparency']} for real transparency). Removing the ${c.heldOutArtworksRemoved} held-out artworks, then the ${c.enrichmentAndNearDupsExcludedFromPool} artworks that are enrichment covers or near-duplicates of one, leaves **${c.universeArtworks} artworks** (${c.universeSharded} sharded, ${c.universeMusicArtworks} music-artworks).`,
		`2. **One vector per artwork.** Each artwork is represented by its largest rendition, measured from the image header, never from the filename. Its ${h.embedding.arm} embedding is that rendition’s vector.`,
		`3. **${h.clustering.k} clusters.** Seeded k-means over the universe (${h.clustering.converged ? `converged in ${h.clustering.iterations} iterations` : `stopped at ${h.clustering.iterations} iterations without converging`}). k=36 is inherited from the cluster gallery the reviewer browsed and found legible; it is a granularity choice, not a claim that the corpus has 36 kinds of cover.`,
		`4. **Quotas.** Every cluster gets at least ${CLUSTER_FLOOR}; the remaining slots are shared out in proportion to cluster size, capped by how many distinct near-duplicate components the cluster actually holds. The floor deliberately over-weights the small clusters — a cluster holding 0.4% of the corpus still gets ${CLUSTER_FLOOR} artworks, because a bench that skips the rare kinds of cover is exactly the failure this set exists to fix.`,
		'5. **Inside a cluster: the middle *and* the edge.** The artwork closest to the cluster centre is taken first (what this cluster typically looks like), then the artwork furthest from it (where the cluster stops looking like itself), and only then random fills. Coverage that only samples modes is not coverage.',
		`6. **Resolution is forced to match the corpus.** Fills are steered so the core’s resolution mix tracks the universe’s within ${output.tiers.tolerancePp} percentage points. Small thumbnails are represented — some questions are physically unanswerable at 300 px and the bench has to contain that case — but they cannot dominate.`,
		'7. **No two near-duplicates.** The near-duplicate census (three embedding models, cosine ≥ 0.95) groups near-identical images into components; at most one artwork per component is ever selected. The census is a documented *lower bound* on the real duplicate structure, so this rule removes the duplicates we can see, not all of them.',
		'',
		`Everything random comes from one seeded stream (seed \`${h.seedHex}\`). Re-running the build reproduces the file byte for byte; it reads no clock.`,
		'',
		'## Resolution tiers',
		'',
		'| tier | universe | universe % | core target | core | core % | deviation |',
		'|---|---|---|---|---|---|---|',
		...output.tiers.rows.map((row: any) => `| ${row.tier} | ${row.universeArtworks} | ${row.universePct}% | ${row.coreTarget} | ${row.coreArtworks} | ${row.corePct}% | ${row.deviationPp > 0 ? '+' : ''}${row.deviationPp} pp |`),
		'',
		`Collection mix: the universe is ${output.collectionMix.universeShardedPct}% sharded; the core is ${output.collectionMix.coreShardedPct}% sharded (${output.collectionMix.coreSharded} sharded, ${output.collectionMix.coreMusicArtworks} music-artworks). That mix is not forced — it falls out of the clusters.`,
		'',
		'## The enrichment slices',
		'',
		`${c.enrichmentArtworks} artworks, each tagged with why it is here. **They are not part of the core and never enter a rate, a distribution, or an agreement number** — filter to \`role === "core"\` for anything of that kind. They exist so that an instrument aimed at a specific thing can be tuned against covers where the right answer is already known, independently of any model.`,
		'',
		'| slice | artworks | what it is for |',
		'|---|---|---|',
		`| parental-advisory | ${slices.get('parental-advisory') ?? 0} | every cover in the repo confirmed by eye to carry a PA mark, including one where only the 300 px rendition exists — the mark at the resolution floor |`,
		`| cjk-text | ${slices.get('cjk-text') ?? 0} | Chinese and Japanese text, including one cover mixing Japanese and Latin |`,
		`| nonlatin-text | ${slices.get('nonlatin-text') ?? 0} | Korean, Thai and Malayalam — scripts a Latin-trained text prompt tends to miss |`,
		`| vehicle | ${slices.get('vehicle') ?? 0} | cars, photoreal and illustrated: a concrete object noun for object prompts |`,
		`| barcode | ${slices.get('barcode') ?? 0} | applied overlays (promo sticker, shipping label) that are on the cover but not part of the artwork |`,
		`| confirmed-negative | ${slices.get('confirmed-negative') ?? 0} | a cover confirmed to carry no mark, no logo, no sticker and no display text: any detection here is a false positive by construction |`,
		'',
		// The count in this sentence used to be a literal five while the table
		// above computed six, and "dropping two would halve" was wrong against
		// either (review 2026-08-03, MINOR-8). Both numbers are computed now.
		// The six are the covers carrying the PA slice; five of those come from
		// the probe-2 eye check, the sixth is a probe-4 shipping-label cover
		// that carries a PA mark too.
		`${c.enrichmentArtworks - c.enrichmentInEmbeddingUniverse} of them (\`images/greenday.jpg\`, \`images/slim.jpg\`) live in the repo’s legacy \`images/\` directory, which is in neither embedded collection. They are carried anyway, flagged \`inEmbeddingUniverse: false\` with no cluster: both carry a confirmed parental-advisory mark, only ${slices.get('parental-advisory') ?? 0} covers in this repo do, and dropping them would leave ${(slices.get('parental-advisory') ?? 0) - (c.enrichmentArtworks - c.enrichmentInEmbeddingUniverse)} — a third of the PA evidence gone.`,
		'',
		'Enrichment rows point at the **exact file a human opened**, not at the artwork’s largest rendition — the confirmation was made on that file. Each row carries `enrichmentSource`, naming the repo file that establishes its content: `research/v3/oracle/sam/review_round_2.py` (the covers opened by eye during the SAM vocabulary probe) and `research/v3/data/sam/probe-4-scripts-objects.jsonl` (whose `image_kind` / `image_note` fields were filled in by opening each file).',
		'',
		'## What the eval-142 comparison found',
		'',
		`The inherited bench, eval-142 (\`${e.evalSetSource}\`), is ${e.includedEntries} entries. Placing it against this corpus:`,
		'',
		`- **${e.notInEmbeddedCorpus} of the ${e.includedEntries} are not in the embedded corpus at all** (${pct(e.notInEmbeddedCorpus, e.includedEntries)}%). They are legacy \`images/\` covers, hand-picked in the v2 era. They cannot be placed in the corpus’s structure, cannot be checked for near-duplicate leakage against the holdout, and cannot be said to represent anything about the corpus, because they are not drawn from it.`,
		`- Of the ${e.locatable} that *are* locatable: ${e.inCore} sit in the core, ${e.inEnrichment} were pulled out as enrichment covers, and ${e.inUniverseNotSelected} are in the universe but were not selected. (The enrichment overlap is not a coincidence — the SAM probes that established those covers’ contents drew their images from the eval set, which is why so much of what is *known* about any cover in this repo is known about an eval-142 cover.)`,
		`- **${e.inCoreOrNear} of ${e.locatable}** (${pct(e.inCoreOrNear, e.locatable)}%) are in the core or within its top-${NN_K} neighbourhood. Median cosine from an eval-142 artwork to its nearest core member: ${e.nearestCoreCosine.median} (range ${e.nearestCoreCosine.min}–${e.nearestCoreCosine.max}). This particular number is *not* the interesting one and is reported so nobody has to ask: the core is ${pct(c.coreArtworks, c.universeArtworks)}% of the universe, so some proximity is arithmetic rather than evidence.`,
		`- **${e.clustersEval142NeverTouches.length} of the ${h.clustering.k} clusters contain no eval-142 artwork at all** — clusters ${e.clustersEval142NeverTouches.join(', ') || '(none)'}, holding ${e.clustersEval142NeverTouchesUniverseShare}% of the universe between them. On those kinds of cover the inherited bench could say nothing, because it contained nothing from there.`,
		`- **The mix is wrong, not just the coverage.** Distance between a sample’s cluster mix and the corpus’s (total variation, 0 = identical, 1 = disjoint): the core sits at **${e.clusterMixDistance.coreVsUniverse}**, eval-142 at **${e.clusterMixDistance.eval142VsUniverse}**${e.clusterMixDistance.ratio ? ` — ${e.clusterMixDistance.ratio}× further out` : ''}. That is the measurement this whole comparison exists to produce. The core’s own distance is not zero and is not meant to be: the per-cluster floor of ${CLUSTER_FLOOR} intentionally over-samples the small clusters, and that accounts for essentially all of it.`,
		'',
		`Resolution mix, the other axis that has to match. **This table's eval-142 column is over all ${e.includedEntries} entries** — a resolution tier comes from an entry's own measured header, so even the ${e.notInEmbeddedCorpus} entries outside the corpus have one. The per-cluster table further down is over the ${e.locatable} locatable entries instead, because an artwork outside the corpus has no cluster. Both columns are correct; they are not comparable to each other.`,
		'',
		`| tier | universe % | core % | eval-142 % (of ${e.includedEntries}) |`,
		'|---|---|---|---|',
		...e.tierMix.map((row: any) => `| ${row.tier} | ${row.universePct}% | ${row.corePct}% | ${row.eval142Pct}% |`),
		'',
		'The verdict this supports: eval-142 was never a sample of this corpus. It is a set of covers that accumulated during v2 development for reasons that had nothing to do with covering the corpus, a sixth of it is not in the corpus at all, and its cluster mix sits several times further from the corpus than the core does. It remains perfectly good evidence about the *artworks in it* — the gradient labels behind it are real reviewer work — and nothing here retracts that. What it cannot support is any sentence of the form "on the corpus, the instrument does X".',
		'',
		`| cluster | universe | universe % | core | eval-142 | eval-142 % (of ${e.locatable} locatable) |`,
		'|---|---|---|---|---|---|',
		...e.perCluster.map((row: any) => `| ${row.cluster} | ${row.universeArtworks} | ${row.universePct}% | ${row.coreArtworks} | ${row.eval142Artworks} | ${row.eval142Pct}% |`),
		'',
		'## Checks that ran',
		'',
		'| check | result | detail |',
		'|---|---|---|',
		...output.checks.map((check: any) => `| ${check.check} | ${check.passed ? 'pass' : 'FAIL'} | ${check.detail} |`),
		'',
		'The holdout check is deliberately stronger than "no held-out id appears here". It asserts that no selected artwork shares a near-duplicate component with a held-out or quarantined one — the failure mode that forced the holdout to be redrawn in the first place (`d-2026-08-02-holdout-v2-redraw`): version 1 selected at artwork-id level, and 224 of its 414 artworks turned out to have a near-identical twin on the other side of the line.',
		'',
		'## How to use it',
		'',
		'```js',
		"const set = JSON.parse(await readFile('research/v3/data/coverage-set/coverage-set-1.json', 'utf8'))",
		'',
		"const core = set.artworks.filter((a) => a.role === 'core')            // the representative sample",
		"const pa = set.artworks.filter((a) => a.enrichmentSlices?.includes('parental-advisory'))",
		'',
		'// Every path is repo-root-relative; every row carries the sha256 of the exact bytes.',
		'```',
		'',
		`Report anything measured on this set **stratified by \`tier\`**. ${output.tiers.rows[0].corePct}% of the core is at or below 400 px, some questions are physically unanswerable at that size, and a single pooled number over a mixed-resolution sample is not interpretable (pipeline §7.1).`,
		'',
		'## Known limits',
		'',
		'- **The near-duplicate census is a lower bound.** It undercounts by 46.3% against the duplicates filename ground truth already knows about. Two artworks in the core may still be near-copies at a similarity below 0.95.',
		'- **k=36 is inherited, not calibrated.** It was chosen because a reviewer browsed a gallery at that granularity and could read it. No clustering-quality criterion was optimised.',
		`- **The core has no labels.** ${c.coreArtworks} artworks and zero ground truth about them, by design; labels accrue through reviewer rounds. Do not mistake the enrichment slices’ confirmed content for a labelled core.`,
		'- **Sharded artworks are not filtered for content.** The sharded collection is treated as album art wholesale, as the pipeline survey does. The music-artworks side *is* filtered, by aspect ratio, and that filter is the only content discriminator either collection has.',
		'- **The holdout only covers `music-artworks/`.** No part of the sharded collection is held out, so a final-accuracy claim on sharded artworks has no clean instrument here at all — that is a gap in the holdout, not in this set, but it bites anyone who assumes "not in the coverage set" means "safe to report on".',
		'',
	)
	return `${lines.join('\n')}\n`
}

await main()
