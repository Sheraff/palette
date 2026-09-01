/**
 * Track K round 2: how much of the artwork do its two published colours already
 * account for, and is the accent an interior mixture of them?
 *
 * The human's objection on the target was "there are really only two colors in
 * that artwork". That is a coverage claim, and it is measurable: if the families
 * publishing background and foreground own nearly every pixel, an accent sitting
 * on the chord between them has no third material left to represent.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/two-colour-probe.ts <caseListFile>
 */
import { readFile } from "node:fs/promises"

import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { ColorFamilyEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { okDistance } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"

function chord(point: OKLab, start: OKLab, end: OKLab): Readonly<{ offset: number; position: number; length: number }> {
	const axis: OKLab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
	const lengthSquared = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
	const length = Math.sqrt(lengthSquared)
	if (lengthSquared === 0) return { offset: okDistance(point, start), position: 0, length: 0 }
	const delta: OKLab = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
	const position = (delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2]) / lengthSquared
	return {
		offset: okDistance(point, [start[0] + axis[0] * position, start[1] + axis[1] * position, start[2] + axis[2] * position]),
		position,
		length,
	}
}

console.log(["case", "bg", "fg", "accent", "bgPop%", "fgPop%", "pairPop%", "accentPop%", "accentRelOff", "accentPos", "collapsedA"].join("\t"))

for (const entry of (await readFile(process.argv[2], "utf8")).split("\n").map((l) => l.trim()).filter(Boolean)) {
	try {
		const image = await loadNativeImage(corpusPath(entry))
		const evidence = buildNativePaletteEvidence(image)
		const { winner } = extractPaletteDetails(image)
		const owner = (hex: string): ColorFamilyEvidence | undefined =>
			evidence.families.find((family) => family.representatives.some((r) => r.hex === hex))
		const backgroundFamily = owner(winner.background.hex)
		const foregroundFamily = owner(winner.foreground.hex)
		const accentFamily = owner(winner.accent.hex)
		const backgroundShare = backgroundFamily?.populationFraction ?? 0
		const foregroundShare = foregroundFamily?.populationFraction ?? 0
		// Distinct families only: a collapsed palette can publish two roles from one.
		const pair = backgroundFamily && foregroundFamily && backgroundFamily.id === foregroundFamily.id
			? backgroundShare
			: backgroundShare + foregroundShare
		const geometry = chord(winner.accent.oklab, winner.background.oklab, winner.foreground.oklab)
		const relativeOffset = geometry.length < 0.05 ? null : geometry.offset / geometry.length
		console.log([
			entry.replace(/^images\//u, "").replace(/\.[a-z]+$/u, "").slice(0, 26),
			winner.background.hex,
			winner.foreground.hex,
			winner.accent.hex,
			(backgroundShare * 100).toFixed(2),
			(foregroundShare * 100).toFixed(2),
			(pair * 100).toFixed(2),
			accentFamily ? (accentFamily.populationFraction * 100).toFixed(3) : "-",
			relativeOffset === null ? "-" : relativeOffset.toFixed(4),
			geometry.length < 0.05 ? "-" : geometry.position.toFixed(3),
			String(winner.collapse.accent),
		].join("\t"))
	} catch (cause) {
		console.log(`${entry}\tERROR ${cause instanceof Error ? cause.message : String(cause)}`)
	}
}
