/**
 * Score `accent-functional-1` against its pre-registration.
 *
 * The rule this implements is frozen in
 * `data/calibration/accent-functional-round-1-preregistration.md` §6, written before the batch was
 * pushed and therefore before any answer to it could exist. **Nothing here decides anything**: the
 * gates run in the pre-registered order, the first one that trips names the verdict, and the
 * proposal for `ACCENT_FUNCTIONAL_DISTANCE` is written as a proposal. Adopting it is the reviewer's
 * act (`PHASE_0_DECISIONS.md` §4, and the `DECISION PENDING` convention A17 established).
 *
 * Run it:
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/data/calibration/analyze-accent-functional-round-1.ts [--warehouse P] [--out P]
 *
 * It is safe — and useful — to run before the round is answered: it reports `incomplete` and shows
 * how far the pass has got. That is also the smoke test that this file works, run at push time so
 * that a broken analyzer is discovered while it is cheap rather than after the reviewer has spent
 * their attention.
 */
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	type BracketingAnswer,
	type LogisticFit,
	type Observation,
	collectAnswers,
	fitLogistic,
	loadFixture,
	repeatConsistency,
} from "../../src/review-server/analyze-bracketing.ts"
import {
	ACCENT_FUNCTIONAL_BATCH_ID,
	ACCENT_FUNCTIONAL_FIXTURE_PATH,
	ACCENT_FUNCTIONAL_PROMPTS,
	ANCHOR_REPLAYS,
	ANCHOR_SOURCE_BATCH_ID,
} from "../../src/review-server/accent-functional.ts"
import { BRACKETING_FIXTURE_PATH } from "../../src/review-server/bracketing.ts"
import { DEFAULT_WAREHOUSE_PATH } from "../../src/warehouse/cli.ts"
import { readAll } from "../../src/warehouse/warehouse.ts"

/* ------------------------------------------------------------------------------------------- */
/* The pre-registered numbers. Constants, so that no branch below can quietly move one.          */
/* ------------------------------------------------------------------------------------------- */

/** §6.1 G1–G3. */
const REQUIRED_CONTROL_PASSES = 4
const MIN_REPEAT_AGREEMENT = 3
const MIN_ANSWERED_LADDER_ITEMS = 28

/** §6.4 guardrails 1 and 2 — the two rungs the reviewer has already spoken to. */
const LOWER_ANCHOR = 0.08804
const UPPER_ANCHOR = 0.24181

/** §6.3 — round 1 part 2's detection threshold, the thing the gap is measured against. */
const DETECTION_THRESHOLD = 0.07444

/** §6.4 guardrail 4 — round 1 part 2's pooled interval width, and the multiple that fails it. */
const ROUND1_POOLED_INTERVAL_WIDTH = 0.10564 - 0.05211
const MAX_SEPARATION_WIDTH_MULTIPLE = 1.5

const ANALYSIS_SCHEMA = "accent-functional-round-1-analysis/v1"

const PREREGISTRATION = "research/v3/data/calibration/accent-functional-round-1-preregistration.md"

export type Verdict =
	| "adopt"
	| "contradicts-retraction"
	| "refuses-endorsed"
	| "stratum-dependent"
	| "bracketed-only"
	| "noise-dominated"
	| "incomplete"
	| "void"

/* ------------------------------------------------------------------------------------------- */

function round5(value: number): number {
	return Number(value.toFixed(5))
}

/**
 * The designed cell of a ladder item, from its id: `af-ladder-r{rung}-h{hue}-{band}`.
 *
 * Anchors (`af-anchor-…`), controls and repeats return `null` — they have no designed cell. Every
 * item shares one `stratum` (round 1's `accent-equal-luminance`, see the generator's note), so the
 * id is where the cell lives; it is written by `generateAccentFunctionalFixture` and the design it
 * encodes is asserted there, so this is reading a contract rather than scraping a name.
 */
