import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import {
	analyzeResolutionEvidence,
	candidateAnalysisRGBAt,
	candidateRGBAt,
	canonicalResolutionEvidenceTypedArrayHash,
	reconstructResolutionEvidenceCandidates,
	RESOLUTION_EVIDENCE_BIN_CAPACITY,
	RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
	RESOLUTION_EVIDENCE_POLICY,
	RESOLUTION_EVIDENCE_POLICY_SHA256,
	resolutionEvidenceBinKey,
	resolutionEvidenceCandidatePalette,
	resolutionEvidenceRetainedArrayBytes,
	summarizeResolutionEvidence,
} from "../src/resolution-evidence.ts"
import type { RawImage, RGB } from "../src/types.ts"

function image(width: number, height: number, at: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const rgb = at(x, y)
			const offset = (y * width + x) * 3
			data[offset] = rgb[0]
			data[offset + 1] = rgb[1]
			data[offset + 2] = rgb[2]
		}
	}
	return { width, height, data }
}

function candidateForRGB(frame: ReturnType<typeof analyzeResolutionEvidence>, rgb: RGB): number {
	for (let candidate = 0; candidate < frame.candidates.count; candidate++) {
		if (candidateRGBAt(frame, candidate, "native-witness")?.every((channel, index) => channel === rgb[index])) {
			return candidate
		}
	}
	throw new Error(`Missing candidate ${rgb.join(",")}`)
}

function analysisCandidateForRGB(frame: ReturnType<typeof analyzeResolutionEvidence>, rgb: RGB): number {
	for (let candidate = 0; candidate < frame.candidates.count; candidate++) {
		if (candidateAnalysisRGBAt(frame, candidate)?.every((channel, index) => channel === rgb[index])) return candidate
	}
	throw new Error(`Missing analysis candidate ${rgb.join(",")}`)
}

function assertPartition(labels: Uint8Array, counts: Uint32Array, count: number): void {
	const observed = new Uint32Array(count)
	for (const label of labels) {
		assert.ok(label < count)
		observed[label]++
	}
	assert.deepEqual(observed, counts)
	assert.equal(observed.reduce((sum, value) => sum + value, 0), labels.length)
}

function ramp(width: number, height: number, local: boolean): RawImage {
	const first = rgbToOKLab([18, 36, 76])
	const second = rgbToOKLab([230, 178, 88])
	return image(width, height, (x, y) => {
		if (local && (x < width / 4 || x >= width * 3 / 4 || y < height / 4 || y >= height * 3 / 4)) {
			return (x + y) % 2 === 0 ? [25, 180, 80] : [185, 25, 150]
		}
		const start = local ? width / 4 : 0
		const span = local ? width / 2 - 1 : width - 1
		return oklabToRGB(mixOKLab(first, second, (x - start) / span))
	})
}

test("exact bins preserve equal histograms while spatial evidence preserves geometry", () => {
	const dark: RGB = [22, 30, 45]
	const light: RGB = [228, 188, 92]
	const width = 32
	const height = 32
	const split = image(width, height, (x) => x < width / 2 ? dark : light)
	const checker = image(width, height, (x, y) => (x + y) % 2 === 0 ? dark : light)
	const splitFrame = analyzeResolutionEvidence(split, split)
	const checkerFrame = analyzeResolutionEvidence(checker, checker)

	assert.equal(splitFrame.occupiedBinCount, 2)
	assert.equal(checkerFrame.occupiedBinCount, 2)
	assert.deepEqual(
		Array.from(splitFrame.bins.counts).filter(Boolean).sort((first, second) => first - second),
		Array.from(checkerFrame.bins.counts).filter(Boolean).sort((first, second) => first - second),
	)
	const splitDark = candidateForRGB(splitFrame, dark)
	const checkerDark = candidateForRGB(checkerFrame, dark)
	assert.equal(splitFrame.candidates.population[splitDark], checkerFrame.candidates.population[checkerDark])
	assert.ok(splitFrame.candidates.componentCounts[splitDark] < checkerFrame.candidates.componentCounts[checkerDark])
	assert.ok(splitFrame.candidates.edgeDetail[splitDark] < checkerFrame.candidates.edgeDetail[checkerDark])

	for (let pixel = 0; pixel < splitFrame.pixelBinIds.length; pixel++) {
		const offset = pixel * 3
		const lab = rgbToOKLab([split.data[offset], split.data[offset + 1], split.data[offset + 2]])
		assert.equal(splitFrame.pixelBinIds[pixel], resolutionEvidenceBinKey(lab[0], lab[1], lab[2]))
	}
	assert.equal(splitFrame.bins.counts.length, RESOLUTION_EVIDENCE_BIN_CAPACITY)
	assert.equal(splitFrame.bins.sumLightness.length, RESOLUTION_EVIDENCE_BIN_CAPACITY)
	assert.equal(splitFrame.bins.detailSum.length, RESOLUTION_EVIDENCE_BIN_CAPACITY)
})

