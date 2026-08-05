/**
 * Step 2 of the **pair** attribution (W11b): for every selected rendition pair, the first stage of the
 * decision chain at which the two renditions stop agreeing, plus the evidence the
 * degenerate-depth-floor hypothesis is tested on.
 *
 * ```sh
 * node --experimental-strip-types prototypes/p3-fields/measurements/attribution/pairs-attribute.ts \
 *   prototypes/p3-fields/measurements/attribution/pairs-selected-0.3.0.json \
 *   prototypes/p3-fields/measurements/attribution/perturb-selected-0.3.0.json \
 *   $PWD/data/devloop/p3-diag-pairs-0.3.0 \
 *   prototypes/p3-fields/measurements/attribution/pairs-attribution-0.3.0.json
 * ```
 *
 * ## Same taxonomy as `attribution-0.3.0.json`, deliberately
 *
 * `STAGES` below is the list `attribute.ts` uses, in the same order, with the same "divergence is a
 * discrete outcome, never a continuous quantity that merely differs" rule and the same regional
 * same-colour bar. It is duplicated rather than imported because `attribute.ts` is a script with
 * top-level effects; any edit to one must be mirrored in the other. The one guard against silent
 * drift is checked at the end of this run: every stage name that appears in `attribution-0.3.0.json`
 * must exist in the list below, and a name that has disappeared is reported rather than ignored.
 *
 * **One stage is new: `field-rule`.** 0.3.0 added a *label* — which membership rule built F — and a
 * divergence in the label is a discrete outcome that sits above every colour in pipeline order,
 * because it decides the population every later rank is read over. `attribute.ts` predates the label
 * on the perturbation arms and never had it. It is inserted after `escape` and before
 * `ends-collapsed`, which is where the pipeline actually decides it.
 *
 * ## What the pair rows carry that the perturbation rows never had to
 *
 * A perturbation pair is the same image twice: same width, same height, same pixel grid. A rendition
 * pair is two *files* of the same artwork, and 172 of the 200 pairs in `pair-set-1` differ in
 * resolution. So each row carries both sides' `longEdge`, the β-quantile depth in the transform's own
 * pixels (`depthThresholdPx`) and as a fraction of the long edge (`depthThreshold`), and which
 * membership rule fired. That is exactly the pair of quantities `DEGENERATE_DEPTH_FLOOR_PX`'s
 * comparison is between.
 */

import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"

import { colorDistance, colorFromHex, sameColorBar } from "../../../../src/contract/color.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = any

type Selected = {
	trialId: string
	kind: string
	arm: string | null
	artworkId: string
	reviewedness: string
	leftPath: string
	rightPath: string
	disagreeingRoles: string[]
	rolesMoved: number
	allFour: boolean
	worstRole: string
	worstMove: number
	worstFrom: string
	worstTo: string
	selection: string
}

const [pairsPath, perturbPath, diagDir, outPath, coverageDiagDir] = process.argv.slice(2)
if (!pairsPath || !perturbPath || !diagDir || !outPath) {
	console.error(
		"usage: pairs-attribute.ts <pairs-selected.json> <perturb-selected.json> <diag-dir> <out.json> [coverage-diag-dir]",
	)
	process.exit(2)
}

const keyOf = (imagePath: string): string => createHash("sha1").update(imagePath).digest("hex").slice(0, 24)

async function loadChain(imagePath: string): Promise<Chain | null> {
	try {
		return JSON.parse(await readFile(path.join(diagDir, `${keyOf(imagePath)}.json`), "utf8"))
	} catch {
		return null
	}
}

/** The harness's own verdict, applied to an intermediate pixel's colour: regional bar, strict less-than. */
function sameColor(left: string | null, right: string | null): boolean {
	if (left === null || right === null) return left === right
	const a = colorFromHex(left)
	const b = colorFromHex(right)
	return colorDistance(a, b) < sameColorBar(a, b)
}

function colorGap(left: string | null, right: string | null): number | null {
	if (left === null || right === null) return null
	return colorDistance(colorFromHex(left), colorFromHex(right))
}

type StageTest = { stage: string; differs: (a: Chain, b: Chain) => boolean; detail: (a: Chain, b: Chain) => string }

const get = (chain: Chain, dotted: string): unknown =>
	dotted
		.split(".")
		.reduce<unknown>(
			(node, key) => (node === null || node === undefined ? undefined : (node as Record<string, unknown>)[key]),
			chain,
		)

