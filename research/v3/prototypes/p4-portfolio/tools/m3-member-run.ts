/**
 * M3 tooling — run one member over a set **under a stall timeout**, so a cover that hangs costs 60
 * seconds instead of the milestone.
 *
 * ## Why a wrapper rather than a flag
 *
 * `src/devloop/run.ts` has no per-image timeout, and it is shared code P4 may not edit. What it does
 * have is the property this wrapper is built on, stated in its own comments: **rows are flushed as
 * they become writable, not at the end, so a killed run leaves a valid partial file.** So the run is
 * driven as a child process and watched from outside:
 *
 *  - the output `.jsonl` is polled; every new row is progress,
 *  - if no row appears for `--stall-ms`, the child is killed and the stall is recorded,
 *  - the rows already written are kept — they are true — and the covers not reached are listed.
 *
 * **Worker count is 1 by default, and that is what makes the attribution honest.** With one worker
 * the rows come out in set order, so the cover that stalled is exactly the next line of the set file
 * after the last row written. At *n* workers up to *n* covers are in flight and the wrapper could
 * only name a suspect set, so a stall under `--workers n > 1` is recorded as a set of candidates, not
 * as one cover.
 *
 * Zero constants: `--stall-ms` is a command-line input, reported in the status file, and nothing here
 * consults a threshold of its own.
 *
 * Usage:
 *   node --experimental-strip-types tools/m3-member-run.ts \
 *     --runner <abs run.ts> --candidate <abs module> --set <abs set.txt> \
 *     --out <abs .jsonl> --status <abs .json> --stall-ms 60000 [--workers 1]
 */

import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const HERE = dirname(new URL(import.meta.url).pathname)

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

const argv = process.argv.slice(2)
const runnerPath = flag(argv, "--runner")
const candidatePath = flag(argv, "--candidate")
const setPath = flag(argv, "--set")
const outPath = flag(argv, "--out")
const statusPath = flag(argv, "--status")
const stallMs = Number(flag(argv, "--stall-ms"))
const workers = flag(argv, "--workers") ?? "1"
const pollMs = Number(flag(argv, "--poll-ms") ?? "1000")

if (
	runnerPath === undefined ||
	candidatePath === undefined ||
	setPath === undefined ||
	outPath === undefined ||
	statusPath === undefined ||
	!Number.isFinite(stallMs)
) {
	process.stdout.write(
		"usage: --runner <run.ts> --candidate <module.ts> --set <set.txt> --out <run.jsonl> " +
			"--status <status.json> --stall-ms <ms> [--workers <n>] [--poll-ms <ms>]\n",
	)
	process.exit(2)
}

/** The set file's image paths, in order — the same read `readImageSet` does, minus the resolution. */
async function setLines(path: string): Promise<string[]> {
	const text = await readFile(path, "utf8")
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
}

/** How many result rows the run file holds right now. Missing file = zero, not an error. */
async function rowCount(path: string): Promise<number> {
	let text: string
	try {
		text = await readFile(path, "utf8")
	} catch {
		return 0
	}
	let rows = 0
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		try {
			if ((JSON.parse(line) as { kind?: string }).kind === "devloop-run-row") rows += 1
		} catch {
			// A partially-written trailing line is not a row yet. Ignored, not fatal.
		}
	}
	return rows
}

const covers = await setLines(setPath)
const startedAt = Date.now()

const child = spawn(
	process.execPath,
	[
		"--experimental-strip-types",
		resolve(HERE, "run-member.ts"),
		"--runner",
		runnerPath,
		"--candidate",
		candidatePath,
		"--set",
		setPath,
		"--out",
		outPath,
		"--workers",
		workers,
	],
	{ env: { ...process.env, NODE_NO_WARNINGS: "1" }, stdio: ["ignore", "pipe", "pipe"] },
)

let childOut = ""
let childErr = ""
child.stdout.on("data", (chunk: Buffer) => {
	childOut += chunk.toString()
})
child.stderr.on("data", (chunk: Buffer) => {
	childErr += chunk.toString()
})

const exited = new Promise<{ code: number | null; signal: string | null }>((done) => {
	child.on("exit", (code, signal) => done({ code, signal }))
})

let lastRows = 0
let lastProgressAt = Date.now()
let killed = false
let running = true
void exited.then(() => {
	running = false
})

while (running) {
	await new Promise((done) => setTimeout(done, pollMs))
	if (!running) break
	const rows = await rowCount(outPath)
	if (rows > lastRows) {
		lastRows = rows
		lastProgressAt = Date.now()
		continue
	}
	if (Date.now() - lastProgressAt > stallMs) {
		killed = true
		child.kill("SIGKILL")
		break
	}
}

const exit = await exited
const rowsWritten = await rowCount(outPath)
const parallel = Number(workers) > 1

const status = {
	kind: "p4-portfolio-m3-member-run",
	candidatePath,
	setPath,
	outPath,
	workers: Number(workers),
	stallMs,
	startedAt: new Date(startedAt).toISOString(),
	wallMs: Date.now() - startedAt,
	covers: covers.length,
	rowsWritten,
	timedOut: killed,
	// With one worker the rows are the set's own order, so the stalled cover is the next line. With
	// more, several covers are in flight and only a candidate set can be named.
	stalledOn: !killed ? null : parallel ? covers.slice(rowsWritten) : (covers[rowsWritten] ?? null),
	stalledAttribution: !killed ? null : parallel ? "candidates (workers > 1)" : "exact (workers = 1)",
	notReached: killed ? covers.slice(rowsWritten) : [],
	exitCode: exit.code,
	exitSignal: exit.signal,
	stdout: childOut.trim(),
	stderr: childErr.trim().split("\n").slice(-5).join("\n"),
}

await writeFile(resolve(statusPath), `${JSON.stringify(status, null, "\t")}\n`)
process.stdout.write(`${JSON.stringify({ ...status, stdout: undefined, stderr: undefined, notReached: status.notReached.length })}\n`)
if (killed) process.exitCode = 1
