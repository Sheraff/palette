import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { completeTreatmentKey } from "../src/album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment } from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_DIAGNOSTICS_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_PROJECTION_ID,
	applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate,
	extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate,
} from "../src/album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-adapter.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT as CONTRACT_ATTEMPT,
	applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate as contractApply,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import {
	evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate,
} from "../src/album-artwork-palette-v2-phase-3-arm-midpoint-aware-render-candidate.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY,
} from "../src/album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import type { RawImage } from "../src/types.ts"
import {
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"

function syntheticSelectedTransition(curved: boolean): RawImage {
	const width = 72
	const height = 48
	const data = new Uint8Array(width * height * 3)
	const first = rgbToOKLab([34, 52, 142])
	const middle = rgbToOKLab([80, 130, 120])
	const second = rgbToOKLab([212, 164, 48])
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			let color = curved
				? amount < 0.5
					? oklabToRGB(mixOKLab(first, middle, amount * 2))
					: oklabToRGB(mixOKLab(middle, second, amount * 2 - 1))
				: oklabToRGB(mixOKLab(first, second, amount))
			if (x >= 20 && x < 52 && (
				(y >= 10 && y < 13) || (y >= 18 && y < 21) || (y >= 26 && y < 29)
			)) color = [8, 8, 12]
			if ((x >= 56 && x < 63 && y >= 34 && y < 41) ||
				(x >= 9 && x < 14 && y >= 37 && y < 42)) color = [225, 30, 92]
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

type IntegratedDetails = ReturnType<typeof extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails>
type CoreEvaluation = ReturnType<
	typeof evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate
>["candidates"]

const fixtureCache = new Map<boolean, Readonly<{
	image: RawImage
	details: IntegratedDetails
	core: CoreEvaluation
}>>()

function fixture(curved: boolean) {
	const cached = fixtureCache.get(curved)
	if (cached) return cached
	const image = syntheticSelectedTransition(curved)
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const core = evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate(
		details.common.evidence.native,
	).candidates
	const value = { image, details, core }
	fixtureCache.set(curved, value)
	return value
}

function applyFixture(curved: boolean, overrides: Readonly<{
	details?: IntegratedDetails
	core?: CoreEvaluation
}> = {}) {
	const value = fixture(curved)
	const integratedDetails = overrides.details ?? value.details
	const fieldRenderCandidates = overrides.core ?? value.core
	return applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
		integratedDetails,
		fieldRenderCandidates,
	})
}

function detailsWithBaselineTreatment(
	details: IntegratedDetails,
	treatment: CompletePaletteTreatment,
): IntegratedDetails {
	const evaluation = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		[treatment],
		{ obligations: details.common.seedAvailability.identityObligations },
	).evaluations[0]
	const key = details.selection.diagnostics.unrestrictedWinnerKey
	assert.equal(evaluation.key, key)
	const { treatment: _treatment, ...diagnostic } = evaluation
	return {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			winner: evaluation.treatment,
			evaluations: details.recoveryV2.evaluations.map((current) =>
				current.key === key ? evaluation : current),
			explanation: {
				...details.recoveryV2.explanation,
				evaluations: details.recoveryV2.explanation.evaluations.map((current) =>
					current.key === key ? diagnostic : current),
				winner: {
					...details.recoveryV2.explanation.winner,
					gradientStatus: evaluation.gradientStatus,
					qualityUtility: evaluation.qualityUtility,
					identityCoverage: evaluation.identityCoverage,
					identityGain: evaluation.identityGain,
					relationUtility: evaluation.relationUtility,
				},
			},
		},
	} as IntegratedDetails
}

