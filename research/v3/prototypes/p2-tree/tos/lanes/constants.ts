/**
 * Constants introduced by the chromatic lanes, each with its provenance tag.
 *
 * Everything the L-only pipeline already decided is **imported** from `../constants.ts` rather than
 * restated: the area floor, the field/mark split, the mark limit, the stability window, the render
 * axis. A lane is a new *channel*, not a new set of numbers, and the point of arm-b′ §2.1 is that the
 * three channels are one paradigm commitment rather than three parameterisations.
 *
 * Only four names are new here, and two of them are arithmetic on a measurement.
 */

import { L_LEVEL_STEP } from "../constants.ts"

/**
 * The three marginal channels a tree is built on.
 *
 * `[INHERITED]` — arm-b′ §2.1, which calls three channels *a paradigm commitment and not a tunable*:
 * "a region is invisible to the parse only if it matches its surround in L **and** a **and** b — that
 * is, only if it is the same colour, which is the correct blindness." Cycle 1 shipped `L` alone and
 * recorded the isoluminant blindness as a structural gap (`../NOTES.md`); this array closes it.
 *
 * Order is fixed and is part of the determinism promise: it breaks ties between nodes of equal rank
 * that come from different lanes.
 */
export const LANES = ["L", "a", "b"] as const

export type Lane = (typeof LANES)[number]

/**
 * The largest absolute value either OKLab chroma axis can take on an in-gamut sRGB colour.
 *
 * `[MEASURED]` — an exhaustive scan of all 16,777,216 sRGB triples through
 * `src/contract/color.ts`'s `rgbToOkLab`, run 2026-08-04 on this worktree (0.9 s):
 *
 * | axis | minimum | maximum |
 * |---|---|---|
 * | `a` | −0.23388757418790818 (`#00ff00`-ward) | +0.27621639742350523 (`#ff00ff`-ward) |
 * | `b` | −0.31152814767837510 (`#0000ff`-ward) | +0.19856975465179516 (`#ffff00`-ward) |
 *
 * The value below is `max(|min|, |max|)` over both axes, which is `b`'s minimum. It is a
 * *measurement of the colour space*, not a corpus statistic and not a tunable — no artwork can move
 * it — and `tests/gamut.test.ts` re-runs the scan so the number cannot go stale silently.
 */
export const CHROMA_AXIS_EXTREME = 0.3115281476783751

/**
 * How many quantisation steps each chroma axis needs on either side of zero.
 *
 * Derived, not chosen: `ceil(CHROMA_AXIS_EXTREME / L_LEVEL_STEP)`. The step is **`L_LEVEL_STEP`
 * itself** — a, b and L are the same units in OKLab, and the same-colour bar is a Euclidean radius
 * over all three, so the rule `../constants.ts` derives for L ("one level must be smaller than the
 * smallest measured same-colour bar", 0.42x it) transfers to a and b without restating it. Using a
 * *different* step on the chroma axes would be a second quantisation decision with no second
 * measurement behind it.
 */
export const CHROMA_AXIS_STEPS = Math.ceil(CHROMA_AXIS_EXTREME / L_LEVEL_STEP)

/**
 * The half-width of the quantised chroma axis, in OKLab units. Derived; a strict outer bound on the
 * sRGB gamut by construction, with `CHROMA_AXIS_STEPS * L_LEVEL_STEP - CHROMA_AXIS_EXTREME` of slack.
 *
 * `quantiseChromaLanes` throws rather than clamping if a decoded pixel ever lands outside it: a
 * clamp would silently merge the two extremes of the axis into one level, which is exactly the kind
 * of invisible wrong answer the tree tests exist to prevent.
 */
export const CHROMA_AXIS_BOUND = CHROMA_AXIS_STEPS * L_LEVEL_STEP

/**
 * Integer levels on each chroma axis: `[-CHROMA_AXIS_BOUND, +CHROMA_AXIS_BOUND]` at `L_LEVEL_STEP`.
 * Derived. 161 against L's 256 — the chroma axes are genuinely shorter, at identical resolution.
 */
export const CHROMA_LEVEL_COUNT = 2 * CHROMA_AXIS_STEPS + 1

/**
 * How many mark nodes the accent stage clusters, taken **down its own ranking** rather than by area.
 *
 * **[UNCALIBRATED] — a cost guard, and deliberately not a wall.** The round-1 miss on
 * `…35b967964d` was not a threshold rejecting the vivid red-orange: nodes with representative
 * colours `#ee5567`, `#f45c6b`, `#e65157` were *retained by the tree already*, at area fractions
 * 0.0005–0.002, and were then discarded by the role stage's area-ordered truncation — cycle 1's
 * `MARK_NODE_LIMIT`, cycle 2's `roles/constants.ts` `TEXT_COMPONENT_LIMIT` — which cuts the mark set
 * **by area** before either ranking is applied. The node that now carries the accent ranks 602nd by
 * area out of 963 marks on that cover. A vivid accent is characteristically small, so an
 * area-ordered cost guard in front of the accent ranking is a saturation wall wearing a different hat.
 *
 * The fix is to truncate along the ranking that is about to be applied. Accent candidates are sorted
 * by the accent key — chromatic distance from the field, `perception-4`'s direction — and only the
 * tail of *that* order is dropped. Nothing below the cut can be the accent, because everything above
 * it is more chromatic. No floor, no threshold, no minimum saturation: a low-chroma image simply
 * produces a low-chroma accent, and the contract's own separation rule decides whether it publishes.
 *
 * 256 because clustering is quadratic in this number and 256² pairs is nothing. There is no evidence
 * behind it and it gates only cost.
 */
export const ACCENT_CANDIDATE_LIMIT = 256

/**
 * What the chromatic candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * `[UNCALIBRATED]` — a label. `0.2.0-cycle-2` says this is the second prototype cycle of the
 * tree-of-shapes family: three lanes instead of one, and accent mining down the accent ranking.
 */
export const CHROMA_ALGORITHM_VERSION = "p2-tos-chroma-0.2.0-cycle-2"
