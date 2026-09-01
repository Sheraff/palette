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
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV3,
} from "../src/album-artwork-palette-v2-phase-3-recovery-v3.ts"
import {
	extractAlbumArtworkPaletteV2Phase3RecoveryV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-v2.ts"
import type {
	RoleSpecificIdentityObligation,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION,
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"
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
	quality?: number
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
	const quality = options.quality ?? 0.8
	const background = options.background ?? "#183060"
	const surface = options.surface ?? "#985050"
	const foreground = options.foreground ?? "#f0f0f0"
	const accent = options.accent ?? "#e0a020"
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
		background: roleColor(background, backgroundFamily),
		surface: roleColor(surface, surfaceFamily),
		foreground: roleColor(foreground, foregroundFamily),
		accent: roleColor(accent, accentFamily),
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
		scores: Object.fromEntries(Object.keys(DEFAULT_SCORES).map((key) => [
			key,
			key === "generatedPenalty" ? 0 : quality,
		])) as unknown as CompletePaletteScores,
		gradientEvidence: gradient
			? gradientEvidence(backgroundFamily, surfaceFamily, background, surface)
			: null,
		...options.scores ? { scores: {
			...Object.fromEntries(Object.keys(DEFAULT_SCORES).map((key) => [
				key,
				key === "generatedPenalty" ? 0 : quality,
			])),
			...options.scores,
		} as unknown as CompletePaletteScores } : {},
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
	sourceConnected = true,
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

function roleObligation(
	id: string,
	fieldHypothesisId: string,
	familyId: string,
	requiredRole: "foreground" | "accent",
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
			reason: requiredRole === "foreground" ? "decisive-foreground" : "decisive-accent",
			confidence: 0.8,
			fieldOwned: false,
			observedRegionCount: 3,
			coherentSupport: 0.8,
			foreground: {
				score: requiredRole === "foreground" ? 0.8 : 0.45,
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
				score: requiredRole === "accent" ? 0.8 : 0.45,
				compactness: 0.8,
				repetition: 0.8,
				chroma: 0.8,
				observedLocalContrast: 0.8,
				signatureObservation: 0.8,
			},
		},
	}
}

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

test("quality-bounded earned supplemental field custody can retain a dominated treatment omitted by recovery v2", () => {
	const winner = treatment("winner-gradient", { quality: 0.84, gradient: true })
	const supplemental = treatment("supplemental-gradient", {
		quality: 0.74,
		gradient: true,
		background: "#305080",
		surface: "#b87030",
		foreground: "#fff8e8",
		accent: "#30d0a0",
	})
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([supplemental, winner])
	const supplementalKey = completeTreatmentKey(supplemental)
	const supplementalEvaluation = recoveryV2.evaluations.find(({ key }) => key === supplementalKey)!

	assert.equal(completeTreatmentKey(recoveryV2.winner), completeTreatmentKey(winner))
	assert.equal(supplementalEvaluation.paretoMember, false)
	assert.ok(!recoveryV2.slate.some((value) => completeTreatmentKey(value) === supplementalKey))
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(recoveryV2, [
		materialized(winner, "closed-0.7.4-seed"),
		materialized(supplemental, "native-field-transition"),
	], [])
	const diagnostic = custody.diagnostics.selected.find(({ recoveryV2: value }) => value.key === supplementalKey)!

	assert.ok(custody.slate.some((value) => completeTreatmentKey(value) === supplementalKey))
	assert.equal(diagnostic.selectionKind, "custody-reserve")
	assert.equal(diagnostic.recoveryV2.paretoMember, false)
	assert.ok(diagnostic.qualityLossFromWinner <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY.maximumQualityLoss)
	assert.deepEqual(diagnostic.sourceTypes, ["native-field-transition"])
	assert.ok(diagnostic.renderedFieldClaim)
	assert.ok(diagnostic.novelDimensions.some((dimension) =>
		dimension.startsWith("rendered-field-claim:")))
})

test("a complementary field-specific foreground and accent carrier survives without changing the winner", () => {
	const fieldHypothesisId = "shared-role-field"
	const winner = treatment("role-winner", { quality: 0.84, fieldHypothesisId })
	const carrier = treatment("role-carrier", {
		quality: 0.76,
		fieldHypothesisId,
		backgroundFamily: winner.familyRoles.background,
		surfaceFamily: winner.familyRoles.surface,
		background: winner.background.hex,
		surface: winner.surface.hex,
		foreground: "#d8f8ff",
		accent: "#ff40b0",
		foregroundFamily: "observed-copy",
		accentFamily: "observed-mark",
	})
	const obligations = [
		roleObligation("copy-as-foreground", fieldHypothesisId, "observed-copy", "foreground"),
		roleObligation("mark-as-accent", fieldHypothesisId, "observed-mark", "accent"),
	]
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([carrier, winner])
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(recoveryV2, [
		materialized(carrier, "band-local-endpoint"),
		materialized(winner, "closed-0.7.4-seed"),
	], obligations)
	const carrierDiagnostic = custody.diagnostics.selected.find(({ recoveryV2: value }) =>
		value.key === completeTreatmentKey(carrier))!

	assert.equal(completeTreatmentKey(custody.winner), completeTreatmentKey(recoveryV2.winner))
	assert.equal(completeTreatmentKey(custody.slate[0]), completeTreatmentKey(recoveryV2.winner))
	assert.equal(carrierDiagnostic.selectionKind, "custody-reserve")
	assert.deepEqual(carrierDiagnostic.coveredRoleObligationIds,
		["copy-as-foreground", "mark-as-accent"])
	assert.ok(carrierDiagnostic.novelDimensions.includes("role-carrier:copy-as-foreground:foreground"))
	assert.ok(carrierDiagnostic.novelDimensions.includes("role-carrier:mark-as-accent:accent"))
})

