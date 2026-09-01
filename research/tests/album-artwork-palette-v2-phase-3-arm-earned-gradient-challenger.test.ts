import assert from "node:assert/strict"
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
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger,
} from "../src/album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger-attempt.ts"
import {
	selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger,
} from "../src/album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger.ts"
import type {
	AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerInput,
} from "../src/album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RGB, RawImage } from "../src/types.ts"

const DEFAULT_SCORES: CompletePaletteScores = Object.freeze({
	fieldFidelity: 0.8,
	surfaceFidelity: 0.8,
	fieldStructure: 0.8,
	fieldIdentity: 0.8,
	treatmentFoundation: 0.8,
	activeRolePathObservability: 1,
	artworkIdentity: 0.8,
	representativeness: 0.8,
	uiUtility: 0.8,
	foregroundUtility: 0.8,
	foregroundPolarityAgreement: 1,
	accentFidelity: 0.8,
	accentUtility: 0.8,
	coherence: 0.8,
	economy: 0.8,
	generatorConfidence: 0.8,
	foundation: 0.8,
	balance: 0.8,
	generatedPenalty: 0,
	rankingScore: 0.8,
})

const DEFAULT_QUALITY: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality = Object.freeze({
	fieldFidelity: 0.8,
	surfaceFidelity: 0.8,
	artworkIdentity: 0.8,
	representativeness: 0.8,
	sourceSupport: 0.8,
	renderedGradientSalience: 0,
	foregroundPath: 0.8,
	accentFidelity: 0.8,
	accentPath: 0.8,
	coherence: 0.8,
	economy: 0.8,
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
			connectedSupport: 0.1,
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
	background: string,
	surface: string,
): GradientFieldEvidence {
	return {
		topology: "linear",
		direction: "horizontal",
		endpointBands: [0.15, 0.85],
		progression: 0.84,
		modeProgression: 0.76,
		monotonicity: 0.9,
		residual: 0.02,
		span: 0.24,
		texture: 0.02,
		bandDispersion: 0.08,
		edgeContinuity: 0.86,
		coverage: 0.78,
		supportingFamilyIds: [backgroundFamily, surfaceFamily],
		supportingEndpointHexes: [background, surface],
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
		fieldDomainId: `domain:${backgroundFamily}:${surfaceFamily}`,
		fieldDomainPopulationFraction: 0.7,
		fieldDomainBorderCoverage: 0.8,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: [`component:${backgroundFamily}`, `component:${surfaceFamily}`],
	}
}

type TreatmentOptions = Readonly<{
	gradient?: boolean
	background?: string
	surface?: string
	foreground?: string
	accent?: string
	foregroundFamily?: string
	accentFamily?: string
	collapseSurface?: boolean
	collapseAccent?: boolean
}>

function treatment(label: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const gradient = options.gradient ?? false
	const background = options.background ?? "#183060"
	const surface = options.surface ?? "#985050"
	const foreground = options.foreground ?? "#f0f0f0"
	const accent = options.accent ?? "#e0a020"
	const backgroundFamily = `field-a:${label}`
	const surfaceFamily = `field-b:${label}`
	const foregroundFamily = options.foregroundFamily ?? "copy"
	const accentFamily = options.accentFamily ?? "mark"
	return {
		id: `treatment:${label}`,
		background: roleColor(background, backgroundFamily),
		surface: roleColor(surface, surfaceFamily),
		foreground: roleColor(foreground, foregroundFamily),
		accent: roleColor(accent, accentFamily),
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: `field:${label}`,
		familyRoles: {
			background: backgroundFamily,
			surface: surfaceFamily,
			foreground: foregroundFamily,
			accent: accentFamily,
		},
		cardinality: 4,
		collapse: {
			surface: options.collapseSurface ?? false,
			accent: options.collapseAccent ?? false,
		},
		contrast: {
			pairs: [
				{ role: "foreground", fieldRole: "background", position: 0, signedLc: 60, absoluteLc: 60 },
				{ role: "accent", fieldRole: "surface", position: 1, signedLc: 44, absoluteLc: 44 },
			],
			minimumAbsoluteLc: 44,
			meanAbsoluteLc: 52,
		},
		scores: DEFAULT_SCORES,
		gradientEvidence: gradient
			? gradientEvidence(backgroundFamily, surfaceFamily, background, surface)
			: null,
	}
}

function evaluation(
	value: CompletePaletteTreatment,
	options: Readonly<{
		gradientStatus?: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["gradientStatus"]
		quality?: Partial<AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality>
	}> = {},
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation {
	const quality = { ...DEFAULT_QUALITY, ...options.quality }
	const qualityUtility = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
		.reduce((sum, axis) => sum +
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights[axis] * quality[axis], 0)
	const key = completeTreatmentKey(value)
	return {
		key,
		structuralKey: `${key}:${value.id}`,
		treatment: value,
		gradientStatus: options.gradientStatus ?? (value.gradient ? "earned-rendered" : "not-applicable"),
		quality,
		evidenceLevels: Object.fromEntries(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES.map((axis) =>
				[axis, Math.floor((quality[axis] + 1e-12) / 0.04)]),
		) as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["evidenceLevels"],
		qualityUtility,
		identityCoverage: 0,
		identityGain: 0,
		identityRoles: [],
		relationUtility: qualityUtility,
		paretoMember: true,
		dominatedByKey: null,
	}
}

function materialized(
	value: CompletePaletteTreatment,
	sourceConnected = true,
): AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate {
	const descriptor = {
		sourceType: "native-field-transition",
		treatment: value,
		fieldHypothesis: {},
		lineage: {
			fieldHypothesisId: value.sourceFieldHypothesisId,
			fieldDirectionKey: `field-direction:${value.id}`,
			roleDirectionKeys: [],
			familyIds: Object.values(value.familyRoles),
			representatives: [],
			sourceConnected,
		},
	} as unknown as AlbumArtworkPaletteV2Phase3LogicalDescriptor
	return {
		key: completeTreatmentKey(value),
		treatment: value,
		descriptors: [descriptor],
	}
}

function challengerInput(
	baseline: CompletePaletteTreatment,
	entries: readonly Readonly<{
		treatment: CompletePaletteTreatment
		gradientStatus?: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["gradientStatus"]
		quality?: Partial<AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality>
		sourceConnected?: boolean
	}>[],
	slate: readonly CompletePaletteTreatment[] = [baseline],
): AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerInput {
	const evaluations = [
		evaluation(baseline, {
			gradientStatus: baseline.gradient ? "earned-rendered" : "not-applicable",
			quality: { renderedGradientSalience: baseline.gradient ? 0.72 : 0 },
		}),
		...entries.map((entry) => evaluation(entry.treatment, {
			gradientStatus: entry.gradientStatus,
			quality: {
				renderedGradientSalience: entry.treatment.gradient ? 0.68 : 0,
				...entry.quality,
			},
		})),
	]
	const recoveryV2 = {
		winner: baseline,
		slate: [baseline],
		evaluations,
		explanation: {},
	} as unknown as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	const recoveryV3 = {
		winner: baseline,
		slate,
		diagnostics: {},
	} as unknown as AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection
	return {
		recoveryV2,
		recoveryV3,
		materialized: [
			materialized(baseline),
			...entries.map((entry) => materialized(entry.treatment, entry.sourceConnected ?? true)),
		],
	}
}

function candidateDiagnostic(
	result: ReturnType<typeof selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger>,
	value: CompletePaletteTreatment,
) {
	return result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(value))!
}

function transitionField(): RawImage {
	const width = 36
	const height = 24
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

test("an earned source-connected gradient can replace a flat winner without constructing a treatment", () => {
	const baseline = treatment("positive-baseline")
	const lowerSalience = treatment("positive-lower-salience", {
		gradient: true,
		background: "#294070",
		surface: "#a06048",
	})
	const selected = treatment("positive-selected", {
		gradient: true,
		background: "#163870",
		surface: "#b06840",
	})
	const baselineSlate = [baseline, lowerSalience]
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(challengerInput(baseline, [
		{ treatment: lowerSalience, quality: { renderedGradientSalience: 0.61, fieldFidelity: 0.92 } },
		{ treatment: selected, quality: { renderedGradientSalience: 0.76, fieldFidelity: 0.78 } },
	], baselineSlate))

	assert.strictEqual(result.winner, selected)
	assert.strictEqual(result.slate[0], selected)
	assert.strictEqual(result.slate[1], baseline)
	assert.ok(result.slate.length <= 8)
	assert.equal(result.diagnostics.outcome.reason, "eligible-challenger-selected")
	assert.deepEqual(result.diagnostics.eligibleChallengerKeysInOrder, [
		completeTreatmentKey(selected),
		completeTreatmentKey(lowerSalience),
	])
	const diagnostic = candidateDiagnostic(result, selected)
	assert.equal(diagnostic.eligible, true)
	assert.equal(diagnostic.sourceConnectedCompleteDescriptorLineageCount, 1)
	assert.ok(diagnostic.renderedGradientSalience > 0)
	assert.ok(diagnostic.baseQualityLoss <= 0.06)
})

test("replacement preserves winner-first custody at the eight-treatment bound", () => {
	const baseline = treatment("capacity-baseline")
	const challenger = treatment("capacity-challenger", {
		gradient: true,
		background: "#102030",
		surface: "#8090a0",
	})
	const reserves = [
		treatment("capacity-reserve-1", { background: "#213040", surface: "#8190a0" }),
		treatment("capacity-reserve-2", { background: "#223040", surface: "#8290a0" }),
		treatment("capacity-reserve-3", { background: "#233040", surface: "#8390a0" }),
		treatment("capacity-reserve-4", { background: "#243040", surface: "#8490a0" }),
		treatment("capacity-reserve-5", { background: "#253040", surface: "#8590a0" }),
		treatment("capacity-reserve-6", { background: "#263040", surface: "#8690a0" }),
		treatment("capacity-reserve-7", { background: "#273040", surface: "#8790a0" }),
	]
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(challengerInput(
		baseline,
		[{ treatment: challenger }, ...reserves.map((value) => ({ treatment: value }))],
		[baseline, ...reserves],
	))

	assert.strictEqual(result.slate[0], challenger)
	assert.equal(result.slate.length, 8)
	assert.deepEqual(result.slate.slice(1), [baseline, ...reserves.slice(0, 6)])
	assert.equal(result.diagnostics.outcome.displacedBaselineSlateKey,
		completeTreatmentKey(reserves[6]))
})

test("salience ties order by field fidelity, quality, and then canonical key", () => {
	const baseline = treatment("ordering-baseline")
	const canonicalFirst = treatment("ordering-canonical-first", {
		gradient: true,
		background: "#102040",
		surface: "#8090a0",
	})
	const canonicalSecond = treatment("ordering-canonical-second", {
		gradient: true,
		background: "#202040",
		surface: "#8090a0",
	})
	const betterQuality = treatment("ordering-quality", {
		gradient: true,
		background: "#302040",
		surface: "#8090a0",
	})
	const betterField = treatment("ordering-field", {
		gradient: true,
		background: "#402040",
		surface: "#8090a0",
	})
	const entries = [
		{ treatment: canonicalSecond, quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.82 } },
		{ treatment: canonicalFirst, quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.82 } },
		{
			treatment: betterQuality,
			quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.82, coherence: 0.82 },
		},
		{ treatment: betterField, quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.84 } },
	]
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(
		challengerInput(baseline, entries),
	)

	assert.strictEqual(result.winner, betterField)
	assert.deepEqual(result.diagnostics.eligibleChallengerKeysInOrder, [
		completeTreatmentKey(betterField),
		completeTreatmentKey(betterQuality),
		completeTreatmentKey(canonicalFirst),
		completeTreatmentKey(canonicalSecond),
	])
})

