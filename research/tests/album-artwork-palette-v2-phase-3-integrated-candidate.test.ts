import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	fieldDirectionKey,
	roleDirectionKeys,
} from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	FieldHypothesis,
	GradientFieldEvidence,
	PaletteRoleColor,
} from "../src/album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
	applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority,
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidate,
	selectAlbumArtworkPaletteV2Phase3IntegratedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath,
} from "../src/album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	FamilyRolePreference,
	RoleSpecificIdentityObligation,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import type { RGB, RawImage } from "../src/types.ts"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import { parseAlbumArtworkPaletteV2Phase3IterationArguments } from
	"../run-album-artwork-palette-v2-phase-3-iteration.ts"

function scores(quality: number): CompletePaletteScores {
	return {
		fieldFidelity: quality,
		surfaceFidelity: quality,
		fieldStructure: quality,
		fieldIdentity: quality,
		treatmentFoundation: quality,
		activeRolePathObservability: 1,
		artworkIdentity: quality,
		representativeness: quality,
		uiUtility: quality,
		foregroundUtility: quality,
		foregroundPolarityAgreement: 1,
		accentFidelity: quality,
		accentUtility: quality,
		coherence: quality,
		economy: quality,
		generatorConfidence: quality,
		foundation: quality,
		balance: quality,
		generatedPenalty: 0,
		rankingScore: quality,
	}
}

function rgb(hex: string): RGB {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
}

