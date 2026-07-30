import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
} from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	composeAlbumArtworkPaletteV2Phase3FinalCandidate,
	evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound,
	extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails,
} from "../src/album-artwork-palette-v2-phase-3-final-candidate.ts"
import {
	areAlbumArtworkPaletteV2Phase3RawRelationRenderingsNear,
} from "../src/album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import type { OKLab, RGB, RawImage } from "../src/types.ts"

const SCORES: CompletePaletteScores = Object.freeze({
	fieldFidelity: 0.8,
	surfaceFidelity: 0.8,
	fieldStructure: 0.8,
	fieldIdentity: 0.8,
	treatmentFoundation: 0.8,
	activeRolePathObservability: 1,
	artworkIdentity: 0.8,
	representativeness: 0.8,
	uiUtility: 0.8,
	foregroundUtility: 0.8,
	foregroundPolarityAgreement: 1,
	accentFidelity: 0.8,
	accentUtility: 0.8,
	coherence: 0.8,
	economy: 0.8,
	generatorConfidence: 0.8,
	foundation: 0.8,
	balance: 0.8,
	generatedPenalty: 0,
	rankingScore: 0.8,
})

const ROLES = ["background", "surface", "foreground", "accent"] as const

function channel(seed: number, roleIndex: number, shift: number): number {
	return (seed * 37 + roleIndex * 53 + shift) % 256
}

function roleColor(seed: number, roleIndex: number, labBase: number): PaletteRoleColor {
	const familyId = `family:${seed}:${roleIndex}`
	const rgb: RGB = [
		channel(seed, roleIndex, 19),
		channel(seed, roleIndex, 83),
		channel(seed, roleIndex, 151),
	]
	return {
		rgb,
		oklab: [labBase + roleIndex * 0.01, roleIndex * 0.003, -roleIndex * 0.002],
		hex: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
		generated: false,
		strategy: "dense-exact",
		support: {
			exactSource: true,
			exemplar: { x: 0, y: 0 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: 0.8,
			totalSupport: 0.2,
			connectedSupport: 0.16,
			spatialCoverage: 0.75,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

function treatment(seed: number, labBase = 0.08 + seed * 0.045): CompletePaletteTreatment {
	const colors = ROLES.map((_, roleIndex) => roleColor(seed, roleIndex, labBase))
	return {
		id: `treatment:${seed}`,
		background: colors[0],
		surface: colors[1],
		foreground: colors[2],
		accent: colors[3],
		gradient: false,
		fieldTreatment: "separate-flat-fields",
		sourceFieldHypothesisId: `field:${seed}`,
		familyRoles: {
			background: `family:${seed}:0`,
			surface: `family:${seed}:1`,
			foreground: `family:${seed}:2`,
			accent: `family:${seed}:3`,
		},
		cardinality: 4,
		collapse: { surface: false, accent: false },
		contrast: {
			pairs: [{
				role: "foreground",
				fieldRole: "background",
				position: 0,
				signedLc: 60,
				absoluteLc: 60,
			}],
			minimumAbsoluteLc: 60,
			meanAbsoluteLc: 60,
		},
		scores: SCORES,
		gradientEvidence: null,
	}
}

type Proposal = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	custody: Readonly<{ marker: string }>
}>

function proposal(value: CompletePaletteTreatment, marker: string, suppliedKey = completeTreatmentKey(value)): Proposal {
	return { key: suppliedKey, treatment: value, custody: { marker } }
}

function baseline(length: number, start = 1): CompletePaletteTreatment[] {
	return Array.from({ length }, (_, index) => treatment(start + index))
}

function compose(
	integrated: readonly CompletePaletteTreatment[],
	endpointProposals: readonly Proposal[] = [],
	rawProposals: readonly Proposal[] = [],
) {
	return composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: integrated[0], slate: integrated },
		endpointProposals,
		rawProposals,
	})
}

