/**
 * The **real-stimulus** accent functional-visibility round — fixture generation.
 *
 * ## Why a second round exists at all
 *
 * `accent-functional-1` ran cleanly and refused its own fit. Its analysis is in
 * `data/calibration/accent-functional-round-1-preregistration.md` §8: verdict `contradicts-retraction`,
 * pooled threshold **0.04554**, the four pixel-identical anchors came back **4/4 on the diagonal**, and
 * 28 of 31 stimuli carrying *exactly zero* luminance contrast were called working accents.
 *
 * On the **same day**, shown a real cover, the reviewer called an accent at OKLab distance **0.121**
 * — roughly twice the distance of the synthetic ones — *"unreadable"*
 * (`d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`, verbatim: *"item 2:
 * accent on surface *is unreadable*"*).
 *
 * `d-2026-08-04-accent-calibration-is-a-stimulus-realism-problem` reconciles the two positions and
 * commissions this round:
 *
 * > *"THE DIAGNOSIS IS THE STIMULUS, NOT THE WORDING AND NOT THE CRITERION. Synthetic flat-field
 * > panels flatter isoluminant accents … THE RECALIBRATION ROUND IS REBUILT ON REAL COVERS — a mock
 * > player over real artwork surfaces, with a few synthetic anchors retained SOLELY to measure the
 * > lab-versus-real gap."*
 *
 * That decision also records what it does **not** know, and this file is written against those
 * caveats rather than around them. Its fourth caveat is the brief:
 *
 * > *"'Real covers' is not yet a specification. Which covers, how many, stratified how, and what the
 * > mock player looks like are all undecided, and a badly drawn mock player is just another synthetic
 * > stimulus with more pixels."*
 *
 * ## The one structural fact that shapes everything below
 *
 * The pinned mock (`review-ui/mock.js`, layout revision 3) places the accent in **nine elements
 * across three different fields**:
 *
 * | placement | elements | the colour underneath |
 * |---|---|---|
 * | top icons + bottom transport | 5 | `side.fieldCss` |
 * | the surface card's icons | 2 | `roles.surface` |
 * | the two progress-rail fills | 2 | `roles.background` |
 *
 * **No single colour can be isoluminant to all three of them**, and on a real palette they are far
 * apart by construction — invariant 4 forces background and surface to carry contrast. So "an
 * isoluminant accent at a controlled distance" is not a property an item can have globally. It is a
 * property of **one accent-field pair**, and the item must name which.
 *
 * That is not a compromise forced by the mock; it is what the constant already is. The escape rule is
 * `escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE`
 * (`src/review-server/endorsement-recheck.ts:289`) and it is evaluated **per pair** — accent against
 * background, accent against surface, accent against each gradient stop. The Sunshine case is exactly
 * one such pair: `#fac751` against the surface `#d5cebe`, OKLab **0.12117**, APCA **Lc 0.000**. The
 * reviewer condemned it *even though that same accent has |Lc| 76 against the black background rail
 * two centimetres lower on the same screen*. The weak pair decided the verdict. So the governing pair
 * is the right unit, and the reviewer has already demonstrated they judge it that way.
 *
 * Every item therefore carries a **governing field role** — `surface` or `background` — and the
 * ladder's controlled quantity is the OKLab distance across *that* pair. The other placements are not
 * hidden: `truth.placementProfile` records |APCA raw|, Lc and OKLab distance for the accent against
 * every field it touches, so the analysis can say exactly how much contrast was available elsewhere.
 *
 * ## The field is rendered flat, and that is a deviation with a reason
 *
 * `fieldCss` is the background hex and nothing else, exactly as `endorsement-recheck.ts:402` does it.
 * Two reasons, and the second is the load-bearing one:
 *
 * 1. An accent **cannot** be isoluminant to a ramp. A gradient field has a different luminance under
 *    the top icons than under the bottom ones, so a gradient item could not carry a controlled
 *    distance at all — it would be an uncontrolled stimulus wearing a ladder's label.
 * 2. **The Sunshine item's prior verdict was given on a flat render.** `endorsement-recheck-1` showed
 *    that palette flat (its `gradientNote` says so in as many words) and *that* is the stimulus the
 *    reviewer called unreadable. Re-rendering it with a ramp would mean the one item with a known
 *    prior answer no longer replays the thing that was answered.
 *
 * Recorded as a scope limit rather than buried: **this round says nothing about accents on gradient
 * stops.** The contract checks that pair too, and it is not in this fixture.
 *
 * ## Everything is deterministic from `ACCENT_REAL_SEED`
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/accent-real.ts --write
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import {
	apcaLc,
	apcaRaw,
	hexToRgb,
	okLabDistance,
	okLabToRgb,
	rgbToApcaY,
	rgbToHex,
	rgbToOkLab,
} from "../contract/color.ts"
import { APCA_RAW_IDENTICAL_CEILING } from "../contract/constants.ts"
import type { OkLab, Rgb8 } from "../contract/types.ts"
import { nameHexes } from "./color.ts"
import { HUE_THIRD_BOUNDARIES_DEGREES, hueThirdOf, logLadder, PART2_MAX_DELTA_Y } from "./bracketing.ts"
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

export const ACCENT_REAL_BATCH_ID = "accent-real-1"

/**
 * Its own schema version, and that is what routes the round to its own page.
 *
 * `batchReviewPaths` decides the review page from the schema, never from `kind` alone — four of five
 * released oracle rounds once shipped links to a page that could not draw them, because `kind` cannot
 * tell two instruments apart (`server.ts:323`). This round draws a mock player and a synthetic panel;
 * `/oracle` can draw neither.
 */
export const ACCENT_REAL_LABEL_SCHEMA_VERSION = "accent-real.v1"

/**
 * Reused verbatim rather than bumped, exactly as `accent-functional.ts` reuses `color-bracketing-1`.
 *
 * The *shapes* in this fixture are exactly `OracleValidationFixture`/`OracleValidationItem` — this
 * round adds no field and removes none — and `pushOracleValidation` rejects any other version
 * outright (`server.ts:1469`). A new version string would buy nothing and would lock the round out of
 * the machinery it is meant to reuse. What distinguishes this round is
 * `ACCENT_REAL_LABEL_SCHEMA_VERSION`, which is what `batchReviewPaths` routes on.
 */
export const ACCENT_REAL_FIXTURE_VERSION = PREMISE_DISAMBIGUATION_FIXTURE_VERSION

/** Distinct from every earlier round's seed, so no two fixtures share a draw. */
export const ACCENT_REAL_SEED = 20260804_2

/**
 * The criterion of record, travelling with the answers.
 *
 * Byte-identical in intent to `accent-functional-1`'s, with the stimulus family named. The *question*
 * and *instruction* below are byte-identical to round 1's — see `ACCENT_REAL_PROMPT`.
 */
