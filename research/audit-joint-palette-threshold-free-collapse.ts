import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "./src/color.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-threshold-free-collapse-audit-0.1.0-development"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const FIELD_DOMINANCE_EXPERIMENT_ID = "1f1c0553644479361d822d0d34cac2cdacf352dc26de5d6e7ef35df0a9cf7a6b"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const epsilon = 1e-12

const inputFiles = {
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceResults: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/results.json",
	jointParetoManifest: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/manifest.json",
	jointParetoResults: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/results.json",
	jointParetoCertificates: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json",
	fieldDominanceResults:
		"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/results.json",
	fieldDominanceInterpretation:
		"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/interpretation.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
} as const

const implementationFiles = [
	"research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/audit-joint-palette-threshold-free-collapse.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type ComparisonRole = { changed: boolean; old: { rgb: RGB; generated: boolean }; new: { rgb: RGB; generated: boolean } }
type ParetoResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	comparison: {
		gradient: { changed: boolean; old: boolean; new: boolean }
		roles: Record<"background" | "foreground" | "surface" | "accent", ComparisonRole>
	}
}
type FieldRelation = {
	endpoint: { backgroundPresence: number; surfacePresence: number; balance: number; mass: number }
	field: { backgroundSupport: number; surfaceSupport: number }
}
type FrontierEntry = {
	stableKey: string
	fieldState: "collapsed" | "distinct-flat" | "gradient"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
	changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
	roles: Record<"background" | "foreground" | "surface" | "accent", RGB>
}
type Certificate = {
	incumbent: { fieldState: "collapsed" | "distinct-flat" | "gradient" }
	counts: { canonicalSeededFieldTreatments: number }
	selected: {
		fieldState: "collapsed" | "distinct-flat" | "gradient"
		fieldTreatment: { fieldRelation: FieldRelation | null } | null
	}
	minimumBlockFrontier: FrontierEntry[]
}
type ExactCandidate = {
	file: string
	cohort: Source["cohort"]
	stableKey: string
	fieldState: "collapsed"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
	roles: FrontierEntry["roles"]
	sourceExperiment: "field-dominance" | "joint-pareto"
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function semanticKey(roles: ExactCandidate["roles"], state: ExactCandidate["fieldState"]): string {
	return JSON.stringify({ roles, state })
}

function magnitude(value: number): number {
	return Math.abs(value)
}

function countBy(values: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing collapse audit: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

if (process.argv.slice(2).length > 0) throw new Error("audit-joint-palette-threshold-free-collapse.ts does not accept arguments")
await assertOutputAbsent()

const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
	const raw = await readFile(join(projectRoot, path))
	return [name, { path, raw, sha256: sha256(raw) }] as const
}))
const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
const evidenceResults = parse<{
	experimentId: string
	entries: Array<{ file: string; source: { sha256: string; bytes: number } }>
}>("evidenceResults")
const paretoManifest = parse<{ experimentId: string; sources: Source[] }>("jointParetoManifest")
const paretoResults = parse<{ experimentId: string; entries: ParetoResult[] }>("jointParetoResults")
const certificates = parse<{ experimentId: string; entries: Record<string, Certificate> }>("jointParetoCertificates")
const fieldResults = parse<{
	experimentId: string
	entries: Array<{
		file: string
		cohort: Source["cohort"]
		candidate: Palette | null
		certificate: { selected: FrontierEntry }
	}>
}>("fieldDominanceResults")
const fieldInterpretation = parse<{
	experimentId: string
	disposition: { exactPositiveTupleEvidenceRetained: string[]; broaderReviewAuthorized: boolean }
	nextEngineeringGate: { name: string; candidateOrReviewAuthorized: boolean }
}>("fieldDominanceInterpretation")
const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
const canonical00 = parse<CorpusResult>("canonical00")
if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceResults.experimentId !== EVIDENCE_EXPERIMENT_ID ||
	paretoManifest.experimentId !== JOINT_PARETO_EXPERIMENT_ID || paretoResults.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
	certificates.experimentId !== JOINT_PARETO_EXPERIMENT_ID || fieldResults.experimentId !== FIELD_DOMINANCE_EXPERIMENT_ID ||
	fieldInterpretation.experimentId !== FIELD_DOMINANCE_EXPERIMENT_ID ||
	fieldInterpretation.disposition.broaderReviewAuthorized || fieldInterpretation.nextEngineeringGate.candidateOrReviewAuthorized ||
	fieldInterpretation.nextEngineeringGate.name !== "read-only-collapse-evidence-audit" ||
	evidenceManifest.sources.length !== 392 || evidenceResults.entries.length !== 392 || paretoManifest.sources.length !== 392 ||
	paretoResults.entries.length !== 392 || Object.keys(certificates.entries).length !== 392) {
	throw new Error("Threshold-free collapse audit inputs disagree")
}

