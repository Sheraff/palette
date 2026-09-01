import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildFieldHypotheses,
	buildNativePaletteEvidence,
	evaluateIdentityQualityGuard,
	extractAlbumArtworkPaletteV2,
	fieldSamples,
	filterIdentityQualityGuardCandidates,
	hasPeakAPCAObservability,
	isExactOverlayGradientChallenger,
	pathObservability,
	paretoDominates,
	paretoFrontier,
	retainPeakObservableFamilyDirections,
	selectExactOverlayGradientChallenger,
	selectQualityGuardedIdentityChallenger,
	treatmentFoundation,
} from "../src/album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment, IdentityObligation } from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "../src/album-artwork-palette-v2-protocol.ts"
import { parseCaseFeedbackSubmission } from "../src/album-artwork-palette-v2-review.ts"
import { parseLightweightReviewSubmission } from "../src/album-artwork-palette-v2-lightweight-review.ts"
import { parseTargetedReviewSubmission } from "../src/album-artwork-palette-v2-targeted-review.ts"
import { apcaContrast, okDistance, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import type { RGB, RawImage } from "../src/types.ts"

function fixture(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const rgb = pixel(x, y)
			const offset = (y * width + x) * 3
			data[offset] = rgb[0]
			data[offset + 1] = rgb[1]
			data[offset + 2] = rgb[2]
		}
	}
	return { width, height, data }
}

function nearestFamily(evidence: ReturnType<typeof buildNativePaletteEvidence>, rgb: RGB) {
	const target = rgbToOKLab(rgb)
	return [...evidence.families].sort((first, second) =>
		okDistance(first.prototype, target) - okDistance(second.prototype, target))[0]
}

function assertPaletteInvariants(result: ReturnType<typeof extractAlbumArtworkPaletteV2>): void {
	for (const treatment of result.alternatives) {
		const roles = [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex]
		assert.equal(new Set(roles).size, treatment.cardinality)
		assert.ok(treatment.cardinality >= 2 && treatment.cardinality <= 4)
		assert.notEqual(treatment.background.hex, treatment.foreground.hex)
		assert.equal(treatment.collapse.surface, treatment.surface.hex === treatment.background.hex)
		assert.equal(treatment.collapse.accent, treatment.accent.hex === treatment.foreground.hex)
		assert.equal(treatment.gradient && treatment.collapse.surface, false)
		if (treatment.gradient) {
			assert.ok(okDistance(treatment.background.oklab, treatment.surface.oklab) >= 0.028)
			assert.notEqual(treatment.gradientEvidence, null)
		}
		assert.ok(treatment.contrast.pairs.length > 0)
		assert.ok(treatment.contrast.pairs.every(({ signedLc, absoluteLc }) =>
			Number.isFinite(signedLc) && Number.isFinite(absoluteLc)))
		assert.ok(hasPeakAPCAObservability(treatment.contrast.pairs
			.filter(({ role }) => role === "foreground")
			.map(({ signedLc }) => signedLc)))
		if (!treatment.collapse.accent) {
			assert.ok(hasPeakAPCAObservability(treatment.contrast.pairs
				.filter(({ role }) => role === "accent")
				.map(({ signedLc }) => signedLc)))
		}
	}
	const challenger = result.diagnostics.exactOverlayGradientChallenger
	assert.ok(challenger.projectedAttemptCount <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.gradientChallengerProjections)
	assert.ok(challenger.projectedLegalCount <= challenger.projectedAttemptCount)
	assert.ok(challenger.projectedUniqueCount <= challenger.projectedLegalCount)
	assert.equal(challenger.replacedPrimaryWinner, challenger.selectedChallengerId !== null)
	assert.equal(result.diagnostics.paretoRanking.selectedTreatmentId, result.winner.id)
	assert.ok(result.alternatives.some(({ id }) =>
		id === result.diagnostics.paretoRanking.globalParetoTopTreatmentId))
	if (challenger.replacedPrimaryWinner) {
		const primary = result.alternatives[1]
		assert.ok(primary)
		assert.equal(result.diagnostics.paretoRanking.primaryTreatmentId, primary.id)
		assert.equal(isExactOverlayGradientChallenger(primary, result.winner), true)
	} else {
		assert.equal(result.diagnostics.paretoRanking.primaryTreatmentId, result.winner.id)
	}
}

test("native evidence retains coherent and repeated signatures while isolated noise stays weaker", () => {
	const red: RGB = [238, 40, 45]
	const blue: RGB = [32, 63, 126]
	const image = fixture(96, 96, (x, y) => {
		if (x === 2 && y === 2) return [0, 255, 0]
		if ((x >= 14 && x < 21 && y >= 16 && y < 23) || (x >= 70 && x < 77 && y >= 68 && y < 75)) return red
		return blue
	})
	const evidence = buildNativePaletteEvidence(image)
	const coherent = nearestFamily(evidence, red)
	const noise = nearestFamily(evidence, [0, 255, 0])

	assert.equal(evidence.width, 96)
	assert.equal(evidence.height, 96)
	assert.equal(evidence.pixelCount, 96 * 96)
	assert.ok(coherent.repeatedComponentCount >= 2)
	assert.ok(coherent.signatureScore > noise.signatureScore)
	assert.ok(evidence.lanes.find(({ name }) => name === "signature")?.familyIds.includes(coherent.id))
	assert.ok(evidence.lanes.find(({ name }) => name === "field")?.familyIds.includes(nearestFamily(evidence, blue).id))
})

test("compression-like variation remains a tolerant broad family", () => {
	const image = fixture(80, 80, (x, y) => {
		const variation = (x * 17 + y * 31) % 5 - 2
		return [90 + variation, 121 - variation, 151 + variation]
	})
	const evidence = buildNativePaletteEvidence(image)
	const dominant = [...evidence.families].sort((first, second) => second.population - first.population)[0]

	assert.ok(dominant.populationFraction > 0.95)
	assert.ok(dominant.perceptualBinCount >= 1)
	assert.ok(dominant.fieldScore > 0.7)
})

test("distinct source modes emit source-backed colors rather than their empty centroid", () => {
	const red: RGB = [235, 35, 45]
	const blue: RGB = [25, 55, 225]
	const evidence = buildNativePaletteEvidence(fixture(72, 72, (x) => x < 36 ? red : blue))
	const emitted = evidence.families.flatMap(({ representatives }) => representatives.map(({ rgb }) => rgb))

	assert.ok(emitted.some((rgb) => rgb[0] === red[0] && rgb[1] === red[1] && rgb[2] === red[2]))
	assert.ok(emitted.some((rgb) => rgb[0] === blue[0] && rgb[1] === blue[1] && rgb[2] === blue[2]))
	assert.equal(emitted.some(([redChannel, , blueChannel]) => redChannel > 90 && blueChannel > 90), false)
})

