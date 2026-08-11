/**
 * **The family census.** Which distinct chromatic colour families does this artwork carry, beyond its
 * own field, and in what order do they claim a role?
 *
 * ## Why this file exists
 *
 * `../../DECISIONS.md` D9, ruling the pair-015 verdicts. The reviewer preferred the palette whose accent
 * was a *worse* colour, and said why: side A *"represents more of the artwork: pale background, green and
 * red subject"*, side B *"has the correct shade of red (Strawberry Moon), but doesn't have the green"*.
 * The ordering question — chroma-first or APCA-first — was the wrong question, because **one accent slot
 * cannot carry two colour families**. D4 ("identity-coverage is a grading axis") and D5 ("accent should
 * sit in a different colour FAMILY than background/surface") are the same signal from two other rounds:
 * reviewer-priced three times, on three covers, before a line of this was written.
 *
 * This module answers only the census half — *what families are there, and which leads*. `allocate.ts`
 * owns what the palette does about it.
 *
 * ## What a family is, and where its width comes from
 *
 * A family is a **maximal run of hues** among the pool's chromatic non-field colours, cut wherever the
 * hue circle shows a gap wider than one *family separation*. Two things are load-bearing and neither is
 * a new number:
 *
 * **1. "Chromatic" is the contract's own word.** `colorRegion` splits sRGB into four regions at
 * `REGION_CHROMA_BOUNDARY` (0.05) and `REGION_LIGHTNESS_BOUNDARY`; those are *the bracketing round's own
 * strata boundaries*, so a colour is called chromatic here exactly when the reviewer's own judgements
 * would have been stratified as saturated. Nothing is invented: `colorRegion(c)` ending in `-saturated`
 * is the whole test.
 *
 * **2. The family separation is the same-colour bar's own hue geometry.** Two OKLab colours of equal
 * lightness and equal chroma `C`, separated by hue angle `Δh`, sit at distance `2·C·sin(Δh/2)`. Ask the
 * contract's ruler the question it can answer — *at what hue angle do two colours stop being the same
 * colour?* — at the weakest chroma that still counts as chromatic, `C = REGION_CHROMA_BOUNDARY`:
 *
 *     2 · REGION_CHROMA_BOUNDARY · sin(Δh / 2) = SAME_COLOR_BAR_BY_REGION["light-saturated"]
 *     Δh = 2 · asin( 0.02293 / (2 × 0.05) ) = 0.46291 rad = 26.52°
 *
 * `light-saturated` is the **largest** of the two saturated bars, chosen for the same reason
 * `sameColorBar` itself takes `Math.max` over a straddling pair: the wider bar is the conservative
 * direction here — it produces *fewer, wider* families, so the census reports ≥2 families less often and
 * the allocation rule fires less often. Where the derivation is a reasoned default rather than a
 * measurement, it should err toward leaving the published palette alone.
 *
 * So `FAMILY_HUE_SEPARATION` is **derived, not declared**: it is computed at load from two committed
 * contract constants and it moves if either of them is ever recalibrated. It is reported in the census
 * so a round can price it, and `DESIGN.md` names the round item that would.
 *
 * ## The ranking, and why concentration rather than mass
 *
 * D8: *"concentration/coherence beats raw population share; mass floors exclude exactly what the
 * reviewer asks for"* — measured on another arm, where 4 of 7 reviewer-named identity marks sat at rank
 * 0 of the accent order and were cut by a 0.1% population floor. So no family is ever *excluded* here
 * for being small, and the ordering key is not a sum over members:
 *
 *  1. **salience level** (0 leads, 1 may not) — D3's rule that presence ≠ eligibility, at the pool's own
 *     lower-median MSER growth, the same order statistic `pipeline.ts` splits the foreground on. A
 *     family is level 0 when *any* of its nodes is at least as stable as the median mark;
 *  2. **stability** — the family's best (smallest) MSER growth;
 *  3. **concentrated mass** — the largest *own*-area fraction of any single node in the family, never
 *     the sum: one coherent mark of area a outranks ten scattered specks totalling 10a;
 *  4. **hue**, ascending from 0 rad, to make the order total and the census reproducible.
 *
 * Nothing here is a threshold. Every key is either a rank statistic of this image's own pool or a
 * structural attribute the parse already computed for another purpose.
 */

import { colorRegion, colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { REGION_CHROMA_BOUNDARY, SAME_COLOR_BAR_BY_REGION } from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Parse, ParsedNode } from "../pipeline.ts"

