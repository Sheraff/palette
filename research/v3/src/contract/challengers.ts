/**
 * **The report-only challengers to the frozen same-colour bar.**
 *
 * `[PROVISIONAL — perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement
 * counter]`
 *
 * perception-4 asked which colour *space* should carry the same-colour bar and came back with the
 * answer that the question was aimed one dimension away from the problem: the space question
 * (`ICtCp` vs `OKLab`) won its arm 28/40 and then failed its own pre-registered multiplicity
 * correction, while the *direction* question — asked in a corner of the round that was declared
 * under-powered and barred in advance from funding any adoption — came back clean at about 2.9×
 * and was independently confirmed by the re-run model comparison. The reviewer signed off on the
 * package in `PERCEPTION_VERDICT.md`: **keep OKLab; adopt the direction-aware shape provisionally;
 * defer the confirming round, and let report-only challengers decide whether it ever runs.**
 *
 * This module is that last clause. It computes two rival answers to "are these the same colour?"
 * beside the frozen one, on every pair the distinctness matrix actually judges, and counts how
 * often they disagree with it.
 *
 * ## The one property that matters, and how it is structurally guaranteed
 *
 * **A challenger can never change a verdict.** Not "does not today" — *cannot*, by the shape of
 * the code. Nothing in this file returns a `Violation`, nothing here is reachable from
 * `validatePalette`'s return value, and the only thing `invariants.ts` does with a
 * `ChallengerComparison` is hand it to an observation sink, which exists solely to be reported.
 * `validatePalette` computes `valid` from the frozen bars alone and `scorePalette` carries that
 * boolean rather than recomputing it. `contract-challengers.test.ts` pins this from the outside as
 * well: on a palette constructed so the challengers disagree with the incumbent, the verdict and
 * the violation list are byte-identical to the run with challengers unobserved.
 *
 * This is not ceremony. A report-only rule that can quietly reach the gate is how a provisional
 * number becomes a committed one without anybody deciding, and this whole round exists because the
 * reviewer's ruling is about constraints discovered late.
 *
 * ## Why the maths is reimplemented here rather than imported
 *
 * `perception-model-spaces.ts` already has an ICtCp conversion and the lightness/chroma/hue
 * decomposition — and it gets ICtCp from `colorjs.io`, which is a **devDependency**. The contract's
 * shipping closure (`index.ts` → `constants` · `types` · `color` · `ramp` · `invariants` ·
 * `scorecard`) currently reaches no third-party package at all, and wiring a report-only challenger
 * into `invariants.ts` is not a good enough reason to make the gate depend on a dev-only library.
 *
 * So the conversion is reimplemented, **exactly as `color.ts` reimplements APCA rather than
 * importing `apca-w3`**, and for exactly the same reason it is safe there: the copy is pinned to
 * the original by test. `contract-challengers.test.ts` checks this ICtCp against
 * `perception-model-spaces.ts`'s colorjs-backed one coordinate-for-coordinate over a 4,096-colour
 * grid — they agree to **0 ulp**, not to a tolerance — and checks this decomposition against that
 * module's `decompose`. If either drifts, the test fails; that test is what makes the copy honest.
 *
 * ## The two challengers
 *
 * | id | rule | what it is |
 * |---|---|---|
 * | `direction-aware-oklab` | `√(ΔL² + 8.29·ΔC² + 7.39·ΔH²) < 0.02063` | the shape the round actually found — same space, ellipsoidal bar |
 * | `ictcp-global` | `ICtCp distance < 0.01026` | the space the round asked about and refused — one global constant, no regions |
 *
 * Both are `dark-neutral`-derived and are nonetheless applied **everywhere**, which is deliberate
 * and is the sharpest caveat on the counter below. Arm B measured one region; the other three are
 * unmeasured. A disagreement in `light-saturated` therefore says "the frozen bar and a
 * dark-neutral-derived bar differ here", which is *not* the same statement as "the frozen bar is
 * wrong here". The counter is an instrument for deciding whether to spend a round, not evidence
 * that the round's conclusion is already known — and `ChallengerTally` carries the per-region split
 * so that this distinction survives contact with whoever reads it.
 */

