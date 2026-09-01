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
	RepresentativeStrategy,
} from "../src/album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3MaterializationV2Module,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY,
	albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata,
	materializeAlbumArtworkPaletteV2Phase3DescriptorsV2,
	materializeAlbumArtworkPaletteV2Phase3V2,
} from "../src/album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationV2,
} from "../src/album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type { RGB } from "../src/types.ts"

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
	backgroundFamily?: string
	surfaceFamily?: string
	foregroundFamily?: string
	accentFamily?: string
	gradient?: boolean
	strategy?: RepresentativeStrategy
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
				sourceConnected: true,
			})),
			sourceConnected: true,
		},
	}
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

test("the common MaterializationV2 API is implemented without changing the neutral contract", () => {
	const module: AlbumArtworkPaletteV2Phase3MaterializationV2Module<
		AlbumArtworkPaletteV2Phase3MaterializationV2
	> = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2
	const field = hypothesis("api-field", "one-field", "api-background", null)
	const logicalDescriptor = descriptor(treatment({
		id: "api-treatment",
		fieldHypothesis: field,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xf0f0f0,
	}), field)
	const direct = materializeAlbumArtworkPaletteV2Phase3V2({
		logicalDescriptors: [logicalDescriptor],
		identityObligations: [],
	})
	const throughModule = module.materialize({
		logicalDescriptors: [logicalDescriptor],
		identityObligations: [],
	})

	assert.deepEqual(throughModule, direct)
	assert.equal(direct.materialized[0].logicalDescriptors[0], logicalDescriptor)
	assert.equal(direct.diagnostics.rawCardinalityReward, false)
	assert.equal(direct.diagnostics.proposalSourceIsCoverageOnly, true)
})

