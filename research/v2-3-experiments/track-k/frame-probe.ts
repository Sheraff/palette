/**
 * Track K measurement: frame / matte geometry plus the interior-field statistics
 * that might distinguish "the frame is the right background" from "the frame
 * displaced an obvious interior field".
 *
 * Detection reuses Track I's ring rule (research/v2-3-experiments/track-i) so the
 * two audits are comparable.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/frame-probe.ts <case> [case ...]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { okDistance, oklabToRGB, rgbToHex, rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab, RawImage } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"

const RING_UNIFORMITY = 0.03
const RING_COHESION = 0.03
const MINIMUM_THICKNESS_FRACTION = 0.008
const MAXIMUM_THICKNESS_FRACTION = 0.22
const FRAME_DISTINCT = 0.058

function labAt(image: RawImage, x: number, y: number): OKLab {
	const index = (y * image.width + x) * 3
	return rgbToOKLab([image.data[index], image.data[index + 1], image.data[index + 2]])
}

/** The one-pixel rectangle outline inset by `inset`. */
function ring(image: RawImage, inset: number): OKLab[] {
	const pixels: OKLab[] = []
	const right = image.width - 1 - inset
	const bottom = image.height - 1 - inset
	if (inset > right || inset > bottom) return pixels
	for (let x = inset; x <= right; x++) {
		pixels.push(labAt(image, x, inset))
		if (bottom !== inset) pixels.push(labAt(image, x, bottom))
	}
	for (let y = inset + 1; y < bottom; y++) {
		pixels.push(labAt(image, inset, y))
		if (right !== inset) pixels.push(labAt(image, right, y))
	}
	return pixels
}

function meanOf(values: readonly OKLab[]): OKLab {
	if (values.length === 0) return [0, 0, 0]
	let l = 0
	let a = 0
	let b = 0
	for (const value of values) {
		l += value[0]
		a += value[1]
		b += value[2]
	}
	return [l / values.length, a / values.length, b / values.length]
}

function rmsDeviation(values: readonly OKLab[], centre: OKLab): number {
	if (values.length === 0) return 0
	let total = 0
	for (const value of values) total += okDistance(value, centre) ** 2
	return Math.sqrt(total / values.length)
}

for (const entry of process.argv.slice(2)) {
	const image = await loadNativeImage(corpusPath(entry))
	const shortSide = Math.min(image.width, image.height)
	const outer = ring(image, 0)
	const frameColor = meanOf(outer)

	let thickness = 0
	const limit = Math.floor(shortSide * MAXIMUM_THICKNESS_FRACTION)
	for (let inset = 0; inset < limit; inset++) {
		const pixels = ring(image, inset)
		if (pixels.length === 0) break
		const centre = meanOf(pixels)
		if (rmsDeviation(pixels, centre) > RING_UNIFORMITY) break
		if (okDistance(centre, frameColor) > RING_COHESION) break
		thickness = inset + 1
	}

	// Interior statistics past the run.
	const interior: OKLab[] = []
	let interiorSum = 0
	let interiorCount = 0
	for (let y = thickness; y < image.height - thickness; y++) {
		for (let x = thickness; x < image.width - thickness; x++) {
			interior.push(labAt(image, x, y))
			interiorCount += 1
		}
	}
	const interiorMean = meanOf(interior)
	const interiorDeviation = rmsDeviation(interior, interiorMean)
	interiorSum = interiorCount

	const thicknessFraction = thickness / shortSide
	const detected = thickness > 0 &&
		thicknessFraction >= MINIMUM_THICKNESS_FRACTION &&
		thicknessFraction < MAXIMUM_THICKNESS_FRACTION &&
		okDistance(interiorMean, frameColor) >= FRAME_DISTINCT

	// Where does the frame colour's own family live? And what does the interior
	// look like to the algorithm's own field evidence?
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const lane = evidence.families.filter(({ id }) => fieldLane.includes(id))
	const nearestTo = (target: OKLab) => lane
		.map((family) => ({ family, distance: okDistance(family.prototype, target) }))
		.sort((left, right) => left.distance - right.distance)[0]
	const frameFamily = nearestTo(frameColor)

	// Share of the frame family's pixels that lie inside the frame band.
	let frameBandOwn = 0
	let bandPixels = 0
	if (frameFamily && thickness > 0) {
		const frameIndex = evidence.families.findIndex(({ id }) => id === frameFamily.family.id)
		for (let y = 0; y < image.height; y++) {
			for (let x = 0; x < image.width; x++) {
				const inBand = x < thickness || y < thickness || x >= image.width - thickness || y >= image.height - thickness
				if (!inBand) continue
				bandPixels += 1
				if (evidence.familyAt[y * image.width + x] === frameIndex) frameBandOwn += 1
			}
		}
	}

	// The strongest field family that is NOT the frame family, measured over the
	// interior only: does an obvious interior field exist that the frame displaced?
	const interiorRanked = lane
		.filter(({ id }) => id !== frameFamily?.family.id)
		.sort((left, right) => right.fieldScore - left.fieldScore)
	const challenger = interiorRanked[0]
	let challengerInteriorShare = 0
	if (challenger && interiorCount > 0) {
		const challengerIndex = evidence.families.findIndex(({ id }) => id === challenger.id)
		let own = 0
		for (let y = thickness; y < image.height - thickness; y++) {
			for (let x = thickness; x < image.width - thickness; x++) {
				if (evidence.familyAt[y * image.width + x] === challengerIndex) own += 1
			}
		}
		challengerInteriorShare = own / interiorCount
	}

	console.log(`\n=== ${entry} ${image.width}x${image.height} ===`)
	console.log(`  frame: detected=${detected} thickness=${thickness}px (${(thicknessFraction * 100).toFixed(2)}% of short side) colour=${rgbToHex(oklabToRGB(frameColor))}`)
	console.log(`  interior: mean=${rgbToHex(oklabToRGB(interiorMean))} rmsDeviation=${interiorDeviation.toFixed(4)} distanceFromFrame=${okDistance(interiorMean, frameColor).toFixed(4)}`)
	if (frameFamily) {
		const family = frameFamily.family
		console.log(`  frame family: ${family.id} ${rgbToHex(oklabToRGB(family.prototype))} pop=${(family.populationFraction * 100).toFixed(2)}% fieldScore=${family.fieldScore.toFixed(4)} conc=${family.familyConcentration.toFixed(3)}`)
		console.log(`    band occupancy: ${(frameBandOwn / Math.max(1, bandPixels) * 100).toFixed(1)}% of the frame band; the band is ${(bandPixels / (image.width * image.height) * 100).toFixed(2)}% of the image`)
		console.log(`    of the family's own pixels, ${(frameBandOwn / Math.max(1, family.population) * 100).toFixed(1)}% lie in the band`)
	}
	if (challenger) {
		console.log(`  best non-frame field: ${challenger.id} ${rgbToHex(oklabToRGB(challenger.prototype))} pop=${(challenger.populationFraction * 100).toFixed(2)}% fieldScore=${challenger.fieldScore.toFixed(4)} conc=${challenger.familyConcentration.toFixed(3)}`)
		console.log(`    occupies ${(challengerInteriorShare * 100).toFixed(1)}% of the interior`)
	}
}
