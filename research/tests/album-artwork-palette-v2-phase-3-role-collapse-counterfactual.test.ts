import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	GradientFieldEvidence,
	PaletteRoleColor,
	RecallAuditTreatmentLineage,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_ID,
	diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual,
	serializeAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual,
} from "../src/album-artwork-palette-v2-phase-3-role-collapse-counterfactual.ts"
import type {
	AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate,
	AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput,
	AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation,
} from "../src/album-artwork-palette-v2-phase-3-role-collapse-counterfactual.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RGB } from "../src/types.ts"

const DEFAULT_SCORES: CompletePaletteScores = Object.freeze({
	fieldFidelity: 0.5,
	surfaceFidelity: 0.5,
	fieldStructure: 0.5,
	fieldIdentity: 0.5,
	treatmentFoundation: 0.5,
	activeRolePathObservability: 0.5,
	artworkIdentity: 0.5,
	representativeness: 0.5,
	uiUtility: 0.5,
	foregroundUtility: 0.5,
	foregroundPolarityAgreement: 0.5,
	accentFidelity: 0.5,
	accentUtility: 0.5,
	coherence: 0.5,
	economy: 0.5,
	generatorConfidence: 0.5,
	foundation: 0.5,
	balance: 0.5,
	generatedPenalty: 0,
	rankingScore: 0.5,
})

const DEFAULT_QUALITY: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality = Object.freeze({
	fieldFidelity: 0.5,
	surfaceFidelity: 0.5,
	artworkIdentity: 0.5,
	representativeness: 0.5,
	sourceSupport: 0.5,
	renderedGradientSalience: 0.5,
	foregroundPath: 0.5,
	accentFidelity: 0.5,
	accentPath: 0.5,
	coherence: 0.5,
	economy: 0.5,
})

type TreatmentOptions = Readonly<{
	fieldHypothesisId: string
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
	gradient?: boolean
	direction?: GradientFieldEvidence["direction"]
	background?: string
	surface?: string
	foreground?: string
	accent?: string
	scores?: Partial<CompletePaletteScores>
}>

function rgb(hex: string): RGB {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
}

