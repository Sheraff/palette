/**
 * The selector — arm-c′ §2.3's four mechanisms, in the order they run (SPEC §2).
 *
 * **(b) first, not last: immateriality.** Before any margin is computed the selector asks the only
 * question that matters — *do the members publish different palettes at all?* Every unordered pair
 * is compared role by role on the contract's own same-colour bar, through `compareRole()` from
 * `src/adjudication/match.ts`, the same ruler `tools/disagreement.ts` used at M1. When every pair
 * agrees on every role the selection is **immaterial** and is recorded as such: no decision, no
 * risk, and no bootstrap paid for.
 *
 * **(a) the currency.** Winner is the smallest `totalBits` — `L(palette)` plus residual bits, from
 * `currency.ts`. A member contributes a palette and nothing else.
 *
 * **(c) the measured margin.** A **block bootstrap over lattice cells**, refit-free: the palettes
 * are fixed, so only the per-cell residual difference is resampled. Two things about it are
 * measured rather than set:
 *
 *  - **the block side** is the residual difference's own **correlation length** — the smallest lag
 *    at which the lattice autocorrelation of `bits_A − bits_B` has fallen to `1/e`. Measured per
 *    cover, on exactly the series being resampled, which is what "blocks sized to the fitted field's
 *    correlation scale" (arm-c′ §4.7) means when the thing being resampled is a difference of two
 *    fields;
 *  - **the resample count** is not a parameter (§4.7 says so outright): resampling stops as soon as
 *    the Wilson interval on the win fraction excludes one half, and `wilsonInterval()` from
 *    `src/stats/binomial.ts` supplies both the interval and its confidence level, so no confidence
 *    constant is restated here. `BOOTSTRAP_RESAMPLE_CAP` is a compute ceiling and is reported.
 *
 * Blocks are drawn as contiguous squares with wraparound (the circular block bootstrap), because a
 * non-circular scheme under-samples the lattice's edges and the edge of an album cover is exactly
 * where fields differ.
 *
 * **(d) the tie-break.** Equal totals go to the cheaper `L(palette)` — fewer published distinctions
 * — and an exact remaining tie goes to the lexicographically first slug, a determinism device
 * rather than a judgement.
 *
 * **(c′) the election.** §2.3c's sentence is *"the winner stands if it wins a majority"*, and a
 * majority is a thing the bootstrap measures rather than a thing the point total asserts. Where the
 * two disagree — the interval clears ½ on the losing side — the measurement is what is published.
 * See {@link electFromBootstrap}.
 */

import { compareRole, DEFAULT_MATCH_OPTIONS } from "../../../src/adjudication/match.ts"
import { ROLE_NAMES } from "../../../src/contract/index.ts"
import type { RoleName } from "../../../src/contract/types.ts"
import { wilsonInterval } from "../../../src/stats/binomial.ts"
import { makeRng } from "../../../src/stats/numeric.ts"

