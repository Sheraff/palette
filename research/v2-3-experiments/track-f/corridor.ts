/**
 * Track F: "blend corridor closure" measurement.
 *
 * A family that quantization split out of a smooth optical blend between two
 * dominant fields should (i) sit on the OKLab chord between them and (ii) only
 * ever border other members of that same chord — it never touches anything the
 * blend does not explain. This script reports both, per field-lane family.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/corridor.ts [caseId ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, okDistance, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"


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

const RELATIVE_OFFSET = Number(process.env.TRACK_F_OFFSET ?? 0.012)
const MINIMUM_SEPARATION = Number(process.env.TRACK_F_SEPARATION ?? 0.30)
const INTERIOR_MARGIN = Number(process.env.TRACK_F_MARGIN ?? 0.03)

const requested = process.argv.slice(2)
const selected = requested.length === 0
	? reviewFixtures
	: reviewFixtures.filter(({ caseId }) => requested.some((name) => caseId === name || caseId.startsWith(`${name}.`)))

console.log(["case", "family", "hex", "role", "pop%", "relOff", "pos", "len", "corridorClosure", "fieldScore"].join("\t"))

for (const fixture of selected) {
	const image = await loadNativeImage(corpusPath(`images/${fixture.caseId}`))
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const laneFamilies = evidence.families.filter(({ id }) => fieldLane.includes(id))
	const byPopulation = [...laneFamilies].sort((first, second) => second.population - first.population)
	const [firstAnchor, secondAnchor] = byPopulation
	if (!firstAnchor || !secondAnchor) continue
	const chordLength = okDistance(firstAnchor.prototype, secondAnchor.prototype)

	// Every family (not only lane members) is tested for chord membership, because
	// the corridor a blend touches is made of whatever the quantizer produced.
	const onChord = new Set<string>([firstAnchor.id, secondAnchor.id])
	for (const family of evidence.families) {
		const { offset, position } = chordGeometry(family.prototype, firstAnchor.prototype, secondAnchor.prototype)
		if (chordLength >= MINIMUM_SEPARATION &&
			position > INTERIOR_MARGIN && position < 1 - INTERIOR_MARGIN &&
			offset / chordLength <= RELATIVE_OFFSET) onChord.add(family.id)
	}

	const boundaryTotal = new Map<string, number>()
	const boundaryInside = new Map<string, number>()
	for (const { firstFamilyId, secondFamilyId, boundaryEdges } of evidence.adjacencies) {
		for (const [self, other] of [[firstFamilyId, secondFamilyId], [secondFamilyId, firstFamilyId]] as const) {
			boundaryTotal.set(self, (boundaryTotal.get(self) ?? 0) + boundaryEdges)
			if (onChord.has(other)) boundaryInside.set(self, (boundaryInside.get(self) ?? 0) + boundaryEdges)
		}
	}

	const [background, surface] = fixture.roles
	for (const family of byPopulation) {
		const { offset, position } = chordGeometry(family.prototype, firstAnchor.prototype, secondAnchor.prototype)
		const isAnchor = family.id === firstAnchor.id || family.id === secondAnchor.id
		const member = onChord.has(family.id) && !isAnchor
		if (!member) continue
		const hexes = new Set(family.representatives.map(({ hex }) => hex))
		const role = [hexes.has(background) ? "BG" : "", hexes.has(surface) ? "SF" : ""].filter(Boolean).join("+") || "-"
		const closure = (boundaryInside.get(family.id) ?? 0) / Math.max(1, boundaryTotal.get(family.id) ?? 0)
		console.log([
			fixture.caseId.replace(/\.[a-z]+$/u, ""),
			family.id.replace("family-", "f"),
			rgbToHex(oklabToRGB(family.prototype)),
			role,
			(family.populationFraction * 100).toFixed(2),
			(offset / chordLength).toFixed(4),
			position.toFixed(3),
			chordLength.toFixed(3),
			closure.toFixed(3),
			family.fieldScore.toFixed(4),
		].join("\t"))
	}
}
