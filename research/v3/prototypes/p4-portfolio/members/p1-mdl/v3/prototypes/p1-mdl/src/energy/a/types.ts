/**
 * The energy's result shape — the same for both arms, so the falsifier can hold them side by side.
 *
 * `DESIGN.md`'s module layout: *"Both expose `energyOf(measurement, palette) -> {total, terms}` for
 * arbitrary contract-legal palettes."* This adds a third field, `nuisance`, and the reason is not
 * decoration: arm A's energy is a **profile** — the split scale `s*`, the ramp's geometry and
 * direction, and the residual mixing weight are minimised out rather than published, and a profiled
 * energy whose profile is not reported cannot be audited. Every number in `nuisance` is something the
 * energy *chose*; every number in `terms` is something it *paid*.
 */

export type EnergyResult = Readonly<{
	/** The scalar being minimised. Equals the sum of `terms`, exactly, in the order they are written. */
	total: number
	/** The named additive contributions to `total`. */
	terms: Record<string, number>
	/** What the profile settled on, plus the constants a reader needs to reproduce the number. */
	nuisance: Record<string, number | string>
}>

/** Options exist for the mandatory λ sweep and for tests. `energyOfA(m, x)` with no options is the model. */
export type EnergyOptions = Readonly<{
	/** Overrides `DEFAULT_LAMBDA`. `DESIGN.md` decision 2 requires λ ∈ {¼, ½, 1, 2, 4} to be swept. */
	lambda?: number
}>
