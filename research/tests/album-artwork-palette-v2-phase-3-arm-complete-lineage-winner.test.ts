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
	EmergencyEligibility,
	FieldHypothesis,
	PaletteRoleColor,
	Role,
} from "../src/album-artwork-palette-v2.ts"
import {
	filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "../src/album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ENVELOPE_ERROR,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_NO_ELIGIBLE_ERROR,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_PRECOMPUTED_DOMAIN_ERROR,
	extractAlbumArtworkPaletteV2Phase3CompleteLineageWinner,
	selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner,
} from "../src/album-artwork-palette-v2-phase-3-arm-complete-lineage-winner.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RGB, RawImage } from "../src/types.ts"

const ROLES = ["background", "surface", "foreground", "accent"] as const

const BASE_SCORES: CompletePaletteScores = Object.freeze({
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

function sourceColor(
	hex: string,
	familyId: string,
	options: Readonly<{ anchorFamilyId?: string; emptyRegions?: boolean }> = {},
): PaletteRoleColor {
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
			anchorFamilyId: options.anchorFamilyId ?? familyId,
			regionIds: options.emptyRegions ? [] : [`region:${familyId}`],
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

type TreatmentOptions = Readonly<{
	quality?: number
	colors?: readonly [string, string, string, string]
	families?: readonly [string, string, string, string]
	support?: Partial<Record<Role, Readonly<{ anchorFamilyId?: string; emptyRegions?: boolean }>>>
}>

function treatment(label: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const quality = options.quality ?? 0.8
	const colors = options.colors ?? ["#183060", "#704060", "#f0f0f0", "#e0a020"]
	const families = options.families ?? [
		`background:${label}`,
		`surface:${label}`,
		`foreground:${label}`,
		`accent:${label}`,
	]
	const scores = Object.fromEntries(Object.keys(BASE_SCORES).map((key) => [
		key,
		key === "generatedPenalty" ? 0 : quality,
	])) as unknown as CompletePaletteScores
	const pairs = [
		{ role: "foreground" as const, fieldRole: "background" as const, position: 0, signedLc: 65, absoluteLc: 65 },
		{ role: "accent" as const, fieldRole: "surface" as const, position: 1, signedLc: 42, absoluteLc: 42 },
	]
	return {
		id: `treatment:${label}`,
		background: sourceColor(colors[0], families[0], options.support?.background),
		surface: sourceColor(colors[1], families[1], options.support?.surface),
		foreground: sourceColor(colors[2], families[2], options.support?.foreground),
		accent: sourceColor(colors[3], families[3], options.support?.accent),
		gradient: false,
		fieldTreatment: "separate-flat-fields",
		sourceFieldHypothesisId: `field:${label}`,
		familyRoles: {
			background: families[0],
			surface: families[1],
			foreground: families[2],
			accent: families[3],
		},
		cardinality: 4,
		collapse: { surface: false, accent: false },
		contrast: { pairs, minimumAbsoluteLc: 42, meanAbsoluteLc: 53.5 },
		scores,
		gradientEvidence: null,
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
		roleAssignment: null,
		gradientEvidence: null,
		pruningNotes: [],
	}
}

function sourceConnectedRole(value: CompletePaletteTreatment, role: Role): boolean {
	const color = value[role]
	return value.familyRoles[role] !== "generated" && !color.generated && !("generated" in color.support) &&
		color.support.anchorFamilyId === value.familyRoles[role] && color.support.regionIds.length > 0
}

function descriptor(
	value: CompletePaletteTreatment,
	options: Readonly<{
		lineageSourceConnected?: boolean
		fieldHypothesis?: FieldHypothesis
	}> = {},
): AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor {
	const fieldHypothesis = options.fieldHypothesis ?? field(value)
	return {
		treatment: value,
		fieldHypothesis,
		lineage: {
			fieldHypothesisId: value.sourceFieldHypothesisId,
			fieldDirectionKey: fieldDirectionKey(value),
			roleDirectionKeys: roleDirectionKeys(value),
			familyIds: [...new Set(Object.values(value.familyRoles)
				.filter((familyId): familyId is string => familyId !== "generated"))],
			representatives: ROLES.map((role) => ({
				role,
				familyId: value.familyRoles[role],
				hex: value[role].hex,
				strategy: value[role].strategy,
				sourceConnected: sourceConnectedRole(value, role),
			})),
			sourceConnected: options.lineageSourceConnected ?? true,
		},
	}
}

function candidate(
	value: CompletePaletteTreatment,
	descriptors: readonly AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor[] = [descriptor(value)],
): AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate {
	return { key: completeTreatmentKey(value), treatment: value, descriptors }
}

const EMERGENCY: EmergencyEligibility = Object.freeze({
	eligible: true,
	reason: "all-supported-pairs-effectively-contrastless",
	supportedPairCount: 3,
	maximumSupportedAbsoluteLc: 4.5,
	thresholdExclusive: 5,
})

function emergencyColor(hex: "#000000" | "#ffffff", emergency: EmergencyEligibility): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, 0, 0],
		hex,
		generated: true,
		strategy: "generated-emergency",
		support: {
			generated: true,
			role: "foreground",
			reason: emergency.reason === "not-eligible" ? "degenerate-supported-domain" : emergency.reason,
			supportedPairCount: emergency.supportedPairCount,
			maximumSupportedAbsoluteLc: emergency.maximumSupportedAbsoluteLc,
			thresholdExclusive: emergency.thresholdExclusive,
			preferencePenalty: 0.18,
		},
	}
}

