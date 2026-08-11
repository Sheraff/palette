/**
 * **A mirror of the role stage's component/cluster construction, for diagnosis only.**
 *
 * `parseTree` publishes the text groups it *found* and nothing about the ones it failed to find. Q1 and
 * Q2 need the second thing: which same-colour clusters of components existed, how many members each
 * had, and — for the clusters that did not become a text group — **which conjunct of arm-b §2.4 they
 * failed**. Those objects are local to `parseTree` and cannot be read off a `Parse`.
 *
 * So the construction is mirrored here, exactly, from `pipeline.ts` lines 1028–1214: the same mark
 * predicate, the same per-lane chain collapse against `COMPONENT_CHAIN_AREA_AGREEMENT`, the same shared
 * area-ordered `TEXT_COMPONENT_LIMIT` cut, the same mask-from-Euler-tour, the same distance transform,
 * the same union-find over the contract's regional bar, and then **the real `findTextGroups`** — the
 * detector itself is imported, never copied.
 *
 * ### The mirror validates itself or it is not used
 *
 * `mirrorTextGroups` re-derives the groups and compares them against `parse.textGroups` field by field
 * (representative, member node ids, row count, area fraction). `agrees` is false the moment they differ,
 * and every report carries that flag beside the numbers it derived. A mirror that has drifted is a
 * mirror that must not be quoted, and this is the only defence available to a read-only diagnosis.
 *
 * Provenance tag: `p2-tos-identity/detector-mirror@1`.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { BuiltLane } from "../lanes/nodes.ts"
import {
	childrenOf,
	distanceFieldOf,
	eulerTour,
	type DecodedImage,
	type Parse,
	type ParsedNode,
} from "../pipeline.ts"
import {
	COMPONENT_CHAIN_AREA_AGREEMENT,
	TEXT_COLLINEARITY_CUT,
	TEXT_COMPONENT_LIMIT,
	TEXT_HEIGHT_CV,
	TEXT_MIN_COMPONENTS,
	TEXT_ROW_CENTROID_TOLERANCE,
	TEXT_STROKE_WIDTH_CV,
} from "../roles/constants.ts"
import { findTextGroups, isCoherentRow, strokeWidthFromDistanceField, type TextComponent } from "../roles/text.ts"

export const MIRROR_PROVENANCE = "p2-tos-identity/detector-mirror@1"

const packOf = (rgb: Rgb8): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

/** `pipeline.ts`'s `collapseChains`, mirrored. */
function collapseChains(
	items: readonly { areaFraction: number }[],
	parentOfItem: readonly number[],
	isCandidate: (index: number) => boolean,
): number[] {
	const childrenList: number[][] = items.map(() => [])
	const roots: number[] = []
	for (let index = 0; index < items.length; index += 1) {
		const parent = parentOfItem[index]
		if (parent >= 0 && parent !== index) childrenList[parent].push(index)
		else roots.push(index)
	}
	const order: number[] = []
	const stack: number[] = roots.slice()
	while (stack.length > 0) {
		const current = stack.pop() as number
		order.push(current)
		for (const child of childrenList[current]) stack.push(child)
	}
	const largestBeneath = new Float64Array(items.length)
	for (let position = order.length - 1; position >= 0; position -= 1) {
		const current = order[position]
		let best = 0
		for (const child of childrenList[current]) {
			const beneath = Math.max(isCandidate(child) ? items[child].areaFraction : 0, largestBeneath[child])
			if (beneath > best) best = beneath
		}
		largestBeneath[current] = best
	}
	const kept: number[] = []
	for (let index = 0; index < items.length; index += 1) {
		if (!isCandidate(index)) continue
		if (largestBeneath[index] >= COMPONENT_CHAIN_AREA_AGREEMENT * items[index].areaFraction) continue
		kept.push(index)
	}
	return kept
}

/** `pipeline.ts`'s `clusterByBar`, mirrored. */
function clusterByBar(colors: readonly Rgb8[]): number[][] {
	const parentOf = colors.map((_unused, index) => index)
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
	const labs = colors.map(rgbToOkLab)
	const paletteColors = colors.map(colorFromRgb)
	for (let first = 0; first < colors.length; first += 1) {
		for (let second = first + 1; second < colors.length; second += 1) {
			if (okLabDistance(labs[first], labs[second]) < sameColorBar(paletteColors[first], paletteColors[second])) {
				const rootFirst = find(first)
				const rootSecond = find(second)
				if (rootFirst !== rootSecond) parentOf[Math.max(rootFirst, rootSecond)] = Math.min(rootFirst, rootSecond)
			}
		}
	}
	const clusterOf = new Map<number, number[]>()
	for (let index = 0; index < colors.length; index += 1) {
		const root = find(index)
		const bucket = clusterOf.get(root)
		if (bucket === undefined) clusterOf.set(root, [index])
		else bucket.push(index)
	}
	return Array.from(clusterOf.keys())
		.sort((first, second) => first - second)
		.map((root) => (clusterOf.get(root) ?? []).slice().sort((first, second) => first - second))
}

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

