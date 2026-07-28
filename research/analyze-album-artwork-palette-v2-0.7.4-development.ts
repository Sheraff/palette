import { readFile, realpath, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	completeTreatmentKey,
	evaluateIdentityQualityGuard,
	extractAlbumArtworkPaletteV2074Details,
} from "./src/album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
	IdentityQualityGuardEvaluation,
} from "./src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHANGED_STAGES,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_GUARD_BLOCKS,
	albumArtworkPaletteV2074ByteJsonSha256,
	albumArtworkPaletteV2074CanonicalJson,
	albumArtworkPaletteV2074ContentId,
	albumArtworkPaletteV2074FileSha256,
	albumArtworkPaletteV2074OrderedFileRoot,
	albumArtworkPaletteV2074OrderedValueRoot,
	albumArtworkPaletteV2074PathInside,
	albumArtworkPaletteV2074ScientificSha256,
	albumArtworkPaletteV2074Sha256,
	buildAlbumArtworkPaletteV2074ImplementationClosure,
	buildAlbumArtworkPaletteV2074Results,
	buildAlbumArtworkPaletteV2074ScientificPayload,
	buildAlbumArtworkPaletteV2074Summary,
	validateAlbumArtworkPaletteV2074NoResourceFields,
	verifyAlbumArtworkPaletteV2074FrozenInputs,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import type {
	AlbumArtworkPaletteV2074AdditionRow,
	AlbumArtworkPaletteV2074AdditionTerminalStage,
	AlbumArtworkPaletteV2074Delta,
	AlbumArtworkPaletteV2074ExecutionManifest,
	AlbumArtworkPaletteV2074FileRow,
	AlbumArtworkPaletteV2074ProductDelta,
	AlbumArtworkPaletteV2074Results,
	AlbumArtworkPaletteV2074SelectionCertificate,
	AlbumArtworkPaletteV2074SourceArtifact,
	AlbumArtworkPaletteV2074SourceRecord,
} from "./src/album-artwork-palette-v2-0.7.4-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_AUTHORIZATION,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONTROL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_DEVELOPMENT_PANEL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PRODUCT_BASELINE,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_RANKING_PRIORITY_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
} from "./src/album-artwork-palette-v2-0.7.4-protocol.ts"

type FrozenSourceArtifact = Readonly<{
	implementationHash: string
	source: AlbumArtworkPaletteV2074SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: AlbumArtworkPaletteV2Result
}>

type Historical073Source = Readonly<{
	source: AlbumArtworkPaletteV2074SourceRecord
	recallArms: ReadonlyArray<Readonly<{
		scientific: Readonly<{
			arm: string
			additions: ReadonlyArray<Readonly<{ key: string; treatment: CompletePaletteTreatment }>>
		}>
	}>>
}>

