/**
 * **k's anchoring measurement** — arm-d §4 row 2, run.
 *
 * > *"The smallest k for which a ±1-LSB dither creates no new edge pixels on the perturbation set,
 * > measured per resolution tier. No human taste enters."*
 *
 * That sentence is a complete experimental protocol, and this file is it. The robustness harness has
 * already materialised the arm it needs — `data/robustness/cache/dither-lsb1/` holds a lossless-PNG
 * baseline and a ±1-LSB-perturbed twin of every cover in `perturbation-set-1.json` — so the measurement
 * is: decode both sides, compute the **edge field of the pipeline's own `computeEdgeField`** at each
 * candidate k, and count the pixels the dither turned into edges that were not edges before.
 *
 * ## What is counted, and why it is asymmetric
 *
 * - **new** — edge in the perturbed image, not an edge in the baseline. This is arm-d's quantity: a
 *   dither *creating* structure the artwork does not have. Everything downstream reads edges as seeds
 *   for the depth transform, so a manufactured edge is a manufactured hole in the field.
 * - **lost** — edge in the baseline, not in the perturbed image. Reported alongside because a k that
 *   drove `new` to zero by making the edge test insensitive to everything would show it here, and a
 *   number that can only be gamed one way is worth showing both ways. Not part of the criterion.
 *
 * Both are reported as a fraction of eligible pixels as well as a raw count, because the covers span
 * three resolution tiers and a raw count is not comparable across them. Per-tier medians are the form
 * arm-d asks for; the pooled row is there so a reader can see the curve at a glance.
 *
 * ## Determinism
 *
 * The covers are taken in set-file order, which is the order the stratified draw wrote them in, so
 * `--covers N` is a reproducible prefix rather than a sample of a sample. Everything else is a pure
 * function of the two PNGs.
 *
 * ```sh
 * cd research/v3
 * NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *   prototypes/p3-fields/src/tools/measure-edge-rank.ts --covers 20 \
 *   --out prototypes/p3-fields/measurements/edge-rank-k.json
 * ```
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { decodeImage } from "../decode.ts"
import { computeEdgeField } from "../fields.ts"

const V3_ROOT = path.resolve(import.meta.dirname, "../../../..")
const SET_FILE = path.join(V3_ROOT, "data/robustness/perturbation-set-1.json")
const CACHE_DIR = path.join(V3_ROOT, "data/robustness/cache/dither-lsb1")

/** The candidate ranks. 1 and 2 are excluded by the argument in `EDGE_RANK`'s own docstring: a ±1-LSB
 * checkerboard perturbs an alternating half of a 3×3 neighbourhood, so the largest and second-largest of
 * the eight distances are the ones a dither can own by construction. 8 is the whole neighbourhood. */
const RANKS = [3, 4, 5, 6, 7, 8] as const

type CoverRow = Readonly<{
	artworkId: string
	sha256: string
	tier: string
	width: number
	height: number
}>

type Reading = { rank: number; newEdges: number; lostEdges: number; baselineEdges: number; eligible: number }

