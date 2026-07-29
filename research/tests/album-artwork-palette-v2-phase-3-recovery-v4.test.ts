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
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryV4,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV4,
} from "../src/album-artwork-palette-v2-phase-3-recovery-v4.ts"
import type {
	FamilyRolePreference,
	RoleSpecificIdentityObligation,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
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
	const backgroundProfile = {
		frameCoverage: 1,
		peripheralCoverage: 1,
		connectedCoverage: 1,
		fieldScore: 1,
		populationCoverage: 1,
		evidenceLevels: [25, 25, 25, 25, 25] as [number, number, number, number, number],
	}
	const surfaceProfile = {
		frameCoverage: 0.5,
		peripheralCoverage: 0.5,
		connectedCoverage: 0.5,
		fieldScore: 0.5,
		populationCoverage: 0.5,
		evidenceLevels: [12, 12, 12, 12, 12] as [number, number, number, number, number],
	}
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
			backgroundProfile,
			surfaceProfile,
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
	background: string
	surface: string
	foreground: string
	accent: string
	backgroundFamily?: string
	surfaceFamily?: string
	foregroundFamily?: string
	accentFamily?: string
	fieldHypothesisId?: string
	gradient?: boolean
}>

function treatment(label: string, options: TreatmentOptions): CompletePaletteTreatment {
	const backgroundFamily = options.backgroundFamily ?? `field-a:${label}`
	const surfaceFamily = options.surfaceFamily ?? `field-b:${label}`
	const foregroundFamily = options.foregroundFamily ?? `copy:${label}`
	const accentFamily = options.accentFamily ?? `mark:${label}`
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
		id: `treatment:${label}`,
		background: roleColor(options.background, backgroundFamily),
		surface: roleColor(options.surface, surfaceFamily),
		foreground: roleColor(options.foreground, foregroundFamily),
		accent: roleColor(options.accent, accentFamily),
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: options.fieldHypothesisId ?? `field:${label}`,
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
		scores: DEFAULT_SCORES,
		gradientEvidence: gradient
			? gradientEvidence(backgroundFamily, surfaceFamily, options.background, options.surface)
			: null,
	}
}