function roleColor(hex: string, familyId: string): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, (value[1] - 127) / 510, (value[2] - 127) / 510],
		hex,
		generated: false,
		strategy: "dense-exact",
		support: {
			exactSource: true,
			exemplar: { x: 0, y: 0 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: 0.9,
			totalSupport: 0.2,
			connectedSupport: 0.15,
			spatialCoverage: 0.8,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

function gradientEvidence(
	backgroundFamily: string,
	surfaceFamily: string,
	background: string,
	surface: string,
): GradientFieldEvidence {
	const profile = {
		frameCoverage: 0.8,
		peripheralCoverage: 0.8,
		connectedCoverage: 0.8,
		fieldScore: 0.8,
		populationCoverage: 0.8,
		evidenceLevels: [20, 20, 20, 20, 20] as [number, number, number, number, number],
	}
	return {
		topology: "linear",
		direction: "horizontal",
		endpointBands: [0.15, 0.85],
		progression: 0.9,
		modeProgression: 0.85,
		monotonicity: 0.9,
		residual: 0.02,
		span: 0.3,
		texture: 0.02,
		bandDispersion: 0.05,
		edgeContinuity: 0.9,
		coverage: 0.8,
		supportingFamilyIds: [backgroundFamily, surfaceFamily],
		supportingEndpointHexes: [background, surface],
		backgroundTopologyEndpoint: "low",
		roleAssignment: {
			backgroundFamilyId: backgroundFamily,
			surfaceFamilyId: surfaceFamily,
			backgroundProfile: profile,
			surfaceProfile: { ...profile, frameCoverage: 0.6 },
			decisiveCriterion: "frameCoverage",
			confidence: 0.7,
		},
		fieldDomainId: `domain:${backgroundFamily}:${surfaceFamily}`,
		fieldDomainPopulationFraction: 0.8,
		fieldDomainBorderCoverage: 0.8,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: [`component:${backgroundFamily}`, `component:${surfaceFamily}`],
	}
}

type TreatmentOptions = Readonly<{
	quality: number
	colors: readonly [string, string, string, string]
	gradient?: boolean
	foregroundFamily?: string
	accentFamily?: string
}>

function treatment(label: string, options: TreatmentOptions): CompletePaletteTreatment {
	const backgroundFamily = `field-a:${label}`
	const surfaceFamily = `field-b:${label}`
	const foregroundFamily = options.foregroundFamily ?? `copy:${label}`
	const accentFamily = options.accentFamily ?? `mark:${label}`
	const gradient = options.gradient ?? false
	const fieldHypothesisId = `field:${label}`
	const pairs = [
		{ role: "foreground" as const, fieldRole: "background" as const, position: 0, signedLc: 65, absoluteLc: 65 },
		{ role: "accent" as const, fieldRole: "surface" as const, position: 1, signedLc: 45, absoluteLc: 45 },
	]
	return {
		id: `treatment:${label}`,
		background: roleColor(options.colors[0], backgroundFamily),
		surface: roleColor(options.colors[1], surfaceFamily),
		foreground: roleColor(options.colors[2], foregroundFamily),
		accent: roleColor(options.colors[3], accentFamily),
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: fieldHypothesisId,
		familyRoles: {
			background: backgroundFamily,
			surface: surfaceFamily,
			foreground: foregroundFamily,
			accent: accentFamily,
		},
		cardinality: 4,
		collapse: { surface: false, accent: false },
		contrast: { pairs, minimumAbsoluteLc: 45, meanAbsoluteLc: 55 },
		scores: scores(options.quality),
		gradientEvidence: gradient
			? gradientEvidence(backgroundFamily, surfaceFamily, options.colors[0], options.colors[1])
			: null,
	}
}

function field(value: CompletePaletteTreatment): FieldHypothesis {
	return {
		id: value.sourceFieldHypothesisId,
		kind: value.fieldTreatment,
		backgroundFamilyId: value.familyRoles.background,
		surfaceFamilyId: value.familyRoles.surface,
		backgroundRepresentatives: [value.background],
		surfaceRepresentatives: [value.surface],
		fieldFidelity: value.scores.fieldFidelity,
		surfaceContribution: value.scores.surfaceFidelity,
		spatialRelation: null,
		roleAssignment: value.gradientEvidence?.roleAssignment ?? null,
		gradientEvidence: value.gradientEvidence,
		pruningNotes: [],
	}
}

function descriptor(
	value: CompletePaletteTreatment,
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	sourceConnected = true,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor {
	return {
		sourceType,
		treatment: value,
		fieldHypothesis: field(value),
		lineage: {
			fieldHypothesisId: value.sourceFieldHypothesisId,
			fieldDirectionKey: fieldDirectionKey(value),
			roleDirectionKeys: roleDirectionKeys(value),
			familyIds: [...new Set(Object.values(value.familyRoles))],
			representatives: (["background", "surface", "foreground", "accent"] as const).map((role) => ({
				role,
				familyId: value.familyRoles[role],
				hex: value[role].hex,
				strategy: value[role].strategy,
				sourceConnected,
			})),
			sourceConnected,
		},
	}
}

function materialized(
	value: CompletePaletteTreatment,
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	sourceConnected = true,
): AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate {
	return {
		key: completeTreatmentKey(value),
		treatment: value,
		descriptors: [descriptor(value, sourceType, sourceConnected)],
	}
}

function obligation(
	id: string,
	value: CompletePaletteTreatment,
	role: "foreground" | "accent",
	preference: FamilyRolePreference = role,
): RoleSpecificIdentityObligation {
	const familyId = value.familyRoles[role]
	return {
		id,
		familyId,
		fieldHypothesisId: value.sourceFieldHypothesisId,
		requiredRole: preference,
		priority: 0,
		evidence: {
			familyId,
			fieldHypothesisId: value.sourceFieldHypothesisId,
			preference,
			reason: preference === "foreground" ? "decisive-foreground" : "decisive-accent",
			confidence: 0.9,
			fieldOwned: false,
			observedRegionCount: 2,
			coherentSupport: 0.9,
			foreground: {
				score: 0.9,
				typographyLikeGeometry: 0.9,
				repetition: 0.9,
				observedLocalContrast: 0.9,
				fieldLightnessContrast: 0.9,
				polarityAgreement: 0.9,
				polarity: {
					source: { polarity: 1, confidence: 0.9, componentIds: [`component:${familyId}`] },
					fieldDirection: 1,
					fieldConfidence: 0.9,
				},
			},
			accent: {
				score: 0.9,
				compactness: 0.9,
				repetition: 0.9,
				chroma: 0.9,
				observedLocalContrast: 0.9,
				signatureObservation: 0.9,
			},
		},
	}
}

function recoverySelection(
	baseline: CompletePaletteTreatment,
	values: readonly CompletePaletteTreatment[],
	quality: ReadonlyMap<string, number>,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection {
	const selected = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(values)
	return {
		...selected,
		winner: baseline,
		slate: [baseline, ...selected.slate.filter((value) =>
			completeTreatmentKey(value) !== completeTreatmentKey(baseline))],
		evaluations: selected.evaluations.map((evaluation) => ({
			...evaluation,
			qualityUtility: quality.get(evaluation.key) ?? evaluation.qualityUtility,
		})),
	}
}

const VALUES = {
	disconnected: treatment("disconnected", {
		quality: 1,
		colors: ["#182850", "#586888", "#f0f0e8", "#d0a030"],
	}),
	lineage: treatment("lineage", {
		quality: 0.99,
		colors: ["#203860", "#607898", "#f8f0e0", "#c89828"],
	}),
	ordinary: treatment("ordinary", {
		quality: 0.5,
		colors: ["#304868", "#886048", "#101820", "#d02878"],
		foregroundFamily: "ordinary-copy",
		accentFamily: "ordinary-mark",
	}),
	earned: treatment("earned", {
		quality: 0.5,
		colors: ["#284878", "#40a860", "#080808", "#d03088"],
		gradient: true,
		foregroundFamily: "earned-copy",
		accentFamily: "earned-mark",
	}),
} as const

const SELECTION_QUALITY = new Map([
	[completeTreatmentKey(VALUES.disconnected), 0.95],
	[completeTreatmentKey(VALUES.lineage), 0.9],
	[completeTreatmentKey(VALUES.ordinary), 0.88],
	[completeTreatmentKey(VALUES.earned), 0.87],
])

const MATERIALIZED = [
	materialized(VALUES.disconnected, "closed-0.7.4-seed", false),
	materialized(VALUES.lineage, "closed-0.7.4-seed"),
	materialized(VALUES.ordinary, "closed-0.7.4-seed"),
	materialized(VALUES.earned, "native-field-transition"),
] as const

const OBLIGATIONS = [
	obligation("ordinary-copy", VALUES.ordinary, "foreground"),
	obligation("ordinary-mark", VALUES.ordinary, "accent"),
	obligation("earned-copy", VALUES.earned, "foreground"),
] as const

test("winner composition rejects a stronger non-transition rescue and promotes only an earned complete-lineage transition", () => {
	const recoveryV2 = recoverySelection(VALUES.disconnected, Object.values(VALUES), SELECTION_QUALITY)
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2,
		materialized: MATERIALIZED,
		roleObligations: OBLIGATIONS,
		acceptedTransitionHypothesisIds: [VALUES.earned.sourceFieldHypothesisId],
	})

	assert.equal(result.completeLineage.fullDomainCustodySelection, recoveryV2)
	assert.equal(result.diagnostics.unrestrictedWinnerKey, completeTreatmentKey(VALUES.disconnected))
	assert.equal(result.diagnostics.lineageWinnerKey, completeTreatmentKey(VALUES.lineage))
	assert.equal(result.transitionRescue.winnerKey, completeTreatmentKey(VALUES.ordinary))
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(VALUES.earned))
	assert.equal(result.diagnostics.transitionPromoted, true)
	assert.equal(result.diagnostics.winnerLineageBasis, "ordinary-complete-source-lineage")
	assert.ok(result.diagnostics.qualityLossFromUnrestrictedWinner <= 0.12)
	assert.deepEqual(result.slate.map(completeTreatmentKey), result.diagnostics.slateKeys)
	assert.equal(result.diagnostics.slateKeys[0], completeTreatmentKey(VALUES.earned))
	assert.ok(result.slate.length <= 8)
})

test("an earned transition and ordinary lineage split across descriptor aliases cannot promote", () => {
	const nativeAlias = descriptor(VALUES.earned, "native-field-transition")
	const splitCertificateCandidate = {
		...MATERIALIZED[3],
		descriptors: [
			{
				...nativeAlias,
				lineage: { ...nativeAlias.lineage, fieldDirectionKey: "invalid-native-alias-direction" },
			},
			descriptor(VALUES.earned, "closed-0.7.4-seed"),
		],
	}
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(
			VALUES.disconnected,
			[VALUES.disconnected, VALUES.lineage, VALUES.earned],
			SELECTION_QUALITY,
		),
		materialized: [MATERIALIZED[0], MATERIALIZED[1], splitCertificateCandidate],
		roleObligations: [obligation("earned-copy", VALUES.earned, "foreground")],
		acceptedTransitionHypothesisIds: [VALUES.earned.sourceFieldHypothesisId],
	})
	const transition = result.transitionRescue.candidates.find(({ key }) =>
		key === completeTreatmentKey(VALUES.earned))!
	const lineage = result.completeLineage.eligibility.diagnostics.candidates.find(({ key }) =>
		key === completeTreatmentKey(VALUES.earned))!

	assert.equal(transition.earnedNativeTransition, true)
	assert.equal(transition.promotionEligible, true)
	assert.equal(lineage.ordinaryEligibleDescriptorCount, 1)
	assert.equal(result.diagnostics.completeLineageTransitionCandidateCount, 0)
	assert.equal(result.diagnostics.transitionPromoted, false)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(VALUES.lineage))
})

