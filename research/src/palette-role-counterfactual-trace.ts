import { createHash } from "node:crypto"
import type { Candidate, CandidateSpatialEvidence } from "./candidates.ts"
import {
	CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION,
	CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT,
	type ChromaticRoleCertificate,
} from "./chromatic-role-extract.ts"
import { nameRGB } from "./color-name.ts"
import type { SelectionTrack } from "./corpus-selection.ts"
import type { evaluateJointRoleCounterfactual } from "./joint-palette.ts"
import type {
	PaletteRole00AuditFeedbackEntry,
	PaletteRole00AuditPresentedPalette,
} from "./palette-role-00-audit.ts"
import type { RGB, RoleName } from "./types.ts"

export const PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION = "palette-role-counterfactual-trace-0.1.0-development"
export const PALETTE_ROLE_COUNTERFACTUAL_TRACE_CASE_COUNT = 12
export const PALETTE_ROLE_COUNTERFACTUAL_TRACE_OUTPUT =
	"research/data/experiments/palette-role-counterfactual-trace-0.1.0-development/trace.json"

export const paletteRoleCounterfactualRoles = ["background", "foreground", "surface", "accent"] as const
export const paletteRoleCounterfactualInputFiles = {
	auditManifest: "research/data/experiments/palette-role-00-audit-0.2.0-development/manifest.json",
	feedback: "research/data/experiments/palette-role-00-audit-0.2.0-development/feedback.json",
	completeAnalysis: "research/data/experiments/palette-role-00-audit-0.2.0-development/analysis-complete.json",
	interpretation: "research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json",
	canonicalHoldout: "research/data/holdout-results.json",
	sourceSelection: "research/data/selection.json",
} as const

export const paletteRoleCounterfactualImplementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"gradientDetection.ts",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/region-graph-0.17-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/extract.ts",
	"research/src/palette-role-counterfactual-trace.ts",
	"research/prepare-palette-role-counterfactual-trace.ts",
	"research/tests/palette-role-counterfactual-trace.test.ts",
] as const

export const paletteRoleCounterfactualPolicy = Object.freeze({
	diagnosticOnly: true,
	displayedPaletteJudgmentsAreQualitative: true,
	displayedPaletteJudgmentsAreNonExclusive: true,
	positiveDisplayedPaletteDoesNotRejectAlternatives: true,
	ratingsDoNotIdentifyAUniqueCorrectPalette: true,
	targetHexesAreNotInferredFromComments: true,
	otherThreeDisplayedCanonicalRolesAreFrozen: true,
	productionExtractionBehaviorIsUnchanged: true,
	availabilityOnlySupplementsAreNotProductionSelectable: true,
})

export type PaletteRoleCounterfactualCandidateProvenance =
	| "baseline"
	| "admitted-supplement"
	| "availability-only-supplement"

export type PaletteRoleCounterfactualAdmissionGateName = "maximum-population" | "minimum-text"

export type PaletteRoleCounterfactualCandidateRecord = {
	candidateKey: string
	solverCandidateKey: string
	identitySha256: string
	provenance: PaletteRoleCounterfactualCandidateProvenance
	productionRoleSolverMember: boolean
	supplement: null | {
		anchorDegrees: number
		score: number
		supportingRegionCount: number
		nearestBaselineDistance: number
	}
	admission: null | {
		population: { actual: number; requiredMaximum: number; pass: boolean }
		text: { actual: number; requiredMinimum: number; pass: boolean }
		pass: boolean
		failedGates: PaletteRoleCounterfactualAdmissionGateName[]
	}
	colorName: {
		nearestName: string
		referenceHex: string
		tier: "srgb" | "p3" | "rec2020"
		distance: number
	}
	candidate: Candidate
}

type JointRoleCounterfactualEvaluation = ReturnType<typeof evaluateJointRoleCounterfactual>

export type PaletteRoleCounterfactualAlternative = {
	alternativeId: string
	targetRole: RoleName
	candidateKey: string
	provenance: PaletteRoleCounterfactualCandidateProvenance
	productionSelectable: boolean
	evaluation: JointRoleCounterfactualEvaluation | null
	notEvaluated: null | {
		reason: "availability-only-supplement"
		failedAdmissionGates: PaletteRoleCounterfactualAdmissionGateName[]
	}
}

type CandidatePoolBinding = {
	identitySha256: string
	candidateKeys: string[]
}

export type PaletteRoleCounterfactualCertificateBinding = {
	schemaVersion: number
	algorithmVersion: string
	baselineAlgorithmVersion: string
	availabilityAlgorithmVersion: string
	selectionRule: string
	normalizedImageSha256: string
	availabilityDiagnostics: {
		anchorsEvaluated: number
		qualifiedProposals: number
		alreadyRepresented: number
		suppressedProposals: number
		droppedByCap: number
		selectedSupplements: number
	}
	decision: ChromaticRoleCertificate["decision"]
	solver: {
		guarded: null | {
			schemaVersion: number
			algorithmVersion: string
			baselineAlgorithmVersion: string
			selectionRule: string
			decisionKind: string
			decisionRule: string | null
			selected: string | null
		}
		joint: null | {
			schemaVersion: number
			algorithmVersion: string
			baselineAlgorithmVersion: string
			selectionRule: string
			selectedAdmission: string
			preservedBaseline: boolean
		}
	}
}

export type PaletteRoleCounterfactualTraceCase = {
	caseId: string
	traceOrder: number
	auditOrder: number
	sampleTrack: SelectionTrack
	source: {
		file: string
		sha256: string
		bytes: number
		originalWidth: number
		originalHeight: number
		normalizedWidth: number
		normalizedHeight: number
		normalizedImageSha256: string
	}
	feedback: PaletteRole00AuditFeedbackEntry
	interpretation: {
		evidenceKind: "qualitative-non-exclusive"
		classifications: string[]
		finding: string
	}
	displayedCanonical: PaletteRole00AuditPresentedPalette
	production: {
		extractionAlgorithmVersion: string
		exactScientificEquivalence: true
		certificate: PaletteRoleCounterfactualCertificateBinding
		candidatePools: {
			baseline: CandidatePoolBinding
			augmented: CandidatePoolBinding
			roleSolver: CandidatePoolBinding
		}
	}
	candidates: PaletteRoleCounterfactualCandidateRecord[]
	explicitCollapses: {
		surfaceToBackground: { alternativeId: string; candidateKey: string }
		accentToForeground: { alternativeId: string; candidateKey: string }
	}
	alternatives: PaletteRoleCounterfactualAlternative[]
}

