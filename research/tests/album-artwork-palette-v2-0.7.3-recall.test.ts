import assert from "node:assert/strict"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_FACTORIZED_PARETO_AUDIT_ARMS,
	ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS,
	ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES,
	auditAlbumArtworkPaletteV2FactorizedParetoRecall,
	auditAlbumArtworkPaletteV2Recall,
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2,
	factorizedPareto6000TriggerPredicate,
	qualifyRecallAuditTreatment,
} from "../src/album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2FactorizedParetoAudit,
	AlbumArtworkPaletteV2RecallAudit,
	AlbumArtworkPaletteV2RecallAuditArm,
	AlbumArtworkPaletteV2RecallRegistry,
	RecallAuditNewTreatment,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_FACTORIZED_ESCALATION,
} from "../src/album-artwork-palette-v2-0.7.3-protocol.ts"
import type { RGB, RawImage } from "../src/types.ts"

function fixture(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

const image = fixture(72, 72, (x, y) => {
	if ((x >= 12 && x < 18 && y >= 12 && y < 28) || (x >= 52 && x < 58 && y >= 46 && y < 62)) {
		return [238, 48, 76]
	}
	if (x >= 31 && x < 36 && y >= 16 && y < 58) return [242, 233, 205]
	if (y >= 54) return [56, 80, 118]
	return [25, 48, 91]
})

const factorizedColors: readonly RGB[] = [
	[245, 245, 245],
	[8, 8, 8],
	[245, 35, 45],
	[30, 220, 70],
	[30, 80, 245],
	[245, 220, 30],
	[20, 220, 225],
	[235, 35, 225],
	[245, 125, 25],
]
const factorizedImage = fixture(160, 120, (x, y) => {
	for (let index = 0; index < factorizedColors.length; index++) {
		const originX = 8 + (index % 3) * 50
		const originY = 10 + Math.floor(index / 3) * 35
		if ((x >= originX && x < originX + 5 || x >= originX + 11 && x < originX + 16) &&
			y >= originY && y < originY + 10) return factorizedColors[index]
	}
	return [45, 70, 110]
})

const audits = new Map<AlbumArtworkPaletteV2RecallAuditArm, AlbumArtworkPaletteV2RecallAudit>()

function audit(arm: AlbumArtworkPaletteV2RecallAuditArm): AlbumArtworkPaletteV2RecallAudit {
	const existing = audits.get(arm)
	if (existing) return existing
	const result = auditAlbumArtworkPaletteV2Recall(image, arm)
	audits.set(arm, result)
	return result
}

let factorizedAudit: AlbumArtworkPaletteV2FactorizedParetoAudit | undefined

function factorized(): AlbumArtworkPaletteV2FactorizedParetoAudit {
	return factorizedAudit ??= auditAlbumArtworkPaletteV2FactorizedParetoRecall(factorizedImage)
}

function assertRegisteredAdditions(
	registry: AlbumArtworkPaletteV2RecallRegistry,
	additions: readonly RecallAuditNewTreatment[],
): void {
	for (const addition of additions) {
		const lineage = addition.lineage
		assert.equal(lineage.sourceConnected, true, addition.key)
		assert.ok(lineage.representatives.every(({ sourceConnected }) => sourceConnected), addition.key)
		assert.ok(lineage.familyIds.every((familyId) => registry.families.some((family) =>
			family.familyId === familyId && family.sourceConnected)), addition.key)
		assert.ok(registry.fieldHypotheses.some((hypothesis) =>
			hypothesis.hypothesisId === lineage.fieldHypothesisId && hypothesis.sourceConnected), addition.key)
		assert.ok(registry.fieldDirections.some((direction) =>
			direction.key === lineage.fieldDirectionKey && direction.sourceConnected &&
			direction.hypothesisIds.includes(lineage.fieldHypothesisId)), addition.key)
		assert.ok(lineage.roleDirectionKeys.every((key) => registry.roleDirections.some((direction) =>
			direction.key === key && direction.sourceConnected)), addition.key)
	}
}

test("0.7.3 recall control preserves the default extraction byte for byte and exposes its complete domain", () => {
	const direct = extractAlbumArtworkPaletteV2(image)
	const control = audit("control-0.7.2")

	assert.equal(JSON.stringify(control.controlExtraction), JSON.stringify(direct))
	assert.deepEqual(control.control.publicSlate, direct.alternatives)
	assert.equal(control.control.completeTreatmentKeys.length,
		new Set(control.control.completeTreatmentKeys).size)
	assert.ok(control.control.completeTreatments.length >= direct.alternatives.length)
	assert.deepEqual(control.control.completeTreatments.map(completeTreatmentKey),
		control.control.completeTreatmentKeys)
})

test("canonical complete treatment keys use lower-case hex roles and gradient or flat", () => {
	const treatment = audit("control-0.7.2").control.completeTreatments[0]
	assert.ok(treatment)
	const upperCaseTreatment = {
		...treatment,
		background: { ...treatment.background, hex: treatment.background.hex.toUpperCase() },
		surface: { ...treatment.surface, hex: treatment.surface.hex.toUpperCase() },
		foreground: { ...treatment.foreground, hex: treatment.foreground.hex.toUpperCase() },
		accent: { ...treatment.accent, hex: treatment.accent.hex.toUpperCase() },
	}
	assert.equal(completeTreatmentKey(upperCaseTreatment), [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat",
	].join(":"))
})

test("each recall arm changes exactly one declared boundary and preserves every control candidate", () => {
	const changedStages = new Map<AlbumArtworkPaletteV2RecallAuditArm, readonly string[]>([
		["control-0.7.2", []],
		["all-existing-representative-strategies", ["representative-pairing"]],
		["all-retained-representative-cross-pairs", ["representative-pairing"]],
		["widened-field-hypothesis-retention", ["field-hypothesis-retention"]],
		["widened-family-lane-retention", ["lane-retention"]],
	])
	const baseline = audit("control-0.7.2").control
	const baselineByKey = new Map(baseline.completeTreatments.map((treatment) =>
		[completeTreatmentKey(treatment), treatment]))

	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS, [...changedStages.keys()])
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS,
		ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER.slice(0, 5).map(({ id }) => id))
	for (const arm of ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS) {
		const result = audit(arm)
		assert.deepEqual(result.treatment.changedStages, changedStages.get(arm))
		assert.ok(result.treatment.rawCandidateCount <= 1_500)
		assert.ok(result.treatment.materializedCandidateCount <= 1_500)
		const treatmentByKey = new Map(result.treatment.completeTreatments.map((treatment) =>
			[completeTreatmentKey(treatment), treatment]))
		for (const [key, controlTreatment] of baselineByKey) {
			assert.deepEqual(treatmentByKey.get(key), controlTreatment, `${arm} displaced ${key}`)
		}
		assert.deepEqual(
			result.treatment.publicSlate.slice(0, result.control.publicSlate.length),
			result.control.publicSlate,
		)
		assert.ok(treatmentByKey.has(completeTreatmentKey(
			result.control.completeTreatments.find(({ id }) => id === result.control.qualityIncumbentTreatmentId)!,
		)))
	}
})