test("smooth native transition produces endpoint-backed gradient evidence", () => {
	const image = fixture(120, 72, (x) => {
		const amount = x / 119
		return [
			Math.round(22 + 188 * amount),
			Math.round(45 + 82 * amount),
			Math.round(154 - 105 * amount),
		]
	})
	const evidence = buildNativePaletteEvidence(image)
	const gradients = buildFieldHypotheses(evidence).filter(({ kind }) => kind === "gradient-field")

	assert.ok(gradients.length > 0)
	assert.ok(gradients.every(({ gradientEvidence }) =>
		gradientEvidence !== null &&
		gradientEvidence.progression >= 0.35 &&
		gradientEvidence.supportingEndpointHexes[0] !== gradientEvidence.supportingEndpointHexes[1]))
})

test("discrete stripes and a textured photographic transition are not called gradients", () => {
	const stripes = fixture(120, 72, (x) => x < 40 ? [18, 35, 80] : x < 80 ? [115, 95, 90] : [225, 180, 65])
	const photographic = fixture(120, 72, (x, y) => {
		if (x > 24 && x < 98 && y > 10 && y < 64) {
			const amount = (x - 25) / 72
			const object: RGB = [
				Math.round(35 + 145 * amount),
				Math.round(55 + 70 * amount),
				Math.round(135 - 55 * amount),
			]
			const checker = (x + y) % 2 === 0 ? 78 : -78
			return [
				Math.max(0, Math.min(255, object[0] + checker)),
				Math.max(0, Math.min(255, object[1] - checker)),
				Math.max(0, Math.min(255, object[2] + checker)),
			]
		}
		return [30, 35, 45]
	})

	assert.equal(buildFieldHypotheses(buildNativePaletteEvidence(stripes)).some(({ kind }) => kind === "gradient-field"), false)
	assert.equal(buildFieldHypotheses(buildNativePaletteEvidence(photographic)).some(({ kind }) => kind === "gradient-field"), false)
})