export type PaletteRoleCounterfactualTraceCounts = {
	cases: number
	candidates: number
	baselineCandidates: number
	admittedSupplements: number
	availabilityOnlySupplements: number
	alternatives: number
	evaluatedAlternatives: number
	hardInfeasible: number
	feasibleRankLoss: number
	paretoAdmissible: number
}

export type PaletteRoleCounterfactualTrace = {
	schemaVersion: 1
	traceVersion: typeof PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION
	generatedAt: string
	traceId: string
	policy: typeof paletteRoleCounterfactualPolicy
	provenance: {
		inputs: {
			auditManifest: { path: string; rawSha256: string; manifestId: string }
			feedback: { path: string; rawSha256: string; manifestId: string }
			completeAnalysis: { path: string; rawSha256: string; manifestId: string }
			interpretation: { path: string; rawSha256: string; manifestId: string }
			canonicalHoldout: { path: string; rawSha256: string; semanticSha256: string }
			sourceSelection: { path: string; rawSha256: string; manifestId: string }
		}
		implementation: Record<string, string>
	}
	counts: PaletteRoleCounterfactualTraceCounts
	cases: PaletteRoleCounterfactualTraceCase[]
}

export type PaletteRoleCounterfactualTraceIdentity = Omit<PaletteRoleCounterfactualTrace, "generatedAt" | "traceId">

const sha256Pattern = /^[a-f0-9]{64}$/
const hexPattern = /^#[a-f0-9]{6}$/
const gateNames = [
	"replacement-production-membership",
	"background-role-membership",
	"surface-role-membership",
	"source-foreground-preference-membership",
	"foreground-background-contrast-tier",
	"foreground-surface-contrast-tier",
	"surface-background-distance",
	"natural-accent-not-background",
	"natural-accent-not-foreground",
	"natural-accent-not-surface",
	"natural-accent-background-contrast",
	"natural-accent-background-distance",
	"natural-accent-surface-distance",
	"natural-accent-foreground-distance",
	"natural-accent-chroma-or-foreground-contrast",
	"collapsed-accent-equals-foreground",
	"collapsed-accent-background-contrast",
	"collapsed-accent-background-distance",
	"collapsed-accent-surface-distance",
] as const

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

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function assertFiniteTree(value: unknown, label: string): void {
	if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`)
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertFiniteTree(entry, `${label}[${index}]`))
		return
	}
	if (isRecord(value)) for (const [key, entry] of Object.entries(value)) assertFiniteTree(entry, `${label}.${key}`)
}

function assertSha256(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error(`${label} is not a SHA-256`)
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} is not a positive integer`)
}

function isRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function validateSpatialEvidence(value: unknown, label: string): asserts value is CandidateSpatialEvidence {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["population", "regionIds", "components", "sideCoverage", "field", "detail", "frame"], label)
	if (!Array.isArray(value.regionIds) || !Array.isArray(value.components) || !Array.isArray(value.sideCoverage) ||
		value.sideCoverage.length !== 4 || value.regionIds.some((id) => !Number.isInteger(id) || id < 0) ||
		value.regionIds.some((id, index, ids) => index > 0 && id <= ids[index - 1]) ||
		["population", "field", "detail", "frame"].some((field) => typeof value[field] !== "number") ||
		value.sideCoverage.some((coverage) => typeof coverage !== "number")) throw new Error(`${label} is invalid`)
	for (const [index, component] of value.components.entries()) {
		if (!isRecord(component)) throw new Error(`${label} component ${index} is invalid`)
		exactKeys(component, ["population", "regionIds", "sideCoverage", "saliency", "text"], `${label} component ${index}`)
		if (!Array.isArray(component.regionIds) || !Array.isArray(component.sideCoverage) || component.sideCoverage.length !== 4 ||
			component.regionIds.some((id) => !Number.isInteger(id) || id < 0) ||
			["population", "saliency", "text"].some((field) => typeof component[field] !== "number") ||
			component.sideCoverage.some((coverage) => typeof coverage !== "number")) {
			throw new Error(`${label} component ${index} is invalid`)
		}
	}
}

function validateCandidate(value: unknown, label: string): asserts value is Candidate {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, [
		"id", "rgb", "lab", "hex", "population", "background", "saliency", "text", "chroma", "generated",
		"typographyOnly", "regionIds", "familyId", "spatial", "familySpatial",
	], label)
	if (!Number.isInteger(value.id) || !isRgb(value.rgb) || !Array.isArray(value.lab) || value.lab.length !== 3 ||
		value.lab.some((component) => typeof component !== "number") ||
		typeof value.hex !== "string" || !hexPattern.test(value.hex) || typeof value.generated !== "boolean" ||
		typeof value.typographyOnly !== "boolean" || !Array.isArray(value.regionIds) || !Number.isInteger(value.familyId)) {
		throw new Error(`${label} is invalid`)
	}
	for (const field of ["population", "background", "saliency", "text", "chroma"] as const) {
		if (typeof value[field] !== "number") throw new Error(`${label} ${field} is invalid`)
	}
	validateSpatialEvidence(value.spatial, `${label} spatial`)
	validateSpatialEvidence(value.familySpatial, `${label} family spatial`)
}