export type ClusterDiagnostic = Readonly<{
	clusterId: number
	hex: string
	memberCount: number
	/** Lane index of every member, counted: index 0 is L, then `LANES` order. */
	membersByLane: readonly number[]
	areaFraction: number
	/** Rows the single-linkage pass formed inside this cluster, largest first. */
	rowSizes: readonly number[]
	/** The largest row's conjunct measurements, against the cuts. */
	largestRow: Readonly<{
		size: number
		strokeCv: number
		heightCv: number
		collinearity: number
		anyZeroStroke: boolean
		passes: boolean
		/** Which conjunct failed first, in arm-b's order. `null` when the row passes. */
		failed: "count" | "zero-stroke" | "stroke-cv" | "height-cv" | "collinearity" | null
	}> | null
	becameTextGroup: boolean
}>

export type MemberDetail = Readonly<{
	nodeId: number
	laneIndex: number
	lane: string
	level: number
	depth: number
	areaFraction: number
	ownAreaFraction: number
	strokeWidth: number
	heightPx: number
	centroidX: number
	centroidY: number
	growth: number
	hex: string
	/** Own-pixel count of this node, and the share of the group's own-pixel mass it holds. */
	ownPixels: number
	ownMassShare: number
	/** The node's own-pixel colour cloud, most populous triples first. */
	topOwnColors: readonly { hex: string; count: number; share: number }[]
}>

/**
 * **Is a text group four glyphs, or one mark named four times?**
 *
 * arm-b §2.4's count clause (`TEXT_MIN_COMPONENTS` = 4) assumes components are distinct marks. Two
 * things in this pipeline can break that assumption without breaking any of the geometric agreements:
 * per-lane chain collapse runs **per lane**, so one physical mark that is visible in L, a and b
 * contributes one component to each; and `collinearity` answers **0** for a coincident point set by
 * design (`roles/text.ts`: *"a group whose glyphs share a centroid is collinear in the only sense
 * available"*), so coincident duplicates pass the collinearity clause outright rather than failing it.
 *
 * `spreadOverHeight` is the diagnosis: the largest pairwise centroid distance among the group's members
 * over their median bounding-box height. A real line of type sets glyphs side by side, so the ratio
 * grows with the member count and is > 1 for any two adjacent glyphs. A ratio **below 1** says every
 * member's centroid sits inside one glyph's own height of every other — the members are re-namings of
 * one mark, and the group is a phantom.
 */
export type GroupGeometry = Readonly<{
	hex: string
	memberCount: number
	membersByLane: readonly number[]
	medianHeightPx: number
	maxPairwiseCentroidPx: number
	spreadOverHeight: number
	/** Distinct centroids at a one-pixel tolerance. */
	distinctCentroids: number
	coincident: boolean
}>

export type MirrorResult = Readonly<{
	provenance: string
	agrees: boolean
	disagreement: string | null
	poolMarks: number
	components: number
	componentsAfterLimit: number
	limitBinds: boolean
	clusters: readonly ClusterDiagnostic[]
	/** One row per published text group, in `parse.textGroups` order. */
	publishedGroupGeometry: readonly GroupGeometry[]
	/** Members of the leading text group, if any, with lane/level/area and own-pixel mass. */
	leadingGroupMembers: readonly MemberDetail[]
	cuts: Readonly<{
		TEXT_MIN_COMPONENTS: number
		TEXT_STROKE_WIDTH_CV: number
		TEXT_HEIGHT_CV: number
		TEXT_COLLINEARITY_CUT: number
		TEXT_ROW_CENTROID_TOLERANCE: number
		TEXT_COMPONENT_LIMIT: number
	}>
}>

/**
 * Rebuild the detector's inputs and report what it saw, cluster by cluster.
 *
 * `lanes` must be the `runChromaPipeline` result's lanes, in `LANES` order, and `parse` its parse.
 */
