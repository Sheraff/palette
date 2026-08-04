/**
 * Constants for the laminarity-cut sweep. Measurement only — this study changes no pipeline value.
 *
 * The two numbers under test (`LAMINARITY_CUT` 0.15, `MONOTONE_MIGRATION_FRACTION` 0.8) are imported
 * from the pipeline's own `constants.ts` rather than transcribed, so "where the current values sit
 * on the curve" cannot go stale.
 */

import { LAMINARITY_CUT, MONOTONE_MIGRATION_FRACTION } from "../../constants.ts"

/** The current, `[UNCALIBRATED]`, operating point — imported, never copied. */
export const CURRENT_POINT = { laminarityCut: LAMINARITY_CUT, monotoneMigrationFraction: MONOTONE_MIGRATION_FRACTION } as const

/**
 * The `LAMINARITY_CUT` values swept.
 *
 * **[UNCALIBRATED] — a sweep grid, declared before the data is seen.** Log-ish spacing from an
 * almost-perfectly-straight chain (0.02) to a cut that would call nearly any chain laminar (0.30),
 * with the current 0.15 sitting inside rather than at an edge. Eleven values, so a curve is visible
 * without the grid itself becoming the finding.
 */
export const LAMINARITY_CUT_GRID: readonly number[] = [0.02, 0.04, 0.06, 0.08, 0.1, 0.125, 0.15, 0.175, 0.2, 0.25, 0.3]

/**
 * The `MONOTONE_MIGRATION_FRACTION` values swept.
 *
 * **[UNCALIBRATED] — a sweep grid.** 1.0 is literal monotonicity (the reading `NOTES.md` deviation 2
 * rejected as unusable); 0.5 is a walk that doubles back half the time. The current 0.8 is interior.
 */
export const MONOTONE_GRID: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1]

/**
 * The declared family size for `sweepThenTest`: every cell of the grid is computed and the best is
 * only reportable against this denominator.
 *
 * `[INHERITED]` — the product of the two grids, computed rather than written down.
 */
export const GRID_SIZE = LAMINARITY_CUT_GRID.length * MONOTONE_GRID.length

/**
 * How many endorsed covers join demo-20 for the verdict-distribution half of the study.
 *
 * **[UNCALIBRATED] — a sample size the cycle-2 brief fixed.** Taken as the first 50 endorsed
 * artworks by sorted repo-relative image path, so the subset is reproducible from the corpus alone.
 */
export const ENDORSED_VERDICT_SUBSET = 50

/** This study's label, so a stale artifact is obvious. */
export const STUDY_VERSION = "p2-tos-q2-laminarity-0.1.0"
