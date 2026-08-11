/**
 * # The evaluator — one place where a configuration meets the feasible set and the objective
 *
 * Every configuration the search ever considers passes through {@link Evaluator.consider}, and the
 * order of operations inside it is the mechanism, not an optimisation:
 *
 * 1. **Ask the contract.** `feasibility()` decides membership. `DESIGN.md`: *"The contract is the
 *    feasible set, never a term."* An infeasible configuration is not scored at all — not scored and
 *    penalised, not scored and discarded, simply never scored, because its energy has no meaning to
 *    a minimisation that is only over legal palettes.
 * 2. **Ask the arm's energy.** One call, no post-processing, no re-weighting. The evaluator does not
 *    know what the terms mean and must not: it compares totals and stores what it was given.
 * 3. **Compare on the total, break ties on the canonical key.** No secondary objective, ever. A
 *    tie-break that consulted contrast, or mass, or distinctness would be the objective quietly
 *    acquiring the term `DESIGN.md` forbids it.
 *
 * ## The budget is a count, not a clock
 *
 * The search never reads `performance.now()` to decide anything. It spends a **predicted-cost
 * budget** computed from the image's triple count and the cost model in `constants.ts`, and the same
 * image spends the same budget on any machine, in any order, at any load. That is what makes the
 * determinism test (`tests/search/determinism.test.ts`) a statement about the algorithm rather than
 * about the laptop it ran on. Wall time is measured and reported next to the prediction — the M2
 * brief asks for actuals *reported honestly*, which means published beside the estimate that sized
 * the search, not instead of it.
 *
 * ## Dedup
 *
 * The coarse product and the refinement sweeps reach the same configuration by different routes. The
 * evaluator keeps every canonical key it has scored and returns the stored result for a repeat, so
 * "evaluations" in the effort report counts *distinct* configurations and the budget is not spent
 * twice on one answer.
 */

import { energyOfA, structuralCount } from "../energy/a/index.ts"
import { energyOfAPrime } from "../energy/aprime/index.ts"
import { feasibility, type FeasibilityReport, type ImageFacts } from "../emit/feasibility.ts"
import { toPalette } from "../emit/palette.ts"
import type { Configuration, EmitMeta } from "../emit/types.ts"
import type { Measurement } from "../measure/types.ts"
import type { Palette } from "../../../../src/contract/types.ts"
import { canonicalKey } from "./conventions.ts"
import {
	ENERGY_MS_PER_1K_COLORS_FLAT,
	ENERGY_MS_PER_1K_COLORS_RAMP,
	FEASIBILITY_MS_FLAT,
	FEASIBILITY_MS_PER_RAMP_SEGMENT,
	RUNNER_UP_COUNT,
} from "./constants.ts"
import type { ArmName, Scored } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// The cost model
// ---------------------------------------------------------------------------------------------

/**
 * Predicted milliseconds for one configuration: the feasibility call plus the energy evaluation.
 *
 * A **prediction**, and used for one purpose — deciding how much of the configuration space fits in
 * the allowance. It never enters an energy, a verdict, or a published number. The coefficients are
 * `[MEASURED]` on one machine (see `constants.ts`); being wrong by a factor of two would make the
 * search coarser or finer and change nothing else.
 *
 * A ramp is costed per *segment* because that is how the contract's whole-ramp check scales: a
 * three-stop ramp is two segments of 2,048 samples each, twice.
 */
export function predictedMs(colorCount: number, stopCount: number): number {
	const perThousand = colorCount / 1000
	if (stopCount === 0) {
		return FEASIBILITY_MS_FLAT + ENERGY_MS_PER_1K_COLORS_FLAT * perThousand
	}
	const segments = stopCount - 1
	return (
		FEASIBILITY_MS_PER_RAMP_SEGMENT * segments + ENERGY_MS_PER_1K_COLORS_RAMP * perThousand
	)
}

/** Predicted milliseconds for a feasibility call alone — what a rejected configuration costs. */
export function predictedFeasibilityMs(stopCount: number): number {
	return stopCount === 0
		? FEASIBILITY_MS_FLAT
		: FEASIBILITY_MS_PER_RAMP_SEGMENT * (stopCount - 1)
}

// ---------------------------------------------------------------------------------------------
// Energy dispatch
// ---------------------------------------------------------------------------------------------

