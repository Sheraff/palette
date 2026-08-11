/**
 * Determinism, at both levels the machinery has one.
 *
 * `SPEC.md`'s rule is that every tie breaks on quantities computed from pixel values or raster
 * coordinates — no hash order, no map iteration order, no RNG. Two places in this work could have
 * broken it quietly: `occupancyOf` builds a `Map` of grid cells, and `guideStop` chooses among chain
 * candidates by a distance that can tie. Both are asserted here, and then the whole candidate is
 * asserted end to end on a real cover that publishes a ramp, because a determinism claim about the
 * parts is not a determinism claim about the palette.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { colorFromRgb } from "../../../../../src/contract/color.ts"
import type { GradientStop, Palette } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { measureExcursion } from "../excursion.ts"
import { guideStop } from "../guide-stop.ts"
import { occupancyOf } from "../occupancy.ts"
import { BENT_FIRST, BENT_LAST, bentPath, pixelsOf } from "./fixtures.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = resolve(HERE, "..", "..", "out", "demo-20-cycle3-wl.run.jsonl")

test("two builds of the occupancy structure agree exactly", () => {
	const pixels = pixelsOf(bentPath())
	const first = occupancyOf(pixels)
	const second = occupancyOf(pixels)
	assert.deepEqual([...first.colors], [...second.colors])
	assert.deepEqual([...first.labs], [...second.labs])
	assert.equal(first.count, second.count)
	// Ascending packed order is what makes the nearest-neighbour tie-break lexicographic RGB.
	for (let index = 1; index < first.colors.length; index += 1) {
		assert.ok(first.colors[index] > first.colors[index - 1])
	}
})

test("two runs of the excursion test and the guide stop agree exactly", () => {
	const path = bentPath()
	const stops: [GradientStop, GradientStop] = [
		{ color: colorFromRgb(BENT_FIRST), position: 0 },
		{ color: colorFromRgb(BENT_LAST), position: 1 },
	]
	const candidates = path.filter((_, index) => index % 8 === 0).map((rgb, index) => ({ nodeId: index * 8, rgb }))

	const run = () => {
		const occupancy = occupancyOf(pixelsOf(path))
		return {
			measured: measureExcursion(stops, occupancy),
			guided: guideStop({ stops, occupancy, candidates }),
		}
	}
	const first = run()
	const second = run()
	assert.equal(JSON.stringify(first.measured), JSON.stringify(second.measured))
	assert.equal(JSON.stringify(first.guided.report), JSON.stringify(second.guided.report))
	assert.deepEqual(
		first.guided.stops.map((stop) => [stop.color.hex, stop.position]),
		second.guided.stops.map((stop) => [stop.color.hex, stop.position]),
	)
})

test("two runs of the candidate over a cover that publishes a ramp agree, palette and record", async (context) => {
	const text = await readFile(BASELINE, "utf8")
	const rows = text
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as { kind: string; imagePath: string; ok: boolean; palette: Palette | null })
		.filter((row) => row.kind === "devloop-run-row" && row.ok && row.palette?.gradient !== null)
	assert.ok(rows.length > 0)
	const imagePath = rows[0].imagePath
	context.diagnostic(imagePath)

	const first = await paletteWithDiagnostics(imagePath)
	const second = await paletteWithDiagnostics(imagePath)
	assert.equal(JSON.stringify(first.palette), JSON.stringify(second.palette))
	assert.equal(JSON.stringify(first.gradientExcursion), JSON.stringify(second.gradientExcursion))
})
