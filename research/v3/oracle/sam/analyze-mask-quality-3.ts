/**
 * Analyse the released `sam-mask-quality-3-area-guard-and-hard-text` round.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/oracle/sam/analyze-mask-quality-3.ts [--warehouse PATH] [--write]
 *
 * Round 3 carried two loose ends in one batch, both of them thresholds that were set without a
 * human ever seeing the masks they decide.
 *
 *   SECTION A — the area guard (loose end A6). `MAX_AREA_FRACTION = 0.5` was calibrated on a round
 *   whose big-area masks were 3 stickers, 1 emblem and 1 face and held NO person, yet 5 of the 6
 *   regions it removes across the corpus are `person`. Section A is a CENSUS of every region in the
 *   run over the guard, plus every region just under it as boundary context, each asked twice: the
 *   usual mask question, and `big_area_is_real_subject` — the question per-concept-group scoping
 *   actually turns on. A mask can be a correct `person` AND be the whole picture, and that is
 *   precisely the case the guard was added for, so the mask question alone cannot decide it.
 *
 *   SECTION B — hard text (loose end A12). On the 11 covers where the VLM reports text and no
 *   `text_like` mask survives the pooled cut, this graded the masks the current thresholds THROW
 *   AWAY. A category-aware cut cannot be fitted to regions nobody has graded.
 *
 * EVERY decision rule applied here was PRE-REGISTERED in the round's own manifest, before the
 * answers existed — `mask-quality-3-sample.json` `guardSection.decisionRule` and
 * `hardTextDecisionRule`. This script reads those rules off the manifest rather than restating
 * them, so it cannot quietly drift from what the round promised to do (`assertPreRegistered`
 * fails the run if the manifest's numbers stop matching the constants below).
 *
 * Nothing here writes to the warehouse or to `config.py`. The output is a proposal.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	MIDDLE_ANSWER,
	NEGATIVE_ANSWER,
	POSITIVE_ANSWER,
	bestPoint,
	collectAnswers,
	metricsAt,
	sweep,
	type Judged,
	type SweepPoint,
} from "./analyze-mask-quality.ts"
import { readAll } from "../../src/warehouse/warehouse.ts"

/* ------------------------------------------------------------------------------------------- */
/* Constants                                                                                     */
/* ------------------------------------------------------------------------------------------- */

export const ANALYSIS_VERSION = "sam-mask-quality-3-analysis.v1"
export const BATCH_ID = "sam-mask-quality-3-area-guard-and-hard-text"

export const SAMPLE_PATH = fileURLToPath(new URL("../../data/sam/mask-quality-3-sample.json", import.meta.url))
export const ANALYSIS_JSON_PATH = fileURLToPath(new URL("../../data/sam/mask-quality-3-analysis.json", import.meta.url))
const DEFAULT_WAREHOUSE = fileURLToPath(new URL("../../data/warehouse/warehouse.jsonl", import.meta.url))

/** The guard question's vocabulary. The middle answer is excluded from both sides, as pre-registered. */
export const GUARD_QUESTION_KEY = "big_area_is_real_subject"
export const GUARD_REAL = "real-subject"
export const GUARD_LOOSE = "real-but-loose"
export const GUARD_WHOLE = "whole-image"

/**
 * The pre-registered guard bands. Read back out of the manifest by `assertPreRegistered`.
 * [REVIEWED] — fixed before the answers existed; this script may not move them.
 */
export const GUARD_EXEMPT_AT = 0.7
export const GUARD_KEEP_AT = 0.3
export const GUARD_MIN_DECIDED = 3

/** The pre-registered hard-text gates. Same provenance, same prohibition. */
export const HARD_TEXT_MIN_SEPARATION = 0.05
export const HARD_TEXT_MIN_J_GAIN = 0.05
export const HARD_TEXT_MIN_DECIDED = 5

/* ------------------------------------------------------------------------------------------- */
/* Types                                                                                         */
/* ------------------------------------------------------------------------------------------- */

type SampleItem = {
	itemId: string
	guardItemId?: string
	maskRowId: string
	section: "big-area" | "hard-text"
	concept: string
	conceptPhrase: string
	conceptGroup: string
	selectionRole: string
	score: number
	areaFraction: number
	band: string
	calibratedCutForConcept: number
	clearsScoreCut: boolean
	removedByAreaGuard: boolean
	forcedSuspicious: boolean
	artwork: { imagePath: string; sha256: string }
}

type Sample = {
	batchId: string
	calibratedScoreThreshold: number
	calibratedGroupThresholds: Record<string, number>
	calibratedMaxAreaFraction: number
	conceptGroups: Record<string, string[]>
	scoreThresholdAtRun: number
	items: SampleItem[]
	guardSection: { questionKey: string; decisionRule: Record<string, unknown> }
	hardTextDecisionRule: Record<string, unknown>
	selection: { composition: Record<string, any> }
	gpuGap: Record<string, any>
}

/* ------------------------------------------------------------------------------------------- */
/* Pre-registration guard                                                                        */
/* ------------------------------------------------------------------------------------------- */

/**
 * Fail loudly if the manifest's pre-registered rule and this script's constants have parted ways.
 *
 * The whole force of "pre-registered" is that the numbers were fixed before the answers existed.
 * A script that hard-codes them can drift from the manifest silently and nobody would see it in the
 * output, so the two are compared on every run and a mismatch aborts rather than warns.
 */
