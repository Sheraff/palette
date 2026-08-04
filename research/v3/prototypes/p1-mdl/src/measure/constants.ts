/**
 * # Constants of the P1 measurement layer
 *
 * `CONVENTIONS.md`: every constant is named and carries a provenance tag plus one line saying where
 * the value comes from. Nothing here is a bare literal at its use site.
 *
 * The measurement layer has exactly **one** length scale in colour space — the frozen regional
 * same-colour bar — and it is inherited, not chosen. Every other number below is either a structural
 * count (how many ladder rungs, how many quantile bins) or a numerical-accuracy knob whose only
 * defensible property is that refining it does not move a downstream answer. Those are stated as
 * such, with the bound that makes the claim checkable.
 */

import { SAME_COLOR_BAR_BY_REGION } from "../../../../src/contract/constants.ts"

/**
 * The version this measurement's serialised form answers to.
 *
 * [UNCALIBRATED] — a label, not a measurement. Bumped by hand when the shape of `Measurement`
 * changes, so a stored measurement can never be silently read under a different layout.
 */
export const MEASUREMENT_SCHEMA_VERSION = "p1-measure-0.1.0"

/**
 * The decoder and preprocessing this layer used.
 *
 * [INHERITED] — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`), and
 * `no-resample` states the `PHASE_0_DECISIONS.md` §1 rule: native resolution, no downscale.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/**
 * **The one length scale in colour space.** The kernel bandwidth is the frozen regional same-colour
 * bar, per pair, exactly as `src/contract/color.ts:sameColorBar` defines it: the larger of the two
 * colours' regional bars.
 *
 * [INHERITED] — `src/contract/constants.ts:SAME_COLOR_BAR_BY_REGION`, tagged `[REVIEWED]` there
 * (reviewer bracketing rounds 1 and 2 pooled, 140 of 140 pairs, criterion "register-as-same";
 * source of truth `research/v3/data/calibration/bracketing-round-2-analysis.json`). Values
 * 0.00932 / 0.01502 / 0.01627 / 0.02293 by region.
 *
 * `prototypes/p1-mdl/DESIGN.md` decision 1: *the model's one length scale IS the measured identity
 * scale, and nothing may depend on its exact digits.* This module therefore never writes a bar
 * digit; it re-exports the contract's table and derives everything from it. That is also why the
 * bar's own docstring — "roughly one significant figure of real information" — is not a problem
 * here: every use is inside a smooth kernel, so a 10% move in the bar moves the statistic by O(10%)
 * and moves no argmin discontinuously.
 */
export const KERNEL_BANDWIDTH_BY_REGION = SAME_COLOR_BAR_BY_REGION

/**
 * The tightest of the four regional bars, used wherever a *single* conservative colour-space
 * resolution is needed (the lattice cell sides below).
 *
 * Derived-and-stated: `Math.min` over `KERNEL_BANDWIDTH_BY_REGION`, currently `dark-neutral`. Taking
 * the tightest rather than the pooled or loosest bar means the lattice is at least as fine as the
 * finest kernel it ever has to approximate, in every region.
 */
export const TIGHTEST_SAME_COLOR_BAR = Math.min(...Object.values(KERNEL_BANDWIDTH_BY_REGION))

/**
 * Number of rungs on the dyadic box-mean ladder.
 *
 * Derived-and-stated: arm A §2.1 asks for "a dyadic ladder of box means at scales that are fractions
 * of the short edge" and this spec reads that as eight halvings. Rung `s` uses a box of side
 * `shortEdge / 2^s`, so the ladder spans the whole short edge (s=0) down to 1/128 of it (s=7) — at a
 * 300px album cover that is 2.3px, below any stroke width the ink term is meant to separate. Going
 * finer would only add rungs whose box is a single pixel, where the box mean is the pixel itself and
 * the kernel is identically 1.
 */
export const EXTENT_LADDER_SCALES = 8

/**
 * The extent statistic's weight at rung `s` is `2^-s`, so its maximum is this sum.
 *
 * [INHERITED] — the `2^-s` weighting is arm A §2.1's formula verbatim (`e(p) = Σ_s 2^-s κ(δ_s(p))`).
 * The sum is published so a consumer can normalise to [0,1] without re-deriving it; `e` itself is
 * stored unnormalised, as the proposal writes it.
 */
export const EXTENT_WEIGHT_SUM = Array.from(
	{ length: EXTENT_LADDER_SCALES },
	(_unused, scale) => 2 ** -scale,
).reduce((total, weight) => total + weight, 0)

/**
 * Where the Gaussian kernel is truncated, in bandwidths, on the approximate (lattice) paths.
 *
 * Derived-and-stated: `exp(-4²/2) = 3.35e-4`. Contributions past four bandwidths are three and a
 * half orders of magnitude below the kernel's own peak and are dropped so the lattice sum is local.
 * The exact path does not truncate at all, which is what makes the two comparable in a test.
 */
export const KERNEL_TRUNCATION_BANDWIDTHS = 4

/**
 * Above this many distinct triples, smoothed mass switches from the exact O(K²) double sum to the
 * lattice accumulation.
 *
 * Derived-and-stated: 4096² = 1.7e7 kernel evaluations, ~50 ms, which is the most an exact pass may
 * cost inside a per-image budget measured in seconds. It is a *cost* cutoff, not a modelling choice:
 * both sides compute the same quantity, and `Measurement.smoothedMass.mode` records which ran so a
 * result can never be read without knowing.
 */
