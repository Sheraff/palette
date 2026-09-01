import { apcaContrast, contrastRatio, okDistance, rgbToHex, roleMinimumDistance } from "./color.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext } from "./extract.ts"
import {
	buildJointPaletteEvidence,
	evaluateJointPaletteOverlayContrast,
	jointPaletteFieldStateEvidence,
	JOINT_PALETTE_EVIDENCE_VERSION,
	type JointPaletteEvidence,
	type JointPaletteFieldState,
	type JointPaletteFieldTreatment,
	type JointPaletteOverlayAlternative,
} from "./joint-palette-evidence.ts"
import type { NextPaletteJointObjectiveVector } from "./next-palette-joint-pareto.ts"
import type { PaletteRelationNode } from "./palette-relation-graph.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor } from "./types.ts"

export const JOINT_PALETTE_FIELD_TRADEOFF_VERSION = "joint-palette-field-tradeoff-0.1.0-development"

export const JOINT_PALETTE_FIELD_TRADEOFF_POLICY = Object.freeze({
	version: "joint-palette-field-tradeoff-policy-0.1.0-development",
	incumbentAlgorithmVersion: ALGORITHM_VERSION,
	evidenceVersion: JOINT_PALETTE_EVIDENCE_VERSION,
	developmentDiagnosticOnly: true,
	maximumDistinctRoleColors: 4,
	generatedChallengersAllowed: false,
	introducedForegroundAccentCollapseAllowed: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
	selection: "complete-field-changing-pareto-frontier-then-normalized-lexicographic-minimax-regret",
})

export type JointPaletteFieldTradeoffEntry = {
	stableKey: string
	fieldState: JointPaletteFieldState
	roles: { background: RGB; foreground: RGB; surface: RGB; accent: RGB }
	objectives: NextPaletteJointObjectiveVector
	objectiveDeltas: NextPaletteJointObjectiveVector
	regret: readonly number[]
	changedBlocks: { field: true; foreground: boolean; accent: boolean }
	changedSemanticAtoms: number
}

export type JointPaletteFieldTradeoffCertificate = {
	schemaVersion: 1
	version: typeof JOINT_PALETTE_FIELD_TRADEOFF_VERSION
	policy: typeof JOINT_PALETTE_FIELD_TRADEOFF_POLICY
	incumbent: {
		evidenceAvailable: boolean
		unavailableReasons: readonly string[]
		objectives: NextPaletteJointObjectiveVector
		fieldState: JointPaletteFieldState
	}
	counts: {
		fieldTreatments: number
		overlayAlternatives: number
		attemptedCompleteTuples: number
		fieldImprovingCompleteTuples: number
		canonicalNondominatedCompleteTuples: number
		paretoCompleteTuples: number
	}
	selected: JointPaletteFieldTradeoffEntry | null
	frontier: readonly JointPaletteFieldTradeoffEntry[]
	invariants: {
		diagnosticOnly: true
		fieldBlockMustChange: true
		fieldEvidenceMustImprove: true
		canonicalDominatedAlternativesExcluded: true
		sourceExactChallengersOnly: true
		finiteSignedApca: true
		fixedApcaFloorAbsent: true
	}
}

export type JointPaletteFieldTradeoffResult = {
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteFieldTradeoffCertificate
}

type Candidate = {
	background: PaletteRelationNode
	foreground: JointPaletteOverlayAlternative
	surface: PaletteRelationNode
	accent: JointPaletteOverlayAlternative
	treatment: JointPaletteFieldTreatment
	objectives: NextPaletteJointObjectiveVector
	stableKey: string
	semanticKey: string
	changedSemanticAtoms: number
	foregroundContrast: ReturnType<typeof evaluateJointPaletteOverlayContrast>
	accentContrast: ReturnType<typeof evaluateJointPaletteOverlayContrast>
}

