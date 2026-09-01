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
	PaletteRoleColor,
	RepresentativeStrategy,
} from "../src/album-artwork-palette-v2.ts"
import {
	adaptAlbumArtworkPaletteV2Phase3BalancedMaterializationForCustody,
	materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain,
} from "../src/album-artwork-palette-v2-phase-3-arm-balanced-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3BalancedMaterialization,
} from "../src/album-artwork-palette-v2-phase-3-arm-balanced-materialization-adapter.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
} from "../src/album-artwork-palette-v2-phase-3-materialization-v2.ts"
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

function representative(
	value: number,
	familyId: string,
	strategy: RepresentativeStrategy = "dense-exact",
): ColorRepresentative {
	return {
		strategy,
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

function role(
	value: number,
	familyId: string,
	strategy: RepresentativeStrategy = "dense-exact",
): PaletteRoleColor {
	return { ...representative(value, familyId, strategy), generated: false }
}

function hypothesis(
	id: string,
	kind: FieldTreatmentKind,
	backgroundFamilyId: string,
	surfaceFamilyId: string | null,
): FieldHypothesis {
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
	fieldHypothesis: FieldHypothesis
	background: number
	surface: number
	foreground: number
	accent: number
	quality?: number
	foregroundFamily?: string
	accentFamily?: string
	gradient?: boolean
	strategy?: RepresentativeStrategy
}>

function treatment(options: TreatmentOptions): CompletePaletteTreatment {
	const backgroundFamily = options.fieldHypothesis.backgroundFamilyId
	const surfaceFamily = options.fieldHypothesis.surfaceFamilyId ?? backgroundFamily
	const foregroundFamily = options.foregroundFamily ?? "copy"
	const accentFamily = options.accentFamily ?? "mark"
	const surfaceCollapsed = options.background === options.surface
	const accentCollapsed = options.foreground === options.accent
	const quality = options.quality ?? 0.6
	return {
		id: options.id,
		background: role(options.background, backgroundFamily, options.strategy),
		surface: role(options.surface, surfaceFamily, options.strategy),
		foreground: role(options.foreground, foregroundFamily, options.strategy),
		accent: role(options.accent, accentFamily, options.strategy),
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

function descriptor(
	value: CompletePaletteTreatment,
	fieldHypothesis: FieldHypothesis,
	sourceType: AlbumArtworkPaletteV2Phase3LogicalDescriptor["sourceType"] = "closed-0.7.4-seed",
	sourceConnected = true,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor {
	return {
		sourceType,
		treatment: value,
		fieldHypothesis,
		lineage: {
			fieldHypothesisId: value.sourceFieldHypothesisId,
			fieldDirectionKey: fieldDirectionKey(value),
			roleDirectionKeys: roleDirectionKeys(value),
			familyIds: [...new Set(Object.values(value.familyRoles))],
			representatives: (["background", "surface", "foreground", "accent"] as const).map((roleName) => ({
				role: roleName,
				familyId: value.familyRoles[roleName],
				hex: value[roleName].hex,
				strategy: value[roleName].strategy,
				sourceConnected,
			})),
			sourceConnected,
		},
	}
}

function capPressureDescriptors(): AlbumArtworkPaletteV2Phase3LogicalDescriptor[] {
	const baseField = hypothesis("shared-flat-field", "one-field", "field", null)
	const gradientField = hypothesis("strongest-gradient-field", "gradient-field", "gradient-a", "gradient-b")
	const descriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = []
	for (let index = 0; index < 1_500; index++) {
		descriptors.push(descriptor(treatment({
			id: `filler:${index}`,
			fieldHypothesis: baseField,
			background: 0x100000 + index,
			surface: 0x100000 + index,
			foreground: 0xf0f0f0,
			accent: 0xcc00cc,
			quality: 0.8,
		}), baseField))
	}
	descriptors.push(
		descriptor(treatment({
			id: "low-transition",
			fieldHypothesis: baseField,
			background: 0x300001,
			surface: 0x300001,
			foreground: 0xffaa00,
			accent: 0x0099ff,
			foregroundFamily: "warm",
			accentFamily: "cool",
			quality: 0.2,
		}), baseField, "native-field-transition", false),
		descriptor(treatment({
			id: "low-endpoint",
			fieldHypothesis: baseField,
			background: 0x300002,
			surface: 0x300002,
			foreground: 0x0099ff,
			accent: 0xffaa00,
			foregroundFamily: "cool",
			accentFamily: "warm",
			quality: 0.21,
		}), baseField, "band-local-endpoint", false),
		descriptor(treatment({
			id: "low-role-combination",
			fieldHypothesis: baseField,
			background: 0x300003,
			surface: 0x300003,
			foreground: 0x30ee80,
			accent: 0xff4060,
			foregroundFamily: "green-copy",
			accentFamily: "red-mark",
			quality: 0.22,
		}), baseField, "field-proposal-v2", false),
		descriptor(treatment({
			id: "low-representative",
			fieldHypothesis: baseField,
			background: 0x300004,
			surface: 0x300004,
			foreground: 0xf4f4f4,
			accent: 0x40a0e0,
			quality: 0.23,
			strategy: "nearest-prototype",
		}), baseField),
		descriptor(treatment({
			id: "collapsed-form",
			fieldHypothesis: baseField,
			background: 0x300005,
			surface: 0x300005,
			foreground: 0xf8f8f8,
			accent: 0xf8f8f8,
			quality: 0.24,
		}), baseField),
		descriptor(treatment({
			id: "strongest-last",
			fieldHypothesis: gradientField,
			background: 0x102050,
			surface: 0x804060,
			foreground: 0xfafafa,
			accent: 0x22ddaa,
			foregroundFamily: "light-copy",
			accentFamily: "green-mark",
			quality: 0.99,
			gradient: true,
			strategy: "density-synthesized",
		}), gradientField, "field-proposal-v2"),
	)
	return descriptors
}

function transitionField(): RawImage {
	const width = 40
	const height = 28
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

test(">1500 strongest-last balanced allocation retains focused source, role, representative, collapse, and field strata", () => {
	const descriptors = capPressureDescriptors()
	assert.ok(descriptors.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY)
	const output = materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain(descriptors, [])
	const strongestLastKey = completeTreatmentKey(descriptors.at(-1)!.treatment)

	assert.equal(output.balanced.materialized.length, 1_500)
	assert.equal(output.diagnostics.canonicalKeys.input.length, 1_506)
	assert.ok(output.diagnostics.canonicalKeys.balancedMaterialized.includes(strongestLastKey))
	assert.deepEqual(output.diagnostics.uncoveredStratumKeys.balanced, [])
	assert.deepEqual(output.diagnostics.unmaterializedStrongestStratumKeys.balanced, [])
	for (const kind of [
		"transition",
		"endpoint",
		"role-combination",
		"representative",
		"collapse",
		"field-mode",
	] as const) {
		const summary = output.diagnostics.focusedStrataByKind.find((entry) => entry.kind === kind)!
		assert.ok(summary.availableStratumCount > 0)
		assert.equal(summary.balancedCoveredStratumCount, summary.availableStratumCount)
		assert.equal(summary.balancedMaterializedStrongestStratumCount, summary.availableStratumCount)
	}
	assert.ok(output.diagnostics.focusedStrata.some(({ kind, key }) =>
		kind === "transition" && key.startsWith("transition:")))
	assert.ok(output.diagnostics.focusedStrata.some(({ kind, key }) =>
		kind === "endpoint" && key.startsWith("endpoint:")))
	assert.ok(output.diagnostics.focusedStrata.some(({ kind, key }) =>
		kind === "role-combination" && key.startsWith("foreground-accent-combination:")))
	assert.ok(output.diagnostics.focusedStrata.some(({ kind, key }) =>
		kind === "representative" && key.includes("nearest-prototype")))
	assert.ok(output.diagnostics.focusedStrata.some(({ kind, key }) =>
		kind === "collapse" && key.includes("accent-collapsed")))
	assert.deepEqual(new Set(output.diagnostics.focusedStrata
		.filter(({ kind }) => kind === "field-mode").map(({ key }) => key)),
	new Set(["field-mode:flat", "field-mode:gradient"]))
	assert.ok(output.diagnostics.uncoveredStratumKeys.current.length > 0)
	assert.ok(output.diagnostics.unmaterializedStrongestStratumKeys.current.length > 0)
	assert.equal(output.diagnostics.rawCardinalityReward, false)
	assert.equal(output.diagnostics.proposalSourceIsCoverageOnly, true)
})

test("cap-pressure allocation and diagnostics are deterministic under descriptor permutation", () => {
	const descriptors = capPressureDescriptors()
	const forward = materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain(descriptors, [])
	const permuted = materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain([
		...descriptors.filter((_, index) => index % 2 === 0).reverse(),
		...descriptors.filter((_, index) => index % 2 === 1).reverse(),
	], [])

	assert.deepEqual(forward.balanced.materialized.map(({ key }) => key),
		permuted.balanced.materialized.map(({ key }) => key))
	assert.deepEqual(forward.diagnostics, permuted.diagnostics)
})

test("under-cap materialization equals the exact canonical input domain and preserves canonical aliases", () => {
	const firstField = hypothesis("alias-first", "one-field", "field", null)
	const secondField = hypothesis("alias-second", "one-field", "field", null)
	const first = descriptor(treatment({
		id: "alias:first",
		fieldHypothesis: firstField,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff8800,
		quality: 0.5,
	}), firstField, "closed-0.7.4-seed")
	const second = descriptor(treatment({
		id: "alias:second",
		fieldHypothesis: secondField,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff8800,
		quality: 0.8,
	}), secondField, "native-field-transition")
	const distinct = descriptor(treatment({
		id: "distinct",
		fieldHypothesis: firstField,
		background: 0x111111,
		surface: 0x111111,
		foreground: 0xf4f4f4,
		accent: 0x40a0e0,
	}), firstField, "band-local-endpoint")
	const output = materializeAlbumArtworkPaletteV2Phase3BalancedArmDomain([first, second, first, distinct], [])
	const expectedKeys = [...new Set([first, second, distinct].map(({ treatment: value }) =>
		completeTreatmentKey(value)))].sort()

	assert.deepEqual(output.diagnostics.canonicalKeys.input, expectedKeys)
	assert.deepEqual(output.diagnostics.canonicalKeys.currentMaterialized, expectedKeys)
	assert.deepEqual(output.diagnostics.canonicalKeys.balancedMaterialized, expectedKeys)
	assert.deepEqual(output.diagnostics.canonicalKeys.currentOnly, [])
	assert.deepEqual(output.diagnostics.canonicalKeys.balancedOnly, [])
	const aliased = output.balanced.materialized.find(({ key }) => key === completeTreatmentKey(first.treatment))!
	assert.equal(aliased.logicalDescriptors.length, 2)
	assert.deepEqual(new Set(aliased.logicalDescriptors.map(({ sourceType }) => sourceType)),
		new Set(["closed-0.7.4-seed", "native-field-transition"]))
	const custody = adaptAlbumArtworkPaletteV2Phase3BalancedMaterializationForCustody(output.balanced)
	const adaptedAlias = custody.find(({ key }) => key === aliased.key)!
	assert.equal(adaptedAlias.descriptors, aliased.logicalDescriptors)
	assert.deepEqual(adaptedAlias.descriptors, aliased.logicalDescriptors)
})

test("standalone adapter composes balanced materialization with current recovery selection and custody", () => {
	const result = extractAlbumArtworkPaletteV2Phase3BalancedMaterialization(transitionField())
	const diagnostics = result.diagnostics.phase3BalancedMaterialization

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT.identity.attemptId,
		"phase-3-arm-balanced-materialization")
	assert.equal(completeTreatmentKey(result.alternatives[0]), completeTreatmentKey(result.winner))
	assert.equal(diagnostics.materialization.materializedTreatmentCount,
		diagnostics.selector.domain.materializedTreatmentCount)
	assert.equal(diagnostics.materialization.rawCardinalityReward, false)
	assert.equal(diagnostics.materialization.proposalSourceIsCoverageOnly, true)
	assert.deepEqual(diagnostics.comparison.selectedSourceTypes.balanced,
		[...diagnostics.comparison.selectedSourceTypes.balanced].sort())
	assert.equal(diagnostics.comparison.sourceCoverage.length, 4)
	assert.equal(diagnostics.comparison.domain.canonicalKeys.input.length,
		diagnostics.materialization.uniqueCanonicalTreatmentCount)
	assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 8)
})

test("balanced materialization inference contains no external outcome metadata or selection override path", async () => {
	const sources = await Promise.all([
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-arm-balanced-materialization.ts",
			import.meta.url,
		), "utf8"),
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-arm-balanced-materialization-adapter.ts",
			import.meta.url,
		), "utf8"),
	])
	for (const source of sources) {
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical|comment|fallback)/iu)
		assert.doesNotMatch(source,
			/(?:closed\.result\.(?:winner|alternatives)|forcedReservation|anchorPrefix)/iu)
		assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	}
})
