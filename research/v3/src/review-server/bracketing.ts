/**
 * The same-colour-bar bracketing round — fixture generation.
 *
 * `PHASE_0_DECISIONS.md` §3 asks for one ruler (Euclidean OKLab distance) whose threshold is
 * "empirically bracketed by the reviewer in one purpose-built round spanning dark/light ×
 * neutral/saturated pairs — also testing whether one threshold survives all four quadrants".
 * `SAME_COLOR_BAR` is `[UNCALIBRATED]` at 0.012, a *prior* translated from v2-3's CIE76 ΔE 3.3 by
 * the knob-free exact-ΔE-ray scheme in `research/v3/src/contract/calibration/`. That translation's
 * own finding is that no single OKLab distance "means" ΔE 3.3 — only a distribution — so the prior
 * says where to look and nothing more. This round is the measurement.
 *
 * Part 2 attaches the second open question from §4 invariant 4: at equal luminance, chromatic icons
 * may still be visible, so the accent's floor may properly live in colour distance rather than in a
 * luminance epsilon. The reviewer's eyes decide.
 *
 * Everything here is deterministic from `BRACKETING_SEED`: regenerating reproduces the committed
 * fixture byte for byte, which a test asserts. Write the fixture with:
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/bracketing.ts --write
 */
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import {
	apcaLc,
	apcaRaw,
	okLabDistance,
	okLabToRgb,
	rgbToApcaY,
	rgbToHex,
	rgbToOkLab,
} from "../contract/color.ts"
import { APCA_RAW_IDENTICAL_CEILING, POOLED_SAME_COLOR_BAR } from "../contract/constants.ts"
import type { OkLab, Rgb8 } from "../contract/types.ts"

/* ------------------------------------------------------------------------------------------- */
/* Constants                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/** Fixture format version, stamped into the file. Bump on any breaking change to the shapes. */
export const BRACKETING_FIXTURE_VERSION = "color-bracketing-1"

/**
 * The prior this round was designed against: 0.012, translated from v2-3's CIE76 ΔE 3.3 by the
 * exact-ΔE-ray scheme in `research/v3/src/contract/calibration/`.
 *
 * `[UNCALIBRATED]` — and deliberately **frozen here rather than imported**. It used to be
 * `SAME_COLOR_BAR` in `../contract/constants.ts`; this round is what measured that constant, and the
 * contract has since replaced it with the measured `SAME_COLOR_BAR_BY_REGION` /
 * `POOLED_SAME_COLOR_BAR`. Pointing the generator at the measured value would regenerate a
 * *different* set of pairs from the ones the reviewer actually answered, silently invalidating a
 * released round. The design-time prior is part of this fixture's history, so it lives with it.
 */
export const BRACKETING_PRIOR_SAME_COLOR_BAR = 0.012

/**
 * Master seed. One number drives every draw in the round, so the fixture is reproducible and a
 * second round can be generated independently by changing only this.
 * [UNCALIBRATED] — an arbitrary constant; only its fixedness matters.
 */
export const BRACKETING_SEED = 20260802

/**
 * Quadrant boundary in OKLab lightness.
 *
 * [MEASURED] — anchored on the sRGB grey ramp: OKLab L 0.55 is grey ≈113, and CIELab L*50 (the
 * split used in the `SAME_COLOR_BAR` four-quadrant check) is OKLab L 0.5693 at grey 119. The two
 * agree to within three grey levels. Stated in OKLab because that is the space the ruler lives in;
 * the choice only assigns items to strata, it does not enter any threshold.
 */
export const QUADRANT_LIGHTNESS_BOUNDARY = 0.55

/**
 * Quadrant boundary in OKLab chroma (hypot(a, b)).
 *
 * [MEASURED] — sRGB anchors: a grey-blue (110,118,130) reads 0.021 and is plainly neutral; a muted
 * blue (90,110,150) reads 0.068 and plainly is not; pure red reads 0.258. 0.05 sits between the
 * first two, i.e. at "you can name its hue without being told". Same status as the lightness
 * boundary: it strates, it does not calibrate.
 */
export const QUADRANT_CHROMA_BOUNDARY = 0.05

/**
 * The criterion the reviewer is answering under.
 *
 * [REVIEWED] — clarified by the reviewer mid-session, 2026-08-02. The first pass was abandoned
 * because it was being answered under a *detection* criterion ("can I see any difference at the
 * seam") rather than the intended *identity* one ("do these register as the same colour"). Those
 * are different thresholds — detection is far more sensitive — so the two passes must never be
 * pooled. This string is stamped on the fixture and repeated in the analysis output; the round that
 * collected the answers is identified by its batch id.
 */
export const BRACKETING_CRITERION =
	"register-as-same, clarified 2026-08-02 after a false start under a detection criterion"

/**
 * The round currently in front of the reviewer.
 *
 * The fixture's own `batchId` names the *pairs*; this names the *pass* over them. The first pass
 * (`bracketing-round-1`) was abandoned mid-session because it was being answered under a detection
 * criterion, so it was re-pushed under this id with fresh tokens. Its answers stay in the warehouse
 * — the log is append-only and they are evidence about what happened — and nothing pools the two:
 * the analysis fits exactly one batch id.
 * [REVIEWED] — reviewer, 2026-08-02.
 */
export const BRACKETING_ACTIVE_BATCH_ID = "bracketing-round-1-clarified"

/**
 * The reviewer-facing wording, verbatim. It lives in the fixture rather than in the page so that
 * what was asked travels with the answers: a threshold is only meaningful against the question that
 * produced it, and this round has already been re-run once for exactly that reason.
 */
export const PART_PROMPTS = {
	"same-color": {
		question: "Same color?",
		instruction:
			"Answer whether they register as the same color — not whether you can detect any difference at the seam. " +
			"If you have to hunt along the boundary to find it, they're the same color. " +
			"If they'd read as two different colors in a UI, they're different.",
	},
	"accent-visible": {
		question: "Can you clearly see the shapes?",
		instruction: "Would these icons work as UI elements? If you have to hunt for them or they strain, answer no.",
	},
} as const

/** The four strata of §3, in fixed order. */
export const QUADRANTS = ["dark-neutral", "dark-saturated", "light-neutral", "light-saturated"] as const
export type Quadrant = (typeof QUADRANTS)[number]

/**
 * Sampling windows per axis, kept off the extremes of the cube: near black and near white the 8-bit
 * grid is too coarse (or too fine) to be representative, and the round is about the middle of the
 * working range where real palettes live.
 * [UNCALIBRATED] — chosen here.
 */
