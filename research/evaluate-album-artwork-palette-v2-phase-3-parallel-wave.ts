import { lstat, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	artworkHistoricalContext,
	minimalReviewNeed,
} from "./tools/review-evidence/reports.ts"
import { canonicalJson, isObject, normalizeTreatment, sha256 } from "./tools/review-evidence/normalize.ts"
import type { CandidateTreatment, JsonObject, NormalizedTreatment } from "./tools/review-evidence/types.ts"
import { openWarehouse } from "./tools/review-evidence/warehouse.ts"

const CONTRACT_ID = "album-artwork-palette-v2-phase-3-attempt-contract-v1"
const REPORT_ID = "album-artwork-palette-v2-phase-3-parallel-wave-causal-evaluation-v1"
const ROLE_NAMES = ["background", "surface", "foreground", "accent"] as const
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const defaultDevelopmentPanelPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const DEVELOPMENT_PANEL_MANIFEST_ID = "bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305"
const DEVELOPMENT_PANEL_SOURCE_COUNT = 28

type AttemptIdentity = Readonly<{
	attemptId: string
	configurationId: string
}>

type SourceIdentity = Readonly<{
	caseId: string
	sha256: string
	byteCount: number
	artworkId: string
	width: number
	height: number
}>

type Runtime = Readonly<{
	wallMs: number
	cpuUserMs: number
	cpuSystemMs: number
}>

type CompactTreatment = Readonly<{
	key: string
	normalized: NormalizedTreatment
	evidenceInput: JsonObject
	mechanism: Readonly<{
		fieldTreatment: string | null
		sourceFieldHypothesisId: string | null
		familyRoles: Readonly<Record<typeof ROLE_NAMES[number], string | null>>
	}>
	custody: Readonly<Record<typeof ROLE_NAMES[number], Readonly<{
		generated: boolean
		exactSource: boolean | null
		anchorFamilyId: string | null
		hasRegionLineage: boolean | null
	}>>>
}>

type CompactOutput = Readonly<{
	version: string
	protocol: string
	winner: CompactTreatment
	alternatives: readonly CompactTreatment[]
	stages: JsonObject
}>

type LoadedAttempt = Readonly<{
	identity: AttemptIdentity
	output: CompactOutput
	runtime: Runtime
}>

type LoadedCase = Readonly<{
	source: SourceIdentity
	attempts: ReadonlyMap<string, LoadedAttempt>
}>

type LoadedWave = Readonly<{
	iterationId: string
	identityKeys: readonly string[]
	identities: readonly AttemptIdentity[]
	cases: ReadonlyMap<string, LoadedCase>
	runtimeEnvironment: JsonObject | null
}>

type InternalReviewCandidate = {
	candidateId: string
	caseId: string
	source: SourceIdentity
	treatment: CompactTreatment
	occurrences: Array<Readonly<{
		identity: AttemptIdentity
		kind: "winner" | "slate"
		slateIndex: number
	}>>
	mechanisms: Set<string>
	reasons: Set<string>
	evidence?: JsonObject
	evidenceTreatment?: NormalizedTreatment
}

export type AlbumArtworkPaletteV2Phase3ParallelWaveOptions = Readonly<{
	iterationDirectories: readonly string[]
	controlAttempt: string
	attempts: readonly string[]
	warehousePath?: string
	presentationVersion?: string
}>

export type AlbumArtworkPaletteV2Phase3ParallelWaveArguments =
	AlbumArtworkPaletteV2Phase3ParallelWaveOptions & Readonly<{ outputPath: string }>

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function ascii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function exactIdentity(identity: AttemptIdentity): string {
	return `${identity.attemptId}\0${identity.configurationId}`
}

function displayIdentity(identity: AttemptIdentity): string {
	return `${identity.attemptId}@${identity.configurationId}`
}

function validIdentity(value: unknown, label: string): string {
	invariant(typeof value === "string" && /^[A-Za-z0-9._-]{1,200}$/u.test(value), `${label} is invalid`)
	return value
}

function stringField(value: JsonObject, key: string, label: string): string {
	invariant(typeof value[key] === "string" && (value[key] as string).length > 0, `${label}.${key} is invalid`)
	return value[key] as string
}

function nonnegativeNumber(value: unknown, label: string): number {
	invariant(typeof value === "number" && Number.isFinite(value) && value >= 0, `${label} is invalid`)
	return value
}

function positiveInteger(value: unknown, label: string): number {
	invariant(Number.isSafeInteger(value) && (value as number) > 0, `${label} is invalid`)
	return value as number
}

function identity(value: unknown, label: string): AttemptIdentity {
	invariant(isObject(value), `${label} is invalid`)
	return {
		attemptId: validIdentity(value.attemptId, `${label}.attemptId`),
		configurationId: validIdentity(value.configurationId, `${label}.configurationId`),
	}
}

async function regularJson(path: string, label: string): Promise<unknown> {
	const stats = await lstat(path)
	invariant(stats.isFile() && !stats.isSymbolicLink(), `${label} must be a regular non-symlink file: ${path}`)
	return JSON.parse(await readFile(path, "utf8")) as unknown
}

function safeCasePath(iterationDirectory: string, file: string): string {
	invariant(/^[A-Za-z0-9._-]+\.json$/u.test(file), `Unsafe normalized case file ${JSON.stringify(file)}`)
	const path = resolve(iterationDirectory, file)
	const fromDirectory = relative(iterationDirectory, path)
	invariant(fromDirectory !== ".." && !fromDirectory.startsWith(`..${sep}`), `Normalized case escaped its iteration directory`)
	return path
}

function runtime(value: unknown, label: string): Runtime {
	invariant(isObject(value), `${label} is invalid`)
	return {
		wallMs: nonnegativeNumber(value.wallMs, `${label}.wallMs`),
		cpuUserMs: nonnegativeNumber(value.cpuUserMs, `${label}.cpuUserMs`),
		cpuSystemMs: nonnegativeNumber(value.cpuSystemMs, `${label}.cpuSystemMs`),
	}
}

function sourceIdentity(value: unknown, expectedCaseId: string): SourceIdentity {
	invariant(isObject(value), `Case ${expectedCaseId} source identity is invalid`)
	const caseId = stringField(value, "caseId", `Case ${expectedCaseId} source`)
	invariant(caseId === expectedCaseId,
		`Case alignment mismatch: normalized file for ${expectedCaseId} contains case-sensitive ID ${caseId}`)
	const sourceSha256 = stringField(value, "sha256", `Case ${caseId} source`)
	invariant(/^[0-9a-f]{64}$/u.test(sourceSha256), `Case ${caseId} source SHA-256 is invalid`)
	return {
		caseId,
		sha256: sourceSha256,
		byteCount: positiveInteger(value.byteCount ?? value.bytes, `Case ${caseId} source byteCount`),
		artworkId: stringField(value, "artworkId", `Case ${caseId} source`),
		width: positiveInteger(value.width, `Case ${caseId} source width`),
		height: positiveInteger(value.height, `Case ${caseId} source height`),
	}
}

