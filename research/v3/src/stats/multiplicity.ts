/**
 * Sweep-then-test: the helper for when more than one comparison was run.
 *
 * The failure this file exists to prevent has a shape. Someone sweeps a grid — every field crossed
 * with every value, every threshold, every phrasing arm — finds the cell with the smallest p, and
 * writes it up as though it were the test they set out to run. Nobody lies. The family size simply
 * never appears in the output, because no function ever asked for it.
 *
 * So this one asks for it, and will not proceed without it. {@link sweepThenTest} takes
 * `comparisonsRun` as a required field, refuses if it is smaller than the number of cells handed
 * over, and puts the family size in the summary line of every result it returns. The cell with the
 * smallest p is reachable only as {@link BestCell}, which carries its adjusted p-value and a
 * `survivesCorrection` flag in the same object — there is no exported way to ask this module for a
 * minimum p-value on its own.
 *
 * Reporting fewer cells than were run is allowed and normal (364 run, the 10 interesting ones
 * written up). It is allowed *because* `comparisonsRun` stays 364 and the correction uses 364.
 */

import { formatP } from "./binomial.ts"
import { clampUnit } from "./numeric.ts"
import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * Correction families this module knows.
 *
 * - `bonferroni` — multiply by the family size. Simplest, most conservative, always defensible.
 * - `holm` — uniformly more powerful than Bonferroni with the same guarantee. The default choice.
 * - `benjamini-hochberg` — controls the false discovery rate instead of the family-wise error rate.
 *   A different promise, not a weaker version of the same one: it says "about alpha of my
 *   discoveries are false", not "probably none of them are".
 * - `none` — no correction. Spellable only with a written justification, see {@link SweepDeclaration}.
 */
export type CorrectionMethod = "bonferroni" | "holm" | "benjamini-hochberg" | "none"

/** One cell of the sweep: something that was tested, and what p it produced. */
export type SweepCell = {
	/** Stable identifier — the field, the threshold, the arm. Printed in the output. */
	readonly id: string
	/** The uncorrected p-value from whatever test the cell ran. */
	readonly pValue: number
	/** Optional human-readable description of what this cell was. */
	readonly label?: string
}

/**
 * The declaration a sweep cannot run without.
 *
 * `comparisonsRun` is the whole point. It is the number of comparisons **performed**, which is not
 * the number written up, and not the number that looked interesting afterwards. If a grid of 26
 * fields by 14 values was evaluated, it is 364, even if 363 of them are never mentioned again.
 */
export type SweepDeclaration = {
	/** How many comparisons were actually performed. Required. */
	readonly comparisonsRun: number
	readonly correction: CorrectionMethod
	/** Significance level for the corrected verdict. A level like 0.05, not a confidence. */
	readonly alpha: number
	/** Plain-language definition of the family: what was swept, over what. */
	readonly familyDefinition: string
	/**
	 * Required when `correction` is `"none"`, and unusable otherwise.
	 *
	 * There is one honest reason to skip correction — the comparisons were pre-registered as
	 * separate questions, each with its own hypothesis, and none of them was selected for reporting
	 * by its result. Saying so out loud, in a field that lands in the published provenance, is the
	 * cost of that claim.
	 */
	readonly noCorrectionJustification?: string
}

/** A cell after correction. There is no way to hold one of these without its adjusted p-value. */
export type CorrectedCell = {
	readonly id: string
	readonly label: string | undefined
	readonly rawPValue: number
	readonly adjustedPValue: number
	readonly survivesCorrection: boolean
}

/**
 * The most extreme cell in the sweep.
 *
 * Deliberately not called `minimum` or `best p`: it is the best *of a family*, and the fields that
 * say so travel with it. `rankOutOf` is the family size, present so that a report which prints only
 * this object still cannot omit it.
 */
export type BestCell = CorrectedCell & {
	readonly rankOutOf: number
}

export type SweepValue = {
	readonly ok: true
	readonly cells: readonly CorrectedCell[]
	/** Null only when no cells were supplied. */
	readonly best: BestCell | null
	readonly survivorCount: number
	readonly comparisonsRun: number
	readonly cellsReported: number
	readonly correction: CorrectionMethod
	readonly alpha: number
	readonly summary: string
	readonly provenance: Provenance
}

export type SweepResult =
	| SweepValue
	| Refused<"under-declared-family" | "partial-family-needs-full-set" | "unjustified-no-correction">

/**
 * Applies a multiplicity correction across a declared family and reports every cell with its
 * adjusted p-value.
 *
 * @param cells the comparisons being reported. May be fewer than `comparisonsRun`, never more.
 * @param declaration the family. See {@link SweepDeclaration}.
 */