export type EnergyOutcome = Readonly<{
	total: number
	terms: Readonly<Record<string, number>>
	nuisance: Readonly<Record<string, number | string>>
	/** What λ multiplied: Ω for arm A, L(P) in bits for arm A′. */
	structural: number
}>

/**
 * Call the arm's energy and read its structural part out of its own reported fields.
 *
 * The structural part is re-read rather than re-derived, exactly as `src/falsifier/score.ts` does it
 * and for the same reason: `total(λ) = data + λ·structural` is a claim about the energy, and a
 * consumer that recomputed the structural half from the configuration would keep agreeing with
 * itself after the energy stopped agreeing with it.
 */
export function evaluateEnergy(
	arm: ArmName,
	measurement: Measurement,
	configuration: Configuration,
	lambda: number | undefined,
): EnergyOutcome {
	const options = lambda === undefined ? {} : { lambda }
	if (arm === "a") {
		const result = energyOfA(measurement, configuration, options)
		const omega = result.nuisance.omega
		return {
			total: result.total,
			terms: result.terms,
			nuisance: result.nuisance,
			structural: typeof omega === "number" ? omega : structuralCount(configuration),
		}
	}
	const result = energyOfAPrime(measurement, configuration, options)
	const bits = result.nuisance.serializationBits
	return {
		total: result.total,
		terms: result.terms,
		nuisance: result.nuisance,
		structural: typeof bits === "number" ? bits : Number.NaN,
	}
}

// ---------------------------------------------------------------------------------------------
// Incumbent ordering
// ---------------------------------------------------------------------------------------------

/**
 * Strict "is `candidate` better than `incumbent`" — lower energy, ties to the smaller canonical key.
 *
 * `NaN` never wins: a configuration whose energy is not a finite number is not a minimiser of
 * anything, and letting one through would replace a real palette with a numerical accident.
 */
export function isBetter(candidate: Scored, incumbent: Scored | null): boolean {
	if (!Number.isFinite(candidate.energy)) return false
	if (incumbent === null) return true
	if (candidate.energy < incumbent.energy) return true
	if (candidate.energy > incumbent.energy) return false
	return candidate.key < incumbent.key
}

// ---------------------------------------------------------------------------------------------
// The evaluator
// ---------------------------------------------------------------------------------------------

export type ConsiderOutcome = Readonly<{
	/** `null` when the configuration was infeasible or the budget was already spent. */
	scored: Scored | null
	feasible: boolean
	/** The contract's report, for the one caller that wants to know *why* it was rejected. */
	report: FeasibilityReport | null
	/** True when this key had been scored before and nothing new was spent. */
	repeat: boolean
	/** True when the budget refused the evaluation. */
	refusedForBudget: boolean
}>

export class Evaluator {
	readonly arm: ArmName
	readonly measurement: Measurement
	readonly meta: EmitMeta
	readonly lambda: number | undefined
	readonly facts: ImageFacts

	/** Predicted-cost budget, in the cost model's milliseconds. Decremented, never refilled. */
	budgetRemaining: number
	readonly budgetTotal: number

	configurationsEnumerated = 0
	feasibilityCalls = 0
	feasibleConfigurations = 0
	energyEvaluations = 0
	budgetExhausted = false

	private readonly scoredByKey = new Map<string, Scored>()
	private readonly infeasibleKeys = new Set<string>()
	/** Best-first list of every distinct feasible configuration, capped; see {@link runnerUps}. */
	private readonly best: Scored[] = []

	constructor(options: {
		arm: ArmName
		measurement: Measurement
		meta: EmitMeta
		lambda: number | undefined
		facts: ImageFacts
		budgetMs: number
	}) {
		this.arm = options.arm
		this.measurement = options.measurement
		this.meta = options.meta
		this.lambda = options.lambda
		this.facts = options.facts
		this.budgetRemaining = options.budgetMs
		this.budgetTotal = options.budgetMs
	}

	/** The published palette for a configuration, built exactly as `emit()` will build it. */
	paletteOf(configuration: Configuration): Palette {
		return toPalette(configuration, this.meta)
	}

