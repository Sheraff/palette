/**
 * W-VERIFY step 3 — independent scorecard spot-check.
 *
 * Reads a devloop run JSONL, picks three covers by substring id, calls `scorePalette` directly with
 * default options, and prints the per-invariant status plus every violation code. Compared by hand
 * against `scorecard-run.ts`'s tally so the tally is not taken on trust.
 *
 * Usage, from research/v3:
 *   node --experimental-strip-types prototypes/p5-fieldfit/verify/spotcheck-scorecard.ts <run.jsonl> <id> [<id>...]
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { scorePalette } from "../../../src/contract/scorecard.ts"
import type { RunLine, RunRow } from "../../../src/devloop/types.ts"

const [runArg, ...ids] = process.argv.slice(2)
if (runArg === undefined || ids.length === 0) {
	process.stdout.write("usage: spotcheck-scorecard.ts <run.jsonl> <id>...\n")
	process.exit(2)
}

const lines = (await readFile(resolve(runArg), "utf8")).split("\n").filter((line) => line.trim() !== "")
const rows: RunRow[] = []
for (const line of lines) {
	const parsed = JSON.parse(line) as RunLine
	if (parsed.kind === "devloop-run-row") rows.push(parsed)
}

for (const id of ids) {
	const row = rows.find((candidate) => candidate.imagePath.includes(id))
	if (row === undefined) {
		process.stdout.write(`${id}: NOT IN RUN\n\n`)
		continue
	}
	if (!row.ok || row.palette === null) {
		process.stdout.write(`${id}: refused — ${row.error}\n\n`)
		continue
	}
	const { scorecard, result } = scorePalette(row.palette)
	process.stdout.write(`${id}  valid=${scorecard.valid}  (validatePalette valid=${result.valid})\n`)
	for (const score of scorecard.invariants) {
		const codes = score.codes.map((entry) => `${entry.code}×${entry.count}`).join(", ")
		process.stdout.write(
			`  ${score.invariant}  ${score.status.padEnd(14)} judgments=${String(score.judgments).padStart(2)}` +
				` violations=${score.violations}${codes === "" ? "" : `  ${codes}`}\n`,
		)
	}
	for (const violation of result.violations ?? []) {
		process.stdout.write(`    VIOLATION ${violation.invariant} ${violation.code} ${JSON.stringify(violation.measured ?? {})}\n`)
	}
	process.stdout.write("\n")
}
