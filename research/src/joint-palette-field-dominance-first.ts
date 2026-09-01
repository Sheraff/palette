import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { apcaContrast, contrastRatio, okDistance, rgbToHex, roleMinimumDistance } from "./color.ts"
import {
	evaluateJointPaletteOverlayContrast,
	type JointPaletteEvidence,
	type JointPaletteFieldState,
	type JointPaletteFieldTreatment,
	type JointPaletteOverlayAlternative,
} from "./joint-palette-evidence.ts"
import {
	extractNextPaletteJointParetoWithContext,
	type NextPaletteJointAblationName,
	type NextPaletteJointObjectiveVector,
} from "./next-palette-joint-pareto.ts"
import type { PaletteRelationNode } from "./palette-relation-graph.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION = "joint-palette-field-dominance-first-0.1.0-development"

export const JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY = Object.freeze({
	version: "joint-palette-field-dominance-first-policy-0.1.0-development",
	incumbentAlgorithmVersion: "region-graph-0.19.0",
	developmentDiagnosticOnly: true,
	requiredFieldBlockChange: true,
	maximumDistinctRoleColors: 4,
	generatedChallengersAllowed: false,
	introducedForegroundAccentCollapseAllowed: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
	selection: "strict-canonical-dominance-with-required-field-change-then-minimum-semantic-blocks-then-within-class-pareto-then-atoms-then-stable-identity",
})

type RoleProvenance = {
	stableKey: string
	rgb: RGB
	representativePixelIndex: number
	supportMaskSha256: string
	kind: "field-candidate" | JointPaletteOverlayAlternative["provenance"]["kind"]
}

export type FieldDominanceCandidate = {
	stableKey: string
	semanticKey: string
	fieldChanged: boolean
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: NextPaletteJointObjectiveVector
}

export type FieldDominanceSelection<T extends FieldDominanceCandidate> = {
	admitted: T[]
	minimumBlockFrontier: T[]
	selected: T | null
}

export type JointPaletteFieldDominanceSummary = {
	route: "strict-dominator" | "no-strict-dominator" | "constraint-conflicts-with-required-field-change"
	changed: boolean
	admitted: boolean
	stableKey: string
	fieldState: JointPaletteFieldState
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: NextPaletteJointObjectiveVector
	objectiveDeltas: NextPaletteJointObjectiveVector
}

export type JointPaletteFieldDominanceFrontierEntry = JointPaletteFieldDominanceSummary & {
	changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
	roles: Record<RoleName, RGB>
}

export type JointPaletteFieldDominanceCertificate = {
	schemaVersion: 1
	version: typeof JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION
	policy: typeof JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY
	incumbent: {
		evidenceAvailable: boolean
		unavailableReasons: readonly string[]
		fieldState: JointPaletteFieldState
		objectives: NextPaletteJointObjectiveVector
		stableKey: string
	}
	route: JointPaletteFieldDominanceSummary["route"]
	counts: {
		fieldNodes: number
		fieldTreatments: number
		overlayAlternatives: number
		logicalCompleteTuples: number
		fieldTreatmentsMeetingIncumbent: number
		foregroundPairCandidates: number
		accentConditionalFrontierMembers: number
		attemptedCompleteTuples: number
		admittedCompleteTuples: number
		paretoCompleteTuples: number
		minimumBlockCompleteTuples: number
		admittedByChangedBlocks: Record<string, number>
		admittedByChangedAtoms: Record<string, number>
	}
	domain: { admittedSha256: string }
	selected: JointPaletteFieldDominanceSummary & {
		roles: Record<RoleName, RoleProvenance> | null
		apcaLc: {
			foregroundOnBackground: number
			foregroundOnSurface: number
			accentOnBackground: number
			accentOnSurface: number
		} | null
		fieldTreatment: JointPaletteFieldTreatment | null
	}
	minimumBlockFrontier: readonly JointPaletteFieldDominanceFrontierEntry[]
	completeTupleFrontier: readonly JointPaletteFieldDominanceFrontierEntry[]
	ablations: Record<NextPaletteJointAblationName, JointPaletteFieldDominanceSummary>
	invariants: {
		diagnosticOnly: true
		requiredFieldBlockChange: true
		strictCanonicalDominance: true
		minimumBlocksBeforeCandidatePareto: true
		roleParetoWithinSemanticChangeClass: true
		sourceExactChallengersOnly: true
		maximumFourColors: true
		foregroundFieldCollapseAbsent: true
		accentFieldCollapseAbsent: true
		finiteSignedApca: true
		fixedApcaFloorAbsent: true
		noPostselectionMutation: true
	}
}

