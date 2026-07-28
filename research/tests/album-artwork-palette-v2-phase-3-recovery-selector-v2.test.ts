import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
} from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	GradientFieldEvidence,
	PaletteRoleColor,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RGB } from "../src/types.ts"

const DEFAULT_SCORES: CompletePaletteScores = Object.freeze({
	fieldFidelity: 0.72,
	surfaceFidelity: 0.72,
	fieldStructure: 0.72,
	fieldIdentity: 0.72,
	treatmentFoundation: 0.72,
	activeRolePathObservability: 1,
	artworkIdentity: 0.72,
	representativeness: 0.72,
	uiUtility: 0.72,
	foregroundUtility: 0.72,
	foregroundPolarityAgreement: 1,
	accentFidelity: 0.72,
	accentUtility: 0.72,
	coherence: 0.72,
	economy: 0.72,
	generatorConfidence: 0.72,
	foundation: 0.72,
	balance: 0.72,
	generatedPenalty: 0,
	rankingScore: 0.72,
})

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
			perceptualDensity: 0.8,
			totalSupport: 0.12,
			connectedSupport: 0.10,
			spatialCoverage: 0.75,
			concentration: 0.8,
			prototypeDistance: 0.01,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

function gradientEvidence(
	backgroundFamily: string,
	surfaceFamily: string,
): GradientFieldEvidence {
	return {
		topology: "linear",
		direction: "horizontal",
		endpointBands: [0.15, 0.85],
		progression: 0.82,
		modeProgression: 0.72,
		monotonicity: 0.88,
		residual: 0.02,
		span: 0.24,
		texture: 0.02,
		bandDispersion: 0.08,
		edgeContinuity: 0.84,
		coverage: 0.76,
		supportingFamilyIds: [backgroundFamily, surfaceFamily],
		supportingEndpointHexes: ["#183060", "#b07040"],
		backgroundTopologyEndpoint: "low",
		roleAssignment: {
			backgroundFamilyId: backgroundFamily,
			surfaceFamilyId: surfaceFamily,
			backgroundProfile: {
				frameCoverage: 1,
				peripheralCoverage: 1,
				connectedCoverage: 1,
				fieldScore: 1,
				populationCoverage: 1,
				evidenceLevels: [25, 25, 25, 25, 25],
			},
			surfaceProfile: {
				frameCoverage: 0.5,
				peripheralCoverage: 0.5,
				connectedCoverage: 0.5,
				fieldScore: 0.5,
				populationCoverage: 0.5,
				evidenceLevels: [12, 12, 12, 12, 12],
			},
			decisiveCriterion: "frameCoverage",
			confidence: 0.5,
		},
		fieldDomainId: "generic-gradient-domain",
		fieldDomainPopulationFraction: 0.7,
		fieldDomainBorderCoverage: 0.8,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: ["generic-field-component"],
	}
}

type TreatmentOptions = Readonly<{
	background?: string
	surface?: string
	foreground?: string
	accent?: string
	backgroundFamily?: string
	surfaceFamily?: string
	foregroundFamily?: string
	accentFamily?: string
	fieldHypothesisId?: string
	gradient?: boolean
	scores?: Partial<CompletePaletteScores>
}>

