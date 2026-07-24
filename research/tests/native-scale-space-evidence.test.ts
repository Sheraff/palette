import assert from "node:assert/strict"
import test from "node:test"
import {
	NATIVE_SCALE_SPACE_AVAILABILITY_VERSION,
	NATIVE_SCALE_SPACE_AVAILABILITY_POLICY,
	NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256,
	NATIVE_SCALE_SPACE_EXPECTATIONS,
	NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
	NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION,
	NATIVE_SCALE_SPACE_FIXTURE_BYTE_SHA256,
	NATIVE_SCALE_SPACE_FIXTURE_IDENTITIES,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION,
	NATIVE_SCALE_SPACE_FIXTURE_RGB,
	NATIVE_SCALE_SPACE_IMPORT_POLICY,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION,
	NATIVE_SCALE_SPACE_THRESHOLDS,
	NATIVE_SCALE_SPACE_TRANSFORMS,
	accumulateNativeScaleSpaceReconstructionCandidate,
	accumulateNativeScaleSpaceReconstructionBinaryCandidate,
	analyzeNativeScaleSpaceThreshold,
	assertNativeScaleSpaceAvailabilityFrozen,
	assertNativeScaleSpaceMetricRecord,
	computeNativeScaleSpaceTransformBDeltaQ24,
	computeNativeScaleSpaceTransformCToParentBDeltaQ24,
	createNativeScaleSpaceAFieldView,
	createNativeScaleSpaceAvailability,
	createNativeScaleSpaceComponentScratch,
	createNativeScaleSpaceFieldView,
	createNativeScaleSpaceFixture,
	createNativeScaleSpaceReconstructionAccumulator,
	createNativeScaleSpaceTransformIdentity,
	evaluateNativeScaleSpaceBcSampleStabilityMetrics,
	evaluateNativeScaleSpaceBinaryFieldMetrics,
	evaluateNativeScaleSpaceBinaryPairMetrics,
	evaluateNativeScaleSpaceFieldMetrics,
	evaluateNativeScaleSpaceFixtureStructuralRows,
	evaluateNativeScaleSpaceGraphMetrics,
	evaluateNativeScaleSpacePairMetrics,
	evaluateNativeScaleSpacePartitionStabilityMetrics,
	evaluateNativeScaleSpaceScientificPredicates,
	evaluateNativeScaleSpaceTransformBStabilityMetrics,
	evaluateNativeScaleSpaceTransformCStabilityMetrics,
	fillNativeScaleSpaceCandidateMask,
	fillNativeScaleSpaceFamilyMask,
	finalizeNativeScaleSpaceReconstruction,
	inverseMapNativeScaleSpaceBinaryMask,
	matchNativeScaleSpaceTransformedCandidates,
	nativeScaleSpaceFixtureDisposition,
	nativeScaleSpaceInverseTransformCoordinate,
	nativeScaleSpaceOrderedCandidateEdges,
	nativeScaleSpaceTransformDimensions,
	reduceNativeScaleSpaceTransformDelta,
	resolveNativeScaleSpaceOperandRgb,
	resolveNativeScaleSpaceOperandTuple,
	transformNativeScaleSpaceBinaryMask,
	transformNativeScaleSpaceFixture,
} from "../src/native-scale-space-evidence.ts"
import {
	NATIVE_SCALE_SPACE_Q24,
	accumulateQ24PartitionPlane,
	canonicalJson,
	canonicalTypedArrayHash,
	createQ24PartitionResidualAccumulator,
	domainSeparatedCanonicalSha256,
	finalizeQ24PartitionResidual,
	sampleQ24PlaneAtTargetCenters,
} from "../src/native-scale-space-raster.ts"
import { rgbToOKLab } from "../src/color.ts"
import { analyzeResolutionEvidence } from "../src/resolution-evidence.ts"

function availability(fixtureId: Parameters<typeof createNativeScaleSpaceFixture>[0]) {
	const fixture = createNativeScaleSpaceFixture(fixtureId)
	return {
		fixture,
		availability: createNativeScaleSpaceAvailability(fixture, {
			sourceSha256: fixture.bytesSha256,
			decodedNativeIdentity: fixture.identity,
			rasterPolicyIdentity: "fixture-test-v1",
		}),
	}
}

function candidateForRgb(
	frozen: ReturnType<typeof createNativeScaleSpaceAvailability>,
	rgbKey: keyof typeof NATIVE_SCALE_SPACE_FIXTURE_RGB,
) {
	const resolved = resolveNativeScaleSpaceOperandRgb(frozen, rgbKey, NATIVE_SCALE_SPACE_FIXTURE_RGB[rgbKey])
	assert.ok(resolved)
	return resolved
}

