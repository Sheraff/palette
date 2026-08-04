/**
 * The measurement layer against real album artwork.
 *
 * Synthetic fixtures check the arithmetic; this checks that the thing decodes what the corpus
 * actually contains — including the greyscale JPEG in `demo-20`, which arrives with one channel and
 * has to come out of `toColourspace("srgb")` as three — and that a whole measurement costs seconds
 * rather than minutes.
 *
 * Set files list repository-relative paths and the shards are git-ignored, so `resolveCorpusRoot`
 * walks to whichever checkout holds them; when none does, these tests skip with a reason.
 */

import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { measureImage } from "../../src/measure/index.ts"
import { readSetFile, resolveCorpusRoot, setFilePath } from "./support.ts"

/** How many covers the timing case measures. Three is enough to see the spread without a slow suite. */
const TIMED_IMAGE_COUNT = 3

/**
 * The per-image budget this test enforces.
 *
 * Derived-and-stated: the brief for this layer asks for "seconds, not minutes". The slowest cover in
 * `demo-20` — 55,697 distinct triples in 300×300 — measures in about 4.5 s on the development
 * machine, essentially all of it in the smoothed-mass lattice sum. 30 s leaves better than a 6×
 * margin for a slower machine while still failing loudly if the cost ever becomes superlinear.
 */
const PER_IMAGE_BUDGET_SECONDS = 30

describe("real corpus", () => {
	it("decodes and measures demo-20 covers, and reports what each cost", async (t) => {
		const corpusRoot = resolveCorpusRoot("00")
		if (corpusRoot === null) {
			t.skip("artwork shards are not present in this checkout")
			return
		}
		const paths = await readSetFile(setFilePath("demo-20.txt"))
		assert.ok(paths.length >= TIMED_IMAGE_COUNT)

		for (const relativePath of paths.slice(0, TIMED_IMAGE_COUNT)) {
			const startedAt = performance.now()
			const measurement = await measureImage(join(corpusRoot, relativePath))
			const seconds = (performance.now() - startedAt) / 1000

			assert.equal(measurement.source.pixelCount, measurement.source.width * measurement.source.height)
			assert.ok(measurement.triples.colorCount > 0)
			// Dimensions come from the header, and §1 forbids resampling, so the raster is native size.
			assert.equal(measurement.source.width, 300)
			assert.equal(measurement.source.height, 300)
			assert.ok(
				seconds < PER_IMAGE_BUDGET_SECONDS,
				`${relativePath} took ${seconds.toFixed(2)}s, past the ${PER_IMAGE_BUDGET_SECONDS}s budget`,
			)

			console.log(
				`  ${relativePath}  ${measurement.source.width}x${measurement.source.height}  ` +
					`K=${measurement.triples.colorCount}  smoothed-mass=${measurement.smoothedMass.mode}  ` +
					`${seconds.toFixed(2)}s`,
			)
		}
	})

	it("keeps the table's own totals consistent with the image", async (t) => {
		const corpusRoot = resolveCorpusRoot("00")
		if (corpusRoot === null) {
			t.skip("artwork shards are not present in this checkout")
			return
		}
		const paths = await readSetFile(setFilePath("demo-20.txt"))
		const measurement = await measureImage(join(corpusRoot, paths[0]))
		const { triples, source } = measurement

		// The parts sum to the whole — the order-free property, checked on real data. The right-hand
		// sides are the analytic grid sums, not another accumulation of the same numbers.
		let countTotal = 0
		let sumXTotal = 0
		let sumYTotal = 0
		for (let row = 0; row < triples.colorCount; row += 1) {
			countTotal += triples.counts[row]
			sumXTotal += triples.sumX[row]
			sumYTotal += triples.sumY[row]
		}
		const gridSumX = ((source.width - 1) * source.width * source.height) / 2
		const gridSumY = ((source.height - 1) * source.height * source.width) / 2
		assert.equal(countTotal, source.pixelCount)
		assert.equal(sumXTotal, gridSumX)
		assert.equal(sumYTotal, gridSumY)

		// Keys are strictly ascending: the canonical order the whole prototype iterates in.
		for (let row = 1; row < triples.colorCount; row += 1) {
			assert.ok(triples.keys[row] > triples.keys[row - 1], `keys out of order at ${row}`)
		}
	})

	it("decodes a single-channel JPEG as three sRGB channels", async (t) => {
		const corpusRoot = resolveCorpusRoot("00")
		if (corpusRoot === null) {
			t.skip("artwork shards are not present in this checkout")
			return
		}
		// `demo-20`'s second entry is a greyscale JPEG — `sharp().metadata().channels` reports 1 — and
		// is exactly the case that would break a decoder assuming three channels off the header.
		const paths = await readSetFile(setFilePath("demo-20.txt"))
		const measurement = await measureImage(join(corpusRoot, paths[1]))
		assert.equal(measurement.source.channels, 3)
		assert.equal(measurement.source.format, "jpeg")
		assert.ok(measurement.triples.colorCount > 0)
	})
})
