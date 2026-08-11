/**
 * # Sizing the search: how coarse v0 has to be, and saying so
 *
 * The M2 brief's honesty clause is the whole point of this file: *"aim ≤60 s on demo-20 images;
 * report actuals honestly — if the budget forces coarser search, say so in the certificate field,
 * never silently."* So the coarseness is not a constant somebody picked; it is **chosen per image**
 * by a stated cost model against a stated allowance, and the choice, the runners-up on the ladder,
 * and whether the allowance bound it are all published in `SearchScale`.
 *
 * ## What is traded against what
 *
 * Two axes cost budget: how finely the colour lattice is cut (how many distinct colours a
 * configuration may be built from) and how much of the configuration grammar is enumerated (flat
 * fields only, or two-stop ramps, or interior stops as well). They are **not** treated symmetrically:
 *
 * > **Lattice fineness first, grammar richness second.**
 *
 * The reason is pre-registered rather than empirical. `DESIGN.md` says of the fourth stop that it is
 * *"admissible, expect never selected"*, and arm A′'s own proposal says the same of interior stops
 * in general — they are reachable, and they will lose to λ almost always. Colour resolution has no
 * such prior attached: if the artwork's real foreground is not in the alphabet, no amount of grammar
 * will find it. So the selector takes the **finest lattice rung that can afford two-stop ramps**, and
 * only then spends whatever is left raising the grammar at that rung.
 *
 * The consequence is stated rather than hidden: on a heavy artwork this search may never construct a
 * three-stop ramp, and `SearchScale.grammarLevel` will read `"ramp-2"` when that is what happened.
 * A palette with no interior stop from such a run is evidence about λ only in the weak sense — the
 * configuration was not on the ballot.
 */

import type { Measurement } from "../measure/types.ts"
import {
	COARSE_BUDGET_FRACTION,
	COARSE_CELL_BAR_MULTIPLES,
	FEASIBILITY_CALLS_PER_CONFIGURATION,
	INTERIOR_STOP_POSITIONS,
	SEARCH_BUDGET_MS,
	coarseCellSide,
} from "./constants.ts"
import { predictedFeasibilityMs, predictedMs } from "./evaluator.ts"
import { occupiedCellCount } from "./lattice.ts"
import { GRAMMAR_LEVELS, type GrammarLevel, type SearchScale } from "./types.ts"

/** Unordered pairs drawn from `n` items **with** the diagonal — `n(n+1)/2`. The collapsed case is a pair. */
function pairsWithDiagonal(n: number): number {
	return (n * (n + 1)) / 2
}

/** Unordered pairs of *distinct* items — `n(n−1)/2`. */
function distinctPairs(n: number): number {
	return (n * (n - 1)) / 2
}

/**
 * How many configurations the coarse product contains, by stop count, at one rung and grammar level.
 *
 * This *is* the enumeration, counted rather than run — `enumerateCoarse()` must produce exactly these
 * numbers, and `tests/search/mechanism.test.ts` checks that it does. If the two ever disagree the
 * budget is being spent against a fiction.
 */
export function coarseConfigurationCounts(
	representatives: number,
	grammar: GrammarLevel,
): Readonly<Record<number, number>> {
	const inkPairs = pairsWithDiagonal(representatives)
	const collapsedFields = representatives
	const distinctFields = distinctPairs(representatives)
	const positions = INTERIOR_STOP_POSITIONS.length

	const counts: Record<number, number> = {
		0: (collapsedFields + distinctFields) * inkPairs,
	}
	const level = GRAMMAR_LEVELS.indexOf(grammar)
	if (level >= GRAMMAR_LEVELS.indexOf("ramp-2")) {
		counts[2] = distinctFields * inkPairs
	}
	if (level >= GRAMMAR_LEVELS.indexOf("ramp-3")) {
		counts[3] = distinctFields * inkPairs * representatives * positions
	}
	if (level >= GRAMMAR_LEVELS.indexOf("ramp-4")) {
		// Two interior stops: an unordered pair of colours would be wrong — the two knots sit at
		// different positions, so (c₁ at 0.25, c₂ at 0.5) and (c₂ at 0.25, c₁ at 0.5) are two different
		// ramps. Hence `representatives²` against the ordered position pairs.
		counts[4] = distinctFields * inkPairs * representatives * representatives *
			distinctPairs(positions)
	}
	return counts
}

/** Predicted milliseconds for the whole coarse product at one rung and grammar level. */
export function predictedCoarseMs(
	colorCount: number,
	representatives: number,
	grammar: GrammarLevel,
): number {
	const counts = coarseConfigurationCounts(representatives, grammar)
	let total = 0
	for (const [stopCountText, count] of Object.entries(counts)) {
		const stopCount = Number(stopCountText)
		// The retry allowance covers decision 3's "feasibility first": a configuration whose preferred
		// ink ordering is illegal costs a second feasibility call before the search learns that.
		const retry = predictedFeasibilityMs(stopCount) * (FEASIBILITY_CALLS_PER_CONFIGURATION - 1)
		total += count * (predictedMs(colorCount, stopCount) + retry)
	}
	return total
}