test("gradient fitting owns a connected background field and excludes a contrasting object", () => {
	const object: RGB = [238, 42, 54]
	const image = fixture(120, 80, (x, y) => {
		if (x >= 44 && x < 76 && y >= 24 && y < 56) return object
		const amount = x / 119
		return [Math.round(24 + 150 * amount), Math.round(52 + 66 * amount), Math.round(150 - 70 * amount)]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const gradient = result.diagnostics.fieldHypotheses.find(({ kind }) => kind === "gradient-field")
	const objectFamily = nearestFamily(buildNativePaletteEvidence(image), object)

	assert.ok(gradient?.gradientEvidence)
	const domain = result.diagnostics.fieldDomains.find(({ id }) => id === gradient.gradientEvidence?.fieldDomainId)
	assert.ok(domain)
	assert.ok(domain.populationFraction > 0.5)
	assert.ok(domain.ownedCornerCount >= 2)
	assert.equal(domain.familyIds.includes(objectFamily.id), false)
	assert.equal(gradient.gradientEvidence.supportingFamilyIds.includes(objectFamily.id), false)
})

test("smooth lighting confined to an interior object is not a background gradient", () => {
	const image = fixture(120, 80, (x, y) => {
		if (x >= 30 && x < 90 && y >= 18 && y < 64) {
			const amount = (x - 30) / 59
			return [Math.round(70 + 120 * amount), Math.round(35 + 80 * amount), Math.round(40 + 40 * amount)]
		}
		return [25, 31, 40]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	assert.equal(result.diagnostics.fieldHypotheses.some(({ kind }) => kind === "gradient-field"), false)
	assert.ok(result.diagnostics.fieldDomains.some(({ rejectionReasons }) =>
		rejectionReasons.includes("field domain owns fewer than two native corner fields")))
})

test("flat fields require component-backed field ownership rather than an irregular interior object", () => {
	const background: RGB = [25, 55, 90]
	const surface: RGB = [205, 70, 45]
	const object = fixture(96, 96, (x, y) =>
		x >= 56 && x < 86 && y >= 10 && y < 50 && (x * 17 + y * 29) % 10 < 4 ? surface : background)
	const layer = fixture(96, 96, (_x, y) => y >= 66 ? surface : background)
	const objectEvidence = buildNativePaletteEvidence(object)
	const layerEvidence = buildNativePaletteEvidence(layer)
	const objectSurfaceFamily = nearestFamily(objectEvidence, surface).id
	const layerSurfaceFamily = nearestFamily(layerEvidence, surface).id

	assert.equal(buildFieldHypotheses(objectEvidence).some(({ kind, surfaceFamilyId }) =>
		kind === "separate-flat-fields" && surfaceFamilyId === objectSurfaceFamily), false)
	assert.equal(buildFieldHypotheses(layerEvidence).some(({ kind, surfaceFamilyId }) =>
		kind === "separate-flat-fields" && surfaceFamilyId === layerSurfaceFamily), true)
})

test("same-family tonal endpoints remain eligible when native progression is continuous", () => {
	const image = fixture(132, 72, (x) => {
		const amount = x / 131
		const lightness = 0.47 + 0.08 * amount
		return oklabToRGB([lightness, 0.015, -0.02])
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const gradient = result.diagnostics.fieldHypotheses.find(({ kind }) => kind === "gradient-field")
	assert.ok(gradient?.gradientEvidence)
	assert.notEqual(gradient.gradientEvidence.supportingEndpointHexes[0], gradient.gradientEvidence.supportingEndpointHexes[1])
})

test("gradient topology order is distinct from semantic field-role ownership", () => {
	const center: RGB = [20, 122, 196]
	const perimeter: RGB = [42, 20, 78]
	const image = fixture(132, 132, (x, y) => {
		const radius = Math.hypot((x - 65.5) / 65.5, (y - 65.5) / 65.5) / Math.SQRT2
		const amount = Math.max(0, Math.min(1, radius))
		return [
			Math.round(center[0] + (perimeter[0] - center[0]) * amount),
			Math.round(center[1] + (perimeter[1] - center[1]) * amount),
			Math.round(center[2] + (perimeter[2] - center[2]) * amount),
		]
	})
	const evidence = buildNativePaletteEvidence(image)
	const gradient = buildFieldHypotheses(evidence).find(({ kind, gradientEvidence }) =>
		kind === "gradient-field" && gradientEvidence?.topology === "radial-center")

	assert.ok(gradient?.gradientEvidence)
	assert.equal(gradient.gradientEvidence.backgroundTopologyEndpoint, "high")
	assert.equal(gradient.backgroundFamilyId, gradient.gradientEvidence.supportingFamilyIds[1])
	assert.equal(gradient.surfaceFamilyId, gradient.gradientEvidence.supportingFamilyIds[0])
	assert.equal(gradient.gradientEvidence.roleAssignment.backgroundFamilyId, gradient.backgroundFamilyId)
	assert.ok(gradient.gradientEvidence.roleAssignment.backgroundProfile.frameCoverage >
		gradient.gradientEvidence.roleAssignment.surfaceProfile.frameCoverage)
})

test("paired broad-field corridors recover a textured photographic transition without admitting stripes", () => {
	const image = fixture(132, 96, (x, y) => {
		if (y < 22) return [5, 8, 14]
		if (y >= 74) return [10, 100, 182]
		const amount = (y - 22) / 51
		const texture = (x * 19 + y * 31) % 7 < 3 ? -18 : 18
		return [
			Math.max(0, Math.min(255, Math.round(5 + 5 * amount + texture * amount * 0.15))),
			Math.max(0, Math.min(255, Math.round(8 + 92 * amount + texture))),
			Math.max(0, Math.min(255, Math.round(14 + 168 * amount + texture))),
		]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const gradient = result.diagnostics.fieldHypotheses.find(({ kind, gradientEvidence }) =>
		kind === "gradient-field" && gradientEvidence?.fieldDomainId.startsWith("paired-field-domain:"))
	assert.ok(gradient?.gradientEvidence)
	const domain = result.diagnostics.fieldDomains.find(({ id }) => id === gradient.gradientEvidence?.fieldDomainId)
	assert.equal(domain?.kind, "paired-corridor")
	assert.ok((domain?.transitionFamilyCount ?? 0) >= 3)
	assert.ok(gradient.gradientEvidence.progression >= 0.8 || (domain?.transitionPopulationFraction ?? 0) >= 0.3)
})

test("region observations retain repeated glyphs ahead of equal-population scattered noise", () => {
	const glyph: RGB = [245, 235, 210]
	const noise: RGB = [40, 245, 80]
	const image = fixture(128, 96, (x, y) => {
		for (let glyphIndex = 0; glyphIndex < 12; glyphIndex++) {
			const originX = 8 + (glyphIndex % 6) * 19
			const originY = 24 + Math.floor(glyphIndex / 6) * 28
			if (x >= originX && x < originX + 3 && y >= originY && y < originY + 7) return glyph
		}
		const noiseIndex = (x * 37 + y * 53) % 593
		if (noiseIndex < 2) return noise
		return [28, 47, 84]
	})
	const evidence = buildNativePaletteEvidence(image)
	const glyphFamily = nearestFamily(evidence, glyph)
	const noiseFamily = nearestFamily(evidence, noise)

	assert.ok(glyphFamily.observedComponentCount > 8)
	assert.ok(glyphFamily.foregroundTypographyObservation > noiseFamily.foregroundTypographyObservation)
	assert.ok(glyphFamily.signatureAccentObservation > noiseFamily.signatureAccentObservation)
	assert.ok(evidence.lanes.find(({ name }) => name === "foreground")?.familyIds.includes(glyphFamily.id))
	assert.ok(evidence.lanes.find(({ name }) => name === "signature")?.familyIds.includes(glyphFamily.id))
	const foregroundTrace = evidence.laneRetention.find(({ name }) => name === "foreground")
	assert.ok(foregroundTrace?.candidates.some(({ familyId, retained }) => familyId === glyphFamily.id && retained))
})

test("repeated typography preserves signed source-lightness polarity", () => {
	const typographyFixture = (foreground: RGB, field: RGB) => fixture(128, 96, (x, y) => {
		for (let glyphIndex = 0; glyphIndex < 12; glyphIndex++) {
			const originX = 8 + (glyphIndex % 6) * 19
			const originY = 24 + Math.floor(glyphIndex / 6) * 28
			if (x >= originX && x < originX + 3 && y >= originY && y < originY + 7) return foreground
		}
		return field
	})
	const lightEvidence = buildNativePaletteEvidence(typographyFixture([245, 235, 210], [28, 47, 84]))
	const darkEvidence = buildNativePaletteEvidence(typographyFixture([12, 18, 28], [228, 215, 188]))
	const lightTypography = nearestFamily(lightEvidence, [245, 235, 210])
	const darkTypography = nearestFamily(darkEvidence, [12, 18, 28])

	assert.ok(lightTypography.foregroundPolarityObservation.polarity < -0.9)
	assert.ok(darkTypography.foregroundPolarityObservation.polarity > 0.9)
	assert.ok(lightTypography.foregroundPolarityObservation.confidence > 0.5)
	assert.ok(darkTypography.foregroundPolarityObservation.confidence > 0.5)
	assert.ok(lightTypography.foregroundPolarityObservation.componentIds.length <=
		ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.typographyPolarityRegions)
	assert.ok(darkTypography.foregroundPolarityObservation.componentIds.length <=
		ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.typographyPolarityRegions)
})

test("candidate availability closes foreground and accent proposals over their role lanes", () => {
	const result = extractAlbumArtworkPaletteV2(fixture(96, 96, (x, y) => {
		if (x > 12 && x < 22 && y > 12 && y < 78) return [245, 235, 210]
		if ((x > 66 && x < 74 && y > 20 && y < 28) || (x > 72 && x < 80 && y > 62 && y < 70)) return [238, 50, 80]
		return [30, 62, 105]
	}))
	const trace = result.diagnostics.candidateAvailability
	assert.ok(trace.completeCandidateForegroundFamilyIds.every((familyId) => trace.foregroundLaneFamilyIds.includes(familyId)))
	assert.ok(trace.completeCandidateAccentFamilyIds.every((familyId) => trace.signatureLaneFamilyIds.includes(familyId)))
	assert.equal(result.diagnostics.paretoRanking.selectedTreatmentId, result.winner.id)
})

test("identity obligations remain inspectable from connected source evidence through winner explanation", () => {
	const image = fixture(96, 96, (x, y) => {
		if (x > 12 && x < 22 && y > 12 && y < 78) return [245, 235, 210]
		if ((x > 66 && x < 74 && y > 20 && y < 28) || (x > 72 && x < 80 && y > 62 && y < 70)) {
			return [238, 50, 80]
		}
		return [30, 62, 105]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const graph = result.diagnostics.identityObligationGraph

	assert.deepEqual(result, extractAlbumArtworkPaletteV2(image))
	assert.equal(result.version, "album-artwork-first-principles-0.7.2")
	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_VERSION)
	assert.equal(graph.version, "identity-obligation-graph-v3")
	assert.equal(result.diagnostics.paretoRanking.version, "pareto-identity-winner-diagnostics-v3")
	assert.equal(result.diagnostics.paretoRanking.qualityGuardVersion,
		"complete-quality-domain-non-inferiority-v1")
	assert.ok(graph.obligations.length >= 2)
	assert.ok(graph.obligations.length <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations)
	assert.equal(graph.nodes.length, graph.obligations.length * 6)
	assert.equal(graph.edges.length, graph.obligations.length * 5)
	assert.ok(graph.obligations.every(({ source }) =>
		source.regionIds.length > 0 &&
		source.connectedPopulationFraction > 0 &&
		source.materialDistanceFromField >= ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.materialDistance))
	for (const obligation of graph.obligations) {
		const nodes = graph.nodes.filter(({ obligationId }) => obligationId === obligation.id)
		assert.deepEqual(nodes.map(({ stage }) => stage), [
			"source-signature",
			"role-availability",
			"complete-treatment",
			"retention-frontier",
			"retained-slate",
			"winner-explanation",
		])
		const availability = nodes.find(({ stage }) => stage === "role-availability")!
		if (availability.status === "satisfied") {
			assert.ok(nodes.find(({ stage }) => stage === "complete-treatment")!.treatmentCount > 0)
			assert.ok(nodes.find(({ stage }) => stage === "retention-frontier")!.treatmentCount > 0)
			assert.ok(nodes.find(({ stage }) => stage === "retained-slate")!.treatmentCount > 0)
		}
	}
	assert.equal(graph.winnerExplanation.treatmentId, result.winner.id)
	assert.ok(graph.winnerExplanation.coveredObligationIds.length <=
		graph.winnerExplanation.maximumCompleteTreatmentCoverage)
	assert.deepEqual(
		[...graph.winnerExplanation.coveredObligationIds, ...graph.winnerExplanation.deferredObligationIds].sort(),
		[...graph.winnerExplanation.feasibleObligationIds].sort(),
	)
	assert.deepEqual(
		[...graph.winnerExplanation.qualityDeferredObligationIds,
			...graph.winnerExplanation.priorityDeferredObligationIds].sort(),
		[...graph.winnerExplanation.deferredObligationIds].sort(),
	)
	assert.equal(result.diagnostics.paretoRanking.identityCoverageRequiresQualityNonInferiority, true)
	assert.equal(result.diagnostics.paretoRanking.qualityIncumbentTreatmentId,
		result.diagnostics.paretoRanking.globalParetoTopTreatmentId)
	assert.ok(result.diagnostics.paretoRanking.identityRetentionFrontierCandidateCount >=
		result.diagnostics.paretoRanking.frontierCandidateCount)
	assert.ok(result.alternatives.some(({ id }) => id === result.diagnostics.paretoRanking.qualityIncumbentTreatmentId))
	if (result.diagnostics.paretoRanking.selectedIdentityChallengerQualityGuard) {
		assert.equal(result.diagnostics.paretoRanking.selectedIdentityChallengerQualityGuard.pass, true)
	}
})

test("winner explanation defers mutually exclusive obligations to reserved slate alternatives", () => {
	const signatures: RGB[] = [
		[245, 235, 210],
		[238, 50, 80],
		[35, 220, 95],
		[245, 190, 35],
	]
	const image = fixture(128, 112, (x, y) => {
		for (let index = 0; index < signatures.length; index++) {
			const originX = 12 + index * 28
			if (
				x >= originX && x < originX + 6 && y >= 18 && y < 28 ||
				x >= originX + 5 && x < originX + 11 && y >= 72 && y < 82
			) return signatures[index]
		}
		return [25, 50, 100]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const graph = result.diagnostics.identityObligationGraph

	assert.equal(graph.obligations.length, 4)
	assert.equal(graph.winnerExplanation.feasibleObligationIds.length, 4)
	assert.equal(graph.winnerExplanation.deferredObligationIds.length,
		4 - graph.winnerExplanation.coveredObligationIds.length)
	assert.equal(graph.winnerExplanation.selectionReason, "all-identity-challengers-failed-quality-guard")
	assert.ok(graph.winnerExplanation.qualityDeferredObligationIds.length > 0)
	assert.ok(graph.winnerExplanation.obligationDeferrals.every((deferral) =>
		deferral.completeCarrierCount > 0 && deferral.bestCarrierTreatmentId.length > 0 &&
		(deferral.reason === "all-complete-treatment-carriers-failed-quality-guard"
			? deferral.qualityEligibleCarrierCount === 0 && deferral.failedQualityGuardBlocks.length > 0
			: deferral.qualityEligibleCarrierCount > 0)))
	for (const obligationId of graph.winnerExplanation.deferredObligationIds) {
		const winnerNode = graph.nodes.find((node) =>
			node.obligationId === obligationId && node.stage === "winner-explanation")
		const slateNode = graph.nodes.find((node) =>
			node.obligationId === obligationId && node.stage === "retained-slate")
		assert.equal(winnerNode?.status, "deferred")
		assert.equal(slateNode?.status, "satisfied")
		assert.ok((slateNode?.treatmentCount ?? 0) > 0)
	}
})

test("identity obligation roots reject isolated one-pixel signature noise", () => {
	const coherent: RGB = [238, 40, 45]
	const noise: RGB = [0, 255, 0]
	const image = fixture(96, 96, (x, y) => {
		if (x === 2 && y === 2) return noise
		if ((x >= 14 && x < 21 && y >= 16 && y < 23) || (x >= 70 && x < 77 && y >= 68 && y < 75)) return coherent
		return [32, 63, 126]
	})
	const evidence = buildNativePaletteEvidence(image)
	const noiseFamilyId = nearestFamily(evidence, noise).id
	const coherentFamilyId = nearestFamily(evidence, coherent).id
	const graph = extractAlbumArtworkPaletteV2(image).diagnostics.identityObligationGraph

	assert.ok(graph.selection.notSourceConnectedFamilyIds.includes(noiseFamilyId))
	assert.equal(graph.obligations.some(({ familyId }) => familyId === noiseFamilyId), false)
	assert.ok(graph.obligations.some(({ familyId }) => familyId === coherentFamilyId))
})

test("foreground availability uses spare complete-candidate capacity beyond six directions", () => {
	const roleColors: RGB[] = [
		[245, 245, 245],
		[8, 8, 8],
		[245, 35, 45],
		[30, 220, 70],
		[30, 80, 245],
		[245, 220, 30],
		[20, 220, 225],
		[235, 35, 225],
		[245, 125, 25],
	]
	const image = fixture(160, 120, (x, y) => {
		for (let index = 0; index < roleColors.length; index++) {
			const originX = 8 + (index % 3) * 50
			const originY = 10 + Math.floor(index / 3) * 35
			if (
				(x >= originX && x < originX + 5 || x >= originX + 11 && x < originX + 16) &&
				y >= originY && y < originY + 10
			) return roleColors[index]
		}
		return [45, 70, 110]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const trace = result.diagnostics.candidateAvailability

	assert.ok(trace.foregroundsPerFieldVariantQuota > 6)
	assert.ok(trace.completeCandidateForegroundFamilyIds.length > 6)
	assert.ok(trace.completeCandidateForegroundFamilyIds.every((familyId) => trace.foregroundLaneFamilyIds.includes(familyId)))
	assert.ok(result.diagnostics.completeCandidateCount <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates)
})

test("peak observability uses APCA's literal dead-zone without a fitted positive floor", () => {
	const field: RGB = [40, 130, 70]
	const deadZoneAccent: RGB = [220, 40, 40]
	assert.equal(apcaContrast(deadZoneAccent, field), 0)
	assert.equal(hasPeakAPCAObservability([0, 0, 0]), false)
	assert.equal(hasPeakAPCAObservability([0, -8, 0]), true)
	assert.equal(hasPeakAPCAObservability([Number.NaN]), false)
	const secondField: RGB = [20, 20, 30]
	const mixedFieldContrasts = fieldSamples({
		background: { rgb: field, oklab: rgbToOKLab(field) },
		surface: { rgb: secondField, oklab: rgbToOKLab(secondField) },
		gradient: false,
	}).map(({ rgb }) => apcaContrast(deadZoneAccent, rgb))
	assert.equal(mixedFieldContrasts[0], 0)
	assert.notEqual(mixedFieldContrasts[1], 0)
	assert.equal(hasPeakAPCAObservability(mixedFieldContrasts), true)
	const result = extractAlbumArtworkPaletteV2(fixture(120, 96, (x, y) => {
		if ((x >= 18 && x < 28 && y >= 18 && y < 28) || (x >= 86 && x < 96 && y >= 68 && y < 78)) {
			return deadZoneAccent
		}
		if (x >= 52 && x < 57 && y >= 24 && y < 72) return [245, 245, 245]
		return field
	}))

	assertPaletteInvariants(result)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum, 0)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.requiredForegroundObservability,
		"at-least-one-sample-outside-apca-zero-dead-zone")
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.distinctAccentObservability,
		"at-least-one-sample-outside-apca-zero-dead-zone")
})

test("emergency generated fields expose source identity role availability before construction", () => {
	const image = fixture(96, 96, (x, y) => {
		if ((x >= 15 && x < 24 && y >= 18 && y < 27) || (x >= 68 && x < 77 && y >= 68 && y < 77)) {
			return [220, 40, 40]
		}
		return [40, 130, 70]
	})
	const result = extractAlbumArtworkPaletteV2(image)
	const graph = result.diagnostics.identityObligationGraph
	const obligation = graph.obligations[0]

	assert.equal(result.diagnostics.emergency.eligible, true)
	assert.ok(obligation)
	assert.equal(graph.nodes.find((node) =>
		node.obligationId === obligation.id && node.stage === "role-availability")?.status, "satisfied")
	assert.equal(graph.nodes.find((node) =>
		node.obligationId === obligation.id && node.stage === "complete-treatment")?.status, "satisfied")
	assert.ok(result.alternatives.some((treatment) =>
		treatment.familyRoles.foreground === obligation.familyId ||
		(!treatment.collapse.accent && treatment.familyRoles.accent === obligation.familyId)))
})

test("contrast diagnostics cover complete flat and gradient field paths", () => {
	const gradient = extractAlbumArtworkPaletteV2(fixture(132, 72, (x) => {
		const amount = x / 131
		return [
			Math.round(22 + 188 * amount),
			Math.round(45 + 82 * amount),
			Math.round(154 - 105 * amount),
		]
	})).alternatives.find(({ gradient }) => gradient)
	assert.ok(gradient)
	assert.deepEqual(gradient.contrast.pairs
		.filter(({ role }) => role === "foreground")
		.map(({ position }) => position), [0, 0.25, 0.5, 0.75, 1])
	assert.ok(gradient.contrast.pairs
		.filter(({ role }) => role === "foreground")
		.every(({ fieldRole }) => fieldRole === "gradient-sample"))

	const background: RGB = [25, 55, 90]
	const surface: RGB = [205, 70, 45]
	const backgroundRepresentative = { rgb: background, oklab: rgbToOKLab(background) }
	const surfaceRepresentative = { rgb: surface, oklab: rgbToOKLab(surface) }
	assert.deepEqual(fieldSamples({
		background: backgroundRepresentative,
		surface: surfaceRepresentative,
		gradient: false,
	}).map(({ role, position }) => [role, position]), [["background", 0], ["surface", 1]])
	assert.deepEqual(fieldSamples({
		background: backgroundRepresentative,
		surface: backgroundRepresentative,
		gradient: false,
	}).map(({ role, position }) => [role, position]), [["background", 0]])
})

test("unobservable role families are removed before the direction quota is filled", () => {
	const options = [
		{ family: { id: "blocked-a" }, signedContrasts: [0, 0] },
		{ family: { id: "blocked-b" }, signedContrasts: [0] },
		{ family: { id: "legal-c" }, signedContrasts: [0, 9] },
		{ family: { id: "legal-d" }, signedContrasts: [-12, 0] },
		{ family: { id: "legal-e" }, signedContrasts: [18, 20] },
	]
	const result = retainPeakObservableFamilyDirections(options, 2)
	assert.equal(result.rejectedCount, 2)
	assert.deepEqual(result.retained.map(({ family }) => family.id), ["legal-c", "legal-d"])
})

function treatmentWithScores(
	base: CompletePaletteTreatment,
	id: string,
	values: Partial<Record<keyof CompletePaletteTreatment["scores"], number>>,
): CompletePaletteTreatment {
	const scores = { ...base.scores, ...values }
	scores.fieldStructure = values.fieldStructure ?? scores.fieldFidelity * Math.sqrt(scores.surfaceFidelity)
	scores.fieldIdentity = values.fieldIdentity ?? Math.sqrt(scores.fieldStructure * scores.artworkIdentity)
	scores.treatmentFoundation = values.treatmentFoundation ?? treatmentFoundation(
		scores.fieldStructure,
		scores.artworkIdentity,
		scores.foregroundUtility,
		scores.activeRolePathObservability,
	)
	return { ...base, id, scores }
}

test("path observability softly lowers mixed-zero foundation and preserves peak eligibility", () => {
	assert.equal(pathObservability([12]), 1)
	assert.equal(pathObservability([-12, 9]), 1)
	assert.equal(pathObservability([8, 0, 0, 13, 19]), 0.6)
	assert.equal(pathObservability([]), 1)
	const fullyObservable = treatmentFoundation(0.72, 0.81, 0.6, 1)
	const mixedZero = treatmentFoundation(0.72, 0.81, 0.6, 0.6)
	assert.equal(fullyObservable, Math.cbrt(0.72 * 0.81 * 0.6))
	assert.equal(mixedZero, Math.cbrt(0.72 * 0.81 * 0.6 * 0.6))
	assert.ok(mixedZero < fullyObservable)
	assert.equal(hasPeakAPCAObservability([0, 8, 0]), true)
})

test("exact-overlay gradient challengers preserve roles and stay within one evidence level", () => {
	const extracted = extractAlbumArtworkPaletteV2(fixture(64, 64, (x) => x < 32 ? [24, 45, 90] : [230, 210, 170])).winner
	const primary = treatmentWithScores({ ...extracted, gradient: false, collapse: { ...extracted.collapse, accent: false } }, "primary", {
		treatmentFoundation: 0.79,
		generatedPenalty: 0,
	})
	const eligible = treatmentWithScores({
		...primary,
		id: "eligible",
		gradient: true,
		fieldTreatment: "gradient-field",
		gradientEvidence: {} as NonNullable<CompletePaletteTreatment["gradientEvidence"]>,
	}, "eligible", { treatmentFoundation: 0.72 })
	const tooWeak = treatmentWithScores({ ...eligible, id: "too-weak" }, "too-weak", { treatmentFoundation: 0.69 })
	const missingEvidence = { ...eligible, id: "missing-evidence", gradientEvidence: null }
	const flatCandidate = { ...eligible, id: "flat-candidate", gradient: false, gradientEvidence: null }
	const deterministicFirst = { ...eligible, id: "a-eligible" }
	const changedAccent = treatmentWithScores({
		...eligible,
		id: "changed-accent",
		accent: { ...eligible.accent, rgb: [1, 2, 3], hex: "#010203" },
	}, "changed-accent", { treatmentFoundation: 0.76 })
	assert.equal(isExactOverlayGradientChallenger(primary, eligible), true)
	assert.equal(isExactOverlayGradientChallenger(primary, missingEvidence), false)
	assert.equal(isExactOverlayGradientChallenger(primary, flatCandidate), false)
	assert.equal(isExactOverlayGradientChallenger(primary, changedAccent), false)
	assert.equal(selectExactOverlayGradientChallenger(primary, [tooWeak, changedAccent, eligible])?.id, "eligible")
	assert.equal(selectExactOverlayGradientChallenger(primary, [tooWeak, changedAccent]), null)
	assert.equal(selectExactOverlayGradientChallenger(primary, [eligible, deterministicFirst])?.id, "a-eligible")
	const completeGuardScores = Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) =>
		[block, 0.61]))
	const qualityIncumbent = treatmentWithScores(primary, "quality-incumbent", {
		...completeGuardScores,
		generatedPenalty: 0,
	})
	const blockedIdentityOverlay = treatmentWithScores(eligible, "blocked-identity-overlay", {
		...Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) =>
			[block, block === "surfaceFidelity" ? 0.59 : 0.99])),
		generatedPenalty: 0,
	})
	assert.equal(isExactOverlayGradientChallenger(primary, blockedIdentityOverlay), true)
	assert.deepEqual(evaluateIdentityQualityGuard(qualityIncumbent, blockedIdentityOverlay).resolvedLosses
		.map(({ block }) => block), ["surfaceFidelity"])
	const guardedOverlays = filterIdentityQualityGuardCandidates(qualityIncumbent, [blockedIdentityOverlay])
	assert.equal(guardedOverlays.evaluations.length, 1)
	assert.deepEqual(guardedOverlays.evaluations[0].resolvedLosses.map(({ block }) => block), ["surfaceFidelity"])
	assert.equal(selectExactOverlayGradientChallenger(primary, guardedOverlays.eligibleCandidates), null)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.gradientChallengerProjections, 6)
})

test("evidence-level Pareto is non-compensatory and ordered foundation rejects one-block collapse", () => {
	const base = extractAlbumArtworkPaletteV2(fixture(64, 64, (x) => x < 32 ? [24, 45, 90] : [230, 210, 170])).winner
	const balanced = treatmentWithScores(base, "balanced", {
		fieldFidelity: 0.6,
		artworkIdentity: 0.6,
		representativeness: 0.6,
		foregroundUtility: 0.6,
		accentUtility: 0.6,
		coherence: 0.6,
		economy: 0.6,
		generatorConfidence: 0.6,
		uiUtility: 0.6,
		generatedPenalty: 0,
	})
	const dominated = treatmentWithScores(base, "dominated", {
		fieldFidelity: 0.5,
		artworkIdentity: 0.5,
		representativeness: 0.5,
		foregroundUtility: 0.5,
		accentUtility: 0.5,
		coherence: 0.5,
		economy: 0.5,
		generatorConfidence: 0.5,
		uiUtility: 0.5,
		generatedPenalty: 0,
	})
	const fieldHeavy = treatmentWithScores(base, "field-heavy", {
		fieldFidelity: 0.95,
		artworkIdentity: 0.3,
		representativeness: 0.7,
		foregroundUtility: 0.7,
		accentUtility: 0.7,
		coherence: 0.7,
		economy: 0.7,
		generatorConfidence: 0.7,
		uiUtility: 0.7,
		generatedPenalty: 0,
	})
	const utilityPoor = treatmentWithScores(base, "utility-poor", {
		fieldFidelity: 0.7,
		artworkIdentity: 0.7,
		representativeness: 0.7,
		foregroundUtility: 0.1,
		accentUtility: 0.1,
		uiUtility: 0.1,
		coherence: 0.7,
		economy: 0.7,
		generatorConfidence: 0.7,
		generatedPenalty: 0,
	})
	assert.equal(paretoDominates(balanced, dominated), true)
	assert.equal(paretoDominates(balanced, fieldHeavy), false)
	assert.equal(paretoDominates(fieldHeavy, balanced), false)
	const frontier = paretoFrontier([utilityPoor, fieldHeavy, dominated, balanced])
	assert.deepEqual(frontier.map(({ id }) => id), ["balanced", "field-heavy", "utility-poor"])
})

test("evidence-level Pareto ignores raw differences below the declared score resolution", () => {
	const base = extractAlbumArtworkPaletteV2(fixture(64, 64, (x) => x < 32 ? [24, 45, 90] : [230, 210, 170])).winner
	const resolvedGain = treatmentWithScores(base, "resolved-gain", {
		fieldFidelity: 0.61,
		artworkIdentity: 0.8,
		representativeness: 0.8,
		foregroundUtility: 0.8,
		accentUtility: 0.9,
		coherence: 0.8,
		economy: 0.8,
		generatorConfidence: 0.8,
		generatedPenalty: 0,
	})
	const tinyRawLead = treatmentWithScores(base, "tiny-raw-lead", {
		fieldFidelity: 0.63,
		artworkIdentity: 0.8,
		representativeness: 0.8,
		foregroundUtility: 0.8,
		accentUtility: 0.8,
		coherence: 0.8,
		economy: 0.8,
		generatorConfidence: 0.8,
		generatedPenalty: 0,
	})
	assert.equal(paretoDominates(resolvedGain, tinyRawLead), true)
	assert.deepEqual(paretoFrontier([tinyRawLead, resolvedGain]).map(({ id }) => id), ["resolved-gain"])
})

test("complete quality-domain guard makes every Pareto and ordering block independently noncompensatory", () => {
	const base = extractAlbumArtworkPaletteV2(fixture(64, 64, (x) =>
		x < 32 ? [24, 45, 90] : [230, 210, 170])).winner
	const guardScores: Partial<Record<keyof CompletePaletteTreatment["scores"], number>> = {
		treatmentFoundation: 0.61,
		fieldIdentity: 0.61,
		fieldFidelity: 0.61,
		surfaceFidelity: 0.61,
		fieldStructure: 0.61,
		accentFidelity: 0.61,
		foregroundUtility: 0.61,
		accentUtility: 0.61,
		artworkIdentity: 0.61,
		representativeness: 0.61,
		coherence: 0.61,
		economy: 0.61,
		generatedPenalty: 0,
	}
	const incumbent = treatmentWithScores(base, "incumbent", guardScores)
	const sameLevels = treatmentWithScores(base, "same-levels", {
		...Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) => [block, 0.639])),
		generatedPenalty: 0,
	})
	const generatedPenaltyLoss = treatmentWithScores(base, "generated-penalty-loss", {
		...Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) => [block, 0.75])),
		generatedPenalty: 0.18,
	})

	assert.equal(evaluateIdentityQualityGuard(incumbent, sameLevels).pass, true)
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS, [
		...new Set([...ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS, ...ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS]),
	])
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.length, 12)
	for (const lostBlock of ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS) {
		const challenger = treatmentWithScores(base, `loss-${lostBlock}`, {
			...Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) =>
				[block, block === lostBlock ? 0.59 : 0.99])),
			generatedPenalty: 0,
		})
		const failed = evaluateIdentityQualityGuard(incumbent, challenger)
		assert.equal(failed.pass, false, lostBlock)
		assert.deepEqual(failed.resolvedLosses, [{
			block: lostBlock,
			incumbentEvidenceLevel: 15,
			challengerEvidenceLevel: 14,
			evidenceLevelLoss: 1,
		}])
	}
	assert.equal(evaluateIdentityQualityGuard(incumbent, generatedPenaltyLoss).pass, false)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.qualityGuard.version,
		"complete-quality-domain-non-inferiority-v1")
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.qualityGuard.blocks,
		ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS)
})

