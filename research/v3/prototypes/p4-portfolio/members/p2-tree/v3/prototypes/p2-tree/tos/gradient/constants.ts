/**
 * The three quantities the guide-stop machinery consumes, and where each one comes from.
 *
 * `DECISIONS.md` D6 promoted this work from a cycle-1 cut to an owed commit, and it names the one
 * rule that governs the file: the excursion bar is **the contract's own quantity, consumed as-is with
 * its provenance**, never a fresh number. Nothing here is calibrated by this worker. Two of the three
 * exports are re-statements of quantities that already exist elsewhere in the repository; the third is
 * the *unit* of the axis excursion is measured on, which is not a threshold at all.
 *
 * ## Why excursion is measured in **bars** rather than in raw OKLab distance
 *
 * The contract has no scalar same-colour bar — `sameColorBar()` returns the *pair's* regional bar, and
 * `constants.ts` reserves `POOLED_SAME_COLOR_BAR` for corpus dashboards and forbids it for per-pair
 * judgements. The excursion bar is defined as a **multiple of the bar**, so it inherits that: the bar
 * governing one sample of a rendered ramp is the bar of the pair *(rendered colour, nearest occupied
 * artwork colour)*, and it is not the same number at the light end of a ramp as at the dark end.
 *
 * Dividing each sample's excursion by its own pair's bar makes the comparison threshold **uniform**
 * (`2.5`) across the whole ramp, so a maximum over samples is a meaningful aggregate. Every excursion
 * number this module reports is in these units unless its name says `Distance`.
 */

import { RAMP_SAMPLES_PER_SEGMENT } from "../../../../src/contract/constants.ts"

/**
 * How far off the artwork's occupied colours a rendered ramp may pass, as a multiple of the pair's
 * same-colour bar.
 *
 * `[INHERITED — and known-arbitrary]`. This is the campaign's **P1 excursion bar**, verbatim:
 * `PHASE_0_DECISIONS.md` §4 — *"P1 — Off-artwork ramp: rendered gradient's worst excursion from
 * populated artwork colors above the excursion bar, after guide stops. Bar inherited (2.5×
 * same-color) — recalibrate in the bracketing round."* It is carried in the contract's own audit as
 * `src/contract/perception-model-audit.ts` row `"P1 excursion bar"`, classified
 * **`unknown-untested`**, and `PERCEPTION_MODEL_STUDY.md` #15 records why that classification is
 * worse than merely untested:
 *
 * > *Inherited wholesale from v2-3 and never recalibrated … expressed as a MULTIPLE of the
 * > same-colour bar — so it inherits, undeclared, every position and direction dependence the bar
 * > has … with a 2.5x lever on it and no one having decided that. No round has ever shown a reviewer
 * > an excursion.*
 *
 * **It is used here exactly as it stands, and nothing in this prototype re-derives, tunes or hedges
 * it.** D6 asks for the census this bar makes visible; the bar's own calibration is a round item
 * (`PERCEPTION_VERDICT.md`: *"an excursion stimulus of any kind"*), not a worker's call. Every number
 * this module publishes is reported in bar units as well, so a recalibration of the multiple can be
 * applied to a recorded census without re-running the pipeline.
 */
export const EXCURSION_BAR_MULTIPLE = 2.5

/**
 * One same-colour bar, expressed in the bar-normalised units excursion is measured in.
 *
 * `[DERIVED]` — this is **the unit of the axis, not a threshold**: excursion is reported as
 * `distance / thatPair'sBar`, so the number 1 *is* one bar by construction, in the same way that the
 * number 1 is one metre on an axis calibrated in metres. It is a named export because
 * `CONVENTIONS.md` forbids anonymous literals, not because a decision was made.
 *
 * It is what `guide-stop.ts` builds its **material-fall** rule out of; see `requiredFallBars`.
 */
export const ONE_BAR_IN_BAR_UNITS = 1

/**
 * How densely the rendered ramp is sampled for the excursion test.
 *
 * `[INHERITED]` — `RAMP_SAMPLES_PER_SEGMENT` from `src/contract/constants.ts`, the density the
 * contract's own whole-ramp contrast floors are evaluated at (`src/contract/ramp.ts`). The excursion
 * test asks the same *shape* of question about the same rendered ramp — a minimum/maximum of a
 * quantity that is piecewise constant in `t` because the ramp is quantised to 8 bits — so it is
 * sampled by the same instrument at the same density rather than at a density this worker chose.
 *
 * Per **segment**, so a 3-stop ramp is sampled twice as densely in total as the 2-stop ramp it came
 * from. That is the contract's own convention (`sampleRamp`'s docstring) and it is the conservative
 * direction: the re-measurement after an insertion cannot miss an excursion the first measurement
 * would have caught.
 */
export const EXCURSION_SAMPLES_PER_SEGMENT = RAMP_SAMPLES_PER_SEGMENT
