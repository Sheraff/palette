import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	FieldConditionalRoleEvidence,
} from "./album-artwork-palette-v2-phase-3-role-aware.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_ID =
	"album-artwork-palette-v2-phase-3-source-light-foreground-reserve-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_POLICY = Object.freeze({
	minimumLightForegroundEvidence: 0.54,
	minimumFamilyConcentration: 0.25,
	maximumQualityLoss: 0.12,
	maximumSlateTreatments: 8,
	maximumReservedTreatments: 1,
	rolePreference: "foreground",
	foregroundApcaSign: "all-nonpositive-and-at-least-one-negative",
	baselineMutation: "append-or-replace-last-only",
} as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_FORMULAS =
	Object.freeze({
		sourceLight: "max(0, -sourcePolarity) * sourcePolarityConfidence",
		lightForegroundEvidence:
			"min(foregroundScore, coherentSupport, typographyLikeGeometry, observedLocalContrast, fieldLightnessContrast, polarityAgreement, sourceLight)",
		ordering:
			"ascending carrier index, descending light-foreground evidence, descending quality utility, then ascending ASCII treatment key",
		carrier:
			"same field hypothesis and field treatment, background and surface family plus hex, gradient topology and direction, collapse state, and accent family plus hex; foreground family plus hex differs",
	} as const)

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveMaterializedCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
}>

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveLineageEligibility = Readonly<{
	diagnostics: Pick<
		AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain["diagnostics"],
		"candidates"
	>
}>

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveInput = Readonly<{
	current: Readonly<{
		winner: CompletePaletteTreatment
		slate: readonly CompletePaletteTreatment[]
	}>
	materialized: readonly AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveMaterializedCandidate[]
	evaluations: readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation[]
	unrestrictedWinnerKey: string
	completeLineageEligibility: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveLineageEligibility
	roleEvidence: readonly FieldConditionalRoleEvidence[]
	families: readonly Readonly<{
		id: string
		familyConcentration: number
	}>[]
}>

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveRejectionReason =
	"materialized-key-is-not-canonical" |
	"missing-quality-evaluation" |
	"missing-complete-lineage-diagnostic" |
	"missing-field-conditional-role-evidence" |
	"missing-foreground-family-evidence" |
	"role-preference-is-not-foreground" |
	"light-foreground-evidence-below-minimum" |
	"family-concentration-below-minimum" |
	"quality-loss-exceeds-maximum" |
	"foreground-apca-samples-missing-or-nonfinite" |
	"foreground-apca-sample-is-positive" |
	"foreground-apca-has-no-negative-sample" |
	"lacks-ordinary-complete-lineage-eligibility" |
	"no-exact-current-slate-carrier" |
	"foreground-is-unchanged-from-exact-carrier" |
	"candidate-is-already-selected" |
	"replacement-would-displace-matched-carrier"

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveCandidateDiagnostic = Readonly<{
	key: string
	carrierKey: string | null
	carrierIndex: number | null
	qualityUtility: number | null
	qualityLossFromUnrestrictedWinner: number | null
	familyConcentration: number | null
	foregroundSignedApcaSamples: readonly number[]
	evidence: Readonly<{
		foregroundScore: number | null
		coherentSupport: number | null
		typographyLikeGeometry: number | null
		observedLocalContrast: number | null
		fieldLightnessContrast: number | null
		polarityAgreement: number | null
		sourcePolarity: number | null
		sourcePolarityConfidence: number | null
		sourceLight: number | null
		lightForegroundEvidence: number | null
	}>
	gates: Readonly<{
		materializedKeyCanonical: boolean
		qualityEvaluationAvailable: boolean
		completeLineageDiagnosticAvailable: boolean
		fieldConditionalRoleEvidenceAvailable: boolean
		foregroundFamilyEvidenceAvailable: boolean
		rolePreferenceForeground: boolean
		lightForegroundEvidenceAtLeastMinimum: boolean
		familyConcentrationAtLeastMinimum: boolean
		withinQualityLossMaximum: boolean
		foregroundApcaSamplesAvailableAndFinite: boolean
		foregroundApcaSamplesAllNonpositive: boolean
		foregroundApcaHasNegativeSample: boolean
		ordinaryCompleteLineageEligible: boolean
		exactCurrentSlateCarrierAvailable: boolean
		foregroundChangesRelativeToCarrier: boolean
		candidateAbsentFromSlate: boolean
		matchedCarrierPreservedByCapacityAction: boolean
	}>
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveRejectionReason[]
}>

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_POLICY
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_FORMULAS
	identities: Readonly<{
		canonicalTreatment: "canonical-role-hex-and-gradient-v1"
		exactCarrier: "exact-current-slate-field-collapse-accent-carrier-v1"
		sourceEvidence: "phase-3-role-aware-identity-wave-1"
		completeLineage: "album-artwork-palette-v2-phase-3-complete-lineage-winner-eligibility-v1"
	}>
	domain: Readonly<{
		materializedTreatmentCount: number
		evaluationCount: number
		roleEvidenceCount: number
		familyEvidenceCount: number
		ordinaryCompleteLineageEligibleTreatmentCount: number
		eligibleReserveCount: number
	}>
	baseline: Readonly<{
		winnerKey: string
		slateKeys: readonly string[]
		unrestrictedWinnerKey: string
		unrestrictedWinnerQualityUtility: number
		capacity: number
		capacityAvailable: boolean
	}>
	candidates: readonly AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveCandidateDiagnostic[]
	eligibleReserveKeysInOrder: readonly string[]
	outcome: Readonly<{
		exactNoOp: boolean
		reservedKey: string | null
		reservedCarrierKey: string | null
		reservedCarrierIndex: number | null
		replacedKey: string | null
		winnerKey: string
		outputSlateKeys: readonly string[]
		winnerPreserved: boolean
		baselinePrefixLength: number
		baselinePrefixPreserved: boolean
		matchedCarrierPreserved: boolean | null
	}>
}>

