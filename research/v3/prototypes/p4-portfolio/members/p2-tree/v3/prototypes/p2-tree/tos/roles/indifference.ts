/**
 * **Comparisons against the ruler** — arm-b′ §2.6's principle, implemented.
 *
 * > *"…comparisons at each lexicographic level are made against the ruler: if two candidates differ
 * > by less than the bar on that level's quantity, the level is indifferent and the comparison falls
 * > through to the next level."*
 *
 * ## The defect this exists to fix
 *
 * `stability/q1-dither/REPORT.md` measured where a ±1-LSB dither moves a published palette. **82% of
 * the 66 failures are `c-winner`: both supplying nodes survived and the *ranking* picked a different
 * one** — 58 of those 76 role failures are identity swaps in which *both* nodes' representatives held
 * their colour. The colours stood still and the order moved. A lexicographic order over floating-point
 * quantities has no indifference: two candidates whose chroma differs in the fifth decimal are strictly
 * ordered, and a dither of ±1 LSB is enough to reverse them. Every such reversal is a published
 * palette change that nobody can see the cause of.
 *
 * ## What "indifferent" has to mean to be usable
 *
 * The naive reading — *"treat `|a − b| < ε` as a tie inside the comparator"* — is not implementable.
 * That relation is not transitive (a semiorder, not an equivalence), so `Array.prototype.sort` over it
 * is unspecified: the result depends on the input order and on the sort's internal pivot choices, which
 * is a *worse* stability story than the exact comparison it replaces.
 *
 * The construction here is the one this pipeline already uses for colours in `clusterByBar` — group
 * first, then compare group indices:
 *
 *  1. sort the candidates by the quantity, best first, with a deterministic seed tie-break;
 *  2. walk that order, opening a new **indifference class** whenever the candidate falls a full band
 *     below its class's *leader* (the class's best member, not its predecessor);
 *  3. the lexicographic level compares **class indices**, which are integers — total, transitive, and
 *     equal exactly when the level is indifferent.
 *
 * Leader linkage rather than single linkage is the whole of the difference between a usable band and a
 * useless one. Under single linkage a dense population chains: 256 accent candidates spread over 0.19
 * of chroma have a mean neighbour gap of 0.0007, far under any bar, so every candidate would land in
 * one class and the level would vanish. Under leader linkage **a class spans strictly less than one
 * band by construction**, so the level still says everything it can say and stops exactly where the
 * instrument stops.
 *
 * ## Why this is not a lattice
 *
 * `pipeline.ts`'s representative rule refuses a quantisation grid on the ground that *"a lattice would
 * put a bin edge back into a design whose whole robustness argument is that it has none"*. The same
 * objection applies to `Math.floor(value / band)` here, and this construction avoids it the same way:
 * **the class boundaries are placed by the data's own gaps, not by fixed edges.** A sub-band
 * perturbation can only move a boundary where a gap already sits within the perturbation of the band
 * itself, instead of wherever a candidate happens to sit near a fixed edge.
 *
 * ## The bands, and where each one comes from
 *
 * No number in this file is new and none is `[UNCALIBRATED]`. Every band is either the contract's own
 * ruler for that quantity or arithmetic on a constant that already exists, with the derivation stated:
 *
 * | quantity | band | source |
 * |---|---|---|
 * | an OKLab colour distance (accent chroma from field, lightness movement) | `sameColorBar(a, b)` of the pair being compared | `src/contract/color.ts` — the one ruler, per-pair and regional |
 * | raw APCA (foreground readability) | `APCA_RAW_IDENTICAL_CEILING` | `src/contract/constants.ts`, `[MEASURED]` |
 * | an area fraction (text-group size, the component cut) | `1 − COMPONENT_CHAIN_AREA_AGREEMENT`, relative | `roles/constants.ts` |
 * | a normalised length (the ramp's polarity projection) | `√MIN_NODE_AREA_FRACTION` | `tos/constants.ts` |
 *
 * The two derived ones are argued at their definitions below. Both are **scale-free**: one is a ratio,
 * the other is a fraction of the image's own side.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { APCA_RAW_IDENTICAL_CEILING } from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { MIN_NODE_AREA_FRACTION } from "../constants.ts"
import { COMPONENT_CHAIN_AREA_AGREEMENT } from "./constants.ts"

/**
 * The indifference band for **raw APCA**.
 *
 * `[INHERITED]` — `APCA_RAW_IDENTICAL_CEILING`, the contract's `[MEASURED]` upper bound on |raw APCA|
 * for two *exactly identical* colours (1.98152, solved analytically). It is the magnitude the metric
 * produces when there is provably no contrast to report, so it is the size of the instrument's own
 * zero: a difference of readability scores smaller than it is a difference the metric cannot be said to
 * have measured. `rank.ts` previously stated that the contract "has never published a just-noticeable
 * difference" for raw APCA and compared exactly; this is not a JND, and it is not being used as one —
 * it is the floor below which the quantity is known to be noise, which is what a fall-through level
 * needs.
 *
 * No new number: the constant already exists and already carries this meaning
 * (`src/contract/constants.ts`: *"the epsilons below have to clear it"*).
 */