test("exports deeply frozen, domain-separated registries with concrete threshold IDs", () => {
	assert.equal(NATIVE_SCALE_SPACE_AVAILABILITY_VERSION, "native-scale-space-availability-v1")
	assert.equal(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION, "native-scale-space-metric-definitions-v1")
	assert.equal(NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION, "native-scale-space-fixtures-v1")
	assert.equal(NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION, "native-scale-space-expectations-v1")
	assert.equal(NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION, "native-scale-space-import-policy-v1")
	assert.equal(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.length, 56)
	assert.equal(new Set(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.map(({ id }) => id)).size, 56)
	const exactKeys = ["arms", "emptyCase", "formula", "id", "inputs", "normalization", "numericEncoding", "status", "tieRule", "units", "version"]
	for (const definition of NATIVE_SCALE_SPACE_METRIC_DEFINITIONS) {
		assert.deepEqual(Object.keys(definition).sort(), exactKeys)
		assert.equal(definition.id.endsWith(".t"), false)
		assert.equal(Object.isFrozen(definition), true)
		assert.equal(Object.isFrozen(definition.inputs), true)
		assert.equal(Object.isFrozen(definition.arms), true)
	}
	assert.deepEqual(NATIVE_SCALE_SPACE_THRESHOLDS, [4_194_304, 8_388_608, 12_582_912])
	for (const suffix of ["Q/4", "Q/2", "3Q/4"]) {
		assert.ok(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.some(({ id }) => id === `component.signature.${suffix}`))
		assert.ok(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.some(({ id }) => id === `topology.pairConnectedShare.${suffix}`))
	}
	assert.equal(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
		domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_VERSION, NATIVE_SCALE_SPACE_METRIC_DEFINITIONS))
	assert.equal(NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
		domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_VERSION, NATIVE_SCALE_SPACE_FIXTURE_MANIFEST))
	assert.equal(NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
		domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_EXPECTATIONS_VERSION, NATIVE_SCALE_SPACE_EXPECTATIONS))
	assert.equal(NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
		domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_IMPORT_POLICY_VERSION, NATIVE_SCALE_SPACE_IMPORT_POLICY))
	assert.equal(NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256,
		domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_AVAILABILITY_VERSION, NATIVE_SCALE_SPACE_AVAILABILITY_POLICY))
	assert.equal(NATIVE_SCALE_SPACE_AVAILABILITY_POLICY.transformCorrespondenceExactRgb,
		"lexicographically-smallest-exact-native-rgb-in-candidate-mask")
	assert.equal(NATIVE_SCALE_SPACE_EXPECTATIONS.applicabilityRules.transformCorrespondenceExactRgb,
		"lexicographically-smallest-exact-native-rgb-in-candidate-mask;separate-from-native-and-analysis-witnesses")
	assert.equal(Object.isFrozen(NATIVE_SCALE_SPACE_EXPECTATIONS.scientificPredicates[0].operands[0]), true)
	assert.equal(Object.isFrozen(NATIVE_SCALE_SPACE_IMPORT_POLICY.forbiddenRegistry.exactFiles), true)
})

test("freezes native labels, global in-label witnesses, and compressed family unions", () => {
	const { fixture, availability: frozen } = availability("vertical-split")
	assert.equal(frozen.candidates.length, 2)
	assert.equal(frozen.families.length, 2)
	assert.equal(frozen.orderedCandidateEdgeCount, 2)
	assert.equal(frozen.candidateLabels.length, fixture.width * fixture.height)
	assert.equal(frozen.candidateLabels.includes(0xff), false)
	assert.deepEqual(Array.from(frozen.familyMemberOffsets), [0, 1, 2])
	assert.deepEqual(Array.from(frozen.familyMemberCandidateIds).sort(), [0, 1])

	const dark = candidateForRgb(frozen, "D")
	const light = candidateForRgb(frozen, "L")
	assert.equal(dark.witnessIndex, 0)
	assert.equal(light.witnessIndex, 16)
	assert.deepEqual(dark.resolvedExactRgb, NATIVE_SCALE_SPACE_FIXTURE_RGB.D)
	assert.deepEqual(light.resolvedExactRgb, NATIVE_SCALE_SPACE_FIXTURE_RGB.L)
	assert.notEqual(dark.stableKey, light.stableKey)
	assert.notEqual(frozen.candidates[dark.candidateId].nativeMaskSha256, frozen.candidates[light.candidateId].nativeMaskSha256)

	const reusable = new Uint8Array(frozen.candidateLabels.length)
	assert.equal(fillNativeScaleSpaceCandidateMask(frozen, dark.candidateId, reusable), reusable)
	assert.equal(reusable.reduce((sum, value) => sum + value, 0), 384)
	for (const family of frozen.families) {
		const union = fillNativeScaleSpaceFamilyMask(frozen, family.id, reusable)
		assert.equal(union.reduce((sum, value) => sum + value, 0), family.nativePixelCount)
		assert.equal(canonicalTypedArrayHash(union, [frozen.height, frozen.width]), family.nativeMaskSha256)
	}
	assert.deepEqual(Object.keys(frozen.predecessorMetadata).sort(),
		["candidateLabelsSha256", "occupiedBinCount", "policySha256", "version"])
	for (const forbidden of ["field", "relations", "roles", "palettes", "selectors", "outputMode"]) {
		assert.equal(forbidden in frozen, false)
	}
	assert.equal(nativeScaleSpaceOrderedCandidateEdges(frozen).length, 2)
})

