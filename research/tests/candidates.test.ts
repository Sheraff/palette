import assert from "node:assert/strict"
import test from "node:test"
import { buildCandidates, type Candidate } from "../src/candidates.ts"
import { chroma, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import type { Region, RegionAnalysis } from "../src/regions.ts"
import type { RGB } from "../src/types.ts"

function gridAnalysis(rows: readonly (readonly RGB[])[]): RegionAnalysis {
	const height = rows.length
	const width = rows[0].length
	const total = width * height
	const data = new Uint8Array(total * 3)
	const labs = new Float32Array(total * 3)
	const labels = new Int32Array(total)
	const regionByColor = new Map<string, number>()
	const regionColors: RGB[] = []
	const regionAreas: number[] = []

	for (let y = 0; y < height; y++) {
		assert.equal(rows[y].length, width)
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const rgb = rows[y][x]
			const key = rgb.join(",")
			let regionId = regionByColor.get(key)
			if (regionId === undefined) {
				regionId = regionColors.length
				regionByColor.set(key, regionId)
				regionColors.push(rgb)
				regionAreas.push(0)
			}
			regionAreas[regionId]++
			labels[pixel] = regionId
			data.set(rgb, pixel * 3)
			labs.set(rgbToOKLab(rgb), pixel * 3)
		}
	}

	const regions: Region[] = regionColors.map((rgb, id) => {
		const lab = rgbToOKLab(rgb)
		return {
			id,
			area: regionAreas[id],
			population: regionAreas[id] / total,
			centerX: 0.5,
			centerY: 0.5,
			lab,
			rgb,
			borderPixels: 0,
			sideCount: 0,
			edge: 0,
			variance: 0,
			distinctiveness: 0,
			localContrast: 0,
			background: 0,
			saliency: id === 0 ? 0.1 : 0.8,
			text: id === 0 ? 0.2 : 0.7,
			chroma: chroma(lab),
			neighbors: [],
		}
	})
	return { regions, labels, labs, edges: new Float32Array(total), data, width, height }
}

function candidateWithRgb(candidates: Candidate[], rgb: RGB): Candidate {
	const candidate = candidates.find((value) => value.hex === rgbToHex(rgb))
	assert.ok(candidate, `Missing candidate ${rgbToHex(rgb)}`)
	return candidate
}

function grid(width: number, height: number, colorAt: (x: number, y: number) => RGB): RGB[][] {
	return Array.from({ length: height }, (_, y) =>
		Array.from({ length: width }, (_, x) => colorAt(x, y)))
}

test("reports exact four-connected support and region IDs", () => {
	const red: RGB = [220, 30, 40]
	const blue: RGB = [20, 60, 150]
	const connected = gridAnalysis(grid(5, 5, (x, y) =>
		x >= 1 && x <= 2 && y >= 1 && y <= 2 ? red : blue))
	const redRegionId = connected.labels[6]
	const secondRedRegionId = connected.regions.length
	connected.regions.push({ ...connected.regions[redRegionId], id: secondRedRegionId })
	connected.labels[12] = secondRedRegionId
	const fragmented = gridAnalysis(grid(5, 5, (x, y) =>
		(x === 1 || x === 3) && (y === 1 || y === 3) ? red : blue))

	const connectedRed = candidateWithRgb(buildCandidates(connected, 2, false), red)
	const fragmentedRed = candidateWithRgb(buildCandidates(fragmented, 2, false), red)
	assert.equal(connectedRed.spatial.population, 4 / 25)
	assert.equal(fragmentedRed.spatial.population, 4 / 25)
	assert.equal(connectedRed.spatial.components.length, 1)
	assert.equal(fragmentedRed.spatial.components.length, 4)
	assert.ok(connectedRed.spatial.field > fragmentedRed.spatial.field)
	assert.deepEqual(connectedRed.regionIds, connectedRed.spatial.regionIds)
	assert.deepEqual(connectedRed.regionIds, [redRegionId, secondRedRegionId])
	assert.ok(connectedRed.spatial.components.every((component) => component.regionIds.length > 0))
	assert.equal(connectedRed.spatial.components[0].saliency, 0.8)
	assert.equal(connectedRed.spatial.components[0].text, 0.7)
})

