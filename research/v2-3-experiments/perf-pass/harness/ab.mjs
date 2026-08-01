import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

/**
 * A/B benchmark, interleaved at process granularity.
 *
 * Arm A and arm B live in different source trees, so they cannot share one process; instead the
 * two are alternated A,B,A,B,... so any drift in machine load is charged to both arms equally.
 * That matters here because the development machine was running a background sweep — a
 * "run all of A, then all of B" design would have attributed load drift to the change.
 *
 * Usage: node ab.mjs <baseTreeRoot> <headTreeRoot> [rounds]
 * Each root is the directory that CONTAINS `research/v2-3` and `research/v2-3-experiments`.
 */
const [baseRoot, headRoot, roundsArg] = process.argv.slice(2)
const rounds = Number(roundsArg ?? 5)

function runOnce(root, tag) {
	const script = resolve(root, "research/v2-3-experiments/perf-pass/harness/bench.ts")
	const result = spawnSync(process.execPath, ["--experimental-strip-types", script], {
		encoding: "utf8",
		env: {
			...process.env,
			BENCH_RUNS: "1",
			BENCH_TAG: tag,
			VIPS_CONCURRENCY: "1",
			NODE_NO_WARNINGS: "1",
			PALETTE_IMAGES_ROOT: process.env.PALETTE_IMAGES_ROOT,
		},
	})
	if (result.status !== 0) throw new Error(`${tag} failed: ${result.stderr}`)
	return JSON.parse(result.stdout)
}

const perArm = { base: [], head: [] }
const perImage = { base: new Map(), head: new Map() }
for (let round = 0; round < rounds; round += 1) {
	for (const [arm, root] of [["base", baseRoot], ["head", headRoot]]) {
		const out = runOnce(root, arm)
		perArm[arm].push(out.totalAlgoMs)
		for (const row of out.rows) {
			if (!perImage[arm].has(row.image)) perImage[arm].set(row.image, [])
			perImage[arm].get(row.image).push(row.algoMs)
		}
		process.stderr.write(`round ${round + 1} ${arm}: ${out.totalAlgoMs}ms\n`)
	}
}

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = sorted.length >> 1
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

console.log(`\nrounds=${rounds}  (algorithm CPU time only, decode excluded)\n`)
console.log("image".padEnd(18) + "base ms".padStart(10) + "head ms".padStart(10) + "speedup".padStart(10))
for (const image of perImage.base.keys()) {
	const base = median(perImage.base.get(image))
	const head = median(perImage.head.get(image))
	console.log(image.padEnd(18) + base.toFixed(0).padStart(10) + head.toFixed(0).padStart(10) +
		`${(base / head).toFixed(2)}x`.padStart(10))
}
const baseTotal = median(perArm.base)
const headTotal = median(perArm.head)
console.log("-".repeat(48))
console.log("TOTAL".padEnd(18) + baseTotal.toFixed(0).padStart(10) + headTotal.toFixed(0).padStart(10) +
	`${(baseTotal / headTotal).toFixed(2)}x`.padStart(10))
console.log(`\nbase spread: ${Math.min(...perArm.base).toFixed(0)}-${Math.max(...perArm.base).toFixed(0)}ms`)
console.log(`head spread: ${Math.min(...perArm.head).toFixed(0)}-${Math.max(...perArm.head).toFixed(0)}ms`)
