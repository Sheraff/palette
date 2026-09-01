/**
 * The dev loop's content-addressed cache.
 *
 * **What it is.** A store keyed on `(input file hash, computation id, code version)`. The runner uses
 * it automatically: every image is looked up before the candidate is called and written back after.
 * There is no invalidation command, no `--force-refresh` habit to acquire, and no moment where
 * somebody has to remember that the cache is stale — because a stale entry is unreachable rather than
 * wrong.
 *
 * **Stale by construction.** All three key parts are *measured*, never declared:
 *
 * - the **input file hash** is sha-256 over the file's bytes, which is the same identity
 *   `PHASE_0_DECISIONS.md` §1 attaches a palette to,
 * - the **computation id** names what was computed (`"palette"` today; masks and embeddings are the
 *   obvious later tenants, which is why this is not hard-coded to palettes),
 * - the **code version** is the hash of the candidate's source *and of everything it imports* — see
 *   `code-version.ts`.
 *
 * Change any of them and the key moves, so the old entry is simply never found again. This is the
 * design the toolbox review asked for (`reviews/toolbox-review/gap-scan.md` item (E), "keyed on
 * (content hash, operation, params)", "a cache key covering the **full dependency closure** makes
 * that kind of voiding structurally impossible"), and it is written this way because the alternative
 * has already cost this project a whole audit: the 0.7.7 discovery audit was voided because its
 * implementation hash omitted runtime dependencies.
 *
 * **The failure mode this is guarding against is not a wrong number — it is a wasted week.** You
 * tighten a candidate, re-run, and the old palettes come back out of the cache; the change looks like
 * it did nothing, and you go looking for the bug in the wrong place. The dev loop exists to tell you
 * what your change did, so lying about that is the one thing it must never do.
 *
 * **Layout.** Plain files, no index, no database:
 *
 *     data/devloop-cache/<computationId>/<codeVersion[0:16]>/<inputHash[0:2]>/<inputHash>.json
 *
 * Directories are readable and greppable on purpose: when a cache surprises somebody, the first thing
 * they will do is look at it. The path carries a *truncated* code version so it stays legible, and
 * the entry carries the **full** one, which is checked on read — so a truncation collision is a miss,
 * never a wrong answer.
 *
 * The store is gitignored. It is derived data: every byte of it can be recomputed from the inputs and
 * the code, which is exactly the property `PHASE_0_LOOSE_ENDS.md` C7 wishes a committed 1.08 MB
 * measurement cache had.
 */

import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { V3_ROOT } from "./code-version.ts"

/**
 * Where the store lives by default. Gitignored — see the module comment.
 *
 * [UNCALIBRATED] — a location, chosen here. It sits under `data/` beside every other instrument's
 * data directory, and it is derived: deleting it costs time and nothing else.
 */
export const DEFAULT_CACHE_ROOT = join(V3_ROOT, "data", "devloop-cache")

/**
 * How much of the code version goes into the directory name.
 *
 * [UNCALIBRATED] — chosen for legibility, not for collision resistance. 16 hex characters is 64 bits,
 * which is far past any plausible number of candidate revisions, and the entry itself carries the
 * full 64-character version and is checked against it on read. So this number trades nothing but
 * directory-name length: a collision here produces a **miss**, never a wrong palette.
 */
export const CACHE_DIRECTORY_VERSION_LENGTH = 16

/**
 * Shard width for the input-hash directory level.
 *
 * [INHERITED] — two hex characters, the same fan-out the artwork corpus itself uses (`00/`–`ff/`),
 * for the same reason: a flat directory of tens of thousands of entries is slow to list and unpleasant
 * to look at.
 */
export const CACHE_SHARD_LENGTH = 2

/**
 * The on-disk envelope version. Bumped only if the envelope's own shape changes.
 *
 * [UNCALIBRATED] — a schema number, set here. An entry carrying any other value is a miss, so an
 * older store is skipped rather than misread.
 */
export const CACHE_FORMAT = 1

/** The three things a cached value is a function of. Nothing else may enter this key. */
export type CacheKey = Readonly<{
	/** What was computed. `"palette"` for a candidate run. */
	computationId: string
	/** Measured source hash of the producing code and its import closure. */
	codeVersion: string
	/** sha-256 of the input file's bytes. */
	inputContentHash: string
}>

