/**
 * The artwork-level universe the coverage set is drawn from.
 *
 * Everything here is derived from files that already exist on disk — no image is
 * decoded and no model is run. Dimensions come from the embedding runner's
 * `ids.jsonl`, which recorded them from image headers at embed time (pipeline
 * §7.4.1: filenames lie about resolution, headers do not).
 *
 * The two collections are handled separately because they are different corpora
 * with different identity schemes (pipeline §7.4: substring-matching every
 * sharded artwork id against music-artworks returns zero hits).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** [REVIEWED] decisions.json `d-2026-08-02-embedding-canonical-model`: the canonical
 *  embedding instrument for every v3 consumer, including corpus stratification. */
export const CANONICAL_ARM = 'dinov2-vitl14'

/** [MEASURED] Pipeline §7.1: the 16-character rendition prefix predicts the stored
 *  size perfectly. Counted again from the ids file on 2026-08-03: 2,914 files at
 *  the 300 px prefix and 4,631 at the 640 px prefix, 5 files off-pattern. */
export const SHARDED_RENDITION_PREFIXES: Record<string, number> = {
	ab67616d00001e02: 300,
	ab67616d0000b273: 640,
}

/** [MEASURED] Pipeline §7.4.2 / holdout freeze: keep artworks whose best rendition
 *  satisfies |w/h − 1| ≤ 0.05. Same tolerance the frozen holdout used, so the
 *  candidate populations are the same population. */
export const SQUARE_ASPECT_TOLERANCE = 0.05

/** [MEASURED] Pipeline §7.4.2 / holdout freeze: files at ≤150 px are derived
 *  thumbnails, not sources. Strictly greater than. */
export const MIN_BEST_LONG_EDGE_PX = 150

/** [INHERITED] The holdout freeze's resolution bands, reused verbatim so the
 *  coverage set's tier vocabulary and the holdout's stratum vocabulary are the
 *  same words meaning the same thing. Applied to the long edge of the artwork's
 *  chosen rendition. */
export const TIER_BANDS = [
	{ name: '<=400', maxLongEdge: 400 },
	{ name: '401-640', maxLongEdge: 640 },
	{ name: '641-1024', maxLongEdge: 1024 },
	{ name: '>1024', maxLongEdge: Number.POSITIVE_INFINITY },
] as const

export type TierName = (typeof TIER_BANDS)[number]['name']

/** [MEASURED] Counted from the ids files on 2026-08-03. A mismatch means the
 *  embeddings were regenerated over a different corpus and every count in
 *  COVERAGE_SET.md is stale. */
export const EXPECTED_SHARDED_FILES = 7550
export const EXPECTED_MUSIC_ARTWORKS_FILES = 8595

/** [MEASURED] Holdout freeze counts: 2,757 album-artwork candidates in
 *  music-artworks, of which 413 artworks are held out. */
export const EXPECTED_MUSIC_ARTWORKS_CANDIDATES = 2757
export const EXPECTED_HELD_OUT_ARTWORKS = 413

export type Collection = 'sharded' | 'music_artworks'

export type IdRow = {
	collection: string
	row: number
	path: string
	sha256: string
	status: string
	width: number
	height: number
	format: string
	bytes: number
}