test("hard-split, stripe, object-local, unearned, and inconsequential gradients are rejected", () => {
	const baseline = treatment("field-negative-baseline")
	const hardSplit = treatment("hard-split", { gradient: true, background: "#102030", surface: "#e0d0c0" })
	const stripe = treatment("stripe", { gradient: true, background: "#203040", surface: "#d0c0b0" })
	const objectLocal = treatment("object-local", { gradient: true, background: "#304050", surface: "#c0b0a0" })
	const unearned = treatment("unearned", { gradient: true, background: "#405060", surface: "#b0a090" })
	const inconsequential = treatment("inconsequential", {
		gradient: true,
		background: "#506070",
		surface: "#a09080",
	})
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(challengerInput(baseline, [
		{ treatment: hardSplit, gradientStatus: "unearned" },
		{ treatment: stripe, gradientStatus: "unearned" },
		{ treatment: objectLocal, gradientStatus: "unearned" },
		{ treatment: unearned, gradientStatus: "unearned" },
		{
			treatment: inconsequential,
			gradientStatus: "earned-rendered",
			quality: { renderedGradientSalience: 0 },
		},
	]))

	assert.strictEqual(result.winner, baseline)
	for (const value of [hardSplit, stripe, objectLocal, unearned]) {
		assert.ok(candidateDiagnostic(result, value).rejectionReasons
			.includes("gradient-status-is-not-earned-rendered"))
	}
	assert.ok(candidateDiagnostic(result, inconsequential).rejectionReasons
		.includes("rendered-gradient-salience-is-not-positive"))
	assert.equal(result.diagnostics.domain.eligibleChallengerCount, 0)
})

