/**
 * Print one warehouse record in a readable shape. Usage: show-record.ts <lineNumber> [...]
 */
import { readFileSync } from "node:fs"

const lines = readFileSync("/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl", "utf8").split("\n")
for (const argument of process.argv.slice(2)) {
	const record = JSON.parse(lines[Number(argument) - 1]!)
	process.stdout.write(`line ${argument}: batch=${record.batch} image=${record.image}\n`)
	process.stdout.write(`  comparison=${record.comparison} labels=${JSON.stringify(record.labels)}\n`)
	process.stdout.write(`  preference=${JSON.stringify(record.preference)} verdict=${record.verdict} applies=${JSON.stringify(record.verdictApplies)}\n`)
	for (const [label, palette] of Object.entries(record.palettes ?? {})) {
		const p = palette as any
		process.stdout.write(`  ${label}: bg=${p.background.hex} surface=${p.surface.hex} fg=${p.foreground.hex} accent=${p.accent.hex} ` +
			`${p.gradient ? "gradient" : "flat"} midpoint=${p.midpoint ?? "none"}\n`)
	}
	process.stdout.write(`  corrections=${JSON.stringify(record.corrections)}\n`)
	process.stdout.write(`  tags=${JSON.stringify(record.tags)}\n`)
	process.stdout.write(`  notes: ${record.notes}\n`)
}
