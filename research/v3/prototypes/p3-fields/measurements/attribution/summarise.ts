/**
 * Step 3: read `attribution-*.json` and print every number `ATTRIBUTION.md` quotes.
 *
 * ```sh
 * node --experimental-strip-types prototypes/p3-fields/measurements/attribution/summarise.ts \
 *   prototypes/p3-fields/measurements/attribution/attribution-k3.json
 * ```
 *
 * Three sections: the stage × arm table, three concrete examples for each of the top three stages,
 * and the bimodal-cascade probe over the ten worst disagreements.
 *
 * ## The one declared threshold in this file
 *
 * `GAP_RATIO` — how large the biggest adjacent-decile step of the top-τ L distribution has to be,
 * relative to that distribution's whole spread, before the population is called *bimodal* rather than
 * merely wide. **[UNCALIBRATED] — 0.25, chosen here**, on the arithmetic that a uniform population puts
 * ≈ 0.10 of its spread between adjacent deciles, so 0.25 is two and a half times the flat expectation.
 * It is a reading convention for one probe, it is quoted with the raw ratios beside it in every row, and
 * nothing in the prototype consumes it.
 */

import { readFile } from "node:fs/promises"

const GAP_RATIO = 0.25

type Row = {
	trialId: string
	arm: string
	artworkId: string
	stage: string
	detail: string
	disagreeingRoles: string[]
	worstRole: string
	worstMove: number
	worstFrom: string
	worstTo: string
	allFour: boolean
	edgeFractionLeft: number
	edgeFractionRight: number
	fgRegimeLeft: string
	fgRegimeRight: string
	fgBandLeft: string | null
	fgBandRight: string | null
	fgPopulationLeft: number
	fgPopulationRight: number
	fgLLeft: number
	fgLRight: number
	bimodalLeft: { spread: number; largestGap: number; ratio: number; gapLo: number; gapHi: number } | null
	bimodalRight: { spread: number; largestGap: number; ratio: number; gapLo: number; gapHi: number } | null
	cascadeCrossedGapLeft: boolean
	cascadeCrossedGapRight: boolean
	medianSame: boolean
	endsStepLeft: number
	endsStepRight: number
	e1DistanceLeft: number
	e1DistanceRight: number
	fieldSetLeft: number
	fieldSetRight: number
}

const [rowsPath] = process.argv.slice(2)
const rows = JSON.parse(await readFile(rowsPath, "utf8")) as Row[]
const arms = [...new Set(rows.map((r) => r.arm))].sort()

// ---- 1. the table ----------------------------------------------------------------------------
const stages = [...new Set(rows.map((r) => r.stage))]
const counted = stages
	.map((stage) => {
		const at = rows.filter((r) => r.stage === stage)
		return {
			stage,
			total: at.length,
			allFour: at.filter((r) => r.allFour).length,
			byArm: Object.fromEntries(arms.map((arm) => [arm, at.filter((r) => r.arm === arm).length])),
		}
	})
	.sort((left, right) => right.total - left.total)

console.log("## stage x arm (first divergence)\n")
console.log(`| stage | total | all-four flips | ${arms.join(" | ")} |`)
console.log(`|---|---|---|${arms.map(() => "---|").join("")}`)
for (const entry of counted) {
	console.log(
		`| \`${entry.stage}\` | ${entry.total} | ${entry.allFour} | ${arms.map((a) => entry.byArm[a]).join(" | ")} |`,
	)
}
console.log(`\ntotal rows ${rows.length}; all-four flips ${rows.filter((r) => r.allFour).length}\n`)

// ---- 2. examples for the top three stages ----------------------------------------------------
console.log("## examples, top three stages\n")
for (const entry of counted.slice(0, 3)) {
	console.log(`### \`${entry.stage}\` (${entry.total})\n`)
	const examples = rows
		.filter((r) => r.stage === entry.stage)
		.sort((left, right) => right.worstMove - left.worstMove)
		.slice(0, 3)
	for (const example of examples) {
		console.log(
			`- \`${example.artworkId}\` / \`${example.arm}\` — ${example.detail}; ` +
				`published ${example.worstRole} ${example.worstFrom} → ${example.worstTo} ` +
				`(ΔOKLab ${example.worstMove.toFixed(3)}), roles moved ${example.disagreeingRoles.join("+")}; ` +
				`edge fraction ${(example.edgeFractionLeft * 100).toFixed(2)}% → ${(example.edgeFractionRight * 100).toFixed(2)}%`,
		)
	}
	console.log("")
}

