import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildNativePaletteEvidence,
	completeTreatmentKey,
} from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	GradientFieldEvidence,
	PaletteRoleColor,
} from "../src/album-artwork-palette-v2.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3DescriptorsV2,
} from "../src/album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	FieldConditionalRoleEvidence,
	RoleSpecificIdentityObligation,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_FORMULAS,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY,
	albumArtworkPaletteV2Phase3SelectorV2Quality,
	selectAlbumArtworkPaletteV2Phase3SelectorV2,
} from "../src/album-artwork-palette-v2-phase-3-selector-v2.ts"
import type { RGB, RawImage } from "../src/types.ts"

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

function roleColor(hex: string, familyId: string, supported = true): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, (value[1] - 127) / 510, (value[2] - 127) / 510],
		hex,
		generated: !supported,
		strategy: supported ? "dense-exact" : "generated-emergency",
		support: supported ? {
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
		} : {
			generated: true,
			role: "foreground",
			reason: "degenerate-supported-domain",
			supportedPairCount: 0,
			maximumSupportedAbsoluteLc: 0,
			thresholdExclusive: 5,
			preferencePenalty: 0.18,
		},
	}
}

function gradientEvidence(backgroundFamily: string, surfaceFamily: string): GradientFieldEvidence {
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
	fieldHypothesisId?: string
	foregroundFamily?: string
	accentFamily?: string
	gradient?: "earned" | "unearned" | "none"
	fieldTreatment?: CompletePaletteTreatment["fieldTreatment"]
	collapseAccent?: boolean
	foregroundPath?: readonly number[]
	accentPath?: readonly number[]
	supportedForeground?: boolean
	scores?: Partial<CompletePaletteScores>
}>

function treatment(label: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const background = options.background ?? "#183060"
	const surface = options.surface ?? "#b07040"
	const foreground = options.foreground ?? "#f0f0f0"
	const accent = options.collapseAccent ? foreground : options.accent ?? "#e0a020"
	const backgroundFamily = "generic-field-a"
	const surfaceFamily = "generic-field-b"
	const foregroundFamily = options.foregroundFamily ?? `generic-foreground-${label}`
	const accentFamily = options.collapseAccent ? foregroundFamily : options.accentFamily ?? `generic-accent-${label}`
	const gradient = options.gradient === "earned" || options.gradient === "unearned"
	const fieldTreatment = options.fieldTreatment ?? (gradient ? "gradient-field" : "separate-flat-fields")
	const fieldRole = gradient ? "gradient-sample" as const : "background" as const
	const foregroundPath = options.foregroundPath ?? [62, 58, 54]
	const accentPath = options.collapseAccent ? [] : options.accentPath ?? [48, 44, 40]
	const pairs = [
		...foregroundPath.map((signedLc, position) => ({
			role: "foreground" as const,
			fieldRole,
			position: position / Math.max(1, foregroundPath.length - 1),
			signedLc,
			absoluteLc: Math.abs(signedLc),
		})),
		...accentPath.map((signedLc, position) => ({
			role: "accent" as const,
			fieldRole,
			position: position / Math.max(1, accentPath.length - 1),
			signedLc,
			absoluteLc: Math.abs(signedLc),
		})),
	]
	return {
		id: `generic-treatment-${label}`,
		background: roleColor(background, backgroundFamily),
		surface: roleColor(surface, surfaceFamily),
		foreground: roleColor(foreground, foregroundFamily, options.supportedForeground ?? true),
		accent: roleColor(accent, accentFamily, options.supportedForeground ?? true),
		gradient,
		fieldTreatment,
		sourceFieldHypothesisId: options.fieldHypothesisId ?? "generic-field",
		familyRoles: {
			background: backgroundFamily,
			surface: surfaceFamily,
			foreground: options.supportedForeground === false ? "generated" : foregroundFamily,
			accent: options.supportedForeground === false
				? "generated"
				: accentFamily,
		},
		cardinality: options.collapseAccent ? 3 : 4,
		collapse: { surface: false, accent: options.collapseAccent ?? false },
		contrast: {
			pairs,
			minimumAbsoluteLc: Math.min(...pairs.map(({ absoluteLc }) => absoluteLc)),
			meanAbsoluteLc: pairs.reduce((sum, { absoluteLc }) => sum + absoluteLc, 0) / pairs.length,
		},
		scores: { ...DEFAULT_SCORES, ...options.scores },
		gradientEvidence: options.gradient === "earned"
			? gradientEvidence(backgroundFamily, surfaceFamily)
			: null,
	}
}

