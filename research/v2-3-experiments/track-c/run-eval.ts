/**
 * Track C evaluation runner.
 *
 * Usage (from the repository root):
 *   node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/run-eval.ts <label>
 *
 * Runs `research/v2-3` over the Track C target and regression subsets, writes
 * `runs/<label>.json`, prints a table, and re-runs one image to confirm determinism.
 * Images are read from the authoritative `images/` corpus; because artwork files are not
 * committed, `TRACK_C_IMAGES_ROOT` may point at the checkout that holds them.
 */

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"
import { EVAL_CASES } from "./cases.ts"

const trackRoot = fileURLToPath(new URL(".", import.meta.url))
const packageRoot = resolve(trackRoot, "../..")

function imagesRoot(): string {
	const configured = process.env.TRACK_C_IMAGES_ROOT
	if (configured) return configured
	const local = resolve(packageRoot, "images")
	if (existsSync(resolve(local, "johns.jpg"))) return local
	const shared = "/Users/Flo/github/palette/images"
	if (existsSync(resolve(shared, "johns.jpg"))) return shared
	throw new Error("No images root with the authoritative corpus was found")
}

type Row = Readonly<{
	id: string
	group: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	midpoint: string | null
	collapse: string
	milliseconds: number
}>

function summarize(id: string, group: string, extraction: Awaited<ReturnType<typeof extractPaletteFromBytes>>, milliseconds: number): Row {
	return {
		id,
		group,
		background: extraction.winner.background.hex,
		surface: extraction.winner.surface.hex,
		foreground: extraction.winner.foreground.hex,
		accent: extraction.winner.accent.hex,
		gradient: extraction.winner.gradient,
		midpoint: extraction.researchRender?.field.stops[1].hex ?? null,
		collapse: `${extraction.winner.collapse.surface ? "S+" : "S-"}${extraction.winner.collapse.accent ? "A+" : "A-"}`,
		milliseconds,
	}
}

async function main(): Promise<void> {
	const label = process.argv[2]
	if (!label) throw new Error("A run label argument is required")
	const root = imagesRoot()
	const rows: Row[] = []
	for (const testCase of EVAL_CASES) {
		const file = testCase.file.startsWith("images/")
			? resolve(root, testCase.file.slice("images/".length))
			: resolve(process.env.TRACK_C_REPO_ROOT ?? "/Users/Flo/github/palette", testCase.file)
		const started = Date.now()
		const extraction = await extractPaletteFromBytes(file)
		rows.push(summarize(testCase.id, testCase.group, extraction, Date.now() - started))
		const row = rows[rows.length - 1]
		console.log([
			row.id.padEnd(12),
			row.group.padEnd(10),
			row.background,
			row.surface,
			row.foreground,
			row.accent,
			row.gradient ? "gradient" : "flat    ",
			row.collapse,
			row.midpoint ?? "-",
			`${row.milliseconds}ms`,
		].join(" "))
	}

	const determinismCase = EVAL_CASES[0]
	const repeat = summarize(
		determinismCase.id,
		determinismCase.group,
		await extractPaletteFromBytes(resolve(root, determinismCase.file.replace(/^images\//u, ""))),
		0,
	)
	const first = rows[0]
	const deterministic = (["background", "surface", "foreground", "accent", "collapse"] as const)
		.every((field) => repeat[field] === first[field]) &&
		repeat.gradient === first.gradient && repeat.midpoint === first.midpoint
	console.log(`determinism (${determinismCase.id} run twice): ${deterministic ? "identical" : "DIFFERENT"}`)

	await mkdir(resolve(trackRoot, "runs"), { recursive: true })
	await writeFile(
		resolve(trackRoot, "runs", `${label}.json`),
		`${JSON.stringify({ label, deterministic, rows: rows.map(({ milliseconds: _ms, ...rest }) => rest) }, null, "\t")}\n`,
	)
}

await main()
