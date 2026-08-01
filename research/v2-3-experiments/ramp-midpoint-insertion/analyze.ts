import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadVerdicts } from "../../v2-3-eval/src/warehouse.ts"
import type { VerdictRecord } from "../../v2-3-eval/src/warehouse.ts"

import type { Measurement } from "./measure.ts"
import { RAMP_EXCURSION_BAR, SAME_COLOR } from "./criterion.ts"

/**
 * Corpus aggregation for the ramp-midpoint arm.
 *
 * Three questions, in order:
 *  1. Does the excursion criterion separate the gradients the reviewer called strong from the ones
 *     the reviewer said do not belong to the artwork?
 *  2. With the flag on, what moves?
 *  3. Does anything that moves have a verdict standing behind exactly the palette it moves?
 *
 * Everything here is computed from measurements taken with the flag OFF; the "after" column is the
 * mechanism's own arithmetic replayed over that measured ranking, so no number in the "before" column
 * was produced by the mechanism.
 */

const here = resolve(fileURLToPath(import.meta.url), "..")
const dataDir = resolve(here, "data", process.argv[2] ?? "measurements")
const verdictsPath = resolve(here, "../../v2-3-eval/data/verdicts.jsonl")

const measurements: Measurement[] = readdirSync(dataDir).filter((name) => name.endsWith(".json"))
	.map((name) => JSON.parse(readFileSync(resolve(dataDir, name), "utf8")) as Measurement)
	.sort((first, second) => (first.image < second.image ? -1 : 1))

const verdicts = await loadVerdicts(verdictsPath)

/** The nomination the mechanism makes at `bar`, replayed from the measured ranking. */
function nominate(measurement: Measurement, bar: number): Measurement["candidates"][number] | null {
	const eligible = measurement.candidates.filter(({ excursionAfter }) => excursionAfter < bar)
	if (eligible.length === 0) return null
	const floor = eligible[0]!.excursionAfter
	const tied = eligible.filter(({ excursionAfter }) => excursionAfter <= floor + SAME_COLOR)
	let best = tied[0]!
	for (const candidate of tied.slice(1)) {
		if (candidate.populationFraction > best.populationFraction) { best = candidate; continue }
		if (candidate.populationFraction < best.populationFraction) continue
		if (candidate.hex < best.hex) best = candidate
	}
	return best
}

type JudgedPalette = Readonly<{
	image: string
	key: string
	gradient: boolean
	midpoint: string | null
	verdict: string
	batch: string
	line: number
	notes: string
}>

function paletteKey(palette: Readonly<Record<"background" | "surface" | "foreground" | "accent", { hex: string }>>): string {
	return [palette.background.hex, palette.surface.hex, palette.foreground.hex, palette.accent.hex].join("/")
}

/**
 * A verdict is bound to the *palette*, not to the artwork: an artwork whose published palette has
 * since changed carries no endorsement of the new one. `verdictApplies` names the labels the verdict
 * covers; when it is empty the preferred label carries it, and when there is no preference either the
 * verdict covers both sides of the A/B.
 */
function judgedPalettes(record: VerdictRecord): JudgedPalette[] {
	if (record.verdict === null) return []
	const applies = record.verdictApplies.length > 0
		? record.verdictApplies
		: record.preference.label !== null ? [record.preference.label] : Object.keys(record.palettes)
	return applies.flatMap((label) => {
		const palette = record.palettes[label] as {
			background?: { hex: string }; surface?: { hex: string }; foreground?: { hex: string }
			accent?: { hex: string }; gradient?: boolean; midpoint?: { hex?: string } | string | null
		} | undefined
		if (!palette?.background || !palette.surface || !palette.foreground || !palette.accent) return []
		const midpoint = typeof palette.midpoint === "string" ? palette.midpoint
			: palette.midpoint && typeof palette.midpoint === "object" && typeof palette.midpoint.hex === "string"
				? palette.midpoint.hex : null
		return [{
			image: record.image,
			key: paletteKey(palette as never),
			gradient: palette.gradient === true,
			midpoint,
			verdict: record.verdict!,
			batch: record.batch,
			line: record.line + 1,
			notes: record.notes,
		}]
	})
}

