/**
 * The same-colour-bar bracketing round — analysis.
 *
 * The fixture (`bracketing.ts`) shows the reviewer pairs of flat colours and asks a y/n question.
 * The answers land in the warehouse as `oracle-label` records. This script reads them back and
 * answers the two questions the round was built for: `PHASE_0_DECISIONS.md` §3 — what distance is
 * the same-colour bar, and does one bar survive all four dark/light × neutral/saturated quadrants —
 * and §4 invariant 4 — whether a chromatic accent at equal luminance is visible at all, and above
 * what colour distance.
 *
 * Why a two-parameter logistic curve. Discrimination data are conventionally described by an
 * S-shaped curve in the logarithm of the stimulus, because equal *ratios* of distance feel like
 * equal steps; that is also why the ladder is log-spaced. Two parameters (a position and a
 * steepness) give a closed-form 50% point — the distance at which the reviewer is equally likely
 * to answer either way, which is exactly what "the bar" means — and a confidence interval around
 * it. With about a dozen answered points per quadrant, two parameters is as much shape as the data
 * can carry: a step-fitting (isotonic) alternative makes no assumption but returns a range of
 * distances rather than a threshold with an interval, and would need far more answers to narrow it.
 *
 * The curve is always fitted against the *achieved* distance recorded in the fixture, never the
 * ladder target: rounding to 8-bit sRGB moved the distance, and the achieved value is what the
 * reviewer actually saw.
 *
 * Runs on a partial round. Nothing here throws on missing answers; whatever is missing is reported.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/analyze-bracketing.ts [--warehouse <path>] [--fixture <path>] [--out <path>]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"
import type { OracleLabelRecord, WarehouseRecord } from "../warehouse/records.ts"
import { readAll, resolve } from "../warehouse/warehouse.ts"
import { rgbToOkLab } from "../contract/color.ts"
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_FIXTURE_PATH,
	BRACKETING_ROUND_2_BATCH_ID,
	BRACKETING_ROUND_2_FIXTURE_PATH,
	DIRECTION_KINDS,
	PART2_STRATUM,
	QUADRANTS,
	ROUND2_DIRECTION_TARGET,
	hueThirdOf,
	type BracketingFixture,
	type BracketingItem,
	type Quadrant,
} from "./bracketing.ts"

/* ------------------------------------------------------------------------------------------- */
/* Constants                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/** Where the analysis is written when `--out` is not given. Sits beside the fixture it analyses. */
export const BRACKETING_ANALYSIS_PATH = fileURLToPath(
	new URL("../../data/calibration/bracketing-round-1-analysis.json", import.meta.url),
)

/**
 * Ridge penalty on the two fitted coefficients.
 *
 * Without it, perfectly separated answers (everything below some distance called "same", everything
 * above called "different") have no finite best fit — the steepness runs away to infinity and the
 * numbers stop meaning anything. A small penalty pulls the fit back to something finite without
 * visibly moving the threshold when the data are not separated. The predictor is centred before
 * fitting, so the penalty shrinks towards "half the answers flip at the average distance shown",
 * not towards an arbitrary point outside the range.
 * [UNCALIBRATED] — chosen here. Checked on synthetic answers: at 1e-3 a clean non-separated fit
 * moves by well under one part in a thousand, and a fully separated fit stays finite.
 */
export const RIDGE_PENALTY = 1e-3

/**
 * Newton steps allowed before the fit gives up, and the step size below which it is called
 * converged.
 * [UNCALIBRATED] — chosen here; a penalised two-parameter logistic normally converges in under ten
 * steps, so 200 is a safety net rather than a working limit.
 */
const FIT_MAX_ITERATIONS = 200
const FIT_CONVERGENCE_STEP = 1e-10

/** Below this the 2×2 Hessian is treated as not invertible and no interval is reported. */
const FIT_SINGULAR_DETERMINANT = 1e-12

/**
 * Fewest answered points that may produce a threshold. Two points can be fitted exactly by two
 * parameters, which says nothing; three is the first count that can disagree with the curve.
 * [UNCALIBRATED] — the floor set in this workstream's brief.
 */
export const MIN_POINTS_FOR_FIT = 3

/**
 * Multiplier for a 95% interval on a normal scale.
 * [INHERITED] — standard normal 97.5th percentile, the textbook value.
 */
const NORMAL_95_MULTIPLIER = 1.959963984540054

/** Distances are printed to five decimals — the ladder's own steps are ~0.001 apart. */
const THRESHOLD_DECIMALS = 5

/* ------------------------------------------------------------------------------------------- */
/* Types                                                                                         */
/* ------------------------------------------------------------------------------------------- */

/** One answer, already reduced to the reviewer's final position on that item. */
export type BracketingAnswer = Readonly<{
	itemId: string
	questionKey: string
	answer: boolean
	ts: string
	recordId: string
}>

/** Records seen but not counted, by reason. All zero on a clean round. */
export type SkipCounts = Readonly<{
	otherLabelSchema: number
	otherBatch: number
	unknownItem: number
	questionKeyMismatch: number
	nonBooleanAnswer: number
	retracted: number
	superseded: number
}>

export type AnswerCollection = Readonly<{
	byItemId: Map<string, BracketingAnswer>
	skipped: SkipCounts
}>

export type Interval = Readonly<{ low: number; high: number }>

/** One point going into a fit: the distance shown, and whether the reviewer said yes. */
export type Observation = Readonly<{ itemId: string; distance: number; yes: boolean }>

export type LogisticFit = Readonly<{
	n: number
	yesCount: number
	/** Coefficients of `P(yes) = 1 / (1 + exp(-(intercept + slope · log distance)))`. */
	intercept: number | null
	slope: number | null
	/** The reported 50% point. Equal to `fittedThreshold` unless the answers are separated. */
	threshold: number | null
	/** The 50% point of the penalised curve, always reported when it exists. */
	fittedThreshold: number | null
	confidenceInterval: Interval | null
	separated: boolean
	/** When separated: between the largest "yes" distance and the smallest "no" distance. */
	separationInterval: Interval | null
	converged: boolean
	note: string | null
}>

export type QuadrantResult = LogisticFit & Readonly<{ quadrant: string; answered: number; total: number }>

export type RepeatConsistency = Readonly<{
	repeats: number
	bothAnswered: number
	agreed: number
	/** Fraction of comparable repeat pairs answered the same way, or null when none are comparable. */
	agreement: number | null
}>

export type ControlCheck = Readonly<{
	itemId: string
	expected: boolean
	answered: boolean
	answer: boolean | null
	passed: boolean | null
}>

export type ControlSummary = Readonly<{
	total: number
	answered: number
	passed: number
	failures: string[]
	checks: ControlCheck[]
}>

