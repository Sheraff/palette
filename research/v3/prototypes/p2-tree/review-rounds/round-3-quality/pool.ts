/**
 * The fresh-cover pool, and the 40 of it this round runs.
 *
 *     node --experimental-strip-types pool.ts        # rewrites fresh-40.txt
 *
 * `DECISIONS.md` D3, round composition: *"P2 rounds from round 3 on draw beyond demo-20 — fresh
 * covers from coverage-set-1 / unreviewed shards"*, because a fresh-cover overfitting flag fired
 * campaign-wide. So the pool is coverage-set-1 **minus** every cover this prototype has already been
 * tuned or measured against:
 *
 *   - `data/devloop/sets/demo-20.txt` — every dev-loop run, round 1, round 2 and the whole cycle-2
 *     role rebuild happened on these twenty;
 *   - `falsifier/out/endorsed-173.txt` — the reachability falsifier's corpus, and therefore the set
 *     the retained-node construction was checked against.
 *
 * 201 of coverage-set-1's 220 artworks survive that (19 are in the endorsed set; demo-20 does not
 * overlap coverage-set-1 at all). The round runs the **first 40 by sorted repo-relative path** —
 * sort first, cut after, so no cover is in the run because of how it looks.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** How many of the pool the round runs. Fixed here so the cut is in the file, not in a shell line. */
export const RUN_COUNT = 40

function setFile(path: string): string[] {
	return readFileSync(join(ROOT, path), "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
}

export function freshPool(): string[] {
	const coverage = JSON.parse(readFileSync(join(ROOT, "research/v3/data/coverage-set/coverage-set-1.json"), "utf8")) as {
		artworks: { path: string }[]
	}
	const excluded = new Set([...setFile("research/v3/data/devloop/sets/demo-20.txt"), ...setFile("research/v3/prototypes/p2-tree/falsifier/out/endorsed-173.txt")])
	return coverage.artworks
		.map((artwork) => artwork.path)
		.filter((path) => !excluded.has(path))
		.sort((first, second) => (first < second ? -1 : first > second ? 1 : 0))
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	const pool = freshPool()
	const run = pool.slice(0, RUN_COUNT)
	for (const path of run) if (!existsSync(join(ROOT, path))) throw new Error(`image missing on disk: ${path}`)
	// No gitCommit in this file: HEAD moves under this worktree while the round is being staged
	// (the orchestrator appends decisions), and the run set must not change when it does. The
	// commit is a fingerprint of the FIXTURE, and that is where it is recorded.
	writeFileSync(
		join(HERE, "fresh-40.txt"),
		[
			"# The round-3 fresh-cover run set — NOT a dev-loop set file, and deliberately not installed as one.",
			"# coverage-set-1 minus demo-20 minus falsifier/out/endorsed-173.txt, sorted by repo-relative path,",
			"# first 40. Rebuild: node --experimental-strip-types pool.ts",
			`# pool=${pool.length} run=${run.length}`,
			...run,
			"",
		].join("\n"),
		"utf8",
	)
	const gitCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
	console.log(`pool=${pool.length} run=${run.length} gitCommit=${gitCommit}`)
}
