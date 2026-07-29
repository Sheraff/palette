import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { buildNativePaletteEvidence } from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID,
	buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath,
	evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath,
} from "../src/album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import {
	buildSupportedNativeFieldTransitionPaths,
	discoverNativeFieldTransitions,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import type { RGB, RawImage } from "../src/types.ts"

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

function mixRgb(first: RGB, second: RGB, amount: number): RGB {
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

function curvedCrossHueField(): RawImage {
	const first: RGB = [31, 52, 137]
	const middle: RGB = [40, 174, 151]
	const last: RGB = [221, 170, 58]
	return image(112, 68, (x, y) => {
		const amount = Math.max(0, Math.min(1, x / 111 + 0.025 * Math.sin(Math.PI * y / 67)))
		return amount < 0.5
			? mixRgb(first, middle, amount * 2)
			: mixRgb(middle, last, amount * 2 - 1)
	})
}

function directField(first: RGB, second: RGB): RawImage {
	const firstLab = rgbToOKLab(first)
	const secondLab = rgbToOKLab(second)
	return image(112, 68, (x) => oklabToRGB(mixOKLab(firstLab, secondLab, x / 111)))
}

function intervalProjectionTrapField(): RawImage {
	const first: RGB = [80, 100, 150]
	const second: RGB = [170, 160, 80]
	return image(120, 72, (x) => {
		const spatialPosition = x / 119
		let colorPosition: number
		if (spatialPosition < 0.18) colorPosition = 0
		else if (spatialPosition < 0.32) colorPosition = -0.4 * (spatialPosition - 0.18) / 0.14
		else if (spatialPosition < 0.5) colorPosition = -0.4
		else if (spatialPosition < 0.64) colorPosition = -0.4 + 1.4 * (spatialPosition - 0.5) / 0.14
		else colorPosition = 1
		return mixRgb(first, second, colorPosition)
	})
}

test("a curved cross-hue field earns an exact source-supported midpoint", () => {
	const fixture = curvedCrossHueField()
	const result = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(fixture)

	assert.equal(result.identity.armId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID)
	assert.equal(result.gradientEligible, true)
	assert.equal(result.fieldTreatment, "gradient-field")
	assert.ok(result.hypothesis?.gradientEvidence)
	assert.equal(result.midpoint.kind, "source-supported-three-stop")
	if (result.midpoint.kind !== "source-supported-three-stop") return
	assert.equal(result.midpoint.position, 0.5)
	assert.equal(result.midpoint.provenance.exactSource, true)
	const offset = result.midpoint.provenance.pixelIndex * 3
	assert.deepEqual(result.midpoint.color.rgb, [...fixture.data.slice(offset, offset + 3)])
	assert.equal(result.midpoint.color.hex,
		`#${result.midpoint.color.rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`)

	const selected = result.diagnostics.paths[result.diagnostics.selectedPathIndex!]
	assert.equal(selected.crossHue, true)
	assert.ok(selected.stageColorPositions.length >= 3)
	assert.equal(selected.stageColorPositions.length, selected.stagePositions.length)
	assert.equal(selected.stagePopulationFractions.length, selected.stagePositions.length)
	assert.ok(selected.acceptedIntermediateSupport.length > 0)
	assert.ok(selected.acceptedIntermediateSupport.some(({ acceptedForMidpoint }) => acceptedForMidpoint))
	assert.deepEqual(selected.midpointCustody, result.midpoint)
})

test("a direct cross-hue source progression is vetoed instead of receiving an invented midpoint", () => {
	const result = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
		directField([34, 52, 142], [212, 164, 48]),
	)

	assert.equal(result.gradientEligible, false)
	assert.equal(result.fieldTreatment, "separate-flat-fields")
	assert.deepEqual(result.midpoint, { kind: "none", position: null, color: null, provenance: null })
	const strictPath = result.diagnostics.paths.find(({ strictTransitionEligible }) => strictTransitionEligible)
	assert.ok(strictPath)
	assert.equal(strictPath.crossHue, true)
	assert.ok(strictPath.acceptedIntermediateSupport.length > 0)
	assert.ok(strictPath.acceptedIntermediateSupport.every(({ materiallyDifferentFromDirectPath }) =>
		!materiallyDifferentFromDirectPath))
	assert.ok(strictPath.rejectionReasons.includes("cross-hue-path-lacks-material-halfway-intermediate"))
})