const LIGHTNESS_WINDOW = { dark: [0.15, QUADRANT_LIGHTNESS_BOUNDARY], light: [QUADRANT_LIGHTNESS_BOUNDARY, 0.92] } as const
const CHROMA_WINDOW = { neutral: [0, QUADRANT_CHROMA_BOUNDARY], saturated: [QUADRANT_CHROMA_BOUNDARY, 0.18] } as const

/**
 * Distance ladder for part 1: 12 log-spaced targets bracketing the 0.012 prior by a factor of three
 * on each side. Log spacing because discrimination thresholds are conventionally analysed against
 * log stimulus intensity, and because a linear ladder would spend most of its points above the
 * prior.
 * [UNCALIBRATED] — the range is a bracketing choice, not a measurement.
 */
export const PART1_DISTANCE_MIN = 0.004
export const PART1_DISTANCE_MAX = 0.036
export const PART1_LADDER_STEPS = 12

/** One identical pair per quadrant: the control that says whether "same?" is being answered at all. */
export const PART1_CONTROLS_PER_QUADRANT = 1

/**
 * Two silent repeats per quadrant, drawn from the middle of the ladder where the answer is least
 * certain — a repeat at an obvious distance measures nothing.
 * [UNCALIBRATED] — chosen here.
 */
export const PART1_REPEATS_PER_QUADRANT = 2

/**
 * Part 2's equal-luminance criterion.
 *
 * The task asked for |raw APCA| < 0.5. That is not reachable as a definition of equal luminance:
 * two *identical* colours already produce |raw| up to `APCA_RAW_IDENTICAL_CEILING` (1.9815),
 * because APCA's reverse branch raises background and text to different exponents. Requiring < 0.5
 * would therefore not select equal-luminance pairs, it would select pairs at the extreme ends of
 * the luminance range where that residue happens to be small.
 *
 * The criterion used instead is exact equality of APCA's own luminance Y, as closely as the 8-bit
 * grid allows. It has the property the round needs: when two colours share a Y, their raw contrast
 * *is* the identical-colour residue at that Y, so |raw| ≤ 1.9815 automatically, whatever their
 * chroma. Each item records its achieved |ΔY| and |raw| so the analysis can check both.
 */
export const PART2_MAX_APCA_RAW = APCA_RAW_IDENTICAL_CEILING
export const PART2_MAX_DELTA_Y = 0.0025

/** Part 2 ladder: chroma/hue distance in the OKLab (a,b) plane, log-spaced from the prior upward. */
export const PART2_CHROMA_MIN = 0.012
export const PART2_CHROMA_MAX = 0.24
export const PART2_LADDER_STEPS = 10

/** How far an achieved distance may sit from its ladder target before the draw is retried. */
const TARGET_TOLERANCE = 0.25

/* ------------------------------------------------------------------------------------------- */
/* Round 2 — the refinement round                                                                */
/* ------------------------------------------------------------------------------------------- */

/**
 * Round 2's pass id, and its fixture's own id.
 *
 * Round 1 stays released and untouched. Rounds are kept apart by batch id — the mechanism that
 * already stops the abandoned first pass being pooled into the clarified one — and *this* round is
 * poolable with `BRACKETING_ACTIVE_BATCH_ID` because both were answered under the same criterion
 * string, which is exactly what the pooled fit checks before combining them.
 */
export const BRACKETING_ROUND_2_BATCH_ID = "bracketing-round-2"

/** Round 2's master seed. Different from round 1's, so the two rounds draw independent colours. */
export const BRACKETING_ROUND_2_SEED = 20260803

/**
 * Round 1's per-quadrant 95% confidence intervals — round 2's sampling windows.
 *
 * `[MEASURED]` — `research/v3/data/calibration/bracketing-round-1-analysis.json`,
 * `part1.quadrants[].confidenceInterval`, from 14 fitted points per quadrant. A test asserts these
 * still equal the committed analysis, so the round cannot silently be built against stale posteriors.
 *
 * Round 1 spread 12 rungs over a factor of nine (0.004–0.036) to find the bar at all. Round 2 spends
 * its whole budget inside the interval round 1 left, which is where the answer changes and therefore
 * where an answer buys the most: outside it, every pair is already predicted with near-certainty and
 * tells us nothing we do not know.
 */
export const ROUND_1_INTERVALS: Readonly<Record<Quadrant, Readonly<{ low: number; high: number; threshold: number }>>> = {
	"dark-neutral": { low: 0.00575, high: 0.01335, threshold: 0.00876 },
	"dark-saturated": { low: 0.01274, high: 0.02443, threshold: 0.01764 },
	"light-neutral": { low: 0.01116, high: 0.02380, threshold: 0.01629 },
	"light-saturated": { low: 0.01153, high: 0.06265, threshold: 0.02687 },
}

/** Ladder rungs inside the interval, per quadrant. [UNCALIBRATED] — a budget split, chosen here. */
export const ROUND2_LADDER_STEPS = 10

/**
 * The light-saturated quadrant is split by hue.
 *
 * Its interval spans a factor of 5.4 — by far the widest of the four — and one live explanation is
 * that "light and saturated" is not one population: a light yellow and a light blue are both in it
 * and behave nothing alike. Three equal thirds of the OKLab hue circle, boundaries stated in
 * degrees, each with its own six-rung ladder over the same interval, so the analysis can fit a bar
 * per third and say whether the width is heterogeneity or noise.
 * [UNCALIBRATED] — equal thirds, chosen here; no measurement says the hue circle divides at these
 * angles. In OKLab, third 0 (0–120°) runs pink-red → orange → yellow → yellow-green, third 1
 * (120–240°) green → cyan → blue, third 2 (240–360°) blue → violet → magenta → red.
 */
export const HUE_THIRD_BOUNDARIES_DEGREES = [0, 120, 240] as const
export const ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD = 6

/**
 * The direction probe.
 *
 * Round 1 drew every partner in a uniformly random OKLab direction, so it can only speak about the
 * *magnitude* of a difference. This asks the question underneath that: at one fixed magnitude, does
 * it matter whether the difference is in lightness, in chroma, or in hue? Twelve pairs, one per
 * (direction × quadrant), all at the same target distance, so a difference in the yes-rate between
 * the three directions is a difference in the bar's shape and not in its size.
 *
 * The target is 0.015 — inside every quadrant's interval and next to round 1's pooled threshold
 * (0.01582), i.e. where the answer is least certain and a probe is most informative.
 * [UNCALIBRATED] — chosen here from round 1's pooled fit.
 */
export const ROUND2_DIRECTION_TARGET = 0.015
export const ROUND2_PROBE_PAIRS_PER_DIRECTION = 4

