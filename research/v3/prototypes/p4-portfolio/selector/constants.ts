/**
 * Every number the selector runs on, with its provenance — and the registries the F2 tripwire
 * reads.
 *
 * **F2 (SPEC §3) is the falsifier this file exists to make checkable:** *"if a viable
 * implementation requires any per-member weight, reliability constant, prior, or threshold
 * (anything a member brings that the currency consumes), the historic failure has repeated."* So
 * the rule here is not "document your constants", it is **there is nothing to document**: the
 * admissible numbers are arm-c′ §4's eight anchored decisions, mathematical structure, and compute
 * bounds. Nothing else may appear anywhere under `selector/`, and
 * `tests/f2-tripwire.test.ts` AST-walks the directory to prove it.
 *
 * Three registries, three different kinds of number:
 *
 *  - {@link ANCHORED_DECISIONS} — an arm-c′ §4 free parameter. A human decision, with the anchor
 *    artifact that settled it. Only **one** of the eight is reachable from this milestone's code
 *    (decision 1, the lattice resolution); the rest belong to the field members arm-c′ fits, which
 *    P4 does not have — its members are whole pipelines and their palettes arrive already made.
 *  - {@link COMPUTE_BOUNDS} — a ceiling on work. Raising one costs time and can only sharpen a
 *    measurement; it can never move a decision's direction, which is what makes it not a threshold.
 *  - **Structural constants** — carried inline with a `[STRUCTURAL]` doc comment, because a 2 in
 *    `Var(x − y) = 2σ²` is an identity of the arithmetic and naming it in a registry would suggest
 *    it could have been something else.
 *
 * Provenance tags are `CONVENTIONS.md`'s.
 *
 * **What the tripwire actually enforces** (`tests/f2-tripwire.test.ts`, and it is armed against a
 * synthetic offender in the same file so it cannot pass vacuously):
 *
 *  - *In this file:* every module-level constant whose initialiser contains a numeric literal must be
 *    named in `ANCHORED_DECISIONS`, named in `COMPUTE_BOUNDS`, or carry `[STRUCTURAL]` in its doc
 *    comment. There is no fourth category.
 *  - *In every other file under `selector/`:* the only numeric literals admitted are `0`, `1` and
 *    `-1` — identity, unit step, and a comparator's sentinel — plus `2` where it is an index into a
 *    three-coordinate OKLab buffer. None of those can carry a magnitude. A `0.7`, a `3`, a `12`
 *    anywhere in the pricing code fails the suite, which is what makes "the currency has no
 *    coefficients" a checked property rather than a claim in a comment.
 */

import { MAX_GRADIENT_STOPS, MIN_GRADIENT_STOPS } from "../../../src/contract/index.ts"
import { probit } from "../../../src/stats/numeric.ts"

// ---------------------------------------------------------------------------------------------
// The registries the tripwire reads
// ---------------------------------------------------------------------------------------------

/** One of arm-c′ §4's eight free parameters, as this implementation resolves it. */
export type AnchoredDecision = Readonly<{
	/** Exported name of the constant, exactly as the tripwire will see it. */
	constant: string
	/** Which of arm-c′ §4's eight decisions this is. */
	decision: string
	/** `CONVENTIONS.md` provenance tag. */
	tag: string
	/** The artifact that settled it — a file a reader can open, or an analytic derivation. */
	anchor: string
}>

/** A ceiling on work, not a threshold. */
export type ComputeBound = Readonly<{
	constant: string
	/** Why raising it can only cost time — never change which way a decision goes. */
	rationale: string
}>

/**
 * An arm-c′ §4 decision this milestone **could not anchor and did not settle**.
 *
 * The register exists because the alternative is worse. A free parameter whose anchor is unavailable
 * either gets quietly set to whatever makes the run finish — which is the relapse F2 names, wearing
 * an implementation's clothes — or gets declared, left unsettled, and escalated. This is the second.
 */