export const ACCENT_REAL_CRITERION =
	"functional-visibility on real stimuli — does this work as an accent at a glance; the same " +
	"criterion and the same wording as accent-functional-1, asked of the whole mock player over a " +
	"real cover instead of a synthetic flat panel"

/* ------------------------------------------------------------------------------------------- */
/* The wording — byte-identical to round 1, and that is the whole bridge                          */
/* ------------------------------------------------------------------------------------------- */

/**
 * **Not one character differs from `accent-functional-1`.**
 *
 * This is the single most important line in the file. The anchors (§ `ANCHOR_SOURCE_ITEM_IDS`) are
 * pixel-identical replays of round 1's panels, and they measure the **lab-versus-real gap**. That
 * measurement only holds if *everything except the stimulus* is held constant — so the question, the
 * instruction and the criterion reading are carried across verbatim. Adding a clause like "judge the
 * accent among the content" would improve the round's prose and destroy its instrument: any anchor
 * difference would then be attributable to wording, which is the confound the anchors exist to
 * exclude, and round 1 already spent its own §4 refusing exactly this trade in the other direction.
 *
 * Source: `accent-functional.ts` `ACCENT_FUNCTIONAL_PROMPTS["accent-visible"]`, and the reviewer's own
 * phrase from the constant's provenance tag — *"does this work as an accent at a glance"*.
 */
export const ACCENT_REAL_PROMPT = {
	question: "Does this work as an accent at a glance?",
	instruction:
		"Not \"can you see the difference\" — assume you can. At a glance, without hunting: is this colour " +
		"doing an accent's job here — does it pick these elements out as something the eye lands on? " +
		"If you only find it by looking for it, or it reads as a difference rather than as an accent, answer no.",
} as const

/**
 * **One question object per item, all of them carrying the identical wording above.**
 *
 * This looks redundant and is not optional. `validateFixture` refuses a fixture that asks the same
 * `(questionKey, imageId)` twice (`oracle-validation.ts`), and this round asks the same question of
 * the same cover more than once by design — every repeat does, and the six anchors carry a cover
 * reference they never render. A single shared key would make the fixture unpushable. It is also the
 * shape `dropped-colors` and `endorsement-recheck` already use, and it is what lets the page join its
 * render side-car per item.
 *
 * **The key is an opaque seeded slug, never an index.** `accent_real_00` in generation order would
 * spell out the ladder: item 00 would be the lowest rung, and the side-car is a static file the
 * browser can read in full. The slug carries no rung, no cover, no stratum and no distance.
 */
const questionKeyFor = (slug: string): string => `accent_real_${slug}`

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

/**
 * The answers. Two substantive plus the escape.
 *
 * The escape is not optional: REVIEW_UI.md §4, added 2026-08-04 — *"A forced choice must have
 * somewhere to put 'I can't tell'"*, from the reviewer's own *"answers for those cases are not
 * reliable (even with human feedback) unless we add an escape answer choice"*. Its share is a
 * first-class result reported per stratum, never subtracted.
 *
 * **This is the one respect in which the anchors are not a perfect replay, and it is declared rather
 * than smoothed over.** Round 1 offered yes/no and nothing else; the escape rule landed after it. So
 * an anchor answered `cant_tell` here has no counterpart in round 1's two-valued record. The
 * pre-registration handles that by excluding escapes from the anchor 2×2 and reporting the count,
 * rather than by folding them into either column.
 */
export const ACCENT_REAL_ANSWERS = [
	{
		key: "works",
		label: "yes — it works as an accent",
		gloss: "at a glance, it picks these elements out",
		hotkey: "1",
	},
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

/* ------------------------------------------------------------------------------------------- */
/* The ladder and the strata                                                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The span, unchanged from round 1 — and deliberately **not** narrowed to round 1's "informative
 * region below 0.075".
 *
 * Round 1's §8.8 advised concentrating a repair round's rungs in 0.04–0.10. That advice was written
 * before the realism diagnosis and it is **explicitly not followed**, because the diagnosis says the
 * synthetic answers located the threshold on the wrong surface. The real-cover evidence points the
 * other way: 0.121 was called unreadable, so the informative region on real stimuli plausibly sits
 * *above* the placeholder 0.14591, not below 0.075. A ladder concentrated at 0.04–0.10 could not see
 * that, and a round that cannot represent the outcome its own commissioning decision predicts is not
 * an experiment. The span brackets 0.04554 (round 1's fit), 0.12117 (Sunshine), 0.14591 (the
 * placeholder) and 0.24181 (the rung the reviewer endorses and has not retracted).
 */
export const ACCENT_REAL_LADDER_MIN = 0.06
export const ACCENT_REAL_LADDER_MAX = 0.3
export const ACCENT_REAL_LADDER_STEPS = 10
export const ACCENT_REAL_ITEMS_PER_RUNG = 3

/** Lightness bands of the **governing field** colour, in OKLab L. */
export const ACCENT_REAL_LIGHTNESS_BANDS = [
	{ name: "dark", low: 0, high: 0.5 },
	{ name: "mid", low: 0.5, high: 0.7 },
	{ name: "light", low: 0.7, high: 1.0001 },
] as const

/** The two field roles the mock actually puts an accent on. Gradient stops are out of scope. */
export const ACCENT_REAL_GOVERNING_ROLES = ["surface", "background"] as const
export type GoverningRole = (typeof ACCENT_REAL_GOVERNING_ROLES)[number]

/**
 * How far an achieved 8-bit distance may sit from its ladder target, as a fraction of the target.
 *
 * Round 1's value. The fit uses the **achieved** distance regardless — the tolerance only keeps the
 * ladder from bunching up.
 */
export const ACCENT_REAL_TARGET_TOLERANCE = 0.06

/**
 * The isoluminance budget, carried unchanged from round 1 so the two rounds' stimuli are the same
 * kind of object.
 *
 * - `PART2_MAX_DELTA_Y` = 0.0025 — the largest APCA-Y difference an item may carry.
 * - `APCA_RAW_IDENTICAL_CEILING` = 1.98152 — the |raw APCA| two *literally identical* colours already
 *   produce. Staying under it is what makes `apcaLc` come out at exactly **0**.
 *
 * Both are checked on the **final 8-bit pair**, after rounding, never on the ideal one.
 */
export const ACCENT_REAL_MAX_DELTA_Y = PART2_MAX_DELTA_Y
export const ACCENT_REAL_MAX_APCA_RAW = APCA_RAW_IDENTICAL_CEILING

/**
 * The constructed accent must stay clear of the palette's own foreground.
 *
 * Otherwise an item could be answered "no" because the accent had become a second foreground, which
 * is a different failure with its own open question (B31, the foreground↔accent bar). 0.07444 is the
 * separation floor in force.
 */
export const ACCENT_REAL_MIN_FOREGROUND_DISTANCE = 0.07444

/** How far a constructed OKLab point may move under 8-bit rounding before it counts as clipped. */
const GAMUT_ROUND_TRIP_TOLERANCE = 0.01

/** Draw budget per item before the search gives up. */
const MAX_ATTEMPTS = 20_000

/* ------------------------------------------------------------------------------------------- */
/* Paths                                                                                         */
/* ------------------------------------------------------------------------------------------- */

const ENDORSEMENTS_REF = "research/v3/data/legacy/endorsements.json"
const ENDORSEMENTS_PATH = fileURLToPath(new URL("../../data/legacy/endorsements.json", import.meta.url))
const ROUND_1_FIXTURE_REF = "research/v3/data/calibration/accent-functional-round-1.json"
const ROUND_1_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/accent-functional-round-1.json", import.meta.url),
)

