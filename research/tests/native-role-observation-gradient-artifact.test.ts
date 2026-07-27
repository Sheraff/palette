import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"
import {
	NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID,
	verifyNativeRoleObservationGradientArtifact,
} from "../evaluate-native-role-observation-gradient.ts"
import { NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION } from "../src/native-role-observation-gradient-extract.ts"

const projectRoot = resolve(import.meta.dirname, "../..")
const artifactDirectory = resolve(
	projectRoot,
	"research/data/experiments/region-graph-0.19.0-native-role-observation-gradient-0.3.0-development",
)

test("published native-role observation-gradient artifact is closed and review-ready", async () => {
	const artifact = await verifyNativeRoleObservationGradientArtifact(artifactDirectory, projectRoot)
	assert.equal(artifact.results.algorithmVersion, NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION)
	assert.equal(artifact.reviewManifest.reviewIdentity, NATIVE_ROLE_OBSERVATION_GRADIENT_REVIEW_ID)
	assert.equal(artifact.comparison.summary.rawExactRoleChanges, 0)
	assert.equal(artifact.comparison.summary.canonicalGradientDisagreements, 1)
	assert.equal(artifact.comparison.summary.hardGateViolationSources, 0)
	assert.equal(artifact.comparison.summary.birdsofpreyGradientCorrected, true)
	assert.equal(artifact.comparison.summary.kraftyGradientCorrected, true)
	assert.equal(artifact.reviewManifest.carriedCount, 21)
	assert.deepEqual(artifact.reviewManifest.entries.map((entry) => entry.file), [
		"krafty.jpg",
		"maroon5-original.jpg",
		"maroon5.jpg",
		"once.jpg",
	])
})
