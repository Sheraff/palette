/**
 * # `emit()` — P1's v0 emitter
 *
 * One image in, one palette plus its diagnostics out. The palette is the argmin of the arm's energy
 * over the slice of the contract-feasible set this search reached; the diagnostics are everything a
 * reader needs to know how big that slice was.
 *
 * ## The order of operations, and which document each step answers to
 *
 * 1. **Measure** (`src/measure/`). The only contact with the file. `DESIGN.md` puts decoding here and
 *    nowhere else, and arm A §2.1 makes the measurement *"the only thing the rest of the computation
 *    sees"*.
 * 2. **Plan** (`plan.ts`). Choose the lattice rung and the grammar level from the image's own triple
 *    count against the stated allowance, and publish what was chosen and what it cost.
 * 3. **Enumerate the coarse joint product** (`enumerate.ts`). All four roles together; no shortlist.
 * 4. **Escape, only if that product reached nothing feasible** (`DESIGN.md` decision 6).
 * 5. **Refine** (`refine.ts`). Finer lattice levels, all four roles free, exact image triples.
 * 6. **Verify what is about to be published** with the image facts supplied, so invariant 2's
 *    existence clause and invariant 5 actually run on the emitted palette rather than being deferred.
 * 7. **Diagnose** (`diagnostics.ts`). Contrast report, swap probe, self-falsifier.
 *
 * ## What this function refuses to do
 *
 * It never repairs. If the search reaches no feasible configuration at all — not in the artwork, not
 * through the escape — it throws {@link NoFeasibleConfigurationError} rather than emitting something
 * that fails an invariant, and rather than widening a threshold to make one legal. A candidate that
 * throws on an image produces a failed row in the dev loop, which is information; a candidate that
 * emits an illegal palette produces a row that quietly poisons every downstream instrument.
 *
 * Likewise it never *silently* under-searches. Every coarsening is in `SearchScale`, the certificate
 * is `"UNCERTIFIED-V0"` on every palette, and `knownBetterFeasible` reports, per image, whether a
 * configuration the reviewer already endorsed would have scored lower than what came out.
 */

import { DEFAULT_LAMBDA as DEFAULT_LAMBDA_A } from "../energy/a/constants.ts"
import { DEFAULT_LAMBDA as DEFAULT_LAMBDA_APRIME } from "../energy/aprime/constants.ts"
import { feasibility } from "../emit/feasibility.ts"
import { ALGORITHM_VERSIONS, toPalette } from "../emit/palette.ts"
import { sourceMetaOf } from "../emit/source-meta.ts"
import { measureImage } from "../measure/index.ts"
import type { Measurement } from "../measure/types.ts"
import {
	COARSE_CELL_BAR_MULTIPLES,
	SEARCH_BUDGET_MS,
	SEARCH_CERTIFICATE,
	coarseCellSide,
} from "./constants.ts"
import { fieldOrderOf, summarise } from "./conventions.ts"
import { inkContrast, knownBetterFeasible, swapProbe } from "./diagnostics.ts"
import { enumerateCoarse, enumerateEscape } from "./enumerate.ts"
import { Evaluator } from "./evaluator.ts"
import { imageFactsOf } from "./image-facts.ts"
import { buildLevel } from "./lattice.ts"
import { planCoarseStage } from "./plan.ts"
import { refine } from "./refine.ts"
import {
	ARM_CANDIDATE_ID,
	ARM_ENERGY_UNIT,
	type Diagnostics,
	type EmitOptions,
	type EmitResult,
	type RunnerUp,
	type SearchScale,
} from "./types.ts"

export * from "./types.ts"
export { SEARCH_CERTIFICATE } from "./constants.ts"
export { planCoarseStage } from "./plan.ts"
export { enumerateCoarse, interiorStopLists } from "./enumerate.ts"
export { makeConfiguration, canonicalKey, summarise, fieldOrderOf } from "./conventions.ts"
export { buildLevel, representativesAt, representativeFor } from "./lattice.ts"
export { Evaluator, evaluateEnergy, isBetter, predictedMs } from "./evaluator.ts"
export { imageFactsOf } from "./image-facts.ts"
export { inkContrast } from "./diagnostics.ts"