test("pure composition handles zero, endpoint, raw, and both mechanisms across bounded baselines", () => {
	const full = baseline(8)
	const none = compose(full)
	assert.strictEqual(none.slate, full)
	assert.strictEqual(none.winner, full[0])
	assert.deepEqual(none.diagnostics.mechanisms.map(({ noProposal, noAdmission, exactNoOp }) =>
		({ noProposal, noAdmission, exactNoOp })), [
		{ noProposal: true, noAdmission: true, exactNoOp: true },
		{ noProposal: true, noAdmission: true, exactNoOp: true },
	])

	const endpoint = proposal(treatment(20), "endpoint")
	const endpointOnly = compose(full, [endpoint])
	assert.deepEqual(endpointOnly.slate, [...full.slice(0, 7), endpoint.treatment])
	assert.strictEqual(endpointOnly.accepted.endpoint, endpoint)
	assert.equal(endpointOnly.diagnostics.mechanisms[0].displacedIntegratedKey,
		completeTreatmentKey(full[7]))

	const seven = baseline(7, 30)
	const raw = proposal(treatment(50), "raw")
	const rawOnly = compose(seven, [], [raw])
	assert.deepEqual(rawOnly.slate, [...seven, raw.treatment])
	assert.equal(rawOnly.diagnostics.mechanisms[1].displacedIntegratedKey, null)

	const six = baseline(6, 60)
	const endpointSpare = proposal(treatment(80), "endpoint-spare")
	const rawSpare = proposal(treatment(81), "raw-spare")
	const bothSpare = compose(six, [endpointSpare], [rawSpare])
	assert.deepEqual(bothSpare.slate, [...six, endpointSpare.treatment, rawSpare.treatment])
	assert.deepEqual(bothSpare.diagnostics.displacedIntegratedKeys, [])

	const one = baseline(1, 90)
	const endpointOne = proposal(treatment(92), "endpoint-one")
	const rawOne = proposal(treatment(93), "raw-one")
	const oneBoth = compose(one, [endpointOne], [rawOne])
	assert.deepEqual(oneBoth.slate, [one[0], endpointOne.treatment, rawOne.treatment])
	assert.ok(Object.values(oneBoth.diagnostics.checks).every(Boolean))
})

test("later fixed-order mechanism admission removes another integrated tail and never an accepted reserve", () => {
	const integrated = baseline(8, 100)
	const endpoint = proposal(treatment(120), "endpoint")
	const raw = proposal(treatment(121), "raw")
	const result = compose(integrated, [endpoint], [raw])

	assert.deepEqual(result.slate, [...integrated.slice(0, 6), endpoint.treatment, raw.treatment])
	assert.deepEqual(result.diagnostics.displacedIntegratedKeys,
		[completeTreatmentKey(integrated[7]), completeTreatmentKey(integrated[6])])
	assert.deepEqual(result.diagnostics.mechanisms.map(({ mechanism, mechanismIndex, outputIndex }) =>
		({ mechanism, mechanismIndex, outputIndex })), [
		{ mechanism: "component-local-endpoint", mechanismIndex: 0, outputIndex: 6 },
		{ mechanism: "raw-relation-slate-complement", mechanismIndex: 1, outputIndex: 7 },
	])
	assert.strictEqual(result.slate[6], endpoint.treatment)
	assert.strictEqual(result.accepted.endpoint, endpoint)
	assert.equal(result.diagnostics.checks.noReserveDisplacement, true)
})

test("canonical duplicate and cross-mechanism collisions fall through in proposal order", () => {
	const integrated = baseline(8, 130)
	const baselineAlias = { ...integrated[3], id: "canonical-alias" }
	const admittedEndpoint = proposal(treatment(150), "endpoint-admitted")
	const endpointProposals = [proposal(baselineAlias, "endpoint-duplicate"), admittedEndpoint]
	const endpointAlias = { ...admittedEndpoint.treatment, id: "endpoint-collision-alias" }
	const admittedRaw = proposal(treatment(151), "raw-admitted")
	const result = compose(integrated, endpointProposals, [
		proposal(endpointAlias, "raw-collision"),
		admittedRaw,
	])

	assert.strictEqual(result.accepted.endpoint, admittedEndpoint)
	assert.strictEqual(result.accepted.raw, admittedRaw)
	assert.deepEqual(result.diagnostics.mechanisms[0].proposals.map(({ outcome, rejectionReasons }) =>
		({ outcome, rejectionReasons })), [
		{ outcome: "rejected", rejectionReasons: ["canonical-baseline-duplicate"] },
		{ outcome: "admitted", rejectionReasons: [] },
	])
	assert.deepEqual(result.diagnostics.mechanisms[1].proposals.map(({ outcome, rejectionReasons }) =>
		({ outcome, rejectionReasons })), [
		{ outcome: "rejected", rejectionReasons: ["accepted-reserve-collision"] },
		{ outcome: "admitted", rejectionReasons: [] },
	])
	assert.equal(result.diagnostics.mechanisms[0].proposalKeysInOrder[1],
		completeTreatmentKey(admittedEndpoint.treatment))
	assert.equal(result.slate.at(-2), admittedEndpoint.treatment)
	assert.equal(result.slate.at(-1), admittedRaw.treatment)
})

