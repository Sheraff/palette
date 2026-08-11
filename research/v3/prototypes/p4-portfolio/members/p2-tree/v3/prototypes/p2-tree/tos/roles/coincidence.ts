/**
 * **One physical mark is one component** — the cross-lane (and residual within-lane) dedup rule.
 *
 * ## The defect this exists to fix
 *
 * `DECISIONS.md` D12, and `identity/q2/report.json` item 5 is the measurement. That cover's published
 * foreground came from a "text group" of four components whose geometry is:
 *
 * | parsed node | lane | box (px) | shape area (px) | centroid (normalised) |
 * |---|---|---|---|---|
 * | 41 | L | 115,109–130,139 | 143 | 0.4078, 0.4164 |
 * | 42 | L | 115,112–127,138 | 112 | 0.4048, 0.4218 |
 * | 65 | a | 115,104–133,139 | 200 | 0.4131, 0.4068 |
 * | 74 | b | 117,109–130,137 |  99 | 0.4115, 0.4089 |
 *
 * Those are not four marks. They are **one blob**, named once by each lane's tree and twice by the L
 * lane (chain collapse missed the second: the two L nodes' areas agree at 0.783, just under
 * `COMPONENT_CHAIN_AREA_AGREEMENT`). The detector then counted four "components", and because their
 * centroids are all within five pixels of each other the collinearity of the row was **0 — vacuously**,
 * since `collinearity` answers 0 for a degenerate point set. A single mark satisfied every clause of
 * arm-b §2.4's conjunction and elected the foreground the reviewer called unreadable.
 *
 * `TEXT_MIN_COMPONENTS` is a count of *distinct marks*. A count over re-namings of one mark is not that
 * count, so the population has to be a population of regions before it is counted.
 *
 * ## The merge criterion, stated precisely
 *
 * Two components are **the same physical region** when all three of these hold. The relation is closed
 * transitively (union–find), exactly as `clusterByBar` closes the colour relation.
 *
 *  1. **Colour agreement under the bar** — `okLabDistance(a, b) < sameColorBar(a, b)`, the contract's own
 *     regional ruler for that pair, the same clause arm-b §2.4 already applies when it groups marks.
 *  2. **Positional identity** — the centroids are closer than `NORMALISED_LENGTH_INDIFFERENCE`
 *     (`√MIN_NODE_AREA_FRACTION`, the linear extent of the grain), in normalised image units.
 *     `indifference.ts` states the reading: *two positions closer together than the smallest thing that
 *     can be at either of them are the same position.*
 *  3. **Extent agreement**, two readings of it, both required:
 *     - **containment** — the smaller region's pixels lie inside the larger's up to
 *       `COMPONENT_CHAIN_AREA_AGREEMENT`: `|A ∩ B| ≥ 0.8 · min(|A|, |B|)`. That constant is already this
 *       pipeline's answer to *"when is one region a re-naming of another"* (`collapseChains` uses it
 *       along a chain, where containment is structural); here it is measured, because two lanes' trees
 *       have no ancestry in common;
 *     - **box agreement** — every edge of the two bounding boxes is within
 *       `NORMALISED_LENGTH_INDIFFERENCE` of the other's, in normalised units. Two regions that occupy
 *       the same place have the same extent as well as the same centre.
 *
 * **No constant is added.** Both bands are existing derived quantities and the colour clause is the
 * contract's.
 *
 * ### Why clause 1 is in the conjunction
 *
 * *Spatial identity alone would be wrong.* The regression case this rule must not break is
 * `roles/tests/isoluminant-text.test.ts`: a glyph whose ink is isoluminant with its field exists **only**
 * in the chromatic lanes, so its a-lane and b-lane namings are the same mark at the same place — and
 * they are also the same colour, because they are the same pixels. Clause 1 costs that case nothing.
 * What clause 1 buys is the other direction: a glyph drawn **over a scrim or a halo** occupies the same
 * place as the thing under it and is a genuinely different colour there; merging on position alone would
 * delete one of the two. The bar is what tells those apart, and it is the only ruler allowed to.
 *
 * ### Why clause 3 needs both readings
 *
 * Containment alone swallows a **concentric nesting**: a badge centred in a panel of the same colour, or
 * a counter inside a glyph, is 100% contained in its container and shares its centroid — and
 * `COMPONENT_CHAIN_AREA_AGREEMENT`'s own doc comment names exactly that case as the thing the chain rule
 * must not do. The box clause is what separates it from the case this rule is for: on round 3a item 5
 * the four namings of one blob measure containment 0.727–1.000 **and** box gaps 0.0067–0.0267 against a
 * band of 0.02236, so five of the six pairs pass both clauses and the closure takes the sixth; a badge a
 * fifth of its panel's side fails the box clause on every edge.
 *
 * Neither reading is a new number and neither is a size cut: one is a containment ratio, the other is
 * the grain's linear extent applied to four coordinates.
 *
 * ## What a merged component keeps
 *
 * The **carrier** is the member with the largest shape area — the most complete naming of the region —
 * tie-broken on lexicographic RGB, then lane index, then parsed node id. Its colour, centroid, box,
 * stroke width and area are the merged component's; the merged component's area is the carrier's own
 * area and **not** a sum, because it is one region and summing would count its pixels once per lane.
 *
 * Every member's parsed node id and lane index are kept as **provenance**, so D2's evidence survives:
 * `roles/tests/isoluminant-text.test.ts` asserts that every node behind the published group is a
 * chromatic-lane node, and that assertion is over the provenance, not over the carrier alone.
 *
 * ## Determinism
 *
 * The result is a partition, so it does not depend on the order pairs are visited in: union–find over an
 * ascending scan with a merge that always points the higher root at the lower one, and groups returned
 * ordered by their lowest member with members ascending. Same construction, same argument, as
 * `clusterByBar`.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { COMPONENT_CHAIN_AREA_AGREEMENT } from "./constants.ts"
import { NORMALISED_LENGTH_INDIFFERENCE } from "./indifference.ts"

/**
 * One candidate region, in the terms the three clauses need.
 *
 * `contains` is membership by raster pixel index, so the caller keeps ownership of how a region is cut
 * from its own lane's tree and this file never learns what a lane is.
 */
