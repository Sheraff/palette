/**
 * McNemar's exact test: the paired counterpart to Fisher.
 *
 * The adversarial review's fourth finding was a missing paired test, and it is the one with the
 * largest measured consequence: two embedding arms scored on **the same 24,648 pairs** were compared
 * as though they were two independent samples, and the published ranking collapsed to p=0.816 once
 * the pairing was respected (`reviews/phase-0-adversarial/embeddings-corpus.md`:100-113).
 *
 * The reason the unpaired test misleads is worth stating, because it is not obvious: when both arms
 * see the same items, most of the disagreement between their scores is item difficulty, which is
 * shared and therefore cancels. The evidence about which arm is better lives **only in the pairs
 * where they disagreed**. McNemar throws away the concordant pairs on purpose, and the honest n is
 * the discordant count — 24,648 is not the n, and reporting it as such is what made the original
 * result look decisive.
 *
 * So {@link mcnemarExact} reports `discordantPairs` as its n, and puts the total pair count in the
 * provenance inputs where it cannot be mistaken for the sample size.
 */

import { exactBinomialTest, formatP } from "./binomial.ts"
import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * A paired 2x2: how each of two arms did on the same items.
 *
 * Named corners, like {@link Table2x2 fisher.ts's table}, and for the same reason — a transposed
 * paired table swaps which arm is winning and produces a perfectly plausible p-value.
 */
export type PairedCounts = {
	/** Both arms right. Carries no information about which is better. */
	readonly bothSucceeded: number
	/** First arm right, second wrong. */
	readonly onlyFirstSucceeded: number
	/** Second arm right, first wrong. */
	readonly onlySecondSucceeded: number
	/** Both arms wrong. Carries no information about which is better. */
	readonly neitherSucceeded: number
}

export type McNemarAlternative =
	| { readonly alternative: "two-sided" }
	| { readonly alternative: "greater" | "less"; readonly directionFixedInAdvance: string }

export type McNemarSpec = McNemarAlternative & {
	readonly counts: PairedCounts
	/** What one pair is: "artwork", "query", "item". Printed in the summary. */
	readonly pairLabel?: string
}

export type McNemarValue = {
	readonly ok: true
	readonly counts: PairedCounts
	/** The only pairs the test rests on. This is the n. */
	readonly discordantPairs: number
	/** Every pair, concordant included. Reported, never used as the n. */
	readonly totalPairs: number
	readonly pValue: number
	readonly alternative: "two-sided" | "greater" | "less"
	readonly summary: string
	readonly provenance: Provenance
}

export type McNemarResult = McNemarValue | Refused<"no-discordant-pairs" | "no-pairs">

/**
 * McNemar's test in its exact form — a sign test on the discordant pairs.
 *
 * The chi-squared form with a continuity correction (hand-rolled in
 * `oracle/embeddings/bakeoff_census_aware.py`) is an approximation to this, and is not offered:
 * the exact test costs nothing at the discordant counts these rounds produce, and the approximation
 * is worst exactly where the discordant count is small, which is where the answer matters most.
 */
export function mcnemarExact(spec: McNemarSpec): McNemarResult {
	const { bothSucceeded, onlyFirstSucceeded, onlySecondSucceeded, neitherSucceeded } = spec.counts
	for (const [name, value] of Object.entries(spec.counts)) {
		if (!Number.isInteger(value) || value < 0) {
			throw new RangeError(`mcnemarExact expects non-negative integer counts, got ${name}=${value}`)
		}
	}
	const pairLabel = spec.pairLabel ?? "pair"
	const discordantPairs = onlyFirstSucceeded + onlySecondSucceeded
	const totalPairs = discordantPairs + bothSucceeded + neitherSucceeded

	const method = `McNemar exact (sign test on discordant pairs), ${spec.alternative}`
	const inputs: Record<string, number | string | boolean> = {
		bothSucceeded,
		onlyFirstSucceeded,
		onlySecondSucceeded,
		neitherSucceeded,
		totalPairs,
		discordantPairs,
		alternative: spec.alternative,
	}
	if (spec.alternative !== "two-sided") inputs.directionFixedInAdvance = spec.directionFixedInAdvance

	if (totalPairs === 0) {
		return refuse("no-pairs", "McNemar not computed: there are no pairs.", provenance(method, 0, inputs))
	}
	if (discordantPairs === 0) {
		return refuse(
			"no-discordant-pairs",
			`McNemar not computed: all ${totalPairs} ${pairLabel}s were concordant, so no ${pairLabel} carries any information about which arm is better. This is not a p-value of 1 from a well-powered test; it is an absence of evidence either way.`,
			provenance(method, 0, inputs),
		)
	}

	// The exact test is a binomial on the discordant pairs against p=0.5: under the null, a
	// discordant pair is equally likely to fall either way.
	const binomial = exactBinomialTest(
		spec.alternative === "two-sided"
			? {
					successes: onlyFirstSucceeded,
					trials: discordantPairs,
					nullProbability: 0.5,
					alternative: "two-sided",
					trialsAreDistinctUnits: true,
				}
			: {
					successes: onlyFirstSucceeded,
					trials: discordantPairs,
					nullProbability: 0.5,
					alternative: spec.alternative,
					directionFixedInAdvance: spec.directionFixedInAdvance,
					trialsAreDistinctUnits: true,
				},
	)
	/* istanbul ignore next — unreachable: discordantPairs > 0 is checked above. */
	if (!binomial.ok) {
		return refuse("no-discordant-pairs", binomial.detail, provenance(method, 0, inputs))
	}

	const caveats: string[] = [
		`the n is ${discordantPairs} discordant ${pairLabel}s, not the ${totalPairs} ${pairLabel}s compared; the ${bothSucceeded + neitherSucceeded} concordant ${pairLabel}s carry no information about which arm is better and are excluded by the test`,
	]
	if (spec.alternative !== "two-sided") {
		caveats.push(
			`one-sided p-value; direction fixed in advance per: ${spec.directionFixedInAdvance}. If that reference does not predate the data, this number is not a one-sided test.`,
		)
	}

	return {
		ok: true,
		counts: spec.counts,
		discordantPairs,
		totalPairs,
		pValue: binomial.pValue,
		alternative: spec.alternative,
		summary: `paired: first arm won ${onlyFirstSucceeded}, second won ${onlySecondSucceeded}, of ${discordantPairs} discordant ${pairLabel}s (${totalPairs} compared): p=${formatP(binomial.pValue)}`,
		provenance: provenance(method, discordantPairs, inputs, [], caveats),
	}
}
