import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	NATIVE_RESOLUTION_EXPERIMENT_ID,
	NATIVE_RESOLUTION_REVIEW_ID,
	verifyNativeResolutionArtifact,
} from "../evaluate-native-resolution-region-graph.ts"

test("published native-resolution development artifact verifies from its manifest", async () => {
	const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
	const artifactDirectory = fileURLToPath(new URL(
		`../data/experiments/${NATIVE_RESOLUTION_EXPERIMENT_ID}/`,
		import.meta.url,
	))
	const artifact = await verifyNativeResolutionArtifact(artifactDirectory, projectRoot)
	assert.equal(artifact.manifest.experimentId, NATIVE_RESOLUTION_EXPERIMENT_ID)
	assert.equal(artifact.comparison.execution.sourceCount, 37)
	assert.equal(artifact.comparison.execution.limited, false)
	assert.equal(artifact.results.entries.length, 37)
	assert.equal(artifact.reviewManifest.reviewIdentity, NATIVE_RESOLUTION_REVIEW_ID)
	assert.equal(artifact.reviewManifest.queueCount, 25)
	assert.equal(artifact.reviewManifest.entries.length, 25)
})
