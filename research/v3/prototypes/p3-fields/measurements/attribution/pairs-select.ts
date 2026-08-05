/**
 * Step 1 of the **pair** attribution (W11b): pick the rendition pairs to diagnose, and emit one set
 * file holding every image either side of one.
 *
 * Every prior attribution pass (`ATTRIBUTION.md`, `attribution-0.3.0.json`) ran on the *perturbation*
 * arms. The 0.3.0 full sweep says rendition-pair agreement went **14.5 % → 9.0 %** while every
 * perturbation arm improved, and **54 of the 88 remaining all-four-role flips are pair flips**. This
 * file selects the pairs that pass is missing.
 *
 * ```sh
 * node --experimental-strip-types prototypes/p3-fields/measurements/attribution/pairs-select.ts \
 *   prototypes/p3-fields/measurements/robustness-p3-fields-0.3.0.json \
 *   prototypes/p3-fields/measurements/attribution
 * ```
 *
 * ## The selection rule, stated so it is reproducible without this file
 *
 * - **Census A — every all-four-role pair disagreement.** 54 of 182. No sampling: these are the
 *   catastrophes the task is about, and 54 is small enough to take whole.
 * - **Sample B — 30 of the remaining 128**, stratified by how many roles moved (1, 2 or 3), allocated
 *   by largest remainder (28 → 6, 46 → 11, 54 → 13), and inside each stratum taken at evenly spaced
 *   ranks of the stratum sorted by `trialId`: index `round(i·(n−1)/(k−1))` for `i = 0 … k−1`. No RNG,
 *   no seed, no hash — the rule is a function of the report alone, so a re-run of this file on the
 *   same report picks the same 84 pairs.
 * - **Sample C — 20 perturbation disagreements**, 5 per arm, chosen by the same evenly-spaced rank
 *   rule inside each arm sorted by `trialId`. These are the *same-resolution* control for task 4: a
 *   jpeg re-encode and a ±1-LSB dither change pixel values and never the pixel grid, so a rule that
 *   only fires one-side-only because of resolution cannot fire one-side-only here.
 *
 * Writes `pairs-selected-0.3.0.json`, `perturb-selected-0.3.0.json` and `pairs-paths-0.3.0.txt`
 * (one absolute image path per line, both sides of every selected trial, de-duplicated and sorted).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Comparison = {
	same: boolean
	disagreeingRoles: string[]
	worstRoleBarRatio: number
	comparisons: { role: string; left: string; right: string; distance: number; bar: number; same: boolean }[]
}
type Trial = {
	trialId: string
	kind: string
	arm: string | null
	artworkId: string
	reviewedness: string
	leftPath: string
	rightPath: string
	comparison: Comparison | null
}

const [reportPath, outDir] = process.argv.slice(2)
if (!reportPath || !outDir) {
	console.error("usage: pairs-select.ts <robustness-report.json> <out-dir>")
	process.exit(2)
}

const report = JSON.parse(await readFile(reportPath, "utf8")) as { disagreements: Trial[] }

/** `k` evenly spaced ranks of a sorted run of length `n`, endpoints included. Deterministic. */
function evenlySpaced<T>(sorted: readonly T[], k: number): T[] {
	const n = sorted.length
	if (k >= n) return [...sorted]
	if (k === 1) return [sorted[0]]
	const out: T[] = []
	for (let i = 0; i < k; i += 1) out.push(sorted[Math.round((i * (n - 1)) / (k - 1))])
	return out
}

function summarise(trial: Trial, selection: string) {
	const worst = trial.comparison!.comparisons.reduce((a, b) => (b.distance > a.distance ? b : a))
	return {
		trialId: trial.trialId,
		kind: trial.kind,
		arm: trial.arm,
		artworkId: trial.artworkId,
		reviewedness: trial.reviewedness,
		leftPath: trial.leftPath,
		rightPath: trial.rightPath,
		disagreeingRoles: trial.comparison!.disagreeingRoles,
		rolesMoved: trial.comparison!.disagreeingRoles.length,
		allFour: trial.comparison!.disagreeingRoles.length === 4,
		worstRoleBarRatio: trial.comparison!.worstRoleBarRatio,
		worstRole: worst.role,
		worstMove: worst.distance,
		worstFrom: worst.left,
		worstTo: worst.right,
		selection,
	}
}

// ---- A + B: rendition pairs -------------------------------------------------------------------
const pairTrials = report.disagreements.filter((t) => t.kind === "rendition-pair")
const allFour = pairTrials.filter((t) => t.comparison!.disagreeingRoles.length === 4)
const rest = pairTrials.filter((t) => t.comparison!.disagreeingRoles.length !== 4)