export type JointPaletteFieldDominanceResult = {
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteFieldDominanceCertificate
}

type Selection = FieldDominanceCandidate & {
	background: PaletteRelationNode
	foreground: JointPaletteOverlayAlternative
	surface: PaletteRelationNode
	accent: JointPaletteOverlayAlternative
	fieldTreatment: JointPaletteFieldTreatment
	fieldState: JointPaletteFieldState
	apcaLc: NonNullable<JointPaletteFieldDominanceCertificate["selected"]["apcaLc"]>
}

type Constraints = {
	canonicalBackground?: true
	canonicalSurface?: true
	canonicalFieldState?: true
	canonicalFieldBlock?: true
	canonicalForeground?: true
	canonicalAccent?: true
	canonicalOverlayBlock?: true
	withoutConnectedFamilyLocal?: true
}

type SelectionRun = {
	route: JointPaletteFieldDominanceSummary["route"]
	selection: Selection | null
	admitted: Selection[]
	preferred: Selection[]
	completeFrontier: Selection[]
	counts: Pick<JointPaletteFieldDominanceCertificate["counts"],
		"fieldTreatmentsMeetingIncumbent" | "foregroundPairCandidates" | "accentConditionalFrontierMembers" |
		"attemptedCompleteTuples" | "admittedCompleteTuples" | "paretoCompleteTuples" |
		"minimumBlockCompleteTuples" | "admittedByChangedBlocks" | "admittedByChangedAtoms">
}

