/**
 * What would each candidate threshold actually cost?
 *
 * This is the decision table. For every bar, it reports how many artworks currently publish a
 * palette the bar would refuse, and — the number that matters most — how many of those palettes a
 * human has already graded, and how they were graded. A bar that only refuses palettes nobody has
 * endorsed is cheap; a bar that refuses palettes review called strong is expensive, and that is
 * exactly the trade the reader is being asked to judge.
 *
 * Nothing here needs a second corpus sweep: an artwork whose published palette clears the bar
 * cannot be refused by it, so the guard-off census already names the entire affected population.
 * (It does not name where those artworks would *land* — that needs the guard-on sweep — but it
 * bounds the blast radius exactly.)
 *
 * Usage: threshold-sensitivity.ts [--census <dir>]
 */
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { artworkIdentity, loadCensus, type CensusRow } from "./analyse.ts"
import { loadWarehouse } from "./warehouse-map.ts"

const { values } = parseArgs({ options: { census: { type: "string" } }, strict: true })
const rows = loadCensus(values.census ? resolve(values.census) : undefined).filter((row) => !row.error)

const byIdentity = new Map<string, CensusRow>()
for (const row of rows) if (!byIdentity.has(artworkIdentity(row.path))) byIdentity.set(artworkIdentity(row.path), row)
const unique = [...byIdentity.values()]

const warehouse = loadWarehouse()
const reviewByBasename = new Map([...warehouse.values()].map((entry) => [entry.image, entry]))
const roleKey = (row: CensusRow) =>
	[row.background, row.surface, row.foreground, row.accent, row.gradient ? "gradient" : "flat"].join(":")

/** The grade review gave the palette this artwork currently publishes, if it has ever seen it. */
function gradeOfPublished(row: CensusRow): string | null {
	const review = reviewByBasename.get(row.path.split("/").pop()!)
	if (!review) return null
	const entries = review.seen.get(roleKey(row)) ?? []
	const graded = entries.filter((entry) => entry.verdict).map((entry) => entry.verdict!)
	if (graded.length === 0) return entries.length > 0 ? "shown-but-ungraded" : null
	for (const rank of ["strong", "acceptable", "weak-fallback", "unacceptable"]) {
		if (graded.includes(rank)) return rank
	}
	return graded[0]!
}

process.stdout.write(`${unique.length} distinct artworks; ${reviewByBasename.size} artworks have review records\n`)
process.stdout.write(`\nA bar at |Lc| refuses every artwork whose published foreground/surface contrast is below it.\n`)
process.stdout.write(`APCA cannot report any magnitude between 0 and 7.3, so bars of 1, 2, 5 and 7 are the SAME bar.\n\n`)

const header = "  bar   artworks refused   of those, reviewed   strong  acceptable  weak-fallback  unacceptable"
process.stdout.write(`${header}\n`)
for (const bar of [1, 2, 5, 7, 9, 12, 15, 20, 30, 45, 60]) {
	const refused = unique.filter((row) => Math.abs(row.fgSurface.lc) < bar)
	const grades = refused.map(gradeOfPublished).filter((grade): grade is string => grade !== null)
	const count = (name: string) => grades.filter((grade) => grade === name).length
	process.stdout.write(`  ${String(bar).padStart(3)}   ${String(refused.length).padStart(15)}   ` +
		`${String(grades.length).padStart(18)}   ${String(count("strong")).padStart(6)}  ${String(count("acceptable")).padStart(10)}  ` +
		`${String(count("weak-fallback")).padStart(13)}  ${String(count("unacceptable")).padStart(12)}\n`)
}

process.stdout.write(`\n--- the reviewed palettes each bar would refuse, named ---\n`)
for (const bar of [1, 9, 15, 30, 45]) {
	const refused = unique.filter((row) => Math.abs(row.fgSurface.lc) < bar)
		.map((row) => ({ row, grade: gradeOfPublished(row) }))
		.filter((entry) => entry.grade !== null && entry.grade !== "shown-but-ungraded")
	process.stdout.write(`\nbar ${bar}: ${refused.length} reviewed palette(s) refused\n`)
	for (const { row, grade } of refused.sort((a, b) => Math.abs(a.row.fgSurface.lc) - Math.abs(b.row.fgSurface.lc))) {
		process.stdout.write(`  ${grade!.padEnd(14)} Lc=${row.fgSurface.lc.toFixed(2).padStart(7)}  ${row.path.split("/").pop()}\n`)
		process.stdout.write(`  ${" ".repeat(14)} bg=${row.background} surface=${row.surface} fg=${row.foreground} accent=${row.accent}\n`)
	}
}
