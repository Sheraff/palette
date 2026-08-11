/**
 * P3's constants, every one of them with a provenance tag (`CONVENTIONS.md`).
 *
 * **Four of arm-d's five free parameters are `[UNCALIBRATED]`, and the fifth is `[MEASURED]` in the
 * only sense its anchor allows.** At 0.1.0 all five were uncalibrated: arm-d §4 names an anchoring plan
 * for each and none had run. At 0.2.0 **k**'s plan has been executed (`src/tools/measure-edge-rank.ts`)
 * and its result is that *the criterion selects no k at all* — see `EDGE_RANK` for the full curve and
 * the open decision it leaves. The other four remain declared-provisional operating points chosen by
 * this author so the candidate could be executed at all. They are not findings, and no number in this
 * file except the k curve should be quoted as a measurement of anything.
 *
 * 0.2.0 adds **three tie bands** — δ_fg, δ_bs and m_ink — under their own heading below. They are
 * `[UNCALIBRATED]` on the same terms, each with an anchor plan that has not run.
 *
 * 0.4.0 adds **exactly two**, both in the gradient's guide-stop canon: `MIN_GUIDE_STOP_SPACING`
 * (`[MEASURED]`, off five graded covers, with the caveats attached to it) and
 * `FOURTH_STOP_PROVEN_UTILITY` (`[REVIEWED]`, the contract's negotiability clause). The accent redesign
 * that is 0.4.0's centrepiece adds **none** — its ordering is a product of percentile ranks, which has
 * no coefficient, and every narrowing below it is an order statistic of the population it narrows.
 *
 * 0.4.1 adds **exactly one**, `ACCENT_LUMP_DEPARTURE_TIE_BAND` — the fourth tie band, closing the W15
 * audit's requirement-5 finding (a near-tied lump election with no declared band and no stated
 * convention). It is `[UNCALIBRATED]` on the same terms as the other three, with the same anchor
 * (the robustness plateau). 0.4.1 also **retires** the raw-share wall as this prototype's eligibility
 * rule; see `verify.ts` and `measurements/substrate/ADOPTION_RULING.md` §2.
 *
 * Three quantities are **inherited** from the contract and are used unchanged: the regional
 * same-colour bar (`SAME_COLOR_BAR_BY_REGION`), the population floor
 * (`SOURCE_POPULATION_FLOOR`), and the P1 excursion multiplier. They are imported at their use sites
 * rather than re-spelled here, except the excursion multiplier, which has no named constant in
 * `src/contract/` and therefore gets one below.
 */

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const CANDIDATE_ID = "p3-fields-0.4.1"

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * [UNCALIBRATED] — a label, not a measurement. The cache keys on measured source hashes, so a
 * forgotten bump here cannot serve a stale palette.
 */
export const ALGORITHM_VERSION = "p3-fields-0.4.1"

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
 * **[MEASURED]** — the anchor ran, and it does not select a k. Value unchanged at 3.
 *
 * Script: `src/tools/measure-edge-rank.ts`. Report:
 * `measurements/edge-rank-k.json`. Command and protocol are in the script's docstring; 20 covers, the
 * `dither-lsb1` arm of `perturbation-set-1.json`, `computeEdgeField` at k = 3…8 on both sides, counting
 * pixels the dither turned into edges that were not edges before.
 *
 * ### The curve, in full
 *
 * | k | new edges (20 covers) | new/eligible, median | new/eligible, worst cover | covers with zero |
 * |---|---|---|---|---|
 * | 3 | 154 031 | 0.944% | **50.59%** | 0/20 |
 * | 4 | 186 324 | 1.115% | **51.90%** | 0/20 |
 * | 5 | 113 760 | 1.514% | 8.58% | 0/20 |
 * | 6 | 113 714 | 1.484% | 8.47% | 0/20 |
 * | 7 | 110 608 | 1.656% | 6.99% | 0/20 |
 * | 8 | 100 894 | 1.333% | 6.68% | 0/20 |
 *
 * ### What it says, stated as measured rather than as hoped
 *
 * 1. **arm-d §4 row 2's criterion is unreachable.** "No new edge pixels" is met by **no k, on no
 *    cover, in either resolution tier** — not approximately, not on a majority. The anchoring plan
 *    presumed a k exists at which a ±1-LSB dither is invisible to a rank filter, and on this corpus
 *    none does. Per the falling-back rule, k stays at **3** and the curve is recorded instead of a
 *    finding.
 * 2. **There is nonetheless a knee, and it is at k = 5, not k = 3.** The worst-cover new-edge fraction
 *    falls **six-fold** between k = 4 and k = 5 (51.9% → 8.6%) and is flat after. The knee has a
 *    geometric explanation that also shows 0.1.0's stated reason for choosing 3 was **wrong**: the
 *    dither is `(x+y) % 2` alternating ±1 on blue, so of a pixel's eight neighbours the four
 *    *orthogonal* ones shift by 2 LSB relative to it and the four *diagonal* ones (same parity, same
 *    shift) do not move at all. A dither can therefore own the **four** largest neighbour distances,
 *    not the two this docstring used to claim — and immunity, such as it is, begins at the fifth.
 * 3. **The median moves the other way.** k = 3 has the *lowest* median new-edge fraction of the six.
 *    High k tames the pathological covers and costs a little on the typical one, which is why the
 *    pooled totals barely move while the maximum collapses. The 50%-new-edge cover at k = 3 is
 *    `00009a5acf9fb19544298ce4` — the same greyscale cover that produced the **worst disagreement in
 *    the whole 0.1.0 robustness baseline** (`measurements/BASELINE.md`, rank 1, `#ffffff` → `#000000`).
 * 4. **`lostEdges` rises monotonically with k** (12 640 → 34 763), so the improvement at high k is
 *    partly the edge test going blind rather than going stable. That is why the criterion is
 *    one-directional in arm-d and why both columns are reported.
 *
 * **Open decision, for the reviewer and not for this worker.** Points 2 and 3 disagree about which k to
 * ship, and the anchor that was supposed to settle it does not. Keeping 3 is the conservative reading
 * of the instruction, not a finding that 3 is right; the case for 5 is that its knee matches the
 * geometry exactly and that it is the covers at the tail — the near-neutral greyscale ones — that this
 * prototype's robustness failure actually lives on. Re-running the harness at k = 5 is a one-line
 * change and roughly half an hour, and it is the obvious next measurement.
 */
