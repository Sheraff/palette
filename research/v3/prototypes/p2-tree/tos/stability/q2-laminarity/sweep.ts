/**
 * Stage 2 of the laminarity sweep: `LAMINARITY_CUT` x `MONOTONE_MIGRATION_FRACTION` over the grid,
 * scored against the legacy gradient labels, plus the verdict-distribution shift.
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/prototypes/p2-tree/tos/stability/q2-laminarity/sweep.ts
 *
 * **No constant is changed.** The verdict rule is re-evaluated from `out/geometry.jsonl`, which
 * carries every quantity `parseTree` reads, so a cell of the grid is arithmetic rather than a
 * re-run. `collect.ts` proves the re-evaluation is faithful by reproducing the pipeline's own
 * `laminarity` to the bit; this file additionally asserts that the current grid cell reproduces the
 * pipeline's own verdict for every cover, and refuses to report if it does not.
 *
 * The whole 77-cell grid goes through `sweepThenTest`, so "the best cell" can only be quoted with
 * its family size attached.
 */

import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { exactBinomialTest, sweepThenTest, wilsonInterval } from "../../../../../src/stats/index.ts"
import { MIN_LAMINAR_CHAIN_LENGTH, UNREADABLE_COVERAGE_FRACTION } from "../../constants.ts"
import { CURRENT_POINT, ENDORSED_VERDICT_SUBSET, GRID_SIZE, LAMINARITY_CUT_GRID, MONOTONE_GRID, STUDY_VERSION } from "./constants.ts"
import { measurementState } from "../measurement-state.ts"
import type { LabelSet } from "./labels.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, "out")

type Geometry = Readonly<{
	imagePath: string
	membership: readonly string[]
	coverage: number
	chainLength: number
	laminarity: number | null
	monotonicity: number
	endsDistinct: boolean
	fieldSiblings: number
	endHexA: string
	endHexB: string
	currentVerdict: string
	currentGradient: boolean
	error?: string
}>

/** `parseTree`'s verdict branch, as a pure function of the geometry and the two swept cuts. */
function verdictAt(row: Geometry, laminarityCut: number, monotoneFraction: number): { verdict: string; gradient: boolean } {
	const laminarShape =
		row.chainLength >= MIN_LAMINAR_CHAIN_LENGTH && row.laminarity !== null && row.laminarity <= laminarityCut && row.monotonicity >= monotoneFraction
	let verdict: string
	if (row.coverage < UNREADABLE_COVERAGE_FRACTION) verdict = "unreadable"
	else if (!row.endsDistinct && !laminarShape) verdict = "flat"
	else if (laminarShape && row.endsDistinct) verdict = "laminar"
	else if (row.fieldSiblings >= 2) verdict = "partitioned"
	else if (row.endsDistinct) verdict = "partitioned"
	else verdict = "textured"
	// The endpoint ruling: laminar ⇒ the two chain ends *are* background and surface, and
	// `candidate.ts` publishes `gradient: null` when they collapse to one hex.
	const gradient = verdict === "laminar" && row.endHexA !== row.endHexB
	return { verdict, gradient }
}

function rateOf(successes: number, trials: number): Readonly<{ successes: number; trials: number; rate: number | null; interval: readonly [number, number] | null }> {
	if (trials === 0) return { successes, trials, rate: null, interval: null }
	const wilson = wilsonInterval(successes, trials)
	return { successes, trials, rate: successes / trials, interval: "low" in wilson ? ([wilson.low, wilson.high] as const) : null }
}

