/**
 * The functional-visibility calibration round — fixture generation.
 *
 * `ACCENT_FUNCTIONAL_DISTANCE` (`src/contract/constants.ts:371`, currently `0.14591`) is the OKLab
 * distance at which an accent carrying **no luminance contrast** still works as an accent. It is
 * `[UNCALIBRATED]`, it is **in force** in invariant 4's accent escape, and — the sharp part — *no
 * stimulus has ever been graded against the criterion it is named for*. Its digits are the geometric
 * midpoint of two rungs of a **detection** ladder. `PHASE_0_LOOSE_ENDS.md` row **A16** is the ledger
 * entry that says so and names this round; this file is that round's fixture.
 *
 * ## The one thing this round exists to do
 *
 * Round 1 part 2 asked *"Are the icons clearly visible on this background?"* — a **detection**
 * question. The reviewer's refinement of 2026-08-04 retracts its answer at 0.08804 as *"hardly
 * perceptible"* and rules that a detection threshold is the wrong instrument for an escape from a
 * contrast floor: *"if APCA says 0 (or close to it) and then we use 'minimal OKLab distance at which
 * I can see the difference' those accents will still be hardly perceptible"*. So the quantity wanted
 * is **functional**, and nobody has measured how much more separation function needs than detection.
 *
 * This round asks the functional question and nothing else. Crucially it re-asks it on **four
 * stimuli round 1 already answered under the detection criterion, pixel-for-pixel identical** (see
 * `ANCHOR_REPLAYS`). Those four are what turn the round from "a threshold" into "a *measured gap*
 * between two criteria": same colours, same renderer, same reviewer, one word changed in the
 * question. Any difference in the answers is attributable to the criterion, because nothing else
 * differs.
 *
 * ## Why the stimuli are rendered by the existing part-2 renderer, and not in a new mock
 *
 * `review-ui/bracketing.js` `renderAccent()` draws a **flat field filling the stage with three
 * accent-coloured elements on it** — a disc, a play-triangle and a ring, 8vmin each. That is an
 * accent *in a role* (it is the transport-control vocabulary of the palette mock itself), not a bare
 * swatch pair — the bare pair is `renderPair()`, which part 1 uses and this round never touches.
 *
 * A richer mock was considered and **deliberately rejected**, because it is incompatible with the
 * round's own purpose: identical stimuli is what makes the four anchors measure the criterion gap,
 * and re-rendering them in a new style would confound criterion with rendering — the one confound
 * this round is built to exclude. Rendering therefore stays byte-identical to round 1 and the
 * **question** is the only thing that changes. That is the whole experiment.
 *
 * ## Everything here is deterministic from `ACCENT_FUNCTIONAL_SEED`
 *
 * Regenerating reproduces the fixture byte for byte. Write it with:
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/accent-functional.ts --write
 */
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import { apcaLc, apcaRaw, okLabDistance, okLabToRgb, rgbToApcaY, rgbToHex, rgbToOkLab } from "../contract/color.ts"
import { APCA_RAW_IDENTICAL_CEILING } from "../contract/constants.ts"
import type { OkLab, Rgb8 } from "../contract/types.ts"
import {
	type BracketingFixture,
	type BracketingItem,
	HUE_THIRD_BOUNDARIES_DEGREES,
	PART2_MAX_DELTA_Y,
	PART2_STRATUM,
	PART_PROMPTS,
	hueThirdOf,
	logLadder,
} from "./bracketing.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/**
 * Reused verbatim from round 1 rather than bumped. The *shapes* in this fixture are exactly
 * `BracketingItem`/`BracketingFixture` — this round adds no field and removes none — and
 * `pushBracketing()` rejects any other version outright (`server.ts:1232`). A new version string
 * would buy nothing and would lock the round out of the machinery it is meant to reuse.
 */
export const ACCENT_FUNCTIONAL_FIXTURE_VERSION = "color-bracketing-1"

export const ACCENT_FUNCTIONAL_BATCH_ID = "accent-functional-1"

/** Today. Distinct from every earlier round's seed so no two fixtures share a colour draw. */
export const ACCENT_FUNCTIONAL_SEED = 20260804