function validateDisplayedCanonical(value: unknown, label: string): asserts value is PaletteRole00AuditPresentedPalette {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["roles", "gradient", "score", "metrics", "backgroundSurface"], label)
	if (!isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics) || !isRecord(value.backgroundSurface) ||
		typeof value.score !== "number") throw new Error(`${label} is invalid`)
	exactKeys(value.roles, paletteRoleCounterfactualRoles, `${label} roles`)
	for (const role of paletteRoleCounterfactualRoles) {
		const presented = value.roles[role]
		if (!isRecord(presented)) throw new Error(`${label} ${role} is invalid`)
		exactKeys(presented, ["rgb", "hex", "generated", "sourceDistance", "colorName"], `${label} ${role}`)
		if (!isRgb(presented.rgb) || typeof presented.hex !== "string" || !hexPattern.test(presented.hex) ||
			typeof presented.generated !== "boolean" || typeof presented.sourceDistance !== "number" ||
			!isRecord(presented.colorName)) throw new Error(`${label} ${role} is invalid`)
		exactKeys(presented.colorName, ["nearestName", "referenceHex", "tier", "distance"], `${label} ${role} color name`)
	}
	exactKeys(value.gradient, ["isGradient", "confidence", "coverage", "continuity", "coherence"], `${label} gradient`)
	exactKeys(value.metrics, [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast", "minimumRoleDistance",
		"meanSourceDistance", "meanReconstructionError",
	], `${label} metrics`)
	exactKeys(value.backgroundSurface, ["oklabDistance", "contrast", "exactlyCollapsed", "separation"],
		`${label} background surface`)
}

function solverCandidateKey(candidate: Candidate): string {
	return `${candidate.hex.toLowerCase()}${candidate.generated ? "!" : ""}:${candidate.typographyOnly ? "t" : "g"}:${candidate.id}`
}

export function paletteRoleCounterfactualCandidateIdentity(candidate: Candidate): string {
	return sha256(JSON.stringify(candidate))
}

export function paletteRoleCounterfactualCandidateKey(candidate: Candidate): string {
	return `candidate-${candidate.id}-${paletteRoleCounterfactualCandidateIdentity(candidate).slice(0, 16)}`
}

export function paletteRoleCounterfactualCandidatePoolIdentity(candidates: readonly Candidate[]): string {
	return sha256(JSON.stringify(candidates))
}

export function presentPaletteRoleCounterfactualCandidate(
	candidate: Candidate,
	provenance: PaletteRoleCounterfactualCandidateProvenance,
	supplement: PaletteRoleCounterfactualCandidateRecord["supplement"] = null,
): PaletteRoleCounterfactualCandidateRecord {
	const descriptor = nameRGB(candidate.rgb)
	const isSupplement = provenance !== "baseline"
	if (isSupplement !== (supplement !== null)) throw new Error("Supplement candidate provenance is inconsistent")
	const populationPass = candidate.population <= CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION
	const textPass = candidate.text >= CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT
	const failedGates: PaletteRoleCounterfactualAdmissionGateName[] = []
	if (!populationPass) failedGates.push("maximum-population")
	if (!textPass) failedGates.push("minimum-text")
	const admission = isSupplement ? {
		population: {
			actual: candidate.population,
			requiredMaximum: CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION,
			pass: populationPass,
		},
		text: { actual: candidate.text, requiredMinimum: CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT, pass: textPass },
		pass: populationPass && textPass,
		failedGates,
	} : null
	if (provenance === "admitted-supplement" && !admission?.pass) throw new Error("Admitted supplement fails admission")
	if (provenance === "availability-only-supplement" && admission?.pass) {
		throw new Error("Availability-only supplement passes role admission")
	}
	return {
		candidateKey: paletteRoleCounterfactualCandidateKey(candidate),
		solverCandidateKey: solverCandidateKey(candidate),
		identitySha256: paletteRoleCounterfactualCandidateIdentity(candidate),
		provenance,
		productionRoleSolverMember: provenance !== "availability-only-supplement",
		supplement,
		admission,
		colorName: {
			nearestName: descriptor.nearestName,
			referenceHex: descriptor.nearest.referenceHex,
			tier: descriptor.nearest.tier,
			distance: descriptor.nearest.distance,
		},
		candidate,
	}
}

export function paletteRoleCounterfactualAlternativeId(
	caseId: string,
	targetRole: RoleName,
	candidateIdentitySha256: string,
): string {
	return `prcf-${sha256(`${PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION}\0${caseId}\0${targetRole}\0${candidateIdentitySha256}`).slice(0, 24)}`
}

export function bindPaletteRoleCounterfactualCertificate(
	certificate: ChromaticRoleCertificate,
): PaletteRoleCounterfactualCertificateBinding {
	const guarded = certificate.solver.guarded
	const joint = certificate.solver.joint
	return {
		schemaVersion: certificate.schemaVersion,
		algorithmVersion: certificate.algorithmVersion,
		baselineAlgorithmVersion: certificate.baselineAlgorithmVersion,
		availabilityAlgorithmVersion: certificate.availabilityAlgorithmVersion,
		selectionRule: certificate.selectionRule,
		normalizedImageSha256: certificate.normalizedImageSha256,
		availabilityDiagnostics: {
			anchorsEvaluated: certificate.availability.anchorsEvaluated,
			qualifiedProposals: certificate.availability.qualifiedProposals,
			alreadyRepresented: certificate.availability.alreadyRepresented,
			suppressedProposals: certificate.availability.suppressedProposals,
			droppedByCap: certificate.availability.droppedByCap,
			selectedSupplements: certificate.availability.selectedSupplements,
		},
		decision: certificate.decision,
		solver: {
			guarded: guarded ? {
				schemaVersion: guarded.schemaVersion,
				algorithmVersion: guarded.algorithmVersion,
				baselineAlgorithmVersion: guarded.baselineAlgorithmVersion,
				selectionRule: guarded.selectionRule,
				decisionKind: guarded.decision.kind,
				decisionRule: guarded.decision.rule,
				selected: guarded.decision.selected,
			} : null,
			joint: joint ? {
				schemaVersion: joint.schemaVersion,
				algorithmVersion: joint.algorithmVersion,
				baselineAlgorithmVersion: joint.baselineAlgorithmVersion,
				selectionRule: joint.selectionRule,
				selectedAdmission: joint.selectedAdmission,
				preservedBaseline: joint.preservedBaseline,
			} : null,
		},
	}
}