function emergencyTreatment(label: string, emergency: EmergencyEligibility = EMERGENCY): CompletePaletteTreatment {
	const base = treatment(label, { quality: 0.7 })
	const generated = emergencyColor("#ffffff", emergency)
	return {
		...base,
		foreground: generated,
		accent: generated,
		familyRoles: { ...base.familyRoles, foreground: "generated", accent: "generated" },
		cardinality: 3,
		collapse: { ...base.collapse, accent: true },
		scores: { ...base.scores, generatedPenalty: 0.18 },
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

test("a stronger disconnected treatment cannot beat a nearby connected treatment", () => {
	const disconnected = treatment("strong-disconnected", { quality: 0.9 })
	const connected = treatment("nearby-connected", {
		quality: 0.84,
		colors: ["#193161", "#714161", "#efefef", "#dfa121"],
	})
	const selection = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: [
			candidate(disconnected, [descriptor(disconnected, { lineageSourceConnected: false })]),
			candidate(connected),
		],
	})

	assert.equal(selection.winner.key, completeTreatmentKey(connected))
	assert.equal(selection.fullDomainCustodySelection.explanation.winner.key, completeTreatmentKey(disconnected))
	assert.equal(selection.slate[0].key, selection.winner.key)
	assert.ok(selection.slate.length <= 8)
	assert.ok(selection.diagnostics.replacementQualityLoss > 0)
	assert.ok(selection.diagnostics.replacementQualityLoss <= 0.12)
	assert.ok(selection.slate.some(({ key }) => key === completeTreatmentKey(disconnected)))
	assert.equal(selection.diagnostics.fullDomainCandidateCount, 2)
	assert.equal(selection.diagnostics.winnerDomainCandidateCount, 1)
	assert.ok(selection.diagnostics.custody.every(({ qualityLossFromWinner }) => qualityLossFromWinner <= 0.12))
})

test("a canonical candidate is eligible when any retained alias has complete lineage", () => {
	const canonical = treatment("canonical-disconnected", { quality: 0.9 })
	const connectedAlias = treatment("connected-alias", {
		quality: 0.75,
		colors: ROLES.map((role) => canonical[role].hex) as unknown as readonly [string, string, string, string],
	})
	const domain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(canonical, [
			descriptor(canonical, { lineageSourceConnected: false }),
			descriptor(connectedAlias),
		]),
	])

	assert.equal(domain.eligibleCandidates.length, 1)
	assert.equal(domain.diagnostics.descriptorCount, 2)
	assert.equal(domain.diagnostics.candidates[0].ordinaryEligibleDescriptorCount, 1)
	assert.equal(domain.diagnostics.candidates[0].basis, "ordinary-complete-source-lineage")
})

