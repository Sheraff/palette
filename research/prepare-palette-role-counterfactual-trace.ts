import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import {
	extractChromaticRolePaletteWithContext,
} from "./src/chromatic-role-extract.ts"
import type { Candidate } from "./src/candidates.ts"
import { nameRGB } from "./src/color-name.ts"
import { computeSemanticResultsSha256, validateSelectionManifest } from "./src/corpus-selection.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext } from "./src/extract.ts"
import { evaluateJointRoleCounterfactual } from "./src/joint-palette.ts"
import { loadImage } from "./src/image.ts"
import {
	PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT,
	PALETTE_ROLE_COUNTERFACTUAL_TRACE_OUTPUT,
	PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION,
	bindPaletteRoleCounterfactualCertificate,
	createPaletteRoleCounterfactualTrace,
	paletteRoleCounterfactualAlternativeId,
	paletteRoleCounterfactualCandidateKey,
	paletteRoleCounterfactualCandidatePoolIdentity,
	paletteRoleCounterfactualImplementationFiles,
	paletteRoleCounterfactualInputFiles,
	paletteRoleCounterfactualPolicy,
	paletteRoleCounterfactualRoles,
	paletteRoleCounterfactualTraceCounts,
	parsePaletteRoleCounterfactualTrace,
	presentPaletteRoleCounterfactualCandidate,
	type PaletteRoleCounterfactualAlternative,
	type PaletteRoleCounterfactualCandidateRecord,
	type PaletteRoleCounterfactualTraceCase,
	type PaletteRoleCounterfactualTraceIdentity,
} from "./src/palette-role-counterfactual-trace.ts"
import {
	PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	PALETTE_ROLE_00_AUDIT_ENTRY_COUNT,
	PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT,
	paletteRole00AuditBackgroundSurface,
	paletteRole00AuditRoles,
	parsePaletteRole00AuditFeedbackStore,
	parsePaletteRole00AuditManifest,
	validatePaletteRole00AuditSample,
	type PaletteRole00AuditFeedbackEntry,
	type PaletteRole00AuditPresentedPalette,
} from "./src/palette-role-00-audit.ts"
import type { CorpusResult, ExtractionResult, Palette, RoleName } from "./src/types.ts"

if (process.argv.length !== 2) throw new Error("Usage: prepare-palette-role-counterfactual-trace.ts")

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputPath = resolve(projectRoot, PALETTE_ROLE_COUNTERFACTUAL_TRACE_OUTPUT)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected fields`)
	}
}

function requireCondition(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function requireSha256(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`)
}

