/**
 * P3's constants, every one of them with a provenance tag (`CONVENTIONS.md`).
 *
 * **All five of arm-d's free parameters are `[UNCALIBRATED]` at birth.** That is the honest state:
 * arm-d §4 names an anchoring plan for each and none of those plans has run. The provisional values
 * below were chosen here, by this author, so the candidate could be executed at all — they are
 * declared-provisional operating points, not findings, and no number in this file should be quoted as
 * a measurement of anything.
 *
 * Three quantities are **inherited** from the contract and are used unchanged: the regional
 * same-colour bar (`SAME_COLOR_BAR_BY_REGION`), the population floor
 * (`SOURCE_POPULATION_FLOOR`), and the P1 excursion multiplier. They are imported at their use sites
 * rather than re-spelled here, except the excursion multiplier, which has no named constant in
 * `src/contract/` and therefore gets one below.
 */

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const CANDIDATE_ID = "p3-fields-0.1.0"

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * [UNCALIBRATED] — a label, not a measurement. The cache keys on measured source hashes, so a
 * forgotten bump here cannot serve a stale palette.
 */
export const ALGORITHM_VERSION = "p3-fields-0.1.0"

/**
 * The decoder and preprocessing this candidate used.
 *
 * [INHERITED] — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`); `no-resample`
 * states the `PHASE_0_DECISIONS.md` §1 rule; `alpha-excluded` states arm-d §2.0's transparency
 * treatment, which is *eligibility*, never a matte.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample/alpha-excluded"

// ---------------------------------------------------------------------------------------------
// arm-d §4's five free parameters
// ---------------------------------------------------------------------------------------------

/**
 * **τ** — the universal trim level, used at *every* order statistic in the pipeline (arm-d §3(6)).
 *
 * [UNCALIBRATED] — provisional 0.05, chosen here. **Anchoring plan (arm-d §4 row 1):** the smallest τ
 * at which re-encode and dither agreement plateaus on the robustness harness; a one-dimensional sweep
 * with a knee, needing no reviewer. Not run.
 *
 * 0.05 is the operating point because it is the smallest trim that still discards a whole percent-band
 * of a hundred-thousand-pixel population, which is the scale at which a JPEG ringing artifact stops
 * being able to own a rank. That is a reason, not a measurement.
 */
export const TRIM_LEVEL = 0.05

/**
 * **k** — the rank order of the local difference filter (arm-d §2.1).
 *
 * [UNCALIBRATED] — provisional 3, chosen here. **Anchoring plan (arm-d §4 row 2):** the smallest k for
 * which a ±1-LSB dither creates no new edge pixels on the perturbation set, measured per resolution
 * tier. No human taste enters. Not run.
 *
 * 3 is the operating point because a ±1-LSB checkerboard perturbs an alternating half of a 3×3
 * neighbourhood, so the largest and second-largest of the eight distances are the ones a dither can
 * own; reading the third ignores it by construction. In near-black regions one LSB is a genuinely
 * large OKLab step and this is not free — which is exactly why the parameter is measured and not
 * argued.
 */
export const EDGE_RANK = 3

/**
 * **β** — the depth quantile separating field from non-field (arm-d §2.3).
 *
 * [UNCALIBRATED] — provisional 0.75, chosen here. **Anchoring plan (arm-d §4 row 3):** a review round
 * over a β-ladder — *is the published background the background of this artwork*. Arm-d calls this the
 * one parameter that genuinely needs the reviewer. Not run.
 *
 * 0.75 keeps the deepest quarter of the image. Nothing measured says a quarter.
 */
export const FIELD_DEPTH_QUANTILE = 0.75

/**
 * **ρ\*** — the rank-correlation level above which a field is called a gradient (arm-d §2.4).
 *
 * [UNCALIBRATED] — provisional 0.6, chosen here. **Anchoring plan (arm-d §4 row 4):** reviewer verdicts
 * on flat-vs-gradient palette *pairs* for the same artwork; it has to be pairs, because §6 rules the
 * gradient flag palette-conditional rather than an artwork label. Not run.
 */
export const GRADIENT_RANK_CORRELATION = 0.6

/**
 * **The ink annulus ratio** — surround radius as a multiple of stroke depth (arm-d §2.5).
 *
 * [UNCALIBRATED] — provisional 3.0, chosen here. **Anchoring plan (arm-d §4 row 5 and §9(a)):** a
 * stratified sweep against text-bearing strata, scored by ink-mask agreement with the reviewer's own
 * foreground endorsements rather than against the `has_text` labels. Not run.
 *
 * 3.0 puts the surround just outside a stroke of the measured half-width, which is the shape the score
 * is trying to detect. That is a geometric argument about glyphs, not a measurement of any corpus.
 */
export const INK_ANNULUS_RATIO = 3

// ---------------------------------------------------------------------------------------------
// Inherited from the contract
// ---------------------------------------------------------------------------------------------

