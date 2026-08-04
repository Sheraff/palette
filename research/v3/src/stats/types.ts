/**
 * The shared shape every statistic in this module returns.
 *
 * The adversarial review found the same handful of mistakes in analyzer after analyzer: a rate
 * printed without its denominator, a kappa computed on three items, a threshold fitted to a sample
 * the threshold's own variable had truncated, a sweep whose best cell was reported as if it were
 * the only cell tested. None of those are hard sums. They are all the same failure — **a number
 * that arrived without the facts needed to read it** — so the fix is not "compute more carefully",
 * it is "make a bare number impossible to obtain".
 *
 * Two rules do the work, and they are the reason this file exists before any of the maths:
 *
 *   1. **No function here returns a `number`.** Every one returns a result object carrying its own
 *      {@link Provenance}. A report can therefore print an honest line mechanically
 *      ({@link honestLine}) instead of relying on whoever wrote the template to remember the n.
 *   2. **A statistic that should not be computed is a *type*, not a value.** Cohen's kappa below
 *      the house floor returns {@link Refused}, which has no `kappa` field at all. There is no
 *      sentinel, no `NaN`, no `-1`. Code that wants the number has to handle the refusal to reach
 *      it, and TypeScript will not let it skip that step.
 *
 * @see README.md in this directory for the module surface and the migration record.
 */

/**
 * The facts a reader needs in order to know what a number is worth.
 *
 * Filled in by the function that computed the statistic, never by the caller, so it cannot drift
 * away from what was actually done. Deliberately free of timestamps: `CONVENTIONS.md` wants a
 * quoted *corpus count* to carry the moment it was measured, but these results are golden-compared
 * in tests, and a clock in the output would make every fixed fixture non-reproducible.
 */
export type Provenance = {
	/**
	 * Plain-language name of the exact procedure, precise enough that someone could re-implement
	 * it and get the same answer. "exact binomial" is not enough; "exact binomial, two-sided by
	 * the method of small p-values" is.
	 */
	readonly method: string
	/**
	 * The n this statistic was actually computed on — after every exclusion, not the size of the
	 * corpus it was drawn from. Where the two differ the difference belongs in {@link caveats}.
	 */
	readonly n: number
	/** Named inputs, echoed back so a report can print them without re-reading the call site. */
	readonly inputs: Readonly<Record<string, number | string | boolean>>
	/**
	 * Multiplicity corrections actually applied, as printable phrases
	 * (`"Holm, family of 364"`). Empty means none were applied — which is a claim, and a true one
	 * only when the statistic really was the single pre-registered test.
	 */
	readonly corrections: readonly string[]
	/**
	 * Everything that weakens the number: truncated support, a degenerate margin, a denominator
	 * small enough that the interval is the whole unit line. A caveat is never a reason to
	 * suppress the number, only a reason to print it alongside.
	 */
	readonly caveats: readonly string[]
}

/** Builds a {@link Provenance} with the optional halves defaulted, so call sites stay short. */
export function provenance(
	method: string,
	n: number,
	inputs: Readonly<Record<string, number | string | boolean>>,
	corrections: readonly string[] = [],
	caveats: readonly string[] = [],
): Provenance {
	return { method, n, inputs, corrections, caveats }
}

/**
 * A statistic that was asked for and deliberately not produced.
 *
 * The point of the type is the absence: there is no numeric field to reach for, so a caller cannot
 * accidentally treat a refusal as a result. `reason` is a string literal type, which lets a caller
 * handle "below the floor" differently from "the maths is undefined here" without string matching.
 */
export type Refused<Reason extends string = string> = {
	readonly ok: false
	readonly reason: Reason
	/** Plain-language statement of what was asked and why it was declined. */
	readonly detail: string
	/** One line fit to print directly into an analysis output. */
	readonly summary: string
	readonly provenance: Provenance
}

/** Constructs a {@link Refused}. */
export function refuse<Reason extends string>(
	reason: Reason,
	detail: string,
	prov: Provenance,
): Refused<Reason> {
	return { ok: false, reason, detail, summary: detail, provenance: prov }
}

/** Anything this module returns: it either carries a result or explains its absence. */
export type StatResult = { readonly ok: boolean; readonly summary: string; readonly provenance: Provenance }

/**
 * Renders any result as one honest line: what was computed, on what n, with what corrections and
 * caveats.
 *
 * This is the mechanical path the review asked for. An analyzer that prints its findings through
 * `honestLine` cannot produce the headline number while quietly dropping the family size or the
 * truncation note, because the same object carries all of them and this function reads them all.
 */
export function honestLine(result: StatResult): string {
	const parts = [result.summary, `n=${result.provenance.n}`, result.provenance.method]
	for (const correction of result.provenance.corrections) parts.push(correction)
	for (const caveat of result.provenance.caveats) parts.push(`CAVEAT: ${caveat}`)
	return parts.join(" | ")
}

/**
 * Renders a result as several lines, one fact per line, for reports with room to breathe.
 * Same content as {@link honestLine} — the two cannot disagree because both read the same object.
 */
export function honestBlock(result: StatResult): string {
	const lines = [result.summary, `  n: ${result.provenance.n}`, `  method: ${result.provenance.method}`]
	for (const [key, value] of Object.entries(result.provenance.inputs)) lines.push(`  ${key}: ${value}`)
	if (result.provenance.corrections.length === 0) {
		lines.push("  corrections: none applied")
	} else {
		for (const correction of result.provenance.corrections) lines.push(`  correction: ${correction}`)
	}
	for (const caveat of result.provenance.caveats) lines.push(`  caveat: ${caveat}`)
	return lines.join("\n")
}
