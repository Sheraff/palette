/**
 * Narrow-repair sweep driver.
 *
 * Two jobs, both needed:
 *
 * - `--jobs <file>` runs a given list of artworks, used for the artworks that actually carry a
 *   defect. That set is small, so every coverage configuration can be measured on it.
 * - no `--jobs` runs the whole corpus, used once with the widest configuration to *verify* the
 *   claim that the repair cannot reach an artwork without a defect. The claim follows from the
 *   entry test, but the charter's standard is measurement, not derivation.
 *
 * Usage: repair-run.ts [--jobs <file>] [--configs a,b] [--out <dir>] [--workers 4]
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
	options: {
		jobs: { type: "string" },
		configs: { type: "string" },
		out: { type: "string" },
		workers: { type: "string", default: "4" },
		repo: { type: "string", default: "/Users/Flo/GitHub/palette" },
	},
	strict: true,
})
const repo = resolve(values.repo!)
const outRoot = resolve(values.out ?? resolve(import.meta.dirname, "data/repair"))
const workerCount = Number(values.workers)
if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 4) throw new Error("--workers must be 1..4")

const VETOED_PREFIXES = ["06eb2197", "148e0886", "000f9f4b", "0011c1dc"]
const isVetoed = (name: string): boolean => {
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]{8})/u.exec(name)
	return match !== null && VETOED_PREFIXES.includes(match[1]!)
}

let paths: string[]
if (values.jobs) {
	paths = readFileSync(resolve(values.jobs), "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
} else {
	paths = []
	const shards = Array.from({ length: 0x15 }, (_, index) => index.toString(16).padStart(2, "0"))
	for (const directory of [...shards, "images"]) {
		const full = resolve(repo, directory)
		let names: string[]
		try { names = readdirSync(full).sort() } catch { continue }
		for (const name of names) {
			if (name.startsWith(".") || name.includes("-scrambled") || isVetoed(name)) continue
			const path = resolve(full, name)
			if (statSync(path).isFile()) paths.push(path)
		}
	}
	paths.sort()
}

mkdirSync(outRoot, { recursive: true })
const jobListFile = resolve(outRoot, "jobs.txt")
writeFileSync(jobListFile, `${paths.join("\n")}\n`)
process.stdout.write(`${paths.length} artwork(s), configs=${values.configs ?? "all"}, out=${outRoot}\n`)

const worker = resolve(import.meta.dirname, "repair-worker.ts")
await Promise.all(Array.from({ length: workerCount }, (_, index) => new Promise<void>((done, fail) => {
	const child = spawn(process.execPath, [
		"--no-warnings", "--experimental-strip-types", worker,
		jobListFile, resolve(outRoot, `worker-${index}.jsonl`), String(index), String(workerCount),
		...(values.configs ? [values.configs] : []),
	], {
		stdio: ["ignore", "inherit", "inherit"],
		env: { ...process.env, VIPS_CONCURRENCY: "1", PALETTE_IMAGES_ROOT: resolve(repo, "images") },
	})
	child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`worker ${index} exited ${code}`))))
})))
process.stdout.write("repair sweep complete\n")