function detailsWithCoordinatedBaselineTreatment(
	details: IntegratedDetails,
	treatment: CompletePaletteTreatment,
): IntegratedDetails {
	const key = details.selection.diagnostics.unrestrictedWinnerKey
	const recoveryDetails = detailsWithBaselineTreatment(details, treatment)
	return {
		...recoveryDetails,
		materialization: {
			...details.materialization,
			materialized: details.materialization.materialized.map((candidate) =>
				candidate.key === key ? {
					...candidate,
					treatment,
					descriptors: candidate.descriptors.map((descriptor) => ({ ...descriptor, treatment })),
				} : candidate),
		},
		custodyMaterialized: details.custodyMaterialized.map((candidate) =>
			candidate.key === key ? {
				...candidate,
				treatment,
				descriptors: candidate.descriptors.map((descriptor) => ({ ...descriptor, treatment })),
			} : candidate),
	} as IntegratedDetails
}

test("the authoritative baseline is the genuine unrestricted full-domain recovery evaluation", () => {
	const { details } = fixture(true)
	const output = applyFixture(true)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
	const domain = diagnostics.authoritativeBaseline.domainVerification
	const key = details.selection.diagnostics.unrestrictedWinnerKey
	const matches = details.recoveryV2.evaluations.filter(({ key: candidateKey }) => candidateKey === key)

	assert.equal(details.recoveryV2.evaluations.length, 1500)
	assert.equal(key, completeTreatmentKey(details.recoveryV2.winner))
	assert.equal(matches.length, 1)
	assert.equal(diagnostics.authoritativeBaseline.selectionDiagnosticKey, key)
	assert.equal(diagnostics.authoritativeBaseline.recoveryWinnerKey, key)
	assert.equal(diagnostics.authoritativeBaseline.matchingFullEvaluationCount, 1)
	assert.deepEqual(diagnostics.authoritativeBaseline.evaluation, matches[0])
	assert.notEqual(diagnostics.authoritativeBaseline.evaluation, matches[0])
	assert.equal(diagnostics.pathBoundMaterialization.diagnostics.baselineUnrestrictedWinnerEvaluation,
		diagnostics.authoritativeBaseline.evaluation)
	assert.equal(domain.expectedFullEvaluationCount, 1500)
	assert.equal(domain.actualFullEvaluationCount, 1500)
	assert.equal(domain.explanationEvaluationCount, 1500)
	assert.equal(domain.materializationDiagnosticTreatmentCount, 1500)
	assert.equal(domain.materializedArrayCount, 1500)
	assert.equal(domain.custodyArrayCount, 1500)
	assert.equal(domain.factorizedPolicyCapacity, 1500)
	assert.ok(domain.truncatedCanonicalTreatmentCount > 0)
	assert.equal(domain.uniqueCanonicalTreatmentCount,
		domain.materializedArrayCount + domain.truncatedCanonicalTreatmentCount)
	assert.equal(domain.materializationReplayMatches, true)
	assert.equal(domain.recoveryReplayMatches, true)
	assert.ok(Object.entries(domain).filter(([, value]) => typeof value === "boolean")
		.every(([, value]) => value === true))
})

test("structurally exact deep-cloned treatment custody is accepted without object identity", () => {
	const { details, core } = fixture(true)
	const clonedDetails = {
		...details,
		materialization: {
			...details.materialization,
			materialized: details.materialization.materialized.map((candidate) => ({
				...candidate,
				treatment: structuredClone(candidate.treatment),
			})),
		},
		custodyMaterialized: details.custodyMaterialized.map((candidate) => ({
			...candidate,
			treatment: structuredClone(candidate.treatment),
		})),
		recoveryV2: {
			...details.recoveryV2,
			winner: structuredClone(details.recoveryV2.winner),
			evaluations: details.recoveryV2.evaluations.map((evaluation) => ({
				...evaluation,
				treatment: structuredClone(evaluation.treatment),
			})),
		},
	} as IntegratedDetails
	const output = applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
		integratedDetails: clonedDetails,
		fieldRenderCandidates: core,
	})

	assert.equal(output.diagnostics.phase3MidpointAwareRenderCandidate
		.authoritativeBaseline.domainVerification.verified, true)
})

