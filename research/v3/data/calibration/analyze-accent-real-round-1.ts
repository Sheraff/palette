/**
 * Score `accent-real-1` against its pre-registration.
 *
 * The rule this implements is frozen in `data/calibration/accent-real-round-1-preregistration.md`
 * §6, written before the batch was pushed and therefore before any answer to it could exist.
 * **Nothing here decides anything**: the gates run in the pre-registered order, the first one that
 * trips names the verdict, and the proposal for `ACCENT_FUNCTIONAL_DISTANCE` is written as a
 * proposal. Adopting it is the reviewer's act (`PHASE_0_DECISIONS.md` §4, and the `DECISION PENDING`
 * convention A17 established). **This file never edits `constants.ts`.**
 *
 * Run it:
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/data/calibration/analyze-accent-real-round-1.ts [--warehouse P] [--out P]
 *
 * It is safe — and useful — to run before the round is answered: it reports `incomplete` and shows
 * how far the pass has got. That is also the smoke test that this file works, run at push time so
 * that a broken analyzer is discovered while it is cheap rather than after the reviewer has spent
 * their attention on 45 items. `analyze-accent-functional-round-1.ts` was pushed under the same
 * rule and is the template this file follows.
 *
 * ## What is different from round 1's analyzer, and why
 *
 * Three things, all forced by the round's design rather than chosen:
 *
 * 1. **The answers are a three-option enum, not a boolean.** `works` / `does_not_work` /
 *    `cant_tell` (prereg §2.1 — `BOOLEAN_HOTKEYS` is fixed at y/n and `validateFixture` refuses a
 *    third answer on it, so the house standard for "y/n with an escape" is an enum). That means the
 *    answers arrive as **oracle-label** records keyed by `(questionKey, imageId)`, so they are
 *    collected with `collectAnswers` from `analyze-probe-gold.ts` and joined through the *fixture*
 *    items — the truth file carries `imageId: null` on the anchors, which never render a cover.
 * 2. **The six anchors' round-1 answers come from a different round with a different record
 *    shape.** `accent-functional-1` was a bracketing round: booleans, keyed by item id. So its
 *    answers are collected with the *other* `collectAnswers`, from `analyze-bracketing.ts`, against
 *    the round-1 fixture, and joined on `truth.replays`. Two collectors is not duplication; it is
 *    two record shapes, and pretending otherwise is how a bridge silently reads zero pairs.
 * 3. **The fit is wrapped in `fitWithDeclaredSupport`** (prereg §6.2). The estimator underneath is
 *    `fitLogistic`, *unchanged*, because this round's threshold has to be comparable with 0.04554
 *    and 0.07444 and that requires the same estimator rather than a similar one. The wrapper adds
 *    the declared support so the truncation verdict and `extrapolatedBeyondSample` travel with the
 *    number instead of being remembered separately — which is the whole reason `src/stats` exists.
 *
 * ## The bridge measurements are the round's second deliverable, and they are never pooled
 *
 * §6.3. The six anchors and the Sunshine item are a different stimulus class and a known prior
 * answer respectively; pooling either into the fit would let the lab side move the real number.
 * They are measured, reported beside the fit, and kept out of it.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	type LogisticFit,
	type Observation,
	collectAnswers as collectRound1Answers,
	fitLogistic,
	loadFixture as loadBracketingFixture,
} from "../../src/review-server/analyze-bracketing.ts"
import { collectAnswers as collectEnumAnswers } from "../../src/review-server/analyze-probe-gold.ts"
import { ACCENT_FUNCTIONAL_FIXTURE_PATH } from "../../src/review-server/accent-functional.ts"
import {
	ACCENT_REAL_BATCH_ID,
	ACCENT_REAL_FIXTURE_PATH,
	ACCENT_REAL_PROMPT,
	ACCENT_REAL_TRUTH_PATH,
	ANCHOR_SOURCE_BATCH_ID,
	SUNSHINE_EXPECTED_DISTANCE,
	SUNSHINE_PRIOR_VERDICT,
	SUNSHINE_PRIOR_VERDICT_SOURCE,
	type AccentRealTruthItem,
} from "../../src/review-server/accent-real.ts"
import type { OracleValidationFixture } from "../../src/review-server/oracle-validation.ts"
import {
	ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE,
	fitWithDeclaredSupport,
	honestLine,
	mcnemarExact,
	wilsonInterval,
	type SampleSupport,
} from "../../src/stats/index.ts"
import { DEFAULT_WAREHOUSE_PATH } from "../../src/warehouse/cli.ts"
import { readAll } from "../../src/warehouse/warehouse.ts"

/* ------------------------------------------------------------------------------------------- */
/* The pre-registered numbers. Constants, so that no branch below can quietly move one.          */
/* ------------------------------------------------------------------------------------------- */

/** §6.1 G1 — all four controls, and `cant_tell` on one is a *wrong* answer, not a missing one. */
const REQUIRED_CONTROLS = 4

/** §6.1 G2 — "at least 3 of 4 repeats must agree with their twin". */
const REPEAT_COUNT = 4
const MIN_REPEAT_AGREEMENT = 3

/** §6.1 G3 — "at least 27 of the 30 real ladder items answered **and all four controls**". */
const MIN_ANSWERED_LADDER_ITEMS = 27

/**
 * §6.4 refusal 1 — `accent-functional-1`'s own fitted threshold, on flat synthetic panels.
 *
 * A real-stimulus threshold *below* it would mean real covers need **less** separation than the
 * lab panels, which falsifies the premise that commissioned this round. That is a finding, not a
 * failure (prereg §6.4.1), and it puts round 1's reading 2 — "the wording landed and the retraction
 * was a priori" — back in play.
 */
const ROUND1_SYNTHETIC_THRESHOLD = 0.04554

/** §6.4 refusal 2 — the largest distance any stimulus in either round has ever carried. */
const LADDER_MAX_ACHIEVED = 0.30244

/** §6.4 — "THE ADOPTION WINDOW IS [0.04554, 0.30244], AND A VALUE ABOVE THE PLACEHOLDER IS INSIDE IT." */
const ADOPTION_WINDOW = { low: ROUND1_SYNTHETIC_THRESHOLD, high: LADDER_MAX_ACHIEVED } as const

