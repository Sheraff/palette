import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	parseNextPaletteReviewFeedbackStore as parseFeedbackStoreV2,
	parseNextPaletteReviewManifest as parseManifestV2,
} from "../src/next-palette-review-v2.ts"
import {
	parseNextPaletteReviewFeedbackStore as parseFeedbackStoreV1,
	parseNextPaletteReviewManifest as parseManifestV1,
} from "../src/next-palette-review.ts"
import type { CorpusResult, Palette, RGB, RoleName } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const auditVersion = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const candidateVersion = "joint-palette-compact-relation-dominance-0.1.0-development"
const candidateId = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const auditRoot = resolve(projectRoot, `research/data/experiments/${auditVersion}`)
const candidateRoot = resolve(projectRoot, `research/data/experiments/${candidateVersion}`)
const reviewRoot = resolve(auditRoot, "review-v2")
const roles = ["background", "foreground", "surface", "accent"] as const

const expectedRegistry = [
	{
		manifestPath: "research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-04-manifest.json",
		feedbackPath: null,
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-03-manifest.json",
		feedbackPath: null,
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-manifest.json",
		feedbackPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		manifestPath: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-manifest.json",
		feedbackPath: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-feedback.json",
	},
] as const

type SemanticPalette = {
	roles: Record<RoleName, { rgb: RGB; generated: boolean }>
	gradient: { isGradient: boolean }
}
type AnyManifest = ReturnType<typeof parseManifestV1> | ReturnType<typeof parseManifestV2>
type FrontierEntry = {
	file: string
	cohort: "development" | "00"
	source: { path: string; sha256: string; bytes: number }
	changedRoles: RoleName[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	selected: { changed: boolean; admitted: boolean; fieldState: string; changedSemanticBlocks: number }
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

async function readJson<T>(root: string, file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(root, file), "utf8")) as T
}

function candidateSemantics(palette: Palette): SemanticPalette {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette[role].rgb,
			generated: palette[role].generated,
		}])) as SemanticPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient },
	}
}

function presentedSemantics(palette: AnyManifest["entries"][number]["options"]["A"]): SemanticPalette {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette.roles[role].rgb,
			generated: palette.roles[role].generated,
		}])) as SemanticPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient },
	}
}

function visibleReviewPalette(palette: AnyManifest["entries"][number]["options"]["A"]): SemanticPalette {
	return presentedSemantics(palette)
}

