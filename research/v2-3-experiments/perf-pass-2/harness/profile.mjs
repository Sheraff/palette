import { spawnSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { buildInstrumentedTree } from "./instrument.mjs"

/**
 * Re-profiles the pipeline on the CURRENT tree by direct `process.cpuUsage()` bracketing.
 *
 * Pass 1's percentages are not reusable: it was a 1.55x change and its own §8 records that the
 * profile moved. Every number in the perf-pass-2 report comes from this script run against the tree
 * being reported on.
 *
 * The instrumented total is compared against the pristine tree's uninstrumented total for the same
 * 10 artworks, so the report can state its own instrumentation overhead rather than assume it away.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../../..")
if (!process.argv[2]) throw new Error("usage: profile.mjs <scratch-dir>")
const scratch = resolve(process.argv[2], "prof-tree")

buildInstrumentedTree(scratch)
const env = { ...process.env, VIPS_CONCURRENCY: "1", NODE_NO_WARNINGS: "1" }

const profiled = spawnSync(process.execPath, [
	"--experimental-strip-types",
	resolve(scratch, "research/v2-3-experiments/perf-pass-2/harness/profile-run.ts"),
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env })
if (profiled.status !== 0) throw new Error("instrumented profile run failed")
const report = JSON.parse(profiled.stdout)

const pristine = spawnSync(process.execPath, [
	"--experimental-strip-types",
	resolve(repoRoot, "research/v2-3-experiments/perf-pass/harness/bench.ts"),
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env: { ...env, BENCH_RUNS: "1", BENCH_TAG: "pristine" } })
if (pristine.status !== 0) throw new Error("pristine bench failed")
const pristineUs = JSON.parse(pristine.stdout).totalAlgoMs * 1000

const total = report.totalAlgoUs
const rows = report.rows.sort((first, second) => second.inclusive - first.inclusive)
console.log(`\ntotal instrumented extraction CPU: ${(total / 1000).toFixed(0)}ms over ${report.images} artworks`)
console.log(`pristine (uninstrumented) total:   ${(pristineUs / 1000).toFixed(0)}ms`)
console.log(`instrumentation overhead:          ${(100 * (total - pristineUs) / pristineUs).toFixed(1)}%\n`)
console.log("function".padEnd(58) + "incl%".padStart(8) + "self%".padStart(8) + "calls".padStart(10))
for (const row of rows) {
	console.log(
		row.name.padEnd(58) +
		`${(100 * row.inclusive / total).toFixed(1)}`.padStart(8) +
		`${(100 * row.self / total).toFixed(1)}`.padStart(8) +
		`${row.calls}`.padStart(10),
	)
}
