import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { buildChromaticCandidateAvailability } from "../src/chromatic-candidate-availability.ts"
import { traceChromaticCandidateGeneration } from "../src/chromatic-candidate-generation-trace.ts"
import { loadImage } from "../src/image.ts"
import { extractRegionGraph017PaletteWithContext } from "../src/region-graph-0.17-extract.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const salmonSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("candidate generation trace is deterministic and preserves frozen availability", async () => {
	const image = await loadImage(salmonSource)
	const context = extractRegionGraph017PaletteWithContext(image)
	const candidatesBefore = structuredClone(context.candidates)
	const availabilityBefore = buildChromaticCandidateAvailability(context.analysis, context.candidates)

	const first = traceChromaticCandidateGeneration(context.analysis, context.candidates)
	const second = traceChromaticCandidateGeneration(context.analysis, context.candidates)

	assert.deepEqual(first, second)
	assert.deepEqual(context.candidates, candidatesBefore)
	assert.deepEqual(buildChromaticCandidateAvailability(context.analysis, context.candidates), availabilityBefore)
	assert.equal(first.hueAnchors.length, 12)
	assert.equal(first.invariants.noCandidatesPassedToRoleSolver, true)
})

test("candidate generation trace reports each anchor's first blocking stage", async () => {
	const image = await loadImage(salmonSource)
	const context = extractRegionGraph017PaletteWithContext(image)
	const trace = traceChromaticCandidateGeneration(context.analysis, context.candidates)
	const stages = new Set([
		"no-eligible-bins",
		"population",
		"family-chroma",
		"saliency",
		"spatial-support",
		"represented",
		"qualified",
	])

	assert.ok(trace.hueAnchors.every((anchor) => stages.has(anchor.firstBlockingStage)))
	assert.ok(trace.hueAnchors.every((anchor) => anchor.gateFailures.length > 0 || anchor.firstBlockingStage === "qualified"))
})