function scalarStage(stage: string, dotted: string): StageTest {
	return {
		stage,
		differs: (a, b) => get(a, dotted) !== get(b, dotted),
		detail: (a, b) => `${dotted}: ${String(get(a, dotted))} → ${String(get(b, dotted))}`,
	}
}

function colorStage(stage: string, dotted: string): StageTest {
	return {
		stage,
		differs: (a, b) => !sameColor(get(a, dotted) as string | null, get(b, dotted) as string | null),
		detail: (a, b) => {
			const left = get(a, dotted) as string | null
			const right = get(b, dotted) as string | null
			const gap = colorGap(left, right)
			return `${dotted}: ${left} → ${right}${gap === null ? "" : ` (ΔOKLab ${gap.toFixed(3)})`}`
		},
	}
}

const STAGES: StageTest[] = [
	scalarStage("escape", "steps.escaped"),
	scalarStage("field-rule", "fieldSet.rule"),
	scalarStage("ends-collapsed", "ends.collapsed"),
	colorStage("e1-colour", "ends.e1Hex"),
	colorStage("e2-colour", "ends.e2Hex"),
	scalarStage("prevalence-order", "prevalence.farIsBackground"),
	scalarStage("ends-step", "ends.endsStep"),
	scalarStage("gradient-flag", "gradient.isGradient"),
	scalarStage("gradient-geometry", "gradient.geometry"),
	scalarStage("guide-stops", "gradient.stops"),
	scalarStage("fg-regime", "foreground.regime"),
	scalarStage("fg-band", "foreground.polarityBand"),
	scalarStage("fg-band-rule", "foreground.polarityDecidedBy"),
	scalarStage("fg-cursor", "foreground.cursor"),
	colorStage("fg-cascade", "foreground.hex"),
	scalarStage("accent-collapse", "accent.collapsed"),
	scalarStage("accent-tier", "accent.tier"),
	scalarStage("accent-cursor", "accent.cursor"),
	colorStage("accent-cascade", "accent.hex"),
]

/** Both sides' membership rule, as the three-way cell the cross-tab is built on. */
function firingCell(a: Chain, b: Chain): "one-side-only" | "both" | "neither" | "unknown" {
	const left = a?.fieldSet?.rule
	const right = b?.fieldSet?.rule
	if (left === undefined || right === undefined) return "unknown"
	const leftFired = left === "degenerate-depth"
	const rightFired = right === "degenerate-depth"
	if (leftFired !== rightFired) return "one-side-only"
	return leftFired ? "both" : "neither"
}

async function attribute(rows: Selected[]) {
	const out: Record<string, unknown>[] = []
	let missing = 0
	for (const trial of rows) {
		const a = await loadChain(trial.leftPath)
		const b = await loadChain(trial.rightPath)
		if (a === null || b === null) {
			out.push({ ...trial, stage: "MISSING-DIAGNOSTIC", detail: "", firing: "unknown" })
			missing += 1
			continue
		}
		let stage = "none-of-the-above"
		let detail = ""
		for (const test of STAGES) {
			if (test.differs(a, b)) {
				stage = test.stage
				detail = test.detail(a, b)
				break
			}
		}
		out.push({
			...trial,
			stage,
			detail,
			firing: firingCell(a, b),
			widthLeft: a.decode?.width,
			heightLeft: a.decode?.height,
			widthRight: b.decode?.width,
			heightRight: b.decode?.height,
			longEdgeLeft: a.fieldSet?.longEdge,
			longEdgeRight: b.fieldSet?.longEdge,
			sameResolution: a.fieldSet?.longEdge === b.fieldSet?.longEdge,
			fieldRuleLeft: a.fieldSet?.rule,
			fieldRuleRight: b.fieldSet?.rule,
			depthThresholdLeft: a.fieldSet?.depthThreshold,
			depthThresholdRight: b.fieldSet?.depthThreshold,
			depthThresholdPxLeft: a.fieldSet?.depthThresholdPx,
			depthThresholdPxRight: b.fieldSet?.depthThresholdPx,
			depthFloorMode: a.fieldSet?.depthFloorMode,
			edgeFractionLeft: a.edges?.edgeFraction,
			edgeFractionRight: b.edges?.edgeFraction,
			fieldSizeFractionLeft: a.fieldSet?.sizeFraction,
			fieldSizeFractionRight: b.fieldSet?.sizeFraction,
			fieldSizeLeft: a.fieldSet?.size,
			fieldSizeRight: b.fieldSet?.size,
			e1LLeft: a.ends?.e1L,
			e1LRight: b.ends?.e1L,
			e2LLeft: a.ends?.e2L,
			e2LRight: b.ends?.e2L,
			e1HexLeft: a.ends?.e1Hex,
			e1HexRight: b.ends?.e1Hex,
			e2HexLeft: a.ends?.e2Hex,
			e2HexRight: b.ends?.e2Hex,
			escapedLeft: a.steps?.escaped,
			escapedRight: b.steps?.escaped,
		})
	}
	return { rows: out, missing }
}