export const EDGE_RANK = 3

/**
 * **Dev-only override of k**, read from the `P3_EDGE_RANK` environment variable.
 *
 * The open decision recorded above ("re-running the harness at k = 5 is a one-line change") is the
 * whole reason this exists: comparing two k on the robustness harness needs the harness to be able to
 * ask for a different k without the shipped constant moving. **The shipped default is `EDGE_RANK` and
 * nothing in `src/` passes an override** — with the variable unset this function is `EDGE_RANK` and the
 * published palette is unchanged, which is the property the k comparison is read against.
 *
 * Dev-only, in the sense that no product build ever sets the variable; a value outside 1…8 throws
 * rather than being clamped, because a typo in a measurement's environment must not quietly produce a
 * different measurement.
 */
export function edgeRankInUse(): number {
	const override = process.env.P3_EDGE_RANK
	if (override === undefined || override.length === 0) return EDGE_RANK
	const parsed = Number(override)
	// [INHERITED] — 1…8 is the 8-neighbourhood's size: there are eight neighbour distances to take a
	// k-th largest of, so the range is the data's shape and not a policy about which k are sensible.
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
		throw new Error(`P3_EDGE_RANK must be an integer in 1..8 (the 8-neighbourhood's size); got ${override}`)
	}
	return parsed
}

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
 * [UNCALIBRATED] — provisional **0.62** at 0.3.0 (0.6 at 0.1.0–0.2.0). **The anchoring plan is
 * unchanged and still the real anchor (arm-d §4 row 4):** reviewer verdicts on flat-vs-gradient palette
 * *pairs* for the same artwork; it has to be pairs, because §6 rules the gradient flag
 * palette-conditional rather than an artwork label. **Still not run.** Nothing below is a substitute for
 * it, and 0.62 must not be quoted as a calibrated value.
 *
 * ## Why it moved, and by exactly how much
 *
 * Round 1's pre-registered **false-gradient watch triggered**: on item-11 the reviewer wrote *"i'm not
 * sure i recognize a gradient in that artwork"* (`review-rounds/round-1-calibration/VERDICTS.md` §4),
 * hedged, at zero grade cost. Per the watch, ρ* calibration jumps the queue — so the distribution was
 * measured rather than guessed at.
 *
 * **Probe:** demo-20 plus a deterministic 44-image slice of the coverage set — `coverage-set-1.json`'s
 * `artworks` array in file order, every fifth entry (indices 0, 5, …, 215) — run under `P3_DIAG`, 64
 * images, `gradient.bestSpearmanRho` read off the decision chain. `bestSpearmanRho` is computed before
 * ρ* is applied and does not depend on it, so one run measures the whole curve.
 *
 * **What it says.** Item-11's best ρ is **0.6040** — the *lowest* of the 26 fields this candidate
 * publishes a gradient for. The published tail runs 0.6040, 0.6134, 0.6228, 0.6553, …; the non-published
 * side tops out at 0.5974. So the reviewer's doubt lands exactly on the boundary case, which is the
 * outcome that makes a boundary worth moving and not the outcome that condemns the discriminator.
 *
 * **0.62** is the smallest two-decimal value that clears item-11's 0.6040 *and its nearest published
 * neighbour* 0.6134, so the cut does not sit between two ρ values that a fourth-decimal perturbation
 * could reorder. It costs two gradients of 26 on the probe — published rate 40.6 % → 37.5 %, against the
 * 0.2.0 candidate's 43.8 % on the same 64 images — which is inside the gradient-rate neutrality the
 * design constraint asks for. A larger move was available and refused: the widest gap in the published
 * tail is 0.6228 → 0.6553, and cutting there would drop three.
 */
export const GRADIENT_RANK_CORRELATION = 0.62

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
 * is all there is room for. Named so the loop bound is not a bare literal. This is the *structural*
 * ceiling; what a default run may actually reach is `FOURTH_STOP_PROVEN_UTILITY` below.
 */
export const MAX_GUIDE_STOPS = 2

// ---------------------------------------------------------------------------------------------
// 0.4.0 — the guide-stop canon
// ---------------------------------------------------------------------------------------------

