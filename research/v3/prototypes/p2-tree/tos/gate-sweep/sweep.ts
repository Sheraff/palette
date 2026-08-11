/**
 * Stage 2 of the coverage-gate sweep: `UNREADABLE_COVERAGE_FRACTION` over a declared grid, scored
 * against the 144 legacy gradient labels, plus the verdict-distribution drift on unlabelled covers.
 *
 *     sh research/v3/prototypes/p2-tree/tos/gate-sweep/pin.sh sweep.ts
 *
 * **No constant is changed.** The verdict rule is re-evaluated from `out/geometry.jsonl`, which
 * carries every quantity `parseTree` reads, so a grid point is arithmetic rather than a re-run.
 * `collect.ts` proves the re-evaluation is faithful by reproducing the pipeline's own `laminarity`
 * to the bit; this file additionally asserts that the current grid point reproduces the pipeline's
 * own verdict **and its published field pair** for every cover, and refuses to report if it does not.
 *
 * Both test families go through `sweepThenTest`, so "the best gate" cannot be quoted without its
 * family size attached.
 *
 * ## What a "ceiling" is here
 *
 * The gate runs *before* the laminarity test, and a gated-out cover is published as `unreadable`,
 * which publishes `gradient: false`. So against a gradient label a gated-out **flat** agrees for
 * free and a gated-out **ramp** is an error no laminarity constant can reach. The ceiling at gate g
 * is therefore `1 - rampsGatedOut(g) / 144`: the best agreement the laminarity stage could reach
 * behind that gate even if it were perfect. That is the quantity worker G's 63.9% named, and it is
 * the first curve this study owes.
 */

import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { exactBinomialTest, fisherExact2x2, mcnemarExact, sweepThenTest, wilsonInterval } from "../../../../src/stats/index.ts"
import { LAMINARITY_CUT, MIN_LAMINAR_CHAIN_LENGTH, MONOTONE_MIGRATION_FRACTION } from "../constants.ts"
import { ALPHA, CEILING_FLOOR, CURRENT_GATE, GATE_GRID, GRID_SIZE, OPERATING_POINT_RULES, STUDY_VERSION } from "./constants.ts"
import { PIN } from "./pin.ts"
import type { FieldPair, Geometry as GeometryRow } from "./collect.ts"
import type { LabelSet } from "../stability/q2-laminarity/labels.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, "out")

type Row = GeometryRow & { error?: string }

type Outcome = Readonly<{ verdict: string; gradient: boolean; pair: FieldPair }>

/**
 * `parseTree`'s verdict branch **and** its field-pair branch, as a pure function of the collected
 * geometry and the swept gate. The two laminarity constants are held at their shipped values: D13.1
 * ruled that no laminarity constant moves until this gate is measured.
 */
function outcomeAt(row: Row, gate: number): Outcome {
	const laminarShape =
		row.chainLength >= MIN_LAMINAR_CHAIN_LENGTH &&
		row.laminarity !== null &&
		row.laminarity <= LAMINARITY_CUT &&
		row.monotonicity >= MONOTONE_MIGRATION_FRACTION
	let verdict: keyof Row["pairByVerdict"]
	if (row.coverage < gate) verdict = "unreadable"
	else if (!row.endsDistinct && !laminarShape) verdict = "flat"
	else if (laminarShape && row.endsDistinct) verdict = "laminar"
	else if (row.fieldSiblings >= 2) verdict = "partitioned"
	else if (row.endsDistinct) verdict = "partitioned"
	else verdict = "textured"
	// The endpoint ruling: laminar ⇒ the two chain ends *are* background and surface, and
	// `candidate.ts` publishes `gradient: null` when they collapse to one hex.
	const gradient = verdict === "laminar" && row.endHexA !== row.endHexB
	return { verdict, gradient, pair: row.pairByVerdict[verdict] }
}

const samePair = (first: FieldPair, second: FieldPair): boolean => first.background === second.background && first.surface === second.surface

function rateOf(successes: number, trials: number): Readonly<{ successes: number; trials: number; rate: number | null; interval: readonly [number, number] | null }> {
	if (trials === 0) return { successes, trials, rate: null, interval: null }
	const wilson = wilsonInterval(successes, trials)
	return { successes, trials, rate: successes / trials, interval: "low" in wilson ? ([wilson.low, wilson.high] as const) : null }
}

