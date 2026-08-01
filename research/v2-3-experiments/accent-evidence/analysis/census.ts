/**
 * Full-corpus mover census. Writes only the four hexes + gradient/collapse per artwork (one
 * compact JSON per shard), so the whole 7550-artwork corpus costs megabytes rather than gigabytes.
 *
 *   node --experimental-strip-types census.ts <label> <shardIndex> <shardCount>
 *
 * CORPUS: the shared checkout's 21 hex-bucket roots plus `images/`, absolute paths only. Every
 * entry is asserted not to contain `-scrambled.`; the worktree's decoy `images/` is never read.
 * Resumable: a shard that already has its file is skipped, and progress is flushed every 100.
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { extractPalette } from "../../../v2-3/index.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"

sharp.concurrency(1)

const ROOT = "/Users/Flo/GitHub/palette"
const label = process.argv[2]
const shardIndex = Number(process.argv[3] ?? 0)
const shardCount = Number(process.argv[4] ?? 1)
if (!label) throw new Error("usage: census.ts <label> <shardIndex> <shardCount>")

const outDir = resolve(import.meta.dirname, "census")
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, `${label}.${shardIndex}.json`)

const roots = readdirSync(ROOT)
	.filter((d) => /^[0-9a-f]{2}$/.test(d) && statSync(resolve(ROOT, d)).isDirectory())
	.sort()
const entries: string[] = []
for (const r of roots) for (const f of readdirSync(resolve(ROOT, r)).sort()) {
	const p = resolve(ROOT, r, f)
	if (p.includes("-scrambled.")) continue
	if (statSync(p).isFile()) entries.push(p)
}
entries.sort()

const existing: Record<string, string> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {}
let done = 0
for (const [i, abs] of entries.entries()) {
	if (i % shardCount !== shardIndex) continue
	const key = abs.slice(ROOT.length + 1)
	if (existing[key] !== undefined) continue
	try {
		const image = await loadNativeImage(abs)
		const w = extractPalette(image).winner
		existing[key] = [w.background.hex, w.surface.hex, w.foreground.hex, w.accent.hex,
			w.gradient ? "g" : "-", w.collapse.surface ? "S" : "-", w.collapse.accent ? "A" : "-"].join(" ")
	} catch (error) {
		existing[key] = `ERROR ${(error as Error).message}`
	}
	done++
	if (done % 100 === 0) {
		writeFileSync(outPath, JSON.stringify(existing))
		process.stderr.write(`${label}.${shardIndex}: ${done} done (${i + 1}/${entries.length})\n`)
	}
}
writeFileSync(outPath, JSON.stringify(existing))
process.stderr.write(`${label}.${shardIndex}: complete, ${Object.keys(existing).length} entries\n`)