/**
 * The criterion of record, travelling with the answers.
 *
 * It names what this round is NOT as loudly as what it is, because the one prior failure in this
 * repository's calibration history was a round answered under the wrong criterion
 * (`BRACKETING_ACTIVE_BATCH_ID`'s comment: round 1 was abandoned mid-session and re-pushed for
 * exactly that reason).
 */
export const ACCENT_FUNCTIONAL_CRITERION =
	"functional-visibility — does this work as an accent at a glance; explicitly NOT the detection " +
	"criterion of bracketing round 1 part 2 (\"are the icons clearly visible on this background\")"

/* ------------------------------------------------------------------------------------------- */
/* The wording. Load-bearing — see the pre-registration, §3.                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The reviewer-facing wording, verbatim, pre-registered before a single item existed.
 *
 * The question is the reviewer's own phrase from the constant's provenance tag — *"does this work as
 * an accent at a glance"* — turned into a sentence and nothing more. The instruction's first clause
 * is the load-bearing one: it **refuses the detection reading out loud**, because that reading is
 * what round 1 measured and what the refinement retracts. "Assume you can see it" is not a hint
 * about the answer; it grants the detection question and then declines to ask it.
 *
 * `same-color` is carried unchanged from `PART_PROMPTS` so that nothing drifts. **No item in this
 * fixture is a `same-color` item**, so it is never shown; it is present because the fixture type
 * pins the shape of `prompts`, and copying round 1's text verbatim is the option that cannot
 * introduce a discrepancy.
 */
export const ACCENT_FUNCTIONAL_PROMPTS = {
	"same-color": PART_PROMPTS["same-color"],
	"accent-visible": {
		question: "Does this work as an accent at a glance?",
		instruction:
			"Not \"can you see the difference\" — assume you can. At a glance, without hunting: is this colour " +
			"doing an accent's job here — does it pick these elements out as something the eye lands on? " +
			"If you only find it by looking for it, or it reads as a difference rather than as an accent, answer no.",
	},
} as const

/* ------------------------------------------------------------------------------------------- */
/* The ladder                                                                                    */
/* ------------------------------------------------------------------------------------------- */

/**
 * The distance ladder, log-spaced, spanning the range A16 asks for.
 *
 * The floor sits just under the lower anchor the reviewer has already spoken to (0.08804, retracted
 * as "hardly perceptible", so the functional threshold is strictly above it) and the ceiling sits
 * above the upper anchor they endorse and do **not** retract (0.24181). A threshold outside
 * [0.08804, 0.24181] would contradict an answer already given, so the ladder's job is to place it
 * inside — with enough rungs below and above the bracket that the round can also *report* it if the
 * reviewer's functional answers land outside, rather than being unable to see that.
 */
export const ACCENT_FUNCTIONAL_LADDER_MIN = 0.06
export const ACCENT_FUNCTIONAL_LADDER_MAX = 0.3
export const ACCENT_FUNCTIONAL_LADDER_STEPS = 9

/**
 * Field lightness bands, in OKLab L.
 *
 * Three bands rather than round 1's two, because A16 leaves the stratification open and the escape
 * is enforced over a whole rendered ramp — a threshold that holds only at mid lightness would be a
 * finding, not a nuisance. The span is [0.35, 0.80] because that is where round 1's part-2 generator
 * found equal-luminance pairs to exist at all: outside it the gamut has nowhere to put a chromatic
 * displacement without moving luminance, which is the one thing an isoluminant stimulus may not do.
 */
export const ACCENT_FUNCTIONAL_LIGHTNESS_BANDS = [
	{ name: "dark", low: 0.35, high: 0.5 },
	{ name: "mid", low: 0.5, high: 0.65 },
	{ name: "light", low: 0.65, high: 0.8 },
] as const

/** Hue thirds of the **accent** — the colour being asked to do the work. Round 2's boundaries. */
export const ACCENT_FUNCTIONAL_HUE_THIRDS = HUE_THIRD_BOUNDARIES_DEGREES.length