function hypothesis(value: CompletePaletteTreatment): FieldHypothesis {
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
	sourceConnected: boolean,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor {
	return {
		sourceType,
		treatment: value,
		fieldHypothesis: hypothesis(value),
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
	fieldHypothesisId: string,
	familyId: string,
	requiredRole: FamilyRolePreference,
	score = 0.8,
): RoleSpecificIdentityObligation {
	return {
		id,
		familyId,
		fieldHypothesisId,
		requiredRole,
		priority: 0,
		evidence: {
			familyId,
			fieldHypothesisId,
			preference: requiredRole,
			reason: requiredRole === "foreground"
				? "decisive-foreground"
				: requiredRole === "accent" ? "decisive-accent" : "close-role-evidence",
			confidence: score,
			fieldOwned: false,
			observedRegionCount: 3,
			coherentSupport: 0.8,
			foreground: {
				score,
				typographyLikeGeometry: 0.8,
				repetition: 0.8,
				observedLocalContrast: 0.8,
				fieldLightnessContrast: 0.8,
				polarityAgreement: 0.8,
				polarity: {
					source: { polarity: 1, confidence: 0.8, componentIds: [`component:${familyId}`] },
					fieldDirection: 1,
					fieldConfidence: 0.8,
				},
			},
			accent: {
				score,
				compactness: 0.8,
				repetition: 0.8,
				chroma: 0.8,
				observedLocalContrast: 0.8,
				signatureObservation: 0.8,
			},
		},
	}
}

function recoverySelection(
	baseline: CompletePaletteTreatment,
	treatments: readonly CompletePaletteTreatment[],
	quality: ReadonlyMap<string, number>,
	identity: ReadonlyMap<string, number> = new Map(),
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection {
	const selected = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(treatments)
	return {
		...selected,
		winner: baseline,
		slate: [baseline, ...selected.slate.filter((value) =>
			completeTreatmentKey(value) !== completeTreatmentKey(baseline))],
		evaluations: selected.evaluations.map((evaluation) => ({
			...evaluation,
			qualityUtility: quality.get(evaluation.key) ?? evaluation.qualityUtility,
			identityCoverage: identity.get(evaluation.key) ?? evaluation.identityCoverage,
		})),
	}
}

const PALETTES = {
	baseline: { background: "#203050", surface: "#708090", foreground: "#f0f0e0", accent: "#d0a030" },
	first: { background: "#284868", surface: "#b07858", foreground: "#181818", accent: "#d82878" },
	second: { background: "#385878", surface: "#c08868", foreground: "#101820", accent: "#20b888" },
	third: { background: "#304060", surface: "#a06848", foreground: "#202020", accent: "#b83888" },
} as const

test("a bounded earned transition with additional decisive foreground and accent roles can replace the baseline", () => {
	const baseline = treatment("baseline", PALETTES.baseline)
	const challenger = treatment("earned-transition", {
		...PALETTES.first,
		gradient: true,
		fieldHypothesisId: "field:earned-transition",
		foregroundFamily: "observed-copy",
		accentFamily: "observed-mark",
	})
	const quality = new Map([
		[completeTreatmentKey(baseline), 0.84],
		[completeTreatmentKey(challenger), 0.74],
	])
	const recoveryV2 = recoverySelection(baseline, [challenger, baseline], quality)
	const result = selectAlbumArtworkPaletteV2Phase3RecoveryV4(recoveryV2, [
		materialized(challenger, "native-field-transition"),
		materialized(baseline, "closed-0.7.4-seed"),
	], [
		obligation("copy-role", challenger.sourceFieldHypothesisId, "observed-copy", "foreground"),
		obligation("mark-role", challenger.sourceFieldHypothesisId, "observed-mark", "accent"),
	], [challenger.sourceFieldHypothesisId])

	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(challenger))
	assert.equal(completeTreatmentKey(result.slate[0]), completeTreatmentKey(challenger))
	assert.ok(result.slate.length <= 8)
	assert.equal(result.diagnostics.promoted, true)
	const diagnostic = result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(challenger))!
	assert.equal(diagnostic.earnedNativeTransition, true)
	assert.equal(diagnostic.decisiveForegroundCoverage, 1)
	assert.equal(diagnostic.decisiveAccentCoverage, 1)
	assert.equal(diagnostic.promotionEligible, true)
})

test("ambiguous-only obligation additions cannot promote a challenger", () => {
	const baseline = treatment("ambiguous-baseline", PALETTES.baseline)
	const challenger = treatment("ambiguous-challenger", {
		...PALETTES.second,
		fieldHypothesisId: "field:ambiguous",
		foregroundFamily: "dual-role",
	})
	const recoveryV2 = recoverySelection(baseline, [challenger, baseline], new Map([
		[completeTreatmentKey(baseline), 0.82],
		[completeTreatmentKey(challenger), 0.78],
	]))
	const result = selectAlbumArtworkPaletteV2Phase3RecoveryV4(recoveryV2, [
		materialized(challenger, "closed-0.7.4-seed"),
		materialized(baseline, "closed-0.7.4-seed"),
	], [obligation("dual-role", challenger.sourceFieldHypothesisId, "dual-role", "ambiguous")], [])

	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(baseline))
	const diagnostic = result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(challenger))!
	assert.equal(diagnostic.totalObligationCoverage, 1)
	assert.equal(diagnostic.decisiveCoverage, 0)
	assert.equal(diagnostic.promotionEligible, false)
})

test("disconnected and unearned native-transition challengers are rejected", () => {
	const baseline = treatment("source-baseline", PALETTES.baseline)
	const disconnected = treatment("disconnected-transition", {
		...PALETTES.first,
		gradient: true,
		fieldHypothesisId: "field:disconnected",
		foregroundFamily: "disconnected-copy",
	})
	const unearned = treatment("unearned-transition", {
		...PALETTES.second,
		gradient: true,
		fieldHypothesisId: "field:unearned",
		foregroundFamily: "unearned-copy",
	})
	for (const [challenger, connected, accepted] of [
		[disconnected, false, [disconnected.sourceFieldHypothesisId]],
		[unearned, true, []],
	] as const) {
		const recoveryV2 = recoverySelection(baseline, [challenger, baseline], new Map([
			[completeTreatmentKey(baseline), 0.84],
			[completeTreatmentKey(challenger), 0.76],
		]))
		const result = selectAlbumArtworkPaletteV2Phase3RecoveryV4(recoveryV2, [
			materialized(challenger, "native-field-transition", connected),
			materialized(baseline, "closed-0.7.4-seed"),
		], [obligation(
			`role:${challenger.id}`,
			challenger.sourceFieldHypothesisId,
			challenger.familyRoles.foreground,
			"foreground",
		)], accepted)

		assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(baseline))
		const diagnostic = result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(challenger))!
		assert.equal(diagnostic.promotionEligible, false)
		assert.ok(diagnostic.rejectionReasons.some((reason) =>
			reason.includes(connected ? "not earned" : "source-connected")))
	}
})