import {
	ICTCP_GLOBAL_SAME_COLOR_BAR,
	SAME_COLOR_BAR_LIGHTNESS_AXIS,
	SAME_COLOR_DIRECTION_WEIGHTS,
} from "./constants.ts"
import { okLabFromColor } from "./color.ts"
import type { ColorRegion, PaletteColor, Rgb8 } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// ICtCp (BT.2100 PQ form), reimplemented — pinned to colorjs.io by test
// ---------------------------------------------------------------------------------------------

/** PQ (SMPTE ST 2084) constants, as rationals so the transcription is checkable by eye. */
const PQ_C1 = 3424 / 4096
const PQ_C2 = 2413 / 128
const PQ_C3 = 2392 / 128
const PQ_M1 = 2610 / 16384
const PQ_M2 = 2523 / 32

/** Absolute luminance of media white, per BT.2048: SDR diffuse white sits at 203 cd/m². */
const MEDIA_WHITE_LUMINANCE = 203

/** Linear sRGB → XYZ (D65), from the RGB and white chromaticities. */
const SRGB_LINEAR_TO_XYZ_D65 = [
	[0.41239079926595934, 0.357584339383878, 0.1804807884018343],
	[0.21263900587151027, 0.715168678767756, 0.07219231536073371],
	[0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
] as const

/** XYZ → LMS including the 4% crosstalk terms, from Dolby's "What is ICtCp". */
const XYZ_TO_LMS = [
	[0.3592832590121217, 0.6976051147779502, -0.0358915932320290],
	[-0.1920808463704993, 1.1004767970374321, 0.0753748658519118],
	[0.0070797844607479, 0.0748396662186362, 0.8433265453898765],
] as const

/** PQ-encoded LMS → ICtCp: Ebner LMS coefficients, the rotation, and the ±0.5 scaling (BT.2124-0). */
const LMS_TO_ICTCP = [
	[2048 / 4096, 2048 / 4096, 0],
	[6610 / 4096, -13613 / 4096, 7003 / 4096],
	[17933 / 4096, -17390 / 4096, -543 / 4096],
] as const

type Vec3 = readonly [number, number, number]

function multiply(matrix: readonly (readonly number[])[], vector: Vec3): Vec3 {
	return [
		matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
		matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
		matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
	]
}

/**
 * sRGB → ICtCp, **with Ct halved and the conventional 720 scale omitted**.
 *
 * Both departures from the textbook form are `perception-model-spaces.ts`'s, copied so that the
 * challenger measures the identical quantity the study and round 4 measured: the `0.5` on Ct is the
 * ITU-R BT.2124 ΔE_ITP convention, and the 720 is left off because it would rescale the metric
 * without changing any ordering, and every threshold here is expressed in the unscaled units the
 * round fitted.
 */
export function rgbToIctcp(rgb: Rgb8): Vec3 {
	const linear = rgb.map((channel) => {
		const c = channel / 255
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}) as unknown as Vec3

	const xyz = multiply(SRGB_LINEAR_TO_XYZ_D65, linear)
	// Absolute XYZ: PQ is an absolute-luminance encoding, so relative XYZ has to be scaled to it.
	const absolute = xyz.map((v) => Math.max(v * MEDIA_WHITE_LUMINANCE, 0)) as unknown as Vec3
	const lms = multiply(XYZ_TO_LMS, absolute)
	const pq = lms.map((v) => {
		const t = (v / 10000) ** PQ_M1
		return ((PQ_C1 + PQ_C2 * t) / (1 + PQ_C3 * t)) ** PQ_M2
	}) as unknown as Vec3

	const [i, ct, cp] = multiply(LMS_TO_ICTCP, pq)
	return [i, 0.5 * ct, cp]
}

/** Euclidean distance in the ICtCp form above — the challenger's ruler. */
export function ictcpDistance(first: PaletteColor, second: PaletteColor): number {
	const a = rgbToIctcp(first.rgb)
	const b = rgbToIctcp(second.rgb)
	return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

// ---------------------------------------------------------------------------------------------
// The direction decomposition
// ---------------------------------------------------------------------------------------------

/**
 * ΔL / ΔC / ΔH for a pair, in OKLab, in the CIE convention.
 *
 * `deltaHue` is **residual** — `ΔH = √(Δa² + Δb² − ΔC²)` — which makes `Δ² = ΔL² + ΔC² + ΔH²` hold
 * exactly by construction. That exactness is the whole reason the direction-aware bar is a
 * reweighting of three orthogonal components rather than an approximation, and it is why hue is an
 * arc length here rather than an angle: an angle is not commensurable with the other two.
 *
 * Mirrors `perception-model-spaces.ts:decompose()`, restricted to the three components this module
 * needs and pinned to it by test.
 */
export function decomposeOkLab(
	first: PaletteColor,
	second: PaletteColor,
): Readonly<{ deltaLightness: number; deltaChroma: number; deltaHue: number }> {
	const [firstL, firstA, firstB] = okLabFromColor(first)
	const [secondL, secondA, secondB] = okLabFromColor(second)

	const deltaLightness = secondL - firstL
	const deltaChroma = Math.hypot(secondA, secondB) - Math.hypot(firstA, firstB)
	const chromaticSquared = (secondA - firstA) ** 2 + (secondB - firstB) ** 2
	// Clamped at zero: ΔC² can exceed the chromatic plane's squared difference by float noise alone.
	const deltaHue = Math.sqrt(Math.max(0, chromaticSquared - deltaChroma ** 2))

	return { deltaLightness, deltaChroma, deltaHue }
}

/** The challenger's direction-aware distance: `√(ΔL² + 8.29·ΔC² + 7.39·ΔH²)`. */
export function directionAwareDistance(first: PaletteColor, second: PaletteColor): number {
	const { deltaLightness, deltaChroma, deltaHue } = decomposeOkLab(first, second)
	return Math.sqrt(
		deltaLightness ** 2 +
			SAME_COLOR_DIRECTION_WEIGHTS.chroma * deltaChroma ** 2 +
			SAME_COLOR_DIRECTION_WEIGHTS.hue * deltaHue ** 2,
	)
}

// ---------------------------------------------------------------------------------------------
// The challenge
// ---------------------------------------------------------------------------------------------

export type ChallengerId = "direction-aware-oklab" | "ictcp-global"

export type ChallengerDefinition = Readonly<{
	id: ChallengerId
	label: string
	/** The bar this challenger judges against. Fixed — challengers have no regional partition. */
	bar: number
	/** The challenger's own distance for a pair, in its own units. */
	distance: (first: PaletteColor, second: PaletteColor) => number
	/** One line on what adopting it would mean, carried into the artifact so a reader need not dig. */
	provenance: string
}>

/**
 * The two challengers, in the order a report lists them.
 *
 * Note both bars are **`dark-neutral`-derived and applied globally**. See the module docstring: a
 * disagreement outside `dark-neutral` is a difference between two rules, not evidence that the
 * frozen one is wrong there.
 */
export const CHALLENGERS: readonly ChallengerDefinition[] = [
	{
		id: "direction-aware-oklab",
		label: "OKLab, direction-aware (ellipsoidal)",
		bar: SAME_COLOR_BAR_LIGHTNESS_AXIS["dark-neutral"],
		distance: directionAwareDistance,
		provenance:
			"perception-4 arm B: sqrt(dL^2 + 8.29*dC^2 + 7.39*dH^2) < 0.02063. Weights are the measured " +
			"ratios squared (2.88 [1.91, 4.39] and 2.72 [1.65, 5.90]), both Holm-clean over the round's " +
			"declared family of 13 and the only Holm-clean identity results it produced. Measured in " +
			"dark-neutral only, at 12 rungs per ladder, which confirms a ratio and does not pin one.",
	},
	{
		id: "ictcp-global",
		label: "ICtCp, one global constant",
		bar: ICTCP_GLOBAL_SAME_COLOR_BAR,
		distance: ictcpDistance,
		provenance:
			"perception-4 arm A: ICtCp with one global constant won 28/40 (70.0%, exact binomial " +
			"p = 0.0166, decisive on its own pre-registered rule) and then FAILED the round's own " +
			"multiplicity correction at Holm-adjusted p = 0.0995. Its whole margin came from " +
			"lightness-dominant pairs (16/20); on chroma-dominant disagreements the reviewer sided with " +
			"neither rule (12/20). Bar is exp(-b0/b1) over the identity x ictcp x global-constant cell.",
	},
] as const

export type ChallengerVerdict = Readonly<{
	challenger: ChallengerId
	/** The challenger's distance for this pair, in the challenger's own units. */
	measured: number
	bar: number
	/** Does this challenger call the pair the same colour? */
	saysSame: boolean
	/** Does that match the frozen rule's answer? `false` is what the counter counts. */
	agrees: boolean
}>

export type ChallengerComparison = Readonly<{
	/** The frozen rule's answer — `distance < sameColorBar(pair)`, computed by the contract, not here. */
	incumbentSaysSame: boolean
	incumbentDistance: number
	incumbentBar: number
	/** The region the pair was judged in, so a tally can split by it. */
	region: ColorRegion
	verdicts: readonly ChallengerVerdict[]
}>

/**
 * Evaluate every challenger against one pair, given the frozen rule's answer.
 *
 * `incumbentDistance` and `incumbentBar` are **passed in rather than recomputed** so that the thing
 * being challenged is literally the number the gate used — a re-derivation here could drift from
 * `invariants.ts` and turn a disagreement between two rules into a disagreement between two copies
 * of one rule.
 *
 * Note what the incumbent answer must be for this to mean anything: the **same-colour** bar, not
 * the elevated foreground↔accent separation bar. The challengers are rival answers to "are these
 * the same colour?", and comparing one against a bar that is deliberately higher for one cell would
 * manufacture disagreements that are really the separation ruling doing its job.
 */
export function compareChallengers(
	first: PaletteColor,
	second: PaletteColor,
	incumbentDistance: number,
	incumbentBar: number,
	region: ColorRegion,
): ChallengerComparison {
	const incumbentSaysSame = incumbentDistance < incumbentBar
	return {
		incumbentSaysSame,
		incumbentDistance,
		incumbentBar,
		region,
		verdicts: CHALLENGERS.map((challenger) => {
			const measured = challenger.distance(first, second)
			const saysSame = measured < challenger.bar
			return {
				challenger: challenger.id,
				measured,
				bar: challenger.bar,
				saysSame,
				agrees: saysSame === incumbentSaysSame,
			}
		}),
	}
}

// ---------------------------------------------------------------------------------------------
// The counter
// ---------------------------------------------------------------------------------------------

/**
 * A challenger's record against the frozen rule.
 *
 * The two directed counts are kept apart rather than summed, because they mean opposite things and
 * the round's refusals turn on the difference. `challengerSaysSameIncumbentDistinct` is the
 * challenger calling *more* pairs identical than the contract does — the direction that would make
 * invariant 3 flag more palettes, whose false positives the reviewer sees and can demote.
 * `incumbentSaysSameChallengerDistinct` is the opposite, and it is the dangerous one: those are
 * collisions the contract would ship silently. A counter that pooled them would hide exactly the
 * asymmetry `color.ts`'s straddle-rule docstring spends four paragraphs on.
 */
export type ChallengerTally = Readonly<{
	challenger: ChallengerId
	label: string
	bar: number
	/** Pairs judged. Every pair the distinctness matrix actually judged; exempt pairs are not judgments. */
	judged: number
	agreed: number
	disagreed: number
	challengerSaysSameIncumbentDistinct: number
	incumbentSaysSameChallengerDistinct: number
	/** Disagreements split by the region the pair was judged in. `dark-neutral` is the measured one. */
	disagreedByRegion: Readonly<Record<ColorRegion, number>>
}>

const ZERO_BY_REGION = (): Record<ColorRegion, number> => ({
	"dark-neutral": 0,
	"dark-saturated": 0,
	"light-neutral": 0,
	"light-saturated": 0,
})

/** Fold a run of comparisons into one tally per challenger. Order follows `CHALLENGERS`. */
export function tallyChallengers(
	comparisons: readonly ChallengerComparison[],
): readonly ChallengerTally[] {
	return CHALLENGERS.map((challenger) => {
		const tally = {
			challenger: challenger.id,
			label: challenger.label,
			bar: challenger.bar,
			judged: 0,
			agreed: 0,
			disagreed: 0,
			challengerSaysSameIncumbentDistinct: 0,
			incumbentSaysSameChallengerDistinct: 0,
			disagreedByRegion: ZERO_BY_REGION(),
		}
		for (const comparison of comparisons) {
			const verdict = comparison.verdicts.find((v) => v.challenger === challenger.id)
			if (verdict === undefined) continue
			tally.judged += 1
			if (verdict.agrees) {
				tally.agreed += 1
				continue
			}
			tally.disagreed += 1
			tally.disagreedByRegion[comparison.region] += 1
			if (verdict.saysSame) tally.challengerSaysSameIncumbentDistinct += 1
			else tally.incumbentSaysSameChallengerDistinct += 1
		}
		return tally
	})
}

/** Sum two tally sets — how the artifact accumulates across runs. */
export function mergeTallies(
	first: readonly ChallengerTally[],
	second: readonly ChallengerTally[],
): readonly ChallengerTally[] {
	return CHALLENGERS.map((challenger) => {
		const a = first.find((t) => t.challenger === challenger.id)
		const b = second.find((t) => t.challenger === challenger.id)
		const byRegion = ZERO_BY_REGION()
		for (const source of [a, b]) {
			if (source === undefined) continue
			for (const region of Object.keys(byRegion) as ColorRegion[]) {
				byRegion[region] += source.disagreedByRegion[region] ?? 0
			}
		}
		return {
			challenger: challenger.id,
			label: challenger.label,
			bar: challenger.bar,
			judged: (a?.judged ?? 0) + (b?.judged ?? 0),
			agreed: (a?.agreed ?? 0) + (b?.agreed ?? 0),
			disagreed: (a?.disagreed ?? 0) + (b?.disagreed ?? 0),
			challengerSaysSameIncumbentDistinct:
				(a?.challengerSaysSameIncumbentDistinct ?? 0) + (b?.challengerSaysSameIncumbentDistinct ?? 0),
			incumbentSaysSameChallengerDistinct:
				(a?.incumbentSaysSameChallengerDistinct ?? 0) + (b?.incumbentSaysSameChallengerDistinct ?? 0),
			disagreedByRegion: byRegion,
		}
	})
}

/**
 * The sentence a scorecard reader should see before the numbers. Deliberately states the limit of
 * what the counter can support, in the same breath as the count.
 */
export const CHALLENGER_NOTE =
	"Report-only challengers to the frozen same-colour bar (src/contract/challengers.ts). " +
	"[PROVISIONAL - perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement " +
	"counter.] These verdicts never affect `valid` and never produce a violation: validatePalette " +
	"computes the verdict from the frozen OKLab bars alone. Both challenger bars were measured in " +
	"dark-neutral only and are applied globally, so a disagreement outside dark-neutral is a " +
	"difference between two rules, not evidence that the frozen bar is wrong there - read " +
	"disagreedByRegion before quoting a total."