test("truncated, extra, duplicate, or mismatched full recovery domains are rejected", () => {
	const { details, core } = fixture(true)
	assert.equal(details.recoveryV2.evaluations.length, 1500)
	const wrongKeyDetails = {
		...details,
		selection: {
			...details.selection,
			diagnostics: { ...details.selection.diagnostics, unrestrictedWinnerKey: "tampered-key" },
		},
	} as IntegratedDetails
	const otherWinner = details.recoveryV2.slate.find((treatment) =>
		completeTreatmentKey(treatment) !== completeTreatmentKey(details.recoveryV2.winner))!
	const wrongWinnerDetails = {
		...details,
		recoveryV2: { ...details.recoveryV2, winner: otherWinner },
	} as IntegratedDetails
	const baseline = details.recoveryV2.evaluations.find(({ key }) =>
		key === details.selection.diagnostics.unrestrictedWinnerKey)!
	const duplicateDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			evaluations: [...details.recoveryV2.evaluations, baseline],
		},
	} as IntegratedDetails
	const truncatedDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			evaluations: details.recoveryV2.evaluations.slice(0, -1),
		},
	} as IntegratedDetails
	const extraDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			evaluations: [
				...details.recoveryV2.evaluations,
				{ ...baseline, key: "extra-noncanonical-evaluation" },
			],
		},
	} as IntegratedDetails
	const wrongSelectorDomainCountDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			explanation: {
				...details.recoveryV2.explanation,
				domain: {
					...details.recoveryV2.explanation.domain,
					uniqueTreatmentCount:
						details.recoveryV2.explanation.domain.uniqueTreatmentCount - 1,
				},
			},
		},
	} as IntegratedDetails
	const wrongMaterializationCountDetails = {
		...details,
		materialization: {
			...details.materialization,
			diagnostics: {
				...details.materialization.diagnostics,
				materializedTreatmentCount:
					details.materialization.diagnostics.materializedTreatmentCount - 1,
			},
		},
	} as IntegratedDetails
	const wrongTruncationMetadataDetails = {
		...details,
		materialization: {
			...details.materialization,
			diagnostics: {
				...details.materialization.diagnostics,
				truncatedCanonicalTreatmentCount:
					details.materialization.diagnostics.truncatedCanonicalTreatmentCount + 1,
			},
		},
	} as IntegratedDetails
	const duplicateMaterializationKeyDetails = {
		...details,
		materialization: {
			...details.materialization,
			materialized: details.materialization.materialized.map((candidate, index) =>
				index === details.materialization.materialized.length - 1
					? details.materialization.materialized[0]
					: candidate),
		},
	} as IntegratedDetails
	const duplicateCustodyKeyDetails = {
		...details,
		custodyMaterialized: details.custodyMaterialized.map((candidate, index) =>
			index === details.custodyMaterialized.length - 1
				? details.custodyMaterialized[0]
				: candidate),
	} as IntegratedDetails
	const wrongExplanationWinnerDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			explanation: {
				...details.recoveryV2.explanation,
				winner: { ...details.recoveryV2.explanation.winner, key: "tampered-winner" },
			},
		},
	} as IntegratedDetails
	const wrongExplanationNumericsDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			explanation: {
				...details.recoveryV2.explanation,
				evaluations: details.recoveryV2.explanation.evaluations.map((evaluation) =>
					evaluation.key === baseline.key
						? { ...evaluation, qualityUtility: evaluation.qualityUtility + 0.000001 }
						: evaluation),
			},
		},
	} as IntegratedDetails

	for (const tampered of [
		wrongKeyDetails,
		wrongWinnerDetails,
		truncatedDetails,
		extraDetails,
		duplicateDetails,
		wrongSelectorDomainCountDetails,
		wrongMaterializationCountDetails,
		wrongTruncationMetadataDetails,
		duplicateMaterializationKeyDetails,
		duplicateCustodyKeyDetails,
		wrongExplanationWinnerDetails,
		wrongExplanationNumericsDetails,
	]) {
		assert.throws(() => applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
			integratedDetails: tampered,
			fieldRenderCandidates: core,
		}), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR))
	}
})