/** What is written to disk for one entry. */
export type CacheEntry<Value> = Readonly<{
	cacheFormat: number
	/** The digest of the whole key — recorded so a human can confirm an entry is where it belongs. */
	key: string
	computationId: string
	codeVersion: string
	inputContentHash: string
	/** ISO 8601, UTC. Bookkeeping only: **never** part of the key, so re-runs stay byte-stable. */
	createdAt: string
	value: Value
}>

export type CacheStats = Readonly<{ hits: number; misses: number; writes: number }>

export type DevLoopCache<Value> = Readonly<{
	root: string
	get(key: CacheKey): Promise<Value | null>
	put(key: CacheKey, value: Value): Promise<void>
	pathFor(key: CacheKey): string
	stats(): CacheStats
}>

/**
 * The key digest.
 *
 * The separator is a real NUL (`\u0000`), written as an escape. `CONVENTIONS.md` records why: a raw
 * NUL used as a key separator is load-bearing, the escape is byte-identical to it, and the escape is
 * the form that survives an editor. Its job is to make the concatenation unambiguous — without it,
 * `("palette", "ab", "cd")` and `("palette", "abc", "d")` would be the same string and therefore the
 * same key.
 */
export function cacheKeyDigest(key: CacheKey): string {
	return createHash("sha256")
		.update(`${key.computationId}\u0000${key.codeVersion}\u0000${key.inputContentHash}`)
		.digest("hex")
}

function entryPath(root: string, key: CacheKey): string {
	return join(
		root,
		key.computationId,
		key.codeVersion.slice(0, CACHE_DIRECTORY_VERSION_LENGTH),
		key.inputContentHash.slice(0, CACHE_SHARD_LENGTH),
		`${key.inputContentHash}.json`,
	)
}

/**
 * Open the store. Nothing is read up front — the first `get` is what touches the disk.
 *
 * A cache miss and a corrupt entry are the same outcome here (`null`), on purpose: the only correct
 * response to either is to recompute, and a dev loop that halts because a derived file got truncated
 * by a killed run would be worse than one that quietly redoes 40 milliseconds of work. What is *not*
 * tolerated is a wrong answer — an entry whose recorded full code version disagrees with the key's is
 * a miss, not a hit.
 */
export function openCache<Value>(options: { root?: string } = {}): DevLoopCache<Value> {
	const root = resolve(options.root ?? DEFAULT_CACHE_ROOT)
	let hits = 0
	let misses = 0
	let writes = 0

	return {
		root,
		pathFor: (key) => entryPath(root, key),
		stats: () => ({ hits, misses, writes }),

		async get(key) {
			let text: string
			try {
				text = await readFile(entryPath(root, key), "utf8")
			} catch {
				misses += 1
				return null
			}
			let entry: CacheEntry<Value>
			try {
				entry = JSON.parse(text) as CacheEntry<Value>
			} catch {
				misses += 1
				return null
			}
			// The full-version check. The directory name is truncated for legibility; this is what makes
			// that truncation safe rather than merely unlikely to matter.
			if (
				entry.cacheFormat !== CACHE_FORMAT ||
				entry.codeVersion !== key.codeVersion ||
				entry.inputContentHash !== key.inputContentHash ||
				entry.computationId !== key.computationId
			) {
				misses += 1
				return null
			}
			hits += 1
			return entry.value
		},

		async put(key, value) {
			const target = entryPath(root, key)
			await mkdir(dirname(target), { recursive: true })
			const entry: CacheEntry<Value> = {
				cacheFormat: CACHE_FORMAT,
				key: cacheKeyDigest(key),
				computationId: key.computationId,
				codeVersion: key.codeVersion,
				inputContentHash: key.inputContentHash,
				createdAt: new Date().toISOString(),
				value,
			}
			// Write-then-rename: a run killed mid-write leaves a stray temp file, never a half-written
			// entry that would read back as a plausible palette. `CONVENTIONS.md` asks for long runs to be
			// deliberately killable, and that has to include the cache they are filling.
			const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
			await writeFile(temporary, `${JSON.stringify(entry)}\n`, "utf8")
			await rename(temporary, target)
			writes += 1
		},
	}
}
