/**
 * **The merged pipeline: one decode, three trees, one pool.**
 *
 * ## What this file is after the cycle-2 integration pass
 *
 * It used to be a *second* candidate's pool merger, sitting beside `p2-tos` and folding the a and b
 * lanes into the accent ranking only. `DECISIONS.md` D2 closed that split: the lanes' retained nodes now
 * join the pool every mark role is ranked over, and the machinery that does it — per-lane chain
 * collapse, one clustering under the one bar, the text detector, both identity rankings — lives in
 * `../pipeline.ts` where the component rule already lived. What is left here is the **orchestration**:
 * decode once, build one tree per lane, hand the chromatic lanes to `parseTree`, and return the parse
 * beside the lanes so a test or a dump can look at either.
 *
 * The result is that `p2-tos` and `p2-tos-chroma` are **one implementation**. `../candidate.ts` calls
 * this; `../candidate-chroma.ts` re-exports `../candidate.ts` under the other id.
 *
 * ## The two recall gaps the lanes close, and which one is which
 *
 * **1. Isoluminant regions have no node at all.** A tree over L cannot contain a node separating two
 * regions of equal lightness — they are the same level set, so there is nothing to retain, and no
 * constant repairs it. `channels.ts` adds the a and b trees, so a region is invisible only when it
 * matches its surround in L *and* a *and* b (arm-b′ §2.1). `tests/chromatic-tree.test.ts` shows the
 * mechanism directly; `../roles/tests/isoluminant-text.test.ts` shows it reaching the **foreground**,
 * which is what D2 added and what cycle 2's first pass recorded as a gap.
 *
 * **2. Vivid accents had nodes and were thrown away before ranking.** On the round-1 miss
 * (`…35b967964d`, *"accent wrongly collapsed — vivid red-orange missed"*) the L tree **already
 * retained** the red: representatives `#ee5567`, `#f45c6b`, `#e65157`, at chromatic distances ~0.19 from
 * the field against 0.058 for the accent that published. They never reached the accent ranking because
 * the role stage truncated the mark set **by area** first, and those nodes cover 0.0005–0.002 of the
 * cover. The fix — truncate along the ranking you are about to apply — is `parseTree`'s now, and
 * `ACCENT_CANDIDATE_LIMIT` is the size of that cut.
 *
 * ## Nothing here is a rule
 *
 * Every decision — the stability filter, the area floor, the field/mark split, the representative
 * colour, the clustering, the two rankings — belongs to `../pipeline.ts` or to `../constants.ts`. This
 * file builds three trees and passes two of them along.
 */

import type { Rgb8 } from "../../../../src/contract/types.ts"
import { decodeImage, parseTree, type DecodedImage, type LaneInput, type Parse } from "../pipeline.ts"
import { quantiseLanes } from "./channels.ts"
import { LANES, type Lane } from "./constants.ts"
import { buildLane, makeLabCache, type BuiltLane, type LaneNode } from "./nodes.ts"

/** A mark node in the shared pool, with the lane it came from. */
export type PoolMark = Readonly<{ node: LaneNode; laneIndex: number }>

/** The merged pipeline's result: the three lanes and the parse taken over all of them. */
export type ChromaResult = Readonly<{
	image: DecodedImage
	/** In `LANES` order: L, a, b. */
	lanes: readonly BuiltLane[]
	/** The parse, over the shared pool. */
	parse: Parse
	/** Retained mark nodes offered to the pool, per lane, in `LANES` order. */
	markCountByLane: readonly number[]
}>

/** Marks offered to the pool, in `LANES` order then lane node id. */
export function poolMarks(lanes: readonly BuiltLane[]): PoolMark[] {
	const marks: PoolMark[] = []
	for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
		for (const node of lanes[laneIndex].nodes) {
			// A ground-chain member is always a field by construction — the chain only descends into
			// children at or above `FIELD_AREA_FRACTION` — so the `kind` test is the whole filter.
			if (node.kind !== "mark") continue
			marks.push({ node, laneIndex })
		}
	}
	return marks
}

/** A built lane in the shape `parseTree` reads. Type-only glue; no values are copied. */
export function laneInputOf(built: BuiltLane): LaneInput {
	return { lane: built.lane, tree: built.tree, nodes: built.nodes }
}

/**
 * **Decode once, build one tree per lane, parse over all of them.**
 *
 * The L lane's tree is the one an L-only `runPipeline` would have built — same array, same level count
 * — so `parseTree(image, lanes[0].tree)` with no extra lanes *is* the round-1 parse, and this call is
 * that parse with the chromatic lanes' nodes added to its pool. Field roles, the ground chain and the
 * verdict are unchanged by construction: `parseTree` reads them off the L tree alone.
 */
export async function runChromaPipeline(imagePath: string): Promise<ChromaResult> {
	const image = await decodeImage(imagePath)
	const channels = quantiseLanes(image)
	const lanes = channels.map((channel) => buildLane(image, channel))
	const parse = parseTree(image, lanes[0].tree, lanes.slice(1).map(laneInputOf))
	// `parseTree` lays the lanes out end to end in one id space, in this same order, so the offset walk
	// is the layout read back rather than a second convention.
	let cursor = 0
	for (const built of lanes) {
		adoptThinness(parse, built, cursor)
		cursor += built.nodes.length
	}
	return {
		image,
		lanes,
		parse,
		markCountByLane: lanes.map((built) => built.nodes.filter((node) => node.kind === "mark").length),
	}
}

/**
 * Carry `parseTree`'s already-computed thinness values onto a lane's own node objects.
 *
 * `parseTree` builds its own `ParsedNode` objects — for the L lane directly, for the chromatic lanes as
 * copies in one shared id space — and pays for a distance transform on each component. `buildLane` built
 * a separate set of objects over the same trees. Matching them on `treeNodeId` costs nothing and lets
 * `lanes/dump.ts` publish a measured thinness instead of a column of nulls.
 *
 * `idOffset` is where this lane's block starts in the parse's id space. It is not decoration: three
 * trees have three independent `treeNodeId` spaces, so matching without it would carry an `a`-lane
 * node's thinness onto the L node that happens to share its tree id.
 */
export function adoptThinness(parse: Parse, lane: BuiltLane, idOffset = 0): void {
	const thinnessByTreeNode = new Map<number, number>()
	for (const node of parse.nodes) {
		if (node.id < idOffset || node.id >= idOffset + lane.nodes.length) continue
		if (node.thinness !== null) thinnessByTreeNode.set(node.treeNodeId, node.thinness)
	}
	for (const node of lane.nodes) {
		const known = thinnessByTreeNode.get(node.treeNodeId)
		if (known !== undefined) node.thinness = known
	}
}

/** Build a single lane by name — used by the tests to exercise one chromatic tree in isolation. */
export function buildSingleLane(image: DecodedImage, lane: Lane): BuiltLane {
	const channel = quantiseLanes(image).find((candidate) => candidate.lane === lane)
	if (channel === undefined) throw new Error(`unknown lane ${lane}`)
	return buildLane(image, channel)
}

/** The chromatic distance from a field colour that both the accent order and its tests read. */
export function chromaFromFieldOf(background: Rgb8): (color: Rgb8) => number {
	const labOf = makeLabCache()
	const backgroundLab = labOf(background)
	return (color) => {
		const lab = labOf(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
}

export { LANES }
