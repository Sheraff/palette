import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { CONFIGURATIONS } from "./corpus.ts"

/**
 * Run every configuration over the corpus, one configuration at a time, at most `--workers`
 * processes each with `VIPS_CONCURRENCY=1` (TRACK_CHARTER.md, "Machine budget": sharp otherwise
 * spawns ~ncpu threads *per process*). Each worker writes one result file per image, so the sweep
 * is resumable and can be killed at any point.
 */

const { values } = parseArgs({
	options: {
		configs: { type: "string" },
		workers: { type: "string", default: "4" },
		force: { type: "boolean", default: false },
	},
	strict: true,
})

const configs = (values.configs ?? Object.keys(CONFIGURATIONS).join(",")).split(",").map((name) => name.trim())
const workers = Math.max(1, Math.min(4, Number(values.workers)))
const script = resolve(import.meta.dirname, "extract.ts")

for (const config of configs) {
	if (!(config in CONFIGURATIONS)) throw new Error(`unknown configuration ${config}`)
	const started = Date.now()
	process.stdout.write(`\n=== ${config} (${workers} worker(s)) ===\n`)
	await Promise.all(Array.from({ length: workers }, (_, shard) => new Promise<void>((done, fail) => {
		const child = spawn(process.execPath, [
			"--no-warnings", "--experimental-strip-types", script,
			"--config", config, "--shard", String(shard), "--shards", String(workers), "--quiet",
			...(values.force ? ["--force"] : []),
		], {
			stdio: ["ignore", "pipe", "inherit"],
			env: { ...process.env, VIPS_CONCURRENCY: "1" },
		})
		child.stdout.on("data", (chunk: Buffer) => process.stdout.write(`  [${shard}] ${chunk.toString().trim()}\n`))
		child.on("error", fail)
		child.on("exit", (code) => code === 0 ? done() : fail(new Error(`${config} shard ${shard} exited ${code}`)))
	})))
	process.stdout.write(`=== ${config} done in ${((Date.now() - started) / 1000).toFixed(0)}s ===\n`)
}
