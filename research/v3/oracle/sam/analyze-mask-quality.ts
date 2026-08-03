/**
 * Calibrate `config.py` `SCORE_THRESHOLD` from the released `sam-mask-quality-1` round.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/oracle/sam/analyze-mask-quality.ts [--warehouse PATH] [--write]
 *
 * The round showed the reviewer 60 overlays and asked, once per concept, "is this a correct
 * <concept> mask?" (yes / no / partly). The scores were kept out of everything the reviewer could
 * see; they live in `data/sam/mask-quality-sample.json`. This script performs the join those two
 * halves were built for and answers three questions:
 *
 *   1. **What threshold separates yes from no?** A sweep over every observed score, scored by
 *      Youden's J, with `partly` reported separately and never silently folded into either side.
 *   2. **Do the concept groups need different thresholds?** The same sweep per group, adopted only
 *      if the groups genuinely separate — two numbers where one would do is a liability. The group
 *      whose own optimum defines the pooled cut abstains rather than vetoing (it gains zero by
 *      construction), and any number of groups is handled, not exactly two.
 *   3. **What happens to the big-area class?** Every judged mask over the area bar is named
 *      individually — not only the force-included ones, which are *defined* to score below 0.5 and
 *      so can never contradict a cut at or above it — with an explicit verdict on whether a score
 *      cut can remove them at all and what an area guard would cost.
 *
 * Fixes 2 and 3 are the phase-0 adversarial review's findings 1, 2 and 7
 * (`research/v3/reviews/phase-0-adversarial/sam.md`), applied 2026-08-03.
 *
 * Nothing here writes to the warehouse or to `config.py`. Raising `SCORE_THRESHOLD` is the
 * reviewer's edit (PHASE_0_LOOSE_ENDS.md A6); this produces the number and the evidence for it.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	SAM_MASK_QUALITY_BATCH_ID,
	SAM_MASK_QUALITY_SAMPLE_PATH,
	questionKeyFor,
	readMaskSample,
	type MaskSampleEntry,
	type MaskSampleManifest,
} from "../../src/review-server/sam-mask-quality.ts"
import type { OracleLabelRecord, WarehouseRecord } from "../../src/warehouse/records.ts"
import { readAll, resolve } from "../../src/warehouse/warehouse.ts"

/* ------------------------------------------------------------------------------------------- */
/* Constants                                                                                     */
/* ------------------------------------------------------------------------------------------- */

export const ANALYSIS_VERSION = "sam-mask-quality-analysis.v1"

export const ANALYSIS_JSON_PATH = fileURLToPath(new URL("../../data/sam/mask-quality-analysis.json", import.meta.url))
export const ANALYSIS_TEXT_PATH = fileURLToPath(new URL("../../data/sam/mask-quality-analysis.txt", import.meta.url))
export const EVAL_RUN_PATH = fileURLToPath(new URL("../../data/sam/sam-eval-142.jsonl", import.meta.url))

/**
 * The three answers, and which side of the separation each one counts on.
 *
 * `partly` is deliberately absent from both sides in the primary treatment. Two sensitivity
 * treatments fold it each way, and if they disagree about the recommended threshold that
 * disagreement is the finding — not something to average away.
 * [REVIEWED] — the round's answer vocabulary.
 */
export const POSITIVE_ANSWER = "yes"
export const NEGATIVE_ANSWER = "no"
export const MIDDLE_ANSWER = "partly"
export type PartlyTreatment = "excluded" | "positive" | "negative"
export const PARTLY_TREATMENTS: readonly PartlyTreatment[] = ["excluded", "positive", "negative"]

/**
 * How the sweep picks a winner: Youden's J (sensitivity + specificity - 1).
 *
 * Not accuracy, and not F1. Accuracy follows whichever class the sample happens to hold more of,
 * and this sample is stratified — its class balance is a design choice, not a fact about the
 * corpus. J is invariant to that balance, which is exactly what a stratified sample needs.
 * [REVIEWED] — standard for threshold selection on a stratified sample.
 */
export const SELECTION_CRITERION = "youden_j"

/**
 * Ties in J go to the **lower** threshold.
 *
 * `config.py` states the asymmetry plainly: "Raising this later is free; lowering it means
 * re-running." A threshold that is too low costs a SQL predicate; one that is too high costs a GPU
 * run. When two thresholds are equally good on the evidence, take the cheap mistake.
 * [REVIEWED] — `oracle/sam/config.py` SCORE_THRESHOLD rationale.
 */
export const TIE_BREAK = "lowest_threshold"

/**
 * When two per-group thresholds are worth having instead of one.
 *
 * Both bars must clear: the two numbers must actually differ, and each group must be measurably
 * better off under its own threshold than under the pooled one. Otherwise the pooled threshold
 * wins, because a second constant is a second thing to keep calibrated.
 * [UNCALIBRATED] — chosen here; no prior round has measured what separation is meaningful.
 */
export const PER_GROUP_MIN_SEPARATION = 0.05
export const PER_GROUP_MIN_J_GAIN = 0.05

/**
 * How much worse than the pooled cut a group is allowed to be under its own cut.
 *
 * The answer is "none, beyond arithmetic noise". A group's own optimum can never be genuinely
 * worse than the pooled cut on its own rows — it was chosen by maximising J over a candidate set
 * that includes every observed score. This bar exists to say that out loud, and to let a group
 * that is exactly indifferent through.
 * [REVIEWED] — a consequence of how the optimum is chosen, not a tunable.
 */