async function authorizedDevelopmentSources(): Promise<ReadonlyMap<string, Readonly<{
	caseId: string
	sha256: string
	byteCount: number
	artworkId: string
}>>> {
	const value = await regularJson(defaultDevelopmentPanelPath, "Phase 3 development panel")
	invariant(isObject(value) && value.schemaVersion === 1 && Array.isArray(value.sources) &&
		value.manifestId === DEVELOPMENT_PANEL_MANIFEST_ID && value.sourceCount === DEVELOPMENT_PANEL_SOURCE_COUNT &&
		value.sourceCount === value.sources.length, "Canonical Phase 3 development panel identity is invalid")
	const result = new Map<string, { caseId: string; sha256: string; byteCount: number; artworkId: string }>()
	for (const [index, entry] of value.sources.entries()) {
		invariant(isObject(entry), `Phase 3 development panel source ${index} is invalid`)
		const caseId = validIdentity(entry.caseId, `Phase 3 development panel source ${index} case ID`)
		invariant(/^development-[0-9]{2}$/u.test(caseId),
			`Phase 3 development panel source ${caseId} is not an authorized development case`)
		const sourceSha256 = stringField(entry, "sha256", `Phase 3 development panel source ${caseId}`)
		invariant(/^[0-9a-f]{64}$/u.test(sourceSha256),
			`Phase 3 development panel source ${caseId} SHA-256 is invalid`)
		invariant(!result.has(caseId), `Phase 3 development panel contains duplicate case ${caseId}`)
		result.set(caseId, {
			caseId,
			sha256: sourceSha256,
			byteCount: positiveInteger(entry.byteCount, `Phase 3 development panel source ${caseId} byteCount`),
			artworkId: stringField(entry, "artworkId", `Phase 3 development panel source ${caseId}`),
		})
	}
	return result
}

function compactTreatment(value: unknown, label: string): CompactTreatment {
	invariant(isObject(value) && isObject(value.treatment), `${label} is invalid`)
	const key = stringField(value, "key", label)
	const treatment = value.treatment
	const rawNormalized = normalizeTreatment(treatment)
	const roles = isObject(treatment.roles) ? treatment.roles : treatment
	const evidenceRoles: JsonObject = {}
	const familyRoles = isObject(treatment.familyRoles) ? treatment.familyRoles : {}
	const compactFamilyRoles = {} as Record<typeof ROLE_NAMES[number], string | null>
	const custody = {} as Record<typeof ROLE_NAMES[number], {
		generated: boolean
		exactSource: boolean | null
		anchorFamilyId: string | null
		hasRegionLineage: boolean | null
	}>
	for (const role of ROLE_NAMES) {
		const roleValue = roles[role]
		invariant(isObject(roleValue), `${label}.${role} is invalid`)
		const visible = rawNormalized.visible.roles[role]
		evidenceRoles[role] = {
			rgb: visible.rgb,
			hex: `#${visible.rgb.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`,
			generated: visible.generated,
		}
		const support = isObject(roleValue.support) ? roleValue.support : null
		custody[role] = {
			generated: visible.generated,
			exactSource: support && typeof support.exactSource === "boolean" ? support.exactSource : null,
			anchorFamilyId: support && typeof support.anchorFamilyId === "string" ? support.anchorFamilyId : null,
			hasRegionLineage: support && Array.isArray(support.regionIds) ? support.regionIds.length > 0 : null,
		}
		compactFamilyRoles[role] = typeof familyRoles[role] === "string" ? familyRoles[role] as string : null
	}
	const evidenceInput: JsonObject = {
		roles: evidenceRoles,
		// The shared review presentation renders all gradients with its fixed public topology.
		gradient: rawNormalized.visible.gradient.enabled,
		collapse: rawNormalized.visible.collapse,
	}
	const normalized = normalizeTreatment(evidenceInput)
	return {
		key,
		normalized,
		evidenceInput,
		mechanism: {
			fieldTreatment: typeof treatment.fieldTreatment === "string" ? treatment.fieldTreatment : null,
			sourceFieldHypothesisId: typeof treatment.sourceFieldHypothesisId === "string"
				? treatment.sourceFieldHypothesisId : null,
			familyRoles: compactFamilyRoles,
		},
		custody,
	}
}

function primitiveProjection(value: unknown): unknown {
	if (value === null || typeof value === "string" || typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))) return value
	if (Array.isArray(value) && value.every((entry) => entry === null ||
		["string", "boolean", "number"].includes(typeof entry))) return value
	return undefined
}

function compactObject(value: unknown, keys: readonly string[]): JsonObject | null {
	if (!isObject(value)) return null
	const result: JsonObject = {}
	for (const key of keys) {
		const projected = primitiveProjection(value[key])
		if (projected !== undefined) result[key] = projected
	}
	return Object.keys(result).length === 0 ? null : result
}

function phaseDiagnostics(diagnostics: JsonObject, attemptIdentity: AttemptIdentity, label: string): Readonly<{
	path: string | null
	root: JsonObject | null
	selector: JsonObject | null
}> {
	const roots = Object.entries(diagnostics)
		.filter(([key, value]) => key.startsWith("phase3") && isObject(value))
		.sort(([first], [second]) => ascii(first, second)) as Array<[string, JsonObject]>
	for (const [key, root] of roots) {
		if (typeof root.configurationId === "string") {
			invariant(root.configurationId === attemptIdentity.configurationId,
				`${label} diagnostics configuration ${root.configurationId} does not match attempt identity ${attemptIdentity.configurationId}`)
		}
	}
	const preferred = roots.find(([, root]) => root.configurationId === attemptIdentity.configurationId) ??
		roots.find(([key]) => key !== "phase3Selector") ?? null
	const root = preferred?.[1] ?? null
	const selector = root && isObject(root.selector) ? root.selector :
		root && isObject(root.baseSelector) ? root.baseSelector :
		isObject(diagnostics.phase3Selector) ? diagnostics.phase3Selector : null
	return { path: preferred?.[0] ?? (selector ? "phase3Selector" : null), root, selector }
}

function selectedDiagnostic(root: JsonObject | null, treatment: CompactTreatment, index: number): JsonObject | null {
	if (!root) return null
	const nestedRescue = isObject(root.transitionRescue) ? root.transitionRescue :
		isObject(root.rescue) ? root.rescue : null
	const custody = root.custody ?? nestedRescue?.custody
	if (Array.isArray(custody)) {
		const match = custody.find((entry) => isObject(entry) && (
			entry.fieldHypothesisId === treatment.mechanism.sourceFieldHypothesisId ||
			(index === 0 && entry.selectedTopTreatment === true)
		))
		return isObject(match) ? match : null
	}
	if (isObject(custody) && Array.isArray(custody.selected)) {
		const exact = custody.selected.find((entry) => isObject(entry) &&
			isObject(entry.recoveryV2) && entry.recoveryV2.key === treatment.key)
		if (isObject(exact)) return exact
	}
	const rescueCandidates = nestedRescue?.candidates
	if (Array.isArray(rescueCandidates)) {
		const exact = rescueCandidates.find((entry) => isObject(entry) && entry.key === treatment.key)
		if (isObject(exact)) return exact
	}
	if (isObject(custody) && Array.isArray(custody.selected)) {
		const indexed = custody.selected.find((entry) => isObject(entry) && entry.index === index)
		if (isObject(indexed)) return indexed
	}
	return null
}

