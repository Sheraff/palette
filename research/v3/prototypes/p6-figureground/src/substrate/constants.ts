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

/**
 * How many of the **coarsest** ladder rungs are excluded from the field-likeness weight.
 *
 * `[MEASURED — 2026-08-04, `tests/substrate.test.ts` "the field-likeness scale band: both anchors,
 * swept over every exclusion"]` **2**, i.e. `fieldWeight` reads rungs σ = shortEdge/8 … /64 and the
 * two coarsest rungs (shortEdge/2, /4) are excluded from it alone.
 *
 * **Read the deviation section before the value.** One of the two anchors the SPEC directive names
 * does not select a value — it is unreachable at every exclusion — so this constant is *not* the
 * output of the directive's rule, and saying otherwise would be the undisclosed deviation SPEC rule
 * 7 calls the campaign's worst failure mode.
 *
 * ## Why the exclusion exists at all — a recorded mechanism repair
 *
 * `arm-e-prime.md` §2.1 defines field as displacement near zero **at every scale**, and this module
 * implemented that literally: `maxₖ‖dₖ‖` over all six rungs. Measured, that definition contradicts
 * §2.3, which exists to model gradients. The coarse surround of a ramp is essentially the ramp's
 * *mean*, which its ends are by construction far from, so `fieldWeight` was ≈0 **at the ends of
 * exactly the gradients the field model is for** (W3: synthetic 256² ramp, rows 0/255 → 0; W1
 * independently on dark fields, where the coarsest rung of a dark cover carrying 0.7% bright
 * content sits ~20 dark-neutral bars off the field). SPEC "Integration directives — wave 2" item 1
 * records the repair: field-likeness is a **fine/mid-scale** question. The coarse rungs are not
 * discarded — they still supply both energy densities (`inkEnergy`/`markEnergy` average over all six
 * rungs, which is what says a stroke is displaced from the page it sits on). They are excluded from
 * this one weight and nowhere else. That much is a deviation from the proposal's words which the
 * directive ordered, to save the proposal's mechanism.
 *
 * *(Amended 2026-08-04: this paragraph used to add "they still supply `FigureGroundField.ground`,
 * which IS `levels[0]`". That is no longer true and the reason is the same locality criterion this
 * constant is selected by — see `HABITUAL_GROUND_RUNG` below.)*
 *
 * ## Anchor (b) — white-on-black text still gets ≈0. Passes, everywhere.
 *
 * The 192² white-lettering fixture (`tests/substrate.test.ts`), mean `fieldWeight` on the strokes,
 * against the mean over the distant black field:
 *
 * | excluded | stroke (anchor b, must be ≈0) | distant dark field | separation |
 * |---|---|---|---|
 * | 0 | 3.88e-4 | 3.10e-3 |    8× |
 * | 1 | 4.53e-4 | 4.92e-3 |   11× |
 * | **2** | **5.77e-4** | **2.30e-1** | **399×** |
 * | 3 | 7.71e-4 | 1.000 | 1297× |
 * | 4 | 1.35e-3 | 1.000 |  742× |
 * | 5 | 3.37e-3 | 1.000 |  297× |
 *
 * Anchor (b) holds at every exclusion — the strokes never come within two orders of magnitude of
 * the 0.01 the semantics test pins them under — so it selects nothing on its own. What it does show
 * is W1's dark-field defect closing: the separation this file's `FIELD_WEIGHT_SOFTNESS_BARS` claims
 * as "about 6×" is 8× at exclusion 0 and **399× at 2**. Figure loses nothing; field gains a range.
 *
 * ## Anchor (a) — a full-frame ramp's ends within 2× of its middle. **Unreachable. Reported.**
 *
 * Ratio `mean fieldWeight over the middle two rows / mean over rows 0 and 255`, 256² full-frame
 * grey ramps, six-rung ladder. The directive's bar is ≤ 2. Exclusion 5 keeps one rung — the
 * degenerate end of the sweep, measured only to bound the anchor:
 *
 * | excluded | 0→255 | 30→230 | 60→200 | 100→180 | 128→200 |
 * |---|---|---|---|---|---|
 * | 0 |  8.46 | 12.94 | 22.06 | 26.61 | 17.66 |
 * | 1 |  6.94 |  9.78 | 13.24 |  9.55 |  5.82 |
 * | **2** | **12.82** | **11.44** | **7.84** | **3.62** | **2.27** |
 * | 3 |  7.69 |  4.92 |  3.09 |  1.75 |  1.32 |
 * | 4 |  3.48 |  2.19 |  1.62 |  1.21 |  1.08 |
 * | 5 |  2.31 |  1.34 |  1.17 |  1.05 |  1.02 |
 *
 * No exclusion passes on a full-range 0→255 ramp — not even the one-rung degenerate case (2.31).
 * And on the ramps where it does pass it selects a *different* value for each — 5, 4, 3, 3 as the
 * ramp gets gentler, none of them 2. So the directive's rule ("the smallest exclusion such that (a)
 * and (b)") **does not terminate**: read literally it asks for a ladder of one or two rungs, and
 * which of those it asks for is a property of the fixture's own contrast, not of the ladder.
 *
 * The reason is analytic, and neither half of it is something a rung exclusion can remove.
 *
 * 1. **Clamp padding at the frame edge.** `blur.ts` pads by clamping (it must — a zero-padded blur
 *    would mark every border pixel as figure). At the boundary row of a ramp the clamped half of
 *    the kernel therefore averages the *end value* and the interior half averages inward, biasing
 *    the surround by ≈`0.4·σ·(dL/drow)`. That bias is **proportional to σ**, so every rung has one,
 *    and the finest rung's is not zero. Setting the bias to one same-colour bar gives the exclusion
 *    the anchor asks for: `E ≥ log₂(0.4·ΔL_ramp / bar) − 1` — a function of the ramp's lightness
 *    extent. That formula reproduces the table (30→230: E≥3.9, observed 4–5; 100→180: E≥2.6,
 *    observed 3), which is what makes this an explanation rather than a story.
 * 2. **OKLab's cube root at the 8-bit floor.** Between sRGB 0 and 1 the lightness step is 0.0672 —
 *    **7.2 dark-neutral bars for one code value**. A ramp that reaches black therefore displaces
 *    several bars at its dark end against *any* non-degenerate surround. This is why the 0→255
 *    column never passes and never can.
 *
 * Recorded upward as a defect in the anchor, not worked around: if the reviewer wants ramp ends to
 * weigh like ramp middles, the lever is the blur's padding convention (an antisymmetric extension
 * preserves a linear ramp exactly, where clamping does not), not the number below.
 *
 * ## What actually selects 2 — geometry, stated so it can be checked without taste
 *
 * With anchor (a) unable to choose, the value is chosen by the one criterion available that
 * introduces no digit: **a surround must be local to be a surround.** A rung's kernel reaches ±2σ,
 * so rung k covers a span of `4σ_k = shortEdge/2^(k−1)`. Excluded are exactly the rungs whose reach
 * spans the whole short edge or more:
 *
 * | rung | σ | ±2σ span | local? |
 * |---|---|---|---|
 * | 0 | S/2 | 2·S | no — twice the frame |
 * | 1 | S/4 | 1·S | no — exactly the frame |
 * | 2 | S/8 | S/2 | yes |
 * | 3…5 | S/16 … S/64 | S/4 … S/16 | yes |
 *
 * Rungs 0 and 1 answer "how does this pixel differ from the whole image", which is a global
 * question and is precisely what makes a gradient's own ends read as figure. Rung 2 is the coarsest
 * whose surround is a *neighbourhood*. That is the SPEC's "fine/mid" band read as geometry, it
 * keeps four of six rungs so the weight stays genuinely multi-scale (exclusion 5 would collapse
 * field-likeness to a single scale and delete the "no rung disagrees" character the proposal is
 * about), and it is the **smallest** exclusion the criterion permits, which is the directive's own
 * preference for staying as close to the proposal's words as the repair allows.
 *
 * Held against the acceptance check rather than fitted to it: at this value the synthetic ramp
 * reaches the 1-D model end-to-end (gradient ranked first, from exclusion 1 onward) and none of the
 * three demo-20 covers sampled gains a gradient hypothesis at any exclusion in 0…4.
 *
 * A count rather than a fraction because `LADDER_LEVELS` is `[HELD]` at six; if the ladder's length
 * or extent moves, the geometric criterion above re-derives this and the anchors must be re-run.
 * `buildFigureGround` clamps the count to `levelCount − 1`, so the finest rung always survives.
 */
