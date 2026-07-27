import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { clampRelationEvidence, harmonicConjunction } from "../src/field-relation.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development")
const epsilon = 1e-12

type Compact = {
	vector: [number, number, number, number]
	endpointMass: number
	backgroundSupport: number
	surfaceSupport: number
	stateTopology: number
	topologyInputs: { continuity: number; monotoneConnectivity: number; progression: number }
	jointSupport: number
	recomposedJointSupport: number
	reportedStateSupport: number
	recomposedStateSupport: number
	recompositionPass: boolean
}
type Entry = {
	cohort: "development" | "00"
	file: string
	source: { sha256: string; bytes: number }
	reproduction: Record<string, boolean>
	canonicalRelation: {
		state: string
		maximumSupport: number
		incumbentObjectiveStateSupport: number
		maximumSupportReproduced: boolean
		materiallyAmbiguous: boolean
		collapsedUncomparable: boolean
		resolved: boolean
		compact: Compact | null
	}
	selectedRelation: { available: boolean; valid: boolean; state: string; compact: Compact | null }
	comparison: {
		disposition: string
		compactDeltas: [number, number, number, number] | null
		weakDominance: boolean
		strictImprovement: boolean
	}
	baseEligibility: { checks: Record<string, boolean>; pass: boolean }
	factors: {
		bits: { S: boolean; M: boolean; O: boolean; T: boolean }
		applicable: { M: boolean; O: boolean; T: boolean }
		route: string
	}
	nestedArms: { S: boolean; SM: boolean; SMO: boolean; SMOT: boolean }
	prospectiveFrontier: boolean
	diagnostics: {
		reconstruction: Record<string, number | string>
		signedApcaLc: { canonical: Record<string, number>; selected: Record<string, number> }
	}
	structural: { violations: string[] }
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

async function readJson<T>(file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
}

function assertCompact(compact: Compact, state: string): void {
	const topology = compact.vector[3]
	assert.deepEqual(compact.vector,
		[compact.endpointMass, compact.backgroundSupport, compact.surfaceSupport, compact.stateTopology])
	assert.equal(topology, compact.stateTopology)
	assert.ok(Math.abs(compact.recomposedJointSupport - harmonicConjunction([
		compact.backgroundSupport, compact.surfaceSupport,
	])) <= epsilon)
	assert.ok(Math.abs(compact.recomposedStateSupport - harmonicConjunction([
		compact.endpointMass, compact.recomposedJointSupport, compact.stateTopology,
	])) <= epsilon)
	assert.ok(Math.abs(compact.jointSupport - compact.recomposedJointSupport) <= epsilon)
	assert.ok(Math.abs(compact.reportedStateSupport - compact.recomposedStateSupport) <= epsilon)
	assert.equal(compact.recompositionPass, true)
	assert.ok(compact.stateTopology >= 0 && compact.stateTopology <= 1)
	assert.ok(compact.topologyInputs.continuity >= 0)
	assert.ok(compact.topologyInputs.monotoneConnectivity >= 0)
	assert.ok(compact.topologyInputs.progression >= 0)
	assert.equal(clampRelationEvidence(compact.stateTopology), compact.stateTopology)
	const expectedTopology = state === "gradient"
		? harmonicConjunction([compact.topologyInputs.continuity, compact.topologyInputs.monotoneConnectivity,
			compact.topologyInputs.progression])
		: clampRelationEvidence(1 - Math.max(compact.topologyInputs.continuity, compact.topologyInputs.progression))
	assert.ok(Math.abs(compact.stateTopology - expectedTopology) <= epsilon)
}

test("full-392 joint field relation factorial audit is complete, bound, and read-only", async () => {
	assert.deepEqual((await readdir(experimentRoot)).sort(),
		["analysis.json", "frontier.json", "manifest.json", "protocol.json", "results.json"])
	const protocol = await readJson<{
		experimentVersion: string
		auditType: string
		authorization: Record<string, unknown>
		prospectiveReviewEligibility: Record<string, unknown>
		stoppingRules: Record<string, unknown>
		diagnosticsOnly: { usedAsGate: boolean }
	}>("protocol.json")
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		protocol: typeof protocol
		policy: { comparisonEpsilon: number; fixedApcaAdmissionFloor: number | null; factorOrder: string[] }
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>("manifest.json")
	const results = await readJson<{ experimentId: string; entries: Entry[] }>("results.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number; caseCount: number; checks: Record<string, boolean> }
		matrix: Record<string, number>
		factorial: {
			factorCounts: Record<string, { true: number; false: number; applicable?: number; uncomparable?: number }>
			routeCounts: Record<string, number>
			nestedArmCounts: Record<string, number>
			strictCompactImprovement: number
		}
		prospectiveReview: {
			frontierSize: number
			frontierWithinPredeclaredSize: boolean
			everyEntryCleanAndOneBlock: boolean
			exactJudgmentTransfers: number
			eligibleForLaterFreshBlindedReview: boolean
			authorizedByThisAudit: boolean
		}
		disposition: string
	}>("analysis.json")
	const frontier = await readJson<{
		experimentId: string
		definition: string
		entries: Array<{
			file: string
			factorBits: Entry["factors"]["bits"]
			changedSemanticBlocks: number
			structurallyClean: boolean
		}>
	}>("frontier.json")

	assert.equal(protocol.experimentVersion,
		"next-palette-joint-field-relation-factorial-audit-0.1.0-development")
	assert.equal(protocol.auditType, "append-only-read-only-frozen-winner-full-392-factorial-audit")
	assert.deepEqual(protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	for (const key of ["changesPaletteOutput", "extractionChangeAuthorized", "candidateFreezeAuthorized",
		"canonicalPromotionAuthorized", "reserveAccessAuthorized", "broaderReviewAuthorized", "humanReviewPrepared",
		"laterFreshBlindedReviewAuthorizedByAudit", "exactJudgmentTransferAllowed"]) {
		assert.equal(protocol.authorization[key], false, key)
	}
	assert.deepEqual(protocol.prospectiveReviewEligibility, {
		conditionalOnly: true,
		completeFrontierMinimum: 1,
		completeFrontierMaximum: 40,
		everyEntryStructurallyClean: true,
		everyEntryExactlyOneChangedSemanticBlock: true,
		exactJudgmentTransfersAllowed: false,
		mayAuthorizeLaterFreshBlindedReviewOnlyIfAllStoppingRulesPass: true,
	})
	assert.equal(protocol.stoppingRules.noFixedApcaAdmissionFloor, true)
	assert.equal(protocol.diagnosticsOnly.usedAsGate, false)
	assert.equal(manifest.policy.fixedApcaAdmissionFloor, null)
	assert.equal(manifest.policy.comparisonEpsilon, epsilon)
	assert.deepEqual(manifest.policy.factorOrder, ["S", "M", "O", "T"])
	assert.deepEqual(manifest.protocol, protocol)

	const expectedInputNames = ["canonical00", "canonicalDevelopment", "evidenceAnalysis", "evidenceManifest",
		"jointParetoCertificates", "jointParetoManifest", "jointParetoResults"]
	assert.deepEqual(Object.keys(manifest.inputs).sort(), expectedInputNames)
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.doesNotMatch(name, /feedback|interpretation|comment|label|target|nine/i)
		assert.doesNotMatch(input.path, /review|feedback|interpretation|comment|target|ablation-stable/i)
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	assert.equal(manifest.sources.length, 392)
	assert.equal(manifest.sources.filter((source) => source.cohort === "development").length, 37)
	assert.equal(manifest.sources.filter((source) => source.cohort === "00").length, 355)
	assert.equal(new Set(manifest.sources.map((source) => source.path)).size, 392)
	for (const source of manifest.sources) {
		assert.match(source.path, /^(?:images|00)\/[^/\\]+$/)
		const bytes = await readFile(resolve(projectRoot, source.path))
		assert.equal(bytes.byteLength, source.bytes, source.path)
		assert.equal(sha256(bytes), source.sha256, source.path)
	}
	for (const [file, hash] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(frontier.experimentId, manifest.experimentId)

	assert.equal(results.entries.length, 392)
	assert.deepEqual(analysis.matrix.total, 392)
	assert.deepEqual(analysis.matrix.development, 37)
	assert.deepEqual(analysis.matrix.cohort00, 355)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.equal(analysis.structural.caseCount, 0)
	assert.equal(Object.values(analysis.structural.checks).every(Boolean), true)
	const routes = Object.fromEntries(Object.keys(analysis.factorial.routeCounts).map((route) => [route, 0]))
	const trueCounts = { S: 0, M: 0, O: 0, T: 0 }
	const applicableCounts = { M: 0, O: 0, T: 0 }
	const applicableFalseCounts = { M: 0, O: 0, T: 0 }
	const nestedCounts = { S: 0, SM: 0, SMO: 0, SMOT: 0 }
	let strictCount = 0
	const expectedFrontier: string[] = []
	for (const entry of results.entries) {
		assert.deepEqual(entry.structural.violations, [], entry.file)
		assert.equal(Object.values(entry.reproduction).every(Boolean), true, entry.file)
		assert.equal(entry.canonicalRelation.maximumSupportReproduced, true, entry.file)
		assert.ok(Math.abs(entry.canonicalRelation.maximumSupport -
			entry.canonicalRelation.incumbentObjectiveStateSupport) <= epsilon, entry.file)
		if (entry.canonicalRelation.compact) assertCompact(entry.canonicalRelation.compact, entry.canonicalRelation.state)
		if (entry.selectedRelation.compact) assertCompact(entry.selectedRelation.compact, entry.selectedRelation.state)
		if (entry.selectedRelation.available) assert.equal(entry.selectedRelation.valid, true, entry.file)
		if (entry.canonicalRelation.state === "collapsed") {
			assert.equal(entry.canonicalRelation.collapsedUncomparable, true, entry.file)
			assert.equal(entry.comparison.disposition, "uncomparable-canonical-collapsed", entry.file)
			assert.equal(entry.comparison.compactDeltas, null, entry.file)
		}
		if (entry.comparison.disposition === "comparable") {
			assert.ok(entry.canonicalRelation.compact)
			assert.ok(entry.selectedRelation.compact)
			assert.ok(entry.comparison.compactDeltas)
			const deltas = entry.selectedRelation.compact.vector.map((value, index) =>
				value - entry.canonicalRelation.compact!.vector[index])
			assert.deepEqual(entry.comparison.compactDeltas, deltas)
			assert.equal(entry.comparison.weakDominance, deltas.every((delta) => delta >= -epsilon))
			assert.equal(entry.comparison.strictImprovement, deltas.some((delta) => delta > epsilon))
		} else {
			assert.equal(entry.comparison.weakDominance, false)
			assert.equal(entry.comparison.strictImprovement, false)
		}
		assert.equal(entry.baseEligibility.pass, Object.values(entry.baseEligibility.checks).every(Boolean))
		assert.equal(entry.factors.bits.S, entry.canonicalRelation.state === entry.selectedRelation.state)
		assert.equal(entry.factors.route,
			`S${Number(entry.factors.bits.S)}M${Number(entry.factors.bits.M)}O${Number(entry.factors.bits.O)}T${Number(entry.factors.bits.T)}`)
		assert.equal(entry.factors.applicable.M, entry.comparison.disposition === "comparable")
		assert.equal(entry.factors.applicable.O, entry.comparison.disposition === "comparable")
		assert.equal(entry.factors.applicable.T, entry.comparison.disposition === "comparable")
		assert.equal(entry.nestedArms.S, entry.factors.bits.S)
		assert.equal(entry.nestedArms.SM, entry.factors.bits.S && entry.factors.bits.M)
		assert.equal(entry.nestedArms.SMO, entry.factors.bits.S && entry.factors.bits.M && entry.factors.bits.O)
		assert.equal(entry.nestedArms.SMOT, entry.factors.bits.S && entry.factors.bits.M && entry.factors.bits.O &&
			entry.factors.bits.T && entry.comparison.strictImprovement)
		const prospective = entry.baseEligibility.pass && entry.comparison.disposition === "comparable" &&
			!entry.canonicalRelation.materiallyAmbiguous && entry.comparison.weakDominance &&
			entry.comparison.strictImprovement
		assert.equal(entry.prospectiveFrontier, prospective, entry.file)
		if (prospective) expectedFrontier.push(entry.file)
		routes[entry.factors.route]++
		for (const factor of ["S", "M", "O", "T"] as const) trueCounts[factor] += Number(entry.factors.bits[factor])
		for (const factor of ["M", "O", "T"] as const) {
			applicableCounts[factor] += Number(entry.factors.applicable[factor])
			applicableFalseCounts[factor] += Number(entry.factors.applicable[factor] && !entry.factors.bits[factor])
		}
		for (const arm of ["S", "SM", "SMO", "SMOT"] as const) nestedCounts[arm] += Number(entry.nestedArms[arm])
		strictCount += Number(entry.comparison.strictImprovement)
		assert.equal(entry.diagnostics.reconstruction.policy, "common-pixel-domain-floor-n-over-12000-stride")
		assert.ok(Number(entry.diagnostics.reconstruction.stride) >= 1)
		assert.ok(Number(entry.diagnostics.reconstruction.samples) >= 1)
		for (const apca of [entry.diagnostics.signedApcaLc.canonical, entry.diagnostics.signedApcaLc.selected]) {
			assert.deepEqual(Object.keys(apca).sort(), ["accentOnBackground", "accentOnSurface",
				"foregroundOnBackground", "foregroundOnSurface"])
			assert.equal(Object.values(apca).every(Number.isFinite), true)
		}
	}

	assert.equal(Object.keys(analysis.factorial.routeCounts).length, 16)
	assert.equal(Object.values(analysis.factorial.routeCounts).reduce((sum, count) => sum + count, 0), 392)
	assert.deepEqual(analysis.factorial.routeCounts, routes)
	assert.deepEqual(analysis.factorial.factorCounts.S,
		{ true: trueCounts.S, false: 392 - trueCounts.S, applicable: 392 })
	for (const factor of ["M", "O", "T"] as const) {
		assert.deepEqual(analysis.factorial.factorCounts[factor], {
			true: trueCounts[factor],
			false: applicableFalseCounts[factor],
			uncomparable: 392 - applicableCounts[factor],
		})
	}
	assert.deepEqual(analysis.factorial.nestedArmCounts, nestedCounts)
	assert.equal(analysis.factorial.strictCompactImprovement, strictCount)
	assert.deepEqual(frontier.entries.map((entry) => entry.file), expectedFrontier)
	assert.equal(frontier.entries.length, analysis.matrix.prospectiveFrontier)
	assert.equal(frontier.entries.length, analysis.prospectiveReview.frontierSize)
	assert.equal(frontier.definition,
		"base eligibility plus resolved same-state noncollapsed canonical/selected relation plus compact weak dominance and at least one strict compact improvement")
	assert.equal(frontier.entries.every((entry) => entry.changedSemanticBlocks === 1 && entry.structurallyClean), true)
	assert.equal(analysis.prospectiveReview.frontierWithinPredeclaredSize,
		frontier.entries.length >= 1 && frontier.entries.length <= 40)
	assert.equal(analysis.prospectiveReview.everyEntryCleanAndOneBlock, true)
	assert.equal(analysis.prospectiveReview.exactJudgmentTransfers, 0)
	assert.equal(analysis.prospectiveReview.eligibleForLaterFreshBlindedReview,
		analysis.structural.pass && frontier.entries.length >= 1 && frontier.entries.length <= 40)
	assert.equal(analysis.prospectiveReview.authorizedByThisAudit, false)
})
