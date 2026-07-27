import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewManifest } from "../src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-incumbent-accent-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v1")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

test("incumbent accent review covers the complete changed set in blinded batches", async () => {
	const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T
	const plan = await readJson<{
		experimentId: string
		status: string
		scope: {
			freshBlindedComparisons: number
			developmentSources: number
			cohort00Sources: number
			previouslyCurated00Sources: number
			authorizedExtended00Sources: number
			totalBatches: number
		}
		manifestIds: string[]
	}>(resolve(reviewRoot, "plan.json"))
	const authorization = await readJson<{
		experimentId: string
		review: {
			authorized: boolean
			completeChangedSet: boolean
			freshBlindedComparisons: number
		}
		prohibitions: {
			canonicalPromotionAuthorized: boolean
			candidateFreezeAuthorized: boolean
			reserveAccessAuthorized: boolean
			outputUnseenRootsOpened: string[]
		}
	}>(resolve(experimentRoot, "review-authorization.json"))
	const frontier = await readJson<{ entries: Array<{ file: string }> }>(resolve(experimentRoot, "frontier.json"))
	const manifests = await Promise.all([1, 2].map(async (batch) => parseNextPaletteReviewManifest(
		await readJson(resolve(reviewRoot, `batch-${String(batch).padStart(2, "0")}-manifest.json`)),
	)))
	const feedback = await Promise.all([1, 2].map((batch) => readJson<{
		manifestId: string
		entries: Array<{ caseId: string; sourceEligibility: string }>
	}>(resolve(reviewRoot, `batch-${String(batch).padStart(2, "0")}-feedback.json`))))
	const analyses = await Promise.all([1, 2].map((batch) => readJson<{
		experimentId: string
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
	}>(resolve(reviewRoot, `batch-${String(batch).padStart(2, "0")}-analysis.json`))))
	const attribution = await readJson<{
		experimentId: string
		coverage: { completeChangedSet: number; submitted: number; eligible: number; notReviewable: number; complete: boolean }
		aggregate: {
			comparison: Record<string, number>
			byProposalKind: Record<string, Record<string, number | string>>
		}
		backgroundSurfaceBacklog: { explicitCommentCount: number; candidateQualityNegative: number }
		candidateVersionGate: { pass: boolean }
		disposition: { accentDevelopmentTrack: string; canonicalPromotionAuthorized: boolean }
	}>(resolve(reviewRoot, "complete-review-attribution.json"))

	assert.equal(plan.experimentId, "23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe")
	assert.equal(plan.status, "complete-changed-set-authorized")
	assert.deepEqual(plan.scope, {
		freshBlindedComparisons: 55,
		developmentSources: 4,
		cohort00Sources: 51,
		previouslyCurated00Sources: 18,
		authorizedExtended00Sources: 33,
		totalBatches: 2,
		batchSize: 40,
	})
	assert.equal(authorization.experimentId, plan.experimentId)
	assert.equal(authorization.review.authorized, true)
	assert.equal(authorization.review.completeChangedSet, true)
	assert.equal(authorization.review.freshBlindedComparisons, 55)
	assert.deepEqual(authorization.prohibitions, {
		canonicalPromotionAuthorized: false,
		candidateFreezeAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [],
		sourceRoots: ["images", "00"],
	})
	assert.deepEqual(manifests.map((manifest) => manifest.manifestId), plan.manifestIds)
	assert.deepEqual(manifests.map((manifest) => manifest.entries.length), [40, 15])
	const entries = manifests.flatMap((manifest) => manifest.entries)
	assert.equal(entries.length, 55)
	assert.equal(new Set(entries.map((entry) => entry.caseId)).size, 55)
	assert.deepEqual(entries.map((entry) => entry.order).sort((a, b) => a - b),
		Array.from({ length: 55 }, (_, index) => index))
	assert.deepEqual(new Set(entries.map((entry) => entry.source.file)), new Set(frontier.entries.map((entry) => entry.file)))
	assert.ok(entries.every((entry) => entry.changedRoles.join(",") === "accent" && !entry.gradientChanged))
	assert.ok(entries.every((entry) => entry.assignment.A !== entry.assignment.B &&
		new Set(Object.values(entry.assignment)).size === 2))
	assert.ok(entries.every((entry) => /^(?:images|00)\/[^/\\]+$/.test(entry.source.file)))
	assert.ok(entries.every((entry) => {
		const baseline = entry.options[Object.entries(entry.assignment).find(([, assignment]) => assignment === "baseline")![0] as "A" | "B"]
		const candidate = entry.options[Object.entries(entry.assignment).find(([, assignment]) => assignment === "candidate")![0] as "A" | "B"]
		return baseline.roles.accent.hex !== candidate.roles.accent.hex &&
			["background", "foreground", "surface"].every((role) =>
				baseline.roles[role as "background" | "foreground" | "surface"].hex ===
				candidate.roles[role as "background" | "foreground" | "surface"].hex)
	}))
	for (const [index, store] of feedback.entries()) {
		assert.equal(store.manifestId, manifests[index].manifestId)
		assert.equal(store.entries.length, manifests[index].entries.length)
		assert.deepEqual(new Set(store.entries.map((entry) => entry.caseId)),
			new Set(manifests[index].entries.map((entry) => entry.caseId)))
	}
	assert.deepEqual(analyses.map((analysis) => analysis.coverage), [
		{ expected: 40, submitted: 40, eligible: 40, ineligible: 0, complete: true },
		{ expected: 15, submitted: 15, eligible: 14, ineligible: 1, complete: true },
	])
	assert.ok(analyses.every((analysis) => analysis.experimentId === plan.experimentId))
	assert.equal(attribution.experimentId, plan.experimentId)
	assert.deepEqual(attribution.coverage,
		{ completeChangedSet: 55, submitted: 55, eligible: 54, notReviewable: 1, complete: true })
	assert.deepEqual(attribution.aggregate.comparison, {
		"candidate-stronger": 26,
		"baseline-stronger": 14,
		"both-similarly-valid": 14,
		netCandidatePreference: 12,
	})
	assert.deepEqual(attribution.aggregate.byProposalKind["foreground-collapse"], {
		eligible: 8,
		"candidate-stronger": 0,
		"baseline-stronger": 7,
		"both-similarly-valid": 1,
		netCandidatePreference: -7,
		disposition: "remove-from-successor",
	})
	assert.equal(attribution.backgroundSurfaceBacklog.explicitCommentCount, 13)
	assert.equal(attribution.backgroundSurfaceBacklog.candidateQualityNegative, 9)
	assert.equal(attribution.candidateVersionGate.pass, false)
	assert.equal(attribution.disposition.accentDevelopmentTrack, "continue-with-narrowed-successor")
	assert.equal(attribution.disposition.canonicalPromotionAuthorized, false)
	for (const manifest of manifests) {
		for (const [file, expected] of Object.entries(manifest.provenance.experiment)) {
			assert.equal(sha256(await readFile(resolve(experimentRoot, file))), expected, file)
		}
		for (const [file, expected] of Object.entries(manifest.provenance.implementation)) {
			assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
		}
		for (const [file, expected] of Object.entries(manifest.provenance.presentation)) {
			assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
		}
	}
})
