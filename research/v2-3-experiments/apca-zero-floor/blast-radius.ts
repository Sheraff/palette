/**
 * Diff two censuses — guard off against guard on — and check every mover against human review.
 *
 * A mover is reported with its off→on role diff, and then cross-referenced with the warehouse on
 * the two questions the charter says decide whether movement is a regression:
 *
 *   - was the palette we are moving AWAY from reviewed strong or acceptable?
 *   - does the palette we are moving TO match a palette a human assembled as a correction?
 *
 * The charter's guardrail semantics are followed exactly: moving off a reviewed-strong palette is
 * not automatically a regression, because an artwork can have several valid palettes. Only a move
 * TO a known-worse palette is. So this tool flags rather than judges, and says which movers need a
 * human verdict.
 *
 * Usage: blast-radius.ts --off <dir> --on <dir>
 */
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { loadCensus, type CensusRow } from "./analyse.ts"
import { loadWarehouse } from "./warehouse-map.ts"

const { values } = parseArgs({
	options: { off: { type: "string" }, on: { type: "string" } },
	strict: true,
})
const off = new Map(loadCensus(resolve(values.off!)).map((row) => [row.path, row]))
const on = new Map(loadCensus(resolve(values.on!)).map((row) => [row.path, row]))

const roleKey = (row: CensusRow) =>
	[row.background, row.surface, row.foreground, row.accent, row.gradient ? "gradient" : "flat"].join(":")

const warehouse = loadWarehouse()
/** Reviewed artwork is keyed by basename; census rows are absolute paths. */
const reviewByBasename = new Map([...warehouse.values()].map((entry) => [entry.image, entry]))

const movers: Array<{ path: string; before: CensusRow; after: CensusRow }> = []
let compared = 0
const errorsOn: CensusRow[] = []
for (const [path, before] of off) {
	const after = on.get(path)
	if (!after) continue
	compared += 1
	if (after.error) { errorsOn.push(after); continue }
	if (before.error) continue
	if (roleKey(before) !== roleKey(after) || before.midpoint !== after.midpoint) {
		movers.push({ path, before, after })
	}
}

// A mover whose OLD palette carried the defect is the rule doing its job. A mover whose old
// palette was already fine moved because refusing candidates elsewhere in the domain changed what
// materialization and ranking saw — a cascade, and the part of the blast radius nobody asked for.
const direct = movers.filter(({ before }) => before.fgSurface.lc === 0)
const cascade = movers.filter(({ before }) => before.fgSurface.lc !== 0)
process.stdout.write(`compared ${compared} artworks present in both censuses\n`)
process.stdout.write(`movers: ${movers.length}\n`)
process.stdout.write(`  direct  (old palette had the defect): ${direct.length}\n`)
process.stdout.write(`  cascade (old palette was already fine): ${cascade.length}\n`)

const gradedMovers = movers.map(({ path, before, after }) => {
	const review = reviewByBasename.get(path.split("/").pop()!)
	if (!review) return null
	const graded = (review.seen.get(roleKey(before)) ?? []).filter((entry) => entry.verdict)
	return graded.length > 0 ? { path, before, after, graded } : null
}).filter((entry) => entry !== null)
process.stdout.write(`\nmovers whose OLD palette carries a recorded verdict: ${gradedMovers.length}\n`)
for (const entry of gradedMovers) {
	process.stdout.write(`  ${entry!.path.split("/").pop()}: ${entry!.graded.map((g) => `${g.verdict} (${g.label}, ${g.batch})`).join("; ")}\n`)
}
if (errorsOn.length > 0) {
	process.stdout.write(`\nEXTRACTION FAILURES INTRODUCED BY THE GUARD (${errorsOn.length}) — the domain emptied:\n`)
	for (const row of errorsOn) process.stdout.write(`  ${row.path}\n    ${row.error}\n`)
}

// Did the guard actually achieve its purpose? Nothing published may still violate it.
const stillZero = [...on.values()].filter((row) => !row.error && row.fgSurface.lc === 0)
process.stdout.write(`\npublished palettes STILL at exactly zero foreground/surface contrast with the guard on: ${stillZero.length}\n`)
for (const row of stillZero.slice(0, 20)) {
	process.stdout.write(`  ${row.path.split("/").slice(-2).join("/")}  bg=${row.background} surface=${row.surface} fg=${row.foreground}\n`)
}

process.stdout.write(`\n--- every mover, off -> on ---\n`)
const roles = ["background", "surface", "foreground", "accent"] as const
for (const { path, before, after } of movers) {
	const short = path.split("/").slice(-2).join("/")
	process.stdout.write(`\n${short}\n`)
	for (const role of roles) {
		if (before[role] !== after[role]) process.stdout.write(`  ${role.padEnd(11)} ${before[role]} -> ${after[role]}\n`)
	}
	if (before.gradient !== after.gradient) process.stdout.write(`  ${"field".padEnd(11)} ${before.gradient ? "gradient" : "flat"} -> ${after.gradient ? "gradient" : "flat"}\n`)
	if (before.midpoint !== after.midpoint) process.stdout.write(`  ${"midpoint".padEnd(11)} ${before.midpoint ?? "none"} -> ${after.midpoint ?? "none"}\n`)
	process.stdout.write(`  fg/surface Lc ${before.fgSurface.lc.toFixed(2)} -> ${after.fgSurface.lc.toFixed(2)}` +
		`   (dE ${before.fgSurface.de.toFixed(1)} -> ${after.fgSurface.de.toFixed(1)})\n`)

	const basename = path.split("/").pop()!
	const review = reviewByBasename.get(basename)
	if (!review) { process.stdout.write("  review: this artwork has never been reviewed\n"); continue }
	const beforeSeen = review.seen.get(roleKey(before)) ?? []
	const afterSeen = review.seen.get(roleKey(after)) ?? []
	const verdictsOn = (entries: typeof beforeSeen) =>
		entries.filter((entry) => entry.verdict).map((entry) => `${entry.verdict} (${entry.label}, batch ${entry.batch}, line ${entry.line})`)
	const leaving = verdictsOn(beforeSeen)
	const arriving = verdictsOn(afterSeen)
	process.stdout.write(`  review: reviewed artwork; latest verdict overall ${review.latestVerdict ?? "none"} (batch ${review.latestBatch})\n`)
	process.stdout.write(`    palette being LEFT: ${leaving.length > 0 ? leaving.join("; ") : beforeSeen.length > 0 ? "shown but never the graded side" : "never shown to a reviewer"}\n`)
	process.stdout.write(`    palette ARRIVED AT: ${arriving.length > 0 ? arriving.join("; ") : afterSeen.length > 0 ? "shown but never the graded side" : "never shown to a reviewer"}\n`)
	for (const correction of review.corrections) {
		const set = roles.filter((role) => correction[role])
		if (set.length === 0) continue
		const matchesAfter = set.every((role) => correction[role]!.toLowerCase() === after[role])
		const matchesBefore = set.every((role) => correction[role]!.toLowerCase() === before[role])
		if (matchesAfter || matchesBefore) {
			process.stdout.write(`    correction (${set.length} of 4 roles) matches the ${matchesAfter ? "NEW" : "OLD"} palette: ` +
				`${set.map((role) => `${role}=${correction[role]}`).join(" ")}\n`)
		}
	}
}