/**
 * **The minimum spacing between published gradient stops**, as a fraction of the ramp.
 *
 * **[MEASURED]** — from `phase2-cal-006` r2-item-0 and `phase2-pair-007`, the only two rounds that have
 * ever put a multi-stop ramp in front of the reviewer. Value **0.125**, and the predicate is *strictly
 * greater* (`spacing > MIN_GUIDE_STOP_SPACING`), which is the cut this evidence draws and not a round
 * number chosen near it.
 *
 * ### The measurement
 *
 * r2-item-0 was held at unacceptable for seven drafts on *"very significant banding (purple at 71.9%,
 * green at 74.7%)"* — a **3.125%** gap, and the one anchor in this evidence set that is independent of
 * the replay below. `phase2-pair-007` then graded eight covers as flat-vs-gradient pairs and named
 * banding on **all four 4-stop covers and none of the four 2-stop covers**.
 *
 * **The replay numbers below are W15's, not this comment's first draft's** (`audit/w15/`, re-derived
 * from the pinned `5a4f845` run with `bead404`/W9 corroboration). The table 0.4.0 shipped claimed
 * 3.13% for both 114 and 188 and mixed 0.4.0 hexes with 0.3.0 stop positions on the 048 row; the
 * correct narrowest published spacings for the four named round-3 covers are:
 *
 * | cover | narrowest spacing |
 * |---|---|
 * | 048 | 6.25% |
 * | 181 | 12.50% |
 * | 114 | 12.50% |
 * | 188 | 6.25% |
 *
 * 12.50% is still the **widest spacing a reviewer has called banding**, so a strictly-greater cut at
 * 0.125 still rejects all four named cases and nothing else: **the cut survives its own audit, the
 * argument for it does not.** Struck with the old table: the claim that the narrow covers sat at the
 * machinery's own floor `1/(EXCURSION_GRID_SAMPLES − 1)` — "one grid step is the class". No named
 * cover sits at one grid step; the only 3.125% in this evidence set is r2-item-0's reviewer-reported
 * gap, which arrives from a different instrument (a graded draft, not a replayed run file) and is
 * therefore the corroboration rather than the pattern.
 *
 * ### Carry the caveats with the number
 *
 * - **n = 5 covers, one reviewer, one rendering.** [MEASURED] here means *"read off graded reviewer
 *   verdicts"*, not *"a sweep found a knee"*. Nothing was measured on the other side of the cut, because
 *   no reviewer has been shown a multi-stop ramp whose stops are 15% or 20% apart.
 * - **The evidence is confounded.** All four round-3 covers are also the covers whose stops meander or
 *   cross lumps (`gradient.ts`'s diagnosis), so "banding" and "the path is not a path" are not separated
 *   by this data. The spacing rule is the conservative half of the fix; the monotone clause is the other,
 *   and neither is a measurement of the other's necessity.
 * - **Anchor plan:** a stop-spacing ladder — the same cover rendered with one guide stop at 5%, 10%, 15%
 *   and 25% from an endpoint, graded for banding. That is a review round and it has not run.
 */
export const MIN_GUIDE_STOP_SPACING = 0.125

/**
 * **Has the fourth gradient stop proven its utility?** `false`, and the code path stays.
 *
 * [REVIEWED] — the contract's own negotiability clause, `PHASE_0_DECISIONS.md` §2 as `types.ts` §"Stop
 * count" restates it, verbatim: *"The fourth stop is additionally **negotiable on proven utility** rather
 * than granted (the reviewer's parenthesis above), so a fitter that reaches for it owes evidence that
 * three could not do the job."*
 *
 * The evidence owed has not been produced, and the only measurement that bears on it runs the other way:
 * `phase2-pair-007` graded the gradient side **unacceptable on all four 4-stop covers**, and preference
 * split on the same line (4-stop → flat or no-preference; 2-stop → gradient or no-preference). So the
 * second guide stop — the one that makes a ramp four stops long — is **unreachable by default**, while
 * `insertGuideStops`'s loop keeps the branch that would take it.
 *
 * This is a gate, not a cap: `MAX_GUIDE_STOPS` is unchanged, round 3's corrected reading explicitly
 * refuses a hard cap at three, and flipping this constant is what "negotiable" means in code. **Anchor
 * plan:** a paired round in which the same artwork is published with three stops and with four, on covers
 * whose 3-stop ramp still shows a measured excursion above the bar — the evidence the clause asks for.
 */
export const FOURTH_STOP_PROVEN_UTILITY = false

/**
 * The **decile count** the lump heuristic reads a scalar distribution at.
 *
 * [INHERITED] — from `measurements/attribution/ATTRIBUTION.md`'s bimodal probe, which scored
 * bimodality as *largest adjacent-decile gap / (decile₁₀ − decile₀)* over eleven nearest-rank
 * deciles. 0.3.0 consumes that same reading in the selection path, so the resolution is taken from
 * the instrument that produced the evidence rather than re-chosen here.
 */
export const LUMP_DECILES = 10

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

/**
 * How many position bins per axis the spread measurement accumulates into.
 *
 * [UNCALIBRATED] — a resolution, chosen here. 512 bins per axis put every quantile of position to
 * within 1/512 of the image's extent, which is finer than the spread floor can act on; the whole
 * point of binning is that a colour occupying half the artwork must not cost an array of half a
 * million coordinates. **Anchor plan:** none needed — a resolution is refuted by showing that the
 * measured spread moves when it doubles, which is a one-line check, not a review round.
 */
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