test("a curved real extraction materializes flat, two-stop, and three-stop before selecting three-stop", () => {
	const output = extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate(
		syntheticSelectedTransition(true),
	)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
	const materialization = diagnostics.pathBoundMaterialization
	const kinds = new Set(materialization.candidates.map(({ render }) => render.kind))

	assert.deepEqual(kinds, new Set(["flat", "supported-two-stop", "supported-three-stop"]))
	assert.equal(diagnostics.selectedRenderKind, "supported-three-stop")
	assert.equal(output.winner.gradient, true)
	assert.equal(output.winner.fieldTreatment, "gradient-field")
	assert.ok(output.winner.gradientEvidence)
	assert.equal(diagnostics.renderProjection?.exactMidpoint?.exactColor.provenance.exactSource, true)
	assert.equal("midpoint" in output.winner, false)
})

test("a direct real extraction selects the path-bound two-stop treatment", () => {
	const output = extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate(
		syntheticSelectedTransition(false),
	)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate

	assert.equal(diagnostics.selectedRenderKind, "supported-two-stop")
	assert.equal(output.winner.gradient, true)
	assert.deepEqual(output.winner.gradientEvidence?.supportingEndpointHexes,
		diagnostics.renderProjection?.exactEndpoints.map(({ exactColor }) => exactColor.hex))
	assert.equal(diagnostics.selectedAuthority?.numericsCustody.completeTreatmentSource,
		"independently-generated-endpoint-gradient-treatment")
})

test("no core paths is an exact public no-op with no projection", () => {
	const { details, core } = fixture(false)
	const emptyCore: CoreEvaluation = {
		...core,
		bundles: [],
		selected: null,
		summary: { inputPathCount: 0, eligiblePathCount: 0, candidateCount: 0 },
	}
	const output = applyFixture(false, { core: emptyCore })
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate

	assert.equal(output.winner, details.result.winner)
	assert.equal(output.alternatives, details.result.alternatives)
	assert.equal(diagnostics.applicable, false)
	assert.equal(diagnostics.noOpReason, "no-core-field-render-bundles")
	assert.equal(diagnostics.selectedRenderKey, null)
	assert.equal(diagnostics.renderProjection, null)
	assert.equal(diagnostics.sourceToOutputCustody, null)
})

test("selected authority retains render key, path lineage, ordinary lineage, and all source-bound roles", () => {
	const output = applyFixture(true)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
	const selected = diagnostics.pathBoundMaterialization.selected!
	const authority = diagnostics.selectedAuthority!

	assert.equal(diagnostics.selectedRenderKey, selected.renderKey)
	assert.equal(authority.renderKey, selected.renderKey)
	assert.equal(diagnostics.renderProjection?.renderKey, selected.renderKey)
	assert.equal(diagnostics.sourceToOutputCustody?.renderKey, selected.renderKey)
	assert.deepEqual(authority.pathLineage, selected.pathLineage)
	assert.equal(authority.ordinaryCompleteLineage.candidateEligibility.basis,
		"ordinary-complete-source-lineage")
	assert.equal(authority.ordinaryCompleteLineage.evaluation.ordinaryEligible, true)
	assert.deepEqual(new Set(authority.roleCustody.map(({ role }) => role)),
		new Set(["background", "surface", "foreground", "accent"]))
	assert.ok(authority.roleCustody.every(({ componentPopulation, componentStartPixelIndex }) =>
		componentPopulation > 0 && componentStartPixelIndex >= 0))
	assert.notEqual(diagnostics.currentIntegratedWinnerKey, diagnostics.outputPublicTreatmentKey)
})

