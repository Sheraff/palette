/**
 * The quasi-flat-zone hierarchy — the α-tree (arm-b §2.2).
 *
 * ## What is built
 *
 * The pixel adjacency graph (4-connectivity), each edge weighted by the OKLab distance across it
 * **divided by that pair's own regional same-colour bar**. So an edge's weight is a number of
 * *bars*, and the dissimilarity level α is measured in bars too. Two things follow, and they are the
 * whole reason the design has no second epsilon:
 *
 *  - **α = 1 is the contract's ruler.** At level 1 the α-zones are the connected components of "there
 *    is a path between these pixels whose every step reads as the same colour". That is
 *    `sameColor()` applied along a path, nothing more.
 *  - **Levels above 1 are still in the contract's units.** A node formed at level 2.4 is a group of
 *    zones whose worst internal seam is 2.4 bars. No new quantity is introduced to describe the tree.
 *
 * The tree's **leaves are the α-zones at α = 1**, not pixels. Below one bar the contract says there
 * is no distinction to see, so a hierarchy refined below that level would be a hierarchy of
 * differences the ruler calls zero — exactly the kind of structure a re-encode moves. Everything
 * above one bar is kept: internal nodes are the Kruskal merges of zone groups, so the tree really
 * does nest (a mark inside a shape inside a panel), which is the half of P2 that is new.
 *
 * ## The famous pathology is the feature
 *
 * On a smooth gradient every adjacent step is under any bar, so the entire ramp chains into one
 * α-zone. Arm-b §2.2: *"a field that is one flat colour and a field that is one continuous
 * progression are the same object at this level"* — which is the reviewer's own `flat_field` versus
 * `shaded_field` distinction, deferred to `field.ts` where it becomes the gradient boolean.
 *
 * ## Determinism
 *
 * Arm-b proposes a counting sort into bar-scaled bins for speed. This implementation does something
 * **stricter**: an exact sort of the edges by `(weight in bars, raster edge index)`. Binning would
 * have needed a bin width, which is a constant the SPEC does not let this pipeline invent; an exact
 * sort needs none and makes the tie-break explicit — equal-weight edges are merged in raster order
 * of the edge, and an edge's raster index is a function of pixel coordinates alone. Zone ids are
 * assigned in raster order of each zone's first pixel; children lists are sorted by their subtree's
 * first pixel. Nothing anywhere reads a `Map` or `Set` iteration order.
 */

import { ALPHA_BARS } from "./constants.ts"
import { barBetween, pixelDistance } from "./decode.ts"
import type { DecodedImage } from "./decode.ts"

/** Union-find with path halving and union by size. The size rule never reaches a published result. */
class DisjointSet {
	private readonly parent: Int32Array
	private readonly size: Int32Array

	constructor(count: number) {
		this.parent = new Int32Array(count)
		this.size = new Int32Array(count).fill(1)
		for (let i = 0; i < count; i += 1) this.parent[i] = i
	}

	find(node: number): number {
		let current = node
		while (this.parent[current] !== current) {
			this.parent[current] = this.parent[this.parent[current]]
			current = this.parent[current]
		}
		return current
	}

	/** Merge and return the surviving root. */
	union(first: number, second: number): number {
		const a = this.find(first)
		const b = this.find(second)
		if (a === b) return a
		const [big, small] = this.size[a] >= this.size[b] ? [a, b] : [b, a]
		this.parent[small] = big
		this.size[big] += this.size[small]
		return big
	}
}

export type Hierarchy = Readonly<{
	/** Number of α-zones, i.e. tree leaves. */
	zoneCount: number
	/** Canonical zone id per pixel, in raster order. Ids run in raster order of each zone's first pixel. */
	zoneOfPixel: Int32Array
	/** Pixel count per zone. */
	zoneSize: Int32Array
	/** 1 when the zone contains at least one image-border pixel. */
	zoneTouchesBorder: Uint8Array

	/** Total nodes: leaves `0..zoneCount-1`, internal nodes above that. Dead nodes are excluded. */
	nodeCount: number
	/** The level, in bars, at which each node was formed. Leaves carry `ALPHA_BARS`. */
	level: Float64Array
	/** Parent node id, `-1` for the root. */
	parent: Int32Array
	/** Children per node, ascending by the subtree's first pixel. Empty for leaves. */
	children: readonly (readonly number[])[]
	root: number
	/** Pixel count under each node. */
	area: Int32Array
	/** Depth from the root: the root is 0. */
	depth: Int32Array

	/** Leaves in DFS visiting order; `leavesInOrder[k]` is a zone id. */
	leavesInOrder: Int32Array
	/** Inclusive range of DFS leaf positions under each node. */
	firstLeaf: Int32Array
	lastLeaf: Int32Array
	/** Pixel indices grouped by DFS leaf position, raster order inside each group. */
	pixelOrder: Uint32Array
	/** Offsets into `pixelOrder`; group `k` is `[leafStart[k], leafStart[k + 1])`. */
	leafStart: Int32Array
}>