test("compact relation transfer audit has fixed complete provenance and exact 2 + 16 accounting", async () => {
	const protocol = await readJson<{
		experimentVersion: string
		candidateBinding: { candidateExperimentId: string; completeChangedComparisons: number }
		priorV2RegistryAtCreation: {
			manifestCount: number
			feedbackStoreCount: number
			entries: Array<{ manifestPath: string; feedbackPath: string | null }>
			discoveryPolicy: string
		}
		exactIdentityPolicy: { required: string[]; nonIdentifying: string[]; perceptualMatching: boolean }
		inferencePolicy: { commentsEnterInference: boolean; targetColorsConsumed: boolean; fixedApcaAdmissionFloor: null }
		authorization: Record<string, unknown>
	}>(auditRoot, "protocol.json")
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		protocol: typeof protocol
		inputs: {
			candidateArtifacts: Array<{ name: string; path: string; sha256: string }>
			priorV2Registry: Array<{
				manifestPath: string
				manifestSha256: string
				manifestId: string
				presentationVersion: string
				feedbackPath: string | null
				feedbackSha256: string | null
			}>
		}
		sources: Array<{ path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>(auditRoot, "manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number; checks: Record<string, boolean> }
		registry: { manifests: number; feedbackStores: number; presentationVersions: Record<string, number> }
		accounting: Record<string, number | boolean>
		transferChecks: Record<string, boolean>
		review: { authorized: boolean; freshBlindedComparisonsRequired: number; exactPositiveTransfers: number; diagnosticOnly: boolean }
		disposition: string
	}>(auditRoot, "analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{
			source: { sha256: string }
			classification: string
			exactAppearances: Array<{
				manifestPath: string
				priorCaseId: string
				identity: Record<string, boolean>
				reviewed: boolean
				candidateQuality: string | null
				comparison: string | null
			}>
		}>
	}>(auditRoot, "results.json")
	const transfer = await readJson<{
		experimentId: string
		entries: Array<{
			sourceSha256: string
			priorCaseId: string
			sourceEligibility: string
			candidateQuality: string
			comparison: string
			prior: { manifestPath: string; manifestId: string; manifestSha256: string; feedbackPath: string; feedbackSha256: string }
		}>
	}>(auditRoot, "transfer.json")
	const fresh = await readJson<{
		experimentId: string
		entries: Array<FrontierEntry & { novelty: { presentationVersion: string; neverPresentedExactlyInBoundRegistry: boolean } }>
	}>(auditRoot, "fresh-frontier.json")
	const candidateFrontier = await readJson<{ experimentId: string; entries: FrontierEntry[] }>(candidateRoot, "frontier.json")

	assert.equal(protocol.experimentVersion, auditVersion)
	assert.equal(protocol.candidateBinding.candidateExperimentId, candidateId)
	assert.equal(protocol.candidateBinding.completeChangedComparisons, 18)
	assert.equal(protocol.priorV2RegistryAtCreation.manifestCount, 8)
	assert.equal(protocol.priorV2RegistryAtCreation.feedbackStoreCount, 6)
	assert.deepEqual(protocol.priorV2RegistryAtCreation.entries, expectedRegistry)
	assert.equal(protocol.priorV2RegistryAtCreation.discoveryPolicy, "explicit-fixed-registry-no-future-file-discovery")
	assert.deepEqual(protocol.exactIdentityPolicy.required, [
		"same-presentation-version",
		"exact-source-sha256",
		"exact-unblinded-baseline-role-rgb-generated-and-gradient-decision",
		"exact-unblinded-candidate-role-rgb-generated-and-gradient-decision",
	])
	assert.deepEqual(protocol.exactIdentityPolicy.nonIdentifying, ["metrics", "scores", "names", "gradient-confidence"])
	assert.equal(protocol.exactIdentityPolicy.perceptualMatching, false)
	assert.equal(protocol.inferencePolicy.commentsEnterInference, false)
	assert.equal(protocol.inferencePolicy.targetColorsConsumed, false)
	assert.equal(protocol.inferencePolicy.fixedApcaAdmissionFloor, null)
	for (const prohibition of ["broaderReviewAuthorized", "canonicalPromotionAuthorized", "candidateFreezeAuthorized",
		"extractionChangeAuthorized", "reserveAccessAuthorized"]) assert.equal(protocol.authorization[prohibition], false, prohibition)
	assert.equal(protocol.authorization.freshPresentationV2ReviewAuthorized, true)
	assert.equal(protocol.authorization.authorizedFreshComparisonCount, 16)

	assert.deepEqual(manifest.protocol, protocol)
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
	assert.equal(candidateFrontier.experimentId, candidateId)
	assert.equal(manifest.inputs.candidateArtifacts.length, 5)
	assert.deepEqual(manifest.inputs.candidateArtifacts.map((entry) => entry.name),
		["manifest", "protocol", "analysis", "results", "frontier"])
	for (const input of manifest.inputs.candidateArtifacts) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, input.path)
	}
	assert.equal(manifest.inputs.priorV2Registry.length, 8)
	assert.deepEqual(manifest.inputs.priorV2Registry.map((entry) => ({
		manifestPath: entry.manifestPath,
		feedbackPath: entry.feedbackPath,
	})), expectedRegistry)

	const parsedRegistry: Array<{ manifest: AnyManifest; feedback: ReturnType<typeof parseFeedbackStoreV1> | null }> = []
	for (const bound of manifest.inputs.priorV2Registry) {
		const raw = await readFile(resolve(projectRoot, bound.manifestPath))
		assert.equal(sha256(raw), bound.manifestSha256, bound.manifestPath)
		const value = JSON.parse(raw.toString("utf8")) as { presentationVersion?: string }
		const prior = value.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION
			? parseManifestV2(value)
			: parseManifestV1(value)
		assert.equal(prior.manifestId, bound.manifestId)
		assert.equal(prior.presentationVersion, bound.presentationVersion)
		let feedback: ReturnType<typeof parseFeedbackStoreV1> | null = null
		if (bound.feedbackPath !== null) {
			const feedbackRaw = await readFile(resolve(projectRoot, bound.feedbackPath))
			assert.equal(sha256(feedbackRaw), bound.feedbackSha256, bound.feedbackPath)
			const feedbackValue = JSON.parse(feedbackRaw.toString("utf8"))
			feedback = prior.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION
				? parseFeedbackStoreV2(feedbackValue, prior as ReturnType<typeof parseManifestV2>)
				: parseFeedbackStoreV1(feedbackValue, prior as ReturnType<typeof parseManifestV1>)
		}
		parsedRegistry.push({ manifest: prior, feedback })
	}
	assert.equal(parsedRegistry.filter((entry) => entry.feedback !== null).length, 6)
	assert.deepEqual(analysis.registry, {
		manifests: 8,
		feedbackStores: 6,
		presentationVersions: { "next-palette-review-presentation-1": 4, "next-palette-review-presentation-2": 4 },
	})
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(transfer.experimentId, manifest.experimentId)
	assert.equal(fresh.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.ok(Object.values(analysis.structural.checks).every(Boolean))
	assert.ok(Object.values(analysis.transferChecks).every(Boolean))
	assert.deepEqual(analysis.accounting, {
		completeChangedComparisons: 18,
		exactPreviouslyReviewedComparisons: 2,
		eligibleStrongCandidateStrongerTransfers: 2,
		neverPresentedFreshComparisons: 16,
		complete: true,
	})
	assert.deepEqual(analysis.review,
		{ authorized: true, freshBlindedComparisonsRequired: 16, exactPositiveTransfers: 2, diagnosticOnly: true })
	assert.equal(analysis.disposition, "presentation-v2-complete-fresh-frontier-review-authorized")

	const exactResults = results.entries.filter((entry) => entry.exactAppearances.length > 0)
	assert.equal(results.entries.length, 18)
	assert.equal(exactResults.length, 2)
	assert.equal(results.entries.filter((entry) => entry.classification === "never-presented-exactly").length, 16)
	assert.ok(exactResults.every((entry) => entry.exactAppearances.length === 1 &&
		Object.values(entry.exactAppearances[0].identity).every(Boolean) && entry.exactAppearances[0].reviewed &&
		entry.exactAppearances[0].candidateQuality === "strong" && entry.exactAppearances[0].comparison === "candidate-stronger" &&
		entry.exactAppearances[0].manifestPath.includes("joint-palette-ablation-stable-noncollapsed-field")))
	assert.equal(transfer.entries.length, 2)
	assert.deepEqual(new Set(transfer.entries.map((entry) => entry.sourceSha256)),
		new Set(exactResults.map((entry) => entry.source.sha256)))
	for (const entry of transfer.entries) {
		assert.match(entry.priorCaseId, /^npr-[a-f0-9]{20}$/)
		assert.equal(entry.sourceEligibility, "eligible-artwork")
		assert.equal(entry.candidateQuality, "strong")
		assert.equal(entry.comparison, "candidate-stronger")
		assert.equal(sha256(await readFile(resolve(projectRoot, entry.prior.manifestPath))), entry.prior.manifestSha256)
		assert.equal(sha256(await readFile(resolve(projectRoot, entry.prior.feedbackPath))), entry.prior.feedbackSha256)
	}
	assert.equal(fresh.entries.length, 16)
	assert.equal(new Set(fresh.entries.map((entry) => entry.source.sha256)).size, 16)
	assert.ok(fresh.entries.every((entry) => entry.novelty.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION &&
		entry.novelty.neverPresentedExactlyInBoundRegistry && entry.selected.changed && entry.selected.admitted &&
		entry.selected.changedSemanticBlocks === 1 && entry.selected.fieldState !== "collapsed"))
	assert.deepEqual(new Set([...transfer.entries.map((entry) => entry.sourceSha256), ...fresh.entries.map((entry) => entry.source.sha256)]),
		new Set(candidateFrontier.entries.map((entry) => entry.source.sha256)))

	for (const candidate of candidateFrontier.entries) {
		const baseline = candidateSemantics(candidate.baseline)
		const challenger = candidateSemantics(candidate.candidate)
		const exact = parsedRegistry.flatMap(({ manifest: prior }) => prior.entries.filter((entry) =>
			prior.presentationVersion === NEXT_PALETTE_REVIEW_PRESENTATION_VERSION &&
			entry.source.sha256 === candidate.source.sha256 &&
			isDeepStrictEqual(presentedSemantics(entry.assignment.A === "baseline" ? entry.options.A : entry.options.B), baseline) &&
			isDeepStrictEqual(presentedSemantics(entry.assignment.A === "candidate" ? entry.options.A : entry.options.B), challenger)))
		assert.equal(exact.length, transfer.entries.some((entry) => entry.sourceSha256 === candidate.source.sha256) ? 1 : 0,
			candidate.file)
	}
	for (const [file, hash] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
})

