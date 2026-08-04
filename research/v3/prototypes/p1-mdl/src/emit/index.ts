/**
 * `src/emit/` — P1's contract-facing layer, and the only part of P1 that knows what a `Palette` is.
 *
 * The division of labour `DESIGN.md` sets out:
 *
 * - `types.ts` — the `Configuration`: the whole answer for one artwork, as one object.
 * - `palette.ts` — `toPalette()`: configuration + file identity → contract `Palette`. Total,
 *   mechanical, never a judge.
 * - `source-meta.ts` — a file's identity for that metadata block. **The only module here that loads
 *   `sharp`**, which is why it is separate: see its header.
 * - `feasibility.ts` — the contract *is* the feasible set. One function; nothing else in P1 calls
 *   `validatePalette` or `scorePalette`.
 * - `cost.ts` — arm A′'s L(P), in bits. Pure.
 * - `legacy.ts` — the three legacy verdict tiers, loaded separately and kept that way.
 * - `paths.ts` — where the corpus and the fixtures are.
 *
 * Nothing here imports `src/measure/` or `src/energy/`. The dependency runs one way: measurement and
 * the energies build configurations, this layer publishes and prices them.
 */

export * from "./types.ts"
export * from "./palette.ts"
export * from "./source-meta.ts"
export * from "./feasibility.ts"
export * from "./cost.ts"
export * from "./legacy.ts"
export * from "./paths.ts"
