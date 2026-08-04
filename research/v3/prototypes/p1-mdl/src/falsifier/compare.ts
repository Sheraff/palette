/**
 * # The pre-registered comparisons
 *
 * `DESIGN.md` M1, quoted in full because it is the hypothesis and the reading rule at once:
 *
 * > *"M1 — energies without search. Falsifier runs on legacy verdicts. Pre-registered reading (arm A′
 * > §7, before any result is seen): if endorsed palettes are NOT systematically lower in energy than
 * > known-bad for the same artwork — no rank signal, no single term culpable, at any λ in the sweep —
 * > the currency is wrong, and that is reportable evidence, not a tuning prompt. (Legacy verdicts are
 * > weak evidence by construction; the result guides, the reviewer judges.)"*
 *
 * Three properties of that sentence are load-bearing and are enforced here rather than remembered:
 *
 * 1. **"for the same artwork"** — the comparison is *paired*. `src/emit/legacy.ts` explains why: the
 *    tiers share artworks (22 covers carry both a good-tier and a known-bad palette), so a pooled
 *    comparison of 458 numbers would be dominated by which covers happen to be in which tier. The
 *    unit of analysis is therefore **one artwork**, and `trialsAreDistinctUnits: true` is only ever
 *    passed on the per-artwork comparisons.
 * 2. **"lower in energy"** — the direction was fixed before any number existed, which is what
 *    `exactBinomialTest`'s `directionFixedInAdvance` is asking for. Only the good-vs-known-bad
 *    comparisons carry it; endorsed-vs-acceptable is run **two-sided**, because the tier
 *    epistemology (`LEGACY_TIER_EPISTEMOLOGY`) says acceptable is *"a not-rejected baseline tier,
 *    explicitly NOT endorsements"* — that is a statement about provenance, not a claim that
 *    acceptable palettes are worse, and there is nothing pre-registered to justify a one-sided read.
 * 3. **"at any λ in the sweep"** — five λ times two energies is a family of ten, and the family size
 *    goes through `sweepThenTest` in `run.ts`. Nothing in this file reports a minimum p-value.
 *
 * ## The two selection rules, and the bias each carries
 *
 * An artwork can carry several entries on a side. Two readings are computed and **both** are
 * reported, because each is biased in a direction the other is not:
 *
 * - `bestOfSide` (the M1 brief's instruction: *"where an artwork has multiple good entries, use the
 *   best-scoring good one"*) takes the **minimum-energy** entry on each side, under the very energy
 *   being tested. A minimum over more entries is systematically lower, and the good tiers carry more
 *   entries per artwork than known-bad does (421 good entries over 190 artworks against 37 known-bad
 *   over 26), so this rule flatters the hypothesis. Applied symmetrically — the known-bad side is
 *   also taken at its minimum, which is the harder of the two available conventions — and the
 *   per-side entry counts travel on every pair so the asymmetry is visible.
 * - `allPairs` compares every left entry against every right entry. That has no selection bias and a
 *   worse one instead: an artwork with 6 good and 3 known-bad entries contributes 18 correlated
 *   "trials". It is therefore always run through `TrialIndependence` with
 *   `trialsAreDistinctUnits: false` and the artwork count as `distinctUnits`, so the p-value carries
 *   the module's pseudo-replication caveat verbatim.
 *
 * Neither is a tunable: they are two readings of one dataset, both published.
 */

import {
	exactBinomialTest,
	wilsonInterval,
	type BinomialTestResult,
	type WilsonIntervalResult,
} from "../../../../src/stats/index.ts"
import type { LegacyTier } from "../emit/legacy.ts"
import { lambdaKey, type ArtworkRecord, type EnergyArm, type EntryScore, type Stratum } from "./types.ts"

/**
 * Where the direction of every one-sided test was fixed.
 *
 * Echoed into the provenance of each one-sided p-value by `exactBinomialTest`, which is the whole
 * point of the field: the claim travels with the number.
 */
export const PREREGISTRATION_REFERENCE =
	"research/v3/prototypes/p1-mdl/DESIGN.md, §Milestones M1 ('endorsed palettes ... systematically lower in energy than known-bad for the same artwork'), written 2026-08-04 before any energy was evaluated on the legacy fixtures"

export type Outcome = "left-lower" | "right-lower" | "tie"

/** One artwork's contribution to a paired comparison. */
export type PairRow = Readonly<{
	artworkSha: string
	imagePath: string
	stratum: Stratum
	explainedMassFraction: number
	leftEntryId: string
	rightEntryId: string
	leftTotal: number
	rightTotal: number
	/** How many entries the side had to choose from. The selection bias, made visible per row. */
	leftCandidates: number
	rightCandidates: number
	outcome: Outcome
}>

export type Counts = Readonly<{ wins: number; losses: number; ties: number }>