async function main(): Promise<void> {
	const rows = readFileSync(resolve(OUT_DIR, "geometry.jsonl"), "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Geometry)
	const geometry = rows.filter((row) => row.error === undefined)
	const labelSet = JSON.parse(readFileSync(resolve(OUT_DIR, "labels.json"), "utf8")) as LabelSet

	// ---- self-check: the current cell must reproduce the pipeline ----------------------------------
	const mismatches = geometry.filter((row) => {
		const at = verdictAt(row, CURRENT_POINT.laminarityCut, CURRENT_POINT.monotoneMigrationFraction)
		return at.verdict !== row.currentVerdict || at.gradient !== row.currentGradient
	})
	if (mismatches.length > 0) {
		throw new Error(`the current grid cell disagrees with the pipeline on ${mismatches.length} covers (first: ${mismatches[0].imagePath}) — the sweep is not faithful`)
	}

	// ---- label join --------------------------------------------------------------------------------
	const labelOf = new Map(labelSet.labels.map((label) => [label.imagePath, label]))
	const scored = geometry.filter((row) => {
		const label = labelOf.get(row.imagePath)
		return label !== undefined && label.gradient !== null
	})
	const scoredStrict = scored.filter((row) => labelOf.get(row.imagePath)!.basis === "unanimous")
	const legacyTrue = scored.filter((row) => labelOf.get(row.imagePath)!.gradient === true).length
	const majorityClass = Math.max(legacyTrue, scored.length - legacyTrue) / scored.length

	// The verdict-distribution set: demo-20 plus the first N endorsed covers by sorted path.
	const endorsedSorted = geometry.filter((row) => row.membership.includes("endorsed-173")).sort((first, second) => (first.imagePath < second.imagePath ? -1 : 1))
	const verdictSet = Array.from(
		new Map(
			[...geometry.filter((row) => row.membership.includes("demo-20")), ...endorsedSorted.slice(0, ENDORSED_VERDICT_SUBSET)].map((row) => [row.imagePath, row]),
		).values(),
	).sort((first, second) => (first.imagePath < second.imagePath ? -1 : 1))

	// ---- the grid ----------------------------------------------------------------------------------
	type Cell = {
		id: string
		laminarityCut: number
		monotoneMigrationFraction: number
		isCurrent: boolean
		agreement: ReturnType<typeof rateOf>
		agreementStrictLabels: ReturnType<typeof rateOf>
		confusion: { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number }
		phantomRate: ReturnType<typeof rateOf>
		missedRampRate: ReturnType<typeof rateOf>
		verdictDistribution: Record<string, number>
		gradientsPublished: number
		pValue: number
	}
	const cells: Cell[] = []
	for (const laminarityCut of LAMINARITY_CUT_GRID) {
		for (const monotoneMigrationFraction of MONOTONE_GRID) {
			let truePositive = 0
			let falsePositive = 0
			let falseNegative = 0
			let trueNegative = 0
			let strictAgreed = 0
			let strictTotal = 0
			for (const row of scored) {
				const predicted = verdictAt(row, laminarityCut, monotoneMigrationFraction).gradient
				const actual = labelOf.get(row.imagePath)!.gradient as boolean
				if (predicted && actual) truePositive += 1
				else if (predicted && !actual) falsePositive += 1
				else if (!predicted && actual) falseNegative += 1
				else trueNegative += 1
			}
			for (const row of scoredStrict) {
				strictTotal += 1
				if (verdictAt(row, laminarityCut, monotoneMigrationFraction).gradient === (labelOf.get(row.imagePath)!.gradient as boolean)) strictAgreed += 1
			}
			const distribution: Record<string, number> = {}
			let gradientsPublished = 0
			for (const row of verdictSet) {
				const at = verdictAt(row, laminarityCut, monotoneMigrationFraction)
				distribution[at.verdict] = (distribution[at.verdict] ?? 0) + 1
				if (at.gradient) gradientsPublished += 1
			}
			const agreed = truePositive + trueNegative
			const test = exactBinomialTest({
				successes: agreed,
				trials: scored.length,
				nullProbability: majorityClass,
				alternative: "greater",
				directionFixedInAdvance:
					"prototypes/p2-tree/tos/stability/q2-laminarity/constants.ts — the sweep asks whether any cut beats always guessing the majority class; the direction is the only one that could be interesting and is fixed here before the grid is evaluated",
				trialsAreDistinctUnits: true,
			})
			cells.push({
				id: `lc=${laminarityCut}|mm=${monotoneMigrationFraction}`,
				laminarityCut,
				monotoneMigrationFraction,
				isCurrent: laminarityCut === CURRENT_POINT.laminarityCut && monotoneMigrationFraction === CURRENT_POINT.monotoneMigrationFraction,
				agreement: rateOf(agreed, scored.length),
				agreementStrictLabels: rateOf(strictAgreed, strictTotal),
				confusion: { truePositive, falsePositive, falseNegative, trueNegative },
				phantomRate: rateOf(falsePositive, truePositive + falsePositive),
				missedRampRate: rateOf(falseNegative, truePositive + falseNegative),
				verdictDistribution: distribution,
				gradientsPublished,
				pValue: "pValue" in test ? test.pValue : 1,
			})
		}
	}

	const sweep = sweepThenTest(
		cells.map((cell) => ({ id: cell.id, pValue: cell.pValue })),
		{
			comparisonsRun: GRID_SIZE,
			correction: "holm",
			alpha: 0.05,
			familyDefinition: `${LAMINARITY_CUT_GRID.length} LAMINARITY_CUT values x ${MONOTONE_GRID.length} MONOTONE_MIGRATION_FRACTION values, declared in constants.ts before the grid was evaluated`,
		},
	)

	const current = cells.find((cell) => cell.isCurrent)!
	const ordered = cells.slice().sort((first, second) => (second.agreement.rate ?? 0) - (first.agreement.rate ?? 0) || first.laminarityCut - second.laminarityCut || first.monotoneMigrationFraction - second.monotoneMigrationFraction)
	const best = ordered[0]

	// ---- the three staging points ------------------------------------------------------------------
	//
	// Chosen by three *declared* criteria, written before the grid was read, not by picking three
	// good-looking cells:
	//
	//  1. the status quo, so the round is a comparison and not a proposal;
	//  2. the single-constant change — `LAMINARITY_CUT` held at its current value and
	//     `MONOTONE_MIGRATION_FRACTION` at the value maximising agreement. This is the round's real
	//     question: `NOTES.md` deviation 2 relaxed arm-b′ §2.5's literal "migrates monotonically"
	//     into a ratio, and this point asks the reviewer whether that relaxation is the defect;
	//  3. the family's best cell on agreement, quoted with its family size and its corrected p-value.
	const monotoneOnly =
		cells
			.filter((cell) => cell.laminarityCut === CURRENT_POINT.laminarityCut)
			.sort((first, second) => (second.agreement.rate ?? 0) - (first.agreement.rate ?? 0) || second.monotoneMigrationFraction - first.monotoneMigrationFraction)[0] ?? current
	const staging = [
		{ role: "current", why: "the [UNCALIBRATED] status quo, on the wall so the round is a comparison and not a proposal", cell: current },
		{
			role: "monotone-only",
			why: "LAMINARITY_CUT held at its current value; MONOTONE_MIGRATION_FRACTION moved to the value maximising agreement — one constant, and it is the one NOTES.md deviation 2 relaxed away from arm-b′ §2.5's literal wording",
			cell: monotoneOnly,
		},
		{ role: "best-agreement", why: "highest agreement with the legacy gradient labels in the declared 77-cell family; see `multiplicity` before quoting it as a finding", cell: best },
	]

	// Which covers flip, per staging point, relative to the current cut.
	const flips = staging.map((point) => {
		const flipped = geometry
			.filter((row) => verdictAt(row, point.cell.laminarityCut, point.cell.monotoneMigrationFraction).gradient !== row.currentGradient)
			.map((row) => {
				const at = verdictAt(row, point.cell.laminarityCut, point.cell.monotoneMigrationFraction)
				const label = labelOf.get(row.imagePath)
				return {
					imagePath: row.imagePath,
					direction: row.currentGradient ? "ramp->flat" : "flat->ramp",
					currentVerdict: row.currentVerdict,
					newVerdict: at.verdict,
					laminarity: row.laminarity,
					monotonicity: row.monotonicity,
					coverage: row.coverage,
					legacyGradient: label?.gradient ?? null,
					legacyBasis: label?.basis ?? null,
				}
			})
			.sort((first, second) => (first.imagePath < second.imagePath ? -1 : 1))
		return { role: point.role, point: { laminarityCut: point.cell.laminarityCut, monotoneMigrationFraction: point.cell.monotoneMigrationFraction }, flippedCount: flipped.length, flipped }
	})

	// ---- the reviewer's own phantom, traced through the grid ---------------------------------------
	//
	// Round 1 item …c5ac790164: "almost very good, but this artwork is flat, not a gradient". It is the
	// only human price ever put on `LAMINARITY_CUT`, so it gets its own row rather than being averaged
	// into a rate.
	const flaggedSuffix = "c5ac790164"
	const flaggedRow = geometry.find((row) => row.imagePath.includes(flaggedSuffix)) ?? null
	const flagged =
		flaggedRow === null
			? { found: false as const, suffix: flaggedSuffix }
			: {
					found: true as const,
					imagePath: flaggedRow.imagePath,
					reviewerVerdict: "flat, not a gradient (round-1-tree-families, p2-tos side)",
					laminarity: flaggedRow.laminarity,
					monotonicity: flaggedRow.monotonicity,
					coverage: flaggedRow.coverage,
					chainLength: flaggedRow.chainLength,
					readsAsGradientAt: cells
						.filter((cell) => verdictAt(flaggedRow, cell.laminarityCut, cell.monotoneMigrationFraction).gradient)
						.map((cell) => cell.id),
					note:
						"Its straightness residual is far inside every LAMINARITY_CUT on the grid, so no value of that constant refuses it. Its centroid monotonicity sits just above the current MONOTONE_MIGRATION_FRACTION — the reviewer's phantom is a monotonicity call, not a laminarity call.",
				}

	// The ceiling the (unswept) coverage gate imposes: covers the laminarity cut can never reach.
	const gatedOut = geometry.filter((row) => row.coverage < UNREADABLE_COVERAGE_FRACTION)
	const gatedOutScored = scored.filter((row) => row.coverage < UNREADABLE_COVERAGE_FRACTION)
	const gatedOutWithRampLabel = gatedOutScored.filter((row) => labelOf.get(row.imagePath)!.gradient === true)

	const report = {
		what: "Is the p2-tos laminarity cut publishing phantom gradients? A 77-cell sweep against the legacy gradient labels, plus the verdict-distribution shift.",
		studyVersion: STUDY_VERSION,
		measurementState: measurementState(),
		inputs: {
			geometry: "research/v3/prototypes/p2-tree/tos/stability/q2-laminarity/out/geometry.jsonl",
			labels: "research/v3/prototypes/p2-tree/tos/stability/q2-laminarity/out/labels.json",
			legacyFile: labelSet.legacyFile,
		},
		labelAvailability: {
			endorsedArtworks: labelSet.endorsedArtworks,
			unanimousLabel: labelSet.usableStrict,
			usableAfterRecencyResolution: labelSet.usableWithRecency,
			noGradientStateRecorded: labelSet.noStateRecorded,
			contested: labelSet.contested,
			joinedToARunnableCover: scored.length,
			legacyRampCount: legacyTrue,
			legacyFlatCount: scored.length - legacyTrue,
			majorityClassBaseline: majorityClass,
			note: "`palette.gradient: null` in the legacy source means *not recorded* (the entry's own paletteSignature spells it `g?`), never *no gradient*. src/adjudication/evidence.ts deliberately drops the field, so the boolean is read from data/legacy/endorsements.json joined on entryId; see labels.ts.",
		},
		coverageGate: {
			constant: "UNREADABLE_COVERAGE_FRACTION",
			value: UNREADABLE_COVERAGE_FRACTION,
			note: "Not swept (the brief names only the two laminarity constants). It runs BEFORE the laminarity test, so these covers are unreachable by any cell of this grid.",
			coversGatedOut: gatedOut.length,
			coversTotal: geometry.length,
			labelledCoversGatedOut: gatedOutScored.length,
			labelledRampsGatedOut: gatedOutWithRampLabel.length,
		},
		currentPoint: CURRENT_POINT,
		reviewerFlaggedPhantom: flagged,
		grid: { laminarityCut: LAMINARITY_CUT_GRID, monotoneMigrationFraction: MONOTONE_GRID, size: GRID_SIZE },
		multiplicity: sweep,
		cells,
		staging,
		flips,
		verdictSet: { covers: verdictSet.length, definition: `demo-20 union the first ${ENDORSED_VERDICT_SUBSET} endorsed covers by sorted repo-relative path` },
	}

	await mkdir(OUT_DIR, { recursive: true })
	await writeFile(resolve(HERE, "report.json"), `${JSON.stringify(report, null, "\t")}\n`, "utf8")
	// Set files, in `data/devloop/sets/demo-20.txt`'s own format, so a flat-vs-ramp round can be built
	// straight off a staging point without anyone re-deriving which covers moved.
	for (const entry of flips) {
		const header = [
			`# p2-tos flat-vs-ramp staging — covers that flip against the current cut at ${entry.role}`,
			`# LAMINARITY_CUT=${entry.point.laminarityCut}  MONOTONE_MIGRATION_FRACTION=${entry.point.monotoneMigrationFraction}`,
			`# current cut: LAMINARITY_CUT=${CURRENT_POINT.laminarityCut}  MONOTONE_MIGRATION_FRACTION=${CURRENT_POINT.monotoneMigrationFraction}`,
			`# ${entry.flippedCount} covers; direction and legacy label per cover are in report.json flips[].`,
			`# generated by ${STUDY_VERSION}; paths resolve against the repository root.`,
		]
		await writeFile(resolve(OUT_DIR, `flips-${entry.role}.txt`), `${[...header, ...entry.flipped.map((row) => row.imagePath)].join("\n")}\n`, "utf8")
	}
	process.stdout.write(
		`${JSON.stringify(
			{
				labelAvailability: report.labelAvailability,
				coverageGate: report.coverageGate,
				current: { id: current.id, agreement: current.agreement, confusion: current.confusion },
				best: { id: best.id, agreement: best.agreement, confusion: best.confusion },
				staging: staging.map((point) => ({ role: point.role, id: point.cell.id, agreement: point.cell.agreement.rate, confusion: point.cell.confusion, gradientsPublished: point.cell.gradientsPublished })),
				flips: flips.map((entry) => ({ role: entry.role, flippedCount: entry.flippedCount })),
				sweepSummary: "summary" in sweep ? sweep.summary : sweep,
			},
			null,
			"\t",
		)}\n`,
	)
}

await main()