test("identity changes top-one only for a strict challenger that passes every guard block", () => {
	const base = extractAlbumArtworkPaletteV2(fixture(64, 64, (x) =>
		x < 32 ? [24, 45, 90] : [230, 210, 170])).winner
	const incumbent = treatmentWithScores({
		...base,
		familyRoles: { ...base.familyRoles, foreground: "ordinary", accent: "ordinary" },
		collapse: { ...base.collapse, accent: true },
	}, "incumbent", {
		treatmentFoundation: 0.61,
		fieldIdentity: 0.61,
		foregroundUtility: 0.61,
		accentUtility: 0.61,
		coherence: 0.61,
		economy: 0.61,
		generatedPenalty: 0,
	})
	const passing = treatmentWithScores({
		...incumbent,
		familyRoles: { ...incumbent.familyRoles, foreground: "identity-a" },
	}, "passing", {
		treatmentFoundation: 0.61,
		fieldIdentity: 0.61,
		foregroundUtility: 0.61,
		accentUtility: 0.61,
		coherence: 0.61,
		economy: 0.61,
		generatedPenalty: 0,
	})
	const blocked = treatmentWithScores({ ...passing }, "blocked", { fieldIdentity: 0.59 })
	const obligation: IdentityObligation = {
		id: "identity-obligation:identity-a",
		familyId: "identity-a",
		priority: 0,
		source: {
			regionIds: ["region-a"],
			connectedPopulationFraction: 0.1,
			materialDistanceFromField: 0.1,
			signatureRoleScore: 0.5,
			signatureEvidenceLevel: 12,
			regionEvidenceLevel: 12,
		},
	}

	const selected = selectQualityGuardedIdentityChallenger(incumbent, [incumbent, blocked, passing], [obligation])
	assert.deepEqual(selected.identityChallengers.map(({ id }) => id), ["blocked", "passing"])
	assert.deepEqual(selected.eligibleIdentityChallengers.map(({ id }) => id), ["passing"])
	assert.equal(selected.qualityGuardEvaluations.length, 2)
	assert.deepEqual(selected.qualityGuardEvaluations[0].resolvedLosses.map(({ block }) => block), ["fieldIdentity"])
	assert.deepEqual(selected.qualityGuardEvaluations[1].resolvedLosses, [])
	assert.equal(selected.selectedIdentityChallenger?.id, "passing")
	assert.equal(selectQualityGuardedIdentityChallenger(incumbent, [incumbent, blocked], [obligation])
		.selectedIdentityChallenger, null)
})