test("copies true bootstrap analysis representatives and keeps witness and correspondence domains separate", () => {
	const { fixture, availability: frozen } = availability("broad-ramp")
	const identity = {
		analysisRasterIdentity: fixture.identity,
		decodedNativeRasterIdentity: fixture.identity,
		rasterPolicyIdentity: "fixture-test-v1",
	}
	const bootstrap = analyzeResolutionEvidence(fixture, fixture, identity)
	assert.equal(frozen.policy, NATIVE_SCALE_SPACE_AVAILABILITY_POLICY)
	assert.equal(frozen.policySha256, NATIVE_SCALE_SPACE_AVAILABILITY_POLICY_SHA256)
	for (const candidate of frozen.candidates) {
		const offset = candidate.id * 3
		assert.deepEqual(candidate.meanOklab, Array.from(bootstrap.candidates.meanLab.subarray(offset, offset + 3)))
		assert.deepEqual(candidate.analysisRepresentativeRgb,
			Array.from(bootstrap.candidates.analysisRepresentativeRgb.subarray(offset, offset + 3)))
		assert.deepEqual(candidate.analysisRepresentativeLab,
			Array.from(bootstrap.candidates.analysisRepresentativeLab.subarray(offset, offset + 3)))
		assert.equal(candidate.analysisRepresentativeIndex, bootstrap.candidates.analysisRepresentativeIndices[candidate.id])
		assert.equal(candidate.analysisRepresentativeDistance, bootstrap.candidates.analysisRepresentativeDistance[candidate.id])
		assert.equal(candidate.analysisRepresentativeNativeExact,
			bootstrap.candidates.analysisRepresentativeNativeExact[candidate.id] === 1)

		let expectedWitnessIndex = -1
		let expectedSquaredDistance = Infinity
		let minimumPackedRgb = 0x1_00_00_00
		for (let pixel = 0; pixel < frozen.candidateLabels.length; pixel++) {
			if (frozen.candidateLabels[pixel] !== candidate.id) continue
			const rgbOffset = pixel * 3
			const rgb = [fixture.data[rgbOffset], fixture.data[rgbOffset + 1], fixture.data[rgbOffset + 2]] as const
			const lab = rgbToOKLab(rgb)
			const distance = (lab[0] - candidate.meanOklab[0]) ** 2 +
				(lab[1] - candidate.meanOklab[1]) ** 2 + (lab[2] - candidate.meanOklab[2]) ** 2
			if (distance < expectedSquaredDistance) {
				expectedSquaredDistance = distance
				expectedWitnessIndex = pixel
			}
			minimumPackedRgb = Math.min(minimumPackedRgb, rgb[0] * 65_536 + rgb[1] * 256 + rgb[2])
		}
		assert.equal(candidate.witnessIndex, expectedWitnessIndex)
		assert.equal(candidate.witnessSquaredDistance, expectedSquaredDistance)
		assert.deepEqual(candidate.correspondenceRgb, [minimumPackedRgb >>> 16, minimumPackedRgb >>> 8 & 0xff, minimumPackedRgb & 0xff])
		assert.equal(frozen.candidateLabels[candidate.analysisRepresentativeIndex], candidate.id)
	}
	assert.ok(frozen.candidates.some((candidate) =>
		candidate.correspondenceRgb.some((channel, index) => channel !== candidate.witnessRgb[index])))
})

test("uses the exact component traversal, signature domain, frame band, and thin rule", () => {
	const split = availability("vertical-split").availability
	const checker = availability("checker-1px").availability
	const splitDark = candidateForRgb(split, "D")
	const checkerDark = candidateForRgb(checker, "D")
	const splitMetrics = evaluateNativeScaleSpaceFieldMetrics(createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(split, splitDark.candidateId), split.width, split.height,
	))
	const checkerMetrics = evaluateNativeScaleSpaceFieldMetrics(createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(checker, checkerDark.candidateId), checker.width, checker.height,
	))
	assert.equal(splitMetrics["component.signature.Q/2"], "7ae3e1e1acc8cc991ab565f225299d54ef7b92b951cf6898f1b2f3574b48566a")
	assert.equal(checkerMetrics["component.signature.Q/2"], "f39014e8643f328ec34e140db6650fc130cdd338d2cce3cdd161ff2760eb9e69")
	assert.equal(splitMetrics["component.count.Q/2"], 1)
	assert.equal(checkerMetrics["component.count.Q/2"], 384)
	assert.equal(splitMetrics["detail.boundaryDensity.Q/2"], 24 / (24 * 31 + 23 * 32))

	const line = new Uint32Array(100 * 100)
	line.fill(NATIVE_SCALE_SPACE_Q24, 49 * 100, 50 * 100)
	const exactThin = analyzeNativeScaleSpaceThreshold(line, 100, 100, NATIVE_SCALE_SPACE_Q24 / 2)
	assert.equal(exactThin.componentCount, 1)
	assert.equal(exactThin.records[0].firstIndex, 4_900)
	assert.equal(exactThin.thinMass, 0.01)
	assert.deepEqual(exactThin.sideCoverage, [0, 0.01, 0, 0.01])
	const empty = analyzeNativeScaleSpaceThreshold(new Uint32Array([0]), 1, 1, NATIVE_SCALE_SPACE_Q24 / 2)
	assert.equal(empty.interiorEmpty, true)
	assert.equal(empty.boundaryDensity, 0)
	assert.equal(empty.componentCount, 0)
})

test("reuses one component scratch across field and pair metrics at native and smaller dimensions", () => {
	const split = availability("vertical-split").availability
	const dark = candidateForRgb(split, "D")
	const light = candidateForRgb(split, "L")
	const darkView = createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(split, dark.candidateId), split.width, split.height,
	)
	const lightView = createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(split, light.candidateId), split.width, split.height,
	)
	const scratch = createNativeScaleSpaceComponentScratch(darkView.values.length)
	assert.deepEqual(Object.keys(scratch).sort(), ["maximumPixels", "stack", "visited"])
	assert.equal(scratch.visited.constructor, Uint8Array)
	assert.equal(scratch.stack.constructor, Int32Array)
	scratch.visited.fill(1)
	scratch.stack.fill(-1)
	assert.deepEqual(evaluateNativeScaleSpaceFieldMetrics(darkView, scratch),
		evaluateNativeScaleSpaceFieldMetrics(darkView))

	const nativePair = {
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues: darkView.values,
		toValues: lightView.values,
		width: split.width,
		height: split.height,
	}
	assert.deepEqual(evaluateNativeScaleSpacePairMetrics(nativePair, scratch),
		evaluateNativeScaleSpacePairMetrics(nativePair))

	const smallFrom = new Uint32Array([
		NATIVE_SCALE_SPACE_Q24, NATIVE_SCALE_SPACE_Q24, 0, 0,
		NATIVE_SCALE_SPACE_Q24, 0, 0, NATIVE_SCALE_SPACE_Q24,
		0, 0, NATIVE_SCALE_SPACE_Q24, NATIVE_SCALE_SPACE_Q24,
	])
	const smallTo = new Uint32Array(smallFrom.length)
	for (let index = 0; index < smallTo.length; index++) smallTo[index] = NATIVE_SCALE_SPACE_Q24 - smallFrom[index]
	const smallView = createNativeScaleSpaceFieldView({ arm: "A", width: 4, height: 3, values: smallFrom })
	assert.deepEqual(evaluateNativeScaleSpaceFieldMetrics(smallView, scratch),
		evaluateNativeScaleSpaceFieldMetrics(smallView))
	const smallPair = { ...nativePair, fromValues: smallFrom, toValues: smallTo, width: 4, height: 3 }
	assert.deepEqual(evaluateNativeScaleSpacePairMetrics(smallPair, scratch),
		evaluateNativeScaleSpacePairMetrics(smallPair))

	const thresholdWithoutScratch = analyzeNativeScaleSpaceThreshold(smallFrom, 4, 3, NATIVE_SCALE_SPACE_Q24 / 2)
	const thresholdWithScratch = analyzeNativeScaleSpaceThreshold(smallFrom, 4, 3, NATIVE_SCALE_SPACE_Q24 / 2, scratch)
	assert.deepEqual(thresholdWithScratch, thresholdWithoutScratch)
	const insufficient = createNativeScaleSpaceComponentScratch(smallFrom.length - 1)
	assert.throws(() => evaluateNativeScaleSpaceFieldMetrics(smallView, insufficient), /scratch is insufficient/)
	assert.throws(() => evaluateNativeScaleSpacePairMetrics(smallPair, insufficient), /scratch is insufficient/)
	assert.throws(() => analyzeNativeScaleSpaceThreshold(smallFrom, 4, 3, NATIVE_SCALE_SPACE_Q24 / 2, insufficient),
		/scratch is insufficient/)
})

