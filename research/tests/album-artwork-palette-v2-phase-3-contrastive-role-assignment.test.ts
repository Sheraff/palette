import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM_ID,
	identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns,
	runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm,
} from "../src/album-artwork-palette-v2-phase-3-arm-contrastive-role-assignment.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	CompletePaletteScores,
	CompletePaletteTreatment,
	ComponentEvidence,
	NativePaletteEvidence,
	RegionObservation,
	RegionRoleFactors,
} from "../src/album-artwork-palette-v2.ts"
import type { RGB } from "../src/types.ts"

type ComponentOptions = Readonly<{
	fill?: number
	polarity?: number
	contrast?: number
	support?: number
	repetition?: number
	typographyGeometry?: number
	signatureScore?: number
	borderContact?: number
}>

type FixtureCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	lineage: Readonly<{ token: string }>
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function factors(values: Partial<RegionRoleFactors> = {}): RegionRoleFactors {
	return {
		geometry: 0.82,
		fill: 0.8,
		repetition: 0.92,
		localContrast: 0.75,
		borderInterior: 0.9,
		sourceSupport: 0.82,
		score: 0.78,
		...values,
	}
}

function component(
	id: string,
	centerX: number,
	centerY: number,
	width: number,
	height: number,
	options: ComponentOptions = {},
): ComponentEvidence {
	const fill = options.fill ?? 0.38
	const polarity = options.polarity ?? 1
	const contrast = options.contrast ?? 0.09
	const support = options.support ?? 0.82
	const repetition = options.repetition ?? 0.94
	const minX = Math.round(centerX - (width - 1) / 2)
	const minY = Math.round(centerY - (height - 1) / 2)
	const maxX = minX + width - 1
	const maxY = minY + height - 1
	const population = Math.max(4, Math.round(width * height * fill))
	const foregroundTypography = factors({
		geometry: options.typographyGeometry ?? 0.88,
		fill: clamp(fill / 0.5),
		repetition,
		localContrast: clamp(contrast / 0.12),
		sourceSupport: support,
		score: clamp(support * 0.9),
	})
	const signatureAccent = factors({
		geometry: 0.78,
		fill: clamp(fill / 0.5),
		repetition,
		localContrast: clamp(contrast / 0.12),
		sourceSupport: support,
		score: options.signatureScore ?? clamp(support * 0.86),
	})
	const observation: RegionObservation = {
		widthFraction: width / 200,
		heightFraction: height / 200,
		boundsFraction: width * height / 40_000,
		elongation: Math.max(width, height) / Math.min(width, height),
		fill,
		repetition,
		localContrast: contrast,
		boundaryLightnessContrast: contrast,
		boundaryLightnessPolarity: polarity,
		borderContact: options.borderContact ?? 0,
		interiorMargin: 0.12,
		componentFamilyFraction: 0.15,
		foregroundTypography,
		signatureAccent,
	}
	return {
		id,
		startPixelIndex: Math.max(0, minY * 200 + minX),
		population,
		populationFraction: population / 40_000,
		minX,
		minY,
		maxX,
		maxY,
		borderPixels: 0,
		retainedFor: ["connected-support", "role-observation"],
		observation,
	}
}

function glyphComponents(
	prefix: string,
	options: Readonly<{
		angleDegrees?: number
		origin?: readonly [number, number]
		spacing?: number
		polarity?: number
		contrast?: number
		support?: number
	}> = {},
): ComponentEvidence[] {
	const angle = (options.angleDegrees ?? 0) * Math.PI / 180
	const [originX, originY] = options.origin ?? [45, 70]
	const spacing = options.spacing ?? 18
	const vertical = Math.abs(Math.cos(angle)) < 0.2
	const widths = vertical ? [12, 13, 11, 12] : [4, 9, 5, 7]
	const heights = vertical ? [4, 9, 5, 7] : [12, 13, 11, 12]
	const fills = [0.31, 0.46, 0.28, 0.41]
	return widths.map((width, index) => component(
		`${prefix}-${index}`,
		originX + Math.cos(angle) * spacing * index,
		originY + Math.sin(angle) * spacing * index,
		width,
		heights[index],
		{
			fill: fills[index],
			polarity: options.polarity,
			contrast: options.contrast,
			support: options.support,
		},
	))
}

