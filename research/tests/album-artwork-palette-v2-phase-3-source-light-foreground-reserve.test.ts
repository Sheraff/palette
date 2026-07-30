import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_POLICY,
	reserveAlbumArtworkPaletteV2Phase3SourceLightForeground,
} from "../src/album-artwork-palette-v2-phase-3-arm-source-light-foreground-reserve.ts"
import type {
	AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveInput,
} from "../src/album-artwork-palette-v2-phase-3-arm-source-light-foreground-reserve.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve,
} from "../src/album-artwork-palette-v2-phase-3-source-light-foreground-reserve-attempt.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT as CONTRACT_SOURCE_LIGHT_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID as CONTRACT_SOURCE_LIGHT_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID as CONTRACT_SOURCE_LIGHT_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve as extractContractSourceLightForegroundReserve,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import type {
	FieldConditionalRoleEvidence,
} from "../src/album-artwork-palette-v2-phase-3-role-aware.ts"
import {
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"
import type { RGB, RawImage } from "../src/types.ts"

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

function rgb(hex: string): RGB {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
}

function sourceColor(hex: string, familyId: string): PaletteRoleColor {
	const value = rgb(hex)
	return {
		rgb: value,
		oklab: [value[0] / 255, (value[1] - 128) / 512, (value[2] - 128) / 512],
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
			connectedSupport: 0.15,
			spatialCoverage: 0.7,
			concentration: 0.7,
			prototypeDistance: 0,
			outlierScore: 0.1,
			synthesis: null,
		},
	}
}

type TreatmentOptions = Readonly<{
	foregroundHex?: string
	foregroundFamily?: string
	fieldId?: string
	fieldTreatment?: CompletePaletteTreatment["fieldTreatment"]
	backgroundHex?: string
	surfaceHex?: string
	accentHex?: string
	backgroundFamily?: string
	surfaceFamily?: string
	accentFamily?: string
	foregroundSignedLc?: readonly number[]
}>

function treatment(label: string, options: TreatmentOptions = {}): CompletePaletteTreatment {
	const backgroundFamily = options.backgroundFamily ?? "field-background"
	const surfaceFamily = options.surfaceFamily ?? "field-surface"
	const foregroundFamily = options.foregroundFamily ?? `foreground:${label}`
	const accentFamily = options.accentFamily ?? "field-accent"
	const foregroundSignedLc = options.foregroundSignedLc ?? [-72, -61]
	const pairs = [
		...foregroundSignedLc.map((signedLc, index) => ({
			role: "foreground" as const,
			fieldRole: index === 0 ? "background" as const : "surface" as const,
			position: index,
			signedLc,
			absoluteLc: Math.abs(signedLc),
		})),
		{ role: "accent" as const, fieldRole: "background" as const, position: 0, signedLc: -38, absoluteLc: 38 },
	]
	return {
		id: `treatment:${label}`,
		background: sourceColor(options.backgroundHex ?? "#182838", backgroundFamily),
		surface: sourceColor(options.surfaceHex ?? "#304858", surfaceFamily),
		foreground: sourceColor(options.foregroundHex ?? "#e8eef4", foregroundFamily),
		accent: sourceColor(options.accentHex ?? "#80a0b8", accentFamily),
		gradient: false,
		fieldTreatment: options.fieldTreatment ?? "separate-flat-fields",
		sourceFieldHypothesisId: options.fieldId ?? "field:shared",
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
		scores: SCORES,
		gradientEvidence: null,
	}
}

function unrelated(label: string, seed: number): CompletePaletteTreatment {
	const channel = (value: number): string => (value % 256).toString(16).padStart(2, "0")
	const color = (shift: number): string => `#${channel(seed * 31 + shift)}${channel(seed * 47 + shift)}${channel(seed * 61 + shift)}`
	return treatment(label, {
		fieldId: `field:${label}`,
		backgroundHex: color(11),
		surfaceHex: color(37),
		foregroundHex: color(73),
		accentHex: color(109),
		backgroundFamily: `background:${label}`,
		surfaceFamily: `surface:${label}`,
		foregroundFamily: `foreground:${label}`,
		accentFamily: `accent:${label}`,
	})
}

function historicalExtractionImage(): RawImage {
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

async function staticTypeScriptDependencyGraph(entry: URL): Promise<ReadonlySet<string>> {
	const visited = new Set<string>()
	const pending = [entry]
	while (pending.length > 0) {
		const current = pending.pop()!
		if (visited.has(current.href)) continue
		visited.add(current.href)
		const source = await readFile(current, "utf8")
		const runtimeSource = source.replace(
			/\b(?:import|export)\s+type\b[\s\S]*?\bfrom\s+["'][^"']+["']/gu,
			"",
		)
		for (const match of runtimeSource.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/gu)) {
			const dependency = new URL(match[1], current)
			if (dependency.pathname.endsWith(".ts") && !visited.has(dependency.href)) pending.push(dependency)
		}
	}
	return visited
}