const pairsFile = JSON.parse(await readFile(pairsPath, "utf8")) as {
	pairs: Selected[]
	counts: { strataSizes?: Record<string, number>; allocation?: Record<string, number> }
}
const pairsFileCounts = pairsFile.counts
const perturbFile = JSON.parse(await readFile(perturbPath, "utf8")) as { trials: Selected[] }
const pairs = await attribute(pairsFile.pairs)
const perturbs = await attribute(perturbFile.trials)

// ---- tables -----------------------------------------------------------------------------------
type Counter = Map<string, number>
const bump = (map: Counter, key: string): void => void map.set(key, (map.get(key) ?? 0) + 1)

function stageTable(rows: Record<string, unknown>[]) {
	const total: Counter = new Map()
	const allFour: Counter = new Map()
	for (const row of rows) {
		bump(total, row.stage as string)
		if (row.allFour) bump(allFour, row.stage as string)
	}
	const order = STAGES.map((s) => s.stage).concat(["none-of-the-above", "MISSING-DIAGNOSTIC"])
	return order
		.filter((s) => total.has(s))
		.map((stage) => ({ stage, total: total.get(stage)!, allFour: allFour.get(stage) ?? 0 }))
}

function crossTab(rows: Record<string, unknown>[]) {
	const cells: Record<string, { allFour: number; notAllFour: number }> = {
		"one-side-only": { allFour: 0, notAllFour: 0 },
		both: { allFour: 0, notAllFour: 0 },
		neither: { allFour: 0, notAllFour: 0 },
		unknown: { allFour: 0, notAllFour: 0 },
	}
	for (const row of rows) {
		const cell = cells[row.firing as string]
		if (row.allFour) cell.allFour += 1
		else cell.notAllFour += 1
	}
	return cells
}

/**
 * Which of the two quantities the floor could be compared against is the more rendition-stable one.
 *
 * The floor is a comparison between the β-quantile depth and a constant. Expressed in pixels the
 * quantity is `depthThresholdPx`; expressed scale-free it is `depthThreshold`. Whichever of the two
 * moves *less* between the two renditions of the same artwork is the one a fixed constant can be
 * compared against without the comparison depending on which file the artwork arrived in. Reported as
 * the median absolute log ratio between the two sides, over the pairs where both sides are non-zero.
 */
function stability(rows: Record<string, unknown>[], leftKey: string, rightKey: string) {
	const logs: number[] = []
	for (const row of rows) {
		const left = row[leftKey] as number | undefined
		const right = row[rightKey] as number | undefined
		if (typeof left !== "number" || typeof right !== "number" || left <= 0 || right <= 0) continue
		logs.push(Math.abs(Math.log(left / right)))
	}
	logs.sort((a, b) => a - b)
	const at = (q: number) => logs[Math.min(logs.length - 1, Math.max(0, Math.round(q * (logs.length - 1))))]
	return { n: logs.length, median: at(0.5), p90: at(0.9), max: logs.length ? logs[logs.length - 1] : null }
}

/**
 * **Is a scalar's drift between two renditions explained by their resolution ratio?**
 *
 * Regress `log(left/right)` of the scalar on `log(longEdgeLeft/longEdgeRight)`. A slope near 0 with a
 * near-zero correlation says the scalar is scale-free in practice — it drifts, but not *because* the
 * two files are different sizes. A slope near 1 says the scalar is proportional to the pixel grid, so
 * a constant compared against it in pixels is really a comparison against resolution.
 */
