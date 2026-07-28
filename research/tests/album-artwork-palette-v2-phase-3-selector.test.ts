import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
	albumArtworkPaletteV2Phase3SelectorQuality,
	extractAlbumArtworkPaletteV2Phase3SelectorDetails,
	selectAlbumArtworkPaletteV2Phase3Treatments,
} from "../src/album-artwork-palette-v2-phase-3-selector.ts"
import { completeTreatmentKey } from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	PaletteRoleColor,
	PairContrast,
} from "../src/album-artwork-palette-v2.ts"
import type { RGB } from "../src/types.ts"

const SOURCE_SUPPORT = Object.freeze({
	exactSource: true,
	exemplar: { x: 0, y: 0 },
	anchorFamilyId: "fixture-family",
	regionIds: ["fixture-region"],
	perceptualDensity: 1,
	totalSupport: 1,
	connectedSupport: 1,
	spatialCoverage: 1,
	concentration: 1,
	prototypeDistance: 0,
	outlierScore: 0,
	synthesis: null,
})

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

function roleColor(hex: string, generated = false): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, (value[1] - 127) / 510, (value[2] - 127) / 510],
		hex,
		generated,
		strategy: generated ? "generated-emergency" : "dense-exact",
		support: generated ? {
			generated: true,
			role: "foreground",
			reason: "degenerate-supported-domain",
			supportedPairCount: 0,
			maximumSupportedAbsoluteLc: 0,
			thresholdExclusive: 5,
			preferencePenalty: 0.18,
		} : SOURCE_SUPPORT,
	}
}

function contrastPairs(
	foreground: readonly number[] = [60, 60],
	accent: readonly number[] | null = [45, 45],
): PairContrast[] {
	const pairs: PairContrast[] = foreground.map((signedLc, index) => ({
		role: "foreground",
		fieldRole: index === 0 ? "background" : "surface",
		position: index,
		signedLc,
		absoluteLc: Math.abs(signedLc),
	}))
	if (accent) pairs.push(...accent.map((signedLc, index) => ({
		role: "accent" as const,
		fieldRole: index === 0 ? "background" as const : "surface" as const,
		position: index,
		signedLc,
		absoluteLc: Math.abs(signedLc),
	})))
	return pairs
}

type TreatmentOptions = Readonly<{
	background?: string
	surface?: string
	foreground?: string
	accent?: string
	foregroundFamily?: string
	accentFamily?: string
	gradient?: boolean
	collapseSurface?: boolean
	collapseAccent?: boolean
	generatedForeground?: boolean
	foregroundContrasts?: readonly number[]
	accentContrasts?: readonly number[] | null
	scores?: Partial<CompletePaletteScores>
}>

function treatment(name: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const background = options.background ?? "#101010"
	const surface = options.collapseSurface ? background : options.surface ?? "#303030"
	const foreground = options.foreground ?? "#f0f0f0"
	const accent = options.collapseAccent ? foreground : options.accent ?? "#d08040"
	const pairs = contrastPairs(
		options.foregroundContrasts,
		options.collapseAccent ? null : options.accentContrasts,
	)
	return {
		id: `fixture-${name}`,
		background: roleColor(background),
		surface: roleColor(surface),
		foreground: roleColor(foreground, options.generatedForeground),
		accent: roleColor(accent, options.generatedForeground && options.collapseAccent),
		gradient: options.gradient ?? false,
		fieldTreatment: options.collapseSurface
			? "one-field"
			: options.gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: "fixture-field",
		familyRoles: {
			background: "field-a",
			surface: options.collapseSurface ? "field-a" : "field-b",
			foreground: options.generatedForeground ? "generated" : options.foregroundFamily ?? `foreground-${name}`,
			accent: options.generatedForeground && options.collapseAccent
				? "generated"
				: options.collapseAccent
					? options.foregroundFamily ?? `foreground-${name}`
					: options.accentFamily ?? `accent-${name}`,
		},
		cardinality: options.collapseSurface && options.collapseAccent ? 2 :
			options.collapseSurface || options.collapseAccent ? 3 : 4,
		collapse: { surface: options.collapseSurface ?? false, accent: options.collapseAccent ?? false },
		contrast: {
			pairs,
			minimumAbsoluteLc: Math.min(...pairs.map(({ absoluteLc }) => absoluteLc)),
			meanAbsoluteLc: pairs.reduce((sum, { absoluteLc }) => sum + absoluteLc, 0) / pairs.length,
		},
		scores: { ...DEFAULT_SCORES, ...options.scores },
		gradientEvidence: null,
	}
}

