import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import type { Candidate } from "../src/candidates.ts"
import { extractChromaticRolePaletteWithContext } from "../src/chromatic-role-extract.ts"
import { contrastRatio, okDistance } from "../src/color.ts"
import { evaluateJointRoleCounterfactual } from "../src/joint-palette.ts"
import { loadImage } from "../src/image.ts"
import { detectGradient } from "../src/palette.ts"
import {
	PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION,
	createPaletteRoleCounterfactualTrace,
	paletteRoleCounterfactualCandidateIdentity,
	paletteRoleCounterfactualImplementationFiles,
	paletteRoleCounterfactualInputFiles,
	paletteRoleCounterfactualPolicy,
	paletteRoleCounterfactualRoles,
	paletteRoleCounterfactualTraceCounts,
	parsePaletteRoleCounterfactualTrace,
	presentPaletteRoleCounterfactualCandidate,
	type PaletteRoleCounterfactualTraceIdentity,
} from "../src/palette-role-counterfactual-trace.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const representativeFile = "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg"

function emptyTraceIdentity(): PaletteRoleCounterfactualTraceIdentity {
	const hash = "a".repeat(64)
	return {
		schemaVersion: 1,
		traceVersion: PALETTE_ROLE_COUNTERFACTUAL_TRACE_VERSION,
		policy: paletteRoleCounterfactualPolicy,
		provenance: {
			inputs: {
				auditManifest: { path: paletteRoleCounterfactualInputFiles.auditManifest, rawSha256: hash, manifestId: hash },
				feedback: { path: paletteRoleCounterfactualInputFiles.feedback, rawSha256: hash, manifestId: hash },
				completeAnalysis: { path: paletteRoleCounterfactualInputFiles.completeAnalysis, rawSha256: hash, manifestId: hash },
				interpretation: { path: paletteRoleCounterfactualInputFiles.interpretation, rawSha256: hash, manifestId: hash },
				canonicalHoldout: {
					path: paletteRoleCounterfactualInputFiles.canonicalHoldout,
					rawSha256: hash,
					semanticSha256: hash,
				},
				sourceSelection: { path: paletteRoleCounterfactualInputFiles.sourceSelection, rawSha256: hash, manifestId: hash },
			},
			implementation: Object.fromEntries(paletteRoleCounterfactualImplementationFiles.map((file) => [file, hash])),
		},
		counts: paletteRoleCounterfactualTraceCounts([]),
		cases: [],
	}
}

type Evaluation = ReturnType<typeof evaluateJointRoleCounterfactual>

const representative = (async () => {
	const image = await loadImage(join(projectRoot, representativeFile))
	const context = extractChromaticRolePaletteWithContext(image)
	const available = new Set(context.certificate.decision.availableSupplementIds)
	const admitted = new Set(context.certificate.decision.admittedSupplementIds)
	const roleSolverCandidates = context.candidates.filter((candidate) => !available.has(candidate.id) || admitted.has(candidate.id))
	const evaluations: Evaluation[] = []
	for (const role of paletteRoleCounterfactualRoles) {
		for (const candidate of roleSolverCandidates) {
			evaluations.push(evaluateJointRoleCounterfactual(
				roleSolverCandidates,
				context.analysis,
				context.extraction.methods.spatial,
				role,
				candidate,
			))
		}
	}
	return { context, roleSolverCandidates, evaluations }
})()

function gate(evaluation: Evaluation, name: Evaluation["gates"][number]["name"]): Evaluation["gates"][number] {
	return evaluation.gates.find((candidate) => candidate.name === name)!
}

