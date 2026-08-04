/**
 * The contract validator's **report mode** (build item 21).
 *
 * `validatePalette` answers one question — is this palette valid — and answers it as a verdict. That
 * is the right shape for a gate and the wrong shape for everything else a reader wants:
 *
 * - *Which invariants did this palette actually exercise?* A verdict cannot say. A palette validated
 *   without a `source` never ran invariant 2, and `valid: true` looks identical either way.
 * - *How close was it?* A palette clearing every floor by 0.0001 and one clearing them by 40 are the
 *   same `valid: true`, and they are not the same palette. Across a corpus, the distribution of
 *   margins is the thing that says whether a threshold is doing work or is set where nothing lives.
 * - *What did the report-only clauses measure?* Since 2026-08-04 the source-support population floor
 *   is computed and never enforced (see `validateSourceSupport`). A verdict has nowhere to put it.
 *
 * So: same checks, same thresholds, same code path — different output. `scorePalette` runs
 * `validatePalette` with an observation sink attached and folds the result into a per-invariant
 * scorecard.
 *
 * ## Hard mode is untouched, and that is a requirement not a courtesy
 *
 * `validatePalette` keeps its signature, its default behaviour, and its verdict. It is the gate; a
 * reporting mode that could change a gate's answer would be a way to argue with the gate. The
 * scorecard carries `valid`, and it is the *same* boolean hard mode returns — computed by hard mode,
 * not recomputed here.
 *
 * ## Why no near-miss threshold is invented here
 *
 * The obvious API would be `status: "pass" | "near-miss" | "fail"` with some cutoff deciding what
 * counts as near. There is no such cutoff in evidence, and inventing one would put an unanchored
 * constant into the contract — in the same repo whose second success criterion is not doing that,
 * and in the same week the honesty census counted 4,231 untagged sites.
 *
 * So the scorecard reports the **margin** and lets the caller draw the line. `nearMissMargin` is the
 * tightest margin among the checks that passed: the amount by which this palette was not a
 * violation. A caller wanting a band passes one to `nearMissBand`; nothing here has an opinion about
 * what it should be.
 *
 * ## What the margins are not
 *
 * Margins are **not comparable across invariants**. Invariant 3's are OKLab distances, invariant 4's
 * are raw APCA magnitudes, invariant 2's are population fractions. Each observation names its
 * `quantity`, and nothing here ever pools two of them into one number — a "tightest margin overall"
 * would be a units error with a confident face.
 */

import {
	CHALLENGER_NOTE,
	tallyChallengers,
	type ChallengerComparison,
	type ChallengerTally,
} from "./challengers.ts"
import { validatePalette, type InvariantObservation, type ValidatePaletteOptions } from "./invariants.ts"
import type { Palette, ValidationResult, Violation } from "./types.ts"

/**
 * Per-invariant outcome.
 *
 * `deferred` and `not-exercised` are deliberately distinct from `pass`. An invariant that could not
 * run is the single most dangerous thing to report as passing — it is the defect
 * `reviews/phase-0-adversarial/contract.md` finding 5 found in invariant 5, where omitting an option
 * silently returned `valid: true` for a check that never ran.
 */
export type InvariantStatus =
	/** Ran, judged something, nothing failed. */
	| "pass"
	/** Ran and produced at least one violation. */
	| "fail"
	/** Could not run: its input was not supplied. Named in `deferred`. */
	| "deferred"
	/** Ran but had nothing to judge — e.g. invariant 3 on a palette invariant 1 already condemned. */
	| "not-exercised"

/** An observation, trimmed to what a scorecard reader needs. */
export interface MarginRecord {
	check: string
	subjects: readonly string[]
	quantity: InvariantObservation["quantity"]
	measured: number
	bar: number
	margin: number
	escape?: string
}

