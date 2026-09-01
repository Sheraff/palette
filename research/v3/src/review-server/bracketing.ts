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
import {
	APCA_RAW_IDENTICAL_CEILING,
	POOLED_SAME_COLOR_BAR,
	SAME_COLOR_BAR_BY_REGION,
} from "../contract/constants.ts"
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

/**
 * Round 2's prior: round 1's own pooled threshold, 0.01582.
 *
 * `[MEASURED]` — the same file every other number here comes from,
 * `bracketing-round-1-analysis.json`, `part1.pooled.threshold`.
 *
 * **Frozen here, deliberately not imported from `../contract/constants.ts`.** The first version of
 * this constant read `POOLED_SAME_COLOR_BAR`, and that value moved (0.01582 → 0.01535) the same day,
 * because the contract re-derives its bars on its own schedule — which silently made the committed
 * fixture non-reproducible and turned a released round's design record into a moving number. A
 * fixture must be pinned to values that cannot change under it. This is the second time this file
 * has learned it; see `BRACKETING_PRIOR_SAME_COLOR_BAR`.
 */
export const ROUND2_PRIOR_SAME_COLOR_BAR = 0.01582

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

/**
 * Round 3's per-item record of *why this pair discriminates* — the straddle-rule arithmetic, frozen
 * onto the item at generation time so the scoring can never be re-derived under different bars.
 *
 * A pair straddles when its two colours fall in different regions, and then `sameColorBar()` has to
 * pick one bar from two. `Math.max` and the average of the two disagree on exactly one interval:
 * `avg < d < max`, where the larger bar still calls the pair "the same colour" and the average
 * already calls it distinct. `zone` says which side of that interval the *achieved* distance landed
 * on, and `discriminating` is true only in the middle.
 */
export type StraddleFacts = Readonly<{
	regionFirst: Quadrant
	regionSecond: Quadrant
	barFirst: number
	barSecond: number
	/** The two candidate rules, evaluated on this pair. `bandLow`/`bandHigh` are aliases with intent. */
	avgBar: number
	maxBar: number
	minBar: number
	bandLow: number
	bandHigh: number
	/** `(d − avg) / (max − avg)`. Inside the band this is in (0,1); controls sit outside it. */
	bandFraction: number
	zone: "below-avg" | "in-band" | "above-max"
	/** What each rule predicts for this pair: `true` = "the same colour". */
	predictsSameUnderMax: boolean
	predictsSameUnderAvg: boolean
	/** True exactly when the two rules disagree — the only items the primary analysis scores. */
	discriminating: boolean
}>

/**
 * Round 3's design record: the pre-registered scoring rule, carried in the fixture.
 *
 * It lives here for the same reason round 2's `refinement` does — a round that exists to decide
 * between two rules is only interpretable next to the rule that was fixed *before* the answers
 * arrived. The prose version, with the power analysis and the declared confounds, is
 * `research/v3/data/calibration/bracketing-round-3-preregistration.md`.
 */
