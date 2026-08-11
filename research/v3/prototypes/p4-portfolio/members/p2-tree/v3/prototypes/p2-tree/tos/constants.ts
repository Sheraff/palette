/**
 * Every tunable number the tree-of-shapes pipeline uses, with its provenance tag.
 *
 * `CONVENTIONS.md`: no anonymous literal anywhere in v3. `[UNCALIBRATED]` is the honest tag for a
 * cycle-1 guess and most of this file carries it — the prototype exists to be *measurable*, not to be
 * tuned, and a number that has never been put in front of the reviewer says so here rather than
 * pretending otherwise.
 *
 * Two constants are `[INHERITED]`: they are arithmetic on the contract's own measured same-colour
 * bars (`src/contract/constants.ts`), and the derivation is written out beside each one so it can be
 * re-checked rather than trusted.
 */

import { POOLED_SAME_COLOR_BAR, SAME_COLOR_BAR_BY_REGION } from "../../../src/contract/constants.ts"

/**
 * The smallest same-colour bar the repository has measured, across the four regions.
 *
 * `[INHERITED]` — `min(SAME_COLOR_BAR_BY_REGION)`, which is `dark-neutral` at 0.00932 (reviewer
 * bracketing rounds 1+2 pooled). Computed rather than transcribed so that a future re-measurement of
 * the bars moves the quantisation with it instead of leaving a stale copy behind.
 */
export const SMALLEST_SAME_COLOR_BAR = Math.min(...Object.values(SAME_COLOR_BAR_BY_REGION))

/**
 * The largest same-colour bar. Used only as the cell size of the OKLab lookup grid in the
 * representative-colour rule, where it must be an upper bound on every pair's bar so the grid can
 * never hide a neighbour.
 *
 * `[INHERITED]` — `max(SAME_COLOR_BAR_BY_REGION)`, `light-saturated` at 0.02293.
 */
export const LARGEST_SAME_COLOR_BAR = Math.max(...Object.values(SAME_COLOR_BAR_BY_REGION))

/**
 * How many integer levels the OKLab L channel is quantised to.
 *
 * `[INHERITED]` — derived from `SMALLEST_SAME_COLOR_BAR`, not chosen. The rule the spec sets is that
 * one level must be *smaller* than the smallest measured same-colour threshold, so that two L values
 * landing in the same level are certainly the same colour along L and the quantisation can never
 * split a region a human would call one region. With 256 levels over OKLab L's [0, 1] range the step
 * is 1/255 = 0.003922, which is 0.42 x the 0.00932 `dark-neutral` bar — under the bar, and under half
 * of it, with room to spare for the ±1-LSB dither the robustness harness will throw at it.
 *
 * 256 rather than the 215 that `bar/2` alone would license: the level index is also the hierarchical
 * queue's bucket index and a power of two keeps the queue's non-empty-level bitmask exactly eight
 * 32-bit words. That is an implementation convenience on top of a derived bound, not a second
 * decision — any count at or above 215 satisfies the rule and none of them are reviewable choices.
 *
 * Coarsening this is safe in a way it is not for clustering (arm-b′ §2.1): coarser levels *merge*
 * tree nodes monotonically, they never split a region.
 */
export const L_LEVEL_COUNT = 256

/** The width of one quantised L level, in OKLab L units. Derived; see `L_LEVEL_COUNT`. */
export const L_LEVEL_STEP = 1 / (L_LEVEL_COUNT - 1)

/**
 * The MSER stability window Δλ, in quantised L levels.
 *
 * `[INHERITED]` — the same-colour bar expressed in level units, which is arm-b′ free parameter 1
 * ("the decision is the *tying*, not the number"). `POOLED_SAME_COLOR_BAR` is 0.01535, and
 * 0.01535 / 0.003922 = 3.91, rounded to 4 levels.
 *
 * The pooled bar and not `sameColorBar()`: a stability window is one global scalar over a whole
 * image's level axis, not a judgement about a specific pair of colours, and `constants.ts` reserves
 * the pooled value for exactly that use. It is also the looser of the two candidate derivations
 * (`SMALLEST_SAME_COLOR_BAR` would give 2 levels), and a window of 2 is too narrow to distinguish a
 * real edge from JPEG ringing.
 */
export const STABILITY_WINDOW_LEVELS = Math.max(1, Math.round(POOLED_SAME_COLOR_BAR / L_LEVEL_STEP))

/**
 * The smallest fraction of the image a node may cover and still be retained.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ calls this the grain and does not give it a value; no round
 * has ever been run on it. 0.0005 is 45 pixels of a 300 x 300 cover, chosen so a small logo or a word
 * of display type survives while single-character antialiasing fringes do not. Expressed as a
 * fraction because `CONVENTIONS.md` forbids raw pixel counts for anything that is not a genuine
 * pixel-scale phenomenon.
 */
export const MIN_NODE_AREA_FRACTION = 0.0005

/**
 * The field/mark split: at or above this area fraction a retained node is a *field*, below it a
 * *mark*.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ free parameter 3, anchored on the reviewer's "fields are large
 * areas" and on a review round that has not been run. 0.10 says a tenth of the cover is ground.
 */