test("uniform art uses the tightly gated generated emergency and remains deterministic", () => {
	const image = fixture(64, 64, () => [0, 0, 0])
	const first = extractAlbumArtworkPaletteV2(image)
	const second = extractAlbumArtworkPaletteV2(image)

	assert.deepEqual(first, second)
	assert.equal(first.diagnostics.emergency.eligible, true)
	assert.equal(first.diagnostics.emergency.reason, "degenerate-supported-domain")
	assert.equal(first.diagnostics.emergency.thresholdExclusive, 5)
	assert.equal(first.winner.cardinality, 2)
	assert.ok([first.winner.background, first.winner.foreground].some(({ generated }) => generated))
	assertPaletteInvariants(first)
})

test("joint generation exposes legal collapse structures without a cardinality reward", () => {
	const image = fixture(96, 96, (x, y) => {
		if (x > 36 && x < 60 && y > 36 && y < 60) return [245, 190, 35]
		if (y > 72) return [35, 58, 90]
		return [185, 52, 72]
	})
	const result = extractAlbumArtworkPaletteV2(image)

	assert.equal(result.diagnostics.nativeDiscovery, true)
	assert.equal(result.diagnostics.preDiscoveryResize, false)
	assert.ok(result.alternatives.length > 0 && result.alternatives.length <= 8)
	assert.ok(result.diagnostics.completeCandidateCount >= result.alternatives.length)
	assert.equal(result.diagnostics.emergency.eligible, false)
	assertPaletteInvariants(result)
	assert.ok(result.alternatives.every(({ collapse, familyRoles }) => collapse.accent ||
		![familyRoles.background, familyRoles.surface, familyRoles.foreground].includes(familyRoles.accent)))
	assert.equal(Object.hasOwn(result.winner.scores, "cardinality"), false)
})

