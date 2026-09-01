/**
 * Full-corpus census runner: published palette only, one extraction pass per artwork.
 *
 * `run-bgfidelity.ts` also builds the evidence pass so it can report the diagnosis, which doubles
 * the cost. A census only needs to know whether the published palette moved, so this does the one
 * pass and writes one compact line per artwork.
 *
 * Appends JSONL to `<outFile>.<worker>` and skips artworks already recorded there, so it stays
 * resumable and killable (charter, "Machine budget").
 *
 *   VIPS_CONCURRENCY=1 node --experimental-strip-types run-census.ts <outFile> <listFile> <i> <n>
 */
import fs from "node:fs"
import path from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { BACKGROUND_FIDELITY } from "../../v2-3/src/internal/palette-core.ts"

const [outFile, listFile, workerIndexRaw, workerCountRaw] = process.argv.slice(2)
const workerIndex = Number(workerIndexRaw ?? 0)
const workerCount = Number(workerCountRaw ?? 1)
const shardFile = `${outFile}.${workerIndex}`
fs.mkdirSync(path.dirname(outFile), { recursive: true })

const done = new Set<string>()
if (fs.existsSync(shardFile)) {
	for (const line of fs.readFileSync(shardFile, "utf8").split("\n")) {
		if (!line.trim()) continue
		try { done.add(JSON.parse(line).key) } catch { /* truncated tail, re-run it */ }
	}
}

const jobs = fs.readFileSync(listFile, "utf8").trim().split("\n").filter(Boolean)
const stream = fs.createWriteStream(shardFile, { flags: "a" })
let count = 0
const started = Date.now()
for (let index = 0; index < jobs.length; index++) {
	if (index % workerCount !== workerIndex) continue
	const imagePath = jobs[index]
	const key = path.basename(imagePath).replace(/\.[^.]+$/, "")
	if (done.has(key)) continue
	let row: Record<string, unknown>
	try {
		const image = await loadNativeImage(imagePath)
		const details = extractPaletteDetails(image)
		const w = details.winner
		row = {
			key,
			config: BACKGROUND_FIDELITY,
			background: w.background.hex,
			surface: w.surface.hex,
			foreground: w.foreground.hex,
			accent: w.accent.hex,
			gradient: w.gradient,
			collapse: [w.collapse.surface, w.collapse.accent],
			midpoint: details.midpoint.color?.hex ?? null,
		}
	} catch (error) {
		row = { key, config: BACKGROUND_FIDELITY, error: String(error) }
	}
	stream.write(`${JSON.stringify(row)}\n`)
	count += 1
	if (count % 100 === 0) {
		const rate = count / ((Date.now() - started) / 1000)
		console.log(`[${workerIndex}] ${count} done, ${rate.toFixed(2)}/s`)
	}
}
stream.end()
console.log(`[${workerIndex}] ${count} artworks at BACKGROUND_FIDELITY="${BACKGROUND_FIDELITY}"`)
