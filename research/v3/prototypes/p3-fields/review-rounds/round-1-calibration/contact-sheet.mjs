/**
 * A labelled 5×4 contact sheet of the `demo-20` set, in run-index order.
 *
 * Selection needed a per-cover judgment no number in the run file carries — *is there type on this
 * cover*, *is it a photograph*, *is it busy* — so the covers were looked at. This builds the one
 * image that was looked at, labelled with the same zero-based run index the item ids carry, so the
 * classification in `ROUND.md` can be re-checked rather than taken on trust.
 *
 *   node research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/contact-sheet.mjs
 *
 * Writes `contact-sheet.jpg` beside this file. The sheet is a working artefact of selection; it is
 * not shown to the reviewer and is not evidence of anything.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const HERE = dirname(fileURLToPath(import.meta.url))

const rows = readFileSync(join(HERE, "run-demo-20-0.2.0.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line))
	.filter((line) => line.kind === "devloop-run-row")

const TILE = 170
const LABEL = 22
const COLUMNS = 5
const rowCount = Math.ceil(rows.length / COLUMNS)

const composites = []
for (const row of rows) {
	const column = row.index % COLUMNS
	const line = Math.floor(row.index / COLUMNS)
	composites.push({
		input: await sharp(row.imagePath).resize(TILE, TILE, { fit: "cover" }).png().toBuffer(),
		left: column * TILE,
		top: line * (TILE + LABEL) + LABEL,
	})
	composites.push({
		input: Buffer.from(
			`<svg width="${TILE}" height="${LABEL}"><rect width="${TILE}" height="${LABEL}" fill="#fff"/>` +
				`<text x="4" y="16" font-family="monospace" font-size="15" fill="#000">idx ${String(row.index).padStart(2, "0")}</text></svg>`,
		),
		left: column * TILE,
		top: line * (TILE + LABEL),
	})
}

await sharp({
	create: { width: COLUMNS * TILE, height: rowCount * (TILE + LABEL), channels: 3, background: "#fff" },
})
	.composite(composites)
	.jpeg({ quality: 88 })
	.toFile(join(HERE, "contact-sheet.jpg"))

console.log(`contact-sheet.jpg — ${rows.length} covers`)