const evidenceImage: RawImage = {
	width: 4,
	height: 4,
	data: new Uint8Array(Array.from({ length: 16 }, (_, index) =>
		index % 2 === 0 ? [24, 48, 96] : [176, 112, 64]).flat()),
}
const evidence = buildNativePaletteEvidence(evidenceImage)

function domain(values: readonly CompletePaletteTreatment[]) {
	return {
		materialized: values.map((value) => ({ key: completeTreatmentKey(value), treatment: value })),
		diagnostics: { version: "recorded-generic-synthetic-domain-v1" },
	}
}

function roleEvidence(
	familyId: string,
	fieldHypothesisId: string,
	preference: "foreground" | "accent" | "ambiguous",
): FieldConditionalRoleEvidence {
	return {
		familyId,
		fieldHypothesisId,
		preference,
		reason: preference === "foreground" ? "decisive-foreground" :
			preference === "accent" ? "decisive-accent" : "simultaneous-role-support",
		confidence: 0.9,
		fieldOwned: false,
		observedRegionCount: 3,
		coherentSupport: 0.8,
		foreground: {
			score: preference === "accent" ? 0.45 : 0.84,
			typographyLikeGeometry: 0.8,
			repetition: 0.7,
			observedLocalContrast: 0.8,
			fieldLightnessContrast: 0.8,
			polarityAgreement: 0.8,
			polarity: {
				source: { polarity: 1, confidence: 0.8, componentIds: ["generic-role-component"] },
				fieldDirection: 1,
				fieldConfidence: 0.8,
			},
		},
		accent: {
			score: preference === "foreground" ? 0.45 : 0.84,
			compactness: 0.8,
			repetition: 0.7,
			chroma: 0.8,
			observedLocalContrast: 0.8,
			signatureObservation: 0.8,
		},
	}
}

function obligation(
	familyId: string,
	fieldHypothesisId: string,
	requiredRole: "foreground" | "accent" | "ambiguous",
	priority = 0,
): RoleSpecificIdentityObligation {
	return {
		id: `generic-role-obligation:${fieldHypothesisId}:${familyId}:${requiredRole}`,
		familyId,
		fieldHypothesisId,
		requiredRole,
		priority,
		evidence: roleEvidence(familyId, fieldHypothesisId, requiredRole),
	}
}

function select(
	values: readonly CompletePaletteTreatment[],
	roleSpecificObligations: readonly RoleSpecificIdentityObligation[] = [],
	identityObligations: Parameters<typeof selectAlbumArtworkPaletteV2Phase3SelectorV2>[0]["identityObligations"] = [],
) {
	return selectAlbumArtworkPaletteV2Phase3SelectorV2({
		evidence,
		identityObligations,
		roleSpecificObligations,
		materializedDomain: domain(values),
	})
}

test("selector-v2 is an unpinned permutation-invariant winner over the materialized complete domain", () => {
	const weaker = treatment("weaker", {
		background: "#203860",
		scores: { fieldFidelity: 0.60, representativeness: 0.60, coherence: 0.60, economy: 0.60 },
	})
	const stronger = treatment("stronger", {
		background: "#183060",
		scores: { fieldFidelity: 0.84, representativeness: 0.84, coherence: 0.84, economy: 0.84 },
	})
	const forward = select([weaker, stronger])
	const reversed = select([stronger, weaker])

	assert.equal(forward.winner.key, completeTreatmentKey(stronger))
	assert.equal(reversed.winner.key, forward.winner.key)
	assert.deepEqual(reversed.slate.map(({ key }) => key), forward.slate.map(({ key }) => key))
	assert.equal(forward.evaluations.find(({ key }) => key === completeTreatmentKey(weaker))?.paretoMember, false)
	assert.equal(forward.explanation.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID)
	assert.equal(forward.explanation.formulas, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_FORMULAS)
})