function roleColor(hex: string, familyId: string, support = 0.5): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, (value[1] - 127) / 510, (value[2] - 127) / 510],
		hex,
		generated: false,
		strategy: "dense-exact",
		support: {
			exactSource: true,
			exemplar: { x: 2, y: 3 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: support,
			totalSupport: support / 4,
			connectedSupport: support / 5,
			spatialCoverage: support,
			concentration: support,
			prototypeDistance: 0.01,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

function gradientEvidence(
	backgroundFamilyId: string,
	surfaceFamilyId: string,
	direction: GradientFieldEvidence["direction"],
): GradientFieldEvidence {
	return {
		topology: "linear",
		direction,
		endpointBands: [0.15, 0.85],
		progression: 0.8,
		modeProgression: 0.75,
		monotonicity: 0.85,
		residual: 0.02,
		span: 0.2,
		texture: 0.03,
		bandDispersion: 0.04,
		edgeContinuity: 0.8,
		coverage: 0.8,
		supportingFamilyIds: [backgroundFamilyId, surfaceFamilyId],
		supportingEndpointHexes: ["#102030", "#405060"],
		backgroundTopologyEndpoint: "low",
		roleAssignment: {
			backgroundFamilyId,
			surfaceFamilyId,
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
		fieldDomainId: "field-domain",
		fieldDomainPopulationFraction: 0.7,
		fieldDomainBorderCoverage: 0.8,
		fieldDomainOwnedCornerCount: 4,
		supportingComponentIds: ["field-component"],
	}
}

function treatment(options: TreatmentOptions): CompletePaletteTreatment {
	const surfaceCollapsed = options.surfaceCollapsed ?? false
	const accentCollapsed = options.accentCollapsed ?? false
	const gradient = options.gradient ?? false
	const background = roleColor(options.background ?? "#102030", "family-background")
	const surface = surfaceCollapsed
		? background
		: roleColor(options.surface ?? "#405060", "family-surface")
	const foreground = roleColor(options.foreground ?? "#f0f0f0", "family-foreground")
	const accent = accentCollapsed
		? foreground
		: roleColor(options.accent ?? "#d07030", "family-accent")
	const colors = [background.hex, surface.hex, foreground.hex, accent.hex]
	const cardinality = new Set(colors).size as 2 | 3 | 4
	return {
		id: `${options.fieldHypothesisId}:${surfaceCollapsed}:${accentCollapsed}:${gradient}:${colors.join(":")}`,
		background,
		surface,
		foreground,
		accent,
		gradient,
		fieldTreatment: gradient
			? "gradient-field"
			: surfaceCollapsed ? "one-field" : "separate-flat-fields",
		sourceFieldHypothesisId: options.fieldHypothesisId,
		familyRoles: {
			background: "family-background",
			surface: surfaceCollapsed ? "family-background" : "family-surface",
			foreground: "family-foreground",
			accent: accentCollapsed ? "family-foreground" : "family-accent",
		},
		cardinality,
		collapse: { surface: surfaceCollapsed, accent: accentCollapsed },
		contrast: {
			pairs: [
				{ role: "foreground", fieldRole: "background", position: 0, signedLc: 80, absoluteLc: 80 },
				...accentCollapsed ? [] : [{
					role: "accent" as const,
					fieldRole: "background" as const,
					position: 0,
					signedLc: 45,
					absoluteLc: 45,
				}],
			],
			minimumAbsoluteLc: 45,
			meanAbsoluteLc: 62.5,
		},
		scores: { ...DEFAULT_SCORES, ...options.scores },
		gradientEvidence: gradient
			? gradientEvidence("family-background", "family-surface", options.direction ?? "horizontal")
			: null,
	}
}

function lineage(value: CompletePaletteTreatment): RecallAuditTreatmentLineage {
	const roles = ["background", "surface", "foreground", "accent"] as const
	return {
		fieldHypothesisId: value.sourceFieldHypothesisId,
		fieldDirectionKey: [
			value.fieldTreatment,
			value.familyRoles.background,
			value.collapse.surface ? "=" : value.familyRoles.surface,
			value.gradient ? "gradient" : "flat",
		].join(":"),
		roleDirectionKeys: [
			`foreground:${value.familyRoles.foreground}`,
			...value.collapse.accent ? [] : [`accent:${value.familyRoles.accent}`],
		],
		familyIds: [...new Set(Object.values(value.familyRoles))].sort(),
		representatives: roles.map((role) => ({
			role,
			familyId: value.familyRoles[role],
			hex: value[role].hex,
			strategy: value[role].strategy,
			sourceConnected: true,
		})),
		sourceConnected: true,
	}
}

function candidate(
	key: string,
	value: CompletePaletteTreatment,
	sourceType = "native-field-transition",
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualCandidate {
	return {
		key,
		treatment: value,
		descriptors: [{ sourceType, treatment: value, lineage: lineage(value) }],
	}
}

function evaluation(
	key: string,
	quality: Partial<AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality> = {},
	values: Partial<Pick<AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation,
		"qualityUtility" | "identityCoverage" | "identityGain" | "relationUtility" | "paretoMember">> = {},
): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualRecoveryEvaluation {
	return {
		key,
		quality: { ...DEFAULT_QUALITY, ...quality },
		qualityUtility: values.qualityUtility ?? 0.5,
		identityCoverage: values.identityCoverage ?? 0.5,
		identityGain: values.identityGain ?? 0.025,
		relationUtility: values.relationUtility ?? 0.525,
		paretoMember: values.paretoMember ?? true,
		dominatedByKey: null,
	}
}

function exactInput(): AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput {
	const accentDistinct = treatment({
		fieldHypothesisId: "gradient-field",
		gradient: true,
		scores: { representativeness: 0.5, coherence: 0.5 },
	})
	const accentCollapsed = treatment({
		fieldHypothesisId: "gradient-field",
		gradient: true,
		accentCollapsed: true,
		scores: { representativeness: 0.75, coherence: 0.75 },
	})
	const surfaceDistinct = treatment({ fieldHypothesisId: "flat-field" })
	const surfaceCollapsed = treatment({ fieldHypothesisId: "flat-field", surfaceCollapsed: true })
	return {
		candidates: [
			candidate("surface-collapsed", surfaceCollapsed),
			candidate("accent-distinct", accentDistinct),
			candidate("surface-distinct", surfaceDistinct),
			candidate("accent-collapsed", accentCollapsed),
		],
		recoveryEvaluations: [
			evaluation("surface-collapsed"),
			evaluation("accent-distinct", {
				representativeness: 0.5,
				sourceSupport: 0.5,
				foregroundPath: 0.75,
				accentPath: 0.5,
				coherence: 0.5,
			}, { qualityUtility: 0.5, identityCoverage: 0.75, identityGain: 0.04, relationUtility: 0.54 }),
			evaluation("surface-distinct"),
			evaluation("accent-collapsed", {
				representativeness: 0.75,
				sourceSupport: 0.75,
				foregroundPath: 0.5,
				accentPath: 0.75,
				coherence: 0.75,
			}, { qualityUtility: 0.75, identityCoverage: 0.5, identityGain: 0.025, relationUtility: 0.775 }),
		],
		obligations: [
			{ id: "accent-obligation", familyId: "family-accent", fieldHypothesisId: "gradient-field",
				requiredRole: "accent", priority: 0 },
			{ id: "foreground-obligation", familyId: "family-foreground", requiredRole: "foreground", priority: 1 },
		],
		selection: {
			winnerKey: "accent-distinct",
			slateKeys: ["accent-distinct", "surface-collapsed"],
		},
	}
}

test("pairs exact accent and flat-surface siblings and serializes granular deltas", () => {
	const report = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(exactInput())
	assert.equal(report.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_COLLAPSE_COUNTERFACTUAL_ID)
	assert.deepEqual(report.counts, {
		candidateCount: 4,
		recoveryEvaluationCount: 4,
		exactPairCount: 2,
		accentPairCount: 1,
		surfacePairCount: 1,
	})
	assert.deepEqual(report.pairs.map(({ role, distinctKey, collapsedKey }) =>
		[role, distinctKey, collapsedKey]), [
		["accent", "accent-distinct", "accent-collapsed"],
		["surface", "surface-distinct", "surface-collapsed"],
	])
	const accent = report.pairs[0]
	assert.equal(accent.match.topology, "linear")
	assert.equal(accent.match.direction, "horizontal")
	assert.equal(accent.scores.delta.representativeness, -0.25)
	assert.equal(accent.recovery.quality.delta.sourceSupport, -0.25)
	assert.equal(accent.recovery.qualityUtility.delta, -0.25)
	assert.equal(accent.recovery.relationUtility.delta, -0.235)
	assert.deepEqual(accent.cost, {
		convention: "collapsed-minus-distinct; positive values are costs of retaining the distinct role",
		representativeness: 0.25,
		sourceSupport: 0.25,
	})
	assert.equal(accent.pathAndCoherence.foregroundPath.delta, 0.25)
	assert.equal(accent.pathAndCoherence.accentPath.delta, -0.25)
	assert.equal(accent.pathAndCoherence.coherence.delta, -0.25)
	assert.deepEqual(accent.obligations.gainedByDistinctIds, ["accent-obligation"])
	assert.deepEqual(accent.obligations.lostByDistinctIds, [])
	assert.deepEqual(accent.selectionPresence, {
		distinct: { winner: true, slate: true, slateIndex: 0 },
		collapsed: { winner: false, slate: false, slateIndex: null },
	})
	assert.deepEqual(JSON.parse(serializeAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(report)), report)
})

test("rejects field, representative source-support, and lineage-source mismatches", () => {
	const fieldDistinct = treatment({ fieldHypothesisId: "field-a" })
	const fieldCollapsed = treatment({ fieldHypothesisId: "field-b", accentCollapsed: true })
	const supportDistinct = treatment({ fieldHypothesisId: "field-support" })
	const supportCollapsedBase = treatment({ fieldHypothesisId: "field-support", accentCollapsed: true })
	const changedBackground = roleColor("#102030", "family-background", 0.75)
	const supportCollapsed: CompletePaletteTreatment = {
		...supportCollapsedBase,
		background: changedBackground,
	}
	const sourceDistinct = treatment({ fieldHypothesisId: "field-source" })
	const sourceCollapsed = treatment({ fieldHypothesisId: "field-source", accentCollapsed: true })
	const candidates = [
		candidate("field-distinct", fieldDistinct),
		candidate("field-collapsed", fieldCollapsed),
		candidate("support-distinct", supportDistinct),
		candidate("support-collapsed", supportCollapsed),
		candidate("source-distinct", sourceDistinct, "source-a"),
		candidate("source-collapsed", sourceCollapsed, "source-b"),
	]
	const report = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual({
		candidates,
		recoveryEvaluations: candidates.map(({ key }) => evaluation(key)),
		selection: { winnerKey: "field-distinct", slateKeys: ["field-distinct"] },
	})
	assert.equal(report.counts.exactPairCount, 0)
})

test("allows topology-identical accent gradients but constrains surface pairs to exact flat forms", () => {
	const values = [
		candidate("gradient-accent-distinct", treatment({ fieldHypothesisId: "gradient-ok", gradient: true })),
		candidate("gradient-accent-collapsed", treatment({
			fieldHypothesisId: "gradient-ok", gradient: true, accentCollapsed: true,
		})),
		candidate("topology-distinct", treatment({ fieldHypothesisId: "gradient-mismatch", gradient: true })),
		candidate("topology-collapsed", treatment({
			fieldHypothesisId: "gradient-mismatch", gradient: true, accentCollapsed: true, direction: "vertical",
		})),
		candidate("gradient-surface-distinct", treatment({ fieldHypothesisId: "surface-gradient", gradient: true })),
		candidate("gradient-surface-collapsed", treatment({
			fieldHypothesisId: "surface-gradient", gradient: true, surfaceCollapsed: true,
		})),
		candidate("flat-surface-distinct", treatment({ fieldHypothesisId: "surface-flat" })),
		candidate("flat-surface-collapsed", treatment({ fieldHypothesisId: "surface-flat", surfaceCollapsed: true })),
	]
	const report = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual({
		candidates: values,
		recoveryEvaluations: values.map(({ key }) => evaluation(key)),
		selection: { winnerKey: "gradient-accent-distinct", slateKeys: ["gradient-accent-distinct"] },
	})
	assert.deepEqual(report.pairs.map(({ role, distinctKey, collapsedKey }) =>
		[role, distinctKey, collapsedKey]), [
		["accent", "gradient-accent-distinct", "gradient-accent-collapsed"],
		["surface", "flat-surface-distinct", "flat-surface-collapsed"],
	])
})

test("does not mutate inputs and orders pairings independently of candidate, evaluation, and lineage order", () => {
	const base = exactInput()
	const withLineages = base.candidates.map((entry) => {
		const value = lineage(entry.treatment)
		return {
			key: entry.key,
			treatment: entry.treatment,
			lineages: [
				{ sourceType: "z-source", lineage: value },
				{ sourceType: "a-source", lineage: value },
			],
		}
	})
	const first: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput = {
		...base,
		candidates: [...withLineages].reverse(),
		recoveryEvaluations: [...base.recoveryEvaluations].reverse(),
		obligations: [...base.obligations!].reverse(),
	}
	const second: AlbumArtworkPaletteV2Phase3RoleCollapseCounterfactualInput = {
		...base,
		candidates: withLineages.map((entry) => ({ ...entry, lineages: [...entry.lineages].reverse() })),
	}
	const before = JSON.stringify(first)
	const firstReport = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(first)
	const secondReport = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(second)
	assert.equal(JSON.stringify(first), before)
	assert.equal(JSON.stringify(firstReport), JSON.stringify(secondReport))
	assert.equal(firstReport.pairs[0].match.sourceType, "a-source")
})

test("is diagnostic-only and always reports zero selection and inference deltas", async () => {
	const input = exactInput()
	const report = diagnoseAlbumArtworkPaletteV2Phase3RoleCollapseCounterfactual(input)
	assert.deepEqual(report.selection, {
		observedWinnerKey: input.selection.winnerKey,
		observedSlateKeys: input.selection.slateKeys,
	})
	assert.deepEqual(report.selectionDeltas, {
		winner: 0,
		slate: 0,
		discovery: 0,
		materialization: 0,
		runtimeInference: 0,
	})
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-role-collapse-counterfactual.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:selectAlbum|discoverNative|materializeAlbum|extractAlbum|Math\.random|development-[0-9]+)/u)
})
