import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../src/extract.ts"
import { extractJointPalette } from "../src/joint-extract.ts"
import { JOINT_ALGORITHM_VERSION, JOINT_BASELINE_VERSION } from "../src/joint-palette.ts"
import { loadImage } from "../src/image.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

test("joint solver preserves the reviewed incumbent when no constrained improvement exists", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const incumbent = extractPalette(image)
	const result = extractJointPalette(image)

	assert.equal(result.extraction.version, JOINT_ALGORITHM_VERSION)
	assert.equal(result.certificate.baselineAlgorithmVersion, JOINT_BASELINE_VERSION)
	assert.equal(result.certificate.preservedBaseline, true)
	assert.deepEqual(result.extraction.methods.spatial, incumbent.methods.spatial)
	assert.deepEqual(result.extraction.methods.expressive, incumbent.methods.expressive)
	assert.deepEqual(result.extraction.methods.quantized, incumbent.methods.quantized)
})

test("strict pair evidence recovers the reviewed vivid surface without changing other roles", async () => {
	const file = "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg"
	const image = await loadImage(join(projectRoot, file))
	const incumbent = extractPalette(image).methods.spatial
	const result = extractJointPalette(image)
	const palette = result.extraction.methods.spatial

	assert.equal(incumbent.surface.hex, "#36292a")
	assert.equal(result.certificate.preservedBaseline, false)
	assert.equal(result.certificate.selectedAdmission, "gradient-surface-recovery")
	assert.equal(result.certificate.counts.gradientSurfaceRecoveries, 1)
	assert.equal(result.certificate.selected.roleChanges, 1)
	assert.deepEqual(result.certificate.selected.roles, {
		background: "#020508",
		foreground: "#fcecf6",
		surface: "#f90a0a",
		accent: "#a11210",
	})
	assert.deepEqual(palette.background, incumbent.background)
	assert.deepEqual(palette.foreground, incumbent.foreground)
	assert.deepEqual(palette.accent, incumbent.accent)
	assert.equal(palette.gradient.isGradient, incumbent.gradient.isGradient)
	assert.equal(palette.metrics.foregroundSurfaceContrast >= 3, true)
	assert.equal(palette.metrics.foregroundSurfaceContrast < 4.5, true)
	assert.equal(result.certificate.selected.objectiveDelta[2] >= 0.05, true)
	assert.equal(result.certificate.selected.objectiveDelta[3] >= -0.02, true)
	assert.equal(result.certificate.selected.objectiveDelta[4] >= 0.05, true)
	assert.equal(result.certificate.selected.objectiveDelta.reduce((sum, value) => sum + value, 0) / 5 >= 0.02, true)
})

test("surface recovery does not generalize a preference for accent collapse", async () => {
	const file = "00/ab67616d00001e0200004b1453b0c6d8d31c435b.jpg"
	const image = await loadImage(join(projectRoot, file))
	const incumbent = extractPalette(image).methods.spatial
	const result = extractJointPalette(image)

	assert.equal(incumbent.accent.hex, "#4d4d49")
	assert.equal(result.certificate.selectedAdmission, "preserve")
	assert.equal(result.certificate.counts.gradientSurfaceRecoveries, 0)
	assert.deepEqual(result.extraction.methods.spatial, incumbent)
})

test("joint selection and its certificate are deterministic", async () => {
	const image = await loadImage(join(projectRoot, "images/once.jpg"))
	const first = extractJointPalette(image)
	const second = extractJointPalette(image)

	assert.deepEqual(first.extraction.methods, second.extraction.methods)
	assert.deepEqual(first.extraction.candidates, second.extraction.candidates)
	assert.deepEqual(first.certificate, second.certificate)
})
