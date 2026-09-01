import assert from "node:assert/strict"
import test from "node:test"
import { verifyNativeCompletePaletteReview } from "../verify-native-complete-palette-review.ts"

test("authorized native complete-palette review independently binds all cases and custody", async () => {
	const artifact = await verifyNativeCompletePaletteReview()
	assert.equal(artifact.manifest.entries.length, 15)
	assert.equal(artifact.manifest.entries.filter((entry) => entry.kind === "changed").length, 6)
	assert.equal(artifact.manifest.entries.filter((entry) => entry.kind === "hidden-repeat").length, 2)
	assert.equal(artifact.manifest.entries.filter((entry) => entry.materialChanged && entry.kind === "changed").length, 2)
	assert.equal(artifact.phase5.analysis.gateA.passed, true)
	assert.equal(artifact.plan.reserveAccessed, false)
	assert.deepEqual(artifact.authorization.prohibitions.openedReserveRoots, [])
})
