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

import { rolePairIsUnreadable } from "../../v2-3/src/internal/palette-core.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { loadCensus } from "./analyse.ts"

const { values } = parseArgs({ options: { out: { type: "string" } }, strict: true })
const rows = loadCensus().filter((row) => !row.error)

const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

// A collapsed role is the role it collapsed onto, so the pair is not a distinct claim; the repair
// skips those and this list must agree with it or the two would disagree about what "affected" is.
//
// The midpoint pairs are computed here rather than read from the census, which predates them: the
// census stores the published midpoint hex, which is all this needs. Leaving them out would omit
// artworks whose ONLY defect is a foreground matching the field's third stop — exactly the class
// review flagged — from the very list built to measure them.
const affected = rows.filter((row) => {
	const surfaceDistinct = !row.collapse.surface
	const accentDistinct = !row.collapse.accent
	const onMidpoint = (role: "foreground" | "accent") =>
		row.midpoint !== null && rolePairIsUnreadable(rgb(row[role]), rgb(row.midpoint))
	return (surfaceDistinct && row.fgSurface.lc === 0) ||
		row.fgBackground.lc === 0 ||
		onMidpoint("foreground") ||
		(surfaceDistinct && accentDistinct && row.accentSurface.lc === 0) ||
		(accentDistinct && row.accentBackground.lc === 0) ||
		(accentDistinct && onMidpoint("accent"))
})

const out = resolve(values.out ?? resolve(import.meta.dirname, "data/affected-jobs.txt"))
writeFileSync(out, `${affected.map((row) => row.path).join("\n")}\n`)
process.stdout.write(`${affected.length} affected artwork file(s) of ${rows.length} written to ${out}\n`)
const count = (predicate: (row: typeof rows[number]) => boolean) => rows.filter(predicate).length
process.stdout.write(`  foreground-surface    ${count((r) => !r.collapse.surface && r.fgSurface.lc === 0)}\n`)
process.stdout.write(`  foreground-background ${count((r) => r.fgBackground.lc === 0)}\n`)
process.stdout.write(`  accent-surface        ${count((r) => !r.collapse.surface && !r.collapse.accent && r.accentSurface.lc === 0)}\n`)
process.stdout.write(`  accent-background     ${count((r) => !r.collapse.accent && r.accentBackground.lc === 0)}\n`)
const onMidpointCount = (role: "foreground" | "accent") => count((r) =>
	r.midpoint !== null && (role === "foreground" || !r.collapse.accent) &&
	rolePairIsUnreadable(rgb(r[role]), rgb(r.midpoint)))
process.stdout.write(`  foreground-midpoint   ${onMidpointCount("foreground")}\n`)
process.stdout.write(`  accent-midpoint       ${onMidpointCount("accent")}\n`)
