import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { RGB } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-threshold-free-collapse-audit-0.1.1-development"
const PREDECESSOR_EXPERIMENT_ID = "d63314d69c8d7b03a265cffd44732813372e681bfb24f345081426141abe57e8"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const FIELD_DOMINANCE_EXPERIMENT_ID = "1f1c0553644479361d822d0d34cac2cdacf352dc26de5d6e7ef35df0a9cf7a6b"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const epsilon = 1e-12

const inputFiles = {
	predecessorManifest:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.0-development/manifest.json",
	predecessorProtocol:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.0-development/protocol.json",
	predecessorAnalysis:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.0-development/analysis.json",
	predecessorResults:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.0-development/results.json",
	jointParetoResults: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/results.json",
	jointParetoCertificates: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json",
	fieldDominanceResults:
		"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/results.json",
	fieldDominanceInterpretation:
		"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/interpretation.json",
} as const

const implementationFiles = [
	"research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
	"research/src/types.ts",
	"research/audit-joint-palette-threshold-free-collapse-v2.ts",
] as const

type RoleName = "background" | "foreground" | "surface" | "accent"
type Comparison = {
	gradient: { old: boolean }
	roles: Record<RoleName, { old: { rgb: RGB } }>
}
type ParetoResult = { cohort: "development" | "00"; file: string; source: { sha256: string; bytes: number }; comparison: Comparison }
type FrontierEntry = {
	stableKey: string
	fieldState: string
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
	changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
	roles: Record<RoleName, RGB>
}
type Certificate = { minimumBlockFrontier: FrontierEntry[] }
type AuditEntry = {
	file: string
	cohort: "development" | "00"
	source: { sha256: string; bytes: number }
	status: string
	clauses?: Record<string, boolean>
	evidence?: Record<string, number>
	pass?: boolean
}
type Candidate = {
	file: string
	cohort: "development" | "00"
	stableKey: string
	fieldState: "collapsed"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
	roles: Record<RoleName, RGB>
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

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function roleRgb(value: RGB | { rgb: RGB }): RGB {
	return Array.isArray(value) ? value as RGB : value.rgb
}

function semanticKey(candidate: Candidate): string {
	return JSON.stringify({ roles: candidate.roles, state: candidate.fieldState })
}

function isolatedRetainedBackgroundCollapse(candidate: Candidate, comparison: Comparison): boolean {
	const canonical = Object.fromEntries(([
		"background", "foreground", "surface", "accent",
	] as const).map((role) => [role, comparison.roles[role].old.rgb])) as Record<RoleName, RGB>
	return !sameRgb(canonical.background, canonical.surface) && candidate.fieldState === "collapsed" &&
		candidate.changedSemanticBlocks === 1 && candidate.changedSemanticAtoms === 2 &&
		sameRgb(candidate.roles.background, canonical.background) &&
		sameRgb(candidate.roles.surface, canonical.background) &&
		sameRgb(candidate.roles.foreground, canonical.foreground) &&
		sameRgb(candidate.roles.accent, canonical.accent)
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite corrected collapse audit: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

if (process.argv.slice(2).length > 0) throw new Error("audit-joint-palette-threshold-free-collapse-v2.ts does not accept arguments")
await assertOutputAbsent()
const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
	const raw = await readFile(join(projectRoot, path))
	return [name, { path, raw, sha256: sha256(raw) }] as const
}))
const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
const predecessorManifest = parse<{ experimentId: string; sources: Array<{ path: string; sha256: string; bytes: number }> }>(
	"predecessorManifest",
)
const predecessorProtocol = parse<{ hypothesis: unknown; authorization: Record<string, boolean | string[]> }>("predecessorProtocol")
const predecessorAnalysis = parse<{
	experimentId: string
	coverage: Record<string, unknown>
	clauses: Record<string, number>
	partitions: Record<string, unknown>
	exactCandidateCoverage: { knownStrictFieldOnlyCollapseTuples: number }
}>("predecessorAnalysis")
const predecessorResults = parse<{ experimentId: string; entries: AuditEntry[] }>("predecessorResults")
const paretoResults = parse<{ experimentId: string; entries: ParetoResult[] }>("jointParetoResults")
const certificates = parse<{ experimentId: string; entries: Record<string, Certificate> }>("jointParetoCertificates")
const fieldResults = parse<{
	experimentId: string
	entries: Array<{
		file: string
		cohort: "development" | "00"
		candidate: unknown | null
		certificate: { selected: Omit<FrontierEntry, "changedBlocks"> & { roles: Record<RoleName, RGB | { rgb: RGB }> } }
	}>
}>("fieldDominanceResults")
const interpretation = parse<{
	experimentId: string
	disposition: { exactPositiveTupleEvidenceRetained: string[] }
}>("fieldDominanceInterpretation")
if (predecessorManifest.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
	predecessorAnalysis.experimentId !== PREDECESSOR_EXPERIMENT_ID || predecessorResults.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
	paretoResults.experimentId !== JOINT_PARETO_EXPERIMENT_ID || certificates.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
	fieldResults.experimentId !== FIELD_DOMINANCE_EXPERIMENT_ID || interpretation.experimentId !== FIELD_DOMINANCE_EXPERIMENT_ID ||
	predecessorManifest.sources.length !== 392 || predecessorResults.entries.length !== 392 || paretoResults.entries.length !== 392 ||
	predecessorAnalysis.exactCandidateCoverage.knownStrictFieldOnlyCollapseTuples !== 97 ||
	predecessorProtocol.authorization.candidateReviewAuthorized !== false) {
	throw new Error("Corrected collapse audit inputs disagree")
}

