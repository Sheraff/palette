/**
 * Checkpointed runner for `probe-bgfidelity.ts` — one result file per artwork, skips existing,
 * sharded by `index % workerCount === workerIndex` (charter, "Machine budget").
 *
 *   VIPS_CONCURRENCY=1 node --experimental-strip-types run-bgfidelity.ts <outDir> <listFile> [i] [n]
 */
import fs from "node:fs"
import path from "node:path"
import { probe } from "./probe-bgfidelity.ts"

const [outDir, listFile, workerIndexRaw, workerCountRaw] = process.argv.slice(2)
const workerIndex = Number(workerIndexRaw ?? 0)
const workerCount = Number(workerCountRaw ?? 1)
fs.mkdirSync(outDir, { recursive: true })
const jobs = fs.readFileSync(listFile, "utf8").trim().split("\n").filter(Boolean)
for (let index = 0; index < jobs.length; index++) {
	if (index % workerCount !== workerIndex) continue
	const imagePath = jobs[index]
	const name = path.basename(imagePath).replace(/\.[^.]+$/, "")
	const out = path.join(outDir, `${name}.json`)
	if (fs.existsSync(out)) continue
	try {
		fs.writeFileSync(out, JSON.stringify(await probe(imagePath), null, "\t") + "\n")
	} catch (error) {
		fs.writeFileSync(out, JSON.stringify({ image: imagePath, error: String(error) }, null, "\t") + "\n")
	}
}
