import assert from "node:assert/strict"
import { lstat } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	NATIVE_SCALE_SPACE_EXPECTATIONS,
	NATIVE_SCALE_SPACE_EXPERIMENT_ID,
	NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT,
	NATIVE_SCALE_SPACE_IMPORT_POLICY,
	assertNativeScaleSpaceProvenancePath,
	buildNativeScaleSpaceEvidenceProtocol,
	isForbiddenNativeScaleSpaceImplementationPath,
	verifyNativeScaleSpaceArtifactDirectory,
	verifyNativeScaleSpaceImplementationClosure,
} from "../audit-native-scale-space-evidence.ts"
import {
	NATIVE_SCALE_SPACE_EXPERIMENT_ID as NATIVE_SCALE_SPACE_OUTPUT_EXPERIMENT_ID,
	resolveNativeScaleSpaceOutputPaths,
} from "../src/native-scale-space-output.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const researchRoot = fileURLToPath(new URL("../", import.meta.url))

test("published native scale-space evidence is complete and generically verifiable", async (context) => {
	assert.equal(NATIVE_SCALE_SPACE_OUTPUT_EXPERIMENT_ID, NATIVE_SCALE_SPACE_EXPERIMENT_ID)
	const finalDirectory = resolveNativeScaleSpaceOutputPaths(researchRoot).finalDirectory
	try {
		await lstat(finalDirectory)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		context.skip(`Final native scale-space namespace is not published: ${finalDirectory}`)
		return
	}

	const verified = await verifyNativeScaleSpaceArtifactDirectory(finalDirectory, {
		projectRoot,
		allowLimited: false,
		verifyCanonicalRasters: true,
		verifyScientificControls: true,
		verifyResourceCheckpoints: true,
	})
	const protocol = buildNativeScaleSpaceEvidenceProtocol()
	const [, ...structurallyValidDispositions] = NATIVE_SCALE_SPACE_EXPECTATIONS.dispositionPrecedence
	assert.equal(verified.publishable, true)
	assert.equal(verified.executionSourceCount, NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT)
	assert.equal(NATIVE_SCALE_SPACE_FULL_SOURCE_COUNT, 392)
	assert.equal(verified.fileCount, protocol.publication.finalJsonFiles)
	assert.equal(protocol.publication.finalJsonFiles, 398)
	assert.ok(structurallyValidDispositions.some((disposition) => disposition === verified.disposition))

	const closure = await verifyNativeScaleSpaceImplementationClosure(projectRoot)
	const expectedRuntimePaths = NATIVE_SCALE_SPACE_IMPORT_POLICY.localFileAllowlist.successorRuntime
	const expectedTestPaths = NATIVE_SCALE_SPACE_IMPORT_POLICY.localFileAllowlist.successorTests
	assert.equal(expectedRuntimePaths.length, 4)
	assert.equal(expectedTestPaths.length, 4)
	const closurePaths = new Set(closure.files.map(({ path }) => path))
	for (const path of [...expectedRuntimePaths, ...expectedTestPaths]) assert.ok(closurePaths.has(path), path)
	for (const path of NATIVE_SCALE_SPACE_IMPORT_POLICY.forbiddenRegistry.exactFiles) {
		assert.equal(closurePaths.has(path), false, path)
	}
	for (const { path } of closure.files) {
		assert.equal(isForbiddenNativeScaleSpaceImplementationPath(path), false, path)
		assert.equal(assertNativeScaleSpaceProvenancePath(path), path)
	}
})
