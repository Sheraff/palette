/**
 * Which field-hypothesis producer the winning treatment came from, and whether the winner
 * carries a measured `endpointBandSpread`.
 *
 * This is the reason F8's fix is byte-preserving: the band-extent guard only ever
 * arbitrates between candidates that reach the final comparison, and if the two producers
 * whose spread was missing never produce a winner, completing their data cannot move one.
 * That is an explanation the sweep alone cannot give, so it is measured rather than assumed.
 *
 *   PALETTE_IMAGES_ROOT=/abs/path/to/images node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/winner-source.ts [--set base|offpanel|...] [--json <path>]
 */
import { readFile, writeFile } from "node:fs/promises"

import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"

import { corpusEntries, imagesRoot } from "./corpus.ts"

function sourceOf(hypothesisId: string): string {
	if (hypothesisId.startsWith("gradient:")) return "seed gradient fit"
	if (hypothesisId.startsWith("endpoint-refinement:")) return "band-local-endpoint"
	if (hypothesisId.startsWith("field-transition:")) return "native-field-transition"
	if (hypothesisId.startsWith("native-transition")) return "native-field-transition"
	return `seed flat (${hypothesisId.split(":")[0]})`
}

const args = process.argv.slice(2)
const setIndex = args.indexOf("--set")
const set = setIndex >= 0 ? args[setIndex + 1] : "base"
const jsonIndex = args.indexOf("--json")
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null

const entries = corpusEntries(set)
console.log(`${entries.length} image(s) from ${imagesRoot} (--set ${set})\n`)

type Row = Readonly<{
	id: string
	source: string
	hypothesisId: string
	gradient: boolean
	endpointBandSpread: number | null
}>

const rows: Row[] = []
for (const [index, entry] of entries.entries()) {
	const image = await loadNativeImage(await readFile(entry.path))
	const details = extractPaletteDetails(image)
	const row: Row = {
		id: entry.id,
		source: sourceOf(details.winner.sourceFieldHypothesisId),
		hypothesisId: details.winner.sourceFieldHypothesisId,
		gradient: details.winner.gradient,
		endpointBandSpread: details.winner.scores.endpointBandSpread,
	}
	rows.push(row)
	console.log(`[${index + 1}/${entries.length}] ${entry.id.padEnd(46)} ${row.source.padEnd(26)} `
		+ `${row.gradient ? "gradient" : "flat    "} spread=${row.endpointBandSpread === null ? "unmeasured" : row.endpointBandSpread.toFixed(5)}`)
}

const bySource = new Map<string, number>()
for (const { source } of rows) bySource.set(source, (bySource.get(source) ?? 0) + 1)
console.log(`\n== winners by producer (--set ${set}) ==`)
for (const [source, count] of [...bySource].sort()) console.log(`${source.padEnd(30)} ${count}`)
const gradients = rows.filter(({ gradient }) => gradient)
const unmeasured = gradients.filter(({ endpointBandSpread }) => endpointBandSpread === null)
console.log(`\n${gradients.length} gradient winner(s), ${unmeasured.length} with an unmeasured band spread`)

if (jsonPath) {
	await writeFile(jsonPath, `${JSON.stringify({ imagesRoot, set, rows }, null, "\t")}\n`)
	console.log(`\n-> ${jsonPath}`)
}
