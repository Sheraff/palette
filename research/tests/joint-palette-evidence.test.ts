import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	buildJointPaletteEvidence,
	evaluateJointPaletteOverlayContrast,
	JOINT_PALETTE_EVIDENCE_VERSION,
} from "../src/joint-palette-evidence.ts"
import { loadImage } from "../src/image.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const targetFile = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"

test("joint palette evidence is source exact, floor free, and field-first", async () => {
	const image = await loadImage(await readFile(`${projectRoot}/${targetFile}`))
	const before = createHash("sha256").update(image.data).digest("hex")
	const evidence = buildJointPaletteEvidence(image)
	const after = createHash("sha256").update(image.data).digest("hex")

	assert.equal(evidence.version, JOINT_PALETTE_EVIDENCE_VERSION)
	assert.equal(before, after)
	assert.equal(evidence.invariants.readOnly, true)
	assert.equal(evidence.invariants.fixedApcaAdmissionFloorAbsent, true)
	assert.ok(evidence.counts.fieldNodes > 0)
	assert.ok(evidence.counts.overlayAlternatives >= evidence.graph.nodes.length)
	assert.ok(evidence.counts.localOverlays > 0)
	assert.equal(evidence.counts.fieldTreatments, evidence.fieldTreatments.length)
	assert.equal(evidence.counts.overlayAlternatives, evidence.overlays.length)

	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	for (const treatment of evidence.fieldTreatments) {
		const background = nodeById.get(treatment.backgroundNodeId)
		const surface = nodeById.get(treatment.surfaceNodeId)
		assert.ok(background)
		assert.ok(surface)
		assert.ok(Number.isFinite(treatment.stateSupport) && treatment.stateSupport >= 0 && treatment.stateSupport <= 1)
		if (treatment.state === "collapsed") {
			assert.deepEqual(background.rgb, surface.rgb)
			assert.equal(treatment.fieldRelation, null)
			assert.equal(treatment.endpointDistance, 0)
		} else {
			assert.notDeepEqual(background.rgb, surface.rgb)
			assert.ok(treatment.endpointDistance > 0)
			assert.ok(treatment.fieldRelation)
		}
	}

	for (const alternative of evidence.overlays) {
		const pixel = alternative.provenance.representativePixelIndex
		const offset = pixel * 3
		assert.deepEqual(alternative.rgb, [...image.data.subarray(offset, offset + 3)])
		assert.equal(alternative.generated, false)
		assert.ok(alternative.evidence.foregroundSupport >= 0 && alternative.evidence.foregroundSupport <= 1)
		assert.ok(alternative.evidence.accentIdentitySupport >= 0 && alternative.evidence.accentIdentitySupport <= 1)
	}
	assert.ok(evidence.overlays.some((alternative) =>
		alternative.provenance.kind === "connected-family-local" && alternative.hex === "#d8d418"))

	const firstField = nodeById.get(evidence.graph.fieldNodeIds[0])!
	for (const alternative of evidence.overlays) {
		const contrast = evaluateJointPaletteOverlayContrast(alternative, firstField.rgb, firstField.rgb)
		assert.ok(Number.isFinite(contrast.background.signedLc))
		assert.ok(Number.isFinite(contrast.surface.signedLc))
	}
})