const epsilon = JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY.comparisonEpsilon
const roleNames = ["background", "foreground", "surface", "accent"] as const

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function sameRgb(first: RGB, second: RGB): boolean {
	return rgbKey(first) === rgbKey(second)
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function dominates(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function objectiveDeltas(
	objectives: NextPaletteJointObjectiveVector,
	incumbent: NextPaletteJointObjectiveVector,
): NextPaletteJointObjectiveVector {
	return objectives.map((value, index) => value - incumbent[index]) as unknown as NextPaletteJointObjectiveVector
}

export function selectFieldDominanceFirst<T extends FieldDominanceCandidate>(
	candidates: readonly T[],
	incumbent: NextPaletteJointObjectiveVector,
): FieldDominanceSelection<T> {
	const admitted = candidates.filter((candidate) => candidate.fieldChanged && dominates(candidate.objectives, incumbent))
		.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const minimumBlocks = admitted.length === 0 ? Infinity : Math.min(...admitted.map((entry) => entry.changedSemanticBlocks))
	const minimumClass = admitted.filter((entry) => entry.changedSemanticBlocks === minimumBlocks)
	const minimumBlockFrontier = minimumClass.filter((candidate) => !minimumClass.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
		.sort((first, second) => first.changedSemanticAtoms - second.changedSemanticAtoms ||
			compareAscii(first.semanticKey, second.semanticKey) || compareAscii(first.stableKey, second.stableKey))
	return { admitted, minimumBlockFrontier, selected: minimumBlockFrontier[0] ?? null }
}

function paretoWithinChangeClass<T>(
	values: readonly T[],
	changed: (value: T) => boolean,
	vector: (value: T) => readonly number[],
): T[] {
	return values.filter((candidate) => !values.some((other) =>
		other !== candidate && changed(other) === changed(candidate) && dominates(vector(other), vector(candidate))))
}

function globalPareto(values: readonly Selection[]): Selection[] {
	return values.filter((candidate) => !values.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
		.sort((first, second) => first.changedSemanticBlocks - second.changedSemanticBlocks ||
			first.changedSemanticAtoms - second.changedSemanticAtoms || compareAscii(first.semanticKey, second.semanticKey) ||
			compareAscii(first.stableKey, second.stableKey))
}

function semanticKey(background: RGB, foreground: RGB, surface: RGB, accent: RGB, state: JointPaletteFieldState): string {
	return [rgbKey(background), rgbKey(foreground), rgbKey(surface), rgbKey(accent), state].join("|")
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function changedBlocks(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): JointPaletteFieldDominanceFrontierEntry["changedBlocks"] {
	return {
		field: !sameRgb(selection.background.rgb, canonical.background.rgb) || canonical.background.generated ||
			!sameRgb(selection.surface.rgb, canonical.surface.rgb) || canonical.surface.generated ||
			selection.fieldState !== fieldState(canonical),
		foreground: !sameRgb(selection.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated,
		accent: !sameRgb(selection.accent.rgb, canonical.accent.rgb) || canonical.accent.generated,
	}
}

function semanticBlocks(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): number {
	const blocks = changedBlocks(selection, canonical)
	return Number(blocks.field) + Number(blocks.foreground) + Number(blocks.accent)
}

function semanticAtoms(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): number {
	return Number(!sameRgb(selection.background.rgb, canonical.background.rgb) || canonical.background.generated) +
		Number(!sameRgb(selection.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated) +
		Number(!sameRgb(selection.surface.rgb, canonical.surface.rgb) || canonical.surface.generated) +
		Number(!sameRgb(selection.accent.rgb, canonical.accent.rgb) || canonical.accent.generated) +
		Number(selection.fieldState !== fieldState(canonical))
}

function countBy(values: readonly number[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[String(value)] = (counts[String(value)] ?? 0) + 1
	return counts
}

function emptyRun(route: SelectionRun["route"]): SelectionRun {
	return {
		route,
		selection: null,
		admitted: [],
		preferred: [],
		completeFrontier: [],
		counts: {
			fieldTreatmentsMeetingIncumbent: 0,
			foregroundPairCandidates: 0,
			accentConditionalFrontierMembers: 0,
			attemptedCompleteTuples: 0,
			admittedCompleteTuples: 0,
			paretoCompleteTuples: 0,
			minimumBlockCompleteTuples: 0,
			admittedByChangedBlocks: {},
			admittedByChangedAtoms: {},
		},
	}
}

function select(
	canonical: Palette,
	evidence: JointPaletteEvidence,
	incumbent: JointPaletteFieldDominanceCertificate["incumbent"],
	constraints: Constraints = {},
): SelectionRun {
	if (!incumbent.evidenceAvailable) return emptyRun("no-strict-dominator")
	if (constraints.canonicalFieldBlock) return emptyRun("constraint-conflicts-with-required-field-change")
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	const incumbentState = fieldState(canonical)
	const fieldCandidates = evidence.fieldTreatments.filter((treatment) => {
		const background = nodeById.get(treatment.backgroundNodeId)!
		const surface = nodeById.get(treatment.surfaceNodeId)!
		if (constraints.canonicalBackground && !sameRgb(background.rgb, canonical.background.rgb)) return false
		if (constraints.canonicalSurface && !sameRgb(surface.rgb, canonical.surface.rgb)) return false
		if (constraints.canonicalFieldState && treatment.state !== incumbentState) return false
		const fieldChanged = !sameRgb(background.rgb, canonical.background.rgb) ||
			!sameRgb(surface.rgb, canonical.surface.rgb) || treatment.state !== incumbentState
		return fieldChanged && background.fieldEligibility.support + epsilon >= incumbent.objectives[0] &&
			treatment.stateSupport + epsilon >= incumbent.objectives[1] && treatment.stateSupport > epsilon
	})
	const overlays = evidence.overlays.filter((overlay) =>
		!constraints.withoutConnectedFamilyLocal || overlay.provenance.kind !== "connected-family-local")
	let foregroundPairCandidates = 0
	let accentConditionalFrontierMembers = 0
	let attemptedCompleteTuples = 0
	const candidates: Selection[] = []
	for (const treatment of fieldCandidates) {
		const background = nodeById.get(treatment.backgroundNodeId)!
		const surface = nodeById.get(treatment.surfaceNodeId)!
		const foregroundEvaluated = overlays.flatMap((overlay) => {
			if (sameRgb(overlay.rgb, background.rgb) || sameRgb(overlay.rgb, surface.rgb)) return []
			if ((constraints.canonicalForeground || constraints.canonicalOverlayBlock) &&
				!sameRgb(overlay.rgb, canonical.foreground.rgb)) return []
			const contrast = evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb)
			const worst = Math.min(contrast.background.magnitude, contrast.surface.magnitude)
			if (overlay.evidence.foregroundSupport + epsilon < incumbent.objectives[2] ||
				worst + epsilon < incumbent.objectives[3]) return []
			return [{ overlay, contrast, worst }]
		})
		const foregrounds = paretoWithinChangeClass(foregroundEvaluated,
			(value) => !sameRgb(value.overlay.rgb, canonical.foreground.rgb) || canonical.foreground.generated,
			(value) => [value.overlay.evidence.foregroundSupport, value.worst])
		foregroundPairCandidates += foregrounds.length
		const accentEvaluated = overlays.flatMap((overlay) => {
			if (sameRgb(overlay.rgb, background.rgb) || sameRgb(overlay.rgb, surface.rgb)) return []
			if ((constraints.canonicalAccent || constraints.canonicalOverlayBlock) &&
				!sameRgb(overlay.rgb, canonical.accent.rgb)) return []
			const contrast = evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb)
			if (overlay.evidence.accentIdentitySupport + epsilon < incumbent.objectives[4] ||
				contrast.background.magnitude + epsilon < incumbent.objectives[5]) return []
			return [{ overlay, contrast }]
		})
		for (const foreground of foregrounds) {
			const accents = paretoWithinChangeClass(accentEvaluated.filter((accent) =>
				!sameRgb(foreground.overlay.rgb, accent.overlay.rgb) || sameRgb(canonical.foreground.rgb, canonical.accent.rgb)),
				(value) => !sameRgb(value.overlay.rgb, canonical.accent.rgb) || canonical.accent.generated,
				(value) => [value.overlay.evidence.accentIdentitySupport, value.contrast.background.magnitude])
			accentConditionalFrontierMembers += accents.length
			for (const accent of accents) {
				attemptedCompleteTuples++
				if (new Set([background.rgb, foreground.overlay.rgb, surface.rgb, accent.overlay.rgb].map(rgbKey)).size >
					JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY.maximumDistinctRoleColors) continue
				const objectives: NextPaletteJointObjectiveVector = [
					background.fieldEligibility.support,
					treatment.stateSupport,
					foreground.overlay.evidence.foregroundSupport,
					foreground.worst,
					accent.overlay.evidence.accentIdentitySupport,
					accent.contrast.background.magnitude,
				]
				const candidate: Selection = {
					background,
					foreground: foreground.overlay,
					surface,
					accent: accent.overlay,
					fieldTreatment: treatment,
					fieldState: treatment.state,
					objectives,
					stableKey: [treatment.stableKey, foreground.overlay.stableKey, accent.overlay.stableKey].join("|"),
					semanticKey: semanticKey(background.rgb, foreground.overlay.rgb, surface.rgb, accent.overlay.rgb, treatment.state),
					fieldChanged: true,
					changedSemanticBlocks: 0,
					changedSemanticAtoms: 0,
					apcaLc: {
						foregroundOnBackground: foreground.contrast.background.signedLc,
						foregroundOnSurface: foreground.contrast.surface.signedLc,
						accentOnBackground: accent.contrast.background.signedLc,
						accentOnSurface: accent.contrast.surface.signedLc,
					},
				}
				candidate.changedSemanticBlocks = semanticBlocks(candidate, canonical)
				candidate.changedSemanticAtoms = semanticAtoms(candidate, canonical)
				candidates.push(candidate)
			}
		}
	}
	const chosen = selectFieldDominanceFirst(candidates, incumbent.objectives)
	const completeFrontier = globalPareto(chosen.admitted)
	return {
		route: chosen.selected ? "strict-dominator" : "no-strict-dominator",
		selection: chosen.selected,
		admitted: chosen.admitted,
		preferred: chosen.minimumBlockFrontier,
		completeFrontier,
		counts: {
			fieldTreatmentsMeetingIncumbent: fieldCandidates.length,
			foregroundPairCandidates,
			accentConditionalFrontierMembers,
			attemptedCompleteTuples,
			admittedCompleteTuples: chosen.admitted.length,
			paretoCompleteTuples: completeFrontier.length,
			minimumBlockCompleteTuples: chosen.minimumBlockFrontier.length,
			admittedByChangedBlocks: countBy(chosen.admitted.map((entry) => entry.changedSemanticBlocks)),
			admittedByChangedAtoms: countBy(chosen.admitted.map((entry) => entry.changedSemanticAtoms)),
		},
	}
}

function roleProvenance(node: PaletteRelationNode): RoleProvenance {
	return {
		stableKey: node.stableKey,
		rgb: node.rgb,
		representativePixelIndex: node.representativePixelIndex,
		supportMaskSha256: createHash("sha256").update(node.mask).digest("hex"),
		kind: "field-candidate",
	}
}

function overlayProvenance(alternative: JointPaletteOverlayAlternative): RoleProvenance {
	return {
		stableKey: alternative.stableKey,
		rgb: alternative.rgb,
		representativePixelIndex: alternative.provenance.representativePixelIndex,
		supportMaskSha256: alternative.provenance.supportMaskSha256,
		kind: alternative.provenance.kind,
	}
}

function summary(
	run: SelectionRun,
	incumbent: JointPaletteFieldDominanceCertificate["incumbent"],
): JointPaletteFieldDominanceSummary {
	const selection = run.selection
	return selection ? {
		route: run.route,
		changed: true,
		admitted: true,
		stableKey: selection.stableKey,
		fieldState: selection.fieldState,
		changedSemanticBlocks: selection.changedSemanticBlocks,
		changedSemanticAtoms: selection.changedSemanticAtoms,
		objectives: selection.objectives,
		objectiveDeltas: objectiveDeltas(selection.objectives, incumbent.objectives),
	} : {
		route: run.route,
		changed: false,
		admitted: false,
		stableKey: incumbent.stableKey,
		fieldState: incumbent.fieldState,
		changedSemanticBlocks: 0,
		changedSemanticAtoms: 0,
		objectives: incumbent.objectives,
		objectiveDeltas: [0, 0, 0, 0, 0, 0],
	}
}

function frontierEntry(
	selection: Selection,
	canonical: Palette,
	incumbent: JointPaletteFieldDominanceCertificate["incumbent"],
): JointPaletteFieldDominanceFrontierEntry {
	return {
		route: "strict-dominator",
		changed: true,
		admitted: true,
		stableKey: selection.stableKey,
		fieldState: selection.fieldState,
		changedSemanticBlocks: selection.changedSemanticBlocks,
		changedSemanticAtoms: selection.changedSemanticAtoms,
		objectives: selection.objectives,
		objectiveDeltas: objectiveDeltas(selection.objectives, incumbent.objectives),
		changedBlocks: changedBlocks(selection, canonical),
		roles: {
			background: selection.background.rgb,
			foreground: selection.foreground.rgb,
			surface: selection.surface.rgb,
			accent: selection.accent.rgb,
		},
	}
}

function roleColor(rgb: RGB, canonical: RoleColor): RoleColor {
	return sameRgb(rgb, canonical.rgb) && !canonical.generated
		? canonical
		: { rgb, hex: rgbToHex(rgb), generated: false, sourceDistance: 0 }
}

function metrics(selection: Selection, evidence: JointPaletteEvidence): PaletteMetrics {
	const labs = [selection.background.lab, selection.foreground.lab, selection.surface.lab, selection.accent.lab]
	const fieldIds = new Set(evidence.graph.fieldNodeIds)
	const nodes = evidence.graph.nodes.filter((node) => fieldIds.has(node.id))
	const population = nodes.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = nodes.reduce((sum, node) =>
		sum + node.population * Math.min(...labs.map((lab) => okDistance(node.lab, lab))), 0) / Math.max(population, epsilon)
	return {
		foregroundContrast: contrastRatio(selection.foreground.rgb, selection.background.rgb),
		foregroundSurfaceContrast: contrastRatio(selection.foreground.rgb, selection.surface.rgb),
		accentContrast: contrastRatio(selection.accent.rgb, selection.background.rgb),
		accentSurfaceContrast: contrastRatio(selection.accent.rgb, selection.surface.rgb),
		minimumRoleDistance: roleMinimumDistance(labs),
		meanSourceDistance: 0,
		meanReconstructionError: reconstruction,
	}
}

function gradientEvidence(selection: Selection): GradientEvidence {
	const relation = selection.fieldTreatment.fieldRelation
	if (!relation) return {
		isGradient: false,
		confidence: selection.fieldTreatment.stateSupport,
		coverage: 0,
		continuity: 0,
		coherence: 0,
	}
	return {
		isGradient: selection.fieldState === "gradient",
		confidence: selection.fieldTreatment.stateSupport,
		coverage: relation.endpoint.absolutePairCoverage,
		continuity: relation.distribution.continuity,
		coherence: relation.topology.monotoneConnectivity,
	}
}

function toPalette(selection: Selection, canonical: Palette, evidence: JointPaletteEvidence): Palette {
	return {
		background: roleColor(selection.background.rgb, canonical.background),
		foreground: roleColor(selection.foreground.rgb, canonical.foreground),
		surface: roleColor(selection.surface.rgb, canonical.surface),
		accent: roleColor(selection.accent.rgb, canonical.accent),
		gradient: gradientEvidence(selection),
		score: canonical.score,
		metrics: metrics(selection, evidence),
	}
}

export function buildJointPaletteFieldDominanceFirst(image: RawImage): JointPaletteFieldDominanceResult {
	const broad = extractNextPaletteJointParetoWithContext(image)
	const canonical = broad.canonicalExtraction.methods.spatial
	const evidence = broad.evidence
	const incumbent: JointPaletteFieldDominanceCertificate["incumbent"] = broad.certificate.incumbent
	const main = select(canonical, evidence, incumbent)
	const selection = main.selection
	const candidate = selection ? toPalette(selection, canonical, evidence) : null
	if (!selection && candidate !== null) throw new Error("Field dominance fallback is not null")
	if (selection && isDeepStrictEqual(candidate, canonical)) throw new Error("Field dominance selection did not change canonical")
	const ablationConstraints: Record<NextPaletteJointAblationName, Constraints> = {
		"canonical-background": { canonicalBackground: true },
		"canonical-surface": { canonicalSurface: true },
		"canonical-field-state": { canonicalFieldState: true },
		"canonical-field-block": { canonicalFieldBlock: true },
		"canonical-foreground": { canonicalForeground: true },
		"canonical-accent": { canonicalAccent: true },
		"canonical-overlay-block": { canonicalOverlayBlock: true },
		"without-connected-family-local": { withoutConnectedFamilyLocal: true },
	}
	const ablations = Object.fromEntries(Object.entries(ablationConstraints).map(([name, constraints]) =>
		[name, summary(select(canonical, evidence, incumbent, constraints), incumbent)])) as
		Record<NextPaletteJointAblationName, JointPaletteFieldDominanceSummary>
	const selectedSummary = summary(main, incumbent)
	const selectedRoles = selection ? {
		background: roleProvenance(selection.background),
		foreground: overlayProvenance(selection.foreground),
		surface: roleProvenance(selection.surface),
		accent: overlayProvenance(selection.accent),
	} : null
	const domainBytes = JSON.stringify(main.admitted.map((entry) => ({
		stableKey: entry.stableKey,
		semanticKey: entry.semanticKey,
		changedSemanticBlocks: entry.changedSemanticBlocks,
		changedSemanticAtoms: entry.changedSemanticAtoms,
		objectives: entry.objectives,
	})))
	const certificate: JointPaletteFieldDominanceCertificate = {
		schemaVersion: 1,
		version: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
		policy: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY,
		incumbent,
		route: main.route,
		counts: {
			fieldNodes: evidence.counts.fieldNodes,
			fieldTreatments: evidence.fieldTreatments.length,
			overlayAlternatives: evidence.counts.overlayAlternatives,
			logicalCompleteTuples: evidence.fieldTreatments.length * evidence.overlays.length ** 2,
			...main.counts,
		},
		domain: { admittedSha256: createHash("sha256").update(domainBytes).digest("hex") },
		selected: {
			...selectedSummary,
			roles: selectedRoles,
			apcaLc: selection?.apcaLc ?? null,
			fieldTreatment: selection?.fieldTreatment ?? null,
		},
		minimumBlockFrontier: main.preferred.map((entry) => frontierEntry(entry, canonical, incumbent)),
		completeTupleFrontier: main.completeFrontier.map((entry) => frontierEntry(entry, canonical, incumbent)),
		ablations,
		invariants: {
			diagnosticOnly: true,
			requiredFieldBlockChange: true,
			strictCanonicalDominance: true,
			minimumBlocksBeforeCandidatePareto: true,
			roleParetoWithinSemanticChangeClass: true,
			sourceExactChallengersOnly: true,
			maximumFourColors: true,
			foregroundFieldCollapseAbsent: true,
			accentFieldCollapseAbsent: true,
			finiteSignedApca: true,
			fixedApcaFloorAbsent: true,
			noPostselectionMutation: true,
		},
	}
	if (selection && Object.values(selection.apcaLc).some((value) => !Number.isFinite(value))) {
		throw new Error("Field dominance selected APCA is non-finite")
	}
	return deepFreeze({ canonical, candidate, certificate })
}
