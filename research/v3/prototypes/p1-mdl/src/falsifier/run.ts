/**
 * # M1 — the pre-registered falsifier run
 *
 * ```sh
 * cd research/v3
 * NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *   prototypes/p1-mdl/src/falsifier/run.ts --as-of=2026-08-04
 * ```
 *
 * Loads the three legacy tiers, measures each distinct artwork **once**, scores every convertible
 * entry with both energies, resolves the λ grid algebraically (`score.ts`), and runs the comparisons
 * `compare.ts` documents. Writes `data/falsifier/m1-results.json` (every entry, every pair) and
 * `data/falsifier/m1-summary.json` (the table).
 *
 * ## What this program does not do
 *
 * It does not concatenate the tiers (`loadLegacyTiers` returns a record keyed by tier and this file
 * only ever reads it through named tiers), it does not fill in a missing field (entries that do not
 * convert are counted and dropped, never defaulted — `toConfiguration`'s refusal is honoured), and it
 * does not print a proportion that did not come out of `src/stats`. There is no threshold in here
 * that anything is compared against except `DEGENERATE_EXPLAINED_MASS_BELOW`, which splits a report
 * table and is inherited from the M1 brief; the full per-artwork distribution is written out so the
 * cut can be moved by a reader without re-running anything.
 *
 * ## Arguments
 *
 * - `--as-of=YYYY-MM-DD` **required.** The date the run is being reported as of. `CONVENTIONS.md`
 *   wants a quoted corpus count to carry the moment it was measured, and a clock read inside the
 *   program would make the output non-reproducible; so it is an argument, not a `Date.now()`.
 * - `--limit-artworks=N` optional, for smoke runs. Recorded in the header, and the header says the
 *   run is partial, because a truncated denominator that does not announce itself is the failure this
 *   whole prototype's statistics module exists to prevent.
 * - `--out-dir=PATH` optional, defaults to `prototypes/p1-mdl/data/falsifier`.
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	honestLine,
	sweepThenTest,
	type SweepCell,
	type SweepResult,
} from "../../../../src/stats/index.ts"
import {
	censusOfTier,
	LEGACY_TIERS,
	loadLegacyTiers,
	toConfiguration,
	type LegacyEntry,
	type LegacyTier,
} from "../emit/legacy.ts"
import { PROTOTYPE_ROOT } from "../emit/paths.ts"
import { MEASUREMENT_SCHEMA_VERSION, PREPROCESSING_VERSION } from "../measure/constants.ts"
import { measureImage } from "../measure/index.ts"
import { ENERGY_A_VERSION } from "../energy/a/constants.ts"
import { pairedComparison, type ComparisonSpec, type PairedComparison } from "./compare.ts"
import { checkLambdaAlgebra, scoreEntry } from "./score.ts"
import {
	DEGENERATE_EXPLAINED_MASS_BELOW,
	ENERGY_ARMS,
	LAMBDA_GRID,
	type ArtworkRecord,
	type EnergyArm,
	type EntryScore,
	type Stratum,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// The comparison plan, written down before it is run
// ---------------------------------------------------------------------------------------------

/**
 * `(a)` of the M1 brief, and the DESIGN.md sentence it operationalises.
 *
 * `good-vs-known-bad` is the **primary** comparison: the brief defines the good tier as *"endorsed or
 * acceptable"*. `endorsed-vs-known-bad` is DESIGN.md's literal wording, run as well because the two
 * are not the same claim and the literal one is the one that was pre-registered in the design spec.
 */
const COMPARISON_A: readonly ComparisonSpec[] = [
	{
		id: "a-good-vs-known-bad",
		label: "good tier (endorsed ∪ acceptable) lower in energy than known-bad, same artwork",
		leftTiers: ["endorsed", "acceptable"],
		rightTiers: ["known-bad"],
		alternative: "greater",
	},
	{
		id: "a-endorsed-vs-known-bad",
		label: "endorsed lower in energy than known-bad, same artwork (DESIGN.md M1 verbatim)",
		leftTiers: ["endorsed"],
		rightTiers: ["known-bad"],
		alternative: "greater",
	},
]

