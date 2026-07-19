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

test("joint solver can apply a complete multi-role improvement", async () => {
	const file = "00/ab67616d00001e0200005ddc313068597b41ae3b.jpg"
	const image = await loadImage(join(projectRoot, file))
	const result = extractJointPalette(image)
	const palette = result.extraction.methods.spatial

	assert.equal(result.certificate.preservedBaseline, false)
	assert.equal(result.certificate.selected.roleChanges, 4)
	assert.deepEqual(result.certificate.selected.roles, {
		background: "#0a0909",
		foreground: "#92acca",
		surface: "#0a0909",
		accent: "#5197ad",
	})
	assert.ok(result.certificate.selected.objectiveDelta.every((value) => value >= 0))
	assert.ok(result.certificate.selected.objectiveDelta.reduce((sum, value) => sum + value, 0) / 5 >= 0.16)
	assert.equal(palette.metrics.foregroundContrast >= 3, true)
	assert.equal(palette.metrics.foregroundSurfaceContrast >= 2.5, true)
	assert.equal(palette.metrics.accentContrast >= 1.2, true)
})

test("joint selection and its certificate are deterministic", async () => {
	const image = await loadImage(join(projectRoot, "images/once.jpg"))
	const first = extractJointPalette(image)
	const second = extractJointPalette(image)

	assert.deepEqual(first.extraction.methods, second.extraction.methods)
	assert.deepEqual(first.extraction.candidates, second.extraction.candidates)
	assert.deepEqual(first.certificate, second.certificate)
})