/**
 * §6.4 refusal 4 — round 1 part 2's pooled interval (0.05211–0.10564) and the multiple of its width
 * above which a separation gap is "a bracket too loose to call a measurement".
 */
const ROUND1_POOLED_INTERVAL_WIDTH = 0.10564 - 0.05211
const MAX_SEPARATION_WIDTH_MULTIPLE = 1.5

/**
 * §6.4 refusal 5 — the Sunshine pair, `#fac751` on `#d5cebe`: OKLab 0.12117, APCA **Lc 0.000**.
 *
 * A threshold at or below this **grants** the escape at the exact distance the reviewer has called
 * unreadable. If they deny it again inside a blinded ladder, adopting such a threshold would
 * re-grant an escape denied twice on the same pixels.
 */
const SUNSHINE_DISTANCE = SUNSHINE_EXPECTED_DISTANCE

/** §6.3 — round 1 part 2's *detection* threshold. Reported for comparison; it gates nothing here. */
const DETECTION_THRESHOLD = 0.07444

/** The constant under calibration, and its current placeholder value (`constants.ts:371`). */
const CONSTANT_UNDER_CALIBRATION = "ACCENT_FUNCTIONAL_DISTANCE"
const PLACEHOLDER_VALUE = 0.14591

const ANALYSIS_SCHEMA = "accent-real-round-1-analysis/v1"
const TRUTH_SCHEMA = "accent-real-round-1-truth/v1"

const PREREGISTRATION = "research/v3/data/calibration/accent-real-round-1-preregistration.md"
const ANALYZER_REF = "research/v3/data/calibration/analyze-accent-real-round-1.ts"

/** The three answers, exactly as `ACCENT_REAL_ANSWERS` spells them. */
const WORKS = "works"
const DOES_NOT_WORK = "does_not_work"
const CANT_TELL = "cant_tell"

export type Verdict =
	| "adopt"
	| "contradicts-realism-diagnosis"
	| "refuses-endorsed"
	| "stratum-dependent"
	| "bracketed-only"
	| "contradicts-sunshine"
	| "unsupported-claim"
	| "no-reliable-rate"
	| "noise-dominated"
	| "incomplete"
	| "void"

/* ------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                 */
/* ------------------------------------------------------------------------------------------- */

/** §6.2: "The calibrated value is `fit.threshold`, rounded to five decimals." */
function round5(value: number): number {
	return Number(value.toFixed(5))
}

function round4(value: number): number {
	return Number(value.toFixed(4))
}

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * The interval a stratum fit is compared against (§6.4 refusal 3): the pooled 95% confidence
 * interval when there is one, else its separation interval.
 *
 * Under complete separation there *is* no confidence interval — the unpenalised likelihood has no
 * finite maximum — and the separation gap is the honest statement of the same uncertainty, so it
 * stands in. A stratum with no interval of its own cannot disagree with anything: absence of
 * evidence is not disagreement, so it is skipped rather than counted as a failure.
 */
function pooledInterval(fit: LogisticFit): { low: number; high: number } | null {
	return fit.confidenceInterval ?? fit.separationInterval
}

/** A Wilson interval reduced to the two numbers a report prints, or `null` when it refused. */
function wilson(successes: number, trials: number): { low: number; high: number } | null {
	const result = wilsonInterval(successes, trials, 0.95)
	return result.ok ? { low: round4(result.low), high: round4(result.high) } : null
}

/* ------------------------------------------------------------------------------------------- */
/* Reading the round                                                                             */
/* ------------------------------------------------------------------------------------------- */

type TruthFile = Readonly<{
	batchId: string
	schema: string
	criterion: string
	question: string
	instruction: string
	items: readonly AccentRealTruthItem[]
}>

async function loadTruth(path: string): Promise<TruthFile> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as TruthFile
	// The schema string is checked rather than trusted: this analyzer reads `governing.okLabDistance`
	// and `placementProfile` by name, and a truth file written by a different generator would answer
	// those lookups with `undefined` and produce a fit over NaN rather than an error.
	if (parsed.schema !== TRUTH_SCHEMA) {
		throw new Error(`${path} carries schema ${parsed.schema}, expected ${TRUTH_SCHEMA}`)
	}
	return parsed
}

async function loadRealFixture(path: string): Promise<OracleValidationFixture> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as OracleValidationFixture
	if (parsed.purpose !== "oracle-validation" || !Array.isArray(parsed.items)) {
		throw new Error(`${path} does not look like an oracle-validation fixture`)
	}
	return parsed
}

/**
 * Build the item-id → answer map by joining the truth to the answers **through the fixture**.
 *
 * The enum collector keys on `(questionKey, imageId)` because that is what an oracle-label record
 * carries — there is no item id in the record. The truth file cannot supply the `imageId` for every
 * item: the six anchors are round 1's flat panels and have **no artwork** (`imageId: null`), while
 * the *fixture* gives each of them a distinct otherwise-unused cover reference that the panel
 * renderer ignores entirely (prereg §3.3). So the fixture is the join table, and joining on the
 * truth's own `imageId` would silently lose exactly the six items the bridge is made of.
 */
function joinAnswers(
	fixture: OracleValidationFixture,
	truth: TruthFile,
	byQuestionAndImage: ReadonlyMap<string, string>,
): { byItemId: Map<string, string>; unexpectedAnswers: string[]; itemsWithoutFixtureRow: string[] } {
	const fixtureByItemId = new Map(fixture.items.map((item) => [item.itemId, item]))
	const byItemId = new Map<string, string>()
	const unexpectedAnswers: string[] = []
	const itemsWithoutFixtureRow: string[] = []
	for (const item of truth.items) {
		const row = fixtureByItemId.get(item.itemId)
		if (row === undefined) {
			itemsWithoutFixtureRow.push(item.itemId)
			continue
		}
		const answer = byQuestionAndImage.get(`${row.questionKey} ${row.imageId}`)
		if (answer === undefined) continue
		// An answer outside the three declared keys is a defect somewhere upstream, not a data point.
		// It is recorded in `answerHygiene` and dropped, never coerced into one of the three columns.
		if (answer !== WORKS && answer !== DOES_NOT_WORK && answer !== CANT_TELL) {
			unexpectedAnswers.push(`${item.itemId}=${answer}`)
			continue
		}
		byItemId.set(item.itemId, answer)
	}
	return { byItemId, unexpectedAnswers, itemsWithoutFixtureRow }
}