test("the registry, joint availability matrix, and custody diagnostics are complete and identity is a subset", () => {
	const result = audit("widened-field-hypothesis-retention")
	const matrix = result.availability
	const identityRoleKeys = new Set(matrix.identityObligationRoleDirectionKeys)

	assert.equal(result.registry.version, "album-artwork-palette-v2-recall-registry-0.7.3")
	assert.ok(result.registry.families.length > 0)
	assert.ok(result.registry.fieldDirections.every(({ sourceConnected }) => sourceConnected))
	assert.ok(result.registry.roleDirections.every(({ sourceConnected }) => sourceConnected))
	assert.equal(matrix.cells.length,
		matrix.fieldDirectionKeys.length * matrix.roleDirectionKeys.length)
	assert.equal(result.custody.length, matrix.cells.length)
	assert.deepEqual(
		new Set(result.registry.roleDirections.filter(({ identityObligation }) => identityObligation).map(({ key }) => key)),
		identityRoleKeys,
	)
	assert.ok(identityRoleKeys.size <= matrix.roleDirectionKeys.length)
	for (const diagnostic of result.custody) {
		assert.deepEqual(diagnostic.stages.map(({ stage }) => stage),
			ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES)
		if (diagnostic.firstLossStage === null) {
			assert.equal(diagnostic.firstLossReason, null)
		} else {
			const firstLoss = diagnostic.stages.find(({ status }) => status === "unavailable")
			assert.equal(diagnostic.firstLossStage, firstLoss?.stage)
			assert.equal(diagnostic.firstLossReason, firstLoss?.reason)
		}
	}
})

test("new-treatment qualification requires every clause and accepts either unchanged ranking path", () => {
	const treatment = audit("control-0.7.2").control.completeTreatments[0]
	assert.ok(treatment)
	const key = completeTreatmentKey(treatment)
	const common = {
		treatment,
		controlTreatmentKeys: [] as readonly string[],
		sourceConnectedFullLineage: true,
		legalUnderUnchangedRules: true,
		fillsControlEmptyFieldRoleCell: true,
	}

	assert.equal(qualifyRecallAuditTreatment({
		...common,
		ordinaryParetoMember: true,
		completeDomainGuardPass: false,
	}).qualifies, true)
	assert.equal(qualifyRecallAuditTreatment({
		...common,
		ordinaryParetoMember: false,
		completeDomainGuardPass: true,
	}).qualifies, true)
	const neither = qualifyRecallAuditTreatment({
		...common,
		ordinaryParetoMember: false,
		completeDomainGuardPass: false,
	})
	assert.equal(neither.qualifies, false)
	assert.ok(neither.reasons.includes("neither-ordinary-pareto-member-nor-complete-domain-non-inferior"))
	const present = qualifyRecallAuditTreatment({
		...common,
		controlTreatmentKeys: new Set([key]),
		ordinaryParetoMember: true,
		completeDomainGuardPass: true,
	})
	assert.equal(present.qualifies, false)
	assert.equal(present.absentFromControl, false)
})

