/**
 * Every tunable the cycle-2 role stage adds, with its provenance tag.
 *
 * `CONVENTIONS.md`: no anonymous literal anywhere in v3. Nothing in this file has been put in front of
 * the reviewer, so **every number here is `[UNCALIBRATED]` or `[INHERITED]` from arm-b §2.4's prose** —
 * and where arm-b states a number in words ("twice the median", "four or more") the tag says so and the
 * doc comment quotes it, so the difference between "the proposal said this" and "worker F guessed
 * this" stays visible after the fact.
 *
 * The cycle-2 brief's three obligations map onto this file as follows:
 *
 *  - the **text detector** (arm-b §2.4) contributes the component-extraction and grouping constants;
 *  - the **APCA-over-rendered-ramp ranking** contributes *none* — it is a total order over a quantity
 *    the contract already computes (`minRawContrastOverRamp`), with no threshold, because it is a
 *    ranking and not a gate;
 *  - **twin collapse** contributes *none* — the bar it enforces is `sameColorBar()`, the contract's
 *    own ruler, and the separation it enforces is `FOREGROUND_ACCENT_SEPARATION_DISTANCE`, the
 *    contract's own constant. Both are consumed, never re-derived.
 */

/**
 * When a retained mark node counts as the *same region* as a retained mark node beneath it.
 *
 * **[UNCALIBRATED] — a guess, and the single most consequential number cycle 2 adds.**
 *
 * The tree of shapes names one letter of display type twenty times: once per quantised L level between
 * the level at which the glyph first separates from its field and the level at which it is fully dark.
 * `tos/NOTES.md` records this as the "retained node counts are high" weakness (hundreds per cover); the
 * stability filter drops only *exact*-area duplicates, so a chain of twenty nodes whose areas run
 * 683, 680, 670 … 585 survives intact. Every one of those nodes has a plausible area, a plausible
 * bounding box and a plausible representative colour, and all twenty are the same letter — which makes
 * the mark population unusable as the input to a component-counting detector: on
 * `…d859a69094` the sixty-four largest marks are *all* slices of one grey swoosh and not one of them
 * is a letter.
 *
 * So a **component** is a retained mark node with no retained mark strictly beneath it covering at
 * least this fraction of its own area. That keeps the deepest node of each chain — the glyph at its
 * darkest and most complete — and discards the nineteen partial re-namings above it. On the same cover
 * it turns 512 marks into 95 components, and the nine letters of the artwork's title appear as nine of
 * them at their near-black exact triples.
 *
 * 0.8 has no evidence behind it. It has to sit below 1 (or nothing collapses, since areas along a
 * chain are strictly decreasing) and above the ratio at which a genuinely nested *different* region —
 * a counter inside a glyph, a badge inside a panel — would be swallowed by its container. A round that
 * sweeps it against text recall is the obvious next measurement.
 *
 * This rule is **local to the role stage**. The retained set itself, which is the reachability
 * falsifier's and the verifier's input, is untouched.
 */
export const COMPONENT_CHAIN_AREA_AGREEMENT = 0.8

/**
 * How many components the role stage looks at, largest first.
 *
 * **[UNCALIBRATED] — a cost guard, not a perceptual claim.** Each component costs one exact distance
 * transform over its bounding box. `tos/constants.ts`'s `MARK_NODE_LIMIT` of 64 was written for the
 * *un*-collapsed mark population and is far too small once chain collapse has removed the level
 * slices — it truncates before the first glyph on a cover with any large soft shape on it. After
 * collapse the population is one to two hundred per cover, so 512 is a ceiling that does not bind on
 * the demo set and still bounds a pathological cover. Ties at the cut break on area, then parsed node
 * id, so the truncation is deterministic.
 */
export const TEXT_COMPONENT_LIMIT = 512

/**
 * How many components a coherent group needs before it is `text`-shaped.
 *
 * `[INHERITED]` — arm-b §2.4, verbatim: *"Four or more such components is `text`-shaped."* No round
 * has priced it; it is inherited rather than measured, and it is the count at which "these things
 * agree" stops being a coincidence between two shapes.
 */
export const TEXT_MIN_COMPONENTS = 4

/**
 * The multiplier from median ridge distance to stroke width.
 *
 * `[INHERITED]` — arm-b §2.4, verbatim: *"the **stroke width** is twice the median distance along its
 * ridge"*. It is geometry, not a tunable: the distance transform at a medial-axis point is the radius
 * of the largest disc inside the stroke, and a stroke is two of those across.
 */
export const STROKE_WIDTH_RIDGE_FACTOR = 2

/**
 * How much the stroke widths inside one group may disagree, as a coefficient of variation.
 *
 * **[UNCALIBRATED] — a guess.** arm-b §2.4 says *"stroke widths agreeing within a coefficient of
 * variation"* and gives no value. 0.4 is loose on purpose: a distance transform over an antialiased
 * JPEG glyph at 300 px is a noisy instrument, an `I` and an `M` of the same face do not have the same
 * measured ridge, and the failure that matters is a false *negative* — arm-b's own framing is that
 * *"its recall is mediocre and that is fine"*, so a detector that is additionally strict recovers
 * nothing. The conjunction with height, collinearity and colour is what carries the precision.
 */
export const TEXT_STROKE_WIDTH_CV = 0.4

/**
 * How much the bounding-box heights inside one group may disagree, as a coefficient of variation, and
 * pairwise as a relative difference when deciding whether two components share a row.
 *
 * **[UNCALIBRATED] — a guess.** arm-b §2.4 says *"heights agreeing"* and gives no value. 0.35 admits a
 * line of capitals and refuses a line of mixed case with descenders — a known, deliberate recall cost,
 * and the reason the acceptance case's *title* is what this detector finds rather than its byline.
 */
export const TEXT_HEIGHT_CV = 0.35

/**
 * How straight a group's centroids must be: the residual of the centroid points about their own
 * best-fit line, divided by the trajectory's length.
 *
 * **[UNCALIBRATED] — a guess.** arm-b §2.4 says *"centroids near-collinear"* and gives no value. The
 * *shape* of the measurement is deliberately the one `LAMINARITY_CUT` already uses in this pipeline
 * (`collinearityResidual`), and so is the value, so that a review round which prices one of them has
 * said something about the other. They are still two constants, because they are two claims.
 */
export const TEXT_COLLINEARITY_CUT = 0.15

/**
 * How close two components' centroids must be in `y`, as a fraction of the smaller component's height,
 * to be linked into the same row.
 *
 * **[UNCALIBRATED] — a guess.** arm-b §2.4 does not decompose grouping into rows at all; this is the
 * tree-adapted reading. Half a glyph height is the tolerance at which two glyphs of one line of type
 * link and two consecutive lines of type do not, since consecutive baselines are a full height apart
 * or more. Linking is single-linkage over components sorted by centroid `y`, additionally requiring
 * pairwise height agreement at `TEXT_HEIGHT_CV`, so one outlier cannot chain a column into a row.
 */
export const TEXT_ROW_CENTROID_TOLERANCE = 0.5
