/**
 * Is `run-demo-20-0.2.0.jsonl` a statement about **commit cb760d7**, or about somebody's edits?
 *
 * The round was staged from a shared worktree while another worker was mid-edit in
 * `prototypes/p3-fields/src/` (diagnostics instrumentation and a dev-only `P3_EDGE_RANK` override).
 * The run therefore executed working-tree code, not the commit the item fingerprints name. A
 * fingerprint that says `gitCommit: cb760d7, dirty: false` is a lie unless that is checked, so it is
 * checked here rather than assumed from reading the diff.
 *
 * `_pinned-cb760d7/` holds `git show cb760d7:…/src/*.ts` with one mechanical rewrite — the
 * `../../../src/` prefix re-depthed to `../../../../../src/`, because the copy sits five levels below
 * `research/v3` instead of three. Nothing else is touched. `research/v3/src/` itself is clean at
 * cb760d7, so the re-pointed imports are the same modules the run used.
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/verify-pinned-code.ts
 *
 * Exit 0 = the pinned code reproduces every row. Non-zero = the fingerprints must not ship as written.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { extractPalette } from "./_pinned-cb760d7/pipeline.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; palette: Palette }>

const rows = readFileSync(join(HERE, "run-demo-20-0.2.0.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as RunRow)
	.filter((line) => line.kind === "devloop-run-row")

/** Everything the contract publishes as colour or collapse. Timings and cache flags are not that. */
const decided = (palette: Palette): string =>
	JSON.stringify([palette.roles, palette.gradient, palette.collapse])

const mismatches: number[] = []
for (const row of rows) {
	const { palette } = await extractPalette(row.imagePath)
	if (decided(palette) !== decided(row.palette)) mismatches.push(row.index)
}

console.log(
	mismatches.length === 0
		? `all ${rows.length} rows reproduce under pinned cb760d7 — working-tree edits are output-neutral`
		: `${mismatches.length} rows differ under pinned cb760d7: ${mismatches.join(", ")}`,
)
if (mismatches.length > 0) process.exitCode = 1