function dotComponents(
	prefix: string,
	options: Readonly<{
		origin?: readonly [number, number]
		polarity?: number
		signatureScore?: number
	}> = {},
): ComponentEvidence[] {
	const [originX, originY] = options.origin ?? [50, 120]
	return [0, 1, 2, 3].map((index) => component(
		`${prefix}-${index}`,
		originX + 15 * index,
		originY,
		7,
		7,
		{
			fill: 0.55,
			polarity: options.polarity,
			contrast: 0.085,
			support: 0.84,
			repetition: 0.98,
			typographyGeometry: 0.55,
			signatureScore: options.signatureScore ?? 0.86,
		},
	))
}

function tone(channel: number): RGB {
	const value = Math.max(0, Math.min(255, Math.round(channel)))
	return [value, value, value]
}

function hex(rgb: RGB): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function representative(id: string, channel: number, lightness: number): ColorRepresentative {
	const rgb = tone(channel)
	return {
		strategy: "dense-exact",
		rgb,
		oklab: [lightness, 0, 0],
		hex: hex(rgb),
		support: {
			exactSource: true,
			exemplar: { x: 1, y: 1 },
			anchorFamilyId: id,
			regionIds: [`${id}-source`],
			perceptualDensity: 0.9,
			totalSupport: 0.8,
			connectedSupport: 0.7,
			spatialCoverage: 0.5,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function family(values: Readonly<{
	id: string
	channel: number
	lightness: number
	components?: readonly ComponentEvidence[]
	chroma?: number
	signatureObservation?: number
	signatureScore?: number
}>): ColorFamilyEvidence {
	const components = values.components ?? []
	const population = Math.max(20, components.reduce((sum, item) => sum + item.population, 0))
	return {
		id: values.id,
		prototype: [values.lightness, values.chroma ?? 0.005, 0],
		population,
		populationFraction: population / 40_000,
		perceptualBinCount: 1,
		borderCoverage: 0,
		centerCoverage: 0.1,
		quadrantCoverage: 0.5,
		cornerCoverage: 0,
		centroid: [0.5, 0.5],
		spatialSpread: 0.3,
		largestComponentFraction: Math.max(0, ...components.map((item) => item.populationFraction)),
		familyConcentration: 0.7,
		componentCount: components.length,
		repeatedComponentCount: components.length,
		edgeDensity: 0.5,
		localContrast: 0.09,
		chroma: values.chroma ?? 0.005,
		fieldScore: components.length === 0 ? 0.8 : 0.1,
		signatureScore: values.signatureScore ?? 0.72,
		foregroundScore: 0.7,
		foregroundTypographyObservation: 0.8,
		foregroundPolarityObservation: {
			polarity: components[0]?.observation.boundaryLightnessPolarity ?? 0,
			confidence: components.length > 0 ? 0.9 : 0,
			componentIds: components.map(({ id }) => id),
		},
		signatureAccentObservation: values.signatureObservation ?? 0.76,
		observedComponentCount: components.length,
		components,
		representatives: [representative(values.id, values.channel, values.lightness)],
	}
}

function evidence(families: readonly ColorFamilyEvidence[]): NativePaletteEvidence {
	return {
		width: 200,
		height: 200,
		pixelCount: 40_000,
		rgbData: new Uint8Array(40_000 * 3),
		labs: new Float32Array(40_000 * 3),
		familyAt: new Uint16Array(40_000),
		families,
		adjacencies: [],
		retainedFamilyIds: families.map(({ id }) => id),
		lanes: [
			{ name: "field", maximumFamilies: 2, familyIds: families.slice(0, 1).map(({ id }) => id) },
			{ name: "signature", maximumFamilies: 8, familyIds: families.map(({ id }) => id) },
			{ name: "foreground", maximumFamilies: 8, familyIds: families.map(({ id }) => id) },
		],
		laneRetention: [],
		familyBinStep: 0.04,
		familyAnchorRadius: 0.08,
	}
}

const SCORES: CompletePaletteScores = Object.freeze({
	fieldFidelity: 0.7,
	surfaceFidelity: 1,
	fieldStructure: 0.7,
	fieldIdentity: 0.7,
	treatmentFoundation: 0.7,
	activeRolePathObservability: 1,
	artworkIdentity: 0.7,
	representativeness: 0.7,
	uiUtility: 0.7,
	foregroundUtility: 0.7,
	foregroundPolarityAgreement: 1,
	accentFidelity: 0.7,
	accentUtility: 0.7,
	coherence: 0.7,
	economy: 0.7,
	generatorConfidence: 0.7,
	foundation: 0.7,
	balance: 0.7,
	generatedPenalty: 0,
	rankingScore: 0.7,
})

function roleColor(familyEvidence: ColorFamilyEvidence) {
	const representative = familyEvidence.representatives[0]
	return {
		rgb: representative.rgb,
		oklab: representative.oklab,
		hex: representative.hex,
		generated: false,
		strategy: representative.strategy,
		support: representative.support,
	} as const
}

function treatment(
	id: string,
	fieldFamily: ColorFamilyEvidence,
	foregroundFamily: ColorFamilyEvidence,
	accentFamily: ColorFamilyEvidence,
): CompletePaletteTreatment {
	const background = roleColor(fieldFamily)
	const foreground = roleColor(foregroundFamily)
	const accent = roleColor(accentFamily)
	const cardinality = new Set([background.hex, foreground.hex, accent.hex]).size as 2 | 3 | 4
	return {
		id,
		background,
		surface: background,
		foreground,
		accent,
		gradient: false,
		fieldTreatment: "one-field",
		sourceFieldHypothesisId: "fixture-field",
		familyRoles: {
			background: fieldFamily.id,
			surface: fieldFamily.id,
			foreground: foregroundFamily.id,
			accent: accentFamily.id,
		},
		cardinality,
		collapse: { surface: true, accent: foreground.hex === accent.hex },
		contrast: { pairs: [], minimumAbsoluteLc: 40, meanAbsoluteLc: 50 },
		scores: SCORES,
		gradientEvidence: null,
	}
}

function candidate(
	key: string,
	fieldFamily: ColorFamilyEvidence,
	foregroundFamily: ColorFamilyEvidence,
	accentFamily: ColorFamilyEvidence,
): FixtureCandidate {
	return {
		key,
		treatment: treatment(key, fieldFamily, foregroundFamily, accentFamily),
		lineage: { token: `${key}-lineage` },
	}
}

test("mirrored dark-on-light and light-on-dark glyph runs earn symmetric foreground evidence", () => {
	const lightField = family({ id: "light-field", channel: 225, lightness: 0.9 })
	const darkField = family({ id: "dark-field", channel: 35, lightness: 0.16 })
	const darkType = family({
		id: "dark-type",
		channel: 20,
		lightness: 0.08,
		components: glyphComponents("dark-glyph", { polarity: 1 }),
	})
	const lightType = family({
		id: "light-type",
		channel: 240,
		lightness: 0.95,
		components: glyphComponents("light-glyph", { polarity: -1 }),
	})
	const darkRuns = identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(darkType, {
		width: 200,
		height: 200,
		fieldLightnesses: [lightField.prototype[0]],
	})
	const lightRuns = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM
		.identifyGlyphRuns(lightType, {
			width: 200,
			height: 200,
			fieldLightnesses: [darkField.prototype[0]],
		})

	assert.equal(darkRuns[0]?.orientation, "horizontal")
	assert.equal(lightRuns[0]?.orientation, "horizontal")
	assert.deepEqual(darkRuns[0]?.authority, lightRuns[0]?.authority)
	assert.equal(darkRuns[0]?.fieldPolarityAgrees, true)
	assert.equal(lightRuns[0]?.fieldPolarityAgrees, true)
})

test("polarity reversal makes otherwise coherent type abstain", () => {
	const reversed = family({
		id: "reversed-type",
		channel: 25,
		lightness: 0.1,
		components: glyphComponents("reversed-glyph", { polarity: -1 }),
	})
	const runs = identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(reversed, {
		width: 200,
		height: 200,
		fieldLightnesses: [0.9],
	})

	assert.deepEqual(runs, [])
})

test("aligned varied glyphs are foreground evidence while equal-population dots remain accent evidence", () => {
	const fieldFamily = family({ id: "field", channel: 220, lightness: 0.88 })
	const typeFamily = family({
		id: "aligned-type",
		channel: 25,
		lightness: 0.1,
		components: glyphComponents("varied-glyph", { polarity: 1 }),
	})
	const dots = family({
		id: "equal-dots",
		channel: 90,
		lightness: 0.35,
		components: dotComponents("dot", { polarity: 1 }),
		signatureObservation: 0.88,
		signatureScore: 0.76,
	})
	const incumbent = candidate("incumbent", fieldFamily, dots, typeFamily)
	const alternate = candidate("alternate", fieldFamily, typeFamily, dots)
	const result = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, typeFamily, dots]),
		incumbent,
		materialized: [incumbent, alternate],
	})
	const typeEvidence = result.roleEvidence.find(({ familyId }) => familyId === typeFamily.id)
	const dotEvidence = result.roleEvidence.find(({ familyId }) => familyId === dots.id)

	assert.ok(typeEvidence?.foreground)
	assert.equal(dotEvidence?.foreground, null)
	assert.equal(dotEvidence?.accent?.kind, "decorative-marks")
	assert.equal(dotEvidence?.accent?.achromatic, true)
	assert.equal(result.decision.status, "authoritative")
	assert.equal(result.decision.foregroundFamilyId, typeFamily.id)
	assert.equal(result.decision.accentFamilyId, dots.id)
	assert.deepEqual(result.authoritativeCandidates, [alternate])
})