const evidenceByFile = new Map(evidenceResults.entries.map((entry) => [entry.file, entry]))
const paretoSourceByFile = new Map(paretoManifest.sources.map((entry) => [entry.path, entry]))
const paretoResultByFile = new Map(paretoResults.entries.map((entry) => [entry.file, entry]))
for (const source of evidenceManifest.sources) {
	const evidence = evidenceByFile.get(source.path)
	const paretoSource = paretoSourceByFile.get(source.path)
	const paretoResult = paretoResultByFile.get(source.path)
	if (!evidence || !paretoSource || !paretoResult || !certificates.entries[source.path] ||
		evidence.source.sha256 !== source.sha256 || evidence.source.bytes !== source.bytes ||
		paretoSource.sha256 !== source.sha256 || paretoSource.bytes !== source.bytes ||
		paretoResult.source.sha256 !== source.sha256 || paretoResult.source.bytes !== source.bytes) {
		throw new Error(`Collapse audit source binding changed: ${source.path}`)
	}
}

const audits = evidenceManifest.sources.map((source) => {
	const result = paretoResultByFile.get(source.path)!
	const certificate = certificates.entries[source.path]
	const comparison = result.comparison
	if (certificate.incumbent.fieldState === "collapsed") {
		return { file: source.path, cohort: source.cohort, source: { sha256: source.sha256, bytes: source.bytes },
			status: "not-applicable-canonical-collapsed" as const }
	}
	const treatment = certificate.selected.fieldTreatment
	if (!treatment) return { file: source.path, cohort: source.cohort, source: { sha256: source.sha256, bytes: source.bytes },
		status: "missing-selected-treatment" as const }
	if (!treatment.fieldRelation) return { file: source.path, cohort: source.cohort,
		source: { sha256: source.sha256, bytes: source.bytes }, status: "missing-selected-collapse-relation" as const }
	if (comparison.roles.background.changed || comparison.roles.surface.changed || comparison.gradient.changed ||
		certificate.selected.fieldState !== certificate.incumbent.fieldState) {
		return { file: source.path, cohort: source.cohort, source: { sha256: source.sha256, bytes: source.bytes },
			status: "missing-canonical-pair-selected-other-treatment" as const }
	}
	if (certificate.counts.canonicalSeededFieldTreatments !== 1) {
		return { file: source.path, cohort: source.cohort, source: { sha256: source.sha256, bytes: source.bytes },
			status: "missing-canonical-pair-alias-ambiguity" as const }
	}
	const relation = treatment.fieldRelation
	const background = comparison.roles.background.old.rgb
	const surface = comparison.roles.surface.old.rgb
	const foreground = comparison.roles.foreground.old.rgb
	const accent = comparison.roles.accent.old.rgb
	const clauses = {
		retainedBackgroundPresenceDominates: relation.endpoint.backgroundPresence > relation.endpoint.surfacePresence,
		retainedBackgroundFieldSupportDominates: relation.field.backgroundSupport > relation.field.surfaceSupport,
		foregroundSurfaceRelationPreserved:
			magnitude(apcaContrast(foreground, background)) + epsilon >= magnitude(apcaContrast(foreground, surface)),
		accentSurfaceRelationPreserved:
			magnitude(apcaContrast(accent, background)) + epsilon >= magnitude(apcaContrast(accent, surface)),
	}
	return {
		file: source.path,
		cohort: source.cohort,
		source: { sha256: source.sha256, bytes: source.bytes },
		status: "auditable" as const,
		canonicalFieldState: certificate.incumbent.fieldState,
		evidence: {
			backgroundPresence: relation.endpoint.backgroundPresence,
			surfacePresence: relation.endpoint.surfacePresence,
			backgroundFieldSupport: relation.field.backgroundSupport,
			surfaceFieldSupport: relation.field.surfaceSupport,
			endpointBalance: relation.endpoint.balance,
			endpointMass: relation.endpoint.mass,
			foregroundOnBackgroundMagnitude: magnitude(apcaContrast(foreground, background)),
			foregroundOnSurfaceMagnitude: magnitude(apcaContrast(foreground, surface)),
			accentOnBackgroundMagnitude: magnitude(apcaContrast(accent, background)),
			accentOnSurfaceMagnitude: magnitude(apcaContrast(accent, surface)),
		},
		clauses,
		pass: Object.values(clauses).every(Boolean),
	}
})

