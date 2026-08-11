/**
 * **The guide stop** — one interior stop, inserted only to pull a rendered ramp back onto the artwork.
 *
 * This is the intersection of arm-b §2.7 and arm-e §2.4, which describe the same procedure and
 * disagree only about what happens when it fails. arm-b:
 *
 * > *If not, the straight line demonstrably leaves the artwork — the one admissible reason for a third
 * > stop. Place it at the `t` of worst excursion, at the exact artwork pixel nearest the fitted field
 * > model there, and re-measure; accept only if the worst excursion falls materially, otherwise
 * > revert.*
 *
 * arm-e, on the same procedure: *"insert **one** interior stop at the t of maximum excursion, taking
 * the field's representative colour there, and recompute"*, and then — where the two part — arm-e
 * publishes three and reports the residual where arm-b reverts. **The intersection takes arm-b's
 * accept test**, because it is the stricter of the two and because `DECISIONS.md` D6 words the owed
 * commit in arm-b's terms (*"keep only if excursion falls materially"*). Neither arm reaches for a
 * fourth stop and neither does this file.
 *
 * ## The three ways an owed stop is refused, and why a refusal is a result
 *
 * D6 makes two preconditions binding, from D4 and D5, and the brief for this pass is explicit that a
 * **refused stop with a printed reason beats an uncalibrated floor**. So every refusal carries a class
 * and every class is counted in the census:
 *
 * | class | rule | provenance |
 * |---|---|---|
 * | `meander` | the inserted colour must lie strictly between the ends *along the ramp's own axis* | D5: the reviewer's *"no blue-to-red-to-blue"* |
 * | `spacing-below-bar` | each adjacent stop pair must differ by at least one same-colour bar | D4's stop-spacing banding, derived (below) |
 * | `excursion-not-materially-reduced` | the overshoot must fall by `min(overshoot, one bar)` | D6 / arm-b's accept test |
 * | `no-candidate` | the ramp's own chain offers no interior colour | structural |
 *
 * ### The spacing floor, and what it deliberately is not
 *
 * D4 records *"adjacent stops 3.1% apart read as 'very significant banding'"*. **That 3.1% is reviewer
 * evidence about one stimulus, not a constant available to hardcode**, and no calibrated positional
 * floor exists anywhere in the repository to derive one from. What *is* calibrated is the contract's
 * same-colour bar, so the floor implemented here is stated in **colour** rather than in position: a
 * stop must differ from each of its neighbours by at least one bar. A stop that does not is not a
 * "close stop" — it is a stop that is not a colour change at all, the degenerate end of exactly the
 * class D4 complains about, and it is refused as `spacing-below-bar`.
 *
 * **The positional spacing is measured and published beside every accepted stop** (`positionSpacing`),
 * precisely so that D4's 3.1% can be priced against real insertions in a round rather than guessed at
 * here. If the reviewer prices a positional floor, it lands as one more precondition and nothing else
 * in this file moves.
 *
 * ### "Materially", built out of the excursion bar itself
 *
 * D6: *"keep the stop ONLY if max excursion falls materially (define 'materially' via the excursion
 * bar itself, not a new constant)"*. Excursion above `EXCURSION_BAR_MULTIPLE` is the **overshoot** —
 * the part the contract does not tolerate — and the required fall is
 *
 *     requiredFallBars = min(overshootBefore, ONE_BAR_IN_BAR_UNITS)
 *
 * which reads: *remove the overshoot entirely, or, if it is larger than one same-colour bar, remove at
 * least one bar's worth of it.* Both terms are the excursion bar and the ruler it is a multiple of.
 * A stop that buys less than that is reverted, so meandering, coverage-expansion and metric-fitting
 * are **unreachable rather than forbidden** (arm-e's framing): the only thing an inserted stop can be
 * kept for is a visible reduction in how far the ramp leaves the artwork.
 */

import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab } from "../../../../src/contract/color.ts"
import { rampColorAt } from "../../../../src/contract/ramp.ts"
import type { GradientStop, HexColor, OkLab, Rgb8 } from "../../../../src/contract/types.ts"
import { ONE_BAR_IN_BAR_UNITS } from "./constants.ts"
import { type ExcursionMeasurement, measureExcursion, separatedByOneBar } from "./excursion.ts"
import type { Occupancy } from "./occupancy.ts"