test(">1500 strongest-last allocation is permutation invariant across every fair materialization stratum", () => {
	const baseField = hypothesis("base-field", "one-field", "base-background", null)
	const pairField = hypothesis("pair-field", "separate-flat-fields", "pair-background", "pair-surface")
	const gradientField = hypothesis("gradient-field", "gradient-field", "gradient-background", "gradient-surface")
	const descriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = []
	for (let index = 0; index < 1_501; index++) {
		descriptors.push(descriptor(treatment({
			id: `filler:${index}`,
			fieldHypothesis: baseField,
			background: 0x100000 + index,
			surface: 0x100000 + index,
			foreground: 0xf0f0f0,
			accent: 0xcc00cc,
			accentFamily: "ordinary-accent",
		}), baseField))
	}
	const foregroundAccentPair = descriptor(treatment({
		id: "foreground-warm-accent-cool",
		quality: 0.31,
		fieldHypothesis: pairField,
		background: 0x111111,
		surface: 0x333333,
		foreground: 0xffaa00,
		accent: 0x0099ff,
		foregroundFamily: "warm",
		accentFamily: "cool",
	}), pairField, "field-proposal-v2")
	const reversedRolePair = descriptor(treatment({
		id: "foreground-cool-accent-warm",
		quality: 0.32,
		fieldHypothesis: pairField,
		background: 0x111111,
		surface: 0x333333,
		foreground: 0x0099ff,
		accent: 0xffaa00,
		foregroundFamily: "cool",
		accentFamily: "warm",
		strategy: "nearest-prototype",
	}), pairField, "native-field-transition")
	const collapsedAccent = descriptor(treatment({
		id: "collapsed-accent",
		quality: 0.33,
		fieldHypothesis: pairField,
		background: 0x121212,
		surface: 0x343434,
		foreground: 0xfefefe,
		accent: 0xfefefe,
		foregroundFamily: "warm",
		accentFamily: "warm",
	}), pairField, "band-local-endpoint")
	const twoColorCollapsed = descriptor(treatment({
		id: "two-color-collapsed",
		quality: 0.30,
		fieldHypothesis: baseField,
		background: 0x090909,
		surface: 0x090909,
		foreground: 0xf9f9f9,
		accent: 0xf9f9f9,
		foregroundFamily: "light-text",
		accentFamily: "light-text",
	}), baseField, "closed-0.7.4-seed")
	const strongestLast = descriptor(treatment({
		id: "strongest-last-gradient",
		quality: 0.99,
		fieldHypothesis: gradientField,
		background: 0x102050,
		surface: 0x804060,
		foreground: 0xfafafa,
		accent: 0x22ddaa,
		foregroundFamily: "light-text",
		accentFamily: "cool",
		gradient: true,
		strategy: "density-synthesized",
	}), gradientField, "field-proposal-v2")
	descriptors.push(foregroundAccentPair, reversedRolePair, collapsedAccent, twoColorCollapsed, strongestLast)
	const obligations = [obligation("warm-role", "warm", 1), obligation("cool-role", "cool", 2)]

	assert.ok(descriptors.length > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_CAPACITY)
	const forward = materializeAlbumArtworkPaletteV2Phase3DescriptorsV2(descriptors, obligations)
	const permuted = materializeAlbumArtworkPaletteV2Phase3DescriptorsV2([
		...descriptors.filter((_, index) => index % 2 === 0).reverse(),
		...descriptors.filter((_, index) => index % 2 === 1).reverse(),
	], [...obligations].reverse())

	assert.equal(forward.materialized.length, 1_500)
	assert.equal(forward.diagnostics.uniqueCanonicalTreatmentCount, 1_506)
	assert.equal(forward.diagnostics.truncatedCanonicalTreatmentCount, 6)
	assert.deepEqual(forward.materialized.map(({ key }) => key), permuted.materialized.map(({ key }) => key))
	assert.deepEqual(forward.diagnostics.strata, permuted.diagnostics.strata)
	assert.deepEqual(forward.diagnostics.uncoveredStratumKeys, [])
	assert.deepEqual(forward.diagnostics.unmaterializedStrongestStratumKeys, [])
	assert.ok(forward.diagnostics.strata.every(({ strongestMaterialized }) => strongestMaterialized))
	for (const special of [foregroundAccentPair, reversedRolePair, collapsedAccent, twoColorCollapsed, strongestLast]) {
		assert.ok(forward.materialized.some(({ key }) => key === completeTreatmentKey(special.treatment)))
	}
	assert.deepEqual(new Set(forward.materialized.map(({ treatment: value }) => value.gradient ? "gradient" : "flat")),
		new Set(["flat", "gradient"]))
	assert.deepEqual(new Set(forward.materialized.map(({ treatment: value }) => value.cardinality)),
		new Set([2, 3, 4]))
	assert.ok(forward.diagnostics.strata.some(({ key }) =>
		key === "foreground-accent-combination:warm:cool"))
	assert.ok(forward.diagnostics.strata.some(({ key }) =>
		key === "foreground-accent-combination:cool:warm"))
	assert.ok(forward.diagnostics.strata.some(({ key }) => key === "field-mode:gradient"))
	assert.ok(forward.diagnostics.strata.some(({ key }) => key.includes("accent-collapsed")))
	assert.ok(forward.diagnostics.strata.some(({ key }) => key.endsWith("cardinality-4")))
	assert.equal(forward.diagnostics.rawCardinalityReward, false)
})

