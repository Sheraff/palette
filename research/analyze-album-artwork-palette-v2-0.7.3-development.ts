import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type {
	CompletePaletteTreatment,
	IdentityQualityGuardEvaluation,
	RecallAuditNewTreatment,
} from "./src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_IMPLEMENTATION_PATHS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT,
	albumArtworkPaletteV2073ByteJsonSha256,
	albumArtworkPaletteV2073CanonicalJson,
	albumArtworkPaletteV2073ContentId,
	albumArtworkPaletteV2073OrderedRoot,
	albumArtworkPaletteV2073OrderedValueRoot,
	albumArtworkPaletteV2073ResultSourceEvidence,
	albumArtworkPaletteV2073ScientificSha256,
	albumArtworkPaletteV2073Sha256,
	albumArtworkPaletteV2073SourceScientificIdentity,
	buildAlbumArtworkPaletteV2073ResultsFromEvidence,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import type {
	AlbumArtworkPaletteV2073ArmSummary,
	AlbumArtworkPaletteV2073DevelopmentManifest,
	AlbumArtworkPaletteV2073ExecutionManifest,
	AlbumArtworkPaletteV2073FactorizedArmArtifact,
	AlbumArtworkPaletteV2073ManifestFile,
	AlbumArtworkPaletteV2073RecallArmArtifact,
	AlbumArtworkPaletteV2073ResultSourceEvidence,
	AlbumArtworkPaletteV2073Results,
	AlbumArtworkPaletteV2073SourceArtifact,
} from "./src/album-artwork-palette-v2-0.7.3-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_CUSTODY_STAGES,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
} from "./src/album-artwork-palette-v2-0.7.3-protocol.ts"

type FrozenSourceArtifact = Readonly<{
	source: Readonly<{ caseId: string; sha256: string }>
	extraction: unknown
}>

type ArtifactManifest = Readonly<{
	schemaVersion: number
	candidateVersion: string
	executionManifestId: string
	files: readonly AlbumArtworkPaletteV2073ManifestFile[]
	orderedRoot: string
	manifestId: string
}>

