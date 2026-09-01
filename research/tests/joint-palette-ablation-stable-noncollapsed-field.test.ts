import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import {
	buildJointPaletteAblationStableNoncollapsedField,
	JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY,
	JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
} from "../src/joint-palette-ablation-stable-noncollapsed-field.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

test("ablation-stable field inference admits only the exact noncollapsed field-only joint winner", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d00001e020000328b005287a10cb864f1.jpg`,
	))
	const result = buildJointPaletteAblationStableNoncollapsedField(image)

	assert.ok(result.candidate)
	assert.equal(result.certificate.version, JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION)
	assert.equal(result.certificate.policy, JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY)
	assert.equal(result.certificate.route, "admitted-field")
	assert.deepEqual(result.certificate.selected, result.certificate.canonicalOverlayAblation)
	assert.equal(result.jointCertificate.selected.stableKey, result.certificate.selected?.stableKey)
	assert.ok(result.certificate.selected?.objectiveDeltas.every((delta) => delta >= -1e-12))
	assert.ok(result.certificate.selected?.objectiveDeltas.some((delta) => delta > 1e-12))
	assert.deepEqual(result.candidate.foreground, result.canonical.foreground)
	assert.deepEqual(result.candidate.accent, result.canonical.accent)
	assert.notEqual(result.candidate.background.hex, result.candidate.surface.hex)
	assert.equal(Object.values(result.certificate.invariants).every(Boolean), true)
})
