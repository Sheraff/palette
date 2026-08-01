import { readdir, readFile, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve, basename } from "node:path"
import { parseArgs } from "node:util"
import { spawn } from "node:child_process"

/**
 * Resumable, checkpointed sweep driver for `probe.ts`: one result file per job, at most `--workers`
 * child processes, `VIPS_CONCURRENCY=1` in every child. Killing the driver at any point loses at most
 * `--workers` in-flight jobs; rerunning resumes.
 *
 * Reads artwork from the shared checkout only — a worktree `images/` holds `-scrambled` decoys.
 */

const REPO = "/Users/Flo/GitHub/palette"
const VETOED = new Set([
	"ab67616d00001e020006eb2197bdb0a7b9392108",
	"ab67616d00001e0200148e0886d097d85fd41039",
	"ab67616d00001e02000f9f4ba3750dc73886b2ad",
	"ab67616d00001e020011c1dc0000000000000000",
])
/** The veto list is given by artwork id prefix; match on the 8 hex chars after the Spotify prefix. */
const VETOED_PREFIXES = ["06eb2197", "148e0886", "000f9f4b", "0011c1dc"]

const { values } = parseArgs({
	options: {
		out: { type: "string" },
		workers: { type: "string", default: "4" },
		set: { type: "string", default: "reviewed+onpanel" },
	},
	strict: true,
})
const outRoot = values.out ?? resolve(import.meta.dirname, "data/probe")
const workers = Number(values.workers)
if (!Number.isInteger(workers) || workers < 1 || workers > 4) throw new Error("--workers must be 1..4")

function shortId(image: string): string {
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]{24})/u.exec(image)
	return match ? match[1].slice(0, 8) : image
}

function isVetoed(image: string): boolean {
	if (VETOED.has(image)) return true
	return VETOED_PREFIXES.includes(shortId(image))
}

const jobs = new Map<string, string>()

if (values.set !== "onpanel-only") {
	const batchesRoot = resolve(REPO, "research/v2-3-eval/data/batches")
	const verdicts = (await readFile(resolve(REPO, "research/v2-3-eval/data/verdicts.jsonl"), "utf8"))
		.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))
	const reviewed = new Set<string>(verdicts.map((record) => record.image))
	const files = (await readdir(batchesRoot))
		.filter((name) => name.endsWith(".json") && !name.endsWith(".key.json")).sort()
	for (const file of files) {
		const batch = JSON.parse(await readFile(resolve(batchesRoot, file), "utf8"))
		for (const item of batch.items ?? []) {
			if (!reviewed.has(item.image) || jobs.has(item.image)) continue
			jobs.set(item.image, resolve(REPO, item.imagePath))
		}
	}
}

if (values.set !== "reviewed-only") {
	const imagesRoot = resolve(REPO, "images")
	for (const name of (await readdir(imagesRoot)).sort()) {
		if (name.includes("-scrambled")) continue
		if (!/\.(jpe?g|png|webp|avif)$/iu.test(name)) continue
		if (!jobs.has(name)) jobs.set(name, resolve(imagesRoot, name))
	}
}

for (const image of [...jobs.keys()]) if (isVetoed(image)) jobs.delete(image)

const queue = [...jobs.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
	.filter(([image]) => !existsSync(resolve(outRoot, `${image}.json`)))
await mkdir(outRoot, { recursive: true })
process.stdout.write(`${jobs.size} job(s), ${queue.length} pending, ${workers} worker(s)\n`)

let next = 0
let done = 0
const failures: string[] = []

async function runOne(image: string, path: string): Promise<void> {
	await new Promise<void>((resolveJob) => {
		const child = spawn(process.execPath, [
			"--no-warnings", "--experimental-strip-types",
			resolve(import.meta.dirname, "probe.ts"),
			"--image", path,
			"--out", resolve(outRoot, `${image}.json`),
		], { env: { ...process.env, VIPS_CONCURRENCY: "1" }, stdio: ["ignore", "ignore", "pipe"] })
		let stderr = ""
		child.stderr.on("data", (chunk) => { stderr += String(chunk) })
		child.on("close", (code) => {
			done += 1
			if (code !== 0) {
				failures.push(image)
				process.stdout.write(`[${done}/${queue.length}] FAIL ${image}: ${stderr.split("\n")[0]}\n`)
			} else if (done % 10 === 0) {
				process.stdout.write(`[${done}/${queue.length}] ok\n`)
			}
			resolveJob()
		})
	})
}

async function worker(): Promise<void> {
	while (next < queue.length) {
		const index = next
		next += 1
		const [image, path] = queue[index]
		await runOne(image, path)
	}
}

await Promise.all(Array.from({ length: workers }, () => worker()))
await writeFile(resolve(outRoot, "_failures.json"), `${JSON.stringify(failures, null, "\t")}\n`)
process.stdout.write(`done: ${done} run, ${failures.length} failed\n`)
