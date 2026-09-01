import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import {
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	COMPLETE_PALETTE_REVIEW_VERSION,
	completePaletteReviewCanonicalJson,
	completePaletteReviewManifestId,
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	type CompletePaletteReviewFeedbackStore,
	type CompletePaletteReviewManifest,
	type CompletePaletteReviewMode,
	type CompletePaletteReviewSource,
	type CompletePaletteReviewTreatment,
} from "./src/complete-palette-review-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT,
	normalizeAlbumArtworkPaletteV2Phase3Result,
} from "./src/album-artwork-palette-v2-phase-3-contract.ts"
import {
	projectAlbumArtworkPaletteV2Phase3WinnerResearchRender,
} from "./src/album-artwork-palette-v2-phase-3-review-render.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import {
	readAndVerifyPhase3WorkingExpansionManifest,
} from "./select-album-artwork-palette-v2-phase-3-working-expansion.ts"
import type { CompletePaletteReviewResearchRender } from "./src/complete-palette-review-v2.ts"
import { candidateTreatments } from "./tools/review-evidence/adapters.ts"
import { minimalReviewNeed } from "./tools/review-evidence/reports.ts"
import type { CandidateTreatment } from "./tools/review-evidence/types.ts"
import {
	defaultWarehouseRelativePath,
	openWarehouse,
} from "./tools/review-evidence/warehouse.ts"

const PHASE_3_CONTRACT_ID = "album-artwork-palette-v2-phase-3-attempt-contract-v1"
const SOURCE_LIGHT_FOREGROUND_RESERVE_DIAGNOSTICS_VERSION =
	"album-artwork-palette-v2-phase-3-source-light-foreground-reserve-diagnostics-v1"
const SOURCE_LIGHT_FOREGROUND_RESERVE_VERSION =
	"album-artwork-palette-v2-phase-3-source-light-foreground-reserve-v1"
const EXACT_FOREGROUND_CARRIER_ID = "exact-current-slate-field-collapse-accent-carrier-v1"
const PHASE_3_MAXIMUM_ITERATION_CASES = 8
const SOURCE_BOUND_PUBLICATION_ATTEMPTS = [
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
] as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_REVIEW_DEFAULT_MAXIMUM_CASES = 16

export type AlbumArtworkPaletteV2Phase3ReviewPairwiseSlateAnchor = "exact-foreground-carrier"

type JsonObject = Record<string, unknown>

type NormalizedTreatment = Readonly<{
	key: string
	treatment: CompletePaletteReviewTreatment
}>

type NormalizedResult = Readonly<{
	winner: NormalizedTreatment
	alternatives: readonly NormalizedTreatment[]
}>

type NormalizedAttemptRecord = Readonly<{
	identity: Readonly<{ attemptId: string; configurationId: string }>
	output: unknown
}>

type SourceBinding = Readonly<{
	caseId: string
	file: string
	sha256: string
	bytes: number
}>

type SourceCustody = Readonly<{
	binding: SourceBinding
	bytes: Buffer
}>

type LoadedCase = Readonly<{
	source: SourceBinding
	anchor: NormalizedResult
	candidate: NormalizedResult
	addedAlternativeKeys: ReadonlySet<string>
	winnerChanged: boolean
	exactForegroundCarrier?: Readonly<{
		candidate: NormalizedTreatment
		carrier: NormalizedTreatment
		slateIndex: number
	}>
}>

type QueueTask = Readonly<{
	caseId: string
	sourceCaseId: string
	source: CompletePaletteReviewSource
	kind: "winner" | "slate"
	slateIndex: number | null
	candidate: CompletePaletteReviewTreatment
	anchor: CompletePaletteReviewTreatment
}>

type MinimalReviewEntry = Readonly<{
	caseId: string
	sourceSha256: string
	treatmentIdentity: string
	renderVariantId: string
	status: string
	reviewNeeded: boolean
}>

export type AlbumArtworkPaletteV2Phase3ReviewArguments = Readonly<{
	iterationDirectory: string
	candidateAttemptId: string
	anchorId: string
	mode: CompletePaletteReviewMode
	outputDirectory: string
	all: boolean
	maximumCases: number
	reviewCaseIds: readonly string[]
	warehousePath?: string
	minimalReviewReportPath?: string
	workingExpansionManifestPath?: string
	pairwiseSlateAnchor?: AlbumArtworkPaletteV2Phase3ReviewPairwiseSlateAnchor
}>

export type AlbumArtworkPaletteV2Phase3ReviewOptions = AlbumArtworkPaletteV2Phase3ReviewArguments & Readonly<{
	projectRoot?: string
	developmentPanelPath?: string
}>

export type AlbumArtworkPaletteV2Phase3ReviewPreparation = Readonly<{
	manifestPath: string
	feedbackPath: string
	minimalReviewReportPath: string
	manifestId: string
	candidateCount: number
	reviewNeededCount: number
	queuedCount: number
	reusedOrExcludedCount: number
	deferredByBoundCount: number
	resumedFeedbackCount: number
	warehouseUsed: boolean
}>

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function ascii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function jsonRoundTrip(value: unknown, label: string): unknown {
	let serialized: string | undefined
	try {
		serialized = JSON.stringify(value)
	} catch {
		throw new Error(`${label} is not JSON-serializable`)
	}
	if (serialized === undefined) throw new Error(`${label} is not a JSON publication value`)
	return JSON.parse(serialized) as unknown
}

function registeredAttemptLabel(attemptId: string): string {
	if (attemptId === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT.identity.attemptId) {
		return "midpoint-aware"
	}
	if (attemptId === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity.attemptId) {
		return "final-candidate"
	}
	return attemptId
}

export function verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication(
	reproducedOutput: unknown,
	decodedDimensions: Readonly<{ width: number; height: number }>,
	artifact: Readonly<{ source: unknown; identity: unknown; output: unknown }>,
	registeredIdentity: Readonly<{ attemptId: string; configurationId: string }>,
	label: string,
): void {
	const identity = jsonRoundTrip(artifact.identity, `${label} identity`)
	const registeredIdentityPublication = jsonRoundTrip(
		registeredIdentity,
		`${label} registered identity`,
	)
	if (!isDeepStrictEqual(identity, registeredIdentityPublication) ||
		completePaletteReviewCanonicalJson(identity) !==
			completePaletteReviewCanonicalJson(registeredIdentityPublication)) {
		throw new Error(`${label} does not use the registered ${registeredAttemptLabel(
			registeredIdentity.attemptId)} attempt configuration identity`)
	}
	const source = artifact.source
	if (!isObject(source) || !Number.isSafeInteger(source.width) || (source.width as number) < 1 ||
		!Number.isSafeInteger(source.height) || (source.height as number) < 1 ||
		decodedDimensions.width !== source.width || decodedDimensions.height !== source.height) {
		throw new Error(`${label} decoded dimensions do not match the normalized artifact`)
	}
	const reproducedPublication = jsonRoundTrip(reproducedOutput, `${label} reproduced output`)
	const artifactPublication = jsonRoundTrip(artifact.output, `${label} artifact output`)
	if (!isObject(reproducedPublication) || !isObject(reproducedPublication.dimensions) ||
		reproducedPublication.dimensions.width !== source.width ||
		reproducedPublication.dimensions.height !== source.height ||
		!isObject(artifactPublication) || !isObject(artifactPublication.dimensions) ||
		artifactPublication.dimensions.width !== source.width ||
		artifactPublication.dimensions.height !== source.height) {
		throw new Error(`${label} publication dimensions do not match the normalized artifact`)
	}
	if (!isDeepStrictEqual(reproducedPublication, artifactPublication) ||
		completePaletteReviewCanonicalJson(reproducedPublication) !==
			completePaletteReviewCanonicalJson(artifactPublication)) {
		throw new Error(`${label} output is not an exact source-bound reproduction of the registered attempt`)
	}
}

