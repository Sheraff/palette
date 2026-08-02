/**
 * music-artworks holdout freeze (v3 Phase 0, PHASE_0_DECISIONS.md §5).
 *
 * Reserves a random ~15% of the album-artwork candidates in `music-artworks/`,
 * stratified by the resolution band of each artwork's best rendition, with every
 * rendition of a held-out artwork held out together. The result is frozen in
 * `research/v3/data/holdout/holdout.json` and summarised in `HOLDOUT.md`.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts --verify
 *
 * The script is idempotent: every input to the output (seed, freeze date, script
 * version, file measurements) is either pinned in code or read from the image
 * headers, so a re-run produces byte-identical files. `--verify` re-derives the
 * selection and fails if the committed files disagree.
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

/** [HELD] Frozen once, 2026-08-02. Changing it re-rolls the holdout and voids
 *  every end-of-campaign claim made against the old list. Never change it. */
const HOLDOUT_SEED = 0x5ea1_f00d

/** [REVIEWED] PHASE_0_DECISIONS.md §5: "reserve a random ~15%". */
const HOLDOUT_FRACTION = 0.15

/** [HELD] Pinned so re-runs are byte-identical. The date the freeze was made. */
const FREEZE_DATE = '2026-08-02'

/** [HELD] Bumped only when the selection algorithm changes (which re-rolls the
 *  holdout). Formatting-only changes must not bump it. */
const SCRIPT_VERSION = '1.0.0'

/** [HELD] Shape of holdout.json. Bumped when fields are added or renamed. */
const SCHEMA_VERSION = 1

/** [MEASURED] Oracle pipeline §7.4.2: keep artworks whose best rendition
 *  satisfies |w/h − 1| ≤ 0.05. A strict w == h test drops ~208 legitimately
 *  slightly-cropped covers; this tolerance yields 3,097 candidates. */
const SQUARE_ASPECT_TOLERANCE = 0.05

/** [MEASURED] Oracle pipeline §7.4.2: the 1,459 files at ≤150 px (dominated by
 *  147×147 AVIF) are derived thumbnails, not sources. Strictly greater than. */
const MIN_BEST_LONG_EDGE_PX = 150

/** [HELD] Resolution bands for stratification, on the best rendition's long
 *  edge. Orchestrator-chosen (not a reviewer decision): 400 and 640 are the
 *  CDN's common derived sizes, 1024 is the ceiling above which the oracle
 *  pipeline (§7.4) says the collection is too thin to conclude anything.
 *  Reviewer was offered a veto 2026-08-02 (quantile-based alternative declined
 *  by default). */
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

/** [MEASURED] Candidates after the ≤150 px tail and the 797-file real-transparency
 *  exclusion are removed. Upper bound is the pre-exclusion measurement; the lower
 *  bound assumes the exclusion cannot plausibly remove more than ~25%. */
const FINAL_CANDIDATE_PLAUSIBLE_RANGE = { min: 2300, max: 3097 }

/** [MEASURED] Oracle pipeline §7.4: 8,595 files, 4,088 distinct artworks. */
const EXPECTED_FILE_COUNT = 8595
const EXPECTED_ARTWORK_COUNT = 4088

/** [MEASURED] PHASE_0_DECISIONS.md §1: 797 files with genuinely transparent
 *  pixels (disc scans, press-photo cutouts) — not album artwork. */
const EXPECTED_TRANSPARENCY_EXCLUSION_FILES = 797

/** [INHERITED] Extensions present in the collection (case-insensitive). */
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpg', '.jpeg', '.png'])

/** [INHERITED] `<32-hex>[_WxH].<ext>` — the 32-hex stem is the artwork id. */
const FILENAME_PATTERN = /^([0-9a-f]{32})(?:_(\d+)x(\d+))?\.([A-Za-z]+)$/

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

type HeldFile = Measurement & { sha256: string }

// ---------------------------------------------------------------------------
// Steps
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

function isSquare(m: Measurement): boolean {
	return Math.abs(m.width / m.height - 1) <= SQUARE_ASPECT_TOLERANCE
}