/** Why no stop was inserted. `none` means one was. */
export type GuideStopRefusal =
	/** A stop was inserted and kept. */
	| "none"
	/** The 2-stop ramp is already on-artwork: no stop is owed and none was tried. */
	| "not-owed"
	/** The ramp's own chain carries no interior colour distinct from the two ends. */
	| "no-candidate"
	/** The worst excursion sits exactly on a published stop; there is no interior `t` to insert at. */
	| "position-at-endpoint"
	/** D5: the stop would not preserve monotone colour order along the ramp. */
	| "meander"
	/** D4: the stop would sit inside one same-colour bar of a neighbour. */
	| "spacing-below-bar"
	/** D6 / arm-b: the overshoot did not fall by `min(overshootBefore, one bar)`. Reverted. */
	| "excursion-not-materially-reduced"

/** One interior colour a guide stop may be drawn from — a node of the ramp's own chain. */
export type GuideCandidate = Readonly<{ nodeId: number; rgb: Rgb8 }>

/** What the inserted stop is, when there is one. */
export type InsertedStop = Readonly<{
	hex: HexColor
	/** The ramp parameter the stop sits at — the `t` of the 2-stop ramp's worst excursion. */
	position: number
	/** The chain node the colour came from. Its representative is already in the candidate pool. */
	nodeId: number
	/**
	 * Distance to the nearer neighbouring stop **in position**, as a fraction of the ramp.
	 *
	 * Report-only. This is the quantity D4's *"adjacent stops 3.1% apart"* is about, published so the
	 * reviewer can price a positional floor against real insertions; nothing gates on it.
	 */
	positionSpacing: number
	/** OKLab distance to the background end, and to the surface end. Both cleared one bar. */
	stepFromFirst: number
	stepToLast: number
}>

/** Everything the machinery did to one ramp, whether or not it changed it. */
export type GuideStopReport = Readonly<{
	/** Was a guide stop owed — did the 2-stop ramp's excursion exceed the bar? */
	owed: boolean
	inserted: boolean
	refusal: GuideStopRefusal
	/** The 2-stop measurement. Published for every ramp, always, owed or not. */
	before: ExcursionMeasurement
	/** The 3-stop measurement, when one was attempted. `null` when nothing was tried. */
	after: ExcursionMeasurement | null
	stop: InsertedStop | null
	/** How many interior chain colours were available to choose from. */
	candidates: number
	/** `min(before.overshootBars, one bar)` — what the insertion had to buy. */
	requiredFallBars: number
	/** `before.overshootBars − after.overshootBars`, when a stop was tried. */
	actualFallBars: number | null
}>