/**
 * **Where the cell is recorded, and why it is not in `stratum`.**
 *
 * Every item here carries round 1's `PART2_STRATUM` (`accent-equal-luminance`) verbatim, because
 * `analyze-bracketing.ts`'s `loadFixture()` refuses any accent item in another stratum — a guard
 * worth honouring rather than routing around, and honest besides: this **is** that stimulus family,
 * re-asked. The cell therefore lives in two places the shared guard does not police: the typed
 * `hueThird` field, and the item id (`af-ladder-r{rung}-h{hueThird}-{band}`), which is the only
 * carrier for the lightness band since `BracketingItem` has no field for one. The id format is
 * deterministic and `assertBalanced()` checks the design it encodes, so parsing it in the analysis is
 * reading a contract, not scraping a name.
 */

/**
 * How far an achieved 8-bit distance may sit from its ladder target.
 *
 * Much tighter than round 1's 0.25, and affordable: round 1 drew random RGB triples and hoped, this
 * file *constructs* the pair in OKLab polar coordinates and only rounds at the end. The fit uses the
 * **achieved** distance regardless (see the pre-registration §6) — the tolerance only keeps the
 * ladder from bunching up.
 */
export const ACCENT_FUNCTIONAL_TARGET_TOLERANCE = 0.06

/**
 * How far a constructed OKLab point may move when it is rounded to 8 bits before it is treated as
 * out of gamut. `okLabToRgb` clamps silently, so a clipped colour is indistinguishable from a
 * rounded one except by how far it moved. This is an efficiency filter only: the guards that decide
 * whether an item is kept are all measured on the final 8-bit pair.
 */
const GAMUT_ROUND_TRIP_TOLERANCE = 0.01

/** Draw budget per item before the search gives up and the generator throws. */
const MAX_ATTEMPTS = 400_000

/* ------------------------------------------------------------------------------------------- */
/* The anchors — round 1's own stimuli, replayed                                                 */
/* ------------------------------------------------------------------------------------------- */

/**
 * The four already-answered rungs, copied **exactly** from
 * `data/calibration/bracketing-round-1.json`, stratum `accent-equal-luminance`.
 *
 * Why these four and not another four. They are the rungs the reviewer's own statements have
 * already pinned, and together they straddle every boundary this round cares about:
 *
 * - **0.06339** (`p2-ladder-05`) — the **highest** rung answered *not* visible under detection. The
 *   last "no" of the old criterion. A functional "no" here is uninformative; a functional "yes"
 *   would be a contradiction worth knowing about.
 * - **0.08804** (`p2-ladder-06`) — the **lowest** rung answered visible under detection, and the one
 *   the refinement retracts by name as "hardly perceptible". *This is the round's crux.* Detection
 *   said yes; the refinement says function says no. If the functional answer here is "no", the gap
 *   between the two criteria is measured directly, on one item, in one word.
 * - **0.14813** (`p2-ladder-08`) — the rung the current placeholder sits just below (0.14591 lands
 *   between this and the next). Whether the placeholder is too low or too high is decided here.
 * - **0.24181** (`p2-ladder-09`) — the top rung, called visible and **not** retracted; the
 *   refinement opens *"we want to keep that class of accents"*. A functional "no" here would refuse
 *   an accent the reviewer plainly endorses, and would mean the escape cannot be rescued at any
 *   distance the gamut affords.
 *
 * `okLabDistance` is recomputed from the RGB at generation time rather than copied, so a typo in a
 * transcribed triple shows up as a mismatched distance instead of travelling silently. The
 * generator asserts each against the value below.
 */
export const ANCHOR_REPLAYS = [
	{ sourceItemId: "p2-ladder-05", field: [183, 147, 104], accent: [217, 131, 93], expectedDistance: 0.06339 },
	{ sourceItemId: "p2-ladder-06", field: [147, 95, 80], accent: [185, 67, 29], expectedDistance: 0.08804 },
	{ sourceItemId: "p2-ladder-08", field: [154, 182, 164], accent: [221, 166, 0], expectedDistance: 0.14813 },
	{ sourceItemId: "p2-ladder-09", field: [160, 161, 184], accent: [67, 185, 24], expectedDistance: 0.24181 },
] as const satisfies readonly {
	sourceItemId: string
	field: readonly [number, number, number]
	accent: readonly [number, number, number]
	expectedDistance: number
}[]

/** The batch the anchors were first answered in. Recorded so the join is not folklore. */
export const ANCHOR_SOURCE_BATCH_ID = "bracketing-round-1-clarified"

/** Tolerance on the recomputed anchor distance against the value transcribed above. */
const ANCHOR_DISTANCE_TOLERANCE = 5e-6