export function paletteRoleCounterfactualTraceCounts(
	cases: readonly PaletteRoleCounterfactualTraceCase[],
): PaletteRoleCounterfactualTraceCounts {
	const candidates = cases.flatMap((entry) => entry.candidates)
	const alternatives = cases.flatMap((entry) => entry.alternatives)
	return {
		cases: cases.length,
		candidates: candidates.length,
		baselineCandidates: candidates.filter((candidate) => candidate.provenance === "baseline").length,
		admittedSupplements: candidates.filter((candidate) => candidate.provenance === "admitted-supplement").length,
		availabilityOnlySupplements: candidates.filter((candidate) =>
			candidate.provenance === "availability-only-supplement").length,
		alternatives: alternatives.length,
		evaluatedAlternatives: alternatives.filter((alternative) => alternative.evaluation !== null).length,
		hardInfeasible: alternatives.filter((alternative) => alternative.evaluation?.status === "hard-infeasible").length,
		feasibleRankLoss: alternatives.filter((alternative) => alternative.evaluation?.status === "feasible-rank-loss").length,
		paretoAdmissible: alternatives.filter((alternative) =>
			alternative.evaluation?.status === "feasible-pareto-admissible").length,
	}
}

export function paletteRoleCounterfactualTraceId(identity: PaletteRoleCounterfactualTraceIdentity): string {
	return sha256(JSON.stringify(canonicalValue(identity)))
}

function validateCandidateRecord(value: unknown, label: string): asserts value is PaletteRoleCounterfactualCandidateRecord {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, [
		"candidateKey", "solverCandidateKey", "identitySha256", "provenance", "productionRoleSolverMember",
		"supplement", "admission", "colorName", "candidate",
	], label)
	validateCandidate(value.candidate, `${label} candidate`)
	assertSha256(value.identitySha256, `${label} identity`)
	const candidate = value.candidate
	if (value.identitySha256 !== paletteRoleCounterfactualCandidateIdentity(candidate) ||
		value.candidateKey !== paletteRoleCounterfactualCandidateKey(candidate) ||
		value.solverCandidateKey !== solverCandidateKey(candidate) ||
		!(value.provenance === "baseline" || value.provenance === "admitted-supplement" ||
			value.provenance === "availability-only-supplement") || typeof value.productionRoleSolverMember !== "boolean") {
		throw new Error(`${label} identity or provenance is invalid`)
	}
	if (!isRecord(value.colorName)) throw new Error(`${label} color name is invalid`)
	exactKeys(value.colorName, ["nearestName", "referenceHex", "tier", "distance"], `${label} color name`)
	const descriptor = nameRGB(candidate.rgb)
	if (value.colorName.nearestName !== descriptor.nearestName ||
		value.colorName.referenceHex !== descriptor.nearest.referenceHex || value.colorName.tier !== descriptor.nearest.tier ||
		value.colorName.distance !== descriptor.nearest.distance) throw new Error(`${label} color name is stale`)
	if (value.provenance === "baseline") {
		if (value.supplement !== null || value.admission !== null || !value.productionRoleSolverMember) {
			throw new Error(`${label} baseline provenance is invalid`)
		}
		return
	}
	if (!isRecord(value.supplement) || !isRecord(value.admission)) throw new Error(`${label} supplement is invalid`)
	exactKeys(value.supplement, ["anchorDegrees", "score", "supportingRegionCount", "nearestBaselineDistance"],
		`${label} supplement`)
	exactKeys(value.admission, ["population", "text", "pass", "failedGates"], `${label} admission`)
	if (!isRecord(value.admission.population) || !isRecord(value.admission.text) || !Array.isArray(value.admission.failedGates)) {
		throw new Error(`${label} admission is invalid`)
	}
	exactKeys(value.admission.population, ["actual", "requiredMaximum", "pass"], `${label} population admission`)
	exactKeys(value.admission.text, ["actual", "requiredMinimum", "pass"], `${label} text admission`)
	const expected = presentPaletteRoleCounterfactualCandidate(
		candidate,
		value.provenance,
		value.supplement as PaletteRoleCounterfactualCandidateRecord["supplement"],
	)
	if (JSON.stringify(value.admission) !== JSON.stringify(expected.admission) ||
		value.productionRoleSolverMember !== expected.productionRoleSolverMember) {
		throw new Error(`${label} admission is stale`)
	}
}

