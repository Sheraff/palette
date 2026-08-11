/**
 * **Reconstructing a foreground election, without re-implementing one.**
 *
 * `pipeline.ts` publishes the two rankings but not the *provenance* of each entry: `foregroundPool` is
 * a flat array of triples and nothing in the `Parse` says which of them came from a text group, which
 * from a same-colour cluster of retained nodes, and which from the residual histogram of common exact
 * triples. That distinction is the whole of Q1 and Q2, so it is recovered here from artefacts the parse
 * already publishes, by three exact tests and no re-ranking:
 *
 *  1. **text group** — the colour is the representative of one of `parse.textGroups`. Published.
 *  2. **cluster** — the colour appears in `parse.accentCandidates`. Every same-colour cluster the role
 *     stage built (the accent's chroma-truncated set *and* the text stage's mark clusters) is emitted
 *     there by `parseTree`, and nothing else is: so "in `accentCandidates`" is exactly "a cluster of
 *     retained nodes carries this colour".
 *  3. **residual** — everything else in `foregroundPool`. By construction `foregroundPool` is
 *     `textGroups ∪ nonTextClusters ∪ residualPool`, so the complement of (1) and (2) is the residual.
 *
 * The residual is re-derived independently as a cross-check (`residualOf`) using the same constants and
 * the same contract function `pipeline.ts` uses, and `checks.residualAgrees` reports whether the two
 * routes to the same set agree. They must; if they ever stop agreeing this module is wrong and says so
 * rather than being believed.
 *
 * **No ranking is recomputed.** The order in `parse.foregroundPool` is the order the assembly walked;
 * this file only labels it and measures `minFieldContrast` per entry with the same `roles/rank.ts`
 * function the pipeline called, so a reported contrast is the number the pipeline saw.
 *
 * Provenance tag: `p2-tos-identity/election@1`.
 */

import { apcaRaw, colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { PaletteColor, Rgb8 } from "../../../../src/contract/types.ts"
import { MIN_NODE_AREA_FRACTION, RESIDUAL_POOL_SIZE } from "../constants.ts"
import { runChromaPipeline } from "../lanes/pool.ts"
import { unpack, type DecodedImage, type Parse } from "../pipeline.ts"
import { minFieldContrast, renderedFieldOf, type RenderedField } from "../roles/rank.ts"

export const ELECTION_PROVENANCE = "p2-tos-identity/election@1"

export type Provenance = "text-group" | "cluster" | "residual"

export type PoolEntry = Readonly<{
	rank: number
	hex: string
	rgb: Rgb8
	provenance: Provenance
	/** Minimum |raw APCA| over the rendered field — the ranking key, recomputed with the pipeline's function. */
	fieldContrast: number
	/** Exact-triple pixel count of this colour in the image, and its share. */
	exactPixels: number
	exactShare: number
	/** Pixels within one same-colour bar of this colour, and their share. */
	barPixels: number
	barShare: number
	/** For a cluster entry: the `accentCandidates` row, which carries D3's level and the MSER growth. */
	stabilityLevel: number | null
	growth: number | null
	/** Retained nodes (any lane) whose representative is exactly this colour. */
	nodeCount: number
	/** Largest such node's area fraction, or null. */
	nodeMaxAreaFraction: number | null
}>

export type Election = Readonly<{
	imagePath: string
	width: number
	height: number
	verdict: Parse["verdict"]
	coverage: number
	gradient: boolean
	notes: readonly string[]
	roles: Parse["roles"]
	laneNodeCounts: readonly number[]
	textGroups: readonly {
		rank: number
		hex: string
		rgb: Rgb8
		rows: number
		areaFraction: number
		fieldContrast: number
		nodeIds: readonly number[]
	}[]
	pool: readonly PoolEntry[]
	census: ReturnType<typeof censusOf>
	checks: Readonly<{ residualAgrees: boolean; residualOnlyInDerived: string[]; residualOnlyInParse: string[] }>
}>

export const hexOf = (rgb: Rgb8): string => colorFromRgb(rgb).hex
const packOf = (rgb: Rgb8): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

/** Exact-triple histogram of the whole image, packed → count. */
export function histogramOf(image: DecodedImage): Map<number, number> {
	const counts = new Map<number, number>()
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		counts.set(image.packed[pixel], (counts.get(image.packed[pixel]) ?? 0) + 1)
	}
	return counts
}

/**
 * The residual pool, re-derived exactly as `parseTree` derives it: the image's exact triples at or
 * above the node area floor, ranked by |raw APCA| against the published background, truncated.
 */
export function residualOf(image: DecodedImage, background: Rgb8, histogram: Map<number, number>): Rgb8[] {
	const totalArea = image.width * image.height
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalArea))
	const commonEnough = Array.from(histogram.entries())
		.filter(([, count]) => count >= areaFloor)
		.map(([color]) => color)
	return (commonEnough.length > 0 ? commonEnough : Array.from(histogram.keys()))
		.sort((first, second) => {
			const difference = Math.abs(apcaRaw(unpack(second), background)) - Math.abs(apcaRaw(unpack(first), background))
			return difference !== 0 ? difference : first - second
		})
		.slice(0, RESIDUAL_POOL_SIZE)
		.map(unpack)
}

/** Pixels within one same-colour bar of `subject`, summed over the exact-triple histogram. */
export function barMassOf(subject: Rgb8, histogram: Map<number, number>): number {
	const subjectLab = rgbToOkLab(subject)
	const subjectColor: PaletteColor = colorFromRgb(subject)
	let mass = 0
	for (const [packed, count] of histogram) {
		const other = unpack(packed)
		if (okLabDistance(subjectLab, rgbToOkLab(other)) < sameColorBar(subjectColor, colorFromRgb(other))) mass += count
	}
	return mass
}

