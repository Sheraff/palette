/**
 * Resolution-ladder item manifest (oracle pipeline §7.4.3).
 *
 * Two item sets, written to one file:
 *
 *  1. THE LADDER — every rendition of every NON-HOLDOUT multi-rendition album-artwork
 *     candidate in `music-artworks/`. Per artwork this is a ladder of the same image at
 *     several sizes, which is what §7.4.3 wants: agreement against the largest rendition
 *     as a function of size.
 *
 *  2. THE TRANSFER CHECK — the 644 cross-tier pairs of the sharded corpus (§7.2/§7.3),
 *     1,288 files, 300 px and 640 px renditions of the same artwork. Flagged separately.
 *     The sharded corpus has no holdout (PHASE_0_DECISIONS.md §5), so all 644 are in.
 *
 * Eligibility replicates the holdout freeze's candidate rules exactly, because the ladder
 * must draw from the same population the holdout was cut out of — otherwise "non-holdout
 * remainder" means something different here than it does there. The rules are restated in
 * code (not imported) so this script is readable on its own; `--verify-against-holdout`
 * asserts the reproduction lands on the same 2,757 candidates and 413 held-out artworks.
 *
 * Dimensions ALWAYS come from image headers (§7.4.1 trap 1: 719 AVIFs disagree with their
 * own `_WxH` filename suffix). This script measures every file itself with sharp rather
 * than trusting any other workstream's derived list, and cross-checks its measurements
 * against the holdout freeze's header cache, reporting any disagreement.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/build-manifest.ts
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/build-manifest.ts --verify
 *
 * Idempotent: seed, script version and band edges are pinned constants and every other
 * input is read from the files themselves, so a re-run rewrites the same bytes.
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

/** [HELD] Bumped when the eligibility or sampling logic changes (which re-rolls the
 *  sample). Formatting-only changes must not bump it. */
const SCRIPT_VERSION = '1.0.0'

/** [HELD] Pinned so re-runs are byte-identical. */
const MANIFEST_DATE = '2026-08-03'

/** [HELD] Seed for the stratified sample of scope `sample`. Deliberately NOT the holdout
 *  seed (0x5ea1f00d) — an independent draw, so the two selections share no structure.
 *  Changing it re-rolls the sample and invalidates any run already made against it. */
const SAMPLE_SEED = 0x1add_e12a

/** [REVIEWED] Task brief §7.4.3 scoping: "a stratified sample of ~400 artworks chosen to
 *  span the resolution range". 400 is the reviewer-facing target, not a computed optimum. */
const SAMPLE_TARGET_ARTWORKS = 400

/** [REVIEWED] Minimum artworks drawn from any stratum, so the thin high-resolution bands
 *  are not proportionally sampled into uselessness — the whole point of the sample is to
 *  span the resolution range, and >1024 px holds only ~28 eligible artworks. A stratum
 *  smaller than this is taken whole. */
const SAMPLE_MIN_PER_STRATUM = 40

/** [INHERITED] Same band edges the holdout freeze stratified on
 *  (`data/holdout/HOLDOUT.md` §Counts), so sample and holdout are described in one
 *  vocabulary. Bands are on the artwork's LARGEST rendition. */
const STRATUM_BANDS = [
	{ name: '<=400', maxLongEdge: 400 },
	{ name: '401-640', maxLongEdge: 640 },
	{ name: '641-1024', maxLongEdge: 1024 },
	{ name: '>1024', maxLongEdge: Number.POSITIVE_INFINITY },
] as const
type StratumName = (typeof STRATUM_BANDS)[number]['name']

/** [MEASURED] Oracle pipeline §7.4.2: keep artworks whose best rendition satisfies
 *  |w/h − 1| ≤ 0.05. Same value as the holdout freeze. */
const SQUARE_ASPECT_TOLERANCE = 0.05

/** [MEASURED] Oracle pipeline §7.4.2: the ≤150 px files are derived thumbnails, not
 *  sources. Applied to the BEST rendition only — an artwork whose best is a thumbnail is
 *  dropped, but a 147 px rung of a real artwork is kept, because the bottom of the ladder
 *  is exactly what §7.4.3 is measuring. Same value as the holdout freeze. */
