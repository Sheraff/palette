/**
 * **Is the published palette still a function of the image alone, after W11b's src additions?**
 *
 * W11b added three things to `src/`: three fields to the `P3_DIAG` chain record (`longEdge`,
 * `depthThresholdPx`, `depthFloorMode`), a measurement-only constant
 * (`DEGENERATE_DEPTH_FLOOR_FRACTION`), and a dev-only `P3_DEPTH_FLOOR_MODE` branch in
 * `computeFieldSet`. The claim attached to all three is that with no environment variable set the
 * output is what commit **1ec99b6** produced. That claim is checked here rather than asserted.
 *
 * `_pinned-1ec99b6/` holds `git show 1ec99b6:…/src/*.ts` with one mechanical rewrite — the
 * `../../../src/` prefix re-depthed to `../../../../../src/`, because the copy sits two levels deeper
 * than `src/`. The same pattern, and the same reasoning, as
 * `review-rounds/round-1-calibration/verify-pinned-code.ts`.
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/measurements/attribution/verify-neutrality.ts \
 *     research/v3/data/devloop/sets/demo-20.txt
 *
 * Three runs over the same images, all in-process so nothing is cached between them:
 *
 * | run | environment | expectation |
 * |---|---|---|
 * | pinned | committed 1ec99b6 code | the reference |
 * | working tree, diagnostics off | `P3_DIAG` unset | identical to pinned |
 * | working tree, diagnostics on | `P3_DIAG` set to a scratch dir | identical to pinned |
 *
 * `P3_DIAG` is read once at module load in `diagnostics.ts`, so the diagnostics-on run imports the
 * pipeline through a cache-busting query string with the variable already set. Exit 0 = neutral.
 */

import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import type { Palette } from "../../../../src/contract/types.ts"

// attribution → measurements → p3-fields → prototypes → v3 → research → the worktree root, which is
// what `src/devloop/run.ts` resolves set-file lines against.
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..")

const setPath = process.argv[2]
if (!setPath) {
	console.error("usage: verify-neutrality.ts <set-file.txt>")
	process.exit(2)
}

const images = (await readFile(resolve(setPath), "utf8"))
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))
	.map((line) => (isAbsolute(line) ? line : join(REPO_ROOT, line)))

/** Everything the contract publishes as colour or collapse. Timings and cache flags are not that. */
const decided = (palette: Palette): string => JSON.stringify([palette.roles, palette.gradient, palette.collapse])

async function runAll(extract: (p: string) => Promise<{ palette: Palette }>): Promise<string[]> {
	const out: string[] = []
	for (const image of images) out.push(decided((await extract(image)).palette))
	return out
}

const pinned = await import("./_pinned-1ec99b6/candidate.ts")
const pinnedRows = await runAll(pinned.extractPalette)

delete process.env.P3_DIAG
delete process.env.P3_DEPTH_FLOOR_MODE
// The specifier is built rather than written literally: two imports of the same module must be two
// module instances (`P3_DIAG` is read once at load), and a computed specifier is also what keeps the
// query string out of the type checker's resolver.
const candidateUrl = (tag: string): string => new URL(`../../src/candidate.ts?${tag}`, import.meta.url).href
const liveOff = await import(candidateUrl("neutrality-off"))
const offRows = await runAll(liveOff.extractPalette)

process.env.P3_DIAG = await mkdtemp(join(tmpdir(), "p3-neutrality-"))
const liveOn = await import(candidateUrl("neutrality-on"))
const onRows = await runAll(liveOn.extractPalette)

const bytes = (rows: string[]) => Buffer.byteLength(JSON.stringify(rows), "utf8")
const firstDiff = (a: string[], b: string[]) => a.findIndex((row, i) => row !== b[i])

const offDiff = firstDiff(pinnedRows, offRows)
const onDiff = firstDiff(pinnedRows, onRows)

console.log(`images: ${images.length}`)
console.log(`pinned 1ec99b6              ${bytes(pinnedRows)} bytes`)
console.log(`working tree, P3_DIAG unset ${bytes(offRows)} bytes, first differing row ${offDiff}`)
console.log(`working tree, P3_DIAG set   ${bytes(onRows)} bytes, first differing row ${onDiff}`)
console.log(
	offDiff === -1 && onDiff === -1
		? "NEUTRAL — every published palette is byte-identical to the committed code, diagnostics off and on"
		: "NOT NEUTRAL — the src additions changed published output",
)
if (offDiff !== -1 || onDiff !== -1) process.exitCode = 1
