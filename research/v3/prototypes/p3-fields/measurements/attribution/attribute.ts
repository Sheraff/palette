/**
 * Step 2 of the attribution: for every disagreeing pair, find the **first** stage of the decision
 * chain at which the two sides stop agreeing.
 *
 * ```sh
 * node --experimental-strip-types prototypes/p3-fields/measurements/attribution/attribute.ts \
 *   <pairs.json> <diag-dir> <out.json>
 * ```
 *
 * ## What "diverge" means here, and why it cannot mean "differs"
 *
 * Almost every *continuous* quantity in the chain differs between a cover and its re-encode: the edge
 * count moves, the field-set size moves, every ρ moves in the fourth decimal. A table built on "differs"
 * would say `edges` 122 times and explain nothing. So divergence is defined only over the chain's
 * **discrete outcomes** — a boolean, a label, a rank cursor, or a *published pixel colour judged by the
 * contract's own regional same-colour bar*, which is the same ruler the robustness harness calls a
 * disagreement with. The stages are tested in pipeline order and the first one that fails is the
 * attributed stage; continuous quantities travel with the row as evidence, never as the verdict.
 *
 * The consequence to keep in view when reading the table: a stage is credited with a flip only when
 * every stage above it agreed. `fg-cascade` therefore means *the field ends, the gradient, the regime
 * and the band all agreed, and the cascade over the top-τ window still landed on a different colour* —
 * which is exactly the 0.2.0 hypothesis, stated as a countable thing.
 */

import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"

import { colorDistance, colorFromHex, sameColorBar } from "../../../../src/contract/color.ts"

type Pair = {
	trialId: string
	arm: string
	artworkId: string
	leftPath: string
	rightPath: string
	disagreeingRoles: string[]
	worstRole: string
	worstMove: number
	worstFrom: string
	worstTo: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = any

const [pairsPath, diagDir, outPath] = process.argv.slice(2)
if (!pairsPath || !diagDir || !outPath) {
	console.error("usage: attribute.ts <pairs.json> <diag-dir> <out.json>")
	process.exit(2)
}

function keyOf(imagePath: string): string {
	return createHash("sha1").update(imagePath).digest("hex").slice(0, 24)
}

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
	const a = colorFromHex(left)
	const b = colorFromHex(right)
	return colorDistance(a, b)
}

type StageTest = { stage: string; differs: (a: Chain, b: Chain) => boolean; detail: (a: Chain, b: Chain) => string }

const get = (chain: Chain, dotted: string): unknown =>
	dotted.split(".").reduce<unknown>((node, key) => (node === null || node === undefined ? undefined : (node as Record<string, unknown>)[key]), chain)