const MIN_BEST_LONG_EDGE_PX = 150

/** [INHERITED] Extensions present in music-artworks (case-insensitive). */
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpg', '.jpeg', '.png'])

/** [INHERITED] `<32-hex>[_WxH].<ext>` — the 32-hex stem is the artwork id. */
const MUSIC_FILENAME_PATTERN = /^([0-9a-f]{32})(?:_(\d+)x(\d+))?\.([A-Za-z]+)$/

/** [MEASURED] Oracle pipeline §7.1: sharded filenames are 40 hex characters — a
 *  16-character rendition prefix followed by a 24-character artwork id. */
const SHARDED_FILENAME_PATTERN = /^([0-9a-f]{16})([0-9a-f]{24})$/

/** [MEASURED] Oracle pipeline §7.1: the two rendition prefixes, each predicting its
 *  tier's size perfectly. Measured 2026-08-02 (n=4,631 and n=2,914) and re-asserted here
 *  from headers, never trusted blind. */
const SHARDED_RENDITION_PREFIXES: Record<string, number> = {
	ab67616d0000b273: 640,
	ab67616d00001e02: 300,
}

/** [MEASURED] Oracle pipeline §7.2: 644 artwork ids appear in both sharded tiers.
 *  Asserted, not assumed — a different number means the corpus changed under us. */
const EXPECTED_SHARDED_PAIRS = 644

/** [MEASURED] Holdout freeze counts (`data/holdout/HOLDOUT.md`), reproduced here as
 *  assertions so a drift in the collection or in the filter rules is loud. */
const EXPECTED_MUSIC_FILES = 8595
const EXPECTED_MUSIC_ARTWORKS = 4088
const EXPECTED_CANDIDATES = 2757
const EXPECTED_HELD_OUT_ARTWORKS = 413

/** [UNCALIBRATED] Parallel header reads / hashes. Enough to keep the disk busy without
 *  exhausting file descriptors. Same value the holdout freeze uses. */
const IO_CONCURRENCY = 24

// ---------------------------------------------------------------------------
// Paths (derived from this file's location — no cwd dependence).
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const MUSIC_ROOT = path.join(REPO_ROOT, 'music-artworks')
const HOLDOUT_JSON = path.join(REPO_ROOT, 'research/v3/data/holdout/holdout.json')
const HOLDOUT_MEASUREMENTS = path.join(REPO_ROOT, 'research/v3/data/holdout/measurements.jsonl')
const TRANSPARENCY_SURVEY = path.join(REPO_ROOT, 'research/v3/data/source-surveys/pixel_results.json')
const OUT_DIR = path.join(REPO_ROOT, 'research/v3/data/oracle-ladder')
const MANIFEST_JSON = path.join(OUT_DIR, 'manifest.json')
const MEASUREMENT_CACHE = path.join(OUT_DIR, 'header-measurements.jsonl')

// ---------------------------------------------------------------------------
// Deterministic RNG — mulberry32, reproducible from the code alone. Never Math.random.
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
// Types
// ---------------------------------------------------------------------------

type Measurement = {
	path: string
	bytes: number
	width: number
	height: number
	format: string
}

type Rendition = Measurement & {
	extension: string
	longEdgePx: number
	sha256: string
	/** No `_WxH` suffix — the upstream source file, not a CDN re-encode. */
	isOriginal: boolean
	/** The artwork's largest measured rendition: the ladder's reference answer. */
	isReference: boolean
	/** Index of this rendition's exact (w,h) among the artwork's distinct sizes, largest
	 *  first. Renditions sharing a rung are the same size in different bytes. */
	rungIndex: number
	/** One rendition per rung is run by default; the rest are same-size re-encodes that
	 *  add no point to the curve (they are a codec control, run with
	 *  `--include-duplicate-sizes`). */
	isRungRepresentative: boolean
}

type LadderArtwork = {
	id: string
	stratum: StratumName
	referenceLongEdgePx: number
	renditionCount: number
	distinctSizeCount: number
	/** Long edges of the distinct rungs, largest first. */
	rungLongEdgesPx: number[]
	/** Has a rendition in the ~300 band AND one in the ~640 band: directly comparable to
	 *  a sharded cross-tier pair, so these anchor the transfer check in-distribution. */
	isMatchedContrast: boolean
	inSample: boolean
	renditions: Rendition[]
}