// ---------------------------------------------------------------------------------------------
// 0.2.0 — the three tie bands, and why a "tie band" is the right shape of fix
// ---------------------------------------------------------------------------------------------
//
// W4's baseline measured robustness 18.2% overall, and diagnosed the dominant mode as **whole-palette
// black↔white polarity inversion on near-neutral covers**: 114 of 491 disagreements moved all four
// roles at once, and 68 of the 155 role-moves over 0.5 OKLab were grey→grey — a coin-flip between two
// lightness extremes, not a hue drift.
//
// The mechanism's robustness claim is about **order statistics of large populations**, and that claim
// is not what failed. What failed is a small number of **discrete near-tied choices sitting on top of
// those statistics**: two prevalence counts within a fraction of a percent of each other, an ink
// population one pixel either side of a verification floor, an |APCA|-against-the-background ordering
// whose two ends are equally good answers. Each is a cliff, and a ±1-LSB dither is enough to walk a
// cover across it.
//
// So each of the three constants below does the same thing in a different place: it declares how close
// two quantities have to be before the difference between them stops being evidence, and names the
// **fixed convention** that decides the case instead. A convention is not a better answer than the
// near-tied count; it is a *stable* one, and the count was not carrying information at that distance.
// Every one of them is `[UNCALIBRATED]` with an anchor plan, exactly like arm-d §4's five.
//
// ## What the three bands bought, measured before anyone quotes the reasoning above as a result
//
// **At these provisional values: nothing on robustness.** A 150-trial perturbation smoke
// (`measurements/robustness-p3-fields-0.2.0-smoke150.json`) against the *same 150 trials* re-scored
// from the 0.1.0 report reads:
//
// | | 0.1.0 | 0.2.0 |
// |---|---|---|
// | agreement, all four arms | 22.0% (33/150) | **18.7% (28/150)** |
// | `jpeg-q92` | 31.6% (12/38) | 23.7% (9/38) |
// | `dither-lsb1` | 27.0% (10/37) | 27.0% (10/37) |
// | disagreements moving all four roles | 19 | 19 |
// | role-moves over 0.5 OKLab | 24 | **41** |
// | of those, grey→grey | 6 | **10** |
//
// Every arm's Wilson interval overlaps its counterpart at n ≈ 38, so this is not a measurement that
// 0.2.0 is worse. It is a measurement that **the targeted failure mode did not move**: the polarity
// inversions are still there, in the same numbers, and the large grey→grey moves went up rather than
// down. The scorecard did improve (demo-20 17/20 → 19/20; the two recovered rows both failed invariant
// 4 against a field end, which is exactly what the ramp-minimum ordering was built to see), so the
// foreground objective is better *aimed* — it is simply not more *stable*.
//
// The most likely reading, recorded as a hypothesis and not as a finding: the ramp minimum makes the
// winning population a broad mid-tone band on precisely the bimodal covers that flip, and the cascade
// pixel of a broad sparse band is not obviously steadier than the cascade pixel of a tight extreme one.
// If that is right, the remaining instability is in the *cascade over the window*, one layer below
// every tie band here, and no amount of tie-band calibration reaches it. Testing it needs the τ sweep
// (arm-d §4 row 1) and the k = 5 re-run flagged in `EDGE_RANK`, in that order.

/**
 * **δ_fg** — the foreground's contrast-polarity tie band, in raw-APCA magnitude units.
 *
 * [UNCALIBRATED] — provisional 2.0, chosen here. **Anchor plan:** sweep δ_fg over the robustness
 * harness's `dither-lsb1` and `jpeg-q92` arms and take the smallest value at which foreground agreement
 * plateaus — the same one-dimensional knee arm-d §4 row 1 specifies for τ, needing no reviewer. Not
 * run.
 *
 * 2.0 raw units is the operating point because the contract's own default text floor
 * (`DEFAULT_CONTRAST_PARAMETERS`) resolves to 2.5 raw units, so a band of 2.0 is strictly inside the
 * smallest contrast difference the contract is willing to call a contrast at all. That is a reason,
 * not a measurement.
 */
export const FOREGROUND_POLARITY_TIE_BAND = 2

/**
 * **δ_bs** — the background/surface prevalence tie band, as a *relative* difference between the two
 * ends' counts (`|a − b| / max(a, b)`).
 *
 * [UNCALIBRATED] — provisional 0.10, chosen here. **Anchor plan:** the robustness plateau — sweep δ_bs
 * and take the smallest value at which background/surface agreement on the perturbation arms stops
 * rising. Relative rather than absolute because prevalence is a count over the field set, whose size
 * varies by two orders of magnitude across the corpus; an absolute band would mean different things on
 * a 300² and a 1024² cover, which `CONVENTIONS.md`'s scale-free rule forbids. Not run.
 */
export const BACKGROUND_PREVALENCE_TIE_BAND = 0.1

/**
 * **m_ink** — the stability margin on the ink regime's source-support test, as a fraction of
 * `SOURCE_POPULATION_FLOOR`.
 *
 * [UNCALIBRATED] — provisional 0.25, chosen here. **Anchor plan:** the regime *label* is recorded in
 * the exposed intermediates, so the measurement is direct — run the perturbation set and take the
 * smallest m_ink at which the ink/luminance label agrees between a cover and its ±1-LSB dither on
 * ≥ 99% of covers. Needs no reviewer and no palette comparison. Not run.
 *
 * 0.25 is the operating point because arm-d §3(4) already names the regime test *"a decision wearing a
 * predicate's clothes"*: a boundary a single pixel can cross decides which of two entirely different
 * orderings the foreground comes out of, which is the largest discrete lever in the pipeline sitting on
 * the smallest margin. A quarter of the floor is a guess at how much slack that lever needs.
 */
export const INK_REGIME_SUPPORT_MARGIN = 0.25

// ---------------------------------------------------------------------------------------------
// 0.3.0 — the ends band, the lump split, the degenerate-depth fallback
// ---------------------------------------------------------------------------------------------
//
// `measurements/attribution/ATTRIBUTION.md` measured where the 0.2.0 disagreements are *born*, and
// the answer is not where the 0.2.0 tie bands were aimed: **87 of 122 first divergences are the
// field-ends block** (`e1-colour` 68, `e2-colour` 11, `prevalence-order` 4, `ends-step` 4), with
// **17 of the 19 whole-palette flips born at `e1-colour` alone** and **zero** at `fg-cascade`. Two
// facts inside that number set the shape of every constant below:
//
// 1. **e₁ and e₂ were single-pixel reads.** In 36 of the 68 `e1-colour` rows the field's own cascade
//    pixel *m* was the same colour on both sides and the rank-(1 − τ) pixel under it was still a
//    different colour — the order statistic itself moving, with nothing else moving. A single rank
//    is the one place in this pipeline a published colour rested on one pixel; 0.3.0 replaces it
//    with the **cascade pixel of a band**, which is the primitive every other role already uses.
// 2. **The population the ranks are read over is itself drifting** — field-set size drift median
//    5.5 %, **max 2789.9 %** across a pair. A band over a population that changes by 28× is still a
//    band over noise, so the membership rule gets a stated degenerate case of its own.
//
// None of these values is a measurement. Each is a declared operating point with the anchor that
// would settle it, exactly like arm-d §4's five and 0.2.0's three tie bands.

