/**
 * **Perception round 4 — "the shape round".**
 *
 * The round `PERCEPTION_MODEL_STUDY.md` PART 2 designed and `perception-model-round-design.ts` sized.
 * 148 items in three arms plus controls, built on machinery that already exists: the bracketing
 * rounds' colour-patch pair and the `accent-real-1` mock-player flow, including its isoluminance
 * solver. Nothing about either stimulus is re-implemented here — both are imported.
 *
 * ## What each arm is for, in one line each
 *
 * - **Arm A (40, identity).** Every item is placed where `ICtCp × one global constant` and the
 *   contract's `OKLab × four regional bars + Math.max` make **opposite** same/different predictions.
 *   Exactly one of the two is right on each item, so the arm reduces to one binomial. This is the
 *   cheapest possible test of the study's finding 2 and it needs no ladder.
 * - **Arm B (36, identity).** Three pure-direction ladders — lightness, chroma, hue — of twelve
 *   rungs each, **inside dark-neutral only**. Estimates the anisotropy ratio directly instead of
 *   inferring it from a mixed sample. Declared under-powered for adoption before it is run.
 * - **Arm C (60, functional).** Accents on real covers, crossed over the three accent hue thirds.
 *   36 are isoluminant, exactly as `accent-real-1` built them; **24 are deliberately not**, which is
 *   the first time the functional criterion's lightness axis has ever been sampled at all. The two
 *   strata are never pooled.
 * - **Controls and repeats (12).** 3 identical, 3 obvious, 6 silent repeats — the shape rounds 1–3
 *   used, so repeat consistency is re-measured rather than assumed.
 *
 * ## The two criteria on screen, and why each is worded the way it is
 *
 * This round shows **two different questions**, and the whole risk of the round is that the reviewer
 * answers one of them under the other's reading. Both wordings are therefore fixed here, in the
 * fixture, and travel with the answers:
 *
 * - **Identity (arms A and B)** carries `PART_PROMPTS["same-color"]` **byte-identically**. Not
 *   paraphrased, not improved, not re-punctuated. Rounds 1–3 produced 184 answers under those exact
 *   words and this round's answers are meant to pool with them; a wording change would make the
 *   pooling a different measurement wearing the same name. `assertIdentityWordingIsUnchanged()` below
 *   compares against the round-3 fixture on disk, and the test suite runs it.
 * - **Function (arm C)** carries `ACCENT_REAL_PROMPT` byte-identically **plus the clarification that
 *   actually governed `accent-real-1`'s scored answers**, now on screen instead of in chat. That is
 *   an extension of the served text and it is declared as one — see `ACCENT_CLARIFICATION`.
 *
 * ## What this round does NOT measure, said here so nobody has to reconstruct it later
 *
 * **The excursion bar's magnitude.** The P1 excursion bar is `2.5 ×` the same-colour bar, and the
 * audit (`PERCEPTION_MODEL_STUDY.md` PART 3, row 15) calls it the clearest live instance of the
 * reviewer's late-discovery worry. This round selects the **metric** — which space and which shape
 * the same-colour bar should live in. It says nothing about the multiplier, because no item in it
 * varies excursion magnitude and no answer it collects could. Measuring that needs ramp stimuli and
 * its own round. Named here, in the generator, so that a later reader cannot mistake arm A's verdict
 * for a licence to keep or move the 2.5.
 *
 * Deterministic: one seed, `mulberry32`, no clock, no `Math.random`.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import {
	apcaLc,
	apcaRaw,
	colorFromRgb,
	colorRegion,
	hexToRgb,
	okLabDistance,
	okLabToRgb,
	rgbToApcaY,
	rgbToHex,
	rgbToOkLab,
	sameColorBar,
} from "../contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../contract/constants.ts"
import { euclidean, spaceById } from "../contract/perception-model-spaces.ts"
import type { ColorRegion, OkLab, Rgb8 } from "../contract/types.ts"
import {
	ACCENT_REAL_GOVERNING_ROLES,
	ACCENT_REAL_LADDER_MAX,
	ACCENT_REAL_LADDER_MIN,
	ACCENT_REAL_LIGHTNESS_BANDS,
	ACCENT_REAL_MAX_DELTA_Y,
	ACCENT_REAL_MIN_FOREGROUND_DISTANCE,
	ACCENT_REAL_PROMPT,
	ACCENT_REAL_TARGET_TOLERANCE,
	type EndorsementEntry,
	equalLuminanceAccent,
	type GoverningRole,
	measurePair,
	mockPageItem,
	oracleItem,
	type PairTruth,
	placementProfile,
	readEndorsements,
} from "./accent-real.ts"
import {
	BRACKETING_ROUND_3_FIXTURE_PATH,
	HUE_THIRD_BOUNDARIES_DEGREES,
	hueThirdOf,
	logLadder,
	PART_PROMPTS,
	QUADRANTS,
	type Quadrant,
} from "./bracketing.ts"
import {
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	validateFixture,
} from "./oracle-validation.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const PERCEPTION_4_BATCH_ID = "perception-4"

/**
 * Its own schema version, because `batchReviewPaths` routes on the schema and never on `kind`.
 *
 * This round draws a colour-patch pair for some items and the full mock player for others. `/oracle`
 * draws neither, and `/accent-real` draws only one of the two.
 */
export const PERCEPTION_4_LABEL_SCHEMA_VERSION = "perception-4.v1"

/** The fixture *shape* is unchanged, so the version string is too. */
export const PERCEPTION_4_FIXTURE_VERSION = PREMISE_DISAMBIGUATION_FIXTURE_VERSION

/** Distinct from every earlier round's seed, so no two fixtures share a draw. */
export const PERCEPTION_4_SEED = 20260804_44

export const PERCEPTION_4_PREREGISTRATION_PATH =
	"research/v3/data/calibration/perception-round-4-preregistration.md"

/**
 * The criteria of record — one per question kind, carried separately end to end.
 *
 * Two strings and not one, because `PERCEPTION_MODEL_STUDY.md`'s first method rule is that the
 * criteria are never pooled, and `bracketing.ts:84-95` records the 72 answers already discarded once
 * over exactly this confusion.
 */
export const PERCEPTION_4_IDENTITY_CRITERION =
	"register-as-same, clarified 2026-08-02 after a false start under a detection criterion"
export const PERCEPTION_4_FUNCTIONAL_CRITERION =
	"functional-visibility on real stimuli — does this work as an accent at a glance; the criterion " +
	"of accent-functional-1 and accent-real-1, with accent-real-1's mid-round chat clarification now " +
	"served on screen rather than given in conversation"

/* ------------------------------------------------------------------------------------------- */
/* The wording — the load-bearing part of the whole round                                        */
/* ------------------------------------------------------------------------------------------- */

/**
 * The identity wording, **byte-identical to `PART_PROMPTS["same-color"]`**.
 *
 * Re-exported rather than re-typed. A re-typed copy is a copy that can drift, and the drift would be
 * invisible: two strings that differ by one comma render the same to a skim and make two rounds
 * un-poolable. `assertIdentityWordingIsUnchanged()` additionally reads round 3's fixture off disk and
 * compares, so the guarantee survives someone editing `bracketing.ts`.
 */
export const IDENTITY_PROMPT = PART_PROMPTS["same-color"]

/**
 * The clarification that actually governed `accent-real-1`'s scored answers, now **on screen**.
 *
 * ## Why this text exists at all
 *
 * Mid-way through `accent-real-1` the reviewer asked which of three readings of the accent question
 * to judge under, and the orchestrator answered in chat. The on-screen wording was deliberately left
 * unchanged, because that round's six anchors are pixel replays of `accent-functional-1` panels and
 * they only measure the lab-versus-real gap if everything except the stimulus is held constant. The
 * cost of that choice is recorded in `accent-real-round-1-preregistration.md` §8.0: *"some unknown
 * prefix of the answers may predate the clarification"*, and answer ordering against the question's
 * timestamp is not available.
 *
 * The clarification as it was given, from
 * `research/v3/data/calibration/accent-real-round-1-order-stability.ts`:
 *
 * > Judge ONLY whether the accent does its visual job against its field — the eye lands on the
 * > accented elements without hunting. Aesthetic fit to the artwork is EXPLICITLY EXCLUDED — yes
 * > even if the colour looks wrong for the artwork. The accent's relation to the FOREGROUND is
 * > EXCLUDED — that is a separate rule.
 *
 * ## Why it is served here and was not there
 *
 * Round 4 has **no anchors**. Nothing in it is a pixel replay of an earlier round's stimulus, so
 * there is no instrument that a wording change would destroy — and the reason for keeping the
 * clarification off screen is therefore gone. What remains is the reason to put it on: an answer
 * means something only against the words it was answered under, and `accent-real-1`'s answers were
 * given under these words whether or not the screen said so.
 *
 * **This is an extension of accent-real-1's served text, and it is declared as one.** It is not a
 * silent change and it is not presented as equivalence: arm C's answers are comparable to
 * `accent-real-1`'s under the clarification that governed both, and the prereg says so in the same
 * breath as it says the served strings are not byte-identical.
 */
export const ACCENT_CLARIFICATION =
	"Clarification, given in chat during accent-real-1 and now on screen: judge only whether the " +
	"accent elements are findable at a glance as the highlights — aesthetic fit to the artwork is " +
	"explicitly excluded, so yes even if the colour looks wrong for the artwork; ignore the " +
	"foreground relation, which is a separate rule; hunting = no."

/**
 * The accent wording as served: `accent-real-1`'s instruction, unchanged, then the clarification.
 *
 * Concatenated rather than rewritten so that the first sentence of what the reviewer reads is still
 * `accent-real-1`'s first sentence, character for character, and the extension is visibly an
 * extension rather than an edit.
 */
export const ACCENT_PROMPT = {
	question: ACCENT_REAL_PROMPT.question,
	instruction: `${ACCENT_REAL_PROMPT.instruction} ${ACCENT_CLARIFICATION}`,
} as const

