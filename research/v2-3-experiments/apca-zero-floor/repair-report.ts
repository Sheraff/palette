/**
 * The narrow repair's blast radius, priced per coverage configuration.
 *
 * Each configuration is diffed against the guard-off census, so "moves" always means "differs from
 * what trunk publishes today". The per-level distribution (swap / slate / left alone) is read back
 * off the winner id, because the runtime deliberately publishes no extra field.
 *
 * Usage: repair-report.ts [--repair <dir>] [--configs a,b] [--movers]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { loadCensus, type CensusRow } from "./analyse.ts"
import { CONFIGURATIONS, PAIR_FIELD, pairApplies } from "./repair-configurations.ts"
import { loadWarehouse } from "./warehouse-map.ts"

const { values } = parseArgs({
	options: { repair: { type: "string" }, configs: { type: "string" }, movers: { type: "boolean" } },
	strict: true,
})
const repairRoot = resolve(values.repair ?? resolve(import.meta.dirname, "data/repair-affected"))

type Published = {
	background: string; surface: string; foreground: string; accent: string
	gradient: boolean; collapse: { surface: boolean; accent: boolean }; midpoint: string | null
	outcome: string; id: string
	fgSurface: { lc: number; de: number }; fgBackground: { lc: number; de: number }
	accentSurface: { lc: number; de: number }; accentBackground: { lc: number; de: number }
}
type RepairRow = { path: string; configurations: Record<string, Published>; error?: string }

const repairRows: RepairRow[] = []
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { repairRows.push(JSON.parse(line)) } catch { /* torn trailing line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))
const warehouse = loadWarehouse()
const reviewByBasename = new Map([...warehouse.values()].map((entry) => [entry.image, entry]))

const key = (p: { background: string; surface: string; foreground: string; accent: string; gradient: boolean }) =>
	[p.background, p.surface, p.foreground, p.accent, p.gradient ? "gradient" : "flat"].join(":")
const trunkKey = (row: CensusRow) => key(row)
const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

const configurations = values.configs
	? values.configs.split(",")
	: [...new Set(repairRows.flatMap((row) => Object.keys(row.configurations ?? {})))]

process.stdout.write(`${repairRows.length} artwork file(s) measured, ${configurations.length} configuration(s)\n`)
process.stdout.write(`errors: ${repairRows.filter((row) => row.error).length}\n`)

for (const name of configurations) {
	const movers: Array<{ path: string; before: CensusRow; after: Published }> = []
	const outcomes = new Map<string, number>()
	let stillBroken = 0
	for (const row of repairRows) {
		if (row.error) continue
		const after = row.configurations?.[name]
		const before = trunk.get(row.path)
		if (!after || !before || before.error) continue
		outcomes.set(after.outcome, (outcomes.get(after.outcome) ?? 0) + 1)
		if (trunkKey(before) !== key(after) || before.midpoint !== after.midpoint) {
			movers.push({ path: row.path, before, after })
		}
	}
	process.stdout.write(`\n=== ${name} ===\n`)
	process.stdout.write(`  movers: ${movers.length}\n`)
	const repaired = [...outcomes.entries()].filter(([outcome]) => outcome !== "untouched")
	process.stdout.write(`  repair levels: ${repaired.map(([o, n]) => `${o}=${n}`).join(", ") || "none"}` +
		`, untouched=${outcomes.get("untouched") ?? 0}\n`)

	// Level 3 is the artworks that entered the repair and came out unchanged. They are the ones the
	// hierarchy declined to force, and they matter more than the count suggests: publishing a known
	// defect is the designed outcome when nothing good is available.
	const configuration = CONFIGURATIONS[name]
	if (!configuration) throw new Error(`unknown configuration ${name}`)
	const stillDefective = repairRows.filter((row) => {
		if (row.error) return false
		const after = row.configurations?.[name]
		const before = trunk.get(row.path)
		if (!after || !before || before.error) return false
		if (after.outcome !== "untouched" || trunkKey(before) !== key(after)) return false
		// An ENFORCED pair still at zero on an untouched palette is the hierarchy having declined to
		// force a repair — level 3. Pairs outside the configuration are not defects it was asked about.
		return configuration.enforced.some((pair) =>
			pairApplies(after.collapse, pair) &&
			(after as unknown as Record<string, { lc: number }>)[PAIR_FIELD[pair]]!.lc === 0)
	})
	stillBroken = stillDefective.length
	process.stdout.write(`  left alone WITH the defect still published (level 3): ${stillBroken}\n`)

	if (!values.movers) continue
	process.stdout.write(`\n  --- movers, trunk -> repaired ---\n`)
	for (const { path, before, after } of movers) {
		process.stdout.write(`\n  ${path.split("/").slice(-2).join("/")}   [${after.outcome}]\n`)
		for (const role of ["background", "surface", "foreground", "accent"] as const) {
			if (before[role] !== after[role]) process.stdout.write(`    ${role.padEnd(11)} ${before[role]} -> ${after[role]}\n`)
		}
		if (before.gradient !== after.gradient) {
			process.stdout.write(`    ${"field".padEnd(11)} ${before.gradient ? "gradient" : "flat"} -> ${after.gradient ? "gradient" : "flat"}\n`)
		}
		if (before.midpoint !== after.midpoint) {
			process.stdout.write(`    ${"midpoint".padEnd(11)} ${before.midpoint ?? "none"} -> ${after.midpoint ?? "none"}\n`)
		}
		const rawBefore = Math.abs(apcaRawContrast(rgb(before.foreground), rgb(before.surface)))
		const rawAfter = Math.abs(apcaRawContrast(rgb(after.foreground), rgb(after.surface)))
		process.stdout.write(`    fg/surface  clamped ${before.fgSurface.lc.toFixed(1)} -> ${after.fgSurface.lc.toFixed(1)}` +
			`   raw ${rawBefore.toFixed(2)} -> ${rawAfter.toFixed(2)}\n`)
		const review = reviewByBasename.get(path.split("/").pop()!)
		if (!review) { process.stdout.write(`    review: never reviewed\n`); continue }
		const graded = (review.seen.get(trunkKey(before)) ?? []).filter((entry) => entry.verdict)
		process.stdout.write(`    review: ${graded.length > 0
			? `LEAVING ${graded.map((g) => `${g.verdict} (${g.label}, ${g.batch})`).join("; ")}`
			: "reviewed artwork, but this palette was never the graded side"}\n`)
	}
}