/**
 * **w_ends** — the width of the band whose cascade pixel is published as a field end, as a multiple
 * of τ.
 *
 * [UNCALIBRATED] — provisional 1.0, chosen here. **Anchor plan:** the robustness plateau — sweep
 * w_ends over the harness's four perturbation arms and take the smallest multiple at which
 * background/surface agreement stops rising, the same one-dimensional knee arm-d §4 row 1 specifies
 * for τ. Not run.
 *
 * 1.0 is the operating point because it makes the band *exactly the trim that was being discarded*:
 * the (1 − τ) rank is the top of the band and τ·n pixels sit under it, so the published end is the
 * cascade pixel of the same window `topWindow(·, τ, 1)` would hand the foreground. Expressing it as
 * a multiple of τ rather than as its own fraction keeps the pipeline's "one trim level everywhere"
 * property (arm-d §3(6)) — there is still one number to sweep, and this one says how many trims wide
 * the end is.
 */
export const ENDS_BAND_TAU_MULTIPLE = 1

/**
 * **g_lump** — the largest-adjacent-decile-gap ratio above which a scalar band is called two lumps.
 *
 * [INHERITED] — 0.25, carried unchanged from `ATTRIBUTION.md`'s bimodal probe, where it is declared
 * `[UNCALIBRATED]` and justified as 2.5× the ≈ 0.10 an adjacent decile pair of a *uniform*
 * population spans. It arrives here as an inherited reading convention, and the inheritance is the
 * thing to be suspicious of: in the probe nothing consumed it, and now the selection path does.
 *
 * **Anchor plan:** the robustness plateau, jointly with `ENDS_BAND_TAU_MULTIPLE` — the two interact,
 * because a wider band is more likely to span a gap. Not run.
 *
 * Carry the probe's own caveat with the number: **bimodality by this test is the normal case** (98
 * of 122 disagreeing pairs), so g_lump is not a discriminator between stable and unstable covers. It
 * is only the rule that decides *which* lump a band that has two of them is cascaded over.
 */
export const LUMP_GAP_RATIO = 0.25

/**
 * **δ_lump** — the relative mass difference below which two lumps are declared equally populated,
 * and the *farther* lump wins instead of the *larger* one.
 *
 * [UNCALIBRATED] — provisional 0.10, chosen here, and set equal to `BACKGROUND_PREVALENCE_TIE_BAND`
 * on purpose: both are "two counts over the same population are this close, so the difference
 * between them is not evidence", and two different numbers for one question would be two levers
 * where the design has one. **Anchor plan:** the same sweep as δ_bs. Not run.
 *
 * Why the *farther* lump breaks the tie, rather than a fixed dark/light convention: a field end is
 * asked to be an end. When the band spans two lumps of equal mass, the one further along the band's
 * own ordering is the one that answers the question that was asked; mass is the tie-break only
 * because a sparse lump of a hundred pixels is a worse population to take a cascade pixel of than a
 * dense one of ten thousand.
 */
export const LUMP_MASS_TIE_BAND = 0.1

/**
 * **d_min** — the depth, *in pixels*, at or under which the β cut is declared to carry no
 * information and F falls back to the wider membership rule.
 *
 * [UNCALIBRATED] — provisional 1 px, chosen here. **Anchor plan:** the fallback fires on a *nameable*
 * population, so the measurement is direct — run the perturbation arms and take the largest d_min at
 * which the membership-rule label (`beta-quantile` vs `degenerate-depth`) agrees between a cover and
 * its ±1-LSB dither on ≥ 99 % of covers, then read the rule's own field-set-size drift against
 * 0.2.0's median 5.5 % / max 2789.9 %. Needs no reviewer and no palette comparison. Not run.
 *
 * **Pixels and not a fraction of the long edge, against `CONVENTIONS.md`'s scale-free default — the
 * same exemption `INK_ANNULUS_MIN_RADIUS_PX` takes, for the same reason: the quantity is the
 * measurement grid itself.** Depth is an exact Euclidean distance transform, so its non-zero values
 * are `1, √2, 2, √5, …` pixels divided by the long edge; a cut at one pixel means *the pixel at the
 * β rank is a direct neighbour of an edge*. Measured on the 64-image probe (demo-20 + the coverage-44
 * slice), the β-quantile depths are 0 px on 14 covers and exactly 1 px on 14 more — the criterion is
 * reading the transform's own quantisation, and a scale-free fraction cannot: 0.01 of the long edge
 * is 3 px at 300² and 10 px at 1024², so it would call one resolution tier degenerate three times
 * more readily than another. That reading was measured before this line was written: at 0.01 the
 * fallback fired on 39 of 64 and moved 20 of 44 coverage palettes with no scorecard change and a
 * gradient-rate drop of 20 → 15, which is a redesign of F wearing a fallback's clothes.
 *
 * At 1 px the rule fires on 28 of 64 and **changes F on 14 of them** — the other 14 have a β-quantile
 * depth of exactly zero, where §2.3's strictly-greater branch already returns the same set, so the
 * fallback is a no-op there by arithmetic rather than by intent.
 */
export const DEGENERATE_DEPTH_FLOOR_PX = 1