test("pair metrics query toValues once per cell and reuse one threshold-bit scratch plane", () => {
	const split = availability("vertical-split").availability
	const dark = candidateForRgb(split, "D")
	const light = candidateForRgb(split, "L")
	const fromValues = createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(split, dark.candidateId), split.width, split.height,
	).values
	const toValues = createNativeScaleSpaceAFieldView(
		fillNativeScaleSpaceCandidateMask(split, light.candidateId), split.width, split.height,
	).values
	const componentScratch = createNativeScaleSpaceComponentScratch(fromValues.length)
	const pairActiveScratch = new Uint8Array(fromValues.length + 7).fill(0xff)
	let suppliedCalls = 0
	const supplied = evaluateNativeScaleSpacePairMetrics({
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues,
		toValues: (index) => {
			suppliedCalls++
			return toValues[index]
		},
		width: split.width,
		height: split.height,
		pairActiveScratch,
	}, componentScratch)
	assert.equal(suppliedCalls, fromValues.length)
	assert.ok(pairActiveScratch.subarray(0, fromValues.length).every((bits) => bits === 0b111))
	assert.ok(pairActiveScratch.subarray(fromValues.length).every((bits) => bits === 0xff))
	assert.deepEqual(supplied, evaluateNativeScaleSpacePairMetrics({
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues,
		toValues,
		width: split.width,
		height: split.height,
	}))

	pairActiveScratch.fill(0xa5)
	let repeatedCalls = 0
	const repeated = evaluateNativeScaleSpacePairMetrics({
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues,
		toValues: (index) => {
			repeatedCalls++
			return toValues[index]
		},
		width: split.width,
		height: split.height,
		pairActiveScratch,
	}, componentScratch)
	assert.equal(repeatedCalls, fromValues.length)
	assert.deepEqual(repeated, supplied)

	let defaultCalls = 0
	const defaultScratch = evaluateNativeScaleSpacePairMetrics({
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues,
		toValues: (index) => {
			defaultCalls++
			return toValues[index]
		},
		width: split.width,
		height: split.height,
	})
	assert.equal(defaultCalls, fromValues.length)
	assert.deepEqual(defaultScratch, supplied)

	let insufficientCalls = 0
	assert.throws(() => evaluateNativeScaleSpacePairMetrics({
		availability: split,
		fromCandidateId: dark.candidateId,
		toCandidateId: light.candidateId,
		fromValues,
		toValues: (index) => {
			insufficientCalls++
			return toValues[index]
		},
		width: split.width,
		height: split.height,
		pairActiveScratch: new Uint8Array(fromValues.length - 1),
	}, componentScratch), /pair-active scratch is insufficient/)
	assert.equal(insufficientCalls, 0)
})

