/**
 * The tree of shapes of a quantised integer image — the whole correctness risk of this prototype.
 *
 * ## What a tree of shapes is
 *
 * A *shape* is a connected component of an upper level set `{u ≥ λ}` or a lower level set `{u ≤ λ}`
 * with its holes filled in. Shapes are nested or disjoint, never crossing, so they form a tree whose
 * root is the whole image. It is the self-dual object arm-b′ §2.2 calls the topographic map: every
 * visually coherent region appears in it, dark on light and light on dark alike, and it is invariant
 * under any strictly monotone change of the channel it is built on — which is the structural
 * robustness claim this prototype exists to test.
 *
 * ## How it is computed here
 *
 * Géraud, Carlinet, Crozet and Najman's quasi-linear algorithm (2013), which is three steps:
 *
 *  1. **Immersion.** The h x w image becomes a (2h+1) x (2w+1) interval-valued map on the Khalimsky
 *     grid: original pixels sit at odd coordinates carrying the degenerate interval `[u, u]`, the
 *     cells between them carry the span `[min, max]` of the 2 or 4 pixels they touch, and a one-cell
 *     border carries the median of the image's own border pixels. The immersion is what makes the
 *     result well-composed — on the raw pixel grid a 2x2 diagonal configuration leaves "is this one
 *     region or two" genuinely ambiguous, and no amount of care in the union-find fixes that.
 *  2. **Sort.** A flood from the outside corner through a hierarchical queue, always continuing at
 *     the level closest to the current one. Each cell is popped at a level inside its own interval,
 *     and the pop order `R` is a valid processing sequence for the union-find that follows.
 *  3. **Union-find, backwards.** Sweep `R` from the end, merging each cell with the already-merged
 *     neighbours behind it. This — and *not* the flood's discovery pointers — is the hierarchy. Two
 *     cells of one region are routinely discovered from two different outer cells, so reading
 *     discovery as parenthood shatters a region into one node per entry point; the reconstruction
 *     test still passes when it does, which is precisely why the brute-force reference exists.
 *  4. **Canonicalize.** One forward pass over `R` compressing each cell's parent pointer onto the
 *     first-popped cell of its node. Cells whose parent pointer then lands on a *different* level are
 *     the node representatives, and the tree is read off them.
 *
 * Then this module does a fifth step the paper does not need: **de-immersion**, dropping the cells
 * that are not original pixels, dropping nodes that carry no original pixel and no branching, and
 * accumulating per-node attributes over original pixels only.
 *
 * ## Why the tests in `tests/` are not optional
 *
 * A subtly wrong tree fails silently. Every node still has an area and a colour, every palette still
 * validates, and nothing downstream can tell. `reconstruct()` below exists so a test can rebuild the
 * quantised image from the tree alone and compare it byte for byte, and `tests/brute-force.test.ts`
 * checks the *nesting* against a naive level-set implementation that shares no code with this one.
 */

/** A tree of shapes over an integer-valued image, with per-node attributes over original pixels. */
export type ShapeTree = Readonly<{
	width: number
	height: number
	/** Node count. Ids are `0 … nodeCount-1`, assigned so a parent's id is always below its child's. */
	nodeCount: number
	/** The root's id. Always 0, because ids follow the flood order and the root is popped first. */
	rootId: number
	/** `nodeParent[root] === root`. */
	nodeParent: Int32Array
	/** The integer level of each node. */
	nodeLevel: Int32Array
	/** Root is 0. */
	nodeDepth: Int32Array
	/** Original pixels whose deepest containing node is this one. */
	nodeOwnArea: Int32Array
	/** Original pixels in this node's whole subtree — the area of the *shape*. */
	nodeSubtreeArea: Int32Array
	/** Shape bounding box, in pixel coordinates, inclusive. */
	nodeMinX: Int32Array
	nodeMinY: Int32Array
	nodeMaxX: Int32Array
	nodeMaxY: Int32Array
	/** Shape centroid, in pixel coordinates. */
	nodeCentroidX: Float64Array
	nodeCentroidY: Float64Array
	/** For each original pixel in raster order, the id of its deepest containing node. */
	nodeOfPixel: Int32Array
}>

