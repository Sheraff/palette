/**
 * Cost scoping for the resolution-ladder run (oracle pipeline §7.4.3).
 *
 * The ladder is the expensive experiment in Phase 0, so the decision it needs is not
 * "how long will it take" but "which of these three do we buy". This script reads
 * `data/oracle-ladder/manifest.json`, prices every scope from a cost model fitted to the
 * ONE real measurement we have (the premise run, 299 inferences, same model, same
 * machine, same grammar), and prints a decision table.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/scope-cost.ts
 *   ... --markdown        print the table as markdown instead of aligned text
 *
 * Writes `data/oracle-ladder/cost-scoping.json`. No model is loaded; nothing is run.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// The cost model. Every constant measured, none guessed.
// ---------------------------------------------------------------------------

/**
 * [MEASURED] Anchor points, long edge → seconds per inference. Every value comes off this
 * machine, this model, this grammar. Nothing is fitted or assumed; between anchors the
 * cost is interpolated linearly in PIXEL AREA (prefill scales with area), and above the
 * top anchor it extrapolates on the last segment's slope.
 *
 *   px    s     n   where
 *   147   1.95  2   ladder smoke (data/oracle-ladder/smoke-1.jsonl)
 *   300   2.33  43  premise run (data/oracle-premise/premise-run-1.jsonl), variant B
 *   500   2.83  4   premise run at 483/500 px
 *   640   3.11  93  premise run, variant B — the best-powered point there is
 *   1079  11.5  1   ladder smoke (an AVIF; decode is part of the cost)
 *   3000  55.3  1   ladder smoke, the largest image in the collection (a JPEG)
 *
 * The two big anchors are why this table replaced a straight line through 300 and 640.
 * That line predicted 24 s for the 3,000 px image; it actually took 55 s. Cost above
 * ~1,000 px is superlinear in area — bigger vision-encoder attention, plus AVIF decode —
 * and a linear extrapolation understates the tail by more than 2×.
 *
 * The gap to be honest about: nothing is measured between 640 and 1,079 px, and the
 * 681–900 px bin holds 586 of the 4,306 full-scope rungs. Their cost here is interpolation.
 */
const SECONDS_ANCHORS: ReadonlyArray<{ longEdgePx: number; seconds: number; n: number }> = [
	{ longEdgePx: 147, seconds: 1.95, n: 2 },
	{ longEdgePx: 300, seconds: 2.33, n: 43 },
	{ longEdgePx: 500, seconds: 2.83, n: 4 },
	{ longEdgePx: 640, seconds: 3.11, n: 93 },
	{ longEdgePx: 1079, seconds: 11.5, n: 1 },
	{ longEdgePx: 3000, seconds: 55.3, n: 1 },
]

/** [INHERITED] Qwen-VL merges 2×2 patches of 14 px, so one token covers a 28×28 block.
 *  Used for the reported token totals, not for the timing (which is measured directly). */
const PIXELS_PER_IMAGE_TOKEN_EDGE = 28

/** [MEASURED] The premise run's whole-file wall clock: 299 rows over 856 s = 2.87 s per
 *  row, and the summed `generation_seconds` is 101% of that — per-item overhead outside
 *  generation (image decode, a fresh llguidance matcher, JSONL fsync) is inside the noise.
 *  So wall clock == generation time; no separate overhead term is needed. */
const MEASURED_WALL_SECONDS_PER_ROW = 2.87

/**
 * [MEASURED] The band, and why there has to be one. The ladder smoke decoded the SAME
 * canary image three times in one process: 8.9 s, 2.2 s, 14.6 s. Identical bytes,
 * identical prompt, byte-identical answers — a 6.6× spread that is entirely machine
 * contention and thermal state. The premise README's pre-flight estimate (8–10 s) and the
 * premise run's measured 2.87 s are the same phenomenon, not a contradiction.
 *
 * So every projection is quoted as a band: the anchor table (a quiet machine), and the
 * anchor table × this (a busy or throttled one). 3.0 reproduces both the pre-flight
 * estimate and the slowest canary.
 */
const CONSERVATIVE_MULTIPLIER = 3.0

/** [MEASURED] premise README: ~35 s to load the 25.9 GB model, once per process. A
 *  supervised run pays it again on every restart. */
const MODEL_LOAD_SECONDS = 35

/** [REVIEWED] Pipeline §5.3 sizes the canary at N ≈ 100 for a 7,000-image run. The ladder
 *  full scope is 4,306 inferences, so 100 is the right order; the premise test's 20 was
 *  sized for a 284-inference run. */
const CANARY_EVERY = 100