/**
 * Build the α-zones and the tree of zone groups above them.
 *
 * Cost is the ten-ish linear passes arm-b §5 budgets for, plus one exact sort of the above-bar
 * edges. On a 300×300 cover that is ~179,400 edges of which only the above-bar minority is sorted.
 */
export function buildHierarchy(image: DecodedImage): Hierarchy {
	const { width, height, pixelCount } = image

	// ------------------------------------------------------------------------------------------
	// Edges. Two per pixel (right and down), in raster order, so an edge index is a coordinate.
	// ------------------------------------------------------------------------------------------
	const maxEdges = pixelCount * 2
	const edgeFrom = new Int32Array(maxEdges)
	const edgeTo = new Int32Array(maxEdges)
	const edgeWeight = new Float64Array(maxEdges)
	let edgeCount = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x
			if (x + 1 < width) {
				const neighbour = pixel + 1
				edgeFrom[edgeCount] = pixel
				edgeTo[edgeCount] = neighbour
				edgeWeight[edgeCount] = pixelDistance(image, pixel, neighbour) / barBetween(image, pixel, neighbour)
				edgeCount += 1
			}
			if (y + 1 < height) {
				const neighbour = pixel + width
				edgeFrom[edgeCount] = pixel
				edgeTo[edgeCount] = neighbour
				edgeWeight[edgeCount] = pixelDistance(image, pixel, neighbour) / barBetween(image, pixel, neighbour)
				edgeCount += 1
			}
		}
	}

	// ------------------------------------------------------------------------------------------
	// α-zones at α = ALPHA_BARS. "Join iff the two pixels read as the same colour" — `sameColor`'s
	// own `distance < bar`, which in bar units is `weight < 1`.
	// ------------------------------------------------------------------------------------------
	const pixelSet = new DisjointSet(pixelCount)
	for (let edge = 0; edge < edgeCount; edge += 1) {
		if (edgeWeight[edge] < ALPHA_BARS) pixelSet.union(edgeFrom[edge], edgeTo[edge])
	}

	const zoneOfPixel = new Int32Array(pixelCount).fill(-1)
	const zoneOfRoot = new Int32Array(pixelCount).fill(-1)
	const zoneFirstPixel: number[] = []
	let zoneCount = 0
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const root = pixelSet.find(pixel)
		let zone = zoneOfRoot[root]
		if (zone === -1) {
			zone = zoneCount
			zoneCount += 1
			zoneOfRoot[root] = zone
			zoneFirstPixel.push(pixel)
		}
		zoneOfPixel[pixel] = zone
	}

	const zoneSize = new Int32Array(zoneCount)
	const zoneTouchesBorder = new Uint8Array(zoneCount)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x
			const zone = zoneOfPixel[pixel]
			zoneSize[zone] += 1
			if (x === 0 || y === 0 || x === width - 1 || y === height - 1) zoneTouchesBorder[zone] = 1
		}
	}

	// ------------------------------------------------------------------------------------------
	// The tree above one bar: Kruskal over the remaining edges, zones as leaves.
	// ------------------------------------------------------------------------------------------
	const aboveBar: number[] = []
	for (let edge = 0; edge < edgeCount; edge += 1) {
		if (edgeWeight[edge] < ALPHA_BARS) continue
		if (zoneOfPixel[edgeFrom[edge]] === zoneOfPixel[edgeTo[edge]]) continue
		aboveBar.push(edge)
	}
	// Exact, with the tie-break named: equal weights merge in raster order of the edge.
	aboveBar.sort((first, second) => edgeWeight[first] - edgeWeight[second] || first - second)

	const maxNodes = Math.max(1, zoneCount * 2)
	const level = new Float64Array(maxNodes).fill(ALPHA_BARS)
	const parent = new Int32Array(maxNodes).fill(-1)
	const childList: number[][] = Array.from({ length: maxNodes }, () => [])
	const dead = new Uint8Array(maxNodes)
	let nodeTotal = zoneCount

	const zoneSet = new DisjointSet(Math.max(1, zoneCount))
	const nodeOfZoneRoot = new Int32Array(Math.max(1, zoneCount))
	for (let zone = 0; zone < zoneCount; zone += 1) nodeOfZoneRoot[zone] = zone

	for (const edge of aboveBar) {
		const rootA = zoneSet.find(zoneOfPixel[edgeFrom[edge]])
		const rootB = zoneSet.find(zoneOfPixel[edgeTo[edge]])
		if (rootA === rootB) continue
		const nodeA = nodeOfZoneRoot[rootA]
		const nodeB = nodeOfZoneRoot[rootB]
		const lambda = edgeWeight[edge]

		// Two components joined at the same level are one node, not a chain of one-child nodes. The
		// three branches below are the standard α-tree absorb rule; they depend only on node ids and
		// on exact level equality, so they carry no order dependence of their own.
		const absorbA = nodeA >= zoneCount && level[nodeA] === lambda
		const absorbB = nodeB >= zoneCount && level[nodeB] === lambda
		let merged: number
		if (absorbA && absorbB) {
			const keep = nodeA < nodeB ? nodeA : nodeB
			const drop = nodeA < nodeB ? nodeB : nodeA
			for (const child of childList[drop]) {
				parent[child] = keep
				childList[keep].push(child)
			}
			childList[drop] = []
			dead[drop] = 1
			merged = keep
		} else if (absorbA) {
			childList[nodeA].push(nodeB)
			parent[nodeB] = nodeA
			merged = nodeA
		} else if (absorbB) {
			childList[nodeB].push(nodeA)
			parent[nodeA] = nodeB
			merged = nodeB
		} else {
			merged = nodeTotal
			nodeTotal += 1
			level[merged] = lambda
			childList[merged] = [nodeA, nodeB]
			parent[nodeA] = merged
			parent[nodeB] = merged
		}
		nodeOfZoneRoot[zoneSet.union(rootA, rootB)] = merged
	}

	const root = zoneCount === 0 ? 0 : nodeOfZoneRoot[zoneSet.find(0)]

	// ------------------------------------------------------------------------------------------
	// Bottom-up attributes, then a deterministic child order, then the DFS.
	// ------------------------------------------------------------------------------------------
	const area = new Int32Array(nodeTotal)
	const firstPixel = new Int32Array(nodeTotal).fill(Number.MAX_SAFE_INTEGER)
	for (let zone = 0; zone < zoneCount; zone += 1) {
		area[zone] = zoneSize[zone]
		firstPixel[zone] = zoneFirstPixel[zone]
	}
	// Internal nodes were created in ascending id order and a node's children always have smaller
	// ids, so one ascending sweep is a valid bottom-up pass.
	for (let node = zoneCount; node < nodeTotal; node += 1) {
		if (dead[node] === 1) continue
		let total = 0
		let earliest = Number.MAX_SAFE_INTEGER
		for (const child of childList[node]) {
			total += area[child]
			if (firstPixel[child] < earliest) earliest = firstPixel[child]
		}
		area[node] = total
		firstPixel[node] = earliest
	}
	for (let node = zoneCount; node < nodeTotal; node += 1) {
		if (dead[node] === 1) continue
		childList[node].sort((first, second) => firstPixel[first] - firstPixel[second])
	}

	const depth = new Int32Array(nodeTotal)
	const leavesInOrder = new Int32Array(zoneCount)
	const firstLeaf = new Int32Array(nodeTotal).fill(-1)
	const lastLeaf = new Int32Array(nodeTotal).fill(-1)
	let leafCursor = 0
	// Explicit stack: a 90,000-pixel image can produce a deep chain and recursion would be a
	// stack-depth bug waiting for the one cover that has it.
	const stack: { node: number; stage: number }[] = [{ node: root, stage: 0 }]
	while (stack.length > 0) {
		const frame = stack[stack.length - 1]
		const node = frame.node
		if (frame.stage === 0) {
			frame.stage = 1
			if (node !== root) depth[node] = depth[parent[node]] + 1
			if (node < zoneCount) {
				firstLeaf[node] = leafCursor
				leavesInOrder[leafCursor] = node
				leafCursor += 1
				lastLeaf[node] = leafCursor - 1
				stack.pop()
				continue
			}
			firstLeaf[node] = leafCursor
			for (let i = childList[node].length - 1; i >= 0; i -= 1) {
				stack.push({ node: childList[node][i], stage: 0 })
			}
			continue
		}
		lastLeaf[node] = leafCursor - 1
		stack.pop()
	}

	const leafPositionOfZone = new Int32Array(Math.max(1, zoneCount))
	for (let position = 0; position < zoneCount; position += 1) leafPositionOfZone[leavesInOrder[position]] = position

	const leafStart = new Int32Array(zoneCount + 1)
	for (let zone = 0; zone < zoneCount; zone += 1) leafStart[leafPositionOfZone[zone] + 1] = zoneSize[zone]
	for (let position = 0; position < zoneCount; position += 1) leafStart[position + 1] += leafStart[position]
	const cursor = Int32Array.from(leafStart.subarray(0, zoneCount))
	const pixelOrder = new Uint32Array(pixelCount)
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const position = leafPositionOfZone[zoneOfPixel[pixel]]
		pixelOrder[cursor[position]] = pixel
		cursor[position] += 1
	}

	return {
		zoneCount,
		zoneOfPixel,
		zoneSize,
		zoneTouchesBorder,
		nodeCount: nodeTotal,
		level: level.subarray(0, nodeTotal),
		parent: parent.subarray(0, nodeTotal),
		children: childList.slice(0, nodeTotal),
		root,
		area,
		depth,
		leavesInOrder,
		firstLeaf,
		lastLeaf,
		pixelOrder,
		leafStart,
	}
}

/** The half-open slice of `pixelOrder` holding every pixel under `node`. */
export function pixelRangeOf(hierarchy: Hierarchy, node: number): { from: number; to: number } {
	return { from: hierarchy.leafStart[hierarchy.firstLeaf[node]], to: hierarchy.leafStart[hierarchy.lastLeaf[node] + 1] }
}
