import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	fieldDirectionKey,
	generateCompletePaletteTreatments,
	roleDirectionKeys,
} from "../src/album-artwork-palette-v2.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	CompletePaletteTreatment,
	FieldHypothesis,
	NativePaletteEvidence,
	RecallAuditTreatmentLineage,
	RegionObservation,
} from "../src/album-artwork-palette-v2.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor } from
	"../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID,
	constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain,
	extractAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain,
	isAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDescriptor,
} from "../src/album-artwork-palette-v2-phase-3-arm-additive-role-domain.ts"
import type { RGB, RawImage } from "../src/types.ts"

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
			{ name: "field", maximumFamilies: 2, familyIds: [families.find(({ id }) => id === "field-family")!.id] },
			{ name: "signature", maximumFamilies: 4, familyIds: accentIds },
			{ name: "foreground", maximumFamilies: 4, familyIds: foregroundIds },
		],
		laneRetention: [],
		familyBinStep: 0.04,
		familyAnchorRadius: 0.08,
	}
}

function typographyFamily(): ColorFamilyEvidence {
	return family({ id: "typography-family", rgb: [18, 18, 18], lightness: 0.11, polarity: 1 })
}

function markFamily(): ColorFamilyEvidence {
	const mark = observation({
		boundsFraction: 0.003,
		repetition: 0.95,
		foregroundTypography: { geometry: 0.05, fill: 0.1, repetition: 0.95, score: 0.15 },
		signatureAccent: { geometry: 0.98, fill: 0.95, repetition: 0.95, score: 0.98 },
	})
	return family({
		id: "mark-family",
		rgb: [220, 45, 75],
		lightness: 0.62,
		chroma: 0.22,
		polarity: 0,
		polarityConfidence: 0,
		observations: [mark, mark, mark],
	})
}