function scalarStage(stage: string, dotted: string, unit = ""): StageTest {
	return {
		stage,
		differs: (a, b) => get(a, dotted) !== get(b, dotted),
		detail: (a, b) => `${dotted}: ${String(get(a, dotted))} → ${String(get(b, dotted))}${unit}`,
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

/**
 * The chain, in pipeline order. Each entry is one discrete decision the algorithm makes; the first that
 * disagrees is the attributed stage.
 */
const STAGES: StageTest[] = [
	scalarStage("escape", "steps.escaped"),
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

/** Largest adjacent-decile gap of a top-τ L distribution, and how big it is against the spread. */
function bimodality(deciles: number[] | undefined): {
	spread: number
	largestGap: number
	ratio: number
	gapLo: number
	gapHi: number
} | null {
	if (!deciles || deciles.length < 2) return null
	const spread = deciles[deciles.length - 1] - deciles[0]
	let largestGap = -1
	let at = 0
	for (let i = 0; i + 1 < deciles.length; i += 1) {
		const gap = deciles[i + 1] - deciles[i]
		if (gap > largestGap) {
			largestGap = gap
			at = i
		}
	}
	return {
		spread,
		largestGap,
		ratio: spread > 0 ? largestGap / spread : 0,
		gapLo: deciles[at],
		gapHi: deciles[at + 1],
	}
}

const pairs = JSON.parse(await readFile(pairsPath, "utf8")) as Pair[]
const rows: Record<string, unknown>[] = []
let unresolved = 0

for (const pair of pairs) {
	const a = await loadChain(pair.leftPath)
	const b = await loadChain(pair.rightPath)
	if (a === null || b === null) {
		rows.push({ ...pair, stage: "MISSING-DIAGNOSTIC", detail: "" })
		unresolved += 1
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
	const left = bimodality(a.foreground?.topTauDeciles)
	const right = bimodality(b.foreground?.topTauDeciles)
	const leftL = a.foreground?.L as number | undefined
	const rightL = b.foreground?.L as number | undefined
	const crossed = (side: ReturnType<typeof bimodality>): boolean => {
		if (side === null || leftL === undefined || rightL === undefined) return false
		const mid = (side.gapLo + side.gapHi) / 2
		return (leftL < mid) !== (rightL < mid)
	}
	// Sub-attribution of the dominant stage: `e1` is the rank-(1−τ) pixel of OKLab distance from the
	// field's cascade pixel, so an `e1-colour` divergence is either the median moving under it or the
	// rank moving with the median fixed. Recorded for every row; only read where the stage is `e1`.
	const medianSame = sameColor(a.ends?.medianHex ?? null, b.ends?.medianHex ?? null)
	rows.push({
		...pair,
		stage,
		detail,
		medianSame,
		endsStepLeft: a.ends?.endsStep,
		endsStepRight: b.ends?.endsStep,
		worstMoveOfPair: pair.worstMove,
		medianHexLeft: a.ends?.medianHex,
		medianHexRight: b.ends?.medianHex,
		e1DistanceLeft: a.ends?.e1DistanceFromMedian,
		e1DistanceRight: b.ends?.e1DistanceFromMedian,
		fieldSetLeft: a.fieldSet?.size,
		fieldSetRight: b.fieldSet?.size,
		edgeFractionLeft: a.edges?.edgeFraction,
		edgeFractionRight: b.edges?.edgeFraction,
		prevalenceGapLeft: a.prevalence?.relativeGap,
		prevalenceGapRight: b.prevalence?.relativeGap,
		tieBandFiredLeft: a.prevalence?.tieBandFired,
		tieBandFiredRight: b.prevalence?.tieBandFired,
		fgRegimeLeft: a.foreground?.regime,
		fgRegimeRight: b.foreground?.regime,
		fgBandLeft: a.foreground?.polarityBand,
		fgBandRight: b.foreground?.polarityBand,
		fgPopulationLeft: a.foreground?.populationSize,
		fgPopulationRight: b.foreground?.populationSize,
		fgLLeft: leftL,
		fgLRight: rightL,
		bimodalLeft: left,
		bimodalRight: right,
		cascadeCrossedGapLeft: crossed(left),
		cascadeCrossedGapRight: crossed(right),
		allFour: pair.disagreeingRoles.length === 4,
	})
}

await writeFile(outPath, `${JSON.stringify(rows, null, "\t")}\n`)

// ---- the table, printed so the run's console is the same numbers the report carries ----
const arms = [...new Set(pairs.map((p) => p.arm))].sort()
const byStage = new Map<string, Record<string, number>>()
for (const row of rows) {
	const stage = row.stage as string
	const arm = row.arm as string
	const entry = byStage.get(stage) ?? { total: 0, allFour: 0 }
	entry.total += 1
	entry[arm] = (entry[arm] ?? 0) + 1
	if (row.allFour) entry.allFour += 1
	byStage.set(stage, entry)
}
const order = STAGES.map((s) => s.stage).concat(["none-of-the-above", "MISSING-DIAGNOSTIC"])
console.log(`stage${" ".repeat(14)}total  allFour  ${arms.map((a) => a.padEnd(12)).join("")}`)
for (const stage of order) {
	const entry = byStage.get(stage)
	if (!entry) continue
	console.log(
		`${stage.padEnd(18)} ${String(entry.total).padStart(4)}  ${String(entry.allFour).padStart(7)}  ` +
			arms.map((arm) => String(entry[arm] ?? 0).padEnd(12)).join(""),
	)
}
console.log(`\nrows: ${rows.length}, unresolved: ${unresolved}`)