type ArtifactManifest = Readonly<{
	schemaVersion: number
	candidateVersion: string
	executionManifestId: string
	files: readonly AlbumArtworkPaletteV2074FileRow[]
	orderedRoot: string
	manifestId: string
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const defaultExperimentDirectory = resolve(
	moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.4-development",
)
const treatmentKeyPattern = /^#[a-f0-9]{6}:#[a-f0-9]{6}:#[a-f0-9]{6}:#[a-f0-9]{6}:(?:gradient|flat)$/u

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function validateExactKeys(value: object, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	invariant(JSON.stringify(actual) === JSON.stringify([...expected].sort()), `${label} schema keys are invalid`)
}

async function readJsonWithRaw<T>(path: string): Promise<Readonly<{ raw: string; value: T }>> {
	const raw = await readFile(path, "utf8")
	return { raw, value: JSON.parse(raw) as T }
}

async function readBoundSource<T>(path: string, expectedSha256: string): Promise<T> {
	const raw = await readFile(path)
	invariant(albumArtworkPaletteV2074Sha256(raw) === expectedSha256, `Source binding mismatch for ${path}`)
	return JSON.parse(raw.toString("utf8")) as T
}

function validateTreatment(treatment: CompletePaletteTreatment, expectedKey: string, label: string): void {
	invariant(completeTreatmentKey(treatment) === expectedKey && treatmentKeyPattern.test(expectedKey),
		`${label} has an invalid canonical treatment key`)
	const colors = [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex]
	invariant(new Set(colors).size === treatment.cardinality && treatment.cardinality >= 2 && treatment.cardinality <= 4,
		`${label} has invalid cardinality`)
	invariant(treatment.background.hex !== treatment.foreground.hex &&
		treatment.collapse.surface === (treatment.background.hex === treatment.surface.hex) &&
		treatment.collapse.accent === (treatment.foreground.hex === treatment.accent.hex) &&
		!(treatment.gradient && treatment.collapse.surface), `${label} violates unchanged treatment legality`)
	invariant(Object.values(treatment.scores).every(Number.isFinite), `${label} has a non-finite score`)
}

function validateSelection(
	selection: AlbumArtworkPaletteV2074SelectionCertificate,
	expectedVersion: string,
	expectedChangedStages: readonly string[],
	label: string,
): void {
	invariant(selection.version === expectedVersion && selection.protocol ===
		(expectedVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION
			? ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID
			: "album-artwork-ui-palette-protocol-v2"), `${label} version or protocol is invalid`)
	const domain = selection.domain
	invariant(albumArtworkPaletteV2074CanonicalJson(domain.changedStages) ===
		albumArtworkPaletteV2074CanonicalJson(expectedChangedStages), `${label} changed undeclared stages`)
	invariant(domain.capacity === 1_500 && domain.rawCandidateCount <= 1_500 &&
		domain.materializedCandidateCount === domain.treatments.length &&
		domain.materializedCandidateCount <= domain.rawCandidateCount &&
		domain.remainingCapacity === domain.capacity - domain.rawCandidateCount &&
		domain.capacityReached === (domain.rawCandidateCount >= domain.capacity), `${label} violates domain bounds`)
	invariant(Number.isSafeInteger(domain.fieldHypothesisCount) && domain.fieldHypothesisCount > 0 &&
		Number.isSafeInteger(domain.fieldVariantCount) && domain.fieldVariantCount > 0 &&
		Number.isSafeInteger(domain.availableIdentityRoleCount) && domain.availableIdentityRoleCount >= 0 &&
		[domain.fieldHypothesisOrderedRoot, domain.fieldVariantOrderedRoot,
			domain.availableIdentityRoleOrderedRoot].every((hash) => /^[a-f0-9]{64}$/u.test(hash)),
		`${label} field or identity root/count certificate is invalid`)
	const keys = domain.treatments.map(({ key }) => key)
	invariant(new Set(keys).size === keys.length && keys.every((key) => treatmentKeyPattern.test(key)) &&
		domain.treatments.every(({ treatmentSha256 }) => /^[a-f0-9]{64}$/u.test(treatmentSha256)),
		`${label} treatment rows are invalid`)
	const rowByKey = new Map(domain.treatments.map((row) => [row.key, row]))
	const validateSelected = (
		entry: Readonly<{ key: string; treatment: CompletePaletteTreatment }>,
		name: string,
		requireDomainRow = true,
	): void => {
		validateTreatment(entry.treatment, entry.key, `${label} ${name}`)
		const row = rowByKey.get(entry.key)
		invariant((!requireDomainRow && row === undefined) || (row !== undefined && row.treatmentSha256 ===
			albumArtworkPaletteV2074ScientificSha256(entry.treatment)), `${label} ${name} treatment hash is invalid`)
	}
	validateSelected(selection.qualityIncumbent, "quality incumbent")
	validateSelected(selection.winner, "winner", false)
	for (const [index, entry] of selection.slate.entries()) validateSelected(entry, `slate ${index}`, false)
	invariant(selection.slate.length <= 8 && selection.slate.some(({ key }) => key === selection.winner.key) &&
		selection.counts.retained === selection.slate.length, `${label} slate is invalid`)
	invariant(selection.globalFrontierKeys.length === selection.counts.globalFrontier &&
		new Set(selection.globalFrontierKeys).size === selection.globalFrontierKeys.length &&
		selection.globalFrontierKeys.every((key) => rowByKey.has(key)) &&
		selection.globalFrontierKeys.includes(selection.qualityIncumbent.key), `${label} frontier is invalid`)
	invariant(selection.selectorMetadata.version === "pareto-identity-winner-diagnostics-v3" &&
		selection.selectorMetadata.qualityGuardVersion === "complete-quality-domain-non-inferiority-v1" &&
		selection.selectorMetadata.evidenceResolution === 0.04 &&
		selection.selectorMetadata.dominanceUsesEvidenceLevels === true &&
		selection.selectorMetadata.identityCoverageRequiresQualityNonInferiority === true &&
		albumArtworkPaletteV2074CanonicalJson(selection.selectorMetadata.paretoBlocks) ===
			albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_PARETO_BLOCKS) &&
		albumArtworkPaletteV2074CanonicalJson(selection.selectorMetadata.rankingPriorityBlocks) ===
			albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_RANKING_PRIORITY_BLOCKS) &&
		albumArtworkPaletteV2074CanonicalJson(selection.selectorMetadata.qualityGuardBlocks) ===
			albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_GUARD_BLOCKS),
		`${label} shared selector metadata is invalid`)
	invariant(selection.identity.obligationGraph.version === "identity-obligation-graph-v3" &&
		selection.identity.obligationGraph.obligations.length <= 4 &&
		selection.identity.challengerGuardCount === selection.counts.identityChallengers &&
		/^[a-f0-9]{64}$/u.test(selection.identity.challengerGuardOrderedRoot),
		`${label} identity graph or guard root is invalid`)
	if (selection.identity.selectedKey !== null) {
		const selected = selection.slate.find(({ key }) => key === selection.identity.selectedKey)
		invariant(selected !== undefined && selection.identity.selectedGuard !== null,
			`${label} selected identity treatment is not retained`)
		const expected = evaluateIdentityQualityGuard(selection.qualityIncumbent.treatment, selected.treatment)
		invariant(expected.pass && albumArtworkPaletteV2074CanonicalJson(expected) ===
			albumArtworkPaletteV2074CanonicalJson(selection.identity.selectedGuard),
			`${label} selected identity guard is invalid`)
		invariant(selection.identity.obligationGraph.winnerExplanation.selectedIdentityChallengerTreatmentId ===
			selected.treatment.id, `${label} identity graph selected treatment is stale`)
	}
	invariant(selection.identity.obligationGraph.winnerExplanation.qualityIncumbentTreatmentId ===
		selection.qualityIncumbent.treatment.id &&
		selection.identity.obligationGraph.winnerExplanation.treatmentId === selection.winner.treatment.id,
		`${label} identity winner explanation is stale`)
	const overlay = selection.overlay
	invariant(overlay.diagnostics.projectedAttemptCount <= 6 && overlay.diagnostics.projectedUniqueCount <= 6 &&
		overlay.diagnostics.projectedLegalCount <= overlay.diagnostics.projectedAttemptCount,
		`${label} overlay projection bound is invalid`)
	if (overlay.selectedKey !== null) {
		const selected = selection.slate.find(({ key }) => key === overlay.selectedKey)
		invariant(selected !== undefined, `${label} selected overlay is not retained`)
		invariant(overlay.diagnostics.selectedChallengerId === selected.treatment.id,
			`${label} overlay selected treatment is stale`)
		if (!rowByKey.has(overlay.selectedKey)) {
			invariant(overlay.diagnostics.selectedSource === "supplemental-projection",
				`${label} non-domain overlay is not a supplemental projection`)
		}
		if (overlay.diagnostics.qualityGuardRequired) {
			invariant(evaluateIdentityQualityGuard(selection.qualityIncumbent.treatment, selected.treatment).pass &&
				overlay.diagnostics.selectedChallengerPassesQualityGuard === true,
				`${label} selected identity-descended overlay failed the quality guard`)
		}
	}
}

