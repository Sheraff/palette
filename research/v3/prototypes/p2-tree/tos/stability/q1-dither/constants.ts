/**
 * Constants for the dither-churn localisation. Measurement only — nothing here feeds a pipeline.
 *
 * `CONVENTIONS.md`: no anonymous literal. Every number below is a *measurement instrument* setting,
 * so its provenance tag says what would have to happen for it to stop being a guess.
 */

/** The perturbation arm this study localises. `[INHERITED]` — `data/robustness/perturbation-set-1.json`. */
export const ARM = "dither-lsb1"

/** The candidate whose churn is being localised. `[INHERITED]` — `data/robustness/reports/p2-tos.json`. */
export const CANDIDATE = "p2-tos"

/**
 * Two retained nodes (one per side of the perturbation) are *the same region named twice* when their
 * shape areas agree within this relative tolerance **and** their centroids are within
 * {@link MATCH_CENTROID_DISTANCE}.
 *
 * **[UNCALIBRATED] — an instrument setting, not a pipeline number.** `SPEC.md`'s cycle-2 brief says
 * "match nodes by centroid + area overlap" and gives no tolerance. 0.10 is loose enough that a
 * ±1-LSB dither moving a level boundary by a few hundred pixels of a 640x640 cover still matches,
 * and tight enough that a node cannot match a sibling twice its size. The whole stage-a/stage-b
 * split depends on it, so {@link MATCH_SENSITIVITY_SETTINGS} re-runs the attribution at two other
 * settings and the report prints all three.
 */
export const MATCH_AREA_RATIO_TOLERANCE = 0.1

/**
 * How far two matched centroids may sit apart, in units of the image's own width/height (the
 * pipeline already normalises centroids that way).
 *
 * **[UNCALIBRATED]** — see {@link MATCH_AREA_RATIO_TOLERANCE}. 0.02 is 12.8 px on a 640 cover.
 */
export const MATCH_CENTROID_DISTANCE = 0.02

/** Tighter and looser matcher settings, re-run so the attribution's dependence on the matcher is visible. */
export const MATCH_SENSITIVITY_SETTINGS: readonly Readonly<{ name: string; areaRatio: number; centroid: number }>[] = [
	{ name: "tight", areaRatio: 0.02, centroid: 0.005 },
	{ name: "default", areaRatio: MATCH_AREA_RATIO_TOLERANCE, centroid: MATCH_CENTROID_DISTANCE },
	{ name: "loose", areaRatio: 0.25, centroid: 0.05 },
]

/**
 * Area deciles the per-node churn rates are broken out over, as area fractions.
 *
 * **[UNCALIBRATED] — presentation bins.** The round-1 outcome names "small-node churn" as a suspect;
 * these edges bracket `MIN_NODE_AREA_FRACTION` (0.0005) and `FIELD_AREA_FRACTION` (0.10) so the
 * suspicion is testable rather than asserted.
 */
export const AREA_BINS: readonly number[] = [0.0005, 0.001, 0.005, 0.02, 0.1, 1]

/** This study's label, so a stale artifact is obvious. */
export const STUDY_VERSION = "p2-tos-q1-dither-0.1.0"
