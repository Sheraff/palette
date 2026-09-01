import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_MODULE,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
	albumArtworkPaletteV2Phase3RoleDomainV2Coverage,
	buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations,
	classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family,
	constructAlbumArtworkPaletteV2Phase3RoleDomainV2,
} from "../src/album-artwork-palette-v2-phase-3-role-domain-v2.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	FieldHypothesis,
	NativePaletteEvidence,
	RegionObservation,
} from "../src/album-artwork-palette-v2.ts"
import type { RoleSpecificIdentityObligation } from
	"../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import { albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata } from
	"../src/album-artwork-palette-v2-phase-3-materialization-v2.ts"
import { selectAlbumArtworkPaletteV2Phase3SelectorV2 } from
	"../src/album-artwork-palette-v2-phase-3-selector-v2.ts"
import type { RGB } from "../src/types.ts"

type RoleFactors = RegionObservation["foregroundTypography"]
type ObservationInput = Partial<Omit<RegionObservation, "foregroundTypography" | "signatureAccent">> & Readonly<{
	foregroundTypography?: Partial<RoleFactors>
	signatureAccent?: Partial<RoleFactors>
}>

function factors(values: Partial<RoleFactors> = {}): RoleFactors {
	return {
		geometry: 0.4,
		fill: 0.4,
		repetition: 0.7,
		localContrast: 0.85,
		borderInterior: 0.8,
		sourceSupport: 0.9,
		score: 0.6,
		...values,
	}
}

function observation(values: ObservationInput = {}): RegionObservation {
	return {
		widthFraction: 0.08,
		heightFraction: 0.025,
		boundsFraction: 0.002,
		elongation: 3,
		fill: 0.35,
		repetition: 0.85,
		localContrast: 0.16,
		boundaryLightnessContrast: 0.5,
		boundaryLightnessPolarity: 1,
		borderContact: 0,
		interiorMargin: 0.15,
		componentFamilyFraction: 0.3,
		...values,
		foregroundTypography: factors({
			geometry: 0.9,
			fill: 0.8,
			repetition: 0.9,
			score: 0.9,
			...values.foregroundTypography,
		}),
		signatureAccent: factors({
			geometry: 0.2,
			fill: 0.3,
			repetition: 0.85,
			score: 0.3,
			...values.signatureAccent,
		}),
	}
}

