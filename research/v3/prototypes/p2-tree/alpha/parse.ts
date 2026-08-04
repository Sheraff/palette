/**
 * The parse: decode → α-hierarchy → grain fold → carve → field model → roles.
 *
 * Arm-b §2.0: *a parse is a typed nesting tree, and it has no nouns.* It never asks what anything
 * *is*; it asks what runs to the frame, what encloses what, what is laid on top, and what is too
 * small to be structure. This module is that pipeline in order, and it is the single place both
 * deliverables read from — `candidate.ts` turns a parse into a contract palette, `dump.ts` turns the
 * same parse into the node dump the falsifier and the verifier consume. One parse, two views, so a
 * dump can never describe a tree the palette did not come from.
 *
 * ## Grain folding
 *
 * A node holding less than `GRAIN_AREA_FLOOR` of the image is `grain`: it is not published and it is
 * not a role candidate. It is not *deleted* — its pixels are still counted in every ancestor, which
 * is what "folded into its parent" means, and it is why the retained tree's areas still sum properly.
 * Arm-b §2.2: this is where robustness against dither and re-encode is bought, because afterwards no
 * surviving node's identity depends on a pixel-scale event.
 *
 * ## What a node is, once folded
 *
 * A retained **leaf** is an α-zone: a maximal set of pixels chained by same-colour steps. A retained
 * **group** is a Kruskal merge of zones at some level above one bar — the nesting that makes this
 * P2 and not a flat partition. A group holding no field zone is a **mark**, and because groups nest,
 * a mark can be one blob or the whole cluster of blobs that a coarser level joined.
 */

import { GRAIN_AREA_FLOOR } from "./constants.ts"
import { decodeImage } from "./decode.ts"
import type { DecodedImage } from "./decode.ts"
import { buildAccumulator, representativeOf } from "./accumulator.ts"
import type { Accumulator, Representative } from "./accumulator.ts"
import { buildHierarchy, pixelRangeOf } from "./hierarchy.ts"
import type { Hierarchy } from "./hierarchy.ts"
import { carveField, typeField } from "./field.ts"
import type { FieldCarve, FieldModel } from "./field.ts"
import { assignRoles, candidateOf } from "./roles.ts"
import type { RoleAssignment, RoleCandidate } from "./roles.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "../../../src/contract/invariants.ts"
import type { GradientSpec, ResolvedContrastFloors } from "../../../src/contract/types.ts"

export type ParsedNode = Readonly<{
	/** Dump id: DFS pre-order position among retained nodes. The root is always 0. */
	id: number
	/** The id inside `Hierarchy`, kept so the dump can be joined back to a re-run of the tree. */
	hierarchyId: number
	/** Dump id of the nearest retained ancestor; `null` for the root. */
	parent: number | null
	/** Depth in the **retained** tree, root = 0. */
	depth: number
	areaFraction: number
	/** The level in bars at which this node formed. Leaves carry α = 1. */
	levelBars: number
	kind: "zone" | "group"
	/** True when the subtree holds at least one border-touching α-zone. */
	containsField: boolean
	/** True when *every* α-zone in the subtree touches the border — the node is field and nothing else. */
	fieldOnly: boolean
	/** Fraction of this node's own pixels that sit on the image border. */
	borderFraction: number
	representative: Representative
}>

export type Parse = Readonly<{
	image: DecodedImage
	hierarchy: Hierarchy
	carve: FieldCarve
	model: FieldModel
	nodes: readonly ParsedNode[]
	/** The whole image's accumulator — node 0's, reused rather than rebuilt. */
	rootAccumulator: Accumulator
	roles: RoleAssignment
	contrast: ResolvedContrastFloors
	/** Wall-clock milliseconds spent in the parse, for the cost line in NOTES. */
	parseMs: number
}>

