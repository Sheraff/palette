/**
 * # The search's own constants — every one of them a statement about *effort*, none about *value*
 *
 * There is a hard line running through this file and it is worth stating before the first number.
 * `DESIGN.md`: *"The contract is the feasible set, never a term. Invariants shrink the search space;
 * the objective never rewards contrast, distinctness, or legality."* Nothing here enters an energy,
 * a feasibility verdict, or a published palette. Every constant below decides **how much of the
 * configuration space v0 gets to look at** before it stops, and nothing else.
 *
 * That is why their provenance tags read the way they do. A cost-model coefficient measured on one
 * laptop would be a scandal if it were a threshold in an objective; as a term in *"how many
 * configurations fit in a minute"* it is exactly the right kind of number, and the honest tag is
 * `[MEASURED]` with the machine and date written down. If every one of them were wrong by 2×, the
 * only consequence would be a coarser or finer search — reported, in the certificate, per image.
 *
 * ## The one thing a reader should carry away
 *
 * v0's search is **under-searched by construction and says so**: `SEARCH_CERTIFICATE` is the string
 * `"UNCERTIFIED-V0"` on every palette this module will ever emit. There is no bound, no optimality
 * gap, no proof. `DESIGN.md` §"Module layout" reserves certified branch-and-bound for v1; what is
 * here is a coarse exhaustive pass over a colour lattice followed by local refinement, which is
 * exactly what that line licenses and nothing more.
 */

import { TIGHTEST_SAME_COLOR_BAR } from "../measure/constants.ts"

// ---------------------------------------------------------------------------------------------
// What the search claims about itself
// ---------------------------------------------------------------------------------------------

/**
 * The certificate string every v0 palette carries.
 *
 * `[HELD]` — a label, not a measurement. It exists so that a warehouse row, a reviewer's packet and
 * a later comparison can all tell at a glance that this palette came out of an *uncertified* search.
 * When `src/search/` grows the certified branch-and-bound `DESIGN.md` promises, that version emits a
 * different string and every historical row keeps meaning what it meant.
 */
export const SEARCH_CERTIFICATE = "UNCERTIFIED-V0"

/**
 * How many near-misses travel with each palette.
 *
 * `[REVIEWED]` — the M2 brief asks for a *"runner-up list (top 5 with energy gaps)"*, which is
 * arm A §8's device: a reviewer who disagrees with a palette can see what the search almost picked
 * and how close it came, before anyone has to guess whether the objective or the search is at fault.
 */
export const RUNNER_UP_COUNT = 5

// ---------------------------------------------------------------------------------------------
// The colour lattice the coarse stage enumerates over
// ---------------------------------------------------------------------------------------------

/**
 * How many rungs the coarse lattice ladder puts in each doubling of the cell side.
 *
 * `[UNCALIBRATED]` — eight, and the reason it is not two is measured. The coarse product's cost grows
 * roughly as R⁴ in the number of representatives, so a rung that doubles the side can drop R by a
 * factor that costs sixteen-fold; on a demo-20 cover, a two-per-octave ladder jumped from "too
 * expensive" straight to five representatives while leaving three quarters of the allowance unspent.
 * Eight rungs per octave puts the steps at ~9% in side, which is fine enough that the chosen rung
 * lands near the largest alphabet the allowance can pay for instead of far under it.
 */
export const COARSE_LADDER_STEPS_PER_OCTAVE = 8

/**
 * The finest and coarsest cell sides the ladder reaches, as multiples of the tightest same-colour bar.
 *
 * `[UNCALIBRATED]` — reach, not tuning. At an eighth of a bar two representatives are the same colour
 * by the contract's ruler eight times over, so nothing finer can matter; at 256 bars the whole sRGB
 * gamut is a handful of cells, which is the floor below which there is no palette left to build. The
 * budget, not these bounds, is what normally decides.
 */
export const COARSE_LADDER_MIN_BAR_MULTIPLE = 1 / 8
export const COARSE_LADDER_MAX_BAR_MULTIPLE = 256

/**
 * The ladder itself: cell sides in bar multiples, **finest first**.
 *
 * Derived-and-stated from the three constants above. `planCoarseStage` walks it in this order and
 * takes the first rung whose predicted cost fits the allowance, so a finer lattice always wins when
 * it is affordable.
 */
