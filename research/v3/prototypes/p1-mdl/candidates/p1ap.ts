/**
 * # `p1ap` — arm A′: E(P) = L(pixels|P) + λ·L(P)
 *
 * **Scaffold. The search is not wired up yet and this module says so by throwing.**
 *
 * The mechanism, from `DESIGN.md` §"The internal experiment": the energy is a description length in
 * bits. `L(P)` is the contract object's **own serialization cost** — already implemented and
 * unit-tested in `src/emit/cost.ts`, and the one half of this arm that needs no measurement layer.
 * `L(pixels|P)` is the residual under the palette, with field/ink separation coming from the support
 * map's own coding cost (broad, low-frequency regions cheap under a coarse code; stroke-like regions
 * cheap under an edge/run code). The residual model is the image's own smoothed colour density —
 * arm A′ keeps its own, and that difference from arm A is part of the prior under test.
 *
 * The two arms share everything else: the same measurement layer, the same feasible set, the same
 * emitter, the same v0 foreground/accent ordering (`DESIGN.md` §3). Only the energy differs, which
 * is what makes the comparison in M3 a comparison of priors rather than of implementations.
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
export const candidateId = "p1ap"

/** `[UNCALIBRATED]` — a label, not a measurement. See `ALGORITHM_VERSIONS` in `src/emit/palette.ts`. */
export const ALGORITHM_VERSION = ALGORITHM_VERSIONS.p1ap

/**
 * The wave-3 step that has to land before this module can produce a palette. `L(P)` is deliberately
 * not in this list — `serializationCost()` is done — which is what makes the remaining blocker
 * precisely the likelihood half and the search.
 */
export const WIRING_STEP =
	"wave 3 — wire src/measure/ (smoothed colour density, support-map coding cost) into src/energy/aprime.ts as L(pixels|P), combine with the existing serializationCost() as λ·L(P), then src/search/ v0, then call toPalette() from src/emit/"

export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	throw new NotYetWiredError(
		`candidate ${candidateId} (${ALGORITHM_VERSION}) has no search yet and cannot produce a palette for ${imagePath}. Blocked on: ${WIRING_STEP}.`,
	)
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
