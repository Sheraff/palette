/**
 * **Q3, second pass — what lost the 42 `above-floor-region` slots?**
 *
 * `q3/run.ts` finds that the largest class of reachability failure is a slot whose endorsed colour
 * *does* exist as a bar-coherent connected region at or above `MIN_NODE_AREA_FRACTION` — and that this
 * class holds **18 of the 24** pre-registered falsifier slots. For those, a smaller floor recovers
 * nothing, because the floor was never what removed them. Two other mechanisms can:
 *
 *  1. **retention** — the tree named the region, but `selectStableNodes` did not keep a node at the
 *    region's own scale, so the region sits inside a much larger retained ancestor and its colour is
 *    never anybody's representative. Diagnostic: `ancestorAreaOverRegionArea` is large.
 *  2. **the representative rule** — a retained node *is* at the region's scale, but
 *    `representativeColor`'s bar-density mode elected a different triple from its cloud (the region's
 *    colour lost the mass vote inside its own node). Diagnostic: the ratio is near 1 and the node's
 *    representative is outside the bar.
 *
 * For each `above-floor-region` slot this walks the largest region's pixels up each lane's tree to the
 * nearest **retained** node, takes the smallest such node found over the three lanes, and reports its
 * area, its representative and the bar ratio of that representative to the endorsed colour. The split
 * is at `SCALE_RATIO_CUT` (4×) — a diagnosis cut declared here, with the raw ratio published per slot.
 *
 * Provenance tag: `p2-tos-identity/q3-above-floor@1`.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { runChromaPipeline } from "../../lanes/pool.ts"
import { barMaskOf } from "../pixels.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const P2 = resolve(HERE, "..", "..", "..")
const WORKTREE = resolve(P2, "..", "..", "..", "..")

/** Diagnosis cut: a retained node no more than this many times the region's area is "at its scale". */
const SCALE_RATIO_CUT = 4

const q3 = JSON.parse(readFileSync(resolve(HERE, "report.json"), "utf8")) as {
	rows: {
		imagePath: string
		entryId: string
		role: string
		target: string
		falsifies: boolean
		largestRegionPixels: number
		largestRegionAreaFraction: number
		classification: string
	}[]
}