export const COARSE_CELL_BAR_MULTIPLES: readonly number[] = (() => {
	const rungs: number[] = []
	const octaves = Math.log2(COARSE_LADDER_MAX_BAR_MULTIPLE / COARSE_LADDER_MIN_BAR_MULTIPLE)
	const steps = Math.round(octaves * COARSE_LADDER_STEPS_PER_OCTAVE)
	for (let step = 0; step <= steps; step += 1) {
		rungs.push(COARSE_LADDER_MIN_BAR_MULTIPLE * 2 ** (step / COARSE_LADDER_STEPS_PER_OCTAVE))
	}
	return rungs
})()

/**
 * Cell side in OKLab units for a rung of {@link COARSE_CELL_BAR_MULTIPLES}.
 *
 * `[INHERITED]` — the unit is `TIGHTEST_SAME_COLOR_BAR` from `src/measure/constants.ts`, itself the
 * contract's frozen regional bar. `DESIGN.md` decision 1: *"the model's one length scale IS the
 * measured identity scale. Nothing may depend on its exact digits."* Nothing here does — the ladder
 * is in multiples of it, so a re-measured bar rescales the ladder rather than invalidating it.
 */
export function coarseCellSide(barMultiple: number): number {
	return TIGHTEST_SAME_COLOR_BAR * barMultiple
}

/**
 * How much finer than the coarse lattice refinement is allowed to go, as a bar multiple.
 *
 * `[UNCALIBRATED]` — one eighth of an identity bar. Below this the lattice stops discriminating
 * anything a human could: two triples in adjacent cells at this side are the same colour by the
 * contract's own ruler several times over, so further refinement would only be re-evaluating the
 * energy at points it cannot tell apart. It is a stopping rule, not a resolution claim.
 */
export const FINEST_REFINEMENT_BAR_MULTIPLE = 1 / 8

/**
 * How many halvings of the cell side refinement may perform.
 *
 * `[UNCALIBRATED]` — three levels takes a coarse lattice of, say, 16 bars down to 2 bars, which is
 * where the representatives start being individually meaningful colours. More levels are not
 * *wrong*, they are only budget spent on ever smaller moves; the budget counter stops the search
 * long before this bound bites on a heavy image, and on a light one three levels already lands
 * inside the identity bar.
 */
export const REFINEMENT_MAX_LEVELS = 3

/**
 * How many steepest-descent sweeps refinement runs at one level before moving to the next.
 *
 * `[UNCALIBRATED]` — a sweep that improves nothing ends the level immediately, so this only caps
 * pathological chains of tiny improvements. Four is "enough for each of the four roles to move once
 * after some other role moved", which is the shortest chain that makes the joint move set worth
 * having at all.
 */
export const REFINEMENT_MAX_SWEEPS = 4

/**
 * Chebyshev radius, in lattice cells, of a role's refinement neighbourhood.
 *
 * `[UNCALIBRATED]` — two. Radius 1 (27 cells) was tried first and measured: on a demo-20 cover it
 * left refinement converging after a single sweep having scored **two** new configurations, with
 * three quarters of the whole-image allowance unspent. Radius 2 is at most 125 cells, reaches a full
 * coarse cell in every direction when refining at half the coarse side, and is what actually spends
 * the budget the coarse stage's rung quantisation leaves behind. The budget counter, not this
 * constant, is what stops a sweep on a heavy image.
 */
export const REFINEMENT_NEIGHBOUR_RADIUS = 2

// ---------------------------------------------------------------------------------------------
// The configuration grammar
// ---------------------------------------------------------------------------------------------

/**
 * The positions an interior ramp stop may take in v0.
 *
 * `[UNCALIBRATED]` — quarter points. `PHASE_0_DECISIONS.md` §4 invariant 1 fixes the endpoints at
 * exactly 0 and 1 and leaves interior positions free in (0,1); a continuous search over them is not
 * something a v0 coarse pass can do honestly, so this is a three-point grid and is declared as such.
 * It is *reported* in the diagnostics for every gradient palette, so a reviewer who sees a ramp
 * whose knot is in the wrong place is looking at a stated limitation rather than a mystery.
 */
export const INTERIOR_STOP_POSITIONS = [0.25, 0.5, 0.75] as const

/**
 * The largest stop count the search will construct.
 *
 * `[INHERITED]` — `MAX_GRADIENT_STOPS` in `src/contract/constants.ts` is 4, and `DESIGN.md`'s
 * grammar is *"ramp (2 and 3 stops; 4 admissible, expect never selected)"*. Four is therefore
 * reachable here on purpose: a prediction that something is never selected is only worth making if
 * the thing was actually on the ballot.
 */
export const MAX_SEARCHED_STOPS = 4

// ---------------------------------------------------------------------------------------------
// The effort budget, and the cost model that spends it
// ---------------------------------------------------------------------------------------------