test("new source mechanism information cannot retain a candidate outside the quality bound", () => {
	const winner = treatment("quality-bound-winner", { quality: 0.9 })
	const lowQuality = treatment("quality-bound-low", {
		quality: 0.2,
		background: "#803020",
		surface: "#d08040",
		foreground: "#f8f0d0",
		accent: "#30c0d0",
	})
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([lowQuality, winner])
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(recoveryV2, [
		materialized(lowQuality, "native-field-transition"),
		materialized(winner, "closed-0.7.4-seed"),
	], [])

	assert.ok(!custody.slate.some((value) => completeTreatmentKey(value) === completeTreatmentKey(lowQuality)))
	assert.ok(!custody.diagnostics.selected.some(({ recoveryV2: value }) =>
		value.key === completeTreatmentKey(lowQuality)))
})

test("custody is winner-first, bounded, permutation invariant, and labels ordinary quality fills", () => {
	const first = treatment("quality-tradeoff-a", {
		quality: 0.8,
		scores: { fieldFidelity: 0.92, representativeness: 0.64 },
	})
	const second = treatment("quality-tradeoff-b", {
		quality: 0.8,
		background: "#603060",
		surface: "#b06080",
		foreground: "#fff0d8",
		accent: "#30d080",
		scores: { fieldFidelity: 0.64, representativeness: 1 },
	})
	const forwardRecovery = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([first, second])
	const reverseRecovery = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([second, first])
	assert.equal(forwardRecovery.slate.length, 2)
	const forward = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(forwardRecovery, [
		materialized(first, "closed-0.7.4-seed"),
		materialized(second, "closed-0.7.4-seed"),
	], [])
	const reversed = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(reverseRecovery, [
		materialized(second, "closed-0.7.4-seed"),
		materialized(first, "closed-0.7.4-seed"),
	], [])

	assert.equal(completeTreatmentKey(forward.winner), completeTreatmentKey(forwardRecovery.winner))
	assert.equal(completeTreatmentKey(forward.slate[0]), completeTreatmentKey(forward.winner))
	assert.ok(forward.slate.length <= 8)
	assert.deepEqual(forward.slate.map(completeTreatmentKey), reversed.slate.map(completeTreatmentKey))
	assert.deepEqual(forward.diagnostics, reversed.diagnostics)
	assert.equal(forward.diagnostics.selected[0].selectionKind, "winner")
	assert.equal(forward.diagnostics.selected[1].selectionKind, "ordinary-quality-slate-fill")
	for (const item of forward.diagnostics.selected) {
		const evaluation = forwardRecovery.evaluations.find(({ key }) => key === item.recoveryV2.key)!
		assert.equal(item.recoveryV2.qualityUtility, evaluation.qualityUtility)
		assert.equal(item.recoveryV2.paretoMember, evaluation.paretoMember)
	}
})

test("recovery v3 reuses the recovery-v2 winner and common domain while changing only public custody", () => {
	const image = transitionField()
	const recoveryV2 = extractAlbumArtworkPaletteV2Phase3RecoveryV2(image)
	const first = extractAlbumArtworkPaletteV2Phase3RecoveryV3(image)
	const second = extractAlbumArtworkPaletteV2Phase3RecoveryV3(image)

	assert.equal(first.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID)
	assert.equal(completeTreatmentKey(first.winner), completeTreatmentKey(recoveryV2.winner))
	assert.equal(completeTreatmentKey(first.alternatives[0]), completeTreatmentKey(first.winner))
	assert.ok(first.alternatives.length >= 1 && first.alternatives.length <= 8)
	assert.equal(first.diagnostics.phase3RecoveryV3.domain.materializedTreatmentCount,
		first.diagnostics.phase3RecoveryV3.selector.domain.materializedTreatmentCount)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT.identity.attemptId,
		"phase-3-recovery-v3")
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION, 5)
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "recovery-v3-test",
		"--case", "development-03",
		"--attempt", "phase-3-recovery-v3",
	]), {
		iterationId: "recovery-v3-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-recovery-v3"],
	})
})

test("recovery v3 inference has no outcome, external metadata, or named-treatment dependency", async () => {
	const sources = await Promise.all([
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-recovery-custody-v3.ts",
			import.meta.url,
		), "utf8"),
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-recovery-v3.ts",
			import.meta.url,
		), "utf8"),
	])
	for (const source of sources) {
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical|comment|anchor|fallback)/iu)
		assert.doesNotMatch(source,
			/(?:closedDetails\.result\.(?:winner|alternatives)|forcedReservation)/iu)
		assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	}
})
