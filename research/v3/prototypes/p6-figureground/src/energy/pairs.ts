/**
 * # Factorised barrier arithmetic — the same decisions as `./barriers.ts`, one pair at a time.
 *
 * `./barriers.ts` answers "is this whole tuple feasible?" and is written to be *readable against the
 * contract*: it builds the published-colour list, walks the O(n²) matrix with string path keys, and
 * decides every exception class in the same order `invariants.ts` does. That shape is right for a
 * validator and wrong for a search — it allocates two arrays, a map and four strings per call, which
 * at a million tuples is the whole budget.
 *
 * This file is the same decisions with the per-colour work hoisted out. **Every quantity the barriers
 * compare is a function of one colour or of two**, and the contract's own definitions say so:
 *
 * - `colorDistance` is `okLabDistance(rgbToOkLab(a), rgbToOkLab(b))` — so the OKLab triple is per
 *   colour and the distance is one `Math.hypot`.
 * - `sameColorBar(a, b)` is `max(barByRegion[region(a)], barByRegion[region(b)])` — so the *bar* is a
 *   per-colour number and the pair's bar is one `Math.max`. Read here through `sameColorBar` itself,
 *   at `(colour, colour)`, so the region table is never forked.
 * - `apcaRaw(text, field)` reads each colour only through `softClampBlack(rgbToApcaY(rgb))` and then
 *   raises it to one of four fixed exponents — so four `Math.pow` per colour, none per pair.
 *
 * ## The one thing this file reproduces rather than imports
 *
 * `softClampBlack` is private to `src/contract/color.ts`. `./barriers.ts` already had to reproduce it
 * for its ramp probe and said so; this file needs it for the same reason and reproduces the same two
 * lines from the same source (`APCA_G4G.blkThrs`, `APCA_G4G.blkClmp`). That is a fork, it is the
 * second one, and the honest defence is a test rather than a promise: `tests/energy.test.ts` asserts
 * `apcaRawBetweenFacts` equals the contract's `apcaRaw` **bit for bit** over a colour grid, and that
 * the pair predicates below agree with `violatedBarriers` on randomised tuples. If `apcaRaw` ever
 * changes shape, those tests fail before anything else does.
 *
 * ## No thresholds are decided here
 *
 * Every floor and distance below arrives as an argument or is imported from `src/contract` /
 * `./rates.ts`. This file contains no number.
 */