const judgedByImageKey = new Map<string, JudgedPalette[]>()
for (const entry of verdicts.flatMap(judgedPalettes)) {
	const key = `${entry.image}|${entry.key}`
	judgedByImageKey.set(key, [...(judgedByImageKey.get(key) ?? []), entry])
}

const gradients = measurements.filter(({ gradient }) => gradient)

type Row = Readonly<{
	measurement: Measurement
	applicable: readonly JudgedPalette[]
	strongest: string
}>

const rows: Row[] = gradients.map((measurement) => {
	const key = `${measurement.image}|${[measurement.background, measurement.surface, measurement.foreground, measurement.accent].join("/")}`
	const applicable = judgedByImageKey.get(key) ?? []
	const strongest = applicable.some(({ verdict }) => verdict === "strong") ? "strong"
		: applicable.some(({ verdict }) => verdict === "acceptable") ? "acceptable"
			: applicable.length > 0 ? applicable[0]!.verdict : "unreviewed"
	return { measurement, applicable, strongest }
}).sort((first, second) => second.measurement.excursionBefore - first.measurement.excursionBefore)

const lines: string[] = []
const say = (text = ""): void => { lines.push(text) }
const short = (image: string): string => image.replace(/\.(jpg|jpeg|png|avif)$/iu, "").slice(-8)

say(`measurements: ${measurements.length} artworks, ${gradients.length} gradient, ${measurements.length - gradients.length} flat`)
say(`shipped excursion bar: ${RAMP_EXCURSION_BAR.toFixed(2)} ΔE`)
say()

say("## 1. Gradient artworks by excursion (flag off, exactly as published today)")
say()
say("| artwork | bg | surface | midpoint | origin | excursion | worst t | chord-only | verdict on this exact palette |")
say("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for (const { measurement, applicable, strongest } of rows) {
	const record = applicable.length === 0 ? "unreviewed"
		: `${strongest} (${[...new Set(applicable.map(({ line }) => `L${line}`))].join(",")})`
	say(`| \`${short(measurement.image)}\` | ${measurement.background} | ${measurement.surface} `
		+ `| ${measurement.publishedMidpoint ?? "—"} | ${measurement.publishedMidpointOrigin ?? "—"} `
		+ `| ${measurement.excursionBefore.toFixed(2)} | ${measurement.worstPosition} | ${measurement.chordExcursion.toFixed(2)} `
		+ `| ${record} |`)
}

say()
say("## 2. Separation")
say()
const quantiles = (values: number[]): string => {
	const sorted = [...values].sort((first, second) => first - second)
	const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? NaN
	return `n=${sorted.length} · min ${sorted[0]?.toFixed(2)} · p25 ${at(0.25).toFixed(2)} · median ${at(0.5).toFixed(2)} · p75 ${at(0.75).toFixed(2)} · p90 ${at(0.9).toFixed(2)} · max ${sorted.at(-1)?.toFixed(2)}`
}
const strongRows = rows.filter(({ strongest }) => strongest === "strong")
const reviewedRows = rows.filter(({ applicable }) => applicable.length > 0)
say(`all gradients:       ${quantiles(rows.map(({ measurement }) => measurement.excursionBefore))}`)
say(`reviewed gradients:  ${quantiles(reviewedRows.map(({ measurement }) => measurement.excursionBefore))}`)
say(`strong gradients:    ${quantiles(strongRows.map(({ measurement }) => measurement.excursionBefore))}`)
say()
const addOnly = rows.filter(({ measurement }) => measurement.publishedMidpoint === null)
say()
say(`Restricted to the add-only subset — the ${addOnly.length} gradients publishing no third stop today:`)
say(`  all:    ${quantiles(addOnly.map(({ measurement }) => measurement.excursionBefore))}`)
say(`  strong: ${quantiles(addOnly.filter(({ strongest }) => strongest === "strong").map(({ measurement }) => measurement.excursionBefore))}`)
say()
say("| bar | fires | with a nominee | reviewed strong | reviewed acceptable | unreviewed |")
say("| --- | --- | --- | --- | --- | --- |")
for (const bar of [5, 6, 6.6, 7, 7.5, 7.9, 8.25, 9, 9.2, 9.9, 11, 13.2]) {
	const fired = addOnly.filter(({ measurement }) => measurement.excursionBefore >= bar)
	const moved = fired.map((row) => ({ row, nominee: nominate(row.measurement, bar) }))
		.filter(({ nominee }) => nominee !== null)
	say(`| ${bar.toFixed(2)} | ${fired.length} | ${moved.length} `
		+ `| ${moved.filter(({ row }) => row.strongest === "strong").length} `
		+ `| ${moved.filter(({ row }) => row.strongest === "acceptable").length} `
		+ `| ${moved.filter(({ row }) => row.strongest === "unreviewed").length} |`)
}

