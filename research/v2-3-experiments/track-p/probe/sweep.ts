/**
 * Track P probe driver: census and perturbation sweeps over a corpus, across worker processes.
 *
 *   probe/sweep.ts --mode census   --corpus data/corpus-triage.txt [--workers 12]
 *   probe/sweep.ts --mode baseline --corpus data/corpus-triage.txt [--workers 12]
 *   probe/sweep.ts --mode perturb  --corpus data/corpus-triage.txt --jobs data/jobs.json [--workers 12]
 *
 * Extraction is ~3 s of single-core work per artwork, so everything here is process-parallel. Each
 * worker is an independent `extract.ts`; nothing is shared but the filesystem, and every output is
 * keyed by (site, factor) so a run can be resumed by skipping jobs whose output already exists.
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const extractScript = resolve(trackRoot, "probe/extract.ts")

const { values } = parseArgs({
	options: {
		mode: { type: "string", default: "census" },
		corpus: { type: "string", default: "data/corpus-triage.txt" },
		jobs: { type: "string" },
		workers: { type: "string", default: "12" },
		out: { type: "string" },
	},
	strict: true,
})

const workers = Number(values.workers)
const corpusPath = resolve(trackRoot, values.corpus!)
const images = readFileSync(corpusPath, "utf8").split("\n")
	.map((line) => line.trim()).filter((line) => line.length > 0)

mkdirSync(resolve(trackRoot, "data/chunks"), { recursive: true })
mkdirSync(resolve(trackRoot, "data/perturbations"), { recursive: true })

type Job = { site: number; factor?: number; absolute?: number; label: string }

function runWorker(args: string[]): Promise<string> {
	return new Promise((settle, fail) => {
		const child = spawn(process.execPath,
			["--no-warnings", "--experimental-strip-types", extractScript, ...args], {
				cwd: trackRoot,
				// libvips would otherwise start a thread pool per worker and oversubscribe the box.
				env: { ...process.env, VIPS_CONCURRENCY: "1", UV_THREADPOOL_SIZE: "2" },
				stdio: ["ignore", "pipe", "pipe"],
			})
		let out = ""
		let err = ""
		child.stdout.on("data", (chunk) => { out += String(chunk) })
		child.stderr.on("data", (chunk) => { err += String(chunk) })
		child.on("close", (code) => {
			if (code === 0) settle(out)
			else fail(new Error(`worker exited ${code}: ${err.slice(0, 800)}`))
		})
	})
}

/** Run `tasks` with at most `workers` in flight, reporting progress as they land. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results: T[] = new Array(tasks.length)
	let next = 0
	let done = 0
	const started = Date.now()
	const run = async (): Promise<void> => {
		while (next < tasks.length) {
			const index = next
			next += 1
			results[index] = await tasks[index]!()
			done += 1
			const elapsed = (Date.now() - started) / 1000
			const rate = done / elapsed
			const left = (tasks.length - done) / Math.max(rate, 1e-9)
			process.stderr.write(`[${done}/${tasks.length}] ${elapsed.toFixed(0)}s elapsed, `
				+ `~${left.toFixed(0)}s left\n`)
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run))
	return results
}

function chunk<T>(list: T[], parts: number): T[][] {
	const size = Math.ceil(list.length / parts)
	const out: T[][] = []
	for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
	return out
}

if (values.mode === "fingerprint") {
	// Per-artwork firing fingerprints, the input to firing-conditioned corpora.
	const chunks = chunk(images, workers)
	const listPaths = chunks.map((part, index) => {
		const path = resolve(trackRoot, `data/chunks/fingerprint-${index}.txt`)
		writeFileSync(path, `${part.join("\n")}\n`)
		return path
	})
	const outputs = await pool(listPaths.map((path) => () => runWorker([
		"--tree", "variant", "--images", path, "--per-image",
	])), workers)
	writeFileSync(resolve(trackRoot, "data/fingerprints.jsonl"), outputs.join(""))
	process.stderr.write(`fingerprints written for ${images.length} artworks\n`)
} else if (values.mode === "census" || values.mode === "baseline") {
	const isCensus = values.mode === "census"
	const chunks = chunk(images, workers)
	const listPaths = chunks.map((part, index) => {
		const path = resolve(trackRoot, `data/chunks/${values.mode}-${index}.txt`)
		writeFileSync(path, `${part.join("\n")}\n`)
		return path
	})
	const outputs = await pool(listPaths.map((path) => () => runWorker([
		"--tree", "variant", "--images", path, ...(isCensus ? ["--census"] : []),
	])), workers)

	const winners: string[] = []
	let evaluations: number[] | null = null
	let reads: number[] | null = null
	let comparisons: number[] | null = null
	let flips: number[] | null = null
	let nearest: (number | null)[] | null = null
	for (const output of outputs) {
		for (const line of output.split("\n")) {
			if (line.trim().length === 0) continue
			const record = JSON.parse(line) as Record<string, unknown>
			if (record.kind !== "census") { winners.push(line); continue }
			const add = (into: number[] | null, from: number[]): number[] =>
				into === null ? [...from] : into.map((value, index) => value + from[index]!)
			evaluations = add(evaluations, record.evaluations as number[])
			reads = add(reads, record.reads as number[])
			comparisons = add(comparisons, record.comparisons as number[])
			flips = add(flips, record.flips as number[])
			const incoming = record.nearest as (number | null)[]
			nearest = nearest === null ? [...incoming] : nearest.map((value, index) => {
				const candidate = incoming[index]
				if (value === null) return candidate ?? null
				if (candidate === null || candidate === undefined) return value
				return Math.min(value, candidate)
			})
		}
	}
	writeFileSync(resolve(trackRoot, `data/${values.mode}-winners.jsonl`), `${winners.join("\n")}\n`)
	if (isCensus) {
		writeFileSync(resolve(trackRoot, "data/census.json"), `${JSON.stringify({
			schemaVersion: 1, corpus: corpusPath, images: images.length,
			evaluations, reads, comparisons, flips, nearest,
		})}\n`)
	}
	process.stderr.write(`${values.mode}: ${winners.length} winners over ${images.length} images\n`)
} else if (values.mode === "perturb") {
	const jobs = JSON.parse(readFileSync(resolve(trackRoot, values.jobs!), "utf8")) as Job[]
	const listPath = resolve(trackRoot, "data/chunks/perturb-images.txt")
	writeFileSync(listPath, `${images.join("\n")}\n`)
	const pending = jobs.filter((job) =>
		!existsSync(resolve(trackRoot, `data/perturbations/${job.label}.jsonl`)))
	process.stderr.write(`${jobs.length} jobs, ${jobs.length - pending.length} already done, `
		+ `${pending.length} to run\n`)
	await pool(pending.map((job) => async () => {
		const args = ["--tree", "variant", "--images", listPath, "--site", String(job.site)]
		if (job.absolute !== undefined) args.push("--absolute", String(job.absolute))
		else args.push("--factor", String(job.factor))
		const output = await runWorker(args)
		writeFileSync(resolve(trackRoot, `data/perturbations/${job.label}.jsonl`), output)
	}), workers)
} else {
	throw new Error(`unknown --mode ${values.mode}`)
}