/**
 * Minimum chroma for a direction-probe base colour.
 *
 * A pure-hue difference is a rotation, so its size is bounded by the chroma it rotates: the chord
 * at chroma C over an angle Δ is 2·C·sin(Δ/2), which cannot reach 0.015 at all below C = 0.0075.
 * Near-grey bases therefore cannot carry the hue arm of the probe, and the probe samples bases at
 * chroma ≥ 0.02 in every quadrant — including the neutral ones, where that is still comfortably
 * inside the neutral window (< 0.05). Stated because it is a real restriction on what the probe
 * covers: it says nothing about differences between two near-greys.
 * [MEASURED] — the bound is arithmetic; 0.02 is the working margin above it.
 */
export const ROUND2_PROBE_BASE_MIN_CHROMA = 0.02

/**
 * Silent repeats, doubled from round 1's two per quadrant.
 *
 * Round 1 measured 63% repeat consistency (5 of 8) — the reviewer's own noise floor, and a number a
 * threshold can never be sharper than. Eight repeats put that estimate's 95% interval at roughly
 * 30–89%, which is too wide to be usable as a floor. Sixteen roughly halves that width. They are
 * drawn from the rungs nearest each quadrant's round-1 threshold, where the answer is genuinely
 * uncertain and a repeat measures something.
 * [MEASURED] — round 1's `repeatConsistency`, 5 of 8.
 */
export const ROUND2_REPEATS_PER_QUADRANT = 4

/** One identical pair per quadrant, unchanged from round 1: the control that says "same?" is being answered. */
export const ROUND2_CONTROLS_PER_QUADRANT = 1

/**
 * How many bases each quadrant's 8-bit expressibility floor is estimated over.
 * [UNCALIBRATED] — enough for a stable median at negligible cost.
 */
const EXPRESSIBILITY_SAMPLES = 400

/* ------------------------------------------------------------------------------------------- */
/* Types                                                                                         */
/* ------------------------------------------------------------------------------------------- */

export type BracketingPart = "same-color" | "accent-visible"

/**
 * Which axis of OKLab a pair differs along. Round 2's direction probe (see below); absent on round
 * 1's items, whose partners are drawn in a uniformly random direction.
 */
export const DIRECTION_KINDS = ["lightness", "chroma", "hue"] as const
export type DirectionKind = (typeof DIRECTION_KINDS)[number]

/**
 * How an achieved difference splits between the three cylindrical axes of OKLab, measured on the
 * two 8-bit colours actually shown. `arc` is the chord-length equivalent of the hue rotation at the
 * pair's mean chroma, so the three components are commensurable and `dominant`/`purity` mean
 * something: `purity` is the intended component's share of the squared difference.
 */
export type Decomposition = Readonly<{
	deltaL: number
	deltaChroma: number
	deltaHueDegrees: number
	arc: number
	dominant: DirectionKind
	purity: number
}>

export type BracketingItem = Readonly<{
	/** Stable id; also the `imageId` of the warehouse record (see the note in server.ts). */
	itemId: string
	part: BracketingPart
	/** Stratum: the quadrant for part 1, the fixed accent stratum for part 2. */
	stratum: string
	/** The two colours, exact 8-bit sRGB. For part 2, `first` is the field and `second` the accent. */
	first: Rgb8
	second: Rgb8
	firstHex: string
	secondHex: string
	/** The truth the reviewer is never shown. */
	truth: Readonly<{
		targetDistance: number | null
		okLabDistance: number
		/** Distance in the OKLab (a,b) plane only — what part 2 varies. */
		chromaDistance: number
		apcaRaw: number
		apcaLc: number
		deltaApcaY: number
		identical: boolean
	}>
	/**
	 * `control` items have a known correct answer; `repeat` items silently re-ask an earlier pair;
	 * `direction-probe` items (round 2) sit at one fixed distance and vary only the axis of the
	 * difference, so they are reported separately and never fitted into a threshold ladder.
	 */
	role: "ladder" | "control-identical" | "control-obvious" | "repeat" | "direction-probe"
	/** For repeats, the itemId whose colours this duplicates. Never served. */
	repeatOf: string | null

	/* --- round 2 only. Absent (and therefore absent from the JSON) on round 1's items. --------- */

	/** Which third of the hue circle both colours sit in. Round 2's light-saturated split. */
	hueThird?: number
	/** Which axis this pair was built to differ along. Round 2's direction probe. */
	direction?: DirectionKind
	/** How the achieved 8-bit difference actually splits between the axes. */
	decomposition?: Decomposition
}>

export type BracketingFixture = Readonly<{
	fixtureVersion: string
	batchId: string
	seed: number
	generatedBy: string
	/** What the reviewer was asked to judge. See `BRACKETING_CRITERION`. */
	criterion: string
	/** The exact wording shown on the page, per question. */
	prompts: typeof PART_PROMPTS
	quadrantBoundaries: Readonly<{ lightness: number; chroma: number }>
	prior: Readonly<{ sameColorBar: number }>
	items: readonly BracketingItem[]
	/** Seeded serve order (item ids). Part 1 is served before part 2; each part is shuffled. */
	serveOrder: readonly string[]
	/** Round 2 only: what this round refines, and the design that follows from it. */
	refinement?: BracketingRefinement
}>

/**
 * Round 2's design record: the posteriors it was built against and every choice they drove.
 *
 * It lives in the fixture because a refinement round is only interpretable next to what it refined —
 * "10 rungs between 0.00575 and 0.01335" means nothing without the interval those numbers came from.
 */
export type BracketingRefinement = Readonly<{
	round: number
	refines: string
	sourceAnalysis: string
	/** Round 1's per-quadrant posterior: the fitted threshold and its 95% interval. */
	priorIntervals: Readonly<Record<string, Readonly<{ low: number; high: number; threshold: number }>>>
	ladder: Readonly<{ stepsPerQuadrant: number; lightSaturatedStepsPerThird: number }>
	hueSplit: Readonly<{
		quadrant: string
		boundariesDegrees: readonly number[]
		labels: readonly string[]
	}>
	directionProbe: Readonly<{
		targetDistance: number
		kinds: readonly DirectionKind[]
		pairsPerKind: number
		baseMinChroma: number
	}>
	repeatsPerQuadrant: number
	controlsPerQuadrant: number
	/**
	 * What the 8-bit grid can express in each quadrant: the distance to the nearest single-channel
	 * neighbour, over sampled bases. A ladder rung cannot be placed more finely than this, and the
	 * achieved distance of a rung near the floor is quantised by roughly half of it.
	 */
	expressibilityFloor: Readonly<Record<string, Readonly<{ p10: number; median: number; p90: number }>>>
}>

