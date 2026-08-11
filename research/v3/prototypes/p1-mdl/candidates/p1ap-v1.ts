/**
 * # `p1ap-v1` — arm A′ at the v1 operating point (chromatic residual, λ = 1.0, 240 s)
 *
 * The mechanism is `p1ap.ts`'s: E(P) = L(pixels|P) + λ·L(P), with L(P) the contract object's own
 * serialization cost and the residual taken under the image's own colour density. What moved in v1
 * is *inside* the energy — DESIGN 11's **chromatic residual density**, arm A′'s single recorded
 * repair, which arrives as `p1ap-energy-0.2.0` and needs nothing from this module but to be named.
 *
 * ## Why this module exists at all, given λ did not move
 *
 * Two reasons, and neither is λ.
 *
 * 1. **The budget did.** 240 s/image is the v1 re-emission's allowance for *both* arms, and under
 *    the no-knob rule of `src/devloop/types.ts` a knob frozen as a constant is a new candidate.
 * 2. **The pairing is the instrument.** M3 compares the arms on the same covers, and a comparison in
 *    which one arm searched 4× longer than the other would be a comparison of compute rather than of
 *    priors. `src/search/constants.ts` already costs both arms with the more expensive arm's
 *    coefficients for exactly this reason; the budget has to be held level too.
 *
 * λ stays at the energy's own `DEFAULT_LAMBDA` = 1.0. `data/lambda-probe/LAMBDA.md` states the
 * discipline: *"A′ λ = 1.0 unchanged — its repair is the chromatic residual (0.2.0); the item-2
 * fixture passes at λ=1. One knob per arm per iteration."* Not passing it is deliberate: A′'s λ is
 * not pinned by this module, it is the energy's default, and restating it here as a literal would
 * create a second place for it to drift from.
 *
 * ## The watch item this module inherits
 *
 * The probe's carried-forward note: A′ at 4× bought a 3-stop gradient on 22e7e9d1, *"the excursion
 * probe's stop-buying propensity materializing"*. The longer budget is what surfaced it, and this
 * module is where that budget now lives. DESIGN 13's reading rule applies to anything emitted here —
 * check stop counts and spacings before staging a round on these palettes.
 *
 * Diagnostics do not leave `paletteOf`, and `src/search/` is imported dynamically so that listing
 * the candidates loads no native decoder — both for the reasons `p1a.ts` gives at length.
 */

import type { CandidatePalette, CandidateModule } from "../../../src/devloop/types.ts"
import type { Palette } from "../../../src/contract/types.ts"
import { DEFAULT_LAMBDA, ENERGY_APRIME_VERSION } from "../src/energy/aprime/constants.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p1ap-v1"

/**
 * `[HELD]` — arm A′'s energy at 0.2.0 (the chromatic residual) at the v1 budget.
 *
 * Stated as a literal rather than read from `ALGORITHM_VERSIONS` in `src/emit/palette.ts`, which maps
 * `p1ap → "p1ap-0.1.0"` and is keyed by *arm*, so it has no slot for a second operating point.
 *
 * **Fixed 2026-08-11**, as in `p1a-v1.ts`: `emit()` stamped `PaletteMetadata.algorithmVersion` from
 * that arm-keyed table, so palettes emitted here carried a false `"p1ap-0.1.0"` and only the run
 * header's `budgetMs` separated a v1 row from a v0 one. `paletteOf` now hands `emit()` this constant
 * and the metadata says `"p1ap-0.2.0"`. Provenance only — not a colour moved.
 */
export const ALGORITHM_VERSION = "p1ap-0.2.0"

/**
 * The energy this candidate minimises, by version.
 *
 * `[HELD]` — read from `src/energy/aprime/constants.ts`, where the chromatic residual bumped it to
 * `"p1ap-energy-0.2.0"`, so the repair cannot ship under a version that says it did not happen.
 * `p1ap.ts` used to restate the older string as a literal — written before arm A′ had a version
 * constant — and now reads the same constant; the two arms' v0 and v1 modules therefore report one
 * energy version because they run one energy.
 */
export const ENERGY_VERSION = ENERGY_APRIME_VERSION

/**
 * The exchange rate, in bits per bit of L(P) — arm A′'s own default, restated for the record.
 *
 * `[UNCALIBRATED]` — read from the energy rather than pinned here, and deliberately **not** passed to
 * `emit()`: `paletteOf` omits `lambda`, so the energy's default governs and there is exactly one
 * definition of it. Exported only so a reader (or a test) can see what the operating point was
 * without opening a second file.
 */
export const LAMBDA = DEFAULT_LAMBDA

/**
 * The per-image search allowance, in milliseconds.
 *
 * `[DISCLOSED]` — `data/lambda-probe/LAMBDA.md`: *"Budget 240 s/image for the re-emission, both arms
 * `[DISCLOSED]` — a compute knob, not a mechanism change; chosen because 1× budget demonstrably
 * reports spurious structure in both directions. Header records it."* Identical to `p1a-v1.ts`'s,
 * and that identity is the point — see the module note on why the arms must search level.
 */
export const BUDGET_MS = 240000

/**
 * Produce a palette for one image, at the v1 operating point.
 *
 * Throws rather than degrading — see `p1a.ts`'s note on which errors and why they are not repaired.
 */
export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { emit } = await import("../src/search/index.ts")
	const { palette } = await emit(imagePath, {
		arm: "aprime",
		budgetMs: BUDGET_MS,
		algorithmVersion: ALGORITHM_VERSION,
	})
	return palette
}

/** The module, in the shape `src/devloop/run.ts` loads. */
export const candidate: CandidateModule = { candidateId, paletteOf }