function normalizedImageSha256(image: { width: number; height: number; data: Uint8Array }): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`).update(image.data).digest("hex")
}

function scientificExtraction(extraction: ExtractionResult): Omit<ExtractionResult, "diagnostics"> & {
	diagnostics: Omit<ExtractionResult["diagnostics"], "processingMs">
} {
	return {
		...extraction,
		diagnostics: {
			regionCount: extraction.diagnostics.regionCount,
			candidateCount: extraction.diagnostics.candidateCount,
		},
	}
}

function presentPalette(palette: Palette): PaletteRole00AuditPresentedPalette {
	const roles = Object.fromEntries(paletteRole00AuditRoles.map((role) => {
		const descriptor = nameRGB(palette[role].rgb)
		requireCondition(descriptor.sourceHex === palette[role].hex.toLowerCase(), `Rerun ${role} RGB and hex disagree`)
		return [role, {
			rgb: palette[role].rgb,
			hex: descriptor.sourceHex,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
			colorName: {
				nearestName: descriptor.nearestName,
				referenceHex: descriptor.nearest.referenceHex,
				tier: descriptor.nearest.tier,
				distance: descriptor.nearest.distance,
			},
		}]
	})) as PaletteRole00AuditPresentedPalette["roles"]
	return {
		roles,
		gradient: { ...palette.gradient },
		score: palette.score,
		metrics: { ...palette.metrics },
		backgroundSurface: paletteRole00AuditBackgroundSurface(roles.background.rgb, roles.surface.rgb),
	}
}

function parseCompleteAnalysis(
	value: unknown,
	manifestId: string,
	manifestSha256: string,
	feedbackSha256: string,
	manifestEntries: readonly { caseId: string; order: number; batch: number; sampleTrack: string; source: { file: string } }[],
	feedbackEntries: readonly PaletteRole00AuditFeedbackEntry[],
): Record<string, unknown> {
	if (!isRecord(value)) throw new Error("Complete audit analysis is invalid")
	exactKeys(value, [
		"schemaVersion", "analysisVersion", "generatedAt", "auditVersion", "manifestId", "algorithmVersion",
		"developmentAudit", "provenance", "coverage", "rated", "skipped", "skipReasons", "overallQuality", "entries",
	], "Complete audit analysis")
	requireCondition(value.schemaVersion === 1 && value.analysisVersion === "palette-role-00-audit-analysis-0.2.0-development" &&
		typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)) && value.manifestId === manifestId &&
		value.algorithmVersion === PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION && value.developmentAudit === true,
	"Complete audit analysis header is invalid")
	requireCondition(isRecord(value.provenance), "Complete audit analysis provenance is invalid")
	exactKeys(value.provenance, [
		"manifestSha256", "feedbackSha256", "canonicalHoldoutRawSha256", "canonicalHoldoutSemanticSha256",
		"sourceSelectionManifestId",
	], "Complete audit analysis provenance")
	requireCondition(value.provenance.manifestSha256 === manifestSha256 && value.provenance.feedbackSha256 === feedbackSha256,
		"Complete audit analysis does not bind the supplied manifest and feedback")
	requireCondition(isRecord(value.coverage) && value.coverage.total === PALETTE_ROLE_00_AUDIT_ENTRY_COUNT &&
		value.coverage.reviewed === PALETTE_ROLE_00_AUDIT_ENTRY_COUNT && value.coverage.unreviewed === 0 &&
		value.coverage.fraction === 1 && Array.isArray(value.entries) && value.entries.length === manifestEntries.length,
	"Complete audit analysis is not complete")
	const feedbackByCase = new Map(feedbackEntries.map((entry) => [entry.caseId, entry]))
	for (const [index, entry] of value.entries.entries()) {
		if (!isRecord(entry)) throw new Error(`Complete audit analysis entry ${index} is invalid`)
		exactKeys(entry, ["caseId", "order", "batch", "sampleTrack", "file", "feedback"],
			`Complete audit analysis entry ${index}`)
		const manifestEntry = manifestEntries[index]
		requireCondition(entry.caseId === manifestEntry.caseId && entry.order === manifestEntry.order &&
			entry.batch === manifestEntry.batch && entry.sampleTrack === manifestEntry.sampleTrack &&
			entry.file === manifestEntry.source.file && isDeepStrictEqual(entry.feedback, feedbackByCase.get(manifestEntry.caseId)),
		`Complete audit analysis entry ${index} is stale`)
	}
	return value
}

type InterpretationEntry = {
	caseId: string
	file: string
	quality: string
	classifications: string[]
	finding: string
}

function parseInterpretation(
	value: unknown,
	manifestId: string,
	manifestSha256: string,
	feedbackSha256: string,
	analysisSha256: string,
	commentedFeedback: readonly PaletteRole00AuditFeedbackEntry[],
	fileByCase: ReadonlyMap<string, string>,
): Map<string, InterpretationEntry> {
	if (!isRecord(value)) throw new Error("Audit interpretation is invalid")
	exactKeys(value, [
		"schemaVersion", "interpretationVersion", "generatedAt", "manifestId", "developmentEvidence", "provenance",
		"interpretationPolicy", "coverage", "quality", "mechanismSummary", "commentInterpretations", "decision",
	], "Audit interpretation")
	requireCondition(value.schemaVersion === 1 &&
		value.interpretationVersion === "palette-role-00-audit-interpretation-0.2.0-development" &&
		typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)) &&
		value.manifestId === manifestId && value.developmentEvidence === true, "Audit interpretation header is invalid")
	requireCondition(isRecord(value.provenance), "Audit interpretation provenance is invalid")
	exactKeys(value.provenance, ["manifestSha256", "feedbackSha256", "analysisSha256"], "Audit interpretation provenance")
	requireCondition(value.provenance.manifestSha256 === manifestSha256 && value.provenance.feedbackSha256 === feedbackSha256 &&
		value.provenance.analysisSha256 === analysisSha256, "Audit interpretation provenance is stale")
	requireCondition(isRecord(value.interpretationPolicy), "Audit interpretation policy is invalid")
	exactKeys(value.interpretationPolicy, [
		"displayedPaletteJudgmentsAreNonExclusive", "positiveRatingDoesNotRejectAlternativePalettes",
		"commentsMayDescribeConditionalRoleRelationships", "ratingsDoNotIdentifyAUniqueCorrectPalette",
		"sampleDoesNotEstimateCorpusPrevalence",
	], "Audit interpretation policy")
	requireCondition(Object.values(value.interpretationPolicy).every((flag) => flag === true),
		"Audit interpretation does not preserve non-exclusive user semantics")
	requireCondition(isRecord(value.coverage) && value.coverage.nonemptyCommentsRead === commentedFeedback.length &&
		Array.isArray(value.commentInterpretations) && value.commentInterpretations.length === commentedFeedback.length,
	"Audit interpretation does not cover every nonempty comment")
	requireCondition(isRecord(value.mechanismSummary), "Audit mechanism summary is invalid")
	exactKeys(value.mechanismSummary, [
		"candidatePresentButUnassignedCases", "candidateAvailabilityFailureCases", "gradientEndpointConcernCases",
		"clearUnderCollapseCases", "plausibleOverCollapseCases", "sourceQualityCaveatOnlyCases",
	], "Audit mechanism summary")
	const commentedIds = new Set(commentedFeedback.map((entry) => entry.caseId))
	for (const cases of Object.values(value.mechanismSummary)) {
		requireCondition(Array.isArray(cases) && cases.every((caseId) => typeof caseId === "string" && commentedIds.has(caseId)),
			"Audit mechanism summary references a non-commented case")
	}
	requireCondition(isRecord(value.decision), "Audit interpretation decision is invalid")
	exactKeys(value.decision, ["algorithmChangeAuthorized", "rationale", "nextDiagnostic"], "Audit interpretation decision")
	requireCondition(value.decision.algorithmChangeAuthorized === false &&
		typeof value.decision.nextDiagnostic === "string" && /one-role counterfactual trace/.test(value.decision.nextDiagnostic),
	"Audit interpretation does not authorize this read-only diagnostic")
	const feedbackByCase = new Map(commentedFeedback.map((entry) => [entry.caseId, entry]))
	const entries = new Map<string, InterpretationEntry>()
	for (const [index, entry] of value.commentInterpretations.entries()) {
		if (!isRecord(entry)) throw new Error(`Audit interpretation entry ${index} is invalid`)
		exactKeys(entry, ["caseId", "file", "quality", "classifications", "finding"], `Audit interpretation entry ${index}`)
		const feedback = typeof entry.caseId === "string" ? feedbackByCase.get(entry.caseId) : undefined
		requireCondition(feedback !== undefined && entry.file === fileByCase.get(feedback.caseId) &&
			entry.quality === feedback.overallQuality && Array.isArray(entry.classifications) && entry.classifications.length > 0 &&
			entry.classifications.every((classification) => typeof classification === "string" && classification.length > 0) &&
			new Set(entry.classifications).size === entry.classifications.length && typeof entry.finding === "string" &&
			entry.finding.length > 0 && !entries.has(feedback.caseId), `Audit interpretation entry ${index} is invalid or stale`)
		entries.set(feedback.caseId, entry as unknown as InterpretationEntry)
	}
	requireCondition(entries.size === commentedIds.size && [...commentedIds].every((caseId) => entries.has(caseId)),
		"Audit interpretation case coverage is incomplete")
	return entries
}

async function currentFileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [
		file,
		sha256(await readFile(resolve(projectRoot, file))),
	])))
}

function poolBinding(
	candidates: readonly Candidate[],
	recordById: ReadonlyMap<number, PaletteRoleCounterfactualCandidateRecord>,
): { identitySha256: string; candidateKeys: string[] } {
	return {
		identitySha256: paletteRoleCounterfactualCandidatePoolIdentity(candidates),
		candidateKeys: candidates.map((candidate) => {
			const record = recordById.get(candidate.id)
			requireCondition(record?.identitySha256 === sha256(JSON.stringify(candidate)),
				`Candidate ${candidate.id} record identity is stale`)
			return record.candidateKey
		}),
	}
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

try {
	await access(outputPath)
	throw new Error(`Refusing to overwrite ${outputPath}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}

