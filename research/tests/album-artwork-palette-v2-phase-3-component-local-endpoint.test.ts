import assert from "node:assert/strict"
import test from "node:test"
import {
	buildNativePaletteEvidence,
	completeTreatmentKey,
	diagnoseGradientFits,
} from "../src/album-artwork-palette-v2.ts"
import type {
	GradientFitDiagnostic,
	NativePaletteEvidence,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY,
	buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm,
} from "../src/album-artwork-palette-v2-phase-3-arm-component-local-endpoint.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY,
	extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint,
} from "../src/album-artwork-palette-v2-phase-3-parallel-arms.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_REFINABLE_UPSTREAM_REASON,
	buildBandLocalEndpointRefinements,
} from "../src/album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import { oklabToRGB } from "../src/color.ts"
import type { RawImage } from "../src/types.ts"

type EndpointPattern = "none" | "coherent" | "fragmented" | "localized" | "three-components"

function field(pattern: EndpointPattern): RawImage {
	const width = 144
	const height = 96
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let lightness = 0.46 + 0.095 * x / (width - 1)
			if (pattern === "coherent" && x >= 132) lightness -= 0.05
			if (pattern === "fragmented" && x >= 116 && x % 4 === 0) lightness -= 0.05
			if (pattern === "localized" && x >= 132 && x < 136 && y >= 36 && y < 60) lightness -= 0.05
			if (pattern === "three-components" && x >= 116 && y < 32) lightness -= 0.055
			if (pattern === "three-components" && x >= 116 && y >= 64) lightness += 0.055
			data.set(oklabToRGB([lightness, 0.018, -0.025]), (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function completeField(): RawImage {
	const image = field("coherent")
	for (let y = 40; y < 52; y++) {
		for (let x = 60; x < 72; x++) {
			image.data.set(oklabToRGB([0.92, 0.018, -0.025]), (y * image.width + x) * 3)
		}
	}
	return image
}

function horizontalDiagnostic(evidence: NativePaletteEvidence): GradientFitDiagnostic {
	const diagnostic = diagnoseGradientFits(evidence).find(({ topology, direction }) =>
		topology === "linear" && direction === "horizontal")
	assert.ok(diagnostic)
	return diagnostic
}

test("the opt-in arm exposes one coherent component-local alternative without changing the default refiner", () => {
	const image = field("coherent")
	const evidence = buildNativePaletteEvidence(image)
	const diagnostics = diagnoseGradientFits(evidence)
	const diagnostic = horizontalDiagnostic(evidence)
	assert.deepEqual(diagnostic.rejectionReasons, [])
	const defaultBefore = buildBandLocalEndpointRefinements(evidence, diagnostics)
	const nativeFamilyCount = evidence.families.length
	const diagnosticBefore = structuredClone(diagnostic)

	const report = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(evidence, [diagnostic])
	const fit = report.fits[0]
	assert.ok(fit)
	const high = fit.bands[1]
	assert.equal(report.additiveFamilyCount, 1)
	assert.equal(fit.eligibility, "accepted")
	assert.equal(fit.topology, diagnostic.topology)
	assert.equal(fit.direction, diagnostic.direction)
	assert.equal(high.detectedModeCount, 2)
	assert.equal(high.occupiedAlternativeModeCount, 1)
	assert.equal(high.coherentAlternativeModeCount, 1)
	assert.equal(high.lineageEligibleModeCount, 1)
	assert.equal(high.additiveFamilies.length, 1)
	assert.equal(fit.bands[0].additiveFamilies.length, 0)

	const addition = high.additiveFamilies[0]
	const fieldFamilyIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	assert.equal(addition.family.population, addition.component.population)
	assert.equal(addition.lineage.ownedPixelCount, addition.component.population)
	assert.ok(addition.component.bandFraction >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.minimumComponentBandShare)
	assert.ok(addition.component.modeFraction >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.minimumComponentModeShare)
	assert.ok(addition.component.modeFraction >= 0 && addition.component.modeFraction <= 1)
	assert.equal(addition.component.modeFraction,
		addition.component.population / addition.component.neighborhoodPopulation)
	assert.equal(addition.component.modeFraction,
		high.alternativeModes.find(({ largestComponentPopulation }) =>
			largestComponentPopulation === addition.component.population)?.largestComponentModeFraction)
	assert.ok(addition.mode.distanceFromExistingMode >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumOccupiedModeDistance)
	assert.ok(addition.lineage.sourceFamilyIds.length > 0)
	assert.ok(addition.lineage.sourceFamilyIds.every((id) => fieldFamilyIds.has(id)))
	assert.equal(addition.family.representatives.length, 1)
	const support = addition.family.representatives[0].support
	assert.equal("generated" in support, false)
	if (!("generated" in support)) {
		assert.equal(support.exactSource, true)
		assert.equal(support.anchorFamilyId, addition.family.id)
		assert.ok(support.regionIds.length > 0)
		assert.ok(support.regionIds.every((id) => id.startsWith(`${addition.family.id}-region-`)))
	}

	assert.deepEqual(diagnostic, diagnosticBefore)
	assert.equal(evidence.families.length, nativeFamilyCount)
	assert.deepEqual(buildBandLocalEndpointRefinements(evidence, diagnostics), defaultBefore)
	assert.deepEqual(buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(evidence, [diagnostic]), report)
})

test("fragmented stripes and localized lighting do not create component-local endpoint families", () => {
	const fragmentedEvidence = buildNativePaletteEvidence(field("fragmented"))
	const fragmentedDiagnostic = horizontalDiagnostic(fragmentedEvidence)
	assert.deepEqual(fragmentedDiagnostic.rejectionReasons, [])
	const fragmented = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(
		fragmentedEvidence,
		[fragmentedDiagnostic],
	)
	const fragmentedBand = fragmented.fits[0].bands[1]
	assert.equal(fragmentedBand.occupiedAlternativeModeCount, 1)
	assert.equal(fragmentedBand.coherentAlternativeModeCount, 0)
	assert.ok(fragmentedBand.alternativeModes[0].largestComponentBandFraction <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.minimumComponentBandShare)
	assert.equal(fragmented.additiveFamilyCount, 0)

	const localizedEvidence = buildNativePaletteEvidence(field("localized"))
	const localizedDiagnostic = horizontalDiagnostic(localizedEvidence)
	assert.deepEqual(localizedDiagnostic.rejectionReasons, [])
	const localized = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(
		localizedEvidence,
		[localizedDiagnostic],
	)
	const localizedBand = localized.fits[0].bands[1]
	assert.equal(localizedBand.occupiedAlternativeModeCount, 0)
	assert.equal(localizedBand.additiveFamilies.length, 0)
	assert.equal(localized.additiveFamilyCount, 0)
})

test("ordinary single-mode endpoints remain negative and independently rejected fits are not inspected", () => {
	const evidence = buildNativePaletteEvidence(field("none"))
	const diagnostic = horizontalDiagnostic(evidence)
	assert.deepEqual(diagnostic.rejectionReasons, [])
	const ordinary = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(evidence, [diagnostic])
	assert.equal(ordinary.additiveFamilyCount, 0)
	assert.ok(ordinary.fits.every(({ bands }) => bands.every(({ occupiedAlternativeModeCount }) =>
		occupiedAlternativeModeCount === 0)))

	const rejected = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(evidence, [{
		...diagnostic,
		rejectionReasons: ["independent fit rejection"],
	}])
	assert.equal(rejected.inputEligibleFitCount, 0)
	assert.equal(rejected.inspectedFitCount, 0)
	assert.equal(rejected.additiveFamilyCount, 0)
})

test("refinable fits retain at most two additive families per endpoint band", () => {
	const evidence = buildNativePaletteEvidence(field("three-components"))
	const diagnostic = horizontalDiagnostic(evidence)
	assert.deepEqual(diagnostic.rejectionReasons, [
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_REFINABLE_UPSTREAM_REASON,
	])
	const report = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(evidence, [diagnostic])
	assert.equal(report.inspectedFitCount, 1)
	assert.equal(report.fits[0].eligibility, "refinable")
	const high = report.fits[0].bands[1]
	assert.equal(high.detectedModeCount, 3)
	assert.equal(high.lineageEligibleModeCount, 2)
	assert.equal(high.additiveFamilies.length, 2)
	assert.ok(report.fits.every(({ bands }) => bands.every(({ additiveFamilies }) =>
		additiveFamilies.length <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.maximumAdditiveFamiliesPerBand)))
	assert.equal(report.additiveFamilyCount, 2)
	assert.ok(report.fits.every(({ bands }) => bands.every(({ additiveFamilies }) =>
		additiveFamilies.every(({ component }) => component.modeFraction >= 0 && component.modeFraction <= 1 &&
			component.modeFraction === component.population / component.neighborhoodPopulation))))
})

test("endpoint custody is supplemental-only, winner-immutable, prefix-additive, and fully diagnosed", () => {
	const image = completeField()
	const baselineDetails = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const baseline = baselineDetails.result
	const first = extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(image)
	const second = extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(image)
	const diagnostics = first.diagnostics.phase3ComponentLocalEndpoint
	const baselineDiagnostics = baseline.diagnostics.phase3IntegratedCandidate
	const baselineKeys = baseline.alternatives.map(completeTreatmentKey)
	const outputKeys = first.alternatives.map(completeTreatmentKey)
	const winnerKey = completeTreatmentKey(baseline.winner)

	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID.endsWith("-v2"), true)
	assert.equal(diagnostics.version.endsWith("-v2"), true)
	assert.equal(completeTreatmentKey(first.winner), winnerKey)
	assert.equal(diagnostics.endpointSlateReservation.baselineWinnerKey, winnerKey)
	assert.equal(diagnostics.endpointSlateReservation.outputWinnerKey, winnerKey)
	assert.equal(diagnostics.endpointSlateReservation.baselineWinnerUnchanged, true)
	assert.equal(diagnostics.endpointSlateReservation.winnerAuthority, "integrated-baseline")
	assert.equal(diagnostics.endpointSlateReservation.selectorAuthority, "evaluation-only")
	assert.deepEqual(diagnostics.endpointSlateReservation.baselineSlateKeys, baselineKeys)
	assert.deepEqual(diagnostics.endpointSlateReservation.outputSlateKeys, outputKeys)
	assert.equal(outputKeys.length, baselineKeys.length)
	assert.deepEqual(outputKeys.slice(0, -1), baselineKeys.slice(0, -1))
	assert.equal(diagnostics.endpointSlateReservation.baselinePrefixPreserved, true)
	assert.notEqual(diagnostics.endpointSlateReservation.candidateKey, null)
	assert.equal(diagnostics.endpointSlateReservation.candidateCompleteLineageEligible, true)
	assert.notEqual(diagnostics.endpointSlateReservation.reservedKey, null)
	assert.ok(diagnostics.endpointSlateReservation.reservedKey === null ||
		diagnostics.endpointSlateReservation.reservedKey === outputKeys.at(-1))
	assert.ok(diagnostics.endpointSlateReservation.reservedKey === null ||
		diagnostics.endpointSlateReservation.replacedBaselineKey === baselineKeys.at(-1))
	assert.ok(diagnostics.endpointSlateReservation.reservedQualityLossFromBaselineWinner === null ||
		diagnostics.endpointSlateReservation.reservedQualityLossFromBaselineWinner <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY.maximumQualityLoss + 1e-12)

	assert.deepEqual(diagnostics.materialization.baselineCustody, baselineDiagnostics.materialization)
	assert.equal(diagnostics.domain.baselineMaterializedTreatmentCount,
		baselineDiagnostics.domain.materializedTreatmentCount)
	assert.equal(diagnostics.domain.materializedTreatmentCount,
		diagnostics.selector.domain.materializedTreatmentCount)
	assert.equal(diagnostics.domain.materializedTreatmentCount,
		diagnostics.domain.baselineMaterializedTreatmentCount +
			diagnostics.domain.supplementalOnlyMaterializedTreatmentCount)
	assert.equal(diagnostics.materialization.baselineCustody.capacity, 1_500)
	assert.equal(diagnostics.materialization.supplementalOnly.capacity, 1_500)
	assert.ok(diagnostics.materialization.baselineCustody.materializedTreatmentCount <= 1_500)
	assert.ok(diagnostics.materialization.supplementalOnly.materializedTreatmentCount <= 1_500)
	const evaluationKeys = new Set(diagnostics.selector.evaluations.map(({ key }: { key: string }) => key))
	assert.ok(baselineDetails.custodyMaterialized.every(({ key }) => evaluationKeys.has(key)))
	assert.ok(outputKeys.every((key) => evaluationKeys.has(key)))
	if (diagnostics.endpointSlateReservation.reservedKey !== null) {
		const eligibility = diagnostics.lineageEligibility.candidates.find(({ key }: { key: string }) =>
			key === diagnostics.endpointSlateReservation.reservedKey)
		assert.equal(eligibility?.eligible, true)
		assert.equal(eligibility?.basis, "ordinary-complete-source-lineage")
		assert.equal(diagnostics.endpointSlateReservation.reservedCompleteLineageEligible, true)
	}
	assert.equal(JSON.stringify(first), JSON.stringify(second))
})