function difference(first: readonly string[], second: ReadonlySet<string>): string[] {
	return first.filter((key) => !second.has(key))
}

function expectedControlDelta(
	control: AlbumArtworkPaletteV2074SelectionCertificate,
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	additionKeys: readonly string[],
): AlbumArtworkPaletteV2074Delta {
	const controlKeys = new Set(control.domain.treatments.map(({ key }) => key))
	const controlFrontier = new Set(control.globalFrontierKeys)
	const candidateFrontier = new Set(candidate.globalFrontierKeys)
	const controlSlate = control.slate.map(({ key }) => key)
	const candidateSlate = candidate.slate.map(({ key }) => key)
	const exactMatch = control.winner.key === candidate.winner.key
	const guard = exactMatch ? null : evaluateIdentityQualityGuard(
		control.qualityIncumbent.treatment,
		candidate.winner.treatment,
	)
	return {
		domainAdditionKeys: additionKeys,
		frontierAddedKeys: difference(candidate.globalFrontierKeys, controlFrontier),
		frontierRemovedKeys: difference(control.globalFrontierKeys, candidateFrontier),
		qualityIncumbentMatch: control.qualityIncumbent.key === candidate.qualityIncumbent.key,
		winner: { baselineKey: control.winner.key, candidateKey: candidate.winner.key, exactMatch },
		slateAddedKeys: difference(candidateSlate, new Set(controlSlate)),
		slateRemovedKeys: difference(controlSlate, new Set(candidateSlate)),
		novelFinalWinnerKey: controlKeys.has(candidate.winner.key) ? null : candidate.winner.key,
		novelRetainedSlateKeys: candidateSlate.filter((key) => !controlKeys.has(key)),
		changedWinnerGuardAgainstControlQualityIncumbent: guard,
		resolvedCrossVersionLosses: guard?.resolvedLosses ?? [],
	}
}

function expectedProductDelta(
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	baseline: AlbumArtworkPaletteV2Result,
): AlbumArtworkPaletteV2074ProductDelta {
	const baselineWinner = completeTreatmentKey(baseline.winner)
	const baselineSlate = baseline.alternatives.map(completeTreatmentKey)
	const candidateSlate = candidate.slate.map(({ key }) => key)
	return {
		winner: {
			baselineKey: baselineWinner,
			candidateKey: candidate.winner.key,
			exactMatch: baselineWinner === candidate.winner.key,
		},
		slateAddedKeys: difference(candidateSlate, new Set(baselineSlate)),
		slateRemovedKeys: difference(baselineSlate, new Set(candidateSlate)),
	}
}

function expectedTerminalStage(
	addition: AlbumArtworkPaletteV2074AdditionRow,
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	guardPassingKeys: ReadonlySet<string>,
): AlbumArtworkPaletteV2074AdditionTerminalStage {
	if (candidate.winner.key === addition.key) return "top-one"
	if (candidate.slate.some(({ key }) => key === addition.key)) return "public-slate-retention"
	if (candidate.overlay.selectedKey === addition.key) return "exact-overlay-selection"
	if (candidate.identity.selectedKey === addition.key) return "identity-selection"
	if (guardPassingKeys.has(addition.key)) return "complete-domain-guard"
	if (candidate.globalFrontierKeys.includes(addition.key)) return "ordinary-pareto-membership"
	return "complete-treatment-construction"
}

function validateAddition(
	addition: AlbumArtworkPaletteV2074AdditionRow,
	controlKeys: ReadonlySet<string>,
	registry: AlbumArtworkPaletteV2074SourceArtifact["scientific"]["registry"],
	candidate: AlbumArtworkPaletteV2074SelectionCertificate,
	guardPassingKeys: ReadonlySet<string>,
	index: number,
): void {
	const label = `addition ${index} ${addition.key}`
	invariant(treatmentKeyPattern.test(addition.key) && !controlKeys.has(addition.key) &&
		/^[a-f0-9]{64}$/u.test(addition.treatmentSha256) && /^[a-f0-9]{64}$/u.test(addition.scoreSha256),
		`${label} has invalid hashes or control overlap`)
	const lineage = addition.lineage
	const families = new Set(registry.families.filter(({ sourceConnected }) => sourceConnected).map(({ familyId }) => familyId))
	const hypotheses = new Set(registry.fieldHypotheses
		.filter(({ sourceConnected }) => sourceConnected).map(({ hypothesisId }) => hypothesisId))
	const fieldDirection = registry.fieldDirections.find(({ key }) => key === lineage.fieldDirectionKey)
	const roleDirections = new Set(registry.roleDirections.filter(({ sourceConnected }) => sourceConnected).map(({ key }) => key))
	invariant(lineage.sourceConnected && lineage.representatives.every(({ sourceConnected }) => sourceConnected) &&
		lineage.familyIds.every((familyId) => families.has(familyId)) && hypotheses.has(lineage.fieldHypothesisId) &&
		fieldDirection?.sourceConnected === true && fieldDirection.hypothesisIds.includes(lineage.fieldHypothesisId) &&
		lineage.roleDirectionKeys.every((key) => roleDirections.has(key)), `${label} lacks registered source-connected lineage`)
	invariant(addition.terminalStage === expectedTerminalStage(addition, candidate, guardPassingKeys),
		`${label} terminal stage is invalid`)
}