test("earned rendered gradient dominates materially comparable missing and unearned treatments", () => {
	const earned = treatment("earned", { gradient: "earned", fieldHypothesisId: "gradient-field" })
	const missing = treatment("missing", {
		background: "#193161",
		fieldHypothesisId: "gradient-field",
	})
	const unearned = treatment("unearned", {
		background: "#1a3262",
		gradient: "unearned",
		fieldHypothesisId: "gradient-field",
	})
	const selection = select([missing, unearned, earned])
	const byKey = new Map(selection.evaluations.map((entry) => [entry.key, entry]))

	assert.equal(selection.winner.key, completeTreatmentKey(earned))
	assert.equal(byKey.get(completeTreatmentKey(earned))?.gradientStatus, "earned-rendered")
	assert.equal(byKey.get(completeTreatmentKey(missing))?.gradientStatus, "missing")
	assert.equal(byKey.get(completeTreatmentKey(unearned))?.gradientStatus, "unearned")
	assert.ok((byKey.get(completeTreatmentKey(earned))?.quality.renderedGradientSalience ?? 0) > 0)
	assert.equal(byKey.get(completeTreatmentKey(missing))?.quality.renderedGradientSalience, 0)
	assert.equal(byKey.get(completeTreatmentKey(unearned))?.quality.fieldFidelity, 0)
	assert.equal(byKey.get(completeTreatmentKey(missing))?.paretoMember, false)
	assert.equal(byKey.get(completeTreatmentKey(unearned))?.paretoMember, false)
})

test("role-specific obligations require the correct role and field while allowing a bounded quality tradeoff", () => {
	const correct = treatment("correct-role", {
		foregroundFamily: "generic-copy",
		accentFamily: "generic-mark",
		fieldHypothesisId: "role-field",
		scores: { economy: 0.69 },
	})
	const swapped = treatment("swapped-role", {
		foreground: "#e0a020",
		accent: "#f0f0f0",
		foregroundFamily: "generic-mark",
		accentFamily: "generic-copy",
		fieldHypothesisId: "role-field",
		scores: { economy: 0.71 },
	})
	const otherField = treatment("other-field", {
		background: "#1a3262",
		foregroundFamily: "generic-copy",
		accentFamily: "generic-mark",
		fieldHypothesisId: "unrelated-field",
		scores: { economy: 0.71 },
	})
	const obligations = [
		obligation("generic-copy", "role-field", "foreground", 0),
		obligation("generic-mark", "role-field", "accent", 1),
	]
	const selection = select([swapped, otherField, correct], obligations)
	const correctEvaluation = selection.evaluations.find(({ key }) => key === completeTreatmentKey(correct))!
	const swappedEvaluation = selection.evaluations.find(({ key }) => key === completeTreatmentKey(swapped))!
	const otherEvaluation = selection.evaluations.find(({ key }) => key === completeTreatmentKey(otherField))!

	assert.equal(selection.winner.key, completeTreatmentKey(correct))
	assert.equal(correctEvaluation.roleIdentity.coverage, 1)
	assert.equal(swappedEvaluation.roleIdentity.coverage, 0)
	assert.ok(swappedEvaluation.roleIdentity.entries.every(({ wrongRole }) => wrongRole))
	assert.equal(otherEvaluation.roleIdentity.applicableObligationCount, 0)
	assert.equal(otherEvaluation.roleIdentity.gain, 0)
	assert.equal(correctEvaluation.roleIdentity.gain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_POLICY.maximumRoleIdentityGain)
	assert.ok(correctEvaluation.quality.economy < swappedEvaluation.quality.economy)
})

test("family-only obligations never provide foreground-one or accent-point-eight credit", () => {
	const noCarrier = treatment("family-no-carrier", { foregroundFamily: "other" })
	const foregroundCarrier = treatment("family-foreground-carrier", {
		background: "#193161",
		foregroundFamily: "family-only-signature",
	})
	const accentCarrier = treatment("family-accent-carrier", {
		background: "#1a3262",
		accentFamily: "family-only-signature",
	})
	const familyOnly = [{
		id: "generic-family-only-obligation",
		familyId: "family-only-signature",
		priority: 0,
		source: {
			regionIds: ["generic-family-only-region"],
			connectedPopulationFraction: 0.1,
			materialDistanceFromField: 0.2,
			signatureRoleScore: 0.8,
			signatureEvidenceLevel: 20,
			regionEvidenceLevel: 20,
		},
	}]
	const selection = select([accentCarrier, foregroundCarrier, noCarrier], [], familyOnly)

	assert.ok(selection.evaluations.every(({ roleIdentity }) => roleIdentity.gain === 0))
	assert.equal(selection.explanation.domain.familyOnlyObligationCountIgnoredForCredit, 1)
})

test("duplicate materialization keys return the exact treatment retained by the relation", () => {
	const retained = treatment("duplicate-retained", {
		foregroundFamily: "duplicate-signature",
		fieldHypothesisId: "duplicate-field",
	})
	const duplicate = treatment("duplicate-other", {
		foregroundFamily: "duplicate-signature",
		fieldHypothesisId: "other-duplicate-field",
	})
	const selection = select([retained, duplicate], [
		obligation("duplicate-signature", "duplicate-field", "foreground"),
	])

	assert.equal(selection.explanation.domain.duplicateTreatmentCount, 1)
	assert.equal(selection.winner.treatment, retained)
})

