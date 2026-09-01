/**
 * The dev loop's cache: it must be stale by construction, and it must never answer with the wrong
 * palette.
 *
 * The two failure modes are not symmetric and the tests are weighted accordingly. A **miss that
 * should have been a hit** costs seconds. A **hit that should have been a miss** costs a working day:
 * you change the candidate, re-run, watch the old palettes come back, and go looking for the bug in
 * the code you just fixed. Every case below that could go either way is asserted to go to a miss.
 */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, before, describe, it } from "node:test"
import { cacheKeyDigest, CACHE_DIRECTORY_VERSION_LENGTH, openCache } from "../src/devloop/cache.ts"

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const VERSION_1 = "1".repeat(64)
const VERSION_2 = "2".repeat(64)

let root: string

before(async () => {
	root = await mkdtemp(join(tmpdir(), "devloop-cache-"))
})

after(async () => {
	await rm(root, { recursive: true, force: true })
})

describe("the cache key", () => {
	it("cannot be made ambiguous by concatenation", () => {
		// Without a separator, ("ab","c") and ("a","bc") are the same string and therefore the same
		// entry. The separator is a NUL, and this is what it is for.
		assert.notEqual(
			cacheKeyDigest({ computationId: "ab", codeVersion: "c", inputContentHash: HASH_A }),
			cacheKeyDigest({ computationId: "a", codeVersion: "bc", inputContentHash: HASH_A }),
		)
	})

	it("moves when any one of the three parts moves", () => {
		const base = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		const digests = new Set([
			cacheKeyDigest(base),
			cacheKeyDigest({ ...base, computationId: "mask" }),
			cacheKeyDigest({ ...base, codeVersion: VERSION_2 }),
			cacheKeyDigest({ ...base, inputContentHash: HASH_B }),
		])
		assert.equal(digests.size, 4, "two different keys collapsed to one digest")
	})
})

describe("get and put", () => {
	it("round-trips a value", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "roundtrip") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		assert.equal(await cache.get(key), null)
		await cache.put(key, { hex: "#123456" })
		assert.deepEqual(await cache.get(key), { hex: "#123456" })
		assert.deepEqual(cache.stats(), { hits: 1, misses: 1, writes: 1 })
	})

	it("a changed code version is a miss — the whole promise of the store", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "codeversion") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		await cache.put(key, { hex: "#000000" })
		assert.deepEqual(await cache.get(key), { hex: "#000000" })
		// The same image, the same computation, one edit to the candidate. There is no invalidation
		// step: the old entry is simply not where the new key looks.
		assert.equal(await cache.get({ ...key, codeVersion: VERSION_2 }), null)
	})

	it("a changed input file is a miss", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "input") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		await cache.put(key, { hex: "#000000" })
		assert.equal(await cache.get({ ...key, inputContentHash: HASH_B }), null)
	})

	it("a different computation over the same file is a miss", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "computation") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		await cache.put(key, { hex: "#000000" })
		assert.equal(await cache.get({ ...key, computationId: "mask" }), null)
	})
})

describe("entries that cannot be trusted are misses, never answers", () => {
	it("a truncated code-version collision does not serve the wrong value", async () => {
		// The directory name carries only the first `CACHE_DIRECTORY_VERSION_LENGTH` characters, for
		// legibility. These two versions share that prefix and differ after it, so they land on the same
		// path — and the second `put` overwrites the first. What must NOT happen is the first key then
		// reading back the second key's value.
		const shared = "f".repeat(CACHE_DIRECTORY_VERSION_LENGTH)
		const first = { computationId: "palette", codeVersion: `${shared}${"1".repeat(48)}`, inputContentHash: HASH_A }
		const second = { computationId: "palette", codeVersion: `${shared}${"2".repeat(48)}`, inputContentHash: HASH_A }
		const cache = openCache<{ hex: string }>({ root: join(root, "collision") })

		await cache.put(first, { hex: "#111111" })
		await cache.put(second, { hex: "#222222" })
		assert.equal(cache.pathFor(first), cache.pathFor(second), "this test is only meaningful if they collide")

		assert.deepEqual(await cache.get(second), { hex: "#222222" })
		assert.equal(await cache.get(first), null, "a truncated-prefix collision served the wrong value")
	})

	it("a corrupt entry is a miss, not a crash", async () => {
		// What a killed run used to be able to leave behind. Recomputing 40 milliseconds of work is the
		// only correct response; halting the loop is not.
		const cache = openCache<{ hex: string }>({ root: join(root, "corrupt") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		const target = cache.pathFor(key)
		await mkdir(dirname(target), { recursive: true })
		await writeFile(target, "{ this is not json", "utf8")
		assert.equal(await cache.get(key), null)
	})

	it("an entry whose recorded key disagrees with the file it sits in is a miss", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "mislabelled") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		const target = cache.pathFor(key)
		await mkdir(dirname(target), { recursive: true })
		await writeFile(
			target,
			JSON.stringify({
				cacheFormat: 1,
				key: "whatever",
				computationId: "palette",
				codeVersion: VERSION_2,
				inputContentHash: HASH_A,
				createdAt: "2026-08-04T00:00:00.000Z",
				value: { hex: "#333333" },
			}),
			"utf8",
		)
		assert.equal(await cache.get(key), null, "the envelope's own code version was not checked")
	})

	it("an entry written by a future format is a miss", async () => {
		const cache = openCache<{ hex: string }>({ root: join(root, "format") })
		const key = { computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A }
		const target = cache.pathFor(key)
		await mkdir(dirname(target), { recursive: true })
		await writeFile(
			target,
			JSON.stringify({ cacheFormat: 99, key: "x", ...key, createdAt: "2026-08-04T00:00:00.000Z", value: { hex: "#444444" } }),
			"utf8",
		)
		assert.equal(await cache.get(key), null)
	})
})

describe("the layout", () => {
	it("puts the three key parts in the path, so a human can find an entry", () => {
		const cache = openCache({ root: "/tmp/example" })
		const path = cache.pathFor({ computationId: "palette", codeVersion: VERSION_1, inputContentHash: HASH_A })
		assert.ok(path.includes("/palette/"), "the computation is not in the path")
		assert.ok(path.includes(`/${VERSION_1.slice(0, CACHE_DIRECTORY_VERSION_LENGTH)}/`), "the code version is not in the path")
		assert.ok(path.endsWith(`${HASH_A}.json`), "the input hash is not the file name")
	})
})