const resultByFile = new Map(paretoResults.entries.map((entry) => [entry.file, entry]))
const auditByFile = new Map(predecessorResults.entries.map((entry) => [entry.file, entry]))
const exactCandidates: Candidate[] = []
for (const result of fieldResults.entries) {
	if (!result.candidate) continue
	const selected = result.certificate.selected
	const candidate: Candidate = {
		file: result.file,
		cohort: result.cohort,
		stableKey: selected.stableKey,
		fieldState: "collapsed",
		changedSemanticBlocks: selected.changedSemanticBlocks,
		changedSemanticAtoms: selected.changedSemanticAtoms,
		objectiveDeltas: selected.objectiveDeltas,
		roles: Object.fromEntries(([
			"background", "foreground", "surface", "accent",
		] as const).map((role) => [role, roleRgb(selected.roles[role])])) as Record<RoleName, RGB>,
		sourceExperiment: "field-dominance",
	}
	const comparison = resultByFile.get(result.file)?.comparison
	if (comparison && isolatedRetainedBackgroundCollapse(candidate, comparison)) exactCandidates.push(candidate)
}
for (const [file, certificate] of Object.entries(certificates.entries)) {
	const result = resultByFile.get(file)
	if (!result) throw new Error(`Missing Pareto result: ${file}`)
	for (const selected of certificate.minimumBlockFrontier) {
		if (selected.fieldState !== "collapsed" || !selected.changedBlocks.field || selected.changedBlocks.foreground ||
			selected.changedBlocks.accent || selected.objectiveDeltas.some((delta) => delta < -epsilon) ||
			!selected.objectiveDeltas.some((delta) => delta > epsilon)) continue
		const candidate: Candidate = {
			file,
			cohort: result.cohort,
			stableKey: selected.stableKey,
			fieldState: "collapsed",
			changedSemanticBlocks: selected.changedSemanticBlocks,
			changedSemanticAtoms: selected.changedSemanticAtoms,
			objectiveDeltas: selected.objectiveDeltas,
			roles: selected.roles,
			sourceExperiment: "joint-pareto",
		}
		if (isolatedRetainedBackgroundCollapse(candidate, result.comparison)) exactCandidates.push(candidate)
	}
}
const uniqueCandidates = [...new Map(exactCandidates.map((candidate) =>
	[`${candidate.file}\0${semanticKey(candidate)}`, candidate])).values()]
	.sort((first, second) => first.file.localeCompare(second.file) || first.stableKey.localeCompare(second.stableKey))
