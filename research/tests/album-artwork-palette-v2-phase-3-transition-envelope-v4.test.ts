import assert from "node:assert/strict"
import test from "node:test"
import type {
	BackgroundFieldDomainEvidence,
	ColorRepresentative,
	FieldHypothesis,
	GradientDirection,
} from "../src/album-artwork-palette-v2.ts"
import type {
	FieldTransitionTrace,
	NativeFieldTransitionDiscovery,
} from "../src/album-artwork-palette-v2-phase-3-field-transition.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY,
	normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4,
} from "../src/album-artwork-palette-v2-phase-3-transition-envelope-v4.ts"

function representative(familyId: string, value: number): ColorRepresentative {
	const hex = `#${value.toString(16).padStart(2, "0").repeat(3)}`
	return {
		strategy: "dense-exact",
		rgb: [value, value, value],
		oklab: [value / 255, 0, 0],
		hex,
		support: {
			exactSource: true,
			exemplar: { x: 1, y: 1 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: 0.8,
			totalSupport: 0.2,
			connectedSupport: 0.2,
			spatialCoverage: 0.8,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function hypothesis(id: string, domainId: string, fieldFidelity = 0.5): FieldHypothesis {
	const background = representative("field-low", 40)
	const surface = representative("field-high", 180)
	const profile = {
		frameCoverage: 0.8,
		peripheralCoverage: 0.8,
		connectedCoverage: 0.8,
		fieldScore: 0.8,
		populationCoverage: 0.8,
		evidenceLevels: [20, 20, 20, 20, 20] as [number, number, number, number, number],
	}
	return {
		id,
		kind: "gradient-field",
		backgroundFamilyId: "field-low",
		surfaceFamilyId: "field-high",
		backgroundRepresentatives: [background],
		surfaceRepresentatives: [surface],
		fieldFidelity,
		surfaceContribution: 0.8,
		spatialRelation: null,
		roleAssignment: {
			backgroundFamilyId: "field-low",
			surfaceFamilyId: "field-high",
			backgroundProfile: profile,
			surfaceProfile: profile,
			decisiveCriterion: "ascii-tie",
			confidence: 0,
		},
		gradientEvidence: {
			topology: "linear",
			direction: "horizontal",
			endpointBands: [0.15, 0.85],
			progression: 0.8,
			modeProgression: 0.7,
			monotonicity: 0.8,
			residual: 0.02,
			span: 0.2,
			texture: 0.02,
			bandDispersion: 0.1,
			edgeContinuity: 0.6,
			coverage: 0.16,
			supportingFamilyIds: ["field-low", "field-high"],
			supportingEndpointHexes: [background.hex, surface.hex],
			backgroundTopologyEndpoint: "low",
			roleAssignment: {
				backgroundFamilyId: "field-low",
				surfaceFamilyId: "field-high",
				backgroundProfile: profile,
				surfaceProfile: profile,
				decisiveCriterion: "ascii-tie",
				confidence: 0,
			},
			fieldDomainId: domainId,
			fieldDomainPopulationFraction: 0.16,
			fieldDomainBorderCoverage: 0.2,
			fieldDomainOwnedCornerCount: 2,
			supportingComponentIds: ["component-low", "component-high"],
		},
		pruningNotes: [],
	}
}

function domain(id: string, eligible: boolean): BackgroundFieldDomainEvidence {
	return {
		id,
		kind: "connected",
		sourceDomainIds: [],
		startPixelIndex: 0,
		population: 160,
		populationFraction: 0.16,
		borderPixels: 40,
		borderCoverage: 0.2,
		quadrantCoverage: 0.75,
		ownedCornerCount: 2,
		weightedFieldScore: 0.4,
		centroid: [0.5, 0.5],
		meanColor: [0.5, 0, 0],
		transitionFamilyCount: 3,
		transitionPopulationFraction: 0.2,
		transitionQuadrantCoverage: 0.75,
		familyIds: ["field-low", "field-middle", "field-high"],
		componentIds: ["component-low", "component-middle", "component-high"],
		eligible,
		rejectionReasons: eligible ? [] : ["synthetic eligibility rejection"],
	}
}

function trace(id: string, eligible: boolean, direction: GradientDirection): FieldTransitionTrace {
	return {
		fieldDomainId: id,
		topology: "linear",
		direction,
		spatialCenter: null,
		endpointFamilyIds: ["field-low", "field-high"],
		stageFamilyIds: ["field-low", "field-middle", "field-high"],
		stageRegionIds: ["region-low", "region-middle", "region-high"],
		stagePositions: [0, 0.5, 1],
		edgeLocalSteps: [0.02, 0.02],
		endpointDistance: 0.2,
		spatialProgression: 0.8,
		colorProgression: 0.9,
		colorDirectness: 0.9,
		localContinuity: 0.6,
		branching: 0.1,
		eligible,
		rejectionReasons: eligible ? [] : ["synthetic eligibility rejection"],
	}
}

function discovery(
	id: string,
	accepted: boolean,
	direction: GradientDirection = "horizontal",
): NativeFieldTransitionDiscovery {
	return {
		regions: [],
		fieldDomains: [domain(id, accepted)],
		traces: [trace(id, accepted, direction)],
		// A rejected hypothesis is intentionally retained to verify that eligibility remains authoritative.
		hypotheses: [hypothesis(`hypothesis:${id}`, id)],
	}
}

test("accepted native transitions normalize every ownership measure against the existing envelope", () => {
	const result = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		discovery("accepted-domain", true),
	)
	const entry = result.diagnostics.entries[0]

	assert.equal(entry.credited, true)
	assert.deepEqual(entry.normalized, {
		population: 1,
		perimeter: 1,
		quadrants: 1,
		corners: 1,
		aggregate: 1,
	})
	assert.equal(result.diagnostics.creditedHypothesisCount, 1)
	assert.deepEqual(result.diagnostics.creditedHypothesisIds, ["hypothesis:accepted-domain"])
	const weights = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY.fieldFidelityWeights
	const expected = weights.weightedFieldScore * 0.4 + weights.nativeEnvelope +
		weights.progression * 0.8 + weights.localContinuity * 0.6 + weights.lowBranching * 0.9
	assert.ok(Math.abs(result.hypotheses[0].fieldFidelity - expected) < 1e-12)
	assert.ok(result.hypotheses[0].fieldFidelity > 0.5)
})

test("rejected transitions receive no normalized envelope credit", () => {
	const input = discovery("rejected-domain", false)
	const result = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(input)
	const entry = result.diagnostics.entries[0]

	assert.equal(entry.acceptedBeforeNormalization, false)
	assert.equal(entry.credited, false)
	assert.equal(entry.normalized, null)
	assert.equal(entry.normalizedFieldFidelity, null)
	assert.equal(result.hypotheses[0].fieldFidelity, input.hypotheses[0].fieldFidelity)
	assert.equal(result.diagnostics.creditedHypothesisCount, 0)
})

test("a domain-eligible but trace-rejected transition is not counted as accepted", () => {
	const input = discovery("trace-rejected-domain", true)
	const result = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4({
		...input,
		traces: [trace("trace-rejected-domain", false, "horizontal")],
	})

	assert.equal(input.fieldDomains[0].eligible, true)
	assert.equal(result.diagnostics.discoveredDomainCount, 1)
	assert.equal(result.diagnostics.acceptedDomainCount, 0)
	assert.equal(result.diagnostics.entries[0].acceptedBeforeNormalization, false)
	assert.equal(result.diagnostics.entries[0].credited, false)
})

test("transition envelope fidelity is invariant under reflection and quarter-turn direction changes", () => {
	const directions = ["horizontal", "vertical", "diagonal-up", "diagonal-down"] as const
	const results = directions.map((direction) =>
		normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
			discovery(`domain:${direction}`, true, direction),
		))
	const reference = results[0]
	for (const result of results.slice(1)) {
		assert.equal(result.hypotheses[0].fieldFidelity, reference.hypotheses[0].fieldFidelity)
		assert.deepEqual(result.diagnostics.entries[0].normalized,
			reference.diagnostics.entries[0].normalized)
	}
})
