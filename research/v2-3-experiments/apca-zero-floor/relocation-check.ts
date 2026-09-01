/**
 * Does a repair move the defect somewhere it is not looking?
 *
 * Flo's objection to a blanket mark-role swap is that exchanging the two roles does not remove a
 * zero, it hands it to the other role. The repair now validates the whole palette against every
 * ENFORCED pair, so it cannot relocate a defect into a pair the configuration covers. It says
 * nothing about pairs the configuration does *not* cover — and a narrow configuration is exactly
 * where that gap lives.
 *
 * This measures it: for each configuration, how many repaired artworks end up with a zero in a pair
 * that was clean before and is not enforced. A configuration that scores badly here is buying its
 * own numbers by pushing the problem out of view.
 *
 * Usage: relocation-check.ts [--repair <dir>]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { loadCensus, type CensusRow } from "./analyse.ts"

const { values } = parseArgs({ options: { repair: { type: "string" } }, strict: true })
const repairRoot = resolve(values.repair ?? resolve(import.meta.dirname, "data/repair-affected"))

const ENFORCED: Record<string, readonly string[]> = {
	"fg-surface": ["fgSurface"],
	"fg-both": ["fgSurface", "fgBackground"],
	"accent-only": ["accentSurface", "accentBackground"],
	"all-four": ["fgSurface", "fgBackground", "accentSurface", "accentBackground"],
}
const ALL = ["fgSurface", "fgBackground", "accentSurface", "accentBackground"] as const
const LABEL: Record<string, string> = {
	fgSurface: "foreground-surface", fgBackground: "foreground-background",
	accentSurface: "accent-surface", accentBackground: "accent-background",
}

type Measured = Record<string, { lc: number }> & { collapse: { surface: boolean; accent: boolean }; outcome: string }
type RepairRow = { path: string; configurations: Record<string, Measured>; error?: string }

const rows: RepairRow[] = []
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { rows.push(JSON.parse(line)) } catch { /* torn trailing line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))

const applies = (collapse: { surface: boolean; accent: boolean }, field: string): boolean => {
	if (field === "fgSurface" && collapse.surface) return false
	if (field === "accentSurface" && (collapse.surface || collapse.accent)) return false
	if (field === "accentBackground" && collapse.accent) return false
	return true
}
const zeroAt = (source: { collapse: { surface: boolean; accent: boolean } } & Record<string, any>, field: string): boolean =>
	applies(source.collapse, field) && source[field].lc === 0

for (const [name, enforced] of Object.entries(ENFORCED)) {
	let relocated = 0
	const detail: string[] = []
	for (const row of rows) {
		if (row.error) continue
		const after = row.configurations?.[name]
		const before = trunk.get(row.path) as unknown as CensusRow & Record<string, any>
		if (!after || !before || before.error) continue
		if (after.outcome === "untouched") continue
		for (const field of ALL) {
			if (enforced.includes(field)) continue
			if (zeroAt(after as any, field) && !zeroAt(before as any, field)) {
				relocated += 1
				if (detail.length < 8) {
					detail.push(`    ${row.path.split("/").slice(-2).join("/")} gained a zero at ${LABEL[field]} (repair: ${after.outcome})`)
				}
				break
			}
		}
	}
	process.stdout.write(`${name}: ${relocated} repaired artwork(s) gained a NEW zero in an unenforced pair\n`)
	for (const line of detail) process.stdout.write(`${line}\n`)
}
