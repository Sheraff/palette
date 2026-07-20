import assert from "node:assert/strict"
import test from "node:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../src/extract.ts"
import { extractGradientEligiblePalette } from "../src/gradient-eligibility-extract.ts"
import { loadImage } from "../src/image.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

test("gradient eligibility changes only the spatial gradient decision", async () => {
	const image = await loadImage(join(projectRoot, "images", "artofficial.jpg"))
	const baseline = extractPalette(image)
	const candidate = extractGradientEligiblePalette(image)
	assert.equal(candidate.extraction.version, "gradient-eligibility-0.8.6-dev")
	assert.deepEqual(candidate.extraction.candidates, baseline.candidates)
	assert.deepEqual(candidate.extraction.methods.expressive, baseline.methods.expressive)
	assert.deepEqual(candidate.extraction.methods.quantized, baseline.methods.quantized)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.deepEqual(candidate.extraction.methods.spatial[role], baseline.methods.spatial[role])
	}
	assert.equal(candidate.extraction.methods.spatial.score, baseline.methods.spatial.score)
	assert.deepEqual(candidate.extraction.methods.spatial.metrics, baseline.methods.spatial.metrics)
	assert.equal(candidate.certificate.baselineGradient, baseline.methods.spatial.gradient.isGradient)
	assert.equal(candidate.extraction.methods.spatial.gradient.isGradient, candidate.certificate.decision.eligible)
	assert.deepEqual(candidate.certificate.invariants, {
		rolesUnchanged: true,
		pairSpecificEvidenceOnly: true,
		globalSmoothFallbackDisabled: true,
	})
})

test("targeted reviewed gradients remain eligible", async () => {
	for (const file of ["birdsofprey.jpg", "doja.jpg", "muse.jpg", "nada.jpg"]) {
		const image = await loadImage(join(projectRoot, "images", file))
		const candidate = extractGradientEligiblePalette(image)
		assert.equal(candidate.certificate.baselineGradient, true, file)
		assert.equal(candidate.certificate.decision.eligible, true, file)
	}
})