test("binary Arm A field, pair, and reconstruction APIs exactly equal materialized Q0.24 views", () => {
	const fieldIds = NATIVE_SCALE_SPACE_METRIC_DEFINITIONS
		.filter(({ id }) => id === "field.mass" || id === "detail.lowPassChange" ||
			id.startsWith("field.activeMass.") || id.startsWith("component.") || id.startsWith("field.broad.") ||
			id.startsWith("detail.boundaryDensity.") || id.startsWith("frame.") || id.startsWith("typography.thinMass."))
		.map(({ id }) => id)
		.sort()
	for (const entry of NATIVE_SCALE_SPACE_FIXTURE_MANIFEST.fixtures) {
		const { fixture, availability: frozen } = availability(entry.id)
		const componentScratch = createNativeScaleSpaceComponentScratch(frozen.candidateLabels.length)
		const pairActiveScratch = new Uint8Array(frozen.candidateLabels.length)
		const materializedReconstruction = createNativeScaleSpaceReconstructionAccumulator(fixture, frozen, "A")
		const binaryReconstruction = createNativeScaleSpaceReconstructionAccumulator(fixture, frozen, "A")
		for (const candidate of frozen.candidates) {
			const mask = fillNativeScaleSpaceCandidateMask(frozen, candidate.id)
			const materializedView = createNativeScaleSpaceAFieldView(mask, frozen.width, frozen.height)
			const materializedMetrics = evaluateNativeScaleSpaceFieldMetrics(materializedView, componentScratch)
			const binaryMetrics = evaluateNativeScaleSpaceBinaryFieldMetrics(mask, frozen.width, frozen.height, componentScratch)
			assert.deepEqual(binaryMetrics, materializedMetrics)
			assert.equal(canonicalJson(binaryMetrics), canonicalJson(materializedMetrics))
			assert.deepEqual(Object.keys(binaryMetrics).sort(), fieldIds)
			assert.ok(Object.values(binaryMetrics).every((value) => !ArrayBuffer.isView(value)))
			accumulateNativeScaleSpaceReconstructionCandidate(materializedReconstruction, candidate.id, materializedView)
			assert.equal(accumulateNativeScaleSpaceReconstructionBinaryCandidate(
				binaryReconstruction, candidate.id, mask, frozen.width, frozen.height,
			), undefined)
		}
		assert.deepEqual(finalizeNativeScaleSpaceReconstruction(binaryReconstruction),
			finalizeNativeScaleSpaceReconstruction(materializedReconstruction))

		if (frozen.candidates.length >= 2) {
			const fromCandidateId = frozen.candidates[0].id
			const toCandidateId = frozen.candidates[1].id
			const fromValues = createNativeScaleSpaceAFieldView(
				fillNativeScaleSpaceCandidateMask(frozen, fromCandidateId), frozen.width, frozen.height,
			).values
			const toValues = createNativeScaleSpaceAFieldView(
				fillNativeScaleSpaceCandidateMask(frozen, toCandidateId), frozen.width, frozen.height,
			).values
			const materializedPair = evaluateNativeScaleSpacePairMetrics({
				availability: frozen,
				fromCandidateId,
				toCandidateId,
				fromValues,
				toValues,
				width: frozen.width,
				height: frozen.height,
				pairActiveScratch,
			}, componentScratch)
			const binaryPair = evaluateNativeScaleSpaceBinaryPairMetrics({
				availability: frozen, fromCandidateId, toCandidateId,
			}, componentScratch, pairActiveScratch)
			assert.deepEqual(binaryPair, materializedPair)
			assert.equal(canonicalJson(binaryPair), canonicalJson(materializedPair))
			assert.ok(Object.values(binaryPair).every((value) => !ArrayBuffer.isView(value)))
		}
	}
})

test("binary Arm A APIs reject invalid masks and insufficient reusable scratch", () => {
	const { fixture, availability: frozen } = availability("vertical-split")
	const mask = fillNativeScaleSpaceCandidateMask(frozen, frozen.candidates[0].id)
	const insufficientComponents = createNativeScaleSpaceComponentScratch(mask.length - 1)
	assert.throws(() => evaluateNativeScaleSpaceBinaryFieldMetrics(
		mask, frozen.width, frozen.height, insufficientComponents,
	), /scratch is insufficient/)
	assert.throws(() => evaluateNativeScaleSpaceBinaryPairMetrics({
		availability: frozen,
		fromCandidateId: frozen.candidates[0].id,
		toCandidateId: frozen.candidates[1].id,
	}, insufficientComponents), /scratch is insufficient/)
	const componentScratch = createNativeScaleSpaceComponentScratch(mask.length)
	assert.throws(() => evaluateNativeScaleSpaceBinaryPairMetrics({
		availability: frozen,
		fromCandidateId: frozen.candidates[0].id,
		toCandidateId: frozen.candidates[1].id,
	}, componentScratch, new Uint8Array(mask.length - 1)), /pair-active scratch is insufficient/)
	const invalidMask = mask.slice()
	invalidMask[0] = 2
	assert.throws(() => evaluateNativeScaleSpaceBinaryFieldMetrics(invalidMask, frozen.width, frozen.height, componentScratch),
		/binary mask values/)
	const accumulator = createNativeScaleSpaceReconstructionAccumulator(fixture, frozen, "A")
	assert.throws(() => accumulateNativeScaleSpaceReconstructionBinaryCandidate(
		accumulator, frozen.candidates[0].id, mask, frozen.width - 1, frozen.height,
	), /mask length/)
})

test("evaluates every registry metric as finite, structural, or declared null without extra IDs", () => {
	const { fixture, availability: frozen } = availability("vertical-split")
	const dark = candidateForRgb(frozen, "D")
	const light = candidateForRgb(frozen, "L")
	const darkMask = fillNativeScaleSpaceCandidateMask(frozen, dark.candidateId)
	const lightMask = fillNativeScaleSpaceCandidateMask(frozen, light.candidateId)
	const darkView = createNativeScaleSpaceAFieldView(darkMask, frozen.width, frozen.height)
	const lightView = createNativeScaleSpaceAFieldView(lightMask, frozen.width, frozen.height)
	const records = [
		evaluateNativeScaleSpaceFieldMetrics(darkView),
		evaluateNativeScaleSpaceGraphMetrics(frozen),
		evaluateNativeScaleSpacePairMetrics({
			availability: frozen,
			fromCandidateId: dark.candidateId,
			toCandidateId: light.candidateId,
			fromValues: darkView.values,
			toValues: lightView.values,
			width: frozen.width,
			height: frozen.height,
		}),
	]

	const reconstruction = createNativeScaleSpaceReconstructionAccumulator(fixture, frozen, "A")
	const tieView = createNativeScaleSpaceFieldView({
		arm: "A", width: frozen.width, height: frozen.height, values: new Uint32Array(frozen.width * frozen.height),
	})
	for (const candidate of frozen.candidates) accumulateNativeScaleSpaceReconstructionCandidate(reconstruction, candidate.id, tieView)
	const reconstructionResult = finalizeNativeScaleSpaceReconstruction(reconstruction)
	records.push(reconstructionResult.metrics)
	const lowerKey = frozen.candidates.map(({ stableKey }) => stableKey).sort()[0]
	assert.ok(reconstructionResult.winningStableKeys.every((key) => key === lowerKey))
	assert.ok(reconstructionResult.tieCounts.every((count) => count === frozen.candidates.length))

	const residual = createQ24PartitionResidualAccumulator(darkView.values.length, 2)
	accumulateQ24PartitionPlane(residual, darkView.values)
	accumulateQ24PartitionPlane(residual, lightView.values)
	records.push(evaluateNativeScaleSpacePartitionStabilityMetrics(finalizeQ24PartitionResidual(residual)))
	const samples = sampleQ24PlaneAtTargetCenters(darkView.values, frozen.width, frozen.height, 8, 6)
	records.push(evaluateNativeScaleSpaceBcSampleStabilityMetrics(darkView.values, frozen.width, frozen.height, samples))

	const parent = new Uint32Array([100, 200, 300, 400])
	const transformed = new Uint32Array([200, 100, 400, 300])
	records.push(evaluateNativeScaleSpaceTransformBStabilityMetrics({
		parentValues: parent, parentWidth: 2, parentHeight: 2, transformedValues: transformed, transformId: "reflect-horizontal",
	}))
	records.push(evaluateNativeScaleSpaceTransformCStabilityMetrics({
		parentBValues: parent,
		parentWidth: 2,
		parentHeight: 2,
		transformedCValues: new Uint32Array([200, 300]),
		transformedCSourceIndices: new Uint32Array([0, 3]),
		transformedWidth: 2,
		transformedHeight: 1,
		transformId: "reflect-horizontal",
	}))

	const observed = new Set<string>()
	for (const record of records) {
		assert.equal(assertNativeScaleSpaceMetricRecord(record), true)
		for (const id of Object.keys(record)) observed.add(id)
	}
	assert.deepEqual([...observed].sort(), NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.map(({ id }) => id).sort())
	assert.throws(() => assertNativeScaleSpaceMetricRecord({ "unregistered.metric": 1 }), /unregistered/)
})

