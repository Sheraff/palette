/**
 * One shared candidate pool over three lanes, and the accent ranking read off it.
 *
 * ## The two recall gaps this closes, and which one is which
 *
 * **1. Isoluminant regions have no node at all.** A tree over L cannot contain a node separating two
 * regions of equal lightness — they are the same level set, so there is nothing to retain, and no
 * constant repairs it. `channels.ts` adds the a and b trees; this module folds their retained nodes
 * into the pool the accent is ranked over, so a region is invisible only when it matches its surround
 * in L *and* a *and* b (arm-b′ §2.1). `tests/chromatic-tree.test.ts` shows the mechanism directly: on
 * a mark that does not move in lightness against its own field, the L tree contains no node for it
 * and the a tree does.
 *
 * **2. Vivid accents had nodes and were thrown away before ranking.** This one is not about channels
 * and was worth finding out. On the round-1 miss (`…35b967964d`, *"accent wrongly collapsed — vivid
 * red-orange missed"*) the L tree **already retained** the red: nodes with representative colours
 * `#ee5567`, `#f45c6b`, `#e65157`, at chromatic distances ~0.19 from the field, against 0.058 for the
 * accent that published. They never reached the accent ranking because the role stage truncates the
 * mark set **by area** before ranking anything (cycle 1's `MARK_NODE_LIMIT`, cycle 2's
 * `TEXT_COMPONENT_LIMIT`), and those nodes cover 0.0005–0.002 of the cover — the one that now carries
 * the accent ranks 602nd by area out of 963 marks. A vivid accent is characteristically small; an
 * area-ordered cost guard in front of the accent ranking is a saturation wall by another route.
 *
 * The fix is structural, not a new score and not a floor: **truncate along the ranking you are about
 * to apply.** Accent candidates are ordered by the accent key first and only that order's tail is
 * dropped (`ACCENT_CANDIDATE_LIMIT`), so nothing dropped could have won — everything kept is more
 * chromatic than everything dropped. There is no minimum saturation anywhere: a low-chroma cover
 * simply yields a low-chroma accent, and the contract's own separation and contrast rules decide
 * whether it publishes.
 *
 * ## Scope: the accent, not the foreground
 *
 * The foreground pool is `parseTree`'s, untouched and passed through. Cycle 2's foreground work — the
 * arm-b text detector, APCA-over-the-rendered-ramp ranking, the component chain collapse — is a
 * sibling worker's, landing in `pipeline.ts` and `roles/` in parallel with this. Grafting lane nodes
 * into *that* ranking needs the component rule to run per lane, which is an edit to `pipeline.ts`
 * this worker does not own. So the lanes reach one role this cycle. That is a scope statement, not a
 * claim that isoluminant foregrounds do not matter.
 *
 * ## The one rule conflict, stated rather than resolved
 *
 * `pipeline.ts`'s accent ranking now leads with **minimum APCA contrast over the rendered field**,
 * with chroma-from-field demoted to a tie-break. This module leads with **chroma-from-field**, which
 * is arm-b′ §2.6's rule, this cycle's brief, and the cycle-2 obligation the reviewer priced:
 * *"artwork identity binds: vivid accents must be mined."* The two orderings disagree on the
 * acceptance cover — contrast-first elects `#6a723f`, the dark olive of the border thread (chroma
 * 0.052, contrast 59.1); chroma-first elects the coral red of the leaves (chroma 0.19, contrast 44.5)
 * — and the disagreement is a decision for whoever sequences the merge, not for this file to settle
 * quietly. Readability is not thereby abandoned: the contract's floors gate publication in
 * `roles/assemble.ts`'s walk, so an unreadable accent is refused there rather than pre-empted here.
 *
 * ## Nothing else here is a new rule
 *
 * The clustering and the cluster representative are `parseTree`'s, restated because this worker does
 * not own `pipeline.ts`; the ranking keys are arm-b′ §2.6's; the residual tail is reached by keeping
 * `parseTree`'s own pool underneath. `tests/parity.test.ts` pins the parts that are restated.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { decodeImage, parseTree, type DecodedImage, type Parse } from "../pipeline.ts"
import { quantiseLanes } from "./channels.ts"
import { ACCENT_CANDIDATE_LIMIT, LANES, type Lane } from "./constants.ts"
import { buildLane, makeLabCache, type BuiltLane, type LaneNode } from "./nodes.ts"

/** A mark node in the shared pool, with the lane it came from. */
type PoolMark = Readonly<{ node: LaneNode; laneIndex: number }>

