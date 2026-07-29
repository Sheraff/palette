import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
} from "../src/album-artwork-palette-v2.ts"
import type {
	CompletePaletteScores,
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY,
	reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement,
} from "../src/album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import type {
	AlbumArtworkPaletteV2Phase3RawRelationSlateComplementInput,
	AlbumArtworkPaletteV2Phase3RawRelationSlateComplementLineageEligibility,
} from "../src/album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { OKLab, RGB } from "../src/types.ts"

const ROLES = ["background", "surface", "foreground", "accent"] as const

const SCORES: CompletePaletteScores = Object.freeze({
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

function encodedChannel(seed: number, roleIndex: number, shift: number): number {
	return (seed * 47 + roleIndex * 61 + shift) % 256
}

function roleColor(seed: number, roleIndex: number, familyId: string, oklab: OKLab): PaletteRoleColor {
	const rgb: RGB = [
		encodedChannel(seed, roleIndex, 17),
		encodedChannel(seed, roleIndex, 83),
		encodedChannel(seed, roleIndex, 149),
	]
	const hex = `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
	return {
		rgb,
		oklab,
		hex,
		generated: false,
		strategy: "dense-exact",
		support: {
			exactSource: true,
			exemplar: { x: 0, y: 0 },
			anchorFamilyId: familyId,
			regionIds: [`region:${familyId}`],
			perceptualDensity: 0.8,
			totalSupport: 0.2,
			connectedSupport: 0.16,
			spatialCoverage: 0.75,
			concentration: 0.8,
			prototypeDistance: 0,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

function treatment(seed: number, labBase = 0.1 + seed * 0.055): CompletePaletteTreatment {
	const familyIds = ROLES.map((role) => `${role}-family:${seed}`)
	const colors = ROLES.map((_, roleIndex) => roleColor(
		seed,
		roleIndex,
		familyIds[roleIndex],
		[labBase + roleIndex * 0.01, roleIndex * 0.003, -roleIndex * 0.002],
	))
	return {
		id: `treatment:${seed}`,
		background: colors[0],
		surface: colors[1],
		foreground: colors[2],
		accent: colors[3],
		gradient: false,
		fieldTreatment: "separate-flat-fields",
		sourceFieldHypothesisId: `field:${seed}`,
		familyRoles: {
			background: familyIds[0],
			surface: familyIds[1],
			foreground: familyIds[2],
			accent: familyIds[3],
		},
		cardinality: 4,
		collapse: { surface: false, accent: false },
		contrast: {
			pairs: [{
				role: "foreground",
				fieldRole: "background",
				position: 0,
				signedLc: 60,
				absoluteLc: 60,
			}],
			minimumAbsoluteLc: 60,
			meanAbsoluteLc: 60,
		},
		scores: SCORES,
		gradientEvidence: null,
	}
}

function evaluation(
	value: CompletePaletteTreatment,
	qualityUtility: number,
	relationUtility: number,
	options: Readonly<{ paretoMember?: boolean; identityGain?: number }> = {},
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation {
	const quality = Object.fromEntries(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES
		.map((axis) => [axis, axis === "renderedGradientSalience" ? 0 : qualityUtility])) as
		AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality
	const key = completeTreatmentKey(value)
	return {
		key,
		structuralKey: `${key}\0${value.id}`,
		treatment: value,
		gradientStatus: "not-applicable",
		quality,
		evidenceLevels: Object.fromEntries(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES.map((axis) =>
				[axis, Math.floor((quality[axis] + 1e-12) / 0.04)]),
		) as AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["evidenceLevels"],
		qualityUtility,
		identityCoverage: 0,
		identityGain: options.identityGain ?? Math.max(0, relationUtility - qualityUtility),
		identityRoles: [],
		relationUtility,
		paretoMember: options.paretoMember ?? true,
		dominatedByKey: options.paretoMember === false ? "dominator" : null,
	}
}

type LineageBasis = "ordinary" | "emergency" | "none"

function lineageEligibility(
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[],
	basisByKey: ReadonlyMap<string, LineageBasis>,
): AlbumArtworkPaletteV2Phase3RawRelationSlateComplementLineageEligibility {
	return {
		diagnostics: {
			candidates: evaluations.map(({ key }) => {
				const basis = basisByKey.get(key) ?? "none"
				return {
					key,
					descriptorCount: 1,
					ordinaryEligibleDescriptorCount: basis === "ordinary" ? 1 : 0,
					normativeEmergencyEligibleDescriptorCount: basis === "emergency" ? 1 : 0,
					eligible: basis !== "none",
					basis: basis === "ordinary"
						? "ordinary-complete-source-lineage" as const
						: basis === "emergency"
							? "normative-one-color-emergency" as const
							: "ineligible" as const,
					descriptors: [],
				}
			}),
		},
	}
}

function input(options: Readonly<{
	recoveryWinner: CompletePaletteTreatment
	ordinarySlate: readonly CompletePaletteTreatment[]
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[]
	currentWinner?: CompletePaletteTreatment
	currentSlate?: readonly CompletePaletteTreatment[]
	lineage?: ReadonlyMap<string, LineageBasis>
	lineageEvaluations?: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[]
}>): AlbumArtworkPaletteV2Phase3RawRelationSlateComplementInput {
	const currentWinner = options.currentWinner ?? options.recoveryWinner
	return {
		current: {
			winner: currentWinner,
			slate: options.currentSlate ?? [currentWinner],
		},
		recoveryV2: {
			winner: options.recoveryWinner,
			slate: options.ordinarySlate,
			evaluations: options.evaluations,
		},
		completeLineageEligibility: lineageEligibility(
			options.lineageEvaluations ?? options.evaluations,
			options.lineage ?? new Map(options.evaluations.map(({ key }) => [key, "ordinary" as const])),
		),
	}
}

function diagnostic(
	result: ReturnType<typeof reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement>,
	value: CompletePaletteTreatment,
) {
	return result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(value))!
}

test("raw relation utility must be strictly superior and never receives winner authority", () => {
	const winner = treatment(1)
	const equal = treatment(2)
	const superior = treatment(3)
	const evaluations = [
		evaluation(winner, 0.8, 0.82),
		evaluation(equal, 0.81, 0.82),
		evaluation(superior, 0.8, 0.820_001),
	]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, equal, superior],
		evaluations,
	}))

	assert.strictEqual(result.winner, winner)
	assert.strictEqual(result.slate[0], winner)
	assert.strictEqual(result.slate[1], superior)
	assert.equal(result.diagnostics.outcome.winnerAuthorityChanged, false)
	assert.ok(diagnostic(result, equal).rejectionReasons.includes("raw-relation-not-strictly-superior"))
	assert.equal(diagnostic(result, superior).eligible, true)
})

test("the existing quality boundary is inclusive and a treatment just outside it is rejected", () => {
	const winner = treatment(4)
	const boundary = treatment(5)
	const outside = treatment(6)
	const evaluations = [
		evaluation(winner, 0.8, 0.8),
		evaluation(boundary, 0.68, 0.82),
		evaluation(outside, 0.679, 0.83),
	]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, outside, boundary],
		evaluations,
	}))

	assert.strictEqual(result.slate[1], boundary)
	assert.equal(diagnostic(result, boundary).qualityLossFromRecoveryV2Winner,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY.maximumQualityLoss)
	assert.ok(diagnostic(result, outside).rejectionReasons.includes("outside-quality-bound"))
})

test("only a Pareto member with ordinary complete source-connected lineage qualifies", () => {
	const winner = treatment(7)
	const emergency = treatment(8)
	const disconnected = treatment(9)
	const ordinary = treatment(10)
	const dominated = treatment(41)
	const evaluations = [
		evaluation(winner, 0.8, 0.8),
		evaluation(emergency, 0.8, 0.84),
		evaluation(disconnected, 0.8, 0.83),
		evaluation(ordinary, 0.8, 0.81),
		evaluation(dominated, 0.8, 0.85, { paretoMember: false }),
	]
	const basis = new Map<string, LineageBasis>([
		[completeTreatmentKey(winner), "ordinary"],
		[completeTreatmentKey(emergency), "emergency"],
		[completeTreatmentKey(disconnected), "none"],
		[completeTreatmentKey(ordinary), "ordinary"],
		[completeTreatmentKey(dominated), "ordinary"],
	])
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, emergency, disconnected, ordinary, dominated],
		evaluations,
		lineage: basis,
	}))

	assert.strictEqual(result.slate[1], ordinary)
	assert.ok(diagnostic(result, emergency).rejectionReasons
		.includes("lacks-ordinary-complete-source-lineage"))
	assert.ok(diagnostic(result, disconnected).rejectionReasons
		.includes("lacks-ordinary-complete-source-lineage"))
	assert.ok(diagnostic(result, dominated).rejectionReasons.includes("not-pareto-member"))
})

test("no qualifying ordinary slate treatment is an exact no-op", () => {
	const winner = treatment(11)
	const present = treatment(12)
	const evaluationOnly = treatment(13)
	const currentSlate = [winner, present]
	const evaluations = [
		evaluation(winner, 0.8, 0.8),
		evaluation(present, 0.8, 0.82),
		evaluation(evaluationOnly, 0.8, 0.83),
	]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, present],
		evaluations,
		currentSlate,
	}))

	assert.strictEqual(result.winner, winner)
	assert.strictEqual(result.slate, currentSlate)
	assert.equal(result.diagnostics.outcome.exactNoOp, true)
	assert.equal(result.diagnostics.outcome.reservedComplementKey, null)
	assert.ok(diagnostic(result, present).rejectionReasons.includes("present-in-current-custody"))
	assert.equal(result.diagnostics.candidates.some(({ key }) => key === completeTreatmentKey(evaluationOnly)), false)
})

test("a reserved complement replaces an existing visually-near treatment", () => {
	const winner = treatment(14, 0.2)
	const nearExisting = treatment(15, 0.6)
	const complement = treatment(16, 0.61)
	const retained = treatment(17, 0.9)
	const evaluations = [
		evaluation(winner, 0.8, 0.8),
		evaluation(complement, 0.8, 0.81),
	]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, complement],
		evaluations,
		currentSlate: [winner, nearExisting, retained],
	}))

	assert.deepEqual(result.slate, [winner, complement, retained])
	assert.deepEqual(result.diagnostics.outcome.displacedCurrentCustodyKeys,
		[completeTreatmentKey(nearExisting)])
})

test("a full custody slate displaces its last retained treatment", () => {
	const winner = treatment(18)
	const complement = treatment(19)
	const reserves = Array.from({ length: 7 }, (_, index) => treatment(20 + index))
	const evaluations = [evaluation(winner, 0.8, 0.8), evaluation(complement, 0.8, 0.81)]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner: winner,
		ordinarySlate: [winner, complement],
		evaluations,
		currentSlate: [winner, ...reserves],
	}))

	assert.equal(result.slate.length, 8)
	assert.deepEqual(result.slate, [winner, complement, ...reserves.slice(0, 6)])
	assert.deepEqual(result.diagnostics.outcome.displacedCurrentCustodyKeys,
		[completeTreatmentKey(reserves[6])])
})

test("an integrated-style winner remains first while complement custody stays capped", () => {
	const recoveryWinner = treatment(27)
	const currentWinner = treatment(28)
	const complement = treatment(29)
	const reserves = Array.from({ length: 6 }, (_, index) => treatment(30 + index))
	const evaluations = [
		evaluation(recoveryWinner, 0.8, 0.8),
		evaluation(currentWinner, 0.79, 0.79),
		evaluation(complement, 0.8, 0.81),
	]
	const result = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(input({
		recoveryWinner,
		ordinarySlate: [recoveryWinner, complement],
		evaluations,
		currentWinner,
		currentSlate: [currentWinner, recoveryWinner, ...reserves],
	}))

	assert.strictEqual(result.winner, currentWinner)
	assert.strictEqual(result.slate[0], currentWinner)
	assert.strictEqual(result.slate[1], complement)
	assert.equal(result.slate.length, 8)
	assert.equal(result.slate.includes(recoveryWinner), true)
})

test("eligible ordering, selection, and diagnostics are permutation invariant", () => {
	const winner = treatment(36)
	const first = treatment(37)
	const second = treatment(38)
	const evaluations = [
		evaluation(winner, 0.8, 0.8),
		evaluation(first, 0.79, 0.81, { identityGain: 0.02 }),
		evaluation(second, 0.79, 0.81, { identityGain: 0.02 }),
	]
	const ordinarySlate = [winner, first, second]
	const forwardInput = input({ recoveryWinner: winner, ordinarySlate, evaluations })
	const reverseInput = input({
		recoveryWinner: winner,
		ordinarySlate: [...ordinarySlate].reverse(),
		evaluations: [...evaluations].reverse(),
		lineageEvaluations: [...evaluations].reverse(),
	})
	const forward = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(forwardInput)
	const reverse = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(reverseInput)
	const expected = [first, second].sort((left, right) =>
		completeTreatmentKey(left) < completeTreatmentKey(right) ? -1 : 1)[0]

	assert.strictEqual(forward.slate[1], expected)
	assert.equal(completeTreatmentKey(reverse.slate[1]), completeTreatmentKey(expected))
	assert.deepEqual(forward.slate.map(completeTreatmentKey), reverse.slate.map(completeTreatmentKey))
	assert.deepEqual(forward.diagnostics, reverse.diagnostics)
})

test("repeated reservation is deterministic", () => {
	const winner = treatment(39)
	const complement = treatment(40)
	const evaluations = [evaluation(winner, 0.8, 0.8), evaluation(complement, 0.79, 0.81)]
	const stableInput = input({
		recoveryWinner: winner,
		ordinarySlate: [winner, complement],
		evaluations,
	})
	const first = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(stableInput)
	const second = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(stableInput)

	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.deepEqual(first.diagnostics.eligibleComplementKeysInOrder,
		[completeTreatmentKey(complement)])
})

test("the mechanism is an isolated metadata-free post-selection reservation", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts",
		import.meta.url,
	), "utf8")

	assert.match(source, /AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection/u)
	assert.match(source, /AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain/u)
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	assert.doesNotMatch(source,
		/(?:constructAlbumArtwork|materializeAlbumArtwork|extractAlbumArtwork|buildAlbumArtwork|assignFieldRoles)/u)
	assert.doesNotMatch(source,
		/album-artwork-palette-v2-phase-3-(?:integrated-candidate|recovery-v3|recovery-custody-v3|contract)\.ts|run-album-artwork-palette/u)
	assert.match(source, /winner:\s*input\.current\.winner/u)
})
