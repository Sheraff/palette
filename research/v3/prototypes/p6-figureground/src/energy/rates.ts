/**
 * # The exchange-rate registry — the one place a free rate of P6's energy may live.
 *
 * `SPEC.md` rule 4: *"Exchange rates live ONLY in `src/energy/rates.ts` as one named registry —
 * nowhere else, no inline weights anywhere."* This file is that registry, and it is the surface
 * `tools/sensitivity.ts` perturbs wholesale. Every consumer takes an `ExchangeRates` **argument**;
 * nothing in `src/energy/` imports a weight from anywhere else, and nothing outside this file
 * contains a number that trades one term against another.
 *
 * ## The designated falsifier
 *
 * `README.md` pre-registers the exchange rates as *the* falsifier for this prototype: the objective
 * shape (a multi-term energy with free rates) is this repository's most-relapsed failure mode, and
 * the defence is that these rates are structural rather than fitted. That defence is only worth
 * anything if the rates are *stated*, in one place, with what they are and are not.
 *
 * **So, stated plainly: none of the six values below is a calibration.** Each is a *starting point*
 * — a structural guess made from the shape of the terms it trades, before any harness data existed,
 * and never adjusted against an endorsement set, the demo set, adjudication wins or reviewer
 * feedback. A starting point is not a calibration and this file never pretends otherwise; each tag
 * says so in its own words rather than relying on this paragraph. `tools/sensitivity.ts` measures
 * what each one is worth; the reviewer decides whether any of them earns a round.
 *
 * ## Two objects, and why the second one is not a loophole
 *
 * `DEFAULT_EXCHANGE_RATES` holds the six **free rates** — the values `ExchangeRates` in
 * `../types.ts` fixes, each an exchange between two terms that no measurement decides.
 *
 * `ENERGY_ANCHORS` holds every *other* number the energy needs. They live here for the same reason
 * the rates do (rule 4 forbids an inline weight anywhere, and a constant hidden in a term file is
 * exactly what that rule is about), but they are **not free rates** and are not the falsifier
 * surface: each one is either a measured corpus fact, a value inherited digit for digit from
 * `src/contract`, or a geometric identity. If any anchor below turns out to be a judgement call in
 * disguise, that is a defect in this file and should be reported as one — the honest test is
 * whether a reader can check the anchor against its cited source without exercising taste.
 * `tools/sensitivity.ts` is free to perturb them as the comparison class (`README.md` falsifier 3
 * asks exactly that of the quadrature parameters), and they should come out flat.
 */

import {
	ACCENT_FUNCTIONAL_DISTANCE,
	POOLED_SAME_COLOR_BAR,
} from "../../../../src/contract/constants.ts"
import type { ExchangeRates } from "../types.ts"

// ---------------------------------------------------------------------------------------------
// The six free rates
// ---------------------------------------------------------------------------------------------

/**
 * The energy's free rates at their shipped starting values.
 *
 * Read every tag as `[UNCALIBRATED]` first and the rationale second: the rationale explains why the
 * number is *the one we start from*, never why it is right.
 */