/* ------------------------------------------------------------------------------------------- */
/* Sampling helpers                                                                              */
/* ------------------------------------------------------------------------------------------- */

function chroma(lab: OkLab): number {
	return Math.hypot(lab[1], lab[2])
}

function quadrantOf(lab: OkLab): Quadrant {
	const dark = lab[0] < QUADRANT_LIGHTNESS_BOUNDARY
	const neutral = chroma(lab) < QUADRANT_CHROMA_BOUNDARY
	if (dark) return neutral ? "dark-neutral" : "dark-saturated"
	return neutral ? "light-neutral" : "light-saturated"
}

function inWindow(lab: OkLab, quadrant: Quadrant): boolean {
	const [lightLow, lightHigh] = quadrant.startsWith("dark") ? LIGHTNESS_WINDOW.dark : LIGHTNESS_WINDOW.light
	const [chromaLow, chromaHigh] = quadrant.endsWith("neutral") ? CHROMA_WINDOW.neutral : CHROMA_WINDOW.saturated
	const c = chroma(lab)
	return lab[0] >= lightLow && lab[0] < lightHigh && c >= chromaLow && c < chromaHigh
}

/** Rejection-sample an 8-bit colour whose OKLab coordinates land inside a quadrant's window. */
function sampleBase(random: () => number, quadrant: Quadrant): Rgb8 {
	for (let attempt = 0; attempt < 200_000; attempt++) {
		const rgb: Rgb8 = [
			Math.floor(random() * 256),
			Math.floor(random() * 256),
			Math.floor(random() * 256),
		]
		if (inWindow(rgbToOkLab(rgb), quadrant)) return rgb
	}
	throw new Error(`Could not sample a base colour for ${quadrant}`)
}

function randomDirection(random: () => number): OkLab {
	for (;;) {
		const raw = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]
		const norm = Math.hypot(raw[0], raw[1], raw[2])
		if (norm > 1e-6) return [raw[0] / norm, raw[1] / norm, raw[2] / norm]
	}
}

function sameRgb(first: Rgb8, second: Rgb8): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

/**
 * The 8-bit colour along `direction` from `base` whose *actual* distance best matches `target`.
 *
 * Sweeping and then re-measuring matters: the pair is shown as 8-bit sRGB, and rounding to the grid
 * moves the distance. What the fixture records — and what the analysis fits — is always the
 * re-measured distance between the two integers actually displayed, never the target.
 */
function bestStep(baseLab: OkLab, direction: OkLab, target: number, quadrant: Quadrant | null): Rgb8 | null {
	let best: Rgb8 | null = null
	let bestError = Infinity
	const steps = 240
	for (let index = 1; index <= steps; index++) {
		const length = (target * 3 * index) / steps
		const candidate = okLabToRgb([
			baseLab[0] + direction[0] * length,
			baseLab[1] + direction[1] * length,
			baseLab[2] + direction[2] * length,
		])
		const candidateLab = rgbToOkLab(candidate)
		if (quadrant !== null && !inWindow(candidateLab, quadrant)) continue
		const actual = okLabDistance(baseLab, candidateLab)
		if (actual === 0) continue
		const error = Math.abs(actual - target)
		if (error < bestError) {
			bestError = error
			best = candidate
		}
	}
	return best
}

function truthFor(first: Rgb8, second: Rgb8, targetDistance: number | null): BracketingItem["truth"] {
	const firstLab = rgbToOkLab(first)
	const secondLab = rgbToOkLab(second)
	return {
		targetDistance,
		okLabDistance: okLabDistance(firstLab, secondLab),
		chromaDistance: Math.hypot(firstLab[1] - secondLab[1], firstLab[2] - secondLab[2]),
		// Part 2 shows the accent *on* the field, so the accent is the "text" argument.
		apcaRaw: apcaRaw(second, first),
		apcaLc: apcaLc(second, first),
		deltaApcaY: Math.abs(rgbToApcaY(first) - rgbToApcaY(second)),
		identical: sameRgb(first, second),
	}
}

function makeItem(
	itemId: string,
	part: BracketingPart,
	stratum: string,
	first: Rgb8,
	second: Rgb8,
	targetDistance: number | null,
	role: BracketingItem["role"],
	repeatOf: string | null = null,
	/** Round 2's extra facts. Left undefined on round 1, so its serialized fixture is unchanged. */
	extra?: Partial<Pick<BracketingItem, "hueThird" | "direction" | "decomposition">>,
): BracketingItem {
	return {
		itemId,
		part,
		stratum,
		first,
		second,
		firstHex: rgbToHex(first),
		secondHex: rgbToHex(second),
		truth: truthFor(first, second, targetDistance),
		role,
		repeatOf,
		...(extra ?? {}),
	}
}

/** Log-spaced ladder, endpoints inclusive. */
export function logLadder(low: number, high: number, steps: number): number[] {
	if (steps < 2) throw new RangeError("a ladder needs at least two steps")
	const ratio = Math.log(high / low) / (steps - 1)
	return Array.from({ length: steps }, (_, index) => low * Math.exp(ratio * index))
}

/* ------------------------------------------------------------------------------------------- */
/* Part 1 — the same-colour ruler                                                                */
/* ------------------------------------------------------------------------------------------- */

