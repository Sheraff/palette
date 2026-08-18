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
	MIN_LAMINAR_CHAIN_LENGTH,
	MIN_NODE_AREA_FRACTION,
	MONOTONE_MIGRATION_FRACTION,
	RESIDUAL_POOL_SIZE,
	RENDER_AXIS_UNIT,
	REPR_CANDIDATE_LIMIT,
	STABILITY_WINDOW_LEVELS,
	UNREADABLE_COVERAGE_FRACTION,
} from "./constants.ts"
import { ACCENT_CANDIDATE_LIMIT } from "./lanes/constants.ts"
import { mergeCoincidentComponents, type CoincidenceCandidate } from "./roles/coincidence.ts"
import { COMPONENT_CHAIN_AREA_AGREEMENT, TEXT_COMPONENT_LIMIT } from "./roles/constants.ts"
import { boundaryTracingLevel, hasInteriorPixel, identityEligibilityLevel } from "./roles/eligibility.ts"
import {
	RAW_APCA_INDIFFERENCE,
	areaFractionBand,
	colorQuantityBand,
	extremalMember,
	indifferenceClasses,
	ramPolarityAIsBackground,
	stableCut,
} from "./roles/indifference.ts"
import { minFieldContrast, rankByFieldContrast, renderedFieldOf } from "./roles/rank.ts"
import { findTextGroups, lowerMedian, strokeWidthFromDistanceField, type TextComponent, type TextGroup } from "./roles/text.ts"
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

/** A mask's exact squared Euclidean distance transform, over the mask padded by one on every side. */
export type DistanceField = Readonly<{ squared: Float64Array; width: number; height: number }>

/**
 * The exact squared Euclidean distance transform of a mask, padded by one on every side.
 *
 * The padding is what makes the frame count as outside: a region touching the image edge must not be
 * credited with unbounded thickness. Squared distances, because that is what the
 * Felzenszwalb–Huttenlocher pass produces and every consumer here either compares them (the ridge
 * test, which is monotone in the square) or takes one square root at the end.
 *
 * **One transform, two answers.** Cycle 2 needs both the inradius (thinness, arm-b′ §2.6) and the
 * median ridge distance (stroke width, arm-b §2.4) for every component. They are two readings of the
 * same field, and computing the field once is the difference between one distance transform per
 * component and two.
 */
export function distanceFieldOf(mask: Uint8Array, width: number, height: number): DistanceField {
	const paddedWidth = width + 2
	const paddedHeight = height + 2
	const squared = new Float64Array(paddedWidth * paddedHeight)
	const far = (paddedWidth + paddedHeight) ** 2
	for (let y = 0; y < paddedHeight; y += 1) {
		for (let x = 0; x < paddedWidth; x += 1) {
			const inside = y > 0 && x > 0 && y <= height && x <= width && mask[(y - 1) * width + (x - 1)] === 1
			squared[y * paddedWidth + x] = inside ? far : 0
		}
	}
	const scratch = new Float64Array(Math.max(paddedWidth, paddedHeight))
	for (let x = 0; x < paddedWidth; x += 1) distanceTransform1d(squared, paddedHeight, paddedWidth, x, scratch)
	for (let y = 0; y < paddedHeight; y += 1) distanceTransform1d(squared, paddedWidth, 1, y * paddedWidth, scratch)
	return { squared, width: paddedWidth, height: paddedHeight }
}

/**
 * The largest inscribed radius of a mask, in pixels, from an exact Euclidean distance transform.
 */
export function inradiusOf(mask: Uint8Array, width: number, height: number): number {
	return inradiusFromDistanceField(distanceFieldOf(mask, width, height))
}

/** The inradius read off an already-computed distance field. */
export function inradiusFromDistanceField(field: DistanceField): number {
	let best = 0
	for (let index = 0; index < field.squared.length; index += 1) if (field.squared[index] > best) best = field.squared[index]
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
	/** `inradius / √area`, from an exact distance transform. Computed for components only. */
	thinness: number | null
	/** Twice the median ridge distance of the node's mask, in pixels. Components only (arm-b §2.4). */
	strokeWidth: number | null
	readonly repr: Rgb8
	readonly kind: "field" | "mark"
}

/** What the parse says about one text-shaped group, for the dump and for a regression test to read. */
export type ParsedTextGroup = Readonly<{
	/**
	 * Every parsed node behind the coherent components, ascending — across every lane.
	 *
	 * **This is not the component count.** Since D12's coincidence merge (`roles/coincidence.ts`) a
	 * component is one *physical region*, which several lanes may each have named; all of those namings
	 * are here, because they are what says which lane carried the group (D2's evidence). Use
	 * `componentCount` for the number `TEXT_MIN_COMPONENTS` is compared against.
	 */
	nodeIds: readonly number[]
	/** How many distinct physical regions the group is made of — the count that decides text-ness. */
	componentCount: number
	rows: number
	areaFraction: number
	repr: Rgb8
	/** Minimum |raw APCA| of `repr` over the whole rendered field. */
	fieldContrast: number
}>

/**
 * One lane's contribution to the shared node pool — the shape `lanes/nodes.ts` already produces.
 *
 * Declared **structurally** rather than imported so that `pipeline.ts` never depends on `lanes/`: the
 * lane builder imports this module, and an import back would close a cycle for no gain.
 */
export type LaneInputNode = Readonly<{
	id: number
	parent: number
	treeNodeId: number
	depth: number
	level: number
	areaFraction: number
	ownAreaFraction: number
	centroidX: number
	centroidY: number
	growth: number
	repr: Rgb8
	kind: "field" | "mark"
}>

/** A built lane: the tree it came from, and its retained nodes in that lane's own id space. */
export type LaneInput = Readonly<{ lane: string; tree: ShapeTree; nodes: readonly LaneInputNode[] }>

/**
 * One accent candidate, with every quantity the ordering *could* have used, whether or not it did.
 *
 * D1 ruled the accent order back to chroma-first; the APCA measurement W-F's rewrite ranked on is still
 * computed and published here, per candidate, so the coming round can price the exchange rate on real
 * numbers rather than on a re-run. Reported, never ordered on.
 */
export type AccentCandidate = Readonly<{
	repr: Rgb8
	/** Which lane's tree the leading node came from: 0 = L, then `LaneInput` order. */
	laneIndex: number
	/** The parsed node id of the cluster's first member. */
	nodeId: number
	/** OKLab chromatic distance from the published background. The D1 ranking key. */
	chromaFromField: number
	/** |ΔL| from the published background. The D1 tie-break. */
	lightnessMove: number
	/** Minimum |raw APCA| over the whole rendered field — W-F's key, reported only. */
	fieldContrast: number
	/** D3's eligibility level: 0 leads, 1 is an incidental node that may not lead. */
	stabilityLevel: number
	/**
	 * D12's eligibility level, and the one the accent order actually ranks on: 0 when a region behind
	 * this colour has an interior pixel, 1 when every one of them traces another region's boundary.
	 */
	tracingLevel: number
	/** The best (smallest) MSER growth rate among the cluster's nodes. */
	growth: number
}>

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
	/**
	 * The text-shaped groups arm-b §2.4 found, best first: total coherent area, then readability
	 * against the rendered field, then parsed node id. Their representatives lead `foregroundPool`.
	 */
	textGroups: readonly ParsedTextGroup[]
	/** Foreground candidates, best first — the ranking a repair walks down (arm-b′ §2.7). */
	foregroundPool: readonly Rgb8[]
	/** Accent candidates, best first, under the accent ordering rather than the text-ness one. */
	accentPool: readonly Rgb8[]
	/** Every clustered accent candidate with all four measurements, in the published order. */
	accentCandidates: readonly AccentCandidate[]
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