type PairFile = {
	path: string
	imageId: string
	renditionPrefix: string
	declaredTierPx: number
	bytes: number
	width: number
	height: number
	format: string
	longEdgePx: number
	sha256: string
}

type PairArtwork = {
	artworkId: string
	shards: string[]
	files: PairFile[]
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const relative = (absolutePath: string): string => path.relative(REPO_ROOT, absolutePath)

function longEdge(m: { width: number; height: number }): number {
	return Math.max(m.width, m.height)
}

function bandOf(edge: number): StratumName {
	for (const band of STRATUM_BANDS) if (edge <= band.maxLongEdge) return band.name
	throw new Error(`no stratum for long edge ${edge}`)
}

function hasRenditionSuffix(p: string): boolean {
	return /_\d+x\d+\.[^.]+$/.test(p)
}

/** Strict ordering: measured area, then original-over-derived, then path.
 *  Identical to the holdout freeze's rule — §7.4.1 trap 2: 502 artworks have a derived
 *  AVIF tied on measured area with the un-suffixed original. */
function isBetterRendition(candidate: Measurement, incumbent: Measurement): boolean {
	const candidateArea = candidate.width * candidate.height
	const incumbentArea = incumbent.width * incumbent.height
	if (candidateArea !== incumbentArea) return candidateArea > incumbentArea
	const candidateDerived = hasRenditionSuffix(candidate.path)
	const incumbentDerived = hasRenditionSuffix(incumbent.path)
	if (candidateDerived !== incumbentDerived) return !candidateDerived
	return candidate.path < incumbent.path
}

async function sha256File(absolutePath: string): Promise<string> {
	return await new Promise((resolve, reject) => {
		const hash = createHash('sha256')
		createReadStream(absolutePath)
			.on('data', (chunk) => hash.update(chunk))
			.on('end', () => resolve(hash.digest('hex')))
			.on('error', reject)
	})
}

async function mapConcurrent<In, Out>(
	items: In[],
	limit: number,
	fn: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
	const out: Out[] = new Array(items.length)
	let next = 0
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = next++
			if (index >= items.length) return
			out[index] = await fn(items[index]!, index)
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
	return out
}

function check(condition: boolean, message: string): void {
	if (!condition) throw new Error(`manifest check failed: ${message}`)
}

// ---------------------------------------------------------------------------
// Enumeration + header measurement
// ---------------------------------------------------------------------------

async function walk(dir: string, out: string[] = []): Promise<string[]> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) await walk(full, out)
		else if (entry.isFile()) out.push(full)
	}
	return out
}