const inputSources = Object.fromEntries(await Promise.all(Object.entries(paletteRoleCounterfactualInputFiles).map(
	async ([key, path]) => [key, await readFile(resolve(projectRoot, path))],
))) as Record<keyof typeof paletteRoleCounterfactualInputFiles, Buffer>
const inputHashes = Object.fromEntries(Object.entries(inputSources).map(([key, source]) => [key, sha256(source)])) as
	Record<keyof typeof paletteRoleCounterfactualInputFiles, string>
const inputValues = Object.fromEntries(Object.entries(inputSources).map(([key, source]) => [
	key,
	JSON.parse(source.toString("utf8")) as unknown,
])) as Record<keyof typeof paletteRoleCounterfactualInputFiles, unknown>

const manifest = parsePaletteRole00AuditManifest(inputValues.auditManifest)
const feedback = parsePaletteRole00AuditFeedbackStore(inputValues.feedback, manifest)
requireCondition(feedback.entries.length === manifest.entries.length && feedback.entries.length === PALETTE_ROLE_00_AUDIT_ENTRY_COUNT,
	"Palette role audit feedback is incomplete")
const rawFeedbackEntries = (inputValues.feedback as { entries: unknown[] }).entries
requireCondition(rawFeedbackEntries.length === feedback.entries.length && rawFeedbackEntries.every((entry, index) =>
	isDeepStrictEqual(entry, feedback.entries[index])), "Parsed feedback does not preserve the stored entries verbatim")
