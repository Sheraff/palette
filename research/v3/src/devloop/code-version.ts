/**
 * The measured code version of a candidate: a hash of its source and of everything it imports.
 *
 * **Why this is measured and not declared.** The cache is keyed on
 * `(input file hash, computation id, code version)`, and the whole promise of that key is that it is
 * *stale by construction* — changed code means a different key means a recomputation, with no
 * invalidation step for anyone to forget. A hand-written `version = "0.3.1"` string breaks that
 * promise silently and in the worst possible direction: you tighten the candidate, re-run, see the
 * old palettes come back out of the cache, and conclude the change did nothing. The dev loop's entire
 * value is telling you what your change did, so the one thing it must never do is lie about that.
 *
 * So the version is the hash of the bytes. Edit anything the candidate actually runs and the key
 * moves; edit a comment and the key also moves, which is a false miss and costs only time.
 *
 * **The import walk is deliberately shallow in one direction and deep in the other.** It follows
 * *relative* specifiers transitively — so a candidate that imports `../contract/color.ts` is
 * invalidated when the contract's colour maths changes, which is correct, because its palettes would
 * change too. It does **not** follow bare specifiers like `sharp`: those are packages, they are
 * pinned in `package.json`, and their versions travel in the run header's `packageVersions` instead.
 * A change of decoder version is a change of environment, not of candidate source, and the two are
 * worth telling apart when reading back why two runs disagree.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"

/**
 * Every specifier form the v3 codebase actually uses: `from "x"`, a side-effect `import "x"`, a
 * dynamic `import("x")`, and `export … from "x"`.
 *
 * [UNCALIBRATED] — a regex, not a parser. The repository has no TypeScript AST tooling at runtime
 * (`CONVENTIONS.md`: types only, no build step), and the failure mode is the safe one: a specifier
 * this misses is a file left out of the hash, which the `code-version` test guards against for the
 * shapes in use by hashing a fixture tree with each of them.
 */
const IMPORT_SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/gu

/**
 * How many files one candidate's import graph may reach before this is considered a runaway.
 *
 * [UNCALIBRATED] — a guard rail, not a measurement. The toy candidate reaches 6 files and a candidate
 * pulling in the whole contract reaches roughly 10; a candidate reaching 400 has imported the review
 * server by accident and would make every cache key depend on files it never runs.
 */
export const MAX_CANDIDATE_SOURCE_FILES = 200

/** A source file that went into the hash, with its own digest. Returned so a human can audit a key. */
export type SourceFileDigest = Readonly<{
	/** Path relative to `research/v3/`, so a digest is stable across checkouts. */
	path: string
	sha256: string
}>

export type CodeVersion = Readonly<{
	/** The digest the cache is keyed on: sha-256 over the sorted per-file digests. */
	codeVersion: string
	/** Every file that contributed, sorted. Small enough to print when a key surprises someone. */
	files: readonly SourceFileDigest[]
}>

/** `research/v3/` — the root every reported path is relative to. */
export const V3_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..", "..")

function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")
}

/**
 * Hash a module and everything it imports, transitively, through relative specifiers only.
 *
 * Throws if a relative import cannot be read: a candidate whose import graph is broken cannot be run,
 * and finding that out here — once, at load — is better than finding it out on image 400 of 20.
 */
export async function computeCodeVersion(entryPath: string): Promise<CodeVersion> {
	const seen = new Map<string, string>()
	const queue = [resolve(entryPath)]

	while (queue.length > 0) {
		const current = queue.shift() as string
		if (seen.has(current)) continue
		if (seen.size >= MAX_CANDIDATE_SOURCE_FILES) {
			throw new Error(
				`candidate import graph exceeds ${MAX_CANDIDATE_SOURCE_FILES} files at ${current}; ` +
					"a candidate that reaches this far has imported something it does not run",
			)
		}
		let source: string
		try {
			source = await readFile(current, "utf8")
		} catch (cause) {
			throw new Error(`cannot read ${current}, reached from the candidate's import graph`, { cause })
		}
		seen.set(current, createHash("sha256").update(source, "utf8").digest("hex"))

		for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
			const specifier = match[1]
			if (!isRelativeSpecifier(specifier)) continue
			queue.push(resolve(dirname(current), specifier))
		}
	}

	const files = [...seen.entries()]
		.map(([path, sha256]): SourceFileDigest => ({ path: relative(V3_ROOT, path), sha256 }))
		.sort((left, right) => (left.path < right.path ? -1 : 1))

	const digest = createHash("sha256")
	for (const file of files) digest.update(`${file.path}\u0000${file.sha256}\u0000`)
	return { codeVersion: digest.digest("hex"), files }
}

/** sha-256 of a file's bytes — the input half of a cache key, and the contract's own file identity. */
export async function hashFileBytes(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}
