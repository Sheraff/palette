/**
 * # Constants of arm A′'s energy
 *
 * `CONVENTIONS.md`: every constant is named and carries a provenance tag plus one line saying where
 * the value comes from. There are five here and **not one of them is a free parameter fitted to
 * anything**: one is `DESIGN.md`'s declared λ, three are arithmetic identities, and one is the
 * alphabet size of a textbook chain code.
 *
 * The colour-space length scale is deliberately absent. Arm A′'s kernel bandwidth is the frozen
 * regional same-colour bar and it is `[INHERITED]` through `src/measure/kernel.ts`, which is the only
 * place in this prototype allowed to touch it (`DESIGN.md` decision 1). This file must never grow a
 * bandwidth.
 */

/**
 * The version of the energy this directory computes.
 *
 * `[DERIVED]` — a name, not a number. It existed only as a string literal in `src/search/run-emitter.ts`
 * (`"p1ap-energy-0.1.0"`), so a stored result recorded a version the energy itself could not state;
 * that hygiene gap is recorded closed here. **0.2.0** is the chromatic residual (`chromatic.ts`,
 * `DESIGN.md` fold item 11): every number this module produces changed, so results carrying 0.1.0 and
 * 0.2.0 are never comparable and the string is what says so.
 */
export const ENERGY_APRIME_VERSION = "p1ap-energy-0.2.0"

/**
 * λ — the exchange rate between `L(pixels | P)` and `L(P)`.
 *
 * `[UNCALIBRATED]` — `prototypes/p1-mdl/DESIGN.md` decision 2 verbatim: *"λ v0 = 1.0,
 * `[UNCALIBRATED]`, with a mandatory sensitivity sweep λ ∈ {¼, ½, 1, 2, 4} in the falsifier stage.
 * The λ review round (arm A §4.3) comes only after the sweep says the answer isn't flat."* Both
 * halves are already in bits, so 1.0 is the *identity* exchange rate rather than a tuned one — but
 * "the natural value" is not evidence that it is the right one, hence the tag and the sweep.
 */
export const DEFAULT_LAMBDA = 1.0

/**
 * Bits per step of the ink support code.
 *
 * `[DERIVED]` — `log₂ 8 = 3`, the alphabet size of a **Freeman 8-direction chain code**: from any
 * pixel of a mark, its successor along the mark is one of eight neighbours. Arm A′ §2.5 asks for the
 * ink support to be priced *"under an edge/run code"* and names no code; the chain code is the
 * standard one and its per-step length is fixed by counting directions, not by choosing a number.
 *
 * What this buys the split: a mark one pixel wide has one chain step per on-pixel, so it costs
 * 3 bits per pixel of support — cheap when the mark is small, ruinous when it is broad. That is the
 * whole of *"stroke-like is cheap under an edge/run code"*, made arithmetic. See `support.ts` for
 * what it is being compared against and for the approximation this constant sits inside.
 */
export const CHAIN_CODE_DIRECTION_BITS = 3

/**
 * The second moment, per axis, of a uniform distribution over one pixel.
 *
 * `[DERIVED]` — `∫₋½^½ u² du = 1/12`. Added to each diagonal entry of a triple's spatial covariance
 * before the footprint is taken, so that a triple occupying a single pixel, or a perfectly
 * one-dimensional support such as a single image row, has a footprint of about one pixel rather than
 * a determinant of exactly zero. It is the pixel's own extent, not a smoothing choice: without it
 * `sqrt(det Σ)` is 0 for supports that genuinely exist.
 */
export const PIXEL_SECOND_MOMENT = 1 / 12

/**
 * Turns `sqrt(det Σ)` into an area.
 *
 * `[DERIVED]` — for pixels spread uniformly over a disc of radius `R`, `Σ = (R²/4)·I`, so
 * `sqrt(det Σ) = R²/4` and the disc's area `πR²` is exactly `4π·sqrt(det Σ)`. The factor is
 * therefore the one that makes "covariance footprint" equal "area" for the reference shape, rather
 * than a scale someone picked. For a uniform rectangle the same factor overstates the area by
 * `π/3 ≈ 1.047`, i.e. under 5%, which is far below anything the fill ratio is read to.
 */
export const FOOTPRINT_AREA_FACTOR = 4 * Math.PI

/**
 * The tie-break order when two code families price a triple identically: **field, then ink, then
 * generic**.
 *
 * `[DERIVED]` — from `DESIGN.md`'s determinism rule (*"canonical sort + fixed tie-break"*), not from
 * data. On an exact tie the more structured explanation wins. Exact ties are not reachable on any
 * real image (the three codes are continuous functions of unrelated quantities), so this decides
 * nothing statistical; it exists so that when a hand-built degenerate fixture does produce one, two
 * runs still agree. `assemble()` in `index.ts` implements it as the order of its `if` chain, and
 * `CODE_FAMILIES` in `types.ts` is the same list in the same order.
 */
export const CODE_FAMILY_TIE_BREAK = ["field", "ink", "generic"] as const
