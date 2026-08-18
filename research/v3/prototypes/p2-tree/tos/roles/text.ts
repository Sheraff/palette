/**
 * **The text detector, grafted from arm-b §2.4 and adapted to the tree of shapes.**
 *
 * arm-b's §2.4 runs on the connected components of the *field's complement*. This pipeline has no
 * carve and no complement: it has a tree, and the things that are not field are the retained nodes
 * below `FIELD_AREA_FRACTION`. So the graft is one substitution — components come from the tree's
 * non-field nodes — and everything after it is arm-b's, in arm-b's order:
 *
 * > Each gets, in one pass: a distance transform, from which the **stroke width** is twice the median
 * > distance along its ridge; an area fraction; elongation from second moments; a representative
 * > colour. Components then group into **mark groups** by a conjunction of geometric agreements —
 * > stroke widths agreeing within a coefficient of variation, heights agreeing, centroids
 * > near-collinear, colours the same under the bar. Four or more such components is `text`-shaped.
 *
 * Elongation from second moments is the one item not implemented: nothing downstream reads it this
 * cycle, and a computed-but-unused attribute is a claim the code does not make. Recorded as a cut in
 * `../NOTES.md` rather than left silently missing.
 *
 * ### Why this exists at all
 *
 * Round 1's reviewer evidence: foreground readability is the dominant failure class (7 of 10
 * unacceptables), and on `…d859a69094` the ruling is verbatim *"black is the artwork's text → fg
 * should be black"*. The detector is not here to read the artwork's text. It is here to recover **one
 * colour a designer already validated against this field** — arm-b's own words — and hand it to the
 * foreground as its first candidate.
 *
 * ### What it deliberately does not do
 *
 * No model, no dictionary, no training: it detects the *manufacture* of type, not its meaning. Its
 * recall is mediocre by construction and arm-b says so out loud. A cover whose title is set in mixed
 * case with descenders will fail the height agreement; a cover with three glyphs will fail the count.
 * Both are false negatives, and a false negative costs the foreground its first candidate and nothing
 * else — the APCA ranking behind it still has to produce something readable.
 *
 * ### Determinism
 *
 * Components arrive already sorted (area, then parsed node id) and are referred to by index
 * throughout. Row linkage is a single pass over components sorted by centroid `y` then `x` then index.
 * The median is the *lower* median, so an even-sized sample has one answer. No map iteration order,
 * no hash, no float equality ever decides an order on its own.
 */

import type { Rgb8 } from "../../../../src/contract/types.ts"
import { areaFractionBand, extremalMember } from "./indifference.ts"
import {
	STROKE_WIDTH_RIDGE_FACTOR,
	TEXT_COLLINEARITY_CUT,
	TEXT_HEIGHT_CV,
	TEXT_MIN_COMPONENTS,
	TEXT_ROW_CENTROID_TOLERANCE,
	TEXT_STROKE_WIDTH_CV,
} from "./constants.ts"

/**
 * One component the detector reasons about: a chain-collapsed non-field node of the tree.
 *
 * Coordinates and lengths are in **pixels**, not fractions. Stroke width, height and centroid
 * proximity are compared against each other and never against the image, so a fraction would divide
 * three quantities by the same number and lose the units.
 */
export type TextComponent = Readonly<{
	/** The parsed node id. Carried so a group can be traced back to the parse; also the last tie-break. */
	nodeId: number
	/** Which same-colour-bar cluster this component's representative fell into. */
	clusterId: number
	/** Twice the median ridge distance of the component's mask, in pixels. */
	strokeWidth: number
	/** The component's bounding-box height, in pixels. */
	height: number
	/** Centroid, in pixels. */
	centroidX: number
	centroidY: number
	/** Shape area as a fraction of the image. */
	areaFraction: number
	/** The component's representative colour, by the spec's one rule. */
	repr: Rgb8
}>

/** A text-shaped group: the coherent members of one same-colour cluster. */
export type TextGroup = Readonly<{
	clusterId: number
	/** Indices into the component array handed to `findTextGroups`, ascending. */
	members: readonly number[]
	/** How many coherent rows the group is made of. */
	rows: number
	/** Summed shape area of the coherent members, as a fraction of the image. */
	areaFraction: number
	/** The published member's representative — the colour the group publishes. See `memberRule`. */
	repr: Rgb8
	/** The smallest parsed node id among the coherent members. The group's deterministic identity. */
	firstNodeId: number
}>

