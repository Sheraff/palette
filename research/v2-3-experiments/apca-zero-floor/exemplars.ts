/**
 * The two artworks Flo named, side by side across trunk, the wide guard, and every narrow
 * configuration — because repair *quality* is the deciding question and it cannot be read off a
 * count.
 *
 * `07d4cb` is the bar for a good repair: keep the gradient, deepen the surface, let the yellow read.
 * `099b3a` is the bar for a save worth making: trunk publishes near-black text on near-black, which
 * is unusable rather than merely imperfect.
 *
 * Usage: exemplars.ts [--all]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { loadCensus } from "./analyse.ts"

const { values } = parseArgs({ options: { all: { type: "boolean" } }, strict: true })

const NAMED: Record<string, string> = {
	"0007d4cb364e04df68f6e2c1": "07d4cb — the founding case; review preferred the WIDE guard's answer here",
	"00099b3aaf316149051a4578": "099b3a — the save; review then caught the repaired fg matching the MIDPOINT",
	"000ed8ed3da0ab878ce10f4a": "0ed8ed — the milder midpoint case review flagged alongside it",
}

const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const readability = (mark: string, field: string) => Math.abs(apcaRawContrast(rgb(mark), rgb(field)))

const repairRoot = resolve(import.meta.dirname, "data/repair-affected")
const repairRows = new Map<string, any>()
for (const file of readdirSync(repairRoot).sort()) {
	if (!file.endsWith(".jsonl")) continue
	for (const line of readFileSync(resolve(repairRoot, file), "utf8").split("\n")) {
		if (!line.trim()) continue
		try { const row = JSON.parse(line); repairRows.set(row.path, row) } catch { /* torn line */ }
	}
}
const trunk = new Map(loadCensus().map((row) => [row.path, row]))

const show = (label: string, palette: Readonly<{
	background: string; surface: string; foreground: string; accent: string
	gradient: boolean; midpoint: string | null
}>, note = "") => {
	process.stdout.write(`  ${label.padEnd(24)} bg=${palette.background} surface=${palette.surface}` +
		` fg=${palette.foreground} accent=${palette.accent}` +
		` ${palette.gradient ? "gradient" : "flat"} midpoint=${palette.midpoint ?? "none"}\n`)
	// The midpoint is a published stop, so it is reported beside the two endpoints rather than
	// treated as a place the ramp merely passes through.
	const onMidpoint = palette.midpoint === null
		? "     n/a"
		: readability(palette.foreground, palette.midpoint).toFixed(2).padStart(8)
	process.stdout.write(`  ${" ".repeat(24)} fg reads on surface: raw ${readability(palette.foreground, palette.surface).toFixed(2).padStart(6)}` +
		`   on background: raw ${readability(palette.foreground, palette.background).toFixed(2).padStart(6)}` +
		`   on midpoint: raw ${onMidpoint}${note}\n`)
}

const targets = values.all
	? [...repairRows.keys()]
	: [...repairRows.keys()].filter((path) => Object.keys(NAMED).some((id) => path.includes(id)))

for (const path of targets.sort()) {
	const identity = Object.keys(NAMED).find((id) => path.includes(id))
	process.stdout.write(`\n${identity ? NAMED[identity] : path.split("/").slice(-2).join("/")}\n`)
	process.stdout.write(`${path.split("/").slice(-2).join("/")}\n`)
	const before = trunk.get(path)
	if (before && !before.error) show("trunk (defect)", before)
	const row = repairRows.get(path)
	for (const [name, palette] of Object.entries(row.configurations ?? {})) {
		const published = palette as any
		show(name, published, `   [${published.outcome}]`)
	}
}
