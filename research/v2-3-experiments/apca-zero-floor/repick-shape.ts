/**
 * What SHAPE do level-2b repairs take under the "nearest the published palette" ordering?
 *
 * Counting role colours treats "collapse the surface onto the background" as a one-role change, which
 * is the smallest move available on almost any artwork — so the ordering has a structural pull toward
 * dropping a colour and toward flat fields. That pull is not something review has ruled on: the
 * verdict behind this ordering compared two four-colour palettes.
 *
 * This measures how strong the pull is, so it can be reported rather than discovered later.
 *
 * Usage: repick-shape.ts [--repair <dir>] [--configs a,b]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { loadCensus } from "./analyse.ts"

const { values } = parseArgs({
	options: { repair: { type: "string" }, configs: { type: "string", default: "fg-surface,fg-both" } },
	strict: true,
})
const repairRoot = resolve(values.repair ?? resolve(import.meta.dirname, "data/repair-affected"))

const rows: any[] = []
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { rows.push(JSON.parse(line)) } catch { /* torn trailing line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))

for (const name of values.configs!.split(",")) {
	const repairs = rows.filter((row) => !row.error && row.configurations?.[name] &&
		row.configurations[name].outcome !== "untouched")
	const tier = (outcome: string) => repairs.filter((row) => row.configurations[name].outcome === outcome)
	process.stdout.write(`\n=== ${name}: ${repairs.length} repair(s) ===\n`)
	for (const outcome of ["swap", "slate", "repick"]) {
		const set = tier(outcome)
		if (set.length === 0) continue
		const flat = set.filter((row) => !row.configurations[name].gradient).length
		const collapsedSurface = set.filter((row) => row.configurations[name].collapse.surface).length
		const collapsedAccent = set.filter((row) => row.configurations[name].collapse.accent).length
		const lostGradient = set.filter((row) => {
			const before = trunk.get(row.path)
			return before && !before.error && before.gradient && !row.configurations[name].gradient
		}).length
		const lostMidpoint = set.filter((row) => {
			const before = trunk.get(row.path)
			return before && !before.error && before.midpoint !== null && row.configurations[name].midpoint === null
		}).length
		process.stdout.write(`  ${outcome.padEnd(7)} ${String(set.length).padStart(4)}` +
			`   flat ${String(flat).padStart(4)}   surface-collapsed ${String(collapsedSurface).padStart(4)}` +
			`   accent-collapsed ${String(collapsedAccent).padStart(4)}\n`)
		process.stdout.write(`  ${" ".repeat(7)} ${" ".repeat(4)}   gradient lost ${String(lostGradient).padStart(4)}` +
			`   midpoint lost ${String(lostMidpoint).padStart(4)}\n`)
	}
}
