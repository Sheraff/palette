import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildNativeFieldTransitionDiscovery,
	buildNativeFieldTransitionHypotheses,
	discoverNativeFieldTransitions,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import { buildNativePaletteEvidence } from "../src/album-artwork-palette-v2.ts"
import type { RGB, RawImage } from "../src/types.ts"

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

function mix(first: RGB, second: RGB, amount: number): RGB {
	return [
		clampByte(first[0] + (second[0] - first[0]) * amount),
		clampByte(first[1] + (second[1] - first[1]) * amount),
		clampByte(first[2] + (second[2] - first[2]) * amount),
	]
}

function image(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function multiStageField(): RawImage {
	const first: RGB = [31, 52, 137]
	const middle: RGB = [61, 163, 143]
	const last: RGB = [221, 170, 58]
	return image(112, 68, (x, y) => {
		const amount = Math.max(0, Math.min(1, x / 111 + 0.035 * Math.sin(Math.PI * y / 67)))
		return amount < 0.48
			? mix(first, middle, amount / 0.48)
			: mix(middle, last, (amount - 0.48) / 0.52)
	})
}

function radialField(centerX = 0.5, centerY = 0.5): RawImage {
	const maximumRadius = Math.max(...[
		[0, 0], [1, 0], [0, 1], [1, 1],
	].map(([x, y]) => Math.hypot(x - centerX, y - centerY)))
	return image(108, 108, (x, y) => mix(
		[224, 196, 94],
		[32, 64, 126],
		Math.min(1, Math.hypot(x / 107 - centerX, y / 107 - centerY) / maximumRadius),
	))
}

function reflectHorizontal(value: RawImage): RawImage {
	return image(value.width, value.height, (x, y) => {
		const offset = (y * value.width + (value.width - 1 - x)) * 3
		return [value.data[offset], value.data[offset + 1], value.data[offset + 2]]
	})
}

function rotateClockwise(value: RawImage): RawImage {
	return image(value.height, value.width, (x, y) => {
		const sourceX = y
		const sourceY = value.height - 1 - x
		const offset = (sourceY * value.width + sourceX) * 3
		return [value.data[offset], value.data[offset + 1], value.data[offset + 2]]
	})
}

function acceptedTransition(value: RawImage) {
	const discovery = buildNativeFieldTransitionDiscovery(value)
	const trace = discovery.traces.find(({ eligible }) => eligible)
	const hypothesis = discovery.hypotheses[0]
	assert.ok(trace)
	assert.ok(hypothesis?.gradientEvidence)
	return { discovery, trace, hypothesis }
}

test("connected transition graph traces broad multi-stage bridge families into endpoint hypotheses", () => {
	const value = multiStageField()
	const evidence = buildNativePaletteEvidence(value)
	const discovery = discoverNativeFieldTransitions(evidence)
	const trace = discovery.traces.find(({ eligible }) => eligible)
	assert.ok(trace)
	assert.ok(trace.stageFamilyIds.length >= 5)
	assert.equal(trace.stageFamilyIds.length, trace.stageRegionIds.length)
	assert.equal(trace.edgeLocalSteps.length, trace.stageFamilyIds.length - 1)
	assert.ok(trace.stagePositions.every((position, index, positions) => index === 0 || position > positions[index - 1]))
	assert.ok(trace.colorProgression >= 0.9)
	assert.ok(trace.colorDirectness >= 0.75)
	assert.ok(trace.localContinuity >= 0.5)
	assert.ok(trace.branching <= 0.2)

	const domain = discovery.fieldDomains.find(({ id }) => id === trace.fieldDomainId)
	assert.ok(domain?.eligible)
	assert.ok(domain.populationFraction >= 0.9)
	assert.ok(domain.borderCoverage >= 0.9)
	assert.equal(domain.ownedCornerCount, 4)
	assert.ok(domain.transitionFamilyCount >= 3)
	assert.ok(domain.transitionPopulationFraction >= 0.4)
	assert.ok(trace.stageFamilyIds.slice(1, -1).every((familyId) => domain.familyIds.includes(familyId)))

	const hypothesis = discovery.hypotheses[0]
	assert.ok(hypothesis?.gradientEvidence)
	assert.equal(hypothesis.kind, "gradient-field")
	assert.equal(hypothesis.gradientEvidence.fieldDomainId, domain.id)
	assert.deepEqual(hypothesis.gradientEvidence.supportingFamilyIds, trace.endpointFamilyIds)
	assert.notEqual(hypothesis.gradientEvidence.supportingEndpointHexes[0],
		hypothesis.gradientEvidence.supportingEndpointHexes[1])
	for (const representative of [...hypothesis.backgroundRepresentatives, ...hypothesis.surfaceRepresentatives]) {
		assert.equal("generated" in representative.support, false)
		if (!("generated" in representative.support)) assert.equal(representative.support.exactSource, true)
	}
	assert.deepEqual(buildNativeFieldTransitionHypotheses(evidence), discovery.hypotheses)
	assert.deepEqual(buildNativeFieldTransitionDiscovery(value), discovery)
})

test("nested source regions produce centered and upper-center radial hypotheses", () => {
	for (const [fixture, topology, center] of [
		[radialField(), "radial-center", [0.5, 0.5]],
		[radialField(0.5, 0.35), "radial-upper-center", [0.5, 0.35]],
	] as const) {
		const discovery = buildNativeFieldTransitionDiscovery(fixture)
		const hypothesis = discovery.hypotheses.find(({ gradientEvidence }) => gradientEvidence?.topology === topology)
		assert.ok(hypothesis?.gradientEvidence)
		assert.equal(hypothesis.gradientEvidence.direction, "center-out")
		const trace = discovery.traces.find(({ fieldDomainId }) =>
			fieldDomainId === hypothesis.gradientEvidence?.fieldDomainId)
		assert.ok(trace?.eligible)
		assert.equal(trace.topology, topology)
		assert.ok(trace.stageFamilyIds.length >= 3)
		assert.ok(trace.stagePositions.every((position, index, positions) =>
			index === 0 || position > positions[index - 1]))
		assert.ok(Math.abs(trace.spatialCenter![0] - center[0]) < 0.02)
		assert.ok(Math.abs(trace.spatialCenter![1] - center[1]) < 0.02)
		assert.ok(trace.spatialProgression >= 0.9)
		assert.ok(trace.colorProgression >= 0.9)
		const domain = discovery.fieldDomains.find(({ id }) => id === trace.fieldDomainId)
		assert.ok(domain && domain.populationFraction >= 0.65 && domain.quadrantCoverage === 1)
	}
})

test("radial geometry follows rotation and translated centers", () => {
	const centered = acceptedTransition(radialField())
	const centeredRotated = acceptedTransition(rotateClockwise(radialField()))
	assert.equal(centered.hypothesis.gradientEvidence?.topology, "radial-center")
	assert.equal(centeredRotated.hypothesis.gradientEvidence?.topology, "radial-center")
	assert.deepEqual(
		[...centered.hypothesis.gradientEvidence!.supportingEndpointHexes].sort(),
		[...centeredRotated.hypothesis.gradientEvidence!.supportingEndpointHexes].sort(),
	)

	const upperRotated = acceptedTransition(rotateClockwise(radialField(0.5, 0.35)))
	assert.equal(upperRotated.hypothesis.gradientEvidence?.topology, "radial-offset")
	assert.equal(upperRotated.hypothesis.gradientEvidence?.direction, "center-0.65-0.50")
	assert.ok(Math.abs(upperRotated.trace.spatialCenter![0] - 0.65) < 0.02)
	assert.ok(Math.abs(upperRotated.trace.spatialCenter![1] - 0.5) < 0.02)

	for (const [centerX, centerY, direction] of [
		[0.35, 0.5, "center-0.35-0.50"],
		[0.65, 0.5, "center-0.65-0.50"],
		[0.5, 0.65, "center-0.50-0.65"],
	] as const) {
		const result = acceptedTransition(radialField(centerX, centerY))
		assert.equal(result.hypothesis.gradientEvidence?.topology, "radial-offset")
		assert.equal(result.hypothesis.gradientEvidence?.direction, direction)
		assert.ok(Math.abs(result.trace.spatialCenter![0] - centerX) < 0.02)
		assert.ok(Math.abs(result.trace.spatialCenter![1] - centerY) < 0.02)
	}
})

test("hard regions and stripes fail local-step continuity", () => {
	const fixtures = [
		image(108, 68, (x) => x < 54 ? [27, 55, 139] : [222, 166, 54]),
		image(108, 68, (x) => x < 36 ? [30, 57, 138] : x < 72 ? [121, 96, 86] : [224, 169, 57]),
		image(108, 68, (x) => mix([29, 55, 136], [221, 169, 57], Math.floor(x / 12) / 8)),
	]
	for (const fixture of fixtures) {
		const discovery = buildNativeFieldTransitionDiscovery(fixture)
		assert.equal(discovery.hypotheses.length, 0)
		assert.ok(discovery.traces.length > 0)
		assert.ok(discovery.traces.every(({ eligible }) => !eligible))
		assert.ok(discovery.traces.some(({ rejectionReasons }) =>
			rejectionReasons.includes("no source-connected low-step spatial progression joins the endpoints")))
	}
})

test("multiple competing smooth branches are not projected as one field progression", () => {
	const first: RGB = [30, 52, 133]
	const last: RGB = [222, 171, 57]
	const branches: readonly RGB[] = [[55, 160, 145], [183, 72, 151], [105, 126, 52]]
	const fixture = image(112, 72, (x, y) => {
		const amount = x / 111
		const branch = branches[Math.min(2, Math.floor(y / 24))]
		return amount < 0.5
			? mix(first, branch, amount * 2)
			: mix(branch, last, amount * 2 - 1)
	})
	const discovery = buildNativeFieldTransitionDiscovery(fixture)
	assert.equal(discovery.hypotheses.length, 0)
	assert.ok(discovery.traces.some(({ rejectionReasons }) =>
		rejectionReasons.includes("transition region graph branches into competing structures")))
})

test("fragmented ramps, object-local lighting, and unrelated objects lack broad endpoint geometry", () => {
	const background: RGB = [37, 67, 101]
	const fixtures = [
		image(112, 72, (x, y) => {
			if (x >= 34 && x < 79 && y >= 18 && y < 57) {
				return mix([58, 112, 177], [226, 178, 74], (x - 34) / 44)
			}
			return background
		}),
		image(112, 72, (x, y) => {
			const fragment = x > 13 && x < 99 && y > 10 && y < 63 && (x * 7 + y * 11) % 47 < 5
			return fragment ? mix([63, 104, 168], [205, 108, 73], x / 111) : background
		}),
		image(112, 72, (x, y) => {
			if (x >= 39 && x < 76 && y >= 20 && y < 56) {
				return (x + y) % 3 === 0 ? [221, 48, 82] : (x + y) % 3 === 1 ? [231, 189, 45] : [44, 175, 137]
			}
			return background
		}),
	]
	for (const fixture of fixtures) {
		const discovery = buildNativeFieldTransitionDiscovery(fixture)
		assert.equal(discovery.hypotheses.length, 0)
		assert.ok(discovery.regions.filter(({ endpointEligible }) => endpointEligible).length <= 1)
		const nonFieldRegions = discovery.regions.filter(({ familyId }) =>
			!discovery.regions.find(({ endpointEligible }) => endpointEligible)?.familyId ||
			familyId !== discovery.regions.find(({ endpointEligible }) => endpointEligible)?.familyId)
		assert.ok(nonFieldRegions.some(({ endpointRejectionReasons }) => endpointRejectionReasons.some((reason) =>
			reason.includes("object-local") || reason.includes("perimeter") || reason.includes("fragmented") || reason.includes("population"))))
	}
})

test("radial lighting confined to an interior object lacks continuous field-scale stages", () => {
	const background: RGB = [32, 64, 126]
	const fixture = image(112, 112, (x, y) => {
		const radius = Math.hypot(x / 111 - 0.5, y / 111 - 0.5)
		return radius < 0.28 ? mix([224, 196, 94], background, radius / 0.28) : background
	})
	const discovery = buildNativeFieldTransitionDiscovery(fixture)
	assert.equal(discovery.hypotheses.length, 0)
	assert.ok(discovery.regions.some(({ radialCenterEligible }) => radialCenterEligible))
	assert.ok(discovery.traces.filter(({ topology }) => topology !== "linear").some(({ rejectionReasons }) =>
		rejectionReasons.includes("transition stages leave a large spatial discontinuity")))
})

test("transition discovery is stable under reflection and quarter-turn rotation", () => {
	const original = multiStageField()
	const variants = [original, reflectHorizontal(original), rotateClockwise(original)]
	const results = variants.map(acceptedTransition)
	const reference = results[0]
	const endpointHexes = (result: ReturnType<typeof acceptedTransition>) =>
		[...result.hypothesis.gradientEvidence!.supportingEndpointHexes].sort()
	for (const result of results.slice(1)) {
		assert.deepEqual(endpointHexes(result), endpointHexes(reference))
		assert.equal(result.trace.stageFamilyIds.length, reference.trace.stageFamilyIds.length)
		assert.ok(Math.abs(result.trace.endpointDistance - reference.trace.endpointDistance) < 1e-6)
		assert.ok(Math.abs(result.trace.colorProgression - reference.trace.colorProgression) < 1e-6)
		assert.ok(Math.abs(result.trace.colorDirectness - reference.trace.colorDirectness) < 1e-6)
		assert.ok(Math.abs(result.trace.branching - reference.trace.branching) < 1e-6)
		const resultDomain = result.discovery.fieldDomains.find(({ id }) => id === result.trace.fieldDomainId)!
		const referenceDomain = reference.discovery.fieldDomains.find(({ id }) => id === reference.trace.fieldDomainId)!
		assert.ok(Math.abs(resultDomain.populationFraction - referenceDomain.populationFraction) < 1e-6)
		assert.equal(resultDomain.ownedCornerCount, referenceDomain.ownedCornerCount)
	}
	assert.equal(reference.hypothesis.gradientEvidence?.direction, "horizontal")
	assert.equal(results[2].hypothesis.gradientEvidence?.direction, "vertical")
})

test("transition graph is deterministic, bounded, and isolated from evaluation metadata", async () => {
	const value = multiStageField()
	const first = buildNativeFieldTransitionDiscovery(value)
	const second = buildNativeFieldTransitionDiscovery(value)
	assert.deepEqual(first, second)
	assert.ok(first.traces.length <= 90)
	assert.ok(first.traces.filter(({ eligible }) => eligible).every(({ stageFamilyIds }) => stageFamilyIds.length <= 16))

	const source = await readFile(new URL("../src/album-artwork-palette-v2-phase-3-field-transition.ts", import.meta.url), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /(?:development-[0-9]+|feedback|review|warehouse|manifest|sha256|target.?color|historical)/iu)
})