test("non-text objects and noisy photographic components do not create foreground authority", () => {
	const fieldFamily = family({ id: "field", channel: 225, lightness: 0.9 })
	const objectFamily = family({
		id: "dark-object",
		channel: 20,
		lightness: 0.08,
		components: [component("object", 90, 90, 46, 41, {
			fill: 0.72,
			polarity: 1,
			contrast: 0.1,
			typographyGeometry: 0.2,
		})],
	})
	const noisePositions = [
		[16, 24, 8, 13], [82, 19, 15, 6], [135, 42, 6, 17], [42, 88, 11, 8],
		[110, 103, 17, 9], [175, 71, 7, 12], [68, 155, 14, 7], [151, 167, 9, 15],
	] as const
	const noisyFamily = family({
		id: "photo-noise",
		channel: 55,
		lightness: 0.2,
		components: noisePositions.map(([x, y, width, height], index) => component(
			`noise-${index}`,
			x,
			y,
			width,
			height,
			{ polarity: index % 2 === 0 ? 1 : -1, contrast: 0.05, support: 0.55 },
		)),
	})

	for (const item of [objectFamily, noisyFamily]) {
		assert.deepEqual(identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(item, {
			width: 200,
			height: 200,
			fieldLightnesses: [fieldFamily.prototype[0]],
		}), [])
	}
})