export type StraddleDesign = Readonly<{
	round: number
	question: string
	preregistration: string
	/** The frozen regional bars this round's bands are built from, and where they came from. */
	bars: Readonly<Record<string, number>>
	barsSource: string
	/** Per region pair: the disagreement band, and how many items were allocated to it. */
	bands: readonly Readonly<{
		regions: readonly [Quadrant, Quadrant]
		avgBar: number
		maxBar: number
		width: number
		inBandItems: number
		/** Share of cross-region role pairs in the measured v2-3 corpus (see `corpusFrequency`). */
		corpusShare: number
	}>[]
	/** What the real corpus says about cross-region pairs — measured, not assumed. */
	corpusFrequency: Readonly<{
		source: readonly string[]
		palettes: number
		rolePairs: number
		crossRegionPairs: number
		crossRegionShare: number
		pairsInAnyDisagreementBand: number
		closestCrossRegionPair: number
		note: string
	}>
	/** The decision rule, fixed before any answer existed. Quoted, not paraphrased, in the analysis. */
	scoring: Readonly<{
		population: string
		prediction: string
		decisive: string
		decisiveAtDesignN: Readonly<{ n: number; favoursMax: number; favoursAverage: number }>
		unresolved: string
		anisotropyVeto: string
		validityGates: string
		sensitivity: string
		exploratory: string
		power: Readonly<Record<string, number>>
		powerNote: string
	}>
	directionClasses: readonly DirectionKind[]
	minimumDirectionPurity: number
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

	/* --- round 3 only. -------------------------------------------------------------------------- */

	/** Why this pair discriminates between the two straddle rules. Never served. */
	straddle?: StraddleFacts
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
	/** Round 3 only: the straddle question and its pre-registered scoring rule. */
	straddleDesign?: StraddleDesign
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
		prior: { sameColorBar: ROUND2_PRIOR_SAME_COLOR_BAR },
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
/* Round 3 — the straddle rule                                                                   */
/* ------------------------------------------------------------------------------------------- */

/**
 * Round 3 measures the one thing rounds 1 and 2 could not: **which bar applies when a pair's two
 * colours fall in different regions.**
 *
 * `sameColorBar()` takes `Math.max` of the two regional bars. The alternative is their average. The
 * choice has never been measured — 0 of the 140 pairs in rounds 1–2 straddle a boundary — and the
 * "measurably most stable" tie-break the docstring used to cite was found unreproducible, and
 * *reversed* on replication (`reviews/phase-0-adversarial/contract.md` finding 1). The reviewer's
 * ruling: test it, do not argue it.
 *
 * The design is pre-registered in full at
 * `research/v3/data/calibration/bracketing-round-3-preregistration.md`, written before this code
 * was. The one-line version: only pairs whose achieved distance lands strictly between the two bars'
 * average and their maximum discriminate, because only there do the two rules give different
 * verdicts — `max` says "the same colour", the average says "distinct". Everything else in the round
 * is a control.
 */
export const BRACKETING_ROUND_3_BATCH_ID = "bracketing-round-3"

/** Round 3's seed. Distinct from rounds 1 and 2 so no stimulus is accidentally shared. */
export const BRACKETING_ROUND_3_SEED = 20260804

/**
 * The six ordered region pairs, most-frequent first.
 *
 * The order is the measured one: over 554 real v2-3 palettes (`data/legacy/{endorsements,
 * acceptable,known-bad}.json`), 2,582 of 3,309 role pairs are cross-region, and these are their
 * shares. All six occur between 10.5% and 22.0%, so none can be dropped as negligible — the top
 * three simply get two extra items each.
 */
export const ROUND3_REGION_PAIRS: readonly (readonly [Quadrant, Quadrant])[] = [
	["dark-neutral", "light-neutral"],
	["dark-neutral", "light-saturated"],
	["light-neutral", "light-saturated"],
	["dark-saturated", "light-saturated"],
	["dark-saturated", "light-neutral"],
	["dark-neutral", "dark-saturated"],
]

/** Measured share of cross-region role pairs, keyed `a|b`. See `ROUND3_REGION_PAIRS`. */
export const ROUND3_CORPUS_SHARE: Readonly<Record<string, number>> = {
	"dark-neutral|light-neutral": 0.2196,
	"dark-neutral|light-saturated": 0.1940,
	"light-neutral|light-saturated": 0.1886,
	"dark-saturated|light-saturated": 0.1600,
	"dark-saturated|light-neutral": 0.1332,
	"dark-neutral|dark-saturated": 0.1046,
}

/**
 * Where inside the disagreement band the rungs go, as a fraction of `(max − avg)`.
 *
 * The three highest-frequency pairs get four positions, the rest three: 4·3 + 3·3 = 21 cells, each
 * built twice (once per direction) for **42 discriminating items**. Positions stay clear of the band
 * edges because the edges are exactly where the two rules stop disagreeing.
 */
export const ROUND3_BAND_FRACTIONS_WIDE = [0.2, 0.4, 0.6, 0.8] as const
export const ROUND3_BAND_FRACTIONS_NARROW = [0.2, 0.5, 0.8] as const

/** How many of the six pairs get the wider ladder. */
export const ROUND3_WIDE_LADDER_PAIRS = 3

/**
 * Band fractions for the two band controls, which sit *outside* the band on either side.
 *
 * Both rules agree on these, so they score nothing. They exist to check that the bands are where
 * rounds 1–2 put them: if the reviewer calls a below-band pair distinct, the band's floor is wrong
 * and the straddle verdict computed against it is not interpretable.
 */
export const ROUND3_BELOW_BAND_FRACTION = -0.6
export const ROUND3_ABOVE_BAND_FRACTION = 1.6

/** Clearly-distinct attention checks, as a multiple of the pair's `max` bar. */
export const ROUND3_OBVIOUS_BAR_MULTIPLE = 4

/**
 * The two direction classes every band cell is built in, and the purity each must reach.
 *
 * This is the round's main confound control. Crossing the lightness boundary forces `ΔL ≠ 0` and
 * crossing the chroma boundary forces `ΔC ≠ 0`, so the region pair partly dictates the direction of
 * the difference — and round 2's direction probe found OKLab distance to be anisotropic under this
 * criterion (at a fixed 0.01500: lightness-only called "same" 4/4, chroma-only 2/4, hue-only 1/4).
 * Without this control a pure direction effect could masquerade as a verdict on the straddle rule.
 * Hue is not used as a third class here: a hue rotation changes neither L nor C, so it cannot cross
 * either boundary on its own and cannot produce a straddling pair.
 */
export const ROUND3_DIRECTIONS = ["lightness", "chroma"] as const
export const ROUND3_MIN_DIRECTION_PURITY = 0.7

export const ROUND3_IDENTICAL_CONTROLS = 3
export const ROUND3_OBVIOUS_CONTROLS = 3
export const ROUND3_BAND_CONTROLS_PER_SIDE = 2
export const ROUND3_REPEATS = 6

/** Minimum number of served positions between a repeat and the item it duplicates. */
export const ROUND3_MIN_REPEAT_SEPARATION = 12

const ROUND3_PREREGISTRATION_PATH = "research/v3/data/calibration/bracketing-round-3-preregistration.md"

/** The bar this round's bands are built from, for one region. */
function barFor(quadrant: Quadrant): number {
	return SAME_COLOR_BAR_BY_REGION[quadrant]
}

/** The disagreement band for a region pair: `(avg, max)` of the two regional bars. */
export function straddleBand(first: Quadrant, second: Quadrant): { avg: number; max: number; min: number } {
	const a = barFor(first)
	const b = barFor(second)
	return { avg: (a + b) / 2, max: Math.max(a, b), min: Math.min(a, b) }
}

/** The straddle facts for an achieved pair — the arithmetic that decides what, if anything, it tests. */
export function straddleFactsFor(first: Rgb8, second: Rgb8): StraddleFacts {
	const regionFirst = quadrantOf(rgbToOkLab(first))
	const regionSecond = quadrantOf(rgbToOkLab(second))
	const { avg, max, min } = straddleBand(regionFirst, regionSecond)
	const distance = okLabDistance(rgbToOkLab(first), rgbToOkLab(second))
	const predictsSameUnderMax = distance < max
	const predictsSameUnderAvg = distance < avg
	const zone = distance <= avg ? "below-avg" : distance >= max ? "above-max" : "in-band"
	return {
		regionFirst,
		regionSecond,
		barFirst: barFor(regionFirst),
		barSecond: barFor(regionSecond),
		avgBar: avg,
		maxBar: max,
		minBar: min,
		bandLow: avg,
		bandHigh: max,
		// Degenerate only when both colours share a region, which round 3 never builds on purpose.
		bandFraction: max === avg ? 0 : (distance - avg) / (max - avg),
		zone,
		predictsSameUnderMax,
		predictsSameUnderAvg,
		discriminating: predictsSameUnderMax !== predictsSameUnderAvg,
	}
}

/**
 * Find an 8-bit pair that straddles the `first`/`second` region boundary at a chosen distance.
 *
 * Two things make this different from `bestStep`, which round 1 uses. First, the pair must land in
 * *two different* quadrants, so the base colour has to hug every boundary the pair crosses — that is
 * structural, not a sampling choice: if two colours are `d` apart and a boundary separates them,
 * both are within `d` of it. Second, on the axes the pair does **not** cross, the base roams the
 * region's full window rather than clustering at the boundary, so e.g. a dark-neutral × dark-saturated
 * pair can sit at L ≈ 0.25 rather than only at L ≈ 0.55.
 *
 * The partner is built in cylindrical coordinates with the hue held fixed, so the difference splits
 * between lightness and chroma only and `decompose`'s purity means what the design intends. The
 * search then re-measures on the 8-bit grid and keeps the best candidate: what is recorded is always
 * the achieved distance between the two integers displayed, never the target.
 */
function findStraddlePair(
	random: () => number,
	first: Quadrant,
	second: Quadrant,
	target: number,
	direction: (typeof ROUND3_DIRECTIONS)[number],
	tolerance: number,
	band: { low: number; high: number } | null,
	hueThird: number | null,
	attempts = 400_000,
): { first: Rgb8; second: Rgb8 } | null {
	const crossesLightness = first.startsWith("dark") !== second.startsWith("dark")
	const crossesChroma = first.endsWith("neutral") !== second.endsWith("neutral")
	const [darkLow, darkHigh] = LIGHTNESS_WINDOW.dark
	const [lightLow, lightHigh] = LIGHTNESS_WINDOW.light
	const [saturatedLow, saturatedHigh] = CHROMA_WINDOW.saturated
	// Keep the base this far inside a window it must not leave, so its partner cannot fall out.
	const margin = target + 0.002
	let best: { first: Rgb8; second: Rgb8 } | null = null
	let bestError = Infinity

	for (let attempt = 0; attempt < attempts; attempt++) {
		// --- the base colour ------------------------------------------------------------------
		const dark = first.startsWith("dark")
		const neutral = first.endsWith("neutral")
		const lightness = crossesLightness
			? QUADRANT_LIGHTNESS_BOUNDARY + (dark ? -1 : 1) * (0.0004 + random() * target)
			: dark
				? darkLow + margin + random() * (QUADRANT_LIGHTNESS_BOUNDARY - margin - darkLow - margin)
				: lightLow + margin + random() * (lightHigh - margin - lightLow - margin)
		const chromaValue = crossesChroma
			? QUADRANT_CHROMA_BOUNDARY + (neutral ? -1 : 1) * (0.0004 + random() * target)
			: neutral
				? random() * (QUADRANT_CHROMA_BOUNDARY - margin)
				: saturatedLow + margin + random() * (saturatedHigh - margin - saturatedLow - margin)
		const hue = random() * 2 * Math.PI
		const baseRgb = okLabToRgb([lightness, chromaValue * Math.cos(hue), chromaValue * Math.sin(hue)])
		const baseLab = rgbToOkLab(baseRgb)
		if (quadrantOf(baseLab) !== first || !inWindow(baseLab, first)) continue
		if (hueThird !== null && chroma(baseLab) >= QUADRANT_CHROMA_BOUNDARY && hueThirdOf(baseLab) !== hueThird) continue

		// --- the partner, hue held fixed --------------------------------------------------------
		// The dominant component carries `share` of the squared distance; the other carries the rest.
		const share = 0.78 + random() * 0.2
		const lightnessStep = target * Math.sqrt(direction === "lightness" ? share : 1 - share)
		const chromaStep = target * Math.sqrt(direction === "lightness" ? 1 - share : share)
		// A crossed axis must point across its boundary; a free axis may go either way.
		const lightnessSign = crossesLightness ? (second.startsWith("dark") ? -1 : 1) : random() < 0.5 ? -1 : 1
		const chromaSign = crossesChroma ? (second.endsWith("neutral") ? -1 : 1) : random() < 0.5 ? -1 : 1
		const baseChroma = chroma(baseLab)
		const baseHue = Math.atan2(baseLab[2], baseLab[1])
		const partnerChroma = Math.max(0, baseChroma + chromaSign * chromaStep)
		const seedRgb = okLabToRgb([
			baseLab[0] + lightnessSign * lightnessStep,
			partnerChroma * Math.cos(baseHue),
			partnerChroma * Math.sin(baseHue),
		])

		// --- refine on the 8-bit grid -----------------------------------------------------------
		for (let red = -3; red <= 3; red++) {
			for (let green = -3; green <= 3; green++) {
				for (let blue = -3; blue <= 3; blue++) {
					const candidate: Rgb8 = [
						Math.min(255, Math.max(0, seedRgb[0] + red)),
						Math.min(255, Math.max(0, seedRgb[1] + green)),
						Math.min(255, Math.max(0, seedRgb[2] + blue)),
					]
					const candidateLab = rgbToOkLab(candidate)
					if (quadrantOf(candidateLab) !== second || !inWindow(candidateLab, second)) continue
					const achieved = okLabDistance(baseLab, candidateLab)
					if (band !== null && (achieved <= band.low || achieved >= band.high)) continue
					const error = Math.abs(achieved - target)
					if (error > tolerance || error >= bestError) continue
					if (decompose(baseRgb, candidate, direction).purity < ROUND3_MIN_DIRECTION_PURITY) continue
					if (
						hueThird !== null &&
						chroma(candidateLab) >= QUADRANT_CHROMA_BOUNDARY &&
						hueThirdOf(candidateLab) !== hueThird
					) {
						continue
					}
					bestError = error
					best = { first: baseRgb, second: candidate }
					if (bestError < tolerance * 0.03) return best
				}
			}
		}
	}
	return best
}

/**
 * A cross-region pair at a frankly large distance, for the clearly-distinct attention checks.
 *
 * These cannot use `findStraddlePair`: that function builds a pair along one dominant axis inside a
 * boundary-hugging window, and at four times a regional bar there is often no such pair at all — a
 * chroma-dominant difference of 0.065 between two *neutral* regions would need a chroma change of
 * 0.054, and the neutral window is only 0.05 wide. An attention check has no direction requirement
 * anyway; it only has to be obviously two colours. So both members are sampled independently in
 * their own regions and the closest achieved distance to the target is kept.
 */
function findObviousPair(
	random: () => number,
	first: Quadrant,
	second: Quadrant,
	target: number,
	attempts = 40_000,
): { first: Rgb8; second: Rgb8 } | null {
	let best: { first: Rgb8; second: Rgb8 } | null = null
	let bestError = Infinity
	for (let attempt = 0; attempt < attempts; attempt++) {
		const a = sampleBase(random, first)
		const b = sampleBase(random, second)
		const error = Math.abs(okLabDistance(rgbToOkLab(a), rgbToOkLab(b)) - target)
		if (error < bestError) {
			bestError = error
			best = { first: a, second: b }
			if (bestError < target * 0.01) return best
		}
	}
	return best
}

/** Build one round-3 item, attaching the straddle arithmetic measured on the achieved pair. */
function makeStraddleItem(
	itemId: string,
	first: Rgb8,
	second: Rgb8,
	targetDistance: number | null,
	role: BracketingItem["role"],
	direction: (typeof ROUND3_DIRECTIONS)[number] | null,
	repeatOf: string | null = null,
): BracketingItem {
	const straddle = straddleFactsFor(first, second)
	const stratum =
		straddle.regionFirst === straddle.regionSecond
			? straddle.regionFirst
			: `straddle-${[straddle.regionFirst, straddle.regionSecond].slice().sort().join("+")}`
	const lab = rgbToOkLab(first)
	const partnerLab = rgbToOkLab(second)
	const saturated = chroma(lab) >= QUADRANT_CHROMA_BOUNDARY ? lab : chroma(partnerLab) >= QUADRANT_CHROMA_BOUNDARY ? partnerLab : null
	return makeItem(itemId, "same-color", stratum, first, second, targetDistance, role, repeatOf, {
		...(saturated === null ? {} : { hueThird: hueThirdOf(saturated) }),
		...(direction === null ? {} : { direction, decomposition: decompose(first, second, direction) }),
		straddle,
	})
}

function round3PairKey(pair: readonly [Quadrant, Quadrant]): string {
	return `${pair[0]}|${pair[1]}`
}

/** Short, stable id fragment for a region pair — first letters of each half. */
function round3PairSlug(pair: readonly [Quadrant, Quadrant]): string {
	const short = (quadrant: Quadrant) => quadrant.split("-").map((part) => part[0]).join("")
	return `${short(pair[0])}-${short(pair[1])}`
}

function generateRound3Items(random: () => number): BracketingItem[] {
	const items: BracketingItem[] = []

	// --- the 42 discriminating in-band items, plus the 4 band controls ------------------------
	ROUND3_REGION_PAIRS.forEach((pair, pairIndex) => {
		const [first, second] = pair
		const { avg, max } = straddleBand(first, second)
		const width = max - avg
		const wide = pairIndex < ROUND3_WIDE_LADDER_PAIRS
		const fractions = wide ? ROUND3_BAND_FRACTIONS_WIDE : ROUND3_BAND_FRACTIONS_NARROW
		const involvesLightSaturated = first === "light-saturated" || second === "light-saturated"
		const slug = round3PairSlug(pair)
		let cell = 0
		for (const fraction of fractions) {
			for (const direction of ROUND3_DIRECTIONS) {
				const target = avg + width * fraction
				// Light-saturated's bar is a known placeholder that varies 2.5× across hue thirds,
				// so its items are spread evenly over the three rather than left to the sampler.
				const hueThird = involvesLightSaturated ? cell % 3 : null
				const found = findStraddlePair(
					random,
					first,
					second,
					target,
					direction,
					Math.max(width * 0.06, 3e-5),
					{ low: avg, high: max },
					hueThird,
				)
				if (found === null) {
					throw new Error(`round 3: no in-band pair for ${first}×${second} ${direction} at ${target}`)
				}
				items.push(
					makeStraddleItem(
						`r3-${slug}-f${Math.round(fraction * 100)}-${direction}`,
						found.first,
						found.second,
						target,
						"ladder",
						direction,
					),
				)
				cell++
			}
		}
	})

	// Band controls: outside the band on either side, where the two rules agree. Placed on the two
	// widest bands, because a control needs room to sit clear of the edge it is testing.
	for (let index = 0; index < ROUND3_BAND_CONTROLS_PER_SIDE; index++) {
		for (const [label, fraction] of [
			["below", ROUND3_BELOW_BAND_FRACTION],
			["above", ROUND3_ABOVE_BAND_FRACTION],
		] as const) {
			const pair = ROUND3_REGION_PAIRS[index === 0 ? 1 : 3]
			const [first, second] = pair
			const { avg, max } = straddleBand(first, second)
			const width = max - avg
			const target = avg + width * fraction
			const direction = index === 0 ? "lightness" : "chroma"
			const found = findStraddlePair(random, first, second, target, direction, target * 0.06, null, null)
			if (found === null) throw new Error(`round 3: no ${label}-band control for ${first}×${second}`)
			items.push(
				makeStraddleItem(
					`r3-${round3PairSlug(pair)}-control-${label}-${index}`,
					found.first,
					found.second,
					target,
					"ladder",
					direction,
				),
			)
		}
	}

	// --- attention checks ---------------------------------------------------------------------
	// Identical pairs: a colour against itself, which must read as the same colour.
	for (let index = 0; index < ROUND3_IDENTICAL_CONTROLS; index++) {
		const quadrant = QUADRANTS[index]
		const base = sampleBase(random, quadrant)
		items.push(makeStraddleItem(`r3-control-identical-${index}`, base, base, 0, "control-identical", null))
	}

	// Clearly distinct: cross-region pairs at 4× the max bar — the distance range where real
	// cross-region role pairs actually live (the corpus minimum is 0.04664).
	for (let index = 0; index < ROUND3_OBVIOUS_CONTROLS; index++) {
		const pair = ROUND3_REGION_PAIRS[index]
		const [first, second] = pair
		const { max } = straddleBand(first, second)
		const target = max * ROUND3_OBVIOUS_BAR_MULTIPLE
		const found = findObviousPair(random, first, second, target)
		if (found === null) throw new Error(`round 3: no obvious control for ${first}×${second}`)
		items.push(
			makeStraddleItem(`r3-control-obvious-${index}`, found.first, found.second, target, "control-obvious", null),
		)
	}

	// --- silent repeats -------------------------------------------------------------------------
	// Byte-identical duplicates of in-band items, spread across region pairs. They measure the
	// reviewer's own repeatability on *this* band; the pre-registered scoring does not count them as
	// independent trials (rounds 1–2 did, and finding 8 is about exactly that).
	const inBand = items.filter((item) => item.role === "ladder" && item.straddle?.zone === "in-band")
	const step = Math.floor(inBand.length / ROUND3_REPEATS)
	for (let index = 0; index < ROUND3_REPEATS; index++) {
		const source = inBand[index * step]
		items.push(
			makeStraddleItem(
				`r3-repeat-${index}`,
				source.first,
				source.second,
				source.truth.targetDistance,
				"repeat",
				(source.direction as (typeof ROUND3_DIRECTIONS)[number] | undefined) ?? null,
				source.itemId,
			),
		)
	}

	return items
}

/**
 * Serve order with the repeats pulled away from their originals.
 *
 * A repeat only measures repeatability if the reviewer cannot remember the first showing, so a
 * shuffle that happens to place a duplicate three items after its original is worthless. Reshuffles
 * (deterministically, from the same stream) until every repeat is at least
 * `ROUND3_MIN_REPEAT_SEPARATION` positions from its source, and keeps the best attempt otherwise.
 */
function round3ServeOrder(items: readonly BracketingItem[], random: () => number): string[] {
	const sourceOf = new Map(items.filter((item) => item.repeatOf !== null).map((item) => [item.itemId, item.repeatOf!]))
	let best: string[] = []
	let bestSeparation = -1
	for (let attempt = 0; attempt < 400; attempt++) {
		const order = shuffled(items.map((item) => item.itemId), random)
		const position = new Map(order.map((id, index) => [id, index]))
		let worst = Infinity
		for (const [repeat, source] of sourceOf) {
			worst = Math.min(worst, Math.abs(position.get(repeat)! - position.get(source)!))
		}
		if (worst > bestSeparation) {
			bestSeparation = worst
			best = order
		}
		if (bestSeparation >= ROUND3_MIN_REPEAT_SEPARATION) break
	}
	return best
}

export function generateBracketingRound3Fixture(
	batchId = BRACKETING_ROUND_3_BATCH_ID,
	seed = BRACKETING_ROUND_3_SEED,
): BracketingFixture {
	const random = mulberry32(seed)
	const items = generateRound3Items(random)
	const bands = ROUND3_REGION_PAIRS.map((pair) => {
		const { avg, max } = straddleBand(pair[0], pair[1])
		return {
			regions: pair,
			avgBar: avg,
			maxBar: max,
			width: max - avg,
			inBandItems: items.filter(
				(item) =>
					item.role === "ladder" &&
					item.straddle?.zone === "in-band" &&
					[item.straddle.regionFirst, item.straddle.regionSecond].slice().sort().join("|") ===
						[pair[0], pair[1]].slice().sort().join("|"),
			).length,
			corpusShare: ROUND3_CORPUS_SHARE[round3PairKey(pair)],
		}
	})
	return {
		fixtureVersion: BRACKETING_FIXTURE_VERSION,
		batchId,
		seed,
		generatedBy: "research/v3/src/review-server/bracketing.ts",
		criterion: BRACKETING_CRITERION,
		prompts: PART_PROMPTS,
		quadrantBoundaries: { lightness: QUADRANT_LIGHTNESS_BOUNDARY, chroma: QUADRANT_CHROMA_BOUNDARY },
		// Round 3's prior is the pooled bar from rounds 1–2. It is not what this round measures — the
		// bands are built from the *regional* bars — but it is the scalar the fixture format carries.
		prior: { sameColorBar: POOLED_SAME_COLOR_BAR },
		items,
		serveOrder: round3ServeOrder(items, random),
		straddleDesign: {
			round: 3,
			question:
				"When a pair's two colours fall in different regions, is the same-colour bar the larger of the two regional bars (Math.max, the incumbent) or their average?",
			preregistration: ROUND3_PREREGISTRATION_PATH,
			bars: { ...SAME_COLOR_BAR_BY_REGION },
			barsSource:
				"research/v3/src/contract/constants.ts SAME_COLOR_BAR_BY_REGION — [REVIEWED], bracketing rounds 1 and 2 pooled",
			bands,
			corpusFrequency: {
				source: [
					"research/v3/data/legacy/endorsements.json",
					"research/v3/data/legacy/acceptable.json",
					"research/v3/data/legacy/known-bad.json",
				],
				palettes: 554,
				rolePairs: 3309,
				crossRegionPairs: 2582,
				crossRegionShare: 0.7803,
				pairsInAnyDisagreementBand: 0,
				closestCrossRegionPair: 0.04664,
				note:
					"All six region pairs occur between 10.5% and 22.0% of cross-region role pairs, so all six are covered. None of the 2,582 lands in any disagreement band — the straddle rule is dormant for role-pair distinctness on today's corpus, which is a statement about this reviewed corpus, not a reason to leave the rule unmeasured.",
			},
			scoring: {
				population:
					"The 42 items with role 'ladder' and straddle.zone 'in-band', each counted once, at its first showing. Repeats are not counted as independent trials. Controls and attention checks are never scored. n = those answered, k = those answered 'same colour'.",
				prediction:
					"On every in-band item the two rules disagree by construction: Math.max predicts 'same colour', the average predicts 'distinct'. So accuracy(max) = k/n and accuracy(avg) = 1 - k/n exactly, and the winner is whichever exceeds one half.",
				decisive:
					"Decisive if and only if the two-sided exact binomial test of k against p = 0.5 yields p < 0.05, and the 95% Wilson interval for k/n excludes 0.5. At the design n these coincide. If n < 42, the threshold is recomputed at the realized n before the count is looked at.",
				decisiveAtDesignN: { n: 42, favoursMax: 28, favoursAverage: 14 },
				unresolved:
					"Any 15 <= k <= 27 is reported as unresolved — not a tie, not weak support for either rule, and not a licence to keep Math.max on the strength of this round. The rule then stays as it is only because it is already there, and the loose end stays open.",
				anisotropyVeto:
					"k is also computed over the 21 lightness-dominant and the 21 chroma-dominant in-band items separately. If those rates fall on opposite sides of 0.5 and at least one subgroup is individually decisive at alpha = 0.05, the round reports 'anisotropy-confounded': no global winner, and the finding is that the straddle bar depends on the direction of the difference, which neither candidate rule can express.",
				validityGates:
					"Checked before anything above is computed. All 3 identical-pair checks must be answered 'same' and all 3 clearly-distinct checks 'distinct'; any failure voids the round. If both below-band items come back 'distinct', or both above-band items 'same', the bands are not where rounds 1-2 put them and the verdict is reported as not interpretable.",
				sensitivity:
					"Re-run with each repeated item's later answer substituted for its first. If the verdict differs from the primary run, the round is unresolved whatever the primary count said.",
				exploratory:
					"A logistic fit of P(same) on log d over all 46 ladder items. If its p = 0.5 crossing lands strictly inside the pooled band with a 95% interval excluding both the pooled avg and the pooled max, that is reported as 'neither rule — the straddling bar is intermediate'. Badly under-powered at 46 points over six bands; exploratory, never the headline.",
				power: { "0.60": 0.24, "0.65": 0.48, "0.70": 0.74, "0.75": 0.92, "0.80": 0.99 },
				powerNote:
					"The round reliably detects a strong preference and is underpowered for a mild one. The reviewer's measured repeat consistency across rounds 1-2 is 62.5%, which sits below the decisive cut of 66.7% — so 'unresolved' is a genuinely likely outcome, and it is a real result rather than a failure. Stated before the data so that a null cannot later be read as support for the incumbent.",
			},
			directionClasses: [...ROUND3_DIRECTIONS],
			minimumDirectionPurity: ROUND3_MIN_DIRECTION_PURITY,
		},
	}
}

export const BRACKETING_ROUND_3_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/bracketing-round-3.json", import.meta.url),
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

/** Round 3's console summary: the bands, what landed in them, and the controls. */
function reportRound3(fixture: BracketingFixture): void {
	const items = fixture.items
	const inBand = items.filter((item) => item.role === "ladder" && item.straddle?.zone === "in-band")
	process.stdout.write(`round 3 — the straddle rule (${fixture.batchId})\n`)
	process.stdout.write(`  criterion: ${fixture.criterion}\n`)
	process.stdout.write(`  items ${items.length}: in-band ${inBand.length}`)
	for (const role of ["ladder", "repeat", "control-identical", "control-obvious"] as const) {
		const count = items.filter((item) => item.role === role).length
		process.stdout.write(`, ${role} ${count}`)
	}
	process.stdout.write("\n")
	for (const band of fixture.straddleDesign?.bands ?? []) {
		const mine = inBand.filter(
			(item) =>
				[item.straddle!.regionFirst, item.straddle!.regionSecond].slice().sort().join("|") ===
				[band.regions[0], band.regions[1]].slice().sort().join("|"),
		)
		const fractions = mine.map((item) => item.straddle!.bandFraction)
		process.stdout.write(
			`  ${band.regions[0]} × ${band.regions[1]}: band ${band.avgBar.toFixed(5)}–${band.maxBar.toFixed(5)}` +
				` (width ${band.width.toFixed(5)}, corpus ${(band.corpusShare * 100).toFixed(1)}%)` +
				` items ${mine.length} at fractions ${fractions.map((value) => value.toFixed(2)).join(" ")}\n`,
		)
	}
	const purity = items.filter((item) => item.decomposition !== undefined).map((item) => item.decomposition!.purity)
	process.stdout.write(
		`  direction purity: min ${Math.min(...purity).toFixed(3)} over ${purity.length} directed items\n`,
	)
	const discriminating = items.filter((item) => item.straddle?.discriminating === true).length
	process.stdout.write(`  discriminating items (the two rules disagree): ${discriminating}\n`)
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, round: { type: "string", default: "1" } },
		strict: true,
	})
	if (values.round !== "1" && values.round !== "2" && values.round !== "3") {
		throw new Error("--round must be 1, 2 or 3")
	}
	const fixture =
		values.round === "3"
			? generateBracketingRound3Fixture()
			: values.round === "2"
				? generateBracketingRound2Fixture()
				: generateBracketingFixture()
	if (values.round === "3") reportRound3(fixture)
	else if (values.round === "2") reportRound2(fixture)
	else reportRound1(fixture)
	if (values.write) {
		const path =
			values.round === "3"
				? BRACKETING_ROUND_3_FIXTURE_PATH
				: values.round === "2"
					? BRACKETING_ROUND_2_FIXTURE_PATH
					: BRACKETING_FIXTURE_PATH
		await writeFile(path, serializeFixture(fixture))
		process.stdout.write(`wrote ${path}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