test("canonical duplicates retain distinct source and enriched role-domain lineage", () => {
	const firstField = hypothesis("duplicate-first", "one-field", "first-background", null)
	const secondField = hypothesis("duplicate-second", "one-field", "second-background", null)
	const first = descriptor(treatment({
		id: "duplicate:first",
		quality: 0.52,
		fieldHypothesis: firstField,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff8800,
		foregroundFamily: "text",
		accentFamily: "warm",
	}), firstField, "closed-0.7.4-seed")
	const secondBase = descriptor(treatment({
		id: "duplicate:second",
		quality: 0.84,
		fieldHypothesis: secondField,
		background: 0x101010,
		surface: 0x101010,
		foreground: 0xf0f0f0,
		accent: 0xff8800,
		foregroundFamily: "text",
		accentFamily: "warm",
	}), secondField, "field-proposal-v2")
	type EnrichedDescriptor = AlbumArtworkPaletteV2Phase3LogicalDescriptor & Readonly<{
		roleSpecificObligations: ReadonlyArray<Readonly<{
			id: string
			familyId: string
			fieldHypothesisId: string
			requiredRole: "foreground" | "accent" | "ambiguous"
		}>>
	}>
	const second: EnrichedDescriptor = {
		...secondBase,
		roleSpecificObligations: [{
			id: "field-warm-accent",
			familyId: "warm",
			fieldHypothesisId: secondField.id,
			requiredRole: "accent",
		}],
	}
	const output = materializeAlbumArtworkPaletteV2Phase3DescriptorsV2<
		AlbumArtworkPaletteV2Phase3LogicalDescriptor | EnrichedDescriptor
	>([first, second, first], [])

	assert.equal(output.materialized.length, 1)
	assert.equal(output.materialized[0].treatment.id, "duplicate:second")
	assert.equal(output.materialized[0].logicalDescriptors.length, 2)
	assert.deepEqual(output.materialized[0].logicalDescriptors.map(({ sourceType }) => sourceType), [
		"field-proposal-v2",
		"closed-0.7.4-seed",
	])
	assert.equal(output.diagnostics.duplicateLogicalDescriptorCount, 1)
	assert.equal(output.diagnostics.duplicateCanonicalTreatmentCount, 1)
	assert.ok(output.materialized[0].strata.some(({ key }) =>
		key === "role-specific-obligation-carrier:field-warm-accent:accent"))
	assert.ok(output.materialized[0].strata.some(({ key }) =>
		key === "field-proposal-source:closed-0.7.4-seed"))
	assert.ok(output.materialized[0].strata.some(({ key }) =>
		key === "field-proposal-source:field-proposal-v2"))
})

test("role carrier strata distinguish foreground, accent, and legal accent collapse", () => {
	const field = hypothesis("role-field", "separate-flat-fields", "background", "surface")
	const foregroundCarrier = descriptor(treatment({
		id: "foreground-carrier",
		fieldHypothesis: field,
		background: 0x111111,
		surface: 0x333333,
		foreground: 0xffaa00,
		accent: 0x0099ff,
		foregroundFamily: "warm",
		accentFamily: "cool",
	}), field)
	const accentCarrier = descriptor(treatment({
		id: "accent-carrier",
		fieldHypothesis: field,
		background: 0x121212,
		surface: 0x343434,
		foreground: 0x0099ff,
		accent: 0xffaa00,
		foregroundFamily: "cool",
		accentFamily: "warm",
	}), field)
	const collapsed = descriptor(treatment({
		id: "collapsed-role",
		fieldHypothesis: field,
		background: 0x131313,
		surface: 0x353535,
		foreground: 0xffaa00,
		accent: 0xffaa00,
		foregroundFamily: "warm",
		accentFamily: "warm",
	}), field)
	const warm = obligation("warm-obligation", "warm", 1)
	const foregroundStrata = albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(
		foregroundCarrier,
		[warm],
	)
	const accentStrata = albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(accentCarrier, [warm])
	const collapsedStrata = albumArtworkPaletteV2Phase3MaterializationV2DescriptorStrata(collapsed, [warm])

	assert.ok(foregroundStrata.some(({ key }) =>
		key === "role-specific-obligation-carrier:warm-obligation:foreground"))
	assert.ok(accentStrata.some(({ key }) =>
		key === "role-specific-obligation-carrier:warm-obligation:accent"))
	assert.ok(collapsedStrata.some(({ key }) =>
		key === "role-specific-obligation-carrier:warm-obligation:foreground"))
	assert.ok(!collapsedStrata.some(({ key }) =>
		key === "role-specific-obligation-carrier:warm-obligation:accent"))
})

test("materialization-v2 inference has no public-selection or protected-evidence hooks", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-materialization-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /(?:caseId|artworkId|review|feedback|target(?:Key|Keys))/iu)
	assert.doesNotMatch(source, /(?:anchorPrefix|winner|slate)/iu)
})
