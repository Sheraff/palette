/**
 * # The residual mixing weight — a nuisance, estimated rather than chosen
 *
 * Every density in arm A's objective is a mixture of a **model** part (kernels at the configuration's
 * colours, or the integral along its path) and the **residual** — the uniform over the sRGB gamut:
 *
 *     ρ(c) = (1 − ε)·ρ_model(c) + ε·ρ₀
 *
 * `ρ₀` is parameter-free (`gamut.ts`). `ε` is not a modelling choice either: arm A §4 lists *"the
 * per-image field noise scale and residual mixing weight"* under **explicitly not free** — *"nuisance
 * parameters estimated per image — estimated is not chosen"*. This module is that estimation.
 *
 * ## Why EM, and why it is safe here
 *
 * With both component densities **fixed** and one free weight, the weighted log-likelihood
 * `Σ_c u_c log((1−ε)a_c + ε b)` is concave in ε on `[0,1]` — it is a positively weighted sum of logs
 * of affine functions of ε. So there is a single maximum, EM's fixed-point iteration increases the
 * likelihood monotonically, and it cannot land in a different optimum from a different start. That is
 * what makes "profiled by EM" a *definition* of ε rather than an algorithmic accident, and it is why
 * the iteration below needs no restarts, no annealing and no RNG.
 *
 * The E and M steps collapse into one pass: the responsibility of the residual for triple `c` is
 * `r_c = εb / ((1−ε)a_c + εb)`, and the M step is `ε ← Σ u_c r_c / Σ u_c`.
 *
 * ## One residual, not two
 *
 * Arm A §2.2 writes *"the residual"* in the singular — *"absorbing mass no four-colour model claims"*
 * — and that is how `index.ts` uses this function: **one** ε for the whole configuration. Because the
 * field and ink priors sum to one at every triple, `π·[(1−ε)ρ_f + ερ₀] + (1−π)·[(1−ε)ρ_i + ερ₀]`
 * collapses to `(1−ε)·[π ρ_f + (1−π) ρ_i] + ε·ρ₀`, so the model density handed in here is already the
 * π-weighted mixture of the two populations and the two-component EM below is the whole estimation.
 *
 * ## What is *not* estimated here
 *
 * The weights **within** the model part are not free either, and they are not estimated by EM. The
 * field's two-flat mixture is fixed at its components' **field-weighted smoothed masses**, which is a
 * statistic of the image and the configuration computed in one pass; the ink mixture is fixed at
 * equal weights. `index.ts` gives the reasons for both at the point of use.
 */

import { MIXTURE_EM_MAX_ITERATIONS, MIXTURE_EM_TOLERANCE, MIXTURE_WEIGHT_FLOOR } from "./constants.ts"

export type ResidualFit = Readonly<{
	/** The profiled residual weight, in `[floor, 1 − floor]`. */
	residualWeight: number
	/** `Σ_c u_c · (−log ρ(c))` — the term's contribution, in nats per unit image mass. */
	cost: number
	/** How many EM passes ran. Reported so the iteration cap can be checked rather than trusted. */
	iterations: number
}>

/**
 * Profile ε and return the resulting cross-entropy.
 *
 * `weights` is `u_c`, the population's share of **total image mass** for each triple, so `cost` comes
 * out already in arm A's units — nats per unit *image* mass, not per unit population mass. That is
 * the normalisation §1's resolution-agnosticism argument needs: a term can only be as expensive as
 * the mass it is responsible for, so an image with almost no ink has an almost-free ink term and λ
 * stays a scale-free constant.
 *
 * A population with no mass at all returns zero cost and a residual weight of 1 — there is nothing
 * for the mixture to explain, and reporting the neutral weight keeps the nuisance block readable.
 */
export function profileResidualWeight(
	weights: Float64Array,
	modelDensity: Float64Array,
	residualDensity: number,
): ResidualFit {
	let totalWeight = 0
	for (let row = 0; row < weights.length; row += 1) totalWeight += weights[row]
	if (!(totalWeight > 0)) return { residualWeight: 1, cost: 0, iterations: 0 }

	const ceiling = 1 - MIXTURE_WEIGHT_FLOOR
	// A neutral start. Concavity makes the fixed point independent of it; a half is chosen so that a
	// hand-check of the first iteration is arithmetic anyone can do.
	let residual = 0.5
	let iterations = 0
	for (let pass = 0; pass < MIXTURE_EM_MAX_ITERATIONS; pass += 1) {
		iterations = pass + 1
		const modelShare = 1 - residual
		const residualPart = residual * residualDensity
		let responsibility = 0
		for (let row = 0; row < weights.length; row += 1) {
			const weight = weights[row]
			if (weight === 0) continue
			const total = modelShare * modelDensity[row] + residualPart
			// `total` is at least `residualPart > 0`, so this division is guarded by the weight floor
			// below and by `ρ₀ > 0` — never by a test on the data.
			responsibility += weight * (residualPart / total)
		}
		let next = responsibility / totalWeight
		if (next < MIXTURE_WEIGHT_FLOOR) next = MIXTURE_WEIGHT_FLOOR
		if (next > ceiling) next = ceiling
		const moved = Math.abs(next - residual)
		residual = next
		if (moved < MIXTURE_EM_TOLERANCE) break
	}

	const modelShare = 1 - residual
	const residualPart = residual * residualDensity
	let cost = 0
	for (let row = 0; row < weights.length; row += 1) {
		const weight = weights[row]
		if (weight === 0) continue
		cost += weight * -Math.log(modelShare * modelDensity[row] + residualPart)
	}
	return { residualWeight: residual, cost, iterations }
}