say()
say("## 3. Flag on: blast radius at the shipped bar")
say()
const fired = addOnly.filter(({ measurement }) => measurement.excursionBefore >= RAMP_EXCURSION_BAR)
const withNominee = fired.map((row) => ({ row, nominee: nominate(row.measurement, RAMP_EXCURSION_BAR) }))
const movers = withNominee.filter(({ nominee }) => nominee !== null)
say(`gradient artworks:                ${gradients.length}`)
say(`published midpoints today:        ${gradients.filter(({ publishedMidpoint }) => publishedMidpoint !== null).length}`)
say(`in scope (gradient, no midpoint): ${addOnly.length}`)
say(`criterion fires:                  ${fired.length}`)
say(`  no nominee clears the bar:      ${withNominee.filter(({ nominee }) => nominee === null).length}`)
say(`  gain a midpoint:                ${movers.length}`)
say(`existing midpoints changed:       0 (structural — this route never replaces)`)
say(`gradient boolean changes:         0 (structural — see EXPERIMENT.md §4)`)
say()
say("### Movers, largest excursion reduction first")
say()
say("| artwork | bg | surface | before | after | midpoint before | midpoint after | population | verdict on this exact palette | reviewer note |")
say("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for (const { row, nominee } of [...movers].sort((first, second) =>
	(second.row.measurement.excursionBefore - second.nominee!.excursionAfter)
	- (first.row.measurement.excursionBefore - first.nominee!.excursionAfter))) {
	const { measurement, applicable, strongest } = row
	const record = applicable.length === 0 ? "unreviewed"
		: `${strongest} (${[...new Set(applicable.map(({ line }) => `L${line}`))].join(",")})`
	const note = applicable.map(({ notes }) => notes).find((text) => text.length > 0) ?? ""
	say(`| \`${short(measurement.image)}\` | ${measurement.background} | ${measurement.surface} `
		+ `| ${measurement.excursionBefore.toFixed(2)} | ${nominee!.excursionAfter.toFixed(2)} `
		+ `| ${measurement.publishedMidpoint ?? "—"} | ${nominee!.hex} | ${(nominee!.populationFraction * 100).toFixed(1)}% `
		+ `| ${record} | ${note.slice(0, 80).replace(/[|\n]/gu, " ")} |`)
}

say()
say("### Fired but found no nominee")
say()
for (const { row } of withNominee.filter(({ nominee }) => nominee === null)) {
	say(`- \`${short(row.measurement.image)}\` ${row.measurement.background} -> ${row.measurement.surface}, `
		+ `excursion ${row.measurement.excursionBefore.toFixed(2)}, ${row.measurement.candidates.length} gate-passing candidates, `
		+ `best reachable ${row.measurement.candidates[0]?.excursionAfter.toFixed(2) ?? "none"} — ${row.strongest}`)
}

say()
say("## 4. Warehouse check: every mover's verdict record")
say()
if (movers.every(({ row }) => row.applicable.length === 0)) say("No mover's exact published palette carries a verdict.")
for (const { row, nominee } of movers) {
	for (const entry of row.applicable) {
		say(`- \`${short(row.measurement.image)}\` -> ${nominee!.hex} · L${entry.line} \`${entry.batch}\` **${entry.verdict}** `
			+ `(gradient ${entry.gradient}, midpoint ${entry.midpoint ?? "none"}) — ${entry.notes.slice(0, 200).replace(/\n/gu, " ")}`)
	}
}

process.stdout.write(`${lines.join("\n")}\n`)