test("quality authority, numerics custody, and final public boolean are derived in the correct order", () => {
	for (const curved of [false, true]) {
		const output = applyFixture(curved)
		const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
		const selected = diagnostics.pathBoundMaterialization.selected!
		const gradient = selected.render.kind !== "flat"

		assert.ok(selected.qualityLossFromBaseline <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumQualityLoss +
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
					.qualityBoundaryTolerance)
		assert.equal(selected.withinQualityBound, true)
		assert.equal(diagnostics.qualityFloor, selected.qualityFloor)
		assert.equal(diagnostics.numericsModeMatchesSelectedBase, true)
		assert.equal(diagnostics.pathBoundMaterialization.diagnostics.publicTreatmentStateDerivedHere, false)
		assert.equal(output.winner.gradient, gradient)
		assert.equal(output.winner.fieldTreatment,
			gradient ? "gradient-field" : "separate-flat-fields")
		assert.equal(output.winner.gradientEvidence === null, !gradient)
		assert.equal(output.winner.contrast, selected.treatment.contrast)
		assert.equal(output.winner.scores, selected.treatment.scores)
		assert.equal(selected.numericsCustody.threeStopAPCARecomputed, false)
		assert.equal(diagnostics.renderProjection?.contrastCustody.threeStopAPCARecomputed, false)
	}
	const rejected = applyFixture(true).diagnostics.phase3MidpointAwareRenderCandidate
		.pathBoundMaterialization.candidates.filter(({ qualityLossFromBaseline }) =>
			qualityLossFromBaseline >
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumQualityLoss)
	assert.ok(rejected.every(({ withinQualityBound, eligible }) => !withinQualityBound && !eligible))
})

test("same-key score, evidence, and role payload tampering is rejected", () => {
	const { details, core } = fixture(true)
	const originalKey = details.selection.diagnostics.unrestrictedWinnerKey
	const originalBaseline = details.recoveryV2.evaluations.find(({ key }) => key === originalKey)!
	const scoreTreatment: CompletePaletteTreatment = {
		...originalBaseline.treatment,
		scores: {
			...originalBaseline.treatment.scores,
			fieldFidelity: originalBaseline.treatment.scores.fieldFidelity === 1
				? 0.999
				: originalBaseline.treatment.scores.fieldFidelity + 0.001,
		},
	}
	const support = originalBaseline.treatment.background.support
	assert.ok("totalSupport" in support)
	const evidenceTreatment: CompletePaletteTreatment = {
		...originalBaseline.treatment,
		background: {
			...originalBaseline.treatment.background,
			support: { ...support, totalSupport: support.totalSupport + 1 },
		},
	}
	const [red, green, blue] = originalBaseline.treatment.background.rgb
	const roleTreatment: CompletePaletteTreatment = {
		...originalBaseline.treatment,
		background: {
			...originalBaseline.treatment.background,
			rgb: [red === 255 ? 254 : red + 1, green, blue],
		},
	}
	for (const treatment of [scoreTreatment, evidenceTreatment, roleTreatment]) {
		assert.equal(completeTreatmentKey(treatment), originalKey)
	}
	const scoreEvaluationDetails = detailsWithBaselineTreatment(details, scoreTreatment)
	const scoreWinnerDetails = {
		...details,
		recoveryV2: { ...details.recoveryV2, winner: scoreTreatment },
	} as IntegratedDetails
	const custodyEvidenceDetails = {
		...details,
		custodyMaterialized: details.custodyMaterialized.map((candidate) =>
			candidate.key === originalKey ? { ...candidate, treatment: evidenceTreatment } : candidate),
	} as IntegratedDetails
	const materializationRoleDetails = {
		...details,
		materialization: {
			...details.materialization,
			materialized: details.materialization.materialized.map((candidate) =>
				candidate.key === originalKey ? { ...candidate, treatment: roleTreatment } : candidate),
		},
	} as IntegratedDetails

	for (const tampered of [
		scoreEvaluationDetails,
		scoreWinnerDetails,
		custodyEvidenceDetails,
		materializationRoleDetails,
	]) {
		assert.throws(() => applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
			integratedDetails: tampered,
			fieldRenderCandidates: core,
		}), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR))
	}
})

