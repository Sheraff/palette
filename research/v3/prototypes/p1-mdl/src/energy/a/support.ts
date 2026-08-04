/**
 * # The extent code — why broad mass cannot be explained away as ink
 *
 * ## The defect this module exists to remove
 *
 * `DESIGN.md` decision 9, from the independent verifier: *"arm A's ink term prices no support. On a
 * clean diptych, 'flat + second band as foreground' (Ω = 0) undercuts two-flat at every λ; 62% of a
 * solid band's mass lands in ink at the finest profiled s\*."*
 *
 * The cause is precise, and it is not a missing penalty — it is a missing *variable*. Before this
 * module, the objective coded **colour given extent**:
 *
 * ```
 *   L = Σ_c u_c · ( −log[ π(ê_c)·ρ_field(c) + (1−π(ê_c))·ρ_ink(c) ] )
 * ```
 *
 * `ê_c` appears on the right of the conditioning bar and nowhere else. The extent map is handed to
 * the decoder for free, so the configuration is free to *choose* a split scale that reassigns half an
 * image's worth of broad mass to the ink population and pay nothing for the reassignment. Arm A §2.2
 * says what ink is — *"small, high-frequency and marks-like"* — and the split scale is *"part of the
 * configuration and optimised jointly"*; but a configuration cannot be charged for a claim it makes
 * about a quantity the code never transmits.
 *
 * ## The fix: code the extent too
 *
 * The decoder is given no extent map. So the code is over the pair, factorised the way a code over a
 * pair is:
 *
 * ```
 *   ρ(c, ê) = m(ê) · ρ(c | ê)
 * ```
 *
 * `ρ(c | ê)` is exactly what the objective already charged — unchanged, to the last digit, at a fixed
 * split scale. `m(ê)` is new, and it is the **marginal of the two populations' own extent densities**:
 * each population is now a joint kernel over (colour, extent),
 *
 * ```
 *   ρ_field(c, ê) = ρ_field(c) · q_field(ê)        q_field(ê) ∝ exp(−ê / 2w)
 *   ρ_ink(c, ê)   = ρ_ink(c)   · q_ink(ê)          q_ink(ê)   ∝ exp(−(S − ê) / 2w)
 *   m(ê)          = π₀·q_field(ê) + (1−π₀)·q_ink(ê)
 * ```
 *
 * on the rung interval `ê ∈ [0, S]` that `split.ts` already defines, where `ê = 0` is *"coherent at
 * the coarsest box — a full-frame field"* and `ê = S` is *"the thinnest possible mark"*. The two
 * densities are **the same exponential**, one anchored at the coarse end of the ladder and one at the
 * fine end, so they share one normaliser and the model has no asymmetry anyone chose. Broad mass
 * (small `ê`) is cheap under `q_field` and expensive under `q_ink`: that is arm A §2.2's sentence,
 * written as a density instead of as prose, and it is what makes the diptych's second band
 * unaffordable as ink.
 *
 * ## The logistic is not replaced — it is derived
 *
 * The rate `1/2w` is not a choice. With it, the **posterior** membership of a triple given its extent
 * is
 *
 * ```
 *   P(field | ê) = π₀q_field / m(ê) = σ( logit π₀ + (S − 2ê)/2w ) = σ( (ŝ* − ê) / w )
 * ```
 *
 * for `ŝ* = w·logit π₀ + S/2` — **arm A §2.2's logistic exactly**, at arm A §4.2's softness of one
 * ladder octave, with `ŝ*` still the quantity the profile grid runs over. Any other rate would give a
 * logistic of a different width and contradict §4.2's anchor; this one reproduces the model that was
 * already there and adds the term it was missing. Inverting: `π₀ = σ((ŝ* − S/2)/w)`, so a split scale
 * at the middle of the ladder is a population prior of one half, and `π(ê)` in `split.ts` is
 * untouched — this module supplies the marginal, not the membership.
 *
 * ## What it costs, in arm A's currency
 *
 * `−log m(ê)` in nats, added to each triple's per-unit-mass cost, split between `terms.field` and
 * `terms.ink` by the same population responsibilities that split the colour cost (`index.ts:
 * attributeCost`) — so a triple the profile has called ink pays its support premium **in the ink
 * term**, which is where decision 9 asks for it, and `terms.field + terms.ink` still equals the whole
 * data cost exactly.
 *
 * Three consequences worth stating because they are checkable rather than hoped for:
 *
 * 1. **It is bounded**, so the energy stays total: `m(ê) ≥ min(π₀, 1−π₀)·e^{−S/2w}/Z`, and `π₀` is a
 *    logistic of a finite argument so it is never 0 or 1. At `S = 8`, `w = 1` the widest possible
 *    charge is ≈ 8.7 nats.
 * 2. **It carries no λ**, so λ-multiplicativity is untouched.
 * 3. **It identifies the split scale from the data.** The support cost alone is minimised at the `π₀`
 *    that best fits the image's own extent distribution, so `ŝ*` is no longer free to be chosen for
 *    the convenience of a colour term. That is the whole repair: the profile still optimises `ŝ*`
 *    jointly, but now it pays for what it claims.
 *
 * ## No new constant
 *
 * `w` is `FIELD_INK_SOFTNESS_OCTAVES` — `[INHERITED]`, arm A §4.2's one octave, already in the model.
 * `S` is the ladder's rung count, `[INHERITED]` from the measurement. The rate `1/2w` and the support
 * `[0, S]` are `[DERIVED]`: the first from requiring §2.2's logistic back, the second from the range
 * `split.ts`'s rung transform already has. Nothing in this file is tunable.
 */