async function loadMeasurementCache(file: string): Promise<Map<string, Measurement>> {
	const cache = new Map<string, Measurement>()
	let text: string
	try {
		text = await readFile(file, 'utf8')
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

/** Measure every file's dimensions from its header, cached by (path, byte size). */
async function measureAll(absolutePaths: string[], label: string): Promise<Measurement[]> {
	const cache = await loadMeasurementCache(MEASUREMENT_CACHE)
	let measured = 0
	let reused = 0
	const results = await mapConcurrent(absolutePaths, IO_CONCURRENCY, async (absolutePath) => {
		const rel = relative(absolutePath)
		const { size } = await stat(absolutePath)
		const cached = cache.get(rel)
		if (cached && cached.bytes === size) {
			reused++
			return cached
		}
		const metadata = await sharp(absolutePath).metadata()
		if (!metadata.width || !metadata.height) throw new Error(`no dimensions in header: ${rel}`)
		measured++
		if (measured % 1000 === 0) process.stderr.write(`  ${label}: measured ${measured} files\n`)
		return {
			path: rel,
			bytes: size,
			width: metadata.width,
			height: metadata.height,
			format: metadata.format ?? 'unknown',
		}
	})
	process.stderr.write(`  ${label}: ${measured} header reads, ${reused} from cache\n`)
	return results
}

async function writeMeasurementCache(all: Measurement[]): Promise<void> {
	const sorted = [...all].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	await writeFile(MEASUREMENT_CACHE, `${sorted.map((r) => JSON.stringify(r)).join('\n')}\n`)
}

// ---------------------------------------------------------------------------
// music-artworks: eligibility
// ---------------------------------------------------------------------------

type MusicArtwork = { id: string; files: Measurement[]; best: Measurement }

function groupMusicArtworks(measurements: Measurement[]): Map<string, MusicArtwork> {
	const byId = new Map<string, Measurement[]>()
	for (const measurement of measurements) {
		const name = path.basename(measurement.path)
		const match = MUSIC_FILENAME_PATTERN.exec(name)
		check(match !== null, `music-artworks filename does not match <32-hex>[_WxH].<ext>: ${measurement.path}`)
		const id = match![1]!
		const list = byId.get(id)
		if (list) list.push(measurement)
		else byId.set(id, [measurement])
	}
	const artworks = new Map<string, MusicArtwork>()
	for (const [id, files] of byId) {
		files.sort((a, b) => (a.path < b.path ? -1 : 1))
		let best = files[0]!
		for (const file of files) if (isBetterRendition(file, best)) best = file
		artworks.set(id, { id, files, best })
	}
	return artworks
}

async function loadTransparencyExclusions(): Promise<{ ids: Set<string>; fileCount: number }> {
	const parsed = JSON.parse(await readFile(TRANSPARENCY_SURVEY, 'utf8')) as { real: Array<{ path: string }> }
	const ids = new Set<string>()
	for (const entry of parsed.real) ids.add(path.basename(entry.path).slice(0, 32))
	return { ids, fileCount: parsed.real.length }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function buildLadder(): Promise<{
	artworks: LadderArtwork[]
	counts: Record<string, number>
	sampling: Record<string, unknown>
	measurements: Measurement[]
	measurementCrossCheck: Record<string, unknown>
}> {
	process.stderr.write('music-artworks: enumerating\n')
	const allFiles = (await walk(MUSIC_ROOT)).filter((p) =>
		IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()),
	)
	allFiles.sort()
	check(
		allFiles.length === EXPECTED_MUSIC_FILES,
		`music-artworks has ${allFiles.length} image files, expected ${EXPECTED_MUSIC_FILES}`,
	)

	const measurements = await measureAll(allFiles, 'music-artworks')

	// Cross-check against the holdout freeze's independent header survey. Same headers,
	// two readers: any disagreement means one of us is wrong and must be looked at.
	const holdoutCache = await loadMeasurementCache(HOLDOUT_MEASUREMENTS)
	let compared = 0
	const disagreements: string[] = []
	for (const m of measurements) {
		const other = holdoutCache.get(m.path)
		if (!other) continue
		compared++
		if (other.width !== m.width || other.height !== m.height) {
			disagreements.push(`${m.path}: ours ${m.width}x${m.height}, holdout ${other.width}x${other.height}`)
		}
	}
	check(disagreements.length === 0, `header disagreement with the holdout survey:\n${disagreements.slice(0, 10).join('\n')}`)
	const measurementCrossCheck = {
		against: relative(HOLDOUT_MEASUREMENTS),
		filesComparable: compared,
		disagreements: disagreements.length,
	}

	const artworks = groupMusicArtworks(measurements)
	check(
		artworks.size === EXPECTED_MUSIC_ARTWORKS,
		`grouped ${artworks.size} artworks, expected ${EXPECTED_MUSIC_ARTWORKS}`,
	)

	const { ids: transparentIds, fileCount: transparentFiles } = await loadTransparencyExclusions()

	const candidates: MusicArtwork[] = []
	let droppedNonSquare = 0
	let droppedThumbnailOnly = 0
	let droppedTransparent = 0
	for (const artwork of artworks.values()) {
		const best = artwork.best
		if (Math.abs(best.width / best.height - 1) > SQUARE_ASPECT_TOLERANCE) {
			droppedNonSquare++
			continue
		}
		if (longEdge(best) <= MIN_BEST_LONG_EDGE_PX) {
			droppedThumbnailOnly++
			continue
		}
		if (transparentIds.has(artwork.id)) {
			droppedTransparent++
			continue
		}
		candidates.push(artwork)
	}
	check(
		candidates.length === EXPECTED_CANDIDATES,
		`reproduced ${candidates.length} album-artwork candidates, holdout freeze found ${EXPECTED_CANDIDATES}`,
	)

	const holdoutDoc = JSON.parse(await readFile(HOLDOUT_JSON, 'utf8')) as {
		header: { nearDuplicateCensus: { nonCandidateQuarantine: unknown } }
		artworks: Array<{ id: string }>
	}
	const heldOut = new Set(holdoutDoc.artworks.map((a) => a.id))
	check(
		heldOut.size === EXPECTED_HELD_OUT_ARTWORKS,
		`holdout.json lists ${heldOut.size} artworks, expected ${EXPECTED_HELD_OUT_ARTWORKS}`,
	)
	// The quarantine list (near-duplicates of a held-out artwork that failed the candidate
	// filters) is treated as held out too — HOLDOUT.md: "Treat that list as held out too."
	// They cannot be candidates by construction; excluding them explicitly is belt and braces.
	const quarantine = new Set<string>(
		JSON.stringify(holdoutDoc.header.nearDuplicateCensus.nonCandidateQuarantine).match(/[0-9a-f]{32}/g) ?? [],
	)

	const workingSet = candidates.filter((a) => !heldOut.has(a.id) && !quarantine.has(a.id))
	const eligible = workingSet.filter((a) => a.files.length >= 2)

	// Assemble.
	const ladder: LadderArtwork[] = []
	for (const artwork of eligible) {
		const sorted = [...artwork.files].sort((a, b) => {
			if (a.width * a.height !== b.width * b.height) return b.width * b.height - a.width * a.height
			const aDerived = hasRenditionSuffix(a.path)
			const bDerived = hasRenditionSuffix(b.path)
			if (aDerived !== bDerived) return aDerived ? 1 : -1
			return a.path < b.path ? -1 : 1
		})
		const rungs: number[] = []
		const rungKeyOf = (m: Measurement): string => `${m.width}x${m.height}`
		const rungIndexByKey = new Map<string, number>()
		for (const m of sorted) {
			const key = rungKeyOf(m)
			if (!rungIndexByKey.has(key)) {
				rungIndexByKey.set(key, rungIndexByKey.size)
				rungs.push(longEdge(m))
			}
		}
		const seenRung = new Set<number>()
		const renditions: Rendition[] = sorted.map((m, index) => {
			const rungIndex = rungIndexByKey.get(rungKeyOf(m))!
			const isRungRepresentative = !seenRung.has(rungIndex)
			seenRung.add(rungIndex)
			return {
				...m,
				extension: path.extname(m.path).slice(1).toLowerCase(),
				longEdgePx: longEdge(m),
				sha256: '',
				isOriginal: !hasRenditionSuffix(m.path),
				isReference: index === 0,
				rungIndex,
				isRungRepresentative,
			}
		})
		const has300 = renditions.some((r) => r.longEdgePx >= 280 && r.longEdgePx <= 340)
		const has640 = renditions.some((r) => r.longEdgePx >= 600 && r.longEdgePx <= 680)
		ladder.push({
			id: artwork.id,
			stratum: bandOf(longEdge(artwork.best)),
			referenceLongEdgePx: longEdge(artwork.best),
			renditionCount: renditions.length,
			distinctSizeCount: rungs.length,
			rungLongEdgesPx: rungs,
			isMatchedContrast: has300 && has640,
			inSample: false,
			renditions,
		})
	}
	ladder.sort((a, b) => (a.id < b.id ? -1 : 1))

	// Hash every file we will actually run.
	process.stderr.write(`music-artworks: hashing ${ladder.reduce((n, a) => n + a.renditions.length, 0)} files\n`)
	const flat = ladder.flatMap((a) => a.renditions)
	const hashes = await mapConcurrent(flat, IO_CONCURRENCY, (r) => sha256File(path.join(REPO_ROOT, r.path)))
	flat.forEach((r, i) => {
		r.sha256 = hashes[i]!
	})

	// -- the stratified sample -------------------------------------------------
	//
	// Universe: eligible artworks with at least TWO DISTINCT measured sizes. An artwork
	// whose renditions are all the same size carries no rung above its own and so cannot
	// contribute a point to the curve (27 such artworks exist; they stay in the manifest
	// and in scope `full` as a same-size codec control, but they are not sampled).
	//
	// Design, in order:
	//   1. Force-include every matched-contrast artwork (has both a ~300 and a ~640 rung).
	//      These are the only in-distribution anchor for the §7.3 transfer check; drawing
	//      them by luck would leave the transfer check underpowered.
	//   2. Allocate the remaining budget across the four strata proportionally, with a
	//      floor of SAMPLE_MIN_PER_STRATUM (or take-all for a stratum below the floor),
	//      then trim the largest strata to land exactly on the target.
	//   3. Fill each stratum from a seeded Fisher-Yates shuffle — a random prefix, not a
	//      preference for rung-rich artworks, which would bias the curve toward whatever
	//      content the CDN happened to make many renditions of.
	const universe = ladder.filter((a) => a.distinctSizeCount >= 2)
	const byStratum = new Map<StratumName, LadderArtwork[]>()
	for (const band of STRATUM_BANDS) byStratum.set(band.name, [])
	for (const a of universe) byStratum.get(a.stratum)!.push(a)

	const allocation = new Map<StratumName, number>()
	let remaining = SAMPLE_TARGET_ARTWORKS
	const flexible: StratumName[] = []
	for (const band of STRATUM_BANDS) {
		const pool = byStratum.get(band.name)!
		const proportional = Math.round((SAMPLE_TARGET_ARTWORKS * pool.length) / universe.length)
		if (pool.length <= SAMPLE_MIN_PER_STRATUM || proportional < SAMPLE_MIN_PER_STRATUM) {
			const take = Math.min(pool.length, Math.max(proportional, SAMPLE_MIN_PER_STRATUM))
			allocation.set(band.name, take)
			remaining -= take
		} else {
			flexible.push(band.name)
		}
	}
	const flexibleTotal = flexible.reduce((n, name) => n + byStratum.get(name)!.length, 0)
	let assigned = 0
	flexible.forEach((name, index) => {
		const pool = byStratum.get(name)!
		const take =
			index === flexible.length - 1
				? remaining - assigned
				: Math.round((remaining * pool.length) / flexibleTotal)
		allocation.set(name, Math.min(pool.length, take))
		assigned += allocation.get(name)!
	})

	const rng = mulberry32(SAMPLE_SEED)
	const sampled = new Set<string>()
	const perStratum: Record<string, { pool: number; forced: number; drawn: number; total: number }> = {}
	for (const band of STRATUM_BANDS) {
		const pool = byStratum.get(band.name)!
		const forced = pool.filter((a) => a.isMatchedContrast)
		const rest = shuffle(
			pool.filter((a) => !a.isMatchedContrast).map((a) => a.id),
			rng,
		)
		let quota = allocation.get(band.name) ?? 0
		if (forced.length > quota) quota = forced.length // never drop an anchor to hit a quota
		for (const a of forced) sampled.add(a.id)
		const drawn = rest.slice(0, Math.max(0, quota - forced.length))
		for (const id of drawn) sampled.add(id)
		perStratum[band.name] = {
			pool: pool.length,
			forced: forced.length,
			drawn: drawn.length,
			total: forced.length + drawn.length,
		}
	}
	for (const a of ladder) a.inSample = sampled.has(a.id)

	const counts = {
		filesInCollection: allFiles.length,
		artworksInCollection: artworks.size,
		droppedNonSquare,
		droppedThumbnailOnly,
		droppedTransparent,
		transparencyExclusionFiles: transparentFiles,
		albumArtworkCandidates: candidates.length,
		heldOutArtworks: heldOut.size,
		quarantineArtworks: quarantine.size,
		workingSetArtworks: workingSet.length,
		multiRenditionInWholeCollection: [...artworks.values()].filter((a) => a.files.length >= 2).length,
		ladderEligibleArtworks: ladder.length,
		ladderEligibleFiles: ladder.reduce((n, a) => n + a.renditions.length, 0),
		ladderEligibleRungs: ladder.reduce((n, a) => n + a.distinctSizeCount, 0),
		sameSizeOnlyArtworks: ladder.length - universe.length,
		matchedContrastArtworks: ladder.filter((a) => a.isMatchedContrast).length,
		sampleArtworks: sampled.size,
		sampleFiles: ladder.filter((a) => a.inSample).reduce((n, a) => n + a.renditions.length, 0),
		sampleRungs: ladder.filter((a) => a.inSample).reduce((n, a) => n + a.distinctSizeCount, 0),
	}

	const sampling = {
		seed: SAMPLE_SEED,
		seedHex: `0x${SAMPLE_SEED.toString(16)}`,
		rng: 'mulberry32 + Fisher-Yates, same generator the holdout freeze uses',
		targetArtworks: SAMPLE_TARGET_ARTWORKS,
		minPerStratum: SAMPLE_MIN_PER_STRATUM,
		universe: 'ladder-eligible artworks with >= 2 DISTINCT measured rendition sizes',
		universeSize: universe.length,
		forcedInclusion:
			'every matched-contrast artwork (has a rung in 280-340 px AND one in 600-680 px) — ' +
			'the in-distribution anchor for the §7.3 transfer check',
		perStratum,
	}

	return { artworks: ladder, counts, sampling, measurements, measurementCrossCheck }
}

async function buildPairs(): Promise<{
	pairs: PairArtwork[]
	measurements: Measurement[]
	counts: Record<string, unknown>
}> {
	process.stderr.write('sharded corpus: enumerating\n')
	const shardDirs = (await readdir(REPO_ROOT, { withFileTypes: true }))
		.filter((e) => e.isDirectory() && /^[0-9a-f]{2}$/.test(e.name))
		.map((e) => e.name)
		.sort()
	const byArtwork = new Map<string, Array<{ absolutePath: string; shard: string; imageId: string; prefix: string }>>()
	let offPattern = 0
	let totalFiles = 0
	for (const shard of shardDirs) {
		for (const name of await readdir(path.join(REPO_ROOT, shard))) {
			totalFiles++
			const stem = name.replace(/\.[^.]*$/, '')
			const match = SHARDED_FILENAME_PATTERN.exec(stem)
			if (!match || !(match[1]! in SHARDED_RENDITION_PREFIXES)) {
				offPattern++
				continue
			}
			const artworkId = match[2]!
			const list = byArtwork.get(artworkId) ?? []
			list.push({ absolutePath: path.join(REPO_ROOT, shard, name), shard, imageId: stem, prefix: match[1]! })
			byArtwork.set(artworkId, list)
		}
	}
	const paired = [...byArtwork.entries()].filter(([, files]) => files.length > 1)
	check(
		paired.length === EXPECTED_SHARDED_PAIRS,
		`found ${paired.length} cross-tier pairs, §7.2 measured ${EXPECTED_SHARDED_PAIRS}`,
	)
	for (const [id, files] of paired) check(files.length === 2, `artwork ${id} has ${files.length} renditions, expected 2`)

	const flat = paired.flatMap(([, files]) => files).sort((a, b) => (a.absolutePath < b.absolutePath ? -1 : 1))
	const measurements = await measureAll(flat.map((f) => f.absolutePath), 'sharded pairs')
	process.stderr.write(`sharded pairs: hashing ${flat.length} files\n`)
	const hashes = await mapConcurrent(flat, IO_CONCURRENCY, (f) => sha256File(f.absolutePath))
	const measuredByPath = new Map(measurements.map((m) => [m.path, m]))
	const hashByPath = new Map(flat.map((f, i) => [relative(f.absolutePath), hashes[i]!]))

	let prefixMispredicts = 0
	const pairs: PairArtwork[] = paired
		.map(([artworkId, files]) => {
			const built = files
				.map((f) => {
					const rel = relative(f.absolutePath)
					const m = measuredByPath.get(rel)!
					const declared = SHARDED_RENDITION_PREFIXES[f.prefix]!
					if (longEdge(m) !== declared) prefixMispredicts++
					return {
						path: rel,
						imageId: f.imageId,
						renditionPrefix: f.prefix,
						declaredTierPx: declared,
						bytes: m.bytes,
						width: m.width,
						height: m.height,
						format: m.format,
						longEdgePx: longEdge(m),
						sha256: hashByPath.get(rel)!,
					}
				})
				.sort((a, b) => b.longEdgePx - a.longEdgePx)
			return { artworkId, shards: [...new Set(files.map((f) => f.shard))].sort(), files: built }
		})
		.sort((a, b) => (a.artworkId < b.artworkId ? -1 : 1))

	return {
		pairs,
		measurements,
		counts: {
			shardDirectories: shardDirs.length,
			filesInCorpus: totalFiles,
			offPatternFilesSkipped: offPattern,
			crossTierPairs: pairs.length,
			pairFiles: pairs.length * 2,
			renditionPrefixMispredictions: prefixMispredicts,
			note:
				'The sharded corpus has no holdout (PHASE_0_DECISIONS.md §5: fresh shards are ' +
				'effectively unlimited), so all 644 pairs are included.',
		},
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const verify = process.argv.includes('--verify')
	await mkdir(OUT_DIR, { recursive: true })

	const ladder = await buildLadder()
	const pairs = await buildPairs()
	// One header survey for both collections, so the cache is the manifest's raw evidence.
	const cacheRecords = new Map<string, Measurement>()
	for (const m of [...ladder.measurements, ...pairs.measurements]) cacheRecords.set(m.path, m)
	await writeMeasurementCache([...cacheRecords.values()])

	const document = {
		header: {
			what: 'Resolution-ladder item manifest (ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §7.4.3) plus the §7.3 transfer-check pairs',
			schemaVersion: '1.0.0',
			scriptVersion: SCRIPT_VERSION,
			generatedBy: 'research/v3/oracle/ladder/build-manifest.ts',
			manifestDate: MANIFEST_DATE,
			pathsAreRelativeTo: 'the repository root',
			resolutionPolicy:
				'NATIVE. Pipeline §7.5: the ladder runs every rendition at the size it is stored at — ' +
				'resolution IS the independent variable, so no cap and no normalization. Never upscaled ' +
				'(PHASE_0_DECISIONS.md §1).',
			eligibility: {
				collection: 'music-artworks/',
				rules: [
					'best rendition = largest MEASURED pixel area; ties prefer the un-suffixed original, then the lexicographically smallest path',
					`best rendition square within |w/h - 1| <= ${SQUARE_ASPECT_TOLERANCE}`,
					`best rendition long edge > ${MIN_BEST_LONG_EDGE_PX} px`,
					'no file with genuinely transparent pixels (research/v3/data/source-surveys/pixel_results.json)',
					'NOT in research/v3/data/holdout/holdout.json, and not in that file\'s non-candidate quarantine list',
					'at least 2 renditions',
				],
				dimensionsFrom: 'image headers via sharp — never the _WxH filename suffix (§7.4.1 trap 1)',
			},
			measurementCrossCheck: ladder.measurementCrossCheck,
			counts: { ...ladder.counts, sharded: pairs.counts },
			sampling: ladder.sampling,
			scopes: {
				full: 'every rung of every ladder-eligible artwork',
				sample: 'every rung of the artworks with inSample = true',
				pairs: 'the 644 sharded cross-tier pairs (1,288 files), transfer check only',
			},
		},
		ladder: ladder.artworks,
		pairs: pairs.pairs,
	}

	const serialized = `${JSON.stringify(document, null, '\t')}\n`
	if (verify) {
		const existing = await readFile(MANIFEST_JSON, 'utf8')
		if (existing !== serialized) throw new Error('manifest.json differs from a fresh derivation')
		process.stderr.write('verify: manifest.json matches a fresh derivation\n')
		return
	}
	await writeFile(MANIFEST_JSON, serialized)
	process.stdout.write(`${JSON.stringify(document.header.counts, null, '\t')}\n`)
	process.stdout.write(`${JSON.stringify(document.header.sampling.perStratum ?? {}, null, '\t')}\n`)
	process.stderr.write(`wrote ${relative(MANIFEST_JSON)}\n`)
}

await main()
