/**
 * music-artworks holdout freeze (v3 Phase 0, PHASE_0_DECISIONS.md §5).
 *
 * Reserves a random ~15% of the album-artwork candidates in `music-artworks/`,
 * stratified by resolution band. The result is frozen in
 * `research/v3/data/holdout/holdout.json` and summarised in `HOLDOUT.md`.
 *
 * VERSION 2 — the unit of selection is a NEAR-DUPLICATE COMPONENT, not an artwork.
 * Version 1.0.0 drew on artwork ids and leaked: the embedding near-duplicate census
 * (`research/v3/data/embeddings/near-dup-census.json`) found thousands of pairs of
 * near-identical images carrying DIFFERENT artwork ids, and 224 of v1's 414 held-out
 * artworks had a near-duplicate sitting in the working set. Nothing had consumed v1,
 * so the reviewer authorised a clean redraw (2026-08-02). Version 2 builds the
 * near-duplicate graph, takes connected components, and holds out whole components.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts --verify
 *
 * The script is idempotent: every input to the output (seed, freeze date, script
 * version, file measurements, census) is either pinned in code or read from the data,
 * so a re-run produces byte-identical files. `--verify` re-derives the selection and
 * fails if the committed files disagree.
 *
 * Dimensions are ALWAYS read from image headers, never from the `_WxH` filename
 * suffix — 719 AVIFs in this collection disagree with their own header
 * (ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §7.4.1).
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// ---------------------------------------------------------------------------
// Constants — every value named, every value with a provenance tag.
// ---------------------------------------------------------------------------

/** [HELD] The project's music-artworks holdout seed. Frozen 2026-08-02.
 *  The v1→v2 redraw came from changing the unit of selection (artwork → near-dup
 *  component), not from changing this. Nothing had consumed v1, so no claim was
 *  voided. Changing this value re-rolls the holdout and voids every end-of-campaign
 *  claim made against the frozen list. Never change it. */
const HOLDOUT_SEED = 0x5ea1_f00d

/** [REVIEWED] PHASE_0_DECISIONS.md §5: "reserve a random ~15%". Measured on
 *  ARTWORKS, achieved by drawing whole components until the artwork count lands. */
const HOLDOUT_FRACTION = 0.15

/** [HELD] Pinned so re-runs are byte-identical. The date the freeze was made. */
const FREEZE_DATE = '2026-08-02'

/** [HELD] Bumped when the selection algorithm changes (which re-rolls the holdout).
 *  Formatting-only changes must not bump it. */
const SCRIPT_VERSION = '2.0.0'

/** [HELD] The version this one replaces. */
const SUPERSEDES_VERSION = '1.0.0'

/** [HELD] Shape of holdout.json. Bumped when fields are added or renamed. */
const SCHEMA_VERSION = 2

/** [MEASURED] Oracle pipeline §7.4.2: keep artworks whose best rendition
 *  satisfies |w/h − 1| ≤ 0.05. A strict w == h test drops ~208 legitimately
 *  slightly-cropped covers; this tolerance yields 3,097 candidates. */
const SQUARE_ASPECT_TOLERANCE = 0.05

/** [MEASURED] Oracle pipeline §7.4.2: the 1,459 files at ≤150 px (dominated by
 *  147×147 AVIF) are derived thumbnails, not sources. Strictly greater than. */
const MIN_BEST_LONG_EDGE_PX = 150

/** [REVIEWED] Near-duplicate cosine threshold. The census is computed at 0.95 and
 *  its pairs were validated as true duplicates. Leak prevention wants the
 *  conservative graph, so we take the UNION over the three embedding arms — a pair
 *  counts as an edge if ANY arm put it at >= 0.95. */
const NEAR_DUP_COSINE_THRESHOLD = 0.95

/** [HELD] The three arms the union is taken over, pinned as a constant rather than
 *  described in prose. PHASE_0_DECISIONS.md §5 names the component rule — the union
 *  over THESE arms at THIS threshold — as one of the three things that re-rolls the
 *  holdout, and C3 makes a re-roll authorisation-gated and reviewer-only. Before this
 *  pin the only identity check on the census was its pair COUNT, so a census silently
 *  recomputed over a different arm set that happened to land on 6,386 pairs would have
 *  passed every check. Order-insensitive on compare; listed in the census's own order.
 *  Changing this list is a holdout re-roll and needs the C3 authorisation. */
const EXPECTED_CENSUS_ARMS = ['dinov2-vitl14', 'pe-core-l14', 'dinov3-vitl16'] as const

/** [HELD] The census's primary arm, i.e. the canonical embedding instrument of
 *  `d-2026-08-02-embedding-canonical-model`. The union is what the leak check uses;
 *  this is pinned so a census built around a different primary is not silently
 *  accepted as the same instrument. */
const EXPECTED_CENSUS_PRIMARY_ARM = 'dinov2-vitl14'

/** Derived from the pin above so the prose in holdout.json cannot drift from the
 *  assertion that enforces it. */
const NEAR_DUP_ARM_CRITERION = `any_arm (union of ${EXPECTED_CENSUS_ARMS.join(', ')})`

/** [REVIEWED] Resolution bands for stratification, on the long edge of the best
 *  rendition in a component (max across its member artworks). 400 and 640 are the
 *  CDN's common derived sizes; 1024 is the ceiling above which the oracle pipeline
 *  (§7.4) says the collection is too thin to conclude anything. */
const STRATUM_BANDS = [
	{ name: '<=400', maxLongEdge: 400 },
	{ name: '401-640', maxLongEdge: 640 },
	{ name: '641-1024', maxLongEdge: 1024 },
	{ name: '>1024', maxLongEdge: Number.POSITIVE_INFINITY },
] as const

type StratumName = (typeof STRATUM_BANDS)[number]['name']

/** [MEASURED] Oracle pipeline §7.4.2 measured 3,097 square candidates before the
 *  transparency exclusion. Allow slack for decoder/measurement differences; a
 *  count outside this band means the enumeration or the aspect filter broke. */
const SQUARE_CANDIDATE_PLAUSIBLE_RANGE = { min: 2900, max: 3300 }

/** [MEASURED] Candidates after the <=150 px tail and the 797-file real-transparency
 *  exclusion are removed. Upper bound is the pre-exclusion measurement; the lower
 *  bound assumes the exclusion cannot plausibly remove more than ~25%. */
const FINAL_CANDIDATE_PLAUSIBLE_RANGE = { min: 2300, max: 3097 }

/** [MEASURED] Oracle pipeline §7.4: 8,595 files, 4,088 distinct artworks. */
const EXPECTED_FILE_COUNT = 8595
const EXPECTED_ARTWORK_COUNT = 4088

/** [MEASURED] PHASE_0_DECISIONS.md §1: 797 files with genuinely transparent
 *  pixels (disc scans, press-photo cutouts) — not album artwork. */
const EXPECTED_TRANSPARENCY_EXCLUSION_FILES = 797

/** [MEASURED] near-dup-census.json: 6,386 crossing pairs in the union of arms,
 *  of which the census reports zero cross-collection. Asserted, not assumed. */