function keys(selection: ReturnType<typeof selectAlbumArtworkPaletteV2Phase3Treatments>): readonly string[] {
	return selection.slate.map(completeTreatmentKey)
}

test("selector is invariant to complete-domain permutation", () => {
	const domain = [
		treatment("a", { background: "#111111", scores: { economy: 0.64 } }),
		treatment("b", { foreground: "#eeeeee", scores: { representativeness: 0.80 } }),
		treatment("c", { accent: "#cf7f3f", gradient: true, scores: { fieldFidelity: 0.80 } }),
		treatment("d", { surface: "#313131", scores: { coherence: 0.80 } }),
	]
	const identity = { obligations: [{ familyId: "foreground-b", priority: 0.9 }] }
	const expected = selectAlbumArtworkPaletteV2Phase3Treatments(domain, identity)
	for (const permutation of [
		[domain[3], domain[1], domain[0], domain[2]],
		[domain[2], domain[0], domain[3], domain[1]],
		[...domain].reverse(),
	]) {
		const actual = selectAlbumArtworkPaletteV2Phase3Treatments(permutation, identity)
		assert.equal(completeTreatmentKey(actual.winner), completeTreatmentKey(expected.winner))
		assert.deepEqual(keys(actual), keys(expected))
		assert.deepEqual(actual.explanation, expected.explanation)
	}
})

test("exact relation ties resolve by canonical treatment order", () => {
	const lexicallyLater = treatment("later", { background: "#202020", surface: "#404040" })
	const lexicallyFirst = treatment("first", { background: "#101010", surface: "#303030" })
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments([lexicallyLater, lexicallyFirst])
	assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(lexicallyFirst))
	assert.ok(selection.explanation.winner.reasons.includes("canonical-treatment-order-resolved-exact-relation-tie"))
})

test("collapsed accents explicitly share the foreground path without merging distinct role diagnostics", () => {
	const collapsed = treatment("collapsed", {
		collapseAccent: true,
		foregroundContrasts: [60, 0],
		scores: { foregroundUtility: 0.81, accentUtility: 0.81 },
	})
	const distinct = treatment("distinct", {
		foreground: "#eeeeee",
		accent: "#d18141",
		foregroundContrasts: [60, 0],
		accentContrasts: [45, 45],
		scores: { foregroundUtility: 0.81, accentUtility: 0.81 },
	})
	const collapsedQuality = albumArtworkPaletteV2Phase3SelectorQuality(collapsed)
	const distinctQuality = albumArtworkPaletteV2Phase3SelectorQuality(distinct)
	assert.equal(collapsedQuality.foregroundPathUtility, collapsedQuality.accentPathUtility)
	assert.equal(collapsedQuality.foregroundPathUtility, distinctQuality.foregroundPathUtility)
	assert.ok(distinctQuality.accentPathUtility > collapsedQuality.accentPathUtility)
})

test("foreground and accent path utility respond only to their own active contrast paths", () => {
	const blockedAccent = treatment("blocked-accent", {
		accent: "#d18141",
		foregroundContrasts: [65, 65],
		accentContrasts: [45, 0],
	})
	const completeAccent = treatment("complete-accent", {
		accent: "#d28242",
		foregroundContrasts: [65, 65],
		accentContrasts: [45, 45],
	})
	const blocked = albumArtworkPaletteV2Phase3SelectorQuality(blockedAccent)
	const complete = albumArtworkPaletteV2Phase3SelectorQuality(completeAccent)
	assert.equal(blocked.foregroundPathUtility, complete.foregroundPathUtility)
	assert.ok(blocked.accentPathUtility < complete.accentPathUtility)
	assert.equal(completeTreatmentKey(
		selectAlbumArtworkPaletteV2Phase3Treatments([blockedAccent, completeAccent]).winner,
	), completeTreatmentKey(completeAccent))
})