test("proposal producer authority rejects key mismatches and mechanism-local canonical duplicates up front", () => {
	const integrated = baseline(8, 152)
	const endpoint = proposal(treatment(170), "endpoint")
	const endpointMismatch = proposal(treatment(171), "endpoint-mismatch",
		completeTreatmentKey(treatment(171)).toUpperCase())
	assert.throws(() => compose(integrated, [endpoint, endpointMismatch]),
		/component-local-endpoint producer supplied a non-canonical proposal key/u)
	assert.deepEqual(integrated, baseline(8, 152))

	const raw = proposal(treatment(172), "raw")
	const rawAlias = proposal({ ...raw.treatment, id: "raw-alias" }, "raw-alias")
	assert.throws(() => compose(integrated, [endpoint], [raw, rawAlias]),
		/raw-relation-slate-complement producer supplied duplicate canonical keys/u)
	assert.deepEqual(integrated, baseline(8, 152))
})

test("combined endpoint evaluation bounds verify canonical union arithmetic and fail closed on tampering", () => {
	const noEndpoint = evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound({
		endpointDescriptorCount: 0,
		baselineMaterializedTreatmentCount: 1_500,
		endpointSupplementalMaterializedTreatmentCount: 0,
		combinedEvaluationTreatmentCount: 1_500,
		reportedCanonicalUnionTreatmentCount: 1_500,
	})
	assert.equal(noEndpoint.verified, true)
	assert.ok(Object.values(noEndpoint.checks).every(Boolean))
	assert.deepEqual(noEndpoint.bounds, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.bounds)

	const tampered = evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound({
		endpointDescriptorCount: 145,
		baselineMaterializedTreatmentCount: 1_500,
		endpointSupplementalMaterializedTreatmentCount: 145,
		combinedEvaluationTreatmentCount: 1_644,
		reportedCanonicalUnionTreatmentCount: 1_645,
	})
	assert.equal(tampered.verified, false)
	assert.equal(tampered.checks.combinedMatchesReportedCanonicalUnion, false)

	const overflow = evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound({
		endpointDescriptorCount: 1_501,
		baselineMaterializedTreatmentCount: 1_500,
		endpointSupplementalMaterializedTreatmentCount: 1_501,
		combinedEvaluationTreatmentCount: 3_001,
		reportedCanonicalUnionTreatmentCount: 3_001,
	})
	assert.equal(overflow.verified, false)
	assert.equal(overflow.checks.endpointSupplementalWithinBound, false)
	assert.equal(overflow.checks.combinedWithinSumBound, false)
	assert.throws(() => evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound({
		endpointDescriptorCount: 0,
		baselineMaterializedTreatmentCount: -1,
		endpointSupplementalMaterializedTreatmentCount: 0,
		combinedEvaluationTreatmentCount: 0,
		reportedCanonicalUnionTreatmentCount: 0,
	}), /non-negative safe integer/u)
})

test("raw rendering-nearness falls through without consuming capacity", () => {
	const integrated = [treatment(160, 0.3), ...baseline(5, 161)]
	const near = proposal(treatment(180, 0.31), "raw-near")
	const far = proposal(treatment(181, 0.8), "raw-far")
	const result = compose(integrated, [], [near, far])

	assert.strictEqual(result.accepted.raw, far)
	assert.deepEqual(result.slate, [...integrated, far.treatment])
	assert.deepEqual(result.diagnostics.displacedIntegratedKeys, [])
	assert.deepEqual(result.diagnostics.mechanisms[1].proposals[0].rejectionReasons,
		["raw-rendering-near"])
	assert.equal(result.diagnostics.mechanisms[1].proposals[1].outcome, "admitted")
})

