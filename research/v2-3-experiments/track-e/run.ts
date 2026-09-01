/**
 * Track E corpus runner.
 *
 * The 34 review fixtures live in the shared checkout's `images/` (they are
 * gitignored, so a worktree does not have them) plus six off-panel artworks
 * from the numbered sample directories. Writes one JSON file per label so two
 * runs can be diffed.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const ROOT = "/Users/Flo/GitHub/palette"

export const OFF_PANEL: readonly string[] = [
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
]

export const CASES: readonly string[] = [
	...reviewFixtures.map(({ source }) => source.file),
	...OFF_PANEL,
]

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
	const path = `${ROOT}/${caseFile}`
	const started = Date.now()
	const image = await loadNativeImage(path)
	const result = extractPaletteDetails(image)
	existing[caseFile] = {
		case: caseFile,
		background: result.winner.background.hex,
		surface: result.winner.surface.hex,
		foreground: result.winner.foreground.hex,
		accent: result.winner.accent.hex,
		gradient: result.winner.gradient,
		collapse: [result.winner.collapse.surface, result.winner.collapse.accent],
		midpoint: result.midpoint.color ?? null,
	}
	console.log(`${caseFile.padEnd(52)} ${existing[caseFile].background} ${existing[caseFile].surface} ${existing[caseFile].foreground} ${existing[caseFile].accent} ${result.winner.gradient ? "grad" : "flat"} ${result.midpoint.color ?? "-"}  (${Date.now() - started}ms)`)
}

const ordered = Object.fromEntries(CASES.filter((c) => existing[c]).map((c) => [c, existing[c]]))
await writeFile(outPath, `${JSON.stringify(ordered, null, "\t")}\n`)
console.log(`\nwrote ${outPath}`)