test("a structurally different native alias cannot authorize the selected canonical treatment", () => {
	const alias = treatment("earned-structural-alias", {
		quality: 0.5,
		colors: ["#284878", "#40a860", "#080808", "#d03088"],
		gradient: true,
		foregroundFamily: "alias-copy",
		accentFamily: "alias-mark",
	})
	assert.equal(completeTreatmentKey(alias), completeTreatmentKey(VALUES.earned))
	const aliasCandidate = {
		...MATERIALIZED[3],
		descriptors: [descriptor(alias, "native-field-transition")],
	}
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(
			VALUES.disconnected,
			[VALUES.disconnected, VALUES.lineage, VALUES.earned],
			SELECTION_QUALITY,
		),
		materialized: [MATERIALIZED[0], MATERIALIZED[1], aliasCandidate],
		roleObligations: [obligation("earned-copy", VALUES.earned, "foreground")],
		acceptedTransitionHypothesisIds: [alias.sourceFieldHypothesisId],
	})

	assert.equal(result.transitionRescue.candidates.find(({ key }) =>
		key === completeTreatmentKey(VALUES.earned))!.earnedNativeTransition, true)
	assert.equal(result.diagnostics.completeLineageTransitionCandidateCount, 0)
	assert.equal(result.diagnostics.transitionPromoted, false)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(VALUES.lineage))
})