export const PER_GROUP_MAX_J_LOSS = 1e-9

/**
 * Area fraction above which a region is rejected regardless of its score.
 *
 * Mirrors `config.py` `CALIBRATED_MAX_AREA_FRACTION`, and is the same number the sampler used to
 * define the "hallucination signature". Kept as a constant here so the analysis can report what
 * the guard buys instead of asserting that none is needed.
 *
 * THE MIRROR IS NO LONGER EXACT, DELIBERATELY (2026-08-04). The Python side now scopes the guard
 * OFF for the concept groups in `config.GUARD_EXEMPT_GROUPS` — today `person_like` only, from mask
 * round 3's census of loose end A6 (6/6 big-area person regions answered "a real thing that fills
 * the cover"). This file applies the guard UNIFORMLY, with no exemption, and that is correct here:
 * round 1's published `guardEffect` numbers are historical and must keep reproducing as published,
 * and round 1's sample contains no big-area `person` mask at all, so an exemption would change
 * nothing in it beyond making it un-reproducible. If a future round recomputes `guardEffect` as a
 * live claim about the instrument's present behaviour rather than as round 1's record, it must
 * mirror `GUARD_EXEMPT_GROUPS` too, or the two sides will drift silently.
 * [MEASURED] — `oracle/sam/config.py` CALIBRATED_MAX_AREA_FRACTION; see the `guardEffect` block.
 */
export const AREA_GUARD_MAX_FRACTION = 0.5

/**
 * Below this many answered rows a cell's rate is reported but never acted on.
 * [UNCALIBRATED] — a rate on four answers has a 95% interval about as wide as the unit interval.
 */
export const MIN_CELL_ANSWERS = 5

/* ------------------------------------------------------------------------------------------- */
/* Reading                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/**
 * The reviewer's final answer per (question, mask row).
 *
 * Same supersession rule every other v3 analysis uses: amendments applied, retracted dropped, and
 * when one item carries several answers the latest wins — the earlier ones are undo-and-answer-
 * again, not extra evidence.
 */
export function collectAnswers(
	records: readonly WarehouseRecord[],
	batchId: string,
): { answers: Map<string, string>; skipped: Record<string, number> } {
	const skipped: Record<string, number> = { otherBatch: 0, machineAuthored: 0, retracted: 0, superseded: 0, nonString: 0 }
	const latest = new Map<string, { answer: string; index: number }>()
	resolve(records).forEach((entry, index) => {
		if (entry.record.type !== "oracle-label") return
		const label = entry.record as OracleLabelRecord
		if (entry.retracted) {
			skipped.retracted++
			return
		}
		if (label.batch?.id !== batchId) {
			skipped.otherBatch++
			return
		}
		if (label.author.kind !== "human") {
			skipped.machineAuthored++
			return
		}
		if (typeof label.answer !== "string") {
			skipped.nonString++
			return
		}
		const key = `${label.questionKey} ${label.imageId}`
		const previous = latest.get(key)
		if (previous !== undefined) skipped.superseded++
		if (previous === undefined || previous.index < index) latest.set(key, { answer: label.answer, index })
	})
	return { answers: new Map([...latest].map(([key, value]) => [key, value.answer])), skipped }
}

/**
 * Population count per (concept, band) over the whole run.
 *
 * The sample is stratified and deliberately not proportional — `letter` is 3,147 of the 4,853
 * region rows and `sticker` is 19, yet the round holds 4 of one and 8 of the other. Every rate is
 * therefore reported twice: unweighted (what the reviewer saw) and inverse-probability weighted
 * (what the run looks like). A threshold chosen on the first and checked on the second is honest;
 * one that only exists in the first is an artefact of the sampling.
 */
export async function readPopulation(
	manifest: MaskSampleManifest,
	path = EVAL_RUN_PATH,
): Promise<Map<string, number>> {
	const text = await readFile(path, "utf8")
	const population = new Map<string, number>()
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as { record_type?: string; concept?: string; score?: number }
		if (row.record_type !== "region" || row.concept === undefined || row.score === undefined) continue
		const band = manifest.scoreBands.find((entry) => row.score! >= entry.low && row.score! < entry.high)
		if (band === undefined) continue
		const key = `${row.concept}|${band.band}`
		population.set(key, (population.get(key) ?? 0) + 1)
	}
	return population
}

/* ------------------------------------------------------------------------------------------- */
/* Statistics                                                                                    */
/* ------------------------------------------------------------------------------------------- */

/** Wilson score interval, 95%. On sixty items a bare proportion is not a number worth quoting. */
export function wilson(successes: number, total: number): { low: number; high: number } | null {
	if (total === 0) return null
	const z = 1.96
	const p = successes / total
	const denominator = 1 + (z * z) / total
	const centre = p + (z * z) / (2 * total)
	const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
	return { low: Math.max(0, (centre - spread) / denominator), high: Math.min(1, (centre + spread) / denominator) }
}

export type Judged = Readonly<{
	itemId: string
	maskRowId: string
	concept: string
	group: string
	band: string
	score: number
	areaFraction: number
	forcedSuspicious: boolean
	answer: string
	weight: number
	artworkPath: string
}>

export type SweepPoint = Readonly<{
	threshold: number
	keptTruePositive: number
	droppedFalseNegative: number
	keptFalsePositive: number
	droppedTrueNegative: number
	precision: number | null
	recall: number | null
	specificity: number | null
	youdenJ: number | null
	f1: number | null
	accuracy: number | null
	/** How many `partly` rows this threshold keeps, always reported, never scored. */
	partlyKept: number
	partlyDropped: number
}>