test("factorized Pareto 3000 is deterministic and reconciles every logical count", () => {
	const first = factorized()
	const second = auditAlbumArtworkPaletteV2FactorizedParetoRecall(factorizedImage, "factorized-pareto-3000")
	const counts = first.logical

	assert.equal(JSON.stringify(second), JSON.stringify(first))
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_FACTORIZED_PARETO_AUDIT_ARMS,
		[
			ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARM_ORDER.find(({ id }) => id === "factorized-pareto-3000")?.id,
			ALBUM_ARTWORK_PALETTE_V2_0_7_3_FACTORIZED_ESCALATION.id,
		])
	assert.equal(counts.attemptedTupleCount + counts.truncatedTupleCount, counts.enumerableTupleCount)
	assert.equal(counts.uniqueCanonicalKeyCountBeforePareto + counts.duplicateLegalKeyCount,
		counts.legalTupleCount)
	assert.ok(counts.legalTupleCount <= counts.attemptedTupleCount)
	assert.equal(counts.checkpointReached,
		counts.uniqueCanonicalKeyCountBeforePareto === counts.checkpoint)
	assert.ok(counts.ordinaryParetoKeyCount <= counts.retainedUnionKeyCount)
	assert.ok(counts.completeDomainGuardPassingKeyCount <= counts.retainedUnionKeyCount)
	assert.ok(counts.retainedUnionKeyCount <=
		counts.ordinaryParetoKeyCount + counts.completeDomainGuardPassingKeyCount)
})

test("factorized retention changes only complete construction and materializes additively within 1500", () => {
	const result = factorized()
	const controlByKey = new Map(result.control.completeTreatments.map((treatment) =>
		[completeTreatmentKey(treatment), treatment]))
	const treatmentByKey = new Map(result.treatment.completeTreatments.map((treatment) =>
		[completeTreatmentKey(treatment), treatment]))

	assert.deepEqual(result.upstream.changedStages, ["complete-treatment-construction"])
	assert.deepEqual(result.upstream.laneFamilyIds,
		Object.fromEntries(result.controlExtraction.diagnostics.lanes.map(({ name, familyIds }) => [name, familyIds])))
	assert.deepEqual(result.upstream.fieldHypothesisIds,
		result.controlExtraction.diagnostics.fieldHypotheses.map(({ id }) => id))
	assert.equal(result.upstream.representativesPerRole, 2)
	assert.equal(result.upstream.fieldRepresentativePairing, "same-index")
	for (const [key, treatment] of controlByKey) assert.deepEqual(treatmentByKey.get(key), treatment)
	assert.equal(result.treatment.rawCandidateCount,
		result.control.rawCandidateCount + result.retainedAdditions.length)
	assert.equal(result.treatment.materializedCandidateCount,
		result.control.materializedCandidateCount + result.retainedAdditions.length)
	assert.ok(result.retainedAdditions.length > 0)
	assertRegisteredAdditions(result.registry, result.retainedAdditions)
	assert.ok(result.treatment.rawCandidateCount <= 1_500)
	assert.ok(result.treatment.materializedCandidateCount <= 1_500)
	assert.deepEqual(
		result.treatment.publicSlate.slice(0, result.control.publicSlate.length),
		result.control.publicSlate,
	)
})

test("all one-factor and factorized materialized additions have complete registered source lineage", () => {
	let oneFactorAdditionCount = 0
	for (const arm of ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS.slice(1)) {
		const result = auditAlbumArtworkPaletteV2Recall(factorizedImage, arm)
		oneFactorAdditionCount += result.newTreatments.length
		assertRegisteredAdditions(result.registry, result.newTreatments)
	}
	assert.ok(oneFactorAdditionCount > 0)
	assertRegisteredAdditions(factorized().registry, factorized().retainedAdditions)
})

test("factorized Pareto 6000 is forbidden without a true source-bound 3000 trigger", () => {
	const result = factorized()
	assert.equal(result.escalation.trigger6000, false)
	assert.equal(result.escalation.exactCheckpointOnlyProof, false)
	assert.equal(factorizedPareto6000TriggerPredicate(result.escalation), false)
	const forged = {
		...result.escalation,
		trigger6000: true,
		exactCheckpointOnlyProof: true,
		reason: "verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint" as const,
		witnesses: {
			...result.escalation.witnesses,
			otherwiseQualifyingTreatmentKeys: ["unverified-key"],
			otherwiseQualifyingCellKeys: ["unverified-cell"],
		},
		verifiedTriggerToken: "unverified-token",
	}
	assert.equal(factorizedPareto6000TriggerPredicate(forged), false)
	assert.throws(() => auditAlbumArtworkPaletteV2FactorizedParetoRecall(
		factorizedImage,
		"factorized-pareto-6000",
		result.escalation,
	), /requires a source-bound verified 3000 trigger certificate/)
	assert.throws(() => auditAlbumArtworkPaletteV2FactorizedParetoRecall(
		factorizedImage,
		"factorized-pareto-6000",
	), /requires a source-bound verified 3000 trigger certificate/)
})