function lineage(treatment: CompletePaletteTreatment): RecallAuditTreatmentLineage {
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: fieldDirectionKey(treatment),
		roleDirectionKeys: roleDirectionKeys(treatment),
		familyIds: [...new Set(Object.values(treatment.familyRoles)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(),
		representatives: (["background", "surface", "foreground", "accent"] as const).map((role) => ({
			role,
			familyId: treatment.familyRoles[role],
			hex: treatment[role].hex,
			strategy: treatment[role].strategy,
			sourceConnected: true,
		})),
		sourceConnected: true,
	}
}

function baseDescriptor(
	baseEvidence: NativePaletteEvidence,
	hypothesis: FieldHypothesis,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor {
	const treatment = generateCompletePaletteTreatments(baseEvidence, [hypothesis]).completeTreatments
		.find(({ collapse }) => collapse.accent)
	assert.ok(treatment)
	return {
		sourceType: "closed-0.7.4-seed",
		treatment,
		fieldHypothesis: hypothesis,
		lineage: lineage(treatment),
	}
}

function assertLegalAndSourceConnected(treatment: CompletePaletteTreatment): void {
	const roles = ["background", "surface", "foreground", "accent"] as const
	const distinct = new Set(roles.map((role) => treatment[role].hex.toLowerCase())).size
	assert.equal(distinct, treatment.cardinality)
	assert.ok(distinct >= 2 && distinct <= 4)
	assert.equal(treatment.collapse.surface,
		treatment.background.hex.toLowerCase() === treatment.surface.hex.toLowerCase())
	assert.equal(treatment.collapse.accent,
		treatment.foreground.hex.toLowerCase() === treatment.accent.hex.toLowerCase())
	assert.notEqual(treatment.background.hex.toLowerCase(), treatment.foreground.hex.toLowerCase())
	assert.notEqual(treatment.background.hex.toLowerCase(), treatment.accent.hex.toLowerCase())
	if (!treatment.collapse.surface) {
		assert.notEqual(treatment.surface.hex.toLowerCase(), treatment.foreground.hex.toLowerCase())
		assert.notEqual(treatment.surface.hex.toLowerCase(), treatment.accent.hex.toLowerCase())
	}
	if (!treatment.collapse.accent) {
		assert.notEqual(treatment.accent.hex.toLowerCase(), treatment.surface.hex.toLowerCase())
	}
	for (const role of roles) {
		assert.equal(treatment[role].generated, false)
		assert.notEqual(treatment.familyRoles[role], "generated")
		assert.equal("generated" in treatment[role].support, false)
		if (!("generated" in treatment[role].support)) {
			assert.equal(treatment[role].support.anchorFamilyId, treatment.familyRoles[role])
			assert.ok(treatment[role].support.regionIds.length > 0)
		}
	}
}

function complementaryInput() {
	const fieldFamily = family({
		id: "field-family",
		rgb: [238, 238, 238],
		lightness: 0.93,
		observations: [],
	})
	const typography = typographyFamily()
	const mark = markFamily()
	const hypothesis = field(fieldFamily)
	const baseEvidence = evidence([fieldFamily, typography], [typography.id], [])
	return {
		evidence: evidence([fieldFamily, typography, mark], [typography.id], [mark.id]),
		fieldHypotheses: [{ sourceType: "closed-0.7.4-seed" as const, hypothesis }],
		baseLogicalDescriptors: [baseDescriptor(baseEvidence, hypothesis)],
		identityObligations: [],
	}
}

test("role-domain-v2 is additive: complementary foreground/accent construction preserves the complete base", () => {
	const input = complementaryInput()
	const construction = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain(input)
	const baseKey = completeTreatmentKey(input.baseLogicalDescriptors[0].treatment)
	const complementary = construction.additiveLogicalDescriptors.find(({ treatment }) =>
		treatment.familyRoles.foreground === "typography-family" &&
		treatment.familyRoles.accent === "mark-family" && !treatment.collapse.accent)

	assert.ok(complementary)
	assert.equal(construction.roleDomain.roleObligations.length, 2)
	assert.deepEqual(construction.roleDomain.roleObligations.map(({ requiredRole }) => requiredRole),
		["foreground", "accent"])
	assert.equal(construction.logicalDescriptors.length,
		construction.baseLogicalDescriptors.length + construction.additiveLogicalDescriptors.length)
	assert.equal(construction.logicalDescriptors[0], input.baseLogicalDescriptors[0])
	assert.ok(construction.materialization.materialized.some(({ key }) => key === baseKey))
	assert.equal(construction.diagnostics.baseCustody.preservedBeforeMaterialization, true)
	assert.equal(construction.diagnostics.baseCustody.preservedAfterMaterialization, true)
	assert.equal(construction.diagnostics.baseCustody.preservationStatus, "complete")
	assert.ok(construction.diagnostics.domain.canonicalAdditionCount > 0)
	assert.equal(construction.diagnostics.domain.rejectedAdditiveDescriptorCount, 0)
	assert.equal(construction.diagnostics.canonicalAdditionCustody.availableCount,
		construction.diagnostics.domain.canonicalAdditionCount)
	assert.equal(construction.diagnostics.canonicalAdditionCustody.selectedCount,
		construction.diagnostics.canonicalAdditionCustody.additions.filter(({ selected }) => selected).length)
	assert.equal(completeTreatmentKey(construction.custody.winner),
		completeTreatmentKey(construction.recoveryV2.winner))
	assert.equal(completeTreatmentKey(construction.custody.slate[0]),
		completeTreatmentKey(construction.recoveryV2.winner))
	for (const descriptor of construction.additiveLogicalDescriptors) {
		assert.equal(isAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDescriptor(descriptor), true)
		assert.equal(descriptor.lineage.sourceConnected, true)
		assert.ok(descriptor.lineage.representatives.every(({ sourceConnected }) => sourceConnected))
		assertLegalAndSourceConnected(descriptor.treatment)
	}
})

test("foreground-only additive construction retains an honest legal accent collapse", () => {
	const input = complementaryInput()
	const foregroundOnlyEvidence = evidence(
		input.evidence.families.filter(({ id }) => id !== "mark-family"),
		["typography-family"],
		[],
	)
	const construction = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		...input,
		evidence: foregroundOnlyEvidence,
	})

	assert.ok(construction.additiveLogicalDescriptors.length > 0)
	assert.ok(construction.additiveLogicalDescriptors.every(({ treatment }) =>
		treatment.collapse.accent &&
		treatment.familyRoles.foreground === "typography-family" &&
		treatment.familyRoles.accent === "typography-family"))
	assert.ok(construction.additiveLogicalDescriptors.every((descriptor) =>
		isAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDescriptor(descriptor)))
	assert.equal(construction.diagnostics.domain.rejectedAdditiveDescriptorCount, 0)
	assert.equal(construction.diagnostics.obligationCustody.foregroundCount, 1)
	assert.equal(construction.diagnostics.obligationCustody.accentCount, 0)
})

test("ambiguous source evidence keeps both role directions as additive obligations", () => {
	const input = complementaryInput()
	const dualObservation = observation({
		repetition: 0.98,
		foregroundTypography: { geometry: 0.98, fill: 0.98, repetition: 0.98, score: 0.98 },
		signatureAccent: { geometry: 0.98, fill: 0.98, repetition: 0.98, score: 0.98 },
	})
	const dual = family({
		id: "dual-family",
		rgb: [105, 25, 145],
		lightness: 0.42,
		chroma: 0.22,
		observations: [dualObservation, dualObservation, dualObservation],
	})
	const augmentedEvidence = evidence(
		[...input.evidence.families, dual],
		["typography-family", dual.id],
		["mark-family", dual.id],
	)
	const construction = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		...input,
		evidence: augmentedEvidence,
	})
	const obligations = construction.roleDomain.roleObligations.filter(({ familyId }) =>
		familyId === dual.id)

	assert.deepEqual(obligations.map(({ requiredRole }) => requiredRole), ["foreground", "accent"])
	assert.ok(obligations.every(({ ambiguousDirection }) => ambiguousDirection))
	assert.ok(construction.additiveLogicalDescriptors.some(({ treatment }) =>
		treatment.familyRoles.foreground === dual.id && !treatment.collapse.accent))
	assert.ok(construction.additiveLogicalDescriptors.some(({ treatment }) =>
		treatment.familyRoles.accent === dual.id && !treatment.collapse.accent))
	assert.equal(construction.diagnostics.obligationCustody.ambiguousDirectionCount, 2)
	assert.equal(construction.diagnostics.obligationCustody.coveredByAdditiveDescriptorsCount,
		construction.diagnostics.obligationCustody.feasibleCount)
})

