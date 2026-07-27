import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "../src/color.ts"
import { extractPalette } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import {
	extractNextPaletteJointPareto,
	NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
	NEXT_PALETTE_JOINT_PARETO_POLICY,
} from "../src/next-palette-joint-pareto.ts"
import type { RawImage } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

test("joint Pareto inference recomputes overlays for every field treatment and dominates canonical", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d0000b27300001b7dc13511d828fe5536.jpg`,
	))
	const first = extractNextPaletteJointPareto(image)
	const second = extractNextPaletteJointPareto(image)

	assert.deepEqual(first, second)
	assert.equal(first.certificate.algorithmVersion, NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION)
	assert.equal(first.certificate.policy, NEXT_PALETTE_JOINT_PARETO_POLICY)
	assert.equal(first.certificate.policy.fixedApcaAdmissionFloor, null)
	assert.equal(first.certificate.selected.changed, true)
	assert.equal(first.certificate.selected.admitted, true)
	assert.ok(first.certificate.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
	assert.ok(first.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
	assert.ok(first.certificate.counts.fieldTreatmentsMeetingIncumbent > 1)
	assert.ok(first.certificate.counts.attemptedCompleteTuples > 1)
	assert.equal(first.certificate.ablations["canonical-field-block"].changed, true)
	assert.equal(first.certificate.selected.changedSemanticAtoms, 1)
	assert.equal(first.certificate.ablations["canonical-field-block"].changedSemanticAtoms, 1)
	assert.equal(first.palette.accent.hex, "#d8d418")
	assert.notEqual(first.palette.foreground.hex, first.palette.background.hex)
	assert.notEqual(first.palette.foreground.hex, first.palette.surface.hex)
	assert.notEqual(first.palette.accent.hex, first.palette.background.hex)
	assert.notEqual(first.palette.accent.hex, first.palette.surface.hex)
	assert.notEqual(first.palette.accent.hex, first.palette.foreground.hex)
	assert.ok(new Set([first.palette.background.hex, first.palette.foreground.hex, first.palette.surface.hex,
		first.palette.accent.hex]).size <= 4)

	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const provenance = first.certificate.selected.roles[role]
		assert.ok("representativePixelIndex" in provenance)
		const offset = provenance.representativePixelIndex * 3
		assert.deepEqual(provenance.rgb, [...image.data.subarray(offset, offset + 3)])
	}
	assert.equal(first.certificate.selected.apcaLc.foregroundOnBackground,
		apcaContrast(first.palette.foreground.rgb, first.palette.background.rgb))
	assert.equal(first.certificate.selected.apcaLc.foregroundOnSurface,
		apcaContrast(first.palette.foreground.rgb, first.palette.surface.rgb))
	assert.equal(first.certificate.selected.apcaLc.accentOnBackground,
		apcaContrast(first.palette.accent.rgb, first.palette.background.rgb))
	assert.equal(first.certificate.selected.apcaLc.accentOnSurface,
		apcaContrast(first.palette.accent.rgb, first.palette.surface.rgb))
})

test("joint Pareto inference preserves exact canonical when no source challenger dominates", () => {
	const image: RawImage = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 3) }
	for (let offset = 0; offset < image.data.length; offset += 3) {
		image.data[offset] = 80
		image.data[offset + 1] = 100
		image.data[offset + 2] = 120
	}
	const canonical = extractPalette(image).methods.spatial
	const result = extractNextPaletteJointPareto(image)

	assert.equal(result.certificate.selected.changed, false)
	assert.equal(result.certificate.selected.admitted, false)
	assert.deepEqual(result.palette, canonical)
	assert.equal(result.certificate.selected.fieldTreatment, null)
	assert.equal(result.certificate.invariants.unchangedIsExactCanonical, true)
})
