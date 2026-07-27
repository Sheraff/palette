import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION } from "../src/next-palette-field-pair.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.2.0-field-pair-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("checked-in field-pair development experiment is complete and provenance-bound", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		candidateIdentity: { algorithmVersion: string }
		protocol: { authorization: { outputUnseenRootsOpened: string[]; newHumanReviewAuthorized: boolean } }
		implementation: Record<string, string>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number; caseCount: number }
		matrix: {
			total: number
			countsEqualPrevious: number
			rejectionsEqualPrevious: number
			changedFromPrevious: number
			previousSurfaceCollapsed: number
			successorSurfaceCollapsed: number
			previousGradient: number
			successorGradient: number
		}
		primaryTechnicalCohort: {
			total: number
			recoveredDistinctSurface: number
			minimumRequired: number
			pass: boolean
			entries: unknown[]
		}
		reviewReuse: {
			submitted: number
			eligible: number
			matchedPreviousCandidate: number
			matchedBaseline: number
			novel: number
			knownImprovements: number
			knownRegressions: number
			pass: boolean
			entries: unknown[]
		}
		disposition: string
	}>("analysis.json")
	const results = await readJson<{ experimentId: string; algorithmVersion: string; entries: unknown[] }>("results.json")
	const certificates = await readJson<{
		experimentId: string
		algorithmVersion: string
		entries: Record<string, unknown>
	}>("certificates.json")

	assert.equal(manifest.candidateIdentity.algorithmVersion, NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION)
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.protocol.authorization.newHumanReviewAuthorized, false)
	assert.equal(manifest.sources.length, 392)
	assert.ok(manifest.sources.every((source) => /^(?:images|00)\/[^/\\]+$/.test(source.path)))
	assert.equal(new Set(manifest.sources.map((source) => source.path)).size, 392)
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, false)
	assert.equal(analysis.structural.violationCount, 15)
	assert.equal(analysis.structural.caseCount, 15)
	assert.deepEqual(analysis.matrix, {
		total: 392,
		countsEqualPrevious: 392,
		rejectionsEqualPrevious: 392,
		changedFromPrevious: 280,
		changedFromBaseline: 374,
		previousSurfaceCollapsed: 313,
		successorSurfaceCollapsed: 112,
		previousGradient: 65,
		successorGradient: 207,
	})
	assert.deepEqual(analysis.primaryTechnicalCohort, {
		total: 15,
		recoveredDistinctSurface: 8,
		minimumRequired: 8,
		pass: true,
		entries: analysis.primaryTechnicalCohort.entries,
	})
	assert.equal(analysis.primaryTechnicalCohort.entries.length, 15)
	assert.deepEqual(analysis.reviewReuse, {
		submitted: 80,
		eligible: 79,
		matchedPreviousCandidate: 24,
		matchedBaseline: 2,
		novel: 53,
		knownImprovements: 1,
		knownRegressions: 0,
		pass: true,
		entries: analysis.reviewReuse.entries,
	})
	assert.equal(analysis.reviewReuse.entries.length, 80)
	assert.equal(analysis.disposition, "development-rejected-no-review")
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(results.algorithmVersion, NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION)
	assert.equal(results.entries.length, 392)
	assert.equal(certificates.experimentId, manifest.experimentId)
	assert.equal(certificates.algorithmVersion, NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION)
	assert.equal(Object.keys(certificates.entries).length, 392)
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