/**
 * **The hue angle at which two just-chromatic colours stop being the same colour.** Radians.
 *
 * `[DERIVED]` from `SAME_COLOR_BAR_BY_REGION["light-saturated"]` `[REVIEWED — bracketing rounds 1+2
 * pooled]` and `REGION_CHROMA_BOUNDARY` `[REVIEWED — the same rounds' strata boundary]`. See the header
 * for the geometry. Not a constant of this prototype: no value is written down here, and recalibrating
 * either input moves it.
 */
export const FAMILY_HUE_SEPARATION = 2 * Math.asin(SAME_COLOR_BAR_BY_REGION["light-saturated"] / (2 * REGION_CHROMA_BOUNDARY))

const TAU = Math.PI * 2

/** Pack an sRGB triple into the same integer key the pipeline uses, so orders agree across modules. */
function packOf(color: Rgb8): number {
	return (color[0] << 16) | (color[1] << 8) | color[2]
}

/** OKLab hue angle in `[0, τ)`. */
export function hueOf(color: Rgb8): number {
	const [, a, b] = rgbToOkLab(color)
	const angle = Math.atan2(b, a)
	return angle < 0 ? angle + TAU : angle
}

/** OKLab chroma. */
export function chromaOf(color: Rgb8): number {
	const [, a, b] = rgbToOkLab(color)
	return Math.hypot(a, b)
}

/** Is this colour chromatic at all? The contract's own saturated band, not a threshold of ours. */
export function isChromatic(color: Rgb8): boolean {
	return colorRegion(colorFromRgb(color)).endsWith("-saturated")
}

/** Two colours the contract's one ruler calls the same colour. Mirrors `roles/assemble.ts`. */
function sameColorRgb(first: Rgb8, second: Rgb8): boolean {
	return okLabDistance(rgbToOkLab(first), rgbToOkLab(second)) < sameColorBar(colorFromRgb(first), colorFromRgb(second))
}

/** Shortest angular distance between two hues, in `[0, π]`. */
export function hueDistance(first: number, second: number): number {
	const raw = Math.abs(first - second) % TAU
	return raw > Math.PI ? TAU - raw : raw
}

/**
 * The **lower median** of a sample — the same order statistic `pipeline.ts` splits salience on.
 *
 * Re-implemented rather than imported: `roles/text.ts` is another worker's file mid-flight, and a
 * five-line order statistic is not worth a cross-directory dependency. Asserted equal to the pipeline's
 * behaviour by `tests/census.test.ts`.
 */
