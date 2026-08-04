/**
 * A labelled contact sheet of the round-2 **shortlist** — the covers that qualified on the stated
 * numeric criteria and had to be looked at before one per class was chosen.
 *
 * The numbers (swap margin, edge fraction, published min-ramp |APCA|, ρ) select a *pool*; which
 * member of the pool makes the best review item is a per-cover judgment no number carries — is the
 * swap visibly consequential, is the busy cover actually busy, does the low-contrast ink look like
 * the designer's ink. So the pool was looked at, and this builds the exact image that was looked at,
 * labelled with the coverage run's own zero-based index.
 *
 *   node research/v3/prototypes/p3-fields/review-rounds/round-2-calibration/shortlist-sheet.mjs
 *
 * Writes `shortlist-sheet.jpg` beside this file. A working artefact of selection; never shown to the
 * reviewer, and not evidence of anything.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUN = join(HERE, "..", "..", "measurements", "run-coverage-220-0.3.0.jsonl")

/** The pool, by coverage-run index, grouped by the criterion that put it there. */
const SHORTLIST = [
	{ index: 19, tag: "swap-wide" },
	{ index: 57, tag: "swap-wide" },
	{ index: 163, tag: "swap-wide" },
	{ index: 170, tag: "swap-wide" },
	{ index: 211, tag: "swap-wide" },
	{ index: 14, tag: "swap-tie" },
	{ index: 10, tag: "swap-tie" },
	{ index: 52, tag: "swap-tie" },
	{ index: 172, tag: "busy" },
	{ index: 138, tag: "busy" },
	{ index: 112, tag: "busy" },
	{ index: 63, tag: "busy" },
	{ index: 44, tag: "ink-low" },
	{ index: 89, tag: "ink-low" },
	{ index: 69, tag: "ink-low" },
	{ index: 156, tag: "ink-low" },
	{ index: 90, tag: "grad" },
	{ index: 175, tag: "grad" },
	{ index: 73, tag: "grad" },
	{ index: 137, tag: "grad" },
]

const rows = new Map()
for (const line of readFileSync(RUN, "utf8").trim().split("\n")) {
	const parsed = JSON.parse(line)
	if (parsed.kind === "devloop-run-row") rows.set(parsed.index, parsed)
}

const TILE = 200
const LABEL = 24
const COLUMNS = 5
const rowCount = Math.ceil(SHORTLIST.length / COLUMNS)

const composites = []
for (const [position, entry] of SHORTLIST.entries()) {
	const row = rows.get(entry.index)
	const column = position % COLUMNS
	const line = Math.floor(position / COLUMNS)
	composites.push({
		input: await sharp(row.imagePath).resize(TILE, TILE, { fit: "cover" }).png().toBuffer(),
		left: column * TILE,
		top: line * (TILE + LABEL) + LABEL,
	})
	composites.push({
		input: Buffer.from(
			`<svg width="${TILE}" height="${LABEL}"><rect width="${TILE}" height="${LABEL}" fill="#fff"/>` +
				`<text x="4" y="18" font-family="monospace" font-size="16" fill="#000">${String(entry.index).padStart(3, "0")} ${entry.tag}</text></svg>`,
		),
		left: column * TILE,
		top: line * (TILE + LABEL),
	})
}

await sharp({
	create: { width: COLUMNS * TILE, height: rowCount * (TILE + LABEL), channels: 3, background: "#fff" },
})
	.composite(composites)
	.jpeg({ quality: 90 })
	.toFile(join(HERE, "shortlist-sheet.jpg"))

console.log(`shortlist-sheet.jpg — ${SHORTLIST.length} covers`)
