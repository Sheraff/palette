/**
 * Cohen's kappa, with the house floor.
 *
 * Kappa is a chance-corrected agreement rate: it asks how much of the observed agreement is more
 * than two raters with these habits would have hit by accident. The correction is estimated from
 * the raters' own marginals, which is exactly why it needs rows — on a handful of items the
 * marginals are noise and the "correction" is noise-shaped, so kappa swings between 1 and negative
 * numbers on data a human would call identical.
 *
 * **This module refuses below n=10 and returns a type with no kappa field.** That is the whole
 * point. The historical failure was not that someone computed kappa on three items; it was that
 * the function handed back a `number | null` and a caller reached for the number. Here the refusal
 * is a different type, so a caller must handle it to get past it — while `rawAgreement`, which *is*
 * meaningful at n=3, stays available on both branches.
 */

import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * Fewest comparable rows that will produce a kappa.
 *
 * [REVIEWED] The house floor, inherited verbatim from `MIN_KAPPA_N` in
 * `src/review-server/analyze-bcde-validation.ts`, where it already governs every published kappa in
 * `data/oracle-validation/bcde-validation-1-analysis.json` — all of which are `null` because every
 * join in that round landed at n=1 or n=2. Changing this number silently rewrites what that
 * artifact would say, so it moves only by a reviewer ruling.
 */
export const MIN_KAPPA_N = 10

/**
 * Refusal wording, exported because it is published text.
 *
 * `bcde-validation-1-analysis.json` embeds these strings in its `reason` fields and again inside
 * `summaryLines`. They are part of a committed artifact, so they are pinned here rather than
 * spelled out at each call site, and the migration reproduces the artifact byte-identically
 * because both sides read these constants.
 */
export const KAPPA_NO_ROWS_REASON = "no comparable rows"
export const KAPPA_DEGENERATE_REASON = "both raters used one value only; kappa is 0/0 on that table"
export function kappaBelowFloorReason(n: number, minimum: number = MIN_KAPPA_N): string {
	return `n=${n} is below the ${minimum}-row floor for a kappa`
}

/**
 * How close to 1 the expected agreement may get before the table is called degenerate.
 *
 * [INHERITED] The `1e-12` guard from `analyze-bcde-validation.ts`. When both raters used a single
 * value, expected agreement is 1 and kappa is 0/0; floating point lands a hair off, so the test is
 * on the distance rather than on equality.
 */
const DEGENERATE_EXPECTED_TOLERANCE = 1e-12

/** One rated item: what rater A said, and what rater B said. */
export type RatedPair = readonly [string, string]

export type KappaValue = {
	readonly ok: true
	readonly kappa: number
	/** Plain proportion of items the two raters put in the same category. Always meaningful. */
	readonly rawAgreement: number
	/** Agreement the marginals predict by chance alone. */
	readonly expectedAgreement: number
	readonly n: number
	/** Every category either rater used, sorted, for the report. */
	readonly categories: readonly string[]
	readonly summary: string
	readonly provenance: Provenance
}

/**
 * A kappa that was not computed.
 *
 * Note what is here and what is not: `rawAgreement` survives (it is a fact about the items, and at
 * n=3 it is the *only* honest agreement number), and `kappa` does not exist at all.
 */
export type KappaRefused = Refused<"no-comparable-rows" | "below-floor" | "undefined-on-this-table"> & {
	readonly rawAgreement: number | null
	readonly n: number
	readonly categories: readonly string[]
}

export type KappaResult = KappaValue | KappaRefused

/**
 * Cohen's kappa for two raters over any number of unordered categories.
 *
 * Rows must already be filtered to the comparable ones. In the house pattern that means
 * "can't tell" answers are dropped before they arrive here — see `agreement.ts`, which does the
 * bucketing and hands over only the decided rows, and records the drop in the provenance so the
 * two denominators never get confused for each other.
 *
 * @param pairs one entry per comparable item
 * @param minimum override for the floor. Present only so a test can exercise the boundary; an
 *   analyzer that lowers it is doing the thing this module exists to prevent.
 */
export function cohensKappa(pairs: readonly RatedPair[], minimum: number = MIN_KAPPA_N): KappaResult {
	const n = pairs.length
	const categories = [...new Set(pairs.flatMap(([a, b]) => [a, b]))].sort()
	const method = `Cohen's kappa, two raters, ${categories.length} categories, floor n>=${minimum}`
	const inputs: Record<string, number | string | boolean> = {
		n,
		categories: categories.join("/"),
		floor: minimum,
	}

	if (n === 0) {
		return {
			...refuse("no-comparable-rows", KAPPA_NO_ROWS_REASON, provenance(method, 0, inputs)),
			rawAgreement: null,
			n,
			categories,
		}
	}

	const agreed = pairs.filter(([a, b]) => a === b).length
	const rawAgreement = agreed / n

	if (n < minimum) {
		const detail = kappaBelowFloorReason(n, minimum)
		return {
			...refuse(
				"below-floor",
				detail,
				provenance(method, n, inputs, [], [
					`raw agreement ${formatFourPlaces(rawAgreement)} on ${n} rows is reportable; the chance correction is not`,
				]),
			),
			rawAgreement,
			n,
			categories,
		}
	}

	const leftShare = new Map(categories.map((value) => [value, pairs.filter(([a]) => a === value).length / n]))
	const rightShare = new Map(categories.map((value) => [value, pairs.filter(([, b]) => b === value).length / n]))
	const expectedAgreement = categories.reduce(
		(sum, value) => sum + leftShare.get(value)! * rightShare.get(value)!,
		0,
	)

	if (Math.abs(1 - expectedAgreement) < DEGENERATE_EXPECTED_TOLERANCE) {
		return {
			...refuse("undefined-on-this-table", KAPPA_DEGENERATE_REASON, provenance(method, n, inputs)),
			rawAgreement,
			n,
			categories,
		}
	}

	const kappa = (rawAgreement - expectedAgreement) / (1 - expectedAgreement)

	return {
		ok: true,
		kappa,
		rawAgreement,
		expectedAgreement,
		n,
		categories,
		summary: `kappa ${formatFourPlaces(kappa)} with raw agreement ${formatFourPlaces(rawAgreement)} on ${n} rows`,
		provenance: provenance(method, n, inputs, [], [
			"kappa is never quoted without its raw agreement: the same kappa means different things at different marginals",
		]),
	}
}

/**
 * Rounds to the four decimal places the published artifacts use.
 *
 * Rounding lives at the reporting boundary, never inside the arithmetic — `cohensKappa` returns
 * full precision and the migration adapters round on the way out. The historical bug this avoids is
 * documented in `oracle/premise/analyze_b_unmapped_class.py`: rounding a rate to 4 places before
 * feeding it to a tail probability moved that p-value in the third significant figure.
 */
export function formatFourPlaces(value: number): string {
	return value.toFixed(4)
}

/** The published artifacts store numbers, not strings, at 4 places. */
export function roundFourPlaces(value: number): number {
	return Number(value.toFixed(4))
}