export type BracketingAnalysis = Readonly<{
	generatedAt: string
	fixtureVersion: string
	batchId: string
	/** What the reviewer was asked to judge, copied from the fixture. */
	criterion: string | null
	warehousePath: string
	fixturePath: string
	skipped: SkipCounts
	part1: Readonly<{
		question: string
		totalItems: number
		answered: number
		unanswered: number
		fittedPoints: number
		pooled: LogisticFit
		quadrants: QuadrantResult[]
		oneThresholdSurvives: boolean | null
		oneThresholdSentence: string
		repeatConsistency: RepeatConsistency
		controls: ControlSummary
		prior: Readonly<{ sameColorBar: number; measuredOverPrior: number | null }>
	}>
	part2: Readonly<{
		question: string
		totalItems: number
		answered: number
		unanswered: number
		fittedPoints: number
		fit: LogisticFit
		controls: ControlSummary
		finding: string
	}>
	summaryLines: string[]
}>

/* ------------------------------------------------------------------------------------------- */
/* Reading the warehouse                                                                         */
/* ------------------------------------------------------------------------------------------- */

/**
 * The reviewer's final position on every answered item.
 *
 * Amendments are applied first (`resolve`), retracted records are dropped, and when one item
 * carries several answers the latest by timestamp wins — ties broken by the order the lines were
 * appended. The earlier ones are undo and re-answer, not extra evidence, and must never be counted
 * twice.
 */
export function collectAnswers(
	records: readonly WarehouseRecord[],
	fixture: BracketingFixture,
	scopeBatchId: string = fixture.batchId,
): AnswerCollection {
	const itemsById = new Map(fixture.items.map((item) => [item.itemId, item]))
	const skipped = {
		otherLabelSchema: 0,
		otherBatch: 0,
		unknownItem: 0,
		questionKeyMismatch: 0,
		nonBooleanAnswer: 0,
		retracted: 0,
		superseded: 0,
	}
	const latest = new Map<string, { answer: BracketingAnswer; index: number }>()

	resolve(records).forEach((entry, index) => {
		const record = entry.record
		if (record.type !== "oracle-label") return
		const label = record as OracleLabelRecord
		if (label.labelSchemaVersion !== fixture.fixtureVersion) {
			skipped.otherLabelSchema++
			return
		}
		if (entry.retracted) {
			skipped.retracted++
			return
		}
		// A different batch is a different round, and rounds are never pooled. This is load-bearing:
		// the first pass of round 1 was answered under a detection criterion and abandoned, its
		// answers are still in the log, and mixing them into this fit would silently drag the
		// threshold down. A record with no batch at all is accepted, since the round is otherwise
		// identified by its fixture version and its item ids.
		if (label.batch !== null && label.batch.id !== scopeBatchId) {
			skipped.otherBatch++
			return
		}
		const item = itemsById.get(label.imageId)
		if (item === undefined) {
			skipped.unknownItem++
			return
		}
		if (label.questionKey !== item.part) {
			skipped.questionKeyMismatch++
			return
		}
		if (typeof label.answer !== "boolean") {
			skipped.nonBooleanAnswer++
			return
		}
		const answer: BracketingAnswer = {
			itemId: item.itemId,
			questionKey: label.questionKey,
			answer: label.answer,
			ts: label.ts,
			recordId: entry.original.id,
		}
		const key = `${label.batch === null ? "-" : label.batch.id} ${item.itemId} ${label.questionKey}`
		const current = latest.get(key)
		if (current === undefined) {
			latest.set(key, { answer, index })
			return
		}
		skipped.superseded++
		if (current.answer.ts < answer.ts || (current.answer.ts === answer.ts && current.index < index)) {
			latest.set(key, { answer, index })
		}
	})

	const byItemId = new Map<string, BracketingAnswer>()
	for (const entry of latest.values()) {
		const existing = byItemId.get(entry.answer.itemId)
		// Same item under two batch keys (one stamped, one not): keep the later answer.
		if (existing === undefined || existing.ts <= entry.answer.ts) byItemId.set(entry.answer.itemId, entry.answer)
	}
	return { byItemId, skipped }
}

/* ------------------------------------------------------------------------------------------- */
/* The logistic fit                                                                              */
/* ------------------------------------------------------------------------------------------- */

function emptyFit(n: number, yesCount: number, note: string): LogisticFit {
	return {
		n,
		yesCount,
		intercept: null,
		slope: null,
		threshold: null,
		fittedThreshold: null,
		confidenceInterval: null,
		separated: false,
		separationInterval: null,
		converged: false,
		note,
	}
}

/** Penalised negative log-likelihood, in centred coordinates. Used to reject an uphill Newton step. */
function penalisedCost(z: readonly number[], y: readonly number[], a0: number, a1: number): number {
	let cost = (RIDGE_PENALTY / 2) * (a0 * a0 + a1 * a1)
	for (let index = 0; index < z.length; index++) {
		const eta = a0 + a1 * z[index]!
		// log(1 + exp(eta)), written so a large eta does not overflow.
		const softplus = eta > 0 ? eta + Math.log1p(Math.exp(-eta)) : Math.log1p(Math.exp(eta))
		cost += softplus - y[index]! * eta
	}
	return cost
}

/**
 * Fit `P(yes) = 1 / (1 + exp(-(b0 + b1 · log distance)))` by penalised maximum likelihood
 * (Newton-Raphson, which for this model is the same thing as iteratively reweighted least squares).
 *
 * `direction` says which way the answers are expected to run: "decreasing" for "is this the same
 * colour?" (further apart, less likely to be called the same), "increasing" for "is the accent
 * clearly visible?". A fitted slope with the wrong sign means the answers do not describe a
 * threshold at all, and none is reported.
 *
 * The logarithm of the distance is centred on its own mean before fitting. That is only a change of
 * coordinates for the fit itself — the coefficients are converted back — but it decides what the
 * ridge penalty shrinks towards, and centring makes that "an even chance at the middle of the
 * distances shown" rather than a meaningless point far outside the range.
 */
