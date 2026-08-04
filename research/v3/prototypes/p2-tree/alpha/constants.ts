/**
 * Every number this pipeline can be tuned by, named once, with where it came from.
 *
 * `CONVENTIONS.md`: no anonymous literals, every constant carries a provenance tag. Three of the
 * five values below are **derived from the contract's own same-colour bar** and so introduce no new
 * perceptual quantity — that is the point of arm-b's design and the SPEC's "no second epsilon" rule.
 * The two that are genuinely invented say `[UNCALIBRATED]` and say what would calibrate them.
 */

import { SAME_COLOR_BAR_BY_REGION } from "../../../src/contract/constants.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. Fixed by the SPEC. */
export const CANDIDATE_ID = "p2-alpha"

/** The string the node dump stamps on every row, so a dump says which tree family produced it. */
export const PIPELINE_NAME = "p2-alpha"

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * `[UNCALIBRATED]` — a label, not a measurement. The dev loop's cache keys on measured source
 * hashes, never on this, precisely so a forgotten bump cannot serve a stale palette. `0.1.0` is the
 * cycle-1 walking skeleton (arm-b §6): hierarchy, carve, flat/linear typing, roles, no marks
 * detector.
 */
export const ALGORITHM_VERSION = "p2-alpha-0.1.0"

/**
 * The decoder and preprocessing this candidate used.
 *
 * `[INHERITED]` — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`), and
 * `no-resample` states the `PHASE_0_DECISIONS.md` §1 rule: native resolution, no downscale, no
 * working grid.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/**
 * **α, in bars.** The dissimilarity level at which the quasi-flat zones are cut.
 *
 * `[INHERITED]` — arm-b §2.2: *"Set α to the same-colour bar, regionally: two adjacent pixels join
 * iff they read as the same colour."* Every edge weight in this pipeline is expressed in **multiples
 * of the pair's own regional bar** (`sameColorBar`, `src/contract/color.ts`), so α = 1 is literally
 * the contract's ruler and not a second epsilon. It is named rather than written as a bare `1`
 * because it is the one number that decides what a zone is; it is not, however, tunable — moving it
 * off 1 would introduce the second radius the SPEC forbids.
 */
export const ALPHA_BARS = 1

/**
 * **The structural area floor.** A node holding less than this fraction of the image is `grain` and
 * is folded into its parent rather than published (arm-b §2.2).
 *
 * `[UNCALIBRATED] — invented for cycle 1. This is a guess and nothing has measured it.`
 *
 * Arm-b §4 item 2 names the anchor that would replace it: *the smallest region whose colour the
 * reviewer has ever endorsed* — run the parse over the legacy endorsements, take the area-fraction
 * distribution of the nodes whose representatives match endorsed colours, and read the floor off it.
 * That run has not happened, so this is a round number that keeps a 300×300 cover's node count in
 * the tens (0.001 = 90 pixels there) rather than the thousands. Scale-free by construction, per
 * `CONVENTIONS.md`.
 *
 * It is the single most consequential invented number in the pipeline: raise it and marks vanish
 * into the field, lower it and JPEG noise becomes structure.
 */
export const GRAIN_AREA_FLOOR = 0.001

/**
 * **The field-adequacy multiple**: a field model is adequate when its residual is under this many
 * bars (arm-b §2.3, §4 item 3).
 *
 * `[UNCALIBRATED] — arm-b proposes k = 1 and the round that would confirm it has not run.` The
 * anchor arm-b names is a small review round of the campaign's usual shape, flat-versus-ramp at
 * residuals of 0.5, 1 and 2 bars. k = 1 is used here because it is the value that makes the
 * adequacy test *parasitic on the contract's ruler* rather than on a number of this pipeline's own:
 * at k = 1 "adequate" means "the model's error reads as the same colour". This is the parameter that
 * moves the gradient rate corpus-wide, so it is the first thing to put in front of the reviewer.
 */
export const FIELD_ADEQUACY_BARS = 1

/**
 * The cell edge of the bar-scaled OKLab accumulator the representative rule runs on.
 *
 * `[INHERITED]` — the **smallest** of the contract's four regional bars
 * (`SAME_COLOR_BAR_BY_REGION`, currently `dark-neutral` = 0.00932). Derived, not chosen: the
 * accumulator has to resolve the finest distinction the contract makes anywhere, so its cell cannot
 * be coarser than the tightest bar. Every neighbourhood query on it uses the **pair's own** regional
 * bar as its radius, so this value sets the accumulator's resolution and never a distance verdict.
 */
export const OKLAB_ACCUMULATOR_STEP = Math.min(...Object.values(SAME_COLOR_BAR_BY_REGION))

/**
 * The largest of the contract's four regional bars — the widest radius any neighbourhood query can
 * ask for, used to size the accumulator's search window.
 *
 * `[INHERITED]` — derived from `SAME_COLOR_BAR_BY_REGION` in the same way as the step above.
 */
export const OKLAB_MAX_BAR = Math.max(...Object.values(SAME_COLOR_BAR_BY_REGION))

/**
 * How many whole-image colour modes the degenerate branch peels before it gives up (arm-b §2.8).
 *
 * `[UNCALIBRATED] — a cap, not a threshold.` The branch needs four colours that clear the contract's
 * distinctness and contrast filters; each peel yields one candidate, and most of them are rejected
 * by the filters. Sixteen is four times the number of roles, chosen so the branch has room to
 * discard three candidates per role before failing, and small enough that a photographic cover
 * cannot spend the run peeling modes off noise. Nothing measured it. Raising it can only ever add
 * candidates to the *end* of an order, so it cannot move a palette that already resolved.
 */
export const DEGENERATE_MODE_LIMIT = 16