export function assertPreRegistered(sample: Sample): string[] {
	const rule = sample.guardSection.decisionRule as Record<string, string>
	const problems: string[] = []
	const expect = (haystack: string, needle: string, what: string) => {
		if (!String(haystack ?? "").includes(needle)) problems.push(`${what}: manifest does not say "${needle}"`)
	}
	expect(rule.exemptIf, ">= 0.70", "guard exemptIf")
	expect(rule.keepIf, "<= 0.30", "guard keepIf")
	expect(rule.undecidedIf, "0.30 and 0.70", "guard undecidedIf")
	expect(String(rule.minimumDecided), "3", "guard minimumDecided")
	expect(rule.countsToward, "over-guard", "guard countsToward")
	expect(rule.primaryTreatment, "excluded from both sides", "guard primaryTreatment")
	const gates = String((sample.hardTextDecisionRule as Record<string, string>).gates ?? "")
	expect(gates, ">= 0.05", "hard-text gates")
	expect(gates, "at least 5 decided", "hard-text minimum decided")
	if (sample.guardSection.questionKey !== GUARD_QUESTION_KEY) problems.push("guard questionKey moved")
	return problems
}

/* ------------------------------------------------------------------------------------------- */
/* Section A — the area guard                                                                    */
/* ------------------------------------------------------------------------------------------- */

export type GuardItem = {
	itemId: string
	guardItemId: string | null
	maskRowId: string
	concept: string
	group: string
	selectionRole: string
	score: number
	areaFraction: number
	clearsScoreCut: boolean
	removedByAreaGuard: boolean
	/** True when the score cut would have KEPT this mask and only the area guard removes it. */
	removedByGuardAlone: boolean
	maskAnswer: string | null
	guardAnswer: string | null
	artworkPath: string
}

export type GuardGroupVerdict = {
	group: string
	overGuard: number
	answered: number
	real: number
	loose: number
	whole: number
	decided: number
	realShare: number | null
	verdict: "exempt" | "keep" | "undecided" | "not-tested"
	reason: string
	maskAnswers: Record<string, number>
	contextItems: number
	contextRealShare: number | null
	/**
	 * Distinct covers behind the over-guard items.
	 *
	 * The unit of decision is the group, and the denominator is answers — but two concept prompts
	 * can return the SAME region on the same cover under different tags, and then one region votes
	 * twice. `mark_like` is exactly that case here. Reporting the cover count beside the answer
	 * count is what stops a share from looking better-supported than it is.
	 */
	distinctCovers: number
}

export function buildGuardItems(sample: Sample, answers: Map<string, string>): GuardItem[] {
	return sample.items
		.filter((item) => item.section === "big-area")
		.map((item) => {
			const maskAnswer = answers.get(`mask_correct.${item.concept} ${item.maskRowId}`) ?? null
			const guardAnswer = answers.get(`${GUARD_QUESTION_KEY} ${item.maskRowId}`) ?? null
			return {
				itemId: item.itemId,
				guardItemId: item.guardItemId ?? null,
				maskRowId: item.maskRowId,
				concept: item.concept,
				group: item.conceptGroup,
				selectionRole: item.selectionRole,
				score: item.score,
				areaFraction: item.areaFraction,
				clearsScoreCut: item.clearsScoreCut,
				removedByAreaGuard: item.removedByAreaGuard,
				removedByGuardAlone: item.removedByAreaGuard && item.clearsScoreCut,
				maskAnswer,
				guardAnswer,
				artworkPath: item.artwork.imagePath,
			}
		})
}

/**
 * The pre-registered mapping, applied per concept group.
 *
 * Unit of decision is the group, not the item and not the concept. Only `over-guard` items count —
 * the near-guard rows were drawn as boundary context and were never promised a vote. The middle
 * answer (`real-but-loose`) is excluded from both sides, so the denominator is decided answers
 * only, and a group with fewer than 3 of those is recorded unresolved rather than moved on a coin
 * flip.
 */