export const FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS = 2

// ---------------------------------------------------------------------------------------------
// The habitual ground
// ---------------------------------------------------------------------------------------------

/**
 * Which ladder rung is published as `FigureGroundField.ground` — the colour a pixel "sits on".
 *
 * `[MEASURED — 2026-08-04, two anchors: W7's dead-coincidence census (`reports/first-palettes.md`
 * §2.1) and the geometric locality criterion below, re-run as `tests/substrate.test.ts` "the habitual
 * ground is the coarsest LOCAL rung" + "a letterform's habitual ground is the page it sits on"]`
 * **2** — σ = shortEdge/8, the same rung index the field-likeness exclusion above lands on, and for
 * the same reason.
 *
 * ## Interpretation correction, recorded as such
 *
 * Until 2026-08-04 this module published `ladder.levels[0]` — the **coarsest** rung, σ ≈ shortEdge/2
 * — because `types.ts` said "the colour this pixel is sitting on" and the coarsest surround is the
 * most surround-like thing in the ladder if one reads it as a scale ordering. Measured, that reading
 * defeats the mechanism it feeds. `src/energy/terms.ts:groundCoincidence` reads this colour through
 * a Gaussian **one same-colour bar wide** — the contract's statement about when two colours are the
 * same colour — and at σ = shortEdge/2 the surround of a 300² cover is a near-global average, which
 * on any artwork that is not near-uniform is tens of bars from every candidate's own colour. W7
 * measured the consequence over every distinct triple of three real covers:
 *
 * | cover | triples | max coincidence over ALL triples | triples > 1e-3 | min d(B, field) in bars |
 * |---|---|---|---|---|
 * | `00007e97…` | 24 615 | **8.55e-24** | **0** | 9.7 |
 * | `…000000d8…` | 256 | **1.07e-41** | **0** | 22.6 |
 * | `…00000133…` (near-uniform) | 604 | 1.00 | 604 | 0.0 |
 *
 * and over demo-20: **10 of 18 covers had a maximum coincidence below 1e-3**, two more below 1e-2.
 * Because `groundCoincidence` multiplies *both* `foregroundFitness` and `accentFitness`, a dead
 * coincidence makes both role fitnesses identically ~0, so `roleMisfit = 1` for every candidate and
 * the foreground and accent are chosen by `belonging` alone — which is monotone decreasing in mass
 * and therefore hands the text role to the artwork's largest area. That is P6's central claim (roles
 * read out of one energy) going vacuous on ten covers out of eighteen: the swap gap between
 * (fg, accent) and its reverse was **exactly zero** on five of them, an identity rather than a tie.
 *
 * The factor was never behaving as "how much of this ink's ground is the field". It was a near-1/0
 * indicator of whether the artwork happens to be near-uniform.
 *
 * ## What the corrected value is, and why it introduces no digit
 *
 * `types.ts`'s amended doc fixes the rule: the ground is **the coarsest rung that is still local** —
 * the same criterion W6 used to select the field-likeness exclusion, applied to the same ladder. A
 * rung's kernel reaches ±2σ, so rung k spans `4σ_k = shortEdge/2^(k−1)`:
 *
 * | rung | σ | ±2σ span | local? |
 * |---|---|---|---|
 * | 0 | S/2 | 2·S | no — twice the frame |
 * | 1 | S/4 | 1·S | no — exactly the frame |
 * | **2** | **S/8** | **S/2** | **yes — the coarsest that is** |
 * | 3…5 | S/16 … S/64 | S/4 … S/16 | yes, but progressively less "the page" |
 *
 * Held against a two-sided synthetic bracket rather than fitted to it (`tests/substrate.test.ts`,
 * "a letterform's habitual ground is the page it sits on; the field's is itself"). On the 192²
 * white-on-black lettering fixture, mean OKLab distances by rung — the *fine* end fails because the
 * ground becomes the stroke's own interior, the *coarse* end fails because the field stops sitting
 * on itself inside the kernel the energy reads it through (one pooled bar, 0.01535):
 *
 * | rung | σ | stroke ground: nearer the page than the ink? | field's own ground, in dark bars |
 * |---|---|---|---|
 * | 0 | S/2 | yes (0.174 vs 0.826) | **10.9** — coincidence 2e-26, dead |
 * | 1 | S/4 | yes (0.235 vs 0.765) | **8.9** — dead |
 * | **2** | **S/8** | **yes (0.322 vs 0.678)** | **1.7 — coincidence 0.23, alive** |
 * | 3 | S/16 | yes (0.414 vs 0.586) | 0.0 |
 * | 4 | S/32 | **no (0.555 vs 0.445)** | 0.0 |
 * | 5 | S/64 | **no (0.711 vs 0.289)** | 0.0 |
 *
 * The bracket leaves `{2, 3}`; the geometric criterion picks 2 out of that pair without adding a
 * digit. (The fixture's own limitation is recorded at the test: being 99.3% black, its global mean
 * nearly *is* its page, so the stroke column flatters rung 0 — which is exactly why the defect had
 * to be found on real covers and why the census above is the primary anchor.)
 *
 * A surround must be local to be a surround: rungs 0 and 1 answer "how does this pixel differ from
 * the whole image", which is not a question about what anything sits on. Rung 2 is the coarsest that
 * answers the neighbourhood question, and coarsest is what "habitual" wants — it is the ground of a
 * whole letterform rather than of a stroke's own interior. So the value is the *maximum* index the
 * criterion permits, where `FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS` is the *minimum* exclusion it
 * permits; the two constants coincide numerically because they are the two sides of the same cut,
 * and they are written separately because they would move apart if the criterion ever selected a
 * band rather than a boundary. `tests/substrate.test.ts` re-derives the cut from `ladderSigmas`
 * rather than trusting either digit.
 *
 * The coarse rungs are not discarded: `inkEnergy` and `markEnergy` still average over **all six**,
 * which is what says a stroke is displaced from the page it sits on.
 *
 * A count rather than a fraction because `LADDER_LEVELS` is `[HELD]` at six; if the ladder's length
 * or extent moves, the criterion above re-derives this. `buildFigureGround` clamps it to
 * `levelCount − 1`, so a hand-built one-rung ladder still measures that rung.
 */
export const HABITUAL_GROUND_RUNG = 2

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