/* ------------------------------------------------------------------------------------------- */
/* Controls and repeats                                                                          */
/* ------------------------------------------------------------------------------------------- */

/**
 * Two controls per direction rather than round 1's one.
 *
 * A control is the only thing that can tell "the reviewer answered no because the accent does not
 * work" apart from "the reviewer answered no because they had drifted into answering a different
 * question". Under a *functional* criterion that risk is higher than under detection — the question
 * is softer — so the round pays for a second of each.
 *
 * `control-identical` (field and accent the same colour) must be answered **no** and
 * `control-obvious` (a separation no one could call marginal) must be answered **yes**, under any
 * reading of any criterion. A failure invalidates the pass; it does not adjust the fit.
 */
const CONTROL_FIELDS: readonly Rgb8[] = [
	[64, 66, 70],
	[196, 192, 184],
]

/** Plainly-working accents for the two obvious controls, one dark field and one light. */
const CONTROL_OBVIOUS_ACCENTS: readonly Rgb8[] = [
	[242, 240, 236],
	[24, 26, 30],
]

/**
 * How many ladder items are silently re-asked.
 *
 * Repeats measure the reviewer's own answer noise, which under a functional criterion is the
 * dominant uncertainty — and the pre-registration's §6 refuses to report a threshold tighter than
 * the noise the repeats reveal. They are drawn from the middle of the ladder because that is where
 * answers can actually disagree; a repeat at either end measures nothing but boredom.
 */
const REPEAT_COUNT = 4
const REPEAT_RUNG_RANGE = { low: 2, high: 6 } as const

/** Minimum number of served items between a repeat and the item it duplicates. Round 3's value. */
const MIN_REPEAT_SEPARATION = 12

/* ------------------------------------------------------------------------------------------- */
/* Construction                                                                                  */
/* ------------------------------------------------------------------------------------------- */

function chromaOf(lab: OkLab): number {
	return Math.hypot(lab[1], lab[2])
}

/** Build an 8-bit colour from OKLab polar coordinates, or `null` if the gamut clipped it. */
function fromPolar(lightness: number, chroma: number, hueRadians: number): Rgb8 | null {
	const lab: OkLab = [lightness, Math.cos(hueRadians) * chroma, Math.sin(hueRadians) * chroma]
	const rgb = okLabToRgb(lab)
	if (okLabDistance(rgbToOkLab(rgb), lab) > GAMUT_ROUND_TRIP_TOLERANCE) return null
	return rgb
}

/**
 * Find an 8-bit colour at (as near as possible) the same APCA luminance as `field`, displaced by
 * `target` in the OKLab (a,b) plane.
 *
 * Lightness is solved for rather than chosen: moving in chroma alone changes Y, so L is bisected
 * until APCA's Y matches the field's. What survives the 8-bit rounding is measured, not assumed.
 *
 * This is round 1's `equalLuminanceAccent`, re-stated because that one is module-private. It is
 * deliberately *not* a behaviour change: the four anchors must be reproducible by the same
 * arithmetic that produced them.
 */
function equalLuminanceAccent(field: Rgb8, target: number, angle: number): Rgb8 | null {
	const fieldLab = rgbToOkLab(field)
	const fieldY = rgbToApcaY(field)
	const a = fieldLab[1] + Math.cos(angle) * target
	const b = fieldLab[2] + Math.sin(angle) * target

	let low = 0
	let high = 1
	let best: Rgb8 | null = null
	let bestDelta = Infinity
	for (let step = 0; step < 40; step++) {
		const mid = (low + high) / 2
		const candidate = okLabToRgb([mid, a, b])
		const delta = rgbToApcaY(candidate) - fieldY
		if (Math.abs(delta) < bestDelta) {
			bestDelta = Math.abs(delta)
			best = candidate
		}
		if (delta > 0) high = mid
		else low = mid
	}
	if (best === null || bestDelta > PART2_MAX_DELTA_Y) return null
	if (Math.abs(apcaRaw(best, field)) > APCA_RAW_IDENTICAL_CEILING) return null
	return best
}

