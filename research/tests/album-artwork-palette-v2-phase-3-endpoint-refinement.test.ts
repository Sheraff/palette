import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildNativePaletteEvidence,
	diagnoseGradientFits,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY,
	buildBandLocalEndpointRefinements,
} from "../src/album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import type {
	BandLocalEndpoint,
	BandLocalEndpointRefinement,
} from "../src/album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import { okDistance, oklabToRGB } from "../src/color.ts"
import type { RGB, RawImage } from "../src/types.ts"

function fixture(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function tonal(lightness: number): RGB {
	return oklabToRGB([lightness, 0.018, -0.025])
}

function sameFamilyTonal(
	amount: (x: number, y: number) => number,
	decorate?: (x: number, y: number, base: RGB) => RGB,
): RawImage {
	return fixture(144, 96, (x, y) => {
		const base = tonal(0.48 + 0.085 * amount(x, y))
		return decorate?.(x, y, base) ?? base
	})
}

function texturedUpperRadial(slope: number): RawImage {
	return fixture(120, 120, (x, y) => {
		const position = clampAmount(Math.hypot(x / 119 - 0.5, y / 119 - 0.35) / 0.82)
		const texture = (x + y) % 4 < 2 ? 0.024 : -0.024
		return oklabToRGB([0.53 - slope * position + texture, 0.012, -0.035])
	})
}

function accepted(image: RawImage, direction?: string): BandLocalEndpointRefinement {
	const evidence = buildNativePaletteEvidence(image)
	const report = buildBandLocalEndpointRefinements(evidence, diagnoseGradientFits(evidence))
	const refinement = report.refinements.find((candidate) => candidate.accepted &&
		(direction === undefined || candidate.fit.direction === direction))
	assert.ok(refinement, `expected an accepted refinement; got ${JSON.stringify(report.refinements.map(({ fit, rejectionReasons }) => ({ direction: fit.direction, rejectionReasons })))}`)
	return refinement
}

function assertBandSupport(endpoint: BandLocalEndpoint, image: RawImage): void {
	const distribution = endpoint.distribution
	assert.ok(distribution.spatialBandPopulation > 0)
	assert.ok(distribution.parentFamilyPopulation > 0)
	assert.equal(endpoint.family.population, distribution.parentFamilyPopulation)
	assert.equal(endpoint.family.populationFraction, distribution.parentFamilyPopulation / (image.width * image.height))
	assert.equal(endpoint.family.largestComponentFraction,
		distribution.largestComponentPopulation / (image.width * image.height))
	assert.ok(distribution.localModes.length > 0)
	assert.ok(distribution.localModes[0].neighborhoodPopulation >= distribution.localModes[0].population)
	for (const representative of [
		endpoint.representatives.denseExact,
		endpoint.representatives.nearestRobustPrototype,
	]) {
		assert.equal("generated" in representative.support, false)
		if ("generated" in representative.support) continue
		assert.equal(representative.support.anchorFamilyId, endpoint.family.id)
		assert.equal(representative.support.totalSupport, distribution.parentFamilyPopulation / (image.width * image.height))
		assert.ok(representative.support.regionIds.every((id) => id.startsWith(`${endpoint.family.id}-region-`)))
		assert.ok(representative.support.exemplar)
	}
	const synthesized = endpoint.representatives.densityConstrainedSynthesis
	if (synthesized && !("generated" in synthesized.support)) {
		assert.ok((synthesized.support.synthesis?.occupiedDistance ?? Infinity) <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumSynthesizedOccupiedDistance)
		assert.ok(synthesized.support.perceptualDensity >= 0.08)
	}
}

test("same-family tonal fields split into occupied band-local modes with recomputed support", () => {
	const image = sameFamilyTonal((x) => x / 143)
	const refinement = accepted(image, "horizontal")
	assert.ok(refinement.low && refinement.high)
	assert.ok(refinement.endpointDistance >= 0.055)
	assertBandSupport(refinement.low, image)
	assertBandSupport(refinement.high, image)
	assert.notEqual(refinement.low.family.id, refinement.high.family.id)
	assert.notEqual(refinement.low.representatives.denseExact.hex, refinement.high.representatives.denseExact.hex)
	assert.ok(refinement.low.family.population <
		buildNativePaletteEvidence(image).families.find(({ id }) => id === refinement.parentFamilyId)!.population)
})

test("a no-split same-family field does not manufacture endpoint refinements", () => {
	const image = fixture(144, 96, (x, y) => {
		const checker = (x + y) % 2 === 0 ? -0.001 : 0.001
		return tonal(0.515 + 0.02 * x / 143 + checker)
	})
	const evidence = buildNativePaletteEvidence(image)
	const report = buildBandLocalEndpointRefinements(evidence, diagnoseGradientFits(evidence))
	assert.ok(report.sameFamilyFitCount > 0)
	assert.equal(report.acceptedCount, 0)
	assert.ok(report.refinements.every(({ rejectionReasons }) => rejectionReasons.some((reason) =>
		reason.includes("not materially distinct") || reason.startsWith("upstream fit:"))))
})

test("isolated endpoint noise cannot displace dense exact local modes", () => {
	const noise: RGB = [250, 20, 210]
	const image = sameFamilyTonal((x) => x / 143, (x, y, base) =>
		(x === 1 && y === 1) || (x === 142 && y === 94) ? noise : base)
	const refinement = accepted(image, "horizontal")
	assert.ok(refinement.low && refinement.high)
	assert.notDeepEqual(refinement.low.representatives.denseExact.rgb, noise)
	assert.notDeepEqual(refinement.high.representatives.denseExact.rgb, noise)
	assert.ok(refinement.low.distribution.localModes[0].neighborhoodPopulation > 1)
	assert.ok(refinement.high.distribution.localModes[0].neighborhoodPopulation > 1)
})

test("deterministic compression-like noise retains robust occupied endpoints", () => {
	const image = sameFamilyTonal((x) => x / 143, (x, y, base) => {
		const variation = (x * 17 + y * 29) % 7 - 3
		return [
			Math.max(0, Math.min(255, base[0] + variation)),
			Math.max(0, Math.min(255, base[1] - variation)),
			Math.max(0, Math.min(255, base[2] + variation)),
		]
	})
	const refinement = accepted(image, "horizontal")
	assert.ok(refinement.low && refinement.high)
	assert.ok(refinement.low.distribution.robustRetainedPopulation < refinement.low.family.population)
	assert.ok(refinement.high.distribution.localModes[0].neighborhoodFraction >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumModeShare)
})

test("a contrasting overlay is excluded from endpoint distributions", () => {
	const overlay: RGB = [238, 38, 60]
	const image = sameFamilyTonal((x) => x / 143, (x, y, base) =>
		x >= 54 && x < 90 && y >= 27 && y < 69 ? overlay : base)
	const refinement = accepted(image, "horizontal")
	assert.ok(refinement.low && refinement.high)
	for (const endpoint of [refinement.low, refinement.high]) {
		assert.notDeepEqual(endpoint.representatives.denseExact.rgb, overlay)
		assert.notDeepEqual(endpoint.representatives.nearestRobustPrototype.rgb, overlay)
		assert.ok(endpoint.distribution.localModes.every(({ exemplar }) =>
			exemplar.rgb.some((channel, index) => channel !== overlay[index])))
	}
})

test("unequal endpoint density remains local and does not clone parent population", () => {
	const image = sameFamilyTonal((x, y) => {
		const amount = x / 143
		if (amount < 0.2) return y % 5 === 0 ? amount : amount * 0.25
		if (amount > 0.8) return y % 2 === 0 ? amount : 0.8 + (amount - 0.8) * 0.2
		return amount
	})
	const refinement = accepted(image, "horizontal")
	assert.ok(refinement.low && refinement.high)
	assert.notEqual(refinement.low.distribution.localModes[0].populationFraction,
		refinement.high.distribution.localModes[0].populationFraction)
	assert.equal(refinement.low.family.population, refinement.low.distribution.parentFamilyPopulation)
	assert.equal(refinement.high.family.population, refinement.high.distribution.parentFamilyPopulation)
})

test("reversed tonal fields preserve topology order instead of assuming lightness order", () => {
	const forward = accepted(sameFamilyTonal((x) => x / 143), "horizontal")
	const reversed = accepted(sameFamilyTonal((x) => 1 - x / 143), "horizontal")
	assert.ok(forward.low && forward.high && reversed.low && reversed.high)
	assert.ok(forward.low.distribution.robustPrototype[0] < forward.high.distribution.robustPrototype[0])
	assert.ok(reversed.low.distribution.robustPrototype[0] > reversed.high.distribution.robustPrototype[0])
	assert.ok(okDistance(forward.low.distribution.robustPrototype, reversed.high.distribution.robustPrototype) < 0.006)
})

test("radial same-family fields use center and perimeter bands", () => {
	const image = sameFamilyTonal((x, y) => clampAmount(
		Math.hypot(x / 143 - 0.5, y / 95 - 0.5) / Math.SQRT1_2,
	))
	const refinement = accepted(image, "center-out")
	assert.ok(refinement.low && refinement.high)
	assert.equal(refinement.fit.topology, "radial-center")
	assert.ok(refinement.low.family.centerCoverage > refinement.high.family.centerCoverage)
	assert.ok(refinement.high.family.borderCoverage > refinement.low.family.borderCoverage)
})

test("textured upper-radial bands use occupied modes without an extra spread safety margin", () => {
	const image = texturedUpperRadial(0.075)
	const evidence = buildNativePaletteEvidence(image)
	const report = buildBandLocalEndpointRefinements(evidence, diagnoseGradientFits(evidence))
	const refinement = report.refinements.find(({ accepted, fit }) =>
		accepted && fit.topology === "radial-upper-center")
	assert.ok(refinement?.low && refinement.high)
	const spreadSum = refinement.low.distribution.robustSpread + refinement.high.distribution.robustSpread
	assert.ok(refinement.endpointDistance >= spreadSum)
	assert.ok(refinement.endpointDistance < 1.15 * spreadSum)
	assert.ok(refinement.occupiedModeDistance >= 0.05)
	assertBandSupport(refinement.low, image)
	assertBandSupport(refinement.high, image)
})

test("hard radial rings and textured radial no-split fields remain rejected", () => {
	const hardRings = fixture(120, 120, (x, y) => {
		const position = clampAmount(Math.hypot(x / 119 - 0.5, y / 119 - 0.35) / 0.82)
		return tonal(position < 0.5 ? 0.49 : 0.56)
	})
	for (const image of [hardRings, texturedUpperRadial(0)]) {
		const evidence = buildNativePaletteEvidence(image)
		const report = buildBandLocalEndpointRefinements(evidence, diagnoseGradientFits(evidence))
		assert.equal(report.acceptedCount, 0)
	}
})

test("refinement is deterministic and only consumes exported evidence and diagnostics", () => {
	const image = sameFamilyTonal((x) => x / 143)
	const evidence = buildNativePaletteEvidence(image)
	const diagnostics = diagnoseGradientFits(evidence)
	const first = buildBandLocalEndpointRefinements(evidence, diagnostics)
	const second = buildBandLocalEndpointRefinements(evidence, diagnostics)
	assert.deepEqual(first, second)
})

test("attempt algorithm has no metadata, review, target, filesystem, or historical treatment dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-endpoint-refinement.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /(?:review|warehouse|manifest|sourceId|caseId|artworkId|targetColor|treatmentKey)/iu)
	assert.doesNotMatch(source, /(?:readFile|writeFile|readdir|realpath|createHash)/u)
})

function clampAmount(value: number): number {
	return Math.max(0, Math.min(1, value))
}