const epsilon = JOINT_PALETTE_FIELD_TRADEOFF_POLICY.comparisonEpsilon

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function sameRgb(first: RGB, second: RGB): boolean {
	return rgbKey(first) === rgbKey(second)
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function dominates(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function pareto<T>(values: readonly T[], vector: (value: T) => readonly number[], key: (value: T) => string): T[] {
	const frontier: T[] = []
	for (const candidate of [...values].sort((first, second) => compareAscii(key(first), key(second)))) {
		if (frontier.some((existing) => dominates(vector(existing), vector(candidate)))) continue
		for (let index = frontier.length - 1; index >= 0; index--) {
			if (dominates(vector(candidate), vector(frontier[index]))) frontier.splice(index, 1)
		}
		frontier.push(candidate)
	}
	return frontier
}

function canonicalEvidence(canonical: Palette, evidence: JointPaletteEvidence): {
	available: boolean
	reasons: string[]
	objectives: NextPaletteJointObjectiveVector
	state: JointPaletteFieldState
} {
	const state = fieldState(canonical)
	const fieldNodes = evidence.graph.nodes.filter((node) => !node.typographyOnly)
	const backgrounds = canonical.background.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaces = canonical.surface.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const foregrounds = canonical.foreground.generated ? [] : evidence.overlays.filter((overlay) =>
		sameRgb(overlay.rgb, canonical.foreground.rgb))
	const accents = canonical.accent.generated ? [] : evidence.overlays.filter((overlay) =>
		sameRgb(overlay.rgb, canonical.accent.rgb))
	const reasons: string[] = []
	if (backgrounds.length === 0) reasons.push("canonical-background-evidence-unavailable")
	if (surfaces.length === 0) reasons.push("canonical-surface-evidence-unavailable")
	if (!canonical.foreground.generated && foregrounds.length === 0) reasons.push("canonical-foreground-evidence-unavailable")
	if (!canonical.accent.generated && accents.length === 0) reasons.push("canonical-accent-evidence-unavailable")
	const backgroundSupport = backgrounds.length === 0 ? 0 : Math.max(...backgrounds.map((node) => node.fieldEligibility.support))
	const relationSupport = backgrounds.length === 0 || surfaces.length === 0 ? 0 : Math.max(
		...backgrounds.flatMap((background) => surfaces.map((surface) =>
			jointPaletteFieldStateEvidence(evidence.graph, evidence.perception.analysis, background, surface, state).support)),
	)
	const foregroundSupport = canonical.foreground.generated ? 0 : foregrounds.length === 0 ? 0 :
		Math.max(...foregrounds.map((overlay) => overlay.evidence.foregroundSupport))
	const accentSupport = canonical.accent.generated ? 0 : accents.length === 0 ? 0 :
		Math.max(...accents.map((overlay) => overlay.evidence.accentIdentitySupport))
	const objectives: NextPaletteJointObjectiveVector = [
		backgroundSupport,
		relationSupport,
		foregroundSupport,
		Math.min(Math.abs(apcaContrast(canonical.foreground.rgb, canonical.background.rgb)),
			Math.abs(apcaContrast(canonical.foreground.rgb, canonical.surface.rgb))),
		accentSupport,
		Math.abs(apcaContrast(canonical.accent.rgb, canonical.background.rgb)),
	]
	return { available: reasons.length === 0, reasons, objectives, state }
}

function changes(candidate: Candidate, canonical: Palette): number {
	return Number(!sameRgb(candidate.background.rgb, canonical.background.rgb) || canonical.background.generated) +
		Number(!sameRgb(candidate.surface.rgb, canonical.surface.rgb) || canonical.surface.generated) +
		Number(candidate.treatment.state !== fieldState(canonical)) +
		Number(!sameRgb(candidate.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated) +
		Number(!sameRgb(candidate.accent.rgb, canonical.accent.rgb) || canonical.accent.generated)
}

function objectiveDeltas(candidate: NextPaletteJointObjectiveVector, incumbent: NextPaletteJointObjectiveVector): NextPaletteJointObjectiveVector {
	return candidate.map((value, index) => value - incumbent[index]) as unknown as NextPaletteJointObjectiveVector
}

function semanticKey(candidate: Candidate): string {
	return [rgbKey(candidate.background.rgb), rgbKey(candidate.foreground.rgb), rgbKey(candidate.surface.rgb),
		rgbKey(candidate.accent.rgb), candidate.treatment.state].join("|")
}

function regret(objectives: NextPaletteJointObjectiveVector, ideal: readonly number[]): number[] {
	return objectives.map((value, index) => (ideal[index] - value) / Math.max(ideal[index], epsilon))
		.sort((first, second) => second - first)
}

function compareRegret(first: readonly number[], second: readonly number[]): number {
	for (let index = 0; index < Math.max(first.length, second.length); index++) {
		if ((first[index] ?? 0) < (second[index] ?? 0) - epsilon) return -1
		if ((first[index] ?? 0) > (second[index] ?? 0) + epsilon) return 1
	}
	return 0
}

function roleColor(rgb: RGB, canonical: RoleColor): RoleColor {
	return sameRgb(rgb, canonical.rgb) && !canonical.generated
		? canonical
		: { rgb, hex: rgbToHex(rgb), generated: false, sourceDistance: 0 }
}

function gradient(candidate: Candidate, canonical: Palette): GradientEvidence {
	const relation = candidate.treatment.fieldRelation
	if (!relation) return { isGradient: false, confidence: candidate.treatment.stateSupport, coverage: 0, continuity: 0, coherence: 0 }
	return {
		isGradient: candidate.treatment.state === "gradient",
		confidence: candidate.treatment.stateSupport,
		coverage: relation.endpoint.absolutePairCoverage,
		continuity: relation.distribution.continuity,
		coherence: relation.topology.monotoneConnectivity,
	}
}

function metrics(candidate: Candidate, evidence: JointPaletteEvidence): PaletteMetrics {
	const labs = [candidate.background.lab, candidate.foreground.lab, candidate.surface.lab, candidate.accent.lab]
	const fields = new Set(evidence.graph.fieldNodeIds)
	const nodes = evidence.graph.nodes.filter((node) => fields.has(node.id))
	const population = nodes.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = nodes.reduce((sum, node) =>
		sum + node.population * Math.min(...labs.map((lab) => okDistance(node.lab, lab))), 0) /
		Math.max(population, epsilon)
	return {
		foregroundContrast: contrastRatio(candidate.foreground.rgb, candidate.background.rgb),
		foregroundSurfaceContrast: contrastRatio(candidate.foreground.rgb, candidate.surface.rgb),
		accentContrast: contrastRatio(candidate.accent.rgb, candidate.background.rgb),
		accentSurfaceContrast: contrastRatio(candidate.accent.rgb, candidate.surface.rgb),
		minimumRoleDistance: roleMinimumDistance(labs),
		meanSourceDistance: 0,
		meanReconstructionError: reconstruction,
	}
}

function toPalette(candidate: Candidate, canonical: Palette, evidence: JointPaletteEvidence): Palette {
	return {
		background: roleColor(candidate.background.rgb, canonical.background),
		foreground: roleColor(candidate.foreground.rgb, canonical.foreground),
		surface: roleColor(candidate.surface.rgb, canonical.surface),
		accent: roleColor(candidate.accent.rgb, canonical.accent),
		gradient: gradient(candidate, canonical),
		score: canonical.score,
		metrics: metrics(candidate, evidence),
	}
}

export function buildJointPaletteFieldTradeoff(image: RawImage): JointPaletteFieldTradeoffResult {
	const canonicalContext = extractPaletteWithContext(image)
	const canonical = canonicalContext.extraction.methods.spatial
	const evidence = buildJointPaletteEvidence(image)
	const incumbent = canonicalEvidence(canonical, evidence)
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	let attemptedCompleteTuples = 0
	let fieldImprovingCompleteTuples = 0
	let canonicalNondominatedCompleteTuples = 0
	let completeFrontier: Candidate[] = []
	if (incumbent.available) {
		for (const treatment of evidence.fieldTreatments) {
			const background = nodeById.get(treatment.backgroundNodeId)!
			const surface = nodeById.get(treatment.surfaceNodeId)!
			if (incumbent.state === "collapsed" && treatment.state === "collapsed") continue
			const fieldChanged = !sameRgb(background.rgb, canonical.background.rgb) ||
				!sameRgb(surface.rgb, canonical.surface.rgb) || treatment.state !== incumbent.state
			if (!fieldChanged || treatment.stateSupport <= epsilon) continue
			const fieldObjectives = [background.fieldEligibility.support, treatment.stateSupport]
			if (fieldObjectives[0] <= incumbent.objectives[0] + epsilon &&
				fieldObjectives[1] <= incumbent.objectives[1] + epsilon) continue
			const foregrounds = pareto(evidence.overlays.flatMap((overlay) => {
				if (sameRgb(overlay.rgb, background.rgb) || sameRgb(overlay.rgb, surface.rgb)) return []
				const contrast = evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb)
				return [{ overlay, contrast, worst: Math.min(contrast.background.magnitude, contrast.surface.magnitude) }]
			}), (value) => [value.overlay.evidence.foregroundSupport, value.worst], (value) => value.overlay.stableKey)
			for (const foreground of foregrounds) {
				const accents = pareto(evidence.overlays.flatMap((overlay) => {
					if (sameRgb(overlay.rgb, background.rgb) || sameRgb(overlay.rgb, surface.rgb) ||
						sameRgb(overlay.rgb, foreground.overlay.rgb) && !sameRgb(canonical.foreground.rgb, canonical.accent.rgb)) return []
					return [{ overlay, contrast: evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb) }]
				}), (value) => [value.overlay.evidence.accentIdentitySupport, value.contrast.background.magnitude],
					(value) => value.overlay.stableKey)
				for (const accent of accents) {
					attemptedCompleteTuples++
					if (new Set([background.rgb, foreground.overlay.rgb, surface.rgb, accent.overlay.rgb].map(rgbKey)).size > 4) continue
					const objectives: NextPaletteJointObjectiveVector = [
						background.fieldEligibility.support,
						treatment.stateSupport,
						foreground.overlay.evidence.foregroundSupport,
						foreground.worst,
						accent.overlay.evidence.accentIdentitySupport,
						accent.contrast.background.magnitude,
					]
					fieldImprovingCompleteTuples++
					if (dominates(incumbent.objectives, objectives)) continue
					canonicalNondominatedCompleteTuples++
					const candidate: Candidate = {
						background,
						foreground: foreground.overlay,
						surface,
						accent: accent.overlay,
						treatment,
						objectives,
						stableKey: [treatment.stableKey, foreground.overlay.stableKey, accent.overlay.stableKey].join("|"),
						semanticKey: "",
						changedSemanticAtoms: 0,
						foregroundContrast: foreground.contrast,
						accentContrast: accent.contrast,
					}
					candidate.semanticKey = semanticKey(candidate)
					candidate.changedSemanticAtoms = changes(candidate, canonical)
					if (completeFrontier.some((existing) => dominates(existing.objectives, candidate.objectives))) continue
					completeFrontier = completeFrontier.filter((existing) => !dominates(candidate.objectives, existing.objectives))
					completeFrontier.push(candidate)
				}
			}
		}
	}
	const ideal = incumbent.objectives.map((value, index) =>
		Math.max(value, ...completeFrontier.map((candidate) => candidate.objectives[index])))
	const ordered = completeFrontier.map((candidate) => ({ candidate, regret: regret(candidate.objectives, ideal) }))
		.sort((first, second) => compareRegret(first.regret, second.regret) ||
			first.candidate.changedSemanticAtoms - second.candidate.changedSemanticAtoms ||
			compareAscii(first.candidate.semanticKey, second.candidate.semanticKey) ||
			compareAscii(first.candidate.stableKey, second.candidate.stableKey))
	const entries = ordered.map(({ candidate, regret }): JointPaletteFieldTradeoffEntry => ({
		stableKey: candidate.stableKey,
		fieldState: candidate.treatment.state,
		roles: {
			background: candidate.background.rgb,
			foreground: candidate.foreground.rgb,
			surface: candidate.surface.rgb,
			accent: candidate.accent.rgb,
		},
		objectives: candidate.objectives,
		objectiveDeltas: objectiveDeltas(candidate.objectives, incumbent.objectives),
		regret,
		changedBlocks: {
			field: true,
			foreground: !sameRgb(candidate.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated,
			accent: !sameRgb(candidate.accent.rgb, canonical.accent.rgb) || canonical.accent.generated,
		},
		changedSemanticAtoms: candidate.changedSemanticAtoms,
	}))
	const selected = ordered[0]?.candidate ?? null
	return {
		canonical,
		candidate: selected ? toPalette(selected, canonical, evidence) : null,
		certificate: {
			schemaVersion: 1,
			version: JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
			policy: JOINT_PALETTE_FIELD_TRADEOFF_POLICY,
			incumbent: {
				evidenceAvailable: incumbent.available,
				unavailableReasons: incumbent.reasons,
				objectives: incumbent.objectives,
				fieldState: incumbent.state,
			},
			counts: {
				fieldTreatments: evidence.fieldTreatments.length,
				overlayAlternatives: evidence.overlays.length,
				attemptedCompleteTuples,
				fieldImprovingCompleteTuples,
				canonicalNondominatedCompleteTuples,
				paretoCompleteTuples: completeFrontier.length,
			},
			selected: entries[0] ?? null,
			frontier: entries,
			invariants: {
				diagnosticOnly: true,
				fieldBlockMustChange: true,
				fieldEvidenceMustImprove: true,
				canonicalDominatedAlternativesExcluded: true,
				sourceExactChallengersOnly: true,
				finiteSignedApca: true,
				fixedApcaFloorAbsent: true,
			},
		},
	}
}