const EXPECTED_CENSUS_UNION_PAIRS = 6386

/** [MEASURED] Component granularity makes an exact 15% unreachable: the draw adds
 *  whole components, and the largest is 7 artworks. Overall the achievable error is
 *  well under a percent; the thin `<=400` stratum (93 artworks) is the binding case,
 *  where a single 2-artwork component is already 2.2%. */
const FRACTION_TOLERANCE_OVERALL = 0.01
const FRACTION_TOLERANCE_PER_STRATUM = 0.03

/** [INHERITED] Extensions present in the collection (case-insensitive). */
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpg', '.jpeg', '.png'])

/** [INHERITED] `<32-hex>[_WxH].<ext>` — the 32-hex stem is the artwork id. */
const FILENAME_PATTERN = /^([0-9a-f]{32})(?:_(\d+)x(\d+))?\.([A-Za-z]+)$/

/** [INHERITED] The census prefixes music-artworks ids with this collection tag. */
const CENSUS_MUSIC_ARTWORKS_COLLECTION = 'music_artworks'

/** [REVIEWED] A component this large (in FILES) is template artwork or a heavily
 *  reissued cover, not an incidental pair. Same cut the census uses for its own
 *  named-components list. */
const NAMED_COMPONENT_MIN_FILES = 8

/** [MEASURED] near-dup-census.json `counts.undercount_vs_ground_truth_pct`: at this
 *  threshold the scan misses 46.3% of duplicate pairs the filename ground truth
 *  already knows about. Quoted in the docs as the lower-bound caveat. */
const CENSUS_UNDERCOUNT_PCT = 46.3

/** [UNCALIBRATED] Parallel header reads. Header-only metadata is cheap; this is
 *  just enough to keep the disk busy without exhausting file descriptors. */
const METADATA_CONCURRENCY = 24

// ---------------------------------------------------------------------------
// Paths (all derived from this file's location — no cwd dependence).
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const COLLECTION_ROOT = path.join(REPO_ROOT, 'music-artworks')
const EXCLUSION_FILE = path.join(REPO_ROOT, 'research/v3/data/source-surveys/pixel_results.json')
const CENSUS_FILE = path.join(REPO_ROOT, 'research/v3/data/embeddings/near-dup-census.json')
const OUT_DIR = path.join(REPO_ROOT, 'research/v3/data/holdout')
const HOLDOUT_JSON = path.join(OUT_DIR, 'holdout.json')
const HOLDOUT_MD = path.join(OUT_DIR, 'HOLDOUT.md')
const MEASUREMENT_CACHE = path.join(OUT_DIR, 'measurements.jsonl')

// ---------------------------------------------------------------------------
// Deterministic RNG — mulberry32, so the selection is reproducible from the
// code alone. Never Math.random.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** In-place Fisher-Yates with the supplied RNG. */
function shuffle<T>(items: T[], rng: () => number): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1))
		const tmp = items[i]!
		items[i] = items[j]!
		items[j] = tmp
	}
	return items
}

// ---------------------------------------------------------------------------
// Union-find over artwork ids.
// ---------------------------------------------------------------------------

class UnionFind {
	private parent = new Map<string, string>()

	add(id: string): void {
		if (!this.parent.has(id)) this.parent.set(id, id)
	}

	find(id: string): string {
		let root = id
		while (this.parent.get(root) !== root) root = this.parent.get(root)!
		let walk = id
		while (this.parent.get(walk) !== root) {
			const next = this.parent.get(walk)!
			this.parent.set(walk, root)
			walk = next
		}
		return root
	}

	union(a: string, b: string): void {
		const rootA = this.find(a)
		const rootB = this.find(b)
		if (rootA === rootB) return
		// Deterministic merge direction: the smaller id becomes the root.
		if (rootA < rootB) this.parent.set(rootB, rootA)
		else this.parent.set(rootA, rootB)
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Measurement = {
	/** Path relative to the repo root, POSIX separators. */
	path: string
	bytes: number
	width: number
	height: number
	/** As reported by sharp. Note AVIF reports as `heif` — its container. */
	format: string
	/** Lowercased file extension without the dot, from the filename. */
	extension?: string
}

type Artwork = {
	id: string
	files: Measurement[]
	best: Measurement
}

type Component = {
	/** Lexicographically smallest member id — stable across runs. */
	id: string
	members: Artwork[]
	artworkCount: number
	fileCount: number
	/** Long edge of the largest best-rendition across members. */
	maxLongEdgePx: number
	stratum: StratumName
}

type HeldFile = Measurement & { sha256: string }

// ---------------------------------------------------------------------------
// Enumeration and measurement
// ---------------------------------------------------------------------------

async function enumerateFiles(root: string): Promise<string[]> {
	const found: string[] = []
	const walk = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) await walk(full)
			else if (entry.isFile()) found.push(full)
		}
	}
	await walk(root)
	found.sort()
	return found
}

function relative(absolutePath: string): string {
	return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/')
}

function artworkIdOf(absolutePath: string): string {
	const name = path.basename(absolutePath)
	const match = FILENAME_PATTERN.exec(name)
	if (!match) throw new Error(`filename does not match <32-hex>[_WxH].<ext>: ${relative(absolutePath)}`)
	const extension = `.${match[4]!.toLowerCase()}`
	if (!IMAGE_EXTENSIONS.has(extension)) {
		throw new Error(`unexpected extension ${extension}: ${relative(absolutePath)}`)
	}
	return match[1]!
}

async function loadMeasurementCache(): Promise<Map<string, Measurement>> {
	const cache = new Map<string, Measurement>()
	let text: string
	try {
		text = await readFile(MEASUREMENT_CACHE, 'utf8')
	} catch {
		return cache
	}
	for (const line of text.split('\n')) {
		if (!line) continue
		const record = JSON.parse(line) as Measurement
		cache.set(record.path, record)
	}
	return cache
}

/**
 * Measure every file's dimensions from its header. Cached by (path, byte size)
 * so re-runs are fast; a file whose size changed is re-measured.
 */
async function measureAll(absolutePaths: string[]): Promise<Measurement[]> {
	const cache = await loadMeasurementCache()
	const results: Measurement[] = new Array(absolutePaths.length)
	let nextIndex = 0
	let measured = 0
	let reused = 0

	const worker = async (): Promise<void> => {
		for (;;) {
			const index = nextIndex++
			if (index >= absolutePaths.length) return
			const absolutePath = absolutePaths[index]!
			const rel = relative(absolutePath)
			const { size } = await stat(absolutePath)
			const cached = cache.get(rel)
			if (cached && cached.bytes === size) {
				results[index] = cached
				reused++
				continue
			}
			const metadata = await sharp(absolutePath).metadata()
			if (!metadata.width || !metadata.height) {
				throw new Error(`no dimensions in header: ${rel}`)
			}
			results[index] = {
				path: rel,
				bytes: size,
				width: metadata.width,
				height: metadata.height,
				format: metadata.format ?? 'unknown',
			}
			measured++
			if (measured % 500 === 0) process.stderr.write(`  measured ${measured} files\n`)
		}
	}

	await Promise.all(Array.from({ length: METADATA_CONCURRENCY }, worker))
	process.stderr.write(`  header reads: ${measured} new, ${reused} from cache\n`)

	const sorted = [...results].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	await writeFile(MEASUREMENT_CACHE, `${sorted.map((r) => JSON.stringify(r)).join('\n')}\n`)

	// Enrich after the cache is written, so cache records stay a pure header survey.
	// sharp reports AVIF as `heif`; the extension keeps the frozen file readable.
	for (const record of results) {
		record.extension = path.extname(record.path).slice(1).toLowerCase()
	}
	return results
}