function selectorEvaluation(selector: JsonObject | null, key: string): JsonObject | null {
	if (!selector || !Array.isArray(selector.evaluations)) return null
	const match = selector.evaluations.find((entry) => isObject(entry) && entry.key === key)
	return isObject(match) ? match : null
}

function treatmentStage(treatment: CompactTreatment, selected: JsonObject | null, evaluation: JsonObject | null): JsonObject {
	const roleIdentity = evaluation && isObject(evaluation.roleIdentity) ? evaluation.roleIdentity : null
	const coveredRoleObligationIds = selected && Array.isArray(selected.coveredRoleObligationIds)
		? selected.coveredRoleObligationIds : roleIdentity && Array.isArray(roleIdentity.coveredObligationIds)
			? roleIdentity.coveredObligationIds : []
	const identityCoverage = evaluation && typeof evaluation.identityCoverage === "number" ? evaluation.identityCoverage :
		roleIdentity && typeof roleIdentity.coverage === "number" ? roleIdentity.coverage : null
	return {
		key: treatment.key,
		treatmentIdentity: treatment.normalized.treatmentIdentity,
		renderVariantId: treatment.normalized.renderVariantId,
		fieldTreatment: treatment.mechanism.fieldTreatment,
		sourceFieldHypothesisId: treatment.mechanism.sourceFieldHypothesisId,
		familyRoles: treatment.mechanism.familyRoles,
		custody: treatment.custody,
		gradientEnabled: treatment.normalized.visible.gradient.enabled,
		gradientStatus: evaluation && typeof evaluation.gradientStatus === "string" ? evaluation.gradientStatus : null,
		roleCoverage: {
			value: identityCoverage,
			coveredRoleObligationIds,
		},
		lineage: {
			sourceConnected: selected && typeof selected.sourceConnectedDescriptorLineage === "boolean"
				? selected.sourceConnectedDescriptorLineage : selected && typeof selected.sourceConnected === "boolean"
					? selected.sourceConnected : null,
			sourceTypes: selected && Array.isArray(selected.sourceTypes) ? selected.sourceTypes : [],
			novelDimensions: selected && Array.isArray(selected.novelDimensions) ? selected.novelDimensions : [],
		},
		selection: compactObject(selected, ["selectionKind", "kind", "sourceType", "selectedTopTreatment",
			"roleDescriptorCount", "materializedTreatmentCount", "selectedTreatmentCount", "qualityLossFromWinner"]),
	}
}

function buildStages(
	value: JsonObject,
	attemptIdentity: AttemptIdentity,
	winner: CompactTreatment,
	alternatives: readonly CompactTreatment[],
	attemptRuntime: Runtime,
	label: string,
): JsonObject {
	const diagnostics = isObject(value.diagnostics) ? value.diagnostics : {}
	const phase = phaseDiagnostics(diagnostics, attemptIdentity, label)
	const rootDomain = phase.root && isObject(phase.root.domain) ? phase.root.domain : null
	const selectorDomain = phase.selector && isObject(phase.selector.domain) ? phase.selector.domain : null
	const winnerEvaluation = selectorEvaluation(phase.selector, winner.key)
	const selectorWinner = phase.selector && isObject(phase.selector.winner) ? phase.selector.winner : null
	const winnerSelected = selectedDiagnostic(phase.root, winner, 0)
	const winnerStage = treatmentStage(winner, winnerSelected, winnerEvaluation)
	const selection = phase.root && isObject(phase.root.selection) ? phase.root.selection : null
	if (isObject(winnerStage.lineage) && selection && typeof selection.winnerLineageBasis === "string") {
		winnerStage.lineage.basis = selection.winnerLineageBasis
	}
	if (winnerStage.gradientStatus === null && selectorWinner && typeof selectorWinner.gradientStatus === "string") {
		winnerStage.gradientStatus = selectorWinner.gradientStatus
	}
	if (winnerStage.roleCoverage && isObject(winnerStage.roleCoverage) && winnerStage.roleCoverage.value === null && selectorWinner) {
		const coverage = typeof selectorWinner.roleIdentityCoverage === "number" ? selectorWinner.roleIdentityCoverage :
			typeof selectorWinner.identityCoverage === "number" ? selectorWinner.identityCoverage : null
		winnerStage.roleCoverage.value = coverage
	}
	const slate = alternatives.map((treatment, index) => treatmentStage(
		treatment,
		selectedDiagnostic(phase.root, treatment, index),
		selectorEvaluation(phase.selector, treatment.key),
	))
	const evaluationsAvailable = Boolean(phase.selector && Array.isArray(phase.selector.evaluations))
	const evaluatedKeys = evaluationsAvailable
		? new Set((phase.selector!.evaluations as unknown[]).filter(isObject)
			.map((entry) => typeof entry.key === "string" ? entry.key : "")) : null
	return {
		diagnosticsPath: phase.path,
		domainMembership: {
			phase: rootDomain ? Object.fromEntries(Object.entries(rootDomain)
				.map(([key, entry]) => [key, primitiveProjection(entry)]).filter(([, entry]) => entry !== undefined)) : null,
			selector: selectorDomain ? Object.fromEntries(Object.entries(selectorDomain)
				.map(([key, entry]) => [key, primitiveProjection(entry)]).filter(([, entry]) => entry !== undefined)) : null,
			winnerInEvaluatedDomain: evaluatedKeys ? evaluatedKeys.has(winner.key) : null,
			slateInEvaluatedDomain: evaluatedKeys ? alternatives.every(({ key }) => evaluatedKeys.has(key)) : null,
		},
		winner: {
			...winnerStage,
			diagnostic: compactObject(winnerEvaluation ?? selectorWinner, ["key", "gradientStatus", "qualityUtility", "identityCoverage",
				"identityGain", "roleIdentityCoverage", "roleIdentityGain", "relationUtility", "reasons"]),
		},
		slate,
		sourceCustody: {
			winner: { custody: winner.custody, selection: winnerStage.selection },
			slate: slate.map((entry) => ({ key: entry.key, custody: entry.custody, selection: entry.selection })),
		},
		roleCoverage: {
			winner: winnerStage.roleCoverage,
			slate: slate.map((entry) => ({ key: entry.key, ...entry.roleCoverage as JsonObject })),
		},
		gradientStatus: {
			winner: { enabled: winnerStage.gradientEnabled, status: winnerStage.gradientStatus },
			slate: slate.map((entry) => ({ key: entry.key, enabled: entry.gradientEnabled, status: entry.gradientStatus })),
		},
		lineage: {
			winner: winnerStage.lineage,
			slate: slate.map((entry) => ({ key: entry.key, ...entry.lineage as JsonObject })),
		},
		runtime: attemptRuntime,
	}
}