/**
 * The type label shown above the question, on **both** kinds of item.
 *
 * The reviewer was told the round mixes two stimulus kinds and that the variety is deliberate. The
 * two are visually unmistakable on their own — two flat patches against a whole player over an
 * artwork — so this label is not what makes them distinguishable; it is what makes the *task* switch
 * explicit at the moment of answering, on a 148-item sitting where the question stem changes without
 * warning.
 *
 * It is carried in `preamble`, which is a separate field from `question` and `instruction`. That
 * placement is the point: the byte-identity guarantee is about the criterion, and the criterion is
 * the question and the instruction. The label names the stimulus, which is already on screen.
 */
export const PREAMBLES = {
	identity: "Colour-patch pair.",
	accent: "Player mock, real cover.",
} as const

/**
 * The identity answers — the same three shapes as arm C's, and **not** rounds 1–3's `y`/`n`.
 *
 * Two departures from rounds 1–3, both ordered and both declared in the pre-registration:
 *
 * 1. **There is an escape.** `REVIEW_UI.md` §4, from the reviewer's own ruling: *"answers for those
 *    cases are not reliable (even with human feedback) unless we add an escape answer choice"*. The
 *    identity rounds predate that rule. Its share is a reported result, never subtracted and never
 *    folded into either column.
 * 2. **The hotkeys are digits.** `y`/`n` cannot be offered on an enum question — `validateFixture`
 *    reserves that pair for `kind: "boolean"`, which has no third answer — and a round that bound
 *    `1/2/3` on one item kind and `y/n/3` on the other would be a keyboard the reviewer has to
 *    re-learn every few items. One vocabulary, both kinds: 1 yes, 2 no, 3 can't tell.
 *
 * Neither departure touches the criterion, which is the thing that has to be byte-identical.
 */
export const IDENTITY_ANSWERS = [
	{ key: "same", label: "yes — the same colour", gloss: "they register as one colour", hotkey: "1" },
	{
		key: "different",
		label: "no — different colours",
		gloss: "they would read as two different colours in a UI",
		hotkey: "2",
	},
	{
		key: "cant_tell",
		label: "I can't tell",
		gloss:
			"Genuinely undecidable from what is on screen. Not a way of skipping a hard one — this " +
			"answer's share is reported as a result of the round.",
		hotkey: "3",
	},
] as const

/** The accent answers, byte-identical in key and label to `accent-real-1`'s. */
export const ACCENT_ANSWERS = [
	{ key: "works", label: "yes — it works as an accent", gloss: "at a glance, it picks these elements out", hotkey: "1" },
	{
		key: "does_not_work",
		label: "no — it does not",
		gloss: "you only find it by looking for it, or it reads as a difference rather than an accent",
		hotkey: "2",
	},
	{
		key: "cant_tell",
		label: "I can't tell",
		gloss:
			"Genuinely undecidable from what is on screen. Not a way of skipping a hard one — this " +
			"answer's share is reported as a result of the round.",
		hotkey: "3",
	},
] as const

/**
 * Read round 3's fixture off disk and refuse if this round's identity wording differs by one byte.
 *
 * A constant that says it is byte-identical to another file's constant is a comment until something
 * checks. This is the check, and it is run by the generator itself rather than only by the test
 * suite, so a fixture cannot be *written* under drifted wording even once.
 */
