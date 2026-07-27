import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewFeedbackStore, parseNextPaletteReviewManifest } from "../src/next-palette-review-v2.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v2")
const experimentId = "1f1c0553644479361d822d0d34cac2cdacf352dc26de5d6e7ef35df0a9cf7a6b"

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

async function readJson<T>(file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
}

test("field dominance diagnostic is focused, strict, and provenance-bound", async () => {
	type Certificate = {
		route: string
		selected: {
			changedSemanticBlocks: number
			changedSemanticAtoms: number
			fieldState: string
			objectiveDeltas: number[]
			roles: Record<string, { rgb: number[]; representativePixelIndex: number }>
		}
		minimumBlockFrontier: Array<{ changedBlocks: { field: boolean } }>
		ablations: Record<string, {
			route: string
			changed: boolean
			admitted: boolean
			stableKey: string
			fieldState: string
			changedSemanticBlocks: number
			changedSemanticAtoms: number
			objectives: number[]
			objectiveDeltas: number[]
		}>
		invariants: Record<string, boolean>
	}
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>("manifest.json")
	const protocol = await readJson<{
		authorization: Record<string, unknown> & {
			commentsEnterInference: boolean
			outputUnseenRootsOpened: string[]
			canonicalPromotionAuthorized: boolean
			candidateFreezeAuthorized: boolean
			reserveAccessAuthorized: boolean
		}
		stoppingRules: Record<string, boolean | number>
	}>("protocol.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		coverage: Record<string, number>
		selection: Record<string, number>
		states: Record<string, number>
		review: { authorized: boolean; freshBlindedComparisonsRequired: number; diagnosticOnly: boolean }
		disposition: string
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{ file: string; candidate: unknown | null; certificate: Certificate; structural: { violations: string[] } }>
	}>("results.json")
	const frontier = await readJson<{
		experimentId: string
		entries: Array<{
			file: string
			changedRoles: string[]
			gradientChanged: boolean
			candidate: Record<string, { hex: string }> & { gradient: { isGradient: boolean } }
			selected: Certificate["selected"]
		}>
	}>("frontier.json")

	assert.equal(manifest.experimentId, experimentId)
	assert.equal(protocol.authorization.commentsEnterInference, false)
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(protocol.authorization.canonicalPromotionAuthorized, false)
	assert.equal(protocol.authorization.candidateFreezeAuthorized, false)
	assert.equal(protocol.authorization.reserveAccessAuthorized, false)
	assert.equal(protocol.stoppingRules.everyCandidateMustChangeFieldBlock, true)
	assert.equal(protocol.stoppingRules.everyCandidateMustStrictlyDominateCanonical, true)
	assert.equal(protocol.stoppingRules.minimumSemanticBlocksMustPrecedeCandidatePareto, true)
	assert.equal(analysis.experimentId, experimentId)
	assert.equal(results.experimentId, experimentId)
	assert.equal(frontier.experimentId, experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.coverage,
		{ commentedFieldCases: 13, strictDominatorAvailable: 3, noStrictDominatorAvailable: 10, reviewCases: 3 })
	assert.deepEqual(analysis.selection,
		{ minimumChangedBlocks: 1, maximumChangedBlocks: 1, minimumChangedAtoms: 2, maximumChangedAtoms: 2 })
	assert.deepEqual(analysis.states, { collapsed: 3, "distinct-flat": 0, gradient: 0 })
	assert.equal(analysis.review.authorized, true)
	assert.equal(analysis.review.diagnosticOnly, true)
	assert.equal(analysis.review.freshBlindedComparisonsRequired, 3)
	assert.equal(analysis.disposition, "targeted-field-dominance-review-ready")
	assert.equal(manifest.sources.length, 13)
	assert.equal(results.entries.length, 13)
	assert.equal(results.entries.filter((entry) => entry.candidate).length, 3)
	assert.ok(results.entries.every((entry) => entry.structural.violations.length === 0))
	assert.equal(frontier.entries.length, 3)

	const expected = new Map([
		["00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg",
			{ background: "#020508", foreground: "#fcecf6", surface: "#020508", accent: "#a11210",
				gradientChanged: true }],
		["00/ab67616d0000b2730000061ba1faa181d8e4fca9.jpg",
			{ background: "#011d1c", foreground: "#dccdcb", surface: "#011d1c", accent: "#0341b0",
				gradientChanged: false }],
		["00/ab67616d00001e02000067ea8b55e965960581d5.jpg",
			{ background: "#8f7f7f", foreground: "#0f0e0e", surface: "#8f7f7f", accent: "#b54a26",
				gradientChanged: true }],
	])
	for (const entry of frontier.entries) {
		const expectedRoles = expected.get(entry.file)
		assert.ok(expectedRoles)
		assert.deepEqual(entry.changedRoles, ["surface"])
		assert.equal(entry.gradientChanged, expectedRoles.gradientChanged)
		assert.equal(entry.candidate.gradient.isGradient, false)
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			assert.equal(entry.candidate[role].hex, expectedRoles[role])
		}
		assert.equal(entry.selected.changedSemanticBlocks, 1)
		assert.equal(entry.selected.changedSemanticAtoms, 2)
		assert.equal(entry.selected.fieldState, "collapsed")
		assert.ok(entry.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
		assert.ok(entry.selected.objectiveDeltas.some((delta) => delta > 1e-12))
		const result = results.entries.find((candidate) => candidate.file === entry.file)!
		assert.equal(result.certificate.route, "strict-dominator")
		assert.ok(result.certificate.minimumBlockFrontier.every((candidate) => candidate.changedBlocks.field))
		assert.equal(Object.keys(result.certificate.ablations).length, 8)
		assert.deepEqual(result.certificate.ablations["canonical-field-block"], {
			route: "constraint-conflicts-with-required-field-change",
			changed: false,
			admitted: false,
			stableKey: result.certificate.ablations["canonical-field-block"].stableKey,
			fieldState: result.certificate.ablations["canonical-field-block"].fieldState,
			changedSemanticBlocks: 0,
			changedSemanticAtoms: 0,
			objectives: result.certificate.ablations["canonical-field-block"].objectives,
			objectiveDeltas: [0, 0, 0, 0, 0, 0],
		})
		for (const invariant of Object.values(result.certificate.invariants)) assert.equal(invariant, true)
	}

	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const source of manifest.sources) {
		const bytes = await readFile(resolve(projectRoot, source.path))
		assert.equal(bytes.byteLength, source.bytes, source.path)
		assert.equal(sha256(bytes), source.sha256, source.path)
	}
	for (const [file, hash] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), experimentId)
})

test("field dominance review exactly covers the three authorized strict treatments", async () => {
	const reviewManifest = parseNextPaletteReviewManifest(JSON.parse(await readFile(
		resolve(reviewRoot, "batch-01-manifest.json"), "utf8",
	)) as unknown)
	const feedback = parseNextPaletteReviewFeedbackStore(JSON.parse(await readFile(
		resolve(reviewRoot, "batch-01-feedback.json"), "utf8",
	)) as unknown, reviewManifest)
	const plan = JSON.parse(await readFile(resolve(reviewRoot, "plan.json"), "utf8")) as {
		status: string
		experimentId: string
		scope: { freshBlindedComparisons: number; totalBatches: number; diagnosticOnly: boolean }
		manifestIds: string[]
	}
	const authorization = JSON.parse(await readFile(
		resolve(experimentRoot, "review-v2-authorization.json"), "utf8",
	)) as {
		experimentId: string
		review: { authorized: boolean; diagnosticOnly: boolean; strictFieldDominatorsOnly: boolean; freshBlindedComparisons: number }
		prohibitions: Record<string, boolean | string[]>
	}
	const frontier = await readJson<{
		entries: Array<{
			file: string
			baseline: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			candidate: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
		}>
	}>("frontier.json")
	const frontierByFile = new Map(frontier.entries.map((entry) => [entry.file, entry]))
	const visible = (palette: { roles: Record<string, { rgb: number[] }>; gradient: { isGradient: boolean } }) => ({
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) =>
			[role, palette.roles[role].rgb])),
		gradient: palette.gradient.isGradient,
	})
	const expected = (palette: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }) => ({
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) =>
			[role, palette[role].rgb])),
		gradient: palette.gradient.isGradient,
	})

	assert.equal(reviewManifest.experimentId, experimentId)
	assert.equal(reviewManifest.presentationVersion, "next-palette-review-presentation-2")
	assert.equal(reviewManifest.candidateAlgorithmVersion,
		"joint-palette-field-dominance-first-0.1.0-development")
	assert.equal(reviewManifest.entries.length, 3)
	assert.equal(feedback.entries.length, 3)
	assert.equal(plan.status, "targeted-strict-field-dominance-review-authorized")
	assert.equal(plan.experimentId, experimentId)
	assert.deepEqual(plan.scope, { freshBlindedComparisons: 3, totalBatches: 1, diagnosticOnly: true })
	assert.deepEqual(plan.manifestIds, [reviewManifest.manifestId])
	assert.equal(authorization.experimentId, experimentId)
	assert.deepEqual(authorization.review,
		{ authorized: true, diagnosticOnly: true, strictFieldDominatorsOnly: true, freshBlindedComparisons: 3 })
	assert.equal(authorization.prohibitions.broaderReviewAuthorized, false)
	assert.equal(authorization.prohibitions.canonicalPromotionAuthorized, false)
	assert.equal(authorization.prohibitions.candidateFreezeAuthorized, false)
	assert.equal(authorization.prohibitions.reserveAccessAuthorized, false)
	assert.deepEqual(authorization.prohibitions.outputUnseenRootsOpened, [])
	assert.deepEqual(authorization.prohibitions.sourceRoots, ["images", "00"])

	for (const entry of reviewManifest.entries) {
		const source = frontierByFile.get(entry.source.file)
		assert.ok(source)
		assert.deepEqual(entry.changedRoles, ["surface"])
		for (const option of ["A", "B"] as const) {
			const palette = entry.assignment[option] === "baseline" ? source.baseline : source.candidate
			assert.deepEqual(visible(entry.options[option]), expected(palette))
		}
	}
	for (const [file, hash] of Object.entries(reviewManifest.provenance.experiment)) {
		assert.equal(sha256(await readFile(resolve(experimentRoot, file))), hash, file)
	}
	for (const [file, hash] of Object.entries({
		...reviewManifest.provenance.implementation,
		...reviewManifest.provenance.presentation,
	})) assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
})

test("completed field dominance review rejects generalized collapse", async () => {
	const analysis = JSON.parse(await readFile(resolve(reviewRoot, "batch-01-analysis.json"), "utf8")) as {
		manifestId: string
		provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
		quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
		comparison: Record<string, number>
		entries: unknown[]
	}
	const interpretation = JSON.parse(await readFile(resolve(reviewRoot, "interpretation.json"), "utf8")) as {
		reviewManifestId: string
		provenance: Record<string, string>
		policy: Record<string, boolean>
		summary: {
			reviewed: number
			eligible: number
			candidatePositive: number
			candidateWeakOrUnacceptable: number
			candidateStronger: number
			baselineStronger: number
			allCandidatesCollapsed: boolean
			allChangesIsolatedToFieldBlock: boolean
		}
		entries: Array<{
			comparison: string
			fieldEvidence: { surfaceToBackgroundSupportRatio: number; endpointBalance: number }
			secondaryRelations: { accentOnSurface: { delta: number } }
		}>
		successCriteria: Record<string, boolean>
		disposition: Record<string, boolean | string | string[]>
		nextEngineeringGate: { name: string; candidateOrReviewAuthorized: boolean }
	}
	const manifestBytes = await readFile(resolve(reviewRoot, "batch-01-manifest.json"))
	const feedbackBytes = await readFile(resolve(reviewRoot, "batch-01-feedback.json"))

	assert.equal(analysis.manifestId, interpretation.reviewManifestId)
	assert.deepEqual(analysis.coverage, { expected: 3, submitted: 3, eligible: 3, ineligible: 0, complete: true })
	assert.deepEqual(analysis.quality.baseline, { unacceptable: 1, "weak-fallback": 2 })
	assert.deepEqual(analysis.quality.candidate, { "acceptable-not-ideal": 1, unacceptable: 2 })
	assert.deepEqual(analysis.quality.paired, { "candidate-positive-baseline-negative": 1, "both-negative": 2 })
	assert.deepEqual(analysis.comparison, { "candidate-stronger": 1, "baseline-stronger": 2 })
	assert.equal(analysis.entries.length, 3)
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestBytes))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.provenance.analyzerSha256,
		sha256(await readFile(resolve(projectRoot, "research/analyze-next-palette-review-v2.ts"))))

	assert.deepEqual(interpretation.summary, {
		reviewed: 3,
		eligible: 3,
		candidatePositive: 1,
		candidateWeakOrUnacceptable: 2,
		candidateStronger: 1,
		baselineStronger: 2,
		allCandidatesCollapsed: true,
		allChangesIsolatedToFieldBlock: true,
	})
	const win = interpretation.entries.find((entry) => entry.comparison === "candidate-stronger")!
	const losses = interpretation.entries.filter((entry) => entry.comparison === "baseline-stronger")
	assert.equal(losses.length, 2)
	assert.ok(losses.every((entry) =>
		win.fieldEvidence.surfaceToBackgroundSupportRatio < entry.fieldEvidence.surfaceToBackgroundSupportRatio))
	assert.ok(losses.every((entry) => win.fieldEvidence.endpointBalance < entry.fieldEvidence.endpointBalance))
	assert.ok(losses.some((entry) => entry.secondaryRelations.accentOnSurface.delta < -40))
	assert.equal(interpretation.policy.diagnosticOnly, true)
	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsInferred, false)
	assert.equal(interpretation.successCriteria.pass, false)
	assert.equal(interpretation.successCriteria.noWeakOrUnacceptableCandidateJudgments, false)
	assert.equal(interpretation.successCriteria.noBaselineStrongerJudgments, false)
	assert.equal(interpretation.disposition.candidate,
		"stop-field-dominance-first-collapse-selector-preserve-canonical-0.19")
	assert.equal(interpretation.disposition.extractionChangeAuthorized, false)
	assert.equal(interpretation.disposition.freezeAuthorized, false)
	assert.equal(interpretation.disposition.promotionAuthorized, false)
	assert.equal(interpretation.disposition.broaderReviewAuthorized, false)
	assert.equal(interpretation.disposition.reserveAccessAuthorized, false)
	assert.equal(interpretation.nextEngineeringGate.name, "read-only-collapse-evidence-audit")
	assert.equal(interpretation.nextEngineeringGate.candidateOrReviewAuthorized, false)

	for (const [file, hash] of Object.entries(interpretation.provenance)) {
		const path = file === "analyzerSha256"
			? resolve(projectRoot, "research/analyze-joint-palette-field-dominance-first-review-v2.ts")
			: resolve(reviewRoot, file)
		assert.equal(sha256(await readFile(path)), hash, file)
	}
})