export type PairedComparison = Readonly<{
	id: string
	label: string
	selection: "best-of-side" | "all-pairs"
	leftTiers: readonly LegacyTier[]
	rightTiers: readonly LegacyTier[]
	arm: EnergyArm
	lambda: number
	stratum: Stratum | "all"
	/** Distinct artworks contributing. Equals `wins + losses + ties` for `best-of-side`. */
	artworks: number
	counts: Counts
	rows: readonly PairRow[]
	/**
	 * The pre-registered test where the direction was fixed in advance, two-sided otherwise. Ties are
	 * excluded from the denominator — the sign test's convention — and reported separately, never
	 * folded in as half-wins.
	 */
	test: BinomialTestResult
	/** The interval on the same counts. Reported alongside the p-value, never instead of it. */
	interval: WilsonIntervalResult
}>

/** Lowest total on a side; ties on the number broken by `entryId` ascending, so the pick is a function. */
function bestOfSide(
	entries: readonly EntryScore[],
	arm: EnergyArm,
	lambda: number,
): EntryScore {
	const key = lambdaKey(lambda)
	let best = entries[0]
	let bestTotal = best[arm].totals[key]
	for (let index = 1; index < entries.length; index += 1) {
		const candidate = entries[index]
		const total = candidate[arm].totals[key]
		if (total < bestTotal || (total === bestTotal && candidate.entryId < best.entryId)) {
			best = candidate
			bestTotal = total
		}
	}
	return best
}

function outcomeOf(left: number, right: number): Outcome {
	if (left < right) return "left-lower"
	if (right < left) return "right-lower"
	return "tie"
}

/** Entries of one artwork restricted to a set of tiers. Input order is the loader's, which is stable. */
function sideEntries(
	byArtwork: ReadonlyMap<string, readonly EntryScore[]>,
	artworkSha: string,
	tiers: readonly LegacyTier[],
): readonly EntryScore[] {
	const all = byArtwork.get(artworkSha) ?? []
	return all.filter((entry) => tiers.includes(entry.tier))
}

export type ComparisonSpec = Readonly<{
	id: string
	label: string
	leftTiers: readonly LegacyTier[]
	rightTiers: readonly LegacyTier[]
	/** `greater` = "left is lower in energy more often than chance", the M1 direction. */
	alternative: "greater" | "two-sided"
}>

/**
 * One paired comparison, at one arm, one λ, one stratum.
 *
 * `artworks` is restricted to those carrying at least one entry on each side *after* stratification;
 * an empty set produces a `Refused` test rather than a rate, which is `exactBinomialTest`'s job and
 * not something this function papers over.
 */
export function pairedComparison(
	spec: ComparisonSpec,
	byArtwork: ReadonlyMap<string, readonly EntryScore[]>,
	artworks: readonly ArtworkRecord[],
	arm: EnergyArm,
	lambda: number,
	stratum: Stratum | "all",
	selection: "best-of-side" | "all-pairs",
): PairedComparison {
	const key = lambdaKey(lambda)
	const rows: PairRow[] = []
	let wins = 0
	let losses = 0
	let ties = 0
	let contributing = 0

	for (const artwork of artworks) {
		if (stratum !== "all" && artwork.stratum !== stratum) continue
		const left = sideEntries(byArtwork, artwork.artworkSha, spec.leftTiers)
		const right = sideEntries(byArtwork, artwork.artworkSha, spec.rightTiers)
		if (left.length === 0 || right.length === 0) continue
		contributing += 1

		const emit = (a: EntryScore, b: EntryScore): void => {
			const leftTotal = a[arm].totals[key]
			const rightTotal = b[arm].totals[key]
			const outcome = outcomeOf(leftTotal, rightTotal)
			if (outcome === "left-lower") wins += 1
			else if (outcome === "right-lower") losses += 1
			else ties += 1
			rows.push({
				artworkSha: artwork.artworkSha,
				imagePath: artwork.imagePath,
				stratum: artwork.stratum,
				explainedMassFraction: artwork.explainedMassFraction,
				leftEntryId: a.entryId,
				rightEntryId: b.entryId,
				leftTotal,
				rightTotal,
				leftCandidates: left.length,
				rightCandidates: right.length,
				outcome,
			})
		}

		if (selection === "best-of-side") {
			emit(bestOfSide(left, arm, lambda), bestOfSide(right, arm, lambda))
		} else {
			for (const a of left) for (const b of right) emit(a, b)
		}
	}

	const trials = wins + losses
	const independence =
		selection === "best-of-side"
			? ({ trialsAreDistinctUnits: true } as const)
			: ({ trialsAreDistinctUnits: false, distinctUnits: contributing } as const)
	const alternativeSpec =
		spec.alternative === "greater"
			? ({ alternative: "greater", directionFixedInAdvance: PREREGISTRATION_REFERENCE } as const)
			: ({ alternative: "two-sided" } as const)

	return {
		id: `${spec.id}|${arm}|lambda=${lambda}|stratum=${stratum}|${selection}`,
		label: spec.label,
		selection,
		leftTiers: spec.leftTiers,
		rightTiers: spec.rightTiers,
		arm,
		lambda,
		stratum,
		artworks: contributing,
		counts: { wins, losses, ties },
		rows,
		test: exactBinomialTest({
			...alternativeSpec,
			...independence,
			successes: wins,
			trials,
			nullProbability: 0.5,
		}),
		interval: wilsonInterval(wins, trials),
	}
}