test("trace identity is generated-time independent and schema keys are strict", () => {
	const identity = emptyTraceIdentity()
	const first = createPaletteRoleCounterfactualTrace(identity, "2026-07-21T10:00:00.000Z")
	const second = createPaletteRoleCounterfactualTrace(identity, "2026-07-21T11:00:00.000Z")
	assert.equal(first.traceId, second.traceId)
	assert.equal(parsePaletteRoleCounterfactualTrace(structuredClone(first)).traceId, first.traceId)

	const extra = structuredClone(first) as typeof first & { targetHex?: string }
	extra.targetHex = "#ff0000"
	assert.throws(() => parsePaletteRoleCounterfactualTrace(extra), /unexpected fields/)
})

test("trace policy makes displayed feedback qualitative and non-exclusive", () => {
	assert.equal(paletteRoleCounterfactualPolicy.diagnosticOnly, true)
	assert.equal(paletteRoleCounterfactualPolicy.displayedPaletteJudgmentsAreNonExclusive, true)
	assert.equal(paletteRoleCounterfactualPolicy.positiveDisplayedPaletteDoesNotRejectAlternatives, true)
	assert.equal(paletteRoleCounterfactualPolicy.ratingsDoNotIdentifyAUniqueCorrectPalette, true)
	assert.equal(paletteRoleCounterfactualPolicy.targetHexesAreNotInferredFromComments, true)

	const invalid = createPaletteRoleCounterfactualTrace(emptyTraceIdentity()) as unknown as Record<string, unknown>
	invalid.policy = { ...paletteRoleCounterfactualPolicy, displayedPaletteJudgmentsAreNonExclusive: false }
	assert.throws(() => parsePaletteRoleCounterfactualTrace(invalid), /policy/i)
})

test("every production candidate freezes the other three displayed roles", async () => {
	const { evaluations, roleSolverCandidates } = await representative
	assert.equal(evaluations.length, roleSolverCandidates.length * 4)
	for (const evaluation of evaluations) {
		for (const role of paletteRoleCounterfactualRoles) {
			if (role === evaluation.targetRole) continue
			assert.equal(evaluation.otherRolesFrozen[role], true)
			assert.equal(evaluation.replacementRoles[role], evaluation.incumbentRoles[role])
		}
	}

	const repeated = evaluateJointRoleCounterfactual(
		roleSolverCandidates,
		(await representative).context.analysis,
		(await representative).context.extraction.methods.spatial,
		evaluations[0].targetRole,
		roleSolverCandidates.find((candidate) =>
			paletteRoleCounterfactualCandidateIdentity(candidate) ===
			paletteRoleCounterfactualCandidateIdentity(roleSolverCandidates[0]))!,
	)
	assert.deepEqual(repeated, evaluations[0])
})