function evidence(
	value: CompletePaletteTreatment,
	options: Readonly<{
		strength?: number
		sourcePolarity?: number
		sourcePolarityConfidence?: number
		preference?: FieldConditionalRoleEvidence["preference"]
	}> = {},
): FieldConditionalRoleEvidence {
	const strength = options.strength ?? 0.8
	const preference = options.preference ?? "foreground"
	const familyId = value.familyRoles.foreground
	return {
		familyId,
		fieldHypothesisId: value.sourceFieldHypothesisId,
		preference,
		reason: preference === "foreground" ? "decisive-foreground" :
			preference === "accent" ? "decisive-accent" : "close-role-evidence",
		confidence: strength,
		fieldOwned: false,
		observedRegionCount: 2,
		coherentSupport: strength,
		foreground: {
			score: strength,
			typographyLikeGeometry: strength,
			repetition: strength,
			observedLocalContrast: strength,
			fieldLightnessContrast: strength,
			polarityAgreement: strength,
			polarity: {
				source: {
					polarity: options.sourcePolarity ?? -strength,
					confidence: options.sourcePolarityConfidence ?? 1,
					componentIds: [`component:${familyId}`],
				},
				fieldDirection: -1,
				fieldConfidence: strength,
			},
		},
		accent: {
			score: 0.2,
			compactness: 0.2,
			repetition: 0.2,
			chroma: 0.2,
			observedLocalContrast: 0.2,
			signatureObservation: 0.2,
		},
	}
}

function buildInput(options: Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	candidates: readonly CompletePaletteTreatment[]
	roleEvidence?: readonly FieldConditionalRoleEvidence[]
	concentrationByFamily?: ReadonlyMap<string, number>
	qualityByKey?: ReadonlyMap<string, number>
	ordinaryKeys?: ReadonlySet<string>
}>): AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveInput {
	const all = [...new Map([options.winner, ...options.slate, ...options.candidates]
		.map((value) => [completeTreatmentKey(value), value] as const)).values()]
	const selected = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(all)
	const qualityByKey = options.qualityByKey ?? new Map([
		[completeTreatmentKey(options.winner), 0.9],
		...options.candidates.map((value) => [completeTreatmentKey(value), 0.8] as const),
	])
	const ordinaryKeys = options.ordinaryKeys ?? new Set(all.map(completeTreatmentKey))
	const roleEvidence = options.roleEvidence ?? options.candidates.map((value) => evidence(value))
	const familyIds = [...new Set(all.map(({ familyRoles }) => familyRoles.foreground))]
	return {
		current: { winner: options.winner, slate: options.slate },
		materialized: all.map((value) => ({ key: completeTreatmentKey(value), treatment: value })),
		evaluations: selected.evaluations.map((evaluation) => ({
			...evaluation,
			qualityUtility: qualityByKey.get(evaluation.key) ?? 0.8,
		})),
		unrestrictedWinnerKey: completeTreatmentKey(options.winner),
		completeLineageEligibility: {
			diagnostics: {
				candidates: all.map((value) => {
					const key = completeTreatmentKey(value)
					const ordinary = ordinaryKeys.has(key)
					return {
						key,
						descriptorCount: 1,
						ordinaryEligibleDescriptorCount: ordinary ? 1 : 0,
						normativeEmergencyEligibleDescriptorCount: 0,
						eligible: ordinary,
						basis: ordinary
							? "ordinary-complete-source-lineage" as const
							: "ineligible" as const,
						descriptors: [],
					}
				}),
			},
		},
		roleEvidence,
		families: familyIds.map((id) => ({
			id,
			familyConcentration: options.concentrationByFamily?.get(id) ?? 0.4,
		})),
	}
}

function candidateDiagnostic(
	result: ReturnType<typeof reserveAlbumArtworkPaletteV2Phase3SourceLightForeground>,
	value: CompletePaletteTreatment,
) {
	return result.diagnostics.candidates.find(({ key }) => key === completeTreatmentKey(value))!
}

