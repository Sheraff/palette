/**
 * Track K round 2 measurement: is each artwork's published accent an optical
 * mixture of its own published colours, and what independent identity evidence
 * does the accent's family carry?
 *
 * The question this has to answer is not "is the accent near a chord" — plenty of
 * legitimate accents are — but "is the accent a *blend* with nothing of its own to
 * say". So every candidate discriminator is reported side by side.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/accent-blend-probe.ts [caseListFile]
 */
import { readFile } from "node:fs/promises"

import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { ColorFamilyEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { okDistance } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

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

/** Relative offset, or `null` when the chord is too short for the question to mean anything. */
function relative(geometry: ReturnType<typeof chord>): number | null {
	if (geometry.length < 0.05) return null
	if (geometry.position <= 0.03 || geometry.position >= 0.97) return null
	return geometry.offset / geometry.length
}

const listPath = process.argv[2]
const cases = listPath
	? (await readFile(listPath, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean)
	: reviewFixtures.map(({ caseId }) => `images/${caseId}`)

console.log([
	"case", "accent", "bg", "sf", "fg",
	"rel(bg,fg)", "pos(bg,fg)", "rel(bg,sf)", "rel(sf,fg)",
	"pop%", "conc", "markSup", "markComps", "sigObs", "sigScore", "collapsedA",
].join("\t"))

for (const entry of cases) {
	let details
	let evidence
	try {
		const image = await loadNativeImage(corpusPath(entry))
		details = extractPaletteDetails(image)
		evidence = buildNativePaletteEvidence(image)
	} catch (cause) {
		console.log(`${entry}\tERROR ${cause instanceof Error ? cause.message : String(cause)}`)
		continue
	}
	const { winner } = details
	const accentLab = winner.accent.oklab
	const background = winner.background.oklab
	const surface = winner.surface.oklab
	const foreground = winner.foreground.oklab

	// The family that actually published the accent, matched by exact colour.
	const owner: ColorFamilyEvidence | undefined = evidence.families.find((family) =>
		family.representatives.some(({ hex }) => hex === winner.accent.hex))

	const backgroundForeground = chord(accentLab, background, foreground)
	const format = (value: number | null): string => value === null ? "-" : value.toFixed(4)
	console.log([
		entry.replace(/^images\//u, "").replace(/\.[a-z]+$/u, "").slice(0, 26),
		winner.accent.hex,
		winner.background.hex,
		winner.surface.hex,
		winner.foreground.hex,
		format(relative(backgroundForeground)),
		backgroundForeground.length < 0.05 ? "-" : backgroundForeground.position.toFixed(3),
		format(relative(chord(accentLab, background, surface))),
		format(relative(chord(accentLab, surface, foreground))),
		owner ? (owner.populationFraction * 100).toFixed(3) : "-",
		owner ? owner.familyConcentration.toFixed(3) : "-",
		owner ? owner.markSupport.toFixed(4) : "-",
		owner ? String(owner.markComponentCount) : "-",
		owner ? owner.signatureAccentObservation.toFixed(4) : "-",
		owner ? owner.signatureScore.toFixed(4) : "-",
		String(winner.collapse.accent),
	].join("\t"))
}
