/**
 * Bucketed agreement — P6's three buckets.
 *
 * `PHASE_0_DECISIONS.md` §4 (P6) fixed the shape and §4's closing rule made it binding: *"P6's
 * three-bucket structure is the shape all oracle cross-checks take — contradiction, agreement,
 * can't-tell — precisely because several palettes can be valid for one artwork."* Every agreement
 * question in this project therefore has three answers, not two, and the third is an answer rather
 * than missing data.
 *
 * **There is deliberately no function here that returns one pooled rate.** "Agreement was 80%" is
 * not a fact until you know whether the denominator counted the can't-tells: 8 agreement /
 * 2 disagreement / 10 can't-tell is 40% over all items and 80% over decided items, and both are
 * true. `analyze-bcde-validation.ts` states the same rule in the scoping note it prints before any
 * figure — *"NEVER ONE ACCURACY NUMBER (PHASE_0_DECISIONS.md §4 P6)"*. So {@link bucketedAgreement}
 * returns **both, always, each with its own denominator and interval**, and the result type has no
 * field called `rate`.
 *
 * The bucket names are `analyze-bcde-validation.ts`'s `PairBucket` verbatim — `agreement`,
 * `disagreement`, `cant_tell`. Deliberately not a fourth spelling: §4 P6's prose says
 * "contradiction", the code says "disagreement", and a shared module inventing a third would make
 * the vocabulary drift worse rather than better. The committed code wins.
 *
 * `cohensKappa` in `kappa.ts` consumes the *decided* rows only — a kappa has two categories per cell
 * and no third bucket, so a can't-tell row cannot be represented in one. {@link bucketPairs}
 * produces the buckets and that filtered vector in one pass, so the kappa's n and the agreement's
 * decided denominator cannot drift apart.
 */

import { formatRate, wilsonInterval, type WilsonIntervalResult } from "./binomial.ts"
import { provenance, type Provenance } from "./types.ts"

/** P6's three buckets, spelled as `analyze-bcde-validation.ts` spells them. */
export type AgreementBucket = "agreement" | "disagreement" | "cant_tell"

/** All three, in the order the published summary lines print them. */
export const AGREEMENT_BUCKETS = ["agreement", "disagreement", "cant_tell"] as const

/**
 * Escape share above which a stratum is reported as having no reliable decided rate.
 *
 * [REVIEWED] `REVIEW_UI.md` lines 134-142, recorded as
 * `d-2026-08-04-purity-rounds-need-escape-answer`: *"its share is a first-class result, reported per
 * stratum, because ambiguity is a property of the artwork. A stratum whose escape share exceeds half
 * has no reliable rate and is reported as having none."* The counterpart risk — an escape used as a
 * general refuge — is why the share is reported rather than subtracted.
 */
export const ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE = 0.5

export type AgreementCounts = {
	readonly agreement: number
	readonly disagreement: number
	readonly cantTell: number
	/** Every item, including the can't-tells. */
	readonly total: number
	/** Agreement + disagreement. The denominator for "items where both sides committed". */
	readonly decided: number
}

/** A rate that knows what it was divided by. */
export type RateWithDenominator = {
	readonly count: number
	readonly denominator: number
	/** Null when the denominator is zero — a rate over nothing is not 0, it is absent. */
	readonly rate: number | null
	/** Wilson interval on this rate, or the refusal explaining why there isn't one. */
	readonly interval: WilsonIntervalResult
	/** Plain-language name of what the denominator is, printed alongside the number. */
	readonly denominatorLabel: string
}

export type BucketedAgreementResult = {
	readonly ok: true
	readonly counts: AgreementCounts
	/** Agreement over every item. Can't-tells count against it. */
	readonly agreementOfAll: RateWithDenominator
	/** Agreement over the items where both sides committed. Can't-tells excluded. */
	readonly agreementOfDecided: RateWithDenominator
	/** The escape share — a first-class result, never subtracted out. */
	readonly escapeShare: RateWithDenominator
	/**
	 * False when the escape share exceeds half. The decided rate is still computed and reported,
	 * because hiding it would be its own dishonesty, but it is marked as resting on a minority of
	 * the stratum and the summary line says so instead of quoting it.
	 */
	readonly decidedRateReliable: boolean
	/** The house one-liner: "2 agreement · 0 disagreement · 0 can't-tell  (n=2)". */
	readonly countsLine: string
	readonly summary: string
	readonly provenance: Provenance
}

/**
 * Counts the three buckets and reports agreement under both denominators.
 *
 * @param buckets one entry per compared item
 * @param confidence confidence level for the Wilson intervals, as a level (0.95), not an alpha
 */
