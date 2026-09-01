/**
 * Score `perception-4` against its pre-registration.
 *
 * The rule this implements is frozen in `data/calibration/perception-round-4-preregistration.md`,
 * written at commit `4c7c891` before the batch was pushed and therefore before any answer to it
 * could exist. **Nothing here decides anything**: the §6 gates run first, in the pre-registered
 * order; the §5 quantities are computed only for the arms the gates leave interpretable; and every
 * verdict is written as a proposal for the reviewer to accept, amend or refuse. **This file never
 * edits `constants.ts` and never edits `decisions.json`.**
 *
 * Run it:
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/data/calibration/analyze-perception-round-4.ts [--warehouse P] [--out P]
 *
 * ## The analyzer was NOT committed before the round was scored, and that is disclosed
 *
 * Prereg §8 asks for this file to be committed before scoring and run as committed, the way
 * `accent-real-1`'s analyzer was. It was not: the round was pushed and answered without it. So this
 * file was written *after* the 148 answers existed, and no claim that it is blind to them is
 * available. What protects the result instead is that every rule it implements is quoted from the
 * prereg — which *is* frozen at `4c7c891` and which fixes every threshold, family size, gate and
 * refusal condition — and that every place the prereg left something open is listed in
 * `ambiguityResolutions` in the output rather than settled silently. Those resolutions are the
 * honest attack surface of this analysis and they are named so a reader can attack them.
 *
 * ## Where the pre-registration had to be interpreted
 *
 * Six places. All six are echoed into the output JSON.
 *
 * 1. **"first showing" (§5.1).** Six items are silent repeats. The `repeat`-role item is *not*
 *    reliably the later one: the fixture's `serveOrder` shows the repeat was served EARLIER than
 *    its arm counterpart in three of the six cases. Timestamps mean nothing under the standing
 *    ruling, so order comes from `serveOrder` and from nothing else. "First showing" therefore
 *    means the earlier of the pair by `serveOrder`, which is not always the arm item's own answer.
 * 2. **What test each of the 13 Holm cells runs (§5.6).** The prereg names the family — arm A's
 *    binomial, its two veto subgroups, arm B's three thresholds and two ratios, arm C's three
 *    per-third fits, its pooled fit, the joint `w_C` — but names the null only for arm A. The nulls
 *    used here are the ones each quantity's claim actually needs, and they are declared in the
 *    output: a *threshold* is meaningful only if the answers depend on distance at all, so each
 *    threshold cell is an exact Mann-Whitney rank-sum test of distance against answer; a *ratio*
 *    claim needs the ratio to differ from 1, so each ratio cell is a two-sided cluster-bootstrap
 *    test against 1; `w_C` is a likelihood-ratio test against `w_C = 1` (isotropic).
 * 3. **§5.1 and §5.6 disagree about arm A, and both are reported.** §5.1 fixes decisiveness at the
 *    arm's own uncorrected exact binomial (`k' >= 27` or `<= 13` at n = 40). §5.6 puts that same
 *    binomial in a 13-test Holm family. Neither is dropped: the arm-level verdict and the
 *    family-wise verdict are reported as two separate fields, and the verdict document states both
 *    in the same sentence.
 * 4. **The cluster for arm B's "cluster-bootstrap intervals" (§5.3).** Every arm-B rung is its own
 *    distinct pair; no unit is shared between rungs. The cluster bootstrap is run with one item per
 *    cluster, which is an item bootstrap, and the output says so rather than implying a clustering
 *    that does not exist. Arm C clusters on the cover, where sharing is real.
 * 5. **`ΔC` in the joint shape `√(ΔL² + w_C·ΔC²)` (§5.4).** Read as the full chromatic-plane
 *    displacement `hypot(ΔC, ΔH)`, not the chroma-only component, because §3.3 builds the
 *    non-isoluminant stratum by "putting the remainder in the chromatic plane" without splitting
 *    chroma from hue. The chroma-only reading is reported beside it as a sensitivity.
 * 6. **The two clamped bottom rungs (§3.2).** The chroma and hue ladders each have a bottom rung
 *    clamped up to 0.004, which is a left truncation at a run floor. Those two ladders declare
 *    `left-truncated-at-a-run-floor` to `fitWithDeclaredSupport`, and the required sensitivity
 *    check is computed — each ladder refitted with the clamped rung dropped — rather than asserted.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	type LogisticFit,
	type Observation,
	fitLogistic,
} from "../../src/review-server/analyze-bracketing.ts"
import {
	cartesianOfHex,
	decompose,
	spaceById,
} from "../../src/contract/perception-model-spaces.ts"
import { fitLogisticRidge, nelderMead } from "../../src/contract/perception-model-numerics.ts"
import {
	type SampleSupport,
	type SweepCell,
	clusterBootstrapCI,
	exactBinomialTest,
	fitWithDeclaredSupport,
	formatP,
	makeRng,
	sweepThenTest,
	wilsonInterval,
} from "../../src/stats/index.ts"
import { DEFAULT_WAREHOUSE_PATH } from "../../src/warehouse/cli.ts"
import { readAll } from "../../src/warehouse/warehouse.ts"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const FIXTURE_PATH = `${HERE}perception-round-4.json`
const TRUTH_PATH = `${HERE}perception-round-4-truth.json`
const PREREG_PATH = "research/v3/data/calibration/perception-round-4-preregistration.md"
const DEFAULT_OUT = `${HERE}perception-round-4-analysis.json`

const BATCH_ID = "perception-4"
const LABEL_SCHEMA = "perception-4.v1"
const PREREG_COMMIT = "4c7c891"

/** §5.6. Fixed in the prereg and not extensible after the answers were read. */
const FAMILY_SIZE = 13
const ALPHA = 0.05
/** §6.1 gate 3. */
const ESCAPE_SHARE_UNINTERPRETABLE_ABOVE = 0.25
/** §6.1 gate 2. Round 3's identity repeat consistency. */
const ROUND_3_REPEAT_CONSISTENCY = 5 / 6
/** Deterministic. Nothing here reads a clock. */
const SEED = 20260804
const RESAMPLES = 2000

// =================================================================================================
// Fixture, truth, answers
// =================================================================================================

type IdentityTruth = {
	firstHex: string
	secondHex: string
	region: string
	okLabDistance: number
	lightnessDelta: number
	chromaDelta: number
	hueDelta: number
	dominantDirection: "lightness" | "chroma" | "hue"
	identical: boolean
	rules: {
		okLabDistance: number
		okLabBar: number
		okLabSaysSame: boolean
		ictcpDistance: number
		ictcpThreshold: number
		ictcpSaysSame: boolean
		rulesDisagree: boolean
		disagreement: string
	} | null
	ladderDirection: "lightness" | "chroma" | "hue" | null
	rung: number | null
	targetDistance: number | null
	clampedToFloor: boolean | null
}

type AccentTruth = {
	stratum: "isoluminant" | "non-isoluminant"
	rung: number | null
	targetDistance: number
	hueThird: number
	lightnessShare: number | null
	lightnessSign: number | null
	governingRole: string
	band: string
	entryId: string
	imageId: string
	accentHex: string
	governing: { fieldHex: string; okLabDistance: number; chromaDistance: number; deltaApcaY: number }
}

type TruthItem = {
	itemId: string
	questionKey: string
	arm: "A" | "B" | "C" | "control" | "repeat"
	kind: "identity" | "accent"
	role: string
	stimulus: string
	identity: IdentityTruth | null
	accent: AccentTruth | null
	repeatOf: string | null
}

type Truth = {
	batchId: string
	ictcpThreshold: number
	okLabBars: Record<string, number>
	armBPriorBars: Record<"lightness" | "chroma" | "hue", number>
	items: TruthItem[]
}

type Fixture = { batchId: string; serveOrder: string[]; items: { itemId: string; questionKey: string }[] }

type AnswerValue = "same" | "different" | "works" | "does_not_work" | "cant_tell"

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T

/**
 * The answers, keyed by question key.
 *
 * Scoped to this batch and this label schema, human-authored, not retracted, not superseded. The
 * round has exactly one revision of each of its 148 answers, but the filters are written out rather
 * than assumed, because "there were no supersessions" is a fact about today's warehouse.
 */