/**
 * The per-image wall-clock allowance the search sizes itself against.
 *
 * `[REVIEWED]` — the M2 brief: *"Per-image budget: aim ≤60 s on demo-20 images."* It is an
 * *allowance*, not a timer: the search never reads a clock to decide anything (that would make the
 * output machine-dependent and the determinism test a lie). It converts this allowance into a
 * predicted-cost budget through the model below, spends that budget deterministically, and reports
 * the actual wall time next to the prediction so the two can be compared honestly.
 */
export const SEARCH_BUDGET_MS = 60_000

/**
 * The share of the budget the coarse exhaustive stage may consume.
 *
 * `[UNCALIBRATED]` — a little over half, leaving the rest for refinement. The split matters less
 * than it looks: the coarse stage's cost is quantised by the lattice ladder, so it typically lands
 * well under its share and refinement inherits the slack.
 */
export const COARSE_BUDGET_FRACTION = 0.55

/**
 * Average number of feasibility calls the enumerator makes per configuration it counts.
 *
 * `[UNCALIBRATED]` — the ink ordering is *"decided first by feasibility"* (`DESIGN.md` decision 3),
 * so a configuration whose preferred ordering is illegal costs a second `feasibility()` call before
 * the search learns that. 1.5 is the midpoint between "never retries" and "always retries"; it is a
 * budgeting allowance, and the diagnostics publish the true call count per image.
 */
export const FEASIBILITY_CALLS_PER_CONFIGURATION = 1.5

/**
 * Milliseconds one flat-field energy evaluation costs, per 1,000 distinct triples.
 *
 * `[MEASURED]` — 2026-08-04, Darwin arm64, node v25.8.1, four demo-20 covers. Both arms were timed
 * on the same configurations; the figure kept is the **larger** of the two (arm A: 0.66 and 0.58
 * ms/1k at K = 24,615 and 32,720; arm A′: 0.15 and 0.14). Taking the max is deliberate and is the
 * one thing about this constant that is a design decision rather than a measurement: it makes both
 * arms search the *same* configuration space on the same image, so `DESIGN.md` M3's comparison stays
 * a comparison of priors rather than of how much CPU each one happened to be given.
 */
export const ENERGY_MS_PER_1K_COLORS_FLAT = 0.7

/**
 * Milliseconds one ramp energy evaluation costs, per 1,000 distinct triples.
 *
 * `[MEASURED]` — same run as `ENERGY_MS_PER_1K_COLORS_FLAT`. Arm A: 1.70 and 1.65 ms/1k; arm A′:
 * 1.99 and 1.86. Max kept, same reason. A ramp costs roughly three times a flat field because both
 * energies profile the path over the fitted geometries and both ramp directions.
 */
export const ENERGY_MS_PER_1K_COLORS_RAMP = 1.9

/**
 * Milliseconds one `feasibility()` call costs on a flat-field palette.
 *
 * `[MEASURED]` — same run; 0.012 to 0.025 ms over 200 calls per image. Negligible next to an
 * energy evaluation, and kept in the model only so the flat-only fallback grammar is not costed at
 * zero.
 */
export const FEASIBILITY_MS_FLAT = 0.03

/**
 * Milliseconds one `feasibility()` call costs **per ramp segment**.
 *
 * `[MEASURED]` — same run; 6.7 to 9.6 ms for a two-stop (one-segment) ramp, across four covers,
 * and essentially independent of image size. This is the contract's own price, not P1's: invariant 4
 * is evaluated over the *whole rendered ramp* at `RAMP_SAMPLES_PER_SEGMENT` = 2,048 samples plus
 * 4,096 refinement samples, for the foreground and the accent separately.
 *
 * It is the single largest term in this model, and it is the reason a v0 search over gradient
 * configurations is expensive at all: on a small-palette artwork, checking a ramp's legality costs
 * more than scoring it.
 */
export const FEASIBILITY_MS_PER_RAMP_SEGMENT = 9

// ---------------------------------------------------------------------------------------------
// Escape
// ---------------------------------------------------------------------------------------------

/**
 * Whether the escape branch is even compiled into the enumeration.
 *
 * `[INHERITED]` — `DESIGN.md` decision 6: *"search in-artwork feasible set; only if EMPTY, evaluate
 * the two escape configurations. Expected to essentially never fire (1,396/1,397 endorsed role
 * colours are exact source triples)."* This is a boolean rather than a threshold precisely so there
 * is nothing to tune: either the in-artwork feasible set the search reached was empty, or the escape
 * is not evaluated at all.
 */
export const ESCAPE_ONLY_WHEN_IN_ARTWORK_SET_IS_EMPTY = true