test("generates all ten exact fixture byte streams and identities", () => {
	assert.deepEqual(NATIVE_SCALE_SPACE_FIXTURE_BYTE_SHA256, {
		"uniform-d": "013b17346934c64de7d7f8c0a2644e5c70b037b8ea13c2b1799c9d241b7999ac",
		"vertical-split": "8e88638699c24102b14b3a43e6ecb729b57c7e79fba4dfd1b2483ef343720bd1",
		"checker-1px": "440b2a73a12c16544f179b62f71dbbf102ddc987ebccca7c589689f2ff879790",
		"interior-specks": "6822931eb115a97d41e5b0d7e21bf9e0110823e11219aefcffdfbba7d205468e",
		"frame-interior": "d37172dc97b1636b31b876ef8735a45001d6cf3fcd850d6b151b0a7d99e53b00",
		"thin-line": "07098cd0b826053f408228569e533f48a1d2c232ada1b78d50c866e2e76ec2d7",
		"broad-ramp": "026618db20dc3237b4498594a99e6136571133cccb7aae59f20ae917c4c7f0da",
		"local-ramp": "058c55fc46c732571b4e1495bdd73502929aaaa0a439f98d499df60db13d5302",
		"subtle-ramp": "aa39b5eaa4641e40ccad5cea56288c31f0d6e074c51dc7be6c0a18640a160041",
		"seeded-noise": "6f02d77b6a4451cbd1c99768b84b504b9909564d7b04b1286400031748cc909b",
	})
	assert.deepEqual(NATIVE_SCALE_SPACE_FIXTURE_IDENTITIES, {
		"uniform-d": "b8edc4afc42b2684f906cd3824c50ec005985f18ccbb8b92efbf74acd8573763",
		"vertical-split": "4203c9c2b5cc22c0e541ef5cd39c15db339723efecb534c439eccf4d9c8fc65b",
		"checker-1px": "d4fcdc950e2a6f96c62c46ae5490bd4ecf4ba1069cc72f1b8adb9ae98c9f5146",
		"interior-specks": "e61313980e4412a26d32a219429d5de5a1784e6dcf4e4bcfb1f1ed8a117f7ff6",
		"frame-interior": "1ac09692d607f88f0c66e0d78fc5222a1eb82b7cbd06d9d0f867f6e067f40507",
		"thin-line": "7c8caab139acc17c40a7ebea55e8748d990556ef3c6df8f5c5379be0bce1cbfd",
		"broad-ramp": "5597251b72696cd55d0d6220c11113313eef5cdb673ccf7459c35a8fc11ad274",
		"local-ramp": "879b3b64663bd0f8fed8bcf635e579e1fe80a3fb3a9f4f092ad92255bb63ed35",
		"subtle-ramp": "0bf1cb3485b515d9e9c940c945bd77cefa6a4e86b1838b9315240908f6bd0d73",
		"seeded-noise": "07c093a3e1a267ab69c89e3f4a78ed10c69235d318ee728e2974700945717fdd",
	})
	assert.equal(NATIVE_SCALE_SPACE_FIXTURE_MANIFEST.fixtures.length, 10)
	for (const entry of NATIVE_SCALE_SPACE_FIXTURE_MANIFEST.fixtures) {
		const first = createNativeScaleSpaceFixture(entry.id)
		const second = createNativeScaleSpaceFixture(entry.id)
		assert.deepEqual(first.data, second.data)
		assert.equal(first.identity, NATIVE_SCALE_SPACE_FIXTURE_IDENTITIES[entry.id])
		assert.equal(first.bytesSha256, NATIVE_SCALE_SPACE_FIXTURE_BYTE_SHA256[entry.id])
	}
	const split = createNativeScaleSpaceFixture("vertical-split")
	assert.deepEqual(Array.from(split.data.subarray(15 * 3, 17 * 3)), [...NATIVE_SCALE_SPACE_FIXTURE_RGB.D, ...NATIVE_SCALE_SPACE_FIXTURE_RGB.L])
})