function compactOutput(value: unknown, attemptIdentity: AttemptIdentity, attemptRuntime: Runtime, label: string): CompactOutput {
	invariant(isObject(value) && isObject(value.winner) && Array.isArray(value.alternatives), `${label} output is invalid`)
	const dimensions = value.dimensions
	invariant(isObject(dimensions) && Number.isSafeInteger(dimensions.width) && Number.isSafeInteger(dimensions.height),
		`${label} output dimensions are invalid`)
	const winner = compactTreatment(value.winner, `${label} winner`)
	const alternatives = value.alternatives.map((entry, index) => compactTreatment(entry, `${label} alternatives[${index}]`))
	invariant(alternatives.length > 0 && alternatives.length <= 8, `${label} output slate must contain 1 to 8 treatments`)
	invariant(new Set(alternatives.map(({ key }) => key)).size === alternatives.length, `${label} output has duplicate slate keys`)
	invariant(exactTreatmentKey(winner) === exactTreatmentKey(alternatives[0]),
		`${label} output winner is not the exact first slate treatment`)
	return {
		version: stringField(value, "version", `${label} output`),
		protocol: stringField(value, "protocol", `${label} output`),
		winner,
		alternatives,
		stages: buildStages(value, attemptIdentity, winner, alternatives, attemptRuntime, label),
	}
}

function exactIdentityList(values: readonly AttemptIdentity[]): string[] {
	return values.map(exactIdentity)
}

async function loadCase(
	path: string,
	expectedCaseId: string,
	expectedSourceSha256: string,
	identities: readonly AttemptIdentity[],
): Promise<LoadedCase> {
	const value = await regularJson(path, `Normalized Phase 3 case ${expectedCaseId}`)
	invariant(isObject(value) && value.schemaVersion === 1 && value.contractId === CONTRACT_ID &&
		isObject(value.anchor) && Array.isArray(value.attempts), `Normalized case ${expectedCaseId} has an invalid Phase 3 contract`)
	const source = sourceIdentity(value.source, expectedCaseId)
	invariant(source.sha256 === expectedSourceSha256,
		`Source identity mismatch for case ${expectedCaseId}: iteration and normalized artifact SHA-256 differ`)
	const records = value.attempts.map((entry, index) => {
		invariant(isObject(entry), `Case ${expectedCaseId} attempt ${index} is invalid`)
		const attemptIdentity = identity(entry.identity, `Case ${expectedCaseId} attempt ${index} identity`)
		const attemptRuntime = runtime(entry.runtime, `Case ${expectedCaseId} attempt ${displayIdentity(attemptIdentity)} runtime`)
		return {
			identity: attemptIdentity,
			output: compactOutput(entry.output, attemptIdentity, attemptRuntime,
				`Case ${expectedCaseId} attempt ${displayIdentity(attemptIdentity)}`),
			runtime: attemptRuntime,
		}
	})
	invariant(canonicalJson(exactIdentityList(records.map(({ identity: recordIdentity }) => recordIdentity))) ===
		canonicalJson(exactIdentityList(identities)),
		`Case ${expectedCaseId} attempt/config identities do not exactly match its iteration manifest`)
	return { source, attempts: new Map(records.map((record) => [exactIdentity(record.identity), record])) }
}

async function loadWave(iterationDirectoryValue: string): Promise<LoadedWave> {
	const iterationDirectory = resolve(iterationDirectoryValue)
	const value = await regularJson(resolve(iterationDirectory, "iteration.json"), "Phase 3 iteration manifest")
	invariant(isObject(value) && value.schemaVersion === 1 && value.contractId === CONTRACT_ID &&
		Array.isArray(value.sources) && value.sources.length > 0 && Array.isArray(value.attempts),
		`Phase 3 iteration manifest is invalid: ${iterationDirectory}`)
	const iterationId = validIdentity(value.iterationId, "Phase 3 iteration ID")
	const identities = value.attempts.map((entry, index) => identity(entry, `Iteration ${iterationId} attempt ${index}`))
	invariant(identities.length > 0 && new Set(exactIdentityList(identities)).size === identities.length,
		`Iteration ${iterationId} has empty or duplicate attempt/config identities`)
	invariant(new Set(identities.map(({ attemptId }) => attemptId)).size === identities.length,
		`Iteration ${iterationId} has ambiguous configurations for one attempt ID`)
	const sources = value.sources.map((entry, index) => {
		invariant(isObject(entry), `Iteration ${iterationId} source ${index} is invalid`)
		const caseId = validIdentity(entry.caseId, `Iteration ${iterationId} source ${index} caseId`)
		const sourceSha256 = stringField(entry, "sourceSha256", `Iteration ${iterationId} source ${index}`)
		invariant(/^[0-9a-f]{64}$/u.test(sourceSha256), `Iteration ${iterationId} source ${caseId} SHA-256 is invalid`)
		if (Array.isArray(entry.materialDeltas)) {
			const deltaIdentities = entry.materialDeltas.map((delta, deltaIndex) => {
				invariant(isObject(delta), `Iteration ${iterationId} source ${caseId} material delta ${deltaIndex} is invalid`)
				return identity(delta.identity, `Iteration ${iterationId} source ${caseId} material delta ${deltaIndex}`)
			})
			invariant(canonicalJson(exactIdentityList(deltaIdentities)) === canonicalJson(exactIdentityList(identities)),
				`Iteration ${iterationId} source ${caseId} material-delta identities are stale`)
		}
		return { caseId, sourceSha256, file: stringField(entry, "file", `Iteration ${iterationId} source ${index}`) }
	})
	invariant(new Set(sources.map(({ caseId }) => caseId)).size === sources.length,
		`Iteration ${iterationId} has duplicate case-sensitive case IDs`)
	if (Array.isArray(value.caseIds)) {
		invariant(value.caseIds.every((caseId) => typeof caseId === "string") &&
			canonicalJson(value.caseIds) === canonicalJson(sources.map(({ caseId }) => caseId)),
			`Iteration ${iterationId} caseIds do not exactly align with source entries`)
	}
	const cases = new Map<string, LoadedCase>()
	for (const source of sources) {
		const loaded = await loadCase(safeCasePath(iterationDirectory, source.file), source.caseId,
			source.sourceSha256, identities)
		cases.set(source.caseId, loaded)
	}
	return {
		iterationId,
		identityKeys: exactIdentityList(identities),
		identities,
		cases,
		runtimeEnvironment: isObject(value.runtime) ? value.runtime : null,
	}
}

function resolveAttempt(specification: string, identities: readonly AttemptIdentity[], label: string): AttemptIdentity {
	const separator = specification.indexOf("@")
	const attemptId = separator < 0 ? specification : specification.slice(0, separator)
	const configurationId = separator < 0 ? null : specification.slice(separator + 1)
	validIdentity(attemptId, `${label} attempt ID`)
	if (configurationId !== null) validIdentity(configurationId, `${label} configuration ID`)
	const matches = identities.filter((candidate) => candidate.attemptId === attemptId &&
		(configurationId === null || candidate.configurationId === configurationId))
	invariant(matches.length === 1, matches.length === 0
		? `${label} ${specification} is not present in the aligned waves`
		: `${label} ${specification} is ambiguous; name it as attemptId@configurationId`)
	return matches[0]
}

function outputSignature(output: CompactOutput): JsonObject {
	const exact = (treatment: CompactTreatment) => ({
		treatmentIdentity: treatment.normalized.treatmentIdentity,
		renderVariantId: treatment.normalized.renderVariantId,
	})
	return { winner: exact(output.winner), slate: output.alternatives.map(exact) }
}

function comparableOutput(output: CompactOutput): JsonObject {
	const { runtime: _runtime, ...stages } = output.stages
	return {
		version: output.version,
		protocol: output.protocol,
		signature: outputSignature(output),
		stages,
	}
}