export const ACCENT_REAL_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/calibration/accent-real-round-1.json", import.meta.url),
)
/** Render data, served to the browser. **Carries no truth** — see `buildFixture`. */
export const ACCENT_REAL_PAGE_DATA_PATH = fileURLToPath(new URL("../../review-ui/accent-real-1.data.json", import.meta.url))
/** The truth, read only by the analyzer. **Never served.** */
export const ACCENT_REAL_TRUTH_PATH = fileURLToPath(
	new URL("../../data/calibration/accent-real-round-1-truth.json", import.meta.url),
)

/* ------------------------------------------------------------------------------------------- */
/* The Sunshine case — the one item with a known prior verdict                                   */
/* ------------------------------------------------------------------------------------------- */

/**
 * `22e959d5164750bd` — Sunshine `#fac751` on Beige `#d5cebe`, OKLab **0.12117**, APCA **Lc 0.000**.
 *
 * The motivating real example, carried **unmodified**: its real palette, its real accent, no
 * construction of any kind. It is the only item in this round whose answer is already known — the
 * reviewer ruled *"item 2: accent on surface *is unreadable*"* in chat on 2026-08-04, retiring the
 * endorsement.
 *
 * **Using a retired endorsement as a stimulus is not counting it as evidence.** The retirement
 * (`d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`) says *"NO CONSUMER
 * MAY COUNT A MATCH TO THEM AS A WIN"* — it removes evidence *for* the palette. This round does not
 * match anything to it or score anything by it; it re-shows the reviewer a stimulus they have
 * already judged, which is the opposite of treating it as a win.
 *
 * It is **never pooled into the fit**. It is a bridge measurement: one real accent, one known answer,
 * one chance to see whether the answer reproduces when the same pixels come back inside a ladder.
 */
export const SUNSHINE_ENTRY_ID = "22e959d5164750bd"
export const SUNSHINE_EXPECTED_DISTANCE = 0.12117
export const SUNSHINE_PRIOR_VERDICT = "does_not_work"
export const SUNSHINE_PRIOR_VERDICT_SOURCE =
	"d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired — reviewer, in " +
	"conversation: \"item 2: accent on surface *is unreadable*\""
const SUNSHINE_DISTANCE_TOLERANCE = 5e-5

/* ------------------------------------------------------------------------------------------- */
/* The anchors — round 1's own panels, replayed pixel for pixel                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * Six of `accent-functional-1`'s panels, replayed **unchanged**, drawn by the **same renderer**.
 *
 * `review-ui/accent-panel.js` is `bracketing.js`'s own `renderAccent()`, lifted into a module that
 * both pages import — so this is one renderer with two callers, not a copy. Same three shapes, same
 * classes, same `styles.css` rules, same colours. Nothing about the panel changed.
 *
 * **They are chosen on DISTANCE, never on their round-1 answer.** Selecting anchors by how they were
 * answered would be selection on the outcome, and the whole point of the bridge is that it is an
 * unbiased paired comparison. The rule, fixed here: take the round-1 ladder item whose achieved
 * distance is nearest each of the six probe distances below, and refuse duplicates.
 *
 * The probes span the ladder rather than clustering at the crux, because the quantity wanted is a
 * *curve* — how much the answers move between lab and real, at each distance — and a bridge measured
 * at one rung cannot show a shift that varies with distance.
 */
export const ANCHOR_PROBE_DISTANCES = [0.06, 0.09, 0.12, 0.15, 0.2, 0.28] as const
export const ANCHOR_SOURCE_BATCH_ID = "accent-functional-1"

/* ------------------------------------------------------------------------------------------- */
/* Controls and repeats                                                                          */
/* ------------------------------------------------------------------------------------------- */

/**
 * Controls are built on **real covers**, in the mock, like everything else.
 *
 * A control rendered as a synthetic panel would prove the reviewer was attending to *panels*, which
 * is not the pass this round needs vouched for. `control-obvious` replaces the accent with a colour
 * that is plainly working against its governing field (a large, deliberately luminance-contrasting
 * choice) and must be answered **yes**. `control-identical` sets the accent to *exactly* the
 * governing field colour, so the accent elements disappear into it, and must be answered **no**.
 */
const CONTROL_COUNT_PER_DIRECTION = 2

/** Repeats measure the reviewer's own answer noise. Drawn from the middle rungs. */
const REPEAT_COUNT = 4
const REPEAT_RUNG_RANGE = { low: 2, high: 7 } as const
const MIN_REPEAT_SEPARATION = 12

/* ------------------------------------------------------------------------------------------- */
/* Endorsement reading                                                                           */
/* ------------------------------------------------------------------------------------------- */

type EndorsementRole = Readonly<{ hex: string; rgb: readonly number[]; name: string }>

export type EndorsementEntry = Readonly<{
	entryId: string
	kind: string
	artwork: Readonly<{
		imagePath: string
		absolutePath: string
		contentSha256: string
		rendition: Readonly<{ format: string; width: number; height: number }>
		imageId: string
	}>
	palette: Readonly<{ completeness: string; roles: Readonly<Record<string, EndorsementRole>>; gradient?: boolean }>
	roleSignature: string
}>

export async function readEndorsements(): Promise<readonly EndorsementEntry[]> {
	const parsed = JSON.parse(await readFile(ENDORSEMENTS_PATH, "utf8")) as { entries: EndorsementEntry[] }
	return parsed.entries.filter((entry) => entry.palette.completeness === "full")
}

