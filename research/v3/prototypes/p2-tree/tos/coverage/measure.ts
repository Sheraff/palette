/**
 * **What the coverage rule costs and what it moves.** A measurement script, not a candidate.
 *
 *     node --experimental-strip-types prototypes/p2-tree/tos/coverage/measure.ts [--set <path>]
 *
 * Runs `../candidate.ts` and `./candidate-coverage.ts` over a set, **sequentially and in one sitting**,
 * and prints: the census per cover, which covers change and in which role, the contract audit of the
 * coverage run (violations and forbidden twin pairs, from `../roles/assemble.ts`'s own auditor), and the
 * wall-time delta. Sequential because a per-cover cost is what a cost round can act on; the dev loop's
 * parallel figure is a throughput number and hides this rule's cost entirely.
 *
 * Nothing here is read by a candidate or a test. It exists so the numbers in `DESIGN.md` and in the
 * worker's report are reproducible by re-running one command.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { REPO_ROOT, SETS_ROOT } from "../../../../src/devloop/run.ts"
import { paletteWithDiagnostics } from "../candidate.ts"
import { forbiddenTwinPairs } from "../roles/assemble.ts"
import { familyCensus } from "./census.ts"
import { paletteWithCoverage } from "./candidate-coverage.ts"

const setArgument = process.argv.indexOf("--set")
const setPath = setArgument === -1 ? resolve(SETS_ROOT, "demo-20.txt") : resolve(process.argv[setArgument + 1])

const lines = (await readFile(setPath, "utf8"))
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))

let changed = 0
let violations = 0
let twins = 0
let baselineMs = 0
let coverageMs = 0
const familyCounts: number[] = []

console.log(`set: ${setPath} (${lines.length} covers)`)
console.log("cover | families | reason | baseline → coverage")

for (const line of lines) {
	const path = resolve(REPO_ROOT, line)

	const baselineStart = performance.now()
	const base = await paletteWithDiagnostics(path)
	baselineMs += performance.now() - baselineStart

	const coverageStart = performance.now()
	const covered = await paletteWithCoverage(path)
	coverageMs += performance.now() - coverageStart

	const census = familyCensus(base.parse)
	familyCounts.push(census.families.length)
	const audit = validatePalette(covered.palette)
	violations += audit.violations.length
	const pairs = forbiddenTwinPairs(covered.palette)
	twins += pairs.length

	const roleNames = ["background", "surface", "foreground", "accent"] as const
	const moved = roleNames.filter((role) => covered.palette.roles[role].hex !== base.palette.roles[role].hex)
	if (moved.length > 0) changed += 1

	const reason = covered.notes.filter((note) => note.startsWith("coverage-")).join(" ")
	const shape = (of: typeof base.palette) => roleNames.map((role) => of.roles[role].hex).join(" ")
	console.log(
		`${line.slice(-16)} | ${census.families.length} | ${reason} | ${moved.length === 0 ? "unchanged" : `${shape(base.palette)} → ${shape(covered.palette)} [${moved.join(",")}]`}` +
			`${audit.violations.length > 0 ? ` VIOLATIONS ${audit.violations.map((entry) => entry.invariant).join(",")}` : ""}` +
			`${pairs.length > 0 ? ` TWINS ${pairs.join(",")}` : ""}`,
	)
}

const under2 = familyCounts.filter((count) => count < 2).length
console.log("")
console.log(`covers with <2 families: ${under2}/${lines.length} (byte-identity asserted on these)`)
console.log(`covers changed: ${changed}/${lines.length}`)
console.log(`contract violations: ${violations} · forbidden twin pairs: ${twins}`)
console.log(
	`sequential wall time: baseline ${(baselineMs / lines.length).toFixed(0)} ms/cover · ` +
		`coverage ${(coverageMs / lines.length).toFixed(0)} ms/cover · ` +
		`delta ${((coverageMs - baselineMs) / lines.length).toFixed(0)} ms/cover ` +
		`(${(coverageMs / baselineMs).toFixed(3)}×)`,
)