test("wrong-family and empty-region role support cannot certify ordinary lineage", () => {
	const wrongFamily = treatment("wrong-family", {
		support: { foreground: { anchorFamilyId: "different-family" } },
	})
	const emptyRegion = treatment("empty-region", {
		colors: ["#203050", "#805060", "#f8f0e8", "#d09828"],
		support: { accent: { emptyRegions: true } },
	})
	const domain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(wrongFamily),
		candidate(emptyRegion),
	])

	assert.equal(domain.eligibleCandidates.length, 0)
	for (const entry of domain.diagnostics.candidates) {
		assert.equal(entry.descriptors[0].roleConnectionsComplete, false)
		assert.equal(entry.descriptors[0].ordinaryEligible, false)
	}
})

test("a disconnected field rejects a descriptor even when every treatment role is connected", () => {
	const value = treatment("disconnected-field")
	const disconnectedField = {
		...field(value),
		backgroundRepresentatives: [sourceColor(
			value.background.hex,
			value.familyRoles.background,
			{ emptyRegions: true },
		)],
	}
	const domain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(value, [descriptor(value, { fieldHypothesis: disconnectedField })]),
	])

	assert.equal(domain.eligibleCandidates.length, 0)
	assert.equal(domain.diagnostics.candidates[0].descriptors[0].roleConnectionsComplete, true)
	assert.equal(domain.diagnostics.candidates[0].descriptors[0].fieldConnectionComplete, false)
})

test("the exact certified one-color emergency is eligible and missing or inconsistent certificates fail closed", () => {
	const positive = emergencyTreatment("emergency-positive")
	const positiveDomain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(positive, [descriptor(positive, { lineageSourceConnected: false })]),
	], { emergency: EMERGENCY })
	assert.equal(positiveDomain.eligibleCandidates.length, 1)
	assert.equal(positiveDomain.diagnostics.candidates[0].basis, "normative-one-color-emergency")

	const absent = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(positive, [descriptor(positive, { lineageSourceConnected: false })]),
	])
	assert.equal(absent.eligibleCandidates.length, 0)

	const inconsistentDiagnosis: EmergencyEligibility = {
		...EMERGENCY,
		maximumSupportedAbsoluteLc: 5,
	}
	const inconsistent = emergencyTreatment("emergency-inconsistent", inconsistentDiagnosis)
	const inconsistentDomain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain([
		candidate(inconsistent, [descriptor(inconsistent, { lineageSourceConnected: false })]),
	], { emergency: inconsistentDiagnosis })
	assert.equal(inconsistentDomain.eligibleCandidates.length, 0)
})

test("an empty winner domain fails explicitly and never substitutes another result", () => {
	const value = treatment("no-eligible")
	assert.throws(() => selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: [candidate(value, [descriptor(value, { lineageSourceConnected: false })])],
	}), new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_NO_ELIGIBLE_ERROR))
})

test("a connected replacement outside the quality envelope is rejected", () => {
	const disconnected = treatment("envelope-disconnected", { quality: 0.95 })
	const connected = treatment("envelope-connected", {
		quality: 0.25,
		colors: ["#502010", "#805030", "#f8e8d0", "#20b0c0"],
	})
	assert.throws(() => selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: [
			candidate(disconnected, [descriptor(disconnected, { lineageSourceConnected: false })]),
			candidate(connected),
		],
	}), new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ENVELOPE_ERROR))
})

test("a matching precomputed full-domain selection is exactly equivalent to standalone fallback", () => {
	const disconnected = treatment("reuse-disconnected", { quality: 0.9 })
	const connected = treatment("reuse-connected", {
		quality: 0.84,
		colors: ["#193161", "#714161", "#efefef", "#dfa121"],
	})
	const candidates = [
		candidate(disconnected, [descriptor(disconnected, { lineageSourceConnected: false })]),
		candidate(connected),
	]
	const precomputed = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		candidates.map(({ treatment }) => treatment),
	)
	const fallback = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({ materialized: candidates })
	const reused = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: candidates,
		precomputedFullDomainRecoverySelection: precomputed,
	})

	assert.deepEqual(reused, fallback)
	assert.equal(reused.fullDomainCustodySelection, precomputed)
})

