/**
 * The tree-of-shapes pipeline: bytes in, a parse and a contract palette out.
 *
 * The stages are arm-b′'s, cut down to what cycle 1 asked for (`SPEC.md`):
 *
 *  1. **decode** at native resolution, refuse transparency, convert to OKLab (`decodeImage`);
 *  2. **quantise** L to integer levels below the smallest measured same-colour bar (`constants.ts`);
 *  3. **the tree of shapes** of the quantised L image (`tree.ts`) — the mechanism under test;
 *  4. **stability**, MSER-style, over a window tied to the same-colour bar (`selectStableNodes`);
 *  5. **representative colours** by the spec's bar-density-mode rule (`representativeColor`);
 *  6. **the field verdict** from the ground stack, and **roles** off the parse (`parseImage`).
 *
 * ### The cycle-1 cut that matters most
 *
 * **L only.** arm-b′ §2.1 is emphatic that one tree per channel is a paradigm commitment and not a
 * tunable — a tree on L alone is structurally blind to an accent that is isoluminant with its field,
 * and the proposal says that case is real. `SPEC.md` cuts a and b for cycle 1 anyway, because the two
 * things this cycle has to produce are a measurable robustness signal and a reachability answer, and
 * both are available from one channel. The blindness is recorded in `NOTES.md` as a known gap, not
 * discovered later as a surprise.
 *
 * ### Determinism
 *
 * Nothing here is ordered by a hash, a map's insertion order, a filename or a random number. Every
 * tie is broken on a quantity computed from pixel values or raster coordinates: node id (which is the
 * flood order, which is the raster scan), then lexicographic RGB. Where a `Map` is used to count
 * colours its keys are sorted before anything reads them.
 */

import sharp from "sharp"
import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar, apcaRaw } from "../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../src/contract/constants.ts"
import type { OkLab, PaletteColor, Rgb8 } from "../../../src/contract/types.ts"
import {
	FIELD_AREA_FRACTION,
	LAMINARITY_CUT,
	LARGEST_SAME_COLOR_BAR,
	L_LEVEL_COUNT,
	MARK_NODE_LIMIT,
	MIN_LAMINAR_CHAIN_LENGTH,
	MIN_NODE_AREA_FRACTION,
	MONOTONE_MIGRATION_FRACTION,
	RESIDUAL_POOL_SIZE,
	RENDER_AXIS_UNIT,
	REPR_CANDIDATE_LIMIT,
	STABILITY_WINDOW_LEVELS,
	UNREADABLE_COVERAGE_FRACTION,
} from "./constants.ts"
import { buildTreeOfShapes, type ShapeTree } from "./tree.ts"

/** Thrown when the input is one the contract refuses. Surfaces as a failed row, never a silent skip. */
export class TosCandidateError extends Error {
	override readonly name = "TosCandidateError"
}

// ---------------------------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------------------------

export type DecodedImage = Readonly<{
	width: number
	height: number
	format: string
	/** `r << 16 | g << 8 | b` per pixel, raster order. */
	packed: Int32Array
	/** Quantised OKLab lightness per pixel, raster order, in `[0, L_LEVEL_COUNT)`. */
	levels: Int32Array
}>