function generatePart1(random: () => number): BracketingItem[] {
	const items: BracketingItem[] = []
	const ladder = logLadder(PART1_DISTANCE_MIN, PART1_DISTANCE_MAX, PART1_LADDER_STEPS)

	for (const quadrant of QUADRANTS) {
		const ladderItems: BracketingItem[] = []
		for (const [rung, target] of ladder.entries()) {
			let chosen: { first: Rgb8; second: Rgb8 } | null = null
			let fallback: { first: Rgb8; second: Rgb8; error: number } | null = null
			for (let attempt = 0; attempt < 400 && chosen === null; attempt++) {
				const first = sampleBase(random, quadrant)
				const firstLab = rgbToOkLab(first)
				const second = bestStep(firstLab, randomDirection(random), target, quadrant)
				if (second === null || sameRgb(first, second)) continue
				const actual = okLabDistance(firstLab, rgbToOkLab(second))
				const error = Math.abs(actual - target) / target
				if (error <= TARGET_TOLERANCE) chosen = { first, second }
				else if (fallback === null || error < fallback.error) fallback = { first, second, error }
			}
			// Below about 0.005 the 8-bit grid itself is the limit in the dark quadrants: one channel
			// step at grey 8 is already 0.0054. When no draw lands inside tolerance the closest
			// achievable pair is kept, and the recorded distance is the achieved one — the ladder is a
			// sampling plan, not a claim about what was shown.
			const pair = chosen ?? fallback
			if (pair === null) throw new Error(`Could not build a ${quadrant} pair near ${target}`)
			ladderItems.push(
				makeItem(`p1-${quadrant}-${String(rung).padStart(2, "0")}`, "same-color", quadrant, pair.first, pair.second, target, "ladder"),
			)
		}
		items.push(...ladderItems)

		for (let index = 0; index < PART1_CONTROLS_PER_QUADRANT; index++) {
			const color = sampleBase(random, quadrant)
			items.push(makeItem(`p1-${quadrant}-control-${index}`, "same-color", quadrant, color, color, 0, "control-identical"))
		}

		// Repeats come from the rungs nearest the prior, where the answer is genuinely uncertain.
		const byNearness = [...ladderItems].sort(
			(a, b) => Math.abs(Math.log(a.truth.okLabDistance / BRACKETING_PRIOR_SAME_COLOR_BAR)) - Math.abs(Math.log(b.truth.okLabDistance / BRACKETING_PRIOR_SAME_COLOR_BAR)),
		)
		for (let index = 0; index < PART1_REPEATS_PER_QUADRANT; index++) {
			const source = byNearness[index]
			items.push(
				makeItem(
					`p1-${quadrant}-repeat-${index}`,
					"same-color",
					quadrant,
					source.first,
					source.second,
					source.truth.targetDistance,
					"repeat",
					source.itemId,
				),
			)
		}
	}
	return items
}

/* ------------------------------------------------------------------------------------------- */
/* Round 2 — adaptive ladders, the hue split, and the direction probe                            */
/* ------------------------------------------------------------------------------------------- */

/** OKLab hue angle in degrees, [0, 360). */
export function hueDegrees(lab: OkLab): number {
	const angle = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
	return angle < 0 ? angle + 360 : angle
}

/** Which third of the hue circle an angle falls in, by `HUE_THIRD_BOUNDARIES_DEGREES`. */
export function hueThirdOf(lab: OkLab): number {
	const degrees = hueDegrees(lab)
	for (let index = HUE_THIRD_BOUNDARIES_DEGREES.length - 1; index >= 0; index--) {
		if (degrees >= HUE_THIRD_BOUNDARIES_DEGREES[index]) return index
	}
	return 0
}

/** Signed hue difference in degrees, wrapped to (-180, 180]. */
function hueDelta(from: number, to: number): number {
	let delta = to - from
	while (delta > 180) delta -= 360
	while (delta <= -180) delta += 360
	return delta
}

/**
 * Split an achieved difference into lightness, chroma and hue parts.
 *
 * The hue part is reported twice: as the rotation in degrees, and as `arc` — the chord that rotation
 * subtends at the pair's mean chroma. Only `arc` is comparable with the other two, because a 20°
 * rotation is a large difference at high chroma and no difference at all at zero chroma.
 */
export function decompose(first: Rgb8, second: Rgb8, intended: DirectionKind): Decomposition {
	const firstLab = rgbToOkLab(first)
	const secondLab = rgbToOkLab(second)
	const firstChroma = chroma(firstLab)
	const secondChroma = chroma(secondLab)
	const deltaHueDegrees = hueDelta(hueDegrees(firstLab), hueDegrees(secondLab))
	const meanChroma = (firstChroma + secondChroma) / 2
	const arc = 2 * meanChroma * Math.sin(Math.abs((deltaHueDegrees * Math.PI) / 180) / 2)
	const parts: Record<DirectionKind, number> = {
		lightness: secondLab[0] - firstLab[0],
		chroma: secondChroma - firstChroma,
		hue: arc,
	}
	const total = parts.lightness ** 2 + parts.chroma ** 2 + parts.hue ** 2
	let dominant: DirectionKind = "lightness"
	for (const kind of DIRECTION_KINDS) if (Math.abs(parts[kind]) > Math.abs(parts[dominant])) dominant = kind
	return {
		deltaL: parts.lightness,
		deltaChroma: parts.chroma,
		deltaHueDegrees,
		arc,
		dominant,
		purity: total === 0 ? 0 : parts[intended] ** 2 / total,
	}
}

/**
 * The 8-bit colour that differs from `base` along exactly one cylindrical axis, as close to `target`
 * as the grid allows.
 *
 * Built axis by axis rather than with a direction vector, so the intended axis is exact before
 * rounding: a lightness step keeps a and b, a chroma step keeps the hue angle, and a hue step keeps
 * the chroma by moving along the circle. Both signs are swept, because at the edge of a quadrant's
 * window only one of them has anywhere to go.
 */
function bestAlongAxis(baseLab: OkLab, kind: DirectionKind, target: number, quadrant: Quadrant): Rgb8 | null {
	const baseChroma = chroma(baseLab)
	const baseHue = (hueDegrees(baseLab) * Math.PI) / 180
	let best: Rgb8 | null = null
	let bestError = Infinity
	const steps = 400
	for (const sign of [1, -1]) {
		for (let index = 1; index <= steps; index++) {
			const amount = (target * 3 * index * sign) / steps
			let candidateLab: OkLab
			if (kind === "lightness") {
				candidateLab = [baseLab[0] + amount, baseLab[1], baseLab[2]]
			} else if (kind === "chroma") {
				const nextChroma = baseChroma + amount
				if (nextChroma < 0) continue
				candidateLab = [baseLab[0], Math.cos(baseHue) * nextChroma, Math.sin(baseHue) * nextChroma]
			} else {
				// Chord = 2·C·sin(Δ/2); solve for the rotation that subtends the requested amount.
				const ratio = Math.abs(amount) / (2 * baseChroma)
				if (ratio > 1) continue
				const rotation = 2 * Math.asin(ratio) * Math.sign(amount)
				candidateLab = [
					baseLab[0],
					Math.cos(baseHue + rotation) * baseChroma,
					Math.sin(baseHue + rotation) * baseChroma,
				]
			}
			const candidate = okLabToRgb(candidateLab)
			const achievedLab = rgbToOkLab(candidate)
			if (!inWindow(achievedLab, quadrant)) continue
			const achieved = okLabDistance(baseLab, achievedLab)
			if (achieved === 0) continue
			const error = Math.abs(achieved - target)
			if (error < bestError) {
				bestError = error
				best = candidate
			}
		}
	}
	return best
}