export const RAW_APCA_INDIFFERENCE = APCA_RAW_IDENTICAL_CEILING

/**
 * The indifference band for an **area fraction**, as a *relative* tolerance.
 *
 * `[INHERITED]` — `1 − COMPONENT_CHAIN_AREA_AGREEMENT` (0.2). Two areas are indifferent when the
 * smaller covers at least `COMPONENT_CHAIN_AREA_AGREEMENT` of the larger.
 *
 * **Why that constant.** `COMPONENT_CHAIN_AREA_AGREEMENT` is already this pipeline's answer to *"when
 * are two areas the same region's area rather than two regions' areas"*: `collapseChains` collapses a
 * node onto one beneath it covering at least that fraction of it. Using a different tolerance to decide
 * whether two areas are *distinguishable* would be a second area tolerance with no second measurement
 * behind it — and there is no measured just-noticeable difference in area to reach for.
 *
 * **Why relative and not absolute.** `MIN_NODE_AREA_FRACTION` is the obvious absolute alternative and
 * it is the wrong shape twice over: it is not scale-free (a 0.0005 band is a 100% tolerance on a
 * 0.0005 node and a 0.05% tolerance on a field), and the component population is dense immediately
 * above it — every component is at least that large — so an absolute band would put the entire small
 * end of the population into one class and delete the level exactly where the marks live.
 */
export const AREA_FRACTION_RELATIVE_INDIFFERENCE = 1 - COMPONENT_CHAIN_AREA_AGREEMENT

/**
 * The indifference band for a **normalised length** — a centroid coordinate or a projection of one, in
 * units where the image is 1 wide and 1 tall.
 *
 * `[INHERITED]` — `√MIN_NODE_AREA_FRACTION` (0.02236, i.e. 2.24% of the image's side). Derivation: the
 * grain is the smallest *area* fraction the parse will retain as a region, so a square region of
 * exactly that area has a side of `√MIN_NODE_AREA_FRACTION` in normalised units. That is the smallest
 * linear extent this pipeline resolves anywhere, and two positions closer together than the smallest
 * thing that can be at either of them are the same position.
 *
 * Scale-free: it is a fraction of the image's own side, in the same normalised units the centroids are
 * expressed in, so it means the same thing on a 300 px cover and a 3,000 px one.
 */
export const NORMALISED_LENGTH_INDIFFERENCE = Math.sqrt(MIN_NODE_AREA_FRACTION)

/**
 * The band between two colour-carrying candidates on an OKLab-distance quantity: the contract's own
 * regional bar for *that pair*, which is the only colour epsilon this prototype is allowed to use.
 */
export function colorQuantityBand(first: Rgb8, second: Rgb8): number {
	return sameColorBar(colorFromRgb(first), colorFromRgb(second))
}

/** The band between two area fractions, as the relative tolerance applied to the larger of them. */
export function areaFractionBand(first: number, second: number): number {
	return AREA_FRACTION_RELATIVE_INDIFFERENCE * Math.max(Math.abs(first), Math.abs(second))
}

