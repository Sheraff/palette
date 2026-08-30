/**
 * Reproduce the coverage-set-1 k-means clustering (36 clusters, seed 0xc0efface)
 * and emit a cluster label for EVERY artwork in the sharded, music_artworks and
 * sharded_fresh_15 collections. Read-only; writes one JSON file to the scratchpad.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
	CANONICAL_ARM,
	NearDupComponents,
	buildMusicArtworks,
	buildShardedArtworks,
	loadTransparentArtworkIds,
	mulberry32,
	musicArtworkDropReason,
	readIdRows,
	type Artwork,
	type Census,
} from '/Users/Flo/GitHub/palette/research/v3/src/coverage-set/corpus.ts'
import { ENRICHMENT_ENTRIES, OUT_OF_COLLECTION_PREFIX } from '/Users/Flo/GitHub/palette/research/v3/src/coverage-set/enrichment.ts'
import { cosineToCentroid, kmeans, nearestCentroid } from '/Users/Flo/GitHub/palette/research/v3/src/coverage-set/kmeans.ts'
import { readNpyFloat32Matrix } from '/Users/Flo/GitHub/palette/research/v3/src/coverage-set/npy.ts'

const V3 = '/Users/Flo/GitHub/palette/research/v3'
const OUT = process.argv[2]!
const K = 36
const SEED = 0xc0_ef_fa_ce

const shardedRows = await readIdRows(path.join(V3, `data/embeddings/sharded.${CANONICAL_ARM}.ids.jsonl`))
const musicRows = await readIdRows(path.join(V3, `data/embeddings/music_artworks.${CANONICAL_ARM}.ids.jsonl`))
const freshRows = await readIdRows(path.join(V3, `data/embeddings-fresh-15/sharded_fresh_15.${CANONICAL_ARM}.ids.jsonl`))
const shardedNpy = await readNpyFloat32Matrix(path.join(V3, `data/embeddings/sharded.${CANONICAL_ARM}.npy`))
const musicNpy = await readNpyFloat32Matrix(path.join(V3, `data/embeddings/music_artworks.${CANONICAL_ARM}.npy`))
const freshNpy = await readNpyFloat32Matrix(path.join(V3, `data/embeddings-fresh-15/sharded_fresh_15.${CANONICAL_ARM}.npy`))
const dim = shardedNpy.dim

const shardedArtworks = buildShardedArtworks(shardedRows)
const musicArtworksAll = buildMusicArtworks(musicRows)
// fresh shard 15 uses the same sharded id scheme
const freshArtworks = buildShardedArtworks(freshRows)

const transparentIds = await loadTransparentArtworkIds(path.join(V3, 'data/source-surveys/pixel_results.json'))
const census = JSON.parse(await readFile(path.join(V3, 'data/embeddings/near-dup-census.json'), 'utf8')) as Census
const components = new NearDupComponents(census)
const holdout = JSON.parse(await readFile(path.join(V3, 'data/holdout/holdout.json'), 'utf8')) as {
	header: { nearDuplicateCensus: { nonCandidateQuarantine: { artworkIds: string[] } } }
	artworks: Array<{ id: string }>
}
const holdoutIds = new Set(holdout.artworks.map((a) => a.id))
const quarantineIds = new Set(holdout.header.nearDuplicateCensus.nonCandidateQuarantine.artworkIds)

const musicCandidates: Artwork[] = []
for (const artwork of musicArtworksAll.values()) {
	if (musicArtworkDropReason(artwork, transparentIds)) continue
	musicCandidates.push(artwork)
}
const universeArtworks: Artwork[] = []
for (const a of shardedArtworks.values()) universeArtworks.push(a)
for (const a of musicCandidates) {
	if (holdoutIds.has(a.artworkId) || quarantineIds.has(a.artworkId)) continue
	universeArtworks.push(a)
}
universeArtworks.sort((a, b) => {
	const ka = `${a.collection}:${a.artworkId}`
	const kb = `${b.collection}:${b.artworkId}`
	return ka < kb ? -1 : ka > kb ? 1 : 0
})

// enrichment components (excluded from the clustering pool)
const shardedByPath = new Map(shardedRows.map((r) => [r.path, r]))
const enrichmentComponentIds = new Set<string>()
for (const entry of ENRICHMENT_ENTRIES) {
	if (entry.path.startsWith(OUT_OF_COLLECTION_PREFIX)) continue
	const shardedRow = shardedByPath.get(entry.path)
	const collection: 'sharded' | 'music_artworks' = shardedRow ? 'sharded' : 'music_artworks'
	const lookup = collection === 'sharded' ? shardedArtworks : musicArtworksAll
	const artwork = [...lookup.values()].find((a) => a.files.some((f) => f.path === entry.path))
	if (!artwork) throw new Error(`enrichment path did not map to an artwork: ${entry.path}`)
	enrichmentComponentIds.add(components.componentOf(collection, artwork.artworkId)!)
}
const pool = universeArtworks.filter((a) => !enrichmentComponentIds.has(components.componentOf(a.collection, a.artworkId)!))
console.error(`universe=${universeArtworks.length} pool=${pool.length}`)

const points = new Float32Array(pool.length * dim)
for (const [index, artwork] of pool.entries()) {
	const source = artwork.collection === 'sharded' ? shardedNpy : musicNpy
	points.set(source.data.subarray(artwork.chosen.row * dim, (artwork.chosen.row + 1) * dim), index * dim)
}
const rng = mulberry32(SEED)
const clustering = kmeans(points, pool.length, dim, K, rng)
console.error(`iterations=${clustering.iterations} converged=${clustering.converged} sizes=${clustering.sizes.join(',')}`)

type Row = {
	key: string
	collection: string
	artworkId: string
	path: string
	width: number
	height: number
	longEdgePx: number
	tier: string
	row: number
	cluster: number
	cosineToCentroid: number
	inPool: boolean
	componentId: string | null
}
const out: Row[] = []
const poolKeys = new Set(pool.map((a) => `${a.collection}:${a.artworkId}`))
const poolIndex = new Map(pool.map((a, i) => [`${a.collection}:${a.artworkId}`, i]))

function emit(artwork: Artwork, npyData: Float32Array, keyPrefix: string, componentId: string | null): void {
	const key = `${keyPrefix}:${artwork.artworkId}`
	const inPool = poolKeys.has(key)
	let cluster: number
	let cos: number
	if (inPool) {
		const pi = poolIndex.get(key)!
		cluster = clustering.assignment[pi]!
		cos = cosineToCentroid(points, pi, clustering.centroids, cluster, dim)
	} else {
		const r = nearestCentroid(npyData, artwork.chosen.row * dim, clustering.centroids, K, dim)
		cluster = r.cluster
		cos = r.cosine
	}
	out.push({
		key,
		collection: keyPrefix,
		artworkId: artwork.artworkId,
		path: artwork.chosen.path,
		width: artwork.chosen.width,
		height: artwork.chosen.height,
		longEdgePx: artwork.longEdgePx,
		tier: artwork.tier,
		row: artwork.chosen.row,
		cluster,
		cosineToCentroid: cos,
		inPool,
		componentId,
	})
}

for (const a of shardedArtworks.values()) emit(a, shardedNpy.data, 'sharded', components.componentOf('sharded', a.artworkId))
for (const a of musicArtworksAll.values()) emit(a, musicNpy.data, 'music_artworks', components.componentOf('music_artworks', a.artworkId))
for (const a of freshArtworks.values()) emit(a, freshNpy.data, 'sharded_fresh_15', null)

await writeFile(OUT, JSON.stringify({
	k: K,
	seedHex: '0xc0efface',
	dim,
	poolSize: pool.length,
	universeSize: universeArtworks.length,
	iterations: clustering.iterations,
	converged: clustering.converged,
	clusterSizes: clustering.sizes,
	centroids: Array.from(clustering.centroids),
	rows: out,
}))
console.error(`wrote ${out.length} rows to ${OUT}`)