export type AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveSelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveDiagnostics
}>

type EvaluatedReserve = Readonly<{
	candidate: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveMaterializedCandidate
	diagnostic: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveCandidateDiagnostic
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function sameHex(first: string, second: string): boolean {
	return first.toLowerCase() === second.toLowerCase()
}

function gradientIdentity(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}\0${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function exactCarrierStructure(
	carrier: CompletePaletteTreatment,
	candidate: CompletePaletteTreatment,
): boolean {
	return carrier.sourceFieldHypothesisId === candidate.sourceFieldHypothesisId &&
		carrier.fieldTreatment === candidate.fieldTreatment &&
		carrier.familyRoles.background === candidate.familyRoles.background &&
		sameHex(carrier.background.hex, candidate.background.hex) &&
		carrier.familyRoles.surface === candidate.familyRoles.surface &&
		sameHex(carrier.surface.hex, candidate.surface.hex) &&
		gradientIdentity(carrier) === gradientIdentity(candidate) &&
		carrier.collapse.surface === candidate.collapse.surface &&
		carrier.collapse.accent === candidate.collapse.accent &&
		carrier.familyRoles.accent === candidate.familyRoles.accent &&
		sameHex(carrier.accent.hex, candidate.accent.hex)
}

function sameForeground(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	return first.familyRoles.foreground === second.familyRoles.foreground &&
		sameHex(first.foreground.hex, second.foreground.hex)
}

function uniqueIndex<T>(
	values: readonly T[],
	key: (value: T) => string,
	label: string,
): ReadonlyMap<string, T> {
	const result = new Map<string, T>()
	for (const value of values) {
		const identity = key(value)
		if (result.has(identity)) throw new Error(`Source-light foreground reserve received duplicate ${label}`)
		result.set(identity, value)
	}
	return result
}

function compareReserves(first: EvaluatedReserve, second: EvaluatedReserve): number {
	return (first.diagnostic.carrierIndex ?? Number.MAX_SAFE_INTEGER) -
		(second.diagnostic.carrierIndex ?? Number.MAX_SAFE_INTEGER) ||
		compareDescending(
			first.diagnostic.evidence.lightForegroundEvidence ?? -Infinity,
			second.diagnostic.evidence.lightForegroundEvidence ?? -Infinity,
		) ||
		compareDescending(first.diagnostic.qualityUtility ?? -Infinity, second.diagnostic.qualityUtility ?? -Infinity) ||
		compareAscii(first.candidate.key, second.candidate.key)
}

export function reserveAlbumArtworkPaletteV2Phase3SourceLightForeground(
	input: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveInput,
): AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveSelection {
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_POLICY
	if (input.current.slate.length === 0 || input.current.slate.length > policy.maximumSlateTreatments) {
		throw new RangeError("Source-light foreground reserve requires current custody containing 1 to 8 treatments")
	}
	const winnerKey = completeTreatmentKey(input.current.winner)
	const baselineSlateKeys = input.current.slate.map(completeTreatmentKey)
	if (baselineSlateKeys[0] !== winnerKey) {
		throw new Error("Source-light foreground reserve requires winner-first current custody")
	}
	if (new Set(baselineSlateKeys).size !== baselineSlateKeys.length) {
		throw new Error("Source-light foreground reserve requires unique current custody keys")
	}
	const evaluationsByKey = uniqueIndex(input.evaluations, ({ key }) => key, "quality evaluation key")
	const unrestrictedWinner = evaluationsByKey.get(input.unrestrictedWinnerKey)
	if (!unrestrictedWinner) {
		throw new Error("Source-light foreground reserve omitted the unrestricted winner evaluation")
	}
	const lineageByKey = uniqueIndex(
		input.completeLineageEligibility.diagnostics.candidates,
		({ key }) => key,
		"complete-lineage key",
	)
	const roleEvidenceByIdentity = uniqueIndex(
		input.roleEvidence,
		({ fieldHypothesisId, familyId }) => `${fieldHypothesisId}\0${familyId}`,
		"field-conditional role evidence identity",
	)
	const familiesById = uniqueIndex(input.families, ({ id }) => id, "family evidence identity")
	const materializedByKey = uniqueIndex(input.materialized, ({ key }) => key, "materialized key")
	const baselineSlateKeySet = new Set(baselineSlateKeys)
	const capacityAvailable = input.current.slate.length < policy.maximumSlateTreatments

	const evaluated = [...materializedByKey.values()]
		.sort((first, second) => compareAscii(first.key, second.key))
		.map((candidate): EvaluatedReserve => {
			const treatment = candidate.treatment
			const evaluation = evaluationsByKey.get(candidate.key) ?? null
			const lineage = lineageByKey.get(candidate.key) ?? null
			const roleEvidence = roleEvidenceByIdentity.get(
				`${treatment.sourceFieldHypothesisId}\0${treatment.familyRoles.foreground}`,
			) ?? null
			const family = familiesById.get(treatment.familyRoles.foreground) ?? null
			const structuralCarriers = input.current.slate.map((carrier, index) => ({ carrier, index }))
				.filter(({ carrier }) => exactCarrierStructure(carrier, treatment))
			const matchedCarrier = structuralCarriers.find(({ carrier }) => !sameForeground(carrier, treatment)) ?? null
			const sourcePolarity = roleEvidence?.foreground.polarity.source.polarity ?? null
			const sourcePolarityConfidence = roleEvidence?.foreground.polarity.source.confidence ?? null
			const sourceLight = sourcePolarity === null || sourcePolarityConfidence === null
				? null
				: Math.max(0, -sourcePolarity) * sourcePolarityConfidence
			const evidence = roleEvidence === null || sourceLight === null
				? null
				: Math.min(
					roleEvidence.foreground.score,
					roleEvidence.coherentSupport,
					roleEvidence.foreground.typographyLikeGeometry,
					roleEvidence.foreground.observedLocalContrast,
					roleEvidence.foreground.fieldLightnessContrast,
					roleEvidence.foreground.polarityAgreement,
					sourceLight,
				)
			const foregroundSignedApcaSamples = treatment.contrast.pairs
				.filter(({ role }) => role === "foreground")
				.map(({ signedLc }) => signedLc)
			const apcaFinite = foregroundSignedApcaSamples.length > 0 &&
				foregroundSignedApcaSamples.every(Number.isFinite)
			const qualityLoss = evaluation === null
				? null
				: Math.max(0, unrestrictedWinner.qualityUtility - evaluation.qualityUtility)
			const ordinaryCompleteLineageEligible = lineage?.eligible === true &&
				lineage.basis === "ordinary-complete-source-lineage" &&
				lineage.ordinaryEligibleDescriptorCount > 0
			const foregroundChangesRelativeToCarrier = matchedCarrier !== null
			const matchedCarrierPreservedByCapacityAction = matchedCarrier !== null &&
				(capacityAvailable || matchedCarrier.index !== input.current.slate.length - 1)
			const gates = {
				materializedKeyCanonical: candidate.key === completeTreatmentKey(treatment),
				qualityEvaluationAvailable: evaluation !== null,
				completeLineageDiagnosticAvailable: lineage !== null,
				fieldConditionalRoleEvidenceAvailable: roleEvidence !== null,
				foregroundFamilyEvidenceAvailable: family !== null,
				rolePreferenceForeground: roleEvidence?.preference === policy.rolePreference,
				lightForegroundEvidenceAtLeastMinimum: evidence !== null &&
					evidence + 1e-12 >= policy.minimumLightForegroundEvidence,
				familyConcentrationAtLeastMinimum: family !== null &&
					family.familyConcentration + 1e-12 >= policy.minimumFamilyConcentration,
				withinQualityLossMaximum: qualityLoss !== null && qualityLoss <= policy.maximumQualityLoss + 1e-12,
				foregroundApcaSamplesAvailableAndFinite: apcaFinite,
				foregroundApcaSamplesAllNonpositive: apcaFinite &&
					foregroundSignedApcaSamples.every((value) => value <= 0),
				foregroundApcaHasNegativeSample: apcaFinite &&
					foregroundSignedApcaSamples.some((value) => value < 0),
				ordinaryCompleteLineageEligible,
				exactCurrentSlateCarrierAvailable: structuralCarriers.length > 0,
				foregroundChangesRelativeToCarrier,
				candidateAbsentFromSlate: !baselineSlateKeySet.has(candidate.key),
				matchedCarrierPreservedByCapacityAction,
			}
			const rejectionReasons: AlbumArtworkPaletteV2Phase3SourceLightForegroundReserveRejectionReason[] = []
			if (!gates.materializedKeyCanonical) rejectionReasons.push("materialized-key-is-not-canonical")
			if (!gates.qualityEvaluationAvailable) rejectionReasons.push("missing-quality-evaluation")
			if (!gates.completeLineageDiagnosticAvailable) rejectionReasons.push("missing-complete-lineage-diagnostic")
			if (!gates.fieldConditionalRoleEvidenceAvailable) {
				rejectionReasons.push("missing-field-conditional-role-evidence")
			}
			if (!gates.foregroundFamilyEvidenceAvailable) rejectionReasons.push("missing-foreground-family-evidence")
			if (!gates.rolePreferenceForeground) rejectionReasons.push("role-preference-is-not-foreground")
			if (!gates.lightForegroundEvidenceAtLeastMinimum) {
				rejectionReasons.push("light-foreground-evidence-below-minimum")
			}
			if (!gates.familyConcentrationAtLeastMinimum) rejectionReasons.push("family-concentration-below-minimum")
			if (!gates.withinQualityLossMaximum) rejectionReasons.push("quality-loss-exceeds-maximum")
			if (!gates.foregroundApcaSamplesAvailableAndFinite) {
				rejectionReasons.push("foreground-apca-samples-missing-or-nonfinite")
			}
			if (gates.foregroundApcaSamplesAvailableAndFinite && !gates.foregroundApcaSamplesAllNonpositive) {
				rejectionReasons.push("foreground-apca-sample-is-positive")
			}
			if (gates.foregroundApcaSamplesAvailableAndFinite && !gates.foregroundApcaHasNegativeSample) {
				rejectionReasons.push("foreground-apca-has-no-negative-sample")
			}
			if (!gates.ordinaryCompleteLineageEligible) {
				rejectionReasons.push("lacks-ordinary-complete-lineage-eligibility")
			}
			if (!gates.exactCurrentSlateCarrierAvailable) rejectionReasons.push("no-exact-current-slate-carrier")
			if (!gates.foregroundChangesRelativeToCarrier) {
				rejectionReasons.push("foreground-is-unchanged-from-exact-carrier")
			}
			if (!gates.candidateAbsentFromSlate) rejectionReasons.push("candidate-is-already-selected")
			if (!gates.matchedCarrierPreservedByCapacityAction && matchedCarrier !== null) {
				rejectionReasons.push("replacement-would-displace-matched-carrier")
			}
			return {
				candidate,
				diagnostic: {
					key: candidate.key,
					carrierKey: matchedCarrier === null ? null : completeTreatmentKey(matchedCarrier.carrier),
					carrierIndex: matchedCarrier?.index ?? null,
					qualityUtility: evaluation?.qualityUtility ?? null,
					qualityLossFromUnrestrictedWinner: qualityLoss,
					familyConcentration: family?.familyConcentration ?? null,
					foregroundSignedApcaSamples,
					evidence: {
						foregroundScore: roleEvidence?.foreground.score ?? null,
						coherentSupport: roleEvidence?.coherentSupport ?? null,
						typographyLikeGeometry: roleEvidence?.foreground.typographyLikeGeometry ?? null,
						observedLocalContrast: roleEvidence?.foreground.observedLocalContrast ?? null,
						fieldLightnessContrast: roleEvidence?.foreground.fieldLightnessContrast ?? null,
						polarityAgreement: roleEvidence?.foreground.polarityAgreement ?? null,
						sourcePolarity,
						sourcePolarityConfidence,
						sourceLight,
						lightForegroundEvidence: evidence,
					},
					gates,
					eligible: rejectionReasons.length === 0,
					rejectionReasons,
				},
			}
		})
	const eligible = evaluated.filter(({ diagnostic }) => diagnostic.eligible).sort(compareReserves)
	const selected = eligible[0] ?? null
	let slate: readonly CompletePaletteTreatment[] = input.current.slate
	let replacedKey: string | null = null
	if (selected !== null) {
		if (capacityAvailable) slate = [...input.current.slate, selected.candidate.treatment]
		else {
			replacedKey = baselineSlateKeys[baselineSlateKeys.length - 1]
			slate = [...input.current.slate.slice(0, -1), selected.candidate.treatment]
		}
	}
	const outputSlateKeys = slate.map(completeTreatmentKey)
	const prefixLength = selected === null || capacityAvailable
		? baselineSlateKeys.length
		: baselineSlateKeys.length - 1
	const baselinePrefixPreserved = outputSlateKeys.slice(0, prefixLength)
		.every((key, index) => key === baselineSlateKeys[index])
	const matchedCarrierPreserved = selected === null
		? null
		: outputSlateKeys[selected.diagnostic.carrierIndex!] === selected.diagnostic.carrierKey
	const winnerPreserved = completeTreatmentKey(input.current.winner) === winnerKey && outputSlateKeys[0] === winnerKey
	if (!winnerPreserved || !baselinePrefixPreserved || matchedCarrierPreserved === false ||
		slate.length > policy.maximumSlateTreatments) {
		throw new Error("Source-light foreground reserve violated bounded winner and carrier custody")
	}
	return {
		winner: input.current.winner,
		slate,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_ID,
			policy,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SOURCE_LIGHT_FOREGROUND_RESERVE_FORMULAS,
			identities: {
				canonicalTreatment: "canonical-role-hex-and-gradient-v1",
				exactCarrier: "exact-current-slate-field-collapse-accent-carrier-v1",
				sourceEvidence: "phase-3-role-aware-identity-wave-1",
				completeLineage:
					"album-artwork-palette-v2-phase-3-complete-lineage-winner-eligibility-v1",
			},
			domain: {
				materializedTreatmentCount: input.materialized.length,
				evaluationCount: input.evaluations.length,
				roleEvidenceCount: input.roleEvidence.length,
				familyEvidenceCount: input.families.length,
				ordinaryCompleteLineageEligibleTreatmentCount:
					input.completeLineageEligibility.diagnostics.candidates.filter((candidate) =>
						candidate.eligible && candidate.basis === "ordinary-complete-source-lineage" &&
						candidate.ordinaryEligibleDescriptorCount > 0).length,
				eligibleReserveCount: eligible.length,
			},
			baseline: {
				winnerKey,
				slateKeys: baselineSlateKeys,
				unrestrictedWinnerKey: input.unrestrictedWinnerKey,
				unrestrictedWinnerQualityUtility: unrestrictedWinner.qualityUtility,
				capacity: policy.maximumSlateTreatments,
				capacityAvailable,
			},
			candidates: evaluated.map(({ diagnostic }) => diagnostic),
			eligibleReserveKeysInOrder: eligible.map(({ candidate }) => candidate.key),
			outcome: {
				exactNoOp: selected === null,
				reservedKey: selected?.candidate.key ?? null,
				reservedCarrierKey: selected?.diagnostic.carrierKey ?? null,
				reservedCarrierIndex: selected?.diagnostic.carrierIndex ?? null,
				replacedKey,
				winnerKey,
				outputSlateKeys,
				winnerPreserved,
				baselinePrefixLength: prefixLength,
				baselinePrefixPreserved,
				matchedCarrierPreserved,
			},
		},
	}
}