test("development is disjoint from the opened and future directional samples", async () => {
	const [development, openedFresh, futureSample, childSource, evaluatorSource] = await Promise.all([
		readFile(new URL("../data/album-artwork-palette-v2-development-panel.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-future-sample-02.sealed.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../album-artwork-palette-v2-development-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../evaluate-album-artwork-palette-v2-development.ts", import.meta.url), "utf8"),
	])
	assert.equal(development.sourceCount, 28)
	assert.equal(openedFresh.sourceCount, 12)
	assert.equal(futureSample.families.length, 12)
	assert.equal(futureSample.selection.root, "10")
	const developmentHashes = new Set(development.sources.map(({ sha256 }: { sha256: string }) => sha256))
	assert.ok(openedFresh.sources.every(({ sha256 }: { sha256: string }) => !developmentHashes.has(sha256)))
	assert.ok(futureSample.families.every(({ variants }: { variants: Array<{ sha256: string }> }) =>
		variants.every(({ sha256 }) => !developmentHashes.has(sha256))))
	assert.match(childSource, /parseAlbumArtworkPaletteV2FutureSample/)
	assert.match(childSource, /overlaps a protected directional sample/)
	assert.ok(childSource.indexOf("protectedHashes.has(source.sha256)") < childSource.indexOf("readFile(sourcePath)"))
	assert.match(evaluatorSource, /album-artwork-palette-v2-future-sample-02\.sealed\.json/)
	assert.match(evaluatorSource, /Development panel overlaps a protected directional sample/)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyMaximumAbsoluteLc, 5)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.gradientEndpointFamiliesPerBand, 2)
})