const rgbOf = (hex: string): Rgb8 => {
	const value = Number.parseInt(hex.replace("#", ""), 16)
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

const rows = q3.rows.filter((row) => row.classification === "above-floor-region")
const byImage = new Map<string, typeof rows>()
for (const row of rows) {
	const bucket = byImage.get(row.imagePath)
	if (bucket === undefined) byImage.set(row.imagePath, [row])
	else bucket.push(row)
}

type Verdict = "retention-lost-the-scale" | "representative-rule-lost-the-colour" | "no-retained-ancestor" | "other"
const out: {
	imagePath: string
	entryId: string
	role: string
	target: string
	falsifies: boolean
	regionPixels: number
	regionAreaFraction: number
	bestLane: string | null
	ancestorAreaFraction: number | null
	ancestorAreaOverRegionArea: number | null
	ancestorRepr: string | null
	ancestorReprBarRatio: number | null
	verdict: Verdict
}[] = []

const paths = Array.from(byImage.keys()).sort()
let done = 0
for (const shortPath of paths) {
	const imagePath = resolve(WORKTREE, shortPath)
	const { image, lanes } = await runChromaPipeline(imagePath)
	const totalPixels = image.width * image.height

	// Per lane: the retained tree-node ids, and each node's representative.
	const retained = lanes.map((lane) => {
		const reprByTreeNode = new Map<number, Rgb8>()
		for (const node of lane.nodes) reprByTreeNode.set(node.treeNodeId, node.repr)
		return { tree: lane.tree, lane: lane.lane, reprByTreeNode }
	})

	for (const row of (byImage.get(shortPath) ?? []).slice().sort((first, second) => first.entryId.localeCompare(second.entryId) || first.role.localeCompare(second.role))) {
		const target = rgbOf(row.target)
		const targetLab = rgbToOkLab(target)
		const targetColor = colorFromRgb(target)

		// Re-find the largest bar-coherent region, so this pass reads the same pixels q3/run.ts classified.
		const mask = barMaskOf(image, target)
		const labels = new Int32Array(mask.length)
		let bestLabel = 0
		let bestArea = 0
		let count = 0
		const stack: number[] = []
		for (let start = 0; start < mask.length; start += 1) {
			if (mask[start] === 0 || labels[start] !== 0) continue
			count += 1
			labels[start] = count
			stack.push(start)
			let area = 0
			while (stack.length > 0) {
				const current = stack.pop() as number
				area += 1
				const x = current % image.width
				const y = (current - x) / image.width
				for (let dy = -1; dy <= 1; dy += 1) {
					for (let dx = -1; dx <= 1; dx += 1) {
						if (dx === 0 && dy === 0) continue
						const nx = x + dx
						const ny = y + dy
						if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue
						const neighbour = ny * image.width + nx
						if (mask[neighbour] === 0 || labels[neighbour] !== 0) continue
						labels[neighbour] = count
						stack.push(neighbour)
					}
				}
			}
			if (area > bestArea) {
				bestArea = area
				bestLabel = count
			}
		}

		// Walk the region's pixels up each lane's tree to the nearest retained node; keep the smallest.
		let best: { lane: string; area: number; repr: Rgb8 } | null = null
		for (const lane of retained) {
			const seen = new Set<number>()
			for (let pixel = 0; pixel < labels.length; pixel += 1) {
				if (labels[pixel] !== bestLabel) continue
				let node = lane.tree.nodeOfPixel[pixel]
				if (seen.has(node)) continue
				let guard = 0
				while (!lane.reprByTreeNode.has(node) && node !== lane.tree.rootId && guard < 1e6) {
					node = lane.tree.nodeParent[node]
					guard += 1
				}
				seen.add(node)
				const repr = lane.reprByTreeNode.get(node)
				if (repr === undefined) continue
				const area = lane.tree.nodeSubtreeArea[node]
				if (best === null || area < best.area) best = { lane: lane.lane, area, repr }
			}
		}

		let verdict: Verdict = "other"
		let ratio: number | null = null
		let barRatio: number | null = null
		if (best === null) verdict = "no-retained-ancestor"
		else {
			ratio = best.area / Math.max(1, bestArea)
			const distance = okLabDistance(targetLab, rgbToOkLab(best.repr))
			barRatio = distance / sameColorBar(targetColor, colorFromRgb(best.repr))
			verdict = ratio > SCALE_RATIO_CUT ? "retention-lost-the-scale" : "representative-rule-lost-the-colour"
		}

		out.push({
			imagePath: shortPath,
			entryId: row.entryId,
			role: row.role,
			target: row.target,
			falsifies: row.falsifies,
			regionPixels: bestArea,
			regionAreaFraction: bestArea / totalPixels,
			bestLane: best?.lane ?? null,
			ancestorAreaFraction: best === null ? null : best.area / totalPixels,
			ancestorAreaOverRegionArea: ratio,
			ancestorRepr: best === null ? null : colorFromRgb(best.repr).hex,
			ancestorReprBarRatio: barRatio,
			verdict,
		})
	}
	done += 1
	console.error(`  ${done}/${paths.length}`)
}

const counts: Record<string, number> = {}
const countsFalsifier: Record<string, number> = {}
for (const row of out) {
	counts[row.verdict] = (counts[row.verdict] ?? 0) + 1
	if (row.falsifies) countsFalsifier[row.verdict] = (countsFalsifier[row.verdict] ?? 0) + 1
}

const report = {
	provenance: "p2-tos-identity/q3-above-floor@1",
	question: "for the above-floor-region failures, was it retention or the representative rule?",
	cuts: { SCALE_RATIO_CUT, note: "SCALE_RATIO_CUT is a diagnosis cut declared in q3/above-floor.ts, not a pipeline constant" },
	totals: { slots: out.length, falsifierSlots: out.filter((row) => row.falsifies).length, artworks: paths.length },
	counts,
	countsFalsifier,
	rows: out,
}
writeFileSync(resolve(HERE, "above-floor.json"), `${JSON.stringify(report, null, "\t")}\n`)
console.log(JSON.stringify({ totals: report.totals, counts, countsFalsifier }, null, 2))
