/**
 * # Scoring one entry with both energies, across the whole λ grid, in two evaluations
 *
 * ## Why the sweep is free
 *
 * `DESIGN.md` decision 2 makes the λ sweep mandatory. It does **not** make it expensive, because both
 * energies are exactly affine in λ and neither one's profile depends on λ:
 *
 * - **Arm A** (`src/energy/a/index.ts`): the profile over split scale, geometry and ramp direction is
 *   selected on `fit.cost` — the *data* cost alone — and λ enters only afterwards as
 *   `structural = λ·Ω`, with `Ω = structuralCount(config)` a function of the configuration's declared
 *   flags. So `total(λ) = (terms.field + terms.ink + terms.escape) + λ·Ω`.
 * - **Arm A′** (`src/energy/aprime/index.ts`): the assignment of each triple to the cheapest code, and
 *   the profile over (geometry × orientation), are selected on `likelihoodBits`, which contains no λ.
 *   λ enters only as `paletteBits = λ · serializationCost(config).bits`. So
 *   `total(λ) = likelihoodBits + λ·serializationBits`.
 *
 * Both decompositions are read out of the energies' own reported fields (`nuisance.omega`,
 * `nuisance.likelihoodBits`, `nuisance.serializationBits`) rather than re-derived here, and
 * {@link checkLambdaAlgebra} re-evaluates a sample of entries at a second λ and reports the largest
 * deviation, so the claim above is a measured one in every run header rather than a comment.
 *
 * ## Why the measurement is passed in
 *
 * There are 458 convertible entries over 197 distinct artworks. `measureImage` is the expensive step
 * (~0.35 s per 300×300 cover) and the energies are cheap (~30 ms and ~8 ms). The run therefore groups
 * entries by artwork and measures each artwork exactly once; this module never opens a file.
 */

import { energyOfA } from "../energy/a/index.ts"
import { energyOfAPrime } from "../energy/aprime/index.ts"
import { toConfiguration, type LegacyEntry } from "../emit/legacy.ts"
import type { Configuration } from "../emit/types.ts"
import type { Measurement } from "../measure/types.ts"
import { LAMBDA_GRID, lambdaKey, type ArmScore, type EntryScore } from "./types.ts"

/** `total(λ) = dataPart + λ·structuralPart`, on the whole grid. */
function totalsOverGrid(dataPart: number, structuralPart: number): Record<string, number> {
	const totals: Record<string, number> = {}
	for (const lambda of LAMBDA_GRID) totals[lambdaKey(lambda)] = dataPart + lambda * structuralPart
	return totals
}

/** Arm A, decomposed. Data is `field + ink + escape`; structure is Ω, priced at λ. */
export function scoreArmA(measurement: Measurement, config: Configuration): ArmScore {
	const result = energyOfA(measurement, config)
	const omega = result.nuisance.omega
	if (typeof omega !== "number") {
		throw new TypeError("energyOfA no longer reports nuisance.omega; the λ decomposition is unsafe")
	}
	const dataPart = result.terms.field + result.terms.ink + result.terms.escape
	return {
		arm: "p1a",
		unit: "nats",
		dataPart,
		structuralPart: omega,
		totals: totalsOverGrid(dataPart, omega),
		terms: result.terms,
		nuisance: result.nuisance,
	}
}

/** Arm A′, decomposed. Data is `L(pixels|P)`; structure is `L(P)`, priced at λ. */
export function scoreArmAPrime(measurement: Measurement, config: Configuration): ArmScore {
	const result = energyOfAPrime(measurement, config)
	const { likelihoodBits, serializationBits } = result.nuisance
	if (typeof likelihoodBits !== "number" || typeof serializationBits !== "number") {
		throw new TypeError(
			"energyOfAPrime no longer reports nuisance.likelihoodBits / serializationBits; the λ decomposition is unsafe",
		)
	}
	return {
		arm: "p1ap",
		unit: "bits",
		dataPart: likelihoodBits,
		structuralPart: serializationBits,
		totals: totalsOverGrid(likelihoodBits, serializationBits),
		terms: result.terms,
		nuisance: result.nuisance,
	}
}

/**
 * The named-role explained mass fraction, from arm A′'s code assignment.
 *
 * `field + ink` rather than `1 − generic` so a reader can see the two contributions; the two agree to
 * float association because `assemble()` partitions every pixel exactly once.
 */
export function explainedMassFractionOf(aprime: ArmScore): number {
	const field = aprime.nuisance.fieldMassFraction
	const ink = aprime.nuisance.inkMassFraction
	if (typeof field !== "number" || typeof ink !== "number") {
		throw new TypeError("energyOfAPrime no longer reports the field/ink mass fractions")
	}
	return field + ink
}

/**
 * Score one convertible legacy entry.
 *
 * Throws if the entry does not convert — the caller is expected to have filtered, and a silent skip
 * here would let the denominator drift away from the census.
 */
export function scoreEntry(entry: LegacyEntry, measurement: Measurement): EntryScore {
	const conversion = toConfiguration(entry)
	if (!conversion.ok) {
		throw new Error(`scoreEntry: ${entry.entryId} does not convert: ${conversion.reason}`)
	}
	const config = conversion.configuration
	const p1a = scoreArmA(measurement, config)
	const p1ap = scoreArmAPrime(measurement, config)
	return {
		entryId: entry.entryId,
		tier: entry.tier,
		kind: entry.kind,
		completeness: entry.completeness,
		artworkSha: entry.artwork.contentSha256,
		imagePath: entry.artwork.imagePath,
		conversionNotes: conversion.notes,
		shape: {
			gradient: config.gradient,
			stopCount: config.stops.length,
			surfaceCollapsed: config.surfaceCollapsed,
			accentCollapsed: config.accentCollapsed,
		},
		explainedMassFraction: explainedMassFractionOf(p1ap),
		p1a,
		p1ap,
	}
}

/**
 * Re-evaluate both energies at a λ the sweep did not use and compare against the affine reading.
 *
 * The one check that keeps `totalsOverGrid` honest: if either energy ever starts letting λ into its
 * profile, this returns a non-zero deviation and the run header says so.
 */
export function checkLambdaAlgebra(
	entry: LegacyEntry,
	measurement: Measurement,
	score: EntryScore,
	lambda: number,
): { p1a: number; p1ap: number } {
	const conversion = toConfiguration(entry)
	if (!conversion.ok) throw new Error(`checkLambdaAlgebra: ${entry.entryId} does not convert`)
	const config = conversion.configuration
	const directA = energyOfA(measurement, config, { lambda }).total
	const directAPrime = energyOfAPrime(measurement, config, { lambda }).total
	return {
		p1a: Math.abs(directA - (score.p1a.dataPart + lambda * score.p1a.structuralPart)),
		p1ap: Math.abs(directAPrime - (score.p1ap.dataPart + lambda * score.p1ap.structuralPart)),
	}
}