test("raw capacity nearness is evaluated after prospective integrated displacement", () => {
	const integrated = baseline(8, 230)
	const nearTail = proposal(treatment(250, 0.08 + 237 * 0.045 + 0.01), "raw-near-tail")
	const admitted = compose(integrated, [], [nearTail])
	assert.strictEqual(admitted.accepted.raw, nearTail)
	assert.equal(admitted.diagnostics.mechanisms[1].displacedIntegratedKey,
		completeTreatmentKey(integrated[7]))
	assert.equal(admitted.diagnostics.mechanisms[1].proposals[0].mutationApplied, true)
	assert.deepEqual(admitted.slate, [...integrated.slice(0, -1), nearTail.treatment])

	const multipleNear = [
		...baseline(6, 260),
		treatment(280, 0.6),
		treatment(281, 0.61),
	]
	const blocked = proposal(treatment(282, 0.605), "raw-near-two")
	const fallback = proposal(treatment(283, 0.9), "raw-fallback")
	const result = compose(multipleNear, [], [blocked, fallback])
	assert.deepEqual(result.diagnostics.mechanisms[1].proposals[0].rejectionReasons,
		["raw-rendering-near"])
	assert.equal(result.diagnostics.mechanisms[1].proposals[0].mutationApplied, false)
	assert.equal(result.diagnostics.mechanisms[1].proposals[0].prospectiveDisplacedIntegratedKey,
		completeTreatmentKey(multipleNear[7]))
	assert.strictEqual(result.accepted.raw, fallback)
	assert.deepEqual(result.slate, [...multipleNear.slice(0, -1), fallback.treatment])
})

test("a mechanism with only inadmissible proposals is an exact slate no-op", () => {
	const integrated = baseline(8, 190)
	const endpointAlias = { ...integrated[4], id: "endpoint-alias" }
	const rawAlias = { ...integrated[5], id: "raw-alias" }
	const result = compose(integrated, [proposal(endpointAlias, "endpoint-duplicate")], [
		proposal(rawAlias, "raw-duplicate"),
	])

	assert.strictEqual(result.slate, integrated)
	assert.equal(result.accepted.endpoint, null)
	assert.equal(result.accepted.raw, null)
	assert.ok(result.diagnostics.mechanisms.every(({ noProposal, noAdmission, exactNoOp }) =>
		!noProposal && noAdmission && exactNoOp))
	assert.deepEqual(result.diagnostics.displacedIntegratedKeys, [])
})

test("invalid integrated baselines fail closed", () => {
	const values = baseline(9, 210)
	assert.throws(() => composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: values[0], slate: [] },
		endpointProposals: [],
		rawProposals: [],
	}), /1 to 8/u)
	assert.throws(() => composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: values[0], slate: values },
		endpointProposals: [],
		rawProposals: [],
	}), /1 to 8/u)
	assert.throws(() => composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: values[0], slate: [values[1], values[0]] },
		endpointProposals: [],
		rawProposals: [],
	}), /exact integrated winner/u)
	const winnerAlias = { ...values[0], id: "winner-alias" }
	assert.throws(() => composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: winnerAlias, slate: [values[0], values[1]] },
		endpointProposals: [],
		rawProposals: [],
	}), /exact integrated winner/u)
	const duplicate = { ...values[1], id: "duplicate" }
	assert.throws(() => composeAlbumArtworkPaletteV2Phase3FinalCandidate({
		integrated: { winner: values[0], slate: [values[0], values[1], duplicate] },
		endpointProposals: [],
		rawProposals: [],
	}), /canonically unique/u)
})

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