test("a connected wordmark is supported without admitting a solid elongated object", () => {
	const wordmark = family({
		id: "connected-wordmark",
		channel: 25,
		lightness: 0.1,
		components: [component("joined-letterforms", 95, 80, 64, 14, {
			fill: 0.34,
			polarity: 1,
			contrast: 0.09,
			support: 0.86,
			typographyGeometry: 0.9,
		})],
	})
	const bar = family({
		id: "solid-bar",
		channel: 30,
		lightness: 0.12,
		components: [component("bar", 95, 110, 64, 14, {
			fill: 0.94,
			polarity: 1,
			contrast: 0.09,
			support: 0.86,
			typographyGeometry: 0.9,
		})],
	})
	const context = { width: 200, height: 200, fieldLightnesses: [0.9] }

	assert.equal(identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(wordmark, context)[0]?.kind,
		"connected-wordmark")
	assert.deepEqual(identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(bar, context), [])
})

test("vertical and rotated glyph runs retain their inferred orientation", () => {
	const vertical = family({
		id: "vertical-type",
		channel: 20,
		lightness: 0.08,
		components: glyphComponents("vertical-glyph", { angleDegrees: 90, polarity: 1 }),
	})
	const rotated = family({
		id: "rotated-type",
		channel: 24,
		lightness: 0.09,
		components: glyphComponents("rotated-glyph", { angleDegrees: 34, polarity: 1 }),
	})
	const context = { width: 200, height: 200, fieldLightnesses: [0.9] }

	assert.equal(identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(vertical, context)[0]?.orientation,
		"vertical")
	assert.equal(identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(rotated, context)[0]?.orientation,
		"rotated")
})

