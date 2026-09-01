import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import {
	buildJointPaletteThresholdFreeCollapse,
	evaluateThresholdFreeCollapse,
	JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY,
	JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
} from "../src/joint-palette-threshold-free-collapse.ts"
import type { Palette } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

function canonical(): Pick<Palette, "background" | "foreground" | "surface" | "accent"> {
	const role = (rgb: [number, number, number]) => ({ rgb, hex: "#000000", generated: false, sourceDistance: 0 })
	return {
		background: role([0, 0, 0]),
		foreground: role([255, 255, 255]),
		surface: role([80, 80, 80]),
		accent: role([255, 180, 0]),
	}
}

function relation(backgroundPresence = 0.8, surfacePresence = 0.2, backgroundSupport = 0.7, surfaceSupport = 0.3) {
	return {
		endpoint: { absolutePairCoverage: 0.5, backgroundPresence, surfacePresence, balance: 0.4, mass: 0.2 },
		field: { backgroundSupport, surfaceSupport, jointSupport: 0.45 },
	}
}

test("threshold-free collapse audit uses only directional and non-regression clauses", () => {
	const pass = evaluateThresholdFreeCollapse(canonical(), relation())
	assert.equal(pass.pass, true)
	assert.deepEqual(pass.clauses, {
		retainedBackgroundPresenceDominates: true,
		retainedBackgroundFieldSupportDominates: true,
		foregroundSurfaceRelationPreserved: true,
		accentSurfaceRelationPreserved: true,
	})
	assert.equal(evaluateThresholdFreeCollapse(canonical(), relation(0.2, 0.8)).pass, false)
	assert.equal(evaluateThresholdFreeCollapse(canonical(), relation(0.8, 0.2, 0.3, 0.7)).pass, false)
	assert.equal(JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY.fittedNumericThresholds, false)
	assert.equal(JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY.fixedApcaAdmissionFloor, null)
})

test("threshold-free collapse admits the fresh exact audited treatment", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d0000b27300003732606221eb423e62d8.jpg`,
	))
	const result = buildJointPaletteThresholdFreeCollapse(image)

	assert.equal(result.certificate.version, JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION)
	assert.equal(result.certificate.policy, JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY)
	assert.equal(result.certificate.route, "admitted-collapse")
	assert.equal(result.certificate.audit?.pass, true)
	assert.ok(Object.values(result.certificate.audit!.clauses).every(Boolean))
	assert.ok(result.candidate)
	assert.deepEqual(result.candidate.background.rgb, [8, 10, 10])
	assert.deepEqual(result.candidate.surface.rgb, result.candidate.background.rgb)
	assert.deepEqual(result.candidate.foreground.rgb, result.canonical.foreground.rgb)
	assert.deepEqual(result.candidate.accent.rgb, result.canonical.accent.rgb)
	assert.equal(result.candidate.gradient.isGradient, false)
	assert.equal(result.certificate.fieldDominance?.changedSemanticBlocks, 1)
	assert.equal(result.certificate.fieldDominance?.changedSemanticAtoms, 2)
	assert.ok(result.certificate.fieldDominance!.objectiveDeltas.every((delta) => delta >= -1e-12))
	assert.ok(result.certificate.fieldDominance!.objectiveDeltas.some((delta) => delta > 1e-12))
})