test("independent replay rejects coordinated score, evidence, descriptor, and evaluation tampering", () => {
	const { details, core } = fixture(true)
	const key = details.selection.diagnostics.unrestrictedWinnerKey
	const baseline = details.recoveryV2.evaluations.find((evaluation) => evaluation.key === key)!
	const scoreTreatment: CompletePaletteTreatment = {
		...baseline.treatment,
		scores: {
			...baseline.treatment.scores,
			fieldFidelity: baseline.treatment.scores.fieldFidelity === 1
				? 0.999
				: baseline.treatment.scores.fieldFidelity + 0.001,
		},
	}
	const support = baseline.treatment.background.support
	assert.ok("totalSupport" in support)
	const evidenceTreatment: CompletePaletteTreatment = {
		...baseline.treatment,
		background: {
			...baseline.treatment.background,
			support: { ...support, totalSupport: support.totalSupport + 1 },
		},
	}
	const coordinatedScoreDetails = detailsWithCoordinatedBaselineTreatment(details, scoreTreatment)
	const coordinatedEvidenceDetails = detailsWithCoordinatedBaselineTreatment(details, evidenceTreatment)
	const materializedCandidate = details.materialization.materialized.find((candidate) => candidate.key === key)!
	const custodyCandidate = details.custodyMaterialized.find((candidate) => candidate.key === key)!
	const tamperedDescriptors = materializedCandidate.descriptors.map((descriptor, index) =>
		index === 0 ? {
			...descriptor,
			lineage: { ...descriptor.lineage, sourceConnected: !descriptor.lineage.sourceConnected },
		} : descriptor)
	const coordinatedDescriptorDetails = {
		...details,
		materialization: {
			...details.materialization,
			materialized: details.materialization.materialized.map((candidate) =>
				candidate.key === key ? { ...candidate, descriptors: tamperedDescriptors } : candidate),
		},
		custodyMaterialized: details.custodyMaterialized.map((candidate) =>
			candidate.key === key ? { ...candidate, descriptors: tamperedDescriptors } : candidate),
	} as IntegratedDetails
	assert.equal(custodyCandidate.descriptors.length, tamperedDescriptors.length)
	const changedQualityUtility = baseline.qualityUtility + 0.000001
	const changedEvaluation = { ...baseline, qualityUtility: changedQualityUtility }
	const coordinatedEvaluationDetails = {
		...details,
		recoveryV2: {
			...details.recoveryV2,
			evaluations: details.recoveryV2.evaluations.map((evaluation) =>
				evaluation.key === key ? changedEvaluation : evaluation),
			explanation: {
				...details.recoveryV2.explanation,
				evaluations: details.recoveryV2.explanation.evaluations.map((evaluation) =>
					evaluation.key === key
						? { ...evaluation, qualityUtility: changedQualityUtility }
						: evaluation),
				winner: { ...details.recoveryV2.explanation.winner, qualityUtility: changedQualityUtility },
			},
		},
	} as IntegratedDetails

	for (const tampered of [
		coordinatedScoreDetails,
		coordinatedEvidenceDetails,
		coordinatedDescriptorDetails,
		coordinatedEvaluationDetails,
	]) {
		assert.throws(() => applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
			integratedDetails: tampered,
			fieldRenderCandidates: core,
		}), new RegExp(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR))
	}
})

test("winner-first public slate is bounded, unique, and excludes stale render variants", () => {
	const output = applyFixture(true)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
	const keys = output.alternatives.map(completeTreatmentKey)
	const selectedPublicKey = diagnostics.selectedPublicTreatmentKey!
	const samePublicMaterializations = diagnostics.pathBoundMaterialization.candidates.filter(({ publicTreatmentKey }) =>
		publicTreatmentKey === selectedPublicKey)

	assert.ok(samePublicMaterializations.length >= 2)
	assert.equal(keys[0], completeTreatmentKey(output.winner))
	assert.equal(new Set(keys).size, keys.length)
	assert.ok(keys.length <= 8)
	assert.equal(keys.filter((key) => key === selectedPublicKey).length, 1)
	assert.equal(diagnostics.checks.winnerFirst, true)
	assert.equal(diagnostics.checks.uniquePublicKeys, true)
	assert.equal(diagnostics.checks.stalePublicVariantsRemoved, true)
})

