/**
 * Census driver: enumerate the whole artwork corpus and run the census workers over it.
 *
 * Corpus = the sharded caches `00/` .. `14/` (hex, so 21 directories) plus `images/`, minus the
 * `-scrambled` decoys and minus the four vetoed artworks. Artwork is read from the shared checkout
 * only — a worktree's own `images/` holds decoys, and the charter's corpus trap is exactly this.
 *
 * Usage: census-run.ts [--out <dir>] [--workers 4] [--repo <path>]
 */
import { spawn } from "node:child_process"
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
	options: {
		out: { type: "string" },
		workers: { type: "string", default: "4" },
		repo: { type: "string", default: "/Users/Flo/GitHub/palette" },
	},
	strict: true,
})
const repo = resolve(values.repo!)
const outRoot = resolve(values.out ?? resolve(import.meta.dirname, "data/census"))
const workerCount = Number(values.workers)
if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 4) throw new Error("--workers must be 1..4")

/** The four artworks human review vetoed; the list is given by the 8 hex chars after the size prefix. */
const VETOED_PREFIXES = ["06eb2197", "148e0886", "000f9f4b", "0011c1dc"]

function artworkPrefix(name: string): string | null {
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]{8})/u.exec(name)
	return match ? match[1] : null
}

function isVetoed(name: string): boolean {
	const prefix = artworkPrefix(name)
	return prefix !== null && VETOED_PREFIXES.includes(prefix)
}

const shards = Array.from({ length: 0x15 }, (_, index) => index.toString(16).padStart(2, "0"))
const paths: string[] = []
for (const directory of [...shards, "images"]) {
	const full = resolve(repo, directory)
	let names: string[]
	try { names = readdirSync(full).sort() } catch { continue }
	for (const name of names) {
		if (name.startsWith(".")) continue
		if (name.includes("-scrambled")) continue
		if (isVetoed(name)) continue
		const path = resolve(full, name)
		if (!statSync(path).isFile()) continue
		paths.push(path)
	}
}
paths.sort()

mkdirSync(outRoot, { recursive: true })
const jobListFile = resolve(outRoot, "jobs.txt")
writeFileSync(jobListFile, `${paths.join("\n")}\n`)
process.stdout.write(`corpus: ${paths.length} artworks from ${repo} (shards 00..14 + images/, no scrambled, no vetoed)\n`)
process.stdout.write(`${workerCount} worker(s), output in ${outRoot}\n`)

const worker = resolve(import.meta.dirname, "census-worker.ts")
await Promise.all(Array.from({ length: workerCount }, (_, index) => new Promise<void>((done, fail) => {
	const child = spawn(process.execPath, [
		"--no-warnings", "--experimental-strip-types", worker,
		jobListFile, resolve(outRoot, `worker-${index}.jsonl`), String(index), String(workerCount),
	], {
		stdio: ["ignore", "inherit", "inherit"],
		env: { ...process.env, VIPS_CONCURRENCY: "1", PALETTE_IMAGES_ROOT: resolve(repo, "images") },
	})
	child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`worker ${index} exited ${code}`))))
})))
process.stdout.write("census complete\n")
