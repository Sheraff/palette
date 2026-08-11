/**
 * M1 tooling — run one member, either its **home** original or p4's **snapshot**, and write the
 * results file into p4's own subtree.
 *
 * ## Why this exists rather than a bare `run.ts --candidate …`
 *
 * The byte-identity gate has to run each member's original *from its home worktree* — the home
 * `run.ts`, so `V3_ROOT`/`REPO_ROOT` and the whole import graph are the home checkout's, exactly as
 * that prototype runs it. But p4's worker is forbidden from **writing** anywhere outside
 * `prototypes/p4-portfolio/**`, and `run.ts`'s CLI has no flag for either the results path's default
 * root or the cache root, so a plain CLI invocation from another worktree would write its run file
 * to that worktree's `data/devloop/runs/` and its cache entries to that worktree's
 * `data/devloop-cache/`.
 *
 * `runCandidate()` — the same function the CLI calls, one layer down — takes both as options. So this
 * driver imports the **home** `run.ts` module (side: `home`) or **p4's** (side: `snapshot`) and calls
 * it with `outPath` and `cacheRoot` inside p4. Nothing about the run changes; only where its bytes
 * land. Read-only on every other worktree.
 *
 * `--no-cache` is always on: these runs are measurements of cold per-cover time, and the cache would
 * make the second one a statement about the disk.
 *
 * Usage:
 *   node --experimental-strip-types tools/run-member.ts \
 *     --runner <abs path to a research/v3/src/devloop/run.ts> \
 *     --candidate <abs path to the candidate module> \
 *     --set <abs path to a set file> --out <abs .jsonl path> [--workers <n>]
 */

import { dirname, join, resolve } from "node:path"

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

const argv = process.argv.slice(2)
const runnerPath = flag(argv, "--runner")
const candidatePath = flag(argv, "--candidate")
const setPath = flag(argv, "--set")
const outPath = flag(argv, "--out")
if (runnerPath === undefined || candidatePath === undefined || setPath === undefined || outPath === undefined) {
	process.stdout.write("usage: --runner <run.ts> --candidate <module.ts> --set <set.txt> --out <run.jsonl>\n")
	process.exit(2)
}

const P4_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const workers = flag(argv, "--workers")

const runner = (await import(resolve(runnerPath))) as {
	runCandidate: (options: Record<string, unknown>) => Promise<{ footer: Record<string, unknown>; outPath: string }>
}

const summary = await runner.runCandidate({
	candidatePath: resolve(candidatePath),
	setPath: resolve(setPath),
	outPath: resolve(outPath),
	cacheRoot: join(P4_ROOT, "data", "m1", "cache"),
	noCache: true,
	quiet: true,
	workerCount: workers === undefined ? undefined : Number(workers),
})

process.stdout.write(`${JSON.stringify(summary.footer)}\n`)