import {
	BOOTSTRAP_RESAMPLE_CAP,
	CENSUS_BASE,
	CORRELATION_DECAY_TARGET,
	INDIFFERENT_WIN_FRACTION,
	PAIR_SIZE,
} from "./constants.ts"
import type {
	BootstrapReport,
	Election,
	MaterialityReport,
	MemberPalette,
	MemberPrice,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// (b) Immateriality
// ---------------------------------------------------------------------------------------------

/**
 * Do these palettes differ at the contract's bar? All pairs, all four roles.
 *
 * `DEFAULT_MATCH_OPTIONS` carries `barMode: "regional"` — the calibrated per-pair bar, which
 * `match.ts` states is the rule for any per-pair judgement. No threshold is declared here.
 */
export function assessMateriality(members: readonly MemberPalette[]): MaterialityReport {
	const pairs: { a: string; b: string; differingRoles: RoleName[] }[] = []
	let material = false
	for (let i = 0; i < members.length; i += 1) {
		for (let j = i + 1; j < members.length; j += 1) {
			const left = members[i]!
			const right = members[j]!
			const differingRoles: RoleName[] = []
			for (const role of ROLE_NAMES) {
				const comparison = compareRole(
					role,
					left.palette.roles[role],
					right.palette.roles[role],
					DEFAULT_MATCH_OPTIONS,
				)
				if (!comparison.same) differingRoles.push(role)
			}
			if (differingRoles.length > 0) material = true
			pairs.push({ a: left.slug, b: right.slug, differingRoles })
		}
	}
	return { material, pairs }
}

// ---------------------------------------------------------------------------------------------
// (c) The measured margin
// ---------------------------------------------------------------------------------------------

/**
 * The correlation length of a per-cell series on the lattice, in cells.
 *
 * The lattice autocorrelation at lag `d` is averaged over both axes; the correlation length is the
 * smallest `d` at which it has fallen to `1/e`. That target is the definition of a correlation
 * length, not a cut-off anyone picked — which is why it is written as `1 / Math.E`.
 *
 * A series with no reachable decay returns the lattice's own side, i.e. one block covering
 * everything, which is the conservative answer: fewer, larger blocks widen the interval.
 */
export function measureCorrelationLength(series: Float64Array, resolution: number): number {
	const count = series.length
	let mean = 0
	for (const value of series) mean += value
	mean /= count
	let variance = 0
	for (const value of series) variance += (value - mean) * (value - mean)
	variance /= count
	if (variance === 0) return 1
	for (let lag = 1; lag < resolution; lag += 1) {
		let covariance = 0
		let pairs = 0
		for (let row = 0; row < resolution; row += 1) {
			for (let column = 0; column + lag < resolution; column += 1) {
				const here = series[row * resolution + column]! - mean
				covariance += here * (series[row * resolution + column + lag]! - mean)
				pairs += 1
			}
		}
		for (let row = 0; row + lag < resolution; row += 1) {
			for (let column = 0; column < resolution; column += 1) {
				const here = series[row * resolution + column]! - mean
				covariance += here * (series[(row + lag) * resolution + column]! - mean)
				pairs += 1
			}
		}
		if (pairs === 0) break
		if (covariance / pairs / variance < CORRELATION_DECAY_TARGET) return lag
	}
	return resolution
}

/** A deterministic seed from the cover's content hash — the identity every run file joins on. */
export function seedFromContentHash(contentHash: string): number {
	let seed = 0
	for (let at = 0; at < contentHash.length; at += 1) {
		// A hex string folded into a 32-bit word, byte radix. A reproducibility device: the same
		// cover always resamples the same way, on any machine.
		seed = (Math.imul(seed, CENSUS_BASE) + contentHash.charCodeAt(at)) >>> 0
	}
	return seed
}

/**
 * The block bootstrap over lattice cells (arm-c′ §2.3c).
 *
 * `difference[k]` is `bits_winner[k] − bits_runnerUp[k]`; `schemaDelta` is the same difference in
 * `L(palette)`, which no resample can change. The winner wins a resample when the resampled total
 * comes out negative and loses when it comes out positive.
 *
 * **An exactly zero resample is a tie, and a tie is neither**, so it is excluded from both the
 * numerator and the denominator — the sign test's own handling, and the only one that does not
 * assume something the data did not say. It matters because the case is reachable: when arm-c′
 * §2.3d's tie-break decided the winner, the two totals are *exactly* equal and every resample of an
 * identically-zero difference ties. Scoring those as losses (`0 < 0` is false) would publish a win
 * fraction of 0.000 with a Wilson interval confidently excluding ½ — the table would report the
 * runner-up as the decisive winner of a decision the tie-break had just made the other way. When
 * every draw ties there is nothing to measure, and the report says so with `separatedFromHalf: false`
 * and the win fraction at the point of indifference itself.
 */
export function blockBootstrap(
	difference: Float64Array,
	schemaDelta: number,
	resolution: number,
	contentHash: string,
): BootstrapReport {
	const cellCount = difference.length
	const correlationLengthCells = measureCorrelationLength(difference, resolution)
	const blockSide = Math.min(resolution, Math.max(1, correlationLengthCells))
	const cellsPerBlock = blockSide * blockSide
	const blocksPerResample = Math.ceil(cellCount / cellsPerBlock)
	const random = makeRng(seedFromContentHash(contentHash))

	let wins = 0
	let resamples = 0
	let ties = 0
	let draws = 0
	let low = 0
	let high = 1
	let separated = false
	while (draws < BOOTSTRAP_RESAMPLE_CAP) {
		let sum = 0
		for (let block = 0; block < blocksPerResample; block += 1) {
			const originRow = Math.floor(random() * resolution)
			const originColumn = Math.floor(random() * resolution)
			for (let dr = 0; dr < blockSide; dr += 1) {
				const row = (originRow + dr) % resolution
				for (let dc = 0; dc < blockSide; dc += 1) {
					const column = (originColumn + dc) % resolution
					sum += difference[row * resolution + column]!
				}
			}
		}
		draws += 1
		const total = (sum * cellCount) / (blocksPerResample * cellsPerBlock) + schemaDelta
		if (total === 0) {
			ties += 1
			continue
		}
		if (total < 0) wins += 1
		resamples += 1
		const interval = wilsonInterval(wins, resamples)
		if (interval.ok) {
			low = interval.low
			high = interval.high
			if (low > INDIFFERENT_WIN_FRACTION || high < INDIFFERENT_WIN_FRACTION) {
				separated = true
				break
			}
		}
	}

	return {
		blockSide,
		correlationLengthCells,
		draws,
		resamples,
		ties,
		wins,
		winFraction: resamples === 0 ? INDIFFERENT_WIN_FRACTION : wins / resamples,
		intervalLow: low,
		intervalHigh: high,
		separatedFromHalf: separated,
		capped: !separated,
	}
}

// ---------------------------------------------------------------------------------------------
// (a) + (d) The winner
// ---------------------------------------------------------------------------------------------

/**
 * Order the priced members: cheapest total first, ties to the cheaper `L(palette)`, remaining ties
 * to the lexicographically first slug.
 */
export function rankMembers(prices: readonly MemberPrice[]): MemberPrice[] {
	return [...prices].sort((left, right) => {
		if (left.totalBits !== right.totalBits) return left.totalBits - right.totalBits
		if (left.schema.bits !== right.schema.bits) return left.schema.bits - right.schema.bits
		return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0
	})
}

/** True when the top two totals are exactly equal and `L(palette)` decided the order. */
export function decidedBySchemaPrice(ranked: readonly MemberPrice[]): boolean {
	if (ranked.length < PAIR_SIZE) return false
	return ranked[0]!.totalBits === ranked[1]!.totalBits
}

// ---------------------------------------------------------------------------------------------
// (c′) The election
// ---------------------------------------------------------------------------------------------

/**
 * Which member the selector **elects**, once the margin has been measured.
 *
 * arm-c′ §2.3c's sentence is *"the winner stands if it wins a majority"*. A majority is measured, not
 * asserted: the point bit-total is a single arithmetic estimate of a difference of two sums, and the
 * block bootstrap is a measurement of how that difference behaves when the lattice it was summed over
 * is resampled. **Where the two disagree, the measurement is published.** That is the orchestrator's
 * ruling on M3 §3.1, and it is the only reading of §2.3c under which the resampling was worth paying
 * for at all — a bootstrap that can never overturn the point estimate is a report, not a mechanism.
 *
 * The rule, in full:
 *
 *  - **The bootstrap separated from ½** — `separatedFromHalf` — and the fraction is *above* it: the
 *    cheapest total won its majority. Elected, `electedBy: "bootstrap-majority"`; nothing moved.
 *  - **It separated from ½ and the fraction is *below* it:** the resampled evidence names the *runner
 *    up*, with the interval clearing ½ on the cheapest total's losing side. The runner-up is elected,
 *    `electedBy: "bootstrap-majority"`, and `contradictsCheapestTotal` records that the published
 *    choice is not the point winner. This is the branch M3 §3.1 found on two covers, both at margins
 *    under a thousand bits against totals in the hundreds of thousands.
 *  - **It did not separate** — the compute cap was paid without a measured majority — or there was no
 *    bootstrap at all (an immaterial cover, a lone member): nothing was measured that could overturn
 *    anything, so the cheapest total stands, `electedBy: "cheapest-total"`.
 *
 * **The tie-break path is untouched by construction, not by exception.** Where §2.3d decided the
 * order the two totals are exactly equal, every resample of an identically-zero difference ties, and
 * `blockBootstrap` returns `separatedFromHalf: false` — so this function falls through to the
 * cheapest total, which on that cover *is* the tie-break's answer. No branch here names the
 * tie-break, and none needs to.
 *
 * No constant is introduced: the comparison is against `INDIFFERENT_WIN_FRACTION`, the same one half
 * the stopping rule and the report already use.
 */
export function electFromBootstrap(
	cheapestTotal: string,
	runnerUp: string | null,
	bootstrap: BootstrapReport | null,
): Election {
	const stands: Election = {
		elected: cheapestTotal,
		electedBy: "cheapest-total",
		contradictsCheapestTotal: false,
	}
	if (bootstrap === null || runnerUp === null || !bootstrap.separatedFromHalf) return stands
	if (bootstrap.winFraction > INDIFFERENT_WIN_FRACTION) {
		return { elected: cheapestTotal, electedBy: "bootstrap-majority", contradictsCheapestTotal: false }
	}
	// Separation is two-sided and an interval that excludes ½ cannot sit at ½, so this is the below
	// branch: the majority belongs to the runner-up and the runner-up is what gets published.
	return { elected: runnerUp, electedBy: "bootstrap-majority", contradictsCheapestTotal: true }
}