function assertSelectedMatchesFrozen(
	selection: AlbumArtworkPaletteV2074SelectionCertificate,
	frozen: AlbumArtworkPaletteV2Result,
	label: string,
): void {
	invariant(selection.winner.key === completeTreatmentKey(frozen.winner) &&
		albumArtworkPaletteV2074CanonicalJson(selection.winner.treatment) ===
			albumArtworkPaletteV2074CanonicalJson(frozen.winner) &&
		albumArtworkPaletteV2074CanonicalJson(selection.slate) ===
			albumArtworkPaletteV2074CanonicalJson(frozen.alternatives.map((treatment) => ({
				key: completeTreatmentKey(treatment), treatment,
			}))), `${label} selected output differs from frozen extraction`)
}

function noInferenceMetadataLeak(source: AlbumArtworkPaletteV2074SourceArtifact): boolean {
	const selectionJson = JSON.stringify({
		control: source.scientific.control,
		candidate: source.scientific.candidate,
		additions: source.scientific.additions,
	})
	return ![source.scientific.source.caseId, source.scientific.source.path, source.scientific.source.artworkId]
		.some((value) => selectionJson.includes(value))
}

export async function analyzeAlbumArtworkPaletteV2074Development(
	directory: string,
): Promise<Readonly<Record<string, unknown>>> {
	const root = resolve(directory)
	const frozen = await verifyAlbumArtworkPaletteV2074FrozenInputs(projectRoot)
	const [executionInput, resultsInput, summaryInput, currentClosure] = await Promise.all([
		readJsonWithRaw<AlbumArtworkPaletteV2074ExecutionManifest>(resolve(root, "execution-manifest.json")),
		readJsonWithRaw<AlbumArtworkPaletteV2074Results>(resolve(root, "results.json")),
		readJsonWithRaw<Record<string, unknown>>(resolve(root, "summary.json")),
		buildAlbumArtworkPaletteV2074ImplementationClosure(projectRoot),
	])
	const execution = executionInput.value
	const results = resultsInput.value
	const summary = summaryInput.value
	validateExactKeys(execution, [
		"schemaVersion", "candidateVersion", "protocolId", "closureId", "mode", "fixedPanelSourceCount",
		"executedSourceCount", "sourceCaseIds", "implementationClosure", "implementationSha256", "frozenBindings",
		"historical073Verification", "calibration", "candidateSchedules", "canonicalAggregateOrder",
		"executionManifestId",
	], "execution manifest")
	validateExactKeys(execution.calibration, [
		"formula", "maximumControlCalibrationWallMs", "candidateWallCeilingMsPerSourcePerPass", "schedules",
	], "execution calibration")
	invariant(execution.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
		execution.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION &&
		execution.protocolId === ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID &&
		execution.closureId === ALBUM_ARTWORK_PALETTE_V2_0_7_4_CLOSURE_ID &&
		execution.fixedPanelSourceCount === 28 &&
		execution.executionManifestId === albumArtworkPaletteV2074ContentId(execution, "executionManifestId"),
		"Execution-manifest schema or ID is invalid")
	invariant(execution.implementationSha256 === currentClosure.implementationSha256 &&
		albumArtworkPaletteV2074CanonicalJson(execution.implementationClosure) ===
			albumArtworkPaletteV2074CanonicalJson(currentClosure),
		"Execution implementation does not match the current 0.7.4 closure")
	invariant(albumArtworkPaletteV2074CanonicalJson(execution.frozenBindings) ===
		albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_FROZEN_BINDINGS) &&
		albumArtworkPaletteV2074CanonicalJson(execution.historical073Verification) ===
			albumArtworkPaletteV2074CanonicalJson(frozen.historical073Verification),
		"Execution frozen or immutable 0.7.3 binding is invalid")
	const expectedSourceCount = execution.mode === "full-28-source" ? 28 : 1
	invariant(execution.executedSourceCount === expectedSourceCount &&
		execution.sourceCaseIds.length === expectedSourceCount &&
		new Set(execution.sourceCaseIds).size === expectedSourceCount &&
		JSON.stringify(execution.sourceCaseIds) === JSON.stringify([...execution.sourceCaseIds].sort()) &&
		execution.sourceCaseIds.every((caseId) => frozen.panel.sources.some((source) => source.caseId === caseId)),
		"Execution source roster is invalid")
	invariant(albumArtworkPaletteV2074CanonicalJson(execution.candidateSchedules) ===
		albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_RUNTIME.candidatePasses) &&
		execution.canonicalAggregateOrder === "case-id-ascending", "Candidate schedules are invalid")
	const calibration = execution.calibration
	invariant(calibration.schedules.length === 2 && calibration.schedules[0].id === "schedule-a" &&
		calibration.schedules[0].workerCount === 1 && calibration.schedules[0].dispatchOrder === "case-id-ascending" &&
		calibration.schedules[1].id === "schedule-b" && calibration.schedules[1].workerCount === 6 &&
		calibration.schedules[1].dispatchOrder === "case-id-descending", "Calibration schedules are invalid")
	const calibrationWalls = calibration.schedules.flatMap(({ sources }) => sources.map(({ wallMs }) => wallMs))
	const maximumCalibrationWallMs = Math.max(...calibrationWalls)
	const expectedCeiling = Math.max(60_000, Math.ceil(6 * maximumCalibrationWallMs / 1_000) * 1_000)
	invariant(calibration.formula === "max(60000,ceil(6*maximumControlCalibrationWallMs/1000)*1000)" &&
		calibration.maximumControlCalibrationWallMs === maximumCalibrationWallMs &&
		calibration.candidateWallCeilingMsPerSourcePerPass === expectedCeiling &&
		calibrationWalls.every((wallMs) => Number.isFinite(wallMs) && wallMs >= 0),
		"Calibration ceiling is invalid")
	for (const schedule of calibration.schedules) {
		validateExactKeys(schedule, ["id", "workerCount", "dispatchOrder", "sources"],
			`calibration schedule ${schedule.id}`)
		invariant(schedule.sources.length === expectedSourceCount &&
			JSON.stringify(schedule.sources.map(({ caseId }) => caseId)) === JSON.stringify(execution.sourceCaseIds),
			`Calibration roster is invalid for ${schedule.id}`)
	}
	validateAlbumArtworkPaletteV2074NoResourceFields(execution, "execution manifest")
	validateAlbumArtworkPaletteV2074NoResourceFields(results, "results")
	validateAlbumArtworkPaletteV2074NoResourceFields(summary, "summary")

	const sourceArtifacts: AlbumArtworkPaletteV2074SourceArtifact[] = []
	const sourceManifestRows: AlbumArtworkPaletteV2074FileRow[] = []
	for (const caseId of execution.sourceCaseIds) {
		const panelSource = frozen.panel.sources.find((source) => source.caseId === caseId)!
		invariant(panelSource.path.length > 0 && !panelSource.path.startsWith("/") &&
			!panelSource.path.split(/[\\/]/u).includes(".."), `Unsafe panel source path for ${caseId}`)
		const sourceRealPath = await realpath(resolve(projectRoot, panelSource.path))
		const projectRealPath = await realpath(projectRoot)
		invariant(albumArtworkPaletteV2074PathInside(projectRealPath, sourceRealPath),
			`Panel source escaped project root for ${caseId}`)
		const sourceBytes = await readFile(sourceRealPath)
		invariant(sourceBytes.byteLength === panelSource.byteCount &&
			albumArtworkPaletteV2074Sha256(sourceBytes) === panelSource.sha256,
			`Panel source byte custody is invalid for ${caseId}`)
		const regeneratedDetails = extractAlbumArtworkPaletteV2074Details(await loadNativeImage(sourceBytes))
		const sourcePath = resolve(root, "sources", `${caseId}.json`)
		invariant(albumArtworkPaletteV2074PathInside(root, sourcePath), `Unsafe source path for ${caseId}`)
		const sourceInput = await readJsonWithRaw<AlbumArtworkPaletteV2074SourceArtifact>(sourcePath)
		const source = sourceInput.value
		validateExactKeys(source, [
			"schemaVersion", "candidateVersion", "protocolId", "implementationSha256", "executionManifestId",
			"scientific", "scientificSha256", "schedules",
		], `source artifact ${caseId}`)
		const metadata = await stat(sourcePath)
		sourceManifestRows.push({
			path: `sources/${caseId}.json`,
			byteCount: metadata.size,
			rawSha256: albumArtworkPaletteV2074Sha256(sourceInput.raw),
		})
		invariant(source.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
			source.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION &&
			source.protocolId === ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL_ID &&
			source.implementationSha256 === execution.implementationSha256 &&
			source.executionManifestId === execution.executionManifestId &&
			albumArtworkPaletteV2074CanonicalJson(source.scientific.source) ===
				albumArtworkPaletteV2074CanonicalJson(panelSource) &&
			source.scientificSha256 === albumArtworkPaletteV2074ScientificSha256(source.scientific),
			`Source artifact identity is invalid for ${caseId}`)
		validateAlbumArtworkPaletteV2074NoResourceFields(source, `source ${caseId}`)
		invariant(noInferenceMetadataLeak(source), `Source metadata leaked into inference payload for ${caseId}`)

		const calibrationA = calibration.schedules[0].sources.find((entry) => entry.caseId === caseId)!
		const calibrationB = calibration.schedules[1].sources.find((entry) => entry.caseId === caseId)!
		const stableCalibration = (entry: typeof calibrationA): unknown => ({
			caseId: entry.caseId,
			sourceSha256: entry.sourceSha256,
			frozenSourceArtifactRawSha256: entry.frozenSourceArtifactRawSha256,
			productSourceArtifactRawSha256: entry.productSourceArtifactRawSha256,
			historical073SourceArtifactRawSha256: entry.historical073SourceArtifactRawSha256,
			controlJsonByteSha256: entry.controlJsonByteSha256,
			controlScientificSha256: entry.controlScientificSha256,
		})
		invariant(albumArtworkPaletteV2074CanonicalJson(stableCalibration(calibrationA)) ===
			albumArtworkPaletteV2074CanonicalJson(stableCalibration(calibrationB)),
			`Calibration differs across schedules for ${caseId}`)
		const frozenControlPath = resolve(projectRoot,
			`research/data/experiments/album-artwork-palette-v2-0.7.2-development/sources/${caseId}.json`)
		const productPath = resolve(projectRoot,
			`research/data/experiments/album-artwork-palette-v2-0.6.0-development/sources/${caseId}.json`)
		const historicalPath = resolve(projectRoot,
			`research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/${caseId}.json`)
		const [frozenControl, product, historical] = await Promise.all([
			readBoundSource<FrozenSourceArtifact>(frozenControlPath, calibrationA.frozenSourceArtifactRawSha256),
			readBoundSource<FrozenSourceArtifact>(productPath, calibrationA.productSourceArtifactRawSha256),
			readBoundSource<Historical073Source>(historicalPath, calibrationA.historical073SourceArtifactRawSha256),
		])
		invariant(calibrationA.sourceSha256 === panelSource.sha256 &&
			calibrationA.frozenSourceArtifactRawSha256 === frozen.frozenSourceArtifactHashes.get(caseId) &&
			calibrationA.productSourceArtifactRawSha256 === frozen.productSourceArtifactHashes.get(caseId) &&
			calibrationA.historical073SourceArtifactRawSha256 === frozen.historical073SourceArtifactHashes.get(caseId) &&
			calibrationA.controlJsonByteSha256 === albumArtworkPaletteV2074ByteJsonSha256(frozenControl.extraction) &&
			calibrationA.controlScientificSha256 === albumArtworkPaletteV2074ScientificSha256(frozenControl.extraction),
			`Calibration custody or exact control equality is invalid for ${caseId}`)
		invariant(source.scientific.frozenSourceArtifactRawSha256 === calibrationA.frozenSourceArtifactRawSha256 &&
			source.scientific.productSourceArtifactRawSha256 === calibrationA.productSourceArtifactRawSha256 &&
			source.scientific.historical073SourceArtifactRawSha256 === calibrationA.historical073SourceArtifactRawSha256 &&
			source.scientific.controlScientificSha256 === calibrationA.controlScientificSha256,
			`Source historical bindings differ from calibration for ${caseId}`)
		const regeneratedScientific = buildAlbumArtworkPaletteV2074ScientificPayload({
			details: regeneratedDetails,
			source: panelSource,
			dimensions: { width: regeneratedDetails.result.width, height: regeneratedDetails.result.height },
			frozenSourceArtifactRawSha256: calibrationA.frozenSourceArtifactRawSha256,
			productSourceArtifactRawSha256: calibrationA.productSourceArtifactRawSha256,
			historical073SourceArtifactRawSha256: calibrationA.historical073SourceArtifactRawSha256,
			frozenControl,
			productBaseline: product,
			historical073: historical,
		})
		invariant(albumArtworkPaletteV2074CanonicalJson(source.scientific) ===
			albumArtworkPaletteV2074CanonicalJson(regeneratedScientific),
			`Source scientific payload does not match independent bound extraction for ${caseId}`)

		invariant(source.schedules.length === 2, `Schedule evidence count is invalid for ${caseId}`)
		for (const [index, schedule] of source.schedules.entries()) {
			const expected = execution.candidateSchedules[index]
			invariant(schedule.id === expected.id && schedule.workerCount === expected.workerCount &&
				schedule.dispatchOrder === expected.dispatchOrder &&
				schedule.payloadSha256 === source.scientificSha256 &&
				Number.isFinite(schedule.wallMs) && schedule.wallMs >= 0 && schedule.wallMs <= expectedCeiling,
				`Candidate schedule evidence is invalid for ${caseId} ${schedule.id}`)
		}
		const scientific = source.scientific
		validateSelection(scientific.control, ALBUM_ARTWORK_PALETTE_V2_0_7_4_CONTROL.version, [], `${caseId} control`)
		validateSelection(scientific.candidate, ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
			ALBUM_ARTWORK_PALETTE_V2_0_7_4_CHANGED_STAGES, `${caseId} candidate`)
		invariant(albumArtworkPaletteV2074CanonicalJson(scientific.control.selectorMetadata) ===
			albumArtworkPaletteV2074CanonicalJson(scientific.candidate.selectorMetadata),
			`Control and candidate selector implementations differ for ${caseId}`)
		assertSelectedMatchesFrozen(scientific.control, frozenControl.extraction, `${caseId} control`)
		invariant(scientific.dimensions.width === frozenControl.dimensions.width &&
			scientific.dimensions.height === frozenControl.dimensions.height &&
			scientific.controlScientificSha256 === albumArtworkPaletteV2074ScientificSha256(frozenControl.extraction),
			`Source dimensions or control scientific hash is invalid for ${caseId}`)

		const controlRows = scientific.control.domain.treatments
		const candidateRows = scientific.candidate.domain.treatments
		const additionRows = scientific.additions.map(({ key, treatmentSha256 }) => ({ key, treatmentSha256 }))
		invariant(scientific.candidate.domain.rawCandidateCount ===
			scientific.control.domain.rawCandidateCount + scientific.additions.length &&
			scientific.candidate.domain.materializedCandidateCount ===
				scientific.control.domain.materializedCandidateCount + scientific.additions.length &&
			albumArtworkPaletteV2074CanonicalJson(candidateRows) ===
				albumArtworkPaletteV2074CanonicalJson([...controlRows, ...additionRows]),
			`Candidate is not an exact additive control prefix for ${caseId}`)
		const controlKeys = new Set(controlRows.map(({ key }) => key))
		invariant(new Set(scientific.additions.map(({ key }) => key)).size === scientific.additions.length,
			`Duplicate additions exist for ${caseId}`)
		const compactRegistry = {
			families: scientific.registry.families,
			fieldHypotheses: scientific.registry.fieldHypotheses,
			fieldDirections: scientific.registry.fieldDirections,
			roleDirections: scientific.registry.roleDirections,
			identityObligationFamilyIds: scientific.registry.identityObligationFamilyIds,
		}
		invariant(scientific.registry.orderedRoot === albumArtworkPaletteV2074OrderedValueRoot(
			"album-artwork-palette-v2-0.7.4-compact-registry-v1",
			[compactRegistry.families, compactRegistry.fieldHypotheses, compactRegistry.fieldDirections,
				compactRegistry.roleDirections, compactRegistry.identityObligationFamilyIds],
		), `Compact registry root is invalid for ${caseId}`)
		const additionKeys = new Set(scientific.additions.map(({ key }) => key))
		const guardPassingKeys = new Set(scientific.guardPassingAdditionKeys)
		invariant(guardPassingKeys.size === scientific.guardPassingAdditionKeys.length &&
			scientific.guardPassingAdditionKeys.every((key) => additionKeys.has(key)),
			`Guard-passing addition keys are invalid for ${caseId}`)
		for (const [index, addition] of scientific.additions.entries()) {
			validateAddition(addition, controlKeys, scientific.registry, scientific.candidate, guardPassingKeys, index)
		}

		const historicalArm = historical.recallArms.find(({ scientific: arm }) =>
			arm.arm === ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.selection.mechanism)
		invariant(historicalArm !== undefined, `Immutable selected 0.7.3 arm is absent for ${caseId}`)
		const historicalRows = historicalArm.scientific.additions.map(({ key, treatment }) => ({
			key,
			treatmentSha256: albumArtworkPaletteV2074ScientificSha256(treatment),
		}))
		const equality = scientific.historical073SelectedArmEquality
		invariant(equality.mechanism === "widened-field-hypothesis-retention" &&
			equality.exactKeyAndTreatmentHashEquality === true && equality.additionCount === additionRows.length &&
			equality.additionOrderedRoot === albumArtworkPaletteV2074OrderedValueRoot(
				"album-artwork-palette-v2-0.7.4-selected-additions-v1", additionRows) &&
			albumArtworkPaletteV2074CanonicalJson(additionRows) === albumArtworkPaletteV2074CanonicalJson(historicalRows),
			`Generated additions differ from immutable selected 0.7.3 evidence for ${caseId}`)

		const controlObligationFamilies = new Set(scientific.control.identity.obligationGraph.obligations
			.map(({ familyId }) => familyId))
		const candidateObligationFamilies = new Set(scientific.candidate.identity.obligationGraph.obligations
			.map(({ familyId }) => familyId))
		invariant([...controlObligationFamilies].every((familyId) => candidateObligationFamilies.has(familyId)) &&
			scientific.control.slate.every(({ key }) => scientific.candidate.domain.treatments.some((row) => row.key === key)) &&
			scientific.candidate.domain.treatments.some(({ key }) => key === scientific.control.qualityIncumbent.key),
			`Control incumbent, obligation, or slate reservation became unavailable for ${caseId}`)

		const expected072 = expectedControlDelta(scientific.control, scientific.candidate,
			scientific.additions.map(({ key }) => key))
		const expected060 = expectedProductDelta(scientific.candidate, product.extraction)
		invariant(albumArtworkPaletteV2074CanonicalJson(scientific.deltaFrom072) ===
			albumArtworkPaletteV2074CanonicalJson(expected072) &&
			albumArtworkPaletteV2074CanonicalJson(scientific.deltaFrom060) ===
				albumArtworkPaletteV2074CanonicalJson(expected060), `Exact deltas are invalid for ${caseId}`)
		invariant(scientific.gateFailures.length === 0, `Source mechanical failures are present for ${caseId}`)
		sourceArtifacts.push(source)
	}

	const expectedResults = buildAlbumArtworkPaletteV2074Results(execution, sourceArtifacts)
	invariant(albumArtworkPaletteV2074CanonicalJson(results) ===
		albumArtworkPaletteV2074CanonicalJson(expectedResults),
		"Results do not reconcile with independently verified source shards")
	invariant(results.scheduleScientificSha256.scheduleA === results.scientificSha256 &&
		results.scheduleScientificSha256.scheduleB === results.scientificSha256,
		"Aggregate scientific output differs across candidate schedules")
	const expectedSummary = buildAlbumArtworkPaletteV2074Summary(expectedResults)
	invariant(albumArtworkPaletteV2074CanonicalJson(summary) === albumArtworkPaletteV2074CanonicalJson(expectedSummary),
		"Summary does not reconcile with independently rebuilt results")
	invariant(Object.values(results.authorization).every((value) => value === false) &&
		albumArtworkPaletteV2074CanonicalJson(results.authorization) ===
			albumArtworkPaletteV2074CanonicalJson(ALBUM_ARTWORK_PALETTE_V2_0_7_4_AUTHORIZATION.forbidden),
		"Results contain forbidden authorization")
	invariant(results.mechanicalGate.pass && results.mechanicalGate.failures.length === 0,
		"Published results failed mechanical closure")
	if (execution.mode === "one-source-smoke") {
		invariant(results.dispositionAuthority === false && results.disposition === null,
			"Smoke execution has disposition authority")
	} else {
		invariant(results.dispositionAuthority === true && results.disposition !== null,
			"Full execution lacks a protocol disposition")
	}

	sourceManifestRows.sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0)
	const analysisWithoutId = {
		schemaVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
		implementationSha256: execution.implementationSha256,
		executionManifestId: execution.executionManifestId,
		scientificSha256: results.scientificSha256,
		inputHashes: {
			executionManifestRawSha256: albumArtworkPaletteV2074Sha256(executionInput.raw),
			resultsRawSha256: albumArtworkPaletteV2074Sha256(resultsInput.raw),
			summaryRawSha256: albumArtworkPaletteV2074Sha256(summaryInput.raw),
			sourceOrderedRoot: albumArtworkPaletteV2074OrderedFileRoot(
				"album-artwork-palette-v2-0.7.4-artifact-root-v1", sourceManifestRows),
			immutable073ArtifactRoot: frozen.historical073Verification.orderedRoot,
		},
		verification: {
			currentImplementationClosure: true,
			frozenRawAndSemanticBindings: true,
			immutable073ManifestWithoutForwardLiveReproduction: true,
			exactControlJsonByteEquality: true,
			selected073AdditionEqualityAfterGeneration: true,
			orderedPrefixAndTreatmentHashes: true,
			fieldAndVariantRootCounts: true,
			onlyFieldHypothesisRetentionChanged: true,
			sourceConnectedLineage: true,
			completeCandidateSlateAndProjectionBounds: true,
			sharedUnchangedSelectorMetadata: true,
			identityGuardAndOverlayObligations: true,
			schedulingInvariance: true,
			predeclaredRuntimeCeiling: true,
			metadataIsolationAndAuthorization: true,
			exactControlAndProductDeltas: true,
			resultsAndSummaryReconstruction: true,
			independentBoundCandidateRegeneration: true,
		},
		counts: results.counts,
		caseIds: results.caseIds,
		mechanicalPass: true,
		dispositionAuthority: results.dispositionAuthority,
		disposition: results.disposition,
		authorization: results.authorization,
	}
	return {
		...analysisWithoutId,
		analysisId: albumArtworkPaletteV2074ScientificSha256(analysisWithoutId),
	}
}