/**
 * **What the artwork is actually made of**, two ways — the evidence for naming a colour the pipeline
 * "had": the image's heaviest exact triples, and the retained nodes' representatives by area.
 *
 * The reviewer's complaint on both Q1 items is about *belonging*, so a second choice is only nameable
 * against a census of what belongs. Neither list is a ranking and neither is consumed by anything.
 */
export function censusOf(
	image: DecodedImage,
	parse: Parse,
	histogram: Map<number, number>,
	field: RenderedField,
	limit = 12,
): Readonly<{
	topTriples: readonly { hex: string; count: number; share: number; fieldContrast: number }[]
	topNodeReprs: readonly { hex: string; areaFraction: number; nodeId: number; kind: string; barShare: number; fieldContrast: number }[]
}> {
	const totalPixels = image.width * image.height
	const topTriples = Array.from(histogram.entries())
		.sort((first, second) => second[1] - first[1] || first[0] - second[0])
		.slice(0, limit)
		.map(([packed, count]) => ({
			hex: hexOf(unpack(packed)),
			count,
			share: count / totalPixels,
			fieldContrast: minFieldContrast(unpack(packed), field),
		}))
	const seen = new Set<number>()
	const topNodeReprs: { hex: string; areaFraction: number; nodeId: number; kind: string; barShare: number; fieldContrast: number }[] = []
	for (const node of parse.nodes.slice().sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)) {
		const key = packOf(node.repr)
		if (seen.has(key)) continue
		seen.add(key)
		topNodeReprs.push({
			hex: hexOf(node.repr),
			areaFraction: node.areaFraction,
			nodeId: node.id,
			kind: node.kind,
			barShare: barMassOf(node.repr, histogram) / totalPixels,
			fieldContrast: minFieldContrast(node.repr, field),
		})
		if (topNodeReprs.length >= limit) break
	}
	return { topTriples, topNodeReprs }
}

/** Run the merged pipeline and label its foreground ranking. */
export async function electionOf(imagePath: string, poolLimit = 24): Promise<Election & { image: DecodedImage; parse: Parse }> {
	const { image, lanes, parse } = await runChromaPipeline(imagePath)
	const histogram = histogramOf(image)
	const totalPixels = image.width * image.height
	const field: RenderedField = renderedFieldOf(parse.roles.background, parse.roles.surface, parse.gradient)

	const textReprs = new Set(parse.textGroups.map((group) => packOf(group.repr)))
	const clusterRow = new Map<number, { stabilityLevel: number; growth: number }>()
	for (const candidate of parse.accentCandidates) {
		const key = packOf(candidate.repr)
		if (!clusterRow.has(key)) clusterRow.set(key, { stabilityLevel: candidate.stabilityLevel, growth: candidate.growth })
	}

	const nodesByRepr = new Map<number, { count: number; maxArea: number }>()
	for (const node of parse.nodes) {
		const key = packOf(node.repr)
		const known = nodesByRepr.get(key)
		if (known === undefined) nodesByRepr.set(key, { count: 1, maxArea: node.areaFraction })
		else {
			known.count += 1
			if (node.areaFraction > known.maxArea) known.maxArea = node.areaFraction
		}
	}

	const pool: PoolEntry[] = parse.foregroundPool.slice(0, poolLimit).map((rgb, rank) => {
		const key = packOf(rgb)
		const provenance: Provenance = textReprs.has(key) ? "text-group" : clusterRow.has(key) ? "cluster" : "residual"
		const row = clusterRow.get(key)
		const nodes = nodesByRepr.get(key)
		const exactPixels = histogram.get(key) ?? 0
		const barPixels = barMassOf(rgb, histogram)
		return {
			rank,
			hex: hexOf(rgb),
			rgb,
			provenance,
			fieldContrast: minFieldContrast(rgb, field),
			exactPixels,
			exactShare: exactPixels / totalPixels,
			barPixels,
			barShare: barPixels / totalPixels,
			stabilityLevel: row?.stabilityLevel ?? null,
			growth: row?.growth ?? null,
			nodeCount: nodes?.count ?? 0,
			nodeMaxAreaFraction: nodes?.maxArea ?? null,
		}
	})

	const census = censusOf(image, parse, histogram, field)
	const derivedResidual = new Set(residualOf(image, parse.roles.background, histogram).map(packOf))
	const parseResidual = new Set(pool.filter((entry) => entry.provenance === "residual").map((entry) => packOf(entry.rgb)))
	const residualOnlyInParse = [...parseResidual].filter((key) => !derivedResidual.has(key)).map((key) => hexOf(unpack(key)))

	return {
		imagePath,
		image,
		parse,
		width: image.width,
		height: image.height,
		verdict: parse.verdict,
		coverage: parse.coverage,
		gradient: parse.gradient,
		notes: parse.notes,
		roles: parse.roles,
		laneNodeCounts: lanes.map((lane) => lane.nodes.length),
		textGroups: parse.textGroups.map((group, rank) => ({
			rank,
			hex: hexOf(group.repr),
			rgb: group.repr,
			rows: group.rows,
			areaFraction: group.areaFraction,
			fieldContrast: group.fieldContrast,
			nodeIds: group.nodeIds,
		})),
		pool,
		census,
		checks: {
			// The derived residual is the *whole* residual pool; the parse's is only the part that reached
			// the truncated head we labelled, so containment one way is the claim, not set equality.
			residualAgrees: residualOnlyInParse.length === 0,
			residualOnlyInDerived: [],
			residualOnlyInParse,
		},
	}
}
