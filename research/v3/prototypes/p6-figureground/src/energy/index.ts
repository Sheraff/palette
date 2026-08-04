/**
 * The energy module's public surface: the rates registry, the terms, the inherited barriers, the
 * coverage transport cost, and the solver.
 *
 * Import order matters for one thing only and it is worth saying out loud: **`./rates.ts` is the
 * only file in this module that contains a number**, and everything else takes an `ExchangeRates`
 * argument (`SPEC.md` rule 4). If a weight ever appears anywhere else, the sensitivity harness
 * stops being able to see it, and the prototype's designated falsifier stops working.
 */

export * from "./rates.ts"
export * from "./terms.ts"
export * from "./barriers.ts"
export * from "./coverage.ts"
export * from "./solve.ts"
