/**
 * The truncation guard: fits and thresholds carry a declaration of what sample supported them.
 *
 * The round-3 lesson, in one sentence: **a threshold fitted to a sample that was selected using the
 * threshold's own variable is a property of the selection, not of the variable.** It looks like a
 * finding. It has a confidence interval. It reproduces perfectly. And it is measuring the window
 * the items were drawn through.
 *
 * The failure is invisible at the call site, because a fitting routine sees only x and y — it has
 * no way to know that x was also the filter. So the knowledge has to be supplied, and this module
 * makes supplying it unavoidable: {@link SampleSupport} has no defaults and
 * `selectionRelationToVariable` is a three-way union with no "probably fine" member. `"unknown"` is
 * spellable, and says so loudly in the output, which is the honest state for a sample whose
 * provenance nobody has checked.
 *
 * Nothing here refuses. A fit on a truncated sample is still the best available description of the
 * items that were seen; what it is not is a statement about the domain the report will quote it
 * over. So the guard annotates, and routes the annotation through {@link Provenance.caveats}, where
 * `honestLine` prints it whether or not the report's author remembered it.
 */

import { provenance, type Provenance } from "./types.ts"

/**
 * How the sample came to exist, relative to the variable being fitted.
 *
 * `MASK_REVIEW_NOTES.md` (round 3, then round 3b) is the source of this four-way split, and the
 * split matters because two of these look identical in the data and only one is fatal:
 *
 * - `independent-of-the-variable` — items were chosen for reasons unrelated to it: a random draw, a
 *   stratification on something else. The fit describes the variable.
 * - `selected-on-the-outcome` — **the fatal one.** The variable, or the cut being fitted, decided
 *   which items were included. Round 3's section B was selected as `score < cut`, so it could not
 *   contain a single keep-side row; its J of 1.000 measured *where the sample was cut*. Pooling
 *   round 1's 31 unconditioned rows restored the missing side and the gain fell to exactly zero.
 * - `left-truncated-at-a-run-floor` — survivable, and common: everything below some operating floor
 *   was never scored at all (`SCORE_THRESHOLD = 0.3`). This is not selection on the outcome, and
 *   round 3b showed it can be *proved* harmless — injecting 10, 50 and 200 phantom below-floor
 *   negatives left the J gain at exactly 0.350. Survivable **only with that proof**, which is why
 *   this member requires one.
 * - `unknown` — nobody has checked. A defect to be fixed, not a pass, and reported as
 *   indistinguishable from the fatal case until someone looks.
 */
export type SelectionRelation =
	| { readonly kind: "independent-of-the-variable" }
	| { readonly kind: "selected-on-the-outcome" }
	| {
			readonly kind: "left-truncated-at-a-run-floor"
			/** The floor below which items were never observed. */
			readonly floor: number
			/**
			 * The check showing the floor cannot move the result — round 3b's phantom-row injection,
			 * or an argument of the same force. Required: the round-3 failure is what happens when a
			 * truncation is assumed harmless rather than shown to be.
			 */
			readonly sensitivityCheck: string
	  }
	| { readonly kind: "unknown" }

/** What supported a fit. Every field is required; there are no defaults to fall through. */
export type SampleSupport = {
	/** The variable the conclusion is about, named as the report will name it. */
	readonly variableUnderTest: string
	/**
	 * The range the conclusion will be stated over — what a reader will assume the number covers.
	 * Usually the full operating range of the variable, not the range that happened to be sampled.
	 */
	readonly claimDomain: { readonly min: number; readonly max: number }
	/** The variable's values actually present in the sample, one per item. */
	readonly observedValues: readonly number[]
	/** Plain-language statement of how items got into the sample. */
	readonly selectionRule: string
	/** Required. See {@link SelectionRelation}. */
	readonly selectionRelationToVariable: SelectionRelation
}

export type SupportVerdict =
	| "supports-the-claim"
	| "range-restricted"
	| "selected-on-the-outcome"
	| "left-truncated-with-sensitivity-check"
	| "selection-unchecked"

export type SupportAssessment = {
	readonly verdict: SupportVerdict
	/**
	 * Whether the fit may be quoted over `claimDomain` as-is. False does not mean the number is
	 * wrong; it means the claim attached to it is wider than the evidence.
	 */
	readonly supportsClaimDomain: boolean
	readonly observedMin: number | null
	readonly observedMax: number | null
	/** Fraction of `claimDomain` the observed values actually span, in [0, 1]. */
	readonly domainCoverage: number
	readonly n: number
	readonly annotations: readonly string[]
	readonly summary: string
}

/**
 * Assesses a sample's support for a claim over a domain.
 *
 * The range test is deliberately free of tunables: the sample is range-restricted when its observed
 * values do not reach both ends of the claim domain, full stop. `domainCoverage` is reported so a
 * reader can judge how badly, rather than a threshold constant judging for them.
 */