import { apcaRaw, colorFromRgb, rgbToApcaY, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { APCA_G4G, FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { ENERGY_ANCHORS } from "./rates.ts"

export { FOREGROUND_ACCENT_SEPARATION_DISTANCE }

/**
 * APCA's black soft clamp. `[INHERITED — `softClampBlack` in `src/contract/color.ts`, verbatim]`
 * Reproduced because it is private there; the equality is a test, not a claim (see the file header).
 */
function softClampBlack(y: number): number {
	return y > APCA_G4G.blkThrs ? y : y + (APCA_G4G.blkThrs - y) ** APCA_G4G.blkClmp
}

// ---------------------------------------------------------------------------------------------
// One colour, everything the barriers ever ask of it
// ---------------------------------------------------------------------------------------------

/** Everything `./barriers.ts` reads from a single colour, computed once. */
export type ColorFact = Readonly<{
	lightness: number
	greenRed: number
	blueYellow: number
	/** The colour's own regional same-colour bar; a pair's bar is the max of the two. */
	bar: number
	/** Soft-clamped APCA luminance — the `t`/`b` of `apcaRaw`. */
	apcaY: number
	normBg: number
	normText: number
	reverseBg: number
	reverseText: number
}>

export function colorFactOf(rgb: Rgb8): ColorFact {
	const color = colorFromRgb(rgb)
	const lab = rgbToOkLab(rgb)
	const y = softClampBlack(rgbToApcaY(rgb))
	return {
		lightness: lab[0],
		greenRed: lab[1],
		blueYellow: lab[2],
		bar: sameColorBar(color, color),
		apcaY: y,
		normBg: y ** APCA_G4G.normBG,
		normText: y ** APCA_G4G.normTXT,
		reverseBg: y ** APCA_G4G.revBG,
		reverseText: y ** APCA_G4G.revTXT,
	}
}

/** The same facts for a whole candidate list, as parallel typed arrays — the search's hot data. */
export type ColorFacts = Readonly<{
	count: number
	lightness: Float64Array
	greenRed: Float64Array
	blueYellow: Float64Array
	bar: Float64Array
	apcaY: Float64Array
	normBg: Float64Array
	normText: Float64Array
	reverseBg: Float64Array
	reverseText: Float64Array
}>

export function buildColorFacts(rgbs: readonly Rgb8[]): ColorFacts {
	const count = rgbs.length
	const facts = {
		count,
		lightness: new Float64Array(count),
		greenRed: new Float64Array(count),
		blueYellow: new Float64Array(count),
		bar: new Float64Array(count),
		apcaY: new Float64Array(count),
		normBg: new Float64Array(count),
		normText: new Float64Array(count),
		reverseBg: new Float64Array(count),
		reverseText: new Float64Array(count),
	}
	for (let index = 0; index < count; index++) {
		const fact = colorFactOf(rgbs[index])
		facts.lightness[index] = fact.lightness
		facts.greenRed[index] = fact.greenRed
		facts.blueYellow[index] = fact.blueYellow
		facts.bar[index] = fact.bar
		facts.apcaY[index] = fact.apcaY
		facts.normBg[index] = fact.normBg
		facts.normText[index] = fact.normText
		facts.reverseBg[index] = fact.reverseBg
		facts.reverseText[index] = fact.reverseText
	}
	return facts
}

/** Lift one entry back out of the arrays — cold paths only; the search never calls this. */
export function factAt(facts: ColorFacts, index: number): ColorFact {
	return {
		lightness: facts.lightness[index],
		greenRed: facts.greenRed[index],
		blueYellow: facts.blueYellow[index],
		bar: facts.bar[index],
		apcaY: facts.apcaY[index],
		normBg: facts.normBg[index],
		normText: facts.normText[index],
		reverseBg: facts.reverseBg[index],
		reverseText: facts.reverseText[index],
	}
}

// ---------------------------------------------------------------------------------------------
// The two rulers, per pair
// ---------------------------------------------------------------------------------------------

/**
 * `colorDistance`, from precomputed OKLab.
 *
 * `Math.hypot` rather than a hand-rolled `sqrt(x²+y²+z²)` because `okLabDistance` is `Math.hypot` and
 * the two are not guaranteed to agree in the last bit — and a barrier is a comparison against a
 * threshold, where the last bit is a verdict.
 */
export function distanceIndexed(facts: ColorFacts, first: number, second: number): number {
	return Math.hypot(
		facts.lightness[first] - facts.lightness[second],
		facts.greenRed[first] - facts.greenRed[second],
		facts.blueYellow[first] - facts.blueYellow[second],
	)
}

export function distanceToFact(facts: ColorFacts, index: number, other: ColorFact): number {
	return Math.hypot(
		facts.lightness[index] - other.lightness,
		facts.greenRed[index] - other.greenRed,
		facts.blueYellow[index] - other.blueYellow,
	)
}

export function distanceBetweenFacts(first: ColorFact, second: ColorFact): number {
	return Math.hypot(
		first.lightness - second.lightness,
		first.greenRed - second.greenRed,
		first.blueYellow - second.blueYellow,
	)
}

/**
 * `apcaRaw(text, field)` with both colours' powers precomputed.
 *
 * The association order is `((bg^e − text^e) * scale) * 100`, exactly as `apcaRaw` writes it, so the
 * double is the same double.
 */
function rawFrom(
	textY: number,
	textNorm: number,
	textReverse: number,
	fieldY: number,
	fieldNorm: number,
	fieldReverse: number,
): number {
	const sapc = fieldY > textY
		? (fieldNorm - textNorm) * APCA_G4G.scaleBoW
		: (fieldReverse - textReverse) * APCA_G4G.scaleWoB
	return sapc * 100
}

export function apcaRawIndexed(facts: ColorFacts, text: number, field: number): number {
	return rawFrom(
		facts.apcaY[text],
		facts.normText[text],
		facts.reverseText[text],
		facts.apcaY[field],
		facts.normBg[field],
		facts.reverseBg[field],
	)
}

export function apcaRawTextIndexed(facts: ColorFacts, text: number, field: ColorFact): number {
	return rawFrom(
		facts.apcaY[text],
		facts.normText[text],
		facts.reverseText[text],
		field.apcaY,
		field.normBg,
		field.reverseBg,
	)
}

export function apcaRawFieldIndexed(facts: ColorFacts, text: ColorFact, field: number): number {
	return rawFrom(
		text.apcaY,
		text.normText,
		text.reverseText,
		facts.apcaY[field],
		facts.normBg[field],
		facts.reverseBg[field],
	)
}

export function apcaRawBetweenFacts(text: ColorFact, field: ColorFact): number {
	return rawFrom(
		text.apcaY,
		text.normText,
		text.reverseText,
		field.apcaY,
		field.normBg,
		field.reverseBg,
	)
}

/** Kept so a reader can see the fork is checkable: this is what the contract would have said. */
export function apcaRawReference(text: Rgb8, field: Rgb8): number {
	return apcaRaw(text, field)
}

// ---------------------------------------------------------------------------------------------
// The pair predicates — one per barrier `./barriers.ts` states
// ---------------------------------------------------------------------------------------------

/** Invariant 3 for an ordinary pair: distance at or above the pair's regional bar. */
export function distinctIndexed(facts: ColorFacts, first: number, second: number): boolean {
	return distanceIndexed(facts, first, second) >=
		Math.max(facts.bar[first], facts.bar[second])
}

export function distinctFromFact(facts: ColorFacts, index: number, other: ColorFact): boolean {
	return distanceToFact(facts, index, other) >= Math.max(facts.bar[index], other.bar)
}

export function distinctFacts(first: ColorFact, second: ColorFact): boolean {
	return distanceBetweenFacts(first, second) >= Math.max(first.bar, second.bar)
}

/** Invariant 3 for the foreground–accent pair: the bar, raised to the inherited separation. */
export function separatedIndexed(facts: ColorFacts, first: number, second: number): boolean {
	const effective = Math.max(
		facts.bar[first],
		facts.bar[second],
		FOREGROUND_ACCENT_SEPARATION_DISTANCE,
	)
	return distanceIndexed(facts, first, second) >= effective
}

/** Invariant 4 for text on a field: `|raw| ≥ floor`, no escape clause. */
export function textContrastIndexed(
	facts: ColorFacts,
	text: number,
	field: number,
	floor: number,
): boolean {
	return Math.abs(apcaRawIndexed(facts, text, field)) >= floor
}

/**
 * Invariant 4 for an accent on a field: `|raw| ≥ floor`, **or** the functional-colour escape when the
 * caller has not raised the floor above its ε (`./barriers.ts`, `accentEscapeAvailable`).
 */
export function accentContrastIndexed(
	facts: ColorFacts,
	accent: number,
	field: number,
	floor: number,
	escapeAvailable: boolean,
): boolean {
	if (Math.abs(apcaRawIndexed(facts, accent, field)) >= floor) return true
	return escapeAvailable &&
		distanceIndexed(facts, accent, field) >= ENERGY_ANCHORS.accentFunctionalDistance
}

export function textContrastFromFact(
	facts: ColorFacts,
	text: number,
	field: ColorFact,
	floor: number,
): boolean {
	return Math.abs(apcaRawTextIndexed(facts, text, field)) >= floor
}

export function accentContrastFromFact(
	facts: ColorFacts,
	accent: number,
	field: ColorFact,
	floor: number,
	escapeAvailable: boolean,
): boolean {
	if (Math.abs(apcaRawTextIndexed(facts, accent, field)) >= floor) return true
	return escapeAvailable &&
		distanceToFact(facts, accent, field) >= ENERGY_ANCHORS.accentFunctionalDistance
}
