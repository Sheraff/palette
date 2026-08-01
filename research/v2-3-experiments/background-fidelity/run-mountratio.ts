/** Checkpointed runner for `probe-mountratio.ts`. Same resumable pattern as `run-bgfidelity.ts`. */
import fs from "node:fs"
import path from "node:path"
import { probe } from "./probe-mountratio.ts"

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