/** [REVIEWED] One prompt variant, not two. Variant B, measured better than A on the
 *  premise run (κ 0.311 vs 0.210 strict, 0.484 vs 0.446 on mapped labels), and the ladder
 *  asks a within-artwork question — the same prompt at different sizes — so the
 *  two-variant disagreement signal buys nothing here and doubles the bill. */
const VARIANTS_PER_IMAGE = 1

// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const OUT_DIR = path.join(REPO_ROOT, 'research/v3/data/oracle-ladder')
const MANIFEST_JSON = path.join(OUT_DIR, 'manifest.json')
const COST_JSON = path.join(OUT_DIR, 'cost-scoping.json')

/** [INHERITED] Same bins and same reference floor the analysis uses
 *  (`common_ladder.py` LONG_EDGE_BINS, `analyze.py` REFERENCE_MIN_LONG_EDGE_PX), so the
 *  power column below counts exactly the comparisons the analysis will score. */
const LONG_EDGE_BINS: ReadonlyArray<[number, number]> = [
	[0, 160], [161, 240], [241, 340], [341, 440], [441, 560],
	[561, 680], [681, 900], [901, 1400], [1401, 10_000],
]
const REFERENCE_MIN_LONG_EDGE_PX = 500

function binOf(longEdgePx: number): string {
	for (const [low, high] of LONG_EDGE_BINS) {
		if (longEdgePx >= low && longEdgePx <= high) return high < 10_000 ? `${low}-${high}` : `${low}+`
	}
	throw new Error(`no bin for long edge ${longEdgePx}`)
}

/** Wilson half-width at the given agreement — "how tight will the curve point be". */
function wilsonHalfWidth(n: number, p = 0.9, z = 1.96): number {
	if (n === 0) return 1
	const denominator = 1 + (z * z) / n
	return (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator
}

type Manifest = {
	header: { counts: Record<string, unknown>; sampling: Record<string, unknown> }
	ladder: Array<{
		id: string
		inSample: boolean
		distinctSizeCount: number
		isMatchedContrast: boolean
		referenceLongEdgePx: number
		renditions: Array<{
			width: number
			height: number
			longEdgePx: number
			isReference: boolean
			isRungRepresentative: boolean
		}>
	}>
	pairs: Array<{ files: Array<{ width: number; height: number; longEdgePx: number }> }>
}

/** How many scored comparisons each bin gets — the thing that decides what the run can
 *  conclude, which hours alone never show. */
function comparisonsPerBin(manifest: Manifest, onlySample: boolean): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const artwork of manifest.ladder) {
		if (onlySample && !artwork.inSample) continue
		const reference = artwork.renditions.find((r) => r.isReference)!
		if (reference.longEdgePx < REFERENCE_MIN_LONG_EDGE_PX) continue
		for (const rendition of artwork.renditions) {
			if (rendition.isReference || !rendition.isRungRepresentative) continue
			if (rendition.width === reference.width && rendition.height === reference.height) continue
			const name = binOf(rendition.longEdgePx)
			counts[name] = (counts[name] ?? 0) + 1
		}
	}
	return counts
}

function imageTokens(width: number, height: number): number {
	return (
		Math.ceil(width / PIXELS_PER_IMAGE_TOKEN_EDGE) * Math.ceil(height / PIXELS_PER_IMAGE_TOKEN_EDGE)
	)
}

/** Interpolate the anchor table in pixel area; extrapolate above the top anchor on the
 *  last segment's slope, which is the only defensible thing to do with two anchors up
 *  there and no measurement beyond 3,000 px (nothing in the collection is bigger). */
function secondsFor(width: number, height: number): number {
	const area = width * height
	const anchors = SECONDS_ANCHORS.map((a) => ({ area: a.longEdgePx * a.longEdgePx, seconds: a.seconds }))
	if (area <= anchors[0]!.area) return anchors[0]!.seconds
	for (let i = 1; i < anchors.length; i++) {
		const previous = anchors[i - 1]!
		const current = anchors[i]!
		if (area <= current.area || i === anchors.length - 1) {
			const slope = (current.seconds - previous.seconds) / (current.area - previous.area)
			return previous.seconds + slope * (area - previous.area)
		}
	}
	return anchors[anchors.length - 1]!.seconds
}

type Scope = {
	scope: string
	what: string
	artworks: number
	images: number
	inferences: number
	imageTokens: number
	measuredHours: number
	conservativeHours: number
	longEdge: { min: number; p50: number; max: number }
}