	/**
	 * Feasibility, without the image-side facts.
	 *
	 * The inner loop deliberately runs invariant 2's existence clause **deferred**, and it is sound to
	 * do so here for one specific reason: every colour the enumerator can name is a row of the
	 * measurement's own triple table, i.e. an exact pixel of the artwork by construction. The clause
	 * cannot fail on a configuration this search builds. `emit()` still verifies the *emitted* palette
	 * with the facts supplied (`verifyEmitted`), so the claim is checked once per image rather than
	 * assumed once per lattice node — and the escape branch, which names a colour the artwork may not
	 * contain, is checked with the facts every time.
	 */
	private feasibilityOf(configuration: Configuration, withFacts: boolean): FeasibilityReport {
		this.feasibilityCalls += 1
		return feasibility(this.paletteOf(configuration), withFacts ? this.facts : {})
	}

	/**
	 * Consider one configuration: test membership, score it if it is in, remember it either way.
	 *
	 * `charge` is how much predicted cost this configuration costs; it is deducted whether or not the
	 * configuration turned out to be feasible, because the feasibility call was made either way.
	 */
	consider(configuration: Configuration, options?: { withFacts?: boolean }): ConsiderOutcome {
		const key = canonicalKey(configuration)
		const previous = this.scoredByKey.get(key)
		if (previous !== undefined) {
			return { scored: previous, feasible: true, report: null, repeat: true, refusedForBudget: false }
		}
		if (this.infeasibleKeys.has(key)) {
			return { scored: null, feasible: false, report: null, repeat: true, refusedForBudget: false }
		}

		const stopCount = configuration.stops.length
		const charge = predictedMs(this.measurement.triples.colorCount, stopCount)
		if (charge > this.budgetRemaining) {
			this.budgetExhausted = true
			return { scored: null, feasible: false, report: null, repeat: false, refusedForBudget: true }
		}

		this.configurationsEnumerated += 1
		const report = this.feasibilityOf(configuration, options?.withFacts === true)
		if (!report.valid) {
			this.infeasibleKeys.add(key)
			this.budgetRemaining -= predictedFeasibilityMs(stopCount)
			return { scored: null, feasible: false, report, repeat: false, refusedForBudget: false }
		}

		this.budgetRemaining -= charge
		this.feasibleConfigurations += 1
		this.energyEvaluations += 1
		const outcome = evaluateEnergy(this.arm, this.measurement, configuration, this.lambda)
		const scored: Scored = {
			configuration,
			energy: outcome.total,
			terms: outcome.terms,
			nuisance: outcome.nuisance,
			key,
		}
		this.scoredByKey.set(key, scored)
		this.remember(scored)
		return { scored, feasible: true, report, repeat: false, refusedForBudget: false }
	}

	/**
	 * Score a configuration **off-budget and outside the competition**.
	 *
	 * For the diagnostics only: the F/A-swap probe and the legacy self-falsifier need the energy of
	 * configurations that are not candidates for emission. They do not enter the incumbent list, they
	 * do not consume budget, and they are counted separately in the effort report so that
	 * "configurations the search looked at" never quietly includes them.
	 */
	scoreOffBudget(
		configuration: Configuration,
		withFacts: boolean,
	): { scored: Scored | null; report: FeasibilityReport } {
		const report = this.feasibilityOf(configuration, withFacts)
		if (!report.valid) return { scored: null, report }
		this.energyEvaluations += 1
		const outcome = evaluateEnergy(this.arm, this.measurement, configuration, this.lambda)
		return {
			scored: {
				configuration,
				energy: outcome.total,
				terms: outcome.terms,
				nuisance: outcome.nuisance,
				key: canonicalKey(configuration),
			},
			report,
		}
	}

	/** Keep the top `RUNNER_UP_COUNT + 1` by the incumbent ordering: the winner plus its near-misses. */
	private remember(scored: Scored): void {
		this.best.push(scored)
		this.best.sort((left, right) =>
			left.energy === right.energy
				? left.key < right.key ? -1 : left.key > right.key ? 1 : 0
				: left.energy - right.energy
		)
		if (this.best.length > RUNNER_UP_COUNT + 1) this.best.length = RUNNER_UP_COUNT + 1
	}

	/** The incumbent: the best feasible configuration seen, or `null` if none ever was. */
	get incumbent(): Scored | null {
		return this.best.length === 0 ? null : this.best[0]
	}

	/** The next `RUNNER_UP_COUNT` behind the incumbent, best first. */
	runnerUps(): readonly Scored[] {
		return this.best.slice(1)
	}

	/** Predicted cost consumed so far. */
	get predictedMsSpent(): number {
		return this.budgetTotal - this.budgetRemaining
	}
}
