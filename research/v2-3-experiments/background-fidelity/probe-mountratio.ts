/**
 * The enclosed-population ratio distribution, for deriving `minimumEnclosedPopulationRatio`
 * against the verdict record rather than trusting the policy comment's remembered numbers.
 *
 * For every family that owns the border (`borderCoverage >= mount.minimumBorderCoverage`), the
 * mount test asks whether the largest *enclosed* family is `ratio` times larger. This reports
 * that ratio for each such family, so the accepted-frame and flip-wanted populations can be read
 * off the corpus instead of quoted.
 *
 * Evidence only — one `buildNativePaletteEvidence` pass, no extraction, and it is config-blind:
 * the numbers it reports do not depend on `BACKGROUND_FIDELITY`.
 *
 *   node --experimental-strip-types probe-mountratio.ts <image-path>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export async function probe(imagePath: string): Promise<Record<string, unknown>> {
	const policy = ALBUM_ARTWORK_PALETTE_V2_POLICY.mount
	const image = await loadNativeImage(imagePath)
	const families = buildNativePaletteEvidence(image).families
	const enclosed = families.filter(({ borderCoverage }) => borderCoverage <= policy.maximumEnclosedBorderCoverage)
	const largestEnclosed = enclosed.length === 0 ? null : enclosed.reduce((best, family) =>
		family.populationFraction > best.populationFraction ||
		(family.populationFraction === best.populationFraction && compareAscii(family.id, best.id) < 0)
			? family
			: best)
	const borderOwners = families
		.filter((family) => family.borderCoverage >= policy.minimumBorderCoverage)
		.filter((family) => family.id !== largestEnclosed?.id)
		.map((family) => ({
			id: family.id,
			chroma: family.chroma,
			populationFraction: family.populationFraction,
			borderCoverage: family.borderCoverage,
			cornerCoverage: family.cornerCoverage,
			centerCoverage: family.centerCoverage,
			ratio: largestEnclosed === null || family.populationFraction === 0
				? null
				: largestEnclosed.populationFraction / family.populationFraction,
		}))
		.sort((first, second) => (second.ratio ?? -1) - (first.ratio ?? -1) || compareAscii(first.id, second.id))
	return {
		image: imagePath,
		familyCount: families.length,
		largestEnclosedPopulationFraction: largestEnclosed?.populationFraction ?? null,
		borderOwnerCount: borderOwners.length,
		/** The ratio that decides mount recognition on this artwork (the best any owner achieves). */
		bestRatio: borderOwners[0]?.ratio ?? null,
		borderOwners,
	}
}

if (process.argv[1]?.endsWith("probe-mountratio.ts")) {
	for (const path of process.argv.slice(2)) {
		try {
			console.log(JSON.stringify(await probe(path)))
		} catch (error) {
			console.log(JSON.stringify({ image: path, error: String(error) }))
		}
	}
}