function dot(first: OkLab, second: OkLab): number {
	return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

function difference(first: OkLab, second: OkLab): OkLab {
	return [first[0] - second[0], first[1] - second[1], first[2] - second[2]]
}

/**
 * **Monotone colour order along the ramp** — D5's precondition, as a structural test.
 *
 * The reviewer's words are *"no blue-to-red-to-blue"*: what matters is that the path *progresses*
 * rather than that any particular channel does. So the test is on the projection onto the ramp's own
 * axis (`last − first` in OKLab): the interior colour must project **strictly inside** the two ends,
 * which is exactly the statement that neither segment doubles back on the direction the ramp travels
 * in. A stop that projects outside either end reverses one segment and is a meander whatever its hue
 * does; a stop that projects inside cannot reverse either one.
 *
 * Off-axis deviation is *not* penalised here, and deliberately: pulling the ramp off the straight line
 * is the entire purpose of a guide stop. The excursion test is what decides whether that deviation was
 * worth anything.
 */
export function preservesMonotoneOrder(first: Rgb8, interior: Rgb8, last: Rgb8): boolean {
	const firstLab = rgbToOkLab(first)
	const interiorLab = rgbToOkLab(interior)
	const lastLab = rgbToOkLab(last)
	const axis = difference(lastLab, firstLab)
	const axisLength = dot(axis, axis)
	if (!(axisLength > 0)) return false
	const along = dot(difference(interiorLab, firstLab), axis)
	return along > 0 && along < axisLength
}

/**
 * Run the excursion test on a published 2-stop ramp and, if the bar is exceeded, try one guide stop.
 *
 * `candidates` are the ramp's **own chain nodes** — the representatives of the ground chain the two
 * endpoints came from. Drawing the interior colour from that set rather than from the whole image is
 * what keeps the inserted colour (a) an exact artwork pixel, (b) a colour of the *field* rather than
 * of something drawn on top of it, and (c) already reachable in the node pool, so the reachability
 * falsifier's numbers cannot move because of this machinery.
 *
 * Ties, in order: nearest to the field model at `t`, then lexicographic RGB, then chain order
 * (outermost first) — the update test is strict, so an exact repeat of a colour keeps the outermost
 * node that carries it.
 */
export function guideStop(input: {
	readonly stops: readonly [GradientStop, GradientStop]
	readonly occupancy: Occupancy
	readonly candidates: readonly GuideCandidate[]
}): { stops: GradientStop[]; report: GuideStopReport } {
	const base: GradientStop[] = [input.stops[0], input.stops[1]]
	const before = measureExcursion(base, input.occupancy)
	const requiredFallBars = Math.min(before.overshootBars, ONE_BAR_IN_BAR_UNITS)
	const firstHex = input.stops[0].color.hex
	const lastHex = input.stops[1].color.hex
	const interior = input.candidates.filter((candidate) => {
		const candidateHex = rgbToHex(candidate.rgb)
		return candidateHex !== firstHex && candidateHex !== lastHex
	})
	const unchanged = (refusal: GuideStopRefusal, after: ExcursionMeasurement | null = null): {
		stops: GradientStop[]
		report: GuideStopReport
	} => ({
		stops: base,
		report: {
			owed: before.overBar,
			inserted: false,
			refusal,
			before,
			after,
			stop: null,
			candidates: interior.length,
			requiredFallBars,
			actualFallBars: after === null ? null : before.overshootBars - after.overshootBars,
		},
	})

	if (!before.overBar) return unchanged("not-owed")
	const position = before.position
	if (!(position > input.stops[0].position && position < input.stops[1].position)) {
		return unchanged("position-at-endpoint")
	}
	if (interior.length === 0) return unchanged("no-candidate")

	// **The field model at `t`**, which is what the ramp claims the field's colour is there: the
	// rendered colour of the straight 2-stop line. The stop takes the exact artwork pixel nearest that
	// claim, drawn from the chain — arm-b's *"the exact artwork pixel nearest the fitted field model
	// there"*, with arm-e's *"the field's representative colour"* as the set it is drawn from.
	const modelLab = rgbToOkLab(rampColorAt(base, position))
	let chosen = interior[0]
	let chosenDistance = Number.POSITIVE_INFINITY
	let chosenPacked = Number.POSITIVE_INFINITY
	for (const candidate of interior) {
		const distance = okLabDistance(rgbToOkLab(candidate.rgb), modelLab)
		const packed = (candidate.rgb[0] << 16) | (candidate.rgb[1] << 8) | candidate.rgb[2]
		if (distance < chosenDistance || (distance === chosenDistance && packed < chosenPacked)) {
			chosen = candidate
			chosenDistance = distance
			chosenPacked = packed
		}
	}

	// ---- the two preconditions, both binding (D6, from D4 and D5) --------------------------------
	if (!preservesMonotoneOrder(input.stops[0].color.rgb, chosen.rgb, input.stops[1].color.rgb)) {
		return unchanged("meander")
	}
	if (
		!separatedByOneBar(input.stops[0].color.rgb, chosen.rgb) ||
		!separatedByOneBar(chosen.rgb, input.stops[1].color.rgb)
	) {
		return unchanged("spacing-below-bar")
	}

	const inserted: GradientStop[] = [input.stops[0], { color: colorFromRgb(chosen.rgb), position }, input.stops[1]]
	const after = measureExcursion(inserted, input.occupancy)
	const actualFallBars = before.overshootBars - after.overshootBars
	if (!(actualFallBars >= requiredFallBars)) return unchanged("excursion-not-materially-reduced", after)

	return {
		stops: inserted,
		report: {
			owed: true,
			inserted: true,
			refusal: "none",
			before,
			after,
			stop: {
				hex: rgbToHex(chosen.rgb),
				position,
				nodeId: chosen.nodeId,
				positionSpacing: Math.min(position - input.stops[0].position, input.stops[1].position - position),
				stepFromFirst: okLabDistance(rgbToOkLab(input.stops[0].color.rgb), rgbToOkLab(chosen.rgb)),
				stepToLast: okLabDistance(rgbToOkLab(chosen.rgb), rgbToOkLab(input.stops[1].color.rgb)),
			},
			candidates: interior.length,
			requiredFallBars,
			actualFallBars,
		},
	}
}