test("review feedback preserves comments and accepts only the bound labels and tags", () => {
	const expected = { caseId: "case-1", sourceSha256: "a".repeat(64), treatmentIds: ["one", "two"] }
	const parsed = parseCaseFeedbackSubmission({
		caseId: "case-1",
		sourceSha256: "a".repeat(64),
		selectedTreatmentId: "two",
		alsoValidTreatmentIds: ["one"],
		quality: "strong",
		tags: ["missing gradient"],
		comment: "  Preserve this verbatim.\n",
	}, expected)
	assert.equal(parsed.selectedTreatmentId, "two")
	assert.deepEqual(parsed.alsoValidTreatmentIds, ["one"])
	assert.equal(parsed.comment, "  Preserve this verbatim.\n")
	assert.throws(() => parseCaseFeedbackSubmission({
		caseId: "case-1",
		sourceSha256: "a".repeat(64),
		selectedTreatmentId: "one",
		alsoValidTreatmentIds: [],
		quality: "strong",
		tags: ["bad hue"],
		comment: "",
	}, expected), /issue tags are invalid/)
})

test("archived Round 2 review remains black and white and preserves non-exclusive choices", async () => {
	const [css, app] = await Promise.all([
		readFile(new URL("../album-artwork-palette-v2-round-2-review/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-round-2-review/app.js", import.meta.url), "utf8"),
	])
	const hexLiterals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
	assert.ok(hexLiterals.length > 0)
	assert.ok(hexLiterals.every((hex) => ["#000", "#fff", "#000000", "#ffffff"].includes(hex.toLowerCase())))
	assert.match(app, /presentation\.roles\[role\]\.nearestName/)
	assert.match(app, /collapsed to background/)
	assert.match(app, /collapsed to foreground/)
	assert.match(app, /generated\*/)
	assert.match(app, /Foreground over background/)
	assert.match(app, /Foreground over surface/)
	assert.match(app, /Accent over background/)
	assert.match(app, /Accent over surface/)
	assert.doesNotMatch(app, /assessments:/)
	assert.match(app, /alsoValidTreatmentIds/)
})