test("the base-quality loss bound remains inclusive at 0.12 and rejects any larger loss", () => {
	const baseline = treatment("bound-baseline", PALETTES.baseline)
	const atBound = treatment("at-bound", {
		...PALETTES.first,
		fieldHypothesisId: "field:at-bound",
		foregroundFamily: "bound-copy",
	})
	const outside = treatment("outside-bound", {
		...PALETTES.second,
		fieldHypothesisId: "field:outside-bound",
		foregroundFamily: "outside-copy",
	})
	const run = (challenger: CompletePaletteTreatment, challengerQuality: number) => {
		const recoveryV2 = recoverySelection(baseline, [challenger, baseline], new Map([
			[completeTreatmentKey(baseline), 0.8],
			[completeTreatmentKey(challenger), challengerQuality],
		]))
		return selectAlbumArtworkPaletteV2Phase3RecoveryV4(recoveryV2, [
			materialized(challenger, "closed-0.7.4-seed"),
			materialized(baseline, "closed-0.7.4-seed"),
		], [obligation(
			"bounded-copy",
			challenger.sourceFieldHypothesisId,
			challenger.familyRoles.foreground,
			"foreground",
		)], [])
	}
	const accepted = run(atBound, 0.8 -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss)
	const rejected = run(outside, 0.8 -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss - 0.000001)

	assert.equal(completeTreatmentKey(accepted.winner), completeTreatmentKey(atBound))
	assert.equal(completeTreatmentKey(rejected.winner), completeTreatmentKey(baseline))
	assert.equal(accepted.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(atBound))!
		.withinQualityBound, true)
	assert.equal(rejected.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(outside))!
		.withinQualityBound, false)
})

test("an earned native transition resolves a decisive-coverage tie before ambiguous total coverage", () => {
	const baseline = treatment("tie-baseline", PALETTES.baseline)
	const earned = treatment("tie-earned", {
		...PALETTES.first,
		gradient: true,
		fieldHypothesisId: "field:tie-earned",
		foregroundFamily: "earned-copy",
		accentFamily: "earned-mark",
	})
	const ordinary = treatment("tie-ordinary", {
		...PALETTES.third,
		fieldHypothesisId: "field:tie-ordinary",
		foregroundFamily: "ordinary-copy",
		accentFamily: "ordinary-mark",
	})
	const values = [baseline, earned, ordinary]
	const recoveryV2 = recoverySelection(baseline, values, new Map(values.map((value, index) =>
		[completeTreatmentKey(value), 0.84 - index * 0.02])), new Map([
		[completeTreatmentKey(ordinary), 1],
	]))
	const obligations = [
		obligation("earned-copy", earned.sourceFieldHypothesisId, "earned-copy", "foreground"),
		obligation("earned-mark", earned.sourceFieldHypothesisId, "earned-mark", "accent"),
		obligation("ordinary-copy", ordinary.sourceFieldHypothesisId, "ordinary-copy", "foreground"),
		obligation("ordinary-mark", ordinary.sourceFieldHypothesisId, "ordinary-mark", "accent"),
		obligation("ordinary-ambiguous", ordinary.sourceFieldHypothesisId, "ordinary-copy", "ambiguous"),
	]
	const result = selectAlbumArtworkPaletteV2Phase3RecoveryV4(recoveryV2, [
		materialized(ordinary, "closed-0.7.4-seed"),
		materialized(baseline, "closed-0.7.4-seed"),
		materialized(earned, "native-field-transition"),
	], obligations, [earned.sourceFieldHypothesisId])

	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(earned))
	const ordinaryDiagnostic = result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(ordinary))!
	const earnedDiagnostic = result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(earned))!
	assert.equal(ordinaryDiagnostic.decisiveCoverage, earnedDiagnostic.decisiveCoverage)
	assert.ok(ordinaryDiagnostic.totalObligationCoverage > earnedDiagnostic.totalObligationCoverage)
	assert.ok(ordinaryDiagnostic.existingFamilyIdentity > earnedDiagnostic.existingFamilyIdentity)
})