const strata = new Map<number, Trial[]>()
for (const trial of rest) {
	const n = trial.comparison!.disagreeingRoles.length
	strata.set(n, [...(strata.get(n) ?? []), trial])
}
const SAMPLE_B = 30
const keys = [...strata.keys()].sort((a, b) => a - b)
// Largest-remainder allocation of SAMPLE_B across the strata, proportional to stratum size.
const exact = keys.map((k) => ({ k, want: (strata.get(k)!.length * SAMPLE_B) / rest.length }))
const alloc = new Map(exact.map((e) => [e.k, Math.floor(e.want)]))
let short = SAMPLE_B - [...alloc.values()].reduce((a, b) => a + b, 0)
for (const e of [...exact].sort((a, b) => (b.want % 1) - (a.want % 1) || a.k - b.k)) {
	if (short <= 0) break
	alloc.set(e.k, alloc.get(e.k)! + 1)
	short -= 1
}

const sampled: Trial[] = []
for (const k of keys) {
	const sorted = [...strata.get(k)!].sort((a, b) => a.trialId.localeCompare(b.trialId))
	sampled.push(...evenlySpaced(sorted, alloc.get(k)!))
}

const selectedPairs = [
	...allFour
		.slice()
		.sort((a, b) => a.trialId.localeCompare(b.trialId))
		.map((t) => summarise(t, "all-four-census")),
	...sampled.map((t) => summarise(t, `stratified-${t.comparison!.disagreeingRoles.length}-role`)),
]

// ---- C: perturbation control ------------------------------------------------------------------
const perturbTrials = report.disagreements.filter((t) => t.kind !== "rendition-pair")
const byArm = new Map<string, Trial[]>()
for (const trial of perturbTrials) {
	const arm = trial.arm ?? "none"
	byArm.set(arm, [...(byArm.get(arm) ?? []), trial])
}
const PER_ARM = 5
const selectedPerturb = [...byArm.keys()]
	.sort()
	.flatMap((arm) =>
		evenlySpaced([...byArm.get(arm)!].sort((a, b) => a.trialId.localeCompare(b.trialId)), PER_ARM).map((t) =>
			summarise(t, `perturb-control-${arm}`),
		),
	)

// ---- output -----------------------------------------------------------------------------------
const paths = new Set<string>()
for (const row of [...selectedPairs, ...selectedPerturb]) {
	paths.add(row.leftPath)
	paths.add(row.rightPath)
}

await mkdir(outDir, { recursive: true })
await writeFile(
	path.join(outDir, "pairs-selected-0.3.0.json"),
	`${JSON.stringify(
		{
			what: "rendition pairs selected for the W11b pair attribution",
			source: path.basename(reportPath),
			rule: "all 54 all-four-role pairs + 30 stratified by roles-moved (largest remainder, evenly spaced ranks of trialId order)",
			counts: {
				pairDisagreements: pairTrials.length,
				allFour: allFour.length,
				rest: rest.length,
				sampled: sampled.length,
				allocation: Object.fromEntries([...alloc].map(([k, v]) => [`${k}-role`, v])),
				// The sampling weights the population projection needs: how many pairs each selected row
				// stands for. The all-four stratum is a census, so its weight is 1 by construction.
				strataSizes: Object.fromEntries([
					["all-four", allFour.length],
					...keys.map((k) => [`${k}-role`, strata.get(k)!.length] as const),
				]),
			},
			pairs: selectedPairs,
		},
		null,
		"\t",
	)}\n`,
)
await writeFile(
	path.join(outDir, "perturb-selected-0.3.0.json"),
	`${JSON.stringify(
		{
			what: "same-resolution perturbation control for the W11b pair attribution (task 4)",
			source: path.basename(reportPath),
			rule: "5 per arm, evenly spaced ranks of trialId order",
			counts: { perturbationDisagreements: perturbTrials.length, selected: selectedPerturb.length },
			trials: selectedPerturb,
		},
		null,
		"\t",
	)}\n`,
)
await writeFile(
	path.join(outDir, "pairs-paths-0.3.0.txt"),
	`# every image either side of a trial selected by pairs-select.ts from ${path.basename(reportPath)}\n${[...paths].sort().join("\n")}\n`,
)

console.log(
	`pairs: ${pairTrials.length} disagreeing, ${allFour.length} all-four, ${sampled.length} sampled ` +
		`(${[...alloc].map(([k, v]) => `${k}-role:${v}`).join(" ")}) → ${selectedPairs.length} selected`,
)
console.log(`perturbations: ${perturbTrials.length} disagreeing → ${selectedPerturb.length} selected`)
console.log(`${paths.size} distinct images`)