function metrics(tp: number, fn: number, fp: number, tn: number, partlyKept: number, partlyDropped: number, threshold: number): SweepPoint {
	const precision = tp + fp === 0 ? null : tp / (tp + fp)
	const recall = tp + fn === 0 ? null : tp / (tp + fn)
	const specificity = tn + fp === 0 ? null : tn / (tn + fp)
	const total = tp + fn + fp + tn
	return {
		threshold,
		keptTruePositive: tp,
		droppedFalseNegative: fn,
		keptFalsePositive: fp,
		droppedTrueNegative: tn,
		precision,
		recall,
		specificity,
		youdenJ: recall === null || specificity === null ? null : recall + specificity - 1,
		f1: precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall),
		accuracy: total === 0 ? null : (tp + tn) / total,
		partlyKept,
		partlyDropped,
	}
}

/** Every threshold worth evaluating: each observed score, plus the run's own cut as the floor. */
export function candidateThresholds(rows: readonly Judged[], floor: number): number[] {
	const values = new Set<number>([floor])
	for (const row of rows) values.add(Number(row.score.toFixed(6)))
	// One above the top, so "keep nothing" is on the curve and a degenerate optimum is visible.
	const top = Math.max(floor, ...rows.map((row) => row.score))
	values.add(Number((top + 0.000001).toFixed(6)))
	return [...values].sort((a, b) => a - b)
}

/**
 * `maxAreaFraction` is part of the CLASSIFIER, not of the sample.
 *
 * A mask the area guard drops is a mask the instrument rejected, so it stays in the evaluation and
 * lands in `tn` or `fn` — it is not filtered out of the population. Filtering it out instead would
 * shrink the negative class by exactly the rows the guard gets right and understate what the guard
 * buys (measured on the real round: specificity 0.8824 the right way, 0.8333 the wrong way).
 */
export function sweep(
	rows: readonly Judged[],
	floor: number,
	treatment: PartlyTreatment,
	weighted: boolean,
	maxAreaFraction: number | null = null,
): SweepPoint[] {
	const weightOf = (row: Judged) => (weighted ? row.weight : 1)
	return candidateThresholds(rows, floor).map((threshold) => {
		let tp = 0
		let fn = 0
		let fp = 0
		let tn = 0
		let partlyKept = 0
		let partlyDropped = 0
		for (const row of rows) {
			const kept = row.score >= threshold && (maxAreaFraction === null || row.areaFraction <= maxAreaFraction)
			const weight = weightOf(row)
			let side: "positive" | "negative" | null = null
			if (row.answer === POSITIVE_ANSWER) side = "positive"
			else if (row.answer === NEGATIVE_ANSWER) side = "negative"
			else if (row.answer === MIDDLE_ANSWER) {
				if (kept) partlyKept += weight
				else partlyDropped += weight
				side = treatment === "excluded" ? null : treatment
			}
			if (side === "positive") kept ? (tp += weight) : (fn += weight)
			else if (side === "negative") kept ? (fp += weight) : (tn += weight)
		}
		return metrics(tp, fn, fp, tn, partlyKept, partlyDropped, threshold)
	})
}

/** The sweep's winner: highest J, ties to the lowest threshold. */
export function bestPoint(points: readonly SweepPoint[]): SweepPoint | null {
	let best: SweepPoint | null = null
	for (const point of points) {
		if (point.youdenJ === null) continue
		if (best === null || point.youdenJ > best.youdenJ! + 1e-12) best = point
	}
	return best
}

/**
 * The last swept point at or below a threshold.
 *
 * NOT the metrics *at* that threshold — use `metricsAt` for that. Kept because it is the honest
 * "where does this threshold land on the curve" lookup, but it is the wrong tool for comparing a
 * group against the pooled cut: a group's candidate list holds only its own observed scores, so
 * the pooled cut is usually not on it and this returns a lower point, keeping masks the pooled cut
 * would drop. Measured cost of that mistake on the real round: it reported `text_like`'s J under
 * the pooled cut as 0.402174 (the value at 0.551383, the nearest lower text_like score) instead of
 * 0.358696, understating the gain from a per-group threshold by a third.
 */
export function pointAt(points: readonly SweepPoint[], threshold: number): SweepPoint | null {
	let chosen: SweepPoint | null = null
	for (const point of points) if (point.threshold <= threshold + 1e-12) chosen = point
	return chosen
}

/** The metrics a set of rows actually produces at one exact threshold, on or off the sweep grid. */
export function metricsAt(
	rows: readonly Judged[],
	threshold: number,
	treatment: PartlyTreatment,
	weighted: boolean,
	maxAreaFraction: number | null = null,
): SweepPoint {
	return sweep(rows, threshold, treatment, weighted, maxAreaFraction).find((point) => point.threshold === threshold)!
}

/* ------------------------------------------------------------------------------------------- */
/* The analysis                                                                                  */
/* ------------------------------------------------------------------------------------------- */

function tally(rows: readonly Judged[]): Record<string, number> {
	const counts: Record<string, number> = { yes: 0, no: 0, partly: 0, other: 0 }
	for (const row of rows) counts[row.answer in counts ? row.answer : "other"] += 1
	return counts
}

export type MaskQualityAnalysis = Readonly<Record<string, unknown>>

