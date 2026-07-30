import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"
import test, { type TestContext } from "node:test"
import { candidateTreatments, inventoryReviewArtifacts, loadArtifact, sourceInventoryEntries } from "../tools/review-evidence/adapters.ts"
import { normalizeTreatment } from "../tools/review-evidence/normalize.ts"
import {
	artworkHistoricalContext,
	conflictReport,
	exactPairHistory,
	exactTreatmentLookup,
	minimalReviewNeed,
	unresolvedBindingsReport,
	warehouseSummary,
} from "../tools/review-evidence/reports.ts"
import { buildWarehouse, openWarehouse } from "../tools/review-evidence/warehouse.ts"

const source = "1".repeat(64)
const setwiseSource = "2".repeat(64)
const excludedSource = "3".repeat(64)

function treatment(id: string, background: string, foreground = "#ffffff") {
	return {
		id,
		roles: {
			background: { hex: background, generated: false },
			surface: { hex: background, generated: false },
			foreground: { hex: foreground, generated: false },
			accent: { hex: foreground, generated: false },
		},
		gradient: false,
		collapse: { surface: true, accent: true },
	}
}

function gradientTreatment(midpoint?: string) {
	const value = {
		...treatment("gradient:linear:diagonal-down:family-a:family-b:#101010:#202020", "#101010"),
		gradient: true,
		collapse: { surface: false, accent: true },
		...(midpoint ? {
			researchRender: {
				schemaVersion: 1,
				field: {
					kind: "linear-gradient",
					angleDegrees: 135,
					interpolation: "oklab",
					stops: [
						{ kind: "role", role: "background", position: 0 },
						{ kind: "source-supported-color", hex: midpoint, position: 0.5 },
						{ kind: "role", role: "surface", position: 1 },
					],
				},
			},
		} : {}),
	}
	value.roles.surface.hex = "#202020"
	return value
}