export const FIELD_AREA_FRACTION = 0.1

/**
 * How straight the ground chain's centroid trajectory must be to read as laminar: the residual of the
 * centroid points about their own best-fit line, divided by the trajectory's length.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ free parameter 4, the one it names as most in need of
 * calibration and most likely to drift. It *is* the gradient boolean, so it is the first thing a
 * ramp review round should settle.
 */
export const LAMINARITY_CUT = 0.15

/**
 * How monotone the ground chain's centroid migration has to be: net displacement along the fitted
 * direction, divided by the total absolute variation along it. 1 is a strictly monotone walk.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ §2.5 asks for a centroid that "migrates monotonically along a
 * fixed direction" and gives no tolerance. Literal monotonicity is not a usable test: a real ramp's
 * chain is twenty or more nodes long and one node's centroid stepping back by a fraction of a pixel —
 * a single antialiased edge — would refuse the whole reading. A ratio measures the same claim without
 * being hostage to one step.
 */
export const MONOTONE_MIGRATION_FRACTION = 0.8

/**
 * How many nodes a ground chain needs before "laminar" is even considered.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ §2.5 says the laminar chain is "long" and does not say how
 * long. Three is the smallest number for which "the centroid migrates along a fixed direction" is a
 * claim rather than a tautology: any two points are collinear.
 */
export const MIN_LAMINAR_CHAIN_LENGTH = 3

/**
 * Below this fraction of image area explained by retained nodes, the parse is `unreadable`.
 *
 * **[UNCALIBRATED] — a guess.** arm-b′ §2.5 says "a small fraction" and stops there.
 */
export const UNREADABLE_COVERAGE_FRACTION = 0.5

/**
 * How many mark nodes the role stage will look at, largest first.
 *
 * **[UNCALIBRATED] — a cost guard, not a perceptual claim.** The inradius of a node needs a distance
 * transform over its bounding box; on a busy cover there can be thousands of retained marks and
 * cycle-1 does not need all of them to answer "which cluster is the text". Ties at the cut are broken
 * by raster index, so the truncation is deterministic.
 */
export const MARK_NODE_LIMIT = 64

/**
 * How many distinct exact triples inside a node are considered as the *location* of the bar-density
 * mode, ranked by pixel count then lexicographic RGB.
 *
 * **[UNCALIBRATED] — a cost guard.** The mass each candidate accumulates is summed over *every*
 * triple in the node regardless; only the set of candidate locations is truncated, and a triple that
 * is not in the top 4096 by count cannot plausibly be the densest point of a node's colour cloud.
 */
export const REPR_CANDIDATE_LIMIT = 4096

/**
 * How many of the residual's exact triples stay in the foreground and accent rankings.
 *
 * **[UNCALIBRATED] — a depth, not a threshold.** arm-b′ §2.7 repairs a violated invariant by taking
 * the next item in the same ranking; this says how far down the residual's tail that walk is allowed
 * to go before the parse admits it has nothing better and publishes its first choice anyway. Eight
 * because the walk is over pairs and 8 x 8 re-validations is still nothing; there is no evidence
 * behind the number.
 */
export const RESIDUAL_POOL_SIZE = 8

/**
 * How many (foreground, accent) pairs the assembly re-validates before giving up and publishing the
 * parse's first choice.
 *
 * **[UNCALIBRATED] — a cost guard.** Re-validation is not free: `validateContrastFloors` samples the
 * whole rendered ramp at `RAMP_SAMPLES_PER_SEGMENT` and a full 8 x 9 walk over a cover with a gradient
 * measured at nearly four seconds, against a quarter of a second for the parse that produced it. A
 * repair that costs fifteen times the algorithm is not a repair. Exhausting this cap is reported (the
 * palette is published unrepaired and fails downstream, visibly) rather than hidden.
 */
export const MAX_ASSEMBLY_ATTEMPTS = 24

/**
 * The render axis the consumer draws a gradient along: `linear-gradient(135deg in oklab, …)`.
 *
 * `[INHERITED]` — arm-b′ §2.6 and the contract's gradient geometry. CSS angles run clockwise from
 * "to top", so 135deg points to the bottom-right and its first stop sits at the top-left. In image
 * coordinates (x right, y down) the unit vector is (1, 1)/√2, and the *smaller* projection is the
 * top-left end, hence `background`.
 */
export const RENDER_AXIS_DEGREES = 135

/** The render axis as a unit vector in image coordinates (x right, y down). Derived. */
export const RENDER_AXIS_UNIT: readonly [number, number] = [Math.SQRT1_2, Math.SQRT1_2]

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * `[UNCALIBRATED]` — a label, not a measurement. `0.1.0-cycle-1` says out loud that this is the first
 * prototype cycle and that its palettes are validity evidence, not quality evidence.
 */
export const ALGORITHM_VERSION = "p2-tos-0.1.0-cycle-1"

/**
 * The decoder and preprocessing this candidate used.
 *
 * `[INHERITED]` — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`), and
 * `no-resample` states the `PHASE_0_DECISIONS.md` §1 rule: native resolution, no working grid.
 * arm-f′'s downsampled working grid is explicitly not adopted.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"