test("a transition inside the lineage-winner bound but outside the unrestricted-winner bound cannot promote", () => {
	const quality = new Map([
		[completeTreatmentKey(VALUES.disconnected), 0.95],
		[completeTreatmentKey(VALUES.lineage), 0.9],
		[completeTreatmentKey(VALUES.earned), 0.82],
	])
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(
			VALUES.disconnected,
			[VALUES.disconnected, VALUES.lineage, VALUES.earned],
			quality,
		),
		materialized: [MATERIALIZED[0], MATERIALIZED[1], MATERIALIZED[3]],
		roleObligations: [obligation("earned-copy", VALUES.earned, "foreground")],
		acceptedTransitionHypothesisIds: [VALUES.earned.sourceFieldHypothesisId],
	})
	const transition = result.transitionRescue.candidates.find(({ key }) =>
		key === completeTreatmentKey(VALUES.earned))!

	assert.ok(0.9 - 0.82 <= 0.12)
	assert.ok(0.95 - 0.82 > 0.12)
	assert.equal(transition.withinQualityBound, true)
	assert.equal(transition.promotionEligible, true)
	assert.equal(result.transitionRescue.winnerKey, completeTreatmentKey(VALUES.earned))
	assert.equal(result.diagnostics.completeLineageTransitionCandidateCount, 1)
	assert.equal(result.diagnostics.qualityBoundedTransitionCandidateCount, 0)
	assert.equal(result.diagnostics.transitionPromoted, false)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(VALUES.lineage))
})

