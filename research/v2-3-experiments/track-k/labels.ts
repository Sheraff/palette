/**
 * Track K label harness. Runs a case list through `research/v2-3` and writes one
 * JSON record per case, so a trunk baseline and a candidate build can be diffed
 * exactly.
 *
 * Corpus discipline (charter, 2026-07-31): artwork is resolved through
 * `research/v2-3/test/corpus.ts`, i.e. `PALETTE_IMAGES_ROOT`. Running against a
 * worktree's `images/` would silently measure the `-scrambled` decoys.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/labels.ts <out.json> [caseListFile]
 */
import { readFile, writeFile } from "node:fs/promises"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

export type Label = Readonly<{
	case: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapse: readonly [boolean, boolean]
	midpoint: string | null
	error?: string
}>

const [outputPath, caseListPath] = process.argv.slice(2)
if (!outputPath) {
	console.error("usage: labels.ts <out.json> [caseListFile]")
	process.exit(1)
}

const cases = caseListPath
	? (await readFile(caseListPath, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean)
	: reviewFixtures.map(({ caseId }) => `images/${caseId}`)

const labels: Record<string, Label> = {}
for (const [index, entry] of cases.entries()) {
	try {
		const { winner, researchRender } = await extractPaletteFromBytes(corpusPath(entry))
		labels[entry] = {
			case: entry,
			background: winner.background.hex,
			surface: winner.surface.hex,
			foreground: winner.foreground.hex,
			accent: winner.accent.hex,
			gradient: winner.gradient,
			collapse: [winner.collapse.surface, winner.collapse.accent],
			midpoint: researchRender?.field.stops[1].hex ?? null,
		}
	} catch (cause) {
		labels[entry] = {
			case: entry,
			background: "",
			surface: "",
			foreground: "",
			accent: "",
			gradient: false,
			collapse: [false, false],
			midpoint: null,
			error: cause instanceof Error ? cause.message : String(cause),
		}
	}
	if ((index + 1) % 20 === 0) console.error(`  ${index + 1}/${cases.length}`)
}
await writeFile(outputPath, `${JSON.stringify(labels, null, "\t")}\n`)
console.error(`wrote ${Object.keys(labels).length} labels to ${outputPath}`)
