import assert from "node:assert/strict"
import test from "node:test"
import { buildConnectedFamilyCandidateAvailability } from "../src/connected-family-candidate-availability.ts"
import { perceivePaletteImage } from "../src/palette-perception.ts"
import type { RawImage, RGB } from "../src/types.ts"

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function exactPixel(source: RawImage, rgb: RGB): boolean {
	for (let offset = 0; offset < source.data.length; offset += 3) {
		if (source.data[offset] === rgb[0] && source.data[offset + 1] === rgb[1] && source.data[offset + 2] === rgb[2]) return true
	}
	return false
}

test("connected family availability is deterministic, read-only, and source exact", () => {
	const source = image(80, 80, (x, y) => x >= 35 && x < 45 && y >= 35 && y < 45 ? [245, 70, 150] : [16, 18, 22])
	const perception = perceivePaletteImage(source)
	const before = structuredClone(perception.candidates)
	const first = buildConnectedFamilyCandidateAvailability(perception)
	const second = buildConnectedFamilyCandidateAvailability(perception)

	assert.deepEqual(first, second)
	assert.deepEqual(perception.candidates, before)
	assert.ok(first.proposals.every((proposal) => exactPixel(source, proposal.rgb)))
	assert.ok(first.proposals.every((proposal) => proposal.mask[proposal.representativePixelIndex] === 1))
	assert.equal(first.invariants.proposalsNotPassedToRoleSolver, true)
})

test("isolated chromatic specks do not form a connected family", () => {
	const source = image(100, 100, (x, y) => (x * 37 + y * 61) % 97 === 0 ? [245, 70, 150] : [16, 18, 22])
	const result = buildConnectedFamilyCandidateAvailability(perceivePaletteImage(source))

	assert.equal(result.proposals.some((proposal) => proposal.hex === "#f54696"), false)
	assert.ok(result.anchors.some((anchor) => anchor.rawComponentCount > 20 && anchor.qualifyingComponentCount === 0))
})

test("connected support below the ordinary population floor remains analyzable", () => {
	const source = image(100, 100, (x, y) => x >= 48 && x < 52 && y >= 48 && y < 56 ? [245, 70, 150] : [16, 18, 22])
	const result = buildConnectedFamilyCandidateAvailability(perceivePaletteImage(source))
	const trace = result.anchors.find((anchor) => anchor.populationRoute === "large-component")

	assert.ok(trace)
	assert.ok(trace.retainedPopulation < result.thresholds.ordinaryMinimumPopulation)
	assert.ok(trace.largestComponent >= result.thresholds.minimumLargestComponent)
})

test("connectivity distinguishes equal chromatic histograms", () => {
	const pink: RGB = [245, 70, 150]
	const black: RGB = [16, 18, 22]
	const connected = image(100, 100, (x, y) => x >= 48 && x < 52 && y >= 48 && y < 56 ? pink : black)
	const isolatedPixels = new Set(Array.from({ length: 32 }, (_, index) => `${(index * 29) % 100},${(index * 47) % 100}`))
	const isolated = image(100, 100, (x, y) => isolatedPixels.has(`${x},${y}`) ? pink : black)
	const connectedResult = buildConnectedFamilyCandidateAvailability(perceivePaletteImage(connected))
	const isolatedResult = buildConnectedFamilyCandidateAvailability(perceivePaletteImage(isolated))

	assert.equal(connected.data.filter((value, offset) => offset % 3 === 0 && value === pink[0]).length, 32)
	assert.equal(isolated.data.filter((value, offset) => offset % 3 === 0 && value === pink[0]).length, 32)
	assert.ok(connectedResult.anchors.some((anchor) => anchor.qualifyingComponentCount > 0 && anchor.populationRoute))
	assert.equal(isolatedResult.anchors.some((anchor) => anchor.qualifyingComponentCount > 0), false)
})

test("baseline representative inside the connected mask prevents a duplicate", () => {
	const source = image(40, 40, (x, y) => x >= 16 && x < 24 && y >= 16 && y < 24 ? [245, 70, 150] : [16, 18, 22])
	const result = buildConnectedFamilyCandidateAvailability(perceivePaletteImage(source))

	assert.ok(result.anchors.some((anchor) => anchor.outcome === "already-represented"))
	assert.equal(result.proposals.some((proposal) => proposal.hex === "#f54696"), false)
})
