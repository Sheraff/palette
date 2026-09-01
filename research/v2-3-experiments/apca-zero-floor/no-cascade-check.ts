/**
 * Verify the no-cascade claim rather than deriving it.
 *
 * The narrow repair's entry test is the defect itself, so an artwork whose trunk palette carries no
 * zero pair should be byte-identical under the repair. That follows from the code, but the charter's
 * standard is measurement — the wide guard also "obviously" only touched defective artworks, and it
 * moved 134 that were fine.
 *
 * This diffs the full-corpus run under the widest configuration against trunk and checks that every
 * mover is in the affected set.
 *
 * Usage: no-cascade-check.ts [--repair <dir>] [--config all-four]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { rolePairIsUnreadable } from "../../v2-3/src/internal/palette-core.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { loadCensus, type CensusRow } from "./analyse.ts"
import { CONFIGURATIONS, PAIR_FIELD, enforcedWithMidpoint, pairApplies } from "./repair-configurations.ts"

const { values } = parseArgs({
	options: { repair: { type: "string" }, config: { type: "string", default: "all-four" } },
	strict: true,
})
const repairRoot = resolve(values.repair ?? resolve(import.meta.dirname, "data/repair-fullcorpus"))
const name = values.config!
const configuration = CONFIGURATIONS[name]
if (!configuration) throw new Error(`unknown configuration ${name}`)

const rows: any[] = []
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { rows.push(JSON.parse(line)) } catch { /* torn line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))
const key = (p: any) => [p.background, p.surface, p.foreground, p.accent, p.gradient ? "g" : "f", p.midpoint].join(":")

const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/**
 * Did this artwork's TRUNK palette carry a defect in an enforced pair?
 *
 * The midpoint pairs are computed here rather than read from the census, because the census predates
 * them — it stores the published midpoint hex, which is all that is needed. Leaving them out would
 * report every midpoint-driven repair as a cascade, which is the opposite of the truth.
 */
const carriedDefect = (row: CensusRow): boolean =>
	enforcedWithMidpoint(configuration.enforced).some((pair) => {
		if (!pairApplies(row.collapse, pair, row.midpoint)) return false
		if (pair.endsWith("-midpoint")) {
			const mark = pair.startsWith("foreground") ? row.foreground : row.accent
			return rolePairIsUnreadable(rgb(mark), rgb(row.midpoint!))
		}
		return (row as unknown as Record<string, { lc: number }>)[PAIR_FIELD[pair]]!.lc === 0
	})

let compared = 0
let movers = 0
const unexpected: string[] = []
let defectiveUnmoved = 0
for (const row of rows) {
	if (row.error) continue
	const after = row.configurations?.[name]
	const before = trunk.get(row.path)
	if (!after || !before || before.error) continue
	compared += 1
	const moved = key(before) !== key(after)
	if (moved) {
		movers += 1
		if (!carriedDefect(before)) unexpected.push(row.path)
	} else if (carriedDefect(before)) {
		defectiveUnmoved += 1
	}
}

process.stdout.write(`configuration: ${name}\n`)
process.stdout.write(`compared ${compared} artworks against trunk\n`)
process.stdout.write(`  movers: ${movers}\n`)
process.stdout.write(`  movers whose trunk palette carried NO enforced defect (cascade): ${unexpected.length}\n`)
if (unexpected.length > 0) {
	process.stdout.write(`  CASCADE DETECTED — the no-cascade claim is FALSE:\n`)
	for (const path of unexpected.slice(0, 20)) process.stdout.write(`    ${path}\n`)
} else {
	process.stdout.write(`  NO CASCADE: every mover carried the defect it was repaired for.\n`)
}
process.stdout.write(`  defective artworks left unmoved (level 3, declined): ${defectiveUnmoved}\n`)
