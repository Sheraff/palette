/**
 * Bracketing round 3 — the straddle rule, scored.
 *
 * Applies the pre-registered scoring rule of
 * `research/v3/data/calibration/bracketing-round-3-preregistration.md` §6 (also embedded, verbatim
 * in substance, in the fixture's unserved `straddleDesign.scoring` block) to the released answers.
 * Nothing here is a choice: the population, the statistic, the thresholds, the veto, the gates and
 * the sensitivity re-run were all fixed on 2026-08-03, before the fixture generator existed.
 *
 * Answers come from the warehouse through the repository's existing collector
 * (`analyze-bracketing.ts` `collectAnswers`), so retraction and supersession are handled the same
 * way every other round handles them: per (batch, item, question), the latest non-retracted record
 * is the reviewer's position and earlier saves are undo, not extra evidence. The exploratory
 * logistic fit reuses the same `fitLogistic` the earlier rounds used.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/data/calibration/analyze-bracketing-round-3.ts [--warehouse <path>] [--out <path>]
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../../src/warehouse/cli.ts"
import { readAll } from "../../src/warehouse/warehouse.ts"
import {
	collectAnswers,
	fitLogistic,
	repeatConsistency,
	type BracketingAnswer,
	type Observation,
} from "../../src/review-server/analyze-bracketing.ts"

const FIXTURE_PATH = fileURLToPath(new URL("./bracketing-round-3.json", import.meta.url))
const OUT_PATH = fileURLToPath(new URL("./bracketing-round-3-analysis.json", import.meta.url))
const PREREGISTRATION_PATH = "research/v3/data/calibration/bracketing-round-3-preregistration.md"

/* --------------------------------------------------------------------------------------------- */
/* Statistics — exact binomial against p = 0.5, and the Wilson interval                            */
/* --------------------------------------------------------------------------------------------- */

/** log n! by lgamma, so n = 42 never overflows and the tails stay accurate. */
function logFactorial(n: number): number {
	let acc = 0
	for (let i = 2; i <= n; i++) acc += Math.log(i)
	return acc
}

