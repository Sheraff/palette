/**
 * Track F: the mixture ladder. Prints, per artwork, the chord-ordered set of
 * families whose colour is a linear mixture of the two dominant fields, with the
 * gaps between consecutive rungs. A continuum the quantizer over-segmented shows
 * up as a densely sampled ladder spanning the whole chord; two materials that
 * merely happen to be colinear show up as isolated rungs.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/ladder.ts [caseId ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, okDistance, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const RELATIVE_OFFSET = Number(process.env.TRACK_F_OFFSET ?? 0.012)
const MINIMUM_SEPARATION = Number(process.env.TRACK_F_SEPARATION ?? 0.30)
const INTERIOR_MARGIN = Number(process.env.TRACK_F_MARGIN ?? 0.03)

function chordProjection(point: OKLab, start: OKLab, end: OKLab): Readonly<{ offset: number; position: number }> {
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

const requested = process.argv.slice(2)
const selected = requested.length === 0
	? reviewFixtures
	: reviewFixtures.filter(({ caseId }) => requested.some((name) => caseId === name || caseId.startsWith(`${name}.`)))

for (const fixture of selected) {
	const image = await loadNativeImage(corpusPath(`images/${fixture.caseId}`))
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const lane = evidence.families.filter(({ id }) => fieldLane.includes(id))
	const anchors = [...lane].sort((first, second) => second.population - first.population).slice(0, 2)
	if (anchors.length < 2) continue
	const [first, second] = anchors
	const chordLength = okDistance(first.prototype, second.prototype)
	const name = fixture.caseId.replace(/\.[a-z]+$/u, "")
	if (chordLength < MINIMUM_SEPARATION) {
		console.log(`${name}: chord ${chordLength.toFixed(3)} < ${MINIMUM_SEPARATION} — not evaluated`)
		continue
	}
	const rungs = evidence.families
		.filter(({ id }) => id !== first.id && id !== second.id)
		.map((family) => ({ family, ...chordProjection(family.prototype, first.prototype, second.prototype) }))
		.filter(({ offset, position }) =>
			position > INTERIOR_MARGIN && position < 1 - INTERIOR_MARGIN && offset / chordLength <= RELATIVE_OFFSET)
		.sort((left, right) => left.position - right.position)
	const positions = [0, ...rungs.map(({ position }) => position), 1]
	let maximumGap = 0
	for (let index = 1; index < positions.length; index++) {
		maximumGap = Math.max(maximumGap, positions[index] - positions[index - 1])
	}
	const mass = rungs.reduce((total, { family }) => total + family.populationFraction, 0)
	console.log(`\n${name}: anchors ${rgbToHex(oklabToRGB(first.prototype))} (${(first.populationFraction * 100).toFixed(1)}%) <-> ${rgbToHex(oklabToRGB(second.prototype))} (${(second.populationFraction * 100).toFixed(1)}%) chord=${chordLength.toFixed(3)}`)
	console.log(`  rungs=${rungs.length} maximumGap=${maximumGap.toFixed(3)} mixtureMass=${(mass * 100).toFixed(2)}%  gradient=${fixture.gradient}`)
	for (const { family, position, offset } of rungs) {
		console.log(`    pos=${position.toFixed(3)} relOff=${(offset / chordLength).toFixed(4)} ${rgbToHex(oklabToRGB(family.prototype))} pop=${(family.populationFraction * 100).toFixed(2)}%`)
	}
}