export async function analyze(options: { warehousePath: string; samplePath?: string; evalRunPath?: string } ): Promise<MaskQualityAnalysis> {
	const manifest = await readMaskSample(options.samplePath ?? SAM_MASK_QUALITY_SAMPLE_PATH)
	const records = readAll(options.warehousePath)
	const { answers, skipped } = collectAnswers(records, manifest.batchId)
	const population = await readPopulation(manifest, options.evalRunPath)

	// Inverse-probability weights: one sampled row stands for population(cell) / sampled(cell) rows.
	const sampledPerCell = new Map<string, number>()
	for (const entry of manifest.items) {
		const key = `${entry.concept}|${entry.band}`
		sampledPerCell.set(key, (sampledPerCell.get(key) ?? 0) + 1)
	}

	const judged: Judged[] = []
	const unanswered: string[] = []
	for (const entry of manifest.items as readonly MaskSampleEntry[]) {
		const answer = answers.get(`${questionKeyFor(entry.concept)} ${entry.maskRowId}`)
		if (answer === undefined) {
			unanswered.push(entry.itemId)
			continue
		}
		const cell = `${entry.concept}|${entry.band}`
		judged.push({
			itemId: entry.itemId,
			maskRowId: entry.maskRowId,
			concept: entry.concept,
			group: entry.conceptGroup,
			band: entry.band,
			score: entry.score,
			areaFraction: entry.areaFraction,
			forcedSuspicious: entry.forcedSuspicious,
			answer,
			weight: (population.get(cell) ?? 0) / Math.max(1, sampledPerCell.get(cell) ?? 1),
			artworkPath: entry.artwork.imagePath,
		})
	}

	const floor = manifest.scoreThresholdAtRun
	const groups = [...new Set(manifest.items.map((entry) => entry.conceptGroup))].sort()
	const bands = manifest.scoreBands.map((entry) => entry.band)

	/* --- the sweeps ------------------------------------------------------------------------- */

	const sweeps: Record<string, Record<string, SweepPoint[]>> = {}
	const recommendations: Record<string, Record<string, SweepPoint | null>> = {}
	for (const treatment of PARTLY_TREATMENTS) {
		sweeps[treatment] = { pooled: sweep(judged, floor, treatment, false) }
		recommendations[treatment] = { pooled: bestPoint(sweeps[treatment].pooled) }
		for (const group of groups) {
			const rows = judged.filter((row) => row.group === group)
			sweeps[treatment][group] = sweep(rows, floor, treatment, false)
			recommendations[treatment][group] = bestPoint(sweeps[treatment][group])
		}
		sweeps[treatment]["pooled/weighted"] = sweep(judged, floor, treatment, true)
		recommendations[treatment]["pooled/weighted"] = bestPoint(sweeps[treatment]["pooled/weighted"])
	}

	const primary = recommendations.excluded.pooled
	const pooledThreshold = primary?.threshold ?? floor

	/* --- per group: is one threshold enough? ------------------------------------------------ */

	const perGroup = groups.map((group) => {
		const rows = judged.filter((row) => row.group === group)
		const own = recommendations.excluded[group]
		// `metricsAt`, not `pointAt`: the pooled cut is an observed score and is almost never on
		// this group's candidate grid. See `pointAt`'s note.
		const underPooled = rows.length === 0 ? null : metricsAt(rows, pooledThreshold, "excluded", false)
		const gain = own?.youdenJ != null && underPooled?.youdenJ != null ? own.youdenJ - underPooled.youdenJ : null
		return {
			group,
			answered: rows.length,
			tally: tally(rows),
			ownThreshold: own?.threshold ?? null,
			ownYoudenJ: own?.youdenJ ?? null,
			youdenJUnderPooledThreshold: underPooled?.youdenJ ?? null,
			gainOverPooled: gain,
			/**
			 * True when this group's own optimum IS the pooled optimum — it is the group driving
			 * the pooled cut, so its gain is zero by construction and says nothing about whether
			 * OTHER groups want their own threshold.
			 */
			definesPooledThreshold: own?.threshold !== undefined && own !== null && Math.abs(own.threshold - pooledThreshold) < 1e-12,
			underpowered: rows.length < MIN_CELL_ANSWERS,
		}
	})

	/**
	 * Separation: the widest gap between any two groups' own optima.
	 *
	 * Was `perGroup.length === 2 && …`, which silently returned `null` — printed as "separation n/a
	 * → one pooled threshold", as though the test had run — the moment a third concept group
	 * existed. Config has had three groups since concept set v2 (phase-0 adversarial review,
	 * finding 7). The max pairwise gap is the same number for two groups and is defined for any
	 * count, so the hardcoded arity is gone.
	 */
	const ownThresholds = perGroup.filter((entry) => entry.ownThreshold !== null).map((entry) => entry.ownThreshold!)
	const separation = ownThresholds.length < 2 ? null : Math.max(...ownThresholds) - Math.min(...ownThresholds)

	/**
	 * When a second threshold is worth having.
	 *
	 * The old rule was `perGroup.every(entry => gainOverPooled >= PER_GROUP_MIN_J_GAIN)`. One group
	 * always defines the pooled cut — the pooled optimum is by construction some group's optimum —
	 * so that group's gain is necessarily 0.000 and the `every()` could never pass with two groups.
	 * The published conclusion "the concept groups did not separate" was a property of the
	 * quantifier, not a measurement (phase-0 adversarial review, finding 2: `text_like` clears both
	 * of these bars, with n=31 and a gain of 0.1196).
	 *
	 * The rule now: the optima must actually differ, at least one adequately-powered group must
	 * gain, and no group may lose. A group that is merely indifferent — which is exactly what the
	 * group defining the pooled cut is — abstains instead of vetoing.
	 */
	const gainers = perGroup.filter((entry) => !entry.underpowered && (entry.gainOverPooled ?? 0) >= PER_GROUP_MIN_J_GAIN)
	const losers = perGroup.filter((entry) => (entry.gainOverPooled ?? 0) < -PER_GROUP_MAX_J_LOSS)
	const perGroupWarranted = separation !== null && separation >= PER_GROUP_MIN_SEPARATION && gainers.length > 0 && losers.length === 0

	/* --- per band and per concept ------------------------------------------------------------ */

	const perBand = bands.map((band) => {
		const rows = judged.filter((row) => row.band === band)
		const counts = tally(rows)
		const decided = counts.yes + counts.no
		return {
			band,
			answered: rows.length,
			tally: counts,
			/** Of the decided masks in this band, the fraction the reviewer called correct. */
			yesRate: decided === 0 ? null : counts.yes / decided,
			yesRate95: wilson(counts.yes, decided),
			/** With `partly` counted against, the harsher reading of the same band. */
			yesRateStrict: rows.length === 0 ? null : counts.yes / rows.length,
			byGroup: groups.map((group) => ({ group, ...tally(rows.filter((row) => row.group === group)) })),
			underpowered: decided < MIN_CELL_ANSWERS,
		}
	})

	const perConcept = [...new Set(manifest.items.map((entry) => entry.concept))].map((concept) => {
		const rows = judged.filter((row) => row.concept === concept)
		const counts = tally(rows)
		const decided = counts.yes + counts.no
		return {
			concept,
			group: manifest.items.find((entry) => entry.concept === concept)!.conceptGroup,
			populationInRun: bands.reduce((sum, band) => sum + (population.get(`${concept}|${band}`) ?? 0), 0),
			answered: rows.length,
			tally: counts,
			yesRate: decided === 0 ? null : counts.yes / decided,
			yesRate95: wilson(counts.yes, decided),
			underpowered: decided < MIN_CELL_ANSWERS,
		}
	})

	/* --- the hallucination class -------------------------------------------------------------- */

	const forcedInSample = manifest.items.filter((entry) => entry.forcedSuspicious)
	const forced = judged.filter((row) => row.forcedSuspicious)
	const forcedRejected = forced.filter((row) => row.answer !== POSITIVE_ANSWER)
	const forcedSurviving = forcedRejected.filter((row) => row.score >= pooledThreshold)
	/**
	 * Every judged mask over the area bar — not just the force-included ones.
	 *
	 * This is the fix for the review's critical finding. The "hallucination signature" is *defined*
	 * as `area_fraction > 0.5 AND score < 0.5`, so every member of it necessarily scores below any
	 * cut at or above 0.5. Asking "does the recommended cut drop them?" over that subset alone is a
	 * tautology dressed as a test: it can never produce a counterexample, and "no area guard is
	 * needed" therefore carried no information. The counterexample was in the sample all along —
	 * `8b4f2aadf3b1:sticker:0`, area 0.78, score 0.68, rejected by the reviewer, above the cut —
	 * and it was computed here as `wholeSampleBigArea` and then dropped before the verdict string,
	 * which is the string that was copied into config.py, MASK_REVIEW_NOTES.md and
	 * PHASE_0_LOOSE_ENDS.md A6.
	 */
	const bigAreaRows = judged.filter((row) => row.areaFraction > AREA_GUARD_MAX_FRACTION)
	const bigAreaAccepted = bigAreaRows.filter((row) => row.answer === POSITIVE_ANSWER)
	const bigAreaRejected = bigAreaRows.filter((row) => row.answer === NEGATIVE_ANSWER)
	const bigAreaRejectedSurviving = bigAreaRejected.filter((row) => row.score >= pooledThreshold)
	const bigAreaAcceptedSurviving = bigAreaAccepted.filter((row) => row.score >= pooledThreshold)
	const bigAreaMinSurvivingArea =
		bigAreaRejectedSurviving.length === 0 ? null : Math.min(...bigAreaRejectedSurviving.map((row) => row.areaFraction))

	/** What the guard is worth: the pooled sweep at the recommended cut, with and without it. */
	const withoutGuard = metricsAt(judged, pooledThreshold, "excluded", false)
	const withGuard = metricsAt(judged, pooledThreshold, "excluded", false, AREA_GUARD_MAX_FRACTION)
	const guardEffect = {
		maxAreaFraction: AREA_GUARD_MAX_FRACTION,
		threshold: pooledThreshold,
		judgedOverBar: bigAreaRows.length,
		acceptedByReviewer: bigAreaAccepted.length,
		rejectedByReviewer: bigAreaRejected.length,
		truePositivesLost: withoutGuard.keptTruePositive - withGuard.keptTruePositive,
		falsePositivesRemoved: withoutGuard.keptFalsePositive - withGuard.keptFalsePositive,
		without: withoutGuard,
		with: withGuard,
		/**
		 * The part the sample cannot settle, stated rather than buried: the round's big-area masks
		 * are stickers, a logo and a face and contain no `person` at all, while corpus-wide the
		 * masks this guard removes are mostly `person`. Recomputed by the caller if the run path
		 * changes; the numbers quoted in config.py are for sam-eval-142-v2.
		 */
		untestedConcepts: [...new Set(judged.map((row) => row.concept))]
			.filter((concept) => !bigAreaRows.some((row) => row.concept === concept))
			.sort(),
	}

	const hallucination = {
		definition: "area_fraction > 0.5 and score < 0.5, force-included whole",
		areaBar: AREA_GUARD_MAX_FRACTION,
		inSample: forcedInSample.length,
		answeredCount: forced.length,
		answered: forced.map((row) => ({
			itemId: row.itemId,
			concept: row.concept,
			score: row.score,
			areaFraction: row.areaFraction,
			answer: row.answer,
			artworkPath: row.artworkPath,
			droppedByRecommendedThreshold: row.score < pooledThreshold,
		})),
		rejectedByReviewer: forcedRejected.length,
		survivingTheRecommendedThreshold: forcedSurviving.length,
		/**
		 * The fate of the FORCE-INCLUDED subset alone. True, and uninformative on its own, because
		 * the subset is defined to score below 0.5 — kept because the two round-1 documents quote
		 * it and a reader has to be able to find the sentence they were quoting. `verdict` below is
		 * the one that answers the reviewer's question.
		 */
		forcedSubsetVerdict:
			forcedSurviving.length === 0
				? `the recommended threshold ${pooledThreshold.toFixed(3)} drops every rejected suspicious shape`
				: `${forcedSurviving.length} rejected suspicious shape(s) score at or above ${pooledThreshold.toFixed(3)}`,
		/**
		 * The explicit fate, over EVERY judged mask above the area bar.
		 *
		 * A score threshold can only remove the big-area class if every rejected member of it
		 * scores below the threshold; where it cannot, the honest answer is a second predicate, and
		 * the number to use is stated here rather than left to be invented later.
		 */
		verdict:
			bigAreaRows.length === 0
				? `no mask over area ${AREA_GUARD_MAX_FRACTION} reached the round — nothing to decide`
				: primary === null
					? `${bigAreaRows.length} big-area mask(s) answered, but the round has produced no threshold yet — no verdict`
					: bigAreaRejected.length === 0
						? `the reviewer accepted every big-area mask; the class is not a defect and needs no guard`
						: bigAreaRejectedSurviving.length === 0
							? `the recommended threshold ${pooledThreshold.toFixed(3)} drops every rejected suspicious shape and every ` +
								`other rejected big-area mask; no area guard is needed`
							: `a score threshold alone cannot remove this class — ${bigAreaRejectedSurviving.length} of ${bigAreaRejected.length} ` +
								`reviewer-rejected big-area mask(s) score at or above ${pooledThreshold.toFixed(3)} ` +
								`(the smallest covers ${bigAreaMinSurvivingArea?.toFixed(3)} of the image). An area_fraction > ` +
								`${AREA_GUARD_MAX_FRACTION} guard removes ${guardEffect.falsePositivesRemoved} false positive(s) at a cost of ` +
								`${guardEffect.truePositivesLost} true positive(s) in this sample, taking precision from ` +
								`${withoutGuard.precision?.toFixed(4)} to ${withGuard.precision?.toFixed(4)} and J from ` +
								`${withoutGuard.youdenJ?.toFixed(4)} to ${withGuard.youdenJ?.toFixed(4)}. It is a query, not a re-run.`,
		bigArea: {
			bar: AREA_GUARD_MAX_FRACTION,
			answered: bigAreaRows.length,
			acceptedByReviewer: bigAreaAccepted.length,
			rejectedByReviewer: bigAreaRejected.length,
			rejectedAndSurvivingTheThreshold: bigAreaRejectedSurviving.length,
			acceptedAndSurvivingTheThreshold: bigAreaAcceptedSurviving.length,
		},
		guardEffect,
		wholeSampleBigArea: bigAreaRows.map((row) => ({
			itemId: row.itemId,
			maskRowId: row.maskRowId,
			concept: row.concept,
			score: row.score,
			areaFraction: row.areaFraction,
			answer: row.answer,
			forcedSuspicious: row.forcedSuspicious,
			survivesTheRecommendedThreshold: row.score >= pooledThreshold,
			artworkPath: row.artworkPath,
		})),
	}

	/* --- assembly ----------------------------------------------------------------------------- */

	// `null` when the sweep has nothing to optimise — no yes/no pair has been answered yet. Falling
	// back to the run's own threshold here would print the [UNCALIBRATED] value as if it were the
	// calibrated one, which is the single worst thing this file could do.
	const recommendedThreshold = primary === null
		? null
		: perGroupWarranted
			? Object.fromEntries(perGroup.map((entry) => [entry.group, entry.ownThreshold]))
			: pooledThreshold
	const sensitivity = PARTLY_TREATMENTS.map((treatment) => ({
		treatment,
		threshold: recommendations[treatment].pooled?.threshold ?? null,
		youdenJ: recommendations[treatment].pooled?.youdenJ ?? null,
	}))
	const weightedPrimary = recommendations.excluded["pooled/weighted"]

	const warnings: string[] = []
	if (unanswered.length > 0) warnings.push(`${unanswered.length} of ${manifest.items.length} items are unanswered`)
	if (judged.length < manifest.items.length) warnings.push("the round is not complete; every number below is provisional")
	if (new Set(sensitivity.map((entry) => entry.threshold)).size > 1) {
		warnings.push("the three `partly` treatments do not agree on the threshold — the middle answer is load-bearing")
	}
	if (weightedPrimary !== null && Math.abs((weightedPrimary.threshold ?? 0) - pooledThreshold) > PER_GROUP_MIN_SEPARATION) {
		warnings.push(
			`the population-weighted sweep prefers ${weightedPrimary.threshold.toFixed(3)}, not ${pooledThreshold.toFixed(3)} — ` +
				"the unweighted optimum is partly an artefact of the even-quota sampling",
		)
	}
	for (const entry of perBand) if (entry.underpowered) warnings.push(`band ${entry.band} has fewer than ${MIN_CELL_ANSWERS} decided answers`)
	for (const entry of perConcept) if (entry.underpowered) warnings.push(`concept ${entry.concept} has fewer than ${MIN_CELL_ANSWERS} decided answers`)

	return {
		analysisVersion: ANALYSIS_VERSION,
		batchId: manifest.batchId,
		generatedBy: "research/v3/oracle/sam/analyze-mask-quality.ts",
		generatedAt: new Date().toISOString(),
		builtFrom: [
			"research/v3/data/sam/mask-quality-sample.json",
			"research/v3/data/sam/sam-mask-quality-1.json",
			options.warehousePath,
			`research/v3/data/sam/${manifest.sourceRun}.jsonl`,
		],
		criterion: { statistic: SELECTION_CRITERION, tieBreak: TIE_BREAK, partlyTreatment: "excluded (primary)" },
		coverage: { items: manifest.items.length, answered: judged.length, unanswered, skipped },
		scoreThresholdAtRun: floor,
		recommendation: {
			perGroup: perGroupWarranted,
			scoreThreshold: recommendedThreshold,
			pooled: primary,
			pooledPrecision95: primary === null ? null : wilson(primary.keptTruePositive, primary.keptTruePositive + primary.keptFalsePositive),
			pooledRecall95: primary === null ? null : wilson(primary.keptTruePositive, primary.keptTruePositive + primary.droppedFalseNegative),
			weighted: weightedPrimary,
			sensitivityToPartly: sensitivity,
			perGroupTest: {
				separation,
				minSeparation: PER_GROUP_MIN_SEPARATION,
				minYoudenGain: PER_GROUP_MIN_J_GAIN,
				groups: perGroup,
			},
		},
		perBand,
		perConcept,
		hallucination,
		sweeps,
		warnings,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Plain summary                                                                                 */
/* ------------------------------------------------------------------------------------------- */

function pct(value: number | null | undefined): string {
	return value === null || value === undefined ? "  n/a" : `${(value * 100).toFixed(0).padStart(4)}%`
}

export function summarize(analysis: any): string {
	const lines: string[] = []
	lines.push(`SAM mask quality — ${analysis.batchId}`)
	lines.push(`answered ${analysis.coverage.answered} of ${analysis.coverage.items}`)
	lines.push("")
	if (analysis.coverage.answered === 0) {
		lines.push("No answers in the warehouse for this batch. Nothing to calibrate yet.")
		return `${lines.join("\n")}\n`
	}
	const best = analysis.recommendation.pooled
	lines.push("RECOMMENDED SCORE_THRESHOLD")
	lines.push(
		analysis.recommendation.scoreThreshold === null
			? "  none yet — no yes/no pair has been answered, so there is nothing to separate"
			: typeof analysis.recommendation.scoreThreshold === "number"
				? `  ${analysis.recommendation.scoreThreshold.toFixed(3)} for every concept (one threshold; the groups did not separate)`
				: `  per group: ${JSON.stringify(analysis.recommendation.scoreThreshold)}`,
	)
	if (best !== null) {
		if (typeof analysis.recommendation.scoreThreshold !== "number" && analysis.recommendation.scoreThreshold !== null) {
			lines.push("  the three lines below describe the POOLED cut, which is what the per-group table is measured against")
		}
		lines.push(
			`  at that cut: precision ${pct(best.precision)}, recall ${pct(best.recall)}, ` +
				`specificity ${pct(best.specificity)}, Youden J ${best.youdenJ?.toFixed(3)}`,
		)
		lines.push(`  it keeps ${best.keptTruePositive} good and ${best.keptFalsePositive} bad masks, drops ${best.droppedFalseNegative} good and ${best.droppedTrueNegative} bad`)
		lines.push(`  and it keeps ${best.partlyKept} of the ${best.partlyKept + best.partlyDropped} "partly" masks`)
	}
	lines.push(`  run threshold was ${analysis.scoreThresholdAtRun} — raising it is a query, lowering it is a re-run`)
	lines.push("")
	lines.push('SENSITIVITY TO "partly"')
	for (const entry of analysis.recommendation.sensitivityToPartly) {
		lines.push(`  ${String(entry.treatment).padEnd(10)} threshold ${entry.threshold?.toFixed(3) ?? "n/a"}  J ${entry.youdenJ?.toFixed(3) ?? "n/a"}`)
	}
	const weighted = analysis.recommendation.weighted
	if (weighted !== null) lines.push(`  population-weighted: threshold ${weighted.threshold.toFixed(3)}  J ${weighted.youdenJ?.toFixed(3)}`)
	lines.push("")
	lines.push("BY BAND (yes / no / partly, and the yes-rate among decided)")
	for (const entry of analysis.perBand) {
		lines.push(
			`  ${String(entry.band).padEnd(10)} ${String(entry.tally.yes).padStart(3)} ${String(entry.tally.no).padStart(3)} ` +
				`${String(entry.tally.partly).padStart(3)}   ${pct(entry.yesRate)}${entry.underpowered ? "  (underpowered)" : ""}`,
		)
	}
	lines.push("")
	lines.push("BY GROUP")
	for (const entry of analysis.recommendation.perGroupTest.groups) {
		lines.push(
			`  ${String(entry.group).padEnd(12)} n=${String(entry.answered).padStart(3)}  own threshold ${entry.ownThreshold?.toFixed(3) ?? "n/a"}  ` +
				`J ${entry.ownYoudenJ?.toFixed(3) ?? "n/a"}  gain over pooled ${entry.gainOverPooled?.toFixed(3) ?? "n/a"}` +
				`${entry.definesPooledThreshold ? "  (defines the pooled cut — abstains, does not veto)" : ""}`,
		)
	}
	lines.push(
		`  separation ${analysis.recommendation.perGroupTest.separation?.toFixed(3) ?? "n/a"} over ${analysis.recommendation.perGroupTest.groups.length} group(s) ` +
			`(needs >= ${analysis.recommendation.perGroupTest.minSeparation}, at least one group gaining >= ${analysis.recommendation.perGroupTest.minYoudenGain}, and none losing) ` +
			`→ ${analysis.recommendation.perGroup ? "per-group thresholds" : "one pooled threshold"}`,
	)
	lines.push("")
	lines.push("BY CONCEPT (loose end A5 — does the replaced prompt set earn its keep?)")
	for (const entry of analysis.perConcept) {
		lines.push(
			`  ${String(entry.concept).padEnd(13)} n=${String(entry.answered).padStart(3)} of ${String(entry.populationInRun).padStart(5)} in the run  ` +
				`yes ${String(entry.tally.yes).padStart(2)} no ${String(entry.tally.no).padStart(2)} partly ${String(entry.tally.partly).padStart(2)}  ` +
				`${pct(entry.yesRate)}${entry.underpowered ? "  (underpowered)" : ""}`,
		)
	}
	lines.push("")
	lines.push("HALLUCINATION CLASS")
	lines.push(
		`  ${analysis.hallucination.definition} — ${analysis.hallucination.inSample} in the sample, ` +
			`${analysis.hallucination.answeredCount} answered`,
	)
	for (const entry of analysis.hallucination.answered) {
		lines.push(
			`  ${String(entry.concept).padEnd(9)} score ${entry.score.toFixed(3)} area ${entry.areaFraction.toFixed(3)}  ` +
				`answered ${String(entry.answer).padEnd(6)} ${entry.droppedByRecommendedThreshold ? "dropped" : "SURVIVES"}  ${entry.artworkPath}`,
		)
	}
	lines.push(`  forced subset only: ${analysis.hallucination.forcedSubsetVerdict} (true by construction — see below)`)
	lines.push("")
	lines.push(`EVERY MASK OVER AREA ${analysis.hallucination.areaBar} (the question the forced subset cannot answer)`)
	for (const entry of analysis.hallucination.wholeSampleBigArea) {
		lines.push(
			`  ${String(entry.concept).padEnd(9)} score ${entry.score.toFixed(3)} area ${entry.areaFraction.toFixed(3)}  ` +
				`answered ${String(entry.answer).padEnd(6)} ${entry.survivesTheRecommendedThreshold ? "SURVIVES" : "dropped "}  ` +
				`${entry.forcedSuspicious ? "forced" : "sampled"}  ${entry.artworkPath}`,
		)
	}
	const guard = analysis.hallucination.guardEffect
	lines.push(
		`  guard area <= ${guard.maxAreaFraction}: removes ${guard.falsePositivesRemoved} false positive(s), ` +
			`costs ${guard.truePositivesLost} true positive(s) — precision ${pct(guard.without.precision)} -> ${pct(guard.with.precision)}, ` +
			`recall ${pct(guard.without.recall)} -> ${pct(guard.with.recall)}, J ${guard.without.youdenJ?.toFixed(3)} -> ${guard.with.youdenJ?.toFixed(3)}`,
	)
	if (guard.untestedConcepts.length > 0) {
		lines.push(`  no big-area mask of these concepts reached the round: ${guard.untestedConcepts.join(", ")}`)
	}
	lines.push(`  verdict: ${analysis.hallucination.verdict}`)
	if (analysis.warnings.length > 0) {
		lines.push("")
		lines.push("WARNINGS")
		for (const warning of analysis.warnings) lines.push(`  - ${warning}`)
	}
	return `${lines.join("\n")}\n`
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string" },
			sample: { type: "string" },
			write: { type: "boolean", default: false },
		},
		strict: true,
	})
	const { DEFAULT_WAREHOUSE_PATH } = await import("../../src/warehouse/cli.ts")
	const analysis = await analyze({
		warehousePath: values.warehouse ?? DEFAULT_WAREHOUSE_PATH,
		samplePath: values.sample,
	})
	const text = summarize(analysis)
	process.stdout.write(text)
	if (values.write) {
		await writeFile(ANALYSIS_JSON_PATH, `${JSON.stringify(analysis, null, "\t")}\n`)
		await writeFile(ANALYSIS_TEXT_PATH, text)
		process.stdout.write(`\nwrote ${ANALYSIS_JSON_PATH}\nwrote ${ANALYSIS_TEXT_PATH}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}

export { SAM_MASK_QUALITY_BATCH_ID }
