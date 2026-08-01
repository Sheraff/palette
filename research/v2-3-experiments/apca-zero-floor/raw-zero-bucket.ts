/**
 * Look inside the zero bucket.
 *
 * `apcaContrast` reports exactly 0 for every pair whose raw magnitude is under 10, so the census's
 * "exactly zero" class lumps together two very different things: colours at genuinely identical
 * lightness, and colours a viewer can faintly separate. The raw form distinguishes them, and the
 * question this answers is whether the floor should be "clamped 0" (the whole bucket) or something
 * nearer "raw ~0" (only the genuinely invisible), which would shrink the defect class.
 *
 * Nothing needs re-extracting: raw contrast is a function of the two published colours, and the
 * census already stores every palette.
 *
 * Usage: raw-zero-bucket.ts [--census <dir>]
 */
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { artworkIdentity, loadCensus, type CensusRow } from "./analyse.ts"

const { values } = parseArgs({ options: { census: { type: "string" } }, strict: true })
const rows = loadCensus(values.census ? resolve(values.census) : undefined).filter((row) => !row.error)
const byIdentity = new Map<string, CensusRow>()
for (const row of rows) if (!byIdentity.has(artworkIdentity(row.path))) byIdentity.set(artworkIdentity(row.path), row)
const unique = [...byIdentity.values()]

const rgb = (hex: string): RGB =>
	[parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

const PAIRS = [
	{ name: "foreground-surface", mark: "foreground", field: "surface", applies: (r: CensusRow) => !r.collapse.surface },
	{ name: "foreground-background", mark: "foreground", field: "background", applies: () => true },
	{ name: "accent-surface", mark: "accent", field: "surface", applies: (r: CensusRow) => !r.collapse.surface && !r.collapse.accent },
	{ name: "accent-background", mark: "accent", field: "background", applies: (r: CensusRow) => !r.collapse.accent },
] as const

process.stdout.write(`${unique.length} distinct artworks\n`)
process.stdout.write(`\nAPCA reports exactly 0 whenever the raw magnitude is below 10. Inside that bucket the\n`)
process.stdout.write(`raw value still varies, and it is the only thing that says HOW unreadable a pair is.\n`)

const BANDS = [0.5, 1, 2, 3, 5, 7, 10]
for (const pair of PAIRS) {
	const bucket = unique.filter((row) => {
		if (!pair.applies(row)) return false
		const raw = apcaRawContrast(rgb(row[pair.mark] as string), rgb(row[pair.field] as string))
		return Math.abs(raw) < 10
	}).map((row) => ({
		row,
		raw: Math.abs(apcaRawContrast(rgb(row[pair.mark] as string), rgb(row[pair.field] as string))),
	})).sort((a, b) => a.raw - b.raw)

	process.stdout.write(`\n--- ${pair.name}: ${bucket.length} artworks in the clamped-zero bucket ---\n`)
	if (bucket.length === 0) continue
	let previous = 0
	for (const band of BANDS) {
		const count = bucket.filter(({ raw }) => raw < band).length
		process.stdout.write(`  raw |Lc| < ${String(band).padStart(4)}: ${String(count).padStart(4)}` +
			`  (+${count - previous})\n`)
		previous = count
	}
	const median = bucket[Math.floor(bucket.length / 2)]!.raw
	process.stdout.write(`  smallest ${bucket[0]!.raw.toFixed(3)}, median ${median.toFixed(3)}, largest ${bucket.at(-1)!.raw.toFixed(3)}\n`)
	if (pair.name === "foreground-surface" || pair.name === "foreground-background") {
		process.stdout.write(`  every member, least readable first:\n`)
		for (const { row, raw } of bucket) {
			process.stdout.write(`    raw ${raw.toFixed(3).padStart(6)}  ${row.path.split("/").slice(-2).join("/")}\n`)
			process.stdout.write(`      bg=${row.background} surface=${row.surface} fg=${row.foreground} accent=${row.accent}` +
				`${row.gradient ? " gradient" : " flat"}\n`)
		}
	}
}