function collectPerceptionFourAnswers(records: readonly unknown[]): {
	byQuestionKey: Map<string, AnswerValue>
	skipped: Record<string, number>
} {
	const skipped = { otherBatch: 0, otherSchema: 0, machineAuthored: 0, retracted: 0, superseded: 0, nonString: 0 }
	const superseded = new Set<string>()
	const candidates: { key: string; answer: AnswerValue; id: string; index: number }[] = []

	records.forEach((raw, index) => {
		const record = raw as Record<string, unknown>
		if (record.type !== "oracle-label") return
		const batch = record.batch as { id?: string } | null | undefined
		if ((batch?.id ?? null) !== BATCH_ID) {
			skipped.otherBatch += 1
			return
		}
		if (record.labelSchemaVersion !== LABEL_SCHEMA) {
			skipped.otherSchema += 1
			return
		}
		if (record.retracted === true) {
			skipped.retracted += 1
			return
		}
		const author = record.author as { kind?: string } | undefined
		if (author?.kind !== "human") {
			skipped.machineAuthored += 1
			return
		}
		if (typeof record.answer !== "string") {
			skipped.nonString += 1
			return
		}
		if (typeof record.supersedes === "string") superseded.add(record.supersedes)
		candidates.push({
			key: record.questionKey as string,
			answer: record.answer as AnswerValue,
			id: record.id as string,
			index,
		})
	})

	const byQuestionKey = new Map<string, AnswerValue>()
	const bestIndex = new Map<string, number>()
	for (const candidate of candidates) {
		if (superseded.has(candidate.id)) {
			skipped.superseded += 1
			continue
		}
		const seen = bestIndex.get(candidate.key)
		if (seen !== undefined && seen > candidate.index) continue
		bestIndex.set(candidate.key, candidate.index)
		byQuestionKey.set(candidate.key, candidate.answer)
	}
	return { byQuestionKey, skipped }
}

// =================================================================================================
// Exact Mann-Whitney rank-sum test
// =================================================================================================

/**
 * Two-sided exact Mann-Whitney (Wilcoxon rank-sum) test, by exact enumeration of the rank-sum
 * distribution.
 *
 * This is the null for every "is this threshold identified at all?" cell of the Holm family
 * (§5.6, ambiguity 2). It asks the question a threshold needs answered before it means anything —
 * do the "yes" answers sit at systematically different distances from the "no" answers? — without
 * assuming the logistic shape whose parameter is being reported, and without the separation
 * pathology that makes a Wald p on these ladders unreliable.
 *
 * The distribution is built by counting, for each way of choosing `k` of the `n` ranks, the number
 * of subsets with each rank sum. That is exact for every n in this round. All distances in this
 * round are distinct at double precision, which the caller asserts, so there is no tie correction.
 */
function exactRankSumP(groupA: readonly number[], groupB: readonly number[]): number {
	const n = groupA.length + groupB.length
	const k = groupA.length
	if (k === 0 || groupB.length === 0) return 1

	const all = [...groupA.map((v) => ({ v, a: true })), ...groupB.map((v) => ({ v, a: false }))]
	all.sort((x, y) => x.v - y.v)
	let observed = 0
	all.forEach((entry, index) => {
		if (entry.a) observed += index + 1
	})

	// counts[j][s] = number of ways to pick j ranks from the ranks seen so far summing to s
	const maxSum = (n * (n + 1)) / 2
	let counts: Float64Array[] = Array.from({ length: k + 1 }, () => new Float64Array(maxSum + 1))
	counts[0]![0] = 1
	for (let rank = 1; rank <= n; rank += 1) {
		for (let j = Math.min(k, rank); j >= 1; j -= 1) {
			const target = counts[j]!
			const source = counts[j - 1]!
			for (let s = maxSum; s >= rank; s -= 1) {
				const add = source[s - rank]!
				if (add !== 0) target[s] = target[s]! + add
			}
		}
	}
	const distribution = counts[k]!
	let total = 0
	for (let s = 0; s <= maxSum; s += 1) total += distribution[s]!

	// Two-sided by the method of small probabilities, matching `exactBinomialTest`'s convention.
	const observedProbability = distribution[observed]! / total
	let p = 0
	const tolerance = 1e-12
	for (let s = 0; s <= maxSum; s += 1) {
		const probability = distribution[s]! / total
		if (probability > 0 && probability <= observedProbability + tolerance) p += probability
	}
	return Math.min(1, p)
}

/**
 * The smallest two-sided p an exact rank-sum test can return at this split.
 *
 * This matters more than it looks. With `k` "yes" answers among `n`, the most extreme arrangement
 * there is — every "yes" below every "no" — still only has probability `1/C(n, k)`, and the
 * two-sided p is a small multiple of that. At 2 yes among 12 the floor is 0.0606, so a ladder that
 * is *perfectly* ordered cannot reach α = 0.05, let alone a Holm-corrected threshold. A cell that
 * fails its Holm step at a p equal to this floor has not produced weak evidence; it has produced
 * the strongest evidence its own split admits. Reported alongside every rank-sum cell so that the
 * two situations cannot be confused.
 */
function minimumAchievableRankSumP(yesCount: number, total: number): number {
	if (yesCount === 0 || yesCount === total) return 1
	const values = Array.from({ length: total }, (_, index) => index + 1)
	return exactRankSumP(values.slice(0, yesCount), values.slice(yesCount))
}