test("without an earned transition, complete-lineage eligibility overlays unchanged recovery-v3 custody", () => {
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(VALUES.disconnected, Object.values(VALUES), SELECTION_QUALITY),
		materialized: MATERIALIZED,
		roleObligations: OBLIGATIONS,
		acceptedTransitionHypothesisIds: [],
	})

	assert.equal(result.transitionRescue.promoted, true)
	assert.equal(result.transitionRescue.winnerKey, completeTreatmentKey(VALUES.ordinary))
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(VALUES.lineage))
	assert.equal(result.diagnostics.lineageReplacement, true)
	assert.equal(result.diagnostics.transitionPromoted, false)
	assert.equal(result.diagnostics.custodyKeys[0], completeTreatmentKey(VALUES.disconnected))
	assert.deepEqual(result.diagnostics.slateKeys, [
		completeTreatmentKey(VALUES.lineage),
		...result.diagnostics.custodyKeys.filter((key) => key !== completeTreatmentKey(VALUES.lineage)),
	].slice(0, 8))
	assert.equal(result.custody.selected[0].selectionKind, "winner")
})

test("unchanged winner is an exact recovery-v3 custody no-op", () => {
	const result = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(VALUES.lineage, [VALUES.lineage, VALUES.ordinary], SELECTION_QUALITY),
		materialized: [MATERIALIZED[1], MATERIALIZED[2]],
		roleObligations: [],
		acceptedTransitionHypothesisIds: [],
	})

	assert.equal(result.diagnostics.lineageReplacement, false)
	assert.equal(result.diagnostics.transitionPromoted, false)
	assert.deepEqual(result.diagnostics.slateKeys, result.diagnostics.custodyKeys)
})

function raster(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

function mixRgb(first: RGB, second: RGB, amount: number): RGB {
	return [
		clampByte(first[0] + (second[0] - first[0]) * amount),
		clampByte(first[1] + (second[1] - first[1]) * amount),
		clampByte(first[2] + (second[2] - first[2]) * amount),
	]
}

function curvedSupportedField(): RawImage {
	const first: RGB = [31, 52, 137]
	const middle: RGB = [40, 174, 151]
	const last: RGB = [221, 170, 58]
	return raster(112, 68, (x, y) => {
		const amount = Math.max(0, Math.min(1, x / 111 + 0.025 * Math.sin(Math.PI * y / 67)))
		return amount < 0.5
			? mixRgb(first, middle, amount * 2)
			: mixRgb(middle, last, amount * 2 - 1)
	})
}

function directSupportedField(first: RGB, second: RGB): RawImage {
	const firstLab = rgbToOKLab(first)
	const secondLab = rgbToOKLab(second)
	return raster(112, 68, (x) => oklabToRGB(mixOKLab(firstLab, secondLab, x / 111)))
}

function promotedTransitionSelection(
	hypothesisId: string,
	exactFlatSourceConnected?: boolean,
) {
	const earned = { ...VALUES.earned, sourceFieldHypothesisId: hypothesisId }
	const candidate = materialized(earned, "native-field-transition")
	const exactFlat: CompletePaletteTreatment | null = exactFlatSourceConnected === undefined
		? null
		: {
			...earned,
			id: `flat-sibling:${earned.id}`,
			gradient: false,
			fieldTreatment: "separate-flat-fields",
			gradientEvidence: null,
		}
	const exactCandidate = exactFlat === null
		? null
		: materialized(exactFlat, "native-field-transition", exactFlatSourceConnected)
	const domain = [
		MATERIALIZED[0],
		MATERIALIZED[1],
		MATERIALIZED[2],
		candidate,
		...exactCandidate === null ? [] : [exactCandidate],
	]
	const selection = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(
			VALUES.disconnected,
			domain.map(({ treatment: value }) => value),
			SELECTION_QUALITY,
		),
		materialized: domain,
		roleObligations: [
			obligation("ordinary-copy", VALUES.ordinary, "foreground"),
			obligation("ordinary-mark", VALUES.ordinary, "accent"),
			obligation("earned-copy", earned, "foreground"),
		],
		acceptedTransitionHypothesisIds: [hypothesisId],
	})
	assert.equal(selection.diagnostics.transitionPromoted, true)
	assert.equal(selection.winner.sourceFieldHypothesisId, hypothesisId)
	return { earned, candidate, exactFlat, exactCandidate, domain, selection }
}

