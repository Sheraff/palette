/**
 * Track K round 2: does the field pass's existing optical-mixture finding already
 * identify the accent we need to withdraw, without identifying the ones we must
 * protect?
 *
 * `fieldBlend` (Track F) already applies four conditions — interior chord
 * position, small relative offset, a gapless continuum of chord slices, and
 * corridor closure — and publishes the result as `absorbedFieldFamilyIds`. This
 * probe asks, per artwork, whether the family that published the accent is one of
 * them.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/absorbed-accent-probe.ts [caseListFile]
 */
import { readFile } from "node:fs/promises"

import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const listPath = process.argv[2]
const cases = listPath
	? (await readFile(listPath, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean)
	: reviewFixtures.map(({ caseId }) => `images/${caseId}`)

let absorbing = 0
let accentAbsorbed = 0
for (const entry of cases) {
	try {
		const image = await loadNativeImage(corpusPath(entry))
		const evidence = buildNativePaletteEvidence(image)
		const absorbed = new Set(evidence.absorbedFieldFamilyIds)
		const label = entry.replace(/^images\//u, "").replace(/\.[a-z]+$/u, "").slice(0, 26)
		if (absorbed.size === 0) {
			console.log(`${label}\tno-absorption`)
			continue
		}
		absorbing += 1
		const { winner } = extractPaletteDetails(image)
		// Which roles are published by a family the field pass called a mixture?
		const roleOwners = (["background", "surface", "foreground", "accent"] as const).map((role) => {
			const hex = winner[role].hex
			const owner = evidence.families.find((family) => family.representatives.some((r) => r.hex === hex))
			return { role, hex, absorbed: owner !== undefined && absorbed.has(owner.id) }
		})
		const hit = roleOwners.find(({ role, absorbed: isAbsorbed }) => role === "accent" && isAbsorbed)
		if (hit) accentAbsorbed += 1
		console.log(`${label}\tabsorbed=${absorbed.size}\troles=${roleOwners.map(({ role, hex, absorbed: a }) => `${role}:${hex}${a ? "[MIXTURE]" : ""}`).join(" ")}`)
	} catch (cause) {
		console.log(`${entry}\tERROR ${cause instanceof Error ? cause.message : String(cause)}`)
	}
}
console.log(`\n${absorbing} of ${cases.length} artworks absorb any field mixture; ${accentAbsorbed} publish an accent from one.`)