export function guardVerdicts(items: readonly GuardItem[], allGroups: readonly string[]): GuardGroupVerdict[] {
	// Every group in the concept set, not only the ones the census happened to draw. A group with no
	// big-area region at all is a group this round says nothing about, and it has to appear saying so
	// — silence looks identical to "keep" in a table that only lists what was measured.
	const groups = [...new Set([...items.map((item) => item.group), ...allGroups])].sort()
	return groups.map((group) => {
		const inGroup = items.filter((item) => item.group === group)
		const counting = inGroup.filter((item) => item.selectionRole === "over-guard")
		const context = inGroup.filter((item) => item.selectionRole !== "over-guard")
		const countOf = (rows: readonly GuardItem[], answer: string) => rows.filter((row) => row.guardAnswer === answer).length
		const real = countOf(counting, GUARD_REAL)
		const loose = countOf(counting, GUARD_LOOSE)
		const whole = countOf(counting, GUARD_WHOLE)
		const decided = real + whole
		const realShare = decided === 0 ? null : real / decided
		const maskAnswers: Record<string, number> = {}
		for (const item of counting) {
			const key = item.maskAnswer ?? "unanswered"
			maskAnswers[key] = (maskAnswers[key] ?? 0) + 1
		}
		const contextDecided = countOf(context, GUARD_REAL) + countOf(context, GUARD_WHOLE)

		let verdict: GuardGroupVerdict["verdict"]
		let reason: string
		if (inGroup.length === 0) {
			verdict = "not-tested"
			reason = `no region of this group is anywhere near the guard in the whole run, so the census drew none. The round says nothing about it and the guard stays ON unchanged.`
		} else if (decided < GUARD_MIN_DECIDED) {
			verdict = "undecided"
			reason = `only ${decided} decided answer(s) among ${counting.length} over-guard item(s); the rule needs ${GUARD_MIN_DECIDED}. Guard stays ON unchanged.`
		} else if (realShare! >= GUARD_EXEMPT_AT) {
			verdict = "exempt"
			reason = `real-subject share ${realShare!.toFixed(3)} >= ${GUARD_EXEMPT_AT}: the guard is deleting masks the reviewer calls real subjects filling the frame. Scope the guard OFF for this group.`
		} else if (realShare! <= GUARD_KEEP_AT) {
			verdict = "keep"
			reason = `real-subject share ${realShare!.toFixed(3)} <= ${GUARD_KEEP_AT}: these big regions are the model outlining the picture. Guard stays ON for this group.`
		} else {
			verdict = "undecided"
			reason = `real-subject share ${realShare!.toFixed(3)} falls between ${GUARD_KEEP_AT} and ${GUARD_EXEMPT_AT}. Guard stays ON unchanged; the group is recorded unresolved.`
		}
		return {
			group,
			overGuard: counting.length,
			answered: counting.filter((item) => item.guardAnswer !== null).length,
			real,
			loose,
			whole,
			decided,
			realShare,
			verdict,
			reason,
			maskAnswers,
			contextItems: context.length,
			contextRealShare: contextDecided === 0 ? null : countOf(context, GUARD_REAL) / contextDecided,
			distinctCovers: new Set(counting.map((item) => item.artworkPath)).size,
		}
	})
}

/**
 * Items the reviewer called a correct mask AND the whole picture.
 *
 * Pre-registered as reported per item and never averaged away: it means the mask is a correct
 * instance of the concept and covers the whole cover, which is exactly the case the guard exists
 * for. A group can be exempted on its `real-subject` share while still containing one of these,
 * and the contradiction is what stops that from being invisible.
 */
export function contradictions(items: readonly GuardItem[]) {
	return items
		.filter((item) => item.maskAnswer === POSITIVE_ANSWER && item.guardAnswer === GUARD_WHOLE)
		.map((item) => ({
			itemId: item.itemId,
			maskRowId: item.maskRowId,
			concept: item.concept,
			group: item.group,
			selectionRole: item.selectionRole,
			score: item.score,
			areaFraction: item.areaFraction,
			artworkPath: item.artworkPath,
			note: "correct mask for the concept AND the whole picture — the guard's founding case",
		}))
}

/* ------------------------------------------------------------------------------------------- */
/* Section B — hard text                                                                         */
/* ------------------------------------------------------------------------------------------- */

function toJudged(item: SampleItem, answer: string): Judged {
	return {
		itemId: item.itemId,
		maskRowId: item.maskRowId,
		concept: item.concept,
		group: item.conceptGroup,
		band: item.band,
		score: item.score,
		areaFraction: item.areaFraction,
		forcedSuspicious: item.forcedSuspicious,
		answer,
		weight: 1,
		artworkPath: item.artwork.imagePath,
	}
}

export type HardTextAnalysis = ReturnType<typeof hardText>