export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
	/**
	 * **Belonging ↔ role fitness** (proposal §4, free parameter 3 — "the one that most needs a
	 * human").
	 *
	 * `[UNCALIBRATED — starting point, not a calibration]` **0.2**, from range-matching and nothing
	 * else. The belonging term is `ln(M_ref / M)` (see `ENDORSED_PRESENCE_REFERENCE`), so it spans
	 * about `ln(1.91e-2 / 8.89e-5) ≈ 5.4` across the two measured corpus decades — the endorsed
	 * median neighbourhood share against the exact-triple share. Role misfit spans exactly 1 by
	 * construction (it is `1 −` a product of quantities in [0,1]). `1 / 5.4 ≈ 0.19`, rounded to 0.2,
	 * is therefore the value at which neither term is *structurally* silent at the start: it makes
	 * the two ranges comparable and asserts nothing about which should win a real trade.
	 *
	 * The anchor the proposal actually wants for this rate is a review round on pairs that trade the
	 * two (a rare-but-perfect accent against a common-but-dull one). That round has not run.
	 */
	belonging: 0.2,

	/**
	 * **Identity-coverage weight** (proposal §4, free parameter 4).
	 *
	 * `[UNCALIBRATED — starting point, not a calibration]` **1.0**, a unit exchange. Coverage is a
	 * mass-weighted transport cost in OKLab units, and total mass is 1, so it lands in roughly
	 * `[0, 0.5]` on real artwork; role misfit lands in `[0, 1]`. At 1.0 one OKLab unit of
	 * mass-weighted uncovered distance costs one unit of role misfit — the least-committal choice
	 * available once both quantities are dimensionless and O(1).
	 *
	 * The proposal's anchor is the P5 complaint rate measured by a targeted round. Not run.
	 */
	coverage: 1,

	/**
	 * **Field-model description-length rate** (proposal §4, free parameter 6).
	 *
	 * `[UNCALIBRATED — starting point, not a calibration]` **0.33 nats per parameter.**
	 *
	 * **Where this rate is spent, which is not where it first looks.** It is *not* a weight the
	 * energy multiplies `FieldHypothesis.descriptionLength` by. The field model consumes it directly
	 * (`../fieldmodel/index.ts`): the 1-D model's description length is its data cost **plus
	 * `rate × FIELD_1D_EXTRA_PARAMETERS`**, so the rate is the per-parameter complexity charge that
	 * decides how much monotone spatial structure a ramp must show to pay for its five extra degrees
	 * of freedom. The energy then adds the resulting description length **at face value** — applying
	 * the rate a second time there would both double-count it and scale the data cost, which is not
	 * what free parameter 6 means. `./solve.ts` says so at the site.
	 *
	 * **Why 0.33 — the rate has a ceiling as well as a floor, and 1.0 was above the ceiling.**
	 * The band is `(0.139, 0.797)` nats per parameter, both ends measured by W3 and re-derived in
	 * `tests/fieldmodel.test.ts` ("the description-length rate has a reachable band, not just a
	 * floor"):
	 *
	 * - **Floor 0.13863** = `FIELD_DL_STEP_REJECTION_FLOOR` = `ln2 / FIELD_1D_EXTRA_PARAMETERS`.
	 *   Below it, two flat halves of a field can be published as a ramp — the proposal's own hard
	 *   case, structurally rejected only above this value.
	 * - **Ceiling 0.79645** = `½·ln(1 + 0.25/0.00932²) / 5` ≈ `3.982 / 5`. The 1-D model's data-cost
	 *   gain is bounded by the largest variance any measure on OKLab can carry (half the pixels
	 *   black, half white ⇒ 0.25) read against the tightest regional bar. Above the ceiling the
	 *   parameter charge exceeds the largest gain any artwork can offer, so **no artwork can ever be
	 *   a gradient** — the whole gradient arm of the design deleted, silently and with no error.
	 *
	 * **The shipped value was 1.0 and 1.0 is above the ceiling.** That is a defect, recorded as SPEC
	 * "Integration directives — wave 2" item 2 and fixed here rather than argued with: Akaike's one
	 * nat per parameter is the standard least-committal price *in general*, and in this particular
	 * energy it happens to fall outside the reachable band, which no amount of standardness rescues.
	 * 0.33 is `√(0.13863 × 0.79645) = 0.3323`, the **geometric mean of the band**, rounded to two
	 * digits — the least-committal point on a scale whose two ends are both ratios, equidistant in
	 * log-rate from "steps are free" and "gradients are impossible". It is a starting point in
	 * exactly the sense this file's header describes: chosen from the shape of the band before any
	 * harness data existed, never adjusted against an endorsement set, a palette or a reviewer.
	 * `tools/sensitivity.ts` sweeps it across the band.
	 *
	 * The proposal's anchor is the gradient-rate neutrality census plus a round of borderline ramps.
	 * Not run.
	 */
	fieldDescriptionLength: 0.33,

	/**
	 * **Collapse cost** (proposal §4, free parameter 7).
	 *
	 * `[UNCALIBRATED — starting point, not a calibration]` **0.25**. Collapse is a move, not a
	 * fallback (proposal §2.4), so this is the price a tuple pays to publish one colour twice. At
	 * 0.25 a role is better collapsed exactly when the best available distinct candidate for it
	 * carries more than a quarter of the full role-misfit range in extra cost — one quarter because
	 * it is the coarsest fraction that is neither "collapse is free" nor "collapse never happens",
	 * both of which would make the collapse *rate* an artefact of this number rather than a readout
	 * of the term. It is a structural guess and the sensitivity harness is what will price it.
	 *
	 * The proposal's anchor is corpus collapse rates against reviewer verdicts on borderline
	 * collapses. Not run.
	 */
	collapse: 0.25,

	/**
	 * **Representativeness weight** — the smallest term, and the most dangerous one.
	 *
	 * `[UNCALIBRATED — starting point, not a calibration]` **0.02**. Proposal §3 names this term the
	 * reintroduction point for naive pixel-snapping and requires it to stay small and inside the
	 * joint energy. The term itself is `centroidDistance` measured in units of the colour's own
	 * regional same-colour bar (`ENERGY_ANCHORS.representativenessScale`), so 0.02 means one whole
	 * bar of centroid distance costs two percent of the role-misfit range: enough to separate two
	 * candidates that are otherwise indistinguishable, not enough to outvote any role evidence.
	 *
	 * If sensitivity ever shows palettes moving on this rate, that is the snapping relapse showing
	 * up as a measurement and should be reported as such rather than damped.
	 */
	representativeness: 0.02,

	/**
	 * **Accent lightness/chroma anisotropy magnitude** (proposal §4, free parameter 5).
	 *
	 * `[UNCALIBRATED — direction from `perception-4`, magnitude unmeasurable]` **1.0**. The accent's
	 * energy is `E_C + λ·E_L`: mark energy plus λ times ink energy, so λ is how much a candidate's
	 * *lightness* excursion counts toward being an accent, relative to its chroma/hue excursion.
	 *
	 * `perception-4` (2026-08-04) measured the **direction** and explicitly refused the coefficient:
	 * at matched OKLab distance an accent that also moves in lightness does its job about twice as
	 * often (0.750 against 0.361), and that ratio is a success rate confounded with stratum by
	 * design — `PHASE_1_AUTHOR_BRIEF.md` §3.1 open question 1 says to read it as a direction and not
	 * as a coefficient. So the only thing the evidence licenses is `λ > 0`, and 1.0 is the
	 * least-committal positive magnitude: lightness at parity with chroma. Writing 2 here would be
	 * booking the refused coefficient as if it had been measured.
	 *
	 * This is the parameter the proposal most wants a deferred round to settle.
	 */
	accentAnisotropy: 1,
}