test("reviewed three-stop authority retains exact midpoint custody without changing the public treatment", () => {
	const arm = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(curvedSupportedField())
	assert.equal(arm.midpoint.kind, "source-supported-three-stop")
	assert.ok(arm.hypothesis)
	const promoted = promotedTransitionSelection(arm.hypothesis.id)
	const applied = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: arm,
	})

	assert.equal(applied.selection, promoted.selection)
	assert.equal(applied.diagnostics.strictVetoApplied, false)
	assert.deepEqual(applied.diagnostics.midpoint, arm.midpoint)
	assert.equal(applied.selection.winner.gradient, true)
	assert.deepEqual(
		(["background", "surface", "foreground", "accent"] as const).map((role) =>
			applied.selection.winner[role]),
		(["background", "surface", "foreground", "accent"] as const).map((role) =>
			promoted.selection.winner[role]),
	)
})

function rejectedSupportedGradientPath() {
	const arm = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
		directSupportedField([34, 52, 142], [212, 164, 48]),
	)
	const rejectedPath = arm.diagnostics.paths.find(({ strictTransitionEligible, eligible, hypothesisId }) =>
		strictTransitionEligible && !eligible && hypothesisId !== null)
	assert.ok(rejectedPath?.hypothesisId)
	return { arm, hypothesisId: rejectedPath.hypothesisId }
}

test("strict flat veto accepts an exact sibling only with canonical source-connected complete lineage", () => {
	const rejected = rejectedSupportedGradientPath()
	const promoted = promotedTransitionSelection(rejected.hypothesisId, true)
	assert.ok(promoted.exactFlat)
	const exactKey = completeTreatmentKey(promoted.exactFlat)
	const exactLineage = promoted.selection.completeLineage.eligibility.diagnostics.candidates
		.find(({ key }) => key === exactKey)
	assert.equal(exactLineage?.eligible, true)
	assert.equal(exactLineage?.basis, "ordinary-complete-source-lineage")

	const exact = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: rejected.arm,
	})
	assert.equal(exact.selection.winner, promoted.exactFlat)
	assert.equal(exact.diagnostics.strictVetoApplied, true)
	assert.equal(exact.diagnostics.projectedFlatSibling, false)
	assert.equal(exact.diagnostics.flatCustody?.kind, "existing-exact-role-sibling")
	assert.equal(exact.diagnostics.flatCustody?.sourceConnected, true)
	assert.deepEqual(exact.diagnostics.flatCustody?.sourceTypes, ["native-field-transition"])
	assert.equal(exact.selection.diagnostics.winnerLineageBasis, exactLineage?.basis)
	assert.equal(exact.selection.diagnostics.winnerKey, exactKey)
	assert.equal(exact.selection.diagnostics.slateKeys[0], exactKey)
})