test("generated penalty is relational rather than an all-candidate veto", () => {
	const supported = treatment("supported", { scores: { fieldFidelity: 0.70 } })
	const generated = treatment("generated", {
		foreground: "#ffffff",
		collapseAccent: true,
		generatedForeground: true,
		scores: {
			fieldFidelity: 0.78,
			surfaceFidelity: 0.78,
			artworkIdentity: 0.78,
			representativeness: 0.78,
			foregroundUtility: 0.78,
			accentFidelity: 0.78,
			accentUtility: 0.78,
			coherence: 0.78,
			economy: 0.78,
			generatedPenalty: 0.18,
		},
	})
	assert.equal(completeTreatmentKey(
		selectAlbumArtworkPaletteV2Phase3Treatments([generated]).winner,
	), completeTreatmentKey(generated))
	assert.equal(completeTreatmentKey(
		selectAlbumArtworkPaletteV2Phase3Treatments([generated, supported]).winner,
	), completeTreatmentKey(supported))
})

test("bounded foreground and accent identity gains can resolve a quality tradeoff without an all-block guard", () => {
	const noCarrier = treatment("no-carrier", {
		foregroundFamily: "other",
		scores: { representativeness: 0.72, economy: 0.76 },
	})
	const foregroundCarrier = treatment("foreground-carrier", {
		foreground: "#eeeeee",
		foregroundFamily: "signature",
		scores: { representativeness: 0.77, economy: 0.68 },
	})
	const accentCarrier = treatment("accent-carrier", {
		foreground: "#ededed",
		accent: "#d18141",
		foregroundFamily: "other",
		accentFamily: "signature",
		scores: { representativeness: 0.77, economy: 0.68 },
	})
	const identity = { obligations: [{ familyId: "signature", priority: 1 }] }
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(
		[noCarrier, accentCarrier, foregroundCarrier],
		identity,
	)
	const foregroundEvaluation = selection.evaluations.find(({ key }) =>
		key === completeTreatmentKey(foregroundCarrier))!
	const accentEvaluation = selection.evaluations.find(({ key }) => key === completeTreatmentKey(accentCarrier))!
	assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(foregroundCarrier))
	assert.equal(foregroundEvaluation.paretoMember, true)
	assert.ok(foregroundEvaluation.quality.economy <
		selection.evaluations.find(({ key }) => key === completeTreatmentKey(noCarrier))!.quality.economy)
	assert.equal(foregroundEvaluation.identityGain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain)
	assert.equal(accentEvaluation.identityGain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.accentIdentityCredit)
	assert.ok(foregroundEvaluation.identityGain <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain)
})

test("source-role identity is a Pareto relation axis rather than an all-quality-block veto", () => {
	const qualityOnly = treatment("quality-only", {
		foregroundFamily: "other",
		scores: {
			fieldFidelity: 0.76,
			surfaceFidelity: 0.76,
			artworkIdentity: 0.76,
			representativeness: 0.76,
			foregroundUtility: 0.76,
			accentFidelity: 0.76,
			accentUtility: 0.76,
			coherence: 0.76,
			economy: 0.76,
		},
	})
	const identityCarrier = treatment("identity-only", {
		background: "#121212",
		surface: "#323232",
		foreground: "#eeeeee",
		foregroundFamily: "signature",
		scores: {
			fieldFidelity: 0.72,
			surfaceFidelity: 0.72,
			artworkIdentity: 0.72,
			representativeness: 0.72,
			foregroundUtility: 0.72,
			accentFidelity: 0.72,
			accentUtility: 0.72,
			coherence: 0.72,
			economy: 0.72,
		},
	})
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments([qualityOnly, identityCarrier], {
		obligations: [{ familyId: "signature", priority: 0 }],
	})
	assert.ok(selection.evaluations.every(({ paretoMember }) => paretoMember))
	assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(identityCarrier))
	assert.ok(selection.explanation.winner.identityGain > 0)
})

