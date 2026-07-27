import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { ALGORITHM_VERSION } from "../src/extract.ts"
import {
	NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_NARROWED_ACCENT_POLICY,
} from "../src/next-palette-narrowed-accent.ts"
import type { CorpusResult, Palette } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-narrowed-accent-0.2.0-development")

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

test("checked-in narrowed accent experiment is canonical-preserving and exactly review-transferred", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		candidateIdentity: { algorithmVersion: string; selection: string }
		policy: typeof NEXT_PALETTE_NARROWED_ACCENT_POLICY
		protocol: {
			baselineAlgorithmVersion: string
			predecessorExperimentId: string
			authorization: {
				allowedSourceRoots: string[]
				outputUnseenRootsOpened: string[]
				exactReviewTransferOnly: boolean
				canonicalPromotionAuthorized: boolean
			}
		}
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
		sources: unknown[]
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		matrix: Record<string, number>
		reviewTransfer: Record<string, number>
		reviewEvidence: {
			candidateWeakOrUnacceptable: number
			comparison: Record<string, number>
			strictZeroRegressionPass: boolean
		}
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		algorithmVersion: string
		entries: Array<{
			file: string
			palette: Palette
			predecessorChanged: boolean
			exactChanged: boolean
			structural: { violations: string[] }
		}>
	}>("results.json")
	const certificates = await readJson<{
		experimentId: string
		entries: Record<string, {
			predecessor: { provenanceKind: string | null }
			minimumDistanceFromFrozenRole: number
			guards: Record<string, boolean>
			failedGuards: string[]
			selected: { changed: boolean; suppressedPredecessor: boolean }
		}>
	}>("certificates.json")
	const frontier = await readJson<{
		experimentId: string
		entries: Array<{ file: string; changedRoles: string[]; gradientChanged: boolean; baseline: Palette; candidate: Palette }>
	}>("frontier.json")
	const transfer = await readJson<{
		experimentId: string
		coverage: Record<string, number>
		quality: { candidateWeakOrUnacceptable: number }
		comparison: Record<string, number>
		entries: Array<{ file: string; transferBasis: string }>
	}>("review-transfer.json")
	const predecessor = JSON.parse(await readFile(resolve(projectRoot,
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/results.json"), "utf8")) as {
		entries: Array<{ file: string; palette: Palette }>
	}
	const development = JSON.parse(await readFile(resolve(projectRoot, "research/data/results.json"), "utf8")) as CorpusResult
	const canonical00 = JSON.parse(await readFile(resolve(projectRoot, "research/data/holdout-results.json"), "utf8")) as CorpusResult
	const canonicalByFile = new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])
	const predecessorByFile = new Map(predecessor.entries.map((entry) => [entry.file, entry.palette]))

	assert.equal(manifest.candidateIdentity.algorithmVersion, NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION)
	assert.equal(manifest.protocol.baselineAlgorithmVersion, ALGORITHM_VERSION)
	assert.equal(manifest.protocol.predecessorExperimentId,
		"23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe")
	assert.deepEqual(manifest.policy, NEXT_PALETTE_NARROWED_ACCENT_POLICY)
	assert.deepEqual(manifest.protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.protocol.authorization.exactReviewTransferOnly, true)
	assert.equal(manifest.protocol.authorization.canonicalPromotionAuthorized, false)
	assert.equal(manifest.sources.length, 392)
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.matrix, {
		total: 392,
		predecessorChanged: 55,
		exactChanged: 41,
		unchangedExactCanonical: 351,
		suppressedPredecessor: 14,
		suppressedConnectedFamily: 6,
		suppressedForegroundCollapse: 8,
		suppressedByRoleSeparation: 9,
		suppressedByLargeMoveIdentity: 5,
		developmentChanged: 2,
		cohort00Changed: 39,
	})
	assert.deepEqual(analysis.reviewTransfer,
		{ changed: 41, transferred: 41, eligible: 40, notReviewable: 1, freshReviewRequired: 0 })
	assert.deepEqual(analysis.reviewEvidence.comparison,
		{ "candidate-stronger": 26, "baseline-stronger": 3, "both-similarly-valid": 11 })
	assert.equal(analysis.reviewEvidence.candidateWeakOrUnacceptable, 7)
	assert.equal(analysis.reviewEvidence.strictZeroRegressionPass, false)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(results.algorithmVersion, NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION)
	assert.equal(results.entries.length, 392)
	assert.equal(certificates.experimentId, manifest.experimentId)
	assert.equal(Object.keys(certificates.entries).length, 392)
	assert.equal(frontier.experimentId, manifest.experimentId)
	assert.equal(frontier.entries.length, 41)
	assert.ok(frontier.entries.every((entry) => entry.changedRoles.join(",") === "accent" && !entry.gradientChanged))
	assert.equal(transfer.experimentId, manifest.experimentId)
	assert.deepEqual(transfer.coverage,
		{ changed: 41, transferred: 41, eligible: 40, notReviewable: 1, freshReviewRequired: 0 })
	assert.equal(transfer.quality.candidateWeakOrUnacceptable, 7)
	assert.deepEqual(transfer.comparison,
		{ "candidate-stronger": 26, "baseline-stronger": 3, "both-similarly-valid": 11 })
	assert.ok(transfer.entries.every((entry) =>
		entry.transferBasis === "exact-baseline-and-candidate-semantic-palette-match"))

	for (const entry of results.entries) {
		const canonical = canonicalByFile.get(entry.file)
		const predecessorPalette = predecessorByFile.get(entry.file)
		const certificate = certificates.entries[entry.file]
		assert.ok(canonical)
		assert.ok(predecessorPalette)
		assert.ok(certificate)
		assert.deepEqual(entry.structural.violations, [])
		assert.equal(entry.exactChanged, semanticKey(entry.palette) !== semanticKey(canonical))
		assert.equal(certificate.selected.changed, entry.exactChanged)
		assert.deepEqual(entry.palette.background, canonical.background)
		assert.deepEqual(entry.palette.foreground, canonical.foreground)
		assert.deepEqual(entry.palette.surface, canonical.surface)
		assert.deepEqual(entry.palette.gradient, canonical.gradient)
		if (!entry.exactChanged) {
			assert.deepEqual(entry.palette, canonical)
			continue
		}
		assert.equal(semanticKey(entry.palette), semanticKey(predecessorPalette))
		assert.equal(certificate.predecessor.provenanceKind, "connected-family-local")
		assert.ok(certificate.minimumDistanceFromFrozenRole + 1e-12 >= 0.025)
		assert.deepEqual(certificate.failedGuards, [])
		assert.ok(Object.values(certificate.guards).every(Boolean))
		assert.notEqual(entry.palette.accent.hex, entry.palette.foreground.hex)
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