function exactTreatmentKey(treatment: CompactTreatment): string {
	return `${treatment.normalized.treatmentIdentity}\0${treatment.normalized.renderVariantId}`
}

function exactOutputGroups(attempts: readonly LoadedAttempt[]): JsonObject[] {
	const groups = new Map<string, { signature: JsonObject; identities: AttemptIdentity[] }>()
	for (const attempt of attempts) {
		const signature = outputSignature(attempt.output)
		const key = canonicalJson(signature)
		const group = groups.get(key) ?? { signature, identities: [] }
		group.identities.push(attempt.identity)
		groups.set(key, group)
	}
	return [...groups.values()].map(({ signature, identities }) => ({
		groupId: sha256(canonicalJson(signature)),
		...signature,
		attempts: identities.sort((first, second) => ascii(exactIdentity(first), exactIdentity(second))),
	})).sort((first, second) => ascii(first.groupId as string, second.groupId as string))
}

function exactTreatmentGroups(attempts: readonly LoadedAttempt[]): JsonObject[] {
	const groups = new Map<string, {
		treatment: CompactTreatment
		appearances: Array<{ identity: AttemptIdentity; positions: string[] }>
	}>()
	for (const attempt of attempts) {
		const positions = new Map<string, { treatment: CompactTreatment; positions: string[] }>()
		const add = (treatment: CompactTreatment, position: string): void => {
			const key = exactTreatmentKey(treatment)
			const entry = positions.get(key) ?? { treatment, positions: [] }
			entry.positions.push(position)
			positions.set(key, entry)
		}
		add(attempt.output.winner, "winner")
		attempt.output.alternatives.forEach((treatment, index) => add(treatment, `slate:${index}`))
		for (const [key, entry] of positions) {
			const group = groups.get(key) ?? { treatment: entry.treatment, appearances: [] }
			group.appearances.push({ identity: attempt.identity, positions: [...new Set(entry.positions)].sort(ascii) })
			groups.set(key, group)
		}
	}
	return [...groups.values()].map(({ treatment, appearances }) => ({
		treatmentIdentity: treatment.normalized.treatmentIdentity,
		renderVariantId: treatment.normalized.renderVariantId,
		visible: treatment.normalized.visible,
		renderVariant: treatment.normalized.renderVariant,
		appearances: appearances.sort((first, second) => ascii(exactIdentity(first.identity), exactIdentity(second.identity))),
	})).sort((first, second) => ascii(`${first.treatmentIdentity}\0${first.renderVariantId}`,
		`${second.treatmentIdentity}\0${second.renderVariantId}`))
}

function setDelta(candidate: readonly CompactTreatment[], control: readonly CompactTreatment[]): JsonObject {
	const candidateValues = candidate.map(exactTreatmentKey)
	const controlValues = control.map(exactTreatmentKey)
	const candidateSet = new Set(candidateValues)
	const controlSet = new Set(controlValues)
	return {
		changed: canonicalJson(candidateValues) !== canonicalJson(controlValues),
		added: candidateValues.filter((value) => !controlSet.has(value)),
		removed: controlValues.filter((value) => !candidateSet.has(value)),
		orderChanged: canonicalJson(candidateValues.filter((value) => controlSet.has(value))) !==
			canonicalJson(controlValues.filter((value) => candidateSet.has(value))),
	}
}

function winnerCoverage(stages: JsonObject): number | null {
	if (!isObject(stages.roleCoverage) || !isObject(stages.roleCoverage.winner)) return null
	return typeof stages.roleCoverage.winner.value === "number" ? stages.roleCoverage.winner.value : null
}

function winnerGradientStatus(stages: JsonObject): string | null {
	if (!isObject(stages.gradientStatus) || !isObject(stages.gradientStatus.winner)) return null
	return typeof stages.gradientStatus.winner.status === "string" ? stages.gradientStatus.winner.status : null
}

function winnerLineage(stages: JsonObject): boolean | null {
	if (!isObject(stages.lineage) || !isObject(stages.lineage.winner)) return null
	return typeof stages.lineage.winner.sourceConnected === "boolean" ? stages.lineage.winner.sourceConnected : null
}

function winnerLineageBasis(stages: JsonObject): string | null {
	if (!isObject(stages.lineage) || !isObject(stages.lineage.winner)) return null
	return typeof stages.lineage.winner.basis === "string" ? stages.lineage.winner.basis : null
}

function sourceRoleHasCustody(treatment: CompactTreatment, role: typeof ROLE_NAMES[number]): boolean {
	const custody = treatment.custody[role]
	return !custody.generated && custody.exactSource !== null && custody.hasRegionLineage === true &&
		custody.anchorFamilyId !== null && custody.anchorFamilyId === treatment.mechanism.familyRoles[role]
}

function structurallyNormativeEmergency(treatment: CompactTreatment): boolean {
	const visible = treatment.normalized.visible
	const generatedRoles = ROLE_NAMES.filter((role) => visible.roles[role].generated)
	const generatedField = generatedRoles.length === 2 && generatedRoles.includes("background") &&
		generatedRoles.includes("surface") && visible.collapse.surface === true && !visible.gradient.enabled
	const generatedForeground = generatedRoles.length === 2 && generatedRoles.includes("foreground") &&
		generatedRoles.includes("accent") && visible.collapse.accent === true
	if (!generatedField && !generatedForeground) return false
	const generatedColors = generatedRoles.map((role) => visible.roles[role].rgb.join(","))
	if (new Set(generatedColors).size !== 1 || !["0,0,0", "255,255,255"].includes(generatedColors[0])) return false
	return ROLE_NAMES.every((role) => generatedRoles.includes(role) || sourceRoleHasCustody(treatment, role))
}

function sourceCustodyReasons(treatment: CompactTreatment, lineageBasis: string | null): string[] {
	if (lineageBasis === "normative-one-color-emergency") {
		return structurallyNormativeEmergency(treatment) ? [] : ["invalid-normative-one-color-emergency"]
	}
	return ROLE_NAMES.filter((role) => !sourceRoleHasCustody(treatment, role))
		.map((role) => `${role}-lacks-source-custody`)
}