export async function assertIdentityWordingIsUnchanged(
	fixturePath: string = BRACKETING_ROUND_3_FIXTURE_PATH,
): Promise<void> {
	const round3 = JSON.parse(await readFile(fixturePath, "utf8")) as {
		prompts: Record<string, { question: string; instruction: string }>
	}
	const served = round3.prompts["same-color"]
	if (served === undefined) throw new Error(`${fixturePath} has no same-color prompt to compare against`)
	if (served.question !== IDENTITY_PROMPT.question) {
		throw new Error(
			`identity question drifted from bracketing-round-3: served ${JSON.stringify(IDENTITY_PROMPT.question)}, ` +
				`round 3 ${JSON.stringify(served.question)}`,
		)
	}
	if (served.instruction !== IDENTITY_PROMPT.instruction) {
		throw new Error(
			`identity instruction drifted from bracketing-round-3: served ${JSON.stringify(IDENTITY_PROMPT.instruction)}, ` +
				`round 3 ${JSON.stringify(served.instruction)}`,
		)
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The two competing identity rules — arm A's whole content                                      */
/* ------------------------------------------------------------------------------------------- */

const ICTCP = spaceById("ictcp")

export const PERCEPTION_MODEL_STUDY_PATH = fileURLToPath(
	new URL("../../data/contract/perception-model-study.json", import.meta.url),
)
export const PERCEPTION_MODEL_STUDY_REF = "research/v3/data/contract/perception-model-study.json"

/**
 * The ICtCp global threshold, **read from the study's own output rather than transcribed**.
 *
 * The fit is `logit P = b0 + b1 · log d`, which is `β · (log τ − log d)` with `β = −b1` and
 * `log τ = b0 / β`. Transcribing 0.01026 into this file would have made a hand-copied number the
 * pivot of a forty-item arm; reading it means the arm moves if the study is ever re-run, and the
 * fixture records which value it was built against.
 */
export async function ictcpGlobalThreshold(path: string = PERCEPTION_MODEL_STUDY_PATH): Promise<number> {
	const study = JSON.parse(await readFile(path, "utf8")) as {
		cells: readonly { criterion: string; space: string; shape: string; fittedParameters: Record<string, number> }[]
	}
	const cell = study.cells.find(
		(candidate) =>
			candidate.criterion === "identity" && candidate.space === "ictcp" && candidate.shape === "global-constant",
	)
	if (cell === undefined) throw new Error(`${PERCEPTION_MODEL_STUDY_REF} has no identity × ictcp × global-constant cell`)
	const { b0, b1 } = cell.fittedParameters
	if (!Number.isFinite(b0) || !Number.isFinite(b1) || b1 === 0) {
		throw new Error(`the ictcp global-constant fit is degenerate: b0=${b0} b1=${b1}`)
	}
	const threshold = Math.exp(-b0 / b1)
	if (!(threshold > 0) || !Number.isFinite(threshold)) throw new Error(`ictcp threshold ${threshold} is not usable`)
	return threshold
}

/** The distance the ICtCp rule measures, with BT.2124's halved Ct — `perception-model-spaces.ts`. */
export function ictcpDistance(first: Rgb8, second: Rgb8): number {
	return euclidean(ICTCP.toCartesian(first), ICTCP.toCartesian(second))
}

/**
 * The contract's incumbent bar for a pair: the larger of the two regional bars.
 *
 * `sameColorBar()` from the contract, unmodified — not a re-derivation. Arm A is a test *of the
 * incumbent*, so the incumbent has to be the code that ships.
 */
export function oklabBarFor(first: Rgb8, second: Rgb8): number {
	return sameColorBar(colorFromRgb(first), colorFromRgb(second))
}

export type RulePredictions = Readonly<{
	okLabDistance: number
	okLabBar: number
	okLabSaysSame: boolean
	ictcpDistance: number
	ictcpThreshold: number
	ictcpSaysSame: boolean
	/** True on every arm-A item, by construction. */
	rulesDisagree: boolean
	/** Which rule calls this pair the same colour — the arm's design cell. */
	disagreement: "ictcp-says-same" | "oklab-says-same" | null
}>

export function predict(first: Rgb8, second: Rgb8, ictcpThreshold: number): RulePredictions {
	const okLabDistance_ = okLabDistance(rgbToOkLab(first), rgbToOkLab(second))
	const okLabBar = oklabBarFor(first, second)
	const ictcpDistance_ = ictcpDistance(first, second)
	const okLabSaysSame = okLabDistance_ < okLabBar
	const ictcpSaysSame = ictcpDistance_ < ictcpThreshold
	return {
		okLabDistance: okLabDistance_,
		okLabBar,
		okLabSaysSame,
		ictcpDistance: ictcpDistance_,
		ictcpThreshold,
		ictcpSaysSame,
		rulesDisagree: okLabSaysSame !== ictcpSaysSame,
		disagreement:
			okLabSaysSame === ictcpSaysSame ? null : ictcpSaysSame ? "ictcp-says-same" : "oklab-says-same",
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Arm A — 40 discriminating identity items                                                      */
/* ------------------------------------------------------------------------------------------- */

export const ARM_A_ITEMS = 40

/**
 * How far inside its own verdict each rule must sit, as a fraction of its own threshold.
 *
 * An item that discriminates by 0.5% discriminates on rounding. Both distances are computed on the
 * final 8-bit pair, and 8-bit quantisation moves an OKLab distance by up to a few thousandths near
 * these bars — comparable to the bars themselves. 8% of each threshold puts every item clear of that.
 * [UNCALIBRATED] — chosen here; the fits' own intervals are far wider than this margin, which is a
 * separate and larger caveat carried in the pre-registration rather than buried in a constant.
 */
export const ARM_A_MIN_MARGIN = 0.08

/**
 * How much of a pair's OKLab difference must lie along its nominal direction for the anisotropy veto
 * to be allowed to call it that direction. Round 3's `ROUND3_MIN_DIRECTION_PURITY`, unchanged.
 */
export const ARM_A_MIN_DOMINANCE = 0.7

export type ArmADirection = "lightness" | "chroma"
export type ArmADisagreement = "ictcp-says-same" | "oklab-says-same"

/**
 * The arm-A design, as counts per (region × which rule says "same" × dominant direction).
 *
 * **Two of the sixteen cells are empty, and that is a measured fact about the two rulers, not a
 * budget decision.** A feasibility sweep of 400,000 candidate pairs (seeded, no human answer
 * involved — there are none yet) found zero pairs anywhere in `dark-neutral` or `light-neutral`
 * where the OKLab four-bar rule says "same" and ICtCp says "different" on a *lightness*-dominant
 * pair. The reason is structural: in a neutral region OKLab's bar is small (0.00932 / 0.01627) and
 * ICtCp's single 0.01026 is comparable, so a lightness step small enough for OKLab to forgive is
 * always also small enough for ICtCp. Those two cells are therefore not sampled, the counts are
 * redistributed inside the same region, and **the arm still lands at 20/20 on which rule says "same"
 * and 20/20 on dominant direction**, which is what the binomial and the veto need.
 *
 * The redistribution is fixed here, before generation, and the fixture asserts the achieved margins.
 */
export const ARM_A_DESIGN: readonly Readonly<{
	region: Quadrant
	disagreement: ArmADisagreement
	direction: ArmADirection
	count: number
}>[] = [
	{ region: "dark-neutral", disagreement: "ictcp-says-same", direction: "lightness", count: 3 },
	{ region: "dark-neutral", disagreement: "ictcp-says-same", direction: "chroma", count: 4 },
	{ region: "dark-neutral", disagreement: "oklab-says-same", direction: "chroma", count: 3 },
	{ region: "light-neutral", disagreement: "ictcp-says-same", direction: "lightness", count: 3 },
	{ region: "light-neutral", disagreement: "ictcp-says-same", direction: "chroma", count: 4 },
	{ region: "light-neutral", disagreement: "oklab-says-same", direction: "chroma", count: 3 },
	{ region: "dark-saturated", disagreement: "ictcp-says-same", direction: "lightness", count: 2 },
	{ region: "dark-saturated", disagreement: "ictcp-says-same", direction: "chroma", count: 1 },
	{ region: "dark-saturated", disagreement: "oklab-says-same", direction: "lightness", count: 5 },
	{ region: "dark-saturated", disagreement: "oklab-says-same", direction: "chroma", count: 2 },
	{ region: "light-saturated", disagreement: "ictcp-says-same", direction: "lightness", count: 2 },
	{ region: "light-saturated", disagreement: "ictcp-says-same", direction: "chroma", count: 1 },
	{ region: "light-saturated", disagreement: "oklab-says-same", direction: "lightness", count: 5 },
	{ region: "light-saturated", disagreement: "oklab-says-same", direction: "chroma", count: 2 },
]

/**
 * Sampling windows per region, **byte-identical in value to the bracketing rounds'**.
 *
 * Off the extremes of the cube on purpose: near black and near white the 8-bit grid is not
 * representative of the working range real palettes live in, and rounds 1–3 sampled inside these
 * windows, so an arm-A item outside them would not be the same kind of stimulus as the 184 answers
 * it is meant to pool with.
 */
export const REGION_WINDOWS: Readonly<Record<Quadrant, Readonly<{ lightness: [number, number]; chroma: [number, number] }>>> = {
	"dark-neutral": { lightness: [0.15, 0.55], chroma: [0, 0.05] },
	"dark-saturated": { lightness: [0.15, 0.55], chroma: [0.05, 0.18] },
	"light-neutral": { lightness: [0.55, 0.92], chroma: [0, 0.05] },
	"light-saturated": { lightness: [0.55, 0.92], chroma: [0.05, 0.18] },
}

/** Draw budget per arm-A item. Generous because one cell is genuinely rare (see `ARM_A_DESIGN`). */
const ARM_A_MAX_ATTEMPTS = 4_000_000

/* ------------------------------------------------------------------------------------------- */
/* Arm B — three pure-direction ladders inside dark-neutral                                      */
/* ------------------------------------------------------------------------------------------- */

export const ARM_B_REGION: Quadrant = "dark-neutral"
export const ARM_B_RUNGS = 12
export const ARM_B_DIRECTIONS = ["lightness", "chroma", "hue"] as const
export type ArmBDirection = (typeof ARM_B_DIRECTIONS)[number]

/**
 * The per-direction priors the ladders are centred on, from the study's shape-(d) OKLab fit.
 *
 * `PERCEPTION_MODEL_STUDY.md` PART 1: the fitted axis weights are `w_chroma = 17.40`,
 * `w_hue = 14.75` against lightness = 1, at `τ = 0.04512` in the reweighted metric. A pure step along
 * one axis crosses the threshold at `τ / √w`, which is where these three numbers come from:
 * lightness 0.04512, chroma 0.04512/√17.40 = 0.01082, hue 0.04512/√14.75 = 0.01175. The study quotes
 * them rounded as ≈0.045, ≈0.0108, ≈0.0118.
 *
 * They are **priors to place the ladders**, not results. If they are wrong the ladders are simply
 * off-centre, which the fits will show; nothing downstream assumes them.
 */
export const ARM_B_PRIOR_BARS: Readonly<Record<ArmBDirection, number>> = {
	lightness: 0.04512,
	chroma: 0.04512 / Math.sqrt(17.4),
	hue: 0.04512 / Math.sqrt(14.75),
}

/**
 * Ladder span, as a multiplicative bracket around the prior.
 *
 * `[τ/3, 3τ]` is exactly the span `perception-model-round-design.ts` simulated the precision of, and
 * the reported intervals (12 rungs ⇒ threshold ratio [0.46, 1.95]) are only claimable if the built
 * ladder has the shape the simulation assumed.
 */
export const ARM_B_SPAN_FACTOR = 3

/**
 * The 8-bit floor. A ladder rung below this cannot be built as a *pure* direction at 8 bits.
 *
 * The chroma ladder's nominal bottom rung is 0.00361 and the hue ladder's is 0.00392; the sRGB 8-bit
 * grid quantises OKLab differences at roughly 0.002–0.004 near these regions, so a nominal pure step
 * of that size arrives as rounding noise pointing in an arbitrary direction. Rungs below the floor
 * are **clamped to it** rather than dropped, so every ladder still carries twelve rungs and the
 * clamping is recorded per item (`clampedToFloor`) instead of being invisible in a distance column.
 * [UNCALIBRATED] — chosen here, at the value bracketing round 1 used for `PART1_DISTANCE_MIN`.
 */
export const ARM_B_EXPRESSIBLE_FLOOR = 0.004

/**
 * Minimum share of the achieved difference that must lie along the ladder's own axis.
 *
 * Stricter than round 3's 0.7, because these ladders exist to estimate a *pure*-direction threshold
 * and a 30%-contaminated step estimates something else. Achieved on the 8-bit pair, never on the
 * ideal one.
 */
export const ARM_B_MIN_PURITY = 0.9

/** How far an achieved distance may sit from its rung target, as a fraction of the target. */
export const ARM_B_TARGET_TOLERANCE = 0.1

const ARM_B_MAX_ATTEMPTS = 2_000_000

/* ------------------------------------------------------------------------------------------- */
/* Arm C — 60 accent items on real covers                                                        */
/* ------------------------------------------------------------------------------------------- */

export const ARM_C_HUE_THIRDS = HUE_THIRD_BOUNDARIES_DEGREES.length

/**
 * The isoluminant ladder: 12 rungs × 3 hue thirds = 36.
 *
 * `accent-real-1` ran 10 rungs × 3 and **refused its own fit** because the hue thirds disagreed by
 * roughly 2× (0.13417 against 0.26385). This arm keeps that round's span, its construction and its
 * tolerances unchanged, and raises the per-third n from 10 to 12.
 */
export const ARM_C_ISO_RUNGS = 12
export const ARM_C_ISO_ITEMS = ARM_C_ISO_RUNGS * ARM_C_HUE_THIRDS

/**
 * The non-isoluminant stratum: 8 per hue third = 24. **Never pooled with the ladder above.**
 *
 * Why it exists, in the study's own words: every `accent-real-1` item is isoluminant by construction,
 * so *"the lightness axis of the functional threshold is not merely unmeasured, it is unmeasurable
 * from the existing data"* — a direction-aware shape cannot identify a lightness weight when every
 * observation has ΔL ≈ 0. The functional constant is nonetheless applied to accent/field pairs of
 * arbitrary lightness relation. These 24 items are the first observations ever taken on that axis.
 *
 * The 8 per third are a 2 × 2 × 2 crossing of distance, lightness share and sign — chosen so that a
 * fit can tell a lightness weight from a distance effect, which a single-fraction design could not.
 */
export const ARM_C_NONISO_DISTANCES = [0.09, 0.2] as const
/** What share of the total OKLab distance is carried by the lightness axis. */
export const ARM_C_NONISO_LIGHTNESS_SHARES = [0.45, 0.8] as const
export const ARM_C_NONISO_SIGNS = [1, -1] as const
export const ARM_C_NONISO_PER_THIRD =
	ARM_C_NONISO_DISTANCES.length * ARM_C_NONISO_LIGHTNESS_SHARES.length * ARM_C_NONISO_SIGNS.length
export const ARM_C_NONISO_ITEMS = ARM_C_NONISO_PER_THIRD * ARM_C_HUE_THIRDS

export const ARM_C_ITEMS = ARM_C_ISO_ITEMS + ARM_C_NONISO_ITEMS

/**
 * The floor that makes a "non-isoluminant" item actually non-isoluminant.
 *
 * `ACCENT_REAL_MAX_DELTA_Y` is 0.0025 and is the *ceiling* on the isoluminant stratum. Requiring 4×
 * that as the *floor* on this one keeps the two strata separated by a factor of four in the quantity
 * that defines them, so no item can be ambiguous about which stratum it belongs to.
 * [UNCALIBRATED] — chosen here.
 */
export const ARM_C_NONISO_MIN_DELTA_Y = ACCENT_REAL_MAX_DELTA_Y * 4

/** How far a constructed OKLab point may move under 8-bit rounding before it counts as clipped. */
const GAMUT_ROUND_TRIP_TOLERANCE = 0.01

/** Minimum chroma for an accent's hue third to mean anything. `accent-real-1`'s value. */
const MIN_ACCENT_CHROMA = 0.02

const ARM_C_MAX_ATTEMPTS = 20_000

/* ------------------------------------------------------------------------------------------- */
/* Controls and silent repeats                                                                   */
/* ------------------------------------------------------------------------------------------- */

/**
 * 3 identical + 3 obvious + 6 repeats = 12, the shape rounds 1–3 used.
 *
 * The controls are split across the two stimulus kinds, 2 identity and 1 accent in each direction,
 * because a control that only ever vouched for the patch pairs would say nothing about whether the
 * mock-player items were being attended to — and this round's whole risk is the reviewer answering
 * one question under the other's reading.
 *
 * The repeats are split 4 identity / 2 accent. That is not even, and the reason is that the
 * consistency figure everything downstream is sized against — round 3's 83.3%, which becomes
 * `λ = 0.092` in `perception-model-round-design.ts` — is an *identity* measurement, and a comparison
 * against it has to be made on identity items. Four is a thin re-measurement and the pre-registration
 * says so rather than dressing it up.
 */
export const CONTROL_IDENTICAL_IDENTITY = 2
export const CONTROL_IDENTICAL_ACCENT = 1
export const CONTROL_OBVIOUS_IDENTITY = 2
export const CONTROL_OBVIOUS_ACCENT = 1
export const REPEATS_IDENTITY = 4
export const REPEATS_ACCENT = 2
export const CONTROL_AND_REPEAT_ITEMS =
	CONTROL_IDENTICAL_IDENTITY +
	CONTROL_IDENTICAL_ACCENT +
	CONTROL_OBVIOUS_IDENTITY +
	CONTROL_OBVIOUS_ACCENT +
	REPEATS_IDENTITY +
	REPEATS_ACCENT

/** How far apart a repeat must sit from the item it repeats, in served positions. Round 3's value. */
const MIN_REPEAT_SEPARATION = 12

/** How many times the OKLab bar an "obvious" identity control must exceed. Round 3's value. */
export const OBVIOUS_BAR_MULTIPLE = 4

export const PERCEPTION_4_TOTAL_ITEMS = ARM_A_ITEMS + ARM_B_RUNGS * ARM_B_DIRECTIONS.length + ARM_C_ITEMS + CONTROL_AND_REPEAT_ITEMS

/* ------------------------------------------------------------------------------------------- */
/* Paths                                                                                         */
/* ------------------------------------------------------------------------------------------- */

const ENDORSEMENTS_REF = "research/v3/data/legacy/endorsements.json"
const ACCENT_REAL_FIXTURE_REF = "research/v3/data/calibration/accent-real-round-1.json"
const ACCENT_REAL_FIXTURE_PATH_LOCAL = fileURLToPath(
	new URL("../../data/calibration/accent-real-round-1.json", import.meta.url),
)

export const PERCEPTION_4_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/perception-round-4.json", import.meta.url),
)
/** Render data, served to the browser. **Carries no truth.** */
export const PERCEPTION_4_PAGE_DATA_PATH = fileURLToPath(
	new URL("../../review-ui/perception-4.data.json", import.meta.url),
)
/** The truth, read only by the analyzer. **Never served.** */
export const PERCEPTION_4_TRUTH_PATH = fileURLToPath(
	new URL("../../data/calibration/perception-round-4-truth.json", import.meta.url),
)

/* ------------------------------------------------------------------------------------------- */
/* Item shapes                                                                                   */
/* ------------------------------------------------------------------------------------------- */

export type Perception4Arm = "A" | "B" | "C" | "control" | "repeat"
export type Perception4Kind = "identity" | "accent"
export type Perception4Role =
	| "arm-a"
	| "arm-b"
	| "arm-c-isoluminant"
	| "arm-c-non-isoluminant"
	| "control-identical"
	| "control-obvious"
	| "repeat"

/** What the page needs to DRAW one item. Served; carries no truth. */
export type Perception4PageItem = Readonly<{
	questionKey: string
	stimulus: "pair" | "mock"
	/** `pair` items only: the two flat patches, as CSS colour strings. */
	pair?: Readonly<{ firstHex: string; secondHex: string }>
	/** `mock` items only: the palette in `mock.js`'s side shape, accent already substituted. */
	side?: Readonly<{
		roles: readonly Readonly<{ role: string; hex: string; name: string; collapsed: boolean }>[]
		gradient: null
		fieldCss: string
	}>
}>

/** What the ANALYZER needs. Never served. */
export type Perception4TruthItem = Readonly<{
	itemId: string
	questionKey: string
	arm: Perception4Arm
	kind: Perception4Kind
	role: Perception4Role
	stimulus: "pair" | "mock"
	/** Identity items: the exact 8-bit pair and every measurement on it. */
	identity: Readonly<{
		first: Rgb8
		second: Rgb8
		firstHex: string
		secondHex: string
		region: ColorRegion
		regionFirst: ColorRegion
		regionSecond: ColorRegion
		okLabDistance: number
		lightnessDelta: number
		chromaDelta: number
		hueDelta: number
		dominantDirection: "lightness" | "chroma" | "hue"
		dominance: number
		apcaRaw: number
		apcaLc: number
		identical: boolean
		/** Arm A only: which rule says what. */
		rules: RulePredictions | null
		/** Arm A only. */
		disagreement: ArmADisagreement | null
		/** Arm B only. */
		ladderDirection: ArmBDirection | null
		rung: number | null
		targetDistance: number | null
		clampedToFloor: boolean | null
	}> | null
	/** Accent items: the field/accent relation and the whole placement profile. */
	accent: Readonly<{
		stratum: "isoluminant" | "non-isoluminant"
		rung: number | null
		targetDistance: number | null
		hueThird: number | null
		lightnessShare: number | null
		lightnessSign: number | null
		/** Whether this cover is new to the reviewer, or one `accent-real-1` already showed them. */
		coverFreshness: "unused-by-accent-real-1" | "reused-from-accent-real-1"
		governingRole: string
		band: string | null
		entryId: string | null
		imageId: string | null
		accentHex: string
		originalAccentHex: string | null
		governing: PairTruth
		placementProfile: readonly PairTruth[]
	}> | null
	/** Repeats only. */
	repeatOf: string | null
}>

export type Perception4Build = Readonly<{
	fixture: OracleValidationFixture
	pageData: { batchId: string; items: readonly Perception4PageItem[] }
	truth: {
		batchId: string
		schema: string
		generatedBy: string
		builtFrom: readonly string[]
		preregistration: string
		identityCriterion: string
		functionalCriterion: string
		identityQuestion: string
		identityInstruction: string
		accentQuestion: string
		accentInstruction: string
		accentClarification: string
		ictcpThreshold: number
		okLabBars: typeof SAME_COLOR_BAR_BY_REGION
		armBPriorBars: typeof ARM_B_PRIOR_BARS
		items: readonly Perception4TruthItem[]
	}
}>

/* ------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                 */
/* ------------------------------------------------------------------------------------------- */

function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values]
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

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

/**
 * Opaque per-item question keys, seeded.
 *
 * **Never an index and never the arm.** The side-car is a static file the browser can read in full,
 * so `p4_arm_a_07` would spell out which items are the discriminating ones and which are controls —
 * on a round whose arm-A items are, by construction, the ones where the two rules disagree.
 */
function slugger(random: () => number): () => string {
	const seen = new Set<string>()
	return () => {
		for (;;) {
			const slug = Math.floor(random() * 0xffffffff).toString(16).padStart(8, "0")
			if (seen.has(slug)) continue
			seen.add(slug)
			return slug
		}
	}
}

const chromaOf = (lab: OkLab): number => Math.hypot(lab[1], lab[2])

const bandOf = (lightness: number): number =>
	ACCENT_REAL_LIGHTNESS_BANDS.findIndex((band) => lightness >= band.low && lightness < band.high)

/**
 * The L / C / H decomposition of an OKLab difference, in the CIE convention.
 *
 * `ΔH` is residual — `√(Δa² + Δb² − ΔC²)` — so `Δ² = ΔL² + ΔC² + ΔH²` holds exactly and the three
 * shares are commensurable. Same convention as `perception-model-spaces.ts`, deliberately: the study
 * that designed this round decomposes in exactly this way and the numbers have to be comparable.
 */
export function decomposeOkLab(first: Rgb8, second: Rgb8): {
	total: number
	lightness: number
	chroma: number
	hue: number
	dominant: "lightness" | "chroma" | "hue"
	dominance: number
} {
	const a = rgbToOkLab(first)
	const b = rgbToOkLab(second)
	const total = okLabDistance(a, b)
	const lightness = Math.abs(b[0] - a[0])
	const chroma = Math.abs(chromaOf(b) - chromaOf(a))
	const planar = Math.hypot(b[1] - a[1], b[2] - a[2])
	const hue = Math.sqrt(Math.max(0, planar * planar - chroma * chroma))
	const parts = [
		["lightness", lightness],
		["chroma", chroma],
		["hue", hue],
	] as const
	const best = parts.reduce((left, right) => (right[1] > left[1] ? right : left))
	return {
		total,
		lightness,
		chroma,
		hue,
		dominant: best[0],
		dominance: total === 0 ? 0 : best[1] / total,
	}
}

function identityTruth(
	first: Rgb8,
	second: Rgb8,
	extra: Partial<NonNullable<Perception4TruthItem["identity"]>> = {},
): NonNullable<Perception4TruthItem["identity"]> {
	const parts = decomposeOkLab(first, second)
	return {
		first,
		second,
		firstHex: rgbToHex(first),
		secondHex: rgbToHex(second),
		region: colorRegion(colorFromRgb(first)),
		regionFirst: colorRegion(colorFromRgb(first)),
		regionSecond: colorRegion(colorFromRgb(second)),
		okLabDistance: parts.total,
		lightnessDelta: parts.lightness,
		chromaDelta: parts.chroma,
		hueDelta: parts.hue,
		dominantDirection: parts.dominant,
		dominance: parts.dominance,
		apcaRaw: apcaRaw(second, first),
		apcaLc: apcaLc(second, first),
		identical: first[0] === second[0] && first[1] === second[1] && first[2] === second[2],
		rules: null,
		disagreement: null,
		ladderDirection: null,
		rung: null,
		targetDistance: null,
		clampedToFloor: null,
		...extra,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Arm A construction                                                                            */
/* ------------------------------------------------------------------------------------------- */

/** A colour inside a region's window, at a seeded position. */
function sampleInRegion(region: Quadrant, random: () => number): { rgb: Rgb8; lab: OkLab } | null {
	const window = REGION_WINDOWS[region]
	const lightness = window.lightness[0] + random() * (window.lightness[1] - window.lightness[0])
	const chroma = window.chroma[0] + random() * (window.chroma[1] - window.chroma[0])
	const hue = random() * Math.PI * 2
	const rgb = okLabToRgb([lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)])
	const lab = rgbToOkLab(rgb)
	if (colorRegion(colorFromRgb(rgb)) !== region) return null
	// A point the gamut had to clamp is not at the coordinates it was asked for.
	if (okLabDistance(lab, [lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)]) > GAMUT_ROUND_TRIP_TOLERANCE) {
		return null
	}
	return { rgb, lab }
}

function displace(base: OkLab, direction: ArmADirection, magnitude: number, random: () => number): Rgb8 {
	if (direction === "lightness") {
		const sign = random() < 0.5 ? -1 : 1
		return okLabToRgb([base[0] + sign * magnitude, base[1], base[2]])
	}
	const angle = random() * Math.PI * 2
	return okLabToRgb([base[0], base[1] + Math.cos(angle) * magnitude, base[2] + Math.sin(angle) * magnitude])
}

type ArmACandidate = Readonly<{ first: Rgb8; second: Rgb8; rules: RulePredictions; dominance: number }>

function buildArmAItem(
	region: Quadrant,
	disagreement: ArmADisagreement,
	direction: ArmADirection,
	ictcpThreshold: number,
	random: () => number,
	seen: Set<string>,
): ArmACandidate | null {
	for (let attempt = 0; attempt < ARM_A_MAX_ATTEMPTS; attempt++) {
		const base = sampleInRegion(region, random)
		if (base === null) continue
		const magnitude = 0.002 + random() * 0.05
		const second = displace(base.lab, direction, magnitude, random)
		if (colorRegion(colorFromRgb(second)) !== region) continue
		const parts = decomposeOkLab(base.rgb, second)
		if (parts.total === 0) continue
		const share = direction === "lightness" ? parts.lightness : parts.chroma
		if (share / parts.total < ARM_A_MIN_DOMINANCE) continue
		const rules = predict(base.rgb, second, ictcpThreshold)
		if (rules.disagreement !== disagreement) continue
		if (Math.abs(rules.okLabDistance - rules.okLabBar) / rules.okLabBar < ARM_A_MIN_MARGIN) continue
		if (Math.abs(rules.ictcpDistance - ictcpThreshold) / ictcpThreshold < ARM_A_MIN_MARGIN) continue
		const key = `${rgbToHex(base.rgb)}|${rgbToHex(second)}`
		if (seen.has(key)) continue
		seen.add(key)
		return { first: base.rgb, second, rules, dominance: share / parts.total }
	}
	return null
}

/* ------------------------------------------------------------------------------------------- */
/* Arm B construction                                                                            */
/* ------------------------------------------------------------------------------------------- */

export function armBLadder(direction: ArmBDirection): number[] {
	const prior = ARM_B_PRIOR_BARS[direction]
	return logLadder(prior / ARM_B_SPAN_FACTOR, prior * ARM_B_SPAN_FACTOR, ARM_B_RUNGS)
}

function displacePure(base: OkLab, direction: ArmBDirection, magnitude: number, random: () => number): Rgb8 | null {
	if (direction === "lightness") {
		const sign = random() < 0.5 ? -1 : 1
		return okLabToRgb([base[0] + sign * magnitude, base[1], base[2]])
	}
	const chroma = chromaOf(base)
	const hue = Math.atan2(base[2], base[1])
	if (direction === "chroma") {
		// Pure chroma: same hue angle, chroma moved. Outward when there is room, inward otherwise.
		const outward = chroma + magnitude <= REGION_WINDOWS[ARM_B_REGION].chroma[1]
		const target = outward ? chroma + magnitude : chroma - magnitude
		if (target < 0) return null
		return okLabToRgb([base[0], target * Math.cos(hue), target * Math.sin(hue)])
	}
	// Pure hue: same chroma, same lightness, hue rotated so the arc length is `magnitude`.
	if (chroma <= 0) return null
	const half = magnitude / (2 * chroma)
	if (half > 1) return null
	const sweep = 2 * Math.asin(half) * (random() < 0.5 ? -1 : 1)
	return okLabToRgb([base[0], chroma * Math.cos(hue + sweep), chroma * Math.sin(hue + sweep)])
}

type ArmBCandidate = Readonly<{ first: Rgb8; second: Rgb8; achieved: number; purity: number }>

function buildArmBItem(
	direction: ArmBDirection,
	target: number,
	random: () => number,
	seen: Set<string>,
): ArmBCandidate | null {
	let best: ArmBCandidate | null = null
	let bestError = Infinity
	for (let attempt = 0; attempt < ARM_B_MAX_ATTEMPTS; attempt++) {
		const base = sampleInRegion(ARM_B_REGION, random)
		if (base === null) continue
		// A hue or chroma step needs somewhere to move; a base at zero chroma has no hue at all.
		if (direction !== "lightness" && chromaOf(base.lab) < 0.008) continue
		const second = displacePure(base.lab, direction, target, random)
		if (second === null) continue
		if (colorRegion(colorFromRgb(second)) !== ARM_B_REGION) continue
		const parts = decomposeOkLab(base.rgb, second)
		if (parts.total === 0) continue
		const share = parts[direction] / parts.total
		if (share < ARM_B_MIN_PURITY) continue
		const error = Math.abs(parts.total - target) / target
		const key = `${rgbToHex(base.rgb)}|${rgbToHex(second)}`
		if (seen.has(key)) continue
		if (error < bestError) {
			bestError = error
			best = { first: base.rgb, second, achieved: parts.total, purity: share }
		}
		if (error <= ARM_B_TARGET_TOLERANCE) break
	}
	if (best === null || bestError > ARM_B_TARGET_TOLERANCE) return null
	seen.add(`${rgbToHex(best.first)}|${rgbToHex(best.second)}`)
	return best
}

/* ------------------------------------------------------------------------------------------- */
/* Arm C construction                                                                            */
/* ------------------------------------------------------------------------------------------- */

type Candidate = Readonly<{
	entry: EndorsementEntry
	role: GoverningRole
	fieldHex: string
	lightness: number
	band: number
	/** False when `accent-real-1` already showed this cover to the reviewer. */
	fresh: boolean
}>

/**
 * A NON-isoluminant accent: the mirror of `equalLuminanceAccent`, with lightness **chosen** rather
 * than solved.
 *
 * The isoluminant solver bisects L until APCA-Y matches the field's. This one does the opposite: it
 * places `ΔL = sign · share · target` and puts the remaining `√(target² − ΔL²)` in the chromatic
 * plane at an angle inside the wanted hue third. Everything else — the gamut round-trip check, the
 * hue-third re-derivation from the finished 8-bit colour, the minimum chroma, the foreground
 * separation — is `accent-real-1`'s, unchanged, because the two strata have to differ in exactly one
 * respect for the comparison between them to mean anything.
 */
function nonIsoluminantAccent(field: Rgb8, target: number, share: number, sign: number, angle: number): Rgb8 | null {
	const fieldLab = rgbToOkLab(field)
	const deltaLightness = sign * share * target
	const planar = Math.sqrt(Math.max(0, target * target - deltaLightness * deltaLightness))
	const ideal: OkLab = [
		fieldLab[0] + deltaLightness,
		fieldLab[1] + Math.cos(angle) * planar,
		fieldLab[2] + Math.sin(angle) * planar,
	]
	if (ideal[0] <= 0 || ideal[0] >= 1) return null
	const rgb = okLabToRgb(ideal)
	if (okLabDistance(rgbToOkLab(rgb), ideal) > GAMUT_ROUND_TRIP_TOLERANCE) return null
	if (rgb[0] === field[0] && rgb[1] === field[1] && rgb[2] === field[2]) return null
	if (Math.abs(rgbToApcaY(rgb) - rgbToApcaY(field)) < ARM_C_NONISO_MIN_DELTA_Y) return null
	return rgb
}

function buildArmCAccent(
	candidate: Candidate,
	target: number,
	hueThird: number,
	roles: Readonly<Record<string, string>>,
	random: () => number,
	nonIso: { share: number; sign: number } | null,
): { accent: Rgb8; achieved: number } | null {
	const field = hexToRgb(candidate.fieldHex as `#${string}`)
	const foreground = hexToRgb(roles.foreground as `#${string}`)
	const thirdWidth = (Math.PI * 2) / ARM_C_HUE_THIRDS
	const inset = thirdWidth * 0.08
	let best: { accent: Rgb8; achieved: number } | null = null
	let bestError = Infinity

	for (let attempt = 0; attempt < ARM_C_MAX_ATTEMPTS; attempt++) {
		const theta = hueThird * thirdWidth + inset + random() * (thirdWidth - 2 * inset)
		const accent =
			nonIso === null
				? equalLuminanceAccent(field, target, theta)
				: nonIsoluminantAccent(field, target, nonIso.share, nonIso.sign, theta)
		if (accent === null) continue
		const accentLab = rgbToOkLab(accent)
		if (hueThirdOf(accentLab) !== hueThird) continue
		if (chromaOf(accentLab) < MIN_ACCENT_CHROMA) continue
		if (okLabDistance(accentLab, rgbToOkLab(foreground)) < ACCENT_REAL_MIN_FOREGROUND_DISTANCE) continue
		const achieved = okLabDistance(rgbToOkLab(field), accentLab)
		const error = Math.abs(achieved - target) / target
		if (error < bestError) {
			bestError = error
			best = { accent, achieved }
		}
		if (error <= ACCENT_REAL_TARGET_TOLERANCE) return best
	}
	return bestError <= ACCENT_REAL_TARGET_TOLERANCE ? best : null
}

/* ------------------------------------------------------------------------------------------- */
/* Build                                                                                         */
/* ------------------------------------------------------------------------------------------- */

export async function buildPerception4Fixture(
	batchId = PERCEPTION_4_BATCH_ID,
	seed = PERCEPTION_4_SEED,
): Promise<Perception4Build> {
	await assertIdentityWordingIsUnchanged()
	const ictcpThreshold = await ictcpGlobalThreshold()
	const random = mulberry32(seed)
	const endorsements = await readEndorsements()

	const items: OracleValidationItem[] = []
	const pageItems: Perception4PageItem[] = []
	const truthItems: Perception4TruthItem[] = []
	const questions: OracleQuestion[] = []
	const nextSlug = slugger(random)
	const seenPairs = new Set<string>()

	const questionFor = (kind: Perception4Kind): string => {
		const key = `p4_${nextSlug()}`
		const prompt = kind === "identity" ? IDENTITY_PROMPT : ACCENT_PROMPT
		questions.push({
			key,
			kind: "enum",
			question: prompt.question,
			instruction: prompt.instruction,
			preamble: kind === "identity" ? PREAMBLES.identity : PREAMBLES.accent,
			answers: (kind === "identity" ? IDENTITY_ANSWERS : ACCENT_ANSWERS).map((answer) => ({ ...answer })),
		})
		return key
	}

	/* --- the cover pool ------------------------------------------------------------------------ */
	// A cover the reviewer has already judged carries an impression, and re-showing it under a
	// different accent would put that impression inside the measurement. So covers `accent-real-1`
	// used are **deprioritised, not banned** — they sort last, and a cell takes one only when no fresh
	// cover admits its accent at all.
	//
	// Banning them outright was the first design and it is INFEASIBLE, which is a fact about the
	// corpus rather than a preference: 144 distinct full-palette covers exist, 45 went to
	// `accent-real-1`, and the surviving 99 do not contain enough dark-field covers that admit a
	// high-distance isoluminant accent in every hue third. The generator threw at rung 8. Reusing a
	// cover is the smaller cost than dropping a rung, and every reuse is recorded per item
	// (`coverFreshness`) and counted in the fixture, so the exposure is visible rather than absorbed.
	const usedByAccentReal = new Set<string>()
	{
		const previous = JSON.parse(await readFile(ACCENT_REAL_FIXTURE_PATH_LOCAL, "utf8")) as {
			items: readonly { imageId: string }[]
		}
		for (const item of previous.items) usedByAccentReal.add(item.imageId)
	}
	const byImage = new Map<string, EndorsementEntry>()
	for (const entry of shuffled(endorsements, random)) {
		if (!byImage.has(entry.artwork.imageId)) byImage.set(entry.artwork.imageId, entry)
	}
	const candidates: Candidate[] = []
	for (const entry of byImage.values()) {
		for (const role of ACCENT_REAL_GOVERNING_ROLES) {
			const fieldHex = entry.palette.roles[role].hex
			const lightness = rgbToOkLab(hexToRgb(fieldHex as `#${string}`))[0]
			const band = bandOf(lightness)
			if (band < 0) continue
			candidates.push({ entry, role, fieldHex, lightness, band, fresh: !usedByAccentReal.has(entry.artwork.imageId) })
		}
	}
	// Fresh first, then the rest — a stable partition of one seeded shuffle, so the order inside each
	// half is still the seed's and nothing about the preference depends on the corpus file's order.
	const shuffledOnce = shuffled(candidates, random)
	const shuffledCandidates = [
		...shuffledOnce.filter((candidate) => candidate.fresh),
		...shuffledOnce.filter((candidate) => !candidate.fresh),
	]
	const usedImages = new Set<string>()

	/* --- a carrier cover for every identity item ------------------------------------------------ */
	// The fixture schema requires every item to name an image, and an identity item has none: it is
	// two flat patches. Each therefore carries a cover reference it NEVER RENDERS — the patch renderer
	// ignores `item.media` entirely — exactly as `accent-real-1`'s anchors do. Unlike the anchors these
	// do not have to be distinct covers, because `validateFixture` keys uniqueness on
	// `(questionKey, imageId)` and every item here has its own opaque question key. Cycling a small
	// pool would still be a pattern in the payload, so the pool is shuffled and dealt round-robin.
	const carriers = shuffledCandidates.filter((candidate) => candidate.role === "background")
	let carrierAt = 0
	const nextCarrier = (): Candidate => {
		const carrier = carriers[carrierAt % carriers.length]
		carrierAt += 1
		return carrier
	}

	const pushIdentityItem = (
		itemId: string,
		arm: Perception4Arm,
		role: Perception4Role,
		first: Rgb8,
		second: Rgb8,
		extra: Partial<NonNullable<Perception4TruthItem["identity"]>> = {},
		stratum = `${arm}-identity`,
	): void => {
		const questionKey = questionFor("identity")
		const carrier = nextCarrier()
		items.push(oracleItem(carrier.entry, itemId, questionKey, stratum))
		pageItems.push({
			questionKey,
			stimulus: "pair",
			pair: { firstHex: rgbToHex(first), secondHex: rgbToHex(second) },
		})
		truthItems.push({
			itemId,
			questionKey,
			arm,
			kind: "identity",
			role,
			stimulus: "pair",
			identity: identityTruth(first, second, extra),
			accent: null,
			repeatOf: null,
		})
	}

	/* --- arm A --------------------------------------------------------------------------------- */
	let armAIndex = 0
	for (const cell of ARM_A_DESIGN) {
		for (let n = 0; n < cell.count; n++) {
			const built = buildArmAItem(cell.region, cell.disagreement, cell.direction, ictcpThreshold, random, seenPairs)
			if (built === null) {
				throw new Error(
					`arm A: no pair found in ${cell.region} where ${cell.disagreement} on a ${cell.direction}-dominant ` +
						`difference, at margin ${ARM_A_MIN_MARGIN} and dominance ${ARM_A_MIN_DOMINANCE}. ` +
						"The design cell is infeasible against the two rulers; move the count to another cell " +
						"and say so in the pre-registration — do not relax the margin.",
				)
			}
			pushIdentityItem(
				`p4-a-${String(armAIndex).padStart(2, "0")}`,
				"A",
				"arm-a",
				built.first,
				built.second,
				{ rules: built.rules, disagreement: cell.disagreement },
				`arm-a-${cell.region}-${cell.disagreement}-${cell.direction}`,
			)
			armAIndex += 1
		}
	}

	/* --- arm B --------------------------------------------------------------------------------- */
	let armBIndex = 0
	for (const direction of ARM_B_DIRECTIONS) {
		const ladder = armBLadder(direction)
		for (const [rung, nominal] of ladder.entries()) {
			const clamped = nominal < ARM_B_EXPRESSIBLE_FLOOR
			const target = clamped ? ARM_B_EXPRESSIBLE_FLOOR : nominal
			const built = buildArmBItem(direction, target, random, seenPairs)
			if (built === null) {
				throw new Error(
					`arm B: no ${direction}-pure pair at ${target.toFixed(5)} inside ${ARM_B_REGION} at purity ` +
						`${ARM_B_MIN_PURITY} and tolerance ${ARM_B_TARGET_TOLERANCE}. Rung ${rung} of the ` +
						`${direction} ladder is not expressible at 8 bits inside this region — raise the floor and ` +
						"record it, do not lower the purity.",
				)
			}
			pushIdentityItem(
				`p4-b-${String(armBIndex).padStart(2, "0")}`,
				"B",
				"arm-b",
				built.first,
				built.second,
				{ ladderDirection: direction, rung, targetDistance: target, clampedToFloor: clamped },
				`arm-b-${direction}`,
			)
			armBIndex += 1
		}
	}

	/* --- arm C --------------------------------------------------------------------------------- */
	const pushAccentItem = (
		itemId: string,
		arm: Perception4Arm,
		role: Perception4Role,
		candidate: Candidate,
		accent: Rgb8,
		roles: Readonly<Record<string, string>>,
		accentExtra: Omit<
			NonNullable<Perception4TruthItem["accent"]>,
			| "governing"
			| "placementProfile"
			| "accentHex"
			| "originalAccentHex"
			| "governingRole"
			| "band"
			| "entryId"
			| "imageId"
			| "coverFreshness"
		>,
		stratum: string,
	): void => {
		const questionKey = questionFor("accent")
		const accentHex = rgbToHex(accent)
		const substituted = { ...roles, accent: accentHex }
		usedImages.add(candidate.entry.artwork.imageId)
		items.push(oracleItem(candidate.entry, itemId, questionKey, stratum))
		pageItems.push(mockPageItem(questionKey, substituted) as Perception4PageItem)
		truthItems.push({
			itemId,
			questionKey,
			arm,
			kind: "accent",
			role,
			stimulus: "mock",
			identity: null,
			accent: {
				...accentExtra,
				coverFreshness: candidate.fresh ? "unused-by-accent-real-1" : "reused-from-accent-real-1",
				governingRole: candidate.role,
				band: ACCENT_REAL_LIGHTNESS_BANDS[candidate.band].name,
				entryId: candidate.entry.entryId,
				imageId: candidate.entry.artwork.imageId,
				accentHex,
				originalAccentHex: roles.accent,
				governing: measurePair(candidate.role, hexToRgb(candidate.fieldHex as `#${string}`), accent),
				placementProfile: placementProfile(substituted, accent),
			},
			repeatOf: null,
		})
	}

	const rolesOf = (entry: EndorsementEntry): Record<string, string> =>
		Object.fromEntries(Object.entries(entry.palette.roles).map(([role, value]) => [role, value.hex]))

	const takeCandidate = (want: { band?: number; role?: GoverningRole }): Candidate[] =>
		shuffledCandidates.filter(
			(candidate) =>
				!usedImages.has(candidate.entry.artwork.imageId) &&
				(want.band === undefined || candidate.band === want.band) &&
				(want.role === undefined || candidate.role === want.role),
		)

	// The isoluminant ladder: 12 rungs × 3 hue thirds, balanced on field lightness band and governing
	// role the way `accent-real-1`'s `cellFor` balances its own — every rung covers all three bands and
	// both roles appear equally often across the arm.
	const isoLadder = logLadder(ACCENT_REAL_LADDER_MIN, ACCENT_REAL_LADDER_MAX, ARM_C_ISO_RUNGS)
	let armCIndex = 0
	for (const [rung, target] of isoLadder.entries()) {
		for (let slot = 0; slot < ARM_C_HUE_THIRDS; slot++) {
			const band = (rung + slot) % 3
			const hueThird = (rung + 2 * slot) % 3
			const wantRole = ACCENT_REAL_GOVERNING_ROLES[(rung + (slot === 1 ? 1 : 0)) % 2]
			// **The hue third is never relaxed; the band and the role are.**
			//
			// The hue third is arm C's stratification variable — the quantity `accent-real-1` found a 2×
			// spread across and the reason this arm exists — so its 12/12/12 split is exact and asserted
			// below. Field lightness band and governing role are nuisance controls: they exist so that
			// neither can be confounded with distance, and they are balanced when the gamut allows it.
			//
			// It does not always allow it. An isoluminant accent 0.30 from a DARK field in hue third 1
			// (the green-cyan third) does not exist in sRGB at any lightness the corpus offers: holding
			// APCA-Y fixed at a dark field's value while moving 0.30 across the chromatic plane leaves the
			// gamut. That is physics, not a shortage of covers, and the generator threw on it. So the
			// search falls back in a declared order — exact cell, then the right role in any band, then
			// any cover — and the achieved band × hue-third cross-tab is written into the fixture so the
			// residual imbalance is a number anyone can read rather than an assumption.
			let placed = false
			for (const candidate of [
				...takeCandidate({ band, role: wantRole }),
				...takeCandidate({ role: wantRole }),
				...takeCandidate({}),
			]) {
				const roles = rolesOf(candidate.entry)
				const built = buildArmCAccent(candidate, target, hueThird, roles, random, null)
				if (built === null) continue
				pushAccentItem(
					`p4-c-iso-${String(armCIndex).padStart(2, "0")}`,
					"C",
					"arm-c-isoluminant",
					candidate,
					built.accent,
					roles,
					{
						stratum: "isoluminant",
						rung,
						targetDistance: target,
						hueThird,
						lightnessShare: null,
						lightnessSign: null,
					},
					`arm-c-isoluminant-third-${hueThird}`,
				)
				armCIndex += 1
				placed = true
				break
			}
			if (!placed) {
				throw new Error(
					`arm C: no unused cover admits an isoluminant accent at ${target.toFixed(5)} on a ${wantRole} in ` +
						`band ${ACCENT_REAL_LIGHTNESS_BANDS[band].name}, hue third ${hueThird} (rung ${rung}). The ` +
						"design is infeasible against the remaining corpus; widen the band, not the tolerance.",
				)
			}
		}
	}

	// The non-isoluminant stratum: 8 per hue third — 2 distances × 2 lightness shares × 2 signs.
	let armCNonIsoIndex = 0
	for (let hueThird = 0; hueThird < ARM_C_HUE_THIRDS; hueThird++) {
		for (const target of ARM_C_NONISO_DISTANCES) {
			for (const share of ARM_C_NONISO_LIGHTNESS_SHARES) {
				for (const sign of ARM_C_NONISO_SIGNS) {
					// A field near the top of the lightness range cannot go much lighter and vice versa, so
					// the band is chosen to leave room for the sign rather than being fixed by a cell rule.
					const wantBand = sign > 0 ? [0, 1] : [1, 2]
					let placed = false
					for (const candidate of shuffledCandidates.filter(
						(entry) => !usedImages.has(entry.entry.artwork.imageId) && wantBand.includes(entry.band),
					)) {
						const roles = rolesOf(candidate.entry)
						const built = buildArmCAccent(candidate, target, hueThird, roles, random, { share, sign })
						if (built === null) continue
						pushAccentItem(
							`p4-c-non-${String(armCNonIsoIndex).padStart(2, "0")}`,
							"C",
							"arm-c-non-isoluminant",
							candidate,
							built.accent,
							roles,
							{
								stratum: "non-isoluminant",
								rung: null,
								targetDistance: target,
								hueThird,
								lightnessShare: share,
								lightnessSign: sign,
							},
							`arm-c-non-isoluminant-third-${hueThird}`,
						)
						armCNonIsoIndex += 1
						placed = true
						break
					}
					if (!placed) {
						throw new Error(
							`arm C: no unused cover admits a non-isoluminant accent at ${target.toFixed(5)}, lightness ` +
								`share ${share}, sign ${sign}, hue third ${hueThird}. Widen the band, not the tolerance.`,
						)
					}
				}
			}
		}
	}

	/* --- controls ------------------------------------------------------------------------------- */
	// Identity controls. `control-identical` is the same 8-bit colour twice — the check that says
	// whether "same colour?" is being answered at all. `control-obvious` is four bars apart, which is
	// round 3's multiple, and must come back "different".
	for (let n = 0; n < CONTROL_IDENTICAL_IDENTITY; n++) {
		const region = QUADRANTS[n % QUADRANTS.length]
		let sample = sampleInRegion(region, random)
		while (sample === null) sample = sampleInRegion(region, random)
		pushIdentityItem(
			`p4-control-identical-identity-${n}`,
			"control",
			"control-identical",
			sample.rgb,
			sample.rgb,
			{},
			"control-identical",
		)
	}
	for (let n = 0; n < CONTROL_OBVIOUS_IDENTITY; n++) {
		const region = QUADRANTS[(n + 2) % QUADRANTS.length]
		let built: { first: Rgb8; second: Rgb8 } | null = null
		for (let attempt = 0; attempt < 200_000 && built === null; attempt++) {
			const base = sampleInRegion(region, random)
			if (base === null) continue
			const bar = SAME_COLOR_BAR_BY_REGION[region]
			const second = displace(base.lab, random() < 0.5 ? "lightness" : "chroma", bar * OBVIOUS_BAR_MULTIPLE, random)
			if (okLabDistance(base.lab, rgbToOkLab(second)) < bar * OBVIOUS_BAR_MULTIPLE * 0.9) continue
			built = { first: base.rgb, second }
		}
		if (built === null) throw new Error(`no obvious identity control could be built in ${region}`)
		pushIdentityItem(
			`p4-control-obvious-identity-${n}`,
			"control",
			"control-obvious",
			built.first,
			built.second,
			{},
			"control-obvious",
		)
	}

	// Accent controls, on real covers in the mock — a control drawn as a patch pair would vouch for
	// attention to patch pairs, and half this round is not patch pairs.
	for (const direction of ["identical", "obvious"] as const) {
		const wanted = direction === "identical" ? CONTROL_IDENTICAL_ACCENT : CONTROL_OBVIOUS_ACCENT
		for (let n = 0; n < wanted; n++) {
			const candidate = takeCandidate({})[0]
			if (candidate === undefined) throw new Error("ran out of covers for the accent controls")
			const roles = rolesOf(candidate.entry)
			const field = hexToRgb(candidate.fieldHex as `#${string}`)
			const accent: Rgb8 =
				direction === "obvious" ? (rgbToOkLab(field)[0] < 0.5 ? [255, 255, 255] : [0, 0, 0]) : field
			pushAccentItem(
				`p4-control-${direction}-accent-${n}`,
				"control",
				direction === "identical" ? "control-identical" : "control-obvious",
				candidate,
				accent,
				roles,
				{
					stratum: "isoluminant",
					rung: null,
					targetDistance: null,
					hueThird: null,
					lightnessShare: null,
					lightnessSign: null,
				},
				`control-${direction}`,
			)
		}
	}

	/* --- silent repeats -------------------------------------------------------------------------- */
	// Drawn from the middle of each arm, where the answer is least certain. A repeat at an obvious
	// distance measures nothing.
	const repeatSources: Perception4TruthItem[] = []
	{
		const armA = truthItems.filter((item) => item.role === "arm-a")
		const armB = truthItems.filter(
			(item) => item.role === "arm-b" && item.identity!.rung! >= 3 && item.identity!.rung! <= 8,
		)
		const armC = truthItems.filter(
			(item) => item.role === "arm-c-isoluminant" && item.accent!.rung! >= 3 && item.accent!.rung! <= 8,
		)
		repeatSources.push(...shuffled(armA, random).slice(0, 2))
		repeatSources.push(...shuffled(armB, random).slice(0, REPEATS_IDENTITY - 2))
		repeatSources.push(...shuffled(armC, random).slice(0, REPEATS_ACCENT))
	}
	for (const [index, source] of repeatSources.entries()) {
		const sourcePage = pageItems.find((page) => page.questionKey === source.questionKey)
		const sourceItem = items.find((item) => item.itemId === source.itemId)
		if (sourcePage === undefined || sourceItem === undefined) throw new Error(`repeat source ${source.itemId} vanished`)
		const itemId = `p4-repeat-${String(index).padStart(2, "0")}`
		// A NEW question key, never the source's: `validateFixture` refuses a repeated
		// `(questionKey, imageId)` pair, and two answers filed under one key would collide.
		const questionKey = questionFor(source.kind)
		items.push({ ...sourceItem, itemId, questionKey, stratum: "repeat" })
		pageItems.push({ ...sourcePage, questionKey })
		truthItems.push({ ...source, itemId, questionKey, arm: "repeat", role: "repeat", repeatOf: source.itemId })
	}

	/* --- serve order ----------------------------------------------------------------------------- */
	// One fully shuffled pass. The two stimulus kinds are interleaved rather than blocked: a block of
	// forty patch pairs followed by sixty players would let a criterion drift settle in and stay, and
	// the round's declared risk is exactly that the reviewer answers one question under the other's
	// reading. Interleaved, every switch is announced by the stimulus itself.
	const repeatOf = new Map(truthItems.filter((item) => item.repeatOf !== null).map((item) => [item.itemId, item.repeatOf!]))
	const serveOrder = separateRepeats(shuffled(items.map((item) => item.itemId), random), repeatOf)

	const countRole = (role: Perception4Role): number => truthItems.filter((item) => item.role === role).length

	const fixture: OracleValidationFixture = {
		fixtureVersion: PERCEPTION_4_FIXTURE_VERSION,
		batchId,
		purpose: "oracle-validation",
		labelSchemaVersion: PERCEPTION_4_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/perception-4.ts",
		builtFrom: [ENDORSEMENTS_REF, ACCENT_REAL_FIXTURE_REF, PERCEPTION_MODEL_STUDY_REF],
		selection: {
			rule:
				"Arm A: 40 identity pairs placed where ICtCp x one global constant and the contract's OKLab " +
				"x four regional bars + Math.max make OPPOSITE same/different predictions, each rule clear of " +
				"its own threshold by at least 8% of that threshold, both colours inside one contract region, " +
				"20 where ICtCp says 'same' and 20 where OKLab does, 20 lightness-dominant and 20 " +
				"chroma-dominant. Arm B: 36 identity pairs, three pure-direction ladders (lightness, chroma, " +
				"hue) of 12 log-spaced rungs each, entirely inside dark-neutral, purity >= 0.9 on the achieved " +
				"8-bit pair. Arm C: 60 accents on real covers, 36 isoluminant on a 12-rung ladder crossed with " +
				"3 accent hue thirds and balanced on field lightness band and governing role, plus a SEPARATE " +
				"stratum of 24 deliberately non-isoluminant accents (2 distances x 2 lightness shares x 2 " +
				"signs x 3 hue thirds) which is never pooled with the ladder. Covers used by accent-real-1 are " +
				"excluded. Selection depends on colour geometry and the gamut, never on any answer. " +
				"Controls and repeats: 3 identical, 3 obvious, 6 silent repeats.",
			counts: {
				armA: countRole("arm-a"),
				armB: countRole("arm-b"),
				armCIsoluminant: countRole("arm-c-isoluminant"),
				armCNonIsoluminant: countRole("arm-c-non-isoluminant"),
				controlIdentical: countRole("control-identical"),
				controlObvious: countRole("control-obvious"),
				repeats: countRole("repeat"),
				identityItems: truthItems.filter((item) => item.kind === "identity").length,
				accentItems: truthItems.filter((item) => item.kind === "accent").length,
				total: truthItems.length,
				distinctCovers: usedImages.size,
				coversUnusedByAccentReal1: truthItems.filter(
					(item) => item.accent?.coverFreshness === "unused-by-accent-real-1",
				).length,
				coversReusedFromAccentReal1: truthItems.filter(
					(item) => item.accent?.coverFreshness === "reused-from-accent-real-1",
				).length,
			},
		},
		questions,
		items,
		serveOrder,
	}

	validateFixture(fixture)
	if (truthItems.length !== PERCEPTION_4_TOTAL_ITEMS) {
		throw new Error(`built ${truthItems.length} items, the design says ${PERCEPTION_4_TOTAL_ITEMS}`)
	}

	return {
		fixture,
		pageData: { batchId, items: pageItems },
		truth: {
			batchId,
			schema: "perception-round-4-truth/v1",
			generatedBy: "research/v3/src/review-server/perception-4.ts",
			builtFrom: [ENDORSEMENTS_REF, ACCENT_REAL_FIXTURE_REF, PERCEPTION_MODEL_STUDY_REF],
			preregistration: PERCEPTION_4_PREREGISTRATION_PATH,
			identityCriterion: PERCEPTION_4_IDENTITY_CRITERION,
			functionalCriterion: PERCEPTION_4_FUNCTIONAL_CRITERION,
			identityQuestion: IDENTITY_PROMPT.question,
			identityInstruction: IDENTITY_PROMPT.instruction,
			accentQuestion: ACCENT_PROMPT.question,
			accentInstruction: ACCENT_PROMPT.instruction,
			accentClarification: ACCENT_CLARIFICATION,
			ictcpThreshold,
			okLabBars: SAME_COLOR_BAR_BY_REGION,
			armBPriorBars: ARM_B_PRIOR_BARS,
			items: truthItems,
		},
	}
}

export function serializeFixture(fixture: OracleValidationFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}

/* ------------------------------------------------------------------------------------------- */
/* Push                                                                                          */
/* ------------------------------------------------------------------------------------------- */

export const PERCEPTION_4_FUNDED_BY: readonly string[] = [
	"PERCEPTION_MODEL_STUDY.md PART 2 — 'Proposed round 4 — the shape round', 148 items in three arms " +
		"plus 12 controls/repeats, sized by simulation in perception-model-round-design.ts",
	"finding 2 — ICtCp x one global constant scores 0.4913 against the incumbent four-bar OKLab rule's " +
		"0.5743 (+0.0830, CI [0.0174, 0.1461], raw p = 0.023) and does NOT survive Holm over the family " +
		"of 144. Arm A is designed to settle that decisively rather than leave it uncorrected",
	"finding 4 — the leader is separable from only 16 of 47 rivals; parsimony, not the minimum of the " +
		"table, has to decide, and arm A asks the parsimony question directly",
	"bracketing-round-3 returned anisotropy-confounded: lightness-dominant pairs read 'same' 15/21 and " +
		"chroma-dominant 2/21 (exact p = 0.00022) at matched OKLab distances. Arm B measures the ratio " +
		"instead of inferring it",
	"accent-real-1 was refused as stratum-dependent: pooled 0.18630, CI [0.14052, 0.24700], against " +
		"hue-third 0 at 0.13417 and hue-third 2 at 0.26385. Arm C re-asks at 12 per third",
	"PERCEPTION_MODEL_STUDY.md PART 2 gap map — every functional-real lightness cell is EMPTY, and the " +
		"emptiness is structural: accent-real-1 constructs every accent isoluminant with its field, so " +
		"the lightness axis is not merely unmeasured but unmeasurable from the existing data. Arm C's " +
		"non-isoluminant stratum is the first sample ever taken on it",
	`identity question and instruction: byte-identical to PART_PROMPTS["same-color"], asserted against ${
		"bracketing-round-3.json"
	} by the generator itself`,
	"accent question: accent-real-1's wording, extended by the chat clarification that governed its " +
		"scored answers — declared as an extension, not presented as byte-identical",
	"NOT measured here: the P1 excursion bar's 2.5x multiplier. This round selects the metric; the " +
		"excursion magnitude needs ramp stimuli and its own round",
	`Pre-registered design, construction, gates, fitting plan and refusal conditions: ${PERCEPTION_4_PREREGISTRATION_PATH}`,
]

export async function pushPerception4Round(
	base: string,
	fixturePath = PERCEPTION_4_FIXTURE_PATH,
	fundedBy: readonly string[] = PERCEPTION_4_FUNDED_BY,
): Promise<{ status: number; body: unknown }> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const response = await fetch(`${base}/api/oracle-validation`, {
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
		const result = await pushPerception4Round(values.push)
		console.log(result.status, JSON.stringify(result.body))
		process.exit(result.status === 201 ? 0 : 1)
	}
	const { fixture, pageData, truth } = await buildPerception4Fixture()
	if (values.write) {
		await writeFile(PERCEPTION_4_FIXTURE_PATH, serializeFixture(fixture), "utf8")
		await writeFile(PERCEPTION_4_PAGE_DATA_PATH, `${JSON.stringify(pageData, null, "\t")}\n`, "utf8")
		await writeFile(PERCEPTION_4_TRUTH_PATH, `${JSON.stringify(truth, null, "\t")}\n`, "utf8")
		console.log(`wrote ${PERCEPTION_4_FIXTURE_PATH} — ${fixture.items.length} items`)
		console.log(`wrote ${PERCEPTION_4_PAGE_DATA_PATH}`)
		console.log(`wrote ${PERCEPTION_4_TRUTH_PATH}`)
	} else {
		console.log(`${fixture.items.length} items:`, fixture.selection.counts)
		console.log(`ictcp threshold ${truth.ictcpThreshold.toFixed(6)}`)
		for (const item of truth.items) {
			if (item.identity !== null) {
				const id = item.identity
				console.log(
					`${item.itemId.padEnd(28)} ${item.role.padEnd(22)} ${id.region.padEnd(16)}` +
						` d=${id.okLabDistance.toFixed(5)} bar=${(id.rules?.okLabBar ?? 0).toFixed(5)}` +
						` dI=${(id.rules?.ictcpDistance ?? 0).toFixed(5)} dom=${id.dominantDirection}/${id.dominance.toFixed(2)}` +
						` ${id.disagreement ?? id.ladderDirection ?? ""}`,
				)
			} else {
				const ac = item.accent!
				console.log(
					`${item.itemId.padEnd(28)} ${item.role.padEnd(22)} ${ac.stratum.padEnd(16)}` +
						` d=${ac.governing.okLabDistance.toFixed(5)} target=${ac.targetDistance?.toFixed(5) ?? "  —    "}` +
						` dY=${ac.governing.deltaApcaY.toFixed(5)} Lc=${ac.governing.apcaLc.toFixed(1)}` +
						` third=${ac.hueThird ?? "—"} band=${ac.band ?? "—"}`,
				)
			}
		}
	}
}