export type CoarsePlan = Readonly<{
	barMultiple: number
	side: number
	representatives: number
	grammar: GrammarLevel
	scale: SearchScale
	/**
	 * What is left of the whole-image allowance once the coarse stage's *prediction* is subtracted.
	 *
	 * Informational. `emit()` does not partition the budget — the evaluator holds one counter that the
	 * deepening loop, the escape branch and refinement all draw on in turn — so this is the plan's own
	 * estimate of how much of the allowance the coarse stage expects to leave behind, published so a
	 * reader can compare it against `effort.predictedMsSpent` and see whether the estimate held.
	 */
	refinementBudgetMs: number
}>

/**
 * Pick the lattice rung and grammar level for this image.
 *
 * Deterministic in the image: every input is `measurement.triples.colorCount` and the occupied-cell
 * counts, both exact integer functions of the decoded raster. No clock is read.
 */
export function planCoarseStage(
	measurement: Measurement,
	options?: {
		budgetMs?: number
		forcedBarMultiple?: number
		forcedGrammar?: GrammarLevel
	},
): CoarsePlan {
	const colorCount = measurement.triples.colorCount
	const budgetMs = options?.budgetMs ?? SEARCH_BUDGET_MS
	const coarseBudgetMs = budgetMs * COARSE_BUDGET_FRACTION

	// The reference grammar the ladder is costed at: the level the selector is required to be able to
	// afford, so that "the finest rung that fits" means the same thing on every image.
	const referenceGrammar: GrammarLevel = "ramp-2"
	const rungAt = (barMultiple: number): SearchScale["ladder"][number] => {
		const occupied = occupiedCellCount(measurement, coarseCellSide(barMultiple))
		return {
			barMultiple,
			occupiedCells: occupied,
			predictedMs: predictedCoarseMs(colorCount, occupied, referenceGrammar),
		}
	}

	let chosenBy: SearchScale["chosenBy"] = "budget"
	let rung: SearchScale["ladder"][number]
	const ladder: SearchScale["ladder"][number][] = []

	if (options?.forcedBarMultiple !== undefined) {
		chosenBy = "forced"
		rung = rungAt(options.forcedBarMultiple)
		ladder.push(rung)
	} else {
		// Binary search for the finest affordable rung. The occupied-cell count is non-increasing in
		// the cell side and the predicted cost is increasing in that count, so the predicate "this rung
		// fits" is monotone along the ladder — up to grid-alignment jitter of a cell or two, which can
		// only ever move the answer by one rung and is why the *chosen* rung is re-costed below rather
		// than trusted from the search.
		let low = 0
		let high = COARSE_CELL_BAR_MULTIPLES.length - 1
		while (low < high) {
			const middle = (low + high) >> 1
			if (rungAt(COARSE_CELL_BAR_MULTIPLES[middle]).predictedMs <= coarseBudgetMs) high = middle
			else low = middle + 1
		}
		rung = rungAt(COARSE_CELL_BAR_MULTIPLES[low])
		// Publish the neighbourhood of the choice rather than all 89 rungs: what a reader wants is the
		// alphabet that was bought and the finer one the allowance refused.
		if (low > 0) ladder.push(rungAt(COARSE_CELL_BAR_MULTIPLES[low - 1]))
		ladder.push(rung)
		if (low + 1 < COARSE_CELL_BAR_MULTIPLES.length) {
			ladder.push(rungAt(COARSE_CELL_BAR_MULTIPLES[low + 1]))
		}
	}
	let grammar: GrammarLevel = referenceGrammar
	if (options?.forcedGrammar !== undefined) {
		grammar = options.forcedGrammar
	} else {
		if (predictedCoarseMs(colorCount, rung.occupiedCells, "ramp-2") > coarseBudgetMs) {
			grammar = "flat-only"
		}
		for (const candidate of GRAMMAR_LEVELS) {
			if (predictedCoarseMs(colorCount, rung.occupiedCells, candidate) <= coarseBudgetMs) {
				grammar = candidate
			}
		}
	}

	const predicted = predictedCoarseMs(colorCount, rung.occupiedCells, grammar)
	const scale: SearchScale = {
		chosenBy,
		coarseCellBarMultiple: rung.barMultiple,
		coarseCellSide: coarseCellSide(rung.barMultiple),
		coarseRepresentatives: rung.occupiedCells,
		grammarLevel: grammar,
		predictedCoarseMs: predicted,
		coarseBudgetMs,
		budgetForcedCoarsening: chosenBy === "budget" && rung.barMultiple > COARSE_CELL_BAR_MULTIPLES[0],
		overBudget: predicted > coarseBudgetMs,
		ladder,
		// Filled in by `emit()` once the deepening loop has actually run. The plan only ever knows the
		// starting rung; what the search *finished* at is a fact about how the allowance was spent.
		deepening: [],
		startingBarMultiple: rung.barMultiple,
		startingRepresentatives: rung.occupiedCells,
	}

	return {
		barMultiple: rung.barMultiple,
		side: coarseCellSide(rung.barMultiple),
		representatives: rung.occupiedCells,
		grammar,
		scale,
		refinementBudgetMs: Math.max(0, budgetMs - predicted),
	}
}
