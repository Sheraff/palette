import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

/**
 * Per-function A/B, interleaved at process granularity.
 *
 * Whole-pipeline A/B stopped being able to resolve a 3-5% change once the machine started swinging
 * 15-20% within a single run (three sibling arms plus a sweep). This narrows the measurement to the
 * function that was actually edited: both trees are instrumented with the same `process.cpuUsage()`
 * brackets, run alternately A,B,A,B,..., and only the named frame's own CPU time is compared. The
 * enclosing noise still moves both arms, but it is no longer inside the number.
 *
 * The whole-pipeline total is reported alongside, so a change that speeds its own function up while
 * slowing something else down cannot hide.
 *
 * Usage: node ab-function.mjs <baseRoot> <headRoot> <rounds> <functionName>[,<functionName>...]
 */
const [baseRoot, headRoot, roundsArg, namesArg] = process.argv.slice(2)
if (!namesArg) throw new Error("usage: ab-function.mjs <baseRoot> <headRoot> <rounds> <names>")
const rounds = Number(roundsArg)
const names = namesArg.split(",")

for (const root of [baseRoot, headRoot]) {
	const build = spawnSync(process.execPath, [
		resolve(root, "research/v2-3-experiments/perf-pass-2/harness/instrument.mjs"),
		resolve(root, "instrumented"),
	], { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] })
	if (build.status !== 0) throw new Error(`instrumenting ${root} failed`)
}

function runOnce(root) {
	const result = spawnSync(process.execPath, [
		"--experimental-strip-types",
		resolve(root, "instrumented/research/v2-3-experiments/perf-pass-2/harness/profile-run.ts"),
	], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
		env: { ...process.env, VIPS_CONCURRENCY: "1", NODE_NO_WARNINGS: "1" },
	})
	if (result.status !== 0) throw new Error(`profile run in ${root} failed`)
	return JSON.parse(result.stdout)
}

const samples = { base: [], head: [] }
for (let round = 0; round < rounds; round += 1) {
	for (const [arm, root] of [["base", baseRoot], ["head", headRoot]]) {
		const report = runOnce(root)
		const byName = new Map(report.rows.map((row) => [row.name, row]))
		samples[arm].push({
			total: report.totalAlgoUs,
			values: names.map((name) => byName.get(name)?.self ?? 0),
		})
		process.stderr.write(`round ${round + 1} ${arm}: total ${(report.totalAlgoUs / 1000).toFixed(0)}ms\n`)
	}
}

const median = (values) => {
	const sorted = [...values].sort((first, second) => first - second)
	const middle = sorted.length >> 1
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const report = (label, pick) => {
	const base = samples.base.map(pick)
	const head = samples.head.map(pick)
	console.log(
		label.padEnd(46) +
		`${(median(base) / 1000).toFixed(0)}`.padStart(9) +
		`${(median(head) / 1000).toFixed(0)}`.padStart(9) +
		`${(median(base) / median(head)).toFixed(2)}x`.padStart(9) +
		`   base ${(Math.min(...base) / 1000).toFixed(0)}-${(Math.max(...base) / 1000).toFixed(0)}` +
		`  head ${(Math.min(...head) / 1000).toFixed(0)}-${(Math.max(...head) / 1000).toFixed(0)}`,
	)
}

console.log(`\nrounds=${rounds}   self CPU ms, median over rounds\n`)
console.log("frame".padEnd(46) + "base".padStart(9) + "head".padStart(9) + "ratio".padStart(9))
names.forEach((name, index) => report(name, (sample) => sample.values[index]))
report("(whole pipeline)", (sample) => sample.total)

/**
 * The same frames as a share of the process that measured them.
 *
 * A round where the machine was busy inflates the frame AND the total together, so the ratio of the
 * two is far steadier than either. This is the number to read when the absolute spreads overlap:
 * it answers "how much of the pipeline is this function" without asking the machine to hold still.
 */
console.log(`\nshare of that process's own pipeline total, %\n`)
console.log("frame".padEnd(46) + "base".padStart(9) + "head".padStart(9) + "ratio".padStart(9))
const shares = (arm, index) => samples[arm].map((sample) => 100 * sample.values[index] / sample.total)
names.forEach((name, index) => {
	const base = shares("base", index)
	const head = shares("head", index)
	console.log(
		name.padEnd(46) +
		median(base).toFixed(2).padStart(9) +
		median(head).toFixed(2).padStart(9) +
		`${(median(base) / median(head)).toFixed(2)}x`.padStart(9) +
		`   base ${Math.min(...base).toFixed(2)}-${Math.max(...base).toFixed(2)}` +
		`  head ${Math.min(...head).toFixed(2)}-${Math.max(...head).toFixed(2)}`,
	)
})