test("reserves one source-supported light foreground against its earliest exact carrier", () => {
	const carrier = treatment("carrier", { foregroundHex: "#203040", foregroundFamily: "foreground:dark" })
	const candidate = treatment("candidate", { foregroundHex: "#f0f4f8", foregroundFamily: "foreground:light" })
	const input = buildInput({ winner: carrier, slate: [carrier], candidates: [candidate] })
	const result = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(input)
	const diagnostic = candidateDiagnostic(result, candidate)

	assert.strictEqual(result.winner, carrier)
	assert.deepEqual(result.slate, [carrier, candidate])
	assert.equal(diagnostic.eligible, true)
	assert.deepEqual(diagnostic.rejectionReasons, [])
	assert.equal(diagnostic.carrierKey, completeTreatmentKey(carrier))
	assert.equal(diagnostic.carrierIndex, 0)
	assert.deepEqual(diagnostic.foregroundSignedApcaSamples, [-72, -61])
	assert.deepEqual(diagnostic.evidence, {
		foregroundScore: 0.8,
		coherentSupport: 0.8,
		typographyLikeGeometry: 0.8,
		observedLocalContrast: 0.8,
		fieldLightnessContrast: 0.8,
		polarityAgreement: 0.8,
		sourcePolarity: -0.8,
		sourcePolarityConfidence: 1,
		sourceLight: 0.8,
		lightForegroundEvidence: 0.8,
	})
	assert.ok(Object.values(diagnostic.gates).every(Boolean))
	assert.deepEqual(result.diagnostics.eligibleReserveKeysInOrder, [completeTreatmentKey(candidate)])
	assert.equal(result.diagnostics.outcome.winnerPreserved, true)
	assert.equal(result.diagnostics.outcome.baselinePrefixPreserved, true)
	assert.equal(result.diagnostics.outcome.matchedCarrierPreserved, true)
	assert.equal(result.diagnostics.identities.canonicalTreatment, "canonical-role-hex-and-gradient-v1")
	assert.equal(result.diagnostics.identities.exactCarrier, "exact-current-slate-field-collapse-accent-carrier-v1")
})

test("low foreground-family concentration is an exact no-op", () => {
	const carrier = treatment("carrier-low", { foregroundFamily: "foreground:carrier-low" })
	const candidate = treatment("candidate-low", {
		foregroundHex: "#f8f8f0",
		foregroundFamily: "foreground:candidate-low",
	})
	const input = buildInput({
		winner: carrier,
		slate: [carrier],
		candidates: [candidate],
		concentrationByFamily: new Map([[candidate.familyRoles.foreground, 0.249]]),
	})
	const result = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(input)

	assert.strictEqual(result.slate, input.current.slate)
	assert.ok(candidateDiagnostic(result, candidate).rejectionReasons.includes("family-concentration-below-minimum"))
	assert.equal(result.diagnostics.outcome.exactNoOp, true)
})

test("source polarity and foreground APCA sign independently veto reservation", () => {
	const carrier = treatment("carrier-sign", { foregroundFamily: "foreground:carrier-sign" })
	const sourceDark = treatment("source-dark", {
		foregroundHex: "#f4f4ec",
		foregroundFamily: "foreground:source-dark",
	})
	const positiveApca = treatment("positive-apca", {
		foregroundHex: "#e8f0f8",
		foregroundFamily: "foreground:positive-apca",
		foregroundSignedLc: [-62, 4],
	})
	const sourceInput = buildInput({
		winner: carrier,
		slate: [carrier],
		candidates: [sourceDark],
		roleEvidence: [evidence(sourceDark, { sourcePolarity: 0.8 })],
	})
	const apcaInput = buildInput({
		winner: carrier,
		slate: [carrier],
		candidates: [positiveApca],
	})
	const sourceResult = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(sourceInput)
	const apcaResult = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(apcaInput)

	assert.strictEqual(sourceResult.slate, sourceInput.current.slate)
	assert.equal(sourceResult.diagnostics.outcome.exactNoOp, true)
	assert.equal(candidateDiagnostic(sourceResult, sourceDark).evidence.sourceLight, 0)
	assert.ok(candidateDiagnostic(sourceResult, sourceDark).rejectionReasons
		.includes("light-foreground-evidence-below-minimum"))
	assert.strictEqual(apcaResult.slate, apcaInput.current.slate)
	assert.equal(apcaResult.diagnostics.outcome.exactNoOp, true)
	assert.ok(candidateDiagnostic(apcaResult, positiveApca).rejectionReasons
		.includes("foreground-apca-sample-is-positive"))
})