/**
 * The **P1 excursion bar**, as a multiple of the pair's same-colour bar.
 *
 * [INHERITED] — `PHASE_0_DECISIONS.md` §294: *"Bar inherited (2.5× same-color) — recalibrate in
 * [a later round]"*. There is no named constant for it in `src/contract/`, so it is named here rather
 * than written as a bare `2.5` at the use site.
 *
 * **Carry the caveat with the number.** `PERCEPTION_MODEL_STUDY.md` row 15 records that three
 * bracketing rounds have now passed this multiplier by, that no reviewer has ever been shown an
 * excursion stimulus, and that expressing it as a multiple of the bar makes it silently inherit every
 * position and direction dependence the bar has — with a 2.5× lever nobody decided on.
 */
export const EXCURSION_BAR_MULTIPLIER = 2.5

// ---------------------------------------------------------------------------------------------
// Operating points that are not free parameters — resolutions of grids, caps and guards
// ---------------------------------------------------------------------------------------------

/**
 * How many angles the ink annulus is sampled at.
 *
 * [UNCALIBRATED] — a resolution, chosen here. 24 angles put a sample every 15°, which is enough that a
 * stroke crossing the annulus twice is seen at least twice at the radii this runs at. Arm-d §5 budgeted
 * "≈ 50 samples each"; 24 is the cheaper half of that bracket and the score is a *fraction*, so its
 * value is resolution-stable while its granularity is 1/24.
 */
export const INK_ANNULUS_SAMPLES = 24

/**
 * The smallest annulus radius in pixels.
 *
 * [UNCALIBRATED] — a floor, chosen here. Below 2 px the 24 sample positions round onto the same handful
 * of pixels and the "fraction of the annulus" stops being a fraction of an annulus. Genuinely
 * pixel-scale, so `CONVENTIONS.md`'s scale-free rule does not apply — this is the sampling grid itself.
 */
export const INK_ANNULUS_MIN_RADIUS_PX = 2

/**
 * How many annulus samples must land on eligible in-bounds pixels before a pixel gets an ink score.
 *
 * [UNCALIBRATED] — a guard, chosen here. A pixel near the image edge sees a truncated annulus; scoring
 * it off four samples would make "the fraction of the annulus" a statement about three pixels.
 */
export const INK_ANNULUS_MIN_SAMPLES = 8

/**
 * How many points the excursion curve is measured at (arm-d §2.4: "sample t at a fixed grid").
 *
 * [UNCALIBRATED] — a resolution, chosen here. 33 samples put a measurement every 1/32 of the ramp,
 * which is finer than the guide-stop machinery can act on (it may insert at most two) and coarse enough
 * that each band still holds a population worth taking a cascade pixel of.
 */
export const EXCURSION_GRID_SAMPLES = 33

/**
 * Half-width, in t, of the band whose cascade pixel is c(t₀).
 *
 * [UNCALIBRATED] — a resolution, chosen here. Deliberately wider than half the grid spacing (1/64), so
 * adjacent bands overlap and no sample is starved on a field whose t is unevenly populated.
 */
export const EXCURSION_BAND_HALF_WIDTH = 0.03

/**
 * How many guide stops may be inserted (arm-d §2.4: "repeat at most once more").
 *
 * [INHERITED] — the contract's `MAX_GRADIENT_STOPS` is 4 and the two ends are the field roles, so two
 * is all there is room for. Named so the loop bound is not a bare literal.
 */
export const MAX_GUIDE_STOPS = 2

/**
 * The spatial-spread floor of the verification pass, as an interquartile extent in normalized
 * coordinates summed over the two axes.
 *
 * [UNCALIBRATED] — provisional 0.01, chosen here, and **deliberately permissive**. The contract's own
 * `SpatialSpreadValidator` is unimplemented precisely because its threshold has no provenance
 * (`types.ts`: "implementing the check with a made-up threshold would be worse than not implementing
 * it"), and this is a made-up threshold. It is set low enough that it can only catch a colour occurring
 * in a single tight blob — an album's one-pixel-wide spine highlight — and it can only ever *step a
 * rank* inside this prototype, never invalidate a palette.
 */
export const SPATIAL_SPREAD_FLOOR = 0.01

/** How many position bins per axis the spread measurement accumulates into. */
export const SPREAD_POSITION_BINS = 512

/**
 * How far one "step the rank" moves, as a fraction of the ordering it steps in.
 *
 * [UNCALIBRATED] — a step size, chosen here. Arm-d §2.7 says "moves to the next quantile in the same
 * ordering" without saying how far a quantile is. 0.02 of the population is a step small enough that a
 * stepped role is still recognisably the role it was, and large enough that a step is not swallowed by
 * a run of tied values.
 */
export const RANK_STEP_FRACTION = 0.02

/**
 * How many times a single role may step before the pipeline publishes the best it has.
 *
 * [UNCALIBRATED] — a cap, chosen here. A role that has stepped six times has walked 12% of its own
 * ordering and is no longer answering the question it was asked; going further would be tuning by
 * search rather than by rank.
 */
export const MAX_RANK_STEPS = 6

/**
 * The fixed dictionary of linear spatial parameterisations, in degrees (arm-d §2.4).
 *
 * [UNCALIBRATED] — a dictionary, chosen here. Four directions 45° apart, which with the sign of the
 * rank correlation covers all eight compass headings. Rank correlation is used, so only the *ordering*
 * a direction induces matters and 45° is the coarsest spacing at which two members of the dictionary
 * induce visibly different orderings on a square image.
 */
export const SPATIAL_DICTIONARY_ANGLES = [0, 45, 90, 135] as const