test("strict flat veto rejects an unconnected ineligible exact sibling and projects from the gradient source", () => {
	const rejected = rejectedSupportedGradientPath()
	const promoted = promotedTransitionSelection(rejected.hypothesisId, false)
	assert.ok(promoted.exactFlat)
	const exactKey = completeTreatmentKey(promoted.exactFlat)
	const exactLineage = promoted.selection.completeLineage.eligibility.diagnostics.candidates
		.find(({ key }) => key === exactKey)
	assert.equal(exactLineage?.eligible, false)
	assert.equal(exactLineage?.basis, "ineligible")

	const projected = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: rejected.arm,
	})
	assert.notEqual(projected.selection.winner, promoted.exactFlat)
	assert.equal(projected.selection.winner.gradient, false)
	assert.equal(projected.selection.winner.fieldTreatment, "separate-flat-fields")
	assert.equal(projected.selection.winner.gradientEvidence, null)
	assert.equal(projected.selection.winner.sourceFieldHypothesisId,
		promoted.selection.winner.sourceFieldHypothesisId)
	for (const role of ["background", "surface", "foreground", "accent"] as const) {
		assert.equal(projected.selection.winner[role], promoted.selection.winner[role])
	}
	assert.equal(projected.diagnostics.projectedFlatSibling, true)
	assert.deepEqual(projected.diagnostics.midpoint,
		{ kind: "none", position: null, color: null, provenance: null })
	assert.deepEqual(projected.diagnostics.flatCustody, {
		kind: "source-connected-flat-projection",
		sourceConnected: true,
		sourceTypes: ["native-field-transition"],
		sourceFieldHypothesisId: promoted.selection.winner.sourceFieldHypothesisId,
		roleBinding: "same-four-roles",
		hypothesisBinding: "same-source-field-hypothesis",
	})
	assert.equal(projected.selection.diagnostics.winnerLineageBasis,
		promoted.selection.diagnostics.winnerLineageBasis)
	assert.equal(projected.selection.diagnostics.slateKeys[0], projected.diagnostics.winnerKey)
	assert.equal(projected.selection.slate.some(({ gradient, sourceFieldHypothesisId }) =>
		gradient && sourceFieldHypothesisId === promoted.selection.winner.sourceFieldHypothesisId), false)
})

test("source-connected same-hypothesis flat projection has deterministic winner-first custody diagnostics", () => {
	const rejected = rejectedSupportedGradientPath()
	const promoted = promotedTransitionSelection(rejected.hypothesisId)
	const apply = (materializedDomain: typeof promoted.domain) =>
		applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
			selection: promoted.selection,
			materialized: materializedDomain,
			supportedGradientPath: rejected.arm,
		})
	const first = apply(promoted.domain)
	const second = apply([...promoted.domain].reverse())
	const slateKeys = first.selection.slate.map(completeTreatmentKey)

	assert.deepEqual(first, second)
	assert.deepEqual(slateKeys, first.selection.diagnostics.slateKeys)
	assert.equal(slateKeys[0], first.diagnostics.winnerKey)
	assert.equal(new Set(slateKeys).size, slateKeys.length)
	assert.equal(slateKeys.includes(first.diagnostics.baselineWinnerKey), false)
	assert.equal(first.diagnostics.projectedFlatSibling, true)
	assert.equal(first.diagnostics.flatCustody?.sourceConnected, true)
	assert.equal(first.diagnostics.flatCustody?.hypothesisBinding, "same-source-field-hypothesis")
	assert.equal(first.diagnostics.flatCustody?.sourceFieldHypothesisId,
		promoted.selection.winner.sourceFieldHypothesisId)
})