test("applies all transforms, exact inverse maps, and nearest-2x child correspondence", () => {
	const fixture = createNativeScaleSpaceFixture("vertical-split")
	assert.deepEqual(NATIVE_SCALE_SPACE_TRANSFORMS.map(({ id }) => id),
		["identity", "nearest-2x", "reflect-horizontal", "rotate-180", "rotate-90-clockwise"])
	const identities = new Set<string>()
	for (const { id } of NATIVE_SCALE_SPACE_TRANSFORMS) {
		const transformed = transformNativeScaleSpaceFixture(fixture, id)
		const dimensions = nativeScaleSpaceTransformDimensions(fixture.width, fixture.height, id)
		assert.deepEqual({ width: transformed.width, height: transformed.height }, dimensions)
		assert.equal(transformed.identity, createNativeScaleSpaceTransformIdentity(fixture.identity, id))
		identities.add(transformed.identity)
		for (const [x, y] of [[0, 0], [transformed.width - 1, transformed.height - 1]] as const) {
			const source = nativeScaleSpaceInverseTransformCoordinate(id, x, y, fixture.width, fixture.height)
			const sourceOffset = (source.y * fixture.width + source.x) * 3
			const outputOffset = (y * transformed.width + x) * 3
			assert.deepEqual(transformed.data.subarray(outputOffset, outputOffset + 3), fixture.data.subarray(sourceOffset, sourceOffset + 3))
		}
	}
	assert.equal(identities.size, 5)

	const mask = new Uint8Array(fixture.width * fixture.height)
	for (let index = 0; index < mask.length; index++) mask[index] = index % 7 === 0 ? 1 : 0
	for (const { id } of NATIVE_SCALE_SPACE_TRANSFORMS) {
		const transformed = transformNativeScaleSpaceBinaryMask(mask, fixture.width, fixture.height, id)
		assert.deepEqual(inverseMapNativeScaleSpaceBinaryMask(transformed.mask, fixture.width, fixture.height, id), mask)
		if (id === "nearest-2x") {
			const invalid = transformed.mask.slice()
			invalid[1] ^= 1
			assert.throws(() => inverseMapNativeScaleSpaceBinaryMask(invalid, fixture.width, fixture.height, id), /child mask values/)
		}
	}
	const broad = createNativeScaleSpaceFixture("broad-ramp")
	const broadParent = createNativeScaleSpaceAvailability(broad, {
		sourceSha256: broad.bytesSha256, decodedNativeIdentity: broad.identity,
	})
	const reflected = transformNativeScaleSpaceFixture(broad, "reflect-horizontal")
	const broadReflected = createNativeScaleSpaceAvailability(reflected, {
		sourceSha256: reflected.bytesSha256, decodedNativeIdentity: reflected.identity,
	})
	const correspondence = matchNativeScaleSpaceTransformedCandidates(broadParent, broadReflected, "reflect-horizontal")
	assert.equal(correspondence.length, broadParent.candidates.length)
	assert.ok(correspondence.every(({ applicable }) => applicable))
})

test("resolves exact operand tuples and enforces the seven-predicate disposition precedence", () => {
	const metricIds = new Set(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.map(({ id }) => id))
	const tupleKeys = ["applicability", "arm", "candidateSelectors", "fixtureId", "metricIds", "orderedEndpoint", "resolvedCandidateKeys", "target", "thresholdQ24", "transformId"]
	assert.equal(NATIVE_SCALE_SPACE_EXPECTATIONS.scientificPredicates.length, 7)
	assert.deepEqual(NATIVE_SCALE_SPACE_EXPECTATIONS.targetMatrix, [
		{ kind: "max-edge", value: 8 },
		{ kind: "max-edge", value: 16 },
		{ kind: "pixel-budget", value: 64 },
		{ kind: "pixel-budget", value: 256 },
	])
	for (const predicate of NATIVE_SCALE_SPACE_EXPECTATIONS.scientificPredicates) {
		assert.equal(predicate.required, true)
		for (const operand of predicate.operands) {
			assert.deepEqual(Object.keys(operand).sort(), tupleKeys)
			assert.equal(operand.thresholdQ24, NATIVE_SCALE_SPACE_Q24 / 2)
			assert.ok(operand.metricIds.every((id) => metricIds.has(id)))
		}
	}
	const split = availability("vertical-split").availability
	const splitTuple = NATIVE_SCALE_SPACE_EXPECTATIONS.scientificPredicates
		.find(({ id }) => id === "splitRetained")?.operands[0]
	assert.ok(splitTuple)
	const resolved = resolveNativeScaleSpaceOperandTuple(splitTuple, split)
	assert.equal(resolved.applicable, true)
	assert.equal(resolved.tuple.resolvedCandidateKeys.length, 2)
	assert.notEqual(resolved.resolvedOrderedEndpoint?.from.stableKey, resolved.resolvedOrderedEndpoint?.to.stableKey)

	const predicates = evaluateNativeScaleSpaceScientificPredicates()
	assert.deepEqual(predicates.map(({ id }) => id), [
		"uniformInvariantSubset", "checkerAttenuated", "splitRetained", "geometryDistinguished",
		"broadBeatsLocal", "frameDistinguished", "thinIdentityRetained",
	])
	assert.ok(predicates.every(({ applicable, passed }) => applicable && passed === true))
	assert.equal(nativeScaleSpaceFixtureDisposition(false, predicates), "invalid-structural")
	assert.equal(nativeScaleSpaceFixtureDisposition(true, predicates), "valid-fixture-supported-diagnostic")
	assert.equal(nativeScaleSpaceFixtureDisposition(true, predicates.map((predicate, index) => index === 0 ? { ...predicate, passed: false } : predicate)),
		"valid-fixture-falsified")
	assert.equal(nativeScaleSpaceFixtureDisposition(true, predicates.map((predicate, index) => index === 0 ? { ...predicate, applicable: false, passed: null } : predicate)),
		"valid-fixture-unsupported")
})