export function assessSupport(support: SampleSupport): SupportAssessment {
	const n = support.observedValues.length
	const { min: claimMin, max: claimMax } = support.claimDomain
	if (!(claimMax > claimMin)) {
		throw new RangeError(
			`assessSupport expects claimDomain.max > claimDomain.min, got ${claimMin}..${claimMax}`,
		)
	}

	const observedMin = n === 0 ? null : Math.min(...support.observedValues)
	const observedMax = n === 0 ? null : Math.max(...support.observedValues)
	const domainCoverage =
		observedMin === null || observedMax === null
			? 0
			: Math.max(0, Math.min(claimMax, observedMax) - Math.max(claimMin, observedMin)) /
				(claimMax - claimMin)

	const annotations: string[] = []
	const rangeRestricted =
		observedMin === null || observedMax === null || observedMin > claimMin || observedMax < claimMax

	const relation = support.selectionRelationToVariable
	if (relation.kind === "selected-on-the-outcome") {
		annotations.push(
			`SELECTED ON THE OUTCOME: items entered this sample by a rule that depends on ${support.variableUnderTest} itself ("${support.selectionRule}"). One side of the boundary cannot be present, so anything fitted here measures where the sample was cut, not where the boundary is. Pool with an unconditioned sample before quoting it — that is what took round 3's J of 1.000 down to a gain of exactly zero.`,
		)
	} else if (relation.kind === "left-truncated-at-a-run-floor") {
		annotations.push(
			`left-truncated at a run floor of ${formatNumber(relation.floor)}: items below it were never observed. This is not selection on the outcome, and the check offered that it cannot move the result is: ${relation.sensitivityCheck}`,
		)
	} else if (relation.kind === "unknown") {
		annotations.push(
			`SELECTION UNCHECKED: nobody has established whether "${support.selectionRule}" depends on ${support.variableUnderTest}. Until someone does, this fit cannot be distinguished from one selected on its own outcome.`,
		)
	}

	if (rangeRestricted && n > 0) {
		annotations.push(
			`range-restricted: ${support.variableUnderTest} was observed over ${formatNumber(observedMin!)}..${formatNumber(observedMax!)}, covering ${(domainCoverage * 100).toFixed(1)}% of the claimed ${formatNumber(claimMin)}..${formatNumber(claimMax)}`,
		)
	}
	if (n === 0) annotations.push("the sample is empty; there is no support for any claim")

	const verdict: SupportVerdict =
		relation.kind === "selected-on-the-outcome"
			? "selected-on-the-outcome"
			: relation.kind === "unknown"
				? "selection-unchecked"
				: relation.kind === "left-truncated-at-a-run-floor"
					? "left-truncated-with-sensitivity-check"
					: rangeRestricted
						? "range-restricted"
						: "supports-the-claim"

	return {
		verdict,
		// A run floor with a sensitivity check behind it still supports the claim — that is round 3b's
		// finding, and refusing it would throw away results that were properly defended.
		supportsClaimDomain:
			verdict === "supports-the-claim" || verdict === "left-truncated-with-sensitivity-check",
		observedMin,
		observedMax,
		domainCoverage,
		n,
		annotations,
		summary:
			verdict === "supports-the-claim"
				? `sample supports claims about ${support.variableUnderTest} over ${formatNumber(claimMin)}..${formatNumber(claimMax)} (n=${n})`
				: `${verdict}: ${annotations[0] ?? ""}`,
	}
}

export type GuardedFit<T> = {
	readonly ok: true
	/** Whatever the fitting routine returned, untouched. */
	readonly fit: T
	readonly support: SupportAssessment
	/**
	 * Where the fitted value sits relative to the data. True when it falls outside the observed
	 * range, which makes it an extrapolation regardless of how the sample was selected.
	 */
	readonly extrapolatedBeyondSample: boolean
	readonly summary: string
	readonly provenance: Provenance
}

/**
 * Runs a fit and attaches its sample support, so the two cannot be separated downstream.
 *
 * The point is the wrapper, not the arithmetic. A fitting routine called directly returns a number
 * that travels anywhere; the same routine called through here returns an object whose provenance
 * already carries the truncation annotation, and every printing path in this module reads it.
 *
 * @param support what supported the fit. Declared by the caller, who is the only one who knows.
 * @param compute the fitting routine. Called once.
 * @param fittedValueFor pulls the fitted threshold out of the result, so the guard can tell whether
 *   it landed inside the sampled range. Return null when the fit produced no single point.
 */
export function fitWithDeclaredSupport<T>(
	support: SampleSupport,
	compute: () => T,
	fittedValueFor: (fit: T) => number | null,
): GuardedFit<T> {
	const assessment = assessSupport(support)
	const fit = compute()
	const fittedValue = fittedValueFor(fit)

	const extrapolatedBeyondSample =
		fittedValue !== null &&
		assessment.observedMin !== null &&
		assessment.observedMax !== null &&
		(fittedValue < assessment.observedMin || fittedValue > assessment.observedMax)

	const caveats = [...assessment.annotations]
	if (extrapolatedBeyondSample) {
		caveats.push(
			`the fitted value ${formatNumber(fittedValue!)} lies outside the sampled range ${formatNumber(assessment.observedMin!)}..${formatNumber(assessment.observedMax!)}; it is an extrapolation from the model's shape, not something the data observed`,
		)
	}

	return {
		ok: true,
		fit,
		support: assessment,
		extrapolatedBeyondSample,
		summary:
			fittedValue === null
				? `fit over ${support.variableUnderTest}: ${assessment.summary}`
				: `fitted ${support.variableUnderTest} = ${formatNumber(fittedValue)} — ${assessment.summary}`,
		provenance: provenance(
			`fit over ${support.variableUnderTest} with declared sample support`,
			assessment.n,
			{
				variableUnderTest: support.variableUnderTest,
				claimDomainMin: support.claimDomain.min,
				claimDomainMax: support.claimDomain.max,
				observedMin: assessment.observedMin ?? "none",
				observedMax: assessment.observedMax ?? "none",
				domainCoverage: Number(assessment.domainCoverage.toFixed(4)),
				selectionRule: support.selectionRule,
				selectionRelationToVariable: support.selectionRelationToVariable.kind,
				verdict: assessment.verdict,
			},
			[],
			caveats,
		),
	}
}

/** Six places, matching the rounding the calibration analyses publish thresholds at. */
function formatNumber(value: number): string {
	return Number.isInteger(value) ? value.toString() : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
}