export type CoincidenceCandidate = Readonly<{
	/** Centroid in normalised image units (the image is 1 wide and 1 tall). */
	centroidX: number
	centroidY: number
	/** Bounding box in pixels, inclusive. */
	minX: number
	minY: number
	maxX: number
	maxY: number
	/** The region's shape area in pixels. */
	areaPixels: number
	repr: Rgb8
	contains: (pixel: number) => boolean
}>

/**
 * Do the two bounding boxes agree on every edge, within the grain's linear extent?
 *
 * Normalised by the image's own side on each axis, which is the space
 * `NORMALISED_LENGTH_INDIFFERENCE` is expressed in. This also subsumes "the boxes overlap at all", so it
 * is the cheap gate in front of the pixel count as well as a clause in its own right.
 */
function boxesAgree(
	first: CoincidenceCandidate,
	second: CoincidenceCandidate,
	imageWidth: number,
	imageHeight: number,
): boolean {
	return (
		Math.abs(first.minX - second.minX) / imageWidth < NORMALISED_LENGTH_INDIFFERENCE &&
		Math.abs(first.maxX - second.maxX) / imageWidth < NORMALISED_LENGTH_INDIFFERENCE &&
		Math.abs(first.minY - second.minY) / imageHeight < NORMALISED_LENGTH_INDIFFERENCE &&
		Math.abs(first.maxY - second.maxY) / imageHeight < NORMALISED_LENGTH_INDIFFERENCE
	)
}

