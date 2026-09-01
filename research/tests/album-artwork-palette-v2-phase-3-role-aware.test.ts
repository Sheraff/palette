import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildRoleSpecificIdentityObligations,
	classifyFieldConditionalFamilyRole,
	compareRoleAwareIdentityCandidates,
	orderRoleAwareIdentityCandidates,
	roleSpecificObligationCoverage,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import type {
	ColorFamilyEvidence,
	CompletePaletteTreatment,
	FieldHypothesis,
	RegionObservation,
} from "../src/album-artwork-palette-v2.ts"

type RoleFactors = RegionObservation["foregroundTypography"]
type Representative = FieldHypothesis["backgroundRepresentatives"][number]
type ObservationInput = Partial<Omit<RegionObservation, "foregroundTypography" | "signatureAccent">> & Readonly<{
	foregroundTypography?: Partial<RoleFactors>
	signatureAccent?: Partial<RoleFactors>
}>
type TreatmentInput = Omit<Partial<CompletePaletteTreatment>, "scores"> & Readonly<{
	foregroundFamily?: string
	accentFamily?: string
	accentCollapsed?: boolean
	scores?: Partial<CompletePaletteTreatment["scores"]>
}>

function factors(values: Partial<RoleFactors> = {}): RoleFactors {
	return {
		geometry: 0.5,
		fill: 0.5,
		repetition: 0.5,
		localContrast: 0.5,
		borderInterior: 0.8,
		sourceSupport: 0.75,
		score: 0.65,
		...values,
	}
}

function observation(values: ObservationInput = {}): RegionObservation {
	return {
		widthFraction: 0.08,
		heightFraction: 0.025,
		boundsFraction: 0.002,
		elongation: 3.2,
		fill: 0.35,
		repetition: 0.75,
		localContrast: 0.15,
		boundaryLightnessContrast: 0.4,
		boundaryLightnessPolarity: 1,
		borderContact: 0,
		interiorMargin: 0.15,
		componentFamilyFraction: 0.3,
		...values,
		foregroundTypography: factors({
			geometry: 0.85,
			fill: 0.75,
			repetition: 0.8,
			localContrast: 0.9,
			sourceSupport: 0.85,
			score: 0.82,
			...values.foregroundTypography,
		}),
		signatureAccent: factors({
			geometry: 0.35,
			fill: 0.55,
			repetition: 0.8,
			localContrast: 0.9,
			sourceSupport: 0.85,
			score: 0.5,
			...values.signatureAccent,
		}),
	}
}

function family(values: Partial<ColorFamilyEvidence> & Readonly<{
	observations?: readonly RegionObservation[]
}> = {}): ColorFamilyEvidence {
	const observations = values.observations ?? [observation(), observation(), observation()]
	return {
		id: "family-a",
		prototype: [0.2, 0.01, 0.01],
		population: 90,
		populationFraction: 0.009,
		perceptualBinCount: 1,
		borderCoverage: 0,
		centerCoverage: 0.2,
		quadrantCoverage: 0.5,
		cornerCoverage: 0,
		centroid: [0.5, 0.5],
		spatialSpread: 0.2,
		largestComponentFraction: 0.003,
		familyConcentration: 0.45,
		componentCount: observations.length,
		repeatedComponentCount: observations.length,
		edgeDensity: 0.5,
		localContrast: 0.16,
		chroma: 0.01,
		fieldScore: 0.1,
		signatureScore: 0.6,
		foregroundScore: 0.7,
		foregroundTypographyObservation: 0.8,
		foregroundPolarityObservation: {
			polarity: 1,
			confidence: 0.9,
			componentIds: observations.map((_value, index) => `region-${index}`),
		},
		signatureAccentObservation: 0.5,
		observedComponentCount: observations.length,
		components: observations.map((region, index) => ({
			id: `region-${index}`,
			startPixelIndex: index,
			population: 30,
			populationFraction: 0.003,
			minX: 2 + index * 12,
			minY: 4,
			maxX: 8 + index * 12,
			maxY: 10,
			borderPixels: 0,
			retainedFor: ["connected-support", "role-observation"],
			observation: region,
		})),
		representatives: [],
		...values,
	}
}

