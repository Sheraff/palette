/**
 * Track W sweep runner.
 *
 * Sharded and resumable: one result file per case under `data/<label>/`, so the
 * orchestrator can kill the sweep at any point and the next invocation picks up where
 * it stopped (charter, "Machine budget").
 *
 *   VIPS_CONCURRENCY=1 node ... run.ts <label> [shard] [shardCount] [--force]
 *
 * Artworks are read from the shared checkout via `PALETTE_IMAGES_ROOT`; a worktree's
 * `images/` holds only `-scrambled` decoys (charter, "Corpus trap").
 */
import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import cases from "./cases.json" with { type: "json" }

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

export const CASES: readonly string[] = cases as string[]
export const keyOf = (caseFile: string): string => caseFile.replaceAll("/", "_").replaceAll(".", "_")

export type Row = Readonly<{
	case: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapse: readonly [boolean, boolean]
	midpoint: string | null
}>

if (import.meta.filename === process.argv[1]) {
	const label = process.argv[2]
	if (!label) throw new Error("usage: run.ts <label> [shard] [shardCount] [--force]")
	const force = process.argv.includes("--force")
	const shard = Number(process.argv[3] ?? 0)
	const shardCount = Number(process.argv[4] ?? 1)
	const outDir = `${import.meta.dirname}/data/${label}`
	await mkdir(outDir, { recursive: true })

	let done = 0
	for (const [index, caseFile] of CASES.entries()) {
		if (index % shardCount !== shard) continue
		const outPath = `${outDir}/${keyOf(caseFile)}.json`
		if (!force && existsSync(outPath)) { done += 1; continue }
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
		await writeFile(outPath, `${JSON.stringify(row, null, "\t")}\n`)
		done += 1
		console.log(`[${shard}] ${caseFile.padEnd(52)} ${row.background} ${row.surface} ${row.foreground} ${row.accent} ${row.gradient ? "grad" : "flat"}`)
	}
	console.log(`[${shard}] ${done} cases in ${label}`)
}