const commentedFeedback = feedback.entries.filter((entry) => entry.comment.trim().length > 0)
requireCondition(commentedFeedback.length === PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT,
	`Expected exactly ${PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT} nonempty trimmed comments`)
requireCondition(commentedFeedback.every((entry) => entry.comment === entry.comment.trim()),
	"Stored nonempty comments must be preserved verbatim without normalization")

const completeAnalysis = parseCompleteAnalysis(
	inputValues.completeAnalysis,
	manifest.manifestId,
	inputHashes.auditManifest,
	inputHashes.feedback,
	manifest.entries,
	feedback.entries,
)
const interpretation = parseInterpretation(
	inputValues.interpretation,
	manifest.manifestId,
	inputHashes.auditManifest,
	inputHashes.feedback,
	inputHashes.completeAnalysis,
	commentedFeedback,
	new Map(manifest.entries.map((entry) => [entry.caseId, entry.source.file])),
)

requireCondition(inputHashes.canonicalHoldout === manifest.provenance.canonicalHoldout.rawSha256 &&
	inputHashes.sourceSelection === manifest.provenance.sourceSelection.rawSha256,
"Canonical holdout or source selection differs from the bound audit input")
requireCondition(isRecord(inputValues.canonicalHoldout), "Canonical holdout is invalid")
const holdout = inputValues.canonicalHoldout as unknown as CorpusResult
requireCondition(holdout.algorithmVersion === ALGORITHM_VERSION && holdout.entries.length === PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT,
	"Canonical holdout version or entry count is invalid")