function resolutionCoupling(rows: Record<string, unknown>[], leftKey: string, rightKey: string) {
	const points: [number, number][] = []
	for (const row of rows) {
		const le = row.longEdgeLeft as number | undefined
		const re = row.longEdgeRight as number | undefined
		const left = row[leftKey] as number | undefined
		const right = row[rightKey] as number | undefined
		if (!le || !re || typeof left !== "number" || typeof right !== "number" || left <= 0 || right <= 0) continue
		points.push([Math.log(le / re), Math.log(left / right)])
	}
	const n = points.length
	if (n < 3) return { n, correlation: null, slope: null }
	const mx = points.reduce((s, p) => s + p[0], 0) / n
	const my = points.reduce((s, p) => s + p[1], 0) / n
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (const [x, y] of points) {
		sxy += (x - mx) * (y - my)
		sxx += (x - mx) ** 2
		syy += (y - my) ** 2
	}
	return { n, correlation: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx }
}

/**
 * **The counterfactual the fix candidate rests on**, computed from the chains without re-running the
 * pipeline: for each trial, which membership rule *would* each side have taken under the pixel floor
 * and under the scale-free floor, and do the two sides then agree?
 *
 * `pixelFloorPx` and `fractionFloor` are the two constants; the fraction is count-preserving on the
 * 220-artwork coverage sweep (see `constants.ts`). A fix that removes the cross-rendition asymmetry
 * must lower `disagrees` — if it does not, the asymmetry is not in the floor's units.
 */
function floorCounterfactual(rows: Record<string, unknown>[], pixelFloorPx: number, fractionFloor: number) {
	let pixelDisagrees = 0
	let fractionDisagrees = 0
	let lowerResolutionFires = 0
	let higherResolutionFires = 0
	let sameResolutionFires = 0
	for (const row of rows) {
		const tl = row.depthThresholdLeft as number
		const tr = row.depthThresholdRight as number
		const le = row.longEdgeLeft as number
		const re = row.longEdgeRight as number
		if (typeof tl !== "number" || typeof tr !== "number" || !le || !re) continue
		const pixelLeft = tl * le <= pixelFloorPx
		const pixelRight = tr * re <= pixelFloorPx
		if (pixelLeft !== pixelRight) {
			pixelDisagrees += 1
			// Which side of the pair took the fallback: the smaller file, or the larger one?
			const firingLongEdge = pixelLeft ? le : re
			const otherLongEdge = pixelLeft ? re : le
			if (firingLongEdge < otherLongEdge) lowerResolutionFires += 1
			else if (firingLongEdge > otherLongEdge) higherResolutionFires += 1
			else sameResolutionFires += 1
		}
		if ((tl <= fractionFloor) !== (tr <= fractionFloor)) fractionDisagrees += 1
	}
	return {
		pixelFloorPx,
		fractionFloor,
		pixelDisagrees,
		fractionDisagrees,
		firingSide: { lowerResolution: lowerResolutionFires, higherResolution: higherResolutionFires, sameResolution: sameResolutionFires },
	}
}

const PIXEL_FLOOR_PX = 1
const FRACTION_FLOOR = 1 / 320

/**
 * **The projection back onto all 182 disagreeing pairs.**
 *
 * The 84 selected rows are not a simple random sample: the all-four flips are a *census* (54 of 54,
 * weight 1) and the rest are sampled inside three strata. Reading the cross-tab's raw counts as if
 * they were a sample would over-state every all-four cell by construction, so each row carries the
 * number of pairs it stands for — stratum size ÷ rows drawn from it — and the projected table below is
 * the one that may be compared with the 182/54 population figures. Projected counts are estimates
 * with the sampling error of a 30-of-128 draw; the all-four column is exact.
 */
function weightOf(row: Record<string, unknown>): number {
	const sizes = (pairsFileCounts.strataSizes ?? {}) as Record<string, number>
	const allocation = (pairsFileCounts.allocation ?? {}) as Record<string, number>
	const selection = row.selection as string
	if (selection === "all-four-census") return 1
	const stratum = selection.replace("stratified-", "")
	const drawn = allocation[stratum]
	const size = sizes[stratum]
	return drawn && size ? size / drawn : 1
}