test("future broad review is background-dominant and asks only quality plus an optional comment", async () => {
	const [css, app, html] = await Promise.all([
		readFile(new URL("../album-artwork-palette-v2-review/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-review/app.js", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-review/index.html", import.meta.url), "utf8"),
	])
	const hexLiterals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
	assert.ok(hexLiterals.every((hex) => ["#000", "#fff", "#000000", "#ffffff"].includes(hex.toLowerCase())))
	assert.match(css, /width: min\(27%, 270px\)/)
	assert.match(app, /Most application content lives here/)
	assert.match(app, /className: "color-sample"/)
	assert.match(app, /sample\.style\.backgroundColor = treatment\[role\]\.hex/)
	assert.match(app, /state\.manifest\.cases\.length > 12/)
	assert.doesNotMatch(html, /issue tags|alternatives|also valid/i)
	assert.doesNotMatch(app, /alsoValidTreatmentIds|ISSUE_TAGS|winnerTreatmentId.*candidate winner/)
	assert.match(html, /Absolute quality/)
	assert.match(html, /Optional comment/)
})

test("lightweight review requires one bound quality response and preserves the optional comment", () => {
	const expected = { caseId: "case-1", sourceSha256: "b".repeat(64), treatmentId: "treatment-1" }
	const parsed = parseLightweightReviewSubmission({
		...expected,
		quality: "acceptable",
		comment: "  exact comment\n",
	}, expected)
	assert.equal(parsed.comment, "  exact comment\n")
	assert.throws(() => parseLightweightReviewSubmission({ ...expected, quality: null, comment: "" }, expected), /valid absolute quality/)
})

test("targeted review accepts only non-exclusive bound positives or one fallback state", () => {
	const expected = { caseId: "case-1", sourceSha256: "c".repeat(64), optionIds: ["A", "B", "C"] }
	const parsed = parseTargetedReviewSubmission({
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		validOptionIds: ["C", "A"],
		preferredOptionId: "C",
		noneConfidentlyValid: false,
		uncertain: false,
		comment: "Both are independently valid.",
	}, expected)
	assert.deepEqual(parsed.validOptionIds, ["A", "C"])
	assert.equal(parsed.preferredOptionId, "C")
	assert.throws(() => parseTargetedReviewSubmission({
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		validOptionIds: ["A"],
		preferredOptionId: null,
		noneConfidentlyValid: true,
		uncertain: false,
		comment: "",
	}, expected), /Choose valid options/)
	assert.throws(() => parseTargetedReviewSubmission({
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		validOptionIds: ["A"],
		preferredOptionId: "B",
		noneConfidentlyValid: false,
		uncertain: false,
		comment: "",
	}, expected), /one of the valid options/)
})

test("archived targeted mechanism review is blinded, bounded, and background-dominant", async () => {
	const [css, app, html, manifest] = await Promise.all([
		readFile(new URL("../album-artwork-palette-v2-targeted-review/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-targeted-review/app.js", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-targeted-review/index.html", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.3.0-development/targeted-review-manifest.json", import.meta.url), "utf8").then(JSON.parse),
	])
	const hexLiterals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
	assert.ok(hexLiterals.every((hex) => ["#000", "#fff", "#000000", "#ffffff"].includes(hex.toLowerCase())))
	assert.match(css, /width: min\(27%, 180px\)/)
	assert.match(html, /independently valid/i)
	assert.doesNotMatch(`${html}\n${app}`, /pareto|legacy|scalar/i)
	assert.match(app, /state\.manifest\.cases\.length > 4/)
	assert.ok(manifest.cases.length > 0 && manifest.cases.length <= 4)
	assert.ok(manifest.cases.every(({ options }: { options: unknown[] }) => options.length >= 2 && options.length <= 4))
})

test("architecture review adds exact color samples and optional preference only among positives", async () => {
	const [css, app, html, manifest] = await Promise.all([
		readFile(new URL("../album-artwork-palette-v2-targeted-review-v3/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-targeted-review-v3/app.js", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-targeted-review-v3/index.html", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.4.1-development/targeted-review-manifest.json", import.meta.url), "utf8").then(JSON.parse),
	])
	const hexLiterals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
	assert.ok(hexLiterals.every((hex) => ["#000", "#fff", "#000000", "#ffffff"].includes(hex.toLowerCase())))
	assert.match(app, /sample\.style\.backgroundColor = treatment\[role\]\.hex/)
	assert.match(app, /preferredOptionId/)
	assert.match(html, /Preferred among valid options \(optional\)/)
	assert.doesNotMatch(`${html}\n${app}`, /pareto|legacy|scalar/i)
	assert.ok(manifest.cases.length > 0 && manifest.cases.length <= 4)
	assert.ok(manifest.cases.every(({ options }: { options: unknown[] }) => options.length >= 2 && options.length <= 4))
	assert.match(manifest.preferencePolicy, /must be one of the independently valid options/)
})