/**
 * **Chain collapse**, one lane at a time — the rule `roles/NOTES.md` calls cycle 2's most consequential
 * change, lifted out of the L lane so every lane gets it.
 *
 * A tree of shapes names one glyph once per quantised level between the level at which it separates
 * from its field and the level at which it is complete. A **component** is a candidate node with no
 * candidate strictly beneath it covering at least `COMPONENT_CHAIN_AREA_AGREEMENT` of its area — the
 * deepest node of each such chain. Chains never cross lanes, so the collapse cannot either: it is run
 * per lane, over that lane's own parent links, which is exactly what D2 asks for.
 *
 * Returns the surviving indices, ascending. `parentOfItem` is in the same index space as `items`, with
 * a negative entry for a root.
 */
function collapseChains(
	items: readonly ParsedNode[],
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

/**
 * Group colours the contract's one ruler calls the same colour — union-find over an ascending scan, so
 * the clustering is a function of the input order and of nothing else, and a merge always points the
 * higher root at the lower one.
 *
 * Returns each cluster's member indices ascending, clusters ordered by their lowest member. This is the
 * one place the bar decides membership, and it is **lane-agnostic on purpose**: arm-b §2.4's colour
 * clause is a statement about colours, and two marks that are the same colour are one candidate whether
 * a lightness tree or a chroma tree found them.
 */
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

/**
 * Parse one image's tree into a palette-shaped reading of it.
 *
 * `extraLanes` are the chromatic lanes' retained nodes (D2). With none, this is byte-for-byte the
 * L-only parse round 1 was judged on; with them, the a and b lanes' marks join the *same* pool the text
 * detector, the foreground ranking and the accent ranking all read — arm-b′ §2.6's "one pool, so there
 * is no lane that cannot reach a role". The **field** roles stay the L lane's alone: a ground stack is a
 * reading of lightness structure, and nothing in the chroma trees is a statement about it.
 */
export function parseTree(image: DecodedImage, tree: ShapeTree, extraLanes: readonly LaneInput[] = []): Parse {
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
			strokeWidth: null,
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
		// **Ground-chain end selection**, three levels, in `roles/indifference.ts`.
		//
		// Level 1 is the geometry and keeps priority: the consumer draws
		// `linear-gradient(135deg in oklab, …)` whose first stop sits at the top-left, so the end whose
		// centroid projects smaller onto that axis is stop 0, which the contract says *is* the
		// background. What changed in cycle 3 is that "smaller" is now measured **against a ruler** —
		// `NORMALISED_LENGTH_INDIFFERENCE`, the linear extent of the grain — instead of exactly, so a
		// sub-pixel centroid movement can no longer reverse the ramp.
		//
		// Level 2 is D10.2: when the projection is indifferent, the **lighter** end is the background.
		// Level 3 is arm-b′ §2.6's declared chain, unchanged.
		const projectionA = endsA.centroidX * RENDER_AXIS_UNIT[0] + endsA.centroidY * RENDER_AXIS_UNIT[1]
		const projectionB = endsB.centroidX * RENDER_AXIS_UNIT[0] + endsB.centroidY * RENDER_AXIS_UNIT[1]
		const polarity = ramPolarityAIsBackground({
			projectionA,
			projectionB,
			reprA: endsA.repr,
			reprB: endsB.repr,
			areaFractionA: endsA.areaFraction,
			areaFractionB: endsB.areaFraction,
		})
		notes.push(`ramp-polarity:${polarity.decidedBy}`)
		background = polarity.aIsBackground ? endsA.repr : endsB.repr
		surface = polarity.aIsBackground ? endsB.repr : endsA.repr
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

	// **The field pair's twin collapse** — the first of the four cells in `roles/assemble.ts`'s matrix,
	// and the one that has to happen here rather than at assembly, because the pools below are ranked
	// against the field that will actually be published.
	//
	// Round 1's forbidden outcome is a pair of indistinguishable roles. `surface` inside `background`'s
	// same-colour bar without being exactly equal is that pair, and it is the case cycle 1's assembly
	// could not repair at all: no choice of foreground fixes a defect in the field, so the walk
	// exhausted on every candidate and published the twin. `surfaceCollapsed` is the contract's
	// sanctioned answer, and it requires *exact* equality — invariant 3 refuses to let the flag launder
	// a near-identical pair — so the collapse assigns the identical triple.
	if (
		colorFromRgb(background).hex !== colorFromRgb(surface).hex &&
		okLabDistance(rgbToOkLab(background), rgbToOkLab(surface)) <
			sameColorBar(colorFromRgb(background), colorFromRgb(surface))
	) {
		notes.push("field-collapsed:same-color-bar")
		surface = background
	}
	if (colorFromRgb(background).hex === colorFromRgb(surface).hex) gradient = false

	// ---- the chromatic lanes, folded into one node id space --------------------------------------
	//
	// **D2** (`DECISIONS.md`): the a and b lanes' retained nodes join the **mark** population the whole
	// role stage reads, not the accent's alone. Cycle 2's first pass let the lanes reach one role because
	// grafting them into the foreground needed the component rule to run per lane, and that rule lives
	// here; it now does. An isoluminant mark therefore reaches the text detector and the foreground
	// ranking, and a region is invisible only when it matches its surround in L *and* a *and* b.
	//
	// **Ids.** The L lane keeps `0…nodes.length-1`, so `groundChain`, every `parent` and every id the
	// round-1 artefacts already carry are unchanged. Each extra lane is appended in `extraLanes` order
	// with its own parent links offset alongside, and its root re-parented onto the L root — the same
	// image rectangle at the same area fraction, so the dump stays one tree and the verifier's
	// `child.area ≤ parent.area` invariant holds by construction rather than by tolerance.
	const laneNodes: ParsedNode[][] = []
	{
		let cursor = nodes.length
		for (const lane of extraLanes) {
			const offset = cursor
			laneNodes.push(
				lane.nodes.map((node) => ({
					id: offset + node.id,
					parent: node.parent < 0 ? 0 : offset + node.parent,
					treeNodeId: node.treeNodeId,
					depth: node.depth,
					level: node.level,
					areaFraction: node.areaFraction,
					ownAreaFraction: node.ownAreaFraction,
					centroidX: node.centroidX,
					centroidY: node.centroidY,
					growth: node.growth,
					thinness: null,
					strokeWidth: null,
					repr: node.repr,
					kind: node.kind,
				})),
			)
			cursor += lane.nodes.length
		}
	}

	// ---- the shared mark pool, and the components inside it --------------------------------------
	//
	// **Two populations, and the difference between them is the whole of the chain-collapse rule.**
	//
	// `poolMarks` is every retained mark node of every lane: the pool arm-b′ §2.6 says all four roles are
	// ranked over. The **accent** ranks over it directly, and that is deliberate — a chain of nodes naming
	// one region at successive levels is folded by the same-colour clustering below, and nothing in the
	// accent's ordering is geometric, so the accent needs no component rule. Putting the accent behind
	// chain collapse costs exactly the recall round 1 asked for: on `…35b967964d` the vivid coral lives on
	// *mid*-chain nodes, and the deepest node of each of those chains is a duller red.
	//
	// `components` is the chain-collapsed subset, per lane. That rule exists for the **text detector's
	// geometry**: the tree names one glyph once per quantised level between the level at which it
	// separates from its field and the level at which it is complete, and a detector that counts shapes
	// cannot see a letter through twenty re-namings of it. Chains never cross lanes, so the collapse
	// cannot either — it runs per lane over that lane's own parent links, which is what D2 asks for.
	//
	// Both rules stay **local to the role stage**: `stability.retained` — what the dump publishes and what
	// the reachability falsifier and the verifier read — is untouched, in every lane.
	const chainSet = new Set(groundChain)
	const isMarkNode = (node: ParsedNode): boolean => node.kind === "mark" && !chainSet.has(node.id)

	/**
	 * A pool node, with the lane whose tree owns its mask (0 is L; then `extraLanes` order) and the
	 * parsed node ids it stands for. Before the coincidence merge `nodeIds` is the one node; after it, a
	 * component is one **physical region** and carries every lane's naming of it as provenance.
	 */
	type Component = Readonly<{
		node: ParsedNode
		laneIndex: number
		/**
		 * Every parsed node id this component names, ascending — the merge's provenance, and the lane
		 * provenance with it: the id space is laid out lane by lane (the L block first, then `extraLanes`
		 * in order), so an id names a lane. `roles/tests/isoluminant-text.test.ts` reads exactly that.
		 */
		nodeIds: readonly number[]
	}>
	const oneNode = (node: ParsedNode, laneIndex: number): Component => ({ node, laneIndex, nodeIds: [node.id] })
	const poolMarks: Component[] = []
	const rawComponents: Component[] = []
	for (const node of nodes) if (isMarkNode(node)) poolMarks.push(oneNode(node, 0))
	for (const index of collapseChains(
		nodes,
		nodes.map((node) => node.parent),
		(index) => isMarkNode(nodes[index]),
	)) {
		rawComponents.push(oneNode(nodes[index], 0))
	}
	for (let laneIndex = 0; laneIndex < extraLanes.length; laneIndex += 1) {
		const lane = laneNodes[laneIndex]
		for (const node of lane) if (node.kind === "mark") poolMarks.push(oneNode(node, laneIndex + 1))
		for (const index of collapseChains(
			lane,
			extraLanes[laneIndex].nodes.map((node) => node.parent),
			(index) => lane[index].kind === "mark",
		)) {
			rawComponents.push(oneNode(lane[index], laneIndex + 1))
		}
	}

	// The trees and Euler tours a component's mask is cut from, indexed the same way `laneIndex` is.
	const laneTrees: ShapeTree[] = [tree, ...extraLanes.map((lane) => lane.tree)]
	const laneTours = [tour, ...extraLanes.map((lane) => eulerTour(lane.tree, childrenOf(lane.tree)))]

	/** Is pixel `pixel` inside this component's shape, in its own lane's tree? */
	const containsPixel = (component: Component): ((pixel: number) => boolean) => {
		const laneTree = laneTrees[component.laneIndex]
		const laneTour = laneTours[component.laneIndex]
		const treeNodeId = component.node.treeNodeId
		const enter = laneTour.enter[treeNodeId]
		const exit = laneTour.exit[treeNodeId]
		return (pixel: number): boolean => {
			const owner = laneTour.enter[laneTree.nodeOfPixel[pixel]]
			return enter <= owner && owner < exit
		}
	}

	// ---- D12: one physical mark is one component ---------------------------------------------------
	//
	// Chain collapse folds a tree's re-namings of one glyph **inside** one lane, along its own ancestry.
	// It cannot see the other two lanes, which name the same blob independently, and it misses a
	// within-lane pair whose areas agree just under `COMPONENT_CHAIN_AREA_AGREEMENT`. On round 3a item 5
	// both happened at once: four "components" (2 L + 1 a + 1 b) were one mark, their centroids were
	// within five pixels, and `collinearity` answers 0 for a degenerate point set — so a single blob
	// satisfied arm-b §2.4's whole conjunction and elected an unreadable foreground.
	//
	// `roles/coincidence.ts` merges them: same colour under the contract's bar, centroids inside the
	// grain's linear extent, and extent agreement — containment at `COMPONENT_CHAIN_AREA_AGREEMENT` *and*
	// bounding boxes agreeing on every edge within the grain, which is what keeps a badge concentric with
	// its panel two regions. **A merged component counts once** toward `TEXT_MIN_COMPONENTS`, and carries
	// every member's node id as provenance so D2's isoluminant evidence survives it.
	const components: Component[] = []
	{
		const merged = mergeCoincidentComponents(
			rawComponents.map((component): CoincidenceCandidate => {
				const laneTree = laneTrees[component.laneIndex]
				const treeNodeId = component.node.treeNodeId
				return {
					centroidX: component.node.centroidX,
					centroidY: component.node.centroidY,
					minX: laneTree.nodeMinX[treeNodeId],
					minY: laneTree.nodeMinY[treeNodeId],
					maxX: laneTree.nodeMaxX[treeNodeId],
					maxY: laneTree.nodeMaxY[treeNodeId],
					areaPixels: laneTree.nodeSubtreeArea[treeNodeId],
					repr: component.node.repr,
					contains: containsPixel(component),
				}
			}),
			image.width,
			image.height,
		)
		for (const members of merged) {
			// The carrier is the largest shape — the most complete naming of the region — then
			// lexicographic RGB, then lane, then node id. Its area is the region's area, never a sum.
			const carrier = members
				.slice()
				.sort(
					(first, second) =>
						rawComponents[second].node.areaFraction - rawComponents[first].node.areaFraction ||
						packOf(rawComponents[first].node.repr) - packOf(rawComponents[second].node.repr) ||
						rawComponents[first].laneIndex - rawComponents[second].laneIndex ||
						rawComponents[first].node.id - rawComponents[second].node.id,
				)[0]
			const ordered = members.slice().sort((first, second) => rawComponents[first].node.id - rawComponents[second].node.id)
			components.push({
				node: rawComponents[carrier].node,
				laneIndex: rawComponents[carrier].laneIndex,
				nodeIds: ordered.map((index) => rawComponents[index].node.id),
			})
		}
	}
	if (rawComponents.length > components.length) {
		notes.push(`coincident-components-merged:${rawComponents.length - components.length}`)
	}
	if (extraLanes.length > 0) {
		notes.push(`lanes:${["L", ...extraLanes.map((lane) => lane.lane)].join("+")}`)
		notes.push(`pool-marks:${poolMarks.length}`)
		notes.push(`components:${components.length}`)
	}

	// ---- D12/D3: the identity-eligibility measurement ----------------------------------------------
	//
	// `roles/eligibility.ts` — a region **traces a boundary** when it has no interior pixel. One linear
	// pass over the mask that is cut for the distance transform anyway, memoised per parsed node id so a
	// component that is also an accent candidate is measured once.
	const hasInteriorByNodeId = new Map<number, boolean>()
	const maskOf = (component: Component): { mask: Uint8Array; width: number; height: number } | null => {
		const laneTree = laneTrees[component.laneIndex]
		const laneTour = laneTours[component.laneIndex]
		const treeNodeId = component.node.treeNodeId
		const minX = laneTree.nodeMinX[treeNodeId]
		const minY = laneTree.nodeMinY[treeNodeId]
		const boxWidth = laneTree.nodeMaxX[treeNodeId] - minX + 1
		const boxHeight = laneTree.nodeMaxY[treeNodeId] - minY + 1
		if (boxWidth <= 0 || boxHeight <= 0) return null
		const mask = new Uint8Array(boxWidth * boxHeight)
		for (let y = 0; y < boxHeight; y += 1) {
			for (let x = 0; x < boxWidth; x += 1) {
				const owner = laneTree.nodeOfPixel[(minY + y) * image.width + (minX + x)]
				const inside = laneTour.enter[treeNodeId] <= laneTour.enter[owner] && laneTour.enter[owner] < laneTour.exit[treeNodeId]
				if (inside) mask[y * boxWidth + x] = 1
			}
		}
		return { mask, width: boxWidth, height: boxHeight }
	}
	const componentHasInterior = (component: Component): boolean => {
		const known = hasInteriorByNodeId.get(component.node.id)
		if (known !== undefined) return known
		const cut = maskOf(component)
		const answer = cut === null ? false : hasInteriorPixel(cut.mask, cut.width, cut.height)
		hasInteriorByNodeId.set(component.node.id, answer)
		return answer
	}

	// ---- D3: salience gates identity -------------------------------------------------------------
	//
	// The reviewer's rule (P5 round 2, folded in as D3): *presence ≠ eligibility* — a colour present only
	// as an "accidental shadow" may not carry an **identity** role. The structural attribute that already
	// says how much of a region a node names is the MSER growth rate `selectStableNodes` computes: the
	// area derivative per level, small for a region that holds its shape across the level axis and large
	// for one that appears and dissolves. It is on every retained node in every lane and costs nothing.
	//
	// It is applied as a **level, not a score**: the foreground's ranking puts level 0 ahead of level 1 and
	// then orders inside each level by its own key, so this can only demote an incidental node beneath a
	// stable one — it can never re-order two stable candidates by stability. **The accent measures the
	// level and does not rank on it**; the reason is at `rankAccent` below and in `integration-NOTES.md`,
	// and it is a deviation from the integration brief, stated as one.
	//
	// The split is the **pool's own lower median**, an order statistic of the marks this image produced.
	// It is deliberately not a constant: there is no calibrated growth rate at which a node stops being
	// incidental, this file may not invent one, and a rank-based split is invariant under any monotone
	// re-scaling of growth. `integration-NOTES.md` records the calibration that is owed. The population is
	// the *whole* pool rather than either ranking's candidate set, so the two identity roles are gated
	// against one statement about this image and not against two.
	const componentGrowths = poolMarks.map((component) => component.node.growth).filter((value) => Number.isFinite(value))
	const growthMedian = componentGrowths.length > 0 ? lowerMedian(componentGrowths) : Number.POSITIVE_INFINITY
	const nodeIsSalient = (node: ParsedNode): boolean => Number.isFinite(node.growth) && node.growth <= growthMedian
	if (componentGrowths.length > 0) notes.push(`salience-median-growth:${growthMedian}`)

	// ---- the accent's own candidate set ----------------------------------------------------------
	//
	// **Truncate along the ranking you are about to apply.** Round 1's miss on `…35b967964d` ("accent
	// wrongly collapsed — vivid red-orange missed") was not a threshold rejecting the red: the tree had
	// retained it, and the role stage's *area*-ordered truncation dropped it before any ranking ran — the
	// node that carries it ranks 602nd by area out of 963 marks. A vivid accent is characteristically
	// small, so an area-ordered cost guard in front of the accent ranking is a saturation wall by another
	// route. The accent's candidates are therefore cut down the accent's own order, so nothing dropped
	// could have won. No floor, no minimum saturation: a low-chroma cover yields a low-chroma accent.
	const backgroundLab = rgbToOkLab(background)
	const chromaCache = new Map<number, number>()
	const packOfColor = (color: Rgb8): number => (color[0] << 16) | (color[1] << 8) | color[2]
	const chromaFromField = (color: Rgb8): number => {
		const key = packOfColor(color)
		let value = chromaCache.get(key)
		if (value === undefined) {
			const lab = labFor(key)
			value = Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
			chromaCache.set(key, value)
		}
		return value
	}
	const lightnessMove = (color: Rgb8): number => Math.abs(labFor(packOfColor(color))[0] - backgroundLab[0])

	//
	// **Cycle 3 — the cut is made at a stable boundary, and the ranking above it is indifferent inside
	// the bar.** Truncating down the right ordering was cycle 2's fix; it left the *cut itself* exact,
	// so a candidate sitting beside the 256th could be pushed across it by a change smaller than the bar.
	// Both quantities are OKLab distances, so both are compared against `sameColorBar` for the pair
	// (`roles/indifference.ts`), and the cut is extended through the class that straddles it — a class
	// spans strictly less than one bar, so the overshoot is bounded by the population inside one bar.
	const poolChromaClass = indifferenceClasses(
		poolMarks.length,
		(index) => chromaFromField(poolMarks[index].node.repr),
		(leader, candidate) => colorQuantityBand(poolMarks[leader].node.repr, poolMarks[candidate].node.repr),
		(first, second) => packOfColor(poolMarks[first].node.repr) - packOfColor(poolMarks[second].node.repr),
	)
	const poolLightnessClass = indifferenceClasses(
		poolMarks.length,
		(index) => lightnessMove(poolMarks[index].node.repr),
		(leader, candidate) => colorQuantityBand(poolMarks[leader].node.repr, poolMarks[candidate].node.repr),
		(first, second) => packOfColor(poolMarks[first].node.repr) - packOfColor(poolMarks[second].node.repr),
	)
	const poolOrder = Array.from({ length: poolMarks.length }, (_unused, index) => index).sort(
		(first, second) =>
			poolChromaClass[first] - poolChromaClass[second] ||
			poolLightnessClass[first] - poolLightnessClass[second] ||
			packOfColor(poolMarks[first].node.repr) - packOfColor(poolMarks[second].node.repr) ||
			poolMarks[first].laneIndex - poolMarks[second].laneIndex ||
			poolMarks[first].node.id - poolMarks[second].node.id,
	)
	const accentCut = stableCut(
		poolOrder,
		ACCENT_CANDIDATE_LIMIT,
		(first, second) => poolChromaClass[first] === poolChromaClass[second] && poolLightnessClass[first] === poolLightnessClass[second],
	)
	const accentComponents = poolOrder.slice(0, accentCut).map((index) => poolMarks[index])
	if (accentCut > ACCENT_CANDIDATE_LIMIT) notes.push(`accent-cut-extended:${accentCut}`)

	// ---- the text detector's component set -------------------------------------------------------
	//
	// Largest first, because the detector's cost is one exact distance transform per component and
	// `TEXT_COMPONENT_LIMIT` is a cost guard. The cut is shared across lanes rather than applied per
	// lane: the pool is one pool, and a per-lane cap would be three cost guards where the spec has one.
	//
	// **Cycle 3 — indifferent inside the area tolerance the role stage already uses, and cut at a class
	// boundary.** Area is compared through `areaFractionBand` (relative, `1 −
	// COMPONENT_CHAIN_AREA_AGREEMENT`, the ratio at which this stage already calls two areas one
	// region's), so two components of indistinguishable size are ordered by their colours rather than by
	// which one happened to measure a pixel larger, and the 512th's neighbours cannot swap across the cut
	// under a sub-bar change. `stableCut` extends through the straddling class; a class spans strictly
	// less than 20% of its leader's area, so this is a bounded overshoot and not the tail.
	const componentAreaClass = indifferenceClasses(
		components.length,
		(index) => components[index].node.areaFraction,
		(leader, candidate) => areaFractionBand(components[leader].node.areaFraction, components[candidate].node.areaFraction),
		(first, second) => packOf(components[first].node.repr) - packOf(components[second].node.repr),
	)
	const componentOrder = Array.from({ length: components.length }, (_unused, index) => index).sort(
		(first, second) =>
			componentAreaClass[first] - componentAreaClass[second] ||
			packOf(components[first].node.repr) - packOf(components[second].node.repr) ||
			components[first].node.id - components[second].node.id,
	)
	const componentCut = stableCut(
		componentOrder,
		TEXT_COMPONENT_LIMIT,
		(first, second) => componentAreaClass[first] === componentAreaClass[second],
	)
	if (componentCut > TEXT_COMPONENT_LIMIT) notes.push(`component-cut-extended:${componentCut}`)
	const markComponents = componentOrder.slice(0, componentCut).map((index) => components[index])
	const marks = markComponents.map((component) => component.node)

	// One distance transform per component, read twice: the inradius gives arm-b′ §2.6's thinness, the
	// median ridge distance gives arm-b §2.4's stroke width. The mask is cut from the component's **own**
	// lane's tree — the only per-lane step in the detector; everything after it is geometry in pixels,
	// which is the same space in every lane.
	//
	// **Three readings of one mask, not three passes.** The inradius gives thinness, the median ridge
	// distance gives the stroke width, and *"is there an interior pixel"* gives D12's identity
	// eligibility — the last one for free, from the same `Uint8Array`, before the transform runs.
	const componentHeight = new Map<number, number>()
	for (let index = 0; index < markComponents.length; index += 1) {
		const mark = markComponents[index].node
		const laneTree = laneTrees[markComponents[index].laneIndex]
		const treeNodeId = mark.treeNodeId
		const cut = maskOf(markComponents[index])
		if (cut === null) continue
		componentHeight.set(mark.id, cut.height)
		hasInteriorByNodeId.set(mark.id, hasInteriorPixel(cut.mask, cut.width, cut.height))
		const distances = distanceFieldOf(cut.mask, cut.width, cut.height)
		const inradius = inradiusFromDistanceField(distances)
		const area = laneTree.nodeSubtreeArea[treeNodeId]
		mark.thinness = area > 0 ? inradius / Math.sqrt(area) : null
		mark.strokeWidth = strokeWidthFromDistanceField(distances.squared, distances.width, distances.height)
	}

	// Clusters: components whose representative colours are the same colour by the contract's own bar.
	// This is also arm-b §2.4's fourth grouping clause — "colours the same under the bar" — so the text
	// detector inherits it structurally rather than re-testing it, and inherits it across lanes.
	const clusterIndexOfComponent = new Int32Array(marks.length).fill(-1)
	// The rendered field every candidate is judged against: both field roles and, when a gradient is
	// published, every point of the OKLab interpolation between them. `roles/rank.ts` measures it with
	// the contract's own `minRawContrastOverRamp`, which is the function invariant 4 itself calls.
	const renderedField = renderedFieldOf(background, surface, gradient)
	// Memoised per exact triple: a ramp minimum costs `RAMP_SAMPLES_PER_SEGMENT +
	// RAMP_REFINEMENT_SAMPLES` APCA evaluations, both rankings score overlapping candidate sets, and the
	// score is a pure function of the triple and the field.
	const contrastCache = new Map<number, number>()
	const contrastOf = (color: Rgb8): number => {
		const key = packOfColor(color)
		let score = contrastCache.get(key)
		if (score === undefined) {
			score = minFieldContrast(color, renderedField)
			contrastCache.set(key, score)
		}
		return score
	}

	const clusters = clusterByBar(marks.map((mark) => mark.repr)).map((members, clusterIndex) => {
		for (const index of members) clusterIndexOfComponent[index] = clusterIndex
		const thicknesses = members.map((index) => marks[index].thinness).filter((value): value is number => value !== null)
		const thinness = thicknesses.length > 0 ? thicknesses.reduce((sum, value) => sum + value, 0) / thicknesses.length : 1
		const geometryOfCluster = collinearityResidual(members.map((index) => [marks[index].centroidX, marks[index].centroidY] as const))
		const collinearity = geometryOfCluster.length > 0 ? geometryOfCluster.residual / geometryOfCluster.length : 1
		// **Which member publishes — area, and deliberately still area here.** D18.1 moved the two pools
		// whose ranking quantity is named: the accent's own clusters publish their chroma-extremal member
		// (below) and a text group publishes its readability-extremal one (`findTextGroups`). This
		// representative is **shared** between two consumers with two different quantities — it is the
		// accent's second tier *and* the foreground's non-text tier — so a single extremal rule here would
		// have to pick one role's quantity and impose it on the other's pool. Splitting it into two reprs
		// is a real design and it needs its own measurement; until then the shared repr keeps the rule it
		// has always had, and the deferral is recorded in `roles/NOTES.md` rather than left implicit.
		const largest = members.slice().sort((first, second) => marks[second].areaFraction - marks[first].areaFraction || first - second)[0]
		return {
			members,
			thinness,
			count: members.length,
			collinearity,
			areaFraction: members.reduce((sum, index) => sum + marks[index].areaFraction, 0),
			repr: marks[largest].repr,
			firstMarkId: marks[members[0]].id,
			firstLaneIndex: markComponents[members[0]].laneIndex,
			salient: members.some((index) => nodeIsSalient(marks[index])),
			// **D12's eligibility level.** A cluster traces a boundary only when *every* region behind it
			// does: one member with an interior is enough to say the colour is a region of the artwork,
			// the same polarity `salient` uses. See `roles/eligibility.ts`.
			tracing: boundaryTracingLevel(members.some((index) => componentHasInterior(markComponents[index]))),
			growth: Math.min(...members.map((index) => marks[index].growth)),
		}
	})

	// ---- the text detector, arm-b §2.4 -----------------------------------------------------------
	//
	// Cycle 1 ranked the foreground by arm-b′ §2.6's *text-ness* order — thinness, member count, centroid
	// collinearity — which contains no contrast term at all, and the reviewer called the result
	// unreadable on 7 of 10 unacceptable sides. Cycle 2 replaces the proxy with the thing it was proxying
	// for: find the components that are *manufactured as type*, and let the artwork's own text colour
	// lead. `roles/text.ts` carries the graft and its deviations.
	//
	// **The detector's tests are lane-agnostic and stay that way.** Stroke width, height agreement,
	// centroid collinearity and row linkage are measured in image pixels, which every lane shares; the
	// colour clause is the one bar, applied once, in `clusterByBar` above. Nothing here knows which tree
	// found a glyph, which is the point — a title set in a colour that only moves in `a` is type by
	// exactly the same evidence as a title that moves in `L`.
	const textComponents: TextComponent[] = marks.map((mark, index) => ({
		nodeId: mark.id,
		clusterId: clusterIndexOfComponent[index],
		strokeWidth: mark.strokeWidth ?? 0,
		height: componentHeight.get(mark.id) ?? 0,
		centroidX: mark.centroidX * image.width,
		centroidY: mark.centroidY * image.height,
		areaFraction: mark.areaFraction,
		repr: mark.repr,
	}))
	// **D18.1, the foreground's lever: a group publishes its most readable member, not its largest.**
	// Round-5 item 2 priced the substitution this makes on the acceptance cover (`#070506` against
	// `#050304`, **strong on both sides, no preference**), so the choice inside a text cluster is the
	// reviewer's to release and they released it. The quantity is `minFieldContrast` over the rendered
	// field — the one the foreground is ranked on, memoised per triple in `contrastOf` — and the ruler
	// for it is `RAW_APCA_INDIFFERENCE`, the magnitude raw APCA returns for two identical colours. Every
	// letter of one title is inside that band of every other, so what the rule really removes is *area*
	// deciding which letter's exact triple is published.
	//
	// **It stays inside the winning cluster, and inside that cluster it stays inside the incumbent's own
	// indifference class** (`roles/indifference.ts`). The rule chooses among the members of one group and
	// never between groups: text-colour-leads is untouched, and the group order above is still area then
	// readability. What moves is which of the artwork's own near-identical inks is the published triple.
	const textGroups: TextGroup[] = findTextGroups(textComponents, {
		valueOf: (component) => contrastOf(component.repr),
		bandOf: () => RAW_APCA_INDIFFERENCE,
	})
	const textClusterIds = new Set(textGroups.map((group) => group.clusterId))

	// ---- the ordered pools the roles are drawn from ----------------------------------------------
	//
	// **The parse publishes rankings, not just winners.** arm-b′ §2.7: "a violated invariant at assembly
	// is repaired by taking the next item in the same ranking, never by inventing or adjusting a colour",
	// and "the whole palette is re-validated after it". The contract adapter (`candidate.ts`) does the
	// walking; the ordering is decided here, once, and is the same ordering whether or not a repair ever
	// happens.

	// The residual, treated as one node (arm-b′ §2.7): the image's own sufficiently common exact triples,
	// ranked by APCA against the background. It is the whole of both rankings when there is no mark
	// population at all, and their tail otherwise, so a degradation always has somewhere to go and never
	// has to reach for a colour the artwork does not contain.
	const wholeImage = new Map<number, number>()
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		wholeImage.set(image.packed[pixel], (wholeImage.get(image.packed[pixel]) ?? 0) + 1)
	}
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalArea))
	const commonEnough = Array.from(wholeImage.entries())
		.filter(([, count]) => count >= areaFloor)
		.map(([color]) => color)
	// Ordered, and cut, against the same APCA ruler as everything else that ranks on readability: the
	// residual is a set of the image's own exact triples, so its packed value *is* the house tie-break and
	// the ordering is a function of the artwork's colours alone once the level is indifferent.
	const residualCandidates = commonEnough.length > 0 ? commonEnough : Array.from(wholeImage.keys())
	const residualScore = residualCandidates.map((packed) => Math.abs(apcaRaw(unpack(packed), background)))
	const residualClass = indifferenceClasses(
		residualCandidates.length,
		(index) => residualScore[index],
		() => RAW_APCA_INDIFFERENCE,
		(first, second) => residualCandidates[first] - residualCandidates[second],
	)
	const residualOrder = Array.from({ length: residualCandidates.length }, (_unused, index) => index).sort(
		(first, second) => residualClass[first] - residualClass[second] || residualCandidates[first] - residualCandidates[second],
	)
	const residualDepth = residualOrder.slice(
		0,
		stableCut(residualOrder, RESIDUAL_POOL_SIZE, (first, second) => residualClass[first] === residualClass[second]),
	)
	if (clusters.length === 0) notes.push("no-mark-clusters:residual-degradation")

	// ---- D12: the residual's identity eligibility, measured on pixels ------------------------------
	//
	// A residual colour has no node, so its region is the contract's own **bar mask** — every pixel the
	// regional ruler calls this colour — which is the unit `identity/pixels.ts` measures and the only one
	// that answers the question. Round 3a item 1's `#fcfefd` is 330 exact-triple pixels scattered over a
	// blown highlight whose bar mask is a 16,937-pixel region of inradius 57.9 px; item 2's `#fcffff` is
	// 2,230 bar pixels in five components, **every one of inradius 1 px and boundary fraction 1.0**,
	// tracing the outline of the photograph on the cover. The first is a region of the artwork and keeps
	// its place; the second is the "accidental shadow" D3 refuses identity to.
	//
	// The cut into the pool is made **before** this and on the readability order alone: the level is an
	// ordering and never a retention rule, so the same eight colours are in the pool either way and the
	// assembly walk can still reach a demoted one when nothing above it clears the contract.
	// The image's distinct colours, indexed once: the bar test is a question about *colours*, and the
	// image repeats them heavily, so deciding it per distinct colour rather than per pixel is the whole
	// of the cost. Measured on demo-20: 98 ms per cover for eight candidates before this indexing, 25 ms
	// after — against a role stage that costs ~590 ms, which is the ratio to read.
	const colorIndexOfPixel = new Int32Array(image.packed.length)
	const residualBarMask = new Uint8Array(image.packed.length)
	const distinctColors = Array.from(wholeImage.keys()).sort((first, second) => first - second)
	const distinctLabs: OkLab[] = new Array(distinctColors.length)
	const distinctColorObjects: PaletteColor[] = new Array(distinctColors.length)
	{
		const indexOfColor = new Map<number, number>()
		for (let index = 0; index < distinctColors.length; index += 1) {
			indexOfColor.set(distinctColors[index], index)
			distinctLabs[index] = labFor(distinctColors[index])
			distinctColorObjects[index] = colorFor(distinctColors[index])
		}
		for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
			colorIndexOfPixel[pixel] = indexOfColor.get(image.packed[pixel]) ?? 0
		}
	}
	const barMaskHasInterior = (subject: number): boolean => {
		const subjectLab = labFor(subject)
		const subjectColor = colorFor(subject)
		const inside = new Uint8Array(distinctColors.length)
		for (let index = 0; index < distinctColors.length; index += 1) {
			inside[index] = okLabDistance(subjectLab, distinctLabs[index]) < sameColorBar(subjectColor, distinctColorObjects[index]) ? 1 : 0
		}
		for (let pixel = 0; pixel < residualBarMask.length; pixel += 1) residualBarMask[pixel] = inside[colorIndexOfPixel[pixel]]
		return hasInteriorPixel(residualBarMask, image.width, image.height)
	}
	const residualTracing = new Map<number, 0 | 1>()
	for (const index of residualDepth) {
		residualTracing.set(residualCandidates[index], boundaryTracingLevel(barMaskHasInterior(residualCandidates[index])))
	}
	// Reordered, not re-cut: boundary-tracing colours sort after the rest, and inside each level the
	// readability order they were cut on is preserved.
	const residualPool = residualDepth
		.slice()
		.sort((first, second) => (residualTracing.get(residualCandidates[first]) ?? 0) - (residualTracing.get(residualCandidates[second]) ?? 0))
		.map((index) => unpack(residualCandidates[index]))

	const dedupe = (colors: readonly Rgb8[]): Rgb8[] => {
		const seenColors = new Set<number>()
		const kept: Rgb8[] = []
		for (const color of colors) {
			const packed = packOfColor(color)
			if (seenColors.has(packed)) continue
			seenColors.add(packed)
			kept.push(color)
		}
		return kept
	}

	// **D3's level, as a lookup.** Salience is a property of the *nodes* behind a colour, so it is defined
	// for candidates that came from a cluster and undefined for the residual — which is a set of the
	// image's common exact triples and not a node at all. An undefined level is 0: D3 demotes incidental
	// nodes, and reading it as a demotion of everything that is not a node would be a different rule.
	//
	// A text group's colour is level 0 whatever its nodes' growth says. D3 is explicit that identity
	// outranks legibility and that the artwork's own text colour claims the foreground first; a rule
	// meant to stop accidental shadows carrying identity may not unseat the one candidate whose identity
	// is not in question.
	const levelByColor = new Map<number, number>()
	const noteLevel = (color: Rgb8, level: number): void => {
		const key = packOfColor(color)
		const known = levelByColor.get(key)
		if (known === undefined || level < known) levelByColor.set(key, level)
	}
	for (const cluster of clusters) noteLevel(cluster.repr, cluster.salient ? 0 : 1)

	// **D12's tracing level, as the same shape of lookup.** Same polarity as `noteLevel`: the best
	// evidence about a colour wins, so a colour that is a real region anywhere in the image is eligible
	// everywhere. Undefined is 0, for the reason D3's is — a rule against accidental shadows may not
	// demote a candidate no measurement has said anything about.
	const tracingByColor = new Map<number, 0 | 1>()
	const noteTracing = (color: Rgb8, level: 0 | 1): void => {
		const key = packOfColor(color)
		const known = tracingByColor.get(key)
		if (known === undefined || level < known) tracingByColor.set(key, level)
	}
	for (const cluster of clusters) noteTracing(cluster.repr, cluster.tracing)
	for (const [packed, level] of residualTracing) noteTracing(unpack(packed), level)
	const tracingOf = (color: Rgb8): 0 | 1 => tracingByColor.get(packOfColor(color)) ?? 0
	/** D3's salience level alone — what `AccentCandidate.stabilityLevel` has always published. */
	const salienceLevelOf = (color: Rgb8): 0 | 1 => (levelByColor.get(packOfColor(color)) ?? 0) as 0 | 1
	// The two levels compose lexicographically, tracing outermost: `roles/eligibility.ts`.
	const levelOf = (color: Rgb8): number => identityEligibilityLevel(tracingOf(color), salienceLevelOf(color))

	// **Foreground.** The artwork's own text colour leads — round 1, verbatim, on the acceptance case:
	// *"black is the artwork's text → fg should be black"*. Text groups first (arm-b §2.6: "text-shaped
	// groups first by total area fraction"), with readability against the rendered field as the
	// tie-break; then every remaining candidate ranked by D3's level and then by that readability.
	//
	// The ranking is not a gate. The contract's floors stay where the constraint sheet puts them; what
	// this chooses is the most readable of the artwork's *own* candidates, every one of them still an
	// exact triple of the source.
	//
	// **Cycle 3 — both levels are compared against their rulers.** A text group's summed area is a churny
	// quantity: its membership is the truncated component set, which turns over at 10% under a dither
	// (`stability/q1-dither/REPORT.md`), so an exact area comparison between two groups of much the same
	// size decides the foreground on noise. Area falls through inside `areaFractionBand`, readability
	// inside `RAW_APCA_INDIFFERENCE`, and the settled tie-break is the group's **colour** rather than the
	// smallest node id behind it — a node id is an artefact of the retained set and moves with it, a
	// colour does not.
	const groupScored = textGroups.map((group) => ({ group, contrast: contrastOf(group.repr) }))
	const groupAreaClass = indifferenceClasses(
		groupScored.length,
		(index) => groupScored[index].group.areaFraction,
		(leader, candidate) => areaFractionBand(groupScored[leader].group.areaFraction, groupScored[candidate].group.areaFraction),
		(first, second) => packOfColor(groupScored[first].group.repr) - packOfColor(groupScored[second].group.repr),
	)
	const groupContrastClass = indifferenceClasses(
		groupScored.length,
		(index) => groupScored[index].contrast,
		() => RAW_APCA_INDIFFERENCE,
		(first, second) => packOfColor(groupScored[first].group.repr) - packOfColor(groupScored[second].group.repr),
	)
	const rankedTextGroups = groupScored
		.map((entry, index) => ({ ...entry, areaClass: groupAreaClass[index], contrastClass: groupContrastClass[index] }))
		.sort(
			(first, second) =>
				first.areaClass - second.areaClass ||
				first.contrastClass - second.contrastClass ||
				packOfColor(first.group.repr) - packOfColor(second.group.repr) ||
				first.group.firstNodeId - second.group.firstNodeId,
		)
	// A text group's colour leads both eligibility levels, D3's and D12's, for the one reason: identity
	// outranks legibility and the artwork's own text colour claims the foreground first. After the
	// coincidence merge a group can no longer be one mark counted four times, which was the route by
	// which round 3a item 5's single blob reached this exemption.
	for (const entry of rankedTextGroups) {
		levelByColor.set(packOfColor(entry.group.repr), 0)
		tracingByColor.set(packOfColor(entry.group.repr), 0)
	}
	if (rankedTextGroups.length === 0) notes.push("no-text-groups:contrast-ranking-only")
	const nonTextClusterReprs = clusters.filter((_cluster, index) => !textClusterIds.has(index)).map((cluster) => cluster.repr)
	const foregroundPool = dedupe([
		...rankedTextGroups.map((entry) => entry.group.repr),
		...rankByFieldContrast([...nonTextClusterReprs, ...residualPool], renderedField, (color) => contrastOf(color), levelOf),
	])

	// **Accent — D1.** The order is **chroma from the field first**, lightness movement as the tie-break:
	// arm-b′ §2.6's rule, and the ruling the orchestrator issued at the W-E/W-F fan-in. W-F's rewrite had
	// put minimum APCA over the rendered field in front of it; on `…35b967964d` the two orders elect
	// different colours (olive `#6a723f`, chroma 0.052, contrast 59.1, against coral `#d25068`, chroma
	// 0.190, contrast 44.5) and the reviewer's only direct quote about a specific accent on a specific
	// cover names the coral. Readability keeps its guard through the contract's own machinery — invariant
	// 4 at the user floors, plus the twins-must-collapse walk in `roles/assemble.ts` — rather than
	// through an exchange rate nobody has priced. `fieldContrast` is still measured, per candidate, and
	// published in `accentCandidates` so the coming round can price it.
	//
	// **D3's level is measured for the accent and is not ranked on, and that is a deviation.** The
	// integration brief asks for the salience level ahead of *both* identity orders. On the acceptance
	// cover it inverts D1: the coral `#d25068` is the most chromatic candidate in the pool (0.169 against
	// the runner-up's 0.146) and its cluster's best MSER growth is 0.056 against a pool median of 0.015,
	// so **every** split this file can construct without a calibrated number — the population median, the
	// node-against-its-own-parent comparison — demotes exactly the colour D1 names, and D1 forbids
	// re-introducing an order that does. The brief's own escape clause applies ("if you find you need a
	// threshold, stop, write the need into `integration-NOTES.md`, and use pure ordering instead"): the
	// need is written there, `stabilityLevel` is published per candidate in `accentCandidates` so the
	// round can price it, and the accent's published order is D1's, unqualified. The foreground keeps the
	// level, where nothing in D1 is at stake.
	//
	// **Cycle 3 — the two colour levels are compared against the bar, and the settled tie-break is the
	// colour itself.** Both keys are OKLab distances measured from the published background, so the ruler
	// for both is `sameColorBar` for the pair being compared (`roles/indifference.ts`); the accent is the
	// role the dither moved most often (48% of covers changed the supplying node, 45% changed the
	// published colour) and 82% of that is this comparison resolving a difference below the bar. Lane
	// index and node id stay as the last two levels but are now unreachable unless two candidates carry
	// the *same colour*, which is the only case in which they say anything about the artwork.
	//
	// **Cycle 3 — D12's eligibility level goes in front of chroma, and D3's salience level still does
	// not.** They are two different statements and only one of them costs D1 its acceptance case.
	// `integration-NOTES.md` §5 records why salience cannot lead here: the coral `#d25068` is the most
	// chromatic candidate in the pool and its cluster's growth is above the pool median, so every
	// threshold-free salience split demotes exactly the colour D1 names. The **tracing** level does not:
	// the coral's node has an interior, so it is level 0 and the acceptance case is unmoved
	// (`lanes/tests/accent-acceptance.test.ts` asserts it). What the level does reach is the class W-I
	// measured — a one-pixel filament tracing another region's edge, which may not carry identity.
	type AccentKeyed = Readonly<{ repr: Rgb8; tracing: 0 | 1; firstLaneIndex: number; firstMarkId: number }>
	const rankAccentOrder = <T extends AccentKeyed>(items: readonly T[]): T[] => {
		const chromaClass = indifferenceClasses(
			items.length,
			(index) => chromaFromField(items[index].repr),
			(leader, candidate) => colorQuantityBand(items[leader].repr, items[candidate].repr),
			(first, second) => packOfColor(items[first].repr) - packOfColor(items[second].repr),
		)
		const lightnessClass = indifferenceClasses(
			items.length,
			(index) => lightnessMove(items[index].repr),
			(leader, candidate) => colorQuantityBand(items[leader].repr, items[candidate].repr),
			(first, second) => packOfColor(items[first].repr) - packOfColor(items[second].repr),
		)
		return Array.from({ length: items.length }, (_unused, index) => index)
			.sort(
				(first, second) =>
					items[first].tracing - items[second].tracing ||
					chromaClass[first] - chromaClass[second] ||
					chromaFromField(items[second].repr) - chromaFromField(items[first].repr) ||
					lightnessClass[first] - lightnessClass[second] ||
					lightnessMove(items[second].repr) - lightnessMove(items[first].repr) ||
					packOfColor(items[first].repr) - packOfColor(items[second].repr) ||
					items[first].firstLaneIndex - items[second].firstLaneIndex ||
					items[first].firstMarkId - items[second].firstMarkId,
			)
			.map((index) => items[index])
	}

	// **Which member of a cluster publishes — the cycle-3 lever, now ADOPTED (D18.1).**
	//
	// The choice inside a cluster decides the published triple, and it used to be *area* — which
	// `stability/q1-dither/REPORT.md` measures as one of the churniest orders in the parse. It is now
	// **chroma from the field**, the accent's own ranking quantity: an existing attribute, no constant,
	// and a quantity computed from the colour rather than from a mask whose extent turns over under a
	// dither. Round-5 item 1 priced the substitution this makes on `…35b967964d` (`#d25068` against
	// `#ee5567`, weak on both sides, **no preference**), so the choice is the reviewer's to release and
	// D18.1 releases it.
	//
	// The extremum is taken **against the ruler** and is **bounded by the incumbent's own class** —
	// `roles/indifference.ts` carries the derivation and the measurement that produced the bound. On this
	// cover the bound leaves the endorsed coral `#d25068` published (the cluster that reaches `#ee5567` is
	// a different one, and it now publishes the settled member of its incumbent's class); the unbounded
	// form, which is what W-J measured at dither-arm accent churn 42/100 against 50, is recorded with its
	// costs in `roles/NOTES.md`.
	const accentClusters = clusterByBar(accentComponents.map((component) => component.node.repr)).map((members) => {
		const byArea = (first: number, second: number): number =>
			accentComponents[members[second]].node.areaFraction - accentComponents[members[first]].node.areaFraction ||
			packOfColor(accentComponents[members[first]].node.repr) - packOfColor(accentComponents[members[second]].node.repr) ||
			accentComponents[members[first]].node.id - accentComponents[members[second]].node.id
		let incumbent = 0
		for (let position = 1; position < members.length; position += 1) if (byArea(position, incumbent) < 0) incumbent = position
		const publishes = members[
			extremalMember(
				members.length,
				(position) => chromaFromField(accentComponents[members[position]].node.repr),
				(leader, candidate) =>
					colorQuantityBand(accentComponents[members[leader]].node.repr, accentComponents[members[candidate]].node.repr),
				(first, second) =>
					packOfColor(accentComponents[members[first]].node.repr) - packOfColor(accentComponents[members[second]].node.repr) ||
					accentComponents[members[first]].node.id - accentComponents[members[second]].node.id,
				incumbent,
			)
		]
		return {
			repr: accentComponents[publishes].node.repr,
			salient: members.some((index) => nodeIsSalient(accentComponents[index].node)),
			// Measured on the accent's own candidates, memoised against the components already cut for the
			// distance transform, so a node that is in both sets pays for one mask.
			tracing: boundaryTracingLevel(members.some((index) => componentHasInterior(accentComponents[index]))),
			firstLaneIndex: accentComponents[members[0]].laneIndex,
			firstMarkId: accentComponents[members[0]].node.id,
			growth: Math.min(...members.map((index) => accentComponents[index].node.growth)),
		}
	})
	for (const cluster of accentClusters) noteLevel(cluster.repr, cluster.salient ? 0 : 1)
	for (const cluster of accentClusters) noteTracing(cluster.repr, cluster.tracing)
	if (extraLanes.length > 0 || accentComponents.length > 0) notes.push(`accent-candidates:${accentComponents.length}`)

	// Three tiers, and nothing the L-only parse offered is lost: the accent's own truncated candidates
	// first, then the text stage's clusters under the same key — the components the area cut kept and the
	// chroma cut did not — then the residual.
	const rankedAccentClusters = rankAccentOrder(accentClusters)
	const rankedMarkClusters = rankAccentOrder(clusters)
	const accentPool = dedupe([
		...rankedAccentClusters.map((cluster) => cluster.repr),
		...rankedMarkClusters.map((cluster) => cluster.repr),
		...residualPool,
	])

	// Every measurement the accent order *could* have used, in the order it published, for the round.
	const accentCandidates: AccentCandidate[] = [...rankedAccentClusters, ...rankedMarkClusters].map((cluster) => ({
		repr: cluster.repr,
		laneIndex: cluster.firstLaneIndex,
		nodeId: cluster.firstMarkId,
		chromaFromField: chromaFromField(cluster.repr),
		lightnessMove: lightnessMove(cluster.repr),
		fieldContrast: contrastOf(cluster.repr),
		stabilityLevel: salienceLevelOf(cluster.repr),
		tracingLevel: tracingOf(cluster.repr),
		growth: cluster.growth,
	}))

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
		nodes: laneNodes.length > 0 ? [...nodes, ...laneNodes.flat()] : nodes,
		roles: { background, surface, foreground, accent },
		textGroups: rankedTextGroups.map((entry) => ({
			// Every parsed node behind the group, across every lane — after the coincidence merge a member
			// is one physical region that several lanes named, and D2's evidence is those namings.
			nodeIds: entry.group.members
				.flatMap((index) => markComponents[index].nodeIds)
				.sort((first, second) => first - second),
			componentCount: entry.group.members.length,
			rows: entry.group.rows,
			areaFraction: entry.group.areaFraction,
			repr: entry.group.repr,
			fieldContrast: entry.contrast,
		})),
		foregroundPool,
		accentPool,
		accentCandidates,
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