test("bundle and render permutation cannot change selected authority or public output", () => {
	const { core } = fixture(true)
	const permuted: CoreEvaluation = {
		...core,
		bundles: [...core.bundles].reverse().map((bundle) => ({
			...bundle,
			candidates: [...bundle.candidates].reverse(),
		})),
	}
	const first = applyFixture(true)
	const second = applyFixture(true, { core: permuted })
	const firstDiagnostics = first.diagnostics.phase3MidpointAwareRenderCandidate
	const secondDiagnostics = second.diagnostics.phase3MidpointAwareRenderCandidate

	assert.equal(firstDiagnostics.selectedRenderKey, secondDiagnostics.selectedRenderKey)
	assert.deepEqual(first.winner, second.winner)
	assert.deepEqual(first.alternatives, second.alternatives)
	assert.deepEqual(firstDiagnostics.pathBoundMaterialization.candidates.map(({ renderKey }) => renderKey),
		secondDiagnostics.pathBoundMaterialization.candidates.map(({ renderKey }) => renderKey))
})

test("the old supported-gradient authority cannot affect path-bound inference", () => {
	const { details } = fixture(true)
	const withFlag = (selectedTransitionGradient: boolean): IntegratedDetails => ({
		...details,
		gradientAuthority: {
			...details.gradientAuthority,
			diagnostics: { ...details.gradientAuthority.diagnostics, selectedTransitionGradient },
		},
	})
	const selected = applyFixture(true, { details: withFlag(true) })
	const unselected = applyFixture(true, { details: withFlag(false) })

	assert.deepEqual(selected, unselected)
})

test("selector and source-to-output diagnostics use actual selected recovery custody", () => {
	const { details } = fixture(true)
	const output = applyFixture(true)
	const diagnostics = output.diagnostics.phase3MidpointAwareRenderCandidate
	const selected = diagnostics.pathBoundMaterialization.selected!

	assert.equal(diagnostics.selector.baselineDomainContext, details.recoveryV2.explanation)
	assert.equal(diagnostics.selector.selectedRecoveryEvaluation, selected.recoveryEvaluation)
	assert.equal(diagnostics.sourceToOutputCustody?.sourcePublicTreatmentKey,
		selected.publicTreatmentKey)
	assert.equal(diagnostics.sourceToOutputCustody?.outputPublicTreatmentKey,
		completeTreatmentKey(output.winner))
	assert.equal(diagnostics.renderProjection?.qualityCustody.evaluation,
		selected.recoveryEvaluation)
	assert.equal("phase3IntegratedCandidate" in output.diagnostics, false)
	assert.equal(diagnostics.controlIntegratedResult, details.result)
})

test("attempt contract and runner registry expose the v3 configuration", () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT_ID,
		"phase-3-midpoint-aware-render-candidate")
	assert.ok(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID
		.endsWith("-v3"))
	assert.ok(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_DIAGNOSTICS_ID.endsWith("-v3"))
	assert.ok(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_PROJECTION_ID.endsWith("-v3"))
	assert.equal(CONTRACT_ATTEMPT,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT)
	assert.equal(contractApply, applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate)
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "path-bound-render-v3-test",
		"--case", "development-03",
		"--attempt", "phase-3-midpoint-aware-render-candidate",
	]), {
		iterationId: "path-bound-render-v3-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-midpoint-aware-render-candidate"],
	})
})

test("the v3 adapter has no identity, review, literal-color, or old-authority dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-adapter.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|filename|feedback|review|manifest|historical|#[0-9a-f]{6})/iu)
	assert.doesNotMatch(source, /selectedTransitionGradient|strictVetoApplied|projectedFlatSibling/u)
})