async function json(path: string, value: unknown): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true })
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function fixture(context: TestContext): Promise<{ root: string; databasePath: string }> {
	const root = await mkdtemp(join(tmpdir(), "palette-review-warehouse-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const data = join(root, "research", "data")
	const experiment = join(data, "experiments", "album-artwork-palette-v2-fixture")
	const pairManifest = {
		schemaVersion: 1,
		reviewVersion: "pair-v1",
		presentationVersion: "presentation-v1",
		manifestId: "pair-manifest",
		cases: [{
			caseId: "case-1",
			source: { file: "images/one.jpg", sha256: source },
			options: {
				A: treatment("treatment-a", "#101010"),
				B: treatment("treatment-b", "#202020"),
			},
			assignment: { A: "candidate", B: "baseline" },
		}],
	}
	const setwiseManifest = {
		schemaVersion: 1,
		reviewVersion: "setwise-v1",
		reviewUnit: "independent-valid-options",
		candidateVersion: "candidate-v1",
		manifestId: "setwise-manifest",
		cases: [{
			caseId: "case-2",
			sourceSha256: setwiseSource,
			sourcePath: "images/two.jpg",
			options: [
				{ optionId: "A", treatment: treatment("setwise-a", "#303030") },
				{ optionId: "B", treatment: treatment("setwise-b", "#404040") },
			],
		}],
	}
	await json(join(experiment, "review-manifest.private.json"), pairManifest)
	await json(join(experiment, "setwise", "targeted-review-manifest.json"), setwiseManifest)
	await json(join(data, "album-artwork-palette-v2-pair-one-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "pair-v1",
		manifestId: "pair-manifest",
		entries: [{ caseId: "case-1", sourceSha256: source, qualityA: "strong", qualityB: "unacceptable",
			comparison: "a-stronger", tagsA: ["missing gradient"], tagsB: [], comment: "first", submittedAt: "2026-01-01T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-pair-two-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "pair-v1",
		manifestId: "pair-manifest",
		entries: [{ caseId: "case-1", sourceSha256: source, qualityA: "acceptable", qualityB: "unacceptable",
			comparison: "b-stronger", tagsA: [], tagsB: [], comment: "second", submittedAt: "2026-01-02T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-unresolved-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "pair-v1",
		manifestId: "pair-manifest",
		entries: [{ caseId: "case-1", sourceSha256: source, treatmentId: "not-in-manifest", quality: "strong",
			comment: "unresolved", submittedAt: "2026-01-03T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-setwise-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "setwise-v1",
		manifestId: "setwise-manifest",
		entries: [{ caseId: "case-2", sourceSha256: setwiseSource, validOptionIds: ["A"], preferredOptionId: "A",
			noneConfidentlyValid: false, uncertain: false, comment: "B was not selected", submittedAt: "2026-01-04T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-development-panel.json"), {
		schemaVersion: 1,
		sources: [{ caseId: "case-1", path: "images/one.jpg", sha256: source, artworkId: "family-one" }],
	})
	await json(join(data, "album-artwork-palette-v2-phase-4-fast-sample.sealed.json"), {
		schemaVersion: 1,
		sources: [{ caseId: "excluded", path: "12/excluded", sha256: excludedSource, artworkId: "family-excluded" }],
	})
	const databasePath = join(root, "research", ".cache", "palette-review-evidence", "warehouse.sqlite")
	await buildWarehouse({ projectRoot: root, databasePath })
	return { root, databasePath }
}

test("visible identity includes generated/collapse/gradient semantics while render identity retains direction", () => {
	const first = {
		...treatment("gradient:field-domain-1:linear:vertical:family-a:family-b:#101010:#202020", "#101010"),
		gradient: true,
		collapse: { surface: false, accent: true },
	}
	first.roles.surface.hex = "#202020"
	const alternateDirection = structuredClone(first)
	alternateDirection.id = "gradient:field-domain-1:linear:diagonal-up:family-a:family-b:#101010:#202020"
	const generated = structuredClone(first)
	generated.roles.foreground.generated = true
	const normalized = normalizeTreatment(first, { presentationVersion: "v1" })
	const direction = normalizeTreatment(alternateDirection, { presentationVersion: "v1" })
	const generatedNormalized = normalizeTreatment(generated, { presentationVersion: "v1" })
	assert.equal(normalized.treatmentIdentity, direction.treatmentIdentity)
	assert.notEqual(normalized.renderVariantId, direction.renderVariantId)
	assert.notEqual(normalized.treatmentIdentity, generatedNormalized.treatmentIdentity)
})

test("presentation-2 midpoint variants require their own exact absolute evidence while retaining pairwise context", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "palette-review-midpoint-evidence-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const directory = join(root, "research", "data", "experiments", "album-artwork-palette-v2-midpoint-evidence")
	const presentationVersion = "complete-palette-review-v2-presentation-2"
	const omittedSource = "4".repeat(64)
	const explicitSource = "5".repeat(64)
	const omitted = gradientTreatment()
	const explicit = gradientTreatment("#406080")
	const differentExplicit = gradientTreatment("#806040")
	const comparison = treatment("comparison", "#303030")
	const normalizedOmitted = normalizeTreatment(omitted, { presentationVersion })
	const normalizedExplicit = normalizeTreatment(explicit, { presentationVersion })
	const normalizedDifferentExplicit = normalizeTreatment(differentExplicit, { presentationVersion })
	const normalizedComparison = normalizeTreatment(comparison, { presentationVersion })

	assert.equal(normalizedOmitted.treatmentIdentity, normalizedExplicit.treatmentIdentity)
	assert.equal(normalizedOmitted.treatmentIdentity, normalizedDifferentExplicit.treatmentIdentity)
	assert.notEqual(normalizedOmitted.renderVariantId, normalizedExplicit.renderVariantId)
	assert.notEqual(normalizedOmitted.renderVariantId, normalizedDifferentExplicit.renderVariantId)
	assert.notEqual(normalizedExplicit.renderVariantId, normalizedDifferentExplicit.renderVariantId)

	await json(join(directory, "review-manifest.private.json"), {
		schemaVersion: 1,
		reviewVersion: "complete-palette-review-v2",
		presentationVersion,
		manifestId: "midpoint-evidence-manifest",
		cases: [{
			caseId: "omitted-reviewed",
			source: { file: "images/omitted.jpg", sha256: omittedSource },
			options: { A: omitted, B: comparison },
			assignment: { A: "candidate", B: "anchor" },
		}, {
			caseId: "explicit-reviewed",
			source: { file: "images/explicit.jpg", sha256: explicitSource },
			options: { A: explicit, B: comparison },
			assignment: { A: "candidate", B: "anchor" },
		}],
	})
	await json(join(directory, "feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "complete-palette-review-v2",
		manifestId: "midpoint-evidence-manifest",
		entries: [{
			caseId: "omitted-reviewed",
			sourceSha256: omittedSource,
			qualityA: "strong",
			qualityB: "acceptable",
			comparison: "a-stronger",
			issuesA: [],
			issuesB: [],
			comment: "omitted midpoint review",
		}, {
			caseId: "explicit-reviewed",
			sourceSha256: explicitSource,
			qualityA: "strong",
			qualityB: "acceptable",
			comparison: "a-stronger",
			issuesA: [],
			issuesB: [],
			comment: "explicit midpoint review",
		}],
	})

	const databasePath = join(root, "warehouse.sqlite")
	await buildWarehouse({ projectRoot: root, databasePath })
	const candidates = candidateTreatments({
		presentationVersion,
		candidates: [
			{ caseId: "omitted-exact", sourceSha256: omittedSource, treatment: omitted },
			{ caseId: "explicit-against-omitted", sourceSha256: omittedSource, treatment: explicit },
			{ caseId: "explicit-exact", sourceSha256: explicitSource, treatment: explicit },
			{ caseId: "omitted-against-explicit", sourceSha256: explicitSource, treatment: omitted },
			{ caseId: "different-explicit", sourceSha256: explicitSource, treatment: differentExplicit },
		],
	})
	const database = openWarehouse(databasePath)
	try {
		const report = minimalReviewNeed(database, candidates)
		assert.equal(report.reviewNeededCount, 3)
		assert.equal(report.reviewWorkAvoidedCount, 2)
		assert.deepEqual((report.entries as Array<Record<string, unknown>>).map(({ status }) => status), [
			"exact-evidence-reused",
			"incompatible-render-variant",
			"exact-evidence-reused",
			"incompatible-render-variant",
			"incompatible-render-variant",
		])

		for (const mismatch of [{
			sourceSha256: omittedSource,
			renderVariantId: normalizedExplicit.renderVariantId,
			existingRenderVariantId: normalizedOmitted.renderVariantId,
		}, {
			sourceSha256: explicitSource,
			renderVariantId: normalizedOmitted.renderVariantId,
			existingRenderVariantId: normalizedExplicit.renderVariantId,
		}, {
			sourceSha256: explicitSource,
			renderVariantId: normalizedDifferentExplicit.renderVariantId,
			existingRenderVariantId: normalizedExplicit.renderVariantId,
		}]) {
			const lookup = exactTreatmentLookup(database, {
				sourceSha256: mismatch.sourceSha256,
				treatmentIdentity: normalizedOmitted.treatmentIdentity,
				renderVariantId: mismatch.renderVariantId,
			})
			assert.deepEqual(lookup.absoluteJudgments, [])
			const pairwise = lookup.pairwiseAppearances as Array<Record<string, unknown>>
			assert.equal(pairwise.length, 1)
			assert.equal(pairwise[0].left_render_variant_id, mismatch.existingRenderVariantId)
		}

		for (const [sourceSha256, renderVariantId] of [
			[omittedSource, normalizedOmitted.renderVariantId],
			[explicitSource, normalizedExplicit.renderVariantId],
		] as const) {
			const pair = exactPairHistory(database, {
				sourceSha256,
				firstTreatmentIdentity: normalizedOmitted.treatmentIdentity,
				secondTreatmentIdentity: normalizedComparison.treatmentIdentity,
			})
			assert.equal(pair.judgmentCount, 1)
			assert.equal((pair.history as Array<Record<string, unknown>>)[0].left_render_variant_id, renderVariantId)
		}
	} finally {
		database.close()
	}
})

test("warehouse preserves exact V2 judgment types, unblinds pairs, and reports conflicts without flattening", async (context) => {
	const { databasePath } = await fixture(context)
	const database = openWarehouse(databasePath)
	try {
		const summary = warehouseSummary(database)
		assert.deepEqual({
			responses: summary.responses,
			absoluteJudgments: summary.absoluteJudgments,
			pairwiseJudgments: summary.pairwiseJudgments,
			setwiseJudgments: summary.setwiseJudgments,
			unresolvedBindings: summary.unresolvedBindings,
			excludedSources: summary.excludedSources,
		}, { responses: 4, absoluteJudgments: 5, pairwiseJudgments: 2, setwiseJudgments: 1, unresolvedBindings: 1, excludedSources: 1 })

		const lookup = exactTreatmentLookup(database, { sourceSha256: source, rawTreatmentId: "treatment-a" })
		assert.deepEqual(lookup.absoluteQualities, ["acceptable", "strong"])
		assert.equal(lookup.conflictingAbsoluteQualities, true)
		assert.equal((lookup.issueTags as unknown[]).length, 1)
		const artworkHistory = lookup.artworkHistory as ReturnType<typeof artworkHistoricalContext>
		assert.deepEqual(artworkHistory.comments.map((entry) => entry.comment), ["first", "second", "unresolved"])

		const pair = exactPairHistory(database, { sourceSha256: source, firstRawTreatmentId: "treatment-a", secondRawTreatmentId: "treatment-b" })
		assert.equal(pair.judgmentCount, 2)
		assert.deepEqual((pair.history as Array<Record<string, unknown>>).map((entry) => entry.unblinded_outcome),
			["candidate-stronger", "baseline-stronger"])

		const conflicts = conflictReport(database)
		assert.equal(conflicts.absoluteConflictCount, 1)
		assert.equal(conflicts.pairwiseConflictCount, 1)
		const unresolved = unresolvedBindingsReport(database)
		assert.equal(unresolved.unresolvedCount, 1)
		assert.equal((unresolved.unresolved as Array<Record<string, unknown>>)[0].raw_reference, "not-in-manifest")

		const setwiseLookup = exactTreatmentLookup(database, { sourceSha256: setwiseSource, rawTreatmentId: "setwise-a" })
		assert.equal((setwiseLookup.absoluteJudgments as unknown[]).length, 0)
		assert.equal((setwiseLookup.setwiseJudgments as unknown[]).length, 1)
		const unselected = exactTreatmentLookup(database, { sourceSha256: setwiseSource, rawTreatmentId: "setwise-b" })
		assert.equal((unselected.absoluteJudgments as unknown[]).length, 0)
	} finally {
		database.close()
	}
})

test("minimal review requires exact render-compatible absolute evidence and excludes the fast sample", async (context) => {
	const { databasePath } = await fixture(context)
	const candidates = candidateTreatments({
		presentationVersion: "presentation-v1",
		candidates: [
			{ caseId: "conflict", sourceSha256: source, treatment: treatment("treatment-a", "#101010") },
			{ caseId: "reusable", sourceSha256: source, treatment: treatment("treatment-b", "#202020") },
			{ caseId: "excluded", sourceSha256: excludedSource, treatment: treatment("excluded-treatment", "#505050") },
		],
	})
	const database = openWarehouse(databasePath)
	try {
		const report = minimalReviewNeed(database, candidates)
		assert.equal(report.reviewNeededCount, 1)
		assert.equal(report.reviewWorkAvoidedCount, 1)
		assert.equal(report.excludedCount, 1)
		assert.deepEqual((report.entries as Array<Record<string, unknown>>).map((entry) => entry.status),
			["conflicting-exact-evidence", "exact-evidence-reused", "excluded-source"])
		const histories = report.artworkHistory as ReturnType<typeof artworkHistoricalContext>[]
		assert.equal(histories.length, 1)
		assert.deepEqual([...new Set(histories[0].issueTags.map((entry) => entry.tag))], ["missing gradient"])
		assert.deepEqual(histories[0].comments.map((entry) => entry.comment), ["first", "second", "unresolved"])
	} finally {
		database.close()
	}
})

test("expanded adapters preserve binary and scoped judgments while quarantining ambiguous families", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "palette-review-expanded-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const data = join(root, "research", "data")
	const chromatic = join(data, "experiments", "chromatic-role-fixture")
	const topology = join(data, "experiments", "gradient-field-topology-3.0.0-07-validation")
	const pareto = join(data, "experiments", "region-pareto-0.4.0-fixture")
	const first = treatment("first", "#101010")
	const second = treatment("second", "#202020")
	const { collapse: _firstCollapse, ...firstWithoutCollapse } = first
	const { collapse: _secondCollapse, ...secondWithoutCollapse } = second
	await json(join(chromatic, "manifest.json"), {
		schemaVersion: 1, reviewVersion: "chromatic-fixture-v1", manifestId: "chromatic-manifest",
		entries: [{ caseId: "chromatic-case", source: { file: "00/chromatic.jpg", sha256: source },
			options: { A: firstWithoutCollapse, B: secondWithoutCollapse }, assignment: { A: "candidate", B: "baseline" } }],
	})
	await json(join(chromatic, "review-feedback.json"), {
		schemaVersion: 1, reviewVersion: "chromatic-fixture-v1", manifestId: "chromatic-manifest",
		entries: [{ caseId: "chromatic-case", sourceSha256: source, qualityA: "strong", qualityB: "weak",
			preference: "a-stronger", failureClassesA: [], failureClassesB: [], note: "" }],
	})
	await json(join(topology, "review.json"), {
		schemaVersion: 1, reviewVersion: "topology-fixture-v1", manifestId: "topology-manifest",
		entries: [{ familyId: "family", pairSha256: "4".repeat(64), anchor: { file: "00/topology.jpg", sha256: setwiseSource } }],
	})
	await json(join(topology, "feedback.json"), {
		schemaVersion: 1, reviewVersion: "topology-fixture-v1",
		entries: [{ familyId: "family", pairSha256: "4".repeat(64), decision: "should-be-gradient", comment: "" }],
	})
	await json(join(data, "feedback.json"), {
		schemaVersion: 2,
		entries: [{ id: "legacy-one", image: "legacy.jpg", leftMethod: "quantized", rightMethod: "spatial",
			choice: "right", reasons: ["unfaithful"], note: "", timestamp: "2026-01-01T00:00:00Z" }],
	})
	await json(join(pareto, "feedback.json"), {
		schemaVersion: 1, reviewVersion: "pareto-fixture-v1", entries: [{ caseId: "one" }, { caseId: "two" }],
	})
	const emptyScratchFeedback = join(data, "scratch", "album-artwork-palette-v2", "review", "working-v2", "feedback.json")
	await json(emptyScratchFeedback, {
		schemaVersion: 1, reviewVersion: "complete-palette-review-v2", manifestId: "working-manifest", entries: [],
	})
	const currentReviewDirectory = join(data, "scratch", "album-artwork-palette-v2", "review", "submitted")
	const submittedScratchFeedback = join(currentReviewDirectory, "feedback.json")
	await json(join(currentReviewDirectory, "manifest.json"), {
		schemaVersion: 1, reviewVersion: "complete-palette-review-v2", presentationVersion: "presentation-v1",
		manifestId: "submitted-manifest", cases: [{
			caseId: "submitted", source: { file: "images/one.jpg", sha256: source },
			options: { A: first, B: second }, assignment: { A: "candidate", B: "anchor" },
		}],
	})
	await json(submittedScratchFeedback, {
		schemaVersion: 1, reviewVersion: "complete-palette-review-v2", manifestId: "submitted-manifest",
		entries: [{ caseId: "submitted", sourceSha256: source, qualityA: "strong", qualityB: "weak",
			comparison: "a-stronger", issuesA: [], issuesB: [], comment: "current review" }],
	})
	await json(join(data, "album-artwork-palette-v2-phase-4-fast-sample.sealed.json"), {
		schemaVersion: 1,
		selections: [{ familyId: "excluded-family", source: { path: "12/excluded", sha256: excludedSource } }],
	})
	const directlyLoadedScratch = await loadArtifact(root, emptyScratchFeedback, "feedback")
	assert.equal(directlyLoadedScratch.adapterId, "empty-feedback-v1")
	assert.equal((await inventoryReviewArtifacts(root)).some((artifact) => artifact.path.includes("/scratch/")), false)
	const currentInventory = await inventoryReviewArtifacts(root, { currentReviewPaths: [submittedScratchFeedback] })
	assert.equal(currentInventory.some((artifact) => artifact.absolutePath === submittedScratchFeedback), true)
	assert.equal(currentInventory.some((artifact) => artifact.absolutePath === join(currentReviewDirectory, "manifest.json")), true)
	assert.equal(currentInventory.some((artifact) => artifact.absolutePath === emptyScratchFeedback), false)
	const databasePath = join(root, "warehouse.sqlite")
	const stats = await buildWarehouse({ projectRoot: root, databasePath, currentReviewPaths: [submittedScratchFeedback] })
	assert.deepEqual({
		feedbackStores: stats.feedbackStores,
		totalSubmissions: stats.totalSubmissions,
		boundStores: stats.boundStores,
		boundSubmissions: stats.boundSubmissions,
		quarantinedStores: stats.quarantinedStores,
		quarantinedSubmissions: stats.quarantinedSubmissions,
		binaryJudgments: stats.binaryJudgments,
		scopedJudgments: stats.scopedJudgments,
		unresolvedBindings: stats.unresolvedBindings,
		excludedSources: stats.excludedSources,
	}, {
		feedbackStores: 5, totalSubmissions: 6, boundStores: 4, boundSubmissions: 4,
		quarantinedStores: 1, quarantinedSubmissions: 2, binaryJudgments: 1, scopedJudgments: 1,
		unresolvedBindings: 0, excludedSources: 1,
	})
	const database = openWarehouse(databasePath)
	try {
		const treatmentJson = database.prepare(`SELECT visible_json FROM treatments ORDER BY treatment_identity LIMIT 1`).get() as { visible_json: string }
		assert.deepEqual(JSON.parse(treatmentJson.visible_json).collapse, { accent: null, surface: null })
		assert.equal((database.prepare(`SELECT unblinded_outcome FROM binary_judgments`).get() as { unblinded_outcome: string }).unblinded_outcome,
			"spatial")
		assert.equal((database.prepare(`SELECT scope_identity FROM scoped_judgments`).get() as { scope_identity: string }).scope_identity,
			"4".repeat(64))
		assert.equal((database.prepare(`SELECT binding_status FROM responses WHERE artifact_path LIKE '%/submitted/feedback.json'`).get() as
			{ binding_status: string }).binding_status, "bound")
		assert.equal((database.prepare(`SELECT count(*) AS count FROM pairwise_judgments p
			JOIN responses r ON r.id = p.response_id WHERE r.artifact_path LIKE '%/submitted/feedback.json'`).get() as
			{ count: number }).count, 1)
	} finally {
		database.close()
	}
})

test("current complete-palette absolute reviews bind their sole treatment exactly", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "palette-review-absolute-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const directory = join(root, "research", "data", "scratch", "album-artwork-palette-v2", "review", "current")
	const feedbackPath = join(directory, "feedback.json")
	const reviewed = treatment("reviewed", "#101010")
	await json(join(directory, "manifest.json"), {
		schemaVersion: 1,
		reviewVersion: "complete-palette-review-v2",
		presentationVersion: "complete-palette-review-v2-presentation-1",
		manifestId: "current-absolute-manifest",
		title: "Current absolute review",
		mode: "absolute",
		blinded: false,
		cases: [{
			caseId: "current.winner",
			order: 0,
			source: { file: "images/one.jpg", sha256: source, bytes: 100 },
			treatment: reviewed,
		}],
	})
	await json(feedbackPath, {
		schemaVersion: 1,
		reviewVersion: "complete-palette-review-v2",
		manifestId: "current-absolute-manifest",
		entries: [{
			caseId: "current.winner",
			sourceSha256: source,
			quality: "strong",
			issues: ["missing gradient"],
			comment: "reviewed",
			submittedAt: "2026-01-05T00:00:00.000Z",
		}],
	})
	const databasePath = join(root, "warehouse.sqlite")
	const stats = await buildWarehouse({ projectRoot: root, databasePath, currentReviewPaths: [feedbackPath] })
	assert.equal(stats.unresolvedBindings, 0)
	assert.equal(stats.absoluteJudgments, 1)
	assert.equal(stats.issueTags, 1)
	const normalized = normalizeTreatment(reviewed, {
		presentationVersion: "complete-palette-review-v2-presentation-1",
	})
	const database = openWarehouse(databasePath)
	try {
		const lookup = exactTreatmentLookup(database, {
			sourceSha256: source,
			treatmentIdentity: normalized.treatmentIdentity,
			renderVariantId: normalized.renderVariantId,
		})
		assert.deepEqual(lookup.absoluteQualities, ["strong"])
		assert.deepEqual((lookup.issueTags as Array<{ tag: string }>).map(({ tag }) => tag), ["missing gradient"])
	} finally {
		database.close()
	}
})

test("historical feedback inventory reconciles every store and sealed Phase 4 selection", async () => {
	const root = join(import.meta.dirname, "..", "..")
	const artifacts = await inventoryReviewArtifacts(root)
	const feedback = artifacts.filter((artifact) => artifact.kind === "feedback")
	let submissions = 0
	for (const artifact of feedback) {
		const loaded = await loadArtifact(root, artifact.absolutePath, "feedback")
		const values = Array.isArray(loaded.value.entries) ? loaded.value.entries : loaded.value.responses
		assert.ok(Array.isArray(values), artifact.path)
		submissions += values.length
	}
	const quarantine = feedback.filter((artifact) => artifact.adapterId.startsWith("quarantine."))
	assert.deepEqual({ stores: feedback.length, submissions, quarantineStores: quarantine.length },
		{ stores: 90, submissions: 1380, quarantineStores: 28 })
	assert.equal(artifacts.some((artifact) => artifact.adapterId === "unsupported"), false)
	const exclusion = artifacts.find((artifact) => artifact.kind === "source-exclusion")
	assert.ok(exclusion)
	assert.equal(sourceInventoryEntries(await loadArtifact(root, exclusion.absolutePath, "source-exclusion")).length, 12)
})

async function typescriptFiles(directory: string): Promise<string[]> {
	const values: string[] = []
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if ([".git", "node_modules", "data", ".cache"].includes(entry.name)) continue
		const path = join(directory, entry.name)
		if (entry.isDirectory()) values.push(...await typescriptFiles(path))
		else if (entry.isFile() && entry.name.endsWith(".ts")) values.push(path)
	}
	return values
}

test("extractor and candidate-generation modules do not import review warehouse tooling", async () => {
	const root = join(import.meta.dirname, "..", "..")
	const violations: string[] = []
	for (const path of await typescriptFiles(join(root, "research"))) {
		const relativePath = relative(root, path)
		if (relativePath === "research/tests/palette-review-evidence-warehouse.test.ts" ||
			relativePath.startsWith("research/tools/review-evidence/")) continue
		const candidateOrExtractor = relativePath.startsWith("research/src/") || /(?:candidate|extract)/i.test(basename(path))
		if (!candidateOrExtractor) continue
		if ((await readFile(path, "utf8")).includes("tools/review-evidence")) violations.push(relativePath)
	}
	assert.deepEqual(violations, [])
})