function treatment(label: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const background = options.background ?? "#183060"
	const surface = options.surface ?? "#b07040"
	const foreground = options.foreground ?? "#f0f0f0"
	const accent = options.accent ?? "#e0a020"
	const backgroundFamily = options.backgroundFamily ?? "generic-field-a"
	const surfaceFamily = options.surfaceFamily ?? "generic-field-b"
	const foregroundFamily = options.foregroundFamily ?? `generic-foreground-${label}`
	const accentFamily = options.accentFamily ?? `generic-accent-${label}`
	const gradient = options.gradient ?? false
	const pairs = [
		...([62, 58, 54] as const).map((signedLc, position) => ({
			role: "foreground" as const,
			fieldRole: gradient ? "gradient-sample" as const : "background" as const,
			position: position / 2,
			signedLc,
			absoluteLc: Math.abs(signedLc),
		})),
		...([48, 44, 40] as const).map((signedLc, position) => ({
			role: "accent" as const,
			fieldRole: gradient ? "gradient-sample" as const : "surface" as const,
			position: position / 2,
			signedLc,
			absoluteLc: Math.abs(signedLc),
		})),
	]
	return {
		id: `generic-treatment-${label}`,
		background: roleColor(background, backgroundFamily),
		surface: roleColor(surface, surfaceFamily),
		foreground: roleColor(foreground, foregroundFamily),
		accent: roleColor(accent, accentFamily),
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: options.fieldHypothesisId ?? `generic-field-${label}`,
		familyRoles: {
			background: backgroundFamily,
			surface: surfaceFamily,
			foreground: foregroundFamily,
			accent: accentFamily,
		},
		cardinality: 4,
		collapse: { surface: false, accent: false },
		contrast: {
			pairs,
			minimumAbsoluteLc: Math.min(...pairs.map(({ absoluteLc }) => absoluteLc)),
			meanAbsoluteLc: pairs.reduce((sum, { absoluteLc }) => sum + absoluteLc, 0) / pairs.length,
		},
		scores: { ...DEFAULT_SCORES, ...options.scores },
		gradientEvidence: gradient ? gradientEvidence(backgroundFamily, surfaceFamily) : null,
	}
}

function evaluation(
	selection: ReturnType<typeof selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2>,
	value: CompletePaletteTreatment,
) {
	return selection.evaluations.find(({ key }) => key === completeTreatmentKey(value))!
}

test("recovery selector v2 is permutation-invariant with a winner-first bounded slate", () => {
	assert.equal(Object.values(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights,
	).reduce((sum, weight) => sum + weight, 0), 1)
	const values = Array.from({ length: 12 }, (_, index) => treatment(`slate-${index}`, {
		background: `#${(16 + index * 16).toString(16).padStart(2, "0")}2040`,
		surface: `#80${(32 + index * 16).toString(16).padStart(2, "0")}30`,
		foreground: `#${(245 - index * 12).toString(16).padStart(2, "0")}e8e0`,
		accent: `#d0${(32 + index * 16).toString(16).padStart(2, "0")}20`,
		backgroundFamily: `field-a-${index}`,
		surfaceFamily: `field-b-${index}`,
	}))
	const forward = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(values)
	const reversed = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([...values].reverse())

	assert.equal(completeTreatmentKey(forward.winner), completeTreatmentKey(forward.slate[0]))
	assert.ok(forward.slate.length >= 1 && forward.slate.length <= 8)
	assert.equal(forward.slate.length, 8)
	assert.equal(new Set(forward.slate.map(completeTreatmentKey)).size, forward.slate.length)
	assert.equal(completeTreatmentKey(reversed.winner), completeTreatmentKey(forward.winner))
	assert.deepEqual(reversed.slate.map(completeTreatmentKey), forward.slate.map(completeTreatmentKey))
	assert.deepEqual(reversed.explanation, forward.explanation)
})

test("a flat field with no gradient claim has zero rendered-gradient salience", () => {
	const flat = treatment("ordinary-flat")
	const selection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([flat])
	const flatEvaluation = evaluation(selection, flat)

	assert.equal(flatEvaluation.gradientStatus, "not-applicable")
	assert.equal(flatEvaluation.quality.renderedGradientSalience, 0)
})

test("an earned gradient marks its exact flat counterpart missing across hypothesis IDs", () => {
	const earned = treatment("earned", {
		gradient: true,
		fieldHypothesisId: "generic-earned-field",
		foregroundFamily: "generic-copy",
		accentFamily: "generic-mark",
	})
	const flat = treatment("flat-counterpart", {
		fieldHypothesisId: "generic-independent-flat-field",
		foregroundFamily: "generic-copy",
		accentFamily: "generic-mark",
	})
	const selection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([flat, earned])
	const earnedEvaluation = evaluation(selection, earned)
	const flatEvaluation = evaluation(selection, flat)

	assert.equal(earnedEvaluation.gradientStatus, "earned-rendered")
	assert.equal(flatEvaluation.gradientStatus, "missing")
	assert.ok(earnedEvaluation.quality.renderedGradientSalience > 0)
	assert.equal(flatEvaluation.quality.renderedGradientSalience, 0)
	assert.equal(flatEvaluation.paretoMember, false)
	assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(earned))
})

