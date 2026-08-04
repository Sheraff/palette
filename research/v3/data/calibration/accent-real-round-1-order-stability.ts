/**
 * ADDENDUM to `analyze-accent-real-round-1.ts` — NOT pre-registered, and it cannot change the verdict.
 *
 * ## Why this file exists
 *
 * Mid-round the reviewer asked which of three readings of the question to judge under, and the
 * orchestrator answered in chat (the wording on screen was left unchanged, deliberately, because the
 * six anchors only measure the lab-versus-real gap if everything except the stimulus is held
 * constant — prereg §2). The round therefore carries a condition the pre-registration did not
 * anticipate: **some unknown prefix of the answers may predate the clarification.**
 *
 * The standing ruling is that timestamps mean nothing, so this file **never reads `ts`** for
 * ordering, splitting or inference. It uses two things that are not clocks:
 *
 * 1. **`fixture.serveOrder`** — the order the items were put in front of the reviewer.
 * 2. **The revision structure of the warehouse records** — how many `oracle-label` revisions each
 *    item accumulated, and whether the answer moved between the first revision and the last.
 *
 * ## What it computes, and what it deliberately does not
 *
 * Five re-fits with `fitLogistic` **unchanged** — the same estimator the primary fit uses, so the
 * numbers are comparable with 0.18630 rather than merely similar to it:
 *
 * - `pooledFinal` — the primary fit, recomputed here purely as a **reproduction check**. If this
 *   does not equal the analyzer's threshold, this file is wrong and nothing below it is worth
 *   reading.
 * - `firstHalfServed` / `secondHalfServed` — the 30 ladder items split at the median served
 *   position. This is the "early versus late" cut the disclosure asks for, done by served order and
 *   by nothing else.
 * - `revisedOnly` / `unrevisedOnly` — the ladder items that accumulated more than one revision
 *   against those that did not.
 * - `allFirstRevision` — a **counterfactual**: the fit as it would have stood on every item's
 *   *first* recorded answer, i.e. before any re-pass. This is the sharpest available handle on "how
 *   much did the re-answering move the number".
 *
 * It does **not** claim the revisions were caused by the clarification. The revision structure is
 * reported as a structural observation; the causal reading is the reviewer's to make or refuse.
 *
 * ## One difference from the analyzer's own answer resolution, checked rather than assumed
 *
 * The analyzer resolves competing labels through `collectAnswers` in `analyze-probe-gold.ts`, which
 * eliminates any record named by another record's `supersedes` pointer and breaks ties by **file
 * order** — it never reads the `revision` counter. This file orders by `revision`, because
 * `revision` is the thing that says "this is the second pass over that item" and the re-pass is
 * what the disclosure is about.
 *
 * The two rules were checked against each other across all 45 items and **agree on every one**
 * (18 `works` either way). `pooledFinal` below is the standing proof: it reproduces the analyzer's
 * 0.18630 exactly. If it ever stops doing so, the two rules have diverged and this file is the one
 * that is wrong.
 *
 * A related fact worth disclosing rather than leaving to be discovered: the *other* collector the
 * analyzer imports — `analyze-bracketing.ts`'s, used only for round 1's lab-side anchor answers —
 * **does** order by `ts`. That is a timestamp read inside the pre-registered path. It touches only
 * the six anchors' round-1 answers, not this round's ordering, and nothing here depends on it.
 *
 * Run it AFTER the analyzer (it reads and then rewrites the analysis JSON, adding one key):
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/data/calibration/accent-real-round-1-order-stability.ts
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { type LogisticFit, type Observation, fitLogistic } from "../../src/review-server/analyze-bracketing.ts"
import type { OracleValidationFixture } from "../../src/review-server/oracle-validation.ts"
import {
	ACCENT_REAL_FIXTURE_PATH,
	ACCENT_REAL_TRUTH_PATH,
	type AccentRealTruthItem,
} from "../../src/review-server/accent-real.ts"

const LABEL_SCHEMA = "accent-real.v1"

type WarehouseLabel = Readonly<{
	type: string
	labelSchemaVersion?: string
	questionKey?: string
	imageId?: string | null
	answer?: string
	revision?: number
}>

function round5(value: number | null): number | null {
	return value === null ? null : Number(value.toFixed(5))
}

/** The three numbers a report prints from a fit, and nothing else. */
function summarise(label: string, fit: LogisticFit) {
	return {
		cut: label,
		n: fit.n,
		yesCount: fit.yesCount,
		threshold: round5(fit.threshold),
		confidenceInterval:
			fit.confidenceInterval === null
				? null
				: { low: round5(fit.confidenceInterval.low), high: round5(fit.confidenceInterval.high) },
		separated: fit.separated,
		separationInterval:
			fit.separationInterval === null
				? null
				: { low: round5(fit.separationInterval.low), high: round5(fit.separationInterval.high) },
		converged: fit.converged,
		note: fit.note,
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string", default: fileURLToPath(new URL("../warehouse/warehouse.jsonl", import.meta.url)) },
			analysis: { type: "string" },
			quiet: { type: "boolean", default: false },
		},
	})
	const analysisPath = values.analysis ?? fileURLToPath(new URL("./accent-real-round-1-analysis.json", import.meta.url))

	const fixture = JSON.parse(await readFile(ACCENT_REAL_FIXTURE_PATH, "utf8")) as OracleValidationFixture
	const truth = JSON.parse(await readFile(ACCENT_REAL_TRUTH_PATH, "utf8")) as {
		items: readonly AccentRealTruthItem[]
	}

	// Every label for this round, grouped by the key an oracle-label actually carries.
	const byKey = new Map<string, WarehouseLabel[]>()
	for (const line of (await readFile(values.warehouse, "utf8")).split("\n")) {
		if (line.trim() === "") continue
		const record = JSON.parse(line) as WarehouseLabel
		if (record.type !== "oracle-label" || record.labelSchemaVersion !== LABEL_SCHEMA) continue
		const key = `${record.questionKey} ${record.imageId}`
		const bucket = byKey.get(key)
		if (bucket === undefined) byKey.set(key, [record])
		else bucket.push(record)
	}

	const servedAt = new Map(fixture.serveOrder.map((itemId, index) => [itemId, index]))
	const fixtureById = new Map(fixture.items.map((item) => [item.itemId, item]))

	type Row = {
		itemId: string
		role: string
		servedAt: number
		distance: number
		revisions: number
		firstAnswer: string
		finalAnswer: string
		answerMoved: boolean
	}

	const rows: Row[] = []
	for (const item of truth.items) {
		const fixtureRow = fixtureById.get(item.itemId)
		if (fixtureRow === undefined) continue
		const labels = (byKey.get(`${fixtureRow.questionKey} ${fixtureRow.imageId}`) ?? [])
			// Ordered by the record's own `revision` counter, never by `ts` — timestamps mean nothing.
			.slice()
			.sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0))
		if (labels.length === 0) continue
		const first = labels[0]!.answer ?? ""
		const final = labels[labels.length - 1]!.answer ?? ""
		rows.push({
			itemId: item.itemId,
			role: item.role,
			servedAt: servedAt.get(item.itemId) ?? -1,
			distance: item.governing.okLabDistance,
			revisions: labels.length,
			firstAnswer: first,
			finalAnswer: final,
			answerMoved: first !== final,
		})
	}
	rows.sort((a, b) => a.servedAt - b.servedAt)

	const ladder = rows.filter((row) => row.role === "ladder")
	// `cant_tell` is excluded from every fit here exactly as §6.2 excludes it from the primary fit.
	const decided = (subset: readonly Row[], which: "firstAnswer" | "finalAnswer"): Observation[] =>
		subset
			.filter((row) => row[which] === "works" || row[which] === "does_not_work")
			.map((row) => ({ itemId: row.itemId, distance: row.distance, yes: row[which] === "works" }))

	const byServed = [...ladder].sort((a, b) => a.servedAt - b.servedAt)
	const half = Math.floor(byServed.length / 2)
	const firstHalf = byServed.slice(0, half)
	const secondHalf = byServed.slice(half)
	const revised = ladder.filter((row) => row.revisions > 1)
	const unrevised = ladder.filter((row) => row.revisions === 1)

	const fits = [
		summarise("pooledFinal (reproduction check of the primary fit)", fitLogistic(decided(ladder, "finalAnswer"), "increasing")),
		summarise(
			`firstHalfServed (served positions ${firstHalf[0]?.servedAt}..${firstHalf[firstHalf.length - 1]?.servedAt})`,
			fitLogistic(decided(firstHalf, "finalAnswer"), "increasing"),
		),
		summarise(
			`secondHalfServed (served positions ${secondHalf[0]?.servedAt}..${secondHalf[secondHalf.length - 1]?.servedAt})`,
			fitLogistic(decided(secondHalf, "finalAnswer"), "increasing"),
		),
		summarise("revisedOnly (ladder items with more than one recorded revision)", fitLogistic(decided(revised, "finalAnswer"), "increasing")),
		summarise("unrevisedOnly (ladder items with exactly one recorded revision)", fitLogistic(decided(unrevised, "finalAnswer"), "increasing")),
		summarise(
			"allFirstRevision (COUNTERFACTUAL: every item's first recorded answer, before any re-pass)",
			fitLogistic(decided(ladder, "firstAnswer"), "increasing"),
		),
	]

	const revisionsByServedPosition = rows.map((row) => ({
		servedAt: row.servedAt,
		itemId: row.itemId,
		role: row.role,
		revisions: row.revisions,
		firstAnswer: row.firstAnswer,
		finalAnswer: row.finalAnswer,
		answerMoved: row.answerMoved,
	}))

	const revisedPositions = rows.filter((row) => row.revisions > 1).map((row) => row.servedAt)
	const unrevisedPositions = rows.filter((row) => row.revisions === 1).map((row) => row.servedAt)

	const addendum = {
		what: "ADDENDUM — round-conditions disclosure and order stability. NOT pre-registered; cannot change the verdict.",
		addedOn: "2026-08-04",
		addedBy: "research/v3/data/calibration/accent-real-round-1-order-stability.ts",
		roundConditions: {
			whatHappened:
				"Mid-round the reviewer asked which of three readings of the question to judge under. The " +
				"orchestrator clarified in chat; the wording ON SCREEN was left unchanged, deliberately, to " +
				"preserve anchor comparability (prereg §2).",
			clarificationAsGiven: [
				"Judge ONLY whether the accent does its visual job against its field — the eye lands on the accented elements without hunting.",
				"Aesthetic fit to the artwork is EXPLICITLY EXCLUDED — yes even if the colour looks wrong for the artwork.",
				"The accent's relation to the FOREGROUND is EXCLUDED — that is a separate rule.",
			],
			caveat:
				"Some unknown prefix of the answers may predate the clarification. Answer ordering versus the " +
				"question's timestamp is NOT available: timestamps mean nothing under the standing ruling, and " +
				"this file reads none.",
			howStabilityWasCheckedInstead:
				"By fixture.serveOrder and by the revision structure of the warehouse records. No clock is read anywhere.",
		},
		revisionStructure: {
			what:
				"How many oracle-label revisions each item accumulated, by served position. Reported as a " +
				"structural observation. NO CAUSAL CLAIM is made that the re-pass was caused by the clarification.",
			totalLabelRecords: [...byKey.values()].reduce((sum, bucket) => sum + bucket.length, 0),
			distinctItems: rows.length,
			itemsRevised: revisedPositions.length,
			itemsNotRevised: unrevisedPositions.length,
			revisedServedPositionRange:
				revisedPositions.length === 0
					? null
					: { min: Math.min(...revisedPositions), max: Math.max(...revisedPositions) },
			unrevisedServedPositionRange:
				unrevisedPositions.length === 0
					? null
					: { min: Math.min(...unrevisedPositions), max: Math.max(...unrevisedPositions) },
			itemsWhoseAnswerMoved: rows.filter((row) => row.answerMoved).map((row) => row.itemId),
			byServedPosition: revisionsByServedPosition,
		},
		orderStabilityFits: {
			what: "fitLogistic UNCHANGED, direction increasing, on the governing-pair achieved distance — the same estimator as the primary fit.",
			cannotChangeTheVerdict: true,
			fits,
		},
	}

	/**
	 * The `fundedBy` the proposed decision record cites: every label this round stands on, plus the
	 * `batch-complete` that closed it. Enumerated from the warehouse rather than typed, so the list
	 * cannot drift from the records it names.
	 */
	const labelIds: string[] = []
	let batchCompleteId: string | null = null
	for (const line of (await readFile(values.warehouse, "utf8")).split("\n")) {
		if (line.trim() === "") continue
		const record = JSON.parse(line) as WarehouseLabel & { id?: string; batchId?: string }
		if (record.type === "oracle-label" && record.labelSchemaVersion === LABEL_SCHEMA && record.id) {
			labelIds.push(record.id)
		}
		if (record.type === "batch-complete" && record.batchId === "accent-real-1" && record.id) {
			batchCompleteId = record.id
		}
	}

	const proposedDecisionRecord = {
		status: "PROPOSED — not written into PHASE_0_DECISIONS.md. Accepting, amending or refusing it is the reviewer's act.",
		id: "d-2026-08-04-accent-real-1-refused-its-fit-on-stratum-dependence",
		prose: "research/v3/data/calibration/accent-real-round-1-preregistration.md §8.10",
		verdict: "stratum-dependent — refused under the round's own pre-registered §6.4 condition 3",
		constantUnchanged: {
			name: "ACCENT_FUNCTIONAL_DISTANCE",
			staysAt: 0.14591,
			staysTagged: "[UNCALIBRATED]",
			refusedValue: 0.1863,
			diffProposedForAdoption: false,
			note: "§8.9 records the diff the refused value would have taken. It must not be applied.",
		},
		fundedBy: {
			oracleLabels: labelIds,
			oracleLabelCount: labelIds.length,
			labelSchemaVersion: LABEL_SCHEMA,
			batchComplete: batchCompleteId,
		},
	}

	/**
	 * §8.8 — the consequence for the two-tier accent semantics, in numbers, so the JSON does not have
	 * to be read alongside the prose to carry the round's most consequential result.
	 */
	const twoTierConsequence = {
		what: "Consequence for the reviewer-mandated two-tier accent semantics (2026-08-04). Prose: preregistration §8.8.",
		tier1detection: {
			question: "can you see the difference",
			constant: "ACCENT_VISIBILITY_COLOR_DISTANCE (aliased FOREGROUND_ACCENT_SEPARATION_DISTANCE)",
			value: 0.07444,
			status: "[REVIEWED] as a number; retired from the accent escape, on loan to foreground-accent (loose end B31)",
		},
		tier2functional: {
			question: "does this work as an accent at a glance",
			constant: "ACCENT_FUNCTIONAL_DISTANCE",
			value: 0.14591,
			status: "[UNCALIBRATED] — unchanged by this round",
			bindsAt: "invariant 4, the accent's one escape from its APCA epsilon floor; escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE, evaluated per pair",
		},
		criterionGap: {
			what: "functionalThreshold - 0.07444, the quantity accent-functional-1 pre-registered as the two-tier semantics' own existential test",
			syntheticRound: { threshold: 0.04554, gap: -0.0289, gapIsPositive: false, clauseFired: true },
			realRound: { threshold: 0.1863, gap: 0.11186, gapIsPositive: true, excludes07444AtNinetyFive: true, ratio: 2.5027 },
			reading:
				"accent-functional-1 fired the clause that puts the two-tier semantics back on the table. " +
				"On real stimuli the gap is positive and the 95% interval [0.14052, 0.24700] excludes 0.07444 " +
				"outright, so this round takes it back off. THE SCHEME IS SUPPORTED EVEN THOUGH THE NUMBER IS REFUSED.",
		},
		whatTheRefusalCosts: {
			governingRoleAgrees: true,
			governingRoleNote:
				"surface 0.17856 and background 0.19426 both inside the pooled interval — tier 2 does NOT need to split by field role, and §5's surface-role rival is answered against.",
			openQuestionChangedShape:
				"from 'what is the number' to 'is it a number': band:mid and hue-third:0 want ~0.134, hue-third:2 wants ~0.264. If replicated, tier 2 is a function of the pair rather than a scalar, and escapeDenied changes shape rather than digits. Ten items per cell cannot settle it.",
		},
		adoptionCostIfEverAdopted: {
			note: "NOT a proposal. Recorded because a two-line constants diff is not what adoption costs here.",
			breaksAtAnyValueAtOrAbove: 0.15362,
			items: [
				"tests/contract-invariants.test.ts:701 asserts colorDistance(foreground, background) > ACCENT_FUNCTIONAL_DISTANCE * 2; measured 0.30724 vs 0.1863*2 = 0.3726 — hard failure",
				"tier-2 straddle fixtures accentFunctionalJustUnder/OverDistance (0.14511 / 0.14672) both fall below 0.1863, collapsing the bracket at tests/contract-invariants.test.ts:1066-1090; re-pinning needs the 16.7M-colour search",
				"every '1.96x' claim becomes 2.50x across constants.ts, invariants.ts, PHASE_0_DECISIONS.md, PHASE_0_LOOSE_ENDS.md, endorsement-recheck.ts, fixtures.ts",
				"the band of condemned reviewer-endorsed palettes widens monotonically by an amount this round did not measure",
			],
			ceilingFlag:
				"this round's refusal 2 uses 0.30244; round 1's used 0.24181 (the top rung the reviewer endorsed and never retracted). The upper end of this round's CI, 0.24700, sits just above round 1's ceiling. Nothing tripped, but the two ceilings should be reconciled.",
		},
	}

	const analysis = JSON.parse(await readFile(analysisPath, "utf8")) as Record<string, unknown>
	analysis.roundConditionsAddendum = addendum
	analysis.twoTierConsequence = twoTierConsequence
	analysis.proposedDecisionRecord = proposedDecisionRecord
	await writeFile(analysisPath, `${JSON.stringify(analysis, null, "\t")}\n`, "utf8")

	if (!values.quiet) {
		for (const fit of fits) {
			console.log(
				`${fit.cut}\n  n=${fit.n} yes=${fit.yesCount} threshold=${fit.threshold}` +
					`${fit.separated ? " (SEPARATED)" : ""} ci=${fit.confidenceInterval === null ? "none" : `${fit.confidenceInterval.low}..${fit.confidenceInterval.high}`}`,
			)
		}
		console.log(
			`revised ${revisedPositions.length}/${rows.length} items; revised served positions ` +
				`${Math.min(...revisedPositions)}..${Math.max(...revisedPositions)}; unrevised ` +
				`${Math.min(...unrevisedPositions)}..${Math.max(...unrevisedPositions)}`,
		)
		console.log(`merged roundConditionsAddendum into ${analysisPath}`)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