function projectedCrossTab(rows: Record<string, unknown>[]) {
	const cells: Record<string, { allFour: number; notAllFour: number }> = {
		"one-side-only": { allFour: 0, notAllFour: 0 },
		both: { allFour: 0, notAllFour: 0 },
		neither: { allFour: 0, notAllFour: 0 },
	}
	for (const row of rows) {
		const cell = cells[row.firing as string]
		if (!cell) continue
		if (row.allFour) cell.allFour += 1
		else cell.notAllFour += weightOf(row)
	}
	for (const cell of Object.values(cells)) cell.notAllFour = Math.round(cell.notAllFour * 10) / 10
	return cells
}

function projectedStageTable(rows: Record<string, unknown>[]) {
	const total = new Map<string, number>()
	const allFour = new Map<string, number>()
	for (const row of rows) {
		const stage = row.stage as string
		total.set(stage, (total.get(stage) ?? 0) + (row.allFour ? 1 : weightOf(row)))
		if (row.allFour) allFour.set(stage, (allFour.get(stage) ?? 0) + 1)
	}
	return STAGES.map((s) => s.stage)
		.concat(["none-of-the-above", "MISSING-DIAGNOSTIC"])
		.filter((s) => total.has(s))
		.map((stage) => ({
			stage,
			projectedTotal: Math.round(total.get(stage)! * 10) / 10,
			allFour: allFour.get(stage) ?? 0,
		}))
}

/**
 * **Can *any* placement of this floor be rendition-stable?**
 *
 * The counterfactual above compares two constants. This sweeps both forms across the whole usable
 * range and reports, for each cut, how much of the corpus the fallback fires on (the 220 coverage
 * chains) against how many of the 84 pairs then take different membership rules on the two sides.
 *
 * The two ends of the sweep are degenerate and must be read as such: a floor that never fires and a
 * floor that always fires both have zero disagreement and neither is a rule. The number that matters
 * is the disagreement at cuts that fire on a *nameable minority* of covers, which is what a
 * "degenerate case" clause is supposed to be.
 */
function floorSweep(
	rows: Record<string, unknown>[],
	coverage: { threshold: number; longEdge: number }[],
) {
	const pixelCuts = [0.5, 1, 1.5, 2, 2.25, 3, 4, 5, 6, 8, 12, 20]
	const fractionCuts = [1 / 1280, 1 / 640, 1 / 450, 1 / 320, 1 / 226, 1 / 160, 1 / 113, 1 / 80, 1 / 40, 1 / 20]
	const run = (cuts: number[], pixels: boolean) =>
		cuts.map((cut) => {
			const firing = coverage.filter((c) => (pixels ? c.threshold * c.longEdge <= cut : c.threshold <= cut)).length
			const disagreeing = rows.filter((row) => {
				const left = pixels ? (row.depthThresholdPxLeft as number) : (row.depthThresholdLeft as number)
				const right = pixels ? (row.depthThresholdPxRight as number) : (row.depthThresholdRight as number)
				return (left <= cut) !== (right <= cut)
			}).length
			return {
				cut: pixels ? `${cut}px` : `1/${Math.round(1 / cut)}`,
				coverageFiring: firing,
				coverageTotal: coverage.length,
				pairRuleDisagreements: disagreeing,
				pairsCompared: rows.length,
			}
		})
	return { pixelForm: run(pixelCuts, true), fractionForm: run(fractionCuts, false) }
}

let coverageChains: { threshold: number; longEdge: number }[] = []
if (coverageDiagDir) {
	const { readdir } = await import("node:fs/promises")
	for (const file of (await readdir(coverageDiagDir)).filter((f) => f.endsWith(".json"))) {
		const chain = JSON.parse(await readFile(path.join(coverageDiagDir, file), "utf8"))
		coverageChains.push({
			threshold: chain.fieldSet.depthThreshold,
			longEdge: chain.fieldSet.longEdge ?? Math.max(chain.decode.width, chain.decode.height),
		})
	}
}

/**
 * **The intervention, folded in when it has been run.**
 *
 * `robustness-pairs-0.3.0-control.json` and `robustness-pairs-0.3.0-scalefree.json` are two runs of
 * `src/robustness/check.ts --skip-perturbations` over the same working tree on the same day, the
 * second with `P3_DEPTH_FLOOR_MODE=scale-free`. Read here rather than transcribed, so the numbers in
 * `PAIRS_ATTRIBUTION.md` and the numbers in this JSON cannot drift apart. Absent files are reported
 * as `null`, never as zeros.
 */
