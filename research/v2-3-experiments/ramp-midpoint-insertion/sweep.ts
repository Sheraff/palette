import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { measurementCorpus, imagesRoot } from "./corpus.ts"

/**
 * Resumable driver: one worker process per artwork, four at a time, `VIPS_CONCURRENCY=1`, one
 * checkpoint file per artwork. A rerun skips everything already written, so an interrupted sweep
 * costs only the artworks it had not reached.
 */

const here = resolve(fileURLToPath(import.meta.url), "..")
const outDir = resolve(here, "data", process.argv[2] ?? "measurements")
const workers = Number(process.env.RAMP_WORKERS ?? "4")

const corpus = await measurementCorpus()
mkdirSync(outDir, { recursive: true })
process.stderr.write(`imagesRoot=${imagesRoot}\ncorpus=${corpus.length}\nout=${outDir}\n`)

let next = 0
let done = 0
let failed = 0

async function runOne(): Promise<void> {
	while (next < corpus.length) {
		const entry = corpus[next++]!
		const out = resolve(outDir, `${entry.image}.json`)
		if (existsSync(out)) { done += 1; continue }
		await new Promise<void>((settle) => {
			const child = spawn(process.execPath, [
				"--experimental-strip-types", resolve(here, "measure.ts"), entry.image, entry.path, out,
			], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, VIPS_CONCURRENCY: "1", NODE_NO_WARNINGS: "1" } })
			let stderr = ""
			child.stderr.on("data", (chunk) => { stderr += String(chunk) })
			child.on("close", (code) => {
				if (code !== 0) {
					failed += 1
					process.stderr.write(`FAIL ${entry.image}: ${stderr.split("\n").slice(-4).join(" ")}\n`)
				}
				done += 1
				if (done % 10 === 0) process.stderr.write(`${done}/${corpus.length}\n`)
				settle()
			})
		})
	}
}

await Promise.all(Array.from({ length: workers }, runOne))
process.stderr.write(`done ${done}/${corpus.length}, ${failed} failed\n`)