/**
 * **Which member of a group publishes its colour** — a quantity and the ruler for it, together.
 *
 * The two are one object because they are one statement: an extremum is only meaningful beside the
 * band below which the quantity is not measured (`indifference.ts`). `valueOf` is larger-is-better.
 */
export type MemberRule = Readonly<{
	valueOf: (component: TextComponent) => number
	bandOf: (leader: TextComponent, candidate: TextComponent) => number
}>

/**
 * The rule this function has always used: the largest coherent member, area compared against the
 * relative area band. Kept as the default so the corpus-free tests state the detector's own behaviour;
 * `pipeline.ts` passes readability (D18.1).
 */
export const AREA_MEMBER_RULE: MemberRule = {
	valueOf: (component) => component.areaFraction,
	bandOf: (leader, candidate) => areaFractionBand(leader.areaFraction, candidate.areaFraction),
}

/**
 * The **lower** median of a sample.
 *
 * Lower rather than the mean of the two middles: an even-sized sample then answers with a value the
 * sample actually contains, which keeps the stroke width a measured distance rather than an average of
 * two of them, and removes the only place a tie could have produced a value depending on sort
 * stability.
 */
export function lowerMedian(values: readonly number[]): number {
	if (values.length === 0) throw new Error("the lower median of an empty sample is not defined")
	const sorted = values.slice().sort((first, second) => first - second)
	return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * **Stroke width from a component's distance field** — arm-b §2.4's "twice the median distance along
 * its ridge".
 *
 * The field is the padded, *squared* Euclidean distance transform `pipeline.ts` already computes for
 * the inradius: one pass, one transform, two answers. The **ridge** is the discrete medial axis — the
 * pixels inside the mask whose distance is no smaller than any of their eight neighbours'. That is the
 * set of points where the largest inscribed disc touches the boundary on two sides, which is exactly
 * the set whose distance is half a stroke.
 *
 * The median over the ridge, rather than the maximum (the inradius) or the mean: the maximum is the
 * fattest place in the glyph — a serif, a bowl junction — and the mean is dragged by the ridge's tail
 * where it runs into a corner. arm-b says median and means it.
 *
 * Returns 0 for an empty mask, which the caller reads as "no stroke", never as "a thin stroke".
 */
export function strokeWidthFromDistanceField(
	squaredDistance: Float64Array,
	paddedWidth: number,
	paddedHeight: number,
): number {
	const ridge: number[] = []
	for (let y = 1; y < paddedHeight - 1; y += 1) {
		for (let x = 1; x < paddedWidth - 1; x += 1) {
			const index = y * paddedWidth + x
			const value = squaredDistance[index]
			if (value <= 0) continue
			let isRidge = true
			for (let dy = -1; dy <= 1 && isRidge; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue
					if (squaredDistance[(y + dy) * paddedWidth + (x + dx)] > value) {
						isRidge = false
						break
					}
				}
			}
			if (isRidge) ridge.push(Math.sqrt(value))
		}
	}
	if (ridge.length === 0) return 0
	return STROKE_WIDTH_RIDGE_FACTOR * lowerMedian(ridge)
}

/** `r << 16 | g << 8 | b` — the house tie-break, ascending lexicographic RGB. */
function packedRgb(color: Rgb8): number {
	return (color[0] << 16) | (color[1] << 8) | color[2]
}

/** Coefficient of variation, population form. Zero mean answers `Infinity`, which fails every cut. */
function coefficientOfVariation(values: readonly number[]): number {
	if (values.length === 0) return Number.POSITIVE_INFINITY
	let mean = 0
	for (const value of values) mean += value
	mean /= values.length
	if (mean <= 0) return Number.POSITIVE_INFINITY
	let squared = 0
	for (const value of values) squared += (value - mean) ** 2
	return Math.sqrt(squared / values.length) / mean
}

