import assert from "node:assert/strict"
import test from "node:test"
import { nameOKLab, namePalette, nameRGB } from "../src/color-name.ts"
import { rgbToOKLab } from "../src/color.ts"
import type { OKLab, RGB } from "../src/types.ts"

test("RGB and OKLab naming agree and preserve source presentation data", () => {
	const rgb: RGB = [255, 192, 203]
	const fromRGB = nameRGB(rgb)
	const fromOKLab = nameOKLab(rgbToOKLab(rgb))

	assert.equal(fromRGB.sourceHex, "#ffc0cb")
	assert.equal(fromRGB.nearestName, fromRGB.nearest.name)
	assert.deepEqual(fromRGB.nearest, fromOKLab)
})

test("pinned basic color references keep their known labels", () => {
	assert.deepEqual(nameOKLab([0.6183, 0.2029, 0.0893]), {
		name: "Red",
		tier: "srgb",
		referenceHex: "#ee313e",
		referenceOKLab: [0.6183, 0.2029, 0.0893],
		distance: 0,
	})
	assert.deepEqual(nameOKLab([0.4516, -0.0197, -0.2891]), {
		name: "Blue",
		tier: "srgb",
		referenceHex: "#171cf2",
		referenceOKLab: [0.4516, -0.0197, -0.2891],
		distance: 0,
	})
})

test("palette naming preserves duplicate independent nearest names", () => {
	const descriptors = namePalette([
		[255, 192, 203],
		[254, 191, 202],
	])

	assert.deepEqual(descriptors.map(({ sourceHex }) => sourceHex), ["#ffc0cb", "#febfca"])
	assert.deepEqual(descriptors.map(({ nearestName }) => nearestName), ["Pink", "Pink"])
})

test("malformed OKLab and RGB values reject", () => {
	for (const value of [
		[Number.NaN, 0, 0],
		[0, Number.POSITIVE_INFINITY, 0],
		[0, 0],
	]) {
		assert.throws(
			() => nameOKLab(value as unknown as OKLab),
			{ name: "TypeError", message: "OKLab must contain exactly three finite numbers" },
		)
	}

	for (const value of [
		[-1, 0, 0],
		[0, 256, 0],
		[0, 0, 1.5],
	]) {
		assert.throws(
			() => nameRGB(value as unknown as RGB),
			{ name: "TypeError", message: "RGB must contain exactly three integers from 0 through 255" },
		)
	}

	assert.throws(
		() => namePalette([[0, 0, Number.NaN]]),
		{ name: "TypeError", message: "RGB must contain exactly three integers from 0 through 255" },
	)
})
