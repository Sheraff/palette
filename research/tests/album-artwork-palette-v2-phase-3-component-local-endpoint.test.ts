import assert from "node:assert/strict"
import test from "node:test"
import {
	buildNativePaletteEvidence,
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
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY,
	decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation,
} from "../src/album-artwork-palette-v2-phase-3-parallel-arms.ts"
import type {
	AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate,
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

const BASELINE_SLATE = ["flat-winner", "baseline-middle", "baseline-tail"] as const

function reservationCandidate(
	values: Partial<AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate> = {},
): AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate {
	return {
		key: "earned-endpoint-gradient",
		gradient: true,
		gradientStatus: "earned-rendered",
		qualityUtility: 0.71,
		completeLineageEligible: true,
		...values,
	}
}

function reservationDecision(values: Partial<Parameters<
	typeof decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation
>[0]> = {}) {
	return decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation({
		baselineWinnerKey: BASELINE_SLATE[0],
		baselineWinnerGradient: false,
		baselineWinnerQualityUtility: 0.8,
		baselineSlateKeys: BASELINE_SLATE,
		candidates: [reservationCandidate()],
		...values,
	})
}

test("a flat incumbent reserves at most one earned complete-lineage gradient at the slate tail", () => {
	const candidates = [
		reservationCandidate(),
		reservationCandidate({ key: "second-earned-gradient", qualityUtility: 0.72 }),
	]
	const first = reservationDecision({ candidates })
	const second = reservationDecision({ candidates })

	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID.endsWith("-v3"), true)
	assert.equal(first.outputWinnerKey, BASELINE_SLATE[0])
	assert.equal(first.baselineWinnerUnchanged, true)
	assert.equal(first.reservedKey, candidates[0].key)
	assert.equal(first.reservedTreatmentCount,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY.maximumReservedTreatments)
	assert.deepEqual(first.outputSlateKeys, [BASELINE_SLATE[0], BASELINE_SLATE[1], candidates[0].key])
	assert.deepEqual(first.outputSlateKeys.slice(0, -1), BASELINE_SLATE.slice(0, -1))
	assert.equal(first.replacedBaselineKey, BASELINE_SLATE.at(-1))
	assert.equal(first.baselinePrefixPreserved, true)
	assert.equal(first.reservedCompleteLineageEligible, true)
	assert.ok(first.reservedQualityLossFromBaselineWinner! <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY.maximumQualityLoss + 1e-12)
	assert.deepEqual(first.rejectionReasons, [])
	assert.deepEqual(first, second)
})

test("a gradient incumbent is an exact reservation no-op even with an otherwise eligible candidate", () => {
	const baselineSlateKeys = [...BASELINE_SLATE]
	const decision = reservationDecision({ baselineWinnerGradient: true, baselineSlateKeys })

	assert.equal(decision.outputSlateKeys, baselineSlateKeys)
	assert.equal(decision.reservedKey, null)
	assert.equal(decision.reservedTreatmentCount, 0)
	assert.equal(decision.replacedBaselineKey, null)
	assert.equal(decision.gates.integratedIncumbentFlat, false)
	assert.deepEqual(decision.rejectionReasons, ["integrated-incumbent-is-gradient"])
	assert.ok(decision.candidateEvaluations.every(({ eligible, rejectionReasons }) =>
		!eligible && rejectionReasons.includes("integrated-incumbent-is-gradient")))
})

test("a projected flat baseline can quality-bound additions without materialized winner lineage", () => {
	const projectedWinnerKey = "source-connected-projected-flat"
	let decision: ReturnType<typeof reservationDecision> | undefined
	assert.doesNotThrow(() => {
		decision = reservationDecision({
			baselineWinnerKey: projectedWinnerKey,
			baselineSlateKeys: [projectedWinnerKey, "baseline-tail"],
			baselineWinnerQualityUtility: 0.79,
			candidates: [reservationCandidate({ qualityUtility: 0.70 })],
		})
	})
	assert.equal(decision?.reservedKey, "earned-endpoint-gradient")
	assert.equal(decision?.gates.baselineWinnerQualityAvailable, true)
	assert.equal(decision?.candidateEvaluations[0].gates.candidateCompleteLineageEligible, true)
	assert.ok(Math.abs((decision?.candidateEvaluations[0].qualityLossFromBaselineWinner ?? 0) - 0.09) < 1e-12)
})

test("reservation fails closed for unavailable custody, lineage, winner, and candidate gates", () => {
	const noQuality = reservationDecision({ baselineWinnerQualityUtility: null })
	assert.equal(noQuality.reservedKey, null)
	assert.deepEqual(noQuality.outputSlateKeys, BASELINE_SLATE)
	assert.ok(noQuality.rejectionReasons.includes("baseline-winner-quality-unavailable"))

	const noLineage = reservationDecision({
		candidates: [reservationCandidate({ completeLineageEligible: false })],
	})
	assert.equal(noLineage.reservedKey, null)
	assert.ok(noLineage.rejectionReasons.includes(
		"endpoint-candidate-is-not-complete-lineage-eligible"))

	const wrongWinner = reservationDecision({ baselineWinnerKey: "not-the-slate-head" })
	assert.equal(wrongWinner.reservedKey, null)
	assert.ok(wrongWinner.rejectionReasons.includes("integrated-winner-is-not-slate-head"))

	const noTail = reservationDecision({ baselineSlateKeys: [BASELINE_SLATE[0]] })
	assert.equal(noTail.reservedKey, null)
	assert.ok(noTail.rejectionReasons.includes("baseline-slate-has-no-replaceable-tail"))

	const rejected = reservationDecision({
		candidates: [reservationCandidate({
			key: BASELINE_SLATE[1],
			gradient: false,
			gradientStatus: "unearned",
			qualityUtility: 0.5,
		})],
	})
	assert.equal(rejected.reservedKey, null)
	assert.deepEqual(rejected.candidateEvaluations[0].rejectionReasons, [
		"endpoint-candidate-is-not-gradient",
		"endpoint-candidate-gradient-is-not-earned",
		"endpoint-candidate-exceeds-quality-loss-limit",
		"endpoint-candidate-is-already-in-baseline-slate",
	])
})