function priceImages(
	scope: string,
	what: string,
	artworks: number,
	images: Array<{ width: number; height: number; longEdgePx: number }>,
): Scope {
	const inferences = images.length * VARIANTS_PER_IMAGE
	const canaries = Math.ceil(inferences / CANARY_EVERY)
	// The canary is a fixed 640×640 rendition, so it costs what a 640 px image costs.
	const seconds =
		images.reduce((total, i) => total + secondsFor(i.width, i.height) * VARIANTS_PER_IMAGE, 0) +
		canaries * secondsFor(640, 640) +
		MODEL_LOAD_SECONDS
	const edges = images.map((i) => i.longEdgePx).sort((a, b) => a - b)
	return {
		scope,
		what,
		artworks,
		images: images.length,
		inferences: inferences + canaries,
		imageTokens: images.reduce((total, i) => total + imageTokens(i.width, i.height), 0),
		measuredHours: seconds / 3600,
		conservativeHours: (seconds * CONSERVATIVE_MULTIPLIER) / 3600,
		longEdge: { min: edges[0]!, p50: edges[Math.floor(edges.length / 2)]!, max: edges[edges.length - 1]! },
	}
}

function pad(text: string, width: number, right = false): string {
	return right ? text.padStart(width) : text.padEnd(width)
}

