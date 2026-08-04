/**
 * Lattice constants — the quadrature parameters of P6's figure–ground measure.
 *
 * Two of the numbers here are the ones proposal §3 warns about: the bandwidth `h` (free parameter 1,
 * anchored and checkable) and the lattice resolution (a *quadrature* choice that is legitimate only
 * while it is bounded well below the bandwidth — "if anyone tunes it, the design has been
 * violated"). Everything else in this file is derived from those two, or inherited from the
 * contract. There are no exchange rates here; rates live only in `../energy/rates.ts`.
 */

import { POOLED_SAME_COLOR_BAR, SAME_COLOR_BAR_BY_REGION } from "../../../../src/contract/constants.ts"

/**
 * **Neighbourhood bandwidth `h`** — the standard deviation, in OKLab units, of the Gaussian kernel
 * that every candidate statistic is an area integral against (proposal §2.2, free parameter 1).
 *
 * `[INHERITED]` — this *is* `POOLED_SAME_COLOR_BAR` (0.01535), the contract's pooled same-colour
 * bar, taken unchanged from `src/contract/constants.ts`. The proposal's anchor is literally "h at
 * the scale of the same-colour bar"; the pooled bar is the contract's own scalar statement of that
 * scale, sitting inside the four regional bars it was pooled from
 * (`SAME_COLOR_BAR_BY_REGION`: {@link SAME_COLOR_BAR_BY_REGION} spans 0.00932 … 0.02293).
 *
 * **Why the pooled bar is the legitimate one to read here.** Its own docstring rules it out for the
 * distinctness invariant, because pooling was refuted as a *per-pair judgement*. This is not a
 * per-pair judgement — it is the width of one quadrature kernel that is convolved over the whole
 * lattice in one separable pass, so it cannot be region-dependent without abandoning the single
 * convolution the design is built on. That is exactly the "one legitimate use of a scalar" the
 * constant documents. The distinctness *barrier* (W4) still calls `sameColorBar()` per pair and is
 * unaffected by this value.
 *
 * `[MEASURED]`-checkable, and checked: `tests/lattice.test.ts` → "bandwidth calibration on a real
 * artwork" asserts that at this `h` a mid-mass artwork colour carries neighbourhood mass on the
 * 1e-2 scale (the corpus's median endorsed-role-colour share is 1.91e-2) rather than the 1e-4 scale
 * of an exact-triple share (8.89e-5). That is an order-of-magnitude falsification test, not a fit:
 * nothing here was tuned to hit 1.91e-2.
 */
export const LATTICE_BANDWIDTH = POOLED_SAME_COLOR_BAR

/**
 * Cell width of the OKLab quadrature lattice, expressed as cells per bandwidth: `cell = h / ratio`.
 * The builder takes the **highest** resolution in this list whose grid fits
 * {@link LATTICE_CELL_BUDGET}; measured on real artworks that is 1.75, and only an image whose
 * colours span most of the sRGB gamut falls back to 1.5.
 *
 * `[MEASURED]` — measured, not chosen. The quantity that matters is the **sub-cell phase ripple**:
 * how much the composite splat→convolve→read kernel varies depending on where a colour happens to
 * sit inside its cell. A statistic that carries that ripple is a statistic the grid decided, and a
 * ±1 LSB dither moves a colour by a fraction of a cell, so the ripple is a direct threat to the
 * paradigm's own robustness claim rather than a cosmetic error.
 *
 * Measured worst-case ripple on `presence`, over a full sweep of phases and separations, with the
 * assignment inverted in the kernel (`grid.ts` → `buildKernel`):
 *
 * | cells per bandwidth | trilinear (SPEC) | triquadratic (built) |
 * |---|---|---|
 * | 1.5 | 27.6% | 1.7% |
 * | 1.75 | 19.1% | 0.9% |
 * | 2 | 14.1% | 0.5% |
 *
 * That table is why the assignment is triquadratic and why this list stops at 1.5: the whole range
 * is inside "no cell boundary can flip an outcome" for the built scheme and none of it is for the
 * specified one. `tests/lattice.test.ts` asserts that the two ends of this list produce the same
 * statistics; if they ever did not, the lattice would have stopped being quadrature and become a
 * decision, which is the defect proposal §3 names.
 */
export const LATTICE_CELLS_PER_BANDWIDTH = [2, 1.75, 1.5] as const