function mechanismFlags(candidate: CompactOutput, control: CompactOutput): JsonObject[] {
	const same = (first: unknown, second: unknown): boolean => canonicalJson(first) === canonicalJson(second)
	const candidateDomain = candidate.stages.domainMembership as JsonObject
	const controlCoverage = winnerCoverage(control.stages)
	const candidateCoverage = winnerCoverage(candidate.stages)
	const controlGradient = winnerGradientStatus(control.stages)
	const candidateGradient = winnerGradientStatus(candidate.stages)
	const lineage = winnerLineage(candidate.stages)
	const lineageBasis = winnerLineageBasis(candidate.stages)
	const declaredNormativeEmergency = lineageBasis === "normative-one-color-emergency"
	const normativeEmergency = declaredNormativeEmergency && structurallyNormativeEmergency(candidate.winner)
	const custodyReasons = sourceCustodyReasons(candidate.winner, lineageBasis)
	const runtimeRatio = candidate.stages.runtime && control.stages.runtime &&
		(candidate.stages.runtime as Runtime).wallMs / Math.max((control.stages.runtime as Runtime).wallMs, Number.EPSILON)
	const flags: JsonObject[] = []
	const add = (mechanism: string, noOp: boolean, safety: string, reasons: string[]): void => {
		flags.push({ mechanism, noOp, safety, reasons })
	}
	const domainReasons: string[] = []
	if (candidateDomain.winnerInEvaluatedDomain === false) domainReasons.push("winner-not-in-evaluated-domain")
	if (candidateDomain.slateInEvaluatedDomain === false) domainReasons.push("slate-not-fully-in-evaluated-domain")
	const domainAssessed = candidateDomain.winnerInEvaluatedDomain !== null || candidateDomain.slateInEvaluatedDomain !== null
	add("domain-membership", same(candidate.stages.domainMembership, control.stages.domainMembership),
		domainReasons.length > 0 ? "flag" : domainAssessed ? "pass" : "not-assessed", domainReasons)
	const winnerReasons = candidate.winner.key === candidate.alternatives[0]?.key ? [] : ["winner-is-not-first-slate-entry"]
	add("winner", exactTreatmentKey(candidate.winner) === exactTreatmentKey(control.winner),
		winnerReasons.length > 0 ? "flag" : "pass", winnerReasons)
	add("slate", same(outputSignature(candidate).slate, outputSignature(control).slate), "pass", [])
	add("source-custody", same(candidate.stages.sourceCustody, control.stages.sourceCustody),
		custodyReasons.length > 0 ? "flag" : "pass", custodyReasons)
	const coverageReasons = candidateCoverage !== null && controlCoverage !== null && candidateCoverage + 1e-12 < controlCoverage
		? ["winner-role-coverage-regressed"] : []
	add("role-coverage", same(candidate.stages.roleCoverage, control.stages.roleCoverage),
		coverageReasons.length > 0 ? "flag" : candidateCoverage === null || controlCoverage === null ? "not-assessed" : "pass",
		coverageReasons)
	const gradientReasons = (controlGradient === "earned-rendered" && candidateGradient !== "earned-rendered") ||
		(candidate.winner.normalized.visible.gradient.enabled && ["missing", "unearned"].includes(candidateGradient ?? ""))
		? ["rendered-gradient-safety-regressed"] : []
	add("gradient-status", same(candidate.stages.gradientStatus, control.stages.gradientStatus),
		gradientReasons.length > 0 ? "flag" : candidateGradient === null ? "not-assessed" : "pass", gradientReasons)
	add("lineage", same(candidate.stages.lineage, control.stages.lineage),
		declaredNormativeEmergency && !normativeEmergency ? "flag" :
			lineage === false && !normativeEmergency ? "flag" : lineage === null ? "not-assessed" : "pass",
		declaredNormativeEmergency && !normativeEmergency ? ["invalid-normative-one-color-emergency"] :
			normativeEmergency ? ["normative-one-color-emergency"] :
			lineage === false ? ["winner-lacks-source-connected-lineage"] : [])
	add("runtime", same(candidate.stages.runtime, control.stages.runtime), runtimeRatio > 3 ? "flag" : "pass",
		runtimeRatio > 3 ? ["wall-runtime-over-3x-control"] : [])
	return flags
}

function treatmentMechanisms(candidate: CompactTreatment, baseline: CompactTreatment): string[] {
	const result = new Set<string>()
	const first = candidate.normalized.visible
	const second = baseline.normalized.visible
	if (canonicalJson([first.roles.background, first.roles.surface, first.gradient]) !==
		canonicalJson([second.roles.background, second.roles.surface, second.gradient])) result.add("field-rendering")
	if (canonicalJson(first.roles.foreground) !== canonicalJson(second.roles.foreground)) result.add("foreground-role")
	if (canonicalJson(first.roles.accent) !== canonicalJson(second.roles.accent)) result.add("accent-role")
	if (canonicalJson(first.collapse) !== canonicalJson(second.collapse)) result.add("collapse-semantics")
	if (canonicalJson([candidate.mechanism.fieldTreatment, candidate.mechanism.sourceFieldHypothesisId,
		candidate.mechanism.familyRoles.background, candidate.mechanism.familyRoles.surface]) !==
		canonicalJson([baseline.mechanism.fieldTreatment, baseline.mechanism.sourceFieldHypothesisId,
			baseline.mechanism.familyRoles.background, baseline.mechanism.familyRoles.surface])) result.add("source-custody")
	if (canonicalJson([candidate.mechanism.familyRoles.foreground, candidate.mechanism.familyRoles.accent]) !==
		canonicalJson([baseline.mechanism.familyRoles.foreground, baseline.mechanism.familyRoles.accent])) {
		result.add("role-assignment")
	}
	return [...result].sort(ascii)
}

function addReviewCandidates(
	grouped: Map<string, InternalReviewCandidate>,
	source: SourceIdentity,
	attempt: LoadedAttempt,
	control: LoadedAttempt,
): void {
	const controlSlate = new Set(control.output.alternatives.map(exactTreatmentKey))
	const add = (treatment: CompactTreatment, kind: "winner" | "slate", slateIndex: number,
		baseline: CompactTreatment): void => {
		const exact = exactTreatmentKey(treatment)
		const groupingKey = `${source.sha256}\0${exact}`
		const candidateId = `${source.caseId}.${sha256(groupingKey).slice(0, 16)}`
		const entry = grouped.get(groupingKey) ?? {
			candidateId,
			caseId: source.caseId,
			source,
			treatment,
			occurrences: [],
			mechanisms: new Set<string>(),
			reasons: new Set<string>(),
		}
		entry.occurrences.push({ identity: attempt.identity, kind, slateIndex })
		entry.mechanisms.add(kind === "winner" ? "winner-selection" : "slate-composition")
		entry.reasons.add(kind === "winner" ? "exact winner differs from the explicit control" :
			"exact treatment is absent from the explicit control slate")
		for (const mechanism of treatmentMechanisms(treatment, baseline)) {
			entry.mechanisms.add(mechanism)
			entry.reasons.add(`material ${mechanism} treatment difference`)
		}
		grouped.set(groupingKey, entry)
	}
	if (exactTreatmentKey(attempt.output.winner) !== exactTreatmentKey(control.output.winner)) {
		add(attempt.output.winner, "winner", 0, control.output.winner)
	}
	attempt.output.alternatives.forEach((treatment, index) => {
		if (!controlSlate.has(exactTreatmentKey(treatment))) {
			add(treatment, "slate", index, control.output.alternatives[index] ?? control.output.winner)
		}
	})
}

function evidenceStatus(entry: Record<string, unknown>): JsonObject {
	return {
		status: entry.status,
		reviewNeeded: entry.reviewNeeded,
		exactQualities: Array.isArray(entry.exactQualities) ? entry.exactQualities : [],
		exactJudgmentCount: Array.isArray(entry.exactJudgments) ? entry.exactJudgments.length : 0,
		relatedVisibleTreatmentJudgments: typeof entry.relatedVisibleTreatmentJudgments === "number"
			? entry.relatedVisibleTreatmentJudgments : 0,
	}
}