/**
 * **d_min expressed scale-free** — the same floor read as a fraction of the long edge, used *only*
 * when the dev-only `P3_DEPTH_FLOOR_MODE` variable asks for it. **Not a shipped constant: nothing in
 * `src/` selects this branch by default.**
 *
 * [MEASUREMENT-ONLY] — 1/320, count-preserving. `DEGENERATE_DEPTH_FLOOR_PX = 1` fires on 94 of the
 * 220 coverage artworks (`data/devloop/p3-diag-coverage-0.3.0`, 220 chains). Sorting those 220
 * artworks by their β-quantile depth *as a fraction of the long edge* and asking for the largest cut
 * that keeps exactly 94 below it gives **0.003125 = 1/320** — the next distinct value up, 1/313,
 * takes 96. So this constant changes the rule's *form* (pixel grid → image fraction) while holding
 * its *strictness* fixed on the corpus the pixel rule was set on, which is what makes the pair
 * measurement in `measurements/attribution/PAIRS_ATTRIBUTION.md` a test of the form alone.
 *
 * The docstring above rejects "a scale-free fraction" on the strength of a 0.01 trial that fired on
 * 39 of 64. That rejection is of a rule **three times wider** than the pixel rule, not of a
 * count-matched one: 0.01 is 3 px at 300² where 1/320 is 0.94 px.
 */
export const DEGENERATE_DEPTH_FLOOR_FRACTION = 1 / 320

/** Which form of the degenerate-depth floor a run uses. `pixels` is the shipped rule. */
export type DepthFloorMode = "pixels" | "scale-free"

/**
 * **Dev-only override of the degenerate-depth floor's form**, read from `P3_DEPTH_FLOOR_MODE`.
 *
 * Same contract as `edgeRankInUse` above and for the same reason: the 0.3.0 rendition-pair regression
 * (14.5 % → 9.0 %) has to be measured against a candidate fix without the shipped constant moving.
 * **With the variable unset this function is `"pixels"` and the published palette is unchanged** —
 * checked byte-for-byte over demo-20, not asserted.
 *
 * Dev-only: no product build sets the variable, and an unrecognised value throws rather than falling
 * back, because a typo in a measurement's environment must not quietly produce the baseline again and
 * be read as "the fix does nothing".
 */
export function depthFloorModeInUse(): DepthFloorMode {
	const override = process.env.P3_DEPTH_FLOOR_MODE
	if (override === undefined || override.length === 0) return "pixels"
	if (override !== "pixels" && override !== "scale-free") {
		throw new Error(`P3_DEPTH_FLOOR_MODE must be "pixels" or "scale-free"; got ${override}`)
	}
	return override
}

/**
 * **The L axis's midpoint**, against which the ink lump's extremity is measured.
 *
 * [INHERITED] — OKLab L is bounded [0, 1] by the space's own definition, so its midpoint is 0.5 and
 * there is nothing to calibrate. It is named rather than written as a bare literal because it is
 * doing selection work: "the designer's ink is the L-extreme lump, not the mid-tone between the
 * lumps" is implemented as *distance from this point*.
 */
export const LIGHTNESS_AXIS_MIDPOINT = 0.5

/**
 * **δ_ink** — the extremity tie band for the ink regime's lump choice, in OKLab L units.
 *
 * [UNCALIBRATED] — provisional 0.05, chosen here. **Anchor plan:** the ink annulus sweep of arm-d §4
 * row 5 already scores ink-mask agreement against the reviewer's foreground endorsements; δ_ink
 * rides along on it, because the quantity it decides is which lump the published ink comes from.
 * Not run.
 *
 * 0.05 L is the operating point because it is the scale at which two lumps' median lightnesses stop
 * being distinguishable as "one is the extreme one": the same-colour bar the contract calibrates is
 * of that order in L for a neutral pair. Inside the band the **darker** lump wins, matching
 * `field-roles.ts`'s darker-end background convention and `foreground.ts`'s darker-band polarity
 * convention — three stated conventions that cannot pull a palette in opposite directions.
 */
export const INK_LUMP_EXTREMITY_TIE_BAND = 0.05

/**
 * The fixed dictionary of linear spatial parameterisations, in degrees (arm-d §2.4).
 *
 * [UNCALIBRATED] — a dictionary, chosen here. Four directions 45° apart, which with the sign of the
 * rank correlation covers all eight compass headings. Rank correlation is used, so only the *ordering*
 * a direction induces matters and 45° is the coarsest spacing at which two members of the dictionary
 * induce visibly different orderings on a square image.
 */
export const SPATIAL_DICTIONARY_ANGLES = [0, 45, 90, 135] as const

// ---------------------------------------------------------------------------------------------
// 0.4.1 — the fourth tie band (the W15 audit's requirement-5 correction)
// ---------------------------------------------------------------------------------------------

/**
 * **δ_acc** — the accent's lump-election tie band, in units of the split's own `gapRatio`.
 *
 * `ACCENT_REDESIGN.md` requirement 5 forbids *"no near-tied lump election without the declared tie-band
 * + stated-convention pattern already used elsewhere"*, and the W15 audit found 0.4.0 shipped exactly
 * that: `chooseAccent` elected the higher-**departure** lump at any separation, including a separation
 * that had only just cleared `LUMP_GAP_RATIO`. That is a cliff in the role `ATTRIBUTION.md` block 22
 * measures as the least stable in the pipeline (69.5 % instability), which is the one place the design
 * had said it would not put one.
 *
 * [UNCALIBRATED] — provisional 0.10, chosen here, and set equal to `BACKGROUND_PREVALENCE_TIE_BAND` and
 * `LUMP_MASS_TIE_BAND` for the reason δ_lump gives: all three are *"two order statistics of one
 * population are this close, so the difference between them is not evidence"*, and three different
 * numbers for one question would be three levers where the design has one. **Anchor plan:** the same
 * sweep — the robustness plateau, the smallest δ_acc at which accent agreement on the perturbation arms
 * stops rising. Not run.
 *
 * **Why the convention is the higher-*chroma* lump.** A convention has to be (i) stable, (ii) defensible
 * without a measurement, and (iii) *not* a restatement of the near-tied quantity it replaces. Median
 * OKLab chroma over a lump is all three: it is an order statistic of a scalar field over a large
 * population, it is what seven reviewer counts asked this role for in so many words (*"very distinct
 * purple"*, *"the significant yellow"*, *"beautiful brown colors"*), and it is a genuinely different
 * statistic from the departure product — departure is `chroma-percentile × hue-percentile` minimised
 * over the two field ends, so a lump can top it through the hue term while holding the *lower* absolute
 * chroma. Stated rather than smoothed: on most covers the two agree, and where they agree this band
 * buys stability and nothing else.
 */