test("image extraction is deterministic and exposes only the final diagnostic root", () => {
	const first = extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(transitionField())
	const second = extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(transitionField())
	const diagnostics = first.result.diagnostics.phase3FinalCandidate
	const diagnosticKeys = Object.keys(first.result.diagnostics)

	assert.equal(first.result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID)
	assert.equal(first.result.protocol, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID)
	assert.equal("phase3IntegratedCandidate" in first.result.diagnostics, false)
	assert.equal(diagnosticKeys.includes("phase3FinalCandidate"), true)
	assert.equal(JSON.stringify(first.result), JSON.stringify(second.result))
	assert.strictEqual(first.result.winner, first.integratedDetails.result.winner)
	assert.equal(completeTreatmentKey(first.result.alternatives[0]), completeTreatmentKey(first.result.winner))
	assert.ok(first.result.alternatives.length <= 8)
	assert.deepEqual(diagnostics.composition.finalKeys, first.result.alternatives.map(completeTreatmentKey))
	assert.ok(diagnostics.finalSlateCustody.every(({ represented }) => represented))
	assert.equal(diagnostics.checks.allFinalSlateKeysRepresented, true)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity.attemptId,
		"phase-3-final-candidate")
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity.configurationId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID)
})

const genuineCache = new Map<string, ReturnType<typeof extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails>>()

const GENUINE_SOURCES = Object.freeze({
	development16: Object.freeze({
		file: "images/nada.jpg",
		sha256: "92bfe9dd27931b1badc1b4ce5847c13c8852eacf8c49d6f38b6ff8ea58be7480",
		reviewedEndpointKey: "#325376:#486a90:#fbfcf7:#100d28:gradient",
	}),
	workingExpansion11: Object.freeze({
		file: "04/ab67616d0000b27300041272670218ce2846bb53",
		sha256: "8fb979d4794012b8b84e61f6680fb601ab043132ffe46391016f6bbb806dbf95",
		reviewedRawKey: "#6db7d0:#4270ac:#eee9f0:#162a5c:gradient",
	}),
	development03: Object.freeze({
		file: "images/birdsofprey.jpg",
		sha256: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d",
	}),
	development23: Object.freeze({
		file: "03/ab67616d0000b2730003cdbba19cbfd06f490085.jpg",
		sha256: "3a411a061dcc0f2c41db38e97666543fe903602a7ddcdbdc81c4f77b16e47773",
	}),
	workingExpansion02: Object.freeze({
		file: "0c/ab67616d0000b273000cd88511e80aca7106ce29",
		sha256: "ee8a6c3be56759117ee04206a7b7bbbff7c8029475889fe20e976c624f8886ae",
	}),
})

async function genuine(source: Readonly<{ file: string; sha256: string }>) {
	const cached = genuineCache.get(source.file)
	if (cached) return cached
	const bytes = await readFile(source.file)
	assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256)
	const details = extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(await loadNativeImage(bytes))
	genuineCache.set(source.file, details)
	return details
}

function assertPublishedCustody(details: Awaited<ReturnType<typeof genuine>>) {
	const resultDiagnostics = details.result.diagnostics
	const diagnostics = resultDiagnostics.phase3FinalCandidate
	const publishedIds = new Set(resultDiagnostics.families.map(({ id }) => id))
	assert.equal(resultDiagnostics.familyCount,
		details.integratedDetails.common.evidence.augmentedNative.families.length +
			diagnostics.evidenceCustody.endpointAdditiveFamilyIds.length)
	assert.equal(resultDiagnostics.retainedFamilyCount, diagnostics.evidenceCustody.retainedFamilyIds.length)
	assert.equal(resultDiagnostics.families.length, diagnostics.evidenceCustody.publishedFamilyIds.length)
	assert.deepEqual([...publishedIds], diagnostics.evidenceCustody.publishedFamilyIds)
	assert.ok(diagnostics.evidenceCustody.retainedFamilyIds.every((id) => publishedIds.has(id)))
	assert.ok(diagnostics.finalSlateCustody.every(({ represented, familyRolesPublished, familySupport }) =>
		represented && familyRolesPublished && familySupport))
	assert.ok(Object.values(diagnostics.evidenceCustody.checks).every(Boolean))
	assert.ok(Object.values(diagnostics.combinedDomainBound.checks).every(Boolean))
	assert.equal(diagnostics.combinedDomainBound.verified, true)
	assert.equal(resultDiagnostics.bounds.completeCandidates, 1_500)
	assert.equal(diagnostics.configuration.bounds.inheritedTopLevelCompleteCandidates.scope,
		"baseline-algorithm-and-materializer-only")
	assert.equal(diagnostics.configuration.bounds.inheritedTopLevelCompleteCandidates.combinedEvaluationOverride,
		false)
	assert.equal(diagnostics.checks.evidenceDomainReconciled, true)
	assert.equal(diagnostics.checks.combinedDomainBoundVerified, true)
	assert.equal(diagnostics.checks.endpointAdmissionBoundVerified, true)
	assert.equal(diagnostics.checks.inheritedTopLevelBoundPreserved, true)
}