function representative(lightness: number): Representative {
	return {
		strategy: "dense-exact",
		rgb: [128, 128, 128],
		oklab: [lightness, 0, 0],
		hex: "#808080",
		support: {
			exactSource: true,
			exemplar: { x: 0, y: 0 },
			anchorFamilyId: "field-family",
			regionIds: ["field-region"],
			perceptualDensity: 1,
			totalSupport: 0.8,
			connectedSupport: 0.8,
			spatialCoverage: 1,
			concentration: 1,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function field(values: Partial<FieldHypothesis> = {}): FieldHypothesis {
	return {
		id: "field-hypothesis",
		kind: "one-field",
		backgroundFamilyId: "field-family",
		surfaceFamilyId: null,
		backgroundRepresentatives: [representative(0.8)],
		surfaceRepresentatives: [],
		fieldFidelity: 0.8,
		surfaceContribution: 0,
		spatialRelation: null,
		roleAssignment: null,
		gradientEvidence: null,
		pruningNotes: [],
		...values,
	}
}

function roleColor(rgb: readonly [number, number, number], generated = false): CompletePaletteTreatment["foreground"] {
	return {
		rgb,
		oklab: [rgb[0] / 255, 0, 0],
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		generated,
		strategy: generated ? "generated-emergency" : "dense-exact",
		support: generated
			? {
				generated: true,
				role: "foreground",
				reason: "degenerate-supported-domain",
				supportedPairCount: 0,
				maximumSupportedAbsoluteLc: 0,
				thresholdExclusive: 5,
				preferencePenalty: 0.18,
			}
			: representative(rgb[0] / 255).support,
	}
}

function treatment(values: TreatmentInput = {}): CompletePaletteTreatment {
	const {
		foregroundFamily = "family-a",
		accentFamily = "family-b",
		accentCollapsed = false,
		scores: scoreValues,
		...treatmentValues
	} = values
	const scores: CompletePaletteTreatment["scores"] = {
		fieldFidelity: 0.7,
		surfaceFidelity: 0.7,
		fieldStructure: 0.7,
		fieldIdentity: 0.7,
		treatmentFoundation: 0.7,
		activeRolePathObservability: 1,
		artworkIdentity: 0.7,
		representativeness: 0.7,
		uiUtility: 0.7,
		foregroundUtility: 0.7,
		foregroundPolarityAgreement: 0.7,
		accentFidelity: 0.7,
		accentUtility: 0.7,
		coherence: 0.7,
		economy: 0.7,
		generatorConfidence: 0.7,
		foundation: 0.7,
		balance: 0.7,
		generatedPenalty: 0,
		rankingScore: 0.7,
		...scoreValues,
	}
	const foreground = roleColor([32, 32, 32])
	const accent = accentCollapsed ? foreground : roleColor([192, 192, 192])
	return {
		id: "treatment-a",
		background: roleColor([112, 112, 112]),
		surface: roleColor([112, 112, 112]),
		foreground,
		accent,
		gradient: false,
		fieldTreatment: "one-field",
		sourceFieldHypothesisId: "field-hypothesis",
		familyRoles: {
			background: "field-family",
			surface: "field-family",
			foreground: foregroundFamily,
			accent: accentCollapsed ? foregroundFamily : accentFamily,
		},
		cardinality: accentCollapsed ? 2 : 3,
		collapse: { surface: true, accent: accentCollapsed },
		contrast: { pairs: [], minimumAbsoluteLc: 0, meanAbsoluteLc: 0 },
		scores,
		gradientEvidence: null,
		...treatmentValues,
	}
}

test("glyph-like repeated regions prefer foreground without a lightness-direction preference", () => {
	const darkOnLight = classifyFieldConditionalFamilyRole(family(), field())
	const lightOnDark = classifyFieldConditionalFamilyRole(family({
		id: "family-mirror",
		prototype: [0.8, 0.01, 0.01],
		foregroundPolarityObservation: { polarity: -1, confidence: 0.9, componentIds: ["mirror"] },
	}), field({
		id: "field-mirror",
		backgroundRepresentatives: [representative(0.2)],
	}))

	assert.equal(darkOnLight.preference, "foreground")
	assert.equal(lightOnDark.preference, "foreground")
	assert.equal(darkOnLight.reason, "decisive-foreground")
	assert.ok(Math.abs(darkOnLight.foreground.score - lightOnDark.foreground.score) < 1e-12)
	assert.ok(darkOnLight.foreground.typographyLikeGeometry > 0.75)
	assert.ok(darkOnLight.foreground.repetition > 0.7)
})

test("field polarity is conditional and a polarity contradiction weakens foreground evidence", () => {
	const matching = classifyFieldConditionalFamilyRole(family(), field())
	const contradictory = classifyFieldConditionalFamilyRole(family({
		foregroundPolarityObservation: { polarity: -1, confidence: 0.9, componentIds: ["contradiction"] },
	}), field())

	assert.ok(matching.foreground.polarityAgreement > 0.85)
	assert.equal(contradictory.foreground.polarityAgreement, 0)
	assert.ok(matching.foreground.score > contradictory.foreground.score + 0.1)
})

test("compact repeated chromatic decorative marks prefer accent", () => {
	const decorative = observation({
		boundsFraction: 0.004,
		repetition: 0.9,
		foregroundTypography: { geometry: 0.1, fill: 0.15, repetition: 0.9, score: 0.3 },
		signatureAccent: { geometry: 0.9, fill: 0.9, repetition: 0.9, score: 0.9 },
	})
	const evidence = classifyFieldConditionalFamilyRole(family({
		id: "decorative-family",
		chroma: 0.2,
		foregroundPolarityObservation: { polarity: 0, confidence: 0.1, componentIds: ["mark"] },
		observations: [decorative, decorative, decorative],
	}), field())

	assert.equal(evidence.preference, "accent")
	assert.equal(evidence.reason, "decisive-accent")
	assert.ok(evidence.accent.compactness > 0.8)
	assert.ok(evidence.accent.score > evidence.foreground.score + 0.11)
})

test("simultaneously supported foreground and accent evidence remains ambiguous", () => {
	const dual = observation({
		repetition: 0.95,
		foregroundTypography: { geometry: 0.95, fill: 0.9, repetition: 0.95, score: 0.95 },
		signatureAccent: { geometry: 0.95, fill: 0.95, repetition: 0.95, score: 0.95 },
	})
	const evidence = classifyFieldConditionalFamilyRole(family({
		id: "dual-family",
		chroma: 0.22,
		observations: [dual, dual, dual, dual],
	}), field())

	assert.equal(evidence.preference, "ambiguous")
	assert.equal(evidence.reason, "simultaneous-role-support")
	assert.ok(evidence.foreground.score >= 0.62)
	assert.ok(evidence.accent.score >= 0.62)
})

test("isolated noise is ambiguous and cannot become an obligation", () => {
	const noiseRegion = observation({
		boundsFraction: 1 / 10_000,
		repetition: 0,
		foregroundTypography: { repetition: 0, sourceSupport: 0.03, score: 0.05 },
		signatureAccent: { repetition: 0, sourceSupport: 0.03, score: 0.05 },
	})
	const evidence = classifyFieldConditionalFamilyRole(family({
		id: "isolated-family",
		population: 1,
		populationFraction: 1 / 10_000,
		largestComponentFraction: 1 / 10_000,
		familyConcentration: 1,
		componentCount: 1,
		repeatedComponentCount: 0,
		chroma: 0.25,
		observations: [noiseRegion],
	}), field())

	assert.equal(evidence.preference, "ambiguous")
	assert.equal(evidence.reason, "insufficient-role-evidence")
	assert.ok(evidence.coherentSupport < 0.25)
	assert.deepEqual(buildRoleSpecificIdentityObligations([evidence]), [])
})

test("field-owned families are reported but never promoted to identity obligations", () => {
	const evidence = classifyFieldConditionalFamilyRole(family({ id: "field-family" }), field())
	assert.equal(evidence.preference, "ambiguous")
	assert.equal(evidence.reason, "field-owned-family")
	assert.deepEqual(buildRoleSpecificIdentityObligations([evidence]), [])
})

test("obligation construction is bounded, deterministic, and preserves ambiguous role support", () => {
	const foreground = classifyFieldConditionalFamilyRole(family({ id: "family-foreground" }), field())
	const decorativeRegion = observation({
		foregroundTypography: { geometry: 0.1, fill: 0.1, score: 0.2 },
		signatureAccent: { geometry: 0.95, fill: 0.95, score: 0.95 },
	})
	const accent = classifyFieldConditionalFamilyRole(family({
		id: "family-accent",
		chroma: 0.22,
		foregroundPolarityObservation: { polarity: 0, confidence: 0, componentIds: [] },
		observations: [decorativeRegion, decorativeRegion, decorativeRegion],
	}), field())
	const dualRegion = observation({
		foregroundTypography: { geometry: 0.98, fill: 0.95, score: 0.98 },
		signatureAccent: { geometry: 0.98, fill: 0.98, score: 0.98 },
	})
	const dual = classifyFieldConditionalFamilyRole(family({
		id: "family-dual",
		chroma: 0.22,
		observations: [dualRegion, dualRegion, dualRegion],
	}), field())
	const first = buildRoleSpecificIdentityObligations([foreground, accent, dual], 3)
	const second = buildRoleSpecificIdentityObligations([dual, foreground, accent], 3)

	assert.deepEqual(first, second)
	assert.equal(first.length, 3)
	assert.equal(first.find(({ familyId }) => familyId === "family-foreground")?.requiredRole, "foreground")
	assert.equal(first.find(({ familyId }) => familyId === "family-accent")?.requiredRole, "accent")
	assert.equal(first.find(({ familyId }) => familyId === "family-dual")?.requiredRole, "ambiguous")
	assert.deepEqual(first.map(({ priority }) => priority), [0, 1, 2])
})

test("coverage requires the attributed role, field lineage, and a distinct accent", () => {
	const foregroundEvidence = classifyFieldConditionalFamilyRole(family({ id: "family-foreground" }), field())
	const decorative = observation({
		foregroundTypography: { geometry: 0.05, fill: 0.05, score: 0.15 },
		signatureAccent: { geometry: 0.95, fill: 0.95, score: 0.95 },
	})
	const accentEvidence = classifyFieldConditionalFamilyRole(family({
		id: "family-accent",
		chroma: 0.22,
		foregroundPolarityObservation: { polarity: 0, confidence: 0, componentIds: [] },
		observations: [decorative, decorative, decorative],
	}), field())
	const obligations = buildRoleSpecificIdentityObligations([foregroundEvidence, accentEvidence], 2)
	const correct = roleSpecificObligationCoverage(treatment({
		foregroundFamily: "family-foreground",
		accentFamily: "family-accent",
	}), obligations)
	const swapped = roleSpecificObligationCoverage(treatment({
		foregroundFamily: "family-accent",
		accentFamily: "family-foreground",
	}), obligations)
	const collapsed = roleSpecificObligationCoverage(treatment({
		foregroundFamily: "family-accent",
		accentFamily: "family-accent",
		accentCollapsed: true,
	}), obligations)
	const otherField = roleSpecificObligationCoverage(treatment({
		sourceFieldHypothesisId: "other-field",
		foregroundFamily: "family-foreground",
		accentFamily: "family-accent",
	}), obligations)

	assert.equal(correct.coveredCount, 2)
	assert.equal(correct.foregroundCoveredCount, 1)
	assert.equal(correct.accentCoveredCount, 1)
	assert.equal(swapped.coveredCount, 0)
	assert.equal(collapsed.coveredCount, 0)
	assert.equal(otherField.coveredCount, 0)
})

test("candidate ordering is permutation-invariant and uses role coverage before quality ties", () => {
	const evidence = classifyFieldConditionalFamilyRole(family({ id: "family-foreground" }), field())
	const obligations = buildRoleSpecificIdentityObligations([evidence])
	const covered = treatment({ id: "covered", foregroundFamily: "family-foreground", scores: { rankingScore: 0.3 } })
	const uncovered = treatment({ id: "uncovered", foregroundFamily: "other-family", scores: { rankingScore: 0.95 } })
	const sameCoverageLowerQuality = treatment({
		id: "covered-lower-quality",
		foregroundFamily: "family-foreground",
		scores: { treatmentFoundation: 0.5, rankingScore: 0.95 },
	})

	assert.ok(compareRoleAwareIdentityCandidates(covered, uncovered, obligations) < 0)
	assert.deepEqual(
		orderRoleAwareIdentityCandidates([uncovered, sameCoverageLowerQuality, covered], obligations).map(({ id }) => id),
		["covered", "covered-lower-quality", "uncovered"],
	)
	assert.deepEqual(
		orderRoleAwareIdentityCandidates([covered, uncovered, sameCoverageLowerQuality], obligations).map(({ id }) => id),
		["covered", "covered-lower-quality", "uncovered"],
	)
})

test("obligation caps and priorities are local to each field hypothesis", () => {
	const firstFieldEvidence = classifyFieldConditionalFamilyRole(family({ id: "family-first" }), field({ id: "field-first" }))
	const secondFieldEvidence = classifyFieldConditionalFamilyRole(family({ id: "family-second" }), field({ id: "field-second" }))
	const obligations = buildRoleSpecificIdentityObligations([secondFieldEvidence, firstFieldEvidence], 1)
	const firstCandidate = treatment({
		id: "first-candidate",
		sourceFieldHypothesisId: "field-first",
		foregroundFamily: "family-first",
		scores: { treatmentFoundation: 0.6 },
	})
	const secondCandidate = treatment({
		id: "second-candidate",
		sourceFieldHypothesisId: "field-second",
		foregroundFamily: "family-second",
		scores: { treatmentFoundation: 0.8 },
	})

	assert.equal(obligations.length, 2)
	assert.deepEqual(obligations.map(({ priority }) => priority), [0, 0])
	assert.equal(roleSpecificObligationCoverage(firstCandidate, obligations).coveredCount, 1)
	assert.equal(roleSpecificObligationCoverage(secondCandidate, obligations).coveredCount, 1)
	assert.deepEqual(orderRoleAwareIdentityCandidates([firstCandidate, secondCandidate], obligations).map(({ id }) => id),
		["second-candidate", "first-candidate"])
})

test("attempt inference has no filesystem, case, feedback, name, or historical-treatment dependency", async () => {
	const source = await readFile(new URL("../src/album-artwork-palette-v2-phase-3-role-aware.ts", import.meta.url), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /(?:caseId|sourceId|pathname|feedback|review|colorName|treatmentKey)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
})