function publicReviewCandidate(candidate: InternalReviewCandidate): JsonObject {
	const evidenceTreatment = candidate.evidenceTreatment ?? candidate.treatment.normalized
	return {
		candidateId: candidate.candidateId,
		caseId: candidate.caseId,
		sourceSha256: candidate.source.sha256,
		treatmentIdentity: evidenceTreatment.treatmentIdentity,
		renderVariantId: evidenceTreatment.renderVariantId,
		outputRenderVariantId: candidate.treatment.normalized.renderVariantId,
		visible: evidenceTreatment.visible,
		occurrences: candidate.occurrences.sort((first, second) =>
			ascii(exactIdentity(first.identity), exactIdentity(second.identity)) || first.slateIndex - second.slateIndex),
		unresolvedMechanisms: [...candidate.mechanisms].sort(ascii),
		informationReasons: [...candidate.reasons].sort(ascii),
		evidence: candidate.evidence ?? { status: "not-joined", reviewNeeded: true },
	}
}

function reviewProposal(candidates: readonly InternalReviewCandidate[]): JsonObject {
	const selected: InternalReviewCandidate[] = []
	const deferred: JsonObject[] = []
	const resolved: JsonObject[] = []
	const coveredBySource = new Map<string, Set<string>>()
	for (const candidate of candidates) {
		const status = candidate.evidence?.status
		if (status === "exact-evidence-reused" || status === "excluded-source") {
			resolved.push({ candidateId: candidate.candidateId, status })
			continue
		}
		if (status === "conflicting-exact-evidence" || status === "incompatible-render-variant") {
			candidate.mechanisms.add(status === "conflicting-exact-evidence"
				? "evidence-conflict" : "render-compatibility")
			selected.push(candidate)
			continue
		}
		const covered = coveredBySource.get(candidate.source.sha256) ?? new Set<string>()
		const novel = [...candidate.mechanisms].filter((mechanism) => !covered.has(mechanism))
		if (novel.length === 0) {
			deferred.push({ candidateId: candidate.candidateId, reason: "no-new-unresolved-mechanism-for-source" })
			continue
		}
		selected.push(candidate)
		for (const mechanism of candidate.mechanisms) covered.add(mechanism)
		coveredBySource.set(candidate.source.sha256, covered)
	}
	return {
		policy: {
			exactTreatmentGrouping: true,
			oneQuestionPerSourceUnlessNewUnresolvedMechanism: true,
			reusableExactAbsoluteEvidenceIsNotRequeued: true,
			conflictsAndRenderIncompatibilityRemainUnresolved: true,
		},
		candidateCount: selected.length,
		candidates: selected.map(publicReviewCandidate),
		resolvedByEvidence: resolved,
		deferred,
	}
}

async function joinEvidence(
	candidates: readonly InternalReviewCandidate[],
	warehousePath: string | undefined,
	presentationVersion: string | undefined,
): Promise<Readonly<{ warehouse: JsonObject; artworkContext: JsonObject[] }>> {
	if (!warehousePath) return { warehouse: { joined: false, readOnly: true }, artworkContext: [] }
	const normalizedCandidates: CandidateTreatment[] = candidates.map((candidate) => {
		const treatment = normalizeTreatment(candidate.treatment.evidenceInput, { presentationVersion: presentationVersion ?? null })
		candidate.evidenceTreatment = treatment
		return {
			...treatment,
			caseId: candidate.candidateId,
			sourceSha256: candidate.source.sha256,
			reviewQuestion: "absolute-quality",
		}
	})
	const database = openWarehouse(resolve(warehousePath))
	try {
		const report = minimalReviewNeed(database, normalizedCandidates)
		invariant(Array.isArray(report.entries), "Warehouse minimal-review report is invalid")
		const byId = new Map((report.entries as Array<Record<string, unknown>>).map((entry) => [entry.caseId, entry]))
		for (const candidate of candidates) {
			const entry = byId.get(candidate.candidateId)
			invariant(entry !== undefined, `Warehouse omitted review candidate ${candidate.candidateId}`)
			candidate.evidence = evidenceStatus(entry)
		}
		const sourceHashes = [...new Set(candidates.map(({ source }) => source.sha256))].sort(ascii)
		return {
			warehouse: {
				joined: true,
				readOnly: true,
				presentationVersion: presentationVersion ?? null,
				candidateCount: report.candidateCount,
				reviewNeededCount: report.reviewNeededCount,
				reviewWorkAvoidedCount: report.reviewWorkAvoidedCount,
				excludedCount: report.excludedCount,
			},
			artworkContext: sourceHashes.map((sourceSha256) => artworkHistoricalContext(database, sourceSha256)),
		}
	} finally {
		database.close()
	}
}

