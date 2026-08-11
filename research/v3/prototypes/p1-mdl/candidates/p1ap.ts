/**
 * # `p1ap` — arm A′: E(P) = L(pixels|P) + λ·L(P)
 *
 * The mechanism, from `DESIGN.md` §"The internal experiment": the energy is a description length in
 * bits. `L(P)` is the contract object's **own serialization cost** (`src/emit/cost.ts`).
 * `L(pixels|P)` is the residual under the palette, with field/ink separation coming from the support
 * map's own coding cost — broad, low-frequency regions cheap under a coarse code; stroke-like regions
 * cheap under an edge/run code. The residual model is the image's own smoothed colour density —
 * arm A′ keeps its own, and that difference from arm A is part of the prior under test.
 *
 * The two arms share everything else: the same measurement layer, the same feasible set, the same
 * emitter, the same v0 foreground/accent ordering (`DESIGN.md` decision 3), and — deliberately — the
 * same **search effort**. `src/search/constants.ts` costs both arms with the more expensive arm's
 * coefficients, so the two search the same configuration space on the same image and M3's comparison
 * stays a comparison of priors rather than of how much CPU each one was given.
 *
 * `paletteOf` is `emit()` with the arm fixed and the diagnostics dropped; see `p1a.ts` for why the
 * diagnostics do not leave this function, why there is no λ knob here, and why the search is imported
 * dynamically rather than at module scope.
 */

import type { CandidatePalette, CandidateModule } from "../../../src/devloop/types.ts"
import type { Palette } from "../../../src/contract/types.ts"
import { ALGORITHM_VERSIONS } from "../src/emit/palette.ts"
import { ENERGY_APRIME_VERSION } from "../src/energy/aprime/constants.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1ap"

/** `[UNCALIBRATED]` — a label, not a measurement. See `ALGORITHM_VERSIONS` in `src/emit/palette.ts`. */
export const ALGORITHM_VERSION = ALGORITHM_VERSIONS.p1ap

/**
 * The energy this candidate minimises, by version.
 *
 * `[HELD]` — read from `src/energy/aprime/constants.ts`, as `p1ap-v1.ts` does. **Corrected**: this
 * was the literal `"p1ap-energy-0.1.0"`, written when arm A′'s energy had no version constant of its
 * own. It has had one since DESIGN 11's chromatic residual bumped it to `"p1ap-energy-0.2.0"`, and
 * this module runs *that* energy — it shares `src/energy/aprime/` with `p1ap-v1.ts` and always did.
 * The literal was therefore a false provenance stamp, the same class of defect as the arm-keyed
 * `algorithmVersion`. Reading the constant is what makes the two unable to drift again.
 *
 * The string is still published separately from `ALGORITHM_VERSION` for `DESIGN.md` decision 9's
 * reason: the energy can move without the candidate's identity moving, and a row recording only one
 * of the two could not tell a palette from before such a move from one after it.
 */
export const ENERGY_VERSION = ENERGY_APRIME_VERSION

/**
 * Produce a palette for one image.
 *
 * Throws rather than degrading — see `p1a.ts`'s note on which errors and why they are not repaired.
 */
export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { emit } = await import("../src/search/index.ts")
	// Explicit `algorithmVersion`, same string `emit()` would have defaulted to — see `p1a.ts`.
	const { palette } = await emit(imagePath, { arm: "aprime", algorithmVersion: ALGORITHM_VERSION })
	return palette
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