test("a supported same-hue progression remains an ordinary two-stop gradient", () => {
	const result = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
		directField([24, 54, 106], [113, 176, 230]),
	)

	assert.equal(result.gradientEligible, true)
	assert.equal(result.midpoint.kind, "ordinary-two-stop")
	const selected = result.diagnostics.paths[result.diagnostics.selectedPathIndex!]
	assert.equal(selected.crossHue, false)
	assert.deepEqual(selected.midpointCustody, result.midpoint)
})

test("only color-intermediate stages count toward the unchanged eight-percent bridge threshold", () => {
	const fixture = intervalProjectionTrapField()
	const evidence = buildNativePaletteEvidence(fixture)
	const legacy = discoverNativeFieldTransitions(evidence)
	const legacyTrace = legacy.traces.find(({ eligible }) => eligible)
	assert.ok(legacyTrace)
	const legacyDomain = legacy.fieldDomains.find(({ id }) => id === legacyTrace.fieldDomainId)
	assert.ok(legacyDomain && legacyDomain.transitionPopulationFraction >= 0.08)

	const paths = buildSupportedNativeFieldTransitionPaths(fixture)
	const corresponding = paths.find(({ fieldDomainId }) => fieldDomainId === legacyTrace.fieldDomainId)
	assert.ok(corresponding)
	assert.equal(corresponding.legacyEligible, true)
	assert.equal(corresponding.eligible, false)
	assert.ok(corresponding.transitionFamilyCount < legacyDomain.transitionFamilyCount)
	assert.ok(corresponding.transitionPopulationFraction < 0.08)
	assert.ok(corresponding.transitionQuadrantCoverage < legacyDomain.transitionQuadrantCoverage)
	assert.ok(corresponding.rejectionReasons.includes("color-intermediate families lack broad transition coverage"))
	assert.ok(corresponding.acceptedIntermediateSupport.every(({ colorPosition }) =>
		colorPosition >= 0.15 && colorPosition <= 0.85))
	assert.ok(corresponding.stages.slice(1, -1).some(({ colorPosition }) =>
		colorPosition < 0.15 || colorPosition > 0.85))

	const result = evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(evidence)
	assert.equal(result.gradientEligible, false)
	assert.equal(result.diagnostics.policy.minimumTransitionPopulationFraction, 0.08)
})

test("the strict API is deterministic, isolated, and does not alter legacy diagnostic shapes", async () => {
	const fixture = curvedCrossHueField()
	const first = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(fixture)
	const second = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(fixture)
	assert.deepEqual(first, second)

	const legacy = discoverNativeFieldTransitions(buildNativePaletteEvidence(fixture))
	assert.deepEqual(Object.keys(legacy), ["regions", "fieldDomains", "traces", "hypotheses"])
	assert.deepEqual(Object.keys(legacy.traces[0]), [
		"fieldDomainId", "topology", "direction", "spatialCenter", "endpointFamilyIds",
		"stageFamilyIds", "stageRegionIds", "stagePositions", "edgeLocalSteps", "endpointDistance",
		"spatialProgression", "colorProgression", "colorDirectness", "localContinuity", "branching",
		"eligible", "rejectionReasons",
	])

	for (const sourceUrl of [
		new URL("../src/album-artwork-palette-v2-phase-3-field-transition.ts", import.meta.url),
		new URL("../src/album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts", import.meta.url),
	]) {
		const source = await readFile(sourceUrl, "utf8")
		assert.doesNotMatch(source,
			/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|\bsourceId\b|pathname|filePath|filename|feedback|review|comment|warehouse|manifest|sha256|target.?color|historical|#[0-9a-f]{6})/iu)
		assert.doesNotMatch(source, /from\s+["']node:/u)
	}
})