/**
 * **Indifference classes over one quantity, best first.**
 *
 * `count` items are addressed by index `0…count-1`; `valueOf` reads the quantity, **larger is better**
 * (a caller whose quantity is smaller-is-better negates it); `bandOf(leader, candidate)` is the band
 * between those two items, so a per-pair ruler like `sameColorBar` is expressible and a constant band
 * is just a closure that ignores its arguments.
 *
 * Returns, per index, its class number — 0 for the best class, ascending. Compare these instead of the
 * raw quantity and the level is indifferent exactly when the classes are equal.
 *
 * `seedOrder` is the deterministic order used to break exact ties on the quantity while classes are
 * being formed. It has to be a total order that does not depend on the input array's order (the house
 * tie-break is lexicographic RGB); the default is index order, which is only safe when the caller's
 * index order is itself deterministic and perturbation-stable.
 *
 * Non-finite values are handled without special-casing: `−Infinity` sorts last, and `leader − candidate`
 * is then `Infinity` (its own class) or `NaN` for two `−Infinity`s, which the `< band` test reads as
 * indifferent — two candidates the metric could not place are indifferent to each other, which is the
 * only honest answer.
 */
export function indifferenceClasses(
	count: number,
	valueOf: (index: number) => number,
	bandOf: (leader: number, candidate: number) => number,
	seedOrder: (first: number, second: number) => number = (first, second) => first - second,
): Int32Array {
	const classes = new Int32Array(count)
	if (count === 0) return classes
	const order = Array.from({ length: count }, (_unused, index) => index)
	order.sort((first, second) => {
		const difference = valueOf(second) - valueOf(first)
		if (difference < 0) return -1
		if (difference > 0) return 1
		return seedOrder(first, second)
	})
	let leader = order[0]
	let current = 0
	classes[leader] = 0
	for (let position = 1; position < order.length; position += 1) {
		const index = order[position]
		const gap = valueOf(leader) - valueOf(index)
		// `!(gap >= band)` and not `gap < band`, so a `NaN` gap (two `−Infinity`s) reads as indifferent.
		if (!(gap >= bandOf(leader, index))) {
			classes[index] = current
			continue
		}
		current += 1
		leader = index
		classes[index] = current
	}
	return classes
}

/**
 * **A truncation that cannot flip membership on a sub-band change.**
 *
 * `order` is the already-ranked index sequence; `limit` is the cost guard's count; `sameClass` says
 * whether two adjacent entries are indifferent on the quantity the cut is made along.
 *
 * A plain `slice(0, limit)` cuts between two candidates that may be indifferent, so a perturbation too
 * small to see decides which of them the role stage looks at — the mechanism `lanes/constants.ts`
 * already names for the *area*-ordered cut (a vivid accent at area rank 602 of 963) in its other,
 * ranking-blind form. The cut is therefore **extended through the boundary class**: everything
 * indifferent from the last kept entry is kept too, so membership changes only when the class boundary
 * itself moves, and a class spans strictly less than one band.
 *
 * Extending rather than retreating to the previous boundary is the direction D8 asks for — *"mass
 * floors exclude exactly what the reviewer asks for"* — and it is bounded: leader linkage caps a class
 * at one band's span, so the overshoot is the population inside one band of the cut, not the tail.
 *
 * Returns the number of entries to keep.
 */
export function stableCut(order: readonly number[], limit: number, sameClass: (first: number, second: number) => boolean): number {
	if (order.length <= limit) return order.length
	let cut = limit
	while (cut < order.length && sameClass(order[cut - 1], order[cut])) cut += 1
	return cut
}