export interface InvariantScore {
	invariant: Violation["invariant"]
	status: InvariantStatus
	/** How many numeric judgments this invariant made on this palette. */
	judgments: number
	violations: number
	/** Violation codes that fired, with counts, sorted by code. */
	codes: { code: string; count: number }[]
	/**
	 * The tightest **passing** margin — how close this palette came to violating this invariant.
	 * `null` when nothing passed, or when nothing numeric was judged.
	 *
	 * A negative margin here is not a contradiction: it means the check passed via a named `escape`
	 * (currently only the accent's functional-distance clause) while below its bar.
	 */
	nearMissMargin: MarginRecord | null
	/** The worst failing margin — how badly. `null` when nothing failed. */
	worstFailureMargin: MarginRecord | null
	/**
	 * Quantities computed for the record that can never make a palette invalid. The population floor
	 * lives here since the reviewer's 2026-08-04 ruling.
	 */
	reportOnly: MarginRecord[]
	/** Deferred check names belonging to this invariant, verbatim from `ValidationResult.deferred`. */
	deferred: string[]
	/** Set when a caller supplied `nearMissBand` and this invariant's tightest pass falls inside it. */
	withinNearMissBand?: boolean
}

export interface Scorecard {
	/** The verdict hard mode returned. Carried, never recomputed. */
	valid: boolean
	invariants: InvariantScore[]
	/**
	 * **How the report-only challengers did against the frozen same-colour bar on this palette.**
	 *
	 * `[PROVISIONAL — perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement
	 * counter]` — see `challengers.ts`. This is the counter the reviewer's sign-off makes the
	 * deciding instrument: the confirming round is deferred, and whether it ever runs is a question
	 * about how often these two rules and the frozen one part company on real palettes.
	 *
	 * It sits beside `valid` and has no path to it. `valid` above is the boolean hard mode computed
	 * from the frozen bars; every number here is derived from observations that were emitted after
	 * that boolean was already decided. Read `challengerNote` before quoting a total — both bars
	 * were measured in `dark-neutral` only.
	 */
	challengers: readonly ChallengerTally[]
	/** The caveat that belongs in the same breath as the counts. Verbatim `CHALLENGER_NOTE`. */
	challengerNote: string
	totals: {
		judgments: number
		violations: number
		invariantsRun: number
		invariantsDeferred: number
		invariantsFailed: number
	}
	/** Every violation, unchanged, so a scorecard reader never has to re-run hard mode to see them. */
	violations: readonly Violation[]
	deferred: readonly string[]
	note: string
}

/** The five invariants, in the order a scorecard lists them. */
const INVARIANT_ORDER: readonly Violation["invariant"][] = ["I1", "I2", "I3", "I4", "I5"]

export type ScorecardOptions = ValidatePaletteOptions & {
	/**
	 * Optional per-quantity bands for flagging a pass as a near miss. Entirely the caller's
	 * judgment — there is no default, because there is no measured value to default to.
	 *
	 * Example: `{ "apca-raw-magnitude": 1.0 }` flags any palette that cleared a contrast floor by
	 * less than 1.0 raw APCA.
	 */
	nearMissBand?: Partial<Record<InvariantObservation["quantity"], number>>
}

function toRecord(observation: InvariantObservation): MarginRecord {
	return {
		check: observation.check,
		subjects: observation.subjects,
		quantity: observation.quantity,
		measured: observation.measured,
		bar: observation.bar,
		margin: observation.margin,
		...(observation.escape ? { escape: observation.escape } : {}),
	}
}

/**
 * Which invariant a deferred name belongs to. The names are `I<n>.<what>` by convention
 * (`DEFERRED_SPATIAL_SPREAD`, `DEFERRED_TRANSPARENCY_REPORT`, `"I2.source-support"`).
 */
function invariantOfDeferred(name: string): Violation["invariant"] | null {
	const prefix = name.split(".")[0]
	return (INVARIANT_ORDER as readonly string[]).includes(prefix)
		? (prefix as Violation["invariant"])
		: null
}