/** Rejection-sample a base inside a quadrant, with extra constraints for round 2's sub-strata. */
function sampleBaseWhere(
	random: () => number,
	quadrant: Quadrant,
	accept: (lab: OkLab) => boolean,
	what: string,
): Rgb8 {
	for (let attempt = 0; attempt < 400_000; attempt++) {
		const rgb: Rgb8 = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)]
		const lab = rgbToOkLab(rgb)
		if (inWindow(lab, quadrant) && accept(lab)) return rgb
	}
	throw new Error(`Could not sample a base colour for ${what}`)
}

/**
 * What the 8-bit grid can express in a quadrant: the distance to the nearest single-channel
 * neighbour, over sampled bases.
 *
 * Round 1's hard-won lesson was that below about 0.005 the grid, not the eye, is the limit. Round 2
 * places dark-neutral rungs from 0.00575 upward, which is only a few grid steps, so the floor is
 * measured and recorded rather than assumed: a rung near it is quantised by roughly half the floor,
 * and the achieved distance — always the recorded one — is what the analysis fits.
 */
export function expressibilityFloor(
	random: () => number,
	quadrant: Quadrant,
	samples = EXPRESSIBILITY_SAMPLES,
): { p10: number; median: number; p90: number } {
	const floors: number[] = []
	while (floors.length < samples) {
		const rgb = sampleBaseWhere(random, quadrant, () => true, quadrant)
		const lab = rgbToOkLab(rgb)
		let nearest = Infinity
		for (let channel = 0; channel < 3; channel++) {
			for (const step of [-1, 1]) {
				const neighbour: [number, number, number] = [rgb[0], rgb[1], rgb[2]]
				neighbour[channel] += step
				if (neighbour[channel] < 0 || neighbour[channel] > 255) continue
				nearest = Math.min(nearest, okLabDistance(lab, rgbToOkLab(neighbour)))
			}
		}
		floors.push(nearest)
	}
	floors.sort((a, b) => a - b)
	const at = (fraction: number) => Number(floors[Math.floor(fraction * (floors.length - 1))].toFixed(6))
	return { p10: at(0.1), median: at(0.5), p90: at(0.9) }
}

/** One ladder rung: a pair at `target`, drawn under whatever extra constraint the stratum needs. */
function drawRung(
	random: () => number,
	quadrant: Quadrant,
	target: number,
	accept: (firstLab: OkLab, secondLab: OkLab) => boolean,
	what: string,
): { first: Rgb8; second: Rgb8 } {
	let fallback: { first: Rgb8; second: Rgb8; error: number } | null = null
	for (let attempt = 0; attempt < 3_000; attempt++) {
		const first = sampleBaseWhere(random, quadrant, (lab) => accept(lab, lab), what)
		const firstLab = rgbToOkLab(first)
		const second = bestStep(firstLab, randomDirection(random), target, quadrant)
		if (second === null || sameRgb(first, second)) continue
		const secondLab = rgbToOkLab(second)
		if (!accept(firstLab, secondLab)) continue
		const error = Math.abs(okLabDistance(firstLab, secondLab) - target) / target
		if (error <= TARGET_TOLERANCE) return { first, second }
		if (fallback === null || error < fallback.error) fallback = { first, second, error }
	}
	// The 8-bit grid, not the sampler, is the binding constraint at the bottom of the dark ladders.
	// The closest achievable pair is kept and its achieved distance is what gets recorded.
	if (fallback === null) throw new Error(`Could not build a ${what} pair near ${target}`)
	return { first: fallback.first, second: fallback.second }
}

function generateRound2Part1(random: () => number): BracketingItem[] {
	const items: BracketingItem[] = []

	for (const quadrant of QUADRANTS) {
		const window = ROUND_1_INTERVALS[quadrant]
		const ladderItems: BracketingItem[] = []

		if (quadrant === "light-saturated") {
			// Three hue thirds, each with its own ladder over the same interval. Both colours of a pair
			// must sit in the same third, or the pair does not belong to one of them.
			for (let third = 0; third < HUE_THIRD_BOUNDARIES_DEGREES.length; third++) {
				const ladder = logLadder(window.low, window.high, ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD)
				for (const [rung, target] of ladder.entries()) {
					const pair = drawRung(
						random,
						quadrant,
						target,
						(firstLab, secondLab) => hueThirdOf(firstLab) === third && hueThirdOf(secondLab) === third,
						`${quadrant} hue third ${third}`,
					)
					ladderItems.push(
						makeItem(
							`r2-${quadrant}-h${third}-${String(rung).padStart(2, "0")}`,
							"same-color",
							quadrant,
							pair.first,
							pair.second,
							target,
							"ladder",
							null,
							{ hueThird: third, decomposition: decompose(pair.first, pair.second, "lightness") },
						),
					)
				}
			}
		} else {
			const ladder = logLadder(window.low, window.high, ROUND2_LADDER_STEPS)
			for (const [rung, target] of ladder.entries()) {
				const pair = drawRung(random, quadrant, target, () => true, quadrant)
				ladderItems.push(
					makeItem(
						`r2-${quadrant}-${String(rung).padStart(2, "0")}`,
						"same-color",
						quadrant,
						pair.first,
						pair.second,
						target,
						"ladder",
						null,
						{ decomposition: decompose(pair.first, pair.second, "lightness") },
					),
				)
			}
		}
		items.push(...ladderItems)

		for (let index = 0; index < ROUND2_CONTROLS_PER_QUADRANT; index++) {
			const color = sampleBaseWhere(random, quadrant, () => true, quadrant)
			items.push(makeItem(`r2-${quadrant}-control-${index}`, "same-color", quadrant, color, color, 0, "control-identical"))
		}

		// Repeats sit nearest this quadrant's round-1 threshold, where the answer is least certain. In
		// light-saturated they are spread one per hue third first, so the noise estimate is not all
		// drawn from one hue.
		const nearness = (item: BracketingItem) => Math.abs(Math.log(item.truth.okLabDistance / window.threshold))
		const byNearness = [...ladderItems].sort((a, b) => nearness(a) - nearness(b))
		const chosen: BracketingItem[] = []
		for (let third = 0; third < HUE_THIRD_BOUNDARIES_DEGREES.length && quadrant === "light-saturated"; third++) {
			const best = byNearness.find((item) => item.hueThird === third)
			if (best !== undefined) chosen.push(best)
		}
		for (const item of byNearness) {
			if (chosen.length >= ROUND2_REPEATS_PER_QUADRANT) break
			if (!chosen.includes(item)) chosen.push(item)
		}
		for (const [index, source] of chosen.entries()) {
			items.push(
				makeItem(
					`r2-${quadrant}-repeat-${index}`,
					"same-color",
					quadrant,
					source.first,
					source.second,
					source.truth.targetDistance,
					"repeat",
					source.itemId,
					source.hueThird === undefined ? undefined : { hueThird: source.hueThird },
				),
			)
		}
	}

	// The direction probe: one pair per (direction × quadrant), all at the same distance.
	for (const kind of DIRECTION_KINDS) {
		for (const quadrant of QUADRANTS) {
			let chosen: { first: Rgb8; second: Rgb8 } | null = null
			let fallback: { first: Rgb8; second: Rgb8; error: number } | null = null
			for (let attempt = 0; attempt < 3_000 && chosen === null; attempt++) {
				const first = sampleBaseWhere(
					random,
					quadrant,
					(lab) => chroma(lab) >= ROUND2_PROBE_BASE_MIN_CHROMA,
					`${quadrant} ${kind} probe`,
				)
				const firstLab = rgbToOkLab(first)
				const second = bestAlongAxis(firstLab, kind, ROUND2_DIRECTION_TARGET, quadrant)
				if (second === null || sameRgb(first, second)) continue
				const achieved = okLabDistance(firstLab, rgbToOkLab(second))
				const error = Math.abs(achieved - ROUND2_DIRECTION_TARGET) / ROUND2_DIRECTION_TARGET
				// A probe pair is only evidence about its axis if the rounding kept it on that axis.
				if (decompose(first, second, kind).purity < 0.7) continue
				if (error <= TARGET_TOLERANCE) chosen = { first, second }
				else if (fallback === null || error < fallback.error) fallback = { first, second, error }
			}
			const pair = chosen ?? fallback
			if (pair === null) throw new Error(`Could not build a ${kind} probe pair in ${quadrant}`)
			items.push(
				makeItem(
					`r2-probe-${kind}-${quadrant}`,
					"same-color",
					quadrant,
					pair.first,
					pair.second,
					ROUND2_DIRECTION_TARGET,
					"direction-probe",
					null,
					{ direction: kind, decomposition: decompose(pair.first, pair.second, kind) },
				),
			)
		}
	}
	return items
}