const holdoutSemanticSha256 = computeSemanticResultsSha256(holdout)
requireCondition(holdoutSemanticSha256 === manifest.provenance.canonicalHoldout.semanticSha256,
	"Canonical holdout semantic identity differs from the audit")
validateSelectionManifest(inputValues.sourceSelection, holdout, inputHashes.canonicalHoldout)
const selection = inputValues.sourceSelection
requireCondition(selection.manifestId === manifest.provenance.sourceSelection.manifestId,
	"Source selection manifest identity differs from the audit")
validatePaletteRole00AuditSample(manifest, selection)
requireCondition(isRecord(completeAnalysis.provenance) &&
	completeAnalysis.provenance.canonicalHoldoutRawSha256 === inputHashes.canonicalHoldout &&
	completeAnalysis.provenance.canonicalHoldoutSemanticSha256 === holdoutSemanticSha256 &&
	completeAnalysis.provenance.sourceSelectionManifestId === selection.manifestId,
"Complete analysis canonical provenance is stale")

const holdoutByFile = new Map(holdout.entries.map((entry) => [entry.file, entry]))
const feedbackByCase = new Map(commentedFeedback.map((entry) => [entry.caseId, entry]))
const selectedManifestEntries = manifest.entries.filter((entry) => feedbackByCase.has(entry.caseId))
requireCondition(selectedManifestEntries.length === PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT,
	"Manifest does not contain every commented feedback case")