import { FIELD_INK_SOFTNESS_OCTAVES } from "./constants.ts"
import type { ExtentLadder } from "./split.ts"

/**
 * The exponential rate of both extent densities, in reciprocal rungs.
 *
 * [DERIVED] — half the reciprocal softness, and *only* this value returns arm A §2.2's logistic at
 * §4.2's width: the log-odds between the two densities accumulates `1/2w` from each side, so the
 * posterior's slope in `ê` is `1/w`. Written once, here.
 */
const EXTENT_RATE = 1 / (2 * FIELD_INK_SOFTNESS_OCTAVES)

/**
 * `π₀ = σ((ŝ* − S/2)/w)` — the field's **population prior**, the split scale reparameterised.
 *
 * The profile grid still runs over `ŝ*` (`split.ts: splitScaleGrid`); this is the same number read as
 * the mixing weight of the joint model. `ŝ* = S/2` is `π₀ = ½`; the grid's ends are `σ(∓S/2w)`, which
 * at `S = 8, w = 1` is 0.018 and 0.982 — near the ends but never at them, which is what keeps
 * "membership is never decided" true of the prior as well as of the posterior.
 */
export function extentFieldPrior(splitScaleRung: number, ladder: ExtentLadder): number {
	const centred = (splitScaleRung - ladder.rungCount / 2) / FIELD_INK_SOFTNESS_OCTAVES
	return 1 / (1 + Math.exp(-centred))
}

/**
 * `q_field(ê)` and `q_ink(ê)` — the two populations' extent densities, at one rung.
 *
 * Exported so the normalisation and the posterior identity can be *tested* rather than asserted in
 * prose (`tests/energy-a/support.test.ts`). Nothing in the energy calls this: `extentSupportNats`
 * inlines the same two expressions to avoid an allocation per triple, and the test pins the two
 * against each other.
 */
export function extentDensities(
	rung: number,
	ladder: ExtentLadder,
): { field: number; ink: number } {
	const normaliser = (1 - Math.exp(-ladder.rungCount * EXTENT_RATE)) / EXTENT_RATE
	return {
		field: Math.exp(-rung * EXTENT_RATE) / normaliser,
		ink: Math.exp(-(ladder.rungCount - rung) * EXTENT_RATE) / normaliser,
	}
}

/**
 * `−log m(ê_c)` for every triple, in nats, written into `into`.
 *
 * Both densities are written against the **same** normaliser `Z = ∫₀^S exp(−u/2w) du`, by anchoring
 * the ink density at the fine end: `q_ink(ê) ∝ exp(−(S−ê)/2w)`. That is algebraically identical to
 * `exp(+ê/2w)/∫₀^S exp(+u/2w) du` and avoids ever exponentiating a positive number, so the arithmetic
 * cannot overflow for a longer ladder than the one we have.
 */
export function extentSupportNats(
	rungs: Float64Array,
	splitScaleRung: number,
	ladder: ExtentLadder,
	into: Float64Array,
): void {
	const span = ladder.rungCount
	const fieldPrior = extentFieldPrior(splitScaleRung, ladder)
	const inkPrior = 1 - fieldPrior
	// Z = 2w·(1 − e^{−S/2w}) — the shared normaliser of the two anchored exponentials on [0, S].
	const normaliser = (1 - Math.exp(-span * EXTENT_RATE)) / EXTENT_RATE
	const logNormaliser = Math.log(normaliser)
	for (let row = 0; row < rungs.length; row += 1) {
		const rung = rungs[row]
		const fieldPart = fieldPrior * Math.exp(-rung * EXTENT_RATE)
		const inkPart = inkPrior * Math.exp(-(span - rung) * EXTENT_RATE)
		into[row] = logNormaliser - Math.log(fieldPart + inkPart)
	}
}

/** `Σ_c u_c · (−log m(ê_c))` — the support term's own contribution, in nats per unit image mass. */
export function weightedSupportCost(massShare: Float64Array, supportNats: Float64Array): number {
	let total = 0
	for (let row = 0; row < massShare.length; row += 1) {
		const mass = massShare[row]
		if (mass === 0) continue
		total += mass * supportNats[row]
	}
	return total
}
