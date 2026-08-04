/**
 * Determinism — the same file must give a byte-identical measurement.
 *
 * The property is meant to be structural (exact integer moments, canonical sorts, no RNG, no clock,
 * no hash-order iteration), but structural claims still need an instrument. This one runs
 * `measureImage` twice and compares `canonicalJson` character for character, on synthetic images and
 * on a real corpus image.
 */

import assert from "node:assert/strict"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import { canonicalDigest, canonicalJson, measureImage } from "../../src/measure/index.ts"
import { cleanupFixtures, readSetFile, resolveCorpusRoot, setFilePath, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

describe("canonical serialisation", () => {
	it("is byte-identical across two runs on a synthetic image", async () => {
		const path = await writeRgbImage("determinism-mixed.png", 48, 48, (x, y) => {
			const value = (x * 7 + y * 13) % 256
			return [value, (value * 3) % 256, 255 - value] as const
		})
		const first = canonicalJson(await measureImage(path))
		const second = canonicalJson(await measureImage(path))
		assert.equal(first, second)
	})

	it("is byte-identical on a flat image, where every sum is trivially exact", async () => {
		const path = await writeRgbImage("determinism-flat.png", 32, 32, () => [17, 34, 51] as const)
		assert.equal(canonicalDigest(await measureImage(path)), canonicalDigest(await measureImage(path)))
	})

	it("sorts object keys, so two structurally equal measurements serialise the same", async () => {
		const path = await writeRgbImage("determinism-keys.png", 16, 16, (x) => [x * 8, 20, 30] as const)
		const serialised = canonicalJson(await measureImage(path))
		const keys = Object.keys(JSON.parse(serialised) as Record<string, unknown>)
		assert.deepEqual(keys, [...keys].sort())
	})

	it("gives different files different digests", async () => {
		const left = await writeRgbImage("determinism-left.png", 16, 16, () => [10, 20, 30] as const)
		const right = await writeRgbImage("determinism-right.png", 16, 16, () => [10, 20, 31] as const)
		assert.notEqual(
			canonicalDigest(await measureImage(left)),
			canonicalDigest(await measureImage(right)),
		)
	})
})

describe("determinism on the real corpus", () => {
	it("gives the same digest twice for a demo-20 cover", async (t) => {
		const corpusRoot = resolveCorpusRoot("00")
		if (corpusRoot === null) {
			t.skip("artwork shards are not present in this checkout")
			return
		}
		const [first] = await readSetFile(setFilePath("demo-20.txt"))
		const imagePath = join(corpusRoot, first)
		assert.equal(
			canonicalDigest(await measureImage(imagePath)),
			canonicalDigest(await measureImage(imagePath)),
		)
	})
})