test("a candidate without the exact field, rendering, collapse, and accent carrier is a no-op", () => {
	const carrier = treatment("carrier-exact", { foregroundFamily: "foreground:carrier-exact" })
	const candidate = treatment("candidate-exact", {
		fieldId: "field:other",
		foregroundHex: "#f0f8f8",
		foregroundFamily: "foreground:candidate-exact",
	})
	const input = buildInput({ winner: carrier, slate: [carrier], candidates: [candidate] })
	const result = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(input)

	assert.strictEqual(result.slate, input.current.slate)
	assert.equal(candidateDiagnostic(result, candidate).carrierKey, null)
	assert.ok(candidateDiagnostic(result, candidate).rejectionReasons.includes("no-exact-current-slate-carrier"))
})

test("an already-selected candidate remains an exact no-op", () => {
	const carrier = treatment("carrier-selected", { foregroundFamily: "foreground:carrier-selected" })
	const candidate = treatment("candidate-selected", {
		foregroundHex: "#f0f0f8",
		foregroundFamily: "foreground:candidate-selected",
	})
	const slate = [carrier, candidate]
	const input = buildInput({ winner: carrier, slate, candidates: [candidate] })
	const result = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(input)

	assert.strictEqual(result.slate, slate)
	assert.ok(candidateDiagnostic(result, candidate).rejectionReasons.includes("candidate-is-already-selected"))
	assert.equal(result.diagnostics.outcome.reservedKey, null)
})

test("a full slate replaces only its tail while preserving the carrier, winner, and baseline prefix", () => {
	const carrier = treatment("carrier-cap", { foregroundFamily: "foreground:carrier-cap" })
	const candidate = treatment("candidate-cap", {
		foregroundHex: "#f8f0e8",
		foregroundFamily: "foreground:candidate-cap",
	})
	const retained = Array.from({ length: 7 }, (_, index) => unrelated(`retained:${index}`, index + 3))
	const slate = [carrier, ...retained]
	const result = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(buildInput({
		winner: carrier,
		slate,
		candidates: [candidate],
	}))

	assert.equal(result.slate.length,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_POLICY.maximumSlateTreatments)
	assert.deepEqual(result.slate, [...slate.slice(0, -1), candidate])
	assert.strictEqual(result.slate[0], carrier)
	assert.equal(result.diagnostics.outcome.replacedKey, completeTreatmentKey(slate.at(-1)!))
	assert.equal(result.diagnostics.outcome.reservedCarrierKey, completeTreatmentKey(carrier))
	assert.equal(result.diagnostics.outcome.reservedCarrierIndex, 0)
	assert.equal(result.diagnostics.outcome.baselinePrefixLength, 7)
	assert.equal(result.diagnostics.outcome.baselinePrefixPreserved, true)
	assert.equal(result.diagnostics.outcome.matchedCarrierPreserved, true)

	const otherWinner = unrelated("other-winner", 31)
	const leading = Array.from({ length: 6 }, (_, index) => unrelated(`leading:${index}`, index + 41))
	const carrierAtTail = treatment("carrier-tail", { foregroundFamily: "foreground:carrier-tail" })
	const tailCandidate = treatment("candidate-tail", {
		foregroundHex: "#f8f8e8",
		foregroundFamily: "foreground:candidate-tail",
	})
	const tailSlate = [otherWinner, ...leading, carrierAtTail]
	const tailInput = buildInput({ winner: otherWinner, slate: tailSlate, candidates: [tailCandidate] })
	const tailResult = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(tailInput)
	assert.strictEqual(tailResult.slate, tailSlate)
	assert.ok(candidateDiagnostic(tailResult, tailCandidate).rejectionReasons
		.includes("replacement-would-displace-matched-carrier"))
})

test("carrier-first ranking and diagnostics are deterministic across input permutations", () => {
	const firstCarrier = treatment("first-carrier", { foregroundFamily: "foreground:first-carrier" })
	const secondCarrier = unrelated("second-carrier", 71)
	const firstCandidate = treatment("first-candidate", {
		foregroundHex: "#f4ece4",
		foregroundFamily: "foreground:first-candidate",
	})
	const secondCandidate = treatment("second-candidate", {
		fieldId: secondCarrier.sourceFieldHypothesisId,
		backgroundHex: secondCarrier.background.hex,
		surfaceHex: secondCarrier.surface.hex,
		accentHex: secondCarrier.accent.hex,
		backgroundFamily: secondCarrier.familyRoles.background,
		surfaceFamily: secondCarrier.familyRoles.surface,
		accentFamily: secondCarrier.familyRoles.accent,
		foregroundHex: "#f8f4ec",
		foregroundFamily: "foreground:second-candidate",
	})
	const baseInput = buildInput({
		winner: firstCarrier,
		slate: [firstCarrier, secondCarrier],
		candidates: [secondCandidate, firstCandidate],
		roleEvidence: [evidence(secondCandidate, { strength: 0.95 }), evidence(firstCandidate, { strength: 0.6 })],
	})
	const reverseInput: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveInput = {
		...baseInput,
		materialized: [...baseInput.materialized].reverse(),
		evaluations: [...baseInput.evaluations].reverse(),
		completeLineageEligibility: {
			diagnostics: { candidates: [...baseInput.completeLineageEligibility.diagnostics.candidates].reverse() },
		},
		roleEvidence: [...baseInput.roleEvidence].reverse(),
		families: [...baseInput.families].reverse(),
	}
	const first = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(baseInput)
	const second = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(reverseInput)

	assert.equal(first.diagnostics.outcome.reservedKey, completeTreatmentKey(firstCandidate))
	assert.deepEqual(first.slate.map(completeTreatmentKey), second.slate.map(completeTreatmentKey))
	assert.deepEqual(first.diagnostics, second.diagnostics)
	assert.equal(JSON.stringify(
		reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(baseInput),
	), JSON.stringify(first))
})

