/**
 * **Gate (a): is the default path still byte-identical to 0.4.0 after the substrate additions?**
 *
 * The same instrument as `measurements/attribution/verify-neutrality.ts`, pinned one commit later.
 * `_pinned-fb703d2/` holds `git show fb703d2:…/src/*.ts` with the one mechanical rewrite the depth
 * change requires (`../../../src/` → `../../../../../src/`).
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/measurements/substrate/verify-neutrality.ts \
 *     research/v3/data/devloop/sets/demo-20.txt
 *
 * Four runs over the same images, in one process:
 *
 * | run | environment | expectation |
 * |---|---|---|
 * | pinned | committed fb703d2 code | the reference |
 * | working tree, flags off | `P3_SUBSTRATE` unset | **identical** |
 * | working tree, flags off, twice | unset, a second module instance | identical (determinism) |
 * | working tree, `P3_SUBSTRATE=all` | all three branches | **expected to differ**; reported, not asserted |
 *
 * The third run is the determinism half of the gate: the same code over the same bytes twice in the
 * same process must produce the same palette, which is a claim about the pipeline having no hidden
 * state and no dependence on iteration order of anything unordered.
 *
 * Exit 0 = the default path is neutral. The substrate run's difference count is *information*: a run
 * that differed nowhere would mean the flag is not wired, which is a failure of a different kind, so
 * it is printed and checked for being non-zero rather than for being zero.
 */

import { readFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import type { Palette } from "../../../../src/contract/types.ts"

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

const decided = (palette: Palette): string =>
	JSON.stringify([palette.roles, palette.gradient, palette.collapse])

async function runAll(extract: (p: string) => Promise<{ palette: Palette }>): Promise<string[]> {
	const out: string[] = []
	for (const image of images) out.push(decided((await extract(image)).palette))
	return out
}

const candidateUrl = (tag: string): string =>
	new URL(`../../src/candidate.ts?${tag}`, import.meta.url).href

delete process.env.P3_DIAG
delete process.env.P3_DEPTH_FLOOR_MODE
delete process.env.P3_SUBSTRATE

const pinned = await import("./_pinned-fb703d2/candidate.ts")
const pinnedRows = await runAll(pinned.extractPalette)

const liveOff = await import(candidateUrl("substrate-off"))
const offRows = await runAll(liveOff.extractPalette)
const offAgainRows = await runAll(liveOff.extractPalette)

process.env.P3_SUBSTRATE = "all"
const liveOn = await import(candidateUrl("substrate-on"))
const onRows = await runAll(liveOn.extractPalette)
delete process.env.P3_SUBSTRATE

const bytes = (rows: string[]) => Buffer.byteLength(JSON.stringify(rows), "utf8")
const firstDiff = (a: string[], b: string[]) => a.findIndex((row, i) => row !== b[i])
const countDiff = (a: string[], b: string[]) => a.filter((row, i) => row !== b[i]).length

const offDiff = firstDiff(pinnedRows, offRows)
const repeatDiff = firstDiff(offRows, offAgainRows)
const onChanged = countDiff(pinnedRows, onRows)

console.log(`images: ${images.length}`)
console.log(`pinned fb703d2                   ${bytes(pinnedRows)} bytes`)
console.log(`working tree, P3_SUBSTRATE unset ${bytes(offRows)} bytes, first differing row ${offDiff}`)
console.log(`the same run again               first differing row ${repeatDiff}`)
console.log(`working tree, P3_SUBSTRATE=all   ${bytes(onRows)} bytes, palettes changed ${onChanged}/${images.length}`)
console.log(
	offDiff === -1 && repeatDiff === -1
		? "NEUTRAL — the default path is byte-identical to fb703d2 and deterministic"
		: "NOT NEUTRAL — the substrate additions changed the default path",
)
if (offDiff !== -1 || repeatDiff !== -1) process.exitCode = 1
