/**
 * Constants for the `UNREADABLE_COVERAGE_FRACTION` sweep (D13.2).
 *
 * Measurement only — this study changes no pipeline value. The gate under test is imported from the
 * pipeline's own `constants.ts` rather than transcribed, so "where the current value sits on the
 * curve" cannot go stale.
 */

import { UNREADABLE_COVERAGE_FRACTION } from "../constants.ts"

/** The current, `[UNCALIBRATED]`, gate — imported, never copied. */
export const CURRENT_GATE = UNREADABLE_COVERAGE_FRACTION

/**
 * The gate values swept.
 *
 * **[UNCALIBRATED] — a sweep grid, declared before the data is seen.** The brief's eight points
 * (0.5 current, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05) plus 0.45/0.35 to close the gap between the
 * current value and the next brief point, plus 0.0 as the no-gate limit that makes the ceiling
 * curve's asymptote readable. Thirteen values; the current 0.5 sits at the top edge on purpose —
 * the whole question is whether the gate is too *high*.
 */
export const GATE_GRID: readonly number[] = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]

/**
 * The declared family size for `sweepThenTest`: every cell of the grid is tested and the best is
 * only reportable against this denominator.
 *
 * `[INHERITED]` — the grid length, computed rather than written down. The two test families
 * (vs. majority-class baseline, and paired vs. the current gate) are each corrected over the whole
 * grid separately, and each declares this size.
 */
export const GRID_SIZE = GATE_GRID.length

/** Significance level for both families. `[UNCALIBRATED]` — the repository default. */
export const ALPHA = 0.05

/**
 * The run sets, by file, resolved against `research/v3` / the prototype directory.
 *
 * `endorsed` is not a file: it is whatever `q2-laminarity/labels.ts` joins, so the 144 labelled
 * covers of this study are by construction the same 144 W-G measured.
 */
export const DEMO_SET = "data/devloop/sets/demo-20.txt"
export const FRESH_SET = "review-rounds/round-3-quality/fresh-40.txt"

/**
 * The **ceiling floor** the `ceiling-90` candidate point has to clear.
 *
 * **[UNCALIBRATED] — a declared rule, written before the grid was evaluated.** A gate's *ceiling* is
 * the best agreement any laminarity constants could reach behind it, because a gated-out cover is
 * forced to `gradient: false`: gated-out flats agree for free, gated-out ramps are automatic errors.
 * 0.90 says "at most one labelled cover in ten is an error the laminarity stage cannot even see" —
 * a round number chosen so the rule picks a point rather than the analyst picking it.
 */
export const CEILING_FLOOR = 0.9

/**
 * How the candidate operating points are chosen. **Declared here before `sweep.ts` was first run**,
 * so the points are the output of a rule and not of a look at the curve.
 *
 *  1. `current` — the `[UNCALIBRATED]` status quo, on the wall so the round is a comparison and not
 *     a proposal.
 *  2. `ceiling-90` — the **highest** gate on the grid whose ceiling is at least {@link CEILING_FLOOR}.
 *     Highest, not lowest: the gate exists to refuse parses that are not readable, so the candidate
 *     is the least intervention that lifts the ceiling out of the way.
 *  3. `best-agreement` — the grid cell with the highest agreement against the 144 legacy labels at
 *     the *current* laminarity constants, quoted with the declared family size and its Holm-adjusted
 *     p-value. Ties break to the higher gate.
 *  4. `no-gate` — the g=0 limit. Not a proposal; the total price of the gate, so the round can see
 *     what the other two points are a fraction of.
 */
export const OPERATING_POINT_RULES = [
	"current: the [UNCALIBRATED] status quo",
	`ceiling-90: the highest gate whose agreement ceiling is >= ${CEILING_FLOOR}`,
	"best-agreement: the highest-agreement gate against the 144 legacy labels at the current laminarity constants, ties to the higher gate",
	"no-gate: g=0, the limit point",
] as const

/** This study's label, so a stale artifact is obvious. */
export const STUDY_VERSION = "p2-tos-gate-sweep-0.1.0"