/**
 * The fitted points: **decided** answers only, at the **achieved** governing distance.
 *
 * Two exclusions, both pre-registered. `cant_tell` items leave the fit and are counted in G4 (§6.1)
 * — the escape's share is a first-class result and is never subtracted from anything. And the
 * distance is `governing.okLabDistance`, the measured 8-bit value, never `targetDistance`: §3.2
 * measures what survived rounding rather than assuming it, and §6.2 says in as many words that the
 * fit uses the achieved distance.
 */
function observationsFor(
	items: readonly AccentRealTruthItem[],
	answers: ReadonlyMap<string, string>,
): Observation[] {
	const out: Observation[] = []
	for (const item of items) {
		const answer = answers.get(item.itemId)
		if (answer !== WORKS && answer !== DOES_NOT_WORK) continue
		out.push({ itemId: item.itemId, distance: item.governing.okLabDistance, yes: answer === WORKS })
	}
	return out
}

/** The escape's share over the answered items of one stratum, with its Wilson interval. */
function escapeShareOf(
	label: string,
	items: readonly AccentRealTruthItem[],
	answers: ReadonlyMap<string, string>,
): {
	stratum: string
	answered: number
	cantTell: number
	share: number | null
	interval: { low: number; high: number } | null
	reliableRate: boolean | null
} {
	const answered = items.filter((item) => answers.has(item.itemId))
	const cantTell = answered.filter((item) => answers.get(item.itemId) === CANT_TELL).length
	const share = answered.length === 0 ? null : cantTell / answered.length
	return {
		stratum: label,
		answered: answered.length,
		cantTell,
		share: share === null ? null : round4(share),
		interval: wilson(cantTell, answered.length),
		// REVIEW_UI.md §4: "A stratum whose escape share exceeds half has no reliable rate and is
		// reported as having none." Reported per stratum whether or not G4 fires on the pooled share.
		reliableRate: share === null ? null : share <= ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE,
	}
}

/** Group ladder items by one of the three pre-registered strata. */
function groupBy<K>(
	items: readonly AccentRealTruthItem[],
	key: (item: AccentRealTruthItem) => K | null,
): Map<K, AccentRealTruthItem[]> {
	const out = new Map<K, AccentRealTruthItem[]>()
	for (const item of items) {
		const group = key(item)
		if (group === null) continue
		out.set(group, [...(out.get(group) ?? []), item])
	}
	return out
}

/**
 * §6.5 — the distance at which the fitted curve first exceeds P(works) = 0.9.
 *
 * `fitLogistic` reports its coefficients already de-centred, so the curve is
 * `P = 1 / (1 + exp(-(intercept + slope · log d)))` and the 0.9 point is `exp((ln 9 − a) / b)`.
 * Exploratory: it is a property of the fitted shape, well above the 50% point the round is
 * calibrating, and it can never change the verdict.
 */
function distanceAtProbability(fit: LogisticFit, probability: number): number | null {
	if (fit.intercept === null || fit.slope === null || fit.slope <= 0) return null
	const value = Math.exp((Math.log(probability / (1 - probability)) - fit.intercept) / fit.slope)
	return Number.isFinite(value) ? round5(value) : null
}

