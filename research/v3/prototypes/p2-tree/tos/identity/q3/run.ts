/**
 * **Q3 — D8's floor check: what kind of thing is each unreachable endorsed colour?**
 *
 * D8's exposure, stated: *"our area floors (`MIN_NODE_AREA_FRACTION` 5e-4, `TEXT_COMPONENT_LIMIT` 512)
 * are the same shape as the mass floor that excluded 4 of 7 reviewer-named identity marks in another
 * arm"*, and the cycle-3 check it orders is whether the merged pool's reachability failures are **tiny
 * concentrated marks sitting below the node area floor**. If they are, the floor should move toward a
 * stability-based retention; if they are not, moving it recovers nothing and the failure is elsewhere.
 *
 * ## What is measured, per failed slot
 *
 * The input is the merged reachability report (`falsifier/out/tos-merged-report.json`, 1,397 slots,
 * 1,284 reachable): the **113** slots with `node.within === false`, of which **24** are the
 * pre-registered falsifier's numerator (control-reachable) and **89** are unreachable from both.
 *
 * For each, in the artwork the endorsement is about:
 *
 *  - **exact-triple share** — the endorsed hex as a literal pixel value. Usually 0: a legacy palette
 *    colour is not obliged to be a pixel, which is why the falsifier compares under the bar.
 *  - **bar-neighbourhood share** — every pixel the contract's regional ruler calls the same colour.
 *    This is the honest mass, and it is the quantity a mass floor would be applied to.
 *  - **the largest bar-coherent 8-connected region** of that colour, with its **inradius** — whether
 *    the colour exists as a *region* at all, and how thick it is.
 *
 * ## The classification, MECE and in this order
 *
 * | class | test | would a smaller floor recover it? |
 * |---|---|---|
 * | `absent-from-image` | bar mass is 0 | **no** — the colour is not in this artwork under the bar |
 * | `above-floor-region` | largest region ≥ `MIN_NODE_AREA_FRACTION` | **no** — the region clears the floor already; stability, chain collapse or the representative rule lost it |
 * | `dispersed-no-region` | largest region < `MIN_REGION_PIXELS` | **no** — there is nothing for any floor to retain |
 * | `antialias-only` | largest region ≥ `MIN_REGION_PIXELS` but inradius < 2 px | **no** — filaments; a node over them would publish an edge blend |
 * | `below-floor-concentrated-mark` | everything else: a compact region under the floor | **yes** — this is D8's case |
 *
 * `MIN_REGION_PIXELS` (8) and the 2 px inradius are **diagnosis cuts declared here**, not pipeline
 * constants; the per-slot region area and inradius are in `report.json` so the classification can be
 * re-cut without re-running. The recoverable share is reported with a Wilson interval through
 * `src/stats`, and the slots are clustered inside artworks, so the interval is stated with that caveat.
 *
 * Deterministic: rows are taken in the report's own sorted order, images decoded once each, no
 * randomness. Provenance tag `p2-tos-identity/q3@1`.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb } from "../../../../../src/contract/color.ts"
import { wilsonInterval, honestLine } from "../../../../../src/stats/index.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { MIN_NODE_AREA_FRACTION } from "../../constants.ts"
import { decodeImage } from "../../pipeline.ts"
import { attribute } from "../pixels.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const P2 = resolve(HERE, "..", "..", "..")
const REPORT = resolve(P2, "falsifier", "out", "tos-merged-report.json")
const WORKTREE = resolve(P2, "..", "..", "..", "..")

/**
 * The corpus-relative path (`00/ab…jpg`).
 *
 * The falsifier report stores absolute paths resolved inside whichever checkout produced it, and this
 * measurement runs in a pinned export of the tree with the shards symlinked beside it. Storing the
 * shard-relative path is what makes `report.json` re-readable from either.
 */
const relativeOf = (absolute: string): string => {
	const match = /([0-9a-f]{2}\/[^/]+)$/.exec(absolute)
	return match === null ? absolute : match[1]
}

/** Diagnosis cuts. Not pipeline constants; every per-slot number is published so they can be re-cut. */
const MIN_REGION_PIXELS = 8
const FILAMENT_INRADIUS_PX = 2
/** Cost guard on the distance transforms, largest components first. Under-reports thickness only. */
const INRADIUS_BUDGET = 128