export type HeldDecision = Readonly<{
	/** The exported name, or the function, that would implement it. */
	implementedBy: string
	decision: string
	tag: string
	/** The anchor arm-c′ names for it, and why this prototype cannot run it. */
	anchorNotAvailable: string
	/** What was done instead, and what the consequence was measured to be. */
	consequence: string
}>

export const ANCHORED_DECISIONS: readonly AnchoredDecision[] = [
	{
		constant: "LATTICE_RESOLUTION_C",
		decision: "arm-c′ §4 decision 1 — the lattice resolution C",
		tag: "[MEASURED]",
		anchor:
			"data/m2/c-sweep.json — the member ranking on demo-20 recomputed at every C in " +
			"LATTICE_RESOLUTION_SWEEP; C is the smallest rung whose per-cover ranking equals the " +
			"finest rung's and stays equal for every rung above it. arm-c′ §4.1's own anchor " +
			"(\"the smallest C at which member ranking stops changing\"), run on the corpus this " +
			"prototype has.",
	},
	{
		constant: "LATTICE_RESOLUTION_SWEEP",
		decision: "arm-c′ §4 decision 1 — the ladder the sweep is run over",
		tag: "[MEASURED]",
		anchor:
			"data/m2/c-sweep.json. The rungs are the P4 M2 brief's own ladder {24, 32, 48, 64}; " +
			"they are the sweep's x-axis, not a value chosen for its effect. A stability sweep " +
			"that never changes its answer across a doubling of C is the evidence; the ladder is " +
			"the experiment.",
	},
]

export const HELD_DECISIONS: readonly HeldDecision[] = [
	{
		implementedBy: "measureNoiseScale() in selector/substrate.ts",
		decision: "arm-c′ §4 decision 3 — the noise-scale estimator's *form*",
		tag: "[HELD]",
		anchorNotAvailable:
			"arm-c′ §4.3 anchors the form on the dither arm: \"the right one is that for which a " +
			"±1-LSB dither moves σ by the amount the dither actually injects\". P4 has no dither arm " +
			"and cannot build one — it is another instrument's, and authoring a substitute here would " +
			"be choosing the estimator by choosing its test.",
		consequence:
			"The form arm-c′ names — median absolute horizontally-adjacent difference in OKLab, times " +
			"the analytic consistency factor — was implemented verbatim and NOT adjusted. Measured " +
			"consequence on demo-20: it returns exactly zero on 4 of 20 covers (over half of their " +
			"adjacent pixel pairs are byte-identical), and at σ = 0 the currency has no scale, so those " +
			"covers are refused as unpriceable rather than priced against an invented noise floor. See " +
			"data/m2/bit-table.json `unpriceable` and BITTABLE.md §5. This is a finding to escalate, " +
			"not a defect to patch locally: a floor is a free scale in the loss, which arm-c′ §2.3a " +
			"forbids and SPEC §3's F2 is written to catch.",
	},
]

export const COMPUTE_BOUNDS: readonly ComputeBound[] = [
	{
		constant: "BOOTSTRAP_RESAMPLE_CAP",
		rationale:
			"A compute ceiling on the block bootstrap. The resample COUNT is not free (arm-c′ §4.7): " +
			"resampling stops as soon as the Wilson interval on the win fraction clears one half. " +
			"The cap only decides when to stop paying for a fraction that has not separated — it is " +
			"reported as `capped` and the win fraction is published either way, so raising it buys " +
			"a narrower interval and can never flip a winner.",
	},
]

// ---------------------------------------------------------------------------------------------
// arm-c′ §4 decision 1 — the lattice
// ---------------------------------------------------------------------------------------------

/**
 * The rungs the stability sweep is run over.
 *
 * `[MEASURED]` — see `ANCHORED_DECISIONS`. This is the sweep's x-axis: `tools/m2-run.ts sweep`
 * prices every member on demo-20 at each rung and records where the ranking stops moving.
 */
