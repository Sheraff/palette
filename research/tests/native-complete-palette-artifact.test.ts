import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import {
	NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS,
	NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS,
	verifyNativeCompletePaletteArtifact,
} from "../evaluate-native-complete-palette.ts"

const projectRoot = resolve(import.meta.dirname, "../..")
const artifactDirectory = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final)

test("published Phase 5 matrix independently verifies every count, gate, hash, and certificate shard", async () => {
	const artifact = await verifyNativeCompletePaletteArtifact(artifactDirectory, projectRoot)
	assert.equal(artifact.results.groups.length, 391)
	assert.equal(artifact.results.groups.reduce((sum: number, group: any) => sum + group.paths.length, 0), 392)
	assert.equal(artifact.analysis.coverage.developmentPaths, 37)
	assert.equal(artifact.analysis.coverage.cohort00Paths, 355)
	assert.equal(artifact.manifest.status, artifact.analysis.gateA.passed
		? "phase-5-matrix-complete-gate-a-pass"
		: "phase-5-matrix-complete-gate-a-reject")
	assert.equal(artifact.analysis.gateA.passed,
		Object.entries(artifact.analysis.gateA).filter(([key]) => key !== "passed").every(([, value]) => value === true))
	assert.equal(artifact.analysis.violations.hard, 0)
	assert.equal(artifact.analysis.violations.certificate, 0)
	assert.equal(artifact.analysis.exactUnchangedCanonicalEquality, true)
	assert.equal(artifact.analysis.controls.matrix.length, NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS.length)
	assert.equal(artifact.certificateIndex.entryCount,
		artifact.results.groups.length + artifact.results.diagnostics.entries.length)
	assert.match(artifact.certificateIndex.orderedAggregateSha256, /^[0-9a-f]{64}$/)
	if (!artifact.analysis.gateA.passed) {
		assert.equal(artifact.analysis.nextAuthorization, "candidate-rejected-no-review-authorized")
	}
})