export function sweepThenTest(cells: readonly SweepCell[], declaration: SweepDeclaration): SweepResult {
	const { comparisonsRun, correction, alpha, familyDefinition } = declaration
	if (!Number.isInteger(comparisonsRun) || comparisonsRun < 0) {
		throw new RangeError(`sweepThenTest expects an integer comparisonsRun, got ${comparisonsRun}`)
	}
	if (!(alpha > 0 && alpha < 1)) {
		throw new RangeError(`sweepThenTest expects 0 < alpha < 1, got ${alpha}`)
	}
	for (const cell of cells) {
		if (!(cell.pValue >= 0 && cell.pValue <= 1)) {
			throw new RangeError(`sweepThenTest expects p-values in [0, 1], got ${cell.pValue} for ${cell.id}`)
		}
	}

	const method = `sweep of ${comparisonsRun} comparisons, ${describeCorrection(correction)}, alpha=${alpha}`
	const inputs: Record<string, number | string | boolean> = {
		comparisonsRun,
		cellsReported: cells.length,
		correction,
		alpha,
		familyDefinition,
	}

	if (cells.length > comparisonsRun) {
		return refuse(
			"under-declared-family",
			`Sweep refused: ${cells.length} cells were handed over but the declared family is ${comparisonsRun}. The family cannot be smaller than what is being reported — comparisonsRun is the number of comparisons performed, not the number written up.`,
			provenance(method, comparisonsRun, inputs),
		)
	}

	if (correction === "benjamini-hochberg" && cells.length !== comparisonsRun) {
		return refuse(
			"partial-family-needs-full-set",
			`Sweep refused: Benjamini-Hochberg is a step-up procedure over the whole family, and only ${cells.length} of ${comparisonsRun} p-values were supplied. Supply every p-value, or use Holm, which stays valid on a reported subset because it is conservative there.`,
			provenance(method, comparisonsRun, inputs),
		)
	}

	if (correction === "none" && (declaration.noCorrectionJustification ?? "").trim() === "") {
		return refuse(
			"unjustified-no-correction",
			`Sweep refused: correction "none" over a family of ${comparisonsRun} requires noCorrectionJustification. Skipping correction is a claim — that these were pre-registered as separate questions and none was chosen for reporting by its result — and the claim has to be written down.`,
			provenance(method, comparisonsRun, inputs),
		)
	}

	const adjusted = adjustPValues(cells, comparisonsRun, correction)
	const corrected: CorrectedCell[] = cells.map((cell, index) => ({
		id: cell.id,
		label: cell.label,
		rawPValue: cell.pValue,
		adjustedPValue: adjusted[index]!,
		survivesCorrection: adjusted[index]! <= alpha,
	}))

	const survivorCount = corrected.filter((cell) => cell.survivesCorrection).length
	let best: BestCell | null = null
	for (const cell of corrected) {
		if (best === null || cell.rawPValue < best.rawPValue) best = { ...cell, rankOutOf: comparisonsRun }
	}

	const caveats: string[] = [`family: ${familyDefinition}`]
	if (cells.length < comparisonsRun) {
		caveats.push(
			`${cells.length} of ${comparisonsRun} comparisons are reported here; the correction uses all ${comparisonsRun}`,
		)
	}
	if (correction === "none") {
		caveats.push(`no correction applied. Justification given: ${declaration.noCorrectionJustification}`)
	}
	if (best !== null && !best.survivesCorrection && best.rawPValue <= alpha) {
		caveats.push(
			`the smallest raw p-value (${formatP(best.rawPValue)}, ${best.id}) would have cleared alpha uncorrected and does not clear it across ${comparisonsRun} comparisons`,
		)
	}

	return {
		ok: true,
		cells: corrected,
		best,
		survivorCount,
		comparisonsRun,
		cellsReported: cells.length,
		correction,
		alpha,
		summary: summarise(best, survivorCount, comparisonsRun, correction, alpha),
		provenance: provenance(
			method,
			comparisonsRun,
			inputs,
			[`${describeCorrection(correction)} across a family of ${comparisonsRun}`],
			caveats,
		),
	}
}

function summarise(
	best: BestCell | null,
	survivorCount: number,
	comparisonsRun: number,
	correction: CorrectionMethod,
	alpha: number,
): string {
	if (best === null) return `no cells reported out of ${comparisonsRun} comparisons`
	const verdict = best.survivesCorrection ? "survives" : "does not survive"
	return `best of ${comparisonsRun}: ${best.id} raw p=${formatP(best.rawPValue)}, ${describeCorrection(
		correction,
	)} p=${formatP(best.adjustedPValue)} — ${verdict} at alpha=${alpha}; ${survivorCount} of ${comparisonsRun} survive`
}

function describeCorrection(correction: CorrectionMethod): string {
	if (correction === "bonferroni") return "Bonferroni"
	if (correction === "holm") return "Holm"
	if (correction === "benjamini-hochberg") return "Benjamini-Hochberg"
	return "no correction"
}

/**
 * Returns adjusted p-values in the caller's original cell order.
 *
 * Holm and Bonferroni stay valid when only part of the family is reported, because both are
 * conservative when the unreported p-values are larger than the reported ones — which they are, by
 * construction, when the reported cells are the most extreme. Benjamini-Hochberg is not, which is
 * why `sweepThenTest` refuses that combination rather than quietly approximating it.
 */
function adjustPValues(
	cells: readonly SweepCell[],
	familySize: number,
	correction: CorrectionMethod,
): number[] {
	const adjusted = new Array<number>(cells.length).fill(0)
	if (correction === "none") {
		for (let i = 0; i < cells.length; i++) adjusted[i] = cells[i]!.pValue
		return adjusted
	}
	if (correction === "bonferroni") {
		for (let i = 0; i < cells.length; i++) adjusted[i] = clampUnit(cells[i]!.pValue * familySize)
		return adjusted
	}

	const order = cells.map((cell, index) => ({ index, pValue: cell.pValue }))
	order.sort((left, right) => left.pValue - right.pValue)

	if (correction === "holm") {
		// Step-down: multiply by the number of hypotheses still standing, then force monotonicity.
		let running = 0
		for (let rank = 0; rank < order.length; rank++) {
			const entry = order[rank]!
			const scaled = clampUnit(entry.pValue * (familySize - rank))
			running = Math.max(running, scaled)
			adjusted[entry.index] = running
		}
		return adjusted
	}

	// Benjamini-Hochberg, step-up. Only reachable with the full family, per the refusal above.
	let running = 1
	for (let rank = order.length - 1; rank >= 0; rank--) {
		const entry = order[rank]!
		const scaled = clampUnit((entry.pValue * familySize) / (rank + 1))
		running = Math.min(running, scaled)
		adjusted[entry.index] = running
	}
	return adjusted
}