export const ACCENT_LUMP_DEPARTURE_TIE_BAND = 0.1

// =================================================================================================
// The substrate experiment (W13) — one branch adopted at 0.4.1, two retained as dev-flagged vehicles
// =================================================================================================
//
// **Read the ruling before this block** (`measurements/substrate/ADOPTION_RULING.md`): of the three
// branches below, `eligibility` is **ADOPTED as the 0.4.1 default** and is no longer reachable through
// the flag in any meaningful sense (the flag member survives so the measurement record's command lines
// still parse; nothing reads it). `field` is **NOT ADOPTED** — the pooled perturbation block regresses
// 18.7 % → 12.0 % with the control outside the substrate's interval, and its own central claim, reduced
// resolution coupling of the edge field, was never measured; the design survives as a vehicle and
// re-proposal needs that coupling measurement plus a pre-registered pooled non-regression gate.
// `prevalence` is **REFUTED**: coherence mass is itself a flatness measure and widened white's lead on
// cover-114 (1.44 → 1.70), which is the opposite of the hypothesis.
//
// `measurements/attribution/PAIRS_ATTRIBUTION.md` §8 named the load-bearing site: the k = 3 **binary**
// edge map. Its edge fraction is resolution-coupled (slope −0.212), it drifts twice as much between
// two renditions as under a JPEG re-encode, and everything the prototype publishes is downstream of
// it — depth is its distance transform, F is a quantile of depth, the ends are ranks over F, and
// `e1-colour` owns 43 of the 54 all-four pair flips. Three independent defects trace to that chain:
//
//  1. the binary edge → EDT → quantile-cut chain amplifies threshold noise (the pair regression);
//  2. `SOURCE_POPULATION_FLOOR` blocks four of the seven reviewer-named identity marks (`accent.ts`);
//  3. bar-count prevalence is spread-sensitive (cover-114: a flat shirt at 6.06 % beats the textured
//     red field at 1.45 % whose median *is* the field colour).
//
// Every constant below is `[UNCALIBRATED]`. Two of them — `COHERENT_SUPPORT_MIN` and
// `COHERENT_FILL_FLOOR` — are on the default path from 0.4.1 and are read on every run; the rest are
// still measurement-only, read only when `P3_SUBSTRATE` names their branch.

/**
 * Which substrate branches a run has enabled.
 *
 * `eligibility` is **adopted**: it is the default at 0.4.1 and nothing reads this member. It survives in
 * the type and in the parser so that every command line in `measurements/substrate/SUBSTRATE.md` §11
 * still runs rather than throwing, and so that `all` keeps meaning what it meant. All false is the
 * shipped 0.4.1 path.
 */
export type SubstrateFlags = Readonly<{
	/** The continuous multi-scale coherence field replaces the binary edge map + EDT depth. NOT adopted. */
	field: boolean
	/** Adopted at 0.4.1 and unconditional in `verify.ts`. Accepted here, read nowhere. */
	eligibility: boolean
	/** Prevalence is coherence mass within F rather than a raw bar count. Refuted, not adopted. */
	prevalence: boolean
}>

const NO_SUBSTRATE: SubstrateFlags = { field: false, eligibility: false, prevalence: false }

/**
 * **Dev-only substrate switch**, read from `P3_SUBSTRATE` as a comma-separated list of
 * `field`, `eligibility`, `prevalence`, or the shorthand `all`.
 *
 * Same contract as `edgeRankInUse` and `depthFloorModeInUse`: with the variable unset the shipped
 * behaviour is exactly what it was, and an unrecognised value **throws** rather than silently
 * returning the baseline — a typo in a measurement's environment must never be read as "the
 * experiment does nothing".
 *
 * **The one exception is stated rather than hidden:** `eligibility` is accepted and then ignored,
 * because at 0.4.1 it names the default. That is exactly the "reads as doing nothing" shape the
 * paragraph above forbids, and it is tolerated only because the branch it named is now unconditional —
 * a run that passes it gets the behaviour it asked for. If `field` is ever retired for good, this
 * member should be deleted rather than left accepted.
 */
export function substrateFlags(): SubstrateFlags {
	const raw = process.env.P3_SUBSTRATE
	if (raw === undefined || raw.length === 0) return NO_SUBSTRATE
	const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0)
	let field = false
	let eligibility = false
	let prevalence = false
	for (const part of parts) {
		if (part === "all") {
			field = true
			eligibility = true
			prevalence = true
			continue
		}
		if (part === "field") field = true
		else if (part === "eligibility") eligibility = true
		else if (part === "prevalence") prevalence = true
		else {
			throw new Error(
				`P3_SUBSTRATE members must be "field", "eligibility", "prevalence" or "all"; got ${part}`,
			)
		}
	}
	return { field, eligibility, prevalence }
}

/**
 * **How many dyadic neighbourhood scales the coherence field integrates.**
 *
 * [UNCALIBRATED] — provisional 3, chosen here; the task brief asks for 2–3. One scale is the 0.4.0
 * edge field with the threshold removed and reproduces its noise; the point of the second and third is
 * that a rank filter at radius 2R cannot be flipped by the same ±1-LSB dither that flips radius R,
 * because the dither is not correlated across the gap. **Anchor plan:** the perturbation smoke's
 * `dither-lsb1` arm at 2 vs 3 vs 4 scales, against the wall-clock cost, which is linear in this number.
 */
export const COHERENCE_SCALE_COUNT = 3

