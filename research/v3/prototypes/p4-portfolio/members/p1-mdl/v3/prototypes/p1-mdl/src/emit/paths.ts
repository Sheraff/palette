/**
 * # Where things are on disk
 *
 * Two jobs, both boring, both worth having in one place: find `research/v3/`, and find the artwork
 * shards (`00/`, `01/`, …) that corpus-relative paths resolve against.
 *
 * ## Why the corpus needs more than one root
 *
 * `src/devloop/run.ts` resolves a set file's relative paths against `REPO_ROOT` = `research/v3/../..`
 * and that is correct in the primary checkout. P1 is developed in a **git worktree**
 * (`.worktrees/p1-mdl`), and the artwork shards are untracked bulk data: they exist in the primary
 * checkout and in no worktree. A resolver that only knew `REPO_ROOT` would report every corpus image
 * as missing here, which is a fact about `git worktree` and not about the data.
 *
 * So `corpusRoots()` returns the worktree root **first** (it wins whenever the shards are actually
 * there) and the primary checkout second, discovered from the `.git` pointer file rather than
 * hardcoded. No subprocess: a linked worktree's `.git` is a one-line file reading
 * `gitdir: <common>/.git/worktrees/<name>`, and the primary checkout is that path's `.git` parent.
 */

import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** `research/v3/`. This file sits at `research/v3/prototypes/p1-mdl/src/emit/paths.ts`. */
export const V3_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..")

/** `research/v3/prototypes/p1-mdl/`. */
export const PROTOTYPE_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..")

/**
 * The checkout this code is running out of — a worktree root when in a worktree.
 * Same definition as `src/devloop/run.ts`'s `REPO_ROOT`, deliberately.
 */
export const REPO_ROOT = resolve(V3_ROOT, "..", "..")

/**
 * The primary checkout, when this one is a linked worktree; otherwise `null`.
 *
 * Read from the `.git` pointer file, once. `null` is also what a non-git or unusual layout produces,
 * and callers treat it as "no second root", never as an error.
 */
export const PRIMARY_CHECKOUT_ROOT: string | null = (() => {
	const pointer = join(REPO_ROOT, ".git")
	try {
		if (!existsSync(pointer)) return null
		const contents = readFileSync(pointer, "utf8")
		// A directory `.git` reads as EISDIR above; only a linked worktree gives us a file.
		const match = /^gitdir:\s*(.+?)\s*$/m.exec(contents)
		if (match === null) return null
		const gitDir = match[1]
		const marker = gitDir.indexOf("/.git/worktrees/")
		if (marker === -1) return null
		return gitDir.slice(0, marker)
	} catch {
		return null
	}
})()

/** The roots a corpus-relative path is tried against, in order. Duplicates removed. */
export function corpusRoots(): readonly string[] {
	const roots = [REPO_ROOT]
	if (PRIMARY_CHECKOUT_ROOT !== null && PRIMARY_CHECKOUT_ROOT !== REPO_ROOT) {
		roots.push(PRIMARY_CHECKOUT_ROOT)
	}
	return roots
}

/**
 * Resolve one corpus path to a file that exists, or `null`.
 *
 * An absolute path is tried as given and nothing else — an absolute path that does not exist is a
 * missing file, not an invitation to guess. A relative path is tried against each `corpusRoots()`
 * entry in order.
 *
 * Returns `null` rather than throwing, because every caller here is *counting* what resolved, and a
 * loader that threw on the first missing artwork could not report "how many are present".
 */
export function resolveCorpusPath(candidate: string): string | null {
	if (isAbsolute(candidate)) return existsSync(candidate) ? candidate : null
	for (const root of corpusRoots()) {
		const resolved = join(root, candidate)
		if (existsSync(resolved)) return resolved
	}
	return null
}

/** `research/v3/data/legacy/` — the three fixture tiers. */
export const LEGACY_DATA_DIR = join(V3_ROOT, "data", "legacy")

/** `research/v3/data/devloop/sets/` — the dev loop's set files. */
export const DEVLOOP_SETS_DIR = join(V3_ROOT, "data", "devloop", "sets")

/**
 * Read a devloop set file into resolved absolute image paths, dropping comments and blanks.
 *
 * Entries that resolve to nothing on disk come back as `null` in `missing`, never silently skipped —
 * a set that half-resolved is a different experiment from one that fully resolved, and the caller
 * has to be able to see the difference.
 */
export function readSetFile(setPath: string): { found: string[]; missing: string[] } {
	const lines = readFileSync(setPath, "utf8").split("\n")
	const found: string[] = []
	const missing: string[] = []
	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed === "" || trimmed.startsWith("#")) continue
		const resolved = resolveCorpusPath(trimmed)
		if (resolved === null) missing.push(trimmed)
		else found.push(resolved)
	}
	return { found, missing }
}

/** Convenience for the one set file that exists today. */
export function demo20Path(): string {
	return join(DEVLOOP_SETS_DIR, "demo-20.txt")
}