/**
 * Run every invariant and return a scorecard instead of a verdict.
 *
 * Identical checks to `validatePalette` — this *calls* it — so a palette can never score differently
 * from how it validates. `result` is returned alongside for callers that want both without paying
 * for two passes.
 */
export function scorePalette(
	palette: Palette,
	options: ScorecardOptions = {},
): { scorecard: Scorecard; result: ValidationResult } {
	const observations: InvariantObservation[] = []
	const { nearMissBand, ...validateOptions } = options

	const result = validatePalette(palette, {
		...validateOptions,
		observe: (observation) => observations.push(observation),
	})

	const invariants: InvariantScore[] = INVARIANT_ORDER.map((invariant) => {
		const own = observations.filter((o) => o.invariant === invariant)
		const enforced = own.filter((o) => o.reportOnly !== true)
		const reportOnly = own.filter((o) => o.reportOnly === true)
		const failures = result.violations.filter((v) => v.invariant === invariant)
		const deferred = result.deferred.filter((name) => invariantOfDeferred(name) === invariant)

		const codes = [...failures.reduce((map, v) => map.set(v.code, (map.get(v.code) ?? 0) + 1), new Map<string, number>())]
			.map(([code, count]) => ({ code, count }))
			.sort((a, b) => a.code.localeCompare(b.code))

		// Tightest pass and worst failure, by margin. Ties break on the first observation, which is
		// deterministic because the checks emit in a fixed order.
		const passes = enforced.filter((o) => o.passed)
		const fails = enforced.filter((o) => !o.passed)
		const tightest = passes.reduce<InvariantObservation | null>(
			(best, o) => (best === null || o.margin < best.margin ? o : best),
			null,
		)
		const worst = fails.reduce<InvariantObservation | null>(
			(best, o) => (best === null || o.margin < best.margin ? o : best),
			null,
		)

		let status: InvariantStatus
		if (failures.length > 0) status = "fail"
		else if (deferred.length > 0 && enforced.length === 0) status = "deferred"
		else if (enforced.length === 0 && reportOnly.length === 0) status = "not-exercised"
		else status = "pass"

		const band = tightest ? nearMissBand?.[tightest.quantity] : undefined

		return {
			invariant,
			status,
			judgments: enforced.length,
			violations: failures.length,
			codes,
			nearMissMargin: tightest ? toRecord(tightest) : null,
			worstFailureMargin: worst ? toRecord(worst) : null,
			reportOnly: reportOnly.map(toRecord),
			deferred,
			...(band !== undefined && tightest ? { withinNearMissBand: tightest.margin < band } : {}),
		}
	})

	// The challenger fold. Every comparison the distinctness matrix emitted, tallied per challenger.
	// Note this reads `observations` — the sink's contents — and never `result`, so there is no code
	// path by which a tally could reach the verdict even if someone later edited this function.
	const comparisons = observations
		.map((observation) => observation.challengers)
		.filter((comparison): comparison is ChallengerComparison => comparison !== undefined)

	return {
		scorecard: {
			valid: result.valid,
			invariants,
			challengers: tallyChallengers(comparisons),
			challengerNote: CHALLENGER_NOTE,
			totals: {
				judgments: invariants.reduce((n, i) => n + i.judgments, 0),
				violations: result.violations.length,
				invariantsRun: invariants.filter((i) => i.status === "pass" || i.status === "fail").length,
				invariantsDeferred: invariants.filter((i) => i.status === "deferred").length,
				invariantsFailed: invariants.filter((i) => i.status === "fail").length,
			},
			violations: result.violations,
			deferred: result.deferred,
			note: "Report mode (src/contract/scorecard.ts, build item 21). Same checks and same thresholds as validatePalette, which computes `valid` — this never recomputes it. Margins are in the units named by each record's `quantity` and are never comparable across invariants. A negative nearMissMargin means the check passed via a named escape while below its bar.",
		},
		result,
	}
}
