/**
 * The displayed winner for a set of images — the four role hexes, the gradient flag, and
 * the source-supported midpoint — written machine-readably so two runs of a toggled build
 * can be diffed as palettes rather than as opaque hashes.
 *
 *   PALETTE_IMAGES_ROOT=/abs/path/to/images node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/winners.ts --out <path> [--set base|...] [id...]
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/winners.ts --compare <before.json> <after.json>
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { extractPalette } from "../../v2-3/index.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"

import { corpusEntries, imagesRoot } from "./corpus.ts"

type Winner = Readonly<{
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	midpoint: string
}>

const args = process.argv.slice(2)

function flag(name: string): string | null {
	const index = args.indexOf(name)
	return index >= 0 ? args[index + 1] ?? null : null
}

if (args.includes("--compare")) {
	const index = args.indexOf("--compare")
	const before: Record<string, Winner> = JSON.parse(await readFile(args[index + 1], "utf8")).winners
	const after: Record<string, Winner> = JSON.parse(await readFile(args[index + 2], "utf8")).winners
	const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
	const fields = ["background", "surface", "foreground", "accent", "gradient", "midpoint"] as const
	let differing = 0
	for (const id of ids) {
		const first = before[id]
		const second = after[id]
		if (!first || !second) {
			console.log(`MISSING ${id}`)
			differing += 1
			continue
		}
		const changed = fields.filter((field) => String(first[field]) !== String(second[field]))
		if (changed.length === 0) continue
		differing += 1
		console.log(`DIFF ${id}`)
		for (const field of changed) console.log(`  ${field.padEnd(11)} ${first[field]} -> ${second[field]}`)
	}
	console.log(`\n${ids.length} image(s) compared, ${differing} differ`)
	process.exit(0)
}

const set = flag("--set")
const out = flag("--out")
const explicit = args.filter((value, index) =>
	!value.startsWith("--") && !(index > 0 && args[index - 1].startsWith("--")))
const entries = explicit.length > 0
	? explicit.map((name) => ({ id: `images/${name}`, path: resolve(imagesRoot, name) }))
	: corpusEntries(set ?? "base")

console.log(`${entries.length} image(s) from ${imagesRoot}\n`)
const winners: Record<string, Winner> = {}
for (const [index, entry] of entries.entries()) {
	const extraction = extractPalette(await loadNativeImage(await readFile(entry.path)))
	const stop = extraction.researchRender?.field.stops[1]
	const winner: Winner = {
		background: extraction.winner.background.hex,
		surface: extraction.winner.surface.hex,
		foreground: extraction.winner.foreground.hex,
		accent: extraction.winner.accent.hex,
		gradient: extraction.winner.gradient,
		midpoint: stop && stop.kind === "source-supported-color" ? stop.hex : "none",
	}
	winners[entry.id] = winner
	console.log(`[${index + 1}/${entries.length}] ${entry.id.padEnd(46)} `
		+ `${winner.background} ${winner.surface} ${winner.foreground} ${winner.accent} `
		+ `${winner.gradient ? "gradient" : "flat"} mid=${winner.midpoint}`)
}

if (out) {
	await writeFile(out, `${JSON.stringify({ imagesRoot, winners }, null, "\t")}\n`)
	console.log(`\n-> ${out}`)
}