type SummaryArtifact = Readonly<{
	schemaVersion: number
	candidateVersion: string
	implementationSha256: string
	executionManifestId: string
	fixedPanelSourceCount: number
	executedSourceCount: number
	scientificSha256: string
	wallCeilingMsPerArmPerSource: number
	arms: readonly AlbumArtworkPaletteV2073ArmSummary[]
	factorizedEscalation: AlbumArtworkPaletteV2073Results["factorizedEscalation"]
	selection: AlbumArtworkPaletteV2073Results["selection"]
	authorization: AlbumArtworkPaletteV2073Results["authorization"]
	disposition: string
	summaryId: string
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const defaultExperimentDirectory = resolve(
	moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.3-development",
)
const treatmentKeyPattern = /^#[a-f0-9]{6}:#[a-f0-9]{6}:#[a-f0-9]{6}:#[a-f0-9]{6}:(?:gradient|flat)$/u

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function pathInside(root: string, path: string): boolean {
	const normalizedRoot = resolve(root)
	const normalizedPath = resolve(path)
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`)
}

async function fileSha256(path: string): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		const hash = createHash("sha256")
		const stream = createReadStream(path)
		stream.on("data", (chunk) => hash.update(chunk))
		stream.on("error", reject)
		stream.on("end", () => resolvePromise(hash.digest("hex")))
	})
}

async function readJsonWithRaw<T>(path: string): Promise<Readonly<{ raw: string; value: T }>> {
	const raw = await readFile(path, "utf8")
	return { raw, value: JSON.parse(raw) as T }
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex.toLowerCase(),
		treatment.surface.hex.toLowerCase(),
		treatment.foreground.hex.toLowerCase(),
		treatment.accent.hex.toLowerCase(),
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function fieldDirectionKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.collapse.surface ? "=" : treatment.familyRoles.surface,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function roleDirectionKeys(treatment: CompletePaletteTreatment): string[] {
	return [
		`foreground:${treatment.familyRoles.foreground}`,
		...treatment.collapse.accent ? [] : [`accent:${treatment.familyRoles.accent}`],
	]
}

function cellKey(fieldKey: string, roleKey: string): string {
	return `${fieldKey}=>${roleKey}`
}

function treatmentCells(treatments: readonly CompletePaletteTreatment[]): Map<string, string[]> {
	const cells = new Map<string, Set<string>>()
	for (const treatment of treatments) {
		for (const roleKey of roleDirectionKeys(treatment)) {
			const key = cellKey(fieldDirectionKey(treatment), roleKey)
			const values = cells.get(key) ?? new Set<string>()
			values.add(treatmentKey(treatment))
			cells.set(key, values)
		}
	}
	return new Map([...cells].map(([key, values]) => [key, [...values].sort()]))
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) / 0.04)
}

function guardEvaluation(
	incumbent: CompletePaletteTreatment,
	challenger: CompletePaletteTreatment,
): IdentityQualityGuardEvaluation {
	const blocks = ALBUM_ARTWORK_PALETTE_V2_0_7_3_COMPLETE_QUALITY_GUARD_BLOCKS.map((block) => {
		const incumbentEvidenceLevel = evidenceLevel(incumbent.scores[block] - incumbent.scores.generatedPenalty)
		const challengerEvidenceLevel = evidenceLevel(challenger.scores[block] - challenger.scores.generatedPenalty)
		return {
			block,
			incumbentEvidenceLevel,
			challengerEvidenceLevel,
			pass: challengerEvidenceLevel >= incumbentEvidenceLevel,
		}
	})
	const resolvedLosses = blocks.filter(({ pass }) => !pass).map(({
		block,
		incumbentEvidenceLevel,
		challengerEvidenceLevel,
	}) => ({
		block,
		incumbentEvidenceLevel,
		challengerEvidenceLevel,
		evidenceLevelLoss: incumbentEvidenceLevel - challengerEvidenceLevel,
	}))
	return {
		incumbentTreatmentId: incumbent.id,
		challengerTreatmentId: challenger.id,
		pass: resolvedLosses.length === 0,
		blocks,
		resolvedLosses,
	}
}

function paretoDominates(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	let strict = false
	for (const block of ALBUM_ARTWORK_PALETTE_V2_0_7_3_PARETO_BLOCKS) {
		const firstLevel = evidenceLevel(first.scores[block] - first.scores.generatedPenalty)
		const secondLevel = evidenceLevel(second.scores[block] - second.scores.generatedPenalty)
		if (firstLevel < secondLevel) return false
		if (firstLevel > secondLevel) strict = true
	}
	return strict
}

function validateTreatment(treatment: CompletePaletteTreatment, label: string): void {
	const key = treatmentKey(treatment)
	invariant(treatmentKeyPattern.test(key), `${label} has a non-canonical complete-treatment key`)
	const roleHexes = [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
	]
	invariant(new Set(roleHexes).size === treatment.cardinality, `${label} has invalid cardinality`)
	invariant(treatment.cardinality >= 2 && treatment.cardinality <= 4, `${label} is outside unchanged cardinality`)
	invariant(treatment.background.hex !== treatment.foreground.hex, `${label} collapses background and foreground`)
	invariant(treatment.collapse.surface === (treatment.surface.hex === treatment.background.hex),
		`${label} has invalid surface collapse`)
	invariant(treatment.collapse.accent === (treatment.accent.hex === treatment.foreground.hex),
		`${label} has invalid accent collapse`)
	invariant(!(treatment.gradient && treatment.collapse.surface), `${label} has an illegal collapsed gradient field`)
	invariant(Object.values(treatment.scores).every(Number.isFinite), `${label} has a non-finite score`)
}

function validateRun(
	run: Readonly<{
		wallMs: readonly number[]
		deterministicRepeatedRun: true
		fullOutputSha256: string
		repeatFullOutputSha256: string
		scientificSha256: string
		repeatScientificSha256: string
	}>,
	ceiling: number,
	expectedScientificSha256: string,
	label: string,
): void {
	invariant(run.deterministicRepeatedRun === true && run.wallMs.length === 2, `${label} lacks two-run determinism evidence`)
	invariant(/^[a-f0-9]{64}$/u.test(run.fullOutputSha256) &&
		run.fullOutputSha256 === run.repeatFullOutputSha256, `${label} full repeated outputs differ`)
	invariant(run.scientificSha256 === expectedScientificSha256 &&
		run.repeatScientificSha256 === expectedScientificSha256, `${label} repeated scientific hashes differ`)
	invariant(run.wallMs.every((value) => Number.isFinite(value) && value >= 0 && value <= ceiling),
		`${label} failed the frozen runtime gate`)
}

function validateNoResourceCollectionFields(value: unknown, label: string): void {
	if (value === null || typeof value !== "object") return
	if (Array.isArray(value)) {
		for (const entry of value) validateNoResourceCollectionFields(entry, label)
		return
	}
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		invariant(!/(?:^|_)(?:rss|memory|heap)(?:$|_)/iu.test(key), `${label} contains forbidden resource field ${key}`)
		validateNoResourceCollectionFields(entry, label)
	}
}

function expectedQualificationReasons(input: Readonly<{
	absent: boolean
	sourceConnected: boolean
	legal: boolean
	ordinary: boolean
	guard: boolean
	fills: boolean
}>): string[] {
	return [
		...input.absent ? [] : ["complete-treatment-key-present-in-control"],
		...input.sourceConnected ? [] : ["lineage-is-not-fully-source-connected"],
		...input.legal ? [] : ["fails-unchanged-treatment-legality"],
		...input.ordinary || input.guard ? [] : ["neither-ordinary-pareto-member-nor-complete-domain-non-inferior"],
		...input.fills ? [] : ["does-not-fill-control-empty-field-role-cell"],
	]
}

function validateAddition(
	addition: RecallAuditNewTreatment,
	controlKeys: ReadonlySet<string>,
	controlCells: ReadonlyMap<string, readonly string[]>,
	incumbent: CompletePaletteTreatment,
	ordinaryPareto: boolean,
	registryFamilies: ReadonlySet<string> | null,
	registryFieldKeys: ReadonlySet<string> | null,
	registryRoleKeys: ReadonlySet<string> | null,
	label: string,
): void {
	validateTreatment(addition.treatment, label)
	const key = treatmentKey(addition.treatment)
	invariant(addition.key === key && !controlKeys.has(key), `${label} is not an additive canonical key`)
	const lineage = addition.lineage
	invariant(lineage.fieldHypothesisId === addition.treatment.sourceFieldHypothesisId &&
		lineage.fieldDirectionKey === fieldDirectionKey(addition.treatment) &&
		albumArtworkPaletteV2073CanonicalJson(lineage.roleDirectionKeys) ===
			albumArtworkPaletteV2073CanonicalJson(roleDirectionKeys(addition.treatment)), `${label} has invalid lineage keys`)
	const expectedFamilyIds = [...new Set(Object.values(addition.treatment.familyRoles)
		.filter((familyId) => familyId !== "generated"))].sort()
	invariant(albumArtworkPaletteV2073CanonicalJson(lineage.familyIds) ===
		albumArtworkPaletteV2073CanonicalJson(expectedFamilyIds), `${label} has incomplete family lineage`)
	const sourceConnected = lineage.sourceConnected && lineage.representatives.every(({ sourceConnected: connected }) => connected)
	if (registryFamilies !== null && registryFieldKeys !== null && registryRoleKeys !== null) {
		invariant(lineage.familyIds.every((familyId) => registryFamilies.has(familyId)) &&
			registryFieldKeys.has(lineage.fieldDirectionKey) &&
			lineage.roleDirectionKeys.every((roleKey) => registryRoleKeys.has(roleKey)),
		`${label} lineage is absent from the source registry`)
	}
	const expectedGuard = guardEvaluation(incumbent, addition.treatment)
	invariant(albumArtworkPaletteV2073CanonicalJson(addition.qualityGuard) ===
		albumArtworkPaletteV2073CanonicalJson(expectedGuard), `${label} has an inexact complete-domain guard`)
	const fills = roleDirectionKeys(addition.treatment).some((roleKey) =>
		!controlCells.has(cellKey(fieldDirectionKey(addition.treatment), roleKey)))
	const expected = {
		absent: true,
		sourceConnected,
		legal: true,
		ordinary: ordinaryPareto,
		guard: expectedGuard.pass,
		fills,
	}
	const qualification = addition.qualification
	invariant(qualification.treatmentKey === key && qualification.absentFromControl === expected.absent &&
		qualification.sourceConnectedFullLineage === expected.sourceConnected &&
		qualification.legalUnderUnchangedRules === expected.legal &&
		qualification.ordinaryParetoMember === expected.ordinary &&
		qualification.completeDomainGuardPass === expected.guard &&
		qualification.fillsControlEmptyFieldRoleCell === expected.fills &&
		qualification.qualifies === (expectedQualificationReasons(expected).length === 0) &&
		albumArtworkPaletteV2073CanonicalJson(qualification.reasons) ===
			albumArtworkPaletteV2073CanonicalJson(expectedQualificationReasons(expected)),
		`${label} has an inexact recall qualification`)
}

function validateRecallArm(
	artifact: AlbumArtworkPaletteV2073RecallArmArtifact,
	controlTreatments: readonly CompletePaletteTreatment[],
	controlPublicSlateKeys: readonly string[],
	controlScientificSha256: string,
	controlRawCandidateCount: number,
	incumbent: CompletePaletteTreatment,
	ceiling: number,
	index: number,
): void {
	const scientific = artifact.scientific
	const expectedArm = ALBUM_ARTWORK_PALETTE_V2_0_7_3_RECALL_ARMS[index]
	invariant(scientific.arm === expectedArm, `Recall arm ${index} is out of protocol order`)
	const expectedChangedStages = expectedArm === "widened-field-hypothesis-retention"
		? ["field-hypothesis-retention"]
		: expectedArm === "widened-family-lane-retention" ? ["lane-retention"] : ["representative-pairing"]
	invariant(albumArtworkPaletteV2073CanonicalJson(scientific.changedStages) ===
		albumArtworkPaletteV2073CanonicalJson(expectedChangedStages), `${expectedArm} changed an undeclared stage`)
	invariant(artifact.controlScientificSha256 === controlScientificSha256, `${expectedArm} has a different control`)
	const scientificSha256 = albumArtworkPaletteV2073ScientificSha256(scientific)
	validateRun(artifact.run, ceiling, scientificSha256, expectedArm)

	const controlKeys = new Set(controlTreatments.map(treatmentKey))
	const additions = scientific.additions
	const additionKeys = additions.map(({ key }) => key)
	invariant(new Set(additionKeys).size === additionKeys.length && additionKeys.every((key) => !controlKeys.has(key)),
		`${expectedArm} additions are not unique and disjoint from control`)
	invariant(albumArtworkPaletteV2073CanonicalJson(scientific.domain.addedCompleteTreatmentKeys) ===
		albumArtworkPaletteV2073CanonicalJson(additionKeys), `${expectedArm} domain additions do not reconcile`)
	invariant(scientific.domain.rawCandidateCount === controlRawCandidateCount + additions.length &&
		scientific.domain.materializedCandidateCount === controlTreatments.length + additions.length &&
		scientific.domain.capacity === 1_500 && scientific.domain.materializedCandidateCount <= 1_500,
		`${expectedArm} violates complete-candidate additivity or capacity`)
	invariant(scientific.domain.qualityIncumbentTreatmentId === incumbent.id, `${expectedArm} changed the quality incumbent`)
	invariant(scientific.domain.publicSlateKeys.length <= 8 &&
		albumArtworkPaletteV2073CanonicalJson(scientific.domain.publicSlateKeys.slice(0, controlPublicSlateKeys.length)) ===
			albumArtworkPaletteV2073CanonicalJson(controlPublicSlateKeys), `${expectedArm} displaced the control public slate`)

	const registry = scientific.registry
	invariant(registry.version === "album-artwork-palette-v2-recall-registry-0.7.3", `${expectedArm} registry version is invalid`)
	for (const entries of [registry.families, registry.fieldDirections, registry.roleDirections]) {
		invariant(entries.every(({ sourceConnected }) => sourceConnected), `${expectedArm} registry has disconnected evidence`)
	}
	const sourceConnectedHypothesisIds = new Set(registry.fieldHypotheses
		.filter(({ sourceConnected }) => sourceConnected).map(({ hypothesisId }) => hypothesisId))
	invariant(registry.fieldDirections.every(({ hypothesisIds }) =>
		hypothesisIds.every((hypothesisId) => sourceConnectedHypothesisIds.has(hypothesisId))),
		`${expectedArm} field directions include a disconnected hypothesis`)
	const familyIds = new Set(registry.families.map(({ familyId }) => familyId))
	const fieldKeys = new Set(registry.fieldDirections.map(({ key }) => key))
	const roleKeys = new Set(registry.roleDirections.map(({ key }) => key))
	invariant(familyIds.size === registry.families.length && fieldKeys.size === registry.fieldDirections.length &&
		roleKeys.size === registry.roleDirections.length, `${expectedArm} registry has duplicate keys`)
	invariant(registry.identityObligationFamilyIds.every((familyId) => familyIds.has(familyId)),
		`${expectedArm} identity obligations are outside the registry`)

	const domainTreatments = [...controlTreatments, ...additions.map(({ treatment }) => treatment)]
	const expectedCells = treatmentCells(domainTreatments)
	const controlCells = treatmentCells(controlTreatments)
	const matrix = scientific.availability
	invariant(new Set(matrix.fieldDirectionKeys).size === matrix.fieldDirectionKeys.length &&
		new Set(matrix.roleDirectionKeys).size === matrix.roleDirectionKeys.length &&
		albumArtworkPaletteV2073CanonicalJson(matrix.fieldDirectionKeys) ===
			albumArtworkPaletteV2073CanonicalJson(registry.fieldDirections.map(({ key }) => key)) &&
		albumArtworkPaletteV2073CanonicalJson(matrix.roleDirectionKeys) ===
			albumArtworkPaletteV2073CanonicalJson(registry.roleDirections.map(({ key }) => key)) &&
		matrix.cellCount === matrix.fieldDirectionKeys.length * matrix.roleDirectionKeys.length,
		`${expectedArm} matrix dimensions do not reconcile`)
	const identityRoleKeys = registry.roleDirections.filter(({ identityObligation }) => identityObligation).map(({ key }) => key)
	invariant(albumArtworkPaletteV2073CanonicalJson(matrix.identityObligationRoleDirectionKeys) ===
		albumArtworkPaletteV2073CanonicalJson(identityRoleKeys), `${expectedArm} matrix identity subset is invalid`)
	function* expectedAvailabilityRows(): Generator<unknown> {
		for (const fieldDirection of registry.fieldDirections) {
			for (const roleDirection of registry.roleDirections) {
				const key = cellKey(fieldDirection.key, roleDirection.key)
				const expectedControl = controlCells.get(key) ?? []
				const expectedArmKeys = expectedCells.get(key) ?? []
				yield {
					key,
					fieldDirectionKey: fieldDirection.key,
					roleDirectionKey: roleDirection.key,
					role: roleDirection.role,
					familyId: roleDirection.familyId,
					identityObligation: roleDirection.identityObligation,
					controlTreatmentKeys: expectedControl,
					armTreatmentKeys: expectedArmKeys,
					controlAvailable: expectedControl.length > 0,
					armAvailable: expectedArmKeys.length > 0,
					newlyAvailable: expectedControl.length === 0 && expectedArmKeys.length > 0,
				}
			}
		}
	}
	invariant(matrix.cellOrderedRoot === albumArtworkPaletteV2073OrderedValueRoot(
		"album-artwork-palette-v2-0.7.3-availability-cells-v1",
		expectedAvailabilityRows(),
	), `${expectedArm} matrix cell root does not match the reconstructed domain`)

	const custody = scientific.custody
	invariant(custody.cellCount === matrix.cellCount && /^[a-f0-9]{64}$/u.test(custody.fullCellOrderedRoot) &&
		albumArtworkPaletteV2073CanonicalJson(custody.stageNames) ===
			albumArtworkPaletteV2073CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_3_CUSTODY_STAGES),
		`${expectedArm} custody dimensions or stages do not reconcile`)
	for (const template of custody.templates) {
		invariant(albumArtworkPaletteV2073CanonicalJson(template.stages.map(({ stage }) => stage)) ===
			albumArtworkPaletteV2073CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_3_CUSTODY_STAGES),
			`${expectedArm} custody template does not have exactly ten ordered stages`)
		const firstLoss = template.stages.find(({ status }) => status === "unavailable") ?? null
		invariant(template.firstLossStage === (firstLoss?.stage ?? null) &&
			template.firstLossReason === (firstLoss?.reason ?? null), `${expectedArm} first loss is inexact`)
	}
	invariant(custody.templates.length > 0 && custody.templateRuns.every(([templateIndex, runLength]) =>
		Number.isSafeInteger(templateIndex) && templateIndex >= 0 && templateIndex < custody.templates.length &&
		Number.isSafeInteger(runLength) && runLength > 0) &&
		custody.templateRuns.reduce((sum, [, runLength]) => sum + runLength, 0) === custody.cellCount,
		`${expectedArm} custody run-length encoding does not cover every matrix cell`)

	const ordinaryKeys = new Set(scientific.domain.ordinaryParetoAddedKeys)
	for (const [additionIndex, addition] of additions.entries()) {
		const independentlyOrdinary = !domainTreatments.some((other) =>
			treatmentKey(other) !== addition.key && paretoDominates(other, addition.treatment))
		invariant(ordinaryKeys.has(addition.key) === independentlyOrdinary,
			`${expectedArm} ordinary Pareto membership is inexact for ${addition.key}`)
		validateAddition(addition, controlKeys, controlCells, incumbent, independentlyOrdinary,
			familyIds, fieldKeys, roleKeys, `${expectedArm} addition ${additionIndex}`)
	}
	invariant([...ordinaryKeys].every((key) => additionKeys.includes(key)), `${expectedArm} has a non-addition Pareto key`)
}

function validateFactorized(
	artifact: AlbumArtworkPaletteV2073FactorizedArmArtifact,
	controlTreatments: readonly CompletePaletteTreatment[],
	controlPublicSlateKeys: readonly string[],
	controlScientificSha256: string,
	controlRawCandidateCount: number,
	incumbent: CompletePaletteTreatment,
	ceiling: number,
	expectedArm: "factorized-pareto-3000" | "factorized-pareto-6000",
): void {
	const scientific = artifact.scientific
	invariant(scientific.arm === expectedArm && scientific.domain.checkpoint ===
		(expectedArm === "factorized-pareto-3000" ? 3_000 : 6_000), `${expectedArm} checkpoint is invalid`)
	invariant(artifact.controlScientificSha256 === controlScientificSha256, `${expectedArm} changed the control`)
	validateRun(artifact.run, ceiling, albumArtworkPaletteV2073ScientificSha256(scientific), expectedArm)
	const controlKeys = new Set(controlTreatments.map(treatmentKey))
	const controlCells = treatmentCells(controlTreatments)
	const registryFamilies = new Set(scientific.registry.families.map(({ familyId }) => familyId))
	const registryFieldKeys = new Set(scientific.registry.fieldDirections.map(({ key }) => key))
	const registryRoleKeys = new Set(scientific.registry.roleDirections.map(({ key }) => key))
	invariant(scientific.registry.families.every(({ sourceConnected }) => sourceConnected) &&
		scientific.registry.fieldDirections.every(({ sourceConnected }) => sourceConnected) &&
		scientific.registry.roleDirections.every(({ sourceConnected }) => sourceConnected),
		`${expectedArm} registry has disconnected evidence`)
	const additions = scientific.additions
	const additionKeys = additions.map(({ key }) => key)
	invariant(new Set(additionKeys).size === additionKeys.length && additionKeys.every((key) => !controlKeys.has(key)) &&
		albumArtworkPaletteV2073CanonicalJson(scientific.domain.addedCompleteTreatmentKeys) ===
			albumArtworkPaletteV2073CanonicalJson(additionKeys), `${expectedArm} additions do not reconcile`)
	invariant(scientific.domain.rawCandidateCount === controlRawCandidateCount + additions.length &&
		scientific.domain.materializedCandidateCount === controlTreatments.length + additions.length &&
		scientific.domain.capacity === 1_500 && scientific.domain.materializedCandidateCount <= 1_500,
		`${expectedArm} violates materialized additivity or capacity`)
	invariant(scientific.domain.qualityIncumbentTreatmentId === incumbent.id &&
		scientific.domain.publicSlateKeys.length <= 8 &&
		albumArtworkPaletteV2073CanonicalJson(scientific.domain.publicSlateKeys.slice(0, controlPublicSlateKeys.length)) ===
			albumArtworkPaletteV2073CanonicalJson(controlPublicSlateKeys), `${expectedArm} changed incumbent or slate authority`)
	invariant(albumArtworkPaletteV2073CanonicalJson(scientific.upstream.changedStages) ===
		albumArtworkPaletteV2073CanonicalJson(["complete-treatment-construction"]) &&
		scientific.upstream.representativesPerRole === 2 && scientific.upstream.fieldRepresentativePairing === "same-index",
		`${expectedArm} changed an upstream mechanism`)
	const logical = scientific.logical
	invariant(logical.attemptedTupleCount + logical.truncatedTupleCount === logical.enumerableTupleCount &&
		logical.uniqueCanonicalKeyCountBeforePareto + logical.duplicateLegalKeyCount === logical.legalTupleCount &&
		logical.legalTupleCount <= logical.attemptedTupleCount &&
		logical.checkpointReached === (logical.uniqueCanonicalKeyCountBeforePareto === logical.checkpoint) &&
		logical.ordinaryParetoKeyCount <= logical.retainedUnionKeyCount &&
		logical.completeDomainGuardPassingKeyCount <= logical.retainedUnionKeyCount &&
		logical.retainedUnionKeyCount <= logical.ordinaryParetoKeyCount + logical.completeDomainGuardPassingKeyCount,
		`${expectedArm} logical factorized counts do not reconcile`)
	invariant(albumArtworkPaletteV2073CanonicalJson(scientific.truncationWitnesses) ===
		albumArtworkPaletteV2073CanonicalJson(scientific.escalation.witnesses), `${expectedArm} truncation certificate is inexact`)
	for (const [index, addition] of additions.entries()) {
		validateAddition(addition, controlKeys, controlCells, incumbent,
			addition.qualification.ordinaryParetoMember, registryFamilies, registryFieldKeys, registryRoleKeys,
			`${expectedArm} addition ${index}`)
	}
	if (expectedArm === "factorized-pareto-6000") {
		invariant(typeof artifact.recomputed3000ScientificSha256 === "string" &&
			artifact.recomputed3000ScientificSha256.length === 64 &&
			typeof artifact.certificateRecomputationWallMs === "number" &&
			artifact.certificateRecomputationWallMs <= ceiling,
			"factorized-pareto-6000 lacks gated process-local certificate recomputation")
	}
}

async function verifyFrozenRawBindings(): Promise<AlbumArtworkPaletteV2073DevelopmentManifest> {
	const bindings = ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS
	for (const binding of [
		bindings.developmentPanel,
		...bindings.protectedSamples,
		...Object.values(bindings.frozenControl.files),
	]) {
		invariant(await fileSha256(resolve(projectRoot, binding.path)) === binding.rawSha256,
			`Frozen analyzer input changed: ${binding.path}`)
	}
	const panel = JSON.parse(await readFile(resolve(projectRoot, bindings.developmentPanel.path), "utf8")) as
		AlbumArtworkPaletteV2073DevelopmentManifest
	invariant(panel.manifestId === bindings.developmentPanel.manifestId && panel.sourceCount === 28 &&
		panel.sources.length === 28, "Analyzer development-panel binding is invalid")
	const protectedHashes = new Set<string>()
	for (const binding of bindings.protectedSamples) {
		const value = JSON.parse(await readFile(resolve(projectRoot, binding.path), "utf8")) as Record<string, unknown>
		invariant(value.manifestId === binding.manifestId, `Protected manifest ID changed: ${binding.path}`)
		if (Array.isArray(value.sources)) {
			for (const entry of value.sources) {
				const sha256 = (entry as Record<string, unknown>).sha256
				if (typeof sha256 === "string") protectedHashes.add(sha256)
			}
		}
		if (Array.isArray(value.families)) {
			for (const family of value.families) {
				const variants = (family as Record<string, unknown>).variants
				if (!Array.isArray(variants)) continue
				for (const entry of variants) {
					const sha256 = (entry as Record<string, unknown>).sha256
					if (typeof sha256 === "string") protectedHashes.add(sha256)
				}
			}
		}
	}
	invariant(panel.sources.every(({ sha256 }) => !protectedHashes.has(sha256)),
		"Development panel overlaps a protected fresh or future sample")
	return panel
}

async function currentImplementationSha256(): Promise<string> {
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const path of ALBUM_ARTWORK_PALETTE_V2_0_7_3_IMPLEMENTATION_PATHS) {
		hash.update(path)
		hash.update("\0")
		hash.update(await readFile(resolve(projectRoot, path)))
		hash.update("\0")
	}
	return hash.digest("hex")
}

export async function analyzeAlbumArtworkPaletteV2073Development(directory: string): Promise<Readonly<Record<string, unknown>>> {
	const root = resolve(directory)
	const panel = await verifyFrozenRawBindings()
	const [executionInput, resultsInput, summaryInput] = await Promise.all([
		readJsonWithRaw<AlbumArtworkPaletteV2073ExecutionManifest>(resolve(root, "execution-manifest.json")),
		readJsonWithRaw<AlbumArtworkPaletteV2073Results>(resolve(root, "results.json")),
		readJsonWithRaw<SummaryArtifact>(resolve(root, "summary.json")),
	])
	const execution = executionInput.value
	const results = resultsInput.value
	const summary = summaryInput.value
	invariant(execution.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION &&
		execution.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION &&
		execution.protocolId === ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL_ID &&
		execution.workerCount === ALBUM_ARTWORK_PALETTE_V2_0_7_3_WORKER_COUNT &&
		execution.fixedPanelSourceCount === 28 &&
		execution.executionManifestId === albumArtworkPaletteV2073ContentId(execution, "executionManifestId") &&
		albumArtworkPaletteV2073CanonicalJson(execution.frozenBindings) ===
			albumArtworkPaletteV2073CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS),
		"Execution-manifest schema or frozen binding is invalid")
	invariant(execution.implementationSha256 === await currentImplementationSha256(),
		"Execution implementation hash does not match the current bound implementation closure")
	const expectedExecutedCount = execution.mode === "full-28-source" ? 28 : 1
	invariant(execution.executedSourceCount === expectedExecutedCount &&
		execution.sourceCaseIds.length === expectedExecutedCount &&
		new Set(execution.sourceCaseIds).size === expectedExecutedCount &&
		execution.sourceCaseIds.every((caseId) => panel.sources.some((source) => source.caseId === caseId)),
		"Execution source roster is invalid")
	const maximumCalibrationWallMs = Math.max(...execution.calibration.sources.flatMap(({ wallMs }) => wallMs))
	const expectedCeiling = Math.max(60_000, Math.ceil(6 * maximumCalibrationWallMs / 1_000) * 1_000)
	invariant(execution.calibration.formula === "max(60000,ceil(6*maximumCalibrationWallMs/1000)*1000)" &&
		execution.calibration.maximumCalibrationWallMs === maximumCalibrationWallMs &&
		execution.calibration.wallCeilingMsPerArmPerSource === expectedCeiling &&
		execution.calibration.sources.length === expectedExecutedCount,
		"Control calibration or frozen wall-ceiling formula is invalid")
	validateNoResourceCollectionFields(execution, "execution manifest")
	validateNoResourceCollectionFields(results, "results")
	validateNoResourceCollectionFields(summary, "summary")

	const resultEvidence: AlbumArtworkPaletteV2073ResultSourceEvidence[] = []
	const sourceManifestFiles: AlbumArtworkPaletteV2073ManifestFile[] = []
	for (const caseId of execution.sourceCaseIds) {
		const panelSource = panel.sources.find((source) => source.caseId === caseId)!
		const sourcePath = resolve(root, "sources", `${caseId}.json`)
		invariant(pathInside(root, sourcePath), `Unsafe source artifact path for ${caseId}`)
		const sourceRaw = await readFile(sourcePath, "utf8")
		const sourceArtifact = JSON.parse(sourceRaw) as AlbumArtworkPaletteV2073SourceArtifact
		const sourceMetadata = await stat(sourcePath)
		sourceManifestFiles.push({
			path: `sources/${caseId}.json`,
			byteCount: sourceMetadata.size,
			rawSha256: albumArtworkPaletteV2073Sha256(sourceRaw),
		})
		invariant(sourceArtifact.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION &&
			sourceArtifact.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION &&
			sourceArtifact.implementationSha256 === execution.implementationSha256 &&
			sourceArtifact.executionManifestId === execution.executionManifestId &&
			albumArtworkPaletteV2073CanonicalJson(sourceArtifact.source) ===
				albumArtworkPaletteV2073CanonicalJson(panelSource), `Source artifact binding is invalid for ${caseId}`)
		invariant(sourceArtifact.scientificSha256 === albumArtworkPaletteV2073ScientificSha256(
			albumArtworkPaletteV2073SourceScientificIdentity(sourceArtifact)), `Source scientific identity is invalid for ${caseId}`)
		validateNoResourceCollectionFields(sourceArtifact, `source artifact ${caseId}`)

		const frozenPath = resolve(
			projectRoot,
			`research/data/experiments/album-artwork-palette-v2-0.7.2-development/sources/${caseId}.json`,
		)
		const frozenRaw = await readFile(frozenPath, "utf8")
		const frozen = JSON.parse(frozenRaw) as FrozenSourceArtifact
		const calibration = execution.calibration.sources.find((entry) => entry.caseId === caseId)
		invariant(calibration !== undefined && calibration.sourceSha256 === panelSource.sha256 &&
			calibration.frozenSourceArtifactRawSha256 === albumArtworkPaletteV2073Sha256(frozenRaw) &&
			calibration.controlScientificSha256 === sourceArtifact.control.controlScientificSha256 &&
			calibration.wallMs.length === 2 && calibration.wallMs.every((value) => Number.isFinite(value) && value >= 0) &&
			calibration.fullOutputSha256 === calibration.repeatFullOutputSha256 &&
			/^[a-f0-9]{64}$/u.test(calibration.fullOutputSha256),
			`Calibration custody is invalid for ${caseId}`)
		const controlArtifact = sourceArtifact.control
		invariant(controlArtifact.phase === "control" && controlArtifact.executionManifestId === execution.executionManifestId &&
			albumArtworkPaletteV2073ByteJsonSha256(controlArtifact.control.controlExtraction) ===
				albumArtworkPaletteV2073ByteJsonSha256(frozen.extraction),
			`Instrumented control is not byte-identical to frozen 0.7.2 for ${caseId}`)
		const controlScientificSha256 = albumArtworkPaletteV2073ScientificSha256(controlArtifact.control)
		invariant(controlArtifact.controlScientificSha256 === controlScientificSha256 &&
			controlArtifact.frozenControlExtractionSha256 === albumArtworkPaletteV2073ScientificSha256(frozen.extraction),
			`Control scientific hash is invalid for ${caseId}`)
		validateRun(controlArtifact.run, expectedCeiling, controlScientificSha256, `${caseId} control`)
		const control = controlArtifact.control.control
		const controlTreatments = control.completeTreatments
		const controlKeys = controlTreatments.map(treatmentKey)
		invariant(control.arm === "control-0.7.2" && control.changedStages.length === 0 &&
			control.capacity === 1_500 && control.materializedCandidateCount === controlTreatments.length &&
			control.materializedCandidateCount <= 1_500 && new Set(controlKeys).size === controlKeys.length &&
			albumArtworkPaletteV2073CanonicalJson(control.completeTreatmentKeys) ===
				albumArtworkPaletteV2073CanonicalJson(controlKeys) &&
			JSON.stringify(control.publicSlate) === JSON.stringify(controlArtifact.control.controlExtraction.alternatives) &&
			control.publicSlate.length <= 8, `Control domain is invalid for ${caseId}`)
		for (const [index, treatment] of controlTreatments.entries()) validateTreatment(treatment, `${caseId} control ${index}`)
		const incumbent = controlTreatments.find(({ id }) => id === control.qualityIncumbentTreatmentId)
		invariant(incumbent !== undefined, `Control quality incumbent is absent for ${caseId}`)
		const controlPublicSlateKeys = control.publicSlate.map(treatmentKey)

		invariant(sourceArtifact.recallArms.length === 4, `Recall arm count is invalid for ${caseId}`)
		for (const [index, arm] of sourceArtifact.recallArms.entries()) {
			validateRecallArm(arm, controlTreatments, controlPublicSlateKeys, controlScientificSha256,
				control.rawCandidateCount, incumbent, expectedCeiling, index)
		}
		const obligations = controlArtifact.control.controlExtraction.diagnostics.identityObligationGraph.obligations
		for (const arm of sourceArtifact.recallArms) {
			invariant(obligations.every(({ familyId }) => arm.scientific.registry.identityObligationFamilyIds.includes(familyId)),
				`${arm.scientific.arm} did not preserve every control identity obligation`)
		}

		const diagnostic = sourceArtifact.diagnostic
		invariant(diagnostic.scientific.arm === "diagnostic-joint-availability-matrix" &&
			diagnostic.scientific.selectionEligible === false && diagnostic.scientific.matrices.length === 4,
			`Diagnostic matrix completion is invalid for ${caseId}`)
		for (const [index, matrix] of diagnostic.scientific.matrices.entries()) {
			const arm = sourceArtifact.recallArms[index].scientific
			invariant(matrix.arm === arm.arm && matrix.fieldDirectionCount === arm.availability.fieldDirectionKeys.length &&
				matrix.roleDirectionCount === arm.availability.roleDirectionKeys.length &&
				matrix.cellCount === arm.availability.cellCount &&
				matrix.registrySha256 === albumArtworkPaletteV2073ScientificSha256(arm.registry) &&
				matrix.matrixSha256 === albumArtworkPaletteV2073ScientificSha256(arm.availability) &&
				matrix.custodySha256 === albumArtworkPaletteV2073ScientificSha256(arm.custody),
				`Diagnostic matrix index is stale for ${caseId}`)
		}
		validateRun(diagnostic.run, expectedCeiling,
			albumArtworkPaletteV2073ScientificSha256(diagnostic.scientific), `${caseId} diagnostic matrix`)

		validateFactorized(sourceArtifact.factorized3000, controlTreatments, controlPublicSlateKeys,
			controlScientificSha256, control.rawCandidateCount, incumbent, expectedCeiling, "factorized-pareto-3000")
		if (sourceArtifact.factorized6000 !== null) {
			validateFactorized(sourceArtifact.factorized6000, controlTreatments, controlPublicSlateKeys,
				controlScientificSha256, control.rawCandidateCount, incumbent, expectedCeiling, "factorized-pareto-6000")
			invariant(sourceArtifact.factorized6000.recomputed3000ScientificSha256 ===
				sourceArtifact.factorized3000.run.scientificSha256,
				`Process-local 3000 certificate recomputation is stale for ${caseId}`)
			const certificate = sourceArtifact.factorized3000.scientific.escalation
			invariant(certificate.trigger6000 && certificate.exactCheckpointOnlyProof &&
				certificate.reason === "verified-otherwise-qualifying-lineage-excluded-solely-by-checkpoint" &&
				certificate.witnesses.otherwiseQualifyingTreatmentKeys.length > 0 &&
				certificate.witnesses.otherwiseQualifyingCellKeys.length > 0 && certificate.verifiedTriggerToken !== null,
				`factorized-pareto-6000 ran without an exact source-bound 3000 trigger for ${caseId}`)
		}
		resultEvidence.push(albumArtworkPaletteV2073ResultSourceEvidence(sourceArtifact))
	}

	const expectedResults = buildAlbumArtworkPaletteV2073ResultsFromEvidence(execution, resultEvidence)
	invariant(albumArtworkPaletteV2073CanonicalJson(results) === albumArtworkPaletteV2073CanonicalJson(expectedResults),
		"Results do not reconcile with independently verified source shards")
	invariant(results.factorizedEscalation.policySatisfied, "Factorized 6000 trigger policy failed")
	invariant(results.authorization.humanReview === false && results.authorization.directionalSample === false &&
		results.authorization.phase5 === false && results.authorization.promotion === false &&
		results.authorization.persistence === false && results.authorization.fullRoster === false,
		"Results authorize a forbidden next step")
	const expectedSummaryDisposition = results.selection.pass
		? "bounded-recall-mechanism-selected-no-next-step-authorized"
		: "next-research-unit-multi-hue-field-structure"
	const summaryIdentity = { ...summary } as Record<string, unknown>
	delete summaryIdentity.summaryId
	invariant(summary.summaryId === albumArtworkPaletteV2073ScientificSha256(summaryIdentity) &&
		summary.candidateVersion === results.candidateVersion &&
		summary.implementationSha256 === results.implementationSha256 &&
		summary.executionManifestId === results.executionManifestId &&
		summary.scientificSha256 === results.scientificSha256 &&
		summary.wallCeilingMsPerArmPerSource === expectedCeiling &&
		albumArtworkPaletteV2073CanonicalJson(summary.arms) === albumArtworkPaletteV2073CanonicalJson(results.arms) &&
		albumArtworkPaletteV2073CanonicalJson(summary.factorizedEscalation) ===
			albumArtworkPaletteV2073CanonicalJson(results.factorizedEscalation) &&
		albumArtworkPaletteV2073CanonicalJson(summary.selection) ===
			albumArtworkPaletteV2073CanonicalJson(results.selection) && summary.disposition === expectedSummaryDisposition,
		"Summary does not reconcile with verified results")

	sourceManifestFiles.sort((first, second) => first.path.localeCompare(second.path, "en"))
	const analysisWithoutId = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION,
		implementationSha256: execution.implementationSha256,
		executionManifestId: execution.executionManifestId,
		scientificSha256: results.scientificSha256,
		inputHashes: {
			executionManifestRawSha256: albumArtworkPaletteV2073Sha256(executionInput.raw),
			resultsRawSha256: albumArtworkPaletteV2073Sha256(resultsInput.raw),
			summaryRawSha256: albumArtworkPaletteV2073Sha256(summaryInput.raw),
			sourceOrderedRoot: albumArtworkPaletteV2073OrderedRoot(sourceManifestFiles),
			frozenControl: ALBUM_ARTWORK_PALETTE_V2_0_7_3_FROZEN_BINDINGS.frozenControl,
		},
		verification: {
			schemaAndCountReconciliation: true,
			exactControlEquality: true,
			additiveControlTreatmentPreservation: true,
			changedStageIsolation: true,
			registryAndMatrixDimensions: true,
			tenStageFirstLossCustody: true,
			candidateAndSlateBounds: true,
			incumbentAndObligationPreservation: true,
			sourceConnectedLineage: true,
			exactGuardAndQualificationClauses: true,
			armDeterminism: true,
			runtimeGate: true,
			factorizedCountsAndTrigger: true,
		},
		gate: {
			threshold: 3,
			denominator: 28,
			arms: results.arms.filter(({ selectionEligible }) => selectionEligible).map((arm) => ({
				arm: arm.arm,
				qualifyingSourceCount: arm.qualifyingSourceCount,
				pass: arm.pass,
			})),
		},
		selection: results.selection,
		authorization: results.authorization,
		disposition: expectedSummaryDisposition,
		mechanicalPass: true,
	}
	return {
		...analysisWithoutId,
		analysisId: albumArtworkPaletteV2073ScientificSha256(analysisWithoutId),
	}
}

export async function verifyAlbumArtworkPaletteV2073Development(
	directory: string,
): Promise<Readonly<Record<string, unknown>>> {
	const root = resolve(directory)
	const manifestInput = await readJsonWithRaw<ArtifactManifest>(resolve(root, "manifest.json"))
	const manifest = manifestInput.value
	invariant(manifest.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_ARTIFACT_SCHEMA_VERSION &&
		manifest.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_3_VERSION &&
		manifest.manifestId === albumArtworkPaletteV2073ContentId(manifest, "manifestId"),
		"Artifact manifest schema or ID is invalid")
	const paths = manifest.files.map(({ path }) => path)
	invariant(new Set(paths).size === paths.length &&
		albumArtworkPaletteV2073CanonicalJson(paths) === albumArtworkPaletteV2073CanonicalJson([...paths].sort()),
		"Artifact manifest paths are not unique and ordered")
	const execution = JSON.parse(await readFile(resolve(root, "execution-manifest.json"), "utf8")) as
		AlbumArtworkPaletteV2073ExecutionManifest
	const expectedPaths = [
		"analysis.json",
		"execution-manifest.json",
		"results.json",
		"summary.json",
		...execution.sourceCaseIds.map((caseId) => `sources/${caseId}.json`),
	].sort()
	invariant(albumArtworkPaletteV2073CanonicalJson(paths) === albumArtworkPaletteV2073CanonicalJson(expectedPaths),
		"Artifact manifest file roster is incomplete or contains an unexpected file")
	for (const file of manifest.files) {
		invariant(!file.path.startsWith("/") && !file.path.split("/").includes(".."),
			`Unsafe artifact manifest path ${file.path}`)
		const absolute = resolve(root, file.path)
		invariant(pathInside(root, absolute), `Artifact manifest path escaped root: ${file.path}`)
		const metadata = await stat(absolute)
		invariant(metadata.isFile() && metadata.size === file.byteCount && await fileSha256(absolute) === file.rawSha256,
			`Artifact manifest hash or byte count failed for ${file.path}`)
	}
	invariant(manifest.orderedRoot === albumArtworkPaletteV2073OrderedRoot(manifest.files) &&
		manifest.executionManifestId === execution.executionManifestId, "Artifact ordered root or execution binding is invalid")
	const checkedAnalysis = JSON.parse(await readFile(resolve(root, "analysis.json"), "utf8")) as Record<string, unknown>
	const expectedAnalysis = await analyzeAlbumArtworkPaletteV2073Development(root)
	invariant(albumArtworkPaletteV2073CanonicalJson(checkedAnalysis) ===
		albumArtworkPaletteV2073CanonicalJson(expectedAnalysis), "Checked analysis is stale")
	invariant(checkedAnalysis.analysisId === albumArtworkPaletteV2073ContentId(checkedAnalysis, "analysisId"),
		"Analysis ID is invalid")
	return checkedAnalysis
}

async function main(): Promise<void> {
	let directory = defaultExperimentDirectory
	let verify = false
	for (const argument of process.argv.slice(2)) {
		if (argument === "--verify") verify = true
		else if (argument.startsWith("--experiment=")) directory = resolve(argument.slice("--experiment=".length))
		else throw new Error(`Unknown argument ${argument}`)
	}
	if (verify) {
		const analysis = await verifyAlbumArtworkPaletteV2073Development(directory)
		process.stdout.write(`Verified ${analysis.analysisId}\n`)
		return
	}
	const expected = await analyzeAlbumArtworkPaletteV2073Development(directory)
	const checked = JSON.parse(await readFile(resolve(directory, "analysis.json"), "utf8")) as Record<string, unknown>
	invariant(albumArtworkPaletteV2073CanonicalJson(checked) === albumArtworkPaletteV2073CanonicalJson(expected),
		"Checked analysis is stale; evaluator publication is immutable")
	process.stdout.write(`Analysis valid ${expected.analysisId}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