export function fitLogistic(observations: readonly Observation[], direction: "increasing" | "decreasing"): LogisticFit {
	const usable = observations.filter((point) => Number.isFinite(point.distance) && point.distance > 0)
	const n = usable.length
	const yesCount = usable.filter((point) => point.yes).length

	if (n === 0) return emptyFit(n, yesCount, "nothing answered here yet")
	if (n < MIN_POINTS_FOR_FIT) {
		return emptyFit(
			n,
			yesCount,
			`only ${n} answered pair${n === 1 ? "" : "s"} — at least ${MIN_POINTS_FOR_FIT} are needed before a threshold means anything`,
		)
	}

	const yesDistances = usable.filter((point) => point.yes).map((point) => point.distance)
	const noDistances = usable.filter((point) => !point.yes).map((point) => point.distance)

	if (yesDistances.length === 0 || noDistances.length === 0) {
		const every = yesDistances.length === 0 ? "no" : "yes"
		const bound = yesDistances.length === 0 ? Math.min(...noDistances) : Math.max(...yesDistances)
		const side = (yesDistances.length === 0) === (direction === "decreasing") ? "below" : "above"
		return emptyFit(
			n,
			yesCount,
			`every one of the ${n} answers was "${every}" — the threshold is somewhere ${side} ${bound.toFixed(THRESHOLD_DECIMALS)}, outside the range shown`,
		)
	}

	// Separation: every "yes" on one side of every "no", with nothing in between. The unpenalised fit
	// has no finite answer here, so the honest reading is the gap itself.
	const lowSide = direction === "decreasing" ? yesDistances : noDistances
	const highSide = direction === "decreasing" ? noDistances : yesDistances
	const lowEdge = Math.max(...lowSide)
	const highEdge = Math.min(...highSide)
	const separated = lowEdge < highEdge
	const separationInterval: Interval | null = separated ? { low: lowEdge, high: highEdge } : null

	const z0 = usable.map((point) => Math.log(point.distance))
	const centre = z0.reduce((sum, value) => sum + value, 0) / n
	const z = z0.map((value) => value - centre)
	const y = usable.map((point) => (point.yes ? 1 : 0))

	let a0 = 0
	let a1 = 0
	let converged = false
	let cost = penalisedCost(z, y, a0, a1)
	for (let iteration = 0; iteration < FIT_MAX_ITERATIONS && !converged; iteration++) {
		let g0 = RIDGE_PENALTY * a0
		let g1 = RIDGE_PENALTY * a1
		let h00 = RIDGE_PENALTY
		let h01 = 0
		let h11 = RIDGE_PENALTY
		for (let index = 0; index < n; index++) {
			const eta = a0 + a1 * z[index]!
			const p = 1 / (1 + Math.exp(-eta))
			const residual = p - y[index]!
			g0 += residual
			g1 += residual * z[index]!
			const weight = p * (1 - p)
			h00 += weight
			h01 += weight * z[index]!
			h11 += weight * z[index]! * z[index]!
		}
		const determinant = h00 * h11 - h01 * h01
		if (!Number.isFinite(determinant) || Math.abs(determinant) < FIT_SINGULAR_DETERMINANT) break
		const step0 = (h11 * g0 - h01 * g1) / determinant
		const step1 = (h00 * g1 - h01 * g0) / determinant
		// Halve the step until it actually goes downhill; a full Newton step can overshoot badly when
		// the answers are close to separated.
		let scale = 1
		let nextCost = penalisedCost(z, y, a0 - step0, a1 - step1)
		for (let halving = 0; halving < 40 && !(nextCost <= cost); halving++) {
			scale /= 2
			nextCost = penalisedCost(z, y, a0 - step0 * scale, a1 - step1 * scale)
		}
		a0 -= step0 * scale
		a1 -= step1 * scale
		cost = nextCost
		if (Math.hypot(step0 * scale, step1 * scale) < FIT_CONVERGENCE_STEP) converged = true
	}

	if (!Number.isFinite(a0) || !Number.isFinite(a1)) {
		return { ...emptyFit(n, yesCount, "the fit did not produce usable numbers"), separated, separationInterval }
	}

	const intercept = a0 - a1 * centre
	const slope = a1
	const wrongWay = direction === "decreasing" ? slope >= 0 : slope <= 0

	if (wrongWay) {
		const expected = direction === "decreasing"
			? 'pairs further apart were called "same" at least as often as close ones'
			: 'pairs further apart were called "visible" no more often than close ones'
		return {
			n,
			yesCount,
			intercept,
			slope,
			threshold: null,
			fittedThreshold: null,
			confidenceInterval: null,
			separated,
			separationInterval,
			converged,
			note: `the answers do not run the expected way — ${expected}, so no threshold is reported from the curve`,
		}
	}

	const logThreshold = centre - a0 / a1
	const fittedThreshold = Math.exp(logThreshold)

	// Covariance of the centred coefficients: the inverse of the penalised Hessian at the fit.
	let h00 = RIDGE_PENALTY
	let h01 = 0
	let h11 = RIDGE_PENALTY
	for (let index = 0; index < n; index++) {
		const p = 1 / (1 + Math.exp(-(a0 + a1 * z[index]!)))
		const weight = p * (1 - p)
		h00 += weight
		h01 += weight * z[index]!
		h11 += weight * z[index]! * z[index]!
	}
	const determinant = h00 * h11 - h01 * h01
	let confidenceInterval: Interval | null = null
	if (Number.isFinite(determinant) && Math.abs(determinant) > FIT_SINGULAR_DETERMINANT) {
		const c00 = h11 / determinant
		const c01 = -h01 / determinant
		const c11 = h00 / determinant
		// Spread of the 50% point, carried over from the coefficients by the delta method: the 50%
		// point is -a0/a1, whose slopes with respect to a0 and a1 are these two.
		const d0 = -1 / a1
		const d1 = a0 / (a1 * a1)
		const variance = c00 * d0 * d0 + 2 * c01 * d0 * d1 + c11 * d1 * d1
		if (Number.isFinite(variance) && variance > 0) {
			const half = NORMAL_95_MULTIPLIER * Math.sqrt(variance)
			confidenceInterval = { low: Math.exp(logThreshold - half), high: Math.exp(logThreshold + half) }
		}
	}

	const notes: string[] = []
	if (separated) {
		notes.push(
			"every pair on one side of the gap was answered one way and every pair on the other side the other way, " +
				"so the curve alone cannot pin the threshold down; the reported value is the middle of the gap",
		)
	}
	if (!converged) notes.push("the fit stopped before settling; treat the numbers as approximate")

	return {
		n,
		yesCount,
		intercept,
		slope,
		threshold: separated ? Math.sqrt(lowEdge * highEdge) : fittedThreshold,
		fittedThreshold,
		confidenceInterval,
		separated,
		separationInterval,
		converged,
		note: notes.length ? notes.join("; ") : null,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Assembling the analysis                                                                       */
/* ------------------------------------------------------------------------------------------- */

/**
 * The pairs that go into a fit.
 *
 * Part 1 fits the ladder plus the silent repeats: a repeat is a second genuine answer to the same
 * stimulus, and dropping it would throw away the reviewer's own consistency. Identical controls are
 * left out because their distance is exactly zero and has no logarithm — they are a check on
 * whether the question was understood, not a point on the curve.
 *
 * Part 2 fits the ladder only: the obvious control is not an equal-luminance pair (it differs
 * mostly in brightness) and the identical control is again at zero.
 */
function observationsFor(
	items: readonly BracketingItem[],
	answers: Map<string, BracketingAnswer>,
	distanceOf: (item: BracketingItem) => number,
): Observation[] {
	const out: Observation[] = []
	for (const item of items) {
		if (item.role === "control-identical" || item.role === "control-obvious") continue
		const answer = answers.get(item.itemId)
		if (answer === undefined) continue
		out.push({ itemId: item.itemId, distance: distanceOf(item), yes: answer.answer })
	}
	return out
}

function controlSummary(
	items: readonly BracketingItem[],
	answers: Map<string, BracketingAnswer>,
	expectedFor: (item: BracketingItem) => boolean | null,
): ControlSummary {
	const checks: ControlCheck[] = []
	for (const item of items) {
		const expected = expectedFor(item)
		if (expected === null) continue
		const answer = answers.get(item.itemId)
		checks.push({
			itemId: item.itemId,
			expected,
			answered: answer !== undefined,
			answer: answer === undefined ? null : answer.answer,
			passed: answer === undefined ? null : answer.answer === expected,
		})
	}
	return {
		total: checks.length,
		answered: checks.filter((check) => check.answered).length,
		passed: checks.filter((check) => check.passed === true).length,
		failures: checks.filter((check) => check.passed === false).map((check) => check.itemId),
		checks,
	}
}

/** How often a silent repeat got the same answer as the pair it duplicates. The reviewer's noise floor. */
export function repeatConsistency(
	items: readonly BracketingItem[],
	answers: Map<string, BracketingAnswer>,
): RepeatConsistency {
	const repeats = items.filter((item) => item.role === "repeat")
	let bothAnswered = 0
	let agreed = 0
	for (const repeat of repeats) {
		if (repeat.repeatOf === null) continue
		const here = answers.get(repeat.itemId)
		const there = answers.get(repeat.repeatOf)
		if (here === undefined || there === undefined) continue
		bothAnswered++
		if (here.answer === there.answer) agreed++
	}
	return {
		repeats: repeats.length,
		bothAnswered,
		agreed,
		agreement: bothAnswered === 0 ? null : agreed / bothAnswered,
	}
}

/** The interval used when asking whether a quadrant agrees with the pooled threshold. */
function comparableInterval(fit: LogisticFit): Interval | null {
	if (fit.confidenceInterval !== null && fit.separationInterval !== null) {
		return {
			low: Math.min(fit.confidenceInterval.low, fit.separationInterval.low),
			high: Math.max(fit.confidenceInterval.high, fit.separationInterval.high),
		}
	}
	return fit.confidenceInterval ?? fit.separationInterval
}

function fmt(value: number | null | undefined): string {
	return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(THRESHOLD_DECIMALS)
}

function fmtInterval(interval: Interval | null): string {
	return interval === null ? "no interval" : `${fmt(interval.low)} to ${fmt(interval.high)}`
}

function fmtPercent(fraction: number | null): string {
	return fraction === null ? "—" : `${Math.round(fraction * 100)}%`
}

export function analyzeBracketing(
	fixture: BracketingFixture,
	records: readonly WarehouseRecord[],
	paths: { warehousePath: string; fixturePath: string; batchId?: string },
	now: () => Date = () => new Date(),
): BracketingAnalysis {
	// Which round this fit is about. Defaults to the fixture's own batch id; the CLI passes the
	// round actually in the queue, because one fixture can be re-pushed as a fresh round under a
	// clarified criterion, and the two must never be pooled.
	const scopeBatchId = paths.batchId ?? fixture.batchId
	const { byItemId: answers, skipped } = collectAnswers(records, fixture, scopeBatchId)

	const part1Items = fixture.items.filter((item) => item.part === "same-color")
	const part2Items = fixture.items.filter((item) => item.part === "accent-visible")
	const part1Answered = part1Items.filter((item) => answers.has(item.itemId)).length
	const part2Answered = part2Items.filter((item) => answers.has(item.itemId)).length

	/* --- part 1: the same-colour bar ---------------------------------------------------------- */

	// Direction-probe pairs (round 2) are deliberately all at one distance and stratified by the
	// *axis* of the difference, not its size. Fitting them into a threshold ladder would pile a
	// third of the points onto a single x value and, if the axis turns out to matter, make the
	// response bimodal there. They are reported on their own instead.
	const ladderItems = part1Items.filter((item) => item.role !== "direction-probe")
	const part1Observations = observationsFor(ladderItems, answers, (item) => item.truth.okLabDistance)
	const pooled = fitLogistic(part1Observations, "decreasing")

	const quadrants: QuadrantResult[] = QUADRANTS.map((quadrant: Quadrant) => {
		const inQuadrant = ladderItems.filter((item) => item.stratum === quadrant)
		const fit = fitLogistic(
			observationsFor(inQuadrant, answers, (item) => item.truth.okLabDistance),
			"decreasing",
		)
		return {
			...fit,
			quadrant,
			answered: inQuadrant.filter((item) => answers.has(item.itemId)).length,
			total: inQuadrant.length,
		}
	})

	let oneThresholdSurvives: boolean | null = null
	let oneThresholdSentence: string
	if (pooled.threshold === null) {
		oneThresholdSentence = "Not enough answers yet to say whether one threshold covers all four quadrants."
	} else {
		const withInterval = quadrants.filter((quadrant) => comparableInterval(quadrant) !== null)
		if (withInterval.length < quadrants.length) {
			const missing = quadrants.filter((quadrant) => comparableInterval(quadrant) === null).map((quadrant) => quadrant.quadrant)
			oneThresholdSentence =
				`Cannot say yet: ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no usable interval, ` +
				"so the four quadrants cannot be compared."
		} else {
			const disagreeing = quadrants.filter((quadrant) => {
				const interval = comparableInterval(quadrant)!
				return pooled.threshold! < interval.low || pooled.threshold! > interval.high
			})
			oneThresholdSurvives = disagreeing.length === 0
			oneThresholdSentence = oneThresholdSurvives
				? `Yes: every quadrant's interval contains the pooled threshold of ${fmt(pooled.threshold)}, so one bar can be used everywhere.`
				: `No: ${disagreeing.map((quadrant) => quadrant.quadrant).join(", ")} ` +
					`${disagreeing.length === 1 ? "excludes" : "exclude"} the pooled threshold of ${fmt(pooled.threshold)}, ` +
					"so a single bar does not fit all four quadrants."
		}
	}

	const repeats = repeatConsistency(part1Items, answers)
	const part1Controls = controlSummary(part1Items, answers, (item) => (item.role === "control-identical" ? true : null))
	const measuredOverPrior =
		pooled.threshold === null || fixture.prior.sameColorBar === 0 ? null : pooled.threshold / fixture.prior.sameColorBar

	/* --- part 2: an accent at equal luminance -------------------------------------------------- */

	const part2Observations = observationsFor(part2Items, answers, (item) => item.truth.chromaDistance)
	const part2Fit = fitLogistic(part2Observations, "increasing")
	const part2Controls = controlSummary(part2Items, answers, (item) => {
		if (item.role === "control-obvious") return true
		if (item.role === "control-identical") return false
		return null
	})

	let finding: string
	if (part2Fit.threshold !== null) {
		finding =
			`Yes — a coloured accent at the same brightness as its background is visible, once the two colours are ` +
			`about ${fmt(part2Fit.threshold)} apart in colour (${fmtInterval(part2Fit.confidenceInterval)}). ` +
			"Below that the reviewer stopped seeing it, even though nothing about the brightness changed. " +
			"So the accent's floor can be stated as a colour distance, not only as a brightness difference."
	} else if (part2Fit.n === 0) {
		finding = "No equal-brightness accent pair has been answered yet — nothing can be said about them."
	} else if (part2Fit.n < MIN_POINTS_FOR_FIT) {
		finding = `Only ${part2Fit.n} equal-brightness accent pair${part2Fit.n === 1 ? "" : "s"} answered so far — too few to say anything.`
	} else if (part2Fit.yesCount === part2Fit.n) {
		finding =
			"Every accent shown was called visible, so an equal-brightness coloured accent is clearly visible at least " +
			"down to the smallest colour distance shown. The floor, if there is one, is below this round's range."
	} else if (part2Fit.yesCount === 0) {
		finding =
			"No accent shown was called visible, so at equal brightness colour alone did not make the icons readable " +
			"anywhere in this round's range."
	} else {
		finding = `No threshold: ${part2Fit.note ?? "the answers do not support one"}.`
	}

	/* --- summary ------------------------------------------------------------------------------- */

	const lines: string[] = []
	lines.push(`Same-colour bracketing round — ${scopeBatchId}`)
	lines.push(`Criterion: ${fixture.criterion ?? "unrecorded"}`)
	if (scopeBatchId !== BRACKETING_ACTIVE_BATCH_ID) {
		// The criterion above is the fixture's current one. An older pass over the same pairs may have
		// been answered under a different one — that is why it is a different batch — so say so rather
		// than let the line be read as a claim about these answers.
		lines.push(
			`Note: this is not the active round (${BRACKETING_ACTIVE_BATCH_ID}). The criterion line above is the ` +
				`fixture's; what this pass was actually answered under may differ, which is why it is a separate batch.`,
		)
	}
	lines.push(
		`Answered: ${part1Answered} of ${part1Items.length} same-colour pairs, ` +
			`${part2Answered} of ${part2Items.length} accent pairs.`,
	)

	if (part1Answered === 0 && part2Answered === 0) {
		lines.push("")
		lines.push("Nothing has been answered yet, so there is no threshold to report.")
		lines.push(`${part1Items.length + part2Items.length} pairs are still waiting.`)
	} else {
		lines.push("")
		lines.push("PART 1 — where is the same-colour bar?")
		if (pooled.threshold === null) {
			lines.push(`  No pooled threshold yet: ${pooled.note ?? "not enough answers"}.`)
			lines.push(`  ${part1Items.length - part1Answered} same-colour pairs are still waiting.`)
		} else {
			lines.push(
				`  Pooled threshold: ${fmt(pooled.threshold)} ` +
					`(95% confidence interval ${fmtInterval(pooled.confidenceInterval)}), from ${pooled.n} answers.`,
			)
			lines.push(
				`  Two colours closer than this were usually called the same; further apart, usually called different.`,
			)
			if (measuredOverPrior !== null) {
				lines.push(
					`  The prior we came in with was ${fmt(fixture.prior.sameColorBar)}; ` +
						`the measured bar is ${measuredOverPrior.toFixed(2)} times that.`,
				)
			}
			if (pooled.separated) lines.push(`  Note: ${pooled.note}.`)
			if (part1Answered < part1Items.length) {
				lines.push(`  ${part1Items.length - part1Answered} same-colour pairs are still waiting.`)
			}
		}
		lines.push(`  One threshold for all four quadrants? ${oneThresholdSentence}`)
		lines.push("")
		lines.push("  Per quadrant:")
		for (const quadrant of quadrants) {
			const head = `    ${quadrant.quadrant.padEnd(16)} ${String(quadrant.answered).padStart(2)}/${quadrant.total} answered`
			if (quadrant.threshold === null) {
				lines.push(`${head}  no threshold — ${quadrant.note ?? "not enough answers"}`)
			} else {
				lines.push(`${head}  threshold ${fmt(quadrant.threshold)}  interval ${fmtInterval(comparableInterval(quadrant))}`)
				if (quadrant.separated) lines.push(`      (answers were cleanly split, so this is the middle of the gap)`)
			}
		}
		lines.push("")
		if (repeats.bothAnswered === 0) {
			lines.push(`  Repeat consistency: not measurable yet — none of the ${repeats.repeats} hidden repeats can be compared.`)
		} else {
			lines.push(
				`  Repeat consistency: ${repeats.agreed} of ${repeats.bothAnswered} hidden repeats got the same answer as ` +
					`the first time (${fmtPercent(repeats.agreement)}).`,
			)
			lines.push("  That is the reviewer's own noise. No threshold can be sharper than this noise allows.")
		}
		if (part1Controls.answered === 0) {
			lines.push(`  Identical-colour controls: none of the ${part1Controls.total} answered yet.`)
		} else if (part1Controls.failures.length > 0) {
			lines.push(
				`  WARNING — identical-colour controls failed: ${part1Controls.failures.join(", ")} ` +
					`(${part1Controls.passed} of ${part1Controls.answered} answered correctly).`,
			)
			lines.push("  A pair of literally identical colours was called different. The question was probably misread,")
			lines.push("  and the whole round should be treated as suspect until this is explained.")
		} else {
			lines.push(
				`  Identical-colour controls: ${part1Controls.passed} of ${part1Controls.answered} answered correctly ("same").`,
			)
		}

		lines.push("")
		lines.push("PART 2 — is a coloured accent visible at the same brightness?")
		lines.push(`  ${part2Answered} of ${part2Items.length} answered.`)
		if (part2Fit.threshold !== null) {
			lines.push(
				`  Threshold: ${fmt(part2Fit.threshold)} colour distance ` +
					`(95% confidence interval ${fmtInterval(part2Fit.confidenceInterval)}), from ${part2Fit.n} answers.`,
			)
			if (part2Fit.separated) lines.push(`  Note: ${part2Fit.note}.`)
		}
		lines.push(`  ${finding}`)
		if (part2Controls.answered === 0) {
			lines.push(`  Controls: none of the ${part2Controls.total} answered yet.`)
		} else if (part2Controls.failures.length > 0) {
			lines.push(`  WARNING — control failed: ${part2Controls.failures.join(", ")}. The question may have been misread.`)
		} else {
			lines.push(`  Controls: ${part2Controls.passed} of ${part2Controls.answered} answered as expected.`)
		}
	}

	const skippedTotal = Object.values(skipped).reduce((sum, value) => sum + value, 0)
	if (skippedTotal > 0) {
		lines.push("")
		const parts = Object.entries(skipped)
			.filter(([, count]) => count > 0)
			.map(([reason, count]) => `${reason} ${count}`)
		lines.push(`Records read but not counted: ${parts.join(", ")}.`)
	}

	return {
		generatedAt: now().toISOString(),
		fixtureVersion: fixture.fixtureVersion,
		batchId: scopeBatchId,
		criterion: fixture.criterion ?? null,
		warehousePath: paths.warehousePath,
		fixturePath: paths.fixturePath,
		skipped,
		part1: {
			question: "Are these two colours the same colour?",
			totalItems: part1Items.length,
			answered: part1Answered,
			unanswered: part1Items.length - part1Answered,
			fittedPoints: part1Observations.length,
			pooled,
			quadrants,
			oneThresholdSurvives,
			oneThresholdSentence,
			repeatConsistency: repeats,
			controls: part1Controls,
			prior: { sameColorBar: fixture.prior.sameColorBar, measuredOverPrior },
		},
		part2: {
			question: "Are the icons clearly visible on this background?",
			totalItems: part2Items.length,
			answered: part2Answered,
			unanswered: part2Items.length - part2Answered,
			fittedPoints: part2Observations.length,
			fit: part2Fit,
			controls: part2Controls,
			finding,
		},
		summaryLines: lines,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Entry point                                                                                   */
/* ------------------------------------------------------------------------------------------- */

export async function loadFixture(path: string): Promise<BracketingFixture> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as BracketingFixture
	if (!Array.isArray(parsed.items) || typeof parsed.fixtureVersion !== "string") {
		throw new Error(`${path} does not look like a bracketing fixture`)
	}
	// The stratum name part 2 uses is referenced here so a fixture generated by an older generator,
	// which used a different name, is caught rather than silently analysed as zero accent items.
	const part2 = parsed.items.filter((item) => item.part === "accent-visible")
	if (part2.length > 0 && part2.every((item) => item.stratum !== PART2_STRATUM)) {
		throw new Error(`${path} carries accent items in an unexpected stratum (expected ${PART2_STRATUM})`)
	}
	return parsed
}

/* ------------------------------------------------------------------------------------------- */
/* Round 2 — the refinement round, alone and pooled with round 1                                 */
/* ------------------------------------------------------------------------------------------- */

/** Where the round-2 analysis is written when `--out` is not given. */
export const BRACKETING_ROUND_2_ANALYSIS_PATH = fileURLToPath(
	new URL("../../data/calibration/bracketing-round-2-analysis.json", import.meta.url),
)

export type PooledQuadrantFit = QuadrantResult & Readonly<{ fromRound1: number; fromRound2: number }>

export type HueThirdResult = Readonly<{
	third: number
	label: string
	rangeDegrees: Interval
	fit: LogisticFit
	fromRound1: number
	fromRound2: number
}>

export type DirectionResult = Readonly<{
	kind: string
	n: number
	yesCount: number
	yesRate: number | null
	meanDistance: number | null
	minPurity: number | null
	perQuadrant: readonly Readonly<{ quadrant: string; distance: number; answer: boolean | null }>[]
}>

export type BracketingRound2Analysis = Readonly<{
	generatedAt: string
	warehousePath: string
	rounds: readonly Readonly<{ batchId: string; fixturePath: string; criterion: string | null }>[]
	/** Rounds may only be pooled when they were answered under the same criterion string. */
	criterionMatches: boolean
	poolable: boolean
	/** Round 2 fitted on its own, in the same shape as any single round. */
	round2: BracketingAnalysis
	pooled: Readonly<{
		fit: LogisticFit
		quadrants: readonly PooledQuadrantFit[]
		oneThresholdSurvives: boolean | null
		oneThresholdSentence: string
		fromRound1: number
		fromRound2: number
	}>
	hueSplit: Readonly<{
		quadrant: string
		boundariesDegrees: readonly number[]
		thirds: readonly HueThirdResult[]
		round1Assigned: number
		round1Mixed: number
		verdict: string
	}>
	directionProbe: Readonly<{
		targetDistance: number
		answered: number
		total: number
		predictedYesRate: number | null
		directions: readonly DirectionResult[]
		verdict: string
	}>
	repeats: Readonly<{ round1: RepeatConsistency; round2: RepeatConsistency; combinedAgreement: number | null }>
	summaryLines: string[]
}>

/** P(yes) under a fitted curve at one distance. Null when the round produced no curve. */
function predictYes(fit: LogisticFit, distance: number): number | null {
	if (fit.intercept === null || fit.slope === null || distance <= 0) return null
	return 1 / (1 + Math.exp(-(fit.intercept + fit.slope * Math.log(distance))))
}

/**
 * Which hue third a round-1 light-saturated pair belongs to, decided after the fact.
 *
 * Round 1 did not sample by hue, so its pairs land wherever they land — and a pair whose two colours
 * straddle a boundary belongs to neither third. Those are counted as `mixed` and dropped rather than
 * assigned to one side, which would be a coin flip dressed up as data.
 */
function assignedHueThird(item: BracketingItem): number | null {
	if (item.hueThird !== undefined) return item.hueThird
	const first = hueThirdOf(rgbToOkLab(item.first))
	const second = hueThirdOf(rgbToOkLab(item.second))
	return first === second ? first : null
}

function ladderObservations(
	fixture: BracketingFixture,
	answers: Map<string, BracketingAnswer>,
	predicate: (item: BracketingItem) => boolean,
): Observation[] {
	return observationsFor(
		fixture.items.filter((item) => item.part === "same-color" && item.role !== "direction-probe" && predicate(item)),
		answers,
		(item) => item.truth.okLabDistance,
	)
}

/**
 * Round 2 on its own, rounds 1+2 pooled, the hue split and the direction probe.
 *
 * Pooling is not automatic. Two rounds may only be combined when they were answered under the same
 * criterion, and this checks the criterion strings before doing it — the abandoned first pass is the
 * standing reminder of what happens otherwise. Round 1 is read at its *clarified* batch id, never
 * the abandoned one.
 */
export function analyzeBracketingRound2(
	round1: BracketingFixture,
	round2: BracketingFixture,
	records: readonly WarehouseRecord[],
	paths: {
		warehousePath: string
		round1FixturePath: string
		round2FixturePath: string
		round1BatchId?: string
		round2BatchId?: string
	},
	now: () => Date = () => new Date(),
): BracketingRound2Analysis {
	const round1BatchId = paths.round1BatchId ?? BRACKETING_ACTIVE_BATCH_ID
	const round2BatchId = paths.round2BatchId ?? round2.batchId
	const answers1 = collectAnswers(records, round1, round1BatchId).byItemId
	const answers2 = collectAnswers(records, round2, round2BatchId).byItemId

	const criterionMatches = round1.criterion === round2.criterion
	const round2Alone = analyzeBracketing(round2, records, {
		warehousePath: paths.warehousePath,
		fixturePath: paths.round2FixturePath,
		batchId: round2BatchId,
	}, now)

	/* --- pooled per quadrant ------------------------------------------------------------------ */

	const poolFor = (predicate: (item: BracketingItem) => boolean) => ({
		round1: criterionMatches ? ladderObservations(round1, answers1, predicate) : [],
		round2: ladderObservations(round2, answers2, predicate),
	})
	const pooledAll = poolFor(() => true)
	const pooledFit = fitLogistic([...pooledAll.round1, ...pooledAll.round2], "decreasing")

	const pooledQuadrants: PooledQuadrantFit[] = QUADRANTS.map((quadrant: Quadrant) => {
		const split = poolFor((item) => item.stratum === quadrant)
		const observations = [...split.round1, ...split.round2]
		return {
			...fitLogistic(observations, "decreasing"),
			quadrant,
			answered: observations.length,
			total: [round1, round2]
				.flatMap((fixture) => fixture.items)
				.filter((item) => item.part === "same-color" && item.role !== "direction-probe" && item.stratum === quadrant).length,
			fromRound1: split.round1.length,
			fromRound2: split.round2.length,
		}
	})

	let oneThresholdSurvives: boolean | null = null
	let oneThresholdSentence: string
	if (pooledFit.threshold === null) {
		oneThresholdSentence = "Not enough pooled answers yet to say whether one threshold covers all four quadrants."
	} else {
		const usable = pooledQuadrants.filter((quadrant) => comparableInterval(quadrant) !== null)
		if (usable.length < pooledQuadrants.length) {
			const missing = pooledQuadrants
				.filter((quadrant) => comparableInterval(quadrant) === null)
				.map((quadrant) => quadrant.quadrant)
			oneThresholdSentence =
				`Cannot say yet: ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no usable interval even pooled.`
		} else {
			const disagreeing = pooledQuadrants.filter((quadrant) => {
				const interval = comparableInterval(quadrant)!
				return pooledFit.threshold! < interval.low || pooledFit.threshold! > interval.high
			})
			oneThresholdSurvives = disagreeing.length === 0
			oneThresholdSentence = oneThresholdSurvives
				? `Yes, on both rounds pooled: every quadrant's interval contains the pooled threshold of ${fmt(pooledFit.threshold)}.`
				: `No, on both rounds pooled: ${disagreeing.map((quadrant) => quadrant.quadrant).join(", ")} ` +
					`${disagreeing.length === 1 ? "excludes" : "exclude"} the pooled threshold of ${fmt(pooledFit.threshold)}.`
		}
	}

	/* --- the hue split inside light-saturated -------------------------------------------------- */

	const hueQuadrant = round2.refinement?.hueSplit.quadrant ?? "light-saturated"
	const boundaries = round2.refinement?.hueSplit.boundariesDegrees ?? [0, 120, 240]
	const labels = round2.refinement?.hueSplit.labels ?? boundaries.map((_, index) => `third ${index}`)
	let round1Assigned = 0
	let round1Mixed = 0
	for (const item of round1.items) {
		if (item.part !== "same-color" || item.stratum !== hueQuadrant || item.role === "control-identical") continue
		if (assignedHueThird(item) === null) round1Mixed++
		else round1Assigned++
	}
	const thirds: HueThirdResult[] = boundaries.map((low, index) => {
		const high = index + 1 < boundaries.length ? boundaries[index + 1] : 360
		const split = poolFor((item) => item.stratum === hueQuadrant && assignedHueThird(item) === index)
		return {
			third: index,
			label: labels[index] ?? `third ${index}`,
			rangeDegrees: { low, high },
			fit: fitLogistic([...split.round1, ...split.round2], "decreasing"),
			fromRound1: split.round1.length,
			fromRound2: split.round2.length,
		}
	})
	const fittedThirds = thirds.filter((entry) => entry.fit.threshold !== null)
	let hueVerdict: string
	if (fittedThirds.length < 2) {
		hueVerdict = `Not enough answers yet: ${fittedThirds.length} of ${thirds.length} hue thirds have a threshold.`
	} else {
		const overlapping = fittedThirds.every((entry) => {
			const interval = comparableInterval(entry.fit)
			return interval === null || fittedThirds.every((other) => other.fit.threshold! >= interval.low && other.fit.threshold! <= interval.high)
		})
		const low = fittedThirds.reduce((best, entry) => (entry.fit.threshold! < best.fit.threshold! ? entry : best))
		const high = fittedThirds.reduce((best, entry) => (entry.fit.threshold! > best.fit.threshold! ? entry : best))
		const spread = high.fit.threshold! / low.fit.threshold!
		hueVerdict = overlapping
			? `The three hue thirds agree within their intervals (spread ${spread.toFixed(1)}×, ` +
				`lowest ${low.label.split(":")[0]} at ${fmt(low.fit.threshold)}, highest ${high.label.split(":")[0]} at ${fmt(high.fit.threshold)}). ` +
				"Light-saturated's wide interval looks like noise, not hue heterogeneity."
			: `The hue thirds do not agree: ${low.label.split(":")[0]} sits at ${fmt(low.fit.threshold)} and ` +
				`${high.label.split(":")[0]} at ${fmt(high.fit.threshold)}, a spread of ${spread.toFixed(1)}×, ` +
				"outside at least one interval. Light-saturated is not one population — the bar there depends on hue."
	}

	/* --- the direction probe ------------------------------------------------------------------- */

	const probeItems = round2.items.filter((item) => item.role === "direction-probe")
	const probeTarget = round2.refinement?.directionProbe.targetDistance ?? ROUND2_DIRECTION_TARGET
	const kinds = round2.refinement?.directionProbe.kinds ?? DIRECTION_KINDS
	const directions: DirectionResult[] = kinds.map((kind) => {
		const inKind = probeItems.filter((item) => item.direction === kind)
		const answered = inKind.filter((item) => answers2.has(item.itemId))
		const yesCount = answered.filter((item) => answers2.get(item.itemId)!.answer).length
		return {
			kind,
			n: answered.length,
			yesCount,
			yesRate: answered.length === 0 ? null : yesCount / answered.length,
			meanDistance:
				inKind.length === 0 ? null : inKind.reduce((sum, item) => sum + item.truth.okLabDistance, 0) / inKind.length,
			minPurity: inKind.length === 0 ? null : Math.min(...inKind.map((item) => item.decomposition?.purity ?? 0)),
			perQuadrant: inKind.map((item) => ({
				quadrant: item.stratum,
				distance: item.truth.okLabDistance,
				answer: answers2.get(item.itemId)?.answer ?? null,
			})),
		}
	})
	const probeAnswered = directions.reduce((sum, entry) => sum + entry.n, 0)
	const predictedYesRate = predictYes(pooledFit, probeTarget)
	const rated = directions.filter((entry) => entry.yesRate !== null)
	let probeVerdict: string
	if (rated.length < kinds.length) {
		probeVerdict = `Not answered yet: ${probeAnswered} of ${probeItems.length} probe pairs.`
	} else {
		const lowest = rated.reduce((best, entry) => (entry.yesRate! < best.yesRate! ? entry : best))
		const highest = rated.reduce((best, entry) => (entry.yesRate! > best.yesRate! ? entry : best))
		const gap = highest.yesRate! - lowest.yesRate!
		// Four pairs per direction is a probe, not a measurement: one flipped answer moves a rate by
		// 25 points. Anything under half the range is inside that noise.
		probeVerdict =
			gap >= 0.5
				? `Direction looks like it matters: at the same distance (${fmt(probeTarget)}), a ${highest.kind} difference ` +
					`read as "same" ${fmtPercent(highest.yesRate)} of the time and a ${lowest.kind} difference ${fmtPercent(lowest.yesRate)}. ` +
					"With four pairs per direction this is a signal worth a dedicated round, not a number to use."
				: `No direction effect visible: the three directions differ by ${fmtPercent(gap)} at the same distance ` +
					`(${fmt(probeTarget)}), which four pairs per direction cannot separate from noise — one flipped answer is 25 points. ` +
					"The bar can go on being stated as a distance."
	}

	/* --- repeats, both rounds ------------------------------------------------------------------ */

	const repeats1 = repeatConsistency(round1.items, answers1)
	const repeats2 = repeatConsistency(round2.items, answers2)
	const bothAnswered = repeats1.bothAnswered + repeats2.bothAnswered
	const combinedAgreement = bothAnswered === 0 ? null : (repeats1.agreed + repeats2.agreed) / bothAnswered

	/* --- plain language ------------------------------------------------------------------------ */

	const lines: string[] = []
	lines.push(`Same-colour bar — round 2 (${round2BatchId}), refining ${round1BatchId}`)
	lines.push(`Criterion: ${round2.criterion}`)
	if (!criterionMatches) {
		lines.push("")
		lines.push("NOT POOLED. The two rounds were answered under different criterion strings, so only round 2's")
		lines.push("own fit is reported below. Pooling answers to two different questions is how a threshold goes")
		lines.push("quietly wrong.")
	}
	lines.push("")
	lines.push(`Round 2 alone: ${round2Alone.part1.answered} of ${round2Alone.part1.totalItems} pairs answered.`)
	lines.push(`  threshold ${fmt(round2Alone.part1.pooled.threshold)} (${fmtInterval(round2Alone.part1.pooled.confidenceInterval)})`)
	lines.push("")
	lines.push(`Rounds 1+2 pooled: ${pooledFit.n} fitted points (${pooledAll.round1.length} from round 1, ${pooledAll.round2.length} from round 2).`)
	lines.push(`  pooled threshold ${fmt(pooledFit.threshold)} (${fmtInterval(pooledFit.confidenceInterval)})`)
	for (const quadrant of pooledQuadrants) {
		lines.push(
			`  ${quadrant.quadrant.padEnd(16)} ${fmt(quadrant.threshold)} (${fmtInterval(quadrant.confidenceInterval)}) ` +
				`from ${quadrant.fromRound1}+${quadrant.fromRound2} points`,
		)
	}
	lines.push(`  ${oneThresholdSentence}`)
	lines.push("")
	lines.push(`HUE SPLIT inside ${hueQuadrant} (round 2 sampled it; ${round1Assigned} round-1 pairs were assigned after the`)
	lines.push(`fact and ${round1Mixed} straddled a boundary and were dropped):`)
	for (const third of thirds) {
		lines.push(
			`  ${third.rangeDegrees.low}–${third.rangeDegrees.high}° ${fmt(third.fit.threshold)} ` +
				`(${fmtInterval(third.fit.confidenceInterval)}) from ${third.fromRound1}+${third.fromRound2} points — ${third.label}`,
		)
	}
	lines.push(`  ${hueVerdict}`)
	lines.push("")
	lines.push(`DIRECTION PROBE at ${fmt(probeTarget)}` + (predictedYesRate === null ? ":" : `, where the pooled curve predicts ${fmtPercent(predictedYesRate)} "same":`))
	for (const direction of directions) {
		lines.push(
			`  ${direction.kind.padEnd(10)} ${direction.yesCount}/${direction.n} said same (${fmtPercent(direction.yesRate)}) ` +
				`· purity ≥ ${direction.minPurity === null ? "—" : direction.minPurity.toFixed(2)}`,
		)
	}
	lines.push(`  ${probeVerdict}`)
	lines.push("")
	lines.push("REVIEWER NOISE (silent repeats):")
	lines.push(`  round 1 ${repeats1.agreed}/${repeats1.bothAnswered} · round 2 ${repeats2.agreed}/${repeats2.bothAnswered} · ` +
		`combined ${fmtPercent(combinedAgreement)}`)
	lines.push("  A threshold can never be sharper than this: it is the ceiling on everything above.")
	const floors = round2.refinement?.expressibilityFloor
	if (floors !== undefined) {
		lines.push("")
		lines.push("8-BIT FLOOR. The grid, not the eye, sets how finely a pair can be placed:")
		for (const quadrant of QUADRANTS) {
			const floor = floors[quadrant]
			if (floor === undefined) continue
			const smallest = Math.min(
				...round2.items
					.filter((item) => item.stratum === quadrant && item.role === "ladder")
					.map((item) => item.truth.okLabDistance),
			)
			lines.push(
				`  ${quadrant.padEnd(16)} nearest-neighbour step ${fmt(floor.median)} vs smallest rung ${fmt(smallest)} ` +
					`— rungs there are quantised to about ±${fmt(floor.median / 2)}`,
			)
		}
		lines.push("  Every distance reported anywhere above is the achieved one, measured on the two colours shown.")
	}

	return {
		generatedAt: now().toISOString(),
		warehousePath: paths.warehousePath,
		rounds: [
			{ batchId: round1BatchId, fixturePath: paths.round1FixturePath, criterion: round1.criterion ?? null },
			{ batchId: round2BatchId, fixturePath: paths.round2FixturePath, criterion: round2.criterion ?? null },
		],
		criterionMatches,
		poolable: criterionMatches,
		round2: round2Alone,
		pooled: {
			fit: pooledFit,
			quadrants: pooledQuadrants,
			oneThresholdSurvives,
			oneThresholdSentence,
			fromRound1: pooledAll.round1.length,
			fromRound2: pooledAll.round2.length,
		},
		hueSplit: {
			quadrant: hueQuadrant,
			boundariesDegrees: [...boundaries],
			thirds,
			round1Assigned,
			round1Mixed,
			verdict: hueVerdict,
		},
		directionProbe: {
			targetDistance: probeTarget,
			answered: probeAnswered,
			total: probeItems.length,
			predictedYesRate,
			directions,
			verdict: probeVerdict,
		},
		repeats: { round1: repeats1, round2: repeats2, combinedAgreement },
		summaryLines: lines,
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string" },
			fixture: { type: "string" },
			out: { type: "string" },
			batch: { type: "string" },
			round: { type: "string", default: "1" },
		},
		strict: true,
	})
	if (values.round === "2") {
		const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
		const round1FixturePath = BRACKETING_FIXTURE_PATH
		const round2FixturePath = values.fixture ?? BRACKETING_ROUND_2_FIXTURE_PATH
		const outPath = values.out ?? BRACKETING_ROUND_2_ANALYSIS_PATH
		const analysis = analyzeBracketingRound2(
			await loadFixture(round1FixturePath),
			await loadFixture(round2FixturePath),
			readAll(warehousePath),
			{
				warehousePath,
				round1FixturePath,
				round2FixturePath,
				round2BatchId: values.batch ?? BRACKETING_ROUND_2_BATCH_ID,
			},
		)
		await mkdir(dirname(outPath), { recursive: true })
		await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
		process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
		process.stdout.write(`\nwrote ${outPath}\n`)
		return
	}
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
	const fixturePath = values.fixture ?? BRACKETING_FIXTURE_PATH
	const outPath = values.out ?? BRACKETING_ANALYSIS_PATH
	// One round at a time, and by default the round the reviewer is actually working through.
	// Pooling two passes over the same pairs would be the worst kind of quiet error: the numbers
	// would still look reasonable.
	const batchId = values.batch ?? BRACKETING_ACTIVE_BATCH_ID

	const fixture = await loadFixture(fixturePath)
	// A missing warehouse reads as empty: a round nobody has started is a normal state, not an error.
	const records = readAll(warehousePath)
	const analysis = analyzeBracketing(fixture, records, { warehousePath, fixturePath, batchId })

	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
	process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