function validateEvaluation(value: unknown, label: string): asserts value is JointRoleCounterfactualEvaluation {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, [
		"targetRole", "replacementCandidateKey", "incumbentRoles", "replacementRoles", "otherRolesFrozen", "gradient",
		"measurements", "gates", "hardFeasible", "status", "ranking", "collapse",
	], label)
	if (!paletteRoleCounterfactualRoles.includes(value.targetRole as RoleName) || !isRecord(value.incumbentRoles) ||
		!isRecord(value.replacementRoles) || !isRecord(value.otherRolesFrozen) || !Array.isArray(value.gates) ||
		value.gates.length !== gateNames.length || typeof value.hardFeasible !== "boolean" || !isRecord(value.gradient) ||
		!isRecord(value.measurements) || !isRecord(value.collapse)) throw new Error(`${label} is invalid`)
	exactKeys(value.incumbentRoles, paletteRoleCounterfactualRoles, `${label} incumbent roles`)
	exactKeys(value.replacementRoles, paletteRoleCounterfactualRoles, `${label} replacement roles`)
	exactKeys(value.otherRolesFrozen, paletteRoleCounterfactualRoles, `${label} frozen roles`)
	for (const role of paletteRoleCounterfactualRoles) {
		if (typeof value.incumbentRoles[role] !== "string" || typeof value.replacementRoles[role] !== "string" ||
			typeof value.otherRolesFrozen[role] !== "boolean") throw new Error(`${label} role references are invalid`)
		if (role !== value.targetRole && (value.replacementRoles[role] !== value.incumbentRoles[role] ||
			value.otherRolesFrozen[role] !== true)) throw new Error(`${label} does not freeze ${role}`)
	}
	for (const [index, gate] of value.gates.entries()) {
		if (!isRecord(gate)) throw new Error(`${label} gate ${index} is invalid`)
		exactKeys(gate, ["name", "kind", "applicable", "actual", "required", "operator", "pass"], `${label} gate ${index}`)
		if (gate.name !== gateNames[index] || typeof gate.applicable !== "boolean" || typeof gate.pass !== "boolean" ||
			!(gate.kind === "boolean" || gate.kind === "numeric") || !(gate.operator === "equals" || gate.operator === ">=")) {
			throw new Error(`${label} gate ${index} is invalid`)
		}
		if ((gate.kind === "boolean" && (typeof gate.actual !== "boolean" || typeof gate.required !== "boolean" ||
			gate.operator !== "equals")) || (gate.kind === "numeric" && (typeof gate.actual !== "number" ||
			typeof gate.required !== "number" || gate.operator !== ">="))) throw new Error(`${label} gate ${index} types are invalid`)
	}
	exactKeys(value.gradient, [
		"pairChanged", "preservedIncumbent", "incumbent", "selected", "canonicalPair", "strictPair",
		"recomputedCanonicalPairIfDifferent",
	], `${label} gradient`)
	const validateGradient = (gradient: unknown, gradientLabel: string): void => {
		if (!isRecord(gradient)) throw new Error(`${gradientLabel} is invalid`)
		exactKeys(gradient, ["isGradient", "confidence", "coverage", "continuity", "coherence"], gradientLabel)
		if (typeof gradient.isGradient !== "boolean" || ["confidence", "coverage", "continuity", "coherence"].some(
			(field) => typeof gradient[field] !== "number",
		)) throw new Error(`${gradientLabel} is invalid`)
	}
	validateGradient(value.gradient.incumbent, `${label} incumbent gradient`)
	validateGradient(value.gradient.selected, `${label} selected gradient`)
	for (const field of ["canonicalPair", "strictPair", "recomputedCanonicalPairIfDifferent"] as const) {
		if (value.gradient[field] !== null) validateGradient(value.gradient[field], `${label} ${field}`)
	}
	if (typeof value.gradient.pairChanged !== "boolean" || typeof value.gradient.preservedIncumbent !== "boolean") {
		throw new Error(`${label} gradient flags are invalid`)
	}
	const endpointRole = value.targetRole === "background" || value.targetRole === "surface"
	if (endpointRole ? value.gradient.canonicalPair === null || value.gradient.strictPair === null ||
		value.gradient.preservedIncumbent !== false || value.gradient.recomputedCanonicalPairIfDifferent !== null
		: value.gradient.canonicalPair !== null || value.gradient.strictPair !== null || value.gradient.preservedIncumbent !== true) {
		throw new Error(`${label} gradient reporting does not match the target role`)
	}
	exactKeys(value.measurements, [
		"foregroundBackgroundContrast", "foregroundBackgroundRequired", "foregroundSurfaceContrast",
		"foregroundSurfaceRequired", "surfaceBackgroundDistance", "surfaceBackgroundRequired", "accentBackgroundContrast",
		"accentBackgroundDistance", "accentSurfaceDistance", "accentForegroundDistance", "accentChroma",
		"accentForegroundContrast",
	], `${label} measurements`)
	if (Object.values(value.measurements).some((measurement) => typeof measurement !== "number")) {
		throw new Error(`${label} measurements are invalid`)
	}
	exactKeys(value.collapse, ["incumbent", "replacement"], `${label} collapse`)
	for (const field of ["incumbent", "replacement"] as const) {
		if (!isRecord(value.collapse[field])) throw new Error(`${label} collapse ${field} is invalid`)
		exactKeys(value.collapse[field], ["surfaceToBackground", "accentToForeground"], `${label} collapse ${field}`)
		if (typeof value.collapse[field].surfaceToBackground !== "boolean" ||
			typeof value.collapse[field].accentToForeground !== "boolean") throw new Error(`${label} collapse ${field} is invalid`)
	}
	const hardFeasible = value.gates.every((gate) => !gate.applicable || gate.pass)
	if (!(value.status === "hard-infeasible" || value.status === "incumbent" || value.status === "feasible-rank-loss" ||
		value.status === "feasible-pareto-admissible") || value.hardFeasible !== hardFeasible ||
		(hardFeasible === (value.status === "hard-infeasible")) ||
		(hardFeasible ? value.ranking === null : value.ranking !== null)) throw new Error(`${label} feasibility is inconsistent`)
	if (value.ranking !== null) {
		if (!isRecord(value.ranking)) throw new Error(`${label} ranking is invalid`)
		exactKeys(value.ranking, [
			"incumbentObjectives", "replacementObjectives", "objectiveDelta", "incumbentObjectiveMean",
			"replacementObjectiveMean", "objectiveMeanDelta", "objectiveTotalDelta", "productionParetoAdmissible",
			"semanticKey", "changedRoleCount", "gradientChanged",
		], `${label} ranking`)
		for (const vector of [value.ranking.incumbentObjectives, value.ranking.replacementObjectives, value.ranking.objectiveDelta]) {
			if (!Array.isArray(vector) || vector.length !== 5) throw new Error(`${label} objective vector is invalid`)
		}
		const incumbent = value.ranking.incumbentObjectives as number[]
		const replacement = value.ranking.replacementObjectives as number[]
		const delta = value.ranking.objectiveDelta as number[]
		if (delta.some((entry, index) => entry !== replacement[index] - incumbent[index]) ||
			value.ranking.incumbentObjectiveMean !== incumbent.reduce((sum, entry) => sum + entry, 0) / 5 ||
			value.ranking.replacementObjectiveMean !== replacement.reduce((sum, entry) => sum + entry, 0) / 5 ||
			value.ranking.objectiveMeanDelta !== value.ranking.replacementObjectiveMean - value.ranking.incumbentObjectiveMean ||
			value.ranking.objectiveTotalDelta !== delta.reduce((sum, entry) => sum + entry, 0) ||
			typeof value.ranking.productionParetoAdmissible !== "boolean" ||
			(value.status === "feasible-pareto-admissible") !== value.ranking.productionParetoAdmissible) {
			throw new Error(`${label} ranking arithmetic or status is invalid`)
		}
	}
}

