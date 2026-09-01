/**
 * The v3 palette output contract.
 *
 * `types.ts` is the schema, `constants.ts` holds every threshold with its provenance, `color.ts` is
 * the colour maths (the one ruler, and APCA with its raw pre-clamp value exposed), and
 * `invariants.ts` enforces `PHASE_0_DECISIONS.md` §4.
 *
 * Specification: `research/v3/PHASE_0_DECISIONS.md` §2 (contract) and §4 (invariants).
 */

export * from "./constants.ts"
export * from "./types.ts"
export * from "./color.ts"
export * from "./ramp.ts"
export * from "./invariants.ts"
export * from "./scorecard.ts"