/** True when the filename carries a `_WxH` rendition suffix (a derived rendition). */
function hasRenditionSuffix(m: Measurement): boolean {
	return /_\d+x\d+\.[^.]+$/.test(m.path)
}

/** Strict ordering: measured area, then original-over-derived, then path. */
function isBetterRendition(candidate: Measurement, incumbent: Measurement): boolean {
	const candidateArea = candidate.width * candidate.height
	const incumbentArea = incumbent.width * incumbent.height
	if (candidateArea !== incumbentArea) return candidateArea > incumbentArea
	const candidateDerived = hasRenditionSuffix(candidate)
	const incumbentDerived = hasRenditionSuffix(incumbent)
	if (candidateDerived !== incumbentDerived) return !candidateDerived
	return candidate.path < incumbent.path
}

function groupByArtwork(measurements: Measurement[]): Map<string, Artwork> {
	const byId = new Map<string, Measurement[]>()
	for (const measurement of measurements) {
		const id = artworkIdOf(path.join(REPO_ROOT, measurement.path))
		const list = byId.get(id)
		if (list) list.push(measurement)
		else byId.set(id, [measurement])
	}

	const artworks = new Map<string, Artwork>()
	for (const [id, files] of byId) {
		// Deterministic file order inside an artwork.
		files.sort((a, b) => (a.path < b.path ? -1 : 1))
		// Best rendition = largest MEASURED pixel area (never filename-declared).
		// Ties matter: 502 artworks have a derived `_WxH` rendition tied on measured
		// area with the un-suffixed original (the CDN re-encoded at the same size).
		// Prefer the un-suffixed original there — it is the source, not a re-encode —
		// then fall back to the lexicographically smallest path for reproducibility.
		let best = files[0]!
		for (const file of files) {
			if (isBetterRendition(file, best)) best = file
		}
		artworks.set(id, { id, files, best })
	}
	return artworks
}

async function loadExcludedArtworkIds(): Promise<{ ids: Set<string>; fileCount: number }> {
	const parsed = JSON.parse(await readFile(EXCLUSION_FILE, 'utf8')) as {
		real: Array<{ path: string }>
	}
	const ids = new Set<string>()
	for (const entry of parsed.real) ids.add(artworkIdOf(entry.path))
	return { ids, fileCount: parsed.real.length }
}

// ---------------------------------------------------------------------------
// Near-duplicate census
// ---------------------------------------------------------------------------

type CensusPair = {
	cosine: number
	cosine_by_arm: Record<string, number>
	found_by_arms: string[]
	a: { path: string; artwork_id: string; collection: string }
	b: { path: string; artwork_id: string; collection: string }
}

type Census = {
	written_at: string
	method: { threshold: number; arms_scanned: string[]; primary_arm?: string }
	pairs: CensusPair[]
}

/** Strip the census's `<collection>:` prefix from an artwork id. */
function censusArtworkId(tagged: string): string {
	const colon = tagged.indexOf(':')
	return colon === -1 ? tagged : tagged.slice(colon + 1)
}

async function loadCensus(): Promise<{ census: Census; sha256: string; crossCollectionPairs: number }> {
	const raw = await readFile(CENSUS_FILE)
	const census = JSON.parse(raw.toString('utf8')) as Census
	let crossCollectionPairs = 0
	for (const pair of census.pairs) {
		if (pair.a.collection !== pair.b.collection) crossCollectionPairs++
	}
	return {
		census,
		sha256: createHash('sha256').update(raw).digest('hex'),
		crossCollectionPairs,
	}
}

// ---------------------------------------------------------------------------
// Filtering / stratification helpers
// ---------------------------------------------------------------------------

function isSquare(m: Measurement): boolean {
	return Math.abs(m.width / m.height - 1) <= SQUARE_ASPECT_TOLERANCE
}

function longEdge(m: Measurement): number {
	return Math.max(m.width, m.height)
}

function bandOf(edge: number): StratumName {
	for (const band of STRATUM_BANDS) if (edge <= band.maxLongEdge) return band.name
	throw new Error(`no stratum for long edge ${edge}`)
}

