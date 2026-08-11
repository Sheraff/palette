/**
 * # `p1a-v1` — arm A at the v1 operating point (λ = 0.1, 240 s)
 *
 * The mechanism is `p1a.ts`'s, unchanged: explanatory cost in nats per unit image mass, plus λ·Ω(x)
 * over the structural elements. What is different is the *operating point*, and only the operating
 * point — this module is `p1a.ts` with two numbers moved off their defaults and frozen as constants.
 *
 * ## Why a second module rather than an argument
 *
 * `src/devloop/types.ts` states the rule this file obeys: *"A candidate with a knob is two
 * candidates; make it two modules, or make the knob a constant with a provenance tag like everything
 * else in v3."* λ moved from the `[UNCALIBRATED]` 1.0 to a `[MEASURED]` 0.1 after the λ probe, and a
 * budget four times the default came with it. Both belong to the run, so both are frozen here and
 * `paletteOf` still takes nothing but a path. `p1a.ts` stays exactly as it was: the v0 rows in the
 * warehouse were emitted by that module at those defaults, and rewriting it would make the row and
 * the code disagree about what produced the palette.
 *
 * ## What the probe actually established
 *
 * `data/lambda-probe/LAMBDA.md` (6 stratified demo-20 covers × λ_A ∈ {0.05, 0.1, 0.25, 0.5, 1} ×
 * {60 s, 240 s}, 72/72 cells) split the v0 collapse into two causes. λ-priced degeneracy is the
 * dominant one — at λ=1 arm A published 2 roles on 11/12 cells, reproducing v0's 20/20 — and
 * structure appears monotonically as λ drops. Budget is real but secondary and **bidirectional**:
 * 4× changes the winner on ~1/3 of cells, sometimes removing structure that under-search had been
 * spuriously adding. Neither number is a fit to a target; each is the point the probe read off.
 *
 * The probe's residue is carried, not hidden: 2/6 covers still collapse at every λ down to 0.05 at
 * the honest budget, recorded there as an arm-A **data-term** property and explicitly out of v1
 * scope. This module does not try to reach them.
 *
 * ## Identity
 *
 * `candidateId` is `"p1a-v1"`, so dev-loop rows, cache paths and the viewer never confuse a v1
 * palette with a v0 one. `ALGORITHM_VERSION` is `"p1a-0.2.0"`: the algorithm's identity moves when
 * its operating point does, even though not a line of the search changed. See the constant's note
 * for the one place that string does not yet reach.
 *
 * Diagnostics do not leave `paletteOf`, and `src/search/` is imported dynamically so that listing
 * the candidates loads no native decoder — both for the reasons `p1a.ts` gives at length.
 */

import type { CandidatePalette, CandidateModule } from "../../../src/devloop/types.ts"
import type { Palette } from "../../../src/contract/types.ts"
import { ENERGY_A_VERSION } from "../src/energy/a/constants.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1a-v1"

/**
 * `[HELD]` — arm A's energy at 0.2.0 (the DESIGN-9 ink-term fix) with λ at the probe's 0.1.
 *
 * Stated as a literal rather than read from `ALGORITHM_VERSIONS` in `src/emit/palette.ts`, which
 * still maps `p1a → "p1a-0.1.0"`. The consequence is worth naming rather than burying: `emit()`
 * stamps `PaletteMetadata.algorithmVersion` from *that* table, keyed by arm, so a palette emitted
 * through this module carries `"p1a-0.1.0"` in its metadata until the table is updated — the run
 * header's `lambda`/`budgetMs` fields are what currently separate a v1 row from a v0 one. Updating
 * `src/emit/palette.ts` is outside this module's remit.
 */
export const ALGORITHM_VERSION = "p1a-0.2.0"

/**
 * The energy this candidate minimises, by its own version string.
 *
 * `[HELD]` — read from `src/energy/a/constants.ts` rather than restated, so the two cannot drift.
 * Unchanged from `p1a.ts`: λ is priced *by* the energy, it is not part of it.
 */
export const ENERGY_VERSION = ENERGY_A_VERSION

/**
 * The exchange rate between explanatory cost and structural cost, in nats per structural element.
 *
 * `[MEASURED]` — `data/lambda-probe/LAMBDA.md`, "Operating point for the v1 re-emission": *"λ_A =
 * 0.1 `[MEASURED]` — anchor: the round demanded structure on structured artwork (item 2: a 4-colour
 * artwork described with 2), and 0.1 is the largest probed λ giving structure on 4/6 covers at the
 * honest (4×) budget while the flat-tending covers still collapse. λ=0.05 buys nothing further."*
 *
 * Largest, not best: a smaller λ buys the same structure at a weaker prior, so the probe took the
 * most conservative point that clears the anchor.
 */
export const LAMBDA = 0.1

/**
 * The per-image search allowance, in milliseconds.
 *
 * `[DISCLOSED]` — `data/lambda-probe/LAMBDA.md`: *"Budget 240 s/image for the re-emission, both
 * arms `[DISCLOSED]` — a compute knob, not a mechanism change; chosen because 1× budget demonstrably
 * reports spurious structure in both directions. Header records it."* It buys a truer optimum under
 * the same energy, so it can change what is published without changing what is being asked; that is
 * exactly why it is disclosed as a knob and recorded in the run header rather than left implicit.
 *
 * `emit()` spends this as a deterministic counter, not a clock — the same file and options give a
 * byte-identical palette on a fast machine and a slow one.
 */
export const BUDGET_MS = 240000

/**
 * Produce a palette for one image, at the v1 operating point.
 *
 * Throws rather than degrading — `NoFeasibleConfigurationError` and `MeasureError`, exactly as
 * `p1a.ts` describes. A failed dev-loop row naming the error is information; a repaired palette is
 * not.
 */
export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { emit } = await import("../src/search/index.ts")
	const { palette } = await emit(imagePath, { arm: "a", lambda: LAMBDA, budgetMs: BUDGET_MS })
	return palette
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