function validatePool(
	value: unknown,
	records: ReadonlyMap<string, PaletteRoleCounterfactualCandidateRecord>,
	label: string,
): asserts value is CandidatePoolBinding {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["identitySha256", "candidateKeys"], label)
	assertSha256(value.identitySha256, `${label} identity`)
	if (!Array.isArray(value.candidateKeys) || value.candidateKeys.some((key) => typeof key !== "string" || !records.has(key)) ||
		new Set(value.candidateKeys).size !== value.candidateKeys.length) throw new Error(`${label} candidate keys are invalid`)
	const candidates = value.candidateKeys.map((key) => records.get(key)!.candidate)
	if (value.identitySha256 !== paletteRoleCounterfactualCandidatePoolIdentity(candidates)) {
		throw new Error(`${label} identity is stale`)
	}
}

function validateCertificateBinding(value: unknown, label: string): asserts value is PaletteRoleCounterfactualCertificateBinding {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, [
		"schemaVersion", "algorithmVersion", "baselineAlgorithmVersion", "availabilityAlgorithmVersion", "selectionRule",
		"normalizedImageSha256", "availabilityDiagnostics", "decision", "solver",
	], label)
	if (!Number.isInteger(value.schemaVersion) || typeof value.algorithmVersion !== "string" ||
		typeof value.baselineAlgorithmVersion !== "string" || typeof value.availabilityAlgorithmVersion !== "string" ||
		typeof value.selectionRule !== "string" || !isRecord(value.availabilityDiagnostics) || !isRecord(value.decision) ||
		!isRecord(value.solver)) throw new Error(`${label} is invalid`)
	assertSha256(value.normalizedImageSha256, `${label} normalized image identity`)
	exactKeys(value.availabilityDiagnostics, [
		"anchorsEvaluated", "qualifiedProposals", "alreadyRepresented", "suppressedProposals", "droppedByCap",
		"selectedSupplements",
	], `${label} availability diagnostics`)
	for (const diagnostic of Object.values(value.availabilityDiagnostics)) {
		if (!Number.isInteger(diagnostic) || (diagnostic as number) < 0) throw new Error(`${label} availability is invalid`)
	}
	exactKeys(value.decision, [
		"solverRan", "availableSupplementIds", "admittedSupplementIds", "selectedSupplementIds", "selectedSupplementRoles",
		"changedRoles", "gradientChanged", "emittedTreatment", "accentVisibilityEligible", "accentIdentityEligible",
		"selectedRoleEligible", "collapsedBackgroundEligible", "accentChromaEligible", "collateralRoleChromaEligible",
	], `${label} decision`)
	for (const field of ["availableSupplementIds", "admittedSupplementIds", "selectedSupplementIds"] as const) {
		if (!Array.isArray(value.decision[field]) || value.decision[field].some((id) => !Number.isInteger(id))) {
			throw new Error(`${label} ${field} is invalid`)
		}
	}
	if (!isRecord(value.decision.selectedSupplementRoles) || !Array.isArray(value.decision.changedRoles) ||
		Object.keys(value.decision.selectedSupplementRoles).some((role) => !paletteRoleCounterfactualRoles.includes(role as RoleName)) ||
		value.decision.changedRoles.some((role) => !paletteRoleCounterfactualRoles.includes(role as RoleName))) {
		throw new Error(`${label} role decision is invalid`)
	}
	for (const field of [
		"solverRan", "gradientChanged", "emittedTreatment", "accentVisibilityEligible", "accentIdentityEligible",
		"selectedRoleEligible", "collapsedBackgroundEligible", "accentChromaEligible", "collateralRoleChromaEligible",
	] as const) if (typeof value.decision[field] !== "boolean") throw new Error(`${label} ${field} is invalid`)
	exactKeys(value.solver, ["guarded", "joint"], `${label} solver`)
	if (value.solver.guarded !== null) {
		if (!isRecord(value.solver.guarded)) throw new Error(`${label} guarded solver is invalid`)
		exactKeys(value.solver.guarded, [
			"schemaVersion", "algorithmVersion", "baselineAlgorithmVersion", "selectionRule", "decisionKind", "decisionRule",
			"selected",
		], `${label} guarded solver`)
	}
	if (value.solver.joint !== null) {
		if (!isRecord(value.solver.joint)) throw new Error(`${label} joint solver is invalid`)
		exactKeys(value.solver.joint, [
			"schemaVersion", "algorithmVersion", "baselineAlgorithmVersion", "selectionRule", "selectedAdmission",
			"preservedBaseline",
		], `${label} joint solver`)
	}
}