function binomialPmf(k: number, n: number, p: number): number {
	const logC = logFactorial(n) - logFactorial(k) - logFactorial(n - k)
	return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/**
 * Two-sided exact binomial test against p = 0.5. Under the null the distribution is symmetric, so
 * the "sum of outcomes no more likely than the observed one" definition coincides exactly with
 * doubling the smaller tail (capped at 1).
 */
function exactBinomialTwoSided(k: number, n: number): number {
	if (n === 0) return 1
	let tail = 0
	if (k * 2 <= n) for (let i = 0; i <= k; i++) tail += binomialPmf(i, n, 0.5)
	else for (let i = k; i <= n; i++) tail += binomialPmf(i, n, 0.5)
	return Math.min(1, 2 * tail)
}

/** 95% Wilson score interval for k/n. */
function wilson(k: number, n: number): { low: number; high: number } | null {
	if (n === 0) return null
	const z = 1.959963984540054
	const phat = k / n
	const denom = 1 + (z * z) / n
	const centre = (phat + (z * z) / (2 * n)) / denom
	const half = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denom
	return { low: centre - half, high: centre + half }
}

/**
 * The decisive cuts at a realized `n`: the smallest k whose two-sided exact p is below 0.05 and
 * whose Wilson interval excludes 0.5 (both criteria, as pre-registered), and its mirror below.
 */
function decisiveCuts(n: number): { favoursMax: number | null; favoursAverage: number | null } {
	let favoursMax: number | null = null
	for (let k = Math.ceil(n / 2); k <= n; k++) {
		const interval = wilson(k, n)
		if (exactBinomialTwoSided(k, n) < 0.05 && interval !== null && interval.low > 0.5) {
			favoursMax = k
			break
		}
	}
	let favoursAverage: number | null = null
	for (let k = Math.floor(n / 2); k >= 0; k--) {
		const interval = wilson(k, n)
		if (exactBinomialTwoSided(k, n) < 0.05 && interval !== null && interval.high < 0.5) {
			favoursAverage = k
			break
		}
	}
	return { favoursMax, favoursAverage }
}

type Verdict = "max" | "average" | "unresolved" | "anisotropy-confounded" | "not-interpretable" | "void"

function verdictFor(k: number, n: number): { verdict: "max" | "average" | "unresolved"; cuts: ReturnType<typeof decisiveCuts> } {
	const cuts = decisiveCuts(n)
	if (cuts.favoursMax !== null && k >= cuts.favoursMax) return { verdict: "max", cuts }
	if (cuts.favoursAverage !== null && k <= cuts.favoursAverage) return { verdict: "average", cuts }
	return { verdict: "unresolved", cuts }
}

/* --------------------------------------------------------------------------------------------- */
/* Main                                                                                            */
/* --------------------------------------------------------------------------------------------- */

type Item = {
	itemId: string
	role: string
	part: string
	repeatOf: string | null
	direction: string | null
	hueThird: number | null
	firstHex: string
	secondHex: string
	truth: { okLabDistance: number; identical: boolean }
	decomposition: { dominant: string; purity: number } | null
	straddle: {
		regionFirst: string
		regionSecond: string
		avgBar: number
		maxBar: number
		bandFraction: number
		zone: string
		discriminating: boolean
	}
}

function rate(k: number, n: number): number | null {
	return n === 0 ? null : k / n
}

function round(value: number | null | undefined, places = 6): number | null {
	if (value === null || value === undefined || !Number.isFinite(value)) return null
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

const { values } = parseArgs({
	options: {
		warehouse: { type: "string", default: DEFAULT_WAREHOUSE_PATH },
		fixture: { type: "string", default: FIXTURE_PATH },
		out: { type: "string", default: OUT_PATH },
	},
})

const fixture = JSON.parse(await readFile(values.fixture!, "utf8"))
const items: Item[] = fixture.items
const records = await readAll(values.warehouse!)
const { byItemId: answers, skipped } = collectAnswers(records, fixture)

const answerOf = (itemId: string): BracketingAnswer | undefined => answers.get(itemId)
const said = (itemId: string): boolean | null => answerOf(itemId)?.answer ?? null

/* --- Validity gates, computed before the primary count is looked at -------------------------- */

const identicalChecks = items
	.filter((item) => item.role === "control-identical")
	.map((item) => ({ itemId: item.itemId, answered: said(item.itemId) !== null, answer: said(item.itemId), passed: said(item.itemId) === true }))
const obviousChecks = items
	.filter((item) => item.role === "control-obvious")
	.map((item) => ({
		itemId: item.itemId,
		distance: round(item.truth.okLabDistance, 5),
		answered: said(item.itemId) !== null,
		answer: said(item.itemId),
		passed: said(item.itemId) === false,
	}))
const attentionPassed = [...identicalChecks, ...obviousChecks].every((check) => check.passed)

const belowBand = items
	.filter((item) => item.role === "ladder" && item.straddle.zone === "below-avg")
	.map((item) => ({ itemId: item.itemId, distance: round(item.truth.okLabDistance, 5), bandFraction: round(item.straddle.bandFraction, 3), direction: item.direction, answer: said(item.itemId), expected: true }))
const aboveBand = items
	.filter((item) => item.role === "ladder" && item.straddle.zone === "above-max")
	.map((item) => ({ itemId: item.itemId, distance: round(item.truth.okLabDistance, 5), bandFraction: round(item.straddle.bandFraction, 3), direction: item.direction, answer: said(item.itemId), expected: false }))
// Diagnostic, not gating: only *both* going the wrong way makes the bands un-interpretable.
const belowBandBroken = belowBand.length > 0 && belowBand.every((control) => control.answer === false)
const aboveBandBroken = aboveBand.length > 0 && aboveBand.every((control) => control.answer === true)
const bandsInterpretable = !(belowBandBroken || aboveBandBroken)

/* --- Primary population: the 42 in-band ladder items, first showing, counted once ------------- */

const inBand = items.filter((item) => item.role === "ladder" && item.straddle.zone === "in-band")
const answeredInBand = inBand.filter((item) => said(item.itemId) !== null)
const n = answeredInBand.length
const k = answeredInBand.filter((item) => said(item.itemId) === true).length

const primaryP = exactBinomialTwoSided(k, n)
const primaryWilson = wilson(k, n)
const primary = verdictFor(k, n)

/* --- Anisotropy veto -------------------------------------------------------------------------- */

function subgroup(direction: string) {
	const group = inBand.filter((item) => item.direction === direction)
	const answered = group.filter((item) => said(item.itemId) !== null)
	const gk = answered.filter((item) => said(item.itemId) === true).length
	const gn = answered.length
	return {
		direction,
		designed: group.length,
		n: gn,
		k: gk,
		sameRate: round(rate(gk, gn), 4),
		exactBinomialP: round(exactBinomialTwoSided(gk, gn), 6),
		wilson95: (() => {
			const interval = wilson(gk, gn)
			return interval === null ? null : { low: round(interval.low, 4), high: round(interval.high, 4) }
		})(),
		decisive: exactBinomialTwoSided(gk, gn) < 0.05,
		favours: gn === 0 ? null : gk / gn > 0.5 ? "max" : gk / gn < 0.5 ? "average" : "neither",
	}
}

const lightnessGroup = subgroup("lightness")
const chromaGroup = subgroup("chroma")
const oppositeSides =
	lightnessGroup.n > 0 &&
	chromaGroup.n > 0 &&
	((lightnessGroup.k / lightnessGroup.n > 0.5 && chromaGroup.k / chromaGroup.n < 0.5) ||
		(lightnessGroup.k / lightnessGroup.n < 0.5 && chromaGroup.k / chromaGroup.n > 0.5))
const anisotropyTriggered = oppositeSides && (lightnessGroup.decisive || chromaGroup.decisive)

/* --- Repeats: consistency, and the sensitivity re-run ----------------------------------------- */

const consistency = repeatConsistency(items as never, answers)
const repeatDetail = items
	.filter((item) => item.role === "repeat")
	.map((item) => ({
		itemId: item.itemId,
		repeatOf: item.repeatOf,
		firstShowing: item.repeatOf === null ? null : said(item.repeatOf),
		laterShowing: said(item.itemId),
		agreed: item.repeatOf === null ? null : said(item.repeatOf) === said(item.itemId),
	}))

// Sensitivity: substitute each repeated item's *later* answer for its first, then re-score.
const substituted = new Map<string, boolean>()
for (const detail of repeatDetail) {
	if (detail.repeatOf !== null && detail.laterShowing !== null) substituted.set(detail.repeatOf, detail.laterShowing)
}
const sensitivityAnswered = inBand.filter((item) => substituted.has(item.itemId) || said(item.itemId) !== null)
const sensitivityN = sensitivityAnswered.length
const sensitivityK = sensitivityAnswered.filter((item) => substituted.get(item.itemId) ?? said(item.itemId) === true).length
const sensitivity = verdictFor(sensitivityK, sensitivityN)
const sensitivityAgrees = sensitivity.verdict === primary.verdict

/* --- Breakdowns, reported regardless ---------------------------------------------------------- */

function breakdown<T extends string | number>(keyOf: (item: Item) => T | null, pool: Item[] = inBand) {
	const buckets = new Map<T, Item[]>()
	for (const item of pool) {
		const key = keyOf(item)
		if (key === null) continue
		const bucket = buckets.get(key)
		if (bucket === undefined) buckets.set(key, [item])
		else bucket.push(item)
	}
	return [...buckets.entries()]
		.sort((a, b) => String(a[0]).localeCompare(String(b[0]), "en", { numeric: true }))
		.map(([key, bucket]) => {
			const answered = bucket.filter((item) => said(item.itemId) !== null)
			const bk = answered.filter((item) => said(item.itemId) === true).length
			return { key, n: answered.length, k: bk, sameRate: round(rate(bk, answered.length), 4) }
		})
}

const byRegionPair = breakdown((item) => [item.straddle.regionFirst, item.straddle.regionSecond].sort().join(" x "))
const byBandFraction = breakdown((item) => round(item.straddle.bandFraction, 1)!)
const byHueThird = breakdown(
	(item) => (item.hueThird === null || item.hueThird === undefined ? null : item.hueThird),
	inBand.filter((item) => item.straddle.regionFirst === "light-saturated" || item.straddle.regionSecond === "light-saturated"),
)
const byDirectionAndBandFraction = ["lightness", "chroma"].map((direction) => ({
	direction,
	cells: breakdown((item) => round(item.straddle.bandFraction, 1)!, inBand.filter((item) => item.direction === direction)),
}))

/* --- Exploratory only: logistic fit over the 46 ladder items ---------------------------------- */

const ladderObservations: Observation[] = items
	.filter((item) => item.role === "ladder")
	.flatMap((item) => {
		const answer = said(item.itemId)
		return answer === null ? [] : [{ itemId: item.itemId, distance: item.truth.okLabDistance, yes: answer }]
	})
const exploratoryFit = fitLogistic(ladderObservations, "decreasing")
const pooledAvg = inBand.reduce((sum, item) => sum + item.straddle.avgBar, 0) / inBand.length
const pooledMax = inBand.reduce((sum, item) => sum + item.straddle.maxBar, 0) / inBand.length
const crossingInsideBand =
	exploratoryFit.threshold !== null && exploratoryFit.threshold > pooledAvg && exploratoryFit.threshold < pooledMax
const crossingIntervalExcludesBoth =
	exploratoryFit.confidenceInterval !== null &&
	exploratoryFit.confidenceInterval.low > pooledAvg &&
	exploratoryFit.confidenceInterval.high < pooledMax

/* --- The verdict, in the pre-registered order -------------------------------------------------- */

let verdict: Verdict
let verdictReason: string
if (!attentionPassed) {
	verdict = "void"
	verdictReason = "An attention check failed. §6 validity gate (i) voids the round."
} else if (!bandsInterpretable) {
	verdict = "not-interpretable"
	verdictReason =
		"The band controls came back on the wrong side, so the bands are not where rounds 1-2 put them and the band arithmetic carries no meaning."
} else if (anisotropyTriggered) {
	verdict = "anisotropy-confounded"
	verdictReason =
		`The lightness-dominant and chroma-dominant subgroups fall on opposite sides of 0.5 (${lightnessGroup.k}/${lightnessGroup.n} vs ${chromaGroup.k}/${chromaGroup.n}) and at least one is individually decisive. The straddle bar depends on the direction of the difference, which neither candidate rule can express. The primary count is independently ${primary.verdict} (k = ${k} of n = ${n}, two-sided exact binomial p = ${primaryP.toFixed(4)}), so both roads lead to no rule change; the veto is what says why.`
} else if (!sensitivityAgrees) {
	verdict = "unresolved"
	verdictReason = `The primary run says "${primary.verdict}" but the sensitivity re-run (later repeat answers substituted) says "${sensitivity.verdict}". §6: on disagreement the round is unresolved whatever the primary count said.`
} else if (primary.verdict === "unresolved") {
	verdict = "unresolved"
	verdictReason = `k = ${k} of n = ${n} lies in the unresolved interval [${(primary.cuts.favoursAverage ?? 0) + 1}, ${(primary.cuts.favoursMax ?? n) - 1}]: two-sided exact binomial p = ${primaryP.toFixed(4)}, not below 0.05, and the 95% Wilson interval contains 0.5. This is not a tie, not weak support for either rule, and not a licence to keep Math.max on the strength of this round.`
} else {
	verdict = primary.verdict
	verdictReason = `k = ${k} of n = ${n} clears the pre-registered cut for "${primary.verdict}" (two-sided exact binomial p = ${primaryP.toFixed(4)}, Wilson interval excludes 0.5).`
}

const analysis = {
	schema: "bracketing-round-3-analysis/v1",
	batchId: fixture.batchId,
	analyzedAt: new Date().toISOString(),
	analyzer: "research/v3/data/calibration/analyze-bracketing-round-3.ts",
	fixture: "research/v3/data/calibration/bracketing-round-3.json",
	preregistration: PREREGISTRATION_PATH,
	warehouse: values.warehouse,
	criterion: fixture.criterion,
	question: fixture.straddleDesign.question,
	preRegisteredRule: fixture.straddleDesign.scoring,

	verdict,
	verdictReason,

	validityGates: {
		attentionChecks: {
			identical: identicalChecks,
			obvious: obviousChecks,
			passed: [...identicalChecks, ...obviousChecks].filter((check) => check.passed).length,
			total: identicalChecks.length + obviousChecks.length,
			passRate: round(rate([...identicalChecks, ...obviousChecks].filter((check) => check.passed).length, identicalChecks.length + obviousChecks.length), 4),
			gatePassed: attentionPassed,
		},
		bandControls: {
			belowBand,
			aboveBand,
			belowBandBroken,
			aboveBandBroken,
			bandsInterpretable,
			note: "Diagnostic, never scored. Both rules agree on these items; they only check that the bands sit where rounds 1-2 put them. Neither failure mode fired, so the bands stand. The single wrong-side answer is the chroma-dominant below-band control (purity 0.91) called distinct at 0.01660 — which is the anisotropy showing up in the controls too, not the bands being misplaced.",
		},
	},

	primary: {
		population: "role = ladder, straddle.zone = in-band, counted once at first showing",
		designedN: inBand.length,
		n,
		k,
		unanswered: inBand.length - n,
		sameRate: round(rate(k, n), 4),
		accuracyMax: round(rate(k, n), 4),
		accuracyAverage: round(n === 0 ? null : 1 - k / n, 4),
		exactBinomialP: round(primaryP, 6),
		wilson95: primaryWilson === null ? null : { low: round(primaryWilson.low, 4), high: round(primaryWilson.high, 4) },
		decisiveCutsAtRealizedN: primary.cuts,
		unresolvedInterval:
			primary.cuts.favoursAverage === null || primary.cuts.favoursMax === null
				? null
				: [primary.cuts.favoursAverage + 1, primary.cuts.favoursMax - 1],
		verdictFromPrimaryAlone: primary.verdict,
	},

	anisotropy: {
		lightnessDominant: lightnessGroup,
		chromaDominant: chromaGroup,
		oppositeSidesOfHalf: oppositeSides,
		atLeastOneDecisive: lightnessGroup.decisive || chromaGroup.decisive,
		vetoTriggered: anisotropyTriggered,
	},

	repeats: {
		designed: consistency.repeats,
		bothAnswered: consistency.bothAnswered,
		agreed: consistency.agreed,
		agreement: round(consistency.agreement, 4),
		roundsOneTwoBaseline: 0.625,
		pairs: repeatDetail,
		note: "Never scored in the primary analysis — repeats are not independent trials (contract.md finding 8).",
	},

	sensitivity: {
		description: "Each repeated item's later answer substituted for its first, then re-scored.",
		substituted: [...substituted.keys()].sort(),
		n: sensitivityN,
		k: sensitivityK,
		sameRate: round(rate(sensitivityK, sensitivityN), 4),
		exactBinomialP: round(exactBinomialTwoSided(sensitivityK, sensitivityN), 6),
		verdict: sensitivity.verdict,
		agreesWithPrimary: sensitivityAgrees,
	},

	breakdowns: {
		byRegionPair,
		byBandFraction,
		byHueThirdLightSaturatedOnly: byHueThird,
		byDirectionAndBandFraction,
		note: "Reported regardless, never a basis for the verdict. dark-saturated x light-neutral is six near-replicates at ~0.0160 by declaration in §2, not a gradient; no within-band trend is read from it.",
	},

	exploratory: {
		label: "EXPLORATORY — never the headline. 46 points over six different bands is badly under-powered.",
		n: exploratoryFit.n,
		yesCount: exploratoryFit.yesCount,
		threshold: round(exploratoryFit.threshold, 6),
		confidenceInterval:
			exploratoryFit.confidenceInterval === null
				? null
				: { low: round(exploratoryFit.confidenceInterval.low, 6), high: round(exploratoryFit.confidenceInterval.high, 6) },
		separated: exploratoryFit.separated,
		converged: exploratoryFit.converged,
		note: exploratoryFit.note,
		pooledAvgBar: round(pooledAvg, 6),
		pooledMaxBar: round(pooledMax, 6),
		crossingInsidePooledBand: crossingInsideBand,
		crossingIntervalExcludesBothBars: crossingIntervalExcludesBoth,
		supportsIntermediateBar: crossingInsideBand && crossingIntervalExcludesBoth,
	},

	dormancy: {
		crossRegionRolePairs: fixture.straddleDesign.corpusFrequency.crossRegionPairs,
		rolePairs: fixture.straddleDesign.corpusFrequency.rolePairs,
		pairsInAnyDisagreementBand: fixture.straddleDesign.corpusFrequency.pairsInAnyDisagreementBand,
		closestCrossRegionPair: fixture.straddleDesign.corpusFrequency.closestCrossRegionPair,
		statement:
			"Zero of the 2,582 cross-region role pairs in the 554-palette distilled corpus land in any disagreement band; the closest sits at OKLab 0.04664, about twice the largest bar. Whatever this round says, no current palette verdict changes either way. The round settles a rule, not a corpus behaviour.",
	},

	answerHygiene: {
		recordsSkipped: skipped,
		answeredItems: answers.size,
		fixtureItems: items.length,
		note: "Supersession and retraction resolved by the warehouse's own rule: per (batch, item, question) the latest non-retracted record is the reviewer's position.",
	},
}

await writeFile(values.out!, `${JSON.stringify(analysis, null, "\t")}\n`, "utf8")

console.log(`verdict=${verdict}`)
console.log(`primary n=${n} k=${k} rate=${analysis.primary.sameRate} p=${analysis.primary.exactBinomialP} wilson=${JSON.stringify(analysis.primary.wilson95)}`)
console.log(`cuts favoursMax>=${primary.cuts.favoursMax} favoursAverage<=${primary.cuts.favoursAverage}`)
console.log(`lightness n=${lightnessGroup.n} k=${lightnessGroup.k} rate=${lightnessGroup.sameRate} p=${lightnessGroup.exactBinomialP} decisive=${lightnessGroup.decisive}`)
console.log(`chroma    n=${chromaGroup.n} k=${chromaGroup.k} rate=${chromaGroup.sameRate} p=${chromaGroup.exactBinomialP} decisive=${chromaGroup.decisive}`)
console.log(`anisotropy oppositeSides=${oppositeSides} veto=${anisotropyTriggered}`)
console.log(`attention ${analysis.validityGates.attentionChecks.passed}/${analysis.validityGates.attentionChecks.total} bandsInterpretable=${bandsInterpretable}`)
console.log(`repeats agreed=${consistency.agreed}/${consistency.bothAnswered} agreement=${analysis.repeats.agreement}`)
console.log(`sensitivity n=${sensitivityN} k=${sensitivityK} verdict=${sensitivity.verdict} agrees=${sensitivityAgrees}`)
console.log(`exploratory threshold=${analysis.exploratory.threshold} ci=${JSON.stringify(analysis.exploratory.confidenceInterval)} note=${exploratoryFit.note ?? "-"}`)
console.log(`skipped=${JSON.stringify(skipped)}`)
console.log(`wrote ${values.out}`)
