import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	SCALE_AWARE_NATIVE_EXPERIMENT_ID,
	SCALE_AWARE_NATIVE_REVIEW_ID,
	verifyScaleAwareNativeArtifact,
} from "../evaluate-scale-aware-native-palette.ts"

test("published scale-aware native artifact verifies and freezes only novel review pairs", async () => {
	const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
	const artifactDirectory = fileURLToPath(new URL(
		`../data/experiments/${SCALE_AWARE_NATIVE_EXPERIMENT_ID}/`,
		import.meta.url,
	))
	const artifact = await verifyScaleAwareNativeArtifact(artifactDirectory, projectRoot)
	assert.equal(artifact.comparison.execution.sourceCount, 37)
	assert.equal(artifact.comparison.summary.hardGateViolationSources, 0)
	assert.equal(artifact.reviewManifest.reviewIdentity, SCALE_AWARE_NATIVE_REVIEW_ID)
	assert.equal(artifact.reviewManifest.eligiblePairCount, 24)
	assert.equal(artifact.reviewManifest.carriedCount, 9)
	assert.equal(artifact.reviewManifest.queueCount, 15)
	assert.equal(artifact.reviewManifest.entries.length, 15)
})
