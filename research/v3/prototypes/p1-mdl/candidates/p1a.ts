/**
 * # `p1a` — arm A: explanatory cost in nats, plus λ·Ω
 *
 * The mechanism, from `DESIGN.md` §"The internal experiment": explanatory cost in nats per unit
 * image mass, plus λ·Ω(x), where Ω counts structural elements — surface≠background: 1; ramp: 1; each
 * interior stop: 1; accent≠foreground: 1. Field/ink membership is soft: a logistic in the extent
 * statistic e(p) from a dyadic box-mean ladder, with the split scale s* optimised jointly. The
 * residual model is a uniform density over the sRGB gamut, parameter-free — arm A keeps its own, and
 * that difference from arm A′ is part of the prior under test.
 *
 * `paletteOf` is `src/search/`'s `emit()` with the arm fixed and the diagnostics dropped. That is the
 * whole module, and the two things it does *not* do are the interesting ones:
 *
 * 1. **No diagnostics side-channel.** `emit()` returns a rich `Diagnostics` — the search certificate,
 *    the runner-up list, the min-|APCA| report, the self-falsifier — and none of it leaves this
 *    function. `CandidatePalette` is `(imagePath) => Promise<Palette>`, and a candidate that smuggled
 *    state out through a module-level array would make two dev-loop runs of the same candidate differ
 *    by whether something had been read in between. The diagnostics are written by
 *    `src/search/run-emitter.ts`, which calls `emit()` directly and owns a file to put them in.
 * 2. **No knobs.** `src/devloop/types.ts` is explicit that *"a candidate with a knob is two
 *    candidates"*. λ is not a parameter here; it is `DEFAULT_LAMBDA` = 1.0, `[UNCALIBRATED]`, and the
 *    mandatory sweep (`DESIGN.md` decision 2) runs through the falsifier and the emitter CLI, never
 *    through this module.
 *
 * ## Importable with no side effects — and how that survives being wired
 *
 * `src/search/index.ts` reaches `src/measure/decode.ts`, which imports `sharp`, a native binding. A
 * static import here would load it merely to *list* the candidates. So the search is imported
 * **dynamically, inside `paletteOf`**: the module graph at import time is still the decoder-free one
 * it always was, and `tests/emit/candidates.test.ts`'s import-closure guard keeps it that way.
 */

import type { CandidatePalette, CandidateModule } from "../../../src/devloop/types.ts"
import type { Palette } from "../../../src/contract/types.ts"
import { ALGORITHM_VERSIONS } from "../src/emit/palette.ts"
import { ENERGY_A_VERSION } from "../src/energy/a/constants.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1a"

/** `[UNCALIBRATED]` — a label, not a measurement. See `ALGORITHM_VERSIONS` in `src/emit/palette.ts`. */
export const ALGORITHM_VERSION = ALGORITHM_VERSIONS.p1a

/**
 * The energy this candidate minimises, by its own version string.
 *
 * `[HELD]` — `ENERGY_A_VERSION` = `"p1a-energy-0.2.0"`, read from `src/energy/a/constants.ts` rather
 * than restated, so the two cannot drift. It is published separately from `ALGORITHM_VERSION` for a
 * reason `DESIGN.md` decision 9 makes concrete: arm A's ink term has a **known defect awaiting fix**
 * (it prices no support, so a broad ink region pays nothing), and that fix will move the energy
 * without changing the candidate's identity. A row recording only `p1a-0.1.0` could not tell a
 * palette emitted before the fix from one emitted after it.
 */
export const ENERGY_VERSION = ENERGY_A_VERSION

/**
 * Produce a palette for one image.
 *
 * Throws rather than degrading: `NoFeasibleConfigurationError` when the search reaches no legal
 * configuration at all, and `MeasureError` for an input `src/measure/` refuses (no header dimensions,
 * genuinely transparent pixels, an image too large for exact integer moments). A failed dev-loop row
 * naming one of those is information; a repaired palette is not.
 */
export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { emit } = await import("../src/search/index.ts")
	const { palette } = await emit(imagePath, { arm: "a" })
	return palette
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
