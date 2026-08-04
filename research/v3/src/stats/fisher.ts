/**
 * Fisher's exact test on a 2x2 table.
 *
 * The test for "does this split differ between these two groups" at the n these rounds run.
 * Chi-squared is not offered: its approximation fails exactly where the review rounds live — small
 * counts, often a zero cell — and it fails toward significance, which is the direction that does
 * damage. Where a continuity-corrected chi-squared was hand-rolled (the McNemar in
 * `oracle/embeddings/bakeoff_census_aware.py`), the exact test is the one to prefer and the
 * approximation only exists there as a large-n shortcut.
 */

import { logChoose } from "./numeric.ts"
import { clampUnit, stableSum } from "./numeric.ts"
import { formatP } from "./binomial.ts"
import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * Relative slack for "no more likely than the observed table".
 *
 * [INHERITED] The same 1e-7 as `binomial.ts`, and for the same reason: R's `fisher.test` uses it,
 * and without it exactly-equally-likely tables drop out of the two-sided sum on a last-bit
 * difference.
 */
const EXTREMENESS_RELATIVE_SLACK = 1e-7

/**
 * A 2x2 table, named rather than positional.
 *
 * Positional 2x2 arguments are transposed constantly, and a transposed Fisher table is not an error
 * — it silently answers a different question with a plausible p-value. Named corners cost one line
 * at the call site and make the mistake visible in review.
 */
export type Table2x2 = {
	/** Group 1, outcome present. */
	readonly a: number
	/** Group 1, outcome absent. */
	readonly b: number
	/** Group 2, outcome present. */
	readonly c: number
	/** Group 2, outcome absent. */
	readonly d: number
}

export type FisherAlternative =
	| { readonly alternative: "two-sided" }
	| { readonly alternative: "greater" | "less"; readonly directionFixedInAdvance: string }

/**
 * Whether the two groups are independent samples or the same items measured twice.
 *
 * Required, with no default, because the review found a published ranking that survived only by
 * being tested unpaired: two arms scored on the same 24,648 pairs, compared as independent samples,
 * collapsing to p=0.816 under McNemar (`reviews/phase-0-adversarial/embeddings-corpus.md`:100-113).
 * Fisher on paired data is not a conservative approximation — it is a different question, and it
 * answers it with far more confidence than the data carries.
 *
 * `"paired"` is spellable, and {@link fisherExact2x2} refuses it and names the test that fits. That
 * is the point: the mistake becomes a compile-time decision and then a runtime refusal, instead of
 * a number nobody questions.
 */
export type FisherPairing = "independent-groups" | "paired"

export type FisherSpec = FisherAlternative & {
	readonly table: Table2x2
	readonly pairing: FisherPairing
}

export type FisherValue = {
	readonly ok: true
	readonly table: Table2x2
	readonly alternative: "two-sided" | "greater" | "less"
	readonly pValue: number
	/** Sample odds ratio, or null when a zero cell makes it 0, infinite, or 0/0. */
	readonly oddsRatio: number | null
	readonly summary: string
	readonly provenance: Provenance
}

export type FisherResult = FisherValue | Refused<"empty-table" | "degenerate-margin" | "paired-data">

