import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { perceptualDifference } from "../../v2-3/src/internal/color.ts"
import { loadVerdicts } from "../../v2-3-eval/src/warehouse.ts"

import type { Measurement } from "./measure.ts"

/**
 * Sensitivity study for the criterion's currency.
 *
 * The absolute excursion is measured in ΔE and therefore grows with the length of the ramp: a blue to
 * green sweep has far more room to leave the artwork than a teal to oxblood one, whatever the artwork
 * holds. This ranks the same measurements by excursion as a *share* of the endpoint separation, which
 * asks the scale-free version of the question — of the distance this ramp travels, how much of it is
 * spent away from the artwork?
 */

const here = resolve(fileURLToPath(import.meta.url), "..")
const dataDir = resolve(here, "data", process.argv[2] ?? "ranked")

const hexToRgb = (hex: string): [number, number, number] => {
	const value = Number.parseInt(hex.replace("#", ""), 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const measurements: Measurement[] = readdirSync(dataDir).filter((name) => name.endsWith(".json"))
	.map((name) => JSON.parse(readFileSync(resolve(dataDir, name), "utf8")) as Measurement)

const verdicts = await loadVerdicts(resolve(here, "../../v2-3-eval/data/verdicts.jsonl"))
const judged = new Map<string, string[]>()
for (const record of verdicts) {
	if (record.verdict === null) continue
	const applies = record.verdictApplies.length > 0 ? record.verdictApplies
		: record.preference.label !== null ? [record.preference.label] : Object.keys(record.palettes)
	for (const label of applies) {
		const palette = record.palettes[label] as { background?: { hex: string }; surface?: { hex: string }; foreground?: { hex: string }; accent?: { hex: string } } | undefined
		if (!palette?.background || !palette.surface || !palette.foreground || !palette.accent) continue
		const key = `${record.image}|${palette.background.hex}/${palette.surface.hex}/${palette.foreground.hex}/${palette.accent.hex}`
		judged.set(key, [...(judged.get(key) ?? []), `${record.verdict}:L${record.line + 1}`])
	}
}

const rows = measurements.filter(({ gradient }) => gradient).map((measurement) => {
	const span = perceptualDifference(hexToRgb(measurement.background), hexToRgb(measurement.surface))
	const key = `${measurement.image}|${measurement.background}/${measurement.surface}/${measurement.foreground}/${measurement.accent}`
	const records = judged.get(key) ?? []
	return {
		measurement,
		span,
		share: measurement.excursionBefore / Math.max(1e-6, span),
		verdict: records.some((entry) => entry.startsWith("strong")) ? "strong"
			: records.some((entry) => entry.startsWith("acceptable")) ? "acceptable"
				: records.length > 0 ? records[0]!.split(":")[0]! : "unreviewed",
		records,
	}
}).sort((first, second) => second.share - first.share)

const short = (image: string): string => image.replace(/\.(jpg|jpeg|png|avif)$/iu, "").slice(-8)
const lines = ["| artwork | bg | surface | span ΔE | excursion | share | verdict |", "| --- | --- | --- | --- | --- | --- | --- |"]
for (const row of rows) {
	lines.push(`| \`${short(row.measurement.image)}\` | ${row.measurement.background} | ${row.measurement.surface} `
		+ `| ${row.span.toFixed(1)} | ${row.measurement.excursionBefore.toFixed(2)} | ${row.share.toFixed(3)} | ${row.verdict} ${row.records.join(",")} |`)
}
process.stdout.write(`${lines.join("\n")}\n`)