test("representative feasible and infeasible gates exactly recompute production constraints", async () => {
	const { context, roleSolverCandidates, evaluations } = await representative
	const surfaceCollapse = evaluations.find((evaluation) =>
		evaluation.targetRole === "surface" && evaluation.collapse.replacement.surfaceToBackground)!
	assert.equal(surfaceCollapse.hardFeasible, true)
	assert.notEqual(surfaceCollapse.ranking, null)
	const palette = context.extraction.methods.spatial
	assert.equal(gate(surfaceCollapse, "foreground-surface-contrast-tier").actual,
		contrastRatio(palette.foreground.rgb, palette.background.rgb))
	assert.equal(gate(surfaceCollapse, "surface-background-distance").actual, 0)
	assert.equal(gate(surfaceCollapse, "surface-background-distance").required, 0.05)
	assert.equal(gate(surfaceCollapse, "surface-background-distance").pass, true)
	assert.deepEqual(surfaceCollapse.gradient.canonicalPair,
		{ isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 })
	assert.deepEqual(surfaceCollapse.gradient.strictPair, surfaceCollapse.gradient.canonicalPair)
	assert.equal(surfaceCollapse.ranking!.objectiveTotalDelta,
		surfaceCollapse.ranking!.objectiveDelta.reduce((sum, value) => sum + value, 0))

	const infeasible = evaluations.find((evaluation) => evaluation.targetRole === "background" &&
		evaluation.replacementCandidateKey === evaluation.incumbentRoles.foreground)!
	assert.equal(infeasible.status, "hard-infeasible")
	assert.equal(infeasible.ranking, null)
	assert.equal(gate(infeasible, "source-foreground-preference-membership").actual, false)
	assert.equal(gate(infeasible, "foreground-background-contrast-tier").actual, 1)

	const backgroundEvaluation = evaluations.find((evaluation) => evaluation.targetRole === "background")!
	const replacement = roleSolverCandidates.find((candidate) =>
		candidate.id === Number(backgroundEvaluation.replacementCandidateKey.split(":").at(-1)))!
	const surface = roleSolverCandidates.find((candidate) =>
		backgroundEvaluation.incumbentRoles.surface.endsWith(`:${candidate.id}`))!
	assert.deepEqual(backgroundEvaluation.gradient.canonicalPair,
		replacement === surface
			? { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
			: detectGradient(replacement, surface, context.analysis))
	assert.deepEqual(backgroundEvaluation.gradient.strictPair,
		replacement === surface
			? { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
			: detectGradient(replacement, surface, context.analysis, { allowSmoothFallback: false }))
	assert.equal(gate(backgroundEvaluation, "surface-background-distance").actual,
		okDistance(replacement.lab, surface.lab))
})

test("surface-to-background and accent-to-foreground collapses are normal alternatives", async () => {
	const { evaluations } = await representative
	const surface = evaluations.filter((evaluation) =>
		evaluation.targetRole === "surface" && evaluation.collapse.replacement.surfaceToBackground)
	const accent = evaluations.filter((evaluation) =>
		evaluation.targetRole === "accent" && evaluation.collapse.replacement.accentToForeground)
	assert.equal(surface.length, 1)
	assert.equal(accent.length, 1)
	assert.equal(gate(accent[0], "collapsed-accent-equals-foreground").applicable, true)
	assert.equal(gate(accent[0], "collapsed-accent-equals-foreground").pass, true)
	assert.equal(gate(accent[0], "natural-accent-not-foreground").applicable, false)
	assert.equal(accent[0].gradient.preservedIncumbent, true)
	assert.deepEqual(accent[0].gradient.selected, accent[0].gradient.incumbent)
	assert.equal(accent[0].gradient.strictPair, null)
})

test("candidate presentation distinguishes baseline, admitted, and availability-only provenance", async () => {
	const { roleSolverCandidates } = await representative
	const source = roleSolverCandidates[0]
	const baseline = presentPaletteRoleCounterfactualCandidate(source, "baseline")
	assert.equal(baseline.productionRoleSolverMember, true)
	assert.equal(baseline.admission, null)
	assert.deepEqual(baseline.candidate.spatial, source.spatial)
	assert.deepEqual(baseline.candidate.familySpatial, source.familySpatial)

	const metadata = { anchorDegrees: 30, score: 0.1, supportingRegionCount: 4, nearestBaselineDistance: 0.1 }
	const admittedCandidate: Candidate = { ...source, id: 100, population: 0.01, text: 0.6 }
	const admitted = presentPaletteRoleCounterfactualCandidate(admittedCandidate, "admitted-supplement", metadata)
	assert.equal(admitted.admission?.pass, true)
	assert.deepEqual(admitted.admission?.failedGates, [])

	const unavailableCandidate: Candidate = { ...source, id: 101, population: 0.03, text: 0.4 }
	const unavailable = presentPaletteRoleCounterfactualCandidate(
		unavailableCandidate,
		"availability-only-supplement",
		metadata,
	)
	assert.equal(unavailable.productionRoleSolverMember, false)
	assert.equal(unavailable.admission?.pass, false)
	assert.deepEqual(unavailable.admission?.failedGates, ["maximum-population", "minimum-text"])
	assert.throws(
		() => presentPaletteRoleCounterfactualCandidate(admittedCandidate, "availability-only-supplement", metadata),
		/passes role admission/,
	)
})
