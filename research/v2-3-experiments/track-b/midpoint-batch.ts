// Track B: one row per earned midpoint — endpoints, midpoint, chord, deviation, rendered
// difference, distance to the nearest endpoint, and the band evidence behind it.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/midpoint-batch.ts <caseId...>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { apcaContrast, mixOKLab, okDistance, oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

const IMAGE_ROOTS = [resolve(import.meta.dirname, "../../../images"), "/Users/Flo/GitHub/palette/images"]
const REPO_ROOTS = [resolve(import.meta.dirname, "../../.."), "/Users/Flo/GitHub/palette"]

function locate(caseId: string): string {
	for (const root of caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

function threeStop(background: OKLab, middle: OKLab, surface: OKLab, t: number): OKLab {
	return t <= 0.5 ? mixOKLab(background, middle, t / 0.5) : mixOKLab(middle, surface, (t - 0.5) / 0.5)
}

function maximumRenderedDifference(background: OKLab, middle: OKLab, surface: OKLab): number {
	let maximum = 0
	for (let step = 0; step <= 200; step++) {
		const t = step / 200
		maximum = Math.max(maximum, okDistance(
			threeStop(background, middle, surface, t), mixOKLab(background, surface, t)))
	}
	return maximum
}

console.log([
	"case", "background", "midpoint", "surface", "chordWouldBe", "deviation",
	"renderedDiff", "distToNearestEndpoint", "bandPop%", "occupancy%", "accentLcRange2stop", "accentLcRange3stop",
].join("\t"))

for (const caseId of process.argv.slice(2)) {
	const details = extractPaletteDetails(await loadNativeImage(locate(caseId)))
	const winner = details.winner
	if (details.midpoint.kind !== "source-supported-three-stop") {
		console.log(`${caseId}\t(no midpoint)`)
		continue
	}
	const middle = details.midpoint.color.oklab
	const chord = mixOKLab(winner.background.oklab, winner.surface.oklab, 0.5)
	const deviation = okDistance(middle, chord)
	const endpointDistance = Math.min(
		okDistance(middle, winner.background.oklab), okDistance(middle, winner.surface.oklab))
	const provenance = details.midpoint.provenance
	const band = provenance.origin === "field-midpoint-band"
		? `${(provenance.bandPopulationFraction * 100).toFixed(1)}\t${(provenance.occupancyShare * 100).toFixed(1)}`
		: "transition\ttransition"
	const positions = [0, 0.25, 0.5, 0.75, 1]
	const two = positions.map((t) => apcaContrast(winner.accent.rgb, oklabToRGB(mixOKLab(winner.background.oklab, winner.surface.oklab, t))))
	const three = positions.map((t) => apcaContrast(winner.accent.rgb, oklabToRGB(threeStop(winner.background.oklab, middle, winner.surface.oklab, t))))
	const range = (values: number[]): string =>
		`${Math.min(...values).toFixed(1)}..${Math.max(...values).toFixed(1)}${values.some((v) => v > 0) && values.some((v) => v < 0) ? " FLIP" : ""}`
	console.log([
		caseId, winner.background.hex, details.midpoint.color.hex, winner.surface.hex,
		rgbToHex(oklabToRGB(chord)), deviation.toFixed(4),
		maximumRenderedDifference(winner.background.oklab, middle, winner.surface.oklab).toFixed(4),
		endpointDistance.toFixed(4), band, range(two), range(three),
	].join("\t"))
}
