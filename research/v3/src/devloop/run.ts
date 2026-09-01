/**
 * The batch runner: a candidate, a set of images, and one results file with its provenance attached.
 *
 * ## What it is
 *
 *     node --experimental-strip-types src/devloop/run.ts \
 *       --candidate src/devloop/candidates/toy-median-offsets.ts \
 *       --set data/devloop/sets/demo-20.txt
 *
 * Reads the set, runs the candidate across the machine's cores, and writes one JSONL file: a
 * provenance header, one row per image in **set order**, and a footer with the tallies.
 *
 * ## "Batch" means the set it was given, and nothing more
 *
 * A run is over a **set file**. Twenty covers is an ordinary set; the coverage set is 220; the full
 * corpus is just a bigger file. Nothing here defaults to, assumes, or implies the whole corpus per
 * iteration — a loop that costs seventeen minutes per one-line change is a loop that stops being run,
 * and the samples are the point.
 *
 * ## Set order, not completion order
 *
 * Results come back from the pool in whatever order the workers finish, and are written in set order
 * anyway: the parent holds finished rows until the next index is ready. That costs a small buffer and
 * buys the property everything downstream leans on — **two runs of the same candidate over the same
 * set produce byte-identical rows**, so a diff between two runs is a statement about the candidates
 * and never about scheduling. `deterministicPart` names exactly which fields carry that promise and
 * which are incidental.
 *
 * ## The cache is not optional and not visible
 *
 * Every image goes through the content-addressed cache (`cache.ts`) inside the worker, keyed on the
 * file's bytes, the computation, and the measured source hash of the candidate and everything it
 * imports. There is no "remember to invalidate" step, because a changed candidate cannot reach the
 * old entries. `--no-cache` exists for measuring cold time; it is not part of the loop.
 *
 * ## `--verify`
 *
 * `--verify <run.jsonl>` re-derives the header's provenance from what is on disk now and exits 1 if
 * it disagrees — the house pattern (`src/honesty/cli.ts --check`), and the "re-run and diff" the
 * toolbox review asked every analysis output to support (`reviews/toolbox-review/gap-scan.md` (F)).
 * It answers one question precisely: *is this results file still a statement about the code and the
 * set that are here now?*
 */