/** Unpack a colour packed as `r << 16 | g << 8 | b`. */
export function unpack(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

/**
 * Decode at native resolution, refuse transparency, quantise L.
 *
 * Dimensions come from the header, never the filename (`CONVENTIONS.md`: 719 AVIFs in the corpus
 * disagree with their own names). A genuinely transparent pixel is refused rather than flattened onto
 * an invented matte (`PHASE_0_DECISIONS.md` §4 invariant 5); an alpha channel that is uniformly
 * opaque is not transparency.
 *
 * The 8-bit sRGB → OKLab L map is tabulated over the 16.7M possible triples lazily, per distinct
 * colour, rather than per pixel: covers repeat colours heavily and the cube roots are the expensive
 * part of the pass.
 */
export async function decodeImage(imagePath: string): Promise<DecodedImage> {
	const image = sharp(imagePath)
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new TosCandidateError(`no header dimensions for ${imagePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new TosCandidateError(`unsupported channel count ${channels} for ${imagePath}`)
	}
	if (info.width !== metadata.width || info.height !== metadata.height) {
		throw new TosCandidateError(
			`decoder returned ${info.width}x${info.height} for ${imagePath} but the header says ${metadata.width}x${metadata.height}`,
		)
	}

	const pixelCount = info.width * info.height
	const packed = new Int32Array(pixelCount)
	const levels = new Int32Array(pixelCount)
	const levelOfColor = new Map<number, number>()

	for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += channels) {
		if (channels === 4 && data[offset + 3] !== 255) {
			throw new TosCandidateError(
				`${imagePath} has at least one transparent pixel; the contract refuses transparent input`,
			)
		}
		const color = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
		packed[pixel] = color
		let level = levelOfColor.get(color)
		if (level === undefined) {
			const lightness = rgbToOkLab(unpack(color))[0]
			const clamped = lightness < 0 ? 0 : lightness > 1 ? 1 : lightness
			level = Math.round(clamped * (L_LEVEL_COUNT - 1))
			levelOfColor.set(color, level)
		}
		levels[pixel] = level
	}

	return { width: info.width, height: info.height, format: metadata.format ?? "unknown", packed, levels }
}

// ---------------------------------------------------------------------------------------------
// Tree navigation helpers
// ---------------------------------------------------------------------------------------------

/** Children of every node, in increasing id order, as a compressed adjacency list. */
export type Children = Readonly<{ offsets: Int32Array; ids: Int32Array }>

export function childrenOf(tree: ShapeTree): Children {
	const counts = new Int32Array(tree.nodeCount)
	for (let nodeId = 1; nodeId < tree.nodeCount; nodeId += 1) counts[tree.nodeParent[nodeId]] += 1
	const offsets = new Int32Array(tree.nodeCount + 1)
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) offsets[nodeId + 1] = offsets[nodeId] + counts[nodeId]
	const cursor = offsets.slice(0, tree.nodeCount)
	const ids = new Int32Array(tree.nodeCount - 1 > 0 ? tree.nodeCount - 1 : 0)
	for (let nodeId = 1; nodeId < tree.nodeCount; nodeId += 1) {
		const parentId = tree.nodeParent[nodeId]
		ids[cursor[parentId]] = nodeId
		cursor[parentId] += 1
	}
	return { offsets, ids }
}

/** Euler-tour intervals, so "is m inside n's shape" is two comparisons rather than a walk. */
export function eulerTour(tree: ShapeTree, children: Children): Readonly<{ enter: Int32Array; exit: Int32Array }> {
	const enter = new Int32Array(tree.nodeCount)
	const exit = new Int32Array(tree.nodeCount)
	const stack = [tree.rootId]
	const cursor = children.offsets.slice(0, tree.nodeCount)
	let clock = 0
	enter[tree.rootId] = clock
	clock += 1
	while (stack.length > 0) {
		const nodeId = stack[stack.length - 1]
		if (cursor[nodeId] < children.offsets[nodeId + 1]) {
			const childId = children.ids[cursor[nodeId]]
			cursor[nodeId] += 1
			enter[childId] = clock
			clock += 1
			stack.push(childId)
		} else {
			exit[nodeId] = clock
			stack.pop()
		}
	}
	return { enter, exit }
}

// ---------------------------------------------------------------------------------------------
// Stability
// ---------------------------------------------------------------------------------------------

export type Stability = Readonly<{
	/** `|ΔA| / (A · Δλ)` against the nearest ancestor at least `STABILITY_WINDOW_LEVELS` away. */
	growth: Float64Array
	/** The retained node ids, ascending. Local minima of `growth` along a branch, above the grain. */
	retained: number[]
	/** For every node, the nearest retained ancestor-or-self. */
	retainedAncestor: Int32Array
}>

/**
 * MSER-style stability (arm-b′ §2.2): keep the nodes whose area barely changes as the level moves.
 *
 * A node's area derivative is measured against the nearest ancestor at least one same-colour bar away
 * in level units — `STABILITY_WINDOW_LEVELS`, which is the bar and not a free number. A node is
 * retained when its growth is a **local minimum** along its branch: no worse than its parent's and no
 * worse than its main child's, where the main child is the largest by shape area (ties: lower id,
 * which is the flood order, which is the raster scan). The root is always retained — it is the image
 * rectangle and something has to be.
 *
 * Two nodes whose shapes have the same area are the same region named twice; the deeper one is
 * dropped so the retained set is a set of distinct regions.
 */
export function selectStableNodes(tree: ShapeTree, children: Children): Stability {
	const totalArea = tree.width * tree.height
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalArea))

	const growth = new Float64Array(tree.nodeCount)
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		const area = tree.nodeSubtreeArea[nodeId]
		if (area === 0) {
			growth[nodeId] = Number.POSITIVE_INFINITY
			continue
		}
		let ancestor = nodeId
		let span = 0
		while (ancestor !== tree.rootId && span < STABILITY_WINDOW_LEVELS) {
			ancestor = tree.nodeParent[ancestor]
			span = Math.abs(tree.nodeLevel[ancestor] - tree.nodeLevel[nodeId])
		}
		const window = Math.max(span, 1)
		growth[nodeId] = Math.abs(tree.nodeSubtreeArea[ancestor] - area) / (area * window)
	}

	const mainChild = new Int32Array(tree.nodeCount).fill(-1)
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		let best = -1
		for (let index = children.offsets[nodeId]; index < children.offsets[nodeId + 1]; index += 1) {
			const childId = children.ids[index]
			if (best === -1 || tree.nodeSubtreeArea[childId] > tree.nodeSubtreeArea[best]) best = childId
		}
		mainChild[nodeId] = best
	}

	const retained: number[] = []
	const isRetained = new Uint8Array(tree.nodeCount)
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		if (nodeId === tree.rootId) {
			isRetained[nodeId] = 1
			retained.push(nodeId)
			continue
		}
		if (tree.nodeSubtreeArea[nodeId] < areaFloor) continue
		const parentId = tree.nodeParent[nodeId]
		if (growth[nodeId] > growth[parentId]) continue
		const childId = mainChild[nodeId]
		if (childId !== -1 && tree.nodeSubtreeArea[childId] >= areaFloor && growth[nodeId] > growth[childId]) continue
		isRetained[nodeId] = 1
		retained.push(nodeId)
	}

	// Drop a retained node whose shape has the same area as its nearest retained ancestor's: same
	// pixel set, because a child's shape is contained in its parent's.
	const retainedAncestor = new Int32Array(tree.nodeCount)
	retainedAncestor[tree.rootId] = tree.rootId
	const survivors: number[] = []
	for (const nodeId of retained) {
		if (nodeId === tree.rootId) {
			survivors.push(nodeId)
			continue
		}
		let ancestor = tree.nodeParent[nodeId]
		while (isRetained[ancestor] === 0) ancestor = tree.nodeParent[ancestor]
		if (tree.nodeSubtreeArea[ancestor] === tree.nodeSubtreeArea[nodeId]) {
			isRetained[nodeId] = 0
			continue
		}
		survivors.push(nodeId)
	}
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		retainedAncestor[nodeId] = isRetained[nodeId] === 1 ? nodeId : retainedAncestor[tree.nodeParent[nodeId]]
	}

	return { growth, retained: survivors, retainedAncestor }
}

// ---------------------------------------------------------------------------------------------
// The representative colour of a node
// ---------------------------------------------------------------------------------------------

/** A node's colours: distinct exact triples with their pixel counts, sorted by packed value. */
export type ColorCloud = Readonly<{ colors: Int32Array; counts: Int32Array; total: number }>

export function cloudFromCounts(counts: Map<number, number>): ColorCloud {
	const colors = Int32Array.from(counts.keys()).sort()
	const tallies = new Int32Array(colors.length)
	let total = 0
	for (let index = 0; index < colors.length; index += 1) {
		const count = counts.get(colors[index]) ?? 0
		tallies[index] = count
		total += count
	}
	return { colors, counts: tallies, total }
}

/**
 * **The representative colour, by the spec's one rule for both P2 pipelines.**
 *
 * Bar-density mode: find the OKLab location that maximises the node's colour mass within one
 * same-colour bar, take the mean of the node's pixels within one bar of it, and publish the exact
 * triple in the node nearest that mean.
 *
 * Three details, all of them determinism:
 *
 *  - **The candidate locations are the node's own triples**, not the cells of a lattice. A lattice
 *    would put a bin edge back into a design whose whole robustness argument is that it has none.
 *  - **Mass is summed under `sameColorBar()`**, the contract's regional bar for that specific pair —
 *    the one ruler, no second radius. A uniform OKLab grid at `LARGEST_SAME_COLOR_BAR` is used only
 *    to *find* the neighbours to test; it is an index, and every pair it returns is still measured.
 *  - **Ties break on lexicographic RGB** at every step.
 *
 * This is `SPEC.md`'s rule and it **overrides arm-b′ §2.3's depth-weighted modal triple**, which
 * weights each pixel by its normalised distance to the node's complement. The deviation is recorded
 * in `NOTES.md`: the spec fixes one rule across both P2 pipelines so the two differ in their trees
 * and not in their colour-picking, which is the comparison cycle 1 is set up to make.
 */
export function representativeColor(cloud: ColorCloud): Rgb8 {
	if (cloud.colors.length === 0) throw new TosCandidateError("a node with no pixels has no representative colour")
	if (cloud.colors.length === 1) return unpack(cloud.colors[0])

	const labs = new Float64Array(cloud.colors.length * 3)
	for (let index = 0; index < cloud.colors.length; index += 1) {
		const lab = rgbToOkLab(unpack(cloud.colors[index]))
		labs[index * 3] = lab[0]
		labs[index * 3 + 1] = lab[1]
		labs[index * 3 + 2] = lab[2]
	}
	const labAt = (index: number): OkLab => [labs[index * 3], labs[index * 3 + 1], labs[index * 3 + 2]]

	// A uniform OKLab grid whose cell is the loosest measured bar, so every pair that could be within
	// *any* region's bar is in one of the 27 cells around the candidate. Lookup only.
	const cell = LARGEST_SAME_COLOR_BAR
	const buckets = new Map<string, number[]>()
	const keyOf = (lab: OkLab): string =>
		`${Math.floor(lab[0] / cell)},${Math.floor(lab[1] / cell)},${Math.floor(lab[2] / cell)}`
	for (let index = 0; index < cloud.colors.length; index += 1) {
		const key = keyOf(labAt(index))
		const bucket = buckets.get(key)
		if (bucket === undefined) buckets.set(key, [index])
		else bucket.push(index)
	}
	const neighboursOf = (lab: OkLab): number[] => {
		const baseL = Math.floor(lab[0] / cell)
		const baseA = Math.floor(lab[1] / cell)
		const baseB = Math.floor(lab[2] / cell)
		const found: number[] = []
		for (let dl = -1; dl <= 1; dl += 1) {
			for (let da = -1; da <= 1; da += 1) {
				for (let db = -1; db <= 1; db += 1) {
					const bucket = buckets.get(`${baseL + dl},${baseA + da},${baseB + db}`)
					if (bucket !== undefined) found.push(...bucket)
				}
			}
		}
		return found
	}

	// Candidate locations: the most populous triples first, truncated for cost. Ties on count go to
	// the lexicographically smaller RGB, which is the ascending packed order the cloud is already in.
	const candidates = Array.from({ length: cloud.colors.length }, (_unused, index) => index)
	candidates.sort((first, second) => cloud.counts[second] - cloud.counts[first] || cloud.colors[first] - cloud.colors[second])
	const considered = candidates.slice(0, REPR_CANDIDATE_LIMIT)

	const colorOf = (index: number): PaletteColor => colorFromRgb(unpack(cloud.colors[index]))
	let bestIndex = considered[0]
	let bestMass = -1
	for (const index of considered) {
		const lab = labAt(index)
		const color = colorOf(index)
		let mass = 0
		for (const other of neighboursOf(lab)) {
			if (okLabDistance(lab, labAt(other)) < sameColorBar(color, colorOf(other))) mass += cloud.counts[other]
		}
		if (mass > bestMass || (mass === bestMass && cloud.colors[index] < cloud.colors[bestIndex])) {
			bestMass = mass
			bestIndex = index
		}
	}

	// The mean of the node's pixels within one bar of the mode.
	const modeLab = labAt(bestIndex)
	const modeColor = colorOf(bestIndex)
	let weight = 0
	let meanL = 0
	let meanA = 0
	let meanB = 0
	for (const other of neighboursOf(modeLab)) {
		if (okLabDistance(modeLab, labAt(other)) >= sameColorBar(modeColor, colorOf(other))) continue
		const count = cloud.counts[other]
		weight += count
		meanL += labs[other * 3] * count
		meanA += labs[other * 3 + 1] * count
		meanB += labs[other * 3 + 2] * count
	}
	if (weight === 0) return unpack(cloud.colors[bestIndex])
	const mean: OkLab = [meanL / weight, meanA / weight, meanB / weight]

	// The exact triple in the node nearest that mean. Never a colour the node does not contain.
	let nearest = 0
	let nearestDistance = Number.POSITIVE_INFINITY
	for (let index = 0; index < cloud.colors.length; index += 1) {
		const distance = okLabDistance(mean, labAt(index))
		if (distance < nearestDistance || (distance === nearestDistance && cloud.colors[index] < cloud.colors[nearest])) {
			nearestDistance = distance
			nearest = index
		}
	}
	return unpack(cloud.colors[nearest])
}

// ---------------------------------------------------------------------------------------------
// Inradius, for thinness
// ---------------------------------------------------------------------------------------------

/**
 * Felzenszwalb–Huttenlocher exact squared distance transform, one dimension, in place.
 *
 * The lower envelope of the parabolas `(q - p)² + f(p)`, computed in linear time. `vertices` holds
 * the parabolas currently on the envelope and `boundaries` the crossings between them.
 */
function distanceTransform1d(source: Float64Array, length: number, stride: number, offset: number, scratch: Float64Array): void {
	const vertices = new Int32Array(length)
	const boundaries = new Float64Array(length + 1)
	const at = (index: number): number => source[offset + index * stride]
	let k = 0
	vertices[0] = 0
	boundaries[0] = Number.NEGATIVE_INFINITY
	boundaries[1] = Number.POSITIVE_INFINITY
	for (let q = 1; q < length; q += 1) {
		let crossing = (at(q) + q * q - (at(vertices[k]) + vertices[k] * vertices[k])) / (2 * q - 2 * vertices[k])
		while (crossing <= boundaries[k]) {
			k -= 1
			crossing = (at(q) + q * q - (at(vertices[k]) + vertices[k] * vertices[k])) / (2 * q - 2 * vertices[k])
		}
		k += 1
		vertices[k] = q
		boundaries[k] = crossing
		boundaries[k + 1] = Number.POSITIVE_INFINITY
	}
	k = 0
	for (let q = 0; q < length; q += 1) {
		while (boundaries[k + 1] < q) k += 1
		const p = vertices[k]
		scratch[q] = (q - p) * (q - p) + at(p)
	}
	for (let q = 0; q < length; q += 1) source[offset + q * stride] = scratch[q]
}

/**
 * The largest inscribed radius of a mask, in pixels, from an exact Euclidean distance transform.
 *
 * The mask is padded by one so the frame counts as outside — a region touching the image edge should
 * not be credited with unbounded thickness.
 */
export function inradiusOf(mask: Uint8Array, width: number, height: number): number {
	const paddedWidth = width + 2
	const paddedHeight = height + 2
	const field = new Float64Array(paddedWidth * paddedHeight)
	const far = (paddedWidth + paddedHeight) ** 2
	for (let y = 0; y < paddedHeight; y += 1) {
		for (let x = 0; x < paddedWidth; x += 1) {
			const inside = y > 0 && x > 0 && y <= height && x <= width && mask[(y - 1) * width + (x - 1)] === 1
			field[y * paddedWidth + x] = inside ? far : 0
		}
	}
	const scratch = new Float64Array(Math.max(paddedWidth, paddedHeight))
	for (let x = 0; x < paddedWidth; x += 1) distanceTransform1d(field, paddedHeight, paddedWidth, x, scratch)
	for (let y = 0; y < paddedHeight; y += 1) distanceTransform1d(field, paddedWidth, 1, y * paddedWidth, scratch)
	let best = 0
	for (let index = 0; index < field.length; index += 1) if (field[index] > best) best = field[index]
	return Math.sqrt(best)
}

// ---------------------------------------------------------------------------------------------
// The parse
// ---------------------------------------------------------------------------------------------

export type FieldVerdict = "flat" | "laminar" | "partitioned" | "textured" | "unreadable"

export type ParsedNode = {
	readonly id: number
	readonly parent: number
	readonly treeNodeId: number
	readonly depth: number
	readonly level: number
	readonly areaFraction: number
	readonly ownAreaFraction: number
	readonly centroidX: number
	readonly centroidY: number
	readonly growth: number
	/** `inradius / √area`, from an exact distance transform. Computed for marks only. */
	thinness: number | null
	readonly repr: Rgb8
	readonly kind: "field" | "mark"
}

export type Parse = Readonly<{
	width: number
	height: number
	verdict: FieldVerdict
	/** Normalised straight-line residual of the ground chain's centroid trajectory, or null. */
	laminarity: number | null
	/** The ground chain's parsed-node ids, outermost first. */
	groundChain: number[]
	coverage: number
	nodes: ParsedNode[]
	roles: Readonly<{ background: Rgb8; surface: Rgb8; foreground: Rgb8; accent: Rgb8 }>
	/** Foreground candidates, best first — the ranking a repair walks down (arm-b′ §2.7). */
	foregroundPool: readonly Rgb8[]
	/** Accent candidates, best first, under the accent ordering rather than the text-ness one. */
	accentPool: readonly Rgb8[]
	/** True when the field reads as one continuous ramp between the two chain ends. */
	gradient: boolean
	notes: string[]
}>

function collinearityResidual(
	points: readonly (readonly [number, number])[],
): { residual: number; length: number; monotonicity: number } {
	if (points.length < 2) return { residual: 0, length: 0, monotonicity: 1 }
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
	// Total-least-squares direction: the principal eigenvector of the scatter matrix.
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
	const projections: number[] = []
	for (const [x, y] of points) {
		const dx = x - meanX
		const dy = y - meanY
		const along = dx * dirX + dy * dirY
		const across = dx * -dirY + dy * dirX
		squared += across * across
		projections.push(along)
	}
	const residual = Math.sqrt(squared / points.length)
	const length = Math.max(...projections) - Math.min(...projections)
	// Monotonicity as a ratio, not a predicate: net travel along the fitted direction over total
	// travel. A strictly monotone walk scores 1; a walk that doubles back as much as it advances
	// scores 0. See `MONOTONE_MIGRATION_FRACTION` for why this is not the literal test arm-b′ words.
	let net = 0
	let total = 0
	for (let index = 1; index < projections.length; index += 1) {
		const step = projections[index] - projections[index - 1]
		net += step
		total += Math.abs(step)
	}
	return { residual, length, monotonicity: total > 0 ? Math.abs(net) / total : 1 }
}

/** Everything the pipeline knows about one image. */
export type PipelineResult = Readonly<{ image: DecodedImage; tree: ShapeTree; parse: Parse }>

export function parseTree(image: DecodedImage, tree: ShapeTree): Parse {
	const totalArea = image.width * image.height
	const children = childrenOf(tree)
	const stability = selectStableNodes(tree, children)
	const tour = eulerTour(tree, children)
	const notes: string[] = []

	// Colour clouds. Own pixels first — a field's own pixels are the field minus the marks on it,
	// which is exactly the colour a person would name. A node with no own pixels (a pure branch point)
	// falls back to its whole shape, which is the only honest answer available.
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

	const nodes: ParsedNode[] = stability.retained.map((treeNodeId, index) => {
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
			repr: representativeColor(cloud),
			kind: areaFraction >= FIELD_AREA_FRACTION ? "field" : "mark",
		}
	})

	// ---- the ground stack -------------------------------------------------------------------
	const parsedChildren: number[][] = nodes.map(() => [])
	for (const node of nodes) if (node.parent >= 0) parsedChildren[node.parent].push(node.id)

	const groundChain: number[] = [0]
	while (true) {
		const current = groundChain[groundChain.length - 1]
		let best = -1
		for (const childId of parsedChildren[current]) {
			if (nodes[childId].areaFraction < FIELD_AREA_FRACTION) continue
			if (best === -1 || nodes[childId].areaFraction > nodes[best].areaFraction) best = childId
		}
		if (best === -1) break
		groundChain.push(best)
	}

	// **Coverage**: the fraction of the image the retained nodes' representative colours actually
	// explain — a pixel counts as explained when its own colour is the same colour, by the contract's
	// bar, as the representative of the deepest retained node containing it. arm-b′ §2.5 says
	// `unreadable` is "retained nodes explain a small fraction of the image area" and does not say how
	// to measure "explain"; this is the reading that makes a flat cover fully explained (the root's own
	// colour is every pixel's colour) and a photographic one poorly explained, which is the
	// distinction the verdict is for.
	const colorCache = new Map<number, PaletteColor>()
	const colorFor = (packed: number): PaletteColor => {
		let color = colorCache.get(packed)
		if (color === undefined) {
			color = colorFromRgb(unpack(packed))
			colorCache.set(packed, color)
		}
		return color
	}
	const packOf = (rgb: Rgb8): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
	const labCache = new Map<number, OkLab>()
	const labFor = (packed: number): OkLab => {
		let lab = labCache.get(packed)
		if (lab === undefined) {
			lab = rgbToOkLab(unpack(packed))
			labCache.set(packed, lab)
		}
		return lab
	}
	let explainedPixels = 0
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		const holder = retainedIndexOf.get(stability.retainedAncestor[tree.nodeOfPixel[pixel]])
		if (holder === undefined) continue
		const color = image.packed[pixel]
		const reprPacked = packOf(nodes[holder].repr)
		const bar = sameColorBar(colorFor(color), colorFor(reprPacked))
		if (okLabDistance(labFor(color), labFor(reprPacked)) < bar) explainedPixels += 1
	}
	const coverage = explainedPixels / totalArea

	const chainCentroids = groundChain.map((id) => [nodes[id].centroidX, nodes[id].centroidY] as const)
	const geometry = collinearityResidual(chainCentroids)
	const laminarity = geometry.length > 0 ? geometry.residual / geometry.length : null

	const endsA = nodes[groundChain[0]]
	const endsB = nodes[groundChain[groundChain.length - 1]]
	const colorA = colorFromRgb(endsA.repr)
	const colorB = colorFromRgb(endsB.repr)
	const endsDistinct = okLabDistance(rgbToOkLab(endsA.repr), rgbToOkLab(endsB.repr)) >= sameColorBar(colorA, colorB)

	const fieldSiblings = parsedChildren[0].filter((id) => nodes[id].areaFraction >= FIELD_AREA_FRACTION)
	const laminarShape =
		groundChain.length >= MIN_LAMINAR_CHAIN_LENGTH &&
		laminarity !== null &&
		laminarity <= LAMINARITY_CUT &&
		geometry.monotonicity >= MONOTONE_MIGRATION_FRACTION

	let verdict: FieldVerdict
	if (coverage < UNREADABLE_COVERAGE_FRACTION) verdict = "unreadable"
	else if (!endsDistinct && !laminarShape) verdict = "flat"
	else if (laminarShape && endsDistinct) verdict = "laminar"
	else if (fieldSiblings.length >= 2) verdict = "partitioned"
	else if (endsDistinct) verdict = "partitioned"
	else verdict = "textured"

	// ---- background and surface ---------------------------------------------------------------
	let background: Rgb8
	let surface: Rgb8
	let gradient = false
	if (verdict === "laminar") {
		// The consumer draws `linear-gradient(135deg in oklab, …)`, whose first stop sits at the
		// top-left. Project each end's centroid onto that axis; the smaller projection is stop 0,
		// which the contract says *is* the background.
		const projectionA = endsA.centroidX * RENDER_AXIS_UNIT[0] + endsA.centroidY * RENDER_AXIS_UNIT[1]
		const projectionB = endsB.centroidX * RENDER_AXIS_UNIT[0] + endsB.centroidY * RENDER_AXIS_UNIT[1]
		let firstIsA = projectionA < projectionB
		if (projectionA === projectionB) {
			// Declared tie-break chain, arm-b′ §2.6: larger area, then lower lightness.
			firstIsA =
				endsA.areaFraction > endsB.areaFraction ||
				(endsA.areaFraction === endsB.areaFraction && rgbToOkLab(endsA.repr)[0] < rgbToOkLab(endsB.repr)[0])
		}
		background = firstIsA ? endsA.repr : endsB.repr
		surface = firstIsA ? endsB.repr : endsA.repr
		gradient = true
	} else if (verdict === "partitioned") {
		const ranked = (fieldSiblings.length >= 2 ? fieldSiblings.map((id) => nodes[id]) : [endsA, endsB]).slice()
		ranked.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		background = ranked[0].repr
		surface = ranked.length > 1 ? ranked[1].repr : ranked[0].repr
	} else if (verdict === "flat") {
		background = endsB.repr
		surface = endsB.repr
	} else {
		// textured / unreadable — arm-b′ §2.7: the root's retained children, ranked by area. Still
		// nodes, still exact interiors, never a second algorithm.
		const fallback = parsedChildren[0].map((id) => nodes[id]).slice()
		fallback.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		background = fallback.length > 0 ? fallback[0].repr : nodes[0].repr
		surface = fallback.length > 1 ? fallback[1].repr : background
		notes.push(`fallback-field-roles:${verdict}`)
	}
	if (colorFromRgb(background).hex === colorFromRgb(surface).hex) gradient = false

	// ---- marks, clusters, foreground and accent ------------------------------------------------
	const chainSet = new Set(groundChain)
	const marks = nodes
		.filter((node) => node.kind === "mark" && !chainSet.has(node.id))
		.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		.slice(0, MARK_NODE_LIMIT)

	for (const mark of marks) {
		const treeNodeId = mark.treeNodeId
		const minX = tree.nodeMinX[treeNodeId]
		const minY = tree.nodeMinY[treeNodeId]
		const boxWidth = tree.nodeMaxX[treeNodeId] - minX + 1
		const boxHeight = tree.nodeMaxY[treeNodeId] - minY + 1
		if (boxWidth <= 0 || boxHeight <= 0) continue
		const mask = new Uint8Array(boxWidth * boxHeight)
		for (let y = 0; y < boxHeight; y += 1) {
			for (let x = 0; x < boxWidth; x += 1) {
				const owner = tree.nodeOfPixel[(minY + y) * image.width + (minX + x)]
				const inside = tour.enter[treeNodeId] <= tour.enter[owner] && tour.enter[owner] < tour.exit[treeNodeId]
				if (inside) mask[y * boxWidth + x] = 1
			}
		}
		const inradius = inradiusOf(mask, boxWidth, boxHeight)
		const area = tree.nodeSubtreeArea[treeNodeId]
		mark.thinness = area > 0 ? inradius / Math.sqrt(area) : null
	}

	// Clusters: marks whose representative colours are the same colour by the contract's own bar.
	// Union-find over an ascending scan, so the clustering is a function of node id and of nothing else.
	const parentOf = marks.map((_unused, index) => index)
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
	for (let first = 0; first < marks.length; first += 1) {
		for (let second = first + 1; second < marks.length; second += 1) {
			const one = colorFromRgb(marks[first].repr)
			const other = colorFromRgb(marks[second].repr)
			if (okLabDistance(rgbToOkLab(marks[first].repr), rgbToOkLab(marks[second].repr)) < sameColorBar(one, other)) {
				const rootFirst = find(first)
				const rootSecond = find(second)
				if (rootFirst !== rootSecond) parentOf[Math.max(rootFirst, rootSecond)] = Math.min(rootFirst, rootSecond)
			}
		}
	}
	const clusterOf = new Map<number, number[]>()
	for (let index = 0; index < marks.length; index += 1) {
		const root = find(index)
		const bucket = clusterOf.get(root)
		if (bucket === undefined) clusterOf.set(root, [index])
		else bucket.push(index)
	}
	const clusters = Array.from(clusterOf.keys())
		.sort((first, second) => first - second)
		.map((root) => {
			const members = (clusterOf.get(root) ?? []).slice().sort((first, second) => first - second)
			const thicknesses = members.map((index) => marks[index].thinness).filter((value): value is number => value !== null)
			const thinness = thicknesses.length > 0 ? thicknesses.reduce((sum, value) => sum + value, 0) / thicknesses.length : 1
			const geometryOfCluster = collinearityResidual(members.map((index) => [marks[index].centroidX, marks[index].centroidY] as const))
			const collinearity = geometryOfCluster.length > 0 ? geometryOfCluster.residual / geometryOfCluster.length : 1
			const largest = members.slice().sort((first, second) => marks[second].areaFraction - marks[first].areaFraction || first - second)[0]
			return {
				members,
				thinness,
				count: members.length,
				collinearity,
				areaFraction: members.reduce((sum, index) => sum + marks[index].areaFraction, 0),
				repr: marks[largest].repr,
				firstMarkId: marks[members[0]].id,
			}
		})

	// arm-b′ §2.6: ranked lexicographically — thinness, then member count, then centroid collinearity.
	// No weighted score, therefore no mixing weights to tune.
	clusters.sort(
		(first, second) =>
			first.thinness - second.thinness ||
			second.count - first.count ||
			first.collinearity - second.collinearity ||
			second.areaFraction - first.areaFraction ||
			first.firstMarkId - second.firstMarkId,
	)

	// ---- the ordered pools the roles are drawn from --------------------------------------------
	//
	// **The parse publishes rankings, not just winners.** arm-b′ §2.7: "a violated invariant at
	// assembly is repaired by taking the next item in the same ranking, never by inventing or
	// adjusting a colour", and "the whole palette is re-validated after it". The contract adapter
	// (`candidate.ts`) does the walking; the ordering is decided here, once, and is the same ordering
	// whether or not a repair ever happens.
	const backgroundLab = rgbToOkLab(background)
	const chromaFromField = (color: Rgb8): number => {
		const lab = rgbToOkLab(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
	const lightnessMove = (color: Rgb8): number => Math.abs(rgbToOkLab(color)[0] - backgroundLab[0])

	// The residual, treated as one node (arm-b′ §2.7): the image's own sufficiently common exact
	// triples, ranked by APCA against the background. It is the whole of both rankings when there is no
	// mark population at all, and their tail otherwise, so a degradation always has somewhere to go and
	// never has to reach for a colour the artwork does not contain.
	const wholeImage = new Map<number, number>()
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		wholeImage.set(image.packed[pixel], (wholeImage.get(image.packed[pixel]) ?? 0) + 1)
	}
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalArea))
	const commonEnough = Array.from(wholeImage.entries())
		.filter(([, count]) => count >= areaFloor)
		.map(([color]) => color)
	const residualPool = (commonEnough.length > 0 ? commonEnough : Array.from(wholeImage.keys()))
		.sort((first, second) => {
			const difference = Math.abs(apcaRaw(unpack(second), background)) - Math.abs(apcaRaw(unpack(first), background))
			return difference !== 0 ? difference : first - second
		})
		.slice(0, RESIDUAL_POOL_SIZE)
		.map(unpack)
	if (clusters.length === 0) notes.push("no-mark-clusters:residual-degradation")

	const dedupe = (colors: readonly Rgb8[]): Rgb8[] => {
		const seenColors = new Set<number>()
		const kept: Rgb8[] = []
		for (const color of colors) {
			const packed = (color[0] << 16) | (color[1] << 8) | color[2]
			if (seenColors.has(packed)) continue
			seenColors.add(packed)
			kept.push(color)
		}
		return kept
	}

	// Foreground: the clusters in the text-ness ranking already computed above, then the residual.
	const foregroundPool = dedupe([...clusters.map((cluster) => cluster.repr), ...residualPool])
	// Accent: the clusters re-ranked by chromatic distance from the field with lightness movement as
	// the tie-break — `perception-4`'s direction, taken as a direction and never as a coefficient.
	const accentPool = dedupe([
		...clusters
			.slice()
			.sort(
				(first, second) =>
					chromaFromField(second.repr) - chromaFromField(first.repr) ||
					lightnessMove(second.repr) - lightnessMove(first.repr) ||
					first.firstMarkId - second.firstMarkId,
			)
			.map((cluster) => cluster.repr),
		...residualPool,
	])

	const foreground = foregroundPool.length > 0 ? foregroundPool[0] : background
	// The accent collapses to the foreground, exactly, when nothing clears the contract's own
	// foreground/accent separation. That constant is consumed, not re-derived: it is what invariant 3
	// enforces, so choosing an accent under a *tighter* rule would publish palettes the contract then
	// refuses — which is how the first run of this prototype failed 7 of 20.
	const accent =
		accentPool.find(
			(color) => okLabDistance(rgbToOkLab(color), rgbToOkLab(foreground)) >= FOREGROUND_ACCENT_SEPARATION_DISTANCE,
		) ?? foreground

	return {
		width: image.width,
		height: image.height,
		verdict,
		laminarity,
		groundChain,
		coverage,
		nodes,
		roles: { background, surface, foreground, accent },
		foregroundPool,
		accentPool,
		gradient,
		notes,
	}
}

/** Decode, build, filter, parse. The whole pipeline for one image. */
export async function runPipeline(imagePath: string): Promise<PipelineResult> {
	const image = await decodeImage(imagePath)
	const tree = buildTreeOfShapes(image.levels, image.width, image.height, L_LEVEL_COUNT)
	const parse = parseTree(image, tree)
	return { image, tree, parse }
}