export function verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication(
	reproducedOutput: unknown,
	decodedDimensions: Readonly<{ width: number; height: number }>,
	artifact: Readonly<{ source: unknown; identity: unknown; output: unknown }>,
	label: string,
): void {
	verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication(
		reproducedOutput,
		decodedDimensions,
		artifact,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT.identity,
		label,
	)
}

function reviewTitle(mode: CompletePaletteReviewMode, candidateAttemptId: string, anchorId: string): string {
	const title = `Phase 3 ${candidateAttemptId} vs ${anchorId} ${mode} review`
	if (title.length <= 200) return title
	const identity = Buffer.from(`${candidateAttemptId}\0${anchorId}`)
	return `Phase 3 ${mode} review: ${candidateAttemptId.slice(0, 60)} vs ${anchorId.slice(0, 60)} (${sha256(identity).slice(0, 16)})`
}

function validId(value: string, label: string): void {
	if (!/^[A-Za-z0-9._-]{1,160}$/u.test(value) || value === "." || value === "..") {
		throw new Error(`${label} is invalid: ${JSON.stringify(value)}`)
	}
}

function requiredOption(options: Map<string, string>, name: string): string {
	const value = options.get(name)
	if (!value) throw new Error(`Missing required ${name}`)
	return value
}

export function parseAlbumArtworkPaletteV2Phase3ReviewArguments(
	args: readonly string[],
): AlbumArtworkPaletteV2Phase3ReviewArguments {
	const aliases = new Map([
		["--iteration", "--iteration-directory"],
		["--iteration-dir", "--iteration-directory"],
		["--candidate", "--candidate-attempt"],
		["--candidate-attempt-id", "--candidate-attempt"],
		["--anchor-id", "--anchor"],
		["--output", "--output-directory"],
		["--output-dir", "--output-directory"],
		["--db", "--warehouse"],
		["--warehouse-db", "--warehouse"],
		["--minimal-review", "--minimal-review-report"],
		["--limit", "--maximum-cases"],
		["--max-cases", "--maximum-cases"],
	])
	const values = new Map<string, string>()
	const reviewCaseIds: string[] = []
	let all = false
	let start = 0
	if (args[0] !== undefined && !args[0].startsWith("--")) {
		if (args.length < 5 || args.slice(0, 5).some((value) => value.startsWith("--"))) {
			throw new Error("Positional usage requires iteration-directory candidate-attempt anchor mode output-directory")
		}
		for (const [name, value] of [
			["--iteration-directory", args[0]],
			["--candidate-attempt", args[1]],
			["--anchor", args[2]],
			["--mode", args[3]],
			["--output-directory", args[4]],
		] as const) values.set(name, value)
		start = 5
	}
	for (let index = start; index < args.length; index++) {
		const rawName = args[index]
		if (rawName === "--all") {
			if (all) throw new Error("Duplicate --all")
			all = true
			continue
		}
		if (rawName === "--review-case") {
			const caseId = args[++index]
			if (caseId === undefined || caseId.startsWith("--")) throw new Error("--review-case requires a value")
			validId(caseId, "Review case ID")
			reviewCaseIds.push(caseId)
			continue
		}
		if (!rawName.startsWith("--")) throw new Error(`Unexpected positional argument ${rawName}`)
		const name = aliases.get(rawName) ?? rawName
		if (!["--iteration-directory", "--candidate-attempt", "--anchor", "--mode", "--output-directory",
			"--warehouse", "--minimal-review-report", "--maximum-cases", "--working-expansion-manifest",
			"--pairwise-slate-anchor"].includes(name)) {
			throw new Error(`Unknown argument ${rawName}`)
		}
		const value = args[++index]
		if (value === undefined || value.startsWith("--")) throw new Error(`${rawName} requires a value`)
		if (values.has(name)) throw new Error(`Duplicate ${name}`)
		values.set(name, value)
	}
	const candidateAttemptId = requiredOption(values, "--candidate-attempt")
	const anchorId = requiredOption(values, "--anchor")
	validId(candidateAttemptId, "Candidate attempt ID")
	validId(anchorId, "Anchor ID")
	if (candidateAttemptId === anchorId) throw new Error("Candidate attempt ID and anchor ID must differ")
	const mode = requiredOption(values, "--mode")
	if (mode !== "absolute" && mode !== "pairwise") throw new Error("--mode must be absolute or pairwise")
	const pairwiseSlateAnchor = values.get("--pairwise-slate-anchor")
	if (pairwiseSlateAnchor !== undefined && pairwiseSlateAnchor !== "exact-foreground-carrier") {
		throw new Error("--pairwise-slate-anchor must be exact-foreground-carrier")
	}
	if (pairwiseSlateAnchor !== undefined && mode !== "pairwise") {
		throw new Error("--pairwise-slate-anchor is valid only in pairwise mode")
	}
	const maximumValue = values.get("--maximum-cases")
	if (all && maximumValue !== undefined) throw new Error("--all and --maximum-cases cannot be combined")
	if (all && reviewCaseIds.length > 0) throw new Error("--all and --review-case cannot be combined")
	if (new Set(reviewCaseIds).size !== reviewCaseIds.length) throw new Error("Duplicate --review-case is forbidden")
	const maximumCases = maximumValue === undefined
		? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_REVIEW_DEFAULT_MAXIMUM_CASES
		: Number(maximumValue)
	if (!Number.isSafeInteger(maximumCases) || maximumCases < 1 || maximumCases > 100) {
		throw new Error("--maximum-cases must be an integer from 1 through 100")
	}
	return {
		iterationDirectory: requiredOption(values, "--iteration-directory"),
		candidateAttemptId,
		anchorId,
		mode,
		outputDirectory: requiredOption(values, "--output-directory"),
		all,
		maximumCases,
		reviewCaseIds,
		...(values.get("--warehouse") ? { warehousePath: values.get("--warehouse")! } : {}),
		...(values.get("--minimal-review-report")
			? { minimalReviewReportPath: values.get("--minimal-review-report")! }
			: {}),
		...(values.get("--working-expansion-manifest")
			? { workingExpansionManifestPath: values.get("--working-expansion-manifest")! }
			: {}),
		...(pairwiseSlateAnchor ? { pairwiseSlateAnchor } : {}),
	}
}