test("reduces signed transform deltas with exact Int32 hashes and decimal sums", () => {
	const parent = new Uint32Array([100, 200, 300, 400])
	const transformed = new Uint32Array([201, 98, 400, 305])
	const b = computeNativeScaleSpaceTransformBDeltaQ24({
		parentValues: parent,
		parentWidth: 2,
		parentHeight: 2,
		transformedValues: transformed,
		transformId: "reflect-horizontal",
	})
	assert.deepEqual(Array.from(b.values), [1, -2, 0, 5])
	assert.equal(b.minimum, -2)
	assert.equal(b.maximum, 5)
	assert.equal(b.sumDecimal, "4")
	assert.equal(b.meanAbsolute, 2)
	assert.equal(b.typedSha256, canonicalTypedArrayHash(new Int32Array([1, -2, 0, 5]), [2, 2]))
	assert.deepEqual(computeNativeScaleSpaceTransformBDeltaQ24({
		parentValues: parent,
		parentWidth: 2,
		parentHeight: 2,
		transformedValues: (index) => transformed[index],
		transformId: "reflect-horizontal",
	}).values, b.values)

	const c = computeNativeScaleSpaceTransformCToParentBDeltaQ24({
		parentBValues: parent,
		parentWidth: 2,
		parentHeight: 2,
		transformedCValues: new Uint32Array([201, 305]),
		transformedCSourceIndices: new Uint32Array([0, 3]),
		transformedWidth: 2,
		transformedHeight: 1,
		transformId: "reflect-horizontal",
	})
	assert.deepEqual(Array.from(c.values), [1, 5])
	assert.equal(c.sumDecimal, "6")
	assert.equal(c.meanAbsolute, 3)
	assert.deepEqual(reduceNativeScaleSpaceTransformDelta(new Int32Array([-3, 0, 7])), {
		values: new Int32Array([-3, 0, 7]),
		typedSha256: canonicalTypedArrayHash(new Int32Array([-3, 0, 7])),
		minimum: -3,
		maximum: 7,
		sumDecimal: "4",
		meanAbsolute: 10 / 3,
	})
})

test("fixture controls implement the exact 1,220-row matrix with registered phase diagnostics", () => {
	const rows = evaluateNativeScaleSpaceFixtureStructuralRows()
	assert.equal(rows.length, 1_220)
	assert.deepEqual(Object.fromEntries([
		"source-bytes",
		"native-transform",
		"filter-recompute",
		"sample-recompute",
		"phase-diagnostics",
		"deterministic-rerun",
	].map((matrixId) => [matrixId, rows.filter((row) => row.matrixId === matrixId).length])), {
		"source-bytes": 10,
		"native-transform": 40,
		"filter-recompute": 200,
		"sample-recompute": 200,
		"phase-diagnostics": 320,
		"deterministic-rerun": 450,
	})
	assert.ok(rows.every(({ passed }) => passed))
	assert.ok(rows.filter(({ matrixId }) => matrixId === "native-transform")
		.every(({ transformId, arm, target, diagnostic }) => transformId !== "identity" && arm === "A" && target === null &&
			diagnostic.transformedBytesExact === true))
	assert.equal(rows.filter(({ matrixId, arm }) => matrixId === "deterministic-rerun" && arm === "A").length, 50)
	assert.equal(rows.filter(({ matrixId, arm }) => matrixId === "deterministic-rerun" && arm === "B").length, 200)
	assert.equal(rows.filter(({ matrixId, arm }) => matrixId === "deterministic-rerun" && arm === "C").length, 200)

	const phaseRows = rows.filter(({ matrixId }) => matrixId === "phase-diagnostics")
	const phaseDiagnostics = phaseRows.flatMap((row) => row.diagnostic.candidates as Array<{
		metricId: string
		applicable: boolean
		inapplicableReason: string | null
		reduction: null | { typedSha256: string; length: number; minimum: number; maximum: number; sumDecimal: string; meanAbsolute: number }
	}>)
	assert.ok(phaseDiagnostics.length > phaseRows.length)
	assert.ok(phaseDiagnostics.every(({ metricId }) =>
		metricId === "stability.transformBDeltaQ24" || metricId === "stability.transformCToParentBDeltaQ24"))
	assert.ok(phaseDiagnostics.every(({ metricId }) =>
		NATIVE_SCALE_SPACE_METRIC_DEFINITIONS.some(({ id }) => id === metricId)))
	assert.ok(phaseDiagnostics.every(({ applicable, inapplicableReason, reduction }) => applicable
		? inapplicableReason === null && reduction !== null && /^[0-9a-f]{64}$/.test(reduction.typedSha256) &&
			reduction.length > 0 && Number.isFinite(reduction.minimum) && Number.isFinite(reduction.maximum) &&
			/^-?\d+$/.test(reduction.sumDecimal) && Number.isFinite(reduction.meanAbsolute)
		: inapplicableReason !== null && reduction === null))
	assert.ok(phaseDiagnostics.some(({ reduction }) => reduction !== null && (reduction.minimum !== 0 || reduction.maximum !== 0)))
	assert.ok(rows.filter(({ matrixId }) => matrixId === "filter-recompute")
		.every((row) => Number(row.diagnostic.candidateCount) > 0 && Number(row.diagnostic.partitionMaximumAbsolute) >= 0))
	assert.ok(rows.filter(({ matrixId }) => matrixId === "sample-recompute")
		.every((row) => /^[0-9a-f]{64}$/.test(String(row.diagnostic.sourceIndicesSha256))))

	const first = availability("seeded-noise").availability
	const second = availability("seeded-noise").availability
	assert.equal(assertNativeScaleSpaceAvailabilityFrozen(first, second), true)
	assert.deepEqual(first.candidateLabels, second.candidateLabels)
	assert.deepEqual(first.candidates, second.candidates)
	assert.deepEqual(first.families, second.families)
})
