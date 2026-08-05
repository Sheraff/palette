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

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1ap"

/** `[UNCALIBRATED]` — a label, not a measurement. See `ALGORITHM_VERSIONS` in `src/emit/palette.ts`. */
export const ALGORITHM_VERSION = ALGORITHM_VERSIONS.p1ap

/**
 * The energy this candidate minimises, by version.
 *
 * `[HELD]` — arm A′'s energy carries no version constant of its own (unlike arm A, which has one
 * because `DESIGN.md` decision 7 already moved it once). Stated here as the identity string rather
 * than invented as a new constant somewhere else, so a warehouse row can name the energy for both
 * arms symmetrically and a future arm A′ revision has an obvious place to bump.
 */
export const ENERGY_VERSION = "p1ap-energy-0.1.0"

/**
 * Produce a palette for one image.
 *
 * Throws rather than degrading — see `p1a.ts`'s note on which errors and why they are not repaired.
 */
export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { emit } = await import("../src/search/index.ts")
	const { palette } = await emit(imagePath, { arm: "aprime" })
	return palette
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