test("precomputed full-domain selection rejects missing and stale evaluation key sets", () => {
	const first = treatment("reuse-domain-first", { quality: 0.85 })
	const second = treatment("reuse-domain-second", {
		quality: 0.82,
		colors: ["#503020", "#806040", "#f8e8d0", "#20a0b0"],
	})
	const stale = treatment("reuse-domain-stale", {
		quality: 0.8,
		colors: ["#203850", "#506878", "#f8f8e8", "#d09020"],
	})
	const candidates = [candidate(first), candidate(second)]
	const matching = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([first, second])
	const missing = { ...matching, evaluations: matching.evaluations.slice(0, 1) }
	const staleSelection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2([first, stale])

	for (const precomputedFullDomainRecoverySelection of [missing, staleSelection]) {
		assert.throws(() => selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
			materialized: candidates,
			precomputedFullDomainRecoverySelection,
		}), new Error(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_PRECOMPUTED_DOMAIN_ERROR,
		))
	}
})

test("winner eligibility, selection, and public custody are permutation invariant", () => {
	const first = treatment("permutation-first", { quality: 0.82 })
	const second = treatment("permutation-second", {
		quality: 0.8,
		colors: ["#603030", "#906050", "#fff0d0", "#30c080"],
	})
	const disconnected = treatment("permutation-disconnected", {
		quality: 0.85,
		colors: ["#203850", "#506878", "#f8f8e8", "#d09020"],
	})
	const alias = treatment("permutation-alias", {
		quality: 0.7,
		colors: ROLES.map((role) => first[role].hex) as unknown as readonly [string, string, string, string],
	})
	const candidates = [
		candidate(first, [descriptor(first), descriptor(alias)]),
		candidate(second),
		candidate(disconnected, [descriptor(disconnected, { lineageSourceConnected: false })]),
	]
	const forward = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({ materialized: candidates })
	const reverse = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: [...candidates].reverse().map((value) => ({
			...value,
			descriptors: [...value.descriptors].reverse(),
		})),
		precomputedFullDomainRecoverySelection: forward.fullDomainCustodySelection,
	})

	assert.equal(reverse.fullDomainCustodySelection, forward.fullDomainCustodySelection)
	assert.equal(forward.winner.key, reverse.winner.key)
	assert.deepEqual(forward.slate.map(({ key }) => key), reverse.slate.map(({ key }) => key))
	assert.deepEqual(forward.eligibility.diagnostics, reverse.eligibility.diagnostics)
	assert.deepEqual(forward.diagnostics, reverse.diagnostics)
})

test("the standalone attempt retains the full domain while publishing only its bounded custody slate", () => {
	const result = extractAlbumArtworkPaletteV2Phase3CompleteLineageWinner(transitionField())
	const diagnostics = result.diagnostics.phase3ArmCompleteLineageWinner

	assert.equal(result.version, "phase-3-arm-complete-lineage-winner")
	assert.equal(result.alternatives[0], result.winner)
	assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 8)
	assert.equal(diagnostics.selection.fullDomainCandidateCount,
		diagnostics.eligibility.materializedCandidateCount)
	assert.equal(diagnostics.selection.winnerDomainCandidateCount,
		diagnostics.eligibility.eligibleCandidateCount)
	assert.ok(diagnostics.selection.fullDomainCandidateCount >=
		diagnostics.selection.winnerDomainCandidateCount)
	assert.ok(diagnostics.selection.winnerDomainCandidateCount > 0)
	assert.equal(diagnostics.winnerSelector.domain.materializedTreatmentCount,
		diagnostics.selection.winnerDomainCandidateCount)
	assert.equal(diagnostics.fullDomainCustodySelector.domain.materializedTreatmentCount,
		diagnostics.selection.fullDomainCandidateCount)
	assert.ok(diagnostics.selection.custody.every(({ qualityLossFromWinner }) => qualityLossFromWinner <= 0.12))
})

test("the arm is isolated from metadata, outcomes, and shared orchestration", async () => {
	const sources = await Promise.all([
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts",
			import.meta.url,
		), "utf8"),
		readFile(new URL(
			"../src/album-artwork-palette-v2-phase-3-arm-complete-lineage-winner.ts",
			import.meta.url,
		), "utf8"),
	])
	for (const source of sources) {
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:development-[0-9]+|caseId|artworkId|pathname|filePath|feedback|review|manifest|target.?color|historical)/iu)
		assert.doesNotMatch(source,
			/(?:closedDetails\.result\.(?:winner|alternatives)|fallback|provenance|qualityReward)/iu)
	}
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT.identity.attemptId,
		"phase-3-arm-complete-lineage-winner")
})
