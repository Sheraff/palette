/**
 * Track F measurement: candidate texture/interleaving statistics for every
 * field-lane family of every review fixture, annotated with which family owns
 * the reviewed background and surface colours.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/texture.ts [caseId ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { ColorFamilyEvidence, NativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const RADIUS = Number(process.env.TRACK_F_RADIUS ?? 4)

/**
 * Mean over the family's own pixels of the share of a (2R+1)^2 window occupied
 * by the same family, and the share occupied by the single dominant other
 * family. A solid region scores near 1 on self-density; a fine texture sprayed
 * through a host field scores low on self-density and high on host share.
 */
function windowStatistics(evidence: NativePaletteEvidence, familyIndex: number, radius: number): Readonly<{
	selfDensity: number
	hostFamilyIndex: number
	hostShare: number
}> {
	const { width, height, familyAt, pixelCount, families } = evidence
	// Integral image over the family mask lets the window sum be O(1) per pixel.
	const stride = width + 1
	const integral = new Int32Array(stride * (height + 1))
	for (let y = 0; y < height; y++) {
		let rowSum = 0
		for (let x = 0; x < width; x++) {
			rowSum += familyAt[y * width + x] === familyIndex ? 1 : 0
			integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum
		}
	}
	const windowSum = (x0: number, y0: number, x1: number, y1: number): number =>
		integral[(y1 + 1) * stride + (x1 + 1)] - integral[y0 * stride + (x1 + 1)] -
		integral[(y1 + 1) * stride + x0] + integral[y0 * stride + x0]

	const otherCounts = new Float64Array(families.length)
	let selfSum = 0
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
		const own = windowSum(x0, y0, x1, y1)
		selfSum += own / area
		population += 1
		// Sampling the host tally on a coarse lattice keeps this affordable at full
		// resolution; it only picks which neighbour dominates, never a threshold.
		if (pixelIndex % 7 !== 0) continue
		for (let sy = y0; sy <= y1; sy += 2) {
			for (let sx = x0; sx <= x1; sx += 2) {
				const other = familyAt[sy * width + sx]
				if (other !== familyIndex) otherCounts[other] += 1
			}
		}
	}
	let hostFamilyIndex = -1
	let hostBest = 0
	let otherTotal = 0
	for (let index = 0; index < otherCounts.length; index++) {
		otherTotal += otherCounts[index]
		if (otherCounts[index] > hostBest) {
			hostBest = otherCounts[index]
			hostFamilyIndex = index
		}
	}
	return {
		selfDensity: population === 0 ? 0 : selfSum / population,
		hostFamilyIndex,
		hostShare: otherTotal === 0 ? 0 : hostBest / otherTotal,
	}
}

function hexOf(family: ColorFamilyEvidence): string {
	return rgbToHex(oklabToRGB(family.prototype))
}

const requested = process.argv.slice(2)
const selected = requested.length === 0
	? reviewFixtures
	: reviewFixtures.filter(({ caseId }) => requested.some((name) => caseId === name || caseId.startsWith(`${name}.`)))

console.log(`radius=${RADIUS}`)
console.log([
	"case", "family", "hex", "role", "pop%", "comps", "meanCompPx", "edgeDens", "conc", "selfDens", "hostShare", "host", "fieldScore",
].join("\t"))

for (const fixture of selected) {
	const image = await loadNativeImage(corpusPath(`images/${fixture.caseId}`))
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const [background, surface] = fixture.roles
	for (const familyId of fieldLane) {
		const familyIndex = evidence.families.findIndex(({ id }) => id === familyId)
		const family = evidence.families[familyIndex]
		const hexes = new Set(family.representatives.map(({ hex }) => hex))
		const role = [hexes.has(background) ? "BG" : "", hexes.has(surface) ? "SF" : ""].filter(Boolean).join("+") || "-"
		const { selfDensity, hostFamilyIndex, hostShare } = windowStatistics(evidence, familyIndex, RADIUS)
		const meanComponentPx = family.population / Math.max(1, family.componentCount)
		console.log([
			fixture.caseId.replace(/\.[a-z]+$/u, ""),
			family.id.replace("family-", "f"),
			hexOf(family),
			role,
			(family.populationFraction * 100).toFixed(2),
			family.componentCount,
			meanComponentPx.toFixed(1),
			family.edgeDensity.toFixed(4),
			family.familyConcentration.toFixed(3),
			selfDensity.toFixed(4),
			hostShare.toFixed(3),
			hostFamilyIndex >= 0 ? hexOf(evidence.families[hostFamilyIndex]) : "-",
			family.fieldScore.toFixed(4),
		].join("\t"))
	}
}
