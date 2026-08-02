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
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_FIXTURE_PATH,
	PART2_STRATUM,
	QUADRANTS,
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

	const part1Observations = observationsFor(part1Items, answers, (item) => item.truth.okLabDistance)
	const pooled = fitLogistic(part1Observations, "decreasing")

	const quadrants: QuadrantResult[] = QUADRANTS.map((quadrant: Quadrant) => {
		const inQuadrant = part1Items.filter((item) => item.stratum === quadrant)
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

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string" },
			fixture: { type: "string" },
			out: { type: "string" },
			batch: { type: "string" },
		},
		strict: true,
	})
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