test("reports side-specific frame evidence from exact perimeter support", () => {
	const frame: RGB = [230, 180, 30]
	const interior: RGB = [30, 40, 55]
	const analysis = gridAnalysis(grid(6, 6, (x, y) =>
		x === 0 || x === 5 || y === 0 || y === 5 ? frame : interior))
	const candidates = buildCandidates(analysis, 2, false)
	const frameCandidate = candidateWithRgb(candidates, frame)
	const interiorCandidate = candidateWithRgb(candidates, interior)

	assert.deepEqual(frameCandidate.spatial.sideCoverage, [1, 1, 1, 1])
	assert.equal(frameCandidate.spatial.components.length, 1)
	assert.ok(Math.abs(frameCandidate.spatial.frame - (1 - Math.sqrt(20 / 36))) < 1e-12)
	assert.deepEqual(interiorCandidate.spatial.sideCoverage, [0, 0, 0, 0])
	assert.equal(interiorCandidate.spatial.frame, 0)
})

test("fixed-anchor families expose union evidence", () => {
	const first: RGB = [100, 100, 100]
	const second: RGB = [112, 112, 112]
	const far: RGB = [230, 230, 230]
	const nearDistance = okDistance(rgbToOKLab(first), rgbToOKLab(second))
	assert.ok(nearDistance > 0.025 && nearDistance < 0.055)
	const analysis = gridAnalysis(grid(6, 3, (x) => x < 2 ? first : x < 4 ? second : far))
	const candidates = buildCandidates(analysis, 3, false)
	const firstCandidate = candidateWithRgb(candidates, first)
	const secondCandidate = candidateWithRgb(candidates, second)
	const farCandidate = candidateWithRgb(candidates, far)

	assert.equal(firstCandidate.familyId, secondCandidate.familyId)
	assert.notEqual(firstCandidate.familyId, farCandidate.familyId)
	assert.equal(firstCandidate.familySpatial.population, 2 / 3)
	assert.deepEqual(firstCandidate.familySpatial, secondCandidate.familySpatial)
	assert.equal(firstCandidate.familySpatial.components.length, 1)
	assert.deepEqual(firstCandidate.familySpatial.regionIds, [0, 1])
	const uniqueFamilies = new Map(candidates.map((candidate) => [candidate.familyId, candidate.familySpatial]))
	assert.ok(Math.abs([...uniqueFamilies.values()].reduce((sum, evidence) => sum + evidence.population, 0) - 1) < 1e-12)
})

test("typography masks are exact but do not duplicate primary family mass", () => {
	const dark: RGB = [25, 30, 35]
	const white: RGB = [250, 250, 250]
	const analysis = gridAnalysis(grid(10, 10, (x, y) =>
		x >= 4 && x <= 5 && y >= 4 && y <= 5 ? white : dark))
	for (const region of analysis.regions) {
		region.saliency = 0
		region.text = 0
	}
	const candidates = buildCandidates(analysis, 1, true)
	const typography = candidates.find((candidate) => candidate.typographyOnly)
	const primary = candidates.find((candidate) => !candidate.typographyOnly)
	assert.ok(typography)
	assert.ok(primary)

	assert.equal(typography.spatial.population, 4 / 100)
	assert.equal(typography.spatial.components.length, 1)
	assert.deepEqual(typography.regionIds, [1])
	assert.deepEqual(typography.spatial.sideCoverage, [0, 0, 0, 0])
	assert.equal(primary.spatial.population, 1)
	assert.equal(typography.familyId, primary.familyId)
	assert.equal(typography.familySpatial.population, 1)
	assert.equal(primary.familySpatial.population, 1)
	assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, candidates.length)
})

test("candidate spatial and family evidence is deterministic", () => {
	const colors: RGB[] = [[20, 30, 40], [100, 100, 100], [112, 112, 112], [245, 245, 245]]
	const analysis = gridAnalysis(grid(8, 6, (x, y) => colors[(x * 3 + y * 5) % colors.length]))
	assert.deepEqual(buildCandidates(analysis, 4, true), buildCandidates(analysis, 4, true))
})
