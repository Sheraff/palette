import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import { evaluateTypographyChromaticRole } from "../src/typography-chromatic-role.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const targetSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("typography role POC preserves canonical output and remains read-only", async () => {
	const image = await loadImage(targetSource)
	const canonical = extractPalette(image)
	const result = evaluateTypographyChromaticRole(image)

	assert.deepEqual(result.canonical.roles, Object.fromEntries(
		(["background", "foreground", "surface", "accent"] as const).map((role) => [role, {
			hex: canonical.methods.spatial[role].hex.toLowerCase(),
			generated: canonical.methods.spatial[role].generated,
		}]),
	))
	assert.equal(result.invariants.readOnly, true)
	assert.equal(result.invariants.canonicalOutputNotEmittedFromTreatment, true)
	assert.equal(result.invariants.noGradientSurfaceRecovery, true)
	assert.equal(result.availability.addedSupplements.length, 1)
})

test("every changed target treatment selects the added typography candidate", async () => {
	const image = await loadImage(targetSource)
	const result = evaluateTypographyChromaticRole(image)
	if (result.decision.exactChangedRoles.length > 0 || result.decision.gradientChanged) {
		assert.equal(result.decision.treatmentSelectsAddedCandidate, true)
	}
})