async function regularFileBytes(path: string, label: string): Promise<Buffer> {
	const stats = await lstat(path)
	if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${path}`)
	return readFile(path)
}

async function readJson(path: string, label: string): Promise<unknown> {
	return JSON.parse((await regularFileBytes(path, label)).toString("utf8")) as unknown
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
		throw error
	}
}

function safeProjectFile(projectRoot: string, file: string, label: string): string {
	if (file.length < 1 || file.length > 1_000 || isAbsolute(file) || file.includes("\\")) {
		throw new Error(`${label} has an unsafe source file`)
	}
	const parts = file.split("/")
	if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
		throw new Error(`${label} has an unsafe source file`)
	}
	const absolute = resolve(projectRoot, file)
	const fromRoot = relative(projectRoot, absolute)
	if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
		throw new Error(`${label} source escaped the project root`)
	}
	return absolute
}

function stringField(value: JsonObject, key: string, label: string): string {
	if (typeof value[key] !== "string" || (value[key] as string).length === 0) {
		throw new Error(`${label}.${key} is invalid`)
	}
	return value[key] as string
}

function projectedTreatment(
	value: unknown,
	label: string,
	researchRender?: CompletePaletteReviewResearchRender,
): CompletePaletteReviewTreatment {
	if (!isObject(value)) throw new Error(`${label} is not a complete treatment`)
	const roleValues = isObject(value.roles) ? value.roles : value
	const roleColor = (role: "background" | "surface" | "foreground" | "accent") => {
		const color = roleValues[role]
		if (!isObject(color) || typeof color.hex !== "string" || !/^#[0-9a-f]{6}$/u.test(color.hex) ||
			typeof color.generated !== "boolean") {
			throw new Error(`${label}.${role} does not preserve a lowercase hex color and generated flag`)
		}
		return { hex: color.hex, generated: color.generated }
	}
	if (typeof value.gradient !== "boolean" || !isObject(value.collapse) ||
		typeof value.collapse.surface !== "boolean" || typeof value.collapse.accent !== "boolean") {
		throw new Error(`${label} does not preserve gradient and collapse state`)
	}
	return {
		roles: {
			background: roleColor("background"),
			surface: roleColor("surface"),
			foreground: roleColor("foreground"),
			accent: roleColor("accent"),
		},
		gradient: value.gradient,
		collapse: { surface: value.collapse.surface, accent: value.collapse.accent },
		...(researchRender ? { researchRender } : {}),
	}
}

function normalizedTreatment(
	value: unknown,
	label: string,
	researchRender?: CompletePaletteReviewResearchRender,
): NormalizedTreatment {
	if (!isObject(value)) throw new Error(`${label} is invalid`)
	return {
		key: stringField(value, "key", label),
		treatment: projectedTreatment(value.treatment, `${label}.treatment`, researchRender),
	}
}

function normalizedResult(
	value: unknown,
	label: string,
	winnerResearchRender?: CompletePaletteReviewResearchRender,
): NormalizedResult {
	if (!isObject(value) || !Array.isArray(value.alternatives)) throw new Error(`${label} is invalid`)
	const winner = normalizedTreatment(value.winner, `${label}.winner`, winnerResearchRender)
	return {
		winner,
		alternatives: value.alternatives.map((entry, index) =>
			normalizedTreatment(entry, `${label}.alternatives[${index}]`, isObject(entry) && entry.key === winner.key
				? winnerResearchRender : undefined)),
	}
}

function normalizedAttemptRecord(
	value: unknown,
	expectedAttemptId: string,
	label: string,
): NormalizedAttemptRecord {
	if (!isObject(value) || !isObject(value.identity) || value.identity.attemptId !== expectedAttemptId ||
		typeof value.identity.configurationId !== "string" || value.identity.configurationId.length === 0) {
		throw new Error(`${label} identity is invalid`)
	}
	return {
		identity: value.identity as { attemptId: string; configurationId: string },
		output: value.output,
	}
}

function normalizedAttemptResult(value: NormalizedAttemptRecord, label: string): NormalizedResult {
	const researchRender = projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value.output,
		value.identity,
		`${label} output`,
	)
	return normalizedResult(value.output, `${label} output`, researchRender)
}

function exactStringArray(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string") ||
		new Set(value).size !== value.length) {
		throw new Error(`${label} must be a unique string array`)
	}
	return value as string[]
}

function exactArray(first: readonly string[], second: readonly string[]): boolean {
	return completePaletteReviewCanonicalJson(first) === completePaletteReviewCanonicalJson(second)
}

function rawTreatmentEntry(value: unknown, label: string): Readonly<{ key: string; treatment: JsonObject }> {
	if (!isObject(value) || !isObject(value.treatment)) throw new Error(`${label} is not a complete raw treatment`)
	const key = stringField(value, "key", label)
	const treatment = value.treatment
	for (const role of ["background", "surface", "foreground", "accent"] as const) {
		const color = treatment[role]
		if (!isObject(color) || typeof color.hex !== "string" || !/^#[0-9a-f]{6}$/u.test(color.hex)) {
			throw new Error(`${label}.${role} does not preserve a lowercase raw hex`)
		}
	}
	if (typeof treatment.gradient !== "boolean") throw new Error(`${label}.gradient is invalid`)
	const canonicalKey = `${(treatment.background as JsonObject).hex}:${(treatment.surface as JsonObject).hex}:` +
		`${(treatment.foreground as JsonObject).hex}:${(treatment.accent as JsonObject).hex}:` +
		`${treatment.gradient ? "gradient" : "flat"}`
	if (key !== canonicalKey) throw new Error(`${label} key is stale relative to its complete raw treatment`)
	return { key, treatment }
}

function rawFamily(treatment: JsonObject, role: "background" | "surface" | "foreground" | "accent",
	label: string): string {
	if (!isObject(treatment.familyRoles)) throw new Error(`${label}.familyRoles is missing`)
	return stringField(treatment.familyRoles, role, `${label}.familyRoles`)
}

function rawHex(treatment: JsonObject, role: "background" | "surface" | "foreground" | "accent"): string {
	return (treatment[role] as JsonObject).hex as string
}

function rawGradientIdentity(treatment: JsonObject, label: string): string {
	if (treatment.gradient === false) return "flat"
	if (!isObject(treatment.gradientEvidence)) throw new Error(`${label}.gradientEvidence is missing`)
	return `${stringField(treatment.gradientEvidence, "topology", `${label}.gradientEvidence`)}\0` +
		stringField(treatment.gradientEvidence, "direction", `${label}.gradientEvidence`)
}

function validateExactForegroundCarrierStructure(
	candidate: JsonObject,
	carrier: JsonObject,
	label: string,
): void {
	for (const field of ["sourceFieldHypothesisId", "fieldTreatment"] as const) {
		if (stringField(candidate, field, `${label} candidate`) !== stringField(carrier, field, `${label} carrier`)) {
			throw new Error(`${label} candidate and carrier differ in ${field}`)
		}
	}
	for (const role of ["background", "surface", "accent"] as const) {
		if (rawFamily(candidate, role, `${label} candidate`) !== rawFamily(carrier, role, `${label} carrier`) ||
			rawHex(candidate, role) !== rawHex(carrier, role)) {
			throw new Error(`${label} candidate and carrier differ in ${role} family or hex`)
		}
	}
	if (candidate.gradient !== carrier.gradient ||
		rawGradientIdentity(candidate, `${label} candidate`) !== rawGradientIdentity(carrier, `${label} carrier`)) {
		throw new Error(`${label} candidate and carrier differ in gradient topology or direction`)
	}
	if (!isObject(candidate.collapse) || !isObject(carrier.collapse) ||
		typeof candidate.collapse.surface !== "boolean" || typeof candidate.collapse.accent !== "boolean" ||
		typeof carrier.collapse.surface !== "boolean" || typeof carrier.collapse.accent !== "boolean" ||
		candidate.collapse.surface !== carrier.collapse.surface || candidate.collapse.accent !== carrier.collapse.accent) {
		throw new Error(`${label} candidate and carrier differ in collapse`)
	}
	if (rawFamily(candidate, "foreground", `${label} candidate`) ===
			rawFamily(carrier, "foreground", `${label} carrier`) &&
		rawHex(candidate, "foreground") === rawHex(carrier, "foreground")) {
		throw new Error(`${label} candidate does not differ from its carrier in foreground family or hex`)
	}
}

function exactForegroundCarrierBinding(
	candidateRecord: JsonObject,
	comparisonAnchorOutput: unknown,
	candidate: NormalizedResult,
	anchor: NormalizedResult,
	configurationId: string,
	caseId: string,
): LoadedCase["exactForegroundCarrier"] {
	const label = `Case ${caseId} exact-foreground-carrier diagnostics`
	if (!isObject(candidateRecord.output) || !isObject(comparisonAnchorOutput)) {
		throw new Error(`${label} cannot bind incomplete outputs`)
	}
	const candidateOutput = candidateRecord.output
	if (!isObject(candidateOutput.diagnostics) ||
		!isObject(candidateOutput.diagnostics.phase3SourceLightForegroundReserve)) {
		throw new Error(`${label} are missing`)
	}
	const diagnostic = candidateOutput.diagnostics.phase3SourceLightForegroundReserve
	if (diagnostic.version !== SOURCE_LIGHT_FOREGROUND_RESERVE_DIAGNOSTICS_VERSION ||
		diagnostic.configurationId !== configurationId || !isObject(diagnostic.sourceLightForegroundReserve)) {
		throw new Error(`${label} wrapper is stale or unsupported`)
	}
	const reserve = diagnostic.sourceLightForegroundReserve
	if (reserve.version !== SOURCE_LIGHT_FOREGROUND_RESERVE_VERSION || !isObject(reserve.identities) ||
		reserve.identities.canonicalTreatment !== "canonical-role-hex-and-gradient-v1" ||
		reserve.identities.exactCarrier !== EXACT_FOREGROUND_CARRIER_ID || !isObject(reserve.policy) ||
		reserve.policy.maximumReservedTreatments !== 1 ||
		reserve.policy.baselineMutation !== "append-or-replace-last-only" || !isObject(reserve.baseline) ||
		!isObject(reserve.outcome)) {
		throw new Error(`${label} contract is stale or unsupported`)
	}
	if (!Array.isArray(candidateOutput.alternatives) || !Array.isArray(comparisonAnchorOutput.alternatives)) {
		throw new Error(`${label} cannot bind incomplete slates`)
	}
	const rawCandidateEntries = candidateOutput.alternatives.map((entry, index) =>
		rawTreatmentEntry(entry, `Case ${caseId} candidate output alternatives[${index}]`))
	const rawAnchorEntries = comparisonAnchorOutput.alternatives.map((entry, index) =>
		rawTreatmentEntry(entry, `Case ${caseId} comparison anchor output alternatives[${index}]`))
	const candidateKeys = rawCandidateEntries.map(({ key }) => key)
	const anchorKeys = rawAnchorEntries.map(({ key }) => key)
	if (new Set(candidateKeys).size !== candidateKeys.length || new Set(anchorKeys).size !== anchorKeys.length) {
		throw new Error(`${label} cannot bind duplicated slate keys`)
	}
	const baselineKeys = exactStringArray(reserve.baseline.slateKeys, `${label}.baseline.slateKeys`)
	const outputKeys = exactStringArray(reserve.outcome.outputSlateKeys, `${label}.outcome.outputSlateKeys`)
	if (!exactArray(baselineKeys, anchorKeys) || !exactArray(outputKeys, candidateKeys)) {
		throw new Error(`${label} slate custody is stale for the compared outputs`)
	}
	const rawCandidateWinner = rawTreatmentEntry(candidateOutput.winner, `Case ${caseId} candidate output winner`)
	const rawAnchorWinner = rawTreatmentEntry(comparisonAnchorOutput.winner, `Case ${caseId} comparison anchor output winner`)
	if (candidate.winner.key !== anchor.winner.key || rawCandidateWinner.key !== rawAnchorWinner.key ||
		reserve.baseline.winnerKey !== rawAnchorWinner.key || reserve.outcome.winnerKey !== rawCandidateWinner.key ||
		reserve.outcome.winnerPreserved !== true) {
		throw new Error(`${label} cannot use a winner change as a slate task`)
	}
	if (typeof reserve.outcome.exactNoOp !== "boolean") throw new Error(`${label}.outcome.exactNoOp is invalid`)
	if (reserve.outcome.exactNoOp) {
		if (reserve.outcome.reservedKey !== null || reserve.outcome.reservedCarrierKey !== null ||
			reserve.outcome.reservedCarrierIndex !== null || reserve.outcome.replacedKey !== null ||
			reserve.outcome.matchedCarrierPreserved !== null || !exactArray(candidateKeys, anchorKeys)) {
			throw new Error(`${label} no-op outcome is stale or tampered`)
		}
		return undefined
	}
	const reservedKey = stringField(reserve.outcome, "reservedKey", `${label}.outcome`)
	const reservedCarrierKey = stringField(reserve.outcome, "reservedCarrierKey", `${label}.outcome`)
	const addedKeys = candidateKeys.filter((key) => !new Set(anchorKeys).has(key))
	if (addedKeys.length !== 1 || addedKeys[0] !== reservedKey) {
		throw new Error(`${label} must bind exactly one relevant added candidate`)
	}
	const carrierIndex = anchorKeys.indexOf(reservedCarrierKey)
	if (carrierIndex < 0 || reserve.outcome.reservedCarrierIndex !== carrierIndex) {
		throw new Error(`${label} carrier is absent from or stale for the comparison anchor slate`)
	}
	const replacedKey = reserve.outcome.replacedKey
	if (replacedKey === null) {
		if (!exactArray(candidateKeys, [...anchorKeys, reservedKey])) {
			throw new Error(`${label} append mutation is stale or tampered`)
		}
	} else if (typeof replacedKey !== "string" || replacedKey !== anchorKeys.at(-1) ||
		!exactArray(candidateKeys, [...anchorKeys.slice(0, -1), reservedKey])) {
		throw new Error(`${label} replacement mutation is stale or tampered`)
	}
	if (reserve.outcome.baselinePrefixPreserved !== true || reserve.outcome.matchedCarrierPreserved !== true ||
		!candidateKeys.includes(reservedCarrierKey)) {
		throw new Error(`${label} does not preserve its baseline prefix and matched carrier`)
	}
	if (!Array.isArray(reserve.candidates) || !Array.isArray(reserve.eligibleReserveKeysInOrder)) {
		throw new Error(`${label} candidate diagnostics are missing`)
	}
	const selectedDiagnostics = reserve.candidates.filter((entry) => isObject(entry) && entry.key === reservedKey)
	const requiredGates = [
		"materializedKeyCanonical",
		"qualityEvaluationAvailable",
		"completeLineageDiagnosticAvailable",
		"fieldConditionalRoleEvidenceAvailable",
		"foregroundFamilyEvidenceAvailable",
		"rolePreferenceForeground",
		"lightForegroundEvidenceAtLeastMinimum",
		"familyConcentrationAtLeastMinimum",
		"withinQualityLossMaximum",
		"foregroundApcaSamplesAvailableAndFinite",
		"foregroundApcaSamplesAllNonpositive",
		"foregroundApcaHasNegativeSample",
		"ordinaryCompleteLineageEligible",
		"exactCurrentSlateCarrierAvailable",
		"foregroundChangesRelativeToCarrier",
		"candidateAbsentFromSlate",
		"matchedCarrierPreservedByCapacityAction",
	] as const
	if (selectedDiagnostics.length !== 1 || !isObject(selectedDiagnostics[0]) ||
		selectedDiagnostics[0].carrierKey !== reservedCarrierKey ||
		selectedDiagnostics[0].carrierIndex !== carrierIndex || selectedDiagnostics[0].eligible !== true ||
		!isObject(selectedDiagnostics[0].gates) ||
		Object.keys(selectedDiagnostics[0].gates).length !== requiredGates.length ||
		!requiredGates.every((gate) => selectedDiagnostics[0].gates[gate] === true) ||
		!Array.isArray(selectedDiagnostics[0].rejectionReasons) || selectedDiagnostics[0].rejectionReasons.length !== 0 ||
		reserve.eligibleReserveKeysInOrder[0] !== reservedKey) {
		throw new Error(`${label} selected candidate diagnostic is stale or tampered`)
	}
	const rawCandidate = rawCandidateEntries.find(({ key }) => key === reservedKey)!
	const rawCarrier = rawAnchorEntries[carrierIndex]
	validateExactForegroundCarrierStructure(rawCandidate.treatment, rawCarrier.treatment, label)
	const normalizedCandidate = candidate.alternatives.find(({ key }) => key === reservedKey)
	const normalizedCarrier = anchor.alternatives.find(({ key }) => key === reservedCarrierKey)
	if (!normalizedCandidate || !normalizedCarrier) throw new Error(`${label} normalized binding is stale`)
	return {
		candidate: normalizedCandidate,
		carrier: normalizedCarrier,
		slateIndex: candidateKeys.indexOf(reservedKey),
	}
}

function visibleKey(treatment: CompletePaletteReviewTreatment): string {
	return completePaletteReviewCanonicalJson(treatment)
}

function panelSources(value: unknown): Map<string, SourceBinding> {
	if (!isObject(value) || !Array.isArray(value.sources)) throw new Error("Development panel is invalid")
	const result = new Map<string, SourceBinding>()
	for (const [index, entry] of value.sources.entries()) {
		if (!isObject(entry)) throw new Error(`Development panel source ${index} is invalid`)
		const caseId = stringField(entry, "caseId", `Development panel source ${index}`)
		const file = stringField(entry, "path", `Development panel source ${index}`)
		const sourceSha256 = stringField(entry, "sha256", `Development panel source ${index}`)
		if (!/^[0-9a-f]{64}$/u.test(sourceSha256) || !Number.isSafeInteger(entry.byteCount) ||
			(entry.byteCount as number) < 1 || result.has(caseId)) {
			throw new Error(`Development panel source ${index} is invalid or duplicated`)
		}
		result.set(caseId, { caseId, file, sha256: sourceSha256, bytes: entry.byteCount as number })
	}
	return result
}

async function loadPanel(path: string): Promise<Map<string, SourceBinding>> {
	if (!await pathExists(path)) return new Map()
	return panelSources(await readJson(path, "Development panel"))
}

async function sourceBinding(
	projectRoot: string,
	caseId: string,
	source: JsonObject,
	panel: ReadonlyMap<string, SourceBinding>,
): Promise<SourceCustody> {
	const sourceSha256 = stringField(source, "sha256", `Case ${caseId} source`)
	const bytesValue = source.bytes ?? source.byteCount
	if (!/^[0-9a-f]{64}$/u.test(sourceSha256) || !Number.isSafeInteger(bytesValue) || (bytesValue as number) < 1) {
		throw new Error(`Case ${caseId} source hash or byte count is invalid`)
	}
	const panelSource = panel.get(caseId)
	const carriedFile = typeof source.file === "string" ? source.file : typeof source.path === "string" ? source.path : undefined
	const file = carriedFile ?? panelSource?.file
	if (!file) throw new Error(`Case ${caseId} has no source file and no development-panel binding`)
	if (panelSource && (panelSource.sha256 !== sourceSha256 || panelSource.bytes !== bytesValue ||
		(carriedFile !== undefined && carriedFile !== panelSource.file))) {
		throw new Error(`Case ${caseId} conflicts with its development-panel source binding`)
	}
	const absolute = safeProjectFile(projectRoot, file, `Case ${caseId}`)
	const realProjectRoot = await realpath(projectRoot)
	const realSource = await realpath(absolute)
	if (realProjectRoot !== projectRoot || realSource !== absolute) {
		throw new Error(`Case ${caseId} artwork path must not contain project-root, ancestor, or terminal symlinks`)
	}
	const sourceBytes = await regularFileBytes(absolute, `Case ${caseId} artwork`)
	if (sourceBytes.byteLength !== bytesValue || sha256(sourceBytes) !== sourceSha256) {
		throw new Error(`Case ${caseId} artwork custody does not match the normalized artifact`)
	}
	return {
		binding: { caseId, file, sha256: sourceSha256, bytes: bytesValue as number },
		bytes: sourceBytes,
	}
}

async function loadCase(
	path: string,
	expectedCaseId: string,
	candidateAttemptId: string,
	anchorId: string,
	projectRoot: string,
	panel: ReadonlyMap<string, SourceBinding>,
	pairwiseSlateAnchor?: AlbumArtworkPaletteV2Phase3ReviewPairwiseSlateAnchor,
): Promise<LoadedCase> {
	const value = await readJson(path, `Normalized case ${expectedCaseId}`)
	if (!isObject(value) || value.schemaVersion !== 1 || value.contractId !== PHASE_3_CONTRACT_ID ||
		!isObject(value.source) || !isObject(value.anchor) || !Array.isArray(value.attempts)) {
		throw new Error(`Normalized case ${expectedCaseId} has an invalid Phase 3 contract`)
	}
	const caseId = stringField(value.source, "caseId", `Normalized case ${expectedCaseId} source`)
	validId(caseId, "Normalized case ID")
	if (caseId !== expectedCaseId) throw new Error(`Normalized case file for ${expectedCaseId} contains ${caseId}`)
	const matches = value.attempts.filter((attempt) => isObject(attempt) && isObject(attempt.identity) &&
		attempt.identity.attemptId === candidateAttemptId)
	if (matches.length !== 1 || !isObject(matches[0])) {
		throw new Error(`Case ${caseId} must contain exactly one attempt ${candidateAttemptId}`)
	}
	const candidateRecord = matches[0]
	const candidateAttempt = normalizedAttemptRecord(candidateRecord, candidateAttemptId, `Case ${caseId} candidate`)
	if (!isObject(candidateRecord.materialDelta) || !isObject(candidateRecord.materialDelta.winner) ||
		typeof candidateRecord.materialDelta.winner.changed !== "boolean" ||
		!Array.isArray(candidateRecord.materialDelta.addedAlternativeKeys) ||
		!candidateRecord.materialDelta.addedAlternativeKeys.every((key) => typeof key === "string")) {
		throw new Error(`Case ${caseId} candidate material delta is invalid`)
	}
	if (!isObject(value.anchor.identity) || typeof value.anchor.identity.anchorId !== "string") {
		throw new Error(`Case ${caseId} closed anchor identity is invalid`)
	}
	const closedAnchor = normalizedResult(value.anchor.output, `Case ${caseId} closed anchor output`)
	const comparisonAnchorAttempt = value.anchor.identity.anchorId === anchorId
		? undefined
		: (() => {
			const anchorMatches = value.attempts.filter((attempt) => isObject(attempt) &&
				isObject(attempt.identity) && attempt.identity.attemptId === anchorId)
			if (anchorMatches.length !== 1 || !isObject(anchorMatches[0])) {
				throw new Error(`Case ${caseId} does not contain exactly one comparison anchor ${anchorId}`)
			}
			return normalizedAttemptRecord(anchorMatches[0], anchorId, `Case ${caseId} comparison anchor`)
		})()
	const comparisonAnchorOutput = comparisonAnchorAttempt?.output ?? value.anchor.output
	const sourceCustody = await sourceBinding(projectRoot, caseId, value.source, panel)
	const sourceBoundAttempt = SOURCE_BOUND_PUBLICATION_ATTEMPTS.find(({ identity }) =>
		identity.attemptId === candidateAttemptId)
	if (sourceBoundAttempt !== undefined) {
		const image = await loadNativeImage(sourceCustody.bytes)
		verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication(
			normalizeAlbumArtworkPaletteV2Phase3Result(
				sourceBoundAttempt.extract(image),
			),
			image,
			{ source: value.source, identity: candidateAttempt.identity, output: candidateAttempt.output },
			sourceBoundAttempt.identity,
			`Case ${caseId} candidate`,
		)
	}
	const candidate = normalizedAttemptResult(candidateAttempt, `Case ${caseId} candidate`)
	const anchor = comparisonAnchorAttempt === undefined
		? closedAnchor
		: normalizedAttemptResult(comparisonAnchorAttempt, `Case ${caseId} comparison anchor`)
	if (candidateRecord.materialDelta.winner.anchorKey !== closedAnchor.winner.key ||
		candidateRecord.materialDelta.winner.candidateKey !== candidate.winner.key ||
		candidateRecord.materialDelta.winner.changed !== (closedAnchor.winner.key !== candidate.winner.key)) {
		throw new Error(`Case ${caseId} candidate winner delta is stale`)
	}
	const closedAnchorAlternativeKeys = new Set(closedAnchor.alternatives.map(({ key }) => key))
	const expectedAddedKeys = candidate.alternatives.map(({ key }) => key)
		.filter((key) => !closedAnchorAlternativeKeys.has(key))
	const addedKeys = candidateRecord.materialDelta.addedAlternativeKeys as string[]
	if (new Set(addedKeys).size !== addedKeys.length || completePaletteReviewCanonicalJson(addedKeys) !==
		completePaletteReviewCanonicalJson(expectedAddedKeys)) {
		throw new Error(`Case ${caseId} candidate alternative delta is stale`)
	}
	const comparisonAnchorAlternativeKeys = new Set(anchor.alternatives.map(({ key }) => key))
	const exactForegroundCarrier = pairwiseSlateAnchor === "exact-foreground-carrier"
		? exactForegroundCarrierBinding(
			candidateRecord,
			comparisonAnchorOutput,
			candidate,
			anchor,
			candidateAttempt.identity.configurationId,
			caseId,
		)
		: undefined
	return {
		source: sourceCustody.binding,
		anchor,
		candidate,
		addedAlternativeKeys: new Set(candidate.alternatives.map(({ key }) => key)
			.filter((key) => !comparisonAnchorAlternativeKeys.has(key))),
		winnerChanged: anchor.winner.key !== candidate.winner.key,
		...(exactForegroundCarrier ? { exactForegroundCarrier } : {}),
	}
}

async function loadIterationCases(options: AlbumArtworkPaletteV2Phase3ReviewOptions, projectRoot: string): Promise<LoadedCase[]> {
	const iterationDirectory = resolve(options.iterationDirectory)
	const iteration = await readJson(resolve(iterationDirectory, "iteration.json"), "Phase 3 iteration")
	if (!isObject(iteration) || iteration.schemaVersion !== 1 || iteration.contractId !== PHASE_3_CONTRACT_ID ||
		!Array.isArray(iteration.sources) || iteration.sources.length === 0) {
		throw new Error("Phase 3 iteration manifest is invalid or empty")
	}
	if (iteration.sources.length > PHASE_3_MAXIMUM_ITERATION_CASES) {
		throw new Error(`Phase 3 iteration manifest exceeds the runner maximum of ${PHASE_3_MAXIMUM_ITERATION_CASES} cases`)
	}
	const entries = iteration.sources.map((entry, index) => {
		if (!isObject(entry)) throw new Error(`Phase 3 iteration source ${index} is invalid`)
		const caseId = stringField(entry, "caseId", `Phase 3 iteration source ${index}`)
		const file = stringField(entry, "file", `Phase 3 iteration source ${index}`)
		validId(caseId, "Phase 3 iteration case ID")
		if (!/^[A-Za-z0-9._-]+\.json$/u.test(file)) throw new Error(`Unsafe normalized case file ${file}`)
		return { caseId, file, entry }
	}).sort((first, second) => ascii(first.caseId, second.caseId) || ascii(first.file, second.file))
	if (new Set(entries.map(({ caseId }) => caseId)).size !== entries.length) {
		throw new Error("Phase 3 iteration contains duplicate case IDs")
	}
	let panel: ReadonlyMap<string, SourceBinding>
	let selectedEntries = entries
	if (options.workingExpansionManifestPath !== undefined) {
		const manifest = await readAndVerifyPhase3WorkingExpansionManifest(options.workingExpansionManifestPath)
		if (!isObject(iteration.sourceAuthorization) || iteration.sourceAuthorization.mode !== "working-expansion" ||
			iteration.sourceAuthorization.manifestId !== manifest.manifestId) {
			throw new Error("Phase 3 working-expansion iteration authorization does not match the verified manifest")
		}
		panel = new Map(manifest.expansionGroup.sources.map((source) => [source.caseId, {
			caseId: source.caseId,
			file: source.path,
			sha256: source.sha256,
			bytes: source.byteCount,
		}]))
		for (const { caseId, entry } of entries) {
			const authorized = panel.get(caseId)
			if (!authorized || entry.sourceSha256 !== authorized.sha256) {
				throw new Error(`Case ${caseId} is not exactly bound to the verified working-expansion manifest`)
			}
		}
		if (options.reviewCaseIds.length > 0) {
			const requestedSources = new Set<string>()
			for (const reviewCaseId of options.reviewCaseIds) {
				const matches = entries.filter(({ caseId }) => reviewCaseId.startsWith(`${caseId}.`))
				if (matches.length !== 1) throw new Error(`Explicit review case has no aligned working-expansion source: ${reviewCaseId}`)
				requestedSources.add(matches[0].caseId)
			}
			selectedEntries = entries.filter(({ caseId }) => requestedSources.has(caseId))
		}
	} else {
		if (iteration.sourceAuthorization !== undefined || entries.some(({ caseId }) =>
			/^working-expansion-[0-9]{2}$/u.test(caseId))) {
			throw new Error("Working-expansion review requires an explicit verified --working-expansion-manifest")
		}
		const panelPath = options.developmentPanelPath ??
			resolve(projectRoot, "research/data/album-artwork-palette-v2-development-panel.json")
		panel = await loadPanel(panelPath)
	}
	const loaded: LoadedCase[] = []
	for (const { caseId, file } of selectedEntries) {
		loaded.push(await loadCase(
			resolve(iterationDirectory, file),
			caseId,
			options.candidateAttemptId,
			options.anchorId,
			projectRoot,
			panel,
			options.pairwiseSlateAnchor,
		))
	}
	return loaded
}

function reviewCaseId(sourceCaseId: string, kind: QueueTask["kind"], slateIndex: number | null): string {
	const suffix = kind === "winner" ? "winner" : `slate-${String((slateIndex ?? 0) + 1).padStart(2, "0")}`
	const value = `${sourceCaseId}.${suffix}`
	validId(value, "Review case ID")
	return value
}

function buildTasks(cases: readonly LoadedCase[], mode: CompletePaletteReviewMode,
	pairwiseSlateAnchor?: AlbumArtworkPaletteV2Phase3ReviewPairwiseSlateAnchor): QueueTask[] {
	const grouped = new Map<string, Omit<QueueTask, "caseId">>()
	const add = (entry: LoadedCase, candidate: CompletePaletteReviewTreatment, kind: QueueTask["kind"],
		slateIndex: number | null, exactAnchor?: CompletePaletteReviewTreatment): void => {
		const anchor = exactAnchor ?? entry.anchor.winner.treatment
		if (visibleKey(candidate) === visibleKey(anchor)) return
		const groupingKey = `${entry.source.sha256}\0${visibleKey(candidate)}${mode === "pairwise" ? `\0${visibleKey(anchor)}` : ""}`
		if (grouped.has(groupingKey)) return
		grouped.set(groupingKey, {
			sourceCaseId: entry.source.caseId,
			source: { file: entry.source.file, sha256: entry.source.sha256, bytes: entry.source.bytes },
			kind,
			slateIndex,
			candidate,
			anchor,
		})
	}
	if (pairwiseSlateAnchor === "exact-foreground-carrier") {
		for (const entry of cases) {
			if (entry.exactForegroundCarrier) add(
				entry,
				entry.exactForegroundCarrier.candidate.treatment,
				"slate",
				entry.exactForegroundCarrier.slateIndex,
				entry.exactForegroundCarrier.carrier.treatment,
			)
		}
		return [...grouped.values()].map((task) => ({
			...task,
			caseId: reviewCaseId(task.sourceCaseId, task.kind, task.slateIndex),
		}))
	}
	for (const entry of cases) {
		if (entry.winnerChanged || visibleKey(entry.candidate.winner.treatment) !==
			visibleKey(entry.anchor.winner.treatment)) add(entry, entry.candidate.winner.treatment, "winner", null)
	}
	const maximumSlateLength = Math.max(0, ...cases.map(({ candidate }) => candidate.alternatives.length))
	for (let slateIndex = 0; slateIndex < maximumSlateLength; slateIndex++) {
		for (const entry of cases) {
			const alternative = entry.candidate.alternatives[slateIndex]
			if (alternative && entry.addedAlternativeKeys.has(alternative.key)) {
				const anchorKeys = new Set([
					visibleKey(entry.anchor.winner.treatment),
					...entry.anchor.alternatives.map(({ treatment }) => visibleKey(treatment)),
				])
				if (!anchorKeys.has(visibleKey(alternative.treatment))) add(entry, alternative.treatment, "slate", slateIndex)
			}
		}
	}
	return [...grouped.values()].map((task) => ({
		...task,
		caseId: reviewCaseId(task.sourceCaseId, task.kind, task.slateIndex),
	}))
}

function evidenceCandidates(tasks: readonly QueueTask[]): CandidateTreatment[] {
	return candidateTreatments({
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
		candidates: tasks.map((task) => ({
			caseId: task.caseId,
			sourceSha256: task.source.sha256,
			treatment: task.candidate,
		})),
	})
}

function unavailableEvidenceReport(candidates: readonly CandidateTreatment[]): JsonObject {
	return {
		candidateCount: candidates.length,
		excludedCount: 0,
		reviewNeededCount: candidates.length,
		reviewWorkAvoidedCount: 0,
		artworkHistory: [],
		entries: candidates.map((candidate) => ({
			caseId: candidate.caseId,
			sourceSha256: candidate.sourceSha256,
			treatmentIdentity: candidate.treatmentIdentity,
			renderVariantId: candidate.renderVariantId,
			status: "warehouse-unavailable",
			reviewNeeded: true,
			exactQualities: [],
			exactJudgments: [],
			relatedVisibleTreatmentJudgments: 0,
		})),
	}
}

function highestInformationTaskPerSource(tasks: readonly QueueTask[]): QueueTask[] {
	const seen = new Set<string>()
	return tasks.filter(({ source }) => {
		if (seen.has(source.sha256)) return false
		seen.add(source.sha256)
		return true
	})
}

function explicitlySelectedTasks(
	tasks: readonly QueueTask[],
	reviewCaseIds: readonly string[],
	maximumCases: number,
): QueueTask[] {
	if (reviewCaseIds.length > maximumCases) {
		throw new Error("Explicit review cases exceed the review maximum")
	}
	const byCaseId = new Map(tasks.map((task) => [task.caseId, task]))
	const selected = reviewCaseIds.map((caseId) => {
		const task = byCaseId.get(caseId)
		if (!task) throw new Error(`Explicit review case is unavailable or already resolved: ${caseId}`)
		return task
	})
	return selected
}

function validatedEvidenceEntries(value: unknown, candidates: readonly CandidateTreatment[]): MinimalReviewEntry[] {
	if (!isObject(value) || !Array.isArray(value.entries) || value.entries.length !== candidates.length ||
		value.candidateCount !== candidates.length) {
		throw new Error("Minimal-review report does not cover the complete candidate queue")
	}
	const byCaseId = new Map(candidates.map((candidate) => [candidate.caseId, candidate]))
	const seen = new Set<string>()
	const entries = value.entries.map((entry, index) => {
		if (!isObject(entry) || typeof entry.caseId !== "string" || typeof entry.sourceSha256 !== "string" ||
			typeof entry.treatmentIdentity !== "string" || typeof entry.renderVariantId !== "string" ||
			typeof entry.status !== "string" || typeof entry.reviewNeeded !== "boolean") {
			throw new Error(`Minimal-review report entry ${index} is invalid`)
		}
		const candidate = byCaseId.get(entry.caseId)
		if (!candidate || seen.has(entry.caseId) || candidate.sourceSha256 !== entry.sourceSha256 ||
			candidate.treatmentIdentity !== entry.treatmentIdentity || candidate.renderVariantId !== entry.renderVariantId) {
			throw new Error(`Minimal-review report entry ${index} is stale or duplicated`)
		}
		if (!entry.reviewNeeded && entry.status !== "exact-evidence-reused" && entry.status !== "excluded-source") {
			throw new Error(`Minimal-review report entry ${index} cannot avoid review with status ${entry.status}`)
		}
		seen.add(entry.caseId)
		return entry as unknown as MinimalReviewEntry
	})
	if (seen.size !== candidates.length) throw new Error("Minimal-review report omits candidate treatments")
	const excludedCount = entries.filter(({ status }) => status === "excluded-source").length
	const considered = entries.filter(({ status }) => status !== "excluded-source")
	if (value.excludedCount !== excludedCount ||
		value.reviewNeededCount !== considered.filter(({ reviewNeeded }) => reviewNeeded).length ||
		value.reviewWorkAvoidedCount !== considered.filter(({ reviewNeeded }) => !reviewNeeded).length) {
		throw new Error("Minimal-review report summary is stale")
	}
	return entries
}

async function evidenceReport(
	options: AlbumArtworkPaletteV2Phase3ReviewOptions,
	projectRoot: string,
	candidates: readonly CandidateTreatment[],
): Promise<Readonly<{ report: JsonObject; entries: readonly MinimalReviewEntry[]; warehouseUsed: boolean }>> {
	let report: unknown
	let warehouseUsed = false
	if (options.minimalReviewReportPath) {
		report = await readJson(resolve(options.minimalReviewReportPath), "Minimal-review report")
		warehouseUsed = true
	} else {
		const warehousePath = resolve(options.warehousePath ?? resolve(projectRoot, defaultWarehouseRelativePath))
		if (await pathExists(warehousePath)) {
			const stats = await lstat(warehousePath)
			if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Review warehouse is not a regular file: ${warehousePath}`)
			const database = openWarehouse(warehousePath)
			try {
				report = minimalReviewNeed(database, [...candidates])
				warehouseUsed = true
			} finally {
				database.close()
			}
		} else {
			report = unavailableEvidenceReport(candidates)
		}
	}
	invariant(isObject(report), "Minimal-review report is invalid")
	return { report, entries: validatedEvidenceEntries(report, candidates), warehouseUsed }
}