/**
 * Round 2: the same question, the same criterion, a budget spent where round 1 left the uncertainty.
 *
 * Part 2 (the equal-luminance accent) is **not** repeated. Round 1 answered it — a threshold with an
 * interval and both controls correct — and re-asking it would spend a fifth of the reviewer's time
 * re-measuring something that is not what this round is about. Round 2 is part 1 only.
 */
export function generateBracketingRound2Fixture(
	batchId = BRACKETING_ROUND_2_BATCH_ID,
	seed = BRACKETING_ROUND_2_SEED,
): BracketingFixture {
	const random = mulberry32(seed)
	const items = generateRound2Part1(random)
	const floors = Object.fromEntries(QUADRANTS.map((quadrant) => [quadrant, expressibilityFloor(random, quadrant)]))
	const fixture: BracketingFixture = {
		fixtureVersion: BRACKETING_FIXTURE_VERSION,
		batchId,
		seed,
		generatedBy: "research/v3/src/review-server/bracketing.ts",
		criterion: BRACKETING_CRITERION,
		prompts: PART_PROMPTS,
		quadrantBoundaries: { lightness: QUADRANT_LIGHTNESS_BOUNDARY, chroma: QUADRANT_CHROMA_BOUNDARY },
		// Round 2's prior is round 1's answer, not the pre-round-1 translation.
		prior: { sameColorBar: POOLED_SAME_COLOR_BAR },
		items,
		serveOrder: shuffled(items.map((item) => item.itemId), random),
		refinement: {
			round: 2,
			refines: BRACKETING_ACTIVE_BATCH_ID,
			sourceAnalysis: "research/v3/data/calibration/bracketing-round-1-analysis.json",
			priorIntervals: ROUND_1_INTERVALS,
			ladder: {
				stepsPerQuadrant: ROUND2_LADDER_STEPS,
				lightSaturatedStepsPerThird: ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD,
			},
			hueSplit: {
				quadrant: "light-saturated",
				boundariesDegrees: [...HUE_THIRD_BOUNDARIES_DEGREES],
				labels: [
					"0–120°: pink-red, orange, yellow, yellow-green",
					"120–240°: green, cyan, blue",
					"240–360°: blue, violet, magenta, red",
				],
			},
			directionProbe: {
				targetDistance: ROUND2_DIRECTION_TARGET,
				kinds: [...DIRECTION_KINDS],
				pairsPerKind: ROUND2_PROBE_PAIRS_PER_DIRECTION,
				baseMinChroma: ROUND2_PROBE_BASE_MIN_CHROMA,
			},
			repeatsPerQuadrant: ROUND2_REPEATS_PER_QUADRANT,
			controlsPerQuadrant: ROUND2_CONTROLS_PER_QUADRANT,
			expressibilityFloor: floors,
		},
	}
	return fixture
}

export const BRACKETING_ROUND_2_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/bracketing-round-2.json", import.meta.url),
)

/* ------------------------------------------------------------------------------------------- */
/* Part 2 — accent at equal luminance                                                            */
/* ------------------------------------------------------------------------------------------- */

export const PART2_STRATUM = "accent-equal-luminance"

/**
 * Find an 8-bit colour at (as near as possible) the same APCA luminance as `field`, displaced by
 * `target` in the OKLab (a,b) plane.
 *
 * Lightness is solved for rather than chosen: moving in chroma alone changes Y, so L is bisected
 * until APCA's Y matches the field's. What survives the 8-bit rounding is measured, not assumed.
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
	// The rounded colour must still sit near the requested chroma displacement, and must not have
	// been gamut-clipped back onto the field.
	const bestLab = rgbToOkLab(best)
	const achieved = Math.hypot(bestLab[1] - fieldLab[1], bestLab[2] - fieldLab[2])
	if (achieved < target * (1 - TARGET_TOLERANCE) || achieved > target * (1 + TARGET_TOLERANCE)) return null
	if (Math.abs(apcaRaw(best, field)) > PART2_MAX_APCA_RAW) return null
	return best
}

function generatePart2(random: () => number): BracketingItem[] {
	const items: BracketingItem[] = []
	const ladder = logLadder(PART2_CHROMA_MIN, PART2_CHROMA_MAX, PART2_LADDER_STEPS)

	for (const [rung, target] of ladder.entries()) {
		let chosen: { field: Rgb8; accent: Rgb8 } | null = null
		for (let attempt = 0; attempt < 60_000 && chosen === null; attempt++) {
			// Mid-lightness, low-chroma fields leave the most room to displace the accent in chroma
			// while holding luminance — at the extremes the gamut simply has nowhere to go.
			const field: Rgb8 = [
				Math.floor(random() * 256),
				Math.floor(random() * 256),
				Math.floor(random() * 256),
			]
			const fieldLab = rgbToOkLab(field)
			if (fieldLab[0] < 0.35 || fieldLab[0] > 0.8) continue
			if (chroma(fieldLab) > 0.08) continue
			const accent = equalLuminanceAccent(field, target, random() * Math.PI * 2)
			if (accent !== null && !sameRgb(field, accent)) chosen = { field, accent }
		}
		if (chosen === null) throw new Error(`Could not build an equal-luminance pair near chroma ${target}`)
		items.push(
			makeItem(`p2-ladder-${String(rung).padStart(2, "0")}`, "accent-visible", PART2_STRATUM, chosen.field, chosen.accent, target, "ladder"),
		)
	}

	// Controls: one plainly visible pair (the answer must be yes) and one identical pair (must be no).
	const controlField: Rgb8 = [64, 66, 70]
	items.push(makeItem("p2-control-obvious", "accent-visible", PART2_STRATUM, controlField, [242, 240, 236], null, "control-obvious"))
	items.push(makeItem("p2-control-identical", "accent-visible", PART2_STRATUM, controlField, controlField, 0, "control-identical"))
	return items
}

/* ------------------------------------------------------------------------------------------- */
/* Fixture                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/** Fisher-Yates under the seeded PRNG. */
function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values]
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