test("the bounded attempt identity is exported and registered by the iteration runner", () => {
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT.identity, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
	})
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID.endsWith("-v1"),
		true)
	assert.strictEqual(CONTRACT_SOURCE_LIGHT_ATTEMPT, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT)
	assert.equal(CONTRACT_SOURCE_LIGHT_ATTEMPT_ID,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID)
	assert.equal(CONTRACT_SOURCE_LIGHT_CONFIGURATION_ID,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID)
	assert.strictEqual(extractContractSourceLightForegroundReserve,
		extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve)
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "source-light-reserve-test",
		"--case", "development-03",
		"--attempt", ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
	]), {
		iterationId: "source-light-reserve-test",
		caseIds: ["development-03"],
		attemptIds: [ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID],
	})
})

test("the dedicated attempt adapter preserves historical source-light extraction bytes", () => {
	const result = extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve(historicalExtractionImage())
	const serialized = JSON.stringify(result)
	assert.equal(createHash("sha256").update(serialized).digest("hex"),
		"124e1ceaaf0a2a97588f537141fb97bc6808c047715fa9095ffc29acda284c1e")
	assert.equal(Buffer.byteLength(serialized), 4_737_954)
	assert.equal(JSON.stringify(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT
		.extract(historicalExtractionImage())), serialized)
})

test("the final candidate static module graph excludes the rejected source-light mechanism", async () => {
	const graph = await staticTypeScriptDependencyGraph(new URL(
		"../src/album-artwork-palette-v2-phase-3-final-candidate.ts",
		import.meta.url,
	))
	const parallelArms = new URL(
		"../src/album-artwork-palette-v2-phase-3-parallel-arms.ts",
		import.meta.url,
	).href
	const adapter = new URL(
		"../src/album-artwork-palette-v2-phase-3-source-light-foreground-reserve-attempt.ts",
		import.meta.url,
	).href
	const mechanism = new URL(
		"../src/album-artwork-palette-v2-phase-3-arm-source-light-foreground-reserve.ts",
		import.meta.url,
	).href

	assert.equal(graph.has(parallelArms), true)
	assert.equal(graph.has(adapter), false)
	assert.equal(graph.has(mechanism), false)
	const parallelSource = await readFile(new URL(parallelArms), "utf8")
	assert.doesNotMatch(parallelSource, /source-light-foreground-reserve/u)
})

test("inference closure contains only generic source evidence and existing materialized custody", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-arm-source-light-foreground-reserve.ts",
		import.meta.url,
	), "utf8")

	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseIds?\b|\bartworkIds?\b|\bpaths?\b|\bhash(?:es)?\b|feedback|review|target.?colors?)/iu)
	assert.doesNotMatch(source, /#[a-f0-9]{6}/iu)
	assert.doesNotMatch(source,
		/(?:constructAlbumArtwork|materializeAlbumArtwork|extractAlbumArtwork|buildAlbumArtwork|assignFieldRoles)/u)
	assert.match(source,
		/Math\.max\(0, -sourcePolarity\) \* sourcePolarityConfidence/u)
	assert.match(source,
		/Math\.min\([\s\S]*roleEvidence\.foreground\.score[\s\S]*roleEvidence\.coherentSupport[\s\S]*roleEvidence\.foreground\.typographyLikeGeometry[\s\S]*roleEvidence\.foreground\.observedLocalContrast[\s\S]*roleEvidence\.foreground\.fieldLightnessContrast[\s\S]*roleEvidence\.foreground\.polarityAgreement[\s\S]*sourceLight/u)
	assert.doesNotMatch(source, /winner:\s*(?:candidate|selected)/u)
})
