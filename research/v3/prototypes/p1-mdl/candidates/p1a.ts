/**
 * # `p1a` — arm A: explanatory cost in nats, plus λ·Ω
 *
 * **Scaffold. The search is not wired up yet and this module says so by throwing.**
 *
 * The mechanism, from `DESIGN.md` §"The internal experiment": explanatory cost in nats per unit
 * image mass, plus λ·Ω(x), where Ω counts structural elements — surface≠background: 1; ramp: 1; each
 * interior stop: 1; accent≠foreground: 1. Field/ink membership is soft: a logistic in the extent
 * statistic e(p) from a dyadic box-mean ladder, with the split scale s* optimised jointly. The
 * residual model is a uniform density over the sRGB gamut, parameter-free — arm A keeps its own, and
 * that difference from arm A′ is part of the prior under test.
 *
 * ## Why a throwing scaffold exists at all
 *
 * Three reasons, and each one is a thing that would otherwise be discovered late:
 *
 * 1. **The devloop can load it now.** `CandidateModule` requires `candidateId` and `paletteOf`; a
 *    module that satisfies the interface can be pointed at by a run, a set file, and a viewer URL
 *    before the search exists, so the wiring is debugged separately from the algorithm.
 * 2. **The version strings are fixed before there is a result to name.** `ALGORITHM_VERSION` here is
 *    what will appear in every warehouse row for this arm.
 * 3. **It fails loudly and by name.** `NotYetWiredError` names the wiring step, so a run that
 *    reaches this module produces 20 failed rows saying *which* step is missing rather than a stack
 *    trace about undefined.
 *
 * **Importable with no side effects**: no file reads, no decoding, no `sharp` at import time.
 */

// Imported from the two decoder-free modules by name rather than through `src/emit/index.ts`, which
// re-exports `source-meta.ts` and so would load `sharp` — a native binding — at import time. See
// this file's header on side effects.
import type { CandidatePalette, CandidateModule } from "../../../src/devloop/types.ts"
import type { Palette } from "../../../src/contract/types.ts"
import { ALGORITHM_VERSIONS } from "../src/emit/palette.ts"
import { NotYetWiredError } from "../src/emit/types.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1a"

/** `[UNCALIBRATED]` — a label, not a measurement. See `ALGORITHM_VERSIONS` in `src/emit/palette.ts`. */
export const ALGORITHM_VERSION = ALGORITHM_VERSIONS.p1a

/**
 * The wave-3 step that has to land before this module can produce a palette. Quoted verbatim in the
 * error so the message is actionable without opening this file.
 */
export const WIRING_STEP =
	"wave 3 — wire src/measure/ (per-triple table, dyadic ladder, smoothed density) into src/energy/a.ts, then src/search/ v0 (coarse exhaustive over the colour lattice), then call toPalette() from src/emit/"

export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	throw new NotYetWiredError(
		`candidate ${candidateId} (${ALGORITHM_VERSION}) has no search yet and cannot produce a palette for ${imagePath}. Blocked on: ${WIRING_STEP}.`,
	)
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
