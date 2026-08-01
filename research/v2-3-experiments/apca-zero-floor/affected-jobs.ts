/**
 * Every artwork whose published (guard-off) palette carries a zero-contrast pair, in any of the four
 * pairs. This is the complete set the narrow repair can possibly reach, because its entry test is
 * the defect itself — so measuring all four coverage configurations over this list is exhaustive,
 * and the full-corpus pass only has to confirm that nothing outside it moves.
 *
 * Usage: affected-jobs.ts [--out <file>]
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { loadCensus } from "./analyse.ts"

const { values } = parseArgs({ options: { out: { type: "string" } }, strict: true })
const rows = loadCensus().filter((row) => !row.error)

// A collapsed role is the role it collapsed onto, so the pair is not a distinct claim; the repair
// skips those and this list must agree with it or the two would disagree about what "affected" is.
const affected = rows.filter((row) => {
	const surfaceDistinct = !row.collapse.surface
	const accentDistinct = !row.collapse.accent
	return (surfaceDistinct && row.fgSurface.lc === 0) ||
		row.fgBackground.lc === 0 ||
		(surfaceDistinct && accentDistinct && row.accentSurface.lc === 0) ||
		(accentDistinct && row.accentBackground.lc === 0)
})

const out = resolve(values.out ?? resolve(import.meta.dirname, "data/affected-jobs.txt"))
writeFileSync(out, `${affected.map((row) => row.path).join("\n")}\n`)
process.stdout.write(`${affected.length} affected artwork file(s) of ${rows.length} written to ${out}\n`)
const count = (predicate: (row: typeof rows[number]) => boolean) => rows.filter(predicate).length
process.stdout.write(`  foreground-surface    ${count((r) => !r.collapse.surface && r.fgSurface.lc === 0)}\n`)
process.stdout.write(`  foreground-background ${count((r) => r.fgBackground.lc === 0)}\n`)
process.stdout.write(`  accent-surface        ${count((r) => !r.collapse.surface && !r.collapse.accent && r.accentSurface.lc === 0)}\n`)
process.stdout.write(`  accent-background     ${count((r) => !r.collapse.accent && r.accentBackground.lc === 0)}\n`)
