/**
 * W3 audit — independent re-derivation of the demo-20 scorecard.
 *
 * Reads a devloop run file, scores every published palette with the contract's own `scorePalette`,
 * and tallies pass/fail. Nothing here reads any claim; the counts come out of the run file and the
 * contract and from nothing else.
 *
 *     node --experimental-strip-types audit/rescore.ts <run.jsonl>
 */

import { readFile } from "node:fs/promises"
import { scorePalette } from "../../../src/contract/scorecard.ts"
import type { Palette } from "../../../src/contract/types.ts"

const path = process.argv[2]
if (path === undefined) throw new Error("usage: rescore.ts <run.jsonl>")

const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.length > 0)
let pass = 0
let fail = 0
let errored = 0
const failures: string[] = []

for (const line of lines) {
	const parsed = JSON.parse(line) as Record<string, unknown>
	if (parsed.kind !== "devloop-run-row") continue
	if (parsed.ok !== true || parsed.palette === null) {
		errored += 1
		continue
	}
	const palette = parsed.palette as Palette
	const { scorecard, result } = scorePalette(palette)
	if (result.valid) {
		pass += 1
		continue
	}
	fail += 1
	const codes = result.violations.map((violation) => `${violation.invariant}:${violation.code}`)
	failures.push(
		`  index ${String(parsed.index)}  ${String(parsed.imagePath).split("/").slice(-1)[0]}  ` +
			`valid=${String(scorecard.valid)}  ${[...new Set(codes)].join(", ")}`,
	)
}

console.log(`run: ${path}`)
console.log(`rows scored: ${pass + fail}   errored/skipped: ${errored}`)
console.log(`PASS ${pass}   FAIL ${fail}`)
if (failures.length > 0) {
	console.log("failing rows:")
	for (const entry of failures) console.log(entry)
}