export function bucketedAgreement(
	buckets: readonly AgreementBucket[],
	confidence = 0.95,
): BucketedAgreementResult {
	let agreement = 0
	let disagreement = 0
	let cantTell = 0
	for (const bucket of buckets) {
		if (bucket === "agreement") agreement += 1
		else if (bucket === "disagreement") disagreement += 1
		else cantTell += 1
	}
	const total = buckets.length
	const decided = agreement + disagreement
	const counts: AgreementCounts = { agreement, disagreement, cantTell, total, decided }

	const agreementOfAll = rateWithDenominator(
		agreement,
		total,
		"all compared items, can't-tells included",
		confidence,
	)
	const agreementOfDecided = rateWithDenominator(
		agreement,
		decided,
		"items where both sides committed, can't-tells excluded",
		confidence,
	)
	const escapeShare = rateWithDenominator(cantTell, total, "all compared items", confidence)

	const decidedRateReliable =
		total === 0 ? false : cantTell / total <= ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE && decided > 0

	const caveats: string[] = []
	if (cantTell > 0) {
		caveats.push(
			`${cantTell} of ${total} comparisons were can't-tell; the two agreement rates differ because of them and neither one alone is "the" agreement rate`,
		)
	}
	if (decided === 0 && total > 0) {
		caveats.push("no item was decided by both sides; there is no agreement rate over decided items")
	}
	if (total > 0 && cantTell / total > ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE) {
		caveats.push(
			`NO RELIABLE RATE: the escape share is ${formatRate(cantTell / total)}, above half. Per REVIEW_UI.md (d-2026-08-04-purity-rounds-need-escape-answer) this stratum is reported as having no reliable rate; the decided-rate figure below rests on the minority of items that were decided.`,
		)
	}

	const countsLine = `${agreement} agreement · ${disagreement} disagreement · ${cantTell} can't-tell  (n=${total})`

	return {
		ok: true,
		counts,
		agreementOfAll,
		agreementOfDecided,
		escapeShare,
		decidedRateReliable,
		countsLine,
		summary: decidedRateReliable
			? `${countsLine} — ${describeRate(agreementOfAll)} of all, ${describeRate(agreementOfDecided)} of decided`
			: `${countsLine} — ${describeRate(agreementOfAll)} of all; no reliable rate over decided items (escape share ${describeRate(escapeShare)})`,
		provenance: provenance(
			"bucketed agreement (P6: agreement / disagreement / cant_tell), both denominators reported",
			total,
			{ agreement, disagreement, cantTell, total, decided, confidence },
			[],
			caveats,
		),
	}
}

function rateWithDenominator(
	count: number,
	denominator: number,
	denominatorLabel: string,
	confidence: number,
): RateWithDenominator {
	return {
		count,
		denominator,
		rate: denominator === 0 ? null : count / denominator,
		interval: wilsonInterval(count, denominator, confidence),
		denominatorLabel,
	}
}

/** "2/2 = 100.0%", or "—" when there is no denominator to divide by. */
export function describeRate(rate: RateWithDenominator): string {
	if (rate.rate === null) return `${rate.count}/0 = —`
	return `${rate.count}/${rate.denominator} = ${formatRate(rate.rate)}`
}

/** A rate line with its interval and the name of its denominator, for reports with room. */
export function describeRateFully(rate: RateWithDenominator): string {
	if (rate.rate === null) return `no rate: denominator is zero (${rate.denominatorLabel})`
	const interval = rate.interval.ok
		? ` (${formatRate(rate.interval.low)}-${formatRate(rate.interval.high)})`
		: ""
	return `${describeRate(rate)}${interval} over ${rate.denominatorLabel}`
}

/**
 * Turns raw answers into buckets and, in the same pass, the decided pairs kappa needs.
 *
 * Doing both here is the point. When an analyzer buckets in one place and filters for kappa in
 * another, the two drift: a refusal token spelled two ways lets a row count as decided for the
 * agreement rate and be dropped from the kappa vector, leaving a published kappa whose n matches no
 * denominator printed beside it.
 *
 * @param rows one entry per item: what each side said, verbatim
 * @param isRefusal decides whether an answer is a refusal (`analyze-bcde-validation.ts`'s
 *   `REFUSAL_VALUES` is the house list). One predicate, used for both outputs, so they cannot
 *   disagree.
 */
export function bucketPairs(
	rows: readonly (readonly [string, string])[],
	isRefusal: (answer: string) => boolean,
): { buckets: AgreementBucket[]; decidedPairs: (readonly [string, string])[] } {
	const buckets: AgreementBucket[] = []
	const decidedPairs: (readonly [string, string])[] = []
	for (const [left, right] of rows) {
		if (isRefusal(left) || isRefusal(right)) {
			buckets.push("cant_tell")
			continue
		}
		buckets.push(left === right ? "agreement" : "disagreement")
		decidedPairs.push([left, right])
	}
	return { buckets, decidedPairs }
}