function median(values: number[]): number {
	if (values.length === 0) return Number.NaN
	const sorted = [...values].sort((left, right) => left - right)
	return sorted[Math.floor((sorted.length - 1) / 2)]
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2)
	const coverArgument = argv.indexOf("--covers")
	const outArgument = argv.indexOf("--out")
	const coverCount = coverArgument === -1 ? 20 : Number(argv[coverArgument + 1])
	const outPath = outArgument === -1 ? null : path.resolve(argv[outArgument + 1])

	const set = JSON.parse(readFileSync(SET_FILE, "utf8")) as { covers: CoverRow[] }
	const covers = set.covers.slice(0, coverCount)

	const perCover: { artworkId: string; tier: string; readings: Reading[] }[] = []

	for (const [position, cover] of covers.entries()) {
		const key = cover.sha256.slice(0, 16)
		const baselinePath = path.join(CACHE_DIR, `${key}.dither-lsb1.baseline.png`)
		const perturbedPath = path.join(CACHE_DIR, `${key}.dither-lsb1.perturbed.png`)

		const baselineImage = await decodeImage(baselinePath)
		const perturbedImage = await decodeImage(perturbedPath)
		if (baselineImage.width !== perturbedImage.width || baselineImage.height !== perturbedImage.height) {
			throw new Error(`${cover.artworkId}: the two sides of the dither arm differ in size`)
		}

		const readings: Reading[] = []
		for (const rank of RANKS) {
			const baselineEdges = computeEdgeField(baselineImage, rank)
			const perturbedEdges = computeEdgeField(perturbedImage, rank)
			let newEdges = 0
			let lostEdges = 0
			for (let index = 0; index < baselineEdges.isEdge.length; index += 1) {
				const before = baselineEdges.isEdge[index]
				const after = perturbedEdges.isEdge[index]
				if (after === 1 && before === 0) newEdges += 1
				else if (before === 1 && after === 0) lostEdges += 1
			}
			readings.push({
				rank,
				newEdges,
				lostEdges,
				baselineEdges: baselineEdges.edgeCount,
				eligible: baselineImage.eligibleIndices.length,
			})
		}
		perCover.push({ artworkId: cover.artworkId, tier: cover.tier, readings })
		console.error(
			`  ${position + 1}/${covers.length} ${cover.artworkId} ${cover.tier} ` +
				readings.map((r) => `k${r.rank}:${r.newEdges}`).join(" "),
		)
	}

	const tiers = [...new Set(perCover.map((cover) => cover.tier))].sort()
	const summary = RANKS.map((rank) => {
		const rows = perCover.map((cover) => cover.readings.find((r) => r.rank === rank) as Reading)
		const fractions = rows.map((row) => row.newEdges / row.eligible)
		return {
			rank,
			covers: rows.length,
			newEdgesTotal: rows.reduce((sum, row) => sum + row.newEdges, 0),
			lostEdgesTotal: rows.reduce((sum, row) => sum + row.lostEdges, 0),
			baselineEdgesTotal: rows.reduce((sum, row) => sum + row.baselineEdges, 0),
			eligibleTotal: rows.reduce((sum, row) => sum + row.eligible, 0),
			newEdgeFractionMedian: median(fractions),
			newEdgeFractionMax: Math.max(...fractions),
			coversWithZeroNewEdges: rows.filter((row) => row.newEdges === 0).length,
			perTier: Object.fromEntries(tiers.map((tier) => {
				const inTier = perCover
					.filter((cover) => cover.tier === tier)
					.map((cover) => cover.readings.find((r) => r.rank === rank) as Reading)
				return [tier, {
					covers: inTier.length,
					newEdgesTotal: inTier.reduce((sum, row) => sum + row.newEdges, 0),
					newEdgeFractionMedian: median(inTier.map((row) => row.newEdges / row.eligible)),
					coversWithZeroNewEdges: inTier.filter((row) => row.newEdges === 0).length,
				}]
			})),
		}
	})

	const report = {
		what: "arm-d §4 row 2 — the smallest k for which a ±1-LSB dither creates no new edge pixels",
		measuredAt: new Date().toISOString(),
		arm: "dither-lsb1",
		setFile: path.relative(V3_ROOT, SET_FILE),
		covers: covers.length,
		tiers,
		summary,
		perCover,
	}

	console.log("")
	console.log("  k   new edges   as % of eligible (median / max)   covers with zero   lost edges")
	for (const row of summary) {
		console.log(
			`  ${row.rank}   ${String(row.newEdgesTotal).padStart(9)}   ` +
				`${(row.newEdgeFractionMedian * 100).toFixed(4).padStart(8)}% / ${(row.newEdgeFractionMax * 100).toFixed(4).padStart(8)}%   ` +
				`${String(row.coversWithZeroNewEdges).padStart(3)}/${row.covers}            ${String(row.lostEdgesTotal).padStart(9)}`,
		)
	}
	console.log("")
	for (const tier of tiers) {
		console.log(
			`  tier ${tier.padEnd(10)} ` +
				summary.map((row) => `k${row.rank}:${(row.perTier[tier] as { newEdgesTotal: number }).newEdgesTotal}`).join(" "),
		)
	}

	if (outPath !== null) {
		writeFileSync(outPath, `${JSON.stringify(report, null, "\t")}\n`)
		console.log(`\n  ${outPath}`)
	}
}

await main()
