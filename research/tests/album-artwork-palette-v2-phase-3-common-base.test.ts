import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2,
	extractAlbumArtworkPaletteV2074,
	extractAlbumArtworkPaletteV2074Details,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID,
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "../src/album-artwork-palette-v2-phase-3-materialization.ts"
import { oklabToRGB } from "../src/color.ts"
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

function transitionField(): RawImage {
	const width = 112
	const height = 68
	const data = new Uint8Array(width * height * 3)
	const first: RGB = [31, 52, 137]
	const middle: RGB = [61, 163, 143]
	const last: RGB = [221, 170, 58]
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = Math.max(0, Math.min(1,
				x / (width - 1) + 0.035 * Math.sin(Math.PI * y / (height - 1))))
			const color = amount < 0.48
				? mix(first, middle, amount / 0.48)
				: mix(middle, last, (amount - 0.48) / 0.52)
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function radialEndpointField(): RawImage {
	const width = 144
	const height = 96
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (x >= 60 && x < 84 && y >= 38 && y < 58) {
				data.set([238, 38, 60], (y * width + x) * 3)
				continue
			}
			const amount = Math.max(0, Math.min(1,
				Math.hypot(x / (width - 1) - 0.5, y / (height - 1) - 0.5) / Math.SQRT1_2))
			data.set(oklabToRGB([0.48 + 0.085 * amount, 0.018, -0.025]), (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

test("common base exposes closed seed availability and source-typed transition descriptors before materialization", () => {
	const image = transitionField()
	const closed = extractAlbumArtworkPaletteV2074Details(image)
	const base = buildAlbumArtworkPaletteV2Phase3CommonBase(image, { closed074Details: closed })

	assert.equal(base.contractId, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID)
	assert.equal(base.currentV1MaterializedDomain, null)
	assert.equal(base.diagnostics.currentV1Comparison.present, false)
	assert.equal(base.seedAvailability.domain, "closed-0.7.4-complete-domain")
	assert.equal(base.seedAvailability.logicalDescriptors.length,
		closed.audit.candidate.completeTreatments.length)
	assert.deepEqual(
		base.seedAvailability.logicalDescriptors.map(({ treatment }) => completeTreatmentKey(treatment)),
		closed.audit.candidate.completeTreatments.map(completeTreatmentKey),
	)
	assert.ok(base.seedAvailability.logicalDescriptors.every(({ sourceType }) =>
		sourceType === "closed-0.7.4-seed"))
	assert.equal(base.logicalDescriptors.length,
		base.seedAvailability.logicalDescriptors.length + base.supplementalAvailability.logicalDescriptors.length)
	assert.equal(base.diagnostics.logicalDescriptorCount, base.logicalDescriptors.length)
	assert.equal(base.diagnostics.canonicalTreatmentCountBeforeMaterialization,
		new Set(base.logicalDescriptors.map(({ treatment }) => completeTreatmentKey(treatment))).size)

	const transitionHypotheses = base.supplementalAvailability.fieldHypotheses.filter(({ sourceType }) =>
		sourceType === "native-field-transition")
	assert.equal(base.fieldHypotheses.filter(({ sourceType }) => sourceType === "native-field-transition").length,
		base.diagnostics.nativeFieldTransition.legalHypothesisCount)
	const transitionDescriptors = base.supplementalAvailability.logicalDescriptors.filter(({ sourceType }) =>
		sourceType === "native-field-transition")
	assert.ok(base.evidence.nativeFieldTransitions.traces.some(({ eligible }) => eligible))
	assert.ok(transitionHypotheses.length > 0)
	assert.ok(transitionDescriptors.length > 0)
	assert.ok(transitionDescriptors.every(({ fieldHypothesis, lineage, treatment }) =>
		lineage.sourceConnected && lineage.fieldHypothesisId === fieldHypothesis.id &&
		treatment.sourceFieldHypothesisId === fieldHypothesis.id))
	assert.ok(base.diagnostics.hypothesisCustody
		.filter(({ sourceType }) => sourceType === "native-field-transition")
		.every(({ logicalDescriptorCount, sourceConnectedDescriptorCount }) =>
			logicalDescriptorCount > 0 && sourceConnectedDescriptorCount === logicalDescriptorCount))
})

test("band-local endpoint families and legal descriptors enter the same pre-cap union", () => {
	const image = radialEndpointField()
	let comparisonCalls = 0
	const base = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		materializeCurrentV1: (descriptors, obligations) => {
			comparisonCalls += 1
			return materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations)
		},
	})

	assert.equal(comparisonCalls, 1)
	assert.ok(base.currentV1MaterializedDomain)
	assert.equal(base.diagnostics.currentV1Comparison.present, true)
	assert.equal(base.diagnostics.currentV1Comparison.materializedTreatmentCount,
		base.currentV1MaterializedDomain.materialized.length)
	assert.ok(base.evidence.bandLocalEndpoints.acceptedCount > 0)
	assert.ok(base.evidence.bandLocalEndpointFamilies.length >= 2)
	const endpointHypotheses = base.supplementalAvailability.fieldHypotheses.filter(({ sourceType }) =>
		sourceType === "band-local-endpoint")
	assert.equal(base.fieldHypotheses.filter(({ sourceType }) => sourceType === "band-local-endpoint").length,
		base.diagnostics.bandLocalEndpoint.legalHypothesisCount)
	const endpointDescriptors = base.supplementalAvailability.logicalDescriptors.filter(({ sourceType }) =>
		sourceType === "band-local-endpoint")
	assert.ok(endpointHypotheses.length > 0)
	assert.ok(endpointDescriptors.length > 0)
	for (const family of base.evidence.bandLocalEndpointFamilies) {
		assert.ok(base.evidence.augmentedNative.families.includes(family))
		assert.ok(base.evidence.augmentedNative.retainedFamilyIds.includes(family.id))
		assert.ok(family.representatives.some((representative) =>
			!("generated" in representative.support) && representative.support.exactSource))
	}
	for (const descriptor of endpointDescriptors) {
		assert.equal(descriptor.lineage.sourceConnected, true)
		assert.equal(descriptor.fieldHypothesis.kind, "gradient-field")
		assert.ok(descriptor.fieldHypothesis.gradientEvidence)
	}
})

test("common construction leaves live 0.7.2 and closed 0.7.4 extraction byte-identical", () => {
	const image = transitionField()
	const liveBefore = JSON.stringify(extractAlbumArtworkPaletteV2(image))
	const closedBefore = JSON.stringify(extractAlbumArtworkPaletteV2074(image))
	buildAlbumArtworkPaletteV2Phase3CommonBase(image)
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2(image)), liveBefore)
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2074(image)), closedBefore)
})

test("common base has no outcome policy, evaluation metadata, or direct v1 implementation dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-common-base.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:winner|slate|selectionAuthority|anchorPrefix|forcedReservation|fillToEight|familyOnlyIdentityCredit)/iu)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|caseId|artworkId|feedback|review|warehouse|manifest|sourceId|targetColor)/iu)
	assert.doesNotMatch(source,
		/(?:phase-3-materialization|phase-3-selector)\.ts/u)
})