async function readPairBlock(file: string) {
	try {
		const report = JSON.parse(await readFile(path.join(path.dirname(pairsPath), file), "utf8"))
		const histogram: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 }
		for (const trial of report.disagreements) histogram[String(trial.comparison.disagreeingRoles.length)] += 1
		return {
			file,
			agreed: report.overall.agreed,
			compared: report.overall.compared,
			rate: report.overall.rate,
			interval: report.overall.interval,
			disagreeing: report.disagreements.length,
			errored: report.errors.length,
			rolesMovedHistogram: histogram,
			disagreeingTrialIds: report.disagreements.map((t: { trialId: string }) => t.trialId),
		}
	} catch {
		return null
	}
}

const control = await readPairBlock("robustness-pairs-0.3.0-control.json")
const scaleFree = await readPairBlock("robustness-pairs-0.3.0-scalefree.json")
const fixCandidate = control && scaleFree
	? {
			candidateRule: "depth <= DEGENERATE_DEPTH_FLOOR_FRACTION (1/320), via P3_DEPTH_FLOOR_MODE=scale-free",
			shippedDefaultUnchanged: true,
			control: { ...control, disagreeingTrialIds: undefined },
			scaleFree: { ...scaleFree, disagreeingTrialIds: undefined },
			newlyAgreeing: control.disagreeingTrialIds.filter((id: string) => !scaleFree.disagreeingTrialIds.includes(id)).length,
			newlyDisagreeing: scaleFree.disagreeingTrialIds.filter((id: string) => !control.disagreeingTrialIds.includes(id)).length,
		}
	: null

const report = {
	what: "W11b — first-divergence attribution of the 0.3.0 rendition-pair disagreements, and the degenerate-depth-floor cross-tab",
	writtenAt: new Date().toISOString(),
	generatedBy: "prototypes/p3-fields/measurements/attribution/pairs-attribute.ts",
	sources: {
		pairsSelected: path.basename(pairsPath),
		perturbSelected: path.basename(perturbPath),
		diagDir,
	},
	pairs: {
		selected: pairs.rows.length,
		missingDiagnostic: pairs.missing,
		allFour: pairs.rows.filter((r) => r.allFour).length,
		differentResolution: pairs.rows.filter((r) => r.sameResolution === false).length,
		stageTable: stageTable(pairs.rows),
		projectedStageTable: projectedStageTable(pairs.rows),
		crossTab: crossTab(pairs.rows),
		projectedCrossTab: projectedCrossTab(pairs.rows),
		stageByFiring: (() => {
			const map: Record<string, Counter> = {}
			for (const row of pairs.rows) {
				const stage = row.stage as string
				map[stage] = map[stage] ?? new Map()
				bump(map[stage], row.firing as string)
			}
			return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Object.fromEntries(v)]))
		})(),
		quantityStability: {
			depthThresholdPx: stability(pairs.rows, "depthThresholdPxLeft", "depthThresholdPxRight"),
			depthThresholdFraction: stability(pairs.rows, "depthThresholdLeft", "depthThresholdRight"),
			edgeFraction: stability(pairs.rows, "edgeFractionLeft", "edgeFractionRight"),
			fieldSizeFraction: stability(pairs.rows, "fieldSizeFractionLeft", "fieldSizeFractionRight"),
		},
		resolutionCoupling: {
			depthThresholdPx: resolutionCoupling(pairs.rows, "depthThresholdPxLeft", "depthThresholdPxRight"),
			depthThresholdFraction: resolutionCoupling(pairs.rows, "depthThresholdLeft", "depthThresholdRight"),
			edgeFraction: resolutionCoupling(pairs.rows, "edgeFractionLeft", "edgeFractionRight"),
			fieldSizeFraction: resolutionCoupling(pairs.rows, "fieldSizeFractionLeft", "fieldSizeFractionRight"),
		},
		floorCounterfactual: floorCounterfactual(pairs.rows, PIXEL_FLOOR_PX, FRACTION_FLOOR),
		floorSweep: coverageChains.length > 0 ? floorSweep(pairs.rows, coverageChains) : null,
		fixCandidate,
		rows: pairs.rows,
	},
	perturbations: {
		selected: perturbs.rows.length,
		missingDiagnostic: perturbs.missing,
		sameResolution: perturbs.rows.filter((r) => r.sameResolution === true).length,
		crossTab: crossTab(perturbs.rows),
		stageTable: stageTable(perturbs.rows),
		quantityStability: {
			depthThresholdPx: stability(perturbs.rows, "depthThresholdPxLeft", "depthThresholdPxRight"),
			depthThresholdFraction: stability(perturbs.rows, "depthThresholdLeft", "depthThresholdRight"),
			edgeFraction: stability(perturbs.rows, "edgeFractionLeft", "edgeFractionRight"),
		},
		floorCounterfactual: floorCounterfactual(perturbs.rows, PIXEL_FLOOR_PX, FRACTION_FLOOR),
		rows: perturbs.rows,
	},
}

