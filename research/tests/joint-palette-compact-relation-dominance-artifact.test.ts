import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "../src/color.ts"
import { clampRelationEvidence, harmonicConjunction } from "../src/field-relation.ts"
import { loadImage } from "../src/image.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development")
const factorialAuditId = "a74f5d2f03c3f4427a67e73876ed8e3d076b8d4eed20f9508a1e600415b06877"
const epsilon = 1e-12
const roleNames = ["background", "foreground", "surface", "accent"] as const

type Role = { rgb: [number, number, number]; hex: string; generated: boolean; sourceDistance: number }
type Palette = Record<typeof roleNames[number], Role> & {
	gradient: { isGradient: boolean }
}
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
type Provenance = {
	rgb: [number, number, number]
	representativePixelIndex: number
	supportMaskSha256: string
}
type Certificate = {
	route: string
	canonical: {
		fieldState: string
		objectives: number[]
		relation: {
			maximumSupportReproduced: boolean
			materiallyAmbiguous: boolean
			resolved: boolean
			compact: Compact | null
		}
	}
	counts: {
		admittedCompleteTuples: number
		completeTupleFrontier: number
		withinClassFrontier: number
	}
	selected: {
		changed: boolean
		admitted: boolean
		fieldState: string
		changedSemanticBlocks: number
		changedSemanticAtoms: number
		objectives: number[]
		objectiveDeltas: number[]
		roles: Record<typeof roleNames[number], Provenance> | null
		fieldTreatment: unknown | null
		compact: Compact | null
		compactDeltas: number[] | null
		relationDominanceWitness: { strictlyImprovedComponents: string[] } | null
		apcaLc: Record<string, number>
	}
	admittedTupleFrontier: Array<{
		stableKey: string
		changedSemanticBlocks: number
		changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
		objectives: number[]
		compactVector: number[]
	}>
	completeTupleFrontier: unknown[]
	withinClassFrontier: unknown[]
	invariants: Record<string, boolean>
}
type ResultEntry = {
	cohort: "development" | "00"
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette
	certificate: Certificate
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

function dominates(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function sameRole(first: Role, second: Role): boolean {
	return JSON.stringify([first.rgb, first.generated]) === JSON.stringify([second.rgb, second.generated])
}

function state(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return JSON.stringify(palette.background.rgb) === JSON.stringify(palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function assertCompact(compact: Compact, fieldState: string): void {
	assert.notEqual(fieldState, "collapsed")
	const topology = fieldState === "gradient"
		? harmonicConjunction([compact.topologyInputs.continuity, compact.topologyInputs.monotoneConnectivity,
			compact.topologyInputs.progression])
		: clampRelationEvidence(1 - Math.max(compact.topologyInputs.continuity, compact.topologyInputs.progression))
	const joint = harmonicConjunction([compact.backgroundSupport, compact.surfaceSupport])
	const support = harmonicConjunction([compact.endpointMass, joint, topology])
	assert.deepEqual(compact.vector,
		[compact.endpointMass, compact.backgroundSupport, compact.surfaceSupport, compact.stateTopology])
	assert.ok(Math.abs(compact.stateTopology - topology) <= epsilon)
	assert.ok(Math.abs(compact.jointSupport - joint) <= epsilon)
	assert.ok(Math.abs(compact.recomposedJointSupport - joint) <= epsilon)
	assert.ok(Math.abs(compact.reportedStateSupport - support) <= epsilon)
	assert.ok(Math.abs(compact.recomposedStateSupport - support) <= epsilon)
	assert.equal(compact.recompositionPass, true)
}

async function readJson<T>(file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
}

test("prospective compact relation experiment is complete, bound, and review-deferred", async () => {
	assert.deepEqual((await readdir(experimentRoot)).sort(),
		["analysis.json", "frontier.json", "manifest.json", "protocol.json", "results.json"])
	const protocol = await readJson<{
		experimentVersion: string
		hypothesisBinding: { factorialAuditExperimentId: string; requiredStructuralPass: boolean }
		authorization: Record<string, unknown>
		inputs: Record<string, boolean>
		selector: Record<string, unknown>
		stoppingRules: Record<string, unknown>
	}>("protocol.json")
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		protocol: typeof protocol
		policy: { comparisonEpsilon: number; fixedApcaAdmissionFloor: null }
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>("manifest.json")
	const results = await readJson<{ experimentId: string; entries: ResultEntry[] }>("results.json")
	const frontier = await readJson<{
		experimentId: string
		definition: string
		sampling: null
		entries: Array<{
			file: string
			cohort: string
			changedRoles: string[]
			gradientChanged: boolean
			baseline: Palette
			candidate: Palette
			selected: Certificate["selected"]
		}>
	}>("frontier.json")
	const analysis = await readJson<{
		experimentId: string
		candidateCount: number
		classification: string
		structural: { pass: boolean; violationCount: number; caseCount: number; checks: Record<string, boolean> }
		matrix: { total: number; development: number; cohort00: number; changed: number; canonicalFallback: number }
		cohorts: { development: { total: number; changed: number }; "00": { total: number; changed: number } }
		states: Record<string, number>
		atoms: { minimum: number | null; maximum: number | null; counts: Record<string, number> }
		frontier: { count: number; completeChangedSet: boolean; sampled: boolean }
		nextGate: Record<string, boolean>
		disposition: string
	}>("analysis.json")

	assert.equal(protocol.experimentVersion, "joint-palette-compact-relation-dominance-0.1.0-development")
	assert.deepEqual(protocol.hypothesisBinding,
		{ factorialAuditExperimentId: factorialAuditId, requiredStructuralPass: true, predeclaredProspectiveFrontierSize: 2 })
	assert.deepEqual(protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	for (const key of ["canonicalPromotionAuthorized", "candidateFreezeAuthorized", "reserveAccessAuthorized",
		"broaderReviewAuthorized", "humanReviewPrepared", "exactReviewTransferAuthorized"]) {
		assert.equal(protocol.authorization[key], false, key)
	}
	assert.equal(protocol.authorization.exactPresentationNoveltyTransferAuditDeferred, true)
	assert.equal(Object.values(protocol.inputs).every((value) => value === false), true)
	assert.equal(protocol.selector.fixedApcaAdmissionFloor, null)
	assert.equal(protocol.selector.requiredChangedSemanticBlocks, 1)
	assert.equal(protocol.selector.requiredChangedBlock, "field")
	assert.equal(protocol.selector.fieldState, "same-noncollapsed")
	assert.equal(protocol.selector.comparisonEpsilon, epsilon)
	assert.equal(protocol.stoppingRules.frontierIsCompleteChangedSetWithoutSampling, true)
	assert.equal(manifest.policy.fixedApcaAdmissionFloor, null)
	assert.equal(manifest.policy.comparisonEpsilon, epsilon)
	assert.deepEqual(manifest.protocol, protocol)

	assert.deepEqual(Object.keys(manifest.inputs).sort(), ["canonical00", "canonicalDevelopment", "evidenceAnalysis",
		"evidenceManifest", "factorialAuditAnalysis", "factorialAuditManifest", "jointParetoCertificates",
		"jointParetoManifest", "jointParetoResults"])
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.doesNotMatch(`${name}:${input.path}`,
			/review|feedback|interpretation|comments?|target|nine[-_ ]?case|ablation-stable/i)
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	assert.equal(manifest.sources.length, 392)
	assert.equal(manifest.sources.filter((source) => source.cohort === "development").length, 37)
	assert.equal(manifest.sources.filter((source) => source.cohort === "00").length, 355)
	assert.equal(new Set(manifest.sources.map((source) => source.path)).size, 392)
	const sourceBytes = new Map<string, Buffer>()
	for (const source of manifest.sources) {
		assert.match(source.path, /^(?:images|00)\/[^/\\]+$/)
		const bytes = await readFile(resolve(projectRoot, source.path))
		sourceBytes.set(source.path, bytes)
		assert.equal(bytes.byteLength, source.bytes, source.path)
		assert.equal(sha256(bytes), source.sha256, source.path)
	}
	for (const [file, hash] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(frontier.experimentId, manifest.experimentId)
	assert.equal(analysis.experimentId, manifest.experimentId)

	assert.equal(results.entries.length, 392)
	assert.equal(results.entries.filter((entry) => entry.cohort === "development").length, 37)
	assert.equal(results.entries.filter((entry) => entry.cohort === "00").length, 355)
	assert.equal(results.entries.every((entry) => entry.structural.violations.length === 0), true)
	const changed = results.entries.filter((entry) => entry.certificate.selected.changed)
	const fallbacks = results.entries.filter((entry) => !entry.certificate.selected.changed)
	assert.equal(changed.length, analysis.candidateCount)
	assert.equal(frontier.entries.length, changed.length)
	assert.deepEqual(frontier.entries.map((entry) => entry.file), changed.map((entry) => entry.file))
	assert.equal(frontier.sampling, null)
	assert.match(frontier.definition, /complete changed case set.*no sampling/i)
	assert.equal(analysis.frontier.count, changed.length)
	assert.equal(analysis.frontier.completeChangedSet, true)
	assert.equal(analysis.frontier.sampled, false)

	for (const entry of fallbacks) {
		assert.deepEqual(entry.candidate, entry.canonical, entry.file)
		assert.equal(JSON.stringify(entry.candidate), JSON.stringify(entry.canonical), entry.file)
		assert.equal(entry.certificate.selected.admitted, false, entry.file)
		assert.equal(entry.certificate.selected.fieldTreatment, null, entry.file)
		assert.equal(entry.certificate.selected.compactDeltas, null, entry.file)
		assert.equal(entry.certificate.selected.relationDominanceWitness, null, entry.file)
		assert.deepEqual(entry.certificate.admittedTupleFrontier, [], entry.file)
	}
	for (const entry of changed) {
		const certificate = entry.certificate
		const selected = certificate.selected
		assert.equal(certificate.route, "compact-relation-dominator", entry.file)
		assert.equal(selected.admitted, true, entry.file)
		assert.equal(selected.changedSemanticBlocks, 1, entry.file)
		assert.equal(state(entry.canonical), state(entry.candidate), entry.file)
		assert.notEqual(state(entry.candidate), "collapsed", entry.file)
		assert.deepEqual(entry.candidate.foreground, entry.canonical.foreground, entry.file)
		assert.deepEqual(entry.candidate.accent, entry.canonical.accent, entry.file)
		const blockChanges = {
			field: !sameRole(entry.candidate.background, entry.canonical.background) ||
				!sameRole(entry.candidate.surface, entry.canonical.surface),
			foreground: !sameRole(entry.candidate.foreground, entry.canonical.foreground),
			accent: !sameRole(entry.candidate.accent, entry.canonical.accent),
		}
		assert.deepEqual(blockChanges, { field: true, foreground: false, accent: false }, entry.file)
		assert.equal(certificate.canonical.relation.resolved, true, entry.file)
		assert.equal(certificate.canonical.relation.maximumSupportReproduced, true, entry.file)
		assert.equal(certificate.canonical.relation.materiallyAmbiguous, false, entry.file)
		assert.ok(certificate.canonical.relation.compact)
		assert.ok(selected.compact)
		assert.ok(selected.compactDeltas)
		assert.ok(selected.relationDominanceWitness)
		assertCompact(certificate.canonical.relation.compact, certificate.canonical.fieldState)
		assertCompact(selected.compact, selected.fieldState)
		assert.ok(selected.compactDeltas.every((delta) => delta >= -epsilon), entry.file)
		assert.ok(selected.compactDeltas.some((delta) => delta > epsilon), entry.file)
		assert.ok(selected.objectiveDeltas.every((delta) => delta >= -epsilon), entry.file)
		assert.ok(selected.objectiveDeltas.some((delta) => delta > epsilon), entry.file)
		assert.equal(dominates(selected.objectives, certificate.canonical.objectives), true, entry.file)
		assert.ok(selected.relationDominanceWitness.strictlyImprovedComponents.length > 0)
		assert.ok(selected.roles)
		const pixels = (await loadImage(sourceBytes.get(entry.file)!)).data
		for (const role of roleNames) {
			const provenance = selected.roles[role]
			const offset = provenance.representativePixelIndex * 3
			assert.deepEqual(provenance.rgb, entry.candidate[role].rgb, `${entry.file}:${role}`)
			assert.equal(entry.candidate[role].generated, false, `${entry.file}:${role}`)
			assert.deepEqual(provenance.rgb, [...pixels.subarray(offset, offset + 3)], `${entry.file}:${role}`)
			assert.match(provenance.supportMaskSha256, /^[a-f0-9]{64}$/)
		}
		assert.equal(new Set(roleNames.map((role) => entry.candidate[role].hex)).size <= 4, true, entry.file)
		assert.deepEqual(selected.apcaLc, {
			foregroundOnBackground: apcaContrast(entry.candidate.foreground.rgb, entry.candidate.background.rgb),
			foregroundOnSurface: apcaContrast(entry.candidate.foreground.rgb, entry.candidate.surface.rgb),
			accentOnBackground: apcaContrast(entry.candidate.accent.rgb, entry.candidate.background.rgb),
			accentOnSurface: apcaContrast(entry.candidate.accent.rgb, entry.candidate.surface.rgb),
		}, entry.file)
		assert.equal(Object.values(selected.apcaLc).every(Number.isFinite), true, entry.file)
		assert.equal(certificate.admittedTupleFrontier.length, certificate.counts.admittedCompleteTuples, entry.file)
		assert.equal(certificate.completeTupleFrontier.length, certificate.counts.completeTupleFrontier, entry.file)
		assert.equal(certificate.withinClassFrontier.length, certificate.counts.withinClassFrontier, entry.file)
		assert.equal(certificate.admittedTupleFrontier.every((tuple) => tuple.changedSemanticBlocks === 1 &&
			tuple.changedBlocks.field && !tuple.changedBlocks.foreground && !tuple.changedBlocks.accent &&
			dominates(tuple.objectives, certificate.canonical.objectives) &&
			dominates(tuple.compactVector, certificate.canonical.relation.compact!.vector)), true, entry.file)
		assert.equal(Object.values(certificate.invariants).every(Boolean), true, entry.file)
	}

	const expectedStates = {
		collapsed: changed.filter((entry) => entry.certificate.selected.fieldState === "collapsed").length,
		"distinct-flat": changed.filter((entry) => entry.certificate.selected.fieldState === "distinct-flat").length,
		gradient: changed.filter((entry) => entry.certificate.selected.fieldState === "gradient").length,
	}
	const atomValues = changed.map((entry) => entry.certificate.selected.changedSemanticAtoms)
	const atomCounts = Object.fromEntries([...new Set(atomValues)].sort((first, second) => first - second).map((atom) =>
		[String(atom), atomValues.filter((value) => value === atom).length]))
	assert.deepEqual(analysis.matrix, {
		total: 392, development: 37, cohort00: 355, changed: changed.length, canonicalFallback: fallbacks.length,
	})
	assert.deepEqual(analysis.cohorts, {
		development: { total: 37, changed: changed.filter((entry) => entry.cohort === "development").length },
		"00": { total: 355, changed: changed.filter((entry) => entry.cohort === "00").length },
	})
	assert.deepEqual(analysis.states, expectedStates)
	assert.deepEqual(analysis.atoms, {
		minimum: atomValues.length === 0 ? null : Math.min(...atomValues),
		maximum: atomValues.length === 0 ? null : Math.max(...atomValues),
		counts: atomCounts,
	})
	const expectedClassification = changed.length === 0 ? "stop-zero-candidates" : changed.length > 40
		? "stop-more-than-40-candidates"
		: "eligible-for-separate-exact-presentation-novelty-transfer-audit"
	assert.equal(analysis.classification, expectedClassification)
	assert.equal(analysis.disposition, expectedClassification)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.equal(analysis.structural.caseCount, 0)
	assert.equal(Object.values(analysis.structural.checks).every(Boolean), true)
	assert.equal(analysis.nextGate.eligibleForSeparateExactPresentationNoveltyTransferAudit,
		changed.length >= 1 && changed.length <= 40)
	assert.equal(analysis.nextGate.authorizedByThisExperiment, false)
	assert.equal(analysis.nextGate.reviewPrepared, false)
	assert.equal(analysis.nextGate.exactReviewTransferEvaluated, false)
	assert.equal(analysis.nextGate.noveltyEvaluated, false)
})