const exactCandidates: ExactCandidate[] = []
for (const result of fieldResults.entries) {
	if (!result.candidate) continue
	const selected = result.certificate.selected
	exactCandidates.push({
		file: result.file,
		cohort: result.cohort,
		stableKey: selected.stableKey,
		fieldState: "collapsed",
		changedSemanticBlocks: selected.changedSemanticBlocks,
		changedSemanticAtoms: selected.changedSemanticAtoms,
		objectiveDeltas: selected.objectiveDeltas,
		roles: selected.roles,
		sourceExperiment: "field-dominance",
	})
}
for (const source of evidenceManifest.sources) {
	for (const candidate of certificates.entries[source.path].minimumBlockFrontier) {
		if (candidate.fieldState !== "collapsed" || candidate.changedSemanticBlocks !== 1 ||
			!candidate.changedBlocks.field || candidate.changedBlocks.foreground || candidate.changedBlocks.accent ||
			candidate.objectiveDeltas.some((delta) => delta < -epsilon) ||
			!candidate.objectiveDeltas.some((delta) => delta > epsilon)) continue
		exactCandidates.push({
			file: source.path,
			cohort: source.cohort,
			stableKey: candidate.stableKey,
			fieldState: "collapsed",
			changedSemanticBlocks: candidate.changedSemanticBlocks,
			changedSemanticAtoms: candidate.changedSemanticAtoms,
			objectiveDeltas: candidate.objectiveDeltas,
			roles: candidate.roles,
			sourceExperiment: "joint-pareto",
		})
	}
}
const uniqueCandidates = [...new Map(exactCandidates.map((candidate) =>
	[`${candidate.file}\0${semanticKey(candidate.roles, candidate.fieldState)}`, candidate])).values()]
	.sort((first, second) => first.file.localeCompare(second.file) || first.stableKey.localeCompare(second.stableKey))
const auditByFile = new Map(audits.map((entry) => [entry.file, entry]))
const positiveFiles = new Set(fieldInterpretation.disposition.exactPositiveTupleEvidenceRetained)
const candidateFrontier = uniqueCandidates.flatMap((candidate) => {
	const audit = auditByFile.get(candidate.file)
	if (!audit || audit.status !== "auditable" || !audit.pass) return []
	return [{
		...candidate,
		source: evidenceManifest.sources.find((source) => source.path === candidate.file)!,
		audit: { clauses: audit.clauses, evidence: audit.evidence },
		reviewEvidence: positiveFiles.has(candidate.file) && candidate.sourceExperiment === "field-dominance"
			? "exact-positive-transfer" as const
			: "fresh-review-required" as const,
	}]
})