test("genuine endpoint regression publishes the admitted endpoint domain and custody", async () => {
	const source = GENUINE_SOURCES.development16
	const details = await genuine(source)
	const diagnostics = details.result.diagnostics.phase3FinalCandidate
	const accepted = details.composition.accepted.endpoint
	assert.ok(accepted)
	assert.equal(accepted.key, source.reviewedEndpointKey)
	assert.strictEqual(diagnostics.selector, details.endpointProposal.selector)
	assert.strictEqual(diagnostics.lineageEligibility, details.endpointProposal.lineageEligibility)
	assert.deepEqual(details.result.diagnostics.fieldHypotheses,
		details.endpointProposal.augmentedFields.map(({ hypothesis }) => hypothesis))
	assert.equal(details.result.diagnostics.familyCount, details.endpointProposal.augmentedFamilies.length)
	assert.equal(details.result.diagnostics.retainedFamilyCount,
		details.integratedDetails.common.evidence.augmentedNative.retainedFamilyIds.length +
			diagnostics.evidenceCustody.endpointAdditiveFamilyIds.length)
	assert.equal(details.result.diagnostics.completeCandidateCount,
		details.endpointProposal.domain.evaluationMaterializedTreatmentCount)
	assert.strictEqual(diagnostics.componentLocalEndpointProposal, details.endpointProposal)
	assert.strictEqual(details.result.alternatives.at(-1), accepted.treatment)
	assert.ok(accepted.candidateDiagnostic.eligible)
	assert.equal(accepted.custody.mechanism.key, accepted.key)
	assert.equal(accepted.custody.expandedDomain.key, accepted.key)
	assert.deepEqual(diagnostics.combinedDomainBound.actual, {
		endpointDescriptorCount: details.endpointProposal.domain.componentLocalDescriptorCount,
		baselineMaterializedTreatmentCount: 1_500,
		endpointSupplementalMaterializedTreatmentCount: 145,
		combinedEvaluationTreatmentCount: 1_645,
		reportedCanonicalUnionTreatmentCount: 1_645,
	})
	assert.equal(diagnostics.combinedDomainBound.bounds.maximumBaselineMaterializedTreatments, 1_500)
	assert.equal(diagnostics.combinedDomainBound.bounds.maximumEndpointSupplementalMaterializedTreatments, 1_500)
	assert.equal(diagnostics.combinedDomainBound.bounds.maximumCombinedEvaluationTreatments, 3_000)
	assert.strictEqual(details.result.diagnostics.bounds,
		details.integratedDetails.result.diagnostics.bounds)
	assertPublishedCustody(details)
})

test("genuine cyan strict midpoint winner, slate, and diagnostics remain integrated authority", async () => {
	const details = await genuine(GENUINE_SOURCES.development03)
	const integrated = details.integratedDetails
	const diagnostics = details.result.diagnostics.phase3FinalCandidate
	assert.strictEqual(details.result.winner, integrated.result.winner)
	assert.strictEqual(details.result.alternatives, integrated.result.alternatives)
	assert.strictEqual(diagnostics.gradientAuthority,
		integrated.result.diagnostics.phase3IntegratedCandidate.gradientAuthority)
	assert.strictEqual(diagnostics.supportedGradientPath,
		integrated.result.diagnostics.phase3IntegratedCandidate.supportedGradientPath)
	assert.equal(diagnostics.gradientAuthority.selectedTransitionGradient, true)
	assert.equal(diagnostics.gradientAuthority.strictVetoApplied, false)
	assert.equal(diagnostics.gradientAuthority.midpoint.kind, "source-supported-three-stop")
	const midpoint = diagnostics.gradientAuthority.midpoint
	assert.ok(midpoint.color)
	assert.equal(midpoint.color.hex, "#1880a7")
	assert.ok((midpoint.color.oklab as OKLab)[1] < 0 && (midpoint.color.oklab as OKLab)[2] < 0)
	assert.equal(diagnostics.composition.mechanisms.every(({ noAdmission }) => noAdmission), true)
	assertPublishedCustody(details)
})