/**
 * Straight-line residual of a point set about its own total-least-squares fit, over the fit's length.
 *
 * The same measurement `pipeline.ts` applies to the ground chain, and deliberately so: `LAMINARITY_CUT`
 * and `TEXT_COLLINEARITY_CUT` are then two claims about one quantity. Fewer than two points are
 * trivially collinear and answer 0; a degenerate fit (all points coincident) answers 0 as well, since
 * a group whose glyphs share a centroid is collinear in the only sense available.
 */
function collinearity(points: readonly (readonly [number, number])[]): number {
	if (points.length < 2) return 0
	let meanX = 0
	let meanY = 0
	for (const [x, y] of points) {
		meanX += x
		meanY += y
	}
	meanX /= points.length
	meanY /= points.length
	let sxx = 0
	let syy = 0
	let sxy = 0
	for (const [x, y] of points) {
		const dx = x - meanX
		const dy = y - meanY
		sxx += dx * dx
		syy += dy * dy
		sxy += dx * dy
	}
	const trace = sxx + syy
	const determinant = sxx * syy - sxy * sxy
	const discriminant = Math.sqrt(Math.max(0, (trace / 2) ** 2 - determinant))
	const major = trace / 2 + discriminant
	let dirX = sxy
	let dirY = major - sxx
	const norm = Math.hypot(dirX, dirY)
	if (norm === 0) {
		dirX = 1
		dirY = 0
	} else {
		dirX /= norm
		dirY /= norm
	}
	let squared = 0
	let minAlong = Number.POSITIVE_INFINITY
	let maxAlong = Number.NEGATIVE_INFINITY
	for (const [x, y] of points) {
		const dx = x - meanX
		const dy = y - meanY
		const along = dx * dirX + dy * dirY
		const across = dx * -dirY + dy * dirX
		squared += across * across
		if (along < minAlong) minAlong = along
		if (along > maxAlong) maxAlong = along
	}
	const length = maxAlong - minAlong
	if (length <= 0) return 0
	return Math.sqrt(squared / points.length) / length
}

/**
 * Does this set of components agree the way a line of type agrees?
 *
 * The conjunction, in arm-b's order, minus the colour clause — colour agreement is structural here,
 * because rows are only ever formed inside one same-colour-bar cluster and so every member of every
 * candidate row already satisfies it.
 */
export function isCoherentRow(components: readonly TextComponent[], members: readonly number[]): boolean {
	if (members.length < TEXT_MIN_COMPONENTS) return false
	const strokes = members.map((index) => components[index].strokeWidth)
	if (strokes.some((value) => value <= 0)) return false
	if (coefficientOfVariation(strokes) > TEXT_STROKE_WIDTH_CV) return false
	if (coefficientOfVariation(members.map((index) => components[index].height)) > TEXT_HEIGHT_CV) return false
	const centroids = members.map((index) => [components[index].centroidX, components[index].centroidY] as const)
	return collinearity(centroids) <= TEXT_COLLINEARITY_CUT
}

/**
 * **Group components into text-shaped groups.**
 *
 * One group per same-colour cluster, made of the union of that cluster's coherent rows. Per cluster:
 *
 *  1. sort its members by centroid `y`, then centroid `x`, then index — a pure raster reading order;
 *  2. single-linkage them into rows: consecutive members link when their centroids sit within
 *     `TEXT_ROW_CENTROID_TOLERANCE` of a glyph height in `y` **and** their heights agree pairwise
 *     within `TEXT_HEIGHT_CV` (the second clause is what stops one outlier chaining a column into a
 *     row);
 *  3. keep the rows that pass the whole conjunction (`isCoherentRow`);
 *  4. if any row survived, the cluster contributes one group carrying every surviving row's members.
 *
 * A group rather than a row is the unit because the *colour* is the deliverable: three lines of one
 * title are one designer decision, and splitting them would make the same colour compete with itself
 * for the same role.
 *
 * **Which member publishes** is `memberRule` — the extremum on its quantity, taken **against that
 * quantity's ruler** (`extremalMember`), then the house tie-break: lexicographic RGB, then node id.
 * Every member of a group is inside one same-colour cluster, so the choice among them is a **sub-bar**
 * choice by construction and the rule that makes it decides the published triple.
 *
 * **Cycle 5 — the caller now passes readability, and that is `DECISIONS.md` D18.1.** The default is
 * still area, which is what this function has always used and what the corpus-free tests exercise.
 * Cycle 3 measured the readability variant and withheld it because it moved `…d859a69094` off the
 * artwork's own `#070506`; round-5 item 2 priced exactly that substitution (`#070506` against
 * `#050304`, **strong on both sides, no preference**) and the reviewer's indifference releases it. Area
 * is the churniest statistic in the parse (`stability/q1-dither/REPORT.md`) and readability is the
 * quantity the foreground is actually ranked on. See `roles/NOTES.md`.
 *
 * Groups come back ordered by summed coherent area descending — arm-b §2.6's *"text-shaped groups
 * first by total area fraction"* — with the smallest parsed node id as the tie-break. The caller
 * applies the readability ordering on top; this function has no opinion about contrast.
 */