import { createHash } from "node:crypto"
import { open, readFile, mkdir, readdir } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { dirname, isAbsolute, join, resolve, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import type { Palette } from "../contract/types.ts"
import { DEFAULT_CACHE_ROOT } from "./cache.ts"
import { computeCodeVersion, V3_ROOT } from "./code-version.ts"
import type {
	CandidateModule,
	ImageSet,
	PackageVersions,
	RunFile,
	RunFooter,
	RunHeader,
	RunLine,
	RunRow,
} from "./types.ts"
import type { WorkerResult, WorkerSetup, WorkerTask } from "./worker.ts"

/**
 * The repository root — where corpus shard paths like `00/ab….jpg` resolve against.
 *
 * [INHERITED] — the same root `review-server/server.ts` derives, and the root the corpus shards and
 * every fixture's relative path are written against.
 */
export const REPO_ROOT = resolve(V3_ROOT, "..", "..")

/** Where set files live by default. [UNCALIBRATED] — a location, chosen here. */
export const SETS_ROOT = join(V3_ROOT, "data", "devloop", "sets")

/** Where results files are written by default. [UNCALIBRATED] — a location, chosen here. */
export const RUNS_ROOT = join(V3_ROOT, "data", "devloop", "runs")

/**
 * The computation this runner performs, as the cache knows it.
 *
 * [UNCALIBRATED] — a name, chosen here. It is a separate axis from the code version on purpose: the
 * store is meant to hold masks and embeddings beside palettes one day (`gap-scan.md` (E)), and those
 * are different computations over the same files rather than different versions of this one.
 */
export const PALETTE_COMPUTATION_ID = "palette"

/**
 * Comment marker in a set file.
 *
 * [UNCALIBRATED] — `#`, because a set file is a list a human maintains and a human will want to say
 * why a cover is in it.
 */
export const SET_FILE_COMMENT = "#"

/* ------------------------------------------------------------------------------------------- */
/* The set                                                                                        */
/* ------------------------------------------------------------------------------------------- */

/**
 * Read a set file: one image path per line, `#` comments and blank lines ignored.
 *
 * Relative paths resolve against the **repository root**, so a set file can be written in the same
 * `00/ab….jpg` shorthand the corpus and every fixture already use.
 *
 * Duplicates are dropped rather than run twice, and the drop is not silent — a set that names a cover
 * twice would give it two rows and double its weight in any later reading of the run.
 */
export async function readImageSet(setPath: string): Promise<ImageSet> {
	const absoluteSetPath = resolve(setPath)
	const text = await readFile(absoluteSetPath, "utf8")
	const seen = new Set<string>()
	const imagePaths: string[] = []
	const duplicates: string[] = []

	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim()
		if (line.length === 0 || line.startsWith(SET_FILE_COMMENT)) continue
		const absolute = isAbsolute(line) ? line : resolve(REPO_ROOT, line)
		if (seen.has(absolute)) {
			duplicates.push(absolute)
			continue
		}
		seen.add(absolute)
		imagePaths.push(absolute)
	}

	if (imagePaths.length === 0) throw new Error(`${absoluteSetPath} names no images`)
	if (duplicates.length > 0) {
		process.stderr.write(`set file names ${duplicates.length} image(s) more than once; each is run once\n`)
	}

	return {
		setPath: absoluteSetPath,
		setName: basename(absoluteSetPath).replace(/\.[^.]+$/u, ""),
		imagePaths,
		setHash: createHash("sha256").update(imagePaths.join("\n")).digest("hex"),
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Provenance                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * Declared and resolved versions of the packages a palette depends on.
 *
 * Both, because they can differ and the difference matters: `CONVENTIONS.md` records that this
 * repository carries two `sharp` versions on purpose, since they decode some AVIFs differently. A run
 * that says only what `package.json` declared has not said which decoder actually loaded.
 */
export async function packageVersions(): Promise<PackageVersions> {
	const manifestPath = join(REPO_ROOT, "package.json")
	const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
	}
	const declared = { ...manifest.dependencies, ...manifest.devDependencies }
	const versions: Record<string, string> = {}
	for (const [name, range] of Object.entries(declared)) {
		versions[name] = range
		try {
			const installed = JSON.parse(
				await readFile(join(REPO_ROOT, "node_modules", name, "package.json"), "utf8"),
			) as { version?: string }
			if (installed.version !== undefined) versions[`${name}@resolved`] = installed.version
		} catch {
			// Not installed, or not resolvable from the root. The declared range is still worth recording.
		}
	}
	return versions
}

/**
 * The part of a row that is a statement about the candidate, as opposed to about this particular run.
 *
 * `cached` and `computeMs` are deliberately excluded: they say how the row was *obtained*, and the
 * whole point of the cache is that obtaining it a second way does not change it. Determinism is
 * asserted against this projection, and `--verify` compares against it.
 */
export function deterministicPart(row: RunRow): Record<string, unknown> {
	return {
		index: row.index,
		imagePath: row.imagePath,
		inputContentHash: row.inputContentHash,
		ok: row.ok,
		palette: row.palette,
		error: row.error,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The run                                                                                        */
/* ------------------------------------------------------------------------------------------- */

export type RunOptions = Readonly<{
	/** Path to the candidate module. Resolved before hashing and before any worker loads it. */
	candidatePath: string
	/** Path to the set file. */
	setPath: string
	/** Where to write the results. Defaults to `data/devloop/runs/<runId>.jsonl`. */
	outPath?: string
	/** Defaults to one per core. */
	workerCount?: number
	/** Defaults to `data/devloop-cache/`. */
	cacheRoot?: string
	/** Bypass the cache entirely — for measuring cold time, not for the loop. */
	noCache?: boolean
	/** Progress lines to stderr. Off inside tests. */
	quiet?: boolean
}>

export type RunSummary = Readonly<{
	header: RunHeader
	footer: RunFooter
	outPath: string
}>

/**
 * The name a run is filed under: readable, sortable, and unique per start instant.
 *
 * **Milliseconds are kept, and that is not cosmetic.** An earlier version truncated to the second, and
 * two runs started inside the same second produced the same id — so the second run silently
 * overwrote the first's results file. That is the worst shape a bug can take here: the two runs you
 * most want to compare are the two you just did back to back, and one of them had quietly stopped
 * existing before you could diff it. Caught 2026-08-04 while recording the demo loop.
 */
export function makeRunId(candidateId: string, setName: string, startedAt: string): string {
	const stamp = startedAt.replace(/[-:]/gu, "").replace(/\.(\d+)Z$/u, "$1Z")
	return `${candidateId}-${setName}-${stamp}`
}

/**
 * Run a candidate over a set.
 *
 * Rows are flushed as they become writable rather than at the end, so a killed run leaves a valid
 * prefix rather than nothing (`CONVENTIONS.md`: long runs are resumable from their output and
 * deliberately killable).
 */
export async function runCandidate(options: RunOptions): Promise<RunSummary> {
	const candidatePath = resolve(options.candidatePath)
	const set = await readImageSet(options.setPath)

	const candidateModule = (await import(candidatePath)) as Partial<CandidateModule>
	if (typeof candidateModule.paletteOf !== "function" || typeof candidateModule.candidateId !== "string") {
		throw new TypeError(
			`${candidatePath} is not a candidate module: it must export \`candidateId\` (string) and ` +
				"`paletteOf` ((imagePath) => Promise<Palette>)",
		)
	}
	const candidateId = candidateModule.candidateId

	const { codeVersion } = await computeCodeVersion(candidatePath)
	const startedAt = new Date().toISOString()
	const runId = makeRunId(candidateId, set.setName, startedAt)
	const workerCount = Math.max(1, Math.min(options.workerCount ?? availableParallelism(), set.imagePaths.length))

	const header: RunHeader = {
		kind: "devloop-run-header",
		runId,
		candidateId,
		candidatePath,
		codeVersion,
		setPath: set.setPath,
		setName: set.setName,
		setHash: set.setHash,
		imageCount: set.imagePaths.length,
		startedAt,
		packageVersions: await packageVersions(),
		nodeVersion: process.version,
		workerCount,
	}

	const outPath = resolve(options.outPath ?? join(RUNS_ROOT, `${runId}.jsonl`))
	await mkdir(dirname(outPath), { recursive: true })
	const handle = await open(outPath, "w")
	await handle.write(`${JSON.stringify(header)}\n`)

	// A run with the cache off still needs a root to point the workers at; it just never finds
	// anything there, because the key it looks under is one nothing was ever written to.
	const cacheRoot = options.noCache
		? join(options.cacheRoot ?? DEFAULT_CACHE_ROOT, "disabled", process.pid.toString(36))
		: (options.cacheRoot ?? DEFAULT_CACHE_ROOT)

	const setup: WorkerSetup = {
		candidatePath,
		codeVersion,
		computationId: PALETTE_COMPUTATION_ID,
		cacheRoot,
	}

	const workerUrl = new URL("./worker.ts", import.meta.url)
	const startedWall = performance.now()
	let nextToDispatch = 0
	let nextToWrite = 0
	let written = 0
	const pending = new Map<number, RunRow>()
	const tally = { ok: 0, failed: 0, hits: 0, misses: 0 }

	/** Flush every buffered row that is now in order. This is what makes the file deterministic. */
	async function drain(): Promise<void> {
		while (pending.has(nextToWrite)) {
			const row = pending.get(nextToWrite) as RunRow
			pending.delete(nextToWrite)
			await handle.write(`${JSON.stringify(row)}\n`)
			nextToWrite += 1
			written += 1
			if (options.quiet !== true && written % 25 === 0) {
				process.stderr.write(`  ${written}/${set.imagePaths.length}\n`)
			}
		}
	}

	await new Promise<void>((finish, fail) => {
		const workers: Worker[] = []
		let live = 0

		const dispatch = (worker: Worker): void => {
			if (nextToDispatch >= set.imagePaths.length) {
				worker.postMessage("stop")
				return
			}
			const task: WorkerTask = { index: nextToDispatch, imagePath: set.imagePaths[nextToDispatch] }
			nextToDispatch += 1
			worker.postMessage(task)
		}

		const stopAll = (error: Error): void => {
			for (const worker of workers) void worker.terminate()
			fail(error)
		}

		for (let slot = 0; slot < workerCount; slot += 1) {
			const worker = new Worker(workerUrl, { workerData: setup })
			workers.push(worker)
			live += 1

			worker.on("message", (result: WorkerResult) => {
				const row: RunRow = {
					kind: "devloop-run-row",
					index: result.index,
					imagePath: result.imagePath,
					inputContentHash: result.inputContentHash,
					ok: result.ok,
					palette: result.palette,
					error: result.error,
					cached: result.cached,
					computeMs: result.computeMs,
				}
				if (result.ok) tally.ok += 1
				else tally.failed += 1
				if (result.cached) tally.hits += 1
				else if (result.ok) tally.misses += 1
				pending.set(result.index, row)
				drain().then(() => dispatch(worker), stopAll)
			})

			worker.on("error", stopAll)
			worker.on("exit", () => {
				live -= 1
				if (live === 0) finish()
			})

			dispatch(worker)
		}
	})

	await drain()

	const footer: RunFooter = {
		kind: "devloop-run-footer",
		runId,
		finishedAt: new Date().toISOString(),
		imageCount: set.imagePaths.length,
		okCount: tally.ok,
		failedCount: tally.failed,
		cacheHits: tally.hits,
		cacheMisses: tally.misses,
		wallMs: Math.round(performance.now() - startedWall),
	}
	await handle.write(`${JSON.stringify(footer)}\n`)
	await handle.close()

	return { header, footer, outPath }
}

/* ------------------------------------------------------------------------------------------- */
/* Reading a run back                                                                             */
/* ------------------------------------------------------------------------------------------- */

/**
 * Read a results file.
 *
 * A file whose footer is missing is returned with `footer: null` rather than refused: that is exactly
 * what a killed run looks like, and the rows it did write are still true.
 */
export async function readRunFile(path: string): Promise<RunFile> {
	const absolute = resolve(path)
	const text = await readFile(absolute, "utf8")
	let header: RunHeader | null = null
	let footer: RunFooter | null = null
	const rows: RunRow[] = []

	for (const [offset, raw] of text.split("\n").entries()) {
		const line = raw.trim()
		if (line.length === 0) continue
		let parsed: RunLine
		try {
			parsed = JSON.parse(line) as RunLine
		} catch (cause) {
			throw new Error(`${absolute}:${offset + 1} is not JSON`, { cause })
		}
		if (parsed.kind === "devloop-run-header") header = parsed
		else if (parsed.kind === "devloop-run-footer") footer = parsed
		else rows.push(parsed)
	}

	if (header === null) throw new Error(`${absolute} has no run header; it is not a devloop results file`)
	return { header, rows, footer, path: absolute }
}

/** Every results file on disk, newest first — what the viewer's queue is built from. */
export async function listRunFiles(root: string = RUNS_ROOT): Promise<string[]> {
	let names: string[]
	try {
		names = await readdir(root)
	} catch {
		return []
	}
	return names
		.filter((name) => name.endsWith(".jsonl"))
		.sort()
		.reverse()
		.map((name) => join(root, name))
}

/* ------------------------------------------------------------------------------------------- */
/* Verify                                                                                         */
/* ------------------------------------------------------------------------------------------- */

export type VerifyProblem = Readonly<{ what: string; recorded: string; now: string }>

/**
 * Is this results file still a statement about the code and the set that are here now?
 *
 * Compares the header's measured provenance against the same measurements taken today. It does not
 * re-run the candidate — that is what a second run and `diff.ts` are for.
 */
export async function verifyRunFile(path: string): Promise<readonly VerifyProblem[]> {
	const run = await readRunFile(path)
	const problems: VerifyProblem[] = []

	try {
		const { codeVersion } = await computeCodeVersion(run.header.candidatePath)
		if (codeVersion !== run.header.codeVersion) {
			problems.push({ what: "codeVersion", recorded: run.header.codeVersion, now: codeVersion })
		}
	} catch (error) {
		problems.push({ what: "candidate source", recorded: run.header.candidatePath, now: (error as Error).message })
	}

	try {
		const set = await readImageSet(run.header.setPath)
		if (set.setHash !== run.header.setHash) {
			problems.push({ what: "setHash", recorded: run.header.setHash, now: set.setHash })
		}
	} catch (error) {
		problems.push({ what: "set file", recorded: run.header.setPath, now: (error as Error).message })
	}

	if (run.rows.length !== run.header.imageCount) {
		problems.push({
			what: "row count",
			recorded: String(run.header.imageCount),
			now: String(run.rows.length),
		})
	}
	// Set order is the property every diff depends on, so it is checked rather than assumed.
	for (const [position, row] of run.rows.entries()) {
		if (row.index !== position) {
			problems.push({ what: "row order", recorded: String(position), now: String(row.index) })
			break
		}
	}
	return problems
}

/* ------------------------------------------------------------------------------------------- */
/* CLI                                                                                            */
/* ------------------------------------------------------------------------------------------- */

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

async function main(argv: readonly string[]): Promise<number> {
	const verifyPath = flag(argv, "--verify")
	if (verifyPath !== undefined) {
		const problems = await verifyRunFile(verifyPath)
		if (problems.length === 0) {
			process.stdout.write(`${verifyPath}: provenance still matches what is on disk\n`)
			return 0
		}
		process.stdout.write(`${verifyPath}: STALE\n`)
		for (const problem of problems) {
			process.stdout.write(`  ${problem.what}\n    recorded: ${problem.recorded}\n    now:      ${problem.now}\n`)
		}
		return 1
	}

	const candidatePath = flag(argv, "--candidate")
	const setPath = flag(argv, "--set")
	if (candidatePath === undefined || setPath === undefined) {
		process.stdout.write(
			"usage: run.ts --candidate <module.ts> --set <set.txt> [--out <run.jsonl>] " +
				"[--workers <n>] [--no-cache] [--verify <run.jsonl>]\n",
		)
		return 2
	}

	const workers = flag(argv, "--workers")
	const summary = await runCandidate({
		candidatePath,
		setPath,
		outPath: flag(argv, "--out"),
		workerCount: workers === undefined ? undefined : Number(workers),
		noCache: argv.includes("--no-cache"),
	})
	const { footer } = summary
	process.stdout.write(
		`${summary.outPath}\n` +
			`  ${footer.okCount} ok · ${footer.failedCount} failed · ` +
			`${footer.cacheHits} cache hits · ${footer.cacheMisses} computed · ${footer.wallMs} ms\n`,
	)
	return footer.failedCount > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2))
}

export type { Palette }