function validateTraceCase(value: unknown, index: number): asserts value is PaletteRoleCounterfactualTraceCase {
	const label = `Counterfactual case ${index}`
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, [
		"caseId", "traceOrder", "auditOrder", "sampleTrack", "source", "feedback", "interpretation", "displayedCanonical", "production",
		"candidates", "explicitCollapses", "alternatives",
	], label)
	if (typeof value.caseId !== "string" || value.traceOrder !== index + 1 || !Number.isInteger(value.auditOrder) ||
		(value.auditOrder as number) <= 0 ||
		!(value.sampleTrack === "diversity" || value.sampleTrack === "risk" || value.sampleTrack === "random") ||
		!isRecord(value.source) || !isRecord(value.feedback) || !isRecord(value.interpretation) || !isRecord(value.production) ||
		!Array.isArray(value.candidates) || !Array.isArray(value.alternatives) || !isRecord(value.explicitCollapses)) {
		throw new Error(`${label} is invalid`)
	}
	validateDisplayedCanonical(value.displayedCanonical, `${label} displayed canonical`)
	exactKeys(value.source, [
		"file", "sha256", "bytes", "originalWidth", "originalHeight", "normalizedWidth", "normalizedHeight",
		"normalizedImageSha256",
	], `${label} source`)
	if (typeof value.source.file !== "string" || !/^00\/[^/\\]+$/.test(value.source.file)) {
		throw new Error(`${label} source file is invalid`)
	}
	assertSha256(value.source.sha256, `${label} source SHA-256`)
	assertSha256(value.source.normalizedImageSha256, `${label} normalized image SHA-256`)
	for (const field of ["bytes", "originalWidth", "originalHeight", "normalizedWidth", "normalizedHeight"] as const) {
		assertPositiveInteger(value.source[field], `${label} ${field}`)
	}
	exactKeys(value.feedback, ["caseId", "sourceSha256", "skipReason", "overallQuality", "comment", "submittedAt"],
		`${label} feedback`)
	if (value.feedback.caseId !== value.caseId || value.feedback.sourceSha256 !== value.source.sha256 ||
		typeof value.feedback.comment !== "string" || value.feedback.comment.trim().length === 0 ||
		typeof value.feedback.submittedAt !== "string" || !Number.isFinite(Date.parse(value.feedback.submittedAt))) {
		throw new Error(`${label} feedback is invalid`)
	}
	exactKeys(value.interpretation, ["evidenceKind", "classifications", "finding"], `${label} interpretation`)
	if (value.interpretation.evidenceKind !== "qualitative-non-exclusive" ||
		!Array.isArray(value.interpretation.classifications) || value.interpretation.classifications.length === 0 ||
		value.interpretation.classifications.some((classification) => typeof classification !== "string" || classification.length === 0) ||
		typeof value.interpretation.finding !== "string" || value.interpretation.finding.length === 0) {
		throw new Error(`${label} interpretation is invalid`)
	}
	const records = new Map<string, PaletteRoleCounterfactualCandidateRecord>()
	for (const [candidateIndex, record] of value.candidates.entries()) {
		validateCandidateRecord(record, `${label} candidate ${candidateIndex}`)
		if (records.has(record.candidateKey)) throw new Error(`${label} has duplicate candidate identities`)
		records.set(record.candidateKey, record)
	}
	const candidates = value.candidates as PaletteRoleCounterfactualCandidateRecord[]
	const sortedKeys = [...records.keys()].sort(compareAscii)
	if (sortedKeys.some((key, candidateIndex) => key !== candidates[candidateIndex].candidateKey)) {
		throw new Error(`${label} candidates are not deterministically ordered`)
	}
	exactKeys(value.production, ["extractionAlgorithmVersion", "exactScientificEquivalence", "certificate", "candidatePools"],
		`${label} production`)
	if (typeof value.production.extractionAlgorithmVersion !== "string" || value.production.exactScientificEquivalence !== true ||
		!isRecord(value.production.certificate) || !isRecord(value.production.candidatePools)) {
		throw new Error(`${label} production binding is invalid`)
	}
	validateCertificateBinding(value.production.certificate, `${label} certificate`)
	if (value.production.certificate.normalizedImageSha256 !== value.source.normalizedImageSha256) {
		throw new Error(`${label} normalized image identities disagree`)
	}
	exactKeys(value.production.candidatePools, ["baseline", "augmented", "roleSolver"], `${label} candidate pools`)
	validatePool(value.production.candidatePools.baseline, records, `${label} baseline pool`)
	validatePool(value.production.candidatePools.augmented, records, `${label} augmented pool`)
	validatePool(value.production.candidatePools.roleSolver, records, `${label} role solver pool`)
	const baselineKeys = new Set(candidates.filter((record) => record.provenance === "baseline").map((record) => record.candidateKey))
	const roleSolverKeys = new Set(candidates.filter((record) => record.productionRoleSolverMember).map((record) => record.candidateKey))
	const augmentedKeys = new Set(candidates.map((record) => record.candidateKey))
	const supplementCount = candidates.filter((record) => record.provenance !== "baseline").length
	if (value.production.certificate.availabilityDiagnostics.selectedSupplements !== supplementCount) {
		throw new Error(`${label} supplement count disagrees with the certificate`)
	}
	for (const [pool, expected] of [
		[value.production.candidatePools.baseline, baselineKeys],
		[value.production.candidatePools.augmented, augmentedKeys],
		[value.production.candidatePools.roleSolver, roleSolverKeys],
	] as const) {
		if (pool.candidateKeys.length !== expected.size || pool.candidateKeys.some((key) => !expected.has(key))) {
			throw new Error(`${label} candidate pool membership is invalid`)
		}
	}
	const expectedAlternativeCount = candidates.length * paletteRoleCounterfactualRoles.length
	if (value.alternatives.length !== expectedAlternativeCount) throw new Error(`${label} alternative count is invalid`)
	const alternativeIds = new Set<string>()
	for (const [alternativeIndex, alternative] of value.alternatives.entries()) {
		if (!isRecord(alternative)) throw new Error(`${label} alternative ${alternativeIndex} is invalid`)
		exactKeys(alternative, [
			"alternativeId", "targetRole", "candidateKey", "provenance", "productionSelectable", "evaluation", "notEvaluated",
		], `${label} alternative ${alternativeIndex}`)
		const role = paletteRoleCounterfactualRoles[Math.floor(alternativeIndex / candidates.length)]
		const record = candidates[alternativeIndex % candidates.length]
		if (alternative.targetRole !== role || alternative.candidateKey !== record.candidateKey ||
			alternative.provenance !== record.provenance || alternative.productionSelectable !== record.productionRoleSolverMember ||
			alternative.alternativeId !== paletteRoleCounterfactualAlternativeId(value.caseId, role, record.identitySha256) ||
			alternativeIds.has(alternative.alternativeId)) throw new Error(`${label} alternative order or identity is invalid`)
		alternativeIds.add(alternative.alternativeId as string)
		if (record.productionRoleSolverMember) {
			validateEvaluation(alternative.evaluation, `${label} alternative ${alternativeIndex} evaluation`)
			if (alternative.notEvaluated !== null || alternative.evaluation.targetRole !== role ||
				alternative.evaluation.replacementCandidateKey !== record.solverCandidateKey) {
				throw new Error(`${label} evaluated alternative is inconsistent`)
			}
		} else {
			if (alternative.evaluation !== null || !isRecord(alternative.notEvaluated) || record.admission === null) {
				throw new Error(`${label} availability-only alternative was evaluated`)
			}
			exactKeys(alternative.notEvaluated, ["reason", "failedAdmissionGates"], `${label} non-evaluation`)
			if (alternative.notEvaluated.reason !== "availability-only-supplement" ||
				JSON.stringify(alternative.notEvaluated.failedAdmissionGates) !== JSON.stringify(record.admission.failedGates)) {
				throw new Error(`${label} non-evaluation reason is invalid`)
			}
		}
	}
	exactKeys(value.explicitCollapses, ["surfaceToBackground", "accentToForeground"], `${label} collapses`)
	for (const [field, role, collapseField] of [
		["surfaceToBackground", "surface", "surfaceToBackground"],
		["accentToForeground", "accent", "accentToForeground"],
	] as const) {
		const reference = value.explicitCollapses[field]
		if (!isRecord(reference)) throw new Error(`${label} ${field} reference is invalid`)
		exactKeys(reference, ["alternativeId", "candidateKey"], `${label} ${field} reference`)
		const alternative = value.alternatives.find((entry) => entry.alternativeId === reference.alternativeId)
		if (!alternative || alternative.targetRole !== role || alternative.candidateKey !== reference.candidateKey ||
			alternative.evaluation?.collapse.replacement[collapseField] !== true) {
			throw new Error(`${label} ${field} is not a normally enumerated collapse`)
		}
	}
}