test("disconnected lineage, role changes, collapse changes, and excess quality losses are rejected", () => {
	const baseline = treatment("guard-negative-baseline")
	const disconnected = treatment("disconnected", { gradient: true, background: "#112030", surface: "#8190a0" })
	const roleSwap = treatment("role-swap", {
		gradient: true,
		background: "#212030",
		surface: "#8290a0",
		foreground: baseline.accent.hex,
		accent: baseline.foreground.hex,
		foregroundFamily: baseline.familyRoles.accent,
		accentFamily: baseline.familyRoles.foreground,
	})
	const collapseChange = treatment("collapse-change", {
		gradient: true,
		background: "#312030",
		surface: "#8390a0",
		collapseAccent: true,
	})
	const axisLoss = treatment("axis-loss", { gradient: true, background: "#412030", surface: "#8490a0" })
	const excessBaseLoss = treatment("base-loss", { gradient: true, background: "#512030", surface: "#8590a0" })
	const lowQuality = Object.fromEntries(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
			.filter((axis) => axis !== "renderedGradientSalience")
			.map((axis) => [axis, 0.72]),
	) as Partial<AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality>
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(challengerInput(baseline, [
		{ treatment: disconnected, sourceConnected: false },
		{ treatment: roleSwap },
		{ treatment: collapseChange },
		{ treatment: axisLoss, quality: { artworkIdentity: 0.7 } },
		{ treatment: excessBaseLoss, quality: lowQuality },
	]))

	assert.strictEqual(result.winner, baseline)
	assert.ok(candidateDiagnostic(result, disconnected).rejectionReasons
		.includes("no-source-connected-complete-descriptor-lineage"))
	assert.ok(candidateDiagnostic(result, roleSwap).rejectionReasons
		.includes("foreground-family-role-mismatch"))
	assert.ok(candidateDiagnostic(result, roleSwap).rejectionReasons
		.includes("accent-color-mismatch"))
	assert.ok(candidateDiagnostic(result, collapseChange).rejectionReasons
		.includes("collapse-state-mismatch"))
	assert.ok(candidateDiagnostic(result, axisLoss).rejectionReasons
		.includes("non-field-quality-axis-loss-exceeds-one-level"))
	assert.ok(candidateDiagnostic(result, excessBaseLoss).rejectionReasons
		.includes("base-quality-loss-exceeds-limit"))
})

