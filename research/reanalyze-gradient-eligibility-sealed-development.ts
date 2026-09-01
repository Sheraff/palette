import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"

type Judgment = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "no-visible-difference"
type ReviewedEntry = { familyId: string; judgment: Judgment; evidence: GradientEligibilityEvidence }
type SealedAnalysis = {
	manifestId: string
	candidateVersion: string
	provenance?: { evaluationSha256: string }
	entries: ReviewedEntry[]
}
type EvaluationEntry = {
	familyId: string
	certificate: { baselineGradient: boolean; evidence: GradientEligibilityEvidence | null }
}
type Evaluation = { manifestId: string; entries: EvaluationEntry[] }

const [evaluationArgument, sealedAnalysisArgument, outputArgument] = process.argv.slice(2)
if (!evaluationArgument || !sealedAnalysisArgument || !outputArgument) {
	throw new Error("Usage: reanalyze-gradient-eligibility-sealed-development.ts <sealed-evaluation.json> <sealed-analysis.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

const [evaluationSource, analysisSource, implementationSource] = await Promise.all([
	readFile(resolve(evaluationArgument)),
	readFile(resolve(sealedAnalysisArgument)),
	readFile(fileURLToPath(new URL("./src/gradient-eligibility.ts", import.meta.url))),
])
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
const sealed = JSON.parse(analysisSource.toString("utf8")) as SealedAnalysis
if (evaluation.manifestId !== sealed.manifestId || typeof sealed.candidateVersion !== "string" ||
	sealed.candidateVersion === GRADIENT_ELIGIBILITY_CANDIDATE_VERSION || !Array.isArray(evaluation.entries) ||
	!Array.isArray(sealed.entries) || sealed.provenance?.evaluationSha256 !== undefined &&
	sealed.provenance.evaluationSha256 !== sha256(evaluationSource)) throw new Error("Former sealed evidence is invalid")
const evaluationByFamily = new Map(evaluation.entries.map((entry) => [entry.familyId, entry]))
const reviewed = sealed.entries.map((entry) => {
	const evaluated = evaluationByFamily.get(entry.familyId)
	if (!evaluated?.certificate.baselineGradient || !evaluated.certificate.evidence ||
		evaluated.certificate.evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
		entry.evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Sealed evidence is unavailable for ${entry.familyId}`)
	}
	return { familyId: entry.familyId, judgment: entry.judgment,
		decision: decideGradientEligibility(evaluated.certificate.evidence) }
})
const decisive = reviewed.filter((entry) => entry.judgment === "should-be-gradient" ||
	entry.judgment === "should-not-be-gradient")
const gradients = evaluation.entries.filter((entry) => entry.certificate.baselineGradient).map((entry) => {
	if (!entry.certificate.evidence) throw new Error(`Baseline gradient lacks evidence: ${entry.familyId}`)
	return { familyId: entry.familyId, decision: decideGradientEligibility(entry.certificate.evidence) }
})
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-sealed-development-reanalysis-0.2.0",
	generatedAt: new Date().toISOString(),
	manifestId: sealed.manifestId,
	sourceCandidateVersion: sealed.candidateVersion,
	candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	promotionEligible: false,
	developmentFitOnly: true,
	warning: `This candidate was changed after observing the sealed ${sealed.candidateVersion} result. The corpus is development evidence for this candidate and cannot validate promotion.`,
	provenance: {
		sealedEvaluationSha256: sha256(evaluationSource),
		sealedAnalysisSha256: sha256(analysisSource),
		candidateImplementationSha256: sha256(implementationSource),
	},
	summary: {
		baselineGradients: gradients.length,
		candidateEligible: gradients.filter((entry) => entry.decision.eligible).length,
		candidateRejected: gradients.filter((entry) => !entry.decision.eligible).length,
		reviewJudgments: counts(reviewed.map((entry) => entry.judgment)),
		decisive: decisive.length,
		truePositive: decisive.filter((entry) => entry.judgment === "should-be-gradient" && entry.decision.eligible).length,
		trueNegative: decisive.filter((entry) => entry.judgment === "should-not-be-gradient" && !entry.decision.eligible).length,
		falsePositive: decisive.filter((entry) => entry.judgment === "should-not-be-gradient" && entry.decision.eligible).length,
		falseNegative: decisive.filter((entry) => entry.judgment === "should-be-gradient" && !entry.decision.eligible).length,
	},
	entries: reviewed,
})
process.stderr.write(`Reanalyzed ${reviewed.length} former sealed changes as development data for ${GRADIENT_ELIGIBILITY_CANDIDATE_VERSION}\n`)