test("a dominated high scalar candidate cannot win, even with identity coverage", () => {
	const dominant = treatment("dominant", {
		foregroundFamily: "signature",
		scores: {
			fieldFidelity: 0.80,
			surfaceFidelity: 0.80,
			artworkIdentity: 0.80,
			representativeness: 0.80,
			foregroundUtility: 0.80,
			accentFidelity: 0.80,
			accentUtility: 0.80,
			coherence: 0.80,
			economy: 0.80,
			rankingScore: 0,
		},
	})
	const dominatedScalar = treatment("dominated-scalar", {
		background: "#121212",
		surface: "#323232",
		foreground: "#eeeeee",
		foregroundFamily: "signature",
		scores: {
			fieldFidelity: 0.68,
			surfaceFidelity: 0.68,
			artworkIdentity: 0.68,
			representativeness: 0.68,
			foregroundUtility: 0.68,
			accentFidelity: 0.68,
			accentUtility: 0.68,
			coherence: 0.68,
			economy: 0.68,
			rankingScore: 1,
		},
	})
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments([dominatedScalar, dominant], {
		obligations: [{ familyId: "signature", priority: 1 }],
	})
	const dominatedEvaluation = selection.evaluations.find(({ key }) =>
		key === completeTreatmentKey(dominatedScalar))!
	assert.equal(completeTreatmentKey(selection.winner), completeTreatmentKey(dominant))
	assert.equal(dominatedEvaluation.paretoMember, false)
	assert.equal(dominatedEvaluation.dominatedByKey, completeTreatmentKey(dominant))
	assert.ok(!keys(selection).includes(completeTreatmentKey(dominatedScalar)))
})

test("slate is deterministic, Pareto-only, visually distinct, and bounded to eight", () => {
	const domain = Array.from({ length: 12 }, (_, index) => treatment(`slate-${index}`, {
		background: `#${(16 + index * 8).toString(16).padStart(2, "0")}1010`,
		surface: `#30${(48 + index * 8).toString(16).padStart(2, "0")}30`,
		foreground: `#${(240 - index * 5).toString(16).padStart(2, "0")}f0f0`,
		accent: `#d0${(64 + index * 8).toString(16).padStart(2, "0")}40`,
		gradient: index % 2 === 1,
	}))
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(domain)
	assert.equal(selection.slate.length, 8)
	assert.equal(new Set(keys(selection)).size, 8)
	assert.ok(selection.slate.every((value) =>
		selection.evaluations.find(({ key }) => key === completeTreatmentKey(value))?.paretoMember === true))
	assert.equal(keys(selection)[0], completeTreatmentKey(selection.winner))
	assert.ok(selection.explanation.slate.some(({ diversityGain }) => diversityGain > 0))
})

test("closed 0.7.4 adapter is runnable and carries selector explanations", () => {
	const width = 24
	const height = 24
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data.set(x < width / 2 ? [18, 38, 84] : [214, 176, 82], (y * width + x) * 3)
		}
	}
	const details = extractAlbumArtworkPaletteV2Phase3SelectorDetails({ width, height, data })
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_ATTEMPT.identity.attemptId,
		"deterministic-relation-pareto-wave-1")
	assert.equal(details.result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION)
	assert.equal(details.result.diagnostics.phase3Selector, details.selection.explanation)
	assert.equal(details.result.diagnostics.completeCandidateCount,
		details.selection.explanation.domain.rawTreatmentCount)
	assert.equal(completeTreatmentKey(details.result.winner), details.selection.explanation.winner.key)
	assert.deepEqual(details.result.alternatives, details.selection.slate)
	assert.ok(details.result.alternatives.length <= 8)
})

test("selector inference has no external evidence or scalar-ranking inputs", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-selector.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /\b(?:caseId|artworkId|sourceFieldHypothesisId|rankingScore)\b/u)
	assert.doesNotMatch(source, /(?:review|comment|targetColor|historical|learned)/iu)
})
