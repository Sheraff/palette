/**
 * Track F diagnostic: dumps per-family segmentation evidence for one or more
 * artworks — population, component-size distribution, adjacency shares, and the
 * interleaving measurements this track proposes.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/diagnose.ts meteora loups
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { ColorFamilyEvidence, NativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"


function hexOf(family: ColorFamilyEvidence): string {
	return rgbToHex(oklabToRGB(family.prototype))
}

/**
 * Share of `family`'s total boundary that is shared with `otherId`. High share
 * means the family is (almost) entirely bordered by the other one.
 */
function boundaryShares(evidence: NativePaletteEvidence, familyId: string): Array<[string, number, number, number]> {
	let total = 0
	const per = new Map<string, { edges: number; contrast: number }>()
	for (const { firstFamilyId, secondFamilyId, boundaryEdges, meanContrast } of evidence.adjacencies) {
		if (firstFamilyId !== familyId && secondFamilyId !== familyId) continue
		const other = firstFamilyId === familyId ? secondFamilyId : firstFamilyId
		total += boundaryEdges
		const record = per.get(other) ?? { edges: 0, contrast: 0 }
		record.edges += boundaryEdges
		record.contrast = meanContrast
		per.set(other, record)
	}
	return [...per.entries()]
		.map(([other, { edges, contrast }]) => [other, edges / Math.max(1, total), edges, contrast] as [string, number, number, number])
		.sort((first, second) => second[1] - first[1])
}

/**
 * Fraction of `family`'s population living in components whose bounding box is
 * strictly inside the bounding box of the largest component of `hostId` — a
 * cheap proxy for "this family sits inside that field".
 */
function componentStats(family: ColorFamilyEvidence, pixelCount: number): string {
	const sorted = [...family.components].sort((first, second) => second.population - first.population)
	const sizes = sorted.map(({ population }) => population)
	const top = sizes.slice(0, 5)
	const tiny = sizes.filter((size) => size <= 8).length
	const median = sizes.length === 0 ? 0 : sizes[Math.floor(sizes.length / 2)]
	const observed = family.components.length
	return `comps(observed=${observed} of ${family.componentCount}) top=[${top.join(",")}] median=${median} tiny<=8=${tiny} largestFrac=${(family.largestComponentFraction * 100).toFixed(3)}% conc=${family.familyConcentration.toFixed(3)}`
}

for (const name of process.argv.slice(2)) {
	const file = corpusPath(`images/${name.includes(".") ? name : `${name}.jpg`}`)
	const image = await loadNativeImage(file)
	const evidence = buildNativePaletteEvidence(image)
	const fieldLane = new Set(evidence.lanes.find(({ name: lane }) => lane === "field")?.familyIds ?? [])
	const signatureLane = new Set(evidence.lanes.find(({ name: lane }) => lane === "signature")?.familyIds ?? [])
	const foregroundLane = new Set(evidence.lanes.find(({ name: lane }) => lane === "foreground")?.familyIds ?? [])
	console.log(`\n=== ${name} ${evidence.width}x${evidence.height} (${evidence.pixelCount} px, ${evidence.families.length} families) ===`)
	const ranked = [...evidence.families].sort((first, second) => second.population - first.population)
	for (const family of ranked.slice(0, 12)) {
		const lanes = [fieldLane.has(family.id) ? "F" : "", signatureLane.has(family.id) ? "S" : "", foregroundLane.has(family.id) ? "G" : ""].join("") || "-"
		console.log(`\n${family.id} ${hexOf(family)} [${lanes}]`)
		console.log(`  pop=${(family.populationFraction * 100).toFixed(2)}% bins=${family.perceptualBinCount} border=${family.borderCoverage.toFixed(3)} quad=${family.quadrantCoverage.toFixed(2)} corner=${family.cornerCoverage.toFixed(3)} spread=${family.spatialSpread.toFixed(3)}`)
		console.log(`  fieldScore=${family.fieldScore.toFixed(4)} sigScore=${family.signatureScore.toFixed(4)} fgScore=${family.foregroundScore.toFixed(4)} edgeDensity=${family.edgeDensity.toFixed(4)} localContrast=${family.localContrast.toFixed(4)} chroma=${family.chroma.toFixed(4)}`)
		console.log(`  ${componentStats(family, evidence.pixelCount)}`)
		const shares = boundaryShares(evidence, family.id).slice(0, 4)
		for (const [other, share, edges, contrast] of shares) {
			const otherFamily = evidence.families.find(({ id }) => id === other)
			console.log(`    -> ${(share * 100).toFixed(1)}% of boundary with ${other} ${otherFamily ? hexOf(otherFamily) : "?"} (edges=${edges}, meanContrast=${contrast.toFixed(4)}, anchorRadius=${evidence.familyAnchorRadius})`)
		}
	}
}
