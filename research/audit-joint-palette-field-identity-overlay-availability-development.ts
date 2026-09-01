import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { apcaContrast, labAt, okDistance, rgbToOKLab, roleMinimumDistance } from "./src/color.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { clampRelationEvidence, harmonicConjunction, type FieldRelationEvidence } from "./src/field-relation.ts"
import {
	analyzeGradientFieldTopology,
	GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
} from "./src/gradient-field-topology.ts"
import { loadImage } from "./src/image.ts"
import {
	buildJointPaletteEvidence,
	jointPaletteFieldStateEvidence,
	type JointPaletteFieldState,
	type JointPaletteOverlayAlternative,
} from "./src/joint-palette-evidence.ts"
import {
	buildJointPaletteCompactRelationDominance,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
	type CompactRelationEvidence,
	type JointPaletteCompactRelationDominanceCertificate,
} from "./src/joint-palette-compact-relation-dominance.ts"
import type { PaletteRelationNode } from "./src/palette-relation-graph.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-field-identity-overlay-availability-audit-0.1.0-development"
const COMPACT_CANDIDATE_EXPERIMENT_ID = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const FACTORIAL_ANCESTRY_EXPERIMENT_ID = "a74f5d2f03c3f4427a67e73876ed8e3d076b8d4eed20f9508a1e600415b06877"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const FROZEN_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const epsilon = JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY.comparisonEpsilon
const roleNames = ["background", "foreground", "surface", "accent"] as const
const fieldRoles = ["background", "surface"] as const
const factorNames = ["A", "F", "P", "I", "R", "C"] as const
const prospectiveArmDefinition =
	"current compact candidate eligibility AND C AND R AND (A OR F OR (P AND I)); every factor used by a satisfying branch must be applicable"