async function sha256File(absolutePath: string): Promise<string> {
	return await new Promise((resolve, reject) => {
		const hash = createHash('sha256')
		createReadStream(absolutePath)
			.on('data', (chunk) => hash.update(chunk))
			.on('error', reject)
			.on('end', () => resolve(hash.digest('hex')))
	})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const verifyOnly = process.argv.includes('--verify')
	await mkdir(OUT_DIR, { recursive: true })

	process.stderr.write(`enumerating ${relative(COLLECTION_ROOT)} ...\n`)
	const absolutePaths = await enumerateFiles(COLLECTION_ROOT)
	process.stderr.write(`  ${absolutePaths.length} files\n`)

	process.stderr.write('measuring dimensions from headers ...\n')
	const measurements = await measureAll(absolutePaths)
	const artworks = groupByArtwork(measurements)
	process.stderr.write(`  ${artworks.size} artworks\n`)

	const { ids: excludedIds, fileCount: excludedFileCount } = await loadExcludedArtworkIds()

	// --- candidate filtering ------------------------------------------------
	const squareArtworks: Artwork[] = []
	const droppedNonSquare: Artwork[] = []
	const droppedThumbnailOnly: Artwork[] = []
	const droppedTransparent: Artwork[] = []
	const candidates: Artwork[] = []

	for (const artwork of [...artworks.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
		if (!isSquare(artwork.best)) {
			droppedNonSquare.push(artwork)
			continue
		}
		squareArtworks.push(artwork)
		if (longEdge(artwork.best) <= MIN_BEST_LONG_EDGE_PX) {
			droppedThumbnailOnly.push(artwork)
			continue
		}
		if (excludedIds.has(artwork.id)) {
			droppedTransparent.push(artwork)
			continue
		}
		candidates.push(artwork)
	}
	const candidateById = new Map(candidates.map((a) => [a.id, a]))

	// --- near-duplicate components -----------------------------------------
	process.stderr.write('building the near-duplicate graph ...\n')
	const { census, sha256: censusSha, crossCollectionPairs } = await loadCensus()

	const unionFind = new UnionFind()
	for (const artwork of candidates) unionFind.add(artwork.id)

	let edgesUsed = 0
	let edgesOneEndpointOutsideCandidates = 0
	let edgesBothEndpointsOutsideCandidates = 0
	let edgesOtherCollection = 0
	const usedEdges: Array<[string, string]> = []

	for (const pair of census.pairs) {
		if (
			pair.a.collection !== CENSUS_MUSIC_ARTWORKS_COLLECTION ||
			pair.b.collection !== CENSUS_MUSIC_ARTWORKS_COLLECTION
		) {
			edgesOtherCollection++
			continue
		}
		const a = censusArtworkId(pair.a.artwork_id)
		const b = censusArtworkId(pair.b.artwork_id)
		const inA = candidateById.has(a)
		const inB = candidateById.has(b)
		if (inA && inB) {
			unionFind.union(a, b)
			usedEdges.push([a, b])
			edgesUsed++
		} else if (inA || inB) edgesOneEndpointOutsideCandidates++
		else edgesBothEndpointsOutsideCandidates++
	}

	const membersByRoot = new Map<string, Artwork[]>()
	for (const artwork of candidates) {
		const root = unionFind.find(artwork.id)
		const list = membersByRoot.get(root)
		if (list) list.push(artwork)
		else membersByRoot.set(root, [artwork])
	}

	const components: Component[] = []
	for (const members of membersByRoot.values()) {
		members.sort((a, b) => (a.id < b.id ? -1 : 1))
		const maxLongEdgePx = Math.max(...members.map((m) => longEdge(m.best)))
		components.push({
			id: members[0]!.id,
			members,
			artworkCount: members.length,
			fileCount: members.reduce((n, m) => n + m.files.length, 0),
			maxLongEdgePx,
			stratum: bandOf(maxLongEdgePx),
		})
	}
	components.sort((a, b) => (a.id < b.id ? -1 : 1))
	process.stderr.write(`  ${components.length} components over ${candidates.length} candidate artworks\n`)

	const sizeHistogram = new Map<number, number>()
	for (const component of components) {
		sizeHistogram.set(component.artworkCount, (sizeHistogram.get(component.artworkCount) ?? 0) + 1)
	}
	const namedComponents = components
		.filter((c) => c.fileCount >= NAMED_COMPONENT_MIN_FILES)
		.sort((a, b) => b.fileCount - a.fileCount || (a.id < b.id ? -1 : 1))

	// --- stratify (component level) -----------------------------------------
	const byStratum = new Map<StratumName, Component[]>(STRATUM_BANDS.map((b) => [b.name, [] as Component[]]))
	for (const component of components) byStratum.get(component.stratum)!.push(component)

	// --- select -------------------------------------------------------------
	// Whole components, drawn as a random prefix of a seeded shuffle, until the
	// running ARTWORK count reaches the stratum's 15% target. The boundary component
	// is included iff that lands closer to the target. A random prefix keeps the
	// draw independent of component size (no systematic bias against big components).
	const rng = mulberry32(HOLDOUT_SEED)
	const heldComponents: Component[] = []
	const perStratum: Array<{
		stratum: StratumName
		components: number
		candidateArtworks: number
		heldComponents: number
		heldArtworks: number
		fraction: number
	}> = []

	for (const band of STRATUM_BANDS) {
		const pool = byStratum.get(band.name)!.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
		const poolArtworks = pool.reduce((n, c) => n + c.artworkCount, 0)
		const target = poolArtworks * HOLDOUT_FRACTION
		const shuffled = shuffle(pool.slice(), rng)

		const drawn: Component[] = []
		let running = 0
		for (const component of shuffled) {
			if (running >= target) break
			const withComponent = running + component.artworkCount
			if (withComponent <= target) {
				drawn.push(component)
				running = withComponent
				continue
			}
			if (Math.abs(withComponent - target) <= Math.abs(running - target)) {
				drawn.push(component)
				running = withComponent
			}
			break
		}

		drawn.sort((a, b) => (a.id < b.id ? -1 : 1))
		heldComponents.push(...drawn)
		perStratum.push({
			stratum: band.name,
			components: pool.length,
			candidateArtworks: poolArtworks,
			heldComponents: drawn.length,
			heldArtworks: running,
			fraction: poolArtworks === 0 ? 0 : running / poolArtworks,
		})
	}
	heldComponents.sort((a, b) => (a.id < b.id ? -1 : 1))

	const heldArtworks = heldComponents
		.flatMap((c) => c.members.map((m) => ({ artwork: m, component: c })))
		.sort((a, b) => (a.artwork.id < b.artwork.id ? -1 : 1))
	const heldIds = new Set(heldArtworks.map((h) => h.artwork.id))

	// --- hash held-out files ------------------------------------------------
	const heldFileTotal = heldArtworks.reduce((n, h) => n + h.artwork.files.length, 0)
	process.stderr.write(`hashing ${heldFileTotal} held-out files ...\n`)
	const heldRecords: Array<{
		id: string
		stratum: StratumName
		componentId: string
		componentArtworkCount: number
		bestRenditionPath: string
		bestLongEdgePx: number
		ownLongEdgeBand: StratumName
		renditionCount: number
		files: HeldFile[]
	}> = []
	for (const { artwork, component } of heldArtworks) {
		const files: HeldFile[] = []
		for (const file of artwork.files) {
			files.push({ ...file, sha256: await sha256File(path.join(REPO_ROOT, file.path)) })
		}
		heldRecords.push({
			id: artwork.id,
			stratum: component.stratum,
			componentId: component.id,
			componentArtworkCount: component.artworkCount,
			bestRenditionPath: artwork.best.path,
			bestLongEdgePx: longEdge(artwork.best),
			ownLongEdgeBand: bandOf(longEdge(artwork.best)),
			renditionCount: files.length,
			files,
		})
	}

	// --- sanity checks (fail loudly) ---------------------------------------
	const problems: string[] = []
	const check = (ok: boolean, message: string): void => {
		if (!ok) problems.push(message)
	}

	check(
		absolutePaths.length === EXPECTED_FILE_COUNT,
		`file count ${absolutePaths.length} != surveyed ${EXPECTED_FILE_COUNT} — collection changed`,
	)
	check(
		artworks.size === EXPECTED_ARTWORK_COUNT,
		`artwork count ${artworks.size} != surveyed ${EXPECTED_ARTWORK_COUNT} — collection changed`,
	)
	check(
		excludedFileCount === EXPECTED_TRANSPARENCY_EXCLUSION_FILES,
		`exclusion list has ${excludedFileCount} files, expected ${EXPECTED_TRANSPARENCY_EXCLUSION_FILES}`,
	)
	check(
		squareArtworks.length >= SQUARE_CANDIDATE_PLAUSIBLE_RANGE.min &&
			squareArtworks.length <= SQUARE_CANDIDATE_PLAUSIBLE_RANGE.max,
		`square-artwork count ${squareArtworks.length} outside plausible range ` +
			`[${SQUARE_CANDIDATE_PLAUSIBLE_RANGE.min}, ${SQUARE_CANDIDATE_PLAUSIBLE_RANGE.max}]`,
	)
	check(
		candidates.length >= FINAL_CANDIDATE_PLAUSIBLE_RANGE.min &&
			candidates.length <= FINAL_CANDIDATE_PLAUSIBLE_RANGE.max,
		`candidate count ${candidates.length} outside plausible range ` +
			`[${FINAL_CANDIDATE_PLAUSIBLE_RANGE.min}, ${FINAL_CANDIDATE_PLAUSIBLE_RANGE.max}]`,
	)
	check(droppedTransparent.length > 0, 'transparency exclusion removed zero artworks — list not applied')
	for (const id of excludedIds) {
		if (!artworks.has(id)) problems.push(`exclusion list names an artwork not in the collection: ${id}`)
	}
	for (const record of heldRecords) {
		if (excludedIds.has(record.id)) problems.push(`held-out artwork is on the exclusion list: ${record.id}`)
	}

	// Census assertions: the census must be the one we expect, and its
	// "no cross-collection pairs" claim is asserted rather than assumed.
	check(
		census.method.threshold === NEAR_DUP_COSINE_THRESHOLD,
		`census threshold ${census.method.threshold} != ${NEAR_DUP_COSINE_THRESHOLD}`,
	)
	check(
		census.pairs.length === EXPECTED_CENSUS_UNION_PAIRS,
		`census has ${census.pairs.length} pairs, expected ${EXPECTED_CENSUS_UNION_PAIRS}`,
	)

	// The component rule is the union over a NAMED arm set, not "three arms". Assert the
	// list itself, not just the pair count: two different arm sets can agree on a count.
	const armsScanned = census.method.arms_scanned ?? []
	const armsSeen = [...armsScanned].sort()
	const armsExpected = [...EXPECTED_CENSUS_ARMS].sort()
	check(
		armsSeen.length === armsExpected.length && armsSeen.every((arm, i) => arm === armsExpected[i]),
		`census arms_scanned [${armsScanned.join(', ')}] != pinned arm set ` +
			`[${EXPECTED_CENSUS_ARMS.join(', ')}] — this is a different component rule, and changing it ` +
			'is a holdout re-roll (PHASE_0_DECISIONS.md §5, C3 authorisation)',
	)
	check(
		census.method.primary_arm === EXPECTED_CENSUS_PRIMARY_ARM,
		`census primary_arm ${String(census.method.primary_arm)} != ${EXPECTED_CENSUS_PRIMARY_ARM}`,
	)
	// And no pair may be attributed to an arm outside the pinned set — otherwise an extra
	// arm could contribute edges while `arms_scanned` still read as expected.
	{
		const pinned = new Set<string>(EXPECTED_CENSUS_ARMS)
		const strays = new Set<string>()
		for (const pair of census.pairs) {
			for (const arm of pair.found_by_arms) if (!pinned.has(arm)) strays.add(arm)
		}
		check(
			strays.size === 0,
			`census pairs attributed to arms outside the pinned set: ${[...strays].sort().join(', ')}`,
		)
	}
	check(crossCollectionPairs === 0, `census has ${crossCollectionPairs} cross-collection pairs, expected 0`)
	check(edgesUsed > 0, 'no near-duplicate edges applied — census not wired up')
	for (const pair of census.pairs) {
		if (pair.found_by_arms.length === 0) {
			problems.push('census pair with no arm attribution — the union graph is not well defined')
			break
		}
	}

	// THE leak check: no census edge (any arm, >= threshold) crosses the boundary.
	let crossingEdges = 0
	for (const [a, b] of usedEdges) {
		if (heldIds.has(a) !== heldIds.has(b)) crossingEdges++
	}
	check(crossingEdges === 0, `${crossingEdges} near-duplicate edges cross the holdout boundary`)

	// Residual path: a held-out artwork can have a near-duplicate among the artworks
	// the candidate filters threw away (non-square, thumbnail-only, transparent).
	// Those are in nobody's working set, so this is not a leak today — but if any of
	// them is ever pulled into development work, it becomes one. Publish the list.
	const nonCandidateQuarantine = new Set<string>()
	for (const pair of census.pairs) {
		if (
			pair.a.collection !== CENSUS_MUSIC_ARTWORKS_COLLECTION ||
			pair.b.collection !== CENSUS_MUSIC_ARTWORKS_COLLECTION
		) {
			continue
		}
		const a = censusArtworkId(pair.a.artwork_id)
		const b = censusArtworkId(pair.b.artwork_id)
		if (heldIds.has(a) && !candidateById.has(b)) nonCandidateQuarantine.add(b)
		if (heldIds.has(b) && !candidateById.has(a)) nonCandidateQuarantine.add(a)
	}
	const quarantineIds = [...nonCandidateQuarantine].sort()
	for (const id of quarantineIds) {
		if (candidateById.has(id)) problems.push(`quarantine id is a candidate, which is a contradiction: ${id}`)
	}

	// Components are whole on one side.
	for (const component of components) {
		const inside = component.members.filter((m) => heldIds.has(m.id)).length
		if (inside !== 0 && inside !== component.artworkCount) {
			problems.push(`component ${component.id} is split: ${inside}/${component.artworkCount} held out`)
		}
	}

	// Dimensions, hashes, and rendition completeness for every held-out artwork.
	for (const record of heldRecords) {
		const source = candidateById.get(record.id)
		if (!source) {
			problems.push(`held-out artwork is not a candidate: ${record.id}`)
			continue
		}
		if (record.files.length !== source.files.length) {
			problems.push(`held-out artwork ${record.id} is missing renditions`)
		}
		if (record.files.length === 0) problems.push(`held-out artwork has no files: ${record.id}`)
		for (const file of record.files) {
			if (!Number.isInteger(file.width) || !Number.isInteger(file.height) || file.width < 1 || file.height < 1) {
				problems.push(`held-out file missing dimensions: ${file.path}`)
			}
			if (!/^[0-9a-f]{64}$/.test(file.sha256)) problems.push(`bad sha256 for ${file.path}`)
		}
	}

	check(heldIds.size === heldRecords.length, 'duplicate artwork ids in the holdout')
	const totalHeld = heldRecords.length
	const overallFraction = totalHeld / candidates.length
	check(
		Math.abs(overallFraction - HOLDOUT_FRACTION) <= FRACTION_TOLERANCE_OVERALL,
		`overall holdout fraction ${overallFraction.toFixed(4)} is more than ` +
			`${FRACTION_TOLERANCE_OVERALL} from ${HOLDOUT_FRACTION}`,
	)
	for (const row of perStratum) {
		if (row.candidateArtworks > 0 && Math.abs(row.fraction - HOLDOUT_FRACTION) > FRACTION_TOLERANCE_PER_STRATUM) {
			problems.push(
				`stratum ${row.stratum} holdout fraction ${row.fraction.toFixed(4)} is more than ` +
					`${FRACTION_TOLERANCE_PER_STRATUM} from ${HOLDOUT_FRACTION}`,
			)
		}
	}

	if (problems.length > 0) {
		process.stderr.write(`\nSANITY CHECKS FAILED (${problems.length}):\n`)
		for (const problem of problems) process.stderr.write(`  - ${problem}\n`)
		process.exit(1)
	}

	// --- write --------------------------------------------------------------
	const heldFileCount = heldRecords.reduce((n, r) => n + r.files.length, 0)
	const ownBandCounts = new Map<StratumName, number>(STRATUM_BANDS.map((b) => [b.name, 0]))
	for (const record of heldRecords) {
		ownBandCounts.set(record.ownLongEdgeBand, ownBandCounts.get(record.ownLongEdgeBand)! + 1)
	}

	const document = {
		header: {
			what: 'Frozen holdout for the v3 album-artwork palette rewrite (PHASE_0_DECISIONS.md §5).',
			schemaVersion: SCHEMA_VERSION,
			scriptVersion: SCRIPT_VERSION,
			supersedes: SUPERSEDES_VERSION,
			redrawReason:
				`Version ${SUPERSEDES_VERSION} selected at artwork-id level. The embedding near-duplicate ` +
				'census found thousands of near-identical image pairs carrying DIFFERENT artwork ids, and ' +
				"224 of that version's 414 held-out artworks had a near-duplicate on the other side of the line " +
				'(221 with a working-set partner, 3 with a non-candidate partner) — a leak. ' +
				'Nothing had consumed the holdout, so the reviewer authorised a clean redraw (2026-08-02). ' +
				'Version 2 selects whole connected components of the near-duplicate graph.',
			generatedBy: 'research/v3/src/holdout/freeze-holdout.ts',
			freezeDate: FREEZE_DATE,
			seed: HOLDOUT_SEED,
			seedHex: `0x${HOLDOUT_SEED.toString(16)}`,
			rng: 'mulberry32 + Fisher-Yates; one stream; strata drawn in the order listed below',
			collectionRoot: relative(COLLECTION_ROOT),
			pathsAreRelativeTo: 'repository root',
			nearDuplicateCensus: {
				file: relative(CENSUS_FILE),
				sha256: censusSha,
				writtenAt: census.written_at,
				threshold: NEAR_DUP_COSINE_THRESHOLD,
				armCriterion: NEAR_DUP_ARM_CRITERION,
				armsScanned: census.method.arms_scanned,
				pairsInCensus: census.pairs.length,
				crossCollectionPairs,
				edgesAppliedBothEndpointsCandidates: edgesUsed,
				edgesSkippedOneEndpointNotCandidate: edgesOneEndpointOutsideCandidates,
				edgesSkippedNeitherEndpointCandidate: edgesBothEndpointsOutsideCandidates,
				edgesSkippedOtherCollection: edgesOtherCollection,
				nonCandidateQuarantine: {
					what:
						'Artworks that failed the album-artwork candidate filters (non-square, thumbnail-only, or ' +
						'real-transparency) but are near-duplicates of a held-out artwork. They are in nobody\'s ' +
						'working set today, so they are not a leak — but they must never be pulled into development ' +
						'work, or they become one.',
					artworkCount: quarantineIds.length,
					artworkIds: quarantineIds,
				},
				lowerBoundCaveat:
					`True duplicate rate continues below cosine ${NEAR_DUP_COSINE_THRESHOLD}, so component ` +
					'isolation is a LOWER BOUND on the real near-duplicate structure. Against duplicates the ' +
					`filename ground truth already knows about, the census undercounts by ${CENSUS_UNDERCOUNT_PCT}% ` +
					'at this threshold.',
			},
			rules: {
				dimensions: 'measured from image headers (sharp .metadata()); filename _WxH suffixes are ignored',
				bestRendition:
					'largest measured pixel area; ties prefer the un-suffixed original over a derived _WxH rendition, then the lexicographically smallest path',
				aspect: `|w/h - 1| <= ${SQUARE_ASPECT_TOLERANCE} on the best rendition`,
				minLongEdge: `best rendition long edge > ${MIN_BEST_LONG_EDGE_PX} px`,
				transparencyExclusion:
					'artworks with any file in the `real` array of research/v3/data/source-surveys/pixel_results.json are excluded',
				granularity:
					'selection is at NEAR-DUPLICATE COMPONENT level; a component is entirely in or entirely out, and every rendition of every member artwork goes with it',
				stratum: "the band of the component's largest member best-rendition long edge",
				targetFraction: HOLDOUT_FRACTION,
				draw:
					"random prefix of a seeded shuffle of the stratum's components, until the running artwork " +
					'count reaches the target; the boundary component is included iff that lands closer',
			},
			counts: {
				filesInCollection: absolutePaths.length,
				artworksInCollection: artworks.size,
				droppedNonSquareArtworks: droppedNonSquare.length,
				squareArtworks: squareArtworks.length,
				droppedThumbnailOnlyArtworks: droppedThumbnailOnly.length,
				transparencyExclusionFiles: excludedFileCount,
				transparencyExclusionArtworksInCollection: excludedIds.size,
				droppedTransparentCandidates: droppedTransparent.length,
				candidateArtworks: candidates.length,
				candidateComponents: components.length,
				singletonComponents: sizeHistogram.get(1) ?? 0,
				multiArtworkComponents: components.length - (sizeHistogram.get(1) ?? 0),
				artworksAbsorbedByDeduplication: candidates.length - components.length,
				largestComponentArtworks: Math.max(...components.map((c) => c.artworkCount)),
				largestComponentFiles: Math.max(...components.map((c) => c.fileCount)),
				namedComponents: namedComponents.length,
				heldOutComponents: heldComponents.length,
				heldOutArtworks: totalHeld,
				heldOutFiles: heldFileCount,
				heldOutArtworkFraction: Number(overallFraction.toFixed(6)),
				heldOutComponentFraction: Number((heldComponents.length / components.length).toFixed(6)),
				nearDuplicateEdgesCrossingHoldoutBoundary: crossingEdges,
				nonCandidateQuarantineArtworks: quarantineIds.length,
			},
			componentSizeHistogram: Object.fromEntries(
				[...sizeHistogram.entries()].sort((a, b) => a[0] - b[0]).map(([size, n]) => [String(size), n]),
			),
			namedComponents: namedComponents.map((c) => ({
				componentId: c.id,
				artworkCount: c.artworkCount,
				fileCount: c.fileCount,
				maxLongEdgePx: c.maxLongEdgePx,
				stratum: c.stratum,
				heldOut: heldIds.has(c.id),
				memberIds: c.members.map((m) => m.id),
			})),
			strata: perStratum.map((row) => ({
				stratum: row.stratum,
				components: row.components,
				candidateArtworks: row.candidateArtworks,
				heldOutComponents: row.heldComponents,
				heldOutArtworks: row.heldArtworks,
				artworkFraction: Number(row.fraction.toFixed(6)),
			})),
			heldOutByOwnLongEdgeBand: Object.fromEntries(
				STRATUM_BANDS.map((b) => [b.name, ownBandCounts.get(b.name)!]),
			),
		},
		artworks: heldRecords,
	}

	const json = `${JSON.stringify(document, null, '\t')}\n`
	const markdown = renderMarkdown(document, perStratum, heldRecords, namedComponents, sizeHistogram, ownBandCounts)

	if (verifyOnly) {
		const failures: string[] = []
		for (const [file, expected] of [
			[HOLDOUT_JSON, json],
			[HOLDOUT_MD, markdown],
		] as const) {
			let actual: string | null = null
			try {
				actual = await readFile(file, 'utf8')
			} catch {
				failures.push(`${relative(file)} is missing`)
				continue
			}
			if (actual !== expected) failures.push(`${relative(file)} differs from a fresh derivation`)
		}
		if (failures.length > 0) {
			process.stderr.write(`\nVERIFY FAILED:\n${failures.map((f) => `  - ${f}\n`).join('')}`)
			process.exit(1)
		}
		process.stderr.write('verify: committed holdout matches a fresh derivation\n')
		return
	}

	await writeFile(HOLDOUT_JSON, json)
	await writeFile(HOLDOUT_MD, markdown)
	process.stderr.write(
		`\nwrote ${relative(HOLDOUT_JSON)} and ${relative(HOLDOUT_MD)}\n` +
			`  ${candidates.length} candidates in ${components.length} components; held out ` +
			`${heldComponents.length} components / ${totalHeld} artworks / ${heldFileCount} files ` +
			`(${(overallFraction * 100).toFixed(2)}% of artworks)\n` +
			`  near-duplicate edges crossing the boundary: ${crossingEdges}\n`,
	)
}

function renderMarkdown(
	document: { header: { counts: Record<string, number>; seedHex: string } },
	perStratum: Array<{
		stratum: StratumName
		components: number
		candidateArtworks: number
		heldComponents: number
		heldArtworks: number
		fraction: number
	}>,
	heldRecords: Array<{ renditionCount: number }>,
	namedComponents: Component[],
	sizeHistogram: Map<number, number>,
	ownBandCounts: Map<StratumName, number>,
): string {
	const c = document.header.counts
	const multiRendition = heldRecords.filter((r) => r.renditionCount > 1).length
	const strataRows = perStratum
		.map(
			(row) =>
				`| ${row.stratum} | ${row.components} | ${row.candidateArtworks} | ${row.heldComponents} | ${row.heldArtworks} | ${(row.fraction * 100).toFixed(1)}% |`,
		)
		.join('\n')
	const histogramRows = [...sizeHistogram.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([size, n]) => `| ${size} | ${n} | ${size * n} |`)
		.join('\n')
	const ownBandRows = STRATUM_BANDS.map((b) => `| ${b.name} | ${ownBandCounts.get(b.name)!} |`).join('\n')

	return `# music-artworks holdout — frozen ${FREEZE_DATE}

**Version ${SCRIPT_VERSION}, supersedes ${SUPERSEDES_VERSION}.** Version ${SUPERSEDES_VERSION} drew on
artwork ids and leaked: the embedding near-duplicate census found that 224 of its 414
held-out artworks had a near-identical twin — same image, different artwork id — on the
other side of the line (221 with a working-set partner, 3 with a non-candidate partner). Nothing had consumed the holdout, so the reviewer authorised a clean
redraw (2026-08-02). This version selects **whole near-duplicate components**. The old
list is retrievable from git history; it is not kept on disk.

## What this is

A fixed list of album artworks from \`music-artworks/\` that the v3 palette work is
**not allowed to look at** during development. It is the reviewer's personal library —
the closest set we have to the deployment distribution, and there is no more where it
came from. The sharded corpus gets no holdout (fresh shards are effectively unlimited);
this collection is complete, so a slice of it is reserved instead.

Generated by \`research/v3/src/holdout/freeze-holdout.ts\`, frozen list in \`holdout.json\`.

## Freeze rules

Held-out artworks are excluded from:

- review batches (nobody looks at their palettes),
- development batches and debugging,
- outlier mining and pathology triage,
- any tuning, threshold fitting, or calibration.

They are touched **only** for end-of-campaign claims — the one honest measurement at
the end. The resolution ladder draws from the non-holdout remainder.

Two levels of wholeness:

- **Rendition.** Every rendition of a held-out artwork is held out with it.
  ${multiRendition} of the ${c.heldOutArtworks} held-out artworks are multi-rendition.
- **Near-duplicate component.** If two artworks are the same image under different
  artwork ids, they are in the same component and go to the same side. A component is
  entirely in or entirely out.

Looking at a held-out artwork spends it. If one is looked at, say so and remove it from
the end-of-campaign claim — do not quietly keep it.

## How the set was built

1. Enumerate all ${c.filesInCollection} files, group by the 32-hex filename stem
   → ${c.artworksInCollection} artworks.
2. Measure every file from its **header**. Filenames lie here: 719 AVIFs disagree with
   their own \`_WxH\` suffix, and 503 artworks have a derived rendition that *claims*
   in its filename to be larger than the un-suffixed original. Measured, none actually
   is — but 502 artworks have a derived rendition tied with the original on exact pixel
   area. The best rendition is the largest **measured** pixel area; on a tie the
   un-suffixed original wins (it is the source, not a re-encode), then the
   lexicographically smallest path.
3. Keep artworks whose best rendition is square within |w/h − 1| ≤ ${SQUARE_ASPECT_TOLERANCE}
   (${c.squareArtworks} artworks; ${c.droppedNonSquareArtworks} dropped — banners, hero images, site furniture),
   whose best long edge is > ${MIN_BEST_LONG_EDGE_PX} px (${c.droppedThumbnailOnlyArtworks} dropped as
   thumbnail-only), and which have no file with genuinely transparent pixels
   (${c.droppedTransparentCandidates} dropped — disc scans and press-photo cutouts, from the
   ${c.transparencyExclusionFiles}-file survey in
   \`research/v3/data/source-surveys/pixel_results.json\`).
   → **${c.candidateArtworks} album-artwork candidates.**
4. Build the near-duplicate graph over those candidates from
   \`research/v3/data/embeddings/near-dup-census.json\`: an edge wherever **any** of the
   three embedding arms **${EXPECTED_CENSUS_ARMS.join('**, **')}**
   put a pair at cosine ≥ ${NEAR_DUP_COSINE_THRESHOLD} (the union,
   because leak prevention wants the conservative graph). Connected components via
   union-find → **${c.candidateComponents} components**.
5. Stratify components by the long edge of their largest member, and draw whole
   components — as a random prefix of a seeded shuffle (mulberry32, seed
   \`${document.header.seedHex}\`, Fisher-Yates) — until the running **artwork** count reaches
   15% of the stratum. The seed is pinned in the script, so the selection is
   reproducible from the code alone.

## The duplicate structure

${c.candidateArtworks} candidate artworks are only ${c.candidateComponents} distinct images:
${c.artworksAbsorbedByDeduplication} artworks are near-duplicates of another candidate, and
${c.multiArtworkComponents} components hold more than one artwork id.

| component size (artworks) | components | artworks |
|---|---|---|
${histogramRows}

The largest component by artworks spans ${c.largestComponentArtworks} artworks; the largest
by files spans ${c.largestComponentFiles} files (separate maxima — no single component holds both).
${namedComponents.length} components reach ${NAMED_COMPONENT_MIN_FILES}+ files — reissues and
template artwork rather than incidental pairs; they are listed in \`holdout.json\` under
\`header.namedComponents\`.

**This is a lower bound.** The true duplicate rate continues below cosine
${NEAR_DUP_COSINE_THRESHOLD}: measured against duplicates the filename ground truth
already knows about, the census undercounts by ${CENSUS_UNDERCOUNT_PCT}% at this threshold.
So component isolation removes the duplicates we can see, not all of them. End-of-campaign
numbers still carry some residual optimism from near-duplicates below the bar.

## Counts

| stratum (component's largest long edge) | components | candidate artworks | held components | held artworks | share |
|---|---|---|---|---|---|
${strataRows}
| **total** | **${c.candidateComponents}** | **${c.candidateArtworks}** | **${c.heldOutComponents}** | **${c.heldOutArtworks}** | **${(c.heldOutArtworkFraction * 100).toFixed(2)}%** |

- **Nominal size:** ${c.heldOutArtworks} artworks / ${c.heldOutFiles} files.
- **Effective size:** ${c.heldOutComponents} independent images
  (${(c.heldOutComponentFraction * 100).toFixed(2)}% of the ${c.candidateComponents} components).
  This is the number to use when reasoning about statistical power — the nominal count
  double-counts duplicates.
- The remaining ${c.candidateArtworks - c.heldOutArtworks} candidate artworks
  (${c.candidateComponents - c.heldOutComponents} components) are the working set.

**Zero** near-duplicate edges cross the holdout boundary. Asserted on every run, across
all three arms.

### One residual path — the quarantine list

${c.nonCandidateQuarantineArtworks} artworks that *failed* the candidate filters
(non-square, thumbnail-only, or real-transparency) are near-duplicates of a held-out
artwork. They are in nobody's working set today, so nothing leaks. But if any of them is
ever pulled into development work — a transparency edge-case batch, a banner-shaped
pathology hunt — it becomes a leak. Their ids are in \`holdout.json\` under
\`header.nearDuplicateCensus.nonCandidateQuarantine\`. Treat that list as held out too.

### A note on the strata

The stratum is a property of the **component**, taken from its largest member. Where a
component mixes resolutions, its smaller members ride up into a higher band. The held-out
artworks' *own* best-rendition bands are therefore distributed differently:

| own best-rendition band | held-out artworks |
|---|---|
${ownBandRows}

Both views are in \`holdout.json\` (\`stratum\` and \`ownLongEdgeBand\` per artwork). Use
\`ownLongEdgeBand\` for any per-artwork resolution analysis; \`stratum\` only describes how
the draw was balanced.

## What has been looked at — disclosed, and what it does and does not cost

Two separate things get confused here, so they are separated first.

**What this holdout claims: ALGORITHM AND TUNING LEAKAGE PREVENTION.** No palette code has been
fitted, tuned, thresholded or debugged against these artworks. That is the claim, it is the claim
the freeze rules above enforce, and it is intact.

**What it has never claimed: reviewer-naive eyes.** Reviewer ruling, 2026-08-03: *"Every image that
comes from \`music-artworks/\` I have seen multiple times before. We cannot claim I have never seen
them (and we don't need to). Images from the hex folders those I probably haven't seen (unless
shown in a review) and I can supply many more folders from the hex source."* This is the reviewer's
personal library. **Held-out artworks are assumed reviewer-familiar**, and any statement that a
number here is a fresh-eyes number is wrong regardless of what any browse did.

**Measured exposure, 2026-08-03.** The embedding bake-off's cluster-gallery browse — which is what
decided the canonical embedding model — rendered:

- **117 of the ${c.heldOutArtworks} held-out artworks** (28.3%),
- **2 of the quarantined non-candidates**, and
- **3 of the 12 pinned query covers** (\`johns\`, \`krafty\`, \`muse\`) — including covers named in
  the observations that decision cites.

Full per-artwork accounting: \`research/v3/data/embeddings/HOLDOUT_EXPOSURE.md\`.

**What follows from that, given the ruling above: nothing that voids anything.** No tuning happened
in a gallery browse, so the leakage claim is untouched; and the reviewer had seen those covers
before the gallery existed, so no naive-eyes claim was spent either — there was none to spend.
Recorded as \`d-2026-08-03-reviewer-holdout-purpose-is-algorithm-leakage\`.

**Two hygiene consequences, kept because cheap is not the same as free:**

1. The gallery **excludes held-out artworks by default** from here on. The claim does not depend on
   it; casually spending the holdout is still a bad habit.
2. The **3 held-out pinned query covers should be replaced** with working-set covers — a pinned
   query cover is looked at repeatedly and forever. Tracked as \`PHASE_0_LOOSE_ENDS.md\` C9.

**Where fresh-eyes evaluation actually comes from.** Not from this file. It comes from importing
genuinely fresh folders from the hex source at claim time — the sharded collection has no holdout
precisely because its supply is effectively unlimited. **That mechanism has never been exercised
once**, and under this ruling it is the only path the campaign has to a reviewer-naive number.
Tracked as \`PHASE_0_LOOSE_ENDS.md\` A11, and it is the item that matters.

## How to use it

Exclude by artwork id, not by path — every rendition shares the id:

\`\`\`ts
const frozen = JSON.parse(await readFile('research/v3/data/holdout/holdout.json', 'utf8'))
const heldOut = new Set(frozen.artworks.map((a) => a.id))
// an artwork id is the 32-hex filename stem: basename(path).slice(0, 32)
\`\`\`

The \`sha256\` recorded for every held-out file lets a future run prove the bytes it
measured are the bytes that were frozen.

## Re-running

\`\`\`
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts --verify
\`\`\`

The script is idempotent — seed, freeze date and script version are pinned constants, and
all measurements come from the files themselves, so a re-run rewrites the same bytes.
\`--verify\` re-derives the selection and fails if the committed files disagree.
\`measurements.jsonl\` next to this file is the header-measurement cache (also the raw
dimension survey of the whole collection); deleting it only makes the next run slower.

**What the run asserts about the census, exactly.** The component rule is the union over a
NAMED arm set, and every part of that name is now checked against a pinned constant rather
than described in prose:

| pinned in \`freeze-holdout.ts\` | value | asserted on every run |
| --- | --- | --- |
| arm set (\`EXPECTED_CENSUS_ARMS\`) | ${EXPECTED_CENSUS_ARMS.join(', ')} | yes — set equality against \`method.arms_scanned\`, plus no pair may be attributed to an arm outside the set |
| primary arm | ${EXPECTED_CENSUS_PRIMARY_ARM} | yes |
| cosine threshold | ${NEAR_DUP_COSINE_THRESHOLD} | yes |
| union pair count | ${EXPECTED_CENSUS_UNION_PAIRS} | yes |
| cross-collection pairs | 0 | yes |
| edges crossing the holdout boundary | 0 | yes |

The census **sha256 is recorded in the header for provenance but is not compared** — that is
deliberate, because the census is expected to be regenerated and a byte pin would fail on a
legitimate rebuild. Identity is carried by the rule (arms, primary, threshold) plus the pair
count instead. Until the arm-list assertion landed, a census silently recomputed over a
different arm set that happened to land on ${EXPECTED_CENSUS_UNION_PAIRS} pairs would have
passed every check; it no longer does.

**Changing \`HOLDOUT_SEED\`, the census, or the component rule re-rolls the holdout and
voids every claim made against the old list.** That already happened once, deliberately,
for the leak above. It must not happen again without the same authorisation — and the
arm-set constant above is now part of "the component rule" in the enforceable sense, so
editing it is a re-roll, not a refactor.
`
}

await main()