/** `|A ∩ B|` over the intersection of the two boxes, in pixels. */
function overlapPixels(first: CoincidenceCandidate, second: CoincidenceCandidate, imageWidth: number): number {
	const fromX = Math.max(first.minX, second.minX)
	const toX = Math.min(first.maxX, second.maxX)
	const fromY = Math.max(first.minY, second.minY)
	const toY = Math.min(first.maxY, second.maxY)
	let shared = 0
	for (let y = fromY; y <= toY; y += 1) {
		const row = y * imageWidth
		for (let x = fromX; x <= toX; x += 1) {
			const pixel = row + x
			if (first.contains(pixel) && second.contains(pixel)) shared += 1
		}
	}
	return shared
}

/**
 * **Group components that are the same physical region.**
 *
 * Returns each group's member indices ascending, groups ordered by their lowest member — the same shape
 * `clusterByBar` returns, so a caller can treat the two the same way.
 *
 * The scan is windowed on centroid `y`: clause 2 bounds the whole relation to pairs within one band, so
 * sorting by `y` and stopping the inner walk when the `y` gap exceeds the band visits every pair that
 * could merge and no more. That is an index over the same relation, not a second relation — every pair
 * the window offers is still measured by all three clauses.
 */
export function mergeCoincidentComponents(
	items: readonly CoincidenceCandidate[],
	imageWidth: number,
	imageHeight: number,
): number[][] {
	const parentOf = items.map((_unused, index) => index)
	const find = (index: number): number => {
		let root = index
		while (parentOf[root] !== root) root = parentOf[root]
		let walk = index
		while (parentOf[walk] !== root) {
			const next = parentOf[walk]
			parentOf[walk] = root
			walk = next
		}
		return root
	}

	const labs = items.map((item) => rgbToOkLab(item.repr))
	const paletteColors = items.map((item) => colorFromRgb(item.repr))
	const byCentroidY = Array.from({ length: items.length }, (_unused, index) => index).sort(
		(first, second) => items[first].centroidY - items[second].centroidY || first - second,
	)

	for (let position = 0; position < byCentroidY.length; position += 1) {
		const first = byCentroidY[position]
		for (let other = position + 1; other < byCentroidY.length; other += 1) {
			const second = byCentroidY[other]
			const gapY = items[second].centroidY - items[first].centroidY
			if (gapY >= NORMALISED_LENGTH_INDIFFERENCE) break
			// Clause 2 — positional identity, in normalised units.
			const gapX = items[second].centroidX - items[first].centroidX
			if (Math.hypot(gapX, gapY) >= NORMALISED_LENGTH_INDIFFERENCE) continue
			// Clause 1 — the contract's one colour ruler for this pair.
			if (okLabDistance(labs[first], labs[second]) >= sameColorBar(paletteColors[first], paletteColors[second])) continue
			// Clause 3a — the two boxes cover the same place.
			if (!boxesAgree(items[first], items[second], imageWidth, imageHeight)) continue
			if (find(first) === find(second)) continue
			// Clause 3b — containment, measured.
			const smaller = Math.min(items[first].areaPixels, items[second].areaPixels)
			if (smaller <= 0) continue
			if (overlapPixels(items[first], items[second], imageWidth) < COMPONENT_CHAIN_AREA_AGREEMENT * smaller) continue
			const rootFirst = find(first)
			const rootSecond = find(second)
			parentOf[Math.max(rootFirst, rootSecond)] = Math.min(rootFirst, rootSecond)
		}
	}

	const groupOf = new Map<number, number[]>()
	for (let index = 0; index < items.length; index += 1) {
		const root = find(index)
		const bucket = groupOf.get(root)
		if (bucket === undefined) groupOf.set(root, [index])
		else bucket.push(index)
	}
	return Array.from(groupOf.keys())
		.sort((first, second) => first - second)
		.map((root) => (groupOf.get(root) ?? []).slice().sort((first, second) => first - second))
}