const auditable = audits.filter((entry) => entry.status === "auditable")
const passed = auditable.filter((entry) => entry.pass)
const protocol = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	auditOnly: true,
	hypothesis: {
		name: "oriented-endpoint-subordination-with-secondary-overlay-preservation",
		clauses: [
			"retained background endpoint presence strictly exceeds removed surface endpoint presence",
			"retained background field support strictly exceeds removed surface field support",
			"foreground APCA magnitude on retained background does not regress from removed surface",
			"accent APCA magnitude on retained background does not regress from removed surface",
		],
		fittedNumericThresholds: false,
		comparisonEpsilon: epsilon,
	},
	authorization: {
		developmentOnly: true,
		allowedSourceRoots: ["images", "00"],
		outputUnseenRootsOpened: [] as string[],
		commentsEnterAudit: false,
		filenamesEnterAudit: false,
		colorsEnterAuditBeyondRelationalApca: false,
		candidateReviewAuthorized: false,
		broaderReviewAuthorized: false,
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		reserveAccessAuthorized: false,
	},
}
const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
	[path, sha256(await readFile(join(projectRoot, path)))] as const)))
const identity = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	protocol,
	inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
	sources: evidenceManifest.sources,
	implementation,
}
const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
const generatedAt = new Date().toISOString()
const analysis = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	experimentId,
	generatedAt,
	coverage: {
		total: audits.length,
		canonicalCollapsedNotApplicable: audits.filter((entry) => entry.status === "not-applicable-canonical-collapsed").length,
		canonicalNoncollapsed: audits.filter((entry) => entry.status !== "not-applicable-canonical-collapsed").length,
		auditable: auditable.length,
		missing: audits.length - auditable.length - audits.filter((entry) => entry.status === "not-applicable-canonical-collapsed").length,
		status: countBy(audits.map((entry) => entry.status)),
	},
	clauses: {
		retainedBackgroundPresenceDominates: auditable.filter((entry) => entry.clauses.retainedBackgroundPresenceDominates).length,
		retainedBackgroundFieldSupportDominates: auditable.filter((entry) => entry.clauses.retainedBackgroundFieldSupportDominates).length,
		foregroundSurfaceRelationPreserved: auditable.filter((entry) => entry.clauses.foregroundSurfaceRelationPreserved).length,
		accentSurfaceRelationPreserved: auditable.filter((entry) => entry.clauses.accentSurfaceRelationPreserved).length,
		allPass: passed.length,
	},
	partitions: {
		development: { auditable: auditable.filter((entry) => entry.cohort === "development").length,
			allPass: passed.filter((entry) => entry.cohort === "development").length },
		cohort00: { auditable: auditable.filter((entry) => entry.cohort === "00").length,
			allPass: passed.filter((entry) => entry.cohort === "00").length },
		distinctFlat: { auditable: auditable.filter((entry) => entry.canonicalFieldState === "distinct-flat").length,
			allPass: passed.filter((entry) => entry.canonicalFieldState === "distinct-flat").length },
		gradient: { auditable: auditable.filter((entry) => entry.canonicalFieldState === "gradient").length,
			allPass: passed.filter((entry) => entry.canonicalFieldState === "gradient").length },
	},
	exactCandidateCoverage: {
		knownStrictFieldOnlyCollapseTuples: uniqueCandidates.length,
		passing: candidateFrontier.length,
		exactPositiveTransfers: candidateFrontier.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length,
		freshReviewRequired: candidateFrontier.filter((entry) => entry.reviewEvidence === "fresh-review-required").length,
	},
	reviewedSeparation: {
		positivePass: candidateFrontier.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length,
		negativeFail: fieldResults.entries.filter((entry) => entry.candidate && !positiveFiles.has(entry.file) &&
			!candidateFrontier.some((candidate) => candidate.file === entry.file)).length,
	},
	disposition: "audit-complete-candidate-review-authorization-required",
}

await mkdir(outputRoot)
await Promise.all([
	writeExclusive(join(outputRoot, "protocol.json"), protocol),
	writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
	writeExclusive(join(outputRoot, "results.json"), { schemaVersion: 1, experimentId, entries: audits }),
	writeExclusive(join(outputRoot, "analysis.json"), analysis),
	writeExclusive(join(outputRoot, "candidate-frontier.json"), { schemaVersion: 1, experimentId, entries: candidateFrontier }),
])
process.stderr.write(`Wrote threshold-free collapse audit ${experimentId} to ${outputRoot}\n`)
