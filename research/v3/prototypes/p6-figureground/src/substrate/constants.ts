/**
 * Every named constant the substrate uses, with its provenance tag (SPEC rule 4).
 *
 * Nothing here is an exchange rate. Exchange rates live only in `src/energy/rates.ts` (SPEC rule 4)
 * and the substrate has none: it produces measurements, it does not trade them off. What is here is
 * either geometry (the ladder), quadrature (the box-blur pass count, the 8-bit table size) or a
 * scale inherited from the contract (the field-weight softness).
 */

// ---------------------------------------------------------------------------------------------
// The scale ladder (proposal §2.1; free parameter 2 in the proposal's §4 ledger)
// ---------------------------------------------------------------------------------------------

/**
 * How many blurred surrounds the ladder carries.
 *
 * `[HELD]` — proposal §2.1 ("scales σ₁ … σ_K, geometrically spaced from about half the short edge
 * down to about a sixty-fourth of it") and `PHASE_2_HANDOFF`'s P6 brief, which fixes six levels. Six
 * levels with the extent below give an exact factor-of-two ladder, so the value is not independently
 * chosen: it is what makes `COARSEST` and `FINEST` land on a power-of-two spacing.
 */
export const LADDER_LEVELS = 6

/**
 * The coarsest surround scale, as a fraction of the image's **short edge**.
 *
 * `[HELD]` — proposal §4 decision 2, anchored by geometry, not measurement: "the coarsest scale
 * large enough that a field is its own surround". Half the short edge is the largest scale at which
 * a blurred surround still varies across the frame at all; anything coarser is one number for the
 * whole image and answers no figure–ground question. Scale-free by construction
 * (`CONVENTIONS.md`: area fractions and normalised coordinates, never raw pixel counts).
 */
export const LADDER_COARSEST_SHORT_EDGE_FRACTION = 1 / 2

/**
 * The finest surround scale, as a fraction of the short edge.
 *
 * `[HELD]` — proposal §4 decision 2 and §9(a): "the finest small enough that lettering reads as
 * figure", stated in the proposal as a **placeholder for the measured resolution floors that Phase 0
 * did not deliver**. It is one of the two digits of that one decision, and it is the digit most
 * likely to move when the floors are measured. Checkable at dev time against the oracle's
 * `text_dominance` strata.
 */
export const LADDER_FINEST_SHORT_EDGE_FRACTION = 1 / 64

// ---------------------------------------------------------------------------------------------
// Blur quadrature
// ---------------------------------------------------------------------------------------------

/**
 * How many box passes approximate one Gaussian in each separable direction.
 *
 * `[INHERITED]` — the classical repeated-box construction (Wells 1986; box widths after Kovesi 2010,
 * implemented in `blur.ts`). Three passes is the standard operating point: it costs O(1) per pixel
 * per pass regardless of σ, which is what makes a full-resolution ladder at σ = shortEdge/2
 * affordable at all (proposal §2.1 forbids decimation). Measured accuracy, from
 * `tests/substrate.test.ts`: the realised σ is within **~0.17 px of the requested σ, flat in σ**
 * (2% at σ = 8, 0.3% at σ = 64), while the kernel *shape* differs from the matching Gaussian by
 * about **7% of peak / 5% of mass**. The shape
 * error is the price of the pass count and is disclosed rather than approximated away.
 *
 * This is **quadrature, not a decision** — the same standing as the lattice resolution in proposal
 * §3. Raising it makes the ladder marginally more Gaussian and marginally slower; it must not be
 * tuned to move an outcome.
 */
export const GAUSSIAN_BOX_PASSES = 3

/**
 * Below this σ (in pixels) a blur step is the identity.
 *
 * `[HELD]` — a numerical guard, not a modelling choice. Kovesi's box widths degenerate to width 1
 * (the identity) for σ below about 0.6 px anyway; naming the floor makes the degeneracy explicit
 * instead of implicit. It can only ever fire on images small enough that shortEdge/64 < 1 px, where
 * "the finest scale" has no pixels to average.
 */
export const MIN_BLUR_SIGMA = 0.5

// ---------------------------------------------------------------------------------------------
// Field-likeness
// ---------------------------------------------------------------------------------------------

/**
 * The softness of the field-likeness weight, **in multiples of the pixel's own regional same-colour
 * bar**.
 *
 * `[HELD]` at exactly 1, and the 1 is the point: it introduces no digit of its own. Proposal §2.1
 * defines field as "a pixel whose displacement is near zero at every scale — it *is* its own
 * surround", and the contract already owns the answer to "is this the same colour as that":
 * `SAME_COLOR_BAR_BY_REGION` (`[REVIEWED]`, bracketing rounds 1+2). So the scale at which a pixel
 * stops being its own surround is the scale at which the contract stops calling the two the same
 * colour. The weight is `1 / (1 + (maxₖ‖dₖ‖ / bar)²)`: exactly 1 when the pixel is its own surround
 * at every scale, exactly ½ at one bar of displacement, decaying after that.
 *
 * ## Why a rational falloff and not a Gaussian one — measured, 2026-08-04
 *
 * The first implementation used `exp(−(d/bar)²)`, which is the obvious choice and is **wrong here**,
 * for a reason that only shows up on images rather than in the algebra. The coarsest rung sits at
 * σ = shortEdge/2, so the surround there is nearly one colour for the whole frame; on a dark cover
 * carrying even 0.7% bright content the coarse surround is displaced from the dark field by ~0.19 in
 * OKLab, which is **twenty** dark-neutral bars. A Gaussian weight returns exactly 0 there — and 0 at
 * the lettering too. Measured on the synthetic ink fixture in `tests/substrate.test.ts`: field and
 * ink both weighed literally zero, so `fieldWeight` was an all-zero plane and the measure Φ that
 * `src/fieldmodel/` integrates would have been empty. A weight that saturates is not a weight.
 *
 * The rational kernel keeps the same anchor, the same monotonicity and the same value at zero, and
 * stays strictly positive, so field-likeness remains an **ordering** over pixels at every
 * displacement instead of a mask with a cliff in it. On that same fixture it separates the dark
 * field from the lettering by about 6×, which is the discrimination the field model needs. This is a
 * dependency of the design on heavy tails, and it is stated here rather than buried: the substrate
 * must not hand downstream a quantity whose dynamic range has been annihilated by a kernel choice.
 *
 * The multiple is a `[HELD]` knob rather than an inheritance, because "1 bar" is a reading of the
 * proposal and not something the reviewer ruled. `tools/sensitivity.ts` should perturb it as a
 * quadrature knob (×½, ×2): field-likeness is a weight inside area integrals, so if this moves
 * published palettes materially, that is evidence against the design (proposal §3), not a value to
 * tune.
 */
export const FIELD_WEIGHT_SOFTNESS_BARS = 1

// ---------------------------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------------------------

/**
 * Entries in the sRGB→linear table.
 *
 * `[INHERITED]` — proposal §2.0: "the input is 8-bit, so this is exact arithmetic". 256 is not a
 * resolution choice; it is the cardinality of an 8-bit channel, so the table is a memo of
 * `srgbChannelToLinear` and not an approximation of it.
 */
export const SRGB_TABLE_SIZE = 256

/**
 * The decoder and preprocessing this substrate performs, for `PaletteMetadata.preprocessingVersion`.
 *
 * `[INHERITED]` — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`), and
 * `no-resample` is the `PHASE_0_DECISIONS.md` §1 rule the ladder honours: full resolution, no
 * decimation anywhere (proposal §2.1).
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"