export async function evaluateAlbumArtworkPaletteV2Phase3ParallelWave(
	options: AlbumArtworkPaletteV2Phase3ParallelWaveOptions,
): Promise<JsonObject> {
	invariant(options.iterationDirectories.length > 0, "At least one --iteration-directory is required")
	invariant(options.attempts.length > 0, "At least one named --attempt is required")
	if (options.warehousePath) {
		invariant(options.presentationVersion !== undefined,
			"A warehouse evidence join requires an explicit presentation version")
	}
	const authorizedSources = await authorizedDevelopmentSources()
	const waves: LoadedWave[] = []
	for (const directory of [...new Set(options.iterationDirectories)].sort(ascii)) waves.push(await loadWave(directory))
	waves.sort((first, second) => ascii(first.iterationId, second.iterationId))
	invariant(new Set(waves.map(({ iterationId }) => iterationId)).size === waves.length, "Parallel waves have duplicate iteration IDs")
	const identityOwners = new Map<string, LoadedWave[]>()
	const allIdentities = new Map<string, AttemptIdentity>()
	for (const wave of waves) {
		for (const attemptIdentity of wave.identities) {
			const key = exactIdentity(attemptIdentity)
			const owners = identityOwners.get(key) ?? []
			owners.push(wave)
			identityOwners.set(key, owners)
			allIdentities.set(key, attemptIdentity)
		}
	}
	const availableIdentities = [...allIdentities.values()]
	const controlIdentity = resolveAttempt(options.controlAttempt, availableIdentities, "Control attempt")
	const selectedIdentities = options.attempts.map((specification) =>
		resolveAttempt(specification, availableIdentities, "Named attempt"))
	invariant(new Set(selectedIdentities.map(exactIdentity)).size === selectedIdentities.length, "Duplicate named attempts are forbidden")
	invariant(!selectedIdentities.some((candidate) => exactIdentity(candidate) === exactIdentity(controlIdentity)),
		"The explicit control cannot also be a named candidate attempt")
	selectedIdentities.sort((first, second) => ascii(exactIdentity(first), exactIdentity(second)))
	const reference = waves[0]
	const caseIds = [...reference.cases.keys()].sort(ascii)
	for (const wave of waves.slice(1)) {
		const waveCaseIds = [...wave.cases.keys()].sort(ascii)
		invariant(canonicalJson(waveCaseIds) === canonicalJson(caseIds),
			`Case alignment mismatch between iterations ${reference.iterationId} and ${wave.iterationId}`)
		for (const caseId of caseIds) {
			const expected = reference.cases.get(caseId)!.source
			const actual = wave.cases.get(caseId)!.source
			invariant(canonicalJson(actual) === canonicalJson(expected),
				`Source identity mismatch for case ${caseId} between iterations ${reference.iterationId} and ${wave.iterationId}`)
		}
	}
	for (const caseId of caseIds) {
		const source = reference.cases.get(caseId)!.source
		const authorized = authorizedSources.get(caseId)
		invariant(authorized !== undefined && source.sha256 === authorized.sha256 &&
			source.byteCount === authorized.byteCount && source.artworkId === authorized.artworkId,
			`Case ${caseId} is not bound to the authorized Phase 3 development panel`)
	}
	const reviewCandidates = new Map<string, InternalReviewCandidate>()
	const cases = caseIds.map((caseId) => {
		const source = reference.cases.get(caseId)!.source
		const attemptFor = (attemptIdentity: AttemptIdentity): Readonly<{
			primary: LoadedAttempt
			runtimeReplicates: readonly JsonObject[]
		}> => {
			const records = identityOwners.get(exactIdentity(attemptIdentity))!.map((wave) => {
				const attempt = wave.cases.get(caseId)?.attempts.get(exactIdentity(attemptIdentity))
				invariant(attempt !== undefined, `Case ${caseId} is missing attempt ${displayIdentity(attemptIdentity)}`)
				return { iterationId: wave.iterationId, attempt }
			})
			const expected = canonicalJson(comparableOutput(records[0].attempt.output))
			invariant(records.every(({ attempt }) => canonicalJson(comparableOutput(attempt.output)) === expected),
				`Repeated attempt/config identity ${displayIdentity(attemptIdentity)} has inconsistent output for case ${caseId}`)
			return {
				primary: records[0].attempt,
				runtimeReplicates: records.map(({ iterationId, attempt }) => ({ iterationId, ...attempt.runtime })),
			}
		}
		const controlSelection = attemptFor(controlIdentity)
		const control = controlSelection.primary
		const attemptSelections = selectedIdentities.map(attemptFor)
		const attempts = attemptSelections.map(({ primary }) => primary)
		for (const attempt of attempts) addReviewCandidates(reviewCandidates, source, attempt, control)
		const all = [control, ...attempts]
		return {
			caseId,
			source,
			exactOutputGroups: exactOutputGroups(all),
			exactTreatmentGroups: exactTreatmentGroups(all),
			control: {
				identity: control.identity,
				stages: control.output.stages,
				runtimeReplicates: controlSelection.runtimeReplicates,
			},
			attempts: attempts.map((attempt, index) => ({
				identity: attempt.identity,
				exactDelta: {
					winnerChanged: exactTreatmentKey(attempt.output.winner) !== exactTreatmentKey(control.output.winner),
					winnerKeyChanged: attempt.output.winner.key !== control.output.winner.key,
					controlWinner: exactTreatmentKey(control.output.winner),
					candidateWinner: exactTreatmentKey(attempt.output.winner),
					slate: setDelta(attempt.output.alternatives, control.output.alternatives),
					outputGroupId: sha256(canonicalJson(outputSignature(attempt.output))),
				},
				stages: attempt.output.stages,
				runtimeReplicates: attemptSelections[index].runtimeReplicates,
				mechanismFlags: mechanismFlags(attempt.output, control.output),
			})),
		}
	})
	const orderedReviewCandidates = [...reviewCandidates.values()].sort((first, second) =>
		ascii(first.caseId, second.caseId) ||
		Math.min(...first.occurrences.map(({ kind }) => kind === "winner" ? 0 : 1)) -
			Math.min(...second.occurrences.map(({ kind }) => kind === "winner" ? 0 : 1)) ||
		Math.min(...first.occurrences.map(({ slateIndex }) => slateIndex)) -
			Math.min(...second.occurrences.map(({ slateIndex }) => slateIndex)) ||
		ascii(first.candidateId, second.candidateId))
	const evidence = await joinEvidence(orderedReviewCandidates, options.warehousePath, options.presentationVersion)
	return {
		schemaVersion: 1,
		reportId: REPORT_ID,
		contractId: CONTRACT_ID,
		causalComparison: {
			control: controlIdentity,
			attempts: selectedIdentities,
			unit: "exact-source-case",
			aggregation: "none-per-case-results-preserved",
		},
		inputs: waves.map((wave) => ({
			iterationId: wave.iterationId,
			attempts: wave.identities,
			caseCount: wave.cases.size,
			runtimeEnvironment: wave.runtimeEnvironment,
		})),
		caseCount: cases.length,
		cases,
		evidence: {
			...evidence.warehouse,
			separation: "post-extraction-read-only-evaluation-context-never-inference-input",
			artworkContext: evidence.artworkContext,
		},
		reviewProposal: reviewProposal(orderedReviewCandidates),
	}
}

function required(values: Map<string, string>, name: string): string {
	const value = values.get(name)
	invariant(value !== undefined, `Missing required ${name}`)
	return value
}

export function parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments(
	args: readonly string[],
): AlbumArtworkPaletteV2Phase3ParallelWaveArguments {
	const aliases = new Map([
		["--iteration", "--iteration-directory"],
		["--wave", "--iteration-directory"],
		["--control-attempt", "--control"],
		["--output-file", "--output"],
		["--warehouse-db", "--warehouse"],
	])
	const values = new Map<string, string>()
	const iterationDirectories: string[] = []
	const attempts: string[] = []
	for (let index = 0; index < args.length; index++) {
		const rawName = args[index]
		invariant(rawName.startsWith("--"), `Unexpected positional argument ${rawName}`)
		const name = aliases.get(rawName) ?? rawName
		invariant(["--iteration-directory", "--control", "--attempt", "--output", "--warehouse",
			"--presentation-version"].includes(name), `Unknown argument ${rawName}`)
		const value = args[++index]
		invariant(value !== undefined && !value.startsWith("--"), `${rawName} requires a value`)
		if (name === "--iteration-directory") iterationDirectories.push(value)
		else if (name === "--attempt") attempts.push(value)
		else {
			invariant(!values.has(name), `Duplicate ${name}`)
			values.set(name, value)
		}
	}
	invariant(new Set(iterationDirectories).size === iterationDirectories.length, "Duplicate iteration directories are forbidden")
	invariant(new Set(attempts).size === attempts.length, "Duplicate --attempt values are forbidden")
	return {
		iterationDirectories,
		controlAttempt: required(values, "--control"),
		attempts,
		outputPath: required(values, "--output"),
		...(values.get("--warehouse") ? { warehousePath: values.get("--warehouse")! } : {}),
		...(values.get("--presentation-version") ? { presentationVersion: values.get("--presentation-version")! } : {}),
	}
}

export async function writeAlbumArtworkPaletteV2Phase3ParallelWaveEvaluation(
	options: AlbumArtworkPaletteV2Phase3ParallelWaveArguments,
): Promise<JsonObject> {
	const outputPath = resolve(options.outputPath)
	const parent = await lstat(dirname(outputPath))
	invariant(parent.isDirectory(), `Output parent is not a directory: ${dirname(outputPath)}`)
	try {
		const existing = await lstat(outputPath)
		invariant(existing.isFile() && !existing.isSymbolicLink(), `Output path must be a regular non-symlink file`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave(options)
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
	return report
}

async function main(): Promise<void> {
	const options = parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments(process.argv.slice(2))
	const report = await writeAlbumArtworkPaletteV2Phase3ParallelWaveEvaluation(options)
	process.stdout.write(`Phase 3 parallel-wave evaluation wrote ${report.caseCount} exact-source cases to ${resolve(options.outputPath)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