test("path and source-support axes are role-local and interpretable", () => {
	const blockedAccent = treatment("blocked-accent", { accentPath: [44, 0, 0] })
	const completeAccent = treatment("complete-accent", {
		background: "#193161",
		accentPath: [44, 42, 40],
	})
	const unsupported = treatment("unsupported", {
		background: "#1a3262",
		supportedForeground: false,
		scores: { generatedPenalty: 0.18 },
	})
	const blockedQuality = albumArtworkPaletteV2Phase3SelectorV2Quality(blockedAccent).quality
	const completeQuality = albumArtworkPaletteV2Phase3SelectorV2Quality(completeAccent).quality
	const unsupportedQuality = albumArtworkPaletteV2Phase3SelectorV2Quality(unsupported).quality

	assert.equal(blockedQuality.foregroundPath, completeQuality.foregroundPath)
	assert.ok(blockedQuality.accentPath < completeQuality.accentPath)
	assert.ok(unsupportedQuality.sourceSupport < completeQuality.sourceSupport)
	assert.equal(select([blockedAccent, completeAccent]).winner.key, completeTreatmentKey(completeAccent))
})

test("the quality-first slate stops at near duplicates and caps genuinely diverse records at eight", () => {
	const nearRecords = Array.from({ length: 10 }, (_, index) => treatment(`near-${index}`, {
		background: `#${(24 + index).toString(16).padStart(2, "0")}3060`,
		surface: `#b0${(112 + index).toString(16).padStart(2, "0")}40`,
		foreground: `#${(240 - index).toString(16).padStart(2, "0")}f0f0`,
		accent: `#e0${(160 + index).toString(16).padStart(2, "0")}20`,
		foregroundFamily: "near-foreground",
		accentFamily: "near-accent",
	}))
	const nearSelection = select(nearRecords)
	assert.equal(nearSelection.slate.length, 1)

	const diverseRecords = Array.from({ length: 12 }, (_, index) => treatment(`diverse-${index}`, {
		background: `#${(16 + index * 12).toString(16).padStart(2, "0")}2040`,
		surface: `#80${(48 + index * 12).toString(16).padStart(2, "0")}30`,
		foreground: `#${(245 - index * 10).toString(16).padStart(2, "0")}e8e0`,
		accent: `#d0${(32 + index * 14).toString(16).padStart(2, "0")}20`,
	}))
	const diverseSelection = select(diverseRecords)
	assert.equal(diverseSelection.slate.length, 8)
	assert.equal(new Set(diverseSelection.slate.map(({ key }) => key)).size, 8)
	assert.ok(diverseSelection.slate.every(({ key }) =>
		diverseSelection.evaluations.find((entry) => entry.key === key)?.paretoMember))
})

function commonFixture(): RawImage {
	const width = 28
	const height = 20
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			data.set([
				Math.round(24 + 145 * amount),
				Math.round(45 + 70 * amount),
				Math.round(132 - 50 * amount),
			], (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

test("selector-v2 consumes the common base materialized-domain contract directly", () => {
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(commonFixture(), {
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3DescriptorsV2(descriptors, obligations),
	})
	assert.ok(common.currentV1MaterializedDomain)
	const selection = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2.select({
		evidence: common.evidence.augmentedNative,
		identityObligations: common.seedAvailability.identityObligations,
		materializedDomain: common.currentV1MaterializedDomain,
	})
	const domainKeys = new Set(common.currentV1MaterializedDomain.materialized.map(({ key }) => key))

	assert.ok(domainKeys.has(selection.winner.key))
	assert.ok(selection.slate.length >= 1 && selection.slate.length <= 8)
	assert.ok(selection.slate.every(({ key }) => domainKeys.has(key)))
	assert.equal(selection.explanation.domain.materializedTreatmentCount,
		common.currentV1MaterializedDomain.materialized.length)
})

test("selector-v2 inference has no anchor, forced provenance, outcome label, or scalar-ranking dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-selector-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /(?:anchorLookup|anchorPrefix|forcedReservation|provenanceReserve|fillQuota)/iu)
	assert.doesNotMatch(source, /(?:caseId|artworkId|targetColor|feedback|review|learned|rankingScore)/iu)
	assert.doesNotMatch(source, /treatment\.id/u)
})