/** Fisher's exact test. Two-sided is the method of small p-values, as in R's `fisher.test`. */
export function fisherExact2x2(spec: FisherSpec): FisherResult {
	const { a, b, c, d } = spec.table
	for (const [name, value] of Object.entries(spec.table)) {
		if (!Number.isInteger(value) || value < 0) {
			throw new RangeError(`fisherExact2x2 expects non-negative integer cells, got ${name}=${value}`)
		}
	}
	const rowOne = a + b
	const rowTwo = c + d
	const columnOne = a + c
	const columnTwo = b + d
	const total = rowOne + rowTwo

	const method = `Fisher exact 2x2, ${spec.alternative}${
		spec.alternative === "two-sided" ? " by the method of small p-values" : ""
	}`
	const inputs: Record<string, number | string | boolean> = {
		a,
		b,
		c,
		d,
		total,
		alternative: spec.alternative,
	}
	if (spec.alternative !== "two-sided") inputs.directionFixedInAdvance = spec.directionFixedInAdvance

	if (spec.pairing === "paired") {
		return refuse(
			"paired-data",
			"Fisher exact refused: the table was declared paired. When both columns describe the same items, the concordant cells carry no information about which side is better and Fisher treats them as if they did — which is how a ranking on 24,648 shared pairs survived until McNemar put it at p=0.816. Use mcnemarExact from ./mcnemar.ts, which takes the four paired cells directly.",
			provenance(method, total, inputs),
		)
	}

	if (total === 0) {
		return refuse(
			"empty-table",
			"Fisher exact not computed: the table is empty.",
			provenance(method, 0, inputs),
		)
	}
	if (rowOne === 0 || rowTwo === 0 || columnOne === 0 || columnTwo === 0) {
		return refuse(
			"degenerate-margin",
			`Fisher exact not computed: a margin is zero (rows ${rowOne}/${rowTwo}, columns ${columnOne}/${columnTwo}). With no variation on one axis, every table with these margins is the observed one and p is 1 by construction, which is not evidence of anything.`,
			provenance(method, total, inputs),
		)
	}

	const lowest = Math.max(0, columnOne - rowTwo)
	const highest = Math.min(rowOne, columnOne)
	const logDenominator = logChoose(total, columnOne)
	const massAt = (x: number) =>
		Math.exp(logChoose(rowOne, x) + logChoose(rowTwo, columnOne - x) - logDenominator)

	let pValue: number
	if (spec.alternative === "greater") {
		const terms: number[] = []
		for (let x = a; x <= highest; x++) terms.push(massAt(x))
		pValue = stableSum(terms)
	} else if (spec.alternative === "less") {
		const terms: number[] = []
		for (let x = lowest; x <= a; x++) terms.push(massAt(x))
		pValue = stableSum(terms)
	} else {
		const observed = massAt(a)
		const threshold = observed * (1 + EXTREMENESS_RELATIVE_SLACK)
		const terms: number[] = []
		for (let x = lowest; x <= highest; x++) {
			const mass = massAt(x)
			if (mass <= threshold) terms.push(mass)
		}
		pValue = stableSum(terms)
	}
	pValue = clampUnit(pValue)

	const caveats: string[] = []
	if (spec.alternative !== "two-sided") {
		caveats.push(
			`one-sided p-value; direction fixed in advance per: ${spec.directionFixedInAdvance}. If that reference does not predate the data, this number is not a one-sided test.`,
		)
	}
	const zeroCell = a === 0 || b === 0 || c === 0 || d === 0
	if (zeroCell) {
		caveats.push("a cell is zero, so the sample odds ratio is unbounded and is reported as absent")
	}
	if (total < SMALL_TABLE_NOTE_BELOW) {
		caveats.push(
			`only ${total} observations across the table; the exact test is valid here but has very little power`,
		)
	}

	const oddsRatio = zeroCell ? null : (a * d) / (b * c)

	return {
		ok: true,
		table: spec.table,
		alternative: spec.alternative,
		pValue,
		oddsRatio,
		summary: `2x2 [${a} ${b} / ${c} ${d}]: p=${formatP(pValue)}${
			oddsRatio === null ? "" : `, odds ratio ${oddsRatio.toFixed(3)}`
		}`,
		provenance: provenance(method, total, inputs, [], caveats),
	}
}

/**
 * Table size below which the test is annotated as underpowered.
 *
 * [REVIEWED] Twice the n=10 kappa floor, on the reasoning that a 2x2 splits its observations across
 * four cells, so it needs roughly twice the rows before any cell carries information. Annotates
 * only — it never suppresses a p-value, because a wide, honest null is a result.
 */
const SMALL_TABLE_NOTE_BELOW = 20
