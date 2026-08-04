/**
 * The colour kernel — the model's only length scale in colour space.
 *
 * Two things live here and nothing else: which regional bar a pair of colours is measured at, and
 * the smooth kernel of unit width in those units. Both are inherited from the contract; neither is a
 * choice this prototype gets to make (`prototypes/p1-mdl/DESIGN.md` decision 1).
 */

import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
} from "../../../../src/contract/constants.ts"
import type { ColorRegion, OkLab } from "../../../../src/contract/types.ts"
import { KERNEL_BANDWIDTH_BY_REGION } from "./constants.ts"

/**
 * Which of the four measured regions an OKLab point falls in.
 *
 * [INHERITED] — this is `src/contract/color.ts:colorRegion`'s rule and its two boundary constants,
 * applied to a bare OKLab triple. The contract's function takes a `PaletteColor`, i.e. an exact
 * 8-bit pixel; the ladder needs the region of a **box mean**, which is not an 8-bit colour and never
 * will be published. Rather than round a box mean back to 8 bits to borrow the contract's signature,
 * the rule is applied where it is defined — on lightness and chroma — with the same two boundaries
 * imported from the same file. No boundary digit is written here.
 */
export function regionOfOkLab(lab: OkLab): ColorRegion {
	const chroma = Math.hypot(lab[1], lab[2])
	const lightnessBand = lab[0] < REGION_LIGHTNESS_BOUNDARY ? "dark" : "light"
	const chromaBand = chroma < REGION_CHROMA_BOUNDARY ? "neutral" : "saturated"
	return `${lightnessBand}-${chromaBand}` as ColorRegion
}

/** The regional bar for a single OKLab point. */
export function bandwidthOf(lab: OkLab): number {
	return KERNEL_BANDWIDTH_BY_REGION[regionOfOkLab(lab)]
}

/**
 * The bandwidth for a **pair** of OKLab points: the larger of the two regions' bars.
 *
 * [INHERITED] — exactly `src/contract/color.ts:sameColorBar`'s `Math.max` rule, including its
 * reasoning (a straddling pair is unmeasured, and where the rule is unmeasured it errs toward the
 * looser bar). Every distance the objective ever reads is a distance between two colours, so this —
 * not the single-point bandwidth — is the function the measurement layer uses.
 */
export function pairBandwidth(first: OkLab, second: OkLab): number {
	return Math.max(bandwidthOf(first), bandwidthOf(second))
}

/**
 * The kernel: a Gaussian of unit width in identity-bar units, `κ(δ) = exp(-δ²/2h²)`, `κ(0) = 1`.
 *
 * Derived-and-stated. Arm A §2.1 specifies "a smooth kernel of unit width in identity-bar units" and
 * fixes no family. The Gaussian is picked for three properties the rest of P1 depends on:
 * it is C^∞ (arm A §2.6's robustness argument needs every quantity to be a smooth functional of the
 * pixels), it has bounded derivative `|κ'| ≤ e^{-1/2}/h` (the branch-and-bound Lipschitz constants in
 * arm A §2.5 are written against exactly that), and "unit width" is unambiguous for it — the
 * bandwidth *is* the bar. Nothing downstream may depend on the family; the bandwidth is what carries
 * the meaning.
 */
export function kappa(distance: number, bandwidth: number): number {
	const scaled = distance / bandwidth
	return Math.exp(-0.5 * scaled * scaled)
}

/** Squared OKLab distance between two points held in flat arrays. Avoids a `Math.hypot` in loops. */
export function squaredDistanceAt(
	first: Float64Array,
	firstBase: number,
	second: Float64Array,
	secondBase: number,
): number {
	const deltaL = first[firstBase] - second[secondBase]
	const deltaA = first[firstBase + 1] - second[secondBase + 1]
	const deltaB = first[firstBase + 2] - second[secondBase + 2]
	return deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
}