/**
 * Thrown when the search reached no feasible configuration, in the artwork or through the escape.
 *
 * `DESIGN.md` decision 6 expects the escape itself *"to essentially never fire"*, so this error
 * firing means something considerably stranger than a difficult artwork — an image whose entire
 * reachable configuration space is illegal — and it says so loudly rather than degrading.
 */
export class NoFeasibleConfigurationError extends Error {
	override readonly name = "NoFeasibleConfigurationError"
}

/** Thrown when the palette the search selected fails the contract with the image facts supplied. */
export class EmittedPaletteInfeasibleError extends Error {
	override readonly name = "EmittedPaletteInfeasibleError"
}

/**
 * What `emit()` takes: `EmitOptions` plus the one field that is a property of the *caller* rather than
 * of the search.
 *
 * `algorithmVersion` is metadata provenance and nothing else — no energy, no feasibility test and no
 * tie-break reads it, so two calls differing only in this string produce byte-identical colours. It
 * exists because `ALGORITHM_VERSIONS` in `src/emit/palette.ts` is keyed by arm and therefore cannot
 * tell v0's operating point from v1's; the candidate module knows which one it is, so the candidate
 * module says so. Omitted, the arm-keyed default still applies, which is why the v0 behaviour is
 * unchanged.
 *
 * Declared here rather than in `types.ts` because it is not part of the search's own vocabulary: the
 * search never reads it.
 */
export type EmitCallOptions = EmitOptions & Readonly<{ algorithmVersion?: string }>

function defaultLambdaFor(arm: EmitOptions["arm"]): number {
	return arm === "a" ? DEFAULT_LAMBDA_A : DEFAULT_LAMBDA_APRIME
}

/** λ multiplied Ω for arm A and L(P) for arm A′; whichever it was, the energy reported it. */
function structuralOf(arm: EmitOptions["arm"], nuisance: Readonly<Record<string, number | string>>): number {
	const value = arm === "a" ? nuisance.omega : nuisance.serializationBits
	return typeof value === "number" ? value : Number.NaN
}

/**
 * Emit a palette for one image under one arm's energy.
 *
 * Deterministic: same file, same options, byte-identical palette. No RNG, no clock in any decision,
 * no `Map` iterated without an explicit sort.
 */
