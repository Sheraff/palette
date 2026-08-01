/**
 * Build the `sr-ask` label: each salience target's CURRENT published treatment with the accent
 * slot replaced by the accent the reviewer themselves prescribed.
 *
 *   node --no-warnings --experimental-strip-types .../build-ask.ts <sourceLabel> <askLabel>
 *
 * WHAT THIS IS AND IS NOT. This is **not an algorithm output** and must never be read as one. No
 * mechanism produced it; it is the reviewer's own answer pasted into the reviewer's own field, so
 * that the ask can be judged in situ for the first time. Three arms have now tried to reach this
 * accent through the algorithm and none published it, so the open question is no longer "how do we
 * get there" but "is this actually preferred once it is on screen" — a question only review can
 * answer, and only if it can see the thing.
 *
 * Every record written here carries `"synthetic": true` and the prescription's provenance. The
 * batch manifest and EXPERIMENT.md both restate it.
 *
 * Honesty check: the review UI serves correction chips that are exact artwork pixels (plus the two
 * proposed palettes' own colours), so a prescription should be a colour the artwork really contains.
 * This script verifies that against the real pixels and refuses to write a record whose accent is
 * absent from the artwork, rather than quietly fabricating a colour (charter rule 4's standard).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { SALIENCE } from "./salience-set.ts"

sharp.concurrency(1)

const [sourceLabel, askLabel] = process.argv.slice(2)
if (!sourceLabel || !askLabel) throw new Error("usage: build-ask.ts <sourceLabel> <askLabel>")

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const resultsRoot = resolve(worktreeRoot, "research/v2-3-eval/data/results")
const outDir = resolve(resultsRoot, askLabel)
mkdirSync(outDir, { recursive: true })

function readResult(label: string, image: string) {
	for (const name of [image, `${image}.jpg`, `${image}.jpeg`, `${image}.png`, `${image}.avif`]) {
		const p = resolve(resultsRoot, label, `${name}.json`)
		if (existsSync(p)) return { path: p, name, record: JSON.parse(readFileSync(p, "utf8")) }
	}
	return null
}

/**
 * Asks a LATER verdict has already overruled, computed by `analysis/standing-asks.ts` against the
 * live warehouse and pasted here so this script stays offline-reproducible. Each was graded `strong`
 * on a different accent with no correction, which under the charter's verdict-recency rule withdraws
 * the earlier ask:
 *   132 -> line 246 (batch-31) graded #15a6a9 strong
 *   135 -> line 194 (batch-28) graded #bdf369 strong
 *   178 -> line 193 (batch-28) graded #f22632 strong   (also a pinned guardrail, pinned the other way)
 * Putting a withdrawn ask in front of review would be re-litigating a decision already made.
 */
const SUPERSEDED = new Set([132, 135, 178])

// one record per distinct artwork; a later case for the same artwork overwrites an earlier one,
// which is the charter's latest-wins rule applied to prescriptions
const seen = new Set<string>()
let written = 0, missing = 0, absentColor = 0

for (const kase of [...SALIENCE].reverse()) {
	if (SUPERSEDED.has(kase.idx)) continue
	if (seen.has(kase.image)) continue
	seen.add(kase.image)
	const found = readResult(sourceLabel, kase.image)
	if (!found) { process.stdout.write(`  [no ${sourceLabel} result] ${kase.image}\n`); missing++; continue }
	const artworkPath = resolveArtwork(kase.image)
	if (!artworkPath) { process.stdout.write(`  [unresolved artwork] ${kase.image}\n`); missing++; continue }

	const rgb = hexToRgb(kase.prescribed)
	const image = await loadNativeImage(artworkPath)
	let present = false
	for (let i = 0; i < image.width * image.height && !present; i++) {
		const o = i * 3
		if (image.data[o] === rgb[0] && image.data[o + 1] === rgb[1] && image.data[o + 2] === rgb[2]) present = true
	}
	if (!present) {
		process.stdout.write(`  [prescribed colour ${kase.prescribed} is NOT an exact pixel of ${kase.image}] skipped\n`)
		absentColor++
		continue
	}

	const record = found.record
	const winner = record.extraction.winner
	const askRecord = {
		...record,
		label: askLabel,
		synthetic: true,
		syntheticProvenance: {
			kind: "reviewer-prescribed-accent",
			note: "Not an algorithm output. The source label's published treatment with the accent slot " +
				"replaced by the accent this reviewer prescribed, so the standing ask can be judged in situ.",
			sourceLabel,
			verdictIndex: kase.idx,
			prescribedAccent: kase.prescribed,
			replacedAccent: winner.accent.hex,
			prescribedIsExactArtworkPixel: true,
		},
		extraction: {
			...record.extraction,
			winner: {
				...winner,
				accent: { rgb, oklab: rgbToOKLab(rgb), hex: kase.prescribed, generated: false },
				collapse: { ...winner.collapse, accent: false },
			},
		},
	}
	writeFileSync(resolve(outDir, `${found.name}.json`), JSON.stringify(askRecord, null, "\t") + "\n")
	process.stdout.write(`  ${found.name}  accent ${winner.accent.hex} -> ${kase.prescribed} (idx ${kase.idx})\n`)
	written++
}

process.stdout.write(`\nwrote ${written} synthetic record(s) to ${outDir}; ${missing} missing, ${absentColor} with a prescription absent from the artwork\n`)