/** A group of pool marks whose representative colours are the same colour by the contract's bar. */
type Cluster = Readonly<{ repr: Rgb8; count: number; firstLaneIndex: number; firstNodeId: number }>

/** The chromatic pipeline's result: the L parse, the three lanes, and the pool they agreed on. */
export type ChromaResult = Readonly<{
	image: DecodedImage
	/** In `LANES` order: L, a, b. */
	lanes: readonly BuiltLane[]
	/** What `p2-tos` parses from the L lane alone, untouched. */
	base: Parse
	/** The same parse with the accent ranking and the accent taken over the shared pool. */
	parse: Parse
	/** Retained mark nodes offered to the pool, per lane, in `LANES` order. */
	markCountByLane: readonly number[]
	/** How many marks the accent ranking clustered after its own truncation. */
	accentCandidateCount: number
}>

/** Marks in the shared pool, in `LANES` order then lane node id. */
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

/**
 * Cluster marks by same-colour proximity of their representative colours — `parseTree`'s rule.
 *
 * Union-find over an ascending scan of pairs, so the clustering is a function of the marks' order and
 * of nothing else; a merge always points the higher root at the lower one. The cluster's colour is
 * its largest member's, ties on position, which is `parseTree`'s choice too.
 *
 * This also folds a *chain* of nodes naming one region at successive levels into one candidate, which
 * is why the accent ranking does not need `roles/`'s component rule: that rule exists for the text
 * detector's geometry, and nothing in the accent's ordering is geometric.
 */
