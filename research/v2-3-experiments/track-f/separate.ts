/**
 * Track F separation search: computes candidate "structural region vs. seam /
 * texture" statistics for every field-lane family of every review fixture, and
 * marks which family owns the reviewed background and surface colours. The point
 * is to find a measure on which meteora's rejected surface is an outlier against
 * every surface human review accepted.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/separate.ts [caseId ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { ColorFamilyEvidence, NativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, okDistance, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const RADIUS = Number(process.env.TRACK_F_RADIUS ?? 5)

/** Perpendicular distance from `point` to the OKLab segment `[start, end]`, plus its projection parameter. */
function chordGeometry(point: OKLab, start: OKLab, end: OKLab): Readonly<{ offset: number; position: number; length: number }> {
	const axis: OKLab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
	const lengthSquared = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
	const length = Math.sqrt(lengthSquared)
	if (lengthSquared === 0) return { offset: okDistance(point, start), position: 0, length: 0 }
	const delta: OKLab = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
	const position = (delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2]) / lengthSquared
	const projected: OKLab = [start[0] + axis[0] * position, start[1] + axis[1] * position, start[2] + axis[2] * position]
	return { offset: okDistance(point, projected), position, length }
}

/**
 * Seam occupancy: share of the family's own pixels whose (2R+1)^2 window contains
 * pixels of BOTH designated anchor families. A seam/ramp step between two fields
 * scores high; a field tier that exists in its own right scores low.
 *
 * Also returns the share of the family's pixels whose window contains the *primary*
 * anchor at all (contact), and mean own-window density (solidity).
 */
function seamStatistics(
	evidence: NativePaletteEvidence,
	familyIndex: number,
	firstAnchor: number,
	secondAnchor: number,
	radius: number,
): Readonly<{ seamShare: number; firstContact: number; secondContact: number; solidity: number }> {
	const { width, height, familyAt, pixelCount } = evidence
	const stride = width + 1
	const makeIntegral = (target: number): Int32Array => {
		const integral = new Int32Array(stride * (height + 1))
		for (let y = 0; y < height; y++) {
			let rowSum = 0
			for (let x = 0; x < width; x++) {
				rowSum += familyAt[y * width + x] === target ? 1 : 0
				integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum
			}
		}
		return integral
	}
	const own = makeIntegral(familyIndex)
	const first = makeIntegral(firstAnchor)
	const second = makeIntegral(secondAnchor)
	const sum = (integral: Int32Array, x0: number, y0: number, x1: number, y1: number): number =>
		integral[(y1 + 1) * stride + (x1 + 1)] - integral[y0 * stride + (x1 + 1)] -
		integral[(y1 + 1) * stride + x0] + integral[y0 * stride + x0]

	let seam = 0
	let firstHits = 0
	let secondHits = 0
	let solid = 0
	let population = 0
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		if (familyAt[pixelIndex] !== familyIndex) continue
		const x = pixelIndex % width
		const y = (pixelIndex - x) / width
		const x0 = Math.max(0, x - radius)
		const y0 = Math.max(0, y - radius)
		const x1 = Math.min(width - 1, x + radius)
		const y1 = Math.min(height - 1, y + radius)
		const area = (x1 - x0 + 1) * (y1 - y0 + 1)
		const firstCount = sum(first, x0, y0, x1, y1)
		const secondCount = sum(second, x0, y0, x1, y1)
		if (firstCount > 0 && secondCount > 0) seam += 1
		if (firstCount > 0) firstHits += 1
		if (secondCount > 0) secondHits += 1
		solid += sum(own, x0, y0, x1, y1) / area
		population += 1
	}
	const denominator = Math.max(1, population)
	return {
		seamShare: seam / denominator,
		firstContact: firstHits / denominator,
		secondContact: secondHits / denominator,
		solidity: solid / denominator,
	}
}

function hexOf(family: ColorFamilyEvidence): string {
	return rgbToHex(oklabToRGB(family.prototype))
}

const requested = process.argv.slice(2)
const selected = requested.length === 0
	? reviewFixtures
	: reviewFixtures.filter(({ caseId }) => requested.some((name) => caseId === name || caseId.startsWith(`${name}.`)))

console.log([
	"case", "family", "hex", "role", "pop%", "rank", "chordOff", "chordPos", "chordLen",
	"seamShare", "solidity", "largeComps", "largeMass", "spread", "conc", "edgeDens", "fieldScore",
].join("\t"))

for (const fixture of selected) {
	const image = await loadNativeImage(corpusPath(`images/${fixture.caseId}`))
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const [background, surface] = fixture.roles
	// The two anchors are the two largest field-lane families: the artwork's
	// dominant regions. Every other field-lane family is scored against them.
	const byPopulation = [...evidence.families]
		.filter(({ id }) => fieldLane.includes(id))
		.sort((first, second) => second.population - first.population)
	const [firstAnchor, secondAnchor] = byPopulation
	if (!firstAnchor || !secondAnchor) continue
	const firstIndex = evidence.families.findIndex(({ id }) => id === firstAnchor.id)
	const secondIndex = evidence.families.findIndex(({ id }) => id === secondAnchor.id)

	for (const [rank, family] of byPopulation.entries()) {
		const familyIndex = evidence.families.findIndex(({ id }) => id === family.id)
		const hexes = new Set(family.representatives.map(({ hex }) => hex))
		const role = [hexes.has(background) ? "BG" : "", hexes.has(surface) ? "SF" : ""].filter(Boolean).join("+") || "-"
		const { offset, position, length } = chordGeometry(family.prototype, firstAnchor.prototype, secondAnchor.prototype)
		const seam = familyIndex === firstIndex || familyIndex === secondIndex
			? { seamShare: 0, solidity: 1 }
			: seamStatistics(evidence, familyIndex, firstIndex, secondIndex, RADIUS)
		const largeThreshold = evidence.pixelCount * 0.002
		const large = family.components.filter(({ population }) => population >= largeThreshold)
		const largeMass = large.reduce((total, { population }) => total + population, 0) / Math.max(1, family.population)
		console.log([
			fixture.caseId.replace(/\.[a-z]+$/u, ""),
			family.id.replace("family-", "f"),
			hexOf(family),
			role,
			(family.populationFraction * 100).toFixed(2),
			rank,
			offset.toFixed(4),
			position.toFixed(3),
			length.toFixed(3),
			seam.seamShare.toFixed(3),
			seam.solidity.toFixed(3),
			large.length,
			largeMass.toFixed(3),
			family.spatialSpread.toFixed(3),
			family.familyConcentration.toFixed(3),
			family.edgeDensity.toFixed(4),
			family.fieldScore.toFixed(4),
		].join("\t"))
	}
}