/* ------------------------------------------------------------------------------------------- */
/* Isoluminant construction — the heart of the round                                             */
/*                                                                                               */
/* `equalLuminanceAccent`, `measurePair`, `placementProfile`, `mockPageItem`, `oracleItem` and    */
/* `readEndorsements` are EXPORTED rather than module-private because `perception-4.ts` builds    */
/* its accent arm out of them. That is deliberate and it is the cheaper of the two options: this  */
/* file already re-states `accent-functional.ts`'s solver "arithmetic for arithmetic" and pays    */
/* for it with a paragraph explaining why the copy is safe. A THIRD copy would need a third such  */
/* paragraph and would be a third thing to keep in step — and round 4's whole claim is that its   */
/* accent items are the same KIND of object as this round's, which only holds if they come off    */
/* the same arithmetic. Exporting changes no behaviour here.                                     */
/* ------------------------------------------------------------------------------------------- */

function chromaOf(lab: OkLab): number {
	return Math.hypot(lab[1], lab[2])
}

/**
 * Find an 8-bit colour at (as near as possible) the same APCA luminance as `field`, displaced by
 * `target` in the OKLab (a, b) plane at `angle`.
 *
 * **This is `accent-functional.ts`'s `equalLuminanceAccent`, arithmetic for arithmetic.** It is
 * re-stated rather than imported because that one is module-private, and it is deliberately *not* a
 * behaviour change: the six anchors were produced by this arithmetic, and a real item constructed by
 * different arithmetic would not be the same kind of stimulus as the panel it is being compared with.
 *
 * Lightness is **solved for, not chosen**: moving in chroma alone changes Y, so L is bisected until
 * APCA's Y matches the field's. What survives 8-bit rounding is then measured, never assumed.
 */
export function equalLuminanceAccent(field: Rgb8, target: number, angle: number): Rgb8 | null {
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
	if (best === null || bestDelta > ACCENT_REAL_MAX_DELTA_Y) return null
	if (Math.abs(apcaRaw(best, field)) > ACCENT_REAL_MAX_APCA_RAW) return null
	// The bisection can land on the field itself at very small targets; that is a control, not a rung.
	if (best[0] === field[0] && best[1] === field[1] && best[2] === field[2]) return null
	// A point that had to be clamped into gamut is not at the distance it was asked for.
	const ideal: OkLab = [rgbToOkLab(best)[0], a, b]
	if (okLabDistance(rgbToOkLab(best), ideal) > GAMUT_ROUND_TRIP_TOLERANCE) return null
	return best
}

/**
 * One accent-field pair's measurements, in the units the analysis reports.
 *
 * `okLabDistance` here is the **governing** distance — the controlled variable. Everything else is
 * description.
 */
export type PairTruth = Readonly<{
	fieldRole: string
	fieldHex: string
	okLabDistance: number
	chromaDistance: number
	apcaRaw: number
	apcaLc: number
	deltaApcaY: number
	identical: boolean
}>

export function measurePair(fieldRole: string, field: Rgb8, accent: Rgb8): PairTruth {
	const fieldLab = rgbToOkLab(field)
	const accentLab = rgbToOkLab(accent)
	return {
		fieldRole,
		fieldHex: rgbToHex(field),
		okLabDistance: okLabDistance(fieldLab, accentLab),
		chromaDistance: Math.hypot(accentLab[1] - fieldLab[1], accentLab[2] - fieldLab[2]),
		apcaRaw: apcaRaw(accent, field),
		apcaLc: apcaLc(accent, field),
		deltaApcaY: rgbToApcaY(accent) - rgbToApcaY(field),
		identical: field[0] === accent[0] && field[1] === accent[1] && field[2] === accent[2],
	}
}

/**
 * Every field the accent actually touches in the mock, with how many elements sit on each.
 *
 * The counts come from reading `mock.js` `renderMock()`, and the test
 * `accent-real-placements.test.ts` re-derives them from the rendered DOM so this table cannot drift
 * away from the renderer it describes.
 */
export const MOCK_ACCENT_PLACEMENTS = [
	{ fieldRole: "field", elements: 5, what: "two top icons and the three-icon bottom transport, on side.fieldCss" },
	{ fieldRole: "surface", elements: 2, what: "the surface card's play and bars icons" },
	{ fieldRole: "background", elements: 2, what: "the two progress-rail fills, on a background-coloured track" },
] as const

export function placementProfile(
	roles: Readonly<Record<string, string>>,
	accent: Rgb8,
): readonly PairTruth[] {
	// The field is rendered flat, so `field` and `background` are the same colour — both are reported
	// anyway, because the two are different placements and a later gradient round will make them differ.
	return ["field", "surface", "background", "foreground"].map((role) => {
		const hex = role === "field" ? roles.background : roles[role]
		return measurePair(role, hexToRgb(hex as `#${string}`), accent)
	})
}

/* ------------------------------------------------------------------------------------------- */
/* The design: which cell each item belongs to                                                   */
/* ------------------------------------------------------------------------------------------- */

/**
 * Rung `i`, slot `j` → its cell. Pre-registered, and asserted rather than trusted.
 *
 * - `band = (i + j) mod 3` — **every rung covers all three lightness bands exactly once**, so field
 *   lightness can never be confounded with distance.
 * - `hueThird = (i + 2j) mod 3` — likewise for the accent's hue direction: `2j mod 3` is
 *   `{0, 2, 1}`, all distinct, so **every rung covers all three hue thirds exactly once**.
 * - `role = (i + (j === 1 ? 1 : 0)) mod 2` — each rung carries **both** governing roles (two of one,
 *   one of the other, alternating with rung parity), and over ten rungs the split is exactly 15/15.
 *
 * Band and hue are balanced *within* every rung, which is what protects the ladder. Governing role
 * cannot also be balanced within a rung of three, so it is balanced across the round and reported as
 * a cross-tab; `assertBalanced()` checks all four properties.
 */
export function cellFor(rung: number, slot: number): { band: number; hueThird: number; role: GoverningRole } {
	return {
		band: (rung + slot) % 3,
		hueThird: (rung + 2 * slot) % 3,
		role: ACCENT_REAL_GOVERNING_ROLES[(rung + (slot === 1 ? 1 : 0)) % 2],
	}
}