type Row = {
	artworkSha256: string
	imagePath: string
	entryId: string
	role: string
	target: string
	falsifies: boolean
	node: { within: boolean; nearest: string | null; barRatio: number | null; emptySet: boolean }
	control: { within: boolean; nearest: string | null; barRatio: number | null; emptySet: boolean }
}

const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
	rows: Row[]
	aggregate: { counts: Record<string, number>; colours: number; artworks: number }[]
	input: unknown
	areaFloor: unknown
}

const rgbOf = (hex: string): Rgb8 => {
	const value = Number.parseInt(hex.replace("#", ""), 16)
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

const failing = report.rows.filter((row) => !row.node.within)
const byImage = new Map<string, Row[]>()
for (const row of failing) {
	const bucket = byImage.get(row.imagePath)
	if (bucket === undefined) byImage.set(row.imagePath, [row])
	else bucket.push(row)
}

type Classified = {
	artworkSha256: string
	imagePath: string
	entryId: string
	role: string
	target: string
	falsifies: boolean
	nodeNearest: string | null
	nodeBarRatio: number | null
	controlWithin: boolean
	controlNearest: string | null
	totalPixels: number
	exactPixels: number
	exactShare: number
	barPixels: number
	barShare: number
	componentCount: number
	largestRegionPixels: number
	largestRegionAreaFraction: number
	largestRegionInradius: number
	maxInradius: number
	nodeAreaFloorPixels: number
	clearsNodeAreaFloor: boolean
	classification:
		| "absent-from-image"
		| "above-floor-region"
		| "dispersed-no-region"
		| "antialias-only"
		| "below-floor-concentrated-mark"
	floorChangeWouldRecover: boolean
}

const classified: Classified[] = []
const imagePaths = Array.from(byImage.keys()).sort()
let done = 0
for (const imagePath of imagePaths) {
	const image = await decodeImage(imagePath)
	const totalPixels = image.width * image.height
	const nodeAreaFloorPixels = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalPixels))
	const rows = (byImage.get(imagePath) ?? []).slice().sort((first, second) => first.entryId.localeCompare(second.entryId) || first.role.localeCompare(second.role))
	for (const row of rows) {
		const target = rgbOf(row.target)
		const measurement = attribute(image, target, INRADIUS_BUDGET)
		const largest = measurement.topComponents[0] ?? null
		const largestPixels = largest?.area ?? 0
		const largestInradius = largest?.inradius ?? 0
		const clearsFloor = largestPixels >= nodeAreaFloorPixels

		let classification: Classified["classification"]
		if (measurement.barPixels === 0) classification = "absent-from-image"
		else if (clearsFloor) classification = "above-floor-region"
		else if (largestPixels < MIN_REGION_PIXELS) classification = "dispersed-no-region"
		else if (measurement.maxInradius < FILAMENT_INRADIUS_PX) classification = "antialias-only"
		else classification = "below-floor-concentrated-mark"

		classified.push({
			artworkSha256: row.artworkSha256,
			imagePath: relativeOf(imagePath),
			entryId: row.entryId,
			role: row.role,
			target: colorFromRgb(target).hex,
			falsifies: row.falsifies,
			nodeNearest: row.node.nearest,
			nodeBarRatio: row.node.barRatio,
			controlWithin: row.control.within,
			controlNearest: row.control.nearest,
			totalPixels,
			exactPixels: measurement.exactPixels,
			exactShare: measurement.exactShare,
			barPixels: measurement.barPixels,
			barShare: measurement.barShare,
			componentCount: measurement.componentCount,
			largestRegionPixels: largestPixels,
			largestRegionAreaFraction: largestPixels / totalPixels,
			largestRegionInradius: largestInradius,
			maxInradius: measurement.maxInradius,
			nodeAreaFloorPixels,
			clearsNodeAreaFloor: clearsFloor,
			classification,
			floorChangeWouldRecover: classification === "below-floor-concentrated-mark",
		})
	}
	done += 1
	if (done % 10 === 0) console.error(`  ${done}/${imagePaths.length} artworks`)
}

