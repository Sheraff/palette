/**
 * Track G corpus runner.
 *
 * Cases are the union of the three current-trunk eval label sets
 * (`trunk-h`, `trunk-f`, `trunk-a5`) under `research/v2-3-eval/data/results/`:
 * the 34 review fixtures, their `-scrambled` decoys, and the cached off-panel
 * artworks from the numbered sample directories. All 102 are read from the
 * shared checkout, because a worktree's `images/` contains ONLY the scrambled
 * decoys (charter, "Corpus trap").
 *
 * Writes one JSON file per label so two runs can be diffed.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import cases from "./cases.json" with { type: "json" }

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

export const CASES: readonly string[] = cases

type Row = Readonly<{
	case: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapse: readonly [boolean, boolean]
	midpoint: string | null
}>

const label = process.argv[2]
if (!label) throw new Error("usage: run.ts <label> [caseFilter]")
const filter = process.argv[3] ?? null
const outDir = `${import.meta.dirname}/data`
await mkdir(outDir, { recursive: true })
const outPath = `${outDir}/${label}.json`
const existing: Record<string, Row> = existsSync(outPath)
	? JSON.parse(await readFile(outPath, "utf8"))
	: {}

for (const caseFile of CASES) {
	if (filter && !caseFile.includes(filter)) continue
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const result = extractPaletteDetails(image)
	const row: Row = {
		case: caseFile,
		background: result.winner.background.hex,
		surface: result.winner.surface.hex,
		foreground: result.winner.foreground.hex,
		accent: result.winner.accent.hex,
		gradient: result.winner.gradient,
		collapse: [result.winner.collapse.surface, result.winner.collapse.accent],
		midpoint: result.midpoint.color?.hex ?? null,
	}
	existing[caseFile] = row
	console.log(`${caseFile.padEnd(52)} ${row.background} ${row.surface} ${row.foreground} ${row.accent} ${row.gradient ? "grad" : "flat"} ${row.midpoint ?? "-"}`)
}

const ordered = Object.fromEntries(CASES.filter((c) => existing[c]).map((c) => [c, existing[c]]))
await writeFile(outPath, `${JSON.stringify(ordered, null, "\t")}\n`)
console.log(`\nwrote ${outPath}`)
