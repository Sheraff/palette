import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewFeedbackStore, parseNextPaletteReviewManifest } from "../src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-field-tradeoff-0.1.1-development")
const reviewRoot = resolve(experimentRoot, "review-v1")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("field tradeoff diagnostic is provenance-bound and review-ready", async () => {
	const readJson = async <T>(root: string, file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(root, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
	}>(experimentRoot, "manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		coverage: Record<string, number>
		states: Record<string, number>
		review: { authorized: boolean; freshBlindedComparisonsRequired: number; diagnosticOnly: boolean }
	}>(experimentRoot, "analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{ candidate: unknown | null; structural: { violations: string[] } }>
	}>(experimentRoot, "results.json")
	const frontier = await readJson<{ experimentId: string; entries: unknown[] }>(experimentRoot, "frontier.json")
	const reviewManifest = parseNextPaletteReviewManifest(await readJson(reviewRoot, "batch-01-manifest.json"))
	const feedback = parseNextPaletteReviewFeedbackStore(
		await readJson(reviewRoot, "batch-01-feedback.json"), reviewManifest,
	)

	assert.equal(manifest.experimentId, "43bf44701c2678214e7000e0d426775e3139e8ee01fd3d24b1883e8c4c5cdbd1")
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(frontier.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.coverage,
		{ commentedFieldCases: 13, candidateAvailable: 10, noFieldTradeoffAvailable: 3, reviewCases: 10 })
	assert.deepEqual(analysis.states, { collapsed: 2, "distinct-flat": 3, gradient: 5 })
	assert.equal(analysis.review.authorized, true)
	assert.equal(analysis.review.diagnosticOnly, true)
	assert.equal(analysis.review.freshBlindedComparisonsRequired, 10)
	assert.equal(results.entries.length, 13)
	assert.equal(results.entries.filter((entry) => entry.candidate).length, 10)
	assert.ok(results.entries.every((entry) => entry.structural.violations.length === 0))
	assert.equal(frontier.entries.length, 10)
	assert.equal(reviewManifest.experimentId, manifest.experimentId)
	assert.equal(reviewManifest.entries.length, 10)
	assert.ok(feedback.entries.length <= 10)
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	for (const [file, expected] of Object.entries(reviewManifest.provenance.experiment)) {
		assert.equal(sha256(await readFile(resolve(experimentRoot, file))), expected, file)
	}
	for (const [file, expected] of Object.entries(reviewManifest.provenance.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	for (const [file, expected] of Object.entries(reviewManifest.provenance.presentation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