function truthFor(field: Rgb8, accent: Rgb8, targetDistance: number | null) {
	const fieldLab = rgbToOkLab(field)
	const accentLab = rgbToOkLab(accent)
	return {
		targetDistance,
		okLabDistance: okLabDistance(fieldLab, accentLab),
		chromaDistance: Math.hypot(accentLab[1] - fieldLab[1], accentLab[2] - fieldLab[2]),
		apcaRaw: apcaRaw(accent, field),
		apcaLc: apcaLc(accent, field),
		deltaApcaY: rgbToApcaY(accent) - rgbToApcaY(field),
		identical: field[0] === accent[0] && field[1] === accent[1] && field[2] === accent[2],
	}
}

function makeItem(
	itemId: string,
	stratum: string,
	field: Rgb8,
	accent: Rgb8,
	targetDistance: number | null,
	role: BracketingItem["role"],
	repeatOf: string | null = null,
	hueThird?: number,
): BracketingItem {
	return {
		itemId,
		// Every item in this round is an accent-on-field stimulus; `renderAccent()` keys off this.
		part: "accent-visible",
		stratum,
		first: field,
		second: accent,
		firstHex: rgbToHex(field),
		secondHex: rgbToHex(accent),
		truth: truthFor(field, accent, targetDistance),
		role,
		repeatOf,
		...(hueThird === undefined ? {} : { hueThird }),
	}
}

/**
 * The rung → cell assignment, pre-registered and balanced.
 *
 * Nine cells (3 accent hue thirds × 3 field lightness bands), nine rungs, three items per rung: rung
 * `i` takes cells `{i, i+2, i+4} (mod 9)`, cell index `c` meaning hue third `floor(c / 3)` and band
 * `c % 3`.
 *
 * Two properties make this the assignment rather than an arbitrary one, and both are checked by
 * `assertBalanced()` below rather than asserted in prose:
 *
 * 1. **Every rung covers all three lightness bands, exactly once.** `{i, i+2, i+4} mod 3` is
 *    `{i, i+2, i+1} mod 3` — all three residues. So lightness can never be confounded with distance:
 *    at every rung the three items are one dark, one mid, one light.
 * 2. **Every cell is used exactly three times.** 9 rungs × 3 = 27 = 9 cells × 3, and `c` is hit by
 *    rungs `c`, `c−2`, `c−4`, which are distinct mod 9.
 *
 * Hue third is spread across rungs rather than balanced within them — with three items per rung it
 * cannot be both, and lightness is the axis the escape is enforced over.
 */
export function cellsForRung(rung: number): readonly { hueThird: number; band: number }[] {
	return [0, 2, 4].map((offset) => {
		const cell = (rung + offset) % 9
		return { hueThird: Math.floor(cell / 3), band: cell % 3 }
	})
}

function assertBalanced(): void {
	const cellUse = new Array<number>(9).fill(0)
	for (let rung = 0; rung < ACCENT_FUNCTIONAL_LADDER_STEPS; rung++) {
		const bands = new Set<number>()
		for (const { hueThird, band } of cellsForRung(rung)) {
			bands.add(band)
			cellUse[hueThird * 3 + band] += 1
		}
		if (bands.size !== 3) throw new Error(`rung ${rung} does not cover all three lightness bands`)
	}
	if (cellUse.some((count) => count !== 3)) throw new Error(`cells are not used equally: ${cellUse.join(",")}`)
}

/**
 * Build one isoluminant accent-on-field pair at `target`, with the accent's hue in `hueThird` and
 * the field's OKLab lightness inside `band`.
 *
 * The construction, and why it is not round 1's. Round 1 drew a random near-neutral field and pushed
 * the accent away from it, which caps the reachable distance at the gamut's chroma at that
 * lightness — that is why its ladder stopped at 0.24181. Here the pair is **split about a centre**:
 * the field is placed at chroma `split × target` on one side and the accent lands at roughly
 * `(1 − split) × target` on the other, so each colour only needs about half the separation's worth
 * of chroma and 0.30 becomes reachable. It also removes an artefact of round 1's design nobody chose
 * — that the field was always near-neutral — which for a round about *fields* would have been a poor
 * thing to bake in.
 *
 * The accent's hue is controllable because it is `θ` by construction when the field sits at `θ+180°`;
 * the jitter on that opposition (and the resulting drift in the accent's hue) is why the hue third is
 * re-derived from the finished 8-bit accent and used as a rejection criterion rather than assumed.
 */
