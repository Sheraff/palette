/**
 * The artworks the repair declined to force — level 3.
 *
 * These matter more than their count suggests. The hierarchy's third tier exists because a forced
 * repair that produces a mediocre palette is worse than an honest report of a defective one, and
 * these are the cases where it fired. Each one is an artwork whose whole candidate slate, on the
 * field selection chose, has nothing that can carry the roles.
 *
 * Usage: level-three.ts [--repair <dir>]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { loadCensus } from "./analyse.ts"
import { CONFIGURATIONS, PAIR_FIELD, pairApplies } from "./repair-configurations.ts"

const { values } = parseArgs({ options: { repair: { type: "string" } }, strict: true })
const repairRoot = resolve(values.repair ?? resolve(import.meta.dirname, "data/repair-affected"))

const rows: any[] = []
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { rows.push(JSON.parse(line)) } catch { /* torn line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))
const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

for (const [name, configuration] of Object.entries(CONFIGURATIONS)) {
	const declined = rows.filter((row) => {
		if (row.error) return false
		const after = row.configurations?.[name]
		if (!after || after.outcome !== "untouched") return false
		return configuration.enforced.some((pair) =>
			pairApplies(after.collapse, pair) && after[PAIR_FIELD[pair]].lc === 0)
	})
	process.stdout.write(`\n=== ${name}: ${declined.length} artwork(s) left alone with the defect ===\n`)
	for (const row of declined) {
		const after = row.configurations[name]
		const before = trunk.get(row.path)
		process.stdout.write(`  ${row.path.split("/").slice(-2).join("/")}\n`)
		process.stdout.write(`    bg=${after.background} surface=${after.surface} fg=${after.foreground}` +
			` accent=${after.accent} ${after.gradient ? "gradient" : "flat"}` +
			` collapse=${JSON.stringify(after.collapse)}\n`)
		for (const pair of configuration.enforced) {
			if (!pairApplies(after.collapse, pair)) continue
			if (after[PAIR_FIELD[pair]].lc !== 0) continue
			const mark = pair.startsWith("foreground") ? after.foreground : after.accent
			const field = pair.endsWith("surface") ? after.surface : after.background
			process.stdout.write(`    still unreadable: ${pair} (raw ${Math.abs(apcaRawContrast(rgb(mark), rgb(field))).toFixed(2)})\n`)
		}
		if (before && !before.error) {
			process.stdout.write(`    identical to trunk: ${before.foreground === after.foreground &&
				before.background === after.background && before.surface === after.surface &&
				before.accent === after.accent ? "yes" : "NO"}\n`)
		}
	}
}
