/**
 * # Feasibility — the contract, behind one function
 *
 * `DESIGN.md`, "The mechanism": *"The contract is the feasible set, never a term. Invariants shrink
 * the search space; the objective never rewards contrast, distinctness, or legality."* That sentence
 * only means something if there is exactly one place in P1 that answers "is this palette legal?",
 * and this is it. Both energies, the search, and the falsifier call `feasibility()`; none of them
 * calls `validatePalette` or `scorePalette` directly, and none of them reimplements a threshold.
 *
 * There is no P1-local legality rule here — not one. Everything below delegates to
 * `src/contract/`, which is read-only shared instrument code.
 *
 * ## Which invariants need image-side facts, and what happens without them
 *
 * Three of the five are pure functions of the palette object and always run:
 *
 * | invariant | what it needs | without it |
 * | --- | --- | --- |
 * | **I1** schema (roles present, stops 2–4 ordered and spanning [0,1], escape well-formed) | nothing | always runs |
 * | **I3** distinctness / sanctioned collapse | nothing | always runs |
 * | **I4** contrast floors (incl. the whole rendered ramp) | nothing | always runs |
 * | **I2** source support — *every published colour is an exact pixel of the input* | `facts.source`: a `PixelSource` over the decoded image | reported `deferred: ["I2.source-support"]`, **never passed** |
 * | **I2** spatial spread | thresholds that do not exist yet | permanently `deferred: ["I2.spatial-spread"]` — see `SpatialSpreadValidator` |
 * | **I5** transparency refusal | `facts.transparency`: the decoder's report | reported `deferred: ["I5.transparency-report"]`, **never passed** |
 *
 * `ImageFacts` is the hook. It is deliberately a bag of *facts already measured elsewhere* rather
 * than a path: this layer must not decode. `DESIGN.md`'s module layout gives decoding to
 * `src/measure/`, and the whole point of feasibility being cheap is that a search calls it once per
 * lattice node while the image is decoded exactly once per artwork.
 *
 * **A deferral is not a pass.** `ValidationResult.deferred` is returned unchanged and
 * `allChecksRan` says in one boolean whether anything was skipped, so no caller can read silence as
 * legality — the defect `reviews/phase-0-adversarial/contract.md` finding 5 found in invariant 5.
 */

import { scorePalette, type Scorecard, type ScorecardOptions } from "../../../../src/contract/scorecard.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type {
	Palette,
	PixelSource,
	TransparencyReport,
	ValidationResult,
	Violation,
} from "../../../../src/contract/types.ts"

/**
 * Everything the invariants need that the palette itself cannot supply.
 *
 * Both fields optional, and both absences are *reported* rather than assumed away. A search that
 * runs without `source` is searching a superset of the feasible set and its results say so.
 */
export type ImageFacts = Readonly<{
	/** Random or sequential access to the decoded source image. Enables invariant 2's existence clause. */
	source?: PixelSource
	/** The decoder's transparency report. Enables invariant 5. */
	transparency?: TransparencyReport
}>

export type FeasibilityOptions = Readonly<{
	/**
	 * Produce the full scorecard as well as the verdict.
	 *
	 * `DESIGN.md`'s module layout: *"feasibility via `src/contract` (scorecard mode in dev)"*. Off by
	 * default because `scorePalette` collects an observation per numeric judgment, which is exactly
	 * what you want when a human is looking at twenty covers and exactly what you do not want inside
	 * a lattice sweep.
	 */
	scorecard?: boolean
	/**
	 * Whether a transparent input throws instead of being reported.
	 *
	 * **Defaults to `false` here, against the contract's own default of `true`, and the reason is
	 * where the question is asked.** Transparency is a property of the *file*, decided once at decode
	 * (`src/measure/` refuses transparent input loudly, per `PHASE_0_DECISIONS.md` §4 invariant 5).
	 * By the time a search is asking whether its ten-thousandth lattice point is feasible, throwing
	 * would abort a sweep over a question that was already settled about the image. Set `true` at the
	 * one call site that is adjudicating a file rather than a configuration.
	 */
	throwOnTransparentInput?: boolean
	/**
	 * Per-quantity near-miss bands, forwarded to the scorecard. Ignored unless `scorecard` is set.
	 * No default — `ScorecardOptions` is explicit that there is no measured value to default to.
	 */
	nearMissBand?: ScorecardOptions["nearMissBand"]
}>

/**
 * What P1 gets back when it asks whether a palette is in the feasible set.
 *
 * `valid` is the contract's own boolean, carried and never recomputed.
 */
export type FeasibilityReport = Readonly<{
	valid: boolean
	violations: readonly Violation[]
	/** Verbatim `ValidationResult.deferred` — the checks that did not run, by stable code. */
	deferred: readonly string[]
	/**
	 * True only when nothing was deferred. `valid && allChecksRan` is the strong statement; `valid`
	 * alone is "legal as far as the supplied facts could tell", which today is never the whole story
	 * because `I2.spatial-spread` has no thresholds and so always defers.
	 */
	allChecksRan: boolean
	/** Which image-side facts this verdict actually had, so a stored verdict stays scopable. */
	factsSupplied: Readonly<{ source: boolean; transparency: boolean }>
	/** Present only when `options.scorecard` was set. */
	scorecard: Scorecard | null
	/** The contract's raw result, for callers that want it unmediated. */
	result: ValidationResult
}>

/**
 * Ask the contract.
 *
 * One function, two modes, no third opinion.
 */
export function feasibility(
	palette: Palette,
	facts: ImageFacts = {},
	options: FeasibilityOptions = {},
): FeasibilityReport {
	const validateOptions = {
		...(facts.source === undefined ? {} : { source: facts.source }),
		...(facts.transparency === undefined ? {} : { transparency: facts.transparency }),
		throwOnTransparentInput: options.throwOnTransparentInput ?? false,
	}

	let result: ValidationResult
	let scorecard: Scorecard | null = null
	if (options.scorecard === true) {
		const scored = scorePalette(palette, {
			...validateOptions,
			...(options.nearMissBand === undefined ? {} : { nearMissBand: options.nearMissBand }),
		})
		scorecard = scored.scorecard
		result = scored.result
	} else {
		result = validatePalette(palette, validateOptions)
	}

	return {
		valid: result.valid,
		violations: result.violations,
		deferred: result.deferred,
		allChecksRan: result.deferred.length === 0,
		factsSupplied: {
			source: facts.source !== undefined,
			transparency: facts.transparency !== undefined,
		},
		scorecard,
		result,
	}
}

/**
 * The predicate form, for the search's inner loop.
 *
 * Exactly `feasibility(...).valid` — same function, same thresholds, no shortcut. It exists so a
 * branch-and-bound's feasibility test reads as a predicate and so nobody is tempted to write a
 * "fast path" that is a second, weaker copy of the contract.
 */
export function isFeasible(
	palette: Palette,
	facts: ImageFacts = {},
	options: FeasibilityOptions = {},
): boolean {
	return feasibility(palette, facts, options).valid
}

// The contract's own entry points, re-exported so a P1 module never has to reach past this file to
// reach them — and so a grep for `validatePalette` inside `prototypes/p1-mdl/` finds exactly one
// import site, which is this one.
export { scorePalette, validatePalette }
export type { Scorecard, ScorecardOptions }