/**
 * The lower median of a list of integers.
 *
 * Lower and not the mean of the two middles, because the border value must be one of the image's own
 * levels: the immersion's border is a region of the image's own value range, and an averaged level
 * would be a value the artwork does not contain.
 */
function lowerMedian(values: number[]): number {
	const sorted = values.slice().sort((first, second) => first - second)
	return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * A hierarchical queue: one FIFO per level, plus a bitmask of the non-empty levels so that finding
 * the nearest non-empty level is a handful of bit operations rather than a scan.
 *
 * FIFO and not LIFO because the pop order is the tree's node order and therefore part of the
 * determinism promise; a FIFO makes the order a function of the raster scan alone.
 */
class HierarchicalQueue {
	private readonly head: Int32Array
	private readonly tail: Int32Array
	private readonly next: Int32Array
	private readonly occupied: Uint32Array
	private readonly levelCount: number
	size = 0

	constructor(levelCount: number, capacity: number) {
		this.levelCount = levelCount
		this.head = new Int32Array(levelCount).fill(-1)
		this.tail = new Int32Array(levelCount).fill(-1)
		this.next = new Int32Array(capacity).fill(-1)
		this.occupied = new Uint32Array(Math.ceil(levelCount / 32))
	}

	push(level: number, element: number): void {
		this.next[element] = -1
		if (this.head[level] === -1) this.head[level] = element
		else this.next[this.tail[level]] = element
		this.tail[level] = element
		this.occupied[level >>> 5] |= 1 << (level & 31)
		this.size += 1
	}

	/** Is this level non-empty? */
	private has(level: number): boolean {
		return (this.occupied[level >>> 5] & (1 << (level & 31))) !== 0
	}

	/**
	 * The non-empty level nearest to `from`, ties going to the **lower** level.
	 *
	 * The tie rule is a determinism decision, not a perceptual one: when the flood can continue equally
	 * far up or down, it goes down. Any fixed rule would do; this one is written down so two runs agree.
	 */
	nearestLevel(from: number): number {
		if (this.has(from)) return from
		for (let distance = 1; distance < this.levelCount; distance += 1) {
			const below = from - distance
			if (below >= 0 && this.has(below)) return below
			const above = from + distance
			if (above < this.levelCount && this.has(above)) return above
		}
		return -1
	}

	pop(level: number): number {
		const element = this.head[level]
		const following = this.next[element]
		this.head[level] = following
		if (following === -1) {
			this.tail[level] = -1
			this.occupied[level >>> 5] &= ~(1 << (level & 31))
		}
		this.size -= 1
		return element
	}
}

/**
 * Build the tree of shapes of an integer image.
 *
 * `levels` is the quantised channel in raster order, values in `[0, levelCount)`.
 */
export function buildTreeOfShapes(
	levels: Int32Array | Uint8Array,
	width: number,
	height: number,
	levelCount: number,
): ShapeTree {
	if (width < 1 || height < 1) throw new Error("tree of shapes needs a non-empty image")
	if (levels.length !== width * height) throw new Error("levels length does not match width x height")

	// ------------------------------------------------------------------------------------------
	// 1. Immersion
	// ------------------------------------------------------------------------------------------

	// The Khalimsky grid with a one-cell outer border. Original pixel (y, x) sits at (2y+1, 2x+1).
	const gridWidth = 2 * width + 1
	const gridHeight = 2 * height + 1
	const cellCount = gridWidth * gridHeight
	const lower = new Int32Array(cellCount)
	const upper = new Int32Array(cellCount)

	const border: number[] = []
	for (let x = 0; x < width; x += 1) {
		border.push(levels[x])
		border.push(levels[(height - 1) * width + x])
	}
	for (let y = 0; y < height; y += 1) {
		border.push(levels[y * width])
		border.push(levels[y * width + width - 1])
	}
	const borderLevel = lowerMedian(border)

	const pixelAt = (y: number, x: number): number => levels[y * width + x]

	for (let row = 0; row < gridHeight; row += 1) {
		for (let column = 0; column < gridWidth; column += 1) {
			const cell = row * gridWidth + column
			if (row === 0 || column === 0 || row === gridHeight - 1 || column === gridWidth - 1) {
				lower[cell] = borderLevel
				upper[cell] = borderLevel
				continue
			}
			const innerRow = row - 1
			const innerColumn = column - 1
			const rowIsPixel = innerRow % 2 === 0
			const columnIsPixel = innerColumn % 2 === 0
			const y = innerRow >> 1
			const x = innerColumn >> 1
			if (rowIsPixel && columnIsPixel) {
				const value = pixelAt(y, x)
				lower[cell] = value
				upper[cell] = value
			} else if (rowIsPixel) {
				const first = pixelAt(y, x)
				const second = pixelAt(y, x + 1)
				lower[cell] = Math.min(first, second)
				upper[cell] = Math.max(first, second)
			} else if (columnIsPixel) {
				const first = pixelAt(y, x)
				const second = pixelAt(y + 1, x)
				lower[cell] = Math.min(first, second)
				upper[cell] = Math.max(first, second)
			} else {
				const a = pixelAt(y, x)
				const b = pixelAt(y, x + 1)
				const c = pixelAt(y + 1, x)
				const d = pixelAt(y + 1, x + 1)
				lower[cell] = Math.min(a, b, c, d)
				upper[cell] = Math.max(a, b, c, d)
			}
		}
	}

	// ------------------------------------------------------------------------------------------
	// 2. Sort — the flood
	// ------------------------------------------------------------------------------------------

	const cellLevel = new Int32Array(cellCount)
	const cellParent = new Int32Array(cellCount)
	const order = new Int32Array(cellCount)
	const seen = new Uint8Array(cellCount)
	const queue = new HierarchicalQueue(levelCount, cellCount)

	const start = 0 // the outer border's top-left corner: the point at infinity
	let currentLevel = borderLevel
	queue.push(currentLevel, start)
	seen[start] = 1

	let written = 0
	while (queue.size > 0) {
		const level = queue.nearestLevel(currentLevel)
		currentLevel = level
		const cell = queue.pop(level)
		cellLevel[cell] = level
		order[written] = cell
		written += 1

		const row = (cell / gridWidth) | 0
		const column = cell - row * gridWidth
		// Fixed neighbour order — up, left, right, down. Raster order, so the FIFO's order is a
		// function of the scan and of nothing else.
		for (let direction = 0; direction < 4; direction += 1) {
			let neighbourRow = row
			let neighbourColumn = column
			if (direction === 0) neighbourRow -= 1
			else if (direction === 1) neighbourColumn -= 1
			else if (direction === 2) neighbourColumn += 1
			else neighbourRow += 1
			if (neighbourRow < 0 || neighbourColumn < 0 || neighbourRow >= gridHeight || neighbourColumn >= gridWidth) {
				continue
			}
			const neighbour = neighbourRow * gridWidth + neighbourColumn
			if (seen[neighbour] === 1) continue
			seen[neighbour] = 1
			// The interval clamped to the current level: a cell enters the queue as close to where the
			// flood already is as its own interval allows. This is what makes the result self-dual.
			const target = lower[neighbour] > level ? lower[neighbour] : upper[neighbour] < level ? upper[neighbour] : level
			queue.push(target, neighbour)
		}
	}
	if (written !== cellCount) throw new Error("the flood did not reach every cell")

	// ------------------------------------------------------------------------------------------
	// 3. Union-find, backwards along the flood order
	// ------------------------------------------------------------------------------------------

	// The flood's *discovery* pointers are not the tree — two cells of one region are routinely
	// discovered from two different outer cells, and taking discovery as parenthood shatters the
	// region into one node per entry point. What is true is that `order` is a valid processing
	// sequence: sweeping it backwards and merging each cell with the already-merged neighbours behind
	// it builds the hierarchy, exactly as the max-tree's union-find does with a level sort in place of
	// this order.
	const zpar = new Int32Array(cellCount).fill(-1)
	const findRoot = (cell: number): number => {
		let root = cell
		while (zpar[root] !== root) root = zpar[root]
		let walk = cell
		while (zpar[walk] !== root) {
			const next = zpar[walk]
			zpar[walk] = root
			walk = next
		}
		return root
	}
	for (let index = cellCount - 1; index >= 0; index -= 1) {
		const cell = order[index]
		cellParent[cell] = cell
		zpar[cell] = cell
		const row = (cell / gridWidth) | 0
		const column = cell - row * gridWidth
		for (let direction = 0; direction < 4; direction += 1) {
			let neighbourRow = row
			let neighbourColumn = column
			if (direction === 0) neighbourRow -= 1
			else if (direction === 1) neighbourColumn -= 1
			else if (direction === 2) neighbourColumn += 1
			else neighbourRow += 1
			if (neighbourRow < 0 || neighbourColumn < 0 || neighbourRow >= gridHeight || neighbourColumn >= gridWidth) {
				continue
			}
			const neighbour = neighbourRow * gridWidth + neighbourColumn
			if (zpar[neighbour] === -1) continue
			const root = findRoot(neighbour)
			if (root !== cell) {
				cellParent[root] = cell
				zpar[root] = cell
			}
		}
	}

	// ------------------------------------------------------------------------------------------
	// 4. Canonicalize
	// ------------------------------------------------------------------------------------------

	// Forward over the pop order, so a cell's parent has already been compressed when it is read.
	// Afterwards `cellParent[p]` is always the *first-popped* cell of some node: of p's own node when
	// the levels agree, of p's parent node when they do not.
	for (let index = 0; index < cellCount; index += 1) {
		const cell = order[index]
		const parent = cellParent[cell]
		if (cellLevel[cellParent[parent]] === cellLevel[parent]) cellParent[cell] = cellParent[parent]
	}

	// ------------------------------------------------------------------------------------------
	// 5. De-immersion: raw nodes over original pixels
	// ------------------------------------------------------------------------------------------

	// A representative is a cell whose canonical parent sits at a different level (or the root).
	const rawIdOfCell = new Int32Array(cellCount).fill(-1)
	let rawCount = 0
	for (let index = 0; index < cellCount; index += 1) {
		const cell = order[index]
		if (cell === start || cellLevel[cellParent[cell]] !== cellLevel[cell]) {
			rawIdOfCell[cell] = rawCount
			rawCount += 1
		}
	}
	const rawParent = new Int32Array(rawCount)
	const rawLevel = new Int32Array(rawCount)
	for (let index = 0; index < cellCount; index += 1) {
		const cell = order[index]
		const rawId = rawIdOfCell[cell]
		if (rawId === -1) continue
		rawLevel[rawId] = cellLevel[cell]
		rawParent[rawId] = cell === start ? rawId : rawIdOfCell[cellParent[cell]]
	}

	const representativeOfCell = (cell: number): number =>
		rawIdOfCell[cell] !== -1 ? rawIdOfCell[cell] : rawIdOfCell[cellParent[cell]]

	const rawOwnArea = new Int32Array(rawCount)
	const rawNodeOfPixel = new Int32Array(width * height)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const cell = (2 * y + 1) * gridWidth + (2 * x + 1)
			const rawId = representativeOfCell(cell)
			rawNodeOfPixel[y * width + x] = rawId
			rawOwnArea[rawId] += 1
		}
	}

	// Subtree areas, children before parents. Raw ids follow the pop order, so a parent's id is below
	// its child's and a descending sweep is a valid bottom-up order.
	const rawSubtreeArea = new Int32Array(rawCount)
	rawSubtreeArea.set(rawOwnArea)
	for (let rawId = rawCount - 1; rawId > 0; rawId -= 1) rawSubtreeArea[rawParent[rawId]] += rawSubtreeArea[rawId]

	// ------------------------------------------------------------------------------------------
	// 6. Prune to nodes that say something about the original pixels
	// ------------------------------------------------------------------------------------------

	// Dropped: a node holding no original pixel of its own and having at most one surviving child —
	// its shape is exactly its child's shape, so it is the same region named twice. Kept: anything
	// with own pixels (dropping one would break reconstruction, since a pixel's level *is* its node's
	// level) and any branch point, which is a real statement about nesting even with no colour of its
	// own. The root is always kept: it is the image rectangle.
	const survivingChildren = new Int32Array(rawCount)
	const keep = new Uint8Array(rawCount)
	for (let rawId = rawCount - 1; rawId >= 0; rawId -= 1) {
		const keptHere = rawId === 0 || rawOwnArea[rawId] > 0 || survivingChildren[rawId] > 1
		if (rawSubtreeArea[rawId] === 0) continue
		keep[rawId] = keptHere ? 1 : 0
		if (rawId === 0) continue
		survivingChildren[rawParent[rawId]] += keptHere ? 1 : survivingChildren[rawId] > 0 ? 1 : 0
	}
	keep[0] = 1

	const nodeIdOfRaw = new Int32Array(rawCount).fill(-1)
	let nodeCount = 0
	for (let rawId = 0; rawId < rawCount; rawId += 1) {
		if (keep[rawId] === 1) {
			nodeIdOfRaw[rawId] = nodeCount
			nodeCount += 1
		}
	}

	const nodeParent = new Int32Array(nodeCount)
	const nodeLevel = new Int32Array(nodeCount)
	const nodeDepth = new Int32Array(nodeCount)
	for (let rawId = 0; rawId < rawCount; rawId += 1) {
		const nodeId = nodeIdOfRaw[rawId]
		if (nodeId === -1) continue
		nodeLevel[nodeId] = rawLevel[rawId]
		if (rawId === 0) {
			nodeParent[nodeId] = nodeId
			nodeDepth[nodeId] = 0
			continue
		}
		let ancestor = rawParent[rawId]
		while (nodeIdOfRaw[ancestor] === -1 && ancestor !== 0) ancestor = rawParent[ancestor]
		const parentId = nodeIdOfRaw[ancestor]
		nodeParent[nodeId] = parentId
		nodeDepth[nodeId] = nodeDepth[parentId] + 1
	}

	// ------------------------------------------------------------------------------------------
	// 7. Attributes
	// ------------------------------------------------------------------------------------------

	const nodeOwnArea = new Int32Array(nodeCount)
	const nodeOfPixel = new Int32Array(width * height)
	for (let pixel = 0; pixel < rawNodeOfPixel.length; pixel += 1) {
		let rawId = rawNodeOfPixel[pixel]
		while (nodeIdOfRaw[rawId] === -1) rawId = rawParent[rawId]
		const nodeId = nodeIdOfRaw[rawId]
		nodeOfPixel[pixel] = nodeId
		nodeOwnArea[nodeId] += 1
	}

	const nodeSubtreeArea = new Int32Array(nodeCount)
	const nodeMinX = new Int32Array(nodeCount).fill(width)
	const nodeMinY = new Int32Array(nodeCount).fill(height)
	const nodeMaxX = new Int32Array(nodeCount).fill(-1)
	const nodeMaxY = new Int32Array(nodeCount).fill(-1)
	const sumX = new Float64Array(nodeCount)
	const sumY = new Float64Array(nodeCount)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const nodeId = nodeOfPixel[y * width + x]
			nodeSubtreeArea[nodeId] += 1
			if (x < nodeMinX[nodeId]) nodeMinX[nodeId] = x
			if (x > nodeMaxX[nodeId]) nodeMaxX[nodeId] = x
			if (y < nodeMinY[nodeId]) nodeMinY[nodeId] = y
			if (y > nodeMaxY[nodeId]) nodeMaxY[nodeId] = y
			sumX[nodeId] += x
			sumY[nodeId] += y
		}
	}
	// Roll own-pixel statistics up into the subtree ones. Node ids follow the pop order, so descending
	// visits every child before its parent.
	for (let nodeId = nodeCount - 1; nodeId > 0; nodeId -= 1) {
		const parentId = nodeParent[nodeId]
		nodeSubtreeArea[parentId] += nodeSubtreeArea[nodeId]
		sumX[parentId] += sumX[nodeId]
		sumY[parentId] += sumY[nodeId]
		if (nodeMinX[nodeId] < nodeMinX[parentId]) nodeMinX[parentId] = nodeMinX[nodeId]
		if (nodeMaxX[nodeId] > nodeMaxX[parentId]) nodeMaxX[parentId] = nodeMaxX[nodeId]
		if (nodeMinY[nodeId] < nodeMinY[parentId]) nodeMinY[parentId] = nodeMinY[nodeId]
		if (nodeMaxY[nodeId] > nodeMaxY[parentId]) nodeMaxY[parentId] = nodeMaxY[nodeId]
	}

	const nodeCentroidX = new Float64Array(nodeCount)
	const nodeCentroidY = new Float64Array(nodeCount)
	for (let nodeId = 0; nodeId < nodeCount; nodeId += 1) {
		const area = nodeSubtreeArea[nodeId]
		nodeCentroidX[nodeId] = area > 0 ? sumX[nodeId] / area : 0
		nodeCentroidY[nodeId] = area > 0 ? sumY[nodeId] / area : 0
	}

	return {
		width,
		height,
		nodeCount,
		rootId: 0,
		nodeParent,
		nodeLevel,
		nodeDepth,
		nodeOwnArea,
		nodeSubtreeArea,
		nodeMinX,
		nodeMinY,
		nodeMaxX,
		nodeMaxY,
		nodeCentroidX,
		nodeCentroidY,
		nodeOfPixel,
	}
}