/**
 * **The ramp's polarity** — which end of the ground chain is `stops[0]`, which the contract says *is*
 * the background.
 *
 * Level 1, and it keeps priority: the consumer draws `linear-gradient(135deg in oklab, …)` whose first
 * stop sits at the top-left, so the end whose centroid projects **smaller** onto that axis is the
 * background. `RENDER_AXIS_UNIT` is the geometry and it decides whenever it says anything.
 *
 * Level 2 is `DECISIONS.md` **D10.2**, and it only speaks when level 1 is indifferent. Round 3a item 6
 * published `#646464 → #fafafa` and the reviewer wrote *"background should be white"* — an
 * endpoint-assignment complaint, which the round's OUTCOME.md records as landing in a gap between D6
 * and the contract. D10.2 rules it *"a POLARITY defect… one data point, design attention in cycle 3, no
 * invented constant"*. So: **where the two ends differ in lightness beyond the bar, the lighter end is
 * the background** — but strictly as a tie-break level, and only once the projection has been found
 * indifferent under `NORMALISED_LENGTH_INDIFFERENCE`. One reviewer note may not outrank a geometric
 * fact about where the gradient is actually drawn.
 *
 * Level 3 is arm-b′ §2.6's declared chain, unchanged: larger area, then lower lightness.
 *
 * Returns `true` when `a` is the background.
 *
 * **On item 6 this rule changes nothing, and that is a measurement, not an assumption.** Its two chain
 * ends project to 0.70475 and 0.60692 — a gap of 0.0978, **4.4× the band** — so level 1 decides clearly
 * and the dark end stays the background. `roles/tests/polarity.test.ts` asserts exactly that, so the
 * fact cannot rot silently. The consequence, recorded rather than acted on: **the note needs a
 * different mechanism**, because no indifference band derivable from an existing constant reaches
 * 0.0978 and widening one until item 6 flips would be taste wearing a derivation. The likeliest
 * candidates are that the projection is the wrong statistic (the outer end of a ground chain is the
 * root, whose centroid is the image centre by construction, so this comparison is really *"is the inner
 * end up-left or down-right of centre"*), or that D10's polarity question is about lightness order
 * outright rather than about geometry with a lightness tie-break. Both need a round, not a constant.
 */
export function ramPolarityAIsBackground(params: {
	projectionA: number
	projectionB: number
	reprA: Rgb8
	reprB: Rgb8
	areaFractionA: number
	areaFractionB: number
}): { aIsBackground: boolean; decidedBy: "projection" | "lightness" | "declared-chain" } {
	const { projectionA, projectionB, reprA, reprB, areaFractionA, areaFractionB } = params
	if (Math.abs(projectionA - projectionB) >= NORMALISED_LENGTH_INDIFFERENCE) {
		return { aIsBackground: projectionA < projectionB, decidedBy: "projection" }
	}
	const lightnessA = rgbToOkLab(reprA)[0]
	const lightnessB = rgbToOkLab(reprB)[0]
	if (Math.abs(lightnessA - lightnessB) >= colorQuantityBand(reprA, reprB)) {
		return { aIsBackground: lightnessA > lightnessB, decidedBy: "lightness" }
	}
	const aIsBackground =
		areaFractionA > areaFractionB || (areaFractionA === areaFractionB && lightnessA < lightnessB)
	return { aIsBackground, decidedBy: "declared-chain" }
}

/**
 * **D7's margin report.** *"The reviewer grades margins; optimizers sit on floors."*
 *
 * One row per distinct role pair: the OKLab distance actually published between them, the contract's
 * regional bar for that pair, and the ratio of the two. A pair at ratio 1.0 is "distinct" only by the
 * width of the measurement — D7's *"a complaint waiting to happen"* — and a pair well above it is a
 * distinction the reviewer can be expected to see. Report-only: nothing in this prototype ranks or
 * filters on a margin, because no round has priced one (D10.5 records the single data point there is,
 * a 0.0304 margin that survived).
 */
export type RoleMargin = Readonly<{
	/** `"<role>|<role>"`, roles in `ROLE_NAMES` order. */
	pair: string
	distance: number
	bar: number
	/** `distance / bar`. Below 1 the pair is inside the bar; a sanctioned collapse reports 0. */
	ratio: number
}>

/** Every pairwise role margin, worst ratio first, then by pair name. Deterministic. */
export function roleMargins(roles: Readonly<Record<string, { rgb: Rgb8 }>>, roleNames: readonly string[]): RoleMargin[] {
	const margins: RoleMargin[] = []
	for (let first = 0; first < roleNames.length; first += 1) {
		for (let second = first + 1; second < roleNames.length; second += 1) {
			const one = roles[roleNames[first]].rgb
			const other = roles[roleNames[second]].rgb
			const distance = okLabDistance(rgbToOkLab(one), rgbToOkLab(other))
			const bar = colorQuantityBand(one, other)
			margins.push({
				pair: `${roleNames[first]}|${roleNames[second]}`,
				distance,
				bar,
				ratio: bar > 0 ? distance / bar : Number.POSITIVE_INFINITY,
			})
		}
	}
	margins.sort((left, right) => left.ratio - right.ratio || (left.pair < right.pair ? -1 : left.pair > right.pair ? 1 : 0))
	return margins
}