function cellOf(itemId: string): { hueThird: number; band: string } | null {
	const match = /^af-ladder-r\d{2}-h(\d)-(dark|mid|light)$/u.exec(itemId)
	return match === null ? null : { hueThird: Number(match[1]), band: match[2] }
}

function observationsFor(
	items: readonly { itemId: string; truth: { okLabDistance: number } }[],
	answers: Map<string, BracketingAnswer>,
): Observation[] {
	const out: Observation[] = []
	for (const item of items) {
		const answer = answers.get(item.itemId)
		if (answer === undefined) continue
		// §6.2: the ACHIEVED distance, never the ladder target.
		out.push({ itemId: item.itemId, distance: item.truth.okLabDistance, yes: answer.answer })
	}
	return out
}

/**
 * The interval a stratum fit is compared against (§6.4 guardrail 3): the pooled confidence interval
 * when there is one, else its separation interval. A stratum with no interval of its own cannot
 * disagree — absence of evidence is not disagreement — so it is skipped rather than counted.
 */
function pooledInterval(fit: LogisticFit): { low: number; high: number } | null {
	return fit.confidenceInterval ?? fit.separationInterval
}

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
		values.out ?? fileURLToPath(new URL("./accent-functional-round-1-analysis.json", import.meta.url))

	const fixture = await loadFixture(ACCENT_FUNCTIONAL_FIXTURE_PATH)
	const records = readAll(values.warehouse)
	const collected = collectAnswers(records, fixture, ACCENT_FUNCTIONAL_BATCH_ID)
	const answers = collected.byItemId

	/* --- the fitted population: role "ladder" only (27 constructed + 4 anchors) ---------------- */
	const ladderItems = fixture.items.filter((item) => item.role === "ladder")
	const observations = observationsFor(ladderItems, answers)

	/* --- G1: controls --------------------------------------------------------------------------- */
	const controlChecks = fixture.items
		.filter((item) => item.role === "control-obvious" || item.role === "control-identical")
		.map((item) => {
			const expected = item.role === "control-obvious"
			const answer = answers.get(item.itemId)
			return {
				itemId: item.itemId,
				role: item.role,
				expected,
				answered: answer !== undefined,
				answer: answer?.answer ?? null,
				passed: answer !== undefined && answer.answer === expected,
			}
		})
	const controlsPassed = controlChecks.filter((check) => check.passed).length
	const controlsAnswered = controlChecks.filter((check) => check.answered).length
	// §6.1 G1 is about *wrong* answers, not missing ones: an unanswered control is incompleteness
	// (G3's business), and conflating the two would report an untouched round as reviewer inattention.
	const controlsFailed = controlChecks.filter((check) => check.answered && !check.passed)

	/* --- G2: repeats ---------------------------------------------------------------------------- */
	const repeats = repeatConsistency(fixture.items, answers)

	/* --- the primary fit ------------------------------------------------------------------------ */
	// "increasing": the probability of "works as an accent" rises with distance. Round 1 part 2's
	// direction, and the only one that makes sense for this criterion.
	const primary = fitLogistic(observations, "increasing")

	/* --- stratum breakdowns (guardrail 3, and §6.5's exploratory cuts) -------------------------- */
	const byBand = new Map<string, typeof ladderItems>()
	const byHueThird = new Map<number, typeof ladderItems>()
	for (const item of ladderItems) {
		const cell = cellOf(item.itemId)
		if (cell === null) continue // an anchor: pooled only, it has no designed cell
		byBand.set(cell.band, [...(byBand.get(cell.band) ?? []), item])
		byHueThird.set(cell.hueThird, [...(byHueThird.get(cell.hueThird) ?? []), item])
	}
	const bandFits = [...byBand.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([band, items]) => ({ band, ...fitLogistic(observationsFor(items, answers), "increasing") }))
	const hueFits = [...byHueThird.entries()]
		.sort(([a], [b]) => a - b)
		.map(([hueThird, items]) => ({ hueThird, ...fitLogistic(observationsFor(items, answers), "increasing") }))

	const interval = pooledInterval(primary)
	const disagreeingStrata = [
		...bandFits.map((fit) => ({ name: `band:${fit.band}`, threshold: fit.threshold })),
		...hueFits.map((fit) => ({ name: `hue-third:${fit.hueThird}`, threshold: fit.threshold })),
	].filter(
		(entry) =>
			interval !== null &&
			entry.threshold !== null &&
			(entry.threshold < interval.low || entry.threshold > interval.high),
	)

	/* --- §6.3 the criterion gap: round 1's own answers on the identical stimuli ----------------- */
	const round1Fixture = await loadFixture(BRACKETING_FIXTURE_PATH)
	const round1Answers = collectAnswers(records, round1Fixture, ANCHOR_SOURCE_BATCH_ID).byItemId
	const anchorTable = ANCHOR_REPLAYS.map((anchor) => {
		const itemId = `af-anchor-${anchor.sourceItemId}`
		const functional = answers.get(itemId)
		const detection = round1Answers.get(anchor.sourceItemId)
		return {
			itemId,
			replays: anchor.sourceItemId,
			okLabDistance: anchor.expectedDistance,
			detectionAnswer: detection?.answer ?? null,
			functionalAnswer: functional?.answer ?? null,
			// The cell the refinement predicts: detection said yes, function says no.
			flippedYesToNo: detection?.answer === true && functional?.answer === false,
		}
	})
	const criterionGap =
		primary.threshold === null ? null : round5(primary.threshold - DETECTION_THRESHOLD)

	/* --- the verdict, in the pre-registered order ------------------------------------------------ */
	let verdict: Verdict
	let verdictReason: string
	const separationWidth =
		primary.separationInterval === null
			? null
			: primary.separationInterval.high - primary.separationInterval.low

	if (controlsFailed.length > 0) {
		verdict = "void"
		verdictReason =
			`G1: ${controlsFailed.map((check) => check.itemId).join(", ")} answered against a known-correct ` +
			"answer. A control failure is not a data point about colour — the pass is void and the round is re-run."
	} else if (
		observations.length < MIN_ANSWERED_LADDER_ITEMS ||
		controlsAnswered < REQUIRED_CONTROL_PASSES
	) {
		verdict = "incomplete"
		verdictReason =
			`G3: ${observations.length} of ${ladderItems.length} fitted items answered ` +
			`(${MIN_ANSWERED_LADDER_ITEMS} required) and ${controlsAnswered} of ${REQUIRED_CONTROL_PASSES} ` +
			"controls answered. Nothing is wrong — the round is not finished."
	} else if (repeats.bothAnswered > 0 && repeats.agreed < MIN_REPEAT_AGREEMENT) {
		verdict = "noise-dominated"
		verdictReason =
			`G2: ${repeats.agreed} of ${repeats.bothAnswered} repeats agreed, below the pre-registered ` +
			`${MIN_REPEAT_AGREEMENT}. The fit below is exploratory and the constant does not move on it.`
	} else if (primary.threshold === null || !primary.converged) {
		verdict = "incomplete"
		verdictReason = `the fit did not produce a threshold: ${primary.note ?? "no reason recorded"}`
	} else if (primary.threshold < LOWER_ANCHOR) {
		verdict = "contradicts-retraction"
		verdictReason =
			`the fitted threshold ${round5(primary.threshold)} is below ${LOWER_ANCHOR}, the rung the reviewer ` +
			"retracted as \"hardly perceptible\". Adopting it would contradict an answer already given; the " +
			"likely cause is that the wording did not land, and the repair is a re-worded round."
	} else if (primary.threshold > UPPER_ANCHOR) {
		verdict = "refuses-endorsed"
		verdictReason =
			`the fitted threshold ${round5(primary.threshold)} is above ${UPPER_ANCHOR}, a rung the reviewer ` +
			"called visible and did not retract. Adopting it would refuse an accent they plainly endorse."
	} else if (
		primary.separated &&
		separationWidth !== null &&
		separationWidth > ROUND1_POOLED_INTERVAL_WIDTH * MAX_SEPARATION_WIDTH_MULTIPLE
	) {
		verdict = "bracketed-only"
		verdictReason =
			`the answers are completely separated and the gap is ${separationWidth.toFixed(5)} wide, more than ` +
			`${MAX_SEPARATION_WIDTH_MULTIPLE}x round 1 part 2's pooled interval. A bracket that loose is not a ` +
			"measurement: the placeholder stays and the ladder is refined around the gap."
	} else if (disagreeingStrata.length > 0) {
		verdict = "stratum-dependent"
		verdictReason =
			`${disagreeingStrata.map((entry) => entry.name).join(", ")} fell outside the pooled interval, so no ` +
			"single scalar is adopted — the same escalation round 1 triggered when one threshold did not " +
			"survive all four quadrants."
	} else {
		verdict = "adopt"
		verdictReason =
			`all gates passed and the fit converged inside the reviewer's own bracket ` +
			`[${LOWER_ANCHOR}, ${UPPER_ANCHOR}].`
	}

	const proposal =
		verdict === "adopt" && primary.threshold !== null
			? {
					constant: "ACCENT_FUNCTIONAL_DISTANCE",
					currentValue: 0.14591,
					proposedValue: round5(primary.threshold),
					proposedTag: "[REVIEWED]",
					status: "DECISION PENDING — adoption is the reviewer's act, not this script's.",
				}
			: null

	const analysis = {
		schema: ANALYSIS_SCHEMA,
		batchId: ACCENT_FUNCTIONAL_BATCH_ID,
		analyzedAt: new Date().toISOString(),
		analyzer: "research/v3/data/calibration/analyze-accent-functional-round-1.ts",
		fixture: ACCENT_FUNCTIONAL_FIXTURE_PATH,
		preregistration: PREREGISTRATION,
		warehouse: values.warehouse,
		criterion: fixture.criterion,
		question: ACCENT_FUNCTIONAL_PROMPTS["accent-visible"].question,
		instruction: ACCENT_FUNCTIONAL_PROMPTS["accent-visible"].instruction,
		verdict,
		verdictReason,
		proposal,
		validityGates: {
			controls: {
				passed: controlsPassed,
				answered: controlsAnswered,
				failed: controlsFailed.map((check) => check.itemId),
				required: REQUIRED_CONTROL_PASSES,
				checks: controlChecks,
			},
			repeats: { ...repeats, required: MIN_REPEAT_AGREEMENT },
			coverage: {
				answered: observations.length,
				fitted: ladderItems.length,
				required: MIN_ANSWERED_LADDER_ITEMS,
			},
		},
		primary: { ...primary, population: "role == ladder (27 constructed + 4 anchor replays)" },
		criterionGap: {
			detectionThreshold: DETECTION_THRESHOLD,
			functionalThreshold: primary.threshold === null ? null : round5(primary.threshold),
			gap: criterionGap,
			gapIsPositive: criterionGap === null ? null : criterionGap > 0,
			anchors: anchorTable,
			flippedYesToNo: anchorTable.filter((row) => row.flippedYesToNo).length,
		},
		exploratory: { bandFits, hueFits, disagreeingStrata },
		answerHygiene: collected.skipped,
		fundedBy: [PREREGISTRATION],
	}

	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`, "utf8")
	if (!values.quiet) {
		console.log(`verdict: ${verdict}`)
		console.log(verdictReason)
		console.log(
			`answered ${observations.length}/${ladderItems.length} fitted · controls ${controlsPassed}/4 · ` +
				`repeats ${repeats.agreed}/${repeats.bothAnswered}`,
		)
		if (primary.threshold !== null) {
			console.log(`threshold ${round5(primary.threshold)} · gap vs detection ${criterionGap}`)
		}
		console.log(`wrote ${outPath}`)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