function hex(rgb: RGB): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function representative(id: string, rgb: RGB, lightness: number, chroma = 0): ColorRepresentative {
	return {
		strategy: "dense-exact",
		rgb,
		oklab: [lightness, chroma, 0],
		hex: hex(rgb),
		support: {
			exactSource: true,
			exemplar: { x: 1, y: 1 },
			anchorFamilyId: id,
			regionIds: [`${id}-region`],
			perceptualDensity: 1,
			totalSupport: 0.8,
			connectedSupport: 0.8,
			spatialCoverage: 0.8,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function family(values: Readonly<{
	id: string
	rgb: RGB
	lightness: number
	chroma?: number
	polarity?: number
	polarityConfidence?: number
	observations?: readonly RegionObservation[]
}>): ColorFamilyEvidence {
	const observations = values.observations ?? [observation(), observation(), observation()]
	return {
		id: values.id,
		prototype: [values.lightness, values.chroma ?? 0.01, 0],
		population: Math.max(12, observations.length * 20),
		populationFraction: 0.009,
		perceptualBinCount: 1,
		borderCoverage: 0,
		centerCoverage: 0.2,
		quadrantCoverage: 0.5,
		cornerCoverage: 0,
		centroid: [0.5, 0.5],
		spatialSpread: 0.2,
		largestComponentFraction: 0.003,
		familyConcentration: 0.6,
		componentCount: observations.length,
		repeatedComponentCount: observations.length,
		edgeDensity: 0.5,
		localContrast: 0.16,
		chroma: values.chroma ?? 0.01,
		fieldScore: 0.1,
		signatureScore: 0.7,
		foregroundScore: 0.8,
		foregroundTypographyObservation: 0.85,
		foregroundPolarityObservation: {
			polarity: values.polarity ?? 1,
			confidence: values.polarityConfidence ?? 0.9,
			componentIds: observations.map((_value, index) => `${values.id}-component-${index}`),
		},
		signatureAccentObservation: 0.7,
		observedComponentCount: observations.length,
		components: observations.map((region, index) => ({
			id: `${values.id}-component-${index}`,
			startPixelIndex: index,
			population: 20,
			populationFraction: 0.003,
			minX: 2 + index * 12,
			minY: 4,
			maxX: 8 + index * 12,
			maxY: 10,
			borderPixels: 0,
			retainedFor: ["connected-support", "role-observation"],
			observation: region,
		})),
		representatives: [representative(values.id, values.rgb, values.lightness, values.chroma)],
	}
}

function field(fieldFamily: ColorFamilyEvidence, id = "field-hypothesis"): FieldHypothesis {
	return {
		id,
		kind: "one-field",
		backgroundFamilyId: fieldFamily.id,
		surfaceFamilyId: null,
		backgroundRepresentatives: fieldFamily.representatives,
		surfaceRepresentatives: [],
		fieldFidelity: 0.85,
		surfaceContribution: 0,
		spatialRelation: null,
		roleAssignment: null,
		gradientEvidence: null,
		pruningNotes: [],
	}
}

function evidence(
	families: readonly ColorFamilyEvidence[],
	foregroundIds: readonly string[],
	accentIds: readonly string[],
): NativePaletteEvidence {
	return {
		width: 80,
		height: 80,
		pixelCount: 6_400,
		rgbData: new Uint8Array(6_400 * 3),
		labs: new Float32Array(6_400 * 3),
		familyAt: new Uint16Array(6_400),
		families,
		adjacencies: [],
		retainedFamilyIds: families.map(({ id }) => id),
		lanes: [
			{ name: "field", maximumFamilies: 2, familyIds: [families[0].id] },
			{ name: "signature", maximumFamilies: 4, familyIds: accentIds },
			{ name: "foreground", maximumFamilies: 4, familyIds: foregroundIds },
		],
		laneRetention: [],
		familyBinStep: 0.04,
		familyAnchorRadius: 0.08,
	}
}

function sourceField(hypothesis: FieldHypothesis) {
	return { sourceType: "field-proposal-v2" as const, hypothesis }
}

function typographyFamily(id: string, rgb: RGB, lightness: number, polarity: number): ColorFamilyEvidence {
	return family({ id, rgb, lightness, polarity })
}

function markFamily(id = "mark-family"): ColorFamilyEvidence {
	const mark = observation({
		boundsFraction: 0.003,
		repetition: 0.95,
		foregroundTypography: { geometry: 0.05, fill: 0.1, repetition: 0.95, score: 0.15 },
		signatureAccent: { geometry: 0.98, fill: 0.95, repetition: 0.95, score: 0.98 },
	})
	return family({
		id,
		rgb: [220, 45, 75],
		lightness: 0.62,
		chroma: 0.22,
		polarity: 0,
		polarityConfidence: 0,
		observations: [mark, mark, mark],
	})
}

test("mirrored bright and dark typography produce symmetric foreground obligations", () => {
	const lightFieldFamily = family({ id: "light-field", rgb: [235, 235, 235], lightness: 0.92, observations: [] })
	const darkFieldFamily = family({ id: "dark-field", rgb: [22, 22, 22], lightness: 0.14, observations: [] })
	const darkTypography = typographyFamily("dark-typography", [20, 20, 20], 0.12, 1)
	const brightTypography = typographyFamily("bright-typography", [242, 242, 242], 0.94, -1)
	const darkEvidence = classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(
		darkTypography,
		field(lightFieldFamily, "light-field-hypothesis"),
	)
	const brightEvidence = classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(
		brightTypography,
		field(darkFieldFamily, "dark-field-hypothesis"),
	)

	assert.equal(darkEvidence.disposition, "foreground")
	assert.equal(brightEvidence.disposition, "foreground")
	assert.ok(Math.abs(darkEvidence.foreground.score - brightEvidence.foreground.score) < 1e-12)
	assert.ok(darkEvidence.foreground.polarityAgreement > 0.85)
	assert.ok(brightEvidence.foreground.polarityAgreement > 0.85)
	assert.deepEqual(
		buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations([brightEvidence, darkEvidence])
			.map(({ requiredRole }) => requiredRole),
		["foreground", "foreground"],
	)
})

test("repeated compact chromatic marks create an accent-only obligation", () => {
	const fieldFamily = family({ id: "field-family", rgb: [230, 230, 230], lightness: 0.9, observations: [] })
	const classified = classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(markFamily(), field(fieldFamily))
	const obligations = buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations([classified])

	assert.equal(classified.disposition, "accent")
	assert.ok(classified.accent.compactness > 0.85)
	assert.ok(classified.accent.repetition > 0.85)
	assert.ok(classified.accent.chroma > 0.99)
	assert.deepEqual(obligations.map(({ requiredRole }) => requiredRole), ["accent"])
})

test("defensible ambiguity is represented by separate foreground and accent directions", () => {
	const fieldFamily = family({ id: "field-family", rgb: [235, 235, 235], lightness: 0.92, observations: [] })
	const dualObservation = observation({
		repetition: 0.98,
		foregroundTypography: { geometry: 0.98, fill: 0.95, repetition: 0.98, score: 0.98 },
		signatureAccent: { geometry: 0.98, fill: 0.95, repetition: 0.98, score: 0.98 },
	})
	const dual = family({
		id: "dual-family",
		rgb: [165, 35, 75],
		lightness: 0.48,
		chroma: 0.22,
		observations: [dualObservation, dualObservation, dualObservation],
	})
	const classified = classifyAlbumArtworkPaletteV2Phase3RoleDomainV2Family(dual, field(fieldFamily))
	const obligations = buildAlbumArtworkPaletteV2Phase3RoleDomainV2Obligations([classified])

	assert.equal(classified.disposition, "both")
	assert.deepEqual(obligations.map(({ requiredRole }) => requiredRole), ["foreground", "accent"])
	assert.ok(obligations.every(({ ambiguousDirection }) => ambiguousDirection))
	assert.equal(new Set(obligations.map(({ id }) => id)).size, 2)
})

test("foreground-only evidence retains an honest source-connected accent collapse", () => {
	const fieldFamily = family({ id: "field-family", rgb: [235, 235, 235], lightness: 0.92, observations: [] })
	const typography = typographyFamily("typography-family", [18, 18, 18], 0.11, 1)
	const hypothesis = field(fieldFamily)
	const output = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: evidence([fieldFamily, typography], [typography.id], []),
		fieldHypotheses: [sourceField(hypothesis)],
	})

	assert.equal(output.diagnostics.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION)
	assert.equal(output.roleObligations.length, 1)
	assert.equal(output.roleObligations[0].requiredRole, "foreground")
	assert.ok(output.logicalDescriptors.length > 0)
	assert.ok(output.logicalDescriptors.every(({ treatment }) => treatment.collapse.accent))
	assert.ok(output.logicalDescriptors.every(({ treatment }) =>
		treatment.familyRoles.foreground === typography.id && treatment.familyRoles.accent === typography.id))
	assert.ok(output.logicalDescriptors.every(({ lineage }) =>
		lineage.sourceConnected && lineage.representatives.every(({ sourceConnected }) => sourceConnected)))
	assert.equal(output.diagnostics.uncoveredObligationIds.length, 0)
	const selectorObligations: readonly RoleSpecificIdentityObligation[] = output.roleObligations
	assert.equal(selectorObligations, output.roleObligations)
})

test("complete descriptors jointly cover complementary foreground and accent obligations", () => {
	const fieldFamily = family({ id: "field-family", rgb: [238, 238, 238], lightness: 0.93, observations: [] })
	const typography = typographyFamily("typography-family", [15, 15, 15], 0.1, 1)
	const mark = markFamily()
	const hypothesis = field(fieldFamily)
	const output = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_MODULE.construct({
		evidence: evidence([fieldFamily, typography, mark], [typography.id], [mark.id]),
		fieldHypotheses: [sourceField(hypothesis)],
	})
	const complete = output.logicalDescriptors.find(({ treatment }) =>
		treatment.familyRoles.foreground === typography.id &&
		treatment.familyRoles.accent === mark.id && !treatment.collapse.accent)

	assert.ok(complete)
	const coverage = albumArtworkPaletteV2Phase3RoleDomainV2Coverage(complete.treatment, output.roleObligations)
	assert.equal(coverage.foregroundCoveredCount, 1)
	assert.equal(coverage.accentCoveredCount, 1)
	assert.equal(coverage.coveredCount, 2)
	assert.equal(complete.roleCoverage.coveredCount, 2)
	assert.ok(complete.roleCoverage.entries.every(({ covered }) => covered))
	assert.equal(output.diagnostics.completeRoleDescriptorCount, 1)
	assert.equal(output.diagnostics.collapsedDescriptorCount, 0)
	assert.equal(output.diagnostics.coveredObligationCount, 2)
	assert.equal(output.logicalDescriptors[0].sourceType, "field-proposal-v2")
	assert.equal(output.logicalDescriptors[0].fieldHypothesis, hypothesis)
	const strata = albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(complete, [])
	assert.equal(strata.filter(({ kind }) => kind === "role-specific-obligation-carrier").length, 2)
	const selection = selectAlbumArtworkPaletteV2Phase3SelectorV2({
		evidence: evidence([fieldFamily, typography, mark], [typography.id], [mark.id]),
		identityObligations: [],
		materializedDomain: {
			materialized: output.logicalDescriptors.map(({ treatment }) => ({ key: treatment.id, treatment })),
			diagnostics: {},
		},
		roleSpecificObligations: output.roleObligations,
	})
	assert.equal(selection.explanation.domain.roleSpecificObligationCount, 2)
	assert.equal(selection.evaluations[0].roleIdentity.coveredObligationCount, 2)
})

test("ambiguous families survive construction in both roles with complete complements", () => {
	const fieldFamily = family({ id: "field-family", rgb: [240, 240, 240], lightness: 0.94, observations: [] })
	const typography = typographyFamily("typography-family", [12, 12, 12], 0.08, 1)
	const mark = markFamily()
	const dualObservation = observation({
		foregroundTypography: { geometry: 0.98, fill: 0.98, score: 0.98 },
		signatureAccent: { geometry: 0.98, fill: 0.98, score: 0.98 },
	})
	const dual = family({
		id: "dual-family",
		rgb: [105, 25, 145],
		lightness: 0.42,
		chroma: 0.22,
		observations: [dualObservation, dualObservation, dualObservation],
	})
	const output = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: evidence(
			[fieldFamily, typography, mark, dual],
			[typography.id, dual.id],
			[mark.id, dual.id],
		),
		fieldHypotheses: [sourceField(field(fieldFamily))],
	})
	const dualObligations = output.roleObligations.filter(({ familyId }) => familyId === dual.id)

	assert.deepEqual(dualObligations.map(({ requiredRole }) => requiredRole), ["foreground", "accent"])
	assert.ok(output.logicalDescriptors.some(({ treatment }) =>
		treatment.familyRoles.foreground === dual.id && !treatment.collapse.accent))
	assert.ok(output.logicalDescriptors.some(({ treatment }) =>
		treatment.familyRoles.accent === dual.id && !treatment.collapse.accent))
	assert.equal(output.diagnostics.uncoveredObligationIds.length, 0)
})

test("construction is deterministic under field and family permutation", () => {
	const fieldFamily = family({ id: "field-family", rgb: [235, 235, 235], lightness: 0.92, observations: [] })
	const typography = typographyFamily("typography-family", [18, 18, 18], 0.11, 1)
	const mark = markFamily()
	const hypothesis = field(fieldFamily)
	const first = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: evidence([fieldFamily, typography, mark], [typography.id], [mark.id]),
		fieldHypotheses: [sourceField(hypothesis)],
	})
	const secondEvidence = evidence([mark, typography, fieldFamily], [typography.id], [mark.id])
	const second = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: secondEvidence,
		fieldHypotheses: [sourceField(hypothesis)],
	})

	assert.deepEqual(second.roleObligations, first.roleObligations)
	assert.deepEqual(
		second.logicalDescriptors.map(({ treatment }) => treatment.id),
		first.logicalDescriptors.map(({ treatment }) => treatment.id),
	)
	assert.deepEqual(second.diagnostics, first.diagnostics)
})

test("inference source has no filesystem, historical metadata, named colors, or literal target values", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-role-domain-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:caseId|artworkId\b|sourceId|pathname|feedback|review|comment|colorName|targetColor|priorTreatment)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
})
