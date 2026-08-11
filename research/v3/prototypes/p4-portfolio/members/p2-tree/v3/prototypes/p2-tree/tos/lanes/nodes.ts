/**
 * Retained nodes of one lane's tree — the same node objects `../pipeline.ts` builds, for a tree that
 * `parseTree` is not the right function to run.
 *
 * ## Why this exists rather than a call to `parseTree`
 *
 * `parseTree(image, tree)` would in fact accept a chromatic tree: it reads `image.packed` and the
 * tree's structure and never touches `image.levels`. But it would also compute, per lane, a field
 * verdict, a ground chain, a coverage pass over every pixel, a residual histogram and two role
 * rankings — all of them statements about *that lane's* lightness-shaped reading of the picture, and
 * all of them thrown away. The lanes contribute **candidate nodes to one shared pool**, which is
 * arm-b′ §2.6's rule ("all four roles are ranked over the *same* pool… so there is no lane that
 * cannot reach a role"), so what a lane owes is its retained nodes and nothing else.
 *
 * So the node block is mirrored here, and **`tests/parity.test.ts` asserts the mirror is exact**: run
 * on the L tree, `laneRetainedNodes` must reproduce `parseTree(image, tree).nodes` field for field.
 * That test is the whole defence against this file drifting from the one it copies. At the merge the
 * sibling owner is doing, this function is what `parseTree` should call once per lane — the
 * duplication is a consequence of the ownership split in this cycle, not a design.
 *
 * Nothing in the *rules* is new: the stability filter, the area floor, the field/mark split and the
 * representative-colour rule are all imported.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../../src/contract/types.ts"
import { FIELD_AREA_FRACTION } from "../constants.ts"
import { childrenOf, cloudFromCounts, representativeColor, selectStableNodes, type DecodedImage } from "../pipeline.ts"
import { buildTreeOfShapes, type ShapeTree } from "../tree.ts"
import type { LaneChannel } from "./channels.ts"
import type { Lane } from "./constants.ts"

/** A retained node of one lane, carrying which lane it came from. */
export type LaneNode = {
	readonly lane: Lane
	/** Index within this lane's retained set — the same id `parseTree` gives its nodes. */
	readonly id: number
	/** The retained parent's id within this lane; `-1` for the lane's root. */
	readonly parent: number
	readonly treeNodeId: number
	readonly depth: number
	readonly level: number
	readonly areaFraction: number
	readonly ownAreaFraction: number
	readonly centroidX: number
	readonly centroidY: number
	readonly growth: number
	/**
	 * `inradius / √area`. Carried over from `parseTree` for the L lane's components and `null`
	 * everywhere else — nothing in the accent ordering is geometric, and a distance transform per node
	 * on two more trees would be paid for a column nobody reads (`pool.ts`, `adoptThinness`).
	 */
	thinness: number | null
	/** `parseTree`'s stroke width. Always `null` here; the text detector runs on the L lane only. */
	strokeWidth: number | null
	readonly repr: Rgb8
	readonly kind: "field" | "mark"
}

/** One lane, built: its tree and its retained nodes. */
export type BuiltLane = Readonly<{ lane: Lane; tree: ShapeTree; nodes: LaneNode[] }>

/**
 * The retained nodes of a tree, with representative colours — the mirror of `parseTree`'s node block.
 *
 * Colour clouds come from a node's **own** pixels, falling back to its whole shape when it has none.
 * That is `../NOTES.md` deviation 3, kept verbatim: a field's colour is the field minus the marks on
 * it, which is what a person names.
 */
export function laneRetainedNodes(image: DecodedImage, tree: ShapeTree, lane: Lane): LaneNode[] {
	const totalArea = image.width * image.height
	const children = childrenOf(tree)
	const stability = selectStableNodes(tree, children)

	const retainedIndexOf = new Map<number, number>()
	stability.retained.forEach((treeNodeId, index) => retainedIndexOf.set(treeNodeId, index))
	const ownCounts = stability.retained.map(() => new Map<number, number>())
	const shapeCounts = stability.retained.map(() => new Map<number, number>())
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		const color = image.packed[pixel]
		const treeNodeId = tree.nodeOfPixel[pixel]
		const owner = retainedIndexOf.get(treeNodeId)
		if (owner !== undefined) ownCounts[owner].set(color, (ownCounts[owner].get(color) ?? 0) + 1)
		const holder = retainedIndexOf.get(stability.retainedAncestor[treeNodeId])
		if (holder !== undefined) shapeCounts[holder].set(color, (shapeCounts[holder].get(color) ?? 0) + 1)
	}

	return stability.retained.map((treeNodeId, index) => {
		const own = ownCounts[index]
		const cloud = cloudFromCounts(own.size > 0 ? own : shapeCounts[index])
		const areaFraction = tree.nodeSubtreeArea[treeNodeId] / totalArea
		let parentIndex = -1
		if (treeNodeId !== tree.rootId) {
			let ancestor = tree.nodeParent[treeNodeId]
			while (!retainedIndexOf.has(ancestor) && ancestor !== tree.rootId) ancestor = tree.nodeParent[ancestor]
			parentIndex = retainedIndexOf.get(ancestor) ?? 0
		}
		return {
			lane,
			id: index,
			parent: parentIndex,
			treeNodeId,
			depth: tree.nodeDepth[treeNodeId],
			level: tree.nodeLevel[treeNodeId],
			areaFraction,
			ownAreaFraction: tree.nodeOwnArea[treeNodeId] / totalArea,
			centroidX: tree.nodeCentroidX[treeNodeId] / image.width,
			centroidY: tree.nodeCentroidY[treeNodeId] / image.height,
			growth: stability.growth[treeNodeId],
			thinness: null,
			strokeWidth: null,
			repr: representativeColor(cloud),
			kind: areaFraction >= FIELD_AREA_FRACTION ? "field" : "mark",
		}
	})
}

/** Build one lane end to end: quantised channel in, tree plus retained nodes out. */
export function buildLane(image: DecodedImage, channel: LaneChannel): BuiltLane {
	const tree = buildTreeOfShapes(channel.levels, image.width, image.height, channel.levelCount)
	return { lane: channel.lane, tree, nodes: laneRetainedNodes(image, tree, channel.lane) }
}

/** Cached OKLab of an exact triple. Lanes ask for the same colours many times over. */
export function makeLabCache(): (rgb: Rgb8) => OkLab {
	const cache = new Map<number, OkLab>()
	return (rgb) => {
		const packed = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
		let lab = cache.get(packed)
		if (lab === undefined) {
			lab = rgbToOkLab(rgb)
			cache.set(packed, lab)
		}
		return lab
	}
}