const cases: PaletteRoleCounterfactualTraceCase[] = []
for (const [traceIndex, entry] of selectedManifestEntries.entries()) {
	const feedbackEntry = feedbackByCase.get(entry.caseId)!
	const interpretationEntry = interpretation.get(entry.caseId)!
	const canonical = holdoutByFile.get(entry.source.file)
	requireCondition(canonical !== undefined, `Canonical holdout is missing ${entry.source.file}`)
	const sourcePath = resolve(projectRoot, entry.source.file)
	const sourceBytes = await readFile(sourcePath)
	requireCondition(sourceBytes.byteLength === entry.source.bytes && sha256(sourceBytes) === entry.source.sha256,
		`Exact source bytes changed for ${entry.source.file}`)
	const metadata = await sharp(sourceBytes).metadata()
	requireCondition(metadata.width === entry.source.width && metadata.height === entry.source.height,
		`Original source dimensions changed for ${entry.source.file}`)
	const image = await loadImage(sourceBytes)
	requireCondition(image.width === entry.normalized.width && image.height === entry.normalized.height &&
		canonical.width === image.width && canonical.height === image.height,
		`Normalized dimensions changed for ${entry.source.file}`)
	const imageSha256 = normalizedImageSha256(image)

	const current = extractPaletteWithContext(image)
	const chromatic = extractChromaticRolePaletteWithContext(image)
	requireCondition(current.extraction.version === ALGORITHM_VERSION && ALGORITHM_VERSION === PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
		`Current extraction version differs from the audit for ${entry.source.file}`)
	requireCondition(isDeepStrictEqual(scientificExtraction(current.extraction), scientificExtraction(canonical.extraction)),
		`Current 0.19 scientific extraction differs from canonical holdout for ${entry.source.file}`)
	const replayedChromatic = { ...chromatic.extraction, version: ALGORITHM_VERSION }
	requireCondition(isDeepStrictEqual(scientificExtraction(current.extraction), scientificExtraction(replayedChromatic)) &&
		isDeepStrictEqual(current.candidates, chromatic.candidates) && isDeepStrictEqual(current.analysis, chromatic.analysis),
		`Current 0.19 wrapper differs from its bound chromatic implementation for ${entry.source.file}`)
	requireCondition(isDeepStrictEqual(presentPalette(current.extraction.methods.spatial), entry.palette),
		`Current 0.19 spatial palette differs from the bound displayed canonical palette for ${entry.source.file}`)
	requireCondition(chromatic.certificate.normalizedImageSha256 === imageSha256,
		`Normalized image identity differs from the extraction certificate for ${entry.source.file}`)

	const availableIds = new Set(chromatic.certificate.decision.availableSupplementIds)
	const admittedIds = new Set(chromatic.certificate.decision.admittedSupplementIds)
	const supplementById = new Map(chromatic.certificate.availability.supplements.map((supplement) => [supplement.id, supplement]))
	requireCondition(availableIds.size === supplementById.size && [...availableIds].every((id) => supplementById.has(id)) &&
		[...admittedIds].every((id) => availableIds.has(id)), `Supplement certificate membership is invalid for ${entry.source.file}`)
	const baselineCandidates = chromatic.candidates.filter((candidate) => !availableIds.has(candidate.id))
	const roleSolverCandidates = chromatic.candidates.filter((candidate) => !availableIds.has(candidate.id) || admittedIds.has(candidate.id))
	requireCondition(paletteRoleCounterfactualCandidatePoolIdentity(baselineCandidates) ===
		chromatic.certificate.candidateIdentity.baselineSha256 &&
		paletteRoleCounterfactualCandidatePoolIdentity(chromatic.candidates) ===
		chromatic.certificate.candidateIdentity.augmentedSha256 &&
		paletteRoleCounterfactualCandidatePoolIdentity(roleSolverCandidates) ===
		chromatic.certificate.candidateIdentity.roleSolverSha256,
		`Candidate pool identities differ from the extraction certificate for ${entry.source.file}`)

	const candidateRecords = chromatic.candidates.map((candidate): PaletteRoleCounterfactualCandidateRecord => {
		const supplement = supplementById.get(candidate.id)
		if (!supplement) return presentPaletteRoleCounterfactualCandidate(candidate, "baseline")
		return presentPaletteRoleCounterfactualCandidate(
			candidate,
			admittedIds.has(candidate.id) ? "admitted-supplement" : "availability-only-supplement",
			{
				anchorDegrees: supplement.anchorDegrees,
				score: supplement.score,
				supportingRegionCount: supplement.supportingRegionCount,
				nearestBaselineDistance: supplement.nearestBaselineDistance,
			},
		)
	}).sort((first, second) => first.candidateKey < second.candidateKey ? -1 : first.candidateKey > second.candidateKey ? 1 : 0)
	const recordById = new Map(candidateRecords.map((record) => [record.candidate.id, record]))
	requireCondition(recordById.size === candidateRecords.length, `Candidate IDs are duplicated for ${entry.source.file}`)

	const alternatives: PaletteRoleCounterfactualAlternative[] = []
	for (const role of paletteRoleCounterfactualRoles) {
		for (const record of candidateRecords) {
			const alternativeId = paletteRoleCounterfactualAlternativeId(entry.caseId, role, record.identitySha256)
			if (record.productionRoleSolverMember) {
				alternatives.push({
					alternativeId,
					targetRole: role,
					candidateKey: record.candidateKey,
					provenance: record.provenance,
					productionSelectable: true,
					evaluation: evaluateJointRoleCounterfactual(
						roleSolverCandidates,
						chromatic.analysis,
						current.extraction.methods.spatial,
						role,
						record.candidate,
					),
					notEvaluated: null,
				})
			} else {
				requireCondition(record.admission !== null && record.admission.failedGates.length > 0,
					`Availability-only supplement has no failed admission gate for ${entry.source.file}`)
				alternatives.push({
					alternativeId,
					targetRole: role,
					candidateKey: record.candidateKey,
					provenance: record.provenance,
					productionSelectable: false,
					evaluation: null,
					notEvaluated: {
						reason: "availability-only-supplement",
						failedAdmissionGates: [...record.admission.failedGates],
					},
				})
			}
		}
	}
	const surfaceCollapses = alternatives.filter((alternative) =>
		alternative.targetRole === "surface" && alternative.evaluation?.collapse.replacement.surfaceToBackground)
	const accentCollapses = alternatives.filter((alternative) =>
		alternative.targetRole === "accent" && alternative.evaluation?.collapse.replacement.accentToForeground)
	requireCondition(surfaceCollapses.length === 1 && accentCollapses.length === 1,
		`Normal enumeration did not produce exactly one explicit collapse per role for ${entry.source.file}`)

	cases.push({
		caseId: entry.caseId,
		traceOrder: traceIndex + 1,
		auditOrder: entry.order,
		sampleTrack: entry.sampleTrack,
		source: {
			file: entry.source.file,
			sha256: entry.source.sha256,
			bytes: entry.source.bytes,
			originalWidth: entry.source.width,
			originalHeight: entry.source.height,
			normalizedWidth: image.width,
			normalizedHeight: image.height,
			normalizedImageSha256: imageSha256,
		},
		feedback: feedbackEntry,
		interpretation: {
			evidenceKind: "qualitative-non-exclusive",
			classifications: [...interpretationEntry.classifications],
			finding: interpretationEntry.finding,
		},
		displayedCanonical: entry.palette,
		production: {
			extractionAlgorithmVersion: ALGORITHM_VERSION,
			exactScientificEquivalence: true,
			certificate: bindPaletteRoleCounterfactualCertificate(chromatic.certificate),
			candidatePools: {
				baseline: poolBinding(baselineCandidates, recordById),
				augmented: poolBinding(chromatic.candidates, recordById),
				roleSolver: poolBinding(roleSolverCandidates, recordById),
			},
		},
		candidates: candidateRecords,
		explicitCollapses: {
			surfaceToBackground: {
				alternativeId: surfaceCollapses[0].alternativeId,
				candidateKey: surfaceCollapses[0].candidateKey,
			},
			accentToForeground: {
				alternativeId: accentCollapses[0].alternativeId,
				candidateKey: accentCollapses[0].candidateKey,
			},
		},
		alternatives,
	})
}