test("an existing gradient winner is an exact no-op", () => {
	const baseline = treatment("gradient-baseline", { gradient: true })
	const alternative = treatment("gradient-alternative", {
		gradient: true,
		background: "#294070",
		surface: "#a06048",
	})
	const baselineSlate = [baseline, alternative]
	const result = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(
		challengerInput(baseline, [{ treatment: alternative }], baselineSlate),
	)

	assert.strictEqual(result.winner, baseline)
	assert.deepEqual(result.slate, baselineSlate)
	assert.equal(result.diagnostics.outcome.reason, "baseline-winner-gradient")
	assert.equal(result.diagnostics.outcome.replacedBaselineWinner, false)
	assert.deepEqual(result.diagnostics.eligibleChallengerKeysInOrder, [])
	assert.ok(candidateDiagnostic(result, alternative).rejectionReasons.includes("baseline-winner-is-gradient"))
})

test("selection and diagnostics are permutation invariant", () => {
	const baseline = treatment("permutation-baseline")
	const first = treatment("permutation-first", {
		gradient: true,
		background: "#102040",
		surface: "#8090a0",
	})
	const second = treatment("permutation-second", {
		gradient: true,
		background: "#202040",
		surface: "#8090a0",
	})
	const entries = [
		{ treatment: first, quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.82 } },
		{ treatment: second, quality: { renderedGradientSalience: 0.7, fieldFidelity: 0.82 } },
	]
	const forwardInput = challengerInput(baseline, entries)
	const reverseInput = challengerInput(baseline, [...entries].reverse())
	const forward = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(forwardInput)
	const reverse = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger({
		...reverseInput,
		materialized: [...reverseInput.materialized].reverse(),
	})

	assert.equal(completeTreatmentKey(forward.winner), completeTreatmentKey(reverse.winner))
	assert.deepEqual(forward.slate.map(completeTreatmentKey), reverse.slate.map(completeTreatmentKey))
	assert.deepEqual(forward.diagnostics, reverse.diagnostics)
	assert.equal(completeTreatmentKey(forward.winner), completeTreatmentKey(first))
})

test("the standalone attempt composes current recovery evaluation and custody deterministically", () => {
	const image = transitionField()
	const first = extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(image)
	const second = extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(image)

	assert.equal(first.version,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT
		.identity.attemptId, "phase-3-arm-earned-gradient-challenger")
	assert.equal(completeTreatmentKey(first.winner), completeTreatmentKey(first.alternatives[0]))
	assert.ok(first.alternatives.length >= 1 && first.alternatives.length <= 8)
	assert.equal(first.diagnostics.phase3ArmEarnedGradientChallenger.domain.materializedTreatmentCount,
		first.diagnostics.phase3ArmEarnedGradientChallenger.selector.domain.materializedTreatmentCount)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
})
