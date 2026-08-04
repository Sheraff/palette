/**
 * Step 1 of the attribution: turn a robustness report into (a) the list of disagreeing pairs and
 * (b) a dev-loop set file holding every distinct image path either side of one.
 *
 * ```sh
 * node --experimental-strip-types prototypes/p3-fields/measurements/attribution/collect.ts \
 *   prototypes/p3-fields/measurements/robustness-p3-fields-0.2.0-smoke150.json \
 *   prototypes/p3-fields/measurements/attribution
 * ```
 *
 * Writes `pairs.json` and `paths.txt` next to each other. The set file is fed to the dev-loop runner
 * with `P3_DIAG` set, which is what actually produces the per-image decision chains.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Trial = {
	trialId: string
	arm: string | null
	artworkId: string
	leftPath: string
	rightPath: string
	comparison: {
		same: boolean
		disagreeingRoles: string[]
		worstRoleBarRatio: number
		comparisons: { role: string; left: string; right: string; distance: number; bar: number; same: boolean }[]
	} | null
}

const [reportPath, outDir] = process.argv.slice(2)
if (!reportPath || !outDir) {
	console.error("usage: collect.ts <robustness-report.json> <out-dir>")
	process.exit(2)
}

const report = JSON.parse(await readFile(reportPath, "utf8")) as { disagreements: Trial[] }
const pairs = report.disagreements.map((trial) => {
	const worst = trial.comparison!.comparisons.reduce(
		(left, right) => (right.distance > left.distance ? right : left),
	)
	return {
		trialId: trial.trialId,
		arm: trial.arm,
		artworkId: trial.artworkId,
		leftPath: trial.leftPath,
		rightPath: trial.rightPath,
		disagreeingRoles: trial.comparison!.disagreeingRoles,
		worstRoleBarRatio: trial.comparison!.worstRoleBarRatio,
		worstRole: worst.role,
		worstMove: worst.distance,
		worstFrom: worst.left,
		worstTo: worst.right,
	}
})

const paths = new Set<string>()
for (const pair of pairs) {
	paths.add(pair.leftPath)
	paths.add(pair.rightPath)
}

await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, "pairs.json"), `${JSON.stringify(pairs, null, "\t")}\n`)
await writeFile(
	path.join(outDir, "paths.txt"),
	`# every image either side of a disagreeing trial in ${path.basename(reportPath)}\n${[...paths].sort().join("\n")}\n`,
)
console.log(`${pairs.length} disagreeing pairs, ${paths.size} distinct images`)
