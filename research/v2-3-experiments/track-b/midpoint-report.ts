// Track B: what the midpoint mechanism measured, and what it does to accent contrast
// across the rendered gradient.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/midpoint-report.ts <caseId...>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { apcaContrast, mixOKLab, okDistance, oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/github/palette/images",
].filter((value): value is string => typeof value === "string")

const REPO_ROOTS = [
	resolve(import.meta.dirname, "../../.."),
	"/Users/Flo/GitHub/palette",
]

function locate(caseId: string): string {
	const roots = caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS
	for (const root of roots) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

// The rendered field at position t, with and without the earned third stop.
function twoStop(background: OKLab, surface: OKLab, t: number): OKLab {
	return mixOKLab(background, surface, t)
}

function threeStop(background: OKLab, middle: OKLab, surface: OKLab, t: number): OKLab {
	return t <= 0.5
		? mixOKLab(background, middle, t / 0.5)
		: mixOKLab(middle, surface, (t - 0.5) / 0.5)
}

for (const caseId of process.argv.slice(2)) {
	const image = await loadNativeImage(locate(caseId))
	const details = extractPaletteDetails(image)
	const winner = details.winner
	const binStep = buildPaletteSeedDomain(image).evidence.familyBinStep
	console.log(`\n# ${caseId}`)
	console.log(`  background=${winner.background.hex} surface=${winner.surface.hex} accent=${winner.accent.hex} gradient=${winner.gradient}`)
	const candidate = winner.gradientEvidence?.fieldMidpoint ?? null
	if (candidate) {
		const chord = mixOKLab(winner.background.oklab, winner.surface.oklab, 0.5)
		console.log(`  measured midpoint colour ${candidate.hex} at (${candidate.provenance.x},${candidate.provenance.y}) family=${candidate.provenance.familyId}`)
		console.log(`    chord colour would be   ${rgbToHex(oklabToRGB(chord))}`)
		console.log(`    chord deviation ${okDistance(candidate.oklab, chord).toFixed(4)} vs threshold ${binStep.toFixed(4)}  -> ${okDistance(candidate.oklab, chord) >= binStep ? "EARNED" : "not earned"}`)
		console.log(`    band population ${(candidate.bandPopulationFraction * 100).toFixed(1)}% of domain, occupancy ${(candidate.occupancyShare * 100).toFixed(1)}%, spreadRatio ${candidate.spatialSpreadRatio.toFixed(3)}`)
	} else {
		console.log(`  no midpoint candidate measured for this winner`)
	}
	console.log(`  rendered midpoint: ${details.midpoint.kind} ${details.midpoint.color?.hex ?? "-"}`)

	const middle = details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.oklab : null
	console.log(`  accent APCA across the field (accent ${winner.accent.hex}):`)
	for (const t of [0, 0.25, 0.5, 0.75, 1]) {
		const two = twoStop(winner.background.oklab, winner.surface.oklab, t)
		const twoContrast = apcaContrast(winner.accent.rgb, oklabToRGB(two))
		if (middle === null) {
			console.log(`    t=${t.toFixed(2)}  two-stop ${rgbToHex(oklabToRGB(two))} Lc=${twoContrast.toFixed(2)}`)
			continue
		}
		const three = threeStop(winner.background.oklab, middle, winner.surface.oklab, t)
		const threeContrast = apcaContrast(winner.accent.rgb, oklabToRGB(three))
		console.log(`    t=${t.toFixed(2)}  two-stop ${rgbToHex(oklabToRGB(two))} Lc=${twoContrast.toFixed(2)}   three-stop ${rgbToHex(oklabToRGB(three))} Lc=${threeContrast.toFixed(2)}`)
	}
}
