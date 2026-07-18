import assert from "node:assert/strict"
import test from "node:test"
import { contrastRatio, okDistance, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import type { RGB } from "../src/types.ts"

test("OKLab conversion matches reference primaries", () => {
	const red = rgbToOKLab([255, 0, 0])
	assert.ok(Math.abs(red[0] - 0.62796) < 0.0001)
	assert.ok(Math.abs(red[1] - 0.22486) < 0.0001)
	assert.ok(Math.abs(red[2] - 0.12585) < 0.0001)
})

test("RGB and OKLab round-trip without packed-color loss", () => {
	const samples: RGB[] = [
		[0, 0, 0],
		[255, 255, 255],
		[255, 0, 0],
		[12, 90, 231],
		[129, 87, 43],
	]
	for (const sample of samples) assert.deepEqual(oklabToRGB(rgbToOKLab(sample)), sample)
})

test("WCAG contrast uses relative luminance", () => {
	assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21)
	assert.ok(Math.abs(contrastRatio([255, 0, 0], [0, 0, 0]) - 5.252) < 0.001)
})

test("OKLab distance is symmetric", () => {
	const first = rgbToOKLab([30, 80, 140])
	const second = rgbToOKLab([180, 30, 90])
	assert.equal(okDistance(first, second), okDistance(second, first))
	assert.equal(okDistance(first, first), 0)
})