test("secondary typography remains eligible as accent in a joint assignment", () => {
	const fieldFamily = family({ id: "field", channel: 225, lightness: 0.9 })
	const primaryType = family({
		id: "primary-type",
		channel: 25,
		lightness: 0.09,
		components: glyphComponents("primary", { polarity: 1, contrast: 0.1, support: 0.88 }),
		signatureObservation: 0.68,
	})
	const secondaryType = family({
		id: "secondary-type",
		channel: 80,
		lightness: 0.3,
		components: glyphComponents("secondary", {
			origin: [50, 125],
			polarity: 1,
			contrast: 0.06,
			support: 0.66,
		}),
		signatureObservation: 0.88,
		signatureScore: 0.76,
	})
	const incumbent = candidate("secondary-first", fieldFamily, secondaryType, primaryType)
	const alternate = candidate("primary-first", fieldFamily, primaryType, secondaryType)
	const result = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, primaryType, secondaryType]),
		incumbent,
		materialized: [incumbent, alternate],
	})
	const secondary = result.roleEvidence.find(({ familyId }) => familyId === secondaryType.id)

	assert.ok(secondary?.foreground)
	assert.ok(secondary?.accent)
	assert.equal(result.decision.status, "authoritative")
	assert.equal(result.decision.foregroundFamilyId, primaryType.id)
	assert.equal(result.decision.accentFamilyId, secondaryType.id)
})

test("tied evidence abstains and ASCII order is diagnostic only", () => {
	const fieldFamily = family({ id: "field", channel: 225, lightness: 0.9 })
	const firstType = family({
		id: "type-a",
		channel: 20,
		lightness: 0.08,
		components: glyphComponents("type-a", { polarity: 1 }),
	})
	const secondType = family({
		id: "type-b",
		channel: 35,
		lightness: 0.12,
		components: glyphComponents("type-b", { origin: [45, 100], polarity: 1 }),
	})
	const marks = family({
		id: "marks",
		channel: 100,
		lightness: 0.4,
		components: dotComponents("marks", { polarity: 1 }),
		signatureObservation: 0.88,
		signatureScore: 0.76,
	})
	const first = candidate("candidate-a", fieldFamily, firstType, marks)
	const second = candidate("candidate-b", fieldFamily, secondType, marks)
	const result = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, firstType, secondType, marks]),
		incumbent: first,
		materialized: [first, second],
	})

	assert.equal(result.decision.status, "abstained")
	assert.equal(result.decision.reason, "tied-joint-assignment-authority")
	assert.equal(result.assignments[0].foregroundFamilyId, firstType.id)
})

test("the arm is deterministic under evidence and candidate permutation", () => {
	const fieldFamily = family({ id: "field", channel: 40, lightness: 0.18 })
	const typeFamily = family({
		id: "light-type",
		channel: 235,
		lightness: 0.94,
		components: glyphComponents("glyph", { polarity: -1 }),
	})
	const objectFamily = family({
		id: "object",
		channel: 105,
		lightness: 0.45,
		components: [component("object", 100, 100, 42, 38, {
			fill: 0.75,
			polarity: -1,
			typographyGeometry: 0.2,
		})],
	})
	const marks = family({
		id: "dark-marks",
		channel: 10,
		lightness: 0.04,
		components: dotComponents("mark", { polarity: 1 }),
		signatureObservation: 0.9,
		signatureScore: 0.77,
	})
	const incumbent = candidate("incumbent", fieldFamily, objectFamily, marks)
	const alternate = candidate("alternate", fieldFamily, typeFamily, marks)
	const first = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, typeFamily, objectFamily, marks]),
		incumbent,
		materialized: [incumbent, alternate],
	})
	const second = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([marks, objectFamily, typeFamily, fieldFamily]),
		incumbent,
		materialized: [alternate, incumbent],
	})

	assert.deepEqual(second.roleEvidence, first.roleEvidence)
	assert.deepEqual(second.assignments.map(({ key, treatmentKeys }) => ({ key, treatmentKeys })),
		first.assignments.map(({ key, treatmentKeys }) => ({ key, treatmentKeys })))
	assert.deepEqual(second.decision, first.decision)
	assert.equal(first.decision.status, "authoritative")
})

