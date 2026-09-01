import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The byte-identity gate: re-dump every extraction on the current tree and diff it, line by line,
 * against the stored baseline.
 *
 * The comparison is over the canonicalised **complete** `extractPaletteDetails` return value (see
 * `perf-pass/harness/dump.ts`), not the four winner hexes — a change that moved a float in a
 * `scores` block while leaving the hexes alone must fail this.
 *
 * Usage: node gate.mjs <baselineDir> <outDir> [--limit N]
 * `--limit N` runs the first N corpus entries only; that is an ITERATION aid, never a gate. Every
 * commit in this arm was gated at the full 108.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../../..")
const [baselineDir, outDir] = process.argv.slice(2)
if (!baselineDir || !outDir) throw new Error("usage: gate.mjs <baselineDir> <outDir> [--limit N]")
const limitFlag = process.argv.indexOf("--limit")
const extra = limitFlag === -1 ? [] : ["--limit", process.argv[limitFlag + 1]]

const run = spawnSync(process.execPath, [
	"--experimental-strip-types",
	resolve(repoRoot, "research/v2-3-experiments/perf-pass/harness/dump.ts"),
	outDir,
	...extra,
], { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, VIPS_CONCURRENCY: "1", NODE_NO_WARNINGS: "1" } })
if (run.status !== 0) throw new Error("dump failed")

const parse = (dir) => new Map(readFileSync(resolve(dir, "extractions.tsv"), "utf8")
	.split("\n").filter(Boolean).map((line) => {
		const tab = line.indexOf("\t")
		return [line.slice(0, tab), line.slice(tab + 1)]
	}))

const baseline = parse(baselineDir)
const head = parse(outDir)
let checked = 0
const differing = []
const missing = []
for (const [label, value] of head) {
	if (!baseline.has(label)) { missing.push(label); continue }
	checked += 1
	if (baseline.get(label) !== value) differing.push(label)
}
if (head.size === 0) throw new Error("gate produced no extractions")
console.log(`compared ${checked} extractions against ${baselineDir}`)
if (missing.length > 0) console.log(`NOT IN BASELINE (${missing.length}): ${missing.join(", ")}`)
if (differing.length === 0) {
	console.log(`GATE PASS: ${checked}/${checked} byte-identical`)
} else {
	console.log(`GATE FAIL: ${differing.length}/${checked} differ`)
	for (const label of differing.slice(0, 10)) console.log(`  ${label}`)
	process.exitCode = 1
}
