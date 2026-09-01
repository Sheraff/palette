/**
 * Track K round 2: the mixture ladder between an artwork's two *published*
 * colours (background and foreground), for arbitrary cases.
 *
 * Track F's `ladder.ts` anchors on the two dominant field-lane families and only
 * accepts review fixtures. The accent question needs the same geometry read
 * against the published role pair, on off-panel cases too.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/pair-ladder.ts <caseListFile>
 */
import { readFile } from "node:fs/promises"

import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { okDistance, oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"

const RELATIVE_OFFSET = Number(process.env.TRACK_K_OFFSET ?? 0.015)
const INTERIOR_MARGIN = 0.03

function chord(point: OKLab, start: OKLab, end: OKLab): Readonly<{ offset: number; position: number }> {
	const axis: OKLab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
	const lengthSquared = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
	if (lengthSquared === 0) return { offset: okDistance(point, start), position: 0 }
	const delta: OKLab = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
	const position = (delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2]) / lengthSquared
	return {
		offset: okDistance(point, [start[0] + axis[0] * position, start[1] + axis[1] * position, start[2] + axis[2] * position]),
		position,
	}
}

for (const entry of (await readFile(process.argv[2], "utf8")).split("\n").map((l) => l.trim()).filter(Boolean)) {
	const image = await loadNativeImage(corpusPath(entry))
	const evidence = buildNativePaletteEvidence(image)
	const { winner } = extractPaletteDetails(image)
	const start = winner.background.oklab
	const end = winner.foreground.oklab
	const chordLength = okDistance(start, end)
	const rungs = evidence.families
		.map((family) => ({ family, ...chord(family.prototype, start, end) }))
		.filter(({ offset, position }) =>
			position > INTERIOR_MARGIN && position < 1 - INTERIOR_MARGIN && offset / chordLength <= RELATIVE_OFFSET)
		.sort((a, b) => a.position - b.position)
	const positions = [0, ...rungs.map(({ position }) => position), 1]
	let maximumGap = 0
	for (let i = 1; i < positions.length; i++) maximumGap = Math.max(maximumGap, positions[i] - positions[i - 1])
	const mass = rungs.reduce((t, { family }) => t + family.populationFraction, 0)
	const label = entry.replace(/^images\//u, "").replace(/\.[a-z]+$/u, "").slice(0, 26)
	console.log(`\n${label}: ${winner.background.hex} <-> ${winner.foreground.hex} chord=${chordLength.toFixed(3)} accent=${winner.accent.hex}`)
	console.log(`  rungs=${rungs.length} maximumGap=${maximumGap.toFixed(3)} mixtureMass=${(mass * 100).toFixed(2)}%`)
	for (const { family, position, offset } of rungs) {
		const isAccent = family.representatives.some(({ hex }) => hex === winner.accent.hex)
		console.log(`    pos=${position.toFixed(3)} relOff=${(offset / chordLength).toFixed(4)} ${rgbToHex(oklabToRGB(family.prototype))} pop=${(family.populationFraction * 100).toFixed(3)}%${isAccent ? "   <-- ACCENT" : ""}`)
	}
}