/**
 * The pixel index list of every node's *shape* — its own pixels plus its whole subtree's.
 *
 * Returned as one flat `Int32Array` with per-node offsets, because a tree over a megapixel image has
 * as many nodes as it likes and an array of arrays would allocate one object per node.
 */
export function shapeSupports(tree: ShapeTree): Readonly<{ offsets: Int32Array; pixels: Int32Array }> {
	const offsets = new Int32Array(tree.nodeCount + 1)
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) offsets[nodeId + 1] = offsets[nodeId] + tree.nodeSubtreeArea[nodeId]
	const cursor = offsets.slice(0, tree.nodeCount)
	const pixels = new Int32Array(offsets[tree.nodeCount])
	for (let pixel = 0; pixel < tree.nodeOfPixel.length; pixel += 1) {
		let nodeId = tree.nodeOfPixel[pixel]
		while (true) {
			pixels[cursor[nodeId]] = pixel
			cursor[nodeId] += 1
			if (nodeId === tree.rootId) break
			nodeId = tree.nodeParent[nodeId]
		}
	}
	return { offsets, pixels }
}

/**
 * Rebuild the quantised image from the tree alone.
 *
 * Paint every node's shape with the node's level, parents first. A child's shape is contained in its
 * parent's, so a deeper node always overwrites a shallower one and the last value written to a pixel
 * is the level of the deepest node containing it. If the tree is right, the result is the input.
 *
 * This is the test that a wrong tree cannot survive quietly, and it is why it lives in the module it
 * checks rather than in the test file: any future edit to `buildTreeOfShapes` is one `node --test`
 * away from being told it broke the hierarchy.
 */
export function reconstruct(tree: ShapeTree): Int32Array {
	const supports = shapeSupports(tree)
	const painted = new Int32Array(tree.width * tree.height).fill(-1)
	// Node ids follow the flood order, in which a parent always precedes its child.
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		const level = tree.nodeLevel[nodeId]
		for (let index = supports.offsets[nodeId]; index < supports.offsets[nodeId + 1]; index += 1) {
			painted[supports.pixels[index]] = level
		}
	}
	return painted
}
