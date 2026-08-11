/**
 * **The two variant levers, applied to a pinned export and to nothing else.**
 *
 *     node --experimental-strip-types patch.ts <exportDir> <accent-member|fg-member>
 *
 * `tos/roles/NOTES.md` (worker J, cycle 3) implemented, measured and reverted two sub-bar publication
 * rules, and recorded both as round material rather than a worker's call:
 *
 *  - **accent-member** — an accent cluster publishes its most *chromatic* member instead of its
 *    largest. Measured: the dither arm's accent moves on 42 of 100 covers against 50, the arm goes
 *    23% → 24%; and it publishes `#ee5567` where `#d25068` publishes today.
 *  - **fg-member** — a text group publishes its most *readable* member instead of its largest, through
 *    the `memberScore` hook `roles/text.ts` keeps for exactly this. Measured: `…d859a69094` stops
 *    publishing the artwork's own `#070506`.
 *
 * Each is **one substitution at one site**, stated here as the exact bytes it replaces and asserted to
 * occur exactly once. Both quantities are already computed in the scope they are inserted into
 * (`chromaFromField` at the accent site, `contrastOf` at the text-group site) — a variant that had to
 * introduce a measurement would be a different rule, not this one.
 *
 * This writes **only inside the export directory**. The live worktree's `tos/pipeline.ts` is owned by
 * another worker and is never touched; the export is a build directory, as `tos/identity/pin.sh` says.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [exportDir, variant] = process.argv.slice(2)
if (exportDir === undefined || variant === undefined) throw new Error("usage: patch.ts <exportDir> <accent-member|fg-member>")

/** The site, the bytes it must currently read, and what the lever makes it read. */
const SUBSTITUTIONS: Record<string, { file: string; from: string; to: string; why: string }> = {
	"accent-member": {
		file: "research/v3/prototypes/p2-tree/tos/pipeline.ts",
		from: "\t\t\t\t\taccentComponents[second].node.areaFraction - accentComponents[first].node.areaFraction || first - second,\n",
		to: "\t\t\t\t\tchromaFromField(accentComponents[second].node.repr) - chromaFromField(accentComponents[first].node.repr) || first - second,\n",
		why: "an accent cluster publishes its most chromatic member, not its largest",
	},
	"fg-member": {
		file: "research/v3/prototypes/p2-tree/tos/pipeline.ts",
		from: "\tconst textGroups: TextGroup[] = findTextGroups(textComponents)\n",
		to: "\tconst textGroups: TextGroup[] = findTextGroups(textComponents, (component) => contrastOf(component.repr))\n",
		why: "a text group publishes its most readable member, not its largest (roles/text.ts's memberScore hook)",
	},
}

const substitution = SUBSTITUTIONS[variant]
if (substitution === undefined) throw new Error(`patch.ts: unknown variant ${variant}`)

const path = join(exportDir, substitution.file)
const source = readFileSync(path, "utf8")

const occurrences = source.split(substitution.from).length - 1
if (occurrences !== 1) {
	throw new Error(
		`patch.ts: the ${variant} site occurs ${occurrences} times in ${substitution.file} — the pinned source is not what this round was written against, and a variant built on a guess prices nothing`,
	)
}
if (source.includes(substitution.to)) throw new Error(`patch.ts: ${substitution.file} already carries the ${variant} substitution`)

const patched = source.replace(substitution.from, substitution.to)
writeFileSync(path, patched)

// One line differs, and it is the declared one. A patch that moved anything else would make the
// comparison wider than the round says it is.
const before = source.split("\n")
const after = patched.split("\n")
const differing = before.map((line, index) => (line === after[index] ? -1 : index)).filter((index) => index >= 0)
if (before.length !== after.length || differing.length !== 1) {
	throw new Error(`patch.ts: expected exactly one differing line, got ${differing.length}`)
}

console.log(`patched ${substitution.file} line ${differing[0]! + 1} — ${substitution.why}`)