test("genuine reviewed raw regression admits the exact complement and displaces its near reserve", async () => {
	const source = GENUINE_SOURCES.workingExpansion11
	const details = await genuine(source)
	const raw = details.composition.diagnostics.mechanisms[1]
	const accepted = details.composition.accepted.raw
	assert.ok(accepted)
	assert.equal(details.rawProposal.proposals.length, 1)
	assert.equal(accepted.key, source.reviewedRawKey)
	assert.equal(raw.admittedKey, source.reviewedRawKey)
	assert.equal(raw.proposals[0].outcome, "admitted")
	assert.equal(raw.proposals[0].mutationApplied, true)
	const displaced = details.integratedDetails.result.alternatives.find((treatment) =>
		completeTreatmentKey(treatment) === raw.displacedIntegratedKey)
	assert.ok(displaced)
	assert.equal(areAlbumArtworkPaletteV2Phase3RawRelationRenderingsNear(displaced, accepted.treatment), true)
	assert.equal(details.result.alternatives.includes(displaced), false)
	assert.strictEqual(details.result.alternatives.at(-1), accepted.treatment)
	assert.strictEqual(details.result.winner, details.integratedDetails.result.winner)
	assertPublishedCustody(details)
})

test("rejected combined-v3 authority is excluded from the projected strict-veto regression", async () => {
	const details = await genuine(GENUINE_SOURCES.development23)
	const diagnostics = details.result.diagnostics.phase3FinalCandidate
	assert.strictEqual(details.result.winner, details.integratedDetails.result.winner)
	assert.equal(diagnostics.gradientAuthority.strictVetoApplied, true)
	assert.equal(diagnostics.gradientAuthority.projectedFlatSibling, true)
	assert.equal(details.result.winner.gradient, false)
	assert.equal(diagnostics.gradientAuthority.midpoint.kind, "none")
	assert.equal(details.composition.accepted.endpoint, null)
	assert.deepEqual(diagnostics.combinedDomainBound.actual, {
		endpointDescriptorCount: 0,
		baselineMaterializedTreatmentCount: 1_500,
		endpointSupplementalMaterializedTreatmentCount: 0,
		combinedEvaluationTreatmentCount: 1_500,
		reportedCanonicalUnionTreatmentCount: 1_500,
	})
	assert.equal(diagnostics.combinedDomainBound.checks.noEndpointDescriptorsUseZeroSupplemental, true)
	assert.equal(diagnostics.combinedDomainBound.checks.noEndpointDescriptorsUseBaselineCombinedDomain, true)
	assert.equal(diagnostics.winnerAuthority,
		"immutable-integrated-after-strict-supported-gradient-midpoint-authority")
	assert.deepEqual(diagnostics.excludedWinnerAuthorities,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities)
	assert.equal("pathBoundWinnerAuthority" in diagnostics, false)
	assertPublishedCustody(details)
})

test("genuine expansion-02 publishes integrated band-local families and reconciled counts", async () => {
	const details = await genuine(GENUINE_SOURCES.workingExpansion02)
	const bandLocalFamilies = details.integratedDetails.common.evidence.bandLocalEndpointFamilies
	const publishedIds = new Set(details.result.diagnostics.families.map(({ id }) => id))
	assert.ok(bandLocalFamilies.length > 0)
	assert.ok(bandLocalFamilies.every(({ id }) => publishedIds.has(id)))
	assert.equal(details.result.diagnostics.familyCount,
		details.integratedDetails.common.evidence.augmentedNative.families.length)
	assert.equal(details.result.diagnostics.retainedFamilyCount,
		details.integratedDetails.common.evidence.augmentedNative.retainedFamilyIds.length)
	assertPublishedCustody(details)
})

test("final candidate source has no rejected authority, source identity, outcome, or literal-color dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-final-candidate.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source,
		/from\s+["'][^"']*(?:source-light-foreground-reserve|midpoint-aware|path-bound-render)[^"']*["']/iu)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|working-expansion|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|manifest|target.?color|historical)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	assert.doesNotMatch(source, /(?:\/\/|\/\*)/u)
	assert.match(source, /rejected-source-light-foreground-reserve/u)
	assert.match(source, /rejected-combined-v3-path-bound-winner/u)
})