// --- tables -------------------------------------------------------------------------------------
const CLASSES = [
	"absent-from-image",
	"above-floor-region",
	"dispersed-no-region",
	"antialias-only",
	"below-floor-concentrated-mark",
] as const

const tableFor = (rows: readonly Classified[]) => {
	const counts: Record<string, number> = {}
	for (const name of CLASSES) counts[name] = 0
	for (const row of rows) counts[row.classification] += 1
	return counts
}

const falsifierRows = classified.filter((row) => row.falsifies)
const bothRows = classified.filter((row) => !row.falsifies)

const rateOf = (successes: number, trials: number, label: string) => {
	const result = wilsonInterval(successes, trials)
	return result.ok
		? { label, successes, trials, rate: result.rate, low: result.low, high: result.high, line: `${label}: ${honestLine(result)}` }
		: { label, successes, trials, rate: null, low: null, high: null, line: `${label}: ${honestLine(result)}` }
}

const recoverableAll = classified.filter((row) => row.floorChangeWouldRecover).length
const recoverableFalsifier = falsifierRows.filter((row) => row.floorChangeWouldRecover).length
const recoverableBoth = bothRows.filter((row) => row.floorChangeWouldRecover).length

// What floor would be needed: the largest-region area fractions of the recoverable slots.
const recoverableAreas = classified
	.filter((row) => row.floorChangeWouldRecover)
	.map((row) => row.largestRegionAreaFraction)
	.sort((first, second) => first - second)
const quantile = (share: number): number | null =>
	recoverableAreas.length === 0 ? null : recoverableAreas[Math.min(recoverableAreas.length - 1, Math.floor(share * (recoverableAreas.length - 1)))]

const out = {
	provenance: "p2-tos-identity/q3@1",
	question: "D8 floor check — classify the merged pool's reachability failures",
	source: {
		report: "falsifier/out/tos-merged-report.json",
		dumpFiles: (report.input as { dumpFiles: string[] }).dumpFiles,
		falsifierAreaFloor: report.areaFloor,
	},
	cuts: {
		MIN_NODE_AREA_FRACTION,
		MIN_REGION_PIXELS,
		FILAMENT_INRADIUS_PX,
		INRADIUS_BUDGET,
		note: "MIN_REGION_PIXELS, FILAMENT_INRADIUS_PX and INRADIUS_BUDGET are diagnosis cuts declared in q3/run.ts, not pipeline constants",
	},
	totals: {
		slots: report.rows.length,
		failingSlots: classified.length,
		falsifierSlots: falsifierRows.length,
		unreachableFromBothSlots: bothRows.length,
		artworksTouched: imagePaths.length,
	},
	classification: {
		all: tableFor(classified),
		falsifierOnly: tableFor(falsifierRows),
		unreachableFromBothOnly: tableFor(bothRows),
	},
	recovery: {
		all: rateOf(recoverableAll, classified.length, "floor change recovers (all failing slots)"),
		falsifierOnly: rateOf(recoverableFalsifier, falsifierRows.length, "floor change recovers (falsifier slots)"),
		unreachableFromBothOnly: rateOf(recoverableBoth, bothRows.length, "floor change recovers (unreachable from both)"),
		caveat:
			"slots are clustered inside artworks (113 slots over " +
			`${imagePaths.length} artworks); the Wilson interval treats them as independent and is therefore optimistic`,
		recoverableRegionAreaFraction: {
			n: recoverableAreas.length,
			min: recoverableAreas[0] ?? null,
			p25: quantile(0.25),
			median: quantile(0.5),
			p75: quantile(0.75),
			max: recoverableAreas[recoverableAreas.length - 1] ?? null,
			note: "a floor at or below the minimum would retain a node for every recoverable slot; MIN_NODE_AREA_FRACTION is 5e-4",
		},
	},
	rows: classified,
}

writeFileSync(resolve(HERE, "report.json"), `${JSON.stringify(out, null, "\t")}\n`)
console.log(JSON.stringify({ totals: out.totals, classification: out.classification, recovery: { ...out.recovery, rows: undefined } }, null, 2))