export async function parseImage(imagePath: string): Promise<Parse> {
	const startedAt = performance.now()
	const image = await decodeImage(imagePath)
	const hierarchy = buildHierarchy(image)
	const carve = carveField(image, hierarchy)
	const model = typeField(image, carve)

	// ------------------------------------------------------------------------------------------
	// Per-leaf facts, prefix-summed over the DFS leaf order so any node's answer is two lookups.
	// ------------------------------------------------------------------------------------------
	const leafCount = hierarchy.zoneCount
	const fieldPrefix = new Int32Array(leafCount + 1)
	const borderPrefix = new Int32Array(leafCount + 1)
	const survivorPrefix = new Int32Array(leafCount + 1)
	const borderPixelsPerZone = new Int32Array(leafCount)
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) {
				borderPixelsPerZone[hierarchy.zoneOfPixel[y * image.width + x]] += 1
			}
		}
	}
	for (let position = 0; position < leafCount; position += 1) {
		const zone = hierarchy.leavesInOrder[position]
		fieldPrefix[position + 1] = fieldPrefix[position] + (hierarchy.zoneTouchesBorder[zone] === 1 ? 1 : 0)
		borderPrefix[position + 1] = borderPrefix[position] + borderPixelsPerZone[zone]
		survivorPrefix[position + 1] = survivorPrefix[position] +
			(hierarchy.zoneSize[zone] / image.pixelCount >= GRAIN_AREA_FLOOR ? 1 : 0)
	}
	/** How many non-grain α-zones sit under a node. */
	const survivorsUnder = (node: number): number =>
		survivorPrefix[hierarchy.lastLeaf[node] + 1] - survivorPrefix[hierarchy.firstLeaf[node]]

	// ------------------------------------------------------------------------------------------
	// **Grain folding, and the contraction that has to come with it.**
	//
	// Folding the grain *zones* away is only half the job. Single-linkage merging — which is what
	// Kruskal over pixel edges is — produces long chains: on a 300×300 JPEG cover the raw tree came
	// out with 5,888 zones and 11,769 nodes, of which 3,538 cleared the area floor purely because
	// each was its big child plus one more speck. A node that adds a speck to its child is not a
	// structure; it is the same structure spelled again, and publishing 3,538 of them would make the
	// node dump unreadable and the parse 30× slower for nothing.
	//
	// So a node is retained when it is the **root**, a **non-grain α-zone**, or a **branching point
	// of the surviving tree** — an internal node at least two of whose children still hold a
	// surviving zone. That is the induced topology over the surviving leaves and nothing else: every
	// retained node is a place where the image genuinely splits. Grain is not deleted; its pixels
	// still belong to every ancestor's pixel range and therefore to every ancestor's colour, which is
	// exactly what "folded into its parent" means.
	// ------------------------------------------------------------------------------------------
	const retained: ParsedNode[] = []
	let rootAccumulator: Accumulator | null = null
	const stack: { node: number; parentDumpId: number | null; depth: number }[] = [
		{ node: hierarchy.root, parentDumpId: null, depth: 0 },
	]
	while (stack.length > 0) {
		const frame = stack.pop() as { node: number; parentDumpId: number | null; depth: number }
		const node = frame.node
		const areaFraction = hierarchy.area[node] / image.pixelCount
		const isRoot = node === hierarchy.root
		const isZone = node < hierarchy.zoneCount
		let branching = 0
		if (!isZone) {
			for (const child of hierarchy.children[node]) {
				if (survivorsUnder(child) > 0) branching += 1
			}
		}
		const keep = isRoot ||
			(isZone ? areaFraction >= GRAIN_AREA_FLOOR : branching >= 2)
		let dumpId = frame.parentDumpId
		let depth = frame.depth
		if (keep) {
			const first = hierarchy.firstLeaf[node]
			const last = hierarchy.lastLeaf[node]
			const fieldLeaves = fieldPrefix[last + 1] - fieldPrefix[first]
			const leaves = last - first + 1
			const range = pixelRangeOf(hierarchy, node)
			const accumulator = buildAccumulator(image, hierarchy.pixelOrder, range.from, range.to)
			const representative = representativeOf(accumulator)
			if (representative !== null) {
				dumpId = retained.length
				retained.push({
					id: dumpId,
					hierarchyId: node,
					parent: frame.parentDumpId,
					depth,
					areaFraction,
					levelBars: hierarchy.level[node],
					kind: node < hierarchy.zoneCount ? "zone" : "group",
					containsField: fieldLeaves > 0,
					fieldOnly: fieldLeaves === leaves,
					borderFraction: (borderPrefix[last + 1] - borderPrefix[first]) / hierarchy.area[node],
					representative,
				})
				depth = frame.depth + 1
				if (isRoot) rootAccumulator = accumulator
			}
		}
		const children = hierarchy.children[node]
		// Pushed in reverse so the stack pops them in ascending child order — the DFS pre-order the
		// dump's ids are defined by. A subtree with no surviving zone holds no retained node at all,
		// so it is not walked; that prune is what keeps the traversal proportional to the retained
		// tree rather than to the 11,769-node raw one.
		for (let i = children.length - 1; i >= 0; i -= 1) {
			if (survivorsUnder(children[i]) === 0) continue
			stack.push({ node: children[i], parentDumpId: dumpId, depth })
		}
	}

	if (rootAccumulator === null) throw new Error("the parse produced no root node")

	// ------------------------------------------------------------------------------------------
	// Role candidates, read off the retained tree.
	// ------------------------------------------------------------------------------------------
	const fieldZones: RoleCandidate[] = retained
		.filter((node) => node.kind === "zone" && node.fieldOnly)
		.sort((first, second) =>
			second.areaFraction - first.areaFraction || first.hierarchyId - second.hierarchyId
		)
		.map((node) => candidateOf("field-zone", node.hierarchyId, node.areaFraction, node.representative))

	// A field made entirely of grain — every border-touching zone below the area floor — still has a
	// colour, and the background is still the thing that reaches the frame. Rather than let the
	// assignment run out of candidates, the whole mask stands in for its own largest zone. This is
	// the heavy-grain and halftone case arm-b §7 expects to be bad at, handled rather than crashed.
	if (fieldZones.length === 0 && carve.pixels.length > 0) {
		const whole = representativeOf(buildAccumulator(image, carve.pixels, 0, carve.pixels.length))
		if (whole !== null) fieldZones.push(candidateOf("field-zone", -3, carve.areaFraction, whole))
	}

	const marks: RoleCandidate[] = retained
		.filter((node) => !node.containsField)
		.map((node) => candidateOf("mark", node.hierarchyId, node.areaFraction, node.representative))

	let rampLow: RoleCandidate | null = null
	let rampHigh: RoleCandidate | null = null
	let geometry: GradientSpec["geometry"] | undefined
	if (model.kind === "linear") {
		const low = representativeOf(buildAccumulator(image, model.lowPixels, 0, model.lowPixels.length))
		const high = representativeOf(buildAccumulator(image, model.highPixels, 0, model.highPixels.length))
		if (low !== null) rampLow = candidateOf("ramp-low", -1, carve.areaFraction / 2, low)
		if (high !== null) rampHigh = candidateOf("ramp-high", -2, carve.areaFraction / 2, high)
		geometry = {
			kind: "linear",
			start: model.start,
			end: model.end,
			angleDegrees: model.angleDegrees,
		}
	}
	if (rampLow === null || rampHigh === null) {
		rampLow = null
		rampHigh = null
		geometry = undefined
	}

	const contrast = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)
	const roles = assignRoles({
		fieldZones,
		rampLow,
		rampHigh,
		marks,
		rootAccumulator,
		degenerate: model.kind === "none",
		geometry,
		contrast,
	})

	return {
		image,
		hierarchy,
		carve,
		model,
		nodes: retained,
		rootAccumulator,
		roles,
		contrast,
		parseMs: performance.now() - startedAt,
	}
}