export function mirrorTextGroups(image: DecodedImage, lanes: readonly BuiltLane[], parse: Parse): MirrorResult {
	const laneCounts = lanes.map((lane) => lane.nodes.length)
	const laneOffsets: number[] = []
	{
		let cursor = 0
		for (const count of laneCounts) {
			laneOffsets.push(cursor)
			cursor += count
		}
	}
	const laneIndexOf = (nodeId: number): number => {
		for (let index = laneOffsets.length - 1; index >= 0; index -= 1) if (nodeId >= laneOffsets[index]) return index
		return 0
	}

	const nodes = parse.nodes
	const lNodes = nodes.slice(0, laneCounts[0])
	const chainSet = new Set(parse.groundChain)
	const isMarkNode = (node: ParsedNode): boolean => node.kind === "mark" && !chainSet.has(node.id)

	type Component = { node: ParsedNode; laneIndex: number }
	const poolMarks: Component[] = []
	const components: Component[] = []
	for (const node of lNodes) if (isMarkNode(node)) poolMarks.push({ node, laneIndex: 0 })
	for (const index of collapseChains(lNodes, lNodes.map((node) => node.parent), (index) => isMarkNode(lNodes[index]))) {
		components.push({ node: lNodes[index], laneIndex: 0 })
	}
	for (let laneIndex = 1; laneIndex < lanes.length; laneIndex += 1) {
		const offset = laneOffsets[laneIndex]
		const laneParsed = nodes.slice(offset, offset + laneCounts[laneIndex])
		for (const node of laneParsed) if (node.kind === "mark") poolMarks.push({ node, laneIndex })
		for (const index of collapseChains(
			laneParsed,
			lanes[laneIndex].nodes.map((node) => node.parent),
			(index) => laneParsed[index].kind === "mark",
		)) {
			components.push({ node: laneParsed[index], laneIndex })
		}
	}

	const markComponents = components
		.slice()
		.sort((first, second) => second.node.areaFraction - first.node.areaFraction || first.node.id - second.node.id)
		.slice(0, TEXT_COMPONENT_LIMIT)
	const marks = markComponents.map((component) => component.node)

	// Masks, from each component's own lane's tree, then one distance transform each.
	const laneTrees = lanes.map((lane) => lane.tree)
	const laneTours = laneTrees.map((tree) => eulerTour(tree, childrenOf(tree)))
	const heights = new Map<number, number>()
	const strokes = new Map<number, number>()
	for (const component of markComponents) {
		const laneTree = laneTrees[component.laneIndex]
		const laneTour = laneTours[component.laneIndex]
		const treeNodeId = component.node.treeNodeId
		const minX = laneTree.nodeMinX[treeNodeId]
		const minY = laneTree.nodeMinY[treeNodeId]
		const boxWidth = laneTree.nodeMaxX[treeNodeId] - minX + 1
		const boxHeight = laneTree.nodeMaxY[treeNodeId] - minY + 1
		if (boxWidth <= 0 || boxHeight <= 0) continue
		heights.set(component.node.id, boxHeight)
		const mask = new Uint8Array(boxWidth * boxHeight)
		for (let y = 0; y < boxHeight; y += 1) {
			for (let x = 0; x < boxWidth; x += 1) {
				const owner = laneTree.nodeOfPixel[(minY + y) * image.width + (minX + x)]
				const inside = laneTour.enter[treeNodeId] <= laneTour.enter[owner] && laneTour.enter[owner] < laneTour.exit[treeNodeId]
				if (inside) mask[y * boxWidth + x] = 1
			}
		}
		const distances = distanceFieldOf(mask, boxWidth, boxHeight)
		strokes.set(component.node.id, strokeWidthFromDistanceField(distances.squared, distances.width, distances.height))
	}

	const clusterIndexOfComponent = new Int32Array(marks.length).fill(-1)
	const clusterMembers = clusterByBar(marks.map((mark) => mark.repr))
	clusterMembers.forEach((members, clusterIndex) => {
		for (const index of members) clusterIndexOfComponent[index] = clusterIndex
	})

	const textComponents: TextComponent[] = marks.map((mark, index) => ({
		nodeId: mark.id,
		clusterId: clusterIndexOfComponent[index],
		strokeWidth: strokes.get(mark.id) ?? 0,
		height: heights.get(mark.id) ?? 0,
		centroidX: mark.centroidX * image.width,
		centroidY: mark.centroidY * image.height,
		areaFraction: mark.areaFraction,
		repr: mark.repr,
	}))
	const groups = findTextGroups(textComponents)

	// --- validate the mirror against what the pipeline published ---------------------------------
	let disagreement: string | null = null
	const published = parse.textGroups
	if (groups.length !== published.length) disagreement = `group count ${groups.length} vs published ${published.length}`
	else {
		// `parse.textGroups` is re-ordered by (area, contrast, firstNodeId); compare as sets keyed on repr.
		const mine = new Map(groups.map((group) => [colorFromRgb(group.repr).hex, group] as const))
		for (const group of published) {
			const found = mine.get(colorFromRgb(group.repr).hex)
			if (found === undefined) {
				disagreement = `published group ${colorFromRgb(group.repr).hex} not reproduced`
				break
			}
			const mineIds = found.members.map((index) => marks[index].id).sort((first, second) => first - second)
			if (mineIds.join(",") !== [...group.nodeIds].join(",")) {
				disagreement = `member ids differ for ${colorFromRgb(group.repr).hex}`
				break
			}
			if (found.rows !== group.rows) disagreement = `row count differs for ${colorFromRgb(group.repr).hex}`
		}
	}

	// --- per-cluster diagnostics -----------------------------------------------------------------
	const textClusterIds = new Set(groups.map((group) => group.clusterId))
	const diagnostics: ClusterDiagnostic[] = clusterMembers.map((members, clusterIndex) => {
		const sorted = members.slice().sort((first, second) => {
			const one = textComponents[first]
			const other = textComponents[second]
			return one.centroidY - other.centroidY || one.centroidX - other.centroidX || first - second
		})
		const rows: number[][] = []
		if (sorted.length > 0) {
			let row: number[] = [sorted[0]]
			for (let position = 1; position < sorted.length; position += 1) {
				const previous = textComponents[row[row.length - 1]]
				const current = textComponents[sorted[position]]
				const smallerHeight = Math.min(previous.height, current.height)
				const sameRow =
					smallerHeight > 0 &&
					Math.abs(current.centroidY - previous.centroidY) <= TEXT_ROW_CENTROID_TOLERANCE * smallerHeight &&
					Math.abs(current.height - previous.height) <= TEXT_HEIGHT_CV * smallerHeight
				if (sameRow) row.push(sorted[position])
				else {
					rows.push(row)
					row = [sorted[position]]
				}
			}
			rows.push(row)
		}
		const rowSizes = rows.map((row) => row.length).sort((first, second) => second - first)
		const largest = rows.slice().sort((first, second) => second.length - first.length)[0] ?? null
		let largestRow: ClusterDiagnostic["largestRow"] = null
		if (largest !== null) {
			const strokeValues = largest.map((index) => textComponents[index].strokeWidth)
			const heightValues = largest.map((index) => textComponents[index].height)
			const centroids = largest.map((index) => [textComponents[index].centroidX, textComponents[index].centroidY] as const)
			const strokeCv = coefficientOfVariation(strokeValues)
			const heightCv = coefficientOfVariation(heightValues)
			const line = collinearity(centroids)
			const anyZeroStroke = strokeValues.some((value) => value <= 0)
			const passes = isCoherentRow(textComponents, largest)
			const failed =
				largest.length < TEXT_MIN_COMPONENTS
					? ("count" as const)
					: anyZeroStroke
						? ("zero-stroke" as const)
						: strokeCv > TEXT_STROKE_WIDTH_CV
							? ("stroke-cv" as const)
							: heightCv > TEXT_HEIGHT_CV
								? ("height-cv" as const)
								: line > TEXT_COLLINEARITY_CUT
									? ("collinearity" as const)
									: null
			largestRow = { size: largest.length, strokeCv, heightCv, collinearity: line, anyZeroStroke, passes, failed }
		}
		const byLane = lanes.map(() => 0)
		for (const index of members) byLane[laneIndexOf(marks[index].id)] += 1
		const largestMember = members
			.slice()
			.sort((first, second) => marks[second].areaFraction - marks[first].areaFraction || first - second)[0]
		return {
			clusterId: clusterIndex,
			hex: colorFromRgb(marks[largestMember].repr).hex,
			memberCount: members.length,
			membersByLane: byLane,
			areaFraction: members.reduce((sum, index) => sum + marks[index].areaFraction, 0),
			rowSizes: rowSizes.slice(0, 6),
			largestRow,
			becameTextGroup: textClusterIds.has(clusterIndex),
		}
	})

	// --- geometry of every published group: real line of type, or one mark named many times? -------
	const componentOfNode = new Map<number, TextComponent>()
	for (const component of textComponents) componentOfNode.set(component.nodeId, component)
	const publishedGroupGeometry: GroupGeometry[] = published.map((group) => {
		const members = group.nodeIds.map((nodeId) => componentOfNode.get(nodeId)).filter((entry): entry is TextComponent => entry !== undefined)
		const heightValues = members.map((member) => member.height).sort((first, second) => first - second)
		const medianHeight = heightValues.length === 0 ? 0 : heightValues[Math.floor((heightValues.length - 1) / 2)]
		let maxPairwise = 0
		for (let first = 0; first < members.length; first += 1) {
			for (let second = first + 1; second < members.length; second += 1) {
				const distance = Math.hypot(
					members[first].centroidX - members[second].centroidX,
					members[first].centroidY - members[second].centroidY,
				)
				if (distance > maxPairwise) maxPairwise = distance
			}
		}
		const distinct = new Set(members.map((member) => `${Math.round(member.centroidX)},${Math.round(member.centroidY)}`)).size
		const byLane = lanes.map(() => 0)
		for (const member of members) byLane[laneIndexOf(member.nodeId)] += 1
		const ratio = medianHeight > 0 ? maxPairwise / medianHeight : Number.POSITIVE_INFINITY
		return {
			hex: colorFromRgb(group.repr).hex,
			memberCount: members.length,
			membersByLane: byLane,
			medianHeightPx: medianHeight,
			maxPairwiseCentroidPx: maxPairwise,
			spreadOverHeight: ratio,
			distinctCentroids: distinct,
			coincident: ratio < 1,
		}
	})

	// --- the leading published group's members, with own-pixel mass -------------------------------
	const leadingGroupMembers: MemberDetail[] = []
	if (published.length > 0) {
		const ids = new Set(published[0].nodeIds)
		const memberNodes = nodes.filter((node) => ids.has(node.id))
		const ownCounts = new Map<number, Map<number, number>>()
		for (const node of memberNodes) ownCounts.set(node.id, new Map())
		for (const node of memberNodes) {
			const laneIndex = laneIndexOf(node.id)
			const laneTree = laneTrees[laneIndex]
			const counts = ownCounts.get(node.id)!
			const treeNodeId = node.treeNodeId
			const minX = laneTree.nodeMinX[treeNodeId]
			const minY = laneTree.nodeMinY[treeNodeId]
			const maxX = laneTree.nodeMaxX[treeNodeId]
			const maxY = laneTree.nodeMaxY[treeNodeId]
			for (let y = minY; y <= maxY; y += 1) {
				for (let x = minX; x <= maxX; x += 1) {
					const pixel = y * image.width + x
					if (laneTree.nodeOfPixel[pixel] !== treeNodeId) continue
					const color = image.packed[pixel]
					counts.set(color, (counts.get(color) ?? 0) + 1)
				}
			}
		}
		let groupMass = 0
		for (const counts of ownCounts.values()) for (const count of counts.values()) groupMass += count
		for (const node of memberNodes) {
			const counts = ownCounts.get(node.id)!
			let own = 0
			for (const count of counts.values()) own += count
			const top = Array.from(counts.entries())
				.sort((first, second) => second[1] - first[1] || first[0] - second[0])
				.slice(0, 5)
				.map(([packed, count]) => ({
					hex: colorFromRgb([(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]).hex,
					count,
					share: own > 0 ? count / own : 0,
				}))
			const laneIndex = laneIndexOf(node.id)
			leadingGroupMembers.push({
				nodeId: node.id,
				laneIndex,
				lane: lanes[laneIndex].lane,
				level: node.level,
				depth: node.depth,
				areaFraction: node.areaFraction,
				ownAreaFraction: node.ownAreaFraction,
				strokeWidth: strokes.get(node.id) ?? 0,
				heightPx: heights.get(node.id) ?? 0,
				centroidX: node.centroidX,
				centroidY: node.centroidY,
				growth: node.growth,
				hex: colorFromRgb(node.repr).hex,
				ownPixels: own,
				ownMassShare: groupMass > 0 ? own / groupMass : 0,
				topOwnColors: top,
			})
		}
		leadingGroupMembers.sort((first, second) => second.ownPixels - first.ownPixels || first.nodeId - second.nodeId)
	}

	return {
		provenance: MIRROR_PROVENANCE,
		agrees: disagreement === null,
		disagreement,
		poolMarks: poolMarks.length,
		components: components.length,
		componentsAfterLimit: markComponents.length,
		limitBinds: components.length > TEXT_COMPONENT_LIMIT,
		clusters: diagnostics.slice().sort((first, second) => second.memberCount - first.memberCount || first.clusterId - second.clusterId),
		publishedGroupGeometry,
		leadingGroupMembers,
		cuts: {
			TEXT_MIN_COMPONENTS,
			TEXT_STROKE_WIDTH_CV,
			TEXT_HEIGHT_CV,
			TEXT_COLLINEARITY_CUT,
			TEXT_ROW_CENTROID_TOLERANCE,
			TEXT_COMPONENT_LIMIT,
		},
	}
}

export { packOf }