// ---- 3. the bimodal-cascade probe ------------------------------------------------------------
const worst = [...rows].sort((left, right) => right.worstMove - left.worstMove).slice(0, 10)
console.log("## bimodal-cascade probe, ten worst disagreements\n")
console.log(
	"| # | artwork | arm | stage | worst move | top-τ n (L/R) | gap/spread (L) | gap/spread (R) | fg L (L→R) | crossed the gap |",
)
console.log("|---|---|---|---|---|---|---|---|---|---|")
let bimodalAndCrossed = 0
let bimodalEither = 0
worst.forEach((row, index) => {
	const left = row.bimodalLeft
	const right = row.bimodalRight
	const bimodal = (left !== null && left.ratio >= GAP_RATIO) || (right !== null && right.ratio >= GAP_RATIO)
	const crossed = row.cascadeCrossedGapLeft || row.cascadeCrossedGapRight
	if (bimodal) bimodalEither += 1
	if (bimodal && crossed) bimodalAndCrossed += 1
	console.log(
		`| ${index + 1} | \`${row.artworkId.slice(0, 12)}\` | ${row.arm} | \`${row.stage}\` | ` +
			`${row.worstMove.toFixed(3)} | ${row.fgPopulationLeft}/${row.fgPopulationRight} | ` +
			`${left === null ? "—" : left.ratio.toFixed(2)} | ${right === null ? "—" : right.ratio.toFixed(2)} | ` +
			`${row.fgLLeft?.toFixed(3)}→${row.fgLRight?.toFixed(3)} | ${crossed ? "yes" : "no"}${bimodal ? " (bimodal)" : ""} |`,
	)
})
console.log(
	`\nof the ten worst: ${bimodalEither} have a top-τ population with gap/spread ≥ ${GAP_RATIO} on at least one side; ` +
		`${bimodalAndCrossed} of those also have the cascade landing on opposite sides of that gap.`,
)

// the same probe over every row, so the ten are read against the population they came from
const allBimodal = rows.filter((r) => (r.bimodalLeft?.ratio ?? 0) >= GAP_RATIO || (r.bimodalRight?.ratio ?? 0) >= GAP_RATIO)
const allCrossed = allBimodal.filter((r) => r.cascadeCrossedGapLeft || r.cascadeCrossedGapRight)
const cascadeStage = rows.filter((r) => r.stage === "fg-cascade")
const cascadeBimodal = cascadeStage.filter(
	(r) => (r.bimodalLeft?.ratio ?? 0) >= GAP_RATIO || (r.bimodalRight?.ratio ?? 0) >= GAP_RATIO,
)
console.log(
	`\nover all ${rows.length} disagreeing pairs: ${allBimodal.length} bimodal by this test, ` +
		`${allCrossed.length} of them with the cascade crossing the gap.`,
)
console.log(
	`of the ${cascadeStage.length} pairs attributed to \`fg-cascade\`: ${cascadeBimodal.length} bimodal, ` +
		`${cascadeBimodal.filter((r) => r.cascadeCrossedGapLeft || r.cascadeCrossedGapRight).length} with the cascade crossing.`,
)

// ---- 4. what actually moved at the dominant stage --------------------------------------------
const e1 = rows.filter((r) => r.stage === "e1-colour")
console.log(`\n## \`e1-colour\` detail (${e1.length} rows)\n`)
const moves = e1.map((r) => Number(/ΔOKLab ([0-9.]+)/.exec(r.detail)?.[1] ?? 0)).sort((a, b) => a - b)
const q = (p: number): number => moves[Math.min(moves.length - 1, Math.round(p * (moves.length - 1)))]
console.log(
	`e1 movement ΔOKLab: p10 ${q(0.1).toFixed(3)}, median ${q(0.5).toFixed(3)}, p90 ${q(0.9).toFixed(3)}, max ${q(1).toFixed(3)}`,
)
console.log(`e1 rows over 0.5 OKLab: ${moves.filter((m) => m > 0.5).length}`)
console.log(`e1 rows that are all-four flips: ${e1.filter((r) => r.allFour).length}`)
const medianMoved = e1.filter((r) => r.medianSame === false)
console.log(
	`of the ${e1.length}: the field's own cascade pixel m also moved in ${medianMoved.length}, ` +
		`and held (same colour by the bar) in ${e1.length - medianMoved.length} — the latter are the rank moving under a fixed median.`,
)
console.log(
	`of the ${e1.length}: the ends *also* stepped differently (endsStep differs) in ` +
		`${e1.filter((r) => r.endsStepLeft !== r.endsStepRight).length} — reported because the stage order tests the ` +
		`colour before the step, so those rows have two candidate causes and are credited to the colour.`,
)
const e1worst = e1.map((r) => r.worstMove).sort((x, y) => x - y)
console.log(
	`published worst-role movement on \`e1-colour\` rows: median ${e1worst[Math.floor(e1worst.length / 2)].toFixed(3)}, ` +
		`p90 ${e1worst[Math.floor(e1worst.length * 0.9)].toFixed(3)}, max ${e1worst[e1worst.length - 1].toFixed(3)} OKLab`,
)
const e1dist = e1.map((r) => Math.abs((r.e1DistanceLeft ?? 0) - (r.e1DistanceRight ?? 0))).sort((x, y) => x - y)
console.log(
	`|Δ| of the (1−τ) rank's own distance value: median ${e1dist[Math.floor(e1dist.length / 2)].toFixed(4)}, ` +
		`max ${e1dist[e1dist.length - 1].toFixed(4)}`,
)
const fieldDrift = e1
	.map((r) => Math.abs((r.fieldSetLeft ?? 0) - (r.fieldSetRight ?? 0)) / Math.max(1, r.fieldSetLeft ?? 1))
	.sort((x, y) => x - y)
console.log(
	`field-set size drift |Δ|/left: median ${(fieldDrift[Math.floor(fieldDrift.length / 2)] * 100).toFixed(1)}%, ` +
		`max ${(fieldDrift[fieldDrift.length - 1] * 100).toFixed(1)}%`,
)
