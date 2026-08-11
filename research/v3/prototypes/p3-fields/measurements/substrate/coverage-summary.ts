/**
 * **Gate (f)**: coverage-220 read the same way `BASELINE-0.3.0.md` §3 reads it — rows, contract
 * scorecard, failing-invariant histogram, gradient rate, collapse rates, escape count — for one or
 * more dev-loop run files side by side.
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/measurements/substrate/coverage-summary.ts <run.jsonl> [more…]
 *
 * The scorecard is `src/contract/scorecard.ts` with no `source` option, exactly as the baseline ran
 * it, so a row cannot score differently here from how it scored there.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { scorePalette } from "../../../../src/contract/scorecard.ts"
import type { Palette } from "../../../../src/contract/types.ts"

type Row = {
	kind: string
	ok?: boolean
	imagePath?: string
	palette?: Palette | null
	error?: unknown
	computeMs?: number
}

type Summary = {
	file: string
	candidateId: string
	rows: number
	failed: number
	pass: number
	fail: number
	codes: Map<string, number>
	gradient: number
	stopHistogram: Map<number, number>
	surfaceCollapsed: number
	accentCollapsed: number
	escapes: number
	wallMs: number
	failing: string[]
}

async function summarise(file: string): Promise<Summary> {
	const lines = (await readFile(resolve(file), "utf8")).split("\n").filter((line) => line.length > 0)
	const summary: Summary = {
		file,
		candidateId: "?",
		rows: 0,
		failed: 0,
		pass: 0,
		fail: 0,
		codes: new Map(),
		gradient: 0,
		stopHistogram: new Map(),
		surfaceCollapsed: 0,
		accentCollapsed: 0,
		escapes: 0,
		wallMs: 0,
		failing: [],
	}
	for (const line of lines) {
		const row = JSON.parse(line) as Row & { candidateId?: string }
		if (row.kind === "devloop-run-header") {
			summary.candidateId = row.candidateId ?? "?"
			continue
		}
		if (row.kind !== "devloop-run-row") continue
		summary.rows += 1
		summary.wallMs += row.computeMs ?? 0
		if (row.ok !== true || !row.palette) {
			summary.failed += 1
			continue
		}
		const palette = row.palette
		const { scorecard } = scorePalette(palette)
		if (scorecard.valid) summary.pass += 1
		else {
			summary.fail += 1
			// Rows per code, not violations per code: `BASELINE-0.3.0.md` §3's histogram is "a row can
			// carry more than one code", and a single palette can break the same ramp check twice.
			const codes = [...new Set(scorecard.violations.map((violation) => violation.code))].sort()
			for (const code of codes) summary.codes.set(code, (summary.codes.get(code) ?? 0) + 1)
			summary.failing.push(`${row.imagePath?.split("/").slice(-2).join("/")}  ${codes.join(", ")}`)
		}
		if (palette.gradient) {
			summary.gradient += 1
			const stops = palette.gradient.stops.length
			summary.stopHistogram.set(stops, (summary.stopHistogram.get(stops) ?? 0) + 1)
		}
		if (palette.collapse.surfaceCollapsed) summary.surfaceCollapsed += 1
		if (palette.collapse.accentCollapsed) summary.accentCollapsed += 1
		if (palette.escape) summary.escapes += 1
	}
	return summary
}

const files = process.argv.slice(2).filter((argument) => !argument.startsWith("--"))
if (files.length === 0) {
	console.error("usage: coverage-summary.ts <run.jsonl> [more…]")
	process.exit(2)
}

const summaries: Summary[] = []
for (const file of files) summaries.push(await summarise(file))

const pct = (n: number, d: number) => `${n}/${d} (${((100 * n) / Math.max(1, d)).toFixed(1)}%)`

for (const s of summaries) {
	console.log(`\n=== ${s.file}  [${s.candidateId}]`)
	console.log(`rows ok ${s.rows - s.failed}  failed ${s.failed}   wall ${(s.wallMs / 1000).toFixed(1)} s of pipeline`)
	console.log(`scorecard PASS ${pct(s.pass, s.rows)}   FAIL ${pct(s.fail, s.rows)}`)
	console.log(
		`gradient ${pct(s.gradient, s.rows)}   stops ${
			[...s.stopHistogram].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")
		}`,
	)
	console.log(`surfaceCollapsed ${pct(s.surfaceCollapsed, s.rows)}   accentCollapsed ${pct(s.accentCollapsed, s.rows)}   escapes ${s.escapes}`)
	console.log(
		`codes  ${[...s.codes].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${n}× ${code}`).join("   ")}`,
	)
}
