import assert from "node:assert/strict"
import test from "node:test"
import { completeTreatmentKey } from "../src/album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment } from "../src/album-artwork-palette-v2.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	applyAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint,
	applyAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment,
} from "../src/album-artwork-palette-v2-phase-3-parallel-arms.ts"
import type { RawImage } from "../src/types.ts"

function transitionField(): RawImage {
	const width = 48
	const height = 32
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			data.set([
				Math.round(24 + 180 * amount),
				Math.round(52 + 92 * amount),
				Math.round(142 - 70 * amount),
			], (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function detailsWithProjectedFlatWinner() {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(transitionField())
	const sourceWinner = details.result.winner
	const sourceKey = completeTreatmentKey(sourceWinner)
	assert.equal(sourceWinner.gradient, true)
	assert.ok(details.custodyMaterialized.some(({ key }) => key === sourceKey))
	const winner: CompletePaletteTreatment = {
		...sourceWinner,
		id: `wrapper-test-projected-flat:${sourceWinner.id}`,
		gradient: false,
		fieldTreatment: "separate-flat-fields",
		gradientEvidence: null,
	}
	const winnerKey = completeTreatmentKey(winner)
	const slate = [winner, ...details.result.alternatives.filter((treatment) => {
		const key = completeTreatmentKey(treatment)
		return key !== sourceKey && key !== winnerKey
	})]
	const sourceEvaluation = details.result.diagnostics.phase3IntegratedCandidate.selector.evaluations
		.find(({ key }) => key === sourceKey)
	assert.ok(sourceEvaluation)
	const selector = {
		...details.result.diagnostics.phase3IntegratedCandidate.selector,
		evaluations: [
			...details.result.diagnostics.phase3IntegratedCandidate.selector.evaluations,
			{
				...sourceEvaluation,
				key: winnerKey,
				gradientStatus: "not-applicable" as const,
				structuralKey: `${sourceEvaluation.structuralKey}\0wrapper-test-projection`,
			},
		],
	}
	const selection = {
		...details.selection,
		winner,
		slate,
		diagnostics: {
			...details.selection.diagnostics,
			winnerKey,
			slateKeys: slate.map(completeTreatmentKey),
		},
	}
	const gradientAuthority = {
		selection,
		diagnostics: {
			...details.gradientAuthority.diagnostics,
			selectedTransitionGradient: true,
			strictVetoApplied: true,
			projectedFlatSibling: true,
			baselineWinnerKey: sourceKey,
			winnerKey,
			flatCustody: {
				kind: "source-connected-flat-projection" as const,
				sourceConnected: true,
				sourceTypes: ["native-field-transition"] as const,
				sourceFieldHypothesisId: winner.sourceFieldHypothesisId,
				roleBinding: "same-four-roles" as const,
				hypothesisBinding: "same-source-field-hypothesis" as const,
			},
		},
	}
	const result = {
		...details.result,
		winner,
		alternatives: slate,
		diagnostics: {
			...details.result.diagnostics,
			phase3IntegratedCandidate: {
				...details.result.diagnostics.phase3IntegratedCandidate,
				selector,
				selection: selection.diagnostics,
				gradientAuthority: gradientAuthority.diagnostics,
			},
		},
	}
	const custodyMaterialized = details.custodyMaterialized.filter(({ key }) => key !== winnerKey)
	return {
		details: { ...details, result, selection, gradientAuthority, custodyMaterialized } as typeof details,
		sourceKey,
		winnerKey,
	}
}

test("contrastive wrapper discards an unavailable projected incumbent as an exact public no-op", () => {
	const { details, sourceKey, winnerKey } = detailsWithProjectedFlatWinner()
	assert.equal(details.custodyMaterialized.some(({ key }) => key === winnerKey), false)

	const output = applyAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment(details)
	const diagnostics = output.diagnostics.phase3ContrastiveRoleAssignment

	assert.deepEqual(output.winner, details.result.winner)
	assert.deepEqual(output.alternatives, details.result.alternatives)
	assert.equal(output.alternatives.some((treatment) => completeTreatmentKey(treatment) === sourceKey), false)
	assert.deepEqual(diagnostics.contrastiveRoleAssignment.decision, {
		status: "discarded",
		reason: "integrated-incumbent-custody-unavailable",
		authoritativeAssignmentKey: null,
		foregroundFamilyId: null,
		accentFamilyId: null,
	})
	assert.deepEqual(diagnostics.contrastiveRoleAssignment.applicability, {
		status: "discarded",
		reason: "integrated-incumbent-custody-unavailable",
		incumbentKey: winnerKey,
		projectedFlatIncumbent: true,
	})
	assert.deepEqual(diagnostics.contrastiveRoleAssignment.qualityAndLineageBoundedCandidateKeys, [])
	assert.equal(diagnostics.contrastiveRoleAssignment.appliedWinnerKey, null)
})

test("endpoint wrapper evaluates additions against projected baseline quality without fake lineage", () => {
	const { details, winnerKey } = detailsWithProjectedFlatWinner()
	const output = applyAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(details)
	const diagnostics = output.diagnostics.phase3ComponentLocalEndpoint
	const reservation = diagnostics.endpointSlateReservation

	assert.ok(diagnostics.domain.componentLocalFieldHypothesisCount > 0)
	assert.equal(completeTreatmentKey(output.winner), winnerKey)
	assert.equal(reservation.outputWinnerKey, winnerKey)
	assert.equal(reservation.gates.baselineWinnerQualityAvailable, true)
	assert.ok(diagnostics.selector.evaluations.some(({ key }) => key === winnerKey))
	assert.equal(diagnostics.lineageEligibility.candidates.some(({ key }) => key === winnerKey), false)
	assert.ok(reservation.candidateEvaluations.length > 0)
	assert.ok(output.alternatives.length <= details.result.alternatives.length)
})