test("the additive union and custody are deterministic under base, field, and family permutation", () => {
	const input = complementaryInput()
	const firstHypothesis = input.fieldHypotheses[0].hypothesis
	const secondHypothesis = field(input.evidence.families.find(({ id }) => id === "field-family")!,
		"second-field-hypothesis")
	const baseEvidence = evidence(
		input.evidence.families.filter(({ id }) => id !== "mark-family"),
		["typography-family"],
		[],
	)
	const fields = [
		...input.fieldHypotheses,
		{ sourceType: "native-field-transition" as const, hypothesis: secondHypothesis },
	]
	const bases = [
		input.baseLogicalDescriptors[0],
		{ ...baseDescriptor(baseEvidence, secondHypothesis), sourceType: "native-field-transition" as const },
	]
	const first = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		...input,
		fieldHypotheses: fields,
		baseLogicalDescriptors: bases,
	})
	const reversedEvidence = {
		...input.evidence,
		families: [...input.evidence.families].reverse(),
		retainedFamilyIds: [...input.evidence.retainedFamilyIds].reverse(),
		lanes: [...input.evidence.lanes].reverse().map((lane) => ({
			...lane,
			familyIds: [...lane.familyIds].reverse(),
		})),
	}
	const second = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		...input,
		evidence: reversedEvidence,
		fieldHypotheses: [...fields].reverse(),
		baseLogicalDescriptors: [...bases].reverse(),
	})

	assert.deepEqual(second.logicalDescriptors.map(({ treatment }) => treatment.id),
		first.logicalDescriptors.map(({ treatment }) => treatment.id))
	assert.deepEqual(second.roleDomain.roleObligations, first.roleDomain.roleObligations)
	assert.deepEqual(second.materialization.materialized.map(({ key }) => key),
		first.materialization.materialized.map(({ key }) => key))
	assert.deepEqual(second.custody.slate.map(completeTreatmentKey), first.custody.slate.map(completeTreatmentKey))
	assert.deepEqual(second.diagnostics, first.diagnostics)
	assert.equal(firstHypothesis.id, "field-hypothesis")
})

test("capacity tradeoffs partition truncation and never claim materialized base preservation", () => {
	const input = complementaryInput()
	const construction = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		...input,
		materializationCapacity: 1,
	})
	const diagnostics = construction.diagnostics

	assert.ok(diagnostics.domain.canonicalTreatmentCount > 1)
	assert.equal(diagnostics.truncation.capacity, 1)
	assert.equal(diagnostics.truncation.capacityTradeoff, true)
	assert.ok(diagnostics.truncation.truncatedCanonicalTreatmentCount > 0)
	assert.equal(diagnostics.truncation.truncatedCanonicalTreatmentCount,
		diagnostics.truncation.truncatedBaseCanonicalTreatmentCount +
		diagnostics.truncation.truncatedCanonicalAdditionCount)
	assert.equal(diagnostics.baseCustody.preservedAfterMaterialization,
		diagnostics.baseCustody.truncatedCanonicalTreatmentCount === 0)
	assert.equal(diagnostics.baseCustody.preservationStatus,
		diagnostics.baseCustody.preservedAfterMaterialization ? "complete" : "capacity-tradeoff")
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

test("the standalone adapter builds the current common base and reports additive custody", () => {
	const result = extractAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain(transitionField())
	const diagnostics = result.diagnostics.phase3ArmAdditiveRoleDomain

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT.identity.attemptId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(result.alternatives[0]))
	assert.equal(diagnostics.construction.domain.baseDescriptorCount,
		diagnostics.commonBase.logicalDescriptorCount)
	assert.equal(diagnostics.construction.domain.logicalDescriptorCount,
		diagnostics.construction.domain.baseDescriptorCount +
		diagnostics.construction.domain.additiveDescriptorCount)
	assert.equal(diagnostics.materialization.materializedTreatmentCount,
		diagnostics.selector.domain.materializedTreatmentCount)
	assert.equal(diagnostics.materialization.materializedTreatmentCount,
		diagnostics.custody.domain.materializedTreatmentCount)
	assert.equal(diagnostics.construction.baseCustody.preservedBeforeMaterialization, true)
	if (!diagnostics.construction.baseCustody.preservedAfterMaterialization) {
		assert.equal(diagnostics.construction.baseCustody.preservationStatus, "capacity-tradeoff")
		assert.ok(diagnostics.construction.truncation.truncatedBaseCanonicalTreatmentCount > 0)
	}
})

test("experiment inference has no external metadata or outcome dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-arm-additive-role-domain.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical)/iu)
	assert.doesNotMatch(source,
		/(?:closedDetails\.result\.(?:winner|alternatives)|audit\.candidate\.(?:completeTreatmentKeys|result)|forcedReservation)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
})