export const LATTICE_RESOLUTION_SWEEP: readonly number[] = [24, 32, 48, 64]

/**
 * The lattice resolution C — the frame is partitioned into a C×C grid of cells in normalised
 * coordinates (arm-c′ §2.1).
 *
 * `[MEASURED]` — `data/m2/c-sweep.json`. Not hand-picked: the sweep above recomputes the whole
 * member ranking at every rung, and C is the smallest rung whose per-cover ranking matches the finest
 * rung's and every rung in between.
 *
 * **Recorded outcome.** The per-cover ranking is *identical at all four rungs* — 20/20 covers at
 * C = 24, 32, 48 and 64, six distinct rankings and four distinct winners among them, so the agreement
 * is not the trivial kind that one dominant member would produce. `stableFrom` is therefore the
 * ladder's own floor and C takes it.
 *
 * **What the sweep does not establish**, stated because the anchor is only as wide as its ladder:
 * that 24 is the *smallest* stable C in absolute terms. The ladder starts there, so "stable from the
 * bottom rung" and "stable below the bottom rung" are indistinguishable in this artifact. What is
 * established is the property the anchor is for — the ranking does not move across a 2.7× range of C
 * — and, given that, the cheapest rung is taken. See `BITTABLE.md` §2.
 */
export const LATTICE_RESOLUTION_C = 24

// ---------------------------------------------------------------------------------------------
// Compute bounds
// ---------------------------------------------------------------------------------------------

/**
 * The most block-bootstrap resamples the selector will pay for on one cover.
 *
 * A compute bound, not a threshold — see `COMPUTE_BOUNDS`. When the Wilson interval on the win
 * fraction has not cleared one half by here, the bit table records `capped: true` and publishes the
 * fraction and its interval unchanged.
 */
export const BOOTSTRAP_RESAMPLE_CAP = 4096

// ---------------------------------------------------------------------------------------------
// Structural constants — identities of the arithmetic, not choices
// ---------------------------------------------------------------------------------------------

/** [STRUCTURAL] A pair is two. Used where "the top two" or "both ends" is the structure of the
 * question, not a shortlist length anyone chose. */
export const PAIR_SIZE = 2

/** [STRUCTURAL] OKLab has three coordinates. The dimension of the space, not a setting. */
export const OKLAB_DIMENSIONS = 3

/** [STRUCTURAL] An 8-bit channel takes 256 values; the exact colour census (arm-c′ §2.1) indexes a
 * triple as a three-digit base-256 number. A radix, not a resolution. */
export const CENSUS_BASE = 256

/** [STRUCTURAL] Alpha 255 is fully opaque: the maximum an 8-bit channel can hold. The decoder's
 * transparency refusal is an equality against the channel maximum, not a tolerance. */
export const OPAQUE_ALPHA = 255

/** [STRUCTURAL] The quartile the median absolute deviation is defined at. Changing it would make
 * the estimator a different estimator, not a tuned one. */
export const MAD_QUARTILE = 0.75

/** [STRUCTURAL] Var(x − y) = 2σ² for two independent draws of the same scale. The factor the
 * adjacent-difference estimator has to undo, and it is arithmetic. */
export const INDEPENDENT_DIFFERENCE_VARIANCE_FACTOR = 2

/**
 * The MAD-of-adjacent-differences consistency factor (arm-c′ §2.1: *"times the estimator's analytic
 * consistency factor"*).
 *
 * `[INHERITED]` `[STRUCTURAL]` — analytic, from the estimator's own algebra, and computed here
 * rather than written
 * down as a digit so that the derivation is the code:
 *
 * For a horizontally adjacent pair whose field value is locally constant, the difference of the two
 * noise draws has variance `INDEPENDENT_DIFFERENCE_VARIANCE_FACTOR · σ²` per OKLab coordinate. For a
 * zero-mean normal of scale s, `median |x| = s · Φ⁻¹(3/4)`. Hence
 *
 *     σ = median |Δ| / (√2 · Φ⁻¹(3/4))
 *
 * and this constant is that reciprocal. `Φ⁻¹` is `probit()` from `src/stats/numeric.ts`, so the
 * classical 1.4826 never appears as a literal anywhere: it is `1 / probit(0.75)` and stays a
 * derivation. arm-c′ §4 decision 3 (the estimator's *form*) is settled by the proposal itself —
 * this file only implements the form it names.
 */