/** Chi-square survival function at 1 degree of freedom, via the complementary error function. */
function chiSquareOneDfP(statistic: number): number {
	if (!(statistic > 0)) return 1
	const x = Math.sqrt(statistic / 2)
	// Abramowitz & Stegun 7.1.26-style erfc, adequate at the precision a p-value is reported to.
	const t = 1 / (1 + 0.5 * x)
	const tau =
		t *
		Math.exp(
			-x * x -
				1.26551223 +
				t *
					(1.00002368 +
						t *
							(0.37409196 +
								t *
									(0.09678418 +
										t *
											(-0.18628806 +
												t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
		)
	return Math.min(1, Math.max(0, tau))
}

// =================================================================================================
// Main
// =================================================================================================

type ArmObservation = Observation & { cluster: string }

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string", default: DEFAULT_WAREHOUSE_PATH },
			out: { type: "string", default: DEFAULT_OUT },
		},
	})

	const fixture = await readJson<Fixture>(FIXTURE_PATH)
	const truth = await readJson<Truth>(TRUTH_PATH)
	const records = readAll(values.warehouse!)
	const { byQuestionKey, skipped } = collectPerceptionFourAnswers(records)

	const byItemId = new Map(truth.items.map((item) => [item.itemId, item]))
	const servePosition = new Map(fixture.serveOrder.map((itemId, index) => [itemId, index]))
	/** arm item id -> its silent repeat. */
	const repeatOf = new Map<string, TruthItem>()
	for (const item of truth.items) {
		if (item.role === "repeat" && item.repeatOf !== null) repeatOf.set(item.repeatOf, item)
	}

	const answerFor = (item: TruthItem): AnswerValue | null => byQuestionKey.get(item.questionKey) ?? null

	/**
	 * §5.1's "first showing", and §6.1 gate 5's "later answer", both by `serveOrder` (ambiguity 1).
	 * For an item with no repeat both return the item's own answer.
	 */
	const showing = (item: TruthItem, which: "first" | "later"): AnswerValue | null => {
		const twin = repeatOf.get(item.itemId)
		if (twin === undefined) return answerFor(item)
		const itemPosition = servePosition.get(item.itemId)!
		const twinPosition = servePosition.get(twin.itemId)!
		const earlier = itemPosition < twinPosition ? item : twin
		const later = itemPosition < twinPosition ? twin : item
		return answerFor(which === "first" ? earlier : later)
	}

	const answered = truth.items.filter((item) => answerFor(item) !== null).length
	const complete = answered === truth.items.length

	// ---------------------------------------------------------------------------------------------
	// §6.1 gate 1 — attention checks
	// ---------------------------------------------------------------------------------------------

	const controlRows = truth.items
		.filter((item) => item.role === "control-identical" || item.role === "control-obvious")
		.map((item) => {
			const expected =
				item.role === "control-identical"
					? item.kind === "identity"
						? "same"
						: "does_not_work"
					: item.kind === "identity"
						? "different"
						: "works"
			const observed = answerFor(item)
			return { itemId: item.itemId, role: item.role, kind: item.kind, expected, observed, correct: observed === expected }
		})
	const attentionChecksPassed = controlRows.length === 6 && controlRows.every((row) => row.correct)
	const voided = complete && !attentionChecksPassed

	// ---------------------------------------------------------------------------------------------
	// §6.1 gate 2 — repeat consistency
	// ---------------------------------------------------------------------------------------------

	const repeatRows = truth.items
		.filter((item) => item.role === "repeat" && item.repeatOf !== null)
		.map((item) => {
			const original = byItemId.get(item.repeatOf!)!
			const repeatPosition = servePosition.get(item.itemId)!
			const originalPosition = servePosition.get(original.itemId)!
			return {
				repeatItemId: item.itemId,
				originalItemId: original.itemId,
				kind: item.kind,
				servedFirst: repeatPosition < originalPosition ? item.itemId : original.itemId,
				firstAnswer: showing(original, "first"),
				laterAnswer: showing(original, "later"),
				consistent: showing(original, "first") === showing(original, "later"),
			}
		})
	const identityRepeats = repeatRows.filter((row) => row.kind === "identity")
	const accentRepeats = repeatRows.filter((row) => row.kind === "accent")
	const identityConsistent = identityRepeats.filter((row) => row.consistent).length
	const accentConsistent = accentRepeats.filter((row) => row.consistent).length

	// ---------------------------------------------------------------------------------------------
	// §6.1 gate 3 — escape share, per arm and per stratum
	// ---------------------------------------------------------------------------------------------

	const escapeGroups = new Map<string, { total: number; escapes: number }>()
	const noteEscape = (group: string, item: TruthItem): void => {
		const bucket = escapeGroups.get(group) ?? { total: 0, escapes: 0 }
		bucket.total += 1
		if (answerFor(item) === "cant_tell") bucket.escapes += 1
		escapeGroups.set(group, bucket)
	}
	for (const item of truth.items) {
		noteEscape(item.role, item)
		if (item.role === "arm-b" && item.identity?.ladderDirection) noteEscape(`arm-b:${item.identity.ladderDirection}`, item)
		if (item.accent) noteEscape(`arm-c:${item.accent.stratum}:hue-third-${item.accent.hueThird}`, item)
	}
	const escapeShare = Object.fromEntries(
		[...escapeGroups].map(([group, bucket]) => [
			group,
			{
				answered: bucket.total,
				escapes: bucket.escapes,
				share: bucket.total === 0 ? 0 : bucket.escapes / bucket.total,
				interpretable: bucket.total === 0 ? false : bucket.escapes / bucket.total <= ESCAPE_SHARE_UNINTERPRETABLE_ABOVE,
			},
		]),
	)

	// ---------------------------------------------------------------------------------------------
	// §5.1 / §5.2 — arm A, one binomial, and the anisotropy veto
	// ---------------------------------------------------------------------------------------------

	const armAItems = truth.items.filter((item) => item.role === "arm-a")

	const scoreArmA = (which: "first" | "later") => {
		const scored = armAItems
			.map((item) => ({ item, answer: showing(item, which) }))
			.filter((row) => row.answer === "same" || row.answer === "different")
		const matches = (row: { item: TruthItem; answer: AnswerValue | null }): boolean =>
			(row.answer === "same") === row.item.identity!.rules!.ictcpSaysSame
		const subgroup = (direction: "lightness" | "chroma") => {
			const rows = scored.filter((row) => row.item.identity!.dominantDirection === direction)
			const successes = rows.filter(matches).length
			const test = exactBinomialTest({
				alternative: "two-sided",
				trialsAreDistinctUnits: true,
				successes,
				trials: rows.length,
				nullProbability: 0.5,
			})
			if (!test.ok) throw new Error(`arm A ${direction} subgroup: ${test.detail}`)
			return { direction, successes, trials: rows.length, rate: rows.length === 0 ? null : successes / rows.length, pValue: test.pValue, test }
		}
		const successes = scored.filter(matches).length
		const trials = scored.length
		const test = exactBinomialTest({
			alternative: "two-sided",
			trialsAreDistinctUnits: true,
			successes,
			trials,
			nullProbability: 0.5,
		})
		if (!test.ok) throw new Error(`arm A: ${test.detail}`)
		const lightness = subgroup("lightness")
		const chroma = subgroup("chroma")
		const oppositeSides =
			lightness.rate !== null && chroma.rate !== null && (lightness.rate - 0.5) * (chroma.rate - 0.5) < 0
		const eitherDecisive = lightness.pValue < ALPHA || chroma.pValue < ALPHA
		const vetoFires = oppositeSides && eitherDecisive
		const decisive = test.pValue < ALPHA
		return {
			successesForIctcp: successes,
			trials,
			accuracyIctcpGlobal: trials === 0 ? null : successes / trials,
			accuracyOkLabFourBar: trials === 0 ? null : 1 - successes / trials,
			pValue: test.pValue,
			decisiveAtArmLevel: decisive,
			winner: vetoFires ? null : decisive ? (successes / trials > 0.5 ? "ictcp-global" : "oklab-four-bar") : null,
			veto: { lightness, chroma, oppositeSidesOfHalf: oppositeSides, eitherSubgroupDecisive: eitherDecisive, fires: vetoFires },
			test,
		}
	}

	const armAPrimary = scoreArmA("first")
	const armASensitivity = scoreArmA("later")
	/** §5.1: recomputed at the realised n, which is 40 because no arm-A item was escaped. */
	const armACriticalValues = (() => {
		const n = armAPrimary.trials
		let low: number | null = null
		let high: number | null = null
		for (let k = 0; k <= n; k += 1) {
			const test = exactBinomialTest({
				alternative: "two-sided",
				trialsAreDistinctUnits: true,
				successes: k,
				trials: n,
				nullProbability: 0.5,
			})
			if (!test.ok) continue
			if (test.pValue < ALPHA) {
				if (k <= n / 2) low = k
				else if (high === null) high = k
			}
		}
		return { n, decisiveAtOrBelow: low, decisiveAtOrAbove: high }
	})()

	// ---------------------------------------------------------------------------------------------
	// §5.3 — arm B, three direction ladders
	// ---------------------------------------------------------------------------------------------

	const DIRECTIONS = ["lightness", "chroma", "hue"] as const
	type Direction = (typeof DIRECTIONS)[number]

	const armBRows = (direction: Direction, which: "first" | "later") =>
		truth.items
			.filter((item) => item.role === "arm-b" && item.identity!.ladderDirection === direction)
			.map((item) => ({ item, answer: showing(item, which) }))
			.filter((row) => row.answer === "same" || row.answer === "different")
			.map((row) => ({
				itemId: row.item.itemId,
				distance: row.item.identity!.okLabDistance,
				yes: row.answer === "same",
				clamped: row.item.identity!.clampedToFloor === true,
				rung: row.item.identity!.rung,
			}))

	const fitLadder = (direction: Direction, which: "first" | "later") => {
		const rows = armBRows(direction, which)
		const centre = truth.armBPriorBars[direction]
		const yesCount = rows.filter((row) => row.yes).length
		const degenerate = rows.length > 0 && (yesCount === 0 || yesCount === rows.length)
		const clampedRows = rows.filter((row) => row.clamped)
		const observations: Observation[] = rows.map((row) => ({ itemId: row.itemId, distance: row.distance, yes: row.yes }))

		// §3.2 declares the clamp; `left-truncated-at-a-run-floor` demands the check be computed.
		const withoutClamped = fitLogistic(
			observations.filter((row) => !clampedRows.some((clamped) => clamped.itemId === row.itemId)),
			"decreasing",
		)
		const fullFit = fitLogistic(observations, "decreasing")
		const sensitivityCheck =
			clampedRows.length === 0
				? "no rung was clamped on this ladder"
				: `refitted with the ${clampedRows.length} clamped rung(s) dropped: threshold ${
						withoutClamped.threshold === null ? "not identified" : withoutClamped.threshold.toFixed(6)
					} against ${fullFit.threshold === null ? "not identified" : fullFit.threshold.toFixed(6)} on the full ladder`

		const support: SampleSupport = {
			variableUnderTest: `OKLab distance along a pure ${direction} step, inside dark-neutral`,
			claimDomain: { min: centre / 3, max: centre * 3 },
			observedValues: rows.map((row) => row.distance),
			selectionRule:
				"12 log-spaced rungs placed by the study's shape-(d) OKLab fit before any answer existed; every rung was answered",
			selectionRelationToVariable:
				clampedRows.length === 0
					? { kind: "independent-of-the-variable" }
					: { kind: "left-truncated-at-a-run-floor", floor: 0.004, sensitivityCheck },
		}
		const guarded = fitWithDeclaredSupport(support, () => fullFit, (fit) => fit.threshold)

		// The Holm cell for a threshold: does the answer depend on distance at all?
		const yesDistances = rows.filter((row) => row.yes).map((row) => row.distance)
		const noDistances = rows.filter((row) => !row.yes).map((row) => row.distance)
		const pValue = degenerate ? 1 : exactRankSumP(yesDistances, noDistances)
		const floor = minimumAchievableRankSumP(yesDistances.length, rows.length)

		return {
			direction,
			rows,
			degenerate,
			guarded,
			fit: fullFit,
			withoutClampedThreshold: withoutClamped.threshold,
			sensitivityCheck,
			pValue,
			smallestAchievablePValue: floor,
			atItsOwnFloor: Math.abs(pValue - floor) < 1e-12,
			centre,
		}
	}

	const armBLadders = (which: "first" | "later") =>
		Object.fromEntries(DIRECTIONS.map((direction) => [direction, fitLadder(direction, which)])) as Record<
			Direction,
			ReturnType<typeof fitLadder>
		>

	const armBPrimary = armBLadders("first")
	const armBSensitivityLadders = armBLadders("later")

	const ladderThreshold = (rows: readonly { distance: number; yes: boolean; itemId: string }[]): number | null =>
		fitLogistic(rows.map((row) => ({ itemId: row.itemId, distance: row.distance, yes: row.yes })), "decreasing").threshold

	const ratioInterval = (numerator: Direction, denominator: Direction, ladders: Record<Direction, ReturnType<typeof fitLadder>>) => {
		const numeratorRows = ladders[numerator].rows
		const denominatorRows = ladders[denominator].rows
		if (ladders[numerator].degenerate || ladders[denominator].degenerate) return null
		type Unit = { side: "numerator" | "denominator"; distance: number; yes: boolean; itemId: string }
		const clusters: Unit[][] = [
			...numeratorRows.map((row) => [{ side: "numerator" as const, distance: row.distance, yes: row.yes, itemId: row.itemId }]),
			...denominatorRows.map((row) => [{ side: "denominator" as const, distance: row.distance, yes: row.yes, itemId: row.itemId }]),
		]
		const statistic = (sample: readonly Unit[]): number | null => {
			const top = ladderThreshold(sample.filter((unit) => unit.side === "numerator"))
			const bottom = ladderThreshold(sample.filter((unit) => unit.side === "denominator"))
			if (top === null || bottom === null || !(bottom > 0)) return null
			return top / bottom
		}
		const interval = clusterBootstrapCI({
			clusters,
			statistic,
			resamples: RESAMPLES,
			seed: SEED,
			clusterBy:
				"one ladder rung per cluster — every rung is a distinct pair and no unit is shared between rungs, so this reduces to an item bootstrap and is reported as such",
		})
		// A second seeded bootstrap for the two-sided p against 1, because `clusterBootstrapCI`
		// deliberately returns no draw distribution. Same technique `perception-model-study.ts` uses.
		const rng = makeRng(SEED)
		let atOrBelowOne = 0
		let atOrAboveOne = 0
		let usable = 0
		for (let draw = 0; draw < RESAMPLES; draw += 1) {
			const sample: Unit[] = []
			for (let pick = 0; pick < clusters.length; pick += 1) {
				const cluster = clusters[Math.floor(rng() * clusters.length)]!
				sample.push(...cluster)
			}
			const value = statistic(sample)
			if (value === null) continue
			usable += 1
			if (value <= 1) atOrBelowOne += 1
			if (value >= 1) atOrAboveOne += 1
		}
		// Davison & Hinkley's (b+1)/(m+1): a bootstrap p is never reported as 0, because 0 would
		// claim a resolution 2000 draws do not have. The floor here is 2/2001 ≈ 0.001.
		const pValue = usable === 0 ? 1 : Math.min(1, (2 * (Math.min(atOrBelowOne, atOrAboveOne) + 1)) / (usable + 1))
		return {
			numerator,
			denominator,
			interval,
			pValue,
			usableDraws: usable,
			drawsAtOrBelowOne: atOrBelowOne,
			drawsAtOrAboveOne: atOrAboveOne,
			smallestReportablePValue: usable === 0 ? 1 : 2 / (usable + 1),
		}
	}

	const armBRatios = {
		lightnessOverChroma: ratioInterval("lightness", "chroma", armBPrimary),
		lightnessOverHue: ratioInterval("lightness", "hue", armBPrimary),
	}
	const armBRatiosSensitivity = {
		lightnessOverChroma: ratioInterval("lightness", "chroma", armBSensitivityLadders),
		lightnessOverHue: ratioInterval("lightness", "hue", armBSensitivityLadders),
	}

	// ---------------------------------------------------------------------------------------------
	// §5.4 — arm C
	// ---------------------------------------------------------------------------------------------

	const oklab = spaceById("oklab")
	const accentGeometry = (item: TruthItem) => {
		const accent = cartesianOfHex(oklab, item.accent!.accentHex as never)
		const field = cartesianOfHex(oklab, item.accent!.governing.fieldHex as never)
		return decompose(accent, field)
	}

	const armCRows = (role: string, which: "first" | "later") =>
		truth.items
			.filter((item) => item.role === role)
			.map((item) => ({ item, answer: showing(item, which) }))
			.filter((row) => row.answer === "works" || row.answer === "does_not_work")
			.map((row) => {
				const geometry = accentGeometry(row.item)
				return {
					itemId: row.item.itemId,
					distance: row.item.accent!.governing.okLabDistance,
					yes: row.answer === "works",
					hueThird: row.item.accent!.hueThird,
					cluster: row.item.accent!.entryId,
					stratum: row.item.accent!.stratum,
					deltaLightness: Math.abs(geometry.deltaLightness),
					deltaChroma: Math.abs(geometry.deltaChroma),
					deltaHue: Math.abs(geometry.deltaHue),
					chromaticPlane: Math.hypot(geometry.deltaChroma, geometry.deltaHue),
				}
			})

	type AccentRow = ReturnType<typeof armCRows>[number]

	const ACCENT_CLAIM_DOMAIN = { min: 0.06, max: 0.3 }
	const accentSupport = (rows: readonly AccentRow[], label: string): SampleSupport => ({
		variableUnderTest: `OKLab distance from the accent to its governing field (${label})`,
		claimDomain: ACCENT_CLAIM_DOMAIN,
		observedValues: rows.map((row) => row.distance),
		selectionRule:
			"12 log-spaced rungs per hue third, placed before any answer existed; covers chosen for gamut feasibility, never for the answer",
		// `accent-real-round-1-preregistration.md` §6.2, reused unchanged per prereg §5.4.
		selectionRelationToVariable: { kind: "independent-of-the-variable" },
	})

	const fitAccent = (rows: readonly AccentRow[], label: string) => {
		const observations: Observation[] = rows.map((row) => ({ itemId: row.itemId, distance: row.distance, yes: row.yes }))
		const guarded = fitWithDeclaredSupport(accentSupport(rows, label), () => fitLogistic(observations, "increasing"), (fit) => fit.threshold)
		const yesDistances = rows.filter((row) => row.yes).map((row) => row.distance)
		const noDistances = rows.filter((row) => !row.yes).map((row) => row.distance)
		const degenerate = yesDistances.length === 0 || noDistances.length === 0
		const fit = guarded.fit as LogisticFit
		/**
		 * A threshold that lands outside the claim domain [0.06, 0.30] is not a large threshold; it
		 * is the fit saying there is no crossing anywhere in the sampled range. Hue third 2 returns
		 * 1536 with an interval spanning 180 orders of magnitude, and printing that as a number would
		 * be the analysis pretending to have measured something.
		 */
		const identifiedWithinClaimDomain =
			fit.threshold !== null && fit.threshold >= ACCENT_CLAIM_DOMAIN.min && fit.threshold <= ACCENT_CLAIM_DOMAIN.max
		return {
			label,
			n: rows.length,
			yesCount: yesDistances.length,
			guarded,
			fit,
			identifiedWithinClaimDomain,
			pValue: degenerate ? 1 : exactRankSumP(yesDistances, noDistances),
			smallestAchievablePValue: minimumAchievableRankSumP(yesDistances.length, rows.length),
		}
	}

	const isoluminantRows = (which: "first" | "later") => armCRows("arm-c-isoluminant", which)
	const nonIsoluminantRows = (which: "first" | "later") => armCRows("arm-c-non-isoluminant", which)

	const scoreArmC = (which: "first" | "later") => {
		const iso = isoluminantRows(which)
		const nonIso = nonIsoluminantRows(which)
		const pooled = fitAccent(iso, "pooled over the 36 isoluminant items")
		const perThird = [0, 1, 2].map((third) => {
			const rows = iso.filter((row) => row.hueThird === third)
			return { hueThird: third, ...fitAccent(rows, `isoluminant, hue third ${third}`) }
		})
		const pooledInterval = pooled.fit.confidenceInterval
		const outside = perThird.map((third) => {
			const value = third.fit.threshold
			if (value === null || pooledInterval === null) return { hueThird: third.hueThird, threshold: value, outsidePooledInterval: null as boolean | null }
			return {
				hueThird: third.hueThird,
				threshold: value,
				outsidePooledInterval: value < pooledInterval.low || value > pooledInterval.high,
			}
		})
		const anyOutside = outside.some((row) => row.outsidePooledInterval === true)
		const anyUnidentified = perThird.some((third) => !third.identifiedWithinClaimDomain)
		const nonIsoFit = fitAccent(nonIso, "non-isoluminant stratum, fitted separately and never pooled")

		return {
			pooled,
			perThird,
			pooledInterval,
			strataVersusPooled: outside,
			refused: anyOutside || anyUnidentified,
			verdict: anyOutside || anyUnidentified ? "stratum-dependent" : "pooled-fit-admissible",
			nonIsoluminant: nonIsoFit,
			isoRows: iso,
			nonIsoRows: nonIso,
		}
	}

	const armCPrimary = scoreArmC("first")
	const armCSensitivity = scoreArmC("later")

	/**
	 * §5.4's exploratory half: `w_C` in `√(ΔL² + w_C·ΔC²)`, fitted across both strata jointly.
	 *
	 * Profiled: for each candidate `w_C` the two logistic coefficients are refitted, so the search is
	 * one-dimensional in `log w_C` and deterministic. The test against `w_C = 1` (isotropic — a
	 * lightness step and a chromatic step of the same size are worth the same to an accent) is a
	 * likelihood-ratio test at one degree of freedom.
	 */
	const jointWc = (which: "first" | "later", chromaticReading: "chromatic-plane" | "chroma-only") => {
		const rows = [...isoluminantRows(which), ...nonIsoluminantRows(which)]
		const chromatic = (row: AccentRow): number => (chromaticReading === "chromatic-plane" ? row.chromaticPlane : row.deltaChroma)
		const logLikelihood = (weightChroma: number): number => {
			if (!(weightChroma > 0) || !Number.isFinite(weightChroma)) return -1e9
			const design = rows.map((row) => {
				const distance = Math.sqrt(row.deltaLightness ** 2 + weightChroma * chromatic(row) ** 2)
				return { x: [1, Math.log(Math.max(distance, 1e-9))], y: row.yes, cluster: row.cluster }
			})
			try {
				return fitLogisticRidge(design).penalisedLogLikelihood
			} catch {
				return -1e9
			}
		}
		const search = nelderMead((x) => -logLikelihood(Math.exp(x[0]!)), [0], { initialStep: 0.5 })
		const estimate = Math.exp(search.x[0]!)
		const atEstimate = logLikelihood(estimate)
		const atOne = logLikelihood(1)
		const statistic = 2 * (atEstimate - atOne)
		const pValue = chiSquareOneDfP(Math.max(0, statistic))
		return {
			chromaticReading,
			weightChroma: estimate,
			logLikelihoodAtEstimate: atEstimate,
			logLikelihoodAtIsotropic: atOne,
			likelihoodRatioStatistic: statistic,
			pValue,
			converged: search.converged,
			n: rows.length,
			interpretation:
				estimate < 1
					? "below 1: a chromatic step buys less than a lightness step of the same OKLab size"
					: "at or above 1: a chromatic step buys at least as much as a lightness step of the same OKLab size",
		}
	}

	const wcPrimary = jointWc("first", "chromatic-plane")
	const wcChromaOnly = jointWc("first", "chroma-only")
	const wcSensitivity = jointWc("later", "chromatic-plane")

	/** The lightness axis, read as a rate contrast at matched target distance. Descriptive, not a §5 test. */
	const lightnessAxisContrast = (() => {
		const iso = armCPrimary.isoRows
		const nonIso = armCPrimary.nonIsoRows
		const near = (rows: readonly AccentRow[], target: number, tolerance: number) =>
			rows.filter((row) => Math.abs(row.distance - target) <= tolerance)
		const band = (target: number, tolerance: number) => {
			const isoBand = near(iso, target, tolerance)
			const nonIsoBand = near(nonIso, target, tolerance)
			const rate = (rows: readonly AccentRow[]) => (rows.length === 0 ? null : rows.filter((row) => row.yes).length / rows.length)
			return {
				targetDistance: target,
				tolerance,
				isoluminant: { n: isoBand.length, works: isoBand.filter((row) => row.yes).length, rate: rate(isoBand) },
				nonIsoluminant: { n: nonIsoBand.length, works: nonIsoBand.filter((row) => row.yes).length, rate: rate(nonIsoBand) },
			}
		}
		const overall = {
			isoluminant: { n: iso.length, works: iso.filter((row) => row.yes).length, rate: iso.length === 0 ? null : iso.filter((row) => row.yes).length / iso.length },
			nonIsoluminant: {
				n: nonIso.length,
				works: nonIso.filter((row) => row.yes).length,
				rate: nonIso.length === 0 ? null : nonIso.filter((row) => row.yes).length / nonIso.length,
			},
		}
		return { overall, bands: [band(0.09, 0.012), band(0.2, 0.025)] }
	})()

	// ---------------------------------------------------------------------------------------------
	// §5.6 — the fixed 13-test Holm family
	// ---------------------------------------------------------------------------------------------

	const buildFamily = (
		armA: ReturnType<typeof scoreArmA>,
		ladders: Record<Direction, ReturnType<typeof fitLadder>>,
		ratios: { lightnessOverChroma: ReturnType<typeof ratioInterval>; lightnessOverHue: ReturnType<typeof ratioInterval> },
		armC: ReturnType<typeof scoreArmC>,
		wc: ReturnType<typeof jointWc>,
	): SweepCell[] => [
		{ id: "arm-a-binomial", pValue: armA.pValue, label: "arm A: k' against p = 0.5, exact binomial" },
		{ id: "arm-a-veto-lightness", pValue: armA.veto.lightness.pValue, label: "arm A veto: lightness-dominant subgroup" },
		{ id: "arm-a-veto-chroma", pValue: armA.veto.chroma.pValue, label: "arm A veto: chroma-dominant subgroup" },
		...DIRECTIONS.map((direction) => ({
			id: `arm-b-threshold-${direction}`,
			pValue: ladders[direction].pValue,
			label: `arm B: does the ${direction} ladder discriminate (exact rank-sum)`,
		})),
		{
			id: "arm-b-ratio-lightness-over-chroma",
			pValue: ratios.lightnessOverChroma?.pValue ?? 1,
			label: "arm B: lightness/chroma threshold ratio against 1",
		},
		{ id: "arm-b-ratio-lightness-over-hue", pValue: ratios.lightnessOverHue?.pValue ?? 1, label: "arm B: lightness/hue threshold ratio against 1" },
		...armC.perThird.map((third) => ({
			id: `arm-c-hue-third-${third.hueThird}`,
			pValue: third.pValue,
			label: `arm C: isoluminant hue third ${third.hueThird} (exact rank-sum)`,
		})),
		{ id: "arm-c-pooled", pValue: armC.pooled.pValue, label: "arm C: pooled isoluminant fit (exact rank-sum)" },
		{ id: "arm-c-joint-wc", pValue: wc.pValue, label: "arm C: joint w_C against 1 (likelihood ratio, 1 df)" },
	]

	const familyPrimary = buildFamily(armAPrimary, armBPrimary, armBRatios, armCPrimary, wcPrimary)
	const familySensitivity = buildFamily(armASensitivity, armBSensitivityLadders, armBRatiosSensitivity, armCSensitivity, wcSensitivity)

	const declaration = {
		comparisonsRun: FAMILY_SIZE,
		correction: "holm" as const,
		alpha: ALPHA,
		familyDefinition:
			"perception-round-4-preregistration.md §5.6, fixed before the answers were read: arm A's binomial, its two veto subgroups, arm B's three thresholds and two ratios, arm C's three per-hue-third fits, its pooled fit, and the joint w_C estimate. 13 tests. Not extensible.",
	}
	const holm = sweepThenTest(familyPrimary, declaration)
	const holmSensitivity = sweepThenTest(familySensitivity, declaration)
	if (!holm.ok || !holmSensitivity.ok) throw new Error(`sweepThenTest refused: ${holm.ok ? holmSensitivity : holm}`)

	const survivor = (id: string, sweep: typeof holm) => sweep.cells.find((cell) => cell.id === id)!

	// ---------------------------------------------------------------------------------------------
	// §6.1 gate 5 — the sensitivity substitution can only downgrade
	// ---------------------------------------------------------------------------------------------

	const verdictPairs = [
		{ id: "arm-a-decisive", primary: String(armAPrimary.decisiveAtArmLevel), sensitivity: String(armASensitivity.decisiveAtArmLevel) },
		{ id: "arm-a-winner", primary: String(armAPrimary.winner), sensitivity: String(armASensitivity.winner) },
		{ id: "arm-a-veto-fires", primary: String(armAPrimary.veto.fires), sensitivity: String(armASensitivity.veto.fires) },
		...DIRECTIONS.map((direction) => ({
			id: `arm-b-${direction}-degenerate`,
			primary: String(armBPrimary[direction].degenerate),
			sensitivity: String(armBSensitivityLadders[direction].degenerate),
		})),
		{ id: "arm-c-verdict", primary: armCPrimary.verdict, sensitivity: armCSensitivity.verdict },
		{ id: "arm-c-wc-side-of-one", primary: String(wcPrimary.weightChroma < 1), sensitivity: String(wcSensitivity.weightChroma < 1) },
		...familyPrimary.map((cell) => ({
			id: `holm-survives:${cell.id}`,
			primary: String(survivor(cell.id, holm).survivesCorrection),
			sensitivity: String(survivor(cell.id, holmSensitivity).survivesCorrection),
		})),
	]
	const unstableVerdicts = verdictPairs.filter((pair) => pair.primary !== pair.sensitivity)

	// ---------------------------------------------------------------------------------------------
	// Output
	// ---------------------------------------------------------------------------------------------

	const analysis = {
		schema: "perception-round-4-analysis/v1",
		batchId: BATCH_ID,
		preregistration: PREREG_PATH,
		preregistrationCommit: PREREG_COMMIT,
		generatedBy: "research/v3/data/calibration/analyze-perception-round-4.ts",
		warehouse: values.warehouse,
		itemsInFixture: truth.items.length,
		itemsAnswered: answered,
		complete,
		answerSkips: skipped,
		criteria: {
			identity: "register-as-same, clarified 2026-08-02 after a false start under a detection criterion",
			functional:
				"functional-visibility on real stimuli, with accent-real-1's mid-round chat clarification now served on screen rather than given in conversation — the served strings are NOT byte-identical to accent-real-1's and no comparison here describes them as such (prereg §2.2)",
		},
		analyzerNotCommittedBeforeScoring: {
			preregSection: "§8",
			stated:
				"The prereg asked for this analyzer to be committed before the round was scored and run as committed. It was not; it was written after the 148 answers existed. Every rule it implements is quoted from the prereg frozen at 4c7c891, and every open reading is listed in ambiguityResolutions.",
		},
		ambiguityResolutions: [
			{
				id: "first-showing-by-serve-order",
				preregSection: "§5.1, §6.1 gate 5",
				ambiguity:
					"'each at its first showing' and 'each repeated item's later answer' need an order, and the repeat-role item is not reliably the later showing.",
				resolution:
					"Order comes from the fixture's serveOrder and never from timestamps (standing ruling). The repeat-role item was served EARLIER than its arm counterpart in 3 of the 6 pairs, so 'first showing' is not the same as 'the arm item's own answer'.",
				consequenceIfReadTheOtherWay:
					"Both readings are bracketed by gate 5: the primary run uses the first showing and the sensitivity run uses the later, and any verdict that differs between them is reported unresolved.",
			},
			{
				id: "nulls-for-the-thirteen-holm-cells",
				preregSection: "§5.6",
				ambiguity: "The family is named but only arm A's null is stated.",
				resolution:
					"A threshold cell tests whether the answer depends on distance at all, by exact two-sided Mann-Whitney rank-sum (no logistic shape assumed, no separation pathology). A ratio cell tests the ratio against 1 by a seeded two-sided cluster bootstrap. The w_C cell is a likelihood-ratio test against w_C = 1 at 1 df.",
			},
			{
				id: "arm-a-decisiveness-versus-holm",
				preregSection: "§5.1 against §5.6",
				ambiguity:
					"§5.1 fixes decisiveness at the arm's own uncorrected exact binomial (k' >= 27 or <= 13 at n = 40). §5.6 puts that binomial inside a 13-test Holm family. The two can disagree, and here they do.",
				resolution:
					"Both are reported, neither is dropped, and no wording softens either. `armA.decisiveAtArmLevel` is the §5.1 verdict; `holm` carries the §5.6 verdict; the verdict document states them in the same sentence.",
			},
			{
				id: "arm-b-cluster-is-the-rung",
				preregSection: "§5.3",
				ambiguity: "'cluster-bootstrap intervals' does not say what the cluster is, and arm B has no shared unit.",
				resolution:
					"One rung per cluster, which makes it an item bootstrap. Said out loud in the provenance rather than implying a clustering that does not exist. Arm C clusters on the cover, where sharing is real (62 covers over 64 items).",
			},
			{
				id: "delta-c-in-the-joint-shape",
				preregSection: "§5.4",
				ambiguity: "`√(ΔL² + w_C·ΔC²)` does not say whether ΔC is chroma alone or the whole chromatic plane.",
				resolution:
					"Read as the chromatic plane, hypot(ΔC, ΔH), because §3.3 builds the non-isoluminant stratum by putting the remainder 'in the chromatic plane' without splitting chroma from hue. The chroma-only reading is reported beside it as `jointWeightChromaSensitivity`.",
			},
			{
				id: "clamped-rungs-are-a-left-truncation",
				preregSection: "§3.2",
				ambiguity:
					"Two bottom rungs are clamped up to 0.004. The prereg declares the clamp but does not say how the fit should treat it.",
				resolution:
					"The chroma and hue ladders declare `left-truncated-at-a-run-floor` at 0.004 to fitWithDeclaredSupport, and the required sensitivity check is computed — each ladder refitted with the clamped rung dropped — rather than asserted.",
			},
		],
		gates: {
			order: "§6.1, checked before any §5 quantity was computed",
			attentionChecks: { passed: attentionChecksPassed, voided, rows: controlRows },
			repeatConsistency: {
				comparedAgainst: ROUND_3_REPEAT_CONSISTENCY,
				identity: {
					consistent: identityConsistent,
					of: identityRepeats.length,
					rate: identityRepeats.length === 0 ? null : identityConsistent / identityRepeats.length,
					interval: wilsonInterval(identityConsistent, identityRepeats.length),
					caveat:
						"Four is a thin re-measurement and the prereg says so (§6.1 gate 2): it can contradict 83.3% loudly and it cannot confirm it precisely. Nothing downstream re-derives the lapse rate from this number.",
				},
				accent: { consistent: accentConsistent, of: accentRepeats.length, rate: accentRepeats.length === 0 ? null : accentConsistent / accentRepeats.length },
				allSix: { consistent: identityConsistent + accentConsistent, of: repeatRows.length },
				rows: repeatRows,
			},
			escapeShare: {
				threshold: ESCAPE_SHARE_UNINTERPRETABLE_ABOVE,
				neverSubtracted: "reported per arm and per stratum, never subtracted, never folded into either column (§6.1 gate 3)",
				groups: escapeShare,
				anyArmUninterpretable: Object.values(escapeShare).some((group) => !group.interpretable),
			},
			degenerateLadders: {
				rule: "§6.1 gate 4 — a ladder that returns all-same or all-different across all twelve rungs is degenerate; its threshold is not reported and its ratio is not computed",
				byDirection: Object.fromEntries(
					DIRECTIONS.map((direction) => [
						direction,
						{ degenerate: armBPrimary[direction].degenerate, yesCount: armBPrimary[direction].rows.filter((row) => row.yes).length, n: armBPrimary[direction].rows.length },
					]),
				),
			},
			repeatSubstitutionSensitivity: {
				rule: "§6.1 gate 5 — every scored quantity re-run with each repeated item's later answer substituted for its first; any verdict that differs is unresolved whatever the primary run said",
				verdictsCompared: verdictPairs.length,
				unstable: unstableVerdicts,
				anyUnstable: unstableVerdicts.length > 0,
			},
		},
		armA: {
			preregSection: "§5.1, §5.2",
			population: "the 40 items with role arm-a, each at its first showing; controls never scored; repeats are not independent trials",
			criticalValues: armACriticalValues,
			primary: {
				successesForIctcp: armAPrimary.successesForIctcp,
				trials: armAPrimary.trials,
				accuracyIctcpGlobal: armAPrimary.accuracyIctcpGlobal,
				accuracyOkLabFourBar: armAPrimary.accuracyOkLabFourBar,
				pValue: armAPrimary.pValue,
				decisiveAtArmLevel: armAPrimary.decisiveAtArmLevel,
				winner: armAPrimary.winner,
				holm: survivor("arm-a-binomial", holm),
				summary: armAPrimary.test.summary,
				provenance: armAPrimary.test.provenance,
			},
			anisotropyVeto: {
				rule: "§5.2 — if the two subgroups fall on opposite sides of 0.5 and at least one is individually decisive at α = 0.05, the arm reports anisotropy-confounded and there is no winner",
				lightness: { successes: armAPrimary.veto.lightness.successes, trials: armAPrimary.veto.lightness.trials, rate: armAPrimary.veto.lightness.rate, pValue: armAPrimary.veto.lightness.pValue },
				chroma: { successes: armAPrimary.veto.chroma.successes, trials: armAPrimary.veto.chroma.trials, rate: armAPrimary.veto.chroma.rate, pValue: armAPrimary.veto.chroma.pValue },
				oppositeSidesOfHalf: armAPrimary.veto.oppositeSidesOfHalf,
				eitherSubgroupDecisive: armAPrimary.veto.eitherSubgroupDecisive,
				fires: armAPrimary.veto.fires,
			},
			sensitivity: {
				successesForIctcp: armASensitivity.successesForIctcp,
				trials: armASensitivity.trials,
				pValue: armASensitivity.pValue,
				decisiveAtArmLevel: armASensitivity.decisiveAtArmLevel,
				winner: armASensitivity.winner,
				vetoFires: armASensitivity.veto.fires,
			},
			whatADecisiveResultLicenses:
				"§5.1 and §7 — a proposed decision record naming the better predictor, and no constant change on its own. Changing the contract's ruler is a larger decision than one binomial funds.",
			whatItDoesNotSettle:
				"§5.1 — it does not test where REGION_LIGHTNESS_BOUNDARY (0.55) or REGION_CHROMA_BOUNDARY (0.05) sit, only whether a partition at those locations is needed at all. A boundary in the wrong place and a boundary that should not exist look similar here.",
		},
		armB: {
			preregSection: "§5.3",
			declaredUnderPoweredForAdoption:
				"§3.4 and §5.3, on the record before the round ran: at 12 rungs a direction ladder can confirm a ~4x anisotropy ratio and cannot pin it; 30 per ladder would be needed to tell a 2x ratio from no ratio. No adoption from arm B.",
			ladders: Object.fromEntries(
				DIRECTIONS.map((direction) => {
					const ladder = armBPrimary[direction]
					return [
						direction,
						{
							n: ladder.rows.length,
							sameCount: ladder.rows.filter((row) => row.yes).length,
							degenerate: ladder.degenerate,
							priorCentre: ladder.centre,
							threshold: ladder.fit.threshold,
							fittedThreshold: ladder.fit.fittedThreshold,
							confidenceInterval: ladder.fit.confidenceInterval,
							separated: ladder.fit.separated,
							separationInterval: ladder.fit.separationInterval,
							converged: ladder.fit.converged,
							note: ladder.fit.note,
							clampSensitivity: { thresholdWithClampedRungDropped: ladder.withoutClampedThreshold, check: ladder.sensitivityCheck },
							support: ladder.guarded.support,
							extrapolatedBeyondSample: ladder.guarded.extrapolatedBeyondSample,
							discriminationTest: {
								method: "exact two-sided Mann-Whitney rank-sum of distance against answer",
								pValue: ladder.pValue,
								smallestAchievablePValue: ladder.smallestAchievablePValue,
								atItsOwnFloor: ladder.atItsOwnFloor,
								note: ladder.atItsOwnFloor
									? "this ladder is perfectly ordered — every 'same' below every 'different' — and this p IS the smallest its own yes/no split can produce. A Holm failure here is a statement about the split, not about the ordering."
									: null,
							},
							holm: survivor(`arm-b-threshold-${direction}`, holm),
							sensitivityThreshold: armBSensitivityLadders[direction].fit.threshold,
						},
					]
				}),
			),
			ratios: {
				predictionOnTheRecord: "§5.3 — if the study's pooled shape-(d) weights are right, the ratios are ≈4.2 (lightness/chroma) and ≈3.8 (lightness/hue)",
				lightnessOverChroma: armBRatios.lightnessOverChroma && {
					pointEstimate: armBRatios.lightnessOverChroma.interval.ok ? armBRatios.lightnessOverChroma.interval.pointEstimate : null,
					interval: armBRatios.lightnessOverChroma.interval,
					pValueAgainstOne: armBRatios.lightnessOverChroma.pValue,
					holm: survivor("arm-b-ratio-lightness-over-chroma", holm),
				},
				lightnessOverHue: armBRatios.lightnessOverHue && {
					pointEstimate: armBRatios.lightnessOverHue.interval.ok ? armBRatios.lightnessOverHue.interval.pointEstimate : null,
					interval: armBRatios.lightnessOverHue.interval,
					pValueAgainstOne: armBRatios.lightnessOverHue.pValue,
					holm: survivor("arm-b-ratio-lightness-over-hue", holm),
				},
			},
			amendsLedgerRow: "B9 — from 'unmeasured' to 'measured, unencoded'",
		},
		armC: {
			preregSection: "§5.4",
			wordingNote:
				"prereg §2.2 — arm C's answers are comparable with accent-real-1's under the clarification that governed both, but the two rounds' served strings are NOT byte-identical, and this note travels in the same sentence as any number compared against accent-real-1.",
			accentRealOneReference: { pooledThreshold: 0.1863, interval: [0.14052, 0.247], hueThird0: 0.13417, hueThird2: 0.26385, verdict: "stratum-dependent" },
			pooledIsoluminant: {
				n: armCPrimary.pooled.n,
				worksCount: armCPrimary.pooled.yesCount,
				threshold: armCPrimary.pooled.fit.threshold,
				confidenceInterval: armCPrimary.pooled.fit.confidenceInterval,
				separated: armCPrimary.pooled.fit.separated,
				note: armCPrimary.pooled.fit.note,
				identifiedWithinClaimDomain: armCPrimary.pooled.identifiedWithinClaimDomain,
				support: armCPrimary.pooled.guarded.support,
				discriminationTest: {
					method: "exact two-sided Mann-Whitney rank-sum",
					pValue: armCPrimary.pooled.pValue,
					smallestAchievablePValue: armCPrimary.pooled.smallestAchievablePValue,
				},
				holm: survivor("arm-c-pooled", holm),
			},
			perHueThird: armCPrimary.perThird.map((third) => ({
				hueThird: third.hueThird,
				n: third.n,
				worksCount: third.yesCount,
				threshold: third.identifiedWithinClaimDomain ? third.fit.threshold : null,
				identifiedWithinClaimDomain: third.identifiedWithinClaimDomain,
				rawFittedThreshold: third.fit.threshold,
				confidenceInterval: third.identifiedWithinClaimDomain ? third.fit.confidenceInterval : null,
				rawConfidenceInterval: third.fit.confidenceInterval,
				separated: third.fit.separated,
				note: third.identifiedWithinClaimDomain
					? third.fit.note
					: `no crossing anywhere in the claim domain [${ACCENT_CLAIM_DOMAIN.min}, ${ACCENT_CLAIM_DOMAIN.max}]: the unconstrained fit runs to ${third.fit.threshold?.toFixed(1)} with an interval spanning many orders of magnitude, which is this stratum reporting no relation between distance and the answer rather than reporting a large threshold`,
				support: third.guarded.support,
				extrapolatedBeyondSample: third.guarded.extrapolatedBeyondSample,
				discriminationTest: {
					method: "exact two-sided Mann-Whitney rank-sum",
					pValue: third.pValue,
					smallestAchievablePValue: third.smallestAchievablePValue,
				},
				holm: survivor(`arm-c-hue-third-${third.hueThird}`, holm),
			})),
			refusalCondition: {
				rule: "§5.4 — if any stratum fit falls outside the pooled 95% interval, adoption is refused and the verdict is stratum-dependent, exactly as accent-real-1 refused",
				pooledInterval: armCPrimary.pooledInterval,
				strata: armCPrimary.strataVersusPooled,
				refused: armCPrimary.refused,
				verdict: armCPrimary.verdict,
				sensitivityVerdict: armCSensitivity.verdict,
			},
			nonIsoluminantStratum: {
				neverPooledWithTheAbove: true,
				firstObservationsEverOnTheLightnessAxis: "prereg §3.3",
				n: armCPrimary.nonIsoluminant.n,
				worksCount: armCPrimary.nonIsoluminant.yesCount,
				threshold: armCPrimary.nonIsoluminant.fit.threshold,
				confidenceInterval: armCPrimary.nonIsoluminant.fit.confidenceInterval,
				note: armCPrimary.nonIsoluminant.fit.note,
				support: armCPrimary.nonIsoluminant.guarded.support,
				lightnessAxisContrast,
			},
			jointWeightChroma: {
				declaredExploratoryInAdvance:
					"§5.4 — under-identified at n = 60 with the strata this unbalanced, declared exploratory before the round ran; it may produce a directional read and it may not produce anything",
				...wcPrimary,
				holm: survivor("arm-c-joint-wc", holm),
			},
			jointWeightChromaSensitivity: { chromaOnlyReading: wcChromaOnly, laterAnswerSubstitution: wcSensitivity },
		},
		multiplicity: {
			preregSection: "§5.6",
			familySize: FAMILY_SIZE,
			fixedBeforeAnswersWereRead: true,
			holm,
			sensitivityHolm: { survivorCount: holmSensitivity.survivorCount, cells: holmSensitivity.cells },
		},
		noCrossCriterionPooling:
			"§5.5 — identity and function are fitted separately end to end. Nothing in this file pools them, and the study's observation that ICtCp is the best space for identity and the worst for function is why.",
		outOfScope: {
			excursionBar:
				"§7.1 — this round selects the METRIC, not the 2.5x excursion multiplier. No item in it varies excursion magnitude and no answer it collects could. If arm A moves the metric, the excursion bar's magnitude becomes MORE open, not less.",
			regionBoundaryLocations: "§7 — not tested",
			foregroundToAccentBar: "§7 — B31 is not in this round; every constructed accent stays ≥ 0.07444 from its palette's foreground",
			oneReviewer: "§7 — one reviewer, whose own measured repeatability is 83.3% at best. No model can beat the observer's own repeatability.",
		},
	}

	await writeFile(values.out!, `${JSON.stringify(analysis, null, "\t")}\n`, "utf8")

	// A terse console summary. The JSON is the artifact; this is for the person who ran it.
	const line = (label: string, value: string): void => console.log(`  ${label.padEnd(42)} ${value}`)
	console.log(`\nperception-4 — ${answered}/${truth.items.length} answered${complete ? "" : " (INCOMPLETE)"}`)
	console.log("\ngates")
	line("attention checks (all 6 or void)", attentionChecksPassed ? "PASS 6/6" : "FAIL — ROUND VOID")
	line("identity repeat consistency", `${identityConsistent}/${identityRepeats.length} vs round 3's 83.3% (thin n)`)
	line("accent repeat consistency", `${accentConsistent}/${accentRepeats.length}`)
	line("max escape share over arms", `${(Math.max(...Object.values(escapeShare).map((g) => g.share)) * 100).toFixed(1)}%`)
	line("degenerate ladders", DIRECTIONS.filter((d) => armBPrimary[d].degenerate).join(", ") || "none")
	line("verdicts unstable under substitution", unstableVerdicts.length === 0 ? "none" : unstableVerdicts.map((p) => p.id).join(", "))
	console.log("\narm A")
	line("k' for ICtCp-global", `${armAPrimary.successesForIctcp}/${armAPrimary.trials} (${((armAPrimary.accuracyIctcpGlobal ?? 0) * 100).toFixed(1)}%)`)
	line("exact binomial p", formatP(armAPrimary.pValue))
	line("decisive at the arm's own threshold", `${armAPrimary.decisiveAtArmLevel} (k' >= ${armACriticalValues.decisiveAtOrAbove} or <= ${armACriticalValues.decisiveAtOrBelow})`)
	line("survives Holm over 13", `${survivor("arm-a-binomial", holm).survivesCorrection} (adjusted ${formatP(survivor("arm-a-binomial", holm).adjustedPValue)})`)
	line("anisotropy veto", armAPrimary.veto.fires ? "FIRES — anisotropy-confounded" : "does not fire")
	console.log("\narm B (no adoption, declared under-powered)")
	for (const direction of DIRECTIONS) {
		const ladder = armBPrimary[direction]
		line(`${direction} threshold`, ladder.fit.threshold === null ? "not identified" : ladder.fit.threshold.toFixed(5))
	}
	for (const [name, ratio] of Object.entries(armBRatios)) {
		if (ratio && ratio.interval.ok) line(name, `${ratio.interval.pointEstimate.toFixed(2)} [${ratio.interval.low.toFixed(2)}, ${ratio.interval.high.toFixed(2)}]`)
	}
	console.log("\narm C")
	line("pooled isoluminant threshold", armCPrimary.pooled.fit.threshold === null ? "not identified" : armCPrimary.pooled.fit.threshold.toFixed(5))
	for (const third of armCPrimary.perThird) {
		line(
			`hue third ${third.hueThird}`,
			third.identifiedWithinClaimDomain ? third.fit.threshold!.toFixed(5) : "NOT IDENTIFIED inside [0.06, 0.30]",
		)
	}
	line("refusal condition", armCPrimary.verdict)
	line("w_C (exploratory)", `${wcPrimary.weightChroma.toFixed(4)} (p ${formatP(wcPrimary.pValue)})`)
	line("non-isoluminant works rate", `${lightnessAxisContrast.overall.nonIsoluminant.works}/${lightnessAxisContrast.overall.nonIsoluminant.n} vs isoluminant ${lightnessAxisContrast.overall.isoluminant.works}/${lightnessAxisContrast.overall.isoluminant.n}`)
	console.log(`\nHolm over ${FAMILY_SIZE}: ${holm.survivorCount} survivor(s)`)
	console.log(`\nwrote ${values.out}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main()
}