function assertBalanced(): void {
	const bandUse = [0, 0, 0]
	const hueUse = [0, 0, 0]
	const roleUse = new Map<string, number>()
	for (let rung = 0; rung < ACCENT_REAL_LADDER_STEPS; rung++) {
		const bands = new Set<number>()
		const hues = new Set<number>()
		const roles = new Set<string>()
		for (let slot = 0; slot < ACCENT_REAL_ITEMS_PER_RUNG; slot++) {
			const cell = cellFor(rung, slot)
			bands.add(cell.band)
			hues.add(cell.hueThird)
			roles.add(cell.role)
			bandUse[cell.band] += 1
			hueUse[cell.hueThird] += 1
			roleUse.set(cell.role, (roleUse.get(cell.role) ?? 0) + 1)
		}
		if (bands.size !== 3) throw new Error(`rung ${rung} does not cover all three lightness bands`)
		if (hues.size !== 3) throw new Error(`rung ${rung} does not cover all three hue thirds`)
		if (roles.size !== 2) throw new Error(`rung ${rung} does not carry both governing roles`)
	}
	if (bandUse.some((count) => count !== 10)) throw new Error(`lightness bands are not balanced: ${bandUse.join(",")}`)
	if (hueUse.some((count) => count !== 10)) throw new Error(`hue thirds are not balanced: ${hueUse.join(",")}`)
	for (const role of ACCENT_REAL_GOVERNING_ROLES) {
		if (roleUse.get(role) !== 15) throw new Error(`governing role ${role} used ${roleUse.get(role)} times, expected 15`)
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Item shapes                                                                                   */
/* ------------------------------------------------------------------------------------------- */

export type AccentRealRole = "ladder" | "anchor" | "sunshine" | "control-obvious" | "control-identical" | "repeat"

/** What the page needs to DRAW one item. Served to the browser; carries no truth. */
export type AccentRealPageItem = Readonly<{
	questionKey: string
	stimulus: "mock" | "panel"
	/** `mock` items only: the palette in `mock.js`'s side shape, accent already substituted. */
	side?: Readonly<{
		roles: readonly Readonly<{ role: string; hex: string; name: string; collapsed: boolean }>[]
		gradient: null
		fieldCss: string
	}>
	/** `panel` items only: the flat field and the accent, exactly as round 1 drew them. */
	panel?: Readonly<{ fieldHex: string; accentHex: string }>
}>

/** What the ANALYZER needs. Never served — `accent-real-round-1-truth.json`. */
export type AccentRealTruthItem = Readonly<{
	itemId: string
	questionKey: string
	role: AccentRealRole
	stimulus: "mock" | "panel"
	/** `null` on anchors, controls and the Sunshine item — they sit on no rung. */
	rung: number | null
	targetDistance: number | null
	governingRole: string
	band: string | null
	hueThird: number | null
	entryId: string | null
	imageId: string | null
	accentHex: string
	originalAccentHex: string | null
	/** The controlled quantity: the accent against its governing field. */
	governing: PairTruth
	/** Every field the accent touches, so nothing about the other placements is hidden. */
	placementProfile: readonly PairTruth[]
	/** Anchors only: the round-1 item these pixels come from. */
	replays: string | null
	/** Repeats only. */
	repeatOf: string | null
}>

/* ------------------------------------------------------------------------------------------- */
/* Build                                                                                         */
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

const bandOf = (lightness: number): number =>
	ACCENT_REAL_LIGHTNESS_BANDS.findIndex((band) => lightness >= band.low && lightness < band.high)

type Candidate = Readonly<{ entry: EndorsementEntry; role: GoverningRole; fieldHex: string; lightness: number; band: number }>

/**
 * Try to build an isoluminant accent for one candidate at one rung, in one hue third.
 *
 * The hue third is the accent's, re-derived from the **finished 8-bit accent** and used as a
 * rejection criterion rather than assumed — 8-bit rounding can tip a colour across a boundary, and a
 * stratum label that does not survive rounding is a label about the intent rather than the stimulus.
 */
function buildAccent(
	candidate: Candidate,
	target: number,
	hueThird: number,
	roles: Readonly<Record<string, string>>,
	random: () => number,
): { accent: Rgb8; achieved: number } | null {
	const field = hexToRgb(candidate.fieldHex as `#${string}`)
	const foreground = hexToRgb(roles.foreground as `#${string}`)
	const thirdWidth = (Math.PI * 2) / HUE_THIRD_BOUNDARIES_DEGREES.length
	const inset = thirdWidth * 0.08
	let best: { accent: Rgb8; achieved: number } | null = null
	let bestError = Infinity

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const theta = hueThird * thirdWidth + inset + random() * (thirdWidth - 2 * inset)
		const accent = equalLuminanceAccent(field, target, theta)
		if (accent === null) continue
		const accentLab = rgbToOkLab(accent)
		if (hueThirdOf(accentLab) !== hueThird) continue
		// A near-neutral accent has no meaningful hue, so its "hue third" would be rounding noise.
		if (chromaOf(accentLab) < 0.02) continue
		// It must not become a second foreground — that is a different failure (B31), not this one.
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

export type AccentRealBuild = Readonly<{
	fixture: OracleValidationFixture
	pageData: { batchId: string; items: readonly AccentRealPageItem[] }
	truth: {
		batchId: string
		schema: string
		generatedBy: string
		builtFrom: readonly string[]
		criterion: string
		question: string
		instruction: string
		placements: typeof MOCK_ACCENT_PLACEMENTS
		items: readonly AccentRealTruthItem[]
	}
}>

export async function buildAccentRealFixture(
	batchId = ACCENT_REAL_BATCH_ID,
	seed = ACCENT_REAL_SEED,
): Promise<AccentRealBuild> {
	assertBalanced()
	const random = mulberry32(seed)
	const endorsements = await readEndorsements()
	const round1 = JSON.parse(await readFile(ROUND_1_FIXTURE_PATH, "utf8")) as {
		items: readonly {
			itemId: string
			role: string
			first: readonly number[]
			second: readonly number[]
			firstHex: string
			secondHex: string
			truth: { okLabDistance: number }
		}[]
	}

	const items: OracleValidationItem[] = []
	const pageItems: AccentRealPageItem[] = []
	const truthItems: AccentRealTruthItem[] = []
	const questions: OracleQuestion[] = []
	const usedImages = new Set<string>()
	const nextSlug = slugger(random)

	/** Every item gets its own question object, carrying the one identical wording. */
	const questionFor = (slug: string): string => {
		const key = questionKeyFor(slug)
		questions.push({
			key,
			kind: "enum",
			question: ACCENT_REAL_PROMPT.question,
			instruction: ACCENT_REAL_PROMPT.instruction,
			answers: ACCENT_REAL_ANSWERS.map((answer) => ({ ...answer })),
		})
		return key
	}

	const sunshine = endorsements.find((entry) => entry.entryId === SUNSHINE_ENTRY_ID)
	if (sunshine === undefined) throw new Error(`the Sunshine entry ${SUNSHINE_ENTRY_ID} is not in ${ENDORSEMENTS_REF}`)

	/* --- the candidate pool: one (cover, governing role) pair per usable field ------------------ */
	// One entry per distinct image, so no cover can appear twice in the round under two entry ids.
	const byImage = new Map<string, EndorsementEntry>()
	for (const entry of shuffled(endorsements, random)) {
		if (entry.entryId === SUNSHINE_ENTRY_ID) continue
		if (!byImage.has(entry.artwork.imageId)) byImage.set(entry.artwork.imageId, entry)
	}
	const candidates: Candidate[] = []
	for (const entry of byImage.values()) {
		for (const role of ACCENT_REAL_GOVERNING_ROLES) {
			const fieldHex = entry.palette.roles[role].hex
			const lightness = rgbToOkLab(hexToRgb(fieldHex as `#${string}`))[0]
			const band = bandOf(lightness)
			if (band < 0) continue
			candidates.push({ entry, role, fieldHex, lightness, band })
		}
	}

	/* --- the ladder ---------------------------------------------------------------------------- */
	const ladder = logLadder(ACCENT_REAL_LADDER_MIN, ACCENT_REAL_LADDER_MAX, ACCENT_REAL_LADDER_STEPS)
	const shuffledCandidates = shuffled(candidates, random)
	let ladderIndex = 0
	for (const [rung, target] of ladder.entries()) {
		for (let slot = 0; slot < ACCENT_REAL_ITEMS_PER_RUNG; slot++) {
			const cell = cellFor(rung, slot)
			let placed = false
			for (const candidate of shuffledCandidates) {
				if (usedImages.has(candidate.entry.artwork.imageId)) continue
				if (candidate.role !== cell.role || candidate.band !== cell.band) continue
				const roles = Object.fromEntries(
					Object.entries(candidate.entry.palette.roles).map(([role, value]) => [role, value.hex]),
				)
				const built = buildAccent(candidate, target, cell.hueThird, roles, random)
				if (built === null) continue

				usedImages.add(candidate.entry.artwork.imageId)
				const itemId = `ar-ladder-${String(ladderIndex).padStart(2, "0")}`
				ladderIndex += 1
				const questionKey = questionFor(nextSlug())
				const accentHex = rgbToHex(built.accent)
				const substituted = { ...roles, accent: accentHex }
				items.push(
					oracleItem(candidate.entry, itemId, questionKey, `ladder-${cell.role}-${ACCENT_REAL_LIGHTNESS_BANDS[cell.band].name}`),
				)
				pageItems.push(mockPageItem(questionKey, substituted))
				truthItems.push({
					itemId,
					questionKey,
					role: "ladder",
					stimulus: "mock",
					rung,
					targetDistance: target,
					governingRole: cell.role,
					band: ACCENT_REAL_LIGHTNESS_BANDS[cell.band].name,
					hueThird: cell.hueThird,
					entryId: candidate.entry.entryId,
					imageId: candidate.entry.artwork.imageId,
					accentHex,
					originalAccentHex: roles.accent,
					governing: measurePair(cell.role, hexToRgb(candidate.fieldHex as `#${string}`), built.accent),
					placementProfile: placementProfile(substituted, built.accent),
					replays: null,
					repeatOf: null,
				})
				placed = true
				break
			}
			if (!placed) {
				throw new Error(
					`no cover admits an isoluminant accent at ${target.toFixed(5)} on a ${cell.role} in band ` +
						`${ACCENT_REAL_LIGHTNESS_BANDS[cell.band].name}, hue third ${cell.hueThird} — ` +
						`rung ${rung} slot ${slot}. The design is infeasible against this corpus; widen the ` +
						`band, not the tolerance.`,
				)
			}
		}
	}

	/* --- the anchors: round 1's panels, replayed ----------------------------------------------- */
	const round1Ladder = round1.items.filter((item) => item.role === "ladder")
	const chosenAnchors = new Set<string>()
	for (const [index, probe] of ANCHOR_PROBE_DISTANCES.entries()) {
		const nearest = round1Ladder
			.filter((item) => !chosenAnchors.has(item.itemId))
			.sort((a, b) => Math.abs(a.truth.okLabDistance - probe) - Math.abs(b.truth.okLabDistance - probe))[0]
		if (nearest === undefined) throw new Error(`no round-1 ladder item left for probe ${probe}`)
		chosenAnchors.add(nearest.itemId)
		const itemId = `ar-anchor-${String(index).padStart(2, "0")}-${nearest.itemId}`
		const field = [...nearest.first] as unknown as Rgb8
		const accent = [...nearest.second] as unknown as Rgb8
		const recomputed = okLabDistance(rgbToOkLab(field), rgbToOkLab(accent))
		if (Math.abs(recomputed - nearest.truth.okLabDistance) > 5e-9) {
			throw new Error(`anchor ${nearest.itemId} recomputes to ${recomputed}, fixture says ${nearest.truth.okLabDistance}`)
		}
		// An anchor has NO ARTWORK — it is round 1's flat panel and nothing else. The fixture schema
		// requires every item to name an image, so each anchor carries a distinct otherwise-unused
		// cover's reference and NEVER RENDERS IT: `renderAccentPanel` ignores `item.media` entirely.
		// Distinct rather than shared because `validateFixture` refuses a repeated (questionKey,
		// imageId) pair, and because a media route that resolves is one less way for the page to fail.
		const carrier = shuffledCandidates.find((entry) => !usedImages.has(entry.entry.artwork.imageId))
		if (carrier === undefined) throw new Error("ran out of covers to carry the anchors' image references")
		usedImages.add(carrier.entry.artwork.imageId)
		const questionKey = questionFor(nextSlug())
		items.push(oracleItem(carrier.entry, itemId, questionKey, "anchor-replay"))
		pageItems.push({
			questionKey,
			stimulus: "panel",
			panel: { fieldHex: nearest.firstHex, accentHex: nearest.secondHex },
		})
		truthItems.push({
			itemId,
			questionKey,
			role: "anchor",
			stimulus: "panel",
			rung: null,
			targetDistance: null,
			governingRole: "panel-field",
			band: null,
			hueThird: null,
			entryId: null,
			imageId: null,
			accentHex: nearest.secondHex,
			originalAccentHex: null,
			governing: measurePair("panel-field", field, accent),
			placementProfile: [measurePair("panel-field", field, accent)],
			replays: nearest.itemId,
			repeatOf: null,
		})
	}

	/* --- the Sunshine item: real palette, real accent, no construction -------------------------- */
	{
		const roles = Object.fromEntries(
			Object.entries(sunshine.palette.roles).map(([role, value]) => [role, value.hex]),
		)
		const accent = hexToRgb(roles.accent as `#${string}`)
		const governing = measurePair("surface", hexToRgb(roles.surface as `#${string}`), accent)
		if (Math.abs(governing.okLabDistance - SUNSHINE_EXPECTED_DISTANCE) > SUNSHINE_DISTANCE_TOLERANCE) {
			throw new Error(
				`the Sunshine accent measures ${governing.okLabDistance.toFixed(5)} against its surface, ` +
					`expected ${SUNSHINE_EXPECTED_DISTANCE}`,
			)
		}
		const itemId = "ar-sunshine"
		const questionKey = questionFor(nextSlug())
		items.push(oracleItem(sunshine, itemId, questionKey, "sunshine-known-verdict"))
		pageItems.push(mockPageItem(questionKey, roles))
		truthItems.push({
			itemId,
			questionKey,
			role: "sunshine",
			stimulus: "mock",
			rung: null,
			targetDistance: null,
			governingRole: "surface",
			band: ACCENT_REAL_LIGHTNESS_BANDS[bandOf(rgbToOkLab(hexToRgb(roles.surface as `#${string}`))[0])].name,
			hueThird: hueThirdOf(rgbToOkLab(accent)),
			entryId: sunshine.entryId,
			imageId: sunshine.artwork.imageId,
			accentHex: roles.accent,
			originalAccentHex: roles.accent,
			governing,
			placementProfile: placementProfile(roles, accent),
			replays: null,
			repeatOf: null,
		})
		usedImages.add(sunshine.artwork.imageId)
	}

	/* --- controls: real covers, in the mock ----------------------------------------------------- */
	const controlPool = shuffledCandidates.filter((candidate) => !usedImages.has(candidate.entry.artwork.imageId))
	for (const direction of ["obvious", "identical"] as const) {
		for (let n = 0; n < CONTROL_COUNT_PER_DIRECTION; n++) {
			// One control per direction on each governing role. A pair of controls that both sat on the
			// surface would vouch for the reviewer's attention to surfaces only, and half the ladder is
			// governed by the background.
			const wantRole = ACCENT_REAL_GOVERNING_ROLES[n % ACCENT_REAL_GOVERNING_ROLES.length]
			const candidate =
				controlPool.find((entry) => !usedImages.has(entry.entry.artwork.imageId) && entry.role === wantRole) ??
				controlPool.find((entry) => !usedImages.has(entry.entry.artwork.imageId))
			if (candidate === undefined) throw new Error("ran out of covers for the controls")
			usedImages.add(candidate.entry.artwork.imageId)
			const roles = Object.fromEntries(
				Object.entries(candidate.entry.palette.roles).map(([role, value]) => [role, value.hex]),
			)
			const field = hexToRgb(candidate.fieldHex as `#${string}`)
			// Obvious: the far end of the lightness axis from the field, at full remove. Identical: the
			// field itself, so the accent elements vanish into it.
			const accent: Rgb8 =
				direction === "obvious" ? (rgbToOkLab(field)[0] < 0.5 ? [255, 255, 255] : [0, 0, 0]) : field
			const accentHex = rgbToHex(accent)
			const substituted = { ...roles, accent: accentHex }
			const itemId = `ar-control-${direction}-${n}`
			const questionKey = questionFor(nextSlug())
			items.push(oracleItem(candidate.entry, itemId, questionKey, `control-${direction}`))
			pageItems.push(mockPageItem(questionKey, substituted))
			truthItems.push({
				itemId,
				questionKey,
				role: direction === "obvious" ? "control-obvious" : "control-identical",
				stimulus: "mock",
				rung: null,
				targetDistance: null,
				governingRole: candidate.role,
				band: ACCENT_REAL_LIGHTNESS_BANDS[candidate.band].name,
				hueThird: null,
				entryId: candidate.entry.entryId,
				imageId: candidate.entry.artwork.imageId,
				accentHex,
				originalAccentHex: roles.accent,
				governing: measurePair(candidate.role, field, accent),
				placementProfile: placementProfile(substituted, accent),
				replays: null,
				repeatOf: null,
			})
		}
	}

	/* --- repeats: silent re-asks of middle-rung ladder items ------------------------------------ */
	const repeatable = truthItems.filter(
		(item) => item.role === "ladder" && item.rung !== null && item.rung >= REPEAT_RUNG_RANGE.low && item.rung <= REPEAT_RUNG_RANGE.high,
	)
	for (const [index, source] of shuffled(repeatable, random).slice(0, REPEAT_COUNT).entries()) {
		const sourcePage = pageItems.find((page) => page.questionKey === source.questionKey)
		const sourceItem = items.find((item) => item.itemId === source.itemId)
		if (sourcePage === undefined || sourceItem === undefined) throw new Error(`repeat source ${source.itemId} vanished`)
		const itemId = `ar-repeat-${String(index).padStart(2, "0")}`
		// A NEW question key, not the source's: a repeat is the same cover asked again, and
		// `validateFixture` refuses a repeated (questionKey, imageId) pair — which is exactly the
		// mistake it exists to catch, since two answers filed under one key would collide.
		const questionKey = questionFor(nextSlug())
		items.push({ ...sourceItem, itemId, questionKey, stratum: "repeat" })
		pageItems.push({ ...sourcePage, questionKey })
		truthItems.push({ ...source, itemId, questionKey, role: "repeat", repeatOf: source.itemId })
	}

	/* --- serve order ---------------------------------------------------------------------------- */
	// One pass, fully shuffled. The anchors are shuffled in with the real items on purpose: a replay
	// the reviewer could identify as a replay would be answered from memory of round 1, and memory of
	// the old answer is exactly the confound the six anchors exist to exclude.
	const repeatOf = new Map(truthItems.filter((item) => item.repeatOf !== null).map((item) => [item.itemId, item.repeatOf!]))
	const serveOrder = separateRepeats(shuffled(items.map((item) => item.itemId), random), repeatOf)

	const fixture: OracleValidationFixture = {
		fixtureVersion: ACCENT_REAL_FIXTURE_VERSION,
		batchId,
		purpose: "oracle-validation",
		labelSchemaVersion: ACCENT_REAL_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/accent-real.ts",
		builtFrom: [ENDORSEMENTS_REF, ROUND_1_FIXTURE_REF],
		selection: {
			rule:
				"One distinct cover per item, drawn from the full-palette endorsement corpus and assigned to " +
				"a (rung x lightness band x accent hue third x governing field role) cell by cellFor(); the " +
				"first cover in seeded order that ADMITS an isoluminant accent in that cell takes it. " +
				"Selection depends on the field colour and the gamut, never on any answer. Six anchors are " +
				"accent-functional-1 panels replayed unchanged, chosen by nearness to six pre-registered " +
				"probe distances and never by how they were answered. The Sunshine item is the endorsement " +
				"22e959d5164750bd carried unmodified.",
			counts: {
				ladder: truthItems.filter((item) => item.role === "ladder").length,
				anchors: truthItems.filter((item) => item.role === "anchor").length,
				sunshine: truthItems.filter((item) => item.role === "sunshine").length,
				controls: truthItems.filter((item) => item.role.startsWith("control")).length,
				repeats: truthItems.filter((item) => item.role === "repeat").length,
				distinctCovers: usedImages.size,
			},
		},
		questions,
		items,
		serveOrder,
	}

	validateFixture(fixture)
	return {
		fixture,
		pageData: { batchId, items: pageItems },
		truth: {
			batchId,
			schema: "accent-real-round-1-truth/v1",
			generatedBy: "research/v3/src/review-server/accent-real.ts",
			builtFrom: [ENDORSEMENTS_REF, ROUND_1_FIXTURE_REF],
			criterion: ACCENT_REAL_CRITERION,
			question: ACCENT_REAL_PROMPT.question,
			instruction: ACCENT_REAL_PROMPT.instruction,
			// How to get from something the reviewer quotes to a row in this file. Written down because
			// the obvious guess is wrong: the id on screen is `<batch>/<OPAQUE TOKEN>`, and tokens are
			// minted at PUSH time, so nothing generated here can contain one. An earlier draft of this
			// file carried a fabricated `itemRef` built from the item id and the artwork hash — the
			// shape `round-kit.ts` still describes — which would have resolved to nothing.
			reviewerItemRefNote:
				"The id shown on the page is `<batchId>/<token>`, minted at push time and resolvable only " +
				"by the server. Do NOT try to match it against anything in this file. A NOTE the reviewer " +
				"files already carries the real `itemId`, which is this file's join key; for a bare quoted " +
				"ref, resolve the token through the running server rather than guessing.",
			placements: MOCK_ACCENT_PLACEMENTS,
			items: truthItems,
		},
	}
}

const ROLE_ORDER = ["background", "surface", "foreground", "accent"] as const

export function mockPageItem(questionKey: string, roles: Readonly<Record<string, string>>): AccentRealPageItem {
	const names = nameHexes(ROLE_ORDER.map((role) => roles[role]))
	return {
		questionKey,
		stimulus: "mock",
		side: {
			roles: ROLE_ORDER.map((role) => ({
				role,
				hex: roles[role],
				// The substituted accent is a colour nobody has named yet, so it is named here through
				// the ONE `colornames-oklab` call site rather than carrying the endorsement's stale name.
				name: names[roles[role]] ?? roles[role],
				collapsed: false,
			})),
			gradient: null,
			// A flat field is the background hex and nothing else — `mock.js` pastes `fieldCss` and
			// never composes a ramp, so no display mapping is invented here.
			fieldCss: roles.background,
		},
	}
}

export function oracleItem(
	entry: EndorsementEntry,
	itemId: string,
	questionKey: string,
	stratum: string,
): OracleValidationItem {
	return {
		itemId,
		questionKey,
		imagePath: entry.artwork.imagePath,
		sha256: entry.artwork.contentSha256,
		imageId: entry.artwork.imageId,
		artworkId: null,
		collection: "sharded-corpus",
		rendition: {
			source: ENDORSEMENTS_REF,
			sourceEntryId: entry.entryId,
			longEdgePx: Math.max(entry.artwork.rendition.width, entry.artwork.rendition.height),
			width: entry.artwork.rendition.width,
			height: entry.artwork.rendition.height,
		},
		stratum,
	}
}

export function serializeFixture(fixture: OracleValidationFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}

/* ------------------------------------------------------------------------------------------- */
/* Push                                                                                          */
/* ------------------------------------------------------------------------------------------- */

export const ACCENT_REAL_FUNDED_BY: readonly string[] = [
	"d-2026-08-04-accent-calibration-is-a-stimulus-realism-problem — consequence (2): THE " +
		"RECALIBRATION ROUND IS REBUILT ON REAL COVERS, with a few synthetic anchors retained SOLELY to " +
		"measure the lab-versus-real gap",
	"accent-functional-1 refused its own fit (verdict contradicts-retraction, threshold 0.04554, " +
		"anchors 4/4 on the diagonal) — research/v3/data/calibration/accent-functional-round-1-preregistration.md §8",
	"PHASE_0_LOOSE_ENDS.md A16 — ACCENT_FUNCTIONAL_DISTANCE is [UNCALIBRATED], in force, and no REAL " +
		"stimulus has ever been graded against the criterion it is named for",
	"src/contract/constants.ts:371 — placeholder 0.14591, excluded at 95% by the synthetic round from " +
		"BELOW, while the reviewer's real-cover judgement the same day points ABOVE it",
	`criterion: ${ACCENT_REAL_CRITERION}`,
	`question: ${ACCENT_REAL_PROMPT.question} (byte-identical to accent-functional-1)`,
	"Pre-registered design, isoluminance construction, tolerances, adoption window and refusal " +
		"conditions: research/v3/data/calibration/accent-real-round-1-preregistration.md",
]

export async function pushAccentRealRound(
	base: string,
	fixturePath = ACCENT_REAL_FIXTURE_PATH,
	fundedBy: readonly string[] = ACCENT_REAL_FUNDED_BY,
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
		const result = await pushAccentRealRound(values.push)
		console.log(result.status, JSON.stringify(result.body))
		process.exit(result.status === 201 ? 0 : 1)
	}
	const { fixture, pageData, truth } = await buildAccentRealFixture()
	if (values.write) {
		await writeFile(ACCENT_REAL_FIXTURE_PATH, serializeFixture(fixture), "utf8")
		await writeFile(ACCENT_REAL_PAGE_DATA_PATH, `${JSON.stringify(pageData, null, "\t")}\n`, "utf8")
		await writeFile(ACCENT_REAL_TRUTH_PATH, `${JSON.stringify(truth, null, "\t")}\n`, "utf8")
		console.log(`wrote ${ACCENT_REAL_FIXTURE_PATH} — ${fixture.items.length} items`)
		console.log(`wrote ${ACCENT_REAL_PAGE_DATA_PATH}`)
		console.log(`wrote ${ACCENT_REAL_TRUTH_PATH}`)
	} else {
		console.log(`${fixture.items.length} items:`, fixture.selection.counts)
		for (const item of truth.items) {
			console.log(
				`${item.itemId.padEnd(28)} ${item.role.padEnd(17)} gov=${item.governingRole.padEnd(11)}` +
					` d=${item.governing.okLabDistance.toFixed(5)}` +
					` target=${item.targetDistance === null ? "  —    " : item.targetDistance.toFixed(5)}` +
					` dY=${item.governing.deltaApcaY.toFixed(5)} raw=${item.governing.apcaRaw.toFixed(3)}` +
					` Lc=${item.governing.apcaLc.toFixed(1)} band=${item.band ?? "—"}`,
			)
		}
	}
}