test("the bounded arm preserves materialized candidates, field form, collapse, and lineage by reference", () => {
	const fieldFamily = family({ id: "field", channel: 225, lightness: 0.9 })
	const typeFamily = family({
		id: "type",
		channel: 20,
		lightness: 0.08,
		components: glyphComponents("glyph", { polarity: 1 }),
	})
	const accents = [0, 1, 2, 3].map((index) => family({
		id: `marks-${index}`,
		channel: 70 + index * 25,
		lightness: 0.25 + index * 0.1,
		components: dotComponents(`marks-${index}`, { polarity: 1 }),
		signatureObservation: 0.86 - index * 0.08,
		signatureScore: 0.75 - index * 0.04,
	}))
	const materialized = accents.map((accent, index) =>
		candidate(`candidate-${index}`, fieldFamily, typeFamily, accent))
	const excludedGradientChange: FixtureCandidate = {
		key: "changed-gradient",
		treatment: { ...materialized[0].treatment, id: "changed-gradient", gradient: true },
		lineage: { token: "changed-gradient-lineage" },
	}
	const domain = [...materialized, excludedGradientChange]
	const snapshots = domain.map(({ treatment: item }) => ({
		fieldTreatment: item.fieldTreatment,
		gradient: item.gradient,
		collapse: item.collapse,
		fieldHypothesisId: item.sourceFieldHypothesisId,
	}))
	const result = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, typeFamily, ...accents]),
		incumbent: materialized[0],
		materialized: domain,
		maximumJointAssignments: 2,
	})

	assert.equal(result.materialized, domain)
	assert.equal(result.incumbent, materialized[0])
	assert.equal(result.assignments.length, 2)
	assert.equal(result.diagnostics.domain.inputMaterializedCandidateCount, domain.length)
	assert.equal(result.diagnostics.domain.candidateCountChanged, false)
	assert.equal(result.diagnostics.domain.materializedArrayPreserved, true)
	assert.equal(result.contrastiveCandidates.includes(excludedGradientChange), false)
	assert.deepEqual(domain.map(({ treatment: item }) => ({
		fieldTreatment: item.fieldTreatment,
		gradient: item.gradient,
		collapse: item.collapse,
		fieldHypothesisId: item.sourceFieldHypothesisId,
	})), snapshots)
	for (const item of domain) {
		assert.equal(result.materialized.find(({ key }) => key === item.key)?.lineage, item.lineage)
	}
	assert.equal(result.diagnostics.version,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM_ID)
})

test("weak evidence abstains without manufacturing a role assignment", () => {
	const fieldFamily = family({ id: "field", channel: 225, lightness: 0.9 })
	const weakFamily = family({
		id: "weak-detail",
		channel: 40,
		lightness: 0.15,
		components: glyphComponents("weak", { polarity: 1, contrast: 0.015, support: 0.25 }),
	})
	const marks = family({
		id: "marks",
		channel: 100,
		lightness: 0.4,
		components: dotComponents("marks", { polarity: 1 }),
		signatureObservation: 0.88,
		signatureScore: 0.76,
	})
	const incumbent = candidate("incumbent", fieldFamily, weakFamily, marks)
	const result = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: evidence([fieldFamily, weakFamily, marks]),
		incumbent,
		materialized: [incumbent],
	})

	assert.equal(result.decision.status, "abstained")
	assert.equal(result.decision.reason, "weak-foreground-evidence")
	assert.deepEqual(result.authoritativeCandidates, [])
})

test("inference is isolated from case metadata, target colors, filesystem access, and weighted bonuses", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-arm-contrastive-role-assignment.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	assert.doesNotMatch(source, /(?:weighted.?bonus|weighted.?authority|bonus.?score)/iu)
})
