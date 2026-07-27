import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { buildChromaticCandidateAvailability } from "../src/chromatic-candidate-availability.ts"
import { traceChromaticCandidateGeneration } from "../src/chromatic-candidate-generation-trace.ts"
import { addDeterministicNoise, cropOnePixel, loadImage } from "../src/image.ts"
import { extractRegionGraph017PaletteWithContext } from "../src/region-graph-0.17-extract.ts"
import { buildTypographyChromaticCandidateAvailability } from "../src/typography-chromatic-candidate-availability.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const salmonSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("typography availability exposes one source-observed salmon family without changing the baseline", async () => {
	const image = await loadImage(salmonSource)
	const context = extractRegionGraph017PaletteWithContext(image)
	const candidatesBefore = structuredClone(context.candidates)
	const availabilityBefore = buildChromaticCandidateAvailability(context.analysis, context.candidates)
	const result = buildTypographyChromaticCandidateAvailability(context.analysis, context.candidates)

	assert.deepEqual(context.candidates, candidatesBefore)
	assert.deepEqual(result.baselineAvailability, availabilityBefore)
	assert.equal(result.addedSupplements.length, 1)
	assert.equal(result.addedSupplements[0].anchorDegrees, 0)
	assert.ok(result.addedSupplements[0].candidate.text >= 0.7)
	assert.ok(result.addedSupplements[0].candidate.chroma >= 0.035)
	assert.equal(result.invariants.addedCandidatesNotPassedToRoleSolver, true)
})

test("typography salmon family survives crop and deterministic noise", async () => {
	const image = await loadImage(salmonSource)
	const variants = [image, cropOnePixel(image), addDeterministicNoise(image)]
	const availability = variants.map((variant) => {
		const context = extractRegionGraph017PaletteWithContext(variant)
		const result = buildTypographyChromaticCandidateAvailability(context.analysis, context.candidates)
		const anchor = traceChromaticCandidateGeneration(context.analysis, context.candidates)
			.hueAnchors.find((candidate) => candidate.anchorDegrees === 0)!
		const representedByChromaticCandidate = [
			...(anchor.representability?.distanceMatches ?? []),
			...(anchor.representability?.hueLightnessMatches ?? []),
		].some((candidate) => candidate.chroma >= 0.03)
		return result.addedSupplements.some((supplement) => supplement.anchorDegrees === 0) ||
			representedByChromaticCandidate
	})
	assert.deepEqual(availability, [true, true, true])
})
