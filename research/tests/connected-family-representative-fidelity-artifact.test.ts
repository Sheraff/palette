import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION } from
	"../src/connected-family-representative-fidelity.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/connected-family-representative-fidelity-0.1.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

test("checked-in representative fidelity preserves availability and exposes exact local modes", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		fidelityVersion: string
		protocol: { authorization: {
			allowedSourceRoots: string[]
			outputUnseenRootsOpened: string[]
			proposalsPassedToRoleSolver: boolean
			roleSolverInvocationCount: number
		} }
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
		sources: Array<{ path: string; sha256: string; bytes: number }>
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		stoppingRules: {
			pass: boolean
			structuralViolationCount: number
			predecessorFamilyMaskSetMismatches: number
			nondeterministicCases: number
			lloydPartitionViolations: number
			fieldMembershipViolations: number
			roleSolverInvocationCount: number
			canonicalRecomputationMismatches: number
			unauthorizedSourceRootsOpened: string[]
			commentDerivedTargetFamilies: number
		}
		coverage: {
			sources: number
			families: number
			localRepresentatives: number
			multiRepresentativeFamilies: number
			sourcesWithFamilies: number
		}
		knownAvailabilityCohort: { total: number; exactlyPreserved: number }
		isolatedEqualHistogramSpecksQualify: boolean
		targetRepresentativeFidelity: {
			familyMaskPreserved: boolean
			availabilityRepresentative: { hex: string; representativePixelIndex: number }
			localRepresentative: {
				hex: string
				representativePixelIndex: number
				sourceRegionId: number
				membership: { field: boolean; overlay: boolean }
			}
			availabilityDistanceToDominantModeCenter: number
			localDistanceToDominantModeCenter: number
			improved: boolean
		}
	}>("analysis.json")
	const evaluation = await readJson<{
		experimentId: string
		fidelityVersion: string
		entries: Array<{
			file: string
			canonicalRecomputed: boolean
			violations: string[]
			fidelity: {
				families: Array<{
					maskSha256: string
					availabilityStableKey: string
					components: Array<{ representatives: Array<{
						representativePixelIndex: number
						supportMaskSha256: string
						membership: { field: boolean; overlay: boolean }
					}> }>
				}>
			}
		}>
	}>("evaluation.json")

	assert.equal(manifest.fidelityVersion, CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION)
	assert.deepEqual(manifest.protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.protocol.authorization.proposalsPassedToRoleSolver, false)
	assert.equal(manifest.protocol.authorization.roleSolverInvocationCount, 0)
	assert.equal(manifest.sources.length, 392)
	assert.ok(manifest.sources.every((source) => /^(?:images|00)\/[^/\\]+$/.test(source.path)))
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(analysis.stoppingRules.pass, true)
	assert.equal(analysis.stoppingRules.structuralViolationCount, 0)
	assert.equal(analysis.stoppingRules.predecessorFamilyMaskSetMismatches, 0)
	assert.equal(analysis.stoppingRules.nondeterministicCases, 0)
	assert.equal(analysis.stoppingRules.lloydPartitionViolations, 0)
	assert.equal(analysis.stoppingRules.fieldMembershipViolations, 0)
	assert.equal(analysis.stoppingRules.roleSolverInvocationCount, 0)
	assert.equal(analysis.stoppingRules.canonicalRecomputationMismatches, 0)
	assert.deepEqual(analysis.stoppingRules.unauthorizedSourceRootsOpened, [])
	assert.equal(analysis.stoppingRules.commentDerivedTargetFamilies, 0)
	assert.deepEqual(analysis.coverage, {
		sources: 392,
		families: 965,
		localRepresentatives: 26904,
		multiRepresentativeFamilies: 953,
		sourcesWithFamilies: 329,
	})
	assert.equal(analysis.knownAvailabilityCohort.total, 6)
	assert.equal(analysis.knownAvailabilityCohort.exactlyPreserved, 6)
	assert.equal(analysis.isolatedEqualHistogramSpecksQualify, false)
	assert.equal(analysis.targetRepresentativeFidelity.familyMaskPreserved, true)
	assert.deepEqual(analysis.targetRepresentativeFidelity.availabilityRepresentative,
		{ center: [0.7643279324317801, -0.04885187650677459, 0.14042152839487998],
			representativePixelIndex: 25411, rgb: [186, 187, 45],
			lab: [0.767234096065858, -0.05265992194153174, 0.14499177956549786],
			hex: "#babb2d", distanceToFamilyCenter: 0.0066207396009619526 })
	assert.equal(analysis.targetRepresentativeFidelity.localRepresentative.hex, "#d8d418")
	assert.equal(analysis.targetRepresentativeFidelity.localRepresentative.representativePixelIndex, 25874)
	assert.equal(analysis.targetRepresentativeFidelity.localRepresentative.sourceRegionId, 143)
	assert.deepEqual(analysis.targetRepresentativeFidelity.localRepresentative.membership, { field: false, overlay: true })
	assert.ok(analysis.targetRepresentativeFidelity.localDistanceToDominantModeCenter <
		analysis.targetRepresentativeFidelity.availabilityDistanceToDominantModeCenter)
	assert.equal(analysis.targetRepresentativeFidelity.improved, true)
	assert.equal(evaluation.experimentId, manifest.experimentId)
	assert.equal(evaluation.fidelityVersion, CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION)
	assert.equal(evaluation.entries.length, 392)
	assert.ok(evaluation.entries.every((entry) => entry.canonicalRecomputed && entry.violations.length === 0))
	assert.equal(evaluation.entries.reduce((sum, entry) => sum + entry.fidelity.families.length, 0), 965)
	for (const entry of evaluation.entries) {
		for (const family of entry.fidelity.families) {
			assert.match(family.maskSha256, /^[a-f0-9]{64}$/)
			assert.ok(family.availabilityStableKey.endsWith(family.maskSha256))
			for (const representative of family.components.flatMap((component) => component.representatives)) {
				assert.ok(Number.isInteger(representative.representativePixelIndex))
				assert.match(representative.supportMaskSha256, /^[a-f0-9]{64}$/)
				assert.deepEqual(representative.membership, { field: false, overlay: true })
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
	await assert.rejects(access(resolve(experimentRoot, "results.json")))
})
