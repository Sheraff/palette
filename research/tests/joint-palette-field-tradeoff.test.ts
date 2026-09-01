import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import {
	buildJointPaletteFieldTradeoff,
	JOINT_PALETTE_FIELD_TRADEOFF_POLICY,
	JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
} from "../src/joint-palette-field-tradeoff.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

function sourceHasRgb(data: Uint8Array, rgb: readonly number[]): boolean {
	for (let offset = 0; offset < data.length; offset += 3) {
		if (data[offset] === rgb[0] && data[offset + 1] === rgb[1] && data[offset + 2] === rgb[2]) return true
	}
	return false
}

test("field tradeoff diagnostic exposes a complete distinct treatment for an under-collapsed incumbent", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d0000b2730000c258ff41ad4f15ddc953.jpg`,
	))
	const first = buildJointPaletteFieldTradeoff(image)
	const second = buildJointPaletteFieldTradeoff(image)

	assert.deepEqual(first, second)
	assert.equal(first.certificate.version, JOINT_PALETTE_FIELD_TRADEOFF_VERSION)
	assert.equal(first.certificate.policy, JOINT_PALETTE_FIELD_TRADEOFF_POLICY)
	assert.equal(first.certificate.policy.fixedApcaAdmissionFloor, null)
	assert.equal(first.certificate.invariants.diagnosticOnly, true)
	assert.ok(first.candidate)
	assert.notEqual(first.canonical.background.hex, first.candidate.background.hex)
	assert.equal(first.canonical.background.hex, first.canonical.surface.hex)
	assert.notEqual(first.candidate.background.hex, first.candidate.surface.hex)
	assert.ok(first.certificate.selected)
	assert.ok(first.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
	assert.ok(first.certificate.selected.objectiveDeltas.some((delta) => delta < -1e-12))
	assert.ok(first.certificate.counts.paretoCompleteTuples > 0)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.equal(first.candidate[role].generated, false)
		assert.ok(sourceHasRgb(image.data, first.candidate[role].rgb))
	}
})

test("field tradeoff diagnostic preserves a no-alternative classification", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d0000b2730000076231b78e8e8ea5168c.jpg`,
	))
	const result = buildJointPaletteFieldTradeoff(image)

	assert.equal(result.candidate, null)
	assert.equal(result.certificate.selected, null)
	assert.deepEqual(result.certificate.frontier, [])
	assert.equal(result.certificate.counts.paretoCompleteTuples, 0)
})