// ---------------------------------------------------------------------------------------------
// The anchors — not free rates
// ---------------------------------------------------------------------------------------------

/**
 * Every other number the energy reads. Each is checkable against a cited source without judgement.
 *
 * Kept in this file, not beside its term, because rule 4's prohibition is on *inline weights*
 * anywhere in the module and the cheapest way to keep that promise honestly is to have exactly one
 * file with numbers in it.
 */
export const ENERGY_ANCHORS = {
	/**
	 * The zero of the belonging cost: the presence mass at which belonging costs nothing.
	 *
	 * `[MEASURED — corpus fact, `PHASE_1_AUTHOR_BRIEF.md` §4 via proposal §2.2]` 1.91e-2 is the
	 * median endorsed role colour's same-colour-bar neighbourhood share. Belonging is
	 * `ln(reference / M)`: negative (a reward) for a colour that sits in a busier neighbourhood than
	 * the median endorsed colour, positive (a cost) for a rarer one, and **without a cutoff** at any
	 * value — proposal §2.4 term 1 and open question 2 both turn on there being no wall here.
	 */
	endorsedPresenceReference: 1.91e-2,

	/**
	 * Arithmetic guard so the belonging logarithm is finite.
	 *
	 * `[HELD — guard, not a threshold]` A triple that occurs in the artwork has strictly positive
	 * neighbourhood mass by construction (its own pixels are inside its own kernel), and the smallest
	 * share a single pixel of a 9e6-pixel rendition can carry is ~1e-7. 1e-30 is far below anything
	 * realisable and therefore never binds; it exists so that a degenerate synthetic lattice returning
	 * exactly 0 yields a large finite cost instead of `Infinity`, which would read as a barrier.
	 */
	presenceFloor: 1e-30,

	/**
	 * The value `CandidateStats.spatialSpread` takes for a colour spread uniformly over the frame.
	 *
	 * `[INHERITED — the statistic's own definition, `../lattice/index.ts:36`]` **1.0**, because the
	 * producer has already divided by the geometric identity: `spatialSpread` is the trace of the
	 * normalised second spatial moment **divided by `UNIFORM_FRAME_SPATIAL_SPREAD` (= 1/12 + 1/12 =
	 * 1/6)**, so a uniform frame-wide fill reports 1.0 and a centred square of side *s* reports *s²*.
	 * Field fitness scores spread as `min(1, spread / 1.0)`: reaching a uniform fill is full marks,
	 * and exceeding it (mass piled at two opposite corners) earns nothing extra. Exactly the shape of
	 * `borderNeutralAffinity` above, and for the same reason — both statistics arrive normalised
	 * against their own neutral value and the anchor states what that value is.
	 *
	 * **This anchor read `1/6` until 2026-08-04 and that was a defect** — SPEC "Integration
	 * directives — wave 2" item 8, found by W6 and pinned by `tests/semantics.test.ts`. The old value
	 * encoded the *raw* trace, whose uniform-fill value is 1/6, so `terms.ts` divided a second time:
	 * the spread factor saturated at one sixth of a uniform fill (a centred square of side 0.408 —
	 * 16.7% of the frame's area), collapsing the upper five sixths of the scale to a single value and
	 * scoring background and surface on two discriminating factors instead of three. Redefining the
	 * anchor rather than deleting the division keeps rule 4 true (no bare `1` inline in a term file)
	 * and keeps the two saturating factors written the same way. It is **not** a rate: nothing here
	 * trades one term against another, and the value is checkable against `../lattice/index.ts:105`
	 * without exercising taste.
	 */
	uniformSpatialSpread: 1,

	/**
	 * Border affinity at no preference.
	 *
	 * `[INHERITED — the statistic's own definition]` `CandidateStats.borderAffinity` is documented in
	 * `../types.ts` as "border-annulus mass fraction over annulus area fraction; **1.0 = no
	 * preference**". Field fitness scores it as `min(1, borderAffinity / 1.0)`: a field must reach
	 * the frame edge at least as often as chance, and being *more* border-heavy than chance is not
	 * further evidence of fieldhood (a printed border is not a field), so the score saturates.
	 */
	borderNeutralAffinity: 1,

	/**
	 * The unit the representativeness term is measured in.
	 *
	 * `[INHERITED — `src/contract/constants.ts`]` `centroidDistance` is an OKLab distance; dividing
	 * it by the pooled same-colour bar expresses it in "bars of colour", which is the only unit this
	 * contract has for "how far apart is that". The pooled bar rather than a regional one because the
	 * quantity has one colour, not a pair, and the term is deliberately the smallest in the energy.
	 */
	representativenessScale: POOLED_SAME_COLOR_BAR,

	/**
	 * The kernel width for "does this ink sit on the chosen field?".
	 *
	 * `[INHERITED — `src/contract/constants.ts`]` The habitual-ground coincidence weight is
	 * `exp(−½ · (d / bar)²)`, where `d` is the OKLab distance from a candidate's habitual ground to
	 * the nearest colour of the chosen field. The bar is the contract's own statement of when two
	 * colours are the same colour, so a habitual ground *at* the field scores 1 and one several bars
	 * away scores ~0. The ½ is the Gaussian's own, not a weight.
	 */
	groundCoincidenceScale: POOLED_SAME_COLOR_BAR,

	/**
	 * The quadrature width for the identity-coverage transport cost.
	 *
	 * `[INHERITED — `src/contract/constants.ts`]` Coverage aggregates the artwork's colour mass onto
	 * a uniform OKLab grid of this cell width, each occupied cell carrying its exact mass and its
	 * mass-weighted centroid. The width is the pooled same-colour bar because the contract's own
	 * position is that colours closer than the bar are the same colour — so the transport cost is not
	 * entitled to distinguish them. **No mass is ever dropped** (the term is floorless by
	 * requirement); the only loss is that mass inside one cell is transported from its centroid, an
	 * error bounded by the within-cell spread, which is under one bar.
	 */
	coverageQuadratureStep: POOLED_SAME_COLOR_BAR,

	/**
	 * How far above a contrast floor a coarse ramp minimum must sit before refinement is unnecessary.
	 *
	 * `[MEASURED, INHERITED — `tests/contract-ramp.test.ts` via `src/contract/ramp.ts`]` The contract
	 * measures that sampling the rendered ramp at `RAMP_SAMPLES_PER_SEGMENT` overstates the true
	 * minimum `|raw APCA|` by **at most 0.406 raw units**. The barrier uses that: a candidate whose
	 * coarse minimum is below the floor fails outright, one whose coarse minimum clears the floor by
	 * more than this bound passes outright, and only the band between them pays for a call into the
	 * contract's own refined search. It is an empirical worst case rather than a proof, so the band
	 * is where the contract's function decides and this number only decides where to stop asking.
	 */
	rampCoarseOverstatementBound: 0.406,

	/**
	 * The accent's functional-colour distance, restated here only so that no term file holds a number.
	 *
	 * `[INHERITED — `src/contract/constants.ts`, `[UNCALIBRATED]` there]` Read from the contract, not
	 * chosen: the barrier consults it exactly as invariant 4 does, and if the reviewer moves it this
	 * design moves with it (proposal §3).
	 */
	accentFunctionalDistance: ACCENT_FUNCTIONAL_DISTANCE,
} as const

export type EnergyAnchors = typeof ENERGY_ANCHORS
