/**
 * W-VERIFY step 5 — devloop run JSONL → adjudication candidate-run JSONL.
 *
 * The dev loop's `palette` field is already the contract `Palette` shape, and
 * `src/adjudication/adjudicate.ts`'s `parseCandidateLine` wants `{ palette: { roles, metadata } }`
 * with `metadata.inputContentHash` (lowercase sha-256) and `metadata.sourceRendition.path`. Both are
 * present verbatim on every ok row, so this is a re-wrap, not a translation: nothing about a colour,
 * a hash or a path is recomputed here, which is the point — a converter that derived anything would
 * put itself between the candidate and the evidence.
 *
 * Failed rows are dropped and counted on stderr rather than emitted as parse errors.
 *
 * Usage, from research/v3:
 *   node --experimental-strip-types prototypes/p5-fieldfit/verify/run-to-adjudication.ts <run.jsonl> <out.jsonl>
 */

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { RunLine, RunRow } from "../../../src/devloop/types.ts"

const [runArg, outArg] = process.argv.slice(2)
if (runArg === undefined || outArg === undefined) {
	process.stdout.write("usage: run-to-adjudication.ts <run.jsonl> <out.jsonl>\n")
	process.exit(2)
}

const lines = (await readFile(resolve(runArg), "utf8")).split("\n").filter((line) => line.trim() !== "")
const out: string[] = []
let skipped = 0
for (const line of lines) {
	const parsed = JSON.parse(line) as RunLine
	if (parsed.kind !== "devloop-run-row") continue
	const row = parsed as RunRow
	if (!row.ok || row.palette === null) {
		skipped += 1
		continue
	}
	out.push(JSON.stringify({ palette: row.palette, arm: "p5-fieldfit" }))
}

await writeFile(resolve(outArg), `${out.join("\n")}\n`)
process.stderr.write(`${out.length} candidates written, ${skipped} failed rows skipped\n`)