function buildPair(
	target: number,
	hueThird: number,
	band: (typeof ACCENT_FUNCTIONAL_LIGHTNESS_BANDS)[number],
	random: () => number,
): { field: Rgb8; accent: Rgb8; achieved: number } {
	const thirdWidth = (Math.PI * 2) / ACCENT_FUNCTIONAL_HUE_THIRDS
	let best: { field: Rgb8; accent: Rgb8; achieved: number } | null = null
	let bestError = Infinity

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		// The accent's intended hue, inset from the boundaries so 8-bit rounding cannot tip a
		// finished accent into the neighbouring third and force a rejection for no reason.
		const inset = thirdWidth * 0.08
		const theta = hueThird * thirdWidth + inset + random() * (thirdWidth - 2 * inset)
		const lightness = band.low + random() * (band.high - band.low)
		// How much of the separation the field carries. Large targets need a genuinely chromatic
		// field; small ones do not, and a fixed split would make field chroma a function of target.
		const split = 0.2 + random() * 0.3
		// The field sits opposite the accent, jittered — a fixed 180° would make every stimulus an
		// exact complementary pair, which is a stimulus property nobody chose and might well be the
		// most accent-friendly one there is.
		const opposition = Math.PI + (random() - 0.5) * (Math.PI / 3) * (1 - target / ACCENT_FUNCTIONAL_LADDER_MAX)
		const field = fromPolar(lightness, split * target, theta + opposition)
		if (field === null) continue

		const fieldLab = rgbToOkLab(field)
		if (fieldLab[0] < band.low || fieldLab[0] > band.high) continue

		// Displace towards the accent's intended hue, from wherever the rounded field actually is.
		const displacement = Math.atan2(
			Math.sin(theta) * target - fieldLab[2],
			Math.cos(theta) * target - fieldLab[1],
		)
		const accent = equalLuminanceAccent(field, target, displacement)
		if (accent === null) continue
		if (accent[0] === field[0] && accent[1] === field[1] && accent[2] === field[2]) continue

		const accentLab = rgbToOkLab(accent)
		if (hueThirdOf(accentLab) !== hueThird) continue
		// A near-neutral accent has no meaningful hue, so its "hue third" would be rounding noise.
		if (chromaOf(accentLab) < 0.02) continue

		const achieved = okLabDistance(fieldLab, accentLab)
		const error = Math.abs(achieved - target) / target
		if (error < bestError) {
			bestError = error
			best = { field, accent, achieved }
		}
		if (error <= ACCENT_FUNCTIONAL_TARGET_TOLERANCE) return best!
	}

	if (best === null || bestError > ACCENT_FUNCTIONAL_TARGET_TOLERANCE * 2) {
		throw new Error(
			`could not build an equal-luminance pair at ${target} in hue third ${hueThird}, band ${band.name}` +
				(best === null ? "" : ` (best relative error ${bestError.toFixed(4)})`),
		)
	}
	return best
}

/** Fisher-Yates under the seeded PRNG. Round 1's, unchanged. */
function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values]
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

/**
 * Shuffle, then push repeats apart from their originals.
 *
 * A repeat two items after its original measures recall, not noise. This walks the order and moves
 * any repeat that landed too close to its twin further back, which is a weaker guarantee than
 * rejection sampling the whole permutation but is deterministic and always terminates.
 */
function separateRepeats(order: string[], repeatOf: ReadonlyMap<string, string>): string[] {
	const out = [...order]
	for (let pass = 0; pass < 8; pass++) {
		let moved = false
		for (let index = 0; index < out.length; index++) {
			const source = repeatOf.get(out[index])
			if (source === undefined) continue
			const origin = out.indexOf(source)
			if (origin === -1 || Math.abs(index - origin) >= MIN_REPEAT_SEPARATION) continue
			const target = Math.min(out.length - 1, Math.max(origin, index) + MIN_REPEAT_SEPARATION)
			const [item] = out.splice(index, 1)
			out.splice(target, 0, item)
			moved = true
		}
		if (!moved) break
	}
	return out
}

/* ------------------------------------------------------------------------------------------- */
/* Fixture                                                                                       */
/* ------------------------------------------------------------------------------------------- */