export const SMOOTHED_MASS_EXACT_MAX_COLORS = 4096

/**
 * Lattice cells per tightest bar, for the smoothed-mass accumulation. Cell side is
 * `TIGHTEST_SAME_COLOR_BAR / SMOOTHED_MASS_LATTICE_CELLS_PER_BAR`.
 *
 * **The refinement-invariance claim.** Refining this constant — making the lattice finer — must not
 * change any downstream argmin. The bound behind the claim: replacing a cell's members by their
 * centroid perturbs a Gaussian kernel value by at most second order in (cell spread / bandwidth). A
 * cell of side `a` has per-axis RMS spread `a/√12`, so `E‖Δ‖² = a²/4` in three dimensions, and the
 * relative kernel error is `≈ ‖Δ‖²/(2h²) ≤ a²/(8h²)`. At `a = h/4` that is 0.78%, and it *shrinks
 * quadratically* as the lattice refines. So the map `c ↦ m(c)` is reproduced to under 1% uniformly,
 * and an argmin can only move if two candidates were already within 1% of each other in smoothed
 * mass — in which case they are within the identity bar of one another and the choice between them
 * was never the lattice's to make.
 *
 * Derived-and-stated (the 0.78% above is the derivation); `tests/measure/smoothed-mass.test.ts`
 * checks it empirically by halving the constant and comparing both the ranking and the values.
 */
export const SMOOTHED_MASS_LATTICE_CELLS_PER_BAR = 4

/**
 * Lattice cells per tightest bar for the (t, colour) joint's colour axis.
 *
 * Derived-and-stated: arm A′ §2.1 asks for "a coarse colour lattice" against the t bins, and one
 * cell per tightest bar is the coarsest lattice that still cannot merge two colours the contract
 * would call distinct in *any* region. Coarser than the smoothed-mass lattice on purpose: the joint
 * is a contingency table whose size is (occupied cells × t bins), and it is read for how a colour's
 * mass is distributed along the ramp, not for a colour-space argmin.
 */
export const JOINT_LATTICE_CELLS_PER_BAR = 1

/**
 * Number of t quantile bins in each (t, colour) joint.
 *
 * Derived-and-stated: arm A′ §2.1 says "a fixed number of t quantile bins" without fixing it. 32
 * bins put ~3% of the image's pixels in each bin, which at a 300×300 cover is ~2,800 pixels per bin
 * — enough that a bin's colour distribution is not noise, and coarse enough that the joint stays
 * small. A power of two so that halving it for a sensitivity check is exact.
 */
export const T_QUANTILE_BINS = 32

/**
 * Bins in the auxiliary histogram used to locate the t quantile edges.
 *
 * Derived-and-stated: t is normalised to [0,1], so quantile edges are located to 1/4096 = 2.4e-4 of
 * the parameter's range — two orders finer than the 1/32 bins they delimit, which is what makes the
 * edge locations irrelevant to the bin contents at any realistic image size.
 */
export const T_HISTOGRAM_BINS = 4096

/**
 * Below this magnitude, a fitted isotropic curvature coefficient is treated as absent and its
 * channel contributes no radial centre.
 *
 * Derived-and-stated: the radial centre is `-β₁/(2β₃)`, which diverges as `β₃ → 0`. Colour is
 * bounded by O(1) in OKLab and normalised position by O(1), so a curvature coefficient below 1e-9
 * cannot displace a centre by less than 1e9 image widths — it is numerical dust, not a fit. Guards a
 * division, decides no model.
 */
export const RADIAL_CURVATURE_EPSILON = 1e-9

/**
 * How far outside the image, in short edges, a fitted radial centre may fall before it is rejected.
 *
 * Derived-and-stated. The closed-form centre is `-β₁/(2β₃)`, and when an image has no radial
 * structure at all — a colour wheel, whose colour is a function of angle alone — `β₃` is numerically
 * zero along one axis and the centre runs off to hundreds of short edges away. That is not a centre;
 * it is the fit reporting that the isotropic term found nothing, and a conic built around it would
 * measure the angle from a point outside the universe of the image.
 *
 * The rule: a centre further than one short edge from the image rectangle is describing curvature the
 * image cannot distinguish from a plane, which the **linear** geometry already carries. So the radial
 * geometry falls back to the spatial centroid and says so (`centreFromCurvature: false`), and its own
 * r² reports how little the quadratic term added. One short edge, rather than zero, because a genuine
 * vignette or corner-lit field can have its centre just outside the frame.
 */
export const RADIAL_CENTRE_MAX_OUTSET = 1

/**
 * Pivot magnitude below which a linear system is declared rank-deficient rather than solved.
 *
 * Derived-and-stated: the normal-equation matrices here are Gram matrices of position monomials over
 * the pixel grid, whose entries are O(1) after normalisation. A pivot below 1e-12 is a genuinely
 * degenerate design (a one-pixel-wide image, a single row), and the geometry is reported degenerate
 * rather than solved through the noise.
 */
export const LINEAR_SOLVE_PIVOT_EPSILON = 1e-12