const inputFiles = {
	compactCandidateManifest:
		"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/manifest.json",
	compactCandidateProtocol:
		"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/protocol.json",
	compactCandidateAnalysis:
		"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/analysis.json",
	compactCandidateResults:
		"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/results.json",
	compactCandidateFrontier:
		"research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/frontier.json",
	factorialAncestryManifest:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/manifest.json",
	factorialAncestryProtocol:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/protocol.json",
	factorialAncestryAnalysis:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/analysis.json",
	factorialAncestryResults:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/results.json",
	factorialAncestryFrontier:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/frontier.json",
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceProtocol: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/protocol.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	evidenceResults: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/results.json",
	frozenParetoManifest: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/manifest.json",
	frozenParetoResults: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/results.json",
	frozenParetoCertificates: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette.ts",
	"research/src/extract.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/gradient-field-topology.ts",
	"research/src/gradient-field-topology-model.ts",
	"research/src/field-relation.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/joint-palette-evidence.ts",
	"research/src/next-palette-joint-pareto.ts",
	"research/src/joint-palette-compact-relation-dominance.ts",
	"research/audit-joint-palette-field-identity-overlay-availability-development.ts",
	"research/tests/joint-palette-field-identity-overlay-availability-audit-artifact.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type FrozenCompactResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette
	certificate: JointPaletteCompactRelationDominanceCertificate
	structural: { violations: string[] }
}
type Task = Source & { canonicalExtraction: ExtractionResult; frozen: FrozenCompactResult }
type LineageIdentity = {
	representativePixelIndex: number
	supportMaskSha256: string
	identity: string
}
type FamilyIdentity = { supportMaskSha256: string; identity: string; pixels: number; population: number }
type FactorStatus = { applicable: boolean; pass: boolean; reason: string | null }
type FactorBits = Record<typeof factorNames[number], boolean>
type PopulationProfile = {
	order: readonly ["backgroundNode", "surfaceNode", "endpointUnion", "backgroundFamily", "surfaceFamily", "familyUnion"]
	vector: readonly [number, number, number, number, number, number]
	pixels: {
		backgroundNode: number
		surfaceNode: number
		endpointUnion: number
		backgroundFamily: number
		surfaceFamily: number
		familyUnion: number
	}
}
type OwnershipProfile = {
	order: readonly ["backgroundAntiFrame", "surfaceAntiFrame", "surfaceRoleOwnership", "spatialFieldOwnership",
		"interiorSurfaceSupport"]
	vector: readonly [number, number, number, number, number]
	frameBurden: { background: number; surface: number }
	rawTopologyVersion: string
}
type CanonicalPair = {
	background: PaletteRelationNode
	surface: PaletteRelationNode
	support: number
	compact: CompactRelationEvidence | null
	backgroundLineage: LineageIdentity
	surfaceLineage: LineageIdentity
	backgroundFamily: FamilyIdentity
	surfaceFamily: FamilyIdentity
	pairIdentity: string
}
type ChangedAudit = {
	canonicalResolution: {
		state: JointPaletteFieldState
		backgroundAliasCount: number
		surfaceAliasCount: number
		evaluatedPairCount: number
		maximumSupport: number
		maximizingPairCount: number
		maximizingPairs: Array<{
			pairIdentity: string
			background: LineageIdentity
			surface: LineageIdentity
			backgroundFamily: FamilyIdentity
			surfaceFamily: FamilyIdentity
			support: number
			compact: CompactRelationEvidence | null
			recompositionPass: boolean
		}>
	}
	selectedResolution: {
		background: LineageIdentity
		surface: LineageIdentity
		backgroundFamily: FamilyIdentity
		surfaceFamily: FamilyIdentity
		compact: CompactRelationEvidence | null
		recompositionPass: boolean
	}
	factors: {
		A: FactorStatus & {
			matchedRoles: Array<"background" | "surface">
			ambiguity: { maximizingPairs: number; backgroundLineages: number; surfaceLineages: number }
		}
		F: FactorStatus & {
			changedRoles: Array<"background" | "surface">
			matchedRoles: Array<"background" | "surface">
			roles: Record<"background" | "surface", {
				changed: boolean
				selectedFamily: FamilyIdentity
				canonicalFamilies: FamilyIdentity[]
				retained: boolean
			}>
		}
		P: FactorStatus & {
			candidate: PopulationProfile
			comparisons: Array<{
				canonicalPairIdentity: string
				canonical: PopulationProfile
				deltas: number[]
				componentPass: boolean[]
				pass: boolean
			}>
		}
		I: FactorStatus & {
			candidate: OwnershipProfile | null
			comparisons: Array<{
				canonicalPairIdentity: string
				canonical: OwnershipProfile | null
				deltas: number[] | null
				componentPass: boolean[] | null
				pass: boolean
			}>
		}
		R: FactorStatus & {
			policy: "all-source-pixels-nearest-of-four-oklab-roles"
			pixelCount: number
			canonicalError: number
			candidateError: number
			delta: number
		}
		C: FactorStatus & {
			edges: Record<string, {
				canonicalSignedLc: number
				candidateSignedLc: number
				magnitudeDelta: number
				finite: boolean
				polarityPreserved: boolean
				magnitudeNonregression: boolean
				pass: boolean
			}>
		}
	}
	bits: FactorBits
	route: string
	qualifyingBranches: Array<"A" | "F" | "P&I">
	prospectiveArm: boolean
	diagnostics: {
		geometry: Array<{
			canonicalPairIdentity: string
			background: ReturnType<typeof maskGeometry>
			surface: ReturnType<typeof maskGeometry>
			endpointMovement: { background: number; surface: number }
		}>
		relation: {
			selectedCompactVector: readonly number[] | null
			canonicalComparisons: Array<{
				canonicalPairIdentity: string
				canonicalCompactVector: readonly number[] | null
				deltas: number[] | null
				ratios: Array<number | null> | null
			}>
		}
		minimumRoleDistance: { canonical: number; candidate: number; delta: number }
		overlayAvailability: Record<"foreground" | "accent", OverlayAvailability>
	}
}
type OverlayAvailability = {
	diagnosticOnly: true
	canonicalColorAliasCount: number
	presentCanonicalSelectedAlias: number
	presentUnselectedFeasible: number
	presentUnselectedInfeasible: number
	absentFromEvidence: number
	outsideCanonicalColorDomain: number
	selectedIdentity: LineageIdentity
	aliases: Array<{
		identity: LineageIdentity
		classification: "present-canonical-selected-alias" | "present-unselected-feasible" |
			"present-unselected-infeasible"
		feasibility: Record<string, boolean>
	}>
}
type WorkerResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	classification: "compact-changed-candidate" | "canonical-fallback"
	canonical: Palette
	candidate: Palette
	state: JointPaletteFieldState
	reproduction: {
		candidatePalette: boolean
		candidateCertificate: boolean
		canonicalPalette: boolean
		sourceReadOnly: boolean
	}
	candidateEligibility: { checks: Record<string, boolean>; pass: boolean }
	fallback: null | { route: string; exactCanonicalByteIdentity: boolean }
	audit: ChangedAudit | null
	structural: { violations: string[] }
	elapsedMs: number
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

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function sameRole(first: Palette[RoleName], second: Palette[RoleName]): boolean {
	return sameRgb(first.rgb, second.rgb) && first.generated === second.generated
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function compactRelation(state: JointPaletteFieldState, relation: FieldRelationEvidence | null): CompactRelationEvidence | null {
	if (state === "collapsed" || !relation) return null
	const topologyInputs = {
		continuity: relation.distribution.continuity,
		monotoneConnectivity: relation.topology.monotoneConnectivity,
		progression: relation.distribution.progression,
	}
	const stateTopology = state === "gradient"
		? harmonicConjunction([topologyInputs.continuity, topologyInputs.monotoneConnectivity, topologyInputs.progression])
		: clampRelationEvidence(1 - Math.max(topologyInputs.continuity, topologyInputs.progression))
	const recomposedJointSupport = harmonicConjunction([
		relation.field.backgroundSupport,
		relation.field.surfaceSupport,
	])
	const reportedStateSupport = state === "gradient" ? relation.stateSupport.gradient : relation.stateSupport.distinctFlat
	const recomposedStateSupport = harmonicConjunction([relation.endpoint.mass, recomposedJointSupport, stateTopology])
	return {
		vector: [relation.endpoint.mass, relation.field.backgroundSupport, relation.field.surfaceSupport, stateTopology],
		endpointMass: relation.endpoint.mass,
		backgroundSupport: relation.field.backgroundSupport,
		surfaceSupport: relation.field.surfaceSupport,
		stateTopology,
		topologyInputs,
		jointSupport: relation.field.jointSupport,
		recomposedJointSupport,
		reportedStateSupport,
		recomposedStateSupport,
		recompositionPass: Math.abs(relation.field.jointSupport - recomposedJointSupport) <= epsilon &&
			Math.abs(reportedStateSupport - recomposedStateSupport) <= epsilon,
	}
}

function countMask(mask: Uint8Array): number {
	let count = 0
	for (const value of mask) count += Number(value > 0)
	return count
}

function countUnion(first: Uint8Array, second: Uint8Array): number {
	if (first.length !== second.length) throw new Error("Mask domains differ")
	let count = 0
	for (let index = 0; index < first.length; index++) count += Number(first[index] > 0 || second[index] > 0)
	return count
}

function lineageIdentity(representativePixelIndex: number, maskHash: string): LineageIdentity {
	return {
		representativePixelIndex,
		supportMaskSha256: maskHash,
		identity: `${representativePixelIndex}:${maskHash}`,
	}
}

function nodeLineage(node: PaletteRelationNode): LineageIdentity {
	return lineageIdentity(node.representativePixelIndex, sha256(node.mask))
}

function familyIdentity(node: PaletteRelationNode, total: number): FamilyIdentity {
	const mask = node.family.mask
	const pixels = countMask(mask)
	const supportMaskSha256 = sha256(mask)
	return { supportMaskSha256, identity: supportMaskSha256, pixels, population: pixels / total }
}

function pairIdentity(background: LineageIdentity, surface: LineageIdentity): string {
	return `${background.identity}|${surface.identity}`
}

function populationProfile(background: PaletteRelationNode, surface: PaletteRelationNode, total: number): PopulationProfile {
	const backgroundNode = countMask(background.mask)
	const surfaceNode = countMask(surface.mask)
	const endpointUnion = countUnion(background.mask, surface.mask)
	const backgroundFamilyMask = background.family.mask
	const surfaceFamilyMask = surface.family.mask
	const backgroundFamily = countMask(backgroundFamilyMask)
	const surfaceFamily = countMask(surfaceFamilyMask)
	const familyUnion = countUnion(backgroundFamilyMask, surfaceFamilyMask)
	return {
		order: ["backgroundNode", "surfaceNode", "endpointUnion", "backgroundFamily", "surfaceFamily", "familyUnion"],
		vector: [backgroundNode / total, surfaceNode / total, endpointUnion / total,
			backgroundFamily / total, surfaceFamily / total, familyUnion / total],
		pixels: { backgroundNode, surfaceNode, endpointUnion, backgroundFamily, surfaceFamily, familyUnion },
	}
}

function ownershipProfile(
	background: PaletteRelationNode,
	surface: PaletteRelationNode,
	analysis: ReturnType<typeof buildJointPaletteEvidence>["perception"]["analysis"],
): OwnershipProfile | null {
	const topology = analyzeGradientFieldTopology(background.candidate, surface.candidate, analysis)
	const backgroundFrame = Math.max(background.spatial.frame, background.familySpatial.frame)
	const surfaceFrame = Math.max(surface.spatial.frame, surface.familySpatial.frame)
	const vector = [
		1 - backgroundFrame,
		1 - surfaceFrame,
		topology.ownership.surfaceRoleOwnership,
		topology.ownership.spatialFieldOwnership,
		topology.legacyDiagnostics.interiorSurfaceSupport,
	] as const
	if (topology.endpointDistance <= epsilon || !vector.every(Number.isFinite)) return null
	return {
		order: ["backgroundAntiFrame", "surfaceAntiFrame", "surfaceRoleOwnership", "spatialFieldOwnership",
			"interiorSurfaceSupport"],
		vector,
		frameBurden: { background: backgroundFrame, surface: surfaceFrame },
		rawTopologyVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
	}
}

function reconstruction(
	canonical: Palette,
	candidate: Palette,
	analysis: ReturnType<typeof buildJointPaletteEvidence>["perception"]["analysis"],
): ChangedAudit["factors"]["R"] {
	const canonicalLabs = roleNames.map((role) => rgbToOKLab(canonical[role].rgb))
	const candidateLabs = roleNames.map((role) => rgbToOKLab(candidate[role].rgb))
	const pixelCount = analysis.width * analysis.height
	let canonicalSum = 0
	let candidateSum = 0
	for (let pixel = 0; pixel < pixelCount; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		canonicalSum += Math.min(...canonicalLabs.map((role) => okDistance(lab, role)))
		candidateSum += Math.min(...candidateLabs.map((role) => okDistance(lab, role)))
	}
	const canonicalError = pixelCount === 0 ? 0 : canonicalSum / pixelCount
	const candidateError = pixelCount === 0 ? 0 : candidateSum / pixelCount
	const applicable = pixelCount > 0 && Number.isFinite(canonicalError) && Number.isFinite(candidateError)
	return {
		applicable,
		pass: applicable && candidateError <= canonicalError + epsilon,
		reason: applicable ? null : "empty-or-nonfinite-common-pixel-domain",
		policy: "all-source-pixels-nearest-of-four-oklab-roles",
		pixelCount,
		canonicalError,
		candidateError,
		delta: candidateError - canonicalError,
	}
}

function consumerEdges(canonical: Palette, candidate: Palette): ChangedAudit["factors"]["C"] {
	const definitions = {
		foregroundOnBackground: ["foreground", "background"],
		foregroundOnSurface: ["foreground", "surface"],
		accentOnBackground: ["accent", "background"],
		accentOnSurface: ["accent", "surface"],
	} as const
	const edges: ChangedAudit["factors"]["C"]["edges"] = {}
	for (const [name, [overlay, field]] of Object.entries(definitions)) {
		const canonicalSignedLc = apcaContrast(canonical[overlay].rgb, canonical[field].rgb)
		const candidateSignedLc = apcaContrast(candidate[overlay].rgb, candidate[field].rgb)
		const finite = Number.isFinite(canonicalSignedLc) && Number.isFinite(candidateSignedLc)
		const polarityPreserved = finite && Math.sign(candidateSignedLc) === Math.sign(canonicalSignedLc)
		const magnitudeDelta = Math.abs(candidateSignedLc) - Math.abs(canonicalSignedLc)
		const magnitudeNonregression = finite && magnitudeDelta >= -epsilon
		edges[name] = {
			canonicalSignedLc,
			candidateSignedLc,
			magnitudeDelta,
			finite,
			polarityPreserved,
			magnitudeNonregression,
			pass: finite && polarityPreserved && magnitudeNonregression,
		}
	}
	const applicable = Object.values(edges).every((edge) => edge.finite)
	return {
		applicable,
		pass: applicable && Object.values(edges).every((edge) => edge.pass),
		reason: applicable ? null : "nonfinite-signed-apca",
		edges,
	}
}

function maskGeometry(selected: Uint8Array, canonical: Uint8Array): {
	selectedPixels: number
	canonicalPixels: number
	retainedPixels: number
	removedPixels: number
	newPixels: number
	unionPixels: number
	retainedShareOfCanonical: number
	newShareOfSelected: number
} {
	if (selected.length !== canonical.length) throw new Error("Geometry mask domains differ")
	let selectedPixels = 0
	let canonicalPixels = 0
	let retainedPixels = 0
	let removedPixels = 0
	let newPixels = 0
	for (let index = 0; index < selected.length; index++) {
		const hasSelected = selected[index] > 0
		const hasCanonical = canonical[index] > 0
		selectedPixels += Number(hasSelected)
		canonicalPixels += Number(hasCanonical)
		retainedPixels += Number(hasSelected && hasCanonical)
		removedPixels += Number(!hasSelected && hasCanonical)
		newPixels += Number(hasSelected && !hasCanonical)
	}
	return {
		selectedPixels,
		canonicalPixels,
		retainedPixels,
		removedPixels,
		newPixels,
		unionPixels: retainedPixels + removedPixels + newPixels,
		retainedShareOfCanonical: canonicalPixels === 0 ? 0 : retainedPixels / canonicalPixels,
		newShareOfSelected: selectedPixels === 0 ? 0 : newPixels / selectedPixels,
	}
}

function overlayLineage(alternative: JointPaletteOverlayAlternative): LineageIdentity {
	return lineageIdentity(alternative.provenance.representativePixelIndex, alternative.provenance.supportMaskSha256)
}

function overlayAvailability(
	role: "foreground" | "accent",
	canonical: Palette,
	candidate: Palette,
	certificate: JointPaletteCompactRelationDominanceCertificate,
	overlays: readonly JointPaletteOverlayAlternative[],
): OverlayAvailability {
	const selectedRole = certificate.selected.roles![role]
	const selectedIdentity = lineageIdentity(selectedRole.representativePixelIndex, selectedRole.supportMaskSha256)
	const aliases = overlays.filter((alternative) => sameRgb(alternative.rgb, canonical[role].rgb))
	const foregroundRgb = canonical.foreground.rgb
	const accentRgb = canonical.accent.rgb
	const records = aliases.map((alternative) => {
		const identity = overlayLineage(alternative)
		const selected = identity.identity === selectedIdentity.identity
		const support = role === "foreground"
			? alternative.evidence.foregroundSupport + epsilon >= certificate.canonical.objectives[2]
			: alternative.evidence.accentIdentitySupport + epsilon >= certificate.canonical.objectives[4]
		const fieldDistinct = !sameRgb(alternative.rgb, candidate.background.rgb) &&
			!sameRgb(alternative.rgb, candidate.surface.rgb)
		const coupledSemantics = role === "foreground" || !sameRgb(alternative.rgb, foregroundRgb) ||
			sameRgb(foregroundRgb, accentRgb)
		const cardinality = new Set([
			candidate.background.rgb,
			role === "foreground" ? alternative.rgb : foregroundRgb,
			candidate.surface.rgb,
			role === "accent" ? alternative.rgb : accentRgb,
		].map((rgb) => rgb.join(","))).size <= 4
		const feasibility = { canonicalColorSemantics: true, incumbentRoleSupport: support, fieldDistinct,
			coupledSemantics, maximumFourColors: cardinality }
		const feasible = Object.values(feasibility).every(Boolean)
		return {
			identity,
			classification: selected ? "present-canonical-selected-alias" as const : feasible
				? "present-unselected-feasible" as const : "present-unselected-infeasible" as const,
			feasibility,
		}
	})
	return {
		diagnosticOnly: true,
		canonicalColorAliasCount: aliases.length,
		presentCanonicalSelectedAlias: records.filter((record) =>
			record.classification === "present-canonical-selected-alias").length,
		presentUnselectedFeasible: records.filter((record) =>
			record.classification === "present-unselected-feasible").length,
		presentUnselectedInfeasible: records.filter((record) =>
			record.classification === "present-unselected-infeasible").length,
		absentFromEvidence: Number(!records.some((record) => record.identity.identity === selectedIdentity.identity)),
		outsideCanonicalColorDomain: overlays.length - aliases.length,
		selectedIdentity,
		aliases: records,
	}
}

function factorRoute(bits: FactorBits): string {
	return factorNames.map((factor) => `${factor}${Number(bits[factor])}`).join("")
}

function canonicalPairs(
	canonical: Palette,
	graph: ReturnType<typeof buildJointPaletteEvidence>["graph"],
	analysis: ReturnType<typeof buildJointPaletteEvidence>["perception"]["analysis"],
): { backgrounds: PaletteRelationNode[]; surfaces: PaletteRelationNode[]; pairs: CanonicalPair[]; maximizing: CanonicalPair[];
	maximumSupport: number } {
	const state = fieldState(canonical)
	const total = analysis.width * analysis.height
	const nodes = graph.nodes.filter((node) => !node.typographyOnly)
	const backgrounds = canonical.background.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaces = canonical.surface.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const pairs = backgrounds.flatMap((background) => surfaces.map((surface): CanonicalPair => {
		const evidence = jointPaletteFieldStateEvidence(graph, analysis, background, surface, state)
		const backgroundLineage = nodeLineage(background)
		const surfaceLineage = nodeLineage(surface)
		return {
			background,
			surface,
			support: evidence.support,
			compact: compactRelation(state, evidence.relation),
			backgroundLineage,
			surfaceLineage,
			backgroundFamily: familyIdentity(background, total),
			surfaceFamily: familyIdentity(surface, total),
			pairIdentity: pairIdentity(backgroundLineage, surfaceLineage),
		}
	})).sort((first, second) => compareAscii(first.pairIdentity, second.pairIdentity))
	const maximumSupport = pairs.length === 0 ? 0 : Math.max(...pairs.map((pair) => pair.support))
	const maximizing = pairs.filter((pair) => Math.abs(pair.support - maximumSupport) <= epsilon)
	return { backgrounds, surfaces, pairs, maximizing, maximumSupport }
}

function evaluateChanged(
	canonical: Palette,
	candidate: Palette,
	certificate: JointPaletteCompactRelationDominanceCertificate,
	evidence: ReturnType<typeof buildJointPaletteEvidence>,
): { audit: ChangedAudit; violations: string[] } {
	const violations: string[] = []
	const analysis = evidence.perception.analysis
	const total = analysis.width * analysis.height
	const state = fieldState(canonical)
	const canonicalDomain = canonicalPairs(canonical, evidence.graph, analysis)
	const treatment = certificate.selected.fieldTreatment
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	const selectedBackground = treatment ? nodeById.get(treatment.backgroundNodeId) : undefined
	const selectedSurface = treatment ? nodeById.get(treatment.surfaceNodeId) : undefined
	if (!treatment || !selectedBackground || !selectedSurface) {
		throw new Error("Changed compact candidate lacks a reproducible selected field treatment")
	}
	const selectedEvidence = jointPaletteFieldStateEvidence(
		evidence.graph, analysis, selectedBackground, selectedSurface, treatment.state,
	)
	const selectedCompact = compactRelation(treatment.state, selectedEvidence.relation)
	const selectedBackgroundLineage = nodeLineage(selectedBackground)
	const selectedSurfaceLineage = nodeLineage(selectedSurface)
	const selectedBackgroundFamily = familyIdentity(selectedBackground, total)
	const selectedSurfaceFamily = familyIdentity(selectedSurface, total)
	const selectedRoleProvenance = certificate.selected.roles!
	if (selectedBackgroundLineage.identity !== lineageIdentity(
		selectedRoleProvenance.background.representativePixelIndex,
		selectedRoleProvenance.background.supportMaskSha256,
	).identity || selectedSurfaceLineage.identity !== lineageIdentity(
		selectedRoleProvenance.surface.representativePixelIndex,
		selectedRoleProvenance.surface.supportMaskSha256,
	).identity) violations.push("selected-field-lineage-provenance")
	if (canonicalDomain.maximizing.length === 0) violations.push("canonical-alias-resolution-empty")
	if (Math.abs(canonicalDomain.maximumSupport - certificate.canonical.relation.maximumSupport) > epsilon ||
		Math.abs(canonicalDomain.maximumSupport - certificate.canonical.relation.incumbentObjectiveStateSupport) > epsilon ||
		canonicalDomain.maximizing.length !== certificate.canonical.relation.maximizingPairCount) {
		violations.push("canonical-alias-support-reproduction")
	}
	if (canonicalDomain.maximizing.some((pair) => !pair.compact?.recompositionPass ||
		Math.abs(pair.support - pair.compact.reportedStateSupport) > epsilon)) {
		violations.push("canonical-alias-relation-recomposition")
	}
	if (!selectedCompact?.recompositionPass || Math.abs(selectedEvidence.support - treatment.stateSupport) > epsilon ||
		Math.abs(selectedEvidence.endpointDistance - treatment.endpointDistance) > epsilon ||
		!isDeepStrictEqual(selectedEvidence.relation, treatment.fieldRelation) ||
		!isDeepStrictEqual(selectedCompact, certificate.selected.compact)) {
		violations.push("selected-relation-recomposition")
	}

	const canonicalBackgroundLineages = new Set(canonicalDomain.maximizing.map((pair) => pair.backgroundLineage.identity))
	const canonicalSurfaceLineages = new Set(canonicalDomain.maximizing.map((pair) => pair.surfaceLineage.identity))
	const aMatchedRoles = fieldRoles.filter((role) => role === "background"
		? canonicalBackgroundLineages.has(selectedBackgroundLineage.identity)
		: canonicalSurfaceLineages.has(selectedSurfaceLineage.identity))
	const aApplicable = canonicalDomain.maximizing.length > 0
	const factorA: ChangedAudit["factors"]["A"] = {
		applicable: aApplicable,
		pass: aApplicable && aMatchedRoles.length > 0,
		reason: aApplicable ? null : "canonical-or-selected-lineage-unavailable",
		matchedRoles: aMatchedRoles,
		ambiguity: {
			maximizingPairs: canonicalDomain.maximizing.length,
			backgroundLineages: canonicalBackgroundLineages.size,
			surfaceLineages: canonicalSurfaceLineages.size,
		},
	}

	const changedRoles = fieldRoles.filter((role) => !sameRole(candidate[role], canonical[role]))
	const familyRole = (role: "background" | "surface") => {
		const selectedFamily = role === "background" ? selectedBackgroundFamily : selectedSurfaceFamily
		const canonicalFamilies = [...new Map(canonicalDomain.maximizing.map((pair) => {
			const family = role === "background" ? pair.backgroundFamily : pair.surfaceFamily
			return [family.identity, family] as const
		})).values()].sort((first, second) => compareAscii(first.identity, second.identity))
		return {
			changed: changedRoles.includes(role),
			selectedFamily,
			canonicalFamilies,
			retained: changedRoles.includes(role) && canonicalFamilies.some((family) => family.identity === selectedFamily.identity),
		}
	}
	const familyRoles = { background: familyRole("background"), surface: familyRole("surface") }
	const familyMappingAvailable = changedRoles.length > 0 && changedRoles.every((role) =>
		familyRoles[role].canonicalFamilies.length > 0 && familyRoles[role].selectedFamily.pixels > 0)
	const fMatchedRoles = changedRoles.filter((role) => familyRoles[role].retained)
	const factorF: ChangedAudit["factors"]["F"] = {
		applicable: familyMappingAvailable,
		pass: familyMappingAvailable && fMatchedRoles.length > 0,
		reason: familyMappingAvailable ? null : "exact-source-family-union-mask-mapping-unavailable",
		changedRoles,
		matchedRoles: fMatchedRoles,
		roles: familyRoles,
	}

	const candidatePopulation = populationProfile(selectedBackground, selectedSurface, total)
	const populationComparisons = canonicalDomain.maximizing.map((pair) => {
		const canonicalProfile = populationProfile(pair.background, pair.surface, total)
		const deltas = candidatePopulation.vector.map((value, index) => value - canonicalProfile.vector[index])
		const componentPass = deltas.map((delta) => delta >= -epsilon)
		return { canonicalPairIdentity: pair.pairIdentity, canonical: canonicalProfile, deltas, componentPass,
			pass: componentPass.every(Boolean) }
	})
	const pApplicable = canonicalDomain.maximizing.length > 0 && populationComparisons.every((comparison) =>
		comparison.canonical.vector.length === candidatePopulation.vector.length)
	const factorP: ChangedAudit["factors"]["P"] = {
		applicable: pApplicable,
		pass: pApplicable && populationComparisons.some((comparison) => comparison.pass),
		reason: pApplicable ? null : "exact-mask-population-domain-unavailable",
		candidate: candidatePopulation,
		comparisons: populationComparisons,
	}

	const candidateOwnership = ownershipProfile(selectedBackground, selectedSurface, analysis)
	const ownershipComparisons = canonicalDomain.maximizing.map((pair) => {
		const canonicalOwnership = ownershipProfile(pair.background, pair.surface, analysis)
		const deltas = candidateOwnership && canonicalOwnership
			? candidateOwnership.vector.map((value, index) => value - canonicalOwnership.vector[index]) : null
		const componentPass = deltas?.map((delta) => delta >= -epsilon) ?? null
		return { canonicalPairIdentity: pair.pairIdentity, canonical: canonicalOwnership, deltas, componentPass,
			pass: componentPass?.every(Boolean) ?? false }
	})
	const iApplicable = candidateOwnership !== null && canonicalDomain.maximizing.length > 0 &&
		ownershipComparisons.every((comparison) => comparison.canonical !== null)
	const factorI: ChangedAudit["factors"]["I"] = {
		applicable: iApplicable,
		pass: iApplicable && ownershipComparisons.some((comparison) => comparison.pass),
		reason: iApplicable ? null : "raw-nonfitted-ownership-components-unavailable",
		candidate: candidateOwnership,
		comparisons: ownershipComparisons,
	}

	const factorR = reconstruction(canonical, candidate, analysis)
	const factorC = consumerEdges(canonical, candidate)
	const factors = { A: factorA, F: factorF, P: factorP, I: factorI, R: factorR, C: factorC }
	const bits = Object.fromEntries(factorNames.map((factor) =>
		[factor, factors[factor].applicable && factors[factor].pass])) as FactorBits
	const qualifyingBranches: ChangedAudit["qualifyingBranches"] = []
	if (factorA.applicable && factorA.pass) qualifyingBranches.push("A")
	if (factorF.applicable && factorF.pass) qualifyingBranches.push("F")
	if (factorP.applicable && factorP.pass && factorI.applicable && factorI.pass) qualifyingBranches.push("P&I")
	const prospectiveArm = factorC.applicable && factorC.pass && factorR.applicable && factorR.pass &&
		qualifyingBranches.length > 0

	const selectedLabs = roleNames.map((role) => rgbToOKLab(candidate[role].rgb))
	const canonicalLabs = roleNames.map((role) => rgbToOKLab(canonical[role].rgb))
	const geometry = canonicalDomain.maximizing.map((pair) => ({
		canonicalPairIdentity: pair.pairIdentity,
		background: maskGeometry(selectedBackground.mask, pair.background.mask),
		surface: maskGeometry(selectedSurface.mask, pair.surface.mask),
		endpointMovement: {
			background: okDistance(selectedBackground.lab, pair.background.lab),
			surface: okDistance(selectedSurface.lab, pair.surface.lab),
		},
	}))
	const relationComparisons = canonicalDomain.maximizing.map((pair) => {
		const deltas = selectedCompact && pair.compact
			? selectedCompact.vector.map((value, index) => value - pair.compact!.vector[index]) : null
		const ratios = selectedCompact && pair.compact
			? selectedCompact.vector.map((value, index) => Math.abs(pair.compact!.vector[index]) <= epsilon
				? null : value / pair.compact!.vector[index]) : null
		return { canonicalPairIdentity: pair.pairIdentity, canonicalCompactVector: pair.compact?.vector ?? null, deltas, ratios }
	})
	const canonicalMinimum = roleMinimumDistance(canonicalLabs)
	const candidateMinimum = roleMinimumDistance(selectedLabs)
	return {
		audit: {
			canonicalResolution: {
				state,
				backgroundAliasCount: canonicalDomain.backgrounds.length,
				surfaceAliasCount: canonicalDomain.surfaces.length,
				evaluatedPairCount: canonicalDomain.pairs.length,
				maximumSupport: canonicalDomain.maximumSupport,
				maximizingPairCount: canonicalDomain.maximizing.length,
				maximizingPairs: canonicalDomain.maximizing.map((pair) => ({
					pairIdentity: pair.pairIdentity,
					background: pair.backgroundLineage,
					surface: pair.surfaceLineage,
					backgroundFamily: pair.backgroundFamily,
					surfaceFamily: pair.surfaceFamily,
					support: pair.support,
					compact: pair.compact,
					recompositionPass: pair.compact?.recompositionPass === true &&
						Math.abs(pair.support - pair.compact.reportedStateSupport) <= epsilon,
				})),
			},
			selectedResolution: {
				background: selectedBackgroundLineage,
				surface: selectedSurfaceLineage,
				backgroundFamily: selectedBackgroundFamily,
				surfaceFamily: selectedSurfaceFamily,
				compact: selectedCompact,
				recompositionPass: selectedCompact?.recompositionPass === true &&
					Math.abs(selectedEvidence.support - selectedCompact.reportedStateSupport) <= epsilon,
			},
			factors,
			bits,
			route: factorRoute(bits),
			qualifyingBranches,
			prospectiveArm,
			diagnostics: {
				geometry,
				relation: { selectedCompactVector: selectedCompact?.vector ?? null, canonicalComparisons: relationComparisons },
				minimumRoleDistance: { canonical: canonicalMinimum, candidate: candidateMinimum,
					delta: candidateMinimum - canonicalMinimum },
				overlayAvailability: {
					foreground: overlayAvailability("foreground", canonical, candidate, certificate, evidence.overlays),
					accent: overlayAvailability("accent", canonical, candidate, certificate, evidence.overlays),
				},
			},
		},
		violations,
	}
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized audit source: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const sourceDataBefore = sha256(image.data)
	const started = performance.now()
	// The compact candidate is called exactly once for every source. Additional evidence is built only for its frozen changed set.
	const rerun = buildJointPaletteCompactRelationDominance(image)
	const changed = rerun.certificate.selected.changed
	const frozenChanged = task.frozen.certificate.selected.changed
	const canonical = task.canonicalExtraction.methods.spatial
	const reproduction = {
		candidatePalette: isDeepStrictEqual(rerun.candidate, task.frozen.candidate),
		candidateCertificate: isDeepStrictEqual(rerun.certificate, task.frozen.certificate),
		canonicalPalette: isDeepStrictEqual(rerun.canonical, canonical) &&
			JSON.stringify(rerun.canonical) === JSON.stringify(canonical) &&
			isDeepStrictEqual(rerun.canonical, task.frozen.canonical),
		sourceReadOnly: false,
	}
	const violations: string[] = []
	if (!reproduction.candidatePalette) violations.push("frozen-candidate-palette-reproduction")
	if (!reproduction.candidateCertificate) violations.push("frozen-candidate-certificate-reproduction")
	if (!reproduction.canonicalPalette) violations.push("canonical-palette-byte-identity")
	if (changed !== frozenChanged) violations.push("frozen-changed-classification")
	if (task.frozen.file !== task.path || task.frozen.cohort !== task.cohort ||
		task.frozen.source.sha256 !== task.sha256 || task.frozen.source.bytes !== task.bytes) {
		violations.push("frozen-source-binding")
	}
	if (task.frozen.structural.violations.length > 0) violations.push("frozen-candidate-structural")
	if (rerun.certificate.policy.fixedApcaAdmissionFloor !== null) violations.push("fixed-apca-floor")
	let audit: ChangedAudit | null = null
	if (changed) {
		const evaluated = evaluateChanged(canonical, rerun.candidate, rerun.certificate, buildJointPaletteEvidence(image))
		audit = evaluated.audit
		violations.push(...evaluated.violations)
	}
	reproduction.sourceReadOnly = sha256(image.data) === sourceDataBefore
	if (!reproduction.sourceReadOnly) violations.push("source-image-mutation")
	const exactCanonicalByteIdentity = JSON.stringify(rerun.candidate) === JSON.stringify(canonical)
	if (!changed && !exactCanonicalByteIdentity) violations.push("canonical-fallback-byte-identity")
	const eligibilityChecks = {
		frozenChanged,
		rerunChanged: changed,
		frozenStructurallyClean: task.frozen.structural.violations.length === 0,
		exactFrozenPalette: reproduction.candidatePalette,
		exactFrozenCertificate: reproduction.candidateCertificate,
		exactCanonicalReproduction: reproduction.canonicalPalette,
		compactDominatorRoute: rerun.certificate.route === "compact-relation-dominator",
		admitted: rerun.certificate.selected.admitted,
		oneChangedSemanticBlock: rerun.certificate.selected.changedSemanticBlocks === 1,
		allDeclaredInvariants: Object.values(rerun.certificate.invariants).every(Boolean),
	}
	const candidateEligibility = { checks: eligibilityChecks, pass: Object.values(eligibilityChecks).every(Boolean) }
	if (audit) audit.prospectiveArm = candidateEligibility.pass && audit.prospectiveArm
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		classification: changed ? "compact-changed-candidate" : "canonical-fallback",
		canonical,
		candidate: rerun.candidate,
		state: fieldState(rerun.candidate),
		reproduction,
		candidateEligibility,
		fallback: changed ? null : { route: rerun.certificate.route, exactCanonicalByteIdentity },
		audit,
		structural: { violations: [...new Set(violations)].sort(compareAscii) },
		elapsedMs: performance.now() - started,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const task of tasks) {
		results.push(await evaluate(task))
		parentPort?.postMessage({ progress: 1 })
	}
	return results
}