test("ordinary supported gradients and irrelevant selections are exact public no-ops", () => {
	const ordinaryArm = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(
		directSupportedField([24, 54, 106], [113, 176, 230]),
	)
	assert.equal(ordinaryArm.midpoint.kind, "ordinary-two-stop")
	assert.ok(ordinaryArm.hypothesis)
	const promoted = promotedTransitionSelection(ordinaryArm.hypothesis.id)
	const ordinary = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: ordinaryArm,
	})
	assert.equal(ordinary.selection, promoted.selection)
	assert.equal(ordinary.diagnostics.midpoint.kind, "ordinary-two-stop")

	const irrelevantSelection = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2: recoverySelection(VALUES.lineage, [VALUES.lineage, VALUES.ordinary], SELECTION_QUALITY),
		materialized: [MATERIALIZED[1], MATERIALIZED[2]],
		roleObligations: [],
		acceptedTransitionHypothesisIds: [],
	})
	const irrelevant = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: irrelevantSelection,
		materialized: [MATERIALIZED[1], MATERIALIZED[2]],
		supportedGradientPath: ordinaryArm,
	})
	assert.equal(irrelevant.selection, irrelevantSelection)
	assert.equal(irrelevant.diagnostics.selectedTransitionGradient, false)
	assert.deepEqual(irrelevant.diagnostics.midpoint,
		{ kind: "none", position: null, color: null, provenance: null })
})

test("supported-gradient custody does not extend the public boolean and four-role contract", () => {
	const arm = buildAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(curvedSupportedField())
	assert.ok(arm.hypothesis)
	const promoted = promotedTransitionSelection(arm.hypothesis.id)
	const first = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: arm,
	})
	const second = applyAlbumArtworkPaletteV2Phase3IntegratedSupportedGradientAuthority({
		selection: promoted.selection,
		materialized: promoted.domain,
		supportedGradientPath: arm,
	})
	assert.equal(typeof first.selection.winner.gradient, "boolean")
	assert.equal("midpoint" in first.selection.winner, false)
	assert.deepEqual(Object.keys({
		background: first.selection.winner.background,
		surface: first.selection.winner.surface,
		foreground: first.selection.winner.foreground,
		accent: first.selection.winner.accent,
	}), ["background", "surface", "foreground", "accent"])
	assert.deepEqual(first, second)
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

test("the separately registered attempt composes normalized transitions with bounded winner-first custody deterministically", () => {
	const first = extractAlbumArtworkPaletteV2Phase3IntegratedCandidate(transitionField())
	const second = extractAlbumArtworkPaletteV2Phase3IntegratedCandidate(transitionField())
	const diagnostics = first.diagnostics.phase3IntegratedCandidate

	assert.equal(first.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID)
	assert.equal(first.protocol, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID)
	assert.equal(completeTreatmentKey(first.alternatives[0]), completeTreatmentKey(first.winner))
	assert.ok(first.alternatives.length >= 1 && first.alternatives.length <= 8)
	assert.ok(diagnostics.transitionEnvelope.creditedHypothesisCount > 0)
	assert.equal(diagnostics.domain.logicalDescriptorCount,
		diagnostics.domain.seedDescriptorCount + diagnostics.domain.supplementalDescriptorCount)
	assert.ok(diagnostics.selection.qualityLossFromUnrestrictedWinner <= 0.12)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId,
		"phase-3-integrated-candidate")
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.configurationId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID)
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "integrated-candidate-test",
		"--case", "development-03",
		"--attempt", "phase-3-integrated-candidate",
	]), {
		iterationId: "integrated-candidate-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-integrated-candidate"],
	})
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "parallel-arm-registration-test",
		"--case", "development-03",
		"--attempt", "phase-3-recovery-v4",
		"--attempt", "phase-3-arm-additive-role-domain",
		"--attempt", "phase-3-arm-balanced-materialization",
		"--attempt", "phase-3-arm-earned-gradient-challenger",
		"--attempt", "phase-3-arm-complete-lineage-winner",
	]), {
		iterationId: "parallel-arm-registration-test",
		caseIds: ["development-03"],
		attemptIds: [
			"phase-3-recovery-v4",
			"phase-3-arm-additive-role-domain",
			"phase-3-arm-balanced-materialization",
			"phase-3-arm-earned-gradient-challenger",
			"phase-3-arm-complete-lineage-winner",
		],
	})
})

test("integrated inference has no source identity, outcome, known-color, or treatment-key dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|manifest|target.?color|historical)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
})