test("surface fidelity, artwork identity, and accent fidelity each affect ordering", () => {
	for (const axis of ["surfaceFidelity", "artworkIdentity", "accentFidelity"] as const) {
		const weaker = treatment(`${axis}-weaker`, {
			background: "#193161",
			foregroundFamily: "generic-copy",
			accentFamily: "generic-mark",
			scores: { [axis]: 0.56 },
		})
		const stronger = treatment(`${axis}-stronger`, {
			background: "#1a3262",
			foregroundFamily: "generic-copy",
			accentFamily: "generic-mark",
			scores: { [axis]: 0.88 },
		})
		const selection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([weaker, stronger])
		assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(stronger), axis)
		assert.equal(evaluation(selection, weaker).paretoMember, false, axis)
	}
})

test("identity cannot block quality dominance and remains only a bounded ordering gain", () => {
	const qualityDominant = treatment("quality-dominant", {
		background: "#193161",
		foregroundFamily: "generic-other",
		accentFamily: "generic-mark",
		scores: {
			fieldFidelity: 0.88,
			surfaceFidelity: 0.88,
			artworkIdentity: 0.88,
			representativeness: 0.88,
			foregroundUtility: 0.88,
			accentFidelity: 0.88,
			accentUtility: 0.88,
			coherence: 0.88,
			economy: 0.88,
		},
	})
	const dominatedCarrier = treatment("dominated-carrier", {
		background: "#1a3262",
		foreground: "#eeeeee",
		foregroundFamily: "generic-signature",
		accentFamily: "generic-mark",
		scores: {
			fieldFidelity: 0.56,
			surfaceFidelity: 0.56,
			artworkIdentity: 0.56,
			representativeness: 0.56,
			foregroundUtility: 0.56,
			accentFidelity: 0.56,
			accentUtility: 0.56,
			coherence: 0.56,
			economy: 0.56,
		},
	})
	const identity = { obligations: [{ familyId: "generic-signature", priority: 0 }] }
	const dominatedSelection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		[dominatedCarrier, qualityDominant],
		identity,
	)
	assert.equal(evaluation(dominatedSelection, dominatedCarrier).paretoMember, false)
	assert.equal(completeTreatmentKey(dominatedSelection.winner), completeTreatmentKey(qualityDominant))

	const identityTradeoff = treatment("identity-tradeoff", {
		background: "#1b3363",
		foreground: "#ededed",
		foregroundFamily: "generic-signature",
		accentFamily: "generic-mark",
		scores: { fieldFidelity: 0.76 },
	})
	const qualityTradeoff = treatment("quality-tradeoff", {
		background: "#1c3464",
		foregroundFamily: "generic-other",
		accentFamily: "generic-mark",
		scores: { representativeness: 0.92, economy: 0.80 },
	})
	const tradeoffSelection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		[qualityTradeoff, identityTradeoff],
		identity,
	)
	const identityEvaluation = evaluation(tradeoffSelection, identityTradeoff)
	const qualityEvaluation = evaluation(tradeoffSelection, qualityTradeoff)

	assert.ok(identityEvaluation.paretoMember && qualityEvaluation.paretoMember)
	assert.ok(identityEvaluation.qualityUtility < qualityEvaluation.qualityUtility)
	assert.equal(identityEvaluation.identityGain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumIdentityGain)
	assert.ok(identityEvaluation.identityGain <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumIdentityGain)
	assert.equal(completeTreatmentKey(tradeoffSelection.winner), completeTreatmentKey(identityTradeoff))
})

test("recovery selector v2 inference has no external outcome or identity-specific dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical|comment|rankingScore)/iu)
	assert.doesNotMatch(source,
		/(?:anchorPrefix|forcedReservation|fallbackTreatment|closedDetails\.result\.(?:winner|alternatives))/iu)
	assert.doesNotMatch(source, /treatment\.id/u)
})
