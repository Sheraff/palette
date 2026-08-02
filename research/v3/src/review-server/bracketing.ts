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
import { APCA_RAW_IDENTICAL_CEILING, SAME_COLOR_BAR } from "../contract/constants.ts"
import type { OkLab, Rgb8 } from "../contract/types.ts"

/* ------------------------------------------------------------------------------------------- */
/* Constants                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/** Fixture format version, stamped into the file. Bump on any breaking change to the shapes. */
export const BRACKETING_FIXTURE_VERSION = "color-bracketing-1"

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
/* Types                                                                                         */
/* ------------------------------------------------------------------------------------------- */

export type BracketingPart = "same-color" | "accent-visible"

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
	/** `control` items have a known correct answer; `repeat` items silently re-ask an earlier pair. */
	role: "ladder" | "control-identical" | "control-obvious" | "repeat"
	/** For repeats, the itemId whose colours this duplicates. Never served. */
	repeatOf: string | null
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
			(a, b) => Math.abs(Math.log(a.truth.okLabDistance / SAME_COLOR_BAR)) - Math.abs(Math.log(b.truth.okLabDistance / SAME_COLOR_BAR)),
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
		prior: { sameColorBar: SAME_COLOR_BAR },
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

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { write: { type: "boolean", default: false } }, strict: true })
	const fixture = generateBracketingFixture()
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
	if (values.write) {
		await writeFile(BRACKETING_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${BRACKETING_FIXTURE_PATH}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