export function generateAccentFunctionalFixture(
	batchId = ACCENT_FUNCTIONAL_BATCH_ID,
	seed = ACCENT_FUNCTIONAL_SEED,
): BracketingFixture {
	assertBalanced()
	const random = mulberry32(seed)
	const ladder = logLadder(ACCENT_FUNCTIONAL_LADDER_MIN, ACCENT_FUNCTIONAL_LADDER_MAX, ACCENT_FUNCTIONAL_LADDER_STEPS)
	const items: BracketingItem[] = []

	/* --- the anchors: round 1's own stimuli, replayed under the new question ------------------ */
	for (const anchor of ANCHOR_REPLAYS) {
		const field = [...anchor.field] as unknown as Rgb8
		const accent = [...anchor.accent] as unknown as Rgb8
		const distance = okLabDistance(rgbToOkLab(field), rgbToOkLab(accent))
		if (Math.abs(distance - anchor.expectedDistance) > ANCHOR_DISTANCE_TOLERANCE) {
			throw new Error(
				`anchor ${anchor.sourceItemId} recomputes to ${distance.toFixed(6)}, expected ${anchor.expectedDistance}`,
			)
		}
		items.push(
			makeItem(
				// The id carries the join to round 1 in plain sight: no lookup table decides which
				// old answer this new answer is to be compared with.
				`af-anchor-${anchor.sourceItemId}`,
				PART2_STRATUM,
				field,
				accent,
				anchor.expectedDistance,
				"ladder",
			),
		)
	}

	/* --- the ladder: 9 rungs × 3 cells -------------------------------------------------------- */
	for (const [rung, target] of ladder.entries()) {
		for (const { hueThird, band } of cellsForRung(rung)) {
			const bandSpec = ACCENT_FUNCTIONAL_LIGHTNESS_BANDS[band]
			const { field, accent } = buildPair(target, hueThird, bandSpec, random)
			items.push(
				makeItem(
					`af-ladder-r${String(rung).padStart(2, "0")}-h${hueThird}-${bandSpec.name}`,
					PART2_STRATUM,
					field,
					accent,
					target,
					"ladder",
					null,
					hueThird,
				),
			)
		}
	}

	/* --- controls ----------------------------------------------------------------------------- */
	for (const [index, field] of CONTROL_FIELDS.entries()) {
		items.push(
			makeItem(`af-control-obvious-${index}`, PART2_STRATUM, field, CONTROL_OBVIOUS_ACCENTS[index], null, "control-obvious"),
		)
		items.push(makeItem(`af-control-identical-${index}`, PART2_STRATUM, field, field, 0, "control-identical"))
	}

	/* --- repeats: silent re-asks from the middle of the ladder -------------------------------- */
	const repeatable = items.filter(
		(item) =>
			item.role === "ladder" &&
			item.itemId.startsWith("af-ladder-") &&
			(() => {
				const rung = Number(item.itemId.slice("af-ladder-r".length, "af-ladder-r".length + 2))
				return rung >= REPEAT_RUNG_RANGE.low && rung <= REPEAT_RUNG_RANGE.high
			})(),
	)
	const repeats = shuffled(repeatable, random).slice(0, REPEAT_COUNT)
	for (const [index, source] of repeats.entries()) {
		items.push(
			makeItem(
				`af-repeat-${String(index).padStart(2, "0")}`,
				source.stratum,
				source.first,
				source.second,
				source.truth.targetDistance,
				"repeat",
				source.itemId,
				source.hueThird,
			),
		)
	}

	/* --- serve order -------------------------------------------------------------------------- */
	// One pass, one question, fully shuffled: the reviewer must not be able to feel the ladder. The
	// anchors are shuffled in with everything else — a replay the reviewer could identify as a replay
	// would be answered from memory, and memory of the old answer is exactly the confound the four
	// anchors exist to avoid.
	const repeatOf = new Map(items.filter((item) => item.repeatOf !== null).map((item) => [item.itemId, item.repeatOf!]))
	const serveOrder = separateRepeats(shuffled(items.map((item) => item.itemId), random), repeatOf)

	return {
		fixtureVersion: ACCENT_FUNCTIONAL_FIXTURE_VERSION,
		batchId,
		seed,
		generatedBy: "research/v3/src/review-server/accent-functional.ts",
		criterion: ACCENT_FUNCTIONAL_CRITERION,
		prompts: ACCENT_FUNCTIONAL_PROMPTS as unknown as typeof PART_PROMPTS,
		// Carried because the fixture type requires them. This round does not stratify by quadrant —
		// it stratifies by accent hue third and field lightness band — so these are round 1's values,
		// present and unused, rather than something invented to fill the slot.
		quadrantBoundaries: { lightness: 0.55, chroma: 0.05 },
		prior: { sameColorBar: 0.14591 },
		items,
		serveOrder,
	}
}

