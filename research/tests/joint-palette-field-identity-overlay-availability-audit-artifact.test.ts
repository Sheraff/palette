import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast, labAt, okDistance, rgbToOKLab } from "../src/color.ts"
import { harmonicConjunction } from "../src/field-relation.ts"
import { loadImage } from "../src/image.ts"
import { perceivePaletteImage } from "../src/palette-perception.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-field-identity-overlay-availability-audit-0.1.0-development")
const candidateId = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const factorialId = "a74f5d2f03c3f4427a67e73876ed8e3d076b8d4eed20f9508a1e600415b06877"
const epsilon = 1e-12
const factors = ["A", "F", "P", "I", "R", "C"] as const
const roles = ["background", "foreground", "surface", "accent"] as const

type RGB = [number, number, number]
type Role = { rgb: RGB; generated: boolean }
type Palette = Record<typeof roles[number], Role> & { gradient: { isGradient: boolean } }
type Identity = { representativePixelIndex: number; supportMaskSha256: string; identity: string }
type Family = { supportMaskSha256: string; identity: string; pixels: number; population: number }
type Compact = {
	vector: number[]
	endpointMass: number
	backgroundSupport: number
	surfaceSupport: number
	stateTopology: number
	jointSupport: number
	recomposedJointSupport: number
	reportedStateSupport: number
	recomposedStateSupport: number
	recompositionPass: boolean
}
type Status = { applicable: boolean; pass: boolean; reason: string | null }
type Entry = {
	cohort: "development" | "00"
	file: string
	source: { sha256: string; bytes: number }
	classification: "compact-changed-candidate" | "canonical-fallback"
	canonical: Palette
	candidate: Palette
	state: string
	reproduction: Record<string, boolean>
	candidateEligibility: { checks: Record<string, boolean>; pass: boolean }
	fallback: null | { route: string; exactCanonicalByteIdentity: boolean }
	audit: null | {
		canonicalResolution: {
			maximizingPairCount: number
			maximizingPairs: Array<{
				pairIdentity: string
				background: Identity
				surface: Identity
				backgroundFamily: Family
				surfaceFamily: Family
				compact: Compact
				recompositionPass: boolean
			}>
		}
		selectedResolution: {
			background: Identity
			surface: Identity
			backgroundFamily: Family
			surfaceFamily: Family
			compact: Compact
			recompositionPass: boolean
		}
		factors: {
			A: Status & { matchedRoles: string[] }
			F: Status & {
				changedRoles: Array<"background" | "surface">
				matchedRoles: string[]
				roles: Record<"background" | "surface", {
					changed: boolean
					selectedFamily: Family
					canonicalFamilies: Family[]
					retained: boolean
				}>
			}
			P: Status & {
				candidate: PopulationProfile
				comparisons: Array<{ canonical: PopulationProfile; deltas: number[]; componentPass: boolean[]; pass: boolean }>
			}
			I: Status & {
				candidate: OwnershipProfile | null
				comparisons: Array<{ canonical: OwnershipProfile | null; deltas: number[] | null;
					componentPass: boolean[] | null; pass: boolean }>
			}
			R: Status & { policy: string; pixelCount: number; canonicalError: number; candidateError: number; delta: number }
			C: Status & { edges: Record<string, { canonicalSignedLc: number; candidateSignedLc: number;
				magnitudeDelta: number; finite: boolean; polarityPreserved: boolean; magnitudeNonregression: boolean;
				pass: boolean }> }
		}
		bits: Record<typeof factors[number], boolean>
		route: string
		qualifyingBranches: string[]
		prospectiveArm: boolean
		diagnostics: {
			overlayAvailability: Record<"foreground" | "accent", {
				diagnosticOnly: true
				canonicalColorAliasCount: number
				presentCanonicalSelectedAlias: number
				presentUnselectedFeasible: number
				presentUnselectedInfeasible: number
				absentFromEvidence: number
				aliases: Array<{ identity: Identity; classification: string; feasibility: Record<string, boolean> }>
			}>
		}
	}
	structural: { violations: string[] }
}
type PopulationProfile = {
	order: string[]
	vector: number[]
	pixels: Record<string, number>
}
type OwnershipProfile = {
	order: string[]
	vector: number[]
	frameBurden: { background: number; surface: number }
	rawTopologyVersion: string
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

function assertIdentity(identity: Identity): void {
	assert.match(identity.supportMaskSha256, /^[a-f0-9]{64}$/)
	assert.equal(identity.identity, `${identity.representativePixelIndex}:${identity.supportMaskSha256}`)
}

function assertFamily(family: Family, total: number): void {
	assert.match(family.supportMaskSha256, /^[a-f0-9]{64}$/)
	assert.equal(family.identity, family.supportMaskSha256)
	assert.equal(family.population, family.pixels / total)
}

function assertCompact(compact: Compact): void {
	assert.deepEqual(compact.vector,
		[compact.endpointMass, compact.backgroundSupport, compact.surfaceSupport, compact.stateTopology])
	assert.ok(Math.abs(compact.jointSupport - harmonicConjunction([
		compact.backgroundSupport, compact.surfaceSupport,
	])) <= epsilon)
	assert.ok(Math.abs(compact.recomposedJointSupport - compact.jointSupport) <= epsilon)
	assert.ok(Math.abs(compact.recomposedStateSupport - harmonicConjunction([
		compact.endpointMass, compact.recomposedJointSupport, compact.stateTopology,
	])) <= epsilon)
	assert.ok(Math.abs(compact.reportedStateSupport - compact.recomposedStateSupport) <= epsilon)
	assert.equal(compact.recompositionPass, true)
}

function assertPopulation(profile: PopulationProfile, total: number): void {
	assert.deepEqual(profile.order,
		["backgroundNode", "surfaceNode", "endpointUnion", "backgroundFamily", "surfaceFamily", "familyUnion"])
	assert.equal(profile.vector.length, 6)
	profile.order.forEach((name, index) => assert.equal(profile.vector[index], profile.pixels[name] / total))
}

function reconstruction(palette: Palette, labs: Float32Array, pixels: number): number {
	const roleLabs = roles.map((role) => rgbToOKLab(palette[role].rgb))
	let sum = 0
	for (let pixel = 0; pixel < pixels; pixel++) {
		const lab = labAt(labs, pixel)
		sum += Math.min(...roleLabs.map((role) => okDistance(lab, role)))
	}
	return pixels === 0 ? 0 : sum / pixels
}

test("full-392 field identity and overlay availability audit is exact, label-free, and non-authorizing", async () => {
	assert.deepEqual((await readdir(experimentRoot)).sort(),
		["analysis.json", "frontier.json", "manifest.json", "protocol.json", "results.json"])
	const protocol = await readJson<{
		experimentVersion: string
		auditType: string
		hypothesisAncestry: Record<string, unknown>
		authorization: Record<string, unknown>
		independence: { forbiddenDirectInputs: string[]; inputNameAndPathEnforcement: boolean }
		policy: Record<string, unknown>
		factors: Record<string, string>
		prospectiveFrozenWinnerArm: Record<string, unknown>
		stoppingRules: Record<string, unknown>
	}>("protocol.json")
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		protocol: typeof protocol
		policy: { comparisonEpsilon: number; fixedApcaFloor: null; factorOrder: string[] }
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
		implementation: Record<string, string>
	}>("manifest.json")
	const results = await readJson<{ experimentId: string; entries: Entry[] }>("results.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number; caseCount: number; checks: Record<string, boolean> }
		matrix: { total: number; development: number; cohort00: number; changed: number; canonicalFallback: number }
		factorial: {
			factorCounts: Record<string, { applicable: number; pass: number; fail: number; uncomparable: number }>
			routeCounts: Record<string, number>
			nestedArmCounts: Record<string, number>
			conjunctiveCounts: Record<string, number>
		}
		prospectiveArm: { definition: string; count: number; files: string[]; complete: boolean; sampled: boolean;
			sizeBand: string }
		composition: Record<string, unknown>
		outcome: Record<string, boolean | string>
		disposition: string
	}>("analysis.json")
	const frontier = await readJson<{
		experimentId: string
		definition: string
		structuralStoppingRulesPass: boolean
		complete: boolean
		sampling: null
		entries: Array<{ file: string; cohort: string; state: string; factorBits: Record<string, boolean>;
			factorApplicability: Record<string, boolean>; qualifyingBranches: string[] }>
	}>("frontier.json")

	assert.equal(protocol.experimentVersion,
		"joint-palette-field-identity-overlay-availability-audit-0.1.0-development")
	assert.equal(protocol.auditType, "append-only-label-free-read-only-full-392-field-identity-overlay-availability-audit")
	assert.equal(protocol.hypothesisAncestry.compactCandidateExperimentId, candidateId)
	assert.equal(protocol.hypothesisAncestry.factorialAuditExperimentId, factorialId)
	assert.deepEqual(protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	for (const [name, value] of Object.entries(protocol.authorization)) {
		if (name === "allowedSourceRoots" || name === "outputUnseenRootsOpened") continue
		assert.equal(value, false, name)
	}
	assert.equal(protocol.independence.inputNameAndPathEnforcement, true)
	assert.deepEqual(protocol.independence.forbiddenDirectInputs,
		["review-manifest", "feedback", "review-analysis", "interpretation", "comment", "target-color",
			"preferred-file-list", "case-specific-label", "source-roots-10-through-14"])
	assert.equal(protocol.policy.comparisonEpsilon, epsilon)
	assert.equal(protocol.policy.fixedApcaFloor, null)
	assert.equal(protocol.policy.candidateRerunsPerSource, 1)
	assert.equal(protocol.policy.allPixelReconstruction, true)
	assert.equal(protocol.policy.outputPreserving, true)
	assert.deepEqual(Object.keys(protocol.factors).sort(), [...factors].sort())
	assert.equal(protocol.prospectiveFrozenWinnerArm.diagnosticOverlayAvailabilityUsedAsGate, false)
	assert.equal(protocol.stoppingRules.zeroFrontierIsValid, true)
	assert.equal(protocol.stoppingRules.noAuthorizationGranted, true)
	assert.equal(manifest.policy.comparisonEpsilon, epsilon)
	assert.equal(manifest.policy.fixedApcaFloor, null)
	assert.deepEqual(manifest.policy.factorOrder, factors)
	assert.deepEqual(manifest.protocol, protocol)

	const expectedInputs = [
		"canonical00", "canonicalDevelopment", "compactCandidateAnalysis", "compactCandidateFrontier",
		"compactCandidateManifest", "compactCandidateProtocol", "compactCandidateResults", "evidenceAnalysis",
		"evidenceManifest", "evidenceProtocol", "evidenceResults", "factorialAncestryAnalysis",
		"factorialAncestryFrontier", "factorialAncestryManifest", "factorialAncestryProtocol",
		"factorialAncestryResults", "frozenParetoCertificates", "frozenParetoManifest", "frozenParetoResults",
	]
	assert.deepEqual(Object.keys(manifest.inputs).sort(), expectedInputs)
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.doesNotMatch(`${name}:${input.path}`,
			/review|feedback|interpretation|comments?|target|preferred|labels?|(?:^|\/)(?:10|11|12|13|14)(?:\/|$)/i)
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
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(frontier.experimentId, manifest.experimentId)

	assert.deepEqual(analysis.matrix, { total: 392, development: 37, cohort00: 355, changed: 18, canonicalFallback: 374 })
	assert.equal(results.entries.length, 392)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.equal(analysis.structural.caseCount, 0)
	assert.equal(Object.values(analysis.structural.checks).every(Boolean), true)
	const changed = results.entries.filter((entry) => entry.classification === "compact-changed-candidate")
	const fallbacks = results.entries.filter((entry) => entry.classification === "canonical-fallback")
	assert.equal(changed.length, 18)
	assert.equal(fallbacks.length, 374)
	for (const entry of results.entries) {
		assert.deepEqual(entry.structural.violations, [], entry.file)
		assert.equal(Object.values(entry.reproduction).every(Boolean), true, entry.file)
	}
	for (const entry of fallbacks) {
		assert.ok(entry.fallback)
		assert.equal(entry.audit, null)
		assert.equal(entry.fallback.exactCanonicalByteIdentity, true, entry.file)
		assert.equal(JSON.stringify(entry.candidate), JSON.stringify(entry.canonical), entry.file)
		assert.equal(entry.candidateEligibility.pass, false, entry.file)
	}

	const routes = Object.fromEntries(Object.keys(analysis.factorial.routeCounts).map((route) => [route, 0]))
	const counts = Object.fromEntries(factors.map((factor) =>
		[factor, { applicable: 0, pass: 0, fail: 0, uncomparable: 0 }])) as typeof analysis.factorial.factorCounts
	const expectedFrontier: string[] = []
	for (const entry of changed) {
		const audit = entry.audit!
		assert.equal(entry.fallback, null)
		assert.equal(entry.candidateEligibility.pass, true, entry.file)
		assert.equal(Object.values(entry.candidateEligibility.checks).every(Boolean), true, entry.file)
		assert.equal(audit.canonicalResolution.maximizingPairCount,
			audit.canonicalResolution.maximizingPairs.length, entry.file)
		assert.ok(audit.canonicalResolution.maximizingPairs.length > 0, entry.file)
		assertIdentity(audit.selectedResolution.background)
		assertIdentity(audit.selectedResolution.surface)
		assertFamily(audit.selectedResolution.backgroundFamily, audit.factors.R.pixelCount)
		assertFamily(audit.selectedResolution.surfaceFamily, audit.factors.R.pixelCount)
		assertCompact(audit.selectedResolution.compact)
		assert.equal(audit.selectedResolution.recompositionPass, true)
		for (const pair of audit.canonicalResolution.maximizingPairs) {
			assertIdentity(pair.background)
			assertIdentity(pair.surface)
			assert.equal(pair.pairIdentity, `${pair.background.identity}|${pair.surface.identity}`)
			assertFamily(pair.backgroundFamily, audit.factors.R.pixelCount)
			assertFamily(pair.surfaceFamily, audit.factors.R.pixelCount)
			assertCompact(pair.compact)
			assert.equal(pair.recompositionPass, true)
		}

		const aMatches = [
			audit.canonicalResolution.maximizingPairs.some((pair) =>
				pair.background.identity === audit.selectedResolution.background.identity) ? "background" : null,
			audit.canonicalResolution.maximizingPairs.some((pair) =>
				pair.surface.identity === audit.selectedResolution.surface.identity) ? "surface" : null,
		].filter(Boolean)
		assert.equal(audit.factors.A.applicable, true)
		assert.deepEqual(audit.factors.A.matchedRoles, aMatches)
		assert.equal(audit.factors.A.pass, aMatches.length > 0)

		const expectedChangedRoles = (["background", "surface"] as const).filter((role) =>
			JSON.stringify([entry.candidate[role].rgb, entry.candidate[role].generated]) !==
			JSON.stringify([entry.canonical[role].rgb, entry.canonical[role].generated]))
		assert.deepEqual(audit.factors.F.changedRoles, expectedChangedRoles)
		for (const role of ["background", "surface"] as const) {
			const family = audit.factors.F.roles[role]
			assert.equal(family.changed, expectedChangedRoles.includes(role))
			assertFamily(family.selectedFamily, audit.factors.R.pixelCount)
			family.canonicalFamilies.forEach((value) => assertFamily(value, audit.factors.R.pixelCount))
			assert.equal(family.retained, family.changed && family.canonicalFamilies.some((value) =>
				value.identity === family.selectedFamily.identity))
		}
		assert.equal(audit.factors.F.pass, audit.factors.F.matchedRoles.length > 0)

		assertPopulation(audit.factors.P.candidate, audit.factors.R.pixelCount)
		for (const comparison of audit.factors.P.comparisons) {
			assertPopulation(comparison.canonical, audit.factors.R.pixelCount)
			const deltas = audit.factors.P.candidate.vector.map((value, index) => value - comparison.canonical.vector[index])
			assert.deepEqual(comparison.deltas, deltas)
			assert.deepEqual(comparison.componentPass, deltas.map((delta) => delta >= -epsilon))
			assert.equal(comparison.pass, comparison.componentPass.every(Boolean))
		}
		assert.equal(audit.factors.P.pass, audit.factors.P.applicable &&
			audit.factors.P.comparisons.some((comparison) => comparison.pass))

		assert.doesNotMatch(JSON.stringify(audit.factors.I), /score|margin|threshold/i)
		if (audit.factors.I.candidate) {
			const candidate = audit.factors.I.candidate
			assert.deepEqual(candidate.order, ["backgroundAntiFrame", "surfaceAntiFrame", "surfaceRoleOwnership",
				"spatialFieldOwnership", "interiorSurfaceSupport"])
			assert.equal(candidate.vector[0], 1 - candidate.frameBurden.background)
			assert.equal(candidate.vector[1], 1 - candidate.frameBurden.surface)
			assert.match(candidate.rawTopologyVersion, /^gradient-field-topology-evidence-/)
		}
		for (const comparison of audit.factors.I.comparisons) {
			if (!audit.factors.I.candidate || !comparison.canonical) {
				assert.equal(comparison.deltas, null)
				assert.equal(comparison.componentPass, null)
				assert.equal(comparison.pass, false)
				continue
			}
			const deltas = audit.factors.I.candidate.vector.map((value, index) => value - comparison.canonical!.vector[index])
			assert.deepEqual(comparison.deltas, deltas)
			assert.deepEqual(comparison.componentPass, deltas.map((delta) => delta >= -epsilon))
			assert.equal(comparison.pass, comparison.componentPass!.every(Boolean))
		}
		assert.equal(audit.factors.I.pass, audit.factors.I.applicable &&
			audit.factors.I.comparisons.some((comparison) => comparison.pass))

		assert.equal(audit.factors.R.policy, "all-source-pixels-nearest-of-four-oklab-roles")
		const image = await loadImage(sourceBytes.get(entry.file)!)
		const perception = perceivePaletteImage(image)
		const rawBefore = sha256(image.data)
		const regionAnalysis = perception.analysis
		const pixels = regionAnalysis.width * regionAnalysis.height
		assert.equal(pixels, audit.factors.R.pixelCount)
		const canonicalError = reconstruction(entry.canonical, regionAnalysis.labs, pixels)
		const candidateError = reconstruction(entry.candidate, regionAnalysis.labs, pixels)
		assert.ok(Math.abs(canonicalError - audit.factors.R.canonicalError) <= epsilon, entry.file)
		assert.ok(Math.abs(candidateError - audit.factors.R.candidateError) <= epsilon, entry.file)
		assert.equal(audit.factors.R.delta, audit.factors.R.candidateError - audit.factors.R.canonicalError)
		assert.equal(audit.factors.R.pass,
			audit.factors.R.applicable && audit.factors.R.candidateError <= audit.factors.R.canonicalError + epsilon)
		assert.equal(sha256(image.data), rawBefore)

		const edgeDefinitions = {
			foregroundOnBackground: ["foreground", "background"],
			foregroundOnSurface: ["foreground", "surface"],
			accentOnBackground: ["accent", "background"],
			accentOnSurface: ["accent", "surface"],
		} as const
		assert.deepEqual(Object.keys(audit.factors.C.edges).sort(), Object.keys(edgeDefinitions).sort())
		for (const [name, [overlay, field]] of Object.entries(edgeDefinitions)) {
			const edge = audit.factors.C.edges[name]
			const canonicalLc = apcaContrast(entry.canonical[overlay].rgb, entry.canonical[field].rgb)
			const candidateLc = apcaContrast(entry.candidate[overlay].rgb, entry.candidate[field].rgb)
			assert.equal(edge.canonicalSignedLc, canonicalLc)
			assert.equal(edge.candidateSignedLc, candidateLc)
			assert.equal(edge.magnitudeDelta, Math.abs(candidateLc) - Math.abs(canonicalLc))
			assert.equal(edge.finite, Number.isFinite(canonicalLc) && Number.isFinite(candidateLc))
			assert.equal(edge.polarityPreserved, edge.finite && Math.sign(candidateLc) === Math.sign(canonicalLc))
			assert.equal(edge.magnitudeNonregression, edge.finite && edge.magnitudeDelta >= -epsilon)
			assert.equal(edge.pass, edge.finite && edge.polarityPreserved && edge.magnitudeNonregression)
		}
		assert.equal(audit.factors.C.pass, audit.factors.C.applicable &&
			Object.values(audit.factors.C.edges).every((edge) => edge.pass))

		for (const factor of factors) {
			const status = audit.factors[factor]
			assert.equal(audit.bits[factor], status.applicable && status.pass)
			if (!status.applicable) assert.equal(status.pass, false)
			counts[factor].applicable += Number(status.applicable)
			counts[factor].pass += Number(audit.bits[factor])
			counts[factor].fail += Number(status.applicable && !status.pass)
			counts[factor].uncomparable += Number(!status.applicable)
		}
		assert.equal(audit.route, factors.map((factor) => `${factor}${Number(audit.bits[factor])}`).join(""))
		routes[audit.route]++
		const branches = [audit.bits.A ? "A" : null, audit.bits.F ? "F" : null,
			audit.bits.P && audit.bits.I ? "P&I" : null].filter(Boolean)
		assert.deepEqual(audit.qualifyingBranches, branches)
		const prospective = entry.candidateEligibility.pass && audit.bits.C && audit.bits.R && branches.length > 0
		assert.equal(audit.prospectiveArm, prospective, entry.file)
		if (prospective) expectedFrontier.push(entry.file)

		for (const role of ["foreground", "accent"] as const) {
			const availability = audit.diagnostics.overlayAvailability[role]
			assert.equal(availability.diagnosticOnly, true)
			assert.equal(availability.canonicalColorAliasCount, availability.aliases.length)
			assert.equal(availability.presentCanonicalSelectedAlias,
				availability.aliases.filter((alias) => alias.classification === "present-canonical-selected-alias").length)
			assert.equal(availability.presentUnselectedFeasible,
				availability.aliases.filter((alias) => alias.classification === "present-unselected-feasible").length)
			assert.equal(availability.presentUnselectedInfeasible,
				availability.aliases.filter((alias) => alias.classification === "present-unselected-infeasible").length)
			assert.equal(availability.absentFromEvidence,
				Number(availability.presentCanonicalSelectedAlias === 0))
			availability.aliases.forEach((alias) => assertIdentity(alias.identity))
		}
	}

	assert.equal(Object.keys(analysis.factorial.routeCounts).length, 64)
	assert.equal(Object.values(analysis.factorial.routeCounts).reduce((sum, count) => sum + count, 0), 18)
	assert.deepEqual(analysis.factorial.routeCounts, routes)
	assert.deepEqual(analysis.factorial.factorCounts, counts)
	assert.deepEqual(analysis.factorial.nestedArmCounts, {
		A: changed.filter((entry) => entry.audit!.bits.A).length,
		AF: changed.filter((entry) => entry.audit!.bits.A && entry.audit!.bits.F).length,
		AFP: changed.filter((entry) => entry.audit!.bits.A && entry.audit!.bits.F && entry.audit!.bits.P).length,
		AFPI: changed.filter((entry) => entry.audit!.bits.A && entry.audit!.bits.F && entry.audit!.bits.P &&
			entry.audit!.bits.I).length,
		AFPIR: changed.filter((entry) => factors.slice(0, 5).every((factor) => entry.audit!.bits[factor])).length,
		AFPIRC: changed.filter((entry) => factors.every((factor) => entry.audit!.bits[factor])).length,
	})
	assert.deepEqual(frontier.entries.map((entry) => entry.file), expectedFrontier)
	assert.deepEqual(analysis.prospectiveArm.files, expectedFrontier)
	assert.equal(analysis.prospectiveArm.count, expectedFrontier.length)
	assert.equal(frontier.entries.length, expectedFrontier.length)
	assert.equal(frontier.definition, analysis.prospectiveArm.definition)
	assert.equal(frontier.complete, true)
	assert.equal(frontier.sampling, null)
	assert.equal(frontier.structuralStoppingRulesPass, true)
	assert.equal(analysis.prospectiveArm.complete, true)
	assert.equal(analysis.prospectiveArm.sampled, false)
	const sizeBand = expectedFrontier.length === 0 ? "0" : expectedFrontier.length <= 40 ? "1-40" : ">40"
	assert.equal(analysis.prospectiveArm.sizeBand, sizeBand)
	assert.equal(analysis.outcome.sizeBand, sizeBand)
	assert.equal(analysis.outcome.authorizedByThisAudit, false)
	assert.equal(analysis.outcome.selectorImplemented, false)
})