const implementation = await currentFileHashes(paletteRoleCounterfactualImplementationFiles)
const identity: PaletteRoleCounterfactualTraceIdentity = {
	schemaVersion: 1,
	traceVersion: PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION,
	policy: paletteRoleCounterfactualPolicy,
	provenance: {
		inputs: {
			auditManifest: {
				path: paletteRoleCounterfactualInputFiles.auditManifest,
				rawSha256: inputHashes.auditManifest,
				manifestId: manifest.manifestId,
			},
			feedback: {
				path: paletteRoleCounterfactualInputFiles.feedback,
				rawSha256: inputHashes.feedback,
				manifestId: manifest.manifestId,
			},
			completeAnalysis: {
				path: paletteRoleCounterfactualInputFiles.completeAnalysis,
				rawSha256: inputHashes.completeAnalysis,
				manifestId: manifest.manifestId,
			},
			interpretation: {
				path: paletteRoleCounterfactualInputFiles.interpretation,
				rawSha256: inputHashes.interpretation,
				manifestId: manifest.manifestId,
			},
			canonicalHoldout: {
				path: paletteRoleCounterfactualInputFiles.canonicalHoldout,
				rawSha256: inputHashes.canonicalHoldout,
				semanticSha256: holdoutSemanticSha256,
			},
			sourceSelection: {
				path: paletteRoleCounterfactualInputFiles.sourceSelection,
				rawSha256: inputHashes.sourceSelection,
				manifestId: selection.manifestId,
			},
		},
		implementation,
	},
	counts: paletteRoleCounterfactualTraceCounts(cases),
	cases,
}
const trace = createPaletteRoleCounterfactualTrace(identity)
requireCondition(trace.cases.length === PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT,
	"Final counterfactual trace case count is invalid")
parsePaletteRoleCounterfactualTrace(JSON.parse(JSON.stringify(trace)) as unknown)
await writeExclusiveJson(outputPath, trace)
process.stderr.write(
	`Prepared ${trace.counts.cases} one-role counterfactual cases (${trace.counts.evaluatedAlternatives} evaluated alternatives) ` +
	`at ${relative(projectRoot, outputPath)} with trace ID ${trace.traceId}\n`,
)
