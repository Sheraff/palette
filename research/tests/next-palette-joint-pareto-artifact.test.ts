import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import type { CorpusResult, Palette } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-joint-pareto-0.5.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		background: [palette.background.rgb, palette.background.generated],
		foreground: [palette.foreground.rgb, palette.foreground.generated],
		surface: [palette.surface.rgb, palette.surface.generated],
		accent: [palette.accent.rgb, palette.accent.generated],
		gradient: palette.gradient.isGradient,
	})
}

test("checked-in joint Pareto candidate is complete, conservative, and review-blocked", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
		sources: unknown[]
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		matrix: Record<string, number>
		backgroundSurfaceBacklog: Record<string, number>
		review: { authorized: boolean; completeChangedSetSize: number; freshBlindedComparisonsRequired: number }
		disposition: string
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{ file: string; palette: Palette; exactChanged: boolean; structural: { violations: string[] } }>
	}>("results.json")
	const certificates = await readJson<{
		experimentId: string
		entries: Record<string, {
			selected: { changed: boolean; objectiveDeltas: number[] }
			minimumBlockFrontier: unknown[]
			completeTupleFrontier: unknown[]
			ablations: Record<string, unknown>
		}>
	}>("certificates.json")
	const development = JSON.parse(await readFile(resolve(projectRoot, "research/data/results.json"), "utf8")) as CorpusResult
	const canonical00 = JSON.parse(await readFile(resolve(projectRoot, "research/data/holdout-results.json"), "utf8")) as CorpusResult
	const canonical = new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])

	assert.equal(manifest.experimentId, "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283")
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(certificates.experimentId, manifest.experimentId)
	assert.equal(manifest.sources.length, 392)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.matrix, {
		total: 392,
		exactChanged: 309,
		unchangedExactCanonical: 83,
		developmentChanged: 24,
		cohort00Changed: 285,
		backgroundChanged: 11,
		foregroundChanged: 16,
		surfaceChanged: 81,
		accentChanged: 210,
		gradientChanged: 49,
		incumbentEvidenceUnavailable: 7,
		selectedCollapsedField: 141,
		selectedDistinctFlatField: 61,
		selectedGradientField: 107,
	})
	assert.deepEqual(analysis.backgroundSurfaceBacklog, { total: 13, changed: 13, fieldChanged: 0 })
	assert.equal(analysis.review.authorized, false)
	assert.equal(analysis.review.completeChangedSetSize, 309)
	assert.equal(analysis.review.freshBlindedComparisonsRequired, 289)
	assert.equal(analysis.disposition, "joint-candidate-built-complete-changed-set-review-authorization-required")
	assert.equal(results.entries.length, 392)
	for (const entry of results.entries) {
		const baseline = canonical.get(entry.file)
		const certificate = certificates.entries[entry.file]
		assert.ok(baseline)
		assert.ok(certificate)
		assert.deepEqual(entry.structural.violations, [])
		assert.equal(entry.exactChanged, semanticKey(entry.palette) !== semanticKey(baseline))
		assert.equal(certificate.selected.changed, entry.exactChanged)
		assert.equal(Object.keys(certificate.ablations).length, 8)
		if (entry.exactChanged) {
			assert.ok(certificate.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
			assert.ok(certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
			assert.ok(certificate.minimumBlockFrontier.length > 0)
			assert.ok(certificate.completeTupleFrontier.length > 0)
		} else assert.deepEqual(entry.palette, baseline)
	}
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