export async function emit(imagePath: string, options: EmitCallOptions): Promise<EmitResult> {
	const startedAt = performance.now()
	const arm = options.arm
	const candidateId = ARM_CANDIDATE_ID[arm]
	const lambda = options.lambda ?? defaultLambdaFor(arm)

	// --- 1. measure ------------------------------------------------------------------------------
	const measurement: Measurement = options.measurement ?? (await measureImage(imagePath))
	// The caller's version wins when it named one. Metadata only: `meta` reaches the evaluator too, but
	// no energy, no feasibility test and no tie-break reads `algorithmVersion`, so this string cannot
	// move a colour.
	const meta = await sourceMetaOf(
		imagePath,
		options.algorithmVersion ?? ALGORITHM_VERSIONS[candidateId],
	)
	const measuredAt = performance.now()

	// --- 2. plan ---------------------------------------------------------------------------------
	const plan = planCoarseStage(measurement, {
		...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
		...(options.coarseCellBarMultiple === undefined
			? {}
			: { forcedBarMultiple: options.coarseCellBarMultiple }),
		...(options.grammarLevel === undefined ? {} : { forcedGrammar: options.grammarLevel }),
	})
	const facts = imageFactsOf(measurement)
	const evaluator = new Evaluator({
		arm,
		measurement,
		meta,
		lambda: options.lambda,
		facts,
		budgetMs: options.budgetMs ?? SEARCH_BUDGET_MS,
	})

	// --- 3. the coarse joint product, deepened while the allowance lasts ---------------------------
	//
	// Iterative deepening, and it is a correction rather than an embellishment. The first demo-20 run
	// (2026-08-05, before this loop existed) sized the alphabet from the cost model alone and got four
	// or five representatives on the heavy covers — because the model charges every configuration an
	// energy evaluation while, on those covers, 99% of them turn out infeasible and cost only a
	// feasibility call. The consequences were not subtle: the escape branch fired on **three** of
	// twenty covers and one cover produced no palette at all, both because the *reached* in-artwork
	// feasible set was empty at an alphabet of four colours. `DESIGN.md` decision 6 expects the escape
	// to essentially never fire, and an empty reached set is a fact about the alphabet, not about the
	// artwork.
	//
	// So: start at the rung the model says is affordable, enumerate it **whole**, and then keep buying
	// finer alphabets one rung at a time until the coarse allowance is gone or a level is cut off. The
	// evaluator charges the real per-configuration cost, so this adapts to the feasible fraction
	// instead of predicting it, and the answer can only improve — every level's results join the same
	// incumbent list. It stays deterministic: the budget is a counter, not a clock.
	const deepening: SearchScale["deepening"][number][] = []
	let coarseLevel = buildLevel(measurement, plan.barMultiple, plan.side)
	let rungIndex = COARSE_CELL_BAR_MULTIPLES.indexOf(plan.barMultiple)
	for (;;) {
		const completed = enumerateCoarse(evaluator, measurement, coarseLevel, plan.grammar)
		deepening.push({
			barMultiple: coarseLevel.barMultiple,
			representatives: coarseLevel.representatives.length,
			completed,
			feasibleAfter: evaluator.feasibleConfigurations,
		})
		if (!completed || options.coarseCellBarMultiple !== undefined) break
		if (evaluator.predictedMsSpent >= plan.scale.coarseBudgetMs) break

		// Step to the next rung whose alphabet is strictly larger. A finer cell side that elects the
		// same representatives buys nothing — the product would be identical and the evaluator would
		// answer every configuration from its dedup cache — so those rungs are skipped rather than
		// re-enumerated.
		let next: typeof coarseLevel | null = null
		while (rungIndex > 0) {
			rungIndex -= 1
			const candidate = buildLevel(
				measurement,
				COARSE_CELL_BAR_MULTIPLES[rungIndex],
				coarseCellSide(COARSE_CELL_BAR_MULTIPLES[rungIndex]),
			)
			if (candidate.representatives.length > coarseLevel.representatives.length) {
				next = candidate
				break
			}
		}
		if (next === null) break
		coarseLevel = next
	}
	const coarseEvaluations = evaluator.energyEvaluations
	const inArtworkFeasibleReached = evaluator.feasibleConfigurations

	// --- 4. the escape, only on an empty in-artwork result ---------------------------------------
	let escapeConfigurationsEvaluated = 0
	if (evaluator.incumbent === null) {
		escapeConfigurationsEvaluated = enumerateEscape(evaluator, measurement, coarseLevel)
	}

	// --- 5. refinement ---------------------------------------------------------------------------
	// Skipped for an escape incumbent: its escape colour is by definition not a triple of the artwork,
	// so it has no lattice cell and no neighbourhood to refine within. An escape palette is the
	// contract's last resort, not a starting point.
	const escapeUsed = evaluator.incumbent?.configuration.escape != null
	const refinement = escapeUsed
		? { levels: 0, sweeps: 0, improvements: 0, beamSeeds: 0 }
		: refine(evaluator, measurement, coarseLevel.barMultiple)

	const incumbent = evaluator.incumbent
	if (incumbent === null) {
		throw new NoFeasibleConfigurationError(
			`no feasible configuration for ${imagePath} under arm ${arm}: ${evaluator.configurationsEnumerated} configurations enumerated at cell side ${plan.side.toFixed(6)} (${plan.representatives} representatives, grammar ${plan.grammar}), ${escapeConfigurationsEvaluated} escape configurations`,
		)
	}
	const searchedAt = performance.now()

	// --- 6. publish, and verify what is being published ------------------------------------------
	const palette = toPalette(incumbent.configuration, meta)
	const verdict = feasibility(palette, facts)
	if (!verdict.valid) {
		throw new EmittedPaletteInfeasibleError(
			`the selected configuration for ${imagePath} fails the contract once the image facts are supplied: ${
				verdict.violations.map((violation) => violation.code).join(", ")
			}`,
		)
	}

	// --- 7. diagnostics --------------------------------------------------------------------------
	const runnerUps: RunnerUp[] = evaluator.runnerUps().map((scored) => ({
		energy: scored.energy,
		gap: scored.energy - incumbent.energy,
		configuration: summarise(scored.configuration),
		canonicalKey: scored.key,
	}))
	const swap = swapProbe(evaluator, incumbent)
	const known = options.skipKnownBetterFeasible === true
		? {
			entriesForArtwork: 0,
			convertible: 0,
			feasible: 0,
			legacyEnergy: null,
			legacyEntryId: null,
			incumbentEnergy: incumbent.energy,
			underSearched: false,
			shortfall: null,
		}
		: knownBetterFeasible(evaluator, incumbent, meta.inputContentHash)
	const finishedAt = performance.now()

	const diagnostics: Diagnostics = {
		searchCertificate: SEARCH_CERTIFICATE,
		arm,
		candidateId,
		energyUnit: ARM_ENERGY_UNIT[arm],
		lambda,
		imagePath,
		inputContentHash: meta.inputContentHash,
		colorCount: measurement.triples.colorCount,
		pixelCount: measurement.triples.pixelCount,
		searchScale: {
			...plan.scale,
			// The rung the search *finished at*, which after deepening is normally finer than the one
			// the cost model started it on. Both are published; a reader comparing two images wants the
			// alphabet that produced the palette, not the one that was predicted.
			coarseCellBarMultiple: coarseLevel.barMultiple,
			coarseCellSide: coarseLevel.side,
			coarseRepresentatives: coarseLevel.representatives.length,
			startingBarMultiple: plan.barMultiple,
			startingRepresentatives: plan.representatives,
			deepening,
		},
		effort: {
			configurationsEnumerated: evaluator.configurationsEnumerated,
			feasibilityCalls: evaluator.feasibilityCalls,
			feasibleConfigurations: evaluator.feasibleConfigurations,
			energyEvaluations: evaluator.energyEvaluations,
			coarseEvaluations,
			refinementEvaluations: evaluator.energyEvaluations - coarseEvaluations,
			refinementLevels: refinement.levels,
			refinementSweeps: refinement.sweeps,
			refinementBeamSeeds: refinement.beamSeeds,
			refinementImprovements: refinement.improvements,
			predictedMsSpent: evaluator.predictedMsSpent,
			predictedMsBudget: evaluator.budgetTotal,
			budgetExhausted: evaluator.budgetExhausted,
		},
		incumbent: {
			energy: incumbent.energy,
			terms: incumbent.terms,
			nuisance: incumbent.nuisance,
			configuration: summarise(incumbent.configuration),
			canonicalKey: incumbent.key,
			structuralCount: structuralOf(arm, incumbent.nuisance),
		},
		runnerUps,
		swap,
		apca: {
			foreground: inkContrast(palette, incumbent.configuration.foreground),
			accent: inkContrast(palette, incumbent.configuration.accent),
		},
		escape: {
			used: escapeUsed,
			inArtworkFeasibleReached,
			escapeConfigurationsEvaluated,
		},
		knownBetterFeasible: known,
		wallMs: {
			measure: measuredAt - startedAt,
			search: searchedAt - measuredAt,
			diagnostics: finishedAt - searchedAt,
			total: finishedAt - startedAt,
		},
	}

	return { palette, diagnostics }
}

/** The field order the emitted palette renders as. Re-exported for the run reports. */
export { fieldOrderOf as emittedFieldOrder }
