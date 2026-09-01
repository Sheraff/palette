import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "../src/color.ts"
import { ALGORITHM_VERSION } from "../src/extract.ts"
import {
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY,
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
	type NextPaletteSoftContrastFrontier,
} from "../src/next-palette-soft-contrast-frontier.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-soft-contrast-frontier-0.1.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("checked-in soft contrast frontier is complete, recomputable, and read-only", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		diagnosticVersion: string
		policy: typeof NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY
		protocol: { authorization: { allowedSourceRoots: string[]; outputUnseenRootsOpened: string[] } }
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		stoppingRules: {
			pass: boolean
			canonicalRecomputationMismatches: number
			nonFiniteApcaRelations: number
			unauthorizedSourceRootsOpened: string[]
			commentDerivedTargetFamilies: number
			fixedApcaFloorAdmissionUses: number
			fixedApcaFloorFrontierUses: number
		}
		coverage: { sources: number; development: number; cohort00: number; generatedAlternatives: number }
		knownAvailabilityCohort: { total: number; withConnectedFamilyRepresentatives: number }
		reviewClassification: { occurrences: number; uniqueSources: number }
	}>("analysis.json")
	const evaluation = await readJson<{
		experimentId: string
		diagnosticVersion: string
		entries: Array<{
			file: string
			canonicalRecomputed: boolean
			diagnosticId: string
			diagnostic: NextPaletteSoftContrastFrontier
		}>
		reviewOccurrences: Array<{
			caseId: string
			sha256: string
			classificationPolicy: {
				commentTextReadByClassifier: boolean
				targetFamilyInferred: boolean
			}
		}>
	}>("evaluation.json")

	assert.equal(manifest.diagnosticVersion, NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION)
	assert.equal(manifest.policy.fixedApcaFloorEntersAdmission, false)
	assert.equal(manifest.policy.fixedApcaFloorEntersFrontierMembership, false)
	assert.deepEqual(manifest.protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.sources.length, 392)
	assert.equal(new Set(manifest.sources.map((source) => source.path)).size, 392)
	assert.ok(manifest.sources.every((source) => /^(?:images|00)\/[^/\\]+$/.test(source.path)))
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.deepEqual(analysis.stoppingRules, {
		pass: true,
		canonicalRecomputationMismatches: 0,
		canonicalRawHashesBefore: {
			development: "546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec",
			canonical00: "5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984",
		},
		canonicalRawHashesAfter: {
			development: "546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec",
			canonical00: "5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984",
		},
		nonFiniteApcaRelations: 0,
		unauthorizedSourceRootsOpened: [],
		commentDerivedTargetFamilies: 0,
		fixedApcaFloorAdmissionUses: 0,
		fixedApcaFloorFrontierUses: 0,
	})
	assert.deepEqual(analysis.coverage, {
		sources: 392,
		development: 37,
		cohort00: 355,
		sourceExactAlternatives: 5817,
		generatedAlternatives: 784,
		foregroundFrontierMembers: 4262,
		accentFrontierMembers: 4494,
	})
	assert.equal(analysis.knownAvailabilityCohort.total, 6)
	assert.equal(analysis.knownAvailabilityCohort.withConnectedFamilyRepresentatives, 6)
	assert.equal(analysis.reviewClassification.occurrences, 48)
	assert.equal(analysis.reviewClassification.uniqueSources, 39)
	assert.equal(evaluation.experimentId, manifest.experimentId)
	assert.equal(evaluation.diagnosticVersion, NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION)
	assert.equal(evaluation.entries.length, 392)
	assert.equal(evaluation.reviewOccurrences.length, 48)
	assert.equal(new Set(evaluation.reviewOccurrences.map((occurrence) => occurrence.sha256)).size, 39)
	assert.ok(evaluation.reviewOccurrences.every((occurrence) =>
		occurrence.classificationPolicy.commentTextReadByClassifier === false &&
		occurrence.classificationPolicy.targetFamilyInferred === false))

	for (const entry of evaluation.entries) {
		assert.equal(entry.canonicalRecomputed, true)
		assert.match(entry.diagnosticId, /^[a-f0-9]{64}$/)
		const diagnostic = entry.diagnostic
		assert.equal(diagnostic.diagnosticVersion, NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION)
		assert.equal(diagnostic.alternatives.filter((alternative) => alternative.generated).length, 2)
		assert.equal(diagnostic.alternatives.filter((alternative) => !alternative.generated).length,
			diagnostic.perception.candidateCount)
		const alternatives = new Map(diagnostic.alternatives.map((alternative) => [alternative.alternativeId, alternative]))
		for (const role of ["foreground", "accent"] as const) {
			assert.ok(diagnostic.frontiers[role].length > 0)
			assert.ok(diagnostic.frontiers[role].every((id) => alternatives.get(id)?.frontier[role].member === true))
		}
		for (const alternative of diagnostic.alternatives) {
			const backgroundLc = apcaContrast(alternative.rgb, diagnostic.canonical.roles.background.rgb)
			const surfaceLc = apcaContrast(alternative.rgb, diagnostic.canonical.roles.surface.rgb)
			assert.equal(alternative.contrast.onBackground.signedLc, backgroundLc)
			assert.equal(alternative.contrast.onBackground.magnitude, Math.abs(backgroundLc))
			assert.equal(alternative.contrast.onSurface.signedLc, surfaceLc)
			assert.equal(alternative.contrast.onSurface.magnitude, Math.abs(surfaceLc))
			if (alternative.generated) {
				assert.equal(alternative.provenance.kind, "generated-authorized")
				assert.ok(alternative.hex === "#000000" || alternative.hex === "#ffffff")
			} else {
				assert.equal(alternative.provenance.kind, "source-exact")
				assert.ok(Number.isInteger(alternative.provenance.representativePixelIndex))
				assert.match(alternative.provenance.evidenceMaskSha256!, /^[a-f0-9]{64}$/)
			}
		}
	}

	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
	assert.equal((JSON.parse(await readFile(resolve(projectRoot, "research/data/results.json"), "utf8")) as {
		algorithmVersion: string
	}).algorithmVersion, ALGORITHM_VERSION)
	await assert.rejects(access(resolve(experimentRoot, "results.json")))
})
