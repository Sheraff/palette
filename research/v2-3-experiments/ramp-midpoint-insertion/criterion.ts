/**
 * The arm's measuring surface. The mechanism itself lives in
 * `research/v2-3/src/internal/ramp-midpoint.ts`; this file only re-exports it so the harness never
 * measures a second implementation of the thing it is reporting on.
 *
 * The one thing added here is the ability to measure with the flag OFF: `rampMidpointInsertion`
 * short-circuits on the flag by design, so the harness calls the underlying pieces directly.
 */
export {
	buildRampSupport,
	nominateRampMidpoint,
	rankRampMidpointCandidates,
	rampExcursion,
	RAMP_EXCURSION_BAR,
	RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION,
	RAMP_MIDPOINT_INSERTION,
} from "../../v2-3/src/internal/ramp-midpoint.ts"

export type { RampSupportColor, RampExcursion, RampMidpointNomination } from "../../v2-3/src/internal/ramp-midpoint.ts"

import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"

/** The one just-noticeable difference the tie rule is stated in. */
export const SAME_COLOR: number = ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor
