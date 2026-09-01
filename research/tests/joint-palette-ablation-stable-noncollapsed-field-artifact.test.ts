import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewFeedbackStore, parseNextPaletteReviewManifest } from "../src/next-palette-review-v2.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v2")
const experimentId = "725663bc3520de5d3f1403014a05c0a8d5548eb84b5453d5f3e1077d7dd79dab"

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

test("ablation-stable noncollapsed field artifact is complete, strict, and provenance-bound", async () => {
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>("manifest.json")
	const protocol = await readJson<{
		authorization: Record<string, unknown> & {
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
		states: Record<string, number>
		changes: Record<string, number>
		review: { authorized: boolean; freshBlindedComparisonsRequired: number; diagnosticOnly: boolean }
		disposition: string
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{
			file: string
			canonical: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			candidate: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			certificate: {
				route: string
				selected: { stableKey: string; fieldState: string; changedSemanticBlocks: number; changedSemanticAtoms: number; objectiveDeltas: number[] }
				canonicalOverlayAblation: { stableKey: string; fieldState: string; changedSemanticBlocks: number; changedSemanticAtoms: number; objectiveDeltas: number[] }
				invariants: Record<string, boolean>
			}
			jointCertificate: { selected: { stableKey: string }; ablations: Record<string, { stableKey: string }> }
			structural: { violations: string[] }
		}>
	}>("results.json")
	const frontier = await readJson<{
		experimentId: string
		entries: Array<{
			file: string
			changedRoles: string[]
			gradientChanged: boolean
			selected: { fieldState: string; changedSemanticBlocks: number; changedSemanticAtoms: number; objectiveDeltas: number[] }
		}>
	}>("frontier.json")

	assert.equal(manifest.experimentId, experimentId)
	assert.equal(analysis.experimentId, experimentId)
	assert.equal(results.experimentId, experimentId)
	assert.equal(frontier.experimentId, experimentId)
	assert.equal(protocol.authorization.canonicalPromotionAuthorized, false)
	assert.equal(protocol.authorization.candidateFreezeAuthorized, false)
	assert.equal(protocol.authorization.reserveAccessAuthorized, false)
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(protocol.stoppingRules.unconstrainedSelectionMustEqualCanonicalOverlayAblation, true)
	assert.equal(protocol.stoppingRules.foregroundAndAccentMustRemainCanonical, true)
	assert.equal(protocol.stoppingRules.candidateFieldMustRemainNoncollapsed, true)
	assert.equal(protocol.stoppingRules.everyCandidateMustStrictlyDominateCanonical, true)
	assert.equal(protocol.stoppingRules.noFixedApcaAdmissionFloor, true)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.coverage, {
		totalMatrix: 392,
		ablationStableNoncollapsedFieldCandidates: 9,
		exactReviewTransfers: 0,
		freshReviewRequired: 9,
	})
	assert.deepEqual(analysis.states, { "distinct-flat": 6, gradient: 3 })
	assert.deepEqual(analysis.changes, { oneAtom: 7, twoAtoms: 2, oneBlock: 9 })
	assert.deepEqual(analysis.review,
		{ required: true, authorized: true, freshBlindedComparisonsRequired: 9, diagnosticOnly: true })
	assert.equal(analysis.disposition, "ablation-stable-noncollapsed-field-review-ready")
	assert.equal(manifest.sources.length, 9)
	assert.equal(results.entries.length, 9)
	assert.equal(frontier.entries.length, 9)
	assert.equal(frontier.entries.filter((entry) => entry.changedRoles.length === 0 && entry.gradientChanged).length, 1)

	for (const entry of results.entries) {
		assert.equal(entry.certificate.route, "admitted-field")
		assert.deepEqual(entry.certificate.selected, entry.certificate.canonicalOverlayAblation)
		assert.equal(entry.jointCertificate.selected.stableKey, entry.certificate.selected.stableKey)
		assert.equal(entry.jointCertificate.ablations["canonical-overlay-block"].stableKey,
			entry.certificate.selected.stableKey)
		assert.equal(entry.certificate.selected.changedSemanticBlocks, 1)
		assert.ok(entry.certificate.selected.changedSemanticAtoms === 1 ||
			entry.certificate.selected.changedSemanticAtoms === 2)
		assert.notEqual(entry.certificate.selected.fieldState, "collapsed")
		assert.ok(entry.certificate.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
		assert.ok(entry.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
		assert.deepEqual(entry.candidate.foreground.rgb, entry.canonical.foreground.rgb)
		assert.deepEqual(entry.candidate.accent.rgb, entry.canonical.accent.rgb)
		assert.notDeepEqual(entry.candidate.background.rgb, entry.candidate.surface.rgb)
		assert.deepEqual(entry.structural.violations, [])
		assert.equal(Object.values(entry.certificate.invariants).every(Boolean), true)
	}
	for (const entry of frontier.entries) {
		assert.ok(entry.changedRoles.every((role) => role === "background" || role === "surface"))
		assert.ok(entry.changedRoles.length > 0 || entry.gradientChanged)
		assert.notEqual(entry.selected.fieldState, "collapsed")
		assert.equal(entry.selected.changedSemanticBlocks, 1)
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

test("ablation-stable review exactly covers all nine fresh noncollapsed field candidates", async () => {
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
	const authorization = await readJson<{
		experimentId: string
		review: {
			authorized: boolean
			diagnosticOnly: boolean
			ablationStableNoncollapsedFieldOnly: boolean
			freshBlindedComparisons: number
		}
		prohibitions: Record<string, boolean | string[]>
	}>("review-v2-authorization.json")
	const frontier = await readJson<{
		entries: Array<{
			file: string
			changedRoles: string[]
			gradientChanged: boolean
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
		"joint-palette-ablation-stable-noncollapsed-field-0.1.0-development")
	assert.equal(reviewManifest.entries.length, 9)
	assert.equal(feedback.entries.length, 9)
	assert.equal(plan.status, "targeted-ablation-stable-noncollapsed-field-review-authorized")
	assert.equal(plan.experimentId, experimentId)
	assert.deepEqual(plan.scope, { freshBlindedComparisons: 9, totalBatches: 1, diagnosticOnly: true })
	assert.deepEqual(plan.manifestIds, [reviewManifest.manifestId])
	assert.equal(authorization.experimentId, experimentId)
	assert.deepEqual(authorization.review, {
		authorized: true,
		diagnosticOnly: true,
		ablationStableNoncollapsedFieldOnly: true,
		freshBlindedComparisons: 9,
	})
	assert.equal(authorization.prohibitions.broaderReviewAuthorized, false)
	assert.equal(authorization.prohibitions.canonicalPromotionAuthorized, false)
	assert.equal(authorization.prohibitions.candidateFreezeAuthorized, false)
	assert.equal(authorization.prohibitions.reserveAccessAuthorized, false)
	assert.deepEqual(authorization.prohibitions.outputUnseenRootsOpened, [])
	assert.deepEqual(authorization.prohibitions.sourceRoots, ["images", "00"])
	assert.equal(reviewManifest.entries.filter((entry) =>
		entry.frontierSignature.endsWith("|distinct-flat")).length, 6)
	assert.equal(reviewManifest.entries.filter((entry) =>
		entry.frontierSignature.endsWith("|gradient")).length, 3)

	for (const entry of reviewManifest.entries) {
		const source = frontierByFile.get(entry.source.file)
		assert.ok(source)
		assert.deepEqual(entry.changedRoles, source.changedRoles)
		assert.equal(entry.gradientChanged, source.gradientChanged)
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

test("completed ablation-stable review retains strong evidence but fails the zero-regression gate", async () => {
	const analysis = JSON.parse(await readFile(resolve(reviewRoot, "batch-01-analysis.json"), "utf8")) as {
		manifestId: string
		provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
		quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
		comparison: Record<string, number>
	}
	const interpretation = JSON.parse(await readFile(resolve(reviewRoot, "interpretation.json"), "utf8")) as {
		reviewManifestId: string
		provenance: Record<string, string>
		policy: Record<string, boolean>
		summary: Record<string, number>
		entries: Array<{ file: string; candidateFieldState: string; comparison: string; note: string }>
		successCriteria: Record<string, boolean>
		disposition: Record<string, boolean | string | string[]>
		nextEngineeringGate: { name: string; candidateOrReviewAuthorized: boolean }
	}
	const manifestBytes = await readFile(resolve(reviewRoot, "batch-01-manifest.json"))
	const feedbackBytes = await readFile(resolve(reviewRoot, "batch-01-feedback.json"))

	assert.equal(analysis.manifestId, interpretation.reviewManifestId)
	assert.deepEqual(analysis.coverage, { expected: 9, submitted: 9, eligible: 9, ineligible: 0, complete: true })
	assert.deepEqual(analysis.quality.baseline, { strong: 6, "acceptable-not-ideal": 3 })
	assert.deepEqual(analysis.quality.candidate, { strong: 8, "acceptable-not-ideal": 1 })
	assert.deepEqual(analysis.quality.paired, { "both-positive": 9 })
	assert.deepEqual(analysis.comparison, { "candidate-stronger": 7, "baseline-stronger": 2 })
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestBytes))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.provenance.analyzerSha256,
		sha256(await readFile(resolve(projectRoot, "research/analyze-next-palette-review-v2.ts"))))
	assert.deepEqual(interpretation.summary, {
		reviewed: 9,
		eligible: 9,
		candidatePositive: 9,
		candidateWeakOrUnacceptable: 0,
		candidateStronger: 7,
		baselineStronger: 2,
		bothPositive: 9,
		gradientCandidateStronger: 3,
		distinctFlatCandidateStronger: 4,
		distinctFlatBaselineStronger: 2,
	})
	assert.equal(interpretation.entries.filter((entry) => entry.candidateFieldState === "gradient").length, 3)
	assert.ok(interpretation.entries.filter((entry) => entry.candidateFieldState === "gradient")
		.every((entry) => entry.comparison === "candidate-stronger"))
	assert.equal(interpretation.entries.filter((entry) => entry.note.length > 0).length, 1)
	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsInferred, false)
	assert.equal(interpretation.successCriteria.noWeakOrUnacceptableCandidateJudgments, true)
	assert.equal(interpretation.successCriteria.noBaselineStrongerJudgments, false)
	assert.equal(interpretation.successCriteria.pass, false)
	assert.equal(interpretation.disposition.candidate,
		"stop-ablation-stable-noncollapsed-field-selector-as-complete-replacement-preserve-canonical-0.19")
	assert.equal(interpretation.disposition.admissibilityEvidenceRetained, true)
	assert.equal(interpretation.disposition.rankingEvidenceRetained, true)
	assert.equal((interpretation.disposition.positiveAlternativeFiles as string[]).length, 9)
	assert.equal((interpretation.disposition.exactPreferredTupleFiles as string[]).length, 7)
	assert.equal(interpretation.disposition.extractionChangeAuthorized, false)
	assert.equal(interpretation.disposition.freezeAuthorized, false)
	assert.equal(interpretation.disposition.promotionAuthorized, false)
	assert.equal(interpretation.disposition.broaderReviewAuthorized, false)
	assert.equal(interpretation.disposition.reserveAccessAuthorized, false)
	assert.equal(interpretation.nextEngineeringGate.name, "read-only-noncollapsed-field-ranking-audit")
	assert.equal(interpretation.nextEngineeringGate.candidateOrReviewAuthorized, false)

	for (const [file, hash] of Object.entries(interpretation.provenance)) {
		const path = file === "analyzerSha256"
			? resolve(projectRoot, "research/analyze-joint-palette-ablation-stable-noncollapsed-field-review-v2.ts")
			: resolve(reviewRoot, file)
		assert.equal(sha256(await readFile(path)), hash, file)
	}
})