/** `(b)` of the M1 brief: the two other tier orderings, on the artworks that carry both. */
const COMPARISON_B: readonly ComparisonSpec[] = [
	{
		id: "b-endorsed-vs-acceptable",
		label: "endorsed vs acceptable, same artwork (two-sided: no pre-registered direction)",
		leftTiers: ["endorsed"],
		rightTiers: ["acceptable"],
		alternative: "two-sided",
	},
	{
		id: "b-acceptable-vs-known-bad",
		label: "acceptable lower in energy than known-bad, same artwork",
		leftTiers: ["acceptable"],
		rightTiers: ["known-bad"],
		alternative: "greater",
	},
]

/** The primary comparison's id, so the summary cannot silently promote a different one. */
const PRIMARY_COMPARISON_ID = "a-good-vs-known-bad"

/**
 * Significance level for the corrected verdicts.
 *
 * `[INHERITED]` — the conventional 0.05, required as an argument by `sweepThenTest`. It is a
 * reporting threshold, not a model parameter: no energy, no configuration and no λ depends on it.
 */
const ALPHA = 0.05

/** How many entries get their λ algebra re-checked against a direct re-evaluation. */
const LAMBDA_ALGEBRA_CHECK_ENTRIES = 6

/** The λ used for that check — deliberately one the sweep also uses, so a mismatch is a real mismatch. */
const LAMBDA_ALGEBRA_CHECK_LAMBDA = 4

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

type Args = Readonly<{ asOf: string; limitArtworks: number | null; outDir: string }>

function parseArgs(argv: readonly string[]): Args {
	let asOf: string | null = null
	let limitArtworks: number | null = null
	let outDir = join(PROTOTYPE_ROOT, "data", "falsifier")
	for (const argument of argv) {
		const [name, value] = argument.split("=", 2)
		if (name === "--as-of") asOf = value ?? null
		else if (name === "--limit-artworks") limitArtworks = Number(value)
		else if (name === "--out-dir") outDir = value ?? outDir
		else throw new Error(`unknown argument: ${argument}`)
	}
	if (asOf === null || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
		throw new Error("--as-of=YYYY-MM-DD is required (the run's reporting date; not read from a clock)")
	}
	if (limitArtworks !== null && (!Number.isInteger(limitArtworks) || limitArtworks <= 0)) {
		throw new Error("--limit-artworks must be a positive integer")
	}
	return { asOf, limitArtworks, outDir }
}