export async function verifyAlbumArtworkPaletteV2074Development(
	directory: string,
): Promise<Readonly<Record<string, unknown>>> {
	const root = resolve(directory)
	const manifestInput = await readJsonWithRaw<ArtifactManifest>(resolve(root, "manifest.json"))
	const manifest = manifestInput.value
	validateExactKeys(manifest, [
		"schemaVersion", "candidateVersion", "executionManifestId", "files", "orderedRoot", "manifestId",
	], "final manifest")
	invariant(manifest.schemaVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_ARTIFACT_SCHEMA_VERSION &&
		manifest.candidateVersion === ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION &&
		manifest.manifestId === albumArtworkPaletteV2074ContentId(manifest, "manifestId"),
		"Final manifest schema or ID is invalid")
	const paths = manifest.files.map(({ path }) => path)
	invariant(new Set(paths).size === paths.length && JSON.stringify(paths) === JSON.stringify([...paths].sort()) &&
		paths.every((path) => !path.startsWith("/") && !path.split("/").includes("..") &&
			!path.startsWith(".work/") && path !== ".work"), "Final manifest paths are unsafe or unordered")
	const execution = JSON.parse(await readFile(resolve(root, "execution-manifest.json"), "utf8")) as
		AlbumArtworkPaletteV2074ExecutionManifest
	const expectedPaths = [
		"analysis.json",
		"execution-manifest.json",
		"results.json",
		"summary.json",
		...execution.sourceCaseIds.map((caseId) => `sources/${caseId}.json`),
	].sort()
	invariant(JSON.stringify(paths) === JSON.stringify(expectedPaths),
		"Final manifest roster is incomplete or contains an unexpected file")
	for (const file of manifest.files) {
		const absolute = resolve(root, file.path)
		invariant(albumArtworkPaletteV2074PathInside(root, absolute), `Final manifest path escaped: ${file.path}`)
		const metadata = await stat(absolute)
		invariant(metadata.isFile() && metadata.size === file.byteCount &&
			await albumArtworkPaletteV2074FileSha256(absolute) === file.rawSha256,
			`Final manifest hash or size failed for ${file.path}`)
	}
	invariant(manifest.orderedRoot === albumArtworkPaletteV2074OrderedFileRoot(
		"album-artwork-palette-v2-0.7.4-artifact-root-v1", manifest.files) &&
		manifest.executionManifestId === execution.executionManifestId, "Final manifest root or execution binding is invalid")
	const checkedAnalysis = JSON.parse(await readFile(resolve(root, "analysis.json"), "utf8")) as Record<string, unknown>
	const expectedAnalysis = await analyzeAlbumArtworkPaletteV2074Development(root)
	invariant(albumArtworkPaletteV2074CanonicalJson(checkedAnalysis) ===
		albumArtworkPaletteV2074CanonicalJson(expectedAnalysis), "Checked independent analysis is stale")
	invariant(checkedAnalysis.analysisId === albumArtworkPaletteV2074ContentId(checkedAnalysis, "analysisId"),
		"Analysis ID is invalid")
	return checkedAnalysis
}

async function main(): Promise<void> {
	let directory = defaultExperimentDirectory
	let verify = false
	const argumentsList = process.argv.slice(2)
	for (let index = 0; index < argumentsList.length; index++) {
		const argument = argumentsList[index]
		if (argument === "--verify") verify = true
		else if (argument === "--experiment") {
			const value = argumentsList[++index]
			invariant(value !== undefined, "--experiment requires a path")
			directory = resolve(value)
		} else if (argument.startsWith("--experiment=")) directory = resolve(argument.slice("--experiment=".length))
		else throw new Error(`Unknown argument ${argument}`)
	}
	if (verify) {
		const analysis = await verifyAlbumArtworkPaletteV2074Development(directory)
		process.stdout.write(`Verified ${analysis.analysisId}\n`)
		return
	}
	const expected = await analyzeAlbumArtworkPaletteV2074Development(directory)
	const checked = JSON.parse(await readFile(resolve(directory, "analysis.json"), "utf8")) as Record<string, unknown>
	invariant(albumArtworkPaletteV2074CanonicalJson(checked) === albumArtworkPaletteV2074CanonicalJson(expected),
		"Checked analysis is stale; evaluator publication is immutable")
	process.stdout.write(`Analysis valid ${expected.analysisId}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