export function parsePaletteRoleCounterfactualTrace(value: unknown): PaletteRoleCounterfactualTrace {
	if (!isRecord(value)) throw new Error("Palette role counterfactual trace must be an object")
	assertFiniteTree(value, "Palette role counterfactual trace")
	exactKeys(value, ["schemaVersion", "traceVersion", "generatedAt", "traceId", "policy", "provenance", "counts", "cases"],
		"Palette role counterfactual trace")
	if (value.schemaVersion !== 1 || value.traceVersion !== PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION ||
		typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) || !Array.isArray(value.cases) ||
		!isRecord(value.policy) || !isRecord(value.provenance) || !isRecord(value.counts)) {
		throw new Error("Palette role counterfactual trace header is invalid")
	}
	assertSha256(value.traceId, "Palette role counterfactual trace ID")
	exactKeys(value.policy, Object.keys(paletteRoleCounterfactualPolicy), "Counterfactual policy")
	for (const [key, expected] of Object.entries(paletteRoleCounterfactualPolicy)) {
		if (value.policy[key] !== expected) throw new Error(`Counterfactual policy ${key} is invalid`)
	}
	exactKeys(value.provenance, ["inputs", "implementation"], "Counterfactual provenance")
	if (!isRecord(value.provenance.inputs) || !isRecord(value.provenance.implementation)) {
		throw new Error("Counterfactual provenance is invalid")
	}
	exactKeys(value.provenance.inputs, Object.keys(paletteRoleCounterfactualInputFiles), "Counterfactual input provenance")
	for (const [key, path] of Object.entries(paletteRoleCounterfactualInputFiles)) {
		const input = value.provenance.inputs[key]
		if (!isRecord(input)) throw new Error(`Counterfactual input ${key} is invalid`)
		const canonical = key === "canonicalHoldout"
		exactKeys(input, canonical ? ["path", "rawSha256", "semanticSha256"] : ["path", "rawSha256", "manifestId"],
			`Counterfactual input ${key}`)
		if (input.path !== path) throw new Error(`Counterfactual input ${key} path is invalid`)
		assertSha256(input.rawSha256, `Counterfactual input ${key} raw hash`)
		assertSha256(canonical ? input.semanticSha256 : input.manifestId, `Counterfactual input ${key} identity`)
	}
	exactKeys(value.provenance.implementation, paletteRoleCounterfactualImplementationFiles, "Counterfactual implementation")
	for (const [file, digest] of Object.entries(value.provenance.implementation)) {
		assertSha256(digest, `Counterfactual implementation ${file}`)
	}
	for (const [index, entry] of value.cases.entries()) validateTraceCase(entry, index)
	const trace = value as unknown as PaletteRoleCounterfactualTrace
	if (new Set(trace.cases.map((entry) => entry.caseId)).size !== trace.cases.length ||
		trace.cases.some((entry, index) => index > 0 && entry.auditOrder <= trace.cases[index - 1].auditOrder)) {
		throw new Error("Counterfactual cases are duplicated or not in audit order")
	}
	const expectedCounts = paletteRoleCounterfactualTraceCounts(trace.cases)
	exactKeys(value.counts, Object.keys(expectedCounts), "Counterfactual counts")
	if (JSON.stringify(value.counts) !== JSON.stringify(expectedCounts)) throw new Error("Counterfactual counts are stale")
	const { generatedAt: _generatedAt, traceId, ...identity } = trace
	if (traceId !== paletteRoleCounterfactualTraceId(identity)) throw new Error("Counterfactual trace identity is stale")
	return trace
}

export function createPaletteRoleCounterfactualTrace(
	identity: PaletteRoleCounterfactualTraceIdentity,
	generatedAt = new Date().toISOString(),
): PaletteRoleCounterfactualTrace {
	const trace: PaletteRoleCounterfactualTrace = {
		...identity,
		generatedAt,
		traceId: paletteRoleCounterfactualTraceId(identity),
	}
	return parsePaletteRoleCounterfactualTrace(trace)
}