function gitState(): { commit: string; dirty: boolean } {
	const run = (args: string[]): string =>
		execFileSync("git", args, { cwd: PROTOTYPE_ROOT, encoding: "utf8" }).trim()
	try {
		return { commit: run(["rev-parse", "HEAD"]), dirty: run(["status", "--porcelain"]) !== "" }
	} catch {
		return { commit: "unavailable", dirty: false }
	}
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/** Every convertible entry, grouped by the artwork's content hash. Insertion order is tier order. */
function groupConvertibleEntries(): {
	byArtwork: Map<string, LegacyEntry[]>
	dropped: { entryId: string; tier: LegacyTier; reason: string }[]
	unresolved: { entryId: string; tier: LegacyTier; imagePath: string }[]
} {
	const tiers = loadLegacyTiers()
	const byArtwork = new Map<string, LegacyEntry[]>()
	const dropped: { entryId: string; tier: LegacyTier; reason: string }[] = []
	const unresolved: { entryId: string; tier: LegacyTier; imagePath: string }[] = []
	for (const tier of LEGACY_TIERS) {
		for (const entry of tiers[tier].entries) {
			const conversion = toConfiguration(entry)
			if (!conversion.ok) {
				dropped.push({ entryId: entry.entryId, tier, reason: conversion.reason })
				continue
			}
			if (entry.resolvedImagePath === null) {
				unresolved.push({ entryId: entry.entryId, tier, imagePath: entry.artwork.imagePath })
				continue
			}
			const key = entry.artwork.contentSha256
			const bucket = byArtwork.get(key)
			if (bucket === undefined) byArtwork.set(key, [entry])
			else bucket.push(entry)
		}
	}
	return { byArtwork, dropped, unresolved }
}

function stratumOf(explained: number): Stratum {
	return explained < DEGENERATE_EXPLAINED_MASS_BELOW ? "degenerate" : "structured"
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2))
	const startedAt = Date.now()
	const git = gitState()

	const tiers = loadLegacyTiers()
	const census = LEGACY_TIERS.map((tier) => censusOfTier(tiers[tier]))
	const { byArtwork, dropped, unresolved } = groupConvertibleEntries()

	// Artworks are visited in ascending sha order so the run is a function of the fixtures and not of
	// Map insertion order. It changes nothing about the results; it makes the log reproducible.
	const artworkKeys = [...byArtwork.keys()].sort()
	const selectedKeys = args.limitArtworks === null ? artworkKeys : artworkKeys.slice(0, args.limitArtworks)

	const scores: EntryScore[] = []
	const scoresByArtwork = new Map<string, EntryScore[]>()
	const artworks: ArtworkRecord[] = []
	const algebraDeviations: { entryId: string; p1a: number; p1ap: number }[] = []
	const measurementFailures: { artworkSha: string; imagePath: string; error: string }[] = []
	let measured = 0

	for (const sha of selectedKeys) {
		const entries = byArtwork.get(sha) as LegacyEntry[]
		const first = entries[0]
		let measurement
		try {
			// One measurement per distinct artwork, released as soon as the artwork's entries are scored.
			// Caching all 197 in a Map would hold ~1 GB of typed arrays for no benefit: nothing after this
			// loop reads a Measurement.
			measurement = await measureImage(first.resolvedImagePath as string)
		} catch (error) {
			measurementFailures.push({
				artworkSha: sha,
				imagePath: first.artwork.imagePath,
				error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			})
			continue
		}
		measured += 1

		const artworkScores: EntryScore[] = []
		for (const entry of entries) {
			const score = scoreEntry(entry, measurement)
			artworkScores.push(score)
			scores.push(score)
			if (algebraDeviations.length < LAMBDA_ALGEBRA_CHECK_ENTRIES) {
				algebraDeviations.push({
					entryId: entry.entryId,
					...checkLambdaAlgebra(entry, measurement, score, LAMBDA_ALGEBRA_CHECK_LAMBDA),
				})
			}
		}
		scoresByArtwork.set(sha, artworkScores)

		let explained = 0
		for (const score of artworkScores) {
			if (score.explainedMassFraction > explained) explained = score.explainedMassFraction
		}
		artworks.push({
			artworkSha: sha,
			imagePath: first.artwork.imagePath,
			entryIds: artworkScores.map((score) => score.entryId),
			tiers: [...new Set(artworkScores.map((score) => score.tier))],
			explainedMassFraction: explained,
			stratum: stratumOf(explained),
		})

		process.stderr.write(
			`  [${measured}/${selectedKeys.length}] ${sha.slice(0, 8)} ${measurement.source.width}x${measurement.source.height} K=${measurement.triples.colorCount} entries=${entries.length} t=${((Date.now() - startedAt) / 1000).toFixed(0)}s\n`,
		)
	}

	// --- the comparisons ------------------------------------------------------------------------
	const comparisons: PairedComparison[] = []
	const run = (
		spec: ComparisonSpec,
		stratum: Stratum | "all",
		selection: "best-of-side" | "all-pairs",
	): void => {
		for (const arm of ENERGY_ARMS) {
			for (const lambda of LAMBDA_GRID) {
				comparisons.push(
					pairedComparison(spec, scoresByArtwork, artworks, arm, lambda, stratum, selection),
				)
			}
		}
	}
	for (const spec of [...COMPARISON_A, ...COMPARISON_B]) run(spec, "all", "best-of-side")
	const primary = COMPARISON_A[0]
	for (const stratum of ["degenerate", "structured"] as const) run(primary, stratum, "best-of-side")
	run(primary, "all", "all-pairs")

	// --- multiplicity ---------------------------------------------------------------------------
	const cellOf = (comparison: PairedComparison): SweepCell | null =>
		comparison.test.ok
			? {
					id: comparison.id,
					pValue: comparison.test.pValue,
					label: `${comparison.label} — ${comparison.counts.wins}W/${comparison.counts.losses}L/${comparison.counts.ties}T`,
				}
			: null

	const primaryCells = comparisons
		.filter(
			(comparison) =>
				comparison.id.startsWith(`${PRIMARY_COMPARISON_ID}|`) &&
				comparison.stratum === "all" &&
				comparison.selection === "best-of-side",
		)
		.map(cellOf)
		.filter((cell): cell is SweepCell => cell !== null)

	const allCells = comparisons.map(cellOf).filter((cell): cell is SweepCell => cell !== null)

	const primarySweep: SweepResult = sweepThenTest(primaryCells, {
		comparisonsRun: ENERGY_ARMS.length * LAMBDA_GRID.length,
		correction: "holm",
		alpha: ALPHA,
		familyDefinition: `the pre-registered M1 comparison (a): ${PRIMARY_COMPARISON_ID}, ${ENERGY_ARMS.length} energies × ${LAMBDA_GRID.length} λ, best-of-side, all artworks`,
	})
	const fullSweep: SweepResult = sweepThenTest(allCells, {
		comparisonsRun: comparisons.length,
		correction: "holm",
		alpha: ALPHA,
		familyDefinition: `every binomial test this run performed: ${comparisons.length} cells over 4 tier comparisons × 2 energies × 5 λ, plus 2 strata of the primary comparison and its all-pairs reading`,
	})

	// --- output -----------------------------------------------------------------------------------
	const elapsedSeconds = (Date.now() - startedAt) / 1000
	const header = {
		milestone: "M1",
		prototype: "p1-mdl",
		asOf: args.asOf,
		gitCommit: git.commit,
		gitWorkingTreeDirty: git.dirty,
		partialRun: args.limitArtworks !== null,
		limitArtworks: args.limitArtworks,
		elapsedSeconds,
		lambdaGrid: LAMBDA_GRID,
		alpha: ALPHA,
		degenerateExplainedMassBelow: DEGENERATE_EXPLAINED_MASS_BELOW,
		codeVersions: {
			measurement: MEASUREMENT_SCHEMA_VERSION,
			preprocessing: PREPROCESSING_VERSION,
			energyA: ENERGY_A_VERSION,
			// Arm A′ exports no version constant; `gitCommit` is what pins it, and saying so beats
			// inventing a string here that nothing else in the tree would agree with.
			energyAPrime: "no version constant exported by src/energy/aprime; pinned by gitCommit",
		},
		nodeVersion: process.version,
		census,
		entriesScored: scores.length,
		artworksMeasured: measured,
		artworksSelected: selectedKeys.length,
		artworksConvertibleTotal: artworkKeys.length,
		droppedNotConvertible: dropped.length,
		droppedImageUnresolved: unresolved.length,
		measurementFailures,
		lambdaAlgebraCheck: {
			lambda: LAMBDA_ALGEBRA_CHECK_LAMBDA,
			entriesChecked: algebraDeviations.length,
			maxAbsoluteDeviationP1a: algebraDeviations.reduce((max, row) => Math.max(max, row.p1a), 0),
			maxAbsoluteDeviationP1ap: algebraDeviations.reduce((max, row) => Math.max(max, row.p1ap), 0),
			note:
				"the λ sweep is read off total(λ) = dataPart + λ·structuralPart rather than re-evaluated; " +
				"these are the deviations of that reading from a direct re-evaluation at the stated λ",
		},
	}

	const strataCensus = {
		degenerate: artworks.filter((artwork) => artwork.stratum === "degenerate").length,
		structured: artworks.filter((artwork) => artwork.stratum === "structured").length,
	}

	mkdirSync(args.outDir, { recursive: true })
	writeFileSync(
		join(args.outDir, "m1-results.json"),
		`${JSON.stringify(
			{
				header,
				strataCensus,
				artworks,
				dropped,
				unresolved,
				entries: scores,
				comparisons,
				primarySweep,
				fullSweep,
			},
			null,
			"\t",
		)}\n`,
	)

	const summaryRow = (comparison: PairedComparison) => ({
		id: comparison.id,
		comparison: comparison.id.split("|")[0],
		label: comparison.label,
		arm: comparison.arm,
		lambda: comparison.lambda,
		stratum: comparison.stratum,
		selection: comparison.selection,
		artworks: comparison.artworks,
		wins: comparison.counts.wins,
		losses: comparison.counts.losses,
		ties: comparison.counts.ties,
		// Rates and intervals only ever come from `src/stats`; `summary` is the module's own line and
		// carries the refusal text unchanged when the test declined to produce a number.
		result: comparison.test.summary,
		refused: !comparison.test.ok,
		honest: honestLine(comparison.test),
		interval: comparison.interval.summary,
		intervalRefused: !comparison.interval.ok,
	})

	// The summary drops the per-tier census block and the per-artwork failure list — both live in
	// `m1-results.json` in full — and keeps their counts, so the summary never reports a denominator
	// it cannot account for.
	const { census: _census, measurementFailures: _failures, ...summaryHeader } = header

	writeFileSync(
		join(args.outDir, "m1-summary.json"),
		`${JSON.stringify(
			{
				header: { ...summaryHeader, measurementFailures: measurementFailures.length },
				strataCensus,
				explainedMassQuantiles: quantiles(artworks.map((artwork) => artwork.explainedMassFraction)),
				primaryComparisonId: PRIMARY_COMPARISON_ID,
				table: comparisons.map(summaryRow),
				primarySweep: primarySweep.ok
					? { summary: primarySweep.summary, cells: primarySweep.cells, best: primarySweep.best }
					: { refused: primarySweep.reason, summary: primarySweep.summary },
				fullSweep: fullSweep.ok
					? { summary: fullSweep.summary, cells: fullSweep.cells, best: fullSweep.best }
					: { refused: fullSweep.reason, summary: fullSweep.summary },
			},
			null,
			"\t",
		)}\n`,
	)

	process.stderr.write(`\nM1 falsifier: ${scores.length} entries over ${measured} artworks in ${elapsedSeconds.toFixed(1)}s\n`)
	process.stderr.write(`strata: ${strataCensus.degenerate} degenerate / ${strataCensus.structured} structured\n`)
	for (const comparison of comparisons) {
		if (comparison.stratum !== "all" || comparison.selection !== "best-of-side") continue
		process.stderr.write(`${comparison.id}: ${honestLine(comparison.test)}\n`)
	}
	process.stderr.write(`\nprimary family: ${primarySweep.summary}\n`)
	process.stderr.write(`full family:    ${fullSweep.summary}\n`)
	process.stderr.write(`written to ${args.outDir}\n`)
}

/** Deciles of a sample, so a reader can move the degeneracy cut without re-running the measurement. */
function quantiles(values: readonly number[]): Record<string, number> | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((left, right) => left - right)
	const at = (fraction: number): number =>
		sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]
	const out: Record<string, number> = {}
	for (let decile = 0; decile <= 10; decile += 1) out[`p${decile * 10}`] = at(decile / 10)
	return out
}

await main()