async function main(): Promise<void> {
	const manifest = JSON.parse(await readFile(MANIFEST_JSON, 'utf8')) as Manifest
	const markdown = process.argv.includes('--markdown')

	const rungsOf = (only?: (a: Manifest['ladder'][number]) => boolean) =>
		manifest.ladder
			.filter((a) => (only ? only(a) : true))
			.flatMap((a) => a.renditions.filter((r) => r.isRungRepresentative))
	const allFilesOf = (only?: (a: Manifest['ladder'][number]) => boolean) =>
		manifest.ladder.filter((a) => (only ? only(a) : true)).flatMap((a) => a.renditions)

	const sampleArtworks = manifest.ladder.filter((a) => a.inSample)
	const pairImages = manifest.pairs.flatMap((p) => p.files)

	const scopes: Scope[] = [
		priceImages(
			'full',
			'every distinct-size rendition of all ladder-eligible artworks',
			manifest.ladder.length,
			rungsOf(),
		),
		priceImages(
			'sample',
			`stratified ${sampleArtworks.length}-artwork sample, every distinct-size rendition`,
			sampleArtworks.length,
			rungsOf((a) => a.inSample),
		),
		priceImages('pairs', 'the 644 sharded cross-tier pairs (transfer check)', manifest.pairs.length, pairImages),
	]
	const combined = priceImages(
		'sample+pairs',
		'scope sample then scope pairs, one after the other',
		sampleArtworks.length + manifest.pairs.length,
		[...rungsOf((a) => a.inSample), ...pairImages],
	)
	const fullEveryFile = priceImages(
		'full --include-duplicate-sizes',
		'as full, plus the same-size re-encodes (codec control, no new rung)',
		manifest.ladder.length,
		allFilesOf(),
	)

	const rows = [...scopes, combined, fullEveryFile]

	// -- print ---------------------------------------------------------------
	const header = ['scope', 'artworks', 'images', 'inferences', 'img tokens', 'hours (measured)', 'hours (conservative)']
	const body = rows.map((r) => [
		r.scope,
		String(r.artworks),
		String(r.images),
		String(r.inferences),
		r.imageTokens.toLocaleString('en-US'),
		r.measuredHours.toFixed(2),
		r.conservativeHours.toFixed(2),
	])
	if (markdown) {
		process.stdout.write(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|\n`)
		for (const row of body) process.stdout.write(`| ${row.join(' | ')} |\n`)
	} else {
		const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)))
		process.stdout.write(`${header.map((h, i) => pad(h, widths[i]!, i > 0)).join('  ')}\n`)
		process.stdout.write(`${widths.map((w) => '-'.repeat(w)).join('  ')}\n`)
		for (const row of body) {
			process.stdout.write(`${row.map((c, i) => pad(c, widths[i]!, i > 0)).join('  ')}\n`)
		}
	}
	process.stdout.write('\n')
	for (const r of rows) process.stdout.write(`${r.scope}: ${r.what} (long edge ${r.longEdge.min}/${r.longEdge.p50}/${r.longEdge.max} px min/median/max)\n`)

	// -- what each scope can actually conclude --------------------------------
	const power = {
		full: comparisonsPerBin(manifest, false),
		sample: comparisonsPerBin(manifest, true),
		pairs: { '241-340': manifest.pairs.length },
	}
	const binNames = LONG_EDGE_BINS.map(([low, high]) => (high < 10_000 ? `${low}-${high}` : `${low}+`))
	process.stdout.write('\nscored comparisons per long-edge bin (reference >= 500 px), and the\n')
	process.stdout.write('Wilson +/- half-width a bin that size buys at 90% agreement:\n\n')
	const powerHeader = ['bin (px)', 'full', '+/-', 'sample', '+/-', 'pairs']
	const powerBody = binNames
		.filter((name) => (power.full[name] ?? 0) + (power.sample[name] ?? 0) + ((power.pairs as Record<string, number>)[name] ?? 0) > 0)
		.map((name) => [
			name,
			String(power.full[name] ?? 0),
			(power.full[name] ?? 0) ? wilsonHalfWidth(power.full[name]!).toFixed(3) : '-',
			String(power.sample[name] ?? 0),
			(power.sample[name] ?? 0) ? wilsonHalfWidth(power.sample[name]!).toFixed(3) : '-',
			String((power.pairs as Record<string, number>)[name] ?? 0),
		])
	const powerWidths = powerHeader.map((h, i) => Math.max(h.length, ...powerBody.map((r) => r[i]!.length)))
	process.stdout.write(`${powerHeader.map((h, i) => pad(h, powerWidths[i]!, i > 0)).join('  ')}\n`)
	process.stdout.write(`${powerWidths.map((w) => '-'.repeat(w)).join('  ')}\n`)
	for (const row of powerBody) {
		process.stdout.write(`${row.map((c, i) => pad(c, powerWidths[i]!, i > 0)).join('  ')}\n`)
	}
	const matchedInSample = manifest.ladder.filter((a) => a.inSample && a.isMatchedContrast).length
	const matchedTotal = manifest.ladder.filter((a) => a.isMatchedContrast).length
	process.stdout.write(
		`\nmatched-contrast anchors (~300 vs ~640 inside one artwork): ${matchedInSample} of ${matchedTotal} ` +
			'are in the sample by construction, so the transfer check has the same power under either scope.\n',
	)
	process.stdout.write(
		'The 561-680 px bin is empty under every scope: the CDN only ever derives 147 / ~330 / ~480 px ' +
			'renditions, so a ~640 px rung exists only when 640 IS the original — in which case it is the ' +
			'reference, not a rung. Consequence: the ladder brackets 300 px well and cannot say anything ' +
			'about whether 640 px is itself enough.\n',
	)

	await mkdir(OUT_DIR, { recursive: true })
	await writeFile(
		COST_JSON,
		`${JSON.stringify(
			{
				what: 'Projected cost of each resolution-ladder scope (oracle pipeline §7.4.3)',
				generatedBy: 'research/v3/oracle/ladder/scope-cost.ts',
				model: {
					anchors: SECONDS_ANCHORS,
					interpolation: 'linear in pixel area between anchors; last-segment slope above the top anchor',
					pixelsPerImageTokenEdge: PIXELS_PER_IMAGE_TOKEN_EDGE,
					measuredWallSecondsPerRow: MEASURED_WALL_SECONDS_PER_ROW,
					conservativeMultiplier: CONSERVATIVE_MULTIPLIER,
					modelLoadSeconds: MODEL_LOAD_SECONDS,
					canaryEvery: CANARY_EVERY,
					variantsPerImage: VARIANTS_PER_IMAGE,
					measuredOn: [
						'research/v3/data/oracle-premise/premise-run-1.jsonl (variant B, 142 rows, 300 and 640 px)',
						'research/v3/data/oracle-ladder/smoke-1.jsonl (13 rows + 3 canaries, 112–3,000 px, native)',
					],
					caveats: [
						'Nothing is measured between 640 and 1,079 px, and the 681-900 px bin holds 586 of ' +
							'the 4,306 full-scope rungs. Their cost is interpolation, and the interpolation is ' +
							'across the segment where the cost curve is known to bend upward, so this is the ' +
							'largest single source of error in the full-scope figure.',
						'The 1,079 and 3,000 px anchors are n=1 each.',
						'Peak memory measured 28.2 GB on the 3,000 px image against 27.0 GB on a 640 px one — ' +
							'no OOM, no memory reason to cap (pipeline §7.5).',
					],
				},
				scopes: rows,
				scoredComparisonsPerBin: power,
				powerNotes: [
					`Counted the way analyze.py scores: reference >= ${REFERENCE_MIN_LONG_EDGE_PX} px, ` +
						'same-size renditions excluded, one comparison per rung.',
					'The 561-680 px bin is empty under every scope. The CDN derives 147 / ~330 / ~480 px ' +
						'renditions and nothing between 560 and the original, so a ~640 px rung exists only ' +
						'when 640 IS the original — where it is the reference, not a rung. The ladder ' +
						'therefore brackets 300 px well and is silent on whether 640 px is itself enough; ' +
						'that question needs a different collection.',
					`Matched-contrast anchors: ${matchedInSample} of ${matchedTotal} are forced into the ` +
						'sample, so scope `sample` and scope `full` give the transfer check identical power.',
				],
			},
			null,
			'\t',
		)}\n`,
	)
	process.stderr.write(`wrote ${path.relative(REPO_ROOT, COST_JSON)}\n`)
}

await main()