async function runParallel(tasks: Task[]): Promise<WorkerResult[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 10 === 0 || completed === tasks.length) {
					process.stderr.write(`field identity overlay availability audit: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Field identity audit worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		compareAscii(first.cohort, second.cohort) || compareAscii(first.file, second.file))
	process.stderr.write(`field identity overlay availability audit: ${results.length}/${tasks.length}\n`)
	return results
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function emptyRouteCounts(): Record<string, number> {
	const counts: Record<string, number> = {}
	for (let value = 0; value < 64; value++) {
		const bits = Object.fromEntries(factorNames.map((factor, index) =>
			[factor, Boolean(value & (1 << (5 - index)))])) as FactorBits
		counts[factorRoute(bits)] = 0
	}
	return counts
}

function stateComposition(entries: readonly WorkerResult[]): Record<string, number> {
	return {
		collapsed: entries.filter((entry) => entry.state === "collapsed").length,
		"distinct-flat": entries.filter((entry) => entry.state === "distinct-flat").length,
		gradient: entries.filter((entry) => entry.state === "gradient").length,
	}
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite append-only audit: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("audit-joint-palette-field-identity-overlay-availability-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		if (/review|feedback|interpretation|comments?|target|preferred|labels?|(?:^|\/)(?:10|11|12|13|14)(?:\/|$)/i
			.test(`${name}:${path}`)) throw new Error(`Forbidden audit input: ${name}`)
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const compactManifest = parse<{ experimentId: string; sources: Source[];
		inputs: Record<string, { path: string; sha256: string }> }>("compactCandidateManifest")
	const compactProtocol = parse<{ experimentVersion: string; selector: { fixedApcaAdmissionFloor: null } }>(
		"compactCandidateProtocol")
	const compactAnalysis = parse<{ experimentId: string; candidateCount: number;
		structural: { pass: boolean; violationCount: number; caseCount: number };
		matrix: { total: number; development: number; cohort00: number; changed: number; canonicalFallback: number } }>(
		"compactCandidateAnalysis")
	const compactResults = parse<{ experimentId: string; entries: FrozenCompactResult[] }>("compactCandidateResults")
	const compactFrontier = parse<{ experimentId: string; sampling: null; entries: Array<{ file: string }> }>(
		"compactCandidateFrontier")
	const factorialManifest = parse<{ experimentId: string; sources: Source[] }>("factorialAncestryManifest")
	const factorialProtocol = parse<{ experimentVersion: string }>("factorialAncestryProtocol")
	const factorialAnalysis = parse<{ experimentId: string; structural: { pass: boolean; violationCount: number; caseCount: number };
		matrix: { total: number; development: number; cohort00: number } }>("factorialAncestryAnalysis")
	const factorialResults = parse<{ experimentId: string; entries: unknown[] }>("factorialAncestryResults")
	const factorialFrontier = parse<{ experimentId: string; entries: unknown[] }>("factorialAncestryFrontier")
	const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
	const evidenceProtocol = parse<{ experimentVersion: string }>("evidenceProtocol")
	const evidenceAnalysis = parse<{ experimentId: string; structural: { pass: boolean; violationCount: number };
		coverage: { total: number; development: number; cohort00: number }; stoppingRules: { pass: boolean } }>("evidenceAnalysis")
	const evidenceResults = parse<{ experimentId: string; entries: unknown[] }>("evidenceResults")
	const frozenManifest = parse<{ experimentId: string; sources: Source[] }>("frozenParetoManifest")
	const frozenResults = parse<{ experimentId: string; entries: unknown[] }>("frozenParetoResults")
	const frozenCertificates = parse<{ experimentId: string; entries: Record<string, unknown> }>("frozenParetoCertificates")
	const development = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (compactManifest.experimentId !== COMPACT_CANDIDATE_EXPERIMENT_ID ||
		compactAnalysis.experimentId !== COMPACT_CANDIDATE_EXPERIMENT_ID ||
		compactResults.experimentId !== COMPACT_CANDIDATE_EXPERIMENT_ID ||
		compactFrontier.experimentId !== COMPACT_CANDIDATE_EXPERIMENT_ID ||
		compactProtocol.experimentVersion !== JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION ||
		compactProtocol.selector.fixedApcaAdmissionFloor !== null || !compactAnalysis.structural.pass ||
		compactAnalysis.structural.violationCount !== 0 || compactAnalysis.structural.caseCount !== 0 ||
		!isDeepStrictEqual(compactAnalysis.matrix,
			{ total: 392, development: 37, cohort00: 355, changed: 18, canonicalFallback: 374 }) ||
		compactAnalysis.candidateCount !== 18 || compactFrontier.sampling !== null || compactFrontier.entries.length !== 18) {
		throw new Error("Compact candidate artifact binding disagrees")
	}
	if (factorialManifest.experimentId !== FACTORIAL_ANCESTRY_EXPERIMENT_ID ||
		factorialAnalysis.experimentId !== FACTORIAL_ANCESTRY_EXPERIMENT_ID ||
		factorialResults.experimentId !== FACTORIAL_ANCESTRY_EXPERIMENT_ID ||
		factorialFrontier.experimentId !== FACTORIAL_ANCESTRY_EXPERIMENT_ID || !factorialAnalysis.structural.pass ||
		factorialAnalysis.structural.violationCount !== 0 || factorialAnalysis.structural.caseCount !== 0 ||
		factorialProtocol.experimentVersion !== "next-palette-joint-field-relation-factorial-audit-0.1.0-development" ||
		!isDeepStrictEqual(factorialAnalysis.matrix, { ...factorialAnalysis.matrix, total: 392, development: 37, cohort00: 355 }) ||
		factorialResults.entries.length !== 392) throw new Error("Factorial ancestry binding disagrees")
	if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		evidenceResults.experimentId !== EVIDENCE_EXPERIMENT_ID || !evidenceAnalysis.structural.pass ||
		evidenceAnalysis.structural.violationCount !== 0 || !evidenceAnalysis.stoppingRules.pass ||
		evidenceProtocol.experimentVersion !== "joint-palette-evidence-frontier-0.1.1-development" ||
		!isDeepStrictEqual(evidenceAnalysis.coverage, { total: 392, development: 37, cohort00: 355 }) ||
		evidenceResults.entries.length !== 392) throw new Error("Complete evidence binding disagrees")
	if (frozenManifest.experimentId !== FROZEN_PARETO_EXPERIMENT_ID || frozenResults.experimentId !== FROZEN_PARETO_EXPERIMENT_ID ||
		frozenCertificates.experimentId !== FROZEN_PARETO_EXPERIMENT_ID || frozenResults.entries.length !== 392 ||
		Object.keys(frozenCertificates.entries).length !== 392) throw new Error("Frozen scientific binding disagrees")
	if (development.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION ||
		development.entries.length !== 37 || canonical00.entries.length !== 355) throw new Error("Canonical binding disagrees")
	if (![evidenceManifest.sources, factorialManifest.sources, frozenManifest.sources].every((sources) =>
		isDeepStrictEqual(sources, compactManifest.sources)) || compactManifest.sources.length !== 392 ||
		new Set(compactManifest.sources.map((source) => source.path)).size !== 392 || compactResults.entries.length !== 392) {
		throw new Error("Full-392 source manifests disagree")
	}
	const inheritedScientificInputs = ["evidenceManifest", "evidenceAnalysis", "jointParetoManifest", "jointParetoResults",
		"jointParetoCertificates", "canonicalDevelopment", "canonical00"] as const
	const inheritedBindings: Record<typeof inheritedScientificInputs[number], keyof typeof inputFiles> = {
		evidenceManifest: "evidenceManifest",
		evidenceAnalysis: "evidenceAnalysis",
		jointParetoManifest: "frozenParetoManifest",
		jointParetoResults: "frozenParetoResults",
		jointParetoCertificates: "frozenParetoCertificates",
		canonicalDevelopment: "canonicalDevelopment",
		canonical00: "canonical00",
	}
	for (const name of inheritedScientificInputs) {
		const direct = inputs[inheritedBindings[name]]
		if (!isDeepStrictEqual(compactManifest.inputs[name], { path: direct.path, sha256: direct.sha256 })) {
			throw new Error(`Compact candidate scientific binding changed: ${name}`)
		}
	}
	const canonicalByFile = canonicalMap(development, canonical00)
	const frozenByFile = new Map(compactResults.entries.map((entry) => [entry.file, entry]))
	const tasks = compactManifest.sources.map((source): Task => {
		const canonicalExtraction = canonicalByFile.get(source.path)
		const frozen = frozenByFile.get(source.path)
		if (!canonicalExtraction || !frozen) throw new Error(`Incomplete audit task: ${source.path}`)
		return { ...source, canonicalExtraction, frozen }
	})
	const results = await runParallel(tasks)
	const changed = results.filter((result) => result.classification === "compact-changed-candidate")
	const fallbacks = results.filter((result) => result.classification === "canonical-fallback")
	const violationCases = results.filter((result) => result.structural.violations.length > 0)
	const routeCounts = emptyRouteCounts()
	for (const result of changed) routeCounts[result.audit!.route]++
	const factorCounts = Object.fromEntries(factorNames.map((factor) => {
		const applicable = changed.filter((result) => result.audit!.factors[factor].applicable).length
		const pass = changed.filter((result) => result.audit!.bits[factor]).length
		return [factor, { applicable, pass, fail: applicable - pass, uncomparable: changed.length - applicable }]
	})) as Record<typeof factorNames[number], { applicable: number; pass: number; fail: number; uncomparable: number }>
	const nestedArmCounts = {
		A: changed.filter((result) => result.audit!.bits.A).length,
		AF: changed.filter((result) => result.audit!.bits.A && result.audit!.bits.F).length,
		AFP: changed.filter((result) => result.audit!.bits.A && result.audit!.bits.F && result.audit!.bits.P).length,
		AFPI: changed.filter((result) => result.audit!.bits.A && result.audit!.bits.F && result.audit!.bits.P &&
			result.audit!.bits.I).length,
		AFPIR: changed.filter((result) => factorNames.slice(0, 5).every((factor) => result.audit!.bits[factor])).length,
		AFPIRC: changed.filter((result) => factorNames.every((factor) => result.audit!.bits[factor])).length,
	}
	const conjunctiveCounts = {
		CR: changed.filter((result) => result.audit!.bits.C && result.audit!.bits.R).length,
		AorF: changed.filter((result) => result.audit!.bits.A || result.audit!.bits.F).length,
		PandI: changed.filter((result) => result.audit!.bits.P && result.audit!.bits.I).length,
		retentionDisjunction: changed.filter((result) => result.audit!.qualifyingBranches.length > 0).length,
		prospectiveArm: changed.filter((result) => result.audit!.prospectiveArm).length,
	}
	const factorAccountingReconciliation = Object.keys(routeCounts).length === 64 &&
		Object.values(routeCounts).reduce((sum, count) => sum + count, 0) === changed.length &&
		factorNames.every((factor) => factorCounts[factor].applicable + factorCounts[factor].uncomparable === changed.length &&
			factorCounts[factor].pass + factorCounts[factor].fail === factorCounts[factor].applicable) &&
		changed.every((result) => result.audit!.route === factorRoute(result.audit!.bits))
	const structuralChecksBeforeFrontier = {
		completeMatrix: results.length === 392,
		cohorts: results.filter((result) => result.cohort === "development").length === 37 &&
			results.filter((result) => result.cohort === "00").length === 355,
		candidateComposition: changed.length === 18 && fallbacks.length === 374,
		zeroViolations: violationCases.length === 0,
		exactFrozenReproduction: results.every((result) => result.reproduction.candidatePalette &&
			result.reproduction.candidateCertificate && result.reproduction.canonicalPalette),
		sourceHashesAndReadOnly: results.every((result) => result.reproduction.sourceReadOnly &&
			/^(?:images|00)\//.test(result.file)),
		canonicalByteIdentity: fallbacks.every((result) => result.fallback?.exactCanonicalByteIdentity === true),
		aliasRelationSupportRecomposition: changed.every((result) =>
			result.audit!.canonicalResolution.maximizingPairs.length > 0 &&
			result.audit!.canonicalResolution.maximizingPairs.every((pair) => pair.recompositionPass) &&
			result.audit!.selectedResolution.recompositionPass),
		factorAccountingReconciliation,
	}
	const stoppingRulesPassBeforeFrontier = Object.values(structuralChecksBeforeFrontier).every(Boolean)
	const expectedProspective = stoppingRulesPassBeforeFrontier
		? changed.filter((result) => result.candidateEligibility.pass && result.audit!.factors.C.applicable &&
			result.audit!.factors.C.pass && result.audit!.factors.R.applicable && result.audit!.factors.R.pass &&
			((result.audit!.factors.A.applicable && result.audit!.factors.A.pass) ||
				(result.audit!.factors.F.applicable && result.audit!.factors.F.pass) ||
				(result.audit!.factors.P.applicable && result.audit!.factors.P.pass &&
					result.audit!.factors.I.applicable && result.audit!.factors.I.pass)))
		: []
	const frontierEntries = expectedProspective.map((result) => ({
		file: result.file,
		cohort: result.cohort,
		source: { path: result.file, ...result.source },
		state: result.state,
		factorBits: result.audit!.bits,
		factorApplicability: Object.fromEntries(factorNames.map((factor) =>
			[factor, result.audit!.factors[factor].applicable])),
		qualifyingBranches: result.audit!.qualifyingBranches,
		baseline: result.canonical,
		candidate: result.candidate,
	}))
	const frontierEquality = isDeepStrictEqual(frontierEntries.map((entry) => entry.file),
		results.filter((result) => stoppingRulesPassBeforeFrontier && result.audit?.prospectiveArm).map((result) => result.file))
	const structuralChecks = { ...structuralChecksBeforeFrontier, frontierEquality }
	const structuralPass = Object.values(structuralChecks).every(Boolean)
	const sizeBand = frontierEntries.length === 0 ? "0" : frontierEntries.length <= 40 ? "1-40" : ">40"
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		auditType: "append-only-label-free-read-only-full-392-field-identity-overlay-availability-audit",
		hypothesisAncestry: {
			compactCandidateExperimentId: COMPACT_CANDIDATE_EXPERIMENT_ID,
			factorialAuditExperimentId: FACTORIAL_ANCESTRY_EXPERIMENT_ID,
			requiredPassingInputs: true,
		},
		authorization: {
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			labelsJoined: false,
			changesPaletteOutput: false,
			extractionChangeAuthorized: false,
			selectorImplemented: false,
			selectorAuthorized: false,
			candidateMutationAuthorized: false,
			canonicalPromotionAuthorized: false,
			outcomeJoinAuthorized: false,
			broaderAuthorizationGranted: false,
		},
		independence: {
			forbiddenDirectInputs: ["review-manifest", "feedback", "review-analysis", "interpretation", "comment",
				"target-color", "preferred-file-list", "case-specific-label", "source-roots-10-through-14"],
			inputNameAndPathEnforcement: true,
			caseSpecificLabelsEmitted: false,
		},
		policy: {
			comparisonEpsilon: epsilon,
			fixedApcaFloor: null,
			candidateRerunsPerSource: 1,
			allPixelReconstruction: true,
			outputPreserving: true,
		},
		factors: {
			A: "selected same-role endpoint lineage equals at least one epsilon-maximizing canonical alias lineage; lineage is representativePixelIndex plus exact node-mask SHA256",
			F: "for at least one changed field role, selected and an epsilon-maximizing same-role canonical alias have the same exact existing source-family union-mask SHA256",
			P: "against at least one maximizing alias pair, selected endpoint masks, endpoint union, endpoint family masks, and family union are componentwise population-nonregressing",
			I: "against at least one maximizing alias pair, both anti-frame supports and raw non-fitted surfaceRoleOwnership, spatialFieldOwnership, and interiorSurfaceSupport are componentwise nonregressing",
			R: "candidate all-source-pixel nearest-four-role OKLab reconstruction error is no greater than canonical",
			C: "all four finite signed consumer APCA edges preserve polarity and do not regress in magnitude",
		},
		prospectiveFrozenWinnerArm: {
			predeclaredInImplementation: true,
			definition: prospectiveArmDefinition,
			completeAndUnsampled: true,
			diagnosticOverlayAvailabilityUsedAsGate: false,
		},
		stoppingRules: {
			totalSourcesMustEqual: 392,
			developmentSourcesMustEqual: 37,
			cohort00SourcesMustEqual: 355,
			structuralViolationsMustEqual: 0,
			exactFrozenCandidatePaletteAndCertificateReproduction: true,
			exactSourceHashesAndReadOnlyProcessing: true,
			exactAliasRelationSupportRecomposition: true,
			factorAccountingMustReconcile: true,
			frontierMustEqualProspectiveArm: true,
			canonicalFallbacksMustBeByteIdentical: true,
			zeroFrontierIsValid: true,
			oneThrough40PermitsOnlyLaterOutcomeJoinAndPossiblySeparateConstrainedSelectorExperiment: true,
			moreThan40Stops: true,
			noAuthorizationGranted: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		auditCandidateVersion: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		policy: { comparisonEpsilon: epsilon, fixedApcaFloor: null, factorOrder: factorNames },
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) =>
			[name, { path: input.path, sha256: input.sha256 }])),
		sources: compactManifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const frontier = {
		schemaVersion: 1,
		experimentId,
		definition: prospectiveArmDefinition,
		structuralStoppingRulesPass: structuralPass,
		complete: true,
		sampling: null,
		entries: frontierEntries,
	}
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: structuralPass,
			violationCount: violationCases.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violationCases.length,
			checks: structuralChecks,
			entries: violationCases.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		matrix: {
			total: results.length,
			development: results.filter((result) => result.cohort === "development").length,
			cohort00: results.filter((result) => result.cohort === "00").length,
			changed: changed.length,
			canonicalFallback: fallbacks.length,
		},
		factorial: { factorCounts, routeCounts, nestedArmCounts, conjunctiveCounts },
		prospectiveArm: {
			definition: prospectiveArmDefinition,
			count: frontierEntries.length,
			files: frontierEntries.map((entry) => entry.file),
			complete: true,
			sampled: false,
			sizeBand,
		},
		composition: {
			changed: {
				cohorts: {
					development: changed.filter((result) => result.cohort === "development").length,
					"00": changed.filter((result) => result.cohort === "00").length,
				},
				states: stateComposition(changed),
			},
			frontier: {
				cohorts: {
					development: expectedProspective.filter((result) => result.cohort === "development").length,
					"00": expectedProspective.filter((result) => result.cohort === "00").length,
				},
				states: stateComposition(expectedProspective),
			},
		},
		outcome: {
			sizeBand,
			zeroIsValid: frontierEntries.length === 0,
			permitsLaterOutcomeJoin: structuralPass && frontierEntries.length >= 1 && frontierEntries.length <= 40,
			mayMotivateSeparateConstrainedSelectorExperiment: structuralPass && frontierEntries.length >= 1 &&
				frontierEntries.length <= 40,
			stoppedForMoreThan40: frontierEntries.length > 40,
			authorizedByThisAudit: false,
			selectorImplemented: false,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: !structuralPass ? "structural-failure-empty-frontier" : sizeBand === "0"
			? "structural-pass-empty-frontier-stop" : sizeBand === ">40"
				? "structural-pass-more-than-40-stop" : "structural-pass-1-through-40-later-outcome-join-permitted-not-authorized",
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote field identity overlay availability audit ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