await writeFile(outPath, `${JSON.stringify(report, null, "\t")}\n`)

// ---- console: the same numbers the report carries ---------------------------------------------
console.log(`PAIRS — ${pairs.rows.length} selected, ${pairs.missing} missing diagnostic\n`)
console.log("stage                total  allFour")
for (const row of report.pairs.stageTable) {
	console.log(`${row.stage.padEnd(20)} ${String(row.total).padStart(5)}  ${String(row.allFour).padStart(7)}`)
}
console.log("\ncross-tab: degenerate rule firing × all-four flip")
console.log("firing          allFour  notAllFour  total")
for (const [cell, counts] of Object.entries(report.pairs.crossTab)) {
	const total = counts.allFour + counts.notAllFour
	if (total === 0) continue
	console.log(
		`${cell.padEnd(15)} ${String(counts.allFour).padStart(7)}  ${String(counts.notAllFour).padStart(10)}  ${String(total).padStart(5)}`,
	)
}
console.log("\nprojected onto all 182 disagreeing pairs")
console.log(JSON.stringify(report.pairs.projectedCrossTab))
console.log(JSON.stringify(report.pairs.projectedStageTable))
console.log("\nquantity stability across renditions (median |log ratio|, lower = more rendition-stable)")
console.log(JSON.stringify(report.pairs.quantityStability, null, 1))
console.log("\nresolution coupling (slope of log scalar-ratio on log longEdge-ratio; 0 = scale-free, 1 = proportional to the grid)")
console.log(JSON.stringify(report.pairs.resolutionCoupling, null, 1))
console.log("\nfloor counterfactual, pairs")
console.log(JSON.stringify(report.pairs.floorCounterfactual, null, 1))
if (report.pairs.floorSweep) {
	console.log("\nfloor sweep — cut, coverage firing, pair rule disagreements")
	for (const form of ["pixelForm", "fractionForm"] as const) {
		console.log(` ${form}`)
		for (const row of report.pairs.floorSweep[form]) {
			console.log(`   ${row.cut.padEnd(8)} ${String(row.coverageFiring).padStart(3)}/${row.coverageTotal}   ${String(row.pairRuleDisagreements).padStart(2)}/${row.pairsCompared}`)
		}
	}
}
console.log(`\nPERTURBATIONS — ${perturbs.rows.length} selected, ${report.perturbations.sameResolution} same-resolution`)
console.log(JSON.stringify(report.perturbations.crossTab))
console.log(JSON.stringify(report.perturbations.floorCounterfactual))
console.log(JSON.stringify(report.perturbations.quantityStability))
// ---- drift guard: the perturbation pass's stage names must all still exist here ------------------
try {
	const priorPath = path.join(path.dirname(pairsPath), "attribution-0.3.0.json")
	const prior = JSON.parse(await readFile(priorPath, "utf8")) as { stage: string }[]
	const known = new Set(STAGES.map((s) => s.stage).concat(["none-of-the-above", "MISSING-DIAGNOSTIC"]))
	const unknown = [...new Set(prior.map((row) => row.stage))].filter((stage) => !known.has(stage))
	console.log(
		unknown.length === 0
			? `\nstage taxonomy: every stage in ${path.basename(priorPath)} still exists here`
			: `\nSTAGE TAXONOMY DRIFT — ${path.basename(priorPath)} uses stages this file does not know: ${unknown.join(", ")}`,
	)
	if (unknown.length > 0) process.exitCode = 1
} catch {
	console.log("\nstage taxonomy: attribution-0.3.0.json not found beside the selection file, guard skipped")
}

if (fixCandidate) {
	console.log("\nfix candidate — pair block, control vs scale-free")
	console.log(JSON.stringify(fixCandidate, null, 1))
}

console.log(`\nwrote ${outPath}`)
