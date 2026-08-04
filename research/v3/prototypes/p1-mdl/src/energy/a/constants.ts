/**
 * # Constants of arm A's energy
 *
 * `CONVENTIONS.md`: every constant is named and carries a provenance tag plus one line saying where
 * the value comes from. Nothing here is a bare literal at its use site.
 *
 * Arm A's whole claim is that this trade needs **one** human-set constant (λ) and not nine hundred.
 * That claim is only honest if everything else in this file is either inherited from a measured
 * quantity, derived from the model's own arithmetic, or a numerical-accuracy knob whose refinement
 * demonstrably does not move an answer. Each entry below says which of the three it is.
 */

import { ESCAPE_COST_BITS } from "../../emit/cost.ts"

/**
 * The version this energy's serialised results answer to.
 *
 * [UNCALIBRATED] — a label, not a measurement. Bumped by hand when a term is added, removed or
 * redefined, so a stored energy can never be silently compared against one from a different model.
 */
export const ENERGY_A_VERSION = "p1a-energy-0.1.0"

/**
 * **λ — the model-order cost, in nats per unit image mass per structural element.**
 *
 * [UNCALIBRATED] — `prototypes/p1-mdl/DESIGN.md` decision 2 fixes v0 at 1.0 and requires a
 * sensitivity sweep λ ∈ {¼, ½, 1, 2, 4} in the falsifier stage before any review round on it. Arm A
 * §4.3 is explicit that this number *cannot* be derived and *cannot* be zero: the data term is a
 * per-unit-mass cross-entropy precisely so that model order does not depend on pixel count, which
 * leaves the structural trade needing its own scale-free constant.
 *
 * For scale: with the identity-bar kernel and the uniform-gamut residual below, explaining a unit of
 * mass rather than leaving it unexplained is worth roughly 6–8 nats, so λ = 1 prices one structural
 * element at about one seventh of the mass it would have to explain to pay for itself.
 */
export const DEFAULT_LAMBDA = 1.0

/**
 * **w — the field/ink softness, in ladder octaves.**
 *
 * [INHERITED] — arm A §4.2 anchors the softness at *"one octave of the dyadic ladder — the ladder's
 * own resolution. No sharper value is defensible and a much softer one erases the distinction."*
 * The logistic is taken in **rung** units (see `split.ts`, which maps the extent statistic onto the
 * ladder's own geometric scale), so "one octave" is literally 1 here and carries no free digits.
 */
export const FIELD_INK_SOFTNESS_OCTAVES = 1

/**
 * Grid resolution per sRGB axis for the gamut-volume quadrature in `gamut.ts`.
 *
 * Derived-and-stated. The volume is computed by mapping the corners of an `n³` grid of the sRGB cube
 * into OKLab and summing a six-tetrahedron decomposition of each image cell. Measured convergence:
 *
 * ```
 *   n =  8   0.05417123      n = 32   0.05419309
 *   n = 16   0.05418657      n = 48   0.05419491
 *                            n = 64   0.05419576
 * ```
 *
 * At n = 16 the value is within 1.7e-4 *relative* of n = 64 and costs ~5 ms, computed once per
 * process. A 0.017% move in the residual density moves `−log ρ` by 1.7e-4 nats — four orders below
 * the smallest energy difference this prototype ever compares. `tests/energy-a/gamut.test.ts`
 * re-derives at a finer grid and checks the agreement rather than trusting this note.
 */
export const GAMUT_VOLUME_GRID = 16

/**
 * Where the Gaussian **density** is truncated, in bandwidths.
 *
 * Derived-and-stated, and deliberately **not** the measurement layer's four bandwidths. The measure
 * layer truncates a kernel whose peak is 1, where `exp(-4²/2) = 3.35e-4` is negligible. Here the
 * kernel is divided by its normalising constant `(2π)^{3/2} h³ ≈ 1.3e-5`, so the same tail is worth
 * ≈ 26 density units — *larger* than the uniform residual (≈ 18.5) it would be compared against.
 * Truncating there would put a step comparable to the residual floor into the objective.
 *
 * At eight bandwidths the density is `exp(-32)/Z ≈ 1e-9`, ten orders below the residual, so dropping
 * it cannot move `−log ρ` by more than about 1e-10 nats. This is a speed device with a bound, not a
 * modelling choice.
 */
export const DENSITY_TRUNCATION_BANDWIDTHS = 8

/**
 * Floor (and, by symmetry, ceiling) on a mixture weight.
 *
 * Derived-and-stated: this is what makes the energy **total**. Without it a residual weight driven to
 * exactly zero by the EM profile would give `−log 0 = ∞` for any triple the model puts no density on,
 * and `DESIGN.md` requires the energy to be finite for every contract-shaped configuration. At 1e-9
 * the worst per-triple surprisal is bounded by `−log(1e-9 · ρ₀) ≈ 17.8` nats, and no real image gives
 * a population weight anywhere near this floor — the field and ink weights on the corpus sit between
 * 1e-3 and 1, six orders above it.
 */
export const MIXTURE_WEIGHT_FLOOR = 1e-9

/**
 * Iteration cap and convergence tolerance for the residual-weight EM in `mixture.ts`.
 *
 * Derived-and-stated. EM on a **two**-component mixture with fixed component densities and one free
 * weight is a monotone one-dimensional fixed-point iteration on a concave log-likelihood, so it
 * cannot oscillate and cannot find a second optimum. The tolerance is on the weight itself: a 1e-10
 * move in a mixture weight moves the cost by at most 1e-10 · |d(−log ρ)/dε| ≲ 1e-9 nats. The cap is
 * a guard against a pathological flat likelihood, not the normal exit — `tests/energy-a` records the
 * observed iteration counts, which are well under it.
 */
export const MIXTURE_EM_MAX_ITERATIONS = 64
export const MIXTURE_EM_TOLERANCE = 1e-10

/**
 * bits → nats.
 *
 * [DERIVED] — not a choice. A message of `b` bits is `b · ln 2` nats, because one bit is the
 * information in one equiprobable binary choice and `−log_e(1/2) = ln 2`. This is the *only*
 * conversion applied to `src/emit/cost.ts`'s bit counts, and it is applied to the escape charge
 * alone: arm A prices structure with λ·Ω, not with L(P), so no other part of `cost.ts` enters here.
 */
export const BITS_TO_NATS = Math.LN2

/**
 * The escape charge, in nats.
 *
 * [INHERITED] — `src/emit/cost.ts:ESCAPE_COST_BITS` (1024 bits, itself `[UNCALIBRATED]` there with
 * its derivation as a barrier that no in-artwork configuration can be outranked by), converted at
 * `BITS_TO_NATS`. Arm A §2.4 makes the escape *a widening, not a preference*: the search runs over
 * the in-artwork feasible set and only reaches the escape when that set is empty. Sharing arm A′'s
 * barrier rather than inventing a second one keeps the two arms' escape behaviour identical, so the
 * internal experiment compares priors and not two different escape conventions.
 *
 * ≈ 709.78 nats — three orders above any explanatory difference this energy can produce, which is
 * the point.
 */
export const ESCAPE_COST_NATS = ESCAPE_COST_BITS * BITS_TO_NATS

/**
 * `(2π)^{3/2}` — the normalising constant of a three-dimensional isotropic Gaussian, less `h³`.
 *
 * [DERIVED] — arithmetic. `∫ exp(-‖x‖²/2h²) dx = (2π)^{3/2} h³` over ℝ³.
 */
export const GAUSSIAN_NORMALISER_3D = (2 * Math.PI) ** 1.5
