/**
 * `CHROMA_AXIS_EXTREME` is tagged `[MEASURED]`, and this is the measurement.
 *
 * The chroma lanes' whole axis — its bound, its step count, its level count — is arithmetic on one
 * number: the largest absolute value OKLab's a or b takes on an in-gamut sRGB colour. A stale number
 * there is not a tuning error, it is a `LaneQuantisationError` on some cover nobody has run yet, or
 * worse a clamp that merges the two ends of the axis. So the scan is re-run here rather than trusted:
 * all 16,777,216 triples, ~1 s, once per test run.
 *
 * It is a fact about the colour space and about `src/contract/color.ts`'s implementation of it — not
 * about the corpus — so no artwork can move it and the test needs no shards.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import { chromaLevel } from "../channels.ts"
import { CHROMA_AXIS_BOUND, CHROMA_AXIS_EXTREME, CHROMA_LEVEL_COUNT } from "../constants.ts"

test("no sRGB colour leaves the measured chroma axis", () => {
	let extreme = 0
	let minA = Number.POSITIVE_INFINITY
	let maxA = Number.NEGATIVE_INFINITY
	let minB = Number.POSITIVE_INFINITY
	let maxB = Number.NEGATIVE_INFINITY
	for (let red = 0; red < 256; red += 1) {
		for (let green = 0; green < 256; green += 1) {
			for (let blue = 0; blue < 256; blue += 1) {
				const lab = rgbToOkLab([red, green, blue])
				if (lab[1] < minA) minA = lab[1]
				if (lab[1] > maxA) maxA = lab[1]
				if (lab[2] < minB) minB = lab[2]
				if (lab[2] > maxB) maxB = lab[2]
			}
		}
	}
	extreme = Math.max(Math.abs(minA), Math.abs(maxA), Math.abs(minB), Math.abs(maxB))

	assert.equal(
		extreme,
		CHROMA_AXIS_EXTREME,
		`CHROMA_AXIS_EXTREME is stale: the scan says ${extreme} (a ∈ [${minA}, ${maxA}], b ∈ [${minB}, ${maxB}])`,
	)
	assert.ok(CHROMA_AXIS_BOUND >= extreme, "the derived bound must cover the measured extreme")
	// Both ends of the axis are reachable and land inside the level range.
	for (const value of [minA, maxA, minB, maxB]) {
		const level = chromaLevel(value)
		assert.ok(level >= 0 && level < CHROMA_LEVEL_COUNT, `${value} quantises to ${level}, off the axis`)
	}
})
