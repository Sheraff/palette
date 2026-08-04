/**
 * The shape arm A′'s energy returns, and the one option it takes.
 *
 * `DESIGN.md` module layout: *"`src/energy/a.ts`, `src/energy/aprime.ts` — the two priors. Both
 * expose `energyOf(measurement, palette) -> {total, terms}` for arbitrary contract-legal palettes."*
 * This prototype's build brief widens that to `{total, terms, nuisance}`, and the widening is not
 * cosmetic: arm A′'s field code has to be *profiled* over choices the configuration does not carry
 * (which of the three fitted geometries a ramp is parameterised by, and which way round it runs).
 * A profiled likelihood is only reportable if the profile's argmin is reported with it, so
 * `nuisance` is where every such choice is written down. Nothing in `nuisance` is an energy; nothing
 * in `terms` is a diagnostic.
 */

/**
 * One evaluation of `E(P) = L(pixels | P) + λ·L(P)`.
 *
 * - `total` — the energy, in **bits**. Finite for every contract-shaped configuration (see
 *   `index.ts`, "Finiteness").
 * - `terms` — the additive decomposition. **Sums to `total` exactly**, up to float association;
 *   `tests/energy-aprime/energy.test.ts` checks it. Every term is in bits.
 * - `nuisance` — everything a reader needs to interpret the number that is *not* part of it: the λ
 *   used, the unscaled L(P), the profile's argmin, and the field/ink/generic split it landed on.
 */
export type EnergyResult = Readonly<{
	total: number
	terms: Readonly<Record<string, number>>
	nuisance: Readonly<Record<string, number | string>>
}>

/** The only option. λ is `DESIGN.md` decision 2's exchange rate, `[UNCALIBRATED]` at 1.0. */
export type EnergyOptions = Readonly<{
	lambda?: number
}>

/** Which code family a triple's mass was assigned to. Ordered; the order is the tie-break. */
export const CODE_FAMILIES = ["field", "ink", "generic"] as const

export type CodeFamily = (typeof CODE_FAMILIES)[number]