/**
 * Nodes per axis touched by one splat or one read: 3, a quadratic B-spline (27 nodes in three
 * dimensions).
 *
 * `[MEASURED]` — **a deviation from SPEC, which says trilinear (2 nodes).** The table above is the
 * measurement that forced it: trilinear leaves a 14% sub-cell ripple at the finest cell width the
 * memory budget permits, and closing that by resolution alone needs `cell ≈ h/7`, which is
 * gigabytes. Interlacing two half-cell-offset grids reaches 3.5% at double the cost. One extra node
 * per axis reaches 0.5%. The B-spline is also C¹, so every statistic stays Lipschitz in the pixels,
 * which is the property the proposal actually asks the trilinear splat for.
 */
export const LATTICE_ASSIGNMENT_NODES = 3

/**
 * Soft ceiling on total lattice cells, before the resolution falls back one step.
 *
 * `[REVIEWED]` — a memory budget, not a quality knob. At 15 accumulator channels of Float64 this is
 * 34 MB, against the proposal's ≈12 MB of OKLab planes plus its blur ladder; the worst case it
 * permits (a near-full-gamut image at the coarsest ratio, ≈111×69×69) is 61 MB. An ordinary artwork
 * lands at ratio 1.75 and ≈32 MB; only an image whose colours span most of the sRGB gamut falls to
 * 1.5. Raising or lowering it changes only which of {@link LATTICE_CELLS_PER_BANDWIDTH} is used, and
 * the quadrature-invariance test asserts that choice does not move statistics — which is the whole
 * argument that this constant is allowed to be a budget rather than a decision.
 */
export const LATTICE_CELL_BUDGET = 300_000

/**
 * Truncation radius of the discrete 1-D kernel, in units of its own standard deviation.
 *
 * `[MEASURED]` — a Gaussian truncated at 4σ discards 6.3e-5 of its integral, and `grid.ts`
 * renormalises the *truncated* kernel so its integral is exact regardless; 4σ is where the shape
 * error from truncation (~1e-4 relative, at the extreme tail where the kernel value is already
 * 3e-4) sits below the aliasing floor above. Larger costs time linearly and buys nothing.
 */
export const LATTICE_KERNEL_TRUNCATION_SIGMAS = 4

/**
 * Width of the border annulus, as a fraction of the image's short edge. `borderAffinity` is a
 * candidate's mass fraction inside this annulus divided by the annulus's own area fraction.
 *
 * `[HELD]` — proposal §4 claims this belongs to free parameter 2 (the scale ladder's extent), and
 * concedes an auditor may charge it as an eighth parameter; the P6 README carries it as ledger row
 * **7b** in the ladder-extent decision family. It is held, not measured: the ladder runs from
 * short-edge/2 to short-edge/64 and 1/16 sits inside that span, near its geometric middle
 * (short-edge/11.3), which is the scale at which "touches the frame" stops meaning "is the frame".
 * On a square image this annulus covers 23.4% of the frame; the statistic divides by the *exact*
 * measured area fraction, so the width changes the statistic's sensitivity, never its 1.0 = "no
 * preference" calibration.
 */
export const BORDER_ANNULUS_SHORT_EDGE_FRACTION = 1 / 16

/**
 * Additive floor on the mass denominator of every ratio statistic.
 *
 * `[REVIEWED]` — a continuity device, not a threshold. The ratio statistics (habitual ground, field
 * likeness, spatial spread, border affinity, centroid distance) divide by presence mass, and a
 * *hard* zero-mass branch would be exactly the kind of discontinuity the design exists to remove.
 * Adding this floor to the denominator makes every ratio continuous everywhere and sends each one
 * to its least-committal value as mass → 0 (habitual ground and centroid → the query point itself,
 * the rest → 0). Any candidate that is an actual artwork triple carries mass ≥ ~1 pixel-weight, so
 * the induced bias is ≤ 1e-9 relative and cannot move a comparison.
 */
export const LATTICE_MASS_FLOOR = 1e-9

/**
 * The spatial spread of a candidate whose mass fills the frame uniformly, in normalised frame
 * coordinates: Var(u) + Var(v) = 1/12 + 1/12.
 *
 * `[REVIEWED]` — arithmetic, not a measurement. `CandidateStats.spatialSpread` is reported as the
 * trace of the mass-normalised second central moment *divided by this*, so 1.0 means "as spread out
 * as a uniform fill of the frame" and 0 means "a point". The division is presentation only; it
 * mirrors `borderAffinity`'s stated 1.0 = no-preference convention so the two spatial statistics
 * read on the same scale.
 */
export const UNIFORM_FRAME_SPATIAL_SPREAD = 1 / 6

/** Number of accumulator channels splatted onto the lattice. See `grid.ts` for the channel map. */
export const LATTICE_CHANNELS = 15