const positiveFiles = new Set(interpretation.disposition.exactPositiveTupleEvidenceRetained)
const auditableCandidates = uniqueCandidates.filter((candidate) => auditByFile.get(candidate.file)?.status === "auditable")
const candidateFrontier = auditableCandidates.flatMap((candidate) => {
	const audit = auditByFile.get(candidate.file)
	const source = predecessorManifest.sources.find((entry) => entry.path === candidate.file)
	if (!audit || audit.status !== "auditable" || !audit.pass || !audit.clauses || !audit.evidence || !source) return []
	return [{
		...candidate,
		source,
		audit: { clauses: audit.clauses, evidence: audit.evidence },
		reviewEvidence: positiveFiles.has(candidate.file) && candidate.sourceExperiment === "field-dominance"
			? "exact-positive-transfer" as const
			: "fresh-review-required" as const,
	}]
})
if (uniqueCandidates.length !== 75 || auditableCandidates.length !== 8 || candidateFrontier.length !== 3 ||
	candidateFrontier.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length !== 1 ||
	candidateFrontier.filter((entry) => entry.reviewEvidence === "fresh-review-required").length !== 2) {
	throw new Error(`Corrected collapse candidate accounting disagrees: ${JSON.stringify({
		known: uniqueCandidates.length,
		auditable: auditableCandidates.length,
		passing: candidateFrontier.length,
		transferred: candidateFrontier.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length,
		fresh: candidateFrontier.filter((entry) => entry.reviewEvidence === "fresh-review-required").length,
	})}`)
}

const protocol = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	auditOnly: true,
	supersedesCandidateAccountingFrom: PREDECESSOR_EXPERIMENT_ID,
	hypothesis: predecessorProtocol.hypothesis,
	exactCounterfactual: "(B,F,S,A,noncollapsed) -> (B,F,B,A,collapsed)",
	authorization: {
		developmentOnly: true,
		allowedSourceRoots: ["images", "00"],
		outputUnseenRootsOpened: [] as string[],
		commentsEnterAudit: false,
		filenamesEnterAudit: false,
		colorsEnterAuditBeyondRelationalApcaAndExactSemanticBinding: false,
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
	sources: predecessorManifest.sources,
	implementation,
}
const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
const generatedAt = new Date().toISOString()
const analysis = {
	schemaVersion: 1,
	experimentVersion: EXPERIMENT_VERSION,
	experimentId,
	generatedAt,
	coverage: predecessorAnalysis.coverage,
	clauses: predecessorAnalysis.clauses,
	partitions: predecessorAnalysis.partitions,
	correction: {
		predecessorKnownCandidateCount: 97,
		correctedKnownCandidateCount: uniqueCandidates.length,
		reason: "Candidate accounting now requires the exact retained-background, frozen-overlay collapse counterfactual and separates candidates missing auditable canonical-pair evidence.",
	},
	exactCandidateCoverage: {
		knownIsolatedRetainedBackgroundCollapseTuples: uniqueCandidates.length,
		auditable: auditableCandidates.length,
		passing: candidateFrontier.length,
		exactPositiveTransfers: candidateFrontier.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length,
		freshReviewRequired: candidateFrontier.filter((entry) => entry.reviewEvidence === "fresh-review-required").length,
	},
	reviewedSeparation: { positivePass: 1, negativeFail: 2 },
	disposition: "corrected-audit-complete-candidate-review-authorization-required",
}

await mkdir(outputRoot)
await Promise.all([
	writeExclusive(join(outputRoot, "protocol.json"), protocol),
	writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
	writeExclusive(join(outputRoot, "analysis.json"), analysis),
	writeExclusive(join(outputRoot, "results.json"), { schemaVersion: 1, experimentId, entries: predecessorResults.entries }),
	writeExclusive(join(outputRoot, "candidate-frontier.json"), { schemaVersion: 1, experimentId, entries: candidateFrontier }),
])
process.stderr.write(`Wrote corrected threshold-free collapse audit ${experimentId} to ${outputRoot}\n`)