function distribution(rows: readonly Row[], gate: number): Record<string, number> {
	const counts: Record<string, number> = { flat: 0, laminar: 0, partitioned: 0, textured: 0, unreadable: 0 }
	for (const row of rows) counts[outcomeAt(row, gate).verdict] += 1
	return counts
}

/** Deciles of a numeric sample, plus the moments a reader needs to see a distribution's shape. */
function summarise(values: readonly number[]): Readonly<{ n: number; min: number; max: number; mean: number; median: number; deciles: readonly number[] }> | null {
	if (values.length === 0) return null
	const sorted = values.slice().sort((first, second) => first - second)
	const quantile = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]
	return {
		n: sorted.length,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
		median: quantile(0.5),
		deciles: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(quantile),
	}
}

async function main(): Promise<void> {
	const rows = readFileSync(resolve(OUT_DIR, "geometry.jsonl"), "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Row)
	const geometry = rows.filter((row) => row.error === undefined)
	const unrunnable = rows.filter((row) => row.error !== undefined)
	const labelSet = JSON.parse(readFileSync(resolve(OUT_DIR, "labels.json"), "utf8")) as LabelSet

	// ---- self-check: the current grid point must reproduce the pipeline, verdict and field pair -----
	const mismatches = geometry.filter((row) => {
		const at = outcomeAt(row, CURRENT_GATE)
		return at.verdict !== row.currentVerdict || at.gradient !== row.currentGradient || !samePair(at.pair, { background: row.currentRoles.background, surface: row.currentRoles.surface })
	})
	if (mismatches.length > 0) {
		throw new Error(
			`the current gate disagrees with the pipeline on ${mismatches.length} covers (first: ${mismatches[0].imagePath}) — the sweep is not faithful`,
		)
	}
	const laminarityDrift = geometry.filter((row) => row.laminarityCheck !== 0)
	if (laminarityDrift.length > 0) throw new Error(`${laminarityDrift.length} covers failed the laminarity recomputation check`)

	// ---- the sets ------------------------------------------------------------------------------------
	const labelOf = new Map(labelSet.labels.map((label) => [label.imagePath, label]))
	const labelled = geometry.filter((row) => {
		const label = labelOf.get(row.imagePath)
		return label !== undefined && label.gradient !== null
	})
	const isRamp = (row: Row): boolean => labelOf.get(row.imagePath)!.gradient === true
	const legacyRamps = labelled.filter(isRamp).length
	const majorityClass = Math.max(legacyRamps, labelled.length - legacyRamps) / labelled.length

	const demo = geometry.filter((row) => row.membership.includes("demo-20"))
	const fresh = geometry.filter((row) => row.membership.includes("fresh-40"))
	const census = Array.from(new Map([...demo, ...fresh].map((row) => [row.imagePath, row])).values()).sort((first, second) =>
		first.imagePath < second.imagePath ? -1 : 1,
	)
	const censusUnlabelled = census.filter((row) => {
		const label = labelOf.get(row.imagePath)
		return label === undefined || label.gradient === null
	})

	// ---- the grid ------------------------------------------------------------------------------------
	type Cell = {
		id: string
		gate: number
		isCurrent: boolean
		/** Labelled covers (n=144). */
		passing: number
		gatedOut: number
		rampsGatedOut: number
		flatsGatedOut: number
		/** `1 - rampsGatedOut / 144`: the best agreement any laminarity constants could reach behind this gate. */
		ceiling: number
		agreementAll: ReturnType<typeof rateOf>
		agreementAmongPassing: ReturnType<typeof rateOf>
		confusionAll: { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number }
		/** Of the gradients this gate publishes, the share the legacy corpus calls flat. W-G's "phantom rate". */
		phantomRate: ReturnType<typeof rateOf>
		/** Of the 68 legacy ramps, the share published as a gradient. The quantity the gate destroys. */
		rampRecall: ReturnType<typeof rateOf>
		/** Labelled covers called `unreadable`: the label is proof a human read the field, so every one is a false unreadable. */
		falseUnreadable: ReturnType<typeof rateOf>
		verdictsLabelled: Record<string, number>
		verdictsCensus: Record<string, number>
		verdictsDemo: Record<string, number>
		verdictsFresh: Record<string, number>
		/** Census covers whose verdict class / published field pair moves against the current gate. */
		censusVerdictMoved: number
		censusPairMoved: number
		gradientsPublishedCensus: number
		binomialP: number
		mcnemarP: number
		mcnemarCounts: { candidateOnly: number; currentOnly: number; both: number; neither: number }
		mcnemarNote: string
	}

	const cells: Cell[] = []
	for (const gate of GATE_GRID) {
		const gatedOut = labelled.filter((row) => row.coverage < gate)
		const rampsGatedOut = gatedOut.filter(isRamp).length
		let truePositive = 0
		let falsePositive = 0
		let falseNegative = 0
		let trueNegative = 0
		let passingAgreed = 0
		let passingTotal = 0
		let candidateOnly = 0
		let currentOnly = 0
		let both = 0
		let neither = 0
		for (const row of labelled) {
			const predicted = outcomeAt(row, gate).gradient
			const actual = isRamp(row)
			if (predicted && actual) truePositive += 1
			else if (predicted && !actual) falsePositive += 1
			else if (!predicted && actual) falseNegative += 1
			else trueNegative += 1
			if (row.coverage >= gate) {
				passingTotal += 1
				if (predicted === actual) passingAgreed += 1
			}
			const candidateRight = predicted === actual
			const currentRight = outcomeAt(row, CURRENT_GATE).gradient === actual
			if (candidateRight && currentRight) both += 1
			else if (candidateRight) candidateOnly += 1
			else if (currentRight) currentOnly += 1
			else neither += 1
		}
		const agreed = truePositive + trueNegative

		const binomial = exactBinomialTest({
			successes: agreed,
			trials: labelled.length,
			nullProbability: majorityClass,
			alternative: "greater",
			directionFixedInAdvance:
				"prototypes/p2-tree/tos/gate-sweep/constants.ts — the sweep asks whether any gate lets the shipped laminarity constants beat always guessing the majority class; the direction is the only one that could be interesting and is fixed there before the grid was evaluated",
			trialsAreDistinctUnits: true,
		})
		const mcnemar = mcnemarExact({
			counts: { bothSucceeded: both, onlyFirstSucceeded: candidateOnly, onlySecondSucceeded: currentOnly, neitherSucceeded: neither },
			alternative: "greater",
			directionFixedInAdvance:
				"prototypes/p2-tree/tos/gate-sweep/constants.ts and DECISIONS.md D13.2 — the gate is under suspicion of being too HIGH (W-G: it forces 52 of 68 legacy ramps to an automatic error), so the only hypothesis on the table is that a lower gate agrees with the labels more often than the shipped 0.5",
			pairLabel: "labelled cover",
		})

		const censusVerdictMoved = census.filter((row) => outcomeAt(row, gate).verdict !== outcomeAt(row, CURRENT_GATE).verdict).length
		const censusPairMoved = census.filter((row) => !samePair(outcomeAt(row, gate).pair, outcomeAt(row, CURRENT_GATE).pair)).length

		cells.push({
			id: `gate=${gate}`,
			gate,
			isCurrent: gate === CURRENT_GATE,
			passing: labelled.length - gatedOut.length,
			gatedOut: gatedOut.length,
			rampsGatedOut,
			flatsGatedOut: gatedOut.length - rampsGatedOut,
			ceiling: (labelled.length - rampsGatedOut) / labelled.length,
			agreementAll: rateOf(agreed, labelled.length),
			agreementAmongPassing: rateOf(passingAgreed, passingTotal),
			confusionAll: { truePositive, falsePositive, falseNegative, trueNegative },
			phantomRate: rateOf(falsePositive, truePositive + falsePositive),
			rampRecall: rateOf(truePositive, truePositive + falseNegative),
			falseUnreadable: rateOf(gatedOut.length, labelled.length),
			verdictsLabelled: distribution(labelled, gate),
			verdictsCensus: distribution(census, gate),
			verdictsDemo: distribution(demo, gate),
			verdictsFresh: distribution(fresh, gate),
			censusVerdictMoved,
			censusPairMoved,
			gradientsPublishedCensus: census.filter((row) => outcomeAt(row, gate).gradient).length,
			binomialP: "pValue" in binomial ? binomial.pValue : 1,
			mcnemarP: "pValue" in mcnemar ? mcnemar.pValue : 1,
			mcnemarCounts: { candidateOnly, currentOnly, both, neither },
			mcnemarNote: "pValue" in mcnemar ? mcnemar.summary : mcnemar.detail,
		})
	}

	// ---- multiplicity: two families, each corrected over the whole declared grid ----------------------
	const familyVsBaseline = sweepThenTest(
		cells.map((cell) => ({ id: cell.id, pValue: cell.binomialP, label: "agreement over 144 labels vs the majority-class baseline" })),
		{
			comparisonsRun: GRID_SIZE,
			correction: "holm",
			alpha: ALPHA,
			familyDefinition: `${GATE_GRID.length} UNREADABLE_COVERAGE_FRACTION values, declared in gate-sweep/constants.ts before the grid was evaluated; laminarity constants held at their shipped values per D13.1`,
		},
	)
	const familyVsCurrent = sweepThenTest(
		cells.map((cell) => ({ id: cell.id, pValue: cell.mcnemarP, label: "paired against the shipped gate 0.5 on the same 144 covers" })),
		{
			comparisonsRun: GRID_SIZE,
			correction: "holm",
			alpha: ALPHA,
			familyDefinition: `${GATE_GRID.length} UNREADABLE_COVERAGE_FRACTION values, each McNemar-paired against the shipped 0.5 on the same 144 labelled covers; declared in gate-sweep/constants.ts before the grid was evaluated`,
		},
	)

	// ---- what the gate excludes at 0.5 ---------------------------------------------------------------
	const gatedAtCurrent = labelled.filter((row) => row.coverage < CURRENT_GATE)
	const passingAtCurrent = labelled.filter((row) => row.coverage >= CURRENT_GATE)
	const gatedRamps = gatedAtCurrent.filter(isRamp)
	const gatedFlats = gatedAtCurrent.filter((row) => !isRamp(row))
	const histogram: Record<string, number> = {}
	for (const row of gatedAtCurrent) {
		const bin = Math.min(9, Math.floor(row.coverage / 0.05))
		const key = `${(bin * 0.05).toFixed(2)}-${((bin + 1) * 0.05).toFixed(2)}`
		histogram[key] = (histogram[key] ?? 0) + 1
	}
	// Is a ramp gated out disproportionately? Group 1 = legacy ramps, outcome = gated out at 0.5.
	const rampVsGating = fisherExact2x2({
		table: {
			a: gatedRamps.length,
			b: labelled.filter(isRamp).length - gatedRamps.length,
			c: gatedFlats.length,
			d: labelled.filter((row) => !isRamp(row)).length - gatedFlats.length,
		},
		pairing: "independent-groups",
		alternative: "two-sided",
	})
	// Where would the gated-out covers land if the gate were removed entirely?
	const gatedDestinations: Record<string, number> = { flat: 0, laminar: 0, partitioned: 0, textured: 0, unreadable: 0 }
	const gatedDestinationsByLabel: Record<string, Record<string, number>> = { ramp: { ...gatedDestinations }, flat: { ...gatedDestinations } }
	for (const row of gatedAtCurrent) {
		const destination = outcomeAt(row, 0).verdict
		gatedDestinations[destination] += 1
		gatedDestinationsByLabel[isRamp(row) ? "ramp" : "flat"][destination] += 1
	}

	// **Descriptive, and no test is run on it.** If the 93 covers the gate hides were separable by the
	// laminarity stage, the share of them it calls `laminar` would differ by label. The two rates and
	// their intervals are printed; a p-value here would be a third family invented after the curve was
	// read, and the two families this study declared already returned 0 survivors.
	const laminarShareOfGatedOut = {
		note: "Descriptive only — no test. Of the covers the shipped gate hides, the share the laminarity stage calls `laminar` once they are let through, split by legacy label. Overlapping intervals mean the stage does not separate them.",
		ramps: rateOf(gatedDestinationsByLabel.ramp.laminar, gatedRamps.length),
		flats: rateOf(gatedDestinationsByLabel.flat.laminar, gatedFlats.length),
	}

	const exclusion = {
		question: "What does UNREADABLE_COVERAGE_FRACTION=0.5 exclude, and does the exclusion track the label?",
		labelledCoversGatedOut: gatedAtCurrent.length,
		labelledCoversTotal: labelled.length,
		labelledRampsGatedOut: gatedRamps.length,
		labelledRampsTotal: labelled.filter(isRamp).length,
		labelledFlatsGatedOut: gatedFlats.length,
		labelledFlatsTotal: labelled.filter((row) => !isRamp(row)).length,
		reproducesWorkerG: gatedAtCurrent.length === 93 && gatedRamps.length === 52,
		coverageOfGatedOut: summarise(gatedAtCurrent.map((row) => row.coverage)),
		coverageOfGatedOutRamps: summarise(gatedRamps.map((row) => row.coverage)),
		coverageOfGatedOutFlats: summarise(gatedFlats.map((row) => row.coverage)),
		coverageOfPassing: summarise(passingAtCurrent.map((row) => row.coverage)),
		histogramOfGatedOut: histogram,
		gatedOutRate: { ramps: rateOf(gatedRamps.length, labelled.filter(isRamp).length), flats: rateOf(gatedFlats.length, labelled.filter((row) => !isRamp(row)).length) },
		rampVsGating,
		destinationsIfUngated: gatedDestinations,
		destinationsIfUngatedByLabel: gatedDestinationsByLabel,
		laminarShareOfGatedOut,
	}

	// ---- candidate operating points, by the rules declared in constants.ts ---------------------------
	const byCeiling = cells.filter((cell) => cell.ceiling >= CEILING_FLOOR).sort((first, second) => second.gate - first.gate)
	const ceilingPoint = byCeiling[0] ?? cells[0]
	const bestAgreement = cells.slice().sort((first, second) => (second.agreementAll.rate ?? 0) - (first.agreementAll.rate ?? 0) || second.gate - first.gate)[0]
	const current = cells.find((cell) => cell.isCurrent)!
	const noGate = cells.find((cell) => cell.gate === 0)!
	// **Post-hoc, and labelled as such.** The ceiling curve turned out to saturate at 1.0 well above 0,
	// which none of the four declared rules can name. The point is a fact about the curve, not a
	// selection on the outcome — its ceiling is a property of the coverage distribution and the labels
	// alone, computed without ever evaluating agreement — but it was chosen *after* the curve was read
	// and is flagged so no reader has to take that distinction on trust.
	const saturationPoint = cells.filter((cell) => cell.ceiling >= 1).sort((first, second) => second.gate - first.gate)[0] ?? noGate
	const chosen = [
		{ role: "current", why: OPERATING_POINT_RULES[0], declaredBeforeData: true, cell: current },
		{ role: "ceiling-90", why: OPERATING_POINT_RULES[1], declaredBeforeData: true, cell: ceilingPoint },
		{ role: "best-agreement", why: OPERATING_POINT_RULES[2], declaredBeforeData: true, cell: bestAgreement },
		{
			role: "ceiling-saturation",
			why: "POST-HOC (named after the curve was read, not in constants.ts): the highest gate at which the agreement ceiling is 1.0 — no legacy ramp is gated out at all. A property of the coverage distribution and the labels, computed without evaluating agreement.",
			declaredBeforeData: false,
			cell: saturationPoint,
		},
		{ role: "no-gate", why: OPERATING_POINT_RULES[3], declaredBeforeData: true, cell: noGate },
	]
	// De-duplicate by gate while keeping the first (declared) role that selected it.
	const points = chosen.filter((point, index) => chosen.findIndex((other) => other.cell.gate === point.cell.gate) === index)

	const flips = points.map((point) => {
		const flipped = geometry
			.filter((row) => {
				const at = outcomeAt(row, point.cell.gate)
				const now = outcomeAt(row, CURRENT_GATE)
				return at.verdict !== now.verdict || !samePair(at.pair, now.pair)
			})
			.map((row) => {
				const at = outcomeAt(row, point.cell.gate)
				const now = outcomeAt(row, CURRENT_GATE)
				const label = labelOf.get(row.imagePath)
				return {
					imagePath: row.imagePath,
					membership: row.membership,
					coverage: row.coverage,
					currentVerdict: now.verdict,
					newVerdict: at.verdict,
					verdictMoved: at.verdict !== now.verdict,
					fieldPairMoved: !samePair(at.pair, now.pair),
					currentPair: now.pair,
					newPair: at.pair,
					gradientMoved: at.gradient !== now.gradient,
					legacyGradient: label?.gradient ?? null,
					legacyBasis: label?.basis ?? null,
					laminarity: row.laminarity,
					monotonicity: row.monotonicity,
				}
			})
			.sort((first, second) => (first.imagePath < second.imagePath ? -1 : 1))
		return {
			role: point.role,
			gate: point.cell.gate,
			declaredBeforeData: point.declaredBeforeData,
			flippedCount: flipped.length,
			verdictMovedCount: flipped.filter((entry) => entry.verdictMoved).length,
			fieldPairMovedCount: flipped.filter((entry) => entry.fieldPairMoved).length,
			gradientMovedCount: flipped.filter((entry) => entry.gradientMoved).length,
			labelledFlippedCount: flipped.filter((entry) => entry.legacyGradient !== null).length,
			flipped,
		}
	})

	const report = {
		what: "Is UNREADABLE_COVERAGE_FRACTION (0.5, [UNCALIBRATED]) mispriced? A 13-point sweep of the field-verdict gate against the 144 legacy gradient labels, plus the verdict drift on demo-20 and the round-3 fresh 40.",
		why: "DECISIONS.md D13.2 — the round-2 flat-vs-ramp round returned 3/8 cant_tell, firing the pre-declared trigger that promotes this gate to the next MEASURED constant. Worker G's Q2 found it caps laminarity agreement at 63.9%.",
		studyVersion: STUDY_VERSION,
		pin: PIN,
		heldFixed: { LAMINARITY_CUT, MONOTONE_MIGRATION_FRACTION, MIN_LAMINAR_CHAIN_LENGTH, note: "D13.1: no laminarity constant moves until this gate is measured, so the sweep is one-dimensional by ruling." },
		inputs: {
			geometry: "research/v3/prototypes/p2-tree/tos/gate-sweep/out/geometry.jsonl",
			labels: "research/v3/prototypes/p2-tree/tos/gate-sweep/out/labels.json",
			legacyFile: labelSet.legacyFile,
			labelsLoader: "research/v3/prototypes/p2-tree/tos/stability/q2-laminarity/labels.ts (worker G, cycle 2) — imported, not re-derived",
		},
		sets: {
			coversRun: geometry.length,
			coversUnrunnable: unrunnable.length,
			labelled: labelled.length,
			legacyRamps,
			legacyFlats: labelled.length - legacyRamps,
			majorityClassBaseline: majorityClass,
			demo20: demo.length,
			fresh40: fresh.length,
			census: census.length,
			censusUnlabelled: censusUnlabelled.length,
			censusNote: "demo-20 union round-3-quality/fresh-40.txt. No gradient labels exist for these covers; only the verdict/field-pair drift is reported for them.",
		},
		selfCheck: {
			currentGateReproducesPipelineVerdict: true,
			currentGateReproducesPipelineFieldPair: true,
			laminarityRecomputationExact: true,
			coversChecked: geometry.length,
		},
		grid: { values: GATE_GRID, size: GRID_SIZE, currentGate: CURRENT_GATE, alpha: ALPHA, ceilingFloor: CEILING_FLOOR },
		cells,
		multiplicity: { vsMajorityClassBaseline: familyVsBaseline, vsCurrentGatePaired: familyVsCurrent },
		exclusionAtCurrentGate: exclusion,
		operatingPointRules: OPERATING_POINT_RULES,
		operatingPoints: points.map((point) => ({
			role: point.role,
			why: point.why,
			declaredBeforeData: point.declaredBeforeData,
			gate: point.cell.gate,
			ceiling: point.cell.ceiling,
			agreementAll: point.cell.agreementAll,
			agreementAmongPassing: point.cell.agreementAmongPassing,
			confusionAll: point.cell.confusionAll,
			phantomRate: point.cell.phantomRate,
			rampRecall: point.cell.rampRecall,
			falseUnreadable: point.cell.falseUnreadable,
			verdictsLabelled: point.cell.verdictsLabelled,
			verdictsCensus: point.cell.verdictsCensus,
			binomialP: point.cell.binomialP,
			mcnemarP: point.cell.mcnemarP,
			mcnemarCounts: point.cell.mcnemarCounts,
		})),
		flips: flips.map((entry) => ({ ...entry, flipped: undefined })),
		flipDetail: flips,
	}

	await mkdir(OUT_DIR, { recursive: true })
	await writeFile(resolve(HERE, "report.json"), `${JSON.stringify(report, null, "\t")}\n`, "utf8")

	// Set files, in `data/devloop/sets/demo-20.txt`'s own format, so a round can be built straight off
	// an operating point without anyone re-deriving which covers moved.
	for (const entry of flips) {
		const header = [
			`# p2-tos coverage-gate staging — covers that change verdict class or published field pair at ${entry.role}`,
			`# UNREADABLE_COVERAGE_FRACTION=${entry.gate}  (shipped: ${CURRENT_GATE})`,
			`# ${entry.flippedCount} covers: ${entry.verdictMovedCount} change verdict class, ${entry.fieldPairMovedCount} change the published background/surface pair, ${entry.gradientMovedCount} change the gradient boolean, ${entry.labelledFlippedCount} carry a legacy gradient label.`,
			`# per-cover direction, coverage and label are in report.json flipDetail[].`,
			`# generated by ${STUDY_VERSION} at pin ${PIN.commit}; paths resolve against the repository root.`,
		]
		await writeFile(resolve(OUT_DIR, `flips-${entry.role}.txt`), `${[...header, ...entry.flipped.map((row) => row.imagePath)].join("\n")}\n`, "utf8")
	}

	// The curve, as a tab-separated table, because the two numbers the brief asks for first are a curve.
	const curve = [
		"gate\tpassing/144\tceiling\tagreementAll\tagreementAmongPassing\trampRecall\tphantomRate\tfalseUnreadable\tcensusUnreadable\tcensusVerdictMoved\tcensusPairMoved",
		...cells.map((cell) =>
			[
				cell.gate,
				`${cell.passing}/144`,
				cell.ceiling.toFixed(4),
				(cell.agreementAll.rate ?? 0).toFixed(4),
				cell.agreementAmongPassing.rate === null ? "n/a" : cell.agreementAmongPassing.rate.toFixed(4),
				cell.rampRecall.rate === null ? "n/a" : cell.rampRecall.rate.toFixed(4),
				cell.phantomRate.rate === null ? "n/a" : cell.phantomRate.rate.toFixed(4),
				(cell.falseUnreadable.rate ?? 0).toFixed(4),
				`${cell.verdictsCensus.unreadable}/${census.length}`,
				`${cell.censusVerdictMoved}/${census.length}`,
				`${cell.censusPairMoved}/${census.length}`,
			].join("\t"),
		),
	].join("\n")
	await writeFile(resolve(OUT_DIR, "curve.txt"), `${curve}\n`, "utf8")

	process.stdout.write(`${curve}\n\n`)
	process.stdout.write(
		`${JSON.stringify(
			{
				sets: report.sets,
				exclusion: {
					reproducesWorkerG: exclusion.reproducesWorkerG,
					gatedOut: `${exclusion.labelledCoversGatedOut}/${exclusion.labelledCoversTotal}`,
					ramps: `${exclusion.labelledRampsGatedOut}/${exclusion.labelledRampsTotal}`,
					flats: `${exclusion.labelledFlatsGatedOut}/${exclusion.labelledFlatsTotal}`,
					fisher: "pValue" in exclusion.rampVsGating ? exclusion.rampVsGating.summary : exclusion.rampVsGating.detail,
					destinations: exclusion.destinationsIfUngated,
				},
				points: report.operatingPoints.map((point) => ({
					role: point.role,
					gate: point.gate,
					declaredBeforeData: point.declaredBeforeData,
					ceiling: point.ceiling,
					agreement: point.agreementAll.rate,
					agreementAmongPassing: point.agreementAmongPassing.rate,
					falseUnreadable: point.falseUnreadable.rate,
					verdictsLabelled: point.verdictsLabelled,
					verdictsCensus: point.verdictsCensus,
					mcnemar: point.mcnemarCounts,
					mcnemarP: point.mcnemarP,
				})),
				flips: flips.map((entry) => ({ role: entry.role, gate: entry.gate, flips: entry.flippedCount, verdictMoved: entry.verdictMovedCount, pairMoved: entry.fieldPairMovedCount, labelled: entry.labelledFlippedCount })),
				vsBaseline: "summary" in familyVsBaseline ? familyVsBaseline.summary : familyVsBaseline,
				vsCurrent: "summary" in familyVsCurrent ? familyVsCurrent.summary : familyVsCurrent,
			},
			null,
			"\t",
		)}\n`,
	)
}

await main()