export function findTextGroups(
	components: readonly TextComponent[],
	memberRule: MemberRule = AREA_MEMBER_RULE,
): TextGroup[] {
	const byCluster = new Map<number, number[]>()
	for (let index = 0; index < components.length; index += 1) {
		const clusterId = components[index].clusterId
		const bucket = byCluster.get(clusterId)
		if (bucket === undefined) byCluster.set(clusterId, [index])
		else bucket.push(index)
	}

	const groups: TextGroup[] = []
	for (const clusterId of Array.from(byCluster.keys()).sort((first, second) => first - second)) {
		const members = (byCluster.get(clusterId) ?? []).slice().sort((first, second) => {
			const one = components[first]
			const other = components[second]
			return one.centroidY - other.centroidY || one.centroidX - other.centroidX || first - second
		})
		if (members.length < TEXT_MIN_COMPONENTS) continue

		const rows: number[][] = []
		let row: number[] = [members[0]]
		for (let position = 1; position < members.length; position += 1) {
			const previous = components[row[row.length - 1]]
			const current = components[members[position]]
			const smallerHeight = Math.min(previous.height, current.height)
			const sameRow =
				smallerHeight > 0 &&
				Math.abs(current.centroidY - previous.centroidY) <= TEXT_ROW_CENTROID_TOLERANCE * smallerHeight &&
				Math.abs(current.height - previous.height) <= TEXT_HEIGHT_CV * smallerHeight
			if (sameRow) row.push(members[position])
			else {
				rows.push(row)
				row = [members[position]]
			}
		}
		rows.push(row)

		const coherent = rows.filter((candidate) => isCoherentRow(components, candidate))
		if (coherent.length === 0) continue

		const kept = coherent.flat().sort((first, second) => first - second)
		let areaFraction = 0
		let firstNodeId = components[kept[0]].nodeId
		for (const index of kept) {
			areaFraction += components[index].areaFraction
			if (components[index].nodeId < firstNodeId) firstNodeId = components[index].nodeId
		}
		// The published member: the extremum on the rule's quantity, against the rule's ruler, settled on
		// lexicographic RGB and then the node id. `extremalMember` addresses members by position in `kept`.
		const byArea = (first: number, second: number): number =>
			components[kept[second]].areaFraction - components[kept[first]].areaFraction ||
			packedRgb(components[kept[first]].repr) - packedRgb(components[kept[second]].repr) ||
			components[kept[first]].nodeId - components[kept[second]].nodeId
		let incumbent = 0
		for (let position = 1; position < kept.length; position += 1) if (byArea(position, incumbent) < 0) incumbent = position
		const publishes =
			kept[
				extremalMember(
					kept.length,
					(position) => memberRule.valueOf(components[kept[position]]),
					(leader, candidate) => memberRule.bandOf(components[kept[leader]], components[kept[candidate]]),
					(first, second) =>
						packedRgb(components[kept[first]].repr) - packedRgb(components[kept[second]].repr) ||
						components[kept[first]].nodeId - components[kept[second]].nodeId,
					incumbent,
				)
			]
		groups.push({
			clusterId,
			members: kept,
			rows: coherent.length,
			areaFraction,
			repr: components[publishes].repr,
			firstNodeId,
		})
	}

	groups.sort((first, second) => second.areaFraction - first.areaFraction || first.firstNodeId - second.firstNodeId)
	return groups
}