export const MAD_CONSISTENCY_FACTOR =
	1 / (Math.sqrt(INDEPENDENT_DIFFERENCE_VARIANCE_FACTOR) * probit(MAD_QUARTILE))

/** [STRUCTURAL] The median is the one-half quantile. The definition of the statistic. */
export const MEDIAN_QUANTILE = 1 / 2

/** [STRUCTURAL] The centre of a cell is half a cell in from its edge. Geometry. */
export const CELL_CENTRE_FRACTION = 1 / 2

/** [STRUCTURAL] A full turn, in radians. The gradient axis direction is searched over the whole
 * circle, not a half-circle: the contract's stops are ordered (background at t = 0), so θ and
 * θ + π describe different fields. */
export const FULL_TURN_RADIANS = 2 * Math.PI

/** [STRUCTURAL] The diagonal of the unit square, in units of its side. The frame's largest extent,
 * used to convert an angular error into a positional one. */
export const UNIT_SQUARE_DIAGONAL = Math.SQRT2

/** [STRUCTURAL] The 2 in the expansion (x − f)² = x² − 2·x·f + f². The cross term of a square. */
export const SQUARE_CROSS_TERM_FACTOR = 2

/** [STRUCTURAL] The 2 in the Gaussian exponent −r²/(2σ²). Arithmetic of the normal density. */
export const GAUSSIAN_EXPONENT_DENOMINATOR = 2

/** [STRUCTURAL] The ½ in the ½·log₂(N) charge for one real-valued parameter (arm-c′ §2.3a) — the
 * standard MDL parameter charge, half a log of the sample size per parameter. */
export const MDL_PARAMETER_CHARGE_DENOMINATOR = 2

/** [STRUCTURAL] A boolean takes two values, so publishing one costs log₂(2) = 1 bit. The
 * cardinality of the type, read off the contract's schema. */
export const BOOLEAN_CARDINALITY = 2

/** [STRUCTURAL] A ternary section keeps two of its three parts each step; the refinement's
 * iteration count is derived from this and machine epsilon, never chosen. */
export const TERNARY_SECTIONS = 3

/** [STRUCTURAL] Both interior probe points of a ternary section. */
export const TERNARY_PROBES = 2

/** [STRUCTURAL] The correlation length is the lag at which the autocorrelation has fallen to 1/e.
 * The definition of the quantity, which is why it is written as Math.E and not as a digit. */
export const CORRELATION_DECAY_TARGET = 1 / Math.E

/** [STRUCTURAL] One half — the value a bootstrap win fraction has to be separated from for the
 * winner to stand (arm-c′ §2.3c). Not a confidence threshold: it is the point of indifference
 * itself, "the winner won half the resamples". The confidence level lives in
 * `src/stats/binomial.ts`'s own default and is not restated here. */
export const INDIFFERENT_WIN_FRACTION = 1 / 2

// ---------------------------------------------------------------------------------------------
// Derived from the contract's own schema
// ---------------------------------------------------------------------------------------------

/**
 * Every stop count the contract admits, as a list — so the schema price can read its cardinality
 * instead of computing `MAX − MIN + 1` and needing a literal to do it.
 */
export const GRADIENT_STOP_COUNT_OPTIONS: readonly number[] = ((): number[] => {
	const options: number[] = []
	for (let count = MIN_GRADIENT_STOPS; count <= MAX_GRADIENT_STOPS; count += 1) options.push(count)
	return options
})()
