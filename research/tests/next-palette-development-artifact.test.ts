import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { NEXT_PALETTE_ALGORITHM_VERSION } from "../src/next-palette.ts"
import type { CorpusResult } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.1.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("checked-in next palette development experiment is complete and provenance-bound", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		candidateIdentity: { algorithmVersion: string }
		policy: { version: string }
		protocol: { authorization: { allowedSourceRoots: string[]; outputUnseenRootsOpened: string[] } }
		implementation: Record<string, string>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		materialChanges: { total: number }
		reviewFrontier: { total: number; byEvidenceClassification: Record<string, number>; reviewRequired: boolean }
	}>("analysis.json")
	const frontier = await readJson<{ experimentId: string; algorithmVersion: string; entries: Array<{
		file: string
		candidateEvidenceClassification: string
		source: { path: string; sha256: string }
	}> }>("frontier.json")
	const development = await readJson<CorpusResult>("candidate-results.json")
	const canonical00 = await readJson<CorpusResult>("candidate-00-results.json")
	const certificates = await readJson<{
		experimentId: string
		algorithmVersion: string
		development: Record<string, unknown>
		canonical00: Record<string, unknown>
	}>("candidate-certificates.json")

	assert.equal(manifest.candidateIdentity.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(manifest.policy.version, "next-palette-policy-0.1.0-development")
	assert.deepEqual(manifest.protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.sources.length, 392)
	assert.ok(manifest.sources.every((source) => /^(?:images|00)\/[^/\\]+$/.test(source.path)))
	assert.equal(new Set(manifest.sources.map((source) => source.path)).size, 392)
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.equal(analysis.materialChanges.total, 373)
	assert.equal(analysis.reviewFrontier.total, 125)
	assert.deepEqual(analysis.reviewFrontier.byEvidenceClassification, { unknown: 125 })
	assert.equal(analysis.reviewFrontier.reviewRequired, true)
	assert.equal(frontier.experimentId, manifest.experimentId)
	assert.equal(frontier.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(frontier.entries.length, 125)
	assert.ok(frontier.entries.every((entry) => entry.candidateEvidenceClassification === "unknown"))
	assert.ok(frontier.entries.every((entry) => /^(?:images|00)\/[^/\\]+$/.test(entry.source.path)))
	assert.equal(development.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(canonical00.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(development.entries.length, 37)
	assert.equal(canonical00.entries.length, 355)
	assert.equal(certificates.experimentId, manifest.experimentId)
	assert.equal(certificates.algorithmVersion, NEXT_PALETTE_ALGORITHM_VERSION)
	assert.equal(Object.keys(certificates.development).length, 37)
	assert.equal(Object.keys(certificates.canonical00).length, 355)

	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