test("winner rescue and custody are deterministic under complete-domain permutation", () => {
	const baseline = treatment("order-baseline", PALETTES.baseline)
	const first = treatment("order-first", {
		...PALETTES.first,
		gradient: true,
		fieldHypothesisId: "field:order-first",
		foregroundFamily: "order-copy",
		accentFamily: "order-mark",
	})
	const second = treatment("order-second", {
		...PALETTES.second,
		fieldHypothesisId: "field:order-second",
		foregroundFamily: "other-copy",
	})
	const values = [baseline, first, second]
	const quality = new Map(values.map((value, index) => [completeTreatmentKey(value), 0.84 - index * 0.03]))
	const obligations = [
		obligation("order-copy", first.sourceFieldHypothesisId, "order-copy", "foreground"),
		obligation("order-mark", first.sourceFieldHypothesisId, "order-mark", "accent"),
		obligation("other-copy", second.sourceFieldHypothesisId, "other-copy", "foreground"),
	]
	const forward = selectAlbumArtworkPaletteV2Phase3RecoveryV4(
		recoverySelection(baseline, values, quality),
		[
			materialized(baseline, "closed-0.7.4-seed"),
			materialized(first, "native-field-transition"),
			materialized(second, "band-local-endpoint"),
		],
		obligations,
		[first.sourceFieldHypothesisId],
	)
	const reversed = selectAlbumArtworkPaletteV2Phase3RecoveryV4(
		recoverySelection(baseline, [...values].reverse(), quality),
		[
			materialized(second, "band-local-endpoint"),
			materialized(first, "native-field-transition"),
			materialized(baseline, "closed-0.7.4-seed"),
		],
		[...obligations].reverse(),
		[first.sourceFieldHypothesisId],
	)

	assert.equal(completeTreatmentKey(forward.winner), completeTreatmentKey(reversed.winner))
	assert.deepEqual(forward.slate.map(completeTreatmentKey), reversed.slate.map(completeTreatmentKey))
	assert.deepEqual(forward.diagnostics, reversed.diagnostics)
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

test("the unregistered recovery-v4 attempt uses the complete Wave 1 pipeline and returns bounded custody", () => {
	const image = transitionField()
	const first = extractAlbumArtworkPaletteV2Phase3RecoveryV4(image)
	const second = extractAlbumArtworkPaletteV2Phase3RecoveryV4(image)

	assert.equal(first.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID)
	assert.equal(completeTreatmentKey(first.alternatives[0]), completeTreatmentKey(first.winner))
	assert.ok(first.alternatives.length >= 1 && first.alternatives.length <= 8)
	assert.equal(first.diagnostics.phase3RecoveryV4.domain.materializedTreatmentCount,
		first.diagnostics.phase3RecoveryV4.baseSelector.domain.materializedTreatmentCount)
	assert.equal(first.diagnostics.phase3RecoveryV4.domain.logicalDescriptorCount,
		first.diagnostics.phase3RecoveryV4.domain.seedDescriptorCount +
		first.diagnostics.phase3RecoveryV4.domain.supplementalDescriptorCount)
	assert.ok(first.diagnostics.phase3RecoveryV4.transitionEnvelope.creditedHypothesisCount > 0)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT.identity.attemptId,
		"phase-3-recovery-v4")
})

test("recovery-v4 inference has no external outcome or named-source dependency", async () => {
	const sources = await Promise.all([
		"../src/album-artwork-palette-v2-phase-3-transition-envelope-v4.ts",
		"../src/album-artwork-palette-v2-phase-3-recovery-selector-v4.ts",
		"../src/album-artwork-palette-v2-phase-3-recovery-v4.ts",
	].map((source) => readFile(new URL(source, import.meta.url), "utf8")))
	for (const source of sources) {
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical)/iu)
		assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	}
})
