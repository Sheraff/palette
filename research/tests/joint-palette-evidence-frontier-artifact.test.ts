import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-evidence-frontier-0.1.1-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("checked-in joint field and overlay evidence frontier is complete and read-only", async () => {
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
		coverage: Record<string, number>
		totals: Record<string, number>
		canonicalPreservation: { pass: boolean; rawHashesBefore: object; rawHashesAfter: object }
		stoppingRules: { pass: boolean }
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{ structural: { violations: string[] }; counts: { pairOverlayRelations: number } }>
	}>("results.json")

	assert.equal(manifest.experimentId, "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9")
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(manifest.sources.length, 392)
	assert.deepEqual(analysis.coverage, { total: 392, development: 37, cohort00: 355 })
	assert.deepEqual(analysis.totals, {
		fieldNodes: 2709,
		fieldTreatments: 40021,
		collapsedTreatments: 2709,
		distinctFlatTreatments: 18656,
		gradientTreatments: 18656,
		baseOverlays: 4852,
		localOverlays: 26904,
		overlayAlternatives: 31756,
		pairOverlayRelations: 3723340,
		logicalCompleteTuples: 531943690,
		subtlePositiveDistanceGradients: 110,
	})
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.equal(analysis.stoppingRules.pass, true)
	assert.equal(analysis.canonicalPreservation.pass, true)
	assert.deepEqual(analysis.canonicalPreservation.rawHashesBefore, analysis.canonicalPreservation.rawHashesAfter)
	assert.equal(results.entries.length, 392)
	assert.ok(results.entries.every((entry) => entry.structural.violations.length === 0 &&
		entry.counts.pairOverlayRelations > 0))
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