export function lowerMedian(values: readonly number[]): number {
	if (values.length === 0) return Number.POSITIVE_INFINITY
	const sorted = values.slice().sort((first, second) => first - second)
	return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** One distinct colour in the census, with everything the ranking reads, aggregated over its nodes. */
export type FamilyColor = Readonly<{
	packed: number
	rgb: Rgb8
	hex: string
	hue: number
	chroma: number
	/** Smallest MSER growth over the nodes carrying this colour — the most stable naming of it. */
	bestGrowth: number
	/** Largest single node's own-area fraction. Concentration, never a sum (D8). */
	maxOwnAreaFraction: number
	nodeCount: number
	/** Smallest parsed node id carrying it, for a total order. */
	firstNodeId: number
	/** 0 when at least one carrying node is at or below the pool's lower-median growth (D3). */
	salienceLevel: 0 | 1
}>

/** A chromatic colour family: a maximal run of the hue circle, cut at gaps wider than the separation. */
export type ColorFamily = Readonly<{
	/** Rank position; 0 is the family that claims a role first. */
	rank: number
	/** The family's colours, ascending by hue then packed value. */
	members: readonly FamilyColor[]
	/** The best-ranked member, by the family ranking's own keys applied to colours. */
	representative: FamilyColor
	salienceLevel: 0 | 1
	bestGrowth: number
	maxOwnAreaFraction: number
	/** Sum of member own-area fractions. **Reported, never ranked on** — that would be a mass floor. */
	totalOwnAreaFraction: number
	/** Arc start, radians in `[0, τ)`. May exceed `hueEnd` when the family wraps through 0. */
	hueStart: number
	hueEnd: number
	nodeCount: number
}>

export type FamilyCensus = Readonly<{
	families: readonly ColorFamily[]
	/** The derived hue quantum this census was cut at, radians. */
	separation: number
	/** The pool's lower-median MSER growth — D3's split, recomputed here over the same population. */
	medianGrowth: number
	/** Distinct pool colours that were chromatic and not field. */
	chromaticColorCount: number
	/** Distinct pool colours dropped for sitting inside a field role's bar. */
	fieldColorCount: number
	/** Distinct pool colours dropped for being neutral by `colorRegion`. */
	neutralColorCount: number
}>

/**
 * **The census.** Every retained mark node of every lane, grouped into chromatic families.
 *
 * The population is exactly `pipeline.ts`'s `poolMarks` — every retained mark node of every lane, minus
 * the ground chain — reconstructed from the published `Parse` rather than re-derived, so the census and
 * the accent ranking are looking at one pool and not two. Node ids are globally unique across lanes
 * (`parseTree` lays the lanes out end to end in one id space), so id order subsumes lane order and no
 * lane index is needed for determinism.
 */
export function familyCensus(parse: Parse): FamilyCensus {
	const chain = new Set(parse.groundChain)
	const marks: ParsedNode[] = parse.nodes.filter((node) => node.kind === "mark" && !chain.has(node.id))

	// D3's split, over the whole pool — one statement about this image, as `pipeline.ts` makes it.
	const growths = marks.map((node) => node.growth).filter((value) => Number.isFinite(value))
	const medianGrowth = lowerMedian(growths)

	const background = parse.roles.background
	const surface = parse.roles.surface

	let fieldColorCount = 0
	let neutralColorCount = 0
	const seen = new Map<number, { rgb: Rgb8; bestGrowth: number; maxOwn: number; count: number; firstId: number; salient: boolean }>()
	const rejected = new Set<number>()
	for (const node of marks) {
		const packed = packOf(node.repr)
		const known = seen.get(packed)
		if (known === undefined) {
			if (rejected.has(packed)) continue
			// "Beyond the field": a colour the contract's ruler cannot tell from a published field role is
			// not a family of its own, whatever its hue says.
			if (sameColorRgb(node.repr, background) || sameColorRgb(node.repr, surface)) {
				rejected.add(packed)
				fieldColorCount += 1
				continue
			}
			if (!isChromatic(node.repr)) {
				rejected.add(packed)
				neutralColorCount += 1
				continue
			}
			seen.set(packed, {
				rgb: node.repr,
				bestGrowth: node.growth,
				maxOwn: node.ownAreaFraction,
				count: 1,
				firstId: node.id,
				salient: Number.isFinite(node.growth) && node.growth <= medianGrowth,
			})
			continue
		}
		known.bestGrowth = Math.min(known.bestGrowth, node.growth)
		known.maxOwn = Math.max(known.maxOwn, node.ownAreaFraction)
		known.count += 1
		known.firstId = Math.min(known.firstId, node.id)
		known.salient = known.salient || (Number.isFinite(node.growth) && node.growth <= medianGrowth)
	}

	const colors: FamilyColor[] = [...seen.entries()]
		.map(([packed, value]) => ({
			packed,
			rgb: value.rgb,
			hex: rgbToHex(value.rgb),
			hue: hueOf(value.rgb),
			chroma: chromaOf(value.rgb),
			bestGrowth: value.bestGrowth,
			maxOwnAreaFraction: value.maxOwn,
			nodeCount: value.count,
			firstNodeId: value.firstId,
			salienceLevel: (value.salient ? 0 : 1) as 0 | 1,
		}))
		.sort((first, second) => first.hue - second.hue || first.packed - second.packed)

	const families = cutHueCircle(colors).map((members, index) => summarise(members, index))
	families.sort(compareFamilies)
	const ranked = families.map((family, rank) => ({ ...family, rank }))

	return {
		families: ranked,
		separation: FAMILY_HUE_SEPARATION,
		medianGrowth,
		chromaticColorCount: colors.length,
		fieldColorCount,
		neutralColorCount,
	}
}

/**
 * Single-linkage on the hue circle: cut wherever the gap to the next colour exceeds the separation.
 *
 * Order-independent by construction — the colours are sorted by hue first, and the cuts are a property
 * of the gap sequence, not of the visiting order. When no gap exceeds the separation the artwork's hues
 * form one continuous wheel and the answer is **one family**, which is the conservative outcome: the
 * allocation rule then cannot fire.
 */
function cutHueCircle(colors: readonly FamilyColor[]): FamilyColor[][] {
	if (colors.length === 0) return []
	if (colors.length === 1) return [[colors[0]]]
	const gapAfter = colors.map((color, index) => {
		const next = colors[(index + 1) % colors.length]
		const raw = next.hue - color.hue
		return index === colors.length - 1 ? raw + TAU : raw
	})
	const cuts = gapAfter.map((gap) => gap > FAMILY_HUE_SEPARATION)
	if (!cuts.some(Boolean)) return [colors.slice()]
	// Start the walk just after a cut so every run is contiguous in the rotated order.
	const start = (cuts.findIndex(Boolean) + 1) % colors.length
	const groups: FamilyColor[][] = []
	let current: FamilyColor[] = []
	for (let step = 0; step < colors.length; step += 1) {
		const index = (start + step) % colors.length
		current.push(colors[index])
		if (cuts[index]) {
			groups.push(current)
			current = []
		}
	}
	if (current.length > 0) groups.push(current)
	return groups
}

function summarise(members: readonly FamilyColor[], index: number): ColorFamily {
	const ordered = members.slice().sort(compareColors)
	return {
		rank: index,
		members,
		representative: ordered[0],
		salienceLevel: (members.some((member) => member.salienceLevel === 0) ? 0 : 1) as 0 | 1,
		bestGrowth: Math.min(...members.map((member) => member.bestGrowth)),
		maxOwnAreaFraction: Math.max(...members.map((member) => member.maxOwnAreaFraction)),
		totalOwnAreaFraction: members.reduce((sum, member) => sum + member.maxOwnAreaFraction, 0),
		hueStart: members[0].hue,
		hueEnd: members[members.length - 1].hue,
		nodeCount: members.reduce((sum, member) => sum + member.nodeCount, 0),
	}
}

/** The ranking keys, applied to a colour — used to elect a family's representative. */
function compareColors(first: FamilyColor, second: FamilyColor): number {
	return (
		first.salienceLevel - second.salienceLevel ||
		first.bestGrowth - second.bestGrowth ||
		second.maxOwnAreaFraction - first.maxOwnAreaFraction ||
		first.packed - second.packed
	)
}

/** Salience level, then stability, then concentrated mass, then hue. See the header. */
function compareFamilies(first: ColorFamily, second: ColorFamily): number {
	return (
		first.salienceLevel - second.salienceLevel ||
		first.bestGrowth - second.bestGrowth ||
		second.maxOwnAreaFraction - first.maxOwnAreaFraction ||
		first.hueStart - second.hueStart
	)
}

/**
 * **Which family does this colour belong to?** Single-linkage membership, the census's own rule.
 *
 * A colour joins the family it would have joined had it been in the census: the one holding a member
 * within `FAMILY_HUE_SEPARATION` of its hue, nearest first, lowest rank on a tie. A neutral colour
 * belongs to no family — by `colorRegion`, it carries no hue identity to represent.
 */
export function familyOf(census: FamilyCensus, color: Rgb8): ColorFamily | null {
	if (!isChromatic(color)) return null
	const hue = hueOf(color)
	let best: ColorFamily | null = null
	let bestDistance = Number.POSITIVE_INFINITY
	for (const family of census.families) {
		let distance = Number.POSITIVE_INFINITY
		for (const member of family.members) distance = Math.min(distance, hueDistance(hue, member.hue))
		if (distance >= FAMILY_HUE_SEPARATION) continue
		if (distance < bestDistance) {
			best = family
			bestDistance = distance
		}
	}
	return best
}

/**
 * **Is this family represented by this published colour?**
 *
 * Two ways, and either suffices:
 *
 *  - **the bar** — the published colour is indistinguishable from one of the family's own colours
 *    (D9's own wording: *"represented = within the bar of a published colour"*);
 *  - **the band** — the published colour is itself chromatic and lands in this family under the
 *    census's own membership rule.
 *
 * The band clause is a deliberate widening of the ruling's wording and the reason is measurable: on the
 * acceptance cover the published foreground `#edbab9` is chroma 0.0591 at hue 19.7°, squarely inside the
 * red family the coral `#d25068` (hue 12.3°) leads, and it sits 0.11 away in OKLab — five bars clear of
 * every red the family holds. A bar-only test would call the red family unrepresented, allocate the
 * accent to red a second time, and produce exactly the palette the reviewer rejected for *"doesn't have
 * the green"*. Representation is about which colour of the artwork a role stands for, and hue is what
 * carries that; the bar clause is kept because a published colour that *is* a family member should never
 * depend on the hue arithmetic agreeing.
 */
export function familyRepresentedBy(census: FamilyCensus, family: ColorFamily, published: Rgb8): boolean {
	for (const member of family.members) if (sameColorRgb(member.rgb, published)) return true
	return familyOf(census, published)?.rank === family.rank
}
