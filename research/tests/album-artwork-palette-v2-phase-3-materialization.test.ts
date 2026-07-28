import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	fieldDirectionKey,
	roleDirectionKeys,
} from "../src/album-artwork-palette-v2.ts"
import type {
	ColorRepresentative,
	CompletePaletteScores,
	CompletePaletteTreatment,
	FieldHypothesis,
	FieldTreatmentKind,
	IdentityObligation,
	PaletteRoleColor,
	RecallAuditTreatmentLineage,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
	albumArtworkPaletteV2Phase3DescriptorsFromClosed074,
	attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails,
	buildAlbumArtworkPaletteV2Phase3Slate,
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "../src/album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "../src/album-artwork-palette-v2-phase-3-materialization.ts"
import { extractAlbumArtworkPaletteV2074Details } from "../src/album-artwork-palette-v2.ts"
import type { RGB, RawImage } from "../src/types.ts"

const BASE_SCORES: CompletePaletteScores = {
	fieldFidelity: 0.6,
	surfaceFidelity: 0.6,
	fieldStructure: 0.6,
	fieldIdentity: 0.6,
	treatmentFoundation: 0.6,
	activeRolePathObservability: 0.6,
	artworkIdentity: 0.6,
	representativeness: 0.6,
	uiUtility: 0.6,
	foregroundUtility: 0.6,
	foregroundPolarityAgreement: 0.6,
	accentFidelity: 0.6,
	accentUtility: 0.6,
	coherence: 0.6,
	economy: 0.6,
	generatorConfidence: 0.6,
	foundation: 0.6,
	balance: 0.6,
	generatedPenalty: 0,
	rankingScore: 0.6,
}

function hex(value: number): string {
	return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`
}

function rgb(value: number): RGB {
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function representative(value: number, familyId: string): ColorRepresentative {
	return {
		strategy: "dense-exact",
		rgb: rgb(value),
		oklab: [0.5, 0, 0],
		hex: hex(value),
		support: {
			exactSource: true,
			exemplar: { x: 0, y: 0 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: 1,
			totalSupport: 1,
			connectedSupport: 1,
			spatialCoverage: 1,
			concentration: 1,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	}
}

function role(value: number, familyId: string): PaletteRoleColor {
	const source = representative(value, familyId)
	return { ...source, generated: false }
}

function hypothesis(id: string, kind: FieldTreatmentKind, backgroundFamilyId: string, surfaceFamilyId: string | null): FieldHypothesis {
	const background = representative(0x101010, backgroundFamilyId)
	const surface = representative(0x303030, surfaceFamilyId ?? backgroundFamilyId)
	return {
		id,
		kind,
		backgroundFamilyId,
		surfaceFamilyId,
		backgroundRepresentatives: [background],
		surfaceRepresentatives: [surfaceFamilyId === null ? background : surface],
		fieldFidelity: 0.7,
		surfaceContribution: surfaceFamilyId === null ? 0 : 0.7,
		spatialRelation: null,
		roleAssignment: null,
		gradientEvidence: null,
		pruningNotes: [],
	}
}

type TreatmentOptions = Readonly<{
	id: string
	quality?: number
	fieldHypothesis: FieldHypothesis
	background: number
	surface: number
	foreground: number
	accent: number
	backgroundFamily?: string
	surfaceFamily?: string
	foregroundFamily?: string
	accentFamily?: string
	gradient?: boolean
}>

function treatment(options: TreatmentOptions): CompletePaletteTreatment {
	const backgroundFamily = options.backgroundFamily ?? options.fieldHypothesis.backgroundFamilyId
	const surfaceFamily = options.surfaceFamily ?? options.fieldHypothesis.surfaceFamilyId ?? backgroundFamily
	const foregroundFamily = options.foregroundFamily ?? "foreground"
	const accentFamily = options.accentFamily ?? foregroundFamily
	const surfaceCollapsed = options.background === options.surface
	const accentCollapsed = options.foreground === options.accent
	const quality = options.quality ?? 0.6
	return {
		id: options.id,
		background: role(options.background, backgroundFamily),
		surface: role(options.surface, surfaceFamily),
		foreground: role(options.foreground, foregroundFamily),
		accent: role(options.accent, accentFamily),
		gradient: options.gradient ?? false,
		fieldTreatment: surfaceCollapsed
			? "one-field"
			: options.gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: options.fieldHypothesis.id,
		familyRoles: {
			background: backgroundFamily,
			surface: surfaceCollapsed ? backgroundFamily : surfaceFamily,
			foreground: foregroundFamily,
			accent: accentCollapsed ? foregroundFamily : accentFamily,
		},
		cardinality: new Set([
			hex(options.background),
			hex(options.surface),
			hex(options.foreground),
			hex(options.accent),
		]).size as 2 | 3 | 4,
		collapse: { surface: surfaceCollapsed, accent: accentCollapsed },
		contrast: {
			pairs: [{ role: "foreground", fieldRole: "background", position: 0, signedLc: 60, absoluteLc: 60 }],
			minimumAbsoluteLc: 60,
			meanAbsoluteLc: 60,
		},
		scores: Object.fromEntries(Object.keys(BASE_SCORES).map((key) => [
			key,
			key === "generatedPenalty" ? 0 : quality,
		])) as unknown as CompletePaletteScores,
		gradientEvidence: null,
	}
}

function lineage(value: CompletePaletteTreatment): RecallAuditTreatmentLineage {
	return {
		fieldHypothesisId: value.sourceFieldHypothesisId,
		fieldDirectionKey: fieldDirectionKey(value),
		roleDirectionKeys: roleDirectionKeys(value),
		familyIds: [...new Set(Object.values(value.familyRoles))],
		representatives: (["background", "surface", "foreground", "accent"] as const).map((roleName) => ({
			role: roleName,
			familyId: value.familyRoles[roleName],
			hex: value[roleName].hex,
			strategy: value[roleName].strategy,
			sourceConnected: true,
		})),
		sourceConnected: true,
	}
}

function descriptor(value: CompletePaletteTreatment, fieldHypothesis: FieldHypothesis): AlbumArtworkPaletteV2Phase3LogicalDescriptor {
	return { treatment: value, fieldHypothesis, lineage: lineage(value) }
}

function obligation(id: string, familyId: string, priority: number): IdentityObligation {
	return {
		id,
		familyId,
		priority,
		source: {
			regionIds: [`region:${familyId}`],
			connectedPopulationFraction: 0.2,
			materialDistanceFromField: 0.2,
			signatureRoleScore: 0.8,
			signatureEvidenceLevel: 20,
			regionEvidenceLevel: 20,
		},
	}
}

test("fair 1500 allocation is permutation invariant and retains strongest-last strata, obligations, modes, and legal forms", () => {
	const flatHypothesis = hypothesis("flat-source", "one-field", "field-flat", null)
	const foregroundCarrierHypothesis = hypothesis("foreground-carrier", "one-field", "field-carrier", null)
	const fourColorHypothesis = hypothesis("four-color-flat", "separate-flat-fields", "field-four", "surface-four")
	const gradientHypothesis = hypothesis("gradient-source", "gradient-field", "field-gradient", "surface-gradient")
	const obligations = [
		obligation("warm-signature", "warm", 2),
		obligation("cool-signature", "cool", 1),
	]
	const descriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = []
	for (let index = 0; index < 1_501; index++) {
		descriptors.push(descriptor(treatment({
			id: `filler:${index}`,
			fieldHypothesis: flatHypothesis,
			background: 0x100000 + index,
			surface: 0x100000 + index,
			foreground: 0xf0f0f0,
			accent: 0xff00ff,
			accentFamily: "ordinary-accent",
		}), flatHypothesis))
	}
	descriptors.push(descriptor(treatment({
		id: "foreground-obligation-carrier",
		quality: 0.3,
		fieldHypothesis: foregroundCarrierHypothesis,
		background: 0x050505,
		surface: 0x050505,
		foreground: 0xffaa00,
		accent: 0xffaa00,
		foregroundFamily: "warm",
	}), foregroundCarrierHypothesis))
	descriptors.push(descriptor(treatment({
		id: "four-color-flat",
		quality: 0.4,
		fieldHypothesis: fourColorHypothesis,
		background: 0x111111,
		surface: 0x333333,
		foreground: 0xeeeeee,
		accent: 0x00cc66,
		accentFamily: "ordinary-green",
	}), fourColorHypothesis))
	const strongestLast = descriptor(treatment({
		id: "strongest-last-gradient-accent-carrier",
		quality: 0.99,
		fieldHypothesis: gradientHypothesis,
		background: 0x121a40,
		surface: 0x603070,
		foreground: 0xfafafa,
		accent: 0x22ccff,
		accentFamily: "cool",
		gradient: true,
	}), gradientHypothesis)
	descriptors.push(strongestLast)

	assert.ok(descriptors.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY)
	const forward = materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations)
	const reversed = materializeAlbumArtworkPaletteV2Phase3Descriptors([...descriptors].reverse(), [...obligations].reverse())
	const strongestKey = completeTreatmentKey(strongestLast.treatment)

	assert.equal(forward.materialized.length, 1_500)
	assert.equal(forward.diagnostics.truncatedCanonicalTreatmentCount, 4)
	assert.ok(forward.materialized.some(({ key }) => key === strongestKey))
	assert.deepEqual(forward.materialized.map(({ key }) => key), reversed.materialized.map(({ key }) => key))
	assert.deepEqual(forward.diagnostics.uncoveredStratumKeys, [])
	assert.ok(forward.materialized.some(({ treatment: value }) => value.familyRoles.foreground === "warm"))
	assert.ok(forward.materialized.some(({ treatment: value }) =>
		!value.collapse.accent && value.familyRoles.accent === "cool"))
	assert.deepEqual(new Set(forward.materialized.map(({ treatment: value }) => value.cardinality)), new Set([2, 3, 4]))
	assert.deepEqual(new Set(forward.materialized.map(({ treatment: value }) => value.gradient ? "gradient" : "flat")),
		new Set(["flat", "gradient"]))
	assert.ok(forward.diagnostics.strata.every(({ strongestMaterialized }) => strongestMaterialized))

	const slate = buildAlbumArtworkPaletteV2Phase3Slate(forward, obligations)
	const reversedSlate = buildAlbumArtworkPaletteV2Phase3Slate(reversed, [...obligations].reverse())
	assert.ok(slate.selected.length <= 8)
	assert.equal(slate.winner.key, strongestKey)
	assert.deepEqual(slate.selected.map(({ key }) => key), reversedSlate.selected.map(({ key }) => key))
	assert.deepEqual(slate.diagnostics.uncoveredObligationIds, [])
	assert.deepEqual(slate.diagnostics.uncoveredObligationRoleStratumKeys, [])
	assert.deepEqual(slate.diagnostics.uncoveredSourceModeStratumKeys, [])
	assert.equal(slate.diagnostics.rawCardinalityReward, false)
})

test("canonical duplicates retain every distinct source lineage and select quality deterministically", () => {
	const firstHypothesis = hypothesis("first-lineage", "one-field", "field-a", null)
	const secondHypothesis = hypothesis("second-lineage", "one-field", "field-b", null)
	const firstTreatment = treatment({
		id: "duplicate:first",
		quality: 0.55,
		fieldHypothesis: firstHypothesis,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff00ff,
	})
	const secondTreatment = treatment({
		id: "duplicate:second",
		quality: 0.8,
		fieldHypothesis: secondHypothesis,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff00ff,
	})
	const firstDescriptor = descriptor(firstTreatment, firstHypothesis)
	const secondDescriptor = descriptor(secondTreatment, secondHypothesis)
	const output = materializeAlbumArtworkPaletteV2Phase3Descriptors([
		firstDescriptor,
		secondDescriptor,
		firstDescriptor,
	], [])

	assert.equal(output.materialized.length, 1)
	assert.equal(output.materialized[0].treatment.id, "duplicate:second")
	assert.equal(output.materialized[0].descriptors.length, 2)
	assert.deepEqual(output.materialized[0].descriptors.map(({ lineage: value }) => value.fieldHypothesisId), [
		"second-lineage",
		"first-lineage",
	])
	assert.equal(output.diagnostics.duplicateDescriptorCount, 1)
	assert.equal(output.diagnostics.duplicateCanonicalTreatmentCount, 1)
	assert.deepEqual(output.materialized[0].strata
		.filter(({ kind }) => kind === "source-hypothesis-mode")
		.map(({ key }) => key), [
		"source-hypothesis-mode:first-lineage:flat",
		"source-hypothesis-mode:second-lineage:flat",
	])
})

function gradientFixture(): RawImage {
	const width = 72
	const height = 48
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			data.set([
				Math.round(24 + 180 * amount),
				Math.round(42 + 70 * amount),
				Math.round(150 - 100 * amount),
			], (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

test("the adapter re-slates the real closed 0.7.4 domain and exposes honest integration diagnostics", () => {
	const details = extractAlbumArtworkPaletteV2074Details(gradientFixture())
	const descriptors = albumArtworkPaletteV2Phase3DescriptorsFromClosed074(details)
	const attempt = attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails(details)

	assert.equal(descriptors.length, details.audit.candidate.completeTreatments.length)
	assert.ok(descriptors.every(({ lineage: value }) => typeof value.sourceConnected === "boolean"))
	assert.equal(attempt.result.winner, attempt.slate.winner.treatment)
	assert.deepEqual(attempt.result.alternatives, attempt.slate.selected.map(({ treatment: value }) => value))
	assert.ok(attempt.result.alternatives.length <= 8)
	assert.equal(attempt.result.diagnostics.phase3FactorizedMaterialization.domain,
		"closed-0.7.4-complete-domain")
	assert.equal(attempt.result.diagnostics.phase3FactorizedMaterialization.upstreamEnumerationReplaced, false)
	assert.equal(attempt.result.diagnostics.phase3FactorizedMaterialization.materialization.rawCardinalityReward, false)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_ATTEMPT.extract(gradientFixture()).version,
		"wave-1-factorized-materialization")
})

test("inference contains no protected identity or human-evidence hooks", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-materialization.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /caseId|review|target(?:Key|Keys)/iu)
})