function longEdge(m: Measurement): number {
	return Math.max(m.width, m.height)
}

function stratumOf(m: Measurement): StratumName {
	const edge = longEdge(m)
	for (const band of STRATUM_BANDS) if (edge <= band.maxLongEdge) return band.name
	throw new Error(`no stratum for long edge ${edge}`)
}

async function sha256(absolutePath: string): Promise<string> {
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

	// --- stratify -----------------------------------------------------------
	const byStratum = new Map<StratumName, Artwork[]>(STRATUM_BANDS.map((b) => [b.name, [] as Artwork[]]))
	for (const artwork of candidates) byStratum.get(stratumOf(artwork.best))!.push(artwork)

	// --- select -------------------------------------------------------------
	const rng = mulberry32(HOLDOUT_SEED)
	const held: Array<{ artwork: Artwork; stratum: StratumName }> = []
	const perStratum: Array<{ stratum: StratumName; candidates: number; held: number; fraction: number }> = []

	for (const band of STRATUM_BANDS) {
		// Sort by id first so the shuffle input never depends on filesystem order.
		const pool = byStratum.get(band.name)!.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
		const take = Math.round(pool.length * HOLDOUT_FRACTION)
		const drawn = shuffle(pool.slice(), rng).slice(0, take)
		drawn.sort((a, b) => (a.id < b.id ? -1 : 1))
		for (const artwork of drawn) held.push({ artwork, stratum: band.name })
		perStratum.push({
			stratum: band.name,
			candidates: pool.length,
			held: drawn.length,
			fraction: pool.length === 0 ? 0 : drawn.length / pool.length,
		})
	}
	held.sort((a, b) => (a.artwork.id < b.artwork.id ? -1 : 1))

	// --- hash held-out files ------------------------------------------------
	process.stderr.write(`hashing ${held.reduce((n, h) => n + h.artwork.files.length, 0)} held-out files ...\n`)
	const heldRecords: Array<{
		id: string
		stratum: StratumName
		bestRenditionPath: string
		bestLongEdgePx: number
		renditionCount: number
		files: HeldFile[]
	}> = []
	for (const { artwork, stratum } of held) {
		const files: HeldFile[] = []
		for (const file of artwork.files) {
			files.push({ ...file, sha256: await sha256(path.join(REPO_ROOT, file.path)) })
		}
		heldRecords.push({
			id: artwork.id,
			stratum,
			bestRenditionPath: artwork.best.path,
			bestLongEdgePx: longEdge(artwork.best),
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
	// Exclusion list actually applied, in both directions.
	check(droppedTransparent.length > 0, 'transparency exclusion removed zero artworks — list not applied')
	for (const id of excludedIds) {
		if (!artworks.has(id)) problems.push(`exclusion list names an artwork not in the collection: ${id}`)
	}
	for (const record of heldRecords) {
		if (excludedIds.has(record.id)) problems.push(`held-out artwork is on the exclusion list: ${record.id}`)
	}
	// Dimensions present for every held-out file.
	for (const record of heldRecords) {
		for (const file of record.files) {
			if (!Number.isInteger(file.width) || !Number.isInteger(file.height) || file.width < 1 || file.height < 1) {
				problems.push(`held-out file missing dimensions: ${file.path}`)
			}
			if (!/^[0-9a-f]{64}$/.test(file.sha256)) problems.push(`bad sha256 for ${file.path}`)
		}
		if (record.files.length === 0) problems.push(`held-out artwork has no files: ${record.id}`)
	}
	// Selection integrity.
	const heldIds = new Set(heldRecords.map((r) => r.id))
	check(heldIds.size === heldRecords.length, 'duplicate artwork ids in the holdout')
	const candidateIds = new Set(candidates.map((a) => a.id))
	for (const id of heldIds) {
		if (!candidateIds.has(id)) problems.push(`held-out artwork is not a candidate: ${id}`)
	}
	const totalHeld = heldRecords.length
	const overallFraction = totalHeld / candidates.length
	check(
		Math.abs(overallFraction - HOLDOUT_FRACTION) < 0.005,
		`overall holdout fraction ${overallFraction.toFixed(4)} is not ~${HOLDOUT_FRACTION}`,
	)
	for (const row of perStratum) {
		if (row.candidates > 0 && Math.abs(row.fraction - HOLDOUT_FRACTION) > 0.01) {
			problems.push(`stratum ${row.stratum} holdout fraction ${row.fraction.toFixed(4)} is off target`)
		}
	}

	if (problems.length > 0) {
		process.stderr.write(`\nSANITY CHECKS FAILED (${problems.length}):\n`)
		for (const problem of problems) process.stderr.write(`  - ${problem}\n`)
		process.exit(1)
	}

	// --- write --------------------------------------------------------------
	const heldFileCount = heldRecords.reduce((n, r) => n + r.files.length, 0)
	const document = {
		header: {
			what: 'Frozen holdout for the v3 album-artwork palette rewrite (PHASE_0_DECISIONS.md §5).',
			schemaVersion: SCHEMA_VERSION,
			scriptVersion: SCRIPT_VERSION,
			generatedBy: 'research/v3/src/holdout/freeze-holdout.ts',
			freezeDate: FREEZE_DATE,
			seed: HOLDOUT_SEED,
			seedHex: `0x${HOLDOUT_SEED.toString(16)}`,
			rng: 'mulberry32 + Fisher-Yates, one stream, strata drawn in the order listed below',
			collectionRoot: relative(COLLECTION_ROOT),
			pathsAreRelativeTo: 'repository root',
			rules: {
				dimensions: 'measured from image headers (sharp .metadata()); filename _WxH suffixes are ignored',
				bestRendition:
					'largest measured pixel area; ties prefer the un-suffixed original over a derived _WxH rendition, then the lexicographically smallest path',
				aspect: `|w/h - 1| <= ${SQUARE_ASPECT_TOLERANCE} on the best rendition`,
				minLongEdge: `best rendition long edge > ${MIN_BEST_LONG_EDGE_PX} px`,
				transparencyExclusion:
					'artworks with any file in the `real` array of research/v3/data/source-surveys/pixel_results.json are excluded',
				granularity: 'selection is at artwork level; every rendition of a held-out artwork is held out',
				targetFraction: HOLDOUT_FRACTION,
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
				heldOutArtworks: totalHeld,
				heldOutFiles: heldFileCount,
				heldOutFraction: Number(overallFraction.toFixed(6)),
			},
			strata: perStratum.map((row) => ({
				stratum: row.stratum,
				candidateArtworks: row.candidates,
				heldOutArtworks: row.held,
				fraction: Number(row.fraction.toFixed(6)),
			})),
		},
		artworks: heldRecords,
	}

	const json = `${JSON.stringify(document, null, '\t')}\n`
	const markdown = renderMarkdown(document, perStratum, heldRecords)

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
			`  candidates ${candidates.length}, held out ${totalHeld} artworks / ${heldFileCount} files ` +
			`(${(overallFraction * 100).toFixed(2)}%)\n`,
	)
}

function renderMarkdown(
	document: {
		header: {
			counts: Record<string, number>
			seedHex: string
			seed: number
		}
	},
	perStratum: Array<{ stratum: StratumName; candidates: number; held: number; fraction: number }>,
	heldRecords: Array<{ renditionCount: number }>,
): string {
	const c = document.header.counts
	const multiRendition = heldRecords.filter((r) => r.renditionCount > 1).length
	const rows = perStratum
		.map(
			(row) =>
				`| ${row.stratum} | ${row.candidates} | ${row.held} | ${(row.fraction * 100).toFixed(1)}% |`,
		)
		.join('\n')

	return `# music-artworks holdout — frozen ${FREEZE_DATE}

## What this is

A fixed list of album artworks from \`music-artworks/\` that the v3 palette work is
**not allowed to look at** during development. It is the reviewer's personal library —
the closest set we have to the deployment distribution, and there is no more where it
came from. The sharded corpus gets no holdout (fresh shards are effectively unlimited);
this collection is complete, so a slice of it is reserved instead.

Generated by \`research/v3/src/holdout/freeze-holdout.ts\` (version ${SCRIPT_VERSION}),
frozen list in \`holdout.json\`.

## Freeze rules

Held-out artworks are excluded from:

- review batches (nobody looks at their palettes),
- development batches and debugging,
- outlier mining and pathology triage,
- any tuning, threshold fitting, or calibration.

They are touched **only** for end-of-campaign claims — the one honest measurement at
the end. The resolution ladder draws from the non-holdout remainder.

Holding out is at the **artwork** level. ${multiRendition} of the ${c.heldOutArtworks}
held-out artworks have more than one rendition, and every one of those renditions is held
out with it — no artwork straddles the line, so nothing can be tuned on a small rendition
and then "evaluated" on its large one.

Looking at a held-out artwork spends it. If one is looked at, say so and remove it from
the end-of-campaign claim — do not quietly keep it.

## How to use it

Exclude by artwork id, not by path — every rendition shares the id:

\`\`\`ts
const frozen = JSON.parse(await readFile('research/v3/data/holdout/holdout.json', 'utf8'))
const heldOut = new Set(frozen.artworks.map((a) => a.id))
// an artwork id is the 32-hex filename stem: basename(path).slice(0, 32)
\`\`\`

The \`sha256\` recorded for every held-out file lets a future run prove the bytes it
measured are the bytes that were frozen.

## How the set was built

1. Enumerate all ${c.filesInCollection} files, group by the 32-hex filename stem
   → ${c.artworksInCollection} artworks.
2. Measure every file from its **header**. Filenames lie here: 719 AVIFs disagree with
   their own \`_WxH\` suffix, and 503 artworks have a derived rendition that *claims*
   in its filename to be larger than the un-suffixed original. Measured, none actually
   is — but 502 artworks have a derived rendition tied with the original on exact pixel
   area. The best rendition is the largest **measured** pixel area; on a tie the
   un-suffixed original wins (it is the source, not a re-encode), then the
   lexicographically smallest path. No held-out artwork ends up with a \`_WxH\` file as
   its best rendition.
3. Keep artworks whose best rendition is square within |w/h − 1| ≤ ${SQUARE_ASPECT_TOLERANCE}
   (${c.squareArtworks} artworks; ${c.droppedNonSquareArtworks} dropped — banners, hero images, site furniture),
   whose best long edge is > ${MIN_BEST_LONG_EDGE_PX} px (${c.droppedThumbnailOnlyArtworks} dropped as
   thumbnail-only), and which have no file with genuinely transparent pixels
   (${c.droppedTransparentCandidates} dropped — disc scans and press-photo cutouts, from the
   ${c.transparencyExclusionFiles}-file survey in
   \`research/v3/data/source-surveys/pixel_results.json\`).
   → **${c.candidateArtworks} album-artwork candidates.**
4. Stratify by the best rendition's long edge and draw ~15% per stratum with a seeded
   PRNG (mulberry32, seed \`${document.header.seedHex}\`, Fisher-Yates). The seed is pinned in the
   script, so the selection is reproducible from the code alone.

## Counts

| stratum (best long edge) | candidates | held out | share |
|---|---|---|---|
${rows}
| **total** | **${c.candidateArtworks}** | **${c.heldOutArtworks}** | **${(c.heldOutFraction * 100).toFixed(2)}%** |

That is ${c.heldOutFiles} files across ${c.heldOutArtworks} artworks. The remaining
${c.candidateArtworks - c.heldOutArtworks} candidate artworks are the working set.

## Re-running

\`\`\`
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/holdout/freeze-holdout.ts --verify
\`\`\`

The script is idempotent — seed, freeze date and script version are pinned constants and
all measurements come from the files themselves, so a re-run rewrites the same bytes.
\`--verify\` re-derives the selection and fails if the committed files disagree.
\`measurements.jsonl\` next to this file is the header-measurement cache (also the raw
dimension survey of the whole collection); deleting it only makes the next run slower.

**Changing \`HOLDOUT_SEED\` re-rolls the holdout and voids every claim made against the
old list.** Don't.
`
}

await main()