test("authorized review is exactly the 16-case provenance-bound presentation-v2 fresh frontier", async () => {
	const auditManifest = await readJson<{ experimentId: string }>(auditRoot, "manifest.json")
	const manifest = parseManifestV2(await readJson(reviewRoot, "batch-01-manifest.json"))
	const feedback = parseFeedbackStoreV2(await readJson(reviewRoot, "batch-01-feedback.json"), manifest)
	const authorization = await readJson<{
		experimentId: string
		candidateExperimentId: string
		baselineAlgorithmVersion: string
		candidateAlgorithmVersion: string
		presentationVersion: string
		boundArtifacts: Record<string, string>
		review: Record<string, unknown>
		inferencePolicy: { commentsDoNotEnterInference: boolean; targetColorsConsumed: boolean; fixedApcaAdmissionFloor: null }
		prohibitions: Record<string, unknown>
	}>(auditRoot, "review-v2-authorization.json")
	const plan = await readJson<{
		status: string
		experimentId: string
		candidateExperimentId: string
		scope: Record<string, number | boolean>
		interpretationPolicy: Record<string, unknown>
		manifestIds: string[]
	}>(reviewRoot, "plan.json")
	const fresh = await readJson<{ entries: FrontierEntry[] }>(auditRoot, "fresh-frontier.json")
	const development = await readJson<CorpusResult>(resolve(projectRoot, "research/data"), "results.json")
	const canonical00 = await readJson<CorpusResult>(resolve(projectRoot, "research/data"), "holdout-results.json")
	const dimensions = new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
		...canonical00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
	])
	const freshBySha = new Map(fresh.entries.map((entry) => [entry.source.sha256, entry]))

	assert.equal(manifest.experimentId, auditManifest.experimentId)
	assert.equal(manifest.baselineAlgorithmVersion, "region-graph-0.19.0")
	assert.equal(manifest.candidateAlgorithmVersion, candidateVersion)
	assert.equal(manifest.presentationVersion, NEXT_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.deepEqual(manifest.batch, { index: 1, size: 16, totalBatches: 1, totalCases: 16 })
	assert.equal(manifest.entries.length, 16)
	assert.equal(feedback.entries.length, 16)
	assert.equal(authorization.experimentId, auditManifest.experimentId)
	assert.equal(authorization.candidateExperimentId, candidateId)
	assert.equal(authorization.baselineAlgorithmVersion, "region-graph-0.19.0")
	assert.equal(authorization.candidateAlgorithmVersion, candidateVersion)
	assert.equal(authorization.presentationVersion, NEXT_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.deepEqual(authorization.review, {
		authorized: true,
		diagnosticOnly: true,
		completeFreshFrontierOnly: true,
		freshBlindedComparisons: 16,
		exactPositiveTransfers: 2,
		completeChangedComparisons: 18,
	})
	assert.deepEqual(authorization.inferencePolicy,
		{ commentsDoNotEnterInference: true, targetColorsConsumed: false, fixedApcaAdmissionFloor: null })
	for (const prohibition of ["broaderReviewAuthorized", "canonicalPromotionAuthorized", "candidateFreezeAuthorized",
		"extractionChangeAuthorized", "reserveAccessAuthorized"]) assert.equal(authorization.prohibitions[prohibition], false, prohibition)
	assert.deepEqual(authorization.prohibitions.outputUnseenRootsOpened, [])
	assert.deepEqual(authorization.prohibitions.sourceRoots, ["images", "00"])
	assert.equal(plan.status, "compact-relation-complete-fresh-frontier-review-authorized")
	assert.equal(plan.experimentId, auditManifest.experimentId)
	assert.equal(plan.candidateExperimentId, candidateId)
	assert.deepEqual(plan.scope, {
		completeChangedComparisons: 18,
		freshBlindedComparisons: 16,
		exactPositiveTransfers: 2,
		totalBatches: 1,
		diagnosticOnly: true,
	})
	assert.equal(plan.interpretationPolicy.commentsDoNotEnterInference, true)
	assert.equal(plan.interpretationPolicy.targetColorsConsumed, false)
	assert.equal(plan.interpretationPolicy.fixedApcaAdmissionFloor, null)
	assert.equal(plan.interpretationPolicy.resultsDoNotAuthorizeBroaderChangesOrPromotion, true)
	assert.deepEqual(plan.manifestIds, [manifest.manifestId])

	const expectedOrder = [...fresh.entries].sort((first, second) =>
		sha256(`${auditManifest.experimentId}\0${first.source.sha256}`).localeCompare(
			sha256(`${auditManifest.experimentId}\0${second.source.sha256}`),
		))
	assert.deepEqual(manifest.entries.map((entry) => entry.source.sha256), expectedOrder.map((entry) => entry.source.sha256))
	for (const [order, entry] of manifest.entries.entries()) {
		const source = freshBySha.get(entry.source.sha256)
		assert.ok(source)
		assert.equal(entry.order, order)
		assert.equal(entry.caseId, `npr-${sha256(`${auditManifest.experimentId}\0${source.source.path}`).slice(0, 20)}`)
		assert.equal(entry.source.file, source.source.path)
		assert.equal(entry.source.bytes, source.source.bytes)
		assert.deepEqual({ width: entry.source.width, height: entry.source.height }, dimensions.get(source.file))
		assert.deepEqual(entry.changedRoles, source.changedRoles)
		assert.equal(entry.gradientChanged, source.gradientChanged)
		const expectedBaselineFirst = Number.parseInt(
			sha256(`${auditManifest.experimentId}\0${source.source.sha256}\0assignment`).slice(0, 2), 16,
		) % 2 === 0
		assert.deepEqual(entry.assignment, expectedBaselineFirst
			? { A: "baseline", B: "candidate" }
			: { A: "candidate", B: "baseline" })
		for (const option of ["A", "B"] as const) {
			const expectedPalette: Palette = entry.assignment[option] === "baseline" ? source.baseline : source.candidate
			assert.deepEqual(visibleReviewPalette(entry.options[option]), candidateSemantics(expectedPalette), `${source.file}:${option}`)
		}
		assert.match(entry.source.file, /^(?:images|00)\/[^/\\]+$/)
		assert.doesNotMatch(entry.source.file, /^(?:10|11|12|13|14)\//)
		const raw = await readFile(resolve(projectRoot, entry.source.file))
		assert.equal(raw.byteLength, entry.source.bytes)
		assert.equal(sha256(raw), entry.source.sha256)
	}

	for (const [file, expected] of Object.entries(authorization.boundArtifacts)) {
		assert.equal(sha256(await readFile(resolve(auditRoot, file))), expected, file)
	}
	for (const [file, expected] of Object.entries({
		...manifest.provenance.implementation,
		...manifest.provenance.presentation,
	})) assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	assert.deepEqual(manifest.provenance.experiment, {
		...authorization.boundArtifacts,
		"review-v2-authorization.json": sha256(await readFile(resolve(auditRoot, "review-v2-authorization.json"))),
	})

	const app = await readFile(resolve(projectRoot, "research/next-palette-review-v2/app.js"), "utf8")
	const css = await readFile(resolve(projectRoot, "research/next-palette-review-v2/styles.css"), "utf8")
	assert.match(app, /<div class="preview-main"><img class="preview-artwork"/)
	assert.match(css, /\.preview-main\s*\{[^}]*background:\s*var\(--path\)/s)
})

test("completed compact relation review validates admissibility but rejects canonical replacement", async () => {
	const analysis = await readJson<{
		experimentId: string
		manifestId: string
		provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
		quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
		comparison: Record<string, number>
		failureClasses: { baseline: Record<string, number>; candidate: Record<string, number> }
		comments: { count: number }
	}>(reviewRoot, "batch-01-analysis.json")
	const interpretation = await readJson<{
		experimentId: string
		candidateExperimentId: string
		reviewManifestId: string
		provenance: Record<string, string>
		policy: Record<string, boolean | null>
		freshReview: Record<string, unknown>
		transferAccounting: Record<string, number | boolean>
		summary: Record<string, number>
		entries: Array<{
			file: string
			sourceSha256: string
			candidateQuality: string
			comparison: string
			evidenceOrigin: string
		}>
		unassessedChangedCases: Array<{ sourceEligibility: string; reason: string }>
		comments: {
			count: number
			inferenceUse: string
			commentsEnterInference: boolean
			targetColorsConsumed: boolean
			categoryCounts: Record<string, number>
			entries: Array<{ category: string; treatment: string }>
		}
		successCriteria: Record<string, boolean | number | string>
		disposition: Record<string, boolean | string | Array<Record<string, string>>>
		nextEngineeringGate: Record<string, boolean | string>
	}>(reviewRoot, "interpretation.json")
	const manifestBytes = await readFile(resolve(reviewRoot, "batch-01-manifest.json"))
	const feedbackBytes = await readFile(resolve(reviewRoot, "batch-01-feedback.json"))

	assert.equal(analysis.experimentId, "e6e9768f1dcbfca8d1bb19ad2ccb38a7120d4e7dc4f2ad300d3dead0eab65ba6")
	assert.equal(analysis.manifestId, "46130c6056e551351d666c63abc1228cb17d160aca8fd136d30c2c6b10aeaf01")
	assert.equal(interpretation.experimentId, analysis.experimentId)
	assert.equal(interpretation.reviewManifestId, analysis.manifestId)
	assert.equal(interpretation.candidateExperimentId, candidateId)
	assert.deepEqual(analysis.coverage, { expected: 16, submitted: 16, eligible: 15, ineligible: 1, complete: true })
	assert.deepEqual(analysis.quality.baseline, { strong: 9, "acceptable-not-ideal": 6 })
	assert.deepEqual(analysis.quality.candidate, { strong: 9, "acceptable-not-ideal": 6 })
	assert.deepEqual(analysis.quality.paired, { "both-positive": 15 })
	assert.deepEqual(analysis.comparison,
		{ "both-similarly-valid": 8, "baseline-stronger": 4, "candidate-stronger": 3 })
	assert.deepEqual(analysis.failureClasses, { baseline: {}, candidate: {} })
	assert.equal(analysis.comments.count, 3)
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestBytes))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.provenance.analyzerSha256,
		sha256(await readFile(resolve(projectRoot, "research/analyze-next-palette-review-v2.ts"))))

	assert.deepEqual(interpretation.freshReview, {
		coverage: { expected: 16, submitted: 16, eligible: 15, ineligible: 1, complete: true },
		quality: {
			baseline: { strong: 9, "acceptable-not-ideal": 6 },
			candidate: { strong: 9, "acceptable-not-ideal": 6 },
			paired: { "both-positive": 15 },
		},
		comparison: { "both-similarly-valid": 8, "baseline-stronger": 4, "candidate-stronger": 3 },
		failureClasses: { baseline: {}, candidate: {} },
	})
	assert.deepEqual(interpretation.transferAccounting, {
		completeChangedComparisons: 18,
		freshComparisons: 16,
		exactEligibleStrongCandidateStrongerTransfers: 2,
		freshAndTransferSourcesDisjoint: true,
		completeChangedSetCovered: true,
	})
	assert.deepEqual(interpretation.summary, {
		combinedAssessedComparisons: 17,
		candidatePositive: 17,
		candidateWeakOrUnacceptable: 0,
		candidateStronger: 5,
		baselineStronger: 4,
		bothSimilarlyValid: 8,
		unassessedIneligibleChangedCases: 1,
	})
	assert.equal(interpretation.entries.length, 17)
	assert.equal(new Set(interpretation.entries.map((entry) => entry.sourceSha256)).size, 17)
	assert.equal(interpretation.entries.filter((entry) => entry.evidenceOrigin === "fresh-review").length, 15)
	assert.equal(interpretation.entries.filter((entry) => entry.evidenceOrigin === "exact-transfer").length, 2)
	assert.ok(interpretation.entries.every((entry) =>
		entry.candidateQuality === "strong" || entry.candidateQuality === "acceptable-not-ideal"))
	assert.ok(interpretation.entries.filter((entry) => entry.evidenceOrigin === "exact-transfer")
		.every((entry) => entry.candidateQuality === "strong" && entry.comparison === "candidate-stronger"))
	assert.deepEqual(interpretation.unassessedChangedCases,
		[{ file: "00/ab67616d0000b273000056ac2ac50a3238511182.jpg",
			sourceSha256: "0d0352f18d3963ed87c7e4bcc0da6576fb608d2d9743d3127bc914371c591645",
			caseId: "npr-a561960f0c3e73b37072", sourceEligibility: "not-album-artwork",
			reason: "ineligible-source-not-album-artwork" }])

	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsConsumed, false)
	assert.equal(interpretation.policy.statisticalThreshold, null)
	assert.equal(interpretation.policy.statisticalThresholdInvented, false)
	assert.equal(interpretation.comments.count, 3)
	assert.equal(interpretation.comments.inferenceUse, "descriptive-only")
	assert.equal(interpretation.comments.commentsEnterInference, false)
	assert.equal(interpretation.comments.targetColorsConsumed, false)
	assert.deepEqual(interpretation.comments.categoryCounts, {
		sharedOverlayAccentAvailabilityOmissionAffectingBothOptions: 2,
		candidateArtworkIdentityLossInChangedField: 1,
	})
	assert.equal(interpretation.comments.entries.filter((entry) =>
		entry.category === "shared-overlay-accent-availability-omission-affecting-both-options").length, 2)
	assert.equal(interpretation.comments.entries.filter((entry) =>
		entry.category === "candidate-artwork-identity-loss-in-changed-field").length, 1)
	assert.ok(interpretation.comments.entries.every((entry) =>
		entry.treatment === "retained-qualitatively-not-used-for-inference"))

	assert.equal(interpretation.successCriteria.canonicalOutputPreservedExactlyForUnchangedSources, true)
	assert.equal(interpretation.successCriteria.structuralViolationsZero, true)
	assert.equal(interpretation.successCriteria.completeChangedSetAccounting, true)
	assert.equal(interpretation.successCriteria.noWeakOrUnacceptableCandidateJudgments, true)
	assert.equal(interpretation.successCriteria.noBaselineStrongerJudgments, false)
	assert.equal(interpretation.successCriteria.atLeastOneCandidateStrongerJudgment, true)
	assert.equal(interpretation.successCriteria.deterministicAblationsAndRecomputableEvidence, true)
	assert.equal(interpretation.successCriteria.unassessedIneligibleChangedCases, 1)
	assert.equal(interpretation.successCriteria.pass, false)
	assert.equal(interpretation.disposition.candidate,
		"stop-compact-relation-dominance-as-complete-canonical-replacement-preserve-region-graph-0.19.0")
	assert.equal(interpretation.disposition.canonicalPreserved, "region-graph-0.19.0")
	assert.equal(interpretation.disposition.compactRelationDominanceValidatedForAdmissibility, true)
	assert.equal(interpretation.disposition.compactRelationDominanceAcceptedAsSufficientRankingAuthority, false)
	assert.equal((interpretation.disposition.positiveNonexclusiveAlternativeEvidence as Array<Record<string, string>>).length, 17)
	assert.equal((interpretation.disposition.exactPreferredTupleEvidence as Array<Record<string, string>>).length, 5)
	for (const prohibition of ["extractionChangeAuthorized", "freezeAuthorized", "promotionAuthorized",
		"broaderReviewAuthorized", "reserveAccessAuthorized"]) {
		assert.equal(interpretation.disposition[prohibition], false, prohibition)
	}
	assert.equal(interpretation.nextEngineeringGate.name, "read-only-field-identity-overlay-availability-audit")
	assert.equal(interpretation.nextEngineeringGate.readOnly, true)
	assert.equal(interpretation.nextEngineeringGate.candidateAutomaticallyAuthorized, false)
	assert.equal(interpretation.nextEngineeringGate.reviewAutomaticallyAuthorized, false)
	assert.equal(interpretation.nextEngineeringGate.candidateOrReviewAuthorized, false)
	assert.equal(interpretation.nextEngineeringGate.commentsMayMotivateButNotDefineSignal, true)

	assert.deepEqual(Object.keys(interpretation.provenance).sort(), [
		"../../../../NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
		`../../${candidateVersion}/analysis.json`,
		`../../${candidateVersion}/frontier.json`,
		`../../${candidateVersion}/manifest.json`,
		`../../${candidateVersion}/protocol.json`,
		`../../${candidateVersion}/results.json`,
		"../analysis.json",
		"../fresh-frontier.json",
		"../manifest.json",
		"../protocol.json",
		"../results.json",
		"../review-v2-authorization.json",
		"../transfer.json",
		"analyzerSha256",
		"batch-01-analysis.json",
		"batch-01-feedback.json",
		"batch-01-manifest.json",
	].sort())
	for (const [file, hash] of Object.entries(interpretation.provenance)) {
		const path = file === "analyzerSha256"
			? resolve(projectRoot, "research/analyze-joint-palette-compact-relation-dominance-review-v2.ts")
			: resolve(reviewRoot, file)
		assert.equal(sha256(await readFile(path)), hash, file)
	}
})