export type Artwork = {
	collection: Collection
	artworkId: string
	/** How the id was derived — `sharded-suffix` is the 24-char suffix of a
	 *  40-hex filename, `sharded-fullstem` an off-pattern sharded file whose stem
	 *  carries no known rendition prefix, `music-stem` the 32-hex stem. */
	artworkIdScheme: 'sharded-suffix' | 'sharded-fullstem' | 'music-stem'
	files: IdRow[]
	/** The rendition this artwork is represented by everywhere downstream. */
	chosen: IdRow
	longEdgePx: number
	tier: TierName
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function tierOf(longEdgePx: number): TierName {
	for (const band of TIER_BANDS) if (longEdgePx <= band.maxLongEdge) return band.name
	throw new Error(`no tier for long edge ${longEdgePx}`)
}

export async function readIdRows(absolutePath: string): Promise<IdRow[]> {
	const text = await readFile(absolutePath, 'utf8')
	const rows: IdRow[] = []
	for (const line of text.split('\n')) {
		if (line.trim().length === 0) continue
		rows.push(JSON.parse(line) as IdRow)
	}
	for (const [index, row] of rows.entries()) {
		if (row.row !== index) throw new Error(`${absolutePath}: row ${index} declares row=${row.row}`)
		if (row.status !== 'ok') throw new Error(`${absolutePath}: row ${index} has status ${row.status}`)
	}
	return rows
}

/** Sharded id: the 24-char suffix when the 16-char rendition prefix is known,
 *  otherwise the whole stem (5 off-pattern files, pipeline §7.2). */
export function shardedArtworkId(filePath: string): {
	id: string
	scheme: 'sharded-suffix' | 'sharded-fullstem'
} {
	const stem = path.basename(filePath).replace(/\.[A-Za-z0-9]+$/, '')
	if (stem.length === 40 && SHARDED_RENDITION_PREFIXES[stem.slice(0, 16)] !== undefined) {
		return { id: stem.slice(16), scheme: 'sharded-suffix' }
	}
	return { id: stem, scheme: 'sharded-fullstem' }
}

/** music-artworks id: the 32-hex stem, with any `_WxH` rendition suffix removed. */
export function musicArtworkId(filePath: string): string {
	const stem = path.basename(filePath).replace(/\.[A-Za-z0-9]+$/, '')
	return stem.replace(/_\d+x\d+$/, '')
}

function hasRenditionSuffix(filePath: string): boolean {
	return /_\d+x\d+\.[^.]+$/.test(filePath)
}

/** Strict ordering, identical to the holdout freeze's `isBetterRendition`:
 *  measured pixel area, then un-suffixed original over derived rendition, then
 *  lexicographic path. The tie rule matters — 502 music-artworks artworks have a
 *  derived AVIF at exactly the original's area (pipeline §7.4.1 trap 2). */
function isBetterRendition(candidate: IdRow, incumbent: IdRow): boolean {
	const candidateArea = candidate.width * candidate.height
	const incumbentArea = incumbent.width * incumbent.height
	if (candidateArea !== incumbentArea) return candidateArea > incumbentArea
	const candidateDerived = hasRenditionSuffix(candidate.path)
	const incumbentDerived = hasRenditionSuffix(incumbent.path)
	if (candidateDerived !== incumbentDerived) return !candidateDerived
	return candidate.path < incumbent.path
}

function buildArtworks(
	rows: IdRow[],
	collection: Collection,
	idOf: (filePath: string) => { id: string; scheme: Artwork['artworkIdScheme'] },
): Map<string, Artwork> {
	const grouped = new Map<string, IdRow[]>()
	const schemes = new Map<string, Artwork['artworkIdScheme']>()
	for (const row of rows) {
		const { id, scheme } = idOf(row.path)
		schemes.set(id, scheme)
		const list = grouped.get(id)
		if (list) list.push(row)
		else grouped.set(id, [row])
	}

	const artworks = new Map<string, Artwork>()
	for (const [id, files] of grouped) {
		files.sort((a, b) => (a.path < b.path ? -1 : 1))
		let chosen = files[0]!
		for (const file of files) if (isBetterRendition(file, chosen)) chosen = file
		const longEdgePx = Math.max(chosen.width, chosen.height)
		artworks.set(id, {
			collection,
			artworkId: id,
			artworkIdScheme: schemes.get(id)!,
			files,
			chosen,
			longEdgePx,
			tier: tierOf(longEdgePx),
		})
	}
	return artworks
}

export function buildShardedArtworks(rows: IdRow[]): Map<string, Artwork> {
	return buildArtworks(rows, 'sharded', shardedArtworkId)
}

export function buildMusicArtworks(rows: IdRow[]): Map<string, Artwork> {
	return buildArtworks(rows, 'music_artworks', (filePath) => ({
		id: musicArtworkId(filePath),
		scheme: 'music-stem' as const,
	}))
}

export function isSquare(row: IdRow): boolean {
	return Math.abs(row.width / row.height - 1) <= SQUARE_ASPECT_TOLERANCE
}

/** The music-artworks album-artwork candidate filter, identical to the holdout
 *  freeze's: square best rendition, best long edge > 150 px, and no file with real
 *  transparency. Returns the reason an artwork was dropped, or null if it is a
 *  candidate. */
export function musicArtworkDropReason(
	artwork: Artwork,
	transparentArtworkIds: Set<string>,
): 'non-square' | 'thumbnail-only' | 'real-transparency' | null {
	if (!isSquare(artwork.chosen)) return 'non-square'
	if (artwork.longEdgePx <= MIN_BEST_LONG_EDGE_PX) return 'thumbnail-only'
	if (transparentArtworkIds.has(artwork.artworkId)) return 'real-transparency'
	return null
}

export async function loadTransparentArtworkIds(absolutePath: string): Promise<Set<string>> {
	const parsed = JSON.parse(await readFile(absolutePath, 'utf8')) as { real: Array<{ path: string }> }
	const ids = new Set<string>()
	for (const entry of parsed.real) ids.add(musicArtworkId(entry.path))
	return ids
}

// ---------------------------------------------------------------------------
// Near-duplicate components
// ---------------------------------------------------------------------------

export type Census = {
	method: { threshold: number; arms_scanned: string[] }
	counts: Record<string, unknown>
	pairs: Array<{
		cosine: number
		a: { path: string; artwork_id: string; collection: string }
		b: { path: string; artwork_id: string; collection: string }
	}>
}

/** Strip the census's `<collection>:` prefix from a tagged artwork id. */
export function censusArtworkId(tagged: string): string {
	const colon = tagged.indexOf(':')
	return colon === -1 ? tagged : tagged.slice(colon + 1)
}

/**
 * Connected components of the near-duplicate graph, keyed by `<collection>:<id>`.
 * Artworks with no census edge are singletons and are not stored — `componentOf`
 * returns the artwork's own key for those.
 *
 * The census union over three arms is used (the same conservative graph the
 * holdout freeze used); the census is a LOWER BOUND on the real duplicate
 * structure, which is why nothing here treats component isolation as proof of
 * independence — only as the strongest available guard.
 */
export class NearDupComponents {
	private parent = new Map<string, string>()

	constructor(census: Census) {
		for (const pair of census.pairs) {
			this.union(this.key(pair.a.collection, censusArtworkId(pair.a.artwork_id)), this.key(pair.b.collection, censusArtworkId(pair.b.artwork_id)))
		}
	}

	key(collection: string, artworkId: string): string {
		return `${collection}:${artworkId}`
	}

	private find(node: string): string {
		let root = node
		while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!
		// Path compression, iterative.
		let walk = node
		while (this.parent.has(walk) && this.parent.get(walk) !== root) {
			const next = this.parent.get(walk)!
			this.parent.set(walk, root)
			walk = next
		}
		return root
	}

	private union(a: string, b: string): void {
		if (!this.parent.has(a)) this.parent.set(a, a)
		if (!this.parent.has(b)) this.parent.set(b, b)
		const rootA = this.find(a)
		const rootB = this.find(b)
		if (rootA === rootB) return
		// Deterministic merge: the lexicographically smaller root wins, so the
		// component id does not depend on pair order.
		if (rootA < rootB) this.parent.set(rootB, rootA)
		else this.parent.set(rootA, rootB)
	}

	componentOf(collection: string, artworkId: string): string {
		const node = this.key(collection, artworkId)
		return this.parent.has(node) ? this.find(node) : node
	}

	/** Every member of every non-singleton component, grouped by component id. */
	members(): Map<string, string[]> {
		const grouped = new Map<string, string[]>()
		for (const node of this.parent.keys()) {
			const root = this.find(node)
			const list = grouped.get(root)
			if (list) list.push(node)
			else grouped.set(root, [node])
		}
		for (const list of grouped.values()) list.sort()
		return grouped
	}
}

// ---------------------------------------------------------------------------
// Seeded RNG (same generator the holdout freeze used)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
	const out = items.slice()
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1))
		const tmp = out[i]!
		out[i] = out[j]!
		out[j] = tmp
	}
	return out
}