function buildManifest(
	tasks: readonly QueueTask[],
	mode: CompletePaletteReviewMode,
	candidateAttemptId: string,
	anchorId: string,
): CompletePaletteReviewManifest {
	const base = {
		schemaVersion: 1 as const,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
		title: reviewTitle(mode, candidateAttemptId, anchorId),
		mode,
		blinded: false,
	}
	const cases = mode === "absolute"
		? tasks.map((task, order) => ({
			caseId: task.caseId,
			order,
			source: task.source,
			treatment: task.candidate,
		}))
		: tasks.map((task, order) => ({
			caseId: task.caseId,
			order,
			source: task.source,
			options: { A: task.candidate, B: task.anchor },
			assignment: { A: "candidate", B: "anchor" },
		}))
	const identity = { ...base, cases } as Omit<CompletePaletteReviewManifest, "manifestId">
	const manifest = { ...identity, manifestId: completePaletteReviewManifestId(identity) } as CompletePaletteReviewManifest
	return parseCompletePaletteReviewManifest(manifest)
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await rename(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

export async function prepareAlbumArtworkPaletteV2Phase3Review(
	options: AlbumArtworkPaletteV2Phase3ReviewOptions,
): Promise<AlbumArtworkPaletteV2Phase3ReviewPreparation> {
	validId(options.candidateAttemptId, "Candidate attempt ID")
	validId(options.anchorId, "Anchor ID")
	if (options.candidateAttemptId === options.anchorId) throw new Error("Candidate attempt ID and anchor ID must differ")
	if (options.mode !== "absolute" && options.mode !== "pairwise") throw new Error("Review mode must be absolute or pairwise")
	if (options.pairwiseSlateAnchor !== undefined && options.pairwiseSlateAnchor !== "exact-foreground-carrier") {
		throw new Error("Pairwise slate anchor must be exact-foreground-carrier")
	}
	if (options.pairwiseSlateAnchor !== undefined && options.mode !== "pairwise") {
		throw new Error("Pairwise slate anchor is valid only in pairwise mode")
	}
	if (!Number.isSafeInteger(options.maximumCases) || options.maximumCases < 1 || options.maximumCases > 100) {
		throw new Error("Review maximum must be an integer from 1 through 100")
	}
	const projectRoot = resolve(options.projectRoot ?? fileURLToPath(new URL("..", import.meta.url)))
	const loaded = await loadIterationCases(options, projectRoot)
	const tasks = buildTasks(loaded, options.mode, options.pairwiseSlateAnchor)
	if (tasks.length === 0) throw new Error("No materially changed or novel complete treatments need review")
	const candidates = evidenceCandidates(tasks)
	const evidence = await evidenceReport(options, projectRoot, candidates)
	const neededCaseIds = new Set(evidence.entries.filter(({ reviewNeeded }) => reviewNeeded).map(({ caseId }) => caseId))
	const needed = tasks.filter(({ caseId }) => neededCaseIds.has(caseId))
	if (needed.length === 0) throw new Error("Exact compatible historical evidence resolves every review candidate")
	const selected = options.reviewCaseIds && options.reviewCaseIds.length > 0
		? explicitlySelectedTasks(needed, options.reviewCaseIds, options.maximumCases)
		: options.all
			? needed
			: highestInformationTaskPerSource(needed).slice(0, options.maximumCases)
	if (selected.length > 100) throw new Error("The shared review service accepts at most 100 cases per manifest")
	const manifest = buildManifest(selected, options.mode, options.candidateAttemptId, options.anchorId)
	const outputDirectory = resolve(options.outputDirectory)
	const manifestPath = resolve(outputDirectory, "manifest.json")
	const feedbackPath = resolve(outputDirectory, "feedback.json")
	const reportPath = resolve(outputDirectory, "minimal-review.json")
	let feedback: CompletePaletteReviewFeedbackStore = {
		schemaVersion: 1,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: manifest.manifestId,
		entries: [],
	}
	let feedbackExists = false
	if (await pathExists(feedbackPath)) {
		feedback = parseCompletePaletteReviewFeedbackStore(await readJson(feedbackPath, "Existing feedback store"), manifest)
		feedbackExists = true
	}
	await mkdir(outputDirectory, { recursive: true })
	await Promise.all([
		atomicJson(manifestPath, manifest),
		atomicJson(reportPath, evidence.report),
		...(feedbackExists ? [] : [atomicJson(feedbackPath, feedback)]),
	])
	return {
		manifestPath,
		feedbackPath,
		minimalReviewReportPath: reportPath,
		manifestId: manifest.manifestId,
		candidateCount: tasks.length,
		reviewNeededCount: needed.length,
		queuedCount: selected.length,
		reusedOrExcludedCount: tasks.length - needed.length,
		deferredByBoundCount: needed.length - selected.length,
		resumedFeedbackCount: feedback.entries.length,
		warehouseUsed: evidence.warehouseUsed,
	}
}

async function main(): Promise<void> {
	const parsed = parseAlbumArtworkPaletteV2Phase3ReviewArguments(process.argv.slice(2))
	const cwd = process.cwd()
	const result = await prepareAlbumArtworkPaletteV2Phase3Review({
		...parsed,
		iterationDirectory: resolve(cwd, parsed.iterationDirectory),
		outputDirectory: resolve(cwd, parsed.outputDirectory),
		...(parsed.warehousePath ? { warehousePath: resolve(cwd, parsed.warehousePath) } : {}),
		...(parsed.minimalReviewReportPath
			? { minimalReviewReportPath: resolve(cwd, parsed.minimalReviewReportPath) }
			: {}),
		...(parsed.workingExpansionManifestPath
			? { workingExpansionManifestPath: resolve(cwd, parsed.workingExpansionManifestPath) }
			: {}),
	})
	process.stdout.write(`${JSON.stringify({
		...result,
		manifestPath: relative(cwd, result.manifestPath),
		feedbackPath: relative(cwd, result.feedbackPath),
		minimalReviewReportPath: relative(cwd, result.minimalReviewReportPath),
	}, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