test("connected field evidence differs from an equal-population set of isolated specks", () => {
	const background: RGB = [20, 24, 32]
	const field: RGB = [210, 62, 45]
	const width = 40
	const height = 40
	const connected = image(width, height, (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30 ? field : background)
	const specks = image(width, height, (x, y) => x % 2 === 0 && y % 2 === 0 ? field : background)
	const connectedFrame = analyzeResolutionEvidence(connected, connected)
	const speckFrame = analyzeResolutionEvidence(specks, specks)
	const connectedId = candidateForRGB(connectedFrame, field)
	const speckId = candidateForRGB(speckFrame, field)

	assert.equal(connectedFrame.candidates.pixelCounts[connectedId], speckFrame.candidates.pixelCounts[speckId])
	assert.equal(connectedFrame.candidates.componentCounts[connectedId], 1)
	assert.ok(speckFrame.candidates.componentCounts[speckId] > 100)
	assert.ok(connectedFrame.candidates.largestComponentPopulation[connectedId] >
		speckFrame.candidates.largestComponentPopulation[speckId] * 100)
	assert.ok(connectedFrame.candidates.fieldBroad[connectedId] > speckFrame.candidates.fieldBroad[speckId])
	const connectedHistogram = connectedFrame.candidates.componentAreaHistogram.subarray(
		connectedId * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
		(connectedId + 1) * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
	)
	const speckHistogram = speckFrame.candidates.componentAreaHistogram.subarray(
		speckId * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
		(speckId + 1) * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
	)
	assert.equal(connectedHistogram[8], 1)
	assert.equal(speckHistogram[0], 400)
	assert.equal(connectedHistogram.reduce((sum, count) => sum + count, 0), 1)
	assert.equal(speckHistogram.reduce((sum, count) => sum + count, 0), 400)
	assert.equal(connectedFrame.candidates.borderTouchingComponentCounts[connectedId], 0)
	assert.ok(speckFrame.candidates.borderTouchingComponentCounts[speckId] > 0)
	assert.equal(connectedFrame.candidates.thinComponentCounts[connectedId], 0)
	assert.equal(speckFrame.candidates.thinComponentCounts[speckId], 400)
	assert.notDeepEqual(
		connectedFrame.candidates.componentSignatureSha256.subarray(connectedId * 32, connectedId * 32 + 32),
		speckFrame.candidates.componentSignatureSha256.subarray(speckId * 32, speckId * 32 + 32),
	)
})

test("broad progression is retained while a local ramp loses common-domain relation coverage", () => {
	const broad = analyzeResolutionEvidence(ramp(64, 48, false), ramp(64, 48, false))
	const localImage = ramp(64, 48, true)
	const local = analyzeResolutionEvidence(localImage, localImage)
	const broadCoverage = Math.max(0, ...broad.relations.coverage)
	const localCoverage = Math.max(0, ...local.relations.coverage)
	const broadContinuity = Math.max(0, ...broad.relations.middleContinuity)

	assert.ok(broad.relations.count > 0)
	assert.ok(broadCoverage > localCoverage + 0.2)
	assert.ok(broadContinuity > 0.8)
	assert.ok(Math.max(0, ...broad.relations.coarseSpatialProgression) > 0.5)
})

test("one-dimensional ramps use the nonsingular progression axis", () => {
	const source = ramp(64, 1, false)
	const frame = analyzeResolutionEvidence(source, source)

	assert.ok(frame.relations.count > 0)
	assert.ok(Math.max(...frame.relations.coarseSpatialProgression) > 0.9)
})

test("thin lines remain candidates with component and typography evidence", () => {
	const background: RGB = [15, 18, 24]
	const line: RGB = [245, 242, 226]
	const source = image(64, 64, (_x, y) => y === 31 ? line : background)
	const frame = analyzeResolutionEvidence(source, source)
	const id = candidateForRGB(frame, line)

	assert.equal(frame.candidates.pixelCounts[id], 64)
	assert.equal(frame.candidates.componentCounts[id], 1)
	assert.equal(frame.candidates.thinComponentCounts[id], 1)
	assert.equal(frame.candidates.componentAreaHistogram[id * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS + 6], 1)
	assert.equal(frame.candidates.thinComponentSupport[id], 1)
	assert.ok(frame.candidates.typographySupport[id] > 0.5)
	assert.ok(resolutionEvidenceCandidatePalette(frame, "native-witness")
		.some((rgb) => rgb.every((channel, index) => channel === line[index])))
})

test("thin-component detail uses local pixels rather than its color bin average", () => {
	const background: RGB = [8, 12, 20]
	const target: RGB = [244, 236, 210]
	const source = image(12, 12, (x, y) => {
		if (x >= 2 && x < 6 && y >= 2 && y < 6) return target
		if (x === 9 && y === 9) return target
		return background
	})
	const frame = analyzeResolutionEvidence(source, source)
	const id = candidateForRGB(frame, target)

	assert.equal(frame.candidates.pixelCounts[id], 17)
	assert.equal(frame.candidates.componentCounts[id], 2)
	assert.equal(frame.candidates.thinComponentSupport[id], 1 / 17)
	assert.ok(Math.abs(frame.candidates.typographySupport[id] - 1 / 17) < 1e-7)
})

test("frame contact and interior ownership remain separate evidence", () => {
	const background: RGB = [28, 31, 38]
	const frameColor: RGB = [225, 55, 42]
	const interiorColor: RGB = [45, 190, 105]
	const source = image(32, 32, (x, y) => {
		if (x === 0 || y === 0 || x === 31 || y === 31) return frameColor
		if (x >= 10 && x < 21 && y >= 10 && y < 21) return interiorColor
		return background
	})
	const evidence = analyzeResolutionEvidence(source, source)
	const frameId = candidateForRGB(evidence, frameColor)
	const interiorId = candidateForRGB(evidence, interiorColor)

	assert.ok(evidence.candidates.borderFrame[frameId] > evidence.candidates.borderFrame[interiorId])
	assert.equal(evidence.candidates.interiorOwnership[frameId], 0)
	assert.ok(evidence.candidates.interiorOwnership[interiorId] > 0)
	assert.ok(evidence.candidates.sideCoverage[frameId * 4] > 0.9)
})

test("native witnesses minimize distance inside the mapped analysis source-cell footprint", () => {
	const analysisRgb: RGB = [90, 100, 110]
	const analysis = image(1, 1, () => analysisRgb)
	const native = image(4, 4, () => [245, 12, 210])
	native.data.set(analysisRgb, 14 * 3)
	const frame = analyzeResolutionEvidence(analysis, native)
	const summary = summarizeResolutionEvidence(frame)

	assert.equal(frame.candidates.count, 1)
	assert.equal(frame.candidates.analysisRepresentativeIndices[0], 0)
	assert.deepEqual(candidateAnalysisRGBAt(frame, 0), analysisRgb)
	assert.deepEqual(Array.from(frame.candidates.analysisRepresentativeLab), rgbToOKLab(analysisRgb))
	assert.equal(frame.candidates.nativeWitnessIndices[0], 14)
	assert.equal(frame.candidates.nativeWitnessDistance[0], 0)
	assert.deepEqual(Array.from(frame.candidates.nativeWitnessFootprintStartX), [0])
	assert.deepEqual(Array.from(frame.candidates.nativeWitnessFootprintEndX), [4])
	assert.deepEqual(Array.from(frame.candidates.nativeWitnessFootprintStartY), [0])
	assert.deepEqual(Array.from(frame.candidates.nativeWitnessFootprintEndY), [4])
	assert.deepEqual(candidateRGBAt(frame, 0, "native-witness"), analysisRgb)
	assert.deepEqual(reconstructResolutionEvidenceCandidates(frame, "native-witness").data.subarray(0, 3),
		native.data.subarray(42, 45))
	assert.deepEqual(summary.candidates[0].analysisRgb, analysisRgb)
	assert.deepEqual(summary.candidates[0].nativeWitnessRgb, analysisRgb)
	assert.equal(summary.candidates[0].nativeWitnessIndex, 14)
	assert.equal(summary.candidates[0].nativeWitnessDistance, 0)
	assert.equal(frame.candidates.analysisRepresentativeNativeExact[0], 1)
})

test("exact native availability is independent of witness existence and palette mode", () => {
	const analysisRgb: RGB = [90, 100, 110]
	const witnessRgb: RGB = [91, 100, 110]
	const analysis = image(1, 1, () => analysisRgb)
	const native = image(2, 2, () => [240, 20, 190])
	native.data.set(witnessRgb, 3 * 3)
	const frame = analyzeResolutionEvidence(analysis, native)
	const summary = summarizeResolutionEvidence(frame)

	assert.equal(frame.candidates.analysisRepresentativeNativeExact[0], 0)
	assert.equal(frame.invariants.analysisRepresentativeNativeMembershipVerified, true)
	assert.equal(frame.invariants.nativeWitnessesExist, true)
	assert.equal(frame.candidates.nativeWitnessIndices[0], 3)
	assert.deepEqual(resolutionEvidenceCandidatePalette(frame, "analysis"), [analysisRgb])
	assert.deepEqual(resolutionEvidenceCandidatePalette(frame, "native-witness"), [witnessRgb])
	assert.deepEqual(candidateRGBAt(frame, 0, "analysis"), analysisRgb)
	assert.deepEqual(candidateRGBAt(frame, 0, "native-witness"), witnessRgb)
	assert.deepEqual(Array.from(reconstructResolutionEvidenceCandidates(frame, "analysis").data), analysisRgb)
	assert.deepEqual(Array.from(reconstructResolutionEvidenceCandidates(frame, "native-witness").data), witnessRgb)
	assert.throws(() => resolutionEvidenceCandidatePalette(frame, undefined as never), /palette mode/)
	assert.throws(() => reconstructResolutionEvidenceCandidates(frame, undefined as never), /palette mode/)
	assert.equal(summary.candidates[0].analysisRepresentativeNativeExact, false)
})

test("duplicate unrelated-native witnesses do not collapse analysis identities or geometry", () => {
	const first: RGB = [18, 35, 78]
	const second: RGB = [232, 174, 82]
	const analysis = image(16, 8, (x) => x < 8 ? first : second)
	const unrelatedNative = image(16, 8, () => [7, 201, 143])
	const nativeMatched = analyzeResolutionEvidence(analysis, analysis)
	const unrelated = analyzeResolutionEvidence(analysis, unrelatedNative)
	const firstId = analysisCandidateForRGB(unrelated, first)
	const secondId = analysisCandidateForRGB(unrelated, second)
	const summary = summarizeResolutionEvidence(unrelated)

	assert.equal(unrelated.candidates.count, 2)
	assert.equal(unrelated.families.count, 2)
	assert.notEqual(firstId, secondId)
	assert.deepEqual(candidateRGBAt(unrelated, firstId, "native-witness"), [7, 201, 143])
	assert.deepEqual(candidateRGBAt(unrelated, secondId, "native-witness"), [7, 201, 143])
	assert.equal(unrelated.candidates.nativeWitnessDuplicateCounts[firstId], 1)
	assert.equal(unrelated.candidates.nativeWitnessDuplicateCounts[secondId], 1)
	assert.deepEqual(summary.candidates[firstId].nativeWitnessDuplicateIds, [secondId])
	assert.deepEqual(summary.candidates[secondId].nativeWitnessDuplicateIds, [firstId])
	assert.deepEqual(unrelated.candidateLabels, nativeMatched.candidateLabels)
	assert.deepEqual(unrelated.familyLabels, nativeMatched.familyLabels)
	assert.deepEqual(unrelated.candidates.familyIds, nativeMatched.candidates.familyIds)
	assert.deepEqual(unrelated.candidates.analysisRepresentativeLab, nativeMatched.candidates.analysisRepresentativeLab)
	assert.deepEqual(unrelated.field.eligibleNodeIds, nativeMatched.field.eligibleNodeIds)
	assert.deepEqual(unrelated.relations.endpointDistance, nativeMatched.relations.endpointDistance)
	assert.deepEqual(unrelated.relations.coverage, nativeMatched.relations.coverage)
	assert.ok(Array.from(unrelated.relations.endpointDistance).every((distance) => distance > 0))
})

test("candidate and family labels are complete partitions and relation metrics are finite", () => {
	const source = ramp(48, 32, false)
	const frame = analyzeResolutionEvidence(source, source)
	assertPartition(frame.candidateLabels, frame.candidates.pixelCounts, frame.candidates.count)
	assertPartition(frame.familyLabels, frame.families.pixelCounts, frame.families.count)
	assert.deepEqual(
		Array.from(frame.field.eligibleNodeIds),
		Array.from(frame.field.paretoEligible).flatMap((eligible, id) => eligible ? [id] : []),
	)
	assert.equal("treatmentLabels" in frame.field, false)
	assert.equal("treatmentCounts" in frame.field, false)
	assert.equal(frame.graph.edges, frame.candidates.count * (frame.candidates.count - 1))
	assert.equal(frame.graph.eligibleOrderedEdges, frame.relations.count)
	assert.equal(frame.graph.fieldTreatments,
		frame.graph.collapsedFieldTreatments + frame.graph.distinctFlatFieldTreatments +
		frame.graph.gradientFieldTreatments)
	for (const values of [
		frame.relations.endpointDistance,
		frame.relations.fromPresence,
		frame.relations.toPresence,
		frame.relations.balance,
		frame.relations.mass,
		frame.relations.coverage,
		frame.relations.middleContinuity,
		frame.relations.coarseSpatialProgression,
	]) {
		assert.ok(Array.from(values).every(Number.isFinite))
	}
	assert.deepEqual(frame.invariants, {
		analysisRepresentativesMatchInput: true,
		analysisRepresentativeNativeMembershipVerified: true,
		nativeWitnessesExist: true,
		nativeWitnessesMatchInput: true,
		nativeWitnessesMinimizeDistanceInFootprint: true,
		duplicateWitnessIdsComplete: true,
		labelPartitionsComplete: true,
		eligibleNodeIdsExactlyPareto: true,
		familyGeometryUsesAnalysisRepresentatives: true,
		relationGeometryUsesAnalysisRepresentatives: true,
		policyHashVerified: true,
	})
	assert.doesNotThrow(() => JSON.stringify(summarizeResolutionEvidence(frame)))
})

test("same-size reruns are deterministic", () => {
	const source = image(37, 29, (x, y) => {
		if ((x + y) % 7 === 0) return [235, 225, 70]
		if (x < 12) return [25, 45, 90]
		if (y > 18) return [170, 45, 95]
		return [45, 155, 120]
	})
	const inputHash = createHash("sha256").update(source.data).digest("hex")
	const identity = {
		analysisRasterIdentity: "analysis-raster-sha256:test",
		decodedNativeRasterIdentity: "native-raster-sha256:test",
		rasterPolicyIdentity: "test-raster-policy-v1",
	}
	const first = analyzeResolutionEvidence(source, source, identity)
	const second = analyzeResolutionEvidence(source, source, identity)

	assert.deepEqual(summarizeResolutionEvidence(first), summarizeResolutionEvidence(second))
	assert.deepEqual(first.pixelBinIds, second.pixelBinIds)
	assert.deepEqual(first.candidateLabels, second.candidateLabels)
	assert.deepEqual(first.familyLabels, second.familyLabels)
	assert.deepEqual(first.relations.coverage, second.relations.coverage)
	assert.deepEqual(first.candidates.componentAreaHistogram, second.candidates.componentAreaHistogram)
	assert.deepEqual(first.candidates.componentSignatureSha256, second.candidates.componentSignatureSha256)
	assert.deepEqual(first.families.componentSignatureSha256, second.families.componentSignatureSha256)
	assert.equal(createHash("sha256").update(source.data).digest("hex"), inputHash)
	assert.deepEqual(first.provenance, identity)
	assert.equal(first.policy, RESOLUTION_EVIDENCE_POLICY)
	assert.equal(first.policySha256, RESOLUTION_EVIDENCE_POLICY_SHA256)
	assert.match(first.policySha256, /^[a-f0-9]{64}$/)
	assert.equal(Object.isFrozen(first.policy), true)
	assert.equal(Object.isFrozen(first.policy.relations), true)
	assert.equal(Object.isFrozen(first.provenance), true)
	assert.equal(Object.isFrozen(first.invariants), true)
	assert.equal(first.planeHashes.pixelBinIds, canonicalResolutionEvidenceTypedArrayHash(first.pixelBinIds))
	assert.equal(first.planeHashes.candidateLabels, canonicalResolutionEvidenceTypedArrayHash(first.candidateLabels))
	assert.equal(first.planeHashes.familyLabels, canonicalResolutionEvidenceTypedArrayHash(first.familyLabels))
	assert.deepEqual(first.planeHashes, second.planeHashes)
})

test("invalid numeric domains and provenance are rejected before allocation", () => {
	assert.throws(() => resolutionEvidenceBinKey(Number.NaN, 0, 0), /finite/)
	assert.throws(() => resolutionEvidenceBinKey(0.5, Number.POSITIVE_INFINITY, 0), /finite/)
	const oversized = { width: 46_341, height: 46_341, data: new Uint8Array(0) }
	const pixel = image(1, 1, () => [0, 0, 0])
	assert.throws(() => analyzeResolutionEvidence(oversized, pixel), /Int32/)
	assert.throws(() => analyzeResolutionEvidence(pixel, pixel, { rasterPolicyIdentity: "" }), /non-empty/)
})

test("multi-megapixel analysis retains only three raster-sized typed planes", { timeout: 60_000 }, () => {
	const width = 2048
	const height = 1024
	const total = width * height
	const data = new Uint8Array(total * 3)
	const colors: readonly RGB[] = [[18, 32, 62], [58, 135, 112], [190, 78, 62], [226, 185, 98]]
	for (let pixel = 0; pixel < total; pixel++) {
		const x = pixel % width
		const rgb = colors[Math.min(3, Math.floor(x * 4 / width))]
		const offset = pixel * 3
		data[offset] = rgb[0]
		data[offset + 1] = rgb[1]
		data[offset + 2] = rgb[2]
	}
	const source = { width, height, data }
	const inputHash = createHash("sha256").update(source.data).digest("hex")
	const frame = analyzeResolutionEvidence(source, source)
	const summary = summarizeResolutionEvidence(frame)
	const rasterSizedArrays: ArrayBufferView[] = []
	const visit = (value: unknown): void => {
		if (ArrayBuffer.isView(value)) {
			if ((value as { length?: number }).length === total) rasterSizedArrays.push(value)
			return
		}
		if (!value || typeof value !== "object") return
		for (const child of Object.values(value)) visit(child)
	}
	visit(frame)

	assert.equal(frame.candidateLabels.length, total)
	assert.equal(frame.familyLabels.length, total)
	assert.equal(frame.pixelBinIds.length, total)
	assert.equal(rasterSizedArrays.length, 3)
	assert.ok(resolutionEvidenceRetainedArrayBytes(frame) <= total * 4 + 3_000_000)
	assert.ok(frame.candidates.count <= 12)
	assert.ok(frame.commonDomainSample.count <= 128 * 128)
	assert.equal(createHash("sha256").update(source.data).digest("hex"), inputHash)
	assert.match(summary.planeHashes.pixelBinIds, /^[a-f0-9]{64}$/)
	assert.match(summary.planeHashes.candidateLabels, /^[a-f0-9]{64}$/)
	assert.match(summary.planeHashes.familyLabels, /^[a-f0-9]{64}$/)
	assert.ok(JSON.stringify(summary).length < 100_000)
})
