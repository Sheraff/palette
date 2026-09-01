/**
 * Fixture module for the honesty census end-to-end test.
 *
 * `[REVIEWED]` — the reviewer picked this cutoff.
 */
export const SCORE_CUTOFF = 0.62

/** `[UNCALIBRATED]` — a guess, never validated. */
export const BLEND_WEIGHT = 0.4

// no provenance at all
export const MYSTERY_FLOOR = 0.137

export function keep(score: number): boolean {
	return score > 0.91
}