function clusterMarks(marks: readonly PoolMark[]): Cluster[] {
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
		const one = colorFromRgb(marks[first].node.repr)
		const oneLab = rgbToOkLab(marks[first].node.repr)
		for (let second = first + 1; second < marks.length; second += 1) {
			const other = colorFromRgb(marks[second].node.repr)
			if (okLabDistance(oneLab, rgbToOkLab(marks[second].node.repr)) < sameColorBar(one, other)) {
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
	return Array.from(clusterOf.keys())
		.sort((first, second) => first - second)
		.map((root) => {
			const members = (clusterOf.get(root) ?? []).slice().sort((first, second) => first - second)
			const largest = members
				.slice()
				.sort((first, second) => marks[second].node.areaFraction - marks[first].node.areaFraction || first - second)[0]
			return {
				repr: marks[largest].node.repr,
				count: members.length,
				firstLaneIndex: marks[members[0]].laneIndex,
				firstNodeId: marks[members[0]].node.id,
			}
		})
}

/** Drop repeats, keeping the first occurrence — `parseTree`'s `dedupe`. */
function dedupe(colors: readonly Rgb8[]): Rgb8[] {
	const seen = new Set<number>()
	const kept: Rgb8[] = []
	for (const color of colors) {
		const packed = (color[0] << 16) | (color[1] << 8) | color[2]
		if (seen.has(packed)) continue
		seen.add(packed)
		kept.push(color)
	}
	return kept
}

/**
 * The shared pool's accent ranking, folded into a copy of the L lane's parse.
 *
 * Field roles — background, surface, the gradient boolean, the verdict — are the L lane's and are not
 * touched: a ground stack is a reading of lightness structure. The accent is then decided exactly as
 * `parseTree` decides it, as the first candidate clearing the contract's own
 * `FOREGROUND_ACCENT_SEPARATION_DISTANCE` from the foreground, collapsing onto it when none does.
 */
export function mergePools(image: DecodedImage, lanes: readonly BuiltLane[], base: Parse): ChromaResult {
	const marks = poolMarks(lanes)

	const labOf = makeLabCache()
	const backgroundLab = labOf(base.roles.background)
	// arm-b′ §2.6: chromatic distance from the field it sits on, lightness movement as the tie-break —
	// `perception-4`'s direction, taken as a direction and never as a coefficient.
	const chromaFromField = (color: Rgb8): number => {
		const lab = labOf(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
	const lightnessMove = (color: Rgb8): number => Math.abs(labOf(color)[0] - backgroundLab[0])
	const byAccentKey = (first: Rgb8, second: Rgb8): number =>
		chromaFromField(second) - chromaFromField(first) || lightnessMove(second) - lightnessMove(first)

	// Ordered by the accent key itself, and only its tail dropped. This is the round-1 recall fix: the
	// cut is along the ordering being applied, so nothing below it could have won.
	const accentMarks = marks
		.slice()
		.sort(
			(first, second) =>
				byAccentKey(first.node.repr, second.node.repr) ||
				first.laneIndex - second.laneIndex ||
				first.node.id - second.node.id,
		)
		.slice(0, ACCENT_CANDIDATE_LIMIT)
	const accentClusters = clusterMarks(accentMarks).sort(
		(first, second) =>
			byAccentKey(first.repr, second.repr) ||
			first.firstLaneIndex - second.firstLaneIndex ||
			first.firstNodeId - second.firstNodeId,
	)

	// `parseTree`'s own accent pool is the tail, which is how the residual — the image's sufficiently
	// common exact triples, ranked by APCA against the background — reaches this ranking without being
	// recomputed, and how every candidate the L-only parse offered stays offered.
	const accentPool = dedupe([...accentClusters.map((cluster) => cluster.repr), ...base.accentPool])
	// `parseTree`'s own rule, verbatim: the contract's separation constant is consumed, not re-derived,
	// because choosing under a tighter rule publishes palettes the contract then refuses.
	const foreground = base.roles.foreground
	const accent =
		accentPool.find(
			(color) => okLabDistance(labOf(color), labOf(foreground)) >= FOREGROUND_ACCENT_SEPARATION_DISTANCE,
		) ?? foreground

	return {
		image,
		lanes,
		base,
		parse: {
			...base,
			roles: { ...base.roles, accent },
			accentPool,
			notes: [...base.notes, `lanes:${LANES.join("+")}`, `accent-candidates:${accentMarks.length}`],
		},
		markCountByLane: lanes.map((built) => built.nodes.filter((node) => node.kind === "mark").length),
		accentCandidateCount: accentMarks.length,
	}
}

/** Decode once, build one tree per lane, parse the L lane, merge the pools. */
export async function runChromaPipeline(imagePath: string): Promise<ChromaResult> {
	const image = await decodeImage(imagePath)
	const channels = quantiseLanes(image)
	const lanes = channels.map((channel) => buildLane(image, channel))
	// The L lane's tree is the one `runPipeline` would have built — same array, same level count — so
	// the base parse here *is* `p2-tos`'s parse, not a re-derivation of it.
	const base = parseTree(image, lanes[0].tree)
	adoptThinness(base, lanes[0])
	return mergePools(image, lanes, base)
}

/**
 * Carry `parseTree`'s already-computed thinness values onto the L lane's own node objects.
 *
 * `parseTree` pays for a distance transform on each of its components; `laneRetainedNodes` built a
 * separate set of objects over the same tree. Matching them on `treeNodeId` — which is the same tree
 * — costs nothing and lets the dump publish the L lane's thinness instead of a column of nulls. The
 * chromatic lanes carry no thinness: nothing in the accent ordering is geometric, and a distance
 * transform per node on two more trees would be paid for a column nobody reads.
 */
export function adoptThinness(base: Parse, lane: BuiltLane): void {
	const thinnessByTreeNode = new Map<number, number>()
	for (const node of base.nodes) if (node.thinness !== null) thinnessByTreeNode.set(node.treeNodeId, node.thinness)
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