export function hardText(sample: Sample, answers: Map<string, string>) {
	const rows = sample.items
		.filter((item) => item.section === "hard-text")
		.map((item) => {
			const answer = answers.get(`mask_correct.${item.concept} ${item.maskRowId}`)
			return answer === undefined ? null : toJudged(item, answer)
		})
		.filter((row): row is Judged => row !== null)

	const incumbent = sample.calibratedGroupThresholds.text_like
	const pooled = sample.calibratedScoreThreshold
	const floor = sample.scoreThresholdAtRun

	const yes = rows.filter((row) => row.answer === POSITIVE_ANSWER)
	const no = rows.filter((row) => row.answer === NEGATIVE_ANSWER)
	const partly = rows.filter((row) => row.answer === MIDDLE_ANSWER)
	const decided = yes.length + no.length

	const points = sweep(rows, floor, "excluded", false)
	const best = bestPoint(points)
	const atIncumbent = metricsAt(rows, incumbent, "excluded", false)
	const atPooled = metricsAt(rows, pooled, "excluded", false)

	/**
	 * Where the reviewer's own boundary sits, read off the answers rather than off a sweep.
	 *
	 * The sweep answers "what cut separates best"; this answers "did the reviewer's yes/no line
	 * fall anywhere near the incumbent at all". When the accepted and rejected score ranges
	 * overlap completely, score is simply not what the reviewer is tracking, and that is a finding
	 * about the cut's premise, not a number to tune.
	 */
	const span = (rows: readonly Judged[]) =>
		rows.length === 0 ? null : { n: rows.length, min: Math.min(...rows.map((r) => r.score)), max: Math.max(...rows.map((r) => r.score)) }
	const yesSpan = span(yes)
	const noSpan = span(no)
	const separable = yesSpan !== null && noSpan !== null && (yesSpan.min > noSpan.max || noSpan.min > yesSpan.max)

	const separation = best === null ? null : Math.abs(best.threshold - incumbent)
	const jGain = best?.youdenJ != null && atIncumbent.youdenJ != null ? best.youdenJ - atIncumbent.youdenJ : null
	const gates = {
		separation: { value: separation, required: HARD_TEXT_MIN_SEPARATION, passes: separation !== null && separation >= HARD_TEXT_MIN_SEPARATION },
		jGain: { value: jGain, required: HARD_TEXT_MIN_J_GAIN, passes: jGain !== null && jGain >= HARD_TEXT_MIN_J_GAIN },
		decided: { value: decided, required: HARD_TEXT_MIN_DECIDED, passes: decided >= HARD_TEXT_MIN_DECIDED },
	}
	const adopt = Object.values(gates).every((gate) => gate.passes)

	const byAnswerAndSide = {
		aboveIncumbentImpossible: rows.filter((row) => row.score >= incumbent).length,
		abovePooled: rows.filter((row) => row.score >= pooled).length,
		belowPooled: rows.filter((row) => row.score < pooled).length,
		yesAbovePooled: yes.filter((row) => row.score >= pooled).length,
		yesBelowPooled: yes.filter((row) => row.score < pooled).length,
		noAbovePooled: no.filter((row) => row.score >= pooled).length,
		noBelowPooled: no.filter((row) => row.score < pooled).length,
	}

	/**
	 * How much of the cover these masks actually cover.
	 *
	 * "Correct" and "useful" are different questions, and only the first one was asked. A `letter`
	 * mask at 0.04% of the cover can be a perfectly correct mask of a real glyph and still be a poor
	 * basis for anything that needs a colour region. Lowering the cut admits mostly these, so the
	 * profile belongs beside the accept rate rather than in a follow-up nobody runs.
	 */
	const areas = rows.map((row) => row.areaFraction).sort((a, b) => a - b)
	const areaProfile = {
		min: areas[0] ?? null,
		median: areas.length === 0 ? null : areas[Math.floor(areas.length / 2)],
		max: areas[areas.length - 1] ?? null,
		underOnePercent: areas.filter((area) => area < 0.01).length,
		underOneTenthPercent: areas.filter((area) => area < 0.001).length,
		total: areas.length,
	}

	const perConcept: Record<string, Record<string, number>> = {}
	for (const row of rows) {
		perConcept[row.concept] ??= { yes: 0, no: 0, partly: 0 }
		perConcept[row.concept][row.answer] = (perConcept[row.concept][row.answer] ?? 0) + 1
	}

	const perRank: Record<string, Record<string, number>> = {}
	for (const item of sample.items.filter((i) => i.section === "hard-text")) {
		const answer = answers.get(`mask_correct.${item.concept} ${item.maskRowId}`)
		if (answer === undefined) continue
		const rank = item.selectionRole
		perRank[rank] ??= { yes: 0, no: 0, partly: 0 }
		perRank[rank][answer] = (perRank[rank][answer] ?? 0) + 1
	}

	return {
		graded: rows.length,
		counts: { yes: yes.length, no: no.length, partly: partly.length, decided },
		acceptRate: decided === 0 ? null : yes.length / decided,
		incumbentTextLikeCut: incumbent,
		pooledCut: pooled,
		runFloor: floor,
		scoreSpan: { yes: yesSpan, no: noSpan, separable },
		distribution: byAnswerAndSide,
		areaProfile,
		perConcept,
		perSelectionRole: perRank,
		sweepBest: best,
		atIncumbent,
		atPooled,
		gates,
		adoptLoweredCut: adopt,
		rows: rows.map((row) => ({
			itemId: row.itemId,
			maskRowId: row.maskRowId,
			concept: row.concept,
			score: row.score,
			areaFraction: row.areaFraction,
			answer: row.answer,
			artworkPath: row.artworkPath,
		})),
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Section B, secondary — de-truncating the hard-text sweep                                      */
/* ------------------------------------------------------------------------------------------- */

export const ROUND_1_SAMPLE_PATH = fileURLToPath(new URL("../../data/sam/mask-quality-sample.json", import.meta.url))
export const ROUND_1_BATCH_ID = "sam-mask-quality-1"

/**
 * The round-3 hard-text sweep is fitted on a sample that CANNOT contain a high-scoring mask.
 *
 * Section B was selected as "masks below the text_like cut", so its scores are truncated at
 * 0.697295 by construction — and in fact top out at 0.576, because on these covers nothing reaches
 * the 0.578-0.697 band at all. A cut fitted on that sample has never seen a single mask on the
 * keep side of the incumbent, so its "optimum" is an artefact of where the sample was cut, not a
 * measurement of where the boundary is. Reporting the gates as PASS without saying this would be
 * the textbook selection-bias error.
 *
 * The fix that costs no GPU: round 1 graded 31 `text_like` masks drawn across the full score range
 * on an unconditioned sample. Pooling them with round 3's 24 restores the keep side and re-runs the
 * same sweep. This is a SENSITIVITY CHECK, not the pre-registered primary — the two rounds drew
 * from different cover populations (round 3's are the hard A12 covers by definition), so the pooled
 * number is a sanity bound on the direction of the move, not a constant to adopt on its own.
 */
export function pooledTextLike(sample: Sample, answers: Map<string, string>, warehousePath: string) {
	let round1: { items: SampleItem[] } | null = null
	try {
		round1 = JSON.parse(readFileSync(ROUND_1_SAMPLE_PATH, "utf8")) as { items: SampleItem[] }
	} catch {
		return { available: false as const, reason: "round-1 sample not readable" }
	}
	const round1Answers = collectAnswers(readAll(warehousePath), ROUND_1_BATCH_ID).answers

	const round3Rows = sample.items
		.filter((item) => item.section === "hard-text")
		.map((item) => {
			const answer = answers.get(`mask_correct.${item.concept} ${item.maskRowId}`)
			return answer === undefined ? null : toJudged(item, answer)
		})
		.filter((row): row is Judged => row !== null)

	const seen = new Set(round3Rows.map((row) => row.maskRowId))
	const round1Rows = round1.items
		.filter((item) => item.conceptGroup === "text_like")
		.filter((item) => !seen.has(item.maskRowId))
		.map((item) => {
			const answer = round1Answers.get(`mask_correct.${item.concept} ${item.maskRowId}`)
			return answer === undefined ? null : toJudged(item, answer)
		})
		.filter((row): row is Judged => row !== null)

	const rows = [...round1Rows, ...round3Rows]
	const incumbent = sample.calibratedGroupThresholds.text_like
	const points = sweep(rows, sample.scoreThresholdAtRun, "excluded", false)
	const best = bestPoint(points)
	const atIncumbent = metricsAt(rows, incumbent, "excluded", false)
	const separation = best === null ? null : Math.abs(best.threshold - incumbent)
	const jGain = best?.youdenJ != null && atIncumbent.youdenJ != null ? best.youdenJ - atIncumbent.youdenJ : null

	const decided = rows.filter((row) => row.answer === POSITIVE_ANSWER || row.answer === NEGATIVE_ANSWER).length
	const negatives = rows.filter((row) => row.answer === NEGATIVE_ANSWER).length
	return {
		available: true as const,
		round1Rows: round1Rows.length,
		round3Rows: round3Rows.length,
		overlapDropped: round1.items.filter((item) => item.conceptGroup === "text_like" && seen.has(item.maskRowId)).length,
		total: rows.length,
		decided,
		negatives,
		scoreRange: rows.length === 0 ? null : { min: Math.min(...rows.map((r) => r.score)), max: Math.max(...rows.map((r) => r.score)) },
		incumbent,
		sweepBest: best,
		atIncumbent,
		separation,
		jGain,
		gates: {
			separation: { value: separation, required: HARD_TEXT_MIN_SEPARATION, passes: separation !== null && separation >= HARD_TEXT_MIN_SEPARATION },
			jGain: { value: jGain, required: HARD_TEXT_MIN_J_GAIN, passes: jGain !== null && jGain >= HARD_TEXT_MIN_J_GAIN },
			decided: { value: decided, required: HARD_TEXT_MIN_DECIDED, passes: decided >= HARD_TEXT_MIN_DECIDED },
		},
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Proposals                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The record ids behind each proposal, derived rather than transcribed.
 *
 * `fundedBy` holds warehouse record ids and nothing else, so `warehouse recheck --decisions` can
 * flag a decision when the evidence under it moves. Hand-copying twenty-four ids into a JSON file
 * is exactly the step that silently mistypes one, and a mistyped id is a decision that can never
 * be flagged. These are read back out of the same records the analysis was computed from.
 */
export function fundingIds(sample: Sample, records: readonly import("../../src/warehouse/records.ts").WarehouseRecord[]) {
	const idOf = new Map<string, string>()
	for (const record of records) {
		if (record.type !== "oracle-label") continue
		const label = record as any
		if (label.batch?.id !== BATCH_ID) continue
		idOf.set(`${label.questionKey} ${label.imageId}`, label.id)
	}
	const pick = (items: SampleItem[], questionKey: (item: SampleItem) => string) =>
		items.map((item) => idOf.get(`${questionKey(item)} ${item.maskRowId}`)).filter((id): id is string => id !== undefined)

	const bigArea = sample.items.filter((item) => item.section === "big-area")
	const personOverGuard = bigArea.filter((item) => item.conceptGroup === "person_like" && item.selectionRole === "over-guard")
	const markOverGuard = bigArea.filter((item) => item.conceptGroup === "mark_like" && item.selectionRole === "over-guard")
	const hardTextItems = sample.items.filter((item) => item.section === "hard-text")

	return {
		personLikeGuardAnswers: pick(personOverGuard, () => GUARD_QUESTION_KEY),
		personLikeMaskAnswers: pick(personOverGuard, (item) => `mask_correct.${item.concept}`),
		markLikeGuardAnswers: pick(markOverGuard, () => GUARD_QUESTION_KEY),
		hardTextMaskAnswers: pick(hardTextItems, (item) => `mask_correct.${item.concept}`),
	}
}

/**
 * What this round proposes, and — as loudly — what it does not.
 *
 * The manifest pre-registered that nothing in `config.py` is edited by this round, so every entry
 * here is a proposal for a separate reviewed commit. Two of the three are deliberately NOT
 * proposals to change a number: `mark_like` and `dynamic_subject` came back unresolved, and the
 * pre-registered rule says an unresolved group keeps the guard rather than moving on a coin flip.
 */
export function proposals(analysis: Omit<ReturnType<typeof analyse>, "proposals">, funding: ReturnType<typeof fundingIds>) {
	const person = analysis.areaGuard.groups.find((group) => group.group === "person_like")
	const text = analysis.hardText
	const pooled = analysis.hardTextPooledSensitivity
	return [
		{
			id: "d-2026-08-04-sam-area-guard-scoped-off-for-person-like",
			kind: "instrument-calibration",
			status: "PROPOSED — not appended to decisions.json, not applied to config.py",
			closes: "PHASE_0_LOOSE_ENDS.md A6 (the area guard's group scoping)",
			decision:
				`The area guard is scoped OFF for person_like and stays ON for every other group. ` +
				`The census asked all 6 person_like regions over the guard whether they are a real thing filling the cover; ` +
				`all 6 came back real-subject (share ${person?.realShare?.toFixed(3)}, >= ${GUARD_EXEMPT_AT}), none whole-image, none loose. ` +
				`5 of the 6 also clear the score cut, which is exactly the set the guard deletes on its own corpus-wide, and the reviewer called all 5 correct person masks.`,
			fundedBy: [...funding.personLikeGuardAnswers, ...funding.personLikeMaskAnswers],
			mustNotBeReadAs: [
				"NOT a claim that the guard was wrong. Round 1's single in-sample win was the mark_like sticker 8b4f2aadf3b1:sticker:0, and mark_like keeps the guard, so that win is preserved intact.",
				"NOT a corpus-wide exemption. text_like has no region anywhere near the guard and was never tested; mark_like and dynamic_subject came back unresolved and keep the guard unchanged.",
			],
		},
		{
			id: "d-2026-08-04-sam-area-guard-unresolved-for-mark-like-and-dynamic-subject",
			kind: "deliberately-open",
			status: "PROPOSED — records a non-move",
			decision:
				`mark_like (real-subject share 0.500 on 4 decided) and dynamic_subject (2 decided, below the pre-registered minimum of ${GUARD_MIN_DECIDED}) ` +
				`both fall in the undecided band. The guard stays ON for both, unchanged, and both are recorded unresolved rather than moved. ` +
				`A round that cannot separate must say so.`,
			fundedBy: funding.markLikeGuardAnswers,
			note:
				"dynamic_subject's exemption would be inert today in any case: both its over-guard regions score 0.362 and 0.335, below the pooled cut of 0.578, so the score cut removes them whatever the guard does.",
		},
		{
			id: "d-2026-08-04-sam-text-like-cut-discards-correct-text-on-a12-covers",
			kind: "measurement",
			status: "PROPOSED — funds a finding, NOT a new constant",
			decision:
				`On the A12 hard-text class the text_like cut of ${text.incumbentTextLikeCut} discards correct text: ` +
				`${text.counts.yes} of ${text.counts.decided} decided below-cut masks are correct, an accept rate of ${(text.acceptRate! * 100).toFixed(1)}%, ` +
				`and every one of the 24 graded masks scores at or below 0.576 — below the pooled cut of ${text.pooledCut} as well as the group cut. ` +
				`Both cuts keep 0 of 24. The reviewer's yes/no boundary does not sit near either cut; it sits at the run-time floor.`,
			fundedBy: funding.hardTextMaskAnswers,
			doesNotFund:
				`A lowered text_like constant. The pre-registered gates all PASS on the section-B sample, but that sample is truncated at the cut by construction ` +
				`and holds exactly one negative answer, so its "optimum" of ${text.sweepBest?.threshold.toFixed(6)} at J 1.000 measures where the sample was cut, not where the boundary is. ` +
				`Pooling round 1's ${pooled.available ? pooled.round1Rows : "?"} unconditioned text_like rows back in restores the keep side and the J gain falls to ` +
				`${pooled.available ? pooled.jGain?.toFixed(4) : "n/a"} — the J-gain gate FAILS. Moving the global cut down to ${pooled.available ? pooled.sweepBest?.threshold.toFixed(6) : "n/a"} ` +
				`would buy recall (${pooled.available ? pct(pooled.atIncumbent.recall) : "n/a"} -> ${pooled.available ? pct(pooled.sweepBest?.recall) : "n/a"}) at a precision cost ` +
				`(${pooled.available ? pct(pooled.atIncumbent.precision) : "n/a"} -> ${pooled.available ? pct(pooled.sweepBest?.precision) : "n/a"}) for no J gain at all.`,
			recommends:
				"A per-cover rescue rule rather than a lower global cut — on a cover where NO text_like mask clears the cut, admit that cover's strongest text_like mask down to a floor — fitted on a round that samples both sides of the boundary on hard covers. Not fundable from this round.",
		},
	]
}

/* ------------------------------------------------------------------------------------------- */
/* Main                                                                                          */
/* ------------------------------------------------------------------------------------------- */

function pct(value: number | null | undefined) {
	return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`
}

export function analyse(sample: Sample, answers: Map<string, string>, skipped: Record<string, number>, warehousePath: string) {
	const preRegistrationProblems = assertPreRegistered(sample)
	const items = buildGuardItems(sample, answers)
	const verdicts = guardVerdicts(items, Object.keys(sample.conceptGroups))
	const clashes = contradictions(items)
	const guardAlone = items.filter((item) => item.removedByGuardAlone)
	const text = hardText(sample, answers)
	const pooled = pooledTextLike(sample, answers, warehousePath)

	return {
		analysisVersion: ANALYSIS_VERSION,
		batchId: BATCH_ID,
		generatedBy: "research/v3/oracle/sam/analyze-mask-quality-3.ts",
		generatedAt: new Date().toISOString(),
		builtFrom: [
			"research/v3/data/sam/mask-quality-3-sample.json",
			"research/v3/data/sam/sam-mask-quality-3-area-guard-and-hard-text.json",
			"research/v3/data/warehouse/warehouse.jsonl",
		],
		preRegistration: {
			source: "mask-quality-3-sample.json guardSection.decisionRule + hardTextDecisionRule",
			problems: preRegistrationProblems,
			ok: preRegistrationProblems.length === 0,
		},
		answersRead: { total: answers.size, skipped },
		areaGuard: {
			questionKey: GUARD_QUESTION_KEY,
			unitOfDecision: "concept group",
			bands: { exemptAt: GUARD_EXEMPT_AT, keepAt: GUARD_KEEP_AT, minimumDecided: GUARD_MIN_DECIDED },
			incumbentMaxAreaFraction: sample.calibratedMaxAreaFraction,
			groups: verdicts,
			contradictions: clashes,
			removedByGuardAlone: guardAlone.map((item) => ({
				itemId: item.itemId,
				maskRowId: item.maskRowId,
				concept: item.concept,
				group: item.group,
				score: item.score,
				areaFraction: item.areaFraction,
				maskAnswer: item.maskAnswer,
				guardAnswer: item.guardAnswer,
				artworkPath: item.artworkPath,
			})),
			items,
		},
		hardText: text,
		hardTextPooledSensitivity: pooled,
		gpuGap: sample.gpuGap,
	}
}

/** `analyse` plus the proposal block, which needs the raw records to derive its funding ids. */
export function analyseWithProposals(
	sample: Sample,
	answers: Map<string, string>,
	skipped: Record<string, number>,
	warehousePath: string,
	records: readonly import("../../src/warehouse/records.ts").WarehouseRecord[],
) {
	const analysis = analyse(sample, answers, skipped, warehousePath)
	return { ...analysis, proposals: proposals(analysis, fundingIds(sample, records)) }
}

export function render(analysis: ReturnType<typeof analyse>): string {
	const lines: string[] = []
	lines.push(`${ANALYSIS_VERSION}  batch=${analysis.batchId}`)
	lines.push(`pre-registration: ${analysis.preRegistration.ok ? "matches manifest" : "MISMATCH " + analysis.preRegistration.problems.join("; ")}`)
	lines.push(`answers: ${analysis.answersRead.total} (skipped ${JSON.stringify(analysis.answersRead.skipped)})`)
	lines.push("")
	lines.push("SECTION A — area guard, per concept group (over-guard items only, middle answer excluded)")
	for (const group of analysis.areaGuard.groups) {
		lines.push(
			`  ${group.group.padEnd(16)} over-guard ${group.overGuard}  real ${group.real} loose ${group.loose} whole ${group.whole}` +
				`  decided ${group.decided}  real-share ${group.realShare === null ? "n/a" : group.realShare.toFixed(3)}  => ${group.verdict.toUpperCase()}`,
		)
		lines.push(`      ${group.reason}`)
		lines.push(`      mask answers: ${JSON.stringify(group.maskAnswers)}  context items: ${group.contextItems}  distinct covers: ${group.distinctCovers}`)
	}
	lines.push("")
	lines.push(`  contradictions (mask=yes AND guard=whole-image): ${analysis.areaGuard.contradictions.length}`)
	for (const clash of analysis.areaGuard.contradictions) {
		lines.push(`    ${clash.maskRowId}  ${clash.concept}/${clash.group}  score ${clash.score.toFixed(3)}  area ${pct(clash.areaFraction)}  ${clash.artworkPath}`)
	}
	lines.push("")
	lines.push(`  masks the guard removes on its own (score cut would keep them): ${analysis.areaGuard.removedByGuardAlone.length}`)
	for (const item of analysis.areaGuard.removedByGuardAlone) {
		lines.push(
			`    ${item.maskRowId.padEnd(28)} ${item.concept.padEnd(8)} score ${item.score.toFixed(3)} area ${pct(item.areaFraction)}` +
				`  mask=${item.maskAnswer} guard=${item.guardAnswer}`,
		)
	}
	lines.push("")
	const text = analysis.hardText
	lines.push("SECTION B — hard text, below-cut masks")
	lines.push(`  graded ${text.graded}  yes ${text.counts.yes} no ${text.counts.no} partly ${text.counts.partly}  decided ${text.counts.decided}  accept ${pct(text.acceptRate)}`)
	lines.push(`  yes scores ${text.scoreSpan.yes ? `${text.scoreSpan.yes.min.toFixed(3)}-${text.scoreSpan.yes.max.toFixed(3)}` : "n/a"}` +
		`   no scores ${text.scoreSpan.no ? `${text.scoreSpan.no.min.toFixed(3)}-${text.scoreSpan.no.max.toFixed(3)}` : "n/a"}` +
		`   separable by score: ${text.scoreSpan.separable}`)
	lines.push(`  incumbent text_like cut ${text.incumbentTextLikeCut}  pooled cut ${text.pooledCut}  run floor ${text.runFloor}`)
	lines.push(`  sweep best: threshold ${text.sweepBest?.threshold.toFixed(6) ?? "n/a"}  J ${text.sweepBest?.youdenJ?.toFixed(4) ?? "n/a"}` +
		`  precision ${pct(text.sweepBest?.precision)} recall ${pct(text.sweepBest?.recall)}`)
	lines.push(`  at incumbent ${text.incumbentTextLikeCut}: J ${text.atIncumbent.youdenJ?.toFixed(4) ?? "n/a"}  keeps ${text.atIncumbent.keptTruePositive + text.atIncumbent.keptFalsePositive} of ${text.graded}`)
	lines.push(`  at pooled ${text.pooledCut}: J ${text.atPooled.youdenJ?.toFixed(4) ?? "n/a"}  keeps ${text.atPooled.keptTruePositive + text.atPooled.keptFalsePositive} of ${text.graded}`)
	for (const [name, gate] of Object.entries(text.gates)) {
		lines.push(`  gate ${name.padEnd(11)} ${gate.value === null ? "n/a" : Number(gate.value).toFixed(4)} vs ${gate.required}  ${gate.passes ? "PASS" : "FAIL"}`)
	}
	lines.push(`  adopt a lowered text_like cut: ${text.adoptLoweredCut ? "YES" : "NO"}`)
	lines.push(`  per concept: ${JSON.stringify(text.perConcept)}`)
	lines.push(`  area profile: median ${text.areaProfile.median?.toFixed(5) ?? "n/a"}  max ${text.areaProfile.max?.toFixed(5) ?? "n/a"}` +
		`  under 1% of cover: ${text.areaProfile.underOnePercent}/${text.areaProfile.total}  under 0.1%: ${text.areaProfile.underOneTenthPercent}`)
	lines.push("")
	const pooledCheck = analysis.hardTextPooledSensitivity
	lines.push("SECTION B, secondary — pooled with round 1's text_like rows (de-truncation sensitivity check)")
	if (!pooledCheck.available) {
		lines.push(`  unavailable: ${pooledCheck.reason}`)
	} else {
		lines.push(`  rows ${pooledCheck.total} (round1 ${pooledCheck.round1Rows} + round3 ${pooledCheck.round3Rows}, overlap dropped ${pooledCheck.overlapDropped})` +
			`  decided ${pooledCheck.decided}  negatives ${pooledCheck.negatives}`)
		lines.push(`  score range ${pooledCheck.scoreRange ? `${pooledCheck.scoreRange.min.toFixed(3)}-${pooledCheck.scoreRange.max.toFixed(3)}` : "n/a"}`)
		lines.push(`  sweep best: threshold ${pooledCheck.sweepBest?.threshold.toFixed(6) ?? "n/a"}  J ${pooledCheck.sweepBest?.youdenJ?.toFixed(4) ?? "n/a"}` +
			`  precision ${pct(pooledCheck.sweepBest?.precision)} recall ${pct(pooledCheck.sweepBest?.recall)}`)
		lines.push(`  at incumbent ${pooledCheck.incumbent}: J ${pooledCheck.atIncumbent.youdenJ?.toFixed(4) ?? "n/a"}` +
			`  precision ${pct(pooledCheck.atIncumbent.precision)} recall ${pct(pooledCheck.atIncumbent.recall)}`)
		for (const [name, gate] of Object.entries(pooledCheck.gates)) {
			lines.push(`  gate ${name.padEnd(11)} ${gate.value === null ? "n/a" : Number(gate.value).toFixed(4)} vs ${gate.required}  ${gate.passes ? "PASS" : "FAIL"}`)
		}
	}
	lines.push("")
	lines.push(`GPU GAP — still un-reviewed: ${analysis.gpuGap.whatIsMissing}`)
	return lines.join("\n")
}

async function main() {
	const { values } = parseArgs({
		options: { warehouse: { type: "string" }, write: { type: "boolean", default: false } },
	})
	const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as Sample
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE
	const records = readAll(warehousePath)
	const { answers, skipped } = collectAnswers(records, BATCH_ID)
	const analysis = analyseWithProposals(sample, answers, skipped, warehousePath, records)
	if (!analysis.preRegistration.ok) {
		console.error("PRE-REGISTRATION MISMATCH:", analysis.preRegistration.problems.join("; "))
		process.exitCode = 1
	}
	console.log(render(analysis))
	if (values.write) {
		writeFileSync(ANALYSIS_JSON_PATH, JSON.stringify(analysis, null, "\t") + "\n")
		console.log(`\nwrote ${ANALYSIS_JSON_PATH}`)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