export const ACCENT_FUNCTIONAL_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/accent-functional-round-1.json", import.meta.url),
)

export function serializeFixture(fixture: BracketingFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}

/* ------------------------------------------------------------------------------------------- */
/* Push                                                                                          */
/* ------------------------------------------------------------------------------------------- */

/**
 * What the batch log records about why this round exists. It is the round's provenance, and it is
 * the only place the pre-registration's path is bound to the batch itself — so an answer can always
 * be traced to the rule that was fixed before it was given.
 */
export const ACCENT_FUNCTIONAL_FUNDED_BY: readonly string[] = [
	"PHASE_0_LOOSE_ENDS.md A16 — ACCENT_FUNCTIONAL_DISTANCE is [UNCALIBRATED], in force, and no " +
		"stimulus was ever graded against the criterion it is named for",
	"src/contract/constants.ts:371 — placeholder 0.14591, the geometric midpoint of two rungs of a " +
		"DETECTION ladder",
	`criterion: ${ACCENT_FUNCTIONAL_CRITERION}`,
	`question: ${ACCENT_FUNCTIONAL_PROMPTS["accent-visible"].question}`,
	"Pre-registered design and fitting rule: research/v3/data/calibration/" +
		"accent-functional-round-1-preregistration.md",
	"Four items replay bracketing-round-1-clarified p2-ladder-05/06/08/09 pixel-for-pixel, so the " +
		"gap between the detection and functional criteria is measured on identical stimuli",
]

/**
 * Push over HTTP, to a server that is already running.
 *
 * Deliberately *not* a `seedBracketingRound4()` in `server.ts`: round 3 set the precedent that a new
 * round needs no server code change and no restart, because `ReviewService.load()` replays
 * `batches.jsonl` on boot. Structural typing on the response keeps this module from importing the
 * server.
 */
export async function pushAccentFunctionalRound(
	base: string,
	fixturePath = ACCENT_FUNCTIONAL_FIXTURE_PATH,
	fundedBy: readonly string[] = ACCENT_FUNCTIONAL_FUNDED_BY,
): Promise<{ status: number; body: unknown }> {
	const { readFile } = await import("node:fs/promises")
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as BracketingFixture
	const response = await fetch(`${base}/api/bracketing`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ fixture, fundedBy }),
	})
	const text = await response.text()
	return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) }
}

/* ------------------------------------------------------------------------------------------- */
/* CLI                                                                                           */
/* ------------------------------------------------------------------------------------------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	if (values.push !== undefined) {
		const result = await pushAccentFunctionalRound(values.push)
		console.log(result.status, JSON.stringify(result.body))
		process.exit(result.status === 201 ? 0 : 1)
	}
	const fixture = generateAccentFunctionalFixture()
	if (values.write) {
		await writeFile(ACCENT_FUNCTIONAL_FIXTURE_PATH, serializeFixture(fixture), "utf8")
		console.log(`wrote ${ACCENT_FUNCTIONAL_FIXTURE_PATH} — ${fixture.items.length} items`)
	} else {
		const byRole = new Map<string, number>()
		for (const item of fixture.items) byRole.set(item.role, (byRole.get(item.role) ?? 0) + 1)
		console.log(`${fixture.items.length} items:`, Object.fromEntries(byRole))
		for (const item of fixture.items) {
			console.log(
				`${item.itemId.padEnd(34)} d=${item.truth.okLabDistance.toFixed(5)}` +
					` target=${item.truth.targetDistance === null ? "—" : item.truth.targetDistance.toFixed(5)}` +
					` dY=${item.truth.deltaApcaY.toFixed(5)} raw=${item.truth.apcaRaw.toFixed(3)}` +
					` ${item.firstHex}→${item.secondHex}`,
			)
		}
	}
}