/* ------------------------------------------------------------------------------------------- */

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string", default: DEFAULT_WAREHOUSE_PATH },
			out: { type: "string" },
			quiet: { type: "boolean", default: false },
		},
		strict: true,
	})
	const outPath =
		values.out ?? fileURLToPath(new URL("./accent-real-round-1-analysis.json", import.meta.url))

	const fixture = await loadRealFixture(ACCENT_REAL_FIXTURE_PATH)
	const truth = await loadTruth(ACCENT_REAL_TRUTH_PATH)
	const records = readAll(values.warehouse)

	const collected = collectEnumAnswers(records, ACCENT_REAL_BATCH_ID)
	const joined = joinAnswers(fixture, truth, collected.byQuestionAndImage)
	const answers = joined.byItemId

	const ladderItems = truth.items.filter((item) => item.role === "ladder")
	const anchorItems = truth.items.filter((item) => item.role === "anchor")
	const sunshineItem = truth.items.find((item) => item.role === "sunshine") ?? null
	const controlItems = truth.items.filter(
		(item) => item.role === "control-obvious" || item.role === "control-identical",
	)
	const repeatItems = truth.items.filter((item) => item.role === "repeat")

	/* --- G1: controls --------------------------------------------------------------------------- */
	// §6.1 G1: `control-obvious` must be `works`, `control-identical` must be `does_not_work`, and
	// **`cant_tell` on a control is a wrong answer** — both directions are unambiguous under any
	// reading of the criterion. A control that is merely *unanswered* is not a failure; that is G3's
	// business, and "the reviewer was not attending" and "the reviewer is not finished" must not
	// share a verdict.
	const controlChecks = controlItems.map((item) => {
		const expected = item.role === "control-obvious" ? WORKS : DOES_NOT_WORK
		const answer = answers.get(item.itemId) ?? null
		return {
			itemId: item.itemId,
			role: item.role,
			governingRole: item.governingRole,
			okLabDistance: round5(item.governing.okLabDistance),
			apcaLc: round4(item.governing.apcaLc),
			expected,
			answered: answer !== null,
			answer,
			passed: answer !== null && answer === expected,
		}
	})
	const controlsAnswered = controlChecks.filter((check) => check.answered).length
	const controlsPassed = controlChecks.filter((check) => check.passed).length
	const controlsFailed = controlChecks.filter((check) => check.answered && !check.passed)

	/* --- G2: repeats ---------------------------------------------------------------------------- */
	// A repeat carries a NEW question key (the fixture has to: `validateFixture` refuses a repeated
	// (questionKey, imageId) pair), so agreement is checked on the two *item ids*, and the raw enum
	// is compared — two `cant_tell`s agree, which is the reviewer being consistently undecided
	// rather than noisy.
	const repeatRows = repeatItems.map((item) => {
		const here = answers.get(item.itemId) ?? null
		const there = item.repeatOf === null ? null : (answers.get(item.repeatOf) ?? null)
		return {
			itemId: item.itemId,
			repeatOf: item.repeatOf,
			rung: item.rung,
			okLabDistance: round5(item.governing.okLabDistance),
			answer: here,
			twinAnswer: there,
			comparable: here !== null && there !== null,
			agreed: here !== null && there !== null && here === there,
		}
	})
	const repeatsComparable = repeatRows.filter((row) => row.comparable).length
	const repeatsAgreed = repeatRows.filter((row) => row.agreed).length
	const repeatsDisagreed = repeatsComparable - repeatsAgreed
	// §6.1 G2 is "at least 3 of 4", and "repeats with only one of the pair answered are not counted
	// either way". Stated as a count of *disagreements* so a half-answered round cannot trip it:
	// two disagreements already make 3-of-4 unreachable, and on the complete round the two readings
	// are the same condition. The alternative — `agreed < 3` — fires on a round with two comparable
	// pairs that both agreed, which is not noise, it is an unfinished pass.
	const repeatGateTripped = repeatsDisagreed > REPEAT_COUNT - MIN_REPEAT_AGREEMENT

	/* --- G3: coverage --------------------------------------------------------------------------- */
	// "Answered" here counts all three enum values: `cant_tell` is an answer, and the reviewer having
	// answered it is not the same fact as it being usable in the fit. G4 handles the escape's share;
	// double-counting it as incompleteness would report a decided round as unfinished.
	const ladderAnswered = ladderItems.filter((item) => answers.has(item.itemId)).length

	/* --- G4: the escape's share ------------------------------------------------------------------ */
	const pooledEscape = escapeShareOf("pooled (30 ladder items)", ladderItems, answers)

	/* --- the primary fit, over the 30 ladder items and nothing else ------------------------------ */
	const observations = observationsFor(ladderItems, answers)

	/**
	 * §6.2 verbatim. `selectionRule` is copied from the fixture rather than restated here, so the
	 * declaration cannot drift away from the rule the generator actually applied; and the relation is
	 * `independent-of-the-variable` because admission depends on the field colour and the gamut and
	 * **never on any answer** (§3.4). `observedValues` is the fitted sample's own distances — the
	 * question the guard answers is what *this fit* saw, not what the fixture contains.
	 */
	const support: SampleSupport = {
		variableUnderTest: "OKLab distance between the accent and its governing field",
		claimDomain: { min: 0.06, max: 0.3 },
		observedValues: observations.map((point) => point.distance),
		selectionRule: fixture.selection.rule,
		selectionRelationToVariable: { kind: "independent-of-the-variable" },
	}
	// "increasing": the probability of "works as an accent" rises with distance. Round 1's direction,
	// and the only one that makes sense for this criterion. The estimator is unchanged from round 1
	// on purpose — comparability with 0.04554 and 0.07444 requires the same estimator, not a similar
	// one — and the wrapper adds the support declaration without touching the arithmetic.
	const guarded = fitWithDeclaredSupport(
		support,
		() => fitLogistic(observations, "increasing"),
		(fit) => fit.threshold,
	)
	const primary = guarded.fit
	const separationWidth =
		primary.separationInterval === null
			? null
			: primary.separationInterval.high - primary.separationInterval.low

	/* --- stratum fits: §6.4 refusal 3, and §6.5's exploratory cuts ------------------------------- */
	const bandGroups = groupBy(ladderItems, (item) => item.band)
	const hueGroups = groupBy(ladderItems, (item) => item.hueThird)
	const roleGroups = groupBy(ladderItems, (item) => item.governingRole)

	const bandFits = [...bandGroups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([band, items]) => ({
			stratum: `band:${band}`,
			items: items.length,
			...fitLogistic(observationsFor(items, answers), "increasing"),
		}))
	const hueFits = [...hueGroups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([hueThird, items]) => ({
			stratum: `hue-third:${hueThird}`,
			items: items.length,
			...fitLogistic(observationsFor(items, answers), "increasing"),
		}))
	const roleFits = [...roleGroups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([governingRole, items]) => ({
			stratum: `governing-role:${governingRole}`,
			items: items.length,
			...fitLogistic(observationsFor(items, answers), "increasing"),
		}))

	const interval = pooledInterval(primary)
	// §6.4 refusal 3 tests all three cuts against the pooled interval. The governing-role cut is the
	// one that matters most: it is the round's only handle on §5's surface-role rival — "what matters
	// is the SURFACE ROLE the accent sits on rather than realism as such" — and a disagreement
	// between the surface and background halves would be a finding about *what the constant is a
	// function of*, not a nuisance to be averaged away.
	const disagreeingStrata = [...bandFits, ...hueFits, ...roleFits]
		.filter(
			(fit) =>
				interval !== null &&
				fit.threshold !== null &&
				(fit.threshold < interval.low || fit.threshold > interval.high),
		)
		.map((fit) => ({ stratum: fit.stratum, threshold: round5(fit.threshold!) }))

	/* --- §6.3 bridge 1: the lab-versus-real gap, on six pixel-identical panels ------------------- */
	// Round 1 was a *bracketing* round: boolean answers, keyed by item id, under its own fixture
	// version. So its answers need the other collector and the other fixture, and the join is
	// `truth.replays` — the round-1 item id these pixels come from.
	const round1Fixture = await loadBracketingFixture(ACCENT_FUNCTIONAL_FIXTURE_PATH)
	const round1 = collectRound1Answers(records, round1Fixture, ANCHOR_SOURCE_BATCH_ID)
	const anchorRows = anchorItems.map((item) => {
		const here = answers.get(item.itemId) ?? null
		const thereAnswer = item.replays === null ? undefined : round1.byItemId.get(item.replays)
		const there = thereAnswer === undefined ? null : thereAnswer.answer
		return {
			itemId: item.itemId,
			replays: item.replays,
			okLabDistance: round5(item.governing.okLabDistance),
			apcaLc: round4(item.governing.apcaLc),
			labAnswer: there === null ? null : there ? WORKS : DOES_NOT_WORK,
			realRoundAnswer: here,
			// §2.1's declared imperfection: round 1 offered yes/no and nothing else, so an anchor
			// answered `cant_tell` here has no counterpart in round 1's two-valued record. It is
			// excluded from the 2x2 and counted, rather than folded into either column.
			escaped: here === CANT_TELL,
			paired: here !== null && here !== CANT_TELL && there !== null,
		}
	})
	const pairedAnchors = anchorRows.filter((row) => row.paired)
	// Arm 1 is round 1 (the lab), arm 2 is this round (the real-cover pass); "success" is `works`.
	// **Two-sided.** §6.3's prediction — "anchors should be answered more favourably than real items
	// at the same distance" — is a prediction about anchors *versus ladder items*, not about these
	// same panels answered twice, so no direction was fixed in advance for this test and a one-sided
	// p-value here would be a direction chosen after the fact.
	const anchorBridge = mcnemarExact({
		alternative: "two-sided",
		pairLabel: "anchor panel",
		counts: {
			bothSucceeded: pairedAnchors.filter((row) => row.labAnswer === WORKS && row.realRoundAnswer === WORKS).length,
			onlyFirstSucceeded: pairedAnchors.filter(
				(row) => row.labAnswer === WORKS && row.realRoundAnswer === DOES_NOT_WORK,
			).length,
			onlySecondSucceeded: pairedAnchors.filter(
				(row) => row.labAnswer === DOES_NOT_WORK && row.realRoundAnswer === WORKS,
			).length,
			neitherSucceeded: pairedAnchors.filter(
				(row) => row.labAnswer === DOES_NOT_WORK && row.realRoundAnswer === DOES_NOT_WORK,
			).length,
		},
	})

	/* --- §6.3 bridge 2: real minus synthetic, with sign ------------------------------------------ */
	// The realism diagnosis predicts this is POSITIVE. An interval containing zero means the round
	// did not separate the two stimulus classes — which is a result, not a missing one.
	const realThreshold = primary.threshold === null ? null : round5(primary.threshold)
	const realVsSynthetic = realThreshold === null ? null : round5(realThreshold - ROUND1_SYNTHETIC_THRESHOLD)

	/* --- §6.3 bridge 3: the Sunshine item, one item reported as one item ------------------------- */
	const sunshineAnswer = sunshineItem === null ? null : (answers.get(sunshineItem.itemId) ?? null)
	const sunshine = {
		itemId: sunshineItem?.itemId ?? null,
		okLabDistance: sunshineItem === null ? null : round5(sunshineItem.governing.okLabDistance),
		apcaLc: sunshineItem === null ? null : round4(sunshineItem.governing.apcaLc),
		priorVerdict: SUNSHINE_PRIOR_VERDICT,
		priorVerdictSource: SUNSHINE_PRIOR_VERDICT_SOURCE,
		answer: sunshineAnswer,
		reproducesPriorVerdict: sunshineAnswer === null ? null : sunshineAnswer === SUNSHINE_PRIOR_VERDICT,
		// §6.4 refusal 5's parenthesis: a `works` here is a RETRACTION OF THE CHAT RULING and is
		// reported loudly, because it would change the standing of
		// `d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`.
		retractsChatRuling: sunshineAnswer === WORKS,
		note:
			sunshineAnswer === WORKS
				? "LOUD: the Sunshine item was answered `works` inside a blinded ladder, against the reviewer's " +
					"own chat ruling that this exact pair is unreadable. That is a retraction of the chat ruling " +
					"and it changes the standing of the endorsement retirement it produced. The reviewer rules."
				: "one item, one known prior answer, reported on its own and never pooled into the fit",
	}

	/* --- the verdict, in the pre-registered order ------------------------------------------------- */
	let verdict: Verdict
	let verdictReason: string

	if (controlsFailed.length > 0) {
		verdict = "void"
		verdictReason =
			`G1: ${controlsFailed.map((check) => `${check.itemId}=${check.answer}`).join(", ")} answered against a ` +
			"known-correct answer (`cant_tell` on a control counts as wrong — both directions are unambiguous " +
			"under any reading). A control failure is not a data point about colour: the pass is void and the " +
			"round is re-run."
	} else if (repeatGateTripped) {
		verdict = "noise-dominated"
		verdictReason =
			`G2: ${repeatsAgreed} of ${repeatsComparable} comparable repeats agreed (${repeatsDisagreed} disagreed), ` +
			`so the pre-registered ${MIN_REPEAT_AGREEMENT} of ${REPEAT_COUNT} can no longer be met. The fit below ` +
			"is exploratory only and the constant does not move on it."
	} else if (ladderAnswered < MIN_ANSWERED_LADDER_ITEMS || controlsAnswered < REQUIRED_CONTROLS) {
		verdict = "incomplete"
		verdictReason =
			`G3: ${ladderAnswered} of ${ladderItems.length} real ladder items answered ` +
			`(${MIN_ANSWERED_LADDER_ITEMS} required) and ${controlsAnswered} of ${REQUIRED_CONTROLS} controls ` +
			"answered. Nothing is wrong — the round is not finished."
	} else if (pooledEscape.share !== null && pooledEscape.share > ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE) {
		verdict = "no-reliable-rate"
		verdictReason =
			`G4: ${pooledEscape.cantTell} of ${pooledEscape.answered} answered ladder items were \`cant_tell\`, a ` +
			`share of ${pooledEscape.share} — above half. REVIEW_UI.md §4: a stratum whose escape share exceeds ` +
			"half has no reliable rate and is reported as having none. No threshold is adopted, and the share is " +
			"reported rather than subtracted."
	} else if (primary.threshold === null || !primary.converged) {
		// §6.4 opens with "If G1-G4 pass **and the fit converges**" but names no verdict for the case
		// where it does not. `incomplete` is round 1's analyzer's convention for it, carried here so
		// the two rounds' outputs read the same way; the reason string names the fit's own note so
		// nobody mistakes it for an unfinished pass.
		verdict = "incomplete"
		verdictReason = `the fit did not produce a usable threshold: ${primary.note ?? "no reason recorded"}`
	} else if (primary.threshold < ROUND1_SYNTHETIC_THRESHOLD) {
		verdict = "contradicts-realism-diagnosis"
		verdictReason =
			`refusal 1: the fitted threshold ${realThreshold} is below ${ROUND1_SYNTHETIC_THRESHOLD}, the threshold ` +
			"the same criterion produced on flat synthetic panels. Real stimuli would need LESS separation than " +
			"the lab, which falsifies the premise that commissioned this round. This is a FINDING, not a failure: " +
			"the realism diagnosis would be wrong and round 1's reading 2 (the wording landed, the retraction was " +
			"a priori) is back in play. No constant moves on it; the reviewer rules."
	} else if (primary.threshold > LADDER_MAX_ACHIEVED) {
		verdict = "refuses-endorsed"
		verdictReason =
			`refusal 2: the fitted threshold ${realThreshold} is above ${LADDER_MAX_ACHIEVED}, the largest distance ` +
			"any stimulus in either round has ever carried. Adopting it would refuse accents the reviewer endorsed " +
			"on synthetic panels at 0.24181 and above. The repair is a wider ladder, not adoption."
	} else if (disagreeingStrata.length > 0) {
		verdict = "stratum-dependent"
		verdictReason =
			`refusal 3: ${disagreeingStrata.map((entry) => `${entry.stratum}=${entry.threshold}`).join(", ")} fell ` +
			"outside the pooled 95% interval, so NO SINGLE SCALAR IS ADOPTED. If the governing-role cut is among " +
			"them, that is the surface-role rival of §5 showing itself — a finding about what the constant is a " +
			"function of."
	} else if (
		primary.separated &&
		separationWidth !== null &&
		separationWidth > ROUND1_POOLED_INTERVAL_WIDTH * MAX_SEPARATION_WIDTH_MULTIPLE
	) {
		verdict = "bracketed-only"
		verdictReason =
			`refusal 4: the answers are completely separated and the gap is ${separationWidth.toFixed(5)} wide, more ` +
			`than ${MAX_SEPARATION_WIDTH_MULTIPLE}x round 1 part 2's pooled interval width ` +
			`(${round5(ROUND1_POOLED_INTERVAL_WIDTH)}). A bracket that loose is not a measurement: the interval is ` +
			"reported, the placeholder stays, and the ladder is refined around the gap."
	} else if (primary.threshold <= SUNSHINE_DISTANCE && sunshineAnswer === DOES_NOT_WORK) {
		verdict = "contradicts-sunshine"
		verdictReason =
			`refusal 5: the fitted threshold ${realThreshold} would GRANT the escape at ${SUNSHINE_DISTANCE}, while ` +
			"the Sunshine item — the same pixels — was answered `does_not_work` in this round. Adopting it would " +
			"re-grant an escape the reviewer has now denied twice: once in chat, once inside a blinded ladder. " +
			"The contradiction is the headline; the reviewer rules."
	} else if (guarded.support.verdict !== "supports-the-claim" && guarded.extrapolatedBeyondSample) {
		verdict = "unsupported-claim"
		verdictReason =
			`refusal 6: assessSupport returned \`${guarded.support.verdict}\` and the fitted threshold ` +
			`${realThreshold} lies outside the sampled range ` +
			`${guarded.support.observedMin}..${guarded.support.observedMax}. A number outside the range the sample ` +
			"covers is not a measurement of that range."
	} else {
		verdict = "adopt"
		verdictReason =
			`all four gates passed, the fit converged, and the threshold ${realThreshold} sits inside the ` +
			`pre-registered adoption window [${ADOPTION_WINDOW.low}, ${ADOPTION_WINDOW.high}] — a window that ` +
			"includes values above the placeholder 0.14591, written that way before any answer existed."
	}

	// §6.4: "Adoption is the reviewer's act, not an agent's. The analysis writes DECISION PENDING and
	// proposes; it does not edit the constant." There is no branch below that touches `constants.ts`.
	const proposal =
		verdict === "adopt" && primary.threshold !== null
			? {
					constant: CONSTANT_UNDER_CALIBRATION,
					currentValue: PLACEHOLDER_VALUE,
					proposedValue: round5(primary.threshold),
					currentTag: "[UNCALIBRATED]",
					proposedTag: "[REVIEWED]",
					provenance: [
						`${ACCENT_REAL_BATCH_ID} — ${ladderAnswered} of ${ladderItems.length} real-cover ladder items, ` +
							`criterion: ${truth.criterion}`,
						PREREGISTRATION,
					],
					status: "DECISION PENDING — adoption is the reviewer's act, not this script's.",
				}
			: null

	/* --- §6.5 exploratory: labelled, and unable to change anything above ------------------------- */
	const escapeShares = [
		pooledEscape,
		...[...bandGroups.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([band, items]) => escapeShareOf(`band:${band}`, items, answers)),
		...[...hueGroups.entries()]
			.sort(([a], [b]) => a - b)
			.map(([hueThird, items]) => escapeShareOf(`hue-third:${hueThird}`, items, answers)),
		...[...roleGroups.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([role, items]) => escapeShareOf(`governing-role:${role}`, items, answers)),
		escapeShareOf("anchors", anchorItems, answers),
	]

	// How much contrast the NON-governing placements carried — the round's own measure of how much a
	// "yes" could have leaked from somewhere other than the pair under test. The flat field means the
	// `field` placement is the same colour as `background`, so a placement is only counted as
	// non-governing when its hex differs from the governing field's; otherwise the governing pair
	// would be double-counted as its own leak.
	const placementRows = ladderItems.map((item) => {
		const others = item.placementProfile.filter(
			(pair) => pair.fieldRole !== item.governingRole && pair.fieldHex !== item.governing.fieldHex,
		)
		const maxDistance = others.length === 0 ? null : Math.max(...others.map((pair) => pair.okLabDistance))
		const maxLc = others.length === 0 ? null : Math.max(...others.map((pair) => Math.abs(pair.apcaLc)))
		return {
			itemId: item.itemId,
			answer: answers.get(item.itemId) ?? null,
			governingRole: item.governingRole,
			governingDistance: round5(item.governing.okLabDistance),
			nonGoverningRoles: others.map((pair) => pair.fieldRole),
			maxNonGoverningDistance: maxDistance === null ? null : round5(maxDistance),
			maxNonGoverningAbsLc: maxLc === null ? null : round4(maxLc),
			// Every governing pair carries `apcaLc == 0` by construction (§3.2). A non-governing
			// placement that does not is a place a "yes" could have come from.
			anyNonGoverningLuminanceContrast: maxLc !== null && maxLc > 0,
		}
	})
	const placementLc = placementRows
		.map((row) => row.maxNonGoverningAbsLc)
		.filter((value): value is number => value !== null)

	const analysis = {
		schema: ANALYSIS_SCHEMA,
		batchId: ACCENT_REAL_BATCH_ID,
		analyzedAt: new Date().toISOString(),
		analyzer: ANALYZER_REF,
		fixture: ACCENT_REAL_FIXTURE_PATH,
		truth: ACCENT_REAL_TRUTH_PATH,
		preregistration: PREREGISTRATION,
		warehouse: values.warehouse,
		criterion: truth.criterion,
		question: ACCENT_REAL_PROMPT.question,
		instruction: ACCENT_REAL_PROMPT.instruction,

		verdict,
		verdictReason,
		proposal,

		/**
		 * §7: "It echoes this document's rule verbatim under `preRegisteredRule`." Echoed so that the
		 * output is readable without the document beside it, and so that a later reader can see the
		 * rule the numbers were scored against rather than the rule someone remembers.
		 */
		preRegisteredRule: {
			source: `${PREREGISTRATION} §6`,
			evaluation: "Evaluated in the order given; the first gate that trips decides the verdict.",
			gates: {
				G1: "controls — every control that has been ANSWERED must be answered correctly: control-obvious `works`, control-identical `does_not_work`. Any wrong answer => `void`. `cant_tell` on a control is a wrong answer. A control that is merely unanswered is G3's business.",
				G2: `repeat consistency — at least ${MIN_REPEAT_AGREEMENT} of ${REPEAT_COUNT} repeats must agree with their twin. At <= 2 of 4 => \`noise-dominated\`: the fit is reported as exploratory only and the constant is not changed on it. Repeats with only one of the pair answered are not counted either way.`,
				G3: `coverage — at least ${MIN_ANSWERED_LADDER_ITEMS} of the ${ladderItems.length} real ladder items answered AND all ${REQUIRED_CONTROLS} controls answered. Below either => \`incomplete\`, no adoption.`,
				G4: `escape share — if \`cant_tell\` exceeds half (${ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE}) of the answered real ladder items => \`no-reliable-rate\` and no threshold is adopted. The share is reported per stratum whether or not it fires, and it is never subtracted from anything.`,
			},
			primaryFit: {
				population: "the 30 `ladder` items and nothing else — anchors, the Sunshine item and repeats are never pooled; `cant_tell` items are excluded from the fit and counted in G4",
				estimator: "fitLogistic from src/review-server/analyze-bracketing.ts, unchanged, direction `increasing`, on the ACHIEVED governing-pair okLabDistance",
				wrapper: "fitWithDeclaredSupport from src/stats",
				declaredSupport: {
					variableUnderTest: support.variableUnderTest,
					claimDomain: support.claimDomain,
					selectionRule: support.selectionRule,
					selectionRelationToVariable: support.selectionRelationToVariable.kind,
				},
				calibratedValue: "round(fit.threshold, 5); under complete separation fitLogistic reports the geometric midpoint of the separation interval and sets `separated: true` — used as-is, and `separated` is reported in the headline, because a bracket is not a measurement",
			},
			adoptionWindow: ADOPTION_WINDOW,
			adoptionWindowNote:
				"A VALUE ABOVE THE PLACEHOLDER 0.14591 IS INSIDE THE WINDOW. The real-cover evidence points up: " +
				"the reviewer called 0.121 unreadable, and if the realism diagnosis is right the real threshold " +
				"sits above the placeholder and the constant should RISE. That outcome is pre-registered as an " +
				"ordinary adoptable result — and equally, a rise cannot be claimed as a prediction confirmed if " +
				"the number in fact lands low. Both directions were writable before any answer existed.",
			refusals: {
				"1": `threshold < ${ROUND1_SYNTHETIC_THRESHOLD} => \`contradicts-realism-diagnosis\` — a finding, not a failure`,
				"2": `threshold > ${LADDER_MAX_ACHIEVED} => \`refuses-endorsed\` — the repair is a wider ladder, not adoption`,
				"3": "any per-band, per-hue-third or per-governing-role threshold outside the pooled 95% interval => `stratum-dependent`, and no single scalar is adopted",
				"4": `\`separated: true\` with a separation interval wider than ${MAX_SEPARATION_WIDTH_MULTIPLE}x round 1 part 2's pooled interval width (${round5(ROUND1_POOLED_INTERVAL_WIDTH)}) => \`bracketed-only\``,
				"5": `threshold <= ${SUNSHINE_DISTANCE} while the Sunshine item is answered \`does_not_work\` => \`contradicts-sunshine\`; and if the Sunshine item is answered \`works\`, that is a retraction of the chat ruling and is reported loudly`,
				"6": "`assessSupport` returns anything other than `supports-the-claim` AND the fitted threshold is `extrapolatedBeyondSample` => `unsupported-claim`",
			},
			adoption:
				"Adoption is the reviewer's act, not an agent's. The analysis writes `DECISION PENDING` and " +
				"proposes; it does not edit the constant.",
			comparisonConstants: {
				round1SyntheticFit: ROUND1_SYNTHETIC_THRESHOLD,
				round1DetectionThreshold: DETECTION_THRESHOLD,
				placeholder: PLACEHOLDER_VALUE,
				sunshine: SUNSHINE_DISTANCE,
				ladderMaxAchieved: LADDER_MAX_ACHIEVED,
			},
		},

		validityGates: {
			G1_controls: {
				required: REQUIRED_CONTROLS,
				answered: controlsAnswered,
				passed: controlsPassed,
				failed: controlsFailed.map((check) => check.itemId),
				checks: controlChecks,
			},
			G2_repeats: {
				repeats: repeatRows.length,
				comparable: repeatsComparable,
				agreed: repeatsAgreed,
				disagreed: repeatsDisagreed,
				required: `${MIN_REPEAT_AGREEMENT} of ${REPEAT_COUNT}`,
				tripped: repeatGateTripped,
				pairs: repeatRows,
			},
			G3_coverage: {
				ladderAnswered,
				ladderTotal: ladderItems.length,
				ladderRequired: MIN_ANSWERED_LADDER_ITEMS,
				ladderDecided: observations.length,
				controlsAnswered,
				controlsRequired: REQUIRED_CONTROLS,
				answeredIncludesCantTell: true,
			},
			G4_escapeShare: {
				...pooledEscape,
				threshold: ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE,
				tripped: pooledEscape.share !== null && pooledEscape.share > ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE,
				neverSubtracted: true,
			},
		},

		primary: {
			population: "role == ladder (30 real-cover items); anchors, sunshine and repeats excluded",
			fit: primary,
			threshold: realThreshold,
			// §6.2: "assessSupport's verdict and extrapolatedBeyondSample are reported in the HEADLINE,
			// not buried. A threshold outside the observed range is an extrapolation regardless of how
			// clean the fit is." And `separated` sits here for the same reason.
			headline: {
				threshold: realThreshold,
				separated: primary.separated,
				separationInterval: primary.separationInterval,
				separationWidth: separationWidth === null ? null : round5(separationWidth),
				confidenceInterval: primary.confidenceInterval,
				supportVerdict: guarded.support.verdict,
				supportsClaimDomain: guarded.support.supportsClaimDomain,
				extrapolatedBeyondSample: guarded.extrapolatedBeyondSample,
			},
			support: guarded.support,
			summary: guarded.summary,
			provenance: guarded.provenance,
			honestLine: honestLine(guarded),
		},

		bridges: {
			note: "§6.3 — three measurements, reported separately, always, and never pooled into the fit.",
			labVersusReal: {
				what: "the six anchors' answers here against the same panels' answers in accent-functional-1, paired on identical pixels",
				prediction:
					"if the realism diagnosis is right, anchors should be answered MORE favourably than real items " +
					"at the same distance — the flat panel flatters. A null result here is a real finding and would " +
					"put the diagnosis itself back on the table.",
				arms: { first: `${ANCHOR_SOURCE_BATCH_ID} (the lab round)`, second: `${ACCENT_REAL_BATCH_ID} (this round)` },
				pairs: pairedAnchors.length,
				escapesExcluded: anchorRows.filter((row) => row.escaped).length,
				unansweredHere: anchorRows.filter((row) => row.realRoundAnswer === null).length,
				missingLabAnswer: anchorRows.filter((row) => row.labAnswer === null).length,
				test: anchorBridge,
				honestLine: honestLine(anchorBridge),
				anchors: anchorRows,
			},
			realVsSynthetic: {
				what: "realThreshold - the synthetic round's fitted threshold, with sign",
				syntheticThreshold: ROUND1_SYNTHETIC_THRESHOLD,
				realThreshold,
				difference: realVsSynthetic,
				sign: realVsSynthetic === null ? null : realVsSynthetic > 0 ? "positive" : realVsSynthetic < 0 ? "negative" : "zero",
				realThreshold95: primary.confidenceInterval,
				predictedPositiveBy: "d-2026-08-04-accent-calibration-is-a-stimulus-realism-problem",
				intervalContainsZeroNote:
					"an interval on the real threshold that contains " +
					`${ROUND1_SYNTHETIC_THRESHOLD} means the round did not separate the two stimulus classes`,
			},
			sunshine,
		},

		exploratory: {
			note: "§6.5 — reported, never used to pick the headline. None of these can change the verdict.",
			bandFits,
			hueThirdFits: hueFits,
			governingRoleFits: roleFits,
			disagreeingStrata,
			escapeShareByStratum: escapeShares,
			distanceAtNinetyPercent: distanceAtProbability(primary, 0.9),
			placementProfile: {
				what: "how much contrast the NON-governing placements carried, per ladder item — the round's own measure of how much a `yes` could have leaked from somewhere other than the pair under test",
				flatFieldNote:
					"the field is rendered flat (§3.5), so the `field` placement is the background colour; a " +
					"placement is counted as non-governing only when its hex differs from the governing field's",
				itemsWithAnyNonGoverningLuminanceContrast: placementRows.filter(
					(row) => row.anyNonGoverningLuminanceContrast,
				).length,
				maxNonGoverningAbsLc: {
					min: placementLc.length === 0 ? null : round4(Math.min(...placementLc)),
					median: median(placementLc) === null ? null : round4(median(placementLc)!),
					max: placementLc.length === 0 ? null : round4(Math.max(...placementLc)),
				},
				items: placementRows,
			},
		},

		/**
		 * §7: "records `answerHygiene` so that a clean round is visibly clean." Both collectors'
		 * skip counters, plus the two ways the join itself can lose an item. All zero is the shape a
		 * clean round has; anything non-zero is a fact about the round, reported rather than swept up.
		 */
		answerHygiene: {
			thisRound: collected.skipped,
			round1AnchorSource: round1.skipped,
			unexpectedAnswers: joined.unexpectedAnswers,
			truthItemsWithoutFixtureRow: joined.itemsWithoutFixtureRow,
			answeredItems: answers.size,
			totalItems: truth.items.length,
		},

		fundedBy: [PREREGISTRATION],
	}

	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`, "utf8")
	if (!values.quiet) {
		console.log(`verdict: ${verdict}`)
		console.log(verdictReason)
		console.log(
			`ladder ${ladderAnswered}/${ladderItems.length} answered (${observations.length} decided, ` +
				`${pooledEscape.cantTell} cant_tell) · controls ${controlsPassed}/${REQUIRED_CONTROLS} · ` +
				`repeats ${repeatsAgreed}/${repeatsComparable} · anchors paired ${pairedAnchors.length}/${anchorItems.length}`,
		)
		if (realThreshold !== null) {
			console.log(
				`threshold ${realThreshold}${primary.separated ? " (SEPARATED — a bracket, not a measurement)" : ""} · ` +
					`real minus synthetic ${realVsSynthetic} · support ${guarded.support.verdict}` +
					`${guarded.extrapolatedBeyondSample ? " · EXTRAPOLATED BEYOND SAMPLE" : ""}`,
			)
		}
		if (sunshine.retractsChatRuling) console.log(sunshine.note)
		console.log(`wrote ${outPath}`)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