export function generateBracketingFixture(batchId = "bracketing-round-1", seed = BRACKETING_SEED): BracketingFixture {
	const random = mulberry32(seed)
	const part1 = generatePart1(random)
	const part2 = generatePart2(random)
	const items = [...part1, ...part2]
	// By-question passes, not by-item forms (REVIEW_UI.md §6): all of part 1, then all of part 2,
	// each shuffled so neither the quadrant nor the ladder is walked in order.
	const serveOrder = [
		...shuffled(part1.map((item) => item.itemId), random),
		...shuffled(part2.map((item) => item.itemId), random),
	]
	return {
		fixtureVersion: BRACKETING_FIXTURE_VERSION,
		batchId,
		seed,
		generatedBy: "research/v3/src/review-server/bracketing.ts",
		criterion: BRACKETING_CRITERION,
		prompts: PART_PROMPTS,
		quadrantBoundaries: { lightness: QUADRANT_LIGHTNESS_BOUNDARY, chroma: QUADRANT_CHROMA_BOUNDARY },
		prior: { sameColorBar: BRACKETING_PRIOR_SAME_COLOR_BAR },
		items,
		serveOrder,
	}
}

export const BRACKETING_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/bracketing-round-1.json", import.meta.url),
)

export function serializeFixture(fixture: BracketingFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}

function reportRound1(fixture: BracketingFixture): void {
	const part1 = fixture.items.filter((item) => item.part === "same-color")
	const part2 = fixture.items.filter((item) => item.part === "accent-visible")
	process.stdout.write(`${fixture.items.length} items (${part1.length} same-colour, ${part2.length} accent)\n`)
	for (const quadrant of QUADRANTS) {
		const rungs = part1.filter((item) => item.stratum === quadrant && item.role === "ladder")
		const achieved = rungs.map((item) => item.truth.okLabDistance)
		process.stdout.write(
			`  ${quadrant.padEnd(16)} achieved ${Math.min(...achieved).toFixed(5)} … ${Math.max(...achieved).toFixed(5)}\n`,
		)
	}
	const raws = part2.filter((item) => item.role === "ladder").map((item) => Math.abs(item.truth.apcaRaw))
	process.stdout.write(`  accent |raw APCA| ≤ ${Math.max(...raws).toFixed(4)} (identical-colour ceiling ${PART2_MAX_APCA_RAW})\n`)
}

function reportRound2(fixture: BracketingFixture): void {
	const refinement = fixture.refinement!
	const byRole = new Map<string, number>()
	for (const item of fixture.items) byRole.set(item.role, (byRole.get(item.role) ?? 0) + 1)
	process.stdout.write(
		`${fixture.items.length} items — ` +
			[...byRole].map(([role, count]) => `${count} ${role}`).join(", ") +
			` (refines ${refinement.refines})\n`,
	)
	for (const quadrant of QUADRANTS) {
		const window = ROUND_1_INTERVALS[quadrant]
		const rungs = fixture.items.filter((item) => item.stratum === quadrant && item.role === "ladder")
		const achieved = rungs.map((item) => item.truth.okLabDistance)
		const floor = refinement.expressibilityFloor[quadrant]
		// How coarsely the grid resolves the smallest rung: a pair near the floor can only be placed
		// to about half a grid step, and that is a property of sRGB, not of the reviewer.
		const coarseness = floor.median / Math.min(...achieved)
		process.stdout.write(
			`  ${quadrant.padEnd(16)} window ${window.low.toFixed(5)}–${window.high.toFixed(5)} · ` +
				`achieved ${Math.min(...achieved).toFixed(5)}…${Math.max(...achieved).toFixed(5)} · ` +
				`${rungs.length} rungs · 8-bit floor ${floor.median.toFixed(5)} ` +
				`(${(coarseness * 100).toFixed(0)}% of the smallest rung)\n`,
		)
	}
	for (let third = 0; third < HUE_THIRD_BOUNDARIES_DEGREES.length; third++) {
		const inThird = fixture.items.filter((item) => item.hueThird === third && item.role === "ladder")
		process.stdout.write(`  hue third ${third} (${refinement.hueSplit.labels[third]}): ${inThird.length} rungs\n`)
	}
	for (const kind of DIRECTION_KINDS) {
		const probes = fixture.items.filter((item) => item.direction === kind)
		const distances = probes.map((item) => item.truth.okLabDistance)
		const purity = probes.map((item) => item.decomposition!.purity)
		process.stdout.write(
			`  probe ${kind.padEnd(10)} ${probes.length} pairs · achieved ` +
				`${Math.min(...distances).toFixed(5)}…${Math.max(...distances).toFixed(5)} · ` +
				`purity ≥ ${Math.min(...purity).toFixed(2)}\n`,
		)
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, round: { type: "string", default: "1" } },
		strict: true,
	})
	if (values.round !== "1" && values.round !== "2") throw new Error("--round must be 1 or 2")
	const round2 = values.round === "2"
	const fixture = round2 ? generateBracketingRound2Fixture() : generateBracketingFixture()
	if (round2) reportRound2(fixture)
	else reportRound1(fixture)
	if (values.write) {
		const path = round2 ? BRACKETING_ROUND_2_FIXTURE_PATH : BRACKETING_FIXTURE_PATH
		await writeFile(path, serializeFixture(fixture))
		process.stdout.write(`wrote ${path}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