/**
 * **The long edge at which the smallest coherence scale is one pixel.**
 *
 * [UNCALIBRATED] — provisional 512, chosen here. The scale radii are
 * `R_j = max(1, round(longEdge / COHERENCE_SCALE_BASE_LONG_EDGE · 2^j))`, so on a 512-px cover they are
 * 1, 2, 4 px and on a 1024-px cover 2, 4, 8 px: **the neighbourhood is a fraction of the artwork rather
 * than a fraction of the sampling grid**, which is the half of the resolution coupling a rank cut
 * cannot fix by itself. `CONVENTIONS.md`'s scale-free default therefore holds here without an
 * exemption, except at the grid's own floor of one pixel, which no measurement can go below.
 *
 * **Anchor plan:** the pair block's `log(edge-analogue ratio)` vs `log(longEdge ratio)` slope — the
 * −0.212 of `PAIRS_ATTRIBUTION.md` §8 — recomputed on the coherence percentile at 256 / 512 / 1024.
 */
export const COHERENCE_SCALE_BASE_LONG_EDGE = 512

/**
 * **The minimum bar-population share an eligible colour must hold.** On the default path from 0.4.1.
 *
 * ### The wall this replaced, and why it is retired
 *
 * `SOURCE_POPULATION_FLOOR` (the contract's 0.1 %) was this prototype's eligibility rule through 0.4.0
 * and is **retired at 0.4.1** — still imported by `verify.ts`, still reported as `rawSharePasses`,
 * reading on no decision. Three pieces of evidence, all pre-dating the adoption:
 *
 * 1. `ADOPTION_RULING.md` §2 — the coherence rule measured free (pairs 8.5 % vs 8.0 %, perturbations
 *    pooled identical, every coverage-220 contract number identical, cost 0.97×) and quality-positive
 *    (18 accent collapses removed; two reviewer-named marks published at rank 0);
 * 2. the **goal-3 candidacy wall** finding — a floor that refuses a colour for being small is the exact
 *    shape the campaign forbids, and `accent.ts` measured it refusing four reviewer-named identity
 *    marks at 0.025 %, 0.002 %, 0.060 % and 0.025 %;
 * 3. the corpus fact: the **median endorsed role colour's exact-triple share is 8.89e-5**, an order of
 *    magnitude below the floor that was supposed to admit it.
 *
 * ### The number
 *
 * [UNCALIBRATED] — provisional 1e-5, chosen here. It is not a re-run of `SOURCE_POPULATION_FLOOR` at a
 * lower number: it is the floor below which the *spread statistics themselves* stop meaning anything,
 * because an interquartile extent over fewer than a handful of pixels is not an estimate. On a 640²
 * cover 1e-5 is four pixels.
 *
 * Evidence line for widening the wall at all: the four reviewer-named identity marks blocked at 0.4.0
 * sit at 0.025 % (r2-item-4's purple), 0.002 % (208), 0.060 % (130) and 0.025 % (188) against a 0.1 %
 * floor (`accent.ts`), and the corpus fact is that the **median ENDORSED role colour's exact-triple
 * share is 8.89e-5** — the floor is a candidacy wall an order of magnitude above the thing it is
 * supposed to admit. **Anchor plan:** the per-cover probe in `measurements/substrate/`.
 */
export const COHERENT_SUPPORT_MIN = 1e-5

/**
 * **δ_fill** — how densely a bar-population must fill its own interquartile box to count as coherent.
 *
 * [UNCALIBRATED] — set from the probe in `measurements/substrate/SUBSTRATE.md`, which prints
 * `support / (spreadX · spreadY)` for the rank-0 accent candidate of the seven identity covers and for
 * a diffuse control. The statistic is *size-aware* in the way the brief asks: a title-text line is tiny
 * but confined to a thin box and fills it; a JPEG shadow of the same population size is smeared over a
 * box a hundred times larger and does not. Both quantities are already computed by `verifyColor` —
 * quantiles of positions, never a centroid — so this adds a comparison, not a measurement.
 *
 * **Anchored, 2026-08-05**, on `measurements/substrate/identity-probe.json` — the rank-0 accent
 * candidate of every identity cover the reviewer has named a mark on, `fill` at 0.4.0 defaults:
 *
 * | cover | the mark | support | spreadX × spreadY | **fill** |
 * |---|---|---|---|---|
 * | 208 | the title/artist yellow | 0.0024 % | 0.0195 × 0.1738 | **0.0072** |
 * | 188 | the corals | 0.0642 % | 0.4199 × 0.0977 | **0.0157** |
 * | r2-item-4 | the purple | 0.0251 % | 0.1387 × 0.0371 | **0.0489** |
 * | 130 | the cinnamon | 0.0600 % | 0.1348 × 0.0723 | **0.0616** |
 * | 168 | the blue | 0.0864 % | 0.0664 × 0.1934 | **0.0673** |
 *
 * **0.005 is just under the lowest concentration a reviewer has actually named as an identity mark.**
 * For scale, a population of the same size spread uniformly over the artwork has a fill of `4 · support`
 * — 1e-4 at 208's size, seventy times below this floor — so the statistic separates a thin text strip
 * from a diffuse artefact by roughly two orders of magnitude, and the floor sits in the gap.
 *
 * **The one degree of freedom, stated:** the anchor set is five points and four of them are the covers
 * this constant is being judged on, so the floor is fitted to part of its own acceptance test. What
 * keeps that from being circular is the *other* half of the evidence — the coverage-220 accent-collapse
 * and escape rates, which measure how much the wider predicate admits on artwork nobody named. Those
 * numbers are in `SUBSTRATE.md`, and a floor that emptied the collapse column would be a deleted wall
 * rather than a coherence rule however well it scored on five covers.
 */
export const COHERENT_FILL_FLOOR = 0.005
